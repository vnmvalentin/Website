// Prüfung eines Chunk-Templates: findet Tippfehler und Verstöße gegen die Übergangsregeln, bevor
// ein Level damit gebaut wird. Gibt eine Liste von Meldungen zurück (leer = in Ordnung).
import { parseMap } from '../sim/tilemap.js';
import { ELEMENT_TYPES } from '../sim/elements/index.js';

const REACH_KEYS = ['jump', 'double', 'dash', 'dashDouble', 'dashJump', 'dashJumpDouble'];
const NEEDS = ['jump', 'double', 'dash', 'wall', 'grapple'];
// Mindestluft über dem Boden an den Rändern: ein Doppelsprung steigt 7,5 Tiles
const MIN_HEADROOM = 10;
// Elemente, die in Luft stehen müssen (nicht in einer festen Kachel)
const NEEDS_AIR = new Set(['spike', 'spring', 'ring', 'crystal', 'key', 'switch', 'portal', 'saw', 'crumble', 'fallingBlock']);

export function validateTemplate(tpl) {
  const errs = [];
  const say = (msg) => errs.push(`${tpl.id}: ${msg}`);

  if (!/^[a-z0-9-]+$/.test(tpl.id)) say('ID nur aus a-z, 0-9 und Bindestrich');
  if (!(tpl.difficulty >= 1 && tpl.difficulty <= 5 && Number.isInteger(tpl.difficulty))) say('difficulty muss 1..5 sein');
  if (tpl.rows.length !== tpl.h) say(`h=${tpl.h}, aber ${tpl.rows.length} Zeilen`);
  for (const [y, row] of tpl.rows.entries()) {
    if (row.length !== tpl.w) { say(`Zeile ${y} hat ${row.length} statt ${tpl.w} Zeichen`); return errs; }
  }
  for (const n of tpl.needs) if (!NEEDS.includes(n)) say(`unbekannte Fähigkeit "${n}"`);
  if (tpl.classes && !tpl.classes.every((c) => ['normal', 'fast', 'super'].includes(c))) say('classes: nur normal, fast, super');
  if (tpl.mirror && tpl.entry !== tpl.exit) say('mirror braucht entry === exit');

  const at = (x, y) => (y >= 0 && y < tpl.h ? tpl.rows[y][x] : '.');
  const special = tpl.special;

  // Übergänge: die letzten/ersten beiden Spalten sind ebener Boden
  if (tpl.entry < MIN_HEADROOM || tpl.exit < MIN_HEADROOM) say(`zu wenig Luft über dem Boden (mindestens ${MIN_HEADROOM} Zeilen)`);
  for (const [cols, row, label] of [[[0, 1], tpl.entry, 'Eingang'], [[tpl.w - 2, tpl.w - 1], tpl.exit, 'Ausgang']]) {
    for (const x of cols) {
      if (at(x, row) !== '#') say(`${label}: Spalte ${x} braucht festen Boden in Zeile ${row}`);
      if (at(x, row - 1) !== '.') say(`${label}: Spalte ${x} muss über dem Boden frei sein (Zeile ${row - 1}: "${at(x, row - 1)}")`);
      for (let y = 0; y < row - 1; y++) {
        if (at(x, y) !== '.') say(`${label}: Spalte ${x}, Zeile ${y} muss Luft sein`);
      }
    }
  }

  // Zeichen
  const usedMarkers = new Set();
  for (const [y, row] of tpl.rows.entries()) {
    for (let x = 0; x < tpl.w; x++) {
      const ch = row[x];
      if (ch >= 'a' && ch <= 'z') usedMarkers.add(ch);
      if ('SCE'.includes(ch) && !special) say(`"${ch}" gehört nur in Start-/Checkpoint-/Ziel-Chunks (${x}, ${y})`);
    }
  }
  for (const ch of usedMarkers) if (!tpl.markers[ch]) say(`Marker "${ch}" ohne Beschreibung`);
  for (const ch of Object.keys(tpl.markers)) if (!usedMarkers.has(ch)) say(`Marker "${ch}" beschrieben, aber nicht im Raster`);
  for (const [ch, def] of Object.entries(tpl.markers)) {
    if (!ELEMENT_TYPES[def.type]) say(`Marker "${ch}": unbekannter Typ "${def.type}"`);
  }

  // Dehnung und Lücken
  for (const s of tpl.stretch) {
    if (!(s.col >= 2 && s.col < tpl.w - 2)) say(`stretch col ${s.col} liegt in den Randspalten`);
    if (!(s.max >= 1)) say(`stretch col ${s.col}: max fehlt`);
    if (s.reach && !REACH_KEYS.includes(s.reach)) say(`stretch: unbekannte Reichweite "${s.reach}"`);
    if (s.reach && !(s.base >= 1)) say(`stretch col ${s.col}: base fehlt`);
    for (let y = 0; y < tpl.h; y++) {
      if (tpl.rows[y][s.col] >= 'a' && tpl.rows[y][s.col] <= 'z') say(`stretch col ${s.col} enthält einen Marker (Zeile ${y})`);
    }
  }
  for (const g of tpl.gaps) {
    if (!REACH_KEYS.includes(g.reach) || !(g.width > 0)) say(`gaps: ungültiger Eintrag ${JSON.stringify(g)}`);
  }

  // Parsen (Sonderzeichen erlaubt, Marker beschreiben) und Elemente auf Plausibilität prüfen
  try {
    const rows = special === 'start' ? tpl.rows : tpl.rows.map((r) => r);
    const withStart = special ? rows : rows.map((r, y) => (y === tpl.entry - 1 ? `S${r.slice(1)}` : r));
    const map = parseMap(withStart, { markers: Object.fromEntries(Object.entries(tpl.markers).map(([k, v]) => [k, stripRanges(v)])) });
    for (const e of map.entities) {
      if (NEEDS_AIR.has(e.type) && map.solid[e.ty * map.w + e.tx]) say(`${e.type} bei (${e.tx}, ${e.ty}) steckt in einem festen Block`);
      if (e.tx < 2 || e.tx >= map.w - 2) {
        if (['spike', 'saw', 'laser', 'fallingBlock'].includes(e.type)) say(`Gefahr ${e.type} in einer Randspalte (${e.tx})`);
      }
    }
    // Schalter: gerade Anzahl (der Zustand muss nach dem Chunk wieder am Anfang sein)
    if (map.entities.filter((e) => e.type === 'switch').length % 2 !== 0) say('ungerade Zahl Schalter');
    // Portale: jedes hat einen Partner im selben Chunk
    const ids = new Set(Object.values(tpl.markers).filter((m) => m.type === 'portal').map((m) => m.id));
    for (const m of Object.values(tpl.markers)) {
      if (m.type === 'portal' && !ids.has(m.pair)) say(`Portal "${m.id}": Partner "${m.pair}" fehlt`);
    }
  } catch (e) {
    say(`parseMap: ${e.message}`);
  }
  return errs;
}

// Zufallsbereiche { r: [a, b] } durch ihren Mittelwert ersetzen, damit die Prüfung parsen kann
function stripRanges(def) {
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.r) ? (v.r[0] + v.r[1]) / 2 : v;
  }
  return out;
}
