// viewmodel.js — die Taschenlampe in der Hand (Ego-Perspektive).
//
// Modell: Poly-Haven-Scan „small_plastic_torch“ (CC0, public/media/cr3d/models) — abgegriffene gelbe Stablampe. Die Längsachse und das
// Lampenende (dickeres Ende) werden nach dem Laden aus der Geometrie bestimmt, damit die Lampe sicher nach
// vorn zeigt. Bis das Modell da ist (oder wenn es fehlt), hält man eine schlichte Lampe aus Zylindern.
//
// Trick wie in Ego-Shootern: Die Lampe ist verkleinert und entsprechend näher an der Kamera (MINI). Sie sieht
// genauso groß aus, steckt aber nie in einer Wand — ihre Spitze liegt näher als der Körperradius des Spielers.
//
// Bewegung: hängt dem Mausblick etwas hinterher (Feder), wippt mit den Schritten, senkt sich beim Rennen,
// zuckt beim Ein-/Ausschalten (Daumen auf dem Schalter) und zittert, wenn man sich erschreckt.
// Beleuchtet wird sie nur vom Lichthof (spill) der eigenen Lampe — ohne Licht verschwindet sie im Dunkeln.
import * as THREE from 'three';

const LENGTH = 0.22; // echte Länge der Lampe in Metern
const MINI = 0.36; // Verkleinerung samt Abstand zur Kamera
const REST = new THREE.Vector3(0.2, -0.19, -0.4); // Ruheposition in Kameraraum (vor dem Verkleinern)
/** Das Gelb des Fotos abdunkeln — im eigenen Lichthof leuchtete es sonst wie ein Spielzeug */
const TINT = 0.62;

/**
 * @param {{ assets: any, camera: THREE.Camera, keep: (x:any)=>any }} p
 */
export function createFlashlight({ assets, camera, keep }) {
  const root = new THREE.Group(); // an der Kamera, trägt Wippen/Nachziehen
  const holder = new THREE.Group(); // trägt die Modellausrichtung (Lampe zeigt nach -z)
  root.add(holder);
  root.scale.setScalar(MINI);
  camera.add(root);

  // Ersatzlampe aus Zylindern, bis das Modell geladen ist
  const fallback = new THREE.Group();
  {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.8 }));
    const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.018, 0.018, 0.19, 16)), metal);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.03;
    const head = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.021, 0.07, 20)), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.1;
    fallback.add(body, head);
  }
  holder.add(fallback);

  const model = assets.model('small_plastic_torch', 1, {
    castShadow: false, receiveShadow: false, tweak: (mat) => { mat.color.multiplyScalar(TINT); mat.envMapIntensity = 0.4; },
  });
  const fit = () => {
    // Längste Achse = Lampenachse. Den Kopf verrät das Glas der Linse (eigenes Material „…glass“);
    // ohne Glas gilt das dickere Ende als Kopf. (Radien allein täuschen: Reflektor und Glas liegen nah an
    // der Achse, die Handschlaufe steht am anderen Ende weit ab.)
    model.updateMatrixWorld(true);
    const pts = [];
    const glass = [];
    model.traverse((m) => {
      if (!m.isMesh) return;
      const isGlass = [].concat(m.material).some((mat) => /glass|lens/i.test(mat.name || ''));
      const pos = m.geometry.attributes.position;
      const v = new THREE.Vector3();
      const step = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += step) {
        const p = v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone();
        pts.push(p);
        if (isGlass) glass.push(p);
      }
    });
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const len = size[axis];
    let headSign;
    if (glass.length) {
      const g = glass.reduce((a, p) => a + p[axis], 0) / glass.length;
      headSign = g >= center[axis] ? 1 : -1;
    } else {
      const others = ['x', 'y', 'z'].filter((a) => a !== axis);
      const radiusAt = (sign) => pts.reduce((r, p) => ((p[axis] - center[axis]) / (len / 2) * sign < 0.7 ? r
        : Math.max(r, Math.hypot(p[others[0]] - center[others[0]], p[others[1]] - center[others[1]]))), 0);
      headSign = radiusAt(1) >= radiusAt(-1) ? 1 : -1;
    }
    // Modell so drehen, dass der Kopf nach -z zeigt
    const from = new THREE.Vector3();
    from[axis] = headSign;
    const q = new THREE.Quaternion().setFromUnitVectors(from, new THREE.Vector3(0, 0, -1));
    const k = LENGTH / len;
    model.position.copy(center).multiplyScalar(-1);
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.quaternion.copy(q);
    pivot.scale.setScalar(k);
    holder.add(pivot);
    holder.remove(fallback);
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; }); // klebt an der Kamera
  };
  if (model.userData.loaded) fit(); else model.addEventListener('loaded', fit);

  // ── Bewegung ──────────────────────────────────────────────────────────
  const sway = { x: 0, y: 0, vx: 0, vy: 0 };
  let lastYaw = null;
  let lastPitch = 0;
  let press = 0; // 0..1, Daumen auf dem Schalter
  let lower = 0; // 0..1, beim Rennen gesenkt
  let hide = 0; // 0..1, beim Verstecken / im Auto weggenommen

  return {
    root,
    /** Spitze der Lampe (Lichtaustritt) im Kameraraum — dort sitzt der Lichtkegel. */
    tipOffset: new THREE.Vector3(REST.x * MINI, REST.y * MINI, (REST.z - LENGTH / 2) * MINI),
    /** Schalter gedrückt (Ein/Aus) */
    click() { press = 1; },
    /**
     * @param {number} dt
     * @param {{ yaw:number, pitch:number, bob:number, moving:boolean, sprint:boolean, sneak:boolean,
     *           hidden:boolean, away:boolean, shake:number }} s
     * @returns {{ x:number, y:number }} Auslenkung (für den Lichtkegel, damit er mitschwingt)
     */
    update(dt, s) {
      if (lastYaw === null) { lastYaw = s.yaw; lastPitch = s.pitch; }
      let dy = s.yaw - lastYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = s.pitch - lastPitch;
      lastYaw = s.yaw;
      lastPitch = s.pitch;
      // Nachziehen: Mausbewegung stößt die Lampe entgegen, eine gedämpfte Feder holt sie zurück
      const f = 1 / Math.max(dt, 1e-3);
      sway.vx += THREE.MathUtils.clamp(dy * f * 0.0035, -0.08, 0.08);
      sway.vy += THREE.MathUtils.clamp(-dp * f * 0.0035, -0.08, 0.08);
      const k = 90;
      const c = 15;
      sway.vx += (-k * sway.x - c * sway.vx) * dt;
      sway.vy += (-k * sway.y - c * sway.vy) * dt;
      sway.x = THREE.MathUtils.clamp(sway.x + sway.vx * dt, -0.12, 0.12);
      sway.y = THREE.MathUtils.clamp(sway.y + sway.vy * dt, -0.12, 0.12);

      press = Math.max(0, press - dt * 7);
      lower += ((s.sprint ? 1 : 0) - lower) * Math.min(1, dt * 6);
      hide += ((s.away ? 1 : s.hidden ? 0.55 : 0) - hide) * Math.min(1, dt * 5);

      const amp = s.moving ? (s.sprint ? 1.6 : s.sneak ? 0.55 : 1) : 0.18;
      const bx = Math.cos(s.bob * 0.5) * 0.012 * amp;
      const by = -Math.abs(Math.sin(s.bob * 0.5)) * 0.014 * amp;
      const jitter = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.02 : 0;
      root.position.set(
        (REST.x + bx - sway.x * 0.25 + jitter) * MINI,
        (REST.y + by - lower * 0.06 - press * 0.012 - hide * 0.25 - sway.y * 0.2 + jitter) * MINI,
        (REST.z + lower * 0.04 + press * 0.015) * MINI,
      );
      root.rotation.set(
        -lower * 0.35 + press * 0.12 + sway.y * 1.1 + by * 2,
        sway.x * 1.4 + 0.06,
        -sway.x * 0.8 - lower * 0.25 + bx * 3,
      );
      root.visible = hide < 0.97;
      return { x: sway.x, y: sway.y };
    },
  };
}
