// FitText.jsx — Inhalt in EINER Zeile, der bei Platzmangel kleiner skaliert statt die Karte zu
// verbreitern oder abgeschnitten zu werden (langer Name, Rang #12.345, "123 – 145" in der Session).
// Die Karte hat eine feste Breite: wechselnde Werte dürfen die Größe der OBS-Quelle nie ändern.
//
// transform: scale ändert die Layout-Box nicht — Höhe und Breite der Zeile bleiben also immer
// gleich, nur der Inhalt wird optisch kleiner. Gemessen wird mit offsetWidth/clientWidth (beide
// ohne transform und im selben Koordinatensystem), das Verhältnis stimmt deshalb auch unter dem
// CSS-zoom der Overlay-Größe.
import React, { useLayoutEffect, useRef, useState } from "react";

export default function FitText({ children, style, align = "left" }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const fit = () => {
      const avail = outer.clientWidth;
      const need = inner.offsetWidth;
      const next = avail > 0 && need > avail ? avail / need : 1;
      setScale((prev) => (Math.abs(prev - next) < 0.003 ? prev : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const centered = align === "center";
  return (
    <div ref={outerRef} style={{
      display: "flex", justifyContent: centered ? "center" : "flex-start",
      minWidth: 0, width: "100%", ...style,
    }}>
      <div ref={innerRef} style={{
        display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", flexShrink: 0,
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: centered ? "center center" : "left center",
      }}>
        {children}
      </div>
    </div>
  );
}
