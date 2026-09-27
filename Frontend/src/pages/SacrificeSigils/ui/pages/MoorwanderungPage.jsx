// ui/pages/MoorwanderungPage.jsx — Einstieg in die Moorwanderung (/sacrifice-and-sigils/moorwanderung):
// Tisch öffnen (online), mit Code beitreten, oder üben gegen 1–5 KI-Mitspieler (alles im Browser).
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, DoorOpen, Bot } from "lucide-react";
import SEO from "../../../../components/SEO";
import { useRunLocal } from "../../net/useRunLocal.js";
import { RUN_DEFAULTS, normalizeRunSettings } from "../../engine/modes/moorwanderung/run.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { usePrefs, setPrefs } from "../prefs.js";
import RunGame from "../run/RunGame.jsx";
import { sound } from "../../audio/sound.js";
import { de } from "../../i18n/de.js";

function randomSeed() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Nur Dev-Build: fester Run-Stand für Screenshots (?fixture=…&players=n&zirkel=…), KI steht still. */
function FixtureRun({ name, players, zirkel }) {
  const [state, setState] = useState(/** @type {any} */ (null));
  useEffect(() => {
    import("../dev/runFixtures.js").then((m) => {
      const s = m.buildRunFixture(name, { players, zirkel });
      setState({ s, events: m.fixtureEvents(name, s) });
    });
  }, [name, players, zirkel]);
  if (!state) return <p className="text-center ss-dim py-20">Fixture wird gebaut …</p>;
  const s = state.s;
  return <LocalRun config={{ seed: s.seed, settings: s.settings, name: s.players[0].name, bots: s.players.length - 1, initialState: s, initialEvents: state.events, aiEnabled: false }} onExit={() => {}} />;
}

function LocalRun({ config, onExit }) {
  const game = useRunLocal(config);
  return <RunGame game={game} onExit={onExit} />;
}

export default function MoorwanderungPage() {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name || "");
  const [mode, setMode] = useState(/** @type {null|"join"|"practice"} */ (null));
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState(/** @type {"easy"|"normal"|"hard"} */ ("normal"));
  const [settings, setSettings] = useState({ ...RUN_DEFAULTS });
  const [config, setConfig] = useState(/** @type {any} */ (null));
  const params = import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const fixture = params?.get("fixture");

  if (fixture) return <FixtureRun name={fixture} players={Number(params.get("players")) || 4} zirkel={params.get("zirkel") || "moor"} />;
  if (config) return <LocalRun key={config.seed} config={config} onExit={() => setConfig(null)} />;

  const needName = () => {
    const n = name.trim();
    if (!n) {
      setErr("Wie heißt du, Zeichner?");
      sound.play("error");
      return null;
    }
    setPrefs({ name: n.slice(0, 24) });
    return n;
  };

  const items = [
    { key: "create", icon: Users, label: "Tisch öffnen", sub: "Raum für 2–6 Zeichner, Link teilen", onClick: () => { if (needName()) navigate("/sacrifice-and-sigils/moorwanderung/neu"); } },
    { key: "join", icon: DoorOpen, label: de.ui.join, sub: "Mit einem Code an den Tisch", onClick: () => setMode("join") },
    { key: "practice", icon: Bot, label: "Üben gegen KI-Mitspieler", sub: "Du und 1–5 KI-Zeichner, alles im Browser", onClick: () => setMode("practice") },
  ];

  const join = (e) => {
    e.preventDefault();
    if (!needName()) return;
    const c = code.trim().toUpperCase();
    if (!/^W[A-Z0-9]{5}$/.test(c)) {
      setErr("Codes der Moorwanderung beginnen mit W und haben sechs Zeichen.");
      return;
    }
    navigate(`/sacrifice-and-sigils/moorwanderung/${c}`);
  };

  const start = () => {
    const n = needName();
    if (!n) return;
    sound.play("seal");
    setConfig({ seed: randomSeed(), settings: normalizeRunSettings({ ...settings, players: bots + 1 }), name: n, bots, aiLevel: level });
  };

  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8 md:py-12">
      <SEO title="Sacrifice & Sigils – Die Moorwanderung" description="Run-Modus für 2 bis 6 Spieler: allein durchs Moor, NPCs besiegen, Deck ausbauen, im Duell Lebenssiegel verteidigen." path="/sacrifice-and-sigils/moorwanderung" />
      <div className="grid md:grid-cols-[1.1fr_1fr] gap-10 items-start">
        <div>
          <h1 className="ss-hero-title text-5xl md:text-6xl">{de.run.title}</h1>
          <p className="mt-4 ss-dim text-lg max-w-md">{de.run.tagline}</p>
          <ul className="mt-5 space-y-2 ss-dim max-w-md list-disc pl-5">
            <li>Wähle eines von drei Startdecks und geh deinen eigenen Pfad – alle sehen dieselbe Karte.</li>
            <li>Nach den Pfaden einer Runde treten alle im Duell gegeneinander an. Wer verliert, verliert ein Lebenssiegel.</li>
            <li>Bei ungerader Zahl spielt einer gegen den Spiegelgeist oder den Moorfürsten. Wer als Letzter Siegel hat, gewinnt.</li>
          </ul>
        </div>
        <div className="ss-paper p-5 md:p-7">
          <label className="block mb-4">
            <span className="ss-title !text-[var(--ink)] text-sm">{de.ui.yourName}</span>
            <input className="ss-input mt-1" value={name} maxLength={24} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Zeichner" autoComplete="nickname" />
          </label>
          {mode === null && (
            <nav aria-label="Moorwanderung">
              {items.map((it) => (
                <button key={it.key} type="button" className="ss-menu-item" onClick={() => { sound.play("seal"); it.onClick(); }}>
                  <it.icon size={22} aria-hidden />
                  <span>{it.label}<small>{it.sub}</small></span>
                </button>
              ))}
            </nav>
          )}
          {mode === "join" && (
            <form className="space-y-4" onSubmit={join}>
              <label className="block">
                <span className="ss-title !text-[var(--ink)] text-sm">{de.ui.code}</span>
                <input className="ss-input mt-1 uppercase tracking-[0.3em] ss-num" value={code} maxLength={6} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }} placeholder="WABCDE" autoFocus />
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="ss-seal">{de.ui.join}</button>
                <button type="button" className="ss-btn" onClick={() => setMode(null)}>{de.ui.back}</button>
              </div>
            </form>
          )}
          {mode === "practice" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-sm opacity-75">KI-Mitspieler</span>
                  <select className="ss-select w-full mt-1" value={bots} onChange={(e) => setBots(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block"><span className="text-sm opacity-75">KI-Stufe</span>
                  <select className="ss-select w-full mt-1" value={level} onChange={(e) => setLevel(/** @type {any} */ (e.target.value))}>
                    <option value="easy">Leicht</option><option value="normal">Normal</option><option value="hard">Schwer</option>
                  </select>
                </label>
                <label className="block"><span className="text-sm opacity-75">{de.run.settings.zirkel}</span>
                  <select className="ss-select w-full mt-1" value={settings.zirkel} onChange={(e) => set("zirkel", e.target.value)}>
                    {Object.values(ZIRKEL).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="text-sm opacity-75">{de.run.settings.seals}</span>
                  <select className="ss-select w-full mt-1" value={settings.seals} onChange={(e) => set("seals", Number(e.target.value))}>
                    {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block"><span className="text-sm opacity-75">{de.run.settings.pathLength}</span>
                  <select className="ss-select w-full mt-1" value={settings.pathLength} onChange={(e) => set("pathLength", e.target.value)}>
                    <option value="short">kurz (4)</option><option value="normal">normal (6)</option><option value="long">lang (8)</option>
                  </select>
                </label>
                <label className="block"><span className="text-sm opacity-75">{de.run.settings.oddMode}</span>
                  <select className="ss-select w-full mt-1" value={settings.oddMode} onChange={(e) => set("oddMode", e.target.value)}>
                    <option value="mirror">Spiegelgeist</option><option value="lord">Moorfürst</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" className="ss-seal" onClick={start}>Run beginnen</button>
                <button type="button" className="ss-btn" onClick={() => setMode(null)}>{de.ui.back}</button>
              </div>
            </div>
          )}
          {err && <p className="mt-3 text-[var(--wax-red)]" role="alert">{err}</p>}
        </div>
      </div>
    </div>
  );
}
