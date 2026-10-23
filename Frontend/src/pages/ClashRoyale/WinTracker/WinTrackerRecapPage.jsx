// WinTrackerRecapPage.jsx — /clash-royale/win-tracker/rueckblick?season=JJJJ-MM: die eigene Seite zum Saisonende.
// Alles aus GET /api/cr-wintracker/recap (Backend: lib/winTrackerRecap.js): Bilanz, Höchststände, Verlauf über die
// Saison, alle Modi, beste Decks (Decks je Match erst seit Okt. 2026), Gains & Tilts. Arcade-Look wie der Editor
// (CrShell, .cr-arcade-panel, ArcadeTitle); Sprache wie im Editor (settings.language, kommt mit der Antwort).
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftToLine, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import ArcadeTitle from '../ui/ArcadeTitle';
import ChunkyButton from '../ui/ChunkyButton';
import { SegmentedControl } from '../ui/SettingRow';
import { CrTrophy, CrCards, CrBattle, CrScroll, CrCrownBlue } from '../ui/CrIcons';
import { leagueIconUrl, leagueName, MEDAL_ICON_URL, LEAGUE_MEDAL_ICON_URL, seasonalBadgeUrl } from '../data/leagueIcons';
import { cardImageUrl } from '../data/cards';
import * as api from './winTrackerApi';
import { dictForWt } from './wtI18n';

const chipClass = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ''));
const GOLD = 'var(--cr-arcade-gold)';

function Panel({ icon: Icon, title, children, className = '' }) {
  return (
    <section className={`cr-arcade-panel cr-anim-rise ${className}`}>
      {title && (
        <div className="cr-section pb-0">
          <h2 className="cr-section-title text-xl">{Icon && <Icon size={28} />}{title}</h2>
        </div>
      )}
      <div className="cr-section">{children}</div>
    </section>
  );
}

function Big({ value, label, color = '#fff' }) {
  return (
    <div className="min-w-0 text-center">
      <div className="font-cr text-4xl md:text-6xl leading-none tabular-nums" style={{ color, textShadow: 'var(--cr-text-outline-thick)' }}>{value}</div>
      <div className="font-cr text-sm md:text-base text-white/60 mt-2">{label}</div>
    </div>
  );
}

/** Schöne Schrittweite für die Achse: höchstens ~5 Linien */
function axisTicks(lo, hi) {
  const span = hi - lo || 1;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => span / s <= 5) || 10000;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

/**
 * Verlauf über die Saison. Waagerecht nach Matches (jedes Match gleich breit — Nächte und Pausen sind keine Strecke),
 * Tage als Marken darunter. SVG nur für Fläche + Linie (gestreckt); Achse, Punkte, Marken und der Hinweis beim
 * Überfahren sind HTML darüber, damit nichts verzerrt. Bei Medaillen: echte Stände am Rand (zurückgerechnet vom
 * aktuellen Stand), Aufstieg durch Liga 1–6 als eigener Abschnitt, Liga-Wechsel/UC-Einstieg als Marken.
 */
function SeasonChart({ curve, climb, medals, t, lang, unit, startLabel }) {
  const [hover, setHover] = useState(null);
  const W = 1000;
  const H = 280;
  const PADY = 22;
  const pts = curve.points;
  const loc = lang === 'en' ? 'en-US' : 'de-DE';
  const off = Number.isFinite(curve.offset) ? curve.offset : null;
  const abs = (v) => (off !== null ? off + v : v);
  const num = (v) => v.toLocaleString(loc);
  const sign = (v) => `${v > 0 ? '+' : ''}${num(v)}`;
  const showClimb = curve.metric === 'medals' && climb && curve.ucFrom;
  const t0 = showClimb ? Math.min(climb.from, pts[0].t) : pts[0].t;
  const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const climbN = showClimb ? climb.matches : 0; // Aufstiegs-Matches stehen links vor der Kurve
  const total = Math.max(1, climbN + (curve.count ?? pts.length - 1));
  const lo = Math.min(0, curve.min);
  const hi = Math.max(0, curve.max);
  const span = hi - lo || 1;
  const xf = (p) => (climbN + (p.i ?? 0)) / total; // 0..1, nach Match-Nummer
  // Zeitpunkt → Position: im Aufstieg anteilig über seine Breite, danach am ersten Kurvenpunkt ab dem Zeitpunkt
  const xAt = (ms) => {
    if (showClimb && ms < curve.ucFrom) return (Math.max(0, ms - climb.from) / Math.max(1, curve.ucFrom - climb.from)) * (climbN / total);
    const p = pts.find((q) => q.t >= ms);
    return p ? xf(p) : 1;
  };
  const yf = (v) => (PADY + (1 - (v - lo) / span) * (H - PADY * 2)) / H; // 0..1
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${(xf(p) * W).toFixed(1)},${(yf(p.v) * H).toFixed(1)}`).join(' ');
  const area = `${line} L${(xf(pts[pts.length - 1]) * W).toFixed(1)},${(yf(lo) * H).toFixed(1)} L${(xf(pts[0]) * W).toFixed(1)},${(yf(lo) * H).toFixed(1)} Z`;
  const hiP = pts.reduce((a, p) => (p.v > a.v ? p : a), pts[0]);
  const loP = pts.reduce((a, p) => (p.v < a.v ? p : a), pts[0]);
  const ticks = axisTicks(abs(lo), abs(hi));
  const date = (ms) => new Date(ms).toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  const stamp = (ms) => new Date(ms).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const up = curve.end >= 0;
  const pct = (f) => `${(f * 100).toFixed(2)}%`;
  const marks = (curve.leagueMarks || []).filter((m) => m.t >= t0 && m.t <= t1);
  // Tageswechsel als Marken unten — mit Mindestabstand, damit sich die Daten nicht überlappen
  const dayKey = (ms) => new Date(ms).toDateString();
  const days = [];
  const pushDay = (x, ms) => { if (!days.length || x - days[days.length - 1].x >= (x > 0.88 ? 0.2 : 0.09)) days.push({ x, ms }); };
  if (showClimb) pushDay(0, climb.from);
  pts.forEach((p, i) => { if (i === 0 ? !showClimb : dayKey(p.t) !== dayKey(pts[i - 1].t)) pushDay(xf(p), p.t); });

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(xf(p) - fx) < Math.abs(xf(pts[best]) - fx)) best = i; });
    // Im Aufstiegs-Abschnitt gibt es keine Medaillen — dort nichts anzeigen
    setHover(showClimb && fx < climbN / total - 0.01 ? null : best);
  };
  const hp = hover !== null ? pts[hover] : null;
  const resultText = (r) => (r === 'win' ? t.rp.tipWin : r === 'loss' ? t.rp.tipLoss : r ? t.rp.tipDraw : t.rp.tipStart);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        {medals ? (
          <div>
            <div className="font-cr text-4xl leading-none tabular-nums" style={{ textShadow: 'var(--cr-text-outline-thick)' }}>
              <span className="text-white/80">{medals.approx ? '≈' : ''}{num(medals.start)}</span>
              <span className="text-white/50 mx-2">→</span>
              <span className="text-white">{num(medals.end)}</span>
            </div>
            <div className="font-cr text-sm text-white/60 mt-1">
              {startLabel || t.rp.ucStartEnd} · <span style={{ color: medals.gain >= 0 ? '#4ade80' : '#f87171' }}>{sign(medals.gain)}</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-cr text-4xl leading-none" style={{ color: up ? '#4ade80' : '#f87171', textShadow: 'var(--cr-text-outline-thick)' }}>{sign(curve.end)}</div>
            <div className="font-cr text-sm text-white/60 mt-1">{unit} · {t.rp.chartEnd}</div>
          </div>
        )}
        <div className="flex gap-5 font-cr text-sm">
          <span className="text-white/60">{t.rp.chartMax} <span className="text-white">{off !== null ? num(abs(curve.max)) : sign(curve.max)}</span></span>
          <span className="text-white/60">{t.rp.chartMin} <span className="text-white">{off !== null ? num(abs(curve.min)) : sign(curve.min)}</span></span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Achse am Rand: echte Stände (Medaillen) bzw. relative Werte */}
        <div className="relative w-12 shrink-0 h-48 md:h-64 font-cr text-[11px] text-white/55 tabular-nums" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: pct(yf(v - (off ?? 0))) }}>{off !== null ? num(v) : sign(v)}</span>
          ))}
        </div>
        <div
          className="relative flex-1 min-w-0 h-48 md:h-64 rounded-xl overflow-hidden border-2 border-[#0b1a30] bg-[#0f2a4d] touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={t.rp.chartTitle[curve.metric]}>
            {ticks.map((v) => (
              <line key={v} x1="0" x2={W} y1={yf(v - (off ?? 0)) * H} y2={yf(v - (off ?? 0)) * H} stroke="rgba(255,255,255,0.07)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
            {off === null && <line x1="0" x2={W} y1={yf(0) * H} y2={yf(0) * H} stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />}
            <path d={area} fill={up ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)'} />
            <path d={line} fill="none" stroke="#ffcf3f" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {days.map((d) => d.x > 0 && (
            <div key={d.ms} className="absolute inset-y-0 w-px bg-white/[0.06] pointer-events-none" style={{ left: pct(d.x) }} />
          ))}

          {/* Abschnitt Aufstieg Liga 1–6: dort zählt die API Stufen, keine Medaillen */}
          {showClimb && (
            <div className="absolute inset-y-0 left-0 bg-[#0b1a30]/55 border-r-2 border-dashed border-white/25 flex items-start justify-center overflow-hidden"
              style={{ width: pct(climbN / total) }}>
              <div className={`mt-3 px-2 text-center font-cr text-[11px] md:text-xs text-white/70 leading-tight ${climbN / total < 0.35 ? 'hidden md:block' : ''}`}>
                <div>{t.rp.climbLabel}</div>
                <div className="text-white/50 mt-0.5 tabular-nums">{climb.wins}–{climb.losses}</div>
              </div>
            </div>
          )}

          {/* Liga-Wechsel aus dem Verlauf + Einstieg in Ultimate Champion */}
          {marks.map((m) => {
            const icon = leagueIconUrl(m.league);
            return (
              <div key={`${m.league}-${m.t}`} className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none" style={{ left: pct(m.league === 7 && showClimb ? climbN / total : xAt(m.t)) }}>
                {icon ? <img src={icon} alt="" title={leagueName(m.league, lang)} className="w-7 h-7 object-contain mt-1" /> : null}
                <div className="flex-1 border-l-2 border-dashed border-[#ffcf3f]/50" />
              </div>
            );
          })}

          {/* Hoch- und Tiefpunkt */}
          {[[hiP, '#4ade80'], [loP, '#f87171']].map(([p, c]) => (
            <span key={c} className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#0b1a30] pointer-events-none"
              style={{ left: pct(xf(p)), top: pct(yf(p.v)), background: c }} />
          ))}

          {/* Hinweis beim Überfahren: Zeit, Ergebnis, Änderung, Stand */}
          {hp && (
            <>
              <div className="absolute inset-y-0 w-px bg-white/40 pointer-events-none" style={{ left: pct(xf(hp)) }} />
              <span className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#0b1a30] pointer-events-none"
                style={{ left: pct(xf(hp)), top: pct(yf(hp.v)) }} />
              <div className="absolute top-2 z-10 pointer-events-none px-3 py-2 rounded-lg bg-[#0b1a30] border border-white/15 font-cr text-xs text-white whitespace-nowrap"
                style={xf(hp) > 0.6 ? { right: pct(1 - xf(hp) + 0.015) } : { left: pct(xf(hp) + 0.015) }}>
                <div className="text-white/60">{stamp(hp.t)}</div>
                <div className="text-base leading-tight tabular-nums">{off !== null ? `${num(abs(hp.v))} ${unit}` : `${sign(hp.v)} ${unit}`}</div>
                <div className="tabular-nums">
                  <span className={hp.r === 'win' ? 'text-green-400' : hp.r === 'loss' ? 'text-red-400' : 'text-white/60'}>{resultText(hp.r)}</span>
                  {hp.c !== null && hp.c !== undefined ? <span className="text-white/70"> · {sign(hp.c)}</span> : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <div className="w-12 shrink-0" />
        <div className="relative flex-1 min-w-0 h-4 font-cr text-[11px] text-white/50" aria-hidden="true">
          {/* Handy: nur jedes zweite Datum, sonst laufen sie ineinander */}
          {days.map((d, i) => (
            <span key={d.ms} className={`absolute whitespace-nowrap ${i % 2 ? 'hidden sm:block' : ''}`} style={d.x > 0.88 ? { right: 0 } : { left: pct(d.x) }}>{date(d.ms)}</span>
          ))}
        </div>
      </div>
      {medals?.approx && <p className="text-xs text-white/45 mt-2">{t.rp.approxHint}</p>}
    </div>
  );
}

/** Anzeigename einer Modus-Gruppe; Sondermodi tragen ihren Namen aus dem Spiel mit (z.B. "Spooky Chess League") */
function modeName(m, t) {
  if (m.label) return m.label;
  if (t.recapModes[m.mode]) return t.recapModes[m.mode];
  return m.mode.replace(/^s:/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const subName = (label, t) => t.rp.subNames[label] || label;
const SUBS_SHOWN = 4;

function ModeRow({ m, t, lang, onOpen }) {
  const [open, setOpen] = useState(false);
  const decided = m.wins + m.losses;
  const pct = decided ? Math.round((m.wins / decided) * 100) : null;
  const subs = open ? m.subs : m.subs.slice(0, SUBS_SHOWN);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="font-cr text-lg text-white hover:text-[var(--cr-arcade-gold)] transition-colors inline-flex items-center gap-1 text-left">
            {modeName(m, t)}<ChevronRight size={16} className="shrink-0" />
          </button>
        ) : (
          <span className="font-cr text-lg text-white">{modeName(m, t)}</span>
        )}
        <span className="font-cr text-sm text-white/70 tabular-nums">
          <span className="text-green-400">{m.wins}</span> – <span className="text-red-400">{m.losses}</span>
          {m.draws ? <span className="text-white/50"> – {m.draws}</span> : null}
          {pct !== null && <span className="text-white/50"> · {pct} %</span>}
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden bg-[#0b1a30] flex" aria-hidden="true">
        <div className="bg-green-500" style={{ width: `${(m.wins / m.count) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(m.losses / m.count) * 100}%` }} />
      </div>
      <div className="text-xs text-white/40 mt-1">{fill(t.rp.deckMatches, { n: m.count.toLocaleString(lang === 'en' ? 'en-US' : 'de-DE') })}</div>
      {m.subs.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {subs.map((x) => (
            <li key={x.label} className="flex items-baseline justify-between gap-3 pl-3 border-l-2 border-white/10">
              <span className="text-white/75 truncate">{subName(x.label, t)}</span>
              <span className="tabular-nums text-white/55 shrink-0">
                <span className="text-green-400/90">{x.wins}</span>–<span className="text-red-400/90">{x.losses}</span>
                <span className="text-white/35"> · {x.count}</span>
              </span>
            </li>
          ))}
          {m.subs.length > SUBS_SHOWN && (
            <li>
              <button type="button" onClick={() => setOpen((o) => !o)} className="pl-3 text-xs text-white/50 hover:text-white inline-flex items-center gap-1">
                <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
                {open ? t.rp.subsLess : fill(t.rp.subsMore, { n: m.subs.length - SUBS_SHOWN })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function DeckRow({ d, t, rank }) {
  return (
    <div className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
      <div className="flex items-center gap-3 md:w-40 shrink-0">
        <span className="font-cr text-3xl leading-none" style={{ color: rank === 0 ? GOLD : '#fff', textShadow: 'var(--cr-text-outline-thick)' }}>#{rank + 1}</span>
        <div>
          <div className="font-cr text-2xl leading-none" style={{ color: d.winRate >= 50 ? '#4ade80' : '#f87171' }}>{d.winRate} %</div>
          <div className="font-cr text-xs text-white/60 mt-1">{d.wins}–{d.losses} · {fill(t.rp.deckMatches, { n: d.matches })}</div>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1 md:gap-1.5 flex-1 max-w-xl">
        {d.cards.map((c, i) => {
          const src = c.id ? cardImageUrl(c.id, c.variant) : null;
          return src
            ? <img key={i} src={src} alt={c.name} title={c.name} loading="lazy" className="w-full aspect-[285/420] object-contain" />
            : <div key={i} title={c.name} className="w-full aspect-[285/420] rounded bg-[#0b1a30]" />;
        })}
      </div>
    </div>
  );
}

function GainTile({ label, value, sub, color }) {
  return (
    <div className="cr-row min-w-0 px-4 py-3 rounded-xl bg-[#0b1a30]/60">
      <div className="font-cr text-sm text-white/60 leading-tight">{label}</div>
      <div className="font-cr text-2xl md:text-3xl leading-tight tabular-nums whitespace-nowrap" style={{ color, textShadow: 'var(--cr-text-outline)' }}>{value}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

export default function WinTrackerRecapPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [params, setParams] = useSearchParams();
  const season = params.get('season') || '';
  const tabParam = params.get('reiter') || 'overview';
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    if (!user) { setState({ loading: false, data: null, error: '' }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api.getRecap(season)
      .then((d) => { if (alive) setState({ loading: false, data: d, error: '' }); })
      .catch((e) => { if (alive) setState({ loading: false, data: null, error: e.message }); });
    return () => { alive = false; };
  }, [season, user]);

  const data = state.data;
  const lang = data?.lang === 'en' ? 'en' : 'de';
  const t = dictForWt(lang);
  const overview = data?.recap;
  const specials = overview?.specials || [];
  const special = specials.find((x) => x.key === tabParam) || null;
  // Im Reiter eines Sondermodus zeigt dieselbe Seite dessen eigene Zahlen
  const r = special || overview;
  const openTab = (key) => setParams((p) => { const n = new URLSearchParams(p); if (key === 'overview') n.delete('reiter'); else n.set('reiter', key); return n; });
  const num = (n) => (Number(n) || 0).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');
  const sign = (n) => `${n > 0 ? '+' : ''}${num(n)}`;
  const unit = r?.curve ? { medals: t.rp.unitMedals, trophies: t.rp.unitTrophies, record: t.rp.unitRecord, points: t.rp.unitPoints }[r.curve.metric] : '';
  // Unterzeile für Gain/Tilt in zwei kurzen Zeilen: echter Stand vorher → nachher (falls bekannt), dann Tag + Bilanz
  const shortDate = (iso) => { const [, m, d] = iso.split('-'); return lang === 'en' ? `${m}/${d}` : `${d}.${m}.`; };
  const daySpan = (x) => (
    <>
      {x.from !== null && x.from !== undefined && <span className="block truncate tabular-nums">{num(x.from)} → {num(x.to)}</span>}
      <span className="block truncate">{shortDate(x.date)} · {x.wins}–{x.losses}</span>
    </>
  );
  const chips = useMemo(() => (data?.seasons || []).slice(0, 6).map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { id: k, label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { month: 'short', year: '2-digit', timeZone: 'UTC' }) };
  }), [data?.seasons, lang]);

  return (
    // Eigene Scroll-Fläche wie im Editor: die CrShell ist bildschirmhoch mit overflow-hidden
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
    <div className="min-h-full flex flex-col">
      <SEO title="Win Tracker · Saisonrückblick" description="Dein Clash-Royale-Saisonrückblick aus dem Win Tracker." path="/clash-royale/win-tracker/rueckblick" noindex />

      <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
        <Link to="/clash-royale/win-tracker" className={`${chipClass} px-3.5`}>
          <ArrowLeftToLine size={16} />
          <span className="hidden sm:inline">{t.rp.back}</span>
        </Link>
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-5">
        <div className="flex flex-col items-center text-center">
          <p className="font-cr text-[15px] md:text-lg tracking-[0.18em] uppercase" style={{ color: GOLD, textShadow: '0 2px 0 rgba(2,8,20,0.7)' }}>
            {t.rp.kicker}
          </p>
          <ArcadeTitle as="h1" className="text-4xl md:text-6xl leading-none">{data?.season?.label || 'Clash Royale'}</ArcadeTitle>
          {data && <p className="font-cr text-white/70 text-base md:text-lg mt-2">{data.playerName}</p>}
        </div>

        {!user && (
          <Panel>
            <div className="text-center py-6">
              <CrTrophy size={56} className="mx-auto mb-3" />
              <p className="font-cr text-xl text-white mb-5">{t.loginRequired}</p>
              <ChunkyButton onClick={() => login(false)}><TwitchGlyph size={17} />{t.loginButton}</ChunkyButton>
            </div>
          </Panel>
        )}
        {user && state.loading && !data && <p className="flex items-center justify-center gap-2 text-white/60 py-10"><Loader2 size={18} className="animate-spin" />{t.rp.loading}</p>}
        {user && state.error && <Panel><p className="text-red-200 text-sm" role="alert">{state.error}</p></Panel>}

        {data && !data.season && (
          <Panel>
            <div className="text-center py-8">
              <CrScroll size={56} className="mx-auto mb-3" />
              <p className="font-cr text-2xl text-white mb-2" style={{ textShadow: 'var(--cr-text-outline)' }}>{t.rp.waitTitle}</p>
              <p className="text-white/60 max-w-md mx-auto">
                {fill(t.rp.waitText, {
                  season: data.next.label,
                  date: new Date(data.next.end).toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { day: 'numeric', month: 'long' }),
                  days: Math.max(1, Math.ceil((data.next.end - Date.now()) / 86400000)),
                })}
              </p>
            </div>
          </Panel>
        )}

        {data?.season && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <SegmentedControl options={chips} value={data.season.key} onChange={(k) => setParams({ season: k })} />
              {overview.matches > 0 && (
                <a href={api.recapImageUrl(data.season.key)} download className="cr-arcade-btn font-arcade cr-arcade-btn--green cr-arcade-btn--sm">
                  <Download size={14} /> {t.recapDownload}
                </a>
              )}
            </div>

            {/* Reiter: Übersicht + je Sondermodus der Saison (Saison-Modi wie Spooky Chess, 2v2 Ranked) */}
            {specials.length > 0 && overview.matches > 0 && (
              <div className="flex justify-center">
                <div className="cr-tabs max-w-full" role="tablist">
                  <button role="tab" aria-selected={!special} onClick={() => openTab('overview')}>
                    <CrScroll size={24} /><span className="cr-tab-label">{t.rp.tabOverview}</span>
                  </button>
                  {specials.map((sp) => {
                    const badge = seasonalBadgeUrl(sp.key);
                    return (
                      <button key={sp.key} role="tab" aria-selected={special?.key === sp.key} onClick={() => openTab(sp.key)}>
                        {badge ? <img src={badge} alt="" className="w-6 h-6 object-contain" /> : <CrBattle size={24} />}
                        <span className="cr-tab-label">{modeName({ mode: sp.key, label: sp.label }, t)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {r.matches === 0 ? (
              <Panel><p className="text-white/60 text-center py-6">{t.recapEmpty}</p></Panel>
            ) : (
              <>
                <Panel>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-2">
                    <Big value={num(r.wins)} label={t.recapWins} color="#4ade80" />
                    <Big value={num(r.losses)} label={t.rp.losses} color="#f87171" />
                    <Big value={r.winRate === null ? '–' : `${r.winRate}%`} label={t.recapWinRate} color={GOLD} />
                    <Big value={num(r.matches)} label={t.rp.matches} />
                  </div>
                </Panel>

                {r.peak && (
                  <Panel icon={CrTrophy} title={t.rp.peakTitle}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {r.peak.points ? (
                        <div className="flex items-center gap-3">
                          <img src={seasonalBadgeUrl(special?.key) || LEAGUE_MEDAL_ICON_URL} alt="" className="w-12 h-12 object-contain" />
                          <div><div className="font-cr text-3xl leading-none text-white" style={{ textShadow: 'var(--cr-text-outline)' }}>{num(r.peak.points)}</div><div className="font-cr text-sm text-white/60 mt-1">{t.rp.peakPoints}</div></div>
                        </div>
                      ) : null}
                      {r.peak.medals ? (
                        <div className="flex items-center gap-3">
                          <img src={MEDAL_ICON_URL} alt="" className="w-12 h-12 object-contain" />
                          <div><div className="font-cr text-3xl leading-none text-white" style={{ textShadow: 'var(--cr-text-outline)' }}>{num(r.peak.medals)}</div><div className="font-cr text-sm text-white/60 mt-1">{t.rp.peakMedals}</div></div>
                        </div>
                      ) : null}
                      {r.peak.rank ? (
                        <div className="flex items-center gap-3">
                          <span className="font-cr text-3xl" style={{ color: GOLD }}>#</span>
                          <div><div className="font-cr text-3xl leading-none text-white" style={{ textShadow: 'var(--cr-text-outline)' }}>{num(r.peak.rank)}</div><div className="font-cr text-sm text-white/60 mt-1">{t.rp.peakRank}</div></div>
                        </div>
                      ) : null}
                      {r.peak.league ? (
                        <div className="flex items-center gap-3">
                          <img src={leagueIconUrl(r.peak.league)} alt="" className="w-12 h-12 object-contain" />
                          <div><div className="font-cr text-2xl leading-none text-white" style={{ textShadow: 'var(--cr-text-outline)' }}>{leagueName(r.peak.league, lang)}</div><div className="font-cr text-sm text-white/60 mt-1">{t.rp.peakLeague}</div></div>
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                )}

                {r.curve && r.curve.points.length > 1 && (
                  <Panel icon={CrScroll} title={t.rp.chartTitle[r.curve.metric]}>
                    <SeasonChart curve={r.curve} climb={r.climb} medals={r.medals} t={t} lang={lang} unit={unit}
                      startLabel={special ? t.rp.pointsStartEnd : undefined} />
                  </Panel>
                )}

                <div className={`grid grid-cols-1 gap-5 ${special ? '' : 'lg:grid-cols-2'}`}>
                  {!special && (
                    <Panel icon={CrBattle} title={t.rp.modesTitle}>
                      <div className="divide-y divide-white/10 -my-3">
                        {r.modes.map((m) => (
                          <ModeRow key={m.mode} m={m} t={t} lang={lang}
                            onOpen={specials.some((x) => x.key === m.mode) ? () => openTab(m.mode) : undefined} />
                        ))}
                      </div>
                      <p className="text-xs text-white/40 mt-4">{t.rp.modesHint}</p>
                    </Panel>
                  )}

                  <Panel icon={CrCrownBlue} title={t.rp.gainsTitle}>
                    <div className={`grid grid-cols-2 gap-3 ${special ? 'md:grid-cols-3' : ''}`}>
                      {r.biggestGain && <GainTile label={t.rp.bestDayGain} value={`${sign(r.biggestGain.net)}`} color="#4ade80"
                        sub={daySpan(r.biggestGain)} />}
                      {r.biggestTilt && <GainTile label={t.rp.worstDay} value={`${sign(r.biggestTilt.net)}`} color="#f87171"
                        sub={daySpan(r.biggestTilt)} />}
                      <GainTile label={t.recapStreak} value={num(r.longestWinStreak)} color="#4ade80" />
                      <GainTile label={t.rp.lossStreak} value={num(r.longestLossStreak)} color="#f87171" />
                      <GainTile label={t.recapThreeCrowns} value={num(r.threeCrownWins)} color={GOLD} />
                      {r.topHour !== null && <GainTile label={t.recapFavTime} value={fill(t.recapHours, { a: r.topHour, b: (r.topHour + 1) % 24 })} color="#fff" />}
                    </div>
                  </Panel>
                </div>

                <Panel icon={CrCards} title={t.rp.decksTitle}>
                  {r.decks.length > 0 ? (
                    <div className="divide-y divide-white/10 -my-4">
                      {r.decks.map((d, i) => <DeckRow key={i} d={d} t={t} rank={i} />)}
                    </div>
                  ) : (
                    <p className="text-white/60 text-sm">{r.decksTracked > 0 ? t.rp.decksFew : t.rp.decksNone}</p>
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}
