// WinTrackerOverlayPage.jsx — Kompaktes OBS-Overlay: Liga/Trophäen des aktiven
// Accounts, Tagesstatistik seit 00:00 Uhr und die letzten 5 Spiele.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { leagueIconUrl, leagueName } from "../data/leagueIcons";
import { getOverlayData } from "./winTrackerApi";

const POLL_MS = 15000;
const fmt = (n) => (n || 0).toLocaleString("de-DE");

function hexToRgba(hex, opacityPct) {
  const h = String(hex || "#0c0c12").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct ?? 88)) / 100})`;
}

export default function WinTrackerOverlayPage() {
  const { overlayKey } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      getOverlayData(overlayKey)
        .then((json) => { if (alive) setData(json); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [overlayKey]);

  // OBS-Browserquelle — gehört nicht in die Google-Suche (zusätzlich per robots.txt gesperrt)
  const noIndex = <meta name="robots" content="noindex, nofollow" />;
  if (!data || !data.hasAccount) return noIndex;

  const { playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, daily, last5, settings } = data;
  const badgeUrl = leagueIconUrl(leagueNumber);
  const isTrophyMode = settings.trackMode === "trophies";
  const mainValue = isTrophyMode ? trophies : seasonMedals;
  const profitPositive = (daily?.profit || 0) >= 0;
  const showDaily = settings.showDailyProfit || settings.showWinLossNumbers || settings.showWinLossPercent;
  const showLast5 = settings.showLast5;
  const opacityFrac = Math.max(0, Math.min(100, settings.bgOpacity ?? 88)) / 100;
  const lineColor = `rgba(255,255,255,${(0.08 * opacityFrac).toFixed(3)})`;
  const cardStyle = { ...styles.card, background: hexToRgba(settings.bgColor, settings.bgOpacity), border: `1px solid ${lineColor}` };
  const dividerStyle = { ...styles.divider, background: lineColor };

  return (
    <div style={styles.page}>
      {noIndex}
      <div style={cardStyle}>
        {/* Kopf: Liga-Symbol + Name/Platzierung + großer Trophäen-/Medaillenwert */}
        <div style={styles.headerRow}>
          <div style={styles.badgeWrap}>
            {badgeUrl ? (
              <img src={badgeUrl} alt={leagueName(leagueNumber)} style={styles.badgeImg} />
            ) : (
              <div style={styles.badgeFallback}>
                <Trophy size={26} color="#fbbf24" />
              </div>
            )}
          </div>
          <div style={styles.headerText}>
            <div style={styles.nameRow}>
              <span style={styles.name}>{playerName}</span>
            </div>
            <div style={styles.trophyRow}>
              <Trophy size={18} color="#fbbf24" />
              <span style={styles.trophyValue}>{fmt(mainValue)}</span>
              {polRank ? <span style={styles.rankInline}>#{fmt(polRank)}</span> : null}
            </div>
            {isTrophyMode && (
              <div style={styles.bestRow}>Beste: {fmt(bestTrophies)}</div>
            )}
          </div>
        </div>

        {showDaily && (
          <>
            <div style={dividerStyle} />
            <div style={styles.dailyRow}>
              <div style={styles.dailyLeft}>
                <span style={styles.dailyLabel}>Heute</span>
                {settings.showDailyProfit && (
                  <span style={{ ...styles.profitValue, color: profitPositive ? "#4ade80" : "#f87171" }}>
                    {profitPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                    {profitPositive ? "+" : ""}{fmt(daily.profit)}
                  </span>
                )}
              </div>
              <div style={styles.dailyRight}>
                {settings.showWinLossNumbers && (
                  <span style={styles.wlNumbers}>
                    <span style={{ color: "#4ade80" }}>{daily.wins}S</span>
                    {" – "}
                    <span style={{ color: "#f87171" }}>{daily.losses}N</span>
                  </span>
                )}
                {settings.showWinLossPercent && (
                  <span style={styles.wlPct}>{daily.winPct}%</span>
                )}
              </div>
            </div>
          </>
        )}

        {showLast5 && (
          <>
            <div style={dividerStyle} />
            <div style={styles.last5Label}>Letzte 5 Spiele</div>
            {last5.length > 0 && (
              <div style={styles.last5Row}>
                {last5.map((b, i) => (
                  <div key={i} style={styles.matchPill(b.result)}>
                    {b.trophyChange > 0 ? "+" : ""}{b.trophyChange}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const RESULT_COLOR = {
  win: { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.55)", text: "#4ade80" },
  loss: { bg: "rgba(239,68,68,0.16)", border: "rgba(239,68,68,0.55)", text: "#f87171" },
  draw: { bg: "rgba(148,163,184,0.16)", border: "rgba(148,163,184,0.5)", text: "#cbd5e1" },
};

const styles = {
  page: {
    position: "fixed",
    inset: 0,
    background: "transparent",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    padding: "24px",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    width: 340,
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: "16px 18px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    color: "#fff",
  },
  headerRow: { display: "flex", alignItems: "center", gap: 14 },
  badgeWrap: { width: 54, height: 54, flexShrink: 0 },
  badgeImg: { width: "100%", height: "100%", objectFit: "contain" },
  badgeFallback: {
    width: "100%", height: "100%", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  headerText: { minWidth: 0, flex: 1 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: {
    fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  trophyRow: { display: "flex", alignItems: "center", gap: 7, marginTop: 5 },
  trophyValue: { fontSize: 25, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
  rankInline: {
    fontSize: 14, fontWeight: 800, color: "#c4b5fd", background: "rgba(167,139,250,0.16)",
    border: "1px solid rgba(167,139,250,0.45)", borderRadius: 7, padding: "2px 8px",
    fontVariantNumeric: "tabular-nums",
  },
  leagueLabel: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 2 },
  bestRow: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  divider: { height: 1, margin: "12px 0" },
  dailyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  dailyLeft: { display: "flex", alignItems: "center", gap: 8 },
  dailyRight: { display: "flex", alignItems: "center", gap: 8 },
  dailyLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.45)" },
  profitValue: { display: "flex", alignItems: "center", gap: 4, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlNumbers: { fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlPct: {
    fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px",
  },
  last5Label: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.45)", marginBottom: 8 },
  last5Row: { display: "flex", gap: 6 },
  matchPill: (result) => ({
    flex: 1,
    textAlign: "center",
    padding: "6px 0",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    background: (RESULT_COLOR[result] || RESULT_COLOR.draw).bg,
    border: `1px solid ${(RESULT_COLOR[result] || RESULT_COLOR.draw).border}`,
    color: (RESULT_COLOR[result] || RESULT_COLOR.draw).text,
  }),
};
