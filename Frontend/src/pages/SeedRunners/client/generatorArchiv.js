// generatorArchiv.js — welche Generator-Version baut ein Zufallslevel? Die laufende (gen/world) oder eine eingefrorene
// (archiv/pfad-vN, siehe gen/tools/einfrieren.mjs). Eingefrorene Versionen werden erst geladen, wenn ein Level sie braucht
// (eigener Code-Teil, der sonst nie heruntergeladen wird).
//
// Liegt unter client/, nicht unter gen/: Der Server-Spiegel kopiert gen/ — und dieselbe Datei im Archiv würde auf ein
// archiv/ INNERHALB des Archivs zeigen. Der Server hat seine eigene Weiche (Backend/seedRunners/replay.js).
import { generateWorld } from '../gen/world/generate.js';
import { GEN_VERSION, ohneGv } from '../gen/index.js';

// Jede eingefrorene Version hier eintragen (statischer Pfad, damit der Bundler sie als eigenen Teil kennt)
const ARCHIV = {
  1: () => import('../archiv/pfad-v1/gen/world/generate.js'),
};

/** Die generateWorld-Funktion einer Version */
export async function welterzeugerFuer(gv = GEN_VERSION) {
  if (gv === GEN_VERSION) return generateWorld;
  const laden = ARCHIV[gv];
  if (!laden) throw new Error(`Generator-Version ${gv} ist unbekannt — die Seite ist vermutlich veraltet, bitte neu laden.`);
  return (await laden()).generateWorld;
}

/** Ein Pfad-Level zu weltParams (gen/index.js) — mit der Version, die in den Parametern steht (ohne Angabe: die laufende,
 *  z. B. in der Welten-Werkbank) */
export async function erzeugeWelt(w) {
  const erzeuge = await welterzeugerFuer(w.gv ?? GEN_VERSION);
  return erzeuge(ohneGv(w));
}
