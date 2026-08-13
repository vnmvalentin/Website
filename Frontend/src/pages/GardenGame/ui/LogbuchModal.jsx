// ui/LogbuchModal.jsx
// Nachschlagewerk über alles, was man je geerntet hat.
//
// AUFBAU
// Oben eine Kachel je Art. Ein Klick klappt darunter die Sammelliste dieser einen Art
// aus: sämtliche Ausprägungen, die es überhaupt zu farmen gibt — Größe 1 und Größe 50,
// die Sonderformen (Golden, Rainbow) und jeder Wetter-Effekt (Nass, Gefroren,
// Aufgeladen, Mondlicht), jeweils mit dem eingefärbten Bild der Frucht selbst.
// Vorher stand all das als eine gemeinsame Kette kleiner Textmarken hinter dem Namen;
// welche Ausprägungen es überhaupt gibt, war daran nicht abzulesen — nur welche man
// schon hatte.
//
// Gefüllt wird das Logbuch beim Ernten (logbuchEintragen in GameContainer.jsx) aus den
// Stücken, die der SERVER zurückmeldet — nicht aus dem, was der Client sich denkt.
import React, { useMemo, useState } from 'react';
import { Ruler, Search, ChevronDown, Check } from 'lucide-react';
import { GardenModal } from './gardenUi';
import { SpecialItemIcon } from './ItemIcon';
import { SEED_CATALOGUE, STATUS_EFFECT_LABELS, WEATHER_SELL_BOOST, hydrateHarvestedItem } from '../engine/PlantSystem';
import { RARITY_TEXT, RARITY_DOT } from './gardenTokens';

const RARITY_REIHENFOLGE = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/**
 * Alle Ausprägungen, die eine Art annehmen kann — die Liste ist für jede Frucht
 * dieselbe, deshalb steht sie hier einmal und nicht je Art im Logbuch.
 *
 * `treffer(eintrag)` beantwortet „schon gehabt?" aus dem Logbucheintrag:
 * Größen stehen dort als min/max, Sonderformen und Wetter in `effekte`.
 */
const GROESSEN_STUFEN = [
    {
        key: "size_min", label: "Größe 1", zusatz: "kleinstmöglich",
        treffer: (e) => e?.min === 1,
    },
    {
        key: "size_max", label: "Größe 50", zusatz: "größtmöglich",
        treffer: (e) => e?.max === 50,
    },
];

const SONDERFORMEN = [
    { key: "Golden", label: "Golden", zusatz: "2× Wert", special: "Golden" },
    { key: "Rainbow", label: "Rainbow", zusatz: "5× Wert", special: "Rainbow" },
];

const WETTER = ["wet", "frozen", "charged", "moonlit"].map((key) => ({
    key,
    label: STATUS_EFFECT_LABELS[key] || key,
    zusatz: `+${Math.round(((WEATHER_SELL_BOOST[key] || 1) - 1) * 100)} % Verkauf`,
    statusEffect: key,
}));

/** Wie viele der möglichen Ausprägungen dieser Art man schon hatte. */
const VARIANTEN_GESAMT = GROESSEN_STUFEN.length + SONDERFORMEN.length + WETTER.length;

function zaehleGefunden(eintrag) {
    if (!eintrag) return 0;
    const effekte = new Set(eintrag.effekte || []);
    return GROESSEN_STUFEN.filter((v) => v.treffer(eintrag)).length
        + SONDERFORMEN.filter((v) => effekte.has(v.key)).length
        + WETTER.filter((v) => effekte.has(v.key)).length;
}

/** Eine Ausprägung als Kachel: eingefärbtes Bild der Frucht + Beschriftung. */
function VariantenKachel({ frucht, variante, gefunden }) {
    return (
        <div
            className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-md border text-center ${
                gefunden ? "border-slate-700 bg-slate-900" : "border-slate-800 bg-slate-950"
            }`}
        >
            <div className={gefunden ? "" : "opacity-25 grayscale"}>
                <SpecialItemIcon
                    item={frucht}
                    special={variante.special ?? null}
                    statusEffect={variante.statusEffect ?? null}
                    className="w-10 h-10"
                    emojiClassName="text-2xl"
                />
            </div>
            <span className={`text-[11px] font-medium leading-tight ${gefunden ? "text-slate-200" : "text-slate-600"}`}>
                {variante.label}
            </span>
            <span className={`text-[10px] leading-tight ${gefunden ? "text-slate-500" : "text-slate-700"}`}>
                {variante.zusatz}
            </span>
            {gefunden && (
                <Check size={11} className="absolute top-1.5 right-1.5 text-emerald-500" />
            )}
        </div>
    );
}

function Abschnitt({ titel, children }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{titel}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">{children}</div>
        </div>
    );
}

/** Der ausgeklappte Teil einer Art. `frucht` trägt das Bild aus dem Katalog. */
function Sammelliste({ frucht, eintrag }) {
    const effekte = new Set(eintrag?.effekte || []);

    return (
        <div className="px-3 pb-3 pt-1 space-y-3 bg-slate-950/60 border-t border-slate-800">
            <Abschnitt titel="Größe">
                {GROESSEN_STUFEN.map((variante) => (
                    <VariantenKachel
                        key={variante.key}
                        frucht={frucht}
                        variante={variante}
                        gefunden={variante.treffer(eintrag)}
                    />
                ))}
                <div className="col-span-2 flex items-center px-3 py-2 rounded-md border border-slate-800 bg-slate-950">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                        <Ruler size={11} />
                        {eintrag
                            ? `Deine Spanne: ${eintrag.min} – ${eintrag.max}`
                            : "Noch keine Größe erfasst"}
                    </span>
                </div>
            </Abschnitt>

            <Abschnitt titel="Sonderformen">
                {SONDERFORMEN.map((variante) => (
                    <VariantenKachel
                        key={variante.key}
                        frucht={frucht}
                        variante={variante}
                        gefunden={effekte.has(variante.key)}
                    />
                ))}
            </Abschnitt>

            <Abschnitt titel="Wetter-Effekte">
                {WETTER.map((variante) => (
                    <VariantenKachel
                        key={variante.key}
                        frucht={frucht}
                        variante={variante}
                        gefunden={effekte.has(variante.key)}
                    />
                ))}
            </Abschnitt>
        </div>
    );
}

export default function LogbuchModal({ logbuch, onClose }) {
    const [nurGefunden, setNurGefunden] = useState(false);
    const [suche, setSuche] = useState("");
    const [offen, setOffen] = useState(null); // seedId der ausgeklappten Art

    // Das Bild der Frucht ist dasselbe, das auch im Rucksack steht — einmal je Art
    // abgeleitet und nicht bei jedem Tastendruck im Suchfeld neu.
    const fruechte = useMemo(() => {
        const map = {};
        for (const art of SEED_CATALOGUE) {
            map[art.id] = hydrateHarvestedItem({
                seedId: art.id, name: art.name, singleUse: art.singleUse, emoji: art.emoji,
            });
        }
        return map;
    }, []);

    const arten = useMemo(() => {
        const suchbegriff = suche.trim().toLowerCase();
        return SEED_CATALOGUE
            .map((art) => ({ art, eintrag: logbuch?.[art.id] || null }))
            .filter(({ art, eintrag }) => {
                if (nurGefunden && !eintrag) return false;
                if (!suchbegriff) return true;
                return String(art.name || art.id).toLowerCase().includes(suchbegriff);
            })
            .sort((a, b) => {
                const ra = RARITY_REIHENFOLGE.indexOf(a.art.rarity) - RARITY_REIHENFOLGE.indexOf(b.art.rarity);
                if (ra !== 0) return ra;
                return String(a.art.name).localeCompare(String(b.art.name), "de");
            });
    }, [logbuch, nurGefunden, suche]);

    const gesamtBekannt = SEED_CATALOGUE.filter((a) => logbuch?.[a.id]).length;

    return (
        <GardenModal
            title="Logbuch"
            subtitle={`${gesamtBekannt} von ${SEED_CATALOGUE.length} Arten geerntet`}
            onClose={onClose}
            width="max-w-2xl"
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-0">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input
                        value={suche}
                        onChange={(e) => setSuche(e.target.value)}
                        placeholder="Art suchen"
                        className="w-full pl-8 pr-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setNurGefunden((v) => !v)}
                    className={`shrink-0 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                        nurGefunden
                            ? "border-violet-600 bg-violet-600/20 text-violet-200"
                            : "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                >
                    Nur geerntete
                </button>
            </div>

            {arten.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-10">Nichts gefunden.</div>
            ) : (
                <div className="rounded-md border border-slate-700 bg-slate-950 divide-y divide-slate-800">
                    {arten.map(({ art, eintrag }) => {
                        const istOffen = offen === art.id;
                        const gefunden = zaehleGefunden(eintrag);
                        return (
                            <div key={art.id}>
                                <button
                                    type="button"
                                    onClick={() => setOffen(istOffen ? null : art.id)}
                                    aria-expanded={istOffen}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                        istOffen ? "bg-slate-900" : "hover:bg-slate-900/60"
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${RARITY_DOT[art.rarity] || RARITY_DOT.COMMON}`} />
                                    <span className={eintrag ? "shrink-0" : "shrink-0 opacity-30 grayscale"}>
                                        <SpecialItemIcon item={fruechte[art.id]} className="w-7 h-7" emojiClassName="text-xl" />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-xs font-medium text-slate-200 truncate">
                                            {art.name}
                                            <span className={`ml-2 text-[10px] font-normal ${RARITY_TEXT[art.rarity] || RARITY_TEXT.COMMON}`}>
                                                {art.rarity}
                                            </span>
                                        </span>
                                        <span className="block text-[11px] text-slate-500 tabular-nums mt-0.5">
                                            {eintrag
                                                ? `${gefunden} von ${VARIANTEN_GESAMT} Ausprägungen · ${eintrag.anzahl}× geerntet`
                                                : "noch nie geerntet"}
                                        </span>
                                    </span>
                                    <ChevronDown
                                        size={14}
                                        className={`shrink-0 text-slate-500 transition-transform ${istOffen ? "rotate-180" : ""}`}
                                    />
                                </button>
                                {istOffen && <Sammelliste frucht={fruechte[art.id]} eintrag={eintrag} />}
                            </div>
                        );
                    })}
                </div>
            )}
            <p className="text-[10px] text-slate-600 leading-relaxed mt-3">
                Eingetragen wird beim Ernten. Größe reicht von 1 bis 50; Golden und Rainbow sind
                Sonderformen, alles Übrige sind Wetter-Effekte, die beim Verkauf zusätzlich zählen.
            </p>
        </GardenModal>
    );
}
