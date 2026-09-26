// Seed Runners — Generator-Version der Pfad-Level, die neue Zufallsrunden bekommen (Parameter `gv`).
//
// Muss zu GEN_VERSION im Frontend passen (gen/generator.js; der Test genVersion.test.js vergleicht mit dem Spiegel). Ältere
// Versionen bleiben eingefroren nachprüfbar (engine/archiv/pfad-vN, siehe replay.js und gen/tools/einfrieren.mjs im Frontend).
'use strict';

const PFAD_GEN_VERSION = 1;

/** Eine gv aus fremden Daten (Playlist, Bewertung): ganze Zahl von 1 bis zur laufenden Version, sonst null */
function cleanGv(raw) {
  if (raw === undefined || raw === null || raw === '') return 1;       // Angaben aus der Zeit vor der Versionierung
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= PFAD_GEN_VERSION ? n : null;
}

module.exports = { PFAD_GEN_VERSION, cleanGv };
