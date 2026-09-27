// ui/screens/DraftScreen.jsx — Draft in 6 Runden à 4 Karten: die Runde liegt offen auf dem Tisch, gewählte Karten
// wandern in den eigenen Stapel.
// Seitenleiste: eigenes Deck mit Kurve und Stammverteilung, die Picks des Gegners (gemeinsam offen, getrennt erst danach).
import React, { useEffect, useMemo, useState } from "react";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { hashParts } from "../../engine/rng.js";
import { PICKS_PER_PLAYER, DRAFT_ROUNDS, PICKS_PER_ROUND, draftRound, roundFirst, roundPids } from "../../engine/draft.js";
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
  const cardW = useCardWidth();
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

  const round = draftRound(d, me);
  const shown = isShared ? roundPids(d, round).map((pid) => byPid[pid]) : (d.offers[me] || []).map((pid) => byPid[pid]);
  const myBase = new Set(myPicks.map((c) => c.baseId));

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

  // Großer Hinweis: wer wählt gerade, wie viele noch in dieser Runde
  const roundStarter = isShared ? roundFirst(d.first, round) : null;
  const leftInRound = isShared ? 0 : PICKS_PER_ROUND - (myPicks.length % PICKS_PER_ROUND);
  let status;
  let mine = false;
  if (you === null) status = isShared ? `${names[turn]} wählt` : "Beide wählen gleichzeitig";
  else if (myDone) status = "Deine 12 Karten sind komplett – warte auf den Gegner";
  else if (isShared) {
    mine = turn === you;
    status = mine ? "Du wählst" : `${names[turn]} wählt …`;
  } else {
    mine = true;
    status = `Nimm ${leftInRound === 1 ? "noch 1 Karte" : "2 Karten"} aus ${shown.filter(Boolean).length}`;
  }
  const timerOf = isShared ? (turn !== undefined ? timers?.[turn] : undefined) : (you !== null ? timers?.[you] : undefined);

  return (
    <div className="ss-draft">
      <section>
        <div className="ss-draft-head">
          <div className="min-w-0">
            <p className="ss-title text-lg ss-dim">Draft · {isShared ? "Gemeinsamer Pool" : "Getrennte Pools"} · <span className="ss-num">Runde {Math.min(round + 1, DRAFT_ROUNDS)} / {DRAFT_ROUNDS}</span></p>
            <p className={`ss-title ss-draft-status ${mine ? "ss-mine" : ""}`} role="status">{status}</p>
            <p className="ss-dim text-sm">
              {isShared
                ? <>Diese Runde wählt zuerst: <b>{roundStarter === you ? de.ui.you : names[roundStarter]}</b> · Reihenfolge {names[roundStarter]}, {names[1 - roundStarter]}, {names[roundStarter]}, {names[1 - roundStarter]}</>
                : <>Jeder sieht eigene Karten und nimmt 2 von 4 – beide gleichzeitig.</>}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="ss-dim text-sm">{de.ui.you}: <b className="ss-num">{myPicks.length}</b>/12 · {names[opp]}: <b className="ss-num">{oppPicks.length}</b>/12</span>
            {timerOf && <TurnTimer timer={timerOf} clockOffset={clockOffset} />}
          </div>
        </div>
        <div className="ss-draft-rounds" aria-hidden>
          {Array.from({ length: DRAFT_ROUNDS }, (_, i) => <span key={i} className={i < round ? "ss-done" : i === round ? "ss-now" : ""} />)}
        </div>
        <div className="ss-draft-table" role="list">
          {shown.map((c) => {
            if (!c) return null;
            const owner = taken[c.pid];
            const def = CARDS[c.baseId];
            const locked = def.unique && legends[def.id] !== undefined && legends[def.id] !== you;
            const rot = ((hashParts(c.pid, view.seed) % 11) - 5) * 0.6;
            const twin = you !== null && owner === undefined && myBase.has(c.baseId);
            return (
              <div key={c.pid} role="listitem" className={`ss-draft-card ${owner !== undefined ? "ss-taken" : ""} ${picked === c.pid ? "ss-just-picked" : ""}`} style={{ transform: `rotate(${rot}deg)` }}>
                <Card
                  card={resolveCard(c.baseId, [], c.pid)}
                  width={cardW}
                  onClick={() => (canPick && owner === undefined && !locked ? pick(c.pid) : setDetail(resolveCard(c.baseId, [], c.pid)))}
                  onDetail={() => setDetail(resolveCard(c.baseId, [], c.pid))}
                  glow={canPick && owner === undefined && !locked}
                  dim={locked}
                  tabIndex={0}
                  title={locked ? errorText("legendTaken") : undefined}
                />
                {twin && <span className="ss-twin" title="Diese Karte hast du schon – zwei gleiche lassen sich auf dem Pfad verschmelzen.">×2 – verschmelzbar</span>}
                {owner !== undefined && <span className="ss-owner" aria-label={`genommen von ${names[owner]}`}>{names[owner].charAt(0).toUpperCase()}</span>}
              </div>
            );
          })}
        </div>
        {err && <p className="text-center text-[var(--wax-red-light)]" role="alert">{err}</p>}
        <p className="text-center text-sm ss-faint mt-2">Tippen wählt · lange drücken oder Rechtsklick zeigt Details. Legendäre Karten gibt es nur einmal pro Match, andere manchmal doppelt.</p>
      </section>
      <aside className="space-y-4">
        <div className="ss-paper p-4">
          <DeckSummary cards={myPicks} title={you === null ? names[0] : "Dein Deck"} onCard={setDetail} />
        </div>
        <div className="ss-panel p-4">
          <p className="ss-title mb-2">{names[opp]}</p>
          {!isShared && oppPicks.every((x) => x === null)
            ? <p className="text-sm ss-dim">{oppPicks.length} Karten gewählt – bei getrennten Pools erst nach dem Draft sichtbar.</p>
            : oppPicks.length === 0 ? <p className="text-sm ss-dim">Noch keine Karte gewählt.</p>
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

/** Kartenbreite im Draft: 4 Karten sollen nebeneinander passen, ohne zu scrollen. */
function useCardWidth() {
  const read = () => {
    if (typeof window === "undefined") return 170;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const byW = (Math.min(w, 1400) - (w > 960 ? 360 : 40)) / 4 - 16;
    const byH = (h - 260) / 1.45;
    return Math.round(Math.max(76, Math.min(200, byW, byH)));
  };
  const [w, setW] = useState(read);
  useEffect(() => {
    const on = () => setW(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
