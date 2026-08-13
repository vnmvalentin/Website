// Die Widgets, die im Stream zu sehen sind. Bewusst geteilt zwischen der
// Dashboard-Vorschau und der OBS-Route — so kann die Vorschau nicht von dem
// abweichen, was die Zuschauer wirklich sehen.
import React, { useEffect, useRef, useState } from 'react';
import './overlayWidgets.css';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Ab wie vielen Optionen die Vorhersage von Versus-Balken auf Liste umschaltet. */
const VERSUS_MAX_OUTCOMES = 2;

const fmt = (n) => Math.round(n || 0).toLocaleString('de-DE');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Sekunden -> "m:ss" */
function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Hex aufhellen (amt 0..1 Richtung Weiß) — für die Verläufe der Versus-Seiten */
function shade(hex, amt) {
  const h = String(hex || '#9146ff').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Kartenhintergrund aus der eingestellten Deckkraft. */
function cardStyle(module, width) {
  const alpha = clamp((module.opacity ?? 80) / 100, 0, 1);
  return { width, background: `rgba(16, 16, 20, ${alpha})` };
}

/**
 * Animiert mehrere Zahlen in EINER rAF-Schleife.
 * Bewusst nicht ein Hook pro Zahl: bei zehn Optionen wären das sonst zwanzig
 * parallele Schleifen mit je einem State-Update pro Frame.
 */
function useTweenArray(targets, ms = 650) {
  const [vals, setVals] = useState(targets);
  const current = useRef(targets);
  useEffect(() => { current.current = vals; }, [vals]);

  const key = targets.join('|');
  useEffect(() => {
    const from = current.current.length === targets.length ? current.current.slice() : targets.slice();
    if (from.every((v, i) => Math.abs(v - targets[i]) < 0.01)) { setVals(targets); return undefined; }

    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / ms, 0, 1);
      const e = 1 - (1 - p) ** 3; // ease-out-cubic
      setVals(targets.map((t, i) => from[i] + (t - from[i]) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // key fasst die Zielwerte zusammen; targets selbst ist bei jedem Render neu
  }, [key, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  return vals.length === targets.length ? vals : targets;
}

/**
 * Positioniert, skaliert und blendet ein Widget ein/aus.
 *
 * Verkleinert wird per `zoom`, nicht per `transform: scale()`. Grund ist der
 * Raid-Clip: Twitch prüft vor dem automatischen Start, ob die Einbettung
 * unverfälscht zu sehen ist, und wertet JEDE Verkleinerung per transform als
 * "nicht sichtbar" — der Clip bliebe dann mit Abspieltaste stehen. `zoom` fällt
 * nicht unter diese Prüfung und sieht Pixel für Pixel gleich aus. Verschieben
 * darf weiter transform übernehmen, daran stört sich Twitch nicht.
 *
 * Wichtig fürs Messen im Dashboard: `offsetWidth` des äußeren Elements enthält
 * den zoom des inneren bereits — dort also NICHT noch einmal mit module.scale
 * multiplizieren.
 */
export function WidgetFrame({ id, module, visible, editable, selected, onPointerDown, children }) {
  return (
    <div
      // is-invisible nimmt dem Rahmen die Mausereignisse: ein ausgeblendetes
      // Modul liegt sonst unsichtbar über einem sichtbaren und fängt dessen
      // Ziehen ab (der Raid-Clip ist groß genug, um alles darunter zu decken).
      className={`stw-widget${editable ? ' is-editable' : ''}${selected ? ' is-selected' : ''}${visible ? '' : ' is-invisible'}`}
      data-anim={module.anim}
      data-widget={id}
      style={{ transform: `translate(${Math.round(module.x)}px, ${Math.round(module.y)}px)` }}
      onMouseDown={onPointerDown}
    >
      <div className="stw-widget-scale" style={{ zoom: module.scale }}>
        <div className={`stw-widget-inner${visible ? '' : ' is-hidden'}`}>{children}</div>
      </div>
    </div>
  );
}

const TimerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="15" height="15" aria-hidden="true">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </svg>
);

function CardHead({ kicker, accent, chip, showTimer, remaining, urgent }) {
  return (
    <div className="stw-head">
      <span className="stw-kicker" style={{ color: accent }}>{kicker}</span>
      <span className={`stw-chip ${chip.cls}`}>{chip.label}</span>
      {showTimer && (
        <span className={`stw-timer${urgent ? ' is-urgent' : ''}`}>
          <TimerIcon />
          <b>{mmss(remaining)}</b>
        </span>
      )}
    </div>
  );
}

/* ── Abstimmung ─────────────────────────────────────────────────────────── */
/** Karten-Klassen inkl. der Zustände, die alle Karten teilen. */
const cardClass = (module, head) =>
  `stw-card${module.glass ? '' : ' is-flat'}${head ? '' : ' is-nohead'}`;

export function PollWidget({ data, module, width = 640 }) {
  const head = module.showHead !== false;
  const running = data.status === 'ACTIVE';
  const votes = data.choices.map((c) => c.votes || 0);
  const tweened = useTweenArray([...votes, data.totalVotes || 0]);
  const tVotes = tweened.slice(0, votes.length);
  const tTotal = tweened[tweened.length - 1];
  const maxVotes = Math.max(...votes, 0);
  const remaining = Math.max(0, data.remaining || 0);
  const frac = data.duration > 0 ? clamp(remaining / data.duration, 0, 1) : 0;
  const urgent = running && remaining <= 10;

  return (
    <div className={cardClass(module, head)} style={cardStyle(module, width)}>
      <div className="stw-progress">
        <i style={{ transform: `scaleX(${running ? frac : 0})`, background: urgent ? '#e66767' : module.accent }} />
      </div>

      {head && (
        <CardHead
          kicker="Abstimmung"
          accent={module.accent}
          chip={running ? { cls: 'live', label: 'Läuft' } : { cls: 'done', label: 'Beendet' }}
          showTimer={module.timer}
          remaining={running ? remaining : 0}
          urgent={urgent}
        />
      )}

      <h3 className="stw-title">{data.title || 'Abstimmung'}</h3>

      <div className="stw-opts">
        {data.choices.map((choice, i) => {
          const pct = tTotal > 0 ? (tVotes[i] / tTotal) * 100 : 0;
          const color = choice.color || module.accent;
          return (
            <div key={choice.id || i} className={`stw-opt${votes[i] === maxVotes && maxVotes > 0 ? ' is-lead' : ''}`}>
              <div className="stw-opt-top">
                <span className="stw-opt-key">{i + 1}</span>
                <span className="stw-opt-name">{choice.title}</span>
                <span className="stw-opt-val">
                  <b>{Math.round(pct)}</b>%<i>· {fmt(tVotes[i])}</i>
                </span>
              </div>
              <div className="stw-track">
                <div
                  className="stw-fill"
                  style={{
                    width: `${pct.toFixed(1)}%`,
                    background: `linear-gradient(180deg, ${shade(color, 0.18)}, ${color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="stw-foot">
        <span>{fmt(tTotal)} {Math.round(tTotal) === 1 ? 'Stimme' : 'Stimmen'}</span>
        <span>{data.hint || 'Im Twitch-Chat abstimmen'}</span>
      </div>
    </div>
  );
}

/* ── Ziele (Follower / Abos) ────────────────────────────────────────────── */

/** Unter dieser Höhe passt keine Schrift in den Balken. */
export const BAR_TEXT_MIN_H = 30;

/**
 * Fortschrittsbalken, in dem auf Wunsch Text steht.
 *
 * Der Text wird zweimal gerendert: einmal hell für die leere Spur und einmal
 * dunkel, per clip-path auf die Füllung beschnitten. Das ist der einzige Weg,
 * der bei JEDER vom Streamer gewählten Balkenfarbe lesbar bleibt — heller Text
 * mit Schatten säuft auf gelben oder hellgrünen Balken ab. Beide Ebenen haben
 * dieselbe Box, deshalb sitzt die dunkle Kopie pixelgenau auf der hellen.
 */
function GoalBar({ percent, color, height, left, right }) {
  const pct = clamp(percent, 0, 100);
  const inner = (
    <>
      <span className="stw-bar-l">{left}</span>
      <span className="stw-bar-r">{right}</span>
    </>
  );

  return (
    <div className="stw-track stw-goal-track" style={{ height }}>
      <div
        className="stw-fill"
        style={{ width: `${pct.toFixed(1)}%`, background: `linear-gradient(180deg, ${shade(color, 0.18)}, ${color})` }}
      />
      {(left || right) && (
        <>
          <div className="stw-bar-text" style={{ fontSize: Math.round(height * 0.42) }}>{inner}</div>
          <div
            className="stw-bar-text is-on-fill"
            style={{ fontSize: Math.round(height * 0.42), clipPath: `inset(0 ${(100 - pct).toFixed(1)}% 0 0)` }}
          >
            {inner}
          </div>
        </>
      )}
    </div>
  );
}

export function GoalWidget({ data, module, width = 460 }) {
  const [current, percent] = useTweenArray([data.reached, data.percent]);
  // 'full' = Zahl über dem Balken, 'inline' = Zahlen im Balken,
  // 'bar' = nur der Balken, Beschriftung und Zahlen darin
  const variant = module.goalLayout || 'full';
  const showPct = module.showPercent !== false;
  const height = variant === 'full'
    ? (module.barHeight ?? 14)
    : Math.max(BAR_TEXT_MIN_H, module.barHeight ?? 14);

  const counts = `${fmt(current)} / ${fmt(data.target)}`;
  const pctText = `${Math.round(percent)} %`;

  return (
    <div className={`stw-card${module.glass ? '' : ' is-flat'}`} style={cardStyle(module, width)}>
      <div className={`stw-goal is-${variant}`}>
        {variant !== 'bar' && (
          <div className="stw-goal-top">
            <span className="stw-kicker" style={{ color: module.accent }}>{data.label}</span>
            {data.done && <span className="stw-chip done">Erreicht</span>}
            {showPct && variant === 'full' && <span className="stw-goal-pct">{pctText}</span>}
          </div>
        )}

        {variant === 'full' && (
          <>
            {data.note && <div className="stw-goal-note">{data.note}</div>}
            <div className="stw-goal-count">
              <b>{fmt(current)}</b>
              <span>/ {fmt(data.target)}</span>
            </div>
          </>
        )}

        <GoalBar
          percent={percent}
          color={data.color}
          height={height}
          left={variant === 'bar' ? data.label : (variant === 'inline' ? counts : '')}
          right={variant === 'bar' ? counts : (variant === 'inline' && showPct ? pctText : '')}
        />
      </div>
    </div>
  );
}

/* ── Stream-Statistik ───────────────────────────────────────────────────── */

/** Sekunden -> "1:23:45" bzw. "23:45" unter einer Stunde. */
function uptimeText(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

/**
 * Laufzeit der Sendung. Eigene Uhr statt der des Overlays: die tickt nur,
 * solange eine Abstimmung läuft — und für eine Sekundenanzeige das ganze
 * Overlay dauerhaft neu zu rendern, wäre in OBS unnötige Dauerlast.
 */
function useUptime(startedAt, active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !startedAt) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);
  return startedAt ? (now - startedAt) / 1000 : 0;
}

/**
 * Platzbedarf einer Kennzahl nebeneinander. Die Laufzeit ist mit "1:23:45" nun
 * einmal breiter als eine Zahl — ohne diesen Aufschlag stünden die Spalten
 * schief, sobald sie mit dabei ist.
 */
const STAT_CELL_W = { uptime: 152, bits: 132 };

/** Breite der Karte, je nach Anordnung. */
function statsWidth(items, layout, centered) {
  if (layout === 'list') return 400;
  if (layout === 'column') return 300;
  const cells = items.map((i) => STAT_CELL_W[i.key] || 112);
  // Mittig heißt: alle Kästchen gleich breit. Also muss das breiteste die
  // Breite für alle vorgeben, sonst würde die Laufzeit in ihrem Kästchen ecken.
  const total = centered ? Math.max(...cells) * cells.length : cells.reduce((s, w) => s + w, 0);
  return 56 + 26 * (items.length - 1) + total;
}

export function StatsWidget({ data, module, width }) {
  const layout = module.layout === 'column' || module.layout === 'list' ? module.layout : 'row';
  // Die Liste ist von Haus aus zweispaltig (links Wort, rechts Zahl) — mittig
  // gibt es dort nichts auszurichten, auch nicht in der Kopfzeile.
  const centered = module.align !== 'left' && layout !== 'list';
  // In der Listenform steht die Beschriftung immer links neben der Zahl —
  // dafür muss sie auch im DOM vorn stehen.
  const capFirst = layout === 'list' || module.capPos !== 'bottom';

  const hasUptime = data.items.some((i) => i.key === 'uptime');
  const uptime = useUptime(data.startedAt, hasUptime);
  // Zahlen laufen weich hoch — bis auf die Laufzeit, die tickt ohnehin selbst
  const tweened = useTweenArray(data.items.map((i) => (typeof i.value === 'number' ? i.value : 0)));

  const value = (item, i) => {
    if (item.key === 'uptime') return uptimeText(uptime);
    if (item.value === null || item.value === undefined) return '–';
    return fmt(tweened[i]);
  };

  const cls = ['stw-stats', `is-${layout}`, centered ? 'is-center' : ''].filter(Boolean).join(' ');
  const head = module.showHead !== false && (!!data.label || module.liveDot !== false);

  return (
    <div className={cardClass(module, head)}
      style={cardStyle(module, width || statsWidth(data.items, layout, centered))}>
      <div className={cls}>
        {head && (
          <div className="stw-stats-head">
            {data.label && <span className="stw-kicker" style={{ color: module.accent }}>{data.label}</span>}
            {module.liveDot !== false && (
              <span className={`stw-chip ${data.live ? 'live' : ''}`}>{data.live ? 'Live' : 'Offline'}</span>
            )}
          </div>
        )}

        <div className="stw-stats-grid">
          {data.items.map((item, i) => {
            const cap = <span className="stw-stat-cap">{item.label}</span>;
            const val = <span className="stw-stat-val" style={{ color: data.color }}>{value(item, i)}</span>;
            return (
              <div key={item.key} className="stw-stat">
                {capFirst ? cap : val}
                {capFirst ? val : cap}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Clip des Raiders ───────────────────────────────────────────────────── */

/**
 * Adresse des Twitch-Einbett-Rahmens.
 *
 * Twitch verlangt die Domain der einbettenden Seite als `parent`; stimmt sie
 * nicht, bleibt der Rahmen einfach schwarz. Mehrere Angaben sind erlaubt —
 * deshalb hier (wie schon im Abspann, wo das zuverlässig läuft) alle Domains,
 * unter denen die Seite laufen kann. Sonst startet der Clip zwar auf der
 * Live-Domain, aber nicht auf localhost oder mit www davor.
 */
function clipEmbedUrl(id, muted) {
  const host = (window.location.hostname || 'localhost').toLowerCase();
  const bare = host.replace(/^www\./, '');
  const hosts = new Set([host, bare, 'localhost', 'vnmvalentin.de', 'www.vnmvalentin.de']);
  if (bare.includes('.')) hosts.add(`www.${bare}`);

  const parents = [...hosts].filter(Boolean).map((h) => `parent=${encodeURIComponent(h)}`).join('&');
  // muted wird hier zwar mitgegeben, Twitch schaltet für den automatischen Start
  // aber ohnehin selbst stumm — deshalb der Weg über die Videodatei, siehe unten.
  return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(id)}&${parents}&autoplay=true&muted=${muted}`;
}

/**
 * Zwei Wege, den Clip zu zeigen:
 *
 * 1. Die Videodatei (clip.mp4) — der Normalfall, und der einzige mit Ton. Die
 *    Twitch-Einbettung startet grundsätzlich stumm: nachgemessen mit
 *    `muted=false`, mit dem Autoplay-Flag der OBS-Browserquelle und sogar mit
 *    vorher von Hand lautgestelltem Player. Twitch schaltet für den
 *    automatischen Start selbst stumm, daran ist von außen nichts zu drehen.
 * 2. Der Einbett-Rahmen — Rückfall, wenn das Backend keine Videoadresse
 *    besorgen konnte oder die Datei nicht lädt. Läuft stumm, dafür immer.
 *
 * In OBS darf ein Video mit Ton von allein starten (die Browserquelle läuft mit
 * gelockerter Autoplay-Regel), in einem normalen Browser nicht — dort schaltet
 * der Player unten selbst auf stumm, statt stehen zu bleiben.
 *
 * Damit die Einbettung überhaupt von allein anläuft, muss sie im Moment des
 * Ladens unverfälscht sichtbar sein. Nachgemessen (Chrome): schon eine halb-
 * durchsichtige oder unscharf hinterlegte Elternebene reicht, damit der Clip mit
 * Abspieltaste stehen bleibt ("Autoplay disabled … style visibility"). Deshalb
 * bekommt die Karte keine Glas-Unschärfe, verkleinert wird per zoom statt
 * transform (siehe WidgetFrame), und der Rahmen kommt erst nach der Einblendung.
 */
const ENTER_MS = 500; // etwas mehr als die 0,45 s Einblendung der Karte

export function RaidClipWidget({ data, module, preview = false, width = 800 }) {
  const clip = data.clip;
  const videoRef = useRef(null);
  const [ended, setEnded] = useState(false);
  const [armed, setArmed] = useState(false);
  // Wird gesetzt, wenn die Videodatei nicht spielbar ist (abgelaufene Adresse)
  const [fileFailed, setFileFailed] = useState(false);

  const useFile = !!clip?.mp4 && !fileFailed;

  // Neuer Raid: Player wieder scharf machen. Nur der Einbett-Rahmen muss die
  // Einblendung abwarten, die Videodatei kann sofort loslegen.
  useEffect(() => {
    setEnded(false);
    setArmed(false);
    setFileFailed(false);
    const t = setTimeout(() => setArmed(true), ENTER_MS);
    return () => clearTimeout(t);
  }, [data.id]);

  const ready = useFile || armed;

  // Harte Bremse nach der eingestellten Spieldauer: der Player fliegt raus,
  // damit ein langer Clip nicht weiterläuft, während die Karte ausblendet.
  // Die Uhr startet mit dem Player, nicht mit der Karte.
  useEffect(() => {
    if (preview || data.demo || !clip || !ready) return undefined;
    const t = setTimeout(() => setEnded(true), Math.max(1, data.playSeconds) * 1000);
    return () => clearTimeout(t);
  }, [data.id, data.playSeconds, preview, clip, data.demo, ready]);

  // In der Vorschau läuft der Clip mit, aber stumm — sonst würde das Dashboard
  // beim Probelauf mitplärren, während OBS denselben Ton schon ausgibt.
  const playing = !!clip?.id && ready && !ended && !data.demo;
  const muted = preview ? true : module.sound === false;
  const volume = clamp((module.volume ?? 100) / 100, 0, 1);

  // Lautstärke kennt nur die Eigenschaft, kein Attribut — und sie soll auch
  // greifen, wenn man den Regler während des Clips bewegt.
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, playing]);

  /** Startet die Datei; verbietet der Browser Ton, läuft sie eben stumm weiter. */
  const startFile = (e) => {
    const v = e.currentTarget;
    v.volume = volume;
    const started = v.play();
    if (!started) return;
    started.catch(() => {
      v.muted = true;
      v.play().catch(() => setFileFailed(true));
    });
  };

  // Ohne Clip gibt es nichts zu zeigen — dafür ist das Modul da. toRaidView
  // sortiert solche Raids schon aus; hier bleibt es als Riegel stehen, damit
  // nie eine leere Karte im Bild landet.
  if (!clip) return null;

  // Bewusst immer flach: die Glas-Unschärfe würde den automatischen Start
  // verhindern (siehe oben). Sichtbar wäre sie ohnehin nur an den schmalen
  // Streifen über und unter dem Clip.
  return (
    <div className="stw-card is-flat" style={cardStyle(module, width)}>
      {module.showRaider !== false && (
        <div className="stw-raid-head">
          <span className="stw-kicker" style={{ color: data.color || module.accent }}>Raid</span>
          <span className="stw-raid-who">{data.raider.name || data.raider.login}</span>
          {data.raider.viewers > 0 && (
            <span className="stw-raid-count">{fmt(data.raider.viewers)} Zuschauer</span>
          )}
        </div>
      )}

      <div className="stw-raid-media">
        {playing && useFile ? (
          <video
            ref={videoRef}
            src={clip.mp4}
            autoPlay
            playsInline
            muted={muted}
            onCanPlay={startFile}
            onEnded={() => setEnded(true)}
            onError={() => setFileFailed(true)}
          />
        ) : playing ? (
          <iframe
            title="Clip des Raiders"
            src={clipEmbedUrl(clip.id, muted)}
            width="100%"
            height="100%"
            allow="autoplay; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
        ) : (
          <div className="stw-raid-still">
            {clip.thumbnail
              ? <img src={clip.thumbnail} alt="" />
              : <span className="stw-raid-empty">Clip</span>}
          </div>
        )}
      </div>

      {clip?.title && (
        <div className="stw-raid-foot">
          <span className="stw-raid-title">{clip.title}</span>
          {clip.creator && <span className="stw-raid-by">von {clip.creator}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Vorhersage ─────────────────────────────────────────────────────────── */

function statusChip(status) {
  if (status === 'ACTIVE') return { cls: 'live', label: 'Einsätze offen' };
  if (status === 'LOCKED') return { cls: 'lock', label: 'Gesperrt' };
  if (status === 'RESOLVED') return { cls: 'done', label: 'Entschieden' };
  return { cls: '', label: 'Abgebrochen' };
}

/** Zwei Optionen: die klassische Versus-Ansicht, bei der beide Seiten gegeneinander drücken. */
function VersusBody({ outcomes, points, users, winnerId }) {
  const [A, B] = outcomes;
  const sum = points[0] + points[1];
  const pctA = sum > 0 ? (points[0] / sum) * 100 : 50;
  // Anzeigebreite begrenzt, damit auch bei 3% noch Text in die Seite passt —
  // die genannte Prozentzahl bleibt der echte Wert.
  const widthA = clamp(pctA, 12, 88);

  const cls = (which, o, w) => [
    'stw-side', which,
    w < 22 ? 'is-tight' : '',
    winnerId && winnerId === o.id ? 'is-win' : '',
    winnerId && winnerId !== o.id ? 'is-lose' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="stw-vs">
      <div className={cls('a', A, widthA)}
        style={{ width: `${widthA.toFixed(2)}%`, background: `linear-gradient(160deg, ${shade(A.color, 0.22)}, ${A.color})` }}>
        <div className="stw-side-in">
          <div className="stw-pct-row">
            <span className="stw-pct">{Math.round(pctA)}%</span>
            <span className="stw-win-badge">Gewonnen</span>
          </div>
          <div className="stw-nm">{A.title}</div>
          <div className="stw-sub">{fmt(points[0])} Punkte · {fmt(users[0])}</div>
        </div>
      </div>

      <div className={cls('b', B, 100 - widthA)}
        style={{ width: `calc(${(100 - widthA).toFixed(2)}% + 26px)`, background: `linear-gradient(200deg, ${shade(B.color, 0.22)}, ${B.color})` }}>
        <div className="stw-side-in">
          <div className="stw-pct-row">
            <span className="stw-win-badge">Gewonnen</span>
            <span className="stw-pct">{Math.round(100 - pctA)}%</span>
          </div>
          <div className="stw-nm">{B.title}</div>
          <div className="stw-sub">{fmt(points[1])} Punkte · {fmt(users[1])}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Drei bis zehn Optionen: gestapelte Anteilsleiste plus beschriftete Liste.
 * Bewusst kein Kuchen-/Ringdiagramm — bei nah beieinander liegenden Werten und
 * langen Optionsnamen sind Kreissegmente kaum vergleichbar, und ab etwa sechs
 * Segmenten verschwimmen sie. Die Leiste zeigt den Anteil auf einen Blick,
 * die Zeilen darunter liefern die genauen Zahlen und beschriften jede Farbe.
 */
function ShareBody({ outcomes, points, users, winnerId }) {
  const sum = points.reduce((s, p) => s + p, 0);
  const ranked = outcomes
    .map((o, i) => ({ o, points: points[i], users: users[i], pct: sum > 0 ? (points[i] / sum) * 100 : 100 / outcomes.length }))
    .sort((a, b) => b.points - a.points);

  return (
    <>
      <div className="stw-share">
        {ranked.map(({ o, pct }) => (
          <span
            key={o.id}
            className={`stw-share-seg${winnerId && winnerId !== o.id ? ' is-lose' : ''}`}
            style={{ width: `${Math.max(pct, 1.5).toFixed(2)}%`, background: o.color }}
          />
        ))}
      </div>

      <div className="stw-legend">
        {ranked.map(({ o, points: p, users: u, pct }) => (
          <div key={o.id} className={`stw-legend-row${winnerId === o.id ? ' is-win' : ''}${winnerId && winnerId !== o.id ? ' is-lose' : ''}`}>
            <span className="stw-dot" style={{ background: o.color }} />
            <span className="stw-legend-nm">{o.title}</span>
            {winnerId === o.id && <span className="stw-win-badge">Gewonnen</span>}
            <span className="stw-legend-pct">{Math.round(pct)}%</span>
            <span className="stw-legend-sub">{fmt(p)} · {fmt(u)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function PredictionWidget({ data, module, width = 740 }) {
  const head = module.showHead !== false;
  const open = data.status === 'ACTIVE';
  const outcomes = data.outcomes;
  const tweened = useTweenArray([...outcomes.map((o) => o.points), ...outcomes.map((o) => o.users)]);
  const points = tweened.slice(0, outcomes.length);
  const users = tweened.slice(outcomes.length);

  const sum = points.reduce((s, p) => s + p, 0);
  const totalUsers = users.reduce((s, u) => s + u, 0);
  const remaining = Math.max(0, data.remaining || 0);
  const frac = data.window > 0 ? clamp(remaining / data.window, 0, 1) : 0;
  const urgent = open && remaining <= 10;
  const isVersus = outcomes.length <= VERSUS_MAX_OUTCOMES;

  return (
    <div className={cardClass(module, head)} style={cardStyle(module, width)}>
      <div className="stw-progress">
        <i style={{ transform: `scaleX(${open ? frac : 0})`, background: urgent ? '#e66767' : module.accent }} />
      </div>

      {head && (
        <CardHead
          kicker="Vorhersage"
          accent={module.accent}
          chip={statusChip(data.status)}
          showTimer={module.timer && open}
          remaining={remaining}
          urgent={urgent}
        />
      )}

      <h3 className="stw-title">{data.title || 'Vorhersage'}</h3>

      {isVersus
        ? <VersusBody outcomes={outcomes} points={points} users={users} winnerId={data.winnerId} />
        : <ShareBody outcomes={outcomes} points={points} users={users} winnerId={data.winnerId} />}

      {isVersus && (
        <div className="stw-odds">
          <span style={{ color: outcomes[0].color }}>
            {(points[0] > 0 ? sum / points[0] : 1).toFixed(1).replace('.', ',')} : 1
          </span>
          <span className="vs-label">VERSUS</span>
          <span style={{ color: outcomes[1].color }}>
            {(points[1] > 0 ? sum / points[1] : 1).toFixed(1).replace('.', ',')} : 1
          </span>
        </div>
      )}

      <div className="stw-foot" style={{ paddingTop: 16 }}>
        <span>{fmt(sum)} Kanalpunkte im Pot</span>
        <span>{fmt(totalUsers)} Teilnehmer</span>
      </div>
    </div>
  );
}
