// ui/run/RunFx.jsx — große Momente der Moorwanderung: Siegelbruch, Duell-Ankündigung (Paare werden wie Karten
// auf den Tisch gelegt) und das Podium am Ende. Jeweils ein Vollbild-Overlay, per Klick oder nach Ablauf weg.
import React, { useEffect } from "react";
import { WaxSeal } from "./Seals.jsx";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

/** Name eines Gegners ohne Menschen (Spiegelgeist/Moorfürst). @param {any} view @param {any} ghost */
function ghostName(view, ghost) {
  if (!ghost) return "?";
  return ghost.kind === "lord" ? de.run.lord : de.run.mirror(view.players[ghost.of]?.name || "?");
}

/**
 * Ein Siegel zerbricht: großes Wachssiegel springt in zwei Hälften.
 * @param {{ left: number, total: number, reason: string, onDone: () => void }} props
 */
export function SealBreak({ left, total, reason, onDone }) {
  useEffect(() => {
    sound.play("seal");
    const t1 = setTimeout(() => sound.play("crackle"), 520);
    const t2 = setTimeout(onDone, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className="ss-fx-overlay" onClick={onDone} role="status">
      <div className="ss-sealbreak" aria-hidden>
        <span className="ss-sealbreak-half ss-sealbreak-l"><WaxSeal size={150} /></span>
        <span className="ss-sealbreak-half ss-sealbreak-r"><WaxSeal size={150} /></span>
      </div>
      <p className="ss-title text-3xl mt-6">Ein Siegel bricht</p>
      <p className="text-[var(--bone)] mt-1">{reason === "boss" ? "Der Pfad-Boss hat dich bezwungen." : "Du hast das Duell verloren."} Noch {left} von {total}.</p>
      {left === 1 && <p className="text-[var(--candle)] mt-1">Das nächste verlorene Duell beendet deine Wanderung.</p>}
    </div>
  );
}

/**
 * Duellrunde beginnt: die Paarungen werden nacheinander wie Karten aufgedeckt.
 * @param {{ view: any, pairs: any[], round: number, you: number|null, onDone: () => void }} props
 */
export function DuelAnnounce({ view, pairs, round, you, onDone }) {
  useEffect(() => {
    const ts = pairs.map((_, i) => setTimeout(() => sound.play("draw"), 250 + i * 380));
    const end = setTimeout(onDone, 1600 + pairs.length * 380);
    return () => { ts.forEach(clearTimeout); clearTimeout(end); };
  }, [pairs, onDone]);
  const name = (q) => view.players[q]?.name || "?";
  return (
    <div className="ss-fx-overlay" onClick={onDone} role="dialog" aria-label={`${de.run.duels} ${round}`}>
      <p className="ss-title text-4xl">{de.run.duels} {round}</p>
      <div className="ss-announce">
        {pairs.map((x, i) => {
          const mine = you !== null && x.seats.includes(you);
          const b = x.seats[1];
          return (
            <div key={x.id} className={`ss-announce-card ss-paper ${mine ? "ss-announce-mine" : ""}`} style={{ animationDelay: `${0.2 + i * 0.38}s` }}>
              <p className="ss-title !text-[var(--ink)] text-lg leading-tight">{name(x.seats[0])}</p>
              <p className="text-xs uppercase tracking-widest opacity-60 my-1">gegen</p>
              <p className="ss-title !text-[var(--ink)] text-lg leading-tight">{b !== null && b !== undefined ? name(b) : ghostName(view, x.ghost)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Podium der drei Besten. @param {{ view: any, you: number|null }} props */
export function Podium({ view, you }) {
  const ranked = view.players.map((P, q) => ({ P, q })).filter((x) => x.P.place).sort((a, b) => a.P.place - b.P.place);
  const top = ranked.slice(0, 3);
  // Mitte = Platz 1, links 2, rechts 3
  const order = [top[1], top[0], top[2]].filter(Boolean);
  useEffect(() => {
    if (you !== null && view.players[you]?.place === 1) sound.play("victory");
  }, [view, you]);
  return (
    <div className="ss-podium" aria-label="Podium">
      {order.map(({ P, q }) => (
        <div key={q} className={`ss-podium-col ss-podium-${P.place}`}>
          <p className="ss-title text-lg leading-tight text-center">{P.name}{q === you ? " (du)" : ""}</p>
          <div className="flex justify-center my-1"><WaxSeal size={P.place === 1 ? 34 : 26} lost={P.seals <= 0} /></div>
          <div className="ss-podium-block"><span className="ss-title">{P.place}</span></div>
        </div>
      ))}
    </div>
  );
}
