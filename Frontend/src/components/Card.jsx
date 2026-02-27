// src/components/Card.jsx
import React from "react";
import "./Card.css";

// Prüfe bitte genau, ob dieser Pfad in deinem Projekt existiert!
// Falls das Bild nicht angezeigt wird, liegt es meistens am falschen Pfad.
const DEFAULT_BG = "/assets/artworkscats/background.jpg"; 

export default function Card({ card, level = 1 }) {
  if (!card) return null;

  const {
    name,
    number,
    rarity,
    themeUrl,
    artworkUrl,
    artUrl, 
    isNew,
  } = card;

  // Theme Logik
  const theme = themeUrl || DEFAULT_BG;
  const artwork = artworkUrl || artUrl || "";

  const rarityLabelMap = {
    common: "Gewöhnlich",
    uncommon: "Ungewöhnlich",
    rare: "Selten",
    epic: "Episch",
    mythic: "Mythisch",
    legendary: "Legendär"
  };

  const rarityLabel = rarityLabelMap[rarity] || (rarity ? String(rarity) : "");

  return (
    <div
      className="card"
      data-rarity={rarity}
      style={{
        "--card-theme-url": `url('${theme}')`, // Anführungszeichen hinzugefügt für Sicherheit
      }}
    >
      {/* 1. "Neu" Badge - Oben Links */}
      {isNew && <div className="card-new-badge">Neu</div>}

      {/* 2. Level Badge - Oben Rechts (Absolut positioniert) */}
      {level > 1 && (
          <div className="card-level-badge">
              ⭐ {level}
          </div>
      )}
      
      {/* Hintergrund Layer */}
      <div className="card-bg" />
      <div className="card-frame" />

      <div className="card-content">
        {/* Header: Name (Jetzt mit voller Breite) */}
        <div className="card-header text-shadow-sm">
          <span>{name}</span>
        </div>

        {/* Artwork */}
        <div className="card-art-container">
            {artwork ? (
                <img src={artwork} alt={name} className="card-art-img" />
            ) : (
                <div className="card-art-placeholder" />
            )}
        </div>

        {/* Footer: Seltenheit & ID (Immer sichtbar!) */}
        <div className="card-footer">
          <span className="card-rarity">{rarityLabel}</span>
          <span className="card-number">#{number}</span>
        </div>
      </div>
    </div>
  );
}