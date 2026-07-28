// Admin-Verwaltung der Karten-Presets für den Kartenpool der Minigames.
//
// Zwei Arten von Presets:
//   • eigene   — hier von Hand angelegt (Name, Beschreibung, Kartenauswahl)
//   • erkannte — Kartenpools offizieller Clash-Royale-Spezialmodi, die der Server aus echten
//                Battlelogs zusammenträgt (Backend/clashRoyale/core/officialModeScanner.js).
//                Name und Karten gehören dem Scan; hier lässt sich nur die Sichtbarkeit
//                und eine eigene Beschreibung setzen.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Pencil, RefreshCw, Search, X, Check, Eye, EyeOff, Sparkles, Radar,
} from 'lucide-react';
import { ALL_CARDS, RARITY_COLOR } from '../data/cards';

const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';
const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const RARITY_LABEL = { Common: 'Gewöhnlich', Rare: 'Selten', Epic: 'Episch', Legendary: 'Legendär', Champion: 'Champions' };

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
};

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
// Name, den der Scan vergeben hat (Codename bzw. aufgehübschte Variante davon)
const prettyFallback = (preset) => preset?.rawName || preset?.gameModeKey || '';

// ── Kartenauswahl ───────────────────────────────────────────────────────────
function CardPicker({ selected, onToggle, onSelectAll, onClear }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_CARDS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CARDS;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[160px] focus-within:border-violet-500 transition-colors">
          <Search size={13} className="text-white/30 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Karte suchen…"
            className="bg-transparent text-white text-sm placeholder-white/25 outline-none w-full" />
        </div>
        <span className="text-white/40 text-xs shrink-0">{selected.size} / {ALL_CARDS.length} gewählt</span>
        <button type="button" onClick={onSelectAll}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors">
          Alle
        </button>
        <button type="button" onClick={onClear}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors">
          Keine
        </button>
      </div>

      <div className="max-h-[42vh] overflow-y-auto custom-scrollbar space-y-4 pr-1">
        {RARITY_ORDER.map(rarity => {
          const cards = filtered.filter(c => c.rarity === rarity);
          if (!cards.length) return null;
          return (
            <div key={rarity} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: RARITY_COLOR[rarity] }}>
                {RARITY_LABEL[rarity] || rarity}
              </p>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {cards.map(card => {
                  const isOn = selected.has(card.id);
                  return (
                    <button key={card.id} type="button" title={card.name} onClick={() => onToggle(card.id)}
                      className={`relative aspect-[5/6] rounded-lg overflow-hidden border transition-colors ${
                        isOn ? 'border-violet-400/70 bg-violet-500/10' : 'border-white/10 bg-black/30 hover:border-white/40'
                      }`}>
                      <img src={`${CARD_CDN}${card.id}.png`} alt={card.name}
                        loading="lazy" decoding="async" draggable={false}
                        className={`w-full h-full object-cover ${isOn ? '' : 'grayscale opacity-40'}`}
                        onError={e => { e.target.style.display = 'none'; }} />
                      {isOn && (
                        <span className="absolute top-0.5 right-0.5 bg-violet-500 rounded-md p-0.5">
                          <Check size={9} className="text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-white/40 text-sm text-center py-8">Keine Karte gefunden.</p>}
      </div>
    </div>
  );
}

// ── Anlegen / Bearbeiten ────────────────────────────────────────────────────
// Bei erkannten Presets (source 'auto') gehört die Kartenliste dem Scan — dort lassen sich
// nur Anzeigename und Beschreibung setzen, dafür überleben die jeden weiteren Scan.
function PresetEditor({ preset, onClose, onSaved }) {
  const isNew = !preset;
  const isAuto = preset?.source === 'auto';
  const [name, setName] = useState(preset?.displayName || (isAuto ? '' : preset?.name || ''));
  const [description, setDescription] = useState(preset?.description || '');
  const [selected, setSelected] = useState(() => new Set(preset?.cardIds || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const body = JSON.stringify(isAuto
        ? { name: name.trim(), description: description.trim() }
        : { name: name.trim(), description: description.trim(), cardIds: [...selected] });
      const res = isNew
        ? await api('/api/clash/presets/admin', { method: 'POST', body })
        : await api(`/api/clash/presets/admin/${preset.presetId}`, { method: 'PUT', body });
      onSaved(res.preset);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <span className="text-white font-bold flex items-center gap-2">
            <Sparkles size={15} className="text-violet-300" />
            {isNew ? 'Neues Preset' : `Preset bearbeiten · ${preset.name}`}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs block mb-1.5">
                {isAuto ? 'Anzeigename' : 'Name'}
              </label>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus
                placeholder={isAuto ? prettyFallback(preset) : 'z.B. Nur Zauber'}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/25 focus:border-violet-500 outline-none transition-colors" />
              {isAuto && (
                <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">
                  Die API liefert nur den internen Codenamen <span className="font-mono text-white/50">{preset.gameModeKey}</span>.
                  Trage hier ein, wie der Modus im Spiel wirklich heißt — der Name bleibt bei jedem weiteren Scan erhalten.
                  Leer lassen setzt ihn zurück.
                </p>
              )}
            </div>
            <div>
              <label className="text-white/40 text-xs block mb-1.5">Beschreibung (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} maxLength={160}
                placeholder="Kurz erklären, was das Preset macht"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/25 focus:border-violet-500 outline-none transition-colors" />
            </div>
          </div>

          {isAuto ? (
            <div>
              <p className="text-white/40 text-xs mb-2">
                Kartenpool ({preset.cardIds.length} Karten) — vom Scan aus echten Battlelogs zusammengetragen und
                hier nicht bearbeitbar, weil der nächste Scan die Änderung überschreiben würde.
              </p>
              <div className="flex flex-wrap gap-1 max-h-[38vh] overflow-y-auto custom-scrollbar">
                {preset.cardIds.map(id => (
                  <img key={id} src={`${CARD_CDN}${id}.png`} alt={id} title={id} loading="lazy" decoding="async"
                    className="w-9 h-11 object-cover rounded-[3px] border border-white/10"
                    onError={e => { e.target.style.display = 'none'; }} />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-white/40 text-xs mb-2">
                Ausgewählte Karten bilden den Kartenpool. Alles was nicht gewählt ist, wird beim Laden des Presets vom Draft ausgeschlossen.
              </p>
              <CardPicker
                selected={selected}
                onToggle={toggle}
                onSelectAll={() => setSelected(new Set(ALL_CARDS.map(c => c.id)))}
                onClear={() => setSelected(new Set())}
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5 shrink-0">
          <button onClick={onClose}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors">
            Abbrechen
          </button>
          <button onClick={save} disabled={busy || (!isAuto && (!name.trim() || selected.size === 0))}
            className="text-sm font-bold px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed">
            {busy ? 'Speichere…' : isNew ? 'Preset anlegen' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
export default function CardPresetAdminPanel({ search = '' }) {
  const [presets, setPresets] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [editing, setEditing] = useState(null); // { preset } | { preset: null } für "neu"
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const flash = (msg) => { setError(msg); setTimeout(() => setError(''), 5000); };

  const load = useCallback(() => {
    api('/api/clash/presets/admin')
      .then(d => { setPresets(d.presets); setLastScan(d.lastScan); })
      .catch(e => { setPresets([]); flash(e.message); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await api('/api/clash/presets/admin/scan', { method: 'POST' });
      setPresets(res.presets);
      setLastScan(res.summary);
    } catch (e) { flash(e.message); }
    finally { setScanning(false); }
  };

  const togglePublished = async (preset) => {
    try {
      const res = await api(`/api/clash/presets/admin/${preset.presetId}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublished: !preset.isPublished }),
      });
      setPresets(prev => prev.map(p => p.presetId === preset.presetId ? res.preset : p));
    } catch (e) { flash(e.message); }
  };

  const remove = async (preset) => {
    // Erkannte Presets legt der nächste Scan ggf. neu an — dann beginnt die Kartensammlung
    // wieder bei null. Zum dauerhaften Ausblenden ist "Verborgen" der richtige Weg.
    const extra = preset.source === 'auto'
      ? '\n\nHinweis: Der nächste Scan kann es neu anlegen, die gesammelten Karten starten dann wieder bei 0. Zum dauerhaften Ausblenden nutze besser "Verborgen".'
      : '';
    if (!window.confirm(`Preset "${preset.name}" wirklich löschen?${extra}`)) return;
    try {
      await api(`/api/clash/presets/admin/${preset.presetId}`, { method: 'DELETE' });
      setPresets(prev => prev.filter(p => p.presetId !== preset.presetId));
    } catch (e) { flash(e.message); }
  };

  const filtered = useMemo(() => {
    if (!presets) return null;
    const q = search.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(p => `${p.name} ${p.description} ${p.gameModeKey}`.toLowerCase().includes(q));
  }, [presets, search]);

  return (
    <div className="space-y-5">
      {/* Automatische Erkennung offizieller Spezialmodi */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm flex items-center gap-2">
              <Radar size={14} className="text-cyan-300" />
              Offizielle Spezialmodi erkennen
            </p>
            <p className="text-white/40 text-xs mt-1 leading-relaxed max-w-2xl">
              Die offizielle Clash-Royale-API verrät den erlaubten Kartenpool eines Spezialmodus nicht direkt.
              Der Scan liest deshalb echte Battlelogs aus (Event-Leaderboards + große Clans) und sammelt alle Karten,
              die in einem Modus tatsächlich gespielt wurden. Läuft automatisch alle 6 Stunden; der Pool wird mit
              jedem Lauf vollständiger und umfasst die Karten der letzten 14 Tage — ändert Supercell den Pool
              mitten im Event (wie beim Chaos-Modus), zieht er also nach.
            </p>
            <p className="text-white/40 text-xs mt-1.5 leading-relaxed max-w-2xl">
              Namen liefert die API nicht mit, nur interne Codenamen. Bekannte sind hinterlegt, alle anderen
              benennst du per Stift-Symbol selbst — der Name bleibt danach bei jedem Scan erhalten.
            </p>
            <p className="text-white/30 text-xs mt-2">
              Letzter Scan: <span className="text-white/60">{fmtDate(lastScan?.scannedAt)}</span>
              {lastScan?.playersScanned ? ` · ${lastScan.playersScanned} Spieler · ${lastScan.detected?.length || 0} Spezialmodi erkannt` : ''}
            </p>
          </div>
          <button onClick={runScan} disabled={scanning}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg text-sm font-semibold transition-colors shrink-0">
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanne…' : 'Jetzt scannen'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-white/40 text-xs uppercase font-bold tracking-wider">Presets</span>
          <span className="text-white font-bold">{presets?.length ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 text-sm font-semibold transition-colors">
            <RefreshCw size={14} /> Aktualisieren
          </button>
          <button onClick={() => setEditing({ preset: null })}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus size={14} /> Neues Preset
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {filtered === null ? (
        <p className="text-white/40 text-sm py-8 text-center">Lade Presets…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-10 text-center">
          <p className="text-white font-semibold mb-1">Noch keine Presets</p>
          <p className="text-white/40 text-sm">
            Lege ein eigenes Preset an oder starte den Scan, um Kartenpools offizieller Spezialmodi zu übernehmen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(preset => {
            const isAuto = preset.source === 'auto';
            return (
              <div key={preset.presetId} className={`panel p-4 space-y-3 ${preset.isPublished ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{preset.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {preset.cardIds.length} Karten
                      {isAuto && preset.gamesSeen ? ` · ${preset.gamesSeen} Spiele insgesamt beobachtet` : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 ${
                    isAuto ? 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10' : 'text-violet-300 border-violet-400/30 bg-violet-500/10'
                  }`}>
                    {isAuto ? 'Erkannt' : 'Eigenes'}
                  </span>
                </div>

                {preset.description && <p className="text-white/40 text-xs leading-relaxed">{preset.description}</p>}
                {isAuto && (<>
                  <p className="text-white/25 text-[11px] truncate" title={preset.gameModeKey}>
                    Codename: <span className="font-mono">{preset.gameModeKey}</span>
                    {!preset.displayName && <span className="text-amber-400/70"> · nicht benannt</span>}
                  </p>
                  {preset.poolChangedAt && (
                    <p className="text-white/25 text-[11px]">
                      Pool geändert: {fmtDate(preset.poolChangedAt)}
                      {(preset.lastAdded.length || preset.lastRemoved.length) ? (
                        <>
                          {' · '}
                          <span className="text-emerald-400/70">+{preset.lastAdded.length}</span>
                          {' / '}
                          <span className="text-red-400/70">−{preset.lastRemoved.length}</span>
                          {' Karten'}
                        </>
                      ) : null}
                    </p>
                  )}
                </>)}

                <div className="flex flex-wrap gap-1">
                  {preset.cardIds.slice(0, 12).map(id => (
                    <img key={id} src={`${CARD_CDN}${id}.png`} alt="" loading="lazy" decoding="async"
                      className="w-6 h-7 object-cover rounded-[3px] border border-white/10"
                      onError={e => { e.target.style.display = 'none'; }} />
                  ))}
                  {preset.cardIds.length > 12 && (
                    <span className="text-white/30 text-[10px] self-center ml-1">+{preset.cardIds.length - 12}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 border-t border-white/5 pt-3">
                  <button onClick={() => togglePublished(preset)}
                    title={preset.isPublished ? 'Für Lobbys verbergen' : 'Für Lobbys sichtbar machen'}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors ${
                      preset.isPublished
                        ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                        : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
                    }`}>
                    {preset.isPublished ? <Eye size={12} /> : <EyeOff size={12} />}
                    {preset.isPublished ? 'Sichtbar' : 'Verborgen'}
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => setEditing({ preset })}
                    title={isAuto ? 'Umbenennen (Anzeigename überlebt jeden Scan)' : 'Bearbeiten'}
                    className="p-1.5 rounded-md border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(preset)} title="Löschen"
                    className="p-1.5 rounded-md border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PresetEditor
          preset={editing.preset}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
