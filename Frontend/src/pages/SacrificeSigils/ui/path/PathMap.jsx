// ui/path/PathMap.jsx — handgezeichnete Pergamentkarte des Pfads (Duellmodus und Moorwanderung).
//
// Quer auf breiten Bildschirmen (Ebenen von links nach rechts), hochkant auf dem Handy (von unten nach oben).
// Aquarellflecken in der Biom-Farbe, Kaffeeränder, gezeichnete Landschaft, Kompass und Kartusche mit dem Biom-Namen.
// Weiter entfernte Ebenen liegen im Nebel; kommt man näher, werden ihre Wege mit Tusche nachgezeichnet. Die geschnitzte
// Figur läuft den gezeichneten Weg entlang und hinterlässt Fußspuren. Knoten zeigen beim Überfahren (Maus) bzw. beim
// ersten Tippen (Touch) eine Vorschau mit Typ, Beschreibung und – bei Kämpfen – Porträt und Hausregel.
import React, { useEffect, useMemo, useRef, useState } from "react";
import NodeIcon from "./NodeIcon.jsx";
import Decor from "./mapDecor.jsx";
import WeatherCanvas from "./WeatherCanvas.jsx";
import NpcPortrait from "../common/NpcPortrait.jsx";
import { reachable, STRANDS } from "../../engine/path.js";
import { hashParts, streamFrom, rand } from "../../engine/rng.js";
import { NPC_BY_ID } from "../../data/modes/moorwanderung/npcs.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import "./path.css";

const GAP = 180;
const LANE = 150;

/** Hochkant-Layout für schmale Hochformat-Bildschirme. */
function useVertical() {
  const get = () => typeof window !== "undefined" && window.innerWidth < 760 && window.innerHeight > window.innerWidth;
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

/**
 * Geometrie der Karte.
 * @param {number} levels @param {boolean} vertical @param {number} pathNo
 */
function geometry(levels, vertical, pathNo) {
  const jitter = (/** @type {number} */ lv, /** @type {number} */ st, /** @type {string} */ axis) => ((hashParts("mapj", pathNo, lv, st, axis) % 1000) / 1000 - 0.5) * 26;
  if (vertical) {
    const W = 440;
    const H = 170 + levels * GAP;
    const pos = (/** @type {number} */ lv, /** @type {number} */ st) => ({ x: 80 + st * LANE + jitter(lv, st, "x") * 0.6, y: H - 150 - lv * GAP + jitter(lv, st, "y") });
    return { W, H, pos, start: { x: 80 + LANE, y: H - 40 } };
  }
  const W = 200 + levels * GAP + 60;
  const H = 3 * LANE + 130;
  const pos = (/** @type {number} */ lv, /** @type {number} */ st) => ({ x: 190 + lv * GAP + jitter(lv, st, "x"), y: 90 + st * LANE + jitter(lv, st, "y") * 0.6 });
  return { W, H, pos, start: { x: 60, y: 90 + LANE } };
}

/** Leicht geschwungene Tuschelinie zwischen zwei Punkten. */
function curve(/** @type {{x:number,y:number}} */ a, /** @type {{x:number,y:number}} */ b, /** @type {boolean} */ vertical) {
  if (vertical) {
    const my = (a.y + b.y) / 2;
    return `M${a.x} ${a.y}C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
}

/** Punkt auf derselben Kurve (für die laufende Figur). */
function curvePoint(/** @type {any} */ a, /** @type {any} */ b, /** @type {boolean} */ vertical, /** @type {number} */ t) {
  const c1 = vertical ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y };
  const c2 = vertical ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: b.y };
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** Vorschau eines Knotens: Typ, Beschreibung, bei Kämpfen Porträt und Hausregel. */
export function NodePreview({ node }) {
  if (!node) return null;
  const info = de.nodes[node.type] || de.nodes.event;
  const npc = node.npcId ? NPC_BY_ID[node.npcId] : node.bossId ? NPC_BY_ID[node.bossId] : null;
  const variant = node.variant && de.nodes.cardChoice.variants[node.variant];
  return (
    <div className="ss-node-preview">
      {npc && <NpcPortrait npc={npc} size={node.type === "boss" ? 120 : 84} boss={node.type === "boss"} showName={false} />}
      <div className="min-w-0">
        <p className="ss-title !text-[var(--ink)] text-lg leading-tight">{npc ? npc.name : node.type === "event" && de.events[node.event] ? de.events[node.event].name : info.name}</p>
        <p className="text-sm opacity-80">{npc ? info.name : info.desc}{variant ? ` – ${variant}` : ""}{node.costType ? ` (${de.costs[node.costType].name})` : ""}</p>
        {npc && <p className="text-sm italic mt-1">„{npc.enter}“</p>}
        {npc && !npc.phases && npc.rule && <p className="text-sm mt-1"><b>{de.run.houseRule}:</b> {de.run.rules[npc.rule]}</p>}
        {npc?.phases && (
          <p className="text-sm mt-1"><b>Phase 1:</b> {de.run.rules[npc.phases[0].rule]} <b>Phase 2:</b> {de.run.rules[npc.phases[1].rule]}</p>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{ map: any, pp: any|null, onChoose: (strand: number) => void, biome: any, cycle?: number, subtitle?: string,
 *   reduced?: boolean, disabled?: boolean }} props
 */
export default function PathMap({ map, pp, onChoose, biome, cycle = 0, subtitle, reduced = false, disabled = false }) {
  const vertical = useVertical();
  const L = map.levels;
  const g = useMemo(() => geometry(L, vertical, map.pathNo), [L, vertical, map.pathNo]);
  const scrollRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [preview, setPreview] = useState(/** @type {{lv: number, st: number}|null} */ (null));
  const [touchPick, setTouchPick] = useState(/** @type {number|null} */ (null));
  const options = pp && !pp.scene && !pp.done && !disabled ? reachable(pp.strand) : [];
  const visibleUpTo = pp ? pp.level + 1 : L;
  const palette = biome?.palette || { wash: "#6f7a5a", ink: "#1a1612", accent: "#c9d18a" };

  // Hintergrund: Aquarellflecken, Kaffeeränder, Landschaft – fest je Karte
  const backdrop = useMemo(() => {
    const s = streamFrom("mapdeco", map.pathNo, biome?.id || "");
    const washes = Array.from({ length: 7 }, () => ({ x: rand(s) * g.W, y: rand(s) * g.H, rx: 70 + rand(s) * 130, ry: 50 + rand(s) * 90, o: 0.1 + rand(s) * 0.14 }));
    const rings = Array.from({ length: 2 }, () => ({ x: rand(s) * g.W, y: rand(s) * g.H, r: 30 + rand(s) * 26 }));
    const kinds = biome?.decor?.length ? biome.decor : ["schilf", "pfahl"];
    const decor = [];
    for (let i = 0; decor.length < 8 + L * 2 && i < 200; i++) {
      const x = 20 + rand(s) * (g.W - 40);
      const y = 40 + rand(s) * (g.H - 60);
      let near = Math.hypot(x - g.start.x, y - g.start.y) < 60;
      for (let lv = 0; lv < L && !near; lv++) for (let st = 0; st < STRANDS && !near; st++) {
        const p = g.pos(lv, st);
        if (Math.hypot(x - p.x, y - p.y) < 70) near = true;
      }
      if (!near) decor.push({ kind: kinds[i % kinds.length], x, y, scale: 0.8 + rand(s) * 0.7, flip: rand(s) < 0.5 });
    }
    return { washes, rings, decor };
  }, [map.pathNo, biome, g, L]);

  // Kanten: Start → Ebene 0, Ebene lv → erreichbare Knoten der nächsten
  const edges = useMemo(() => {
    const out = [];
    for (let st = 0; st < STRANDS; st++) out.push({ key: `s-${st}`, to: 0, d: curve(g.start, g.pos(0, st), vertical) });
    for (let lv = 1; lv < L; lv++) {
      for (let st = 0; st < STRANDS; st++) {
        for (const t of reachable(st)) out.push({ key: `${lv}-${st}-${t}`, to: lv, from: st, target: t, d: curve(g.pos(lv - 1, st), g.pos(lv, t), vertical) });
      }
    }
    return out;
  }, [g, L, vertical]);

  // Fußspuren: der gegangene Weg
  const trail = useMemo(() => {
    const route = pp?.route || [];
    const pts = [g.start, ...route.map((st, lv) => g.pos(lv, st))];
    const out = [];
    for (let i = 1; i < pts.length; i++) out.push(curve(pts[i - 1], pts[i], vertical));
    return out;
  }, [pp?.route, g, vertical]);

  // Figur: steht auf dem zuletzt gewählten Knoten (bzw. am Start) und läuft den Weg entlang
  const target = useMemo(() => {
    const route = pp?.route || [];
    return route.length ? g.pos(route.length - 1, route[route.length - 1]) : g.start;
  }, [pp?.route, g]);
  const [piece, setPiece] = useState(target);
  const prevTarget = useRef(target);
  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (reduced || (from.x === target.x && from.y === target.y)) {
      setPiece(target);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    let steps = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      setPiece(curvePoint(from, target, vertical, e));
      if (t * 4 > steps) {
        steps += 1;
        sound.play("step");
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, vertical]);

  // Blick folgt der Figur
  useEffect(() => {
    const el = scrollRef.current;
    const svg = el?.querySelector("svg");
    if (!el || !svg) return;
    const sf = svg.getBoundingClientRect()[vertical ? "height" : "width"] / (vertical ? g.H : g.W);
    const at = (vertical ? target.y : target.x) * sf;
    const size = vertical ? el.clientHeight : el.clientWidth;
    const goal = Math.max(0, at - size * (vertical ? 0.6 : 0.35));
    if (vertical) el.scrollTo({ top: goal, behavior: reduced ? "auto" : "smooth" });
    else el.scrollTo({ left: goal, behavior: reduced ? "auto" : "smooth" });
  }, [target, g, vertical, reduced]);

  const choose = (/** @type {number} */ st, /** @type {boolean} */ touch) => {
    if (!options.includes(st)) return;
    if (touch && touchPick !== st) {
      setTouchPick(st);
      setPreview({ lv: pp.level, st });
      return;
    }
    setTouchPick(null);
    onChoose(st);
  };

  const shown = preview ? map.nodes[preview.lv]?.[preview.st] : null;
  const bossNear = pp && pp.level >= L - 1 && !pp.done;

  return (
    <div className={`ss-map ${vertical ? "ss-map-v" : "ss-map-h"} ${bossNear ? "ss-map-boss" : ""}`} style={{ "--wash": palette.wash, "--accent": palette.accent }}>
      <div className="ss-map-scroll" ref={scrollRef}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} className="ss-map-svg" role="img" aria-label={`Karte: ${biome?.name || "Moor"}`}>
          <defs>
            <filter id="mapWash" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
            <filter id="mapInk2"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="2.4" /></filter>
            <filter id="mapFog"><feGaussianBlur stdDeviation="1.6" /></filter>
          </defs>
          <g filter="url(#mapWash)">
            {backdrop.washes.map((w, i) => <ellipse key={i} cx={w.x} cy={w.y} rx={w.rx} ry={w.ry} fill={palette.wash} opacity={w.o} />)}
          </g>
          {backdrop.rings.map((r, i) => <circle key={i} cx={r.x} cy={r.y} r={r.r} fill="none" stroke="#6b4a2a" strokeWidth="3.5" opacity="0.12" filter="url(#mapFog)" />)}
          <g opacity="0.55">{backdrop.decor.map((d, i) => <Decor key={i} {...d} />)}</g>

          {/* Wege: sichtbar = frisch mit Tusche gezeichnet, dahinter Nebel */}
          <g filter="url(#mapInk2)">
            {edges.map((e) => {
              const seen = e.to <= visibleUpTo;
              return (
                <path
                  key={`${e.key}-${seen ? "v" : "f"}`}
                  d={e.d}
                  fill="none"
                  stroke={palette.ink}
                  strokeWidth={seen ? 1.7 : 1.2}
                  opacity={seen ? 0.9 : 0.18}
                  strokeDasharray={seen ? undefined : "4 6"}
                  className={seen && !reduced ? "ss-draw-ink" : undefined}
                  style={seen ? { "--len": 520, animationDelay: `${Math.max(0, e.to - (pp?.level ?? 0)) * 0.3}s` } : undefined}
                />
              );
            })}
          </g>
          {/* Fußspuren */}
          <g>{trail.map((d, i) => <path key={i} d={d} fill="none" stroke="#5a1010" strokeWidth="4" strokeDasharray="2.5 11" strokeLinecap="round" opacity="0.75" />)}</g>
          <circle cx={g.start.x} cy={g.start.y} r="8" fill={palette.ink} />

          {map.nodes.map((row, lv) => row.map((node, st) => {
            const p = g.pos(lv, st);
            const fog = lv > visibleUpTo;
            const isOption = pp && pp.level === lv && options.includes(st);
            const onRoute = pp?.route?.[lv] === st;
            const past = pp && lv < pp.level && !onRoute;
            const r = node.type === "boss" ? 40 : 29;
            return (
              <g key={`${lv}-${st}-${fog ? "f" : "v"}`} transform={`translate(${p.x} ${p.y})`}>
              <g
                className={`ss-node ${isOption ? "ss-node-option" : ""} ${fog ? "ss-node-fog" : ""} ${!fog && !reduced && lv === visibleUpTo ? "ss-node-reveal" : ""}`}
                opacity={fog ? 0.22 : past ? 0.42 : 1}
                filter={fog ? "url(#mapFog)" : undefined}
                onPointerEnter={(ev) => { if (ev.pointerType === "mouse" && !fog) setPreview({ lv, st }); }}
                onPointerLeave={(ev) => { if (ev.pointerType === "mouse") setPreview(null); }}
                onClick={(ev) => isOption && choose(st, /** @type {any} */ (ev.nativeEvent).pointerType === "touch")}
                onKeyDown={(ev) => { if (isOption && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); choose(st, false); } }}
                onFocus={() => !fog && setPreview({ lv, st })}
                role={isOption ? "button" : undefined}
                tabIndex={isOption ? 0 : undefined}
                aria-label={`${fog ? "Im Nebel" : de.nodes[node.type]?.name || "Ort"}${isOption ? " – wählbar" : ""}`}
              >
                {isOption && <circle r={r + 8} className="ss-node-ring" />}
                <circle r={r} fill={onRoute ? "#e0c79a" : "#ecdfbd"} stroke={palette.ink} strokeWidth={isOption ? 2.4 : 1.4} />
                {onRoute && <circle r={r - 5} fill="none" stroke="#5a1010" strokeWidth="1.5" strokeDasharray="3 3" />}
                {!fog && <g transform={`translate(${node.type === "boss" ? -20 : -16} ${node.type === "boss" ? -20 : -16})`}><NodeIcon type={node.type} size={node.type === "boss" ? 40 : 32} /></g>}
                {fog && <text textAnchor="middle" y="6" fontSize="18" fill={palette.ink} opacity="0.7">?</text>}
              </g>
              </g>
            );
          }))}

          {/* Geschnitzte Holzfigur */}
          {pp && (
            <g transform={`translate(${piece.x} ${piece.y - 34})`} className="ss-piece" aria-hidden>
              <ellipse cx="0" cy="33" rx="12" ry="4" fill="#000" opacity="0.25" />
              <path d="M-11 32h22l-3-8h-16zM-7 24l2-14h10l2 14zM0 10a7 7 0 100-14a7 7 0 100 14z" fill="#8a5a32" stroke="#2a1a0e" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M-4 22l1-9M3 21l-1-8M-8 29h16M-3 -2q3-3 6 0" fill="none" stroke="#5a3a1c" strokeWidth="0.9" />
            </g>
          )}
        </svg>
      </div>
      <WeatherCanvas kind={biome?.weather || "nebel"} reduced={reduced} />
      <div className="ss-map-candle" aria-hidden />
      <div className="ss-cartouche">
        <p className="ss-title">{biome?.name || "Die Moorkarte"}{cycle ? ` · Stufe ${cycle + 1}` : ""}</p>
        {subtitle && <p className="text-xs">{subtitle}</p>}
      </div>
      <svg className="ss-compass" viewBox="-30 -30 60 60" aria-hidden>
        <circle r="24" fill="none" stroke={palette.ink} strokeWidth="1" />
        <path d="M0 -26l5 26-5 26-5-26z" fill="#ecdfbd" stroke={palette.ink} strokeWidth="1" />
        <path d="M0 -26l5 26h-10z" fill="#5a1010" />
        <path d="M-26 0h52" stroke={palette.ink} strokeWidth="0.7" />
        <text y="-28" textAnchor="middle" fontSize="8" fill={palette.ink}>N</text>
      </svg>
      {shown && (
        <div className="ss-map-preview">
          <NodePreview node={shown} />
          {touchPick !== null && preview && options.includes(preview.st) && (
            <button type="button" className="ss-seal mt-2" onClick={() => choose(preview.st, false)}>Hierhin gehen</button>
          )}
        </div>
      )}
    </div>
  );
}
