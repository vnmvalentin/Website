// ChallengeValue.jsx — Overlay-Kopf, solange eine Challenge getrackt wird (trackMode "c:<key>", siehe
// Backend lib/challengeModes.js). Nachbau der Anzeige im Spiel: Kranz mit der Siegzahl in einem
// Schild, darunter ein Feld je erlaubter Niederlage — verlorene mit rotem Kreuz (ChallengeBadge, sitzt
// an der Stelle des Liga-Abzeichens). Rechts in der Wert-Zeile: Versuch in der Session + bester Run
// (ChallengeValue). Gemeinsam für das echte Overlay (WinTrackerOverlayPage.jsx) und die Editor-Vorschau
// (OverlayPreview.jsx), damit beide gleich aussehen und gleich hoch sind.
import React, { useId } from "react";
import FitText from "./FitText";
import { CR_FONT } from "./overlayTheme";
import crossIcon from "../../../assets/clashRoyale/ui/cancel.webp";
import wreathClassic from "../../../assets/clashRoyale/ui/challenge-classic.webp";
import wreathGrand from "../../../assets/clashRoyale/ui/challenge-grand.webp";
import crlIcon from "../../../assets/clashRoyale/ui/crl.webp";

// Grüner Kranz für die Classic, goldener für Grand. Die 20-Win-Challenge läuft als CRL-Challenge:
// dort ist das CRL-Wappen selbst das Abzeichen, die Siegzahl sitzt in einem Feld auf seiner Spitze.
const WREATH = { classic: wreathClassic, grand: wreathGrand };

// Dunkle Kontur rundherum wie bei der Schrift im Spiel
const outline = "0 2px 0 #0b1830, 1px 1px 0 #0b1830, -1px 1px 0 #0b1830, 1px -1px 0 #0b1830, -1px -1px 0 #0b1830";
const SHIELD_PATH = "M5 3 H35 Q38 3 38 6 V24 Q38 36 20 44 Q2 36 2 24 V6 Q2 3 5 3 Z";

/** Kranz + Siegzahl im Schild, darunter die Niederlagen-Felder. Ersetzt im Kopf das 64px-Abzeichen. */
export function ChallengeBadge({ challenge }) {
  const gradId = useId();
  const maxLosses = Math.max(1, challenge.maxLosses || 3);
  const wins = challenge.wins || 0;
  const lossRow = (
    <div style={local.lossRow}>
      {Array.from({ length: maxLosses }, (_, i) => (
        <span key={i} style={i < challenge.losses ? { ...local.lossBox, ...local.lossBoxHit } : local.lossBox}>
          {i < challenge.losses && <img src={crossIcon} alt="" style={local.crossImg} />}
        </span>
      ))}
    </div>
  );
  if (challenge.key === "20win") {
    return (
      <div style={local.badgeCol}>
        <div style={local.wreathBox}>
          <img src={crlIcon} alt="" style={local.wreathImg} />
          <span style={local.crlNumber}>{wins}</span>
        </div>
        {lossRow}
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

const local = {
  // Breite = 64px-Abzeichen der anderen Modi; Höhe 60 + 3 + 18 = 81
  badgeCol: { width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  wreathBox: { position: "relative", width: 60, height: 60 },
  wreathImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
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
  lossRow: { display: "flex", gap: 3 },
  lossBox: {
    width: 18, height: 18, borderRadius: 4, boxSizing: "border-box",
    background: "#0e2347", border: "1.5px solid #0b1830",
    boxShadow: "inset 0 2px 0 rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  lossBoxHit: { background: "#b8203a" },
  crossImg: { width: 14, height: 14, objectFit: "contain" },
};
