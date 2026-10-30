// maze.js — Labyrinth als Kachelraster: 1 = Wand, 0 = Gang. Reine Rechnung ohne three.js.
//
// Aufbau: klassisches Irrgarten-Raster (Zellen auf ungeraden Koordinaten,
// Wände dazwischen), dann Schleifen und ein paar offene Räume hineingeschlagen.
// Schleifen sind fürs Spiel wichtig: in einem perfekten Irrgarten gibt es auf
// jeder Flucht genau einen Weg — das Monster muss man aber umrunden können.

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * @param {number} seed
 * @param {number} cells  Zellen je Seite (Raster = 2 * cells + 1 Kacheln)
 * @param {number} roomCount  offene 3×3-Räume (Anstalt: Behandlungsräume, Keller: Lagerräume)
 * @returns {{ size:number, grid:Uint8Array, cells:number, rooms:number[][], blocked:Set<number> }}
 *   rooms = Mittelkacheln der Räume; blocked = Kacheln, durch die Monster nicht laufen (Möbel in der Raummitte,
 *   vom Spiel gefüllt) — für Sicht und Spieler-Kollision zählen sie weiter als frei
 */
export function generateMaze(seed, cells = 10, roomCount = 2) {
  const rng = makeRng(seed);
  const size = cells * 2 + 1;
  const grid = new Uint8Array(size * size).fill(1);
  const at = (x, z) => grid[z * size + x];
  const set = (x, z, v) => { grid[z * size + x] = v; };

  // Rekursives Zurückverfolgen, als Stapel
  const stack = [[1, 1]];
  set(1, 1, 0);
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const options = [];
    for (const [dx, dz] of DIRS) {
      const nx = x + dx * 2;
      const nz = z + dz * 2;
      if (nx > 0 && nz > 0 && nx < size - 1 && nz < size - 1 && at(nx, nz) === 1) options.push([dx, dz]);
    }
    if (!options.length) { stack.pop(); continue; }
    const [dx, dz] = options[Math.floor(rng() * options.length)];
    set(x + dx, z + dz, 0);
    set(x + dx * 2, z + dz * 2, 0);
    stack.push([x + dx * 2, z + dz * 2]);
  }

  // Schleifen: einzelne Zwischenwände öffnen
  const loops = Math.round(cells * cells * 0.12);
  for (let n = 0, tries = 0; n < loops && tries < 2000; tries++) {
    const x = 1 + Math.floor(rng() * (size - 2));
    const z = 1 + Math.floor(rng() * (size - 2));
    if (at(x, z) !== 1) continue;
    const horiz = x % 2 === 0 && z % 2 === 1 && at(x - 1, z) === 0 && at(x + 1, z) === 0;
    const vert = x % 2 === 1 && z % 2 === 0 && at(x, z - 1) === 0 && at(x, z + 1) === 0;
    if (!horiz && !vert) continue;
    set(x, z, 0);
    n++;
  }

  // Kleine Hallen (3×3 Kacheln) — dort sieht man weiter, ist aber auch sichtbarer. Die ersten beiden
  // werden wie früher gewürfelt (gleiche Karten für gleiche Seeds), weitere halten Abstand zu den anderen.
  const rooms = [];
  for (let r = 0, tries = 0; r < roomCount && tries < 200; tries++) {
    const cx = 3 + 2 * Math.floor(rng() * (cells - 2));
    const cz = 3 + 2 * Math.floor(rng() * (cells - 2));
    if (r >= 2 && rooms.some(([x, z]) => Math.abs(x - cx) + Math.abs(z - cz) < 6)) continue;
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) set(x, z, 0);
    // Zwei gleiche Räume übereinander zählen einmal
    if (!rooms.some(([x, z]) => x === cx && z === cz)) rooms.push([cx, cz]);
    r++;
  }

  return { size, grid, cells, rooms, blocked: new Set() };
}

export function isOpen(maze, x, z) {
  if (x < 0 || z < 0 || x >= maze.size || z >= maze.size) return false;
  return maze.grid[z * maze.size + x] === 0;
}

/** Abstände (in Kacheln) von einer Kachel zu allen erreichbaren Kacheln. -1 = unerreichbar. */
export function distances(maze, sx, sz) {
  const dist = new Int32Array(maze.size * maze.size).fill(-1);
  const queue = [sz * maze.size + sx];
  dist[queue[0]] = 0;
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    const x = i % maze.size;
    const z = (i - x) / maze.size;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!isOpen(maze, nx, nz)) continue;
      const j = nz * maze.size + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

/**
 * Kürzester Weg als Kachelliste [[x,z], ...] ohne den Start. Leer, wenn unerreichbar.
 * maze.blocked (Möbel) wird umgangen — außer Start und Ziel selbst.
 */
export function findPath(maze, sx, sz, tx, tz) {
  if (sx === tx && sz === tz) return [];
  const blocked = maze.blocked;
  const prev = new Int32Array(maze.size * maze.size).fill(-1);
  const start = sz * maze.size + sx;
  const goal = tz * maze.size + tx;
  prev[start] = start;
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (i === goal) break;
    const x = i % maze.size;
    const z = (i - x) / maze.size;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!isOpen(maze, nx, nz)) continue;
      const j = nz * maze.size + nx;
      if (prev[j] >= 0) continue;
      if (blocked?.size && j !== goal && blocked.has(j)) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (prev[goal] < 0) return [];
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) path.push([i % maze.size, Math.floor(i / maze.size)]);
  return path.reverse();
}

/** Offene Nachbarn einer Kachel. */
export function openNeighbours(maze, x, z) {
  let n = 0;
  for (const [dx, dz] of DIRS) if (isOpen(maze, x + dx, z + dz)) n++;
  return n;
}

/** Richtungen zu echten Wänden neben einer Kachel (leer in der Mitte einer Halle). */
export function wallDirs(maze, x, z) {
  return DIRS.filter(([dx, dz]) => !isOpen(maze, x + dx, z + dz));
}

/* ── Wald ─────────────────────────────────────────────────────────────────
   Gleiches Raster, andere Bedeutung: 1 = Baum, 2 = Haus. Oben in der Mitte
   steht das Haus mit der Tür nach Süden, unten in der Mitte beginnt man.
   Bäume werden locker gestreut; was vom Start aus nicht erreichbar ist,
   wird zugewachsen, damit kein Schlüssel hinter einer Baumwand liegt. */

export const FOREST_SIZE = 37;

/** Kachelwerte im Wald. 0 = frei. */
export const FOREST = { TREE: 1, HOUSE: 2, HUT: 3, FENCE: 4 };

export function generateForest(seed) {
  const rng = makeRng(seed ^ 0x51f15e);
  const size = FOREST_SIZE;
  const grid = new Uint8Array(size * size);
  const set = (x, z, v) => { if (x >= 0 && z >= 0 && x < size && z < size) grid[z * size + x] = v; };
  const get = (x, z) => grid[z * size + x];
  // Lockere Bäume mit dichteren Flecken (Dickicht) und lichten Stellen
  const thick = [];
  for (let i = 0; i < 7; i++) thick.push([rng() * size, rng() * size, 3 + rng() * 4, rng() < 0.5 ? 0.38 : 0.08]);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || z === 0 || x === size - 1 || z === size - 1;
      if (edge) { set(x, z, FOREST.FENCE); continue; }
      let p = 0.2;
      for (const [cx, cz, r, d] of thick) if (Math.hypot(x - cx, z - cz) < r) p = d;
      set(x, z, rng() < p ? FOREST.TREE : 0);
    }
  }
  const mid = Math.floor(size / 2);
  // Haus: Block oben in der Mitte, Tür in der Südwand
  for (let z = 1; z <= 4; z++) for (let x = mid - 5; x <= mid + 5; x++) set(x, z, FOREST.HOUSE);
  const door = [mid, 4];
  // Lichtung vor dem Haus und um den Start (Tor im Zaun unten in der Mitte)
  for (let z = 5; z <= 7; z++) for (let x = mid - 4; x <= mid + 4; x++) set(x, z, 0);
  for (let z = size - 5; z <= size - 2; z++) for (let x = mid - 2; x <= mid + 2; x++) set(x, z, 0);
  const start = [mid, size - 2];
  const gate = [mid, size - 1];

  // Waldhütte: 3×2 Kacheln in einer Ecke des oberen oder seitlichen Waldes, mit kleiner Lichtung davor
  const left = rng() < 0.5;
  const hx = left ? 4 + Math.floor(rng() * 4) : size - 8 - Math.floor(rng() * 4);
  const hz = 10 + Math.floor(rng() * (size - 22));
  for (let z = hz; z < hz + 2; z++) for (let x = hx; x < hx + 3; x++) set(x, z, FOREST.HUT);
  for (let z = hz + 2; z <= hz + 3; z++) for (let x = hx - 1; x <= hx + 3; x++) set(x, z, 0);
  const hut = { x: hx, z: hz, w: 3, d: 2, porch: [hx + 1, hz + 2] };

  // Alte Feuerstelle auf einer Lichtung
  let fire = null;
  for (let tries = 0; tries < 50 && !fire; tries++) {
    const fx = 4 + Math.floor(rng() * (size - 8));
    const fz = 9 + Math.floor(rng() * (size - 18));
    if (Math.abs(fx - mid) < 4 && fz > size - 9) continue;
    if (fx >= hx - 3 && fx <= hx + 5 && fz >= hz - 3 && fz <= hz + 5) continue;
    fire = [fx, fz];
    for (let z = fz - 1; z <= fz + 1; z++) for (let x = fx - 1; x <= fx + 1; x++) if (get(x, z) === FOREST.TREE) set(x, z, 0);
  }

  const maze = { size, grid, cells: 0, forest: true };
  const dist = distances(maze, start[0], start[1]);
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0 && dist[i] < 0) grid[i] = FOREST.TREE;
  return { maze, start, door, gate, hut, fire };
}

export function placeForest(maze, rng, start, door) {
  const { size } = maze;
  const idx = (x, z) => z * size + x;
  const fromStart = distances(maze, start[0], start[1]);
  const fromDoor = distances(maze, door[0], door[1] + 1);
  const open = [];
  for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) if (isOpen(maze, x, z)) open.push([x, z]);
  // Schlüssel: weit vom Start UND weit von der Tür — man muss den Wald durchqueren
  let key = open[0];
  let best = -1;
  for (const [x, z] of open) {
    const s = Math.min(fromStart[idx(x, z)], fromDoor[idx(x, z)] * 1.2) + rng() * 3;
    if (s > best) { best = s; key = [x, z]; }
  }
  const taken = new Set([idx(...key), idx(...start)]);
  const pick = (list, n) => {
    const out = [];
    const copy = list.filter(([x, z]) => !taken.has(idx(x, z)));
    while (out.length < n && copy.length) {
      const [c] = copy.splice(Math.floor(rng() * copy.length), 1);
      out.push(c);
      taken.add(idx(...c));
    }
    return out;
  };
  const batteries = pick(open.filter(([x, z]) => fromStart[idx(x, z)] > 6), 5);
  // Büsche und Farne: nur Deko, man läuft hindurch
  const bushes = open.filter(([x, z]) => !taken.has(idx(x, z)) && fromStart[idx(x, z)] > 2 && rng() < 0.35);
  return { key, batteries, bushes, fromStart };
}

/**
 * Verteilt alles Spielrelevante: Start, Ausgang (Tür in der Außenwand),
 * Sicherungen, Akkus, Spinde, Wandschriften.
 */
export function placeThings(maze, rng, fuseCount = 3) {
  const { size } = maze;
  const start = [1, 1];
  const fromStart = distances(maze, start[0], start[1]);
  const idx = (x, z) => z * size + x;

  // Ausgang: die vom Start am weitesten entfernte Zelle am Rand mit einer Außenwand daneben
  let exit = null;
  let best = -1;
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      if (!isOpen(maze, x, z)) continue;
      const d = fromStart[idx(x, z)];
      if (d <= best) continue;
      let door = null;
      if (x === 1) door = [0, z];
      else if (x === size - 2) door = [size - 1, z];
      else if (z === 1) door = [x, 0];
      else if (z === size - 2) door = [x, size - 1];
      if (!door) continue;
      best = d;
      exit = { cell: [x, z], door };
    }
  }

  const taken = new Set([idx(...start), idx(...exit.cell)]);
  const cellsOpen = [];
  for (let z = 1; z < size - 1; z += 2) {
    for (let x = 1; x < size - 1; x += 2) if (isOpen(maze, x, z)) cellsOpen.push([x, z]);
  }
  const deadEnds = cellsOpen.filter(([x, z]) => openNeighbours(maze, x, z) === 1);

  // Sicherungen: weit weg vom Start und voneinander (Fernster-Punkt-Auswahl),
  // Sackgassen bevorzugt — dort ist es am unheimlichsten
  const fuses = [];
  const far = cellsOpen.filter(([x, z]) => fromStart[idx(x, z)] > size * 0.6 && !taken.has(idx(x, z)));
  const pool = far.length >= fuseCount ? far : cellsOpen.filter(([x, z]) => !taken.has(idx(x, z)));
  while (fuses.length < fuseCount && pool.length) {
    let pick = 0;
    let pickScore = -1;
    for (let i = 0; i < pool.length; i++) {
      const [x, z] = pool[i];
      let minD = Infinity;
      for (const [fx, fz] of [...fuses, exit.cell]) minD = Math.min(minD, Math.abs(fx - x) + Math.abs(fz - z));
      const score = minD + (openNeighbours(maze, x, z) === 1 ? 4 : 0) + rng() * 3;
      if (score > pickScore) { pickScore = score; pick = i; }
    }
    const [c] = pool.splice(pick, 1);
    fuses.push(c);
    taken.add(idx(...c));
  }

  const takeRandom = (list, n) => {
    const out = [];
    const copy = list.filter(([x, z]) => !taken.has(idx(x, z)));
    while (out.length < n && copy.length) {
      const [c] = copy.splice(Math.floor(rng() * copy.length), 1);
      out.push(c);
      taken.add(idx(...c));
    }
    return out;
  };

  // Spinde in Sackgassen, sonst in beliebigen Zellen; Akkus irgendwo
  const lockers = takeRandom(deadEnds, 6);
  if (lockers.length < 4) lockers.push(...takeRandom(cellsOpen, 4 - lockers.length));
  const batteries = takeRandom(cellsOpen.filter(([x, z]) => fromStart[idx(x, z)] > 4), 5);
  // Wandschriften nur dort, wo wirklich eine Wand ist (nicht mitten in einer Halle)
  const writings = takeRandom(cellsOpen.filter(([x, z]) => openNeighbours(maze, x, z) < 4), 7);

  return { start, exit, fuses, lockers, batteries, writings, fromStart };
}

/* ── Garten ───────────────────────────────────────────────────────────────
   Statuen-Rätsel: vier drehbare Statuen in Sackgassen, möglichst eine je Viertel der Karte. Nur Sackgassen,
   von denen aus die Mitte klar in einer Himmelsrichtung liegt (eine Achse mindestens doppelt so weit wie
   die andere) — sonst wäre „zum Licht schauen“ zweideutig. Dazu Attrappen in weiteren Sackgassen und
   Plätze für Bänke in geraden Gängen. */

/** Blickrichtungen der Statuen: 0 Norden (-z), 1 Osten (+x), 2 Süden (+z), 3 Westen (-x). */
const FACING4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Richtung (0..3), in die eine Statue auf Kachel (x, z) schauen muss, um die Mitte c anzusehen. */
export function facingToward([x, z], [cx, cz]) {
  const dx = cx - x;
  const dz = cz - z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

export function pickStatues(maze, rng, center, start, exitCell, count = 4) {
  const { size } = maze;
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const deadEnds = [];
  for (let z = 1; z < size - 1; z += 2) {
    for (let x = 1; x < size - 1; x += 2) {
      if (!isOpen(maze, x, z) || openNeighbours(maze, x, z) !== 1) continue;
      const c = [x, z];
      if (dist(c, center) < 5 || dist(c, start) < 4 || dist(c, exitCell) < 3) continue;
      deadEnds.push(c);
    }
  }
  for (let i = deadEnds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]];
  }
  const clear = (c) => {
    const dx = Math.abs(center[0] - c[0]);
    const dz = Math.abs(center[1] - c[1]);
    return dx >= 2 * dz || dz >= 2 * dx;
  };
  const quadrant = (c) => (c[0] < center[0] ? 0 : 1) + (c[1] < center[1] ? 0 : 2);
  const puzzle = [];
  const taken = [];
  // erst je Viertel eine, dann auffüllen (Abstand ≥ 6)
  for (let q = 0; q < 4 && puzzle.length < count; q++) {
    const c = deadEnds.find((d) => quadrant(d) === q && clear(d) && !taken.some((t) => dist(t, d) < 6));
    if (c) { puzzle.push(c); taken.push(c); }
  }
  for (const d of deadEnds) {
    if (puzzle.length >= count) break;
    if (clear(d) && !taken.some((t) => dist(t, d) < 6)) { puzzle.push(d); taken.push(d); }
  }
  // Notfalls auch weniger eindeutige Sackgassen
  for (const d of deadEnds) {
    if (puzzle.length >= count) break;
    if (!taken.some((t) => dist(t, d) < 4)) { puzzle.push(d); taken.push(d); }
  }
  const decoys = [];
  for (const d of deadEnds) {
    if (decoys.length >= 4) break;
    if (!taken.some((t) => dist(t, d) < 4)) { decoys.push(d); taken.push(d); }
  }
  // Startrichtung: zufällig, aber nie schon die richtige
  const withFacing = puzzle.map((cell) => {
    const correct = facingToward(cell, center);
    let f = Math.floor(rng() * 4);
    if (f === correct) f = (f + 1 + Math.floor(rng() * 3)) % 4;
    return { cell, facing: f, correct };
  });
  // Bänke in geraden Gängen, an einer Seitenwand
  const benches = [];
  for (let tries = 0; tries < 400 && benches.length < 7; tries++) {
    const x = 1 + Math.floor(rng() * (size - 2));
    const z = 1 + Math.floor(rng() * (size - 2));
    if (!isOpen(maze, x, z) || maze.blocked?.has(z * size + x)) continue;
    const open = DIRS.filter(([dx, dz]) => isOpen(maze, x + dx, z + dz));
    if (open.length !== 2 || open[0][0] !== -open[1][0] || open[0][1] !== -open[1][1]) continue;
    if (taken.some((t) => dist(t, [x, z]) < 3) || dist([x, z], start) < 3) continue;
    const walls = DIRS.filter(([dx, dz]) => !isOpen(maze, x + dx, z + dz));
    benches.push({ cell: [x, z], back: walls[Math.floor(rng() * walls.length)] });
    taken.push([x, z]);
  }
  return { puzzle: withFacing, decoys, benches, FACING: FACING4 };
}
