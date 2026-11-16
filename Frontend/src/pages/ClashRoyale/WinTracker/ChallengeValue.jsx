// ChallengeValue.jsx — Overlay-Kopf, solange eine Challenge getrackt wird (trackMode "c:<key>", siehe
// Backend lib/challengeModes.js). Nachbau der Anzeige im Spiel: Kranz mit der Siegzahl in einem
// Schild, darunter ein Feld je erlaubter Niederlage — verlorene mit rotem Kreuz (ChallengeBadge, sitzt
// an der Stelle des Liga-Abzeichens). Rechts in der Wert-Zeile: Versuch in der Session + bester Run
// (ChallengeValue). Crown Series (Krone) und Global Tournament (Pokal) nutzen dieselbe Bauart mit
// eigenem Symbol. Im Session-Block ersetzt der Stand des Runs die Session-Statistik: challengeStats
// (Werte-Zeile, eigene Datei challengeStats.jsx) und ChallengeTrack (Fortschritts-Leiste statt der letzten 5 Spiele).
// Gemeinsam für das echte Overlay (WinTrackerOverlayPage.jsx) und die Editor-Vorschau
// (OverlayPreview.jsx), damit beide gleich aussehen und gleich hoch sind.
import React, { useId } from "react";
import FitText from "./FitText";
import { CR_FONT } from "./overlayTheme";
import crossIcon from "../../../assets/clashRoyale/ui/cancel.webp";
import wreathClassic from "../../../assets/clashRoyale/ui/challenge-classic.webp";
import wreathGrand from "../../../assets/clashRoyale/ui/challenge-grand.webp";
import crlIcon from "../../../assets/clashRoyale/badges/crl.webp";
import crownSeriesIcon from "../../../assets/clashRoyale/ui/CR_CrownSeriesIcon.png";
import { crownLeagueIconUrl } from "../data/leagueIcons";
import tourneyTrophyIcon from "../../../assets/clashRoyale/ui/tourney_trophy.webp";

// Grüner Kranz für die Classic, goldener für Grand. Die 20-Win-Challenge läuft als CRL-Challenge:
// dort ist das CRL-Wappen selbst das Abzeichen, die Siegzahl sitzt in einem Feld auf seiner Spitze.
const WREATH = { classic: wreathClassic, grand: wreathGrand };
// Modi, deren Symbol selbst das Abzeichen ist — die Siegzahl sitzt in einem Feld an seiner Unterkante:
// CRL-Wappen (20 Win), Crown-Series-Logo bzw. das Abzeichen der gewählten Liga (Crown Series, Duel +
// Grand Duel Weekend), Pokal (Global Tournament).
const FIELD_ICON = { "20win": crlIcon, duel: crownSeriesIcon, grandduel: crownSeriesIcon, global: tourneyTrophyIcon };

// Niederlagen-Felder: 3 Stück à 18px füllen die 64px-Spalte; bei 4 (Grand Duels) oder 5 (Global
// Tournament) werden sie schmaler, die Zeile bleibt 18px hoch (Kopf behält seine Höhe).
function lossBoxSize(count) {
  const gap = count > 3 ? 2 : 3;
  return { gap, size: Math.min(18, Math.floor((64 - (count - 1) * gap) / count)) };
}

// Dunkle Kontur rundherum wie bei der Schrift im Spiel
const outline = "0 2px 0 #0b1830, 1px 1px 0 #0b1830, -1px 1px 0 #0b1830, 1px -1px 0 #0b1830, -1px -1px 0 #0b1830";
const SHIELD_PATH = "M5 3 H35 Q38 3 38 6 V24 Q38 36 20 44 Q2 36 2 24 V6 Q2 3 5 3 Z";

/** Kranz + Siegzahl im Schild, darunter die Niederlagen-Felder. Ersetzt im Kopf das 64px-Abzeichen. */
export function ChallengeBadge({ challenge }) {
  const gradId = useId();
  const maxLosses = Math.max(1, challenge.maxLosses || 3);
  const wins = challenge.wins || 0;
  const { gap, size } = lossBoxSize(maxLosses);
  const box = { ...local.lossBox, width: size, height: size };
  const lossRow = (
    <div style={{ ...local.lossRow, gap }}>
      {Array.from({ length: maxLosses }, (_, i) => (
        <span key={i} style={i < challenge.losses ? { ...box, ...local.lossBoxHit } : box}>
          {i < challenge.losses && <img src={crossIcon} alt="" style={{ ...local.crossImg, width: size - 4, height: size - 4 }} />}
        </span>
      ))}
    </div>
  );
  // Crown Series: Abzeichen der vom Nutzer gewählten Liga, ohne Wahl das Logo
  const leagueIcon = challenge.crownLeague ? crownLeagueIconUrl(challenge.crownLeague) : null;
  const fieldIcon = leagueIcon || FIELD_ICON[challenge.key];
  if (fieldIcon) {
    // King Grand Duel: feste Zahl an Duellen ohne Niederlagen-Grenze — statt der Niederlagen-Felder
    // steht dort, wie viele davon gespielt sind ("7/20").
    const gamesRow = challenge.maxGames > 0 ? (
      <div style={{ ...local.lossRow, ...local.gamesText }}>{wins + (challenge.losses || 0)}/{challenge.maxGames}</div>
    ) : null;
    return (
      <div style={local.badgeCol}>
        <div style={local.wreathBox}>
          <img src={fieldIcon} alt="" style={leagueIcon ? local.wreathImg : local.fieldImg} />
          {/* Liga-Abzeichen: Zahl klein in der Ecke, damit Figur und Sterne sichtbar bleiben */}
          <span style={leagueIcon ? { ...local.crlNumber, ...local.cornerNumber } : local.crlNumber}>{wins}</span>
        </div>
        {gamesRow || lossRow}
      </div>
    );
  }
  return (
    <div style={local.badgeCol}>
      <div style={local.wreathBox}>
        <img src={WREATH[challenge.key] || wreathClassic} alt="" style={local.wreathImg} />
        {/* Schild wie im Spiel: blau mit Goldrand und dunkler Außenkante, Zahl darüber */}
        <svg viewBox="0 0 40 46" style={local.shield} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4f9dff" />
              <stop offset="1" stopColor="#1f4fc0" />
            </linearGradient>
          </defs>
          <path d={SHIELD_PATH} fill={`url(#${gradId})`} stroke="#0b1830" strokeWidth="4.5" strokeLinejoin="round" />
          <path d={SHIELD_PATH} fill="none" stroke="#f7c948" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
        <span style={{ ...local.winNumber, fontSize: wins >= 10 ? 19 : 22 }}>{wins}</span>
      </div>
      {lossRow}
    </div>
  );
}

/**
 * Wert-Zeile rechts im Kopf: "Versuch 3" + bester Run der Session.
 * @param {{ challenge: object, styles: object, t: object }} props  styles = Overlay-Styles (theme-abhängig)
 */
export default function ChallengeValue({ challenge, styles, t }) {
  return (
    <FitText><div style={styles.trophyRow}>
      <span style={{ ...styles.bestRowSlot, marginLeft: 0 }}>{t.challengeAttemptWord}</span>
      <span style={{ ...styles.trophyValue, marginLeft: -3 }}>{challenge.attempt}</span>
      {challenge.bestWins > 0 && (
        <span style={styles.bestRowSlot}>{t.bestLabel}: {challenge.bestWins}</span>
      )}
    </div></FitText>
  );
}

/** Ob ein Modus eine Fortschritts-Leiste hat: Siegziel oder feste Zahl an Spielen. */
const trackLength = (challenge) => challenge.maxWins || challenge.maxGames || 0;

/**
 * Fortschritts-Leiste des laufenden Runs: ein Feld je Sieg bis zum Ziel (8, 12 oder 20), gewonnene
 * gefüllt. King Grand Duel (maxGames, kein Siegziel): ein Feld je Duell in Spielreihenfolge, Sieg
 * grün, Niederlage rot. Ohne Siegziel und ohne feste Spielzahl (Global Tournament) gibt es keine
 * Leiste — dann bleiben die letzten 5 Spiele stehen (Rückgabe null). Steht an der Stelle der letzten 5 Spiele und übernimmt deren Styles (Blasen bzw. Punkte),
 * ist also in jedem Look exakt so hoch wie die Zeile, die sie ersetzt.
 * @param {{ challenge: object, styles: object, dots: boolean }} props  dots = Punkte-Stil der letzten 5
 */
export function ChallengeTrack({ challenge, styles, dots }) {
  const total = trackLength(challenge);
  if (!total) return null;
  const wins = Math.min(total, challenge.wins || 0);
  // Je Feld "w", "l" oder "" (offen). Mit Siegziel zählen nur die Siege; mit fester Spielzahl die
  // echte Reihenfolge — nie gesehene Duelle (Sync-Lücke) stehen vorn, Siege zuerst.
  let cells;
  if (challenge.maxWins > 0) {
    cells = Array.from({ length: total }, (_, i) => (i < wins ? "w" : ""));
  } else {
    const seen = String(challenge.results || "");
    const count = (ch) => seen.split(ch).length - 1;
    const played = "w".repeat(Math.max(0, (challenge.wins || 0) - count("w")))
      + "l".repeat(Math.max(0, (challenge.losses || 0) - count("l"))) + seen;
    cells = Array.from({ length: total }, (_, i) => played[i] || "");
  }
  const RESULT = { w: "win", l: "loss" };
  const gap = total > 12 ? 2 : 3;
  const columns = { display: "grid", gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, gap };
  if (dots) {
    const empty = styles.dotEmpty;
    const cell = { height: empty.height, borderRadius: 2, boxSizing: "border-box" };
    return (
      <div style={columns}>
        {cells.map((c, i) => {
          const full = c ? styles.dot(RESULT[c]) : null;
          return <span key={i} style={full ? { ...cell, background: full.background, border: full.border } : { ...cell, border: empty.border }} />;
        })}
      </div>
    );
  }
  // Schmale Felder: Ecken höchstens 4px rund (eckige Looks bleiben eckig)
  const narrow = (st) => ({ ...st, borderRadius: Math.min(4, Number(st.borderRadius) || 0) });
  const pill = { w: narrow(styles.matchPill("win")), l: narrow(styles.matchPill("loss")), "": narrow(styles.matchPillEmpty) };
  return (
    <div style={columns}>
      {cells.map((c, i) => <div key={i} style={pill[c]}>{"\u00a0"}</div>)}
    </div>
  );
}

const local = {
  // Breite = 64px-Abzeichen der anderen Modi; Höhe 60 + 3 + 18 = 81
  badgeCol: { width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  wreathBox: { position: "relative", width: 60, height: 60 },
  wreathImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  // Symbol mit Zahlenfeld darunter: oben anliegend (die Krone ist flacher als das Feld hoch)
  fieldImg: { width: "100%", height: "100%", objectFit: "contain", objectPosition: "center top", display: "block" },
  shield: { position: "absolute", left: 15, top: 10, width: 30, height: 35 },
  winNumber: {
    position: "absolute", left: 15, top: 10, width: 30, height: 31,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: CR_FONT, fontWeight: 400, color: "#fff", lineHeight: 1, letterSpacing: "0.01em",
    textShadow: outline, fontVariantNumeric: "tabular-nums",
  },
  // 20 Win: Zahl in einem blauen Feld mit Goldrand unten auf der Spitze des CRL-Wappens
  crlNumber: {
    position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)",
    minWidth: 28, height: 21, padding: "0 5px", boxSizing: "border-box", borderRadius: 6,
    background: "linear-gradient(#4f9dff, #1f4fc0)", border: "2px solid #f7c948",
    boxShadow: "0 0 0 1.5px #0b1830",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: CR_FONT, fontWeight: 400, fontSize: 16, color: "#fff", lineHeight: 1,
    textShadow: outline, fontVariantNumeric: "tabular-nums",
  },
  // Variante fürs Liga-Abzeichen der Crown Series: kleiner, unten rechts über den Rand hinaus
  cornerNumber: { left: "auto", right: -5, bottom: -1, transform: "none", minWidth: 22, height: 19, padding: "0 4px", fontSize: 14 },
  lossRow: { display: "flex", alignItems: "center", height: 18 },
  // "7/20" im King Grand Duel — steht an der Stelle der Niederlagen-Felder
  gamesText: {
    justifyContent: "center", fontFamily: CR_FONT, fontWeight: 400, fontSize: 14, color: "#fff", lineHeight: 1,
    textShadow: outline, fontVariantNumeric: "tabular-nums",
  },
  lossBox: {
    borderRadius: 4, boxSizing: "border-box",
    background: "#0e2347", border: "1.5px solid #0b1830",
    boxShadow: "inset 0 2px 0 rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  lossBoxHit: { background: "#b8203a" },
  crossImg: { objectFit: "contain" },
};
