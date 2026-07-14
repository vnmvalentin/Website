import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { ALL_CARDS, RARITY_COLOR, cardImageUrl } from "../data/cards";
import { getModBannedCards, banCard, unbanCard, unbanAllCards, adjustAttempts } from "./bannedCardsApi";

export default function BannedCardsModeratorPage() {
  const { modKey } = useParams();

  const [bannedCards, setBannedCards] = useState([]);
  const [attempts, setAttempts] = useState(0);
  const [overlayKey, setOverlayKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [invalidLink, setInvalidLink] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const refreshBanned = () => {
    getModBannedCards(modKey)
      .then((json) => {
        setBannedCards(json.cards || []);
        setAttempts(json.attempts || 0);
        setOverlayKey(json.overlayKey || "");
        setInvalidLink(false);
      })
      .catch((err) => { if (err.status === 403) setInvalidLink(true); })
      .finally(() => setLoading(false));
  };

  const overlayUrl = overlayKey ? `${window.location.origin}/banned-cards/overlay/${overlayKey}` : "";
  const handleCopyOverlay = () => {
    if (!overlayUrl) return;
    navigator.clipboard.writeText(overlayUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  const handleAttempts = async (delta) => {
    setAttempts((a) => Math.max(0, a + delta));
    try {
      const json = await adjustAttempts(modKey, delta);
      setAttempts(json.attempts);
    } catch (err) {
      refreshBanned();
    }
  };

  useEffect(() => {
    refreshBanned();
    const t = setInterval(refreshBanned, 5000);
    return () => clearInterval(t);
  }, [modKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bannedIds = useMemo(() => new Set(bannedCards.map((c) => c.id)), [bannedCards]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_CARDS;
    return ALL_CARDS.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const handleBan = async (card) => {
    setError("");
    setBusyId(card.id);
    try {
      await banCard(modKey, card);
      refreshBanned();
    } catch (err) {
      setError(err.message || "Fehler beim Bannen");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnban = async (entry) => {
    setError("");
    setBusyId(entry.entryId);
    try {
      await unbanCard(modKey, entry.entryId);
      refreshBanned();
    } catch (err) {
      setError(err.message || "Fehler beim Entbannen");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnbanAll = async () => {
    if (!window.confirm(`Wirklich alle ${bannedCards.length} gebannten Karten entfernen?`)) return;
    setError("");
    try {
      await unbanAllCards(modKey);
      refreshBanned();
    } catch (err) {
      setError(err.message || "Fehler beim Entfernen aller Karten");
    }
  };

  if (loading) {
    return <div style={styles.page} />;
  }

  if (invalidLink) {
    return (
      <div style={styles.page}>
        <div style={styles.invalidBox}>Dieser Moderator-Link ist ungültig.</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.overlayLinkRow}>
        <span style={styles.overlayLinkLabel}>Overlay-Link (für OBS)</span>
        <div style={styles.overlayLinkInputRow}>
          <input readOnly value={overlayUrl} onFocus={(e) => e.target.select()} style={styles.overlayLinkInput} />
          <button onClick={handleCopyOverlay} style={styles.overlayLinkCopyBtn}>
            {linkCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Gebannte Karten</h1>
          <div style={styles.attemptsInline}>
            <button onClick={() => handleAttempts(-1)} disabled={attempts <= 0} style={styles.attemptsBtn}>−</button>
            <span style={styles.attemptsCount}>Versuch {attempts}</span>
            <button onClick={() => handleAttempts(1)} style={styles.attemptsBtn}>+</button>
          </div>
        </div>
        <p style={styles.sub}>Clash Royale — Moderator-Ansicht</p>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.bannedSection}>
        <div style={styles.bannedSectionHeader}>
          <h2 style={styles.sectionTitle}>Aktuell gebannt ({bannedCards.length})</h2>
          {bannedCards.length > 0 && (
            <button onClick={handleUnbanAll} style={styles.removeAllBtn}>Alle entfernen</button>
          )}
        </div>
        {bannedCards.length === 0 ? (
          <p style={styles.emptyText}>Keine Karten gebannt.</p>
        ) : (
          <div style={styles.bannedList}>
            {bannedCards.map((entry) => (
              <div key={entry.entryId} style={styles.bannedItem}>
                <img
                  src={cardImageUrl(entry.id)}
                  alt={entry.name}
                  style={{ ...styles.bannedItemImg, background: (RARITY_COLOR[entry.rarity] || "#555") + "22" }}
                />
                <span style={styles.bannedItemName}>{entry.name}</span>
                <button
                  onClick={() => handleUnban(entry)}
                  disabled={busyId === entry.entryId}
                  style={styles.removeBtn}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.searchRow}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Karte suchen..."
          style={styles.input}
        />
      </div>

      <div style={styles.cardGrid}>
        {filteredCards.map((card) => {
          const isBanned = bannedIds.has(card.id);
          return (
            <div key={card.id} style={{ ...styles.cardTile, opacity: isBanned ? 0.4 : 1 }}>
              <img
                src={cardImageUrl(card.id)}
                alt={card.name}
                style={{ ...styles.cardImg, background: (RARITY_COLOR[card.rarity] || "#555") + "22" }}
              />
              <span style={styles.cardName}>{card.name}</span>
              <button
                onClick={() => handleBan(card)}
                disabled={isBanned || busyId === card.id}
                style={styles.banBtn}
              >
                {isBanned ? "Gebannt" : "Bannen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f13",
    color: "#eaeaea",
    fontFamily: "system-ui, sans-serif",
    padding: "24px",
    boxSizing: "border-box",
  },
  overlayLinkRow: {
    marginBottom: "20px",
    paddingBottom: "16px",
    borderBottom: "1px solid #2a2a30",
  },
  overlayLinkLabel: { fontSize: "12px", color: "#9a9aa2", textTransform: "uppercase", letterSpacing: "0.03em", display: "block", marginBottom: "6px" },
  overlayLinkInputRow: { display: "flex", gap: "8px", maxWidth: "480px" },
  overlayLinkInput: {
    flex: 1,
    background: "#1a1a20",
    border: "1px solid #2a2a30",
    color: "#9a9aa2",
    padding: "8px 10px",
    fontSize: "12px",
    fontFamily: "monospace",
    minWidth: 0,
  },
  overlayLinkCopyBtn: {
    background: "#1a1a20",
    border: "1px solid #2a2a30",
    color: "#eaeaea",
    padding: "0 12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  header: {
    marginBottom: "20px",
  },
  titleRow: { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" },
  title: { margin: 0, fontSize: "24px", fontWeight: 700 },
  sub: { margin: "4px 0 0", color: "#9a9aa2", fontSize: "14px" },
  attemptsInline: { display: "flex", alignItems: "center", gap: "10px" },
  attemptsBtn: {
    width: "32px",
    height: "32px",
    background: "#1a1a20",
    border: "1px solid #2a2a30",
    color: "#eaeaea",
    fontSize: "18px",
    lineHeight: 1,
    cursor: "pointer",
  },
  attemptsCount: { fontSize: "18px", fontWeight: 700, minWidth: "90px", textAlign: "center" },
  invalidBox: {
    maxWidth: "360px",
    margin: "10vh auto 0",
    color: "#f5b5b5",
    fontSize: "15px",
  },
  errorBanner: {
    background: "#3a1616",
    border: "1px solid #5a2222",
    color: "#f5b5b5",
    padding: "10px 14px",
    marginBottom: "16px",
    fontSize: "14px",
  },
  bannedSection: { marginBottom: "24px" },
  bannedSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" },
  sectionTitle: { fontSize: "16px", fontWeight: 600, margin: 0 },
  removeAllBtn: {
    background: "transparent",
    border: "1px solid #5a2222",
    color: "#f5b5b5",
    fontSize: "12px",
    padding: "6px 10px",
    cursor: "pointer",
    flexShrink: 0,
  },
  emptyText: { color: "#7a7a82", fontSize: "14px" },
  bannedList: { display: "flex", flexWrap: "wrap", gap: "10px" },
  bannedItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#1a1a20",
    border: "1px solid #2a2a30",
    padding: "6px 10px",
  },
  bannedItemImg: { width: "32px", height: "32px", objectFit: "cover" },
  bannedItemName: { fontSize: "13px" },
  removeBtn: {
    background: "transparent",
    border: "1px solid #5a2222",
    color: "#f5b5b5",
    fontSize: "12px",
    padding: "4px 8px",
    cursor: "pointer",
  },
  searchRow: { marginBottom: "16px" },
  input: {
    width: "100%",
    maxWidth: "360px",
    background: "#1a1a20",
    border: "1px solid #2a2a30",
    color: "#eaeaea",
    padding: "10px 12px",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: "12px",
  },
  cardTile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    background: "#16161a",
    border: "1px solid #2a2a30",
    padding: "10px",
  },
  cardImg: { width: "64px", height: "64px", objectFit: "cover" },
  cardName: { fontSize: "12px", textAlign: "center" },
  banBtn: {
    width: "100%",
    background: "#7f1d1d",
    border: "1px solid #991b1b",
    color: "#fff",
    fontSize: "12px",
    padding: "6px 0",
    cursor: "pointer",
  },
};
