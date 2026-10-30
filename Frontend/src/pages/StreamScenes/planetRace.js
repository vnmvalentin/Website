// planetRace.js — „Planetenlauf“: Chat-Rennen einmal um den BRB-Planeten (planetScene.js).
//
// Ablauf: Jemand schreibt !rennen → die Anmeldung öffnet, der Streamer bleibt stehen und tritt an
// den Rand. Wer !rennen schreibt, läuft zu ihm und stellt sich hinter der Start-/Ziellinie auf.
// Nach der Anmeldung fallen die Hindernisse vom Himmel, Countdown, und alle laufen einmal um den
// Planeten (eine Runde = 2πR) zurück zur Linie. Die Kamera folgt der Spitze. Danach Ergebnis,
// die Läufer gehen auseinander, Hindernisse und Tor versinken, der Streamer läuft weiter.
//
// Hindernisse: Hürde (Sprung, manchmal Stolpern), Schlammpfütze (langsam), Pylonen-Slalom
// (etwas langsamer, Zickzack), Turbo-Pfeile (kurz schneller). Dazu Tagesform, kurze Antritte und
// eine Aufhol-Regel, damit das Feld zusammenbleibt und es Überholungen gibt.
import * as THREE from 'three';
import { R, ROAD_HALF, WALK_H, surfacePose } from './planetWorld';
import { canvasTexture, clamp01 } from './sceneKit';
import { buildLabel, fillBubble } from './partyDancers';
import { PERSON_WALK_MPS } from './peopleFigure';
import { requestLook } from './sceneLink';

export const LAP = Math.PI * 2 * R;
/** Befehl im Chat: !rennen / !race, optional mit Zusatz (join, stop). */
export const RACE_CMD = /^!(rennen|race)\b\s*([a-zäöü]+)?/i;

const LINE = 3.0;                // Start-/Ziellinie so weit vor dem Streamer
const MAX_RUNNERS = 20;
const LANES = [-1.8, -0.6, 0.6, 1.8];
/** Tempo des Clips „jog“ bei timeScale 1: an den Fußknochen gemessen 5× so schnell wie „walk“. */
export const JOG_MPS = PERSON_WALK_MPS * 5;
const COUNTDOWN_S = 4;
const RESULTS_S = 10;
const SCATTER_S = 3.5;
const AFTER_FIRST_S = 25;
const MAX_RACE_S = 170;
const BUBBLE_MS = 7000;

const sinkOf = (x, z) => (x * x + z * z) / (2 * R);
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

function checkerTexture() {
  return canvasTexture(512, 64, (ctx, w, h) => {
    const n = 32, m = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect((i * w) / n, (j * h) / m, w / n + 1, h / m + 1);
    }
  });
}

function bannerTexture() {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#16181f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2c64a';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 76px Inter, Roboto, system-ui, sans-serif';
    ctx.fillText('START  ·  ZIEL', w / 2, h / 2 - 2);
  });
}

function stripeTexture() {
  return canvasTexture(256, 32, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d4232f';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 32, h);
  });
}

function chevronTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23a';
    for (const y0 of [30, 120]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y0); ctx.lineTo(w - 30, y0 + 70); ctx.lineTo(w - 70, y0 + 100);
      ctx.lineTo(w / 2, y0 + 45); ctx.lineTo(70, y0 + 100); ctx.lineTo(30, y0 + 70); ctx.closePath();
      ctx.fill();
    }
  });
}

/**
 * @param {{ planet: THREE.Object3D, overlay: HTMLElement,
 *   makeFigure: (userId: string, login: string) => object,
 *   placeLabel: (el: HTMLElement, fig: object, show: boolean, z: number) => void }} opts
 */
export function createPlanetRace({ planet, overlay, makeFigure, placeLabel }) {
  const owned = [];
  const keep = (x) => { owned.push(x); return x; };
  const std = (o) => keep(new THREE.MeshStandardMaterial({ roughness: 0.75, ...o }));
  const st = {
    phase: 'idle',               // idle | lobby | countdown | race | results | scatter
    phaseAt: 0,
    clock: 0,                    // Szenenzeit des Laufs (Summe der Bildzeiten)
    startA: 0,                   // Drehwinkel, an dem der Streamer steht
    lobbyEnd: 0,
    raceT0: 0,
    firstAt: 0,
    places: 0,
    note: '',
  };
  const runners = new Map();
  const lineA = () => st.startA + LINE / R;

  // ── Bauteile: alles fällt vom Himmel und versinkt am Ende ──
  const props = [];               // { group, inner, i }
  const addProp = (build, a, dropAt, lat = 0) => {
    const group = new THREE.Group();
    surfacePose(group, a, lat, 0);
    const inner = new THREE.Group();
    group.add(inner);
    build(inner);
    group.visible = false;
    planet.add(group);
    const p = { group, inner, dropAt };
    props.push(p);
    return p;
  };
  /** Teil in Prop-Koordinaten setzen (x seitlich, −z vorwärts), mit Kugelwölbung. */
  const put = (inner, mesh, x, y, z) => { mesh.position.set(x, y - sinkOf(x, z), z); mesh.castShadow = true; inner.add(mesh); return mesh; };

  const box = (w, h, d) => keep(new THREE.BoxGeometry(w, h, d));
  const dark = std({ color: '#23262d', roughness: 0.5, metalness: 0.3 });
  const bannerTex = keep(bannerTexture().tex);
  const bannerMat = std({ map: bannerTex, emissive: '#ffffff', emissiveMap: bannerTex, emissiveIntensity: 0.25 });
  const stripeTex = keep(stripeTexture().tex);
  const stripeMat = std({ map: stripeTex });
  const checkerTex = keep(checkerTexture().tex);
  const checkerMat = std({ map: checkerTex, roughness: 0.6 });
  const mudMat = std({ color: '#4a3424', roughness: 0.25 });
  const mudDark = std({ color: '#33231a', roughness: 0.3 });
  const coneMat = std({ color: '#ff6a1a', roughness: 0.55 });
  const white = std({ color: '#f4f4f4', roughness: 0.5 });
  const chevTex = keep(chevronTexture().tex);
  const chevMat = keep(new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, color: new THREE.Color('#ffd23a').multiplyScalar(1.6), toneMapped: false, depthWrite: false }));
  const coneGeo = keep(new THREE.ConeGeometry(0.2, 0.7, 14));
  const bandGeo = keep(new THREE.CylinderGeometry(0.1, 0.14, 0.11, 14));

  /** Start-/Zieltor mit Zielstreifen. */
  const buildGate = (inner) => {
    for (const s of [-1, 1]) put(inner, new THREE.Mesh(box(0.2, 3.5, 0.2), dark), s * 3.15, WALK_H + 1.75, 0);
    const mats = [dark, dark, dark, dark, bannerMat, bannerMat];
    put(inner, new THREE.Mesh(box(6.7, 0.85, 0.12), mats), 0, WALK_H + 3.5, 0);
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * ROAD_HALF, 0.6)), checkerMat);
    line.rotation.x = -Math.PI / 2;
    line.receiveShadow = true;
    put(inner, line, 0, 0.045, 0).castShadow = false;
  };

  /** Hindernisse: d = Abstand ab der Linie (m). */
  const OBST = {
    hurdle: {
      range: [-0.3, 0.3],
      build(inner) {
        for (const s of [-1, 1]) {
          put(inner, new THREE.Mesh(box(0.08, 0.6, 0.08), dark), s * 2.4, 0.33, 0);
          put(inner, new THREE.Mesh(box(0.1, 0.05, 0.7), dark), s * 2.4, 0.05, 0);
        }
        put(inner, new THREE.Mesh(box(5.0, 0.13, 0.05), stripeMat), 0, 0.58, 0);
      },
    },
    mud: {
      range: [-2.6, 2.6],
      build(inner) {
        const g = keep(new THREE.CircleGeometry(1, 28));
        const m = new THREE.Mesh(g, mudMat);
        m.rotation.x = -Math.PI / 2; m.scale.set(2.5, 2.8, 1);
        put(inner, m, 0, 0.05, 0).castShadow = false;
        for (const [x, z, s] of [[-1, 0.8, 0.7], [0.9, -1.1, 0.6], [0.2, 1.6, 0.4]]) {
          const d = new THREE.Mesh(g, mudDark);
          d.rotation.x = -Math.PI / 2; d.scale.set(s, s * 0.8, 1);
          put(inner, d, x, 0.055, z).castShadow = false;
        }
      },
    },
    cones: {
      range: [-3.2, 3.2],
      build(inner) {
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Group();
          const body = new THREE.Mesh(coneGeo, coneMat); body.position.y = 0.36; body.castShadow = true;
          const band = new THREE.Mesh(bandGeo, white); band.position.y = 0.44;
          c.add(body, band);
          put(inner, c, (i % 2 ? 1 : -1) * 0.9, 0.03, 3 - i * 1.5);
        }
      },
    },
    boost: {
      range: [-2.2, 2.2],
      build(inner) {
        const g = keep(new THREE.PlaneGeometry(1.6, 1.6));
        for (const x of [-1.6, 0, 1.6]) {
          for (const z of [1.2, -0.6]) {
            const m = new THREE.Mesh(g, chevMat);
            m.rotation.x = -Math.PI / 2;
            put(inner, m, x, 0.06, z).castShadow = false;
          }
        }
      },
    },
  };

  let obstacles = [];             // { type, d, prop }
  const clearProps = () => {
    for (const p of props) { planet.remove(p.group); }
    props.length = 0;
    obstacles = [];
  };

  // ── Anzeige (HTML) ──
  const ui = document.createElement('div');
  ui.className = 'pr-ui';
  const banner = document.createElement('div');
  banner.className = 'pr-banner';
  const board = document.createElement('div');
  board.className = 'pr-board';
  const big = document.createElement('div');
  big.className = 'pr-big';
  ui.append(banner, board, big);
  overlay.append(ui);
  let uiAt = 0;
  let lastBig = '';

  const setPhase = (p, t) => { st.phase = p; st.phaseAt = t; };

  // ── Läufer ──
  const removeRunner = (r) => {
    planet.remove(r.outer);
    r.fig.dispose();
    r.label.el.remove();
    runners.delete(r.userId);
  };

  const join = (msg) => {
    const t = st.clock;
    if (st.phase !== 'lobby' || runners.has(msg.userId) || runners.size >= MAX_RUNNERS) return false;
    const fig = makeFigure(msg.userId, String(msg.name || '').toLowerCase());
    const outer = new THREE.Group();
    outer.add(fig.group);
    planet.add(outer);
    const label = buildLabel(msg.name, msg.color || '#ffffff', false);
    label.el.classList.add('sp-tag--run');
    label.el.style.display = 'none';
    overlay.append(label.el);
    const n = runners.size;
    const side = Math.random() < 0.5 ? -1 : 1;
    const r = {
      userId: msg.userId, name: msg.name, color: msg.color || '#ffffff', fig, outer, label,
      // kommt vom Gehweg neben dem Streamer
      d: -LINE + (Math.random() * 8 - 6), lat: side * (3.3 + Math.random() * 0.8),
      gridD: -0.9 - Math.floor(n / LANES.length) * 1.0, gridLat: LANES[n % LANES.length],
      v: 0, base: 3.25 + (Math.random() - 0.5) * 0.16, surge: 1, surgeAt: 0,
      latGoal: 0, latAt: 0, jumpT: -1, jumpFail: false, stumbleUntil: 0, boostUntil: 0, hit: new Set(),
      done: false, place: 0, time: 0, stopD: 0, yaw: 0, anim: '', bubbleUntil: 0, alpha: 1, scatterLat: 0, joinedAt: t,
    };
    r.latGoal = r.gridLat;
    runners.set(r.userId, r);
    return true;
  };

  const play = (r, name, opts) => { if (r.anim !== name) { r.fig.play(name, { fade: 0.25, ...opts }); r.anim = name; } };

  /** Läufer auf die Oberfläche setzen (Bahnposition d, seitlich lat). */
  const pose = (r, y = 0) => {
    const onWalk = Math.abs(r.lat) > ROAD_HALF;
    surfacePose(r.outer, lineA() + r.d / R, r.lat, onWalk ? WALK_H : 0.02);
    r.fig.group.position.y = y;
    r.fig.group.rotation.y = r.yaw;
  };

  /** Richtung (Figur-Drehung) für eine Bewegung um (dd vorwärts, dl seitlich). */
  const yawFor = (dd, dl) => Math.atan2(dl, -dd);
  const turn = (r, goal, dt, rate = 8) => {
    let d = goal - r.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.yaw += d * clamp01(dt * rate);
  };

  /** Zu einem Punkt laufen; true = angekommen. */
  const moveTo = (r, td, tl, speed, dt) => {
    const dd = td - r.d, dl = tl - r.lat;
    const dist = Math.hypot(dd, dl);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    r.d += (dd / dist) * step;
    r.lat += (dl / dist) * step;
    turn(r, yawFor(dd, dl), dt);
    return false;
  };

  // ── Rennen ──
  const placeObstacles = (t) => {
    const types = Object.keys(OBST);
    let prev = '';
    for (let d = 20; d < LAP - 16; d += 24 + Math.random() * 6) {
      let type = types[Math.floor(Math.random() * types.length)];
      if (type === prev) type = types[(types.indexOf(type) + 1) % types.length];
      prev = type;
      const prop = addProp(OBST[type].build, lineA() + d / R, t + (obstacles.length % 6) * 0.12);
      obstacles.push({ type, d, prop });
    }
  };

  const ranking = () => [...runners.values()].sort((a, b) => {
    if (a.done !== b.done) return a.done ? -1 : 1;
    if (a.done) return a.place - b.place;
    return b.d - a.d;
  });

  const updateRace = (r, t, dt, meanD) => {
    if (r.done) {
      // auslaufen hinter der Linie
      const more = r.stopD - r.d;
      if (more > 0.02) { r.d += Math.min(more, Math.max(0.6, r.v * 0.8) * dt * 1.6); r.v *= 0.97; play(r, 'jog', { timeScale: 0.9 }); }
      else play(r, r.place === 1 ? 'clapjump' : 'idle');
      turn(r, Math.PI, dt, 4);
      return 0;
    }
    if (t > r.surgeAt) { r.surgeAt = t + 1.5 + Math.random() * 2; r.surge = 0.86 + Math.random() * 0.28; }
    let k = r.surge;
    if (r.d < meanD - 4) k *= 1.08;
    else if (r.d > meanD + 4) k *= 0.95;
    let weave = 0;
    for (const o of obstacles) {
      const [a, b] = OBST[o.type].range;
      const rel = r.d - o.d;
      if (o.type === 'hurdle') {
        if (rel > -0.9 && r.jumpT < 0 && !r.hit.has(o)) { r.hit.add(o); r.jumpT = 0; r.jumpFail = Math.random() < 0.25; }
      } else if (rel > a && rel < b) {
        if (o.type === 'mud') k *= 0.45;
        else if (o.type === 'cones') { k *= 0.8; weave = Math.sin((rel - a) * 2.1) * 1.4; }
        else if (o.type === 'boost' && !r.hit.has(o)) { r.hit.add(o); r.boostUntil = t + 2.2; }
      }
    }
    if (t < r.boostUntil) k *= 1.55;
    let y = 0;
    if (r.jumpT >= 0) {
      r.jumpT += dt / 0.55;
      y = (r.jumpFail ? 0.28 : 0.55) * Math.sin(Math.PI * Math.min(1, r.jumpT));
      if (r.jumpT >= 1) {
        r.jumpT = -1;
        if (r.jumpFail) { r.stumbleUntil = t + 1.1; r.fig.play('jumpLand', { fade: 0.1, once: true }); r.anim = 'jumpLand'; }
      }
    }
    const target = t < r.stumbleUntil ? 0 : r.base * k;
    r.v += (target - r.v) * clamp01(dt * (target < r.v ? 6 : 1.8));
    r.d += r.v * dt;
    // Spurwechsel ab und zu, im Slalom Zickzack
    if (t > r.latAt) { r.latAt = t + 3 + Math.random() * 3; r.latGoal = Math.max(-2.1, Math.min(2.1, r.latGoal + (Math.random() - 0.5) * 1.6)); }
    const goal = weave ? weave : r.latGoal;
    const dl = (goal - r.lat) * clamp01(dt * 1.5);
    r.lat += dl;
    turn(r, yawFor(Math.max(0.3, r.v * dt), dl), dt, 6);
    if (t >= r.stumbleUntil && r.jumpT < 0) {
      if (r.anim === 'jumpLand' && !r.fig.isDone?.()) { /* Landung ausspielen */ } else play(r, 'jog');
      r.fig.setTimeScale(Math.min(2.4, Math.max(0.6, r.v / JOG_MPS)));
    }
    if (r.d >= LAP) {
      r.done = true;
      r.place = ++st.places;
      r.time = t - st.raceT0;
      r.stopD = LAP + 2.6 + (r.place - 1) * 0.45;
      if (!st.firstAt) st.firstAt = t;
    }
    return y;
  };

  // ── Anzeige ──
  const updateUi = (t) => {
    const p = st.phase;
    if (p === 'idle') { ui.hidden = true; return; }
    ui.hidden = false;
    let b = '';
    if (p === 'lobby') {
      const left = Math.max(0, Math.ceil(st.lobbyEnd - t));
      b = `<div class="pr-title">Planetenlauf</div><div class="pr-sub">Schreib <b>!rennen</b> zum Mitmachen · noch ${left} s · ${runners.size} Läufer</div>`;
    } else if (p === 'countdown' || p === 'race') {
      const lead = ranking()[0];
      b = `<div class="pr-title">Planetenlauf</div><div class="pr-sub">${p === 'race' && lead ? `Vorne: <b>${escapeHtml(lead.name)}</b>` : 'Gleich geht es los'}</div>`;
    } else if (p === 'results' || p === 'scatter') {
      const top = ranking().filter((r) => r.done).slice(0, 3);
      b = `<div class="pr-title">Ergebnis</div>${top.length ? top.map((r) => `<div class="pr-row"><span class="pr-place">${r.place}.</span><span class="pr-name" style="color:${r.color}">${escapeHtml(r.name)}</span><span class="pr-time">${fmtTime(r.time)}</span></div>`).join('') : `<div class="pr-sub">${st.note || 'Niemand im Ziel'}</div>`}`;
    }
    if (banner.innerHTML !== b) banner.innerHTML = b;
    // Zwischenstand während des Rennens
    if (p === 'race') {
      const list = ranking().slice(0, 8);
      board.hidden = false;
      board.innerHTML = list.map((r, i) => `<div class="pr-row"><span class="pr-place">${r.done ? r.place : i + 1}.</span><span class="pr-name" style="color:${r.color}">${escapeHtml(r.name)}</span>${r.done ? `<span class="pr-time">${fmtTime(r.time)}</span>` : `<span class="pr-time">${Math.round(Math.min(100, (Math.max(0, r.d) / LAP) * 100))} %</span>`}</div>`).join('');
    } else board.hidden = true;
  };

  return {
    get phase() { return st.phase; },
    get startA() { return st.startA; },
    get active() { return st.phase !== 'idle'; },
    isRunner: (id) => runners.has(id),

    /** Anmeldung öffnen; startA = Drehwinkel, an dem der Streamer anhalten wird. */
    open(_t, startA, joinSec = 30) {
      if (st.phase !== 'idle') return false;
      const t = st.clock;
      st.startA = startA;
      st.lobbyEnd = t + Math.max(10, joinSec);
      st.places = 0; st.firstAt = 0; st.note = '';
      addProp(buildGate, lineA(), t);
      setPhase('lobby', t);
      return true;
    },
    join,
    /** Chatnachricht eines Läufers als Sprechblase. true = übernommen. */
    say(msg) {
      const r = runners.get(msg.userId);
      if (!r) return false;
      fillBubble(r.label.bubble, msg.parts);
      r.label.bubble.classList.add('is-on');
      r.bubbleUntil = performance.now() + BUBBLE_MS;
      return true;
    },
    /** Neue Figur aus dem Figurbaukasten: Läufer sofort umbauen (Cache hat planetScene schon geleert). */
    refreshLook(id, login) {
      const r = runners.get(id);
      if (!r) return;
      const fig = r.fig;
      requestLook(id, (lk) => { if (r.fig === fig) fig.setOutfit(lk); }, login);
    },
    clearUser(id) { const r = runners.get(id); if (r) { r.label.bubble.classList.remove('is-on'); r.bubbleUntil = 0; } },
    /** Abbrechen (Steuerpult, !rennen stop, Störungsmodus): alle gehen auseinander. */
    abort() {
      if (st.phase === 'idle' || st.phase === 'scatter') return;
      const t = st.clock;
      st.note = 'Abgebrochen';
      for (const r of runners.values()) r.scatterLat = (r.lat >= 0 ? 1 : -1) * (4.6 + Math.random());
      setPhase('scatter', t);
    },
    /**
     * Gewünschte Drehung des Planeten (Kamera folgt der Spitze) oder null (stehen bleiben).
     * Am Ende genau eine Runde weiter als der Start — dort steht der Streamer wieder.
     */
    focus() {
      if (st.phase === 'race') {
        const top = ranking().slice(0, 3);
        const d = top.length ? Math.min(LAP, Math.max(0, top.reduce((a, r) => a + r.d, 0) / top.length)) : 0;
        return st.startA + Math.min(Math.PI * 2, Math.max(0, (d + LINE - 4) / R));
      }
      if (st.phase === 'results' || (st.phase === 'scatter' && st.places)) return st.startA + Math.PI * 2;
      return null;
    },
    /** Was der Streamer gerade tun soll. */
    streamerCue() {
      const p = st.phase;
      if (p === 'countdown') return 'wave';
      if (p === 'results') return 'clapjump';
      return 'idle';
    },
    update(_t, dt, beat) {
      st.clock += dt;
      const t = st.clock;
      const now = performance.now();
      const p = st.phase;
      if (p === 'idle') { updateUi(t); return; }

      // Phasenwechsel
      if (p === 'lobby' && t >= st.lobbyEnd) {
        if (!runners.size) { st.note = 'Niemand hat mitgemacht'; setPhase('scatter', t); }
        else { placeObstacles(t); setPhase('countdown', t); }
      } else if (p === 'countdown' && t - st.phaseAt >= COUNTDOWN_S) {
        st.raceT0 = t;
        setPhase('race', t);
      } else if (p === 'race') {
        const all = [...runners.values()].every((r) => r.done);
        if (all || (st.firstAt && t - st.firstAt > AFTER_FIRST_S) || t - st.raceT0 > MAX_RACE_S) setPhase('results', t);
      } else if (p === 'results' && t - st.phaseAt >= RESULTS_S) {
        for (const r of runners.values()) r.scatterLat = (r.lat >= 0 ? 1 : -1) * (4.6 + Math.random());
        setPhase('scatter', t);
      } else if (p === 'scatter' && t - st.phaseAt >= SCATTER_S + 1) {
        for (const r of [...runners.values()]) removeRunner(r);
        clearProps();
        setPhase('idle', t);
        updateUi(t);
        return;
      }

      // Bauteile: fallen herunter (Tor sofort, Hindernisse beim Countdown), versinken beim Auseinandergehen
      for (const pr of props) {
        pr.group.visible = true;
        if (st.phase === 'scatter') {
          const k = clamp01((t - st.phaseAt - 0.5) / 1.4);
          pr.inner.position.y = -k * 3;
          pr.inner.scale.setScalar(Math.max(0.05, 1 - k * 0.9));
        } else {
          const k = clamp01((t - pr.dropAt) / 0.9);
          pr.inner.position.y = (1 - k * k) * 14;
          pr.inner.scale.setScalar(1);
        }
      }

      // Läufer
      const active = [...runners.values()].filter((r) => !r.done);
      const meanD = active.length ? active.reduce((s, r) => s + r.d, 0) / active.length : 0;
      const ranks = st.phase === 'race' ? ranking() : null;
      for (const r of runners.values()) {
        let y = 0;
        if (st.phase === 'lobby' || st.phase === 'countdown') {
          if (moveTo(r, r.gridD, r.gridLat, 2.4, dt)) { turn(r, Math.PI, dt, 6); play(r, 'idle'); }
          else { play(r, 'jog'); r.fig.setTimeScale(2.4 / JOG_MPS); }
        } else if (st.phase === 'race') {
          y = updateRace(r, t, dt, meanD);
        } else if (st.phase === 'results') {
          updateRace(r, t, dt, meanD);
          if (!r.done) { play(r, 'idle'); }
        } else if (st.phase === 'scatter') {
          if (moveTo(r, r.d, r.scatterLat, 2.6, dt)) play(r, 'idle'); else { play(r, 'jog'); r.fig.setTimeScale(1.3); }
          const k = clamp01((t - st.phaseAt - SCATTER_S * 0.55) / (SCATTER_S * 0.45));
          r.fig.setOpacity(1 - k);
        }
        pose(r, y);
        r.fig.update(dt, beat);
        if (r.bubbleUntil && now > r.bubbleUntil) { r.bubbleUntil = 0; r.label.bubble.classList.remove('is-on'); }
        // Namensschilder: im Rennen nur die vordersten sechs (sonst ein Schilderwald)
        const rank = ranks ? ranks.indexOf(r) : 0;
        const show = st.phase !== 'scatter' && (rank < 6 || r.bubbleUntil > 0);
        placeLabel(r.label.el, r.fig, show, r.bubbleUntil ? 3500 : 2000);
      }

      // Großer Countdown
      let bigText = '';
      if (st.phase === 'countdown') {
        const left = COUNTDOWN_S - (t - st.phaseAt);
        bigText = left > 1 ? String(Math.ceil(left - 1)) : 'LOS!';
      } else if (st.phase === 'race' && t - st.raceT0 < 1) bigText = 'LOS!';
      if (bigText !== lastBig) { big.textContent = bigText; big.hidden = !bigText; lastBig = bigText; if (bigText) { big.classList.remove('is-pop'); void big.offsetWidth; big.classList.add('is-pop'); } }
      if (t - uiAt > 0.2) { uiAt = t; updateUi(t); }
    },
    dispose() {
      for (const r of [...runners.values()]) removeRunner(r);
      clearProps();
      ui.remove();
      for (const o of owned) o.dispose?.();
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
