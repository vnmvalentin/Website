// ui/LogbuchModal.jsx
// Nachschlagewerk über alles, was man je geerntet hat.
//
// ── v2 (Neuzeichnung, Feedback 29.08.) ──────────────────────────────────────
// VORHER: eine Liste mit einer Zeile je Art — Name, Seltenheit, Zähler, alles
// als Text. Das Bild stand nur klein am Rand, kaum größer als ein Icon in
// einer Werkzeugleiste. Für ein SAMMEL-Logbuch (der ganze Witz ist "was habe
// ich schon, was fehlt noch") ist Text die falsche erste Ebene — man will das
// SEHEN, nicht lesen.
//
// JETZT: eine Galerie. Die Hauptansicht zeigt NUR das Bild jeder Art als
// Kachel (eingefärbt, wenn schon geerntet — grau/blass, wenn nicht), keine
// Zeile Text daneben. Ein Klick auf eine Kachel wechselt in die Detailansicht
// GENAU dieser Art: dort erst stehen Name, Seltenheit und die Sammelliste
// aller Ausprägungen (Größe 1/50, Golden, Rainbow, jeder Wetter-Effekt) —
// unverändert aus der letzten Fassung übernommen, das Konzept "jede
// Ausprägung als eigenes eingefärbtes Bild, grau wenn noch nicht erreicht"
// war schon richtig, es stand nur hinter zu viel Text auf der ersten Ebene.
//
// Gefüllt wird das Logbuch beim Ernten (logbuchUebernehmen in
// GameContainer.jsx) aus den Stücken, die der SERVER zurückmeldet — nicht aus
// dem, was der Client sich denkt.
import React, { useMemo, useState } from 'react';
import { HudIcon } from './gameIcons';
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
            className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-2xl border text-center ${
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
                <HudIcon.check size={11} className="absolute top-1.5 right-1.5" />
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

/**
 * Bild-Kachel der Hauptansicht — NUR das Bild, sonst nichts. Name und
 * Seltenheit stehen erst in der Detailansicht (siehe Feedback: "Hauptliste
 * soll nur das Fruchtbild zeigen"). Ein kleiner Punkt in der Ecke ersetzt die
 * frühere Textzeile für den einen Fall, der auf einen Blick zählt: komplett
 * (Gold schon kassiert) oder wenigstens einmal geerntet.
 */
function ArtKachel({ art, frucht, eintrag, onOeffnen }) {
    const gefunden = zaehleGefunden(eintrag);
    const komplett = gefunden === VARIANTEN_GESAMT;
    return (
        <button
            type="button"
            onClick={onOeffnen}
            title={`${art.name}${eintrag ? ` — ${gefunden}/${VARIANTEN_GESAMT} Ausprägungen` : " — noch nie geerntet"}`}
            className={`relative aspect-square flex items-center justify-center rounded-2xl border transition-colors ${
                eintrag ? "border-slate-700 bg-slate-900 hover:border-slate-500" : "border-slate-800 bg-slate-950 hover:border-slate-700"
            }`}
        >
            <span className={eintrag ? "" : "opacity-25 grayscale"}>
                <SpecialItemIcon item={frucht} className="w-10 h-10" emojiClassName="text-2xl" />
            </span>
            <span className={`absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full ${RARITY_DOT[art.rarity] || RARITY_DOT.COMMON}`} />
            {komplett && <HudIcon.gold size={12} className="absolute top-1 right-1" />}
        </button>
    );
}

/** Detailansicht EINER Art — Name, Seltenheit, Zähler, dann die Sammelliste. */
function ArtDetail({ art, frucht, eintrag, onZurueck }) {
    const effekte = new Set(eintrag?.effekte || []);
    const gefunden = zaehleGefunden(eintrag);

    return (
        <div>
            <button
                type="button"
                onClick={onZurueck}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors mb-3"
            >
                <HudIcon.back size={14} /> Zur Übersicht
            </button>

            <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl border border-slate-800 bg-slate-900/60">
                <span className={eintrag ? "shrink-0" : "shrink-0 opacity-25 grayscale"}>
                    <SpecialItemIcon item={frucht} className="w-12 h-12" emojiClassName="text-3xl" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">{art.name}</span>
                        <span className={`text-[10px] font-medium ${RARITY_TEXT[art.rarity] || RARITY_TEXT.COMMON}`}>
                            {art.rarity}
                        </span>
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {eintrag
                            ? `${gefunden} von ${VARIANTEN_GESAMT} Ausprägungen · ${eintrag.anzahl}× geerntet`
                            : "Noch nie geerntet"}
                    </div>
                </div>
                {gefunden === VARIANTEN_GESAMT && (
                    <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-amber-400">
                        <HudIcon.gold size={13} /> komplett
                    </span>
                )}
            </div>

            <div className="space-y-3">
                <Abschnitt titel="Größe">
                    {GROESSEN_STUFEN.map((variante) => (
                        <VariantenKachel
                            key={variante.key}
                            frucht={frucht}
                            variante={variante}
                            gefunden={variante.treffer(eintrag)}
                        />
                    ))}
                    <div className="col-span-2 flex items-center px-3 py-2 rounded-2xl border border-slate-800 bg-slate-950">
                        <span className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                            <HudIcon.ruler size={11} />
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
        </div>
    );
}

export default function LogbuchModal({ logbuch, onClose, onBack }) {
    const [nurGefunden, setNurGefunden] = useState(false);
    const [suche, setSuche] = useState("");
    const [offen, setOffen] = useState(null); // seedId der Art in der Detailansicht

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
    const offeneArt = offen ? SEED_CATALOGUE.find((a) => a.id === offen) : null;

    return (
        <GardenModal
            title="Logbuch"
            subtitle={offeneArt ? offeneArt.name : `${gesamtBekannt} von ${SEED_CATALOGUE.length} Arten geerntet`}
            onClose={onClose}
            onBack={onBack}
            width="max-w-2xl"
        >
            {offeneArt ? (
                <ArtDetail
                    art={offeneArt}
                    frucht={fruechte[offeneArt.id]}
                    eintrag={logbuch?.[offeneArt.id] || null}
                    onZurueck={() => setOffen(null)}
                />
            ) : (
                <>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1 min-w-0">
                            <HudIcon.search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                value={suche}
                                onChange={(e) => setSuche(e.target.value)}
                                placeholder="Art suchen"
                                className="w-full pl-8 pr-3 py-2 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setNurGefunden((v) => !v)}
                            className={`shrink-0 px-3 py-2 rounded-2xl border text-xs font-medium transition-colors ${
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
                        <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                            {arten.map(({ art, eintrag }) => (
                                <ArtKachel
                                    key={art.id}
                                    art={art}
                                    frucht={fruechte[art.id]}
                                    eintrag={eintrag}
                                    onOeffnen={() => setOffen(art.id)}
                                />
                            ))}
                        </div>
                    )}
                    <p className="text-[10px] text-slate-600 leading-relaxed mt-3">
                        Eingetragen wird beim Ernten. Klick auf eine Frucht zeigt ihre Ausprägungen —
                        Größe 1 bis 50, die Sonderformen Golden und Rainbow, und jeden Wetter-Effekt,
                        der beim Verkauf zusätzlich zählt. Eine Art mit allen {VARIANTEN_GESAMT}{" "}
                        Ausprägungen zahlt einmalig Gold aus — sind alle {SEED_CATALOGUE.length} Arten
                        komplett, kommt obendrauf ein großer Gesamtbonus.
                    </p>
                </>
            )}
        </GardenModal>
    );
}
