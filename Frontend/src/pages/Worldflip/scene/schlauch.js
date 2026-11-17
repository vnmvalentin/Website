// scene/schlauch.js — ein langes, dünnes, biegsames Teil aus EINEM Stück: Katzenschwanz, Krakenarm.
//
// Vorher bestanden solche Teile aus einer Kette von Kugeln — das sah aus wie eine Perlenkette und kostete je Kugel
// einen eigenen Zeichenaufruf. Der Schlauch ist ein einziges Netz: Ringe entlang einer Mittellinie, zur Spitze hin
// dünner, das Ende rund geschlossen. Die Mittellinie darf sich jedes Bild ändern (setze), die Ringe folgen ihr ohne
// Verdrehen (Rahmen wird von Ring zu Ring mitgeführt statt je Ring neu berechnet).
//
// Wird auch vom Spieleabend benutzt (scene/katze.js).
import * as THREE from 'three';

/**
 * @param {object} o
 * @param {number} o.punkte            Zahl der Stützpunkte der Mittellinie (so viele erwartet setze)
 * @param {(k: number) => number} o.radius  Radius an der Stelle k (0 = Ansatz … 1 = Spitze)
 * @param {number} [o.rund]            Unterteilung im Umfang
 * @param {THREE.Material} o.material  bei farbe: mit vertexColors
 * @param {(k: number) => THREE.ColorRepresentation} [o.farbe]  Farbe an der Stelle k (z. B. dunkle Spitze)
 * @returns {{ mesh: THREE.Mesh, setze: (p: THREE.Vector3[]) => void, dispose: () => void }}
 */
export function createSchlauch({ punkte, radius, rund = 8, material, farbe = null }) {
  // zwei zusätzliche Ringe schließen die Spitze rund ab (halbkugelförmig)
  const KAPPE = [[0.55, 0.84], [0.9, 0.44]]; // [Vorschub in Radien, Anteil des Radius]
  const ringe = punkte + KAPPE.length;
  const anzahl = ringe * rund + 1; // + Spitzenpunkt
  const pos = new Float32Array(anzahl * 3);
  const nor = new Float32Array(anzahl * 3);
  const index = [];
  for (let i = 0; i < ringe - 1; i += 1) {
    for (let j = 0; j < rund; j += 1) {
      const a = i * rund + j;
      const b = i * rund + ((j + 1) % rund);
      const c = a + rund;
      const d = b + rund;
      index.push(a, b, c, b, d, c); // Außenseite: Umlauf gegen den Uhrzeigersinn von außen gesehen
    }
  }
  const spitze = ringe * rund;
  for (let j = 0; j < rund; j += 1) index.push((ringe - 1) * rund + j, (ringe - 1) * rund + ((j + 1) % rund), spitze);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(index);
  if (farbe) {
    const col = new Float32Array(anzahl * 3);
    const c = new THREE.Color();
    for (let i = 0; i <= ringe; i += 1) {
      c.set(farbe(Math.min(1, i / (punkte - 1))));
      const n = i === ringe ? 1 : rund;
      for (let j = 0; j < n; j += 1) col.set([c.r, c.g, c.b], (i * rund + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; // die Form ändert sich laufend, die Hülle würde nicht mitwachsen

  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const m = new THREE.Vector3();
  const hilf = new THREE.Vector3();

  function ring(i, mx, my, mz, r) {
    for (let j = 0; j < rund; j += 1) {
      const w = (j / rund) * Math.PI * 2;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const nx = n.x * cw + b.x * sw;
      const ny = n.y * cw + b.y * sw;
      const nz = n.z * cw + b.z * sw;
      const o = (i * rund + j) * 3;
      pos[o] = mx + nx * r;
      pos[o + 1] = my + ny * r;
      pos[o + 2] = mz + nz * r;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
    }
  }

  /** Mittellinie setzen: `punkte` Vektoren vom Ansatz bis zur Spitze (im Raum des Netzes). */
  function setze(p) {
    for (let i = 0; i < punkte; i += 1) {
      const vor = p[Math.min(punkte - 1, i + 1)];
      const zurueck = p[Math.max(0, i - 1)];
      t.subVectors(vor, zurueck);
      if (t.lengthSq() < 1e-10) t.set(0, 0, 1);
      t.normalize();
      if (i === 0) {
        // Startrahmen: irgendeine Achse quer zur Richtung
        hilf.set(0, 1, 0);
        if (Math.abs(t.y) > 0.9) hilf.set(1, 0, 0);
        n.crossVectors(hilf, t).normalize();
      } else {
        // mitführen: die alte Querachse auf die neue Richtung senkrecht stellen
        n.addScaledVector(t, -n.dot(t));
        if (n.lengthSq() < 1e-10) n.crossVectors(b, t);
        n.normalize();
      }
      b.crossVectors(t, n);
      ring(i, p[i].x, p[i].y, p[i].z, radius(i / (punkte - 1)));
    }
    // Kappe: in Richtung des letzten Stücks weiter, immer enger, dann der Spitzenpunkt
    const ende = p[punkte - 1];
    const r = radius(1);
    KAPPE.forEach(([vor, anteil], k) => {
      m.copy(ende).addScaledVector(t, r * vor);
      const i = punkte + k;
      ring(i, m.x, m.y, m.z, r * anteil);
      // Normalen der Kappe neigen sich zur Spitze
      for (let j = 0; j < rund; j += 1) {
        const o = (i * rund + j) * 3;
        hilf.set(nor[o], nor[o + 1], nor[o + 2]).multiplyScalar(anteil).addScaledVector(t, vor).normalize();
        nor[o] = hilf.x;
        nor[o + 1] = hilf.y;
        nor[o + 2] = hilf.z;
      }
    });
    m.copy(ende).addScaledVector(t, r);
    pos.set([m.x, m.y, m.z], spitze * 3);
    nor.set([t.x, t.y, t.z], spitze * 3);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  return { mesh, setze, dispose: () => geo.dispose() };
}
