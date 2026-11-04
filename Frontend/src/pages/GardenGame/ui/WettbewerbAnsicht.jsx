// ui/WettbewerbAnsicht.jsx — Reiter „Wettbewerb" im Missionsbrett: Rekord-Ernte der Woche
// (Backend garden/world/wettbewerb.js). Sorte der Woche, Restzeit, Preise, Top 10 mit
// eigenem Platz, Sieger der Vorwoche und eigene Siege. Lädt seine Daten selbst, sobald
// der Reiter offen ist — die Rangliste ändert sich mit jeder Ernte aller Spieler.
import React, { useEffect, useState } from "react";
import { Abschnitt, FensterZeile, LeerHinweis } from "./gardenUi";
import { ItemIcon } from "./ItemIcon";
import { formatGold } from "./gardenTokens";
import { formatGroesse } from "./groesse";
import { SEED_CATALOGUE, hydrateHarvestedItem } from "../engine/PlantSystem";

const NAME = new Map(SEED_CATALOGUE.map((s) => [s.id, s.name]));
const PLATZ_FARBE = { 1: "text-amber-300", 2: "text-slate-200", 3: "text-orange-300" };

function restzeit(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return t > 0 ? `${t} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

export default function WettbewerbAnsicht({ laden }) {
    const [daten, setDaten] = useState(null);
    const [fehler, setFehler] = useState(false);

    useEffect(() => {
        let aus = false;
        const holen = () => laden()
            .then((d) => { if (!aus) { setDaten(d); setFehler(false); } })
            .catch(() => { if (!aus) setFehler(true); });
        holen();
        // Solange der Reiter offen ist, alle 20 s nachziehen — andere ernten mit.
        const t = setInterval(holen, 20000);
        return () => { aus = true; clearInterval(t); };
    }, [laden]);

    if (fehler && !daten) return <LeerHinweis>Wettbewerb konnte nicht geladen werden.</LeerHinweis>;
    if (!daten) return <LeerHinweis>Wettbewerb wird geladen…</LeerHinweis>;

    const sorteName = NAME.get(daten.sorte) || daten.sorte;
    const bild = hydrateHarvestedItem({ seedId: daten.sorte, name: sorteName });
    const siege = Array.isArray(daten.siege) ? daten.siege : [];

    return (
        <div className="space-y-3">
            <FensterZeile
                zustand="aktiv"
                bild={<ItemIcon item={bild} className="h-12 w-12" emojiClassName="text-3xl" />}
                titel={`Sorte der Woche: ${sorteName}`}
                text={`Wer das größte Stück erntet, gewinnt. Endet in ${restzeit(daten.ende - Date.now())}.`}
                wert={daten.meinRekord ? `Größe ${formatGroesse(daten.meinRekord)}` : null}
                unterWert={daten.meinRekord ? `dein Platz ${daten.meinPlatz} von ${daten.teilnehmer}` : null}
            />
            {!daten.meinRekord && (
                <p className="px-1 text-[11px] text-slate-400">
                    Pflanze {sorteName} und ernte sie — dein größtes Stück dieser Woche zählt. Größen gehen von 1,0 bis 100,0 — eine glatte 100 ist sehr selten. Größe ist Glückssache, jeder hat eine Chance.
                </p>
            )}

            <Abschnitt>Preise</Abschnitt>
            <div className="grid grid-cols-3 gap-1.5">
                {(daten.preise || []).map((p) => (
                    <div key={p.platz} className="rounded-2xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-center">
                        <div className={`text-xs font-bold ${PLATZ_FARBE[p.platz]}`}>{p.platz}. Platz</div>
                        <div className="text-sm font-semibold tabular-nums text-amber-400">{formatGold(p.gold)}</div>
                    </div>
                ))}
            </div>

            <Abschnitt>Rangliste diese Woche</Abschnitt>
            {daten.rangliste?.length ? (
                <ol className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/50">
                    {daten.rangliste.map((e, i) => (
                        <li key={`${e.name}-${i}`} className={`flex items-center gap-3 px-3 py-2 text-sm ${daten.meinPlatz === i + 1 ? "bg-emerald-950/30" : ""}`}>
                            <span className={`w-6 shrink-0 font-bold tabular-nums ${PLATZ_FARBE[i + 1] || "text-slate-500"}`}>{i + 1}.</span>
                            <span className="min-w-0 flex-1 truncate text-white">{e.name}{daten.meinPlatz === i + 1 ? " (du)" : ""}</span>
                            <span className="shrink-0 tabular-nums text-slate-300">Größe {formatGroesse(e.groesse)}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <LeerHinweis className="py-4">Noch hat diese Woche niemand {sorteName} geerntet.</LeerHinweis>
            )}

            {daten.letzteWoche?.sieger?.length > 0 && (
                <>
                    <Abschnitt>Letzte Woche: {NAME.get(daten.letzteWoche.sorte) || daten.letzteWoche.sorte}</Abschnitt>
                    <div className="space-y-1 px-1 text-xs text-slate-300">
                        {daten.letzteWoche.sieger.map((e, i) => (
                            <div key={i}><span className={`font-bold ${PLATZ_FARBE[i + 1]}`}>{i + 1}.</span> {e.name} · Größe {formatGroesse(e.groesse)}</div>
                        ))}
                    </div>
                </>
            )}

            {siege.length > 0 && (
                <>
                    <Abschnitt ton="selten">Deine Siege</Abschnitt>
                    <div className="flex flex-wrap gap-1.5 px-1">
                        {siege.slice(-12).reverse().map((s) => (
                            <span key={s.woche} className="rounded-md border border-amber-700/60 px-2 py-0.5 text-[11px] text-amber-200" title={`${NAME.get(s.sorte) || s.sorte}, Größe ${formatGroesse(s.groesse)}`}>
                                {s.platz}. Platz · {NAME.get(s.sorte) || s.sorte}
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
