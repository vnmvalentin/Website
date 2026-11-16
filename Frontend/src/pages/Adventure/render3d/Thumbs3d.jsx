// render3d/Thumbs3d.jsx — Bühne für die Bilder der 3D-Figuren (nur im Dev-Server: /adventures/probe3d/bilder).
//
// Der Kodex zeigt Gegner und Bosse als Bild (public/media/av3d/bilder/*.png). Diese Seite stellt jede Figur der
// Besetzung (cast.js) einzeln vor durchsichtigem Grund; tools/thumbs.mjs fotografiert sie der Reihe nach. Von Hand:
// die Seite öffnen und mit den Pfeiltasten durchblättern.

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadFigure } from "./figures3d.js";
import { CAST, BOSS_CAST, DEFAULT_BOSS, HEROES, HERO_SKINS } from "./cast.js";
import { toonRamp, outlineMaterial } from "./scene3d.js";
import { ENEMIES } from "../data/enemies.js";
import { BOSSES } from "../data/bosses.js";

const SIZE = 192;

// Dateiname → Besetzung: gegner_<id>, boss_<id>, held_<kit> und je Farbvariante held_<kit>_<skin>
const THUMBS = [
  ...Object.keys(ENEMIES).filter((id) => CAST[id]).map((id) => ({ file: `gegner_${id}`, cast: CAST[id] })),
  ...Object.keys(BOSSES).map((id) => ({ file: `boss_${id}`, cast: BOSS_CAST[id] || DEFAULT_BOSS })),
  ...Object.entries(HEROES).map(([id, cast]) => ({ file: `held_${id}`, cast })),
  ...Object.entries(HEROES).flatMap(([id, cast]) => Object.entries(HERO_SKINS).map(([skin, tint]) => ({ file: `held_${id}_${skin}`, cast: { ...cast, tint } }))),
];

export default function Thumbs3d() {
  const canvasRef = useRef(null);
  const [index, setIndex] = useState(0);
  const stage = useRef(null);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a3048, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
    const hull = new THREE.Mesh(new THREE.BufferGeometry(), outlineMaterial());
    scene.add(body, hull);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const box = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3();

    // Figur i hinstellen: von schräg vorn, so nah, dass sie das Bild füllt
    const draw = async (i) => {
      const { file, cast } = THUMBS[i];
      const fig = await loadFigure(cast.fig);
      body.geometry = hull.geometry = fig.idle;
      const tint = cast.tint || [1, 1, 1];
      body.material.color.setRGB(tint[0], tint[1], tint[2]);
      fig.idle.computeBoundingBox();
      box.copy(fig.idle.boundingBox).getCenter(center);
      box.getSize(size);
      const d = (Math.max(size.x, size.y, size.z * 0.8) * 1.12) / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
      const yaw = THREE.MathUtils.degToRad(26), pitch = THREE.MathUtils.degToRad(13);
      camera.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * d, center.y + Math.sin(pitch) * d, center.z + Math.cos(yaw) * Math.cos(pitch) * d);
      camera.lookAt(center);
      renderer.render(scene, camera);
      // Das Bild gleich nach dem Zeichnen auslesen — so bleibt der Grund wirklich durchsichtig
      return { file, png: canvasRef.current.toDataURL("image/png") };
    };
    stage.current = draw;
    if (import.meta.env.DEV) window.__thumbs = { count: THUMBS.length, draw };
    draw(0);
    return () => { stage.current = null; renderer.dispose(); };
  }, []);

  useEffect(() => { stage.current?.(index); }, [index]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "ArrowRight") setIndex((i) => (i + 1) % THUMBS.length);
      if (e.code === "ArrowLeft") setIndex((i) => (i + THUMBS.length - 1) % THUMBS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
      <canvas id="thumb" ref={canvasRef} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE }} />
      <p className="av-faint text-[14px] av-num">{index + 1} / {THUMBS.length} · {THUMBS[index].file} · Pfeiltasten blättern</p>
    </div>
  );
}
