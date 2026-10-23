// cinemaAudience.js — Chatter als Kinopublikum (Stream Ending).
//
// Die Namen kommen aus den Credits (Streamer.bot) und aus dem laufenden Chat. Jede Person
// sitzt auf einem zufälligen freien Sessel — bei wenigen Zuschauern verteilt sich der Saal
// locker, bei mehr Namen als Plätzen wird zufällig ausgewählt. Gesperrt sind der eigene
// Platz, der Weg dorthin und alle Sitze, deren Köpfe vom Platz aus vor der Leinwand wären.
// Wer später dazukommt, blendet weich ein. Namensschilder (HTML) gibt es nur, solange die
// Kamera durch den Saal geht — am Platz würden sie über der Leinwand stören.
//
// Figuren: Comic-Figuren mit Sitz-Clips (peopleFigure.js, Profilbild im Namensschild); per
// figures: 'robots' oder als Ersatz das Roboter-Mannequin (mocapFigure.js), zuletzt die errechnete
// Figur (chatterFigure.js). Bis das feststeht, werden Namen gesammelt.
import * as THREE from 'three';
import { buildFigure, applyPose, sitPose, neutralPose, figureState } from './chatterFigure';
import { loadFigureKit, buildMocapFigure, SIT_BACK, SIT_HIP_Y } from './mocapFigure';
import { requestChatAvatar } from './chatAvatars';
import { requestLook, cachedLook } from './sceneLink';
import { loadPeopleKit, buildPersonFigure, personSeed, PERSON_SIT_HIP_Y, PERSON_SIT_BACK, PERSON_SEATED_TOP } from './peopleFigure';

/** Hüftgelenk über der Sitzfläche (Polster-Oberkante 0,525) und leicht vor der Lehne. */
const HIP_ON_SEAT = 0.62;
const HIP_SEAT_Z = 0.08;
/** Kopf-Oberkante einer sitzenden Comic-Figur über dem Boden der Reihe. */
export const PERSON_SEATED_HEAD_TOP = HIP_ON_SEAT - PERSON_SIT_HIP_Y + PERSON_SEATED_TOP;

/** Sitzende Comic-Figur (gleiche Schnittstelle wie unten). */
function personSitter(kit, opts, seed) {
  // Selbst gebaute Figur (Figurbaukasten) — per ID oder, im Abspann, per Login
  const known = cachedLook(opts.userId, opts.name);
  const fig = buildPersonFigure(kit, { seed: personSeed(opts.userId || opts.name), popcorn: opts.popcorn, envMap: opts.envMap, look: known });
  if (!known) requestLook(opts.userId, (lk) => { if (lk) fig.setOutfit(lk); }, opts.name);
  fig.group.rotation.y = Math.PI;
  fig.play(seed % 10 < 3 ? 'sitTalk' : 'sit', { fade: 0, offset: Math.random(), timeScale: 0.85 + Math.random() * 0.3 });
  const look = { cur: 0, from: 0, to: 0, at: -10, next: Math.random() * 4 };
  return {
    fig,
    avatarInLabel: true,
    place(seat) { fig.group.position.set(seat.x, seat.y + HIP_ON_SEAT - PERSON_SIT_HIP_Y, seat.z + HIP_SEAT_Z - PERSON_SIT_BACK); },
    update(t, dt) {
      if (t > look.next) {
        look.from = look.cur;
        look.to = (Math.random() - 0.5) * (Math.random() < 0.3 ? 1.1 : 0.4);
        look.at = t;
        look.next = t + 3 + Math.random() * 7;
      }
      const k = Math.min(1, Math.max(0, (t - look.at) / 0.8));
      look.cur = look.from + (look.to - look.from) * k * k * (3 - 2 * k);
      fig.setLook(look.cur);
      fig.update(dt);
    },
    headTop: () => fig.headTop(),
  };
}

/** Sitzende Mocap-Figur mit gleicher Schnittstelle wie die Posen-Figur unten. */
function mocapSitter(kit, opts) {
  const fig = buildMocapFigure(kit, opts);
  fig.group.rotation.y = Math.PI;
  fig.play(Math.random() < 0.3 ? 'sitTalk' : 'sit', { fade: 0, offset: Math.random(), timeScale: 0.85 + Math.random() * 0.3 });
  const look = { cur: 0, from: 0, to: 0, at: -10, next: Math.random() * 4 };
  return {
    fig,
    place(seat) { fig.group.position.set(seat.x, seat.y + HIP_ON_SEAT - SIT_HIP_Y, seat.z + HIP_SEAT_Z - SIT_BACK); },
    update(t, dt) {
      // ab und zu umschauen
      if (t > look.next) {
        look.from = look.cur;
        look.to = (Math.random() - 0.5) * (Math.random() < 0.3 ? 1.1 : 0.4);
        look.at = t;
        look.next = t + 3 + Math.random() * 7;
      }
      const k = Math.min(1, Math.max(0, (t - look.at) / 0.8));
      look.cur = look.from + (look.to - look.from) * k * k * (3 - 2 * k);
      fig.setLook(look.cur);
      fig.update(dt);
    },
    headTop: () => fig.headTop(),
  };
}

function poseSitter(opts, seed) {
  const fig = buildFigure(opts);
  const state = figureState(seed, opts.popcorn);
  const pose = neutralPose();
  return {
    fig,
    place(seat) { fig.group.position.set(seat.x, seat.y, seat.z); },
    update(t) { sitPose(t, state, pose); applyPose(fig, pose, Math.PI); },
    headTop: () => fig.hatTop + pose.hipY,
  };
}

const FALLBACK_COLORS = ['#ff7f50', '#9acd32', '#1e90ff', '#ff69b4', '#daa520', '#5f9ea0', '#b388ff', '#00c4a7', '#ff4500'];
const FADE_IN_S = 0.9;

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * @param {THREE.Scene} scene
 * @param {HTMLElement|null} overlay  Ebene für die Namensschilder
 * @param {{ x: number, y: number, z: number }[]} seats  freigegebene Sitzplätze (Boden der Reihe, Sitzmitte)
 * @param {{ skip?: string[], envMap?: THREE.Texture|null, figures?: 'people'|'robots' }} opts
 *   skip: Namen, die nie Platz nehmen (Kanal selbst, Bots); figures: Comic-Figuren (Standard) oder Roboter
 */
export function createAudience(scene, overlay, seats, { skip = [], envMap = null, figures = 'people' } = {}) {
  const people = new Map();              // name (klein) → Person
  const free = seats.map((s, i) => i);
  const skipSet = new Set(skip.map((s) => s.toLowerCase()));
  const tmp = new THREE.Vector3();
  let clock = 0;
  let lastT = 0;
  // Figurart steht erst nach dem Laden fest: bis dahin Namen sammeln
  let kit;                               // undefined = lädt noch, null = Ersatzfigur
  let peopleKit = null;                  // Comic-Figuren geladen
  let disposed = false;
  const queued = [];
  // Profilbilder, die noch unterwegs sind (für settled(): erst zeigen, wenn die Köpfe stimmen)
  let avatarsWaiting = 0;
  let onAvatarsDone = null;
  const kitReady = (async () => {
    peopleKit = figures === 'people' ? await loadPeopleKit() : null;
    const k = peopleKit ? null : await loadFigureKit();
    if (disposed) return;
    kit = peopleKit || k;
    for (const [p, instant] of queued.splice(0)) add(p, instant);
  })();

  const take = () => {
    if (!free.length) return null;
    const k = Math.floor(Math.random() * free.length);
    const i = free[k];
    free[k] = free[free.length - 1];
    free.pop();
    return i;
  };

  const add = ({ name, color, userId = null }, instant) => {
    const key = String(name || '').toLowerCase();
    if (!key || skipSet.has(key) || people.has(key)) return;
    if (kit === undefined) {
      if (!queued.some(([q]) => String(q.name).toLowerCase() === key)) queued.push([{ name, color, userId }, instant]);
      return;
    }
    const seatIdx = take();
    if (seatIdx === null) return;
    const seat = seats[seatIdx];
    const seed = hash(key);
    const popcorn = seed % 100 < 35;
    const opts = { name, userId, color: color || FALLBACK_COLORS[seed % FALLBACK_COLORS.length], popcorn, envMap };
    const body = peopleKit ? personSitter(peopleKit, opts, seed) : kit ? mocapSitter(kit, opts) : poseSitter(opts, seed);
    const { fig } = body;
    let avatarImg = null;
    body.place(seat);
    if (!instant) fig.setOpacity(0);
    scene.add(fig.group);
    let label = null;
    if (overlay) {
      label = document.createElement('div');
      label.className = 'sp-tag sp-tag--seat';
      const tag = document.createElement('div');
      tag.className = 'sp-name';
      tag.style.color = color || FALLBACK_COLORS[seed % FALLBACK_COLORS.length];
      if (body.avatarInLabel) {
        avatarImg = document.createElement('img');
        avatarImg.className = 'sp-avatar';
        avatarImg.alt = '';
        avatarImg.hidden = true;
        tag.append(avatarImg);
      }
      tag.append(document.createTextNode(name));
      label.append(tag);
      overlay.append(label);
    }
    // nach dem Schild anfragen: liegt das Bild schon vor, kommt die Antwort sofort
    avatarsWaiting++;
    requestChatAvatar({ userId, login: name }, (img) => {
      fig.setAvatar(img);
      if (img && avatarImg) { avatarImg.src = img.src; avatarImg.hidden = false; }
      if (--avatarsWaiting === 0) onAvatarsDone?.();
    });
    people.set(key, { fig, body, label, shown: false, bornAt: instant ? -FADE_IN_S : clock });
  };

  return {
    /** Mehrere Personen auf einmal (Credits). Mehr Namen als Plätze → zufällige Auswahl. */
    addMany(list, instant = false) {
      const shuffled = list.slice().sort(() => Math.random() - 0.5);
      for (const p of shuffled) add(p, instant);
    },
    /** Eine Person aus dem Chat. */
    addOne(p) { add(p, false); },
    count: () => people.size + queued.length,
    /** Wartet, bis die Figur-Datei da ist und die Profilbilder der bisherigen Gäste geladen sind (höchstens maxMs). */
    settled(maxMs = 4000) {
      return Promise.race([
        kitReady.then(() => new Promise((res) => {
          if (avatarsWaiting === 0) { res(); return; }
          onAvatarsDone = res;
        })),
        new Promise((res) => setTimeout(res, maxMs)),
      ]);
    },

    /**
     * @param {number} t  Sekunden seit Szenenstart
     * @param {THREE.Camera} camera
     * @param {number} labels  0 … 1 — Deckkraft der Namensschilder
     */
    update(t, camera, w, h, labels) {
      clock = t;
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      for (const p of people.values()) {
        const fade = (t - p.bornAt) / FADE_IN_S;
        if (!p.shown) {
          p.fig.setOpacity(Math.min(1, Math.max(0, fade)));
          if (fade >= 1) p.shown = true;
        }
        p.body.update(t, dt);
        if (!p.label) continue;
        if (labels <= 0.01) { p.label.style.display = 'none'; continue; }
        const g = p.fig.group.position;
        tmp.set(g.x, g.y + p.body.headTop() + 0.12, g.z).project(camera);
        const dist = camera.position.distanceTo(g);
        if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1 || dist > 14) { p.label.style.display = 'none'; continue; }
        p.label.style.display = '';
        p.label.style.opacity = String(labels * Math.min(1, (14 - dist) / 4));
        const scale = Math.min(1, Math.max(0.5, 5 / dist));
        p.label.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
        p.label.style.zIndex = String(Math.round(2000 - dist * 20));
      }
    },

    dispose() {
      disposed = true;
      queued.length = 0;
      for (const p of people.values()) {
        scene.remove(p.fig.group);
        p.fig.dispose();
        p.label?.remove();
      }
      people.clear();
    },
  };
}

export const BOTS = ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'sery_bot', 'soundalerts', 'botrixoficial', 'kofistreambot'];

/**
 * Namen aus einem Credits-Paket (Streamer.bot): jede Rubrik ist ein string[] wie
 * "ChatGott (412 Nachrichten)" oder "Lurker_Lisa: 3x Songrequest".
 */
export function creditNames(credits) {
  const out = [];
  const seen = new Set();
  const take = (list) => {
    for (const raw of Array.isArray(list) ? list : []) {
      const m = /^\s*@?([A-Za-z0-9_]{2,25})/.exec(String(raw));
      if (!m) continue;
      const key = m[1].toLowerCase();
      if (seen.has(key) || BOTS.includes(key)) continue;
      seen.add(key);
      out.push({ name: m[1] });
    }
  };
  for (const k of ['mods', 'subs', 'chatters', 'follows', 'bits', 'rewards', 'raids', 'shame']) take(credits?.[k]);
  return out;
}

