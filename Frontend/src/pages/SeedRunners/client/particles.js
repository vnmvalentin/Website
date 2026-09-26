// Partikel: kleine flache Vierecke, Kreise und Ringe. Reine Darstellung mit echter Bildzeit (dt) —
// Zufall und Math-Funktionen sind hier erlaubt, die Sim sieht davon nichts.
//
// Zwei Ebenen: 'back' wird vor der Figur gezeichnet (Staub, Nachbilder), 'front' danach (Funken,
// Konfetti). Die Zahl ist gedeckelt; ist der Deckel erreicht, werden neue Partikel verworfen.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export function createParticles(max = 600) {
  const list = [];

  /**
   * p: { x, y, vx, vy, ay, drag, life, size, size1, color, shape: 'rect'|'circle'|'ring'|'ghost', layer, w, h, spin }
   * `size1` ist die Größe am Ende der Lebensdauer (Standard 0 = schrumpft weg).
   */
  function add(p) {
    if (list.length >= max) return;
    list.push({
      x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0, ay: p.ay || 0, drag: p.drag || 0,
      life: p.life, max: p.life, size: p.size ?? 2, size1: p.size1 ?? 0,
      color: p.color || '#fff', shape: p.shape || 'rect', layer: p.layer || 'front',
      w: p.w, h: p.h, rot: p.rot || 0, spin: p.spin || 0,
    });
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  function draw(ctx, layer, view) {
    for (const p of list) {
      if (p.layer !== layer) continue;
      if (view && (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1)) continue;
      const t = 1 - p.life / p.max;               // 0 → 1 über die Lebensdauer
      const s = p.size + (p.size1 - p.size) * t;
      if (s <= 0.05) continue;
      ctx.globalAlpha = p.shape === 'ghost' ? 0.5 * (1 - t) : Math.min(1, (1 - t) * 1.6);
      if (p.shape === 'ring') {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.8, 1.6 * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.stroke();
      } else if (p.shape === 'circle') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s / 2, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'ghost') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      } else if (p.spin) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Bausteine ─────────────────────────────────────────────────────────────

  /** Strahlenförmiger Ausbruch: n Teilchen, Richtung zwischen a0 und a1 (Bogenmaß, 0 = rechts, −π/2 = oben). */
  function burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = rand(o.a0 ?? 0, o.a1 ?? TAU);
      const v = rand(o.v0 ?? 30, o.v1 ?? 90);
      add({
        x: x + rand(-(o.spread || 0), o.spread || 0), y: y + rand(-(o.spread || 0), o.spread || 0),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: o.ay ?? 0, drag: o.drag ?? 2,
        life: rand(o.l0 ?? 0.25, o.l1 ?? 0.5), size: rand(o.s0 ?? 1.5, o.s1 ?? 3), size1: o.size1 ?? 0,
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        shape: o.shape || 'rect', layer: o.layer || 'front', spin: o.spin ? rand(-8, 8) : 0, rot: rand(0, TAU),
      });
    }
  }

  /** Sich ausdehnender Ring (Druckwelle). */
  function ring(x, y, r0, r1, life, color, layer = 'front') {
    add({ x, y, life, size: r0, size1: r1, color, shape: 'ring', layer });
  }

  /** Nachbild der Figur (Dash-Spur). */
  function ghost(x, y, w, h, color) {
    add({ x, y, w, h, life: 0.22, color, shape: 'ghost', layer: 'back' });
  }

  return { list, add, update, draw, burst, ring, ghost, clear() { list.length = 0; } };
}
