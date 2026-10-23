// stylePresets.js — fertige Farbkombinationen des Win-Challenge-Overlays. Genutzt vom Design-Tab im Editor
// (WinChallenge.jsx) und von der Overlay-Galerie auf /tools ("Verwenden" → /WinChallenge-Overlay?vorlage=<id>).
//
// Der Design-Tab überfordert vor allem deshalb, weil man sechs Farben einzeln treffen muss, bevor irgendetwas gut
// aussieht — mit einem Klick ist man dagegen sofort an einem brauchbaren Ausgangspunkt.
export const STYLE_PRESETS = [
  {
    id: "twitch",
    label: "Twitch",
    style: { boxBg: "#0B0F1A", headerBg: "#18122B", itemBg: "#1B1730", textColor: "#ffffff", titleColor: "#ffffff", accent: "#9146FF" },
  },
  {
    id: "mitternacht",
    label: "Mitternacht",
    style: { boxBg: "#05070D", headerBg: "#0B1220", itemBg: "#111827", textColor: "#E5E7EB", titleColor: "#ffffff", accent: "#38BDF8" },
  },
  {
    id: "hell",
    label: "Hell",
    style: { boxBg: "#F8FAFC", headerBg: "#E2E8F0", itemBg: "#FFFFFF", textColor: "#0F172A", titleColor: "#0F172A", accent: "#7C3AED" },
  },
  {
    id: "neon",
    label: "Neon",
    style: { boxBg: "#0A0A0F", headerBg: "#12021F", itemBg: "#1A0B2E", textColor: "#F0ABFC", titleColor: "#22D3EE", accent: "#22D3EE" },
  },
  {
    id: "wald",
    label: "Wald",
    style: { boxBg: "#0A1410", headerBg: "#0F2018", itemBg: "#132C20", textColor: "#D1FAE5", titleColor: "#ffffff", accent: "#34D399" },
  },
  {
    id: "sand",
    label: "Sand",
    style: { boxBg: "#1C1917", headerBg: "#292524", itemBg: "#332E2A", textColor: "#FAFAF9", titleColor: "#FCD34D", accent: "#F59E0B" },
  },
];
