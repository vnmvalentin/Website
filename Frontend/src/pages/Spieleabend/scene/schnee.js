// scene/schnee.js — Schneebälle: im Bogen von der Hand zum Ziel (ein Blob oder eine Stelle im Zimmer), dort zerplatzen
// sie in Flocken und hinterlassen einen Fleck, der langsam wegschmilzt (auf dem Boden oder an der Wand). Wer getroffen
// wird, trägt kurz eine Schneehaube (zimmerSzene.js).
import * as THREE from "three";

export const BALL_GEO = new THREE.SphereGeometry(0.13, 14, 10);
const KRUEMEL_GEO = new THREE.SphereGeometry(0.045, 6, 5);
const FLECK_GEO = new THREE.CircleGeometry(0.32, 18);

/**
 * @param {{ scene: THREE.Scene, low?: boolean, boden: number, raum: number }} opts  boden: Höhe des Bodens, raum: halbe Zimmergröße
 */
export function createSchnee({ scene, low = false, boden, raum }) {
  // etwas Eigenhelligkeit: Schnee bleibt auch im Gegenlicht weiß statt grau
  const ballMat = new THREE.MeshStandardMaterial({ color: "#f4f8ff", roughness: 0.9, emissive: "#4a5262", emissiveIntensity: 0.6 });
  const fleckMat = new THREE.MeshStandardMaterial({ color: "#eef4ff", roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const fluege = []; // { mesh, von, nach: () => Vector3, t, dauer, bogen, fertig }
  const kruemel = []; // { mesh, v, t }
  const flecken = []; // { mesh, mat, t }
  const tmp = new THREE.Vector3();

  /** Ein Ball im Bogen von `von` nach `nach` (Punkt oder Funktion, die den aktuellen Zielpunkt liefert). */
  function werfe(von, nach, fertig) {
    const zielJetzt = () => (typeof nach === "function" ? nach() : nach);
    const dist = von.distanceTo(zielJetzt());
    const mesh = new THREE.Mesh(BALL_GEO, ballMat);
    mesh.castShadow = !low;
    mesh.position.copy(von);
    scene.add(mesh);
    fluege.push({ mesh, von: von.clone(), nach: zielJetzt, t: 0, dauer: Math.max(0.22, Math.min(0.85, dist / 13)), bogen: Math.min(1.4, dist * 0.09), fertig });
  }

  /** Ball zerplatzt bei p; aufWand: Fleck an Boden oder Wand legen (bei Treffern auf Blobs nur Flocken). */
  function platzen(p, aufWand) {
    const anz = low ? 6 : 12;
    for (let i = 0; i < anz; i += 1) {
      const m = new THREE.Mesh(KRUEMEL_GEO, ballMat);
      m.position.copy(p);
      scene.add(m);
      kruemel.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), t: 0 });
    }
    if (!aufWand) return;
    // Lage des Flecks: Boden, sonst die nächste Wand
    const mat = fleckMat.clone();
    const f = new THREE.Mesh(FLECK_GEO, mat);
    const nahWand = raum - 0.3;
    if (p.y < boden + 0.25) {
      f.rotation.x = -Math.PI / 2;
      f.position.set(p.x, boden + 0.02, p.z);
    } else if (Math.abs(p.x) > nahWand && Math.abs(p.x) >= Math.abs(p.z)) {
      f.rotation.y = p.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      f.position.set(Math.sign(p.x) * (raum - 0.03), p.y, p.z);
    } else if (Math.abs(p.z) > nahWand) {
      f.rotation.y = p.z > 0 ? Math.PI : 0;
      f.position.set(p.x, p.y, Math.sign(p.z) * (raum - 0.03));
    } else {
      // mitten im Zimmer (Möbel): nur Flocken
      mat.dispose();
      return;
    }
    f.scale.setScalar(0.6 + Math.random() * 0.6);
    f.rotation.z = Math.random() * Math.PI;
    scene.add(f);
    flecken.push({ mesh: f, mat, t: 0 });
    while (flecken.length > 24) {
      const alt = flecken.shift();
      scene.remove(alt.mesh);
      alt.mat.dispose();
    }
  }

  function update(dt) {
    for (let i = fluege.length - 1; i >= 0; i -= 1) {
      const f = fluege[i];
      f.t += dt;
      const q = Math.min(1, f.t / f.dauer);
      const ziel = f.nach();
      f.mesh.position.lerpVectors(f.von, ziel, q);
      f.mesh.position.y += Math.sin(q * Math.PI) * f.bogen;
      f.mesh.rotation.x += dt * 12;
      if (q >= 1) {
        scene.remove(f.mesh);
        fluege.splice(i, 1);
        f.fertig?.(tmp.copy(ziel));
      }
    }
    for (let i = kruemel.length - 1; i >= 0; i -= 1) {
      const k = kruemel[i];
      k.t += dt;
      k.v.y -= 9 * dt;
      k.mesh.position.addScaledVector(k.v, dt);
      if (k.mesh.position.y < boden + 0.03) {
        k.mesh.position.y = boden + 0.03;
        k.v.set(0, 0, 0);
      }
      k.mesh.scale.setScalar(Math.max(0.01, 1 - Math.max(0, k.t - 0.8) * 1.5));
      if (k.t > 1.5) {
        scene.remove(k.mesh);
        kruemel.splice(i, 1);
      }
    }
    for (let i = flecken.length - 1; i >= 0; i -= 1) {
      const f = flecken[i];
      f.t += dt;
      f.mat.opacity = Math.max(0, Math.min(0.92, (9 - f.t) / 3));
      if (f.t > 9) {
        scene.remove(f.mesh);
        f.mat.dispose();
        flecken.splice(i, 1);
      }
    }
  }

  function dispose() {
    for (const f of fluege) scene.remove(f.mesh);
    for (const k of kruemel) scene.remove(k.mesh);
    for (const f of flecken) {
      scene.remove(f.mesh);
      f.mat.dispose();
    }
    ballMat.dispose();
    fleckMat.dispose();
  }

  return { werfe, platzen, update, dispose, ballMat };
}
