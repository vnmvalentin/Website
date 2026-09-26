// Gedachte Wege mit Stellgrößen, Rastersuche, Fensterbreite. Je Chunk eine Route (params) → Eingabe-Policy.
// Ausgabe: Anteil erfolgreicher Rasterpunkte und das längste zusammenhängende Fenster je Stellgröße.
const ROOT = new URL('../../../', import.meta.url).href;
const { CHUNK_BY_ID, generateSingle, createLevelWorld } = await import(ROOT + 'gen/index.js');
const { cloneWorld } = await import(ROOT + 'gen/solver.js');
const { stepWorld } = await import(ROOT + 'sim/world.js');
const { INPUT } = await import(ROOT + 'sim/inputBits.js');
const { TILE, PLAYER_W } = await import(ROOT + 'sim/config.js');
const { LEFT: L, RIGHT: R, UP: U, JUMP: J, DASH: D, GRAPPLE: G } = INPUT;

/** Bis vor eine Wand / an eine Stelle laufen: Welt zurückgeben, in der man steht */
function laufeBis(w, cond, max = 3000) { for (let u = 0; u < max && !cond(w); u++) stepWorld(w, R); return w; }
const steht = () => { let lx = null, n = 0; return (w) => { const s = w.player.onGround && lx !== null && Math.abs(w.player.x - lx) < 0.2; n = s ? n + 1 : 0; lx = w.player.x; return n > 5; }; };

/** Zickzack mit fester Reaktionszeit d an jeder Wand; danach nach rechts. Liefert Policy. */
function zickzack(d, { amEnde } = {}) {
  let dir = R, wandSeit = -1, letzte = 0, sprungH = 30, luft = 0, fertig = false;
  return (w, u) => {
    const p = w.player;
    if (fertig) return amEnde ? amEnde(w) : R;
    let m = dir;
    if (u < 2) { letzte = R | J; return letzte; }
    if (p.onGround && u > 20) { fertig = true; return R; }
    if (!p.onGround && p.wallDir !== 0) {
      if (wandSeit < 0) wandSeit = u;
      if (u - wandSeit >= d) {
        if (letzte & J) m = p.wallDir > 0 ? R : L;
        else { dir = p.wallDir > 0 ? L : R; m = dir | J; sprungH = 20; wandSeit = -1; }
      } else m = p.wallDir > 0 ? R : L;
    } else { wandSeit = -1; if (sprungH > 0) { sprungH--; m = dir | J; } }
    luft = p.onGround ? 0 : luft + 1;
    letzte = m; return m;
  };
}

function spiele(w, policy, max = 2400) {
  for (let u = 0; u < max; u++) { stepWorld(w, policy(w, u)); if (w.deaths) return false; if (w.finished) return true; }
  return false;
}
function laengstes(bits) { let b = 0, c = 0; for (const x of bits) { c = x ? c + 1 : 0; b = Math.max(b, c); } return b; }
function laengstesZyklisch(bits) { return Math.min(bits.length, laengstes(bits.concat(bits))); }

const ROUTEN = {
  // Klebewand: an die Wand, „hoch" halten, oben rechts
  'sticky-climb'(w0) {
    const out = [];
    for (const d of [2, 6, 12, 18]) {
      const w = laufeBis(cloneWorld(w0), steht());
      let wandSeit = -1;
      out.push(spiele(w, (v, u) => { const p = v.player;
        if (u < 25) return R | J;
        if (p.wallDir !== 0 && !p.onGround) { if (wandSeit < 0) wandSeit = u; return u - wandSeit >= d ? R | U : R; }
        return R; }) ? 1 : 0);
    }
    return { 'Reaktionszeit 2/6/12/18': out.join('') };
  },
  // Stachel-/Laserschacht: am Fuß warten T Ticks (über eine Periode), dann Zickzack mit Reaktionszeit d
  'laser-shaft'(w0) { return schachtFenster(w0, 3.0); },
  'spike-wall-shaft'(w0) { return schachtFenster(w0, 0); },
  // Schacht, oben anlaufen, an der Kante springen, Doppelsprung nach a Ticks, Dash nach b weiteren Ticks
  'combo-shaft-dash'(w0) {
    const w1 = laufeBis(cloneWorld(w0), steht());
    // erst hochklettern (Zickzack, d = 6), bis man oben steht
    let oben = null;
    { const w = cloneWorld(w1); const pol = zickzack(6); for (let u = 0; u < 2400; u++) { stepWorld(w, pol(w, u)); if (w.deaths) break; if (u > 20 && w.player.onGround) { oben = w; break; } } }
    if (!oben) return { fehler: 'oben nicht erreicht' };
    const raster = [];
    for (const a of [10, 20, 30, 40, 50]) { const zeile = [];
      for (const b of [0, 6, 12, 18, 24, 30]) {
        const w = cloneWorld(oben); let sprung = null;
        zeile.push(spiele(w, (v, u) => { const p = v.player;
          const kante = !v.map.solid[(Math.floor(p.y / TILE) + 1) * v.map.w + Math.floor((p.x + PLAYER_W + 4) / TILE)];
          if (sprung === null && p.onGround && kante) sprung = u;
          if (sprung === null) return R;
          const s = u - sprung;
          if (s < 30) return R | J;
          if (s === a + 30 || s === a + 31) return R;        // loslassen
          if (s > a + 31 && s < a + 60) { if (s === a + 32 + b) return R | D; return R | J; }
          return R; }) ? 1 : 0);
      }
      raster.push(zeile.join(''));
    }
    return { 'Doppelsprung-Verzögerung (Zeilen 10–50) × Dash-Verzögerung (Spalten 0–30)': raster.join(' ') };
  },
};

function schachtFenster(w0, periode) {
  const w1 = laufeBis(cloneWorld(w0), steht());
  const res = {};
  for (const d of [2, 6, 12, 18]) {
    const bits = [];
    const schritte = periode ? Math.round(periode * 120 / 4) : 1;
    for (let i = 0; i < schritte; i++) {
      const w = cloneWorld(w1); for (let k = 0; k < i * 4; k++) stepWorld(w, 0);
      bits.push(spiele(w, zickzack(d)) ? 1 : 0);
    }
    res[`d${d}`] = periode ? `${(laengstesZyklisch(bits) * 4 / 120).toFixed(2)} s von ${periode} s` : (bits[0] ? 'geht' : 'geht NICHT');
  }
  return res;
}

const [id, ...klassen] = process.argv.slice(2);
for (const cls of klassen.length ? klassen : ['normal', 'fast', 'super']) for (const s of [0, 1]) {
  const level = generateSingle(CHUNK_BY_ID[id], { seed: `rt-${s}`, length: 'short', speedClass: cls, biome: 'meadow' });
  if (!level) continue;
  console.log(id.padEnd(18), cls.padEnd(6), `s${s}`, JSON.stringify(ROUTEN[id](createLevelWorld(level))));
}
