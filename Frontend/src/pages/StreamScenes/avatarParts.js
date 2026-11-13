// avatarParts.js — Figurbaukasten: Teile der Comic-Figuren frei kombinieren.
//
// Alle 38 Figuren des Quaternius-Pakets teilen ein Skelett. Jedes Dreieck hängt an Knochen —
// daraus ergeben sich die Bereiche: Kopf (Kopf/Hals), Oberkörper (Rumpf, Arme, Hände) und Beine
// (Hüfte, Ober-/Unterschenkel). Kleidungsstücke bleiben ganz (ein Hemd wird nicht an der Hüfte
// zerschnitten): ein Material ohne Haut gehört komplett zu dem Bereich, in dem die meisten seiner
// Dreiecke liegen. Hüte sind die Hut-Materialien im Kopfbereich. Schuhe gibt es im Paket nicht
// (alle haben Fußstummel aus Haut) — sie werden hier gebaut und starr an den Fußknochen gehängt.
//
// Ein „Look“ wird als kleines Objekt gespeichert (Backend: avatarLooks), z. B.
//   { hat: 'Cowboy_Male', head: 'Pug', body: 'Suit_Male', legs: 'Worker_Male', shoes: 'sneakerWhite', skin: 3 }
// Unbekannte Werte fallen auf die Standardteile zurück (normalizeLook).
import * as THREE from 'three';
import { DESIGNS } from './avatarDesigns.js';
import { hatParts, extraParts } from './avatarWear.js';

export const SKIN_TONES = ['#f3cfb3', '#e8b48f', '#d49a72', '#b97a52', '#8d5a3b', '#62402b', '#f6dcc8', '#c98e66'];

/** Hut-Materialien je Figur (nur im Kopfbereich). */
const HAT_MATS = {
  Cowboy_Male: /^Hat/,
  Cowboy_Female: /^Hat/,
  OldClassy_Female: /^Hat$/,
  Worker_Female: /^Hat$/,
  Pirate_Female: /^(Black|Red|Gold)$/,
  Knight_Golden_Female: /^(Armor|Armor_Dark|Red)$/,
  Chef_Hat: /^Hat$/,
  Elf: /^(Hat|Belt)$/,
  OldClassy_Male: /^Hat$/,
  Witch: /^(Hat|Belt)$/,
  Wizard: /^(Hat|Belt)$/,
  Worker_Male: /^Hat$/,
  VikingHelmet: /^(Helmet|Horns)$/,
  Pirate_Male: /^(Black|Red|Gold)$/,
  Knight_Golden_Male: /^(Armor|Armor_Dark|Red)$/,
};

/** Namen der Paket-Figuren für die Auswahl (statt „3 / 35“). */
const CHAR_LABEL = {
  Casual_Male: 'Freizeit', Casual_Female: 'Freizeit (w)', Casual2_Male: 'Freizeit 2', Casual2_Female: 'Freizeit 2 (w)',
  Casual3_Male: 'Freizeit 3', Casual3_Female: 'Freizeit 3 (w)', Casual_Bald: 'Glatze',
  Suit_Male: 'Anzug', Suit_Female: 'Anzug (w)', Doctor_Male_Young: 'Arzt', Doctor_Female_Young: 'Ärztin',
  Doctor_Female_Old: 'Ärztin 2', OldClassy_Male: 'Feiner Herr', OldClassy_Female: 'Feine Dame',
  Worker_Male: 'Bauarbeiter', Worker_Female: 'Bauarbeiterin', Chef_Hat: 'Koch', Chef_Female: 'Köchin',
  Cowboy_Male: 'Cowboy', Cowboy_Female: 'Cowgirl', Pirate_Male: 'Pirat', Pirate_Female: 'Piratin',
  Viking_Male: 'Wikinger', Viking_Female: 'Wikingerin', VikingHelmet: 'Wikinger 2', Kimono_Male: 'Kimono',
  Kimono_Female: 'Kimono (w)', Wizard: 'Zauberer', Witch: 'Hexe', Elf: 'Elf', Goblin_Male: 'Goblin',
  Goblin_Female: 'Goblin (w)', Zombie_Male: 'Zombie', Zombie_Female: 'Zombie (w)', Cow: 'Kuh', Pug: 'Mops',
  Knight_Golden_Male: 'Ritter', Knight_Golden_Female: 'Ritterin',
};
const named = (id) => ({ id, label: CHAR_LABEL[id] });

function designParts(slot) {
  return Object.entries(DESIGNS).filter(([, d]) => d.slot === slot).map(([id, d]) => ({ id, label: d.label }));
}

/** Hut-Material reicht tiefer als der Hut: beim Cowboy ist auch der Schnurrbart „HatBrown“ (liegt bei 2,2–2,4). */
const HAT_MIN_Y = { Cowboy_Male: 2.6, Cowboy_Female: 2.6 };

/** Borten am Mantelsaum, die nach Knochen bei den Beinen landen würden (darunter: Stiefel-Beschläge). */
const COAT_TRIM = {
  Pirate_Male: { re: /^Gold$/, minY: 0.5 },
  Pirate_Female: { re: /^Gold$/, minY: 0.5 },
};

/** Auswahl je Bereich. id = Figur-Datei, aus der das Teil stammt (Schuhe: eigene Bauarten). */
export const PARTS = {
  hat: [
    { id: 'none', label: 'Kein Hut' },
    { id: 'Cowboy_Male', label: 'Cowboyhut' },
    { id: 'OldClassy_Male', label: 'Zylinder' },
    { id: 'Worker_Male', label: 'Bauhelm' },
    { id: 'Chef_Hat', label: 'Kochmütze' },
    { id: 'Pirate_Male', label: 'Piratenhut' },
    { id: 'VikingHelmet', label: 'Wikingerhelm' },
    { id: 'Knight_Golden_Male', label: 'Ritterhelm' },
    { id: 'Wizard', label: 'Zauberhut' },
    { id: 'Witch', label: 'Hexenhut' },
    { id: 'Elf', label: 'Elfenmütze' },
    // selbst gebaute Hüte (avatarWear.js)
    ...hatParts(),
  ],
  // Köpfe, Oberkörper, Beine: je Figur nur, wenn das Teil wirklich anders ist (Geometrie + Farben
  // verglichen; Ritter-Köpfe fehlen — ohne Helm sind sie nur ein Gesichtsausschnitt)
  head: [
    'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
    'Suit_Male', 'Suit_Female', 'Doctor_Male_Young', 'Doctor_Female_Young', 'Doctor_Female_Old', 'OldClassy_Male', 'OldClassy_Female',
    'Worker_Female', 'Chef_Hat', 'Chef_Female', 'Cowboy_Male', 'Cowboy_Female', 'Pirate_Male', 'Pirate_Female',
    'Viking_Male', 'Viking_Female', 'VikingHelmet', 'Kimono_Male', 'Kimono_Female', 'Wizard', 'Witch', 'Elf',
    'Goblin_Male', 'Goblin_Female', 'Zombie_Male', 'Zombie_Female', 'Cow', 'Pug',
  ].map(named),
  // eigene Designs (avatarDesigns.js) stehen vorn, danach die Paket-Teile
  body: [
    ...designParts('body'),
    ...[
      'Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Bald', 'Suit_Male', 'OldClassy_Male', 'Worker_Male',
      'Doctor_Male_Young', 'Chef_Hat', 'Cowboy_Male', 'Pirate_Male', 'Viking_Male', 'Kimono_Male', 'Knight_Golden_Male',
      'Wizard', 'Witch', 'Elf', 'Goblin_Female', 'Goblin_Male', 'Zombie_Male',
    ].map(named),
  ],
  legs: [
    ...designParts('legs'),
    ...[
      'Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Suit_Male', 'OldClassy_Male', 'Worker_Male', 'Doctor_Male_Young',
      'Chef_Hat', 'Cowboy_Male', 'Pirate_Male', 'Viking_Male', 'Kimono_Male', 'Knight_Golden_Male', 'Wizard', 'Witch',
      'Elf', 'Goblin_Female', 'Goblin_Male', 'Zombie_Male',
    ].map(named),
  ],
  shoes: [
    { id: 'none', label: 'Barfuß' },
    { id: 'sneakerWhite', label: 'Sneaker weiß' },
    { id: 'sneakerBlack', label: 'Sneaker schwarz' },
    { id: 'hightopRed', label: 'High-Tops rot' },
    { id: 'platform', label: 'Plateau-Boots' },
    { id: 'bootsBrown', label: 'Stiefel braun' },
    { id: 'raveNeon', label: 'Neon-Sneaker' },
    { id: 'ravePink', label: 'Neon-Sneaker pink' },
    { id: 'sneakerPurple', label: 'Sneaker lila' },
    { id: 'sneakerGold', label: 'Sneaker gold' },
    { id: 'bootsBlack', label: 'Stiefel schwarz' },
    { id: 'santaBoots', label: 'Weihnachtsstiefel' },
  ],
  // Accessoires (avatarWear.js)
  extra: extraParts(),
};

export const SLOTS = ['hat', 'head', 'body', 'legs', 'shoes', 'extra'];

/** Fußstummel: Haut-Dreiecke unterhalb dieser Höhe (Ruhelage, Weltmaß der Datei ≈ 3,2 hoch).
 *  Mit Schuhen bleibt er im Schuh (schließt das Bein), nur seine Unterseite unter SOLE_Y fällt weg. */
const FOOT_Y = 0.2;
const SOLE_Y = 0.07;
const boneRegion = (b) => (/^(Head|Neck)/.test(b) ? 'head' : /^(UpperLeg|LowerLeg|Hips|Body|Foot)/.test(b) ? 'legs' : 'body');
const isSkin = (name) => /^(skin|face)/i.test(name || '');

/**
 * Dreiecke einer geladenen Figur (Szene in Ruhelage) den Bereichen zuordnen.
 * @returns {Map<THREE.SkinnedMesh, { hat: number[], head: number[], body: number[], legs: number[], feet: number[], sole: number[] }>}
 *          je Mesh die Dreiecksnummern (Index ins index-Array / 3) pro Bereich
 */
export function classifyCharacter(charName, scene) {
  scene.updateMatrixWorld(true);
  const hatRe = HAT_MATS[charName] || null;
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const v = new THREE.Vector3();
  // 1. je Dreieck: Bereich nach dem stärksten Knochen, Höhe der Mitte
  const perMesh = new Map();
  const matVotes = new Map();      // Materialname → { body, legs, head }
  for (const m of meshes) {
    const geo = m.geometry;
    const idx = geo.index;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const bones = m.skeleton.bones.map((b) => b.name);
    const mat = [].concat(m.material)[0];
    const name = mat?.name || '';
    const tris = [];
    const acc = new Map();
    for (let i = 0; i < idx.count; i += 3) {
      acc.clear();
      let cy = 0;
      for (let j = 0; j < 3; j++) {
        const vi = idx.getX(i + j);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(vi, k);
          if (w > 0) { const bn = bones[si.getComponent(vi, k)]; acc.set(bn, (acc.get(bn) || 0) + w); }
        }
        m.getVertexPosition(vi, v);
        m.localToWorld(v);
        cy += v.y / 3;
      }
      let best = '', bw = -1;
      for (const [bn, w] of acc) if (w > bw) { bw = w; best = bn; }
      const region = boneRegion(best);
      tris.push({ region, cy, arm: /^(Shoulder|UpperArm|LowerArm|Fist)/.test(best) });
      if (!isSkin(name)) {
        const votes = matVotes.get(name) || { body: 0, legs: 0, head: 0 };
        votes[region]++;
        matVotes.set(name, votes);
      }
    }
    perMesh.set(m, { name, tris });
  }
  // 2. Kleidung bleibt ganz: Material ohne Haut → Bereich mit den meisten Dreiecken (Kopf bleibt Kopf)
  const out = new Map();
  for (const [m, { name, tris }] of perMesh) {
    const sets = { hat: [], head: [], body: [], legs: [], feet: [], sole: [] };
    const votes = matVotes.get(name);
    // nur wenn der Rest klein ist (Hemdsaum an der Hüfte) — Anzug/Kimono/Rüstung: Jacke und Hose
    // sind ein Material und werden nach Knochen geteilt
    const major = votes && Math.min(votes.body, votes.legs) < 0.25 * Math.max(votes.body, votes.legs)
      ? (votes.body >= votes.legs ? 'body' : 'legs') : null;
    tris.forEach(({ region, cy, arm }, t) => {
      let r = region;
      if (r === 'head' && hatRe && hatRe.test(name) && cy >= (HAT_MIN_Y[charName] ?? -Infinity)) r = 'hat';
      // Ärmel, Handschuhe und Armschienen bleiben beim Oberteil, auch wenn ihr Material sonst vor allem an
      // den Beinen sitzt (sonst fehlt mit fremder Hose der Unterarm)
      else if (r !== 'head' && major && !isSkin(name) && !(major === 'legs' && arm)) r = major;
      // Mantelborte gehört zum Mantel (sonst schwebt sie mit fremdem Oberteil um die Beine)
      else if (r === 'legs' && COAT_TRIM[charName]?.re.test(name) && cy > COAT_TRIM[charName].minY) r = 'body';
      // Fußstummel; seine Unterseite (sole) sticht durch Schuhsohlen und fällt mit Schuhen weg
      if (r === 'legs' && isSkin(name) && cy < FOOT_Y) r = cy < SOLE_Y ? 'sole' : 'feet';
      sets[r].push(t);
    });
    out.set(m, sets);
  }
  return out;
}

/** Look prüfen und auf bekannte Teile zurückführen (fehlende Teile → Standard). */
export function normalizeLook(look) {
  if (!look || typeof look !== 'object') return null;
  const ok = (slot, id) => PARTS[slot].some((p) => p.id === id);
  const out = {};
  for (const slot of SLOTS) {
    const id = typeof look[slot] === 'string' ? look[slot] : null;
    out[slot] = id && ok(slot, id) ? id : defaultLook()[slot];
  }
  const skin = Number(look.skin);
  out.skin = Number.isInteger(skin) && skin >= 0 && skin < SKIN_TONES.length ? skin : 0;
  return out;
}

export function defaultLook() {
  return { hat: 'none', head: 'Casual_Male', body: 'Casual_Male', legs: 'Casual_Male', shoes: 'sneakerWhite', extra: 'none', skin: 1 };
}

// ── Schuhe ──────────────────────────────────────────────────────────────────
const SHOES = {
  // h: Oberkante über dem Boden — mindestens bis über FOOT_Y, dort endet das Bein ohne Stummel
  sneakerWhite: { upper: '#f2f2f0', sole: '#d9d9d6', accent: '#3a3f4a', h: 0.28, sole_h: 0.06 },
  sneakerBlack: { upper: '#1d1f24', sole: '#f0f0ee', accent: '#e8e8e8', h: 0.28, sole_h: 0.06 },
  hightopRed: { upper: '#c3262e', sole: '#f2f2ee', accent: '#ffffff', h: 0.36, sole_h: 0.06 },
  platform: { upper: '#121216', sole: '#121216', accent: '#8a8f99', h: 0.34, sole_h: 0.12, metal: true },
  bootsBrown: { upper: '#6b4428', sole: '#2a1c12', accent: '#a8743f', h: 0.36, sole_h: 0.055 },
  raveNeon: { upper: '#1a1a1f', sole: '#39ff88', accent: '#ff3fd2', h: 0.29, sole_h: 0.08, glow: true },
  ravePink: { upper: '#f4f4f6', sole: '#ff3fd2', accent: '#3ad1ff', h: 0.29, sole_h: 0.08, glow: true },
  sneakerPurple: { upper: '#7a3fe0', sole: '#f0f0ee', accent: '#ffffff', h: 0.28, sole_h: 0.06 },
  sneakerGold: { upper: '#e0b030', sole: '#f6f2e4', accent: '#fff3c0', h: 0.28, sole_h: 0.06, metal: true },
  bootsBlack: { upper: '#17171c', sole: '#0c0c10', accent: '#5a5f6a', h: 0.38, sole_h: 0.06 },
  // cuff: breiter Pelzrand oben statt des Streifens
  santaBoots: { upper: '#17171c', sole: '#0c0c10', accent: '#f6f4ee', h: 0.4, sole_h: 0.06, cuff: true },
};

/**
 * Ein Schuh als Gruppe in Fuß-Ruhelage (Weltmaß der Datei). Comic-Schuh, deutlich breiter und länger
 * als der dünne Beinstummel: Sohle, Schaft um den Knöchel, runde Kappe nach vorn, Streifen/Pelzrand
 * und Schnürung. Ursprung = Fußknochen, vorne = +z. stub: Maße des Fußstummels (Mitte z vor dem Knochen).
 */
export function buildShoe(kind, stub) {
  const spec = SHOES[kind];
  if (!spec) return null;
  const g = new THREE.Group();
  const W = 0.27, L = 0.46;
  const y0 = -0.035;                 // Unterkante: der Fußknochen sitzt knapp über dem Boden
  const zc = stub.z + 0.065;         // Schuhmitte liegt vor dem Knöchel — die Kappe zeigt nach vorn
  const mats = {
    upper: new THREE.MeshStandardMaterial({ color: spec.upper, roughness: 0.7, metalness: spec.metal ? 0.2 : 0 }),
    sole: new THREE.MeshStandardMaterial({ color: spec.sole, roughness: 0.85, emissive: spec.glow ? spec.sole : '#000000', emissiveIntensity: spec.glow ? 0.9 : 0 }),
    accent: new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.6, emissive: spec.glow ? spec.accent : '#000000', emissiveIntensity: spec.glow ? 0.6 : 0 }),
  };
  const top = y0 + spec.sole_h;      // Oberkante der Sohle
  const sole = new THREE.Mesh(roundedBox(W, spec.sole_h, L, 0.1), mats.sole);
  sole.position.set(0, y0 + spec.sole_h / 2, zc);
  // Schaft: reicht über das Ende des Beins (FOOT_Y), sitzt hinten über dem Knöchel
  const shaftH = spec.h - spec.sole_h;
  const shaftL = L * 0.52;
  const shaft = new THREE.Mesh(roundedBox(W * 0.86, shaftH, shaftL, 0.08), mats.upper);
  shaft.position.set(0, top + shaftH / 2, zc - L / 2 + shaftL / 2 + 0.012);
  // Kappe: halbes Ei nach vorn, steckt unten in der Sohle
  const toeH = Math.min(0.14, shaftH * 0.8);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mats.upper);
  toe.scale.set(W * 0.455, toeH, L * 0.36);
  toe.position.set(0, top, zc + L * 0.13);
  g.add(sole, shaft, toe);
  if (spec.cuff) {
    // Pelzrand oben um den Schaft
    const cuff = new THREE.Mesh(roundedBox(W * 0.98, 0.085, shaftL + 0.035, 0.09), mats.accent);
    cuff.position.set(0, top + shaftH - 0.03, shaft.position.z);
    g.add(cuff);
  } else {
    // Streifen an beiden Seiten und Schnürung auf dem Spann
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W * 0.885, 0.035, shaftL * 0.62), mats.accent);
    stripe.position.set(0, top + shaftH * 0.5, shaft.position.z + 0.01);
    const laces = new THREE.Mesh(new THREE.BoxGeometry(W * 0.36, 0.02, L * 0.17), mats.accent);
    laces.position.set(0, top + toeH * 0.86, zc + L * 0.06);
    laces.rotation.x = 0.42;
    g.add(stripe, laces);
  }
  g.userData.materials = Object.values(mats);
  return g;
}

/** Quader mit rund gezogenen Ecken (Draufsicht) und leicht gebrochener Oberkante. */
function roundedBox(w, h, d, r) {
  const geo = new THREE.BoxGeometry(w, h, d, 6, 2, 6);
  const pos = geo.attributes.position;
  const rr = Math.min(r, w / 2, d / 2);
  const ix = w / 2 - rr, iz = d / 2 - rr;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const y = pos.getY(i);
    const dx = Math.max(Math.abs(x) - ix, 0), dz = Math.max(Math.abs(z) - iz, 0);
    if (dx > 0 && dz > 0) {
      // Eckbereich: auf den Viertelkreis ziehen
      const len = Math.hypot(dx, dz);
      x = Math.sign(x) * (ix + (dx / len) * rr);
      z = Math.sign(z) * (iz + (dz / len) * rr);
    }
    // Oberkante etwas einziehen
    const k = y > h / 2 - 1e-6 ? 0.94 : 1;
    pos.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
