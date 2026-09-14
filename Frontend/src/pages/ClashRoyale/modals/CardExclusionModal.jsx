// Kartenpool der Lobby: einzelne Karten sperren oder ein selbst gespeichertes Preset laden.
// Presets sind privat pro Twitch-Account — nur wer eingeloggt ist, sieht und verwaltet seine
// eigenen (siehe Backend/lib/crPresetStore.js). Die Auswahl gilt global für alle Spielmodi
// dieser Lobby.

import React, { useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Search, LayoutGrid, Sparkles, Check, Save, Trash2, UserCheck, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import CardGrid from './CardGrid';
import { ALL_CARDS, cardImageUrl } from '../data/cards';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';

const I18N = {
  de: {
    title: 'Kartenpool',
    tabCards: 'Karten',
    tabPresets: 'Presets',
    searchPlaceholder: 'Karte suchen…',
    excludedInDraft: (excluded, inDraft) => `${excluded} ausgeschlossen · ${inDraft} im Draft`,
    reset: 'Zurücksetzen',
    trimToUnlocked: 'Nur freigeschaltete Karten',
    trimToUnlockedTitle: 'Schließt alle Karten aus, die mindestens einer der verbundenen Spieler im echten Spiel noch nicht freigeschaltet hat.',
    trimChecking: 'Prüfe freigeschaltete Karten…',
    trimResult: (kept, players, skipped) =>
      `${kept} Karten behalten, die alle ${players} verbundenen Spieler besitzen`
      + (skipped ? ` (${skipped} Account${skipped === 1 ? '' : 's'} gerade nicht abrufbar)` : '') + '.',
    editNote: 'Klicke auf eine Karte, um sie aus dem Draft zu entfernen — gilt für alle Spielmodi dieser Lobby.',
    readOnlyNote: 'Nur der Host (oder Admin) kann den Kartenpool ändern.',
    noneFound: 'Keine Karte gefunden.',
    presetsIntro: 'Ein Preset setzt den Kartenpool auf eine feste Kartenauswahl — alle übrigen Karten werden ausgeschlossen.',
    presetsEmpty: 'Noch keine eigenen Presets gespeichert.',
    presetsLoading: 'Lade Presets…',
    presetsError: 'Presets konnten nicht geladen werden.',
    presetApply: 'Laden',
    presetActive: 'Aktiv',
    presetAllCards: 'Alle Karten',
    presetAllCardsDesc: 'Kein Ausschluss — der komplette Kartensatz ist im Draft.',
    presetCardCount: (n) => `${n} Karten`,
    presetMissing: (n) => `${n} Karten des Presets kennt diese Seite nicht und werden übersprungen.`,
    presetMyPresets: 'Meine Presets',
    presetLoginRequired: 'Melde dich mit Twitch an, um eigene Presets zu speichern und zu laden — sie sind privat, nur du siehst sie.',
    presetLoginButton: 'Mit Twitch einloggen',
    presetSaveCurrent: 'Aktuelle Auswahl speichern',
    presetSaveNamePlaceholder: 'Name (z.B. "Nur Legendäre")',
    presetSaveDescPlaceholder: 'Beschreibung (optional)',
    presetSaveConfirm: 'Speichern',
    presetSaveCancel: 'Abbrechen',
    presetSaveNothingToSave: 'Alle Karten sind aktuell erlaubt — schließe erst welche aus, bevor du speicherst.',
    presetDelete: 'Preset löschen',
    presetDeleteConfirm: (name) => `Preset "${name}" wirklich löschen?`,
    trimErrors: {
      noPermission: 'Keine Berechtigung.',
      apiNotConfigured: 'Die Clash-Royale-API ist auf diesem Server nicht eingerichtet.',
      noLinkedAccounts: 'Kein Spieler hat bisher einen Clash-Royale-Account verknüpft.',
      tagLookupFailed: 'Freigeschaltete Karten konnten gerade nicht geprüft werden — bitte später erneut versuchen.',
    },
  },
  en: {
    title: 'Card pool',
    tabCards: 'Cards',
    tabPresets: 'Presets',
    searchPlaceholder: 'Search cards…',
    excludedInDraft: (excluded, inDraft) => `${excluded} excluded · ${inDraft} in the draft`,
    reset: 'Reset',
    trimToUnlocked: 'Only unlocked cards',
    trimToUnlockedTitle: 'Excludes every card that at least one of the linked players has not unlocked yet in the real game.',
    trimChecking: 'Checking unlocked cards…',
    trimResult: (kept, players, skipped) =>
      `Kept ${kept} cards that all ${players} linked players own`
      + (skipped ? ` (${skipped} account${skipped === 1 ? '' : 's'} unreachable right now)` : '') + '.',
    editNote: 'Click a card to remove it from the draft — applies to every game mode in this lobby.',
    readOnlyNote: 'Only the host (or an admin) can change the card pool.',
    noneFound: 'No cards found.',
    presetsIntro: 'A preset sets the card pool to a fixed selection — every other card is excluded.',
    presetsEmpty: 'No presets saved yet.',
    presetsLoading: 'Loading presets…',
    presetsError: 'Presets could not be loaded.',
    presetApply: 'Load',
    presetActive: 'Active',
    presetAllCards: 'All cards',
    presetAllCardsDesc: 'No exclusions — the complete card set is in the draft.',
    presetCardCount: (n) => `${n} cards`,
    presetMissing: (n) => `${n} cards of this preset are unknown to this site and get skipped.`,
    presetMyPresets: 'My presets',
    presetLoginRequired: 'Log in with Twitch to save and load your own presets — they are private, only you see them.',
    presetLoginButton: 'Log in with Twitch',
    presetSaveCurrent: 'Save current selection',
    presetSaveNamePlaceholder: 'Name (e.g. "Legendaries only")',
    presetSaveDescPlaceholder: 'Description (optional)',
    presetSaveConfirm: 'Save',
    presetSaveCancel: 'Cancel',
    presetSaveNothingToSave: 'Every card is currently allowed — exclude some first before saving.',
    presetDelete: 'Delete preset',
    presetDeleteConfirm: (name) => `Really delete preset "${name}"?`,
    trimErrors: {
      noPermission: 'No permission.',
      apiNotConfigured: 'The Clash Royale API is not set up on this server.',
      noLinkedAccounts: 'No player has linked a Clash Royale account yet.',
      tagLookupFailed: 'Unlocked cards could not be checked right now — please try again later.',
    },
  },
  es: {
    title: 'Pool de cartas',
    tabCards: 'Cartas',
    tabPresets: 'Presets',
    searchPlaceholder: 'Buscar cartas…',
    excludedInDraft: (excluded, inDraft) => `${excluded} excluidas · ${inDraft} en el draft`,
    reset: 'Restablecer',
    trimToUnlocked: 'Solo cartas desbloqueadas',
    trimToUnlockedTitle: 'Excluye toda carta que al menos uno de los jugadores vinculados todavía no haya desbloqueado en el juego real.',
    trimChecking: 'Comprobando cartas desbloqueadas…',
    trimResult: (kept, players, skipped) =>
      `Se mantienen ${kept} cartas que los ${players} jugadores vinculados poseen`
      + (skipped ? ` (${skipped} cuenta${skipped === 1 ? '' : 's'} no disponible ahora mismo)` : '') + '.',
    editNote: 'Haz clic en una carta para quitarla del draft — aplica a todos los modos de juego de esta sala.',
    readOnlyNote: 'Solo el host (o un admin) puede cambiar el pool de cartas.',
    noneFound: 'No se encontró ninguna carta.',
    presetsIntro: 'Un preset fija el pool de cartas a una selección concreta — el resto de cartas quedan excluidas.',
    presetsEmpty: 'Todavía no hay presets guardados.',
    presetsLoading: 'Cargando presets…',
    presetsError: 'No se pudieron cargar los presets.',
    presetApply: 'Cargar',
    presetActive: 'Activo',
    presetAllCards: 'Todas las cartas',
    presetAllCardsDesc: 'Sin exclusiones — el conjunto completo de cartas está en el draft.',
    presetCardCount: (n) => `${n} cartas`,
    presetMissing: (n) => `${n} cartas de este preset no son conocidas por esta página y se omiten.`,
    presetMyPresets: 'Mis presets',
    presetLoginRequired: 'Inicia sesión con Twitch para guardar y cargar tus propios presets — son privados, solo tú los ves.',
    presetLoginButton: 'Iniciar sesión con Twitch',
    presetSaveCurrent: 'Guardar selección actual',
    presetSaveNamePlaceholder: 'Nombre (p. ej. "Solo legendarias")',
    presetSaveDescPlaceholder: 'Descripción (opcional)',
    presetSaveConfirm: 'Guardar',
    presetSaveCancel: 'Cancelar',
    presetSaveNothingToSave: 'Todas las cartas están permitidas ahora mismo — excluye alguna antes de guardar.',
    presetDelete: 'Eliminar preset',
    presetDeleteConfirm: (name) => `¿Eliminar el preset "${name}"?`,
    trimErrors: {
      noPermission: 'Sin permiso.',
      apiNotConfigured: 'La API de Clash Royale no está configurada en este servidor.',
      noLinkedAccounts: 'Todavía ningún jugador ha vinculado una cuenta de Clash Royale.',
      tagLookupFailed: 'No se pudieron comprobar las cartas desbloqueadas ahora mismo — inténtalo de nuevo más tarde.',
    },
  },
};

async function presetApi(path, opts = {}) {
  const res = await fetch(`/api/clash/presets${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

// Inline-Formular zum Speichern der aktuellen Auswahl — kein eigenes Modal-über-Modal, bleibt
// als kleine Karte direkt im Presets-Tab.
function SavePresetForm({ onSave, onCancel, L }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await onSave(name.trim(), description.trim());
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-2.5 border-violet-500/30">
      <input value={name} onChange={e => setName(e.target.value)} placeholder={L.presetSaveNamePlaceholder}
        maxLength={40} autoFocus
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/25 outline-none focus:border-violet-500 transition-colors" />
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder={L.presetSaveDescPlaceholder}
        maxLength={160}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/25 outline-none focus:border-violet-500 transition-colors" />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!name.trim() || busy}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Save size={12} /> {L.presetSaveConfirm}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors">
          {L.presetSaveCancel}
        </button>
      </div>
    </div>
  );
}

// Presets-Tab: die eigenen, privaten Presets laden/speichern/löschen — plus der feste
// "Alle Karten"-Eintrag als schneller Reset (kein echtes Preset, braucht kein Login).
function PresetsTab({ excluded, canEdit, onApplyPreset, L }) {
  const { user, login } = useContext(TwitchAuthContext);
  const [state, setState] = useState({ status: 'idle', presets: [] });
  const [saveOpen, setSaveOpen] = useState(false);

  const loadPresets = useCallback(() => {
    if (!user) { setState({ status: 'ready', presets: [] }); return; }
    setState((s) => ({ ...s, status: 'loading' }));
    presetApi('/')
      .then((d) => setState({ status: 'ready', presets: d.presets || [] }))
      .catch(() => setState({ status: 'error', presets: [] }));
  }, [user]);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  const validIds = useMemo(() => new Set(ALL_CARDS.map((c) => c.id)), []);
  const excludedSet = new Set(excluded);
  const poolIds = ALL_CARDS.filter((c) => !excludedSet.has(c.id)).map((c) => c.id);
  const isActive = (cardIds) => {
    const known = cardIds.filter((id) => validIds.has(id));
    return known.length === poolIds.length && known.every((id) => !excludedSet.has(id));
  };

  const savePreset = async (name, description) => {
    await presetApi('/', { method: 'POST', body: JSON.stringify({ name, description, cardIds: poolIds }) });
    setSaveOpen(false);
    loadPresets();
  };

  const deletePresetById = async (presetId, name) => {
    if (!window.confirm(L.presetDeleteConfirm(name))) return;
    try {
      await presetApi(`/${presetId}`, { method: 'DELETE' });
      loadPresets();
    } catch { /* Liste bleibt wie sie war, nächster Ladevorgang korrigiert es notfalls */ }
  };

  const renderPresetCard = (preset, { deletable } = {}) => {
    const known = preset.cardIds.filter((id) => validIds.has(id));
    const missing = preset.cardIds.length - known.length;
    const active = isActive(preset.cardIds);
    return (
      <div key={preset.presetId} className={`panel p-4 flex flex-col gap-2.5 ${active ? 'border-violet-500/40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{preset.name}</p>
            <p className="text-white/40 text-xs mt-0.5">{L.presetCardCount(known.length)}</p>
          </div>
          {deletable && (
            <button onClick={() => deletePresetById(preset.presetId, preset.name)} title={L.presetDelete}
              className="text-white/25 hover:text-red-400 transition-colors p-0.5 shrink-0">
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {preset.description && <p className="text-white/40 text-xs leading-relaxed">{preset.description}</p>}
        {missing > 0 && <p className="text-amber-400/70 text-[11px]">{L.presetMissing(missing)}</p>}

        <div className="flex flex-wrap gap-1">
          {known.slice(0, 14).map((id) => (
            <img key={id} src={cardImageUrl(id)} alt="" loading="lazy" decoding="async"
              className="w-6 h-7 object-cover rounded-[3px]"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ))}
          {known.length > 14 && <span className="text-white/30 text-[10px] self-center ml-1">+{known.length - 14}</span>}
        </div>

        {active ? (
          <span className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300">
            <Check size={13} /> {L.presetActive}
          </span>
        ) : (
          <button onClick={() => onApplyPreset(known)} disabled={!canEdit || known.length === 0}
            className="text-xs font-bold py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {L.presetApply}
          </button>
        )}
      </div>
    );
  };

  const allCardsEntry = {
    presetId: '__all__', name: L.presetAllCards, description: L.presetAllCardsDesc,
    cardIds: ALL_CARDS.map((c) => c.id),
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-white/30 text-xs mb-3">{L.presetsIntro}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderPresetCard(allCardsEntry)}
        </div>
      </div>

      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-white font-semibold text-sm flex items-center gap-2">
            <Sparkles size={13} className="text-violet-300" />
            {L.presetMyPresets}
          </p>
          {user && canEdit && !saveOpen && (
            <button onClick={() => setSaveOpen(true)} disabled={poolIds.length === ALL_CARDS.length}
              title={poolIds.length === ALL_CARDS.length ? L.presetSaveNothingToSave : undefined}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
              <Save size={12} /> {L.presetSaveCurrent}
            </button>
          )}
        </div>

        {!user ? (
          <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-white/50 text-xs">{L.presetLoginRequired}</p>
            <button onClick={() => login(false)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#9146FF] hover:bg-[#7c3aed] text-white transition-colors shrink-0">
              {L.presetLoginButton}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {saveOpen && <SavePresetForm onSave={savePreset} onCancel={() => setSaveOpen(false)} L={L} />}
            {state.status === 'loading' && <p className="text-white/40 text-sm text-center py-6">{L.presetsLoading}</p>}
            {state.status === 'error' && <p className="text-red-400 text-sm text-center py-6">{L.presetsError}</p>}
            {state.status === 'ready' && state.presets.length === 0 && !saveOpen && (
              <p className="text-white/30 text-xs italic">{L.presetsEmpty}</p>
            )}
            {state.status === 'ready' && state.presets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {state.presets.map((preset) => renderPresetCard(preset, { deletable: canEdit }))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CardExclusionModal({
  excluded, canEdit, onToggle, onReset, onSetExcluded, onTrimToUnlocked, onClose, lang = 'de',
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('cards'); // 'cards' | 'presets'
  const [trimState, setTrimState] = useState('idle'); // 'idle' | 'checking' | 'error'
  const [trimMessage, setTrimMessage] = useState('');
  const L = I18N[lang] || I18N.de;
  const excludedSet = new Set(excluded);

  const runTrim = async () => {
    if (!onTrimToUnlocked || trimState === 'checking') return;
    setTrimState('checking');
    setTrimMessage('');
    const res = await onTrimToUnlocked();
    if (res?.ok) {
      setTrimState('idle');
      setTrimMessage(L.trimResult(res.keptCount, res.playersConsidered, res.skippedCount || 0));
    } else {
      setTrimState('error');
      setTrimMessage(L.trimErrors[res?.key] || L.trimErrors.tagLookupFailed);
    }
  };

  // Preset laden = alles außer den Preset-Karten ausschließen
  const applyPreset = (cardIds) => {
    const keep = new Set(cardIds);
    onSetExcluded(ALL_CARDS.filter(c => !keep.has(c.id)).map(c => c.id));
  };

  return (
    <Modal
      title={L.title}
      icon={<Ban size={15} className="text-red-400 shrink-0" />}
      onClose={onClose}
      bodyScroll={false}>

      <div className="flex border-b border-white/5 shrink-0">
        {[
          { id: 'cards', label: L.tabCards, icon: LayoutGrid },
          { id: 'presets', label: L.tabPresets, icon: Sparkles },
        ].map(item => {
          const TabIcon = item.icon;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} aria-selected={tab === item.id}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-colors border-b-2 ${
                tab === item.id ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              <TabIcon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'presets' ? (
        <div className="overflow-y-auto custom-scrollbar p-5">
          <PresetsTab excluded={excluded} canEdit={canEdit} onApplyPreset={applyPreset} L={L} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] focus-within:border-violet-500 transition-colors">
              <Search size={13} className="text-white/30 shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={L.searchPlaceholder}
                className="bg-transparent text-white text-sm placeholder-gray-600 outline-none w-full" />
            </div>
            <span className="text-white/40 text-xs shrink-0">
              {L.excludedInDraft(excluded.length, ALL_CARDS.length - excluded.length)}
            </span>
            {canEdit && onTrimToUnlocked && (
              <button onClick={runTrim} disabled={trimState === 'checking'} title={L.trimToUnlockedTitle}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                {trimState === 'checking' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                {trimState === 'checking' ? L.trimChecking : L.trimToUnlocked}
              </button>
            )}
            {canEdit && excluded.length > 0 && (
              <button onClick={onReset}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shrink-0">
                {L.reset}
              </button>
            )}
          </div>

          <p className="px-5 pt-3 text-white/30 text-xs shrink-0">{canEdit ? L.editNote : L.readOnlyNote}</p>
          {trimMessage && (
            <p className={`px-5 pt-1.5 text-xs shrink-0 ${trimState === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {trimMessage}
            </p>
          )}

          <div className="overflow-y-auto custom-scrollbar p-5">
            <CardGrid
              query={query}
              lang={lang}
              emptyText={L.noneFound}
              renderCard={(card) => {
                const isExcluded = excludedSet.has(card.id);
                return {
                  onClick: canEdit ? () => onToggle(card.id) : undefined,
                  selectable: canEdit,
                  // dimmed statt disabled: ein Klick auf eine gesperrte Karte gibt
                  // sie wieder frei — das muss weiter möglich bleiben.
                  dimmed: isExcluded,
                  // Gesperrte Karten sind ausgegraut — das Verbotszeichen macht
                  // eindeutig, dass das Absicht ist und nicht ein fehlendes Bild.
                  overlay: isExcluded ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-red-500/5">
                      <Ban size={16} className="text-red-400" />
                    </span>
                  ) : null,
                };
              }}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
