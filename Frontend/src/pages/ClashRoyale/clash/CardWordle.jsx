// CardWordle.jsx — /clash/wordle („Clashdle“): Rate eine beliebige Karte; jede Eigenschaft zeigt, ob sie mit der
// gesuchten Karte übereinstimmt (grün), knapp daneben liegt (orange, nur Zahlen) oder danebenliegt (rot); bei Zahlen
// zeigt ein Pfeil, ob die gesuchte Karte mehr oder weniger hat. Versuche sind unbegrenzt — gezählt wird, wie viele man
// braucht. Tagesrunde (Datum-Seed, gleich für alle) oder freies Spiel.
// Nach dem Gewinn zeigt ein Steckbrief alle Werte der gesuchten Karte. („Das weißt du schon“ über der Tabelle gab es
// kurz, auf Nutzerwunsch wieder entfernt — nicht erneut einbauen.)
// Daten: Merkmale (CARD_ATTRS), Elixier (cardElixir.js), Tempo, Leben, Schaden/s und Erscheinungsjahr
// (cardStats.json, Level 11 — Backend: npm run cr:card-stats).
import React, { useMemo, useRef, useState } from 'react';
import GameFrame from './GameFrame';
import NextGame from './NextGame';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import {
  CrCards, CrClock, CrCrown, CrElixir, CrHeart, CrRegion, CrReplay, CrSearch, CrStar, CrStopwatch, CrSword, CrTarget,
} from '../ui/CrIcons';
import { CARD_ATTRS } from '../data/bingoAttributes';
import { elixirOf } from '../data/cardElixir';
import { POOL, STATS, seeded, berlinDay, readStore, writeStore, fmtNum } from './quizData';
import { useClashLang, pick } from './clashI18n';
import { playSound } from '../ui/sound';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.webp';

const STORE = 'crq_wordle_v1';
const has = (id, k) => (CARD_ATTRS[id] || []).includes(k);
const byId = Object.fromEntries(POOL.map((c) => [c.id, c]));

const RARITY = { Common: ['Gewöhnlich', 'Common'], Rare: ['Selten', 'Rare'], Epic: ['Episch', 'Epic'], Legendary: ['Legendär', 'Legendary'], Champion: ['Champion', 'Champion'] };
const typeOf = (id) => (has(id, 'type_spell') ? 'spell' : has(id, 'type_building') ? 'building' : 'troop');
const TYPE = { troop: ['Truppe', 'Troop'], spell: ['Zauber', 'Spell'], building: ['Gebäude', 'Building'] };
const moveOf = (id) => (typeOf(id) !== 'troop' ? 'none' : has(id, 'move_air') ? 'air' : 'ground');
const MOVE = { air: ['Fliegt', 'Air'], ground: ['Boden', 'Ground'], none: ['—', '—'] };
const targetOf = (id) => (has(id, 'target_buildings') ? 'buildings' : has(id, 'target_ground_air') ? 'both' : has(id, 'target_ground') ? 'ground' : 'none');
const TARGET = { buildings: ['Gebäude', 'Buildings'], both: ['Luft & Boden', 'Air & Ground'], ground: ['Boden', 'Ground'], none: ['—', '—'] };
// Tempo wie im Spiel als Wort (Wiki-Werte 45/60/90/120); verglichen wird weiter die Zahl
const SPEED = { 45: ['Langsam', 'Slow'], 60: ['Mittel', 'Medium'], 90: ['Schnell', 'Fast'], 120: ['Sehr schnell', 'Very fast'] };
const stat = (k) => (id) => STATS[id]?.[k] ?? null;
const dash = (fn) => (v, l) => (v == null ? '—' : fn(v, l));
/** Relativer Abstand: innerhalb von share (z. B. 0.25 = 25 %) gilt als knapp */
const within = (share) => (a, b) => Math.abs(a - b) <= share * Math.max(a, b);

/**
 * Spalten: wie der Wert gelesen, gezeigt und verglichen wird. num = Zahl mit Pfeil; near(a, b) = knapp daneben (orange).
 * Neue Spalten nur anhängen bzw. einfügen — gespeichert werden nur die geratenen Karten, nicht die Spalten.
 */
const COLUMNS = [
  { key: 'elixir', icon: CrElixir, label: ['Elixier', 'Elixir'], value: (id) => elixirOf(id), num: true, near: (a, b) => Math.abs(a - b) <= 1, show: (v) => String(v) },
  { key: 'rarity', icon: CrStar, label: ['Seltenheit', 'Rarity'], value: (id) => byId[id]?.rarity, show: (v, l) => pick(RARITY[v] || [v, v], l) },
  { key: 'type', icon: CrCards, label: ['Art', 'Type'], value: typeOf, show: (v, l) => pick(TYPE[v], l) },
  { key: 'move', icon: CrRegion, label: ['Bewegung', 'Movement'], value: moveOf, show: (v, l) => pick(MOVE[v], l) },
  { key: 'target', icon: CrTarget, label: ['Ziele', 'Targets'], value: targetOf, show: (v, l) => pick(TARGET[v], l) },
  { key: 'speed', icon: CrStopwatch, label: ['Tempo', 'Speed'], value: stat('speed'), num: true, near: (a, b) => Math.abs(a - b) <= 30, show: dash((v, l) => pick(SPEED[v] || [String(v), String(v)], l)) },
  { key: 'hp', icon: CrHeart, label: ['Leben', 'Hitpoints'], value: stat('hp'), num: true, near: within(0.25), show: dash(fmtNum) },
  { key: 'dps', icon: CrSword, label: ['Schaden/s', 'DPS'], value: stat('dps'), num: true, near: within(0.25), show: dash(fmtNum) },
  { key: 'year', icon: CrClock, label: ['Jahr', 'Year'], value: stat('released'), num: true, near: (a, b) => Math.abs(a - b) <= 2, show: dash((v) => String(v)) },
];

/** Vergleich einer Spalte: 'hit' | 'miss' | 'up' / 'down' (gesuchte ist höher/niedriger, weit weg) | 'near-up' / 'near-down' */
function compare(col, guessId, secretId) {
  const a = col.value(guessId), b = col.value(secretId);
  if (a === b) return 'hit';
  if (!col.num || a == null || b == null) return 'miss';
  const dir = b > a ? 'up' : 'down';
  return col.near?.(a, b) ? `near-${dir}` : dir;
}
const isUp = (r) => r === 'up' || r === 'near-up';
const isDown = (r) => r === 'down' || r === 'near-down';
const tone = (r) => (r === 'hit' ? 'hit' : r.startsWith('near') ? 'near' : 'miss');

/** Ein Wert im Steckbrief nach dem Gewinn: Symbol, Spaltenname, Wert der gesuchten Karte */
function StatChip({ col, value, lang }) {
  const Icon = col.icon;
  return (
    <li className="crw-known is-hit">
      <Icon size={20} />
      <span className="min-w-0">
        <small>{pick(col.label, lang)}</small>
        <b>{col.show(value, lang)}</b>
      </span>
    </li>
  );
}

function newGame(daily) {
  const day = berlinDay();
  const rand = daily ? seeded(`wordle|${day}`) : Math.random;
  return { daily, day, secret: POOL[Math.floor(rand() * POOL.length)].id, guesses: [], won: false };
}
const crownsFor = (n) => (n <= 3 ? 3 : n <= 6 ? 2 : 1);

function search(query, exclude) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return POOL
    .filter((c) => !exclude.has(c.id) && c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export default function CardWordle() {
  const { lang, t } = useClashLang();
  const [game, setGame] = useState(() => {
    const saved = readStore(STORE, {}).daily;
    return saved && saved.day === berlinDay() ? saved : newGame(true);
  });
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const guessed = useMemo(() => new Set(game.guesses), [game.guesses]);
  const results = game.won ? [] : search(query, guessed);

  const save = (update) => setGame((prev) => {
    const g = typeof update === 'function' ? update(prev) : update;
    if (g.daily) writeStore(STORE, { daily: g });
    return g;
  });

  const guess = (c) => {
    if (!c || game.won) return;
    setQuery('');
    setActive(0);
    const won = c.id === game.secret;
    playSound(won ? 'win' : 'pick');
    save((g) => ({ ...g, guesses: [c.id, ...g.guesses], won }));
    if (!won) inputRef.current?.focus();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); guess(results[active]); }
  };
  const restart = (daily) => {
    setQuery('');
    const saved = readStore(STORE, {}).daily;
    setGame(daily ? (saved?.day === berlinDay() ? saved : newGame(true)) : newGame(false));
  };
  const secret = byId[game.secret];
  const n = game.guesses.length;

  return (
    <GameFrame wide title={t.wordleTitle} icon={scrollImg}
      seo={{ title: 'Clash Royale Wordle (Clashdle)', description: t.wordleSeo, path: '/clash/wordle' }}>
      <div className="flex justify-center mb-4">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={game.daily} onClick={() => restart(true)}>{t.daily}</button>
          <button type="button" role="tab" aria-selected={!game.daily} onClick={() => restart(false)}>{t.free}</button>
        </div>
      </div>

      <div className="cr-arcade-panel p-4 md:p-5 mb-4">
        {game.won ? (
          <div className="crw-win">
            <span className="crw-win-card"><CardFace id={secret.id} rarity={secret.rarity} /></span>
            <div className="min-w-0 flex-1 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-cr text-3xl leading-none">{t.correct}</p>
                  <p className="text-sm text-white/75 mt-1">{t.wordleWon(secret.name, n)}</p>
                </div>
                <div className="flex items-center gap-1" aria-label={t.crowns(crownsFor(n))}>
                  {[0, 1, 2].map((i) => <CrCrown key={i} size={34} className={i < crownsFor(n) ? 'crw-crown' : 'opacity-25 grayscale'} style={{ animationDelay: `${i * 140}ms` }} />)}
                </div>
              </div>
              {/* Steckbrief der gesuchten Karte: alle Spalten auf einen Blick */}
              <ul className="crw-knownlist">
                {COLUMNS.map((c) => <StatChip key={c.key} col={c} value={c.value(secret.id)} lang={lang} />)}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <ChunkyButton variant="green" size="sm" icon={CrReplay} onClick={() => restart(false)}>{t.newRound}</ChunkyButton>
                {game.daily && <p className="text-xs text-white/50">{t.nextDaily}</p>}
              </div>
            </div>
            <NextGame current="wordle" className="w-full" />
          </div>
        ) : (
          <>
            <p className="text-white/80 text-sm mb-3">{t.wordleHelp}</p>
            <div className="relative">
              <CrSearch size={20} className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
                placeholder={t.typeName} aria-label={t.typeName} autoComplete="off" className="crq-input" />
              {results.length > 0 && (
                <ul className="crq-suggest" role="listbox">
                  {results.map((c, i) => (
                    <li key={c.id} role="option" aria-selected={i === active}>
                      <button type="button" className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={() => guess(c)}>
                        <span className="w-8 aspect-[4/5] shrink-0"><CardFace id={c.id} rarity={c.rarity} /></span>
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {n > 0 && <p className="text-xs text-white/50 mt-2">{t.wordleTries(n)}</p>}
          </>
        )}
      </div>

      {n > 0 && (
        <div className="cr-arcade-panel p-2 md:p-3">
          <div className="overflow-x-auto custom-scrollbar">
          <table className="crw-table">
            <thead>
              <tr>
                <th className="crw-sticky">{t.wordleCard}</th>
                {COLUMNS.map((c) => {
                  const Icon = c.icon;
                  return <th key={c.key}><span className="crw-th"><Icon size={22} />{pick(c.label, lang)}</span></th>;
                })}
              </tr>
            </thead>
            <tbody>
              {game.guesses.map((id, row) => (
                <tr key={id} className={row === 0 ? 'is-new' : ''}>
                  <td className="crw-sticky">
                    <span className="crw-cardcell">
                      <span className="w-11 aspect-[4/5] block shrink-0"><CardFace id={id} rarity={byId[id]?.rarity} /></span>
                      <span className="crw-name">{byId[id]?.name}</span>
                    </span>
                  </td>
                  {COLUMNS.map((c, i) => {
                    const r = compare(c, id, game.secret);
                    return (
                      <td key={c.key}>
                        <span className={`crw-cell is-${tone(r)}`} style={row === 0 ? { animationDelay: `${i * 80}ms` } : undefined}>
                          {c.show(c.value(id), lang)}
                          {isUp(r) && <b aria-label={t.wordleHigher}>▲</b>}
                          {isDown(r) && <b aria-label={t.wordleLower}>▼</b>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="text-[11px] text-white/45 px-1 pt-2">{t.wordleLegend}</p>
        </div>
      )}
    </GameFrame>
  );
}
