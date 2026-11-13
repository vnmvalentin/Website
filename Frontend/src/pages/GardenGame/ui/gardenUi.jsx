// ui/gardenUi.jsx
// Gemeinsame Komponenten des Virtual-Farm-HUDs.
// Konstanten, Icon-Zuordnungen und Formatierer liegen daneben in gardenTokens.js.
import React from 'react';
import { Clock } from 'lucide-react';
import { RARITY_TEXT, BTN_PRIMARY } from './gardenTokens';
import { HudIcon } from './gameIcons';

/** Feste Textschatten für Überschriften/Beschriftungen auf farbigem Grund
 * (Feedback 30.08.: "slight stroke or text-shadow for readability"). Als
 * Objekt statt Klasse, weil Tailwind keinen text-shadow-Utility hat. */
const TEXT_POP = { textShadow: "0 2px 0 rgba(69,26,3,0.45)" };

export function RarityLabel({ rarity, className = "" }) {
    const r = rarity || "COMMON";
    return (
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${RARITY_TEXT[r] || RARITY_TEXT.COMMON} ${className}`}>
            {r}
        </span>
    );
}

/** Kompakte Kennzahl: Label links, Wert rechts. */
export function StatLine({ icon: Icon, label, value, valueClass = "text-white" }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {Icon ? <Icon size={12} className="shrink-0" /> : null}
                {label}
            </span>
            <span className={`text-xs font-semibold tabular-nums ${valueClass}`}>{value}</span>
        </div>
    );
}

export function ProgressBar({ value, className = "bg-violet-500", height = "h-1.5" }) {
    const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
    return (
        <div className={`w-full ${height} bg-slate-800 rounded-xl overflow-hidden`}>
            <div className={`h-full ${className} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/**
 * Einheitlicher Rahmen für alle Garten-Modals. Vorher hatte jedes Modal seine
 * eigene Kopfzeile, eigene Radien und einen eigenen Schließen-Button.
 *
 * `toolbar`  Zeile zwischen Kopf und Inhalt, die NICHT mitscrollt — für
 *            Kategorien-Reiter. Steht sie im Inhalt, scrollt sie beim Blättern
 *            weg und man muss zum Wechseln erst wieder hochfahren.
 * `feste`    Fenster immer auf voller Höhe statt „so hoch wie der Inhalt".
 *            Ohne das springt das ganze Fenster bei jedem Reiterwechsel, weil
 *            es mittig sitzt und mit dem Inhalt wächst und schrumpft.
 *
 * Feedback 30.08. ("Cartoon-Overhaul"): der Rahmen ist jetzt ein Holzschild
 * (Verlauf für Volumen, dicke dunkle Kontur, große Radien) statt einer flachen
 * dunklen Fläche. Der INHALT (Zeilen, Karten, Listen) bleibt bewusst bei den
 * bisherigen dunklen slate-Tönen — ein Fenster voller heller Cremefläche hätte
 * jeden hellen Text im Inhalt (davon gibt es sehr viele) unlesbar gemacht.
 * Das Holzschild ist also ein Rahmen UM den bestehenden dunklen Bildschirm,
 * kein Ersatz dafür — dieselbe Idee wie ein Bilderrahmen um ein Display.
 */
/**
 * Drei feste Fensterbreiten statt einer frei gewählten je Fenster — vorher gab es
 * sechs verschiedene, vom winzigen Schuppen bis zur bildschirmbreiten Fähigkeiten-Ansicht.
 *   klein   Auswahl/Bestätigung (Schuppen, Markt, Profil, Hinweise)
 *   mittel  Listen (Läden, Missionen, Briefkasten, Tiere, Gold-Shop) — Standard
 *   gross   Raster (Rucksack, Brutkasten, Kiste/Vitrine); die Fähigkeiten behalten max-w-6xl
 * `width` (eine Tailwind-Klasse) bleibt als Ausnahme möglich.
 */
const FENSTER_BREITEN = { klein: "max-w-md", mittel: "max-w-2xl", gross: "max-w-4xl" };

export function GardenModal({ title, subtitle, headerRight, onClose, onBack, breite = "mittel", width, toolbar, feste = false, children, footer }) {
    const breitenKlasse = width || FENSTER_BREITEN[breite] || FENSTER_BREITEN.mittel;
    return (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className={`w-full ${breitenKlasse} ${feste ? "h-[86vh]" : "max-h-[86vh]"} flex flex-col bg-gradient-to-b from-amber-800 to-amber-900 border-[6px] border-amber-950 rounded-[2rem] shadow-2xl overflow-hidden`}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b-4 border-amber-950/50 bg-black/10">
                    <div className="flex items-start gap-2 min-w-0">
                        {/* Feedback 30.08.: "Back"-Knopf für Fenster, die aus einem anderen
                            Fenster heraus geöffnet wurden (Profil → Umkleide, Schuppen → Kiste
                            usw.) — vorher liess sich von dort nur ganz schließen, ein Rücksprung
                            zum Auswahlfenster brauchte den Umweg über den HUD-Knopf. Dasselbe
                            back.png wie in der Kopfzeile/Logbuch-Detailansicht. */}
                        {onBack ? (
                            <button
                                type="button"
                                onClick={onBack}
                                aria-label="Zurück"
                                title="Zurück"
                                className="shrink-0 mt-0.5 p-1.5 rounded-2xl border-2 border-transparent text-amber-100 hover:border-amber-950/40 hover:bg-black/20 transition-colors"
                            >
                                <HudIcon.back size={16} />
                            </button>
                        ) : null}
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-white tracking-tight" style={TEXT_POP}>{title}</h2>
                            {subtitle ? <div className="text-xs text-amber-100/80 mt-0.5">{subtitle}</div> : null}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {headerRight}
                        {/* Feedback 30.08.: "make a visible hover for the X" — ein eigener
                            Fleck, der beim Hover auftaucht (HudIcon.close ist ein Bild, ein
                            reiner Textfarbwechsel griffe ins Leere). Nur Farbe, kein
                            Vergrößern/Drehen mehr. */}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Schließen"
                            className="p-1.5 rounded-2xl border-2 border-transparent hover:border-red-700 hover:bg-red-100 transition-colors"
                        >
                            <HudIcon.close size={18} />
                        </button>
                    </div>
                </div>
                {toolbar ? (
                    <div className="shrink-0 border-b-4 border-amber-950/40 bg-black/20 px-5 py-2">{toolbar}</div>
                ) : null}
                {/* Der Inhalt bleibt ein dunkler "Bildschirm" innerhalb des Holzrahmens
                    (siehe Kommentar oben an der Funktion) — jedes Modal ist voller
                    hellem Text (weiß, slate-200/400 …), der auf dem hellen Holzton
                    unlesbar würde. */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-slate-900 px-5 py-4" style={{ overscrollBehavior: "contain" }}>
                    {children}
                </div>
                {footer ? <div className="px-5 py-3 border-t-4 border-amber-950/40 bg-black/10">{footer}</div> : null}
            </div>
        </div>
    );
}

/** Gold-Anzeige für Modal-Kopfzeilen — cremefarbenes Plättchen (Feedback
 * 30.08.: "soft cream for text backgrounds"), sitzt auf dem dunklen Holzrahmen
 * der Kopfzeile, nicht im hellen Innenbereich — dort bleibt es also lesbar. */
export function GoldTag({ gold }) {
    return (
        <span className={`flex items-center gap-1.5 px-2.5 py-1 text-sm font-bold tabular-nums bg-amber-50 text-amber-900 border-2 border-amber-950/70 rounded-2xl`}>
            <HudIcon.gold size={14} />
            {Number(gold || 0).toLocaleString("de-DE")}
        </span>
    );
}

/**
 * Countdown als eigene Sprechblase — dieselbe Cartoon-Form wie GoldTag, aber
 * bewusst in Blau statt Bernstein: Gold und "Zeit bis zur nächsten Ware"
 * sollen sich auf den ersten Blick unterscheiden, nicht wie zwei Kontostände
 * nebeneinander wirken (Feedback 31.08.: "eigene Bubble wie die goldene, aber
 * andere Farbe/Stil").
 */
export function TimerTag({ label, title }) {
    return (
        <span
            title={title}
            className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-bold tabular-nums bg-sky-50 text-sky-900 border-2 border-sky-950/70 rounded-2xl"
        >
            <Clock size={14} />
            {label}
        </span>
    );
}

/**
 * Unterstrich-Tabs statt Pillen.
 * flex-wrap statt overflow-x-auto: der Scroll-Container ließ sich immer ein, zwei Pixel
 * verschieben, wodurch die Kategorienleiste minimal scrollbar wirkte.
 */
// Standard ist violett (der Rest des HUDs), aber ein paar Fenster mit eigenem
// Thema (der Rucksack z.B. bernstein für "Leder/Canvas") duerfen abweichen —
// als feste Klassen statt Interpolation, sonst entfernt Tailwinds Purge sie
// wieder, weil "border-amber-500" nirgends woertlich im Quelltext staende.
const TABBAR_AKZENTE = {
    violet: "border-violet-500 text-white",
    amber: "border-amber-500 text-white",
    emerald: "border-emerald-500 text-white",
};

export function TabBar({ tabs, active, onSelect, accent = "violet", className = "border-b border-slate-800 mb-4" }) {
    const aktivKlasse = TABBAR_AKZENTE[accent] || TABBAR_AKZENTE.violet;
    return (
        <div className={`flex flex-wrap items-center gap-1 ${className}`}>
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = active === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        // blur: sonst bleibt der Reiter fokussiert, und Leertaste/Enter im
                        // Spiel lösen ihn später noch einmal aus.
                        onClick={(e) => { e.currentTarget.blur(); onSelect(tab.key); }}
                        // Feedback 30.08. wollte "Unterstrich statt Pillen" (die Reiter selbst
                        // bleiben rechteckig) — der Unterstrich darf trotzdem chunky sein:
                        // dick UND rund an den Enden statt einer scharfen 2px-Linie.
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-[3px] rounded-t-lg -mb-px transition-colors ${
                            isActive
                                ? aktivKlasse
                                : "border-transparent text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        {Icon ? <Icon size={13} /> : null}
                        {tab.label}
                        {tab.count !== undefined ? (
                            <span className="text-[10px] text-slate-500 tabular-nums">{tab.count}</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Bausteine für den Fensterinhalt. Vorher baute jedes Fenster Zeilen, Überschriften
 * und Leer-Hinweise selbst (15 Varianten von Überschriften, gut zehn von Leer-Texten,
 * 64 eigene Zeilen-Kästen). Neue Fenster nehmen diese hier.
 */

/**
 * Überschrift eines Abschnitts im Fenster. `ton="selten"` hebt Besonderes hervor.
 * `className` ERSETZT die Abstände (Standard px-1 pt-2 pb-1), statt sie zu ergänzen —
 * zwei widersprüchliche Tailwind-Abstände nebeneinander gewinnt sonst zufällig einer.
 */
export function Abschnitt({ children, ton = "normal", className = "px-1 pt-2 pb-1" }) {
    const farbe = ton === "selten" ? "text-amber-300" : "text-slate-400";
    return (
        <div className={`text-[11px] font-bold uppercase tracking-wider ${farbe} ${className}`}>
            {children}
        </div>
    );
}

/** Text, wenn eine Liste leer ist. */
export function LeerHinweis({ children, className = "" }) {
    return <div className={`py-10 text-center text-sm text-slate-500 ${className}`}>{children}</div>;
}

const ZEILEN_ZUSTAND = {
    normal: "border-slate-800 bg-slate-900/50",
    aktiv: "border-emerald-600/70 bg-emerald-950/30",
    gedimmt: "border-slate-800 bg-slate-900/40 opacity-50",
};

/**
 * Eine Listenzeile: Bild links, Titel (+ Marke) und Zusatztext, rechts ein Wert
 * (Preis, Bestand) und die Aktionen. `hoverbar` färbt den Rand beim Überfahren —
 * nur für Zeilen, an denen man gerade etwas tun kann.
 */
export function FensterZeile({ bild, titel, marke, text, wert, unterWert, aktionen, zustand = "normal", hoverbar = false, className = "" }) {
    return (
        <div className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${ZEILEN_ZUSTAND[zustand] || ZEILEN_ZUSTAND.normal} ${hoverbar ? "hover:border-violet-500" : ""} ${className}`}>
            {bild ? <div className="shrink-0">{bild}</div> : null}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{titel}</span>
                    {marke}
                </div>
                {text ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{text}</div> : null}
            </div>
            {wert !== undefined && wert !== null ? (
                <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-amber-400">{wert}</div>
                    {unterWert ? <div className="text-[11px] text-slate-500">{unterWert}</div> : null}
                </div>
            ) : null}
            {aktionen ? <div className="flex shrink-0 items-center gap-1.5">{aktionen}</div> : null}
        </div>
    );
}

// 07.11.: Holz-Look wie NebenKnopfHolz (ui/laden/Marktstand.jsx) statt der alten
// runden Schiefer-Knöpfe — die standen noch in Umkleide, Haus und „Neue Saat“.
const NEBENKNOPF_TON = {
    normal: "bg-[#f3e3c3] text-[#6e4426] hover:bg-[#fff3c4]",
    // Endgültiges (Wegwerfen): rot, damit man es nicht mit „Einen“ verwechselt.
    gefahr: "bg-[#c8403a] text-white hover:bg-[#d85a4a]",
};

/** Nebenaktion neben dem grünen Hauptknopf („Alle“, „×10“, „Einen“). */
export function NebenKnopf({ children, ton = "normal", className = "", style, ...props }) {
    return (
        <button
            type="button"
            className={`inline-flex items-center gap-1.5 border-[3px] px-2.5 py-1.5 text-xs font-bold transition-transform duration-75 active:translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${NEBENKNOPF_TON[ton] || NEBENKNOPF_TON.normal} ${className}`}
            style={{ borderColor: "#3b2516", boxShadow: "0 3px 0 0 #3b2516", ...style }}
            {...props}
        >
            {children}
        </button>
    );
}

/** Die Haupt-Handlung eines Fensters — grasgrün und drückbar (siehe BTN_PRIMARY
 * in gardenTokens.js), damit sie sich von den hölzernen Neben-Knöpfen abhebt. */
export function PrimaryButton({ children, className = "", ...props }) {
    return (
        <button
            type="button"
            className={`px-3 py-2 text-white text-xs font-bold ${BTN_PRIMARY} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
