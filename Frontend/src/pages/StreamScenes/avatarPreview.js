// avatarPreview.js — 3D-Vorschau für den Figurbaukasten (/tanzfigur).
//
// Eine Figur auf einer kleinen Bühne, tanzt im Takt (gleiche Tänze wie im Stream). Ziehen dreht
// die Figur, losgelassen dreht sie sich langsam weiter. setLook baut die Figur um, ohne den Tanz
// zu unterbrechen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadPeopleKit, buildPersonFigure, personBeatScale, PERSON_H } from './peopleFigure';
import { createBeatClock } from './sceneLink';

export const PREVIEW_DANCES = [
  { id: 'idle', label: 'Stehen' },
  { id: 'handsup', label: 'Hände hoch' },
  { id: 'jumpstyle', label: 'Jumpstyle' },
  { id: 'shuffle', label: 'Shuffle' },
  { id: 'fistpump', label: 'Fist Pump' },
  { id: 'headbang', label: 'Headbang' },
  { id: 'salsa', label: 'Salsa' },
  { id: 'groove', label: 'Groove' },
];

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ ready: Promise<boolean>, setLook(look): void, setDance(id): void, dispose(): void }}
 */
export function createAvatarPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, PERSON_H * 0.62, 4.3);
  camera.lookAt(0, PERSON_H * 0.5, 0);

  scene.add(new THREE.HemisphereLight('#c9c4ff', '#201828', 1.1));
  const key = new THREE.DirectionalLight('#fff3e8', 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7f8cff', 1.6);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);

  // Kleine runde Bühne
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#1b1b26', roughness: 0.6, metalness: 0.2 }));
  stage.position.y = -0.04;
  scene.add(stage);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: '#8b5cf6' }));
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const holder = new THREE.Group();
  scene.add(holder);
  let fig = null;
  let kit = null;
  let dance = 'handsup';
  let pendingLook = null;
  let disposed = false;
  const clock = createBeatClock(140);

  // Drehen per Ziehen
  let yaw = 0.35, yawVel = 0.25, dragging = false, lastX = 0;
  const down = (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.012;
    yawVel = dx * 0.6;
  };
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);

  const play = () => {
    if (!fig || !kit) return;
    fig.play(dance, { fade: 0.35, timeScale: personBeatScale(kit, dance, clock.bpm) });
  };

  const ready = loadPeopleKit().then((k) => {
    if (disposed || !k) return false;
    kit = k;
    fig = buildPersonFigure(kit, { seed: 1, envMap: env, look: pendingLook });
    holder.add(fig.group);
    play();
    return true;
  });

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let last = performance.now();
  let raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const beat = clock.step(dt);
    if (!dragging) {
      yawVel += (0.25 - yawVel) * Math.min(1, dt * 1.5);
      yaw += yawVel * dt;
    }
    holder.rotation.y = yaw;
    ring.material.color.setHSL(0.72 + 0.05 * Math.sin(beat * Math.PI / 2), 0.8, 0.45 + 0.15 * Math.max(0, 1 - (beat % 1) * 3));
    fig?.update(dt, beat);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    ready,
    setLook(look) {
      pendingLook = look;
      fig?.setOutfit(look);
    },
    setDance(id) {
      dance = id;
      play();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      fig?.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
