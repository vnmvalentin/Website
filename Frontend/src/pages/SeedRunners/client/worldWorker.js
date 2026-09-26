// Web Worker für die Weltengenerierung v2.
//
// Warum überhaupt ein eigener Faden? Erzeugen und Prüfen liegen heute bei wenigen Millisekunden,
// aber die späteren Stufen (Kandidatenauswahl, Grammatik, Bewertung) rechnen deutlich mehr. Der
// Plan setzt die Grenze bei 1–2 s — und alles, was im Haupt-Faden länger als ein Bild dauert, lässt
// die Seite hängen. Lieber jetzt den Weg bauen, solange er noch leer ist.
//
// Der Worker liegt bewusst unter client/ und NICHT unter gen/: Der Spiegel nach Backend/ kopiert
// sim/, gen/ und level/, und aus diesen Quellen entsteht der GEN-Fingerprint. Der darf sich nur
// ändern, wenn sich der INHALT der Welten ändert — Browser-Klempnerei gehört nicht hinein.

import { checkLevel } from '../gen/world/reichweite/graph.js';
import { erzeugeWelt } from './generatorArchiv.js';

self.onmessage = async (e) => {
  const { id, params, check = true } = e.data || {};
  try {
    const t0 = performance.now();
    // (die Generator-Version aus den Parametern — ein Favorit von gestern baut mit seinem eingefrorenen Generator)
    const level = await erzeugeWelt(params);
    const genMs = performance.now() - t0;

    const t1 = performance.now();
    const report = check ? checkLevel(level, level.meta.limits) : null;
    const checkMs = performance.now() - t1;

    self.postMessage({ id, level, report, genMs, checkMs });
  } catch (err) {
    // Eine kaputte Welt darf den Worker nicht mitnehmen — sonst steht die Seite ohne Rückmeldung da.
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
