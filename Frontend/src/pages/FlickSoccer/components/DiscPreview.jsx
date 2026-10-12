// components/DiscPreview.jsx — eine einzelne Scheibe in einem Design, mit derselben Zeichenroutine wie das Spielfeld.
import React, { useEffect, useRef } from "react";
import { drawDiscPreview } from "../render.js";

export default function DiscPreview({ skin, team = 0, number = 7, size = 56 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let alive = true;
    const draw = () => alive && drawDiscPreview(canvas, skin, team, number);
    draw();
    // Die Nummer nutzt Archivo — nach dem Laden der Schrift nochmal zeichnen
    document.fonts?.ready.then(draw).catch(() => {});
    return () => {
      alive = false;
    };
  }, [skin, team, number, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} aria-hidden="true" />;
}
