// retargetPeople.mjs — Bewegungen der Mannequin-Figur (dancer.glb) auf das Skelett des
// Quaternius „Ultimate Animated Character Pack“ (CC0) übertragen.
//
// Aufruf (aus Frontend/):
//   node scripts/dancerBake/retargetPeople.mjs <dancer.glb> <ziel.glb> <out.glb>
//   dancer.glb: public/media/stream3d/dancer.glb (Mocap-Tänze + Alltagsclips)
//   ziel.glb:   eine Figur des Pakets, vorher mit FBX2glTF umgewandelt (alle 50 Figuren teilen ein Skelett)
// @gltf-transform/core ist keine Projekt-Abhängigkeit — nur für diesen Lauf: npm i --no-save @gltf-transform/core
//
// Verfahren: Das Ziel steht mit hängenden Armen und leicht gebeugten Knien in Ruhe, das Mannequin in
// T-Pose. Deshalb wird das Ziel zuerst rechnerisch in dieselbe Pose gebracht (jeder Glied-Knochen zeigt
// in dieselbe Richtung wie sein Gegenstück). Danach gilt je Bild:
//   Welt_Ziel = Welt_Quelle · Ruhe_Quelle⁻¹ · Ruhe_Ziel(ausgerichtet)
// Die Füße sind im Ziel IK-Knochen direkt unter der Wurzel: Ihre Lage kommt aus dem Knöchel des
// Unterschenkels. Die Hüfte (Body) wandert um die Hüftbewegung der Quelle, skaliert mit der Beinlänge.
import fs from 'fs';
const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
const { NodeIO } = await import('@gltf-transform/core');

const [SRC, TGT, OUT] = process.argv.slice(2);
const FPS = 30;
/** Clips, bei denen der Boden nicht nachgeführt wird (Hüfte gehört auf die Sitzfläche). */
const SEATED = new Set(['sit', 'sitTalk', 'sitEnter', 'sitExit']);

const MAP = {
  'DEF-hips': 'Body', 'DEF-spine001': 'Hips', 'DEF-spine002': 'Abdomen', 'DEF-spine003': 'Torso',
  'DEF-neck': 'Neck', 'DEF-head': 'Head',
};
for (const [s, t] of [['L', 'L'], ['R', 'R']]) {
  Object.assign(MAP, {
    [`DEF-shoulder${s}`]: `Shoulder${t}`, [`DEF-upper_arm${s}`]: `UpperArm${t}`, [`DEF-forearm${s}`]: `LowerArm${t}`,
    [`DEF-hand${s}`]: `Fist${t}`, [`DEF-thigh${s}`]: `UpperLeg${t}`, [`DEF-shin${s}`]: `LowerLeg${t}`, [`DEF-foot${s}`]: `Foot${t}`,
  });
}
/** Ausrichtung: [Zielknochen, Zielkind] ↔ [Quellknochen, Quellkind] — Richtung Knochen → Kind. */
const ALIGN = [];
for (const s of ['L', 'R']) {
  ALIGN.push(
    [`Shoulder${s}`, `UpperArm${s}`, `DEF-shoulder${s}`, `DEF-upper_arm${s}`],
    [`UpperArm${s}`, `LowerArm${s}`, `DEF-upper_arm${s}`, `DEF-forearm${s}`],
    [`LowerArm${s}`, `Fist${s}`, `DEF-forearm${s}`, `DEF-hand${s}`],
    [`Fist${s}`, `Fist${s}_end`, `DEF-forearm${s}`, `DEF-hand${s}`],     // Faust gerade in Verlängerung des Unterarms
    [`UpperLeg${s}`, `LowerLeg${s}`, `DEF-thigh${s}`, `DEF-shin${s}`],
    [`LowerLeg${s}`, `LowerLeg${s}_end`, `DEF-shin${s}`, `DEF-foot${s}`],
  );
}

const load = (f) => {
  const b = fs.readFileSync(f);
  return new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
};
const src = await load(SRC);
const tgt = await load(TGT);
const S = (n) => src.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)) || src.scene.getObjectByName(n);
const T = (n) => tgt.scene.getObjectByName(n);
src.scene.updateMatrixWorld(true);
tgt.scene.updateMatrixWorld(true);

const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

// ── Quelle: Ruhe (T-Pose) ──
const srcRestQ = new Map(Object.keys(MAP).map((n) => [n, wq(S(n))]));
const srcHipRest = wp(S('DEF-hips'));
const srcDir = new Map();
for (const [, , sb, sc] of ALIGN) srcDir.set(`${sb}>${sc}`, wp(S(sc)).sub(wp(S(sb))).normalize());

// ── Ziel: Knochen in Reihenfolge Eltern → Kinder ──
const tBones = [];
tgt.scene.traverse((o) => { if (o.isBone) tBones.push(o); });
const tRestLocal = new Map(tBones.map((b) => [b.name, { q: b.quaternion.clone(), p: b.position.clone() }]));

// Ziel in T-Pose bringen
for (const [tb, tc, sb, sc] of ALIGN) {
  const bone = T(tb);
  tgt.scene.updateMatrixWorld(true);
  const dT = wp(T(tc)).sub(wp(bone)).normalize();
  const dS = srcDir.get(`${sb}>${sc}`);
  const rot = new THREE.Quaternion().setFromUnitVectors(dT, dS);
  const newWorld = rot.multiply(wq(bone));
  bone.quaternion.copy(wq(bone.parent).invert().multiply(newWorld));
}
tgt.scene.updateMatrixWorld(true);
const tAlignedLocal = new Map(tBones.map((b) => [b.name, b.quaternion.clone()]));
const tAlignedQ = new Map(Object.values(MAP).map((n) => [n, wq(T(n))]));
const tBodyRest = wp(T('Body'));
// Knöchel: Lage des Fußknochens im Unterschenkel (ausgerichtete Ruhe)
const ankle = {};
for (const s of ['L', 'R']) ankle[s] = T(`LowerLeg${s}`).worldToLocal(wp(T(`Foot${s}`)));
const tFootRestY = wp(T('FootL')).y;
// Beinlänge Ziel / Quelle (Hüfte → Knöchel, gestreckt) — Maßstab für die Hüftbewegung
const legT = wp(T('UpperLegL')).distanceTo(wp(T('LowerLegL'))) + wp(T('LowerLegL')).distanceTo(wp(T('FootL')));
const legS = wp(S('DEF-thighL')).distanceTo(wp(S('DEF-shinL'))) + wp(S('DEF-shinL')).distanceTo(wp(S('DEF-footL')));
const K = legT / legS;
console.log(`Beinlänge Ziel ${legT.toFixed(3)} / Quelle ${legS.toFixed(3)} → ${K.toFixed(3)}`);

const resetTarget = () => {
  for (const b of tBones) { b.quaternion.copy(tAlignedLocal.get(b.name)); b.position.copy(tRestLocal.get(b.name).p); }
  tgt.scene.updateMatrixWorld(true);
};

/** Ein Bild: Quelle steht in Pose → Ziel-Lokalwerte. yOff verschiebt die Hüfte (Weltmaß). */
function poseTarget(yOff) {
  src.scene.updateMatrixWorld(true);
  resetTarget();
  const hipD = wp(S('DEF-hips')).sub(srcHipRest).multiplyScalar(K);
  for (const b of tBones) {
    const sName = Object.keys(MAP).find((k) => MAP[k] === b.name);
    if (!sName) continue;
    const world = wq(S(sName)).multiply(srcRestQ.get(sName).clone().invert()).multiply(tAlignedQ.get(b.name));
    b.quaternion.copy(wq(b.parent).invert().multiply(world));
    if (b.name === 'Body') {
      const p = tBodyRest.clone().add(hipD);
      p.y += yOff;
      b.position.copy(b.parent.worldToLocal(p));
    }
    if (/^Foot[LR]$/.test(b.name)) {
      const s = b.name.slice(-1);
      const leg = T(`LowerLeg${s}`);
      leg.updateMatrixWorld(true);
      b.position.copy(b.parent.worldToLocal(leg.localToWorld(ankle[s].clone())));
    }
    b.updateMatrixWorld(true);
  }
  return {
    q: new Map(tBones.map((b) => [b.name, b.quaternion.clone()])),
    p: new Map(['Body', 'FootL', 'FootR'].map((n) => [n, T(n).position.clone()])),
    footY: Math.min(wp(T('FootL')).y, wp(T('FootR')).y),
  };
}

// ── Alle Clips abtasten ──
const mixer = new THREE.AnimationMixer(src.scene);
const baked = [];
for (const clip of src.animations) {
  mixer.stopAllAction();
  const act = mixer.clipAction(clip);
  act.play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const at = (i) => { mixer.setTime(Math.min(clip.duration, i / FPS)); };
  // 1. Durchgang: Bodenhöhe (10-%-Quantil des tieferen Fußes → Ruhehöhe)
  let yOff = 0;
  if (!SEATED.has(clip.name)) {
    const lows = [];
    for (let i = 0; i < n; i++) { at(i); lows.push(poseTarget(0).footY); }
    lows.sort((a, b) => a - b);
    yOff = tFootRestY - lows[Math.floor(lows.length * 0.1)];
  }
  const frames = [];
  for (let i = 0; i < n; i++) { at(i); frames.push(poseTarget(yOff)); }
  mixer.uncacheAction(clip);
  baked.push({ name: clip.name, n, frames });
  console.log(`${clip.name.padEnd(12)} ${n} Bilder, Boden ${yOff.toFixed(3)}`);
}

// Sitzmaße für die Laufzeit (Clip „sit“, Figur-Ursprung auf 0): Hüfthöhe und wie weit hinten
{
  const sit = baked.find((b) => b.name === 'sit');
  if (sit) {
    resetTarget();
    const f = sit.frames[0];
    for (const b of tBones) b.quaternion.copy(f.q.get(b.name));
    T('Body').position.copy(f.p.get('Body'));
    tgt.scene.updateMatrixWorld(true);
    const hip = wp(T('Body'));
    const head = wp(T('Head_end') || T('Head'));
    console.log(`Sitzen (Weltmaß des Ziels): Hüfte y ${hip.y.toFixed(3)} z ${hip.z.toFixed(3)}, Kopf y ${head.y.toFixed(3)}`);
  }
}

// ── GLB schreiben: Ziel-Datei, alte Clips raus, neue rein ──
const io = new NodeIO();
const doc = await io.read(TGT);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
for (const a of root.listAnimations()) a.dispose();
// Nur Skelett-Knochen (ein Mesh heißt ebenfalls „Body“); Namen wie three.js sie bereinigt („UpperArm.L“ → „UpperArmL“)
const nodeBy = {};
for (const skin of root.listSkins()) {
  for (const j of skin.listJoints()) nodeBy[THREE.PropertyBinding.sanitizeNodeName(j.getName())] = j;
}
for (const b of baked) {
  const anim = doc.createAnimation(b.name);
  const tAcc = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(b.n).map((_, i) => i / FPS)).setBuffer(buffer);
  for (const bone of tBones) {
    const vals = new Float32Array(b.n * 4);
    const r0 = tRestLocal.get(bone.name).q;
    let varies = false;
    for (let i = 0; i < b.n; i++) {
      const q = b.frames[i].q.get(bone.name);
      if (i > 0) { const pq = new THREE.Quaternion().fromArray(vals, (i - 1) * 4); if (pq.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); }
      q.toArray(vals, i * 4);
      if (Math.abs(q.dot(r0)) < 0.99999) varies = true;
    }
    if (!varies || !nodeBy[bone.name]) continue;
    const smp = doc.createAnimationSampler().setInput(tAcc).setOutput(doc.createAccessor().setType('VEC4').setArray(vals).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(nodeBy[bone.name]).setTargetPath('rotation').setSampler(smp));
  }
  for (const name of ['Body', 'FootL', 'FootR']) {
    const pv = new Float32Array(b.n * 3);
    b.frames.forEach((f, i) => f.p.get(name).toArray(pv, i * 3));
    const smp = doc.createAnimationSampler().setInput(tAcc).setOutput(doc.createAccessor().setType('VEC3').setArray(pv).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(nodeBy[name]).setTargetPath('translation').setSampler(smp));
  }
}
await io.write(OUT, doc);
console.log('geschrieben', OUT, fs.statSync(OUT).size);
