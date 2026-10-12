// render/runner.js — verbindet Spielzustand, Renderer und Eingabe im Browser: feste 60-Hz-Simulation, Zeichnen so oft
// der Bildschirm will, HUD-Daten 10× pro Sekunde an React, Ereignisse (Item, Boss, Tod …) sofort.
//
// Tasten: WASD/Pfeile laufen · Linke Maus Hauptangriff · Rechte Maus Zweitangriff · Leertaste/Shift Bewegung ·
// R Spezial · Q Ausrüstung · E benutzen. Tab und Esc behandelt die React-Seite.

import { stepGame, hudState, TICK } from "../engine/game.js";
import Renderer from "./renderer.js";
import { playSound } from "../ui/sound.js";

const MOVE_KEYS = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  Space: "utility", ShiftLeft: "utility", ShiftRight: "utility", KeyR: "special",
};
const PRESS_KEYS = { KeyE: "interact", KeyF: "interact", KeyQ: "equipment" };

export default class GameRunner {
  constructor({ canvas, game, onHud, onEvents, skin = "" }) {
    this.canvas = canvas;
    this.game = game;
    this.renderer = new Renderer(canvas);
    this.renderer.skin = skin; // Farbvariante des Kits (data/skins.js)
    this.onHud = onHud;
    this.onEvents = onEvents;
    this.held = { up: false, down: false, left: false, right: false, primary: false, secondary: false, utility: false, special: false };
    this.pressed = {};
    this.mouse = { x: 0, y: 0, inside: false };
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
  }

  resize(w, h) {
    this.renderer.resize(w, h);
    if (!this.mouse.x) { this.mouse.x = w / 2 + 100; this.mouse.y = h / 2; }
    if (!this.running) this.renderer.draw(this.game, 0);
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
          const w = this.renderer.screenToWorld(this.mouse.x, this.mouse.y);
          stepGame(this.game, TICK, { held: this.held, pressed: this.pressed, aimX: w.x, aimY: w.y });
          this.pressed = {};
          this.acc -= TICK;
          steps++;
        }
        if (steps === 6) this.acc = 0;
        const sfx = this.game.fx.sfx;
        for (const k of Object.keys(sfx)) { if (sfx[k] > 0) { playSound(k); sfx[k] = 0; } }
        if (this.game.events.length) {
          const evs = this.game.events.splice(0);
          this.onEvents?.(evs);
        }
        this.hudT -= dt;
        if (this.hudT <= 0) { this.hudT = 0.1; this.onHud?.(hudState(this.game)); }
      }
      this.renderer.draw(this.game, this.paused || frozen ? 0 : dt);
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
