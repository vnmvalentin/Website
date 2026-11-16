// ui/run/TableRunFx.jsx — große Momente der Moorwanderung am Tisch (Rebuild „Am Tisch“, Phase 6).
//
// Am Tisch im Kerzenlicht ersetzen sie die Vollbild-Einblendungen aus RunFx.jsx:
//   TableSealBreak    ein Wachssiegel fällt auf den Tisch und springt in zwei Hälften (scene: lifeSealBreak), unten
//                     eine Zeile, wie viele Siegel bleiben. Der Tisch dahinter bleibt, wie er ist.
//   TableDuelAnnounce die Duellrunde beginnt: Die Paarungen werden als Zettel nacheinander auf den leeren Tisch gelegt,
//                     die eigene hervorgehoben. Danach setzt sich das Gegenüber zum eigenen Duell (RunBattle).
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TableHost from "../table/TableHost.jsx";
import { useTableKeeper } from "../table/tableKeeperContext.js";
import { rowX, stageModel } from "../table/stageModel.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

/** So lange steht der Siegelbruch (die Szene braucht 3 s bis das Siegel weg ist). */
const SEAL_MS = 3200;
/** Abstand, in dem die Paarungen auf den Tisch gelegt werden; Nachlauf, bis das Duell beginnt. */
const DEAL_MS = 380;
const DEAL_TAIL_MS = 1700;

/** Name eines Gegners ohne Menschen (Spiegelgeist/Moorfürst). @param {any} view @param {any} ghost */
function ghostName(view, ghost) {
  if (!ghost) return "?";
  return ghost.kind === "lord" ? de.run.lord : de.run.mirror(view.players[ghost.of]?.name || "?");
}

/**
 * Ein Lebenssiegel bricht — am stehenden Tisch, egal welcher Bildschirm ihn gerade hält.
 * @param {{ left: number, total: number, reason: string, onDone: () => void }} props
 */
export function TableSealBreak({ left, total, reason, onDone }) {
  const keeper = useTableKeeper();
  const room = keeper?.state === "bereit" ? keeper.room : null;
  const started = useRef(false);
  useEffect(() => {
    if (room && !started.current) {
      started.current = true;
      room.lifeSealBreak({ x: 0, z: 22 });
    }
  }, [room]);
  useEffect(() => {
    const t = setTimeout(onDone, SEAL_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!keeper?.root) return null;
  return createPortal(
    <div className="st-banner st-banner-low" role="status">
      <p className="ss-title">Ein Siegel bricht</p>
      <p className="st-banner-sub">{reason === "boss" ? "Der Pfad-Boss hat dich bezwungen." : "Du hast das Duell verloren."} Noch {left} von {total}.</p>
      {left === 1 && <p className="st-banner-sub">Das nächste verlorene Duell beendet deine Wanderung.</p>}
    </div>,
    keeper.root,
  );
}

/**
 * Die Duellrunde beginnt: Paarungen als Zettel auf dem Tisch.
 * @param {{ room: any, view: any, pairs: any[], round: number, you: number|null, onDone: () => void }} props
 */
function AnnounceAtTable({ room, view, pairs, round, you, onDone }) {
  const [dealt, setDealt] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ts = pairs.map((_, i) => setTimeout(() => { setDealt(i + 1); sound.play("draw"); }, 250 + i * DEAL_MS));
    const end = setTimeout(() => done.current(), 250 + pairs.length * DEAL_MS + DEAL_TAIL_MS);
    return () => { ts.forEach(clearTimeout); clearTimeout(end); };
  }, [pairs]);
  const name = (q) => view.players[q]?.name || "?";
  const perRow = pairs.length > 4 ? 3 : 2;
  const notes = [
    { id: "duellrunde", x: 0, z: -29, w: 40, h: 8, ry: 0.015, lines: [{ text: `${de.run.duels} ${round}`, size: 1.6 }, { text: "Wer verliert, verliert ein Siegel.", size: 0.8 }] },
    ...pairs.slice(0, dealt).map((x, i) => {
      const r = Math.floor(i / perRow);
      const inRow = Math.min(perRow, pairs.length - r * perRow);
      const b = x.seats[1];
      const mine = you !== null && x.seats.includes(you);
      return {
        id: `paar:${x.id}`, x: rowX(inRow, 30)[i % perRow], z: -12 + r * 13, w: 27, h: 10.5, ry: [0.035, -0.025, 0.02][i % 3], mark: mine, click: true,
        lines: [{ text: name(x.seats[0]), size: 1.1 }, { text: "gegen", size: 0.7 }, { text: b !== null && b !== undefined ? name(b) : ghostName(view, x.ghost), size: 1.1 }],
      };
    }),
  ];
  const model = { ...stageModel({ stage: "camp", zirkel: view.settings.zirkel, seat: 0, myTurn: false, oppTurn: false }), notes };
  useEffect(() => {
    room.setHandlers({ onIntent: () => {}, onHover: () => {} });
    room.setPose("brett");
    // Überspringen: jeder Klick (auch auf leeres Holz, das die Szene nicht meldet) oder Leertaste/Enter/Esc
    const skip = () => done.current();
    const onKey = (e) => { if ([" ", "Enter", "Escape"].includes(e.key)) skip(); };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKey);
    return () => {
      room.setHandlers(null);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
    };
  }, [room]);
  useEffect(() => {
    room.sync(model);
    room.setUi({});
    room.setTimer(null);
  });
  return <div className="st-toast ss-paper" role="status">Die Duellrunde beginnt – klicken, um gleich loszulegen.</div>;
}

/** @param {{ view: any, pairs: any[], round: number, you: number|null, onDone: () => void, onFallback: () => void }} props */
export function TableDuelAnnounce({ view, pairs, round, you, onDone, onFallback }) {
  return (
    <TableHost zirkel={view.settings.zirkel} seated={false} onFallback={onFallback}>
      {(room) => <AnnounceAtTable room={room} view={view} pairs={pairs} round={round} you={you} onDone={onDone} />}
    </TableHost>
  );
}
