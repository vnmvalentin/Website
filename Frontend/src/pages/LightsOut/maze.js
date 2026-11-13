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

/**
 * Schlüssel einer dünnen Wand zwischen zwei benachbarten offenen Kacheln (maze.edges). Solche Wände stehen
 * auf der Kachelgrenze: beide Kacheln bleiben begehbar, nur der Übergang zwischen ihnen ist zu.
 */
export function edgeKey(maze, x0, z0, x1, z1) {
  const a = z0 * maze.size + x0;
  const b = z1 * maze.size + x1;
  const n = maze.size * maze.size;
  return a < b ? a * n + b : b * n + a;
}

/* ── Anstalt ──────────────────────────────────────────────────────────────
   Kein Irrgarten, sondern der Grundriss einer Station: zwei lange Flure (Nord- und Südflur), verbunden durch
   zwei Quergänge — so entsteht ein Rundweg, auf dem man der Nachtschwester ausweichen kann. Ringsum und
   dazwischen liegen Zimmer verschiedener Größe. Das ganze Stockwerk ist offen; Wände zwischen Zimmern und
   Fluren sind dünn und stehen auf den Kachelgrenzen (maze.edges), Türen sind Lücken darin (maze.doorEdges).
   Start ist das Ende eines Stichflurs im Norden (dort kam man ins Haus), die Treppe liegt am Ende eines
   Stichflurs im Süden. */

/** Breite des Stockwerks in Kacheln (innen). */
const WARD_W = 17;

/**
 * Zimmerarten der Station. Vergeben wird nach Größe: die beiden größten sind Schlafsaal und Tagesraum, die
 * kleinsten Kammer und Einzelzimmer, der Rest Krankenzimmer.
 */
const WARD_SIGNS = {
  dorm: 'SCHLAFSAAL',
  dayroom: 'TAGESRAUM',
  treatment: 'BEHANDLUNG',
  office: 'SCHWESTERNZIMMER',
  doctor: 'DR. VOGT',
  storage: 'WÄSCHEKAMMER',
  isolation: 'EINZELZIMMER',
};

/**
 * @param {number} seed
 * @returns {{ size:number, grid:Uint8Array, cells:number, rooms:number[][], blocked:Set<number>, edges:Set<number>,
 *   doorEdges:Map<number, {a:number[], b:number[], room:number, other:number}>, region:Int16Array,
 *   ward:{ rooms:{id:number, x0:number, z0:number, x1:number, z1:number, type:string, sign:string}[],
 *          start:number[], exit:{cell:number[], door:number[]}, doorTiles:Set<number> } }}
 *   region: je Kachel -1 = Mauer, 0 = Flur, sonst die Nummer des Zimmers. doorEdges: a = Kachel im Zimmer `room`,
 *   b = Kachel davor (Flur: other = 0, sonst Nachbarzimmer).
 */
export function generateWard(seed) {
  const rng = makeRng(seed ^ 0x77a2d1);
  const W = WARD_W;
  const dN = 3;
  const dM = rng() < 0.5 ? 4 : 5;
  const dS = 3;
  const zA = 1 + dN;          // Nordflur
  const zB = zA + dM + 1;     // Südflur
  const D = zB + dS;          // Tiefe innen
  const size = Math.max(W, D) + 2;
  const grid = new Uint8Array(size * size).fill(1);
  const region = new Int16Array(size * size).fill(-1);
  const idx = (x, z) => z * size + x;
  // -2 = offen, aber noch keinem Zimmer zugeteilt
  for (let z = 1; z <= D; z++) for (let x = 1; x <= W; x++) { grid[idx(x, z)] = 0; region[idx(x, z)] = -2; }

  // Flure: zwei lange, zwei Quergänge dazwischen, je ein Stichflur nach Norden (Start) und Süden (Treppe)
  const xC1 = 4 + Math.floor(rng() * 3);
  const xC2 = W - 3 - Math.floor(rng() * 3);
  const flip = rng() < 0.5;
  const xS = flip ? xC2 : xC1;
  const xE = flip ? xC1 : xC2;
  const hall = (x, z) => { region[idx(x, z)] = 0; };
  for (let x = 1; x <= W; x++) { hall(x, zA); hall(x, zB); }
  for (let z = zA; z <= zB; z++) { hall(xC1, z); hall(xC2, z); }
  for (let z = 1; z < zA; z++) hall(xS, z);
  for (let z = zB + 1; z <= D; z++) hall(xE, z);
  const start = [xS, 1];
  const exit = { cell: [xE, D], door: [xE, D + 1] };

  // Zimmer: jeder Streifen zwischen den Fluren wird der Breite nach aufgeteilt
  const rooms = [];
  const addRoom = (x0, z0, x1, z1) => {
    const id = rooms.length + 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) region[idx(x, z)] = id;
    rooms.push({ id, x0, z0, x1, z1, type: '', sign: '' });
  };
  /** Breiten für eine Zimmerreihe der Länge len (2–4 Kacheln je Zimmer, der Rest geht ins letzte). */
  const widths = (len, min = 2, max = 4) => {
    const out = [];
    for (let left = len; left > 0;) {
      let w = min + Math.floor(rng() * (max - min + 1));
      if (left - w < min) w = left;
      out.push(w);
      left -= w;
    }
    return out;
  };
  const row = (x0, x1, z0, z1) => {
    if (x1 < x0 || z1 < z0) return;
    let x = x0;
    for (const w of widths(x1 - x0 + 1)) { addRoom(x, z0, x + w - 1, z1); x += w; }
  };
  row(1, xS - 1, 1, zA - 1);
  row(xS + 1, W, 1, zA - 1);
  row(1, xE - 1, zB + 1, D);
  row(xE + 1, W, zB + 1, D);
  // Mitte: je Block entweder ein Saal über die ganze Tiefe (Türen zu beiden Fluren — eine Abkürzung) oder
  // zwei Zimmerreihen Rücken an Rücken. Mindestens ein Saal, höchstens zwei.
  const blocks = [[1, xC1 - 1], [xC1 + 1, xC2 - 1], [xC2 + 1, W]];
  const wide = blocks.map(([a, b], i) => [b - a + 1, i]).sort((p, q) => q[0] - p[0]);
  const halls = new Set([wide[0][1]]);
  if (rng() < 0.6) halls.add(wide[1][1]);
  blocks.forEach(([a, b], i) => {
    if (halls.has(i)) {
      // sehr breite Blöcke bekommen den Saal und daneben noch Zimmer
      if (b - a + 1 > 6) {
        const w = 4 + Math.floor(rng() * 2);
        const left = rng() < 0.5;
        const hx0 = left ? a : b - w + 1;
        addRoom(hx0, zA + 1, hx0 + w - 1, zB - 1);
        const rest = left ? [hx0 + w, b] : [a, hx0 - 1];
        row(rest[0], rest[1], zA + 1, zA + 2);
        row(rest[0], rest[1], zA + 3, zB - 1);
      } else addRoom(a, zA + 1, b, zB - 1);
    } else {
      row(a, b, zA + 1, zA + 2);
      row(a, b, zA + 3, zB - 1);
    }
  });

  // Zimmerarten nach Größe
  const area = (r) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
  const bySize = [...rooms].sort((p, q) => area(q) - area(p) || p.id - q.id);
  const give = (r, type) => { r.type = type; r.sign = WARD_SIGNS[type]; };
  give(bySize[0], 'dorm');
  give(bySize[1], 'dayroom');
  const small = bySize.slice(2).reverse();
  give(small[0], 'storage');
  give(small[1], 'isolation');
  if (small.length > 9) give(small[2], 'isolation');
  const mid = bySize.slice(2).filter((r) => !r.type);
  // die übrigen in zufälliger Reihenfolge: je ein Behandlungs-, Schwestern- und Arztzimmer, der Rest Krankenzimmer
  for (let i = mid.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mid[i], mid[j]] = [mid[j], mid[i]];
  }
  ['treatment', 'office', 'doctor'].forEach((t, i) => { if (mid[i]) give(mid[i], t); });
  let no = 0;
  for (const r of rooms) {
    if (r.type) continue;
    r.type = 'patient';
    r.sign = `ZIMMER ${++no}`;
  }

  // Wände: zwischen zwei offenen Kacheln verschiedener Bereiche steht eine dünne Wand
  const maze = { size, grid, cells: 0, rooms: [], blocked: new Set(), edges: new Set(), doorEdges: new Map(), region };
  /** Mögliche Türen je Zimmer: Übergänge zum Flur bzw. zu einem Nachbarzimmer */
  const toHall = new Map();
  const toRoom = new Map();
  for (let z = 1; z <= D; z++) {
    for (let x = 1; x <= W; x++) {
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx > W || nz > D) continue;
        const ra = region[idx(x, z)];
        const rb = region[idx(nx, nz)];
        if (ra === rb) continue;
        const key = edgeKey(maze, x, z, nx, nz);
        maze.edges.add(key);
        // a liegt immer im Zimmer (bei zwei Zimmern: im ersten)
        const e = ra === 0 ? { key, a: [nx, nz], b: [x, z], room: rb, other: 0 } : { key, a: [x, z], b: [nx, nz], room: ra, other: rb };
        if (e.other === 0) {
          if (!toHall.has(e.room)) toHall.set(e.room, []);
          toHall.get(e.room).push(e);
        } else {
          const pair = `${Math.min(ra, rb)}-${Math.max(ra, rb)}`;
          if (!toRoom.has(pair)) toRoom.set(pair, []);
          toRoom.get(pair).push(e);
        }
      }
    }
  }
  const doorTiles = new Set();
  const openDoor = (e) => {
    maze.edges.delete(e.key);
    maze.doorEdges.set(e.key, { a: e.a, b: e.b, room: e.room, other: e.other });
    doorTiles.add(idx(e.a[0], e.a[1]));
    doorTiles.add(idx(e.b[0], e.b[1]));
  };
  /** Eine Tür aus der Liste — nicht neben einer schon vorhandenen und möglichst nicht in einer Zimmerecke. */
  const pickDoor = (list, room) => {
    const free = list.filter((e) => !doorTiles.has(idx(e.a[0], e.a[1])) && !doorTiles.has(idx(e.b[0], e.b[1])));
    const pool = free.length ? free : list;
    const inner = pool.filter((e) => {
      const alongX = e.a[1] !== e.b[1];
      return alongX ? (e.a[0] > room.x0 && e.a[0] < room.x1) : (e.a[1] > room.z0 && e.a[1] < room.z1);
    });
    const from = inner.length ? inner : pool;
    return from[Math.floor(rng() * from.length)];
  };
  for (const r of rooms) {
    const list = toHall.get(r.id) || [];
    if (!list.length) continue;
    // Tür zum langen Flur bevorzugt; Säle bekommen eine Tür zu jedem der beiden Flure
    const north = list.filter((e) => e.b[1] === zA);
    const south = list.filter((e) => e.b[1] === zB);
    if (north.length && south.length) { openDoor(pickDoor(north, r)); openDoor(pickDoor(south, r)); continue; }
    const main = north.length ? north : south;
    openDoor(pickDoor(main.length && rng() < 0.8 ? main : list, r));
  }
  // Ein paar Verbindungstüren von Zimmer zu Zimmer: Schleichwege abseits der Flure
  const pairs = [...toRoom.values()];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  for (const list of pairs.slice(0, 4)) openDoor(pickDoor(list, rooms[list[0].room - 1]));
  // Zimmer ohne Tür zum Flur (kann nur vorkommen, wenn eines keinen Flur berührt): über das Nachbarzimmer anbinden
  for (let guard = 0; guard < 40; guard++) {
    const dist = distances(maze, start[0], start[1]);
    const cut = pairs.flat().find((e) => maze.edges.has(e.key) && (dist[idx(e.a[0], e.a[1])] >= 0) !== (dist[idx(e.b[0], e.b[1])] >= 0));
    if (!cut) break;
    openDoor(cut);
  }
  maze.ward = { rooms, start, exit, doorTiles, zA, zB };
  return maze;
}

/**
 * Verteilt alles Spielrelevante in der Anstalt (wie placeThings, aber für den Grundriss mit Zimmern):
 * Sicherungen liegen in Zimmern, weit vom Start und voneinander; Spinde stehen an Flurwänden und in Zimmern.
 * Zimmer mit Sicherung bekommen hier eine zweite Tür (ändert maze.edges/doorEdges) — deshalb vor dem Bau der
 * Wände aufrufen.
 */
export function placeWard(maze, rng, fuseCount = 3) {
  const { size, region } = maze;
  const { rooms, start, exit, doorTiles } = maze.ward;
  const idx = (x, z) => z * size + x;
  const fromStart = distances(maze, start[0], start[1]);
  const taken = new Set([idx(...start), idx(...exit.cell)]);
  const free = (x, z) => !taken.has(idx(x, z)) && !doorTiles.has(idx(x, z));
  /** Hat die Kachel eine Wand (Mauer oder dünne Wand, keine Tür) an einer Seite? */
  const walled = (x, z) => DIRS.some(([dx, dz]) => !isOpen(maze, x + dx, z + dz) || maze.edges.has(edgeKey(maze, x, z, x + dx, z + dz)));
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const tilesOf = (r) => {
    const out = [];
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) out.push([x, z]);
    return out;
  };
  const take = (c) => { taken.add(idx(...c)); return c; };

  // Sicherungen: je eine in verschiedenen Zimmern (Fernster-Punkt-Auswahl), in der hintersten Ecke des Zimmers
  const fuses = [];
  const pool = rooms.map((r) => {
    const tiles = tilesOf(r).filter(([x, z]) => free(x, z) && fromStart[idx(x, z)] >= 0);
    if (!tiles.length) return null;
    const deep = tiles.reduce((best, c) => (fromStart[idx(...c)] > fromStart[idx(...best)] ? c : best), tiles[0]);
    return { r, cell: deep, d: fromStart[idx(...deep)] };
  }).filter(Boolean);
  while (fuses.length < fuseCount && pool.length) {
    let pick = 0;
    let best = -1;
    for (let i = 0; i < pool.length; i++) {
      let minD = pool[i].d * 0.6;
      for (const f of [...fuses, exit.cell]) minD = Math.min(minD, dist(f, pool[i].cell));
      const score = minD + rng() * 3;
      if (score > best) { best = score; pick = i; }
    }
    fuses.push(take(pool.splice(pick, 1)[0].cell));
  }
  // In ein Zimmer mit Sicherung MUSS man hinein. Damit es keine Falle ist, bekommt jedes eine zweite Tür —
  // möglichst weit von der ersten — und (weiter unten) einen Spind.
  const fuseRooms = fuses.map((c) => rooms[region[idx(...c)] - 1]);
  for (const r of fuseRooms) {
    const doors = [];
    for (const d of maze.doorEdges.values()) {
      if (d.room === r.id) doors.push(d.a);
      else if (d.other === r.id) doors.push(d.b);
    }
    if (doors.length >= 2) continue;
    let best = null;
    let bestScore = -1;
    for (const [x, z] of tilesOf(r)) {
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!isOpen(maze, nx, nz) || region[idx(nx, nz)] === r.id) continue;
        const key = edgeKey(maze, x, z, nx, nz);
        if (!maze.edges.has(key) || taken.has(idx(x, z)) || taken.has(idx(nx, nz))) continue;
        const other = region[idx(nx, nz)];
        // weit weg von der vorhandenen Tür; zum Flur lieber als ins Nachbarzimmer
        const score = doors.reduce((m, d) => Math.min(m, dist(d, [x, z])), 99) + (other === 0 ? 1.5 : 0) + rng();
        if (score > bestScore) { bestScore = score; best = { key, a: [x, z], b: [nx, nz], other }; }
      }
    }
    if (!best) continue;
    maze.edges.delete(best.key);
    maze.doorEdges.set(best.key, { a: best.a, b: best.b, room: r.id, other: best.other });
    doorTiles.add(idx(...best.a));
    doorTiles.add(idx(...best.b));
  }

  const halls = [];
  const inRooms = [];
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      if (!isOpen(maze, x, z)) continue;
      (region[idx(x, z)] === 0 ? halls : inRooms).push([x, z]);
    }
  }
  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  /** n Kacheln aus der Liste, frei, mit Mindestabstand untereinander (und zu allem in `near`). */
  const spread = (list, n, gap, ok = () => true) => {
    const out = [];
    for (const c of shuffle(list)) {
      if (out.length >= n) break;
      if (!free(c[0], c[1]) || !ok(c) || out.some((o) => dist(o, c) < gap)) continue;
      out.push(take(c));
    }
    return out;
  };
  // Spinde: einer in jedem Zimmer mit Sicherung (dort braucht man ihn am dringendsten), vier an Flurwänden über
  // die Station verteilt, zwei in weiteren Zimmern
  const lockers = [];
  fuseRooms.forEach((r, i) => {
    let spot = shuffle(tilesOf(r)).find(([x, z]) => free(x, z) && walled(x, z));
    // Winzige Zimmer (vier Kacheln, zwei davon Türen) haben keinen Platz mehr: dann steht der Spind auf dem Flur
    // gleich davor
    if (!spot) {
      spot = halls.filter(([x, z]) => free(x, z) && walled(x, z))
        .sort((a, b) => dist(a, fuses[i]) - dist(b, fuses[i]))[0];
    }
    if (spot) lockers.push(take(spot));
  });
  lockers.push(
    ...spread(halls, 4, 5, ([x, z]) => walled(x, z) && dist([x, z], start) > 2),
    ...spread(inRooms, 2, 5, ([x, z]) => walled(x, z) && !fuseRooms.includes(rooms[region[idx(x, z)] - 1])
      && !['isolation'].includes(rooms[region[idx(x, z)] - 1].type)),
  );
  const batteries = spread([...halls, ...inRooms], 5, 4, ([x, z]) => fromStart[idx(x, z)] > 4);
  // Wandschriften: im Einzelzimmer an jeder Wand, sonst auf den Fluren
  const iso = shuffle(inRooms.filter(([x, z]) => rooms[region[idx(x, z)] - 1].type === 'isolation' && walled(x, z) && free(x, z))).slice(0, 3);
  iso.forEach(take);
  const writings = [...iso, ...spread(halls, 7 - iso.length, 4, ([x, z]) => walled(x, z))];

  return { start, exit, fuses, lockers, batteries, writings, fromStart };
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
      if (maze.edges?.size && maze.edges.has(edgeKey(maze, x, z, nx, nz))) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

/**
 * Kürzester Weg als Kachelliste [[x,z], ...] ohne den Start. Leer, wenn unerreichbar.
 * maze.blocked (Möbel) wird umgangen — außer Start und Ziel selbst. avoid = weitere Kacheln, die der Weg meiden
 * soll (Anstalt: die Nachtschwester nimmt auf ihrer Runde keine Abkürzung durch die Zimmer).
 */
export function findPath(maze, sx, sz, tx, tz, avoid = null) {
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
      if (avoid && j !== goal && avoid.has(j)) continue;
      if (maze.edges?.size && maze.edges.has(edgeKey(maze, x, z, nx, nz))) continue;
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

  // Weitere Orte auf eigenen Lichtungen: ein Gräberfeld und ein alter Brunnen — abseits der Wege, weit
  // auseinander. Wer den Wald absucht (Schnitzereien!), stößt darauf.
  const spots = [[mid, size - 3], [mid, 6], [hx + 1, hz + 1]];
  if (fire) spots.push(fire);
  const clearing = () => {
    for (let tries = 0; tries < 80; tries++) {
      const x = 4 + Math.floor(rng() * (size - 8));
      const z = 9 + Math.floor(rng() * (size - 16));
      if (spots.some(([sx, sz]) => Math.abs(sx - x) + Math.abs(sz - z) < 9)) continue;
      for (let cz = z - 1; cz <= z + 1; cz++) for (let cx = x - 1; cx <= x + 1; cx++) if (get(cx, cz) === FOREST.TREE) set(cx, cz, 0);
      spots.push([x, z]);
      return [x, z];
    }
    return null;
  };
  const grave = clearing();
  const well = clearing();

  // Trampelpfade: vom Tor in einem Bogen zum Haus, mit Abzweigen zur Hütte und zum Lager an der Feuerstelle.
  // Auf ihnen steht kein Baum — sie geben dem Wald eine Richtung, ohne dass man ihnen folgen muss.
  const path = [];
  const onPath = new Set();
  const mark = (x, z) => {
    if (x < 1 || z < 1 || x > size - 2 || z > size - 2) return;
    const v = get(x, z);
    if (v !== 0 && v !== FOREST.TREE) return;
    set(x, z, 0);
    if (!onPath.has(z * size + x)) { onPath.add(z * size + x); path.push([x, z]); }
  };
  const walk = ([x, z], [tx, tz]) => {
    mark(x, z);
    for (let guard = 0; guard < 400 && (x !== tx || z !== tz); guard++) {
      const dx = tx - x;
      const dz = tz - z;
      if (dx !== 0 && (dz === 0 || rng() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dz)))) x += Math.sign(dx);
      else z += Math.sign(dz);
      mark(x, z);
    }
  };
  const bend = [mid + (rng() < 0.5 ? -1 : 1) * (3 + Math.floor(rng() * 3)), Math.floor(size / 2) + Math.floor(rng() * 5) - 2];
  walk([mid, size - 3], bend);
  walk(bend, [mid, 7]);
  const main = path.slice();
  const branch = (target) => {
    const from = main.slice().sort((a, b) => (Math.abs(a[0] - target[0]) + Math.abs(a[1] - target[1])) - (Math.abs(b[0] - target[0]) + Math.abs(b[1] - target[1])))[0];
    walk(from, target);
  };
  branch(hut.porch);
  if (fire) branch([fire[0], fire[1] + 1]);

  const maze = { size, grid, cells: 0, forest: true, blocked: new Set() };
  const dist = distances(maze, start[0], start[1]);
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0 && dist[i] < 0) grid[i] = FOREST.TREE;
  // Die Hütte ist begehbar: ihre Kacheln sind frei (Wände und Tür sind Hindernisse in game.js), für Monster
  // aber gesperrt — der Beobachter kommt nur bis vor die Tür.
  for (let z = hz; z < hz + 2; z++) for (let x = hx; x < hx + 3; x++) { set(x, z, 0); maze.blocked.add(z * size + x); }
  const reachable = (c) => (c && dist[c[1] * size + c[0]] >= 0 ? c : null);
  return { maze, start, door, gate, hut, fire, path, grave: reachable(grave), well: reachable(well) };
}

export function placeForest(maze, rng, start, door) {
  const { size } = maze;
  const idx = (x, z) => z * size + x;
  const fromStart = distances(maze, start[0], start[1]);
  const fromDoor = distances(maze, door[0], door[1] + 1);
  const open = [];
  // (das Innere der Hütte zählt nicht: dort liegt nichts Zufälliges und wächst kein Busch)
  for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) if (isOpen(maze, x, z) && !maze.blocked?.has(idx(x, z))) open.push([x, z]);
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
