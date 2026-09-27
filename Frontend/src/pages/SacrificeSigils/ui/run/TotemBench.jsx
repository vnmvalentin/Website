// ui/run/TotemBench.jsx — Totems im Lager umbauen: vorhandene Köpfe und Basen neu kombinieren (kein neues Teil).
import React, { useState } from "react";
import SigilIcon from "../icons/SigilIcon.jsx";
import { combineError, SIDE_ONLY_SIGILS } from "../../data/totems.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { headLabel, slotLabel, totemText } from "../common/totemText.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

/** @param {{ player: any, zirkel: string, send: (a: any) => Promise<any> }} props */
export default function TotemBench({ player, zirkel, send }) {
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [base, setBase] = useState(/** @type {number|null} */ (null));
  const [msg, setMsg] = useState(/** @type {string|null} */ (null));
  const heads = player.heads || [];
  const bases = player.bases || [];
  const err = head !== null && base !== null ? combineError(heads[head], bases[base], getZirkel(zirkel)) : null;
  const build = async () => {
    sound.play("creak");
    const res = await send({ type: "campTotem", head, base });
    setMsg(res?.ok ? "Totem umgebaut." : errorText(res?.error));
  };
  return (
    <div className="ss-paper p-4 space-y-3">
      <p className="ss-title !text-[var(--ink)] text-xl">Totems umbauen</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="ss-title !text-[var(--ink)] text-sm">Köpfe</p>
          {heads.map((h, i) => (
            <button key={i} type="button" className={`block w-full text-left px-2 py-1 border-b border-dashed border-black/20 ${head === i ? "bg-[#8e1b1b]/15" : ""}`} onClick={() => setHead(i)}>{headLabel(h)}</button>
          ))}
        </div>
        <div>
          <p className="ss-title !text-[var(--ink)] text-sm">Basen</p>
          {bases.map((b, i) => (
            <button key={i} type="button" className={`flex items-center gap-2 w-full text-left px-2 py-1 border-b border-dashed border-black/20 ${base === i ? "bg-[#8e1b1b]/15" : ""}`} onClick={() => setBase(i)}>
              {b.kind === "sigil" && <SigilIcon sigil={b.sigil} size={18} />}
              {b.kind === "sigil" ? `${de.sigils[b.sigil].name}${SIDE_ONLY_SIGILS.includes(b.sigil) ? " (nur Nebendeck)" : ""}` : `${de.totems.props[b.prop].name} (nur Lane)`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ss-seal" disabled={head === null || base === null || !!err} onClick={build}>Zusammensetzen</button>
        {err && <span className="text-sm text-[var(--wax-red)]">{errorText(err)}</span>}
        {msg && !err && <span className="text-sm">{msg}</span>}
      </div>
      <div className="text-sm">
        {["tribe", "lane", "side"].map((slot) => (
          <p key={slot}>{slotLabel(slot)}: {player.totems?.[slot] ? totemText(player.totems[slot].head, player.totems[slot].base, zirkel) : "–"}</p>
        ))}
      </div>
    </div>
  );
}
