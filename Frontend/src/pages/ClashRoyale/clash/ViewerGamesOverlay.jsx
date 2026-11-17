// ViewerGamesOverlay.jsx — OBS-Browserquelle der Viewer Games (/clash/viewer-games/overlay/:key), Server:
// Backend/clashRoyale/viewerGames/viewerGames.js. Bewusst schlicht im Clash-Royale-Look: Kopf mit „!tipp <Karte>“,
// das verdeckte Kartenbild (cardStage.js, gleiche Stufen wie im Einzelspiel), darunter der Zeitbalken bzw. die
// fehlenden Tipps bis zur nächsten Stufe, nach dem Treffer Gewinner + Auflösung, optional die Top 5.
// Fragt den Zustand jede Sekunde ab (hält damit auch den Chat-Bot im Kanal); der Balken läuft dazwischen flüssig
// mit der Serveruhr. Transparenter Hintergrund, feste Breite 380 px (Browserquelle z. B. 400 × 820).
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCardImage, drawCardStage, VIEW_W, VIEW_H } from './cardStage';
import { cardImageUrl } from '../data/cards';
import { useFontLink } from '../../../components/shell/useFontLink';
import elixirImg from '../../../assets/clashRoyale/ui/elixir_1.webp';

const POLL_MS = 1000;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap';

const TXT = {
  de: {
    title: 'Errate die Karte!', cmd: '!tipp Kartenname', pixel: 'Pixel', zoom: 'Zoom', stat: 'Schätzen', wordle: 'Wordle',
    stage: (a, b) => `Stufe ${a}/${b}`, left: (n) => `noch ${n} ${n === 1 ? 'Fehltipp' : 'Fehltipps'} bis zur nächsten Stufe`, final: 'Letzte Stufe',
    won: (n, p) => `${n} +${p}`, nobody: 'Niemand hat es erraten', next: 'Nächste Runde gleich …', top: 'Bestenliste', topSeason: (s) => `Bestenliste · ${s}`, offline: 'Overlay nicht gefunden',
    estTitle: 'Schätze den Wert!', estCmd: '!tipp Zahl', estLevel: 'Turnierniveau (Level 11)', estAnswers: (n) => `${n} ${n === 1 ? 'Schätzung' : 'Schätzungen'}`,
    estRight: (v) => `Richtig: ${v}`, estWon: (n, g, p) => `${n} · ${g} · +${p}`, estNobody: 'Niemand hat geschätzt',
    stats: { hp: 'Lebenspunkte', damage: 'Schaden pro Treffer', dps: 'Schaden pro Sekunde' },
    wordleEmpty: 'Noch kein Tipp — jeder Tipp verrät etwas über die gesuchte Karte.', wordleMore: (n) => (n === 1 ? '+1 älterer Tipp' : `+${n} ältere Tipps`),
    cols: { elixir: 'Elixier', rarity: 'Seltenheit', type: 'Art', year: 'Jahr' },
    rarity: { Common: 'Gewöhnlich', Rare: 'Selten', Epic: 'Episch', Legendary: 'Legendär', Champion: 'Champion' },
    types: { troop: 'Truppe', spell: 'Zauber', building: 'Gebäude' },
  },
  en: {
    title: 'Guess the card!', cmd: '!tipp card name', pixel: 'Pixel', zoom: 'Zoom', stat: 'Estimate', wordle: 'Wordle',
    stage: (a, b) => `Stage ${a}/${b}`, left: (n) => `${n} more wrong ${n === 1 ? 'guess' : 'guesses'} until the next stage`, final: 'Final stage',
    won: (n, p) => `${n} +${p}`, nobody: 'Nobody got it', next: 'Next round soon …', top: 'Leaderboard', topSeason: (s) => `Leaderboard · ${s}`, offline: 'Overlay not found',
    estTitle: 'Estimate the value!', estCmd: '!tipp number', estLevel: 'Tournament standard (level 11)', estAnswers: (n) => `${n} ${n === 1 ? 'estimate' : 'estimates'}`,
    estRight: (v) => `Answer: ${v}`, estWon: (n, g, p) => `${n} · ${g} · +${p}`, estNobody: 'Nobody estimated',
    stats: { hp: 'Hitpoints', damage: 'Damage per hit', dps: 'Damage per second' },
    wordleEmpty: 'No guess yet — every guess reveals something about the card.', wordleMore: (n) => (n === 1 ? '+1 older guess' : `+${n} older guesses`),
    cols: { elixir: 'Elixir', rarity: 'Rarity', type: 'Type', year: 'Year' },
    rarity: { Common: 'Common', Rare: 'Rare', Epic: 'Epic', Legendary: 'Legendary', Champion: 'Champion' },
    types: { troop: 'Troop', spell: 'Spell', building: 'Building' },
  },
};
// Farbe der Modus-Marke für die neuen Modi (Pixel/Zoom haben eigene Klassen in index.css)
const MODE_BG = { stat: 'linear-gradient(to bottom, #ffb25c, #e57a1a)', wordle: 'linear-gradient(to bottom, #6aa3ff, #2f7bff)' };
const fmtNum = (n, lang) => (typeof n === 'number' ? n.toLocaleString(lang === 'en' ? 'en-US' : 'de-DE') : '–');

function useFont() {
  useFontLink(FONT_HREF);
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

/** Werte schätzen: Karte klein, daneben die Frage; nach Ablauf der richtige Wert und wer am nächsten lag */
function EstimateBody({ r, L, lang, ended }) {
  return (
    <>
      <div className="flex gap-3 items-center">
        <img src={cardImageUrl(r.cardId)} alt="" className="w-[110px] shrink-0 object-contain" draggable={false} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="font-cr text-[24px] leading-none" style={{ textShadow: 'var(--cr-text-outline-thick)' }}>{r.cardName}</span>
          <span className="font-cr text-[19px] leading-tight text-[#ffd659]" style={{ textShadow: 'var(--cr-text-outline)' }}>{L.stats[r.stat]}?</span>
          {Array.isArray(r.of) && <span className="text-xs leading-snug text-white/75">{lang === 'en' ? r.of[1] : r.of[0]}</span>}
          <span className="text-[11px] text-white/55">{L.estLevel}</span>
        </div>
      </div>
      {ended && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <span className="vgo-result-name">{L.estRight(fmtNum(r.value, lang))}</span>
          <span className={`vgo-result-win${r.winner ? '' : ' is-none'}`}>{r.winner ? L.estWon(r.winner, fmtNum(r.winnerGuess, lang), r.points) : L.estNobody}</span>
        </div>
      )}
    </>
  );
}

const HINT_BG = { eq: '#2f9e55', up: '#c47a12', down: '#c47a12', no: '#a8383a' };
function Hint({ h, text }) {
  const arrow = h.r === 'up' ? ' ↑' : h.r === 'down' ? ' ↓' : '';
  return (
    <span className="rounded-md px-1 py-1 text-center text-[11px] font-bold leading-tight truncate" style={{ background: HINT_BG[h.r] || '#44506b' }}>
      {text ?? '?'}{arrow}
    </span>
  );
}

/** Chat-Wordle: die letzten Tipps (neueste oben) mit vier Hinweisen; nach dem Treffer die Karte */
function WordleBody({ r, L, ended }) {
  // Spaltenbreiten nach Inhalt: „10 ↓“ ist kurz, „Gewöhnlich“/„Legendary“ lang — zusammen so breit wie 4 × 3,5 rem
  const grid = 'grid grid-cols-[minmax(0,1fr)_2.25rem_4.75rem_3.75rem_3.25rem] gap-1 items-center';
  return (
    <>
      {ended && (
        <div className="flex items-center gap-3 mb-3">
          <img src={cardImageUrl(r.cardId)} alt="" className="w-16 shrink-0 object-contain" draggable={false} />
          <div className="flex flex-col items-start gap-1.5 min-w-0">
            <span className="font-cr text-[24px] leading-none" style={{ textShadow: 'var(--cr-text-outline-thick)' }}>{r.cardName}</span>
            <span className={`vgo-result-win${r.winner ? '' : ' is-none'}`}>{r.winner ? L.won(r.winner, r.points) : L.nobody}</span>
          </div>
        </div>
      )}
      {r.guesses.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className={`${grid} px-1.5 text-[10px] font-bold uppercase tracking-wide text-white/55`}>
            <span />
            {/* Elixier als Tropfen: das Wort passt nicht in die schmale Spalte */}
            <img src={elixirImg} alt={L.cols.elixir} title={L.cols.elixir} className="h-4 justify-self-center" draggable={false} />
            {['rarity', 'type', 'year'].map((k) => <span key={k} className="text-center truncate">{L.cols[k]}</span>)}
          </div>
          {r.guesses.map((g) => (
            <div key={g.cardId} className={`${grid} rounded-lg bg-black/25 px-1.5 py-1`}>
              <span className="min-w-0">
                <b className="block truncate font-cr font-normal text-[15px]" style={{ textShadow: 'var(--cr-text-outline)' }}>{g.name}</b>
                <span className="block truncate text-[10px] text-white/55">{g.by}</span>
              </span>
              <Hint h={g.hints.elixir} text={g.hints.elixir.v} />
              <Hint h={g.hints.rarity} text={L.rarity[g.hints.rarity.v] || g.hints.rarity.v} />
              <Hint h={g.hints.type} text={L.types[g.hints.type.v]} />
              <Hint h={g.hints.year} text={g.hints.year.v} />
            </div>
          ))}
          {r.total > r.guesses.length && <p className="text-[11px] text-white/55 text-center">{L.wordleMore(r.total - r.guesses.length)}</p>}
        </div>
      ) : !ended && <p className="text-sm text-white/75 text-center py-6 leading-snug">{L.wordleEmpty}</p>}
    </>
  );
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

  const lang = (langProp || data?.settings?.language) === 'en' ? 'en' : 'de';
  const L = TXT[lang];
  if (missing) return <div className="vgo"><div className="vgo-card"><p className="vgo-msg">{L.offline}</p></div></div>;
  if (!r) return null;
  const imageRound = r.mode === 'pixel' || r.mode === 'zoom';
  // Bei Schätzen und Wordle läuft die ganze Runde auf Zeit; bei Pixel/Zoom ist die letzte Stufe die knappe
  const finalStretch = imageRound ? r.stage === r.stages - 1 : r.barTo && r.barTo - (Date.now() + offset.current) < 10000;

  return (
    <div className="vgo">
      <div className="vgo-card">
        <div className="vgo-head">
          <span className="vgo-title">{r.mode === 'stat' ? L.estTitle : L.title}</span>
          <span className={`vgo-mode is-${r.mode}`} style={MODE_BG[r.mode] ? { background: MODE_BG[r.mode] } : undefined}>{L[r.mode]}</span>
        </div>
        {r.mode === 'stat' && <EstimateBody r={r} L={L} lang={lang} ended={ended} />}
        {r.mode === 'wordle' && <WordleBody r={r} L={L} ended={ended} />}
        {imageRound && (
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
        )}
        {/* Ohne Zeitlimit (Fehltipp-Modus vor der letzten Stufe) kein Balken — ein stehender voller Balken sagt nichts */}
        {r.barTo && <TimeBar from={r.barFrom} to={r.barTo} offset={offset} tone={ended ? 'pause' : finalStretch ? 'final' : ''} />}
        <p className="vgo-sub">
          {ended ? L.next
            : r.mode === 'stat' ? <><b>{L.estCmd}</b> · {L.estAnswers(r.answers)}</>
              : r.mode === 'wordle' ? <b>{L.cmd}</b>
                : r.guessesLeft != null ? L.left(r.guessesLeft) : r.stage === r.stages - 1 ? L.final : <b>{L.cmd}</b>}
        </p>
        {!ended && imageRound && r.guessesLeft != null && <p className="vgo-cmd">{L.cmd}</p>}
      </div>
      {data.settings.showLeaderboard && data.leaderboard.length > 0 && (
        <div className="vgo-card vgo-top">
          <span className="vgo-top-title">{data.season ? L.topSeason(data.season) : L.top}</span>
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
