// Welttyp „Himmelsreich" — schwebende Inseln, kaum fester Boden, Abgrund überall.
//
// Grundlegend anders als Höhlen: Der Grundstoff ist LUFT, nicht Fels (siehe Vertrag `grundstoff`).
// Es wird nichts gegraben — Inseln werden GESETZT, mit wachsendem Abstand zwischen ihnen, der auf
// drei Arten überbrückt wird:
//   nah     ein gewöhnlicher Sprung (Fähigkeit 'boden', wie überall)
//   mittel  eine Pendelplattform (Fähigkeit 'mover') — sie überbrückt JEDE Weite, weil man auf sie
//           warten darf (die Fairness-Regel aus PLANUNG_WELTTYPEN.md macht daraus eine gewöhnliche
//           Kante im Bewegungsgraph, siehe faehigkeiten/mover.js)
//   weit    ein Greifanker (Fähigkeit 'grapple') an einer Stelle, von der beide Inseln aus in
//           Reichweite liegen
//
// Damit ist dieser Welttyp der erste Beweis, dass die steckbaren Fähigkeiten (reichweite/graph.js)
// wirklich tragen — nicht nur deklariert sind.
//
// ZWEI DURCHGÄNGE, bewusst: Erst stehen ALLE Inselhöhen fest, danach erst werden die Brücken
// entschieden. Ein einziger Durchgang, der die Höhe der nächsten Insel "vorausschauend" berechnet,
// um die Brücke richtig zu bemessen, und sie dann in der nächsten Runde NOCH EINMAL würfelt, zieht
// zwei VERSCHIEDENE Werte aus demselben RNG-Strom (jeder Aufruf verbraucht einen neuen Wert) — die
// Brücke zielt dann auf eine Höhe, die die Insel gar nicht bekommt. Genau das ist der ersten Fassung
// passiert: Inseln lagen an der richtigen Stelle, aber jede Pendelplattform fuhr ins Leere, und die
// Reparatur (die davon nichts weiß) flickte munter weiter, bis sie benachbarte Inseln zerstörte.

import { createRng } from '../../../sim/rng.js';
import { sinTurns } from '../../../sim/trig.js';
import { TILE } from '../../../sim/config.js';
import { set, ROCK } from '../../v2/terrain.js';
import { ROUTE_TOP, ROUTE_BOTTOM, WORLD_H } from '../../v2/layout.js';
import { ANKER_REICHWEITE } from '../faehigkeiten/grapple.js';
import { neuerBausteinLauf, naechsterBaustein, stempeln } from '../gemeinsam/bausteine.js';
import { START_BREITE, ZIEL_BREITE } from '../gemeinsam/plattform.js';

/** Wie viele Inseln eine Länge bekommt */
// Inseln INSGESAMT (Baustein-Inseln zählen mit): Ein Baustein ist 22–56 Kacheln breit, mehrere
// schlichte Inseln müssen dafür weichen, sonst reißt die Level-Breite (Limit 1200) — gemessen: 46
// Inseln mit 9 Bausteinen ergaben bis 1270.
const ISLAND_COUNT = Object.freeze({ short: 14, medium: 24, long: 34 });
/**
 * Wie viele der Inseln zu BAUSTEIN-Inseln werden (gemeinsam/bausteine.js): eine handgebaute Insel-Gruppe
 * mit eigenem Gelände und einer erprobten Element-Kombination statt einer schlichten Platte. Feste Zahl
 * statt Wahrscheinlichkeit, damit die Breite des Levels (Limit 1200) planbar bleibt.
 */
const BAUSTEIN_INSELN = Object.freeze({ short: 3, medium: 5, long: 7 });
/** Wie weit ein Greifanker über der Mitte zwischen zwei Inseln schwebt */
const ANKER_LIFT = 8;

/** Breite einer Pendelplattform in Kacheln */
const MOVER_BREITE = 3;
/** So lange braucht eine Pendelplattform höchstens für ihre Bahn — sonst wartet man zu lange */
const MOVER_FAHRZEIT = 2.6;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Eine feste Insel setzen: `dicke` Zeilen Fels, `breite` Spalten */
function setzeInsel(grid, x0, y, breite, dicke = 2) {
  for (let i = 0; i < breite; i++) for (let d = 0; d < dicke; d++) set(grid, x0 + i, y + d, ROCK);
}

/**
 * Durchgang 1: alle Inseln — Breite und Höhe, noch ohne Brücken.
 *
 * Eine Baustein-Insel hat zwei Höhen: `yL` (Boden am linken Rand) und `yR` (am rechten) — ein Chunk
 * darf Höhe gewinnen oder verlieren. Gewöhnliche Inseln haben `yL === yR === y`. Start- und Zielinsel
 * (erste, letzte) bleiben immer gewöhnlich: Ihre Plattform setzt die gemeinsame Schicht.
 */
function planeInseln(rng, count, anzahlBausteine, lauf, filter) {
  const wellenRng = rng.fork('welle');
  const breitenRng = rng.fork('breite');
  const platzRng = rng.fork('baustein-plaetze');
  // Gleichmäßig über das Level verteilte Plätze mit etwas Streuung; nie erste/letzte Insel
  const plaetze = new Set();
  for (let k = 0; k < anzahlBausteine; k++) {
    const mitte = 1 + ((k + 0.5) * (count - 2)) / anzahlBausteine;
    plaetze.add(clamp(Math.round(mitte + platzRng.range(-0.8, 0.8)), 1, count - 2));
  }

  const inseln = [];
  let x = 16;                                       // Vorlauf für die Startplattform
  let row = Math.round((ROUTE_TOP + ROUTE_BOTTOM) / 2);
  for (let i = 0; i < count; i++) {
    // Erste und letzte Insel tragen die gemeinsame Start- bzw. Zielplattform (gemeinsam/plattform.js). Sie ist
    // START_BREITE / ZIEL_BREITE breit und würde bei einer schmaleren Insel in die Lücke ragen — genau dorthin,
    // wo die erste Pendelplattform startet.
    const breite = i === 0 ? START_BREITE : i === count - 1 ? ZIEL_BREITE : breitenRng.intRange(4, 7);
    const drift = Math.round(6 * sinTurns(wellenRng.range(0, 1) + i * 0.31));
    row = clamp(row + drift, ROUTE_TOP + 2, ROUTE_BOTTOM - 2);
    if (plaetze.has(i)) {
      const inst = naechsterBaustein(lauf, count > 1 ? i / (count - 1) : 0, filter, row);
      const hoeheRechts = inst ? row + (inst.exit - inst.entry) : row;
      // Muss auch am rechten Rand noch im Band liegen, in dem Inseln und Brücken rechnen
      if (inst && hoeheRechts >= ROUTE_TOP + 2 && hoeheRechts <= ROUTE_BOTTOM - 2) {
        inseln.push({ id: `i${i}`, x0: x, w: inst.w, y: row, yL: row, yR: hoeheRechts, baustein: inst });
        x += inst.w;
        row = hoeheRechts;
        continue;
      }
    }
    inseln.push({ id: `i${i}`, x0: x, w: breite, y: row, yL: row, yR: row });
    x += breite;
  }
  return inseln;
}

/**
 * Durchgang 2: zwischen jedem Inselpaar die Lücke setzen und — falls nötig — eine Brücke bauen.
 * Verändert `inseln[k].x0` NICHT rückwirkend; die x-Koordinaten aus Durchgang 1 waren nur Platzhalter
 * für die Reihenfolge, die tatsächliche Lage wird hier zum ersten Mal endgültig vergeben.
 */
function platziereBruecken(rng, inseln, limits) {
  const bruckenRng = rng.fork('bruecken');
  const entities = [];
  const anchors = [];
  let x = inseln[0].x0;

  for (let i = 0; i < inseln.length; i++) {
    inseln[i].x0 = x;
    x += inseln[i].w;
    if (i === inseln.length - 1) break;

    // Die Brücke beginnt am RECHTEN Rand dieser und endet am LINKEN Rand der nächsten Insel — bei einer
    // Baustein-Insel sind das zwei verschiedene Höhen.
    const row = inseln[i].yR;
    const naechsteRow = inseln[i + 1].yL;
    const rise = row - naechsteRow;                  // positiv = die nächste Insel liegt höher

    // Wie viel waagerechten Sprungbudget lässt ein Sprung mit diesem Höhengewinn ÜBERHAUPT zu?
    // Dieselbe Formel wie im Bewegungsgraph (reachability.js) — sonst erlaubt die Erzeugung
    // Sprünge, die die Prüfung hinterher als zu weit verwirft. Bergab (rise ≤ 0) zählt die volle
    // Weite; je näher der Aufstieg an maxUp kommt, desto enger wird das Budget (bei rise == maxUp
    // bleibt kaum noch etwas übrig — genau daran ist die erste Fassung gescheitert: Sie erlaubte
    // "sprung" bis zur vollen Höhendifferenz, ohne das schrumpfende Budget zu beachten).
    // `sprungBudget` ist das dx-Budget aus reachability.js — der Index-Abstand zwischen der letzten
    // Standkachel VOR der Lücke und der ersten DANACH. `gap` (leere Spalten dazwischen) ist ein
    // Tick weniger als das: Zwei Inseln mit 0 leeren Spalten dazwischen stehen an Index-Nachbarn
    // (dx=1), nicht dx=0. Dieselbe Verschiebung kennt v2/terrain.js (`carveIslands`: emptyMax =
    // maxGap - 1) — hier zunächst vergessen, deshalb sprang die erste Fassung bei ausgereiztem
    // Budget (rise nahe maxUp) exakt einen Schritt zu weit.
    const sprungBudget = rise > limits.maxUp
      ? 0
      : rise > 0 ? Math.max(1, Math.round(limits.maxGapUp * (1 - rise / (limits.maxUp + 1)))) : limits.maxGap;
    const sprungMoeglich = sprungBudget - 1 >= 2;

    // Grapple: Der Anker sitzt ÜBER der HÖHER gelegenen der beiden Inseln (nicht auf halber Höhe
    // zwischen beiden!) — mit festem Abstand ANKER_LIFT zu ihrer Oberfläche. Die erste Fassung setzte
    // ihn auf den Mittelwert beider Höhen minus ANKER_LIFT: Bei einem Aufstieg (rise groß) landete der
    // Anker dann ETWA AUF Höhe der Ziel-Insel-Oberfläche (Mittelwert zweier weit auseinanderliegender
    // Werte minus 3 reicht bei rise=6 nicht über die höhere Insel hinaus) — wer hochschwingt, schlägt
    // dann von UNTEN gegen genau die Insel, die er erreichen will, statt über sie hinweg zu schwingen.
    // Gemessen mit dem echten Solver (21 Himmelsreich-Level mit einem Aufstiegs-Anker, rise > 3):
    // 6 von 21 NICHT lösbar — genau die gemeldete Beobachtung ("man stößt mit dem Grapple unten
    // gegen die Plattform"). Mit dem Anker über der höheren Insel: 21 von 21 lösbar (siehe Testdatei).
    //
    // Der Preis: Die tiefere Insel liegt jetzt WEITER vom Anker weg als vorher (voller Höhenunterschied
    // `rise` statt nur die Hälfte) — das schrumpft die geometrisch mögliche Lückenweite. Das ist
    // Absicht: Reichweite darf nie größer aussehen, als der Anker wirklich hergibt (siehe der
    // ursprüngliche Kommentar unten zu "kein künstlicher Mindestwert").
    const hoeherePlattform = Math.min(row, naechsteRow);
    const ankerY = hoeherePlattform - ANKER_LIFT;
    const worstDy = Math.max(row, naechsteRow) - ankerY;

    // WICHTIG: `grappleGapMax` bekommt HIER keinen künstlichen Mindestwert. Die erste Fassung
    // erzwang "mindestens maxGap" — bei hoher Schwierigkeit (großzügiges maxGap, aber eine FESTE
    // Ankerreichweite unabhängig von der Schwierigkeit) verlangte das mehr, als der Anker geometrisch
    // hergab, und erzeugte Lücken, die kein Anker der Welt überbrückt. Erst der Bewegungsgraph hat
    // das aufgedeckt (5 von 270 Welten bei Schwierigkeit 5, ausgerechnet dort, wo maxGap am größten
    // gegenüber der festen Ankerreichweite ist).
    const grappleGapMax = Math.floor(Math.sqrt(Math.max(0, ANKER_REICHWEITE * ANKER_REICHWEITE - worstDy * worstDy)) * 1.7);
    const grappleMoeglich = grappleGapMax >= 3;

    const kandidaten = [];
    const gewichte = [];
    if (sprungMoeglich) { kandidaten.push('sprung'); gewichte.push(0.4); }
    kandidaten.push('mover'); gewichte.push(0.35);                          // Mover schafft jede Weite
    if (grappleMoeglich) { kandidaten.push('grapple'); gewichte.push(0.25); }
    const art = bruckenRng.weighted(kandidaten, gewichte);

    let gap;
    if (art === 'sprung') {
      gap = bruckenRng.intRange(2, Math.max(2, Math.min(sprungBudget - 1, limits.maxGap - 1)));
    } else if (art === 'mover') {
      // Mindestens so breit, dass die Plattform zwischen den Inseln Platz hat und sich noch bewegt
      const minGap = Math.max(limits.maxGap, MOVER_BREITE + 2);
      gap = bruckenRng.intRange(minGap, minGap * 3);
    } else {
      gap = bruckenRng.intRange(Math.min(3, grappleGapMax), grappleGapMax);
    }

    const xEndeA = x - 1;
    const xStartB = xEndeA + gap + 1;

    if (art === 'mover') {
      // Andocken: Die Plattform startet in der ersten Luftspalte hinter Insel A (Oberkante bündig mit ihr) und endet
      // mit ihrer rechten Kante an der linken Kante von Insel B. Die erste Fassung startete IN der letzten Spalte
      // von A und endete IN der ersten von B — die Bahn ging zur Hälfte durch Fels, und wer aufstieg, blieb hängen.
      const dockA = xEndeA + 1;
      const dockB = xStartB - MOVER_BREITE;
      const laenge = Math.sqrt((dockB - dockA) * (dockB - dockA) + rise * rise) * TILE;   // sqrt statt hypot: Determinismus-Regel
      entities.push({
        type: 'mover', tx: dockA, ty: row, path: [[0, 0], [dockB - dockA, -rise]],
        speed: clamp(Math.round(laenge / MOVER_FAHRZEIT / 5) * 5, 45, 80), width: MOVER_BREITE, phase: bruckenRng.range(0, 1),
      });
    } else if (art === 'grapple') {
      const ankerX = Math.round((xEndeA + xStartB) / 2);
      anchors.push({ x: ankerX, y: ankerY });
    }

    x = xStartB;
  }

  return { entities, anchors, width: x };
}

export default {
  id: 'himmelsreich',
  label: 'Himmelsreich',
  beschreibung: 'Schwebende Inseln über dem Abgrund, verbunden durch Pendelplattformen und Greifanker.',

  kamera: 'horizontal',
  achse: 'x',
  grundstoff: 'luft',
  faehigkeiten: ['boden', 'mover', 'grapple', 'baustein'],

  palette: {
    haupt: ['mover'],
    neben: ['crystal', 'wind'],
    // Nur für die schlichten Inseln und Brücken — Bausteine bringen ihre eigene, erprobte Mischung mit.
    verboten: ['crumble', 'fallingBlock', 'portal', 'gravityZone'],
  },

  biome: ['sky', 'ice'],
  gewicht: 1,

  /**
   * @param {{params, limits, neuesRaster}} ctx
   * @returns {{grid, zonen, marken, notizen, entities, anchors}}
   */
  baue(ctx) {
    const { params, limits, biomeId } = ctx;
    const rng = createRng(params.seed, 'welttyp:himmelsreich');
    const count = ISLAND_COUNT[params.length] || ISLAND_COUNT.medium;

    // Die Schwierigkeitsstufe deckelt die Bausteine (Stufe 1 → höchstens Chunk-Schwierigkeit 2 usw.)
    const deckel = params.difficulty + 1;
    const lauf = neuerBausteinLauf(params, biomeId, { basisZeile: Math.round((ROUTE_TOP + ROUTE_BOTTOM) / 2), rasterHoehe: WORLD_H });
    const inseln = planeInseln(rng, count, BAUSTEIN_INSELN[params.length] || BAUSTEIN_INSELN.medium, lauf, (tpl) => tpl.difficulty <= deckel);
    const { entities, anchors, width: rechterRand } = platziereBruecken(rng, inseln, limits);

    // Raster erst JETZT anlegen: Erst nach Durchgang 2 steht die tatsächliche Breite fest.
    const width = rechterRand + 16;                  // Nachlauf für die Zielplattform
    const grid = ctx.neuesRaster(width, WORLD_H);
    const bausteine = [];
    for (const insel of inseln) {
      if (insel.baustein) bausteine.push(stempeln(grid, insel.baustein, insel.x0, insel.yL, bausteine.length, entities));
      else setzeInsel(grid, insel.x0, insel.y, insel.w);
    }
    for (const a of anchors) set(grid, a.x, a.y, 'G');

    const erste = inseln[0];
    const letzte = inseln[inseln.length - 1];

    return {
      grid,
      // Zonen sind hier die INSELN selbst — schmal, aber echt: Checkpoints und die Dead-Zone-Prüfung
      // brauchen nur x0/w/entryRow/exitRow, keine Kletter-Semantik.
      zonen: inseln.map((z) => (z.baustein
        ? { id: z.id, kind: 'baustein', name: z.baustein.tpl.id, x0: z.x0, w: z.w, entryRow: z.yL, exitRow: z.yR, cpX: z.x0 + 1 }
        : { id: z.id, kind: 'insel', x0: z.x0, w: z.w, entryRow: z.y, exitRow: z.y })),
      marken: {
        // Die gemeinsame Schicht erwartet die STEHZEILE (Luft über dem Fels), `y` der Insel ist ihre oberste Felszeile.
        // Mit `y` selbst rutschte die Startinsel eine Zeile nach unten, und der erste Sprung war eine Zeile höher als geplant.
        start: { x: erste.x0 + 2, y: erste.y - 1 },
        ziel: { x: letzte.x0 + Math.floor(ZIEL_BREITE / 2), y: letzte.y - 1 },
      },
      entities,
      anchors,
      bausteine,
      notizen: {},
    };
  },
};
