// TileCard.jsx — die Vorschau-Karte der Seite: Bild (bei mehreren: Überblendung), Titel, kurzer Text. Startseite,
// Türen und Übersichtsseiten (/fun, /clash, /community, /tools) nutzen genau diese Karte.
//
// 3D: Die Karte neigt sich unter dem Zeiger (rotateX/rotateY, Tiefe über perspective), das Bild verschiebt sich
// leicht gegenläufig, die Textleiste liegt mit translateZ "vor" dem Bild. Beim Erscheinen klappt sie aus der Tiefe
// auf (.tile3d-in, Verzögerung über `index`). Bewusst ohne Leuchten und ohne Vergrößern; bei "Bewegung reduzieren"
// entfallen Aufklappen und Bildwechsel, die Neigung unter der eigenen Maus bleibt. Die ganze Fläche ist der Link.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useTilt } from "../utils/useTilt";

const MAX_TILT = 9; // Grad
const PARALLAX = [8, 6]; // Pixel Bildverschiebung an der Kante
const ROTATE_MS = 3200;

function useReducedMotion() {
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  return reduced;
}

/** Mehrere Bilder: nacheinander überblenden (läuft nur, solange die Karte sichtbar ist) */
function useRotation(count, ref, reduced) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (count < 2 || reduced) return undefined;
    let visible = true;
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
      : null;
    if (io && ref.current) io.observe(ref.current);
    const id = setInterval(() => { if (visible && !document.hidden) setI((x) => (x + 1) % count); }, ROTATE_MS);
    return () => { clearInterval(id); io?.disconnect(); };
  }, [count, ref, reduced]);
  return i;
}

/**
 * @param to / href   Ziel (intern / extern) — die ganze Karte ist der Link
 * @param images      Vorschaubilder; mehrere werden überblendet
 * @param kicker      kleine Zeile über dem Titel
 * @param icon        Symbol, wenn kein Bild da ist
 * @param size        "sm" (Schnellzugriff), "md" (Standard), "lg" (Türen)
 * @param index       Position im Raster — staffelt das Aufklappen
 */
export default function TileCard({ to, href, onClick, title, text, kicker, images = [], icon: Icon, size = "md", index = 0, className = "" }) {
  // Neigung unter dem Zeiger (utils/useTilt.js) — auch bei "Bewegung reduzieren", sie folgt der eigenen Maus
  const { ref, onPointerMove: onMove, onPointerLeave: onLeave } = useTilt(MAX_TILT, PARALLAX);
  const reduced = useReducedMotion();
  // Bilder als "src" oder { src, fit } — fit "contain" zeigt das ganze Bild (Overlay-Ausschnitte), sonst füllt es
  const pics = images.filter(Boolean).map((x) => (typeof x === "string" ? { src: x, fit: "cover" } : x));
  const shown = useRotation(pics.length, ref, reduced);

  const media = pics.length > 0 ? (
    <div className="tile3d-media">
      {pics.map((p, i) => (
        <img key={p.src} src={p.src} alt="" loading="lazy" draggable={false}
          className={`${i === shown ? "is-on" : ""} ${p.fit === "contain" ? "fit-contain" : ""}`} />
      ))}
    </div>
  ) : (
    <div className="tile3d-media tile3d-media--icon">{Icon && <Icon size={size === "sm" ? 22 : 34} aria-hidden="true" />}</div>
  );

  const body = (
    <>
      {media}
      <div className="tile3d-body">
        {kicker && <p className="tile3d-kicker">{kicker}</p>}
        <div className="flex items-start justify-between gap-3">
          <h3 className="tile3d-title">{title}</h3>
          {href ? <ExternalLink size={15} className="tile3d-arrow" aria-hidden="true" /> : <ArrowRight size={16} className="tile3d-arrow" aria-hidden="true" />}
        </div>
        {text && size !== "sm" && <p className="tile3d-text">{text}</p>}
      </div>
    </>
  );

  const props = {
    ref,
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    className: `tile3d tile3d--${size} ${reduced ? "" : "tile3d-in"} ${className}`,
    style: { animationDelay: `${Math.min(index, 10) * 70}ms` },
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} {...props}>{body}</button>;
  return <Link to={to} {...props}>{body}</Link>;
}
