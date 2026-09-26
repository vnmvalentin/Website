// Juice: alles, was das Spiel lebendig macht, ohne es zu verändern — Partikel, Bildschütteln,
// Squash & Stretch, Freeze-Frame, Nachbilder, Ton, Hintergrund und Einblendungen bei Checkpoint
// und Ziel.
//
// Die Sim meldet nur, WAS passiert ist (client/events.js); hier wird daraus etwas, das man sieht und
// hört. Nichts hiervon fließt zurück: Die Ergebnisse eines Laufs hängen nicht daran, ob Effekte an
// sind. Deshalb dürfen Zufall und echte Bildzeit benutzt werden.
//
// Freeze-Frame ist REIN OPTISCH: Das Bild bleibt einen Moment stehen, die Sim läuft weiter. Würde man
// die Sim anhalten, verlöre man Rennzeit — ein Tod würde dann Zeit SPAREN, weil die Uhr in Ticks zählt.

import { PLAYER_W, PLAYER_H } from '../sim/config.js';
import { VIEW_W, VIEW_H } from './camera.js';
import { createParticles } from './particles.js';
import { sharedSound } from './sound.js';
import { drawParallax, AMBIENT } from './parallax.js';
import { getFx, subscribeFx } from './fxSettings.js';
import { CHANNEL_COLORS } from './drawElements.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const COLOR = {
  dust: ['#c9cbd6', '#a9acbd', '#e4e5ec'],
  player: '#a78bfa',
  spark: ['#f0b94a', '#fde68a', '#ffffff'],
  crystal: ['#a78bfa', '#ddd6fe', '#ffffff'],
  ring: ['#7dd3fc', '#e0f2fe'],
  spring: ['#f0b94a', '#fde68a'],
  portalA: '#38bdf8',
  portalB: '#fb923c',
  red: '#e05a5a',
  blue: '#5a8be0',
  key: ['#facc15', '#fef08a'],
  hazard: ['#ff5a5a', '#ff9a9a'],
  crumble: ['#8a7a68', '#a99a86', '#6a5e50'],
  confetti: ['#a78bfa', '#f0b94a', '#22c55e', '#7dd3fc', '#fb923c', '#f472b6', '#ffffff'],
  checkpoint: ['#8b5cf6', '#c4b5fd', '#ffffff'],
};

// Freeze-Frame-Längen in Millisekunden (nur Bild)
const FREEZE_MS = { death: 90 };

const DEFAULT_PALETTE = { bg: '#0b0b14', tile: '#23233a', tileTop: '#3d3d63', accent: '#a78bfa', far: '#101020' };

export function createJuice({ biome: initialBiome = 'meadow', palette: initialPalette, sound } = {}) {
  let biome = initialBiome;
  let palette = initialPalette || DEFAULT_PALETTE;
  const particles = createParticles();
  const snd = sound || sharedSound;
  let fx = getFx();
  const applyFx = () => {
    fx = getFx();
    snd.setMuted(!fx.sound);
    snd.setVolume(fx.volume);
  };
  applyFx();
  const unsubscribe = subscribeFx(applyFx);

  const st = {
    world: null,
    cam: { x: 0, y: 0 },
    shakeAmp: 0, shakeX: 0, shakeY: 0,
    sq: { sx: 1, sy: 1, vsx: 0, vsy: 0 },
    freezeUntil: 0,
    flash: 0, flashColor: '#ffffff',
    popups: [],
    flags: new Map(),
    ghostAcc: 0, dustAcc: 0, ambientAcc: 0,
    anchorY: null,     // Kamerahöhe im ersten Bild: dort liegt der Horizont des Hintergrunds
  };

  // ── Hilfen ──────────────────────────────────────────────────────────────

  const feet = () => {
    const p = st.world.player;
    return { x: p.x + PLAYER_W / 2, y: p.gd < 0 ? p.y : p.y + PLAYER_H };
  };
  const center = () => {
    const p = st.world.player;
    return { x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2 };
  };

  // Lautstärke und Stereo-Lage nach dem Abstand zur Bildmitte
  function spatial(x, y) {
    const dx = x - (st.cam.x + VIEW_W / 2);
    const dy = y - (st.cam.y + VIEW_H / 2);
    const g = Math.max(0, 1 - Math.hypot(dx, dy) / 320);
    return { gain: g * g, pan: clamp(dx / 260, -1, 1) };
  }
  const soundAt = (name, x, y, extra) => {
    const s = spatial(x, y);
    if (s.gain > 0.03) snd.play(name, { ...s, ...extra });
  };

  const shake = (amp) => { if (fx.shake) st.shakeAmp = Math.max(st.shakeAmp, amp); };
  const flash = (color, a) => { if (fx.shake) { st.flash = Math.max(st.flash, a); st.flashColor = color; } };
  const squash = (sx, sy) => { st.sq.sx = sx; st.sq.sy = sy; st.sq.vsx = 0; st.sq.vsy = 0; };

  /** Staubwölkchen an einer Stelle; `dir` schiebt sie seitlich (−1 links, 1 rechts, 0 nach beiden Seiten) */
  function dust(x, y, n, dir = 0, power = 1) {
    if (!fx.particles) return;
    for (let i = 0; i < n; i++) {
      const side = dir || (Math.random() < 0.5 ? -1 : 1);
      particles.add({
        x: x + rand(-3, 3), y: y - rand(0, 2), vx: side * rand(10, 50) * power, vy: -rand(4, 28) * power, ay: 30, drag: 3,
        life: rand(0.2, 0.42), size: rand(2, 3.6), size1: 0, color: COLOR.dust[(Math.random() * 3) | 0], shape: 'circle', layer: 'back',
      });
    }
  }

  const sparks = (x, y, n, color, o = {}) => {
    if (fx.particles) particles.burst(x, y, n, { v0: 30, v1: 110, l0: 0.25, l1: 0.55, s0: 1.4, s1: 2.6, ay: 60, color, ...o });
  };

  // ── Ereignisse der Sim ──────────────────────────────────────────────────

  const HANDLERS = {
    jump() {
      const f = feet();
      dust(f.x, f.y, 4);
      squash(0.78, 1.28);
      snd.play('jump');
    },
    doubleJump() {
      const f = feet();
      if (fx.particles) particles.ring(f.x, f.y, 2, 12, 0.28, '#e4e4e7');
      squash(0.8, 1.25);
      snd.play('doubleJump');
    },
    wallJump(d) {
      const p = st.world.player;
      dust(d.dir > 0 ? p.x : p.x + PLAYER_W, p.y + PLAYER_H * 0.7, 5, d.dir, 1.1);
      squash(0.8, 1.22);
      snd.play('wallJump');
    },
    land(d) {
      const impact = d.impact ?? 200;
      if (impact < 90) return;
      const k = clamp(impact / 420, 0.2, 1);
      const f = feet();
      dust(f.x, f.y, Math.round(3 + 5 * k), 0, 0.8 + k * 0.6);
      squash(1 + 0.4 * k, 1 - 0.36 * k);
      if (impact > 400) shake(1);
      snd.play('land', { impact });
    },
    dash(d) {
      const c = center();
      sparks(c.x, c.y, 8, ['#c4b5fd', '#ffffff'], { a0: Math.atan2(-d.dy, -d.dx) - 0.7, a1: Math.atan2(-d.dy, -d.dx) + 0.7, v0: 50, v1: 140, l0: 0.15, l1: 0.3 });
      snd.play('dash');
    },
    death(d) {
      const cx = d.x + PLAYER_W / 2;
      const cy = d.y + PLAYER_H / 2;
      if (fx.particles) {
        particles.burst(cx, cy, 22, { v0: 40, v1: 170, l0: 0.35, l1: 0.8, s0: 2, s1: 4, ay: 220, drag: 1.4, color: [COLOR.player, COLOR.player, '#ddd6fe', '#ffffff'] });
        particles.ring(cx, cy, 3, 26, 0.35, '#ff9a9a');
      }
      shake(5);
      flash('#ff5a5a', 0.35);
      st.freezeUntil = performance.now() + FREEZE_MS.death;
      squash(0.25, 0.25);     // die neue Figur ploppt am Checkpoint auf
      snd.play('death');
    },
    restart() {
      squash(0.3, 0.3);
      snd.play('restart');
    },
    checkpoint(d) {
      const x = d.x + PLAYER_W / 2;
      const y = d.y + PLAYER_H;
      sparks(x, y - 8, 16, COLOR.checkpoint, { a0: -Math.PI * 0.95, a1: -Math.PI * 0.05, v0: 40, v1: 120, ay: 90, l0: 0.5, l1: 0.9 });
      if (fx.particles) particles.ring(x, y - 6, 3, 22, 0.45, '#c4b5fd');
      st.flags.set(d.index, performance.now());
      const total = st.world.map.checkpoints.length;
      st.popups.push({ text: `Checkpoint ${d.index} / ${total}`, x, y: y - 22, life: 1.6, max: 1.6 });
      flash('#c4b5fd', 0.18);
      snd.play('checkpoint');
    },
    finish() {
      const f = st.world.map.finish;
      const cx = (f.reduce((a, t) => a + t.tx, 0) / f.length + 0.5) * 16;
      const cy = (f.reduce((a, t) => a + t.ty, 0) / f.length + 0.5) * 16;
      if (fx.particles) {
        for (let wave = 0; wave < 3; wave++) {
          particles.burst(cx, cy, 30, { a0: -Math.PI * 0.95, a1: -Math.PI * 0.05, v0: 80, v1: 240, l0: 1.0, l1: 1.9, s0: 3, s1: 5.5, ay: 240, drag: 0.7, color: COLOR.confetti, spin: true });
        }
        particles.ring(cx, cy, 4, 40, 0.6, '#facc15');
      }
      flash('#ffffff', 0.45);
      snd.play('finish');
    },
    crystal(d) {
      sparks(d.x, d.y, 12, COLOR.crystal, { v0: 30, v1: 90, ay: 0 });
      if (fx.particles) particles.ring(d.x, d.y, 3, 16, 0.3, '#ddd6fe');
      soundAt('crystal', d.x, d.y);
    },
    ring(d) {
      sparks(d.x, d.y, 12, COLOR.ring, { v0: 40, v1: 130, ay: 0 });
      if (fx.particles) particles.ring(d.x, d.y, 4, 22, 0.35, '#7dd3fc');
      squash(0.75, 1.3);
      snd.play('ring');
    },
    spring(d) {
      const x = d.x + 8;
      const y = d.y;
      const up = d.dir === 'left' || d.dir === 'right' ? -Math.PI / 2 + (d.dir === 'right' ? 0.9 : -0.9) : -Math.PI / 2;
      sparks(x, y, 10, COLOR.spring, { a0: up - 0.7, a1: up + 0.7, v0: 50, v1: 140, ay: 100 });
      squash(0.72, 1.34);
      snd.play('spring');
    },
    crumbleStart(d) {
      if (fx.particles) particles.burst(d.x + 8, d.y + 14, 4, { a0: 0.3, a1: Math.PI - 0.3, v0: 8, v1: 30, ay: 220, l0: 0.3, l1: 0.5, s0: 1.5, s1: 2.5, color: COLOR.crumble });
      soundAt('crumbleStart', d.x, d.y);
    },
    crumbleGone(d) {
      if (fx.particles) particles.burst(d.x + 8, d.y + 8, 12, { v0: 20, v1: 70, ay: 260, l0: 0.4, l1: 0.8, s0: 2, s1: 4, color: COLOR.crumble });
      soundAt('crumbleGone', d.x, d.y);
    },
    blockShake(d) {
      if (fx.particles) particles.burst(d.x + (d.w || 16) / 2, d.y + 16, 6, { a0: 0.3, a1: Math.PI - 0.3, v0: 10, v1: 40, ay: 200, l0: 0.3, l1: 0.6, s0: 1.5, s1: 2.5, color: COLOR.crumble });
      soundAt('blockShake', d.x, d.y);
    },
    blockLand(d) {
      const w = d.w || 16;
      const y = d.y + (d.h || 16);
      for (let i = 0; i < Math.round(w / 8); i++) dust(d.x + 4 + i * 8, y, 2, i % 2 ? 1 : -1, 1.4);
      const near = spatial(d.x + w / 2, d.y).gain;
      shake(3 * near + 0.5 * (near > 0 ? 1 : 0));
      soundAt('blockLand', d.x + w / 2, d.y);
    },
    portal(d) {
      sparks(d.from.x, d.from.y, 12, COLOR.portalA, { v0: 20, v1: 80, ay: 0 });
      sparks(d.to.x, d.to.y, 12, COLOR.portalB, { v0: 20, v1: 80, ay: 0 });
      if (fx.particles) {
        particles.ring(d.from.x, d.from.y, 8, 2, 0.3, COLOR.portalA);
        particles.ring(d.to.x, d.to.y, 2, 16, 0.35, COLOR.portalB);
      }
      squash(0.7, 1.3);
      snd.play('portal');
    },
    switch(d) {
      const c = center();
      sparks(c.x, c.y, 10, CHANNEL_COLORS[d.channel || 0][d.state ? 1 : 0], { v0: 30, v1: 100, ay: 40 });
      snd.play('switch');
    },
    key(d) {
      sparks(d.x, d.y, 12, COLOR.key, { v0: 20, v1: 80, ay: -30 });
      snd.play('key');
    },
    doorOpen(d) {
      dust(d.x + 8, d.y + 16, 6, 0, 1.2);
      soundAt('doorOpen', d.x, d.y);
    },
    grappleAttach(d) {
      sparks(d.x, d.y, 6, ['#e4e4e7', '#a78bfa'], { v0: 20, v1: 70, ay: 0, l0: 0.15, l1: 0.3 });
      snd.play('grappleAttach');
    },
    grappleRelease(d) {
      if (d.boosted) squash(1.25, 0.85);
      snd.play('grappleRelease');
    },
    gravity() {
      const c = center();
      if (fx.particles) particles.ring(c.x, c.y, 3, 24, 0.4, '#c084fc');
      squash(1.3, 0.75);
      snd.play('gravity');
    },
    laserWarn(d) {
      soundAt('laserWarn', d.x, d.y);
    },
    laserOn(d) {
      sparks(d.x, d.y, 5, COLOR.hazard, { v0: 20, v1: 70, ay: 0, l0: 0.12, l1: 0.25 });
      soundAt('laserOn', d.x, d.y);
    },
    gust(d) {
      soundAt('gust', d.x + d.w / 2, d.y + d.h / 2);
    },
  };

  // ── Pro Bild ────────────────────────────────────────────────────────────

  function update(dt, world, cam) {
    st.world = world;
    st.cam = cam;
    const p = world.player;
    particles.update(dt);

    // Bildschütteln: zufälliger Versatz, der schnell abklingt
    if (fx.shake && st.shakeAmp > 0.05) {
      st.shakeX = (Math.random() * 2 - 1) * st.shakeAmp;
      st.shakeY = (Math.random() * 2 - 1) * st.shakeAmp;
      st.shakeAmp *= Math.exp(-dt * 9);
    } else {
      st.shakeX = 0;
      st.shakeY = 0;
      st.shakeAmp = 0;
    }
    st.flash = Math.max(0, st.flash - dt * 2.2);

    // Squash & Stretch: eine Feder zieht zum Zielwert; Ereignisse stoßen sie an (squash())
    const q = st.sq;
    let tx = 1;
    let ty = 1;
    if (p.dashTimer > 0) {
      const horizontal = Math.abs(p.dashDirX) >= Math.abs(p.dashDirY);
      tx = horizontal ? 1.4 : 0.74;
      ty = horizontal ? 0.72 : 1.4;
    } else if (!p.onGround && !p.grapple) {
      const s = Math.min(1, Math.abs(p.vy) / 420) * 0.22;
      ty = 1 + s;
      tx = 1 - s * 0.6;
    }
    const h = Math.min(dt, 1 / 30);
    q.vsx += (-260 * (q.sx - tx) - 17 * q.vsx) * h;
    q.vsy += (-260 * (q.sy - ty) - 17 * q.vsy) * h;
    q.sx = clamp(q.sx + q.vsx * h, 0.25, 1.7);
    q.sy = clamp(q.sy + q.vsy * h, 0.25, 1.7);

    if (fx.particles) {
      // Nachbilder beim Dash
      if (p.dashTimer > 0) {
        st.ghostAcc += dt;
        while (st.ghostAcc > 0.022) {
          particles.ghost(p.x, p.y, PLAYER_W, PLAYER_H, COLOR.player);
          st.ghostAcc -= 0.022;
        }
      } else {
        st.ghostAcc = 0;
      }
      // Laufstaub
      if (p.onGround && Math.abs(p.vx) > 70) {
        st.dustAcc += dt;
        if (st.dustAcc > 0.1) {
          st.dustAcc = 0;
          dust(p.x + PLAYER_W / 2 - Math.sign(p.vx) * 3, p.gd < 0 ? p.y : p.y + PLAYER_H, 1, -Math.sign(p.vx), 0.5);
        }
      }
      // Rutschen an der Wand
      if (p.sliding && Math.random() < dt * 14) dust(p.wallDir > 0 ? p.x + PLAYER_W : p.x, p.y + PLAYER_H * 0.6, 1, -p.wallDir, 0.5);

      // Luftteilchen des Bioms
      const amb = AMBIENT[biome];
      if (amb) {
        st.ambientAcc += dt * amb.rate;
        while (st.ambientAcc >= 1) {
          st.ambientAcc -= 1;
          const fromRight = amb.streak;
          const x = fromRight ? cam.x + VIEW_W + 6 : cam.x + rand(-10, VIEW_W + 10);
          const y = fromRight ? cam.y + rand(0, VIEW_H) : amb.vy[0] > 0 ? cam.y - 6 : amb.vy[1] < 0 ? cam.y + VIEW_H + 6 : cam.y + rand(0, VIEW_H);
          particles.add({
            x, y, vx: rand(amb.vx[0], amb.vx[1]), vy: rand(amb.vy[0], amb.vy[1]), life: rand(3, 6), size: rand(amb.size[0], amb.size[1]), size1: amb.streak ? 3 : 1,
            color: amb.color, shape: amb.streak ? 'rect' : 'circle', layer: 'bg',
          });
        }
      }
    }

    // Einblendungen
    for (let i = st.popups.length - 1; i >= 0; i--) {
      const pop = st.popups[i];
      pop.life -= dt;
      pop.y -= dt * 8;
      if (pop.life <= 0) st.popups.splice(i, 1);
    }
  }

  // ── Zeichnen (aus render.js aufgerufen) ─────────────────────────────────

  const view = () => ({ x0: st.cam.x - 24, x1: st.cam.x + VIEW_W + 24, y0: st.cam.y - 24, y1: st.cam.y + VIEW_H + 24 });

  function drawBackground(ctx, scale, camX, camY, tick) {
    if (st.anchorY === null) st.anchorY = camY;
    drawParallax(ctx, biome, palette, scale, camX, camY - st.anchorY, tick);
    // Luftteilchen des Bioms liegen hinter den Kacheln, aber vor den fernen Schichten
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
    particles.draw(ctx, 'bg', view());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const drawParticles = (ctx, layer) => particles.draw(ctx, layer, view());

  function drawOverlay(ctx, scale, camX, camY) {
    // Einblendungen über der Welt
    if (st.popups.length) {
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(9 * scale)}px sans-serif`;
      for (const pop of st.popups) {
        const a = Math.min(1, pop.life / (pop.max * 0.4));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#0b0b14';
        ctx.fillText(pop.text, (pop.x - camX) * scale + 1, (pop.y - camY) * scale + 1);
        ctx.fillStyle = '#e9e5ff';
        ctx.fillText(pop.text, (pop.x - camX) * scale, (pop.y - camY) * scale);
      }
      ctx.globalAlpha = 1;
    }
    if (st.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.5, st.flash);
      ctx.fillStyle = st.flashColor;
      ctx.fillRect(0, 0, VIEW_W * scale, VIEW_H * scale);
      ctx.globalAlpha = 1;
    }
  }

  return {
    sound: snd,
    setWorld(world) { st.world = world; particles.clear(); st.popups.length = 0; st.flags.clear(); st.anchorY = null; },
    setBiome(nextBiome, nextPalette) { biome = nextBiome || 'meadow'; palette = nextPalette || DEFAULT_PALETTE; },
    handleEvent(d, type) { if (st.world) HANDLERS[type]?.(d || {}); },
    update,
    drawBackground,
    drawParticles,
    drawOverlay,
    get shake() { return { x: st.shakeX, y: st.shakeY }; },
    get squash() { return st.sq; },
    isFrozen: (now) => now < st.freezeUntil,
    /** 0..1: wie frisch ein Checkpoint erreicht wurde (für das Wehen der Fahne) */
    flagPulse(index) {
      const t = st.flags.get(index);
      return t === undefined ? 0 : Math.max(0, 1 - (performance.now() - t) / 700);
    },
    dispose() { unsubscribe(); },
  };
}
