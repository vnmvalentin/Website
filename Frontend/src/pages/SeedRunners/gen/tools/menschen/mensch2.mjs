// Menschen-Bot, Fassung 2: wie mensch.mjs, aber
//   · Fortschritt = Umweg-Abstand zum Ziel durch Luft (Klettern zählt), bei zu Tür und fehlendem Schlüssel: zum Schlüssel
//   · mehr Handlungen: Wandsprung im Zickzack, Dash, Greifen (verschieden lang gehalten), senkrechter Doppelsprung
// Maßstab unverändert: gewählt wird nur, was mit d UND d + toleranz Ticks Verspätung überlebt.
const ROOT = new URL('../../../', import.meta.url).href;
const { cloneWorld } = await import(ROOT + 'gen/solver.js');
const { stepWorld } = await import(ROOT + 'sim/world.js');
const { INPUT } = await import(ROOT + 'sim/inputBits.js');
const { TILE, PLAYER_W, PLAYER_H } = await import(ROOT + 'sim/config.js');

const { LEFT: L, RIGHT: R, UP: U, JUMP: J, DASH: D, GRAPPLE: G } = INPUT;
const ENTSCHEID = 6;

function doppelPolicy(richtung) {
  return (u, w, z) => {
    if (u < 30 && !z.zweiter) return richtung | J;
    if (!z.zweiter && w.player.vy > 0) z.zweiter = u;
    if (z.zweiter && u - z.zweiter < 1) return richtung;
    if (z.zweiter && u - z.zweiter < 30) return richtung | J;
    return richtung;
  };
}
function wandPolicy(start) {
  return (u, w, z) => {
    if (z.dir === undefined) z.dir = start;
    const p = w.player;
    if (z.cool > 0) z.cool--;
    if (p.onGround && u < 3) { z.letzte = z.dir | J; return z.letzte; }
    // An der Wand: erst die Sprungtaste loslassen (nur ein NEUER Druck zählt), dann springen und wegsteuern
    if (!p.onGround && p.wallDir !== 0 && z.cool <= 0) {
      if (z.letzte & J) { z.letzte = p.wallDir > 0 ? R : L; return z.letzte; }
      z.cool = 12;
      z.dir = p.wallDir > 0 ? L : R;
      z.letzte = z.dir | J; return z.letzte;
    }
    z.letzte = z.dir | (p.vy < 0 && z.cool > 0 ? J : 0);
    return z.letzte;
  };
}
const halte = (n, a, b) => (u) => (u < n ? a : b);

const HANDLUNGEN = {
  laufen: () => R,
  warten: () => 0,
  links: () => L,
  springen: halte(30, R | J, R),
  kurz: halte(8, R | J, R),
  doppel: doppelPolicy(R),
  springenStehen: halte(30, J, 0),
  hochDoppel: doppelPolicy(0),
  linksSpringen: halte(30, L | J, L),
  linksDoppel: doppelPolicy(L),
  dash: halte(6, R | D, R),
  dashHoch: halte(6, R | U | D, R),
  wandR: wandPolicy(R),
  wandL: wandPolicy(L),
  greifen20: halte(20, R | G, R),
  greifen40: halte(40, R | G, R),
  greifen70: halte(70, R | G, R),
  greifenHoch40: halte(40, R | U | G, R),
};
const NAMEN = Object.keys(HANDLUNGEN);

// Umweg-Abstand durch Nicht-Fels-Kacheln von einer Zielmenge aus
function geoVon(map, ziele) {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const q = [];
  for (const [tx, ty] of ziele) { const i = ty * map.w + tx; if (i >= 0 && i < d.length) { d[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h]; const x = i % map.w; const y = (i - x) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (d[j] >= 0 || map.solid[j]) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

function abstandsFeld(w, cache) {
  const tuerZu = w.elements.some((e) => e.type === 'door' && !e.open);
  const schluessel = w.flags.keys === 0 && tuerZu ? w.elements.filter((e) => e.type === 'key' && !e.taken) : [];
  const key = schluessel.length ? 'k' + schluessel.map((e) => e.i).join(',') : 'ziel';
  if (!cache[key]) {
    const ziele = schluessel.length ? schluessel.map((e) => [e.tx, e.ty]) : w.map.finish.map((f) => [f.tx, f.ty]);
    cache[key] = { d: geoVon(w.map, ziele), bonus: schluessel.length ? 0 : 1 };
  }
  return cache[key];
}
function wert(w, cache) {
  const f = abstandsFeld(w, cache);
  const tx = Math.min(w.map.w - 1, Math.max(0, Math.floor((w.player.x + PLAYER_W / 2) / TILE)));
  const ty = Math.min(w.map.h - 1, Math.max(0, Math.floor((w.player.y + PLAYER_H / 2) / TILE)));
  const d = f.d[ty * w.map.w + tx];
  // Schlüssel/Türen zählen als großer Fortschritt (sonst wirkt das Einsammeln wie ein Rückschritt)
  const tueren = w.elements.filter((e) => e.type === 'door' && e.open).length;
  return -(d < 0 ? 999 : d) + 500 * (w.flags.keys + tueren);
}

function probiere(w0, name, verspaetung, vorher, cache) {
  const w = cloneWorld(w0);
  const z = {};
  const v0 = wert(w0, cache);
  let luft = false;
  for (let u = 0; u < verspaetung + 150; u++) {
    const m = u < verspaetung ? vorher : HANDLUNGEN[name](u - verspaetung, w, z);
    stepWorld(w, m);
    if (w.deaths) return { tot: true };
    if (w.finished) return { fort: 1e6 };
    if (!w.player.onGround) luft = true;
    else if (luft && u > verspaetung + 12) return { fort: wert(w, cache) - v0 + 1 };
  }
  return { fort: wert(w, cache) - v0 };
}

export function spieleMensch(welt, { d = 6, toleranz = 12, maxT = 6000 } = {}) {
  const w = welt;
  const cache = {};
  const eng = [];
  let aktuell = 'laufen';
  let seitBeginn = 0;
  let geplant = null;
  let z = {};
  let bestW = -1e9;
  let festSeit = 0;
  for (let t = 0; t < maxT; t++) {
    if (t % ENTSCHEID === 0 && !geplant) {
      const vorher = HANDLUNGEN[aktuell](seitBeginn, cloneWorld(w), { ...z });
      let best = null;
      for (const name of NAMEN) {
        const a = probiere(w, name, d, vorher, cache);
        if (a.tot) continue;
        const b = probiere(w, name, d + toleranz, vorher, cache);
        if (b.tot) continue;
        const v = Math.min(a.fort, b.fort) + (name === aktuell ? 0.5 : 0);
        if (!best || v > best.v) best = { name, v };
      }
      if (!best) {
        for (const name of NAMEN) { const a = probiere(w, name, d, vorher, cache); if (!a.tot && (!best || a.fort > best.v)) best = { name, v: a.fort }; }
        eng.push({ x: Math.round(w.player.x / TILE), y: Math.round(w.player.y / TILE), t });
      }
      if (best && best.name !== aktuell) geplant = { name: best.name, ab: t + d };
    }
    if (geplant && t >= geplant.ab) { aktuell = geplant.name; seitBeginn = 0; z = {}; geplant = null; }
    const vorX = w.player.x; const vorY = w.player.y;
    stepWorld(w, HANDLUNGEN[aktuell](seitBeginn, w, z));
    seitBeginn++;
    if (w.deaths) return { ok: false, eng, ticks: t, grund: w.deathReason, x: Math.round(vorX / TILE), y: Math.round(vorY / TILE), handlung: aktuell };
    if (w.finished) return { ok: true, eng, ticks: t };
    const jetzt = wert(w, cache);
    if (jetzt > bestW + 0.5) { bestW = jetzt; festSeit = t; }
    if (t - festSeit > 1200) return { ok: false, eng, ticks: t, grund: 'steckt', x: Math.round(w.player.x / TILE), y: Math.round(w.player.y / TILE) };
    if (seitBeginn > 80 && w.player.onGround && aktuell !== 'laufen' && aktuell !== 'warten') { aktuell = 'laufen'; seitBeginn = 0; z = {}; }
  }
  return { ok: false, eng, ticks: maxT, grund: 'zeit', x: Math.round(w.player.x / TILE) };
}
