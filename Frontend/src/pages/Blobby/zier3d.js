// zier3d.js — Accessoires (zier.js) als 3D-Teile für die 3D-Ansicht (render3d.js) und Ego 3D (beach/renderBeach.js).
// Gebaut im Blob-Raum beider Ansichten: +x schaut nach vorn (zum Ball), y nach oben, die obere Kugel sitzt bei
// BLOBBY_UPPER_SPHERE mit Radius BLOBBY_UPPER_RADIUS. Die Gruppe kommt einfach in die Blob-Gruppe.
import * as THREE from "three";
import { BLOBBY_UPPER_RADIUS as R, BLOBBY_UPPER_SPHERE as Y } from "./physics.js";

/** @returns {THREE.Group|null} null = ohne Accessoire. Geometrien und Materialien gibt dispose() wieder frei. */
export function baueZier(zier) {
  if (zier !== 1 && zier !== 2) return null;
  const g = new THREE.Group();
  if (zier === 1) {
    // Sonnenbrille: je ein dunkles, flaches Glas vor jedem Auge (Augen: Radius 7,5 bei x = 0.72·R, z = ±10) und ein
    // Steg dazwischen. Die Gläser umschließen den vorderen Teil der Augen, damit nichts Weißes durchscheint.
    const glasMat = new THREE.MeshStandardMaterial({ color: "#1b1f2a", roughness: 0.15, metalness: 0.4 });
    const glasGeo = new THREE.SphereGeometry(9.5, 18, 14);
    for (const side of [-1, 1]) {
      const glas = new THREE.Mesh(glasGeo, glasMat);
      glas.scale.set(0.5, 0.86, 1);
      glas.position.set(R * 0.72 + 4.5, Y + 3, side * 10.5);
      glas.rotation.y = -side * 0.25; // folgt der Rundung des Kopfes
      g.add(glas);
    }
    const steg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: "#2b2f3a", roughness: 0.5 }));
    steg.position.set(R * 0.72 + 7.5, Y + 5.5, 0);
    g.add(steg);
  } else {
    // Strohhut: breite Krempe, runder Kopf, rotes Band
    const stroh = new THREE.MeshStandardMaterial({ color: "#e8c873", roughness: 0.85 });
    const krempe = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.25, R * 1.25, 1.6, 32), stroh);
    krempe.position.y = Y + R * 0.66;
    const kopf = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.56, R * 0.64, R * 0.44, 28), stroh);
    kopf.position.y = Y + R * 0.66 + R * 0.22;
    const deckel = new THREE.Mesh(new THREE.SphereGeometry(R * 0.56, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), stroh);
    deckel.scale.y = 0.3;
    deckel.position.y = Y + R * 0.66 + R * 0.44;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.645, R * 0.655, R * 0.14, 28),
      new THREE.MeshStandardMaterial({ color: "#d8343f", roughness: 0.6 }),
    );
    band.position.y = Y + R * 0.66 + R * 0.08;
    g.add(krempe, kopf, deckel, band);
    g.rotation.z = -0.06; // leicht nach hinten gekippt
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Teile eines Accessoires freigeben */
export function entsorgeZier(g) {
  g?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    o.material.dispose();
  });
}

/** In einer Blob-Ansicht: Accessoire wechseln, wenn es sich geändert hat. b = { group, zier, zierTeil } */
export function setzeZier(b, zier) {
  if (b.zier === zier) return;
  b.zier = zier;
  if (b.zierTeil) {
    b.group.remove(b.zierTeil);
    entsorgeZier(b.zierTeil);
    b.zierTeil = null;
  }
  const teil = baueZier(zier);
  if (teil) {
    b.group.add(teil);
    b.zierTeil = teil;
  }
}
