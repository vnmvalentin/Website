// ui/table/scene/maskThumbs.js — kleine Vorschaubilder der Masken für die Einstellungen (Rebuild Phase 3).
//
// Die eigene Maske sieht man am Tisch nie selbst — nur das Gegenüber. Damit man trotzdem weiß, was man wählt,
// wird jede Maske einmal in der Kapuze gerendert (dieselben Bauteile wie am Tisch, scene/figure.js) und als Bild
// zurückgegeben. Ein Renderer für alle sechs Bilder, danach wird er wieder freigegeben.
import * as THREE from "three";
import { figureMaterials, makeHood, buildMask } from "./figure.js";
import { MASK_IDS } from "../masks.js";

/** @type {Promise<Record<string, string>> | null} */
let cache = null;

/**
 * @param {number} [size] Kantenlänge in Pixeln
 * @returns {Promise<Record<string, string>>} Kennung → Daten-URL (leer, wenn der Browser kein WebGL kann)
 */
export function maskThumbs(size = 192) {
  if (cache) return cache;
  cache = new Promise((resolve) => {
    /** @type {Record<string, string>} */
    const out = {};
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      resolve(out);
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0705);
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
    camera.position.set(0, 2.5, 52);
    camera.lookAt(0, 0.6, 6);
    // Licht wie am Tisch: warme Glut von unten, ein schwaches Führungslicht von vorn oben
    scene.add(new THREE.HemisphereLight(0x8a7055, 0x0a0604, 0.5));
    const glow = new THREE.PointLight(0xffa860, 1400, 120, 2);
    glow.position.set(-6, -16, 26);
    scene.add(glow);
    const key = new THREE.DirectionalLight(0xffd6a8, 0.9);
    key.position.set(8, 14, 24);
    scene.add(key);
    const m = figureMaterials();
    const { head } = makeHood(m);
    scene.add(head);
    for (const id of MASK_IDS) {
      const mask = buildMask(m, id);
      head.add(mask);
      renderer.render(scene, camera);
      out[id] = renderer.domElement.toDataURL("image/png");
      head.remove(mask);
      mask.traverse((o) => o.geometry?.dispose());
    }
    head.traverse((o) => o.geometry?.dispose());
    for (const mat of Object.values(m)) mat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    resolve(out);
  });
  return cache;
}
