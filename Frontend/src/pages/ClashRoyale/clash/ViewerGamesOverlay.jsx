// ViewerGamesOverlay.jsx — OBS-Browserquelle der Viewer Games (/clash/viewer-games/overlay/:key), Server:
// Backend/clashRoyale/viewerGames/viewerGames.js. Bewusst schlicht im Clash-Royale-Look: Kopf mit „!tipp <Karte>“,
// das verdeckte Kartenbild (cardStage.js, gleiche Stufen wie im Einzelspiel), darunter der Zeitbalken bzw. die
// fehlenden Tipps bis zur nächsten Stufe, nach dem Treffer Gewinner + Auflösung, optional die Top 5.
// Fragt den Zustand jede Sekunde ab (hält damit auch den Chat-Bot im Kanal); der Balken läuft dazwischen flüssig
// mit der Serveruhr. Transparenter Hintergrund, feste Breite 380 px (Browserquelle z. B. 400 × 820).
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCardImage, drawCardStage, VIEW_W, VIEW_H } from './cardStage';

const POLL_MS = 1000;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap';

const TXT = {
  de: { title: 'Errate die Karte!', cmd: '!tipp Kartenname', pixel: 'Pixel', zoom: 'Zoom', stage: (a, b) => `Stufe ${a}/${b}`, left: (n) => `noch ${n} ${n === 1 ? 'Fehltipp' : 'Fehltipps'} bis zur nächsten Stufe`, final: 'Letzte Stufe', won: (n, p) => `${n} +${p}`, nobody: 'Niemand hat es erraten', next: 'Nächste Runde gleich …', top: 'Bestenliste', offline: 'Overlay nicht gefunden' },
  en: { title: 'Guess the card!', cmd: '!tipp card name', pixel: 'Pixel', zoom: 'Zoom', stage: (a, b) => `Stage ${a}/${b}`, left: (n) => `${n} more wrong ${n === 1 ? 'guess' : 'guesses'} until the next stage`, final: 'Final stage', won: (n, p) => `${n} +${p}`, nobody: 'Nobody got it', next: 'Next round soon …', top: 'Leaderboard', offline: 'Overlay not found' },
};

function useFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);
}

/** Abfrage des Overlay-Zustands; offset = Serveruhr − eigene Uhr */
function useOverlayState(overlayKey) {
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const offset = useRef(0);
  useEffect(() => {
    if (!overlayKey) return undefined;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/cr-viewer-games/overlay/${encodeURIComponent(overlayKey)}`, { cache: 'no-store' });
        if (res.status === 404) { setMissing(true); return; }
        const j = await res.json();
        offset.current = j.serverNow - Date.now();
        if (!stop) { setData(j); setMissing(false); }
      } catch { /* nächster Versuch */ }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [overlayKey]);
  return { data, missing, offset };
}

/** Zeitbalken: 1 → 0 zwischen barFrom und barTo, flüssig per rAF */
function TimeBar({ from, to, offset, tone }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now() + offset.current;
      const p = to ? Math.max(0, Math.min(1, (to - now) / (to - from))) : 1;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [from, to, offset]);
  return <div className={`vgo-bar${tone ? ` is-${tone}` : ''}`}><i ref={ref} /></div>;
}

export function ViewerGamesView({ overlayKey, lang: langProp }) {
  useFont();
  const { data, missing, offset } = useOverlayState(overlayKey);
  const canvasRef = useRef(null);
  const r = data?.round;
  const img = useCardImage(r?.cardId);
  const ended = r && r.status !== 'running';
  useEffect(() => {
    if (r) drawCardStage(canvasRef.current, img, { mode: r.mode, stage: r.stage, fx: r.fx, fy: r.fy, reveal: ended });
  }, [img, r?.id, r?.stage, ended]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = TXT[langProp || data?.settings?.language] || TXT.de;
  if (missing) return <div className="vgo"><div className="vgo-card"><p className="vgo-msg">{L.offline}</p></div></div>;
  if (!r) return null;

  return (
    <div className="vgo">
      <div className="vgo-card">
        <div className="vgo-head">
          <span className="vgo-title">{L.title}</span>
          <span className={`vgo-mode is-${r.mode}`}>{L[r.mode]}</span>
        </div>
        <div className="vgo-stage">
          <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />
          {!ended && <span className="vgo-stage-tag">{L.stage(r.stage + 1, r.stages)}</span>}
          {ended && (
            <div className="vgo-result">
              <span className="vgo-result-name">{r.cardName}</span>
              <span className={`vgo-result-win${r.winner ? '' : ' is-none'}`}>{r.winner ? L.won(r.winner, r.points) : L.nobody}</span>
            </div>
          )}
        </div>
        {/* Ohne Zeitlimit (Fehltipp-Modus vor der letzten Stufe) kein Balken — ein stehender voller Balken sagt nichts */}
        {r.barTo && <TimeBar from={r.barFrom} to={r.barTo} offset={offset} tone={ended ? 'pause' : r.stage === r.stages - 1 ? 'final' : ''} />}
        <p className="vgo-sub">
          {ended ? L.next : r.guessesLeft != null ? L.left(r.guessesLeft) : r.stage === r.stages - 1 ? L.final : <b>{L.cmd}</b>}
        </p>
        {!ended && r.guessesLeft != null && <p className="vgo-cmd">{L.cmd}</p>}
      </div>
      {data.settings.showLeaderboard && data.leaderboard.length > 0 && (
        <div className="vgo-card vgo-top">
          <span className="vgo-top-title">{L.top}</span>
          <ol>
            {data.leaderboard.map((p, i) => (
              <li key={p.viewer}><b>{i + 1}</b><span>{p.display}</span><em>{p.points}</em></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function ViewerGamesOverlay() {
  const { overlayKey } = useParams();
  // Transparenter Hintergrund für OBS (die Seite läuft außerhalb der Website-Hülle)
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => { document.body.style.background = prev; };
  }, []);
  return <div className="vgo-page"><ViewerGamesView overlayKey={overlayKey} /></div>;
}
