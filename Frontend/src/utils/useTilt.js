// useTilt.js — 3D-Neigung unter dem Zeiger: setzt --rx/--ry (Neigung) und --px/--py (Parallaxe) als CSS-Variablen
// auf das Element; das CSS (.tile3d, .door3d) entscheidet, was damit passiert. Genutzt von TileCard und den Türen der
// Startseite. Läuft auch bei "Bewegung reduzieren" — die Bewegung folgt der eigenen Maus (siehe index.css).
import { useCallback, useEffect, useRef } from "react";

/**
 * @param maxTilt   Grad an der Kante
 * @param parallax  [x, y] Pixel Verschiebung an der Kante
 * @returns { ref, onPointerMove, onPointerLeave }
 */
export function useTilt(maxTilt = 9, parallax = [8, 6]) {
  const ref = useRef(null);
  const frame = useRef(0);

  const onPointerMove = useCallback((e) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${(-y * maxTilt).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * maxTilt).toFixed(2)}deg`);
      el.style.setProperty("--px", `${(-x * parallax[0]).toFixed(1)}px`);
      el.style.setProperty("--py", `${(-y * parallax[1]).toFixed(1)}px`);
    });
  }, [maxTilt, parallax]);

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    for (const k of ["--rx", "--ry", "--px", "--py"]) el.style.removeProperty(k);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { ref, onPointerMove, onPointerLeave };
}
