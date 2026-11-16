// ui/KillCurve.jsx — Kill-Verlauf eines Laufs für die Auswertung: Kills pro Minute über die Zeit, senkrechte Striche,
// wo eine neue Welt begann, der stärkste Abschnitt beschriftet. Darunter dieselben Zahlen je Welt als Tabelle.
// Die Daten zeichnet engine/timeline.js auf. Mit der Maus (oder Pfeiltasten) lässt sich jeder Abschnitt ablesen.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BIOMES } from "../data/biomes.js";
import { summarizeTimeline } from "../engine/timeline.js";
import { fmtTime } from "../engine/util.js";

const H = 200;
const PAD = { l: 48, r: 14, t: 40, b: 26 };
const num = (n) => n.toLocaleString("de-DE");
const worldName = (w) => `${BIOMES[w.index]?.name || `Welt ${w.index + 1}`}${w.loop > 0 ? ` · Zyklus ${w.loop + 1}` : ""}`;

// Runde Obergrenze mit höchstens vier Schritten
function niceScale(max) {
  const steps = [20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  const step = steps.find((s) => max / s <= 4) || 50000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

// Zeitmarken unten: höchstens etwa acht
function timeTicks(end) {
  const step = [60, 120, 300, 600, 900, 1800].find((s) => end / s <= 8) || 3600;
  const out = [];
  for (let t = 0; t <= end; t += step) out.push(t);
  return out;
}

export default function KillCurve({ stats, time }) {
  const data = useMemo(() => summarizeTimeline(stats, time), [stats, time]);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  if (!data) return null;
  const { points, worlds, peak, end } = data;
  const plotW = Math.max(10, width - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const scale = niceScale(peak.perMin);
  const x = (t) => PAD.l + (t / end) * plotW;
  const y = (v) => PAD.t + plotH - (v / scale.top) * plotH;

  const first = points[0];
  const last = points[points.length - 1];
  const line = [`M${x(0).toFixed(1)} ${y(first.perMin).toFixed(1)}`, ...points.map((p) => `L${x(p.t).toFixed(1)} ${y(p.perMin).toFixed(1)}`), `L${x(last.to).toFixed(1)} ${y(last.perMin).toFixed(1)}`].join(" ");
  const area = `${line} L${x(last.to).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;

  const at = hover == null ? null : points[hover];
  const atWorld = at && (worlds.find((w) => at.t >= w.from && at.t < w.to) || worlds[worlds.length - 1]);
  const peakLeft = x(peak.t) > PAD.l + plotW * 0.7;

  const pick = (clientX) => {
    const box = wrapRef.current.getBoundingClientRect();
    const t = ((clientX - box.left - PAD.l) / plotW) * end;
    setHover(Math.max(0, Math.min(points.length - 1, Math.floor(t / (points[0].to - points[0].from)))));
  };
  const onKey = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(points.length - 1, (h ?? points.indexOf(peak)) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  return (
    <section className="mt-5 av-slot px-3 py-3 sm:px-4 sm:py-4" aria-label="Kill-Verlauf">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="av-title text-[18px]">Kill-Verlauf</h2>
        <span className="text-[13px] av-faint">Kills pro Minute</span>
      </div>

      <div
        ref={wrapRef} className="relative mt-2 select-none" style={{ height: H, touchAction: "pan-y" }} tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}
        onKeyDown={onKey} onBlur={() => setHover(null)}
        aria-label={`Kurve der Kills pro Minute. Stärkster Abschnitt: ${num(peak.perMin)} pro Minute bei ${fmtTime(peak.from)}. Pfeiltasten lesen einzelne Abschnitte ab; die Tabelle darunter nennt die Werte je Welt.`}
      >
        {width > 0 && (
          <svg width={width} height={H} role="presentation" style={{ display: "block", fontFamily: "inherit" }}>
            {/* Hilfslinien: Haarlinien, zurückhaltend */}
            {scale.ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--av-line)" strokeWidth="1" />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--av-faint)" style={{ fontVariantNumeric: "tabular-nums" }}>{num(v)}</text>
              </g>
            ))}
            {timeTicks(end).map((t) => (
              <text key={t} x={x(t)} y={H - 7} textAnchor={t === 0 ? "start" : "middle"} fontSize="12" fill="var(--av-faint)" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(t)}</text>
            ))}

            {/* Welten: Strich am Beginn, Name darüber — nur wenn er in den Abschnitt passt */}
            {worlds.map((w, i) => {
              const name = BIOMES[w.index]?.name || "";
              const room = x(Math.min(w.to, end)) - x(w.from);
              return (
                <g key={`${w.from}-${i}`}>
                  {i > 0 && w.from < end && <line x1={x(w.from)} x2={x(w.from)} y1={PAD.t - 16} y2={PAD.t + plotH} stroke="rgb(239 230 210 / 0.26)" strokeWidth="1" />}
                  {room >= name.length * 7.4 + 12 && <text x={x(w.from) + (i > 0 ? 6 : 0)} y={PAD.t - 22} fontSize="12" fill="var(--av-dim)">{name}</text>}
                </g>
              );
            })}

            <path d={area} fill="var(--av-torch)" opacity="0.1" />
            <path d={line} fill="none" stroke="var(--av-torch)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {/* Stärkster Abschnitt: Punkt mit Ring in Flächenfarbe, Wert in Textfarbe */}
            <circle cx={x(peak.t)} cy={y(peak.perMin)} r="6" fill="var(--av-stone-2)" />
            <circle cx={x(peak.t)} cy={y(peak.perMin)} r="4" fill="var(--av-torch)" />
            <text x={x(peak.t) + (peakLeft ? -10 : 10)} y={y(peak.perMin) - 7} textAnchor={peakLeft ? "end" : "start"} fontSize="13" fill="var(--av-ink)"
              stroke="var(--av-stone-2)" strokeWidth="4" paintOrder="stroke" style={{ fontVariantNumeric: "tabular-nums" }}>
              Spitze {num(peak.perMin)}
            </text>

            {at && (
              <g pointerEvents="none">
                <line x1={x(at.t)} x2={x(at.t)} y1={PAD.t - 16} y2={PAD.t + plotH} stroke="var(--av-ink)" strokeWidth="1" opacity="0.55" />
                <circle cx={x(at.t)} cy={y(at.perMin)} r="6" fill="var(--av-stone-2)" />
                <circle cx={x(at.t)} cy={y(at.perMin)} r="4" fill="var(--av-ink)" />
              </g>
            )}
          </svg>
        )}
        {at && width > 0 && (
          <div
            className="absolute pointer-events-none av-block px-3 py-2 text-[13px] leading-snug whitespace-nowrap"
            style={{ top: 0, left: Math.max(4, Math.min(width - 184, x(at.t) + (x(at.t) > width / 2 ? -192 : 12))), width: 180 }}
          >
            <div className="av-faint av-num">{fmtTime(at.from)} – {fmtTime(at.to)} · {atWorld ? worldName(atWorld) : ""}</div>
            <div className="mt-0.5"><span className="av-num text-[17px]">{num(at.perMin)}</span> <span className="av-dim">Kills pro Minute</span></div>
            <div className="av-faint av-num">{num(at.kills)} Kills in {Math.round(at.to - at.from)} s</div>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto av-scroll">
        <table className="w-full text-[14px] av-num">
          <thead>
            <tr className="text-left av-faint text-[12px]">
              <th scope="col" className="font-normal py-1 pr-3">Welt</th>
              <th scope="col" className="font-normal py-1 px-3 text-right">Dauer</th>
              <th scope="col" className="font-normal py-1 px-3 text-right">Kills</th>
              <th scope="col" className="font-normal py-1 pl-3 text-right">pro Minute</th>
            </tr>
          </thead>
          <tbody>
            {worlds.map((w, i) => (
              <tr key={`${w.from}-${i}`} style={{ boxShadow: "inset 0 1px 0 0 var(--av-line)" }}>
                <th scope="row" className="font-normal text-left py-1.5 pr-3 whitespace-nowrap">{worldName(w)}</th>
                <td className="py-1.5 px-3 text-right av-dim">{fmtTime(w.to - w.from)}</td>
                <td className="py-1.5 px-3 text-right">{num(w.kills)}</td>
                <td className="py-1.5 pl-3 text-right av-dim">{w.perMin ? num(w.perMin) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
