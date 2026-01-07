// src/components/Card.jsx
import React from "react";
import "./Card.css";

export default function Card({ card }) {
  if (!card) return null;

  const {
    name,
    number,
    rarity,
    type,
    themeUrl,
    artworkUrl,
    artUrl, // fallback
    text,
    isNew,
  } = card;

  const theme = themeUrl || "";
  const artwork = artworkUrl || artUrl || "";

  const rarityLabelMap = {
    common: "Gewöhnlich",
    uncommon: "Ungewöhnlich",
    rare: "Selten",
    "very-rare": "Sehr selten",
    mythic: "Mythisch",
    secret: "Geheim",
    legendary: "Legendär",
  };

  const rarityLabel =
    rarityLabelMap[rarity] || (rarity ? String(rarity) : "");

  return (
    <div
      className="card"
      data-rarity={rarity}   // ⬅️ reicht, Backend liefert z.B. "common"
      data-type={type}
      data-cardid={number}
      style={{
        "--card-theme-url": theme ? `url(${theme})` : "none",
        "--card-artwork-url": artwork ? `url(${artwork})` : "none",
      }}
    >
      {isNew && (
       <div className="card-new-badge">
         Neu
       </div>
     )}
      <div className="card-bg" />
      <div className="card-frame" />

      <div className="card-art" />

      <div className="card-header">
        <div className="card-name">{name}</div>
        <div className="card-type-icon">
          {String(type || "").toUpperCase()}
        </div>
      </div>

      <div className="card-text">{text}</div>

      <div className="card-footer">
        {rarityLabel && (
          <span className="card-rarity-badge">{rarityLabel}</span>
        )}
        <span className="card-number-badge">{number}</span>
      </div>
    </div>
  );
}
