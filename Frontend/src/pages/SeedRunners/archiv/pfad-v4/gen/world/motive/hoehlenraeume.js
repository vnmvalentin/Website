// Höhlen-Räume: je einer ist ein eigenes Stück Gang mit eigener Idee — kein flacher Boden mit
// verstreuten Gefahren (das macht weiterhin `bestreueZone()` in typen/hoehlen.js für die schlichten
// Zonen), sondern ein Abschnitt, der SELBST eine Form hat: Gruben, eine Sägen-Schranke, ein
// Laser-Tor, eine bröckelnde Querung, herabstürzende Brocken. Anders als die alten Bausteine
// (gen/chunks/, statische, handgezeichnete Vorlagen) ist jeder Raum eine ALGORITHMISCHE Erzeugung —
// dieselbe Bauweise wie die Turm-Stockwerke (motive/stockwerke.js): Position und Zahl von Gruben,
// Plattformen und Gefahren kommen aus dem Seed, nicht aus einer festen Vorlage. Zwei Läufe derselben
// Raumart sehen deshalb nie gleich aus.
//
// EIN RAUM IST FLACH: `entry === exit`, ein durchgehender Boden in fester Zeile `boden` (der letzten
// Rasterzeile der Instanz — `stempeln()` verlängert den Fels darunter automatisch, `opt.fels: true`,
// genau wie bei den alten Bausteinen). Klettern übernehmen weiterhin die Schacht-Zonen (Aufstieg/
// Abstieg, siehe unten `SCHACHT_IDEEN`) — ein Raum ist ein WAAGERECHTER Ausschnitt mit eigener Idee,
// kein Höhengewinn.
//
// EINGESETZT WIRD EIN RAUM GENAU WIE EIN ALTER BAUSTEIN: `stempeln()`/`baueBausteinBruecken()`
// (gemeinsam/bausteine.js, faehigkeiten/baustein.js) kennen nur die Form {w,h,entry,exit,rows,
// entities,tpl}, keine Content-Quelle — ein Raum-Objekt hier hat exakt diese Form und braucht deshalb
// keine neue Fähigkeit, keine neue Graph-Brücke, keinen neuen Test-Unterbau.

const ROCK = '#';
const AIR = '.';

/** Lichte Höhe über dem Boden (Doppelsprung braucht 7,5 Kacheln) */
const H_BODEN = 20;
/** Boden-Zeile innerhalb der Instanz */
export const BODEN = H_BODEN - 1;
/**
 * Wie viele Zeilen eine Grube UNTER den Boden reicht, bevor ein fester (mit Spitzen ausgelegter)
 * Grund kommt. Anders als bei Parcours/Himmelsreich (Grundstoff 'luft', ein dünner Fels-Streifen über
 * echt offenem Himmel) ist Höhlens Grundstoff 'fels': `stempeln()`s `opt.fels`-Verlängerung setzt
 * unter JEDER Spalte, deren eigene letzte Zeile Fels ist, unbegrenzt weiter Fels — aber unter einer
 * Spalte, deren letzte Zeile LUFT ist, gar nichts. Eine Grube "bis zum Rasterrand" (wie bei Parcours)
 * wäre in Höhlen deshalb keine kurze Kerbe, sondern ein Sturz durch die GANZE übrige Rastertiefe bis
 * zur nächsten zufällig tief liegenden Bodenzeile eines völlig anderen Levelabschnitts — gemessen:
 * bis zu 125 Kacheln, über 2 Sekunden Fall. Ein fester (tödlicher) Grund IN der Instanz selbst bindet
 * den Sturz an eine feste, kurze Länge, genau wie `bodenVoll()` es für die alten Chunk-Bausteine schon
 * verlangt — der Boden am Ende der Instanz ist deshalb IMMER fest, auch unter einer Grube.
 */
export const PIT_TIEFE = 11;
export const H = H_BODEN + PIT_TIEFE;
/** Rand ohne Gefahr an beiden Enden (Übergang zur Nachbarzone bleibt lesbar) */
export const RAND = 5;

/** Leerer Raum: durchgehender Boden in Zeile BODEN, darunter durchgehend Fels bis zum Instanzende */
export function neuerGang(w) {
  const rows = Array.from({ length: H }, (_, y) => Array(w).fill(y < BODEN ? AIR : ROCK));
  return { w, h: H, entry: BODEN, exit: BODEN, rows, entities: [] };
}

/**
 * Eine Grube ab Spalte x0, `breite` Kacheln: bis PIT_TIEFE Zeilen unter den Boden offen, dann ein
 * fester, mit Spitzen ausgelegter Grund (siehe PIT_TIEFE) — wer hineinfällt, stirbt nach einem
 * kurzen, immer gleich langen Sturz, nicht nach einem, der von der Umgebung des Levels abhängt.
 */
export function grube(r, x0, breite, entities, wandeln, erlaubt) {
  for (let i = 0; i < breite; i++) {
    for (let y = 0; y < H - 1; y++) r.rows[y][x0 + i] = AIR;
    r.rows[H - 1][x0 + i] = ROCK;
    if (erlaubt('spike')) entities.push(wandeln({ type: 'spike', lx: x0 + i, ly: H - 2 }));
  }
}

const gefahr = (ctx, r, spec) => { if (ctx.erlaubt(spec.type)) r.entities.push(ctx.wandle(spec)); };

// ── Spitzenschlucht: 2–3 Gruben, dazwischen kurze Läufe mit einer Stachelkante ───────────────────
const spitzenschlucht = {
  id: 'spitzenschlucht', label: 'Spitzenschlucht', ab: 1, gewicht: 1.1, gefahren: () => ['spike'],
  baue(ctx) {
    const { rng, limits, d } = ctx;
    const n = d >= 3 ? rng.intRange(2, 3) : 2;
    const gapW = () => rng.intRange(2, Math.max(2, limits.maxGap - 1));
    const laufW = () => rng.intRange(7, 11);
    let w = RAND;
    const gruben = [];
    for (let i = 0; i < n; i++) { w += laufW(); gruben.push({ x: w, breite: gapW() }); w += gruben[i].breite; }
    w += RAND + laufW();
    const r = neuerGang(w);
    for (const g of gruben) grube(r, g.x, g.breite, r.entities, ctx.wandle, ctx.erlaubt);
    // Stachelkante: direkt vor jeder Grube (die Landung danach bleibt immer frei), ab Stufe 2
    if (d >= 2) for (const g of gruben) if (rng.range(0, 1) < 0.6) gefahr(ctx, r, { type: 'spike', lx: g.x - 1, ly: BODEN - 1 });
    return { ...r, tpl: { id: this.id, tags: ['spike', 'gap'], difficulty: Math.min(5, 1 + n) } };
  },
};

// ── Sägenhalle: 1–2 Sägen patrouillieren quer über den durchgehenden Boden ────────────────────────
const saegenhalle = {
  id: 'saegenhalle', label: 'Sägenhalle', ab: 1, gewicht: 1, gefahren: () => ['saw'],
  baue(ctx) {
    const { rng, d } = ctx;
    const n = d >= 4 ? 2 : 1;
    const spanne = () => rng.intRange(6, 9);
    let w = RAND;
    const tore = [];
    for (let i = 0; i < n; i++) { w += rng.intRange(6, 10); tore.push(w); w += spanne(); }
    w += RAND + rng.intRange(6, 10);
    const r = neuerGang(w);
    for (const x of tore) {
      const span = rng.intRange(6, 9);
      gefahr(ctx, r, {
        // Auf der Standfläche (BODEN − 1), nicht in der Felszeile: dort ragte sie nur einen Pixel heraus — eine Säge „im
        // Boden“, über die man einfach lief (Rückmeldung 25.09.2026)
        type: 'saw', lx: x, ly: BODEN - 1, path: [[0, 0], [span, 0]],
        speed: [45, 55, 65, 78, 90][d - 1], phase: rng.range(0, 1),
      });
    }
    return { ...r, tpl: { id: this.id, tags: ['saw'], difficulty: Math.min(5, 1 + n) } };
  },
};

// ── Laserstollen: ein bis zwei getaktete Lasertore quer über den Boden ────────────────────────────
const laserstollen = {
  id: 'laserstollen', label: 'Laserstollen', ab: 2, gewicht: 0.9, gefahren: () => ['laser'],
  baue(ctx) {
    const { rng, d } = ctx;
    const n = d >= 4 ? 2 : 1;
    let w = RAND;
    const tore = [];
    for (let i = 0; i < n; i++) { w += rng.intRange(9, 14); tore.push(w); }
    w += RAND + rng.intRange(9, 14);
    const r = neuerGang(w);
    for (const x of tore) {
      gefahr(ctx, r, {
        type: 'laser', lx: x, ly: BODEN, dir: 'right', reach: Math.min(20, w - x),
        period: [3.0, 2.7, 2.4, 2.1, 1.9][d - 1], on: [0.7, 0.75, 0.8, 0.85, 0.9][d - 1], warn: 0.5, phase: rng.range(0, 1),
      });
    }
    return { ...r, tpl: { id: this.id, tags: ['laser'], difficulty: Math.min(5, 1 + n) } };
  },
};

// ── Bröckelschlucht: EIN weiter Abgrund, ausschließlich über Bröckelblöcke zu queren ──────────────
const broeckelschlucht = {
  id: 'broeckelschlucht', label: 'Bröckelschlucht', ab: 1, gewicht: 1, gefahren: () => [],
  baue(ctx) {
    const { rng, limits, d } = ctx;
    // Bemessen nach dem, was ein MENSCH trifft (25.09.2026): Die erste Fassung (2 Kacheln breite Stücke, Lücken bis
    // maxGap − 1) war nur mit dem Solver belegt, der den einen exakten Sprung findet. Der Menschen-Bot (voller Sprung,
    // 17–150 ms Reaktionszeit) kam je nach Tempo in 0–25 % der Fälle durch — ein voller Sprung trägt 6–10 Kacheln und
    // überspringt so ein Stück. Jetzt: Die Lücke ist höchstens so weit wie ein 1,5 Kacheln zu FRÜHER Sprung (minus
    // Körperbreite), das Stück so breit, dass auch ein SPÄTER Sprung (eine Kachel nach der Kante) noch darauf landet.
    // Landeweite gemessen: ≈ 0,82–0,88 × reach.gap.jump. Ohne `reach` (Einzeltests) wird sie aus maxGap geschätzt.
    const J = ctx.reach ? ctx.reach.gap.jump : (limits.maxGap + 1) / 0.8;
    const frueh = 0.82 * J - 1.5;
    const spaet = 0.88 * J + 1;
    const gapBudget = Math.max(2, Math.min(Math.floor(frueh - 0.8), limits.maxGap - 1));
    const platW = Math.ceil(spaet - gapBudget) + 1;
    const n = rng.intRange(2, d >= 3 ? 3 : 2);
    const span = n * platW + (n + 1) * gapBudget;
    const w = RAND + rng.intRange(6, 9) + span + RAND + rng.intRange(6, 9);
    const r = neuerGang(w);
    const x0 = RAND + rng.intRange(6, 9);
    grube(r, x0, span, r.entities, ctx.wandle, ctx.erlaubt);
    const delay = [0.32, 0.28, 0.25, 0.22, 0.18][d - 1];
    let x = x0 + gapBudget;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < platW; k++) if (ctx.erlaubt('crumble')) r.entities.push(ctx.wandle({ type: 'crumble', lx: x + k, ly: BODEN, delay, respawn: 2.2 }));
      x += platW + gapBudget;
    }
    return { ...r, tpl: { id: this.id, tags: ['crumble', 'gap'], difficulty: Math.min(5, 2 + Math.floor(n / 2)) } };
  },
};

// ── Steinschlaggang: herabstürzende Brocken über dem Laufweg, ausweichen statt springen ───────────
const steinschlaggang = {
  id: 'steinschlaggang', label: 'Steinschlaggang', ab: 2, gewicht: 0.9, gefahren: () => [],
  baue(ctx) {
    const { rng, d } = ctx;
    const n = d >= 4 ? 3 : 2;
    let w = RAND;
    const xs = [];
    for (let i = 0; i < n; i++) { w += rng.intRange(7, 11); xs.push(w); }
    w += RAND + rng.intRange(7, 11);
    const r = neuerGang(w);
    for (const x of xs) {
      if (!ctx.erlaubt('fallingBlock')) continue;
      r.entities.push(ctx.wandle({ type: 'fallingBlock', lx: x, ly: BODEN - 3, width: 1, height: 1 }));
    }
    return { ...r, tpl: { id: this.id, tags: ['fallingBlock'], difficulty: Math.min(5, 1 + n) } };
  },
};

export const RAEUME = [spitzenschlucht, saegenhalle, laserstollen, broeckelschlucht, steinschlaggang];
export const RAUM_BY_ID = Object.fromEntries(RAEUME.map((r) => [r.id, r]));

/**
 * Nächsten Raum wählen und ausformen — dieselbe zweistufige Prüfung wie bei Bausteinen: erst welche
 * Art überhaupt zulässig ist (Schwierigkeit, Kernidee), dann ob die ausgeformte Instanz ins Raster
 * passt. `null`, wenn keine passt — der Aufrufer greift dann auf die alten Chunk-Bausteine zurück.
 *
 * @param {{rng, limits, d: number, wandle, erlaubt, gewichte?}} ctx  `erlaubt(art)`/`wandle(spec)` wie bei Turm;
 *   `gewichte(ids, gewichte)` (optional) ist der Kernidee-Haken `gewichteMotive` — Gewicht 0 schließt ein Motiv aus
 * @param {string|null} letzterId  nie zweimal dieselbe Art hintereinander
 * @param {object[]} [liste]  aus welchen Motiven gewählt wird (Höhlen: RAEUME samt Ideen-Räumen)
 * @returns {object|null}  {w,h,entry,exit,rows,entities,tpl} wie ein Baustein
 */
export function naechsterRaum(ctx, letzterId, liste = RAEUME) {
  const zulaessig = liste.filter((m) => m.ab <= ctx.d && m.id !== letzterId && m.gefahren(ctx.d).every((a) => ctx.erlaubt(a)));
  if (!zulaessig.length) return null;
  const basis = zulaessig.map((m) => m.gewicht);
  const gewichte = ctx.gewichte ? ctx.gewichte(zulaessig.map((m) => m.id), basis) : basis;
  const moeglich = zulaessig.filter((_, i) => gewichte[i] > 0);
  if (!moeglich.length) return null;
  const art = ctx.rng.weighted(moeglich, gewichte.filter((g) => g > 0));
  return art.baue(ctx);
}

// ── Schacht-Ideen: Gefahren IN den Lücken zwischen den bereits ausgegrabenen Vorsprüngen ─────────
//
// Rührt die Vorsprünge selbst NICHT an (`carveShaft()`/`buildLedges()` bleiben unverändert, der
// Bewegungsgraph sieht also weiterhin exakt dieselbe, bewiesene Geometrie — 300/300, 0 Reparaturen).
// Eine Gefahr sitzt immer im LUFTRAUM zwischen zwei Vorsprüngen, nie auf einem selbst — dieselbe Regel
// wie bei Turms laserkamin/saegenpendel: Der Sprung dorthin bleibt geometrisch unverändert, nur das
// TIMING kommt dazu.

/** Zwei Vorsprünge desselben Schachts: höher zuerst, dann tiefer (unabhängig davon, wie sie einsortiert wurden) */
function paare(ledges) {
  const sortiert = [...ledges].sort((a, b) => b.y - a.y);          // von unten (großes y) nach oben
  const out = [];
  for (let i = 0; i + 1 < sortiert.length; i++) out.push([sortiert[i], sortiert[i + 1]]);
  return out;
}

const schachtLeiter = {
  id: 'leiter', label: 'Leiter', ab: 1, gewicht: 1.4, gefahren: () => [],
  dekoriere() { return []; },
};

const schachtSaege = {
  id: 'saegenschacht', label: 'Sägenschacht', ab: 2, gewicht: 1, gefahren: () => ['saw'],
  dekoriere(ctx, ledges, info) {
    const abstand = ctx.d >= 5 ? 1 : 2;   // dieselbe Schwelle wie Turms laserkamin/saegenpendel
    const out = [];
    paare(ledges).forEach(([unten, oben], i) => {
      if (i % abstand !== 0) return;
      const zeile = unten.y - 1;                                    // knapp über dem unteren Vorsprung
      gefahr(ctx, { entities: out }, {
        type: 'saw', tx: info.left, ty: zeile, path: [[0, 0], [info.shaftW, 0]],
        speed: [50, 58, 68, 80, 92][ctx.d - 1], phase: ctx.rng.range(0, 1),
      });
      void oben;
    });
    return out;
  },
};

const schachtLaser = {
  id: 'laserschacht', label: 'Laserschacht', ab: 2, gewicht: 0.9, gefahren: () => ['laser'],
  dekoriere(ctx, ledges, info) {
    const abstand = ctx.d >= 5 ? 1 : 2;   // dieselbe Schwelle wie Turms laserkamin/saegenpendel
    const out = [];
    paare(ledges).forEach(([unten, oben], i) => {
      if (i % abstand !== 0) return;
      const zeile = unten.y - 1;
      const linksNach = ctx.rng.range(0, 1) < 0.5;
      gefahr(ctx, { entities: out }, {
        type: 'laser', tx: linksNach ? info.left - 1 : info.right, ty: zeile, dir: linksNach ? 'right' : 'left',
        reach: info.shaftW + 1, period: [3.0, 2.7, 2.4, 2.1, 1.9][ctx.d - 1], on: [0.7, 0.75, 0.8, 0.85, 0.9][ctx.d - 1],
        warn: 0.5, phase: ctx.rng.range(0, 1),
      });
      void oben;
    });
    return out;
  },
};

export const SCHACHT_IDEEN = [schachtLeiter, schachtSaege, schachtLaser];

/**
 * Für einen bereits ausgegrabenen Schacht (aus `carveShaft()`s Rückgabe) eine Idee wählen und ihre
 * Gefahren als ABSOLUTE Weltkoordinaten liefern — der Schacht selbst wird nicht verändert.
 *
 * @param {{rng, d, wandle, erlaubt}} ctx
 * @param {{shaftLeft, shaftW, top, bottom, ledges}} shape  Eintrag aus `buildTerrain()`s `shapes`
 * @returns {object[]} Entities in Weltkoordinaten
 */
export function schachtEntities(ctx, shape) {
  const zulaessig = SCHACHT_IDEEN.filter((s) => s.ab <= ctx.d && s.gefahren(ctx.d).every((a) => ctx.erlaubt(a)));
  if (!zulaessig.length || shape.ledges.length < 2) return [];
  const idee = ctx.rng.weighted(zulaessig, zulaessig.map((s) => s.gewicht));
  return idee.dekoriere(ctx, shape.ledges, { left: shape.shaftLeft, right: shape.shaftLeft + shape.shaftW, shaftW: shape.shaftW });
}
