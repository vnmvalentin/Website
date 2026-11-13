// ui/AblageModal.jsx
// Kiste und Vitrine — zwei Ablagen, gleiches Fenster.
//
//   Kiste   Lagerplatz für ALLES: Ernte, Samen, Eier, Deko und Tiere. Was hier liegt,
//           belegt keinen Rucksackplatz.
//   Vitrine Schaukasten, nur für Ernte. Der Inhalt steht in der Momentaufnahme des
//           Grundstücks und ist damit für alle in der Welt sichtbar (garden/world/lobby.js).
//
// Beide Seiten gehören dem Server: der Client schickt nur „dieses Stück, dorthin"
// bzw. „alles". Verschoben und geprüft wird in garden/core/economy.js.
import React, { useMemo, useState } from 'react';
import { HudIcon } from './gameIcons';
import { StandFenster, NebenKnopfHolz } from './laden/Marktstand';
import { SpecialItemIcon } from './ItemIcon';
import { beschreibeErnte } from './itemTints';
import { formatGold } from './gardenTokens';

/**
 * Die Kategorien der Kiste — Reihenfolge und Beschriftung müssen zu KISTE_QUELLEN in
 * Backend/garden/core/economy.js passen, damit ein Stück dort landet, wo es herkommt.
 */
const KATEGORIEN = [
    { key: "ernte", label: "Ernte" },
    { key: "samen", label: "Samen" },
    { key: "eier", label: "Eier" },
    { key: "deko", label: "Deko" },
    { key: "tiere", label: "Tiere" },
];

// `instanceId` zuerst — muss zu stueckId in Backend/garden/core/economy.js passen.
// Bei Eiern und Deko ist `id` nur die Art und für alle Stücke derselben Sorte gleich.
const idVon = (item) => item?.instanceId ?? item?.id;

/** Kategorie eines Stücks. Alte Kisteninhalte tragen keine — das ist dann Ernte. */
function kategorieVon(item) {
    return KATEGORIEN.some((k) => k.key === item?.kategorie) ? item.kategorie : "ernte";
}

/** Beschriftung je Kategorie: Ernte braucht Größe und Veredelung, der Rest den Namen. */
function beschreibe(item) {
    const kategorie = kategorieVon(item);
    if (kategorie === "ernte") return beschreibeErnte(item);
    if (kategorie === "tiere") {
        return item?.customName ? `${item.customName} (${item.name})` : (item?.name || "Tier");
    }
    return item?.name || "Gegenstand";
}

/** Verkaufswert eines Erntestücks — 0 heißt „kein Preis anzuzeigen". */
function wertVon(item) {
    if (kategorieVon(item) !== "ernte") return 0;
    return Math.max(0, Number(item?.sellValue) || 0);
}

// ── Aussehen (06.11.): Kiste wie eine offene Holzkiste, Vitrine wie ein Glasschrank,
// der Rucksack daneben als Stofftasche. Jedes Stück ist ein Fach — anklicken verschiebt es.
const HOLZ = "#3b2516";
const SELTEN_FARBE = {
    COMMON: "#9a9488", UNCOMMON: "#5faa45", RARE: "#4a82c8", EPIC: "#9a68d8", LEGENDARY: "#e0a82a", MYTHIC: "#e0609a",
};
const STIL = {
    rucksack: { flaeche: "#6f7a3e", fach: "#5a6432", fachRand: "#3f4622", naht: "#a8b06a", schrift: "#eef0d8" },
    kiste: { flaeche: "#5a3a22", fach: "#3b2516", fachRand: "#2b1d12", naht: "#8a5a32", schrift: "#f3e3c3" },
    vitrine: { flaeche: "#bfdfe6", fach: "#d8eef2", fachRand: "#8a5a32", naht: "#6e4426", schrift: "#3b2516" },
};

/** Ein Fach mit einem Stück. Rarität als kleine Ecke, Wert und Name im Hinweis beim Draufzeigen. */
function Fach({ item, aktion, richtung, busy, stil }) {
    const wert = wertVon(item);
    const s = STIL[stil];
    const titel = `${beschreibe(item)}${wert > 0 ? ` · ${formatGold(wert)} Gold` : ""} — ${richtung === "ein" ? "einlagern" : "herausnehmen"}`;
    return (
        <button
            type="button"
            onClick={() => aktion(idVon(item))}
            disabled={busy}
            title={titel}
            aria-label={titel}
            className="group relative flex aspect-square items-center justify-center border-[3px] transition-transform duration-75 hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: s.fach, borderColor: s.fachRand, boxShadow: stil === "vitrine" ? "inset 0 -4px 0 0 #a8743f" : "inset 0 3px 0 0 rgba(0,0,0,0.25)" }}
        >
            <SpecialItemIcon item={item} className="h-[70%] w-[70%]" emojiClassName="text-2xl" />
            <span className="absolute left-0 top-0 h-2 w-2" style={{ background: SELTEN_FARBE[item.rarity] || SELTEN_FARBE.COMMON }} />
            {wert > 0 && (
                <span className="pointer-events-none absolute bottom-0 right-0 hidden bg-[#ffe066] px-0.5 text-[8px] font-bold tabular-nums text-[#3b2516] group-hover:block">
                    {formatGold(wert)}
                </span>
            )}
        </button>
    );
}

/** Kleine Holzschilder als Reiter (Kategorien der Kiste bzw. des Rucksacks). */
function Reiter({ reiter, aktiv, onWaehlen, schrift }) {
    return (
        <div className="mb-2 flex flex-wrap gap-1.5">
            {reiter.map((r) => (
                <button key={r.key} type="button" onClick={(e) => { e.currentTarget.blur(); onWaehlen(r.key); }}
                    className="border-2 px-2 py-0.5 text-[11px] font-bold"
                    style={{ borderColor: HOLZ, background: aktiv === r.key ? "#fff3c4" : "transparent", color: aktiv === r.key ? HOLZ : schrift }}>
                    {r.label} <span className="opacity-70">{r.anzahl}</span>
                </button>
            ))}
        </div>
    );
}

/**
 * Eine Seite (Rucksack, Kiste oder Vitrine) mit Fächern. Bei nur einer Kategorie
 * (Vitrine) entfallen die Reiter — ein einzelner Reiter ohne Auswahl wäre nur Zierrat.
 */
function Seite({ titel, hinweis, gruppen, aktion, richtung, busy, leerText, stil }) {
    const vorhanden = KATEGORIEN.filter((k) => (gruppen[k.key]?.length || 0) > 0);
    const [reiter, setReiter] = useState(null);
    // Der gewählte Reiter kann leerlaufen (alles eingelagert) — dann auf den ersten
    // noch gefüllten zurückfallen, statt eine leere Seite zu zeigen.
    const aktiv = vorhanden.some((k) => k.key === reiter) ? reiter : (vorhanden[0]?.key ?? null);
    const items = aktiv ? (gruppen[aktiv] || []) : [];
    const gesamt = KATEGORIEN.reduce((n, k) => n + (gruppen[k.key]?.length || 0), 0);
    const gesamtwert = (gruppen.ernte || []).reduce((summe, i) => summe + wertVon(i), 0);
    const s = STIL[stil];
    const vitrine = stil === "vitrine";
    return (
        <div className="relative min-w-0 flex-1 border-[4px] p-3"
            style={{
                borderColor: vitrine ? "#6e4426" : stil === "kiste" ? HOLZ : "#3f4622",
                background: s.flaeche,
                boxShadow: `0 4px 0 0 ${HOLZ}`,
                outline: stil === "rucksack" ? `2px dashed ${s.naht}` : "none",
                outlineOffset: "-9px",
            }}>
            {/* Metallbänder der Kiste */}
            {stil === "kiste" && ["12%", "88%"].map((links) => (
                <span key={links} className="pointer-events-none absolute bottom-0 top-0 w-2" style={{ left: links, background: "#5d5d66", boxShadow: "inset 1px 0 0 0 #9a9aa4" }} />
            ))}
            <div className="relative mb-2 flex items-center justify-between gap-2">
                <span className="border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
                    style={{ borderColor: HOLZ, background: stil === "rucksack" ? "#a8b06a" : "#f3e3c3", color: HOLZ }}>{titel}</span>
                <span className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums" style={{ color: s.schrift }}>
                    {gesamtwert > 0 && (
                        <span className="inline-flex items-center gap-1 border-2 bg-[#ffe066] px-1 text-[#3b2516]" style={{ borderColor: HOLZ }}>
                            <HudIcon.gold size={10} /> {formatGold(gesamtwert)}
                        </span>
                    )}
                    {hinweis}
                </span>
            </div>
            {vorhanden.length > 1 && (
                <div className="relative">
                    <Reiter reiter={vorhanden.map((k) => ({ key: k.key, label: k.label, anzahl: gruppen[k.key].length }))} aktiv={aktiv} onWaehlen={setReiter} schrift={s.schrift} />
                </div>
            )}
            {gesamt === 0 ? (
                <p className="relative py-8 text-center text-xs font-bold" style={{ color: s.schrift, opacity: 0.75 }}>{leerText}</p>
            ) : (
                <div className="relative max-h-72 overflow-y-auto pr-1" style={{ overscrollBehavior: "contain" }}>
                    <div className={`grid gap-1.5 ${vitrine ? "grid-cols-5 gap-y-3" : "grid-cols-5 sm:grid-cols-6"}`}>
                        {items.map((item) => (
                            <Fach key={idVon(item)} item={item} aktion={aktion} richtung={richtung} busy={busy} stil={stil} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Pfeilknopf in der Mitte (alles hinein / alles heraus). */
function MitteKnopf({ onClick, disabled, title, umgedreht }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
            className="flex h-11 w-11 items-center justify-center border-[3px] bg-[#fff3c4] transition-transform duration-75 active:translate-y-0.5 disabled:opacity-35"
            style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}>
            <HudIcon.moveAll size={18} style={umgedreht ? { transform: "scaleX(-1)" } : undefined} />
        </button>
    );
}

export default function AblageModal({
    art, inhalt, rucksack, max, onClose, onBack, onEinlagern, onAuslagern, onAllesEin, onAllesAus, onUmstellen, busy,
}) {
    const istVitrine = art === "vitrine";

    // Der Kisteninhalt kommt als eine Liste und trägt seine Kategorie mit sich.
    const inhaltGruppen = useMemo(() => {
        const map = Object.fromEntries(KATEGORIEN.map((k) => [k.key, []]));
        for (const item of inhalt || []) map[kategorieVon(item)].push(item);
        return map;
    }, [inhalt]);

    const rucksackGesamt = KATEGORIEN.reduce((n, k) => n + (rucksack[k.key]?.length || 0), 0);
    const voll = inhalt.length >= max;

    return (
        <StandFenster
            titel={istVitrine ? "Vitrine" : "Vorratskiste"}
            untertitel={istVitrine
                ? "Was hier steht, sehen alle in der Welt — ansehen ja, anfassen nein"
                : "Lager für Ernte, Samen, Eier, Deko und Tiere — belegt keinen Rucksackplatz"}
            farbe={istVitrine ? "blau" : "gruen"}
            bild={istVitrine ? "/garden-assets/tools/vitrine.png" : "/garden-assets/tools/kiste.png"}
            onClose={onClose}
            onBack={onBack}
            kopfRechts={<NebenKnopfHolz onClick={onUmstellen} title="Das ganze Haus woanders hinstellen">Haus umstellen</NebenKnopfHolz>}
        >
            <div className="mt-3 flex flex-col items-stretch gap-3 md:flex-row">
                <Seite
                    titel="Rucksack"
                    hinweis={`${rucksackGesamt} Stück`}
                    gruppen={rucksack}
                    aktion={onEinlagern}
                    richtung="ein"
                    busy={busy}
                    stil="rucksack"
                    leerText={istVitrine ? "Keine Ernte im Rucksack." : "Du hast nichts dabei."}
                />
                {/* Alles-Knöpfe in der Mitte: 100 Stück einzeln anzuklicken ist keine
                    Bedienung. Der Server verschiebt, so viel jeweils hineinpasst. */}
                <div className="flex shrink-0 items-center justify-center gap-2 md:flex-col">
                    <MitteKnopf onClick={onAllesEin} disabled={busy || rucksackGesamt === 0 || voll}
                        title={voll ? `${istVitrine ? "Vitrine" : "Kiste"} ist voll` : "Alles einlagern"} />
                    <MitteKnopf onClick={onAllesAus} disabled={busy || inhalt.length === 0} title="Alles herausholen" umgedreht />
                </div>
                <Seite
                    titel={istVitrine ? "Vitrine" : "Kiste"}
                    hinweis={`${inhalt.length} / ${max}`}
                    gruppen={inhaltGruppen}
                    aktion={onAuslagern}
                    richtung="aus"
                    busy={busy}
                    stil={istVitrine ? "vitrine" : "kiste"}
                    leerText={istVitrine ? "Noch nichts ausgestellt." : "Die Kiste ist leer."}
                />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-[#e8d7a8]">
                {istVitrine
                    ? "Größe, Sonderform und Wetter-Effekt bleiben erhalten — ausgestellt ist genau das, was du geerntet hast."
                    : "Zum Verkaufen musst du die Ernte erst wieder in den Rucksack legen; der Markt nimmt nur, was du dabeihast."}
            </p>
        </StandFenster>
    );
}

/** Fremde Vitrine: reine Auskunft, kein Zugriff — derselbe Glasschrank, nur ohne Rucksack. */
export function FremdeVitrineModal({ owner, items, onClose }) {
    const s = STIL.vitrine;
    return (
        <StandFenster
            titel={`Vitrine von ${owner || "unbekannt"}`}
            untertitel={items.length ? `${items.length} ausgestellte Stücke` : "Noch nichts ausgestellt"}
            farbe="blau"
            bild="/garden-assets/tools/vitrine.png"
            onClose={onClose}
        >
            <div className="mt-3 border-[4px] p-3" style={{ borderColor: "#6e4426", background: s.flaeche, boxShadow: `0 4px 0 0 ${HOLZ}` }}>
                {items.length === 0 ? (
                    <p className="py-8 text-center text-xs font-bold text-[#3b2516] opacity-75">Diese Vitrine steht noch leer.</p>
                ) : (
                    <div className="grid grid-cols-4 gap-1.5 gap-y-3 sm:grid-cols-6">
                        {items.map((item, i) => (
                            <div key={`${item.seedId}-${i}`} title={beschreibeErnte(item)}
                                className="relative flex aspect-square items-center justify-center border-[3px]"
                                style={{ background: s.fach, borderColor: s.fachRand, boxShadow: "inset 0 -4px 0 0 #a8743f" }}>
                                <SpecialItemIcon item={item} className="h-[70%] w-[70%]" emojiClassName="text-2xl" />
                                <span className="absolute left-0 top-0 h-2 w-2" style={{ background: SELTEN_FARBE[item.rarity] || SELTEN_FARBE.COMMON }} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </StandFenster>
    );
}
