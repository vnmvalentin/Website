// fehler/signatur.js — macht aus einer Fehlermeldung ein Fehlerbild und entfernt, was nicht ins Protokoll gehört.
//
// Gleiche Fehler sollen zusammenfallen, auch über Deploys hinweg: Zahlen und Zeilennummern fliegen raus, Vite-Chunks
// verlieren ihren Hash (GameContainer-a1B2c3D4.js → GameContainer.js). Zufällige Kennungen (Overlay- und
// Steuer-Schlüssel, Tokens) und Query-Teile von Adressen werden geschwärzt, BEVOR etwas gespeichert wird. Seiten werden
// auf ihre Route gekürzt; Overlays und Steuer-Links bleiben anders als in der Besucherstatistik sichtbar, nur ohne
// Schlüssel — gerade dort will man Fehler sehen.

const crypto = require("crypto");
const { normalizePath, isMobile } = require("../analytics/normalize");

// Zufällig aussehend = mindestens 16 Zeichen mit Buchstaben UND Ziffern. Bezeichner wie renderWithHooksAgain bleiben.
const ZUFALL = /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{16,}/g;
const ZAHLEN = /\b\d{2,}\b/g;
const HEX = /\b0x[0-9a-f]+\b/gi;
const URL_REST = /(https?:\/\/[^\s?#'"()]+)[?#][^\s'"()]*/g;

/** Für die Ablage: Query/Hash an Adressen und zufällige Kennungen weg, Länge begrenzt */
function schwaerze(text, max) {
  return String(text || "").replace(URL_REST, "$1").replace(ZUFALL, "…").slice(0, max);
}

/** Für den Vergleich: zusätzlich Zahlen, Hex-Werte und Leerraum vereinheitlicht */
function normalisiereNachricht(nachricht) {
  return schwaerze(nachricht, 1000).replace(HEX, "0x#").replace(ZAHLEN, "#").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Datei des ersten Stack-Rahmens ohne Pfad, Zeile und Chunk-Hash, z. B. "GameContainer.js" */
function ersterRahmen(stapel) {
  for (const zeile of String(stapel || "").split("\n")) {
    const m = zeile.match(/(?:\(|@|\bat\s+)((?:[A-Za-z]:)?[^()\s@]*?\.(?:m?js|cjs|jsx|tsx?))(?::\d+){0,2}\)?\s*$/);
    if (m) {
      return m[1].split(/[\\/]/).pop().replace(/-[A-Za-z0-9_]{6,12}(?=\.(?:m?js|cjs)$)/, "");
    }
  }
  return "";
}

function signaturVon({ quelle, art, nachricht, stapel }) {
  const basis = [quelle, art, normalisiereNachricht(nachricht), ersterRahmen(stapel)].join("|");
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

/** Seite ohne Schlüssel: bekannte Routen wie in der Besucherstatistik, Overlays/Steuer-Links bis zum Overlay-Teil */
function seiteVon(roh) {
  const pfad = String(roh || "").slice(0, 300).split(/[?#]/)[0];
  const gekuerzt = normalizePath(pfad);
  if (gekuerzt) return gekuerzt;
  const teile = pfad.split("/").filter(Boolean);
  const i = teile.findIndex((t) => /overlay|control/i.test(t));
  if (i >= 0) return `/${teile.slice(0, i + 1).join("/")}${teile.length > i + 1 ? "/*" : ""}`.slice(0, 120);
  return teile.length ? `/${schwaerze(teile[0], 40)}` : "/";
}

// OBS bleibt drin (Overlays!), anders als in der Besucherstatistik. Prerender und Prüfstände laufen headless.
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|puppeteer|playwright/i;
const istBot = (ua) => BOT.test(String(ua || ""));

const BROWSER = [
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok-App"],
  [/Instagram/i, "Instagram-App"],
  [/FBAN|FBAV/i, "Facebook-App"],
  [/OBS\/(\d+)/, "OBS"],
  [/Edg\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/Firefox\/(\d+)/, "Firefox"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]*.*Safari/, "Safari"],
];

function browserVon(ua) {
  const s = String(ua || "");
  for (const [re, name] of BROWSER) {
    const m = s.match(re);
    if (m) return m[1] ? `${name} ${m[1]}` : name;
  }
  return "anderer";
}

const geraetVon = (ua) => (isMobile(String(ua || "")) ? "Handy/Tablet" : "Desktop");

module.exports = { schwaerze, normalisiereNachricht, ersterRahmen, signaturVon, seiteVon, istBot, browserVon, geraetVon };
