// ui/path/WeatherCanvas.jsx — Wetterpartikel über der Pfadkarte (Canvas): Nebel, Asche, Sporen, Regen, Blätter, Salz, Gischt.
// Bei „Bewegung reduzieren“ oder unsichtbarem Tab steht das Wetter still (keine Animation).
import React, { useEffect, useRef } from "react";

/** Partikel-Vorlagen je Wetter. */
const KINDS = {
  nebel: { n: 10, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 160 + Math.random() * 160, vx: 0.08 + Math.random() * 0.12, vy: 0, a: 0.04 + Math.random() * 0.04 }), color: "232, 226, 210", shape: "blob" },
  asche: { n: 60, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 1.4, vx: 0.15 + Math.random() * 0.2, vy: 0.3 + Math.random() * 0.4, a: 0.35 + Math.random() * 0.3 }), color: "60, 54, 48", shape: "dot" },
  sporen: { n: 45, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.15, vy: -0.15 - Math.random() * 0.25, a: 0.3 + Math.random() * 0.35 }), color: "214, 170, 220", shape: "dot" },
  regen: { n: 90, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 10 + Math.random() * 8, vx: -0.8, vy: 5 + Math.random() * 3, a: 0.18 + Math.random() * 0.12 }), color: "40, 52, 60", shape: "line" },
  blaetter: { n: 18, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 2.5 + Math.random() * 2, vx: 0.3 + Math.random() * 0.3, vy: 0.4 + Math.random() * 0.3, a: 0.4 + Math.random() * 0.3 }), color: "120, 98, 60", shape: "leaf" },
  salz: { n: 50, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 0.7 + Math.random(), vx: 0.4 + Math.random() * 0.3, vy: 0.1 + Math.random() * 0.2, a: 0.4 + Math.random() * 0.3 }), color: "245, 245, 238", shape: "dot" },
  gischt: { n: 40, spawn: (w, h) => ({ x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 1.8, vx: 0.6 + Math.random() * 0.5, vy: -0.2 + Math.random() * 0.4, a: 0.25 + Math.random() * 0.25 }), color: "225, 235, 238", shape: "dot" },
};

/** @param {{ kind: string, reduced?: boolean }} props */
export default function WeatherCanvas({ kind, reduced = false }) {
  const ref = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  useEffect(() => {
    const cv = ref.current;
    const def = KINDS[kind];
    if (!cv || !def) return undefined;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      cv.width = w;
      cv.height = h;
    };
    resize();
    const parts = Array.from({ length: def.n }, () => def.spawn(w, h));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        ctx.globalAlpha = p.a;
        if (def.shape === "blob") {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(${def.color}, 1)`);
          g.addColorStop(1, `rgba(${def.color}, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        } else if (def.shape === "line") {
          ctx.strokeStyle = `rgb(${def.color})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 2, p.y + p.r);
          ctx.stroke();
        } else if (def.shape === "leaf") {
          ctx.fillStyle = `rgb(${def.color})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r * 1.6, p.r * 0.7, (p.x + p.y) * 0.02, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgb(${def.color})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    if (reduced) {
      draw();
      return undefined;
    }
    let raf = 0;
    const step = () => {
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > w + p.r) p.x = -p.r;
        if (p.x < -p.r) p.x = w + p.r;
        if (p.y > h + p.r) p.y = -p.r;
        if (p.y < -p.r) p.y = h + p.r;
      }
      draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [kind, reduced]);
  return <canvas ref={ref} className="ss-weather" aria-hidden />;
}
