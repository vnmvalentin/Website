// Welttyp „Hindernis-Parcours" — eine Bahn im offenen Himmel: ebener Boden mit Gefahren, dazwischen
// eingesetzte Bausteine (handgebaute Chunks mit eigenem Gelände).
//
// Bis zum ersten Spieltest war das ein perfekt flacher Tunnel mit Gefahren auf einer Linie — jedes
// Level sah bis auf die Reihenfolge der Spikes gleich aus. Jetzt wechseln sich zwei Dinge ab:
//   · Streusegmente: ein Spike, ein Sägenpaar, ein Laser, eine Grube, ein Sprungpad … auf ebenem Boden,
//     gefolgt von einem ruhigen Puffer (Timing, Rhythmus)
//   · Bausteine: Chunks aus gen/chunks/ — Treppen, Gruben mit Bröckelbrücke, Sägen über Eis, Ringe mit
//     Lasern … Sie bringen Gelände und eine erprobte Kombination vorhandener Elemente mit, und ihre
//     Lösbarkeit steht vor dem Bau fest (Solver: 396/396). Auswahl und Schwierigkeitskurve:
//     gemeinsam/bausteine.js.
//
// Der Boden ist eine dünne Felsplatte über LUFT (Grundstoff 'luft'), kein Block mit Tunnel darin:
// Gruben sind dadurch echte Abgründe, und ein Sturz endet nach wenigen Kacheln am Rasterrand statt
// erst weit unten (siehe generate.js, Sturz-Tiefe).

import { createRng } from '../../../sim/rng.js';
import { set, ROCK, AIR } from '../../v2/terrain.js';
import { wendeGewichtePalette, wendeWandleElement, wendeGewichteMotive } from '../ideen/vertrag.js';
import { naechsterRaum, RAUM_BY_ID } from '../motive/hoehlenraeume.js';
import { IDEEN_RAEUME } from '../motive/ideenraeume.js';
import {
  neuerBausteinLauf, naechsterBaustein, bodenZeile, stempeln,
  PLATZ_OBEN, PLATZ_UNTEN, UNTERKANTE, MAX_ABWEICHUNG,
} from '../gemeinsam/bausteine.js';

// Ordnet ein Welttyp-internes Label ("saege", "spikePaar", …) der welttyp-UNABHÄNGIGEN Kategorie zu,
// über die eine Kernidee spricht (siehe ideen/vertrag.js) — nur so bleibt z. B. "Sägen im Takt"
// wiederverwendbar, ohne die genauen Label-Namen jedes einzelnen Welttyps zu kennen.
const KATEGORIE = Object.freeze({
  spike: 'spike', spikePaar: 'spike', retraktSpike: 'spike',
  saege: 'saw', saegePaar: 'saw',
  laser: 'laser',
  luecke: 'struktur', feder: 'struktur',
});
const kategorie = (art) => KATEGORIE[art] || 'sonst';

/** Ersatz-Template für „ist diese Gefahrenart erlaubt?" (wie bei Turm/Höhlen) */
const alsTemplate = (arten) => ({ rows: [], markers: Object.fromEntries(arten.map((a, i) => [String.fromCharCode(97 + i), { type: a }])) });

/** Wie viele Bausteine eine Länge bekommt (ein Baustein ist 22–56 Kacheln breit) */
const BAUSTEIN_ANZAHL = Object.freeze({ short: 4, medium: 8, long: 12 });
/** Streusegmente zwischen zwei Bausteinen: von … bis (inklusive) */
const ZWISCHEN = Object.freeze([1, 3]);
/** Ruhepuffer zwischen zwei Segmenten und vor jeder Streugruppe (Kacheln, frei von jeder Gefahr) */
const PUFFER = 3;
/** Dicke der Felsplatte unter dem Boden (Zeilen) — darunter ist Luft */
const DICKE = 6;
/** So breit kann ein Streusegment samt Puffer höchstens werden (saegePaar 8 + Puffer 3) */
const SEGMENT_MAX = 14;
// Gefahrenfreier Vorlauf ab dem Start: Die feste Regel (gemeinsam/plattform.js GEFAHRENFREI = 12)
// verlangt mindestens 12 Kacheln bis zur ersten Gefahr. Die erste Fassung begann das erste Segment
// direkt hinter der Startplattform — hier zeigte SICH DIE REGEL ALS WIRKSAM: Alle 270 Proben fielen
// bei der Startprüfung durch, nicht heimlich, sondern laut und sofort.
const SICHERER_VORLAUF = 20;
const NACHLAUF = 24;
/**
 * Wie oft ein Baustein-Platz stattdessen einen Ideen-Raum bekommt (motive/ideenraeume.js) — nur wenn die
 * Kernidee Motive bevorzugt (`gewichteMotive`). Ohne solche Idee wird nicht einmal gewürfelt: Parcours-Level
 * ohne Idee bleiben Zug um Zug dieselben.
 */
const IDEENRAUM_CHANCE = Object.freeze({ normal: 0.6, stark: 0.8 });
/** Motive, die eine Kernidee hier bevorzugen kann: die Ideen-Räume plus Bröckelschlucht („Bröckelkette") und Steinschlaggang („Die Decke lebt") aus den Höhlen */
const PARCOURS_MOTIVE = [...IDEEN_RAEUME, RAUM_BY_ID.broeckelschlucht, RAUM_BY_ID.steinschlaggang];

// Grundlinie und Rasterhöhe: Ein Baustein braucht bis zu PLATZ_OBEN Zeilen über seinem Boden, der
// Boden darf um MAX_ABWEICHUNG nach oben/unten wandern, darunter braucht es PLATZ_UNTEN + UNTERKANTE.
const BASIS_ZEILE = MAX_ABWEICHUNG + PLATZ_OBEN + 2;
const RASTER_HOEHE = BASIS_ZEILE + MAX_ABWEICHUNG + PLATZ_UNTEN + UNTERKANTE + 4;

/** Felsplatte von Spalte x0 (inklusive) bis x1 (exklusive) mit Oberkante in Zeile `row` */
function platte(grid, x0, x1, row) {
  for (let x = x0; x < Math.min(x1, grid[0].length); x++) for (let d = 0; d < DICKE; d++) set(grid, x, row + d, ROCK);
}

/**
 * Ein Streusegment aus der Palette ziehen und bauen. `x` ist die erste freie Spalte, `row` die
 * Boden-Oberkante (Fels; Standhöhe ist `row - 1`). Gibt zurück, wie breit das Segment war
 * (inklusive Puffer danach). Die Felsplatte darunter setzt der Aufrufer VORHER — Gruben brechen sie auf.
 *
 * @param {object|null} idee     aktive Kernidee (ideen/registry.js) oder null
 * @param {object|null} ideeZustand  von `idee.vorbereiten()`, falls die Idee einen Hook dafür hat
 * @param {{fortschritt: number, tier: string}} ideeKontext
 */
function baueSegment(grid, rng, x, row, limits, entities, idee, ideeZustand, ideeKontext) {
  const basis = { liste: ['spike', 'spikePaar', 'saege', 'saegePaar', 'laser', 'luecke', 'feder', 'retraktSpike'], gewichte: [3, 2, 2, 1, 2, 2, 1, 2] };
  const kontext = { ...ideeKontext, zustand: ideeZustand, kategorie };
  const { liste, gewichte } = wendeGewichtePalette(idee, basis.liste, basis.gewichte, kontext);
  const art = rng.weighted(liste, gewichte);
  const wandeln = (spec) => wendeWandleElement(idee, spec, kontext);

  // Spike/Feder erwarten die STANDFLÄCHE (die Luftkachel ÜBER dem Boden) als tx/ty — genau wie im
  // ASCII-Format (glyphs.js: "Elemente stehen auf einer Kachel, das Raster darunter bleibt Luft")
  // und wie sim/__tests__/elements.test.js sie mit `STAND` (der Standzeile) platziert. `row` ist
  // aber die FELS-Zeile selbst. Auf `row` statt `row - 1` gesetzt, landet die Trefferfläche eine
  // Kachel zu tief — mitten im Fels ("ganz viele Sachen im Boden", gemeldet nach dem ersten echten
  // Spieltest). Laser ist NICHT betroffen: `ELEMENT_TILE.laser = SOLID` (glyphs.js) verlangt
  // ausdrücklich eine Fels-Kachel, in die der Emitter eingebettet ist — dafür ist `row` richtig.
  if (art === 'spike') {
    entities.push(wandeln({ type: 'spike', tx: x + 1, ty: row - 1 }));
    return 3;
  }
  if (art === 'spikePaar') {
    entities.push(wandeln({ type: 'spike', tx: x + 1, ty: row - 1 }));
    entities.push(wandeln({ type: 'spike', tx: x + 3, ty: row - 1 }));
    return 5;
  }
  if (art === 'retraktSpike') {
    // Einfahrender Spike: die Gefahr ist nur zeitweise aktiv — Grund genug, ihm mehr Raum davor
    // und danach zu geben, damit man den Takt erst lesen kann.
    entities.push(wandeln({ type: 'spike', tx: x + 1, ty: row - 1, period: rng.range(1.6, 2.6), warn: 0.5 }));
    return 5;
  }
  if (art === 'saege') {
    entities.push(wandeln({ type: 'saw', tx: x + 1, ty: row - 1 }));
    return 4;
  }
  if (art === 'saegePaar') {
    // Zwei Sägen auf derselben Bahn, siehe sim/elements/saw.js `count` — dieselbe Mechanik, die
    // der Nutzer ausdrücklich wollte ("mehrere Sägen pro Linie").
    entities.push(wandeln({ type: 'saw', tx: x + 1, ty: row - 1, path: [[0, 0], [5, 0]], count: 2, speed: 40 }));
    return 8;
  }
  if (art === 'laser') {
    // Senkrecht aus dem Boden, mit Vorwarnung — Zeitfenster großzügig, damit ein Fehlschlag nicht
    // an einer zu kurzen Reaktionszeit hängt.
    entities.push(wandeln({ type: 'laser', tx: x, ty: row, dir: 'up', period: rng.range(1.8, 2.6), on: 0.7, warn: 0.5, reach: 9 }));
    return 4;
  }
  if (art === 'feder') {
    entities.push(wandeln({ type: 'spring', tx: x + 1, ty: row - 1 }));
    return 6;
  }
  // 'luecke': eine Grube im Boden — die Platte wird durchgehend aufgebrochen, darunter ist Luft: ein
  // echter Abgrund. (Die erste Fassung löschte nur die oberste Zeile; der Rest des Blocks blieb
  // Fels, aus der "Grube" wurde eine harmlose Kerbe.) Bleibt innerhalb maxGap, bleibt also mit
  // 'boden' allein lösbar.
  const breite = Math.max(2, Math.min(limits.maxGap - 1, rng.intRange(2, Math.max(2, limits.maxGap - 1))));
  for (let i = 0; i < breite; i++) for (let d = 0; d < DICKE; d++) set(grid, x + i, row + d, AIR);
  return breite + 2;
}

export default {
  id: 'parcours',
  label: 'Hindernis-Parcours',
  beschreibung: 'Eine Bahn im offenen Himmel: Sägen, Spikes und Laser auf ebenem Boden, dazwischen handgebaute Bausteine mit eigenem Gelände.',

  kamera: 'horizontal',
  achse: 'x',
  grundstoff: 'luft',
  // 'baustein': Ein eingesetzter Chunk ist für den Graph eine Brücke von Ein- zu Ausgang.
  faehigkeiten: ['boden', 'baustein'],

  palette: {
    haupt: ['spike', 'saw'],
    neben: ['laser', 'spring'],
    verboten: [],
  },

  biome: ['factory', 'ice'],
  gewicht: 1,

  /**
   * @param {{params, limits, neuesRaster, biomeId, idee, ideeZustand, tier}} ctx
   * @returns {{grid, zonen, marken, notizen, entities, bausteine}}
   */
  baue(ctx) {
    const { params, limits, reach, biomeId, idee, ideeZustand, tier } = ctx;
    const rng = createRng(params.seed, 'welttyp:parcours');
    const anzahl = BAUSTEIN_ANZAHL[params.length] || BAUSTEIN_ANZAHL.medium;

    // Breite nach oben schätzen (Baustein ≤ 56 + bis zu 3 Streusegmente à ≤ 14), am Ende zuschneiden.
    const maxBreite = SICHERER_VORLAUF + anzahl * (56 + ZWISCHEN[1] * SEGMENT_MAX + PUFFER) + NACHLAUF + 2 * SEGMENT_MAX;
    const grid = ctx.neuesRaster(maxBreite, RASTER_HOEHE);
    const lauf = neuerBausteinLauf(params, biomeId, { basisZeile: BASIS_ZEILE, rasterHoehe: RASTER_HOEHE });

    // Kernideen dürfen Bausteine ausschließen, deren Inhalt zu ihrem Versprechen im Widerspruch
    // stünde (z. B. Sägen mit eigenem Takt in einem Level, in dem "alle Sägen im selben Takt" laufen).
    // Die Elemente eines Bausteins selbst werden NIE verändert — sie sind in dieser Form bewiesen.
    // Die Schwierigkeitsstufe des Levels deckelt die Bausteine: Stufe 1 bekommt nur leichte, erst ab
    // Stufe 4 kommen die schwersten (Schwierigkeit 5) vor. Ohne diese Grenze folgte die Auswahl
    // allein der Kurve durchs Level, und ein Level der Stufe 1 endete trotzdem mit einem Kombi-Chunk.
    const deckel = params.difficulty + 1;
    const filter = (tpl) => tpl.difficulty <= deckel
      && (!idee || typeof idee.erlaubtBaustein !== 'function' || idee.erlaubtBaustein(tpl, { tier, welttyp: 'parcours', zustand: ideeZustand }));

    const entities = [];
    const zonen = [];
    const bausteine = [];
    // Ideen-Räume: eigener Teilstrom, damit Streusegmente und Bausteine desselben Seeds unverändert bleiben
    const motivRng = createRng(params.seed, 'welttyp:parcours:motive');
    const mitMotiven = !!idee && typeof idee.gewichteMotive === 'function';
    let letzterRaumId = null;
    const ideenRaum = (fortschritt) => {
      if (!mitMotiven) return null;
      if (motivRng.range(0, 1) >= (IDEENRAUM_CHANCE[tier] ?? IDEENRAUM_CHANCE.normal)) { letzterRaumId = null; return null; }
      const kontext = { fortschritt, tier, welttyp: 'parcours', zustand: ideeZustand, kategorie };
      const raum = naechsterRaum({
        rng: motivRng, limits, reach, d: params.difficulty, fortschritt, tier,
        wandle: (spec) => wendeWandleElement(idee, spec, kontext),
        erlaubt: (art) => typeof idee.erlaubtBaustein !== 'function' || idee.erlaubtBaustein(alsTemplate([art]), kontext),
        // Grundgewicht 0: In Parcours kommt nur, was die Idee ausdrücklich will
        gewichte: (ids, gewichte) => wendeGewichteMotive(idee, ids, gewichte.map(() => 0), kontext),
      }, letzterRaumId, PARCOURS_MOTIVE);
      // Passt er zwischen Decke und Rasterboden? (dieselbe Prüfung wie naechsterBaustein)
      const dy = bodenZeile(lauf) - (raum ? raum.entry : 0);
      // Kein Raum → an dieser Stelle kommt ein Chunk: Die Folge „derselbe Raum hintereinander" ist unterbrochen.
      if (!raum || dy < 0 || dy + raum.h + UNTERKANTE > RASTER_HOEHE) { letzterRaumId = null; return null; }
      letzterRaumId = raum.tpl.id;
      return raum;
    };

    let x = SICHERER_VORLAUF;                          // gefahrenfreier Vorlauf ab dem Start
    let row = bodenZeile(lauf);
    const startZeile = row;
    platte(grid, 0, x, row);
    zonen.push({ id: 'p-vorlauf', kind: 'segment', x0: 0, w: x, entryRow: row, exitRow: row });

    for (let k = 0; k < anzahl; k++) {
      // Streugruppe: ein Puffer, dann ein bis drei Segmente
      const gruppeStart = x;
      platte(grid, x, x + PUFFER, row);
      x += PUFFER;
      const n = rng.intRange(ZWISCHEN[0], ZWISCHEN[1]);
      for (let s = 0; s < n; s++) {
        const fortschritt = (k + s / n) / anzahl;
        platte(grid, x, x + SEGMENT_MAX, row);
        const breite = baueSegment(grid, rng, x, row, limits, entities, idee, ideeZustand, { fortschritt, tier, welttyp: 'parcours' });
        x += breite;
        platte(grid, x, x + PUFFER, row);
        x += PUFFER;
      }
      zonen.push({ id: `p${k}`, kind: 'segment', x0: gruppeStart, w: x - gruppeStart, entryRow: row, exitRow: row, cpX: gruppeStart + 1 });

      // Baustein
      const bodenVorher = bodenZeile(lauf);
      const fortschrittB = anzahl > 1 ? k / (anzahl - 1) : 0;
      // Ein Ideen-Raum ist flach (Eingang = Ausgang): Die Grundlinie des Laufs bleibt, wo sie ist.
      const inst = ideenRaum(fortschrittB) || naechsterBaustein(lauf, fortschrittB, filter);
      if (inst) {
        const info = stempeln(grid, inst, x, bodenVorher, bausteine.length, entities);
        bausteine.push(info);
        zonen.push({ id: `b${k}`, kind: 'baustein', name: info.id, x0: x, w: info.w, entryRow: info.entryRow, exitRow: info.exitRow, cpX: x + 1 });
        x += info.w;
        row = bodenZeile(lauf);                        // wie stempeln() sie rechnet: bodenVorher + (exit − entry)
      }
    }

    // Nachlauf: ebener Boden bis zur Zielplattform
    platte(grid, x, x + NACHLAUF, row);
    const breite = x + NACHLAUF;
    zonen.push({ id: 'pZiel', kind: 'segment', x0: x, w: NACHLAUF, entryRow: row, exitRow: row });
    for (const r of grid) r.length = breite;

    return {
      grid,
      zonen,
      // y ist die STANDzeile (die Luftkachel über dem Boden), nicht die Fels-Zeile: ebneFlaeche()
      // (gemeinsam/plattform.js) setzt den Boden UNTER diese Zeile.
      marken: {
        start: { x: 4, y: startZeile - 1 },
        ziel: { x: breite - 10, y: row - 1 },
      },
      entities,
      bausteine,
      anchors: [],
      notizen: {},
    };
  },
};
