// Elixir Auction 2v2 — Duo-Variante von ElixirAuction.jsx.
//
// Pro Runde liegen mehrere Karten pro Seite aus (cardsPerSide, Host-einstellbar). Ablauf:
// Hinweis-Phase (du siehst deine N Karten als Reihe, klickst eine an, 4 Merkmals-Chips
// erscheinen, wählst 2 für deinen Partner, weiter zur nächsten Karte) → Gebot-Phase (du
// siehst pro Karte nur die 2 Hinweise deines Partners zur ANDEREN Seite und bietest blind
// aus dem Team-Pool, eine Karte nach der anderen) → Auflösung (alle Karten, alle Gebote,
// wer gewinnt). Decks bleiben persönlich, nur der Elixier-Pool ist geteilt.

import React from 'react';
import { Check } from 'lucide-react';
import CardTile from '../ui/CardTile';
import { useAuction2v2View } from './auction2v2/useAuction2v2View';
import { hintTagLabel } from './auction2v2/hintLabels';

const I18N = {
  de: {
    loading: 'Lade...',
    noTeam: 'Du bist in keinem Team — dieser Modus ist nur für Team A/B spielbar.',
    round: (r, max) => `Runde ${r}/${max}`,
    cardLabel: (n) => `Karte ${n}`,
    hintProgress: (done, total) => `${done}/${total} Hinweise gesendet`,
    bidProgress: (done, total) => `${done}/${total} Gebote abgegeben`,
    pickHint: 'Wähle 2 Merkmale für deinen Partner',
    sendHint: 'Hinweis senden',
    hintSentWaiting: 'Alle Hinweise gesendet — warte auf die anderen…',
    blindBidNote: (card) => `Blindes Gebot auf die ${card}-Karten — du siehst sie nicht, nur die Hinweise deines Partners.`,
    partnerHints: 'Hinweise deines Partners',
    teamPool: 'Team-Elixier',
    yourBid: 'Dein Gebot',
    placeBid: 'Bieten',
    bidSentWaiting: 'Alle Gebote abgegeben — warte auf das andere Team…',
    revealTitle: 'Auflösung',
    cardXLabel: 'Seite X',
    cardYLabel: 'Seite Y',
    wonBy: (name) => `${name} gewinnt`,
    championLost: 'Champion-Limit erreicht — Trostkarte statt Karte',
    consolationFor: (name) => `Trostkarte für ${name}`,
    bidsLabel: (a, b) => `Team A ${a} · Team B ${b}`,
    nextRound: 'Nächste Runde startet gleich…',
    finished: 'Spiel beendet',
  },
  en: {
    loading: 'Loading…',
    noTeam: 'You are not on a team — this mode only plays with team A/B.',
    round: (r, max) => `Round ${r}/${max}`,
    cardLabel: (n) => `Card ${n}`,
    hintProgress: (done, total) => `${done}/${total} hints sent`,
    bidProgress: (done, total) => `${done}/${total} bids placed`,
    pickHint: 'Pick 2 traits for your partner',
    sendHint: 'Send hint',
    hintSentWaiting: 'All hints sent — waiting for the others…',
    blindBidNote: (card) => `Blind bid on the ${card} cards — you don't see them, only your partner's hints.`,
    partnerHints: "Your partner's hints",
    teamPool: 'Team elixir',
    yourBid: 'Your bid',
    placeBid: 'Bid',
    bidSentWaiting: 'All bids placed — waiting for the other team…',
    revealTitle: 'Reveal',
    cardXLabel: 'Side X',
    cardYLabel: 'Side Y',
    wonBy: (name) => `${name} wins`,
    championLost: 'Champion limit reached — consolation card instead',
    consolationFor: (name) => `Consolation card for ${name}`,
    bidsLabel: (a, b) => `Team A ${a} · Team B ${b}`,
    nextRound: 'Next round starting soon…',
    finished: 'Game over',
  },
  es: {
    loading: 'Cargando…',
    noTeam: 'No estás en ningún equipo — este modo solo se juega con equipo A/B.',
    round: (r, max) => `Ronda ${r}/${max}`,
    cardLabel: (n) => `Carta ${n}`,
    hintProgress: (done, total) => `${done}/${total} pistas enviadas`,
    bidProgress: (done, total) => `${done}/${total} pujas hechas`,
    pickHint: 'Elige 2 características para tu compañero',
    sendHint: 'Enviar pista',
    hintSentWaiting: 'Todas las pistas enviadas — esperando a los demás…',
    blindBidNote: (card) => `Puja a ciegas por las cartas ${card} — no las ves, solo las pistas de tu compañero.`,
    partnerHints: 'Pistas de tu compañero',
    teamPool: 'Elixir del equipo',
    yourBid: 'Tu puja',
    placeBid: 'Pujar',
    bidSentWaiting: 'Todas las pujas hechas — esperando al otro equipo…',
    revealTitle: 'Revelación',
    cardXLabel: 'Lado X',
    cardYLabel: 'Lado Y',
    wonBy: (name) => `${name} gana`,
    championLost: 'Límite de campeones alcanzado — carta de consolación en su lugar',
    consolationFor: (name) => `Carta de consolación para ${name}`,
    bidsLabel: (a, b) => `Equipo A ${a} · Equipo B ${b}`,
    nextRound: 'La próxima ronda empieza pronto…',
    finished: 'Partida terminada',
  },
};

function ChipGrid({ tags, selected, onToggle, lang }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {tags.map(tagId => {
        const active = selected.includes(tagId);
        return (
          <button key={tagId} type="button"
            onClick={() => onToggle(tagId)}
            className={`px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              active
                ? 'bg-violet-500 text-white border-violet-400'
                : 'bg-black/30 text-white/60 border-white/10 hover:bg-black/50'
            }`}>
            {hintTagLabel(tagId, lang)}
          </button>
        );
      })}
    </div>
  );
}

function TimerBar({ pct, urgent }) {
  return (
    <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
      <div className={`h-full rounded-full transition-[width] duration-1000 ${urgent ? 'bg-red-500' : 'bg-violet-500'}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ElixirAuction2v2(props) {
  const { lang = 'de', myPlayerId, onSendHint, onBid } = props;
  const t = I18N[lang] || I18N.de;
  const v = useAuction2v2View({ ...props, myPlayerId, onSendHint, onBid });

  if (!v.ready) {
    return <div className="h-full flex items-center justify-center"><p className="text-white/40 text-sm">{t.loading}</p></div>;
  }
  if (!v.myRole) {
    return <div className="h-full flex items-center justify-center px-6"><p className="text-white/40 text-sm text-center">{t.noTeam}</p></div>;
  }

  // ── Auflösung ────────────────────────────────────────────────────────────
  if (v.isReveal) {
    const { cardsX = [], cardsY = [], resultsX = [], resultsY = [], hintTagsX = [], hintTagsY = [], players } = v.state;
    const nameOf = (id) => players.find(p => p.id === id)?.name || '?';

    const CardResult = ({ card, result, hintTags, label }) => {
      if (!card) return null;
      const bidA = result?.bidA ?? 0;
      const bidB = result?.bidB ?? 0;
      return (
        <div className="cr-arcade-panel p-4 space-y-3 w-full sm:w-56">
          <p className="text-white/40 text-xs uppercase tracking-wider text-center">{label}</p>
          <CardTile card={card} ratio="card" className="w-28 mx-auto" />
          <p className="text-white text-center font-semibold text-sm">{card.name}</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {(hintTags || []).map(id => (
              <span key={id} className="text-[10px] px-2 py-0.5 rounded-md bg-black/30 text-white/50 border border-white/10">
                {hintTagLabel(id, lang)}
              </span>
            ))}
          </div>
          <p className="text-white/40 text-xs text-center">{t.bidsLabel(bidA, bidB)}</p>

          {result && (
            <div className="space-y-2 pt-1 border-t border-white/10">
              <div className="flex items-center gap-2">
                <CardTile card={result.winnerCard} ratio="square" className="w-9 shrink-0" />
                <div className="min-w-0">
                  <p className="text-emerald-400 text-xs font-semibold truncate">{t.wonBy(nameOf(result.winnerId))}</p>
                  {result.winnerBonus && <p className="text-amber-400 text-[10px]">{t.championLost}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CardTile card={result.loserCard} ratio="square" className="w-9 shrink-0" />
                <p className="text-white/40 text-xs truncate">{t.consolationFor(nameOf(result.loserId))}</p>
              </div>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="h-full overflow-y-auto custom-scrollbar px-4 py-6 flex flex-col items-center justify-center gap-5">
        <p className="text-white/40 text-xs uppercase tracking-wider">{t.round(v.round, v.maxRounds)} · {t.revealTitle}</p>
        <div className="w-full max-w-4xl space-y-2">
          <p className="text-white/30 text-[11px] uppercase tracking-wider text-center">{t.cardXLabel}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {cardsX.map((card, i) => (
              <CardResult key={`x${i}`} card={card} result={resultsX[i]} hintTags={hintTagsX[i]} label={t.cardLabel(i + 1)} />
            ))}
          </div>
        </div>
        <div className="w-full max-w-4xl space-y-2">
          <p className="text-white/30 text-[11px] uppercase tracking-wider text-center">{t.cardYLabel}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {cardsY.map((card, i) => (
              <CardResult key={`y${i}`} card={card} result={resultsY[i]} hintTags={hintTagsY[i]} label={t.cardLabel(i + 1)} />
            ))}
          </div>
        </div>
        <p className="text-white/30 text-xs">{v.state.finished ? t.finished : t.nextRound}</p>
      </div>
    );
  }

  // ── Hinweis-Phase ────────────────────────────────────────────────────────
  if (v.phase === 'hint') {
    const { myCards = [], myTagsByCard = [] } = v.state;
    const openCard = v.openHintIdx != null ? myCards[v.openHintIdx] : null;
    const openTags = v.openHintIdx != null ? (myTagsByCard[v.openHintIdx] || []) : [];
    return (
      <div className="h-full overflow-y-auto custom-scrollbar px-4 py-6 flex flex-col items-center justify-center gap-4">
        <p className="text-white/40 text-xs uppercase tracking-wider">{t.round(v.round, v.maxRounds)} · {t.hintProgress(v.hintDoneCount, v.cardsPerSide)}</p>
        <div className="w-56"><TimerBar pct={v.timerPct} urgent={v.timerUrgent} /></div>

        {/* Kartenreihe — anklicken wählt, welche Karte man gerade beschreibt */}
        <div className="flex flex-wrap gap-2.5 justify-center">
          {myCards.map((card, i) => {
            const done = v.mySentHints[i] != null;
            const open = v.openHintIdx === i;
            return (
              <button key={i} type="button" disabled={done} onClick={() => v.openHint(i)}
                className="relative disabled:cursor-default">
                <CardTile card={card} ratio="card" selectable={!done} active={open} className="w-20" />
                {done && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                    <Check size={20} className="text-emerald-400" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {openCard && (
          <div className="cr-arcade-panel p-5 w-full max-w-sm space-y-4">
            <p className="text-white text-center font-semibold">{openCard.name}</p>
            <p className="text-white/50 text-xs text-center">{t.pickHint}</p>
            <ChipGrid tags={openTags} selected={v.selectedTags} onToggle={v.toggleTag} lang={lang} />
            <button onClick={v.sendHint} disabled={v.selectedTags.length !== 2}
              className="cr-arcade-icon-btn w-full h-11 font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              {t.sendHint}
            </button>
          </div>
        )}

        {!openCard && v.hintDoneCount >= v.cardsPerSide && (
          <p className="text-white/40 text-sm text-center">{t.hintSentWaiting}</p>
        )}
      </div>
    );
  }

  // ── Gebot-Phase ──────────────────────────────────────────────────────────
  const { forCard, partnerHintsByCard = [] } = v.state;
  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-6 flex flex-col items-center justify-center gap-4">
      <p className="text-white/40 text-xs uppercase tracking-wider">{t.round(v.round, v.maxRounds)} · {t.bidProgress(v.bidDoneCount, v.cardsPerSide)}</p>
      <div className="w-56"><TimerBar pct={v.timerPct} urgent={v.timerUrgent} /></div>
      <p className="text-white/40 text-xs text-center max-w-sm">{t.blindBidNote(forCard)}</p>

      <div className="w-full max-w-sm space-y-2.5">
        {Array.from({ length: v.cardsPerSide }, (_, i) => i).map(i => {
          const done = v.myBids[i] != null;
          const open = v.openBidIdx === i;
          const hints = partnerHintsByCard[i] || [];
          return (
            <div key={i} className={`cr-arcade-panel p-4 space-y-2 ${open ? 'ring-1 ring-violet-400' : ''}`}>
              <button type="button" disabled={done} onClick={() => v.openBid(i)}
                className="w-full flex items-center justify-between text-left disabled:cursor-default">
                <span className="text-white/50 text-xs uppercase tracking-wider">{t.cardLabel(i + 1)}</span>
                {done && (
                  <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                    <Check size={12} /> {v.myBids[i]}
                  </span>
                )}
              </button>
              <div className="flex flex-wrap gap-2">
                {hints.length === 0
                  ? <span className="text-white/25 text-xs">—</span>
                  : hints.map(id => (
                    <span key={id} className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-200 border border-violet-500/30">
                      {hintTagLabel(id, lang)}
                    </span>
                  ))}
              </div>
              {open && !done && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-white/40">
                    <span>{t.yourBid}</span>
                    <span>{t.teamPool}: {v.myPoolAmount}</span>
                  </div>
                  <input type="range" min={0} max={v.myPoolAmount} step={1} value={v.bidAmount}
                    onChange={(e) => v.setBidAmount(Number(e.target.value))}
                    className="w-full accent-violet-500" />
                  <p className="text-white text-center text-xl font-bold tabular-nums">{v.bidAmount}</p>
                  <button onClick={v.placeBid} className="cr-arcade-icon-btn w-full h-10 font-semibold text-sm">
                    {t.placeBid}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {v.bidDoneCount >= v.cardsPerSide && (
        <p className="text-white/40 text-sm text-center">{t.bidSentWaiting}</p>
      )}
    </div>
  );
}
