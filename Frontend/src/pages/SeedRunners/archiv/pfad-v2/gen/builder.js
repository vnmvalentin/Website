// Werkzeug zum Schreiben von Chunk-Templates. Ein Chunk ist ein handgestaltetes Stück Level, das
// der Generator per Seed mit anderen zusammensetzt.
//
// SO FÜGST DU EINEN NEUEN CHUNK HINZU
//   1. In einer Datei unter gen/chunks/ einen Eintrag mit chunk(...) ergänzen (siehe dort).
//   2. `npm run test:seedrunners` — der Schema-Test sagt dir, wenn Rand oder Angaben nicht stimmen.
//   3. `npm run seedrunners:solve -- <id>` — ein Suchlauf spielt den Chunk in allen Tempo-Klassen
//      durch und meldet, ob er lösbar ist.
//
// REGELN, damit Chunks beliebig aneinanderpassen
//   · Die ersten und letzten beiden Spalten sind ebener Boden: Oberkante in Zeile `entry`
//     (links) bzw. `exit` (rechts), darüber Luft. Was dazwischen passiert, ist frei.
//   · Der Chunk beschreibt sein Rechteck komplett: Boden bis zur untersten Zeile fest, wo keiner
//     sein soll (Abgrund), bleibt es Luft bis zur untersten Zeile.
//   · Genug Luft darüber lassen: Ein Doppelsprung steigt 7,5 Tiles.
//   · Gefahren nicht in die Randspalten (Spawn-Sicherheit).
//   · Elemente mit Parametern (Sägen, Laser, Plattformen, Portale …) setzt `b.marker(...)`.
//     Zufallsbereiche: R(min, max) für Kommazahlen, Ri(min, max) für ganze Zahlen.
//
// Felder von `meta`
//   w, h, entry, exit   Größe in Tiles und Bodenzeilen links/rechts
//   difficulty 1..5     bestimmt, wo im Level der Chunk vorkommt und wie nah an der Reichweite
//                       seine Lücken liegen dürfen
//   needs               nötige Fähigkeiten: 'jump' | 'double' | 'dash' | 'wall' | 'grapple'
//   tags                Mechaniken im Chunk (für Biome und die schrittweise Einführung)
//   intro: 'tag'        sichere Erstbegegnung mit dieser Mechanik
//   combo: true         Kombinations-Chunk (nur im hinteren Teil des Levels)
//   mirror: true        darf horizontal gespiegelt werden (nur wenn er in beide Richtungen gleich
//                       gut spielbar ist — bei Abstiegen NICHT setzen)
//   iceable: true       darf im Eis-Biom seinen Boden vereisen
//   weight              relative Häufigkeit (Standard 1)
//   classes             nur in diesen Tempo-Klassen würfeln, z.B. ['fast']. Für Chunks, deren Geometrie
//                       am Tempo hängt und sich nicht dehnen lässt (Kristallketten): je Klasse eine Variante
//   gaps                feste Lücken, die der Validator gegen die Reichweite prüft, der Generator
//                       aber nicht dehnt: [{ reach, width }] (Breite in Tiles, Reichweiten wie unten)
//   stretch             dehnbare Spalten: [{ col, max, reach?, base? }]. `col` wird bis zu `max`
//                       Mal vervielfältigt. Mit `reach` ('jump' | 'double' | 'dash' | 'dashDouble' |
//                       'dashJump' | 'dashJumpDouble') verbreitert es eine LÜCKE, deren Breite
//                       ohne Dehnung `base` Tiles ist; der Generator dehnt nur so weit, wie die
//                       gemessene Reichweite der Tempo-Klasse es erlaubt (Tempo "Schnell" bekommt
//                       also breitere Lücken). Ohne `reach` verlängert es nur den Boden.

/** Zufallsbereich (Kommazahl), wird vom Generator per Seed aufgelöst */
export const R = (min, max) => ({ r: [min, max] });
/** Zufallsbereich (ganze Zahl) */
export const Ri = (min, max) => ({ r: [min, max], int: true });

const MARKER_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function chunk(id, meta, draw) {
  const { w, h, entry, exit } = meta;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  const markers = {};
  let nextMarker = 0;

  const inside = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
  const put = (x, y, ch) => {
    if (!inside(x, y)) throw new Error(`Chunk ${id}: (${x}, ${y}) liegt außerhalb ${w}×${h}`);
    grid[y][x] = ch;
  };
  const rect = (x, y, rw, rh, ch = '#') => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) put(xx, yy, ch);
  };

  const b = {
    w, h, entry, exit,
    put,
    rect,
    /** Boden von Spalte x0 bis x1 (exklusiv), Oberkante in Zeile `row` (Standard: Eingangszeile), bis unten fest */
    ground: (x0, x1, row = entry) => rect(x0, row, x1 - x0, h - row, '#'),
    /** Eine Tile dicke Plattform */
    plat: (x, y, len, ch = '#') => rect(x, y, len, 1, ch),
    /** Senkrechte Wand von Zeile y0 bis y1 (beide inklusive) */
    wall: (x, y0, y1, ch = '#') => rect(x, y0, 1, y1 - y0 + 1, ch),
    /** Element mit Parametern; gibt das gewählte Zeichen zurück */
    marker(x, y, def) {
      if (nextMarker >= MARKER_LETTERS.length) throw new Error(`Chunk ${id}: mehr als 26 Marker`);
      const ch = MARKER_LETTERS[nextMarker++];
      markers[ch] = def;
      put(x, y, ch);
      return ch;
    },
  };
  draw(b);

  return Object.freeze({
    id,
    w, h, entry, exit,
    difficulty: meta.difficulty,
    tags: meta.tags || [],
    needs: meta.needs || [],
    intro: meta.intro || null,
    combo: !!meta.combo,
    mirror: !!meta.mirror,
    iceable: !!meta.iceable,
    weight: meta.weight ?? 1,
    classes: meta.classes || null,
    special: meta.special || null,
    stretch: meta.stretch || [],
    gaps: meta.gaps || [],
    rows: grid.map((r) => r.join('')),
    markers,
  });
}
