// ui/fenster/AngelFenster.jsx
// Angeln am Dorfteich (06.11.): Köder wählen → Auswerfen → warten, bis es beißt → Ringe
// treffen → Fisch. Reiter: Angeln, Fischeimer (verkaufen), Fischbuch (was man schon gefangen
// hat und wann was beißt). Gewürfelt und bezahlt wird allein auf dem Server (Backend
// core/angeln.js) — hier wird angezeigt, gespielt und das Ergebnis gemeldet.
//
// 10.11.: Geangelt wird im ECHTEN Teich. Der Reiter „Angeln“ ist kein Fenster mehr, sondern
// eine schmale Leiste am unteren Rand; Angel, Schnur und Schwimmer zeichnet der Renderer in
// die Welt (engine/teichLeben.js, Szene über engineRef.current.angelSzene). Fischeimer und
// Fischbuch bleiben Fenster.
//
// 11.11. RHYTHMUS-RINGE (ersetzen den Drill „Balken halten“): Sobald es beißt, ziehen sich um
// den Schwimmer Ringe zusammen. Gedrückt wird in dem Moment, in dem der Ring den Schwimmer
// berührt. Gewöhnliche Fische brauchen einen Treffer mit der Leertaste (oder einem Klick),
// seltenere drei bis fünf schnell hintereinander, jeder mit eigener Taste (Leertaste oder
// ein Buchstabe rund um WASD — Q W E A S D F —, steht über dem Schwimmer; bis 11.11. waren
// es Pfeiltasten, dafür musste die Hand aus der Laufhaltung weg). Wie viele Ringe, wie schnell und wie groß das
// Zeitfenster ist, sagt der Server (RINGE in core/angeln.js); die Profi-Angel weitet es.
// Ausgeworfen wird mit dem Knopf in der Leiste, nicht mehr mit der Leertaste.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StandFenster, StandReiter, Regal, WarenKachel, KaufKnopf, NebenKnopfHolz } from "../laden/Marktstand";
import { FISCH_INFO, FISCH_IDS, KOEDER, bedingungText, beisstJetzt, fischBild, fischName, SAISON_NAME, WETTER_NAME } from "../fische";
import { formatGold } from "../gardenTokens";
import { versionedAsset } from "../../engine/assetVersion";
import { angelWurfZiel, teichlingStand } from "../../engine/teichLeben";
import { angelTon } from "../angelTon";

const HOLZ = "#3b2516";
const RAR_FARBE = { COMMON: "#9aa4ae", UNCOMMON: "#4caf50", RARE: "#3a82d8", EPIC: "#9a5ad8", LEGENDARY: "#e0a82a", MYTHIC: "#e8403a", kram: "#8a6a4a" };
const RAR_NAME = { COMMON: "Gewöhnlich", UNCOMMON: "Ungewöhnlich", RARE: "Selten", EPIC: "Episch", LEGENDARY: "Legendär", MYTHIC: "Mythisch", kram: "Irgendwas" };
const LAUFTASTEN = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const KOEDER_BILD = { wurm: "/garden-assets/icons/laden/wurm.png", teig: "/garden-assets/icons/laden/teig.png", leucht: "/garden-assets/icons/laden/leucht.png" };
/** Tasten der Ringe: Kennung in der Szene → Taste auf der Tastatur. */
const RING_TASTEN = { leer: " ", q: "q", w: "w", e: "e", a: "a", s: "s", d: "d", f: "f" };
const RING_KENNUNG = Object.fromEntries(Object.entries(RING_TASTEN).map(([k, v]) => [v, k]));
const BUCHSTABEN = ["q", "w", "e", "a", "s", "d", "f"];
const SZENE_LEER = { wurfAb: 0, bissUm: 0, ring: null, ergebnisse: [], anzahl: 0, blitz: null };

/** Kleiner Zufallsgenerator aus der Server-Zahl — Tastenfolge und Pausen je Fisch. */
function zufall(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * Der Fang: der Fisch kommt vom Schwimmer aus dem Wasser in die Bildmitte, darunter Name,
 * Länge, Wert. Bewegt wird per Bildschleife statt per CSS-Animation — die liefe bei
 * „weniger Bewegung“ im System nicht.
 */
function FangKarte({ ergebnis, von, onWeiter }) {
    const fischRef = useRef(null);
    const [da, setDa] = useState(false);
    useEffect(() => {
        const el = fischRef.current;
        if (!el) return undefined;
        const r = el.getBoundingClientRect();
        const dx = von ? von.x - (r.left + r.width / 2) : 0;
        const dy = von ? von.y - (r.top + r.height / 2) : 120;
        const start = performance.now();
        const DAUER = 620;
        let lauf = 0;
        const schritt = (t) => {
            const u = Math.min(1, (t - start) / DAUER);
            const e = 1 - Math.pow(1 - u, 3);
            // Bogen: erst steil aus dem Wasser, dann zur Mitte
            const hoch = Math.sin(u * Math.PI) * 70;
            el.style.transform = `translate(${Math.round(dx * (1 - e))}px, ${Math.round(dy * (1 - e) - hoch)}px) scale(${(0.2 + 0.8 * e).toFixed(3)}) rotate(${((1 - e) * -28).toFixed(1)}deg)`;
            el.style.opacity = String(Math.min(1, u * 4));
            if (u < 1) lauf = requestAnimationFrame(schritt);
            else setDa(true);
        };
        lauf = requestAnimationFrame(schritt);
        const zu = setTimeout(onWeiter, 4500);
        return () => { cancelAnimationFrame(lauf); clearTimeout(zu); };
    }, [von, onWeiter]);

    const f = ergebnis.fang;
    const info = FISCH_INFO[f.fischId] || {};
    const rar = info.kram ? "kram" : f.rarity;
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" onPointerDown={(e) => { e.preventDefault(); onWeiter(); }}>
            <img ref={fischRef} src={fischBild(f.fischId)} alt="" draggable={false}
                className="h-28 w-auto select-none" style={{ imageRendering: "pixelated", opacity: 0, transformOrigin: "center" }} />
            <div className="mt-4 min-w-[17rem] border-[4px] text-center"
                style={{ borderColor: HOLZ, background: "#f3e3c3", boxShadow: `0 5px 0 0 ${HOLZ}`, visibility: da ? "visible" : "hidden" }}>
                <div className="px-3 py-1 text-xs font-bold" style={{ background: RAR_FARBE[rar] || RAR_FARBE.COMMON, color: "#2b1d12", borderBottom: `3px solid ${HOLZ}` }}>
                    {RAR_NAME[rar] || "Fisch"}{ergebnis.neu ? " · Neu im Fischbuch!" : ""}
                </div>
                <div className="px-4 pb-2 pt-2">
                    <div className="text-2xl font-bold leading-tight text-[#3b2516]">{fischName(f.fischId)}</div>
                    <div className="mt-1 text-sm font-bold tabular-nums text-[#6e4426]">
                        {String(f.cm).replace(".", ",")} cm · {formatGold(f.wert)} Gold{ergebnis.xp > 0 ? ` · +${ergebnis.xp} Erfahrung` : ""}
                    </div>
                    {ergebnis.teichling && <div className="mt-1 text-xs font-bold text-[#2f6f62]">Der Teichling hat Glück gebracht</div>}
                    <div className="mt-2 text-[10px] font-bold text-[#8a6a4a]">Klick oder Leertaste: weiter</div>
                </div>
            </div>
        </div>
    );
}

export default function AngelFenster({
    onClose, apiCall, applyEconomy, fische, setFische, fischbuch, setFischbuch, notify, playSound,
    toolInventory, setzeWerkzeug, lage, engineRef, layoutRef, lautstaerke = 0.5,
}) {
    const [reiter, setReiter] = useState("angeln");
    // bereit | wirft | wartet | zieht (Anbiss gemeldet) | ringe | holt | fang (Fisch wird gezeigt)
    const [zustand, setZustand] = useState("bereit");
    const [ergebnis, setErgebnis] = useState(null);   // { fang, grund, xp, neu, teichling }
    const [koeder, setKoeder] = useState(null);
    const hatKoeder = KOEDER.some((k) => (Number(toolInventory?.[k.feld]) || 0) > 0);
    const wurfRef = useRef(null);
    const timerRef = useRef(null);
    const busyRef = useRef(false);
    const hatAngel = Boolean(toolInventory?.hasAngel);
    const koederAnzahl = (k) => Number(toolInventory?.[k.feld]) || 0;
    const lautRef = useRef(lautstaerke);
    lautRef.current = lautstaerke;
    // Szene im Teich: wo der Schwimmer liegt, seit wann, und der laufende Ring
    // (zeichnet engine/teichLeben.js)
    const [szene, setSzene] = useState(() => ({ ...SZENE_LEER, ziel: angelWurfZiel(layoutRef?.current) }));
    const angedockt = reiter === "angeln" && hatAngel;
    useEffect(() => {
        const engine = engineRef?.current;
        if (!engine) return undefined;
        // Die Lage des Schwimmers im Bild trägt der Renderer ein — beim Tausch der Szene mitnehmen
        const schwimmer = engine.angelSzene?.schwimmer || null;
        engine.angelSzene = angedockt ? { ...szene, zustand, schwimmer } : null;
        return () => { engine.angelSzene = null; };
    }, [engineRef, angedockt, szene, zustand]);

    // Zeigt sich gerade der Teichling? Dann beißen seltene Fische öfter (core/angeln.js)
    const [teichlingDa, setTeichlingDa] = useState(false);
    const wetter = lage?.wetter || "sun";
    useEffect(() => {
        const pruefe = () => setTeichlingDa(Boolean(teichlingStand(Date.now(), wetter)));
        pruefe();
        const takt = setInterval(pruefe, 1000);
        return () => clearInterval(takt);
    }, [wetter]);

    const uebernehmen = useCallback((data) => {
        if (Array.isArray(data?.fische)) setFische(data.fische);
        if (data?.fischbuch && typeof data.fischbuch === "object") setFischbuch(data.fischbuch);
        if (data?.toolInventory) setzeWerkzeug?.(data.toolInventory);
        applyEconomy?.(data, []);
    }, [applyEconomy, setFische, setFischbuch, setzeWerkzeug]);

    // Ohne Köder kein Wurf (06.11.): ist der gewählte leer, den nächsten vorhandenen nehmen
    useEffect(() => {
        const k = KOEDER.find((x) => x.id === koeder);
        if (k && (Number(toolInventory?.[k.feld]) || 0) > 0) return;
        const naechster = KOEDER.find((x) => (Number(toolInventory?.[x.feld]) || 0) > 0);
        setKoeder(naechster ? naechster.id : null);
    }, [koeder, toolInventory]);

    // ── Ringe ────────────────────────────────────────────────────────────────
    // Der Stand des laufenden Spiels liegt in einer Ref: Tastendruck und Zeitgeber müssen
    // ihn sofort lesen, nicht erst nach dem nächsten Rendern.
    const spielRef = useRef(null);
    const einholenRef = useRef(null);
    const anbissRef = useRef(null);
    const spielTeichlingRef = useRef(false);

    const naechsterRing = useCallback(() => {
        const sp = spielRef.current;
        if (!sp || sp.vorbei) return;
        const nr = sp.ergebnisse.length;
        const ab = Date.now() + sp.pausen[nr];
        sp.ring = { nr, ab, dauerMs: sp.dauerMs, fensterMs: sp.fensterMs, taste: sp.tasten[nr] };
        setSzene((alt) => ({ ...alt, ring: sp.ring, ergebnisse: [...sp.ergebnisse], anzahl: sp.anzahl, pfeile: sp.pfeile }));
        clearTimeout(sp.zeit);
        // Niemand hat gedrückt: der Ring ist durch
        sp.zeit = setTimeout(() => sp.werte?.("daneben"), sp.pausen[nr] + sp.dauerMs + sp.fensterMs + 40);
    }, []);

    const starteRinge = useCallback((ringe, muster) => {
        const rnd = zufall(muster);
        const anzahl = Math.max(1, Number(ringe?.anzahl) || 1);
        const sp = {
            anzahl,
            dauerMs: Math.max(300, Number(ringe?.dauerMs) || 1100),
            fensterMs: Math.max(60, Number(ringe?.fensterMs) || 150),
            erlaubt: Math.max(0, Number(ringe?.fehler) || 0),
            pfeile: Boolean(ringe?.pfeile),
            // Mit Buchstaben: jede Taste eine andere als die vorige — sonst hämmert man nur
            tasten: [],
            pausen: [],
            ergebnisse: [], fehler: 0, ring: null, zeit: null, vorbei: false, werte: null,
        };
        for (let i = 0; i < anzahl; i++) {
            let t = "leer";
            if (ringe?.pfeile) {
                const wahl = ["leer", ...BUCHSTABEN].filter((x) => x !== sp.tasten[i - 1]);
                t = wahl[Math.floor(rnd() * wahl.length)];
            }
            sp.tasten.push(t);
            sp.pausen.push(i === 0 ? 350 : 180 + Math.floor(rnd() * 260));
        }
        sp.werte = (art) => {
            if (sp.vorbei || !sp.ring) return;
            clearTimeout(sp.zeit);
            sp.ergebnisse.push(art);
            if (art === "daneben") sp.fehler++;
            const treffer = sp.ergebnisse.filter((x) => x !== "daneben").length;
            angelTon(art === "gut" ? "treffer" : art, lautRef.current, treffer - 1);
            sp.ring = null;
            const verloren = sp.fehler > sp.erlaubt;
            const fertig = verloren || sp.ergebnisse.length >= sp.anzahl;
            setSzene((alt) => ({ ...alt, ring: null, ergebnisse: [...sp.ergebnisse], anzahl: sp.anzahl, blitz: { art, um: Date.now() } }));
            if (fertig) {
                sp.vorbei = true;
                // Kurz stehen lassen, damit man den letzten Treffer noch sieht
                sp.zeit = setTimeout(() => einholenRef.current?.(!verloren), 320);
            } else {
                naechsterRing();
            }
        };
        spielRef.current = sp;
        setZustand("ringe");
        naechsterRing();
    }, [naechsterRing]);

    /** Tastendruck oder Klick während der Ringe. `kennung` = leer | q | w | e | a | s | d | f */
    const druecke = useCallback((kennung) => {
        const sp = spielRef.current;
        const ring = sp?.ring;
        if (!sp || sp.vorbei || !ring) return;
        const jetzt = Date.now();
        // Ring noch gar nicht zu sehen (Pause): Druck zählt nicht, kostet aber auch nichts
        if (jetzt < ring.ab) return;
        const abstand = jetzt - (ring.ab + ring.dauerMs);
        if (kennung !== ring.taste || Math.abs(abstand) > ring.fensterMs) sp.werte("daneben");
        else sp.werte(Math.abs(abstand) <= ring.fensterMs * 0.4 ? "perfekt" : "gut");
    }, []);

    const werfen = useCallback(async () => {
        if (busyRef.current || !hatAngel || !koeder) return;
        busyRef.current = true;
        setErgebnis(null);
        setZustand("wirft");
        const ziel = angelWurfZiel(layoutRef?.current);
        try {
            const data = await apiCall("/action", { method: "POST", body: JSON.stringify({ action: "angelnWerfen", koeder }) });
            uebernehmen(data);
            wurfRef.current = data?.wurfId || null;
            const bissIn = Math.max(0, Number(data?.bissIn) || 3000);
            setSzene({ ...SZENE_LEER, ziel, wurfAb: Date.now(), bissUm: Date.now() + bissIn });
            setZustand("wartet");
            playSound?.("plant", 0.5);
            clearTimeout(timerRef.current);
            // Es beißt: sofort dem Server melden — er würfelt den Fisch und nennt die Ringe
            timerRef.current = setTimeout(() => anbissRef.current?.(), bissIn);
        } catch (e) {
            notify?.(e?.message || "Auswerfen hat nicht geklappt.", "error");
            setZustand("bereit");
        } finally {
            busyRef.current = false;
        }
    }, [apiCall, notify, playSound, koeder, hatAngel, uebernehmen, layoutRef]);

    const anbiss = useCallback(async () => {
        const id = wurfRef.current;
        if (!id) return;
        setZustand("zieht");
        angelTon("biss", lautRef.current);
        try {
            const data = await apiCall("/action", { method: "POST", body: JSON.stringify({ action: "angelnZiehen", wurfId: id }) });
            uebernehmen(data);
            if (data?.drill) {
                spielTeichlingRef.current = Boolean(data.teichling);
                starteRinge(data.ringe, data.muster);
            } else {
                wurfRef.current = null;
                setErgebnis({ fang: null, grund: data?.grund || null });
                setZustand("bereit");
            }
        } catch (e) {
            wurfRef.current = null;
            notify?.(e?.message || "Der Fisch hat nicht angebissen.", "error");
            setZustand("bereit");
        }
    }, [apiCall, notify, uebernehmen, starteRinge]);
    anbissRef.current = anbiss;

    const einholen = useCallback(async (geschafft) => {
        const id = wurfRef.current;
        wurfRef.current = null;
        spielRef.current = null;
        setZustand("holt");
        let gefangen = false;
        try {
            const data = await apiCall("/action", { method: "POST", body: JSON.stringify({ action: "angelnEinholen", wurfId: id, geschafft }) });
            uebernehmen(data);
            setErgebnis({ fang: data?.fang || null, grund: data?.grund || null, xp: data?.xp || 0, neu: Boolean(data?.neu), teichling: spielTeichlingRef.current });
            if (data?.fang) {
                gefangen = true;
                angelTon("fang", lautRef.current);
            }
        } catch (e) {
            notify?.(e?.message || "Einholen hat nicht geklappt.", "error");
        } finally {
            setSzene((alt) => ({ ...SZENE_LEER, ziel: alt.ziel }));
            setZustand(gefangen ? "fang" : "bereit");
        }
    }, [apiCall, notify, uebernehmen]);
    einholenRef.current = einholen;

    const fangWeiter = useCallback(() => setZustand((z) => (z === "fang" ? "bereit" : z)), []);

    // Tasten: Esc/Loslaufen packt ein, in den Ringen zählen Leertaste und die Buchstaben
    useEffect(() => {
        const taste = (e) => {
            const key = e.key.toLowerCase();
            if (zustand === "fang") {
                if (key === " " || key === "enter" || key === "escape") { e.preventDefault(); e.stopPropagation(); fangWeiter(); }
                return;
            }
            if (zustand === "ringe" && RING_KENNUNG[key]) {
                e.preventDefault();
                e.stopPropagation();
                if (!e.repeat) druecke(RING_KENNUNG[key]);
                return;
            }
            // An der Leiste: Esc packt ein — und wer losläuft, solange nichts im Wasser liegt, auch
            if (angedockt && (key === "escape" || (zustand === "bereit" && LAUFTASTEN.has(key)))) { onClose?.(); return; }
            // Die Leertaste öffnet sonst (wie E) das Ziel vor der Figur — hier nicht. Solange
            // etwas im Wasser liegt, gilt das für alle Ring-Tasten (E gehört dazu).
            if (angedockt && (key === " " || (zustand !== "bereit" && RING_KENNUNG[key]))) { e.preventDefault(); e.stopPropagation(); }
        };
        window.addEventListener("keydown", taste, true);
        return () => window.removeEventListener("keydown", taste, true);
    }, [zustand, angedockt, onClose, druecke, fangWeiter]);
    useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(spielRef.current?.zeit); }, []);

    const verkaufen = async (ids) => {
        try {
            const data = await apiCall("/action", { method: "POST", body: JSON.stringify({ action: "fischVerkaufen", ids }) });
            uebernehmen(data);
            playSound?.("cash", 0.5);
            notify?.(`Verkauft für ${formatGold(data?.gold || 0)} Gold.`);
        } catch (e) {
            notify?.(e?.message || "Verkaufen hat nicht geklappt.", "error");
        }
    };

    const eimer = Array.isArray(fische) ? fische : [];
    const eimerWert = eimer.reduce((s, f) => s + (Number(f.wert) || 0), 0);
    const GRUND = {
        zufrueh: "Zu früh — der Fisch ist davongeschwommen.",
        zuspaet: "Zu spät — der Fisch hat sich den Köder geschnappt.",
        entwischt: "Daneben — der Fisch ist entwischt.",
        eimervoll: "Der Fischeimer ist voll. Verkauf oder verfüttere erst ein paar Fische.",
    };
    const lageText = lage ? [lage.nacht ? "Nacht" : "Tag", SAISON_NAME[lage.saison]?.replace(/^im /, ""), WETTER_NAME[lage.wetter]?.replace(/^bei /, "")].filter(Boolean).join(" · ") : "";
    const beissenJetzt = lage ? FISCH_IDS.filter((id) => !FISCH_INFO[id].kram && beisstJetzt(id, lage)).length : null;
    const laeuft = zustand !== "bereit";

    const STATUS = {
        bereit: hatKoeder ? "Köder wählen und auswerfen" : "Keine Köder mehr — Würmer gibt es im Werkzeugladen.",
        wirft: "Auswerfen …",
        wartet: "Warte, bis es beißt …",
        zieht: "Anbiss!",
        ringe: szene.pfeile ? "Drück die gezeigte Taste (Q W E A S D F oder Leertaste), wenn der Ring den Schwimmer berührt" : "Leertaste oder Klick, wenn der Ring den Schwimmer berührt",
        holt: "Einholen …",
        fang: "Gefangen!",
    };

    if (angedockt) {
        const knopf = "flex items-center gap-1.5 border-[3px] px-2 py-1 text-[11px] font-bold";
        return (
            <>
                {/* Fängt Klicks über der Welt ab: in den Ringen zählt ein Klick wie die Leertaste */}
                <div className="absolute inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); if (zustand === "ringe") druecke("leer"); }} />
                {zustand === "fang" && ergebnis?.fang && (
                    <FangKarte ergebnis={ergebnis} von={engineRef?.current?.angelSzene?.schwimmer || null} onWeiter={fangWeiter} />
                )}
                <div
                    role="dialog" aria-label="Angeln am Dorfteich"
                    className="absolute bottom-[7.6rem] left-1/2 z-50 w-[min(46rem,calc(100%-1.5rem))] -translate-x-1/2 border-[4px] px-3 py-2"
                    style={{ borderColor: HOLZ, background: "#5a3a22", boxShadow: `0 5px 0 0 ${HOLZ}` }}
                >
                    {/* Groß und mittig über der Leiste (11.11.) — nur solange nichts im Wasser
                        liegt, sonst stünde der Knopf vor den Ringen */}
                    {zustand === "bereit" && (
                        <button
                            type="button" disabled={!koeder}
                            onClick={(e) => { e.currentTarget.blur(); werfen(); }}
                            className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2 whitespace-nowrap border-[4px] px-12 py-3 text-2xl font-bold enabled:bg-[#ffd84a] enabled:text-[#3b2516] enabled:hover:bg-[#ffe680] enabled:active:translate-y-1 disabled:bg-[#b9a98a] disabled:text-[#6e5a44]"
                            style={{ borderColor: HOLZ, boxShadow: `0 6px 0 0 ${HOLZ}` }}
                        >
                            {koeder ? "Auswerfen" : "Keine Köder"}
                        </button>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <img src={versionedAsset("/garden-assets/icons/hud/angel_pixel.png")} alt="" className="h-8 w-8 shrink-0" style={{ imageRendering: "pixelated" }} />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-bold leading-tight text-[#fff3c4]">Angeln am Dorfteich</div>
                                {teichlingDa
                                    ? <div className="truncate text-[10px] font-bold text-[#9fe0c8]">Der Teichling ist da — seltene Fische beißen jetzt öfter</div>
                                    : lageText && <div className="truncate text-[10px] text-[#e8d7a8]">{lageText}{beissenJetzt !== null ? ` · ${beissenJetzt} Arten beißen` : ""}</div>}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button type="button" disabled={laeuft} onClick={() => setReiter("eimer")} className={`${knopf} bg-[#f3e3c3] text-[#6e4426] hover:bg-[#fff3c4] disabled:opacity-45`} style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                                Fischeimer<span className="tabular-nums opacity-70">{eimer.length}</span>
                            </button>
                            <button type="button" disabled={laeuft} onClick={() => setReiter("buch")} className={`${knopf} bg-[#f3e3c3] text-[#6e4426] hover:bg-[#fff3c4] disabled:opacity-45`} style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                                Fischbuch<span className="tabular-nums opacity-70">{Object.keys(fischbuch || {}).length}/{FISCH_IDS.length}</span>
                            </button>
                            <button type="button" onClick={onClose} aria-label="Angel einpacken" title="Angel einpacken (Esc)" className={`${knopf} bg-[#f3e3c3] text-[#3b2516] hover:bg-[#ffd0c4]`} style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                                Einpacken
                            </button>
                        </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {KOEDER.map((k) => {
                            const n = koederAnzahl(k);
                            const an = koeder === k.id;
                            return (
                                <button key={String(k.id)} type="button" disabled={n <= 0 || laeuft} title={k.text}
                                    onClick={(e) => { e.currentTarget.blur(); setKoeder(k.id); }}
                                    className={`${knopf} disabled:opacity-45 ${an ? "translate-y-0.5 bg-[#ffd84a] text-[#3b2516]" : "bg-[#f3e3c3] text-[#6e4426] hover:bg-[#fff3c4]"}`}
                                    style={{ borderColor: HOLZ, boxShadow: an ? `0 1px 0 0 ${HOLZ}` : `0 3px 0 0 ${HOLZ}` }}>
                                    <img src={versionedAsset(KOEDER_BILD[k.id])} alt="" className="h-5 w-5" style={{ imageRendering: "pixelated" }} />
                                    {k.name}<span className="tabular-nums opacity-70">×{n}</span>
                                </button>
                            );
                        })}
                        <div className="ml-auto flex min-w-0 items-center gap-2">
                            <div className="flex min-w-0 items-center gap-2 border-[3px] bg-[#f3e3c3] px-2 py-1" style={{ borderColor: HOLZ }}>
                                {zustand === "bereit" && ergebnis?.fang ? (
                                    <>
                                        <img src={fischBild(ergebnis.fang.fischId)} alt="" className="h-6 w-auto" style={{ imageRendering: "pixelated" }} />
                                        <span className="truncate text-xs font-bold text-[#3b2516]">
                                            {fischName(ergebnis.fang.fischId)}
                                            <span className="tabular-nums text-[#6e4426]"> · {String(ergebnis.fang.cm).replace(".", ",")} cm · {formatGold(ergebnis.fang.wert)} Gold</span>
                                        </span>
                                    </>
                                ) : zustand === "bereit" && ergebnis ? (
                                    <span className="truncate text-xs font-bold text-[#a8302a]">{GRUND[ergebnis.grund] || "Nichts gefangen."}</span>
                                ) : (
                                    <span className={`truncate text-xs font-bold ${zustand === "zieht" ? "text-[#a8302a]" : "text-[#3b2516]"}`}>{STATUS[zustand]}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <StandFenster
            titel="Angeln am Dorfteich"
            untertitel={lageText ? `Gerade: ${lageText}${beissenJetzt !== null ? ` · ${beissenJetzt} Arten beißen` : ""}` : "Auswerfen, Ringe treffen, Fisch einholen"}
            farbe="blau"
            bild="/garden-assets/icons/hud/angel_pixel.png"
            onClose={onClose}
            reiter={(
                <StandReiter aktiv={reiter} onWaehlen={setReiter} reiter={[
                    { key: "angeln", label: "Angeln" },
                    { key: "eimer", label: "Fischeimer", anzahl: eimer.length },
                    { key: "buch", label: "Fischbuch", anzahl: `${Object.keys(fischbuch || {}).length}/${FISCH_IDS.length}` },
                ]} />
            )}
        >
            {reiter === "angeln" && !hatAngel && (
                <div className="mt-2 flex flex-col items-center gap-3 border-[3px] bg-[#f3e3c3] px-6 py-10 text-center" style={{ borderColor: HOLZ, boxShadow: `0 4px 0 0 ${HOLZ}` }}>
                    <img src={versionedAsset("/garden-assets/icons/hud/angel_pixel.png")} alt="" className="h-16 w-16" style={{ imageRendering: "pixelated" }} />
                    <span className="text-lg font-bold text-[#3b2516]">Du brauchst eine Angel</span>
                    <span className="max-w-sm text-sm text-[#6e4426]">Im Werkzeugladen auf dem Dorfplatz gibt es die Angel für 750.000 Gold, dazu Köder und später eine Profi-Angel.</span>
                </div>
            )}

            {reiter === "eimer" && (
                <>
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#f3e3c3]">Fische verfütterst du im Tier-Fenster an deine Tiere — satte Tiere wirken stärker.</span>
                        <KaufKnopf onClick={() => verkaufen("alle")} disabled={eimer.length === 0}>Alle verkaufen · {formatGold(eimerWert)}</KaufKnopf>
                    </div>
                    {eimer.length === 0 ? (
                        <div className="py-10 text-center text-sm font-bold text-[#f3e3c3]">Der Eimer ist leer.</div>
                    ) : (
                        <Regal titel={`Fischeimer · ${eimer.length}`}>
                            {eimer.map((f) => (
                                <WarenKachel
                                    key={f.instanceId}
                                    raritaet={f.rarity}
                                    bild={<img src={fischBild(f.fischId)} alt="" className="h-14 w-auto" style={{ imageRendering: "pixelated" }} />}
                                    name={fischName(f.fischId)}
                                    zeile={`${String(f.cm).replace(".", ",")} cm`}
                                    preis={f.wert}
                                    aktionen={<NebenKnopfHolz onClick={() => verkaufen([f.instanceId])}>Verkaufen</NebenKnopfHolz>}
                                />
                            ))}
                        </Regal>
                    )}
                </>
            )}

            {reiter === "buch" && (
                <Regal titel="Fischbuch">
                    {FISCH_IDS.map((id) => {
                        const e = fischbuch?.[id];
                        const info = FISCH_INFO[id];
                        const jetzt = lage && !info.kram && beisstJetzt(id, lage);
                        return (
                            <WarenKachel
                                key={id}
                                raritaet={info.rarity}
                                blass={!e}
                                hervorheben={Boolean(jetzt)}
                                bild={<img src={fischBild(id)} alt="" className="h-14 w-auto" style={{ imageRendering: "pixelated", filter: e ? "none" : "brightness(0) opacity(0.45)" }} />}
                                name={e ? info.name : "???"}
                                zeile={e ? `${e.anzahl}× gefangen · größter ${String(e.maxCm).replace(".", ",")} cm` : bedingungText(id)}
                                text={e ? `${bedingungText(id)}${jetzt ? " · beißt gerade" : ""}` : (jetzt ? "beißt gerade" : undefined)}
                            />
                        );
                    })}
                </Regal>
            )}
        </StandFenster>
    );
}
