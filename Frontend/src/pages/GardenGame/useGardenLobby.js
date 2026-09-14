// useGardenLobby.js
// Verbindung zur dauerhaften 8-Plot-Welt.
//
// Wichtig für die Performance: Positionen fremder Spieler landen NICHT in React-State.
// Bei 8 Spielern × 15 Hz wären das 120 Re-Renders der 4000-Zeilen-Komponente pro Sekunde.
// Stattdessen schreibt der Socket in Refs, die die Game-Loop direkt liest; React erfährt
// nur von Dingen, die tatsächlich die Oberfläche ändern (eigener Slot, Post, Verbindung).
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const MOVE_SEND_MS = 66; // ~15 Hz, passend zum Server-Tick
/** So viele Chatzeilen bleiben im Fenster stehen; ältere fallen hinten raus. */
const CHAT_VERLAUF_MAX = 80;

const WELT_SPEICHER = "garden_letzte_welt";

/** Zuletzt betretene Welt merken — sonst landet man nach dem Neuladen irgendwo. */
export function merkeWelt(code) {
    try { localStorage.setItem(WELT_SPEICHER, String(code || "")); } catch { /* kein Speicher */ }
}

export function letzteWelt() {
    try { return localStorage.getItem(WELT_SPEICHER) || ""; } catch { return ""; }
}

export function vergissWelt() {
    try { localStorage.removeItem(WELT_SPEICHER); } catch { /* egal */ }
}

export default function useGardenLobby({ enabled, worldCode, createWorld, appearance, badge, onMail, onNotify, onAdminUpdate, onServerVersion, onSplatter, onKicked, onVeredelt, onWelt }) {
    const socketRef = useRef(null);
    /** twitchId -> { name, slotIndex, x, y, tx, ty, facingRight, isMoving, appearance, badge } */
    const remotePlayersRef = useRef(new Map());
    /** slotIndex -> Momentaufnahme des fremden Ackers */
    const plotsRef = useRef(new Map());
    const lastMoveSentRef = useRef(0);
    const myTwitchIdRef = useRef(null);
    /** Nur EIN Ausweichversuch pro Verbindung, sonst droht eine Endlosschleife. */
    const ausweichVersuchtRef = useRef(false);
    /** Kennung des zuletzt gemeldeten Hand-Items — verhindert Dauerfeuer. */
    const letztesHeldRef = useRef("");

    const [slotIndex, setSlotIndex] = useState(0);
    const [connected, setConnected] = useState(false);
    const [worldFull, setWorldFull] = useState(false);
    const [onlinePlayers, setOnlinePlayers] = useState([]);
    /** Code der Welt, in der man tatsächlich gelandet ist (vom Server bestätigt). */
    const [activeCode, setActiveCode] = useState(null);
    const [isPublicWorld, setIsPublicWorld] = useState(true);
    const [joinError, setJoinError] = useState(null);
    /** Weltchat. Kommt selten genug, um ohne Ref-Umweg direkt in den State zu gehen. */
    const [chatVerlauf, setChatVerlauf] = useState([]);

    const onMailRef = useRef(onMail);
    const onNotifyRef = useRef(onNotify);
    const onAdminUpdateRef = useRef(onAdminUpdate);
    const onServerVersionRef = useRef(onServerVersion);
    const onSplatterRef = useRef(onSplatter);
    const onKickedRef = useRef(onKicked);
    const onVeredeltRef = useRef(onVeredelt);
    const onWeltRef = useRef(onWelt);
    /**
     * Aussehen und Abzeichen als Ref.
     *
     * Gebraucht direkt im `connect`-Handler: dort steht kein React-State zur
     * Verfügung, der Effekt unten hängt aber an genau diesem State und läuft beim
     * erneuten Verbinden nicht zwingend noch einmal.
     */
    const appearanceRef = useRef(appearance);
    const badgeRef = useRef(badge);
    useEffect(() => { appearanceRef.current = appearance; }, [appearance]);
    useEffect(() => { badgeRef.current = badge; }, [badge]);
    useEffect(() => { onMailRef.current = onMail; }, [onMail]);
    useEffect(() => { onNotifyRef.current = onNotify; }, [onNotify]);
    useEffect(() => { onAdminUpdateRef.current = onAdminUpdate; }, [onAdminUpdate]);
    useEffect(() => { onServerVersionRef.current = onServerVersion; }, [onServerVersion]);
    useEffect(() => { onSplatterRef.current = onSplatter; }, [onSplatter]);
    useEffect(() => { onKickedRef.current = onKicked; }, [onKicked]);
    useEffect(() => { onVeredeltRef.current = onVeredelt; }, [onVeredelt]);
    useEffect(() => { onWeltRef.current = onWelt; }, [onWelt]);

    const syncOnlineList = useCallback(() => {
        const naechste = [...remotePlayersRef.current.values()].map((p) => ({
            twitchId: p.twitchId, name: p.name, slotIndex: p.slotIndex, gold: p.gold || 0,
            // Katze fürs Dropdown (Feedback 01.09.: "aktive Katze als Bild") und Level
            // daneben — beide kommen im selben Tick wie das Gold mit.
            skin: p.appearance?.skin || null, level: Number(p.level) || 1,
        }));
        // Nur bei echter Änderung neu setzen. Der Goldstand kommt jetzt im
        // 15-Hz-Tick mit; würde jede Meldung durchgereicht, rendert GameContainer
        // fünfzehnmal pro Sekunde neu — genau das, was hier überall vermieden wird.
        setOnlinePlayers((alt) => {
            if (alt.length === naechste.length) {
                let gleich = true;
                for (let i = 0; i < alt.length; i++) {
                    const a = alt[i]; const b = naechste[i];
                    if (a.twitchId !== b.twitchId || a.name !== b.name
                        || a.slotIndex !== b.slotIndex || a.gold !== b.gold
                        || a.skin !== b.skin || a.level !== b.level) { gleich = false; break; }
                }
                if (gleich) return alt;
            }
            return naechste;
        });
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;

        const socket = io("/", {
            path: "/socket.io",
            transports: ["websocket", "polling"],
            withCredentials: true,
        });
        socketRef.current = socket;

        const upsertPlayer = (raw) => {
            if (!raw?.twitchId) return;
            const id = String(raw.twitchId);
            if (id === myTwitchIdRef.current) return; // sich selbst nicht doppelt zeichnen
            const existing = remotePlayersRef.current.get(id);
            remotePlayersRef.current.set(id, {
                twitchId: id,
                name: raw.name || "Farmer",
                slotIndex: Number.isInteger(raw.slotIndex) ? raw.slotIndex : -1,
                // x/y ist die gezeichnete Position, tx/ty das Ziel vom Server —
                // die Game-Loop zieht x/y nach, sonst ruckeln fremde Spieler im 15-Hz-Takt.
                x: existing?.x ?? raw.x ?? 0,
                y: existing?.y ?? raw.y ?? 0,
                tx: raw.x ?? 0,
                ty: raw.y ?? 0,
                facingRight: raw.facingRight !== false,
                isMoving: Boolean(raw.isMoving),
                appearance: raw.appearance || null,
                badge: raw.badge || null,
                // Gold-Shop-Reskin des Namensschilds (core/reskins.js) — live vom
                // Server, wie badge/appearance auch.
                nameplate: raw.nameplate || null,
                // Das Positions-Update traegt kein `held` — sonst wuerde das, was
                // jemand in der Hand haelt, bei jeder Bewegung verschwinden.
                held: raw.held !== undefined ? raw.held : (existing?.held ?? null),
                gold: Number.isFinite(raw.gold) ? raw.gold : (existing?.gold ?? 0),
                level: Number.isFinite(raw.level) ? raw.level : (existing?.level ?? 1),
            });
        };

        socket.on("connect", () => {
            setConnected(true);
            setWorldFull(false);
            setJoinError(null);
            ausweichVersuchtRef.current = false;
            // createWorld = private Welt aufmachen; sonst mit (optionalem) Code beitreten.
            if (createWorld) socket.emit("garden:create");
            else socket.emit("garden:join", { code: worldCode || "" });
            // Aussehen SOFORT hinterher — der Server legt den Spielereintrag beim
            // Beitreten ohne Aussehen an (`existing?.appearance ?? null`), weil es den
            // vorherigen Eintrag nicht mehr gibt. Ohne diese Zeile blieb der Geist für
            // alle anderen der Standard-Farmer, bis der Spieler zufällig in der
            // Umkleide etwas umstellte: der Effekt unten hängt am React-State, und der
            // ändert sich beim erneuten Verbinden nicht.
            socket.emit("garden:appearance", {
                skin: appearanceRef.current?.skin || null,
                badge: badgeRef.current || null,
            });
        });

        socket.on("disconnect", () => {
            setConnected(false);
            remotePlayersRef.current.clear();
            plotsRef.current.clear();
            syncOnlineList();
        });

        socket.on("garden:joined", (data) => {
            setSlotIndex(Number.isInteger(data?.slotIndex) ? data.slotIndex : 0);
            // Der Chat gehört der Welt: beim Wechsel bleibt sonst das Gespräch der
            // vorigen Welt stehen, obwohl dort niemand mehr mithört.
            setChatVerlauf([]);
            setActiveCode(data?.code || null);
            // Welt merken, damit man nach einem Neuladen wieder dort landet und
            // nicht in einer beliebigen anderen oeffentlichen Welt.
            if (data?.code) merkeWelt(data.code);
            setIsPublicWorld(data?.isPublic !== false);
            setJoinError(null);
            // Der Server schickt uns selbst mit; anhand des eigenen Slots herausfiltern.
            const mine = (data?.players || []).find((p) => p.slotIndex === data.slotIndex);
            myTwitchIdRef.current = mine ? String(mine.twitchId) : null;
            remotePlayersRef.current.clear();
            for (const p of data?.players || []) upsertPlayer(p);
            plotsRef.current.clear();
            for (const plot of data?.plots || []) {
                if (Number.isInteger(plot?.slotIndex)) plotsRef.current.set(plot.slotIndex, plot);
            }
            syncOnlineList();
            // Hat der Server den Spielstand verändert, während wir weg waren?
            // Nach einem Verbindungsabriss lädt dieser Browser bewusst nicht neu —
            // ohne diese Meldung würde er eine Migration oder einen Admin-Eingriff
            // mit seinem eigenen, älteren Stand wieder überschreiben.
            if (typeof data?.stateVersion === "number") {
                onServerVersionRef.current?.(data.stateVersion);
            }
        });

        socket.on("garden:player_joined", ({ player }) => {
            upsertPlayer(player);
            syncOnlineList();
            if (player?.name) onNotifyRef.current?.(`${player.name} betritt die Welt.`);
        });

        socket.on("garden:player_left", ({ twitchId }) => {
            const id = String(twitchId);
            const gone = remotePlayersRef.current.get(id);
            remotePlayersRef.current.delete(id);
            if (gone && Number.isInteger(gone.slotIndex)) plotsRef.current.delete(gone.slotIndex);
            syncOnlineList();
        });

        socket.on("garden:tick", ({ players }) => {
            for (const p of players || []) upsertPlayer(p);
        });

        socket.on("garden:player_held", ({ twitchId, held }) => {
            const eintrag = remotePlayersRef.current.get(String(twitchId));
            if (eintrag) eintrag.held = held || null;
        });

        socket.on("garden:plot_changed", (plot) => {
            if (!Number.isInteger(plot?.slotIndex)) return;
            // Tiere laufen bei jedem Zuschauer lokal herum. Kaeme mit jedem
            // Speichern des Besitzers die gespeicherte Position zurueck, wuerden
            // sie sichtbar zurueckspringen — deshalb behaelt ein bereits bekanntes
            // Tier seine aktuelle Position. Neue Tiere und Abgaenge kommen an.
            const vorher = plotsRef.current.get(plot.slotIndex);
            if (vorher && Array.isArray(plot.petPlacements) && Array.isArray(vorher.petPlacements)) {
                const bekannt = new Map(vorher.petPlacements.filter(Boolean).map((p) => [p.id, p]));
                plot.petPlacements = plot.petPlacements.map((p) => {
                    const alt = p && bekannt.get(p.id);
                    if (!alt || !Number.isFinite(alt.x)) return p;
                    return { ...p, x: alt.x, y: alt.y, vx: alt.vx, vy: alt.vy, changeDirAt: alt.changeDirAt, facingRight: alt.facingRight };
                });
            }
            plotsRef.current.set(plot.slotIndex, plot);
        });

        socket.on("garden:mail", ({ mail }) => {
            onMailRef.current?.(mail);
        });

        // Ein Admin hat den Spielstand von aussen geändert. Rucksack, Tiere, Eier und
        // Deko gehören diesem Browser — ohne Nachladen würde sein nächstes Speichern
        // den Eingriff wieder überschreiben.
        socket.on("garden:admin_update", ({ info, art } = {}) => {
            onAdminUpdateRef.current?.(String(info || ""), String(art || "admin"));
        });

        // Shotgun: kommt an ALLE in der Welt, auch an den Getroffenen. Der Standort
        // stammt vom Server (er kennt die letzte gemeldete Position), nicht aus dem
        // nachgezogenen x/y hier — sonst läge die Wolke einen Tick daneben.
        socket.on("garden:splatter", ({ twitchId, name, x, y } = {}) => {
            onSplatterRef.current?.({ twitchId: String(twitchId || ""), name: name || "", x, y });
        });

        // Selbst getroffen worden: raus aus der Welt. Der Server hat den Platz schon
        // freigegeben, dieser Browser muss nur noch aufräumen.
        socket.on("garden:kicked", ({ grund } = {}) => {
            remotePlayersRef.current.clear();
            plotsRef.current.clear();
            syncOnlineList();
            onKickedRef.current?.(String(grund || ""));
        });

        // Party-Veredelung: der Server hat auf dem eigenen Acker etwas zu Rainbow
        // gemacht. `specialType` gehört ihm, der Acker dem Browser — deshalb kommen
        // nur die betroffenen Zellen, statt den ganzen Stand neu zu laden.
        socket.on("garden:veredelt", ({ zellen } = {}) => {
            if (zellen && typeof zellen === "object") onVeredeltRef.current?.(zellen);
        });

        // Wetter oder Party wurden von Hand gesetzt (Admin-Menü).
        socket.on("garden:welt", (welt) => {
            onWeltRef.current?.(welt || {});
        });

        socket.on("garden:chat", (nachricht) => {
            if (!nachricht?.text) return;
            setChatVerlauf((alt) => {
                const naechste = [...alt, nachricht];
                return naechste.length > CHAT_VERLAUF_MAX
                    ? naechste.slice(naechste.length - CHAT_VERLAUF_MAX)
                    : naechste;
            });
        });

        socket.on("garden:error", ({ error }) => {
            const text = String(error || "");
            // Die gemerkte Welt gibt es nicht mehr (Server neu gestartet, private
            // Welt abgeraeumt): einmalig in eine freie oeffentliche ausweichen,
            // statt den Spieler in der Lobby stehen zu lassen.
            if (text.includes("gibt es nicht") && !ausweichVersuchtRef.current) {
                ausweichVersuchtRef.current = true;
                vergissWelt();
                socket.emit("garden:join", { code: "" });
                return;
            }
            // NUR wenn wirklich kein Grundstück vergeben wurde, den Slot auf -1 setzen.
            // Mit dem Startwert 0 hielte ein abgewiesener Spieler Grundstück 0 für seines
            // und würde seine Farm über die fremde rendern. Umgekehrt darf ein beliebiger
            // anderer Fehler (z. B. "Nicht eingeloggt") NICHT das eigene Grundstück
            // wegnehmen — sonst kann man nach einem Aussetzer nicht mehr farmen.
            const ohneGrundstueck = text.includes("voll");
            if (ohneGrundstueck) {
                setWorldFull(true);
                setSlotIndex(-1);
                setActiveCode(null);
            }
            setJoinError(text || "Verbindungsfehler.");
            onNotifyRef.current?.(text || "Verbindungsfehler.", "error");
        });

        return () => {
            socket.emit("garden:leave");
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
            remotePlayersRef.current.clear();
            plotsRef.current.clear();
            // MUSS hier stehen: `removeAllListeners` nimmt den disconnect-Handler mit,
            // der das sonst erledigt hätte. Ohne diese Zeile blieb `connected` über
            // den ganzen Weltwechsel auf true — beim nächsten Verbinden war
            // `setConnected(true)` dann ein Nichts-Update, und JEDER Effekt, der an
            // `connected` hängt, lief nicht wieder an.
            setConnected(false);
        };
    }, [enabled, worldCode, createWorld, syncOnlineList]);

    // Der Goldstand der anderen kommt im Tick mit, aber die Liste für die
    // Bestenliste wird bewusst nur alle zwei Sekunden nachgezogen. syncOnlineList
    // verwirft dabei unveränderte Stände, es rendert also nur, wenn sich wirklich
    // etwas am Gold geändert hat.
    useEffect(() => {
        if (!enabled || !connected) return undefined;
        const t = setInterval(syncOnlineList, 2000);
        return () => clearInterval(t);
    }, [enabled, connected, syncOnlineList]);

    // Aussehen/Abzeichen nachreichen, sobald sie feststehen
    useEffect(() => {
        if (!connected || !socketRef.current) return;
        socketRef.current.emit("garden:appearance", { skin: appearance?.skin || null, badge: badge || null });
    }, [connected, appearance?.skin, badge]);

    /** Aus der Game-Loop aufgerufen; drosselt selbst auf den Server-Takt. */
    const sendMove = useCallback((x, y, facingRight, isMoving) => {
        const socket = socketRef.current;
        if (!socket?.connected) return;
        const now = performance.now();
        if (now - lastMoveSentRef.current < MOVE_SEND_MS) return;
        lastMoveSentRef.current = now;
        socket.emit("garden:move", { x, y, facingRight, isMoving });
    }, []);

    /**
     * AFK-Kick (v2, Punkt 8): dem Server melden, dass gerade wirklich gespielt
     * wird — der Server entscheidet anhand dieses Zeitstempels, siehe
     * istAktivGenug/AFK_KICK_GRENZE_MS in Backend/garden/world/lobby.js.
     *
     * Bewusst ROH auf Tastendruck/Klick statt an eine bestimmte Aktion gebunden
     * (Ernten, Kaufen, Chatten zählen also mit) und auf 20 s gedrosselt — es geht
     * nur darum, ob überhaupt noch jemand da ist, nicht um jede einzelne Eingabe.
     */
    const lastActivitySentRef = useRef(0);
    useEffect(() => {
        if (!connected) return undefined;
        const melden = () => {
            const socket = socketRef.current;
            if (!socket?.connected) return;
            const now = performance.now();
            if (now - lastActivitySentRef.current < 20000) return;
            lastActivitySentRef.current = now;
            socket.emit("garden:activity");
        };
        window.addEventListener("keydown", melden);
        window.addEventListener("pointerdown", melden);
        return () => {
            window.removeEventListener("keydown", melden);
            window.removeEventListener("pointerdown", melden);
        };
    }, [connected]);

    /** Was man in der Hand haelt, an die Welt melden. Nur bei echter Aenderung. */
    const sendHeld = useCallback((held) => {
        const socket = socketRef.current;
        if (!socket?.connected) return;
        const kennung = held
            ? [held.name, held.size, held.norm, held.specialType || held.specialData?.name,
                held.statusEffect, held.image, held.harvestImage].join("|")
            : "";
        if (kennung === letztesHeldRef.current) return;
        letztesHeldRef.current = kennung;
        socket.emit("garden:held", { held: held || null });
    }, []);

    /**
     * Auf einen Mitspieler schiessen. Ob das erlaubt ist, entscheidet AUSSCHLIESSLICH
     * der Server (garden:shotgun in Backend/garden/world/lobby.js) — hier wird nur
     * gemeldet, wen es treffen soll.
     */
    const sendShotgun = useCallback((targetId) => {
        const socket = socketRef.current;
        if (!socket?.connected || !targetId) return;
        socket.emit("garden:shotgun", { targetId: String(targetId) });
    }, []);

    /**
     * Chatzeile abschicken. Der Server prüft Länge und Takt und verteilt sie.
     * `color` ist optional (Feedback 01.09.: Farbwahl) — der Server prüft sie
     * gegen seine eigene feste Palette (CHAT_FARBEN, lobby.js) und verwirft alles,
     * was nicht drinsteht, statt dem Client zu vertrauen.
     */
    const sendChat = useCallback((text, color) => {
        const socket = socketRef.current;
        if (!socket?.connected) return false;
        const sauber = String(text || "").trim();
        if (!sauber) return false;
        socket.emit("garden:chat", { text: sauber, color: color || null });
        return true;
    }, []);

    return {
        slotIndex, connected, worldFull, onlinePlayers, remotePlayersRef, plotsRef, sendMove, sendHeld,
        activeCode, isPublicWorld, joinError, chatVerlauf, sendChat, sendShotgun,
    };
}
