import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { RARITY_COLOR, cardImageUrl } from "../data/cards";
import { getOverlayBannedCards } from "./bannedCardsApi";

const CARDS_PER_PAGE = 8; // 4 Spalten x 2 Zeilen
const PAGE_INTERVAL_MS = 10000;
const GRID_GAP = 22; // px, Abstand zwischen den Karten
const CARD_FILL_RATIO = 0.8; // wie viel vom verfügbaren Platz die Karten ausfüllen (0-1)
const DOTS_ROW_HEIGHT = 50; // px, reservierter Platz unter den Karten für die Seiten-Punkte

export default function BannedCardsOverlayPage() {
  const { overlayKey } = useParams();
  const [cards, setCards] = useState([]);
  const [attempts, setAttempts] = useState(0);
  const [page, setPage] = useState(0);
  const [cellSize, setCellSize] = useState(40);

  const viewportRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      getOverlayBannedCards(overlayKey)
        .then((json) => {
          if (!alive) return;
          setCards(json.cards || []);
          setAttempts(json.attempts || 0);
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [overlayKey]);

  const totalPages = Math.max(1, Math.ceil(cards.length / CARDS_PER_PAGE));

  useEffect(() => {
    setPage((p) => (p >= totalPages ? 0 : p));
  }, [totalPages]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % totalPages), PAGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [totalPages]);

  // Kartengröße exakt aus dem tatsächlich verfügbaren Platz berechnen —
  // so bleibt garantiert immer die volle 4x2-Fläche sichtbar, egal wie groß Header/Punkte sind.
  useLayoutEffect(() => {
    const measure = () => {
      const el = viewportRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight - (totalPages > 1 ? DOTS_ROW_HEIGHT : 0);
      const cellW = (w - GRID_GAP * 3) / 4;
      const cellH = (h - GRID_GAP * 1) / 2;
      setCellSize(Math.max(16, Math.floor(Math.min(cellW, cellH) * CARD_FILL_RATIO)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [cards.length, totalPages]);

  const pageCards = cards.slice(page * CARDS_PER_PAGE, page * CARDS_PER_PAGE + CARDS_PER_PAGE);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        Gebannte Karten <span style={styles.attempts}>– Versuch {attempts}</span>
      </div>

      <div ref={viewportRef} style={styles.viewport}>
        {cards.length === 0 ? (
          <div style={styles.emptyText}>Noch keine Karte gebannt</div>
        ) : (
          <>
            <div
              style={{
                ...styles.grid,
                gridTemplateColumns: `repeat(4, ${cellSize}px)`,
                gridTemplateRows: `repeat(2, ${cellSize}px)`,
                gap: `${GRID_GAP}px`,
              }}
            >
              {pageCards.map((card) => (
                <img
                  key={card.entryId}
                  src={cardImageUrl(card.id)}
                  alt=""
                  style={{ ...styles.cardImg, background: (RARITY_COLOR[card.rarity] || "#555") + "22" }}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ ...styles.dots, width: `${cellSize * 4 + GRID_GAP * 3}px` }}>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <span key={i} style={i === page ? styles.dotActive : styles.dot} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    background: "transparent",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    overflow: "hidden",
    padding: "1.5vh 1.5vw",
    boxSizing: "border-box",
  },
  header: {
    fontSize: "clamp(50px, 17vh, 110px)",
    fontWeight: 800,
    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
    marginBottom: "2.3vh",
    flexShrink: 0,
  },
  attempts: { opacity: 0.9 },
  viewport: {
    flex: 1,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    overflow: "hidden",
    minHeight: 0,
    minWidth: 0,
  },
  emptyText: {
    fontSize: "clamp(33px, 11vh, 95px)",
    fontWeight: 800,
    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
    opacity: 0.9,
  },
  grid: {
    display: "grid",
  },
  cardImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  dots: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginTop: "26px",
    flexShrink: 0,
  },
  dot: {
    width: "16px",
    height: "16px",
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.5)",
  },
  dotActive: {
    width: "16px",
    height: "16px",
    background: "#22d3ee",
    border: "1px solid rgba(0,0,0,0.5)",
    boxShadow: "0 0 6px rgba(34,211,238,0.9)",
  },
};
