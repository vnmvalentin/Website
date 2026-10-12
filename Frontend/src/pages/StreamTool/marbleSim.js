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

/**
 * Keile an beiden Wänden. Ohne sie bleibt in vielen Abschnitten am Rand eine
 * freie Gasse, durch die eine Murmel ungebremst an allem vorbeifällt.
 */
function wedges(c, y) {
  c.segs.push({ x1: 0, y1: y, x2: 58, y2: y + 46 });
  c.segs.push({ x1: WORLD_W, y1: y, x2: WORLD_W - 58, y2: y + 46 });
}

/** Die Abschnitte, aus denen eine Bahn gewürfelt wird. Jeder gibt seine Höhe zurück. */
const SECTIONS = {
  // Nagelbrett: versetzte Reihen, klassisches Galtonbrett
  pegs(c, y, rng) {
    const rows = 6 + Math.floor(rng() * 3);
    for (let r = 0; r < rows; r++) {
      const shifted = r % 2 === 1;
      const py = y + 40 + r * 72;
      for (let x = 37.5 + (shifted ? 37.5 : 0); x < WORLD_W - 20; x += 75) {
        c.pegs.push({ x, y: py, r: 9, bounce: 0.55 });
      }
      // In den versetzten Reihen sitzt ein Nagel in der Wand — sonst bliebe
      // dort die freie Gasse
      if (shifted) {
        c.pegs.push({ x: 0, y: py, r: 9, bounce: 0.55 });
        c.pegs.push({ x: WORLD_W, y: py, r: 9, bounce: 0.55 });
      }
    }
    return rows * 72 + 60;
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

  // Drehkreuze: schleudern, was hineinfällt
  spinners(c, y, rng) {
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const count = r % 2 ? 2 : 3;
      const cy = y + 100 + r * 190;
      for (let i = 0; i < count; i++) {
        const x = (WORLD_W / (count + 1)) * (i + 1);
        const dir = rng() < 0.5 ? 1 : -1;
        const speed = (1.3 + rng() * 1.2) * dir;
        c.spinners.push({ x, y: cy, len: 52, ux: 1, uy: 0, w: speed });
      }
      wedges(c, cy - 95);
    }
    return rows * 190 + 70;
  },

  // Trichter mit Teiler darunter: alles muss durch die Mitte
  funnel(c, y) {
    c.segs.push({ x1: 0, y1: y + 20, x2: 235, y2: y + 190 });
    c.segs.push({ x1: WORLD_W, y1: y + 20, x2: WORLD_W - 235, y2: y + 190 });
    c.pegs.push({ x: WORLD_W / 2, y: y + 300, r: 30, bounce: 0.7 });
    return 380;
  },

  // Prellböcke: wenige große, federnde Scheiben
  bumpers(c, y, rng) {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const count = r % 2 ? 2 : 3;
      const cy = y + 80 + r * 150;
      for (let i = 0; i < count; i++) {
        const x = (WORLD_W / (count + 1)) * (i + 1) + (rng() - 0.5) * 50;
        c.pegs.push({ x, y: cy, r: 32, bounce: 1.12, bumper: true });
      }
      wedges(c, cy - 70);
    }
    return rows * 150 + 60;
  },

  // Schieber: je Reihe zwei Balken, die in ihrer Hälfte hin und her fahren
  sliders(c, y, rng) {
    const rows = 3;
    const half = 72;
    const mid = WORLD_W / 2;
    for (let r = 0; r < rows; r++) {
      const sy = y + 60 + r * 140;
      for (let side = 0; side < 2; side++) {
        const min = (side ? mid : 0) + half + 12;
        const max = (side ? WORLD_W : mid) - half - 12;
        const speed = 110 + rng() * 100;
        c.sliders.push({
          x: min + rng() * (max - min),
          y: sy,
          half,
          v: (r + side) % 2 ? speed : -speed,
          min,
          max,
        });
      }
    }
    return rows * 140 + 60;
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
      c.segs.push({ x1: 0, y1: top, x2: left, y2: top + 30 + left * 0.17 });
      c.segs.push({ x1: WORLD_W, y1: top, x2: right, y2: top + 30 + (WORLD_W - right) * 0.17 });
    }
    return rows * 175 + 40;
  },

  // Mühle: ein großes, langsames Kreuz über fast die ganze Breite
  mill(c, y, rng) {
    const dir = rng() < 0.5 ? 1 : -1;
    c.spinners.push({ x: WORLD_W / 2, y: y + 220, len: 185, ux: 1, uy: 0, w: (0.8 + rng() * 0.5) * dir });
    return 440;
  },
};

const SECTION_KEYS = Object.keys(SECTIONS);
/** Länge der Bahn in Abschnitten, wenn der Server nichts vorgibt. */
const SECTION_COUNT = 12;
/** Abstand zwischen zwei Abschnitten. Bewusst knapp: Freiflug zieht das Feld auseinander. */
const SECTION_GAP = 30;

/** Sortiert ein Hindernis in alle Fächer ein, die es berührt. */
function bucket(cells, item, yMin, yMax) {
  const from = Math.max(0, Math.floor((yMin - MARBLE_R) / CELL_H));
  const to = Math.floor((yMax + MARBLE_R) / CELL_H);
  for (let k = from; k <= to; k++) {
    (cells[k] || (cells[k] = [])).push(item);
  }
}

export function buildCourse(seed, sections = SECTION_COUNT) {
  const rng = makeRng(seed);
  const course = {
    segs: [], pegs: [], spinners: [], sliders: [],
    height: 0, finishY: 0, pegCells: [], segCells: [],
  };

  let y = 120;
  let last = '';
  for (let i = 0; i < sections; i++) {
    let key = SECTION_KEYS[Math.floor(rng() * SECTION_KEYS.length)];
    // Nie zweimal dasselbe hintereinander
    if (key === last) key = SECTION_KEYS[(SECTION_KEYS.indexOf(key) + 1) % SECTION_KEYS.length];
    last = key;
    y += SECTIONS[key](course, y, rng) + SECTION_GAP;
  }

  course.finishY = y + 100;
  course.height = course.finishY + 260;

  for (const p of course.pegs) bucket(course.pegCells, p, p.y - p.r, p.y + p.r);
  for (const s of course.segs) bucket(course.segCells, s, Math.min(s.y1, s.y2), Math.max(s.y1, s.y2));
  return course;
}

/* ── Rennen ───────────────────────────────────────────────────────────────── */

/**
 * @param {number} seed      Startwert vom Server
 * @param {number} count     Zahl der Murmeln — Reihenfolge wie in der Spielerliste
 * @param {number} sections  Länge der Bahn in Abschnitten
 */
export function createRace(seed, count, sections = SECTION_COUNT) {
  const course = buildCourse(seed, sections);
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

  return { course, marbles, step: 0, winStep: 0, winner: -1, finished: [], kick: makeRng(seed ^ 0x27d4eb2f) };
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

/** Waagerechter Balken, der sich mit vx seitlich bewegt (Schieber). */
function collideMoving(m, x1, y1, x2, bounce, vx) {
  let px = m.x;
  if (px < x1) px = x1; else if (px > x2) px = x2;
  resolve(m, px, y1, 0, bounce, vx, 0);
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
      if (segs) for (const s of segs) collideSegment(m, s.x1, s.y1, s.x2, s.y2, 0.35, 0, 0, 0);
    }
    for (const s of course.spinners) {
      const dy = m.y - s.y;
      if (dy > s.len + MARBLE_R || dy < -s.len - MARBLE_R) continue;
      const ax = s.ux * s.len;
      const ay = s.uy * s.len;
      // Zwei Balken über Kreuz
      collideSegment(m, s.x - ax, s.y - ay, s.x + ax, s.y + ay, 0.5, s.x, s.y, s.w);
      collideSegment(m, s.x + ay, s.y - ax, s.x - ay, s.y + ax, 0.5, s.x, s.y, s.w);
    }
    for (const s of course.sliders) {
      const dy = m.y - s.y;
      if (dy > MARBLE_R || dy < -MARBLE_R) continue;
      collideMoving(m, s.x - s.half, s.y, s.x + s.half, 0.3, s.v);
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
