// FNV-1a über Zahlen — für Determinismus-Tests und den Level-Hash. Bewusst kein Crypto-Hash:
// er soll in Browser und Node ohne Abhängigkeit laufen und ist nur dazu da, zwei Läufe auf
// Gleichheit zu prüfen, nicht gegen Angreifer.
//
// Zahlen werden als Float64 in Bytes zerlegt, damit auch der letzte Nachkommabit zählt.
// (Little Endian auf allen Zielplattformen; verglichen wird ohnehin nur innerhalb einer Plattform.)

const f64 = new Float64Array(1);
const bytes = new Uint8Array(f64.buffer);

export function hashNumbers(values) {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    f64[0] = values[i];
    for (let b = 0; b < 8; b++) {
      h ^= bytes[b];
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Alle Zahlen und Wahrheitswerte eines Elements in fester Reihenfolge (Schlüssel sortiert).
// Verschachteltes (Pfade) ist unveränderlich und kommt aus der Beschreibung, nicht aus dem Lauf.
function elementNumbers(el) {
  const out = [];
  for (const key of Object.keys(el).sort()) {
    const v = el[key];
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
  }
  return out;
}

// Alles, was den weiteren Verlauf der Sim beeinflusst (Timer, Ladungen, Zähler, Elemente) —
// nicht nur Position und Tempo. Zwei Läufe, die hier gleich sind, sind für die Sim identisch.
export function hashWorld(world) {
  const p = world.player;
  const g = p.grapple;
  const values = [
    world.tick, world.checkpointIndex, world.deaths, world.finished ? 1 : 0,
    world.flags.sw, world.flags.keys,
    p.x, p.y, p.vx, p.vy, p.facing, p.gd,
    p.coyote, p.wallCoyote, p.wallCoyoteDir, p.jumpBuffer, p.wallLock, p.wallLockDir,
    p.jumping ? 1 : 0, p.jumpHold, p.airJumps, p.dropTimer, p.lastGroundVx,
    p.dashCharges, p.dashTimer, p.dashCooldown, p.dashGrace, p.dashBuffer, p.dashDirX, p.dashDirY,
    g ? 1 : 0, g ? g.ax : 0, g ? g.ay : 0, g ? g.len : 0, g ? g.held : 0,
    p.grappleCooldown, p.prevInput,
  ];
  for (const el of world.elements) values.push(...elementNumbers(el));
  return hashNumbers(values);
}
