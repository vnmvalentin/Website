// OverlayAlerts.jsx — das Overlay-Modul „Alerts“: die Karte, die Warteschlange, der Ton und die Sprachausgabe.
// Geteilt zwischen OBS-Quelle (PollsPredictionsOverlay.jsx) und Editor-Vorschau (PollsPredictionsPage.jsx).
//
// Der Server liefert die letzten Alerts als Liste (Backend/streamTool/lib/alertsCore.js). Diese Seite merkt sich,
// welche sie schon kennt, und spielt neue nacheinander ab. Was beim Öffnen der Quelle schon in der Liste steht, wird
// NICHT nachgespielt — sonst käme nach jedem Neuladen in OBS ein Schwall alter Alerts.
//
// Die Abläufe laufen über Timer im Code, nicht über CSS-Ereignisse: im Sparmodus ohne GPU (lowGfx) sind
// CSS-Animationen und -Verzögerungen genullt.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Star, Repeat, Gift, Gem, Users } from 'lucide-react';
import './overlayAlerts.css';
import { useOverlayText, OVERLAY_TEXTS, overlayFormat } from './overlayI18n';
import { alertTemplate, alertTextParts } from './streamToolConfig';
import { cardStyle } from './OverlayWidgets';

/** Breite der Karte auf der 1920er Bühne. */
export const ALERT_W = 600;
/** Dauer der Ausblendung (wie .stw-widget-inner) plus kurze Pause bis zum nächsten Alert. */
const HIDE_MS = 450;
const GAP_MS = 350;
/** Nach einer langen Pause nicht ewig nachspielen. */
const MAX_QUEUE = 30;
/** So jung muss ein Test beim ersten Abruf sein, damit er trotzdem abgespielt wird. */
const FRESH_TEST_MS = 15 * 1000;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const ICONS = { follow: Heart, sub: Star, resub: Repeat, gift: Gift, bits: Gem, raid: Users };
const TIERED = ['sub', 'resub', 'gift'];

/** Ob zu dieser Art eine Nachricht des Zuschauers gehört. */
const hasMessage = (ev) => ev.kind === 'resub' || ev.kind === 'bits' || ev.kind === 'sub';

/* ── Ton ──────────────────────────────────────────────────────────────────── */

// Kurze Tonfolgen je Art [Frequenz Hz, Start s, Dauer s] — im Browser erzeugt, kein Audio-Paket nötig
const NOTES = {
  follow: [[784, 0, 0.35], [1047, 0.12, 0.5]],
  sub: [[659, 0, 0.3], [784, 0.1, 0.3], [1047, 0.2, 0.6]],
  resub: [[659, 0, 0.3], [880, 0.1, 0.3], [1175, 0.2, 0.6]],
  gift: [[784, 0, 0.25], [988, 0.08, 0.25], [1175, 0.16, 0.25], [1568, 0.24, 0.6]],
  bits: [[1319, 0, 0.18], [1568, 0.07, 0.18], [2093, 0.14, 0.45]],
  raid: [[392, 0, 0.4], [523, 0.15, 0.4], [659, 0.3, 0.4], [784, 0.45, 0.8]],
};
let audio = null;

/** Spielt den Ton zu einer Alert-Art. volume 0–100. Fehler (kein Audio, gesperrt) bleiben still. */
export function playAlertSound(kind, volume = 60) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const master = audio.createGain();
    master.gain.value = clamp(volume / 100, 0, 1) * 0.35;
    master.connect(audio.destination);
    const t0 = audio.currentTime + 0.02;
    for (const [freq, start, dur] of NOTES[kind] || NOTES.follow) {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, t0 + start);
      env.gain.exponentialRampToValueAtTime(1, t0 + start + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(env);
      env.connect(master);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    }
  } catch { /* ohne Ton weiter */ }
}

/** Liest den Text vor (Sprachausgabe des Rechners). Ohne Stimmen passiert nichts. */
export function speakAlert(text, lang, volume = 60) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'de-DE';
    u.volume = clamp(volume / 100, 0, 1);
    synth.speak(u);
  } catch { /* ohne Sprachausgabe weiter */ }
}

/** Der vorgelesene Text: Alert-Text und, falls gezeigt, die Nachricht. */
export function alertSpeech(ev, module, lang) {
  const t = OVERLAY_TEXTS.dict(lang);
  const { num } = overlayFormat(lang);
  const text = alertTextParts(alertTemplate(module, ev.kind, lang), ev, t, num).map((p) => p.text).join('');
  const msg = module.showMessage !== false && hasMessage(ev) && ev.message ? ` ${ev.message}` : '';
  return `${text}${msg}`;
}

/* ── Warteschlange ────────────────────────────────────────────────────────── */

/**
 * Spielt neue Alerts aus `events` nacheinander ab.
 * @param {Array|undefined} events  Liste vom Server; undefined/null = noch nichts geladen (dann wird nichts gemerkt)
 * @param {object} module           Moduleinstellungen (kinds, seconds)
 * @param {(ev) => void} onShow     wird beim Erscheinen eines Alerts gerufen (Ton, Sprachausgabe)
 * @returns {{ current: object|null, visible: boolean }}
 */
export function useAlertPlayer(events, module, onShow) {
  const seen = useRef(null);
  const queue = useRef([]);
  const busy = useRef(false);
  const timers = useRef([]);
  const moduleRef = useRef(module);
  const onShowRef = useRef(onShow);
  moduleRef.current = module;
  onShowRef.current = onShow;
  const [current, setCurrent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pump = useCallback(() => {
    if (busy.current) return;
    const next = queue.current.shift();
    if (!next) return;
    busy.current = true;
    setCurrent(next);
    setVisible(true);
    try { onShowRef.current?.(next); } catch { /* Ton/Sprache dürfen den Ablauf nie aufhalten */ }
    const ms = clamp(Number(moduleRef.current?.seconds) || 6, 2, 30) * 1000;
    timers.current.push(setTimeout(() => setVisible(false), ms));
    timers.current.push(setTimeout(() => { busy.current = false; pump(); }, ms + HIDE_MS + GAP_MS));
  }, []);

  useEffect(() => {
    if (!Array.isArray(events)) return;
    if (seen.current === null) {
      // Erster Stand: alles Vorhandene gilt als gesehen — bis auf einen gerade eben ausgelösten Test, sonst ginge
      // der erste Testknopf nach dem Öffnen ins Leere
      seen.current = new Set();
      for (const ev of events) {
        seen.current.add(ev.id);
        if (ev.test && Math.abs(Date.now() - ev.at) < FRESH_TEST_MS) queue.current.push(ev);
      }
      pump();
      return;
    }
    for (const ev of events) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      // Tests zeigt die Seite immer; echte Alerts nur, wenn ihre Art eingeschaltet ist
      if (!ev.test && moduleRef.current?.kinds?.[ev.kind] === false) continue;
      queue.current.push(ev);
    }
    if (queue.current.length > MAX_QUEUE) queue.current = queue.current.slice(-MAX_QUEUE);
    pump();
  }, [events, pump]);

  return { current, visible };
}

/* ── Karte ────────────────────────────────────────────────────────────────── */

export function AlertWidget({ event, module, width = ALERT_W, still = false }) {
  const { t, num, lang } = useOverlayText();
  const parts = alertTextParts(alertTemplate(module, event.kind, lang), event, t, num);
  const nameColor = module.colors?.[0] || module.accent;
  const Icon = ICONS[event.kind] || Heart;
  const tier = TIERED.includes(event.kind) && event.tier && event.tier !== '1' ? t.tierWord[event.tier] : '';
  const showMessage = module.showMessage !== false && hasMessage(event) && !!event.message;
  const seconds = clamp(Number(module.seconds) || 6, 2, 30);

  return (
    <div className={`stw-card stw-alert${module.glass ? '' : ' is-flat'}`} style={cardStyle(module, width)} data-kind={event.kind}>
      <i className="stw-alert-edge" style={{ background: module.accent }} />
      <div className="stw-alert-body" key={event.id}>
        <div className="stw-alert-kicker" style={{ color: module.accent }}>
          <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
          <span>{t.alertKinds[event.kind]}{tier ? ` · ${tier}` : ''}</span>
          {event.test && <span className="stw-alert-test">{t.alertTest}</span>}
        </div>
        <p className="stw-alert-text">
          {parts.map((p, i) => (p.isName
            ? <b key={i} style={{ color: nameColor }}>{p.text}</b>
            : <React.Fragment key={i}>{p.text}</React.Fragment>))}
        </p>
        {showMessage && <p className="stw-alert-msg">{t.alertQuote(event.message)}</p>}
      </div>
      {/* Restzeit als Linie am unteren Rand — rein optisch, der Ablauf hängt am Timer im Code */}
      {!still && <i key={`time-${event.id}`} className="stw-alert-time" style={{ background: module.accent, animationDuration: `${seconds}s` }} />}
    </div>
  );
}
