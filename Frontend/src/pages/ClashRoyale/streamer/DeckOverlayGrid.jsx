// DeckOverlayGrid.jsx — reiner Renderer für das Deck-Overlay-Raster.
//
// Von zwei Seiten geteilt: DeckOverlayPage (ein Overlay pro Twitch-Account, zusätzlich
// die OBS-Automatik-Brücke) und LobbyDeckOverlayPage (ein Overlay pro Lobby-Sitzung, kein
// Login nötig). Beide zeigen dieselben Decks im selben Raster — nur die Datenquelle (und
// bei DeckOverlayPage die OBS-Anbindung drumherum) unterscheidet sich, deshalb lag die
// Layout-Logik vorher als Kopie an zwei Stellen.
//
// Seitenwechsel (?rotate=<s>&perPage=<n>, siehe deckOverlayOptions.js): Bei vielen Spielern
// zeigt das Overlay nur perPage Decks auf einmal — dafür groß — und blättert im Takt weiter.
import React, { useEffect, useMemo, useState } from "react";
import CardFace from "../ui/CardFace";
import { CARD_RATIO } from "../modes/cardCrop";
import { avatarUrl as resolveAvatarUrl } from "../components/avatars";
import { CR_FONT, CR_FONT_HREF } from "../WinTracker/overlayTheme";
import { readRotation } from "./deckOverlayOptions";

// width / height einer Kartenkachel: der sichtbare Kartenrahmen (4:5), siehe ui/CardFace.jsx —
// die alten 150/172 stammten von der früheren royaleapi-Bildquelle und schnitten mit cover ab.
const CARD_ASPECT = CARD_RATIO;

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
const NAME_ROW_H_RATIO = 0.3; // Namensschild als Anteil der Kartenhöhe (inkl. Abstand zu den Karten)
const CELL_FILL_RATIO = 0.9; // Reserve für die Box selbst (Padding/Rand) innerhalb der Kachel
const EDGE = "#071225"; // dunkle Kontur wie bei den Arcade-Panels der Minigames

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

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Gespeicherte Lobby-Avatare sind Dateinamen ("Knight_Evolution.webp"); die Profil-Option
// "Twitch-Bild verwenden" schickt stattdessen eine vollständige URL.
const avatarSrc = (avatar) => {
  if (!avatar) return null;
  if (/^https?:\/\//.test(avatar)) return avatar;
  return resolveAvatarUrl(avatar);
};

// Einblenden einer neuen Seite. Bei reduzierter Bewegung nur Überblendung, kein Hochrutschen.
const KEYFRAMES = `
@keyframes crDeckIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes crDeckFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
  @keyframes crDeckIn { from { opacity: 0; } to { opacity: 1; } }
}
`;

function NamePlate({ player, height, width }) {
  const fontSize = Math.max(12, height * 0.5);
  const src = avatarSrc(player.avatar);
  const avatarSize = height * 1.2;
  const color = player.color || "#22d3ee";
  const edge = Math.max(2, height * 0.06);

  return (
    <div style={{ display: "flex", alignItems: "center", height, width, position: "relative" }}>
      {src && (
        <div
          className="cr-avatar"
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            border: `${edge}px solid ${EDGE}`,
            boxShadow: `0 ${edge}px 0 rgba(2, 8, 20, 0.55)`,
            position: "relative",
            zIndex: 1,
          }}
        >
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
      {/* Schild in Spielerfarbe mit hartem Sockel unten — wie die Knöpfe in Clash Royale.
          Der Avatar überlappt das Schild links. */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: height * 0.9,
          marginLeft: src ? -avatarSize * 0.3 : 0,
          paddingLeft: src ? avatarSize * 0.42 : height * 0.35,
          paddingRight: height * 0.35,
          display: "flex",
          alignItems: "center",
          background: color,
          border: `${edge}px solid ${EDGE}`,
          borderRadius: height * 0.22,
          boxShadow: [
            `inset 0 ${-height * 0.13}px 0 rgba(0, 0, 0, 0.28)`,
            `inset 0 ${Math.max(1, height * 0.05)}px 0 rgba(255, 255, 255, 0.3)`,
            `0 ${edge}px 0 rgba(2, 8, 20, 0.55)`,
          ].join(", "),
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontFamily: CR_FONT,
            fontSize,
            lineHeight: 1,
            color: "#fff",
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            // Dunkle Kontur + harter Schatten statt weichem Schein: lesbar auf jeder Spielerfarbe
            WebkitTextStroke: `${Math.max(1, fontSize * 0.09)}px ${EDGE}`,
            paintOrder: "stroke fill",
            textShadow: `0 ${Math.max(1, fontSize * 0.08)}px 0 rgba(2, 8, 20, 0.6)`,
            // ellipsis braucht ein bisschen Luft unten, sonst schneidet overflow den Schatten ab
            paddingBottom: fontSize * 0.1,
          }}
        >
          {player.name}
        </span>
      </div>
    </div>
  );
}

export default function DeckOverlayGrid({ players, viewport, feedKey }) {
  // Die Einstellungen stehen im Overlay-Link und ändern sich während der Laufzeit nicht.
  const rotation = useMemo(
    () => readRotation(typeof window !== "undefined" ? window.location.search : ""),
    []
  );
  const paging = rotation.enabled && players.length > rotation.perPage;
  const pages = useMemo(
    () => (paging ? chunk(players, rotation.perPage) : [players]),
    [players, paging, rotation.perPage]
  );
  const pageCount = pages.length;

  const [page, setPage] = useState(0);
  // Neue Decks → wieder bei Seite 1 anfangen; der Takt startet dabei neu.
  useEffect(() => { setPage(0); }, [feedKey, pageCount]);
  useEffect(() => {
    if (!paging) return undefined;
    const iv = setInterval(() => setPage((p) => (p + 1) % pageCount), rotation.seconds * 1000);
    return () => clearInterval(iv);
  }, [paging, pageCount, rotation.seconds, feedKey]);

  // Lilita One — das Overlay läuft ohne CrShell, die die Schrift sonst lädt.
  useEffect(() => {
    if (document.querySelector(`link[href="${CR_FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CR_FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const current = pages[Math.min(page, pageCount - 1)] || [];
  // Beim Blättern immer mit voller Seitengröße rechnen, damit die Karten auf der letzten,
  // evtl. nicht vollen Seite nicht plötzlich größer werden.
  const layoutCount = paging ? rotation.perPage : players.length;
  const { cols, rows, cardWidth, cardHeight } = computeLayout(viewport.w, viewport.h, layoutCount);
  const nameRowHeight = cardHeight * NAME_ROW_H_RATIO;
  const plateHeight = nameRowHeight * 0.8;
  const boxPadX = cardWidth * 0.12;
  const deckWidth = cardWidth * 4 + CARD_GAP * 3;

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        key={`${feedKey ?? ""}-${page}`}
        style={{
          position: "fixed",
          inset: 0,
          fontFamily: "Inter, system-ui, sans-serif",
          background: "transparent",
          color: "#fff",
          boxSizing: "border-box",
          padding: `${OUTER_PAD_Y}px ${OUTER_PAD_X}px`,
          display: "grid",
          // Spalten/Zeilen so groß wie ihr Inhalt, das Raster als Ganzes mittig: vorher teilten
          // "1fr"-Zeilen die volle Höhe auf und die Deck-Kästen saßen je mittig darin — bei 2×2
          // auf 16:9 (Breite begrenzt die Kartengröße) entstand so eine große Lücke zwischen
          // den oberen und unteren Decks. Jetzt ist der Abstand überall genau CELL_GAP.
          gridTemplateColumns: `repeat(${cols}, auto)`,
          gridTemplateRows: `repeat(${rows}, auto)`,
          justifyContent: "center",
          alignContent: "center",
          gap: CELL_GAP,
        }}
      >
        {current.map((p, i) => (
          <div
            key={p.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: paging ? `crDeckIn 420ms cubic-bezier(.2,.9,.3,1.15) ${i * 90}ms both` : undefined,
            }}
          >
            <div
              style={{
                background: "rgba(15, 15, 19, 1)",
                border: `2px solid ${EDGE}`,
                borderRadius: Math.max(8, cardWidth * 0.06),
                padding: `${nameRowHeight * 0.3}px ${boxPadX}px`,
                boxShadow: "0 12px 32px rgba(0,0,0,.4)",
              }}
            >
              <div style={{ height: nameRowHeight, display: "flex", alignItems: "flex-start" }}>
                <NamePlate player={p} height={plateHeight} width={deckWidth} />
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
                {(p.deck || []).map((c, ci) => (
                  <div
                    key={`${c.id}-${ci}`}
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
                    <CardFace id={c.id} alt={c.name} rarity={c.rarity} loading="eager" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Seitenanzeige: ein Segment pro Seite, das aktive füllt sich im Takt des Wechsels. */}
      {paging && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: Math.max(8, OUTER_PAD_Y * 0.4),
            display: "flex",
            justifyContent: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {pages.map((_, i) => (
            <div
              key={i}
              style={{
                width: 40,
                height: 8,
                borderRadius: 4,
                background: "rgba(8, 20, 38, 0.85)",
                border: `2px solid ${EDGE}`,
                overflow: "hidden",
                boxSizing: "content-box",
              }}
            >
              {i <= page && (
                <div
                  key={i === page ? `fill-${feedKey ?? ""}-${page}` : "done"}
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#fff",
                    transformOrigin: "left center",
                    animation: i === page ? `crDeckFill ${rotation.seconds}s linear both` : undefined,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
