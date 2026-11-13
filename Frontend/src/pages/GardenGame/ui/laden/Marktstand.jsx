// ui/laden/Marktstand.jsx
// Laden-Fenster im Look eines Marktstands (06.11., „Fenster sollen cooler fürs Auge
// sein, nicht so viel Text"): Markise in der Farbe des Stands, Holzschild mit Namen,
// die Ware als Kacheln mit großem Pixelbild und Preisschild auf Holzregalen.
//
// StandFenster ist der Rahmen, WarenKachel eine einzelne Ware, Regal eine Reihe
// mit Brett darunter. Der Samen-Shop ist der erste Laden in diesem Look; die übrigen
// Fenster nutzen noch GardenModal (gardenUi.jsx).
import React, { useEffect, useState } from "react";
import { HudIcon } from "../gameIcons";
import { versionedAsset } from "../../engine/assetVersion";
import { formatGold } from "../gardenTokens";

/** Markisenfarben je Stand: [Streifen hell, Streifen dunkel, Kante]. */
const STAND_FARBEN = {
    gruen: ["#f3f0e0", "#4f9a3c", "#2f6b2c"],
    blau: ["#f3f0e0", "#3a6ab0", "#24457a"],
    rot: ["#f3f0e0", "#c8403a", "#8a2a24"],
    gold: ["#fff3c4", "#e0a82a", "#9a6a14"],
    lila: ["#f3f0e0", "#8a5ac8", "#5a3a8a"],
    orange: ["#fff3c4", "#e8762a", "#a04a14"],
    grau: ["#e8ecee", "#6b737c", "#3b4248"],
};

const RARITAET = {
    COMMON: { name: "Gewöhnlich", farbe: "#8a8478", hell: "#e8e2d0" },
    UNCOMMON: { name: "Ungewöhnlich", farbe: "#3f8a35", hell: "#dcebc8" },
    RARE: { name: "Selten", farbe: "#2f6ab0", hell: "#d4e4f4" },
    EPIC: { name: "Episch", farbe: "#7a48c0", hell: "#e4d8f4" },
    LEGENDARY: { name: "Legendär", farbe: "#c88a14", hell: "#f8e8b8" },
    MYTHIC: { name: "Mythisch", farbe: "#c8407a", hell: "#f8d8e6" },
};
const raritaetInfo = (r) => RARITAET[r] || RARITAET.COMMON;

const HOLZ = "#3b2516";

function Markise({ farbe }) {
    const [hell, dunkel, kante] = STAND_FARBEN[farbe] || STAND_FARBEN.gruen;
    return (
        <div className="relative h-12 shrink-0" aria-hidden="true">
            <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(90deg, ${hell} 0 28px, ${dunkel} 28px 56px)`, borderBottom: `4px solid ${kante}` }} />
            {/* Zackenkante: Dreiecke statt Rundbögen, passt zum Pixel-Look */}
            <div className="absolute inset-x-0 -bottom-3 h-3" style={{
                background: `repeating-linear-gradient(90deg, ${hell} 0 28px, ${dunkel} 28px 56px)`,
                clipPath: "polygon(" + Array.from({ length: 81 }, (_, i) => `${(i / 80) * 100}% ${i % 2 ? 100 : 0}%`).join(",") + ")",
            }} />
        </div>
    );
}

/**
 * Der Rahmen: Markise, Holzschild mit Titel, Holzwand als Hintergrund.
 * `bild` = Bild des Stands aus der Welt (world/…png) fürs Schild.
 */
export function StandFenster({ titel, untertitel, farbe = "gruen", bild, kopfRechts, reiter, onClose, onBack, children, markise = true, breite = "max-w-4xl", inhaltHintergrund, oben = null, rahmen = null, footer = null }) {
    // `oben` ersetzt die Markise (z. B. Deckel des Mülleimers), `rahmen` = { rand, flaeche }
    useEffect(() => {
        const taste = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", taste);
        return () => window.removeEventListener("keydown", taste);
    }, [onClose]);
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4" role="dialog" aria-label={titel}>
            <div className={`flex max-h-[88vh] w-full ${breite} flex-col overflow-hidden border-[4px]`} style={{ borderColor: rahmen?.rand || HOLZ, background: rahmen?.flaeche || "#5a3a22", boxShadow: `0 6px 0 0 ${rahmen?.rand || HOLZ}` }}>
                {oben || (markise && <Markise farbe={farbe} />)}
                <div className={`relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-2 sm:px-5 ${markise || oben ? "pt-5" : "pt-3"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        {onBack && (
                            <button type="button" onClick={onBack} aria-label="Zurück" title="Zurück"
                                className="flex h-9 w-9 shrink-0 items-center justify-center border-[3px] bg-[#f3e3c3] hover:bg-[#fff3c4]"
                                style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                                <HudIcon.back size={16} />
                            </button>
                        )}
                        {bild && (
                            <img src={versionedAsset(bild)} alt="" draggable={false} className="h-14 w-14 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                        )}
                        <div className="min-w-0 border-[3px] px-3 py-1.5" style={{ borderColor: HOLZ, background: "#f3e3c3", boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                            <h2 className="truncate text-lg font-bold leading-tight text-[#3b2516] sm:text-xl">{titel}</h2>
                            {untertitel && <div className="truncate text-[11px] text-[#6e4426]">{untertitel}</div>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {kopfRechts}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Schließen"
                            className="flex h-9 w-9 items-center justify-center border-[3px] bg-[#f3e3c3] hover:bg-[#ffd0c4]"
                            style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}
                        >
                            <HudIcon.close size={16} />
                        </button>
                    </div>
                </div>
                {reiter && <div className="px-4 pb-2 sm:px-5">{reiter}</div>}
                <div
                    className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1 sm:px-5"
                    style={{ overscrollBehavior: "contain", background: inhaltHintergrund || "repeating-linear-gradient(90deg, #6e4426 0 46px, #643e22 46px 48px)" }}
                >
                    {children}
                </div>
                {footer && <div className="border-t-[3px] px-4 py-3 sm:px-5" style={{ borderColor: HOLZ, background: "#6e4426" }}>{footer}</div>}
            </div>
        </div>
    );
}

/** Reiter als kleine Holzschilder. */
export function StandReiter({ reiter, aktiv, onWaehlen }) {
    return (
        <div className="flex flex-wrap gap-2">
            {reiter.map((r) => (
                <button
                    key={r.key}
                    type="button"
                    onClick={(e) => { e.currentTarget.blur(); onWaehlen(r.key); }}
                    className={`border-[3px] px-3 py-1 text-xs font-bold ${aktiv === r.key ? "translate-y-0.5 bg-[#fff3c4] text-[#3b2516]" : "bg-[#8a5a32] text-[#f3e3c3] hover:bg-[#9c6a3c]"}`}
                    style={{ borderColor: HOLZ, boxShadow: aktiv === r.key ? `0 1px 0 0 ${HOLZ}` : `0 3px 0 0 ${HOLZ}` }}
                >
                    {r.label}{r.anzahl !== undefined && <span className="ml-1.5 opacity-70">{r.anzahl}</span>}
                </button>
            ))}
        </div>
    );
}

/** Eine Reihe Ware auf einem Holzbrett, mit Schild darüber. */
export function Regal({ titel, ton, children }) {
    return (
        <section className="mt-4 first:mt-2">
            {titel && (
                <div className="mb-2 inline-block border-[3px] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ borderColor: HOLZ, background: ton === "selten" ? "#ffe066" : ton === "blass" ? "#c9b48a" : "#f3e3c3", color: HOLZ }}>
                    {titel}
                </div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
            <div className="mt-2 h-3 border-[3px]" style={{ borderColor: HOLZ, background: "#a46f3f", boxShadow: `inset 0 3px 0 0 #c08a54, 0 4px 0 0 rgba(0,0,0,0.35)` }} />
        </section>
    );
}

/** Preisschild: gelbes Kärtchen mit Münze. */
export function Preisschild({ preis, leistbar = true }) {
    return (
        <span className="inline-flex items-center gap-1 border-2 px-1.5 py-0.5 text-xs font-bold tabular-nums"
            style={{ borderColor: HOLZ, background: leistbar ? "#ffe066" : "#d8cfb8", color: leistbar ? HOLZ : "#7a6a50" }}>
            <HudIcon.gold size={12} />
            {formatGold(preis)}
        </span>
    );
}

/**
 * Eine Ware: Bild auf farbigem Grund (nach Seltenheit), Name, Preisschild, Knöpfe.
 * `abzeichen` = kleine Marken oben (z. B. Saison), `zeile` = eine kurze Zeile unter
 * dem Namen, `details` = aufklappbarer Inhalt (dunkel, wie bisher).
 */
export function WarenKachel({ bild, name, raritaet, band, abzeichen, zeile, text, preis, leistbar, vorrat, aktionen, details, blass = false, gross = false, hervorheben = false }) {
    // `band` ersetzt das Seltenheitsband ({ text, farbe, hell }) — z. B. „Ausgerüstet“ im Gold-Shop
    const r = band ? { name: band.text, farbe: band.farbe, hell: band.hell || raritaetInfo(raritaet).hell } : raritaetInfo(raritaet);
    const [offen, setOffen] = useState(false);
    return (
        <div className={`flex flex-col border-[3px] ${blass ? "opacity-60" : ""}`} style={{ borderColor: hervorheben ? "#3f7a35" : HOLZ, background: "#f3e3c3", boxShadow: `0 4px 0 0 ${hervorheben ? "#2f5a28" : HOLZ}` }}>
            <div className={`relative flex items-center justify-center border-b-[3px] ${gross ? "h-36 sm:h-40" : "h-24 sm:h-28"}`} style={{ borderColor: HOLZ, background: r.hell }}>
                {r.name && <span className="absolute left-0 top-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white" style={{ background: r.farbe }}>{r.name}</span>}
                {abzeichen && <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">{abzeichen}</div>}
                {bild}
                {vorrat !== undefined && vorrat !== null && (
                    <span className="absolute bottom-1 right-1 border-2 bg-[#fff3c4] px-1 text-[10px] font-bold tabular-nums" style={{ borderColor: HOLZ, color: HOLZ }}>×{vorrat}</span>
                )}
                {details && (
                    <button
                        type="button"
                        aria-label="Details anzeigen"
                        aria-expanded={offen}
                        onClick={() => setOffen((v) => !v)}
                        className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center border-2 text-[11px] font-bold"
                        style={{ borderColor: HOLZ, background: offen ? "#3b2516" : "#fff3c4", color: offen ? "#fff3c4" : HOLZ }}
                    >
                        i
                    </button>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-2">
                <div className="truncate text-sm font-bold leading-tight text-[#3b2516]" title={name}>{name}</div>
                {zeile && <div className="truncate text-[11px] leading-tight text-[#6e4426]">{zeile}</div>}
                {text && <div className="line-clamp-2 text-[11px] leading-snug text-[#6e4426]" title={text}>{text}</div>}
                <div className="mt-auto flex items-center justify-between gap-1.5 pt-1">
                    {preis !== undefined ? <Preisschild preis={preis} leistbar={leistbar} /> : <span />}
                    <div className="flex items-center gap-1">{aktionen}</div>
                </div>
            </div>
            {offen && details && <div className="border-t-[3px] bg-slate-900 p-2 text-left" style={{ borderColor: HOLZ }}>{details}</div>}
        </div>
    );
}

/** Kaufen-Knopf im Kachel-Look: grün und drückbar; gesperrt zeigt er den Grund. */
export function KaufKnopf({ children, disabled, onClick, title, klein = false, gefahr = false }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            className={`border-[3px] font-bold transition-transform duration-75 active:translate-y-0.5 disabled:translate-y-0 ${klein ? "px-1.5 py-1 text-[10px]" : "px-2.5 py-1 text-xs"} ${disabled ? "cursor-default bg-[#d8cfb8] text-[#7a6a50]" : gefahr ? "bg-[#c8403a] text-white hover:bg-[#d85a4a]" : "bg-[#5faa45] text-white hover:bg-[#6fbc52]"}`}
            style={{ borderColor: HOLZ, boxShadow: disabled ? "none" : `0 3px 0 0 ${HOLZ}` }}
        >
            {children}
        </button>
    );
}

/** Bild in einer Kachel — groß und pixelgenau. */
export function WarenBild({ src, alt = "" }) {
    if (!src) return null;
    return <img src={versionedAsset(src)} alt={alt} draggable={false} className="h-16 w-16 object-contain sm:h-20 sm:w-20" style={{ imageRendering: "pixelated" }} />;
}

/** Kleine Marke oben rechts in der Kachel. */
export function Marke({ children, farbe = "#3f8a35", title }) {
    return <span title={title} className="px-1 py-px text-[9px] font-bold text-white" style={{ background: farbe }}>{children}</span>;
}

/** Ein angepinnter Zettel (Missionen, Aufträge): Pergament mit Reißzwecke. */
export function Zettel({ children, erledigt = false, bereit = false }) {
    return (
        <div className={`relative border-[3px] p-3 pt-4 ${erledigt ? "opacity-60" : ""}`}
            style={{ borderColor: HOLZ, background: bereit ? "#e4f0cc" : "#f3e3c3", boxShadow: `0 4px 0 0 ${HOLZ}` }}>
            <span className="absolute left-1/2 top-[-7px] h-3 w-3 -translate-x-1/2 border-2" style={{ borderColor: HOLZ, background: bereit ? "#5faa45" : "#c8403a" }} />
            {children}
        </div>
    );
}

/** Fortschrittsbalken aus Holz und Farbe, ohne Verlauf. */
export function Fortschritt({ wert, fertig = false }) {
    const anteil = Math.max(0, Math.min(1, Number(wert) || 0));
    return (
        <div className="h-3.5 w-full border-2" style={{ borderColor: HOLZ, background: "#c9b48a" }}>
            <div className="h-full" style={{ width: `${anteil * 100}%`, background: fertig ? "#5faa45" : "#e0a82a", boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.35)" }} />
        </div>
    );
}

/** Belohnung als zwei kleine Schilder: Gold und Erfahrung. */
export function Belohnung({ gold, xp }) {
    return (
        <span className="flex shrink-0 items-center gap-1">
            {gold !== undefined && (
                <span className="inline-flex items-center gap-1 border-2 bg-[#ffe066] px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ borderColor: HOLZ, color: HOLZ }}>
                    <HudIcon.gold size={11} /> {formatGold(gold)}
                </span>
            )}
            {xp !== undefined && (
                <span className="inline-flex items-center gap-1 border-2 bg-[#e4d8f4] px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ borderColor: HOLZ, color: "#5a3a8a" }}>
                    <HudIcon.star size={10} /> {Number(xp).toLocaleString("de-DE")}
                </span>
            )}
        </span>
    );
}

/** Dunkle Fläche im Holzrahmen — für Ansichten, die noch im alten, dunklen Look stehen. */
export function DunkelFlaeche({ children }) {
    return (
        <div className="mt-2 border-[3px] bg-slate-900 p-3" style={{ borderColor: HOLZ, boxShadow: `0 4px 0 0 ${HOLZ}` }}>
            {children}
        </div>
    );
}

/** Zweiter, schlichter Knopf (Ablehnen, Abbrechen) im Kachel-Look. */
export function NebenKnopfHolz({ children, onClick, disabled, title }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={title}
            className="border-[3px] bg-[#f3e3c3] px-2.5 py-1 text-xs font-bold text-[#6e4426] hover:bg-[#fff3c4] disabled:opacity-50"
            style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
            {children}
        </button>
    );
}
