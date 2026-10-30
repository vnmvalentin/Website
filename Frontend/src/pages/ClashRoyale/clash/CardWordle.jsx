// CardWordle.jsx — /clash/wordle („Clashdle“): Rate eine beliebige Karte; jede Eigenschaft zeigt, ob sie mit der
// gesuchten Karte übereinstimmt (grün), danebenliegt (rot) oder bei Zahlen höher/niedriger ist (Pfeil). Versuche sind
// unbegrenzt — gezählt wird, wie viele man braucht. Tagesrunde (Datum-Seed, gleich für alle) oder freies Spiel.
// Daten: Merkmale (CARD_ATTRS), Elixier (cardElixir.js), Tempo + Leben (cardStats.json, Level 11).
import React, { useMemo, useRef, useState } from 'react';
import GameFrame from './GameFrame';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import { CrCrown, CrReplay, CrSearch } from '../ui/CrIcons';
import { CARD_ATTRS } from '../data/bingoAttributes';
import { elixirOf } from '../data/cardElixir';
import { POOL, STATS, seeded, berlinDay, readStore, writeStore, fmtNum } from './quizData';
import { useClashLang, pick } from './clashI18n';
import { playSound } from '../ui/sound';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';

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

/** Spalten: wie der Wert gelesen und verglichen wird. num = Zahl mit Pfeil, sonst nur gleich/ungleich */
const COLUMNS = [
  { key: 'elixir', label: ['Elixier', 'Elixir'], value: (id) => elixirOf(id), num: true, show: (v) => String(v) },
  { key: 'rarity', label: ['Seltenheit', 'Rarity'], value: (id) => byId[id]?.rarity, show: (v, l) => pick(RARITY[v] || [v, v], l) },
  { key: 'type', label: ['Art', 'Type'], value: typeOf, show: (v, l) => pick(TYPE[v], l) },
  { key: 'move', label: ['Bewegung', 'Movement'], value: moveOf, show: (v, l) => pick(MOVE[v], l) },
  { key: 'target', label: ['Ziele', 'Targets'], value: targetOf, show: (v, l) => pick(TARGET[v], l) },
  { key: 'speed', label: ['Tempo', 'Speed'], value: (id) => STATS[id]?.speed ?? null, num: true, show: (v) => (v == null ? '—' : String(v)) },
  { key: 'hp', label: ['Leben', 'Hitpoints'], value: (id) => STATS[id]?.hp ?? null, num: true, show: (v, l) => (v == null ? '—' : fmtNum(v, l)) },
];

/** Vergleich einer Spalte: 'hit' | 'miss' | 'up' (gesuchte ist höher) | 'down' */
function compare(col, guessId, secretId) {
  const a = col.value(guessId), b = col.value(secretId);
  if (a === b) return 'hit';
  if (!col.num || a == null || b == null) return 'miss';
  return b > a ? 'up' : 'down';
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
      seo={{ title: lang === 'en' ? 'Clash Royale Wordle (Clashdle)' : 'Clash Royale Wordle (Clashdle)', description: t.wordleSeo, path: '/clash/wordle' }}>
      <div className="flex justify-center mb-4">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={game.daily} onClick={() => restart(true)}>{t.daily}</button>
          <button type="button" role="tab" aria-selected={!game.daily} onClick={() => restart(false)}>{t.free}</button>
        </div>
      </div>

      <div className="cr-arcade-panel p-4 md:p-5 mb-4">
        {game.won ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-16 shrink-0 aspect-[4/5]"><CardFace id={secret.id} rarity={secret.rarity} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-cr text-2xl">{t.correct}</p>
              <p className="text-sm text-white/75">{t.wordleWon(secret.name, n)}</p>
            </div>
            <div className="flex items-center gap-1" aria-label={t.crowns(crownsFor(n))}>
              {[0, 1, 2].map((i) => <CrCrown key={i} size={30} className={i < crownsFor(n) ? '' : 'opacity-25 grayscale'} />)}
            </div>
            <ChunkyButton variant="green" size="sm" icon={CrReplay} onClick={() => restart(false)}>{t.newRound}</ChunkyButton>
            {game.daily && <p className="w-full text-xs text-white/50">{t.nextDaily}</p>}
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
        <div className="cr-arcade-panel p-2 md:p-3 overflow-x-auto custom-scrollbar">
          <table className="crw-table">
            <thead>
              <tr>
                <th>{t.wordleCard}</th>
                {COLUMNS.map((c) => <th key={c.key}>{pick(c.label, lang)}</th>)}
              </tr>
            </thead>
            <tbody>
              {game.guesses.map((id, row) => (
                <tr key={id} className={row === 0 ? 'is-new' : ''}>
                  <td className="crw-cardcell">
                    <span className="w-11 aspect-[4/5] block"><CardFace id={id} rarity={byId[id]?.rarity} /></span>
                    <span className="crw-name">{byId[id]?.name}</span>
                  </td>
                  {COLUMNS.map((c, i) => {
                    const r = compare(c, id, game.secret);
                    return (
                      <td key={c.key}>
                        <span className={`crw-cell is-${r}`} style={row === 0 ? { animationDelay: `${i * 90}ms` } : undefined}>
                          {c.show(c.value(id), lang)}
                          {r === 'up' && <b aria-label={t.wordleHigher}>▲</b>}
                          {r === 'down' && <b aria-label={t.wordleLower}>▼</b>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-white/45 px-1 pt-2">{t.wordleLegend}</p>
        </div>
      )}
    </GameFrame>
  );
}
