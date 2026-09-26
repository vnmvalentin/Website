// ui/anim/particles.js — Partikel über ein Canvas-Overlay mit Object-Pool (Staub, Asche, Wachs, Glut, Tusche, Knochen).
// Die Schleife läuft nur, solange Partikel leben; bei „Animationen reduzieren“ entstehen deutlich weniger.

const POOL_SIZE = 700;

/** @typedef {{ alive: boolean, x: number, y: number, vx: number, vy: number, life: number, max: number, size: number,
 *   color: string, kind: string, g: number, drag: number, rot: number, vr: number, tx?: number, ty?: number, t0?: number }} P */

const PRESETS = {
  dust: { n: 16, color: ["#bfa77a", "#8f7b55", "#d9c9a3"], speed: [0.6, 2.2], up: -0.6, life: [380, 700], size: [1.5, 3.5], g: 0.02, drag: 0.94 },
  ash: { n: 26, color: ["#3a3128", "#6b6258", "#a8966c", "#1a1612"], speed: [0.4, 2.4], up: -1.4, life: [600, 1200], size: [1, 3], g: -0.012, drag: 0.97 },
  wax: { n: 14, color: ["#8e1b1b", "#b3302a", "#5c0f0f"], speed: [0.6, 2.6], up: -1.2, life: [500, 900], size: [1.5, 3.2], g: 0.06, drag: 0.96 },
  ember: { n: 22, color: ["#f2b54a", "#ffd98a", "#e0762a"], speed: [0.3, 1.6], up: -1.8, life: [700, 1400], size: [1, 2.4], g: -0.02, drag: 0.98 },
  ink: { n: 12, color: ["#1a1612", "#2c241c"], speed: [0.8, 2.8], up: -0.4, life: [300, 600], size: [1.5, 4], g: 0.05, drag: 0.9 },
  splash: { n: 18, color: ["#5f8f93", "#9ec4c6", "#3f6c70"], speed: [1, 3], up: -2.2, life: [400, 700], size: [1.2, 2.6], g: 0.12, drag: 0.97 },
  spark: { n: 10, color: ["#fff2c4", "#f2b54a"], speed: [1.5, 4], up: -0.5, life: [200, 420], size: [0.8, 1.8], g: 0.02, drag: 0.9 },
  shavings: { n: 16, color: ["#a57a4a", "#c49a66", "#6b4a2a"], speed: [1, 3], up: -1.8, life: [500, 900], size: [1.5, 3], g: 0.09, drag: 0.96 },
};

class Particles {
  constructor() {
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.ctx = null;
    /** @type {P[]} */
    this.pool = Array.from({ length: POOL_SIZE }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: "#000", kind: "dust", g: 0, drag: 1, rot: 0, vr: 0 }));
    this.running = false;
    this.reduced = false;
    this.last = 0;
    this.frame = this.frame.bind(this);
    this.dpr = 1;
  }

  /** @param {HTMLCanvasElement} canvas */
  attach(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
  }

  detach() {
    this.canvas = null;
    this.ctx = null;
    this.pool.forEach((p) => (p.alive = false));
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
  }

  /** @returns {P|null} */
  take() {
    for (const p of this.pool) if (!p.alive) return p;
    return null;
  }

  /**
   * @param {keyof typeof PRESETS} kind @param {number} x Bildschirmkoordinate @param {number} y @param {{ n?: number, spread?: number }} [o]
   */
  burst(kind, x, y, o = {}) {
    if (!this.ctx) return;
    const pr = PRESETS[kind];
    if (!pr) return;
    const n = Math.round((o.n ?? pr.n) * (this.reduced ? 0.25 : 1));
    const spread = o.spread ?? 1;
    for (let i = 0; i < n; i++) {
      const p = this.take();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = pr.speed[0] + Math.random() * (pr.speed[1] - pr.speed[0]);
      p.alive = true;
      p.kind = kind;
      p.x = x + (Math.random() - 0.5) * 16 * spread;
      p.y = y + (Math.random() - 0.5) * 10 * spread;
      p.vx = Math.cos(a) * sp * spread;
      p.vy = Math.sin(a) * sp * 0.7 + pr.up;
      p.max = pr.life[0] + Math.random() * (pr.life[1] - pr.life[0]);
      p.life = p.max;
      p.size = pr.size[0] + Math.random() * (pr.size[1] - pr.size[0]);
      p.color = pr.color[Math.floor(Math.random() * pr.color.length)];
      p.g = pr.g;
      p.drag = pr.drag;
      p.rot = Math.random() * 6;
      p.vr = (Math.random() - 0.5) * 0.3;
      p.tx = undefined;
    }
    this.start();
  }

  /**
   * Ein Objekt fliegt von A nach B (Knochen zum Haufen, Blutstropfen in die Schale).
   * @param {"bone"|"blood"|"weight"} kind @param {{x:number,y:number}} from @param {{x:number,y:number}} to @param {number} [ms]
   */
  fly(kind, from, to, ms = 600) {
    if (!this.ctx) return;
    const p = this.take();
    if (!p) return;
    p.alive = true;
    p.kind = kind;
    p.x = from.x;
    p.y = from.y;
    p.tx = to.x;
    p.ty = to.y;
    p.vx = from.x;
    p.vy = from.y;
    p.max = this.reduced ? ms * 0.4 : ms;
    p.life = p.max;
    p.size = kind === "bone" ? 9 : 6;
    p.color = kind === "blood" ? "#8e1b1b" : kind === "weight" ? "#6b5230" : "#e8dfcc";
    p.rot = 0;
    p.vr = 0.25;
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** @param {number} now */
  frame(now) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) { this.running = false; return; }
    const dt = Math.min(40, now - this.last);
    this.last = now;
    const k = dt / 16.67;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let any = false;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      any = true;
      const t = 1 - p.life / p.max;
      if (p.tx !== undefined) {
        // Bogenflug: Start (vx,vy) → Ziel (tx,ty), Scheitel darüber
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        p.x = p.vx + (p.tx - p.vx) * e;
        p.y = p.vy + ((p.ty ?? p.vy) - p.vy) * e - Math.sin(Math.PI * t) * 60;
        p.rot += p.vr * k;
        this.drawObject(ctx, p);
        continue;
      }
      p.vx *= Math.pow(p.drag, k);
      p.vy = p.vy * Math.pow(p.drag, k) + p.g * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      const alpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === "ember" || p.kind === "spark") {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
      } else ctx.shadowBlur = 0;
      if (p.kind === "shavings" || p.kind === "ash") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (any) requestAnimationFrame(this.frame);
    else this.running = false;
  }

  /** @param {CanvasRenderingContext2D} ctx @param {P} p */
  drawObject(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#1a1612";
    ctx.fillStyle = p.color;
    if (p.kind === "bone") {
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      for (const [x, y] of [[-7, -2], [-7, 2], [7, -2], [7, 2]]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillRect(-6, -1.5, 12, 3);
    } else if (p.kind === "blood") {
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.bezierCurveTo(4, -2, 5, 2, 0, 5);
      ctx.bezierCurveTo(-5, 2, -4, -2, 0, -7);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-5, -4, 10, 8);
      ctx.strokeRect(-5, -4, 10, 8);
    }
    ctx.restore();
  }
}

export const particles = new Particles();

/** Mittelpunkt eines Elements mit data-uid bzw. Selektor (Bildschirmkoordinaten). @param {string} selector */
export function centerOf(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
