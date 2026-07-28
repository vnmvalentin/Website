import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import {
  Trophy, Plus, X, Search, RefreshCw, Trash2, Copy, Check, Eye, EyeOff,
  Settings, Users, Minus, ChevronLeft, Dices, Ban, ChevronDown, Book
} from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { ALL_CARDS, RARITY_COLOR, cardImageUrl } from '../data/cards';
import CardWheel, { SPIN_DURATION_MS } from './CardWheel';
import * as api from './nuzlockeApi';

const DECK_SIZE = 8;
const fmt = (n) => (n || 0).toLocaleString('de-DE');

// ── Kleine Bausteine ─────────────────────────────────────────────────────────
function CardThumb({ id, name, rarity, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={cardImageUrl(id)} alt={name} title={name}
        className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  const Icon = icon;
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-2 py-3 px-5 text-sm font-bold transition-colors border-b-2 ${
        active ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}>
      <Icon size={14} />
      {label}
    </button>
  );
}

// ── Account hinzufügen (Modal) ───────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-bold">Account hinzufügen</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={16} /></button>
        </div>
        <p className="text-gray-500 text-xs leading-relaxed mb-4">
          Trage dein Spieler-Kürzel ein. Du findest es in Clash Royale in deinem Profil unter deinem Namen.
        </p>
        <div className="flex items-center gap-0 mb-3">
          <span className="bg-[#1a1a20] border border-r-0 border-white/10 rounded-l-lg px-3 py-2.5 text-gray-500 font-mono text-sm">#</span>
          <input
            value={tag}
            onChange={e => setTag(e.target.value.toUpperCase().replace(/^#/, ''))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="2PP0V9YLL"
            maxLength={12}
            autoFocus
            className="flex-1 bg-[#1a1a20] border border-white/10 rounded-r-lg px-3 py-2.5 text-white placeholder-gray-600 focus:border-violet-400 outline-none text-sm font-mono tracking-widest uppercase"
          />
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <button onClick={submit} disabled={busy || !tag.trim()}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white font-black py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed">
          <Plus size={15} />
          {busy ? 'Verknüpfe…' : 'Account verknüpfen'}
        </button>
      </div>
    </div>
  );
}

// ── Accounts-Übersicht ───────────────────────────────────────────────────────
function AccountsOverview({ accounts, onOpen, onActivate, onDelete, onAdd, globalAttempts, onAdjustAttempts, onFinish }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-bold">Deine Accounts</h2>
          <p className="text-gray-500 text-xs mt-0.5">Der aktive Account speist dein OBS-Overlay mit den gebannten Karten.</p>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          {/* Globaler Versuchszähler */}
          <div className="flex items-center gap-2 bg-[#0f0f13] border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Versuche (Global)</span>
            <button onClick={(e) => { e.stopPropagation(); onAdjustAttempts(-1); }} disabled={globalAttempts <= 0}
              className="text-gray-500 hover:text-white disabled:text-gray-800 transition-colors p-0.5">
              <Minus size={13} />
            </button>
            <span className="text-white font-black text-lg tabular-nums w-8 text-center">{globalAttempts}</span>
            <button onClick={(e) => { e.stopPropagation(); onAdjustAttempts(1); }}
              className="text-gray-500 hover:text-white transition-colors p-0.5">
              <Plus size={13} />
            </button>
          </div>

          <button onClick={onAdd}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shrink-0">
            <Plus size={14} />
            Account hinzufügen
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-10 text-center">
          <p className="text-white font-bold mb-1">Noch kein Account verknüpft</p>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            Verknüpfe deinen Clash-Royale-Account über dein Spieler-Kürzel, um dein Deck zu bauen, das Glücksrad zu drehen und im Leaderboard aufzutauchen.
          </p>
          <button onClick={onAdd}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <Plus size={14} />
            Account hinzufügen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.accountId}
              className={`bg-[#0f0f13] border rounded-lg p-5 cursor-pointer transition-colors group relative overflow-hidden ${
                acc.isActive ? 'border-violet-400/40' : 'border-white/5 hover:border-white/20'
              }`}
              onClick={() => onOpen(acc)}>
              
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="font-bold truncate text-white">{acc.playerName}</p>
                  <p className="text-gray-600 text-xs font-mono">#{acc.playerTag}</p>
                </div>
                
                {/* Badges und Buttons koexistieren jetzt */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {acc.isActive ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-600/10 px-2 py-0.5 rounded-lg">
                      Aktiv
                    </span>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); onActivate(acc); }}
                      className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/10 px-2 py-0.5 rounded-lg hover:text-violet-300 hover:border-violet-400/40 transition-colors">
                      Aktivieren
                    </button>
                  )}
                  
                  {acc.isFinished ? (
                    <button onClick={e => { e.stopPropagation(); onFinish(acc); }} title="Markierung aufheben"
                      className="text-[10px] font-bold uppercase tracking-wider text-red-400 border border-red-500/40 bg-red-500/10 px-2 py-0.5 rounded-lg hover:bg-red-500/20 transition-colors">
                      Run beendet
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); onFinish(acc); }}
                      className="text-[9px] font-bold uppercase tracking-wider text-gray-600 hover:text-red-400 transition-colors">
                      Als beendet markieren
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 my-3">
                <Trophy size={14} className="text-amber-400" />
                <span className="font-black text-lg tabular-nums text-white">{fmt(acc.bestTrophies)}</span>
                <span className="text-gray-600 text-xs">Bestleistung</span>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-white/5 pt-3">
                <span><span className="text-red-400 font-bold">{acc.bannedCount}</span> gebannt</span>
                <span className="text-gray-700">·</span>
                <span>Deck <span className="text-white font-bold">{acc.deckSize}/8</span></span>
                <button onClick={e => { e.stopPropagation(); onDelete(acc); }} title="Account entfernen"
                  className="ml-auto text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-0.5">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Deck-Builder (linke Seite der Detail-Ansicht) ────────────────────────────
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
    <div className="panel p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-white font-bold text-sm">Dein Deck</h3>
        <span className="text-gray-600 text-xs">{deck.length}/{DECK_SIZE} Karten</span>
      </div>

      {/* Suche */}
      <div className="relative mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && results[0] && add(results[0].id)}
          placeholder={deckFull ? 'Deck ist voll' : 'Karte suchen und hinzufügen…'}
          disabled={deckFull || disabled}
          className="w-full bg-[#1a1a20] border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-white text-sm placeholder-gray-600 focus:border-violet-400 outline-none disabled:opacity-50"
        />
        {search.trim() && !deckFull && (
          <div className="absolute z-20 top-full mt-1 w-full panel-strong shadow-2xl max-h-64 overflow-y-auto custom-scrollbar">
            {results.length === 0 ? (
              <p className="text-gray-600 text-xs p-3">Keine passende Karte gefunden</p>
            ) : results.map(c => (
              <button key={c.id} onClick={() => add(c.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left">
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
        )}
      </div>

      {/* 2x4 Deck-Slots wie in Clash Royale */}
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: DECK_SIZE }, (_, i) => {
          const cardId = deck[i];
          const card = cardId ? ALL_CARDS.find(c => c.id === cardId) : null;
          if (!card) return (
            <button key={i} onClick={() => inputRef.current?.focus()} disabled={disabled}
              className="aspect-[5/6] rounded-lg border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-center text-gray-700 hover:border-white/25 hover:text-gray-500 transition-colors">
              <Plus size={16} />
            </button>
          );
          return (
            <div key={i} className="relative group aspect-[5/6]">
              <CardThumb id={card.id} name={card.name} rarity={card.rarity} className="w-full h-full border"
              />
              <div className="absolute inset-0 rounded-lg border pointer-events-none"
                style={{ borderColor: (RARITY_COLOR[card.rarity] || '#888') + '55' }} />
              {!disabled && (
                <button onClick={() => onRemove(card.id)} title="Aus dem Deck entfernen"
                  className="absolute top-1 right-1 bg-black/70 border border-white/20 rounded-lg p-1 text-gray-300 hover:text-red-400 hover:border-red-500/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={11} />
                </button>
              )}
              <p className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold text-white px-1 pb-0.5 pointer-events-none truncate"
                style={{ background: 'linear-gradient(transparent,#000d)' }}>
                {card.name}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-gray-600 text-xs mt-3">
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
  
  // States für manuelles Bannen
  const [showManualBan, setShowManualBan] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  
  const spinTimer = useRef(null);

  useEffect(() => () => clearTimeout(spinTimer.current), []);

  const bannedIds = useMemo(() => new Set(banned.map(b => b.id)), [banned]);
  const deckCards = useMemo(() => deck.map(id => ALL_CARDS.find(c => c.id === id)).filter(Boolean), [deck]);

  // Suchergebnisse für die manuelle Bann-Suche
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
          deckSize: res.account.deck.length 
        });
      } else {
        patchSummary({ playerName: res.account.playerName, bestTrophies: res.account.bestTrophies });
      }
    } catch (e) { flashError(e.message); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="space-y-5">
      {/* Kopfzeile */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors text-sm font-semibold">
          <ChevronLeft size={16} />
          Accounts
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-white font-black truncate">{meta.playerName}</span>
          <span className="text-gray-600 text-xs font-mono shrink-0">#{account.playerTag}</span>
          <span className="flex items-center gap-1 text-xs shrink-0">
            <Trophy size={12} className="text-amber-400" />
            <span className="text-white font-bold tabular-nums">{fmt(meta.bestTrophies)}</span>
          </span>
          <button onClick={handleRefresh} title="Spielerdaten & Deck aktualisieren"
            className="text-gray-600 hover:text-white transition-colors p-1 shrink-0">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1" />

        {isActive ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-600/10 px-2.5 py-1.5 rounded-lg">
            Aktiv im Overlay
          </span>
        ) : (
          <button onClick={handleActivate}
            className="text-xs font-bold text-gray-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-violet-300 hover:border-violet-400/40 transition-colors">
            Für Overlay aktivieren
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Deck links, Glücksrad rechts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <DeckBuilder
          deck={deck}
          bannedIds={bannedIds}
          onAdd={(id) => changeDeck([...deck, id])}
          onRemove={(id) => changeDeck(deck.filter(d => d !== id))}
          disabled={spinning}
        />

        <div className="panel p-5 flex flex-col items-center">
          <div className="w-full flex items-baseline justify-between mb-2">
            <h3 className="text-white font-bold text-sm">Glücksrad</h3>
            <span className="text-gray-600 text-xs">Landet der Zeiger auf einer Karte, wird sie gebannt</span>
          </div>

          <CardWheel key={account.accountId} cards={deckCards} rotation={rotation} size={330} />

          <button onClick={handleSpin} disabled={spinning || deck.length === 0}
            className="mt-4 w-full max-w-[330px] bg-red-500 hover:bg-red-400 disabled:bg-white/5 disabled:text-gray-600 text-white font-black py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed">
            <Dices size={16} />
            {spinning ? 'Das Rad dreht sich…' : 'Drehen & Bannen'}
          </button>

          {spinResult && !spinning && (
            <div className="mt-4 w-full max-w-[330px] flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="w-11 h-13 shrink-0" style={{ width: 44, height: 52 }}>
                <CardThumb id={spinResult.id} name={spinResult.name} rarity={spinResult.rarity} className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-red-400 font-bold text-sm truncate">{spinResult.name} wurde gebannt!</p>
                <p className="text-gray-500 text-xs">Aus dem Deck entfernt und dem Overlay hinzugefügt.</p>
              </div>
              <button onClick={() => setSpinResult(null)} className="text-gray-600 hover:text-white p-1 shrink-0">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Gebannte Karten */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <Ban size={13} className="text-red-400" />
            Gebannte Karten
            <span className="text-gray-600 font-normal text-xs">({banned.length})</span>
          </h3>
          
          {/* Manuelles Bannen & Entfernung von Reset */}
          <div className="flex items-center gap-2 relative">
            {showManualBan ? (
              <div className="flex items-center gap-2">
                <input
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  placeholder="Karte suchen…"
                  className="bg-[#1a1a20] border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs placeholder-gray-600 focus:border-violet-400 outline-none w-44"
                  autoFocus
                />
                <button 
                  onClick={() => { setShowManualBan(false); setManualSearch(''); }}
                  className="text-gray-500 hover:text-white p-1"
                >
                  <X size={14} />
                </button>
                {manualSearch.trim() && (
                  <div className="absolute z-30 top-full right-0 mt-1 w-52 panel-strong shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {manualResults.length === 0 ? (
                      <p className="text-gray-600 text-[11px] p-2">Keine Karte gefunden</p>
                    ) : manualResults.map(c => (
                      <button key={c.id} onClick={() => handleManualBan(c.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors text-left">
                        <div className="w-6 h-7 shrink-0">
                          <CardThumb id={c.id} name={c.name} rarity={c.rarity} className="w-full h-full" />
                        </div>
                        <span className="text-white text-xs flex-1 truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowManualBan(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-white/10 px-3 py-1.5 rounded-lg hover:text-violet-300 hover:border-violet-400/40 transition-colors">
                <Plus size={12} />
                Karte manuell bannen
              </button>
            )}
          </div>
        </div>
        {banned.length === 0 ? (
          <p className="text-gray-600 text-sm">Noch keine Karte gebannt — dreh das Glücksrad oder banne eine manuell.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
            {banned.map(b => (
              <div key={b.entryId} className="relative group aspect-[5/6]">
                <CardThumb id={b.id} name={b.name} rarity={b.rarity} className="w-full h-full opacity-80" />
                <div className="absolute inset-0 rounded-lg border border-red-500/30 pointer-events-none" />
                <button onClick={() => handleUnban(b.entryId)} title="Bann aufheben"
                  className="absolute top-1 right-1 bg-black/70 border border-white/20 rounded-lg p-1 text-gray-300 hover:text-white hover:border-white/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
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

  if (!rows) return <p className="text-gray-500 text-sm py-8 text-center">Lade Leaderboard…</p>;
  if (rows.length === 0) return (
    <div className="border border-dashed border-white/10 rounded-lg p-10 text-center">
      <p className="text-gray-500 text-sm">Noch keine Accounts verknüpft — sei der Erste!</p>
    </div>
  );

  const rankColor = (i) => i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-600';

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[3rem_1fr_auto] gap-3 px-4 py-2.5 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
        <span>#</span>
        <span>Spieler</span>
        <span className="text-right">Höchste Trophäen</span>
      </div>
      {rows.map((row, i) => (
        <div key={row.playerTag} className="border-b border-white/5 last:border-b-0">
          <button onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full grid grid-cols-[3rem_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-white/[0.03] transition-colors text-left">
            <span className={`font-black text-sm tabular-nums ${rankColor(i)}`}>{i + 1}</span>
            <span className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-sm truncate">{row.playerName}</span>
              <span className="text-gray-700 text-[10px] font-mono shrink-0">#{row.playerTag}</span>
              
              {row.isFinished && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 rounded-lg shrink-0">
                  Beendet
                </span>
              )}
              {row.isActive && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-600/10 px-1.5 py-0.5 rounded-lg shrink-0">
                  Aktiv
                </span>
              )}

              {row.twitchLogin && (
                <span className="flex items-center gap-1 text-[11px] text-purple-400 shrink-0">
                  <TwitchGlyph size={11} />
                  {row.twitchLogin}
                </span>
              )}
            </span>
            <span className="flex items-center gap-3 justify-end">
              <span className="flex items-center gap-1.5">
                <Trophy size={13} className="text-amber-400" />
                <span className="text-white font-black tabular-nums">{fmt(row.bestTrophies)}</span>
              </span>
              <ChevronDown size={13} className={`text-gray-600 transition-transform ${expanded === i ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {expanded === i && (
            <div className="px-4 pb-4 pt-1 bg-white/[0.015]">
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span>Versuche <span className="text-white font-bold">{row.attempts}</span></span>
                <span><span className="text-red-400 font-bold">{row.bannedCount}</span> Karten gebannt</span>
              </div>
              {row.deck.length === 0 ? (
                <p className="text-gray-600 text-xs">Noch kein Deck gebaut.</p>
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
    });
  };

  const regenerate = async () => {
    if (!window.confirm('Neuen Overlay-Link erzeugen? Der alte Link funktioniert danach nicht mehr (OBS muss aktualisiert werden).')) return;
    const d = await api.regenerateOverlayKey();
    setOverlayKey(d.overlayKey);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="panel p-5 space-y-3">
        <h3 className="text-white font-bold text-sm">OBS-Overlay</h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          Binde diesen Link als Browser-Quelle in OBS ein. Das Overlay zeigt automatisch die gebannten
          Karten und den Versuchszähler deines <span className="text-violet-300">aktiven</span> Accounts.
        </p>
        <div className="flex items-center gap-2">
          <div className={`flex-1 bg-[#1a1a20] border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-xs font-mono truncate transition-all ${hidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {link || 'Lade…'}
          </div>
          <button onClick={copy} title="Kopieren" disabled={!link}
            className="p-2.5 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          <button onClick={() => setHidden(v => !v)} title={hidden ? 'Anzeigen' : 'Verbergen'}
            className="p-2.5 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
        <button onClick={regenerate} disabled={!overlayKey}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-white/10 px-3 py-1.5 rounded-lg hover:text-red-400 hover:border-red-500/40 transition-colors">
          <RefreshCw size={12} />
          Link neu generieren
        </button>
      </div>

      <div className={`border rounded-lg p-5 ${apiConfigured ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
        <h3 className={`font-bold text-sm mb-1 ${apiConfigured ? 'text-green-400' : 'text-amber-400'}`}>
          {apiConfigured ? 'Clash Royale API verbunden' : 'Clash Royale API nicht konfiguriert'}
        </h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          {apiConfigured
            ? 'Spielernamen, Trophäen und Ingame-Decks werden automatisch über das Spieler-Kürzel synchronisiert.'
            : 'Accounts können trotzdem verknüp werden, aber ohne automatischen Abgleich. Hinterlege dazu CLASH_ROYALE_API_TOKEN in der Backend-.env (Token von developer.clashroyale.com).'}
        </p>
      </div>
    </div>
  );
}

// ── Regeln ───────────────────────────────────────────────────────────────────
function RulesTab() {
  return (
    <div className="panel p-6 max-w-3xl">
      <h2 className="text-white font-bold text-lg mb-4">Nuzlocke Regeln</h2>
      <ol className="list-decimal list-inside space-y-4 text-gray-300 text-sm leading-relaxed">
        <li>
          <strong className="text-white">Nur Ladder spielen:</strong> Es ist nur Ladder erlaubt. Keine Challenges oder andere Modi.
        </li>
        <li>
          <strong className="text-white">Glücksrad beim Lose:</strong> Bei einem Lose muss das Glücksrad gedreht werden, was eine Karte aus deinem aktiven Deck bannt, wodurch sie weder gespielt noch gelevelt werden darf.
        </li>
        <li>
          <strong className="text-white">3 Loses am Stück:</strong> Bei 3 Loses am Stück werden alle 8 Karten aus dem Deck gebannt.
        </li>
        <li>
          <strong className="text-white">Kartenlevel-Cap:</strong> Das Kartenlevel darf nur so hoch sein wie das Kingtowerlevel.
        </li>
        <li>
          <strong className="text-white">Free to Play:</strong> Es darf kein Geld in den Account gesteckt werden (Aktionen aus dem Supercell Store oder ähnlichem, die Free to Play sind, sind erlaubt).
        </li>
      </ol>
    </div>
  );
}

// ── Hauptseite ───────────────────────────────────────────────────────────────
export default function NuzlockePage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState(null);
  const [globalAttempts, setGlobalAttempts] = useState(0); // <-- Globaler State für UI
  const [apiConfigured, setApiConfigured] = useState(false);
  const [detail, setDetail] = useState(null); 
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState('');

  const loadAccounts = useCallback(() => {
    if (!user) return;
    api.getMyNuzlocke()
      .then(d => { 
        setAccounts(d.accounts); 
        setApiConfigured(d.apiConfigured); 
        setGlobalAttempts(d.globalAttempts || 0); // Lade den globalen Counter
      })
      .catch(() => setAccounts([]));
  }, [user]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const openAccount = async (acc) => {
    try {
      setDetail(await api.getAccount(acc.accountId));
    } catch (e) { setError(e.message); setTimeout(() => setError(''), 3000); }
  };

  const handleActivate = async (acc) => {
    try {
      await api.activateAccount(acc.accountId);
      setAccounts(prev => prev.map(a => ({ ...a, isActive: a.accountId === acc.accountId })));
    } catch (e) { setError(e.message); setTimeout(() => setError(''), 3000); }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`Account "${acc.playerName}" wirklich entfernen? Deck und gebannte Karten gehen verloren.`)) return;
    try {
      await api.deleteAccount(acc.accountId);
      loadAccounts();
    } catch (e) { setError(e.message); setTimeout(() => setError(''), 3000); }
  };

  const handleFinish = async (acc) => {
    // Kein window.confirm mehr, da es jetzt ein ungefährlicher Toggle ist
    try {
      await api.finishRun(acc.accountId);
      loadAccounts();
    } catch (e) { setError(e.message); setTimeout(() => setError(''), 3000); }
  };

  const handleAdjustGlobalAttempts = async (delta) => {
    const next = Math.max(0, globalAttempts + delta);
    setGlobalAttempts(next);
    try {
      await api.adjustAttempts(delta);
    } catch {
      // Fehlerbehandlung – Sync korrigiert es beim nächsten Laden
    }
  };

  return (
    <div className="page-fade max-w-6xl mx-auto">
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

      {/* Kopfbereich */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">Nuzlocke</h1>
        <p className="text-gray-500 text-sm mt-1">
          Verliere ein Match, dreh das Glücksrad — die getroffene Karte ist für den Rest des Runs gebannt.
        </p>
      </div>

      {!user ? (
        <div className="panel p-10 text-center max-w-md mx-auto mt-12">
          <p className="text-white font-bold mb-1">Login erforderlich</p>
          <p className="text-gray-500 text-sm mb-5">Melde dich mit Twitch an, um deine Accounts und Bans zu verwalten.</p>
          <button onClick={() => login(false)}
            className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <TwitchGlyph size={15} />
            Mit Twitch einloggen
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-white/5 mb-6 overflow-x-auto">
            <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')} icon={Users} label="Accounts" />
            <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')} icon={Trophy} label="Leaderboard" />
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={Settings} label="Einstellungen" />
            <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={Book} label="Regeln" />
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

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
              <p className="text-gray-500 text-sm py-8 text-center">Lade Accounts…</p>
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

          {addOpen && (
            <AddAccountModal
              onClose={() => setAddOpen(false)}
              onAdded={(acc) => { setAddOpen(false); loadAccounts(); openAccount(acc); }}
            />
          )}
        </>
      )}
    </div>
  );
}