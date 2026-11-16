// blobby/statistikBruecke.js — Blobby Volley im Admin-Reiter „Spiele“, obwohl es in einem eigenen Prozess läuft
// (blobbyServer.js, Port 3002). Läuft im HAUPTprozess: fragt alle 30 s dessen /healthz ab (blobbyStats() in
// blobby/socket.js liefert rooms, spieler und partien = begonnene Partien seit Prozessstart), hält den letzten Stand
// für die synchrone Lieferfunktion von lib/spielStatistik.js bereit und zählt den Zuwachs der Partien.
//
// Antwortet der Blobby-Prozess länger nicht (lokal läuft er oft nicht mit), liefert die Funktion keinen Wert — der
// Admin zeigt dann „–“ statt einer erfundenen Null. Startet der Blobby-Prozess neu, beginnt sein Zähler bei 0; dann
// zählt der ganze neue Stand als Zuwachs.

const { meldeSpielAn, zaehlePartie } = require("../lib/spielStatistik");

const ABFRAGE_MS = 30 * 1000;
const VERALTET_MS = 3 * ABFRAGE_MS;
const MAX_ZUWACHS = 1000; // Schutz gegen Unsinn: mehr Partien in 30 s gibt es nicht

let stand = null; // { raeume, spieler, partien, zeit }
let timer = null;

/** Zuwachs der Partien zwischen zwei Ständen (rein, für Tests) */
function zuwachs(vorher, jetzt) {
  if (!Number.isFinite(jetzt) || jetzt < 0) return 0;
  if (!Number.isFinite(vorher) || jetzt < vorher) return Math.min(MAX_ZUWACHS, jetzt); // neu gestartet
  return Math.min(MAX_ZUWACHS, jetzt - vorher);
}

function uebernehme(daten, jetzt = Date.now()) {
  const partien = Number(daten?.partien);
  const neu = { raeume: Number(daten?.rooms) || 0, spieler: Number(daten?.spieler) || 0, partien, zeit: jetzt };
  // Erste Antwort nach dem Start des Hauptprozesses: nur merken, sonst zählten alle Partien seit Blobby-Start doppelt
  const plus = stand ? zuwachs(stand.partien, partien) : 0;
  for (let i = 0; i < plus; i += 1) zaehlePartie("blobby");
  stand = neu;
  return plus;
}

async function frageAb(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return;
    uebernehme(await res.json());
  } catch {
    // Blobby-Prozess nicht erreichbar: Stand veraltet von selbst, der Admin zeigt dann „–“
  }
}

function lieferung(jetzt = Date.now()) {
  if (!stand || jetzt - stand.zeit > VERALTET_MS) throw new Error("Blobby-Prozess antwortet nicht");
  return { raeume: stand.raeume, spieler: stand.spieler };
}

/** Einmal aus Backend/index.js. Mehrfacher Aufruf schadet nicht. */
function starteBlobbyStatistik() {
  if (timer) return;
  const host = process.env.BLOBBY_HOST || "127.0.0.1";
  const port = Number(process.env.BLOBBY_PORT) || 3002;
  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/healthz`;
  meldeSpielAn("blobby", () => lieferung());
  frageAb(url);
  timer = setInterval(() => frageAb(url), ABFRAGE_MS);
  timer.unref();
}

module.exports = { starteBlobbyStatistik, _intern: { zuwachs, uebernehme, lieferung, zuruecksetzen: () => { stand = null; } } };
