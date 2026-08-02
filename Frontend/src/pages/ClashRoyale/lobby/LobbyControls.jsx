// Rechte Spalte der Lobby: alles, was das Spiel selbst betrifft.
//
// Reihenfolge bewusst so: erst WAS gespielt wird (Modus), dann WIE (Einstellungen),
// dann WOMIT (Kartenpool), dann die Zusatzfunktionen (Tracking) — und ganz unten Start.
//
// Modus und Kartenpool stehen direkt hier und nicht mehr im Einstellungsfenster: Beides
// wechselt man häufig und in Absprache mit der Runde. Hinter einem Knopf versteckt war
// das ein Klick zu viel. Im Einstellungsfenster liegen jetzt nur noch die Regler, die
// wirklich zum gewählten Spielmodus gehören.

import React, { useState } from 'react';
import { Sword, ChevronDown, Check, Ban, Sliders, Activity, Shield } from 'lucide-react';
import Toggle from '../ui/Toggle';
import StartGameButton from './StartGameButton';
import { MODES, modeNameFor, modeDescFor, modeInfo } from '../modesConfig';
import { ALL_CARDS } from '../data/cards';
import { resolveError } from '../i18n';

export default function LobbyControls({
  lobbyData, actions, t, lang,
  canControlLobby, isClashAdmin, effectiveIsHost,
  poolSize, excludedCount,
  onOpenPanel, onOpenCardPool, onStart,
  canStart, requiredPool, poolTooSmall, carouselMaxPlayers, carouselTooMany,
}) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  const mode = lobbyData?.mode || 'snake';
  const current = modeInfo(mode);
  const CurrentModeIcon = current.icon;
  const linkedCount = (lobbyData?.players || []).filter(p => !p.isAdmin && p.crTag).length;

  const toggleTracking = async (next) => {
    setTrackingError('');
    const res = await actions.setTracking(next);
    if (!res?.ok) setTrackingError(resolveError(t, res));
  };

  // Gäste sehen dieselbe Reihenfolge, nur ohne Bedienelemente
  if (!canControlLobby) {
    return (
      <div className="space-y-4">
        <div className="panel p-5 space-y-2">
          <p className="text-white/40 text-xs uppercase tracking-wider">{t.gameMode}</p>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
              <CurrentModeIcon size={16} />
            </span>
            <span className="text-white font-bold">{modeNameFor(mode, lang)}</span>
          </div>
          <p className="text-white/40 text-xs leading-relaxed">{modeDescFor(mode, lang)}</p>
          {excludedCount > 0 && (
            <button onClick={onOpenCardPool}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors pt-1">
              <Ban size={11} className="text-red-400 shrink-0" />
              {t.excludedCardsView(excludedCount)}
            </button>
          )}
          <p className="text-white/30 text-sm text-center pt-3">{t.waitingForHost}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isClashAdmin && !effectiveIsHost && (
        <p className="text-violet-400 text-xs flex items-center gap-1.5">
          <Shield size={12} /> {t.adminAccessNote}
        </p>
      )}

      {/* ── 1. Spielmodus ───────────────────────────────────────────────────── */}
      <div className="panel p-5">
        <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
          <Sword size={13} className="text-white/40" />
          {t.gameMode}
        </p>
        <div className="relative">
          <button onClick={() => setModeMenuOpen(v => !v)}
            aria-haspopup="listbox" aria-expanded={modeMenuOpen}
            className={`w-full flex items-center gap-2.5 bg-black/30 border rounded-lg px-3.5 py-3 text-left transition-colors ${
              modeMenuOpen ? 'border-violet-500/50' : 'border-white/10 hover:border-white/25'
            }`}>
            <CurrentModeIcon size={16} className="text-violet-400 shrink-0" />
            <span className="text-white text-sm font-semibold flex-1">{modeNameFor(mode, lang)}</span>
            <ChevronDown size={14} className={`text-white/40 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {modeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
              <div role="listbox"
                className="absolute z-20 mt-1 w-full panel-strong shadow-2xl shadow-black/60 overflow-hidden max-h-[60vh] overflow-y-auto custom-scrollbar">
                {MODES.filter(m => m.available).map(m => {
                  const Icon = m.icon;
                  const active = m.id === mode;
                  return (
                    <button key={m.id} role="option" aria-selected={active}
                      onClick={() => { setModeMenuOpen(false); if (m.id !== mode) actions.setMode(m.id); }}
                      className={`w-full flex items-start gap-2.5 px-3.5 py-3 text-left transition-colors ${
                        active ? 'bg-violet-500/10' : 'hover:bg-white/5'
                      }`}>
                      <Icon size={15} className={`shrink-0 mt-0.5 ${active ? 'text-violet-400' : 'text-white/40'}`} />
                      <span className="flex-1">
                        <span className={`block text-sm font-semibold ${active ? 'text-violet-300' : 'text-white'}`}>
                          {modeNameFor(m.id, lang)}
                        </span>
                        <span className="block text-white/40 text-xs leading-relaxed mt-0.5">
                          {modeDescFor(m.id, lang)}
                        </span>
                      </span>
                      {active && <Check size={14} className="text-violet-400 shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <p className="text-white/30 text-xs mt-2 leading-relaxed">{modeDescFor(mode, lang)}</p>
      </div>

      {/* ── 2. Einstellungen — nur noch die Regler DIESES Modus ─────────────── */}
      <button onClick={onOpenPanel}
        className="w-full flex items-center gap-3 panel px-5 py-4 hover:bg-white/[0.03] transition-colors text-left">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Sliders size={16} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-white font-semibold text-sm">{t.hostPanelOpen}</span>
          <span className="block text-white/30 text-xs truncate">{t.hostPanelHint}</span>
        </span>
        <ChevronDown size={14} className="text-white/30 -rotate-90 shrink-0" />
      </button>

      {/* ── 3. Kartenpool ───────────────────────────────────────────────────── */}
      <div className="panel p-5">
        <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
          <Ban size={13} className="text-white/40" />
          {t.cardPool}
        </p>
        <button onClick={onOpenCardPool}
          className="w-full flex items-center justify-between gap-2 bg-black/30 border border-white/10 hover:border-white/25 rounded-lg px-3.5 py-3 transition-colors text-left">
          <span className={`text-sm font-semibold ${excludedCount ? 'text-white' : 'text-white/50'}`}>
            {excludedCount === 0 ? t.allCardsInDraft(ALL_CARDS.length) : t.excludedInDraft(excludedCount, poolSize)}
          </span>
          <span className="text-violet-400 text-xs font-semibold shrink-0">{t.edit}</span>
        </button>
        {poolTooSmall && (
          <p className="text-red-400 text-xs mt-2">
            {t.poolTooSmall(modeNameFor(mode, lang), requiredPool, poolSize)}
          </p>
        )}
      </div>

      {/* ── 4. Tracking ─────────────────────────────────────────────────────── */}
      <div className="panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold flex items-center gap-2">
              <Activity size={13} className={lobbyData?.trackingEnabled ? 'text-green-400' : 'text-white/40'} />
              {t.tracking}
            </p>
            <p className="text-white/30 text-xs mt-0.5 leading-relaxed">{t.trackingNote}</p>
          </div>
          <Toggle
            checked={!!lobbyData?.trackingEnabled}
            onChange={toggleTracking}
            accent="bg-green-500"
            aria-label={t.tracking}
          />
        </div>
        {lobbyData?.trackingEnabled && (
          <p className="text-white/25 text-[11px] leading-relaxed mt-2">{t.trackingDelayNote}</p>
        )}
        {!lobbyData?.trackingEnabled && linkedCount === 0 && (
          <p className="text-white/25 text-[11px] leading-relaxed mt-2">{t.trackingNoAccounts}</p>
        )}
        {trackingError && <p className="text-red-400 text-xs mt-2">{trackingError}</p>}
      </div>

      {/* ── 5. Start ────────────────────────────────────────────────────────── */}
      <StartGameButton
        onStart={onStart}
        canStart={canStart}
        t={t}
        carouselTooMany={carouselTooMany}
        carouselMaxPlayers={carouselMaxPlayers}
        cardsPerTable={lobbyData?.carouselCardsPerTable || 8}
        poolTooSmall={poolTooSmall}
        poolSize={poolSize}
        requiredPool={requiredPool}
      />
    </div>
  );
}
