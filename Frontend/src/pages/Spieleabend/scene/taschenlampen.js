// scene/taschenlampen.js — im Dunkeln (Licht aus) hat jeder Blob eine Taschenlampe.
//
// Die eigene hängt an der Kamera (leuchtet dahin, wohin man schaut, und wirft Schatten), die der anderen sitzen in
// ihrer linken Hand und leuchten in ihre Blickrichtung (Drehung r, Neigung n aus sa:ort). Für die anderen gibt es nur
// eine feste Zahl Lichter (die nächsten zur Kamera bekommen eins): ändert sich die Zahl der Lichter, muss three.js
// alle Materialien neu übersetzen — das passiert so nur beim Umlegen des Schalters.
import * as THREE from "three";

const LAMPE_GEO = new THREE.CylinderGeometry(0.06, 0.05, 0.26, 12).rotateX(Math.PI / 2);
const LINSE_GEO = new THREE.CircleGeometry(0.055, 14);
const KEGEL_GEO = new THREE.ConeGeometry(1.25, 5.5, 24, 1, true).translate(0, -2.75, 0).rotateX(-Math.PI / 2);
export const LAMPEN_GEOS = [LAMPE_GEO, LINSE_GEO];

/**
 * @param {{ scene: THREE.Scene, camera: THREE.Camera, low?: boolean }} opts
 */
export function createTaschenlampen({ scene, camera, low = false }) {
  const gehaeuseMat = new THREE.MeshStandardMaterial({ color: "#2c2a2e", metalness: 0.6, roughness: 0.4 });
  const linseMat = new THREE.MeshBasicMaterial({ color: "#fff3d6" });
  const kegelMat = new THREE.MeshBasicMaterial({ color: "#fff1d0", transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

  // eigene Lampe an der Kamera
  const eigene = new THREE.SpotLight("#fff2d8", 0, 18, 0.46, 0.5, 1.3);
  eigene.position.set(0.18, -0.16, 0);
  eigene.target.position.set(0.05, -0.1, -4);
  if (!low) {
    eigene.castShadow = true;
    eigene.shadow.mapSize.set(512, 512);
    eigene.shadow.bias = -0.002;
    eigene.shadow.camera.near = 0.3;
    eigene.shadow.camera.far = 18;
  }
  eigene.visible = false;
  camera.add(eigene, eigene.target);

  // Lampen der anderen
  const ANZ = low ? 2 : 5;
  const fremde = [];
  for (let i = 0; i < ANZ; i += 1) {
    const l = new THREE.SpotLight("#fff2d8", 0, 14, 0.42, 0.5, 1.3);
    l.visible = false;
    scene.add(l, l.target);
    const kegel = new THREE.Mesh(KEGEL_GEO, kegelMat);
    kegel.visible = false;
    scene.add(kegel);
    fremde.push({ l, kegel });
  }
  let an = false;

  /** Licht aus → Lampen an (und umgekehrt). */
  function setAktiv(v) {
    if (v === an) return;
    an = v;
    eigene.visible = v;
    for (const f of fremde) {
      f.l.visible = v;
      f.kegel.visible = false;
    }
  }

  /** Lampen-Modell für eine Hand (sichtbar nur im Dunkeln). */
  function modell() {
    const g = new THREE.Group();
    const geh = new THREE.Mesh(LAMPE_GEO, gehaeuseMat);
    const linse = new THREE.Mesh(LINSE_GEO, linseMat);
    linse.position.z = 0.131;
    g.add(geh, linse);
    g.visible = false;
    return g;
  }

  const ziel = new THREE.Vector3();
  /**
   * Jedes Bild: staerke 0 … 1 (wie dunkel es ist), eigeneAn (eigene Lampe leuchtet), andere: [{ pos, dir }] nach Nähe
   * sortiert (pos = Lampe in der Hand, dir = Blickrichtung).
   */
  function update(staerke, eigeneAn, andere) {
    if (!an) return;
    eigene.intensity = eigeneAn ? 34 * staerke : 0;
    fremde.forEach((f, i) => {
      const a = andere[i];
      if (!a) {
        f.l.intensity = 0;
        f.kegel.visible = false;
        return;
      }
      f.l.intensity = 22 * staerke;
      f.l.position.copy(a.pos);
      f.l.target.position.copy(ziel.copy(a.pos).addScaledVector(a.dir, 4));
      f.l.target.updateMatrixWorld();
      f.kegel.visible = staerke > 0.5;
      f.kegel.position.copy(a.pos);
      f.kegel.lookAt(ziel);
    });
  }

  function dispose() {
    camera.remove(eigene, eigene.target);
    eigene.dispose();
    for (const f of fremde) {
      scene.remove(f.l, f.l.target, f.kegel);
      f.l.dispose();
    }
    [gehaeuseMat, linseMat, kegelMat].forEach((m) => m.dispose());
  }

  return { setAktiv, modell, update, dispose, get aktiv() { return an; } };
}
