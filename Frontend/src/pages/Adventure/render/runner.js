// render/runner.js — verbindet Spielzustand, Renderer und Eingabe im Browser: feste 60-Hz-Simulation, Zeichnen so oft
// der Bildschirm will, HUD-Daten 10× pro Sekunde an React, Ereignisse (Item, Boss, Tod …) sofort.
//
// Zwei Zeichner: In der 3D-Ansicht (Standard, ui/settings.js) zeichnet scene3d.js das Spielfeld auf eine zweite Fläche
// unten, und der 2D-Zeichner (renderer.js) malt nur Schrift und Anzeigen darüber. In der 2D-Ansicht malt der
// 2D-Zeichner alles selbst. Die 3D-Ansicht wird beim ersten Bild geladen (bis dahin 2D) und lässt sich mitten im Lauf
// umschalten; geht sie auf diesem Gerät nicht, bleibt es still bei 2D.
//
// Tasten: WASD/Pfeile laufen · Linke Maus Hauptangriff · Rechte Maus Zweitangriff · Leertaste/Shift Bewegung ·
// R Spezial · Q Ausrüstung · E benutzen. Tab und Esc behandelt die React-Seite.

import { stepGame, hudState, TICK } from "../engine/game.js";
import { nearestEnemy } from "../engine/combat.js";
import Renderer from "./renderer.js";
import { playSound } from "../ui/sound.js";
import { getSettings, quality3d } from "../ui/settings.js";
import { meldeFehler } from "../../../utils/fehlerMelder.js";

const MOVE_KEYS = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  Space: "utility", ShiftLeft: "utility", ShiftRight: "utility", KeyR: "special",
};
const PRESS_KEYS = { KeyE: "interact", KeyF: "interact", KeyQ: "equipment" };

// Touch (hud/TouchControls.jsx): Ohne Zielen per Finger greift der Held den nächsten Gegner in dieser Reichweite an
const AUTO_AIM_RANGE = 650;
const STICK_AIM_DIST = 320; // Zielen per Finger: so weit vor dem Helden liegt der Zielpunkt

export default class GameRunner {
  constructor({ canvas, canvas3d = null, game, onHud, onEvents, skin = "" }) {
    this.canvas = canvas;
    this.canvas3d = canvas3d;
    this.scene3d = null;
    this.scene3dState = "none"; // none → loading → ready | failed
    this.game = game;
    this.renderer = new Renderer(canvas);
    this.renderer.skin = skin; // Farbvariante des Kits (data/skins.js)
    this.onHud = onHud;
    this.onEvents = onEvents;
    this.held = { up: false, down: false, left: false, right: false, primary: false, secondary: false, utility: false, special: false };
    this.pressed = {};
    this.mouse = { x: 0, y: 0, inside: false };
    // Touch-Steuerung: on = Touch-Modus (automatisches Zielen), move/aim = Richtungen der Finger (Länge ≤ 1) oder null
    this.touch = { on: false, move: null, aim: null };
    this.paused = false;
    this.running = false;
    this.acc = 0;
    this.last = 0;
    this.hudT = 0;
    this.bind();
  }

  bind() {
    this.onKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const m = MOVE_KEYS[e.code];
      if (m) { this.held[m] = true; if (e.code === "Space") e.preventDefault(); }
      const p = PRESS_KEYS[e.code];
      if (p && !e.repeat) this.pressed[p] = true;
    };
    this.onKeyUp = (e) => {
      const m = MOVE_KEYS[e.code];
      if (m) this.held[m] = false;
    };
    this.onMouseMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    this.onMouseDown = (e) => {
      if (e.target !== this.canvas) return;
      if (e.button === 0) this.held.primary = true;
      if (e.button === 2) this.held.secondary = true;
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.held.primary = false;
      if (e.button === 2) this.held.secondary = false;
    };
    this.onContext = (e) => e.preventDefault();
    this.onBlur = () => this.releaseAll();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("contextmenu", this.onContext);
  }

  releaseAll() {
    for (const k of Object.keys(this.held)) this.held[k] = false;
    this.pressed = {};
    this.touch.move = null;
    this.touch.aim = null;
  }

  // Handy (RunScreen kompakt): Minikarte oben rechts unter der HUD-Leiste ({ top, size }); null = unten rechts
  setMinimap(layout) {
    this.renderer.minimapLayout = layout;
    if (!this.running) this.drawFrame(0);
  }

  // ── Touch (hud/TouchControls.jsx) ──
  setTouchMode(on) { this.touch.on = !!on; if (!on) { this.touch.move = null; this.touch.aim = null; } }
  setTouchMove(v) { this.touch.move = v; }
  setTouchAim(v) { this.touch.aim = v; }
  setHeld(name, down) { if (name in this.held) this.held[name] = !!down; }
  press(name) { this.pressed[name] = true; }

  // Eingabe für einen Simulationsschritt. Mit Maus: Zielpunkt unter dem Zeiger. Im Touch-Modus: Zielen per Finger
  // (und dabei Hauptangriff), sonst automatisch auf den nächsten Gegner — ohne Gegner in Laufrichtung, ohne Angriff.
  buildInput() {
    const t = this.touch;
    if (!t.on) {
      const w = (this.activeView || this.renderer).screenToWorld(this.mouse.x, this.mouse.y);
      return { held: this.held, pressed: this.pressed, aimX: w.x, aimY: w.y };
    }
    const p = this.game.player;
    let aimX, aimY, fire = false;
    if (t.aim) {
      aimX = p.x + t.aim.x * STICK_AIM_DIST;
      aimY = p.y + t.aim.y * STICK_AIM_DIST;
      fire = true;
    } else {
      const e = nearestEnemy(this.game, p.x, p.y, AUTO_AIM_RANGE);
      if (e) { aimX = e.x; aimY = e.y; fire = true; }
      else { aimX = p.x + Math.cos(p.moveAngle || 0) * 200; aimY = p.y + Math.sin(p.moveAngle || 0) * 200; }
    }
    return { held: { ...this.held, primary: this.held.primary || fire }, pressed: this.pressed, aimX, aimY, move: t.move };
  }

  // Die 3D-Ansicht, wenn sie gewünscht und bereit ist — sonst null (dann zeichnet der 2D-Zeichner alles)
  view3d() {
    const want = !!this.canvas3d && getSettings().view === "3d" && this.scene3dState !== "failed";
    if (this.canvas3d) this.canvas3d.style.visibility = want && this.scene3dState === "ready" ? "visible" : "hidden";
    if (!want) return null;
    if (this.scene3dState === "none") {
      this.scene3dState = "loading";
      import("../render3d/scene3d.js").then(({ default: Scene3d }) => {
        if (this.destroyed) return null;
        const scene = new Scene3d(this.canvas3d, { kitId: this.game.kitId, quality: quality3d(), skin: this.renderer.skin });
        scene.resize(this.renderer.w, this.renderer.h);
        return scene.ready.then(() => scene.loadWorldCast(this.game)).then(() => {
          if (this.destroyed) { scene.dispose(); return; }
          this.scene3d = scene;
          this.scene3dState = "ready";
        });
      }).catch((err) => {
        console.warn("[adVentures] 3D-Ansicht nicht verfügbar, es bleibt bei 2D:", err);
        // ins Fehlerprotokoll (Admin „Fehler“) — der Spieler merkt nur, dass es 2D ist
        meldeFehler("manuell", err, "adVentures: 3D-Ansicht nicht verfügbar, Rückfall auf 2D");
        this.scene3dState = "failed";
      });
    }
    return this.scene3dState === "ready" ? this.scene3d : null;
  }

  // Wartet, bis der gewählte Zeichner bereit ist — bei 3D der Zeichner samt Figuren der ersten Welt (höchstens 6 s,
  // danach geht es in 2D los und wechselt, sobald 3D da ist)
  whenReady() {
    this.view3d();
    if (this.scene3dState !== "loading") return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => (this.scene3dState !== "loading" || this.destroyed || performance.now() - t0 > 6000 ? resolve() : setTimeout(tick, 30));
      tick();
    });
  }

  resize(w, h) {
    this.renderer.resize(w, h);
    this.scene3d?.resize(w, h);
    if (!this.mouse.x) { this.mouse.x = w / 2 + 100; this.mouse.y = h / 2; }
    if (!this.running) this.drawFrame(0);
  }

  drawFrame(dt) {
    const view = this.view3d();
    this.activeView = view || this.renderer;
    if (view) {
      // Bildqualität im Pausenmenü umgestellt: sofort übernehmen (getSettings liefert nach jeder Änderung ein neues Objekt)
      const st = getSettings();
      if (st !== this.qualityFor) { this.qualityFor = st; const q = quality3d(st); if (view.quality !== q) view.setQuality(q); }
      view.shakeOn = st.shake; view.draw(this.game, dt); this.renderer.drawOverlay(this.game, dt, view);
    }
    else this.renderer.draw(this.game, dt);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // Kurzes Einfrieren (Item aufgehoben): nichts simulieren, Bild steht
      const frozen = this.freezeT > 0;
      if (frozen) this.freezeT -= dt;
      if (!this.paused && !frozen) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= TICK && steps < 6) {
          stepGame(this.game, TICK, this.buildInput());
          this.pressed = {};
          this.acc -= TICK;
          steps++;
        }
        if (steps === 6) this.acc = 0;
        const sfx = this.game.fx.sfx;
        // Je länger die Kill-Serie, desto höher klingen Kills und Kristalle (alle 5 Kills ein Halbton, höchstens 2 Oktaven)
        const step = Math.min(24, Math.floor(this.game.streak.n / 5));
        for (const k of Object.keys(sfx)) { if (sfx[k] > 0) { playSound(k, k === "kill" || k === "xp" ? step : 0); sfx[k] = 0; } }
        if (this.game.events.length) {
          const evs = this.game.events.splice(0);
          this.onEvents?.(evs);
        }
        this.hudT -= dt;
        if (this.hudT <= 0) { this.hudT = 0.1; this.onHud?.(hudState(this.game)); }
      }
      this.drawFrame(this.paused || frozen ? 0 : dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.releaseAll();
    else this.last = performance.now();
  }

  // Spiel kurz anhalten, ohne das Pausenmenü zu öffnen (Eingaben bleiben gedrückt)
  hitstop(sec) { this.freezeT = Math.max(this.freezeT || 0, sec); }

  // HUD sofort aktualisieren (z. B. nach Pause)
  pushHud() { this.onHud?.(hudState(this.game)); }

  destroy() {
    this.running = false;
    this.destroyed = true;
    this.scene3d?.dispose();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("contextmenu", this.onContext);
  }
}
