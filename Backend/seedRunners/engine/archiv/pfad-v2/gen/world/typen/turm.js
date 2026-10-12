// Welttyp „Turm" — senkrecht nach oben, durch die MITTE einer Halle mit Eiswänden.
//
// Die erste Fassung war ein Schacht mit Sprossen an den Wänden: Jeder Turm sah aus wie der andere, der Aufstieg war
// ein Zickzack ohne Elemente — und (siehe PLANUNG_WELTTYPEN.md, „Der Turm war nie durchspielbar") nicht einmal
// spielbar. Jetzt ist der Turm eine Kette von STOCKWERKEN (gen/world/motive/stockwerke.js): Jedes ist ein Raum mit
// eigener Idee — Bröckelleiter, Laserkamin, Sägenpendel, Federfeld, Aufzug … — begrenzt von einer Decke mit Luke,
// die zugleich der Boden des nächsten ist. Ein Sturz kostet so höchstens ein Stockwerk.
//
// Die Wände sind Eis: Man kann sie nicht hinaufklettern (an Eis gibt es keinen Wandsprung), also führt die Route
// durch die Halle und nicht außen herum.
//
// Was jeden Turm einzigartig macht: Anzahl und Reihenfolge der Stockwerke, ein Thema (zwei bevorzugte Stockwerksarten),
// die Hallenbreite und — innerhalb jedes Stockwerks — die Lage der Plattformen und Elemente aus dem Seed.
//
// Die Lösbarkeit kommt hier NICHT aus dem Bewegungsgraph (er kennt Aufzüge, Bröckelblöcke und Federn nicht), sondern
// aus der Fähigkeit „stockwerk": Jedes Stockwerk gilt dem Graph als Brücke von der Luke unten zur Luke oben — und ist
// dafür einzeln mit dem echten Solver zu belegen (siehe PLANUNG_WELTTYPEN.md).

import { createRng } from '../../../sim/rng.js';
import { set, ROCK } from '../../v2/terrain.js';
import { LIMITS } from '../../../level/limits.js';
import { START_BREITE, ZIEL_BREITE, KOPFRAUM } from '../gemeinsam/plattform.js';
import { wendeWandleElement, wendeGewichteMotive } from '../ideen/vertrag.js';
import { STOCKWERKE, neuerRaum, stempleStockwerk, LUKE_BREITE, DECKE } from '../motive/stockwerke.js';

/** Spalten Eiswand auf jeder Seite der Halle */
const WAND = 2;
/** Wie viele Stockwerke eine Länge höchstens bekommt (das Höhenlimit bremst zusätzlich) */
const ANZAHL = Object.freeze({ short: 3, medium: 5, long: 6 });
/** Zeilen Fels unter dem Turm und freier Himmel über der Zielplatte (Kopfraum der Zielplattform + Luft) */
const RAND_UNTEN = 4;
const RAND_OBEN = KOPFRAUM + 4;
const HALLEN_BREITEN = Object.freeze([20, 22, 24]);

const kategorie = (art) => (art === 'spike' || art === 'saw' || art === 'laser' ? art : 'sonst');

/** Ein Ersatz-Template für die Kernidee-Frage „ist diese Gefahrenart hier erlaubt?" (siehe ideen/vertrag.js gefahrenImBaustein) */
const alsTemplate = (arten) => ({ rows: [], markers: Object.fromEntries(arten.map((a, i) => [String.fromCharCode(97 + i), { type: a }])) });

/**
 * Stockwerke wählen: das erste ist immer die einfache Treppe (sichere Erstbegegnung), danach zwei „Thema"-Arten mit
 * mehr Gewicht, nie dieselbe Art zweimal hintereinander, und nur Arten, die zur Schwierigkeit und zur Kernidee passen.
 * `motivGewichte(ids, gewichte, k)` ist der Kernidee-Haken `gewichteMotive` (k = Stockwerk); was die Idee bevorzugt, darf
 * auch direkt wiederkommen — sonst könnte eine Idee wie „Bröckelkette" höchstens jedes zweite Stockwerk prägen.
 */
function waehleStockwerke(rng, n, d, erlaubtGefahren, motivGewichte = null) {
  const zulaessig = STOCKWERKE.filter((s) => s.ab <= d && erlaubtGefahren(s.gefahren(d)) && s.id !== 'stufen');
  const thema = new Set();
  const pool = zulaessig.slice();
  for (let i = 0; i < 2 && pool.length; i++) thema.add(pool.splice(rng.intRange(0, pool.length - 1), 1)[0].id);

  const liste = [STOCKWERKE.find((s) => s.id === 'stufen')];
  for (let k = 1; k < n; k++) {
    const vor = liste[k - 1].id;
    // Das oberste Stockwerk muss seine Luke an den Rand legen können (Platz für die Zielplattform)
    const bevorzugt = (id) => !!motivGewichte && motivGewichte([id], [1], k)[0] > 1;
    let kandidaten = zulaessig.filter((s) => (s.id !== vor || bevorzugt(s.id)) && (k < n - 1 || s.seiteFaehig !== false));
    if (!kandidaten.length) kandidaten = [STOCKWERKE.find((s) => s.id === 'stufen')];
    let gewichte = kandidaten.map((s) => s.gewicht * (thema.has(s.id) ? 2.5 : 1));
    if (motivGewichte) {
      const neu = motivGewichte(kandidaten.map((s) => s.id), gewichte, k);
      if (neu.some((g) => g > 0)) {
        kandidaten = kandidaten.filter((_, i) => neu[i] > 0);
        gewichte = neu.filter((g) => g > 0);
      }
    }
    liste.push(rng.weighted(kandidaten, gewichte));
  }
  return { liste, thema: [...thema] };
}

export default {
  id: 'turm',
  label: 'Turm',
  beschreibung: 'Senkrecht nach oben durch die Mitte einer Eishalle: Stockwerk um Stockwerk mit Bröckelblöcken, Lasern, Sägen, Federn und Aufzügen.',

  kamera: 'aufwaerts',
  achse: 'y',
  grundstoff: 'luft',
  faehigkeiten: ['boden', 'stockwerk'],

  palette: {
    haupt: ['saw', 'laser'],
    neben: ['crumble', 'mover', 'spring', 'spike'],
    verboten: ['portal', 'gravityZone'],
  },

  biome: ['ice', 'cave', 'factory'],
  gewicht: 1,

  /**
   * @param {{params, limits, neuesRaster, idee, ideeZustand, tier}} ctx
   * @returns {{grid, zonen, marken, notizen, entities, stockwerke}}
   */
  baue(ctx) {
    const { params, limits, idee, ideeZustand, tier } = ctx;
    const rng = createRng(params.seed, 'welttyp:turm');
    const d = params.difficulty;
    const W = rng.pick(HALLEN_BREITEN);

    // Kernidee: darf Gefahrenarten ausschließen (einElement) und Gefahr-Elemente verändern (saegenTakt, laserAmpeln)
    const kontextFuer = (fortschritt) => ({ fortschritt, tier, welttyp: 'turm', zustand: ideeZustand, kategorie });
    const artErlaubt = (art, kontext) => !idee || typeof idee.erlaubtBaustein !== 'function' || idee.erlaubtBaustein(alsTemplate([art]), kontext);
    const alleErlaubt = (arten) => arten.every((a) => artErlaubt(a, kontextFuer(0.5)));

    // Anzahl so wählen, dass das Höhenlimit hält
    const nStock = ANZAHL[params.length] || ANZAHL.medium;
    const motivGewichte = idee && typeof idee.gewichteMotive === 'function'
      ? (ids, gewichte, k) => wendeGewichteMotive(idee, ids, gewichte, kontextFuer(nStock > 1 ? k / (nStock - 1) : 0))
      : null;
    const auswahl = waehleStockwerke(rng.fork('wahl'), nStock, d, alleErlaubt, motivGewichte);
    // Höhen würfeln; reicht das Höhenlimit nicht, wird das jeweils höchste Stockwerk niedriger (nie ein Stockwerk gestrichen:
    // das oberste braucht eine Luke am Rand, und ein anderes würde nach oben rutschen). Mit den Mindesthöhen passen alle Längen.
    const raeume = auswahl.liste.map((motiv) => ({ motiv, H: rng.intRange(motiv.hoehe[0], motiv.hoehe[1]) }));
    const summe = () => RAND_OBEN + DECKE + RAND_UNTEN + raeume.reduce((a, r) => a + r.H + DECKE, 0);
    while (summe() > LIMITS.maxHeight) {
      const r = raeume.reduce((best, x) => (x.H - x.motiv.hoehe[0] > best.H - best.motiv.hoehe[0] ? x : best));
      if (r.H <= r.motiv.hoehe[0]) break;
      r.H--;
    }

    // ── Stockwerke bauen (lokal), von unten nach oben ──────────────────────────
    const gebaut = [];
    let einX = 6;                                     // Raum 0: über der Startplattform (links), erste Plattform rechts davon
    raeume.forEach((rm, k) => {
      const letzte = k === raeume.length - 1;
      const kontext = kontextFuer(raeume.length > 1 ? k / (raeume.length - 1) : 0);
      const r = neuerRaum(W, rm.H);
      const c = {
        r, rng: rng.fork(`stockwerk${k}`), limits, d, einX,
        seite: letzte ? (rng.fork('ziel').range(0, 1) < 0.5 ? 'links' : 'rechts') : 'frei',
        erste: k === 0,
        wandle: (spec) => wendeWandleElement(idee, spec, kontext),
        erlaubt: (art) => (art === 'spike' || art === 'saw' || art === 'laser' ? artErlaubt(art, kontext) : true),
      };
      rm.motiv.baue(c);
      gebaut.push({ ...rm, r, einX, seite: c.seite });
      einX = r.luke;
    });

    // ── Zusammensetzen: Raster, Wände, Platten ────────────────────────────────
    const Wg = W + 2 * WAND;
    const gesamt = RAND_OBEN + gebaut.reduce((a, g) => a + g.H + DECKE, 0) + DECKE + RAND_UNTEN;
    const grid = ctx.neuesRaster(Wg, gesamt);
    const yBasis = gesamt - RAND_UNTEN - DECKE;                    // oberste Felszeile der Bodenplatte
    for (let y = yBasis; y < gesamt; y++) for (let x = 0; x < Wg; x++) set(grid, x, y, ROCK);
    for (let y = 0; y < yBasis; y++) for (const x of [0, 1, W + 2, W + 3]) set(grid, x, y, 'I');

    const entities = [];
    const stockwerke = [];
    const zonen = [{ id: 'basis', kind: 'basis', x0: 0, w: WAND + 1 + START_BREITE, entryRow: yBasis - 1, exitRow: yBasis - 1 }];
    let yUnten = yBasis;                                           // Felszeile der Platte unter dem aktuellen Stockwerk
    let einLuke = null;                                            // Luke der Platte unter dem Stockwerk (Halle-Spalte)
    let letzteDecke = yBasis;

    gebaut.forEach((g, k) => {
      const { r, H } = g;
      const yTop = yUnten - H - DECKE;                             // Zeile 0 des Stockwerks = Oberseite der Decke
      stempleStockwerk(grid, entities, r, yTop, WAND, set);

      const boden = yUnten - 1;                                    // Stehzeile auf der Platte darunter
      const decke = yTop - 1;                                      // Stehzeile auf der Decke dieses Stockwerks
      const randZellen = (luke, y) => [{ x: WAND + luke - 1, y }, { x: WAND + luke + LUKE_BREITE, y }];
      stockwerke.push({
        id: `s${k}`, art: g.motiv.id, von: k === 0 ? [{ x: WAND + START_BREITE, y: boden }] : randZellen(einLuke, boden),
        nach: randZellen(r.luke, decke), kosten: H,
      });

      // Prüfpunkt: direkt neben der Luke, durch die man gerade gekommen ist — dort steht man sowieso
      // schon (man klettert unmittelbar danach von genau dieser Stelle aus weiter). Eine frühere Fassung
      // setzte ihn stattdessen in die GEGENÜBERLIEGENDE Ecke der Halle ("weit weg von der Luke" — gedacht
      // als "nicht mitten in die Einstiegsöffnung"), was aber hieß: einen Umweg quer durch die Halle
      // laufen, bevor man überhaupt mit dem Klettern anfangen konnte — abseits der eigentlichen Route.
      const linksPlatz = einLuke !== null && einLuke - 2 >= 1;
      const cpHalle = einLuke === null ? Math.max(1, START_BREITE - 2)
        : linksPlatz ? einLuke - 2 : Math.min(W - 2, einLuke + LUKE_BREITE + 1);
      zonen.push({
        id: `s${k}`, kind: 'stockwerk', name: g.motiv.id, x0: 0, w: Wg, entryRow: boden, exitRow: decke,
        cpX: WAND + cpHalle, cpY: boden, pruefpunkt: k % 2 === 1,
      });

      einLuke = r.luke;
      yUnten = yTop;
      letzteDecke = yTop;
    });

    // Start links auf der Bodenplatte; Ziel auf der obersten Decke, auf der Seite, die von der Luke abgewandt ist
    // 'links' heißt: Luke im linken Teil, also liegt die Zielplattform rechts von ihr (und umgekehrt)
    const zielLinks = gebaut[gebaut.length - 1].seite === 'rechts';
    const zielX = WAND + (zielLinks ? Math.floor(ZIEL_BREITE / 2) : W - 1 - Math.floor(ZIEL_BREITE / 2));

    return {
      grid,
      zonen,
      marken: {
        start: { x: WAND + 3, y: yBasis - 1 },
        ziel: { x: zielX, y: letzteDecke - 1 },
      },
      entities,
      anchors: [],
      stockwerke,
      notizen: { thema: auswahl.thema, stockwerke: gebaut.map((g) => g.motiv.id), hallenbreite: W },
    };
  },
};
