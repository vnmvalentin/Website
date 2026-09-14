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
import { GardenModal, RarityLabel } from './gardenUi';
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

function Zeile({ item, aktion, richtung, busy }) {
    const wert = wertVon(item);
    return (
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 border-b border-slate-800 last:border-b-0">
            <SpecialItemIcon item={item} className="w-7 h-7 shrink-0" emojiClassName="text-xl" />
            <span className="flex-1 min-w-0">
                <span className="block text-xs text-slate-200 truncate">{beschreibe(item)}</span>
                <span className="flex items-center gap-2">
                    <RarityLabel rarity={item.rarity} />
                    {/* Der Verkaufswert stand bisher nur im Rucksack — eingelagert war
                        nicht mehr zu sehen, was ein Stück wert ist. */}
                    {wert > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 tabular-nums">
                            <HudIcon.gold size={10} />
                            {formatGold(wert)}
                        </span>
                    )}
                </span>
            </span>
            <button
                type="button"
                onClick={() => aktion(idVon(item))}
                disabled={busy}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 transition-colors"
                aria-label={richtung === "ein" ? "Einlagern" : "Herausnehmen"}
            >
                {/* move_one.png bringt seinen eigenen Pfeil schon mit (nach rechts/oben) —
                    fuers Herausnehmen einfach seitenverkehrt, statt ein zweites Bild
                    fuer die Gegenrichtung zu brauchen. */}
                <HudIcon.moveOne size={13} style={richtung === "ein" ? undefined : { transform: "scaleX(-1)" }} />
            </button>
        </div>
    );
}

/**
 * Eine Spalte mit Kategorie-Reitern. Bei nur einer Kategorie (Vitrine) entfallen sie —
 * ein einzelner Reiter ohne Auswahl wäre nur Zierrat.
 */
function Spalte({ titel, hinweis, gruppen, aktion, richtung, busy, leerText }) {
    const vorhanden = KATEGORIEN.filter((k) => (gruppen[k.key]?.length || 0) > 0);
    const [reiter, setReiter] = useState(null);
    // Der gewählte Reiter kann leerlaufen (alles eingelagert) — dann auf den ersten
    // noch gefüllten zurückfallen, statt eine leere Spalte zu zeigen.
    const aktiv = vorhanden.some((k) => k.key === reiter) ? reiter : (vorhanden[0]?.key ?? null);
    const items = aktiv ? (gruppen[aktiv] || []) : [];
    const gesamt = KATEGORIEN.reduce((n, k) => n + (gruppen[k.key]?.length || 0), 0);
    const gesamtwert = (gruppen.ernte || []).reduce((summe, i) => summe + wertVon(i), 0);

    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">{titel}</span>
                <span className="flex items-baseline gap-2">
                    {gesamtwert > 0 && (
                        <span className="text-[10px] font-semibold text-amber-400 tabular-nums">
                            {formatGold(gesamtwert)} Gold
                        </span>
                    )}
                    <span className="text-[10px] text-slate-600 tabular-nums">{hinweis}</span>
                </span>
            </div>

            {vorhanden.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                    {vorhanden.map((k) => (
                        <button
                            key={k.key}
                            type="button"
                            onClick={() => setReiter(k.key)}
                            className={`px-2 py-1 rounded-xl border text-[10px] font-medium transition-colors ${
                                aktiv === k.key
                                    ? "border-violet-600 bg-violet-600/20 text-violet-200"
                                    : "border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                            }`}
                        >
                            {k.label}
                            <span className="ml-1 tabular-nums text-slate-500">{gruppen[k.key].length}</span>
                        </button>
                    ))}
                </div>
            )}

            {gesamt === 0 ? (
                <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-2xl border border-slate-800 bg-slate-950">
                    {leerText}
                </p>
            ) : (
                <div
                    className="max-h-72 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950"
                    style={{ overscrollBehavior: "contain" }}
                >
                    {items.map((item) => (
                        <Zeile key={idVon(item)} item={item} aktion={aktion} richtung={richtung} busy={busy} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AblageModal({
    art, inhalt, rucksack, max, onClose, onBack, onEinlagern, onAuslagern, onAllesEin, onAllesAus, onUmstellen, busy,
}) {
    const istVitrine = art === "vitrine";
    const Symbol = istVitrine ? HudIcon.vitrine : HudIcon.kiste;

    // Der Kisteninhalt kommt als eine Liste und trägt seine Kategorie mit sich.
    const inhaltGruppen = useMemo(() => {
        const map = Object.fromEntries(KATEGORIEN.map((k) => [k.key, []]));
        for (const item of inhalt || []) map[kategorieVon(item)].push(item);
        return map;
    }, [inhalt]);

    const rucksackGesamt = KATEGORIEN.reduce((n, k) => n + (rucksack[k.key]?.length || 0), 0);
    const voll = inhalt.length >= max;

    return (
        <GardenModal
            title={istVitrine ? "Vitrine" : "Vorratskiste"}
            subtitle={istVitrine
                ? "Was hier steht, sehen alle in der Welt — sie können es ansehen, aber nicht anfassen"
                : "Lagerplatz für Ernte, Samen, Eier, Deko und Tiere. Was hier liegt, belegt keinen Rucksackplatz"}
            onClose={onClose}
            onBack={onBack}
            width="max-w-3xl"
            headerRight={
                <button
                    type="button"
                    onClick={onUmstellen}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                    <HudIcon.reposition size={13} /> Umstellen
                </button>
            }
        >
            <div className="flex gap-4">
                <Spalte
                    titel="Rucksack"
                    hinweis={`${rucksackGesamt} Stück`}
                    gruppen={rucksack}
                    aktion={onEinlagern}
                    richtung="ein"
                    busy={busy}
                    leerText={istVitrine ? "Keine Ernte im Rucksack." : "Du hast nichts dabei."}
                />

                {/* Alles-Knöpfe in der Mitte: 100 Stück einzeln anzuklicken ist keine
                    Bedienung. Der Server verschiebt, so viel jeweils hineinpasst. */}
                <div className="flex flex-col items-center justify-center gap-2 shrink-0 pt-6">
                    <button
                        type="button"
                        onClick={onAllesEin}
                        disabled={busy || rucksackGesamt === 0 || voll}
                        title={voll ? `${istVitrine ? "Vitrine" : "Kiste"} ist voll` : "Alles einlagern"}
                        aria-label="Alles einlagern"
                        className="w-9 h-9 flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors"
                    >
                        <HudIcon.moveAll size={16} />
                    </button>
                    <Symbol size={16} className="text-slate-700" />
                    <button
                        type="button"
                        onClick={onAllesAus}
                        disabled={busy || inhalt.length === 0}
                        title="Alles herausholen"
                        aria-label="Alles herausholen"
                        className="w-9 h-9 flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors"
                    >
                        <HudIcon.moveAll size={16} style={{ transform: "scaleX(-1)" }} />
                    </button>
                </div>

                <Spalte
                    titel={istVitrine ? "Vitrine" : "Kiste"}
                    hinweis={`${inhalt.length} / ${max}`}
                    gruppen={inhaltGruppen}
                    aktion={onAuslagern}
                    richtung="aus"
                    busy={busy}
                    leerText={istVitrine ? "Noch nichts ausgestellt." : "Die Kiste ist leer."}
                />
            </div>
            <p className="text-[10px] text-slate-600 leading-relaxed mt-4">
                {istVitrine
                    ? "Größe, Sonderform und Wetter-Effekt bleiben erhalten — ausgestellte Stücke sind genau die, die du geerntet hast."
                    : "Zum Verkaufen musst du die Ernte erst wieder in den Rucksack legen; der Markt nimmt nur, was du dabeihast."}
            </p>
        </GardenModal>
    );
}

/** Fremde Vitrine: reine Auskunft, kein Zugriff. */
export function FremdeVitrineModal({ owner, items, onClose }) {
    return (
        <GardenModal
            title={`Vitrine von ${owner || "unbekannt"}`}
            subtitle={items.length ? `${items.length} ausgestellte Stücke` : "Noch nichts ausgestellt"}
            onClose={onClose}
            width="max-w-lg"
        >
            {items.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-10">
                    Diese Vitrine steht noch leer.
                </div>
            ) : (
                <div className="space-y-1.5">
                    {items.map((item, i) => (
                        <div
                            key={`${item.seedId}-${i}`}
                            className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 flex items-center gap-3"
                        >
                            <SpecialItemIcon item={item} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{beschreibeErnte(item)}</div>
                                <RarityLabel rarity={item.rarity} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </GardenModal>
    );
}
