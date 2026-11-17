// render3d/tools/bakeFigures.mjs — rechnet die Figuren der 3D-Ansicht einmalig in kleine Dateien um.
//
//   npm run adventure:figuren -- <Ordner mit den Quelldateien> [name,name,…]
//
// Mit Namensliste werden nur diese Figuren neu gebacken (die Quellen der übrigen braucht es dann nicht).
//
// Quelle: KayKit „Character Pack: Skeletons“ und „Character Pack: Adventurers“ von Kay Lousberg (CC0), siehe
// public/media/av3d/README.md. Die Originale sind je 3,5–4,8 MB groß (über 90 Animationen pro Figur) und gehören nicht
// ins Projekt. Das Spiel braucht davon nur wenige Standbilder: acht Schritte einer Gangart und die stehende Figur.
//
// Was hier passiert, je Figur aus FIGURES:
//   1. Datei lesen, Ausrüstung auswählen (keep) bzw. Waffen in die Hände stecken (right/left)
//   2. Gangart abspielen und zu acht Zeitpunkten jede Ecke dorthin rechnen, wo das Skelett sie hinzieht
//   3. Farbe jeder Ecke aus der Farbtafel der Figur lesen (die Figuren nutzen eine gemeinsame Textur als Palette)
//   4. doppelte Ecken zusammenlegen, auf Körperhöhe 1 normen, Füße bei y = 0
//   5. als <name>.bin nach public/media/av3d schreiben (Format unten, gelesen von render3d/figures3d.js)
//
// Dateiformat: "AVF1" · uint32 Länge der Beschreibung · Beschreibung als JSON (auf 4 Bytes aufgefüllt) · dann Daten:
//   je Bild int16 × 3 pro Ecke (0…32767 über box.min…box.max) · uint8 × 3 Farbe pro Ecke (sRGB) · uint16 × 3 pro Dreieck

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

// Der FBX-Lader will Texturen als Bilder laden (geht nur im Browser) — hier reicht ein leerer Platzhalter, die Farben
// kommen aus den PNG-Dateien (textures bei den Helden unten)
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

const WALK_FRAMES = 8;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../public/media/av3d");

// out = Dateiname · file = Quelldatei (unter dem Quellordner) · clip = Gangart · idle = Stand (ohne Angabe "Idle")
//
// KayKit-Figuren (kaykit/): keep = Ausrüstung, die in der Datei steckt und bleiben soll (alles andere fällt weg),
// right/left = Waffe aus kaykit/assets/ in die rechte/linke Hand.
// Monster (monster/, Quaternius „Ultimate Monsters“): drei Bauarten mit eigenen Gangarten — kleine Blobs (Walk),
// große Zweibeiner (Walk/Run) und Flieger (Fast_Flying, Stand = Flying_Idle). all = alle Teile behalten.
// gain hellt die Farben auf: die Monster sind für eine grellere Beleuchtung gefärbt als die KayKit-Figuren.
const K = (out, file, clip, extra = {}) => ({ out, file: `kaykit/${file}.glb`, clip, ...extra });
const BLOB = (out, file) => ({ out, file: `monster/${file}.glb`, clip: "Walk", all: true, gain: 2.4 });
const BIG = (out, file, clip = "Walk") => ({ out, file: `monster/${file}.glb`, clip, all: true, gain: 2.4 });
const FLY = (out, file) => ({ out, file: `monster/${file}.glb`, clip: "Fast_Flying", idle: "Flying_Idle", all: true, gain: 2.4 });
// Neue Welten ab Zyklus 2 (poly/, Quaternius auf poly.pizza, CC0): weitere Monster, die Roboter-Gegner und Mechs aus dem
// „Ultimate Space Kit“, der „Animated Robot“. Mit Textur (Mechs, Sumpfwicht) gilt die Farbtafel, gain wirkt dann nicht.
// measureAll: die ganze Figur zählt zur Höhe (der Automat trägt seinen Kopf als starres Teil — sonst wäre er dreimal zu groß)
const P = (out, file, clip = "Walk", extra = {}) => ({ out, file: `poly/${file}.glb`, clip, all: true, gain: 2.4, measureAll: true, ...extra });
const PFLY = (out, file) => P(out, file, "Fast_Flying", { idle: "Flying_Idle" });
// Helden der neuen Kits (rpg/, Quaternius „RPG Characters – Nov 2020“, CC0, OpenGameArt): nur als FBX zu haben. Die Farben
// stehen in einer Textur je Material (Körper, Waffe) — textures ordnet Materialnamen den PNG-Dateien zu. FBX zählt die
// Texturhöhe von unten (flipV).
// Requisiten (prop/, CC0, poly.pizza): starre Modelle ohne Skelett — nur ein Standbild (walkFrames 0). Die ganze Figur
// zählt zur Höhe; gain wie bei den Monstern, Texturen (falls vorhanden) über die Farbtafel der GLB.
const PROP = (out, file, extra = {}) => ({ out, file: `prop/${file}.glb`, static: true, all: true, gain: 1.8, measureAll: true, ...extra });
const R = (out, file, clip, textures) => ({ out, file: `rpg/FBX/${file}.fbx`, fbx: true, clip, all: true, flipV: true, texGain: 1.9,
  textures: Object.fromEntries(Object.entries(textures).map(([mat, png]) => [mat, `rpg/Textures/${png}.png`])) });

export const FIGURES = [
  // Verlies und Helden
  K("skelett_knecht", "Skeleton_Minion", "Running_A", { right: "Skeleton_Blade" }),
  K("skelett_krieger", "Skeleton_Warrior", "Running_A", { right: "Skeleton_Axe", left: "Skeleton_Shield_Small_A", keep: ["Skeleton_Warrior_Helmet"] }),
  K("skelett_schild", "Skeleton_Warrior", "Walking_A", { right: "Skeleton_Blade", left: "Skeleton_Shield_Large_A", keep: ["Skeleton_Warrior_Helmet"] }),
  K("skelett_schleicher", "Skeleton_Rogue", "Walking_A", { keep: ["Skeleton_Rogue_Cape"] }),
  K("skelett_schuetze", "Skeleton_Rogue", "Walking_A", { right: "Skeleton_Crossbow", keep: ["Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"] }),
  K("skelett_magier", "Skeleton_Mage", "Walking_A", { right: "Skeleton_Staff", keep: ["Skeleton_Mage_Hat"] }),
  K("barbar_wild", "Barbarian", "Walking_A", { keep: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"] }),
  K("ritter_dunkel", "Knight", "Walking_A", { keep: ["2H_Sword", "Knight_Helmet", "Knight_Cape"] }),
  K("held_ritter", "Knight", "Running_A", { keep: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"] }),
  K("held_schurke", "Rogue", "Running_A", { keep: ["1H_Crossbow", "Rogue_Cape"] }),
  K("held_kapuze", "Rogue_Hooded", "Running_A", { keep: ["Knife", "Knife_Offhand", "Rogue_Cape"] }),
  K("held_magier", "Mage", "Running_A", { keep: ["2H_Staff", "Mage_Hat", "Mage_Cape"] }),
  K("held_barbar", "Barbarian", "Running_A", { keep: ["1H_Axe", "Barbarian_Round_Shield", "Barbarian_Hat", "Barbarian_Cape"] }),
  // Kristallhöhle
  BLOB("schleim", "601_GreenBlob"),
  FLY("fledermaus", "576_Goleling"),
  BLOB("pilzling", "604_Mushnub"),
  BIG("pilzkoenig", "569_MushroomKing"),
  BIG("tentakel", "573_Alien"),
  // Glutwüste
  BLOB("kaktus", "596_Cactoro"),
  FLY("biene", "594_Armabee"),
  BIG("kaktusriese", "574_Cactoro"),
  BIG("dino", "566_Dino"),
  FLY("maske", "585_Tribal"),
  FLY("koenig", "591_AlpakingEvolved"),
  // Frostgipfel
  BLOB("yeti_klein", "579_Yeti"),
  BLOB("vogel", "589_Pigeon"),
  BIG("yeti", "570_Yeti"),
  FLY("geist", "581_Ghost"),
  BLOB("schleim_rosa", "587_PinkSlime"),
  // Schlackefeld und Finale
  FLY("drache_klein", "599_Dragon"),
  BLOB("hexer", "577_Wizard"),
  BLOB("kobold", "606_OrcEnemy"),
  BIG("daemon", "572_Demon", "Run"),
  FLY("drache", "584_DragonEvolved"),
  // Pilzwald (ab Zyklus 2)
  P("stachelpilz", "MushnubEvolved"),
  P("affenwicht", "Monkroose"),
  // Sumpf
  P("kroete", "Frog_b"),
  P("riesenfrosch", "Frog_a", "Frog_Jump", { idle: "Frog_Idle" }),
  PFLY("glub", "Glub"),
  PFLY("glub_gross", "GlubEvolved"),
  PFLY("krake", "Squidle"),
  P("sumpfwicht", "EnemyLarge"),
  // Uhrwerkturm
  P("robo_laeufer", "RobotEnemy"),
  P("robo_drohne", "RobotEnemyFlying"),
  P("robo_kugel", "RobotEnemyLarge"),
  P("robo_kanone", "RobotEnemyLegsGun"),
  P("mech_gelb", "Mech_d"),
  P("mech_orange", "Mech_b", "Run"),
  P("automat", "AnimatedRobot", "Robot_Walking", { idle: "Robot_Idle" }),
  P("hornschleim", "SlimeEnemy"),
  // Begleiter der Jägerin (Quaternius, poly.pizza, CC0)
  P("wolf", "Wolf", "Gallop"),
  // Neue Gegner (auch Zyklus 1): Fuchs, Husky, Krabbe, Geschütz-Drohne
  P("fuchs", "Fox", "Gallop"), P("husky", "Husky", "Gallop"), P("krabbe", "CrabEnemy"), P("robo_geschuetz", "RobotEnemyLargeGun"),
  // Requisiten (prop/, CC0, poly.pizza): Kisten, Schreine, Altar, Fangeisen der Jägerin, Kristalle der Höhle
  PROP("kiste", "Chest_a"), PROP("kiste_gross", "Chest_c"), PROP("kiste_rot", "Chest_d"), PROP("kiste_offen", "Chest_b"),
  PROP("schrein", "Shrine_a"), PROP("altar", "Shrine_b"), PROP("fangeisen", "BearTrap_a"), PROP("kristall", "Crystal_a"), PROP("kristall2", "Crystal_b"),
  // Helden der neuen Kits
  R("held_moench", "Monk", "Run", { Monk_Texture: "Monk_Texture" }),
  R("held_jaegerin", "Ranger", "Run", { Ranger_Texture: "Ranger_Texture", Bow_Texture: "Ranger_Bow_Texture" }),
  R("held_klerikerin", "Cleric", "Run_Weapon", { Cleric_Texture: "Cleric_Texture", Cleric_Staff_Texture: "Cleric_Staff_Texture" }),
  R("held_gelehrter", "Wizard", "Run_Weapon", { Wizard_Texture: "Wizard_Texture", Wizard_Staff_Texture: "Wizard_Staff_Texture" }),
];

// ── GLB lesen ───────────────────────────────────────────────────────────────
function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("latin1", 0, 4) !== "glTF") throw new Error(`${file}: keine GLB-Datei`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

// .gltf mit .bin daneben (die Waffen liegen so vor)
function readGltf(file) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const bin = fs.readFileSync(path.join(path.dirname(file), json.buffers[0].uri));
  delete json.buffers[0].uri;
  return { json, bin };
}

// Der Lader soll keine Bilder anfassen (das geht nur im Browser): Bilder merken und aus der Beschreibung streichen
function stripImages({ json, bin }) {
  const textured = new Set();
  let atlas = null;
  for (const m of json.materials || []) {
    if (m.pbrMetallicRoughness?.baseColorTexture) { textured.add(m.name); delete m.pbrMetallicRoughness.baseColorTexture; }
    delete m.emissiveTexture; delete m.normalTexture; delete m.occlusionTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
  }
  const img = json.images?.[0];
  if (img?.bufferView !== undefined) {
    const v = json.bufferViews[img.bufferView];
    atlas = decodePng(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
  }
  delete json.images; delete json.textures; delete json.samplers;
  return { textured, atlas };
}

function toArrayBuffer({ json, bin }) {
  let text = Buffer.from(JSON.stringify(json), "utf8");
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  let data = bin;
  if (data.length % 4) data = Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  const out = Buffer.alloc(12 + 8 + text.length + 8 + data.length);
  out.write("glTF", 0, "latin1"); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(text.length, 12); out.write("JSON", 16, "latin1"); text.copy(out, 20);
  out.writeUInt32LE(data.length, 20 + text.length); out.write("BIN\0", 24 + text.length, "latin1"); data.copy(out, 28 + text.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

const parse = (glb) => new Promise((resolve, reject) => new GLTFLoader().parse(toArrayBuffer(glb), "", resolve, reject));

// ── PNG lesen (8 Bit, RGB / RGBA / Palette, ohne Interlace — mehr kommt in den Paketen nicht vor) ─────────
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 0, palette = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || data[12] !== 0 || ![2, 3, 6].includes(type)) throw new Error(`PNG-Art nicht unterstützt (Tiefe ${data[8]}, Farbtyp ${type}, Interlace ${data[12]})`);
    } else if (name === "PLTE") palette = data;
    else if (name === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgb = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = (raw[pos++] + pred) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      if (type === 3) { const i = cur[x] * 3; rgb[o] = palette[i]; rgb[o + 1] = palette[i + 1]; rgb[o + 2] = palette[i + 2]; }
      else { rgb[o] = cur[x * bpp]; rgb[o + 1] = cur[x * bpp + 1]; rgb[o + 2] = cur[x * bpp + 2]; }
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgb };
}

// ── Backen ──────────────────────────────────────────────────────────────────
const _v = new THREE.Vector3();
const toLinear = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const byte = (linear) => Math.round(255 * Math.min(1, Math.max(0, linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055)));

function colorOf(mesh, i, textured, atlas, gain = 1, extra = {}) {
  const mat = extra.matOf ? extra.matOf(i) : mesh.material;
  // FBX: eine Textur je Material
  const own = extra.atlases?.get(mat.name);
  if (own && mesh.geometry.attributes.uv) {
    const uv = mesh.geometry.attributes.uv;
    const v = extra.flipV ? 1 - uv.getY(i) : uv.getY(i);
    const x = Math.min(own.w - 1, Math.max(0, Math.floor(uv.getX(i) * own.w))), y = Math.min(own.h - 1, Math.max(0, Math.floor(v * own.h)));
    const o = (y * own.w + x) * 3;
    // texGain hellt im linearen Farbraum auf (die gemalten Texturen sind dunkler als die KayKit-Figuren)
    const k = extra.texGain || 1;
    return k === 1 ? [own.rgb[o], own.rgb[o + 1], own.rgb[o + 2]] : [0, 1, 2].map((c) => byte(toLinear(own.rgb[o + c]) * k));
  }
  if (textured.has(mat.name) && atlas && mesh.geometry.attributes.uv) {
    const uv = mesh.geometry.attributes.uv;
    const x = Math.min(atlas.w - 1, Math.max(0, Math.floor(uv.getX(i) * atlas.w))), y = Math.min(atlas.h - 1, Math.max(0, Math.floor(uv.getY(i) * atlas.h)));
    const o = (y * atlas.w + x) * 3;
    return [atlas.rgb[o], atlas.rgb[o + 1], atlas.rgb[o + 2]];
  }
  // ohne Textur: Materialfarbe; leuchtende Teile (Augen der Skelette) nehmen ihre Leuchtfarbe
  const c = mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05 ? mat.emissive : mat.color;
  return [byte(c.r * gain), byte(c.g * gain), byte(c.b * gain)];
}

// Material je Ecke, wenn ein Netz mehrere Materialien hat (Gruppen über den Index)
function materialLookup(mesh) {
  if (!Array.isArray(mesh.material)) return null;
  const geo = mesh.geometry, idx = geo.index, per = new Uint8Array(geo.attributes.position.count);
  for (const gr of geo.groups) for (let k = gr.start; k < gr.start + gr.count; k++) per[idx ? idx.getX(k) : k] = gr.materialIndex;
  return (i) => mesh.material[per[i]] || mesh.material[0];
}

async function bake(def, srcDir) {
  let textured = new Set(), atlas = null, gltf, atlases = null;
  if (def.fbx) {
    const buf = fs.readFileSync(path.join(srcDir, def.file));
    const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), "");
    gltf = { scene: obj, animations: obj.animations };
    atlases = new Map(Object.entries(def.textures).map(([mat, png]) => [mat, decodePng(fs.readFileSync(path.join(srcDir, png)))]));
  } else {
    const glb = readGlb(path.join(srcDir, def.file));
    ({ textured, atlas } = stripImages(glb));
    gltf = await parse(glb);
  }
  const scene = gltf.scene;

  // Ausrüstung: starre Teile, die an Knochen hängen — nur die gewünschten bleiben (bei all: alle)
  const keep = new Set(def.keep || []);
  const drop = [];
  scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !def.all && !keep.has(o.name)) drop.push(o); });
  for (const o of drop) o.parent.remove(o);
  for (const name of keep) if (!scene.getObjectByName(name)) throw new Error(`${def.out}: Ausrüstung ${name} fehlt in ${def.file}`);

  // Waffen aus eigenen Dateien in die Hände (der Lader streicht Punkte aus Namen: handslot.r → handslotr)
  for (const [side, asset] of [["r", def.right], ["l", def.left]]) {
    if (!asset) continue;
    const slot = scene.getObjectByName(`handslot${side}`) || scene.getObjectByName(`handslot.${side}`);
    if (!slot) throw new Error(`${def.out}: Hand ${side} nicht gefunden`);
    const weapon = readGltf(path.join(srcDir, "kaykit/assets", `${asset}.gltf`));
    for (const n of stripImages(weapon).textured) textured.add(n);
    slot.add((await parse(weapon)).scene);
  }

  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const count = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
  const mixer = new THREE.AnimationMixer(scene);
  // Die Monster-Dateien stellen den Namen des Skeletts voran ("CharacterArmature|Walk")
  const clipNamed = (name) => { const c = gltf.animations.find((a) => a.name === name || a.name.endsWith(`|${name}`)); if (!c) throw new Error(`${def.out}: Animation ${name} fehlt`); return c; };

  const pose = (clip, t) => {
    mixer.stopAllAction();
    if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
    scene.updateMatrixWorld(true);
    const pos = new Float32Array(count * 3);
    let v0 = 0;
    for (const m of meshes) {
      const src = m.geometry.attributes.position;
      for (let i = 0; i < src.count; i++) {
        _v.fromBufferAttribute(src, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, _v);
        _v.applyMatrix4(m.matrixWorld);
        pos.set([_v.x, _v.y, _v.z], (v0 + i) * 3);
      }
      v0 += src.count;
    }
    return pos;
  };
  // Starre Modelle: kein Gangbild, nur der Stand
  const nWalk = def.static ? 0 : WALK_FRAMES;
  const walkClip = def.static ? null : clipNamed(def.clip);
  const frames = [];
  for (let f = 0; f < nWalk; f++) frames.push(pose(walkClip, (walkClip.duration * f) / nWalk));
  frames.push(pose(def.static ? null : clipNamed(def.idle || "Idle"), 0));
  const idle = frames[nWalk];

  // Farben, Dreiecke und die Frage "gehört die Ecke zum Körper?" (Waffen zählen nicht zur Körperhöhe)
  const colors = new Uint8Array(count * 3), body = new Uint8Array(count);
  const tris = [];
  let v0 = 0;
  for (const m of meshes) {
    const n = m.geometry.attributes.position.count;
    const extra = { atlases, flipV: def.flipV, texGain: def.texGain, matOf: materialLookup(m) };
    for (let i = 0; i < n; i++) { colors.set(colorOf(m, i, textured, atlas, def.gain, extra), (v0 + i) * 3); body[v0 + i] = def.measureAll || m.isSkinnedMesh ? 1 : 0; }
    const ix = m.geometry.index;
    for (let i = 0; i < (ix ? ix.count : n); i++) tris.push((ix ? ix.getX(i) : i) + v0);
    v0 += n;
  }

  // Auf Körperhöhe 1 normen, Füße auf den Boden, mittig (Maß: der stehende Körper ohne Ausrüstung)
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    if (!body[i]) continue;
    const x = idle[i * 3], y = idle[i * 3 + 1], z = idle[i * 3 + 2];
    minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const k = 1 / (maxY - minY), cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (const f of frames) for (let i = 0; i < count; i++) { f[i * 3] = (f[i * 3] - cx) * k; f[i * 3 + 1] = (f[i * 3 + 1] - minY) * k; f[i * 3 + 2] = (f[i * 3 + 2] - cz) * k; }

  // Doppelte Ecken zusammenlegen: gleich, wenn sie in drei Bildern am selben Ort liegen und dieselbe Farbe haben.
  // (Eine echte Vereinfachung für die Massen-Figuren fehlt noch — ein grobes Gitter brachte im November 2026 nur
  // 10–20 % weniger Dreiecke und frisst bei stärkerer Einstellung die dünnen Skelett-Arme.)
  const remap = new Uint32Array(count), keepIdx = [];
  const seen = new Map();
  const q = (f, i) => `${Math.round(f[i * 3] * 4000)},${Math.round(f[i * 3 + 1] * 4000)},${Math.round(f[i * 3 + 2] * 4000)}`;
  for (let i = 0; i < count; i++) {
    const key = `${q(idle, i)}|${q(frames[2] || idle, i)}|${q(frames[6] || idle, i)}|${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]}`;
    let j = seen.get(key);
    if (j === undefined) { j = keepIdx.length; seen.set(key, j); keepIdx.push(i); }
    remap[i] = j;
  }
  const verts = keepIdx.length;
  if (verts > 65535) throw new Error(`${def.out}: ${verts} Ecken passen nicht in 16 Bit`);
  const index = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = remap[tris[t]], b = remap[tris[t + 1]], c = remap[tris[t + 2]];
    if (a !== b && b !== c && a !== c) index.push(a, b, c);
  }

  // Schreiben
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const f of frames) for (const i of keepIdx) for (let a = 0; a < 3; a++) { box.min[a] = Math.min(box.min[a], f[i * 3 + a]); box.max[a] = Math.max(box.max[a], f[i * 3 + a]); }
  const meta = { name: def.out, source: def.file, clip: def.clip || "stand", duration: walkClip ? +walkClip.duration.toFixed(3) : 1, walkFrames: nWalk, verts, tris: index.length / 3, box };
  let text = Buffer.from(JSON.stringify(meta), "utf8");
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const posBytes = frames.length * verts * 6, colBytes = Math.ceil((verts * 3) / 4) * 4;
  const out = Buffer.alloc(8 + text.length + posBytes + colBytes + index.length * 2);
  out.write("AVF1", 0, "latin1"); out.writeUInt32LE(text.length, 4); text.copy(out, 8);
  let p = 8 + text.length;
  for (const f of frames) for (const i of keepIdx) for (let a = 0; a < 3; a++) { out.writeUInt16LE(Math.round(((f[i * 3 + a] - box.min[a]) / (box.max[a] - box.min[a] || 1)) * 32767), p); p += 2; }
  keepIdx.forEach((i, n) => { out[p + n * 3] = colors[i * 3]; out[p + n * 3 + 1] = colors[i * 3 + 1]; out[p + n * 3 + 2] = colors[i * 3 + 2]; });
  p += colBytes;
  for (const i of index) { out.writeUInt16LE(i, p); p += 2; }
  fs.writeFileSync(path.join(OUT_DIR, `${def.out}.bin`), out);
  return { ...meta, bytes: out.length, before: count };
}

// ── Aufruf ──────────────────────────────────────────────────────────────────
const srcDir = process.argv[2];
if (!srcDir || !fs.existsSync(srcDir)) {
  console.error("Aufruf: npm run adventure:figuren -- <Ordner mit den Quelldateien>\nDer Ordner enthält die .glb der Figuren und in assets/ die Waffen (.gltf + .bin). Quellen: public/media/av3d/README.md");
  process.exit(2);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
if (only) for (const name of only) if (!FIGURES.some((d) => d.out === name)) { console.error(`Unbekannte Figur: ${name}`); process.exit(2); }
let total = 0, done = 0;
for (const def of FIGURES) {
  if (only && !only.has(def.out)) continue;
  const r = await bake(def, srcDir);
  done++;
  total += r.bytes;
  console.log(`${r.name.padEnd(20)} ${String(r.verts).padStart(5)} Ecken (vorher ${r.before}), ${String(r.tris).padStart(5)} Dreiecke, ${(r.bytes / 1024).toFixed(0).padStart(4)} KB · ${r.clip} ${r.duration} s`);
}
console.log(`${done} Figuren, zusammen ${(total / 1024).toFixed(0)} KB → ${OUT_DIR}`);
