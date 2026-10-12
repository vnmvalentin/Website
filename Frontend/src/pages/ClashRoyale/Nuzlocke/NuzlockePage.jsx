// NuzlockePage.jsx — Nuzlocke-Challenge für Clash Royale (/nuzlocke).
//
// Seit Oktober 2026 im selben Arcade-Look wie Minigames und Win-Tracker: läuft in der CrShell
// (ohne Website-Kopfzeile), oben die Chip-Leiste wie im Hub, darunter EINE Fläche
// (.cr-arcade-panel) pro Reiter, Abschnitte nur durch die eingeprägte Fuge (.cr-section)
// getrennt — keine schwebenden Einzelkarten. Logik und API (nuzlockeApi.js) sind unverändert,
// das OBS-Overlay für gebannte Karten (BannedCardsOverlayPage.jsx) ebenfalls.
import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, X, Search, RefreshCw, Trash2, Copy, Check, Eye, EyeOff, Minus, ArrowLeft, ArrowLeftToLine, Dices,
} from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { ALL_CARDS, RARITY_COLOR, cardImageUrl } from '../data/cards';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';
import Modal from '../ui/Modal';
import ChunkyButton from '../ui/ChunkyButton';
import ArcadeTitle from '../ui/ArcadeTitle';
import {
  CrFriends, CrTrophy, CrSettings, CrBook, CrUserAdd, CrCards, CrSkull, CrTv, CrCheck, CrRandom,
} from '../ui/CrIcons';
import { useCrPrefs } from '../ui/crPrefs';
import CardWheel, { SPIN_DURATION_MS } from './CardWheel';
import * as api from './nuzlockeApi';

const DECK_SIZE = 8;
const fmt = (n) => (n || 0).toLocaleString('de-DE');

// Gemeinsamer Stil der Leisten-Chips oben — derselbe wie im Hub und im Win-Tracker.
const chipClass = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

// ── Kleine Bausteine ─────────────────────────────────────────────────────────
function CardThumb({ id, name, rarity, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-md ${className}`}
      style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={cardImageUrl(id)} alt={name} title={name}
        className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function TrophyValue({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img src={trophyIcon} alt="" className="h-5 w-auto object-contain" />
      <span className="font-cr text-lg leading-none tabular-nums text-white">{fmt(value)}</span>
    </span>
  );
}

// Suchergebnisse unter einem Suchfeld — eigene kleine Arcade-Fläche statt Glas-Panel.
function CardResults({ results, onPick, emptyText, className = '' }) {
  return (
    <div className={`absolute z-30 top-full mt-1.5 cr-arcade-panel !rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar p-1 ${className}`}>
      {results.length === 0 ? (
        <p className="text-white/45 text-xs p-3">{emptyText}</p>
      ) : results.map(c => (
        <button key={c.id} onClick={() => onPick(c.id)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.07] transition-colors text-left">
          <div className="w-8 h-9 shrink-0">
            <CardThumb id={c.id} name={c.name} rarity={c.rarity} className="w-full h-full" />
          </div>
          <span className="text-white text-sm flex-1 truncate">{c.name}</span>
          <span className="text-[10px] font-semibold shrink-0" style={{ color: RARITY_COLOR[c.rarity] || '#888' }}>
            {c.rarity}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Account hinzufügen (Dialog) ──────────────────────────────────────────────
function AddAccountModal({ onClose, onAdded }) {
  const [tag, setTag] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!tag.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const res = await api.addAccount(tag.trim());
      onAdded(res.account);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal icon={<CrUserAdd size={26} />} title="Account hinzufügen" onClose={onClose} size="sm">
      <div className="cr-section space-y-4">
        <p className="text-white/60 text-sm leading-relaxed">
          Trage dein Spieler-Kürzel ein. Du findest es in Clash Royale in deinem Profil unter deinem Namen.
        </p>
        <label className="block">
          <span className="cr-eyebrow block mb-1.5">Spieler-Kürzel</span>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-cr text-lg text-white/40 pointer-events-none">#</span>
            <input
              value={tag}
              onChange={e => setTag(e.target.value.toUpperCase().replace(/^#/, ''))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="2PP0V9YLL"
              maxLength={12}
              autoFocus
              className="cr-input pl-8 pr-3 py-3 font-cr text-lg tracking-widest uppercase"
            />
          </div>
        </label>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <ChunkyButton variant="green" block onClick={submit} disabled={busy || !tag.trim()} icon={Plus}>
          {busy ? 'Verknüpfe…' : 'Account verknüpfen'}
        </ChunkyButton>
      </div>
    </Modal>
  );
}

// ── Accounts-Übersicht ───────────────────────────────────────────────────────
// Zeilen in der gemeinsamen Fläche (.cr-row) statt Einzelkarten — der aktive Account trägt die
// Goldkante (.cr-row--me). Ein Klick auf die Zeile öffnet Deck, Glücksrad und Bans.
function AccountRow({ acc, onOpen, onActivate, onDelete, onFinish }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(acc)}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen(acc))}
      className={`cr-row ${acc.isActive ? 'cr-row--me' : ''} p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.04] transition-colors`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-44">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-cr text-lg leading-tight text-white truncate">{acc.playerName}</p>
            {acc.isFinished && (
              <span className="shrink-0 font-cr text-xs text-white bg-[var(--cr-arcade-red)] border-2 border-[#071225] px-1.5 py-0.5 rounded-md">
                Run beendet
              </span>
            )}
          </div>
          <p className="text-white/40 text-xs tabular-nums">#{acc.playerTag}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {acc.isActive ? (
            <span className="flex items-center gap-1 font-cr text-sm text-[var(--cr-arcade-gold)] px-1"
              style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
              <CrCheck size={18} />
              Aktiv
            </span>
          ) : (
            <ChunkyButton size="sm" onClick={() => onActivate(acc)}>Aktivieren</ChunkyButton>
          )}
          <button onClick={() => onFinish(acc)}
            title={acc.isFinished ? 'Markierung aufheben' : 'Als beendet markieren'}
            aria-label={acc.isFinished ? 'Markierung aufheben' : 'Als beendet markieren'}
            aria-pressed={!!acc.isFinished}
            className={`cr-arcade-icon-btn w-9 h-9 ${acc.isFinished ? '!border-[var(--cr-arcade-red)]' : ''}`}>
            <CrSkull size={18} />
          </button>
          <button onClick={() => onDelete(acc)} title="Account entfernen" aria-label="Account entfernen"
            className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 h-9">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-x-5 gap-y-2 flex-wrap">
        <span className="flex items-center gap-2">
          <TrophyValue value={acc.bestTrophies} />
          <span className="text-white/45 text-xs">Bestleistung</span>
        </span>
        <span className="text-white/55 text-xs">
          <span className="font-cr text-sm text-red-300 tabular-nums">{acc.bannedCount}</span> gebannt
        </span>
        <span className="text-white/55 text-xs">
          Deck <span className="font-cr text-sm text-white tabular-nums">{acc.deckSize}/{DECK_SIZE}</span>
        </span>
      </div>
    </div>
  );
}

function AccountsOverview({ accounts, onOpen, onActivate, onDelete, onAdd, globalAttempts, onAdjustAttempts, onFinish }) {
  return (
    <div className="cr-arcade-panel cr-anim-rise">
      <section className="cr-section">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="cr-section-title text-xl">
            <CrFriends size={28} />
            Deine Accounts
          </h2>
          <ChunkyButton variant="green" size="sm" icon={Plus} onClick={onAdd}>Account hinzufügen</ChunkyButton>
        </div>
        <p className="text-white/50 text-sm leading-relaxed">
          Der aktive Account speist dein OBS-Overlay mit den gebannten Karten.
        </p>

        {/* Globaler Versuchszähler — kleiner −/+-Stepper auf eingelassener Spur wie im Win-Tracker */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <span className="cr-eyebrow">Versuche (global)</span>
          <span className="font-cr text-2xl leading-none tabular-nums text-white min-w-[2ch] text-center">{globalAttempts}</span>
          <span className="cr-seg !flex-nowrap">
            <button type="button" className="!flex-none !min-h-0 w-8 h-8 !p-0" onClick={() => onAdjustAttempts(-1)}
              disabled={globalAttempts <= 0} aria-label="Versuch abziehen">
              <Minus size={14} />
            </button>
            <button type="button" className="!flex-none !min-h-0 w-8 h-8 !p-0" onClick={() => onAdjustAttempts(1)}
              aria-label="Versuch hinzufügen">
              <Plus size={14} />
            </button>
          </span>
        </div>
      </section>

      <section className="cr-section">
        {accounts.length === 0 ? (
          <div className="py-8 text-center">
            <CrUserAdd size={56} className="mx-auto mb-3" />
            <p className="font-cr text-xl text-white mb-1">Noch kein Account verknüpft</p>
            <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
              Verknüpfe deinen Clash-Royale-Account über dein Spieler-Kürzel, um dein Deck zu bauen, das Glücksrad zu drehen und im Leaderboard aufzutauchen.
            </p>
            <ChunkyButton variant="green" icon={Plus} onClick={onAdd}>Account hinzufügen</ChunkyButton>
          </div>
        ) : (
          <div className="space-y-2.5">
            {accounts.map(acc => (
              <AccountRow key={acc.accountId} acc={acc}
                onOpen={onOpen} onActivate={onActivate} onDelete={onDelete} onFinish={onFinish} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Deck-Builder (linke Spalte der Detail-Ansicht) ───────────────────────────
function DeckBuilder({ deck, bannedIds, onAdd, onRemove, disabled }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ALL_CARDS
      .filter(c => c.name.toLowerCase().includes(q) && !deck.includes(c.id) && !bannedIds.has(c.id))
      .slice(0, 18);
  }, [search, deck, bannedIds]);

  const deckFull = deck.length >= DECK_SIZE;

  const add = (cardId) => {
    if (deckFull || disabled) return;
    onAdd(cardId);
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="cr-section-title"><CrCards size={24} />Dein Deck</h3>
        <span className="text-white/45 text-xs tabular-nums">{deck.length}/{DECK_SIZE} Karten</span>
      </div>

      {/* Suche */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && results[0] && add(results[0].id)}
          placeholder={deckFull ? 'Deck ist voll' : 'Karte suchen und hinzufügen…'}
          disabled={deckFull || disabled}
          className="cr-input pl-9 pr-3 py-2.5 text-sm disabled:opacity-50"
        />
        {search.trim() && !deckFull && (
          <CardResults results={results} onPick={add} emptyText="Keine passende Karte gefunden" className="w-full" />
        )}
      </div>

      {/* 2x4 Deck-Slots wie in Clash Royale, auf eingelassener Spur */}
      <div className="rounded-2xl bg-[#081426] border border-[#020814]/80 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] p-2.5">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const cardId = deck[i];
            const card = cardId ? ALL_CARDS.find(c => c.id === cardId) : null;
            if (!card) return (
              <button key={i} onClick={() => inputRef.current?.focus()} disabled={disabled} aria-label="Karte hinzufügen"
                className="aspect-[5/6] rounded-md border-2 border-dashed border-white/10 flex items-center justify-center text-white/25 hover:border-white/30 hover:text-white/50 transition-colors">
                <Plus size={16} />
              </button>
            );
            return (
              <div key={i} className="relative group aspect-[5/6]">
                <CardThumb id={card.id} name={card.name} rarity={card.rarity} className="w-full h-full" />
                <div className="absolute inset-0 rounded-md border-2 pointer-events-none"
                  style={{ borderColor: (RARITY_COLOR[card.rarity] || '#888') + '66' }} />
                {!disabled && (
                  <button onClick={() => onRemove(card.id)} title="Aus dem Deck entfernen" aria-label={`${card.name} entfernen`}
                    className="absolute top-1 right-1 bg-[#071225]/85 border border-white/20 rounded-md p-1 text-white/70 hover:text-red-300 hover:border-red-400/60 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <X size={11} />
                  </button>
                )}
                <p className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold text-white px-1 pb-0.5 pointer-events-none truncate bg-[#071225]/80">
                  {card.name}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-white/45 text-xs leading-relaxed">
        Diese 8 Karten landen auf dem Glücksrad. Gebannte Karten können nicht erneut hinzugefügt werden.
      </p>
    </div>
  );
}

// ── Detail-Ansicht eines Accounts: Deck + Glücksrad + Bans ───────────────────
function AccountDetail({ account, onBack, onAccountsChanged, setAccounts }) {
  const [deck, setDeck] = useState(account.deck);
  const [banned, setBanned] = useState(account.banned);
  const [isActive, setIsActive] = useState(account.isActive);
  const [meta, setMeta] = useState({ playerName: account.playerName, bestTrophies: account.bestTrophies });
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Manuelles Bannen
  const [showManualBan, setShowManualBan] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  const spinTimer = useRef(null);

  useEffect(() => () => clearTimeout(spinTimer.current), []);

  const bannedIds = useMemo(() => new Set(banned.map(b => b.id)), [banned]);
  const deckCards = useMemo(() => deck.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean), [deck]);

  const manualResults = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return [];
    return ALL_CARDS
      .filter(c => c.name.toLowerCase().includes(q) && !bannedIds.has(c.id))
      .slice(0, 10);
  }, [manualSearch, bannedIds]);

  const flashError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const patchSummary = useCallback((patch) => {
    setAccounts(prev => prev.map(a => a.accountId === account.accountId ? { ...a, ...patch } : a));
  }, [account.accountId, setAccounts]);

  const changeDeck = async (next) => {
    const prev = deck;
    setDeck(next);
    patchSummary({ deckSize: next.length });
    try { await api.saveDeck(account.accountId, next); }
    catch (e) { setDeck(prev); patchSummary({ deckSize: prev.length }); flashError(e.message); }
  };

  const handleSpin = async () => {
    if (spinning || deck.length === 0) return;
    setSpinResult(null); setError('');
    try {
      const res = await api.spinWheel(account.accountId);
      const idx = Math.max(0, deck.indexOf(res.card.id));
      const segAngle = 360 / deck.length;
      const jitter = (Math.random() - 0.5) * segAngle * 0.6;
      const targetMod = (((360 - (idx + 0.5) * segAngle) + jitter) % 360 + 360) % 360;
      const currentMod = ((rotation % 360) + 360) % 360;
      let delta = targetMod - currentMod;
      if (delta <= 0) delta += 360;
      setSpinning(true);
      setRotation(r => r + 5 * 360 + delta);
      spinTimer.current = setTimeout(() => {
        setSpinning(false);
        setDeck(res.deck);
        setBanned(res.banned);
        setSpinResult(res.card);
        patchSummary({ deckSize: res.deck.length, bannedCount: res.banned.length });
      }, SPIN_DURATION_MS + 250);
    } catch (e) { flashError(e.message); }
  };

  const handleManualBan = async (cardId) => {
    try {
      const res = await api.banCardManually(account.accountId, cardId);
      setBanned(res.banned);
      setDeck(res.deck); // Deck updaten, falls die manuell gebannte Karte im Deck lag
      patchSummary({ deckSize: res.deck.length, bannedCount: res.banned.length });
      setShowManualBan(false);
      setManualSearch('');
    } catch (e) { flashError(e.message); }
  };

  const handleUnban = async (entryId) => {
    try {
      const res = await api.unbanCard(account.accountId, entryId);
      setBanned(res.banned);
      patchSummary({ bannedCount: res.banned.length });
    } catch (e) { flashError(e.message); }
  };

  const handleActivate = async () => {
    try {
      await api.activateAccount(account.accountId);
      setIsActive(true);
      onAccountsChanged();
    } catch (e) { flashError(e.message); }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await api.refreshAccount(account.accountId);
      setMeta({ playerName: res.account.playerName, bestTrophies: res.account.bestTrophies });
      if (res.account.deck) {
        setDeck(res.account.deck);
        patchSummary({
          playerName: res.account.playerName,
          bestTrophies: res.account.bestTrophies,
          deckSize: res.account.deck.length,
        });
      } else {
        patchSummary({ playerName: res.account.playerName, bestTrophies: res.account.bestTrophies });
      }
    } catch (e) { flashError(e.message); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="cr-anim-rise flex flex-col gap-4">
      <ChunkyButton variant="blue" size="sm" icon={ArrowLeft} onClick={onBack} className="self-start">
        Accounts
      </ChunkyButton>

      <div className="cr-arcade-panel">
        {/* Kopfzeile */}
        <section className="cr-section">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-cr text-2xl leading-tight text-white truncate">{meta.playerName}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-white/40 text-xs tabular-nums">#{account.playerTag}</span>
                <TrophyValue value={meta.bestTrophies} />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isActive ? (
                <span className="flex items-center gap-1 font-cr text-sm text-[var(--cr-arcade-gold)] px-1"
                  style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
                  <CrCheck size={18} />
                  Aktiv im Overlay
                </span>
              ) : (
                <ChunkyButton size="sm" onClick={handleActivate}>Für Overlay aktivieren</ChunkyButton>
              )}
              <button onClick={handleRefresh} title="Spielerdaten & Deck aktualisieren" aria-label="Spielerdaten & Deck aktualisieren"
                className="cr-arcade-icon-btn w-9 h-9">
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {error && (
            <div className="cr-row border-red-500/50 bg-red-500/10 px-4 py-2.5 mt-4 text-red-200 text-sm" role="alert">{error}</div>
          )}
        </section>

        {/* Deck links, Glücksrad rechts — eine Fläche, senkrechte Fuge dazwischen */}
        <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-[#020814]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="p-5 min-w-0 lg:border-r lg:border-[#020814]/60">
            <DeckBuilder
              deck={deck}
              bannedIds={bannedIds}
              onAdd={(id) => changeDeck([...deck, id])}
              onRemove={(id) => changeDeck(deck.filter(d => d !== id))}
              disabled={spinning}
            />
          </div>

          <div className="p-5 min-w-0 flex flex-col items-center border-t border-[#020814]/55 lg:border-t-0">
            <div className="w-full mb-3">
              <h3 className="cr-section-title"><CrRandom size={24} />Glücksrad</h3>
              <p className="text-white/45 text-xs mt-1">Landet der Zeiger auf einer Karte, wird sie gebannt.</p>
            </div>

            <CardWheel key={account.accountId} cards={deckCards} rotation={rotation} size={330} />

            <ChunkyButton variant="red" size="lg" block icon={Dices} onClick={handleSpin}
              disabled={spinning || deck.length === 0} className="mt-4 max-w-[330px]">
              {spinning ? 'Das Rad dreht sich…' : 'Drehen & Bannen'}
            </ChunkyButton>

            {spinResult && !spinning && (
              <div className="cr-row border-red-500/50 bg-red-500/10 mt-4 w-full max-w-[330px] flex items-center gap-3 p-3">
                <div className="shrink-0" style={{ width: 44, height: 52 }}>
                  <CardThumb id={spinResult.id} name={spinResult.name} rarity={spinResult.rarity} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-cr text-[15px] text-red-200 truncate">{spinResult.name} wurde gebannt!</p>
                  <p className="text-white/50 text-xs">Aus dem Deck entfernt und dem Overlay hinzugefügt.</p>
                </div>
                <button onClick={() => setSpinResult(null)} aria-label="Schließen" className="text-white/40 hover:text-white p-1 shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Gebannte Karten */}
        <section className="cr-section cr-section--rule">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="cr-section-title">
              <CrSkull size={24} />
              Gebannte Karten
              <span className="text-white/40 font-sans text-sm tabular-nums">({banned.length})</span>
            </h3>

            <div className="flex items-center gap-2 relative">
              {showManualBan ? (
                <>
                  <input
                    value={manualSearch}
                    onChange={e => setManualSearch(e.target.value)}
                    placeholder="Karte suchen…"
                    className="cr-input !w-48 px-3 py-2 text-sm"
                    autoFocus
                  />
                  <button onClick={() => { setShowManualBan(false); setManualSearch(''); }} aria-label="Abbrechen"
                    className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 h-9">
                    <X size={14} />
                  </button>
                  {manualSearch.trim() && (
                    <CardResults results={manualResults} onPick={handleManualBan} emptyText="Keine Karte gefunden"
                      className="right-0 w-60" />
                  )}
                </>
              ) : (
                <ChunkyButton size="sm" icon={Plus} onClick={() => setShowManualBan(true)}>
                  Karte manuell bannen
                </ChunkyButton>
              )}
            </div>
          </div>
          {banned.length === 0 ? (
            <p className="text-white/45 text-sm">Noch keine Karte gebannt — dreh das Glücksrad oder banne eine manuell.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {banned.map(b => (
                <div key={b.entryId} className="relative group aspect-[5/6]">
                  <CardThumb id={b.id} name={b.name} rarity={b.rarity} className="w-full h-full grayscale-[40%] opacity-85" />
                  <div className="absolute inset-0 rounded-md border-2 border-red-500/45 pointer-events-none" />
                  <button onClick={() => handleUnban(b.entryId)} title="Bann aufheben" aria-label={`Bann von ${b.name} aufheben`}
                    className="absolute top-1 right-1 bg-[#071225]/85 border border-white/20 rounded-md p-1 text-white/70 hover:text-white hover:border-white/50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function LeaderboardTab() {
  const [rows, setRows] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.getLeaderboard().then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="text-white/50 text-sm py-8 text-center">Lade Leaderboard…</p>;

  // Platz 1–3 in Gold/Silber/Bronze, der Rest neutral
  const rankColor = (i) => i === 0 ? 'text-[var(--cr-arcade-gold)]' : i === 1 ? 'text-slate-200' : i === 2 ? 'text-orange-300' : 'text-white/40';

  return (
    <div className="cr-arcade-panel cr-anim-rise">
      <section className="cr-section">
        <h2 className="cr-section-title text-xl"><CrTrophy size={28} />Leaderboard</h2>
        <p className="text-white/50 text-sm mt-1">Sortiert nach den höchsten Trophäen des Runs. Klick auf einen Spieler zeigt sein Deck.</p>
      </section>
      <section className="cr-section">
        {rows.length === 0 ? (
          <p className="text-white/50 text-sm py-6 text-center">Noch keine Accounts verknüpft — sei der Erste!</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.playerTag} className="cr-row overflow-hidden">
                <button onClick={() => setExpanded(expanded === i ? null : i)} aria-expanded={expanded === i}
                  className="w-full grid grid-cols-[2.5rem_1fr_auto] gap-3 px-3.5 py-3 items-center hover:bg-white/[0.04] transition-colors text-left">
                  <span className={`font-cr text-xl tabular-nums text-center ${rankColor(i)}`}>{i + 1}</span>
                  <span className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-cr text-[15px] text-white truncate">{row.playerName}</span>
                    <span className="text-white/35 text-[11px] tabular-nums shrink-0">#{row.playerTag}</span>
                    {row.isFinished && (
                      <span className="font-cr text-[11px] text-white bg-[var(--cr-arcade-red)] border-2 border-[#071225] px-1.5 py-0.5 rounded-md shrink-0">
                        Beendet
                      </span>
                    )}
                    {row.isActive && (
                      <span className="font-cr text-[11px] text-[#4a2e00] bg-[var(--cr-arcade-gold)] border-2 border-[#071225] px-1.5 py-0.5 rounded-md shrink-0">
                        Aktiv
                      </span>
                    )}
                    {row.twitchLogin && (
                      <span className="flex items-center gap-1 text-[11px] text-purple-300 shrink-0">
                        <TwitchGlyph size={11} />
                        {row.twitchLogin}
                      </span>
                    )}
                  </span>
                  <TrophyValue value={row.bestTrophies} />
                </button>
                {expanded === i && (
                  <div className="px-3.5 pb-3.5 pt-3 border-t border-[#020814]/55">
                    <div className="flex items-center gap-4 text-xs text-white/55 mb-3">
                      <span>Versuche <span className="font-cr text-sm text-white tabular-nums">{row.attempts}</span></span>
                      <span><span className="font-cr text-sm text-red-300 tabular-nums">{row.bannedCount}</span> Karten gebannt</span>
                    </div>
                    {row.deck.length === 0 ? (
                      <p className="text-white/45 text-xs">Noch kein Deck gebaut.</p>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {row.deck.map(id => {
                          const card = ALL_CARDS.find(c => c.id === id);
                          return card ? (
                            <div key={id} className="w-12" style={{ height: 58 }}>
                              <CardThumb id={card.id} name={card.name} rarity={card.rarity} className="w-full h-full" />
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Einstellungen (OBS-Link) ─────────────────────────────────────────────────
function SettingsTab({ apiConfigured }) {
  const [overlayKey, setOverlayKey] = useState(null);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getOverlaySettings().then(d => setOverlayKey(d.overlayKey)).catch(() => {});
  }, []);

  const link = overlayKey ? `${window.location.origin}/banned-cards/overlay/${overlayKey}` : '';

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const regenerate = async () => {
    if (!window.confirm('Neuen Overlay-Link erzeugen? Der alte Link funktioniert danach nicht mehr (OBS muss aktualisiert werden).')) return;
    try {
      const d = await api.regenerateOverlayKey();
      setOverlayKey(d.overlayKey);
    } catch { /* alter Link bleibt gültig */ }
  };

  return (
    <div className="cr-arcade-panel cr-anim-rise">
      <section className="cr-section space-y-4">
        <h2 className="cr-section-title text-xl"><CrTv size={28} />OBS-Overlay</h2>
        <p className="text-white/50 text-sm leading-relaxed">
          Binde diesen Link als Browser-Quelle in OBS ein. Das Overlay zeigt automatisch die gebannten
          Karten und den Versuchszähler deines <span className="text-[var(--cr-arcade-gold)]">aktiven</span> Accounts.
        </p>
        <div className={`cr-input px-3.5 py-3 text-white/80 text-xs break-all transition-all ${hidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
          {link || 'Lade…'}
        </div>
        <div className="flex items-stretch gap-2">
          <ChunkyButton variant="green" className="flex-1" onClick={copy} disabled={!link} icon={copied ? Check : Copy}>
            {copied ? 'Kopiert' : 'Link kopieren'}
          </ChunkyButton>
          <button onClick={() => setHidden(v => !v)} title={hidden ? 'Anzeigen' : 'Verbergen'}
            aria-label={hidden ? 'Anzeigen' : 'Verbergen'}
            className="cr-arcade-icon-btn w-12 shrink-0">
            {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
        </div>
        <button onClick={regenerate} disabled={!overlayKey}
          className="flex items-center gap-1.5 text-xs font-semibold text-white/45 hover:text-red-300 transition-colors disabled:opacity-40">
          <RefreshCw size={12} />
          Link neu generieren
        </button>
      </section>

      <section className="cr-section">
        <p className={`flex items-center gap-2 font-cr text-[15px] ${apiConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${apiConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {apiConfigured ? 'Clash Royale API verbunden' : 'Clash Royale API nicht konfiguriert'}
        </p>
        <p className="text-white/50 text-xs leading-relaxed mt-1.5">
          {apiConfigured
            ? 'Spielernamen, Trophäen und Ingame-Decks werden automatisch über das Spieler-Kürzel synchronisiert.'
            : 'Accounts können trotzdem verknüpft werden, aber ohne automatischen Abgleich. Hinterlege dazu CLASH_ROYALE_API_TOKEN in der Backend-.env (Token von developer.clashroyale.com).'}
        </p>
      </section>
    </div>
  );
}

// ── Regeln ───────────────────────────────────────────────────────────────────
const RULES = [
  ['Nur Ladder spielen', 'Es ist nur Ladder erlaubt. Keine Challenges oder andere Modi.'],
  ['Glücksrad beim Lose', 'Bei einem Lose muss das Glücksrad gedreht werden, was eine Karte aus deinem aktiven Deck bannt, wodurch sie weder gespielt noch gelevelt werden darf.'],
  ['3 Loses am Stück', 'Bei 3 Loses am Stück werden alle 8 Karten aus dem Deck gebannt.'],
  ['Kartenlevel-Cap', 'Das Kartenlevel darf nur so hoch sein wie das Kingtowerlevel.'],
  ['Free to Play', 'Es darf kein Geld in den Account gesteckt werden (Aktionen aus dem Supercell Store oder ähnlichem, die Free to Play sind, sind erlaubt).'],
];

function RulesTab() {
  return (
    <div className="cr-arcade-panel cr-anim-rise">
      <section className="cr-section">
        <h2 className="cr-section-title text-xl"><CrBook size={28} />Nuzlocke Regeln</h2>
      </section>
      <section className="cr-section">
        <ol className="space-y-2.5">
          {RULES.map(([title, text], i) => (
            <li key={title} className="cr-row flex items-start gap-3.5 p-3.5">
              <span className="font-cr text-xl leading-none text-[var(--cr-arcade-gold)] tabular-nums w-5 text-center shrink-0 pt-0.5"
                style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-cr text-[15px] text-white">{title}</p>
                <p className="text-white/60 text-sm leading-relaxed mt-0.5">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ── Hauptseite ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'accounts', label: 'Accounts', icon: CrFriends },
  { id: 'leaderboard', label: 'Leaderboard', icon: CrTrophy },
  { id: 'settings', label: 'Einstellungen', icon: CrSettings },
  { id: 'rules', label: 'Regeln', icon: CrBook },
];

export default function NuzlockePage() {
  const { user, login } = useContext(TwitchAuthContext);
  const { openSettings } = useCrPrefs();
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState(null);
  const [globalAttempts, setGlobalAttempts] = useState(0);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [detail, setDetail] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState('');

  const flashError = (msg) => { setError(msg); setTimeout(() => setError(''), 3000); };

  const loadAccounts = useCallback(() => {
    if (!user) return;
    api.getMyNuzlocke()
      .then(d => {
        setAccounts(d.accounts);
        setApiConfigured(d.apiConfigured);
        setGlobalAttempts(d.globalAttempts || 0);
      })
      .catch(() => setAccounts([]));
  }, [user]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const openAccount = async (acc) => {
    try {
      setDetail(await api.getAccount(acc.accountId));
    } catch (e) { flashError(e.message); }
  };

  const handleActivate = async (acc) => {
    try {
      await api.activateAccount(acc.accountId);
      setAccounts(prev => prev.map(a => ({ ...a, isActive: a.accountId === acc.accountId })));
    } catch (e) { flashError(e.message); }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`Account "${acc.playerName}" wirklich entfernen? Deck und gebannte Karten gehen verloren.`)) return;
    try {
      await api.deleteAccount(acc.accountId);
      loadAccounts();
    } catch (e) { flashError(e.message); }
  };

  // Ungefährlicher Umschalter (beendet ↔ laufend), deshalb ohne Rückfrage
  const handleFinish = async (acc) => {
    try {
      await api.finishRun(acc.accountId);
      loadAccounts();
    } catch (e) { flashError(e.message); }
  };

  const handleAdjustGlobalAttempts = async (delta) => {
    const next = Math.max(0, globalAttempts + delta);
    setGlobalAttempts(next);
    try {
      await api.adjustAttempts(delta);
    } catch {
      // Sync korrigiert es beim nächsten Laden
    }
  };

  const switchTab = (id) => {
    setTab(id);
    if (id === 'accounts' && detail) { setDetail(null); loadAccounts(); }
  };

  return (
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
      <SEO
        title="Clash Royale Nuzlocke Challenge — Tracker & Bann-Glücksrad"
        description="Die Nuzlocke-Challenge für Clash Royale: Verliere ein Match, dreh das Glücksrad — die getroffene Karte ist für den Rest des Runs gebannt. Mit Deck-Verwaltung, Bann-Verlauf und OBS-Overlay für gebannte Karten."
        keywords="Clash Royale Nuzlocke, Nuzlocke Challenge, Clash Royale Challenge, gebannte Karten Overlay, Clash Royale Glücksrad, Clash Royale Run"
        path="/nuzlocke"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Clash Royale Nuzlocke',
            url: 'https://vnmvalentin.de/nuzlocke',
            description: 'Nuzlocke-Challenge-Tracker für Clash Royale mit Bann-Glücksrad, Deck-Verwaltung und OBS-Overlay.',
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web browser',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            author: { '@type': 'Person', name: 'vnmvalentin', url: 'https://vnmvalentin.de' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://vnmvalentin.de' },
              { '@type': 'ListItem', position: 2, name: 'Clash Royale', item: 'https://vnmvalentin.de/clash' },
              { '@type': 'ListItem', position: 3, name: 'Nuzlocke', item: 'https://vnmvalentin.de/nuzlocke' },
            ],
          },
        ]} />

      <div className="min-h-full flex flex-col">
        {/* ── Obere Zeile wie im Hub: zurück zur Website | Einstellungen ──────────── */}
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
          <Link to="/clash" className={`${chipClass} px-3.5`} title="Zurück zur Website">
            <ArrowLeftToLine size={16} />
            <span className="hidden sm:inline">Zurück zur Website</span>
          </Link>
          <div className="flex-1" />
          <button onClick={openSettings} className={`${chipClass} w-11 justify-center`} title="Einstellungen" aria-label="Einstellungen">
            <CrSettings size={24} />
          </button>
        </div>

        <div className={`flex-1 w-full mx-auto px-3 md:px-6 py-4 md:py-6 ${tab === 'accounts' && detail ? 'max-w-6xl' : 'max-w-4xl'}`}>
          {/* ── Titel ─────────────────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center text-center mb-5 md:mb-6">
            <p className="font-cr text-[15px] md:text-lg tracking-[0.18em] uppercase text-[var(--cr-arcade-gold)]"
              style={{ textShadow: '0 2px 0 rgba(2,8,20,0.7)' }}>
              Clash Royale
            </p>
            <ArcadeTitle as="h1" className="text-4xl md:text-5xl leading-none">Nuzlocke</ArcadeTitle>
            <p className="text-white/55 text-sm mt-2 max-w-xl">
              Verliere ein Match, dreh das Glücksrad — die getroffene Karte ist für den Rest des Runs gebannt.
            </p>
          </div>

          {!user ? (
            <div className="cr-arcade-panel cr-anim-rise max-w-md mx-auto">
              <div className="cr-section text-center py-8">
                <CrSkull size={56} className="mx-auto mb-3" />
                <p className="font-cr text-xl text-white mb-1">Login erforderlich</p>
                <p className="text-white/50 text-sm mb-6">Melde dich mit Twitch an, um deine Accounts und Bans zu verwalten.</p>
                <ChunkyButton onClick={() => login(false)}>
                  <TwitchGlyph size={17} />
                  Mit Twitch einloggen
                </ChunkyButton>
              </div>
            </div>
          ) : (
            <>
              <div className="cr-tabs mb-4 md:mb-5 max-w-2xl mx-auto" role="tablist">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => switchTab(id)}>
                    <Icon size={26} />
                    <span className="cr-tab-label">{label}</span>
                  </button>
                ))}
              </div>

              {error && (
                <div className="cr-row border-red-500/50 bg-red-500/10 px-4 py-2.5 mb-4 text-red-200 text-sm" role="alert">{error}</div>
              )}

              {tab === 'accounts' && (
                detail ? (
                  <AccountDetail
                    key={detail.accountId}
                    account={detail}
                    onBack={() => { setDetail(null); loadAccounts(); }}
                    onAccountsChanged={loadAccounts}
                    setAccounts={setAccounts}
                  />
                ) : accounts === null ? (
                  <p className="text-white/50 text-sm py-8 text-center">Lade Accounts…</p>
                ) : (
                  <AccountsOverview
                    accounts={accounts}
                    onOpen={openAccount}
                    onActivate={handleActivate}
                    onDelete={handleDelete}
                    onAdd={() => setAddOpen(true)}
                    globalAttempts={globalAttempts}
                    onAdjustAttempts={handleAdjustGlobalAttempts}
                    onFinish={handleFinish}
                  />
                )
              )}

              {tab === 'leaderboard' && <LeaderboardTab />}
              {tab === 'settings' && <SettingsTab apiConfigured={apiConfigured} />}
              {tab === 'rules' && <RulesTab />}
            </>
          )}
        </div>
      </div>

      {addOpen && (
        <AddAccountModal
          onClose={() => setAddOpen(false)}
          onAdded={(acc) => { setAddOpen(false); loadAccounts(); openAccount(acc); }}
        />
      )}
    </div>
  );
}
