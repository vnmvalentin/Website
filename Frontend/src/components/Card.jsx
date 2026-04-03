// src/components/Card.jsx
import React from "react";
import "./Card.css";

const DEFAULT_BG = "/assets/artworkscats/background.jpg"; 

// HIER: isNew als direkten Prop hinzufügen (Standardwert: false)
export default function Card({ card, level = 1, isNew = false }) {
  if (!card) return null;

  // HIER: isNew aus der Destrukturierung entfernen
  const {
    name,
    number,
    rarity,
    themeUrl,
    artworkUrl,
    artUrl, 
  } = card;

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
        "--card-theme-url": `url('${theme}')`, 
      }}
    >
      {/* Das "Neu" Badge wird jetzt über den neuen Prop gesteuert */}
      {isNew && <div className="card-new-badge">Neu</div>}

      {level > 1 && (
          <div className="card-level-badge">
              ⭐ {level}
          </div>
      )}
      
      <div className="card-bg" />
      <div className="card-frame" />

      <div className="card-content">
        <div className="card-header text-shadow-sm">
          <span>{name}</span>
        </div>

        <div className="card-art-container">
            {artwork ? (
                <img src={artwork} alt={name} className="card-art-img" />
            ) : (
                <div className="card-art-placeholder" />
            )}
        </div>

        <div className="card-footer">
          <span className="card-rarity">{rarityLabel}</span>
          <span className="card-number">#{number}</span>
        </div>
      </div>
    </div>
  );
}