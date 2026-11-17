// FitBox.jsx — verkleinert ein Overlay mit fester Pixelgröße, bis es in Breite UND Höhe seiner Fläche passt (nie
// größer als 100 %). Genutzt von den Live-Vorschauen auf /tools (ToolPreviews.jsx) und den Produktseiten
// (ProductPreviews.jsx). Die Fläche selbst ist absolut gesetzt (inset), der Aufrufer gibt ihr die Größe vor.
import React, { useEffect, useRef, useState } from "react";

/**
 * @param {object} props
 * @param {string} [props.inset]  Abstand zum Rand der Fläche als Tailwind-Klasse
 */
export default function FitBox({ children, inset = "inset-[7%]" }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [box, setBox] = useState({ s: 1, w: 0, h: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      const s = Math.min(1, o.clientWidth / Math.max(1, w), o.clientHeight / Math.max(1, h));
      setBox((b) => (Math.abs(b.s - s) < 0.001 && b.w === w && b.h === h ? b : { s, w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);
  // transform verkleinert nur die Darstellung, nicht den Platz im Layout: die Hülle bekommt die verkleinerte Größe
  return (
    <div ref={outer} className={`absolute ${inset} flex items-center justify-center`}>
      <div style={{ position: "relative", width: box.w * box.s, height: box.h * box.s }}>
        <div ref={inner} style={{ position: "absolute", top: 0, left: 0, width: "max-content", transform: `scale(${box.s})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
