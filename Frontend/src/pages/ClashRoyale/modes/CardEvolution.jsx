import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowUp, ArrowDown, Check, Crown, Clock, Lock, Shuffle } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';
import { WILDCARD_IMG, TOKEN_IMG } from '../data/wildcardTokenAssets';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';
const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const LOCK_COST = 3;
const SABOTAGE_COST = 3;

const EVO_I18N = {
  de: {
    loading: 'Lade Karten-Evolution…',
    finished: 'Evolution abgeschlossen!',
    you: 'Du',
    upgrade: 'Aufwerten',
    downgrade: 'Abwerten',
    maxRarity: 'Maximale Stufe erreicht',
    championLimit: 'Champion-Limit (2)',
    poolEmpty: 'Pool leer',
    notEnoughTokens: 'Nicht genug Tokens',
    chooseOne: 'Wähle eine der beiden Karten',
    wildcardOf: (r) => `${r}-Wildcard`,
    lockCard: 'Karte locken',
    locked: 'Gelockt',
    notEnoughTokensLock: 'Nicht genug Tokens zum Locken',
    sabotageHint: 'Klicke auf eine ungelockte Karte eines Gegners, um sie für 3 Tokens neu zu würfeln.',
    phaseRound1: 'Runde 1 · Karten wählen',
    phaseSabotage: 'Runde 2 · Sabotage',
    phaseRound3: 'Runde 3 · Karten wählen',
  },
  en: {
    loading: 'Loading Card Evolution…',
    finished: 'Evolution complete!',
    you: 'You',
    upgrade: 'Upgrade',
    downgrade: 'Downgrade',
    maxRarity: 'Max rarity reached',
    championLimit: 'Champion limit (2)',
    poolEmpty: 'Pool empty',
    notEnoughTokens: 'Not enough tokens',
    chooseOne: 'Choose one of the two cards',
    wildcardOf: (r) => `${r} wildcard`,
    lockCard: 'Lock card',
    locked: 'Locked',
    notEnoughTokensLock: 'Not enough tokens to lock',
    sabotageHint: "Click an opponent's unlocked card to reroll it for 3 tokens.",
    phaseRound1: 'Round 1 · Pick cards',
    phaseSabotage: 'Round 2 · Sabotage',
    phaseRound3: 'Round 3 · Pick cards',
  },
};

// Bewusst nur scale+opacity (kein 3D-Flip mehr) — leichtgewichtig und ruckelfrei, auch
// wenn mehrere Slots gleichzeitig aufblitzen (z.B. bei mehreren Spielern parallel).
const EVO_STYLE = `
@keyframes evoPop    { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes evoPulse  { 0%, 100% { border-color: #f59e0b55; } 50% { border-color: #f59e0bcc; } }
.evo-pop     { animation: evoPop .22s cubic-bezier(0.34, 1.35, 0.64, 1) both; }
.evo-pending { animation: evoPulse 1.4s ease-in-out infinite; }
`;

// Beide Enden der Kette rerollen statt zu blockieren (muss mit dem Backend übereinstimmen):
// Downgrade von Common → anderes Common; Upgrade von Champion → anderer Champion.
function nextRarity(rarity, direction) {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx === -1) return null;
  if (direction === 'up') return idx >= RARITY_ORDER.length - 1 ? RARITY_ORDER[idx] : RARITY_ORDER[idx + 1];
  return idx === 0 ? RARITY_ORDER[0] : RARITY_ORDER[idx - 1];
}
// Progressive Kosten pro Slot: jeder Klick auf DIESE Karte (up oder down) erhöht slot.pickCount —
// der nächste Klick auf denselben Slot kostet 1 Token mehr. Muss mit dem Backend übereinstimmen.
function actionCost(slot) {
  return (slot.pickCount || 0) + 1;
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name, rarity }) {
  return (
    <div className="relative w-full h-full" style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={`${CARD_CDN}${id}.png`} alt={name} className="w-full h-full object-cover"
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function SlotArt({ slot }) {
  if (slot.card) return <CardImg id={slot.card.id} name={slot.card.name} rarity={slot.card.rarity} />;
  const wc = WILDCARD_IMG[slot.rarity];
  return (
    <div className="relative w-full h-full flex items-center justify-center"
      style={{ background: (RARITY_COLOR[slot.rarity] || '#555') + '18' }}>
      {wc && <img src={wc} alt={slot.rarity} className="w-full h-full object-contain p-1.5" />}
    </div>
  );
}

function TokenBadge({ type, count }) {
  const img = TOKEN_IMG[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-sm border border-white/10 bg-white/[0.02]">
      {img && <img src={img} alt="" className="w-3.5 h-3.5 shrink-0" />}
      <span className="tabular-nums text-white">{count}</span>
    </span>
  );
}

// ── Volle Spieler-Reihe: alle 8 Karten nebeneinander, groß. Dient sowohl der reinen
// Zuschauer-Sicht (read-only) als auch — interaktiv geschaltet — der Sabotage-Phase, in der
// ein anderer Spieler auf ungelockte gegnerische Karten klicken kann, um sie zu rerollen.
function SpectatorPlayerRow({ player, flashing, t, interactive = false, canAct = false, onSlotClick }) {
  const champCount = player.slots.filter(s => s.card?.isChampion).length;
  return (
    <div className="rounded-md border border-white/10 bg-[#0f0f13] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/5 flex-wrap">
        <AvatarCircle id={player.avatar} color={player.color} size={28} />
        <span className="text-white font-bold text-sm truncate">{player.name}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <TokenBadge type="normal" count={player.tokens} />
          <span className="flex items-center gap-1 text-gray-500 text-[11px]">
            <Crown size={11} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} /> {champCount}/2
          </span>
        </div>
      </div>
      <div className="flex gap-2 p-3 flex-wrap">
        {player.slots.map((slot, si) => {
          const isPendingSlot = player.pending?.slotIdx === si;
          const isFlashing = flashing?.has(si);
          const showCostHint = interactive && !slot.locked;
          const clickable = showCostHint && canAct;
          return (
            <div key={si} onClick={() => clickable && onSlotClick(si)}
              title={slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
              className={`relative w-16 h-16 rounded-sm overflow-hidden border-2 ${RARITY_BORDER[slot.rarity] || 'border-white/10'} ${isPendingSlot ? 'evo-pending' : ''} ${clickable ? 'cursor-pointer hover:border-red-400/70' : ''}`}>
              <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
              {slot.card?.isChampion && (
                <span className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5">
                  <Crown size={9} className="text-cyan-400" />
                </span>
              )}
              {slot.locked && (
                <span className="absolute bottom-0.5 left-0.5 bg-amber-500/90 text-black rounded-[2px] p-0.5">
                  <Lock size={9} />
                </span>
              )}
              {showCostHint && (
                <span className={`absolute bottom-0.5 right-0.5 flex items-center gap-0.5 text-[9px] font-bold px-1 rounded-[2px] ${canAct ? 'bg-black/70 text-red-300' : 'bg-black/40 text-gray-600'}`}>
                  <Shuffle size={8} /> {SABOTAGE_COST}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Spieler-Sicht: Sidebar mit allen Decks (Mini-Ansicht, rein informativ) — analog zu
// den anderen Modi. Auswahl/Interaktion passiert nicht hier, sondern unten im Hauptbereich
// direkt an den eigenen 8 Karten.
function EvoSidebar({ players, myPlayerId, flashSlots, t }) {
  return (
    <div className="w-60 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {players.map(p => {
        const isMe = p.id === myPlayerId;
        const champCount = p.slots.filter(s => s.card?.isChampion).length;
        const flashing = flashSlots[p.id];
        return (
          <div key={p.id} className={`rounded-sm border p-3 ${isMe ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2.5 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={26} />
              <span className="text-white text-sm font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-cyan-500 font-bold shrink-0">{t.you}</span>}
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <TokenBadge type="normal" count={p.tokens} />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {p.slots.map((slot, si) => {
                const isFlashing = flashing?.has(si);
                return (
                  <div key={si} title={slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
                    className={`relative aspect-square rounded-sm overflow-hidden border ${RARITY_BORDER[slot.rarity] || 'border-white/10'}`}>
                    <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
                    {slot.locked && (
                      <span className="absolute bottom-0 right-0 bg-amber-500/90 text-black rounded-tl-[2px] p-[1px]">
                        <Lock size={7} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Crown size={11} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
              <span className="text-[10px] text-gray-500">{champCount}/2</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Eine eigene Karte: Pfeil hoch = Aufwerten, Pfeil runter = Abwerten, jeweils mit
// Tokenkosten-Zahl (progressiv, steigt mit jedem Klick auf DIESE Karte) — zieht dabei immer 2
// Kandidatenkarten, zwischen denen gewählt wird. Ein Klick auf die Karte selbst locked sie fix
// für 3 Tokens — danach dauerhaft eingefroren, auch für einen selbst.
function CardStageUnit({ me, slot, slotIdx, poolCounts, champCount, disabled, allowLock, onAction, onLock, isFlashing, t }) {
  function evalDir(direction) {
    const target = nextRarity(slot.rarity, direction);
    const cost = target ? actionCost(slot) : 0;
    // Limit gilt nur beim Erwerb eines NEUEN Champions — ein bereits vorhandener Champion
    // darf sich jederzeit in einen anderen umrollen, ohne die Gesamtzahl zu erhöhen.
    const becomesNewChampion = target === 'Champion' && slot.rarity !== 'Champion';
    let reason = null;
    if (!target) reason = t.maxRarity;
    else if (becomesNewChampion && champCount >= 2) reason = t.championLimit;
    else if ((poolCounts[target] || 0) < 2) reason = t.poolEmpty;
    else if (me.tokens < cost) reason = t.notEnoughTokens;
    return { target, cost, reason };
  }
  const isLocked = !!slot.locked;
  const up = isLocked ? {} : evalDir('up');
  const down = isLocked ? {} : evalDir('down');
  const canLock = !isLocked && !disabled && allowLock && me.tokens >= LOCK_COST;

  return (
    <div className="flex flex-col items-center gap-1.5 w-28">
      <button disabled={disabled || isLocked || !!up.reason} onClick={() => onAction(slotIdx, 'up')}
        title={isLocked ? t.locked : (up.reason || `${t.upgrade} — ${up.cost}`)}
        className={`flex items-center justify-center gap-1 w-full py-1.5 rounded-sm border transition-colors ${
          disabled || isLocked || up.reason ? 'border-white/5 text-gray-700 cursor-not-allowed' : 'border-green-500/30 text-green-400 hover:border-green-400/60 hover:bg-green-500/5 cursor-pointer'
        }`}>
        <ArrowUp size={16} />
        <span className="text-[10px] font-bold">{up.cost || '—'}</span>
      </button>

      <button type="button" disabled={!canLock} onClick={() => canLock && onLock(slotIdx)}
        title={isLocked ? t.locked : !allowLock ? undefined : (canLock ? `${t.lockCard} — ${LOCK_COST}` : t.notEnoughTokensLock)}
        className={`relative w-28 h-28 rounded-md overflow-hidden border-[3px] ${isLocked ? 'border-amber-400/70' : RARITY_BORDER[slot.rarity] || 'border-white/10'} ${canLock ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
        {slot.card?.isChampion && (
          <span className="absolute top-1 right-1 bg-black/60 rounded-[3px] p-0.5">
            <Crown size={12} className="text-cyan-400" />
          </span>
        )}
        {isLocked ? (
          <span className="absolute bottom-1 left-1 flex items-center gap-1 bg-amber-500/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm evo-pop">
            <Lock size={10} />
          </span>
        ) : allowLock ? (
          <span className={`absolute bottom-1 left-1 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${canLock ? 'bg-black/70 border-amber-400/40 text-amber-300' : 'bg-black/40 border-white/10 text-gray-600'}`}>
            <Lock size={10} /> {LOCK_COST}
          </span>
        ) : null}
      </button>
      <p className="text-white text-[11px] font-semibold text-center truncate w-full">
        {slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
      </p>

      <button disabled={disabled || isLocked || !!down.reason} onClick={() => onAction(slotIdx, 'down')}
        title={isLocked ? t.locked : (down.reason || `${t.downgrade} — ${down.cost}`)}
        className={`flex items-center justify-center gap-1 w-full py-1.5 rounded-sm border transition-colors ${
          disabled || isLocked || down.reason ? 'border-white/5 text-gray-700 cursor-not-allowed' : 'border-red-500/30 text-red-400 hover:border-red-400/60 hover:bg-red-500/5 cursor-pointer'
        }`}>
        <ArrowDown size={16} />
        <span className="text-[10px] font-bold">{down.cost || '—'}</span>
      </button>
    </div>
  );
}

// ── Eigenes Board: alle 8 eigenen Karten nebeneinander, groß, je mit eigenen Pfeilen.
function MyBoardStage({ me, poolCounts, allowLock, onAction, onLock, finished, flashing, t }) {
  const champCount = me.slots.filter(s => s.card?.isChampion).length;
  const disabled = !!me.pending || finished;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 py-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-wrap items-start justify-center gap-3 w-full max-w-[1200px] px-4">
        {me.slots.map((slot, si) => (
          <CardStageUnit key={si} me={me} slot={slot} slotIdx={si}
            poolCounts={poolCounts} champCount={champCount} disabled={disabled} allowLock={allowLock}
            onAction={onAction} onLock={onLock} isFlashing={flashing?.has(si)} t={t} />
        ))}
      </div>
      <TokenBadge type="normal" count={me.tokens} />
    </div>
  );
}

// ── Sabotage-Phase (Runde 2): Übersicht aller GEGNERISCHEN Decks. Ungelockte Karten sind
// klickbar und werden für 3 Tokens neu gewürfelt — die neue Karte kann jede beliebige Rarity
// annehmen, nicht nur die bisherige.
function SabotageStage({ players, myTokens, onSabotage, flashSlots, t }) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-center gap-3">
        <TokenBadge type="normal" count={myTokens} />
        <p className="text-white/50 text-xs">{t.sabotageHint}</p>
      </div>
      <div className="space-y-3 max-w-3xl mx-auto">
        {players.map(p => (
          <SpectatorPlayerRow key={p.id} player={p} flashing={flashSlots[p.id]} t={t}
            interactive canAct={myTokens >= SABOTAGE_COST} onSlotClick={(slotIdx) => onSabotage(p.id, slotIdx)} />
        ))}
      </div>
    </div>
  );
}

function PendingChoiceModal({ pending, onChoose, t }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#16161a] border border-amber-400/30 rounded-md p-6 max-w-md w-full mx-4 shadow-2xl">
        <p className="text-amber-300 text-xs font-bold uppercase tracking-widest text-center mb-4">{t.chooseOne}</p>
        <div className="flex items-center justify-center gap-4">
          {pending.candidates.map((c, i) => (
            <button key={i} onClick={() => onChoose(i)}
              className="w-28 rounded-sm overflow-hidden border-2 border-white/10 hover:border-cyan-400/60 transition-colors">
              <div className="w-28 h-28"><CardImg id={c.id} name={c.name} rarity={c.rarity} /></div>
              <p className="text-white text-[11px] font-semibold text-center py-1.5 px-1 truncate bg-[#0c0b12]">{c.name}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PHASE_LABEL_KEY = { round1: 'phaseRound1', sabotage: 'phaseSabotage', round3: 'phaseRound3' };

export default function CardEvolution({ evoState, myPlayerId, onAction, onResolvePending, onLock, onSabotage, lang = 'de' }) {
  const t = EVO_I18N[lang] || EVO_I18N.de;

  // Welche Slots haben sich seit dem letzten State-Update verändert? Löst pro Spieler einen
  // kurzen Pop aus — greift sowohl bei eigenen Auf-/Abwertungen als auch bei der
  // automatischen Spielende-Auflösung übrig gebliebener Wildcards.
  const prevCardsRef = useRef({});
  const flashTimerRef = useRef(null);
  const [flashSlots, setFlashSlots] = useState({});

  useEffect(() => {
    if (!evoState) return;
    const prev = prevCardsRef.current;
    const nextSnapshot = {};
    const newFlash = {};
    evoState.players.forEach(p => {
      const ids = p.slots.map(s => s.card?.id || null);
      nextSnapshot[p.id] = ids;
      const prevIds = prev[p.id];
      if (prevIds) {
        const changed = new Set();
        ids.forEach((id, i) => { if (id !== prevIds[i]) changed.add(i); });
        if (changed.size) newFlash[p.id] = changed;
      }
    });
    prevCardsRef.current = nextSnapshot;
    if (Object.keys(newFlash).length) {
      setFlashSlots(newFlash);
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashSlots({}), 700);
    }
  }, [evoState]);

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  if (!evoState) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const me = evoState.players.find(p => p.id === myPlayerId) || null;
  const amSpectator = !me;
  const isSabotagePhase = evoState.phase === 'sabotage';
  const phaseLabel = t[PHASE_LABEL_KEY[evoState.phase]] || '';

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      <style>{EVO_STYLE}</style>

      {evoState.finished && (
        <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
          <Check size={16} className="text-green-400 shrink-0" />
          <p className="text-green-300 font-bold text-sm">{t.finished}</p>
        </div>
      )}

      {/* Runde/Phase + Pool-Übersicht — wie viele Karten je Rarity noch verfügbar sind */}
      <div className="shrink-0 border-b border-white/5 bg-[#0a0a0d] px-4 py-3 flex items-center gap-2.5 flex-wrap justify-center relative">
        {phaseLabel && !evoState.finished && (
          <span className="sm:absolute sm:left-4 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
            {phaseLabel}
          </span>
        )}
        <Sparkles size={14} className="text-cyan-400 shrink-0" />
        {RARITY_ORDER.map(r => (
          <span key={r} className="text-[11px] font-semibold px-2 py-1 rounded-sm border"
            style={{ borderColor: (RARITY_COLOR[r] || '#888') + '40', color: RARITY_COLOR[r], background: (RARITY_COLOR[r] || '#888') + '0c' }}>
            {r}: {evoState.poolCounts?.[r] ?? 0}
          </span>
        ))}
        {evoState.timerSeconds > 0 && !evoState.finished && (
          <span className={`sm:absolute sm:right-4 flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-sm border tabular-nums ${
            evoState.timerRemaining <= 10 ? 'border-red-500/40 text-red-400 bg-red-500/5' : 'border-white/10 text-white/70 bg-white/[0.02]'
          }`}>
            <Clock size={12} />
            {Math.max(0, evoState.timerRemaining ?? evoState.timerSeconds)}s
          </span>
        )}
      </div>

      {amSpectator ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="space-y-3 max-w-3xl mx-auto">
            {evoState.players.map(p => (
              <SpectatorPlayerRow key={p.id} player={p} flashing={flashSlots[p.id]} t={t} />
            ))}
          </div>
        </div>
      ) : isSabotagePhase ? (
        <SabotageStage players={evoState.players.filter(p => p.id !== myPlayerId)} myTokens={me.tokens}
          onSabotage={(targetPlayerId, slotIdx) => !evoState.finished && onSabotage(targetPlayerId, slotIdx)}
          flashSlots={flashSlots} t={t} />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <EvoSidebar players={evoState.players} myPlayerId={myPlayerId} flashSlots={flashSlots} t={t} />
          <div className="flex-1 overflow-hidden">
            <MyBoardStage me={me}
              poolCounts={evoState.poolCounts || {}} allowLock={evoState.phase === 'round1'}
              onAction={(slotIdx, direction) => !me.pending && !evoState.finished && onAction(slotIdx, direction)}
              onLock={(slotIdx) => !me.pending && !evoState.finished && onLock(slotIdx)}
              finished={evoState.finished} flashing={flashSlots[me.id]} t={t} />
          </div>
        </div>
      )}

      {me?.pending && (
        <PendingChoiceModal pending={me.pending} onChoose={(i) => onResolvePending(i)} t={t} />
      )}
    </div>
  );
}
