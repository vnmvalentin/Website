// ui/SkillTreeModal.jsx
// Der Fähigkeitsbaum.
//
// Der Bauplan kommt vom Server (GET /api/garden/skills) — hier steht bewusst keine
// einzige Prozentzahl im Code. Eine Anzeige, die etwas anderes verspricht als die
// Kasse auszahlt, wäre schlimmer als gar keine.
//
// ── v2, Punkt 4 (Neuzeichnung, Feedback 28.08.) ─────────────────────────────
// Die VORHERIGE Fassung (drei Fahrspuren, eine Karte pro Fähigkeit mit einer
// internen Stufen-Punktleiste) hatte zwei echte Probleme, keine kosmetischen:
//
//  1. Die Sperr-Linien zwischen den Karten zeigten eine ANDERE Regel, als der
//     Server tatsächlich prüfte. Eine Fahrspur leuchtete, sobald IHRE eigene
//     letzte Station investiert war — der echte Server-Gate (`benoetigtPunkte`)
//     war aber ein reiner GESAMT-Punktezähler über den ganzen Baum. Man konnte
//     also vier Punkte am Stück in eine einzige Fähigkeit stecken und trotzdem
//     die nächste Schwelle öffnen, während die Linien im Bild etwas anderes
//     suggerierten. Der Baum war insofern nicht wirklich VERBUNDEN.
//  2. Die Tiefe einer Fähigkeit (bis zu 10 Stufen) steckte komplett in einer
//     einzigen Karte als kleine Punktleiste — nichts davon wanderte weiter nach
//     rechts. "Grüner Daumens" letzte Stufe (Level 37) sah optisch genauso aus
//     wie seine erste (Level 1).
//
// JETZT: eine durchgehende horizontale LEVEL-ACHSE (1…Höchstlevel) statt einer
// Spalten-Einteilung. Jede Fähigkeit ist eine eigene Zeile — eine Kette aus
// einem Knoten JE STUFE, an der Stelle platziert, die ihr `levelJeStufe` wirklich
// verlangt. Tiefe wird damit von selbst sichtbar: viele Stufen wandern spürbar
// nach rechts. Drei Spuren (links/mitte/rechts) gruppieren die Zeilen weiter wie
// gehabt. Zwischen den Tier-Blöcken steht eine echte Sperr-Linie, deren Zustand
// direkt aus `stand.tiere` kommt (server-berechnet, siehe core/skills.js
// tierUebersicht) — was hier leuchtet, ist exakt das, was `lerneSkill` prüft.
//
// Beim Öffnen (und bei jedem Level-Aufstieg) scrollt die Ansicht automatisch zum
// aktuellen Level — "die Kamera folgt der Progression", statt immer bei Level 1
// von vorn anzufangen.

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { GardenModal } from './gardenUi';
import { HudIcon, SkillControlIcon, SkillIcon } from './gameIcons';

const AST_REIHENFOLGE = ["links", "mitte", "rechts"];
const AST_LABEL = { links: "Werkzeug & Vorrat", mitte: "Wachstum & Tiere", rechts: "Handel & Ertrag" };
const AST_FARBE = {
    links: { linie: "#0284c7", rand: "border-sky-600", text: "text-sky-300", bg: "bg-sky-500", bgSchwach: "bg-sky-950/40" },
    mitte: { linie: "#16a34a", rand: "border-emerald-600", text: "text-emerald-300", bg: "bg-emerald-500", bgSchwach: "bg-emerald-950/40" },
    rechts: { linie: "#d97706", rand: "border-amber-600", text: "text-amber-300", bg: "bg-amber-500", bgSchwach: "bg-amber-950/40" },
};

/**
 * Feedback 30.08.: "jede Fähigkeit eine eigene, farbige Blase, damit sie sich
 * besser voneinander abheben" — vorher hatten alle Fähigkeiten EINER Spur
 * (siehe AST_FARBE) exakt dieselbe Farbe für Linie, Knoten und Icon-Fläche,
 * unterscheidbar nur am Namen. Jetzt bekommt jede der neun Fähigkeiten ihren
 * eigenen Farbton — bewusst innerhalb der Familie ihrer Spur (Blau-Töne links,
 * Grün-Töne mitte, warme Töne rechts), damit die drei Spuren als Gruppe
 * trotzdem erkennbar bleiben und es keine willkürliche Regenbogen-Reihe wird.
 * Dieselbe Form wie AST_FARBE, damit SkillZeile/Knoten ohne Sonderfall auskommen.
 */
const SKILL_FARBE = {
    // links — Werkzeug & Vorrat (Blau-Familie)
    bergbau: { linie: "#0ea5e9", rand: "border-sky-500", text: "text-sky-300", bg: "bg-sky-500", bgSchwach: "bg-sky-950/40" },
    giesskanne: { linie: "#06b6d4", rand: "border-cyan-500", text: "text-cyan-300", bg: "bg-cyan-500", bgSchwach: "bg-cyan-950/40" },
    lagerist: { linie: "#3b82f6", rand: "border-blue-500", text: "text-blue-300", bg: "bg-blue-500", bgSchwach: "bg-blue-950/40" },
    seltenheit: { linie: "#6366f1", rand: "border-indigo-500", text: "text-indigo-300", bg: "bg-indigo-500", bgSchwach: "bg-indigo-950/40" },
    // mitte — Wachstum & Tiere (Grün-Familie)
    gruener_daumen: { linie: "#22c55e", rand: "border-green-500", text: "text-green-300", bg: "bg-green-500", bgSchwach: "bg-green-950/40" },
    wetterfuehlig: { linie: "#14b8a6", rand: "border-teal-500", text: "text-teal-300", bg: "bg-teal-500", bgSchwach: "bg-teal-950/40" },
    zuechter: { linie: "#84cc16", rand: "border-lime-500", text: "text-lime-300", bg: "bg-lime-500", bgSchwach: "bg-lime-950/40" },
    // rechts — Handel & Ertrag (warme Familie)
    haendler: { linie: "#f59e0b", rand: "border-amber-500", text: "text-amber-300", bg: "bg-amber-500", bgSchwach: "bg-amber-950/40" },
    ertrag: { linie: "#f97316", rand: "border-orange-500", text: "text-orange-300", bg: "bg-orange-500", bgSchwach: "bg-orange-950/40" },
};

// Geometrie der Level-Achse. 56 px je Level reicht, damit selbst die engste
// Stufen-Staffel im Baum (Reiche Ernte / Züchter, 3 Level je Stufe) noch klar
// getrennte Knoten zeigt, ohne den Baum unnötig breit zu machen.
const PX_JE_LEVEL = 56;
const LABEL_BREITE = 168;
const KNOTEN = 30;
const ZEILEN_HOEHE = 52;

function xVonLevel(level) {
    return Math.max(0, (Number(level) || 1) - 1) * PX_JE_LEVEL;
}

/** Minuten lesbar machen: 90 → „1 h 30". */
function minutenText(wert) {
    if (wert < 60) return `${wert} min`;
    const h = Math.floor(wert / 60);
    const m = wert % 60;
    return m ? `${h} h ${m}` : `${h} h`;
}

/**
 * Wert einer Stufe, so wie ihn der Server rechnet.
 *
 * Fähigkeiten mit `werte` sind eine feste Staffel statt eines Zuwachses je Stufe
 * (siehe Regenmacher). Dort steht der ABSOLUTE Wert in der Tabelle, und Stufe 0
 * hat einen eigenen Grundwert — die Tabelle ist deshalb um genau einen Eintrag
 * kürzer als die Zahl der Stufen +1.
 */
function stufenText(skill, stufe) {
    const tabelle = skill.anzeigeWerte || skill.werte;
    if (Array.isArray(tabelle)) {
        const wert = stufe === 0 ? (skill.grundwert ?? 0) : (tabelle[stufe - 1] ?? 0);
        if (skill.einheit === "minuten") return minutenText(wert);
        if (skill.einheit === "faktor") return `×${wert.toFixed(2).replace(".", ",")}`;
        return String(wert);
    }
    const wert = skill.proStufe * stufe;
    if (skill.einheit === "prozent") return `${Math.round(wert * 100)} %`;
    return String(Math.round(wert * 100) / 100);
}

function hatWirkung(skill, stufe) {
    const tabelle = skill.anzeigeWerte || skill.werte;
    return stufe > 0 || (Array.isArray(tabelle) && skill.grundwert != null);
}

/** Insgesamt vergebene Punkte, die Stufe N verlangt — Spiegel von punkteFuerStufe(). */
const PUNKTE_JE_STUFE = 4;
const punkteFuerStufe = (stufe) => Math.max(0, (stufe - 1) * PUNKTE_JE_STUFE);

function levelFuerStufe(skill, stufe) {
    return skill.levelJeStufe?.[stufe - 1] ?? skill.ab ?? 1;
}

/**
 * Zustand EINES Knotens (Stufe `i` von `skill`) — reine Ableitung aus Server-
 * Zahlen, keine eigene Regel. `tierOffen` kommt direkt aus `stand.tiere`.
 */
function knotenZustand(skill, i, { jetzt, level, punkteOffen, punkteVergeben, tierOffen }) {
    if (i <= jetzt) return "gelernt";
    if (i > jetzt + 1) return "zukunft";
    // i === jetzt + 1: die nächste Stufe dieser Fähigkeit.
    if (!tierOffen) return "gesperrtTier";
    const noetigesLevel = levelFuerStufe(skill, i);
    if (level < noetigesLevel) return "gesperrtLevel";
    const noetigeTiefe = punkteFuerStufe(i);
    if (punkteVergeben < noetigeTiefe) return "gesperrtTiefe";
    if (punkteOffen < 1) return "gesperrtPunkte";
    return "naechste";
}

/**
 * Inhalt des Hover-Tooltips für EINEN Knoten (Feedback 29.08.: "besseres
 * Hover, was jede Stufe eigentlich freischaltet").
 *
 * Vorher stand nur ein einzeiliger `title` (Browser-Standardtooltip: langsam,
 * unformatiert, nach ~1 s) mit dem WERT der Stufe und höchstens der
 * Sperr-Regel — nie die Beschreibung der Fähigkeit selbst. Jetzt liefert diese
 * Funktion strukturierten Inhalt (Wert JETZT/NÄCHSTE, die Beschreibung aus
 * dem Katalog, und — falls gesperrt — GENAU der Grund, den lerneSkill() auch
 * prüft), den ein eigenes, sofort erscheinendes Tooltip rendert.
 */
function knotenInfo(skill, i, zustand, kontext, tierInfo) {
    const wert = stufenText(skill, i);
    const basis = { skill, stufe: i, gesamt: skill.stufen, wert, beschreibung: skill.beschreibung };

    if (zustand === "gelernt") {
        const naechsteVorhanden = i < skill.stufen;
        return {
            ...basis,
            wertLabel: "Aktuell",
            status: naechsteVorhanden
                ? `Nächste Stufe: ${stufenText(skill, i + 1)} ab Level ${levelFuerStufe(skill, i + 1)}`
                : "Voll ausgebaut.",
            statusFarbe: "text-slate-400",
        };
    }
    if (zustand === "naechste") {
        return {
            ...basis,
            wertLabel: "Bringt",
            status: "Bereit — ein Klick lernt diese Stufe.",
            statusFarbe: "text-violet-300",
        };
    }
    if (zustand === "gesperrtTier") {
        return {
            ...basis,
            wertLabel: "Bringt",
            status: `Zweig noch gesperrt — ${tierInfo?.investiert ?? 0} von ${tierInfo?.benoetigt ?? "?"} Fähigkeiten davor brauchen mindestens einen Punkt.`,
            statusFarbe: "text-amber-300",
        };
    }
    if (zustand === "gesperrtLevel") {
        return {
            ...basis,
            wertLabel: "Bringt",
            status: `Ab Level ${levelFuerStufe(skill, i)} (du bist Level ${kontext.level}).`,
            statusFarbe: "text-amber-300",
        };
    }
    if (zustand === "gesperrtTiefe") {
        return {
            ...basis,
            wertLabel: "Bringt",
            status: `Braucht ${punkteFuerStufe(i)} insgesamt vergebene Punkte (du hast ${kontext.punkteVergeben}) — verteile erst breiter.`,
            statusFarbe: "text-amber-300",
        };
    }
    if (zustand === "gesperrtPunkte") {
        return {
            ...basis,
            wertLabel: "Bringt",
            status: "Kein Fähigkeitspunkt übrig.",
            statusFarbe: "text-amber-300",
        };
    }
    // "zukunft": weiter als die nächste Stufe — die Sperre ist immer dieselbe,
    // unabhängig davon, ob Level/Breite für DIESE Stufe längst reichen würden.
    return {
        ...basis,
        wertLabel: "Bringt",
        status: `Erst Stufe ${kontext.jetzt + 1} lernen — Stufen lassen sich nicht überspringen.`,
        statusFarbe: "text-slate-500",
    };
}

function Knoten({ skill, i, x, farbe, zustand, onLernen, info, onHover, onMove, onLeave }) {
    const gelernt = zustand === "gelernt";
    const naechste = zustand === "naechste";
    const klickbar = naechste;

    return (
        <button
            type="button"
            // KEIN natives `disabled` — ein deaktivierter Button bekommt in JEDEM
            // Browser keine Maus-Events, auch kein mouseenter/mouseleave. Genau
            // deshalb zeigte ein gesperrter oder schon gelernter Knoten (also
            // fast jeder auf dem Baum) beim Hover NICHTS an — für "besseres
            // Hover" (Feedback 29.08.) ist das die Mehrheit der Fälle, nicht die
            // Ausnahme. Nicht-klickbar ist deshalb nur noch aria-disabled plus
            // ein No-Op im Klick-Handler, die Maus-Events bleiben aktiv.
            aria-disabled={!klickbar}
            onClick={() => { if (klickbar) onLernen(skill.id); }}
            onMouseEnter={(e) => onHover(e, info)}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg border text-[10px] font-semibold transition-colors ${
                gelernt
                    ? `${farbe.bg} border-transparent text-slate-950`
                    : naechste
                        ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-500 cursor-pointer"
                        : zustand === "gesperrtLevel" || zustand === "gesperrtTier"
                            ? "border-slate-800 bg-slate-900 text-slate-700 cursor-default"
                            : "border-slate-700 bg-slate-800/60 text-slate-500 cursor-default"
            }`}
            style={{ left: x, width: KNOTEN, height: KNOTEN }}
        >
            {gelernt ? <HudIcon.check size={13} /> : naechste ? <SkillControlIcon.learn size={13} /> : <HudIcon.locked size={10} />}
        </button>
    );
}

function SkillZeile({ skill, farbe, stand, onLernen, onHover, onMove, onLeave }) {
    const jetzt = Number(stand?.skills?.[skill.id]) || 0;
    const tierInfo = (stand?.tiere || []).find((t) => t.tier === skill.tier);
    const tierOffen = tierInfo ? tierInfo.offen : true;
    const voll = jetzt >= skill.stufen;
    // Die Spur beginnt bei der ERSTEN Stufe der Fähigkeit (skill.ab), nicht bei
    // Level 1 — sonst zeigt eine spät startende Fähigkeit (z. B. "Glückspilz" ab
    // Level 28) eine Spur, die schon lange vor ihrer eigenen ersten Station läuft.
    const ersterX = xVonLevel(skill.ab);
    const letzterX = xVonLevel(levelFuerStufe(skill, skill.stufen));

    const kontext = {
        jetzt, level: stand?.level || 1,
        punkteOffen: stand?.punkteOffen || 0, punkteVergeben: stand?.punkteVergeben || 0,
        tierOffen,
    };

    // Die Linie ist bis zur letzten GELERNTEN Stufe hell — genau der Fortschritt,
    // den die Knoten selbst schon zeigen, kein zweiter Gedanke nötig.
    const helleBisX = jetzt > 0 ? xVonLevel(levelFuerStufe(skill, jetzt)) : ersterX;

    return (
        // Feedback 30.08.: "visuelle Trennung zwischen den einzelnen Fähigkeiten" —
        // vorher liefen die Zeilen ohne jede Kante ineinander, nur das Icon+Name-Label
        // hatte eine eigene Fläche. Eine dünne untere Kante über die GANZE Zeile
        // (Label UND Level-Achse) reicht als Trenner, ohne die Achse selbst zuzustellen.
        <div className="flex items-center border-b border-slate-800/60" style={{ height: ZEILEN_HOEHE }}>
            <div
                className="sticky left-0 z-10 shrink-0 flex items-center gap-2 bg-slate-900/98 pr-3 backdrop-blur-sm"
                style={{ width: LABEL_BREITE }}
            >
                {/* Feedback 30.08.: eigenes Icon je Fähigkeit — vorher stand hier nur
                    der Name, jeder Knoten selbst zeigt ohnehin nur Zustand (gelernt/
                    nächste/gesperrt), nie WELCHE Fähigkeit. Feedback 30.08. (zweite
                    Runde): die eigene Farbblase je Fähigkeit (siehe SKILL_FARBE) hebt
                    die Zeilen zusätzlich klarer voneinander ab als der reine Name. */}
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-950/50 ${farbe.bg}`}>
                    {SkillIcon[skill.id] ? React.createElement(SkillIcon[skill.id], { size: 18 }) : null}
                </span>
                <div className="min-w-0">
                    <div className={`text-xs font-medium ${voll ? farbe.text : "text-slate-200"} truncate`}>
                        {skill.name}
                    </div>
                    <div className="text-[10px] tabular-nums text-slate-500 truncate">
                        {hatWirkung(skill, jetzt) ? stufenText(skill, jetzt) : "—"}
                        {voll ? " · max" : ` · ${jetzt}/${skill.stufen}`}
                    </div>
                </div>
            </div>
            <div className="relative shrink-0" style={{ width: letzterX + KNOTEN + 24, height: ZEILEN_HOEHE }}>
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-0.5"
                    style={{ left: KNOTEN / 2 + ersterX, width: Math.max(0, letzterX - ersterX), background: "#1e293b" }}
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-0.5"
                    style={{ left: KNOTEN / 2 + ersterX, width: Math.max(0, helleBisX - ersterX), background: farbe.linie }}
                />
                {Array.from({ length: skill.stufen }, (_, idx) => {
                    const i = idx + 1;
                    const x = xVonLevel(levelFuerStufe(skill, i));
                    const zustand = knotenZustand(skill, i, kontext);
                    const info = knotenInfo(skill, i, zustand, kontext, tierInfo);
                    return (
                        <Knoten
                            key={i} skill={skill} i={i} x={x} farbe={farbe} zustand={zustand} onLernen={onLernen}
                            info={info} onHover={onHover} onMove={onMove} onLeave={onLeave}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Vertikale Sperr-Linie an der Level-Schwelle eines Tiers, mit Fortschritt.
 *
 * Das Label sitzt am OBEREN Rand der Linie, nicht darüber hinaus (kein
 * negatives Offset) — der umgebende Bereich beginnt schon unterhalb des
 * Level-Lineals; ein Label oberhalb der eigenen Box verschwand vorher hinter
 * dessen sticky-Hintergrund und war faktisch unsichtbar.
 */
function TierGate({ tier, x, hoehe }) {
    if (!tier || tier.tier === 0) return null;
    const erfuellt = tier.offen;
    return (
        <div
            className="pointer-events-none absolute top-0"
            style={{ left: x, height: hoehe }}
        >
            <div
                className={`absolute left-1 top-0 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium ${
                    erfuellt ? "text-slate-600" : "text-violet-300"
                }`}
            >
                {erfuellt ? <HudIcon.check size={10} /> : <HudIcon.locked size={10} />}
                {tier.investiert}/{tier.benoetigt} nötig
            </div>
            <div
                className={`absolute left-0 bottom-0 border-l ${erfuellt ? "border-slate-700" : "border-violet-600/70"}`}
                style={{ top: 14, borderLeftStyle: "dashed" }}
            />
        </div>
    );
}

/** Tooltip innerhalb des Sichtfensters halten — dieselbe Idee wie
 * getItemTooltipStyle in GameContainer.jsx (Hotbar-Tooltip), hier lokal, weil
 * dieses Modal für sich steht. */
function tooltipPosition(x, y) {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
    const w = 260;
    const h = 120;
    let left = x + 14;
    let top = y + 14;
    if (left + w > vw - 8) left = x - w - 14;
    if (top + h > vh - 8) top = y - h - 14;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    return { left, top };
}

/**
 * Eigenes Tooltip statt des Browser-Standards (Feedback 29.08.: "besseres
 * Hover, was jede Stufe freischaltet") — erscheint sofort statt nach ~1 s,
 * zeigt die Beschreibung der Fähigkeit UND (falls gesperrt) exakt den Grund,
 * den lerneSkill() auch prüft, statt nur den nackten Wert.
 */
function KnotenTooltip({ hover }) {
    if (!hover) return null;
    const { x, y, info } = hover;
    const { skill, stufe, gesamt, wert, wertLabel, beschreibung, status, statusFarbe } = info;
    return (
        <div
            className="fixed z-[80] pointer-events-none w-[260px] rounded-2xl border border-slate-700 bg-slate-900/95 px-3 py-2.5 shadow-xl backdrop-blur-sm"
            style={tooltipPosition(x, y)}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-white">{skill.name}</span>
                <span className="text-[10px] tabular-nums text-slate-500 shrink-0">Stufe {stufe}/{gesamt}</span>
            </div>
            <div className="mt-1 text-[11px] leading-snug text-slate-400">{beschreibung}</div>
            <div className="mt-1.5 text-xs font-semibold tabular-nums text-slate-200">
                {wertLabel}: {wert}
            </div>
            <div className={`mt-1 text-[11px] leading-snug ${statusFarbe}`}>{status}</div>
        </div>
    );
}

export default function SkillTreeModal({ offen, onClose, onBack, katalog, stand, onLernen, onZuruecksetzen }) {
    const scrollRef = useRef(null);
    const [hover, setHover] = useState(null);
    const onKnotenHover = (e, info) => setHover({ x: e.clientX, y: e.clientY, info });
    const onKnotenMove = (e) => setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
    const onKnotenLeave = () => setHover(null);

    const spurenSkills = useMemo(() => {
        const raus = {};
        for (const seite of AST_REIHENFOLGE) {
            raus[seite] = (katalog || [])
                .filter((s) => s.seite === seite)
                .sort((a, b) => (a.ab || 0) - (b.ab || 0));
        }
        return raus;
    }, [katalog]);

    const level = stand?.level || 1;
    const punkteOffen = stand?.punkteOffen || 0;
    const punkteVergeben = stand?.punkteVergeben || 0;
    const resetKosten = stand?.resetKosten || 0;
    const xpHier = stand?.xpDiesesLevel || 0;
    const xpBraucht = stand?.xpFuersNaechste || 0;
    const anteil = xpBraucht > 0 ? Math.min(1, xpHier / xpBraucht) : 1;

    // Gesamtbreite der Achse: die höchste je verlangte Level-Zahl im ganzen
    // Katalog, nicht ein hart codiertes Höchstlevel — ein künftiger Skill mit
    // späterer letzter Stufe zieht die Achse automatisch mit.
    const maxLevel = useMemo(() => {
        let m = level;
        for (const s of (katalog || [])) {
            const letzte = s.levelJeStufe?.[s.levelJeStufe.length - 1] ?? s.ab ?? 1;
            if (letzte > m) m = letzte;
        }
        return m;
    }, [katalog, level]);
    const gesamtbreite = xVonLevel(maxLevel) + KNOTEN + 40;

    // Level-Markierungen alle 5 Level, plus das erste und das aktuelle Level.
    const levelMarken = useMemo(() => {
        const raus = new Set([1, level]);
        for (let l = 5; l <= maxLevel; l += 5) raus.add(l);
        return Array.from(raus).sort((a, b) => a - b);
    }, [maxLevel, level]);

    // "Kamera folgt der Progression": beim Öffnen und bei jedem Level-Aufstieg
    // zum aktuellen Level scrollen, statt immer bei Level 1 von vorn zu stehen.
    useEffect(() => {
        if (!offen) return;
        const el = scrollRef.current;
        if (!el) return;
        const ziel = Math.max(0, xVonLevel(level) - (el.clientWidth - LABEL_BREITE) / 2);
        const t = setTimeout(() => el.scrollTo({ left: ziel, behavior: "smooth" }), 60);
        return () => clearTimeout(t);
    }, [offen, level]);

    if (!offen) return null;

    // Gesamthöhe des Baum-Bereichs (für die durchgehenden Tier-Linien) —
    // Spurköpfe plus alle Zeilen aller drei Spuren.
    const gesamtZeilen = AST_REIHENFOLGE.reduce((n, seite) => n + spurenSkills[seite].length, 0);
    const baumHoehe = AST_REIHENFOLGE.length * 26 + gesamtZeilen * ZEILEN_HOEHE;

    const tierGates = (stand?.tiere || []).filter((t) => t.tier > 0);

    return (
        <>
        <GardenModal
            onClose={onClose}
            onBack={onBack}
            title="Fähigkeiten"
            subtitle="Jede Ernte bringt Erfahrung. Jedes Level bringt einen Punkt."
            width="max-w-6xl"
        >
            {/* ── Kopf: Level, Fortschritt, offene Punkte ─────────────────────── */}
            <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tabular-nums text-white">Level {level}</span>
                        <span className="text-[11px] tabular-nums text-slate-500">
                            {xpBraucht > 0
                                ? `${xpHier.toLocaleString("de-DE")} / ${xpBraucht.toLocaleString("de-DE")} XP`
                                : "Höchstlevel erreicht"}
                        </span>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${punkteOffen > 0 ? "text-violet-300" : "text-slate-500"}`}>
                        {punkteOffen} {punkteOffen === 1 ? "Punkt" : "Punkte"} frei
                    </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-xl bg-slate-800">
                    <div className="h-full bg-violet-500" style={{ width: `${anteil * 100}%` }} />
                </div>
            </div>

            {/* ── Der Baum ────────────────────────────────────────────────────── */}
            {/* EINE horizontal scrollende Achse (Level 1…Höchstlevel) statt Spalten.
                Der Name jeder Fähigkeit steht sticky links, bleibt also beim
                Scrollen sichtbar — sonst wüsste man nach ein paar hundert Pixeln
                nicht mehr, welche Zeile man gerade ansieht. */}
            <div ref={scrollRef} className="overflow-x-auto pb-2" style={{ overscrollBehavior: "contain" }}>
                <div className="relative" style={{ width: LABEL_BREITE + gesamtbreite }}>
                    {/* Level-Lineal */}
                    <div className="sticky top-0 z-20 flex items-center bg-slate-900/98 backdrop-blur-sm" style={{ height: 24 }}>
                        <div className="sticky left-0 shrink-0" style={{ width: LABEL_BREITE }} />
                        <div className="relative shrink-0" style={{ width: gesamtbreite, height: 24 }}>
                            {levelMarken.map((l) => (
                                <span
                                    key={l}
                                    className={`absolute -translate-x-1/2 text-[10px] tabular-nums ${
                                        l === level ? "font-semibold text-violet-300" : "text-slate-600"
                                    }`}
                                    style={{ left: xVonLevel(l) + KNOTEN / 2 }}
                                >
                                    {l}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Tier-Sperrlinien, über die volle Höhe aller drei Spuren */}
                    <div className="pointer-events-none absolute" style={{ left: LABEL_BREITE, top: 32, width: gesamtbreite, height: baumHoehe }}>
                        {tierGates.map((tier) => {
                            const skill = (katalog || []).find((s) => s.tier === tier.tier);
                            if (!skill) return null;
                            return <TierGate key={tier.tier} tier={tier} x={xVonLevel(skill.ab)} hoehe={baumHoehe} />;
                        })}
                    </div>

                    {/* Die drei Spuren */}
                    <div className="mt-2">
                        {AST_REIHENFOLGE.map((seite) => {
                            const farbe = AST_FARBE[seite];
                            return (
                                <div key={seite} className="mb-1">
                                    {/* Volle LABEL_BREITE und ein deckender Hintergrund — sonst
                                        scheint eine Tier-Sperrlinie, die genau in diese Spalte
                                        scrollt, durch den Spurkopf hindurch (mit Text-Gewusel
                                        als Folge). Dieselbe Deckung wie bei den Zeilen-Labels
                                        darunter (siehe SkillZeile), nur einmal je Spur. */}
                                    <div
                                        className={`sticky left-0 z-10 flex items-center gap-1.5 bg-slate-900/98 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${farbe.text}`}
                                        style={{ width: LABEL_BREITE, height: 22 }}
                                    >
                                        <ChevronsRight size={11} />
                                        {AST_LABEL[seite]}
                                    </div>
                                    {spurenSkills[seite].map((skill) => (
                                        <SkillZeile
                                            key={skill.id} skill={skill} farbe={SKILL_FARBE[skill.id] || farbe} stand={stand} onLernen={onLernen}
                                            onHover={onKnotenHover} onMove={onKnotenMove} onLeave={onKnotenLeave}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <p className="text-[11px] text-slate-500">
                    {punkteVergeben > 0
                        ? <>Zurücksetzen kostet <span className="text-amber-300">{resetKosten.toLocaleString("de-DE")} Gold</span> — der Preis wächst mit jedem vergebenen Punkt. Überleg dir die Verteilung.</>
                        : "Gelernte Fähigkeiten wirken ab der nächsten Ernte."}
                </p>
                <button
                    type="button"
                    onClick={onZuruecksetzen}
                    disabled={punkteVergeben === 0}
                    className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-800/60"
                >
                    <SkillControlIcon.reset size={13} /> Punkte zurückholen
                </button>
            </div>
        </GardenModal>
        <KnotenTooltip hover={hover} />
        </>
    );
}
