// Stockwerke des Turms: je eines ist ein eigener Raum mit eigener Idee — kein Wandschacht mit Sprossen,
// sondern Plattformen mitten in der Halle, dazwischen die Elemente, die das Stockwerk ausmachen
// (Bröckelblöcke, Laser, Sägen, Aufzüge, Federn, Wind).
//
// AUFBAU EINES STOCKWERKS (Zeilen von oben nach unten, lokal):
//   Zeile 0–1        Decke = Boden des nächsten Stockwerks, mit einer Luke (LUKE_BREITE) für den Ausstieg
//   Zeile 2 … H+1    Luft. Zeile H+1 ist die STEHZEILE auf dem Boden (Luft über der Decke des Stockwerks darunter)
// Eine Plattform steht auf Stehzeile `s` (Luft) und hat ihren Fels in Zeile s+1 — dieselbe Konvention wie überall
// im Generator (Element `spike`/`spring`/Kristall: `ty` = Stehzeile; Bröckelblock: `ty` = Zeile des Blocks selbst).
//
// WARUM SO: Jedes Stockwerk ist ein abgeschlossenes Stück Level mit definiertem Ein- und Ausgang (die Luke).
// Die Route führt durch die MITTE der Halle; die Wände sind Eis — man kann sie nicht hinaufklettern (kein Wandsprung
// an Eis), also gibt es keine Abkürzung außen herum.
//
// Nichts hier würfelt frei im Raum: Elemente sitzen an Stellen, die sich aus den Plattformen ergeben (Sprung von A
// nach B, dazwischen der Laser; die Säge fährt genau über die Absprungzeile). Alle Zahlen für Sprungweiten kommen
// aus `limits` (Reichweite × Sicherheitsfaktor der Schwierigkeit), nicht aus Schätzungen.

/** Breite der Luke in der Decke (Spieler ist < 1 Kachel breit; 4 lässt Platz zum Zielen) */
export const LUKE_BREITE = 4;
/** Dicke der Decke */
export const DECKE = 2;
/** Stehzeile der letzten Plattform unter der Luke (3 Zeilen unter der Deckenoberkante bleiben zum Abspringen) */
const S_LUKE = 3;

const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Leeres Stockwerk: Breite W (Halle), H Zeilen Luft unter der Decke */
export function neuerRaum(W, H) {
  const rows = [];
  for (let y = 0; y < H + DECKE; y++) rows.push(Array(W).fill(y < DECKE ? '#' : '.'));
  return { W, H, rows, boden: H + DECKE - 1, entities: [], platten: [], luke: 0 };
}

const setze = (r, x, y, ch) => { if (x >= 0 && x < r.W && y >= 0 && y < r.rows.length) r.rows[y][x] = ch; };
/** Feste Plattform: Stehzeile s, Spalten x … x+w-1 */
function platte(r, x, s, w) {
  for (let i = 0; i < w; i++) setze(r, x + i, s + 1, '#');
  const p = { x, s, w, art: 'fest' };
  r.platten.push(p);
  return p;
}
/** Bröckelplattform: dieselbe Lage, aber jede Kachel ein Bröckelblock (Element auf Zeile s+1) */
function broeckel(r, x, s, w, delay) {
  for (let i = 0; i < w; i++) r.entities.push({ type: 'crumble', lx: x + i, ly: s + 1, delay, respawn: 1.9 });
  const p = { x, s, w, art: 'broeckel' };
  r.platten.push(p);
  return p;
}

/** Größte Zahl LEERER Spalten zwischen zwei Plattformrändern bei diesem Höhengewinn — dieselbe Formel wie der Bewegungsgraph */
export function luecke(limits, anstieg) {
  const budget = anstieg > 0
    ? Math.max(1, Math.round(limits.maxGapUp * (1 - anstieg / (limits.maxUp + 1))))
    : limits.maxGap;
  return Math.max(0, budget - 1);
}

/** R Zeilen auf n Schritte zwischen lo und hi verteilen */
function verteile(rng, R, n, lo, hi) {
  const dhs = Array(n).fill(lo);
  let rest = R - n * lo;
  let schutz = 400;
  while (rest > 0 && schutz-- > 0) {
    const i = rng.intRange(0, n - 1);
    if (dhs[i] < hi) { dhs[i]++; rest--; }
  }
  return dhs;
}

/**
 * Plattformkette vom Boden bis unter die Luke: abwechselnd nach links und rechts, zur Mitte hin bevorzugt.
 * Aufeinanderfolgende Plattformen überlappen nie in den Spalten (sonst nähme die obere der unteren den Kopfraum).
 *
 * @param {object} o  dhMin/dhMax (Zeilen je Schritt), wMin/wMax, xMinBoden (nur nahe am Boden), art ('fest' | 'broeckel'),
 *   delay (Bröckelverzögerung), fest (Set von Indizes, die trotz art 'broeckel' fest bleiben)
 */
export function stufen(ctx, o = {}) {
  const { r, rng, limits, d } = ctx;
  const dhMax = Math.max(2, Math.min(limits.maxUp, o.dhMax ?? (d >= 4 ? 4 : 3)));
  const wMin = o.wMin ?? 3;
  const wMax = o.wMax ?? 5;
  const R = r.boden - S_LUKE;
  // So viele Stufen, dass keine höher als dhMax ist; die kleinste Stufe passt sich an, damit die Summe stimmt
  // (bei R = 14 und fester Höhe 3 sind das fünf Stufen zu 3/3/3/3/2 — nicht vier zu 3, die 2 Zeilen unter der Luke enden)
  const n = Math.max(1, Math.ceil(R / dhMax));
  const dhMin = Math.max(1, Math.min(o.dhMin ?? 2, dhMax, Math.floor(R / n)));
  const dhs = verteile(rng, R, n, dhMin, dhMax);

  const ketten = [];
  let s = r.boden;
  for (let i = 0; i < n; i++) {
    s -= dhs[i];
    const nahBoden = r.boden - s < 13;
    const xMin = o.xMinBoden && nahBoden ? o.xMinBoden : 1;
    const letzte = i === n - 1;
    let w = rng.intRange(wMin, wMax);
    if (letzte) w = Math.max(w, 4);
    w = Math.min(w, r.W - 2 - xMin);
    const xMax = r.W - 1 - w;                       // größtes x
    let x;
    if (i === 0) {
      // Wer aus der Luke steigt, darf sich nicht den Kopf an einer Plattform darüber stoßen, und die Randzellen neben der
      // Luke müssen frei bleiben (dort landet man): die erste Plattform liegt seitlich daneben, links oder rechts.
      const links = ctx.einX - 1 - rng.intRange(1, 2) - w;
      const rechts = ctx.einX + LUKE_BREITE + rng.intRange(1, 2) + 1;
      const seite = rng.range(0, 1) < 0.5;
      const passt = (v) => v >= xMin && v <= xMax;
      x = seite ? (passt(rechts) ? rechts : links) : (passt(links) ? links : rechts);
      x = klemme(x, xMin, xMax);
    } else {
      const vor = ketten[i - 1];
      const g = rng.intRange(Math.min(1, luecke(limits, dhs[i])), Math.max(1, luecke(limits, dhs[i])));
      const zurMitte = vor.x + vor.w / 2 < r.W / 2 ? 1 : -1;
      // Oberstes Stockwerk: Die letzten Schritte laufen zur vorgegebenen Seite, damit die Luke am Rand landet
      const zurSeite = ctx.seite === 'links' ? -1 : ctx.seite === 'rechts' ? 1 : 0;
      const richtung = zurSeite && i >= n - 3 && rng.range(0, 1) < 0.92 ? zurSeite : (rng.range(0, 1) < 0.7 ? zurMitte : -zurMitte);
      const kandidat = (dir) => (dir > 0 ? vor.x + vor.w + g : vor.x - g - w);
      x = kandidat(richtung);
      if (x < xMin || x > xMax) x = kandidat(-richtung);
      x = klemme(x, xMin, xMax);
      // Nach dem Klemmen dürfen sich die Spalten nicht überlappen
      if (x < vor.x + vor.w && x + w > vor.x) x = vor.x + vor.w + 1 <= xMax ? vor.x + vor.w + 1 : Math.max(xMin, vor.x - w - 1);
      // Letzte Plattform mit Seitenvorgabe: ganz an den Rand, wenn der Sprung dorthin noch im Budget liegt
      if (letzte && zurSeite) {
        const ziel = zurSeite < 0 ? xMin : xMax;
        const luft = ziel + w <= vor.x ? vor.x - (ziel + w) : ziel >= vor.x + vor.w ? ziel - (vor.x + vor.w) : -1;
        if (luft >= 0 && luft <= Math.max(1, luecke(limits, dhs[i]))) x = ziel;
      }
    }
    const dieser = o.art === 'broeckel' && !(o.fest && o.fest.has(i))
      ? broeckel(r, x, s, w, o.delay)
      : platte(r, x, s, w);
    dieser.anstieg = dhs[i];
    ketten.push(dieser);
  }
  return ketten;
}

/** Luke über der letzten Plattform der Kette setzen; false, wenn die Seitenvorgabe (oberstes Stockwerk) nicht passt */
function setzeLuke(r, letzte, seite) {
  const mitte = letzte.x + Math.floor(letzte.w / 2);
  r.luke = klemme(mitte - Math.floor(LUKE_BREITE / 2), 1, r.W - 1 - LUKE_BREITE);
  // Oberstes Stockwerk: Auf der Decke muss die Zielplattform (ZIEL_BREITE 9) neben Luke UND Randzelle Platz haben —
  // links der Luke (Luke im rechten Teil) oder rechts von ihr (Luke im linken Teil).
  if (seite === 'links') return r.luke <= r.W - 14;
  if (seite === 'rechts') return r.luke >= 10;
  return true;
}

/** Gefahren-Element anlegen: läuft durch die Kernidee-Haken (`ctx.wandle`) */
const gefahr = (ctx, spec) => { if (ctx.erlaubt(spec.type)) ctx.r.entities.push(ctx.wandle(spec)); };

/** Delay-Kurve der Bröckelblöcke: gemütlich bei Stufe 1, knapp bei Stufe 5 */
const BROECKEL_DELAY = [0.3, 0.28, 0.26, 0.23, 0.2];

/** Wiederholt bauen, bis die Luke zur Seitenvorgabe passt (oberstes Stockwerk: Luke am Rand, damit die Zielplattform Platz hat) */
function mitSeite(ctx, baueKette) {
  for (let versuch = 0; versuch < 40; versuch++) {
    const unter = { ...ctx, rng: ctx.rng.fork(`v${versuch}`) };
    const nr = neuerRaum(ctx.r.W, ctx.r.H);
    unter.r = nr;
    const kette = baueKette(unter);
    if (setzeLuke(nr, kette[kette.length - 1], ctx.seite)) { Object.assign(ctx.r, nr); return kette; }
  }
  throw new Error('Stockwerk: keine passende Luke gefunden');
}

// ── Die Stockwerke ───────────────────────────────────────────────────────────

const STUFEN = {
  id: 'stufen', label: 'Stufen', ab: 1, gewicht: 1.2, hoehe: [14, 20],
  gefahren: () => [],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const kette = stufen(c, { xMinBoden: c.erste ? 11 : 0, wMin: 3, wMax: d5(c.d) });
      // Stachelkanten: ein Spike am äußeren Ende mancher Plattformen — es bleiben mindestens 3 sichere Kacheln
      if (c.d >= 3 && !c.erste) {
        for (let i = 1; i < kette.length - 1; i++) {
          const p = kette[i];
          if (p.w >= 5 && c.rng.range(0, 1) < 0.35 + 0.1 * c.d) {
            const ende = c.rng.range(0, 1) < 0.5 ? p.x : p.x + p.w - 1;
            gefahr(c, { type: 'spike', lx: ende, ly: p.s });
          }
        }
      }
      return kette;
    });
  },
};
const d5 = (d) => (d >= 4 ? 4 : 5);

const BROECKELLEITER = {
  id: 'broeckelleiter', label: 'Bröckelleiter', ab: 1, gewicht: 1, hoehe: [14, 20],
  gefahren: () => [],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const delay = BROECKEL_DELAY[c.d - 1];
      // Mindestens eine feste Rastplattform in der Mitte: Ein Sturz kostet dann nicht das ganze Stockwerk
      const n = Math.max(2, Math.ceil((c.r.boden - S_LUKE) / 3));
      const fest = new Set([Math.floor(n / 2), n - 1]);
      return stufen(c, { art: 'broeckel', delay, fest, dhMax: 3, wMin: 3, wMax: 4, xMinBoden: c.erste ? 11 : 0 });
    });
  },
};

const LASERKAMIN = {
  id: 'laserkamin', label: 'Laserkamin', ab: 2, gewicht: 1, hoehe: [16, 22],
  gefahren: () => ['laser'],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const kette = stufen(c, { dhMin: 3, dhMax: 3, wMin: 4, wMax: 5 });
      // Jeder Anstieg wird von einem Strahl gequert, der DIREKT über dem Kopf der unteren Plattform verläuft:
      // Man wartet unter dem Strahl, springt, wenn er aus ist. Bei Stufe 1 ist es jede zweite Plattform, bei 5 jede.
      const abstand = c.d >= 5 ? 1 : c.d >= 3 ? 2 : 3;
      const vorher = [{ x: c.einX, w: LUKE_BREITE, s: c.r.boden }];
      const alle = vorher.concat(kette);
      for (let i = 1; i < alle.length - 1; i++) {
        if ((i - 1) % abstand !== 0) continue;
        const unten = alle[i];
        if ((alle[i + 1].anstieg ?? 0) < 3) continue;
        if (unten.art !== 'fest' && unten.art !== undefined) continue;
        const zeile = unten.s - 1;
        if (zeile <= 3) continue;
        // Strahl von der Wand her, die von der Plattform WEGZEIGT: Er läuft über die Halle bis zur Plattform selbst
        const links = unten.x + unten.w / 2 > c.r.W / 2;     // Plattform rechts → Sender links
        gefahr(c, {
          type: 'laser', lx: links ? -1 : c.r.W, ly: zeile, dir: links ? 'right' : 'left',
          period: [2.8, 2.7, 2.6, 2.4, 2.2][c.d - 1], on: [0.8, 0.85, 0.9, 1.0, 1.0][c.d - 1], warn: 0.45, phase: c.rng.range(0, 1),
        });
      }
      return kette;
    });
  },
};

const SAEGENPENDEL = {
  id: 'saegenpendel', label: 'Sägenpendel', ab: 3, gewicht: 1, hoehe: [16, 22],
  gefahren: () => ['saw'],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const kette = stufen(c, { dhMin: 3, dhMax: 3, wMin: 4, wMax: 6 });
      const alle = [{ x: c.einX, w: LUKE_BREITE, s: c.r.boden }].concat(kette);
      const abstand = c.d >= 5 ? 1 : 2;
      for (let i = 1; i < alle.length - 1; i++) {
        if ((i - 1) % abstand !== 0) continue;
        const a = alle[i];
        const b = alle[i + 1];
        if ((b.anstieg ?? 0) < 3) continue;
        const zeile = a.s - 1;                                    // über dem Kopf der unteren Plattform
        const von = Math.max(1, Math.min(a.x, b.x) - 1);
        const bis = Math.min(c.r.W - 2, Math.max(a.x + a.w, b.x + b.w) + 1);
        if (bis - von < 4) continue;
        gefahr(c, {
          type: 'saw', lx: von, ly: zeile, path: [[0, 0], [bis - von, 0]],
          speed: [55, 60, 70, 80, 90][c.d - 1], phase: c.rng.range(0, 1),
        });
      }
      return kette;
    });
  },
};

const FEDERFELD = {
  id: 'federfeld', label: 'Federfeld', ab: 2, gewicht: 1, hoehe: [18, 24], seiteFaehig: false,
  gefahren: () => [],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const { r, rng } = c;
      // Federhöhe (gemessen): Scheitel 8,3 Kacheln. Sprünge von 5–6 Zeilen lassen etwas Luft nach oben.
      const R = r.boden - S_LUKE - 3;                  // die letzte Stufe zur Luke ist ein normaler Sprung (3 Zeilen)
      const n = Math.max(1, Math.ceil(R / 6));
      const hoehen = verteile(rng, R, n, Math.min(4, Math.floor(R / n)), 6);
      const kette = [];
      let s = r.boden;
      let vorX = c.einX + LUKE_BREITE + 2;
      // Feder auf dem Boden, neben der Luke
      r.entities.push({ type: 'spring', lx: klemme(vorX, 1, r.W - 2), ly: r.boden, dir: 'up' });
      let seite = rng.range(0, 1) < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        s -= hoehen[i];
        const w = 5;
        // Die nächste Plattform liegt seitlich versetzt (4–6 Spalten von der Feder): Wer senkrecht aufsteigt, stößt nicht
        // von unten an sie, sondern steigt daneben auf und landet von oben. Zickzack, an der Wand kehrt es um.
        let dx = seite * rng.intRange(4, 6);
        if (vorX + dx - 2 < 1 || vorX + dx - 2 > r.W - 1 - w) { seite = -seite; dx = seite * rng.intRange(4, 6); }
        const x = klemme(vorX + dx - 2, 1, r.W - 1 - w);
        seite = -seite;
        const p = platte(r, x, s, w);
        p.anstieg = hoehen[i];
        kette.push(p);
        // Feder in der Mitte, Stachel außen (ab Stufe 3): sicher landen heißt in die Mitte zielen. Die LETZTE Federplattform
        // hat keine Feder: Von ihr springt man normal auf die Plattform unter der Luke — eine Feder schleuderte einen dort
        // gegen die Decke des nächsten Stockwerks (Rückmeldung 25.09.2026).
        if (i < n - 1) r.entities.push({ type: 'spring', lx: x + 2, ly: s, dir: 'up' });
        if (c.d >= 3) {
          gefahr(c, { type: 'spike', lx: x, ly: s });
          gefahr(c, { type: 'spike', lx: x + w - 1, ly: s });
        }
        vorX = x + 2;
      }
      // Letzte Plattform unter der Luke: normaler Sprung von der letzten Federplattform
      s -= 3;
      const w = 4;
      const vor = kette[kette.length - 1];
      const zur = vor.x + vor.w / 2 < r.W / 2 ? 1 : -1;
      const g = rng.intRange(1, Math.max(1, luecke(c.limits, 3)));
      let x = zur > 0 ? vor.x + vor.w + g : vor.x - g - w;
      x = klemme(x, 1, r.W - 1 - w);
      if (x < vor.x + vor.w && x + w > vor.x) x = klemme(vor.x + vor.w + 1, 1, r.W - 1 - w);
      const letzte = platte(r, x, s, w);
      letzte.anstieg = 3;
      kette.push(letzte);
      return kette;
    });
  },
};

const AUFZUG = {
  id: 'aufzug', label: 'Aufzug', ab: 2, gewicht: 1, hoehe: [16, 22], seiteFaehig: false,
  gefahren: () => [],
  baue(ctx) {
    return mitSeite(ctx, (c) => {
      const { r, rng } = c;
      const F = r.boden;
      // Untere Ablage (2 über dem Boden), Aufzugsspalte daneben, obere Ablage unter der Luke auf der anderen Seite
      const breiteA = 4;
      // Nicht über der Luke des Bodens (Kopf) und nicht auf den Randzellen daneben: seitlich davon, links oder rechts
      const rechtsX = c.einX + LUKE_BREITE + 1 + rng.intRange(0, 2);
      const linksX = c.einX - 1 - breiteA - rng.intRange(0, 2);
      const maxX = r.W - 1 - breiteA - 4;                      // rechts neben der unteren Ablage bleibt Platz für Aufzug und Ablage
      const untenX = klemme(rechtsX <= maxX && (rng.range(0, 1) < 0.5 || linksX < 1) ? rechtsX : linksX, 1, maxX);
      const unten = platte(r, untenX, F - 2, breiteA);
      unten.anstieg = 2;
      const liftX = untenX + breiteA;                              // Aufzug direkt neben der Ablage, Oberkante bündig
      const hub = (F - 2) - S_LUKE;                                 // Fahrstrecke in Zeilen
      // Die obere Ablage grenzt unmittelbar an die Aufzugsspalte, rechts oder links (links liegt sie über der unteren Ablage)
      const rechtsMoeglich = liftX + 3 + 4 <= r.W - 1;
      const rechts = rechtsMoeglich && rng.range(0, 1) < 0.5;
      const obenX = rechts ? liftX + 3 : liftX - 4;
      const spitze = platte(r, obenX, S_LUKE, 4);
      spitze.anstieg = 3;
      // Aufzug: `ty` ist die Oberkante (Kachelzeile) — bündig mit dem Fels der Ablage (Zeile s+1)
      const speed = [50, 55, 60, 65, 70][c.d - 1];
      r.entities.push({
        type: 'mover', lx: liftX, ly: (F - 2) + 1, path: [[0, 0], [0, -hub]],
        speed, width: 3, phase: rng.range(0, 1),
      });
      // Ab Stufe 4: Stachelnase an der Oberkante der unteren Ablage (Absprung nach oben in die Mitte)
      if (c.d >= 4) gefahr(c, { type: 'spike', lx: untenX, ly: F - 2 });
      return [unten, spitze];
    });
  },
};

/**
 * Ein gebautes Stockwerk ins Raster setzen — dieselbe Funktion für den Turm und die Prüffenster der Beweis-Läufe,
 * damit beide GENAU dieselbe Geometrie haben.
 *
 * @param {string[][]} grid
 * @param {object[]} entities  wird ergänzt
 * @param {object} r           Ergebnis von neuerRaum() + baue()
 * @param {number} yTop        Rasterzeile von Zeile 0 des Stockwerks (Oberseite der Decke)
 * @param {number} wand        Wandspalten je Seite (die Halle beginnt in Spalte `wand`)
 * @param {(x: number, y: number, ch: string) => void} setze  Rasterzugriff (set aus v2/terrain.js)
 */
export function stempleStockwerk(grid, entities, r, yTop, wand, setze) {
  const Wg = r.W + 2 * wand;
  for (let ly = DECKE; ly < r.H + DECKE; ly++) for (let lx = 0; lx < r.W; lx++) if (r.rows[ly][lx] !== '.') setze(grid, wand + lx, yTop + ly, r.rows[ly][lx]);
  // Decke über die volle Breite (auch über die Wände, sonst führt der Weg außen an ihr vorbei), dann die Luke
  for (let ly = 0; ly < DECKE; ly++) for (let x = 0; x < Wg; x++) setze(grid, x, yTop + ly, '#');
  for (let ly = 0; ly < DECKE; ly++) for (let i = 0; i < LUKE_BREITE; i++) setze(grid, wand + r.luke + i, yTop + ly, '.');
  // Elemente; Laser sitzen in einem festen Wandstück
  for (const e of r.entities) {
    const { lx, ly, ...spec } = e;
    if (spec.type === 'laser') setze(grid, wand + lx, yTop + ly, '#');
    entities.push({ ...spec, tx: wand + lx, ty: yTop + ly });
  }
}

/** Alle Stockwerke; das Modul `turm.js` wählt daraus */
export const STOCKWERKE = [STUFEN, BROECKELLEITER, LASERKAMIN, SAEGENPENDEL, FEDERFELD, AUFZUG];
export const STOCKWERK_BY_ID = Object.fromEntries(STOCKWERKE.map((s) => [s.id, s]));
