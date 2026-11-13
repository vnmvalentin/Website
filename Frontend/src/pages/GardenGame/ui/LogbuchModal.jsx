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
import { StandFenster } from './laden/Marktstand';
import { SpecialItemIcon } from './ItemIcon';
import { SEED_CATALOGUE, STATUS_EFFECT_LABELS, WEATHER_SELL_BOOST, hydrateHarvestedItem } from '../engine/PlantSystem';
import { RARITY_TEXT, RARITY_DOT } from './gardenTokens';
import { istEntdeckt, elternStand, ELTERN_AUFDECKEN_AB } from './zuchtbuch';
import { groesseVon, formatGroesse } from './groesse';

const NAME_NACH_ID = new Map(SEED_CATALOGUE.map((s) => [s.id, s.name]));
// Kreuzungen sind Extra-Seiten: sie zählen nicht zum Gesamtbonus (core/economy.js,
// logbuchAktualisieren) — die Zahl im Hinweistext muss dasselbe sagen.
const LADENSORTEN = SEED_CATALOGUE.filter((s) => !s.kreuzung).length;

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
        key: "size_min", label: "Winzling", zusatz: "unter Größe 2",
        treffer: (e) => e?.min === 1,
    },
    {
        key: "size_max", label: "Riese", zusatz: "ab Größe 99",
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
            className={`relative flex flex-col items-center gap-1 px-2 py-2.5 border-[3px] text-center ${
                gefunden ? "border-[#3b2516] bg-[#fffaf0]" : "border-[#c9b48a] bg-[#e8d7a8]"
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
            <span className={`text-[11px] font-medium leading-tight ${gefunden ? "text-[#3b2516]" : "text-[#8a7a5a]"}`}>
                {variante.label}
            </span>
            <span className={`text-[10px] leading-tight ${gefunden ? "text-[#6e4426]" : "text-[#a8967e]"}`}>
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
            <div className="mb-2 inline-block border-[3px] border-[#3b2516] bg-[#c99258] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#3b2516]">{titel}</div>
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
function ArtKachel({ art, frucht, eintrag, onOeffnen, verborgen = false }) {
    const gefunden = zaehleGefunden(eintrag);
    const komplett = gefunden === VARIANTEN_GESAMT;
    return (
        <button
            type="button"
            onClick={onOeffnen}
            title={verborgen ? "Unentdeckte Kreuzung" : `${art.name}${eintrag ? ` — ${gefunden}/${VARIANTEN_GESAMT} Ausprägungen` : " — noch nie geerntet"}`}
            className={`relative aspect-square flex items-center justify-center border-[3px] transition-colors ${
                eintrag ? "border-[#3b2516] bg-[#fffaf0] hover:-translate-y-0.5" : "border-[#c9b48a] bg-[#e8d7a8] hover:-translate-y-0.5"
            }`}
        >
            {/* Unentdeckte Kreuzung (ui/zuchtbuch.js): nur der schwarze Umriss. */}
            <span className={verborgen ? "brightness-0 opacity-50" : eintrag ? "" : "opacity-25 grayscale"}>
                <SpecialItemIcon item={frucht} className="w-10 h-10" emojiClassName="text-2xl" />
            </span>
            {verborgen && <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#3b2516]">?</span>}
            <span className={`absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full ${RARITY_DOT[art.rarity] || RARITY_DOT.COMMON}`} />
            {art.kreuzung && (
                <span className="absolute top-0.5 left-1.5 text-[11px] font-bold text-[#2f6b2c]" title="Kreuzung">×</span>
            )}
            {komplett && <HudIcon.gold size={12} className="absolute top-1 right-1" />}
        </button>
    );
}

/** Detailansicht EINER Art — Name, Seltenheit, Zähler, dann die Sammelliste. */
function ArtDetail({ art, frucht, eintrag, onZurueck, verborgen = false, logbuch }) {
    const effekte = new Set(eintrag?.effekte || []);
    const gefunden = zaehleGefunden(eintrag);

    return (
        <div>
            <button
                type="button"
                onClick={onZurueck}
                className="flex items-center gap-1 text-xs text-[#6e4426] hover:text-black transition-colors mb-3"
            >
                <HudIcon.back size={14} /> Zur Übersicht
            </button>

            <div className="flex items-center gap-3 mb-4 p-3 border-[3px] border-[#3b2516] bg-[#fffaf0] shadow-[0_3px_0_0_#3b2516]">
                <span className={verborgen ? "shrink-0 brightness-0 opacity-50" : eintrag ? "shrink-0" : "shrink-0 opacity-25 grayscale"}>
                    <SpecialItemIcon item={frucht} className="w-12 h-12" emojiClassName="text-3xl" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#3b2516] truncate">{verborgen ? "???" : art.name}</span>
                        <span className={`text-[10px] font-medium ${RARITY_TEXT[art.rarity] || RARITY_TEXT.COMMON}`}>
                            {art.rarity}
                        </span>
                    </div>
                    <div className="text-[11px] text-[#6e4426] tabular-nums mt-0.5">
                        {eintrag
                            ? `${gefunden} von ${VARIANTEN_GESAMT} Ausprägungen · ${eintrag.anzahl}× geerntet`
                            : "Noch nie geerntet"}
                    </div>
                    {/* Kreuzung (core/kreuzung.js): entdeckt → volles Rezept. Unentdeckt →
                        je Elternteil Name (wenn oft genug geerntet) oder ein Hinweis — siehe
                        ui/zuchtbuch.js (Zuchtbuch, 04.11.). */}
                    {art.kreuzung && Array.isArray(art.eltern) && !verborgen && (
                        <div className="text-[11px] text-[#2f6b2c] mt-1">
                            Kreuzung aus {art.eltern.map((id) => NAME_NACH_ID.get(id) || id).join(" × ")} — pflanze beide direkt nebeneinander und ernte.
                        </div>
                    )}
                    {art.kreuzung && verborgen && (
                        <div className="mt-1.5 space-y-0.5 text-[11px]">
                            <div className="text-[#2f6b2c]">Unentdeckte Kreuzung aus zwei Sorten:</div>
                            {elternStand(art, logbuch).map((e, i) => (
                                <div key={i} className="text-[#3b2516]">
                                    {e.aufgedeckt ? <span className="font-semibold text-[#3b2516]">{e.name}</span> : <span className="text-[#6e4426]">{e.hinweis}</span>}
                                </div>
                            ))}
                            <div className="text-[#6e4426]">
                                Eine Elternsorte zeigt sich, wenn du sie {ELTERN_AUFDECKEN_AB}× geerntet hast. Pflanze beide nebeneinander und ernte — mit etwas Glück entsteht die Kreuzung.
                            </div>
                        </div>
                    )}
                </div>
                {gefunden === VARIANTEN_GESAMT && (
                    <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#a87414]">
                        <HudIcon.gold size={13} /> komplett
                    </span>
                )}
            </div>

            {/* Unentdeckt: keine Ausprägungs-Kacheln — die zeigten das echte Bild. */}
            {!verborgen && (
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
                    <div className="col-span-2 flex items-center px-3 py-2 border-[3px] border-[#c9b48a] bg-[#e8d7a8]">
                        <span className="flex items-center gap-1.5 text-[11px] text-[#6e4426] tabular-nums">
                            <HudIcon.ruler size={11} />
                            {eintrag
                                ? `Deine Spanne: ${formatGroesse(Number.isFinite(eintrag.gMin) ? eintrag.gMin : groesseVon({ size: eintrag.min }))} – ${formatGroesse(Number.isFinite(eintrag.gMax) ? eintrag.gMax : groesseVon({ size: eintrag.max }))}`
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
            )}
        </div>
    );
}

export default function LogbuchModal({ logbuch, zuchtbuch, inventory, onClose, onBack }) {
    const verborgen = (art) => !istEntdeckt(art, { zuchtbuch, logbuch, inventory });
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
                // Unentdeckte Kreuzungen heißen auch für die Suche „???" — sonst
                // verriete das Suchfeld den Namen.
                const name = verborgen(art) ? "???" : String(art.name || art.id);
                return name.toLowerCase().includes(suchbegriff);
            })
            .sort((a, b) => {
                const ra = RARITY_REIHENFOLGE.indexOf(a.art.rarity) - RARITY_REIHENFOLGE.indexOf(b.art.rarity);
                if (ra !== 0) return ra;
                return String(a.art.name).localeCompare(String(b.art.name), "de");
            });
    }, [logbuch, nurGefunden, suche, zuchtbuch, inventory]);

    const gesamtBekannt = SEED_CATALOGUE.filter((a) => logbuch?.[a.id]).length;
    const offeneArt = offen ? SEED_CATALOGUE.find((a) => a.id === offen) : null;

    return (
        <StandFenster
            titel="Logbuch"
            untertitel={offeneArt ? (verborgen(offeneArt) ? "Unentdeckte Kreuzung" : offeneArt.name) : `${gesamtBekannt} von ${SEED_CATALOGUE.length} Arten geerntet`}
            markise={false}
            breite="max-w-3xl"
            bild="/garden-assets/icons/hud/logbuch_pixel.png"
            onClose={onClose}
            onBack={onBack}
            inhaltHintergrund="repeating-linear-gradient(0deg, #f3e3c3 0 23px, #e3cfa8 23px 24px)"
        >
            {offeneArt ? (
                <ArtDetail
                    art={offeneArt}
                    frucht={fruechte[offeneArt.id]}
                    eintrag={logbuch?.[offeneArt.id] || null}
                    onZurueck={() => setOffen(null)}
                    verborgen={verborgen(offeneArt)}
                    logbuch={logbuch}
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
                                className="w-full border-[3px] border-[#3b2516] bg-[#fffaf0] py-2 pl-8 pr-3 text-sm text-[#3b2516] placeholder:text-[#a8967e] focus:bg-white focus:outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setNurGefunden((v) => !v)}
                            className={`shrink-0 px-3 py-2 border-[3px] text-xs font-medium transition-colors ${
                                nurGefunden
                                    ? "border-[#3b2516] bg-[#ffe066] text-[#3b2516]"
                                    : "border-[#3b2516] bg-[#fffaf0] text-[#6e4426] hover:bg-[#fff3c4]"
                            }`}
                        >
                            Nur geerntete
                        </button>
                    </div>

                    {arten.length === 0 ? (
                        <p className="py-8 text-center text-sm font-bold text-[#6e4426]">Nichts gefunden.</p>
                    ) : (
                        <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                            {arten.map(({ art, eintrag }) => (
                                <ArtKachel
                                    key={art.id}
                                    art={art}
                                    frucht={fruechte[art.id]}
                                    eintrag={eintrag}
                                    onOeffnen={() => setOffen(art.id)}
                                    verborgen={verborgen(art)}
                                />
                            ))}
                        </div>
                    )}
                    <p className="text-[10px] text-[#8a7a5a] leading-relaxed mt-3">
                        Eingetragen wird beim Ernten. Klick auf eine Frucht zeigt ihre Ausprägungen —
                        einen Winzling und einen Riesen, die Sonderformen Golden und Rainbow, und jeden Wetter-Effekt,
                        der beim Verkauf zusätzlich zählt. Eine Art mit allen {VARIANTEN_GESAMT}{" "}
                        Ausprägungen zahlt einmalig Gold aus — sind alle {LADENSORTEN} Ladensorten
                        komplett, kommt obendrauf ein großer Gesamtbonus. Kreuzungen sind Extra-Seiten:
                        sie entstehen, wenn zwei passende Sorten direkt nebeneinander stehen.
                    </p>
                </>
            )}
        </StandFenster>
    );
}
