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
  ],
  // Köpfe, Oberkörper, Beine: je Figur nur, wenn das Teil wirklich anders ist (Geometrie + Farben
  // verglichen; Ritter-Köpfe fehlen — ohne Helm sind sie nur ein Gesichtsausschnitt)
  head: [
    'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
    'Suit_Male', 'Suit_Female', 'Doctor_Male_Young', 'Doctor_Female_Young', 'Doctor_Female_Old', 'OldClassy_Male', 'OldClassy_Female',
    'Worker_Female', 'Chef_Hat', 'Chef_Female', 'Cowboy_Male', 'Cowboy_Female', 'Pirate_Male', 'Pirate_Female',
    'Viking_Male', 'Viking_Female', 'VikingHelmet', 'Kimono_Male', 'Kimono_Female', 'Wizard', 'Witch', 'Elf',
    'Goblin_Male', 'Goblin_Female', 'Zombie_Male', 'Zombie_Female', 'Cow', 'Pug',
  ].map((id) => ({ id })),
  body: [
    'Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Bald', 'Suit_Male', 'OldClassy_Male', 'Worker_Male',
    'Doctor_Male_Young', 'Chef_Hat', 'Cowboy_Male', 'Pirate_Male', 'Viking_Male', 'Kimono_Male', 'Knight_Golden_Male',
    'Wizard', 'Witch', 'Elf', 'Goblin_Female', 'Goblin_Male', 'Zombie_Male',
  ].map((id) => ({ id })),
  legs: [
    'Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Suit_Male', 'OldClassy_Male', 'Worker_Male', 'Doctor_Male_Young',
    'Chef_Hat', 'Cowboy_Male', 'Pirate_Male', 'Viking_Male', 'Kimono_Male', 'Knight_Golden_Male', 'Wizard', 'Witch',
    'Elf', 'Goblin_Female', 'Goblin_Male', 'Zombie_Male',
  ].map((id) => ({ id })),
  shoes: [
    { id: 'none', label: 'Barfuß' },
    { id: 'sneakerWhite', label: 'Sneaker weiß' },
    { id: 'sneakerBlack', label: 'Sneaker schwarz' },
    { id: 'hightopRed', label: 'High-Tops rot' },
    { id: 'platform', label: 'Plateau-Boots' },
    { id: 'bootsBrown', label: 'Stiefel braun' },
    { id: 'raveNeon', label: 'Neon-Sneaker' },
  ],
};

export const SLOTS = ['hat', 'head', 'body', 'legs', 'shoes'];

/** Fußstummel: Haut-Dreiecke unterhalb dieser Höhe (Ruhelage, Weltmaß der Datei ≈ 3,2 hoch).
 *  Mit Schuhen fallen sie weg; die Schuhe reichen deshalb bis über diese Höhe. */
const FOOT_Y = 0.2;
const boneRegion = (b) => (/^(Head|Neck)/.test(b) ? 'head' : /^(UpperLeg|LowerLeg|Hips|Body|Foot)/.test(b) ? 'legs' : 'body');
const isSkin = (name) => /^(skin|face)/i.test(name || '');

/**
 * Dreiecke einer geladenen Figur (Szene in Ruhelage) den Bereichen zuordnen.
 * @returns {Map<THREE.SkinnedMesh, { hat: number[], head: number[], body: number[], legs: number[], feet: number[] }>}
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
      tris.push({ region, cy });
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
    const sets = { hat: [], head: [], body: [], legs: [], feet: [] };
    const votes = matVotes.get(name);
    // nur wenn der Rest klein ist (Hemdsaum an der Hüfte) — Anzug/Kimono/Rüstung: Jacke und Hose
    // sind ein Material und werden nach Knochen geteilt
    const major = votes && Math.min(votes.body, votes.legs) < 0.25 * Math.max(votes.body, votes.legs)
      ? (votes.body >= votes.legs ? 'body' : 'legs') : null;
    tris.forEach(({ region, cy }, t) => {
      let r = region;
      if (r === 'head' && hatRe && hatRe.test(name)) r = 'hat';
      else if (r !== 'head' && major && !isSkin(name)) r = major;
      if (r === 'legs' && isSkin(name) && cy < FOOT_Y) r = 'feet';
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
  return { hat: 'none', head: PARTS.head[0]?.id || 'Casual_Male', body: PARTS.body[0]?.id || 'Casual_Male', legs: PARTS.legs[0]?.id || 'Casual_Male', shoes: 'sneakerWhite', skin: 1 };
}

// ── Schuhe ──────────────────────────────────────────────────────────────────
const SHOES = {
  // h: Oberkante über dem Boden — mindestens bis über FOOT_Y, dort endet das Bein ohne Stummel
  sneakerWhite: { upper: '#f2f2f0', sole: '#d9d9d6', accent: '#3a3f4a', h: 0.24, sole_h: 0.05 },
  sneakerBlack: { upper: '#1d1f24', sole: '#f0f0ee', accent: '#e8e8e8', h: 0.24, sole_h: 0.05 },
  hightopRed: { upper: '#c3262e', sole: '#f2f2ee', accent: '#ffffff', h: 0.32, sole_h: 0.05 },
  platform: { upper: '#121216', sole: '#121216', accent: '#8a8f99', h: 0.34, sole_h: 0.12, metal: true },
  bootsBrown: { upper: '#6b4428', sole: '#2a1c12', accent: '#a8743f', h: 0.36, sole_h: 0.055 },
  raveNeon: { upper: '#1a1a1f', sole: '#39ff88', accent: '#ff3fd2', h: 0.25, sole_h: 0.07, glow: true },
};

/**
 * Ein Schuh als Gruppe in Fuß-Ruhelage (Weltmaß der Datei): Sohle + Oberteil + Streifen.
 * Ursprung = Fußknochen, vorne = +z. stub: Maße des Fußstummels (Breite, Länge, Mitte z).
 */
export function buildShoe(kind, stub) {
  const spec = SHOES[kind];
  if (!spec) return null;
  const g = new THREE.Group();
  const w = stub.w + 0.05, l = stub.l + 0.07;
  const mats = {
    upper: new THREE.MeshStandardMaterial({ color: spec.upper, roughness: 0.7, metalness: spec.metal ? 0.2 : 0 }),
    sole: new THREE.MeshStandardMaterial({ color: spec.sole, roughness: 0.85, emissive: spec.glow ? spec.sole : '#000000', emissiveIntensity: spec.glow ? 0.9 : 0 }),
    accent: new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.6, emissive: spec.glow ? spec.accent : '#000000', emissiveIntensity: spec.glow ? 0.6 : 0 }),
  };
  const sole = new THREE.Mesh(roundedBox(w, spec.sole_h, l, 0.03), mats.sole);
  sole.position.set(0, spec.sole_h / 2 - 0.035, stub.z);
  const upperH = spec.h - spec.sole_h + 0.035;
  const upper = new THREE.Mesh(roundedBox(w * 0.94, upperH, l * 0.92, 0.05), mats.upper);
  upper.position.set(0, spec.sole_h - 0.035 + upperH / 2, stub.z - 0.01);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.03, l * 0.5), mats.accent);
  stripe.position.set(0, spec.sole_h - 0.035 + upperH * 0.45, stub.z - 0.02);
  g.add(sole, upper, stripe);
  g.userData.materials = Object.values(mats);
  return g;
}

function roundedBox(w, h, d, r) {
  // Kleine abgerundete Box: Kugel-Kappen sparen wir uns, ein abgeflachter Zylinder-Rand reicht
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Ecken in x/z abrunden
    const ax = Math.abs(v.x) / (w / 2), az = Math.abs(v.z) / (d / 2);
    if (ax > 0.99 && az > 0.99) { v.x *= 1 - r / w * 2; v.z *= 1 - r / d * 2; }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
