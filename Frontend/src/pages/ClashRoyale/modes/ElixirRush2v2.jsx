// Elixir Rush 2v2 — Team-Variante von ElixirRush.jsx (2 bis 4 Teams à 2): jeder Spieler hat
// seinen eigenen, unabhängigen Marktplatz, aber beide Team-Mitglieder teilen sich EINE
// Elixierleiste (Tempo und Kapazität stellt der Host ein). Markt-Kachel (MarketSlot), Arena-Boden
// (MarketBoard) und die Kauf-/Wechsel-Animationen stammen aus ElixirRush.jsx.

import React, { useState, useEffect } from 'react';
import CardFace from '../ui/CardFace';
import { useServerClock } from '../ui/serverClock';
import { CrCheck, CrStopwatch, CrTv } from '../ui/CrIcons';
import ModeShell from './ModeShell';
import { GameHeader, ProgressHairline, GameSurface, GameFooter, PlayerPanel, DeckGrid } from './GameChrome';
import ElixirBar from '../ui/ElixirBar';
import { MarketSlot, MarketBoard, RUSH_STYLE } from './ElixirRush';
import { teamStyle, teamChipClass } from '../lobby/teamStyle';
import { avatarUrl } from '../components/avatars';

const ACCENT = '#e879f9';


function CardImg({ id, name }) {
  return (
    <div className="relative w-full h-full">
      <CardFace id={id} alt={name} />
    </div>
  );
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

const I18N = {
  de: {
    loading: 'Lade Elixir Rush 2v2…',
    cardsLabel: 'Karten',
    done: 'Fertig',
    yourMarket: 'Markt',
    noPartner: 'Dein Partner ist noch nicht da.',
    partnerShopping: 'Dein Partner kauft gerade auf seinem eigenen Marktplatz ein.',
    teamElixir: (letter) => `Team-${letter}-Elixier`,
    grabCards: 'Schnapp dir Karten von deinem eigenen Marktplatz — dein Partner hat seinen eigenen!',
    yourDeckFull: 'Dein Deck ist voll!',
    spectatorLive: 'Zuschauer — du siehst alle Marktplätze live.',
    allDecksFull: 'Alle Decks sind voll — Draft abgeschlossen!',
    decksDone: (done, total) => `${done}/${total} Decks fertig`,
    startingSoon: (s) => `In ${s}s öffnen die Märkte.`,
    getReady: 'Alle bereit machen…',
    // Diese vier braucht MarketSlot (aus ElixirRush.jsx importiert) direkt — dieselben
    // Texte wie im Solo-Modus, nur hier gepflegt, weil die beiden I18N-Objekte getrennt sind.
    costElixir: (name, cost) => `${name} — ${cost} Elixier`,
    empty: 'Leer',
    yourCard: 'Deine Karte!',
    autoBuy: 'Auto-Kauf',
    championLimit: 'Champion-Limit',
    notPossible: 'Nicht möglich',
  },
  en: {
    loading: 'Loading Elixir Rush 2v2…',
    cardsLabel: 'Cards',
    done: 'Done',
    yourMarket: 'Market',
    noPartner: "Your partner hasn't joined yet.",
    partnerShopping: 'Your partner is shopping their own marketplace.',
    teamElixir: (letter) => `Team ${letter} elixir`,
    grabCards: 'Grab cards from your own marketplace — your partner has their own!',
    yourDeckFull: 'Your deck is full!',
    spectatorLive: 'Spectator — you see every marketplace live.',
    allDecksFull: 'All decks are full — draft complete!',
    decksDone: (done, total) => `${done}/${total} decks done`,
    startingSoon: (s) => `Markets open in ${s}s.`,
    getReady: 'Everyone get ready…',
    costElixir: (name, cost) => `${name} — ${cost} elixir`,
    empty: 'Empty',
    yourCard: 'Your card!',
    autoBuy: 'Auto-buy',
    championLimit: 'Champion limit',
    notPossible: 'Not possible',
  },
  es: {
    loading: 'Cargando Elixir Rush 2v2…',
    cardsLabel: 'Cartas',
    done: 'Listo',
    yourMarket: 'Mercado',
    noPartner: 'Tu compañero todavía no se ha unido.',
    partnerShopping: 'Tu compañero está comprando en su propio mercado.',
    teamElixir: (letter) => `Elixir del equipo ${letter}`,
    grabCards: '¡Consigue cartas de tu propio mercado — tu compañero tiene el suyo!',
    yourDeckFull: '¡Tu mazo está completo!',
    spectatorLive: 'Espectador — ves todos los mercados en directo.',
    allDecksFull: '¡Todos los mazos están completos — draft terminado!',
    decksDone: (done, total) => `${done}/${total} mazos listos`,
    startingSoon: (s) => `Los mercados abren en ${s}s.`,
    getReady: 'Todos listos…',
    costElixir: (name, cost) => `${name} — ${cost} de elixir`,
    empty: 'Vacío',
    yourCard: '¡Tu carta!',
    autoBuy: 'Compra automática',
    championLimit: 'Límite de campeones',
    notPossible: 'No es posible',
  },
};

function useNow(intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Ein Markt-Raster (eigen oder Partner) samt Titelzeile. */
function MarketGrid({ title, teamLetter, market, myPlayerId, canInteract, myElixir, myChampCount, denied, onBuy, state, clientOffset, now, t, lang }) {
  return (
    <div>
      <MarketBoard label={title}
        badge={teamLetter ? <span className={`${teamChipClass(teamLetter)} w-5 h-5 text-xs`}>{teamLetter}</span> : null}>
        {(market || []).map((slot, i) => (
          <MarketSlot key={i}
            slot={slot}
            myPlayerId={myPlayerId}
            canInteract={canInteract}
            myElixir={myElixir}
            myChampCount={myChampCount}
            denied={denied && denied.slotIdx === i ? denied : null}
            onBuy={(seq) => onBuy(i, seq)}
            cardLifetimeMs={state.cardLifetimeMs}
            clientOffset={clientOffset}
            now={now}
            showTimer={state.showTimer !== false}
            t={t}
            lang={lang}
          />
        ))}
      </MarketBoard>
    </div>
  );
}

export default function ElixirRush2v2({ rushState, myPlayerId, onBuy, denied, lang = 'de' }) {
  const t = I18N[lang] || I18N.de;
  const now = useNow(100);
  const state = rushState;
  const clock = useServerClock(state);

  if (!state) {
    return <div className="h-full flex items-center justify-center"><p className="text-gray-500 text-sm">{t.loading}</p></div>;
  }

  // Geglätteter Uhrenabgleich (ui/serverClock.js) statt Versatz je Nachricht — sonst zuckten
  // Elixier, Ablaufbalken und Countdown bei jeder Nachricht um die Laufzeit-Schwankung.
  const clientOffset = clock.offset();
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId);
  const amSpectator = !me || (me.isSpectator ?? false);
  const myTeam = me?.teamId || null;
  const partner = myTeam ? players.find(p => p.teamId === myTeam && p.id !== myPlayerId) : null;

  const teamElixirOf = (letter) => (letter
    ? Math.min(state.maxElixir, (state.teamElixir?.[letter] ?? 0) + Math.max(0, (now - clientOffset) - state.serverNow) / state.regenMs)
    : 0);
  const myElixir = !amSpectator && myTeam ? teamElixirOf(myTeam) : 0;

  const myDeckCount = me?.deck?.length || 0;
  const myDeckFull = myDeckCount >= state.deckSize;
  const myChampCount = (me?.deck || []).filter(c => c.isChampion).length;

  const countdownUntilClient = state.countdownUntil ? state.countdownUntil + clientOffset : null;
  const inCountdown = !!(countdownUntilClient && countdownUntilClient > now);
  const countdownRemaining = inCountdown ? Math.max(1, Math.ceil((countdownUntilClient - now) / 1000)) : 0;

  const canInteract = !amSpectator && !myDeckFull && !state.finished && !inCountdown && !!myTeam;

  const activePlayers = players.filter(p => !p.isSpectator);
  const doneCount = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;

  const teamIds = state.teamIds || ['A', 'B'];
  const teamMembers = (letter) => activePlayers
    .filter(p => p.teamId === letter)
    .sort((a, b) => (a.teamSlot || 1) - (b.teamSlot || 1));

  const sidebar = (
    <>
      {teamIds.map(letter => (
        teamMembers(letter).length > 0 && (
          // Ein gemeinsames Kästchen pro Team in seiner Teamfarbe (lobby/teamStyle.js) — hält
          // Elixierbalken + beide Mitglieder sichtbar als EIN Team zusammen, wie in der Lobby.
          <div key={letter} className={`rounded-lg border p-2.5 space-y-2 ${teamStyle(letter).panel}`}>
            <div className="flex items-center gap-2 px-0.5">
              <span className={`${teamChipClass(letter)} w-5 h-5 text-xs`}>{letter}</span>
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${teamStyle(letter).text}`}>{t.teamElixir(letter)}</span>
            </div>
            <ElixirBar value={teamElixirOf(letter)} max={state.maxElixir} size="sm" />
            {teamMembers(letter).map(p => {
              const isMe = p.id === myPlayerId;
              const done = (p.deck || []).length >= state.deckSize;
              const champCount = (p.deck || []).filter(c => c.isChampion).length;
              return (
                <PlayerPanel key={p.id} isMe={isMe}
                  header={
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarCircle id={p.avatar} color={p.color} size={26} />
                      <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                      {done
                        ? <CrCheck size={19} className="text-green-400 shrink-0" title={t.done} />
                        : <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/{state.deckSize}</span>}
                    </div>
                  }>
                  <DeckGrid deck={p.deck || []} size={state.deckSize} renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
                  <span className="text-white/30 text-[11px]">{champCount}/2 Champions</span>
                </PlayerPanel>
              );
            })}
          </div>
        )
      ))}
    </>
  );

  return (
    <ModeShell sidebar={sidebar} playerCount={activePlayers.length} lang={lang}>
      <style>{RUSH_STYLE}</style>
      <GameSurface>
        <GameHeader
          label={t.cardsLabel}
          value={amSpectator ? '–' : myDeckCount}
          total={amSpectator ? undefined : state.deckSize}
          badge={
            state.finished ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <CrCheck size={21} /> {t.allDecksFull}
              </span>
            ) : inCountdown ? (
              <span className="flex items-center gap-1.5 text-fuchsia-300 text-sm font-semibold">
                <CrStopwatch size={19} /> {t.startingSoon(countdownRemaining)}
              </span>
            ) : amSpectator ? (
              <span className="flex items-center gap-1.5 text-white/35 text-sm">
                <CrTv size={19} /> {t.spectatorLive}
              </span>
            ) : myDeckFull ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <CrCheck size={21} /> {t.yourDeckFull}
              </span>
            ) : (
              <span className="text-fuchsia-300 text-sm font-semibold">{t.grabCards}</span>
            )
          }
          meta={t.decksDone(doneCount, activePlayers.length)}
        />
        <ProgressHairline pct={amSpectator ? 0 : (myDeckCount / state.deckSize) * 100} accent={ACCENT} />

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6">
          <div className="min-h-full flex flex-col items-center justify-center gap-8">
          {!amSpectator && <div className="relative">
            <MarketGrid
              title={t.yourMarket} teamLetter={myTeam}
              market={myTeam ? state.markets[myPlayerId] : null}
              myPlayerId={myPlayerId} canInteract={canInteract}
              myElixir={myElixir} myChampCount={myChampCount}
              denied={denied} onBuy={onBuy}
              state={state} clientOffset={clientOffset} now={now} t={t} lang={lang}
            />
            {inCountdown && (
              <div className="absolute -inset-4 z-20 flex items-center justify-center bg-[#0b0b12]">
                <div className="text-center">
                  <p className="text-fuchsia-300 text-sm font-semibold uppercase tracking-widest mb-3">{t.getReady}</p>
                  <p className="text-white font-display font-bold text-6xl tabular-nums leading-none">{countdownRemaining}</p>
                </div>
              </div>
            )}
          </div>}

          {amSpectator ? (
            // Zuschauer sehen jeden Marktplatz, nach Teams sortiert. Spieler bekommen den Markt
            // ihres Partners bewusst NICHT zu sehen (mehr Spannung, weniger Ablenkung).
            teamIds.flatMap(letter => teamMembers(letter)).map(p => (
              <MarketGrid key={p.id}
                title={p.name} teamLetter={p.teamId}
                market={state.markets[p.id]}
                myPlayerId={myPlayerId} canInteract={false}
                myElixir={0} myChampCount={0}
                denied={null} onBuy={() => {}}
                state={state} clientOffset={clientOffset} now={now} t={t} lang={lang}
              />
            ))
          ) : myTeam && (
            <p className="text-white/35 text-xs text-center">
              {partner ? t.partnerShopping : t.noPartner}
            </p>
          )}
          </div>
        </div>

        <GameFooter>
          <div className="max-w-4xl mx-auto">
            {!amSpectator && !myDeckFull && myTeam ? (
              <ElixirBar value={myElixir} max={state.maxElixir} size="lg" />
            ) : null}
          </div>
        </GameFooter>
      </GameSurface>
    </ModeShell>
  );
}
