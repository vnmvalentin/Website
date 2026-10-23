// marbleSim.js — Bahn und Physik der Murmelbahn.
//
// Das Rennen wird in jedem Browser selbst gerechnet (OBS-Quelle, zweite Quelle,
// Dashboard-Vorschau) und muss überall denselben Sieger ergeben. Deshalb:
//
//  - fester Zeitschritt, unabhängig von der Bildrate
//  - Zufall nur aus dem Startwert des Servers (eigener Generator, Ganzzahlen)
//  - ausschließlich + - * / und Math.sqrt. Die sind nach IEEE 754 überall
//    bitgleich; Math.sin/cos sind es zwischen Browserversionen NICHT — schon
//    eine abweichende letzte Stelle kippt ein Murmelrennen nach wenigen
//    Sekunden in ein anderes Ergebnis. Die Drehkreuze drehen deshalb über
//    eine feste Drehmatrix je Schritt statt über einen Winkel.
//
// Reine Rechnung ohne DOM — die Zeichnung liegt in OverlayScenes.jsx.

export const WORLD_W = 600;
export const MARBLE_R = 13;
export const STEPS_PER_SECOND = 120;

const DT = 1 / STEPS_PER_SECOND;
const GRAVITY = 1000;
/**
 * Luftwiderstand je Sekunde. Er deckelt das Tempo bei GRAVITY / DRAG — ohne ihn
 * wurde eine Murmel im freien Fall so schnell, dass sie ganze Abschnitte
 * einfach durchschlug und uneinholbar vorn lag.
 */
const DRAG = 2.2;
const MAX_SPEED = 900;
/**
 * Aufholen: wer vor dem Feld liegt, fällt etwas träger, wer hinten liegt, etwas
 * flotter — bei CATCHUP_SPAN Bildpunkten Abstand zum Feldmittel um CATCHUP.
 *
 * Das ist eine bewusste Spielregel, keine Physik. Ohne sie zieht die erste
 * Murmel davon und wird nicht mehr eingeholt: nachgemessen (200 Rennen, 20
 * Murmeln) führte der spätere Sieger in 64 % der Rennen schon bei 80 % der
 * Strecke, mit dieser Regel in 33 % — bei 16 statt 10 Führungswechseln.
 * Mehr Hindernisse allein haben daran nichts geändert, und Sammelbecken, die
 * das Feld anhalten, fühlten sich wie ein neues Level an.
 */
const CATCHUP = 0.35;
const CATCHUP_SPAN = 350;
/** Höhe eines Suchfachs. Hindernisse werden nach y einsortiert. */
const CELL_H = 120;
/** Nach so vielen Schritten ohne Sieger gewinnt, wer am weitesten ist. */
const TIMEOUT_STEPS = STEPS_PER_SECOND * 240;
/** Eine Murmel, die so lange liegt, bekommt einen Schubs. */
const STUCK_STEPS = STEPS_PER_SECOND * 2;

function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  // mulberry32 — nur Ganzzahl-Operationen, überall gleich
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Bahn ─────────────────────────────────────────────────────────────────── */

/* Regel für jeden Abschnitt: KEINE senkrechte Gasse. An jeder Stelle x muss
   eine frei fallende Murmel auf mindestens ein Hindernis treffen. Vorher gab es
   bei x ≈ 71–85 (und gespiegelt rechts) eine Lücke, die in Drehkreuzen,
   Prellböcken und Mühle zugleich frei war — wer dort hineinfiel, rauschte durch
   die halbe Bahn. Bei jedem neuen Abschnitt nachmessen (Skript im Memory). */

const HALF = WORLD_W / 2;

/** Keile an beiden Wänden: schließen den Streifen zwischen Wand und erstem Hindernis. */
function wedges(c, y, reach = 58) {
  c.segs.push({ x1: 0, y1: y, x2: reach, y2: y + reach * 0.8 });
  c.segs.push({ x1: WORLD_W, y1: y, x2: WORLD_W - reach, y2: y + reach * 0.8 });
}

/** Versetzte Reihe: gerade Reihen auf dem Raster, ungerade um ein halbes Feld verschoben
 *  und zusätzlich an beiden Wänden besetzt. Ruft fn(x, reihe) je Platz auf. */
function staggered(rows, spacing, fn) {
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let x = odd ? 0 : spacing / 2; x <= WORLD_W + 0.5; x += spacing) fn(x, r);
  }
}

/** Die Abschnitte, aus denen eine Bahn gewürfelt wird. Jeder gibt seine Höhe zurück. */
export const SECTIONS = {
  // Nagelbrett: versetzte Reihen, klassisches Galtonbrett
  pegs(c, y, rng) {
    const rows = 6 + Math.floor(rng() * 3);
    staggered(rows, 75, (x, r) => c.pegs.push({ x, y: y + 40 + r * 72, r: 9, bounce: 0.55 }));
    return rows * 72 + 60;
  },

  // Dicke Nägel: weniger, größer, mehr Abprall
  boulders(c, y, rng) {
    const rows = 4 + Math.floor(rng() * 2);
    staggered(rows, 120, (x, r) => c.pegs.push({ x, y: y + 50 + r * 100, r: 20, bounce: 0.7 }));
    return rows * 100 + 50;
  },

  // Lochrampen: lange Rampen im Zickzack, jede mit zwei Löchern. Wer hineinfällt,
  // kürzt ab — wer drüberrollt, nimmt den langen Weg. Das mischt die Reihenfolge,
  // eine geschlossene Rampe hält sie dagegen fest (alle rollen im Gänsemarsch).
  ramps(c, y, rng) {
    const count = 3 + Math.floor(rng() * 2);
    let fromLeft = rng() < 0.5;
    const hole = 62;
    for (let i = 0; i < count; i++) {
      const top = y + 30 + i * 190;
      const h1 = 100 + rng() * 70;
      const h2 = 250 + rng() * 70;
      const cuts = [[0, h1], [h1 + hole, h2], [h2 + hole, 440]];
      for (const [a, b] of cuts) {
        const ya = top + (a / 440) * 125;
        const yb = top + (b / 440) * 125;
        if (fromLeft) c.segs.push({ x1: a, y1: ya, x2: b, y2: yb });
        else c.segs.push({ x1: WORLD_W - a, y1: ya, x2: WORLD_W - b, y2: yb });
      }
      fromLeft = !fromLeft;
    }
    return count * 190 + 40;
  },

  // Reißverschluss: kurze Zähne von beiden Wänden, die sich in der Mitte überlappen
  zipper(c, y, rng) {
    const teeth = 4 + Math.floor(rng() * 2);
    let fromLeft = rng() < 0.5;
    for (let i = 0; i < teeth; i++) {
      const top = y + 30 + i * 140;
      if (fromLeft) c.segs.push({ x1: 0, y1: top, x2: 350, y2: top + 115 });
      else c.segs.push({ x1: WORLD_W, y1: top, x2: 250, y2: top + 115 });
      fromLeft = !fromLeft;
    }
    return teeth * 140 + 90;
  },

  // Drehkreuze: schleudern, was hineinfällt. Dreier- und Zweierreihe stehen auf
  // Lücke, die Keile schließen den Rand.
  spinners(c, y, rng) {
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const cy = y + 100 + r * 190;
      for (const x of r % 2 ? [200, 400] : [100, 300, 500]) {
        const dir = rng() < 0.5 ? 1 : -1;
        c.spinners.push({ x, y: cy, len: 52, arms: 2, ux: 1, uy: 0, w: (1.3 + rng() * 1.2) * dir });
      }
      // Nur die Dreierreihe braucht Keile — den Rand der Zweierreihe deckt sie mit ab
      if (r % 2 === 0) wedges(c, cy - 95);
    }
    return rows * 190 + 70;
  },

  // Propeller: einzelne schnelle Balken statt Kreuze
  propellers(c, y, rng) {
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const cy = y + 100 + r * 180;
      for (const x of r % 2 ? [150, 300, 450] : [75, 225, 375, 525]) {
        const dir = rng() < 0.5 ? 1 : -1;
        c.spinners.push({ x, y: cy, len: 64, arms: 1, ux: 1, uy: 0, w: (2.2 + rng() * 1.6) * dir });
      }
    }
    return rows * 180 + 70;
  },

  // Zwillingsräder: zwei große Kreuze gegenläufig, darunter ein Teiler
  twins(c, y, rng) {
    const w = 1.0 + rng() * 0.6;
    const dir = rng() < 0.5 ? 1 : -1;
    c.spinners.push({ x: 150, y: y + 150, len: 118, arms: 2, ux: 1, uy: 0, w: w * dir });
    c.spinners.push({ x: 450, y: y + 150, len: 118, arms: 2, ux: 1, uy: 0, w: -w * dir });
    c.pegs.push({ x: HALF, y: y + 320, r: 34, bounce: 0.7 });
    c.pegs.push({ x: 0, y: y + 320, r: 22, bounce: 0.6 });
    c.pegs.push({ x: WORLD_W, y: y + 320, r: 22, bounce: 0.6 });
    return 380;
  },

  // Mühle: ein großes, langsames Kreuz über fast die ganze Breite
  mill(c, y, rng) {
    const dir = rng() < 0.5 ? 1 : -1;
    c.spinners.push({ x: HALF, y: y + 230, len: 185, arms: 2, ux: 1, uy: 0, w: (0.8 + rng() * 0.5) * dir });
    // Lange Keile führen vom Rand in den Schwung hinein
    wedges(c, y + 10, 105);
    return 450;
  },

  // Trichter mit Teiler darunter: alles muss durch die Mitte
  funnel(c, y) {
    c.segs.push({ x1: 0, y1: y + 20, x2: 240, y2: y + 190 });
    c.segs.push({ x1: WORLD_W, y1: y + 20, x2: WORLD_W - 240, y2: y + 190 });
    c.pegs.push({ x: HALF, y: y + 300, r: 36, bounce: 0.7 });
    return 380;
  },

  // Sanduhr: erst zur Mitte, dann über ein Dach wieder nach außen
  hourglass(c, y) {
    c.segs.push({ x1: 0, y1: y + 20, x2: 262, y2: y + 170 });
    c.segs.push({ x1: WORLD_W, y1: y + 20, x2: WORLD_W - 262, y2: y + 170 });
    c.segs.push({ x1: HALF, y1: y + 235, x2: 75, y2: y + 335 });
    c.segs.push({ x1: HALF, y1: y + 235, x2: WORLD_W - 75, y2: y + 335 });
    return 380;
  },

  // Prellböcke: große federnde Scheiben in zwei Reihen auf Lücke. Die äußeren
  // sitzen halb in der Wand: ein Prellbock NEBEN der Wand bildet mit ihr eine
  // Mulde, und ein Spalt von genau Murmelbreite verklemmt sich.
  bumpers(c, y) {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const cy = y + 85 + r * 150;
      for (const x of r % 2 ? [75, 225, 375, 525] : [0, 150, 300, 450, 600]) {
        c.pegs.push({ x, y: cy, r: 34, bounce: 1.1, bumper: true });
      }
    }
    return rows * 150 + 60;
  },

  // Flipper: Schrägen von den Wänden, dazwischen Prellböcke
  pinball(c, y) {
    c.segs.push({ x1: 0, y1: y + 30, x2: 200, y2: y + 95 });
    c.segs.push({ x1: WORLD_W, y1: y + 30, x2: WORLD_W - 200, y2: y + 95 });
    c.pegs.push({ x: HALF, y: y + 120, r: 40, bounce: 1.1, bumper: true });
    c.pegs.push({ x: 222, y: y + 255, r: 34, bounce: 1.1, bumper: true });
    c.pegs.push({ x: WORLD_W - 222, y: y + 255, r: 34, bounce: 1.1, bumper: true });
    wedges(c, y + 200, 58);
    return 340;
  },

  // Trampolin: federnde Schrägen zur Mitte, darunter ein Prellbock
  trampoline(c, y) {
    c.segs.push({ x1: 0, y1: y + 60, x2: 248, y2: y + 135, bounce: 0.92, springy: true });
    c.segs.push({ x1: WORLD_W, y1: y + 60, x2: WORLD_W - 248, y2: y + 135, bounce: 0.92, springy: true });
    c.pegs.push({ x: HALF, y: y + 255, r: 42, bounce: 1.1, bumper: true });
    return 330;
  },

  // Dächer: versetzte Reihen kleiner Giebel, an denen sich der Strom teilt
  roofs(c, y, rng) {
    const rows = 4 + Math.floor(rng() * 2);
    staggered(rows, 150, (x, r) => {
      const py = y + 40 + r * 115;
      c.segs.push({ x1: x, y1: py, x2: x - 48, y2: py + 34 });
      c.segs.push({ x1: x, y1: py, x2: x + 48, y2: py + 34 });
    });
    return rows * 115 + 50;
  },

  // Rauten: versetzte Reihen auf der Spitze stehender Vierecke
  diamonds(c, y, rng) {
    const rows = 3 + Math.floor(rng() * 2);
    const h = 30;
    staggered(rows, 120, (x, r) => {
      const py = y + 60 + r * 125;
      c.segs.push({ x1: x, y1: py - h, x2: x + h, y2: py });
      c.segs.push({ x1: x + h, y1: py, x2: x, y2: py + h });
      c.segs.push({ x1: x, y1: py + h, x2: x - h, y2: py });
      c.segs.push({ x1: x - h, y1: py, x2: x, y2: py - h });
    });
    return rows * 125 + 50;
  },

  // Rost: Reihen kurzer, schräger Leisten mit Lücken dazwischen
  grate(c, y, rng) {
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const py = y + 40 + r * 95;
      const rowTilt = r % 2 ? 11 : -11;
      const shift = (r * 50 + Math.floor(rng() * 4) * 25) % 100;
      for (let x = shift - 100; x < WORLD_W; x += 100) {
        // Leisten nahe der Wand reichen bis an sie heran: ein Spalt unter
        // Murmelbreite wäre eine Falle
        const x1 = x < 40 ? 0 : x;
        const x2 = x + 56 > WORLD_W - 40 ? WORLD_W : x + 56;
        if (x2 - x1 < 24) continue;
        // An der Wand immer von ihr weg geneigt — zur Wand hin wäre es eine
        // Ecke, in der Murmeln liegen bleiben
        const tilt = x1 === 0 ? 11 : (x2 === WORLD_W ? -11 : rowTilt);
        c.segs.push({ x1, y1: py - tilt, x2, y2: py + tilt });
      }
    }
    // Zwei Reihen direkt übereinander decken sich nicht immer — die Nagelreihe
    // darunter schließt, was durchrutscht
    staggered(2, 75, (x, r) => c.pegs.push({ x, y: y + 40 + rows * 95 + r * 60, r: 9, bounce: 0.55 }));
    return rows * 95 + 150;
  },

  // Schieber: je Reihe zwei Balken, die in ihrer Hälfte hin und her fahren
  sliders(c, y, rng) {
    const rows = 3;
    const half = 72;
    for (let r = 0; r < rows; r++) {
      const sy = y + 60 + r * 140;
      for (let side = 0; side < 2; side++) {
        const min = (side ? HALF : 0) + half + 12;
        const max = (side ? WORLD_W : HALF) - half - 12;
        const speed = 110 + rng() * 100;
        c.sliders.push({
          x: min + rng() * (max - min),
          y: sy,
          half,
          // Leicht schräg, sonst fährt eine Murmel ewig obenauf mit
          tilt: (r + side) % 2 ? 9 : -9,
          v: (r + side) % 2 ? speed : -speed,
          min,
          max,
        });
      }
    }
    return rows * 140 + 60;
  },

  // Stempel: schräge Platten, die auf und ab fahren — zwei Reihen auf Lücke
  pistons(c, y, rng) {
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const base = y + 90 + r * 190;
      let k = 0;
      for (let x = r % 2 ? 0 : 60; x <= WORLD_W + 0.5; x += 120) {
        const speed = 80 + rng() * 80;
        c.pistons.push({
          x,
          y: base + (rng() - 0.5) * 80,
          half: 42,
          // Immer zur Mitte hin geneigt: zur Wand hin bliebe zwischen Platte und
          // Wand ein Spalt, in dem Murmeln festsitzen. Nur die mittlere wechselt.
          tilt: x < HALF - 1 ? 13 : (x > HALF + 1 ? -13 : (k++ % 2 ? 13 : -13)),
          v: rng() < 0.5 ? speed : -speed,
          min: base - 45,
          max: base + 45,
        });
      }
    }
    return rows * 190 + 70;
  },

  // Treppe: geneigte Böden mit je einer Lücke — davor staut es sich
  stairs(c, y, rng) {
    const rows = 4;
    let lastGap = -1;
    for (let r = 0; r < rows; r++) {
      let gap = 100 + rng() * 400;
      // Nicht zweimal an derselben Stelle, sonst fällt man einfach durch
      if (lastGap >= 0 && gap - lastGap < 140 && lastGap - gap < 140) gap = gap < 300 ? gap + 200 : gap - 200;
      lastGap = gap;
      const top = y + 20 + r * 175;
      const left = gap - 50;
      const right = gap + 50;
      c.segs.push({ x1: 0, y1: top, x2: left, y2: top + 30 + left * 0.25 });
      c.segs.push({ x1: WORLD_W, y1: top, x2: right, y2: top + 30 + (WORLD_W - right) * 0.25 });
    }
    return rows * 175 + 80;
  },

  // Schächte: fünf Röhren mit unterschiedlichem Inhalt — Glückssache, welche man
  // erwischt. Zwei Nagelreihen davor verteilen das Feld und schließen die Gassen.
  chutes(c, y, rng) {
    staggered(2, 60, (x, r) => c.pegs.push({ x, y: y + 30 + r * 52, r: 9, bounce: 0.55 }));
    const top = y + 130;
    const len = 290;
    for (let x = 120; x < WORLD_W; x += 120) c.segs.push({ x1: x, y1: top, x2: x, y2: top + len });
    // Genau eine Röhre ist frei, der Rest hält auf
    const free = Math.floor(rng() * 5);
    for (let i = 0; i < 5; i++) {
      if (i === free) continue;
      const cx = 60 + i * 120;
      const kind = Math.floor(rng() * 3);
      if (kind === 0) {
        for (let k = 0; k < 4; k++) c.pegs.push({ x: cx + (k % 2 ? 20 : -20), y: top + 45 + k * 62, r: 9, bounce: 0.5 });
      } else if (kind === 1) {
        c.pegs.push({ x: cx, y: top + 90, r: 22, bounce: 1.05, bumper: true });
        c.pegs.push({ x: cx, y: top + 215, r: 22, bounce: 1.05, bumper: true });
      } else {
        c.segs.push({ x1: cx - 60, y1: top + 50, x2: cx + 14, y2: top + 86 });
        c.segs.push({ x1: cx + 60, y1: top + 150, x2: cx - 14, y2: top + 186 });
      }
    }
    return 130 + len + 40;
  },

  // Windkanal: oben bläst es in die eine Richtung, unten in die andere; dicke
  // Nägel stehen im Weg
  wind(c, y, rng) {
    const rows = 4;
    const dir = rng() < 0.5 ? 1 : -1;
    const rowDir = (r) => (r < 2 ? dir : -dir);
    staggered(rows, 120, (x, r) => {
      // Kein Nagel an der Wand, GEGEN die der Wind drückt: dort hielte er die
      // Murmel in der Ecke fest (nachgemessen: bis zu 22 s)
      const lee = rowDir(r) > 0 ? WORLD_W : 0;
      if (x > lee - 1 && x < lee + 1) return;
      c.pegs.push({ x, y: y + 60 + r * 105, r: 20, bounce: 0.7 });
    });
    c.zones.push({ y0: y + 10, y1: y + 218, ax: dir * 420, drag: 0 });
    c.zones.push({ y0: y + 218, y1: y + 430, ax: -dir * 420, drag: 0 });
    return 460;
  },

  // Honig: ein zäher Streifen, in dem alles langsam sinkt — das Feld rückt zusammen
  honey(c, y) {
    c.zones.push({ y0: y + 30, y1: y + 190, ax: 0, drag: 9 });
    staggered(2, 150, (x, r) => c.pegs.push({ x, y: y + 80 + r * 70, r: 12, bounce: 0.3 }));
    return 230;
  },
};

const SECTION_KEYS = Object.keys(SECTIONS);
/** Länge der Bahn in Abschnitten, wenn der Server nichts vorgibt. */
const SECTION_COUNT = 12;
/** Abstand zwischen zwei Abschnitten. Bewusst knapp: Freiflug zieht das Feld auseinander. */
const SECTION_GAP = 30;
/** Abprall einer gewöhnlichen Wand. */
const SEG_BOUNCE = 0.35;

/** Sortiert ein Hindernis in alle Fächer ein, die es berührt. */
function bucket(cells, item, yMin, yMax) {
  const from = Math.max(0, Math.floor((yMin - MARBLE_R) / CELL_H));
  const to = Math.floor((yMax + MARBLE_R) / CELL_H);
  for (let k = from; k <= to; k++) {
    (cells[k] || (cells[k] = [])).push(item);
  }
}

/**
 * Reihenfolge der Abschnitte. Gezogen wird wie aus einem Beutel: erst wenn alle
 * Typen einmal dran waren, kommt einer zum zweiten Mal. So sieht keine Bahn aus
 * wie die vorige, und nichts wiederholt sich innerhalb einer Bahn unnötig.
 */
function drawSections(rng, count, pool) {
  const out = [];
  let bag = [];
  while (out.length < count) {
    if (!bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = bag[i];
        bag[i] = bag[j];
        bag[j] = t;
      }
      // Beim Nachfüllen nicht denselben Typ zweimal hintereinander
      if (out.length && bag.length > 1 && bag[bag.length - 1] === out[out.length - 1]) {
        const t = bag[0];
        bag[0] = bag[bag.length - 1];
        bag[bag.length - 1] = t;
      }
    }
    out.push(bag.pop());
  }
  return out;
}

/**
 * @param {number}   seed
 * @param {number}   sections  Länge der Bahn in Abschnitten
 * @param {string[]} pool      nur diese Abschnittstypen (zum Prüfen einzelner Typen)
 */
export function buildCourse(seed, sections = SECTION_COUNT, pool = SECTION_KEYS) {
  const rng = makeRng(seed);
  const course = {
    segs: [], pegs: [], spinners: [], sliders: [], pistons: [], zones: [],
    height: 0, finishY: 0, pegCells: [], segCells: [],
  };

  let y = 120;
  for (const key of drawSections(rng, sections, pool)) {
    y += SECTIONS[key](course, y, rng) + SECTION_GAP;
  }

  course.finishY = y + 100;
  course.height = course.finishY + 260;

  for (const p of course.pegs) bucket(course.pegCells, p, p.y - p.r, p.y + p.r);
  for (const s of course.segs) {
    if (s.bounce === undefined) s.bounce = SEG_BOUNCE;
    bucket(course.segCells, s, Math.min(s.y1, s.y2), Math.max(s.y1, s.y2));
  }
  return course;
}

/* ── Rennen ───────────────────────────────────────────────────────────────── */

/**
 * @param {number} seed      Startwert vom Server
 * @param {number} count     Zahl der Murmeln — Reihenfolge wie in der Spielerliste
 * @param {number} sections  Länge der Bahn in Abschnitten
 * @param {string[]} pool    nur diese Abschnittstypen (zum Prüfen einzelner Typen)
 */
export function createRace(seed, count, sections = SECTION_COUNT, pool = undefined) {
  const course = buildCourse(seed, sections, pool);
  // Eigener Generator für die Startaufstellung, damit die Bahn nicht von der
  // Teilnehmerzahl abhängt
  const rng = makeRng(seed ^ 0x5bd1e995);

  // Wer wo steht, wird gewürfelt — sonst hätte immer die erste Anmeldung den besten Platz
  const slots = [];
  for (let i = 0; i < count; i++) slots.push(i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = slots[i];
    slots[i] = slots[j];
    slots[j] = t;
  }

  const perRow = 10;
  const marbles = [];
  for (let i = 0; i < count; i++) marbles.push(null);
  for (let s = 0; s < count; s++) {
    const col = s % perRow;
    const row = Math.floor(s / perRow);
    marbles[slots[s]] = {
      x: 66 + col * 52 + (row % 2 ? 14 : 0),
      y: 60 - row * 34,
      vx: (rng() - 0.5) * 60,
      vy: 0,
      still: 0,
      done: false,
      finishStep: 0,
    };
  }

  return {
    course, marbles, step: 0, winStep: 0, winner: -1, finished: [],
    kick: makeRng(seed ^ 0x27d4eb2f),
    // Wie oft eine festliegende Murmel angeschubst wurde — Messwert für neue Abschnitte
    kicks: 0,
  };
}

/** Stößt eine Murmel von einem Punkt ab (Nagel, Rampenende, Drehkreuz). */
function resolve(m, px, py, radius, bounce, svx, svy) {
  const dx = m.x - px;
  const dy = m.y - py;
  const min = MARBLE_R + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;

  const d = Math.sqrt(d2);
  // Genau im Mittelpunkt gibt es keine Richtung — dann nach oben
  const nx = d > 0.0001 ? dx / d : 0;
  const ny = d > 0.0001 ? dy / d : -1;
  m.x = px + nx * min;
  m.y = py + ny * min;

  // Geschwindigkeit relativ zur (ggf. bewegten) Oberfläche
  const rvx = m.vx - svx;
  const rvy = m.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const j = (1 + bounce) * vn;
  m.vx -= j * nx;
  m.vy -= j * ny;
}

function collideSegment(m, x1, y1, x2, y2, bounce, wx, wy, w) {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((m.x - x1) * ex + (m.y - y1) * ey) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = x1 + ex * t;
  const py = y1 + ey * t;
  // Drehkreuz: der getroffene Punkt bewegt sich um die Achse (wx, wy)
  const svx = w ? -w * (py - wy) : 0;
  const svy = w ? w * (px - wx) : 0;
  resolve(m, px, py, 0, bounce, svx, svy);
}

/** Balken, der sich als Ganzes mit (vx, vy) bewegt (Schieber, Stempel). */
function collideMoving(m, x1, y1, x2, y2, bounce, vx, vy) {
  const ex = x2 - x1;
  const ey = y2 - y1;
  let t = ((m.x - x1) * ex + (m.y - y1) * ey) / (ex * ex + ey * ey);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  resolve(m, x1 + ex * t, y1 + ey * t, 0, bounce, vx, vy);
}

/** Ein fester Zeitschritt. */
export function stepRace(race) {
  if (race.winner >= 0 && race.step > race.winStep + STEPS_PER_SECOND * 6) return;
  const { course, marbles } = race;
  race.step++;

  // Schieber fahren zwischen ihren Anschlägen hin und her
  for (const s of course.sliders) {
    s.x += s.v * DT;
    if (s.x > s.max) { s.x = s.max; s.v = -s.v; }
    else if (s.x < s.min) { s.x = s.min; s.v = -s.v; }
  }

  // Stempel fahren auf und ab
  for (const p of course.pistons) {
    p.y += p.v * DT;
    if (p.y > p.max) { p.y = p.max; p.v = -p.v; }
    else if (p.y < p.min) { p.y = p.min; p.v = -p.v; }
  }

  // Drehkreuze weiterdrehen: kleine Drehung, danach auf Länge 1 zurückholen
  for (const s of course.spinners) {
    const a = s.w * DT;
    const ux = s.ux - s.uy * a;
    const uy = s.uy + s.ux * a;
    const n = Math.sqrt(ux * ux + uy * uy);
    s.ux = ux / n;
    s.uy = uy / n;
  }

  // Mitte des Felds — Bezugspunkt fürs Aufholen
  let sumY = 0;
  let alive = 0;
  for (let i = 0; i < marbles.length; i++) {
    if (marbles[i].done) continue;
    sumY += marbles[i].y;
    alive++;
  }
  const meanY = alive ? sumY / alive : 0;

  const damp = 1 - DRAG * DT;
  for (let i = 0; i < marbles.length; i++) {
    const m = marbles[i];
    if (m.done) continue;

    let ahead = (m.y - meanY) / CATCHUP_SPAN;
    if (ahead > 1) ahead = 1; else if (ahead < -1) ahead = -1;
    m.vy += GRAVITY * (1 - CATCHUP * ahead) * DT;
    m.vx *= damp;
    m.vy *= damp;
    // Windkanal und Honig
    for (const z of course.zones) {
      if (m.y < z.y0 || m.y > z.y1) continue;
      m.vx += z.ax * DT;
      if (z.drag) {
        const slow = 1 - z.drag * DT;
        m.vx *= slow;
        m.vy *= slow;
      }
    }
    const sp2 = m.vx * m.vx + m.vy * m.vy;
    if (sp2 > MAX_SPEED * MAX_SPEED) {
      const k = MAX_SPEED / Math.sqrt(sp2);
      m.vx *= k;
      m.vy *= k;
    }
    m.x += m.vx * DT;
    m.y += m.vy * DT;

    if (m.x < MARBLE_R) { m.x = MARBLE_R; if (m.vx < 0) m.vx = -m.vx * 0.5; }
    else if (m.x > WORLD_W - MARBLE_R) { m.x = WORLD_W - MARBLE_R; if (m.vx > 0) m.vx = -m.vx * 0.5; }

    const cell = Math.floor(m.y / CELL_H);
    if (cell >= 0) {
      const pegs = course.pegCells[cell];
      if (pegs) for (const p of pegs) resolve(m, p.x, p.y, p.r, p.bounce, 0, 0);
      const segs = course.segCells[cell];
      if (segs) for (const s of segs) collideSegment(m, s.x1, s.y1, s.x2, s.y2, s.bounce, 0, 0, 0);
    }
    for (const s of course.spinners) {
      const dy = m.y - s.y;
      if (dy > s.len + MARBLE_R || dy < -s.len - MARBLE_R) continue;
      const ax = s.ux * s.len;
      const ay = s.uy * s.len;
      // Ein Balken (Propeller) oder zwei über Kreuz
      collideSegment(m, s.x - ax, s.y - ay, s.x + ax, s.y + ay, 0.5, s.x, s.y, s.w);
      if (s.arms === 2) collideSegment(m, s.x + ay, s.y - ax, s.x - ay, s.y + ax, 0.5, s.x, s.y, s.w);
    }
    for (const s of course.sliders) {
      const dy = m.y - s.y;
      if (dy > 30 || dy < -30) continue;
      collideMoving(m, s.x - s.half, s.y - s.tilt, s.x + s.half, s.y + s.tilt, 0.3, s.v, 0);
    }
    for (const p of course.pistons) {
      const dy = m.y - p.y;
      if (dy > 30 || dy < -30) continue;
      collideMoving(m, p.x - p.half, p.y - p.tilt, p.x + p.half, p.y + p.tilt, 0.3, 0, p.v);
    }
  }

  // Murmeln untereinander. Bis 80 Stück reicht der einfache Paarvergleich.
  const min = MARBLE_R * 2;
  for (let i = 0; i < marbles.length; i++) {
    const a = marbles[i];
    if (a.done) continue;
    for (let k = i + 1; k < marbles.length; k++) {
      const b = marbles[k];
      if (b.done) continue;
      const dy = b.y - a.y;
      if (dy > min || dy < -min) continue;
      const dx = b.x - a.x;
      if (dx > min || dx < -min) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;

      const d = Math.sqrt(d2);
      const nx = d > 0.0001 ? dx / d : 1;
      const ny = d > 0.0001 ? dy / d : 0;
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;

      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const j = (1 + 0.6) * vn / 2;
      a.vx += j * nx; a.vy += j * ny;
      b.vx -= j * nx; b.vy -= j * ny;
    }
  }

  for (let i = 0; i < marbles.length; i++) {
    const m = marbles[i];
    if (m.done) continue;

    // Liegt eine Murmel fest (etwa genau auf einem Nagel), bekommt sie einen Schubs
    if (m.vx * m.vx + m.vy * m.vy < 400) m.still++; else m.still = 0;
    if (m.still > STUCK_STEPS) {
      m.still = 0;
      race.kicks++;
      m.vx = (race.kick() < 0.5 ? -1 : 1) * 160;
      m.vy = -220;
    }

    if (m.y >= course.finishY) {
      m.done = true;
      m.finishStep = race.step;
      race.finished.push(i);
      if (race.winner < 0) { race.winner = i; race.winStep = race.step; }
    }
  }

  // Notbremse: sollte wider Erwarten niemand ankommen, gewinnt die vorderste
  if (race.winner < 0 && race.step >= TIMEOUT_STEPS) {
    let best = 0;
    for (let i = 1; i < marbles.length; i++) if (marbles[i].y > marbles[best].y) best = i;
    race.winner = best;
    race.winStep = race.step;
  }
}

/** Reihenfolge von vorn nach hinten: erst die im Ziel, dann nach Fortschritt. */
export function ranking(race) {
  const rest = [];
  for (let i = 0; i < race.marbles.length; i++) if (!race.marbles[i].done) rest.push(i);
  rest.sort((a, b) => race.marbles[b].y - race.marbles[a].y || a - b);
  return race.finished.concat(rest);
}
