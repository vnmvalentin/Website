// ui/pergament.jsx
// Kleine Bausteine im Holz-und-Pergament-Look (06.11.) für alles, was nicht in einem
// StandFenster steht: Infokarten beim Hovern, Meldungen, Hinweisleisten, Banner.
// Gleiche Farben wie ui/laden/Marktstand.jsx — harte Kanten, Stufenschatten, keine Weichzeichner.
import React from "react";

import { HOLZ, PERGAMENT, TON } from "./pergamentFarben";

/** Pergamentkarte mit Holzrand; `band` = Farbe eines Streifens oben (z. B. Seltenheit). */
export function PergamentKarte({ children, className = "", style, band = null }) {
    return (
        <div className={`border-[3px] ${className}`}
            style={{ borderColor: HOLZ, background: PERGAMENT, boxShadow: `0 4px 0 0 ${HOLZ}`, ...style }}>
            {band && <div className="h-1.5" style={{ background: band }} />}
            {children}
        </div>
    );
}

/** Abschnitt in einer Karte mit dünner Holzlinie darunter. */
export function PAbschnitt({ children, className = "", letzter = false }) {
    return <div className={`px-3 py-2 ${letzter ? "" : "border-b-2 border-[#d9c39a]"} ${className}`}>{children}</div>;
}

/** Kennzahl: Bezeichnung links, Wert rechts. */
export function PZeile({ icon: Icon, label, value, ton = "normal" }) {
    return (
        <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-[#6e4426]">
                {Icon ? <Icon size={12} className="shrink-0" /> : null}
                {label}
            </span>
            <span className={`text-xs font-bold tabular-nums ${TON[ton] || TON.normal}`}>{value}</span>
        </div>
    );
}

/** Fortschritt als Holzrinne mit Füllung. */
export function PBalken({ wert, farbe = "#6a40a8", hoehe = "h-3" }) {
    const pct = Math.max(0, Math.min(100, (Number(wert) || 0) * 100));
    return (
        <div className={`w-full ${hoehe} border-2`} style={{ borderColor: HOLZ, background: "#d8c08a" }}>
            <div className="h-full transition-[width] duration-300" style={{ width: `${pct}%`, background: farbe }} />
        </div>
    );
}

/** Kleine Tastenkappe. */
export function Taste({ children }) {
    return (
        <kbd className="inline-block min-w-[1.4rem] border-2 bg-[#fffaf0] px-1 text-center text-[10px] font-bold text-[#3b2516]"
            style={{ borderColor: HOLZ, boxShadow: `0 2px 0 0 ${HOLZ}` }}>{children}</kbd>
    );
}

/** Holzschild-Leiste oben in der Mitte (Werkzeug-/Platzier-Hinweise). */
export function HinweisLeiste({ children, className = "", onAbbrechen }) {
    return (
        <div className={`absolute left-1/2 top-[4.9rem] z-40 flex -translate-x-1/2 items-center gap-2.5 border-[3px] px-3 py-1.5 text-xs text-[#3b2516] ${className}`}
            style={{ borderColor: HOLZ, background: PERGAMENT, boxShadow: `0 4px 0 0 ${HOLZ}` }}>
            {children}
            {onAbbrechen && (
                <button type="button" onClick={onAbbrechen}
                    className="ml-1 border-2 bg-[#fffaf0] px-1.5 text-[11px] font-bold text-[#a8302a] hover:bg-[#fff3c4]"
                    style={{ borderColor: HOLZ }}>
                    Abbrechen
                </button>
            )}
        </div>
    );
}
