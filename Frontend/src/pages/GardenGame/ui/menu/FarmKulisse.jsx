// FarmKulisse.jsx — Wiese mit Hügeln, Marktständen und Tieren hinter Hauptmenü und Ladebildschirm.
// Eine gemeinsame Kulisse, damit der Übergang vom Menü über das Laden ins Spiel aus einem Guss wirkt.
// Erwartet einen Eltern-Container mit `gf-scene` (Himmel) und position: relative/absolute.
import React from "react";
import { versionedAsset } from "../../engine/assetVersion";

// Grafik, Position (unten/links oder rechts in %), Breite. Der Samenstand stand früher bei left: -2 % und war
// links abgeschnitten.
const REQUISITEN = [
  { src: "/garden-assets/world/seed_shop.png", style: { left: "1%", bottom: "4%", width: "min(26vw, 340px)" } },
  { src: "/garden-assets/world/market.png", style: { right: "1%", bottom: "6%", width: "min(24vw, 320px)" } },
  { src: "/garden-assets/animals/kuh/1.png", style: { right: "25%", bottom: "5%", width: "min(11vw, 150px)" } },
  { src: "/garden-assets/animals/huhn/1.png", style: { left: "27%", bottom: "4%", width: "min(5.5vw, 74px)" } },
  { src: "/garden-assets/deco/nature/tulpenbett.png", style: { left: "41%", bottom: "2%", width: "min(13vw, 170px)" } },
  { src: "/garden-assets/deco/nature/cherry_blossom.png", style: { right: "13%", bottom: "30%", width: "min(13vw, 180px)" } },
];

/** `requisiten`: Stände und Tiere zeigen (erst ab lg — auf schmalen Bildschirmen stünden sie hinter den Schildern). */
export default function FarmKulisse({ requisiten = true }) {
  return (
    <>
      <svg className="gf-hill" viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120 C 240 40, 480 60, 720 110 S 1200 170, 1440 80 L1440 400 L0 400 Z" fill="#86c95c" stroke="#3f6b22" strokeWidth="5" />
        <path d="M0 210 C 300 150, 620 190, 900 220 S 1300 240, 1440 190 L1440 400 L0 400 Z" fill="#6fb246" />
        <path d="M0 320 C 360 290, 760 310, 1080 330 S 1340 320, 1440 300 L1440 400 L0 400 Z" fill="#5b9e3a" />
      </svg>
      {requisiten && REQUISITEN.map((p) => (
        <img key={p.src} src={versionedAsset(p.src)} alt="" aria-hidden="true" draggable={false}
          className="gf-prop hidden lg:block" style={p.style} />
      ))}
    </>
  );
}
