// engine/fx.js — reine Optik: Schadenszahlen, Partikel, Blitzlinien, Bildschirmwackeln. Liegt im Spielzustand, damit
// der Renderer nur zeichnen muss; nichts hier beeinflusst das Spielgeschehen.

const MAX_TEXTS = 90;
const MAX_PARTICLES = 400;

export function floatText(g, x, y, text, color = "#fff", opts = {}) {
  const list = g.fx.texts;
  if (list.length >= MAX_TEXTS) list.shift();
  list.push({ x: x + (opts.jitter === false ? 0 : (g.fxRng() - 0.5) * 16), y, text: String(text), color, t: 0, life: opts.life ?? 0.8, size: opts.size ?? 15, rise: opts.rise ?? 42, dmg: !!opts.dmg });
}

export function burst(g, x, y, color, count = 8, speed = 160, life = 0.45, size = 4) {
  const list = g.fx.particles;
  for (let i = 0; i < count; i++) {
    if (list.length >= MAX_PARTICLES) list.shift();
    const a = g.fxRng() * Math.PI * 2;
    const s = speed * (0.4 + g.fxRng() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * (0.6 + g.fxRng() * 0.6), color, size });
  }
}

export function ring(g, x, y, r, color, life = 0.35) {
  g.fx.rings.push({ x, y, r, color, t: 0, life });
}

export function lightning(g, points, color = "#cfe8ff", life = 0.18) {
  g.fx.bolts.push({ points, color, t: 0, life });
}

// Waffenhieb (Kettenpeitsche): Bogen in Richtung angle (0 = rechts)
export function slash(g, x, y, angle, len, half) {
  g.fx.slashes.push({ x, y, angle, len, half, t: 0, life: 0.2 });
}

export function shake(g, amount) {
  g.fx.shake = Math.min(18, Math.max(g.fx.shake, amount));
}

export function updateFx(g, dt) {
  const fx = g.fx;
  for (const t of fx.texts) { t.t += dt; t.y -= t.rise * dt; }
  fx.texts = fx.texts.filter((t) => t.t < t.life);
  for (const p of fx.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
  fx.particles = fx.particles.filter((p) => p.t < p.life);
  for (const r of fx.rings) r.t += dt;
  fx.rings = fx.rings.filter((r) => r.t < r.life);
  for (const b of fx.bolts) b.t += dt;
  fx.bolts = fx.bolts.filter((b) => b.t < b.life);
  for (const s of fx.slashes) s.t += dt;
  fx.slashes = fx.slashes.filter((s) => s.t < s.life);
  fx.shake = Math.max(0, fx.shake - dt * 40);
}
