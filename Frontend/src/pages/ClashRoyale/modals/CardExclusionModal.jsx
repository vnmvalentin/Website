// Kartenpool der Lobby: einzelne Karten sperren oder ein fertiges Preset laden.
// Die Auswahl gilt global für alle Spielmodi dieser Lobby.

import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Search, LayoutGrid, Sparkles, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import CardGrid from './CardGrid';
import { CARD_CDN } from '../constants';
import { ALL_CARDS } from '../data/cards';

const I18N = {
  de: {
    title: 'Kartenpool',
    tabCards: 'Karten',
    tabPresets: 'Presets',
    searchPlaceholder: 'Karte suchen…',
    excludedInDraft: (excluded, inDraft) => `${excluded} ausgeschlossen · ${inDraft} im Draft`,
    reset: 'Zurücksetzen',
    editNote: 'Klicke auf eine Karte, um sie aus dem Draft zu entfernen — gilt für alle Spielmodi dieser Lobby.',
    readOnlyNote: 'Nur der Host (oder Admin) kann den Kartenpool ändern.',
    noneFound: 'Keine Karte gefunden.',
    presetsIntro: 'Ein Preset setzt den Kartenpool auf eine feste Kartenauswahl — alle übrigen Karten werden ausgeschlossen.',
    presetsEmpty: 'Noch keine Presets vorhanden.',
    presetsLoading: 'Lade Presets…',
    presetsError: 'Presets konnten nicht geladen werden.',
    presetApply: 'Laden',
    presetActive: 'Aktiv',
    presetAllCards: 'Alle Karten',
    presetAllCardsDesc: 'Kein Ausschluss — der komplette Kartensatz ist im Draft.',
    presetCardCount: (n) => `${n} Karten`,
    presetAuto: 'Automatisch erkannt',
    presetAutoNote: 'Aus echten Spielen dieses offiziellen Modus erkannt — enthält die Karten der letzten 14 Tage und zieht nach, wenn Supercell den Pool ändert.',
    presetMissing: (n) => `${n} Karten des Presets kennt diese Seite nicht und werden übersprungen.`,
  },
  en: {
    title: 'Card pool',
    tabCards: 'Cards',
    tabPresets: 'Presets',
    searchPlaceholder: 'Search cards…',
    excludedInDraft: (excluded, inDraft) => `${excluded} excluded · ${inDraft} in the draft`,
    reset: 'Reset',
    editNote: 'Click a card to remove it from the draft — applies to every game mode in this lobby.',
    readOnlyNote: 'Only the host (or an admin) can change the card pool.',
    noneFound: 'No cards found.',
    presetsIntro: 'A preset sets the card pool to a fixed selection — every other card is excluded.',
    presetsEmpty: 'No presets available yet.',
    presetsLoading: 'Loading presets…',
    presetsError: 'Presets could not be loaded.',
    presetApply: 'Load',
    presetActive: 'Active',
    presetAllCards: 'All cards',
    presetAllCardsDesc: 'No exclusions — the complete card set is in the draft.',
    presetCardCount: (n) => `${n} cards`,
    presetAuto: 'Auto-detected',
    presetAutoNote: 'Detected from real games of this official mode — contains the cards seen in the last 14 days and follows along when Supercell changes the pool.',
    presetMissing: (n) => `${n} cards of this preset are unknown to this site and get skipped.`,
  },
};

// Presets-Tab: fertige Kartenpools laden. Quelle 'auto' = aus echten Battlelogs erkannter
// Kartenpool eines offiziellen Clash-Royale-Spezialmodus, 'admin' = selbst angelegt.
function PresetsTab({ excluded, canEdit, onApplyPreset, L }) {
  const [state, setState] = useState({ status: 'loading', presets: [] });

  useEffect(() => {
    let alive = true;
    fetch('/api/clash/presets')
      .then(r => r.json())
      .then(d => { if (alive) setState({ status: 'ready', presets: d.presets || [] }); })
      .catch(() => { if (alive) setState({ status: 'error', presets: [] }); });
    return () => { alive = false; };
  }, []);

  const validIds = useMemo(() => new Set(ALL_CARDS.map(c => c.id)), []);
  const excludedSet = new Set(excluded);
  const poolIds = ALL_CARDS.filter(c => !excludedSet.has(c.id)).map(c => c.id);
  const isActive = (cardIds) => {
    const known = cardIds.filter(id => validIds.has(id));
    return known.length === poolIds.length && known.every(id => !excludedSet.has(id));
  };

  if (state.status === 'loading') return <p className="text-white/40 text-sm text-center py-10">{L.presetsLoading}</p>;
  if (state.status === 'error') return <p className="text-red-400 text-sm text-center py-10">{L.presetsError}</p>;

  const entries = [
    {
      presetId: '__all__', name: L.presetAllCards, description: L.presetAllCardsDesc,
      cardIds: ALL_CARDS.map(c => c.id), source: 'builtin',
    },
    ...state.presets,
  ];

  return (
    <div className="space-y-3">
      <p className="text-white/30 text-xs">{L.presetsIntro}</p>
      {state.presets.length === 0 && <p className="text-white/30 text-xs italic">{L.presetsEmpty}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map(preset => {
          const known = preset.cardIds.filter(id => validIds.has(id));
          const missing = preset.cardIds.length - known.length;
          const active = isActive(preset.cardIds);
          return (
            <div key={preset.presetId} className={`panel p-4 flex flex-col gap-2.5 ${active ? 'border-violet-500/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{preset.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">{L.presetCardCount(known.length)}</p>
                </div>
                {preset.source === 'auto' && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-300 border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                    {L.presetAuto}
                  </span>
                )}
              </div>

              {preset.description && <p className="text-white/40 text-xs leading-relaxed">{preset.description}</p>}
              {preset.source === 'auto' && <p className="text-white/25 text-[11px] leading-relaxed">{L.presetAutoNote}</p>}
              {missing > 0 && <p className="text-amber-400/70 text-[11px]">{L.presetMissing(missing)}</p>}

              {/* Kartenvorschau — die ersten Karten des Pools. Bewusst nur <img> statt
                  CardTile: hier geht es um einen Streifen Miniaturen, nicht um Kacheln. */}
              <div className="flex flex-wrap gap-1">
                {known.slice(0, 14).map(id => (
                  <img key={id} src={`${CARD_CDN}${id}.png`} alt="" loading="lazy" decoding="async"
                    className="w-6 h-7 object-cover rounded-[3px]"
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                ))}
                {known.length > 14 && (
                  <span className="text-white/30 text-[10px] self-center ml-1">+{known.length - 14}</span>
                )}
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
        })}
      </div>
    </div>
  );
}

export default function CardExclusionModal({
  excluded, canEdit, onToggle, onReset, onSetExcluded, onClose, lang = 'de',
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('cards'); // 'cards' | 'presets'
  const L = I18N[lang] || I18N.de;
  const excludedSet = new Set(excluded);

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
            {canEdit && excluded.length > 0 && (
              <button onClick={onReset}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shrink-0">
                {L.reset}
              </button>
            )}
          </div>

          <p className="px-5 pt-3 text-white/30 text-xs shrink-0">{canEdit ? L.editNote : L.readOnlyNote}</p>

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
