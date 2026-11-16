// challengeStats.jsx — Werte-Zeile des Session-Blocks, solange eine Challenge getrackt wird (siehe
// ChallengeValue.jsx). Eigene Datei, weil ChallengeValue.jsx nur Komponenten exportieren darf.
import React from "react";

/**
 * Session-Werte in einer Challenge: der Stand des laufenden Runs statt Profit/Bilanz/Winrate der
 * Session (die sagen in einer Challenge nichts). Jede Spalte hängt am selben Schalter wie ihr
 * Gegenstück, damit die Karte ihre Größe behält:
 *   Profit  → bester Run der Session
 *   Bilanz  → Siege–Niederlagen des laufenden Runs
 *   Winrate → Siege bis zum Ziel (King Grand Duel: gespielte Duelle "7/20"; ohne beides, z.B.
 *             Global Tournament: übrige Leben)
 * @param {object} challenge  siehe challengeState im Backend
 * @param {{ profit: boolean, numbers: boolean, percent: boolean }} flags
 * @returns {Array<{ key: string, label: string, value: React.ReactNode }>}
 */
export function challengeStats(challenge, flags, t, styles) {
  const stats = [];
  const wins = challenge.wins || 0, losses = challenge.losses || 0;
  if (flags.profit) stats.push({ key: "profit", label: t.statBestRun, value: challenge.bestWins || 0 });
  if (flags.numbers) {
    stats.push({
      key: "record",
      label: t.statRun,
      value: <><span style={{ color: "#4ade80" }}>{wins}</span><span style={styles.statDash}>–</span><span style={{ color: "#f87171" }}>{losses}</span></>,
    });
  }
  if (flags.percent) {
    stats.push(challenge.maxWins > 0
      ? { key: "pct", label: t.statWinsLeft, value: Math.max(0, challenge.maxWins - wins) }
      : challenge.maxGames > 0
        ? { key: "pct", label: t.statGames, value: `${wins + losses}/${challenge.maxGames}` }
        : { key: "pct", label: t.statLives, value: Math.max(0, (challenge.maxLosses || 0) - losses) });
  }
  return stats;
}
