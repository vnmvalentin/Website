// LightsOut.jsx — Horror-Labyrinth in der Ego-Perspektive. Eigene Hülle ohne Website-Kopfzeile:
// Hauptmenü → Spiel (three.js, lazy) → Ende. Die Spielwelt lebt in game.js, hier nur Oberfläche.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftToLine, X } from 'lucide-react';
import { drawScareFace } from './scareFace';
import { LEVELS } from './levels';
import { SYMBOLS, STROKE_ONLY, SYMBOL_NAMES } from './symbols';
import { useCoop, loadName } from './useCoop';
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
// gfx: Grafikstufe. Früher hieß das Feld „quality“ mit Vorgabe „Hoch“ — auf schwächeren Rechnern lief der Wald
// damit mit 10 fps. Das neue Feld beginnt mit „Auto“ (Stufe nach Grafikchip + Regelung nach Bildrate).
const DEFAULT_PREFS = { sensitivity: 1, volume: 0.8, softScares: reducedMotion(), gfx: 'auto' };
const QUALITY_LABELS = [['auto', 'Auto'], ['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']];

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const isTouchOnly = () => {
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
};

/**
 * Auf welchem Grafikchip zeichnet der Browser? Bei zwei Chips (Onboard + Grafikkarte) nimmt Chrome unter
 * Windows oft den Onboard-Chip — dann läuft das Spiel trotz starker Grafikkarte mit ~10 fps. Ebenso ohne
 * Hardwarebeschleunigung (Software-Zeichnen). kind: 'software' | 'onboard' | 'gpu' | 'unknown'.
 */
function detectGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return { name: '', kind: 'unknown' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // „ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x…) Direct3D11 …)“ → „NVIDIA GeForce RTX 4070“
    const name = raw.replace(/^ANGLE \([^,]*, /, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '')
      .replace(/\s*(Direct3D|OpenGL|Vulkan).*$/, '').replace(/\)$/, '').trim();
    let kind = 'gpu';
    if (/swiftshader|llvmpipe|software|basic render/i.test(raw)) kind = 'software';
    else if (/intel.*(uhd|hd graphics|iris)|radeon\(tm\) graphics|radeon graphics|vega \d|apu/i.test(raw)) kind = 'onboard';
    return { name, kind };
  } catch {
    return { name: '', kind: 'unknown' };
  }
}

/** Hinweis, wenn der Browser nicht auf der Grafikkarte zeichnet — mit dem Weg, das zu ändern. */
function GpuNote({ gpu, full = false }) {
  if (gpu.kind !== 'software' && gpu.kind !== 'onboard') return null;
  return (
    <div className="lo-warn lo-gpu">
      {gpu.kind === 'software'
        ? 'Dein Browser zeichnet ohne Grafikkarte (Hardwarebeschleunigung aus) — das Spiel ruckelt dann stark.'
        : `Dein Browser zeichnet auf dem Onboard-Grafikchip (${gpu.name}) — das Spiel ruckelt dann stark.`}
      {full && (
        <ul>
          {gpu.kind === 'software' ? (
            <li>Browser-Einstellungen → System → „Grafikbeschleunigung verwenden“ einschalten, Browser neu starten.</li>
          ) : (
            <>
              <li>Windows-Einstellungen → System → Bildschirm → Grafik → Browser hinzufügen → Optionen → „Hohe Leistung“ (deine Grafikkarte), Browser ganz neu starten.</li>
              <li>Monitorkabel an die Grafikkarte stecken, nicht an die Anschlüsse der Hauptplatine.</li>
              <li>Prüfen: Adresse <code>chrome://gpu</code> — bei „WebGL“ sollte deine Grafikkarte stehen.</li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function Settings({ prefs, setPrefs, gpu }) {
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
      <div className="lo-row">
        <span>Grafik</span>
        <div className="lo-seg">
          {QUALITY_LABELS.map(([id, label]) => (
            <button key={id} type="button" className={prefs.gfx === id ? 'is-on' : ''} onClick={() => setPrefs({ gfx: id })}>{label}</button>
          ))}
        </div>
      </div>
      {gpu?.name && <p className="lo-hint">Grafik läuft auf: <b className="lo-gpu-name">{gpu.name}</b></p>}
      {gpu && <GpuNote gpu={gpu} full />}
      <p className="lo-hint">„Auto“ wählt die Stufe passend zur Grafikkarte und senkt sie, wenn es ruckelt. Ruckelt es, sinkt außerdem die Auflösung von selbst. „Niedrig“ schaltet Schatten und Nachleuchten ab.</p>
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
      <dt>E</dt><dd>Aufheben, verstecken, benutzen (halten: drehen, einsetzen)</dd>
      <dt>0 – 9</dt><dd>Code am Zahlenschloss eingeben</dd>
      <dt>Esc</dt><dd>Pause</dd>
    </dl>
  );
}

/** Eigenes Fenster über dem Menü (Einstellungen, Koop, Steuerung). Esc oder ✕ schließt. */
function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lo-overlay lo-dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lo-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="lo-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="lo-close" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Glühbirne über dem Titel: hängt an einem Kabel vom oberen Rand. Glühfaden, Glas und der Lichtschein im
 * Hintergrund flackern im selben Takt wie der Titel (gleiche CSS-Animation, gleichzeitig gestartet).
 */
function Bulb() {
  return (
    <div className="lo-bulb" aria-hidden="true">
      <svg viewBox="0 0 80 132" width="80" height="132">
        <defs>
          <radialGradient id="lo-bulb-glow" cx="50%" cy="58%" r="55%">
            <stop offset="0%" stopColor="#fff1c8" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffcf7a" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffb347" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        {/* Fassung mit Gewinde */}
        <rect x="27" y="0" width="26" height="24" rx="2" fill="#2e2a24" />
        {[5, 10, 15, 20].map((y) => <rect key={y} x="27" y={y} width="26" height="1.6" fill="#4a443a" />)}
        <path d="M30 24 C30 38 13 50 13 76 A27 27 0 0 0 67 76 C67 50 50 38 50 24 Z" fill="rgba(210,200,180,0.06)" stroke="rgba(230,220,200,0.28)" strokeWidth="1.2" />
        {/* aus: dunkler Glühfaden */}
        <path d="M35 26 L35 60 M45 26 L45 60 M35 60 l2.5 -5 l2.5 5 l2.5 -5 l2.5 5" fill="none" stroke="#5a4c36" strokeWidth="1.4" />
        {/* an: warmes Glas + glühender Faden */}
        <g className="lo-bulb-lit">
          <path d="M30 24 C30 38 13 50 13 76 A27 27 0 0 0 67 76 C67 50 50 38 50 24 Z" fill="url(#lo-bulb-glow)" />
          <path d="M35 60 l2.5 -5 l2.5 5 l2.5 -5 l2.5 5" fill="none" stroke="#fff6dc" strokeWidth="1.8" />
        </g>
      </svg>
    </div>
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

/** Zeichen vom Zahlenschloss (symbols.js) als kleines Bild */
function SymbolIcon({ id }) {
  const stroke = STROKE_ONLY.has(id);
  return (
    <svg className="lo-sym" viewBox="0 0 100 100" aria-label={SYMBOL_NAMES[id]} role="img">
      <path d={SYMBOLS[id]} fillRule="evenodd" fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 10 : 0} strokeLinecap="round" />
    </svg>
  );
}

function Hud({ hud }) {
  if (!hud) return null;
  return (
    <>
      <div className="lo-goal">
        <span>{hud.goal}</span>
        {hud.sub && <i>{hud.sub}</i>}
        {hud.notes?.length > 0 && (
          <div className="lo-notes" title="Gefundene Schnitzereien">
            {hud.notes.map((n) => <span key={n.id}><SymbolIcon id={n.id} />{n.digit}</span>)}
          </div>
        )}
      </div>
      {hud.code?.active && (
        <div className="lo-code">
          <div className="lo-code-row">
            {hud.code.order.map((id, i) => (
              <div key={id} className="lo-code-cell">
                <SymbolIcon id={id} />
                <b>{hud.code.entered[i] ?? '·'}</b>
              </div>
            ))}
          </div>
          <small>Ziffern tippen · Rücktaste löscht</small>
        </div>
      )}
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
      {hud.team && (
        <ul className="lo-team">
          {hud.team.map((m, i) => (
            <li key={i} className={m.alive ? '' : 'is-out'}>{m.name}{m.left ? ' — weg' : m.alive ? '' : ' — erwischt'}</li>
          ))}
        </ul>
      )}
      {hud.spectating && <div className="lo-spectate">Du schaust <b>{hud.spectating}</b> zu · <kbd>Leertaste</kbd> wechseln</div>}
      {hud.hidden && <div className="lo-slats" />}
    </>
  );
}

const SEAT_COLORS = ['#34485e', '#5e3434', '#365e40', '#5e5432'];

/** Warteraum der Koop-Runde: Name, Raum erstellen/beitreten, Spielerliste, Host wählt die Ebene. */
function CoopLobby({ coop }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [level, setLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const { room } = coop;
  const copy = () => {
    try {
      navigator.clipboard?.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ohne Zwischenablage */ }
  };
  return (
    <div className="lo-coop">
      <div>
        <p className="lo-lead">Zu zweit bis zu viert. Schwerer als allein: mehr Aufgaben, und das Ding ist schneller und wacher. Wer erwischt wird, schaut den anderen zu.</p>
        {!room ? (
          <div className="lo-coop-form">
            <label className="lo-field">
              <span>Dein Name</span>
              <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </label>
            <div className="lo-menu-actions">
              <button type="button" className="lo-btn is-primary is-big" disabled={coop.busy} onClick={() => coop.create(name)}>Raum erstellen</button>
            </div>
            <div className="lo-join">
              <input value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE"
                onKeyDown={(e) => { if (e.key === 'Enter') coop.join(code, name); }} aria-label="Raumcode" />
              <button type="button" className="lo-btn" disabled={coop.busy} onClick={() => coop.join(code, name)}>Beitreten</button>
            </div>
          </div>
        ) : (
          <div className="lo-room">
            <p className="lo-room-code">
              Raumcode <b>{room.code}</b>
              <button type="button" className="lo-btn is-small" onClick={copy}>{copied ? 'Kopiert' : 'Kopieren'}</button>
            </p>
            <ul className="lo-players">
              {room.players.map((p) => (
                <li key={p.seat}>
                  <i style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
                  <span>{p.name}{p.seat === coop.mySeat ? ' (du)' : ''}</span>
                  {p.seat === room.hostSeat && <em>Host</em>}
                  {!p.connected && <em>getrennt</em>}
                </li>
              ))}
            </ul>
            {coop.isHost ? (
              <>
                <div className="lo-row">
                  <span>Ebene</span>
                  <div className="lo-seg is-wrap">
                    {LEVELS.map((l, i) => (
                      <button key={l.id} type="button" className={level === i ? 'is-on' : ''} onClick={() => setLevel(i)}>
                        {i + 1} · {l.title.replace(/^(Der|Die) /, '')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lo-menu-actions">
                  <button type="button" className="lo-btn is-primary is-big" onClick={() => coop.startLevel(level)}>
                    {room.players.length < 2 ? 'Allein starten' : 'Starten'}
                  </button>
                </div>
              </>
            ) : (
              <p className="lo-note">Warte auf den Host …</p>
            )}
            <p className="lo-note">Code an Freunde schicken — sie öffnen Lights Out, wählen „Koop“ und treten bei.</p>
          </div>
        )}
        {coop.error && <p className="lo-warn">{coop.error}</p>}
        {room && <div className="lo-actions"><button type="button" className="lo-btn" onClick={() => coop.leave()}>Raum verlassen</button></div>}
      </div>
    </div>
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
  const [dialog, setDialog] = useState(null); // settings | coop | controls
  const [gpu] = useState(detectGpu);
  const [worldReady, setWorldReady] = useState(false);
  const [pending, setPending] = useState(null);
  // Koop: Start-Nutzlast der laufenden Koop-Runde (Ebene, Seed) bzw. null
  const [coopRun, setCoopRun] = useState(null);
  const coopRunRef = useRef(null);
  const screenRef = useRef('menu');
  screenRef.current = screen;
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
      gameRef.current?.setQuality?.(next.gfx);
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
  const startRef = useRef(start);
  startRef.current = start;

  const coop = useCoop({
    gameRef,
    onStart: (payload, net) => {
      coopRunRef.current = payload;
      setCoopRun(payload);
      // Direkter Übergang, wenn schon gespielt wird (nächste Ebene, Neustart) — sonst mit Startfenster
      const running = screenRef.current === 'game' && !!gameRef.current;
      startRef.current(payload.level, 0, false, { autoplay: running, net, seed: payload.seed });
    },
    onLobby: () => {
      stopGame();
      coopRunRef.current = null;
      setCoopRun(null);
      setFading(false);
      setScreen('menu');
      setDialog('coop');
    },
  });
  const coopRef = useRef(coop);
  coopRef.current = coop;

  useEffect(() => {
    if (!pending || screen !== 'game') return;
    const stage = stageRef.current;
    if (!stage) return;
    setPending(null);
    const { mod, level, total, full, autoplay, intro, net, seed } = pending;
    if (!hostRef.current) hostRef.current = mod.createHost(stage);
    if (!hostRef.current) { setScreen('nogl'); return; }
    stopGame();
    const seedParam = Number(new URLSearchParams(window.location.search).get('seed')) || undefined;
    const game = mod.createGame(hostRef.current, { ...prefsRef.current, quality: prefsRef.current.gfx, level, seed: seed ?? seedParam, autoplay, intro, net }, {
      onHud: setHud,
      onPause: setPaused,
      onFade: setFading,
      onScare: (s) => setScare(s),
      onEnd: (r) => {
        setScare(null);
        if (net) {
          // Koop: Weiter bzw. Neustart bestimmt der Host (alle laden auf sein Startsignal hin)
          const c = coopRef.current;
          const next = r.level + 1;
          if (r.result === 'escaped' && next < LEVELS.length) {
            setReached((old) => { const val = Math.max(old, next); writeJson(PROGRESS_KEY, { level: val }); return val; });
            setFading(true);
            if (c.isHost) setTimeout(() => coopRef.current.startLevel(next), 900);
            return;
          }
          setResult(r);
          setScreen('end');
          // Alle erwischt: dieselbe Karte noch einmal
          if (r.result === 'wiped' && c.isHost) setTimeout(() => coopRef.current.startLevel(r.level, r.seed), 3500);
          return;
        }
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
    // „Los“ erst, wenn alles geladen und vorgewärmt ist; beim Ebenenwechsel bleibt es bis dahin schwarz
    setWorldReady(false);
    game.whenReady().then(() => {
      if (gameRef.current !== game) return;
      setWorldReady(true);
      if (autoplay) setFading(false);
    });
    setDialog(null);
  }, [pending, screen, start, stopGame]);

  const resume = () => gameRef.current?.play();

  const toMenu = () => {
    stopAll();
    setFading(false);
    if (coopRunRef.current || coop.room) coop.leave();
    coopRunRef.current = null;
    setCoopRun(null);
    setScreen('menu');
  };

  const current = LEVELS[run.level];
  const finished = screen === 'end' && result?.result === 'escaped';
  const cinematic = !!hud?.cinematic;

  return (
    <div className="lo-root">
      {(screen === 'game' || screen === 'end') && (
        <div className="lo-stage" ref={stageRef} onClick={() => { if (paused && screen === 'game' && !scare && (hud || worldReady)) resume(); }} />
      )}
      {screen === 'game' && !cinematic && <div className="lo-vignette" />}
      {screen === 'game' && !paused && !scare && !cinematic && <Hud hud={hud} />}
      {screen === 'game' && !paused && cinematic && <p className="lo-skip"><kbd>Leertaste</kbd> überspringen</p>}
      {scare && <Jumpscare soft={scare.soft} />}
      <div className={`lo-fade${fading ? ' is-on' : ''}`} />

      {screen === 'game' && paused && !scare && !loading && (
        <div className="lo-overlay">
          <div className="lo-panel">
            <p className="lo-kicker">Ebene {run.level + 1} von {LEVELS.length}{coopRun ? ' · Koop' : ''}</p>
            <h2>{hud && !cinematic ? 'Pause' : current.title}</h2>
            {!(hud && !cinematic) && <p className="lo-lead">{current.intro}</p>}
            {coopRun && <p className="lo-lead is-warn">Koop: Die Welt läuft weiter, während du hier stehst.</p>}
            <Controls />
            <Settings prefs={prefs} setPrefs={setPrefs} gpu={gpu} />
            <div className="lo-actions">
              <button type="button" className="lo-btn is-primary" disabled={!hud && !worldReady} onClick={resume}>
                {hud ? 'Weiter' : worldReady ? 'Los' : 'Lädt …'}
              </button>
              <button type="button" className="lo-btn" onClick={toMenu}>{coopRun ? 'Raum verlassen' : 'Hauptmenü'}</button>
            </div>
            <p className="lo-note">Kopfhörer empfohlen — Geräusche verraten, wo etwas ist.</p>
          </div>
        </div>
      )}

      {screen === 'menu' && (
        <div className="lo-menu">
          <div className="lo-menu-light" aria-hidden="true" />
          <Link to="/fun" className="lo-back" title="Zurück zur Website"><ArrowLeftToLine size={17} />Website</Link>
          <div className="lo-menu-inner is-center">
            <Bulb />
            <h1 className="lo-title">Lights Out</h1>
            <p className="lo-tagline">Ein Wald, ein Haus, ein Keller, ein Garten. Und in jedem etwas, das im Dunkeln wartet.</p>
            {touchOnly ? (
              <p className="lo-warn">Dieses Spiel braucht Maus und Tastatur. Öffne es am Computer.</p>
            ) : (
              <div className="lo-menu-list">
                <button type="button" className="lo-btn is-primary is-big" onClick={() => start(0, 0, true, { intro: true })}>Neues Spiel</button>
                {reached > 0 && (
                  <button type="button" className="lo-btn is-big" onClick={() => start(reached, 0, false)}>
                    Weiter: Ebene {reached + 1} · {LEVELS[reached].title}
                  </button>
                )}
                <button type="button" className="lo-btn is-big" onClick={() => { coop.setError(''); setDialog('coop'); }}>Koop · 2–4 Spieler</button>
                <div className="lo-menu-row">
                  <button type="button" className="lo-btn" onClick={() => setDialog('settings')}>Einstellungen</button>
                  <button type="button" className="lo-btn" onClick={() => setDialog('controls')}>Steuerung</button>
                </div>
              </div>
            )}
            <GpuNote gpu={gpu} />
            {(gpu.kind === 'software' || gpu.kind === 'onboard') && (
              <button type="button" className="lo-btn is-small" onClick={() => setDialog('settings')}>So stellst du auf die Grafikkarte um</button>
            )}
            {best > 0 && <p className="lo-best">Schnellster Durchgang (alle Ebenen): {mmss(best)}</p>}
            <p className="lo-warn-small">
              Enthält Schreckmomente, plötzliche laute Geräusche und flackerndes Licht.
              Unter Einstellungen lässt sich das abschwächen.
            </p>
          </div>
          {dialog === 'settings' && <Dialog title="Einstellungen" onClose={() => setDialog(null)}><Settings prefs={prefs} setPrefs={setPrefs} gpu={gpu} /></Dialog>}
          {dialog === 'controls' && <Dialog title="Steuerung" onClose={() => setDialog(null)}><Controls /></Dialog>}
          {dialog === 'coop' && <Dialog title="Koop" onClose={() => setDialog(null)}><CoopLobby coop={coop} /></Dialog>}
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

      {screen === 'end' && result && coopRun && (
        <div className="lo-overlay is-end">
          <div className="lo-panel">
            <p className="lo-kicker">Koop · Ebene {result.level + 1} · {LEVELS[result.level].title}</p>
            <h2 className={finished ? 'is-win' : 'is-dead'}>{finished ? 'Entkommen' : 'Alle erwischt'}</h2>
            <p className="lo-lead">
              {finished ? 'Ihr habt es zusammen geschafft — alle Ebenen.' : 'Die Ebene beginnt gleich von vorn, gleiche Karte.'}
            </p>
            <div className="lo-actions">
              {finished && coop.isHost && (
                <>
                  <button type="button" className="lo-btn is-primary" onClick={() => coop.startLevel(0)}>Nochmal von vorn</button>
                  <button type="button" className="lo-btn" onClick={() => coop.backToLobby()}>Zum Warteraum</button>
                </>
              )}
              {finished && !coop.isHost && <p className="lo-note">Der Host entscheidet, wie es weitergeht.</p>}
              <button type="button" className="lo-btn" onClick={toMenu}>Raum verlassen</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'end' && result && !coopRun && (
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
