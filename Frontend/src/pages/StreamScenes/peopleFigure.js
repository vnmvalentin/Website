// peopleFigure.js — Chatter als Comic-Figuren (Stream Starting / Ending).
//
// Figuren: Quaternius „Ultimate Animated Character Pack“ (CC0) — Leute in Alltagskleidung, Anzug,
// Kittel, dazu Wikinger, Piraten, Zauberer, Goblins, Zombies, Kuh- und Mopskostüm. Alle teilen ein
// Skelett; die Bewegungen (CMU-Mocap-Tänze, Gehen, Sitzen) wurden einmal darauf übertragen
// (scripts/dancerBake/retargetPeople.mjs) und liegen in clips.glb. Jede Figur ist eine eigene Datei
// und wird erst geladen, wenn sie gebraucht wird.
//
// Wer welche Figur bekommt, hängt fest an der User-ID — dieselbe Person sieht immer gleich aus.
// Die Haut ist im Paket nur ein Platzhalter: hier bekommt jede Figur einen Hautton (ebenfalls fest).
// Das Twitch-Profilbild sitzt nicht mehr als Kopf auf der Figur, sondern im Namensschild (HTML).
//
// Schnittstelle wie mocapFigure.js (play, update, headTop, setOpacity …), damit Party und Kino
// beide Figurarten gleich behandeln.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { fixLegTwist } from './legTwistFix';
import { buildRaveClips } from './raveMoves';
import { classifyCharacter, normalizeLook, buildShoe, SKIN_TONES as LOOK_SKIN } from './avatarParts';
import { seamFill, hairUnderHat, hatOffset, hatHidesHair, isHairMaterial, charInfo } from './avatarSeams';
import { DESIGNS, baseChar, designFabric, isSleeveBone, buildDesignExtras, bakeToSurface } from './avatarDesigns';

const isSkinName = (mat) => /^skin/i.test([].concat(mat)[0]?.name || '');

const BASE = '/media/stream3d/people';
/** Figurhöhe (m) inkl. Haare. Die Figuren sind kopflastig (Comic-Proportionen). */
export const PERSON_H = 1.6;
/** Höhe der Dateien in eigenen Einheiten (Mittelwert über das Paket). */
const SRC_H = 3.2;
const S = PERSON_H / SRC_H;

/** Gehtempo des Clips „walk“ bei timeScale 1 (Mannequin 1,05 m/s × Beinlängen-Verhältnis × Maßstab). */
export const PERSON_WALK_MPS = 1.05 * 1.132 * S;
/** Sitzen (Clip „sit“): Hüfthöhe über dem Figur-Ursprung und wie weit sie dahinter liegt. */
export const PERSON_SIT_HIP_Y = 0.551 * S;
export const PERSON_SIT_BACK = 0.261 * S;
/** Kopf-Oberkante im Sitzen über dem Figur-Ursprung (für die Sichtprüfung im Kino). */
export const PERSON_SEATED_TOP = 2.75 * S;

export const CHARACTERS = [
  'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
  'Suit_Male', 'Suit_Female', 'Chef_Female', 'Chef_Hat', 'Doctor_Male_Young', 'Doctor_Female_Young', 'Doctor_Female_Old',
  'Cowboy_Male', 'Cowboy_Female', 'Worker_Male', 'Worker_Female', 'Kimono_Female', 'Kimono_Male',
  'Viking_Male', 'Viking_Female', 'VikingHelmet', 'Pirate_Male', 'Pirate_Female', 'Wizard', 'Witch', 'Elf',
  'Goblin_Male', 'Goblin_Female', 'Zombie_Male', 'Zombie_Female', 'Cow', 'Pug',
  'Knight_Golden_Male', 'Knight_Golden_Female', 'OldClassy_Male', 'OldClassy_Female',
];

/** Halloween: wer keine eigene Figur gebaut hat, kommt verkleidet. */
export const COSTUMES = [
  'Witch', 'Wizard', 'Zombie_Male', 'Zombie_Female', 'Goblin_Male', 'Goblin_Female', 'Pirate_Male', 'Pirate_Female',
  'VikingHelmet', 'Knight_Golden_Male', 'Knight_Golden_Female', 'Cow', 'Pug', 'Elf',
];

const SKIN_TONES = ['#f3cfb3', '#e8b48f', '#d49a72', '#b97a52', '#8d5a3b', '#62402b', '#f6dcc8', '#c98e66'];
const EYES = '#221d1c';
const METAL = /gold|armor|helmet|horns/i;

const loader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (url) => new Promise((resolve) => {
  loader().load(url, resolve, undefined, (err) => { console.warn('[stream3d] nicht geladen:', url, err); resolve(null); });
});

let kitPromise = null;
/** Bewegungen laden (einmal). Liefert null bei Fehlern — die Szenen nehmen dann die Roboter. */
export function loadPeopleKit() {
  if (!kitPromise) {
    kitPromise = Promise.race([
      load(`${BASE}/clips.glb`).then((g) => {
        if (!g) return null;
        const raw = new Map(g.animations.map((c) => [c.name, c]));
        let clips = raw;
        try { clips = fixLegTwist(g.scene, raw); } catch (err) { console.warn('[stream3d] Bein-Korrektur fehlgeschlagen', err); }
        // Rave-/Hardstyle-Tänze (errechnet, taktgekoppelt) — fehlen sie, bleibt es bei den Mocap-Tänzen
        try { for (const [name, clip] of buildRaveClips(g.scene)) clips.set(name, clip); } catch (err) { console.warn('[stream3d] Rave-Tänze fehlgeschlagen', err); }
        return { clips, rest: g.scene };
      }),
      new Promise((r) => setTimeout(() => r(null), 20000)),
    ]);
  }
  return kitPromise;
}

const charCache = new Map();
function loadCharacter(name) {
  if (!charCache.has(name)) charCache.set(name, load(`${BASE}/${name}.glb`).then((g) => g?.scene || null));
  return charCache.get(name);
}

/** Feste Zahl aus einem Text (gleiche Person → gleiche Figur). */
export function personSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Tempo-Faktor, damit eine Schleife genau eine ganze Zahl von Schlägen dauert (wie mocapFigure.beatScale). */
export function personBeatScale(kit, name, bpm) {
  const clip = kit.clips.get(name);
  if (!clip || clip.userData?.beats) return 1;      // taktgekoppelte Clips laufen nicht über das Tempo
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
/** Popcorn-Becher relativ zur rechten Faust (Ruhepose: Arm hängt). */
const POPCORN_OFFSET = new THREE.Vector3(0, -0.02, 0.08);
/** Kopf-Oberkante über dem Kopfknochen (eigene Einheiten → Meter). */
const HEAD_TOP = 1.08 * S;

// ── Figurbaukasten: Teile verschiedener Figuren auf einem Skelett ──────────
const classCache = new Map();     // Figur → Bereichs-Zuordnung (einmal je Datei)
const partGeoCache = new Map();   // Figur|Mesh|Bereich → Geometrie mit eigenem Index (geteilt)
/** Fußstummel (Weltmaß der Datei): Breite, Länge, Mitte vor dem Fußknochen. */
const FOOT_STUB = { w: 0.16, l: 0.18, z: 0.035 };

function classified(charName, src) {
  if (!classCache.has(charName)) classCache.set(charName, classifyCharacter(charName, src));
  return classCache.get(charName);
}

const topCache = new Map();
/** Schädel-Oberkante über dem Kopfknochen (ohne Haare/Hut) — darauf sitzt ein Hut. */
function skullTop(charName, src) {
  if (topCache.has(charName)) return topCache.get(charName);
  src.updateMatrixWorld(true);
  let head = null;
  src.traverse((o) => { if (o.isBone && o.name === 'Head') head = o; });
  const v = new THREE.Vector3();
  let top = -Infinity;
  for (const [m, sets] of classified(charName, src)) {
    const name = [].concat(m.material)[0]?.name || '';
    if (/hair/i.test(name)) continue;
    const idx = m.geometry.index;
    for (const t of sets.head) {
      for (let j = 0; j < 3; j++) {
        m.getVertexPosition(idx.getX(t * 3 + j), v);
        top = Math.max(top, m.localToWorld(v).y);
      }
    }
  }
  const res = head && Number.isFinite(top) ? { top: top - head.getWorldPosition(v).y, bone: head } : null;
  topCache.set(charName, res);
  return res;
}

/**
 * Bindung eines Hut-Teils so verschieben, dass der Hut auf dem neuen Kopf sitzt (im Rahmen des
 * Kopfknochens — bei Nicken und Headbangen bleibt er dran).
 */
function hatInverses(m, dy, headSrc) {
  const inv = m.skeleton.boneInverses.slice();
  const i = m.skeleton.bones.findIndex((b) => b.name === 'Head');
  if (i < 0 || !dy || !headSrc) return inv;
  const p0 = headSrc.getWorldPosition(new THREE.Vector3());
  const d = headSrc.worldToLocal(p0.clone().add(new THREE.Vector3(0, dy, 0))).sub(headSrc.worldToLocal(p0.clone()));
  inv[i] = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z).multiply(inv[i]);
  return inv;
}

/** Material einer Figur nach Namen (für Füllstücke in der Farbe des Nachbarteils). */
function materialByName(src, name) {
  let found = null;
  src.traverse((o) => { if (!found && o.isMesh) found = [].concat(o.material).find((m) => m.name === name) || null; });
  return found;
}

const seamMatCache = new Map();
/**
 * Material für Füllstücke: beidseitig (offene Ränder zeigen Stoff statt Durchblick) und mit
 * polygonOffset — wo es mit dem echten Teil zusammenfällt, gewinnt das echte Teil.
 */
function seamMaterial(base) {
  if (!seamMatCache.has(base)) {
    const m = base.clone();
    m.side = THREE.DoubleSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 2;
    seamMatCache.set(base, m);
  }
  return seamMatCache.get(base);
}

/** Geometrie eines Teils: teilt die Vertex-Daten der Quelle, nur der Index ist eigen. */
function partGeometry(key, mesh, tris) {
  if (partGeoCache.has(key)) return partGeoCache.get(key);
  const src = mesh.geometry;
  const idx = src.index;
  const arr = new (idx.array.constructor)(tris.length * 3);
  tris.forEach((t, i) => { arr[i * 3] = idx.getX(t * 3); arr[i * 3 + 1] = idx.getX(t * 3 + 1); arr[i * 3 + 2] = idx.getX(t * 3 + 2); });
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
  geo.setIndex(new THREE.BufferAttribute(arr, 1));
  partGeoCache.set(key, geo);
  return geo;
}

/**
 * Figur aus einem Look zusammensetzen. Jedes Teil behält die Bindungsmatrizen seiner Datei
 * (die Dateien sind einzeln quantisiert), bewegt wird es aber vom gemeinsamen Skelett.
 * @returns {Promise<THREE.Object3D|null>}
 */
async function assembleLook(look) {
  // Eigene Designs (Hoodie …) nutzen ein Paket-Teil als Schnitt
  const bodyChar = baseChar(look.body), legsChar = baseChar(look.legs);
  const design = { body: DESIGNS[look.body] ? look.body : null, legs: DESIGNS[look.legs] ? look.legs : null };
  const want = [['body', bodyChar], ['head', look.head], ['legs', legsChar]];
  if (look.hat && look.hat !== 'none') want.push(['hat', look.hat]);
  const names = [...new Set(want.map(([, n]) => n))];
  const srcs = new Map(await Promise.all(names.map(async (n) => [n, await loadCharacter(n)])));
  const base = srcs.get(bodyChar);
  if (!base) return null;
  const model = SkeletonUtils.clone(base);
  const bones = {};
  const byName = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; else byName[o.name] = o; });
  const old = [];
  model.traverse((o) => { if (o.isSkinnedMesh) old.push(o); });
  const fallbackParent = old[0]?.parent || model;
  for (const o of old) o.parent.remove(o);

  const shoes = look.shoes && look.shoes !== 'none';
  // Hut auf die Schädelhöhe des gewählten Kopfs setzen (Hüte sind für ihren eigenen Kopf gebaut)
  let hatDy = 0;
  if (look.hat !== 'none' && srcs.get(look.hat) && srcs.get(look.head)) {
    // Hut liegt auf dem neuen Kopf so auf wie auf seinem eigenen (Masken wie Mops/Kuh sind kleiner →
    // er sinkt tiefer, statt zu schweben). Der Ritterhelm sitzt immer wie gebaut.
    const hs = srcs.get(look.hat), ds = srcs.get(look.head);
    try { hatDy = hatOffset(look.hat, hs, classified(look.hat, hs), look.head, ds, classified(look.head, ds)); } catch (err) { console.warn('[stream3d] Hut nicht angepasst', err); }
  }
  const hatSrc = look.hat !== 'none' ? srcs.get(look.hat) : null;
  /** Ein Teil (Dreiecke eines Quell-Meshs) auf das gemeinsame Skelett setzen. */
  const addPart = (name, m, geo, material, inverses = m.skeleton.boneInverses) => {
    const part = new THREE.SkinnedMesh(geo, material);
    part.name = name;
    part.position.copy(m.position);
    part.quaternion.copy(m.quaternion);
    part.scale.copy(m.scale);
    const skel = new THREE.Skeleton(m.skeleton.bones.map((b) => bones[b.name] || b), inverses);
    (byName[m.parent?.name] || fallbackParent).add(part);
    part.bind(skel, m.bindMatrix);
    return part;
  };
  // Nähte vermessen: Hüfte (Oberteil ↔ Beine) und Hals (Kopf ↔ Oberteil)
  const seams = [['waist', bodyChar, legsChar, design.legs], ['neck', look.head, bodyChar, design.body]].map(([kind, upper, lower, lowerDesign]) => {
    const uSrc = srcs.get(upper), lSrc = srcs.get(lower);
    let fills = [];
    if (uSrc && lSrc && upper !== lower) {
      try { fills = seamFill(kind, upper, uSrc, classified(upper, uSrc), lower, lSrc, classified(lower, lSrc)); } catch (err) { console.warn('[stream3d] Naht nicht geschlossen', kind, err); }
    }
    return { kind, upper, lower, lSrc, lowerDesign, fills };
  });
  const legsTrim = seams[0].fills.trim;

  for (const [region, charName] of want) {
    const src = srcs.get(charName);
    if (!src) continue;
    for (const [m, sets] of classified(charName, src)) {
      // Beine immer mit Fußstummel: mit Schuhen steckt er unsichtbar im Schuh und schließt das Bein
      // unten (ohne ihn klafft beim Anheben des Fußes ein offener Ring zwischen Hosenbein und Schuh).
      // Nur seine Unterseite fällt mit Schuhen weg — sie sticht sonst durch die Sohle.
      let tris = region === 'legs' ? sets.legs.concat(sets.feet, shoes ? [] : sets.sole) : sets[region];
      // Hosenteile, die über dem Saum des Oberteils liegen, stechen sonst durch (siehe seamFill)
      const drop = region === 'legs' ? legsTrim?.get(m) : null;
      if (drop) tris = tris.filter((t) => !drop.has(t));
      if (!tris.length) continue;
      let geo = partGeometry(`${charName}|${m.uuid}|${region}|${shoes ? 1 : 0}${drop ? `|unter:${bodyChar}` : ''}`, m, tris);
      // Haare unter dem Hut bleiben unter der Hut-Unterseite (geschlossener Helm: gar keine Haare)
      if (region === 'head' && hatSrc && hatHidesHair(look.hat) && isHairMaterial(m.material)) continue;
      if (region === 'head' && hatSrc) {
        geo = hairUnderHat(`${charName}|${m.uuid}`, m, geo.index, look.hat, hatSrc, classified(look.hat, hatSrc), hatDy) || geo;
      }
      const inverses = region === 'hat' ? hatInverses(m, hatDy, skullTop(charName, src)?.bone) : m.skeleton.boneInverses;
      const id = design[region];
      if (!id) { addPart(`${region}:${m.name}`, m, geo, m.material, inverses); continue; }
      // Design: Stoff umfärben; lange Ärmel = Arm-Haut (ohne Hand) in Stofffarbe
      const fabric = designFabric(id);
      if (!isSkinName(m.material)) { addPart(`${region}:${m.name}`, m, geo, fabric, inverses); continue; }
      if (!DESIGNS[id].sleeves) { addPart(`${region}:${m.name}`, m, geo, m.material, inverses); continue; }
      const info = charInfo(charName, src, classified(charName, src)).meshes.find((x) => x.m === m);
      const sleeve = tris.filter((t) => isSleeveBone(info?.bone[t]));
      const bare = tris.filter((t) => !isSleeveBone(info?.bone[t]));
      if (sleeve.length) addPart(`${region}:sleeve`, m, partGeometry(`${charName}|${m.uuid}|${region}|sleeve`, m, sleeve), fabric, inverses);
      if (bare.length) addPart(`${region}:${m.name}`, m, partGeometry(`${charName}|${m.uuid}|${region}|bare`, m, bare), m.material, inverses);
    }
  }

  // Nähte schließen: Lücken mit der Oberfläche der oberen Figur füllen
  for (const { kind, upper, lower, lSrc, lowerDesign, fills } of seams) {
    for (const { mesh: m, tris, material } of fills) {
      // Füllstück in der Farbe des unteren Teils (bei einem Design: dessen Stoff)
      const base = (material && lowerDesign && designFabric(lowerDesign)) || (material && materialByName(lSrc, material)) || m.material;
      addPart(`seam-${kind}:${m.name}`, m, partGeometry(`${upper}|${m.uuid}|seam-${kind}|${lower}`, m, tris), seamMaterial(base));
    }
  }

  // Design-Zusätze (Kapuze, Logo …) starr an ihre Knochen
  model.updateMatrixWorld(true);
  for (const slot of ['body', 'legs']) {
    const id = design[slot];
    if (!id) continue;
    const ch = slot === 'body' ? bodyChar : legsChar;
    const src = srcs.get(ch);
    const info = charInfo(ch, src, classified(ch, src));
    for (const { bone, object, skin } of buildDesignExtras(id, info)) {
      // Aufdrucke (Logo, Tasche) verformen sich mit dem Stoff
      const baked = skin ? bakeToSurface(object, info) : null;
      if (baked) {
        // name 'extra' + materials: disposeShoes räumt Geometrie und Materialien je Figur ab
        addPart('extra', baked.mesh, baked.geometry, object.material).userData.materials = object.userData.materials;
        object.geometry.dispose();
        continue;
      }
      const b = bones[bone];
      if (!b) continue;
      // object steht schon in Ruhelage-Weltmaß der Datei (wie das frische Modell) → nur auf den Knochen umrechnen
      object.updateMatrix();
      new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(object.matrix)
        .decompose(object.position, object.quaternion, object.scale);
      object.name = 'extra';
      b.add(object);
    }
  }

  // Schuhe starr an die Fußknochen (Ruhelage: gerade nach vorn, Sohle auf dem Boden)
  if (shoes) {
    model.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const foot = bones[`Foot${side}`];
      const shoe = foot && buildShoe(look.shoes, FOOT_STUB);
      if (!shoe) continue;
      const p = model.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const world = new THREE.Matrix4().multiplyMatrices(model.matrixWorld, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      new THREE.Matrix4().copy(foot.matrixWorld).invert().multiply(world).decompose(shoe.position, shoe.quaternion, shoe.scale);
      shoe.name = 'shoe';
      foot.add(shoe);
    }
  }
  return model;
}

/**
 * Eine Figur bauen. Die Gruppe ist sofort da; das Modell hängt sich ein, sobald seine Datei geladen ist.
 * @param {{ clips: Map<string, THREE.AnimationClip> }} kit
 * @param {{ seed: number, popcorn?: boolean, envMap?: THREE.Texture|null, look?: object|null, pool?: string[]|null }} opts
 *   look: selbst gebaute Figur (avatarParts.js) — sonst eine feste Figur aus dem Paket nach seed
 *   pool: Auswahl, aus der die feste Figur kommt (z. B. COSTUMES zu Halloween) — Standard: alle
 */
export function buildPersonFigure(kit, { seed, popcorn = false, envMap = null, look = null, pool = null }) {
  const group = new THREE.Group();
  const chars = pool?.length ? pool : CHARACTERS;
  const charName = chars[seed % chars.length];
  let skin = new THREE.Color(SKIN_TONES[(seed >>> 8) % SKIN_TONES.length]);
  let loadSeq = 0;
  const mats = [];
  const modelMats = [];         // Materialien des aktuellen Modells (bei neuem Look ersetzt)
  let opacity = 1;
  let disposed = false;
  let mixer = null;
  let model = null;
  let headBone = null, neckBone = null, handR = null, handRest = null;
  const actions = new Map();
  let current = null;
  let currentName = '';
  let want = null;              // gewünschter Clip, solange das Modell noch lädt
  let lookYaw = 0;
  const neckBase = new THREE.Quaternion();
  const neckLast = new THREE.Quaternion(0, 0, 0, 0);
  const headPos = new THREE.Vector3(0, PERSON_H * 0.8, 0);

  let bucket = null;
  if (popcorn) {
    bucket = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#d8282b', roughness: 0.6 });
    const corn = new THREE.MeshStandardMaterial({ color: '#fff2c4', roughness: 0.9 });
    mats.push(red, corn);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.047, 0.13, 12), red);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), corn);
    top.position.y = 0.065;
    bucket.add(cup, top);
    bucket.visible = false;
    group.add(bucket);
  }

  const action = (clipName) => {
    let a = actions.get(clipName);
    if (!a && mixer) {
      const clip = kit.clips.get(clipName);
      if (!clip) return null;
      a = mixer.clipAction(clip);
      actions.set(clipName, a);
    }
    return a || null;
  };

  /** Taktgekoppelt (Rave-Tänze): Zeit kommt aus dem Takt der Szene, nicht aus dem Mixer. */
  const locked = (a) => !!a.getClip().userData?.beats;

  const start = (clipName, { fade = 0.45, once = false, timeScale = 1, offset = 0 } = {}) => {
    const a = action(clipName);
    if (!a) return false;
    if (a === current) { a.timeScale = locked(a) ? 0 : timeScale; return true; }
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = locked(a) ? 0 : timeScale;
    a.time = offset * a.getClip().duration;
    a.setEffectiveWeight(1);
    a.fadeIn(current ? fade : 0).play();
    if (current) current.fadeOut(fade);
    current = a;
    currentName = clipName;
    return true;
  };

  /** Lage eines Knochens relativ zur Gruppe gegenüber seiner Ruhelage. */
  const follow = (bone, rest, offset, outPos, outQ) => {
    _inv.copy(group.matrixWorld).invert();
    _m.multiplyMatrices(_inv, bone.matrixWorld);
    _m.decompose(_p, _q, _s);
    outQ.copy(_q).multiply(rest.invQ);
    outPos.copy(_p).add(_off.copy(offset).applyQuaternion(outQ));
  };

  /** Schuhe und Design-Zusätze werden je Figur gebaut (Teile-Geometrien dagegen sind geteilt und bleiben). */
  const disposeShoes = (root) => {
    const own = [];
    root.traverse((o) => { if (o.name === 'shoe' || o.name === 'extra') own.push(o); });
    for (const o of own) {
      o.traverse((c) => c.geometry?.dispose());
      for (const m of o.userData.materials || []) m.dispose();
    }
  };

  /** Modell einhängen (erstes Laden oder neuer Look): Materialien, Mixer, laufenden Clip übernehmen. */
  const attach = (next) => {
    if (model) {
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(model); }
      group.remove(model);
      disposeShoes(model);
      for (const m of modelMats) { m.dispose(); const i = mats.indexOf(m); if (i >= 0) mats.splice(i, 1); }
      modelMats.length = 0;
      actions.clear();
      current = null;
      headBone = null; neckBone = null; handR = null; handRest = null;
    }
    model = next;
    model.scale.setScalar(S);
    model.traverse((o) => {
      if (o.isBone) {
        if (o.name === 'Head') headBone = o;
        else if (o.name === 'Neck') neckBone = o;
        else if (o.name === 'FistR') handR = o;
      }
      if (!o.isMesh) return;
      o.frustumCulled = false;            // Ruhe-Kugel passt nicht zu Sprüngen und Saltos
      o.castShadow = false;
      o.material = [].concat(o.material).map((m0) => {
        const m = m0.clone();
        const name = m.name || '';
        // Platzhalter-Haut (fast schwarz) bekommt einen Hautton; Goblins/Zombies behalten ihr Grün
        if (/^skin/i.test(name) && m.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.05) m.color.copy(skin);
        // „Face“ sind die Augen: dunkel, damit sie auf heller Haut sichtbar sind
        if (/^face/i.test(name) && m.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5) m.color.set(EYES);
        if (METAL.test(name)) { m.metalness = 0.65; m.roughness = 0.35; m.envMap = envMap; m.envMapIntensity = 0.8; }
        else { m.metalness = 0; m.roughness = /hair/i.test(name) ? 0.55 : 0.78; }
        m.transparent = opacity < 1;
        m.opacity = opacity;
        mats.push(m);
        modelMats.push(m);
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    if (handR) {
      model.updateMatrixWorld(true);
      group.updateMatrixWorld(true);
      _inv.copy(group.matrixWorld).invert();
      _m.multiplyMatrices(_inv, handR.matrixWorld).decompose(_p, _q, _s);
      handRest = { invQ: _q.clone().invert() };
    }
    if (bucket) bucket.visible = true;
    if (want) start(want.name, { ...want.opts, fade: 0 });
  };

  /** Look laden (oder die feste Paket-Figur); ein späterer Aufruf gewinnt gegen einen früheren. */
  const loadModel = (lk) => {
    const seq = ++loadSeq;
    const norm = normalizeLook(lk);
    if (norm) skin = new THREE.Color(LOOK_SKIN[norm.skin]);
    const job = norm ? assembleLook(norm) : loadCharacter(charName).then((src) => (src ? SkeletonUtils.clone(src) : null));
    job.then((next) => {
      if (disposed || seq !== loadSeq || !next) return;
      attach(next);
    }).catch((err) => console.warn('[stream3d] Figur nicht gebaut', err));
  };
  loadModel(look);

  return {
    group,
    glow: new THREE.Color('#ffffff'),
    get current() { return currentName; },
    get loaded() { return !!model; },

    /** Clip wechseln (weich überblendet). once: einmal abspielen und stehen bleiben (isDone()). */
    play(clipName, opts = {}) {
      if (!kit.clips.has(clipName)) return false;
      want = { name: clipName, opts };
      if (!mixer) { currentName = clipName; return true; }
      return start(clipName, opts);
    },
    isDone() {
      if (!mixer) return want?.opts?.once === true;
      return !!current && current.loop === THREE.LoopOnce && current.time >= current.getClip().duration - 1e-3;
    },
    setTimeScale(k) {
      if (current && !locked(current)) current.timeScale = k;
      if (want) want.opts = { ...want.opts, timeScale: k };
    },
    setLook(yaw) { lookYaw = yaw; },

    /** beat: Takt der Szene (fortlaufend) — setzt taktgekoppelte Tänze genau auf den Schlag. */
    update(dt, beat = null) {
      if (!mixer) return;
      if (beat != null) {
        for (const a of actions.values()) {
          const B = a.getClip().userData?.beats;
          if (B && a.isScheduled()) a.time = (((beat / B) % 1) + 1) % 1 * a.getClip().duration;
        }
      }
      mixer.update(dt);
      if (neckBone) {
        if (neckBone.quaternion.equals(neckLast)) neckBone.quaternion.copy(neckBase);
        neckBase.copy(neckBone.quaternion);
        if (lookYaw) neckBone.quaternion.multiply(_yawQ.setFromAxisAngle(_up, lookYaw));
        neckLast.copy(neckBone.quaternion);
      }
      group.updateMatrixWorld(true);
      if (headBone) {
        _inv.copy(group.matrixWorld).invert();
        headPos.setFromMatrixPosition(_m.multiplyMatrices(_inv, headBone.matrixWorld));
      }
      if (bucket && handRest) {
        follow(handR, handRest, POPCORN_OFFSET, bucket.position, _q);
        bucket.quaternion.identity();
      }
    },

    /** Oberkante des Kopfs (Figur-Koordinaten, nach update()). */
    headTop() { return headPos.y + HEAD_TOP; },
    /** Neuer Look (Figurbaukasten) — baut das Modell neu, der laufende Tanz geht weiter. */
    setOutfit(lk) { loadModel(lk); },
    /** Profilbild: sitzt bei diesen Figuren im Namensschild, nicht auf der Figur. */
    setAvatar() {},
    setGlow() {},
    setOpacity(o) {
      opacity = o;
      for (const m of mats) {
        const t = o < 1;
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = o;
      }
    },
    dispose() {
      disposed = true;
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(model); }
      for (const m of mats) m.dispose();
      if (model) disposeShoes(model);
      bucket?.traverse((o) => o.geometry?.dispose());
    },
  };
}
