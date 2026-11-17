// OverlaySubathon.jsx — die Karte des Moduls „Subathon-Timer“. Geteilt zwischen OBS-Quelle
// (PollsPredictionsOverlay.jsx) und Editor-Vorschau (PollsPredictionsPage.jsx).
//
// Der Server liefert Zustand und Endzeitpunkt (Backend/streamTool/lib/subathonCore.js, publicView). Die Sekunden
// zählt die Karte selbst herunter — nur sie zeichnet dafür jede Viertelsekunde neu, nicht die ganze Seite.
// Neue Verlängerungen springen kurz als „+5:00“ neben der Zeit auf; das Ein- und Ausblenden hängt an Timern im
// Code, weil der Sparmodus ohne GPU (lowGfx) CSS-Animationen nullt.
import React, { useEffect, useRef, useState } from 'react';
import './overlaySubathon.css';
import { useOverlayText } from './overlayI18n';
import { cardStyle } from './OverlayWidgets';
import { subathonClock, subathonDelta, subathonRemaining, subathonWhat, subathonHappyLeft } from './streamToolConfig';

/** Breite der Karte auf der 1920er Bühne. */
export const SUBATHON_W = 440;
/** So lange bleibt „+5:00“ neben der Zeit stehen. */
const POP_MS = 3200;

/** Neu zeichnen im Viertelsekundentakt — nur solange der Timer läuft. */
function useTicking(active) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [active]);
}

/**
 * Neu gutgeschriebene Zeit für das kurze „+5:00“. Was beim ersten Stand schon im Verlauf steht, springt nicht
 * auf — sonst käme nach jedem Neuladen der OBS-Quelle die letzte Verlängerung noch einmal.
 */
function usePop(recent, enabled) {
  const seen = useRef(null);
  const timer = useRef(0);
  const [pop, setPop] = useState(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!Array.isArray(recent)) return;
    if (seen.current === null) {
      seen.current = new Set(recent.map((e) => e.id));
      return;
    }
    const fresh = recent.filter((e) => !seen.current.has(e.id));
    for (const e of fresh) seen.current.add(e.id);
    if (!enabled || !fresh.length) return;
    const total = fresh.reduce((sum, e) => sum + (Number(e.ms) || 0), 0);
    if (!total) return;
    setPop({ key: fresh[fresh.length - 1].id, ms: total });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPop(null), POP_MS);
  }, [recent, enabled]);
  return pop;
}

const CHIP = { running: ' live', paused: ' lock', ended: ' done', idle: '' };

/**
 * @param {object} data       aus toSubathonView
 * @param {object} offsetRef  Abstand Server- zu Browseruhr in ms (ref), damit die Zeit nicht schief läuft
 */
export function SubathonWidget({ data, module, offsetRef, width = SUBATHON_W }) {
  const { t, num } = useOverlayText();
  const running = data.status === 'running';
  // Auch pausiert läuft eine Happy Hour nach der Uhr weiter
  useTicking(running || !!data.happy);
  const pop = usePop(data.recent, module.showPop !== false);

  const now = Date.now() + (offsetRef?.current || 0);
  const remaining = subathonRemaining(data, module, now);
  const happyLeft = data.status === 'running' || data.status === 'paused' ? subathonHappyLeft(data, now) : 0;
  // Lokal schon abgelaufen: gleich „Vorbei“ zeigen, nicht erst beim nächsten Abruf
  const status = running && remaining <= 0 ? 'ended' : data.status;
  const head = module.showHead !== false;
  const last = module.showLast !== false ? data.last : null;
  const cap = module.showCap !== false && data.capMs > 0
    ? (data.capReached ? t.subCapReached : t.subCap(subathonClock(data.capMs)))
    : '';
  const lastName = last ? (last.name || (last.kind === 'manual' ? '' : t.anonymous)) : '';
  const cls = `stw-card${module.glass ? '' : ' is-flat'}${module.style !== 'classic' ? ' stw-c' : ''} stw-sth`;

  return (
    <div className={cls} style={cardStyle(module, width)} data-status={status}>
      {head && (
        <div className="stw-sth-head">
          <span className="stw-kicker" style={{ color: module.accent }}>{module.label || 'Subathon'}</span>
          <span className={`stw-chip${CHIP[status] || ''}`}>{t.subStatus[status] || ''}</span>
        </div>
      )}
      <div className="stw-sth-clock">
        <span className="stw-sth-time">{subathonClock(remaining)}</span>
        {pop && (
          <b key={pop.key} className={`stw-sth-pop${pop.ms < 0 ? ' is-minus' : ''}`} style={pop.ms < 0 ? undefined : { color: data.color }}>
            {subathonDelta(pop.ms)}
          </b>
        )}
      </div>
      {happyLeft > 0 && (
        <p className="stw-sth-happy" style={{ borderLeftColor: data.color }}>
          <b style={{ color: data.color }}>{t.subHappy(data.happy.factor)}</b>
          <span>{t.subHappyLeft(subathonClock(happyLeft).replace(/^0:/, ''))}</span>
        </p>
      )}
      {cap && <p className={`stw-sth-cap${data.capReached ? ' is-reached' : ''}`}>{cap}</p>}
      {last && (
        <div className="stw-sth-last">
          {lastName && <span className="stw-sth-name">{lastName}</span>}
          <span className="stw-sth-what">{subathonWhat(last, t, num, module.currency)}</span>
          {/* Gutgeschriebenes in der Modulfarbe; Abgezogenes und Verfallenes gedämpft */}
          <b className={`stw-sth-delta${last.ms > 0 ? '' : ' is-minus'}`} style={last.ms > 0 ? { color: data.color } : undefined}>
            {last.capped && last.ms <= 0 ? t.subCapReached : subathonDelta(last.ms)}
            {last.x > 1 && last.ms > 0 ? ` ×${last.x}` : ''}
          </b>
        </div>
      )}
    </div>
  );
}
