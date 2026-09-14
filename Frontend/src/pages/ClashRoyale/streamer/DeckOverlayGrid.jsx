// DeckOverlayGrid.jsx — reiner Renderer für das Deck-Overlay-Raster.
//
// Von zwei Seiten geteilt: DeckOverlayPage (ein Overlay pro Twitch-Account, zusätzlich
// die OBS-Automatik-Brücke) und LobbyDeckOverlayPage (ein Overlay pro Lobby-Sitzung, kein
// Login nötig). Beide zeigen dieselben Decks im selben Raster — nur die Datenquelle (und
// bei DeckOverlayPage die OBS-Anbindung drumherum) unterscheidet sich, deshalb lag die
// Layout-Logik vorher als Kopie an zwei Stellen.
import React from "react";
import { cardImageUrl } from "../data/cards";

const CARD_ASPECT = 150 / 172; // width / height der Kartenbilder

const RARITY_BORDER = {
  Common: "rgba(148, 163, 184, 0.55)",
  Rare: "rgba(249, 115, 22, 0.65)",
  Epic: "rgba(168, 85, 247, 0.65)",
  Legendary: "rgba(34, 211, 238, 0.7)",
  Champion: "rgba(250, 204, 21, 0.75)",
};

const OUTER_PAD_X = 40;
const OUTER_PAD_Y = 32;
const CELL_GAP = 28; // Abstand zwischen den Spieler-Kacheln (horizontal & vertikal)
const CARD_GAP = 10; // Abstand zwischen den Karten innerhalb eines Decks
const NAME_ROW_H_RATIO = 0.22; // Namenszeile als Anteil der Kartenhöhe
const CELL_FILL_RATIO = 0.9; // Reserve für die Box selbst (Padding/Rand) innerhalb der Kachel

/**
 * Ordnet die Spieler in einem Raster an (2 Spieler → nebeneinander, 4 Spieler → 2×2,
 * 6 Spieler → 3×2, …) und berechnet dazu die größtmögliche Kartengröße für ein
 * 4×2-Deck-Layout (wie beim Clash-Royale-Deckbau: 2 Reihen à 4 Karten) pro Spieler-Kachel.
 */
export function computeLayout(viewportW, viewportH, playerCount) {
  const n = Math.max(1, playerCount);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));

  const availW = Math.max(0, viewportW - OUTER_PAD_X * 2 - CELL_GAP * (cols - 1));
  const availH = Math.max(0, viewportH - OUTER_PAD_Y * 2 - CELL_GAP * (rows - 1));
  const cellW = (availW / cols) * CELL_FILL_RATIO;
  const cellH = (availH / rows) * CELL_FILL_RATIO;

  // Breiten-Limit: 4 Karten + 3 Lücken müssen nebeneinander in die Kachel passen
  const widthFromW = (cellW - CARD_GAP * 3) / 4;
  const heightFromW = widthFromW / CARD_ASPECT;

  // Höhen-Limit: Namenszeile + 2 Kartenreihen + 1 Lücke dazwischen müssen in die Kachel passen
  const heightFromH = (cellH - CARD_GAP) / (2 + NAME_ROW_H_RATIO);

  const cardHeight = Math.max(20, Math.min(heightFromW, heightFromH));
  const cardWidth = cardHeight * CARD_ASPECT;
  return { cols, rows, cardWidth, cardHeight };
}

export default function DeckOverlayGrid({ players, viewport }) {
  const { cols, rows, cardWidth, cardHeight } = computeLayout(viewport.w, viewport.h, players.length);
  const nameFontSize = Math.max(12, cardHeight * NAME_ROW_H_RATIO * 0.7);
  const nameRowHeight = cardHeight * NAME_ROW_H_RATIO;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        fontFamily: "Inter, system-ui, sans-serif",
        background: "transparent",
        color: "#fff",
        boxSizing: "border-box",
        padding: `${OUTER_PAD_Y}px ${OUTER_PAD_X}px`,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: CELL_GAP,
        textShadow: "0 2px 6px rgba(0,0,0,.6)",
      }}
    >
      {players.map((p) => (
        <div
          key={p.name}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{
              background: "rgba(15, 15, 19, 1)",
              borderLeft: `${Math.max(3, cardWidth * 0.03)}px solid ${p.color || "#22d3ee"}`,
              borderRadius: Math.max(8, cardWidth * 0.06),
              padding: `${nameRowHeight * 0.3}px ${cardWidth * 0.12}px`,
              boxShadow: "0 12px 32px rgba(0,0,0,.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: nameFontSize * 0.5,
                height: nameRowHeight,
                fontWeight: 800,
                fontSize: nameFontSize,
              }}
            >
              <span
                style={{
                  width: nameFontSize * 0.5,
                  height: nameFontSize * 0.5,
                  borderRadius: "50%",
                  background: p.color || "#22d3ee",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {p.name}
            </div>
            {/* 4×2-Deck-Layout pro Spieler (wie beim Clash-Royale-Deckbau): 2 Reihen à 4 Karten.
                Spieler stehen nebeneinander im Raster (computeLayout) statt untereinander. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(4, ${cardWidth}px)`,
                gridAutoRows: `${cardHeight}px`,
                gap: CARD_GAP,
              }}
            >
              {(p.deck || []).map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  title={c.name}
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                    borderRadius: Math.max(6, cardWidth * 0.08),
                    overflow: "hidden",
                    border: `2px solid ${RARITY_BORDER[c.rarity] || "rgba(255,255,255,.2)"}`,
                    background: "rgba(0,0,0,.35)",
                    lineHeight: 0,
                  }}
                >
                  <img
                    src={cardImageUrl(c.id)}
                    alt={c.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={(e) => { e.target.style.visibility = "hidden"; }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
