// garden/world/lobby.js
// Welten der Virtual Farm: Slot-Vergabe, Anwesenheit, Positionen — pro Welt getrennt.
//
// Es gibt eine öffentliche Welt, der man ohne Code beitritt, und beliebig viele private
// Welten mit fünfstelligem Code. Jede Welt hat ihre eigenen 8 Grundstücke, ihre eigene
// Anwesenheitsliste und ihren eigenen socket.io-Raum.
//
// Aufteilung der Autorität (bewusst, nicht aus Faulheit):
//   * Positionen/Anwesenheit  → Server verteilt, aber jeder Client bewegt sich selbst.
//     Ein Cheater kann höchstens seinen eigenen Avatar teleportieren, das schadet niemandem.
//   * Farm-Inhalte           → weiterhin client-autoritativ per REST-PUT (bestehendes Modell).
//     Der Server verteilt nur Momentaufnahmen an die anderen, damit fremde Äcker sichtbar sind.
//   * Briefkasten            → vollständig serverseitig, siehe garden/world/mail.js.
//
// Die Positionen laufen über einen gesammelten Server-Tick statt eines Echos pro Bewegung:
// bei 8 Spielern × 60 Hz wären das bis zu 3.360 Nachrichten/s, so sind es 15.

const { wetterListe } = require("../core/weather");

const MAX_SLOTS = 8;
const TICK_MS = 66;              // ~15 Hz Positionsverteilung
const STALE_AFTER_MS = 45000;    // Karteileichen aufräumen
const MAX_PLANTS_PER_SNAPSHOT = 320;
// Muss zu VITRINE_MAX in garden/core/economy.js passen.
const VITRINE_SNAPSHOT_MAX = 12;

const PUBLIC_CODE = "OEFFENTLICH";
const CODE_LENGTH = 5;
// Ohne 0/O und 1/I/L — die verwechselt man beim Vorlesen.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_WORLDS = 200;
const CREATE_WINDOW_MS = 60 * 1000;
const CREATE_MAX_PER_WINDOW = 5;

// Weltchat. Der Text kommt von einem fremden Browser, deshalb gilt hier dasselbe
// wie beim Hand-Item: kürzen, prüfen, drosseln. Gerendert wird er im Client als
// Text (kein HTML), eine Auszeichnung kann also nicht ausbrechen.
const CHAT_MAX_LEN = 200;
const CHAT_WINDOW_MS = 10 * 1000;
const CHAT_MAX_PER_WINDOW = 8;

/** code -> { code, isPublic, players: Map, slotOwners: Array, dirty: bool, createdAt } */
const worlds = new Map();
/** twitchId -> code — damit notifyPlotChanged/notifyMail die Welt findet */
const playerWorld = new Map();
/** twitchId -> Zeitstempel[] für die Erstellungs-Drosselung */
const createLog = new Map();
/** twitchId -> Zeitstempel[] für die Chat-Drosselung */
const chatLog = new Map();

let ioRef = null;
let tickTimer = null;
let farmStatesRef = null;
/** Wann die Drosselungs-Protokolle zuletzt ausgemistet wurden (siehe startTick). */
let letzterLogPutz = 0;
const LOG_PUTZ_MS = 10 * 60 * 1000;

function roomName(code) {
    return `garden:world:${code}`;
}

function createWorld(code, isPublic = false) {
    const world = {
        code,
        isPublic,
        players: new Map(),
        slotOwners: new Array(MAX_SLOTS).fill(null),
        dirty: false,
        createdAt: Date.now(),
    };
    worlds.set(code, world);
    return world;
}

const MAX_PUBLIC_WORLDS = 25;

function publicCodeFor(index) {
    return index === 0 ? PUBLIC_CODE : `${PUBLIC_CODE}-${index + 1}`;
}

/**
 * Öffentliche Welten skalieren mit: Ist die erste voll, kommt der nächste Spieler
 * automatisch in eine zweite. Vorher gab es genau EINE öffentliche Welt — der
 * 9. Spieler wurde abgewiesen und hing als Zuschauer fest.
 * Reihenfolge ist stabil (immer die niedrigste freie), damit Leute, die gleichzeitig
 * klicken, möglichst zusammen landen statt sich zu verteilen.
 */
function getPublicWorld() {
    for (let i = 0; i < MAX_PUBLIC_WORLDS; i++) {
        const code = publicCodeFor(i);
        const world = worlds.get(code) || createWorld(code, true);
        if (world.slotOwners.some((id) => id === null)) return world;
    }
    return null; // alle öffentlichen Welten voll
}

/**
 * Ist das ein öffentlicher Weltcode? Die sind fest vergeben (OEFFENTLICH,
 * OEFFENTLICH-2 …), also lassen sie sich jederzeit neu anlegen — anders als
 * private Codes, die nur existieren, solange jemand drin ist.
 *
 * Das ist wichtig nach einem Serverneustart: alle Welten sind dann weg. Ohne
 * diese Ausnahme bekam jeder, der in seine gemerkte öffentliche Welt zurück
 * wollte, "Diesen Weltcode gibt es nicht" — und wurde auf die erste freie
 * verteilt. Zwei Leute, die zusammen gespielt haben, landeten so getrennt.
 */
function publicWorldFor(code) {
    for (let i = 0; i < MAX_PUBLIC_WORLDS; i++) {
        if (publicCodeFor(i) === code) return worlds.get(code) || createWorld(code, true);
    }
    return null;
}

function normalizeCode(raw) {
    // Bindestrich MUSS erhalten bleiben: die nachgezogenen oeffentlichen Welten
    // heissen OEFFENTLICH-2, -3 … Ohne ihn wurde daraus OEFFENTLICH2, und der
    // Rueckweg in die eigene oeffentliche Welt endete mit "Code gibt es nicht".
    // Private Codes bestehen nur aus CODE_ALPHABET und enthalten nie einen Strich.
    return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function generateCode() {
    for (let versuch = 0; versuch < 50; versuch++) {
        let code = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        }
        if (!worlds.has(code)) return code;
    }
    return null;
}

function checkCreateLimit(twitchId) {
    const now = Date.now();
    const list = (createLog.get(twitchId) || []).filter((t) => now - t < CREATE_WINDOW_MS);
    if (list.length >= CREATE_MAX_PER_WINDOW) {
        createLog.set(twitchId, list);
        return false;
    }
    list.push(now);
    createLog.set(twitchId, list);
    return true;
}

function checkChatLimit(twitchId) {
    const now = Date.now();
    const list = (chatLog.get(twitchId) || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (list.length >= CHAT_MAX_PER_WINDOW) {
        chatLog.set(twitchId, list);
        return false;
    }
    list.push(now);
    chatLog.set(twitchId, list);
    return true;
}

// Ueber new RegExp gebaut: als Literal muessten die Steuerzeichen roh in der Datei
// stehen, und die ueberlebt nicht jedes Werkzeug unbeschadet.
const STEUERZEICHEN = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/**
 * Chatzeile aus einem fremden Browser. Steuerzeichen fliegen raus (sie koennten
 * die Anzeige zerreissen), Zeilenumbrueche werden zu Leerzeichen — eine Nachricht
 * ist eine Zeile, sonst schiebt eine einzige Sendung die halbe Liste zu.
 */
function sanitizeChat(raw) {
    if (typeof raw !== "string") return "";
    const sauber = raw.replace(STEUERZEICHEN, " ").replace(/\s+/g, " ").trim();
    return sauber.slice(0, CHAT_MAX_LEN);
}

function claimSlot(world, twitchId) {
    const existing = world.slotOwners.findIndex((id) => id === twitchId);
    if (existing !== -1) return existing;
    const free = world.slotOwners.findIndex((id) => id === null);
    if (free === -1) return -1;
    world.slotOwners[free] = twitchId;
    return free;
}

function releaseSlot(world, twitchId) {
    const idx = world.slotOwners.findIndex((id) => id === twitchId);
    if (idx !== -1) world.slotOwners[idx] = null;
    return idx;
}

/**
 * Leere Welten verschwinden wieder. Ausnahme: die erste öffentliche bleibt immer
 * bestehen, damit „Öffentliche Welt betreten" nie ins Leere greift. Zusätzlich
 * angelegte öffentliche Welten (OEFFENTLICH-2, -3 …) werden wieder abgeräumt.
 */
function disposeIfEmpty(world) {
    if (!world) return;
    if (world.code === PUBLIC_CODE) return;
    if (world.players.size === 0) worlds.delete(world.code);
}

/** Nur das, was der Renderer für einen fremden Acker braucht — nicht der ganze Farm-State. */
function compactPlantForSnapshot(plant) {
    if (!plant || !plant.seedId) return null;
    const out = {
        seedId: plant.seedId,
        name: plant.name,
        rarity: plant.rarity,
        singleUse: plant.singleUse !== false,
        stage: plant.stage,
        plantedAt: plant.plantedAt,
        specialType: plant.specialType || null,
        statusEffect: plant.statusEffect || null,
        statusEffects: wetterListe(plant),
    };
    if (out.singleUse) {
        out.growthMs = plant.growthMs;
        out.norm = plant.norm;
    } else {
        out.structureGrowthMs = plant.structureGrowthMs;
        out.structureReadyAt = plant.structureReadyAt;
        out.fruitCycleMs = plant.fruitCycleMs;
        out.maxFruits = plant.maxFruits;
        out.fruitSlots = Array.isArray(plant.fruitSlots)
            ? plant.fruitSlots.map((s) => ({
                readyAt: s?.readyAt || 0,
                norm: Number.isFinite(s?.norm) ? s.norm : 0.5,
                specialType: s?.specialType || null,
                statusEffect: s?.statusEffect || null,
                statusEffects: wetterListe(s),
            }))
            : [];
    }
    return out;
}

/** Momentaufnahme eines Grundstücks aus dem gespeicherten Farm-State. */
function buildPlotSnapshot(twitchId) {
    if (!farmStatesRef) return null;
    const state = farmStatesRef.get(String(twitchId));
    if (!state) return null;
    const code = playerWorld.get(String(twitchId));
    const world = code ? worlds.get(code) : null;
    const player = world?.players.get(String(twitchId));
    if (!player || player.slotIndex < 0) return null;

    const plants = {};
    let count = 0;
    for (const [key, plant] of Object.entries(state.plotPlants || {})) {
        if (count >= MAX_PLANTS_PER_SNAPSHOT) break;
        const compact = compactPlantForSnapshot(plant);
        if (!compact) continue;
        plants[key] = compact;
        count++;
    }

    return {
        slotIndex: player.slotIndex,
        owner: state.twitchLogin || player.twitchLogin || null,
        plants,
        plotUnlockedCells: Array.isArray(state.plotUnlockedCells) ? state.plotUnlockedCells : [],
        decoPlacements: Array.isArray(state.decoPlacements) ? state.decoPlacements.slice(0, 120) : [],
        petPlacements: Array.isArray(state.petPlacements) ? state.petPlacements.slice(0, 24) : [],
        hasMail: Array.isArray(state.mailbox) && state.mailbox.length > 0,
        // Die Vitrine ist zum Angucken da — also muss sie mit in die Momentaufnahme:
        // Standort, damit sie bei den anderen gezeichnet und anklickbar wird, und der
        // Inhalt, damit das Fenster ohne weitere Anfrage aufgeht.
        vitrine: buildVitrineSnapshot(state),
        // Inkubator und Mülleimer hat jeder, die Kiste erst nach dem Kauf. Ohne dieses
        // Ja/Nein stünde bei den Nachbarn eine Kiste, die es gar nicht gibt. Der INHALT
        // bleibt bewusst draußen — die Kiste ist privat, nur die Vitrine ist zum Zeigen.
        hasChest: state?.toolInventory?.hasChest === true,
        gebaeudeVersatz: state.gebaeudeVersatz || null,
    };
}

/** Sichtbarer Teil der Vitrine — nur Schaustücke, keine Verkaufswerte. */
function buildVitrineSnapshot(state) {
    const hatVitrine = state?.toolInventory?.hasVitrine === true;
    if (!hatVitrine) return null;
    const stuecke = Array.isArray(state.vitrineItems) ? state.vitrineItems : [];
    return {
        items: stuecke.slice(0, VITRINE_SNAPSHOT_MAX).map((i) => ({
            seedId: i?.seedId,
            name: i?.name,
            rarity: i?.rarity,
            singleUse: i?.singleUse !== false,
            size: Number(i?.size) || 1,
            specialData: i?.specialData || undefined,
            statusEffect: i?.statusEffect || null,
            statusEffects: wetterListe(i),
        })),
    };
}

function publicPlayer(p) {
    return {
        twitchId: p.twitchId,
        name: p.twitchLogin,
        slotIndex: p.slotIndex,
        x: p.x,
        y: p.y,
        facingRight: p.facingRight,
        isMoving: p.isMoving,
        appearance: p.appearance,
        badge: p.badge,
        held: p.held || null,
        // Für die Bestenliste am Goldstand. Kommt aus dem SERVER-Stand, nicht vom
        // Client — Gold gehört seit v3.0 ohnehin dem Server. Eine Zahl mehr pro
        // Spieler und Tick fällt neben Position und Aussehen nicht ins Gewicht.
        gold: Math.max(0, Number(farmStatesRef?.get(String(p.twitchId))?.gold) || 0),
    };
}

/**
 * Was ein Spieler in der Hand hält, wird an alle in der Welt weitergereicht.
 * Der Inhalt kommt vom Client, deshalb bleibt hier NUR das übrig, was gezeichnet
 * wird — Bildpfade müssen zudem aus dem eigenen Asset-Ordner stammen, sonst
 * könnte jemand die Mitspieler beliebige URLs laden lassen.
 */
function sanitizeHeld(raw) {
    if (!raw || typeof raw !== "object") return null;
    const pfad = (v) => (typeof v === "string" && v.startsWith("/garden-assets/") && v.length < 200 ? v : null);
    const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
    const zahl = (v, min, max) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : null);
    const special = text(raw.specialType || raw.specialData?.name, 12);
    const held = {
        name: text(raw.name, 40),
        emoji: text(raw.emoji, 8),
        image: pfad(raw.image),
        harvestImage: pfad(raw.harvestImage),
        fruitImage: pfad(raw.fruitImage),
        growthImage: pfad(raw.growthImage),
        seedImage: pfad(raw.seedImage),
        rarity: text(raw.rarity, 16),
        size: zahl(raw.size, 1, 50),
        norm: zahl(raw.norm, 0, 1),
        statusEffect: ["wet", "frozen", "charged", "moonlit"].includes(raw.statusEffect) ? raw.statusEffect : null,
        specialType: special === "Golden" || special === "Rainbow" ? special : null,
        _type: ["seed", "plant", "deco", "pet", "egg", "tool"].includes(raw._type) ? raw._type : null,
    };
    // Ohne Bild und ohne Emoji gäbe es nichts zu zeichnen.
    const hatBild = held.image || held.harvestImage || held.fruitImage || held.growthImage || held.seedImage;
    return hatBild || held.emoji ? held : null;
}

function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
        if (!ioRef) return;
        const now = Date.now();
        for (const world of worlds.values()) {
            // Karteileichen (Verbindung weg, aber kein disconnect gesehen).
            //
            // ENTSCHEIDEND ist die Socket-Prüfung. `lastSeen` wird nur von
            // `garden:move` gesetzt, und das kommt aus der Renderschleife des
            // Browsers. Wechselt jemand den Tab, hält Chrome requestAnimationFrame
            // an — nach 45 Sekunden galt der Spieler als Leiche und flog aus der
            // Welt, obwohl seine Verbindung einwandfrei stand. Für die anderen
            // verschwand er, ohne gegangen zu sein; sein eigener Client merkte
            // nichts, bekam beim nächsten Beitritt ein anderes Grundstück und
            // seine Änderungen wurden nicht mehr verteilt (`playerWorld` war weg).
            // Wer noch verbunden ist, bleibt drin — egal wie lange er zusieht.
            for (const [id, p] of world.players) {
                if (now - p.lastSeen <= STALE_AFTER_MS) continue;
                if (p.socketId && ioRef.sockets.sockets.get(p.socketId)?.connected) {
                    p.lastSeen = now; // Verbindung steht — nur der Tab ruht
                    continue;
                }
                world.players.delete(id);
                playerWorld.delete(id);
                releaseSlot(world, id);
                ioRef.to(roomName(world.code)).emit("garden:player_left", { twitchId: id });
                world.dirty = true;
            }
            if (!world.dirty || world.players.size === 0) {
                disposeIfEmpty(world);
                continue;
            }
            world.dirty = false;
            ioRef.to(roomName(world.code)).emit("garden:tick", {
                players: [...world.players.values()].map(publicPlayer),
            });
        }

        // Drosselungs-Protokolle aufräumen. Gefiltert wurden bisher nur die
        // ZEITSTEMPEL, der Schlüssel blieb — nach einem Tag Betrieb stand dort ein
        // Eintrag für jeden, der je eine Nachricht geschrieben oder eine Welt
        // aufgemacht hat, für immer.
        if (now - letzterLogPutz >= LOG_PUTZ_MS) {
            letzterLogPutz = now;
            for (const [id, liste] of createLog) {
                if (liste.every((t) => now - t >= CREATE_WINDOW_MS)) createLog.delete(id);
            }
            for (const [id, liste] of chatLog) {
                if (liste.every((t) => now - t >= CHAT_WINDOW_MS)) chatLog.delete(id);
            }
        }
    }, TICK_MS);
    if (typeof tickTimer.unref === "function") tickTimer.unref();
}

/**
 * Von der REST-Route aufgerufen, wenn ein Spieler seinen Farm-State gespeichert hat.
 * Verteilt die neue Momentaufnahme an alle anderen in DERSELBEN Welt.
 */
function notifyPlotChanged(twitchId) {
    if (!ioRef) return;
    const code = playerWorld.get(String(twitchId));
    if (!code) return;
    const snapshot = buildPlotSnapshot(twitchId);
    if (!snapshot) return;
    ioRef.to(roomName(code)).emit("garden:plot_changed", snapshot);
}

/** Neue Post → dem Empfänger Bescheid geben, falls er gerade online ist. */
function notifyMail(twitchId, mail) {
    if (!ioRef) return;
    const code = playerWorld.get(String(twitchId));
    const world = code ? worlds.get(code) : null;
    const player = world?.players.get(String(twitchId));
    if (!player?.socketId) return;
    ioRef.to(player.socketId).emit("garden:mail", { mail });
}

function leaveCurrentWorld(socket, { silent = false } = {}) {
    const twitchId = socket.data?.gardenTwitchId;
    if (!twitchId) return;
    const code = playerWorld.get(twitchId);
    const world = code ? worlds.get(code) : null;
    if (world) {
        const player = world.players.get(twitchId);
        // Nur räumen, wenn dieser Socket auch der aktuelle ist (Doppel-Tab-Schutz)
        if (player && player.socketId !== socket.id) return;
        world.players.delete(twitchId);
        releaseSlot(world, twitchId);
        socket.leave(roomName(code));
        if (!silent && ioRef) ioRef.to(roomName(code)).emit("garden:player_left", { twitchId });
        disposeIfEmpty(world);
    }
    playerWorld.delete(twitchId);
    socket.data.gardenTwitchId = null;
}

function joinWorld(socket, session, world) {
    const twitchId = String(session.twitchId);
    const slotIndex = claimSlot(world, twitchId);
    if (slotIndex === -1) {
        socket.emit("garden:error", { error: "Diese Welt ist voll (8 Grundstücke)." });
        return false;
    }

    const existing = world.players.get(twitchId);

    // ── Doppelter Tab: den alten Socket aus der Welt nehmen ───────────────────
    // Beide Tabs teilen sich EINEN Eintrag in world.players. Der alte Socket blieb
    // im Raum, schrieb über `garden:move` weiter auf denselben Spieler und hielt
    // ihn über `lastSeen` künstlich am Leben — für alle anderen zuckte der Avatar
    // mit 15 Hz zwischen den beiden Standorten hin und her. Schloss danach der
    // NEUE Tab, räumte dessen disconnect den Slot ab, und der noch verbundene alte
    // Tab lief unsichtbar herum.
    if (existing?.socketId && existing.socketId !== socket.id) {
        const alt = ioRef?.sockets?.sockets?.get(existing.socketId);
        if (alt) {
            alt.leave(roomName(world.code));
            alt.data.gardenTwitchId = null;
            alt.emit("garden:error", { error: "Die Farm wurde in einem anderen Tab geöffnet." });
        }
    }
    const player = {
        twitchId,
        twitchLogin: session.twitchLogin || "Farmer",
        slotIndex,
        socketId: socket.id,
        x: existing?.x ?? 0,
        y: existing?.y ?? 0,
        facingRight: true,
        isMoving: false,
        appearance: existing?.appearance ?? null,
        badge: existing?.badge ?? null,
        held: existing?.held ?? null,
        lastSeen: Date.now(),
    };
    world.players.set(twitchId, player);
    playerWorld.set(twitchId, world.code);
    socket.data.gardenTwitchId = twitchId;
    socket.join(roomName(world.code));

    const plots = [];
    for (const id of world.players.keys()) {
        const snap = buildPlotSnapshot(id);
        if (snap) plots.push(snap);
    }
    socket.emit("garden:joined", {
        slotIndex,
        maxSlots: MAX_SLOTS,
        code: world.code,
        isPublic: world.isPublic,
        players: [...world.players.values()].map(publicPlayer),
        plots,
        // Stand des Serverzählers beim Betreten.
        //
        // WARUM: nach einem Verbindungsabriss lädt der Browser bewusst NICHT neu — er
        // würde sonst verlieren, was er während der Unterbrechung gepflanzt hat. Genau
        // dadurch überschrieb er aber jede Änderung, die der Server in der Zwischenzeit
        // selbst gemacht hat: eine Migration beim Neustart etwa war nach dem ersten
        // Speichern des alten Tabs wieder weg. Mit dieser Zahl merkt er es und holt
        // sich den Stand, statt ihn zu übertönen.
        stateVersion: Number(farmStatesRef?.get(twitchId)?.stateVersion) || 0,
    });
    socket.to(roomName(world.code)).emit("garden:player_joined", { player: publicPlayer(player) });

    const ownSnapshot = buildPlotSnapshot(twitchId);
    if (ownSnapshot) socket.to(roomName(world.code)).emit("garden:plot_changed", ownSnapshot);

    startTick();
    return true;
}

function registerGardenSocket(socket, io, getSessionFromSocket, farmStates) {
    ioRef = io;
    farmStatesRef = farmStates;

    const requireSession = () => {
        const session = getSessionFromSocket(socket);
        if (!session?.twitchId) {
            socket.emit("garden:error", { error: "Nicht eingeloggt." });
            return null;
        }
        return session;
    };

    // { code } — ohne Code landet man in der öffentlichen Welt
    socket.on("garden:join", (data) => {
        const session = requireSession();
        if (!session) return;
        leaveCurrentWorld(socket);

        const raw = normalizeCode(data?.code);
        let world;
        if (!raw) {
            world = getPublicWorld();
            if (!world) {
                socket.emit("garden:error", { error: "Alle öffentlichen Welten sind voll. Mach eine private auf." });
                return;
            }
        } else {
            world = worlds.get(raw) || publicWorldFor(raw);
            if (!world) {
                socket.emit("garden:error", { error: "Diesen Weltcode gibt es nicht." });
                return;
            }
        }
        joinWorld(socket, session, world);
    });

    // Private Welt aufmachen und direkt betreten
    socket.on("garden:create", () => {
        const session = requireSession();
        if (!session) return;
        if (worlds.size >= MAX_WORLDS) {
            socket.emit("garden:error", { error: "Gerade laufen zu viele Welten. Versuch es später." });
            return;
        }
        if (!checkCreateLimit(String(session.twitchId))) {
            socket.emit("garden:error", { error: "Zu viele neue Welten. Warte einen Moment." });
            return;
        }
        const code = generateCode();
        if (!code) {
            socket.emit("garden:error", { error: "Es konnte kein freier Code vergeben werden." });
            return;
        }
        leaveCurrentWorld(socket);
        joinWorld(socket, session, createWorld(code, false));
    });

    socket.on("garden:move", (data) => {
        const twitchId = socket.data.gardenTwitchId;
        if (!twitchId) return;
        const code = playerWorld.get(twitchId);
        let world = code ? worlds.get(code) : null;
        let player = world?.players.get(twitchId);
        // Selbstheilung: Der Socket lebt, der Server kennt den Spieler aber nicht
        // mehr (z. B. weil er früher als Leiche aussortiert wurde). Statt jede
        // Bewegung still zu verwerfen — der Spieler lief dann für alle anderen
        // unsichtbar herum — wird er einfach wieder aufgenommen.
        if (!player) {
            const session = getSessionFromSocket(socket);
            if (!session?.twitchId) return;
            // `world` MUSS hier mitgezogen werden: unten wird darauf zugegriffen.
            world = (code && worlds.get(code)) || publicWorldFor(code) || getPublicWorld();
            if (!world || !joinWorld(socket, session, world)) return;
            player = world.players.get(String(session.twitchId));
            if (!player) return;
        }
        const x = Number(data?.x);
        const y = Number(data?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        player.x = x;
        player.y = y;
        player.facingRight = data?.facingRight !== false;
        player.isMoving = Boolean(data?.isMoving);
        player.lastSeen = Date.now();
        world.dirty = true;
    });

    // Was jemand in der Hand hält, ändert sich selten — deshalb ein eigenes
    // Ereignis statt es an jeden Positions-Tick zu hängen.
    socket.on("garden:held", (data) => {
        const twitchId = socket.data.gardenTwitchId;
        if (!twitchId) return;
        const code = playerWorld.get(twitchId);
        const world = code ? worlds.get(code) : null;
        const player = world?.players.get(twitchId);
        if (!player) return;
        player.held = sanitizeHeld(data?.held);
        player.lastSeen = Date.now();
        ioRef?.to(roomName(code)).emit("garden:player_held", { twitchId, held: player.held });
    });

    socket.on("garden:appearance", (data) => {
        const twitchId = socket.data.gardenTwitchId;
        if (!twitchId) return;
        const code = playerWorld.get(twitchId);
        const world = code ? worlds.get(code) : null;
        const player = world?.players.get(twitchId);
        if (!player) return;
        const skin = typeof data?.skin === "string" ? data.skin : null;
        // Nur Pfade aus dem eigenen Asset-Ordner zulassen — sonst könnte ein Client
        // allen anderen eine beliebige externe URL ins Bild rendern.
        player.appearance = skin && skin.startsWith("/garden-assets/") ? { skin } : null;
        player.badge = data?.badge === "subscriber" || data?.badge === "beta" ? data.badge : null;
        world.dirty = true;
    });

    // Weltchat: geht an alle im selben Raum, also nur an die eigene Welt.
    // Der Absendername kommt aus dem SERVER-Eintrag des Spielers, nicht aus der
    // Nachricht — sonst könnte sich jeder als jemand anderes ausgeben.
    socket.on("garden:chat", (data) => {
        const twitchId = socket.data.gardenTwitchId;
        if (!twitchId) return;
        const code = playerWorld.get(twitchId);
        const world = code ? worlds.get(code) : null;
        const player = world?.players.get(twitchId);
        if (!player) return;
        const text = sanitizeChat(data?.text);
        if (!text) return;
        if (!checkChatLimit(twitchId)) {
            socket.emit("garden:error", { error: "Zu viele Nachrichten. Warte einen Moment." });
            return;
        }
        player.lastSeen = Date.now();
        ioRef?.to(roomName(code)).emit("garden:chat", {
            id: `${twitchId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            twitchId,
            from: player.twitchLogin,
            slotIndex: player.slotIndex,
            text,
            at: Date.now(),
        });
    });

    socket.on("garden:leave", () => leaveCurrentWorld(socket));
    socket.on("disconnect", () => leaveCurrentWorld(socket));
}

/** Steht dieser Spieler gerade in einer Welt? */
function istOnline(twitchId) {
    const code = playerWorld.get(String(twitchId));
    const world = code ? worlds.get(code) : null;
    return Boolean(world?.players.get(String(twitchId))?.socketId);
}

/**
 * Ein Admin hat den Spielstand von aussen geändert → den Browser des Spielers
 * nachladen lassen.
 *
 * WARUM NÖTIG: Rucksack, Tiere, Eier und Deko gehören dem Browser; er schickt sie
 * alle paar Sekunden komplett zum Server. Ohne dieses Signal wäre ein Eingriff
 * beim nächsten Speichern wieder überschrieben — es sähe aus, als hätte er nie
 * stattgefunden. Gold und Ernte allein bräuchten das nicht, aber ein Menü, das je
 * nach Feld anders wirkt, wäre nicht zu erklären.
 *
 * Gibt zurück, ob jemand erreicht wurde, damit die Route es melden kann.
 */
function notifyAdminUpdate(twitchId, info = "") {
    if (!ioRef) return false;
    const code = playerWorld.get(String(twitchId));
    const world = code ? worlds.get(code) : null;
    const player = world?.players.get(String(twitchId));
    if (!player?.socketId) return false;
    ioRef.to(player.socketId).emit("garden:admin_update", { info: String(info || "") });
    return true;
}

module.exports = {
    registerGardenSocket,
    notifyPlotChanged,
    notifyMail,
    notifyAdminUpdate,
    istOnline,
    MAX_SLOTS,
    PUBLIC_CODE,
};
