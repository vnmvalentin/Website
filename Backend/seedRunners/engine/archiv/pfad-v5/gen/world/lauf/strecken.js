// Lauflinie — Strecken: Abschnitte, die man in einem Zug mit vollem Schwung durchläuft. Jede Strecke baut ihr Gelände
// selbst und liefert das Skript, mit dem der Läufer (spiel.js) sie spielt.
//
//   kette   Das Gelände entsteht aus der geflogenen Bahn. Je Schritt werden ALLE Zitter-Sätze bis zur gewünschten Höhe
//           gespielt, die Landefläche deckt ihre Streuung, dahinter ein kurzer Auslauf — dann sofort der nächste Schritt.
//           Zug-Arten: Sprung, Wandkick-Kehre, Kristall-Dash, Ring, Fallstufe; dazu Röhren und Sägen in der Flugbahn.
//   kamin   Wandkick-Schacht nach oben: zwei Wände, der Läufer kickt sich hoch und steigt über die niedrigere aus.
//   sturz   Fallschacht nach unten: Riegel ragen abwechselnd von links und rechts hinein, man steuert im Fallen durch die Lücken.
//
// Kamin und Sturz sind Bauformen mit Stellgrößen; ob sie tragen, entscheidet wie bei der Kette das Nachspielen mit allen
// Zitter-Sätzen (lauf.js). Scheitert es, wird mit anderen Stellgrößen neu gebaut.
//
// Alle Koordinaten sind Rasterkacheln; `dir` (±1) ist die Laufrichtung, jede Strecke ist in beide Richtungen baubar.

import { TILE, PLAYER_W, PLAYER_H } from '../../../sim/config.js';
import { ausschnitt, spiele, zitterSaetze, standVon } from './spiel.js';

const ROCK = '#';
const AIR = '.';
const ICE = 'I';

/** Höchstzahl Schritte eines Skripts (so lang sind die Zitter-Sätze) */
const SCHRITTE_MAX = 16;
/** Gewürfelte Zitter-Sätze je Strecke (dazu Mitte und beide Ränder): je mehr, desto verlässlicher die Spur */
const SAETZE_ZUFALL = 13;

/**
 * Härte je Schwierigkeitsstufe (Rückmeldung 14.11.2026: „gerne mehr Härte“). Gemessen mit einem UNGENAUEN Menschen (Streuung
 * ±80 ms statt ±50 ms): Vor dieser Tabelle kam er auf Stufe 3 in 86 % der Läufe ohne einen Tod durchs ganze Level.
 *   eng        Anteil knapper Landungen (Fläche so breit wie die Streuung, kein Rand davor)
 *   hindernis  Anteil der Sprünge mit Röhre oder Säge in der Flugbahn
 *   dicht      Röhren reichen bis an die Bahn (Fels direkt an der Spur, Stacheln an der Stirnseite); Flächen ohne Rand davor
 *   zitter     Faktor auf die Ungenauigkeit, mit der gebaut wird (kleiner = schmalere Spur)
 *   broeckel   Sekunden, die eine Bröckelplatte hält
 *   flutKette  Anteil der Ketten, durch die eine Flut-Wand jagt; flutKamin: Anteil der Kamine mit steigender Lava
 *   flutTempo  Tempo der Flut als Anteil am Tempo des Läufers auf dieser Strecke
 */
export const HAERTE = Object.freeze({
  1: { eng: 0.1, hindernis: 0.3, dicht: false, zitter: 1, broeckel: 0.5, flutKette: 0, flutKamin: 0, flutTempo: 0.5 },
  2: { eng: 0.25, hindernis: 0.5, dicht: false, zitter: 1, broeckel: 0.45, flutKette: 0.1, flutKamin: 0.3, flutTempo: 0.5 },
  3: { eng: 0.6, hindernis: 0.8, dicht: true, zitter: 0.8, broeckel: 0.4, flutKette: 0.3, flutKamin: 0.7, flutTempo: 0.6 },
  4: { eng: 0.8, hindernis: 0.95, dicht: true, zitter: 0.65, broeckel: 0.32, flutKette: 0.45, flutKamin: 0.85, flutTempo: 0.7 },
  5: { eng: 0.95, hindernis: 1, dicht: true, zitter: 0.5, broeckel: 0.26, flutKette: 0.6, flutKamin: 1, flutTempo: 0.8 },
});

/**
 * Bau-Zustand über alle Strecken eines Levels: Raster, Elemente und ein Journal, mit dem sich eine gescheiterte Strecke
 * spurlos zurücknehmen lässt.
 */
export function neuerBau(grid, cls, reach, d) {
  const journal = [];
  const entities = [];
  // Sperrflächen: Kacheln, durch die der Weg FRÜHERER Strecken führt (ihre Spur) oder die freigehalten werden müssen (Kopfraum
  // über dem Start). Dort darf nichts Neues hin — seit der Weg auch zurückläuft, liegen Strecken über- und untereinander.
  const tabu = new Set();
  return {
    tabu,
    grid, entities, cls, reach, d, W: grid[0].length, H: grid.length,
    haerte: HAERTE[d] || HAERTE[3],
    /** Warum etwas verworfen wurde (für die Notizen des Levels und die Fehlersuche) */
    gruende: {},
    grund(g) { this.gruende[g] = (this.gruende[g] || 0) + 1; },
    drin: (x, y) => x >= 2 && y >= 2 && x < grid[0].length - 2 && y < grid.length - 2,
    frei: (x, y) => x >= 0 && y >= 0 && x < grid[0].length && y < grid.length && grid[y][x] === AIR && !tabu.has(`${x},${y}`),
    /** Kachel setzen (nur innerhalb des Rasters); merkt sich den alten Wert */
    setze(x, y, ch) {
      if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length || grid[y][x] === ch) return;
      journal.push({ x, y, alt: grid[y][x] });
      grid[y][x] = ch;
    },
    fuege(e) { entities.push(e); journal.push({ e }); return e; },
    entferne(e) {
      const i = entities.indexOf(e);
      if (i >= 0) { entities.splice(i, 1); journal.push({ weg: e, i }); }
    },
    marke: () => journal.length,
    zurueck(marke) {
      while (journal.length > marke) {
        const j = journal.pop();
        if (j.e) entities.splice(entities.lastIndexOf(j.e), 1);
        else if (j.weg) entities.splice(Math.min(j.i, entities.length), 0, j.weg);
        else grid[j.y][j.x] = j.alt;
      }
    },
  };
}

/** Kante einer Plattform in Laufrichtung, in Pixeln (dort verlässt die Vorderkante des Läufers den Boden) */
const kantePx = (plat, dir) => (dir > 0 ? (plat.x1 + 1) * TILE : plat.x0 * TILE);

/** Ist das Rechteck (Kacheln, inklusive) frei von allem außer Luft? */
function rechteckFrei(B, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!B.drin(x, y) || !B.frei(x, y)) return false;
  return true;
}

/** Alle Zitter-Sätze durchspielen: Jeder muss das Skript beenden und auf `aus` stehen. Trägt die Bahn in `spur` ein. */
export function pruefeStrecke(B, st, spur = null) {
  const a = ausschnitt(B.grid, B.entities, st.box, st.start);
  for (let k = 0; k < st.saetze.length; k++) {
    const r = spiele(a, st.skript, st.saetze[k], { cls: B.cls, maxT: st.maxT, spur });
    if (!r.ok) return { ok: false, satz: k, r };
    const s = standVon(r.p);
    if (s.y !== st.aus.row - 1 || s.x < st.aus.x0 || s.x > st.aus.x1) return { ok: false, satz: k, r, daneben: true };
  }
  return { ok: true };
}

// ── Kette ────────────────────────────────────────────────────────────────────
//
// Rückmeldung 14.11.2026 zum ersten Prototyp: „ich drücke nur D und springe ab und zu … jeder Sprung fühlt sich wieder
// gleich an“. Eine Kette bestand nur aus Sprüngen von Fläche zu Fläche. Jetzt wählt jeder Schritt eine ZUG-ART, und zu
// vielen Sprüngen kommt ein Hindernis mitten in die Flugbahn:
//   sprung   getippt, mittel, voll oder mit Luftsprung
//   kick     an eine Wand springen, abkicken, HINTER sich höher landen (immer als Paar = Kehre: die Richtung bleibt)
//   dash     ein Kristall hängt im Bogen — einsammeln und dashen (waagerecht oder schräg hinauf)
//   ring     ein Boost-Ring im Bogen schleudert weiter
//   fall     ohne Sprung über die Kante, tief hinab auf eine kleine Fläche
// Im Flug:   roehre (zwei Röhren mit Stacheln, die Lücke ist genau die geflogene Bahn), saege (Säge knapp über/unter dem Bogen)
// Landung:   eng (so breit wie die Streuung, kein Rand), broeckel, feder
// Alles entsteht aus der gespielten Bahn: Röhren, Sägen und Stacheln sitzen dort, wo KEIN Zitter-Satz hinkam.

/** Höchster Aufstieg je Sprungart in Zeilen (negativ = hinauf) */
const HOCH_MAX = Object.freeze({ tipp: -1, mittel: -2, voll: -3, doppel: -6 });

/**
 * Spielarten der Kette. `zug`: Gewichte der Zug-Arten; `sprung`: Gewichte der Sprunggrößen; `auslauf`: Kacheln hinter der
 * Landestreuung; `dy`: Zeilen je Sprung; Wahrscheinlichkeiten für Zusätze: roehre, saege (im Flug), eng, broeckel, feder (Landung).
 */
export const KETTEN_ARTEN = Object.freeze({
  huepfer: { name: 'Hüpfkette', n: [5, 8], zug: { sprung: 6, fall: 1 }, sprung: { tipp: 3, mittel: 2, voll: 0.5, doppel: 0.3 }, auslauf: [0, 2], dy: [-2, 2], eng: 0.55, roehre: 0.15, saege: 0.3 },
  weit: { name: 'Weitsprünge', n: [3, 5], zug: { sprung: 5, ring: 1.5, boost: 2 }, sprung: { tipp: 0, mittel: 1, voll: 3, doppel: 2.5 }, auslauf: [1, 3], dy: [-3, 3], eng: 0.35, roehre: 0.5, saege: 0.2 },
  // (kaum getippte Sprünge: Ihr Bogen ist so flach, dass unter ihm kein Stachel Platz hat — dann wäre es ein Spaziergang)
  boden: { name: 'Stachellauf', n: [4, 7], zug: { sprung: 3, boost: 1 }, sprung: { tipp: 0.4, mittel: 3, voll: 2, doppel: 0 }, auslauf: [3, 7], dy: [0, 0], boden: 1, saege: 0.5 },
  broeckel: { name: 'Bröckelsprint', n: [5, 8], zug: { sprung: 1 }, sprung: { tipp: 2, mittel: 3, voll: 1, doppel: 0.5 }, auslauf: [1, 2], dy: [-1, 2], broeckel: 0.85, saege: 0.25 },
  feder: { name: 'Federbahn', n: [3, 5], zug: { sprung: 1 }, sprung: { tipp: 1, mittel: 2, voll: 1, doppel: 0.5 }, auslauf: [1, 3], dy: [-2, 2], feder: 0.6, eng: 0.3 },
  treppe: { name: 'Treppe', n: [4, 6], zug: { sprung: 4, dash: 1 }, sprung: { tipp: 0, mittel: 2, voll: 2, doppel: 2 }, auslauf: [0, 2], dy: [-4, -1], eng: 0.5, saege: 0.2 },
  abstieg: { name: 'Abstieg', n: [4, 6], zug: { sprung: 3, fall: 2.5 }, sprung: { tipp: 2, mittel: 2, voll: 1, doppel: 0.5 }, auslauf: [0, 2], dy: [2, 5], eng: 0.6, saege: 0.2 },
  kehre: { name: 'Wandkehren', n: [4, 6], zug: { sprung: 2, kick: 4 }, sprung: { tipp: 0.5, mittel: 2, voll: 2, doppel: 1 }, auslauf: [1, 3], dy: [-2, 1], eng: 0.3, saege: 0.2 },
  kristall: { name: 'Kristallflug', n: [4, 6], zug: { sprung: 1.5, dash: 4 }, sprung: { tipp: 1, mittel: 2, voll: 1, doppel: 0.5 }, auslauf: [0, 2], dy: [-2, 2], eng: 0.45, roehre: 0.2 },
  ringe: { name: 'Ringbahn', n: [3, 5], zug: { sprung: 1.5, ring: 4 }, sprung: { tipp: 0.5, mittel: 2, voll: 2, doppel: 0.5 }, auslauf: [1, 3], dy: [-2, 2], eng: 0.3, roehre: 0.25 },
  nadel: { name: 'Nadelöhr', n: [4, 6], zug: { sprung: 1 }, sprung: { tipp: 0, mittel: 2, voll: 2.5, doppel: 2 }, auslauf: [1, 3], dy: [-2, 2], eng: 0.3, roehre: 0.95 },
  // Boost-Streifen vor fast jedem Absprung: sehr weite, sehr schnelle Sätze
  turbo: { name: 'Turbobahn', n: [3, 5], zug: { sprung: 1, boost: 4 }, sprung: { tipp: 0, mittel: 1, voll: 2, doppel: 1 }, auslauf: [3, 5], dy: [-2, 2], eng: 0, roehre: 0.4, saege: 0.2 },
  // von allem etwas: kein Schritt wie der vorige
  mix: { name: 'Hindernislauf', n: [5, 8], zug: { sprung: 3, kick: 1.5, dash: 2, ring: 1.5, fall: 1, boost: 1.5 }, sprung: { tipp: 1, mittel: 2, voll: 2, doppel: 1.5 }, auslauf: [0, 3], dy: [-3, 3], eng: 0.45, roehre: 0.35, saege: 0.3, broeckel: 0.15, feder: 0.15 },
});

/** Ein Sprung ohne alles: kein Hindernis im Flug, keine besondere Landung, keine eigene Zug-Art */
export const istSchlicht = (s) => s.a === 'sprung' && !s.kick && !s.dash && s.wahl !== 'ring' && s.wahl !== 'boost' && !s.roehre && !s.saege && !s.eng && !s.landung;

function wuerfleSprung(rng, art, dir, abX, nur = null) {
  const namen = (nur || ['tipp', 'mittel', 'voll', 'doppel']).filter((n) => (art.sprung[n] || 0) > 0);
  const wahl = namen.length ? rng.weighted(namen, namen.map((n) => art.sprung[n])) : (nur ? nur[0] : 'mittel');
  const s = { a: 'sprung', dir, abX, wahl };
  if (wahl === 'tipp') s.halte = rng.intRange(6, 9);
  else if (wahl === 'mittel') s.halte = rng.intRange(13, 19);
  else if (wahl === 'voll') s.halte = rng.intRange(26, 34);
  else { s.halte = rng.intRange(14, 30); s.doppel = { nach: s.halte + rng.intRange(12, 30), halte: rng.intRange(10, 26) }; }
  return s;
}

/**
 * Eine Kette ab der Plattform `ein` bauen.
 * @param {object} B          Bau-Zustand (neuerBau)
 * @param {{ rng, ein: {x0,x1,row}, startX: number, dir: number, art: string, band: {oben: number, unten: number}, zielBreite?: number }} o
 *   band  erlaubte Zeilen für Standflächen (Fels eine Zeile darunter)
 * @returns {object|null} Strecke { art, name, skript, saetze, start, box, aus, plattformen, dir } — null, wenn nichts Tragfähiges entstand
 */
export function baueKette(B, o) {
  const { rng, ein, band } = o;
  const art = KETTEN_ARTEN[o.art] || KETTEN_ARTEN.huepfer;
  const marke = B.marke();
  const start = { x: o.startX, y: ein.row - 1 };
  // Ausschnitt: großzügig in Laufrichtung, das Band samt Rand
  const SPANNE = 150;
  const box = {
    x0: (o.dir > 0 ? Math.min(start.x, ein.x0) - 14 : start.x - SPANNE),
    y0: band.oben - 16,
    w: SPANNE + 18 + (ein.x1 - ein.x0),
    h: band.unten - band.oben + 34,
  };
  const H = B.haerte;
  const saetze = zitterSaetze(rng.fork('zittern'), SCHRITTE_MAX, SAETZE_ZUFALL, H.zitter);
  const n = rng.intRange(art.n[0], art.n[1]);
  const skript = [];
  const plattformen = [];
  let plat = ein;
  let dir = o.dir;
  // Absprunglinie: so weit vor der Kante, dass auch der späteste Zitter-Satz (50 ms ≈ 12 px bei „super“) noch Boden hat
  let abX = kantePx(plat, dir) - dir * rng.intRange(6, 12);
  let kehreOffen = false;                            // nach einem Kick muss der Gegen-Kick folgen
  // Schlichte Sprünge am Stück (ohne Hindernis, besondere Landung oder eigene Zug-Art): nie zwei hintereinander — Rückmeldung
  // 14.11.2026 „jeder Sprung fühlt sich wieder gleich an“ (gemessen: 63 % schlichte Sprünge, bis 13 am Stück)
  let schlichtFolge = 0;
  let vorigerZug = '';
  const scheitern = () => { B.zurueck(marke); return null; };
  const belegt = (x, y) => B.entities.some((e) => e.tx === x && e.ty === y);

  /** Alle Zitter-Sätze bis zur Landung von Schritt k spielen (Füße erreichen im Fallen `landeY`). null = einer scheitert. */
  const landung = (probe, k, landeY, opt = {}) => {
    const a = ausschnitt(B.grid, B.entities, box, start);
    const s = probe[k];
    let xMin = Infinity;
    let xMax = -Infinity;
    for (const satz of saetze) {
      const merk = { hoch: false };
      const r = spiele(a, probe, satz, {
        cls: B.cls, maxT: 1800, spur: opt.spur || null, spurAb: k,
        bis: (p, w, z) => {
          if (z.i !== k) return false;
          if (s.a === 'sprung' && z.ab === undefined) return false;
          if (s.kick && !z.gekickt) return false;                 // erst nach dem Kick zählt die Landung
          if (s.dash && !z.gedasht) return false;                 // …und erst nach dem Dash
          if (opt.nachFeder) { if (p.vy < -300) merk.hoch = true; if (!merk.hoch) return false; }
          return p.vy > 0 && p.y + PLAYER_H >= landeY - 0.5;
        },
      });
      if (!r.gestoppt || r.p.y + PLAYER_H > landeY + 8) {
        B.grund(r.tot ? 'kette-tot' : r.fertig ? 'kette-vorher-gelandet' : r.gestoppt ? 'kette-zu-tief' : 'kette-keine-hoehe');
        return null;
      }
      xMin = Math.min(xMin, r.p.x);
      xMax = Math.max(xMax, r.p.x + PLAYER_W);
    }
    return { lx0: Math.floor(xMin / TILE), lx1: Math.floor((xMax - 0.01) / TILE) };
  };
  /** Wo ist der mittlere Satz `T` Ticks nach dem Absprung von Schritt k? (für Kristall, Ring, Wand) */
  const stelle = (probe, k, T) => {
    const a = ausschnitt(B.grid, B.entities, box, start);
    const r = spiele(a, probe, saetze[0], { cls: B.cls, maxT: 1500, bis: (p, w, z) => z.i === k && z.ab !== undefined && z.t - z.ab >= T });
    return r.gestoppt ? r.p : null;
  };
  /** Landen wirklich alle Zitter-Sätze nach Schritt k auf der Fläche `fl`? (auf dem GEBAUTEN Gelände, bis der Schritt endet) */
  const landetAuf = (probe, k, fl, spur = null) => {
    const a = ausschnitt(B.grid, B.entities, box, start);
    for (const satz of saetze) {
      const r = spiele(a, probe, satz, { cls: B.cls, maxT: 1800, spur, spurAb: k });
      if (!r.fertig) return false;
      const st = standVon(r.p);
      if (st.y !== fl.row - 1 || st.x < fl.x0 || st.x > fl.x1) return false;
    }
    return true;
  };
  /** Fläche aus der Landestreuung: in Flugrichtung `ld` davor `rand` Kacheln, dahinter `auslauf` */
  const flaeche = (land, ld, rand, auslauf, R) => ({
    x0: ld > 0 ? land.lx0 - rand : land.lx0 - auslauf,
    x1: ld > 0 ? land.lx1 + auslauf : land.lx1 + rand,
    row: R + 1,
  });

  for (let k = 0; k < n && skript.length < SCHRITTE_MAX; k++) {
    let gebaut = null;
    for (let versuch = 0; versuch < 12 && !gebaut; versuch++) {
      const m2 = B.marke();
      const zurueck = (g) => { B.zurueck(m2); if (g) B.grund(g); };
      const letzter = k === n - 1;
      // Zug-Art: nach einem Kick der Gegen-Kick; sonst gewürfelt — nie dieselbe besondere Art zweimal hintereinander
      const moeglich = Object.keys(art.zug).filter((z) => {
        if (z === 'kick') return k <= n - 3 || kehreOffen;      // das Paar braucht zwei Schritte, danach noch einen
        if (z === 'sprung') return true;
        // Boost-Streifen liegen auf der Absprungfläche: Die muss fest und mindestens vier Kacheln breit sein
        if (z === 'boost') return !plat.broeckel && !plat.feder && !plat.schwebt && plat.x1 - plat.x0 + 1 >= 4;
        return !letzter && z !== vorigerZug;
      });
      const zugArt = kehreOffen ? 'kick' : rng.weighted(moeglich, moeglich.map((z) => art.zug[z]));
      const stand = plat.row - 1;
      let schritt;
      let R;
      let ld = dir;                                             // Flugrichtung bei der Landung
      const muss = schlichtFolge >= 1 && !letzter;             // dieser Schritt braucht etwas Eigenes
      let eng = !letzter && (rng.chance(art.boden ? 0 : Math.max(art.eng ?? 0.3, H.eng)) || (muss && !art.boden && rng.chance(0.5)));

      if (zugArt === 'kick') {
        // Voll abspringen, die Wand steht dort, wo der mittlere Satz nach T Ticks ist
        schritt = { a: 'sprung', dir, abX, wahl: 'kick', halte: rng.intRange(52, 60), kick: { reaktion: rng.intRange(1, 4), halte: rng.intRange(24, 30) } };
        const p = stelle([...skript, schritt], k, rng.intRange(16, 28));
        if (!p) { zurueck('kick-stelle'); continue; }
        const vorn = dir > 0 ? Math.floor((p.x + PLAYER_W) / TILE) : Math.floor(p.x / TILE);
        const wx = vorn + dir * rng.intRange(1, 2);
        const wy = Math.floor(p.y / TILE);
        // (kurze Wand, nur um die Kontaktstelle: Eine hohe Wand stand dem Weiterweg nach der Kehre im Weg)
        if (!rechteckFrei(B, Math.min(wx, wx + dir), wy - 4, Math.max(wx, wx + dir), wy + 2)) { zurueck('kick-platz'); continue; }
        for (let y = wy - 4; y <= wy + 2; y++) { B.setze(wx, y, ROCK); B.setze(wx + dir, y, ROCK); }
        // Landehöhe aus dem GEMESSENEN Scheitel nach dem Kick: 2–3 Zeilen darunter — dann ist der Rückflug lang genug, dass
        // die Fläche weit hinter der Absprungkante liegt (dicht an der Wand hing sie über dem Anflug und versperrte ihn),
        // und jeder Zitter-Satz kommt sicher auf die Höhe. Mindestens 3 Zeilen über dem Absprung (Kopfraum darunter).
        const aK = ausschnitt(B.grid, B.entities, box, start);
        const rK = spiele(aK, [...skript, schritt], saetze[0], { cls: B.cls, maxT: 1500, bis: (p2, w, z) => z.i === k && z.gekickt && p2.vy > 0 });
        if (!rK.gestoppt) { zurueck('kick-scheitel'); continue; }
        R = Math.min(stand - 3, Math.floor((rK.p.y + PLAYER_H) / TILE) + rng.intRange(2, 3));
        ld = -dir;
        eng = false;
      } else if (zugArt === 'dash') {
        // (voll bis zum Scheitel gehalten: Die Bahn hängt dann nicht an der Haltedauer, jeder Zitter-Satz trifft den Kristall)
        schritt = { a: 'sprung', dir, abX, wahl: 'dash', halte: rng.intRange(52, 60) };
        schritt.dash = { reaktion: rng.intRange(0, 3), hoch: rng.chance(0.5) };
        const p = stelle([...skript, schritt], k, rng.intRange(26, 52));
        if (!p) { zurueck('dash-stelle'); continue; }
        const kx = Math.floor((p.x + PLAYER_W / 2) / TILE);
        const ky = Math.floor((p.y + PLAYER_H / 2) / TILE);
        if (!B.drin(kx, ky) || !B.frei(kx, ky) || belegt(kx, ky)) { zurueck('dash-platz'); continue; }
        B.fuege({ type: 'crystal', tx: kx, ty: ky, radius: 14 });
        R = schritt.dash.hoch ? stand - rng.intRange(2, 6) : stand + rng.intRange(-1, 3);
      } else if (zugArt === 'ring') {
        schritt = { a: 'sprung', dir, abX, wahl: 'ring', halte: rng.intRange(52, 60) };
        const hoch = rng.chance(0.45);
        const p = stelle([...skript, schritt], k, rng.intRange(26, 54));
        if (!p) { zurueck('ring-stelle'); continue; }
        const kx = Math.floor((p.x + PLAYER_W / 2) / TILE);
        const ky = Math.floor((p.y + PLAYER_H / 2) / TILE);
        if (!B.drin(kx, ky) || !B.frei(kx, ky) || belegt(kx, ky)) { zurueck('ring-platz'); continue; }
        B.fuege({ type: 'ring', tx: kx, ty: ky, dir: hoch ? (dir > 0 ? 'upRight' : 'upLeft') : (dir > 0 ? 'right' : 'left'), radius: 20 });
        R = hoch ? stand - rng.intRange(1, 5) : stand + rng.intRange(-1, 3);
      } else if (zugArt === 'boost') {
        // Boost-Streifen auf den letzten drei Kacheln vor der Kante, dann voll abspringen: Der Satz trägt rund anderthalbmal so weit
        const kante = dir > 0 ? plat.x1 : plat.x0;
        let platz = true;
        for (let i = 0; i < 3; i++) if (belegt(kante - dir * i, stand) || !B.frei(kante - dir * i, stand)) platz = false;
        if (!platz) { zurueck('boost-platz'); continue; }
        for (let i = 0; i < 3; i++) B.fuege({ type: 'boost', tx: kante - dir * i, ty: stand, dir: dir > 0 ? 'right' : 'left' });
        schritt = { a: 'sprung', dir, abX, wahl: 'boost', halte: rng.intRange(52, 60) };
        R = stand + rng.intRange(-2, 3);
      } else if (zugArt === 'fall') {
        schritt = { a: 'flug', dir, wahl: 'fall' };
        R = stand + rng.intRange(4, 8);
        eng = true;
      } else {
        schritt = wuerfleSprung(rng, art, dir, abX);
        // Zielzeile relativ zur jetzigen — nie höher, als dieser Sprung trägt (gemessen: getippt 1,8 Kacheln, mittel 3,
        // voll 4,2, mit Luftsprung 7,5)
        const dyMin = Math.max(art.dy[0], HOCH_MAX[schritt.wahl]);
        R = stand + rng.intRange(dyMin, Math.max(dyMin, art.dy[1]));
      }
      if (R < band.oben || R > band.unten) { zurueck('kette-band'); continue; }
      const probe = [...skript, schritt];
      const land = landung(probe, k, (R + 1) * TILE);
      if (!land) { zurueck(); continue; }
      // (zu breit gestreut: keine „Stelle“ mehr, sondern eine Fläche)
      // (nach einem Wandkick streut die Landung weiter — die Fläche dort ist ohnehin breit)
      if (land.lx1 - land.lx0 > (zugArt === 'kick' ? 8 : 5)) { zurueck('kette-streuung'); continue; }

      const mitFeder = !letzter && zugArt === 'sprung' && rng.chance(art.feder || 0);
      const mitBroeckel = !letzter && !mitFeder && zugArt !== 'kick' && rng.chance(art.broeckel || 0);
      const auslauf = letzter ? Math.max(7, o.zielBreite ?? 8) : zugArt === 'kick' ? rng.intRange(2, 3) : eng ? rng.intRange(0, 1) : rng.intRange(art.auslauf[0], art.auslauf[1]);
      const neu = { ...flaeche(land, ld, eng || H.dicht ? 0 : 1, auslauf, R), schritt: k, wahl: schritt.wahl };
      if (!rechteckFrei(B, neu.x0 - 1, R - 3, neu.x1 + 1, R + (zugArt === 'kick' ? 1 : 2))) { zurueck('kette-platz'); continue; }
      if (zugArt !== 'kick') {
        const abstand = ld > 0 ? neu.x0 - plat.x1 : plat.x0 - neu.x1;
        if (abstand < 2) { zurueck('kette-zu-nah'); continue; }
      } else neu.schwebt = true;

      let ende = neu;
      if (mitFeder) {
        // Federfeld: die ganze Streuung mit Federn belegen — der Sprung endet nicht hier, er wird weitergeschleudert
        for (let x = neu.x0; x <= neu.x1; x++) B.setze(x, R + 1, ROCK);
        for (let x = land.lx0 - (ld > 0 ? 1 : 0); x <= land.lx1 + (ld > 0 ? 0 : 1); x++) B.fuege({ type: 'spring', tx: x, ty: R, dir: 'up' });
        neu.feder = true;
        const R2 = Math.max(band.oben, Math.min(band.unten, R + rng.intRange(-2, 3)));
        const land2 = landung(probe, k, (R2 + 1) * TILE, { nachFeder: true });
        if (!land2 || land2.lx1 - land2.lx0 > 6) { zurueck('feder-landung'); continue; }
        const f2 = { ...flaeche(land2, ld, 1, rng.intRange(art.auslauf[0], art.auslauf[1]) + 1, R2), schritt: k, wahl: 'feder' };
        const weit = ld > 0 ? f2.x0 - neu.x1 : neu.x0 - f2.x1;
        if (weit < 2 || !rechteckFrei(B, f2.x0 - 1, R2 - 3, f2.x1 + 1, R2 + 2)) { zurueck('feder-platz'); continue; }
        for (let x = f2.x0; x <= f2.x1; x++) B.setze(x, R2 + 1, ROCK);
        plattformen.push(neu);
        ende = f2;
      } else if (mitBroeckel) {
        // Bröckelplatte: trägt nur kurz — der nächste Sprung muss gleich kommen
        for (let x = neu.x0; x <= neu.x1; x++) B.fuege({ type: 'crumble', tx: x, ty: R + 1, delay: H.broeckel });
        neu.broeckel = true;
      } else {
        for (let x = neu.x0; x <= neu.x1; x++) B.setze(x, R + 1, ROCK);
      }

      // Auf dem gebauten Gelände nachspielen: Jeder Zitter-Satz muss den Schritt auf seiner Fläche beenden (eine Fläche
      // über dem Anflug zur Wand etwa versperrte ihn — die Probe ohne Fläche merkte das nicht)
      if (!landetAuf(probe, k, ende)) { zurueck('kette-landung'); continue; }

      // Hindernisse im Flug: Röhren oder eine Säge an der geflogenen Bahn dieses Schritts (alle Zitter-Sätze)
      if (zugArt !== 'kick' && zugArt !== 'fall' && !mitFeder) {
        // (nach einem schlichten Sprung sicher ein Hindernis — außer die Landung ist schon knapp oder bröckelt)
        const zwang = (muss && !eng && !mitBroeckel) || rng.chance(H.hindernis);
        const willRoehre = rng.chance(art.roehre ?? 0.3) || (zwang && rng.chance(0.5));
        const willSaege = !willRoehre && (rng.chance(art.saege ?? 0.3) || zwang);
        if (willRoehre || willSaege) {
          // Spur dieses Schritts auf dem gebauten Gelände (alle Zitter-Sätze, vom Absprung bis zur Landung)
          const sk = new Set();
          if (landetAuf(probe, k, ende, sk)) {
            // Spalten zwischen Absprungkante und Landefläche, mit zwei Kacheln Abstand zu beiden
            const von = (dir > 0 ? plat.x1 : plat.x0) + dir * 3;
            const bis = (ld > 0 ? ende.x0 : ende.x1) - dir * 3;
            const spalten = [];
            for (let x = Math.min(von, bis); x <= Math.max(von, bis); x++) spalten.push(x);
            if (spalten.length && (dir > 0 ? bis >= von : bis <= von)) {
              const x = spalten[rng.int(spalten.length)];
              const hoehe = (xx) => {
                let oben = Infinity;
                let unten = -Infinity;
                for (let y = box.y0; y < box.y0 + box.h; y++) if (sk.has(`${xx},${y}`)) { oben = Math.min(oben, y); unten = Math.max(unten, y); }
                return { oben, unten };
              };
              const h1 = hoehe(x);
              const h2 = hoehe(x + 1);
              const oben = Math.min(h1.oben, h2.oben);
              const unten = Math.max(h1.unten, h2.unten);
              const m3 = B.marke();
              let ok = Number.isFinite(oben) && Number.isFinite(unten);
              const frei = (xx, yy) => B.drin(xx, yy) && B.frei(xx, yy) && !sk.has(`${xx},${yy}`) && !belegt(xx, yy);
              if (ok && willRoehre) {
                const lang = rng.intRange(3, 6);
                if (H.dicht) {
                  // Dichte Röhren (2 breit): Fels direkt an der geflogenen Bahn — die Lücke ist genau so hoch wie die Spur —,
                  // Stacheln an der Stirnseite: Wer zu hoch oder zu tief anfliegt, trifft sie.
                  const stirn = dir > 0 ? x - 1 : x + 2;
                  for (const xx of [x, x + 1]) for (let i = 0; i < lang; i++) if (!frei(xx, oben - 1 - i) || !frei(xx, unten + 1 + i)) ok = false;
                  if (ok) {
                    for (const xx of [x, x + 1]) for (let i = 0; i < lang; i++) { B.setze(xx, oben - 1 - i, ROCK); B.setze(xx, unten + 1 + i, ROCK); }
                    for (let i = 0; i < lang; i++) {
                      if (frei(stirn, oben - 1 - i)) B.fuege({ type: 'spike', tx: stirn, ty: oben - 1 - i, dir: dir > 0 ? 'left' : 'right' });
                      if (frei(stirn, unten + 1 + i)) B.fuege({ type: 'spike', tx: stirn, ty: unten + 1 + i, dir: dir > 0 ? 'left' : 'right' });
                    }
                    schritt.roehre = true;
                  }
                } else {
                  // Zwei Röhren (2 breit) mit einer Kachel Luft: Stacheln an den Enden
                  for (const xx of [x, x + 1]) {
                    if (!frei(xx, oben - 1) || !frei(xx, unten + 1)) { ok = false; break; }
                    for (let i = 0; i < lang; i++) if (!frei(xx, oben - 2 - i) || !frei(xx, unten + 2 + i)) ok = false;
                  }
                  if (ok) {
                    for (const xx of [x, x + 1]) {
                      for (let i = 0; i < lang; i++) { B.setze(xx, oben - 2 - i, ROCK); B.setze(xx, unten + 2 + i, ROCK); }
                      B.fuege({ type: 'spike', tx: xx, ty: oben - 1, dir: 'down' });
                      B.fuege({ type: 'spike', tx: xx, ty: unten + 1, dir: 'up' });
                    }
                    schritt.roehre = true;
                  }
                }
              } else if (ok) {
                // Säge direkt über oder unter dem Bogen (auf hohen Stufen größer: Sie reicht dann bis an die Bahn)
                const ueber = rng.chance(0.5);
                const sy = ueber ? oben - 1 : unten + 1;
                if (frei(x, sy)) { B.fuege({ type: 'saw', tx: x, ty: sy, radius: H.dicht ? 7 : 6 }); schritt.saege = true; } else ok = false;
              }
              // Trägt der Schritt mit dem Hindernis noch? Sonst kommt es wieder weg
              if (ok && !landetAuf(probe, k, ende)) { B.zurueck(m3); delete schritt.roehre; delete schritt.saege; }
              else if (!ok) B.zurueck(m3);
            }
          }
        }
      }

      if (eng) schritt.eng = true;
      if (mitFeder) schritt.landung = 'feder';
      else if (mitBroeckel) schritt.landung = 'broeckel';
      schlichtFolge = istSchlicht(schritt) ? schlichtFolge + 1 : 0;
      skript.push(schritt);
      gebaut = ende;
      if (zugArt === 'kick') { dir = -dir; kehreOffen = !kehreOffen; }
      vorigerZug = zugArt;
    }
    if (!gebaut) break;
    plattformen.push(gebaut);
    plat = gebaut;
    abX = kantePx(plat, dir) - dir * rng.intRange(6, 12);
  }
  // Mindestens drei Schritte, die Richtung wie am Anfang, und das Ende muss eine feste, breite Fläche sein
  if (skript.length < 3) { B.grund('kette-zu-kurz'); return scheitern(); }
  if (dir !== o.dir || kehreOffen) { B.grund('kette-kehre-offen'); return scheitern(); }
  if (plat.broeckel || plat.x1 - plat.x0 + 1 < 7) {
    // Die letzte Fläche zur Rastplattform verbreitern (in Laufrichtung), wenn Platz ist
    const fehlt = 8 - (plat.x1 - plat.x0 + 1);
    const nx0 = dir > 0 ? plat.x1 + 1 : plat.x0 - fehlt;
    const nx1 = dir > 0 ? plat.x1 + fehlt : plat.x0 - 1;
    if (plat.broeckel || fehlt <= 0 || !rechteckFrei(B, nx0, plat.row - 4, nx1, plat.row + 1)) { B.grund('kette-ende'); return scheitern(); }
    for (let x = nx0; x <= nx1; x++) B.setze(x, plat.row, ROCK);
    plat.x0 = Math.min(plat.x0, nx0);
    plat.x1 = Math.max(plat.x1, nx1);
  }
  const zuege = {};
  for (const s of skript) {
    zuege[s.wahl] = (zuege[s.wahl] || 0) + 1;
    if (s.roehre) zuege.roehre = (zuege.roehre || 0) + 1;
    if (s.saege) zuege.saege = (zuege.saege || 0) + 1;
    if (s.eng) zuege.eng = (zuege.eng || 0) + 1;
    if (istSchlicht(s)) zuege.schlicht = (zuege.schlicht || 0) + 1;
  }
  const st = {
    art: 'kette', spielart: o.art, name: art.name, dir, skript, saetze, start, box, maxT: 2400,
    ein, aus: { x0: plat.x0, x1: plat.x1, row: plat.row }, plattformen, boden: (art.boden || 0) > 0, marke, zuege,
  };
  const p = pruefeStrecke(B, st);
  if (!p.ok) { B.grund(`kette-pruefung-${p.daneben ? 'daneben' : p.r.grund || 'tot'}`); return scheitern(); }
  return st;
}

// ── Kamin ────────────────────────────────────────────────────────────────────

/**
 * Wandkick-Schacht nach oben. Der Boden der Eingangsplattform läuft in den Schacht hinein; die nahe Wand beginnt über
 * Kopfhöhe, die ferne steht auf dem Boden. Ausstieg über die niedrigere Wand: `wende` = über die nahe (Richtungswechsel),
 * sonst über die ferne (weiter in Laufrichtung).
 * @param {{ rng, ein, startX, dir, hoehe: number, wende: boolean }} o   hoehe: Zeilen, die der Schacht gewinnt
 */
export function baueKamin(B, o) {
  const { rng, ein, dir } = o;
  const marke = B.marke();
  const scheitern = () => { B.zurueck(marke); return null; };
  const r = ein.row;                                  // Felszeile des Bodens
  const breite = rng.intRange(5, 7);                  // lichte Weite
  const vorlauf = rng.intRange(2, 4);                 // Boden vor der nahen Wand
  const kante = dir > 0 ? ein.x1 : ein.x0;
  const xn = kante + dir * (vorlauf + 1);             // nahe Wand (2 dick: xn, xn+dir … liegt VOR dem Schacht)
  const xi0 = xn + dir * 2;                           // erste lichte Spalte
  const xf = xi0 + dir * breite;                      // ferne Wand (2 dick)
  const obenAus = r - o.hoehe;                        // Felszeile der Ausstiegsfläche
  const obenHoch = obenAus - 6;                       // Oberkante der höheren Wand
  const ausDir = o.wende ? -dir : dir;
  const WAND = 2;
  // Ausstiegsfläche: 9 breit, über der niedrigeren Wand beginnend, vom Schacht weg
  const ausInnen = o.wende ? xn + dir : xf;           // innere Spalte der Ausstiegswand
  const ax0 = Math.min(ausInnen, ausInnen + ausDir * 9);
  const ax1 = Math.max(ausInnen, ausInnen + ausDir * 9);

  // Platz prüfen: der ganze Schacht samt Wänden und Ausstieg (die Wende-Fläche liegt ÜBER dem Anlauf — das ist gewollt)
  const gx0 = Math.min(kante + dir, xf + dir * (WAND - 1), ax0);
  const gx1 = Math.max(kante + dir, xf + dir * (WAND - 1), ax1);
  if (!rechteckFrei(B, gx0, obenHoch - 2, gx1, r - 5)) { B.grund('kamin-platz-oben'); return scheitern(); }
  if (!rechteckFrei(B, Math.min(kante + dir, xf + dir), r - 4, Math.max(kante + dir, xf + dir), r + 1)) { B.grund('kamin-platz-unten'); return scheitern(); }

  // Boden bis unter die ferne Wand
  for (let x = kante + dir; x !== xf + dir * WAND; x += dir) { B.setze(x, r, ROCK); B.setze(x, r + 1, ROCK); }
  // Nahe Wand: ab 4 Zeilen über dem Boden (Durchgang darunter), ferne Wand: vom Boden an
  const naheOben = o.wende ? obenAus : obenHoch;
  const ferneOben = o.wende ? obenHoch : obenAus;
  for (let y = naheOben; y <= r - 5; y++) for (let k = 0; k < WAND; k++) B.setze(xn + dir * k, y, ROCK);
  for (let y = ferneOben; y <= r - 1; y++) for (let k = 0; k < WAND; k++) B.setze(xf + dir * k, y, ROCK);
  // Ausstiegsfläche
  for (let x = ax0; x <= ax1; x++) { B.setze(x, obenAus, ROCK); B.setze(x, obenAus + 1, ROCK); }

  const start = { x: o.startX, y: r - 1 };
  const skript = [
    { a: 'lauf', dir, bisX: (dir > 0 ? xi0 : xi0 + 1) * TILE },
    { a: 'kamin', dir, obenY: obenAus * TILE, aus: ausDir, reaktion: rng.intRange(1, 4), halte: rng.intRange(22, 30) },
    // …und ein Stück auf die Ausstiegsfläche hinaus, weg von der Kante
    { a: 'lauf', dir: ausDir, bisX: (ausDir > 0 ? ax0 + 5 : ax1 - 4) * TILE },
  ];
  const aus = { x0: ax0, x1: ax1, row: obenAus };
  const st = {
    art: 'kamin', spielart: o.wende ? 'wende' : 'gerade', name: o.wende ? 'Wendekamin' : 'Kamin', dir, ausDir, skript,
    saetze: zitterSaetze(rng.fork('zittern'), skript.length), start,
    box: { x0: Math.min(o.startX, gx0) - 4, y0: obenHoch - 8, w: Math.abs(gx1 - Math.min(o.startX, gx0)) + 24, h: r - obenHoch + 14 },
    maxT: 2400, ein, aus, plattformen: [], marke,
    schacht: { x0: Math.min(xi0, xf - dir), x1: Math.max(xi0, xf - dir), oben: obenHoch, unten: r - 1 },
  };
  if (dir < 0) st.box.x0 = Math.min(gx0, o.startX) - 12;
  const p = pruefeStrecke(B, st);
  if (!p.ok) { B.grund(`kamin-pruefung-${p.daneben ? 'daneben' : p.r.grund || 'tot'}`); if (o.roh) return { ...st, fehl: p }; return scheitern(); }
  return st;
}

// ── Sturz ────────────────────────────────────────────────────────────────────

/**
 * Fallschacht nach unten: Riegel ragen abwechselnd von beiden Seiten hinein. Unten läuft der Boden in Laufrichtung (oder,
 * mit `wende`, zurück) aus dem Schacht hinaus.
 * @param {{ rng, ein, startX, dir, riegel?: number, tiefe?: number, wende: boolean }} o
 */
export function baueSturz(B, o) {
  const { rng, ein, dir } = o;
  const marke = B.marke();
  const scheitern = () => { B.zurueck(marke); return null; };
  const r = ein.row;
  const weite = rng.intRange(10, 12);                 // lichte Weite
  const abstand = rng.intRange(13, 15);               // Zeilen zwischen zwei Riegeln
  const kante = dir > 0 ? ein.x1 : ein.x0;
  const xi0 = kante + dir;                            // erste lichte Spalte (gleich hinter der Kante)
  const xi1 = xi0 + dir * (weite - 1);                // letzte lichte Spalte
  const xw = xi1 + dir;                               // ferne Wand (2 dick)
  // `tiefe` vorgegeben (Wendesturz: die untere Etage muss unter allem Bisherigen liegen): so viele Riegel, wie hineinpassen
  const riegel = o.tiefe ? Math.max(1, Math.min(3, Math.floor((o.tiefe - 13) / abstand))) : o.riegel;
  const tiefe = Math.max(o.tiefe || 0, 6 + riegel * abstand + 7);
  const rb = r + tiefe;                               // Felszeile des Schachtbodens
  const ausDir = o.wende ? -dir : dir;
  const lx0 = Math.min(xi0, xi1);
  const lx1 = Math.max(xi0, xi1);
  // Auslauf unten: 9 Kacheln aus dem Schacht hinaus
  const ausVon = ausDir === dir ? xw : kante;         // Spalte der Wand, unter der es hinausgeht
  const ax0 = Math.min(ausVon, ausVon + ausDir * 10);
  const ax1 = Math.max(ausVon, ausVon + ausDir * 10);

  if (!rechteckFrei(B, Math.min(lx0, xw, xw + dir), r - 8, Math.max(lx1, xw, xw + dir), r - 1)) { B.grund('sturz-platz-oben'); return scheitern(); }
  // (Schacht samt beiden Wänden, und der Auslauf unten — nicht das ganze Rechteck dazwischen: Beim Wendesturz liegt über dem
  // Auslauf die Grube der vorigen Strecke)
  if (!rechteckFrei(B, Math.min(kante - dir, xw + dir), r + 2, Math.max(kante - dir, xw + dir), rb + 2)) { B.grund('sturz-platz-schacht'); return scheitern(); }
  if (!rechteckFrei(B, ax0 - 1, rb - 5, ax1 + 1, rb + 2)) { B.grund('sturz-platz-unten'); return scheitern(); }

  // Nahe Wand: unter der Eingangsplattform hinab (2 dick), ferne Wand: von über der Kante bis zum Boden
  const durch = (x) => (ausDir === dir ? x === xw || x === xw + dir : x === kante || x === kante - dir);
  for (let y = r + 1; y <= rb - 1; y++) for (let k = 0; k < 2; k++) {
    const x = kante - dir * k;
    if (!(durch(x) && y >= rb - 4)) B.setze(x, y, ICE);
  }
  for (let y = r - 7; y <= rb - 1; y++) for (let k = 0; k < 2; k++) {
    const x = xw + dir * k;
    if (!(durch(x) && y >= rb - 4)) B.setze(x, y, ICE);
  }
  // Boden: Schacht und Auslauf
  for (let x = Math.min(lx0 - 2, ax0); x <= Math.max(lx1 + 2, ax1); x++) { B.setze(x, rb, ROCK); B.setze(x, rb + 1, ROCK); }

  // Riegel: abwechselnd von der nahen und der fernen Seite, mit Stacheln obenauf; Ziele = Lückenmitte je Höhenband
  const ziele = [];
  let vonNah = rng.chance(0.5);
  for (let k = 0; k < riegel; k++) {
    const y = r + 6 + (k + 1) * abstand - Math.floor(abstand / 2);
    const lang = rng.intRange(Math.floor(weite * 0.5), Math.floor(weite * 0.6));
    // Spalten des Riegels (von der Wand aus) und der Lücke
    const rx0 = vonNah ? xi0 : xi1 - dir * (lang - 1);
    const spalten = Array.from({ length: lang }, (_, i) => rx0 + dir * i);
    for (const x of spalten) { B.setze(x, y, ROCK); B.fuege({ type: 'spike', tx: x, ty: y - 1, dir: 'up' }); }
    const luecke = [];
    for (let x = lx0; x <= lx1; x++) if (!spalten.includes(x)) luecke.push(x);
    const mitte = ((luecke[0] + luecke[luecke.length - 1] + 1) / 2) * TILE;
    ziele.push({ y: y * TILE, x: mitte });
    vonNah = !vonNah;
  }
  // Unten: zur Ausgangsseite hin landen
  const landeX = (ausDir > 0 ? lx1 - 1.5 : lx0 + 2.5) * TILE;
  ziele.push({ y: (rb + 2) * TILE, x: landeX });

  const start = { x: o.startX, y: r - 1 };
  const skript = [
    { a: 'sturz', dir, ziele },
    { a: 'lauf', dir: ausDir, bisX: (ausDir > 0 ? ax1 - 4 : ax0 + 5) * TILE },
  ];
  const aus = { x0: ausDir > 0 ? ausVon + 2 : ax0, x1: ausDir > 0 ? ax1 : ausVon - 2, row: rb };
  const st = {
    art: 'sturz', spielart: o.wende ? 'wende' : 'gerade', name: o.wende ? 'Wendesturz' : 'Sturzflug', dir, ausDir, skript,
    saetze: zitterSaetze(rng.fork('zittern'), skript.length), start,
    box: { x0: Math.min(o.startX, lx0, ax0) - 6, y0: r - 12, w: Math.max(lx1, ax1, o.startX) - Math.min(o.startX, lx0, ax0) + 14, h: tiefe + 18 },
    maxT: 2400, ein, aus, plattformen: [], marke,
    schacht: { x0: lx0, x1: lx1, oben: r - 7, unten: rb - 1 },
  };
  const p = pruefeStrecke(B, st);
  if (!p.ok) { B.grund(`sturz-pruefung-${p.daneben ? 'daneben' : p.r.grund || 'tot'}`); if (o.roh) return { ...st, fehl: p }; return scheitern(); }
  return st;
}
