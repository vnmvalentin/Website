// render3d/Probe3d.jsx — Look-Probe für die 3D-Ansicht (nur im Dev-Server erreichbar: /adventures/probe3d).
//
// Zeigt das echte Spiel (engine/) mit dem 3D-Zeichner (scene3d.js) statt dem 2D-Canvas: der Bot spielt oder man
// steuert selbst, die Horde wird auf eine einstellbare Größe gehalten, und oben links stehen die Messwerte. Kein HUD,
// keine Menüs — hier geht es nur um Aussehen und Bildrate. Der Spieler ist unverwundbar, Stufen wählt der Bot.

import React, { useEffect, useRef, useState } from "react";
import { createGame, stepGame, TICK } from "../engine/game.js";
import { botInput, botChoose } from "../engine/bot.js";
import { spawnEnemy } from "../engine/enemies.js";
import { spawnBoss } from "../engine/bosses/index.js";
import { loadStage } from "../engine/stage.js";
import { ENEMIES } from "../data/enemies.js";
import { BIOMES, BIOMES_NEU, NEUE_WELTEN, enemyPoolFor } from "../data/biomes.js";
import { BOSSES } from "../data/bosses.js";
import { KITS, KIT_ORDER } from "../data/kits.js";
import Scene3d from "./scene3d.js";

const SIZES = [150, 300, 600, 1000];
// Mischung der Probe-Horde nach Stufe (data/enemies.js, tier) — die Arten kommen aus dem Vorrat der gewählten Welt
const MIX = [["futter", 0.78], ["kaempfer", 0.14], ["spezial", 0.05], ["brocken", 0.03]];
// Klassische Welten (Zyklus 1) und die neuen ab Zyklus 2 (geladen in Zyklus 2, dort stehen sie im Wechsel)
const WORLDS = [
  ...BIOMES.filter((b) => !b.final).map((b, i) => ({ biome: b, index: i, loop: 0, name: b.name })),
  ...NEUE_WELTEN.map((b) => ({ biome: b, index: BIOMES_NEU.indexOf(b), loop: 1, name: `${b.name} (ab Zyklus 2)` })),
];
const KEYS = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "utility", ShiftLeft: "utility", KeyR: "special" };

function pickType(g) {
  const pool = enemyPoolFor(g.biome, 0);
  let roll = Math.random(), tier = "futter";
  for (const [t, share] of MIX) { roll -= share; if (roll <= 0) { tier = t; break; } }
  let list = pool.filter(([id]) => (ENEMIES[id].tier || "kaempfer") === tier);
  if (!list.length) list = pool.filter(([id]) => ENEMIES[id].tier === "futter");
  let pick = Math.random() * list.reduce((n, [, w]) => n + w, 0);
  for (const [id, w] of list) { pick -= w; if (pick <= 0) return id; }
  return list[0][0];
}

function makeGame(kitId, world) {
  const g = createGame({ kitId, seed: 11 });
  const w = WORLDS[world];
  if (w.index > 0 || w.loop > 0) { g.stageIndex = w.index; g.loop = w.loop; loadStage(g); }
  const p = g.player;
  // Ein ausgebauter Held, damit von Anfang an gemäht wird
  Object.assign(p.weapons, { dolche: 5, peitsche: 4, donnerkeil: 4, bumerang: 4 });
  p.weaponOrder.push("dolche", "peitsche", "donnerkeil", "bumerang");
  g.enemies.length = 0; // keine Lager — die Probe stellt ihre eigene Horde
  return g;
}

// Aufstellung: jede Art der Welt einmal, in Reihen vor dem Helden, dahinter die Bosse. Das Spiel steht dabei —
// zum Ansehen der Figuren, nicht zum Spielen.
function lineUp(g) {
  const p = g.player;
  g.enemies.length = 0;
  const order = { futter: 0, kaempfer: 1, spezial: 2, brocken: 3 };
  const ids = [...new Set([...enemyPoolFor(g.biome, 0).map(([id]) => id), "skeletonwarrior"])].sort((a, b) => order[ENEMIES[a].tier || "kaempfer"] - order[ENEMIES[b].tier || "kaempfer"]);
  const PER_ROW = 5;
  ids.forEach((id, i) => {
    const row = Math.floor(i / PER_ROW), col = i % PER_ROW, n = Math.min(PER_ROW, ids.length - row * PER_ROW);
    const e = spawnEnemy(g, id, p.x + (col - (n - 1) / 2) * 130, p.y - 150 - row * 120, {});
    e.spawnT = 1;
  });
  const rows = Math.ceil(ids.length / PER_ROW);
  g.biome.bosses.forEach((id, i) => {
    const b = spawnBoss(g, id, p.x + (i - (g.biome.bosses.length - 1) / 2) * 330, p.y - 190 - rows * 120);
    b.spawnT = 1;
  });
  const giant = enemyPoolFor(g.biome, 0).map(([id]) => id).find((id) => ENEMIES[id].tier === "brocken" && ["brute", "charger"].includes(ENEMIES[id].ai));
  if (giant) spawnEnemy(g, giant, p.x + 420, p.y - 150, { giant: true }).spawnT = 1;
  g.events.length = 0;
}

// Die Horde auf der gewünschten Größe halten (statt des normalen Nachschubs)
function feedHorde(g, size) {
  g.director.t = 1e9; g.director.giantT = 1e9;
  g.horde.next.blood = g.horde.next.ring = g.horde.next.champ = 1e9;
  let alive = 0;
  for (const e of g.enemies) if (!e.dead) alive++;
  const p = g.player;
  for (let i = 0; i < 14 && alive < size; i++, alive++) {
    const a = Math.random() * Math.PI * 2, d = 560 + Math.random() * 420;
    const x = Math.min(g.world.w - 80, Math.max(80, p.x + Math.cos(a) * d * 1.25)), y = Math.min(g.world.h - 80, Math.max(80, p.y + Math.sin(a) * d * 0.85));
    spawnEnemy(g, pickType(g), x, y, {});
  }
}

function Choice({ label, value, current, onPick }) {
  return <button type="button" role="tab" className="av-tab !py-1" aria-selected={current === value} onClick={() => onPick(value)}>{label}</button>;
}

export default function Probe3d() {
  const canvasRef = useRef(null);
  const live = useRef({ size: 300, self: false });
  const [view, setView] = useState("horde");
  const [size, setSize] = useState(300);
  const [quality, setQuality] = useState("hoch");
  const [self, setSelf] = useState(false);
  const [kit, setKit] = useState("knight");
  const [world, setWorld] = useState(0);
  const gameRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);

  useEffect(() => { live.current.size = size; live.current.self = self; }, [size, self]);
  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let scene;
    try { scene = new Scene3d(canvas, { kitId: kit, quality }); } catch (e) { setError(`3D lässt sich hier nicht starten: ${e.message}`); return undefined; }
    sceneRef.current = scene;
    const game = makeGame(kit, world);
    gameRef.current = game;
    const standing = view === "reihe";
    if (standing) lineUp(game);
    const held = { up: false, down: false, left: false, right: false, primary: false, secondary: false, utility: false, special: false };
    const mouse = { x: 0, y: 0 };
    let pressed = {};

    const fit = () => { const r = canvas.parentElement.getBoundingClientRect(); scene.resize(r.width, r.height); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas.parentElement);

    const onKey = (down) => (e) => {
      const k = KEYS[e.code];
      if (k) { held[k] = down; if (e.code === "Space") e.preventDefault(); }
      if (down && !e.repeat && (e.code === "KeyE" || e.code === "KeyF")) pressed.interact = true;
      if (down && !e.repeat && e.code === "KeyQ") pressed.equipment = true;
    };
    const keyDown = onKey(true), keyUp = onKey(false);
    const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onDown = (e) => { if (e.target !== canvas) return; if (e.button === 0) held.primary = true; if (e.button === 2) held.secondary = true; };
    const onUp = (e) => { if (e.button === 0) held.primary = false; if (e.button === 2) held.secondary = false; };
    const noMenu = (e) => e.preventDefault();
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp);
    window.addEventListener("mousemove", onMove); window.addEventListener("mousedown", onDown); window.addEventListener("mouseup", onUp);
    canvas.addEventListener("contextmenu", noMenu);

    let raf = 0, last = performance.now(), acc = 0, running = true;
    let frames = 0, statT = 0, killsAt = 0, worst = 0;
    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      worst = Math.max(worst, dt * 1000);
      acc += dt;
      let steps = 0;
      while (!standing && acc >= TICK && steps < 5) {
        const p = game.player;
        p.hp = p.stats.maxHp; // unverwundbar: die Probe soll nicht enden
        feedHorde(game, live.current.size);
        botChoose(game);
        let input;
        if (live.current.self) {
          const w = scene.screenToWorld(mouse.x, mouse.y);
          input = { held, pressed, aimX: w.x, aimY: w.y };
          pressed = {};
        } else input = botInput(game, { evade: true });
        stepGame(game, TICK, input);
        game.events.length = 0;
        acc -= TICK; steps++;
      }
      if (steps === 5) acc = 0;
      scene.draw(game, dt);
      frames++; statT += dt;
      if (statT >= 0.5) {
        setStats({ fps: Math.round(frames / statT), ms: scene.stats.ms, worst, figures: scene.stats.figures, tris: scene.stats.tris, calls: scene.stats.calls, kps: (game.stats.kills - killsAt) / statT, kills: game.stats.kills });
        frames = 0; statT = 0; killsAt = game.stats.kills; worst = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    scene.ready.then(() => { if (running) raf = requestAnimationFrame(frame); }).catch((e) => setError(`Figuren konnten nicht geladen werden: ${e.message}`));
    if (import.meta.env.DEV) window.__probe = { scene, game };

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp);
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("contextmenu", noMenu);
      scene.dispose();
      sceneRef.current = null;
    };
    // quality wird live umgestellt (setQuality), nur Kit und Welt bauen die Szene neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, world, view]);

  // Ruft abwechselnd die Bosse der Welt neben den Helden
  const callBoss = () => {
    const g = gameRef.current;
    if (!g) return;
    const ids = g.biome.bosses;
    g.bossCalls = (g.bossCalls || 0) + 1;
    spawnBoss(g, ids[g.bossCalls % ids.length], Math.min(g.world.w - 200, g.player.x + 320), g.player.y);
  };

  return (
    <div className="relative flex-1 min-h-0 bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-3 left-3 av-block p-4 w-[300px] text-[15px] select-none">
        <h1 className="av-title text-[20px] mb-1">3D-Probe</h1>
        <p className="av-faint text-[13px] mb-3">Echtes Spiel, neuer Zeichner. Der Held ist unverwundbar.</p>

        <div className="av-label mb-1">Ansicht</div>
        <div className="av-tabs !gap-3 mb-3" role="tablist">
          <Choice label="Horde" value="horde" current={view} onPick={setView} />
          <Choice label="Aufstellung" value="reihe" current={view} onPick={setView} />
        </div>

        <div className="av-label mb-1">Horde</div>
        <div className="av-tabs !gap-3 mb-3" role="tablist">{SIZES.map((n) => <Choice key={n} label={n} value={n} current={size} onPick={setSize} />)}</div>

        <div className="av-label mb-1">Grafik</div>
        <div className="av-tabs !gap-3 mb-3" role="tablist">
          <Choice label="Hoch" value="hoch" current={quality} onPick={setQuality} />
          <Choice label="Sparmodus" value="spar" current={quality} onPick={setQuality} />
        </div>

        <div className="av-label mb-1">Steuerung</div>
        <div className="av-tabs !gap-3 mb-3" role="tablist">
          <Choice label="Bot spielt" value={false} current={self} onPick={setSelf} />
          <Choice label="Selbst spielen" value current={self} onPick={setSelf} />
        </div>

        <label className="av-label block mb-1" htmlFor="probe-world">Welt</label>
        <div className="flex gap-2 mb-3">
          <select id="probe-world" value={world} onChange={(e) => setWorld(Number(e.target.value))} className="av-input !py-1.5 flex-1">
            {WORLDS.map((w, i) => <option key={w.biome.id} value={i}>{w.name}</option>)}
          </select>
          <button type="button" className="av-btn av-btn-stone av-btn-sm" onClick={callBoss} title={WORLDS[world].biome.bosses.map((id) => BOSSES[id].name).join(" / ")}>Boss</button>
        </div>

        <label className="av-label block mb-1" htmlFor="probe-kit">Held</label>
        <select id="probe-kit" value={kit} onChange={(e) => setKit(e.target.value)} className="av-input !py-1.5 mb-3">
          {KIT_ORDER.map((id) => <option key={id} value={id}>{KITS[id].name}</option>)}
        </select>

        {error ? <p className="text-[#ff8a6a]">{error}</p> : !stats ? <p className="av-faint">Figuren werden geladen …</p> : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 av-num">
            <dt className="av-faint">Bilder pro Sekunde</dt><dd className="text-right">{stats.fps}</dd>
            <dt className="av-faint">Rechenzeit pro Bild</dt><dd className="text-right">{stats.ms.toFixed(1)} ms</dd>
            <dt className="av-faint">Längstes Bild</dt><dd className="text-right">{stats.worst.toFixed(0)} ms</dd>
            <dt className="av-faint">Figuren im Spiel</dt><dd className="text-right">{stats.figures}</dd>
            <dt className="av-faint">Dreiecke</dt><dd className="text-right">{(stats.tris / 1e6).toFixed(2)} Mio.</dd>
            <dt className="av-faint">Zeichenaufrufe</dt><dd className="text-right">{stats.calls}</dd>
            <dt className="av-faint">Kills pro Sekunde</dt><dd className="text-right">{stats.kps.toFixed(1)}</dd>
          </dl>
        )}
        {self && <p className="av-faint text-[13px] mt-3">WASD laufen · Maus zielen · Linke/rechte Maustaste · Leertaste · R</p>}
      </div>
    </div>
  );
}
