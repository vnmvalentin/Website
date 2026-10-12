// MenuBeach.jsx — hinter dem Hauptmenü läuft ein Ballwechsel am echten Strand (render.js): zwei Blobs spielen sich den Ball
// über den Pfeiler zu. Keine Physik, nur eine gerechnete Flugbahn — es soll nach dem Spiel aussehen, nicht es simulieren.
// Das Feld wird so breit gerechnet, dass es den Kasten füllt (Querformat) bzw. mittig beschnitten wird (Hochformat).
import React, { useEffect, useRef } from "react";
import { drawScene } from "../render";
import { WORLD_H, GROUND_Y, NET_BASE_TOP, BLOBBY_HALF_H, BLOBBY_UPPER_SPHERE, BLOBBY_UPPER_RADIUS, BALL_RADIUS } from "../physics";

const FLIGHT_MS = 1500;
const STAND_Y = GROUND_Y - BLOBBY_HALF_H;
const HIT_Y = STAND_Y - BLOBBY_UPPER_SPHERE - BLOBBY_UPPER_RADIUS - BALL_RADIUS - 30;

export default function MenuBeach({ className = "", focus = 0.5 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let size = { w: 1, h: 1 };

    const draw = (now) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { w: cw, h: ch } = size;
      const scale = ch / WORLD_H;
      // Der Pfeiler steht bei `focus` (Anteil der Breite) — rechts neben dem Menü statt dahinter. Das Feld reicht nach
      // beiden Seiten mindestens bis zum Rand; im Hochformat wird es um den Pfeiler herum beschnitten.
      const netScreen = cw * (typeof focus === "function" ? focus(cw) : focus);
      const worldW = Math.max(800, (2 * Math.max(netScreen, cw - netScreen)) / scale);
      const netX = worldW / 2;
      const offsetX = netScreen - netX * scale;
      const gap = Math.min(300, worldW * 0.3);

      // Ein Schlag dauert FLIGHT_MS; gerade Nummern fliegen von links nach rechts
      const t = reduced ? 0.38 : (now % (FLIGHT_MS * 2)) / FLIGHT_MS;
      const leg = t < 1 ? 0 : 1;
      const p = t - leg;
      const fromX = leg === 0 ? netX - gap : netX + gap;
      const toX = leg === 0 ? netX + gap : netX - gap;
      const peak = HIT_Y - (NET_BASE_TOP - 120);
      const ball = { x: fromX + (toX - fromX) * p, y: HIT_Y - 4 * peak * p * (1 - p) };

      // Kurz vor dem Schlag hüpft der Blob dem Ball entgegen
      const hop = (hitAt) => {
        const d = Math.abs(p - hitAt);
        return d < 0.16 ? Math.sin((1 - d / 0.16) * Math.PI / 2) * 34 : 0;
      };
      const leftHop = leg === 0 ? hop(0) : hop(1);
      const rightHop = leg === 0 ? hop(1) : hop(0);
      const world = {
        width: worldW,
        netX,
        netTop: NET_BASE_TOP,
        blobs: {
          1: { x: netX - gap, y: STAND_Y - leftHop, scale: 1 },
          2: { x: netX + gap, y: STAND_Y - rightHop, scale: 1 },
        },
        ball,
        rot: (now / 1000) * (leg === 0 ? 2.4 : -2.4),
        bob: 0,
        powerup: null,
      };

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, 0);
      drawScene(ctx, world, { names: {}, slots: [1, 2], dpr: dpr * scale, mirror: false });
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = wrap.getBoundingClientRect();
      size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const loop = (now) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [focus]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
