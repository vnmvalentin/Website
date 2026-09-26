// Weltengenerierung v3 — der Rahmen, den jeder Welttyp ausfüllt.
//
// Der Unterschied zu v2 in einem Satz: v2 WAR der Generator, v3 ist das Bauamt. Hier stehen nur
// noch die Schritte, die für jede Welt gleich sind:
//
//   1. Welttyp wählen (Seed)          → registry.js
//   2. Grenzen aus der Reichweite     → wie v2, gemessen × SAFETY
//   3. Der Welttyp baut sein Raster   → typen/<id>.js
//   4. Start- und Zielplattform       → gemeinsam/plattform.js  (VERBINDLICH für alle)
//   5. Checkpoints setzen
//   6. Reparatur als Sicherheitsnetz  → v2/repair.js
//   7. Level-Objekt + Hash
//
// Schritt 4 ist der Grund, warum das überhaupt eine gemeinsame Schicht ist: Bis Phase 2 begann
// jedes Level auf welligem Boden. Diese Regel darf nicht bei 16 Welttypen 16-mal einzeln stimmen
// müssen.

import { createRng, hashText } from '../../sim/rng.js';
import { SPEED_CLASSES, isSpeedClass } from '../../sim/classes.js';
import { reachForClass } from '../../sim/reach.js';
import { BIOMES, isBiome } from '../biomes.js';
import { SAFETY } from '../generator.js';
import { ZONE_COUNT } from '../v2/layout.js';
import { at, set, AIR, ROCK } from '../v2/terrain.js';
import { repairWorld } from '../v2/repair.js';
import { waehleWelttyp, istWelttyp } from './registry.js';
import { waehleIdee, istIdee } from './ideen/registry.js';
import { neuesRaster } from './gemeinsam/raster.js';
import { setzeStartplattform, setzeZielplattform, ZIEL_BREITE } from './gemeinsam/plattform.js';
import { baueZusatz } from './reichweite/graph.js';

/** Generator-Version dieses Pfads. Steht im Level; alte Seeds bleiben mit ihrer Version lesbar. */
export const WORLD_VERSION = 3;

/** Level → Ergebnis des Welttyps (z. B. für typen/pfad.js WEGE: die geplanten Züge) — nur für Werkzeuge und Tests,
 *  etwa um einen echten Lauf durch ein Live-Level für die Anti-Cheat-Prüfung zu erzeugen */
export const WELT_BAU = new WeakMap();

export const LENGTHS = Object.freeze(ZONE_COUNT);

export function normalizeParams(raw = {}) {
  const length = LENGTHS[raw.length] ? raw.length : 'medium';
  // Standard "super": Normal/Schnell fühlten sich beim Spielen langweilig an, die weiten Sprünge
  // machen erst bei super schnell Spaß (Rückmeldung 24.09.2026) — die Werkbank bietet inzwischen
  // nur noch super an, aber ein fehlender/ungültiger Wert soll trotzdem dasselbe Tempo bekommen,
  // nicht heimlich auf "normal" zurückfallen.
  const speedClass = isSpeedClass(raw.speedClass) ? raw.speedClass : 'super';
  const biome = raw.biome === 'random' || !isBiome(raw.biome) ? 'random' : raw.biome;
  const seed = raw.seed === undefined || raw.seed === null || raw.seed === '' ? '0' : String(raw.seed).trim();
  const difficulty = Number.isInteger(raw.difficulty) && raw.difficulty >= 1 && raw.difficulty <= 5 ? raw.difficulty : 3;
  const worldType = istWelttyp(raw.worldType) ? raw.worldType : null;
  // Anders als worldType (wo "unbekannt" = "Seed entscheidet über ALLE Welttypen" heißt): hier muss
  // sich `null` (explizit KEINE Idee) von "gar nicht angegeben" (Seed würfelt normal) unterscheiden
  // lassen — sonst ließe sich "keine Idee" von der Werkbank aus nicht erzwingen.
  const kernidee = raw.kernidee === null ? null : (istIdee(raw.kernidee) ? raw.kernidee : undefined);
  return { seed, length, speedClass, biome, difficulty, worldType, kernidee };
}

/** Oberste Zeile über einer Spalte, auf der man stehen kann */
function standingRow(grid, x, fromRow) {
  for (let y = Math.max(0, fromRow); y < grid.length - 1; y++) {
    if (at(grid, x, y) === AIR && at(grid, x, y + 1) === ROCK) return y;
  }
  return -1;
}

/** Sonderzeichen setzen — nur auf einer Luftkachel mit Boden darunter. */
function place(grid, x, fromRow, ch) {
  const y = standingRow(grid, x, fromRow);
  if (y < 0) return null;
  set(grid, x, y, ch);
  return { x, y };
}

/**
 * Ein Level aus (Seed, Länge, Tempo-Klasse, Biom, Schwierigkeit) — und ab jetzt: aus einem Welttyp.
 * @returns {object} dieselbe Form wie v2/v1, plus meta.worldType
 */
export function generateWorld(rawParams) {
  const params = normalizeParams(rawParams);
  const typ = waehleWelttyp(params.seed, params.worldType);
  const reach = reachForClass(params.speedClass);

  // Biom: aus der Palette DES WELTTYPS, nicht aus allen. Eine Fabrik ist keine Wiese.
  const biomeId = params.biome !== 'random' && typ.biome.includes(params.biome)
    ? params.biome
    : createRng(params.seed, 'v2:biome').pick(typ.biome);

  const safety = SAFETY[params.difficulty];
  const limits = {
    maxGap: Math.floor(reach.gap.jump * safety),
    maxGapUp: Math.floor(reach.gap.double * safety),
    maxUp: Math.floor(reach.height.double * safety),
    maxDown: 30,
  };

  // Kernidee: eigener Teilstrom, unabhängig von der Welttyp-Wahl (siehe ideen/registry.js). Ein
  // etwaiger `vorbereiten()`-Wurf der Idee (z. B. "welche Gefahrenart wird DIE eine") bekommt seinen
  // EIGENEN, an die Idee-id gebundenen Teilstrom — zwei verschiedene Ideen würfeln so nie densselben
  // Wert, nur weil sie zufällig an derselben Stelle im Ablauf gefragt werden.
  // Seit 26.09.2026 stillgelegt: ohne ausdrücklichen Wunsch keine Kernidee (Pfad hat eigene Aufgaben und Handschriften)
  const { idee, tier } = waehleIdee(params.seed, typ.id, params.kernidee === undefined ? null : params.kernidee);
  const ideeZustand = idee && typeof idee.vorbereiten === 'function'
    ? idee.vorbereiten(createRng(params.seed, `v2:kernidee:${idee.id}`), { welttyp: typ.id, tier })
    : null;

  const gebaut = typ.baue({
    params,
    limits,
    reach,
    neuesRaster: (w, h) => neuesRaster(w, h, typ.grundstoff),
    biomeId,
    idee, ideeZustand, tier,
  });
  const grid = gebaut.grid;
  let height = grid.length;
  const width = grid[0].length;

  // ── Gemeinsame Regeln ───────────────────────────────────────────────────
  // Der Welttyp hat Start und Ziel nur VORGESCHLAGEN; eben, breit und frei werden sie hier.
  const startZone = (gebaut.zonen && gebaut.zonen[0]) || null;
  const start = setzeStartplattform(grid, gebaut.marken.start, {
    richtung: 1,
    // Bis hierhin darf die Startplattform Platz schaffen: bis zum Ende der ersten Zone, nicht weiter.
    grenze: startZone ? startZone.x0 + startZone.w : width,
  });
  const zielFlaeche = setzeZielplattform(grid, gebaut.marken.ziel);
  set(grid, start.x, start.y, 'S');

  const finish = [];
  for (let i = 0; i < 3; i++) {
    const f = place(grid, zielFlaeche.x + Math.floor(ZIEL_BREITE / 2) - 1 + i, zielFlaeche.y - 1, 'E');
    if (f) finish.push(f);
  }

  // Der Welttyp kann Elemente (Mover, Federn, Ringe, …) und Anker mitbringen — für Fähigkeiten
  // jenseits von 'boden' (siehe gen/world/faehigkeiten/). Die Reparatur muss dieselben Fähigkeiten
  // kennen wie später der Bewegungsgraph, sonst hielte sie eine Mover-Route für kaputt, nur weil
  // sie keine Felskante ist — deshalb wird der Zusatz hier schon gebaut, vor der Reparatur, nicht
  // erst danach beim Prüfen.
  const entities = gebaut.entities || [];
  const anchors = gebaut.anchors || [];
  // Die Start- und Zielplattform räumen Kopfraum und Anlauf frei — dabei verschwindet ein Greifanker, der genau dort
  // schwebt (Anker über der ersten Lücke, direkt hinter der Startinsel). Das Raster ist die Wahrheit für die Sim, also
  // werden die Anker nach den gemeinsamen Plattformen erneut gesetzt.
  for (const an of anchors) if (at(grid, an.x, an.y) === AIR) set(grid, an.x, an.y, 'G');
  const zusatzVorab = baueZusatz({
    meta: { faehigkeiten: typ.faehigkeiten, anchors, bausteine: gebaut.bausteine, stockwerke: gebaut.stockwerke, abschnitte: gebaut.abschnitte },
    entities,
    rows: grid.map((r) => r.join('')),
  });

  // `ziel` ist der ECHTE Zielpunkt (nicht der Kartenrand!) — siehe repair.js. Ohne ihn würde die
  // Reparatur bei Welttypen mit Nachlauf hinter der Zielplattform (Himmelsreich: 16 Spalten Luft)
  // versuchen, bis in die leere Luft vorzudringen, und dabei sinnlos weiterflicken.
  const { repairs, reachedEnd } = repairWorld(grid, start, limits, {
    achse: typ.achse, zusatz: zusatzVorab, ziel: { x: zielFlaeche.x, y: zielFlaeche.y },
  });

  const checkpoints = [];
  const zonen = gebaut.zonen || [];
  // Schrittweite aus der ZAHL der Zonen ableiten statt fest "jede zweite": Höhlen hat wenige,
  // breite Zonen (Schritt 2 ergibt sinnvolle ~9 Checkpoints); Himmelsreich hat viele schmale
  // Inseln als eigene Zonen (Schritt 2 ergäbe über 20 — Checkpoint an praktisch jeder zweiten
  // Insel, das entwertet sie). Zielgröße: ungefähr 10 Checkpoints, egal wie fein die Zonenliste ist.
  const schritt = Math.max(2, Math.round(zonen.length / 10));
  // Ein Welttyp, der genau weiß, wo Prüfpunkte hingehören (Turm: jedes zweite Stockwerk), markiert die Zonen selbst
  // (`pruefpunkt: true`); ohne solche Angabe gilt die Schrittweite.
  const explizit = zonen.some((z) => z.pruefpunkt !== undefined);
  const pruefzonen = explizit ? zonen.filter((z) => z.pruefpunkt) : zonen.filter((_, i) => i >= 1 && i < zonen.length - 1 && (i - 1) % schritt === 0);
  // `pruefzonen` steht schon in der Reihenfolge, in der die Route sie durchläuft (Turm: Stockwerk für
  // Stockwerk nach oben) — die Sim würde diese Reihenfolge aber selbst wieder wegwerfen und stattdessen
  // nach Position (links→rechts) sortieren, was bei einem senkrechten Level wie dem Turm falsch sein kann
  // (ein tieferes Stockwerk kann zufällig weiter rechts liegen). Die tatsächlich benutzten Checkpoints
  // bekommen deshalb hier explizit ihre Nummer nach BAU-Reihenfolge (siehe checkpointOrder unten).
  let cpNr = 0;
  for (const z of pruefzonen) {
    // `cpX`: Ein Baustein hat nur seine ersten zwei Spalten als sicheren ebenen Boden — Spalte 3 kann
    // schon Grube oder Plattform sein, und `place()` suchte dann irgendeine Standfläche im Inneren.
    // `cpY`: Ein Welttyp, der die Zeile kennt (Turm: Oberfläche der Platte), muss sie nicht aus der Zone erraten lassen.
    const cp = place(grid, z.cpX ?? z.x0 + 2, z.cpY ?? Math.max(0, (z.entryRow ?? 0) - 12), 'C');
    if (cp) checkpoints.push({ ...cp, order: ++cpNr });
  }

  // Sturz-Tiefe begrenzen: horizontale Welttypen (achse 'x') haben oft VIEL Luft unter der eigent-
  // lichen Route — WORLD_H ist so groß bemessen, dass das Profil überall innerhalb ROUTE_TOP..
  // ROUTE_BOTTOM driften darf, aber der Tod tritt erst am RASTERRAND ein (world.js: map.h*TILE +
  // KILL_MARGIN). Sitzt die Route weit oben (Profil nah an ROUTE_TOP), fällt man bis fast zum
  // ganzen Kartenrand — bei Himmelsreich (Grundstoff 'luft': ÜBERALL Luft außer den Inseln selbst)
  // sind das im schlechtesten Fall über 100 Kacheln, mehrere Sekunden freier Fall bis zum Tod.
  // Gemeldet nach dem ersten echten Spieltest ("man fällt viel zu lange bis zum Tod"). Der Raster
  // wird deshalb hinter der TATSÄCHLICH tiefsten benutzten Zeile abgeschnitten (mit Sicherheitsrand)
  // — braucht keine Änderung an world.js, das tötet ohnehin schon am (jetzt näheren) Kartenrand.
  // Turm (achse 'y') ist NICHT betroffen: Seine Höhe ist ohnehin knapp bemessen, dort IST der
  // Kartenrand die Fortschrittsachse.
  if (typ.achse !== 'y') {
    const STURZ_RAND = 18;
    // Direkt im Raster nachsehen statt nur in Zonen/Marken: Eine carveIslands-artige Senke oder ein
    // Trittstein einer Abkürzung könnte tiefer reichen als das reine Zonen-Profil (das nur zwischen
    // entryRow und exitRow linear interpoliert, siehe layout.js `profile`) — das RASTER selbst lügt
    // nie darüber, was wirklich fest ist.
    let tiefsteZeile = start.y;
    for (const e of entities) tiefsteZeile = Math.max(tiefsteZeile, e.ty ?? 0);
    for (const a of anchors) tiefsteZeile = Math.max(tiefsteZeile, a.y ?? 0);
    for (const f of finish) tiefsteZeile = Math.max(tiefsteZeile, f.y);
    for (const c of checkpoints) tiefsteZeile = Math.max(tiefsteZeile, c.y);
    for (const r of repairs) tiefsteZeile = Math.max(tiefsteZeile, r.y ?? 0);
    for (let y = height - 1; y > tiefsteZeile; y--) {
      if (grid[y].some((ch) => ch !== AIR)) { tiefsteZeile = y; break; }
    }
    const kappenAb = Math.min(height, tiefsteZeile + STURZ_RAND);
    if (kappenAb < height) { grid.length = kappenAb; height = kappenAb; }
  }

  const rows = grid.map((r) => r.join(''));
  const level = {
    version: WORLD_VERSION,
    params,
    biome: biomeId,
    width,
    height,
    rows,
    entities,
    checkpointOrder: checkpoints.map((c) => ({ tx: c.x, ty: c.y, order: c.order })),
    placements: zonen.map((z, i) => ({
      id: z.id, kind: z.kind, index: i, x0: z.x0, w: z.w, dy: 0,
      entry: z.entryRow, exit: z.exitRow, difficulty: params.difficulty,
      needs: [], tags: [z.kind], role: z.role, shortcut: !!z.shortcut,
    })),
    layout: {
      zones: zonen,
      edges: gebaut.notizen?.edges || [],
      profile: gebaut.notizen?.profile || [],
      shapes: gebaut.notizen?.shapes || [],
      shortcuts: gebaut.notizen?.shortcuts || [],
    },
    meta: {
      start, finish, checkpoints, limits, repairs, reachedEnd,
      // Welttyp gehört ins Level: Er wird vor dem Start angezeigt und in der Galerie gefiltert.
      worldType: typ.id,
      worldLabel: typ.label,
      // Pfad: Leitidee und Autor (typen/pfad.js) — die Werkbank zeigt sie an
      leitidee: gebaut.notizen?.leitidee || null,
      autor: gebaut.notizen?.thema || null,
      motive: gebaut.notizen?.motive || [],
      // Kernidee ebenso (feste Regel 7, gen/PLANUNG_WELTTYPEN.md §3) — `null`, solange es für den
      // gewählten Welttyp noch keine passende Idee gibt (siehe ideen/registry.js).
      kernidee: idee ? idee.id : null,
      kernideeLabel: idee ? idee.label : null,
      kernideeBeschreibung: idee ? idee.beschreibung : null,
      kernideeTier: tier,
      kamera: typ.kamera,
      achse: typ.achse,
      faehigkeiten: typ.faehigkeiten,
      anchors,
      // Eingesetzte Chunks (gemeinsam/bausteine.js): Ort, Größe, Kennung — der Bewegungsgraph braucht
      // Ein- und Ausgang (faehigkeiten/baustein.js), die Werkbank zeigt sie an.
      bausteine: gebaut.bausteine || [],
      // Stockwerke des Turms (Ein-/Ausstiegszellen für den Bewegungsgraph)
      stockwerke: gebaut.stockwerke || [],
      // Züge des Pfad-Generators als Brücken (Absprung- → Landeplattform), siehe reichweite/graph.js „pfad“
      abschnitte: gebaut.abschnitte || [],
      biomeLabel: BIOMES[biomeId].label,
      speed: SPEED_CLASSES[params.speedClass].label,
    },
  };
  WELT_BAU.set(level, gebaut);
  level.hash = hashText(`${WORLD_VERSION}|${typ.id}|${rows.join('\n')}`);
  return level;
}
