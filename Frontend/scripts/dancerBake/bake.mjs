// bake.mjs — CMU-Tänze (BVH) auf das Quaternius-Mannequin übertragen und mit ausgewählten
// Quaternius-Clips in eine GLB schreiben (Ergebnis: public/media/stream3d/dancer.glb).
//
// Aufruf (aus Frontend/): node scripts/dancerBake/bake.mjs <out.glb> <quaternius.glb> <bvh-ordner>
//   quaternius.glb: AnimationLibrary_Godot_Standard.glb aus der Universal Animation Library (Standard, CC0)
//   bvh-ordner:     CMU-BVH-Dateien (github.com/Shriinivas/cmubvh), Dateinamen siehe dances.json
// @gltf-transform/core ist keine Projekt-Abhängigkeit — nur für diesen Lauf: npm i --no-save @gltf-transform/core
// Danach komprimieren: npx @gltf-transform/cli resample → prune → meshopt.
import fs from 'fs';
import path from 'path';
const THREE = await import('three');
const { BVHLoader } = await import('three/examples/jsm/loaders/BVHLoader.js');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { NodeIO } = await import('@gltf-transform/core');

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const SRC_GLB = path.resolve(process.argv[3]);
const CMU = path.resolve(process.argv[4]);
const FPS = 30;

// Quaternius-Clips, die bleiben (Name im Ergebnis ← Name im Original)
const KEEP = {
  idle: 'Idle_Loop',
  talk: 'Idle_Talking_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  sitEnter: 'Sitting_Enter',
  sit: 'Sitting_Idle_Loop',
  sitTalk: 'Sitting_Talking_Loop',
  sitExit: 'Sitting_Exit',
  danceQ: 'Dance_Loop',
  jumpStart: 'Jump_Start',
  jumpLand: 'Jump_Land',
};

// CMU-Tänze: [Name, Datei, Suchbereich Start/Ende in s, Schleifenlänge min/max in s, Wanderung behalten 0…1]
const DANCES = JSON.parse(fs.readFileSync(path.join(HERE, process.env.DANCES || 'dances.json'), 'utf8'));

const MAP = {
  'DEF-hips': 'Hips',
  'DEF-spine001': 'LowerBack',
  'DEF-spine002': 'Spine',
  'DEF-spine003': 'Spine1',
  'DEF-neck': 'Neck',
  'DEF-head': 'Head',
  'DEF-shoulderL': 'LeftShoulder', 'DEF-upper_armL': 'LeftArm', 'DEF-forearmL': 'LeftForeArm', 'DEF-handL': 'LeftHand',
  'DEF-shoulderR': 'RightShoulder', 'DEF-upper_armR': 'RightArm', 'DEF-forearmR': 'RightForeArm', 'DEF-handR': 'RightHand',
  'DEF-thighL': 'LeftUpLeg', 'DEF-shinL': 'LeftLeg', 'DEF-footL': 'LeftFoot', 'DEF-toeL': 'LeftToeBase',
  'DEF-thighR': 'RightUpLeg', 'DEF-shinR': 'RightLeg', 'DEF-footR': 'RightFoot', 'DEF-toeR': 'RightToeBase',
};

// ── Ziel-Skelett laden ──────────────────────────────────────────────────────
const glbBuf = fs.readFileSync(SRC_GLB);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength), '', res, rej));
const tBones = [];
gltf.scene.traverse((o) => { if (o.isBone) tBones.push(o); });
const tBy = Object.fromEntries(tBones.map((b) => [b.name, b]));
gltf.scene.updateMatrixWorld(true);
const restLocal = new Map(tBones.map((b) => [b.name, { q: b.quaternion.clone(), p: b.position.clone() }]));
const restWorldQ = new Map(tBones.map((b) => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
const hipRestWorld = tBy['DEF-hips'].getWorldPosition(new THREE.Vector3());

// Finger entspannt: lokale Drehungen aus dem ersten Bild von Idle_Loop
const idleClip = gltf.animations.find((a) => a.name === 'Idle_Loop');
const relaxed = new Map();
for (const tr of idleClip.tracks) {
  const [bn, prop] = tr.name.split('.');
  if (prop === 'quaternion' && /f_|thumb/.test(bn)) relaxed.set(bn, new THREE.Quaternion().fromArray(tr.values, 0));
}

// Reihenfolge Eltern vor Kindern
const order = [];
(function walk(o) { if (o.isBone) order.push(o); o.children.forEach(walk); })(gltf.scene);

// ── Ein BVH übertragen ─────────────────────────────────────────────────────
function retarget(file) {
  const r = new BVHLoader().parse(fs.readFileSync(path.join(CMU, file), 'utf8'));
  const sb = r.skeleton.bones;
  const sBy = Object.fromEntries(sb.map((b) => [b.name, b]));
  const tracks = Object.fromEntries(r.clip.tracks.map((t) => [t.name, t]));
  const nSrc = tracks['Hips.quaternion'].times.length;
  const srcDt = tracks['Hips.quaternion'].times[1] - tracks['Hips.quaternion'].times[0];
  const setFrame = (i) => {
    for (const b of sb) {
      const q = tracks[b.name + '.quaternion']; if (q) b.quaternion.fromArray(q.values, i * 4);
      const p = tracks[b.name + '.position']; if (p) b.position.fromArray(p.values, i * 3);
    }
    sb[0].updateMatrixWorld(true);
  };
  setFrame(0);
  const s0 = new Map(sb.map((b) => [b.name, b.getWorldQuaternion(new THREE.Quaternion()).invert()]));
  const hip0 = sBy.Hips.getWorldPosition(new THREE.Vector3());
  // Bodenhöhe: tiefster Zeh im T-Pose-Bild ≈ 0 → Maßstab über die Hüfthöhe
  const scale = hipRestWorld.y / hip0.y;

  // Bilder ab 1 (Bild 0 ist die eingefügte T-Pose), auf FPS umgerechnet
  const step = 1 / FPS / srcDt;
  const frames = [];
  for (let f = 1; f < nSrc; f += step) {
    const i = Math.round(f);
    if (i >= nSrc) break;
    setFrame(i);
    const world = new Map();
    for (const [tn, sn] of Object.entries(MAP)) {
      const d = sBy[sn].getWorldQuaternion(new THREE.Quaternion()).multiply(s0.get(sn));
      world.set(tn, d.multiply(restWorldQ.get(tn)));
    }
    const hp = sBy.Hips.getWorldPosition(new THREE.Vector3());
    frames.push({ world, hip: new THREE.Vector3((hp.x - hip0.x) * scale, hp.y * scale, (hp.z - hip0.z) * scale) });
  }
  return frames;
}

/** Lokale Drehungen aller Knochen für ein Bild (Weltdrehungen der gemappten Knochen vorgegeben). */
function toLocal(frame) {
  const worldNow = new Map();
  const local = new Map();
  const rigQ = tBy['root'].parent.getWorldQuaternion(new THREE.Quaternion());
  for (const b of order) {
    const parentW = b.parent && worldNow.has(b.parent.name) ? worldNow.get(b.parent.name) : (b.parent?.isBone ? null : rigQ);
    let lq;
    if (frame.world.has(b.name)) {
      lq = parentW.clone().invert().multiply(frame.world.get(b.name));
    } else {
      lq = (relaxed.get(b.name) || restLocal.get(b.name).q).clone();
    }
    local.set(b.name, lq);
    worldNow.set(b.name, parentW.clone().multiply(lq));
  }
  return local;
}

/** Abstand zweier Bilder (für Schleifenpunkte). */
function poseDist(a, b) {
  let s = 0;
  for (const k of ['DEF-hips', 'DEF-spine003', 'DEF-head', 'DEF-upper_armL', 'DEF-upper_armR', 'DEF-forearmL', 'DEF-forearmR', 'DEF-thighL', 'DEF-thighR', 'DEF-shinL', 'DEF-shinR']) {
    s += a.world.get(k).angleTo(b.world.get(k)) * (k === 'DEF-hips' ? 3 : 1);
  }
  return s + Math.abs(a.hip.y - b.hip.y) * 20;
}

function bestLoop(frames, d) {
  const a0 = Math.round(d.from * FPS), a1 = Math.min(frames.length - 1, Math.round(d.to * FPS));
  const lmin = Math.round(d.minLen * FPS), lmax = Math.round(d.maxLen * FPS);
  let best = { cost: Infinity };
  for (let a = a0; a < a1 - lmin; a += 2) {
    for (let L = lmin; L <= lmax && a + L <= a1; L += 1) {
      const c = poseDist(frames[a], frames[a + L]) + poseDist(frames[a + 1], frames[a + L + 1] || frames[a + L]) * 0.5 - L / FPS * 0.02;
      if (c < best.cost) best = { cost: c, a, L };
    }
  }
  return best;
}

function bakeDance(d) {
  const frames = retarget(d.file);
  const loop = !d.raw && !d.shot;
  const lp = d.raw ? { a: 0, L: frames.length - 1, cost: 0 }
    : d.shot ? { a: Math.round(d.shot[0] * FPS), L: Math.min(frames.length - 1, Math.round(d.shot[1] * FPS)) - Math.round(d.shot[0] * FPS), cost: 0 }
    : bestLoop(frames, d);
  const seg = frames.slice(lp.a, lp.a + lp.L + 1);
  const n = seg.length;
  // Wanderung: Hüfte über die Schleife auf den Mittelwert ziehen, lineare Drift entfernen,
  // dann nur `travel` der Restbewegung behalten (Tanzfläche: am Platz)
  const first = seg[0].hip, last = seg[n - 1].hip;
  const speed = Math.hypot(last.x - first.x, last.z - first.z) / ((n - 1) / FPS);
  const mean = new THREE.Vector3();
  seg.forEach((f) => mean.add(f.hip)); mean.divideScalar(n);
  const hips = seg.map((f, i) => {
    const t = i / (n - 1);
    const drift = new THREE.Vector3().lerpVectors(first, last, t);
    const p = f.hip.clone();
    p.x = (p.x - drift.x) * d.travel; p.z = (p.z - drift.z) * d.travel;
    return p;
  });
  // XZ-Mittelwert auf 0
  const mx = hips.reduce((s, p) => s + p.x, 0) / n, mz = hips.reduce((s, p) => s + p.z, 0) / n;
  hips.forEach((p) => { p.x -= mx; p.z -= mz; });
  // Blickrichtung: mittlere Hüft-Gierung auf 0 drehen, damit der Tanz zum Publikum zeigt
  let ys = 0, yc = 0;
  for (const f of seg) {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(f.world.get('DEF-hips').clone().multiply(restWorldQ.get('DEF-hips').clone().invert()));
    const a = Math.atan2(fwd.x, fwd.z); ys += Math.sin(a); yc += Math.cos(a);
  }
  const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(d.faceFix !== false ? Math.atan2(ys, yc) : 0) + (d.yaw || 0));
  for (const f of seg) for (const [k, q] of f.world) f.world.set(k, fix.clone().multiply(q));
  hips.forEach((p) => { const y = p.y; p.y = 0; p.applyQuaternion(fix); p.y = y; });
  // Nahtstelle: letzte 0,3 s in das erste Bild überblenden
  const blendN = loop ? Math.min(Math.round(0.3 * FPS), n - 2) : 0;
  for (let i = 0; i < blendN; i++) {
    const k = n - blendN + i;
    const w = (i + 1) / blendN; const e = w * w * (3 - 2 * w);
    for (const [key, q] of seg[k].world) q.slerp(seg[0].world.get(key), e);
    hips[k].lerp(hips[0], e);
  }
  // Hüfte: Welt → lokal (Elternknochen root, Rig-Transform)
  const parent = tBy['DEF-hips'].parent;
  const inv = parent.matrixWorld.clone().invert();
  const locals = seg.map(toLocal);
  let hipLocal = hips.map((p) => p.clone().applyMatrix4(inv));
  // Boden: tiefster Fuß je Bild; das 10-%-Quantil kommt auf die Ruhehöhe
  const lows = locals.map((loc, i) => {
    for (const b of tBones) b.quaternion.copy(loc.get(b.name));
    tBy['DEF-hips'].position.copy(hipLocal[i]);
    gltf.scene.updateMatrixWorld(true);
    const y = (n2, r) => tBy[n2].getWorldPosition(new THREE.Vector3()).y - r;
    return Math.min(y('DEF-footL', 0.104), y('DEF-footR', 0.104), y('DEF-toeL', 0.015), y('DEF-toeR', 0.015));
  });
  const sorted = lows.slice().sort((a, b) => a - b);
  const off = -sorted[Math.floor(sorted.length * (d.floorQ ?? 0.1))];
  hips.forEach((p) => { p.y += off; });
  hipLocal = hips.map((p) => p.clone().applyMatrix4(inv));
  for (const b of tBones) { b.quaternion.copy(restLocal.get(b.name).q); b.position.copy(restLocal.get(b.name).p); }
  gltf.scene.updateMatrixWorld(true);
  console.log(`${d.name}: ${d.file} ${(lp.a / FPS).toFixed(1)}s +${(lp.L / FPS).toFixed(2)}s cost ${lp.cost.toFixed(2)} floor ${off.toFixed(3)} drift ${speed.toFixed(2)} m/s`);
  return { name: d.name, n, locals, hipLocal };
}

// ── GLB schreiben ──────────────────────────────────────────────────────────
const io = new NodeIO();
const doc = await io.read(SRC_GLB);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodeBy = Object.fromEntries(root.listNodes().map((n) => [THREE.PropertyBinding.sanitizeNodeName(n.getName()), n]));
for (const anim of root.listAnimations()) {
  const keep = Object.entries(KEEP).find(([, v]) => v === anim.getName());
  if (keep) anim.setName(keep[0]); else anim.dispose();
}
for (const d of DANCES) {
  const b = bakeDance(d);
  const anim = doc.createAnimation(b.name);
  const times = new Float32Array(b.n).map((_, i) => i / FPS);
  const tAcc = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  for (const bone of order) {
    const vals = new Float32Array(b.n * 4);
    let varies = false;
    const r0 = restLocal.get(bone.name).q;
    for (let i = 0; i < b.n; i++) {
      const q = b.locals[i].get(bone.name);
      // Vorzeichen stetig halten
      if (i > 0) { const pq = new THREE.Quaternion().fromArray(vals, (i - 1) * 4); if (pq.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); }
      q.toArray(vals, i * 4);
      if (Math.abs(q.dot(r0)) < 0.99999) varies = true;
    }
    if (!varies) continue;
    const s = doc.createAnimationSampler().setInput(tAcc).setOutput(doc.createAccessor().setType('VEC4').setArray(vals).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodeBy[bone.name]).setTargetPath('rotation').setSampler(s));
  }
  const pv = new Float32Array(b.n * 3);
  b.hipLocal.forEach((p, i) => p.toArray(pv, i * 3));
  const s = doc.createAnimationSampler().setInput(tAcc).setOutput(doc.createAccessor().setType('VEC3').setArray(pv).setBuffer(buffer)).setInterpolation('LINEAR');
  anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodeBy['DEF-hips']).setTargetPath('translation').setSampler(s));
}
await io.write(process.argv[2], doc);
console.log('geschrieben', process.argv[2], fs.statSync(process.argv[2]).size);
