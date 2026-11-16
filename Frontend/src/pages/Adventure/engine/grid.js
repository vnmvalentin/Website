// engine/grid.js — Raumgitter für Gegner und Hindernisse. Ohne Gitter prüft jede Abfrage ("wer steht hier?") alle
// Gegner, und der Abstand zueinander jedes Paar: bei 600 Gegnern kostete ein Tick 12 ms (gemessen November 2026).
// Mit Gitter schaut jede Abfrage nur in die Zellen rund um den Punkt.
//
// Das Gitter baut sich von selbst neu, sobald sich die Liste ändert (andere Liste, andere Länge) oder jemand
// markGridDirty() ruft — das macht updateEnemies nach dem Bewegen. Tote Gegner bleiben bis zum Aufräumen in der Liste
// und werden beim Abfragen übersprungen. Große Figuren (Bosse, Kolosse) passen nicht in eine Zelle und liegen in einer
// eigenen kurzen Liste, die jede Abfrage zusätzlich durchgeht.

const ENEMY_CELL = 96;
const OBSTACLE_CELL = 128;

function createGrid(cell) {
  return { cell, bigR: cell / 2, src: null, n: -1, w: 0, h: 0, dirty: true, cols: 0, rows: 0, head: new Int32Array(0), next: new Int32Array(0), big: [] };
}

function sync(gr, list, w, h) {
  if (gr.src === list && gr.n === list.length && gr.w === w && gr.h === h && !gr.dirty) return gr;
  const cell = gr.cell;
  const cols = Math.max(1, Math.ceil(w / cell) + 1), rows = Math.max(1, Math.ceil(h / cell) + 1);
  if (gr.head.length !== cols * rows) gr.head = new Int32Array(cols * rows);
  gr.head.fill(-1);
  if (gr.next.length < list.length) gr.next = new Int32Array(Math.max(64, list.length * 2));
  gr.cols = cols; gr.rows = rows; gr.src = list; gr.n = list.length; gr.w = w; gr.h = h; gr.dirty = false;
  gr.big.length = 0;
  const { head, next, bigR } = gr;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (e.r > bigR) { gr.big.push(e); continue; }
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(e.x / cell)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(e.y / cell)));
    const c = cy * cols + cx;
    next[i] = head[c];
    head[c] = i;
  }
  return gr;
}

// Alle Einträge, deren Kreis den Kreis (x, y, r) berührt — in die übergebene Liste (wird vorher geleert)
function collect(gr, x, y, r, out) {
  out.length = 0;
  const { cell, cols, rows, head, next, src } = gr;
  const R = r + gr.bigR;
  const x0 = Math.min(cols - 1, Math.max(0, Math.floor((x - R) / cell))), x1 = Math.min(cols - 1, Math.max(0, Math.floor((x + R) / cell)));
  const y0 = Math.min(rows - 1, Math.max(0, Math.floor((y - R) / cell))), y1 = Math.min(rows - 1, Math.max(0, Math.floor((y + R) / cell)));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (let i = head[cy * cols + cx]; i !== -1; i = next[i]) {
        const e = src[i];
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, rr = r + e.r;
        if (dx * dx + dy * dy < rr * rr) out.push(e);
      }
    }
  }
  for (const e of gr.big) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, rr = r + e.r;
    if (dx * dx + dy * dy < rr * rr) out.push(e);
  }
  return out;
}

// ── Gegner ──────────────────────────────────────────────────────────────────
export function enemyGrid(g) {
  return sync(g.grid || (g.grid = createGrid(ENEMY_CELL)), g.enemies, g.world.w, g.world.h);
}

// Nach jedem Bewegen der Gegner rufen: die Zellen stimmen sonst nicht mehr
export function markGridDirty(g) {
  if (g.grid) g.grid.dirty = true;
}

// Gegner, deren Kreis (x, y, r) berührt. `out` ist eine Liste des Aufrufers, die wiederverwendet wird — wer in der
// Schleife darüber weitere Abfragen auslöst (Schaden → Item-Effekte), braucht dafür eine eigene Liste.
export function collectEnemies(g, x, y, r, out) {
  return collect(enemyGrid(g), x, y, r, out);
}

// Nächster lebender, verwundbarer Gegner (Abstand der Mittelpunkte). Sucht Ring für Ring nach außen und hört auf,
// sobald kein weiter entfernter Ring mehr näher sein kann.
export function nearestInGrid(g, x, y, maxR, exclude) {
  const gr = enemyGrid(g);
  const { cell, cols, rows, head, next, src } = gr;
  const isSet = exclude instanceof Set;
  let best = null;
  let bd = maxR * maxR;
  const check = (e) => {
    if (e.dead || e.invuln || e === exclude || (isSet && exclude.has(e))) return;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  };
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cell))), cy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
  const maxK = Math.min(Math.max(cols, rows), Number.isFinite(maxR) ? Math.ceil(maxR / cell) + 1 : Infinity);
  for (let k = 0; k <= maxK; k++) {
    // Zellen im Ring k sind mindestens (k − 1) Zellen entfernt
    if (k > 0 && bd <= (k - 1) * cell * (k - 1) * cell) break;
    for (let yy = cy - k; yy <= cy + k; yy++) {
      if (yy < 0 || yy >= rows) continue;
      const edge = yy === cy - k || yy === cy + k;
      for (let xx = cx - k; xx <= cx + k; xx += edge || k === 0 ? 1 : 2 * k) {
        if (xx < 0 || xx >= cols) continue;
        for (let i = head[yy * cols + xx]; i !== -1; i = next[i]) check(src[i]);
      }
    }
  }
  for (const e of gr.big) check(e);
  return best;
}

// ── Hindernisse ─────────────────────────────────────────────────────────────
// Ändern sich nur, wenn eine Welt lädt oder ein Boss Felsen hinlegt (neue Liste oder andere Länge)
export function collectObstacles(g, x, y, r, out) {
  return collect(sync(g.obstacleGrid || (g.obstacleGrid = createGrid(OBSTACLE_CELL)), g.obstacles, g.world.w, g.world.h), x, y, r, out);
}
