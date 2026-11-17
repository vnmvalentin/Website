// screens/RunScreen.jsx — ein laufendes Spiel: Canvas + HUD + Pause/Werte/Sieg. Speichert am Anfang jeder Welt einen
// Spielstand (Fortsetzen startet die Welt neu) und meldet das Ende an den Server.
//
// Tasten hier (alles andere in render/runner.js): Esc = Pause, Tab = Werte ein/aus.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, Save, Flag, BarChart3, Trophy, RotateCw } from "lucide-react";
import { createGame, snapshotGame } from "../engine/game.js";
import { statSheet } from "../engine/stats.js";
import GameRunner from "../render/runner.js";
import Hud, { HudLoadout } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { useTouchDevice } from "../ui/touchDevice.js";
import LevelUp from "../hud/LevelUp.jsx";
import ItemReveal from "../hud/ItemReveal.jsx";
import FlatSprite from "../ui/FlatSprite.jsx";
import { chooseUpgrade, rerollOffer } from "../engine/levelup.js";
import { KITS } from "../data/kits.js";
import { api } from "../api.js";
import { fmtTime } from "../engine/util.js";
import { ITEMS } from "../data/items.js";
import { playSound } from "../ui/sound.js";
import { getSettings, updateSettings, subscribeSettings } from "../ui/settings.js";
import { TWISTS, activeTwist, depthOf, twistForLoop } from "../engine/twists.js";

let revealKey = 0;
const REVEAL_MS = 2400;
const HITSTOP_S = 0.4;

// Klang zu einem Spielereignis (häufige Klänge wie Treffer kommen direkt aus dem Runner)
function eventSound(ev, game) {
  switch (ev.type) {
    case "item": playSound(`item_${ITEMS[ev.id]?.rarity || "common"}`); break;
    case "equipment": playSound("item_uncommon"); break;
    case "levelChoice": playSound(game.levelUp?.shrine ? "shrine" : "levelup"); break;
    case "upgradeChosen": playSound(ev.choice.kind === "evolution" ? "evolution" : "pick"); break;
    case "bossStart": playSound("boss"); break;
    case "bossDead": playSound("bossDead"); break;
    case "championDead": playSound("item_legendary"); break;
    case "streak": playSound("streak"); break;
    case "hordeEvent": playSound(ev.kind === "blood" ? "blood" : ev.kind === "ring" ? "ring" : "champion"); break;
    case "gameOver": playSound("death"); break;
    case "victory": playSound("victory"); break;
    default: break;
  }
}

// Einstellungen im Pausenmenü — wirken sofort (ui/settings.js)
function SettingsPanel() {
  const [s, setS] = useState(getSettings);
  useEffect(() => subscribeSettings(setS), []);
  const toggle = (key, label) => (
    // Am Handy kleiner und mit Silbentrennung — „Schadenszahlen“ passt sonst nicht in ein Drittel der Breite
    <button className="av-seg-btn text-[13px] sm:text-[15px] [hyphens:auto] min-w-0" aria-pressed={s[key]} onClick={() => updateSettings({ [key]: !s[key] })}>{label}</button>
  );
  return (
    <div className="mt-6">
      <h3 className="av-label mb-2">Einstellungen</h3>
      <label className="flex items-center gap-3 text-[15px]">
        <span className="w-[90px] av-dim">Lautstärke</span>
        <input type="range" min="0" max="100" step="5" value={Math.round(s.volume * 100)} className="flex-1 accent-[var(--av-torch)]"
          onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })} aria-label="Lautstärke" />
        <span className="w-[42px] text-right av-num">{Math.round(s.volume * 100)}</span>
      </label>
      <div className="av-seg grid-cols-3 mt-3">
        {toggle("damageNumbers", "Schadenszahlen")}
        {toggle("shake", "Wackeln")}
        {toggle("hitstop", "Item-Pause")}
      </div>
      <div className="av-seg grid-cols-2 mt-2">
        <button className="av-seg-btn text-[15px]" aria-pressed={s.view === "3d"} onClick={() => updateSettings({ view: "3d" })}>3D-Ansicht</button>
        <button className="av-seg-btn text-[15px]" aria-pressed={s.view === "2d"} onClick={() => updateSettings({ view: "2d" })}>2D-Ansicht</button>
      </div>
      {s.view === "3d" && (
        <>
          <div className="mt-3 mb-1.5 text-[14px] av-dim">Bildqualität</div>
          <div className="av-seg grid-cols-3">
            {[["auto", "Automatisch"], ["hoch", "Schön"], ["fluessig", "Flüssig"]].map(([v, label]) => (
              <button key={v} className="av-seg-btn text-[13px] sm:text-[15px] min-w-0" aria-pressed={(s.gfx || "auto") === v} onClick={() => updateSettings({ gfx: v })}>{label}</button>
            ))}
          </div>
        </>
      )}
      <p className="mt-2 text-[13px] av-faint leading-relaxed">
        Ruckelt es, nimm „Flüssig“ (etwas weniger scharf, ohne Konturen). Automatisch heißt: am Handy flüssig, am Rechner
        schön. Die 2D-Ansicht hilft nur, wenn 3D auf dem Gerät gar nicht läuft — sie rechnet alles per Prozessor.
      </p>
    </div>
  );
}

export default function RunScreen({ run, depthBest = 0, onFinished, onQuit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const canvas3dRef = useRef(null);
  const runnerRef = useRef(null);
  const gameRef = useRef(null);
  const finishingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState(null);
  const [reveals, setReveals] = useState([]); // Warteschlange: aufgehobene Items, das erste wird gezeigt
  const [banner, setBanner] = useState(null);
  const [paused, setPaused] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // Kleiner Bildschirm (Handy): kompaktes HUD, Minikarte oben rechts, Waffen und Items im Pausenmenü
  const [layout, setLayout] = useState({ compact: false, portrait: false });
  const [victory, setVictory] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Neue Bestmarke der Tiefe einmal je Lauf ansagen (ab dem zweiten Zyklus; im ersten zählt der Sieg)
  const depthRecordShown = useRef(false);
  const pendingRecord = useRef(0);
  const kit = KITS[run.kitId] || KITS.default;
  const touch = useTouchDevice(); // Handy/Tablet: Touch-Steuerung statt Maus und Tasten

  const showBanner = useCallback((title, sub, color, ms = 2600) => {
    const key = Date.now() + Math.random();
    setBanner({ key, title, sub, color });
    setTimeout(() => setBanner((b) => (b && b.key === key ? null : b)), ms);
  }, []);

  const pushReveal = useCallback((t) => {
    setReveals((list) => [...list.slice(-5), { ...t, key: ++revealKey }]);
  }, []);

  // Das vorderste Kärtchen steht REVEAL_MS lang — warten weitere, kürzer, damit Boss-Beute nicht ewig nachläuft
  const currentReveal = reveals[0];
  useEffect(() => {
    if (!currentReveal) return undefined;
    const t = setTimeout(() => setReveals((list) => list.slice(1)), reveals.length > 1 ? REVEAL_MS / 2 : REVEAL_MS);
    return () => clearTimeout(t);
  }, [currentReveal, reveals.length]);

  const chooseUp = useCallback((i) => {
    const g = gameRef.current;
    if (!g || !chooseUpgrade(g, i)) return;
    runnerRef.current?.pushHud();
  }, []);

  const reroll = useCallback(() => {
    const g = gameRef.current;
    if (!g || !rerollOffer(g)) return;
    runnerRef.current?.pushHud();
  }, []);

  const save = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    try {
      await api.saveRun(run.runId, snapshotGame(g));
      setSaveError(null);
    } catch (e) {
      setSaveError(e.message);
    }
  }, [run.runId]);

  const finish = useCallback(async (won) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const g = gameRef.current;
    runnerRef.current?.setPaused(true);
    const p = g.player;
    const items = [...new Set([...Object.keys(p.items), ...(p.equipment ? [p.equipment] : []), ...g.seenEquipment])];
    const payload = {
      runId: run.runId, kills: g.stats.kills, stagesCleared: g.stagesCleared, bossesKilled: g.stats.bossesKilled,
      timeSec: Math.floor(g.time), won: !!won || g.won, items,
      // nur für Verlauf und Erfolge (der Server deckelt die Werte)
      evolutions: g.stats.evolutions || 0, champions: g.stats.champions || 0, loop: g.loop,
      bestStreak: g.stats.bestStreak || 0, giants: g.stats.giants || 0, boons: Object.values(p.boons || {}).reduce((a, n) => a + n, 0),
      itemCount: Object.values(p.items).reduce((a, n) => a + n, 0),
      weapons: p.weaponOrder.filter((id) => p.weapons[id]).map((id) => ({ id, level: p.weapons[id] })),
      itemStacks: p.itemOrder.filter((id) => p.items[id]).map((id) => ({ id, n: p.items[id] })),
      deathCause: !p.alive ? g.deathCause : null,
    };
    const summary = {
      kitId: g.kitId, difficulty: g.difficulty.id, mode: run.mode || "normal", ascension: g.ascension || 0, skin: run.skin || "", won: !!won || g.won, dead: !p.alive, time: g.time, level: p.level,
      stagesCleared: g.stagesCleared, loop: g.loop, stats: { ...g.stats }, items: p.itemOrder.filter((id) => p.items[id]).map((id) => ({ id, n: p.items[id] })),
      weapons: p.weaponOrder.filter((id) => p.weapons[id]).map((id) => ({ id, level: p.weapons[id] })),
      deathCause: !p.alive ? g.deathCause : null,
      talents: p.talentOrder.filter((id) => p.talents[id]).map((id) => ({ id, level: p.talents[id] })),
    };
    try {
      const res = await api.endRun(payload);
      onFinished({ ...summary, server: res });
    } catch (e) {
      onFinished({ ...summary, server: null, error: e.message });
    }
  }, [onFinished, run.runId, run.mode, run.skin]);

  // Spiel + Assets aufsetzen
  useEffect(() => {
    let cancelled = false;
    const game = createGame({ kitId: run.kitId, difficulty: run.difficulty, seed: run.seed, lockedItems: run.lockedItems || [], snapshot: run.snapshot || null, startItems: run.snapshot ? 0 : run.startItems || 0, ascension: run.ascension || 0 });
    game.seenEquipment = new Set();
    gameRef.current = game;
    if (import.meta.env.DEV) window.__avGame = game; // nur im Dev-Server: für Prüfstände und Konsole
    // Seit dem flachen Stil gibt es keine Bilder mehr zu laden — der Start wartet nur einen Frame, bis das Canvas steht
    requestAnimationFrame(() => {
      if (cancelled) return;
      const runner = new GameRunner({
        canvas: canvasRef.current, canvas3d: canvas3dRef.current, game, skin: run.skin || "",
        onHud: setHud,
        onEvents: (evs) => {
          for (const ev of evs) {
            eventSound(ev, game);
            const stop = getSettings().hitstop ? HITSTOP_S : 0;
            if (ev.type === "item") { runner.hitstop(stop); pushReveal({ kind: "item", id: ev.id, count: ev.count }); }
            else if (ev.type === "equipment") { game.seenEquipment.add(ev.id); runner.hitstop(stop); pushReveal({ kind: "equipment", id: ev.id }); }
            else if (ev.type === "levelChoice") runner.pushHud();
            else if (ev.type === "hordeEvent") {
              if (ev.kind === "blood") showBanner("Blutmond", "30 Sekunden lang bricht die Horde über dich herein", "#ff5a4a", 3000);
              else if (ev.kind === "rush") showBanner("Ansturm", "Halte aus, bis der Teleporter geladen ist", "#ff7a5a", 2600);
              else if (ev.kind === "giant") showBanner("Ein Koloss naht", ev.name.replace("Koloss: ", ""), "#e8e2d4", 2600);
              else if (ev.kind === "ring") showBanner("Eingekreist!", "Schlag dir eine Lücke frei", "#ff7a5a", 2600);
              else if (ev.kind === "champion") showBanner("Ein Champion erscheint", ev.name.replace("Champion: ", ""), "var(--av-gold)", 2800);
            }
            else if (ev.type === "streak") showBanner(`${ev.n}er Serie`, "Alle Kristalle fliegen dir zu", "#5ec8ff", 1800);
            else if (ev.type === "giantDead") runner.hitstop(stop * 0.3);
            else if (ev.type === "championDead") showBanner("Champion besiegt", "Beute liegt bereit", "var(--av-gold)", 2200);
            else if (ev.type === "stageStart") {
              const record = ev.loop > 0 && depthBest > 0 && ev.depth > depthBest && !depthRecordShown.current;
              if (record) depthRecordShown.current = true;
              // (erste Welt eines Zyklus: dort sagt das folgende Ereignis „twist“ an — die Bestmarke steht dann mit dabei)
              if (ev.loop > 0 && ev.index === 0) pendingRecord.current = record ? ev.depth : 0;
              else if (record) showBanner(`Neue Bestmarke: Tiefe ${ev.depth}`, `${ev.name} · weiter als je zuvor`, "var(--av-gold)", 3200);
              else if (ev.loop > 0) showBanner(ev.name, `Zyklus ${ev.loop + 1} · Welt ${ev.index + 1} · Tiefe ${ev.depth}`, "var(--av-torch)");
              else showBanner(ev.final ? "Gewitterhort" : ev.name, ev.final ? "Das Finale" : `Welt ${ev.index + 1}`, "var(--av-torch)");
            }
            // Erste Welt eines neuen Zyklus: seine Wendung (engine/twists.js) statt des Weltnamens
            else if (ev.type === "twist") {
              const rec = pendingRecord.current;
              pendingRecord.current = 0;
              showBanner(`Zyklus ${ev.loop + 1}: ${ev.name}`, rec ? `${ev.desc} Neue Bestmarke: Tiefe ${rec}.` : ev.desc, "#c39bff", 4500);
            }
            else if (ev.type === "stageChanged") save();
            else if (ev.type === "bossStart") showBanner(ev.name, ev.title, "#ff5a4a", 3200);
            else if (ev.type === "bossDead") { runner.hitstop(stop * 0.6); showBanner(`${ev.name} besiegt`, "Beute liegt bereit", "var(--av-gold)"); }
            else if (ev.type === "teleReady" && !ev.final) showBanner("Teleporter bereit", "Mit E zur nächsten Welt", "var(--av-moss)");
            else if (ev.type === "message") showBanner(ev.text, null, "var(--av-dim)", 2400);
            else if (ev.type === "victory") { setVictory(true); runner.setPaused(true); }
            else if (ev.type === "gameOver") { setTimeout(() => finish(false), 1400); }
          }
        },
      });
      runnerRef.current = runner;
      if (import.meta.env.DEV) window.__avRunner = runner; // nur im Dev-Server: Leistungsmessung (Dreiecke, Auflösung)
      const r = wrapRef.current.getBoundingClientRect();
      runner.resize(r.width, r.height);
      // "Welt wird geladen" bleibt stehen, bis der Zeichner bereit ist (3D lädt erst seine Figuren)
      runner.whenReady().then(() => {
        if (cancelled) return;
        runner.start();
        runner.pushHud();
        setReady(true);
      });
      if (!run.snapshot) save();
    });
    return () => {
      cancelled = true;
      runnerRef.current?.destroy();
      runnerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Start eines Laufs
  }, []);

  // Größe folgen
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      runnerRef.current?.resize(width, height);
      const next = { compact: width < 760 || height < 520, portrait: height > width };
      setLayout((l) => (l.compact === next.compact && l.portrait === next.portrait ? l : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Kompakt: Minikarte rechts unter die HUD-Leiste legen und die Mitte (Boss, Teleporter, Meldungen) darunter bzw.
  // daneben beginnen lassen. Die Leiste hat je nach Gerät einen Abstand für die Notch — deshalb messen statt rechnen.
  const hasHud = !!hud;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const runner = runnerRef.current;
    if (!wrap || !runner) return;
    if (!layout.compact) {
      runner.setMinimap(null);
      wrap.style.removeProperty("--av-center-top");
      wrap.style.removeProperty("--av-center-side");
      return;
    }
    const bar = wrap.querySelector(".av-hud-compact");
    const barBottom = bar ? bar.offsetTop + bar.offsetHeight : 64;
    const size = layout.portrait ? 96 : 84;
    runner.setMinimap({ top: barBottom + 8, size });
    wrap.style.setProperty("--av-center-top", `${layout.portrait ? barBottom + size + 20 : barBottom + 8}px`);
    wrap.style.setProperty("--av-center-side", `${layout.portrait ? 8 : size + 24}px`);
  }, [layout, ready, hasHud]);

  const setPause = useCallback((p) => {
    if (victory || finishingRef.current) return;
    setPaused(p);
    runnerRef.current?.setPaused(p);
    if (!p) setShowStats(false);
  }, [victory]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Escape") { e.preventDefault(); setPause(!paused); }
      if (e.code === "Tab") { e.preventDefault(); setShowStats((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, setPause]);

  // Tab beim Verlassen des Fensters → automatisch Pause
  useEffect(() => {
    const onVis = () => { if (document.hidden && !paused) setPause(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [paused, setPause]);

  const saveAndQuit = async () => {
    setBusy(true);
    runnerRef.current?.destroy();
    onQuit();
  };

  const continueLoop = () => {
    setVictory(false);
    runnerRef.current?.setPaused(false);
  };

  const g = gameRef.current;
  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden bg-[#0a090d] select-none cursor-crosshair">
      {/* unten die 3D-Ansicht (unsichtbar, solange sie lädt oder die 2D-Ansicht gewählt ist), darüber die 2D-Fläche */}
      <canvas ref={canvas3dRef} className="absolute inset-0 w-full h-full" style={{ visibility: "hidden" }} />
      <canvas ref={canvasRef} className="relative block w-full h-full" />
      {ready && <Hud hud={hud} kit={kit} skin={run.skin || ""} banner={banner} touch={touch} compact={layout.compact} depthBest={depthBest} onPause={() => setPause(true)} />}
      {ready && touch && !paused && !victory && !hud?.levelUp && (
        <TouchControls runnerRef={runnerRef} hud={hud} kit={kit} onPause={layout.compact ? null : () => setPause(true)} />
      )}
      {ready && <ItemReveal reveal={currentReveal} />}
      {ready && hud?.levelUp && !paused && !victory && (
        <LevelUp offer={hud.levelUp} gold={hud.gold} onChoose={chooseUp} onReroll={reroll} compact={layout.compact} touch={touch} />
      )}

      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[var(--av-bg)]">
          <FlatSprite kind="hero" id={run.kitId} skin={run.skin || ""} size={96} animate />
          <div className="av-title text-3xl av-torch">Welt wird geladen</div>
        </div>
      )}

      {saveError && ready && (
        <div className="absolute bottom-24 left-4 av-hud-panel px-3 py-2 text-[14px] av-blood max-w-[320px]">Spielstand nicht gespeichert: {saveError}</div>
      )}

      {/* Werte (Tab) — kompakt stehen sie im Pausenmenü selbst */}
      {showStats && g && !victory && !layout.compact && (
        <div className="absolute z-30 top-1/2 right-6 -translate-y-1/2 av-block p-5 w-[340px] max-h-[80%] av-scroll">
          <h2 className="av-title text-[20px] mb-3 flex items-center gap-2"><BarChart3 size={18} className="av-torch" /> Werte</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[15px]">
            {statSheet(g.player).map(([k, v]) => (
              <React.Fragment key={k}><dt className="av-dim">{k}</dt><dd className="text-right av-num">{v}</dd></React.Fragment>
            ))}
          </dl>
          <p className="mt-4 text-[13px] av-faint">Tab schließt</p>
        </div>
      )}

      {/* Pause */}
      {paused && !victory && (
        <div className="av-overlay">
          <div className="av-block p-6 md:p-8 w-full max-w-[460px] max-h-full overflow-y-auto av-scroll">
            <h2 className="av-title text-[30px]">Pause</h2>
            {g && (
              <p className="mt-2 av-dim">
                {kit.name} · Welt {g.stageIndex + 1}{g.loop > 0 ? ` (Zyklus ${g.loop + 1}, Tiefe ${depthOf(g)})` : ""} · {fmtTime(g.time)} · Stufe {g.player.level}
              </p>
            )}
            {g && activeTwist(g) && (
              <p className="mt-2 text-[15px]"><span style={{ color: "#c39bff" }}>Wendung: {TWISTS[activeTwist(g)].name}.</span> <span className="av-dim">{TWISTS[activeTwist(g)].desc}</span></p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              <button className="av-btn" onClick={() => setPause(false)}><Play size={18} fill="currentColor" /> Weiterspielen</button>
              <button className="av-btn av-btn-stone" onClick={() => setShowStats((s) => !s)}><BarChart3 size={17} /> Werte {showStats ? "ausblenden" : "anzeigen"}</button>
              <button className="av-btn av-btn-stone" disabled={busy} onClick={saveAndQuit}><Save size={17} /> Speichern und beenden</button>
              <button className="av-btn av-btn-danger" disabled={busy} onClick={() => finish(false)}><Flag size={17} /> Lauf aufgeben und werten</button>
            </div>
            {layout.compact && showStats && g && (
              <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[15px]">
                {statSheet(g.player).map(([k, v]) => (
                  <React.Fragment key={k}><dt className="av-dim">{k}</dt><dd className="text-right av-num">{v}</dd></React.Fragment>
                ))}
              </dl>
            )}
            {layout.compact && hud && (
              <div className="mt-6">
                <h3 className="av-label mb-2">Ausrüstung</h3>
                <HudLoadout hud={hud} />
              </div>
            )}
            <SettingsPanel />
            <p className="mt-5 text-[14px] av-faint leading-relaxed">
              Gespeichert wird beim Betreten jeder Welt. Beim Fortsetzen beginnt die aktuelle Welt von vorn — mit allen Items, die du da hattest.
            </p>
          </div>
        </div>
      )}

      {/* Sieg über Thunderwing */}
      {victory && g && (
        <div className="av-overlay">
          <div className="av-block p-6 md:p-8 w-full max-w-[520px] text-center">
            <Trophy size={40} className="av-gold mx-auto" />
            <h2 className="av-title text-[34px] mt-3">Sieg!</h2>
            <p className="mt-3 av-dim leading-relaxed">
              Thunderwing ist gefallen — nach {fmtTime(g.time)}. Wie weit kommst du? Jede Welt ab jetzt zählt für die Bestenliste
              „Am weitesten gekommen“ — der Sieg bleibt dir, auch wenn du später fällst.
            </p>
            {(() => {
              const next = TWISTS[twistForLoop(g.seed, g.loop + 1)];
              return (
                <p className="mt-3 text-[15px] leading-relaxed">
                  <span style={{ color: "#c39bff" }}>Zyklus {g.loop + 2} bringt die Wendung „{next.name}“:</span> <span className="av-dim">{next.desc} Mit jeder Welt werden die Gegner schneller und treffen härter.</span>
                </p>
              );
            })()}
            {depthBest > 0 && <p className="mt-2 text-[14px] av-faint">Deine Bestmarke: Tiefe {depthBest}</p>}
            <div className="mt-6 flex flex-col gap-3">
              <button className="av-btn" onClick={continueLoop}><RotateCw size={17} /> Weiter in Zyklus {g.loop + 2}</button>
              <button className="av-btn av-btn-stone" onClick={() => finish(true)}><Trophy size={18} /> Lauf als Sieg beenden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

