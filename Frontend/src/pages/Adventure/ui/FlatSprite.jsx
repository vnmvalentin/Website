// ui/FlatSprite.jsx — eine Figur im flachen Stil (Kit, Gegner, Boss) für Menüs: kleines Canvas, gleiche Zeichnung wie im
// Spiel (render/flat/figures.js). Standardmäßig ein stilles Bild; animate lässt sie atmen/wippen.
//
// kind: "hero" | "enemy" | "boss" · id: Kit-, Gegner- oder Boss-id · skin: Farbvariante (nur Kits) · size: Höhe in px

import React, { useEffect, useRef } from "react";
import { drawFigure } from "../render/flat/figures.js";

export default function FlatSprite({ kind = "hero", id, skin = "", size = 48, animate = false, dim = false, pose = "idle", className = "", title }) {
  const ref = useRef(null);
  const width = Math.round(size * (kind === "boss" && id === "thunderwing" ? 1.7 : 1.15));

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(size * dpr);
    const c = cv.getContext("2d");
    let raf = 0;
    const start = performance.now() - Math.random() * 2000;
    const paint = (now) => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, width, size);
      const fig = size * (kind === "boss" ? 0.72 : 0.82);
      const x = kind === "boss" && id === "thunderwing" ? width * 0.55 : width / 2;
      drawFigure(c, { kind, id, skin }, x, size * 0.97, fig, 1, { t: (now - start) / 1000, move: false, atk: -1, pose });
      if (animate) raf = requestAnimationFrame(paint);
    };
    paint(start + 800);
    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [kind, id, skin, size, width, animate, pose]);

  return (
    <canvas ref={ref} className={className} title={title} aria-hidden={title ? undefined : true}
      style={{ width, height: size, filter: dim ? "grayscale(1) brightness(0.45)" : undefined, flexShrink: 0 }} />
  );
}
