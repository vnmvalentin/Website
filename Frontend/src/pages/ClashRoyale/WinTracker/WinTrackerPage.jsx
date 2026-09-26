import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  Trophy, Plus, X, RefreshCw, Trash2, Copy, Check, Eye, EyeOff, TrendingUp, ChevronsUp, Minus,
  MessageSquare, RotateCcw, Palette, LayoutGrid, Link2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { leagueIconUrl, leagueName, MEDAL_ICON_URL } from '../data/leagueIcons';
import { trophyArenaIcon, trophyArenaName } from '../data/trophyArenas';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';
import trophy2v2Icon from '../../../assets/clashRoyale/ui/trophy2v2.webp';
import OverlayPreview from './OverlayPreview';
import Toggle from '../ui/Toggle';
import { SegmentedControl } from '../ui/SettingRow';
import * as api from './winTrackerApi';
import { dictForWt, wt } from './wtI18n';

const fmt = (n, lang) => (n || 0).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');

// ── Account hinzufügen (Modal) ───────────────────────────────────────────────
function AddAccountModal({ t, onClose, onAdded }) {
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
          <h3 className="text-white font-bold">{t.addAccountTitle}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={16} /></button>
        </div>
        <p className="text-gray-500 text-xs leading-relaxed mb-4">
          {t.addAccountHint}
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
          {busy ? t.addAccountBusy : t.addAccountSubmit}
        </button>
      </div>
    </div>
  );
}

// trackMode 'trophies' zeigt die Lifetime-Trophäen (siehe "Seasonal Trophy Road"-Kommentar in
// crWinTrackerRoutes.js) — die haben KEINE Liga, der Ranked1v1-Orden wäre hier irreführend.
// Zeigt stattdessen die klassische Trophäenstraßen-Arena (derselbe Fix wie am Overlay-Kopf in
// WinTrackerOverlayPage.jsx/OverlayPreview.jsx) — trophyArenaIcon() liefert null oberhalb von
// 14.000 Trophäen (kein Icon bekannt, siehe trophyArenas.js), dann der bisherige Platzhalter.
function LeagueBadge({ leagueNumber, polRank, size = 40, lang, trackMode, trophies }) {
  const isTrophyMode = trackMode === 'trophies';
  const url = isTrophyMode ? trophyArenaIcon(trophies) : leagueIconUrl(leagueNumber);
  const label = isTrophyMode ? trophyArenaName(trophies) : leagueName(leagueNumber, lang);
  if (!url) {
    return (
      <div className="rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <Trophy size={size * 0.5} className="text-amber-400" />
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={label}>
      <img src={url} alt={label} className="w-full h-full object-contain" />
      {/* polRank ist 1v1-spezifisch (Path of Legend) — beim Trophäenmodus (Lifetime-Trophäen,
          keine eigene Rangliste) wäre er hier ein fälschlich angehängter 1v1-Rang. */}
      {polRank && !isTrophyMode ? (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#0f0f13] border border-violet-400/40 text-violet-300 text-[9px] font-bold px-1 rounded-lg leading-tight whitespace-nowrap">
          #{polRank}
        </span>
      ) : null}
    </div>
  );
}

// ── Stufenleiste (Ligen 1-6) ─────────────────────────────────────────────────
function StepBar({ step, maxSteps }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: maxSteps }, (_, i) => (
        <span key={i} className={`flex-1 h-1.5 rounded-sm ${i < step ? 'bg-amber-400' : 'bg-white/10'}`} />
      ))}
    </div>
  );
}

// Aktuelle Stufe: die API liefert sie nicht mit, deshalb zählt der Tracker sie aus den
// Ranked-Matches — der Startwert muss einmal von Hand stimmen.
function LadderValue({ ladder, onStepChange, t }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <ChevronsUp size={14} className="text-amber-400" />
        <span className="font-black text-lg tabular-nums text-white">{ladder.step}</span>
        <span className="text-gray-500 font-bold text-sm tabular-nums -ml-1">/{ladder.maxSteps}</span>
        <span className="text-gray-600 text-xs">{t.stepsUnit}</span>
        {ladder.bonusRemaining > 0 && (
          <span className="text-[10px] font-bold text-amber-300 border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 rounded-lg"
            title={t.bonusTitle}>
            {wt(t, 'bonusLabel', { n: ladder.bonusRemaining })}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => onStepChange(ladder.step - 1)} disabled={ladder.step <= 1 && ladder.league <= 1}
            title={t.stepCorrectTitle}
            className="w-6 h-6 flex items-center justify-center rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-white/10 transition-colors">
            <Minus size={12} />
          </button>
          <button onClick={() => onStepChange(ladder.step + 1)}
            title={t.stepCorrectTitle}
            className="w-6 h-6 flex items-center justify-center rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-white/10 transition-colors">
            <Plus size={12} />
          </button>
        </span>
      </div>
      <div className="mt-2">
        <StepBar step={ladder.step} maxSteps={ladder.maxSteps} />
      </div>
    </>
  );
}

// ── Accounts-Übersicht ───────────────────────────────────────────────────────
function AccountsTab({ t, lang, accounts, onActivate, onDelete, onAdd, onRefresh, onLadderStepChange, refreshingId }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-bold">{t.yourAccounts}</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {t.yourAccountsHint}
          </p>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shrink-0">
          <Plus size={14} />
          {t.addAccountBtn}
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-10 text-center">
          <p className="text-white font-bold mb-1">{t.emptyTitle}</p>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            {t.emptyHint}
          </p>
          <button onClick={onAdd}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <Plus size={14} />
            {t.addAccountBtn}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.accountId}
              className={`bg-[#0f0f13] border rounded-lg p-5 transition-colors group relative ${
                acc.isActive ? 'border-violet-400/40' : 'border-white/5 hover:border-white/20'
              }`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <LeagueBadge leagueNumber={acc.leagueNumber} polRank={acc.polRank} lang={lang} trackMode={acc.trackMode} trophies={acc.trophies} />
                  <div className="min-w-0">
                    <p className="font-bold truncate text-white">{acc.playerName}</p>
                    <p className="text-gray-600 text-xs font-mono">#{acc.playerTag}</p>
                  </div>
                </div>

                {acc.isActive ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-600/10 px-2 py-0.5 rounded-lg shrink-0">
                    {t.active}
                  </span>
                ) : (
                  <button onClick={() => onActivate(acc)}
                    className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/10 px-2 py-0.5 rounded-lg hover:text-violet-300 hover:border-violet-400/40 transition-colors shrink-0">
                    {t.activate}
                  </button>
                )}
              </div>

              <div className="mb-3">
                {acc.trackMode === 'medals' && acc.ladder ? (
                  <LadderValue ladder={acc.ladder} onStepChange={(step) => onLadderStepChange(acc, step)} t={t} />
                ) : acc.trackMode === '2v2' ? (
                  <div className="flex items-center gap-1.5">
                    <img src={trophy2v2Icon} alt="" className="h-[18px] w-auto object-contain" />
                    <span className="font-black text-lg tabular-nums text-white">{fmt(acc.league2v2Trophies, lang)}</span>
                    <span className="text-gray-600 text-xs">{wt(t, 'league2v2Label', { n: fmt(acc.league2v2BestTrophies, lang) })}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {acc.trackMode === 'trophies'
                      ? <img src={trophyIcon} alt="" className="h-[18px] w-auto object-contain" />
                      : <img src={MEDAL_ICON_URL} alt="" className="h-[18px] w-auto object-contain" />}
                    {acc.trackMode === 'trophies' ? (
                      <>
                        <span className="font-black text-lg tabular-nums text-white">{fmt(acc.trophies, lang)}</span>
                        <span className="text-gray-600 text-xs">{wt(t, 'bestTrophiesLabel', { n: fmt(acc.bestTrophies, lang) })}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-black text-lg tabular-nums text-white">{fmt(acc.seasonMedals, lang)}</span>
                        <span className="text-gray-600 text-xs">{t.medalsSeasonLabel}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-white/5 pt-3">
                <span>{leagueName(acc.leagueNumber, lang)}</span>
                <button onClick={() => onRefresh(acc)} title={t.refreshNow}
                  className="ml-auto text-gray-600 hover:text-white transition-colors p-0.5">
                  <RefreshCw size={13} className={refreshingId === acc.accountId ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => onDelete(acc)} title={t.removeAccount}
                  className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-0.5">
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

// ── AN/AUS-Knopf ───────────────────────────────────────────────────────────
// EIN Knopf statt Label+Schalter nebeneinander (frühere ToggleRow) — Zustand steht direkt im
// Knopftext, dadurch halb so hoch und ohne eigene Hintergrund-"Bubble". Passt so auch zu zweit
// nebeneinander in eine Zeile (siehe Autoswitch+Reset in SettingsTab).
function ToggleButton({ label, checked, onChange, onLabel, offLabel, title, disabled, className = '' }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled} title={title}
      aria-pressed={checked}
      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-colors border ${
        disabled
          ? 'bg-black/20 border-white/5 text-white/20 cursor-not-allowed'
          : checked
            ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
            : 'bg-black/30 border-white/10 text-white/50 hover:text-white hover:border-white/25'
      } ${className}`}>
      {label}: {checked ? onLabel : offLabel}
    </button>
  );
}

// ── Kleine Pille für unabhängige Unter-Schalter (z.B. "Win-Rate %" innerhalb Session) ────────
// Durchgehend gefüllt statt nur ein dünner Rand — die reine Rand-Variante war im ausgeschalteten
// Zustand (heller grauer Text auf fast unsichtbarem Rand) kaum noch als Knopf erkennbar. Dieselbe
// Farbsprache wie SegmentedControl (bg-black/30 im Aus-Zustand), damit sich beide wie dieselbe
// Art Bedienelement anfühlen, nicht wie zwei verschiedene.
function Pill({ label, active, onClick, title }) {
  return (
    <button onClick={onClick} title={title} type="button" aria-pressed={active}
      className={`text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
        active ? 'bg-violet-600 text-white' : 'bg-black/30 text-white/50 hover:bg-black/50 hover:text-white'
      }`}>
      {label}
    </button>
  );
}

// ── Beschriftete Gruppe von Pillen/Segmented-Controls unter einem Modul ──────────────────────
// Vorher lagen bei "Session" bis zu 10 Pillen ungeordnet in einer einzigen Zeile — nicht mehr
// erkennbar, welche zusammengehören (z.B. die 3 Darstellungs-Optionen) und welche unabhängige
// Schalter sind. Eine kurze graue Bezeichnung darüber macht die Gruppierung auf einen Blick klar.
function PillGroup({ label, children }) {
  return (
    <div>
      <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2.5">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// ── Einstellungs-Abschnitt, aufklappbar ──────────────────────────────────────
// Kein eigener Kasten pro Abschnitt mehr (Nutzer-Feedback: nicht jedes Modul in eine einzelne
// schwebende Glas-Pille packen) — alle Abschnitte teilen sich die EINE Fläche aus SettingsTab,
// getrennt nur durch die Linien des umgebenden divide-y. Symbol+Titel in der Kopfzeile, per Klick
// auf die ganze Zeile (nicht nur den Pfeil, größere Trefffläche) zu- und aufklappbar; ob ein
// Abschnitt beim Öffnen der Seite offen ist, bestimmt defaultOpen.
function SettingsSection({ icon: Icon, title, description, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    // Großzügige Abstände (Nutzer-Feedback: man erkannte kaum, wo ein Abschnitt endet und die
    // nächste Option beginnt): mehr Luft um den Abschnitt und deutlich mehr zwischen seinen Teilen.
    <section className="px-6 py-6">
      <button type="button" onClick={() => setOpen(o => !o)} title={description}
        className="w-full flex items-center justify-between gap-3 text-left">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          {Icon && <Icon size={15} className="text-violet-300" />}
          {title}
        </h3>
        <ChevronDown size={16} className={`text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-6 mt-5">{children}</div>}
    </section>
  );
}

// ── Farbfeld: kompakter Swatch für die nebeneinander stehende Farbreihe ──────────────────────
// Kein eigener Hintergrund/Rahmen-Kasten mehr (Nutzer-Feedback: "no single bubbles flying
// around") — nur Farbkreis + kurzes Label, mehrere davon stehen per flex nebeneinander auf dem
// gemeinsamen Karten-Hintergrund (Nutzer-Feedback: "make the colours go side by side"). Der
// native <input type="color"> selbst bleibt der große, eindeutig klickbare Kreis.
function ColorSwatch({ label, value, onChange, auto, onReset, resetTitle }) {
  if (auto) {
    return (
      <button type="button" onClick={() => onChange(value)} className="flex flex-col items-center gap-1.5 w-16">
        <span className="w-10 h-10 rounded-full border border-dashed border-white/25 flex items-center justify-center text-white/25">
          <Plus size={14} />
        </span>
        <span className="text-white/50 text-[10px] font-semibold text-center leading-tight">{label}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5 w-16">
      <label className="cursor-pointer">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-full border border-white/20 bg-transparent cursor-pointer p-0" />
      </label>
      <span className="flex items-center gap-1">
        <span className="text-white/60 text-[10px] font-semibold text-center leading-tight">{label}</span>
        {onReset && (
          <button type="button" onClick={onReset} title={resetTitle} className="text-white/25 hover:text-white/60 transition-colors">
            <X size={9} />
          </button>
        )}
      </span>
    </div>
  );
}

// ── Visuelle Auswahl: Karten mit kleiner Vorschau statt reinem Text ──────────────────────────
// Für Wahlen, bei denen eine kleine Miniatur schneller zeigt "was passiert dann" als ein Label
// allein (getrackter Wert, Deck-Platzierung, Darstellung der letzten Spiele) — genau eine Option
// wählbar, wie SegmentedControl, nur mit Bildchen statt nur Text (Nutzer-Feedback: "more visually
// appealing" statt einer reinen Text-Pillen-Reihe).
function VisualPicker({ options, value, onChange, disabled, columns = 3 }) {
  const colClass = columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`grid ${colClass} gap-3`} role="group">
      {options.map(opt => {
        const active = opt.id === value;
        const isDisabled = disabled || opt.disabled;
        return (
          <button key={opt.id} type="button" title={opt.title}
            onClick={() => !isDisabled && onChange(opt.id)}
            disabled={isDisabled}
            aria-pressed={active}
            className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
              isDisabled
                ? 'border-white/5 bg-black/20 opacity-40 cursor-not-allowed'
                : active
                  ? 'border-violet-400/60 bg-violet-600/15'
                  : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-black/30'
            }`}>
            <div className="h-8 flex items-center justify-center">{opt.preview}</div>
            <span className={`text-xs font-semibold text-center leading-tight ${active ? 'text-white' : 'text-white/60'}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Mini-Diagramm für die Deck-Platzierung: ein kleines "Karten"-Rechteck mit einem hervorgehobenen
// Streifen an der Seite, an der das Deck andocken würde — zeigt in einem Blick, was z.B. "Links"
// bedeutet, ohne erst das Overlay selbst danach absuchen zu müssen.
function PlacementPreview({ side }) {
  const isRow = side === 'left' || side === 'right';
  const deckFirst = side === 'top' || side === 'left';
  const deck = <span key="deck" className="bg-violet-400/70 rounded-[2px]" style={isRow ? { width: 5 } : { height: 5 }} />;
  const main = <span key="main" className="bg-white/20 rounded-[2px] flex-1" />;
  return (
    <div className={`w-9 h-7 rounded-[4px] border border-white/15 bg-black/30 p-[3px] flex gap-[3px] ${isRow ? 'flex-row' : 'flex-col'}`}>
      {deckFirst ? [deck, main] : [main, deck]}
    </div>
  );
}

// Mini-Vorschau für die Darstellung der letzten 5 Spiele — zeigt exakt die Form, die im Overlay
// tatsächlich auftaucht (grüne Sieg-Blase/-Punkt), statt nur ihren Namen ("Win/Lose", "+/-", …).
function Last5StylePreview({ kind }) {
  if (kind === 'dot') return <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />;
  return (
    <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-1 tabular-nums">
      {kind === 'result' ? 'Win' : '+28'}
    </span>
  );
}

// ── Overlay-Designer: Teile ein-/ausblenden ──────────────────────────────────
// Der Kopfbereich (Name/Liga/Hauptwert) ist immer sichtbar und fix oben. Darunter gibt es nur
// noch zwei Teile: "Session" (Statistik + letzte 5 Spiele, ein gemeinsames Modul) und "Deck" —
// dessen Position ist keine Sortierfrage mehr (siehe deckPlacement-Pillen unten), darum
// braucht hier nichts mehr eine Ziehen-Geste oder Pfeile.
const moduleDefs = (t) => ({
  deck: { label: t.moduleDeckLabel, description: t.moduleDeckDesc },
  session: { label: t.moduleSessionLabel, description: t.moduleSessionDesc },
});

// ── Modul-Zeile: Name + Sichtbarkeit, Feinabstimmung (falls vorhanden) einzeln aufklappbar ────
// Kein eigener Kasten mehr pro Zeile (Nutzer-Feedback: keine "bubbles") — nur eine Trennlinie
// zur vorherigen Zeile, alle drei teilen sich den Hintergrund der umgebenden SettingsSection. Die
// Feinabstimmung ist jetzt standardmäßig EINGEKLAPPT (Nutzer-Feedback: "openable menu to save
// space") statt immer offen — Klick auf den Zeilentitel (nicht auf den Sichtbarkeits-Schalter
// rechts, der bleibt unabhängig) klappt sie auf. Sichtbarkeit bleibt ein echter Schalter (Toggle,
// wie überall sonst in der Lobby) statt eines reinen Augen-Icon-Buttons.
function ModuleControlRow({ t, moduleKey, label, description, visible, onToggle, children }) {
  const def = moduleDefs(t)[moduleKey] || { label, description };
  const hasChildren = !!children;
  const [open, setOpen] = useState(false);
  return (
    // Gleich viel Luft über und unter der Trennlinie, und die Linie ist jetzt deutlich sichtbar
    // (vorher white/5 mit Abstand nur nach unten) — so endet ein Modul erkennbar, bevor das
    // nächste beginnt.
    <div className="border-t border-white/10 pt-5 mt-5 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => hasChildren && setOpen(o => !o)} disabled={!hasChildren}
          title={description}
          className="min-w-[150px] flex-1 flex items-center gap-1.5 text-left disabled:cursor-default">
          {hasChildren && (
            <ChevronRight size={13} className={`text-gray-600 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          )}
          <span className={`font-bold text-sm ${visible ? 'text-white' : 'text-gray-600'}`}>{def.label}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-semibold ${visible ? 'text-gray-400' : 'text-violet-300'}`}>
            {visible ? t.visible : t.hidden}
          </span>
          <Toggle checked={visible} onChange={onToggle} aria-label={visible ? t.ariaHideModule : t.ariaShowModule} />
        </div>
      </div>
      {open && children && (
        // Senkrechte Führungslinie: alles darunter gehört zu DIESEM Modul, nicht zum nächsten.
        // Die einzelnen Optionsgruppen darin haben deutlich mehr Abstand als vorher (space-y-3).
        <div className="mt-4 ml-1.5 pl-5 border-l border-white/10 space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Einstellungen (OBS-Link + Anzeige-Optionen) ──────────────────────────────
function SettingsTab({ t, overlayKey, settings, onSettingsChange, apiConfigured, activeAccount, onResetSession, flashError }) {
  const { user } = useContext(TwitchAuthContext);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);

  const link = overlayKey ? `${window.location.origin}/clash-royale/win-tracker/overlay/${overlayKey}` : '';

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const regenerate = async () => {
    if (!window.confirm(t.regenerateConfirm)) return;
    await api.regenerateOverlayKey();
    window.location.reload();
  };

  // Schlug der Server-Save fehl, MUSS die UI das zeigen — sonst sieht z.B. der Chat-Befehl-
  // Schalter "aktiv" aus, obwohl die Datenbank nie erfahren hat, dass er an ist (genau der Fehler,
  // der den Chat-Befehl unbemerkt tot aussehen ließ: die Karte zeigte "Aktiv in #kanal", aber
  // gespeichert war nie etwas). Bei einem Fehler außerdem den alten Stand wiederherstellen, statt
  // optimistisch auf dem falschen (nie gespeicherten) Wert stehen zu bleiben.
  const applyPatch = async (patch) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    try {
      await api.saveSettings(next);
    } catch (e) {
      onSettingsChange(previous);
      flashError?.(e.message);
    }
  };
  const toggle = (key) => (value) => applyPatch({ [key]: value });

  // ── Overlay-Designer: Sichtbarkeit von Deck + Session ──────────────────────
  // "Session" hat keinen eigenen Sichtbarkeits-Schalter in der DB — sie zählt als sichtbar,
  // sobald mindestens eine ihrer Unter-Optionen an ist (genau wie das Overlay es selbst
  // auswertet). Aus-/Einschalten der Zeile schaltet alle vier zusammen (Profit-Zahl,
  // Win/Loss-Zahlen, Win-Rate %, letzte-5-Zeile).
  const sessionVisible = !!(settings.showDailyProfit || settings.showWinLossNumbers || settings.showWinLossPercent || settings.showLast5);
  const moduleVisibility = { deck: settings.showDeck !== false, session: sessionVisible };
  const setModuleVisible = (key, value) => {
    if (key === 'deck') return applyPatch({ showDeck: value });
    if (key === 'session') return applyPatch({ showDailyProfit: value, showWinLossNumbers: value, showWinLossPercent: value, showLast5: value });
  };
  const last5Style = settings.last5Style || 'result';
  const deckPlacement = settings.deckPlacement || 'top';
  const last5Direction = settings.last5Direction || 'newestLeft';

  return (
    // Eine einzige, undurchsichtige Fläche für den ganzen Editor statt je einer schwebenden Karte
    // pro Modul — die Abschnitte sind nur durch Linien getrennt. Breiter als früher (siehe
    // max-width-Wahl auf Seitenebene) UND eine sticky rechte Spalte: die Vorschau/der Link bleiben
    // beim Scrollen durch die Einstellungen links die ganze Zeit sichtbar — vorher musste man nach
    // jeder Änderung weit unten wieder hoch scrollen, um das Ergebnis zu sehen (Nutzer-Feedback).
    // Bewusst KEIN items-start am Grid: die linke Spalte soll auf volle Zeilenhöhe strecken, damit
    // ihre rechte Trennlinie auch dann durchgehend ist, wenn die (sticky, self-start) Vorschau
    // höher ist als die zugeklappte linke Spalte. Kein overflow-* an diesem Element, sonst
    // funktioniert sticky nicht mehr.
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] bg-[#0f0f13] border border-white/10 rounded-lg">
      {/* Linke Spalte: die eigentlichen Einstellungen (Farben / Getrackter Wert / Anzeige /
          Chat-Befehle) als Abschnitte übereinander, getrennt durch divide-y. */}
      <div className="min-w-0 divide-y divide-white/10 xl:border-r xl:border-white/10">
        <SettingsSection icon={Palette} title={t.sectionColorsTitle} description={t.sectionColorsDesc}>
          {/* Alle drei Farben in einer Reihe statt jede in ihrer eigenen vollbreiten Zeile
              (Nutzer-Feedback: "make the colours go side by side so they dont use that much
              space") — der Verlauf-Knopf sitzt als vierter, gleich großer Swatch mit an, statt
              eine eigene Umschalter-Zeile zu brauchen. */}
          <div className="flex flex-wrap gap-5">
            <ColorSwatch label={t.bgColorLabel} value={settings.bgColor} onChange={toggle('bgColor')} />
            <button type="button" onClick={() => toggle('bgGradient')(!settings.bgGradient)} title={t.bgGradientDesc}
              className="flex flex-col items-center gap-1.5 w-16">
              <span className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                settings.bgGradient ? 'border-violet-400/60 bg-violet-600/20 text-violet-300' : 'border-dashed border-white/25 text-white/30 hover:text-white/50 hover:border-white/40'
              }`}>
                <Plus size={14} className={`transition-transform ${settings.bgGradient ? 'rotate-45' : ''}`} />
              </span>
              <span className="text-white/50 text-[10px] font-semibold text-center leading-tight">{t.bgGradientLabel}</span>
            </button>
            {settings.bgGradient && (
              <ColorSwatch label={t.bgColor2Label} value={settings.bgColor2 || '#1a1a2e'} onChange={toggle('bgColor2')} />
            )}
            <ColorSwatch label={t.borderColorLabel} value={settings.borderColor || '#7c3aed'}
              auto={!settings.borderColor} onChange={toggle('borderColor')}
              onReset={settings.borderColor ? () => toggle('borderColor')('') : undefined}
              resetTitle={t.borderColorAutoTitle} />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>{t.transparency}</span>
              <span className="text-white font-bold tabular-nums">{settings.bgOpacity}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.bgOpacity}
              onChange={e => toggle('bgOpacity')(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
        </SettingsSection>

        {/* Getrackter Wert — eigener Abschnitt, NICHT im Profil-Kopf verschachtelt: wirkt zwar auf
            den aktiven Account, ändert aber nicht nur den Kopf, sondern auch Session/letzte-5/Deck
            (jeder Modus hat seine eigene Statistik und sein eigenes Deck, siehe
            crWinTrackerRoutes.js). Ohne aktiven Account (noch keiner verknüpft) gibt es nichts
            zu zeigen. Rein informativ: track_mode wird IMMER automatisch auf den zuletzt
            gespielten Modus gestellt (siehe autoSwitchTrackMode in crWinTrackerRoutes.js) — daher
            fest disabled statt einer echten Auswahl, es gibt nichts mehr manuell umzustellen; der
            Hinweistext darüber sagt das dem Nutzer. Standardmäßig zugeklappt, weil dort nichts
            mehr eingestellt wird (bis auf den Session-Reset). */}
        {activeAccount && (
          <SettingsSection icon={Trophy} title={t.trackedValue} description={t.sectionTrackedDesc} defaultOpen={false}>
            <p className="text-gray-500 text-xs leading-relaxed">{t.trackedAutoHint}</p>
            <VisualPicker
              options={[
                {
                  id: 'medals', label: t.optRanked,
                  title: activeAccount.ladder ? t.titleStepsLeague : t.titleMedalsSeason,
                  preview: <img src={MEDAL_ICON_URL} alt="" className="h-8 w-auto object-contain" />,
                },
                {
                  id: 'trophies', label: t.optTrophies, title: t.titleTrophiesLifetime,
                  preview: <img src={trophyIcon} alt="" className="h-8 w-auto object-contain" />,
                },
                {
                  id: '2v2', label: t.opt2v2, title: t.titleLeague2v2Season,
                  preview: <img src={trophy2v2Icon} alt="" className="h-8 w-auto object-contain" />,
                },
              // Beendete saisonale Ranked-Modi (z.B. 2v2 nach Season-Ende) liefert der Server
              // nicht mehr in availableModes — siehe availableTrackModes in crWinTrackerRoutes.js.
              ].filter(o => !activeAccount.availableModes || activeAccount.availableModes.includes(o.id))}
              columns={activeAccount.availableModes?.length || 3}
              value={activeAccount.trackMode}
              disabled
            />

            {/* Wirkt auf die Session DIESES Modus (Ranked1v1 deckt medals+trophies ab, 2v2 hat
                seine eigene) — für wer vor Stream-Start schon ein paar Spiele gespielt hat und
                die nicht in Profit/Win-Loss/letzte 5 sehen will, ohne auf die automatische
                4h-Pausen-Regel zu warten (siehe SESSION_GAP_MS in crWinTrackerRoutes.js). */}
            <button onClick={() => onResetSession(activeAccount)} title={t.resetSessionTitle}
              className="w-full bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
              <RotateCcw size={14} />
              {t.resetSessionBtn}
            </button>
          </SettingsSection>
        )}

        {/* Anzeige: Sichtbarkeit (Schalter) + Feinabstimmung direkt an Ort und Stelle, dauerhaft
            sichtbar statt nur beim Hover auf der Vorschau. Der Profil-Kopf steht separat zuerst:
            aus-/einblendbar wie Session und Deck, bleibt aber immer an erster Stelle. */}
        <SettingsSection icon={LayoutGrid} title={t.sectionVisualsTitle} description={t.sectionVisualsDesc}>
          {/* Kein space-y hier: die Trennlinie + das Padding jeder ModuleControlRow (siehe dort)
              übernehmen den Abstand bereits selbst. */}
          <div>
            <ModuleControlRow t={t}
              label={t.profileHeadLabel} description={t.profileHeadDesc}
              visible={settings.showProfile !== false}
              onToggle={() => toggle('showProfile')(settings.showProfile === false)}>
              <PillGroup label={t.displayGroupLabel}>
                <Pill label={t.showClanPill} title={t.showClanTitle}
                  active={!!settings.showClan} onClick={() => toggle('showClan')(!settings.showClan)} />
              </PillGroup>
            </ModuleControlRow>

            <ModuleControlRow t={t} moduleKey="session" visible={moduleVisibility.session}
              onToggle={() => setModuleVisible('session', !moduleVisibility.session)}>
              <PillGroup label={t.displayGroupLabel}>
                <Pill label={t.dailyProfitPill} title={t.dailyProfitTitle}
                  active={settings.showDailyProfit} onClick={() => toggle('showDailyProfit')(!settings.showDailyProfit)} />
                <Pill label={t.winLossNumbersPill} title={t.winLossNumbersTitle}
                  active={settings.showWinLossNumbers} onClick={() => toggle('showWinLossNumbers')(!settings.showWinLossNumbers)} />
                <Pill label={t.winRatePctPill} title={t.winRatePctTitle}
                  active={settings.showWinLossPercent} onClick={() => toggle('showWinLossPercent')(!settings.showWinLossPercent)} />
                <Pill label={t.last5Pill} title={t.last5Title}
                  active={settings.showLast5} onClick={() => toggle('showLast5')(!settings.showLast5)} />
              </PillGroup>
              {settings.showLast5 && (
                <>
                  <div>
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2.5">{t.last5DisplayGroupLabel}</p>
                    <VisualPicker
                      options={[
                        { id: 'result', label: t.styleResultLabel, title: t.styleResultTitle, preview: <Last5StylePreview kind="result" /> },
                        { id: 'delta', label: t.styleDeltaLabel, title: t.styleDeltaTitle, preview: <Last5StylePreview kind="delta" /> },
                        { id: 'dot', label: t.styleDotLabel, title: t.styleDotTitle, preview: <Last5StylePreview kind="dot" /> },
                      ]}
                      value={last5Style} onChange={(v) => toggle('last5Style')(v)} />
                  </div>
                  <PillGroup label={t.orderGroupLabel}>
                    <SegmentedControl
                      options={[
                        { id: 'newestLeft', label: t.newestLeftLabel, title: t.newestLeftTitle },
                        { id: 'newestRight', label: t.newestRightLabel, title: t.newestRightTitle },
                      ]}
                      value={last5Direction} onChange={(v) => toggle('last5Direction')(v)} />
                    <Pill label={t.markNewestPill} title={t.markNewestTitle}
                      active={settings.last5NewBadge !== false} onClick={() => toggle('last5NewBadge')(settings.last5NewBadge === false)} />
                  </PillGroup>
                </>
              )}
            </ModuleControlRow>

            <ModuleControlRow t={t} moduleKey="deck" visible={moduleVisibility.deck}
              onToggle={() => setModuleVisible('deck', !moduleVisibility.deck)}>
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2.5">{t.deckPlacementGroupLabel}</p>
                <VisualPicker
                  options={[
                    { id: 'top', label: t.placementTop, title: t.placementTopTitle, preview: <PlacementPreview side="top" /> },
                    { id: 'bottom', label: t.placementBottom, title: t.placementBottomTitle, preview: <PlacementPreview side="bottom" /> },
                    { id: 'left', label: t.placementLeft, title: t.placementLeftTitle, preview: <PlacementPreview side="left" /> },
                    { id: 'right', label: t.placementRight, title: t.placementRightTitle, preview: <PlacementPreview side="right" /> },
                  ]}
                  columns={4}
                  value={deckPlacement} onChange={(v) => toggle('deckPlacement')(v)} />
              </div>
            </ModuleControlRow>

            {/* Paginierung: statt Profilkopf/Deck/Session dauerhaft übereinander zu stapeln,
                zeigt das Overlay nur EINEN Teil zur Zeit und wechselt automatisch durch — macht
                die Karte kompakter (siehe WinTrackerOverlayPage.jsx). Eigene Zeile statt Teil
                eines ModuleControlRow, weil sie sich auf ALLE Teile gemeinsam bezieht, nicht auf
                einen einzelnen. */}
            <div className="pt-5 mt-5 border-t border-white/10">
              <ToggleButton label={t.paginateLabel} title={t.paginateDesc} className="w-full"
                checked={!!settings.paginateOverlay} onLabel={t.onLabel} offLabel={t.offLabel}
                onChange={(v) => toggle('paginateOverlay')(v)} />
              {settings.paginateOverlay && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>{t.paginateIntervalLabel}</span>
                    <span className="text-white font-bold tabular-nums">{settings.paginateIntervalS}s</span>
                  </div>
                  <input type="range" min="2" max="30" value={settings.paginateIntervalS}
                    onChange={e => toggle('paginateIntervalS')(Number(e.target.value))}
                    className="w-full accent-violet-500" />
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        {/* Ganz unten, im linken Hauptfluss statt in der (sonst zu vollen) rechten Seitenleiste
            — Nutzer-Feedback: "you have to scroll super far down to see the button for on".
            Standardmäßig zugeklappt: die Befehlsliste braucht man nur einmal, danach nimmt sie
            nur Platz weg. */}
        <SettingsSection icon={MessageSquare} title={t.chatCmdTitle} defaultOpen={false}
          description={`${t.chatCmdDescPre}${t.chatCmdDescMod}${t.chatCmdDescMid}`}>
          {/* Jeder Befehl als eigene Zeile mit Code-Badge statt einer reinen Aufzählung mit
              Gedankenstrich — auf einen Blick als "das ist tippbar" erkennbar (Nutzer-Feedback:
              "make the overview more appealing for the commands"). */}
          <div className="space-y-1.5">
            {t.chatCmdList.map((cmd) => (
              <div key={cmd.code} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 bg-black/20 rounded-lg px-3 py-2">
                <code className="text-violet-300 font-mono text-xs font-bold shrink-0">{cmd.code}</code>
                <span className="text-gray-500 text-xs leading-snug">{cmd.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-gray-600 text-[11px] leading-relaxed">{t.chatCmdDescPost}</p>
          {/* Kanal ist immer der eigene Twitch-Login — kein Freitextfeld mehr, das vom Server-
              Wert abweichen kann (siehe Kommentar an chatChannel in crWinTrackerRoutes.js). Nur
              noch EIN Wert zum Umschalten statt zwei, die getrennt gespeichert werden mussten. */}
          <ToggleButton label={t.chatActiveLabel} className="w-full"
            title={user?.login ? wt(t, 'chatActiveDesc', { channel: user.login }) : t.chatActiveDescEmpty}
            checked={settings.chatEnabled} onLabel={t.onLabel} offLabel={t.offLabel}
            onChange={(v) => toggle('chatEnabled')(v)} />
        </SettingsSection>
      </div>

      {/* Rechte Spalte: sticky, bleibt beim Scrollen durch die Abschnitte links stehen. Unter xl
          (einspaltig) rutscht sie unter die linke Spalte und bekommt dafür eine Linie darüber. */}
      <div className="xl:sticky xl:top-6 xl:self-start min-w-0 divide-y divide-white/10 border-t border-white/10 xl:border-t-0">
        <SettingsSection title={t.livePreviewTitle}>
          <OverlayPreview
            settings={settings}
            overlayKey={overlayKey}
            moduleVisibility={moduleVisibility}
            onToggleModule={(key) => setModuleVisible(key, !moduleVisibility[key])}
            onToggleProfile={() => toggle('showProfile')(settings.showProfile === false)}
            refreshSignal={activeAccount ? `${activeAccount.accountId}:${activeAccount.trackMode}:${activeAccount.ladder?.step ?? ''}` : ''}
          />
        </SettingsSection>

        <SettingsSection icon={Link2} title={t.obsOverlayTitle} description={t.obsOverlayHint}>
          <div className={`bg-black/30 border border-white/10 rounded-lg px-3.5 py-3 text-gray-300 text-xs font-mono break-all transition-all ${hidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {link || t.linkLoading}
          </div>
          <div className="flex items-center gap-2">
            {/* Volltext-Knopf statt nur des Kopier-Symbols — der Link ist die wichtigste
                Einzelaktion auf dieser Seite (geht in OBS), soll also nicht als kleines Icon
                neben zwei anderen untergehen. */}
            <button onClick={copy} disabled={!link}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white font-bold text-sm py-2.5 rounded-lg transition-colors">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t.copiedLabel : t.copyTitle}
            </button>
            <button onClick={() => setHidden(v => !v)} title={hidden ? t.showTitle : t.hideTitle}
              className="p-2.5 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
              {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
          <button onClick={regenerate} disabled={!overlayKey}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-400 transition-colors">
            <RefreshCw size={12} />
            {t.regenLink}
          </button>
        </SettingsSection>

        {/* Kleiner Statuschip statt einer großen, farbig hinterlegten Box — die Information ist
            wichtig, aber selten die aktive Aufgabe auf dieser Seite; der volle Text steht noch
            als Tooltip bereit. Als letzte Zeile der rechten Spalte, mit demselben Innenabstand wie
            die Abschnitte darüber. */}
        <div className="px-5 py-4">
          <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border ${
            apiConfigured ? 'text-green-400 border-green-500/20 bg-green-500/5' : 'text-amber-400 border-amber-500/20 bg-amber-500/5'
          }`} title={apiConfigured ? t.apiConnectedDesc : t.apiNotConfiguredDesc}>
            <span className={`w-1.5 h-1.5 rounded-full ${apiConfigured ? 'bg-green-400' : 'bg-amber-400'}`} />
            {apiConfigured ? t.apiConnectedShort : t.apiNotConfiguredShort}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hauptseite ───────────────────────────────────────────────────────────────
export default function WinTrackerPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState(null);
  const [overlayKey, setOverlayKey] = useState(null);
  const [settings, setSettings] = useState({
    showDailyProfit: true, showWinLossNumbers: true, showWinLossPercent: true, showLast5: true,
    bgColor: '#0c0c12', bgOpacity: 88, bgGradient: false, bgColor2: '#1a1a2e', borderColor: '',
    last5Style: 'result', last5Direction: 'newestLeft', last5NewBadge: true,
    showDeck: true, showProfile: true, deckPlacement: 'top', language: 'de', chatChannel: '', chatEnabled: false,
    paginateOverlay: false, paginateIntervalS: 6, showClan: false,
  });
  const [apiConfigured, setApiConfigured] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [error, setError] = useState('');
  // Eine einzige Einstellung steuert Editor-UI-Text UND Overlay-Inhalt zugleich (siehe
  // Kommentar an der language-Spalte in winTrackerStore.js).
  const lang = settings.language === 'en' ? 'en' : 'de';
  const t = dictForWt(lang);

  const flashError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const changeLanguage = async (language) => {
    const next = { ...settings, language };
    setSettings(next);
    try { await api.saveSettings(next); } catch { /* Sync korrigiert es beim nächsten Laden */ }
  };

  const load = useCallback(() => {
    if (!user) return;
    api.getMyWinTracker()
      .then(d => {
        setAccounts(d.accounts);
        setOverlayKey(d.overlayKey);
        setSettings(d.settings);
        setApiConfigured(d.apiConfigured);
      })
      .catch(() => setAccounts([]));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async (acc) => {
    try {
      await api.activateAccount(acc.accountId);
      setAccounts(prev => prev.map(a => ({ ...a, isActive: a.accountId === acc.accountId })));
    } catch (e) { flashError(e.message); }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(wt(t, 'confirmRemove', { name: acc.playerName }))) return;
    try {
      await api.deleteAccount(acc.accountId);
      load();
    } catch (e) { flashError(e.message); }
  };

  const handleLadderStepChange = async (acc, step) => {
    const max = acc.ladder?.maxSteps || 0;
    if (!max || step === acc.ladder.step) return;
    // Bleibt die Stufe innerhalb der aktuellen Liga, sofort optimistisch zeigen. Ein Sprung über
    // die Ligagrenze (Stufe > maxSteps bzw. < 1) wechselt serverseitig auch die Liga selbst —
    // das kommt erst mit der Antwort, damit Badge/Liga-Name nicht kurz falsch aufblitzen.
    const staysInLeague = step >= 1 && step <= max;
    if (staysInLeague) {
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? { ...a, ladder: { ...a.ladder, step } } : a));
    }
    try {
      const res = await api.setAccountLadderStep(acc.accountId, step);
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? res.account : a));
    } catch (e) {
      if (staysInLeague) setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? { ...a, ladder: acc.ladder } : a));
      flashError(e.message);
    }
  };

  const handleResetSession = async (acc) => {
    if (!window.confirm(wt(t, 'confirmResetSession'))) return;
    // medals/trophies/2v2 haben je eine eigene Session — siehe SESSION_GAP_MS/
    // computeSessionStartMs/computeTrophySessionStartMs/compute2v2SessionStartMs in
    // crWinTrackerRoutes.js.
    const scope = acc.trackMode === '2v2' ? '2v2' : acc.trackMode === 'trophies' ? 'trophies' : 'ranked';
    try {
      const res = await api.resetAccountSession(acc.accountId, scope);
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? res.account : a));
    } catch (e) { flashError(e.message); }
  };

  const handleRefresh = async (acc) => {
    setRefreshingId(acc.accountId);
    try {
      const res = await api.refreshAccount(acc.accountId);
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? res.account : a));
    } catch (e) { flashError(e.message); }
    finally { setRefreshingId(null); }
  };

  return (
    // Der Einstellungen-Tab braucht mehr Platz (Vorschau + Einstellungen nebeneinander, siehe
    // SettingsTab) als der Accounts-Tab — deshalb breiter NUR auf diesem Tab, nicht seitenweit.
    // max-w-[1680px] statt einfach 100%: bleibt bei 1920px Breite noch klar als Inhaltsspalte mit
    // Rand erkennbar (kein Kante-an-Kante-Stretchen), nutzt bei größeren Bildschirmen spürbar mehr
    // vom verfügbaren Platz als die alte max-w-6xl (1152px).
    <div className={`page-fade mx-auto ${tab === 'settings' ? 'max-w-[1680px]' : 'max-w-6xl'}`}>
      <SEO
        title="Clash Royale Win Tracker Overlay für OBS"
        description="Kostenloses OBS-Overlay für Clash Royale: zeigt Liga, Medaillen oder Trophäen, Session-Gewinn, Win-Rate und die letzten 5 Spiele — live aus der offiziellen Clash-Royale-API, pro Account einstellbar."
        keywords="Clash Royale Overlay, Clash Royale OBS Overlay, Clash Royale Win Tracker, Trophäen Tracker, Medaillen Tracker, Path of Legend Overlay, Clash Royale Streaming Tool"
        path="/clash-royale/win-tracker"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Clash Royale Win Tracker Overlay',
            url: 'https://vnmvalentin.de/clash-royale/win-tracker',
            description: 'OBS-Overlay für Clash Royale mit Liga, Medaillen/Trophäen, Sessionstatistik und den letzten Matches.',
            applicationCategory: 'UtilitiesApplication',
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
              { '@type': 'ListItem', position: 3, name: 'Win Tracker Overlay', item: 'https://vnmvalentin.de/clash-royale/win-tracker' },
            ],
          },
        ]} />

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">Win Tracker Overlay</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t.pageSubtitle}
          </p>
        </div>
        {/* Eine Einstellung für Editor-Text UND Overlay-Inhalt zugleich (siehe changeLanguage) —
            deshalb hier oben auf Seitenebene statt versteckt im Einstellungen-Tab. */}
        <div className="shrink-0">
          <p className="text-gray-600 text-[10px] font-bold uppercase tracking-wider mb-1.5 text-right">{t.languageLabel}</p>
          <SegmentedControl
            options={[{ id: 'de', label: 'DE' }, { id: 'en', label: 'EN' }]}
            value={lang} onChange={changeLanguage} />
        </div>
      </div>

      {!user ? (
        <div className="panel p-10 text-center max-w-md mx-auto mt-12">
          <p className="text-white font-bold mb-1">{t.loginRequired}</p>
          <p className="text-gray-500 text-sm mb-5">{t.loginHint}</p>
          <button onClick={() => login(false)}
            className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <TwitchGlyph size={15} />
            {t.loginButton}
          </button>
        </div>
      ) : (
        <>
          <div className="flex border-b border-white/5 mb-6 overflow-x-auto">
            <button onClick={() => setTab('accounts')}
              className={`flex items-center justify-center gap-2 py-3 px-5 text-sm font-bold transition-colors border-b-2 ${
                tab === 'accounts' ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <Trophy size={14} />
              {t.tabAccounts}
            </button>
            <button onClick={() => setTab('settings')}
              className={`flex items-center justify-center gap-2 py-3 px-5 text-sm font-bold transition-colors border-b-2 ${
                tab === 'settings' ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <TrendingUp size={14} />
              {t.tabSettings}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          {tab === 'accounts' && (
            accounts === null ? (
              <p className="text-gray-500 text-sm py-8 text-center">{t.loadingAccounts}</p>
            ) : (
              <AccountsTab
                t={t} lang={lang}
                accounts={accounts}
                onActivate={handleActivate}
                onDelete={handleDelete}
                onAdd={() => setAddOpen(true)}
                onRefresh={handleRefresh}
                onLadderStepChange={handleLadderStepChange}
                refreshingId={refreshingId}
              />
            )
          )}

          {tab === 'settings' && (
            <SettingsTab t={t} overlayKey={overlayKey} settings={settings} onSettingsChange={setSettings} apiConfigured={apiConfigured}
              activeAccount={accounts?.find(a => a.isActive) || null}
              onResetSession={handleResetSession}
              flashError={flashError} />
          )}

          {addOpen && (
            <AddAccountModal
              t={t}
              onClose={() => setAddOpen(false)}
              onAdded={() => { setAddOpen(false); load(); }}
            />
          )}
        </>
      )}
    </div>
  );
}
