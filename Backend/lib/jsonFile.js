// Gemeinsames Lesen/Schreiben der JSON-Datenspeicher (casinoData.json, adventures-users.json,
// polls.json, giveaways.json …).
//
// WARUM: Bisher lieferte jede Ladefunktion bei einem Lesefehler still `{}`/`[]` zurück, und
// geschrieben wurde direkt in die Zieldatei. Ein Absturz mitten im Schreiben hinterließ eine
// halbe Datei → der nächste Aufruf las "leer" → die nächste Speicherung schrieb leer + EINEN
// Nutzer zurück. Damit wären die Daten aller anderen weg gewesen.
//
// JETZT:
//   - writeJsonAtomic schreibt in eine .tmp-Datei und benennt sie dann um. Die Zieldatei ist
//     also immer entweder der alte oder der neue Stand, nie ein halber.
//   - readJson liefert die Ersatzdaten, wenn die Datei fehlt oder leer ist. Ist sie kaputt,
//     wird sie als defekt markiert, einmal als <datei>.corrupt-<zeit> gesichert, und Leser
//     bekommen die Ersatzdaten — aber writeJsonAtomic verweigert für diese Datei jedes
//     Schreiben, bis sie wieder lesbar ist (von Hand repariert / Backup zurückgespielt).
//   - Bewusst KEIN throw beim Lesen: mehrere Ladefunktionen laufen in Timern (z.B. das
//     Giveaway-Intervall). Ein Fehler dort würde den ganzen Prozess samt Discord-Bot beenden.

const fs = require("fs");
const path = require("path");

// Schlüssel ist der aufgelöste Pfad: adminRoutes baut seine Pfade über process.cwd(), die übrigen
// Module über __dirname — dieselbe Datei muss trotzdem für alle als defekt gelten.
const corruptFiles = new Set();
const key = (filePath) => path.resolve(filePath);

function cloneFallback(fallback) {
  return typeof fallback === "object" && fallback !== null ? structuredClone(fallback) : fallback;
}

function markCorrupt(filePath, reason) {
  if (corruptFiles.has(key(filePath))) return;
  corruptFiles.add(key(filePath));
  let backup = "";
  try {
    backup = `${filePath}.corrupt-${Date.now()}`;
    fs.copyFileSync(filePath, backup);
  } catch (e) {
    backup = `(Sicherung fehlgeschlagen: ${e.message})`;
  }
  console.error(
    `[jsonFile] ${filePath} ist nicht lesbar (${reason}). Schreiben ist gesperrt, bis die Datei `
    + `repariert ist — sonst würden die übrigen Daten überschrieben. Kopie: ${backup}`
  );
}

/**
 * @param {string} filePath
 * @param {*} fallback  Startwert, wenn die Datei (noch) nicht existiert
 */
function readJson(filePath, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return cloneFallback(fallback);
    console.error(`[jsonFile] ${filePath} konnte nicht gelesen werden:`, e.message);
    // Kein markCorrupt: die Datei selbst ist evtl. heil (z.B. Rechteproblem) — trotzdem nicht
    // überschreibbar machen, solange unklar ist, was drinsteht.
    corruptFiles.add(key(filePath));
    return cloneFallback(fallback);
  }
  // Leer = nichts mehr da, was eine Sperre schützen könnte (alter, abgebrochener Schreibvorgang
  // oder von Hand angelegt) — wie "fehlt" behandeln, aber sichtbar machen.
  if (!raw.trim()) {
    console.warn(`[jsonFile] ${filePath} ist leer — starte mit Standardwert.`);
    return cloneFallback(fallback);
  }
  try {
    const parsed = JSON.parse(raw);
    corruptFiles.delete(key(filePath));
    return parsed;
  } catch (e) {
    markCorrupt(filePath, e.message);
    return cloneFallback(fallback);
  }
}

/**
 * @returns {boolean} true, wenn gespeichert wurde
 */
function writeJsonAtomic(filePath, data, { pretty = true } = {}) {
  if (corruptFiles.has(key(filePath))) {
    console.error(`[jsonFile] Schreiben nach ${filePath} verweigert — Datei ist als defekt markiert.`);
    return false;
  }
  const tmp = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), "utf8");
    fs.renameSync(tmp, filePath);
    return true;
  } catch (e) {
    console.error(`[jsonFile] Schreiben nach ${filePath} fehlgeschlagen:`, e.message);
    return false;
  }
}

module.exports = { readJson, writeJsonAtomic };
