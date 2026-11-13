// ui/WettbewerbAnsicht.jsx — Reiter „Wettbewerb" im Missionsbrett: Rekord-Ernte der Woche
// (Backend garden/world/wettbewerb.js). Sorte der Woche, Restzeit, Preise, Top 10 mit
// eigenem Platz, Sieger der Vorwoche und eigene Siege. Lädt seine Daten selbst, sobald
// der Reiter offen ist — die Rangliste ändert sich mit jeder Ernte aller Spieler.
// 06.11.: im Marktstand-Look (laden/Marktstand.jsx): Aushang, Siegertreppchen, Rangliste.
import React, { useEffect, useState } from "react";
import { ItemIcon } from "./ItemIcon";
import { formatGold } from "./gardenTokens";
import { formatGroesse } from "./groesse";
import { SEED_CATALOGUE, hydrateHarvestedItem } from "../engine/PlantSystem";
import { Zettel } from "./laden/Marktstand";
import { HudIcon } from "./gameIcons";

const NAME = new Map(SEED_CATALOGUE.map((s) => [s.id, s.name]));
const HOLZ = "#3b2516";
const PLATZ = {
    1: { farbe: "#ffd84a", dunkel: "#b8861a", hoehe: "h-24" },
    2: { farbe: "#c8ccd4", dunkel: "#7d858c", hoehe: "h-20" },
    3: { farbe: "#c8864a", dunkel: "#8a5a2a", hoehe: "h-16" },
};

function restzeit(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return t > 0 ? `${t} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

function Hinweis({ children }) {
    return <div className="py-6 text-center text-sm text-[#f3e3c3]">{children}</div>;
}

function Schildchen({ children, hell = "#f3e3c3" }) {
    return (
        <div className="mb-2 inline-block border-[3px] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: HOLZ, background: hell, color: HOLZ }}>
            {children}
        </div>
    );
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

    if (fehler && !daten) return <Hinweis>Wettbewerb konnte nicht geladen werden.</Hinweis>;
    if (!daten) return <Hinweis>Wettbewerb wird geladen…</Hinweis>;

    const sorteName = NAME.get(daten.sorte) || daten.sorte;
    const bild = hydrateHarvestedItem({ seedId: daten.sorte, name: sorteName });
    const siege = Array.isArray(daten.siege) ? daten.siege : [];
    const preise = daten.preise || [];
    // Treppchen-Reihenfolge wie bei einer Siegerehrung: 2 · 1 · 3
    const treppchen = [2, 1, 3].map((platz) => ({ platz, preis: preise.find((p) => p.platz === platz), wer: daten.rangliste?.[platz - 1] }));

    return (
        <div className="mt-3 space-y-5">
            {/* Aushang: Sorte der Woche */}
            <Zettel bereit={Boolean(daten.meinRekord)}>
                <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center border-[3px] bg-[#fffaf0]" style={{ borderColor: HOLZ }}>
                        <ItemIcon item={bild} className="h-16 w-16" emojiClassName="text-4xl" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Rekord-Ernte der Woche</div>
                        <div className="text-xl font-bold leading-tight text-[#3b2516]">{sorteName}</div>
                        <div className="mt-0.5 text-[11px] text-[#6e4426]">Wer das größte Stück erntet, gewinnt. Größe ist Glückssache — jeder hat eine Chance.</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="border-2 bg-[#fff3c4] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#3b2516]" style={{ borderColor: HOLZ }}>
                            endet in {restzeit(daten.ende - Date.now())}
                        </span>
                        {daten.meinRekord ? (
                            <span className="border-2 bg-[#dcebc8] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#2f5a28]" style={{ borderColor: HOLZ }}>
                                du: Größe {formatGroesse(daten.meinRekord)} · Platz {daten.meinPlatz}/{daten.teilnehmer}
                            </span>
                        ) : (
                            <span className="text-[11px] text-[#6e4426]">Pflanze {sorteName} und ernte sie!</span>
                        )}
                    </div>
                </div>
            </Zettel>

            {/* Siegertreppchen mit Preisen und den aktuellen Spitzenreitern */}
            <div>
                <Schildchen hell="#ffe066">Preise</Schildchen>
                <div className="flex items-end justify-center gap-2">
                    {treppchen.map(({ platz, preis, wer }) => (
                        <div key={platz} className="flex w-32 flex-col items-center sm:w-40">
                            <div className="mb-1 min-h-[2.5rem] text-center">
                                <div className="truncate text-xs font-bold text-[#fff3c4]">{wer ? wer.name : "—"}</div>
                                {wer && <div className="text-[10px] tabular-nums text-[#c9b48a]">Größe {formatGroesse(wer.groesse)}</div>}
                            </div>
                            <div className={`flex w-full flex-col items-center justify-start border-[3px] pt-1 ${PLATZ[platz].hoehe}`}
                                style={{ borderColor: HOLZ, background: PLATZ[platz].farbe, boxShadow: `inset 0 -4px 0 0 ${PLATZ[platz].dunkel}, 0 4px 0 0 ${HOLZ}` }}>
                                <span className="text-lg font-bold" style={{ color: HOLZ }}>{platz}</span>
                                {preis && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums" style={{ color: HOLZ }}>
                                        <HudIcon.gold size={11} /> {formatGold(preis.gold)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Rangliste */}
            <div>
                <Schildchen>Rangliste diese Woche</Schildchen>
                <div className="border-[3px]" style={{ borderColor: HOLZ, background: "#f3e3c3", boxShadow: `0 4px 0 0 ${HOLZ}` }}>
                    {daten.rangliste?.length ? daten.rangliste.map((e, i) => {
                        const ich = daten.meinPlatz === i + 1;
                        return (
                            <div key={`${e.name}-${i}`} className="flex items-center gap-3 border-b-2 px-3 py-1.5 text-sm last:border-b-0"
                                style={{ borderColor: "#e3cfa8", background: ich ? "#dcebc8" : "transparent" }}>
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[11px] font-bold"
                                    style={{ borderColor: HOLZ, background: PLATZ[i + 1]?.farbe || "#e8d7a8", color: HOLZ }}>{i + 1}</span>
                                <span className="min-w-0 flex-1 truncate font-bold text-[#3b2516]">{e.name}{ich ? " (du)" : ""}</span>
                                <span className="shrink-0 text-xs tabular-nums text-[#6e4426]">Größe {formatGroesse(e.groesse)}</span>
                            </div>
                        );
                    }) : (
                        <div className="px-3 py-4 text-center text-xs text-[#6e4426]">Noch hat diese Woche niemand {sorteName} geerntet.</div>
                    )}
                </div>
            </div>

            {(daten.letzteWoche?.sieger?.length > 0 || siege.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                    {daten.letzteWoche?.sieger?.length > 0 && (
                        <Zettel>
                            <div className="mb-1.5 text-sm font-bold text-[#3b2516]">Letzte Woche: {NAME.get(daten.letzteWoche.sorte) || daten.letzteWoche.sorte}</div>
                            {daten.letzteWoche.sieger.map((e, i) => (
                                <div key={i} className="text-xs text-[#6e4426]"><b>{i + 1}.</b> {e.name} · Größe {formatGroesse(e.groesse)}</div>
                            ))}
                        </Zettel>
                    )}
                    {siege.length > 0 && (
                        <Zettel bereit>
                            <div className="mb-1.5 text-sm font-bold text-[#3b2516]">Deine Siege</div>
                            <div className="flex flex-wrap gap-1.5">
                                {siege.slice(-12).reverse().map((s) => (
                                    <span key={s.woche} className="border-2 px-1.5 py-0.5 text-[11px] font-bold" title={`${NAME.get(s.sorte) || s.sorte}, Größe ${formatGroesse(s.groesse)}`}
                                        style={{ borderColor: HOLZ, background: PLATZ[s.platz]?.farbe || "#e8d7a8", color: HOLZ }}>
                                        {s.platz}. · {NAME.get(s.sorte) || s.sorte}
                                    </span>
                                ))}
                            </div>
                        </Zettel>
                    )}
                </div>
            )}
        </div>
    );
}
