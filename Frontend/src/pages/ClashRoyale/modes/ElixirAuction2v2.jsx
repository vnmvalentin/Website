// Elixir Auction 2v2 — Team-Variante von ElixirAuction.jsx (2 bis 4 Teams à 2).
//
// Pro Runde liegen mehrere Karten pro Seite aus (cardsPerSide, Host-einstellbar). Ablauf:
//   Hinweise: alle eigenen Karten groß nebeneinander, unter jeder die 4 Merkmale — 2 wählen und
//             pro Karte an den Partner schicken.
//   Bieten:   dieselbe Anordnung, aber verdeckt (Unbekannt-Artwork) mit den 2 Merkmalen des
//             Partners als ausgeschriebener Text darunter. Wie in der Solo-Auktion EIN Gebot pro
//             Runde: Betrag über den Regler in der Fußzeile, Klick auf eine Karte bietet ihn.
//   Auflösung: pro Seite die Karten mit den Geboten darauf, darunter je Team eine Zeile:
//             worauf geboten wurde, mit welchen Hinweisen, und welche Karte es geworden ist.
// Decks bleiben persönlich, nur der Elixier-Pool ist pro Team geteilt.

import React from 'react';
import CardFace from '../ui/CardFace';
import { CrCheck, CrCrown } from '../ui/CrIcons';
import ModeShell from './ModeShell';
import { GameHeader, ProgressHairline, GameFooter, PlayerPanel } from './GameChrome';
import ElixirBar, { ElixirAmount } from '../ui/ElixirBar';
import { avatarUrl } from '../components/avatars';
import { useAuction2v2View } from './auction2v2/useAuction2v2View';
import { hintTagLabel, hintTagCategory } from './auction2v2/hintLabels';
import { teamStyle, teamChipClass } from '../lobby/teamStyle';
import unknownCardImg from '../../../assets/clashRoyale/UnknownCard.png';
import elixirIcon from '../../../assets/clashRoyale/ui/elixir_1.png';

const I18N = {
  de: {
    loading: 'Lade…',
    noTeam: 'Du bist in keinem Team — dieser Modus ist nur mit Team spielbar.',
    roundLabel: 'Runde',
    phaseHint: 'Hinweise geben',
    phaseBid: 'Blind bieten',
    phaseReveal: 'Auflösung',
    cardLabel: (n) => `Karte ${n}`,
    hintProgress: (done, total) => `${done}/${total} Hinweise gesendet`,
    pickOne: 'Biete auf eine Karte',
    bidPlaced: (n, amount) => `Geboten: Karte ${n} · ${amount}`,
    hintIntro: (name) => `Wähle unter jeder Karte 2 Merkmale für ${name}.`,
    hintIntroNoPartner: 'Wähle unter jeder Karte 2 Merkmale für deinen Partner.',
    send: 'Senden',
    sent: 'Gesendet',
    pickTwo: (n) => `${n}/2 gewählt`,
    hintSentWaiting: 'Alle Hinweise gesendet — warte auf die anderen…',
    bidIntro: (name) => `Du siehst die Karten nicht — nur, was ${name} dir verraten hat.`,
    bidIntroNoPartner: 'Du siehst die Karten nicht — nur, was dein Partner dir verraten hat.',
    noHints: 'Keine Hinweise bekommen',
    bidFor: (n) => `Für ${n} bieten`,
    bidDone: (n) => `${n} geboten`,
    setBidHint: 'Gebot festlegen, dann Karte wählen',
    elixirAvailable: 'Team-Elixier frei',
    bidSentWaiting: 'Gebot abgegeben — warte auf die anderen…',
    sideX: 'Seite X',
    sideY: 'Seite Y',
    sideNote: (desc, bid) => `${desc} hat beschrieben, ${bid} hat geboten`,
    slot1: 'Spieler 1',
    slot2: 'Spieler 2',
    result: 'Ergebnis',
    noBid: 'Kein Gebot',
    nobodyBid: 'Niemand hat geboten',
    bidOn: (n, amount) => `Karte ${n} · ${amount}`,
    won: 'Gewonnen',
    consolation: 'Trostkarte',
    bonus: 'Bonuskarte',
    championLost: 'Champion-Limit — Bonuskarte',
    nextRound: 'Nächste Runde startet gleich…',
    finished: 'Spiel beendet',
    teamElixir: 'Team-Elixier',
  },
  en: {
    loading: 'Loading…',
    noTeam: 'You are not on a team — this mode only plays in teams.',
    roundLabel: 'Round',
    phaseHint: 'Give hints',
    phaseBid: 'Blind bidding',
    phaseReveal: 'Reveal',
    cardLabel: (n) => `Card ${n}`,
    hintProgress: (done, total) => `${done}/${total} hints sent`,
    pickOne: 'Bid on one card',
    bidPlaced: (n, amount) => `Bid placed: card ${n} · ${amount}`,
    hintIntro: (name) => `Pick 2 traits under each card for ${name}.`,
    hintIntroNoPartner: 'Pick 2 traits under each card for your partner.',
    send: 'Send',
    sent: 'Sent',
    pickTwo: (n) => `${n}/2 picked`,
    hintSentWaiting: 'All hints sent — waiting for the others…',
    bidIntro: (name) => `You can't see the cards — only what ${name} told you.`,
    bidIntroNoPartner: "You can't see the cards — only what your partner told you.",
    noHints: 'No hints received',
    bidFor: (n) => `Bid ${n}`,
    bidDone: (n) => `${n} bid`,
    setBidHint: 'Set your bid, then pick a card',
    elixirAvailable: 'team elixir left',
    bidSentWaiting: 'Bid placed — waiting for the others…',
    sideX: 'Side X',
    sideY: 'Side Y',
    sideNote: (desc, bid) => `${desc} described, ${bid} bid`,
    slot1: 'Player 1',
    slot2: 'Player 2',
    result: 'Result',
    noBid: 'No bid',
    nobodyBid: 'Nobody bid',
    bidOn: (n, amount) => `Card ${n} · ${amount}`,
    won: 'Won',
    consolation: 'Consolation card',
    bonus: 'Bonus card',
    championLost: 'Champion limit — bonus card',
    nextRound: 'Next round starting soon…',
    finished: 'Game over',
    teamElixir: 'Team elixir',
  },
  es: {
    loading: 'Cargando…',
    noTeam: 'No estás en ningún equipo — este modo solo se juega en equipos.',
    roundLabel: 'Ronda',
    phaseHint: 'Dar pistas',
    phaseBid: 'Puja a ciegas',
    phaseReveal: 'Revelación',
    cardLabel: (n) => `Carta ${n}`,
    hintProgress: (done, total) => `${done}/${total} pistas enviadas`,
    pickOne: 'Puja por una carta',
    bidPlaced: (n, amount) => `Puja hecha: carta ${n} · ${amount}`,
    hintIntro: (name) => `Elige 2 características bajo cada carta para ${name}.`,
    hintIntroNoPartner: 'Elige 2 características bajo cada carta para tu compañero.',
    send: 'Enviar',
    sent: 'Enviado',
    pickTwo: (n) => `${n}/2 elegidas`,
    hintSentWaiting: 'Todas las pistas enviadas — esperando a los demás…',
    bidIntro: (name) => `No ves las cartas — solo lo que ${name} te ha contado.`,
    bidIntroNoPartner: 'No ves las cartas — solo lo que tu compañero te ha contado.',
    noHints: 'No has recibido pistas',
    bidFor: (n) => `Pujar ${n}`,
    bidDone: (n) => `${n} pujado`,
    setBidHint: 'Fija tu puja y luego elige una carta',
    elixirAvailable: 'elixir del equipo libre',
    bidSentWaiting: 'Puja hecha — esperando a los demás…',
    sideX: 'Lado X',
    sideY: 'Lado Y',
    sideNote: (desc, bid) => `${desc} describió, ${bid} pujó`,
    slot1: 'Jugador 1',
    slot2: 'Jugador 2',
    result: 'Resultado',
    noBid: 'Sin puja',
    nobodyBid: 'Nadie pujó',
    bidOn: (n, amount) => `Carta ${n} · ${amount}`,
    won: 'Ganada',
    consolation: 'Carta de consolación',
    bonus: 'Carta de bonificación',
    championLost: 'Límite de campeones — carta de bonificación',
    nextRound: 'La próxima ronda empieza pronto…',
    finished: 'Partida terminada',
    teamElixir: 'Elixir del equipo',
  },
};

const CARD_W = 210;

const Elixir = ({ size = 14 }) => (
  <img src={elixirIcon} alt="" style={{ height: size, width: 'auto' }} className="inline-block align-middle shrink-0" />
);

function Avatar({ id, color, size = 24 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 cr-avatar-pick"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${(color || '#888')}66` }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

const CardArt = ({ card, className = '', style }) => (
  <div className={`relative overflow-hidden ${className}`} style={style}>
    <CardFace id={card.id} alt={card.name} />
  </div>
);

/** Gemeinsamer Rahmen jeder Karten-Kachel (Hinweis, Gebot, Auflösung) — gleiche Breite und Kante. */
function CardColumn({ children, highlight = false, className = '', ...rest }) {
  return (
    <div {...rest}
      className={`rounded-2xl overflow-hidden flex flex-col shadow-[0_10px_30px_rgba(2,8,20,0.5)] ${className}`}
      style={{
        width: CARD_W, maxWidth: '44vw',
        border: `3px solid ${highlight ? '#c026d3' : 'var(--cr-panel-edge)'}`,
        background: 'linear-gradient(to bottom, #1c3860, #10223c)',
      }}>
      {children}
    </div>
  );
}

/** Merkmal als ausgeschriebene Zeile: Kategorie klein links, Wert rechts. */
function TraitLine({ tagId, lang, active = false, muted = false }) {
  return (
    <span className={`flex flex-wrap items-baseline justify-between gap-x-2 w-full text-left ${muted ? 'opacity-40' : ''}`}>
      <span className={`text-[10px] uppercase tracking-wide ${active ? 'text-fuchsia-100/80' : 'text-white/45'}`}>{hintTagCategory(tagId, lang)}</span>
      <span className={`ml-auto min-w-0 break-words text-[13px] font-semibold text-right ${active ? 'text-white' : 'text-white/85'}`}>{hintTagLabel(tagId, lang)}</span>
    </span>
  );
}

export default function ElixirAuction2v2(props) {
  const { lang = 'de', myPlayerId, onSendHint, onBid } = props;
  const t = I18N[lang] || I18N.de;
  const v = useAuction2v2View({ ...props, myPlayerId, onSendHint, onBid });

  if (!v.ready) {
    return <div className="h-full flex items-center justify-center"><p className="text-white/40 text-sm">{t.loading}</p></div>;
  }

  const nameOf = (id) => v.players.find(p => p.id === id)?.name || '?';

  // ── Seitenleiste: Teams mit Elixier und den beiden Decks ──────────────────
  const sidebar = v.teamIds.map(letter => {
    const style = teamStyle(letter);
    const members = v.players
      .filter(p => p.teamId === letter && !p.isSpectator)
      .sort((a, b) => (a.teamSlot || 1) - (b.teamSlot || 1));
    return (
      <PlayerPanel key={letter} isMe={letter === v.myTeam}
        header={
          <div className="flex items-center gap-2">
            <span className={`${teamChipClass(letter)} w-6 h-6 text-sm`}>{letter}</span>
            <span className={`font-cr text-sm ${style.text}`}>Team {letter}</span>
          </div>
        }>
        <ElixirBar value={v.teamElixir[letter] ?? 0} max={v.teamPool} size="sm" />
        {members.map(p => (
          <div key={p.id} className="space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar id={p.avatar} color={p.color} size={20} />
              <span className={`text-[12px] font-semibold truncate flex-1 ${p.id === myPlayerId ? 'text-[var(--cr-arcade-gold)]' : 'text-white/85'}`}>{p.name}</span>
              <span className="text-white/30 text-[10px] tabular-nums">{p.deck?.length || 0}/8</span>
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {Array.from({ length: 8 }, (_, ci) => {
                const c = p.deck?.[ci];
                return (
                  <div key={ci} className="aspect-[4/5] rounded-[3px] overflow-hidden bg-[#081426]" style={{ border: '1px solid rgba(0,0,0,0.5)' }}>
                    {c && <CardArt card={c} className="w-full h-full" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </PlayerPanel>
    );
  });

  const phaseLabel = v.isReveal ? t.phaseReveal : v.phase === 'hint' ? t.phaseHint : t.phaseBid;
  const meta = v.isReveal ? null
    : v.phase === 'hint' ? t.hintProgress(v.hintDoneCount, v.cardsPerSide)
      : v.myBid ? t.bidPlaced(v.myBid.cardIndex + 1, v.myBid.amount) : t.pickOne;

  const header = (
    <>
      <GameHeader
        label={t.roundLabel} value={v.round} total={v.maxRounds}
        badge={<span className="text-fuchsia-200 text-sm font-cr">{phaseLabel}</span>}
        meta={meta}
        timerRemaining={!v.isReveal ? v.timerRemaining : undefined}
        timerUrgent={v.timerUrgent}
      />
      {!v.isReveal && <ProgressHairline pct={v.timerPct} accent="#e879f9" urgent={v.timerUrgent} />}
    </>
  );

  const shell = (body, footer = null) => (
    <ModeShell sidebar={sidebar} playerCount={v.players.filter(p => p.teamId && !p.isSpectator).length} width="lg:w-60" lang={lang}>
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 cr-arcade-bg">
        {header}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 py-6">{body}</div>
        {footer}
      </div>
    </ModeShell>
  );

  // ── Auflösung ────────────────────────────────────────────────────────────
  if (v.isReveal) {
    const { cardsX = [], cardsY = [], resultsX, resultsY, hints = {} } = v.state;
    // Wer welche Seite beschrieben hat: X beschreibt Slot 1, Y beschreibt Slot 2 jedes Teams
    const describerOf = (letter, side) => v.players.find(p => p.teamId === letter && (p.teamSlot === 2) === (side === 'Y'));

    const renderSide = (side, cards, res) => {
      const results = res?.results || [];
      const winners = res?.winners || [];
      return (
        <div className="w-full max-w-5xl space-y-3">
          <div className="text-center">
            <p className="font-cr text-white text-lg">{side === 'X' ? t.sideX : t.sideY}</p>
            <p className="text-white/45 text-xs">{side === 'X' ? t.sideNote(t.slot1, t.slot2) : t.sideNote(t.slot2, t.slot1)}</p>
          </div>

          {/* Karten mit den Geboten, die auf ihnen lagen */}
          <div className="flex flex-wrap gap-3 justify-center items-start">
            {cards.map((card, i) => {
              const on = results.filter(r => r.cardIndex === i).sort((a, b) => b.amount - a.amount);
              return (
                <div key={`${side}${i}`} className="cr-flip-in rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    width: 150, animationDelay: `${i * 0.08}s`,
                    border: `3px solid ${winners[i] ? 'var(--cr-arcade-gold)' : 'var(--cr-panel-edge)'}`,
                    background: 'linear-gradient(to bottom, #1c3860, #10223c)',
                  }}>
                  <div className="px-1.5 pt-1.5"><CardArt card={card} style={{ aspectRatio: '4/5' }} /></div>
                  <p className="text-white text-sm font-cr text-center truncate px-1.5 pt-1">{card.name}</p>
                  <div className="px-1.5 pb-1.5 pt-1 space-y-1 min-h-[28px]">
                    {on.length ? on.map(r => (
                      <div key={r.team} className="flex items-center gap-1.5 rounded-md bg-black/25 px-1.5 py-0.5">
                        <span className={`${teamChipClass(r.team)} w-4 h-4 text-[10px]`}>{r.team}</span>
                        <span className="flex items-center gap-0.5 text-white text-xs font-semibold tabular-nums"><Elixir size={11} />{r.amount}</span>
                        {winners[i] === r.playerId && <CrCrown size={14} className="ml-auto" />}
                      </div>
                    )) : <p className="text-white/35 text-[11px] text-center py-0.5">{t.nobodyBid}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ergebnis je Team: worauf geboten, welche Hinweise, was bekommen */}
          <div className="cr-arcade-panel overflow-hidden">
            {results.map((r, idx) => {
              const describer = describerOf(r.team, side);
              const teamHints = r.cardIndex >= 0 && describer ? (hints[describer.id]?.[r.cardIndex] || []) : [];
              const label = r.won ? (r.isBonus ? t.championLost : t.won) : r.isBonus ? t.bonus : t.consolation;
              return (
                <div key={r.team} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${idx > 0 ? 'border-t border-white/10' : ''}`}>
                  <span className={`${teamChipClass(r.team)} w-6 h-6 text-sm shrink-0`}>{r.team}</span>
                  <span className="text-white text-sm font-semibold w-24 truncate">{nameOf(r.playerId)}</span>
                  <span className="text-white/70 text-xs w-24 shrink-0 tabular-nums">
                    {r.cardIndex >= 0 ? t.bidOn(r.cardIndex + 1, r.amount) : t.noBid}
                  </span>
                  <span className="flex flex-wrap gap-1 flex-1 min-w-[8rem]">
                    {teamHints.map(id => (
                      <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-white/70">{hintTagLabel(id, lang)}</span>
                    ))}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className={`text-xs font-semibold ${r.won && !r.isBonus ? 'text-[var(--cr-arcade-gold)]' : 'text-white/50'}`}>{label}</span>
                    {r.got && (
                      <span className="w-9 rounded overflow-hidden" title={r.got.name}>
                        <CardArt card={r.got} style={{ aspectRatio: '4/5' }} />
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return shell(
      <div className="flex flex-col items-center gap-8">
        {renderSide('X', cardsX, resultsX)}
        {renderSide('Y', cardsY, resultsY)}
        <p className="text-white/40 text-xs">{v.state.finished ? t.finished : t.nextRound}</p>
      </div>
    );
  }

  if (!v.myRole) {
    return shell(<p className="text-white/50 text-sm text-center mt-10">{t.noTeam}</p>);
  }

  const partnerName = v.partner?.name;

  // ── Hinweis-Phase: alle Karten groß, Merkmale direkt darunter ─────────────
  if (v.phase === 'hint') {
    const { myCards = [], myTagsByCard = [] } = v.state;
    return shell(
      <div className="flex flex-col items-center gap-5">
        <p className="text-white/70 text-sm text-center">{partnerName ? t.hintIntro(partnerName) : t.hintIntroNoPartner}</p>
        <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-start">
          {myCards.map((card, i) => {
            const sent = v.mySentHints[i];
            const chosen = sent || v.selectedByCard[i] || [];
            return (
              <CardColumn key={`${v.round}-${i}`} highlight={!sent && chosen.length === 2} className="cr-flip-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="relative px-2 pt-2">
                  <CardArt card={card} style={{ aspectRatio: '4/5' }} />
                  {sent && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold px-1.5 py-0.5">
                      <CrCheck size={14} /> {t.sent}
                    </span>
                  )}
                </div>
                <p className="text-white text-base font-cr text-center truncate px-2 pt-1.5">{card.name}</p>
                <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5">
                  {(myTagsByCard[i] || []).map(tagId => {
                    const active = chosen.includes(tagId);
                    return (
                      <button key={tagId} type="button" disabled={!!sent} onClick={() => v.toggleTag(i, tagId)}
                        aria-pressed={active}
                        className={`rounded-lg px-2.5 py-1.5 border transition-colors ${
                          active
                            ? 'bg-fuchsia-600 border-fuchsia-300'
                            : 'bg-black/30 border-white/10 hover:bg-black/50 disabled:hover:bg-black/30'
                        } disabled:cursor-default`}>
                        <TraitLine tagId={tagId} lang={lang} active={active} muted={!!sent && !active} />
                      </button>
                    );
                  })}
                  {!sent && (
                    <button type="button" onClick={() => v.sendHint(i)} disabled={chosen.length !== 2}
                      className="cr-arcade-btn cr-arcade-btn--blue h-10 mt-1 text-sm font-cr disabled:opacity-40 disabled:cursor-not-allowed">
                      {chosen.length === 2 ? t.send : t.pickTwo(chosen.length)}
                    </button>
                  )}
                </div>
              </CardColumn>
            );
          })}
        </div>
        {v.hintDoneCount >= v.cardsPerSide && <p className="text-white/50 text-sm text-center">{t.hintSentWaiting}</p>}
      </div>
    );
  }

  // ── Gebot-Phase: verdeckte Karten mit den Hinweisen als Text ──────────────
  const { partnerHintsByCard = [] } = v.state;
  const allBid = !!v.myBid;
  const footer = (
    <GameFooter>
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-white/55 text-xs">{allBid ? t.bidSentWaiting : t.setBidHint}</span>
          {!allBid && (
            <span className="cr-elixir-pill text-2xl !px-3 !py-1">
              <Elixir size={26} />
              <span className="tabular-nums">{v.bidAmount}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <ElixirAmount value={v.myAvailable} size={48} />
            <span className="text-white/30 text-[10px] uppercase tracking-wide">{t.elixirAvailable}</span>
          </div>
          {!allBid && (
            <>
              <button type="button" onClick={() => v.setBidAmount(x => Math.max(0, Math.min(v.myAvailable, x) - 5))}
                className="cr-arcade-btn cr-arcade-btn--blue w-11 h-11 !p-0 shrink-0 text-lg font-black">−</button>
              <input type="range" min={0} max={v.myAvailable} value={v.bidAmount}
                onChange={e => v.setBidAmount(Number(e.target.value))}
                className="cr-elixir-slider flex-1"
                aria-label={t.setBidHint}
                style={{ '--cr-slider-fill': `${v.myAvailable ? (v.bidAmount / v.myAvailable) * 100 : 0}%` }} />
              <button type="button" onClick={() => v.setBidAmount(x => Math.min(v.myAvailable, x + 5))}
                className="cr-arcade-btn cr-arcade-btn--blue w-11 h-11 !p-0 shrink-0 text-lg font-black">+</button>
            </>
          )}
        </div>
      </div>
    </GameFooter>
  );

  return shell(
    <div className="flex flex-col items-center gap-5">
      <p className="text-white/70 text-sm text-center">{partnerName ? t.bidIntro(partnerName) : t.bidIntroNoPartner}</p>
      <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-start">
        {Array.from({ length: v.cardsPerSide }, (_, i) => i).map(i => {
          const mine = v.myBid?.cardIndex === i;
          const done = !!v.myBid;
          const hints = partnerHintsByCard[i] || [];
          return (
            <button key={`${v.round}-${i}`} type="button" disabled={done} onClick={() => v.placeBid(i)}
              className={`group text-left cr-flip-in ${done ? 'cursor-default' : 'cursor-pointer cr-card-hover'} ${done && !mine ? 'opacity-50' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}>
              <CardColumn highlight={mine}>
                <div className="relative px-2 pt-2">
                  <img src={unknownCardImg} alt="" draggable={false} className="w-full object-contain" style={{ aspectRatio: '4/5' }} />
                  {!done && (
                    <span className="absolute inset-2 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ boxShadow: 'inset 0 0 0 2px rgba(232,121,249,0.9)' }} />
                  )}
                </div>
                <p className="text-white/60 text-xs uppercase tracking-wider text-center pt-1.5">{t.cardLabel(i + 1)}</p>
                <div className="px-2 pt-1 pb-1.5 flex flex-col gap-1.5">
                  {hints.length
                    ? hints.map(id => (
                      <span key={id} className="rounded-lg px-2.5 py-1.5 bg-black/30 border border-fuchsia-400/30">
                        <TraitLine tagId={id} lang={lang} />
                      </span>
                    ))
                    : <span className="text-white/35 text-xs text-center py-2">{t.noHints}</span>}
                </div>
                <div className="px-2.5 pb-2.5 pt-0.5 h-8 flex items-center justify-center">
                  {mine ? (
                    <span className="cr-elixir-pill text-sm cr-win-pop"><CrCheck size={16} /> <Elixir size={15} /> {v.myBid.amount}</span>
                  ) : done ? null : (
                    <span className="flex items-center gap-1 text-white/70 text-xs font-semibold group-hover:text-fuchsia-200 transition-colors">
                      {t.bidFor(v.bidAmount)} <Elixir size={15} />
                    </span>
                  )}
                </div>
              </CardColumn>
            </button>
          );
        })}
      </div>
    </div>,
    footer
  );
}
