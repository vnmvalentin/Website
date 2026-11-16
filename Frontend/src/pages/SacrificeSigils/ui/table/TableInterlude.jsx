// ui/table/TableInterlude.jsx — die Rast am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Ersetzt InterludeScreen.jsx am Tisch im Kerzenlicht: nach dem Pfad liegt vor jedem ein Zettel mit den Orten, die er
// besucht hat (welche Karten betroffen waren, bleibt geheim). Der Verlierer des letzten Kampfs entscheidet, wer den
// nächsten beginnt — mit den Siegelstempeln: der eigene heißt „ich beginne“, der gegenüber „du beginnst“.
// Danach beginnt der Kampf am selben Tisch.
import React, { useEffect, useRef, useState } from "react";
import TablePause from "./TablePause.jsx";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { stageModel, timeLeft, totemsOnTable } from "./stageModel.js";

/**
 * @param {{ room: any, view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], timers?: any,
 *   clockOffset?: number, onFallback?: () => void, status?: string | null }} props
 */
export default function TableInterlude({ room, view, you, send, names, timers, clockOffset = 0, status, onFallback }) {
  const { showTip } = useShell();
  const it = view.interlude;
  const zirkel = view.settings?.zirkel;
  const me = you ?? 0;
  const opp = 1 - me;
  const chooser = it.chooser;
  const mine = you !== null && chooser === you;
  const last = view.history[view.history.length - 1];
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [paused, setPaused] = useState(false);
  const toastTimer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const places = (p) => it.revealed[p].map((t) => de.nodes[t]?.name || t);
  const note = (p, id, x, z, ry) => {
    const lines = [p === you ? "Dein Weg" : `Weg von ${names[p]}`, ...(places(p).length ? places(p) : ["–"])];
    return { id, lines, x, z, w: 20, h: 4.6 + (lines.length - 1) * 2.7, ry };
  };
  const P = view.players;
  const model = {
    ...stageModel({ stage: "interlude", zirkel, seat: me, myTurn: mine, oppTurn: you !== null && chooser === opp }),
    me: { bones: 0, third: 0, deck: P[me].deckSize ?? 0, items: you !== null ? P[me].items || [] : [], totems: totemsOnTable(P[me], zirkel) },
    opp: { items: P[opp].itemCount ?? (P[opp].items || []).length, deck: P[opp].deckSize ?? 0, totems: totemsOnTable(P[opp], zirkel) },
    itemNames: Object.fromEntries(Object.keys(de.items).map((id) => [id, de.items[id]?.name || id])),
    notes: [note(me, "mine", -17, 15, 0.04), note(opp, "theirs", 17, -15, -0.03)],
  };
  const timer = timers?.[chooser];

  const choose = async (starter) => {
    if (!mine) { if (you !== null) flash(`${names[chooser]} entscheidet, wer beginnt.`); return; }
    const res = await send({ type: "chooseStarter", starter });
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); return; }
    if (starter === you) room.pressSeal();
    else sound.play("seal");
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p || how !== "click") return;
    if (p.type === "seal") choose(me);
    else if (p.type === "oppSeal") choose(opp);
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    if (p?.type === "seal") content = mine ? T(de.ui.iStart, "Wer als Zweiter beginnt, bekommt zum Ausgleich +1 Wachs.") : T("Dein Siegelstempel");
    else if (p?.type === "oppSeal") content = mine ? T(`${names[opp]} beginnt`, "Du bekommst als Zweiter +1 Wachs.") : T(`Siegelstempel von ${names[opp]}`);
    else if (p?.type === "note") content = T(p.id === "mine" ? "Deine besuchten Orte" : `Besuchte Orte von ${names[opp]}`, "Welche Karten betroffen waren, bleibt geheim.");
    else if (p?.type === "deck") content = T(`Dein Deck: ${P[me].deckSize ?? 0} Karten`);
    else if (p?.type === "hourglass" && timer) content = T(`Noch ${Math.ceil(timeLeft(timer, clockOffset) / 1000)} s`);
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
    room.setUi({ canEnd: mine, oppSeal: mine });
    room.setTimer(timer ? { remaining: timeLeft(timer, clockOffset), total: timer.total, paused: !!timer.paused, key: `i:${view.pathNo ?? 0}` } : null);
  });

  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const lastLine = `Letzter Kampf: ${names[last.winner]} gewann${last.overkill ? ` mit ${last.overkill} Überschuss` : ""}.`;
  const notice = mine ? `Wer beginnt den nächsten Kampf? Dein Stempel: du – der Stempel gegenüber: ${names[opp]}.`
    : `${names[chooser]} entscheidet, wer beginnt …`;

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || notice || status) && <div className="st-toast ss-paper" role="status">{toast || notice || status}</div>}
      {paused && (
        <TablePause
          title="Rast am Tisch"
          sub={<>{lastLine} {names[0]} {view.wins[0]} : {view.wins[1]} {names[1]}</>}
          onClose={() => setPaused(false)}
          onSurrender={you !== null ? () => send({ type: "surrender" }) : null}
          onFallback={onFallback}
          help={<>
            Die Zettel zeigen, welche Orte jeder auf dem Pfad besucht hat. Der Verlierer des letzten Kampfs entscheidet,
            wer beginnt: eigenen Siegelstempel anklicken = selbst beginnen, den Stempel gegenüber = der andere beginnt.
            Wer als Zweiter beginnt, bekommt +1 Wachs.
          </>}
        />
      )}
    </>
  );
}
