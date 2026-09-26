// Weltengenerierung v2, Stufe 1: das MAKRO-LAYOUT.
//
// Der alte Generator reiht Rechtecke auf einer Linie auf (BASE_ROW 80 ± 14 von 160 Zeilen) — deshalb
// fühlt sich jedes Level flach an. Hier entsteht stattdessen zuerst die grobe FORM der Welt:
//
//   1. eine Folge von ZONEN (lauf, aufstieg, abstieg, tunnel, kammer, inseln)
//   2. ein HÖHENPROFIL: auf welcher Zeile die Hauptroute in jeder Zone ankommt und sie verlässt
//   3. VERZWEIGUNGEN: einzelne Zonen bekommen einen zweiten Weg (Abkürzung), der später wieder
//      auf die Hauptroute trifft
//
// Erst Stufe 2 (terrain.js) macht daraus Kacheln. Diese Trennung ist Absicht: Die Form lässt sich
// so prüfen, zeichnen und bewerten, lange bevor ein einziger Block gesetzt ist.
//
// Alles hängt nur am Seed (sim/rng.js). Diese Stufe hat ihren eigenen Teilstrom, damit spätere
// Änderungen an Terrain oder Elementen das Layout nicht verschieben.

import { createRng } from '../../sim/rng.js';

/** Zeilen des Levels — die volle erlaubte Höhe (level/limits.js: 160) wird wirklich genutzt. */
export const WORLD_H = 150;
/** Oberste/unterste Zeile, die die Route benutzen darf (Rand bleibt für Fels und Himmel) */
export const ROUTE_TOP = 12;
export const ROUTE_BOTTOM = WORLD_H - 14;

/**
 * Zonentypen. `rise` ist der Höhenunterschied zwischen Ein- und Ausgang in Zeilen (negativ = hinauf,
 * weil Zeile 0 oben ist), `w` die Breite. Beides sind Bereiche, aus denen gewürfelt wird.
 *
 * `climb` markiert Zonen, die den Höhenunterschied selbst leisten (senkrechte Wege); nur sie dürfen
 * große Sprünge im Profil machen. `underground` sagt, ob über der Zone Fels statt Himmel liegt.
 */
export const ZONE_KINDS = Object.freeze({
  lauf:     { w: [26, 40], rise: [-3, 3],    climb: false, underground: false, weight: 1.0 },
  inseln:   { w: [24, 38], rise: [-6, 2],    climb: false, underground: false, weight: 0.7 },
  aufstieg: { w: [14, 22], rise: [-30, -16], climb: true,  underground: false, weight: 0.9 },
  abstieg:  { w: [16, 26], rise: [14, 28],   climb: true,  underground: false, weight: 0.8 },
  tunnel:   { w: [28, 44], rise: [-4, 8],    climb: false, underground: true,  weight: 0.9 },
  kammer:   { w: [22, 32], rise: [-10, 10],  climb: false, underground: true,  weight: 0.6 },
});

export const ZONE_IDS = Object.keys(ZONE_KINDS);

/** Wie viele Zonen eine Länge bekommt (ohne Start- und Zielzone) */
export const ZONE_COUNT = Object.freeze({ short: 5, medium: 11, long: 18 });

// Start- und Zielzone sind immer flach und ruhig: Man soll sehen, wo man steht, bevor es losgeht.
const EDGE_W = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Die HÖHENKURVE des Levels: ein paar Stützhöhen, zwischen denen die Welt steigt und fällt.
 *
 * Sie entsteht ZUERST — vor jeder Zone. Genau das ist der Unterschied zum alten Generator: Dort
 * ergab sich die Höhe nebenbei aus den Chunks, die gerade gezogen wurden, und blieb deshalb in
 * einem schmalen Band. Hier ist sie Vorgabe, und die Zonen haben ihr zu folgen.
 *
 * Aufeinanderfolgende Stützhöhen liegen mindestens `MIN_SWING` auseinander: Sonst entstehen
 * Abschnitte, die nominell "hoch" oder "runter" gehen, sich aber wie eine Ebene anfühlen.
 */
const MIN_SWING = 22;

export function heightCurve(rng, stops) {
  const lo = ROUTE_TOP + 6;
  const hi = ROUTE_BOTTOM - 6;
  const out = [Math.round((lo + hi) / 2)];
  for (let i = 1; i < stops; i++) {
    const prev = out[i - 1];
    // Zur jeweils weiteren Seite ausholen, damit die Welt wirklich Berg und Tal bekommt
    const upRoom = prev - lo;
    const downRoom = hi - prev;
    const goUp = upRoom === downRoom ? rng.chance(0.5) : upRoom > downRoom;
    const room = goUp ? upRoom : downRoom;
    const swing = Math.max(MIN_SWING, Math.round(room * rng.range(0.45, 0.95)));
    out.push(clamp(goUp ? prev - swing : prev + swing, lo, hi));
  }
  return out;
}

/**
 * Welcher Zonentyp passt, um von `row` nach `target` zu kommen?
 * Kletterzonen nur, wenn wirklich Höhe zu überwinden ist; sonst die flachen Typen (nie zweimal
 * derselbe hintereinander, sonst wirkt es wie eine Kette).
 */
function pickKind(rng, prev, row, target) {
  const delta = target - row;
  const prevWasClimb = ZONE_KINDS[prev] ? ZONE_KINDS[prev].climb : false;
  // Nach einem Schacht kommt immer erst eine flache Zone: Drei Aufstiege hintereinander sind kein
  // Berg, sondern eine Leiter — man braucht zwischendurch eine Ebene zum Durchatmen und Ankommen.
  if (!prevWasClimb) {
    if (delta <= -ZONE_KINDS.aufstieg.rise[1]) return 'aufstieg';
    if (delta >= ZONE_KINDS.abstieg.rise[0]) return 'abstieg';
  }
  const flat = ZONE_IDS.filter((id) => !ZONE_KINDS[id].climb && id !== prev);
  return rng.weighted(flat, flat.map((id) => ZONE_KINDS[id].weight));
}

/**
 * Baut den Zonen-Graph.
 *
 * @param {{seed: string|number, length: 'short'|'medium'|'long'}} params
 * @returns {{ zones: object[], edges: object[], width: number, height: number, profile: number[] }}
 *   zones   in Reihenfolge der Hauptroute, mit x0/w und Ein-/Ausgangszeile
 *   edges   Verbindungen: 'haupt' folgt der Reihenfolge, 'abkuerzung' überspringt eine Zone
 *   profile ein Eintrag je Spalte: die Zeile, auf der die Hauptroute dort verläuft (für Debug/Terrain)
 */
export function buildLayout(params) {
  const rng = createRng(params.seed, 'v2:layout');
  const count = ZONE_COUNT[params.length] || ZONE_COUNT.medium;
  const zones = [];
  let x0 = 0;
  let row = Math.round((ROUTE_TOP + ROUTE_BOTTOM) / 2);

  const push = (kind, w, rise, tag) => {
    const from = row;
    const to = clamp(row + rise, ROUTE_TOP + 4, ROUTE_BOTTOM - 2);
    zones.push({
      id: `z${zones.length}`,
      kind,
      role: tag,
      x0,
      w,
      entryRow: from,
      exitRow: to,
      underground: ZONE_KINDS[kind] ? ZONE_KINDS[kind].underground : false,
      climb: ZONE_KINDS[kind] ? ZONE_KINDS[kind].climb : false,
    });
    x0 += w;
    row = to;
  };

  // Die Höhenkurve legt fest, WOHIN die Welt will; die Zonen sind nur die Art, wie sie dorthin kommt.
  // Ein Stützpunkt etwa alle drei Zonen: oft genug für ein bewegtes Profil, selten genug, dass jede
  // Steigung Platz zum Ausspielen hat.
  const stops = heightCurve(rng.fork('hoehe'), Math.max(2, Math.round(count / 3) + 1));
  row = stops[0];
  zones.length = 0;
  x0 = 0;

  push('lauf', EDGE_W, 0, 'start');
  let prev = 'lauf';
  for (let i = 0; i < count; i++) {
    // Zielhöhe dieses Abschnitts: linear zwischen den Stützpunkten interpoliert
    const t = (i + 1) / count * (stops.length - 1);
    const a = stops[Math.min(stops.length - 1, Math.floor(t))];
    const b = stops[Math.min(stops.length - 1, Math.ceil(t))];
    const target = Math.round(a + (b - a) * (t - Math.floor(t)));

    const kind = pickKind(rng, prev, row, target);
    const k = ZONE_KINDS[kind];
    const w = rng.intRange(k.w[0], k.w[1]);
    // So viel Höhe nehmen, wie die Zone hergibt — der Rest bleibt für die nächste
    const wanted = target - row;
    const rise = clamp(wanted, k.rise[0], k.rise[1]);
    push(kind, w, rise, 'main');
    prev = kind;
  }
  push('lauf', EDGE_W, 0, 'finish');

  // Verzweigungen: Eine Abkürzung überspringt genau eine Zone (sie beginnt an deren Eingang und
  // endet am Ausgang). Nur dort, wo die übersprungene Zone nicht selbst schon eine Abkürzung trägt,
  // und nie an Start/Ziel. Ob sie wirklich schneller UND schaffbar ist, prüft Stufe 5 (Phase 2).
  const edges = [];
  for (let i = 1; i < zones.length; i++) edges.push({ from: zones[i - 1].id, to: zones[i].id, type: 'haupt' });

  const shortcutRng = rng.fork('shortcuts');
  // Nur EBENERDIGE LAUFZONEN ab 31 Kacheln Breite kommen in Frage: Die Abkürzung braucht eine Senke
  // im Hauptweg (terrain.js carveBranch), und die braucht Platz für Sohle und Treppe. Unter Tage
  // stünde die Decke im Weg, in Inselzonen gibt es gar keinen Boden zum Absenken.
  const candidates = zones.slice(1, -1).filter((z) => z.kind === 'lauf' && z.w >= 31);
  // Abgeschaltet (Rückmeldung 25.09.2026): Die Abkürzung übersprang ganze Passagen, ohne selbst eine Aufgabe zu sein.
  const wanted = 0;
  const taken = new Set();
  for (let n = 0; n < wanted && candidates.length; n++) {
    const z = shortcutRng.pick(candidates);
    const idx = zones.indexOf(z);
    if (taken.has(idx) || taken.has(idx - 1) || taken.has(idx + 1)) continue;
    taken.add(idx);
    z.shortcut = true;
    edges.push({ from: zones[idx - 1].id, to: zones[idx + 1].id, type: 'abkuerzung', over: z.id });
  }

  // Höhenprofil je Spalte: innerhalb einer Zone linear vom Eingang zum Ausgang
  const width = x0;
  const profile = new Array(width);
  for (const z of zones) {
    for (let i = 0; i < z.w; i++) {
      const t = z.w === 1 ? 1 : i / (z.w - 1);
      profile[z.x0 + i] = Math.round(z.entryRow + (z.exitRow - z.entryRow) * t);
    }
  }

  return { zones, edges, width, height: WORLD_H, profile };
}
