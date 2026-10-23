// sceneKit.js — gemeinsame Bausteine der 3D-Stream-Szenen (Starting / Ending).
//
// Beide Szenen sind OBS-Browserquellen in 1920×1080: der Renderer füllt immer das
// ganze Fenster, die Szenen-Module bekommen nur noch Kamera, Szene und eine
// Bild-Schleife mit Zeit in Sekunden.
import * as THREE from 'three';

export const FONT = 'Inter, Roboto, system-ui, sans-serif';

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const easeInOut = (t) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
/** 0 → 1 zwischen den Zeitpunkten a und b (geglättet). */
export const phase = (t, a, b) => smooth((t - a) / (b - a));

/** Kann das Gerät WebGL? OBS braucht dafür Hardwarebeschleunigung in der Browserquelle. */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Wartet (höchstens ~2 s) auf die Inter-Schnitte, die auf die Canvas-Texturen gemalt werden. */
export function fontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  const loads = ['500', '700', '800', '900'].map((w) => document.fonts.load(`${w} 40px Inter`).catch(() => null));
  return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2000))]);
}

/**
 * Renderer + Bild-Schleife. `frame(t, dt)` bekommt Sekunden seit dem Start.
 * `onResize(w, h)` wird sofort und bei jeder Größenänderung gerufen.
 * `setPost(post)`: Nachbearbeitung (createPostFX aus scene3d/kit.js) statt renderer.render.
 */
export function createStage(canvas, { fov = 55, near = 0.05, far = 200, onResize } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, near, far);

  let post = null;
  const resize = () => {
    const w = window.innerWidth || 1920;
    const h = window.innerHeight || 1080;
    renderer.setSize(w, h, false);
    post?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(w, h);
  };
  window.addEventListener('resize', resize);

  let raf = 0;
  let start = 0;
  let last = 0;
  let frameFn = null;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!start) { start = now; last = now; }
    const t = (now - start) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frameFn?.(t, dt);
    // Nur Entwicklung: Prüfskripte setzen die Kamera frei ({ pos: [x,y,z], look: [x,y,z], fov? })
    const dbg = import.meta.env.DEV ? window.__stageCam : null;
    if (dbg) {
      camera.position.set(...dbg.pos);
      if (dbg.fov) { camera.fov = dbg.fov; camera.updateProjectionMatrix(); }
      camera.lookAt(...dbg.look);
    }
    if (post) post.render(dt); else renderer.render(scene, camera);
  };

  return {
    renderer, scene, camera,
    start(fn) {
      frameFn = fn;
      resize();
      raf = requestAnimationFrame(loop);
      if (import.meta.env.DEV) window.__stageScene = { scene, THREE };
    },
    resize,
    // Nur die Nachbearbeitung anpassen — onResize der Szene darf hier noch nicht laufen
    setPost(p) {
      post = p;
      post.setSize(window.innerWidth || 1920, window.innerHeight || 1080);
      if (import.meta.env.DEV) window.__stagePost = p;   // Prüfskripte: Bloom & Co. einzeln abschalten
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      post?.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}

/** Canvas + daraus gebaute Textur. `draw(ctx, w, h)` malt, `update()` lädt neu hoch. */
export function canvasTexture(w, h, draw, { repeat } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  const api = {
    canvas, ctx, tex,
    redraw(fn = draw) { fn?.(ctx, w, h); tex.needsUpdate = true; },
  };
  if (draw) api.redraw();
  return api;
}

/** Fester Pseudo-Zufall (gleiches Bild bei jedem Laden). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Feines Rauschen über eine Fläche — gegen sterile Einfarbflächen. */
export function noise(ctx, w, h, amount = 0.06, seed = 7, count = 9000) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${amount * r()})` : `rgba(255,255,255,${amount * 0.6 * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Text auf eine Breite kürzen (mit …). */
export function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/** Buchstabenabstand setzen, wo der Browser es kann (OBS ab CEF 103). */
export function spacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}
