// ui/screens/ExtrasScreen.jsx — nach dem Draft: 1 Totem-Kopf (mit Start-Basis) und 1 Nebendeck-Typ wählen.
import React, { useState } from "react";
import Card from "../card/Card.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { resolveCard } from "../../engine/cards.js";
import { SIDE_TYPES } from "../../engine/battle.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { totemText } from "../common/totemText.js";
import "./screens.css";

/** @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[] }} props */
export default function ExtrasScreen({ view, you, send, names }) {
  const d = view.draft;
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [side, setSide] = useState(/** @type {string|null} */ (null));
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const mine = you !== null ? d.extras[you] : null;
  const done = mine && mine.head !== null;
  const opp = you === null ? null : d.extras[1 - you];

  const confirm = async () => {
    sound.play("seal");
    const res = await send({ type: "draftExtras", head, side });
    if (!res?.ok) setErr(errorText(res?.error));
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-6">
      <div>
        <p className="ss-title text-2xl">Totem-Kopf und Nebendeck</p>
        <p className="ss-dim">Der Kopf kommt mit einer Start-Basis; im Totem-Schrein auf dem Pfad kannst du beides später umbauen.</p>
      </div>
      {you === null && <p className="ss-dim">Die Zeichner wählen …</p>}
      {you !== null && !done && (
        <>
          <section>
            <p className="ss-title mb-2">Totem-Kopf</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {d.heads.map((h, i) => (
                <button key={i} type="button" onClick={() => setHead(i)} className={`ss-paper p-4 text-left transition-transform ${head === i ? "ring-2 ring-[var(--wax-red)] -translate-y-1" : "hover:-translate-y-0.5"}`}>
                  <div className="flex items-center gap-3">
                    <div className="ss-totem-figure" aria-hidden />
                    <div>
                      <p className="ss-title !text-[var(--ink)]">{h.head.kind === "tribe" ? `${de.totems.tribeHead}: ${de.tribes[h.head.tribe].name}` : `${de.totems.laneHead}: ${de.totems.lane(h.head.lane)}`}</p>
                      <p className="text-sm flex items-center gap-1">{h.base.kind === "sigil" && <SigilIcon sigil={h.base.sigil} size={18} />}{h.base.kind === "sigil" ? de.sigils[h.base.sigil].name : de.totems.props[h.base.prop].name}</p>
                    </div>
                  </div>
                  <p className="text-sm mt-2 opacity-80">{totemText(h.head, h.base)}</p>
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="ss-title mb-2">Nebendeck (unendlich)</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(SIDE_TYPES).map(([key, id]) => (
                <button key={key} type="button" onClick={() => setSide(key)} className={`flex flex-col items-center gap-2 p-2 rounded ${side === key ? "ring-2 ring-[var(--candle)] bg-white/5" : ""}`}>
                  <Card card={resolveCard(id, [], key)} width={120} />
                  <span className="text-sm ss-dim max-w-[140px] text-center">{de.sides[key].desc}</span>
                </button>
              ))}
            </div>
          </section>
          <div className="flex items-center gap-4">
            <button type="button" className="ss-seal" disabled={head === null || !side} onClick={confirm}>{de.ui.confirm}</button>
            {err && <span className="text-[var(--wax-red-light)]">{err}</span>}
          </div>
        </>
      )}
      {you !== null && done && <p className="ss-dim">Gewählt. {opp?.chosen || opp?.head !== null ? "" : `${names[1 - you]} wählt noch …`}</p>}
    </div>
  );
}
