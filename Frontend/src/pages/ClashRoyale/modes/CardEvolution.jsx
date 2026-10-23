import React, { useState, useEffect, useRef } from 'react';
import { sparkBurst, ringPulse, floatText, bigBanner, shake, flash, stamp } from '../ui/juice';
import { playSound } from '../ui/sound';
import CardFace from '../ui/CardFace';
import { CrCheck, CrDowngrade, CrLock, CrRandom, CrStar, CrUpgrade } from '../ui/CrIcons';
import { RARITY_COLOR } from '../data/cards';
import ModeShell from './ModeShell';
import { WILDCARD_IMG, TOKEN_IMG } from '../data/wildcardTokenAssets';
import { CARD_CROP } from './cardCrop';
import { GameHeader, GameFooter, PlayerPanel } from './GameChrome';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import { avatarUrl } from '../components/avatars';

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
    sabotagedBanner: 'SABOTIERT!',
    notEnoughTokensLock: 'Nicht genug Tokens zum Locken',
    sabotageHint: 'Klicke auf eine ungelockte Karte eines Gegners, um sie für 3 Tokens neu zu würfeln.',
    yourTokens: 'Deine Tokens',
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
    sabotagedBanner: 'SABOTAGED!',
    notEnoughTokensLock: 'Not enough tokens to lock',
    sabotageHint: "Click an opponent's unlocked card to reroll it for 3 tokens.",
    yourTokens: 'Your tokens',
    phaseRound1: 'Round 1 · Pick cards',
    phaseSabotage: 'Round 2 · Sabotage',
    phaseRound3: 'Round 3 · Pick cards',
  },
  es: {
    loading: 'Cargando Evolución de Cartas…',
    finished: '¡Evolución completada!',
    you: 'Tú',
    upgrade: 'Mejorar',
    downgrade: 'Degradar',
    maxRarity: 'Nivel máximo alcanzado',
    championLimit: 'Límite de campeones (2)',
    poolEmpty: 'Pool vacío',
    notEnoughTokens: 'No hay suficientes fichas',
    chooseOne: 'Elige una de las dos cartas',
    wildcardOf: (r) => `Comodín ${r}`,
    lockCard: 'Bloquear carta',
    locked: 'Bloqueada',
    sabotagedBanner: '¡SABOTEADA!',
    notEnoughTokensLock: 'No hay suficientes fichas para bloquear',
    sabotageHint: 'Haz clic en una carta sin bloquear de un rival para rerollearla por 3 fichas.',
    yourTokens: 'Tus fichas',
    phaseRound1: 'Ronda 1 · Elegir cartas',
    phaseSabotage: 'Ronda 2 · Sabotaje',
    phaseRound3: 'Ronda 3 · Elegir cartas',
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
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 cr-avatar-pick"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name }) {
  return (
    // bg-[#0d0d14]: blickdichter Untergrund für Ladezeit/Fehlerfall — die Karte sitzt jetzt
    // auf dem Diamant-Karo statt auf einer einfarbigen Fläche.
    <div className="relative w-full h-full bg-[#0d0d14]">
      <CardFace id={id} alt={name} />
    </div>
  );
}

function SlotArt({ slot }) {
  if (slot.card) return <CardImg id={slot.card.id} name={slot.card.name} rarity={slot.card.rarity} />;
  const wc = WILDCARD_IMG[slot.rarity];
  return (
    // Deutlich kräftigerer Rarity-Ton als vorher (18 statt aa in Hex-Alpha): leere Slots
    // liegen jetzt auf dem Diamant-Karo (siehe GameChrome/GameSurface) statt auf einer
    // einfarbigen Fläche — bei 9% Deckkraft hätte das Muster die Kachel dominiert.
    <div className="relative w-full h-full flex items-center justify-center"
      style={{ background: (RARITY_COLOR[slot.rarity] || '#555') + 'aa' }}>
      {wc && <img src={wc} alt={slot.rarity} className="w-full h-full object-contain p-1.5" />}
    </div>
  );
}

// Kleines Abzeichen — für fremde Spieler in der Seitenleiste, wo es nur ein Nebenwert ist.
function TokenBadge({ type, count }) {
  const img = TOKEN_IMG[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg bg-white/[0.06]">
      {img && <img src={img} alt="" className="w-3.5 h-3.5 shrink-0" />}
      <span className="tabular-nums text-white">{count}</span>
    </span>
  );
}

// Der EIGENE Tokenstand. In diesem Modus kostet jede Aktion Tokens — das ist die Zahl,
// auf die man vor jedem Klick schaut. Vorher stand sie als 11px-Abzeichen unter den
// Karten und ging neben acht großen Kartenbildern schlicht unter.
function OwnTokens({ count, t }) {
  const img = TOKEN_IMG.normal;
  const low = count <= 3;
  return (
    <div className="flex items-center gap-4">
      {img && <img src={img} alt="" className="w-11 h-11 shrink-0" />}
      <div className="leading-none">
        <p className="text-white/35 text-[11px] font-semibold uppercase tracking-wider mb-1.5">{t.yourTokens}</p>
        <p className={`font-display text-4xl font-bold tabular-nums ${low ? 'text-red-300' : 'text-white'}`}>
          {count}
        </p>
      </div>
    </div>
  );
}

// ── Volle Spieler-Reihe: alle 8 Karten nebeneinander, groß. Dient sowohl der reinen
// Zuschauer-Sicht (read-only) als auch — interaktiv geschaltet — der Sabotage-Phase, in der
// ein anderer Spieler auf ungelockte gegnerische Karten klicken kann, um sie zu rerollen.
function SpectatorPlayerRow({ player, flashing, t, interactive = false, canAct = false, onSlotClick }) {
  const champCount = player.slots.filter(s => s.card?.isChampion).length;
  return (
    <div className="cr-game-card p-4 space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <AvatarCircle id={player.avatar} color={player.color} size={28} />
        <span className="text-white font-semibold text-sm truncate">{player.name}</span>
        <div className="flex items-center gap-2.5 ml-auto shrink-0">
          <TokenBadge type="normal" count={player.tokens} />
          <span className="flex items-center gap-1 text-white/30 text-[11px]">
            <img src={crownIcon} alt="" width={14} height={12} className={champCount > 0 ? '' : 'opacity-15 grayscale'} /> {champCount}/2
          </span>
        </div>
      </div>
      <div className="flex gap-2.5 flex-wrap">
        {player.slots.map((slot, si) => {
          const isPendingSlot = player.pending?.slotIdx === si;
          const isFlashing = flashing?.has(si);
          const showCostHint = interactive && !slot.locked;
          const clickable = showCostHint && canAct;
          return (
            // Sabotierbarkeit als INNERER Ring statt als Rahmen: ein border würde das
            // Artwork beim Überfahren um 2px stauchen und die ganze Reihe verspringen lassen.
            <div key={si} data-evo-slot={`${player.id}:${si}`} onClick={() => clickable && onSlotClick(si)}
              title={slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden ${isPendingSlot ? 'evo-pending' : ''} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-red-400/70' : ''}`}>
              <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
              {slot.card?.isChampion && (
                <span className="absolute top-1 right-1 bg-black/55 rounded-md p-1">
                  <img src={crownIcon} alt="" width={13} height={11} />
                </span>
              )}
              {slot.locked && (
                <span className="absolute bottom-1 left-1 bg-amber-400 text-black rounded-md p-1">
                  <CrLock size={14} />
                </span>
              )}
              {showCostHint && (
                <span className={`absolute bottom-1 right-1 flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${canAct ? 'bg-black/70 text-red-300' : 'bg-black/50 text-white/25'}`}>
                  <CrRandom size={14} /> {SABOTAGE_COST}
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
    // Rahmen (Hintergrund, Rand, Scrollen) macht ModeShell — hier nur der Inhalt.
    <>
      {players.map(p => {
        const isMe = p.id === myPlayerId;
        const champCount = p.slots.filter(s => s.card?.isChampion).length;
        const flashing = flashSlots[p.id];
        return (
          <PlayerPanel key={p.id} isMe={isMe}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarCircle id={p.avatar} color={p.color} size={28} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                <TokenBadge type="normal" count={p.tokens} />
              </div>
            }>
            <div className="grid grid-cols-4 gap-1">
              {p.slots.map((slot, si) => {
                const isFlashing = flashing?.has(si);
                return (
                  <div key={si} title={slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
                    className="relative aspect-[4/5] rounded-md overflow-hidden bg-white/[0.03]">
                    <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
                    {slot.locked && (
                      <span className="absolute bottom-0 right-0 bg-amber-400 text-black rounded-tl-md p-[2px]">
                        <CrLock size={14} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <img src={crownIcon} alt="" width={14} height={12} className={champCount > 0 ? '' : 'opacity-15 grayscale'} />
              <span className="text-white/30 text-[11px]">{champCount}/2 Champions</span>
            </div>
          </PlayerPanel>
        );
      })}
    </>
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
    // Breite ist flexibel (basis-0 + grow): auf schmalen Fenstern schrumpfen alle acht Karten
    // gemeinsam, statt umzubrechen. Erst unter ~5,5rem pro Karte wird tatsächlich umgebrochen.
    // landscape: verkleinert nur die Mindestbreite — im Querformat (Handy/Tablet, aber unter
    // lg noch nicht am Desktop) passen so eher alle 8 Karten in eine Reihe statt umzubrechen.
    // Die Tasten bleiben durch min-h-10 an den Buttons trotzdem groß genug zum Antippen.
    //
    // Auf-/Ab-Knopf, Karte und Name lagen vorher als drei lose Teile übereinander — jetzt
    // EIN gemeinsam umrandeter Rahmen für die ganze Spalte, wie eine Gerätekonsole statt
    // dreier einzelner Aufkleber.
    <div className="flex flex-col basis-0 grow min-w-[6rem] landscape:min-w-[4.5rem] lg:min-w-[6rem] max-w-[10rem]
      rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      style={{ border: '3px solid var(--cr-arcade-ink)' }}>
      <button disabled={disabled || isLocked || !!up.reason} onClick={() => onAction(slotIdx, 'up')}
        title={isLocked ? t.locked : (up.reason || `${t.upgrade} — ${up.cost}`)}
        className={`flex items-center justify-center gap-1.5 w-full min-h-10 py-2 transition-colors ${
          disabled || isLocked || up.reason
            ? 'bg-black/50 text-white/20 cursor-not-allowed'
            : 'bg-green-600/40 text-green-300 hover:bg-green-600/55 cursor-pointer'
        }`}>
        <CrUpgrade size={23} />
        <span className="text-xs font-bold">{up.cost || '—'}</span>
      </button>

      <button type="button" disabled={!canLock} onClick={() => canLock && onLock(slotIdx)}
        title={isLocked ? t.locked : !allowLock ? undefined : (canLock ? `${t.lockCard} — ${LOCK_COST}` : t.notEnoughTokensLock)}
        // "Gesperrt" bleibt am Gold erkennbar, jetzt als innerer Ring statt als
        // Rahmen — zusammen mit dem Schloss-Abzeichen unten links.
        className={`relative w-full aspect-[4/5] ${isLocked ? 'ring-[3px] ring-inset ring-amber-400/70' : ''} ${canLock ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className={`w-full h-full ${isFlashing ? 'evo-pop' : ''}`}><SlotArt slot={slot} /></div>
        {slot.card?.isChampion && (
          <span className="absolute top-2 right-2 bg-black/55 backdrop-blur-sm rounded-lg p-1">
            <img src={crownIcon} alt="" width={15} height={13} />
          </span>
        )}
        {isLocked ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-amber-400 text-black text-[10px] font-bold px-1.5 py-1 rounded-md evo-pop">
            <CrLock size={15} />
          </span>
        ) : allowLock ? (
          <span className={`absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-1.5 py-1 rounded-md ${canLock ? 'bg-black/70 text-amber-300' : 'bg-black/50 text-white/25'}`}>
            <CrLock size={15} /> {LOCK_COST}
          </span>
        ) : null}
      </button>
      <p className="text-white text-[13px] font-semibold text-center truncate w-full px-2 py-1.5 bg-[#111d2c]">
        {slot.card ? slot.card.name : t.wildcardOf(slot.rarity)}
      </p>

      <button disabled={disabled || isLocked || !!down.reason} onClick={() => onAction(slotIdx, 'down')}
        title={isLocked ? t.locked : (down.reason || `${t.downgrade} — ${down.cost}`)}
        className={`flex items-center justify-center gap-1.5 w-full min-h-10 py-2 transition-colors ${
          disabled || isLocked || down.reason
            ? 'bg-black/50 text-white/20 cursor-not-allowed'
            : 'bg-red-600/40 text-red-300 hover:bg-red-600/55 cursor-pointer'
        }`}>
        <CrDowngrade size={23} />
        <span className="text-xs font-bold">{down.cost || '—'}</span>
      </button>
    </div>
  );
}

// ── Eigenes Board: alle 8 eigenen Karten nebeneinander, groß, je mit eigenen Pfeilen.
function MyBoardStage({ me, poolCounts, allowLock, onAction, onLock, finished, flashing, t }) {
  const champCount = me.slots.filter(s => s.card?.isChampion).length;
  const disabled = !!me.pending || finished;

  return (
    // Zentriert wird im INNEREN Kasten (min-h-full), nicht im Scroll-Container: Passen die
    // acht Karten in zwei Reihen nicht mehr in die Höhe, wächst der Kasten einfach mit und
    // alles bleibt erreichbar. Mit justify-center direkt am Scroll-Container ragte die erste
    // Reihe stattdessen nach oben aus dem sichtbaren Bereich heraus — der "Aufwerten"-Pfeil
    // war dort abgeschnitten und ließ sich auch nicht heranscrollen.
    // Der Tokenstand steht NICHT mehr im Scrollbereich unter den Karten, sondern als
    // feste Fußleiste: In diesem Modus kostet jede Aktion Tokens, und man schaut vor
    // jedem Klick darauf. Zwischen acht großen Kartenbildern ging er vorher unter und
    // war je nach Fensterhöhe sogar weggescrollt.
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="min-h-full flex flex-col items-center justify-center py-6">
          <div className="flex flex-wrap items-start justify-center gap-4 w-full max-w-[1400px] px-4">
            {me.slots.map((slot, si) => (
              <div key={si} data-evo-slot={`${me.id}:${si}`} className="contents">
              <CardStageUnit me={me} slot={slot} slotIdx={si}
                poolCounts={poolCounts} champCount={champCount} disabled={disabled} allowLock={allowLock}
                onAction={onAction} onLock={onLock} isFlashing={flashing?.has(si)} t={t} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <GameFooter>
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <OwnTokens count={me.tokens} t={t} />
        </div>
      </GameFooter>
    </div>
  );
}

// ── Sabotage-Phase (Runde 2): Übersicht aller GEGNERISCHEN Decks. Ungelockte Karten sind
// klickbar und werden für 3 Tokens neu gewürfelt — die neue Karte kann jede beliebige Rarity
// annehmen, nicht nur die bisherige.
function SabotageStage({ players, myTokens, onSabotage, flashSlots, t }) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-5xl mx-auto mb-5 flex items-center justify-center gap-3">
        <TokenBadge type="normal" count={myTokens} />
        <p className="text-white/40 text-xs">{t.sabotageHint}</p>
      </div>
      <div className="space-y-4 max-w-5xl mx-auto">
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
      <div className="bg-[#16161a] rounded-2xl p-4 sm:p-6 max-w-lg w-full mx-4 shadow-2xl">
        <p className="text-amber-300 text-xs font-semibold uppercase tracking-widest text-center mb-5">{t.chooseOne}</p>
        {/* w-28/h-28 auf dem Handy, sonst reichen zwei w-36-Karten samt Zwischenraum auf
            einem ~360px-Bildschirm nicht (328px Modal-Innenbreite gegen 308px Kartenbedarf). */}
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {pending.candidates.map((c, i) => (
            <button key={i} onClick={() => onChoose(i)}
              className="group w-28 sm:w-36 rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.5)] relative">
              <div className="w-28 h-28 sm:w-36 sm:h-36"><CardImg id={c.id} name={c.name} /></div>
              <p className="text-white text-[13px] font-semibold text-center py-2 px-1 truncate bg-black/40">{c.name}</p>
              <span className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ boxShadow: 'inset 0 0 0 2px #22d3ee' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PHASE_LABEL_KEY = { round1: 'phaseRound1', sabotage: 'phaseSabotage', round3: 'phaseRound3' };

const isSabotage = (phase) => phase === 'sabotage';

export default function CardEvolution({ evoState, myPlayerId, onAction, onResolvePending, onLock, onSabotage, lang = 'de' }) {
  const t = EVO_I18N[lang] || EVO_I18N.de;

  // Welche Slots haben sich seit dem letzten State-Update verändert? Löst pro Spieler einen
  // kurzen Pop aus — greift sowohl bei eigenen Auf-/Abwertungen als auch bei der
  // automatischen Spielende-Auflösung übrig gebliebener Wildcards.
  const prevCardsRef = useRef({});
  const prevSlotsRef = useRef(null);
  // Phasenwechsel (Runde 1 → Sabotage → Runde 3) als großes Banner
  const prevPhaseRef = useRef(evoState?.phase);
  useEffect(() => {
    const ph = evoState?.phase;
    if (ph && prevPhaseRef.current && ph !== prevPhaseRef.current && !evoState.finished) {
      bigBanner(t[PHASE_LABEL_KEY[ph]] || ph, { color: isSabotage(ph) ? '#f87171' : '#22d3ee' });
      playSound('start');
    }
    prevPhaseRef.current = ph;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoState?.phase]);
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
    // Inszenierung je geänderter Karte: Richtung aus der Seltenheit von vorher/nachher
    const prevFull = prevSlotsRef.current;
    prevSlotsRef.current = Object.fromEntries(evoState.players.map(p => [p.id, p.slots.map(sl => ({ rarity: sl.card?.rarity || sl.rarity, locked: !!sl.locked }))]));
    if (prevFull) {
      evoState.players.forEach(p => {
        p.slots.forEach((sl, i) => {
          const before = prevFull[p.id]?.[i];
          if (!before) return;
          let el = document.querySelector(`[data-evo-slot="${p.id}:${i}"]`);
          // eigene Bühne: Wrapper mit display:contents hat keine Fläche → erstes Kind messen
          if (el && !el.getBoundingClientRect().width) el = el.firstElementChild;
          if (!el || el.getBoundingClientRect().width === 0) return;
          const after = sl.card?.rarity || sl.rarity;
          if (sl.locked && !before.locked) {
            stamp(el, t.locked.toUpperCase(), { color: '#22d3ee' });
            playSound('land');
            return;
          }
          const delta = RARITY_ORDER.indexOf(after) - RARITY_ORDER.indexOf(before.rarity);
          const changedCard = newFlash[p.id]?.has(i);
          if (!changedCard && delta === 0) return;
          const color = RARITY_COLOR[after] || '#ffffff';
          if (delta > 0) {
            flash(el, { color });
            sparkBurst(el, { color, count: after === 'Champion' || after === 'Legendary' ? 30 : 18, spread: 110 });
            ringPulse(el, { color });
            floatText(el, after, { color, size: 22 });
            if (p.id === myPlayerId) playSound('win');
          } else if (delta < 0) {
            shake(el, { intensity: 7 });
            sparkBurst(el, { colors: ['#ef4444', '#64748b', '#1f2937'], count: 16, spread: 90 });
            floatText(el, isSabotage(evoState.phase) && p.id === myPlayerId ? t.sabotagedBanner : after, { color: '#f87171', size: 22 });
            if (p.id === myPlayerId) playSound('error');
          } else {
            ringPulse(el, { color });
          }
        });
      });
    }
    if (Object.keys(newFlash).length) {
      setFlashSlots(newFlash);
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashSlots({}), 700);
    }
  }, [evoState, myPlayerId, t]);

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
    <div className="h-full flex flex-col overflow-hidden select-none cr-arcade-bg">
      <style>{EVO_STYLE}</style>

      {/* Kopfzeile: die Phase ist hier der Anker — sie bestimmt, was man tun darf.
          Der Kartenpool je Seltenheit steht als leise Zeile darunter. */}
      <GameHeader
        label={evoState.finished ? t.finished : phaseLabel} value=""
        badge={evoState.finished ? <CrCheck size={26} className="shrink-0" /> : undefined}
        timerRemaining={evoState.timerSeconds > 0 && !evoState.finished
          ? Math.max(0, evoState.timerRemaining ?? evoState.timerSeconds) : undefined}
        timerUrgent={evoState.timerRemaining <= 10}
      />

      {/* Kartenpool: Seltenheitsfarbe als Punkt statt als Rahmen um jeden Wert —
          acht umrandete Kästchen nebeneinander waren die unruhigste Stelle des Modus.
          Eigener blickdichter Untergrund: sitzt direkt unter der Kopfzeile auf dem
          Diamant-Karo der Spielfläche. */}
      <div className="shrink-0 px-4 sm:px-8 py-2.5 flex items-center gap-4 flex-wrap bg-[#10223c] border-b-2 border-[var(--cr-panel-edge)]">
        <CrStar size={19} className="text-cyan-400 shrink-0" />
        {RARITY_ORDER.map(r => (
          <span key={r} className="flex items-center gap-1.5 text-[11px] text-white/40">
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: RARITY_COLOR[r] || '#888' }} />
            {r}
            <span className="text-white/70 font-semibold tabular-nums">{evoState.poolCounts?.[r] ?? 0}</span>
          </span>
        ))}
      </div>

      {amSpectator ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="space-y-4 max-w-5xl mx-auto">
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
        // Nur dieser Zweig hat eine Seitenleiste — Zuschauer- und Sabotage-Ansicht
        // nutzen die volle Breite. Deshalb sitzt ModeShell hier innen und nicht außen.
        <div className="flex-1 min-h-0 overflow-hidden">
          <ModeShell
            sidebar={<EvoSidebar players={evoState.players} myPlayerId={myPlayerId} flashSlots={flashSlots} t={t} />}
            playerCount={evoState.players.length}
            lang={lang}>
            <div className="flex-1 overflow-hidden min-h-0">
              <MyBoardStage me={me}
                poolCounts={evoState.poolCounts || {}} allowLock={evoState.phase === 'round1'}
                onAction={(slotIdx, direction) => !me.pending && !evoState.finished && onAction(slotIdx, direction)}
                onLock={(slotIdx) => !me.pending && !evoState.finished && onLock(slotIdx)}
                finished={evoState.finished} flashing={flashSlots[me.id]} t={t} />
            </div>
          </ModeShell>
        </div>
      )}

      {me?.pending && (
        <PendingChoiceModal pending={me.pending} onChoose={(i) => onResolvePending(i)} t={t} />
      )}
    </div>
  );
}
