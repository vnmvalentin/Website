// ui/table/TableDraft.jsx — der Draft am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Ersetzt DraftScreen.jsx am Tisch im Kerzenlicht: dieselben Regeln (6 Runden à 4 Karten, jeder nimmt 12), aber ohne
// Formular. Die Karten der Runde liegen in der Tischmitte, daneben der Vorrat mit dem Rundenzettel. Eine Karte
// anklicken nimmt sie: sie wandert in die eigene Hand, wo man sein wachsendes Deck vor sich sieht. Nimmt das
// Gegenüber eine Karte, greift seine Hand danach. Nach der letzten Karte legen sich die eigenen auf den Stapel.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import TablePause from "./TablePause.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { PICKS_PER_PLAYER, DRAFT_ROUNDS, ROUND_SIZE, draftRound, roundPids } from "../../engine/draft.js";
import { errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { rowX, stageModel, timeLeft } from "./stageModel.js";

/** Karten der Runde: nebeneinander in der Tischmitte, etwas größer als im Kampf. */
const ROUND_GAP = 19;
const ROUND_SCALE = 1.4;

/**
 * @param {{ room: any, view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], timers: any,
 *   clockOffset: number, onFallback?: () => void, status?: string | null }} props
 *   status: Meldung von außen (Verbindung verloren, Hinweis des Raums)
 */
export default function TableDraft({ room, view, you, send, names, timers, clockOffset, status, onFallback }) {
  const { showTip } = useShell();
  const d = view.draft;
  const me = you ?? 0;
  const opp = 1 - me;
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [paused, setPaused] = useState(false);
  const toastTimer = useRef(/** @type {any} */ (null));
  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const byPid = useMemo(() => Object.fromEntries(d.pool.map((c) => [c.pid, c])), [d.pool]);
  const cardOf = (pid) => resolveCard(byPid[pid].baseId, [], pid);
  const taken = d.taken || {};
  const isShared = d.mode === "shared";
  const turn = isShared ? d.order[d.index] : null;
  const myPids = (d.picks[me] || []).filter(Boolean);
  const oppPids = d.picks[opp] || [];
  const myDone = myPids.length >= PICKS_PER_PLAYER;
  const canPick = you !== null && !myDone && (isShared ? turn === you : true);
  const legends = view.legends || {};
  const round = Math.min(draftRound(d, me), DRAFT_ROUNDS - 1);
  const shown = (isShared ? roundPids(d, round) : d.offers[me] || []).filter((pid) => byPid[pid]);
  const myBase = new Set(myPids.map((pid) => byPid[pid].baseId));
  const isLocked = (pid) => {
    const def = CARDS[byPid[pid].baseId];
    return def.unique && legends[def.id] !== undefined && legends[def.id] !== you;
  };

  // Lose Karten: gemeinsam bleiben die vier Plätze der Runde stehen (Genommenes hinterlässt eine Lücke),
  // getrennt rücken die eigenen Angebote zusammen
  const xs = rowX(isShared ? ROUND_SIZE : shown.length, ROUND_GAP);
  const loose = shown
    .map((pid, i) => ({ uid: pid, card: cardOf(pid), x: xs[i], z: 0, scale: ROUND_SCALE, dim: isLocked(pid) }))
    .filter((c) => taken[c.uid] === undefined);
  const model = {
    ...stageModel({ stage: "draft", zirkel: view.settings?.zirkel, seat: me, myTurn: canPick, oppTurn: isShared && turn === opp }),
    // Die eigenen Karten als Hand: das Deck wächst vor einem
    hand: myPids.map(cardOf),
    // Gemeinsamer Pool: die Wahl des anderen liegt offen; getrennt bleibt sie bis nach dem Draft verdeckt
    oppHand: oppPids.map((pid) => (pid && byPid[pid] ? cardOf(pid) : null)),
    loose: myDone && !isShared ? [] : loose,
    pool: { count: Math.max(0, (DRAFT_ROUNDS - round - 1) * ROUND_SIZE), label: `${round + 1}/${DRAFT_ROUNDS}` },
  };
  const pickable = canPick ? loose.filter((c) => !c.dim).map((c) => c.uid) : [];
  const timer = isShared ? (turn !== undefined && turn !== null ? timers?.[turn] : undefined) : (you !== null ? timers?.[you] : undefined);

  const pick = async (pid) => {
    if (!canPick) return;
    if (isLocked(pid)) { sound.play("error"); flash(errorText("legendTaken")); return; }
    sound.play("draw");
    const res = await send({ type: "draftPick", pid });
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); }
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "loose" || p.type === "hand") {
      if (how === "context" || p.type === "hand") { if (byPid[p.uid]) setDetail(cardOf(p.uid)); return; }
      pick(p.uid);
    }
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    if (p?.type === "pool") content = T(`Draft · Runde ${round + 1} von ${DRAFT_ROUNDS}`, isShared ? "Ihr nehmt abwechselnd, bis jeder 12 Karten hat." : "Jeder nimmt 2 von 4 eigenen Karten.");
    else if (p?.type === "oppHand") content = T(`${names[opp]}: ${oppPids.length} von ${PICKS_PER_PLAYER} Karten`);
    else if (p?.type === "loose" && byPid[p.uid]) {
      if (isLocked(p.uid)) content = T(errorText("legendTaken"));
      else if (you !== null && myBase.has(byPid[p.uid].baseId)) content = T("Diese Karte hast du schon", "Zwei gleiche lassen sich auf dem Pfad verschmelzen.");
    } else if (p?.type === "hourglass" && timer) content = T(`Noch ${Math.ceil(timeLeft(timer, clockOffset) / 1000)} s`);
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };
  useEffect(() => {
    room.setHandlers({ onIntent: (p, how) => handlers.current.intent(p, how), onHover: (p, at) => handlers.current.hover(p, at) });
    room.setPose(you === null ? "seite" : "brett");
    return () => { room.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    room.sync(model);
    room.setUi({ pickable });
    room.setTimer(timer ? { remaining: timeLeft(timer, clockOffset), total: timer.total, paused: !!timer.paused, key: `d:${d.index ?? 0}:${myPids.length}:${oppPids.length}` } : null);
  });

  // Nimmt das Gegenüber eine offen liegende Karte, greift seine Hand danach (nach dem Abgleich oben)
  const seenOpp = useRef(oppPids.length);
  useEffect(() => {
    const before = seenOpp.current;
    seenOpp.current = oppPids.length;
    if (oppPids.length !== before + 1) return;
    const pid = oppPids[oppPids.length - 1];
    if (pid) room.oppTake(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppPids.length]);

  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (detail) return;
      setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [detail]);

  // Ein Satz zum Einstieg, solange man noch keine Karte hat — danach spricht der Tisch für sich
  const notice = you === null ? null
    : myDone ? `Deine ${PICKS_PER_PLAYER} Karten sind komplett.`
      : canPick && myPids.length === 0 ? (isShared ? "Nimm eine Karte. Ihr wählt abwechselnd, bis jeder 12 hat." : "Nimm 2 der 4 Karten – sechs Runden lang.")
        : null;

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || notice || status) && <div className="st-toast ss-paper" role="status">{toast || notice || status}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title="Draft"
          sub={<>Runde {round + 1} von {DRAFT_ROUNDS} · {names[me]} {myPids.length}/{PICKS_PER_PLAYER} · {names[opp]} {oppPids.length}/{PICKS_PER_PLAYER}</>}
          onClose={() => setPaused(false)}
          onSurrender={you !== null ? () => send({ type: "surrender" }) : null}
          onFallback={onFallback}
          help={<>
            Karte in der Tischmitte anklicken: nehmen · Rechtsklick (oder lange drücken): Karte ansehen ·
            deine gewählten Karten liegen unten als Hand. Legendäre Karten gibt es nur einmal pro Match.
          </>}
        />
      )}
    </>
  );
}
