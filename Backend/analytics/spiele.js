// analytics/spiele.js — welche gekürzten Seiten (normalize.js) zu welchem Spiel gehören. Grundlage für „Spieler je Spiel“
// und den Trichter im Admin-Reiter „Spiele“; die IDs nutzt auch lib/spielStatistik.js für die Live-Zahlen.
// Gegenstück im Browser ist SPIELE in Frontend/src/utils/leistungMessung.js — ein neues Spiel gehört in beide Listen
// (Anschluss leistung-neue-spiele im Ausbauplan).

const SPIELE = [
  { id: "adventures", name: "adVentures", praefixe: ["/adventures"] },
  { id: "garden", name: "Virtual Farm", praefixe: ["/garden"] },
  { id: "seed-runners", name: "Seed Runners", praefixe: ["/seed-runners"] },
  { id: "sacrifice-and-sigils", name: "Sacrifice & Sigils", praefixe: ["/sacrifice-and-sigils"] },
  { id: "blobby", name: "Blobby Volley", praefixe: ["/blobby"] },
  { id: "flick-soccer", name: "Flick Soccer", praefixe: ["/flick-soccer"] },
  { id: "worldflip", name: "Worldflip", praefixe: ["/worldflip"] },
  { id: "lights-out", name: "Lights Out", praefixe: ["/lights-out"] },
  // Spieleabend ersetzt Connect 4 (17.11.2026); alte /connect4-Links leiten dorthin weiter und zählen mit
  { id: "spieleabend", name: "Spieleabend", praefixe: ["/spieleabend", "/connect4"] },
  // Der Minigame-Hub selbst; Turniere und Win Tracker unter /clash-royale/… sind keine Spiele
  { id: "cr-minigames", name: "CR-Minigames", exakt: ["/clash-royale"] },
  { id: "cr-wer-bin-ich", name: "Wer bin ich?", praefixe: ["/clash/wer-bin-ich"] },
  {
    id: "cr-ratespiele",
    name: "CR-Ratespiele",
    praefixe: ["/clash/wordle", "/clash/kartenraten", "/clash/stats-duell", "/clash/zoom", "/clash/pixel", "/clash/farbe", "/clash/heute"],
  },
];

const passt = (pfad, praefix) => pfad === praefix || pfad.startsWith(`${praefix}/`);

/** Spiel-ID zu einer gekürzten Seite, sonst null */
function spielVonPfad(pfad) {
  if (typeof pfad !== "string") return null;
  for (const s of SPIELE) {
    if (s.exakt && s.exakt.includes(pfad)) return s.id;
    if (s.praefixe && s.praefixe.some((p) => passt(pfad, p))) return s.id;
  }
  return null;
}

module.exports = { SPIELE, spielVonPfad };
