// engine/formations.js — Aufstellungen: fünf Scheiben (meist Torwart + vier Feldspieler). Angegeben für das LINKE
// Team als Anteil der Feldlänge (x, 0 = eigene Torlinie, 0,5 = Mittellinie) und Feldbreite (y). Das rechte Team wird
// gespiegelt. Alle Plätze liegen außerhalb des Mittelkreises, damit der Anstoß frei ist (engine.test.js prüft das).
// `code` ist die Kurzform für die Anzeige; die Schlüssel sind gespeicherte IDs (Browser-Einstellungen, Online-Räume) —
// nie umbenennen, nur neue hinzufügen.
//
// Eigene Aufstellungen sind ebenfalls nur eine Zeichenkette: "c:" + fünfmal (x, y) in Tausendsteln, je drei Ziffern.
// So passen sie überall hin, wo sonst eine ID steht (Einstellungen, Online-Protokoll), und der Server prüft sie mit
// derselben Funktion wie der Editor (customProblem).

import { FIELD, PIECE, TEAM_SIZE } from './constants.js';
import { FIELDS, FIELD_IDS } from './fields.js';

export const FORMATIONS = Object.freeze({
  '2-2': {
    name: 'Klassisch',
    code: '2-2',
    hint: 'Ausgewogen: zwei hinten, zwei vorne',
    spots: [[0.06, 0.5], [0.19, 0.3], [0.19, 0.7], [0.36, 0.22], [0.36, 0.78]],
  },
  '1-2-1': {
    name: 'Raute',
    code: '1-2-1',
    hint: 'Eine Spitze, die Mitte dicht',
    spots: [[0.06, 0.5], [0.17, 0.5], [0.28, 0.24], [0.28, 0.76], [0.37, 0.5]],
  },
  V: {
    name: 'Trichter',
    code: 'V',
    hint: 'V-Form: der Torwart ist die Spitze, die Flügel öffnen sich nach vorne',
    spots: [[0.06, 0.5], [0.17, 0.34], [0.17, 0.66], [0.29, 0.17], [0.29, 0.83]],
  },
  'reverse-v': {
    name: 'Umkehr-V',
    code: 'Λ',
    hint: 'Umgekehrtes V ohne Torwart: breit hinten, eine Spitze vorne',
    spots: [[0.15, 0.16], [0.15, 0.84], [0.26, 0.33], [0.26, 0.67], [0.37, 0.5]],
  },
  '3-1': {
    name: 'Bollwerk',
    code: '3-1',
    hint: 'Drei Verteidiger vor dem Tor',
    spots: [[0.06, 0.5], [0.17, 0.24], [0.15, 0.5], [0.17, 0.76], [0.36, 0.5]],
  },
  '1-3': {
    name: 'Sturm',
    code: '1-3',
    hint: 'Drei Angreifer an der Mittellinie',
    spots: [[0.06, 0.5], [0.19, 0.5], [0.36, 0.18], [0.37, 0.5], [0.36, 0.82]],
  },
  '2-1-1': {
    name: 'Pfeil',
    code: '2-1-1',
    hint: 'Gestaffelt durch die Mitte',
    spots: [[0.06, 0.5], [0.16, 0.32], [0.16, 0.68], [0.255, 0.5], [0.37, 0.5]],
  },
  zange: {
    name: 'Zange',
    code: '2+2',
    hint: 'Alles über die Flügel, die Mitte bleibt offen',
    spots: [[0.06, 0.5], [0.17, 0.16], [0.17, 0.84], [0.34, 0.12], [0.34, 0.88]],
  },
  schraege: {
    name: 'Schräge',
    code: '/',
    hint: 'Eine diagonale Kette quer übers Feld',
    spots: [[0.06, 0.5], [0.14, 0.82], [0.21, 0.6], [0.28, 0.38], [0.35, 0.16]],
  },
  '4-0': {
    name: 'Mauer',
    code: '4-0',
    hint: 'Alles vor dem eigenen Tor',
    spots: [[0.05, 0.5], [0.15, 0.17], [0.15, 0.39], [0.15, 0.61], [0.15, 0.83]],
  },
});

export const FORMATION_IDS = Object.freeze(Object.keys(FORMATIONS));
export const DEFAULT_FORMATION = '2-2';

// ── Eigene Aufstellungen ──────────────────────────────────────────────────────────────────

const CUSTOM_RE = /^c:\d{30}$/;
const CUSTOM_INFO = Object.freeze({ name: 'Eigene', code: 'Eigen', hint: 'Deine eigene Aufstellung' });

/** [[fx, fy] × 5] (Anteile 0…1) → Zeichenkette. Rundet auf Tausendstel. */
export function encodeCustom(spots) {
  const part = (v) => String(Math.max(0, Math.min(999, Math.round(v * 1000)))).padStart(3, '0');
  return `c:${spots.map(([fx, fy]) => part(fx) + part(fy)).join('')}`;
}

/** Zeichenkette → [[fx, fy] × 5] oder null, wenn sie nicht das Format einer eigenen Aufstellung hat. */
export function parseCustom(id) {
  if (typeof id !== 'string' || !CUSTOM_RE.test(id)) return null;
  const spots = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    spots.push([Number(id.slice(2 + i * 6, 5 + i * 6)) / 1000, Number(id.slice(5 + i * 6, 8 + i * 6)) / 1000]);
  }
  return spots;
}

function segmentDistance(px, py, w) {
  const ex = w[2] - w[0];
  const ey = w[3] - w[1];
  let t = ((px - w[0]) * ex + (py - w[1]) * ey) / (ex * ex + ey * ey);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (w[0] + ex * t);
  const dy = py - (w[1] + ey * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Prüft fünf Plätze (für das linke Team) auf JEDEM Feld: eigene Hälfte, frei von Banden, Mittelkreis, Hindernissen,
 * Portalen und voneinander. Liefert null, wenn alles passt, sonst { index, reason, field } zum ersten Problem —
 * index ist die betroffene Scheibe.
 */
export function customProblem(spots) {
  if (!Array.isArray(spots) || spots.length !== TEAM_SIZE) return { index: 0, reason: 'Es müssen genau fünf Scheiben sein', field: null };
  const R = PIECE.R;
  for (const fid of FIELD_IDS) {
    const f = FIELDS[fid];
    const pts = spots.map(([fx, fy]) => ({ x: fx * f.W, y: fy * f.H }));
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const bad = (reason) => ({ index: i, reason, field: fid });
      if (!(p.x - R >= 2)) return bad('Zu nah am eigenen Tor');
      if (!(p.x + R <= f.W / 2 - 2)) return bad('Nur in der eigenen Hälfte');
      if (!(p.y - R >= 2 && p.y + R <= f.H - 2)) return bad('Zu nah an der Bande');
      const dc = Math.sqrt((p.x - f.W / 2) * (p.x - f.W / 2) + (p.y - f.H / 2) * (p.y - f.H / 2));
      if (!(dc > f.CENTER_R + R + 2)) return bad('Der Mittelkreis bleibt frei');
      for (const w of f.walls) if (segmentDistance(p.x, p.y, w) < R + 1) return bad(`Zu nah an der Bande (Feld ${f.name})`);
      for (const b of f.bumpers) {
        if (Math.sqrt((p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y)) <= b.r + R + 4) return bad(`Dort steht ein Hindernis (Feld ${f.name})`);
      }
      for (const q of f.portals) {
        if (Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y)) <= q.r + R + 4) return bad(`Dort liegt ein Portal (Feld ${f.name})`);
      }
      for (let j = 0; j < i; j++) {
        const d = Math.sqrt((p.x - pts[j].x) * (p.x - pts[j].x) + (p.y - pts[j].y) * (p.y - pts[j].y));
        if (d <= 2 * R + 4) return bad(fid === 'standard' ? 'Scheiben brauchen etwas Abstand' : `Scheiben zu dicht (Feld ${f.name})`);
      }
    }
  }
  return null;
}

// Ergebnis je Zeichenkette merken — isFormation läuft bei jedem Neuzeichnen
const customCache = new Map();

/** Ist `id` eine gültige eigene Aufstellung? */
export function isCustomFormation(id) {
  if (typeof id !== 'string' || !id.startsWith('c:')) return false;
  let ok = customCache.get(id);
  if (ok === undefined) {
    const spots = parseCustom(id);
    ok = !!spots && customProblem(spots) === null;
    if (customCache.size > 200) customCache.clear();
    customCache.set(id, ok);
  }
  return ok;
}

export function isFormation(id) {
  return typeof id === 'string' && (Object.prototype.hasOwnProperty.call(FORMATIONS, id) || isCustomFormation(id));
}

/** Name, Kurzform, Hinweis und Plätze einer Aufstellung (auch einer eigenen); unbekannt → Klassisch. */
export function formationInfo(id) {
  if (isCustomFormation(id)) return { ...CUSTOM_INFO, spots: parseCustom(id), custom: true };
  return FORMATIONS[Object.prototype.hasOwnProperty.call(FORMATIONS, id) ? id : DEFAULT_FORMATION];
}

/** Feld-Koordinaten der fünf Scheiben eines Teams (0 = links, 1 = rechts); field = Geometrie aus fields.js. */
export function formationSpots(id, team, field = FIELD) {
  return formationInfo(id).spots.map(([fx, fy]) => {
    const x = fx * field.W;
    return { x: team === 0 ? x : field.W - x, y: fy * field.H, team };
  });
}
