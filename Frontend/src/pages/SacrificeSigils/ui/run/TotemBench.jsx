// ui/run/TotemBench.jsx — Totems im Lager umbauen: vorhandene Köpfe und Körper neu kombinieren (kein neues Teil).
import React, { useState } from "react";
import TotemBuilder from "../common/TotemBuilder.jsx";
import { errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

/** @param {{ player: any, zirkel: string, send: (a: any) => Promise<any> }} props */
export default function TotemBench({ player, zirkel, send }) {
  const [msg, setMsg] = useState(/** @type {string|null} */ (null));
  const build = async (/** @type {number} */ head, /** @type {number} */ base) => {
    sound.play("creak");
    const res = await send({ type: "campTotem", head, base });
    setMsg(res?.ok ? "Totem umgebaut." : errorText(res?.error));
  };
  return (
    <div className="ss-paper p-4 space-y-3">
      <p className="ss-title !text-[var(--ink)] text-xl">Totems umbauen</p>
      <TotemBuilder heads={player.heads || []} bases={player.bases || []} totems={player.totems} zirkel={zirkel} onBuild={build} buildLabel="Zusammensetzen" />
      {msg && <p className="text-sm" role="status">{msg}</p>}
    </div>
  );
}
