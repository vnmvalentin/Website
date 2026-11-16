// ui/table/scene/effects.js — was am Tisch fliegt, spritzt und staubt (Rebuild Phase 2).
//
// Zwei Bausteine:
//   burst(kind, …)  kleine Teilchen: Tusche, Papierfetzen, Asche, Glut, Staub, Wachs, Wasser, Funken. Sie fallen,
//                   bleiben auf dem Tisch liegen und vergehen. Alles in zwei InstancedMeshes (ein Zeichenaufruf je Art
//                   von Material), damit hunderte Teilchen nichts kosten.
//   fly(kind, …)    ein Gegenstand fliegt im Bogen von A nach B: Knochen auf den Haufen, Gewicht in die Waagschale.
import * as THREE from "three";

/**
 * Teilchenarten. speed = seitlich weg, up = nach oben, gravity > 0 fällt / < 0 steigt, drag bremst,
 * lie = bleibt auf dem Tisch liegen (sonst verschwindet es beim Aufkommen), glow = leuchtet selbst.
 */
const KINDS = {
  ink: { color: [0x14100c, 0x241a12, 0x0c0907], size: [0.35, 0.9], speed: [8, 24], up: [5, 15], gravity: 62, life: [0.5, 1.0], drag: 1.4, spin: 6, lie: true },
  paper: { color: [0xd9c9a3, 0xcbb98a, 0xe6d9b8, 0xbfae84], size: [0.8, 2.0], speed: [5, 18], up: [9, 22], gravity: 36, life: [0.8, 1.4], drag: 2.2, spin: 14, lie: true },
  ash: { color: [0x2a2420, 0x4a403a, 0x15110e], size: [0.3, 0.8], speed: [1, 7], up: [5, 15], gravity: -7, life: [0.7, 1.3], drag: 2.4, spin: 6 },
  dust: { color: [0x8a7458, 0x6e5a42, 0xa08a6a], size: [0.4, 1.0], speed: [5, 15], up: [0.5, 4], gravity: 6, life: [0.3, 0.65], drag: 4.5, spin: 3 },
  wax: { color: [0x8e1b1b, 0xb3302a, 0x6e1414], size: [0.3, 0.7], speed: [4, 13], up: [6, 14], gravity: 58, life: [0.6, 1.0], drag: 1.2, spin: 4, lie: true },
  splash: { color: [0x3e7a93, 0x7fb4c8, 0x9ccbdc], size: [0.25, 0.6], speed: [5, 15], up: [10, 22], gravity: 62, life: [0.4, 0.8], drag: 1, spin: 5 },
  ember: { color: [0xff9a3c, 0xffc070, 0xe0541e], size: [0.2, 0.5], speed: [2, 10], up: [8, 20], gravity: -5, life: [0.5, 1.0], drag: 1.8, spin: 8, glow: true },
  spark: { color: [0xffd98a, 0xfff0c0, 0xf2b54a], size: [0.15, 0.36], speed: [10, 26], up: [5, 15], gravity: 44, life: [0.2, 0.45], drag: 2, spin: 10, glow: true },
  gold: { color: [0xc9b24a, 0xf2d27a], size: [0.2, 0.45], speed: [1, 5], up: [8, 16], gravity: -3, life: [0.5, 0.9], drag: 2.2, spin: 6, glow: true },
};
const LIT_MAX = 260;
const GLOW_MAX = 120;
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * @param {THREE.Scene} scene
 * @param {{ bone: THREE.Material, iron: THREE.Material, brass: THREE.Material }} mats  geteilte Materialien (nicht entsorgen)
 */
export function createEffects(scene, mats) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const litMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const make = (mat, max) => {
    const m = new THREE.InstancedMesh(quad, mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  };
  const pools = { lit: { mesh: make(litMat, LIT_MAX), max: LIT_MAX, list: [] }, glow: { mesh: make(glowMat, GLOW_MAX), max: GLOW_MAX, list: [] } };
  pools.glow.mesh.renderOrder = 4;

  const color = new THREE.Color();
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  /**
   * @param {keyof typeof KINDS} kind @param {number} x @param {number} y @param {number} z @param {number} n
   * @param {{ spread?: number, dirX?: number, dirZ?: number, power?: number }} [o]
   *   spread: Streukreis am Ursprung · dirX/dirZ: Vorzugsrichtung (z. B. weg vom Angreifer) · power: Stärke
   */
  function burst(kind, x, y, z, n, o = {}) {
    const K = KINDS[kind];
    if (!K) return;
    const pool = K.glow ? pools.glow : pools.lit;
    const power = o.power ?? 1;
    for (let i = 0; i < n; i++) {
      if (pool.list.length >= pool.max) pool.list.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = rand(K.speed[0], K.speed[1]) * power;
      const r = Math.random() * (o.spread ?? 1.5);
      pool.list.push({
        K,
        x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * sp + (o.dirX || 0) * sp * 0.9,
        vy: rand(K.up[0], K.up[1]) * power,
        vz: Math.sin(a) * sp + (o.dirZ || 0) * sp * 0.9,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sx: rand(-1, 1) * K.spin, sy: rand(-1, 1) * K.spin, sz: rand(-1, 1) * K.spin,
        size: rand(K.size[0], K.size[1]), ratio: rand(0.5, 1.4),
        age: 0, life: rand(K.life[0], K.life[1]), lying: false,
        c: K.color[Math.floor(Math.random() * K.color.length)],
      });
    }
  }

  // ── Fliegende Gegenstände ───────────────────────────────────────────────
  const boneShaft = new THREE.CylinderGeometry(0.26, 0.26, 3.2, 8).rotateZ(Math.PI / 2);
  const boneKnob = new THREE.SphereGeometry(0.44, 10, 8);
  const weightGeo = new THREE.CylinderGeometry(0.8, 1.0, 1.2, 10);
  const weightKnob = new THREE.SphereGeometry(0.35, 8, 6);
  const makeFlyer = (kind) => {
    const g = new THREE.Group();
    if (kind === "bone") {
      g.add(new THREE.Mesh(boneShaft, mats.bone));
      for (const [bx, bz] of [[-1.6, 0.3], [-1.6, -0.3], [1.6, 0.3], [1.6, -0.3]]) {
        const k = new THREE.Mesh(boneKnob, mats.bone);
        k.position.set(bx, 0, bz);
        g.add(k);
      }
    } else {
      g.add(new THREE.Mesh(weightGeo, mats.iron));
      const k = new THREE.Mesh(weightKnob, mats.brass);
      k.position.y = 0.75;
      g.add(k);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return g;
  };
  /** @type {Array<any>} */
  let flyers = [];

  /**
   * @param {"bone" | "weight"} kind @param {THREE.Vector3} from @param {THREE.Vector3} to
   * @param {{ dur?: number, arc?: number, delay?: number, onDone?: () => void }} [o]
   */
  function fly(kind, from, to, o = {}) {
    const obj = makeFlyer(kind);
    obj.visible = false;
    scene.add(obj);
    flyers.push({ obj, kind, from: from.clone(), to: to.clone(), age: -(o.delay || 0), dur: o.dur ?? 0.42, arc: o.arc ?? 9, onDone: o.onDone, spin: kind === "bone" ? rand(8, 14) : 3 });
  }

  /** @param {number} dt */
  function update(dt) {
    for (const key of ["lit", "glow"]) {
      const pool = pools[key];
      let alive = 0;
      const next = [];
      for (const p of pool.list) {
        p.age += dt;
        if (p.age >= p.life) continue;
        const K = p.K;
        if (!p.lying) {
          p.vy -= K.gravity * dt;
          const d = Math.exp(-K.drag * dt);
          p.vx *= d; p.vz *= d;
          if (K.gravity < 0) p.vy *= d;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
          if (p.y < 0.07 && p.vy < 0) {
            if (!K.lie) continue;
            // aufgekommen: bleibt flach liegen
            p.y = 0.07 + Math.random() * 0.03;
            p.lying = true;
            p.rx = -Math.PI / 2;
            p.ry = 0;
          }
        }
        // einblenden gibt es nicht — nur zum Ende hin kleiner werden
        const left = 1 - p.age / p.life;
        const s = p.size * (left < 0.3 ? left / 0.3 : 1);
        euler.set(p.rx, p.ry, p.rz);
        quat.setFromEuler(euler);
        pos.set(p.x, p.y, p.z);
        scl.set(s, s * p.ratio, s);
        mat4.compose(pos, quat, scl);
        pool.mesh.setMatrixAt(alive, mat4);
        pool.mesh.setColorAt(alive, color.setHex(p.c));
        alive++;
        next.push(p);
      }
      pool.list = next;
      pool.mesh.count = alive;
      if (alive) {
        pool.mesh.instanceMatrix.needsUpdate = true;
        if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
      }
    }
    if (flyers.length) {
      flyers = flyers.filter((f) => {
        f.age += dt;
        if (f.age < 0) return true;
        const k = Math.min(1, f.age / f.dur);
        f.obj.visible = true;
        f.obj.position.lerpVectors(f.from, f.to, k);
        f.obj.position.y += Math.sin(Math.PI * k) * f.arc;
        f.obj.rotation.x += f.spin * dt;
        f.obj.rotation.z += f.spin * 0.6 * dt;
        if (k < 1) return true;
        scene.remove(f.obj);
        f.onDone?.();
        return false;
      });
    }
  }

  return {
    burst,
    fly,
    update,
    get busy() { return pools.lit.list.length + pools.glow.list.length + flyers.length > 0; },
    dispose() {
      for (const f of flyers) scene.remove(f.obj);
      flyers = [];
      for (const key of ["lit", "glow"]) { scene.remove(pools[key].mesh); pools[key].mesh.dispose(); }
      quad.dispose(); litMat.dispose(); glowMat.dispose();
      boneShaft.dispose(); boneKnob.dispose(); weightGeo.dispose(); weightKnob.dispose();
    },
  };
}
