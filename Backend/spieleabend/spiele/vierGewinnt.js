// spieleabend/spiele/vierGewinnt.js — Regeln von 4 gewinnt für den Spieleabend, ohne Netz und ohne Zufall von außen.
//
// Jedes Spiel des Spieleabends ist so ein Modul (der Raum in zimmer.js kennt nur diese Schnittstelle):
//   id, name, plaetze (Stühle am Tisch), neu({ beginner }) → Zustand, amZug(z) → Platz | null,
//   zug(z, platz, aktion) → { ok, error? } (ändert z), botZug(z, platz, stufe, random) → aktion, sicht(z) → für alle,
//   ende(z) → null | { sieger: Platz | null }  (null = läuft noch; sieger null = unentschieden)
//
// Brett: 6 Reihen × 7 Spalten, Reihe 0 oben. 0 = leer, 1 = Platz 0 (Rot), 2 = Platz 1 (Gelb).

const REIHEN = 6;
const SPALTEN = 7;
const STUFEN = ["leicht", "mittel", "schwer"];
// Suchtiefe und Patzer-Anteil je Stufe. „schwer“ rechnet 7 Halbzüge voraus (unter 50 ms je Zug, siehe Test).
const BOT = {
  leicht: { tiefe: 2, patzer: 0.3 },
  mittel: { tiefe: 4, patzer: 0.08 },
  schwer: { tiefe: 7, patzer: 0 },
};
const MITTE_ZUERST = [3, 2, 4, 1, 5, 0, 6];

function leeresBrett() {
  return Array.from({ length: REIHEN }, () => Array(SPALTEN).fill(0));
}

/** Reihe, in die ein Stein in dieser Spalte fällt, oder -1 (voll). */
function zielReihe(brett, spalte) {
  for (let r = REIHEN - 1; r >= 0; r -= 1) if (brett[r][spalte] === 0) return r;
  return -1;
}

/** Vier (oder mehr) in einer Reihe durch (reihe, spalte)? Gibt die Zellen zurück, sonst null. */
function gewinnReihe(brett, reihe, spalte) {
  const stein = brett[reihe][spalte];
  if (!stein) return null;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const zellen = [[reihe, spalte]];
    for (const s of [1, -1]) {
      let r = reihe + dr * s;
      let c = spalte + dc * s;
      while (r >= 0 && r < REIHEN && c >= 0 && c < SPALTEN && brett[r][c] === stein) {
        zellen.push([r, c]);
        r += dr * s;
        c += dc * s;
      }
    }
    if (zellen.length >= 4) return zellen.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  return null;
}

function neu({ beginner = 0 } = {}) {
  return {
    brett: leeresBrett(),
    amZug: beginner === 1 ? 1 : 0,
    beginner: beginner === 1 ? 1 : 0,
    zuege: 0,
    fertig: false,
    sieger: null,
    reihe: [],
    letzter: null, // { spalte, reihe, platz, nr }
  };
}

const amZug = (z) => (z.fertig ? null : z.amZug);

function zug(z, platz, aktion) {
  if (z.fertig) return { ok: false, error: "Die Partie ist vorbei." };
  if (platz !== z.amZug) return { ok: false, error: "Du bist nicht dran." };
  const spalte = Number(aktion?.spalte);
  if (!Number.isInteger(spalte) || spalte < 0 || spalte >= SPALTEN) return { ok: false, error: "Ungültige Spalte." };
  const reihe = zielReihe(z.brett, spalte);
  if (reihe < 0) return { ok: false, error: "Die Spalte ist voll." };
  z.brett[reihe][spalte] = platz + 1;
  z.zuege += 1;
  z.letzter = { spalte, reihe, platz, nr: z.zuege };
  const reiheGewonnen = gewinnReihe(z.brett, reihe, spalte);
  if (reiheGewonnen) {
    z.fertig = true;
    z.sieger = platz;
    z.reihe = reiheGewonnen;
  } else if (z.zuege >= REIHEN * SPALTEN) {
    z.fertig = true;
    z.sieger = null;
  } else {
    z.amZug = 1 - platz;
  }
  return { ok: true };
}

const ende = (z) => (z.fertig ? { sieger: z.sieger } : null);

function sicht(z) {
  return {
    brett: z.brett.map((r) => r.slice()),
    amZug: amZug(z),
    beginner: z.beginner,
    zuege: z.zuege,
    sieger: z.sieger,
    fertig: z.fertig,
    reihe: z.reihe,
    letzter: z.letzter,
  };
}

// ── Bot: Negamax mit Alpha-Beta auf einem kopierten Brett ────────────────────────────────────

// Bewertung eines Fensters aus vier Zellen für Stein s (o = Gegner)
function fenster(a, b, c, d, s, o) {
  let eigen = 0;
  let fremd = 0;
  for (const v of [a, b, c, d]) {
    if (v === s) eigen += 1;
    else if (v === o) fremd += 1;
  }
  if (eigen && fremd) return 0;
  if (eigen === 3) return 5;
  if (eigen === 2) return 2;
  if (fremd === 3) return -4;
  if (fremd === 2) return -1;
  return 0;
}

function bewerte(brett, s) {
  const o = 3 - s;
  let wert = 0;
  for (let r = 0; r < REIHEN; r += 1) {
    if (brett[r][3] === s) wert += 3;
    else if (brett[r][3] === o) wert -= 3;
  }
  for (let r = 0; r < REIHEN; r += 1) {
    for (let c = 0; c < SPALTEN; c += 1) {
      if (c + 3 < SPALTEN) wert += fenster(brett[r][c], brett[r][c + 1], brett[r][c + 2], brett[r][c + 3], s, o);
      if (r + 3 < REIHEN) wert += fenster(brett[r][c], brett[r + 1][c], brett[r + 2][c], brett[r + 3][c], s, o);
      if (r + 3 < REIHEN && c + 3 < SPALTEN) wert += fenster(brett[r][c], brett[r + 1][c + 1], brett[r + 2][c + 2], brett[r + 3][c + 3], s, o);
      if (r + 3 < REIHEN && c - 3 >= 0) wert += fenster(brett[r][c], brett[r + 1][c - 1], brett[r + 2][c - 2], brett[r + 3][c - 3], s, o);
    }
  }
  return wert;
}

const SIEG = 100000;

function negamax(brett, s, tiefe, alpha, beta, frei) {
  if (frei === 0) return 0;
  if (tiefe === 0) return bewerte(brett, s);
  let best = -Infinity;
  for (const c of MITTE_ZUERST) {
    const r = zielReihe(brett, c);
    if (r < 0) continue;
    brett[r][c] = s;
    // schneller gewonnen ist besser: Restiefe zählt mit
    const w = gewinnReihe(brett, r, c) ? SIEG + tiefe : -negamax(brett, 3 - s, tiefe - 1, -beta, -alpha, frei - 1);
    brett[r][c] = 0;
    if (w > best) best = w;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Werte aller spielbaren Spalten für den Stein des Platzes. */
function spaltenWerte(z, platz, tiefe) {
  const brett = z.brett.map((r) => r.slice());
  const s = platz + 1;
  const frei = REIHEN * SPALTEN - z.zuege;
  const werte = [];
  for (const c of MITTE_ZUERST) {
    const r = zielReihe(brett, c);
    if (r < 0) continue;
    brett[r][c] = s;
    const w = gewinnReihe(brett, r, c) ? SIEG + tiefe : -negamax(brett, 3 - s, tiefe - 1, -Infinity, Infinity, frei - 1);
    brett[r][c] = 0;
    werte.push({ spalte: c, wert: w });
  }
  return werte;
}

function botZug(z, platz, stufe = "mittel", random = Math.random) {
  const cfg = BOT[stufe] || BOT.mittel;
  const werte = spaltenWerte(z, platz, cfg.tiefe);
  if (!werte.length) return { spalte: 0 };
  const best = Math.max(...werte.map((w) => w.wert));
  // Patzer: irgendeine Spalte, die nicht sofort verliert — Gewinnzüge sieht aber auch der leichte Bot
  if (best < SIEG && random() < cfg.patzer) {
    const ok = werte.filter((w) => w.wert > -SIEG);
    const pool = ok.length ? ok : werte;
    return { spalte: pool[Math.floor(random() * pool.length)].spalte };
  }
  const beste = werte.filter((w) => w.wert === best);
  return { spalte: beste[Math.floor(random() * beste.length)].spalte };
}

module.exports = {
  id: "vierGewinnt",
  name: "4 gewinnt",
  plaetze: 2,
  STUFEN,
  REIHEN,
  SPALTEN,
  neu,
  amZug,
  zug,
  ende,
  sicht,
  botZug,
  _intern: { gewinnReihe, zielReihe, bewerte, spaltenWerte },
};
