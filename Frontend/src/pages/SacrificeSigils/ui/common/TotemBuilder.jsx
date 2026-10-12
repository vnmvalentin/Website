// ui/common/TotemBuilder.jsx — Totem aus Kopf und Körper zusammensetzen (Totem-Schrein auf dem Pfad, Lager der Moorwanderung).
//   Links die Köpfe (WER bekommt es), rechts die Körper (WAS sie bekommen), darunter die Vorschau des fertigen Totems
//   mit dem Platz, den es ersetzt, und die aktiven Totems – jeweils mit Kopf, Körper und Wirkung.
import React, { useState } from "react";
import SigilIcon from "../icons/SigilIcon.jsx";
import { combineError, SIDE_ONLY_SIGILS, totemSlot } from "../../data/totems.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { de, errorText } from "../../i18n/de.js";
import { baseDesc, baseName, headKind, headName, headTarget, slotLabel, totemText } from "./totemText.js";
import "./totemBuilder.css";

/** Einschränkung eines Körpers als kurzer Hinweis (oder null). @param {any} base */
function baseLimit(base) {
  if (base.kind === "prop") return de.totems.onlyLane;
  if (SIDE_ONLY_SIGILS.includes(base.sigil)) return de.totems.onlySide;
  return null;
}

/** Ein aktives Totem: Platz, Kopf, Körper, Wirkung. */
export function TotemSummary({ slot, totem, zirkel }) {
  return (
    <div className="ss-tb-active">
      <p className="ss-title !text-[var(--ink)] text-sm">{slotLabel(slot)}</p>
      {totem ? (
        <>
          <p className="text-sm">
            <span className="ss-tb-tag">{de.totems.head}</span> {headName(totem.head, zirkel)} <span className="opacity-60">· trifft {headTarget(totem.head, zirkel)}</span>
          </p>
          <p className="text-sm flex items-center gap-1 flex-wrap">
            <span className="ss-tb-tag">{de.totems.base}</span>
            {totem.base.kind === "sigil" && <SigilIcon sigil={totem.base.sigil} size={16} />}
            {baseName(totem.base)}
          </p>
          <p className="text-xs opacity-75 mt-0.5">{totemText(totem.head, totem.base, zirkel)} {totem.base.kind === "sigil" ? baseDesc(totem.base) : ""}</p>
        </>
      ) : <p className="text-sm opacity-60">–</p>}
    </div>
  );
}

/**
 * @param {{ heads: any[], bases: any[], totems: any, zirkel: string, onBuild: (head: number, base: number) => void, buildLabel?: string }} props
 */
export default function TotemBuilder({ heads, bases, totems, zirkel, onBuild, buildLabel = "Totem zusammensetzen" }) {
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [base, setBase] = useState(/** @type {number|null} */ (null));
  const z = getZirkel(zirkel);
  const h = head !== null ? heads[head] : null;
  const b = base !== null ? bases[base] : null;
  const err = h && b ? combineError(h, b, z) : null;
  const slot = h ? totemSlot(h) : null;
  const current = slot ? totems?.[slot] : null;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <section>
          <p className="ss-title !text-[var(--ink)]">{de.totems.headRole}</p>
          <p className="text-xs opacity-70 mb-1">{de.totems.headHint}</p>
          {heads.map((x, i) => (
            <button key={i} type="button" aria-pressed={head === i} className={`ss-tb-row ${head === i ? "ss-tb-sel" : ""}`} onClick={() => setHead(i)}>
              <span className="ss-tb-kind">{headKind(x)}</span>
              <span className="ss-title !text-[var(--ink)] text-[15px]">{headName(x, zirkel)}</span>
              <span className="text-sm opacity-75">trifft {headTarget(x, zirkel)}</span>
            </button>
          ))}
        </section>
        <section>
          <p className="ss-title !text-[var(--ink)]">{de.totems.baseRole}</p>
          <p className="text-xs opacity-70 mb-1">{de.totems.baseHint}</p>
          {bases.map((x, i) => {
            const clash = h ? combineError(h, x, z) : null;
            const limit = baseLimit(x);
            return (
              <button key={i} type="button" aria-pressed={base === i} className={`ss-tb-row ${base === i ? "ss-tb-sel" : ""} ${clash ? "ss-tb-clash" : ""}`} onClick={() => setBase(i)}>
                <span className="flex items-center gap-1.5">
                  {x.kind === "sigil" && <SigilIcon sigil={x.sigil} size={18} />}
                  <span className="ss-title !text-[var(--ink)] text-[15px]">{baseName(x)}</span>
                  {limit && <span className="ss-tb-kind">{limit}</span>}
                </span>
                <span className="text-sm opacity-75">{baseDesc(x)}</span>
              </button>
            );
          })}
        </section>
      </div>

      {/* Vorschau: Kopf + Körper = Wirkung, und welcher Platz ersetzt wird */}
      <div className="ss-tb-preview" aria-live="polite">
        <div className="ss-tb-stack" aria-hidden>
          <span className={`ss-tb-piece ${h ? "" : "ss-tb-empty"}`}>{h ? headName(h, zirkel) : de.totems.head}</span>
          <span className={`ss-tb-piece ss-tb-body ${b ? "" : "ss-tb-empty"}`}>{b ? baseName(b) : de.totems.base}</span>
        </div>
        <div className="min-w-0 flex-1">
          {h && b && !err ? (
            <>
              <p className="ss-title !text-[var(--ink)]">{totemText(h, b, zirkel)}</p>
              {b.kind === "sigil" && <p className="text-sm"><b>{baseName(b)}:</b> {baseDesc(b)}</p>}
              <p className="text-xs opacity-70 mt-1">
                {current ? `${de.totems.replaces(slotLabel(slot))}: ${totemText(current.head, current.base, zirkel)}` : de.totems.newSlot(slotLabel(slot))}
              </p>
            </>
          ) : err ? (
            <p className="text-sm text-[var(--wax-red)]">{errorText(err)}</p>
          ) : (
            <p className="text-sm opacity-70">Wähle einen Kopf und einen Körper.</p>
          )}
        </div>
        <button type="button" className="ss-seal shrink-0" disabled={!h || !b || !!err} onClick={() => { onBuild(/** @type {number} */ (head), /** @type {number} */ (base)); setHead(null); setBase(null); }}>
          {buildLabel}
        </button>
      </div>

      <div>
        <p className="ss-title !text-[var(--ink)] mb-1">Aktive Totems</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {["tribe", "lane", "side"].map((s) => <TotemSummary key={s} slot={s} totem={totems?.[s]} zirkel={zirkel} />)}
        </div>
      </div>
    </div>
  );
}
