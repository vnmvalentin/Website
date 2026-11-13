// components/Bracket.jsx — Turnierbaum: eine Spalte je Runde, Paarungen stehen mittig vor ihren beiden Vorgängern.
// Laufende Spiele haben einen Link zum Zuschauen. Der Veranstalter (onDecide gesetzt) kann in offenen Paarungen einen
// Spieler anklicken und mit einem zweiten Klick zum Sieger erklären.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import Countdown from "./Countdown.jsx";
import { matchInfo } from "../matchInfo.js";
import { roundName } from "../tournament.js";

const HOW = { forfeit: "Aufgabe", walkover: "kampflos", bye: "Freilos", admin: "entschieden" };

function Slot({ match, side, players, me, armed, onArm }) {
  const id = match[side];
  const player = id ? players.get(id) : null;
  const done = match.status === "done";
  const won = done && match.winner === id;
  const score = done && match.score ? match.score[side === "a" ? 0 : 1] : null;
  const canDecide = !!onArm && !done && match.a && match.b;
  const key = `${match.id}:${id}`;
  const cls = `fk-bm-row${won ? " won" : ""}${done && !won ? " lost" : ""}${id && id === me ? " me" : ""}`;

  let name;
  if (player) name = player.name;
  else if (match.round === 0 && done) name = "Freilos";
  else name = "offen";

  const inner = (
    <>
      <span className={`fk-cap fk-cap-${side === "a" ? 0 : 1}`} aria-hidden="true" />
      <span className={`name truncate${player ? "" : " fk-faint"}`}>{name}</span>
      {canDecide && armed === key && <span className="fk-chip ml-auto" style={{ color: "var(--fk-lime)" }}>Sieger? Nochmal klicken</span>}
      {score !== null && <span className="fk-num ml-auto font-bold">{score}</span>}
    </>
  );
  if (!canDecide) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" className={`${cls} decide`} title={`${name} zum Sieger erklären`} onClick={() => onArm(key, match, id)}>
      {inner}
    </button>
  );
}

export default function Bracket({ rounds, rules, players, me, offset = 0, onDecide = null }) {
  const [armed, setArmed] = useState(null);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const total = rounds.length;
  const onArm = onDecide
    ? (key, match, playerId) => {
      if (armed !== key) {
        setArmed(key);
        return;
      }
      setArmed(null);
      onDecide(match, playerId);
    }
    : null;

  return (
    <div className="fk-bracket" role="group" aria-label="Turnierbaum">
      {rounds.map((round, r) => (
        <div key={r} className="fk-bracket-round">
          <div className="fk-bracket-head">
            <span className="block font-bold leading-tight">{roundName(total, r)}</span>
            <span className="block fk-faint text-[12px] leading-snug truncate">{rules[r] ? matchInfo(rules[r]) : ""}</span>
          </div>
          <div className="fk-bracket-list">
            {round.map((m) => {
              const mine = me && (m.a === me || m.b === me);
              const live = m.status === "live";
              const ready = m.status === "ready";
              return (
                <div key={m.id} className={`fk-bm${live ? " live" : ""}${mine ? " mine" : ""}`}>
                  <Slot match={m} side="a" players={byId} me={me} armed={armed} onArm={onArm} />
                  <Slot match={m} side="b" players={byId} me={me} armed={armed} onArm={onArm} />
                  {(live || ready || (m.status === "done" && HOW[m.how])) && (
                    <div className="fk-bm-foot">
                      {live && <span className="fk-lime font-bold">läuft</span>}
                      {ready && <span>wartet auf Spieler · {m.deadline ? <Countdown until={m.deadline - offset} /> : null}</span>}
                      {m.status === "done" && <span>{HOW[m.how]}</span>}
                      {(live || ready) && m.room && !mine && (
                        <Link to={`/flick-soccer/${m.room}`} className="inline-flex items-center gap-1 hover:text-[var(--fk-text)]">
                          <Eye size={13} /> Zuschauen
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
