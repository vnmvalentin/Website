import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  Trophy, Plus, X, RefreshCw, Trash2, Copy, Check, Eye, EyeOff, TrendingUp,
} from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import SEO from '../../../components/SEO';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { leagueIconUrl, leagueName } from '../data/leagueIcons';
import * as api from './winTrackerApi';

const fmt = (n) => (n || 0).toLocaleString('de-DE');

function hexToRgba(hex, opacityPct) {
  const h = String(hex || '#0c0c12').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct ?? 88)) / 100})`;
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

function LeagueBadge({ leagueNumber, polRank, size = 40 }) {
  const url = leagueIconUrl(leagueNumber);
  if (!url) {
    return (
      <div className="rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <Trophy size={size * 0.5} className="text-amber-400" />
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={leagueName(leagueNumber)}>
      <img src={url} alt={leagueName(leagueNumber)} className="w-full h-full object-contain" />
      {polRank ? (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#0f0f13] border border-violet-400/40 text-violet-300 text-[9px] font-bold px-1 rounded-lg leading-tight whitespace-nowrap">
          #{polRank}
        </span>
      ) : null}
    </div>
  );
}

// ── Accounts-Übersicht ───────────────────────────────────────────────────────
function AccountsTab({ accounts, onActivate, onDelete, onAdd, onRefresh, onTrackModeChange, refreshingId }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-bold">Deine Accounts</h2>
          <p className="text-gray-500 text-xs mt-0.5">Der aktive Account speist dein Win-Tracker-Overlay — jeder Account trackt seinen eigenen Wert.</p>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shrink-0">
          <Plus size={14} />
          Account hinzufügen
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-10 text-center">
          <p className="text-white font-bold mb-1">Noch kein Account verknüpft</p>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            Verknüpfe deinen Clash-Royale-Account über dein Spieler-Kürzel, um Liga, Trophäen und Matches im Overlay zu tracken.
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
              className={`bg-[#0f0f13] border rounded-lg p-5 transition-colors group relative ${
                acc.isActive ? 'border-violet-400/40' : 'border-white/5 hover:border-white/20'
              }`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <LeagueBadge leagueNumber={acc.leagueNumber} polRank={acc.polRank} />
                  <div className="min-w-0">
                    <p className="font-bold truncate text-white">{acc.playerName}</p>
                    <p className="text-gray-600 text-xs font-mono">#{acc.playerTag}</p>
                  </div>
                </div>

                {acc.isActive ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-600/10 px-2 py-0.5 rounded-lg shrink-0">
                    Aktiv
                  </span>
                ) : (
                  <button onClick={() => onActivate(acc)}
                    className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/10 px-2 py-0.5 rounded-lg hover:text-violet-300 hover:border-violet-400/40 transition-colors shrink-0">
                    Aktivieren
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 mb-3">
                <Trophy size={14} className="text-amber-400" />
                {acc.trackMode === 'trophies' ? (
                  <>
                    <span className="font-black text-lg tabular-nums text-white">{fmt(acc.trophies)}</span>
                    <span className="text-gray-600 text-xs">Trophäen · Beste {fmt(acc.bestTrophies)}</span>
                  </>
                ) : (
                  <>
                    <span className="font-black text-lg tabular-nums text-white">{fmt(acc.seasonMedals)}</span>
                    <span className="text-gray-600 text-xs">Medaillen (Season)</span>
                  </>
                )}
              </div>

              {/* Getrackter Wert — pro Account, nicht global */}
              <div className="mb-3">
                <p className="text-gray-600 text-[10px] font-bold uppercase tracking-wider mb-1.5">Getrackter Wert</p>
                <div className="flex gap-1.5">
                  {[{ key: 'medals', label: 'Medaillen' }, { key: 'trophies', label: 'Trophäen' }].map(opt => (
                    <button key={opt.key} onClick={() => onTrackModeChange(acc, opt.key)}
                      title={opt.key === 'medals' ? 'Punktestand der laufenden Ranked-Season' : 'Lifetime-Trophäen aus dem Profil'}
                      className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors ${
                        acc.trackMode === opt.key
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-300'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-white/5 pt-3">
                <span>{leagueName(acc.leagueNumber)}</span>
                <button onClick={() => onRefresh(acc)} title="Jetzt aktualisieren"
                  className="ml-auto text-gray-600 hover:text-white transition-colors p-0.5">
                  <RefreshCw size={13} className={refreshingId === acc.accountId ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => onDelete(acc)} title="Account entfernen"
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

// ── Umschalter (rounded-lg statt iOS-Switch) ─────────────────────────────────
function ToggleRow({ label, description, checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 bg-[#0f0f13] border border-white/5 hover:border-white/20 rounded-lg p-4 transition-colors text-left">
      <div>
        <p className="text-white font-bold text-sm">{label}</p>
        {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
      </div>
      <span className={`shrink-0 w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
        checked ? 'bg-violet-600 border-violet-500' : 'border-white/20'
      }`}>
        {checked && <Check size={13} className="text-white" />}
      </span>
    </button>
  );
}

// ── Trophäen/Medaillen-Umschalter (Segmented Control statt iOS-Switch) ───────
function TrackModeSwitch({ value, onChange }) {
  const options = [
    { key: 'medals', label: 'Medaillen (Ranked)' },
    { key: 'trophies', label: 'Trophäen (Lifetime)' },
  ];
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button key={opt.key} onClick={() => onChange(opt.key)}
          className={`flex-1 text-sm font-bold py-2.5 rounded-lg border transition-colors ${
            value === opt.key ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/10 text-gray-400 hover:border-white/25'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Einstellungen (OBS-Link + Anzeige-Optionen) ──────────────────────────────
function SettingsTab({ overlayKey, settings, onSettingsChange, apiConfigured }) {
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
    if (!window.confirm('Neuen Overlay-Link erzeugen? Der alte Link funktioniert danach nicht mehr (OBS muss aktualisiert werden).')) return;
    await api.regenerateOverlayKey();
    window.location.reload();
  };

  const toggle = (key) => async (value) => {
    const next = { ...settings, [key]: value };
    onSettingsChange(next);
    try { await api.saveSettings(next); } catch { /* Sync korrigiert es beim nächsten Laden */ }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="panel p-5 space-y-3">
        <h3 className="text-white font-bold text-sm">OBS-Overlay</h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          Binde diesen Link als Browser-Quelle in OBS ein. Das Overlay zeigt automatisch Liga, Trophäen
          und die letzten Spiele deines <span className="text-violet-300">aktiven</span> Accounts.
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

      <div className="panel p-5 space-y-3">
        <h3 className="text-white font-bold text-sm">Getrackter Wert — Voreinstellung</h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          <span className="text-violet-300">Medaillen</span> ist dein Punktestand der laufenden Ranked-Season (Path of Legend) —
          startet jede Season bei 0. <span className="text-violet-300">Trophäen</span> ist dein Lifetime-Stand aus dem Profil.
          Diese Auswahl gilt für <span className="text-white">neu verknüpfte</span> Accounts — bestehende Accounts stellst du
          einzeln im Tab <span className="text-white">Accounts</span> um.
        </p>
        <TrackModeSwitch value={settings.trackMode} onChange={toggle('trackMode')} />
      </div>

      <div className="panel p-5 space-y-3">
        <h3 className="text-white font-bold text-sm">Angezeigte Statistiken</h3>
        <ToggleRow label="Daily Profit" description="Saldo seit 00:00 Uhr (+/-), in Trophäen oder Medaillen je nach getracktem Wert."
          checked={settings.showDailyProfit} onChange={toggle('showDailyProfit')} />
        <ToggleRow label="Win/Loss (Zahlen)" description="Siege und Niederlagen seit 00:00 Uhr, z.B. 14S – 6N."
          checked={settings.showWinLossNumbers} onChange={toggle('showWinLossNumbers')} />
        <ToggleRow label="Win-Rate (%)" description="Siegquote seit 00:00 Uhr in Prozent."
          checked={settings.showWinLossPercent} onChange={toggle('showWinLossPercent')} />
        <ToggleRow label="Letzte 5 Spiele" description="Verlauf der letzten Matches mit Medaillen-Änderung, neuestes zuerst."
          checked={settings.showLast5} onChange={toggle('showLast5')} />
      </div>

      <div className="panel p-5 space-y-3">
        <h3 className="text-white font-bold text-sm">Overlay-Hintergrund</h3>
        <p className="text-gray-500 text-xs leading-relaxed">Farbe und Transparenz der Karte im Overlay.</p>
        <div className="flex items-center gap-4">
          <input type="color" value={settings.bgColor} onChange={e => toggle('bgColor')(e.target.value)}
            className="w-11 h-11 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Transparenz</span>
              <span className="text-white font-bold tabular-nums">{settings.bgOpacity}%</span>
            </div>
            <input type="range" min="0" max="100" value={settings.bgOpacity}
              onChange={e => toggle('bgOpacity')(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
        </div>
        <div className="rounded-lg border border-white/10 p-4 flex items-center justify-center text-xs text-gray-400"
          style={{ background: hexToRgba(settings.bgColor, settings.bgOpacity) }}>
          Vorschau
        </div>
      </div>

      <div className={`border rounded-lg p-5 ${apiConfigured ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
        <h3 className={`font-bold text-sm mb-1 ${apiConfigured ? 'text-green-400' : 'text-amber-400'}`}>
          {apiConfigured ? 'Clash Royale API verbunden' : 'Clash Royale API nicht konfiguriert'}
        </h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          {apiConfigured
            ? 'Liga, Trophäen und Matches werden automatisch über das Spieler-Kürzel synchronisiert.'
            : 'Accounts können trotzdem verknüpft werden, aber ohne automatischen Abgleich. Hinterlege dazu CLASH_ROYALE_API_TOKEN in der Backend-.env.'}
        </p>
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
    trackMode: 'medals', bgColor: '#0c0c12', bgOpacity: 88,
  });
  const [apiConfigured, setApiConfigured] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [error, setError] = useState('');

  const flashError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000); };

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
    if (!window.confirm(`Account "${acc.playerName}" wirklich entfernen?`)) return;
    try {
      await api.deleteAccount(acc.accountId);
      load();
    } catch (e) { flashError(e.message); }
  };

  const handleTrackModeChange = async (acc, trackMode) => {
    if (acc.trackMode === trackMode) return;
    // Optimistisch umschalten, damit der angezeigte Wert sofort mitwechselt
    setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? { ...a, trackMode } : a));
    try {
      const res = await api.setAccountTrackMode(acc.accountId, trackMode);
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? res.account : a));
    } catch (e) {
      setAccounts(prev => prev.map(a => a.accountId === acc.accountId ? { ...a, trackMode: acc.trackMode } : a));
      flashError(e.message);
    }
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
    <div className="page-fade max-w-6xl mx-auto">
      <SEO
        title="Clash Royale Win Tracker Overlay für OBS"
        description="Kostenloses OBS-Overlay für Clash Royale: zeigt Liga, Medaillen oder Trophäen, Tagesgewinn seit 00:00 Uhr, Win-Rate und die letzten 5 Spiele — live aus der offiziellen Clash-Royale-API, pro Account einstellbar."
        keywords="Clash Royale Overlay, Clash Royale OBS Overlay, Clash Royale Win Tracker, Trophäen Tracker, Medaillen Tracker, Path of Legend Overlay, Clash Royale Streaming Tool"
        path="/clash-royale/win-tracker"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Clash Royale Win Tracker Overlay',
            url: 'https://vnmvalentin.de/clash-royale/win-tracker',
            description: 'OBS-Overlay für Clash Royale mit Liga, Medaillen/Trophäen, Tagesstatistik und den letzten Matches.',
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

      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">Win Tracker Overlay</h1>
        <p className="text-gray-500 text-sm mt-1">
          Liga, Trophäen und die letzten Matches — live im OBS-Overlay, direkt aus der offiziellen Clash-Royale-API.
        </p>
      </div>

      {!user ? (
        <div className="panel p-10 text-center max-w-md mx-auto mt-12">
          <p className="text-white font-bold mb-1">Login erforderlich</p>
          <p className="text-gray-500 text-sm mb-5">Melde dich mit Twitch an, um deine Accounts und das Overlay zu verwalten.</p>
          <button onClick={() => login(false)}
            className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <TwitchGlyph size={15} />
            Mit Twitch einloggen
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
              Accounts
            </button>
            <button onClick={() => setTab('settings')}
              className={`flex items-center justify-center gap-2 py-3 px-5 text-sm font-bold transition-colors border-b-2 ${
                tab === 'settings' ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <TrendingUp size={14} />
              Einstellungen
            </button>
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          {tab === 'accounts' && (
            accounts === null ? (
              <p className="text-gray-500 text-sm py-8 text-center">Lade Accounts…</p>
            ) : (
              <AccountsTab
                accounts={accounts}
                onActivate={handleActivate}
                onDelete={handleDelete}
                onAdd={() => setAddOpen(true)}
                onRefresh={handleRefresh}
                onTrackModeChange={handleTrackModeChange}
                refreshingId={refreshingId}
              />
            )
          )}

          {tab === 'settings' && (
            <SettingsTab overlayKey={overlayKey} settings={settings} onSettingsChange={setSettings} apiConfigured={apiConfigured} />
          )}

          {addOpen && (
            <AddAccountModal
              onClose={() => setAddOpen(false)}
              onAdded={() => { setAddOpen(false); load(); }}
            />
          )}
        </>
      )}
    </div>
  );
}
