// mocapFigure.js — Chatter-Figur mit echten Bewegungen (Stream Starting / Ending).
//
// Statt errechneter Posen: ein geriggtes Mannequin (Quaternius, CC0) mit Motion-Capture-Tänzen
// (CMU) und Alltagsclips (Gehen, Sitzen) — siehe public/media/stream3d/README.md. Optik bleibt
// beim Roboter: dunkles Metall, die Gelenkringe leuchten in der Chatfarbe, der Kopf ist die
// Murmel mit dem Twitch-Profilbild. Der Mannequin-Kopf wird dafür auf null skaliert, die Murmel
// folgt dem Kopfknochen.
//
// Ladefehler: loadFigureKit() liefert null — die Szenen fallen dann auf chatterFigure.js zurück.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { headTexture, glowColor } from './chatterFigure';

const URL = '/media/stream3d/dancer.glb';
const HEAD_R = 0.165;
/** Mitte der Murmel relativ zum Kopfknochen (Ruhepose, Figur-Koordinaten). */
const HEAD_OFFSET = new THREE.Vector3(0, 0.13, -0.005);
/** Popcorn-Becher relativ zur rechten Hand (Ruhepose: Arm waagrecht nach −x). */
const POPCORN_OFFSET = new THREE.Vector3(-0.07, -0.02, 0.06);

/** Gehtempo des Clips „walk“ bei timeScale 1 (gemessen am aufgesetzten Fuß). */
export const WALK_MPS = 1.05;
/** Kopf-Oberkante im Sitzen (Clip „sit“, Gruppe auf Sitzhöhe 0) — für die Sichtprüfung im Kino. */
export const SEATED_TOP = 1.18 + 0.13 + HEAD_R;
/** So weit sitzt die Hüfte im Clip „sit“ hinter dem Ursprung bzw. unter der Sitzfläche. */
export const SIT_BACK = 0.33;
export const SIT_HIP_Y = 0.54;

let kitPromise = null;

/** Lädt die Figur einmal (danach aus dem Zwischenspeicher). Liefert null bei Fehlern. */
export function loadFigureKit() {
  if (!kitPromise) {
    kitPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 20000);
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(URL, (gltf) => {
        clearTimeout(timer);
        const clips = new Map(gltf.animations.map((c) => [c.name, c]));
        // Kopf nicht mitskalieren lassen: Skalierungsspuren würden das Ausblenden überschreiben
        for (const c of clips.values()) c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale'));
        resolve({ scene: gltf.scene, clips });
      }, undefined, (err) => {
        clearTimeout(timer);
        console.warn('[stream3d] Figur nicht geladen, nutze Ersatzfigur', err);
        resolve(null);
      });
    });
  }
  return kitPromise;
}

/**
 * Tempo-Faktor, damit eine Schleife genau eine ganze Zahl von Schlägen dauert (0,8 … 1,25).
 * So laufen die Tänze nicht gegen den Takt — ohne die Bewegung sichtbar zu verzerren.
 */
export function beatScale(kit, name, bpm) {
  const clip = kit.clips.get(name);
  if (!clip) return 1;
  const beat = 60 / bpm;
  const n = Math.max(1, Math.round(clip.duration / beat));
  return Math.min(1.25, Math.max(0.8, clip.duration / (n * beat)));
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _off = new THREE.Vector3();
const _yawQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Eine Figur bauen.
 * @param {{ scene: THREE.Object3D, clips: Map<string, THREE.AnimationClip> }} kit
 * @param {{ name?: string, color?: string, popcorn?: boolean, envMap?: THREE.Texture|null }} opts
 */
export function buildMocapFigure(kit, { name = '', color, popcorn = false, envMap = null } = {}) {
  const group = new THREE.Group();
  const model = SkeletonUtils.clone(kit.scene);
  group.add(model);

  const glow = glowColor(color);
  const head = headTexture(name, '#' + glow.getHexString());
  const metal = new THREE.MeshStandardMaterial({
    color: '#2b2e36', metalness: envMap ? 0.82 : 0.4, roughness: 0.3, envMap, envMapIntensity: 0.9,
  });
  const light = new THREE.MeshBasicMaterial({ color: glow.clone(), toneMapped: false });
  // etwas matter als die alte Murmel: unter Bloom und Scheinwerfern bleibt das Profilbild lesbar
  const headMat = new THREE.MeshStandardMaterial({ map: head.tex, roughness: 0.28, metalness: 0.05, envMap, envMapIntensity: 0.8 });
  const mats = [metal, light, headMat];

  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.frustumCulled = false;          // Ruhepose-Kugel passt nicht zu Sprüngen und Saltos
      o.material = /joint/i.test(o.material.name) ? light : metal;
    }
  });
  const headBone = bones['DEF-head'];
  const neckBone = bones['DEF-neck'];
  const handR = bones['DEF-handR'];

  // Murmelkopf: Vorderseite bekommt die Textur flach von vorn (wie bei der Murmelbahn)
  const headGeo = new THREE.SphereGeometry(HEAD_R, 32, 24);
  {
    const pos = headGeo.attributes.position;
    const uv = headGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * HEAD_R), 0.5 + pos.getY(i) / (2 * HEAD_R));
  }
  const headMesh = new THREE.Mesh(headGeo, headMat);
  group.add(headMesh);

  let bucket = null;
  if (popcorn) {
    bucket = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#d8282b', roughness: 0.6 });
    const corn = new THREE.MeshStandardMaterial({ color: '#fff2c4', roughness: 0.9 });
    mats.push(red, corn);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.16, 12), red);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), corn);
    top.position.y = 0.08;
    bucket.add(cup, top);
    group.add(bucket);
  }

  // Ruhe-Drehungen der Knochen, denen etwas folgt (Figur-Koordinaten)
  model.updateMatrixWorld(true);
  const restOf = (bone) => {
    _m.copy(bone.matrixWorld);
    _m.decompose(_p, _q, _s);
    return { pos: _p.clone(), invQ: _q.clone().invert() };
  };
  const headRest = restOf(headBone);
  const handRest = handR ? restOf(handR) : null;

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  let current = null;
  let currentName = '';
  let lookYaw = 0;
  const neckBase = new THREE.Quaternion();
  const neckLast = new THREE.Quaternion(0, 0, 0, 0);

  const action = (clipName) => {
    let a = actions.get(clipName);
    if (!a) {
      const clip = kit.clips.get(clipName);
      if (!clip) return null;
      a = mixer.clipAction(clip);
      actions.set(clipName, a);
    }
    return a;
  };

  /** Lage eines Knochens relativ zur Gruppe: Position + Drehung gegenüber der Ruhepose. */
  const follow = (bone, rest, offset, outPos, outQ) => {
    _inv.copy(group.matrixWorld).invert();
    _m.multiplyMatrices(_inv, bone.matrixWorld);
    _m.decompose(_p, _q, _s);
    outQ.copy(_q).multiply(rest.invQ);
    outPos.copy(_p).add(_off.copy(offset).applyQuaternion(outQ));
  };

  return {
    group,
    glow,
    get current() { return currentName; },

    /**
     * Clip wechseln (weich überblendet). once: einmal abspielen und stehen bleiben (isDone()).
     * offset: Startpunkt in der Schleife (0 … 1), damit nicht alle gleich tanzen.
     */
    play(clipName, { fade = 0.45, once = false, timeScale = 1, offset = 0 } = {}) {
      const a = action(clipName);
      if (!a) return false;
      if (a === current) { a.timeScale = timeScale; return true; }
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.timeScale = timeScale;
      a.time = offset * a.getClip().duration;
      a.setEffectiveWeight(1);
      a.fadeIn(current ? fade : 0).play();
      if (current) current.fadeOut(fade);
      current = a;
      currentName = clipName;
      return true;
    },
    /** Einmal-Clip zu Ende gespielt? */
    isDone() {
      return !!current && current.loop === THREE.LoopOnce && current.time >= current.getClip().duration - 1e-3;
    },
    /** Tempo des laufenden Clips (z. B. Gehen an die Geschwindigkeit anpassen). */
    setTimeScale(k) { if (current) current.timeScale = k; },
    /** Kopf zusätzlich drehen (Umschauen im Kino), Bogenmaß. */
    setLook(yaw) { lookYaw = yaw; },

    update(dt) {
      mixer.update(dt);
      if (neckBone) {
        // Hat der Clip den Hals nicht gesetzt, steht dort noch die gedrehte Lage vom letzten Bild
        if (neckBone.quaternion.equals(neckLast)) neckBone.quaternion.copy(neckBase);
        neckBase.copy(neckBone.quaternion);
        if (lookYaw) neckBone.quaternion.multiply(_yawQ.setFromAxisAngle(_up, lookYaw));
        neckLast.copy(neckBone.quaternion);
      }
      headBone.scale.setScalar(0.001);
      group.updateMatrixWorld(true);
      follow(headBone, headRest, HEAD_OFFSET, headMesh.position, headMesh.quaternion);
      if (bucket && handRest) {
        follow(handR, handRest, POPCORN_OFFSET, bucket.position, _q);
        bucket.quaternion.identity();     // Becher bleibt aufrecht
      }
    },

    /** Oberkante des Kopfs (Figur-Koordinaten, nach update()). */
    headTop() { return headMesh.position.y + HEAD_R; },
    setAvatar(img) { if (img) head.paint(img); },
    /** Leuchtringe pulsieren lassen (1 = normal). */
    setGlow(k) { light.color.copy(glow).multiplyScalar(k); },
    setOpacity(o) {
      for (const m of mats) {
        const t = o < 1;
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = o;
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const m of mats) m.dispose();
      head.tex.dispose();
      headGeo.dispose();
      bucket?.traverse((o) => o.geometry?.dispose());
    },
  };
}
