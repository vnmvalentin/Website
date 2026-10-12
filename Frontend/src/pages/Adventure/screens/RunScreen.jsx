// screens/RunScreen.jsx — ein laufendes Spiel: Canvas + HUD + Pause/Werte/Sieg. Speichert am Anfang jeder Welt einen
// Spielstand (Fortsetzen startet die Welt neu) und meldet das Ende an den Server.
//
// Tasten hier (alles andere in render/runner.js): Esc = Pause, Tab = Werte ein/aus.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Save, Flag, BarChart3, Trophy, RotateCw } from "lucide-react";
import { createGame, snapshotGame } from "../engine/game.js";
import { statSheet } from "../engine/stats.js";
import GameRunner from "../render/runner.js";
import Hud from "../hud/Hud.jsx";
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
    <button className="av-seg-btn text-[15px]" aria-pressed={s[key]} onClick={() => updateSettings({ [key]: !s[key] })}>{label}</button>
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
    </div>
  );
}

export default function RunScreen({ run, onFinished, onQuit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const runnerRef = useRef(null);
  const gameRef = useRef(null);
  const finishingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState(null);
  const [reveals, setReveals] = useState([]); // Warteschlange: aufgehobene Items, das erste wird gezeigt
  const [banner, setBanner] = useState(null);
  const [paused, setPaused] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [victory, setVictory] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [busy, setBusy] = useState(false);
  const kit = KITS[run.kitId] || KITS.default;

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
        canvas: canvasRef.current, game, skin: run.skin || "",
        onHud: setHud,
        onEvents: (evs) => {
          for (const ev of evs) {
            eventSound(ev, game);
            const stop = getSettings().hitstop ? HITSTOP_S : 0;
            if (ev.type === "item") { runner.hitstop(stop); pushReveal({ kind: "item", id: ev.id, count: ev.count }); }
            else if (ev.type === "equipment") { game.seenEquipment.add(ev.id); runner.hitstop(stop); pushReveal({ kind: "equipment", id: ev.id }); }
            else if (ev.type === "levelChoice") runner.pushHud();
            else if (ev.type === "hordeEvent") {
              if (ev.kind === "blood") showBanner("Blutmond", "30 Sekunden lang kommen dreimal so viele Gegner", "#ff5a4a", 3000);
              else if (ev.kind === "ring") showBanner("Eingekreist!", "Schlag dir eine Lücke frei", "#ff7a5a", 2600);
              else if (ev.kind === "champion") showBanner("Ein Champion erscheint", ev.name.replace("Champion: ", ""), "var(--av-gold)", 2800);
            }
            else if (ev.type === "championDead") showBanner("Champion besiegt", "Beute liegt bereit", "var(--av-gold)", 2200);
            else if (ev.type === "stageStart") showBanner(ev.final ? "Gewitterhort" : ev.name, ev.final ? "Das Finale" : `${ev.loop > 0 ? `Zyklus ${ev.loop + 1} · ` : ""}Welt ${ev.index + 1}`, "var(--av-torch)");
            else if (ev.type === "stageChanged") save();
            else if (ev.type === "bossStart") showBanner(ev.name, ev.title, "#ff5a4a", 3200);
            else if (ev.type === "bossDead") showBanner(`${ev.name} besiegt`, "Beute liegt bereit", "var(--av-gold)");
            else if (ev.type === "teleReady" && !ev.final) showBanner("Teleporter bereit", "Mit E zur nächsten Welt", "var(--av-moss)");
            else if (ev.type === "message") showBanner(ev.text, null, "var(--av-dim)", 2400);
            else if (ev.type === "victory") { setVictory(true); runner.setPaused(true); }
            else if (ev.type === "gameOver") { setTimeout(() => finish(false), 1400); }
          }
        },
      });
      runnerRef.current = runner;
      const r = wrapRef.current.getBoundingClientRect();
      runner.resize(r.width, r.height);
      runner.start();
      runner.pushHud();
      setReady(true);
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
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      <canvas ref={canvasRef} className="block w-full h-full" />
      {ready && <Hud hud={hud} kit={kit} skin={run.skin || ""} banner={banner} />}
      {ready && <ItemReveal reveal={currentReveal} />}
      {ready && hud?.levelUp && !paused && !victory && (
        <LevelUp offer={hud.levelUp} gold={hud.gold} onChoose={chooseUp} onReroll={reroll} />
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

      {/* Werte (Tab) */}
      {showStats && g && !victory && (
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
          <div className="av-block p-6 md:p-8 w-full max-w-[460px]">
            <h2 className="av-title text-[30px]">Pause</h2>
            {g && (
              <p className="mt-2 av-dim">
                {kit.name} · Welt {g.stageIndex + 1}{g.loop > 0 ? ` (Zyklus ${g.loop + 1})` : ""} · {fmtTime(g.time)} · Stufe {g.player.level}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              <button className="av-btn" onClick={() => setPause(false)}><Play size={18} fill="currentColor" /> Weiterspielen</button>
              <button className="av-btn av-btn-stone" onClick={() => setShowStats((s) => !s)}><BarChart3 size={17} /> Werte {showStats ? "ausblenden" : "anzeigen"}</button>
              <button className="av-btn av-btn-stone" disabled={busy} onClick={saveAndQuit}><Save size={17} /> Speichern und beenden</button>
              <button className="av-btn av-btn-danger" disabled={busy} onClick={() => finish(false)}><Flag size={17} /> Lauf aufgeben und werten</button>
            </div>
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
              Thunderwing ist gefallen — nach {fmtTime(g.time)}. Du kannst den Lauf jetzt als Sieg werten lassen oder in den nächsten Zyklus gehen:
              alle Welten noch einmal, gemischte Gegner, mehr Beute und ein höherer Rekord.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button className="av-btn" onClick={() => finish(true)}><Trophy size={18} /> Lauf als Sieg beenden</button>
              <button className="av-btn av-btn-stone" onClick={continueLoop}><RotateCw size={17} /> Weiter in Zyklus {g.loop + 2}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

