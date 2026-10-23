// partyDancers.js — Chatter als tanzende Roboter auf der LED-Tanzfläche.
//
// Wer im Chat schreibt, kommt durch den Seiteneingang auf die Fläche und tanzt. Der Kopf ist eine
// Murmel mit dem Twitch-Profilbild (chatAvatars.js). Jede Figur tanzt einen Tanz 16–40 Schläge
// lang (eigene Taktung, nicht alle gleichzeitig), meist aus ihrem persönlichen Repertoire, und
// zieht nur ab und zu an einen neuen Punkt der Fläche. Figuren halten Abstand voneinander. Ist die Stimmung am Kochen (`energy` ≥ 1), gibt es
// nur noch die wilden Tänze.
//
// Drei Figurarten mit gleichem Ablauf:
//   • people — Comic-Figuren mit Motion-Capture-Tänzen (peopleFigure.js), der Normalfall;
//              das Profilbild steht dann im Namensschild
//   • mocap  — Roboter-Mannequin mit Murmelkopf (mocapFigure.js), per ?figuren=roboter oder als Ersatz
//   • pose   — errechnete Posen (chatterFigure.js), falls keine Figur-Datei lädt
// Bis feststeht, welche es wird, werden Nachrichten gesammelt und danach nachgereicht.
//
// Name und Nachricht sind HTML über der Figur (scharf, mit Emote-Bildern) — die Szene
// rechnet nur die Bildschirmposition aus.
//
// Tanzstil (Steuerseite): „auto“ nimmt bei harter, schneller Musik (ab RAVE_BPM) nur die
// Rave-Tänze (raveMoves.js, taktgekoppelt), sonst eine Mischung; dazu „mixed“, „rave“, „classic“.
// Statisten (setExtras) füllen die Fläche ohne Namensschild und zählen nicht für die Stimmung.
import * as THREE from 'three';
import { clamp01 } from './sceneKit';
import {
  buildFigure, applyPose, dancePose, walkPose, blendPose, neutralPose,
  MOVES, HYPE_MOVES, TRAVEL, POSE_KEYS,
} from './chatterFigure';
import { loadFigureKit, buildMocapFigure, beatScale, WALK_MPS } from './mocapFigure';
import { requestChatAvatar } from './chatAvatars';
import { loadPeopleKit, buildPersonFigure, personBeatScale, personSeed, PERSON_WALK_MPS } from './peopleFigure';
import { RAVE_MOVES } from './raveMoves';
import { requestLook } from './sceneLink';

const MAX_DANCERS = 60;
const IDLE_LEAVE_MS = 15 * 60 * 1000;
const BUBBLE_MS = 7000;
const MAX_BUBBLES = 7;
const FADE_S = 0.45;            // Überblendung zwischen zwei Bewegungen
const PERSONAL = 0.85;          // Mindestabstand zwischen zwei Figuren
/** Blickpunkt der Tänzer: ungefähr dort, wo die Kamera kreist. */
const FACE = new THREE.Vector3(0, 0, 14);

// ── Figurart: Posen (Ersatz) ────────────────────────────────────────────────
const STRIDE = 0.6;             // m pro halbem Schrittzyklus

function poseBody(msg, envMap) {
  const fig = buildFigure({ name: msg.name, color: msg.color, envMap });
  const poseA = neutralPose();
  const poseB = neutralPose();
  const pose = neutralPose();
  let src = { kind: 'walk' };
  let prev = src;
  let switchT = -10;
  let walkPhase = 0;
  const evalSrc = (s, b, out) => (s.kind === 'walk' ? walkPose(walkPhase, out) : dancePose(s.move, b, out));
  return {
    fig,
    group: fig.group,
    setActivity(next, t) {
      if (src.kind === next.kind && src.move === next.move) return;
      prev = src;
      src = next;
      switchT = t;
    },
    walked(dist) { walkPhase += dist * Math.PI / STRIDE; },
    isDone: () => false,
    update(dt, t, beat, yaw, hop, glow, baseY = 0) {
      evalSrc(src, beat, poseB);
      const k = (t - switchT) / FADE_S;
      if (k < 1) {
        evalSrc(prev, beat, poseA);
        blendPose(poseA, poseB, k <= 0 ? 0 : k * k * (3 - 2 * k), pose);
      } else {
        for (const key of POSE_KEYS) pose[key] = poseB[key];
      }
      if (hop > 0) {
        const hp = Math.sin(hop * Math.PI);
        pose.jump += hp * 0.45;
        pose.lUp += hp * 1.2; pose.rUp += hp * 1.2;
      }
      applyPose(fig, pose, yaw);
      fig.group.position.y = baseY;
      fig.setGlow(glow);
    },
    headTop: () => fig.group.position.y + fig.hatTop + Math.max(0, pose.jump) + pose.hipY,
    dispose: () => fig.dispose(),
  };
}

// ── Figurart: Motion Capture ────────────────────────────────────────────────
/** Einmal-Clips: laufen einmal durch, danach wird neu entschieden. */
const ONCE = new Set(['sideflip']);

function mocapBodyFactory(kit, getBpm) {
  return (msg, envMap) => {
    const fig = buildMocapFigure(kit, { name: msg.name, color: msg.color, envMap });
    let walkScale = 1;
    let srcKey = '';
    return {
      fig,
      group: fig.group,
      setActivity(next) {
        const key = next.kind === 'walk' ? 'walk' : next.move;
        if (key === srcKey) return;
        srcKey = key;
        if (next.kind === 'walk') fig.play('walk', { timeScale: walkScale, offset: Math.random() });
        else fig.play(next.move, { fade: next.fade ?? FADE_S, timeScale: beatScale(kit, next.move, getBpm()), offset: ONCE.has(next.move) ? 0 : Math.random(), once: ONCE.has(next.move) });
      },
      /** Gehtempo an die Geschwindigkeit anpassen (Füße rutschen sonst). */
      setWalkSpeed(mps) { walkScale = mps / WALK_MPS; if (srcKey === 'walk') fig.setTimeScale(walkScale); },
      walked() {},
      isDone: () => fig.isDone(),
      update(dt, t, beat, yaw, hop, glow, baseY = 0) {
        fig.group.rotation.y = yaw;
        fig.group.position.y = baseY + (hop > 0 ? 0.2 * Math.sin(hop * Math.PI) : 0);
        fig.update(dt);
        fig.setGlow(glow);
      },
      headTop: () => fig.group.position.y + fig.headTop(),
      dispose: () => fig.dispose(),
    };
  };
}

// ── Figurart: Comic-Figuren ─────────────────────────────────────────────────
function peopleBodyFactory(kit, getBpm, getLook) {
  return (msg, envMap) => {
    const seed = personSeed(msg.userId || msg.name);
    const fig = buildPersonFigure(kit, { seed, envMap, look: getLook?.(msg.userId, msg.name) || null });
    // Taktgekoppelte Tänze: jede Figur steigt an einer anderen Stelle der Schleife ein
    const shift = seed % 4;
    let walkScale = 1;
    let srcKey = '';
    return {
      fig,
      group: fig.group,
      avatarInLabel: true,
      setActivity(next) {
        const key = next.kind === 'walk' ? 'walk' : next.move;
        if (key === srcKey) return;
        srcKey = key;
        if (next.kind === 'walk') fig.play('walk', { timeScale: walkScale, offset: Math.random() });
        else fig.play(next.move, { fade: next.fade ?? FADE_S, timeScale: personBeatScale(kit, next.move, getBpm()), offset: ONCE.has(next.move) ? 0 : Math.random(), once: ONCE.has(next.move) });
      },
      setWalkSpeed(mps) { walkScale = mps / PERSON_WALK_MPS; if (srcKey === 'walk') fig.setTimeScale(walkScale); },
      setLook(look) { fig.setOutfit?.(look); },
      walked() {},
      isDone: () => fig.isDone(),
      update(dt, t, beat, yaw, hop, glow, baseY = 0) {
        fig.group.rotation.y = yaw;
        fig.group.position.y = baseY + (hop > 0 ? 0.16 * Math.sin(hop * Math.PI) : 0);
        fig.update(dt, beat + shift);
      },
      headTop: () => fig.group.position.y + fig.headTop(),
      dispose: () => fig.dispose(),
    };
  };
}

/** Tanzlisten je Figurart. travel: Tempo (m/s) und Blickrichtung zur Laufrichtung. */
const STYLES = {
  pose: {
    moves: MOVES,
    hype: HYPE_MOVES,
    travel: TRAVEL,
    walkSpeed: 2.2,
  },
  mocap: {
    moves: ['salsa', 'salsa2', 'charleston', 'charleston2', 'lambada', 'whirl', 'russian', 'mickey', 'groove', 'groove2', 'chicken', 'modern', 'danceQ'],
    hype: ['bhangra', 'jacks', 'hop', 'footwork', 'charleston2', 'russian', 'sideflip', 'bhangra', 'jacks', 'sideflip'],
    travel: {
      walk: { speed: 1.3, face: 'along' },
      moonwalk: { speed: 0.9, face: 'back' },
    },
    walkSpeed: 1.5,
  },
};
// Comic-Figuren: gleiche Tänze plus die errechneten Rave-Tänze; kürzere Beine → gemächlicher unterwegs
STYLES.people = {
  ...STYLES.mocap,
  rave: RAVE_MOVES,
  raveHype: ['handsup', 'handsup_m', 'jumpstyle', 'jumpstyle_m', 'fistpump', 'fistpump_m', 'hakken', 'hakken_m', 'clapjump', 'shuffle', 'shuffle_m', 'headbang', 'sideflip'],
  travel: {
    walk: { speed: 0.95, face: 'along' },
    moonwalk: { speed: 0.65, face: 'back' },
  },
  walkSpeed: 1.05,
};

/** Ab diesem Tempo gilt die Musik als „hart“ (Tanzstil auto → nur Rave). */
export const RAVE_BPM = 135;
export const DANCE_MODES = ['auto', 'mixed', 'rave', 'classic'];

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** HTML: Sprechblase über dem Namensschild. */
function buildLabel(name, color, withAvatar = false) {
  const el = document.createElement('div');
  el.className = 'sp-tag';
  const bubble = document.createElement('div');
  bubble.className = 'sp-bubble';
  const tag = document.createElement('div');
  tag.className = 'sp-name';
  tag.style.color = color;
  let avatar = null;
  if (withAvatar) {
    avatar = document.createElement('img');
    avatar.className = 'sp-avatar';
    avatar.alt = '';
    avatar.hidden = true;
    tag.append(avatar);
  }
  tag.append(document.createTextNode(name));
  el.append(bubble, tag);
  return { el, bubble, avatar };
}

function fillBubble(bubble, parts) {
  bubble.textContent = '';
  for (const p of parts) {
    if (p.emote) {
      const img = document.createElement('img');
      img.src = p.emote;
      img.alt = p.alt;
      img.className = 'sp-emote';
      bubble.append(img);
    } else {
      bubble.append(document.createTextNode(p.text));
    }
  }
}

const pick = (pool, not) => {
  let m = pool[Math.floor(Math.random() * pool.length)];
  if (m === not) m = pool[(pool.indexOf(m) + 1) % pool.length];
  return m;
};

/** Länge eines Tanzabschnitts in Schlägen: lang genug, dass ein Tanz sich entfalten kann. */
const DANCE_BEATS = [16, 40];
const HYPE_BEATS = [16, 32];
/** Ortswechsel sind die Ausnahme — wer angekommen ist, tanzt dort eine Weile. */
const TRAVEL_CHANCE = 0.22;
const HYPE_TRAVEL_CHANCE = 0.12;
/** Wechsel zwischen zwei Tänzen weicher als Gehen → Tanzen. */
const DANCE_FADE = 0.9;
const REPERTOIRE = 5;

const randBeats = ([a, b]) => a + Math.random() * (b - a);

/** Persönliche Lieblingstänze: fest je Person, damit nicht alle dieselben Tänze haben. */
function repertoire(pool, seed) {
  const list = [...pool];
  let s = seed || 1;
  for (let i = list.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0;
    const j = s % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return [...new Set(list)].slice(0, Math.min(REPERTOIRE, list.length));
}

/** Winkel weich nachführen (bildratenunabhängig). */
function turnTo(cur, goal, dt, rate) {
  let d = goal - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * clamp01(dt * rate);
}

/**
 * @param {THREE.Scene} scene
 * @param {HTMLElement} overlay  Container für die Namensschilder (deckt die Szene ab)
 * @param {{ x0: number, x1: number, z0: number, z1: number }} floor
 * @param {THREE.Vector3} door  Eingang (Boden)
 * @param {{ envMap?: THREE.Texture|null, bpm?: number, figures?: 'people'|'robots', floorTop?: number, getLook?: (userId: string) => object|null }} [opts]
 *   floorTop: Oberkante der Tanzfläche (die LED-Kacheln stehen über dem Hallenboden)
 *   getLook:  selbst gebaute Figur eines Zuschauers (avatarLooks.js), sonst die feste Zufallsfigur
 */
export function createDancers(scene, overlay, floor, door, { envMap = null, bpm: startBpm = 124, figures = 'people', floorTop = 0, getLook = null } = {}) {
  const dancers = new Map();    // userId → Tänzer
  if (import.meta.env.DEV) window.__partyDancers = dancers;   // Prüfskripte: Tanzwechsel messen
  const M = 0.6;                // Rand der Tanzfläche
  let bpm = startBpm;
  let danceMode = 'auto';
  let maxDancers = MAX_DANCERS;
  let extrasWanted = 0;
  let extraSeq = 0;
  let nextExtraAt = 0;
  const tmp = new THREE.Vector3();
  let energy = 0;
  let lastBeat = 0;             // zuletzt bekannter Takt (für Nachrichten zwischen zwei Bildern)
  let disposed = false;
  // Figurart steht erst nach dem Laden fest; bis dahin Nachrichten sammeln
  let style = null;
  let makeBody = null;
  const queued = [];
  const ready = (async () => {
    const people = figures === 'people' ? await loadPeopleKit() : null;
    const kit = people ? null : await loadFigureKit();
    if (disposed) return;
    if (people) { style = STYLES.people; makeBody = peopleBodyFactory(people, () => bpm, getLook); }
    else if (kit) { style = STYLES.mocap; makeBody = mocapBodyFactory(kit, () => bpm); }
    else { style = STYLES.pose; makeBody = poseBody; }
    for (const msg of queued.splice(0)) api.onMessage(msg);
  })();

  /** Freier Punkt auf der Fläche: mehrere Versuche, der mit dem meisten Abstand zu den anderen gewinnt. */
  const freePoint = (out, near = null) => {
    let best = -1;
    const cand = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      if (near) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.6 + Math.random() * 3;
        cand.set(near.x + Math.cos(a) * r, 0, near.z + Math.sin(a) * r);
      } else {
        // leichte Vorliebe für vorne (zur Kamera hin), damit man die Neuen gut sieht
        cand.set(floor.x0 + M + Math.random() * (floor.x1 - floor.x0 - 2 * M), 0, floor.z1 - M - Math.random() ** 1.5 * (floor.z1 - floor.z0 - 2 * M));
      }
      cand.x = Math.min(floor.x1 - M, Math.max(floor.x0 + M, cand.x));
      cand.z = Math.min(floor.z1 - M, Math.max(floor.z0 + M, cand.z));
      let nearest = Infinity;
      for (const d of dancers.values()) {
        if (d.state === 'leaving') continue;
        const p = d.body.group.position;
        nearest = Math.min(nearest, Math.hypot(p.x - cand.x, p.z - cand.z), d.dest ? d.dest.distanceTo(cand) : Infinity);
      }
      if (nearest > best) { best = nearest; out.copy(cand); }
      if (nearest > 1.6) break;
    }
    return out;
  };

  const remove = (d) => {
    scene.remove(d.body.group);
    d.body.dispose();
    d.label.el.remove();
    dancers.delete(d.userId);
  };

  const leave = (d) => {
    if (d.state === 'leaving') return;
    d.state = 'leaving';
    d.dest = door.clone();
    d.label.bubble.classList.remove('is-on');
  };

  /**
   * Tanz wählen: meist aus dem eigenen Repertoire, und bevorzugt einen, den gerade wenige
   * andere tanzen — sonst machen alle dasselbe.
   */
  /** Welche Tanzliste gerade gilt: 'rave', 'classic' oder 'mixed'. */
  const activeMode = () => {
    if (!style?.rave || danceMode === 'classic') return 'classic';
    if (danceMode === 'rave' || (danceMode === 'auto' && bpm >= RAVE_BPM)) return 'rave';
    return 'mixed';
  };
  const chooseMove = (d, hype) => {
    const mode = activeMode();
    const rave = mode === 'rave' || (mode === 'mixed' && Math.random() < 0.5);
    const pool = hype
      ? (rave ? style.raveHype : style.hype)
      : rave
        ? (Math.random() < 0.8 ? d.favsRave : style.rave)
        : (Math.random() < 0.8 ? d.favs : style.moves);
    const usage = new Map();
    for (const o of dancers.values()) if (o !== d && o.state === 'dancing') usage.set(o.move, (usage.get(o.move) || 0) + 1);
    let best = null, bestScore = Infinity;
    for (const m of pool) {
      if (m === d.move && pool.length > 1) continue;
      const score = (usage.get(m) || 0) + Math.random() * 1.5;
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best || pick(pool, d.move);
  };

  const danceNow = (d, t, beat, hype = energy >= 1) => {
    const wasDancing = d.state === 'dancing';
    d.state = 'dancing';
    d.move = chooseMove(d, hype);
    d.nextAt = beat + randBeats(hype ? HYPE_BEATS : DANCE_BEATS);
    d.body.setActivity({ kind: 'dance', move: d.move, fade: wasDancing ? DANCE_FADE : FADE_S }, t);
  };

  /** Nächster Abschnitt: meist am Platz weitertanzen, selten mit einem Ortswechsel woandershin. */
  const decide = (d, t, beat) => {
    const hype = energy >= 1;
    if (Math.random() < (hype ? HYPE_TRAVEL_CHANCE : TRAVEL_CHANCE)) {
      d.state = 'travel';
      d.move = pick(Object.keys(style.travel), d.move);
      d.travelT = t;
      d.nextAt = Infinity;      // Ende: bei Ankunft
      freePoint(d.dest, d.body.group.position);
      d.body.setWalkSpeed?.(style.travel[d.move].speed);
      d.body.setActivity({ kind: d.move === 'walk' ? 'walk' : 'dance', move: d.move }, t);
    } else {
      danceNow(d, t, beat, hype);
    }
  };

  /** Platz schaffen: erst Statisten gehen lassen, dann wer am längsten still war. */
  const makeRoom = () => {
    let active = 0;
    for (const d of dancers.values()) if (d.state !== 'leaving') active++;
    if (active < maxDancers) return;
    let oldest = null;
    for (const d of dancers.values()) {
      if (d.state === 'leaving') continue;
      if (!oldest || (d.extra && !oldest.extra) || (d.extra === oldest.extra && d.lastActive < oldest.lastActive)) oldest = d;
    }
    if (oldest) leave(oldest);
  };

  const join = (msg, now, extra = false) => {
    makeRoom();
    const seed = hash(msg.userId);
    const body = makeBody(msg, envMap);
    const label = buildLabel(msg.name, msg.color, !!body.avatarInLabel);
    if (extra) label.el.hidden = true;
    else {
      // Selbst gebaute Figur (Figurbaukasten): kommt sie nach dem ersten Bau, wird umgebaut
      if (body.setLook && !getLook?.(msg.userId, msg.name)) {
        requestLook(msg.userId, (look) => { if (look && dancers.get(msg.userId)?.body === body) body.setLook(look); }, msg.name);
      }
      requestChatAvatar({ userId: msg.userId, login: msg.name }, (img) => {
        body.fig.setAvatar(img);
        if (img && label.avatar) { label.avatar.src = img.src; label.avatar.hidden = false; }
      });
    }
    body.group.position.copy(door);
    scene.add(body.group);
    overlay.append(label.el);
    const d = {
      userId: msg.userId,
      body, label,
      dest: new THREE.Vector3(),
      state: 'entering',
      move: '',
      favs: repertoire(style.moves, seed),
      favsRave: style.rave ? repertoire(style.rave, seed) : [],
      extra,
      travelT: 0,
      nextAt: 0,
      offset: ((seed >> 4) % 1000) / 1000,
      lastActive: now,
      bubbleAt: 0,
      hop: 0,
      yaw: Math.PI / 2,
      baseY: 0,
    };
    body.setWalkSpeed?.(style.walkSpeed);
    body.setActivity({ kind: 'walk' }, now / 1000);
    freePoint(d.dest);
    dancers.set(msg.userId, d);
    return d;
  };

  const api = {
    /** Erfüllt sich, sobald feststeht, welche Figurart getanzt wird (Datei geladen oder Ersatz). */
    ready,
    /** Echte Chatter auf der Fläche (ohne Statisten). */
    count() {
      let n = 0;
      for (const d of dancers.values()) if (d.state !== 'leaving' && !d.extra) n++;
      return n + queued.length;
    },

    /** Tempo der Musik (Takt der Szene) — Mocap-Tänze passen ihre Schleifen daran an. */
    setBpm(b) { if (Number.isFinite(b) && b > 40 && b < 240) bpm = b; },
    setDanceMode(m) { if (DANCE_MODES.includes(m)) danceMode = m; },
    setMaxDancers(n) { maxDancers = Math.max(1, Math.min(MAX_DANCERS, Math.round(n) || MAX_DANCERS)); },

    /** Statisten: so viele namenlose Tänzer zusätzlich auf der Fläche halten. */
    setExtras(n) { extrasWanted = Math.max(0, Math.min(40, Math.round(n) || 0)); },

    /** Testmodus aus: die simulierten Chatter (userId „demo-…“) gehen. */
    clearDemo() {
      for (const d of dancers.values()) if (String(d.userId).startsWith('demo-')) leave(d);
      for (let i = queued.length - 1; i >= 0; i--) if (String(queued[i].userId).startsWith('demo-')) queued.splice(i, 1);
    },

    /** Steuerpult „Fläche räumen“: alle gehen (Statisten kommen von selbst wieder). */
    clearFloor() {
      for (const d of dancers.values()) leave(d);
      queued.length = 0;
    },

    /** Neue Figur für einen Zuschauer (Figurbaukasten) — wechselt sofort, wenn er gerade tanzt. */
    applyLook(userId, look) {
      const d = dancers.get(userId);
      if (d && d.state !== 'leaving') d.body.setLook?.(look);
    },

    /** 0 … 1+ — ab 1 tanzen alle nur noch die wilden Tänze. */
    setEnergy(e) {
      const wasHype = energy >= 1;
      energy = e;
      if (style && !wasHype && e >= 1) {
        // Stimmung kippt: alle steigen in den nächsten Schlägen auf wilde Tänze um — nicht alle im selben Moment
        for (const d of dancers.values()) {
          if (d.state === 'dancing') d.nextAt = Math.min(d.nextAt, lastBeat + Math.random() * 16);
        }
      }
    },

    onMessage(msg) {
      if (!style) {
        // Figur lädt noch: nur die letzte Nachricht je Person merken
        const i = queued.findIndex((q) => q.userId === msg.userId);
        if (i >= 0) queued.splice(i, 1);
        queued.push(msg);
        return;
      }
      const now = performance.now();
      let d = dancers.get(msg.userId);
      if (!d || d.state === 'leaving') {
        if (d) remove(d);
        d = join(msg, now);
      } else {
        // Neue Nachricht: Hüpfer, ab und zu ein neuer Tanz (nicht jedes Mal — sonst wirkt es hektisch)
        d.hop = 1;
        if (d.state === 'dancing' && Math.random() < 0.2) danceNow(d, now / 1000, lastBeat);
      }
      d.lastActive = now;
      d.msgId = msg.id;
      fillBubble(d.label.bubble, msg.parts);
      d.bubbleAt = now;
      d.label.bubble.classList.add('is-on');
    },

    /** Gelöschte Nachricht (Mod): Blase weg. */
    removeMessage(id) {
      for (const d of dancers.values()) {
        if (d.msgId === id) { d.label.bubble.classList.remove('is-on'); d.bubbleAt = 0; }
      }
    },

    /** Timeout/Bann: Figur verlässt die Tanzfläche; ohne userId (Chat geleert) alle Blasen weg. */
    clearUser(userId) {
      if (!userId) {
        for (const d of dancers.values()) { d.label.bubble.classList.remove('is-on'); d.bubbleAt = 0; }
        queued.length = 0;
        return;
      }
      const i = queued.findIndex((q) => q.userId === userId);
      if (i >= 0) queued.splice(i, 1);
      const d = dancers.get(userId);
      if (d) leave(d);
    },

    /**
     * @param {number} beat  Takt (fortlaufend, 1 = ein Schlag)
     * @param {number} kick  Impuls auf dem Schlag (0 … 1) — lässt die Leuchtlinien pulsieren
     * @param {THREE.Camera} camera
     * @param {number} w  Breite der Szene in CSS-Pixeln
     * @param {number} h
     */
    update(beat, kick, dt, camera, w, h) {
      if (!style) return;
      const now = performance.now();
      const t = now / 1000;
      // Blasen: abgelaufene aus, höchstens MAX_BUBBLES gleichzeitig (die neuesten)
      const withBubble = [];
      for (const d of dancers.values()) {
        if (d.bubbleAt && now - d.bubbleAt > BUBBLE_MS) { d.bubbleAt = 0; d.label.bubble.classList.remove('is-on'); }
        if (d.bubbleAt) withBubble.push(d);
        if (d.state !== 'leaving' && !d.extra && now - d.lastActive > IDLE_LEAVE_MS) leave(d);
      }
      // Statisten nachführen (höchstens einer alle 350 ms, damit sie nicht alle gleichzeitig hereinlaufen)
      {
        let extras = 0, active = 0;
        for (const d of dancers.values()) {
          if (d.state === 'leaving') continue;
          active++;
          if (d.extra) extras++;
        }
        if (extras < extrasWanted && active < maxDancers && now >= nextExtraAt) {
          join({ userId: `extra-${++extraSeq}`, name: '', color: '#ffffff' }, now, true);
          nextExtraAt = now + 350;
        } else if (extras > extrasWanted) {
          for (const d of dancers.values()) { if (d.extra && d.state !== 'leaving') { leave(d); break; } }
        }
      }
      if (withBubble.length > MAX_BUBBLES) {
        withBubble.sort((a, b) => a.bubbleAt - b.bubbleAt);
        for (const d of withBubble.slice(0, withBubble.length - MAX_BUBBLES)) { d.bubbleAt = 0; d.label.bubble.classList.remove('is-on'); }
      }

      // Abstand halten: Figuren auf der Fläche schieben sich sanft auseinander
      const list = [...dancers.values()];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.state === 'entering' || a.state === 'leaving') continue;
        const pa = a.body.group.position;
        for (let j = i + 1; j < list.length; j++) {
          const c = list[j];
          if (c.state === 'entering' || c.state === 'leaving') continue;
          const pc = c.body.group.position;
          const dx = pc.x - pa.x, dz = pc.z - pa.z;
          const dist = Math.hypot(dx, dz);
          if (dist >= PERSONAL || dist < 1e-4) continue;
          const push = (PERSONAL - dist) * 0.5 * clamp01(dt * 4);
          pa.x -= (dx / dist) * push; pa.z -= (dz / dist) * push;
          pc.x += (dx / dist) * push; pc.z += (dz / dist) * push;
        }
      }

      lastBeat = beat;
      for (const d of list) {
        const p = d.body.group.position;
        const faceCam = Math.atan2(FACE.x - p.x, FACE.z - p.z);

        if (d.state === 'entering' || d.state === 'leaving') {
          // Gehen (ohne Tanz) von der Tür auf die Fläche bzw. zurück
          const dx = d.dest.x - p.x, dz = d.dest.z - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.08) {
            if (d.state === 'leaving') { remove(d); continue; }
            danceNow(d, t, beat);
          } else {
            const step = Math.min(dist, style.walkSpeed * dt);
            p.x += (dx / dist) * step;
            p.z += (dz / dist) * step;
            d.body.walked(step);
            d.yaw = turnTo(d.yaw, Math.atan2(dx, dz), dt, 10);
            d.body.setWalkSpeed?.(style.walkSpeed);
            d.body.setActivity({ kind: 'walk' }, t);
          }
        } else {
          // Jede Figur hat ihre eigene Taktung (d.nextAt); Einmal-Clips (Salto) danach sofort
          const flipping = d.state === 'dancing' && ONCE.has(d.move);
          if (flipping ? d.body.isDone() : beat >= d.nextAt) decide(d, t, beat);
          if (d.state === 'travel') {
            const spec = style.travel[d.move];
            const dx = d.dest.x - p.x, dz = d.dest.z - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.1) {
              // angekommen: dort eine Weile tanzen
              danceNow(d, t, beat);
            } else {
              // erst nach dem Überblenden losgehen, sonst rutscht die Figur
              const go = clamp01((t - d.travelT) / FADE_S);
              const step = Math.min(dist, spec.speed * go * dt);
              p.x += (dx / dist) * step;
              p.z += (dz / dist) * step;
              d.body.walked(step);
              const along = Math.atan2(dx, dz);
              const goal = spec.face === 'along' ? along : spec.face === 'back' ? along + Math.PI : faceCam;
              d.yaw = turnTo(d.yaw, goal, dt, 6);
            }
          } else {
            d.yaw = turnTo(d.yaw, faceCam, dt, 4);
          }
          // auf der Fläche bleiben
          p.x = Math.min(floor.x1 - 0.3, Math.max(floor.x0 + 0.3, p.x));
          p.z = Math.min(floor.z1 - 0.3, Math.max(floor.z0 + 0.3, p.z));
        }

        if (d.hop > 0) d.hop = Math.max(0, d.hop - dt * 2.2);
        // Auf der Tanzfläche eine Stufe höher (Kacheln), sonst steckten die Füße im Boden
        const onFloor = p.x > floor.x0 - 0.1 && p.x < floor.x1 + 0.1 && p.z > floor.z0 - 0.1 && p.z < floor.z1 + 0.1;
        d.baseY += ((onFloor ? floorTop : 0) - d.baseY) * clamp01(dt * 12);
        d.body.update(dt, t, beat + d.offset * 0.12, d.yaw, d.hop, 0.75 + 0.6 * kick + (d.hop > 0 ? 0.6 : 0), d.baseY);

        // Namensschild über dem Kopf
        tmp.set(p.x, d.body.headTop() + 0.16, p.z).project(camera);
        const el = d.label.el;
        if (tmp.z > 1 || tmp.x < -1.2 || tmp.x > 1.2 || tmp.y < -1.2 || tmp.y > 1.2) {
          el.style.display = 'none';
          continue;
        }
        const dist = camera.position.distanceTo(p);
        const scale = Math.min(1.1, Math.max(0.55, 11 / dist));
        el.style.display = '';
        el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
        el.style.zIndex = String(Math.round(2000 - dist * 20) + (d.bubbleAt ? 1000 : 0));
      }
    },

    dispose() {
      disposed = true;
      queued.length = 0;
      for (const d of [...dancers.values()]) remove(d);
    },
  };
  return api;
}
