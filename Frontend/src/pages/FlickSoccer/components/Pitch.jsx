// components/Pitch.jsx — das Spielfeld: Canvas, Zielen per Ziehen, Abspielen eines Schusses mit der Engine.
//
// Ruhezustand kommt als `state` (trägt auch das Feld). Läuft `playback` ({ id, start, shot, mods? }), simuliert die
// Komponente den Schuss selbst in Echtzeit (fester Zeitschritt, gleiche Physik wie Server und KI) und meldet das Ende
// über onPlaybackEnd(id, goal, steps, summary). Bis der Elternteil `playback` wieder auf null setzt, bleibt der
// Endstand der Simulation stehen (z. B. Ball im Netz).
//
// summary = { power, ballHit, ballWall, posts } — was der Schuss bewirkt hat (für Statistik und Erfolge).

import React, { useEffect, useRef } from "react";
import { AIM, PHYS, PIECE, REPLAY, createSim, stepSim } from "../engine/index.js";
import { WORLD, drawScene, goalEffects, impactRing, makeView, toWorld } from "../render.js";
import { playImpact, playShot } from "../sound.js";

const TRAIL_LEN = 14;
const RATIO = WORLD.w / WORLD.h;
// Ab dieser Kraft „knallt" ein Schuss: kurzes Wackeln beim Abschuss
const HARD_SHOT = 0.9;
// Ab dieser Aufprallgeschwindigkeit gibt es einen Staubring
const RING_SPEED = 750;

export default function Pitch({
  state,
  playback = null,
  onPlaybackEnd,
  aimTeam = null, // Team, dessen Scheiben gerade gezogen werden dürfen (null = niemand)
  onShoot,
  ghostAim = null, // Pfeil ohne Eingabe (Computer zielt)
  skins = null, // [Design Team 0, Design Team 1] (engine/skins.js)
  look = null, // { turf, ball } — eigener Rasen und Ball (progress.js)
  celebrations = null, // [Torjubel bei Toren von Team 0, von Team 1]
  turnPower = null, // { power, team } — Power-up des laufenden Zugs (Chaos), für die Anzeige im Ruhezustand
  maxHeightOffset = 200,
  fill = false, // Spielbildschirm: füllt den Kasten der Bühne (GameStage) statt sich an der Fensterhöhe zu messen
  children,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ cssW: 0, cssH: 0, dpr: 1 });
  const viewRef = useRef({ key: "", view: null });
  const simRef = useRef(null); // { id, sim, ended, … }
  const aimRef = useRef(null); // { piece, sx, sy, drag, pointerId }
  const hoverRef = useRef(null);
  const trailRef = useRef([]);
  const fxRef = useRef({ particles: [], rings: [], netFlash: null, shakeStart: -1, shakeAmp: 0, shakeMs: 0, shake: { x: 0, y: 0 } });
  const propsRef = useRef({});
  propsRef.current = { state, playback, onPlaybackEnd, aimTeam, onShoot, ghostAim, skins, look, celebrations, turnPower };

  // Abbildung Feld → Canvas, passend zum gerade gezeigten Feld
  const viewFor = (fieldId) => {
    const { cssW, cssH, dpr } = sizeRef.current;
    if (!cssW) return null;
    const key = `${fieldId}/${cssW}x${cssH}@${dpr}`;
    if (viewRef.current.key !== key) viewRef.current = { key, view: makeView(cssW, cssH, fieldId) };
    return viewRef.current.view;
  };
  const shownField = () => (simRef.current ? simRef.current.sim.field.id : propsRef.current.state.field);

  // Neuer Schuss → neue Simulation
  useEffect(() => {
    if (!playback) {
      simRef.current = null;
      trailRef.current = [];
      return;
    }
    if (simRef.current?.id === playback.id) return;
    const sim = createSim(playback.start, playback.shot, playback.mods || null);
    // Torwiederholung ({ replay: true, steps }): stumm bis kurz vor Schluss vorspulen, dann in Zeitlupe
    if (playback.replay) {
      const skip = Math.max(0, (playback.steps || 0) - REPLAY.TAIL_STEPS);
      for (let i = 0; i < skip && !sim.done; i++) {
        stepSim(sim);
        sim.events.length = 0;
      }
    }
    const power = playback.shot ? Math.hypot(playback.shot.sx, playback.shot.sy) : 0;
    simRef.current = {
      id: playback.id, sim, ended: false, acc: 0, last: null,
      speed: playback.replay ? REPLAY.SPEED : 1, replay: !!playback.replay,
      summary: { power, ballHit: false, ballWall: false, posts: 0 },
    };
    trailRef.current = [];
    aimRef.current = null;
    if (!playback.replay && power > 0) {
      playShot(power);
      if (power >= HARD_SHOT) {
        const fx = fxRef.current;
        fx.shakeStart = performance.now();
        fx.shakeAmp = 5;
        fx.shakeMs = 220;
      }
    }
  }, [playback]);

  // Wer nicht mehr zielen darf, verliert einen angefangenen Zug
  useEffect(() => {
    if (aimTeam === null) aimRef.current = null;
  }, [aimTeam]);

  // Größe
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      sizeRef.current = { cssW, cssH, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Zeichen- und Simulationsschleife
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let lastT = null;
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      const dt = lastT === null ? 0 : Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const fx = fxRef.current;
      const run = simRef.current;
      if (run && !run.ended) {
        if (run.last === null) run.last = t;
        run.acc += Math.min(0.1, (t - run.last) / 1000) * run.speed;
        run.last = t;
        while (run.acc >= PHYS.DT && !run.sim.done) {
          stepSim(run.sim);
          run.acc -= PHYS.DT;
          for (const ev of run.sim.events) {
            playImpact(ev);
            if (ev.type === "ball") run.summary.ballHit = true;
            else if (ev.ball && (ev.type === "wall" || ev.type === "post")) {
              run.summary.ballWall = true;
              if (ev.type === "post") run.summary.posts += 1;
            }
            // Staubring bei harten Treffern an Bande, Pfosten oder Hindernis
            if ((ev.type === "wall" || ev.type === "post") && ev.speed >= RING_SPEED && fx.rings.length < 24) {
              fx.rings.push(impactRing(ev.x, ev.y, ev.speed, t));
            }
          }
          run.sim.events.length = 0;
        }
        const b = run.sim.bodies[run.sim.bodies.length - 1];
        const trail = trailRef.current;
        trail.push({ x: b.x, y: b.y });
        if (trail.length > TRAIL_LEN) trail.shift();
        if (run.sim.done) {
          run.ended = true;
          if (run.sim.goal !== null && !run.replay) {
            // Tor im Tor des Gegners: Team 0 trifft rechts (Seite 1), Team 1 links (Seite 0)
            const side = run.sim.goal === 0 ? 1 : 0;
            const style = propsRef.current.celebrations?.[run.sim.goal] || "konfetti";
            const add = goalEffects(style, run.sim.goal, side, b, run.sim.field.id, t);
            fx.particles.push(...add.particles);
            fx.rings.push(...add.rings);
            fx.netFlash = { side, team: run.sim.goal, start: t };
            fx.shakeStart = t;
            fx.shakeAmp = 9;
            fx.shakeMs = 450;
          }
          propsRef.current.onPlaybackEnd?.(run.id, run.sim.goal, run.sim.steps, run.summary);
        }
      } else if (trailRef.current.length) {
        trailRef.current.shift(); // Spur läuft nach dem Stillstand aus
      }
      // Teilchen und Ringe
      if (fx.particles.length) {
        for (const p of fx.particles) {
          if (p.delay > 0) {
            p.delay -= dt;
            continue;
          }
          p.vx *= 1 - 2.2 * dt;
          p.vy *= 1 - 2.2 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          p.life -= dt;
        }
        fx.particles = fx.particles.filter((p) => p.life > 0);
      }
      if (fx.rings.length) fx.rings = fx.rings.filter((r) => t < r.start + r.dur);
      // Wackeln (harter Schuss, Tor), klingt ab
      const sAge = t - fx.shakeStart;
      if (fx.shakeStart >= 0 && sAge >= 0 && sAge < fx.shakeMs) {
        const amp = fx.shakeAmp * (1 - sAge / fx.shakeMs);
        fx.shake = { x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp };
      } else {
        fx.shake = { x: 0, y: 0 };
      }

      const p = propsRef.current;
      const fieldId = run ? run.sim.field.id : p.state.field;
      const view = viewFor(fieldId);
      if (!view) return;
      const { cssW, cssH, dpr } = sizeRef.current;
      let pieces;
      let ball;
      let rubber;
      if (run) {
        const b = run.sim.bodies;
        pieces = run.sim.teams.map((team, i) => ({ x: b[i].x, y: b[i].y, team, scale: b[i].r / PIECE.R, frozen: b[i].frozen }));
        ball = b[b.length - 1];
        rubber = run.sim.power === "gummi";
      } else {
        // Im Ruhezustand zeigen, was das Power-up dieses Zugs bewirken wird
        const ice = p.turnPower?.power === "eis" ? p.turnPower.team : null;
        pieces = ice === null ? p.state.pieces : p.state.pieces.map((pc) => (pc.team !== ice ? { ...pc, frozen: true } : pc));
        ball = p.state.ball;
        rubber = p.turnPower?.power === "gummi";
      }
      const selectable = !run && p.aimTeam !== null ? new Set(pieces.map((pc, i) => (pc.team === p.aimTeam ? i : -1)).filter((i) => i >= 0)) : null;
      const aim = run ? null : aimRef.current || p.ghostAim;
      drawScene(ctx, view, cssW, cssH, dpr, {
        field: fieldId, look: p.look, skins: p.skins, pieces, ball, selectable, hover: hoverRef.current, aim,
        trail: trailRef.current, rubber, fx, time: t,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Eingabe ───────────────────────────────────────────────────────────────
  const worldFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return toWorld(viewFor(shownField()), e.clientX - rect.left, e.clientY - rect.top);
  };

  const pieceAt = (w) => {
    const p = propsRef.current;
    if (p.aimTeam === null || simRef.current) return null;
    let best = null;
    let bestD = PIECE.R + 14;
    p.state.pieces.forEach((pc, i) => {
      if (pc.team !== p.aimTeam) return;
      const d = Math.hypot(pc.x - w.x, pc.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const updateAim = (w) => {
    const a = aimRef.current;
    const pc = propsRef.current.state.pieces[a.piece];
    const dx = w.x - pc.x;
    const dy = w.y - pc.y;
    const dist = Math.hypot(dx, dy);
    // Zurück auf die Scheibe gezogen = nichts gezielt; Loslassen bricht dann ab
    const power = Math.min(1, (dist - AIM.DEAD_ZONE) / AIM.MAX_DRAG);
    a.drag = w;
    if (power <= 0) {
      a.sx = 0;
      a.sy = 0;
    } else {
      a.sx = (-dx / dist) * power;
      a.sy = (-dy / dist) * power;
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!viewFor(shownField())) return;
    const w = worldFromEvent(e);
    const piece = pieceAt(w);
    if (piece === null) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    aimRef.current = { piece, sx: 0, sy: 0, drag: w, pointerId: e.pointerId };
  };

  const onPointerMove = (e) => {
    if (!viewFor(shownField())) return;
    const w = worldFromEvent(e);
    if (aimRef.current && aimRef.current.pointerId === e.pointerId) {
      updateAim(w);
      return;
    }
    if (e.pointerType === "mouse") {
      const h = pieceAt(w);
      hoverRef.current = h;
      canvasRef.current.style.cursor = h !== null ? "grab" : "default";
    }
  };

  const onPointerUp = (e) => {
    const a = aimRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    updateAim(worldFromEvent(e));
    aimRef.current = null;
    const power = Math.hypot(a.sx, a.sy);
    if (power >= AIM.MIN_POWER && propsRef.current.aimTeam !== null) {
      propsRef.current.onShoot?.({ piece: a.piece, sx: a.sx, sy: a.sy });
    }
  };

  const onPointerCancel = () => {
    aimRef.current = null;
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") aimRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fk-pitch-wrap mx-auto"
      style={{
        aspectRatio: `${WORLD.w} / ${WORLD.h}`,
        // fill: so groß, wie es in den umgebenden Kasten passt (.fk-stage-field ist ein Größen-Container)
        width: fill ? `min(100cqw, calc(100cqh * ${RATIO}))` : `min(100%, calc((100dvh - ${maxHeightOffset}px) * ${RATIO}))`,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          hoverRef.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Spielfeld"
      />
      {children}
    </div>
  );
}
