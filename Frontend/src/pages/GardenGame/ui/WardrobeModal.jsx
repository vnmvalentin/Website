// ui/WardrobeModal.jsx
// Die Umkleide: Fellfarbe der Katze und ihre Kostüme.
//
// Die Kostüme hängen am Level aus dem Fähigkeitsbaum — derselben Erfahrung, die
// auch die Fähigkeitspunkte gibt. Gesperrte werden BEWUSST gezeigt (verdunkelt,
// mit ihrer Levelangabe) statt versteckt: ein Ziel, das man nicht sieht, ist kein
// Ziel.
//
// Feedback 30.08.: die alten, levelfreien "Outfits" (Zauberer/König/Ente) und
// die personengebundenen "Exklusiv"-Skins (Admin, ein alter "Katzengeist" für
// eine einzelne Twitch-ID) sind entfallen — siehe wardrobe.js. Die neue
// Katzen-Lieferung deckt beides sauberer ab: zwölf Fellfarben für alle, zehn
// echte Level-Kostüme statt einer Sonderform ohne Ziel.

import React from 'react';
import { Sparkles } from 'lucide-react';
import { HudIcon } from './gameIcons';
import { GardenModal, PrimaryButton } from './gardenUi';
import {
    FARMER_FARBEN, KOSTUEME, farmerPfad, skinPfad,
    normalisiereSkin, naechstesKostuem,
} from './wardrobe';

/**
 * Fellfarbe der Katze — zeigt jetzt ein kleines Bild der Katze in dieser Farbe/
 * Musterung statt einer CSS-Fläche (Feedback 30.08.: zwölf fertige Katzenbilder
 * statt eines Hex-Werts je Farbe).
 */
function Farbknopf({ eintrag, aktiv, onWaehlen }) {
    const pfad = farmerPfad(eintrag.id);
    return (
        <button
            type="button"
            title={eintrag.name}
            aria-label={eintrag.name}
            aria-pressed={aktiv}
            onClick={() => onWaehlen(pfad)}
            className={`relative h-14 w-14 overflow-hidden rounded-2xl border-2 bg-slate-950 transition-colors ${
                aktiv ? "border-violet-400" : "border-slate-700 hover:border-slate-500"
            }`}
        >
            <img src={pfad} alt="" draggable={false} className="h-full w-full object-contain object-bottom" />
            {aktiv && (
                <HudIcon.check
                    size={16}
                    className="absolute right-0.5 top-0.5"
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}
                />
            )}
        </button>
    );
}

/** Kachel für ein Outfit oder einen Geist. */
function SkinKachel({ eintrag, pfad, aktiv, offen, onWaehlen }) {
    return (
        <button
            type="button"
            disabled={!offen}
            onClick={() => offen && onWaehlen(pfad)}
            title={offen ? eintrag.name : `${eintrag.name} — ab Level ${eintrag.ab}`}
            className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 transition-colors ${
                aktiv ? "border-violet-500 bg-slate-800"
                    : offen ? "border-slate-800 bg-slate-900/50 hover:border-slate-600"
                        : "cursor-default border-slate-800/60 bg-slate-950/60"
            }`}
        >
            <img
                src={pfad}
                alt=""
                draggable={false}
                className={`h-12 w-12 object-contain ${offen ? "" : "opacity-25 grayscale"}`}
            />
            <span className={`text-center text-[11px] leading-tight ${
                aktiv ? "text-white" : offen ? "text-slate-400" : "text-slate-600"
            }`}>
                {eintrag.name}
            </span>
            {!offen && (
                <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-xl bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                    <HudIcon.locked size={9} /> {eintrag.ab}
                </span>
            )}
        </button>
    );
}

function Abschnitt({ icon: Icon, titel, hinweis, children }) {
    return (
        <section className="mb-4 last:mb-0">
            <div className="mb-2 flex items-baseline gap-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    <Icon size={12} /> {titel}
                </h3>
                {hinweis && <span className="text-[11px] text-slate-500">{hinweis}</span>}
            </div>
            {children}
        </section>
    );
}

export default function WardrobeModal({ offen, onClose, onBack, aktuellerSkin, level, onWaehlen }) {
    if (!offen) return null;

    const aktiv = normalisiereSkin(aktuellerSkin);
    const stufe = Math.max(1, Number(level) || 1);
    const naechster = naechstesKostuem(stufe);
    const freigeschaltet = KOSTUEME.filter((k) => stufe >= k.ab).length;

    return (
        <GardenModal
            title="Umkleide"
            subtitle={`Level ${stufe} · ${freigeschaltet} von ${KOSTUEME.length} Kostümen frei`}
            onClose={onClose}
            onBack={onBack}
            width="max-w-lg"
            footer={
                <PrimaryButton onClick={onClose} className="w-full py-2.5">
                    Fertig
                </PrimaryButton>
            }
        >
            <Abschnitt icon={HudIcon.palette} titel="Fellfarbe" hinweis="jederzeit wechselbar">
                <div className="flex flex-wrap gap-2">
                    {FARMER_FARBEN.map((f) => (
                        <Farbknopf
                            key={f.id}
                            eintrag={f}
                            aktiv={aktiv === farmerPfad(f.id)}
                            onWaehlen={onWaehlen}
                        />
                    ))}
                </div>
            </Abschnitt>

            <Abschnitt
                icon={Sparkles}
                titel="Kostüme"
                hinweis={naechster ? `nächstes ab Level ${naechster.ab}` : "alle freigeschaltet"}
            >
                <div className="grid grid-cols-4 gap-2">
                    {KOSTUEME.map((k) => (
                        <SkinKachel
                            key={k.id}
                            eintrag={k}
                            pfad={skinPfad(k.id)}
                            aktiv={aktiv === skinPfad(k.id)}
                            offen={stufe >= k.ab}
                            onWaehlen={onWaehlen}
                        />
                    ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Kostüme schalten sich über dein Level frei — dieselbe Erfahrung, die dir
                    auch die Fähigkeitspunkte bringt. Erfahrung gibt es für jede Ernte,
                    seltenere Pflanzen bringen mehr.
                </p>
            </Abschnitt>
        </GardenModal>
    );
}
