// ui/FlatSprite.jsx — eine Figur für Menüs und HUD (Kit, Gegner, Boss). Seit November 2026 ein Bild der 3D-Figur
// (public/media/av3d/bilder, fotografiert von render3d/tools/thumbs.mjs) statt einer 2D-Zeichnung — die Menüs zeigen
// damit dieselben Figuren wie das Spiel. Der Name ist aus der 2D-Zeit geblieben.
//
// kind: "hero" | "enemy" | "boss" · id: Kit-, Gegner- oder Boss-id · skin: Farbvariante (nur Kits) · size: Höhe in px
// animate wird nicht mehr gebraucht (die Bilder stehen still), bleibt aber als Angabe erlaubt.

import React from "react";

const PREFIX = { hero: "held", enemy: "gegner", boss: "boss" };

export default function FlatSprite({ kind = "hero", id, skin = "", size = 48, dim = false, className = "", title }) {
  const width = Math.round(size * (kind === "boss" && id === "thunderwing" ? 1.7 : 1.15));
  const file = `${PREFIX[kind] || "held"}_${id}${kind === "hero" && skin ? `_${skin}` : ""}`;
  return (
    <img src={`/media/av3d/bilder/${file}.png`} alt={title || ""} title={title} aria-hidden={title ? undefined : true}
      className={className} draggable={false} width={width} height={size}
      style={{ width, height: size, objectFit: "contain", filter: dim ? "grayscale(1) brightness(0.45)" : undefined, flexShrink: 0 }} />
  );
}
