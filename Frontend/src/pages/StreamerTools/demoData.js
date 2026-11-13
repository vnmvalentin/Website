// demoData.js — Beispieldaten, mit denen die echten Overlays auf der Website vorgeführt werden: in der Galerie
// (OverlayGalleryPage.jsx) und in den Live-Vorschauen der Karten auf /tools (ToolPreviews.jsx).

// Wie im Win-Tracker-Editor voreingestellt (WinTrackerPage.jsx)
export const WT_SETTINGS = {
  showDailyProfit: true, showWinLossNumbers: true, showWinLossPercent: true, showLast5: true,
  bgColor: "#0c0c12", bgOpacity: 88, bgGradient: false, bgColor2: "#1a1a2e", borderColor: "",
  last5Style: "result", last5Direction: "newestLeft", last5NewBadge: true,
  showDeck: true, showProfile: true, deckPlacement: "top", language: "de",
  paginateOverlay: false, paginateIntervalS: 6, showClan: false,
  overlayTheme: "classic", royalePanel: "blue", royalePattern: true, overlayScale: 100,
};

export const WC_DOC = {
  title: "Win Challenge",
  items: [
    { id: "d1", name: "3 Siege mit Zufallsdeck", useWins: true, target: 3, progress: 2 },
    { id: "d2", name: "Ohne Zauber gewinnen", done: true },
    { id: "d3", name: "Gegen einen Zuschauer", pinned: true },
  ],
};
export const WC_TIMER_MS = (47 * 60 + 12) * 1000; // stehende Beispielzeit statt 00:00:00

// Bingo: 4 × 4 mit dem Aussehen, das der Editor für eine neue Karte voreinstellt (BingoEditorPage.jsx)
export const BINGO_SIZE = 4;
export const BINGO_STYLE = { textScale: 0.8, cardOpacity: 0.6, cardBg: "#000000", textColor: "#ffffff", lineColor: "#ffffff", lineWidth: 2 };
export const BINGO_TEXTS = [
  "Raid kommt rein", "Rage Quit", "GG im Chat", "Lag-Spike",
  "Neuer Sub", "Mikro ist stumm", "Clip des Tages", "Katze im Bild",
  "Chat hat recht", "Erster Tod", "Handy klingelt", "Falsche Taste",
  "Kaffee leer", "Hype Train", "1 HP Clutch", "Noch eine Runde",
];
// Reihenfolge, in der die Felder in der Vorschau abgehakt werden — die letzten vier schließen die zweite Zeile
export const BINGO_ORDER = [10, 3, 12, 4, 5, 6, 7];
