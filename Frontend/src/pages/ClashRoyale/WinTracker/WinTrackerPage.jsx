// WinTrackerPage.jsx — Editor des Clash-Royale-Win-Trackers (/clash-royale/win-tracker).
//
// Seit Oktober 2026 im selben Arcade-Look wie die Minigames: läuft in der CrShell (ohne
// Website-Kopfzeile), oben die Chip-Leiste wie im Hub, darunter EINE Fläche (.cr-arcade-panel)
// pro Reiter, deren Abschnitte durch die eingeprägte Fuge (.cr-section) getrennt sind — keine
// schwebenden Einzelkarten. Das OBS-Overlay selbst (WinTrackerOverlayPage.jsx) behält sein vom
// Streamer einstellbares Aussehen; nur die Bedienseite hier ist umgezogen.
import React, { useContext, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Plus, X, RefreshCw, Trash2, Copy, Check, Eye, EyeOff, ChevronsUp, Minus,
  RotateCcw, ChevronDown, ArrowLeftToLine,
} from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { leagueIconUrl, leagueName, MEDAL_ICON_URL, LEAGUE_MEDAL_ICON_URL, seasonalBadgeUrl, challengeBadgeUrl } from '../data/leagueIcons';
import { trophyArenaIcon, trophyArenaName } from '../data/trophyArenas';
import trophyIcon from '../../../assets/clashRoyale/ui/trophy.png';
import trophy2v2Icon from '../../../assets/clashRoyale/ui/trophy2v2.webp';
import OverlayPreview from './OverlayPreview';
import Toggle from '../ui/Toggle';
import Slider from '../ui/Slider';
import Modal from '../ui/Modal';
import ChunkyButton from '../ui/ChunkyButton';
import ArcadeTitle from '../ui/ArcadeTitle';
import { SegmentedControl } from '../ui/SettingRow';
import {
  CrFriends, CrTv, CrSettings, CrUserAdd, CrTrophy, CrChat, CrCheck, CrCards, CrEye, CrElixir, CrScroll,
} from '../ui/CrIcons';
import { useCrPrefs } from '../ui/crPrefs';
import LanguageSelect from '../components/LanguageSelect';
import * as api from './winTrackerApi';
import { dictForWt, wt, challengeLabel } from './wtI18n';
import checkIcon from '../../../assets/clashRoyale/ui/check.webp';
import { ROYALE_PANELS, OVERLAY_TEMPLATES } from './overlayTheme';

const fmt = (n, lang) => (n || 0).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');
const isSeasonalMode = (mode) => typeof mode === 'string' && mode.startsWith('s:');
// Challenges (Classic/Grand/20 Win): trackMode "c:<key>"
const challengeKeyOf = (mode) => (typeof mode === 'string' && mode.startsWith('c:') ? mode.slice(2) : null);
const CHALLENGE_MODES = ['c:classic', 'c:grand', 'c:20win'];

// Gemeinsamer Stil der Leisten-Chips oben — derselbe wie im Hub und auf den Turnierseiten.
const chipClass = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

// ── Account hinzufügen (Dialog) ─────────────────────────────────────────────
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
    <Modal icon={<CrUserAdd size={26} />} title={t.addAccountTitle} onClose={onClose} size="sm">
      <div className="cr-section space-y-4">
        <p className="text-white/60 text-sm leading-relaxed">{t.addAccountHint}</p>
        <label className="block">
          <span className="cr-eyebrow block mb-1.5">{t.tagLabel}</span>
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
          {busy ? t.addAccountBusy : t.addAccountSubmit}
        </ChunkyButton>
      </div>
    </Modal>
  );
}

// trackMode 'trophies' zeigt die Lifetime-Trophäen (siehe "Seasonal Trophy Road"-Kommentar in
// crWinTrackerRoutes.js) — die haben KEINE Liga, der Ranked1v1-Orden wäre hier irreführend.
// Zeigt stattdessen die klassische Trophäenstraßen-Arena (derselbe Fix wie am Overlay-Kopf in
// WinTrackerOverlayPage.jsx/OverlayPreview.jsx) — trophyArenaIcon() liefert null oberhalb von
// 14.000 Trophäen (kein Icon bekannt, siehe trophyArenas.js), dann der Platzhalter. Generische
// Saison-Modi (Spooky Chess League …) haben kein eigenes Liga-Bild: dort die Trophäe.
function LeagueBadge({ leagueNumber, polRank, size = 52, lang, trackMode, trophies }) {
  const isTrophyMode = trackMode === 'trophies';
  const isSeasonal = isSeasonalMode(trackMode) || !!challengeKeyOf(trackMode);
  const url = challengeKeyOf(trackMode) ? challengeBadgeUrl(challengeKeyOf(trackMode)) : isSeasonal ? (seasonalBadgeUrl(trackMode) || trophyIcon) : isTrophyMode ? trophyArenaIcon(trophies) : leagueIconUrl(leagueNumber);
  const label = isTrophyMode ? trophyArenaName(trophies) : leagueName(leagueNumber, lang);
  if (!url) {
    return (
      <div className="cr-tile-icon shrink-0" style={{ width: size, height: size }}>
        <Trophy size={size * 0.45} className="text-amber-300" />
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={label}>
      <img src={url} alt={label} className="w-full h-full object-contain drop-shadow-[0_3px_0_rgba(2,8,20,0.5)]" />
      {/* polRank ist 1v1-spezifisch (Path of Legend) — bei Trophäen- und Saison-Modi wäre er ein
          fälschlich angehängter 1v1-Rang. */}
      {polRank && !isTrophyMode && !isSeasonal ? (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 font-cr text-[11px] leading-none px-1.5 py-0.5 rounded-md whitespace-nowrap text-[#4a2e00] bg-[var(--cr-arcade-gold)] border-2 border-[#071225]">
          #{polRank}
        </span>
      ) : null}
    </div>
  );
}

// ── Stufenleiste (Ligen 1-6) ─────────────────────────────────────────────────
function StepBar({ step, maxSteps }) {
  return (
    <div className="flex gap-[3px] p-[3px] rounded-md bg-[#081426] border border-[#020814]/80 shadow-[inset_0_2px_3px_rgba(0,0,0,0.45)]">
      {Array.from({ length: maxSteps }, (_, i) => (
        <span key={i} className={`flex-1 h-2 rounded-sm ${i < step ? 'bg-[var(--cr-arcade-gold)]' : 'bg-white/[0.07]'}`} />
      ))}
    </div>
  );
}

// Aktuelle Stufe: die API liefert sie nicht mit, deshalb zählt der Tracker sie aus den
// Ranked-Matches — der Startwert muss einmal von Hand stimmen.
function LadderValue({ ladder, onStepChange, t }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ChevronsUp size={18} className="text-[var(--cr-arcade-gold)]" />
        <span className="font-cr text-2xl leading-none tabular-nums text-white">{ladder.step}</span>
        <span className="font-cr text-base text-white/40 tabular-nums -ml-1">/{ladder.maxSteps}</span>
        <span className="text-white/45 text-xs">{t.stepsUnit}</span>
        {ladder.bonusRemaining > 0 && (
          <span className="font-cr text-xs text-[#4a2e00] bg-[var(--cr-arcade-gold)] border-2 border-[#071225] px-1.5 py-0.5 rounded-md"
            title={t.bonusTitle}>
            {wt(t, 'bonusLabel', { n: ladder.bonusRemaining })}
          </span>
        )}
        {/* Kleiner −/+-Stepper auf eingelassener Spur wie im Turnierformular */}
        <span className="cr-seg !flex-nowrap ml-auto" title={t.stepCorrectTitle}>
          <button type="button" className="!flex-none !min-h-0 w-8 h-8 !p-0" onClick={() => onStepChange(ladder.step - 1)}
            disabled={ladder.step <= 1 && ladder.league <= 1} aria-label="−">
            <Minus size={14} />
          </button>
          <button type="button" className="!flex-none !min-h-0 w-8 h-8 !p-0" onClick={() => onStepChange(ladder.step + 1)} aria-label="+">
            <Plus size={14} />
          </button>
        </span>
      </div>
      <StepBar step={ladder.step} maxSteps={ladder.maxSteps} />
    </div>
  );
}

// Name des gerade getrackten Modus — als Etikett über dem Wert jeder Account-Zeile.
function modeLabel(acc, t) {
  if (acc.seasonal) return acc.seasonal.label;
  if (acc.challenge) return challengeLabel(acc.challenge.key, t);
  if (acc.trackMode === '2v2') return t.opt2v2;
  if (acc.trackMode === 'trophies') return t.optTrophies;
  return t.optRanked;
}

// Hauptwert einer Account-Zeile, passend zum getrackten Modus.
function TrackedValue({ acc, t, lang, onLadderStepChange }) {
  if (acc.trackMode === 'medals' && acc.ladder) {
    return <LadderValue ladder={acc.ladder} onStepChange={(step) => onLadderStepChange(acc, step)} t={t} />;
  }
  let icon = MEDAL_ICON_URL, value = acc.seasonMedals, note = t.medalsSeasonLabel, goal = null;
  if (acc.challenge) {
    const c = acc.challenge;
    icon = checkIcon; value = c.wins; goal = c.maxWins;
    note = wt(t, 'challengeNote', { attempt: c.attempt, losses: c.losses, maxLosses: c.maxLosses, best: c.bestWins });
  } else if (acc.seasonal) {
    icon = LEAGUE_MEDAL_ICON_URL; value = acc.seasonal.trophies; goal = acc.seasonal.qualifyWins || null;
    // Qualifikationsphase: Wert = Siege, Ziel daneben, darunter wie viele noch fehlen
    note = goal
      ? wt(t, 'qualifyLabel', { tier: acc.seasonal.arenaName, left: Math.max(0, goal - value) })
      : wt(t, 'seasonalBestLabel', { tier: acc.seasonal.arenaName, n: fmt(acc.seasonal.bestTrophies, lang) });
  } else if (acc.trackMode === '2v2') {
    icon = trophy2v2Icon; value = acc.league2v2Trophies;
    note = wt(t, 'league2v2Label', { n: fmt(acc.league2v2BestTrophies, lang) });
  } else if (acc.trackMode === 'trophies') {
    icon = trophyIcon; value = acc.trophies;
    note = wt(t, 'bestTrophiesLabel', { n: fmt(acc.bestTrophies, lang) });
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <img src={icon} alt="" className="h-6 w-auto object-contain" />
      <span className="font-cr text-2xl leading-none tabular-nums text-white">{fmt(value, lang)}</span>
      {goal && <span className="font-cr text-base text-white/40 tabular-nums -ml-1">/{goal}</span>}
      <span className="text-white/45 text-xs">{note}</span>
    </div>
  );
}

// ── Eine Account-Zeile ──────────────────────────────────────────────────────
// Zeilen in der gemeinsamen Fläche (.cr-row, wie die Spielerliste der Lobby) statt einzelner
// Karten — der aktive Account trägt die Goldkante (.cr-row--me).
function AccountRow({ acc, t, lang, onActivate, onDelete, onRefresh, onLadderStepChange, refreshing }) {
  // Weitere laufende Saison-Modi (außer dem gerade getrackten) — nur als Info darunter.
  const otherSeasonal = (acc.seasonalModes || []).filter(m => m.mode !== acc.trackMode);
  return (
    <div className={`cr-row ${acc.isActive ? 'cr-row--me' : ''} p-3.5 sm:p-4`}>
      <div className="flex items-start gap-3.5">
        <LeagueBadge leagueNumber={acc.leagueNumber} polRank={acc.polRank} lang={lang} trackMode={acc.trackMode} trophies={acc.trophies} />
        <div className="min-w-0 flex-1">
          {/* flex-wrap + Mindestbreite: auf dem Handy rutschen die Knöpfe unter den Namen,
              statt ihn auf drei Buchstaben zusammenzudrücken. */}
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-cr text-lg leading-tight text-white truncate">{acc.playerName}</p>
              <p className="text-white/40 text-xs tabular-nums">#{acc.playerTag} · {leagueName(acc.leagueNumber, lang)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {acc.isActive ? (
                <span className="flex items-center gap-1 font-cr text-sm text-[var(--cr-arcade-gold)] px-1"
                  style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
                  <CrCheck size={18} />
                  {t.active}
                </span>
              ) : (
                <ChunkyButton size="sm" onClick={() => onActivate(acc)}>{t.activate}</ChunkyButton>
              )}
              <button onClick={() => onRefresh(acc)} title={t.refreshNow} aria-label={t.refreshNow}
                className="cr-arcade-icon-btn w-9 h-9">
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => onDelete(acc)} title={t.removeAccount} aria-label={t.removeAccount}
                className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 h-9">
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <p className="cr-eyebrow mb-1.5">{modeLabel(acc, t)}</p>
            <TrackedValue acc={acc} t={t} lang={lang} onLadderStepChange={onLadderStepChange} />
          </div>

          {otherSeasonal.length > 0 && (
            <p className="text-white/45 text-xs mt-2.5">
              {t.alsoRunning}:{' '}
              {otherSeasonal.map((m, i) => (
                <span key={m.mode}>
                  {i > 0 && ', '}
                  <span className="text-white/75">{m.label}</span> {fmt(m.trophies, lang)}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Accounts-Reiter ─────────────────────────────────────────────────────────
function AccountsTab({ t, lang, accounts, onActivate, onDelete, onAdd, onRefresh, onLadderStepChange, refreshingId }) {
  return (
    <div className="cr-arcade-panel cr-anim-rise">
      <section className="cr-section">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="cr-section-title text-xl">
            <CrFriends size={28} />
            {t.yourAccounts}
          </h2>
          <ChunkyButton variant="green" size="sm" icon={Plus} onClick={onAdd}>{t.addAccountBtn}</ChunkyButton>
        </div>
        <p className="text-white/50 text-sm leading-relaxed">{t.yourAccountsHint}</p>
      </section>

      <section className="cr-section">
        {accounts.length === 0 ? (
          <div className="py-8 text-center">
            <CrUserAdd size={56} className="mx-auto mb-3" />
            <p className="font-cr text-xl text-white mb-1">{t.emptyTitle}</p>
            <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">{t.emptyHint}</p>
            <ChunkyButton variant="green" icon={Plus} onClick={onAdd}>{t.addAccountBtn}</ChunkyButton>
          </div>
        ) : (
          <div className="space-y-2.5">
            {accounts.map(acc => (
              <AccountRow key={acc.accountId} acc={acc} t={t} lang={lang}
                onActivate={onActivate} onDelete={onDelete} onRefresh={onRefresh}
                onLadderStepChange={onLadderStepChange} refreshing={refreshingId === acc.accountId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Platzhalter {name} in Texten füllen (Rückblick-Hinweis)
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ''));

// ── Einstellungs-Abschnitt, aufklappbar ──────────────────────────────────────
// Ein Abschnitt der gemeinsamen Fläche (.cr-section, getrennt durch die eingeprägte Fuge) —
// kein eigener Kasten. Klick auf die ganze Kopfzeile klappt auf/zu.
function SettingsSection({ icon: Icon, title, description, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cr-section">
      <button type="button" onClick={() => setOpen(o => !o)} title={description} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left">
        <h3 className="cr-section-title">
          {Icon && <Icon size={24} />}
          {title}
        </h3>
        <ChevronDown size={18} className={`text-white/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-5 mt-4">{children}</div>}
    </section>
  );
}

// Kleines Etikett über einer Gruppe von Optionen.
function GroupLabel({ children }) {
  return <p className="cr-eyebrow mb-2">{children}</p>;
}

// ── Ja/Nein-Option: Text links, Arcade-Schalter rechts ──────────────────────
// Ersetzt die früheren Pillen/AN-AUS-Knöpfe — derselbe Schalter wie in der Lobby.
function OptionRow({ label, note, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold leading-tight">{label}</p>
        {note && <p className="text-white/45 text-xs mt-0.5 leading-snug">{note}</p>}
      </div>
      <Toggle checked={!!checked} onChange={onChange} disabled={disabled} accent="bg-[#34c759]" aria-label={label} />
    </div>
  );
}

// ── Farbfeld: Farbkreis mit Tinten-Rand, darüber unsichtbar der native Farbwähler ──────────
function ColorSwatch({ label, value, onChange, auto, onReset, resetTitle }) {
  return (
    <div className="flex flex-col items-center gap-1.5 w-[4.5rem]">
      {auto ? (
        <button type="button" onClick={() => onChange(value)} title={resetTitle}
          className="w-11 h-11 rounded-full border-2 border-dashed border-white/25 flex items-center justify-center text-white/35 hover:text-white/70 hover:border-white/50 transition-colors">
          <Plus size={16} />
        </button>
      ) : (
        <label className="relative w-11 h-11 cursor-pointer">
          <span className="block w-full h-full rounded-full border-[3px] border-[#071225] shadow-[inset_0_2px_0_rgba(255,255,255,0.25),0_3px_0_rgba(2,8,20,0.55)]"
            style={{ background: value }} />
          <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
      )}
      <span className="flex items-center gap-1">
        <span className="text-white/60 text-[11px] font-semibold text-center leading-tight">{label}</span>
        {onReset && (
          <button type="button" onClick={onReset} title={resetTitle} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

// ── Kachel-Auswahl mit Mini-Vorschau ────────────────────────────────────────
// .cr-tile-btn wie der Modus-Wähler der Lobby: gewählt = Goldkante, der Rest tritt zurück.
// readOnly: reine Anzeige (getrackter Wert folgt automatisch dem letzten Match).
function VisualPicker({ options, value, onChange, readOnly, columns = 3 }) {
  const colClass = columns >= 4 ? 'grid-cols-2 sm:grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`grid ${colClass} gap-2.5`} role="group">
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button key={opt.id} type="button" title={opt.title}
            onClick={() => !readOnly && onChange(opt.id)}
            aria-pressed={active}
            className={`cr-tile-btn !flex-col !gap-2 justify-center p-3 ${readOnly ? 'cr-tile-btn--static cursor-default' : ''}`}>
            <div className="h-9 flex items-center justify-center">{opt.preview}</div>
            <span className="font-cr text-sm text-center leading-tight text-white">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Mini-Diagramm für die Deck-Platzierung: Streifen an der Seite, an der das Deck andockt.
function PlacementPreview({ side }) {
  const isRow = side === 'left' || side === 'right';
  const deckFirst = side === 'top' || side === 'left';
  const deck = <span key="deck" className="bg-[var(--cr-arcade-gold)] rounded-[2px]" style={isRow ? { width: 6 } : { height: 6 }} />;
  const main = <span key="main" className="bg-white/25 rounded-[2px] flex-1" />;
  return (
    <div className={`w-10 h-8 rounded-[5px] border-2 border-[#071225] bg-[#081426] p-[3px] flex gap-[3px] ${isRow ? 'flex-row' : 'flex-col'}`}>
      {deckFirst ? [deck, main] : [main, deck]}
    </div>
  );
}

// Mini-Vorschau für den Grundstil: schlichte dunkle Karte vs. Spieltafel mit Kontur-Zahl.
function LookPreview({ kind, panel = 'blue' }) {
  if (kind === 'classic') {
    return (
      <span className="w-14 h-9 rounded-md bg-[#0c0c12] border border-white/15 flex items-center justify-center text-white font-black text-sm tabular-nums">
        1180
      </span>
    );
  }
  const c = ROYALE_PANELS[panel] || ROYALE_PANELS.blue;
  return (
    <span className="w-14 h-9 rounded-md border-[2px] flex items-center justify-center font-cr text-[15px] text-white"
      style={{ background: `linear-gradient(to bottom, ${c.light}, ${c.base})`, borderColor: c.edge, textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 rgba(0,0,0,0.45)' }}>
      1180
    </span>
  );
}

// Mini-Vorschau für die Darstellung der letzten 5 Spiele — exakt die Form aus dem Overlay.
function Last5StylePreview({ kind }) {
  if (kind === 'dot') return <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />;
  return (
    <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 rounded-lg px-2 py-1 tabular-nums">
      {kind === 'result' ? 'Win' : '+28'}
    </span>
  );
}

const moduleDefs = (t) => ({
  deck: { label: t.moduleDeckLabel, description: t.moduleDeckDesc },
  session: { label: t.moduleSessionLabel, description: t.moduleSessionDesc },
});

// ── Modul-Zeile: Name + Sichtbarkeit, Feinabstimmung aufklappbar ─────────────
// Trennung zur vorigen Zeile nur durch eine Linie; aufgeklappter Inhalt mit Führungslinie links.
function ModuleControlRow({ t, moduleKey, label, description, visible, onToggle, children }) {
  const def = moduleDefs(t)[moduleKey] || { label, description };
  const hasChildren = !!children;
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[#020814]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] pt-4 mt-4 first:border-t-0 first:shadow-none first:pt-0 first:mt-0">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => hasChildren && setOpen(o => !o)} disabled={!hasChildren}
          title={description} aria-expanded={hasChildren ? open : undefined}
          className="min-w-0 flex-1 flex items-center gap-2 text-left disabled:cursor-default">
          {hasChildren && (
            <ChevronDown size={15} className={`text-white/45 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
          )}
          <span className={`font-cr text-base ${visible ? 'text-white' : 'text-white/40'}`}>{def.label}</span>
        </button>
        <span className={`text-xs font-semibold ${visible ? 'text-white/50' : 'text-white/35'}`}>
          {visible ? t.visible : t.hidden}
        </span>
        <Toggle checked={visible} onChange={onToggle} accent="bg-[#34c759]"
          aria-label={visible ? t.ariaHideModule : t.ariaShowModule} />
      </div>
      {open && children && (
        <div className="mt-4 ml-2 pl-5 border-l-2 border-white/10 space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Einstellungs-Reiter (Overlay) ───────────────────────────────────────────
function SettingsTab({ t, overlayKey, settings, onSettingsChange, apiConfigured, activeAccount, onResetSession, flashError }) {
  const { user } = useContext(TwitchAuthContext);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);

  const link = overlayKey ? `${window.location.origin}/clash-royale/win-tracker/overlay/${overlayKey}` : '';

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => flashError?.(t.copyTitle));
  };

  const regenerate = async () => {
    if (!window.confirm(t.regenerateConfirm)) return;
    try {
      await api.regenerateOverlayKey();
      window.location.reload();
    } catch (e) { flashError?.(e.message); }
  };

  // Schlug der Server-Save fehl, MUSS die UI das zeigen und den alten Stand wiederherstellen —
  // sonst sieht z.B. der Chat-Befehl "aktiv" aus, obwohl nie etwas gespeichert wurde.
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

  // "Session" hat keinen eigenen Sichtbarkeits-Schalter in der DB — sie zählt als sichtbar,
  // sobald mindestens eine ihrer Unter-Optionen an ist (genau wie das Overlay es auswertet).
  const sessionVisible = !!(settings.showDailyProfit || settings.showWinLossNumbers || settings.showWinLossPercent || settings.showLast5);
  const moduleVisibility = { deck: settings.showDeck !== false, session: sessionVisible };
  const setModuleVisible = (key, value) => {
    if (key === 'deck') return applyPatch({ showDeck: value });
    if (key === 'session') return applyPatch({ showDailyProfit: value, showWinLossNumbers: value, showWinLossPercent: value, showLast5: value });
  };
  const overlayTheme = settings.overlayTheme === 'royale' ? 'royale' : 'classic';
  const royalePanel = ROYALE_PANELS[settings.royalePanel] ? settings.royalePanel : 'blue';
  const last5Style = settings.last5Style || 'result';
  const deckPlacement = settings.deckPlacement || 'top';
  const last5Direction = settings.last5Direction || 'newestLeft';

  // Getrackter Wert: feste Modi + alle laufenden Saison-Modi des aktiven Accounts. Beendete
  // Modi liefert der Server nicht mehr in availableModes (siehe availableTrackModes).
  const trackedOptions = activeAccount ? [
    {
      id: 'medals', label: t.optRanked,
      title: activeAccount.ladder ? t.titleStepsLeague : t.titleMedalsSeason,
      preview: <img src={MEDAL_ICON_URL} alt="" className="h-9 w-auto object-contain" />,
    },
    {
      id: 'trophies', label: t.optTrophies, title: t.titleTrophiesLifetime,
      preview: <img src={trophyIcon} alt="" className="h-9 w-auto object-contain" />,
    },
    {
      id: '2v2', label: t.opt2v2, title: t.titleLeague2v2Season,
      preview: <img src={trophy2v2Icon} alt="" className="h-9 w-auto object-contain" />,
    },
    ...(activeAccount.seasonalModes || []).map(m => ({
      id: m.mode, label: m.label,
      title: m.qualifyWins
        ? wt(t, 'qualifyLabel', { tier: m.arenaName, left: Math.max(0, m.qualifyWins - m.trophies) })
        : wt(t, 'seasonalBestLabel', { tier: m.arenaName, n: m.bestTrophies }),
      preview: <img src={seasonalBadgeUrl(m.mode) || LEAGUE_MEDAL_ICON_URL} alt="" className="h-9 w-auto object-contain" />,
    })),
    // Challenges immer zeigen (wie Ranked/Trophäen) — aktiv wird eine, sobald man sie spielt
    ...CHALLENGE_MODES.map(id => ({
      id, label: challengeLabel(challengeKeyOf(id), t), title: challengeLabel(challengeKeyOf(id), t),
      preview: <img src={challengeBadgeUrl(challengeKeyOf(id))} alt="" className="h-9 w-auto object-contain" />,
    })),
  ].filter(o => challengeKeyOf(o.id) || !activeAccount.availableModes || activeAccount.availableModes.includes(o.id)) : [];

  return (
    // Eine Fläche, zwei Spalten: links die Einstellungen, rechts (ab xl) mitlaufend Vorschau +
    // OBS-Link. Kein overflow-* hier, sonst funktioniert sticky nicht.
    <div className="cr-arcade-panel cr-anim-rise grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 xl:border-r xl:border-[#020814]/60">
        <SettingsSection icon={CrElixir} title={t.sectionLookTitle} description={t.sectionLookDesc}>
          <VisualPicker columns={2}
            options={[
              { id: 'classic', label: t.lookClassic, title: t.lookClassicTitle, preview: <LookPreview kind="classic" /> },
              { id: 'royale', label: t.lookRoyale, title: t.lookRoyaleTitle, preview: <LookPreview kind="royale" panel={royalePanel} /> },
            ]}
            value={overlayTheme} onChange={(v) => toggle('overlayTheme')(v)} />

          {overlayTheme === 'royale' ? (
            <>
              <div>
                <GroupLabel>{t.royalePanelLabel}</GroupLabel>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(ROYALE_PANELS).map(([id, c]) => (
                    <button key={id} type="button" onClick={() => toggle('royalePanel')(id)} aria-pressed={royalePanel === id}
                      className="flex flex-col items-center gap-1.5 w-[4.5rem]">
                      <span className={`block w-11 h-11 rounded-full border-[3px] ${royalePanel === id ? 'border-[var(--cr-arcade-gold)]' : 'border-[#071225]'}`}
                        style={{ background: `linear-gradient(to bottom, ${c.light}, ${c.base})` }} />
                      <span className={`text-[11px] font-semibold ${royalePanel === id ? 'text-white' : 'text-white/60'}`}>
                        {t[`royalePanel${id[0].toUpperCase()}${id.slice(1)}`]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <OptionRow label={t.royalePatternLabel} note={t.royalePatternNote}
                checked={settings.royalePattern !== false} onChange={toggle('royalePattern')} />
            </>
          ) : (
          <div className="flex flex-wrap gap-4">
            <ColorSwatch label={t.bgColorLabel} value={settings.bgColor} onChange={toggle('bgColor')} />
            <div className="flex flex-col items-center gap-1.5 w-[4.5rem]">
              <button type="button" onClick={() => toggle('bgGradient')(!settings.bgGradient)} title={t.bgGradientDesc}
                aria-pressed={!!settings.bgGradient}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  settings.bgGradient
                    ? 'border-[3px] border-[var(--cr-arcade-gold)] bg-[#1d3d68] text-[var(--cr-arcade-gold)]'
                    : 'border-2 border-dashed border-white/25 text-white/35 hover:text-white/70 hover:border-white/50'
                }`}>
                <Plus size={16} className={`transition-transform ${settings.bgGradient ? 'rotate-45' : ''}`} />
              </button>
              <span className="text-white/60 text-[11px] font-semibold text-center leading-tight">{t.bgGradientLabel}</span>
            </div>
            {settings.bgGradient && (
              <ColorSwatch label={t.bgColor2Label} value={settings.bgColor2 || '#1a1a2e'} onChange={toggle('bgColor2')} />
            )}
            <ColorSwatch label={t.borderColorLabel} value={settings.borderColor || '#7c3aed'}
              auto={!settings.borderColor} onChange={toggle('borderColor')}
              onReset={settings.borderColor ? () => toggle('borderColor')('') : undefined}
              resetTitle={t.borderColorAutoTitle} />
          </div>
          )}

          <div>
            <GroupLabel>{t.transparency}</GroupLabel>
            <Slider value={settings.bgOpacity} min={0} max={100} onChange={toggle('bgOpacity')}
              format={(v) => `${v}%`} accent="var(--cr-arcade-gold)" aria-label={t.transparency} />
          </div>

          <div>
            <GroupLabel>{t.overlayScaleLabel}</GroupLabel>
            <Slider value={settings.overlayScale ?? 100} min={100} max={200} step={5} onChange={toggle('overlayScale')}
              format={(v) => `${v}%`} accent="var(--cr-arcade-gold)" aria-label={t.overlayScaleLabel} />
            <p className="text-white/45 text-xs mt-1.5 leading-relaxed">{t.overlayScaleNote}</p>
          </div>
        </SettingsSection>

        {/* Getrackter Wert — rein informativ: der Modus folgt automatisch dem letzten Match
            (autoSwitchTrackMode im Backend), neue Saison-Modi erscheinen von selbst. */}
        {activeAccount && (
          <SettingsSection icon={CrTrophy} title={t.trackedValue} description={t.sectionTrackedDesc} defaultOpen={false}>
            <p className="text-white/50 text-sm leading-relaxed">
              {t.trackedAutoHint} {t.seasonalModesHint}
            </p>
            <VisualPicker options={trackedOptions} columns={Math.min(4, trackedOptions.length || 3)}
              value={activeAccount.trackMode} readOnly />
            {/* Wirkt nur auf die Session DIESES Modus — jeder Modus hat seine eigene. */}
            <ChunkyButton variant="red" size="sm" icon={RotateCcw} title={t.resetSessionTitle}
              onClick={() => onResetSession(activeAccount)}>
              {t.resetSessionBtn}
            </ChunkyButton>
          </SettingsSection>
        )}

        <SettingsSection icon={CrCards} title={t.sectionVisualsTitle} description={t.sectionVisualsDesc}>
          <div>
            <ModuleControlRow t={t}
              label={t.profileHeadLabel} description={t.profileHeadDesc}
              visible={settings.showProfile !== false}
              onToggle={() => toggle('showProfile')(settings.showProfile === false)}>
              <OptionRow label={t.showClanPill} note={t.showClanTitle}
                checked={!!settings.showClan} onChange={toggle('showClan')} />
            </ModuleControlRow>

            <ModuleControlRow t={t} moduleKey="session" visible={moduleVisibility.session}
              onToggle={() => setModuleVisible('session', !moduleVisibility.session)}>
              <div>
                <GroupLabel>{t.displayGroupLabel}</GroupLabel>
                <OptionRow label={t.dailyProfitPill} note={t.dailyProfitTitle}
                  checked={settings.showDailyProfit} onChange={toggle('showDailyProfit')} />
                <OptionRow label={t.winLossNumbersPill} note={t.winLossNumbersTitle}
                  checked={settings.showWinLossNumbers} onChange={toggle('showWinLossNumbers')} />
                <OptionRow label={t.winRatePctPill} note={t.winRatePctTitle}
                  checked={settings.showWinLossPercent} onChange={toggle('showWinLossPercent')} />
                <OptionRow label={t.last5Pill} note={t.last5Title}
                  checked={settings.showLast5} onChange={toggle('showLast5')} />
              </div>
              {settings.showLast5 && (
                <>
                  <div>
                    <GroupLabel>{t.last5DisplayGroupLabel}</GroupLabel>
                    <VisualPicker
                      options={[
                        { id: 'result', label: t.styleResultLabel, title: t.styleResultTitle, preview: <Last5StylePreview kind="result" /> },
                        { id: 'delta', label: t.styleDeltaLabel, title: t.styleDeltaTitle, preview: <Last5StylePreview kind="delta" /> },
                        { id: 'dot', label: t.styleDotLabel, title: t.styleDotTitle, preview: <Last5StylePreview kind="dot" /> },
                      ]}
                      value={last5Style} onChange={(v) => toggle('last5Style')(v)} />
                  </div>
                  <div>
                    <GroupLabel>{t.orderGroupLabel}</GroupLabel>
                    <SegmentedControl
                      options={[
                        { id: 'newestLeft', label: t.newestLeftLabel, title: t.newestLeftTitle },
                        { id: 'newestRight', label: t.newestRightLabel, title: t.newestRightTitle },
                      ]}
                      value={last5Direction} onChange={(v) => toggle('last5Direction')(v)} />
                    <div className="mt-2">
                      <OptionRow label={t.markNewestPill} note={t.markNewestTitle}
                        checked={settings.last5NewBadge !== false} onChange={toggle('last5NewBadge')} />
                    </div>
                  </div>
                </>
              )}
            </ModuleControlRow>

            <ModuleControlRow t={t} moduleKey="deck" visible={moduleVisibility.deck}
              onToggle={() => setModuleVisible('deck', !moduleVisibility.deck)}>
              <div>
                <GroupLabel>{t.deckPlacementGroupLabel}</GroupLabel>
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

            {/* Paginierung bezieht sich auf ALLE Teile gemeinsam — eigene Zeile. */}
            <div className="border-t border-[#020814]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] pt-4 mt-4 space-y-3">
              <OptionRow label={t.paginateLabel} note={t.paginateDesc}
                checked={!!settings.paginateOverlay} onChange={toggle('paginateOverlay')} />
              {settings.paginateOverlay && (
                <div>
                  <GroupLabel>{t.paginateIntervalLabel}</GroupLabel>
                  <Slider value={settings.paginateIntervalS} min={2} max={30} onChange={toggle('paginateIntervalS')}
                    format={(v) => `${v}s`} accent="var(--cr-arcade-gold)" aria-label={t.paginateIntervalLabel} />
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection icon={CrChat} title={t.chatCmdTitle} defaultOpen={false}
          description={`${t.chatCmdDescPre}${t.chatCmdDescMod}${t.chatCmdDescMid}`}>
          <OptionRow label={t.chatActiveLabel}
            note={user?.login ? wt(t, 'chatActiveDesc', { channel: user.login }) : t.chatActiveDescEmpty}
            checked={settings.chatEnabled} onChange={toggle('chatEnabled')} />
          <div className="space-y-1.5">
            {t.chatCmdList.map((cmd) => (
              <div key={cmd.code} className="cr-row flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2.5">
                <code className="font-cr text-sm text-[var(--cr-arcade-gold)] shrink-0">{cmd.code}</code>
                <span className="text-white/50 text-xs leading-snug">{cmd.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-white/40 text-xs leading-relaxed">{t.chatCmdDescPost}</p>
        </SettingsSection>
      </div>

      {/* Rechte Spalte: läuft beim Scrollen mit. Unter xl rutscht sie unter die linke Spalte. */}
      <div className="xl:sticky xl:top-4 xl:self-start min-w-0 border-t border-[#020814]/60 xl:border-t-0">
        <SettingsSection icon={CrEye} title={t.livePreviewTitle}>
          <div className="rounded-2xl bg-[#081426] border border-[#020814]/80 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] p-3">
            <OverlayPreview
              settings={settings}
              overlayKey={overlayKey}
              moduleVisibility={moduleVisibility}
              onToggleModule={(key) => setModuleVisible(key, !moduleVisibility[key])}
              onToggleProfile={() => toggle('showProfile')(settings.showProfile === false)}
              refreshSignal={activeAccount ? `${activeAccount.accountId}:${activeAccount.trackMode}:${activeAccount.ladder?.step ?? ''}` : ''}
            />
          </div>
        </SettingsSection>

        <SettingsSection icon={CrTv} title={t.obsOverlayTitle} description={t.obsOverlayHint}>
          <p className="text-white/50 text-sm">{t.obsOverlayHint}</p>
          <div className={`cr-input px-3.5 py-3 text-white/80 text-xs break-all transition-all ${hidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {link || t.linkLoading}
          </div>
          <div className="flex items-stretch gap-2">
            <ChunkyButton variant="green" className="flex-1" onClick={copy} disabled={!link} icon={copied ? Check : Copy}>
              {copied ? t.copiedLabel : t.copyTitle}
            </ChunkyButton>
            <button onClick={() => setHidden(v => !v)} title={hidden ? t.showTitle : t.hideTitle}
              aria-label={hidden ? t.showTitle : t.hideTitle}
              className="cr-arcade-icon-btn w-12 shrink-0">
              {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button onClick={regenerate} disabled={!overlayKey}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/45 hover:text-red-300 transition-colors disabled:opacity-40">
              <RefreshCw size={12} />
              {t.regenLink}
            </button>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${apiConfigured ? 'text-emerald-300' : 'text-amber-300'}`}
              title={apiConfigured ? t.apiConnectedDesc : t.apiNotConfiguredDesc}>
              <span className={`w-2 h-2 rounded-full ${apiConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {apiConfigured ? t.apiConnectedShort : t.apiNotConfiguredShort}
            </span>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

// ── Hauptseite ───────────────────────────────────────────────────────────────
export default function WinTrackerPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const { openSettings } = useCrPrefs();
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState(null);
  const [overlayKey, setOverlayKey] = useState(null);
  const [settings, setSettings] = useState({
    showDailyProfit: true, showWinLossNumbers: true, showWinLossPercent: true, showLast5: true,
    bgColor: '#0c0c12', bgOpacity: 88, bgGradient: false, bgColor2: '#1a1a2e', borderColor: '',
    last5Style: 'result', last5Direction: 'newestLeft', last5NewBadge: true,
    showDeck: true, showProfile: true, deckPlacement: 'top', language: 'de', chatChannel: '', chatEnabled: false,
    paginateOverlay: false, paginateIntervalS: 6, showClan: false,
    overlayTheme: 'classic', royalePanel: 'blue', royalePattern: true, overlayScale: 100,
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
        // Aus der Overlay-Galerie (/tools?…): ?vorlage=<id> einmal übernehmen, speichern und aus der Adresse nehmen
        const params = new URLSearchParams(window.location.search);
        const template = OVERLAY_TEMPLATES.find((x) => x.id === params.get('vorlage'));
        if (template) {
          const next = { ...d.settings, ...template.settings };
          setSettings(next);
          setTab('settings');
          api.saveSettings(next).catch(() => { /* Sync korrigiert es beim nächsten Laden */ });
          params.delete('vorlage');
          const rest = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
        } else {
          setSettings(d.settings);
        }
        setApiConfigured(d.apiConfigured);
      })
      .catch(() => setAccounts([]));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Rückblick gibt es nur für fertige Saisons (Backend: recapFor). Knopf "Rückblick", sobald es einen gibt; Hinweis-Banner
  // in den ersten 14 Tagen nach Ende der zuletzt fertigen Saison.
  const [recapAvailable, setRecapAvailable] = useState(false);
  const [recapReady, setRecapReady] = useState(null);
  const hasActive = !!accounts?.some((a) => a.isActive);
  useEffect(() => {
    if (!user || !hasActive) { setRecapReady(null); setRecapAvailable(false); return undefined; }
    let alive = true;
    api.getRecap('').then((d) => {
      if (!alive) return;
      setRecapAvailable(!!d.seasons?.length);
      if (!d.season || Date.now() - d.season.end > 14 * 24 * 60 * 60 * 1000) return;
      const [y, m] = d.season.key.split('-').map(Number);
      const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      setRecapReady({ key: d.season.key, label });
    }).catch(() => {});
    return () => { alive = false; };
  }, [user, hasActive, lang]);

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
    // die Ligagrenze wechselt serverseitig auch die Liga selbst — das kommt erst mit der Antwort.
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
    // Jeder Modus hat seine eigene Session; Saison-Modi ("s:<prefix>") werden direkt durchgereicht.
    const scope = isSeasonalMode(acc.trackMode) || challengeKeyOf(acc.trackMode) ? acc.trackMode
      : acc.trackMode === '2v2' ? '2v2' : acc.trackMode === 'trophies' ? 'trophies' : 'ranked';
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

  const activeAccount = accounts?.find(a => a.isActive) || null;

  return (
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
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

      <div className="min-h-full flex flex-col">
        {/* ── Obere Zeile wie im Hub: zurück zur Website | Sprache + Einstellungen ──────── */}
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
          <Link to="/clash" className={`${chipClass} px-3.5`} title={t.backToWebsite}>
            <ArrowLeftToLine size={16} />
            <span className="hidden sm:inline">{t.backToWebsite}</span>
          </Link>
          <div className="flex-1" />
          {/* Eine Einstellung für Editor-Text UND Overlay-Inhalt zugleich (siehe changeLanguage) */}
          <LanguageSelect lang={lang} onChange={changeLanguage} languages={['de', 'en']} />
          <button onClick={openSettings} className={`${chipClass} w-11 justify-center`} title={t.settingsAria} aria-label={t.settingsAria}>
            <CrSettings size={24} />
          </button>
        </div>

        <div className={`flex-1 w-full mx-auto px-3 md:px-6 py-4 md:py-6 ${tab === 'settings' ? 'max-w-[1500px]' : 'max-w-4xl'}`}>
          {/* ── Titel ─────────────────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center text-center mb-5 md:mb-6">
            <p className="font-cr text-[15px] md:text-lg tracking-[0.18em] uppercase text-[var(--cr-arcade-gold)]"
              style={{ textShadow: '0 2px 0 rgba(2,8,20,0.7)' }}>
              Clash Royale
            </p>
            <ArcadeTitle as="h1" className="text-4xl md:text-5xl leading-none">Win Tracker</ArcadeTitle>
            <p className="text-white/55 text-sm mt-2 max-w-xl">{t.pageSubtitle}</p>
          </div>

          {!user ? (
            <div className="cr-arcade-panel cr-anim-rise max-w-md mx-auto">
              <div className="cr-section text-center py-8">
                <CrTrophy size={56} className="mx-auto mb-3" />
                <p className="font-cr text-xl text-white mb-1">{t.loginRequired}</p>
                <p className="text-white/50 text-sm mb-6">{t.loginHint}</p>
                <ChunkyButton onClick={() => login(false)}>
                  <TwitchGlyph size={17} />
                  {t.loginButton}
                </ChunkyButton>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 mb-4 md:mb-5">
              <div className="cr-tabs flex-1 min-w-0 max-w-sm" role="tablist">
                <button role="tab" aria-selected={tab === 'accounts'} onClick={() => setTab('accounts')}>
                  <CrFriends size={26} />
                  <span className="cr-tab-label">{t.tabAccounts}</span>
                </button>
                <button role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>
                  <CrSettings size={26} />
                  <span className="cr-tab-label">{t.tabSettings}</span>
                </button>
              </div>
              {/* Rückblick ist eine eigene Seite, kein Reiter — erst, wenn eine Saison fertig ist */}
              {recapAvailable && (
              <Link to="/clash-royale/win-tracker/rueckblick" className="cr-tabs shrink-0 !overflow-visible">
                <span className="cr-tab-link flex items-center gap-2 px-3 sm:px-4 py-[0.55rem] rounded-xl font-cr text-[1.05rem] text-white/80 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap">
                  <CrScroll size={26} />
                  <span className="hidden sm:inline">{t.tabRecap}</span>
                </span>
              </Link>
              )}
              </div>

              {error && (
                <div className="cr-row border-red-500/50 bg-red-500/10 px-4 py-2.5 mb-4 text-red-200 text-sm" role="alert">{error}</div>
              )}

              {/* Saison gerade vorbei: Hinweis auf den fertigen Rückblick (die ersten 14 Tage der neuen Saison) */}
              {recapReady && (
                <Link to={`/clash-royale/win-tracker/rueckblick?season=${recapReady.key}`}
                  className="cr-row flex items-center justify-between gap-3 px-4 py-3 mb-4 rounded-xl border-2 border-[#f2c14e]/60 bg-[#f2c14e]/10 hover:bg-[#f2c14e]/15 transition-colors">
                  <span className="flex items-center gap-3 font-cr text-white"><CrScroll size={28} />{fill(t.recapBanner, { season: recapReady.label })}</span>
                  <span className="font-cr text-[var(--cr-arcade-gold)] shrink-0">{t.recapBannerCta} →</span>
                </Link>
              )}

              {tab === 'accounts' && (
                accounts === null ? (
                  <p className="text-white/50 text-sm py-8 text-center">{t.loadingAccounts}</p>
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
                  activeAccount={activeAccount}
                  onResetSession={handleResetSession}
                  flashError={flashError} />
              )}

            </>
          )}
        </div>
      </div>

      {addOpen && (
        <AddAccountModal
          t={t}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}
