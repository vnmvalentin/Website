// components/SkinEditor.jsx — den eigenen Blob gestalten (Menü): Farbe, Hut, Gesicht, mit drehender 3D-Vorschau.
// Gebaut wird die Figur von scene/avatars.js — genau so sitzt sie online am Tisch.
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { createAvatar } from "../scene/avatars.js";
import { SKIN_COLORS, SKIN_FACES, SKIN_HATS, randomSkin } from "../skins.js";

function SkinPreview({ skin }) {
  const canvasRef = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return undefined; // ohne 3D bleibt die Vorschau leer — die Auswahl geht trotzdem
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.75, 5.6);
    camera.lookAt(0, 1.38, 0);
    scene.add(new THREE.HemisphereLight("#ffffff", "#3a3550", 1.5));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const holder = new THREE.Group();
    scene.add(holder);
    let avatar = null;
    let frame = 0;
    let time = 0;
    const clock = new THREE.Clock();
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      time += dt;
      holder.rotation.y = Math.sin(time * 0.7) * 0.45;
      avatar?.update(time, dt);
      renderer.render(scene, camera);
    };
    api.current = {
      set(next) {
        if (avatar) {
          holder.remove(avatar.group);
          avatar.group.traverse((o) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
          });
        }
        avatar = createAvatar(0, next);
        avatar.hop();
        holder.add(avatar.group);
      },
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    loop();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      api.current = null;
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    api.current?.set(skin);
  }, [skin]);

  return <canvas ref={canvasRef} className="wf-skin-canvas" aria-hidden="true" />;
}

function Stepper({ label, names, value, onChange }) {
  const step = (d) => onChange((value + d + names.length) % names.length);
  return (
    <div className="wf-stepper">
      <span className="wf-label">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="wf-icon-btn" onClick={() => step(-1)} aria-label={`${label}: vorheriger`}><ChevronLeft size={17} /></button>
        <span className="wf-stepper-name">{names[value]}</span>
        <button type="button" className="wf-icon-btn" onClick={() => step(1)} aria-label={`${label}: nächster`}><ChevronRight size={17} /></button>
      </div>
    </div>
  );
}

/** @param {{ skin: {c: number, h: number, f: number}, onChange: (skin: object) => void }} props */
export default function SkinEditor({ skin, onChange }) {
  return (
    <section className="wf-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="wf-section-title">Dein Blob</h2>
        <button type="button" className="wf-btn wf-btn-sm wf-btn-ghost" onClick={() => onChange(randomSkin())}><Shuffle size={14} />Zufall</button>
      </div>
      <div className="wf-skin">
        <SkinPreview skin={skin} />
        <div className="grid gap-3 content-start">
          <div>
            <span className="wf-label block mb-1.5">Farbe</span>
            <div className="wf-swatches">
              {SKIN_COLORS.map((col, i) => (
                <button key={col.name} type="button" title={col.name} aria-label={col.name} aria-pressed={skin.c === i} style={{ background: col.hex }} onClick={() => onChange({ ...skin, c: i })} />
              ))}
            </div>
          </div>
          <Stepper label="Hut" names={SKIN_HATS} value={skin.h} onChange={(h) => onChange({ ...skin, h })} />
          <Stepper label="Gesicht" names={SKIN_FACES} value={skin.f} onChange={(f) => onChange({ ...skin, f })} />
        </div>
      </div>
      <p className="wf-faint text-sm mt-3">So sehen dich die anderen online am Tisch.</p>
    </section>
  );
}
