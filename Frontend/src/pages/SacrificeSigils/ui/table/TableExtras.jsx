// ui/table/TableExtras.jsx — die Totem-Wahl am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Ersetzt ExtrasScreen.jsx am Tisch im Kerzenlicht: nach dem Draft wählt jeder einen Totem-Kopf (mit Start-Körper)
// und einen Nebendeck-Totem. Die Köpfe stehen als geschnitzte Figuren in einer Reihe, die Nebendeck-Totems liegen als
// Karten davor (die Nebendeck-Karte mit dem Sigil, das sie bekäme). Anklicken hebt die Wahl an, der Siegelstempel
// (oder die Leertaste) bestätigt sie. Was gewählt ist, wandert an den Platz, an dem es im Kampf steht.
// Gemeinsamer Pool: nacheinander und exklusiv. Getrennte Pools: beide gleichzeitig, erst Kopf und Nebendeck-Totem
// wählen, dann stempeln.
import React, { useEffect, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import TablePause from "./TablePause.jsx";
import { resolveCard } from "../../engine/cards.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { SIDE_ONLY_SIGILS } from "../../data/totems.js";
import { extrasTurn, PICKS_PER_PLAYER } from "../../engine/draft.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { helpFor } from "./touch.js";
import { totemText, baseDesc, baseName, headKind, headName, headTarget } from "../common/totemText.js";
import { rowX, stageModel, timeLeft } from "./stageModel.js";

/** Reihe der Totem-Köpfe (hinter der Mittellinie) und der Nebendeck-Karten (davor). */
const HEAD_Z = -9;
const HEAD_GAP = 19;
const SIDE_Z = 14;
const SIDE_GAP = 16;
const SIDE_SCALE = 1.15;

/**
 * @param {{ room: any, view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], timers?: any,
 *   clockOffset?: number, onFallback?: () => void, status?: string | null }} props
 *   status: Meldung von außen (Verbindung verloren, Hinweis des Raums)
 */
export default function TableExtras({ room, view, you, send, names, timers, clockOffset = 0, status, onFallback }) {
  const { showTip } = useShell();
  const d = view.draft;
  const zirkel = view.settings?.zirkel;
  const sideTypes = getZirkel(zirkel).sideDeckTypes;
  const sideKey = Object.keys(sideTypes)[0];
  const me = you ?? 0;
  const opp = 1 - me;
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [side, setSide] = useState(/** @type {string|null} */ (null));
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

  const step = extrasTurn(d);
  const sequential = d.mode === "shared";
  const mine = d.extras[me];
  const theirs = d.extras[opp];
  const done = mine.head !== null && mine.side !== null;
  const myTurn = you !== null && (sequential ? step?.[0] === you : !done);
  const canHead = myTurn && (!sequential || step?.[1] === "head");
  const canSide = myTurn && (!sequential || step?.[1] === "side");
  const ready = sequential ? (step?.[1] === "head" ? head !== null : !!side) : head !== null && !!side;
  const headOwner = (i) => [0, 1].find((q) => d.extras[q].head === i);
  const sideOwner = (k) => [0, 1].find((q) => d.extras[q].side === k);
  const sideCard = (key) => resolveCard(sideTypes[sideKey], [{ kind: "sigilAdd", sigil: key }], `side:${key}`);

  // Vergebene Köpfe und Nebendeck-Totems stehen schon dort, wo sie im Kampf stehen; der Rest steht zur Wahl.
  // Bei getrennten Pools nimmt keiner dem anderen etwas weg — dort bleibt alles stehen, bis man selbst gewählt hat.
  const xsHead = rowX(d.heads.length, HEAD_GAP);
  const choices = d.heads
    .map((h, i) => ({ id: i, kind: h.head.kind, label: headName(h.head, zirkel), x: xsHead[i], z: HEAD_Z }))
    .filter((c) => (sequential ? headOwner(c.id) === undefined : mine.head !== c.id));
  const xsSide = rowX(d.sides.length, SIDE_GAP);
  const loose = d.sides
    .map((key, i) => ({ uid: `side:${key}`, key, card: sideCard(key), x: xsSide[i], z: SIDE_Z, scale: SIDE_SCALE, from: "sideDeck" }))
    .filter((c) => (sequential ? sideOwner(c.key) === undefined : mine.side !== c.key));
  const totemsOf = (ex) => [
    ...(ex.head !== null && ex.head !== undefined && d.heads[ex.head] ? [{ kind: d.heads[ex.head].head.kind, label: headName(d.heads[ex.head].head, zirkel) }] : []),
    ...(ex.side ? [{ kind: "side", label: de.sigils[ex.side].name }] : []),
  ];
  const model = {
    ...stageModel({ stage: "extras", zirkel, seat: me, myTurn, oppTurn: sequential && step?.[0] === opp }),
    me: { bones: 0, third: 0, deck: PICKS_PER_PLAYER, items: [], totems: totemsOf(mine) },
    opp: { items: 0, deck: PICKS_PER_PLAYER, totems: totemsOf(theirs) },
    loose: done && !sequential ? [] : loose,
    choices: done && !sequential ? [] : choices,
  };
  const timer = sequential ? (step ? timers?.[step[0]] : undefined) : (you !== null ? timers?.[you] : undefined);

  const confirm = async () => {
    if (!myTurn || !ready) { if (myTurn) flash(sequential ? "Erst wählen, dann stempeln." : "Wähle erst einen Kopf und einen Nebendeck-Totem."); return; }
    const action = !sequential ? { type: "draftExtras", head, side } : step?.[1] === "head" ? { type: "draftExtras", head } : { type: "draftExtras", side };
    const res = await send(action);
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); return; }
    room.pressSeal();
    setHead(null);
    setSide(null);
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "loose") {
      const key = String(p.uid).slice(5);
      if (how === "context") { setDetail(sideCard(key)); return; }
      if (!canSide) { if (myTurn) flash("Erst der Totem-Kopf."); return; }
      setSide(side === key ? null : key);
      sound.play("draw");
    } else if (p.type === "choice" && how === "click") {
      if (!canHead) { if (myTurn) flash("Jetzt ist der Nebendeck-Totem dran."); return; }
      setHead(head === p.id ? null : p.id);
      sound.play("creak");
    } else if (p.type === "seal" && how === "click") confirm();
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    if (p?.type === "choice" && d.heads[p.id]) {
      const h = d.heads[p.id];
      content = T(`${headKind(h.head)}: ${headName(h.head, zirkel)}`, `Trifft ${headTarget(h.head, zirkel)}.`, `${de.totems.base}: ${baseName(h.base)}`, totemText(h.head, h.base, zirkel), h.base.kind === "sigil" ? baseDesc(h.base) : null);
    } else if (p?.type === "loose") {
      const key = String(p.uid).slice(5);
      content = T(`Nebendeck-Totem: ${de.sigils[key].name}${SIDE_ONLY_SIGILS.includes(key) ? " · Opfer" : ""}`, de.sigils[key].desc, `Jede Karte aus dem Nebendeck (${de.sides[sideKey].name}) bekommt dieses Sigil.`);
    } else if (p?.type === "totem") {
      const ex = p.owner === "me" ? mine : theirs;
      const who = p.owner === "me" ? de.ui.you : names[opp];
      const isHead = p.index === 0 && ex.head !== null && ex.head !== undefined && d.heads[ex.head];
      if (isHead) {
        const h = d.heads[ex.head];
        content = T(`${who}: ${headKind(h.head)} ${headName(h.head, zirkel)}`, totemText(h.head, h.base, zirkel));
      } else if (ex.side) content = T(`${who}: Nebendeck-Totem ${de.sigils[ex.side].name}`, de.sigils[ex.side].desc);
    } else if (p?.type === "seal") content = T("Wahl bestätigen", "Stempel anklicken oder Leertaste.");
    else if (p?.type === "deck") content = T(`Dein Deck: ${PICKS_PER_PLAYER} Karten`);
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
    room.setUi({
      selected: canSide && side ? `side:${side}` : null,
      pickable: canSide ? loose.map((c) => c.uid) : [],
      choosable: canHead ? choices.map((c) => String(c.id)) : [],
      choice: canHead ? head : null,
      canEnd: myTurn && ready,
    });
    room.setTimer(timer ? { remaining: timeLeft(timer, clockOffset), total: timer.total, paused: !!timer.paused, key: `x:${d.extraIndex ?? 0}:${done}` } : null);
  });

  const keyRef = useRef(/** @type {any} */ (null));
  keyRef.current = (e) => {
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (detail) return;
      if (head !== null || side) { setHead(null); setSide(null); } else setPaused((v) => !v);
      return;
    }
    if (paused || detail) return;
    if (e.key === " " || e.code === "Space") { e.preventDefault(); confirm(); }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // Die Wahl ist seltener als ein Zug im Kampf — ein Satz sagt, was gerade dran ist
  let notice = null;
  if (you === null) notice = sequential && step ? `${names[step[0]]} wählt ${step[1] === "head" ? "einen Totem-Kopf" : "einen Nebendeck-Totem"} …` : null;
  else if (sequential && step) {
    notice = step[0] === you
      ? `${step[1] === "head" ? "Wähle einen Totem-Kopf" : "Wähle einen Nebendeck-Totem"}${ready ? " – stempeln bestätigt." : "."}`
      : `${names[step[0]]} wählt ${step[1] === "head" ? "einen Totem-Kopf" : "einen Nebendeck-Totem"} …`;
  } else if (!sequential) {
    notice = done ? `Gewählt – ${names[opp]} wählt noch …` : ready ? "Stempeln bestätigt deine Wahl." : "Wähle einen Totem-Kopf und einen Nebendeck-Totem.";
  }

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || notice || status) && <div className="st-toast ss-paper" role="status">{toast || notice || status}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title="Totem-Kopf und Nebendeck-Totem"
          sub={sequential ? "Gewähltes ist für den anderen weg." : "Der Kopf kommt mit einem Start-Körper; im Totem-Schrein auf dem Pfad lässt sich beides umbauen."}
          onClose={() => setPaused(false)}
          onSurrender={you !== null ? () => send({ type: "surrender" }) : null}
          onFallback={onFallback}
          help={helpFor(<>
            Figur oder Karte anklicken: wählen · Siegelstempel oder Leertaste: bestätigen · Mauszeiger auf eine Figur:
            was sie bewirkt · Rechtsklick auf eine Karte: ansehen. Beide ziehen aus demselben unendlichen Nebendeck
            ({de.sides[sideKey].name}); dein Nebendeck-Totem gibt jeder dieser Karten ein Sigil.
          </>, <>
            Figur oder Karte antippen: wählen und lesen, was sie bewirkt · Siegelstempel antippen: bestätigen · Karte
            lange drücken: ansehen. Beide ziehen aus demselben unendlichen Nebendeck ({de.sides[sideKey].name}); dein
            Nebendeck-Totem gibt jeder dieser Karten ein Sigil.
          </>)}
        />
      )}
    </>
  );
}
