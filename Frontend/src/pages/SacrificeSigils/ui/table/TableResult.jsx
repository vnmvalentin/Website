// ui/table/TableResult.jsx — das Ergebnis am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Ersetzt ResultScreen.jsx am Tisch im Kerzenlicht: Die Kerzen sind aus, die stärkste Karte des Siegers bleibt im
// Licht liegen, daneben ein Zettel mit dem Ausgang und drei Zahlen. Revanche = eine Kerze wieder anzünden; will der
// andere auch, brennt seine. Wer gehen will, nimmt den Zettel „Aufstehen“ rechts vorn (oder Menü → Zum Hauptmenü).
// Die volle Statistik mit beiden Decks gibt es am Tisch nicht mehr (Nutzer, 15.11.2026: „zu kompliziert, nicht wichtig“).
import React, { useEffect, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import TablePause from "./TablePause.jsx";
import { CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { stageModel, totemsOnTable } from "./stageModel.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import ErgebnisTeilen from "../../../../components/ErgebnisTeilen.jsx";
import { duellErgebnis } from "../../ergebnis.js";

/** Die Karte, die im Match am meisten Schaden gemacht hat. */
function strongest(stats) {
  const entries = Object.entries(stats?.damageByCard || {}).filter(([id]) => CARDS[id]);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { id: entries[0][0], dmg: entries[0][1] };
}

/**
 * @param {{ room: any, view: any, you: 0|1|null, names: string[], onRematch?: () => any, onExit?: () => void,
 *   rematchState?: any, onFallback?: () => void, status?: string | null }} props
 *   rematchState: Raum (online) mit seats[i].rematch · onExit: aufstehen, zurück ins Hauptmenü
 */
export default function TableResult({ room, view, you, names, onRematch, onExit, rematchState, onFallback, status }) {
  const { showTip } = useShell();
  const zirkel = view.settings?.zirkel;
  const me = you ?? 0;
  const opp = 1 - me;
  const W = view.winner;
  const won = you !== null && W === you;
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [paused, setPaused] = useState(false);
  const myRematch = you !== null && !!rematchState?.seats?.[you]?.rematch;
  const oppRematch = !!rematchState?.seats?.[opp]?.rematch;
  const canRematch = you !== null && !!onRematch;

  const P = view.players;
  const best = strongest(P[W].stats);
  const bestCard = best ? { ...CARDS[best.id], baseId: best.id, mods: [], uid: "ergebnis-karte" } : null;
  // Wessen Zahlen stehen auf dem Zettel? Die eigenen — Zuschauer sehen die des Siegers.
  const shown = you !== null ? you : W;
  const reason = view.endReason === "surrender" ? `${names[1 - W]} hat aufgegeben` : null;
  const model = {
    ...stageModel({ stage: "result", zirkel, seat: me, myTurn: false, oppTurn: false }),
    turn: view.battle?.turn ?? 0,
    me: { bones: 0, third: 0, deck: P[me].deckSize ?? 0, items: [], totems: totemsOnTable(P[me], zirkel) },
    opp: { items: 0, deck: P[opp].deckSize ?? 0, totems: totemsOnTable(P[opp], zirkel) },
    loose: bestCard ? [{ uid: bestCard.uid, card: bestCard, x: 8, z: -1, scale: 1.7, from: "table" }] : [],
    notes: [
      {
        id: "ergebnis", x: -19, z: 1, w: 21, h: reason ? 19.5 : 17, ry: 0.05,
        lines: [
          { text: you === null ? `${names[W]} gewinnt` : won ? de.ui.victory : de.ui.defeat, size: 1.7 },
          { text: `${names[me]} ${view.wins[me]} : ${view.wins[opp]} ${names[opp]}`, size: 1.05 },
          ...(reason ? [{ text: reason, size: 0.85 }] : []),
          { text: `Schaden auf die Waage: ${P[shown].stats.direct}`, size: 0.9 },
          { text: `Gegner besiegt: ${P[shown].stats.kills}`, size: 0.9 },
          { text: `Karten gespielt: ${P[shown].stats.played}`, size: 0.9 },
        ],
      },
      ...(bestCard ? [{ id: "beste", x: 8, z: 17.6, w: 17, h: 3.6, ry: -0.03, lines: [{ text: `Stärkste Karte · ${best.dmg} Schaden`, size: 1 }] }] : []),
      // Gehen: ein Zettel rechts vorn, gut sichtbar (links vom eigenen Stapel, der sonst den Klick abfängt) — nicht nur klein im Menü
      ...(onExit ? [{ id: "aufstehen", x: 27, z: 25, w: 21, h: 6.4, ry: -0.06, mark: true, click: true, lines: [{ text: "Aufstehen", size: 1.3 }, { text: "zurück ins Hauptmenü", size: 0.85 }] }] : []),
    ],
    // links die eigene Kerze, rechts die des Gegenübers: sie brennt, sobald derjenige eine Revanche will
    candles: [myRematch, oppRematch],
  };

  const rematch = () => {
    if (!canRematch || myRematch) return;
    sound.play("fire");
    onRematch();
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "loose") { if (bestCard) setDetail(bestCard); return; }
    if (p.type === "candle" && how === "click") rematch();
    if (p.type === "note" && p.id === "aufstehen" && how === "click" && onExit) { sound.play("creak"); onExit(); }
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    if (p?.type === "candle") {
      if (!canRematch) content = null;
      else if (myRematch) content = T("Deine Kerze brennt", oppRematch ? null : `Warte auf ${names[opp]} …`);
      else content = T("Kerze anzünden: Revanche", oppRematch ? `${names[opp]} wartet schon.` : "Neues Match mit neuem Seed, sobald beide wollen.");
    } else if (p?.type === "note" && p.id === "ergebnis") content = T(you === null ? `Zahlen von ${names[shown]}` : "Deine Zahlen in diesem Match");
    else if (p?.type === "note" && p.id === "aufstehen") content = T("Aufstehen", "Zurück ins Hauptmenü.");
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
    room.setUi({});
    room.setTimer(null);
  });

  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (detail) return;
      setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [detail]);

  const notice = !canRematch ? null
    : myRematch ? `Deine Kerze brennt – warte auf ${names[opp]} …`
      : oppRematch ? `${names[opp]} will eine Revanche: zünde eine Kerze an.`
        : onExit ? "Revanche? Zünde eine Kerze an – oder steh auf (Zettel rechts)." : "Revanche? Zünde eine Kerze an.";

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {won && (
        <ErgebnisTeilen className="st-menu-btn is-teilen" mitSymbol={false}
          ergebnis={() => duellErgebnis({
            siege: view.wins, ich: you, stats: P[you].stats, zirkel: getZirkel(zirkel)?.name,
            staerkste: W === you && best ? CARDS[best.id]?.name : "", aufgabe: view.endReason === "surrender",
          })}>
          Ergebnis teilen
        </ErgebnisTeilen>
      )}
      {(notice || status) && <div className="st-toast ss-paper" role="status">{notice || status}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title={you === null ? `${names[W]} gewinnt` : won ? de.ui.victory : de.ui.defeat}
          sub={<>{you === null ? "" : won ? de.ui.matchWon : de.ui.matchLost} {names[0]} {view.wins[0]} : {view.wins[1]} {names[1]}{reason ? ` · ${reason}` : ""}</>}
          extra={<>
            {canRematch && !myRematch && <button type="button" className="ss-btn" onClick={() => { setPaused(false); rematch(); }}>{de.ui.rematch}</button>}
            {onExit && <button type="button" className="ss-btn" onClick={onExit}>Zum Hauptmenü</button>}
          </>}
          onClose={() => setPaused(false)}
          onSurrender={null}
          onFallback={onFallback}
          help={<>
            Eine Kerze anklicken: Revanche (neues Match mit neuem Seed, sobald beide wollen) · Zettel „Aufstehen“: zurück ins
            Hauptmenü · Karte anklicken: ansehen · der Zettel links zeigt den Ausgang und drei Zahlen des Matches.
          </>}
        />
      )}
    </>
  );
}
