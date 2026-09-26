// ui/screens/DraftScreen.jsx — Draft: Karten liegen verstreut auf dem Tisch, gewählte wandern in den eigenen Stapel.
// Seitenleiste: eigenes Deck mit Kurve und Stammverteilung, die Picks des Gegners (gemeinsam offen, getrennt erst danach).
import React, { useMemo, useState } from "react";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { hashParts } from "../../engine/rng.js";
import { PICKS_PER_PLAYER } from "../../engine/draft.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import "./screens.css";

/** @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], busy: boolean, timers: any, clockOffset: number }} props */
export default function DraftScreen({ view, you, send, names, timers, clockOffset }) {
  const d = view.draft;
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const [picked, setPicked] = useState(/** @type {string|null} */ (null));
  const me = you ?? 0;
  const opp = 1 - me;
  const byPid = useMemo(() => Object.fromEntries(d.pool.map((c) => [c.pid, c])), [d.pool]);
  const taken = d.taken || {};
  const isShared = d.mode === "shared";
  const turn = isShared ? d.order[d.index] : null;
  const myPicks = (d.picks[me] || []).filter(Boolean).map((pid) => resolveCard(byPid[pid].baseId, [], pid));
  const oppPicks = (d.picks[opp] || []);
  const myDone = myPicks.length >= PICKS_PER_PLAYER;
  const canPick = you !== null && !myDone && (isShared ? turn === you : true);
  const legends = view.legends || {};

  const shown = isShared ? d.pool : (d.offers[me] || []).map((pid) => byPid[pid]);

  const pick = async (pid) => {
    if (!canPick) return;
    setPicked(pid);
    sound.play("draw");
    const res = await send({ type: "draftPick", pid });
    if (!res?.ok) {
      setPicked(null);
      sound.play("error");
      setErr(errorText(res?.error));
      setTimeout(() => setErr(null), 2500);
    } else {
      setTimeout(() => setPicked(null), 650);
    }
  };

  let status;
  if (you === null) status = isShared ? `${names[turn]} wählt.` : "Beide wählen gleichzeitig.";
  else if (myDone) status = "Du hast deine 12 Karten. Warte auf den Gegner …";
  else if (isShared) {
    let run = 0;
    while (d.order[d.index + run] === you) run += 1;
    status = turn === you ? `Du wählst – noch ${run === 1 ? "1 Karte" : `${run} Karten`} am Stück.` : `${names[turn]} wählt …`;
  }
  else status = "Wähle 1 der 5 aufgedeckten Karten.";

  return (
    <div className="ss-draft">
      <section>
        <div className="flex flex-wrap items-center gap-3 justify-between mb-2">
          <div>
            <p className="ss-title text-2xl">Draft · {isShared ? "Gemeinsamer Pool" : "Getrennte Pools"}</p>
            <p className="ss-dim">{status}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="ss-dim text-sm">{de.ui.you}: <b className="ss-num">{myPicks.length}</b>/12 · {names[opp]}: <b className="ss-num">{oppPicks.length}</b>/12</span>
            {you !== null && timers?.[you] && <TurnTimer timer={timers[you]} clockOffset={clockOffset} />}
          </div>
        </div>
        <div className="ss-draft-table" role="list">
          {shown.map((c) => {
            if (!c) return null;
            const owner = taken[c.pid];
            const def = CARDS[c.baseId];
            const locked = def.unique && legends[def.id] !== undefined && legends[def.id] !== you;
            const rot = ((hashParts(c.pid, view.seed) % 11) - 5) * 0.9;
            return (
              <div key={c.pid} role="listitem" className={`ss-draft-card ${owner !== undefined ? "ss-taken" : ""} ${picked === c.pid ? "ss-just-picked" : ""}`} style={{ transform: `rotate(${rot}deg)` }}>
                <Card
                  card={resolveCard(c.baseId, [], c.pid)}
                  width={122}
                  onClick={() => (canPick && owner === undefined && !locked ? pick(c.pid) : setDetail(resolveCard(c.baseId, [], c.pid)))}
                  onDetail={() => setDetail(resolveCard(c.baseId, [], c.pid))}
                  glow={canPick && owner === undefined && !locked}
                  dim={locked}
                  tabIndex={0}
                  title={locked ? errorText("legendTaken") : undefined}
                />
                {owner !== undefined && <span className="ss-owner" aria-label={`genommen von ${names[owner]}`}>{names[owner].charAt(0).toUpperCase()}</span>}
              </div>
            );
          })}
        </div>
        {err && <p className="text-center text-[var(--wax-red-light)]" role="alert">{err}</p>}
        <p className="text-center text-sm ss-faint mt-2">Tippen wählt · lange drücken oder Rechtsklick zeigt Details. Legendäre Karten gibt es nur einmal pro Match.</p>
      </section>
      <aside className="space-y-4">
        <div className="ss-paper p-4">
          <DeckSummary cards={myPicks} title={you === null ? names[0] : "Dein Deck"} onCard={setDetail} />
        </div>
        <div className="ss-panel p-4">
          <p className="ss-title mb-2">{names[opp]}</p>
          {oppPicks.every((x) => x === null)
            ? <p className="text-sm ss-dim">{oppPicks.length} Karten gewählt – bei getrennten Pools erst nach dem Draft sichtbar.</p>
            : (
              <div className="flex flex-wrap gap-1">
                {oppPicks.map((pid) => byPid[pid] && (
                  <button key={pid} type="button" className="text-xs px-1.5 py-0.5 border border-[var(--brass)]/50 rounded-sm hover:bg-white/5" onClick={() => setDetail(resolveCard(byPid[pid].baseId, [], pid))}>
                    {CARDS[byPid[pid].baseId].name}
                  </button>
                ))}
              </div>
            )}
        </div>
      </aside>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
