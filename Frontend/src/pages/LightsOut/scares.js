// scares.js — Schreck-Regie von Lights Out. Ohne three.js: rechnet nur, wo eine Erscheinung steht und was
// zu hören ist; game.js zeichnet sie (dieselbe 3D-Figur wie das Monster der Ebene).
//
// Erscheinungen sind harmlos — sie sehen aus wie das Monster, fangen aber niemanden. Große Schrecks:
//   behind   steht dicht hinter einem (Atem im Nacken) und ist weg, sobald man sich umdreht
//   rush     steht am Ende des Lichtkegels, rennt los und löst sich kurz vor einem auf
//   blackout Lampen und Taschenlampe fallen aus, Schritte kommen näher — manchmal steht es da, wenn das Licht zurückkommt
//   locker   etwas schlägt von innen gegen den Spind neben einem
//   cross    huscht draußen quer durchs Blickfeld
// Dazwischen leise: Flackern, Schritte hinter einem, Knall, Flüstern, ferner Schrei, Klopfen, Türknarren.
// Nie zwei gleiche hintereinander, nie während einer Verfolgung, nie wenn das echte Monster nah ist.

/**
 * @param {object} c
 * @param {()=>number} c.rng
 * @param {any} c.audio
 * @param {{x:number,z:number,yaw:number,hidden:any,alive:boolean}} c.player
 * @param {{x:number,z:number,state:string}} c.monster
 * @param {'forest'|'halls'|'cellar'|'garden'} c.theme
 * @param {boolean} c.soft                         sanfte Schreckmomente (kein Aufschrei, kaum Wackeln)
 * @param {()=>boolean} [c.calm]                   true = noch keine Erscheinungen zeigen (Monster ist noch nicht aufgetreten)
 * @param {{table:[string,number][], trigger:(name:string)=>boolean}} [c.events]  Schreckmomente der Karte (events.js):
 *   Fledermäuse, Wildschwein, Toter im Rollstuhl … — die Regie mischt sie unter ihre eigenen
 * @param {(x:number,z:number)=>boolean} c.free    Stelle begehbar?
 * @param {(x0:number,z0:number,x1:number,z1:number)=>boolean} c.los
 * @param {(v:number)=>void} c.shake
 * @param {(secs:number)=>void} c.flicker          Taschenlampe flackert
 * @param {(secs:number)=>void} c.blackout         Taschenlampe und Deckenlampen aus
 * @param {{x:number,z:number}[]} c.lockers
 * @param {number} c.eye                           Augenhöhe
 */
export function createScares(c) {
  const { rng, audio, player, monster, soft } = c;
  const outdoor = c.theme === 'forest' || c.theme === 'garden';
  /** Wessen Schritte man hört, wenn „etwas“ näher kommt (Klang wie das Monster der Ebene) */
  const stepKind = c.theme === 'cellar' ? 'listener' : c.theme === 'garden' ? 'tracker' : 'hunter';
  /** Die Erscheinung: on = sichtbar, speed = Lauftempo (für die Animation). */
  const ph = { on: false, x: 0, z: 0, speed: 0, mode: '', t: 0, seenAt: 0, vx: 0, vz: 0 };
  /** Zeitgesteuerte Folgeschritte (Spielzeit, pausiert also mit). */
  let timers = [];
  let time = 0;
  let nextAt = 26 + rng() * 10;
  let lastKind = '';
  const after = (secs, fn) => timers.push({ at: time + secs, fn });
  const fwd = () => [-Math.sin(player.yaw), -Math.cos(player.yaw)];
  const hide = () => { ph.on = false; ph.mode = ''; ph.speed = 0; };
  const show = (x, z, mode) => { ph.on = true; ph.x = x; ph.z = z; ph.mode = mode; ph.t = 0; ph.seenAt = 0; ph.speed = 0; };
  /** Der Schlag selbst: Aufschrei, Wackeln, Licht zuckt. */
  const jolt = (strength) => {
    c.shake(soft ? strength * 0.3 : strength);
    if (soft) audio?.stinger(); else { audio?.shriek(); c.blackout(0.25); }
  };
  const inView = (x, z, cosMin = 0.5) => {
    const [fx, fz] = fwd();
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * fx + dz * fz) / d > cosMin;
  };

  const kinds = {
    behind() {
      const [fx, fz] = fwd();
      for (const dist of [2.3, 1.9, 2.8]) {
        const x = player.x - fx * dist;
        const z = player.z - fz * dist;
        if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
        show(x, z, 'behind');
        audio?.neckBreath(x, c.eye, z);
        return true;
      }
      return false;
    },
    rush() {
      const [fx, fz] = fwd();
      for (let dist = 14; dist >= 8; dist -= 1) {
        const x = player.x + fx * dist;
        const z = player.z + fz * dist;
        if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
        show(x, z, 'rush');
        audio?.growl(x, 1.6, z);
        return true;
      }
      return false;
    },
    glimpse() {
      const [fx, fz] = fwd();
      for (let dist = 13; dist >= 7; dist -= 1) {
        const x = player.x + fx * dist;
        const z = player.z + fz * dist;
        if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
        show(x, z, 'glimpse');
        audio?.growl(x, 1.6, z);
        return true;
      }
      return false;
    },
    cross() {
      const [fx, fz] = fwd();
      const side = rng() < 0.5 ? -1 : 1;
      // quer zur Blickrichtung, 11 m voraus, von einer Seite zur anderen
      const x = player.x + fx * 11 + fz * side * 6;
      const z = player.z + fz * 11 - fx * side * 6;
      if (!c.free(x, z)) return false;
      show(x, z, 'cross');
      ph.vx = -fz * side * 4.5;
      ph.vz = fx * side * 4.5;
      ph.speed = 4.5;
      audio?.twig(x, 0.2, z);
      after(0.9, () => audio?.twig(ph.x, 0.2, ph.z));
      return true;
    },
    blackout() {
      if (outdoor) return false;
      const [fx, fz] = fwd();
      audio?.powerDown();
      c.blackout(2.8);
      for (let i = 0; i < 4; i++) {
        after(0.7 + i * 0.45, () => audio?.monsterStep(player.x + fx * (5 - i * 1.2), 0.2, player.z + fz * (5 - i * 1.2), 1.1, stepKind));
      }
      after(2.8, () => {
        // Licht ist zurück — manchmal steht es jetzt direkt vor einem
        const [gx, gz] = fwd();
        const x = player.x + gx * 2.1;
        const z = player.z + gz * 2.1;
        if (soft || rng() > 0.5 || !c.free(x, z) || !c.los(player.x, player.z, x, z)) return;
        show(x, z, 'flash');
        jolt(0.7);
      });
      return true;
    },
    locker() {
      let best = null;
      let bestD = 4.5;
      for (const l of c.lockers) {
        const d = Math.hypot(l.x - player.x, l.z - player.z);
        if (d < bestD && d > 0.8) { bestD = d; best = l; }
      }
      if (!best) return false;
      audio?.knock(best.x, 1.2, best.z, true);
      after(0.7, () => { audio?.bang(best.x, 1.2, best.z); c.shake(soft ? 0.08 : 0.3); });
      return true;
    },
    flicker() {
      c.flicker(1.4);
      audio?.buzz(1.4);
      return true;
    },
    steps() {
      // Schritte direkt hinter einem (draußen nicht: dort sind Geräusche hinter einem echt)
      if (outdoor) return false;
      const [fx, fz] = fwd();
      for (let i = 0; i < 3; i++) after(i * 0.52, () => audio?.monsterStep(player.x - fx * (4 - i), 0.2, player.z - fz * (4 - i), 0.9, stepKind));
      return true;
    },
    bang() {
      const a = rng() * Math.PI * 2;
      audio?.bang(player.x + Math.cos(a) * 12, 1.5, player.z + Math.sin(a) * 12);
      return true;
    },
    whisper() {
      const [fx, fz] = fwd();
      audio?.whisper(player.x - fx * 0.6, c.eye, player.z - fz * 0.6);
      return true;
    },
    scream() {
      const a = rng() * Math.PI * 2;
      audio?.distantScream(player.x + Math.cos(a) * 22, 2, player.z + Math.sin(a) * 22);
      return true;
    },
    knock() {
      const a = rng() * Math.PI * 2;
      audio?.knock(player.x + Math.cos(a) * 7, 1.4, player.z + Math.sin(a) * 7, c.theme === 'cellar');
      return true;
    },
    creak() {
      if (outdoor) return false;
      const a = rng() * Math.PI * 2;
      audio?.creak(player.x + Math.cos(a) * 8, 1.4, player.z + Math.sin(a) * 8);
      return true;
    },
  };

  // Schreckmomente der Karte (events.js) laufen über dieselbe Regie
  for (const [name] of c.events?.table || []) kinds[name] = () => c.events.trigger(name);
  /** Die zeigen etwas, sind aber nicht das Monster: auch erlaubt, solange es noch nicht aufgetreten ist (calm) */
  const SHOW = new Set((c.events?.table || []).map(([k]) => k));

  /** [Name, Gewicht] je Welt. Die großen Schrecks zusammen etwa die Hälfte. */
  const TABLE = {
    forest: [['rush', 3], ['cross', 4], ['flicker', 2], ['bang', 2], ['whisper', 2], ['scream', 2], ['knock', 1]],
    halls: [['behind', 4], ['rush', 3], ['blackout', 3], ['locker', 3], ['glimpse', 2], ['flicker', 1], ['steps', 2], ['bang', 1], ['whisper', 2], ['scream', 2], ['creak', 2]],
    cellar: [['behind', 4], ['rush', 3], ['blackout', 2], ['glimpse', 2], ['flicker', 1], ['steps', 2], ['bang', 2], ['whisper', 2], ['knock', 2], ['creak', 1]],
    garden: [['behind', 3], ['rush', 3], ['cross', 3], ['flicker', 2], ['bang', 1], ['whisper', 2], ['scream', 2]],
  };
  const BIG = new Set(['behind', 'rush', 'blackout', 'locker', 'cross', 'glimpse']);

  function pick() {
    // calm: das Monster der Ebene ist noch gar nicht aufgetreten — dann auch keine Erscheinung, nur Geräusche
    const calm = !!c.calm?.();
    // nie zweimal dasselbe, nie zwei große Momente hintereinander (groß = Erscheinung oder Ereignis der Karte)
    const big = (k) => BIG.has(k) || SHOW.has(k);
    const table = [...(TABLE[c.theme] || TABLE.halls), ...(c.events?.table || [])]
      .filter(([k]) => k !== lastKind && !(BIG.has(k) && calm) && !(big(k) && big(lastKind)));
    const total = table.reduce((s, [, w]) => s + w, 0);
    // bis zu vier Versuche: manche brauchen freie Sicht oder einen Spind in der Nähe
    for (let tries = 0; tries < 4; tries++) {
      let r = rng() * total;
      for (const [k, w] of table) {
        r -= w;
        if (r > 0) continue;
        if (kinds[k]()) { lastKind = k; return; }
        break;
      }
    }
  }

  return {
    phantom: ph,
    /** Einen bestimmten Schreck sofort auslösen (für feste Stellen im Spiel). */
    trigger(kind) {
      if (ph.on) hide();
      const ok = !!kinds[kind]?.();
      if (ok) { lastKind = kind; nextAt = Math.max(nextAt, time + 18); }
      return ok;
    },
    /** Die Regie verschieben (z. B. wenn das echte Monster gerade seinen Auftritt hat). */
    delay(secs) { nextAt = Math.max(nextAt, time + secs); },
    update(dt, now) {
      time = now;
      if (timers.length) {
        const due = timers.filter((t) => t.at <= time);
        timers = timers.filter((t) => t.at > time);
        for (const t of due) t.fn();
      }
      // laufende Erscheinung
      if (ph.on) {
        ph.t += dt;
        const d = Math.hypot(ph.x - player.x, ph.z - player.z);
        if (ph.mode === 'behind') {
          if (!ph.seenAt && inView(ph.x, ph.z)) { ph.seenAt = time; jolt(0.6); }
          if ((ph.seenAt && time - ph.seenAt > 0.22) || ph.t > 10 || d > 7) hide();
        } else if (ph.mode === 'rush') {
          if (ph.t > 0.75) {
            if (!ph.seenAt) { ph.seenAt = time; audio?.riser(Math.min(1.4, d / 9)); }
            ph.speed = 9;
            const step = Math.min(d, 9 * dt);
            ph.x += ((player.x - ph.x) / (d || 1)) * step;
            ph.z += ((player.z - ph.z) / (d || 1)) * step;
            if (d < 1.4) { hide(); jolt(0.9); }
          }
          if (ph.t > 4) hide();
        } else if (ph.mode === 'glimpse') {
          if (ph.t > 0.8) hide();
        } else if (ph.mode === 'flash') {
          if (ph.t > 0.28) hide();
        } else if (ph.mode === 'cross') {
          ph.x += ph.vx * dt;
          ph.z += ph.vz * dt;
          if (ph.t > 2.6) hide();
        }
        return;
      }
      const m = monster.state;
      if (m === 'chase' || m === 'charge' || player.hidden || !player.alive || time < nextAt) return;
      if (m !== 'dormant' && m !== 'away' && Math.hypot(monster.x - player.x, monster.z - player.z) < 11) return;
      nextAt = time + 20 + rng() * 18;
      pick();
    },
  };
}
