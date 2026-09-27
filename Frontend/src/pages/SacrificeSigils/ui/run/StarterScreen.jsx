// ui/run/StarterScreen.jsx — Startdeck wählen: drei feste Decks, alle wählen gleichzeitig (auch dasselbe).
import React, { useState } from "react";
import Card from "../card/Card.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import { resolveCard } from "../../engine/cards.js";
import { startersOf } from "../../data/modes/moorwanderung/starterDecks.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { sideName } from "../common/totemText.js";

/** @param {{ view: any, you: number|null, send: (a: any) => Promise<any>, timers?: any, clockOffset?: number }} props */
export default function StarterScreen({ view, you, send, timers, clockOffset = 0 }) {
  const decks = startersOf(view.settings.zirkel);
  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const me = you !== null ? view.players[you] : null;
  const chosen = me?.starter;
  const ready = view.players.filter((P) => P.starter).length;

  const confirm = async () => {
    sound.play("seal");
    const res = await send({ type: "chooseStarter", deck: sel });
    setErr(res?.ok ? null : errorText(res?.error));
  };

  return (
    <div className="max-w-[1250px] mx-auto px-4 py-6 space-y-5">
      <div className="ss-draft-head">
        <div className="min-w-0">
          <p className="ss-title text-lg ss-dim">{de.run.title}</p>
          <p className="ss-title ss-draft-status ss-mine" role="status">{chosen ? de.run.waitingOthers : de.run.starterTitle}</p>
          <p className="ss-dim text-sm">{de.run.starterHint} {ready}/{view.players.length} haben gewählt.</p>
        </div>
        {you !== null && timers?.players?.[you] && !chosen && <TurnTimer timer={timers.players[you]} clockOffset={clockOffset} />}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        {decks.map((d) => {
          const active = (chosen || sel) === d.id;
          return (
            <button
              key={d.id}
              type="button"
              disabled={!!chosen || you === null}
              onClick={() => setSel(d.id)}
              className={`ss-paper p-4 text-left space-y-3 transition-transform ${active ? "ring-2 ring-[var(--wax-red)] -translate-y-1" : chosen ? "opacity-50" : "hover:-translate-y-0.5"}`}
            >
              <div>
                <p className="ss-title !text-[var(--ink)] text-xl">{d.name}</p>
                <p className="text-sm opacity-80">{d.idea}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {d.cards.map((id, i) => <Card key={`${id}${i}`} card={resolveCard(id, [], `${d.id}${i}`)} width={64} />)}
              </div>
              <p className="text-sm flex items-center gap-1.5">
                <SigilIcon sigil={d.sideSigil} size={20} />
                <span><b>{de.run.sideTotem}:</b> {sideName(view.settings.zirkel)} mit {de.sigils[d.sideSigil].name}</span>
              </p>
            </button>
          );
        })}
      </div>
      {you !== null && !chosen && (
        <div className="flex items-center gap-4">
          <button type="button" className="ss-seal" disabled={!sel} onClick={confirm}>{de.ui.confirm}</button>
          {err && <span className="text-[var(--wax-red-light)]">{err}</span>}
        </div>
      )}
    </div>
  );
}
