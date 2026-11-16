// HeutePage.jsx — /clash/heute: die Tagesrunde aller fünf Ratespiele (Ausbauplan „cr-heute“). Oben Punkte, Serie und
// Ergebnis zum Teilen, darunter die fünf Spiele mit ihrem Stand, unten die Bestenliste des Tages.
// Ergebnisse und Serie: dailyRound.js (Browser). Bestenliste: /api/clash/heute (Backend: clashRoyale/daily/), nur mit
// Twitch-Login; gemeldet wird beim Öffnen dieser Seite, je Spiel zählt am Server die erste Meldung.
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import GameFrame from './GameFrame';
import { useClashLang } from './clashI18n';
import { DAILY_GAMES, MAX_TOTAL, doneCount, shareText, streakOf, syncDaily, totalOf } from './dailyRound';
import { CrCheck } from '../ui/CrIcons';
import crownImg from '../../../assets/clashRoyale/ui/crown.png';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';
import questionImg from '../../../assets/clashRoyale/ui/question.webp';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';
import potionImg from '../../../assets/clashRoyale/ui/card_boost_potion.png';

const IMG = { wordle: scrollImg, kartenraten: questionImg, zoom: searchImg, pixel: eyeImg, farbe: potionImg };
const TONE = (s) => (s >= 67 ? '#4fd36d' : s >= 34 ? '#ffc93c' : '#ff6b6d');

/** Ein Kästchen je Spiel in der Farbe des Ergebnisses (wie markOf beim Teilen, aber gezeichnet statt Emoji —
 *  Emojis sehen je Gerät anders aus). Nicht gespielt = blass. */
function Marks({ scores, small = false }) {
  return (
    <span className="inline-flex gap-1.5 align-middle" aria-hidden="true">
      {DAILY_GAMES.map((g) => {
        const s = scores?.[g.key];
        return <span key={g.key} className={small ? 'h-3 w-3 rounded-[3px]' : 'h-5 w-5 rounded-md'}
          style={{ background: typeof s === 'number' ? TONE(s) : 'rgba(255, 255, 255, 0.14)' }} />;
      })}
    </span>
  );
}

export default function HeutePage() {
  const { lang, t } = useClashLang();
  const { user, login } = useContext(TwitchAuthContext);
  const [round, setRound] = useState(() => syncDaily());
  const [board, setBoard] = useState(null);
  const [boardDown, setBoardDown] = useState(false);
  const [copied, setCopied] = useState(false);
  const q = lang === 'en' ? '?lang=en' : '';

  // Zurück aus einem Spiel (anderer Tab, oder der Tag ist um Mitternacht umgesprungen): neu einlesen
  useEffect(() => {
    const again = () => { if (!document.hidden) setRound(syncDaily()); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, []);

  const { day, scores, days } = round;
  const done = doneCount(scores);
  const total = totalOf(scores);
  const streak = streakOf(days, day);
  const scoreKey = JSON.stringify(scores);

  // Angemeldet: eigene Ergebnisse melden, danach die Liste holen. Ohne Login nur die Liste.
  const loadBoard = useCallback(async () => {
    try {
      if (user && done > 0) {
        await fetch('/api/clash/heute/result', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day, scores }),
        }).catch(() => null);
      }
      const res = await fetch(`/api/clash/heute/board?tag=${day}`, { credentials: 'include' });
      const json = await res.json().catch(() => null);
      if (json?.ok) { setBoard(json); setBoardDown(false); }
      // Den Hinweis nur, wenn der Server mit einem Fehler geantwortet hat. Ohne Antwort (Netz weg, oder beim Vorrendern
      // ohne Backend) bleibt die Liste still — sonst stünde „nicht erreichbar“ im vorgerenderten Text für Suchmaschinen.
      else if (json) setBoardDown(true);
    } catch { /* keine Antwort: still */ }
  }, [user, day, scoreKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadBoard(); }, [loadBoard]);

  const labels = Object.fromEntries(DAILY_GAMES.map((g) => [g.key, t[g.title]]));
  const share = async () => {
    const [y, m, d] = day.split('-');
    const text = shareText({
      scores, streak: streak.current, labels, heading: t.heuteShareHeading, totalLabel: t.heuteTotalShort,
      streakLabel: t.heuteStreak, url: `vnmvalentin.de/clash/heute${q}`, dateText: lang === 'en' ? `${y}-${m}-${d}` : `${d}.${m}.${y}`,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* Zwischenablage gesperrt */ }
  };

  return (
    <GameFrame title={t.heuteTitle} icon={crownImg}
      seo={{ title: lang === 'en' ? 'Clash Royale Daily Round' : 'Clash Royale Tagesrunde', description: t.heuteSeo, path: '/clash/heute' }}>
      <p className="text-center text-sm text-white/70 -mt-2 mb-5">{t.heuteSub}</p>

      {/* Punkte, Serie, Teilen */}
      <section className="cr-arcade-panel p-4 sm:p-5 mb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="cr-eyebrow">{t.heuteTotal}</p>
            <p className="font-cr text-5xl leading-none text-white tabular-nums mt-1" style={{ textShadow: 'var(--cr-text-outline-thick)' }}>
              {total}<span className="text-2xl text-white/60"> / {MAX_TOTAL}</span>
            </p>
            <p className="text-sm text-white/65 mt-1.5">{t.heuteOf(done)}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-cr text-2xl text-white tabular-nums" style={{ textShadow: 'var(--cr-text-outline)' }}>{t.heuteStreak(streak.current)}</p>
            <p className="text-xs text-white/55 max-w-[16rem]">{t.heuteStreakNote(streak.best)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <Marks scores={scores} />
          {done > 0 && (
            <button type="button" onClick={share} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">
              {copied ? <CrCheck size={16} /> : <Copy size={16} />} {copied ? t.heuteCopied : t.heuteShare}
            </button>
          )}
        </div>
        {done === DAILY_GAMES.length && <p className="text-sm text-white/75 mt-3">{t.heuteAllDone}</p>}
      </section>

      {/* Die fünf Spiele */}
      <section className="cr-arcade-panel p-2 sm:p-3 mb-4">
        <ul className="flex flex-col divide-y divide-white/10">
          {DAILY_GAMES.map((g) => {
            const s = scores[g.key];
            const played = typeof s === 'number';
            return (
              <li key={g.key}>
                <Link to={`${g.path}${q}`} className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition-colors">
                  <img src={IMG[g.key]} alt="" className="h-11 w-11 object-contain shrink-0" draggable={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-cr text-lg text-white leading-tight" style={{ textShadow: 'var(--cr-text-outline)' }}>{t[g.title]}</span>
                    {played && (
                      <span className="mt-1.5 block h-2 rounded-full bg-black/35 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(3, s)}%`, background: TONE(s) }} />
                      </span>
                    )}
                  </span>
                  {played
                    ? <span className="font-cr text-2xl text-white tabular-nums w-14 text-right" style={{ textShadow: 'var(--cr-text-outline)' }}>{s}</span>
                    : <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green shrink-0">{t.play}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Bestenliste */}
      <section className="cr-arcade-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-cr text-xl text-white" style={{ textShadow: 'var(--cr-text-outline)' }}>{t.heuteBoard}</h2>
          {board && <span className="text-xs text-white/55">{t.heuteBoardPlayers(board.players)}</span>}
        </div>
        {!user && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 rounded-xl bg-black/25 px-3 py-2.5">
            <span className="text-sm text-white/75">{t.heuteLogin}</span>
            <button type="button" onClick={login} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">{t.heuteLoginBtn}</button>
          </div>
        )}
        {boardDown ? <p className="text-sm text-white/55">{t.heuteBoardDown}</p>
          : !board ? null
            : !board.top.length ? <p className="text-sm text-white/55">{t.heuteBoardEmpty}</p>
              : (
                <ol className="flex flex-col divide-y divide-white/10">
                  {board.top.map((e) => {
                    const mine = board.me && e.rank === board.me.rank && e.name === board.me.name;
                    return (
                      <li key={`${e.rank}-${e.name}`} className={`grid grid-cols-[2.2rem_minmax(0,1fr)_auto_3.5rem] items-center gap-2 py-2 ${mine ? 'text-[#ffd65c]' : 'text-white'}`}>
                        <span className="font-cr text-base tabular-nums text-white/70">{e.rank}</span>
                        <span className="truncate font-semibold text-sm">{e.name}{mine ? ` · ${t.heuteYou}` : ''}</span>
                        <Marks scores={e.scores} small />
                        <span className="font-cr text-lg text-right tabular-nums">{e.total}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
        {board?.me && !board.top.some((e) => e.rank === board.me.rank && e.name === board.me.name) && (
          <p className="text-sm text-[#ffd65c] mt-3">{t.heuteRank(board.me.rank)} · {board.me.total}</p>
        )}
        <p className="text-xs text-white/45 mt-3">{t.heuteFirstOnly}</p>
      </section>
    </GameFrame>
  );
}
