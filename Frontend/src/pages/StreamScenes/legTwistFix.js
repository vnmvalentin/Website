// legTwistFix.js — Beine der Comic-Figuren gegen „Ausdünnen“ schützen.
//
// Die Tänze sind Motion Capture vom Mannequin (dancer.glb), übertragen auf das Skelett der
// Comic-Figuren. Dabei kommen Drehungen um die Längsachse der Beine mit, die das Mannequin
// (starre Teile) nicht stören, die Comic-Figuren (eine durchgehende Haut) aber zu Nadeln
// verdrehen: Oberschenkel bis 106°, Fuß gegen Schienbein bis 180° (Salsa, Russian, Salto).
// Dazu fehlt in clips.glb die Lage des linken Fußes ganz (steht in jedem Clip auf der Ruhelage) und
// die des rechten ist ungenau — die Haut spannte sich dann vom Knie zu einem festen Punkt am Boden.
//
// Hier werden die Bein-Spuren jedes Clips einmal beim Laden neu abgetastet (30 Bilder/s):
//   • Oberschenkel: Längsdrehung gegenüber der Ruhelage höchstens THIGH_TWIST
//   • Schienbein: ist ein Scharnier — Längsdrehung höchstens SHIN_TWIST
//   • Fuß: Längsdrehung gegenüber dem Schienbein höchstens FOOT_TWIST, und der Fuß sitzt
//     wieder am Knöchel (er hängt im Skelett nicht am Bein, sondern an der Wurzel)
//   • Hüfthöhe: so, dass der tiefere Fuß auf dem Boden steht (die Höhe fehlt in den meisten
//     Clips; Salsa schwebte im Mittel 15 cm, Gehen steckte 2 cm im Boden)
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const FPS = 30;
const THIGH_TWIST = THREE.MathUtils.degToRad(35);
const SHIN_TWIST = THREE.MathUtils.degToRad(8);
const FOOT_TWIST = THREE.MathUtils.degToRad(25);
/** Sitzen: Hüfte gehört auf die Sitzfläche — nicht auf den Boden stellen. */
const SEATED = new Set(['sit', 'sitTalk', 'sitEnter', 'sitExit']);
/** Clips mit echten Sprüngen: nur anheben, wenn ein Fuß im Boden steckt, nie absenken. */
const AIRBORNE = new Set(['hop', 'jacks', 'jumpStart', 'jumpLand', 'sideflip', 'jog']);

const _q = new THREE.Quaternion();
const _t = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Längsdrehung von q um die (normierte) Achse auf ±max begrenzen. q wird überschrieben. */
export function clampTwist(q, axis, max) {
  _v.set(q.x, q.y, q.z);
  const d = _v.dot(axis);
  _t.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  const len = Math.hypot(_t.x, _t.y, _t.z, _t.w);
  if (len < 1e-8) return q;              // reine Schwenkung um 180° — keine Längsdrehung
  _t.x /= len; _t.y /= len; _t.z /= len; _t.w /= len;
  if (_t.w < 0) { _t.x = -_t.x; _t.y = -_t.y; _t.z = -_t.z; _t.w = -_t.w; }
  const angle = 2 * Math.acos(Math.min(1, _t.w));
  if (angle <= max) return q;
  // q = swing · twist  →  swing = q · twist⁻¹, neue Längsdrehung mit begrenztem Winkel
  const swing = _q.copy(q).multiply(_t.clone().invert());
  const sign = Math.sign(_t.x * axis.x + _t.y * axis.y + _t.z * axis.z) || 1;
  _t.setFromAxisAngle(axis, sign * max);
  return q.copy(swing).multiply(_t);
}

/**
 * Bein-Spuren aller Clips ersetzen. Gibt eine neue Map zurück (Originale bleiben unberührt).
 * @param {THREE.Object3D} restScene  Szene aus clips.glb (Skelett in Ruhelage)
 * @param {Map<string, THREE.AnimationClip>} clips
 */
export function fixLegTwist(restScene, clips) {
  const rig = SkeletonUtils.clone(restScene);
  const bone = {};
  rig.traverse((o) => { if (o.isBone) bone[o.name] = o; });
  const need = ['Body', 'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR'];
  if (!need.every((n) => bone[n])) return clips;

  rig.updateMatrixWorld(true);
  const rest = {};
  for (const n of Object.keys(bone)) rest[n] = { q: bone[n].quaternion.clone(), p: bone[n].position.clone() };
  const side = {};
  for (const s of ['L', 'R']) {
    const thigh = bone[`UpperLeg${s}`], shin = bone[`LowerLeg${s}`], foot = bone[`Foot${s}`];
    const shinW = shin.getWorldPosition(new THREE.Vector3());
    const footW = foot.getWorldPosition(new THREE.Vector3());
    side[s] = {
      thigh, shin, foot,
      thighAxis: shin.position.clone().normalize(),                    // Oberschenkel → Knie (lokal)
      shinAxis: shin.worldToLocal(footW.clone()).normalize(),          // Knie → Knöchel (lokal im Schienbein)
      ankle: shin.worldToLocal(footW.clone()),                         // Knöchel im Schienbein
      shinRestW: shin.getWorldQuaternion(new THREE.Quaternion()),
      footRestW: foot.getWorldQuaternion(new THREE.Quaternion()),
      shinAxisW: footW.clone().sub(shinW).normalize(),                 // Schienbein-Achse in Ruhe (Welt)
    };
  }

  const hip = bone.Body;
  const groundY = Math.min(side.L.foot.getWorldPosition(new THREE.Vector3()).y, side.R.foot.getWorldPosition(new THREE.Vector3()).y);
  const hipW = new THREE.Vector3();

  const mixer = new THREE.AnimationMixer(rig);
  const out = new Map();
  const shinW = new THREE.Quaternion();
  const footW = new THREE.Quaternion();
  const dShin = new THREE.Quaternion();
  const dFoot = new THREE.Quaternion();
  const parentW = new THREE.Quaternion();
  const ankleW = new THREE.Vector3();
  const local = new THREE.Quaternion();

  for (const [name, clip] of clips) {
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(n);
    const vals = {};
    for (const s of ['L', 'R']) {
      vals[`UpperLeg${s}`] = new Float32Array(n * 4);
      vals[`LowerLeg${s}`] = new Float32Array(n * 4);
      vals[`Foot${s}`] = new Float32Array(n * 4);
      vals[`Foot${s}.p`] = new Float32Array(n * 3);
    }
    vals['Body.p'] = new Float32Array(n * 3);
    const seated = SEATED.has(name);
    const airborne = AIRBORNE.has(name);
    mixer.stopAllAction();
    for (const b of Object.values(bone)) { b.quaternion.copy(rest[b.name].q); b.position.copy(rest[b.name].p); }
    const action = mixer.clipAction(clip);
    action.play();

    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / FPS);
      times[i] = t;
      mixer.setTime(t);
      for (const s of ['L', 'R']) {
        const L = side[s];
        // Oberschenkel + Schienbein: Längsdrehung gegenüber der Ruhelage begrenzen (lokal)
        local.copy(rest[L.thigh.name].q).invert().multiply(L.thigh.quaternion);
        clampTwist(local, L.thighAxis, THIGH_TWIST);
        L.thigh.quaternion.copy(rest[L.thigh.name].q).multiply(local);
        local.copy(rest[L.shin.name].q).invert().multiply(L.shin.quaternion);
        clampTwist(local, L.shinAxis, SHIN_TWIST);
        L.shin.quaternion.copy(rest[L.shin.name].q).multiply(local);
        L.thigh.quaternion.toArray(vals[`UpperLeg${s}`], i * 4);
        L.shin.quaternion.toArray(vals[`LowerLeg${s}`], i * 4);
      }
      rig.updateMatrixWorld(true);
      // Hüfte so verschieben, dass der tiefere Knöchel auf Bodenhöhe steht
      if (!seated) {
        let low = Infinity;
        for (const s of ['L', 'R']) low = Math.min(low, side[s].shin.localToWorld(ankleW.copy(side[s].ankle)).y);
        let dy = groundY - low;
        if (airborne) dy = Math.max(0, dy);
        if (dy) {
          hip.getWorldPosition(hipW);
          hipW.y += dy;
          hip.position.copy(hip.parent.worldToLocal(hipW));
          rig.updateMatrixWorld(true);
        }
      }
      hip.position.toArray(vals['Body.p'], i * 3);
      for (const s of ['L', 'R']) {
        const L = side[s];
        // Fuß: Drehung gegenüber dem Schienbein (beide relativ zur Ruhe, in Ruhe-Weltlage)
        L.shin.getWorldQuaternion(shinW);
        L.foot.getWorldQuaternion(footW);
        dShin.copy(shinW).multiply(_q.copy(L.shinRestW).invert());
        dFoot.copy(footW).multiply(_q.copy(L.footRestW).invert());
        local.copy(dShin).invert().multiply(dFoot);
        clampTwist(local, L.shinAxisW, FOOT_TWIST);
        footW.copy(dShin).multiply(local).multiply(L.footRestW);
        L.foot.parent.getWorldQuaternion(parentW);
        L.foot.quaternion.copy(parentW.invert().multiply(footW));
        // Fuß wieder an den Knöchel setzen
        L.shin.localToWorld(ankleW.copy(L.ankle));
        L.foot.position.copy(L.foot.parent.worldToLocal(ankleW));
        L.foot.quaternion.toArray(vals[`Foot${s}`], i * 4);
        L.foot.position.toArray(vals[`Foot${s}.p`], i * 3);
      }
      // Vorzeichen stetig halten (sonst dreht die Interpolation den langen Weg)
      if (i > 0) {
        for (const key of Object.keys(vals)) {
          if (key.endsWith('.p')) continue;
          const a = vals[key];
          const o = i * 4, p = o - 4;
          if (a[o] * a[p] + a[o + 1] * a[p + 1] + a[o + 2] * a[p + 2] + a[o + 3] * a[p + 3] < 0) {
            a[o] = -a[o]; a[o + 1] = -a[o + 1]; a[o + 2] = -a[o + 2]; a[o + 3] = -a[o + 3];
          }
        }
      }
    }
    mixer.uncacheAction(clip);

    const replaced = new Set(['Body.position']);
    const tracks = [new THREE.VectorKeyframeTrack('Body.position', times, vals['Body.p'])];
    for (const s of ['L', 'R']) {
      for (const b of [`UpperLeg${s}`, `LowerLeg${s}`, `Foot${s}`]) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, vals[b]));
        replaced.add(`${b}.quaternion`);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`Foot${s}.position`, times, vals[`Foot${s}.p`]));
      replaced.add(`Foot${s}.position`);
    }
    for (const tr of clip.tracks) if (!replaced.has(tr.name)) tracks.push(tr);
    out.set(name, new THREE.AnimationClip(name, clip.duration, tracks));
  }
  mixer.stopAllAction();
  return out;
}
