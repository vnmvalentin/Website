// LightsOut.jsx — Horror-Labyrinth in der Ego-Perspektive. Eigene Hülle ohne Website-Kopfzeile:
// Hauptmenü → Spiel (three.js, lazy) → Ende. Die Spielwelt lebt in game.js, hier nur Oberfläche.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftToLine } from 'lucide-react';
import { drawScareFace } from './scareFace';
import { LEVELS } from './levels';
import './theme.css';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap';
const PREFS_KEY = 'lo:prefs';
const BEST_KEY = 'lo:best-run';
const PROGRESS_KEY = 'lo:progress';
const clampLevel = (n) => Math.max(0, Math.min(LEVELS.length - 1, Math.floor(Number(n) || 0)));

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privates Fenster */ }
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const DEFAULT_PREFS = { sensitivity: 1, volume: 0.8, softScares: reducedMotion() };

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const isTouchOnly = () => {
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
};

function Settings({ prefs, setPrefs }) {
  return (
    <div className="lo-settings">
      <label className="lo-row">
        <span>Mausempfindlichkeit</span>
        <input type="range" min="0.3" max="2.5" step="0.05" value={prefs.sensitivity}
          onChange={(e) => setPrefs({ sensitivity: Number(e.target.value) })} />
        <b>{prefs.sensitivity.toFixed(2)}</b>
      </label>
      <label className="lo-row">
        <span>Lautstärke</span>
        <input type="range" min="0" max="1" step="0.05" value={prefs.volume}
          onChange={(e) => setPrefs({ volume: Number(e.target.value) })} />
        <b>{Math.round(prefs.volume * 100)}</b>
      </label>
      <div className="lo-row">
        <span>Schreckmomente</span>
        <div className="lo-seg">
          <button type="button" className={!prefs.softScares ? 'is-on' : ''} onClick={() => setPrefs({ softScares: false })}>Volle Wucht</button>
          <button type="button" className={prefs.softScares ? 'is-on' : ''} onClick={() => setPrefs({ softScares: true })}>Sanft</button>
        </div>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <dl className="lo-keys">
      <dt>W A S D</dt><dd>Gehen</dd>
      <dt>Maus</dt><dd>Umsehen</dd>
      <dt>Shift</dt><dd>Rennen — laut</dd>
      <dt>C</dt><dd>Schleichen — fast lautlos (halten)</dd>
      <dt>F</dt><dd>Taschenlampe an/aus — ohne Licht gewöhnen sich die Augen</dd>
      <dt>E</dt><dd>Aufheben, verstecken, benutzen</dd>
      <dt>Esc</dt><dd>Pause</dd>
    </dl>
  );
}

/** Vollbild-Fratze. Wird einmal gezeichnet, die Bewegung macht CSS. */
function Jumpscare({ soft }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 900;
    c.height = 900;
    drawScareFace(c);
  }, []);
  return (
    <div className={`lo-scare${soft ? ' is-soft' : ''}`}>
      <canvas ref={ref} />
    </div>
  );
}

function Hud({ hud }) {
  if (!hud) return null;
  return (
    <>
      <div className="lo-goal">
        <span>{hud.goal}</span>
        {hud.sub && <i>{hud.sub}</i>}
      </div>
      {hud.message && <div className="lo-message" key={hud.message}>{hud.message}</div>}
      {!hud.hidden && <div className="lo-cross" />}
      {hud.prompt && (
        <div className="lo-prompt">
          <kbd>E</kbd>{hud.prompt}
          {hud.hold > 0 && <span className="lo-hold"><span style={{ width: `${hud.hold * 100}%` }} /></span>}
        </div>
      )}
      <div className="lo-meters">
        <div className={`lo-meter${hud.battery < 20 ? ' is-low' : ''}`}>
          <span>Licht {hud.light ? '' : '(aus)'}</span>
          <div><i style={{ width: `${hud.battery}%` }} /></div>
        </div>
        <div className={`lo-meter${hud.exhausted ? ' is-low' : ''}`}>
          <span>Ausdauer{hud.sneaking ? ' · schleichst' : ''}</span>
          <div><i style={{ width: `${hud.stamina}%` }} /></div>
        </div>
      </div>
      <div className="lo-time">{mmss(hud.time)}</div>
      {hud.hidden && <div className="lo-slats" />}
    </>
  );
}

export default function LightsOut() {
  const [prefs, setPrefsState] = useState(() => readJson(PREFS_KEY, DEFAULT_PREFS));
  const [best, setBest] = useState(() => readJson(BEST_KEY, { time: 0 }).time || 0);
  // Bis wohin man schon gekommen ist — im Menü lässt sich dort weitermachen
  const [reached, setReached] = useState(() => clampLevel(readJson(PROGRESS_KEY, { level: 0 }).level));
  const [screen, setScreen] = useState('menu'); // menu | game | end | nogl
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(true);
  const [hud, setHud] = useState(null);
  const [scare, setScare] = useState(null);
  const [result, setResult] = useState(null);
  const [run, setRun] = useState({ level: 0, total: 0, full: true });
  const [showSettings, setShowSettings] = useState(false);
  const [pending, setPending] = useState(null);
  const stageRef = useRef(null);
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const touchOnly = isTouchOnly();

  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      writeJson(PREFS_KEY, next);
      gameRef.current?.setSensitivity(next.sensitivity);
      gameRef.current?.setVolume(next.volume);
      return next;
    });
  }, []);

  const stopGame = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
  }, []);
  /** Alles abbauen, auch Zeichenfläche und Ton (zurück ins Menü, Seite verlassen). */
  const stopAll = useCallback(() => {
    stopGame();
    hostRef.current?.dispose();
    hostRef.current = null;
  }, [stopGame]);
  useEffect(() => stopAll, [stopAll]);

  /**
   * Startet eine Ebene. total = Zeit der bisher geschafften Ebenen in diesem Durchgang,
   * full = Durchgang hat bei Ebene 1 begonnen (nur dann zählt die Gesamtzeit als Bestzeit).
   * how.autoplay = direkter Übergang aus der vorigen Ebene, how.intro = Anfahrt im Auto.
   */
  const start = useCallback(async (level, total = 0, full = level === 0, how = {}) => {
    setResult(null);
    setScare(null);
    setHud(null);
    // Neue Ebene beginnt pausiert — außer beim direkten Übergang (vorher blieb "läuft" vom letzten Spiel stehen)
    if (!how.autoplay) setPaused(true);
    setRun({ level, total, full });
    setLoading(true);
    let mod;
    try {
      mod = await import('./game');
    } catch {
      setLoading(false);
      setScreen('nogl');
      return;
    }
    setLoading(false);
    // Erzeugt wird das Spiel im Effekt unten, sobald die Bühne wirklich im DOM steht
    // (ein requestAnimationFrame kam auf langsamen Rechnern vor dem Rendern dran — dann startete nichts)
    setPending({ mod, level, total, full, ...how });
    setScreen('game');
  }, []);

  useEffect(() => {
    if (!pending || screen !== 'game') return;
    const stage = stageRef.current;
    if (!stage) return;
    setPending(null);
    const { mod, level, total, full, autoplay, intro } = pending;
    if (!hostRef.current) hostRef.current = mod.createHost(stage);
    if (!hostRef.current) { setScreen('nogl'); return; }
    stopGame();
    const seedParam = Number(new URLSearchParams(window.location.search).get('seed')) || undefined;
    const game = mod.createGame(hostRef.current, { ...prefsRef.current, level, seed: seedParam, autoplay, intro }, {
      onHud: setHud,
      onPause: setPaused,
      onFade: setFading,
      onScare: (s) => setScare(s),
      onEnd: (r) => {
        setScare(null);
        if (r.result !== 'escaped') {
          setResult(r);
          setScreen('end');
          return;
        }
        const next = r.level + 1;
        if (next < LEVELS.length) {
          setReached((old) => {
            const val = Math.max(old, next);
            writeJson(PROGRESS_KEY, { level: val });
            return val;
          });
          // Direkter Übergang: abblenden, nächste Ebene laden, aufblenden — kein Zwischenbildschirm
          setFading(true);
          setTimeout(() => start(next, total + r.time, full, { autoplay: true }), 900);
          return;
        }
        setResult(r);
        const sum = total + r.time;
        if (full) {
          setBest((old) => {
            if (old && old <= sum) return old;
            writeJson(BEST_KEY, { time: sum });
            return sum;
          });
        }
        setScreen('end');
      },
    });
    gameRef.current = game;
    if (import.meta.env.DEV) window.__lo = game;
    if (autoplay) setTimeout(() => setFading(false), 150);
  }, [pending, screen, start, stopGame]);

  const resume = () => gameRef.current?.play();

  const toMenu = () => {
    stopAll();
    setFading(false);
    setScreen('menu');
  };

  const current = LEVELS[run.level];
  const finished = screen === 'end' && result?.result === 'escaped';
  const cinematic = !!hud?.cinematic;

  return (
    <div className="lo-root">
      {(screen === 'game' || screen === 'end') && (
        <div className="lo-stage" ref={stageRef} onClick={() => { if (paused && screen === 'game' && !scare) resume(); }} />
      )}
      {screen === 'game' && !cinematic && <div className="lo-vignette" />}
      {screen === 'game' && !paused && !scare && !cinematic && <Hud hud={hud} />}
      {screen === 'game' && !paused && cinematic && <p className="lo-skip"><kbd>Leertaste</kbd> überspringen</p>}
      {scare && <Jumpscare soft={scare.soft} />}
      <div className={`lo-fade${fading ? ' is-on' : ''}`} />

      {screen === 'game' && paused && !scare && !loading && (
        <div className="lo-overlay">
          <div className="lo-panel">
            <p className="lo-kicker">Ebene {run.level + 1} von {LEVELS.length}</p>
            <h2>{hud && !cinematic ? 'Pause' : current.title}</h2>
            {!(hud && !cinematic) && <p className="lo-lead">{current.intro}</p>}
            <Controls />
            <Settings prefs={prefs} setPrefs={setPrefs} />
            <div className="lo-actions">
              <button type="button" className="lo-btn is-primary" onClick={resume}>{hud ? 'Weiter' : 'Los'}</button>
              <button type="button" className="lo-btn" onClick={toMenu}>Hauptmenü</button>
            </div>
            <p className="lo-note">Kopfhörer empfohlen — Geräusche verraten, wo etwas ist.</p>
          </div>
        </div>
      )}

      {screen === 'menu' && (
        <div className="lo-menu">
          <Link to="/fun" className="lo-back" title="Zurück zur Website"><ArrowLeftToLine size={17} />Website</Link>
          <div className="lo-menu-inner">
            <h1 className="lo-title">Lights Out</h1>
            <p className="lo-tagline">Ein Wald, ein Haus, ein Keller. Und in jedem etwas, das im Dunkeln wartet.</p>
            {touchOnly ? (
              <p className="lo-warn">Dieses Spiel braucht Maus und Tastatur. Öffne es am Computer.</p>
            ) : (
              <div className="lo-menu-actions">
                <button type="button" className="lo-btn is-primary is-big" onClick={() => start(0, 0, true, { intro: true })}>Neues Spiel</button>
                {reached > 0 && (
                  <button type="button" className="lo-btn is-big" onClick={() => start(reached, 0, false)}>
                    Weiter: Ebene {reached + 1} · {LEVELS[reached].title}
                  </button>
                )}
                <button type="button" className="lo-btn" onClick={() => setShowSettings((v) => !v)}>
                  {showSettings ? 'Einstellungen schließen' : 'Einstellungen'}
                </button>
              </div>
            )}
            {showSettings && <Settings prefs={prefs} setPrefs={setPrefs} />}
            {best > 0 && <p className="lo-best">Schnellster Durchgang (alle Ebenen): {mmss(best)}</p>}
            <p className="lo-warn-small">
              Enthält Schreckmomente, plötzliche laute Geräusche und flackerndes Licht.
              Unter Einstellungen lässt sich das abschwächen.
            </p>
          </div>
        </div>
      )}

      {loading && screen !== 'game' && <div className="lo-overlay"><p className="lo-loading">Lädt …</p></div>}

      {screen === 'nogl' && (
        <div className="lo-overlay">
          <div className="lo-panel">
            <h2>Geht hier nicht</h2>
            <p className="lo-lead">Dein Browser kann kein WebGL. Ohne läuft das Spiel leider nicht — probier einen anderen Browser oder schalte die Hardwarebeschleunigung ein.</p>
            <div className="lo-actions"><button type="button" className="lo-btn" onClick={toMenu}>Hauptmenü</button></div>
          </div>
        </div>
      )}

      {screen === 'end' && result && (
        <div className="lo-overlay is-end">
          <div className="lo-panel">
            <p className="lo-kicker">Ebene {result.level + 1} · {LEVELS[result.level].title}</p>
            <h2 className={finished ? 'is-win' : 'is-dead'}>{finished ? 'Entkommen' : 'Erwischt'}</h2>
            <p className="lo-lead">
              {finished
                ? `Alle Ebenen geschafft${run.full ? ` in ${mmss(run.total + result.time)}` : ''}.${run.full && best && run.total + result.time <= best ? ' Neue Bestzeit.' : ''}`
                : `Nach ${mmss(result.time)}. Die Ebene beginnt von vorn — die anderen bleiben geschafft.`}
            </p>
            <div className="lo-actions">
              <button type="button" className="lo-btn is-primary"
                onClick={() => (finished ? start(0, 0, true, { intro: true }) : start(result.level, run.total, run.full))}>
                {finished ? 'Neues Spiel' : 'Nochmal'}
              </button>
              <button type="button" className="lo-btn" onClick={toMenu}>Hauptmenü</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
