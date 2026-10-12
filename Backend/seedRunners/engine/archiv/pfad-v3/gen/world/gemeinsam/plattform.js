// Start- und Zielplattform — verbindlich für JEDEN Welttyp.
//
// Der Anlass: Bis Phase 2 begann jedes Level irgendwo auf welligem Boden. Man stand schief, sah
// nicht, wo man ist, und war schon im Geschehen, bevor man den Blick sortiert hatte. Ein von Hand
// gebautes Level würde nie so anfangen.
//
// Die Arbeitsteilung ist Absicht: Der Welttyp sagt, WO Start und Ziel liegen sollen (er kennt seine
// Form). Was daraus wird — eben, breit, frei, ungefährlich — entscheidet diese Datei, und zwar für
// alle gleich. Sonst müsste man jedem der 16 Welttypen einzeln vertrauen.

import { ROCK, AIR, set, at } from '../../v2/terrain.js';

/** Breite der Startplattform in Kacheln: genug, um zu stehen, zu schauen und anzulaufen */
export const START_BREITE = 10;
/** Die Zielplattform darf ruhig auffallen — man soll sie von weitem als Ziel erkennen */
export const ZIEL_BREITE = 9;
/** So viele Zeilen werden über einer Plattform frei geräumt (Doppelsprung braucht 8) */
export const KOPFRAUM = 12;
/** In diesem Umkreis um den Start darf keine Gefahr stehen */
export const GEFAHRENFREI = 12;
/** Dicke des gesetzten Bodens — eine Kachel allein sieht aus wie ein Strich */
const DICKE = 2;
/** Freier Anlauf hinter der Startplattform, damit man nicht gegen eine Wand losläuft */
const ANLAUF = 6;

/**
 * Eine ebene, freie Fläche ins Raster setzen.
 *
 * Funktioniert für beide Grundstoffe: Bei 'fels' wird der Kopfraum herausgeschnitten, bei 'luft'
 * wird der Boden hineingesetzt — beides passiert hier ohnehin gemeinsam.
 *
 * @param {string[][]} grid
 * @param {{x: number, y: number, breite: number, kopfraum?: number}} wunsch  y = Zeile, auf der man STEHT
 * @returns {{x: number, y: number, breite: number}} die tatsächlich gesetzte Fläche
 */
export function ebneFlaeche(grid, wunsch) {
  const breite = Math.max(3, wunsch.breite);
  const kopfraum = wunsch.kopfraum ?? KOPFRAUM;
  const x0 = Math.max(0, Math.min(grid[0].length - breite, Math.round(wunsch.x)));
  // Zwei Zeilen Boden und der Kopfraum müssen ins Raster passen
  const y = Math.max(kopfraum, Math.min(grid.length - DICKE - 1, Math.round(wunsch.y)));

  for (let i = 0; i < breite; i++) {
    for (let d = 1; d <= DICKE; d++) set(grid, x0 + i, y + d, ROCK);
    for (let h = 0; h < kopfraum; h++) set(grid, x0 + i, y - h, AIR);
  }
  return { x: x0, y, breite };
}

/**
 * Startplattform: eben, breit, frei — und mit freiem Anlauf in Laufrichtung, damit die ersten
 * Schritte nicht sofort gegen eine Wand gehen.
 *
 * @param {string[][]} grid
 * @param {{x, y}} wunsch        vom Welttyp vorgeschlagener Startpunkt
 * @param {{richtung?: 1|-1, grenze?: number}} [opts]
 *   grenze  x-Wert, hinter dem NICHTS mehr angefasst werden darf (Ende der Startzone)
 * @returns {{x: number, y: number}} der Punkt, auf den das 'S' gehört
 */
export function setzeStartplattform(grid, wunsch, opts = {}) {
  const richtung = opts.richtung === -1 ? -1 : 1;
  const grenze = Number.isFinite(opts.grenze) ? opts.grenze : (richtung === 1 ? grid[0].length : -1);
  const flaeche = ebneFlaeche(grid, { x: wunsch.x - (richtung === 1 ? 2 : START_BREITE - 3), y: wunsch.y, breite: START_BREITE });

  // Anlauf: die nächsten Kacheln in Laufrichtung auf Stehhöhe frei räumen. Ohne das endet die
  // schöne ebene Plattform direkt an einer Felswand, und der freie Blick war umsonst.
  //
  // ABER nur bis `grenze` — also bis zum Ende der Startzone. Die erste Fassung räumte stur sechs
  // Spalten weiter und schnitt damit in den Schacht der Nachbarzone hinein: Dort verschwanden die
  // Vorsprünge, der Aufstieg riss ab, und die Reparatur flickte zehn Runden lang an den Folgen
  // herum, statt an der Ursache. Wer Platz schafft, muss wissen, wo fremdes Gebiet anfängt.
  for (let i = 0; i < ANLAUF; i++) {
    const sx = richtung === 1 ? flaeche.x + flaeche.breite + i : flaeche.x - 1 - i;
    if (richtung === 1 ? sx >= grenze : sx <= grenze) break;
    for (let h = 0; h < KOPFRAUM - 2; h++) set(grid, sx, flaeche.y - h, AIR);
  }

  const start = { x: richtung === 1 ? flaeche.x + 2 : flaeche.x + flaeche.breite - 3, y: flaeche.y };
  return start;
}

/**
 * Zielplattform: etwas breiter als nötig und mit freiem Himmel — sie soll sich vom Gelände abheben.
 * @returns {{x, y, breite}}
 */
export function setzeZielplattform(grid, wunsch) {
  return ebneFlaeche(grid, { x: wunsch.x - Math.floor(ZIEL_BREITE / 2), y: wunsch.y, breite: ZIEL_BREITE, kopfraum: KOPFRAUM + 2 });
}

/**
 * Prüft, was die feste Regel verlangt: Steht der Start eben, frei und ohne Gefahr in Reichweite?
 *
 * Wird sowohl im Test als auch beim Erzeugen benutzt — eine Regel, die nur im Test gilt, ist keine.
 *
 * @param {string[]} rows            fertige Zeilen
 * @param {object[]} entities        Elemente des Levels
 * @param {{x, y}} start
 * @returns {string[]} leere Liste = in Ordnung
 */
export function pruefeStart(rows, entities, start) {
  const fehler = [];
  if (!start) return ['kein Startpunkt'];
  const feld = (x, y) => (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length ? '#' : rows[y][x]);

  // 1. eben: links und rechts vom Start liegt der Boden auf derselben Zeile
  let eben = 0;
  for (let dx = -4; dx <= 4; dx++) {
    if (feld(start.x + dx, start.y + 1) === '#' && feld(start.x + dx, start.y) !== '#') eben++;
  }
  if (eben < 7) fehler.push(`Startplattform ist nicht eben genug (${eben} von 9 Kacheln)`);

  // 2. frei: Kopfraum für einen Doppelsprung
  for (let h = 1; h <= 8; h++) {
    if (feld(start.x, start.y - h) === '#') { fehler.push(`Kopfraum über dem Start endet nach ${h - 1} Zeilen`); break; }
  }

  // 3. ungefährlich: keine Gefahr in Reichweite. Tödliche Kacheln gibt es im Raster nicht, also
  //    zählen die Elemente — und zwar alle, die töten können.
  const toedlich = new Set(['spike', 'saw', 'laser']);
  for (const e of entities || []) {
    if (!toedlich.has(e.type)) continue;
    const d = Math.max(Math.abs(e.tx - start.x), Math.abs(e.ty - start.y));
    if (d < GEFAHRENFREI) fehler.push(`${e.type} steht ${d} Kacheln vom Start entfernt (mindestens ${GEFAHRENFREI})`);
  }
  return fehler;
}

/** Hilfsblick fürs Testen: Liegt an dieser Stelle fester Boden? */
export const istBoden = (grid, x, y) => at(grid, x, y + 1) === ROCK && at(grid, x, y) !== ROCK;

/**
 * Nächste Standfläche in einer Spalte, ab `vonY` ABWÄRTS gesucht (Welttypen mit unebenem Boden —
 * Höhlen' Profil ist nur eine grobe Interpolation zwischen Zonen-Ecken, keine exakte Kachelangabe,
 * siehe layout.js `profile` — dürfen ein Element nicht blind auf die Profil-Zeile setzen: Dort kann
 * je nach Wellung/Lücke ebenso gut Fels oder offene Luft sein).
 * @returns {number} Zeile mit Luft-über-Fels, oder -1 wenn im gesuchten Bereich keine liegt
 */
export function naechsteStandflaeche(grid, x, vonY, bisY = grid.length - 2) {
  const dir = bisY >= vonY ? 1 : -1;
  for (let y = Math.max(0, vonY); dir > 0 ? y <= bisY : y >= bisY; y += dir) {
    if (istBoden(grid, x, y)) return y;
  }
  return -1;
}
