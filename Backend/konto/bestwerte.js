// konto/bestwerte.js — Katalog der Bestwerte je Spiel (Bestzeit, Höchstpunkte, längste Serie …). Ein Spiel kann nur
// Bestwerte melden, die hier stehen (POST /api/konto/bestwerte/:spiel bzw. meldeBestwerte() in
// Frontend/src/utils/kontoSpeicher.js). Das Konto behält je Wert den besten; die Visitenkarte /u/ zeigt sie.
// Spiel-IDs wie in analytics/spiele.js.
//
// Eintrag: { id: "kurz-kebab", name: { de, en }, art, besser }
//   art     "zeit"   Millisekunden, angezeigt als 1:23,45
//           "zahl"   ganze Zahl, angezeigt mit Tausenderpunkten
//   besser  "kleiner" (Zeiten) oder "groesser" (Punkte, Serien)
//   - IDs nie umbenennen oder neu vergeben: gespeicherte Werte hängen an der ID. Neue Bestwerte anhängen.
// Die Spiele tragen ihre Bestwerte selbst ein, wenn sie ans Konto angebunden werden (Anschluss bestwerte-spiele, Spur D).

const KATALOG = {
  // Spiele (Spur D, 17.11.2026), abgeleitet aus dem Stand im Browser (Frontend/src/pages/<Spiel>/kontoStand.js)
  "lights-out": [
    { id: "schnellste-flucht", name: { de: "Schnellste Flucht", en: "Fastest escape" }, art: "zeit", besser: "kleiner" },
  ],
  "flick-soccer": [
    { id: "siege", name: { de: "Siege", en: "Wins" }, art: "zahl", besser: "groesser" },
    { id: "tour-sterne", name: { de: "Sterne in der Tour", en: "Tour stars" }, art: "zahl", besser: "groesser" },
  ],
  blobby: [
    { id: "siege", name: { de: "Siege", en: "Wins" }, art: "zahl", besser: "groesser" },
    { id: "koenig-serie", name: { de: "Längste König-Serie", en: "Longest king streak" }, art: "zahl", besser: "groesser" },
  ],
  worldflip: [
    { id: "siege", name: { de: "Gewonnene Runden", en: "Rounds won" }, art: "zahl", besser: "groesser" },
  ],
  "sacrifice-and-sigils": [
    { id: "duell-siege", name: { de: "Gewonnene Duelle", en: "Duels won" }, art: "zahl", besser: "groesser" },
    { id: "moor-siege", name: { de: "Gewonnene Moorwanderungen", en: "Moor Walks won" }, art: "zahl", besser: "groesser" },
  ],
  spieleabend: [
    { id: "siege", name: { de: "Siege am Spieleabend", en: "Game night wins" }, art: "zahl", besser: "groesser" },
  ],
  "seed-runners": [
    { id: "rennsiege", name: { de: "Rennsiege", en: "Race wins" }, art: "zahl", besser: "groesser" },
    { id: "tagesrennen", name: { de: "Tagesrennen gelaufen", en: "Daily races run" }, art: "zahl", besser: "groesser" },
  ],
  adventures: [
    { id: "punkte", name: { de: "Höchstpunkte", en: "High score" }, art: "zahl", besser: "groesser" },
    { id: "tiefe", name: { de: "Größte Tiefe", en: "Deepest depth" }, art: "zahl", besser: "groesser" },
  ],
};

const ARTEN = new Set(["zeit", "zahl"]);
// Obergrenze gegen Unsinn: 10 Tage in Millisekunden bzw. eine Milliarde Punkte
const MAX_WERT = { zeit: 10 * 24 * 60 * 60 * 1000, zahl: 1_000_000_000 };

function bestwertInfo(spiel, id, katalog = KATALOG) {
  const liste = Object.prototype.hasOwnProperty.call(katalog, spiel) ? katalog[spiel] : null;
  return (liste || []).find((b) => b.id === id) || null;
}

/** Wert prüfen und runden; null, wenn er nicht in den Katalog passt */
function sichererWert(info, roh) {
  if (!info || !ARTEN.has(info.art)) return null;
  const w = Number(roh);
  if (!Number.isFinite(w) || w < 0 || w > MAX_WERT[info.art]) return null;
  return Math.round(w);
}

/** Ist `neu` besser als `alt`? (alt null = noch keiner) */
function istBesser(info, neu, alt) {
  if (alt == null) return true;
  return info.besser === "kleiner" ? neu < alt : neu > alt;
}

module.exports = { KATALOG, bestwertInfo, sichererWert, istBesser };
