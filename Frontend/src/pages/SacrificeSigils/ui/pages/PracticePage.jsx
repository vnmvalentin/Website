// ui/pages/PracticePage.jsx — Übung gegen die KI (leicht/normal/schwer) oder Hotseat zu zweit an einem Gerät.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../../../../components/SEO";
import { useLocalGame } from "../../net/useLocalGame.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../engine/match.js";
import { getPrefs } from "../prefs.js";
import GameScreen from "../GameScreen.jsx";
import { de } from "../../i18n/de.js";

const LEVELS = [
  ["easy", "Leicht", "Zufällige legale Züge mit einfachen Heuristiken."],
  ["normal", "Normal", "Denkt einen Zug voraus und bewertet Waage, Brett und Ressourcen."],
  ["hard", "Schwer", "Zwei Züge voraus, draftet und wandert mit Plan."],
];

function randomSeed() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function LocalMatch({ config, onExit }) {
  const game = useLocalGame(config);
  return (
    <>
      <GameScreen game={game} onExit={onExit} />
      {game.handoff && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0c0806]/95 p-4">
          <div className="ss-paper ss-modal-box p-6 text-center max-w-md space-y-4">
            <p className="ss-title !text-[var(--ink)] text-2xl">Gerät weitergeben</p>
            <p>Jetzt ist <b>{config.names[1 - game.you]}</b> dran. Nicht auf die Hand des anderen schauen!</p>
            <button type="button" className="ss-seal" onClick={game.confirmHandoff}>Ich bin {config.names[1 - game.you]}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Nur Dev-Build: fester Spielstand für Screenshots (?fixture=…), KI steht still. */
function FixtureMatch({ name }) {
  const [state, setState] = useState(/** @type {any} */ (null));
  useEffect(() => {
    import("../dev/fixtures.js").then((m) => setState(m.buildFixture(name)));
  }, [name]);
  if (!state) return <p className="text-center ss-dim py-20">Fixture wird gebaut …</p>;
  return <LocalMatch config={{ seed: state.seed, settings: state.settings, names: state.players.map((P) => P.name), initialState: state, aiEnabled: false }} onExit={() => {}} />;
}

export default function PracticePage() {
  const navigate = useNavigate();
  const fixture = import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("fixture") : null;
  const [config, setConfig] = useState(/** @type {any} */ (null));
  const [level, setLevel] = useState("normal");
  const [hotseat, setHotseat] = useState(false);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, turnTimer: 0 });
  const [seed, setSeed] = useState("");
  const [name2, setName2] = useState("Zweiter Zeichner");
  const myName = getPrefs().name || "Zeichner";

  if (fixture) return <FixtureMatch name={fixture} />;
  if (config) return <LocalMatch key={config.seed} config={config} onExit={() => setConfig(null)} />;

  const start = () => {
    const s = (seed || randomSeed()).toUpperCase();
    const lvlName = LEVELS.find((l) => l[0] === level)[1];
    setConfig({
      seed: s,
      settings: normalizeSettings(settings),
      names: hotseat ? [myName, name2 || "Zweiter Zeichner"] : [myName, `KI (${lvlName})`],
      aiLevel: level,
      hotseat,
    });
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 py-8 space-y-5">
      <SEO title="Sacrifice & Sigils – Übung gegen die KI" description="Übe Sacrifice & Sigils gegen die KI in drei Stufen oder spiele zu zweit an einem Gerät." path="/sacrifice-and-sigils/uebung" noindex />
      <div className="ss-paper p-5 md:p-7 space-y-5">
        <p className="ss-title !text-[var(--ink)] text-3xl">{de.ui.practice}</p>
        <div className="flex gap-2">
          <button type="button" className={`ss-btn ${!hotseat ? "!text-[var(--candle)]" : ""}`} onClick={() => setHotseat(false)}>Gegen die KI</button>
          <button type="button" className={`ss-btn ${hotseat ? "!text-[var(--candle)]" : ""}`} onClick={() => setHotseat(true)}>Hotseat (zu zweit)</button>
        </div>
        {!hotseat ? (
          <div className="grid sm:grid-cols-3 gap-3">
            {LEVELS.map(([id, name, desc]) => (
              <button key={id} type="button" onClick={() => setLevel(id)} className={`ss-panel p-4 text-left text-[var(--bone)] ${level === id ? "!border-[var(--wax-red-light)]" : ""}`}>
                <p className="ss-title text-lg">{name}</p>
                <p className="text-sm ss-dim">{desc}</p>
              </button>
            ))}
          </div>
        ) : (
          <label className="block">
            <span className="text-sm opacity-75">Name des zweiten Zeichners</span>
            <input className="ss-input mt-1" value={name2} maxLength={24} onChange={(e) => setName2(e.target.value)} />
          </label>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm opacity-75">Draft-Modus</span>
            <select className="ss-select w-full mt-1" value={settings.draftMode} onChange={(e) => setSettings({ ...settings, draftMode: e.target.value })}>
              <option value="shared">Gemeinsamer Pool</option><option value="separate">Getrennte Pools</option>
            </select>
          </label>
          <label className="block"><span className="text-sm opacity-75">Siege nötig</span>
            <select className="ss-select w-full mt-1" value={settings.winsNeeded} onChange={(e) => setSettings({ ...settings, winsNeeded: Number(e.target.value) })}>
              <option value={1}>1 (Best-of-1)</option><option value={2}>2 (Best-of-3)</option><option value={3}>3 (Best-of-5)</option>
            </select>
          </label>
          <label className="block"><span className="text-sm opacity-75">Pfad-Länge</span>
            <select className="ss-select w-full mt-1" value={settings.pathLength} onChange={(e) => setSettings({ ...settings, pathLength: Number(e.target.value) })}>
              <option value={2}>kurz (2)</option><option value={3}>normal (3)</option><option value={4}>lang (4)</option>
            </select>
          </label>
          <label className="block"><span className="text-sm opacity-75">{de.ui.seed}</span>
            <input className="ss-input mt-1 uppercase" value={seed} placeholder={de.ui.randomSeed} maxLength={24} onChange={(e) => setSeed(e.target.value.toUpperCase())} />
          </label>
        </div>
        <div className="flex gap-3">
          <button type="button" className="ss-seal" onClick={start}>Spiel beginnen</button>
          <button type="button" className="ss-btn" onClick={() => navigate("/sacrifice-and-sigils")}>{de.ui.back}</button>
        </div>
      </div>
    </div>
  );
}
