// ui/screens/ExtrasScreen.jsx — nach dem Draft: 1 Totem-Kopf (mit Start-Basis) und 1 Nebendeck-Typ wählen.
// Gemeinsamer Pool: nacheinander und exklusiv, der Erstzugriff wechselt (Kopf: A zuerst, Nebendeck: B zuerst).
// Getrennte Pools: beide gleichzeitig.
import React, { useState } from "react";
import Card from "../card/Card.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import { resolveCard } from "../../engine/cards.js";
import { SIDE_TYPES } from "../../engine/battle.js";
import { extrasTurn } from "../../engine/draft.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { totemText } from "../common/totemText.js";
import "./screens.css";

/** @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], timers?: any, clockOffset?: number }} props */
export default function ExtrasScreen({ view, you, send, names, timers, clockOffset = 0 }) {
  const d = view.draft;
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [side, setSide] = useState(/** @type {string|null} */ (null));
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const step = extrasTurn(d);
  const sequential = d.mode === "shared";
  const mine = you !== null ? d.extras[you] : null;
  const done = mine && mine.head !== null && mine.side !== null;
  const opp = you === null ? null : d.extras[1 - you];
  const myTurn = you !== null && (sequential ? step?.[0] === you : !done);
  const canHead = myTurn && (!sequential || step?.[1] === "head");
  const canSide = myTurn && (!sequential || step?.[1] === "side");
  const headOwner = (/** @type {number} */ i) => (sequential ? [0, 1].find((q) => d.extras[q].head === i) : undefined);
  const sideOwner = (/** @type {string} */ k) => (sequential ? [0, 1].find((q) => d.extras[q].side === k) : undefined);
  const who = (/** @type {number} */ q) => (q === you ? de.ui.you : names[q]);

  const confirm = async () => {
    sound.play("seal");
    const action = !sequential ? { type: "draftExtras", head, side } : step?.[1] === "head" ? { type: "draftExtras", head } : { type: "draftExtras", side };
    const res = await send(action);
    if (!res?.ok) setErr(errorText(res?.error));
    else setErr(null);
  };

  let status;
  if (sequential && step) status = step[0] === you ? `Du wählst ${step[1] === "head" ? "deinen Totem-Kopf" : "dein Nebendeck"}` : `${names[step[0]]} wählt ${step[1] === "head" ? "einen Totem-Kopf" : "ein Nebendeck"} …`;
  else if (you === null) status = "Die Zeichner wählen …";
  else if (done) status = opp?.chosen || opp?.head !== null ? "Gewählt." : `Gewählt – ${names[1 - you]} wählt noch …`;
  else status = "Wähle Totem-Kopf und Nebendeck";
  const timer = sequential ? (step ? timers?.[step[0]] : undefined) : (you !== null ? timers?.[you] : undefined);
  const ready = sequential ? (step?.[1] === "head" ? head !== null : !!side) : head !== null && !!side;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-5">
      <div className="ss-draft-head">
        <div className="min-w-0">
          <p className="ss-title text-lg ss-dim">Totem-Kopf und Nebendeck</p>
          <p className={`ss-title ss-draft-status ${myTurn ? "ss-mine" : ""}`} role="status">{status}</p>
          <p className="ss-dim text-sm">
            {sequential
              ? <>Gewähltes ist für den anderen weg. Kopf wählt zuerst: <b>{who(d.extraOrder[0][0])}</b> · Nebendeck zuerst: <b>{who(d.extraOrder[2][0])}</b></>
              : <>Der Kopf kommt mit einer Start-Basis; im Totem-Schrein auf dem Pfad kannst du beides später umbauen.</>}
          </p>
        </div>
        {timer && <TurnTimer timer={timer} clockOffset={clockOffset} />}
      </div>
      <section>
        <p className="ss-title mb-2">Totem-Kopf</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {d.heads.map((h, i) => {
            const owner = headOwner(i);
            const enabled = canHead && owner === undefined;
            return (
              <button key={i} type="button" disabled={!enabled} onClick={() => setHead(i)} className={`ss-paper p-4 text-left transition-transform relative ${head === i && canHead ? "ring-2 ring-[var(--wax-red)] -translate-y-1" : enabled ? "hover:-translate-y-0.5" : ""} ${owner !== undefined ? "opacity-45" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="ss-totem-figure" aria-hidden />
                  <div>
                    <p className="ss-title !text-[var(--ink)]">{h.head.kind === "tribe" ? `${de.totems.tribeHead}: ${de.tribes[h.head.tribe].name}` : `${de.totems.laneHead}: ${de.totems.lane(h.head.lane)}`}</p>
                    <p className="text-sm flex items-center gap-1">{h.base.kind === "sigil" && <SigilIcon sigil={h.base.sigil} size={18} />}{h.base.kind === "sigil" ? de.sigils[h.base.sigil].name : de.totems.props[h.base.prop].name}</p>
                  </div>
                </div>
                <p className="text-sm mt-2 opacity-80">{totemText(h.head, h.base)}</p>
                {owner !== undefined && <span className="ss-badge absolute top-2 right-2">{who(owner)}</span>}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <p className="ss-title mb-2">Nebendeck (unendlich)</p>
        <div className="flex flex-wrap gap-4">
          {Object.entries(SIDE_TYPES).map(([key, id]) => {
            const owner = sideOwner(key);
            const enabled = canSide && owner === undefined;
            return (
              <button key={key} type="button" disabled={!enabled} onClick={() => setSide(key)} className={`relative flex flex-col items-center gap-2 p-2 rounded ${side === key && canSide ? "ring-2 ring-[var(--candle)] bg-white/5" : ""} ${owner !== undefined ? "opacity-45" : ""}`}>
                <Card card={resolveCard(id, [], key)} width={120} />
                <span className="text-sm ss-dim max-w-[140px] text-center">{de.sides[key].desc}</span>
                {owner !== undefined && <span className="ss-badge absolute top-3 right-3">{who(owner)}</span>}
              </button>
            );
          })}
        </div>
      </section>
      {myTurn && (
        <div className="flex items-center gap-4">
          <button type="button" className="ss-seal" disabled={!ready} onClick={confirm}>{de.ui.confirm}</button>
          {err && <span className="text-[var(--wax-red-light)]">{err}</span>}
        </div>
      )}
    </div>
  );
}
