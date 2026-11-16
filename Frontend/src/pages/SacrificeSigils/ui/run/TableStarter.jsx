// ui/run/TableStarter.jsx — Startdeck der Moorwanderung am Tisch (Rebuild „Am Tisch“, Phase 6).
//
// Ersetzt StarterScreen.jsx am Tisch im Kerzenlicht: Die drei Startdecks liegen als drei Auslagen nebeneinander (je
// zwei Reihen à vier Karten), darunter ein Namensschild mit der Idee des Decks und dem Sigil der Moorlinge. Eine Karte
// oder das Schild anklicken wählt das Deck (seine Karten heben sich), der Siegelstempel (oder die Leertaste) bestätigt.
// Alle wählen gleichzeitig, auch dasselbe Deck. Gegenüber sitzt noch niemand.
import React, { Suspense, useEffect, useRef, useState } from "react";
import TableHost from "../table/TableHost.jsx";
import CardDetail from "../card/CardDetail.jsx";
import { resolveCard } from "../../engine/cards.js";
import { startersOf } from "../../data/modes/moorwanderung/starterDecks.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { sideName } from "../common/totemText.js";
import { rowX, stageModel, timeLeft } from "../table/stageModel.js";

/** Auslagen: drei Spalten, je zwei Reihen à vier Karten — innerhalb von x ±45, damit Waage und Stempel frei bleiben. */
const COL_X = [-32, 0, 32];
/** Karten einer Auslage liegen dicht an dicht, zwischen den Decks bleibt eine deutliche Lücke; jedes Deck leicht anders gedreht. */
const CARD_GAP = 6.9;
const COL_TURN = [0.05, 0, -0.05];
const ROW_Z = [-10, 3.5];
const CARD_SCALE = 0.58;

/** @param {{ room: any, game: any }} props */
function StarterAtTable({ room, game }) {
  const { showTip } = useShell();
  const view = game.view;
  const you = game.you;
  const zirkel = view.settings.zirkel;
  const decks = startersOf(zirkel);
  const me = you !== null ? view.players[you] : null;
  const chosen = me?.starter || null;
  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const toastTimer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  const active = chosen || sel;
  const ready = view.players.filter((P) => P.starter).length;

  const cardOf = (d, i) => resolveCard(d.cards[i], [], `${d.id}:${i}`);
  const loose = decks.flatMap((d, k) => d.cards.map((_, i) => {
    const xs = rowX(4, CARD_GAP);
    return { uid: `${d.id}:${i}`, card: cardOf(d, i), x: COL_X[k] + xs[i % 4], z: ROW_Z[Math.floor(i / 4)], ry: COL_TURN[k], scale: CARD_SCALE, from: "table", dim: !!chosen && chosen !== d.id };
  }));
  const notes = decks.map((d, k) => ({
    id: `deck:${d.id}`, x: COL_X[k], z: 19.5, w: 28.5, h: 11, ry: [0.03, -0.02, 0.025][k], mark: active === d.id, dim: !!chosen && chosen !== d.id, click: !chosen && you !== null,
    lines: [
      { text: d.name, size: 1.25 },
      { text: d.idea, size: 0.78, wrap: true },
      { text: `${sideName(zirkel)}: ${de.sigils[d.sideSigil].name}`, size: 0.74 },
    ],
  }));
  const model = {
    ...stageModel({ stage: "starter", zirkel, seat: 0, myTurn: !chosen && you !== null, oppTurn: false }),
    loose,
    notes,
  };
  const timer = you !== null && !chosen ? game.timers?.players?.[you] : null;
  const pick = (id) => {
    if (chosen || you === null) return;
    setSel(id);
    sound.play("draw");
  };
  const confirm = async () => {
    if (chosen || you === null) return;
    if (!sel) { flash("Wähle erst ein Deck."); return; }
    room.pressSeal();
    const res = await game.send({ type: "chooseStarter", deck: sel });
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); }
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "loose") {
      const [deckId, i] = String(p.uid).split(":");
      const d = decks.find((x) => x.id === deckId);
      if (how === "context") { if (d) setDetail(cardOf(d, Number(i))); return; }
      if (d) pick(d.id);
    } else if (p.type === "note" && how === "click" && String(p.id).startsWith("deck:")) pick(String(p.id).slice(5));
    else if (p.type === "seal" && how === "click") confirm();
  };
  handlers.current.hover = (p, at) => {
    const d = p?.type === "note" ? decks.find((x) => `deck:${x.id}` === p.id) : null;
    const content = d ? (
      <>
        <b>{d.name}</b><br /><span className="opacity-80">{d.idea}</span>
        <br /><span className="opacity-80">{sideName(zirkel)} mit {de.sigils[d.sideSigil].name}: {de.sigils[d.sideSigil].desc}</span>
        {!chosen && you !== null && <><br /><span className="opacity-80">Anklicken: dieses Deck wählen.</span></>}
      </>
    ) : p?.type === "seal" && !chosen && you !== null ? <><b>{sel ? "Mit diesem Deck losziehen" : "Erst ein Deck wählen"}</b><br /><span className="opacity-80">Stempel anklicken oder Leertaste.</span></> : null;
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
    room.setUi({ pickable: chosen ? [] : loose.map((c) => c.uid), picked: active ? loose.filter((c) => c.uid.startsWith(`${active}:`)).map((c) => c.uid) : [], canEnd: !!sel && !chosen });
    room.setTimer(timer ? { remaining: timeLeft(timer, game.clockOffset), total: timer.total, paused: !!timer.paused, key: "starter" } : null);
  });
  useEffect(() => {
    const on = (e) => {
      if (detail || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); confirm(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const notice = you === null ? "Alle wählen ihr Startdeck …"
    : chosen ? `${de.run.waitingOthers} ${ready}/${view.players.length} haben gewählt.`
      : !sel ? "Wähle dein Startdeck – Karte oder Schild anklicken. Rechtsklick: Karte ansehen."
        : "Siegelstempel (oder Leertaste): mit diesem Deck losziehen.";
  return (
    <>
      {(toast || notice) && <div className="st-toast ss-paper" role="status">{toast || notice}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/** @param {{ game: any, onFallback: () => void }} props */
export default function TableStarter({ game, onFallback }) {
  return (
    <TableHost zirkel={game.view.settings.zirkel} seated={false} onFallback={onFallback}>
      {(room) => <Suspense fallback={null}><StarterAtTable room={room} game={game} /></Suspense>}
    </TableHost>
  );
}
