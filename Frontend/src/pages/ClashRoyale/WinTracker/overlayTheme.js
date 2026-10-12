// overlayTheme.js — Aussehen der Win-Tracker-Karte, gemeinsam für das echte OBS-Overlay
// (WinTrackerOverlayPage.jsx) und die Vorschau im Editor (OverlayPreview.jsx). Beide behalten ihr
// eigenes Basis-`styles`-Objekt (Pixel-Parität, siehe dortige Kommentare); diese Datei legt nur
// das gewählte Aussehen darüber und berechnet Kartenfläche + Trennlinien — vorher stand genau
// diese Rechnung doppelt in beiden Dateien.
//
//   classic  bisherige schlichte Karte: bgColor/Verlauf/Deckkraft/Rahmenfarbe frei wählbar
//   royale   Clash-Royale-Look: Spieltafel mit dunklem Rand und hartem Sockel, Lilita One,
//            weiße Schrift mit schwarzer Kontur, Ergebnis-Blasen als kleine 3D-Knöpfe.
//            Einstellbar: Tafelfarbe (royalePanel), Rauten-Karo (royalePattern), Deckkraft.
//
// Größen sind im Royale-Look bewusst nah an classic gehalten (gleiche Paddings/Abstände) — wer in
// OBS schon eine Quelle zugeschnitten hat, soll beim Umschalten nicht alles neu ziehen müssen.

export const CR_FONT = '"Lilita One", "Fredoka", ui-rounded, system-ui, sans-serif';
export const CR_FONT_HREF = "https://fonts.googleapis.com/css2?family=Lilita+One&display=swap";

// Tafelfarben: hell (oben) → Grundton (unten) → Rand/Sockel. Blau = Menü-Tafeln im Spiel,
// Rot = gegnerische Seite, Lila = Legendär, Dunkel = zurückhaltend für helle Spielszenen.
export const ROYALE_PANELS = {
  blue: { light: "#4b88d6", base: "#28589c", edge: "#0b1a30" },
  red: { light: "#e0625b", base: "#a52e2e", edge: "#2b0b0b" },
  purple: { light: "#9a6fe0", base: "#5a359f", edge: "#1a0d33" },
  dark: { light: "#2c3c55", base: "#152034", edge: "#04080f" },
};

function hexToRgba(hex, opacityPct) {
  const h = String(hex || "#0c0c12").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct ?? 88)) / 100})`;
}

// Schwarze Kontur wie bei jeder Schrift im Spiel: acht Richtungen plus harter Schatten nach unten.
function outline(px, drop = px + 1) {
  const c = "#000";
  return [
    `-${px}px -${px}px 0 ${c}`, `${px}px -${px}px 0 ${c}`, `-${px}px ${px}px 0 ${c}`, `${px}px ${px}px 0 ${c}`,
    `0 -${px}px 0 ${c}`, `0 ${px}px 0 ${c}`, `-${px}px 0 0 ${c}`, `${px}px 0 0 ${c}`,
    `0 ${drop + px}px 0 rgba(0,0,0,0.45)`,
  ].join(", ");
}

// Rauten-Karo der Menüs, sehr zurückhaltend (eine Raute je Kachel, weiß mit 5 % Deckung).
const PATTERN_URL = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><path d="M17 0L34 17L17 34L0 17Z" fill="#fff" fill-opacity="0.055"/></svg>'
)}")`;

const ROYALE_RESULT = {
  win: { light: "#7fe14d", base: "#3b9f28", edge: "#174a0e" },
  loss: { light: "#ff6d5f", base: "#cf372d", edge: "#5a120d" },
  draw: { light: "#b4c0d0", base: "#74839a", edge: "#28313d" },
};

/**
 * @param {object} base      Basis-styles der aufrufenden Datei
 * @param {object} settings  Overlay-Einstellungen (overlayTheme, royalePanel, royalePattern, bg*, borderColor)
 * @returns {{ royale: boolean, styles: object, cardSurface: object, dividerStyle: object, vDividerStyle: object,
 *             statSepStyle: object }}
 */
export function overlayLook(base, settings = {}) {
  const opacity = settings.bgOpacity ?? 88;
  const opacityFrac = Math.max(0, Math.min(100, opacity)) / 100;

  if (settings.overlayTheme !== "royale") {
    // Interne Trennlinien bleiben IMMER die dezente, von bgOpacity abgeleitete weiße Linie — die
    // Rahmenfarbe gilt bewusst nur für den äußeren Kartenrand. Eigene Rahmenfarbe nie
    // hauchdünn-unsichtbar wie die automatische Linie (min. 45 % Deckkraft).
    const lineColor = `rgba(255,255,255,${(0.08 * opacityFrac).toFixed(3)})`;
    const borderColor = settings.borderColor
      ? hexToRgba(settings.borderColor, Math.max(45, opacity))
      : lineColor;
    const background = settings.bgGradient
      ? `linear-gradient(135deg, ${hexToRgba(settings.bgColor, opacity)}, ${hexToRgba(settings.bgColor2, opacity)})`
      : hexToRgba(settings.bgColor, opacity);
    return {
      royale: false,
      styles: base,
      cardSurface: { background, border: `1px solid ${borderColor}` },
      dividerStyle: { ...base.divider, background: lineColor },
      vDividerStyle: { ...base.vDivider, background: lineColor },
      // Trennlinien zwischen den Session-Werten: etwas kräftiger als die von der Deckkraft
      // abgeleitete Linie, sonst verschwinden sie bei niedriger Deckkraft.
      statSepStyle: { borderLeft: "1px solid rgba(255,255,255,0.12)" },
    };
  }

  const panel = ROYALE_PANELS[settings.royalePanel] || ROYALE_PANELS.blue;
  const gradient = `linear-gradient(to bottom, ${hexToRgba(panel.light, opacity)}, ${hexToRgba(panel.base, opacity)})`;
  // Rand und Sockel nie ganz durchsichtig — ohne sie zerfällt die Tafel bei niedriger Deckkraft.
  const edge = hexToRgba(panel.edge, Math.max(60, opacity));
  const cardSurface = {
    backgroundImage: settings.royalePattern !== false ? `${PATTERN_URL}, ${gradient}` : gradient,
    backgroundColor: "transparent",
    border: `3px solid ${edge}`,
    borderRadius: 16,
    backdropFilter: "none",
    boxShadow: `inset 0 2px 0 rgba(255,255,255,${(0.3 * opacityFrac).toFixed(2)}), inset 0 -3px 0 rgba(0,0,0,0.18), 0 5px 0 ${edge}`,
  };
  // Eingeprägte Fuge statt weißer Haarlinie: dunkle Linie mit hellem Lichtrand darunter.
  const fuge = { background: "rgba(4,10,22,0.45)", boxShadow: "0 1px 0 rgba(255,255,255,0.1)" };

  const styles = {
    ...base,
    name: { ...base.name, fontFamily: CR_FONT, fontWeight: 400, fontSize: 20, letterSpacing: "0.01em", textShadow: outline(1.5), padding: "0 3px" },
    badgeImg: { ...base.badgeImg, filter: "drop-shadow(0 3px 0 rgba(2,8,20,0.55))" },
    trophyValue: { ...base.trophyValue, fontFamily: CR_FONT, fontWeight: 400, fontSize: 26, letterSpacing: "0.01em", textShadow: outline(2) },
    stepMax: { ...base.stepMax, fontFamily: CR_FONT, fontWeight: 400, color: "rgba(255,255,255,0.8)", textShadow: outline(1.5) },
    rankLine: { ...base.rankLine, fontFamily: CR_FONT, fontWeight: 400, fontSize: 20, color: "#ffc93c", textShadow: outline(1.5) },
    clanName: { ...base.clanName, fontFamily: CR_FONT, fontWeight: 400, fontSize: 13, color: "rgba(255,255,255,0.9)", textShadow: outline(1, 0) },
    bestRowSlot: { ...base.bestRowSlot, fontFamily: CR_FONT, fontSize: 14, color: "rgba(255,255,255,0.85)", textShadow: outline(1, 0) },
    leagueTag: { ...base.leagueTag, fontFamily: CR_FONT, fontWeight: 400, fontSize: 17, color: "rgba(255,255,255,0.9)", textShadow: outline(1.5) },
    divider: { ...base.divider, height: 2 },
    // Linie im Kopf zwischen Name/Clan und Wert-Zeile als eingeprägte Fuge
    headerLine: { ...base.headerLine, height: 2, background: "rgba(4,10,22,0.45)", boxShadow: "0 1px 0 rgba(255,255,255,0.1)" },
    vDivider: { ...base.vDivider, width: 2 },
    deckCard: { ...base.deckCard, background: "rgba(4,12,28,0.5)", boxShadow: "inset 0 2px 3px rgba(0,0,0,0.45)" },
    // Session-Werte: Beschriftung in Gold, Werte groß mit Kontur — ohne eingelassene Spur dahinter
    statLabel: { ...base.statLabel, fontFamily: CR_FONT, fontWeight: 400, fontSize: 11, letterSpacing: "0.06em", color: "#ffc93c", textShadow: outline(1, 0) },
    statValue: { ...base.statValue, fontFamily: CR_FONT, fontWeight: 400, fontSize: 23, letterSpacing: "0.01em", textShadow: outline(1.5) },
    statDash: { ...base.statDash, color: "#fff" },
    // Ergebnis-Blasen als kleine 3D-Knöpfe (Sieg grün, Niederlage rot) mit Kontur-Schrift
    matchPill: (result) => {
      const c = ROYALE_RESULT[result] || ROYALE_RESULT.draw;
      return {
        textAlign: "center", padding: "5px 0", borderRadius: 8, fontSize: 13,
        fontFamily: CR_FONT, fontWeight: 400, fontVariantNumeric: "tabular-nums", color: "#fff",
        background: `linear-gradient(to bottom, ${c.light}, ${c.base})`,
        border: `2px solid ${c.edge}`,
        boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.35), 0 2px 0 ${c.edge}`,
        textShadow: outline(1),
      };
    },
    matchPillEmpty: {
      ...base.matchPillEmpty, padding: "5px 0", fontSize: 13, fontFamily: CR_FONT, fontWeight: 400,
      background: "rgba(4,12,28,0.35)", border: "2px solid rgba(4,12,28,0.45)",
    },
    // 3D-Knöpfe werfen 2px Sockel nach unten — NEWEST braucht dafür mehr Abstand
    last5BadgeRow: { ...base.last5BadgeRow, marginTop: 6 },
    last5Badge: { ...base.last5Badge, fontFamily: CR_FONT, fontWeight: 400, fontSize: 9, letterSpacing: "0.06em", color: "#ffc93c", textShadow: outline(1, 0) },
    last5Caption: { ...base.last5Caption, fontFamily: CR_FONT, fontWeight: 400, fontSize: 9, letterSpacing: "0.06em", color: "#ffc93c", textShadow: outline(1, 0) },
    dotEmpty: { ...base.dotEmpty, width: 11, height: 11, border: "2px solid rgba(4,12,28,0.6)", boxSizing: "border-box" },
    dot: (result) => {
      const c = ROYALE_RESULT[result] || ROYALE_RESULT.draw;
      return { width: 11, height: 11, borderRadius: "50%", background: c.light, border: `2px solid ${c.edge}`, boxSizing: "border-box" };
    },
  };

  return {
    royale: true,
    styles,
    cardSurface,
    dividerStyle: { ...styles.divider, ...fuge },
    vDividerStyle: { ...styles.vDivider, ...fuge },
    statSepStyle: { borderLeft: "2px solid rgba(4,10,22,0.45)", boxShadow: "inset 1px 0 0 rgba(255,255,255,0.1)" },
  };
}
