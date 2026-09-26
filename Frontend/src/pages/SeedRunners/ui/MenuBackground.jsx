// MenuBackground.jsx — hinter dem Hauptmenü läuft ein echtes Level vorbei: Parallax und Kacheln aus dem Renderer des Spiels,
// die Kamera fährt langsam nach rechts. Das Level ist ein schnelles Chunk-Level (wenige Millisekunden, kein Worker nötig) im
// Biom der Oberfläche; bei „Bewegung reduzieren“ steht das Bild still.
import React, { useEffect, useRef } from "react";
import { generateLevel, createLevelWorld, BIOMES } from "../gen/index.js";
import { drawTiles } from "../client/render.js";
import { drawParallax } from "../client/parallax.js";
import { TILE } from "../sim/config.js";

const VIEW_WORLD_H = 250;      // so viele Weltpixel hoch ist der Ausschnitt — die Kacheln wirken wie im Spiel
const SPEED = 18;              // Weltpixel pro Sekunde

export default function MenuBackground({ biome, seed }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let map;
    try {
      const level = generateLevel({ seed, length: "long", speedClass: "normal", biome });
      map = createLevelWorld(level).map;
    } catch {
      return undefined;                    // ohne Level bleibt der ruhige Hintergrund der Hülle
    }
    const palette = BIOMES[biome]?.palette || BIOMES.meadow.palette;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();

    // Die Kamera folgt der Strecke des Läufers (Start → Checkpoints → Ziel), nicht dem Kartenrand: Die Karte ist viel höher
    // als der Ausschnitt, und unten liegt oft nur Fels — ein fester Ausschnitt zeigte dann eine einfarbige Fläche.
    const route = [map.start, ...map.checkpoints, ...(map.finish?.length ? [{ x: map.finish[0].tx * TILE, y: map.finish[0].ty * TILE }] : [])]
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    const routeY = (x) => {
      if (!route.length) return map.h * TILE / 2;
      if (x <= route[0].x) return route[0].y;
      for (let i = 1; i < route.length; i++) {
        if (x <= route[i].x) {
          const a = route[i - 1];
          const b = route[i];
          return a.y + ((x - a.x) / Math.max(1, b.x - a.x)) * (b.y - a.y);
        }
      }
      return route[route.length - 1].y;
    };
    let camYs = null;
    let last = t0;

    const draw = (now) => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const scale = h / VIEW_WORLD_H;
      const viewW = w / scale;
      const span = Math.max(1, map.w * TILE - viewW);
      const travel = ((now - t0) / 1000) * SPEED;
      // hin und her statt Sprung an den Anfang
      const lap = travel % (2 * span);
      const camX = still ? span * 0.3 : (lap < span ? lap : 2 * span - lap);
      // Strecke etwas unterhalb der Bildmitte, weich nachgeführt
      const target = Math.min(Math.max(0, routeY(camX + viewW * 0.5) - VIEW_WORLD_H * 0.6), Math.max(0, map.h * TILE - VIEW_WORLD_H));
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      camYs = camYs === null || still ? target : camYs + (target - camYs) * Math.min(1, dt * 0.8);
      const camY = Math.round(camYs);
      const tick = Math.floor(((now - t0) / 1000) * 60);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);
      drawParallax(ctx, biome, palette, scale, camX, camY, tick);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawTiles(ctx, scale, map, camX, camY, viewW, VIEW_WORLD_H, palette, tick);
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw(performance.now());               // erstes Bild sofort, nicht erst im nächsten Animationsbild
    const onResize = () => { if (still) draw(performance.now()); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [biome, seed]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full h-full" />;
}
