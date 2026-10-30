// ── Elixir Auction ───────────────────────────────────────────────────────────
//
// Aussehen: der Entwurf, der sich durchgesetzt hat („ruhig"). Drei Gedanken dahinter:
//
//   1. Größe — die Karten sind das Motiv, nicht Beiwerk. 200px statt 130px, sie füllen
//      die Fläche, statt als kleine Kacheln in einer schwarzen Leere zu schweben.
//   2. Hierarchie — eine große Zahl (die Runde), alles andere tritt zurück.
//   3. Tiefe statt Kästen — weiche Schatten und flächige Trennung statt Rahmen um alles.
//
// FUNKTIONSUMFANG:
// Diese Datei ersetzt die frühere Fassung samt Design-Umschalter (?design=1|2|3). Dabei
// ist NICHTS weggefallen — Mutterhexen-Badge, die verzögerte Aufdeckung bei vertauschten
// Karten, Schweine-Karten, Bonuskarten, Champion-Sperre, Zuschauerleiste und die
// vollständige Gebotsliste sind alle hier. Der abgeleitete Zustand kommt aus
// auction/useAuctionView.js, die Auflösung einer Karte aus auction/AuctionRevealCard.jsx.

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import CardFace from '../ui/CardFace';
import { CrCheck, CrStar, CrTv } from '../ui/CrIcons';
import ModeShell from './ModeShell';
import MotherWitchVisit from './MotherWitchVisit';
import { GameHeader, ProgressHairline, GameFooter, PlayerPanel, ViewToggle } from './GameChrome';
import { useCrPrefs } from '../ui/crPrefs';
import ElixirBar, { ElixirAmount } from '../ui/ElixirBar';
import { PIG_IMG, MOTHER_WITCH_IMG } from '../data/motherWitchAssets';
import { CARD_CROP } from './cardCrop';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import chestIcon from '../../../assets/clashRoyale/ui/icon_menu_shop.png';
import elixirIcon from '../../../assets/clashRoyale/ui/elixir_1.png';
import { useAuctionView } from './auction/useAuctionView';
import AuctionRevealCard from './auction/AuctionRevealCard';
import { avatarUrl } from '../components/avatars';
import { playSound } from '../ui/sound';
import { flyParticles } from '../ui/flyParticles';
import { revealSchedule } from './auction/revealTiming';
import { sparkBurst } from '../ui/juice';

// 3D-Auktionssaal (three.js) — erst geladen, wenn die Auktion läuft. Fällt WebGL aus,
// bleibt die 2D-Ansicht darunter.
const Auction3D = lazy(() => import('./auction/Auction3D'));

// Echter Elixier-Tropfen aus dem Spiel statt der handgezeichneten <ElixirDrop>-Kontur
// (ui/CrIcons.jsx) — hier steht er als eigenständiges kleines Icon neben Zahlen, nicht als
// Dutzende Male wiederholtes Fließtext-Symbol, da darf es die echte Grafik sein.
// WICHTIG: Höhe per style, nicht per height-Attribut — Tailwinds Preflight setzt
// `img { height: auto }`, das schlägt das HTML-Attribut. Nur ein style-Wert schlägt
// wiederum das Preflight; ohne ihn rendert das Bild in seiner vollen Originalgröße
// (bei elixir_1.png 85×99px statt der gewünschten 11-20px — genau der Fehler, der die
// Tropfen riesig über die Kartentexte hat wachsen lassen).
const Elixir = ({ size = 14, className = '' }) => (
  <img src={elixirIcon} alt="" style={{ height: size, width: 'auto' }}
    className={`inline-block align-middle shrink-0 ${className}`} />
);


// Während des Bietens sieht nur der Auslöser den Badge — die betroffenen Gegner merken den
// Effekt ja ohnehin (Schweine, vertauschte Karten), sollen aber nicht wissen, woher er kommt.
// In der Auflösung wird es für alle aufgedeckt.
const MW_BADGE_MINE = {
  de: {
    pigs: 'Hexenmutter: Gegner bieten blind (Schweine)',
    swap: 'Hexenmutter: Gegner sehen falsche Karten',
    halved: 'Hexenmutter: Gebote der Gegner zählen nur halb',
  },
  en: {
    pigs: 'Mother Witch: opponents bid blind (pigs)',
    swap: 'Mother Witch: opponents see the wrong cards',
    halved: "Mother Witch: opponents' bids only count half",
  },
  es: {
    pigs: 'Madre Bruja: los rivales pujan a ciegas (cerditos)',
    swap: 'Madre Bruja: los rivales ven las cartas equivocadas',
    halved: 'Madre Bruja: las pujas de los rivales solo cuentan la mitad',
  },
};

const MW_REVEAL_AFFECTED = {
  de: {
    pigs: 'Hexenmutter war im Spiel: Du hast blind geboten',
    swap: 'Hexenmutter war im Spiel: Deine Karten waren vertauscht',
    halved: 'Hexenmutter war im Spiel: Dein Gebot zählte nur halb',
  },
  en: {
    pigs: 'The Mother Witch was in play: you bid blind',
    swap: 'The Mother Witch was in play: your cards were swapped',
    halved: 'The Mother Witch was in play: your bid only counted half',
  },
  es: {
    pigs: 'La Madre Bruja estaba en juego: pujaste a ciegas',
    swap: 'La Madre Bruja estaba en juego: tus cartas fueron intercambiadas',
    halved: 'La Madre Bruja estaba en juego: tu puja solo contó la mitad',
  },
};

const AUCTION_I18N = {
  de: {
    loading: 'Lade Auktion…',
    viewMode: 'Ansicht',
    roundLabel: 'Runde',
    nextIn: (s) => `Weiter in ${s}s`,
    allBid: 'Alle haben geboten',
    bidProgress: (n, total) => `${n} von ${total} geboten`,
    notAwarded: 'Nicht vergeben',
    revealing: 'Hexenmutter deckt auf…',
    championLimit: 'Champion-Limit',
    bidFor: (n) => `Für ${n} bieten`,
    bonusHeading: 'Bonuskarten — außerhalb des Pools',
    bonusNote: 'Zufällig · kein Champion möglich',
    spectator: 'Zuschauer — kein Bieten möglich',
    bidPlaced: (name, amount) => `Geboten auf ${name} · ${amount} Elixier`,
    setBidHint: 'Gebot festlegen, dann Karte wählen',
    elixirAvailable: 'Elixier verfügbar',
    finalRoundTitle: 'Letzte Runde — alles oder nichts',
    finalRoundHint: 'Übriges Elixier ist danach wertlos: Dein Gebot ist automatisch dein gesamtes Guthaben. Wähle einfach eine Karte.',
    spectatorsHeading: 'Zuschauer',
    you: 'DU',
    sold: 'VERKAUFT!',
    consolationStamp: 'TROSTPREIS',
    emptyStamp: 'LEER',
    auctionTitle: 'AUKTION',
    noBids: 'Keine Gebote',
  },
  en: {
    loading: 'Loading auction…',
    viewMode: 'View',
    roundLabel: 'Round',
    nextIn: (s) => `Next in ${s}s`,
    allBid: 'Everyone has bid',
    bidProgress: (n, total) => `${n} of ${total} bid`,
    notAwarded: 'Not awarded',
    revealing: 'The Mother Witch reveals…',
    championLimit: 'Champion limit',
    bidFor: (n) => `Bid ${n}`,
    bonusHeading: 'Bonus cards — outside the pool',
    bonusNote: 'Random · no champion possible',
    spectator: 'Spectator — bidding not possible',
    bidPlaced: (name, amount) => `Bid on ${name} · ${amount} elixir`,
    setBidHint: 'Set your bid, then pick a card',
    elixirAvailable: 'elixir available',
    finalRoundTitle: 'Final round — all or nothing',
    finalRoundHint: 'Leftover elixir is worthless afterwards: your bid is automatically your entire balance. Just pick a card.',
    spectatorsHeading: 'Spectators',
    you: 'YOU',
    sold: 'SOLD!',
    consolationStamp: 'CONSOLATION',
    emptyStamp: 'NO BIDS',
    auctionTitle: 'AUCTION',
    noBids: 'No bids',
  },
  es: {
    loading: 'Cargando subasta…',
    viewMode: 'Vista',
    roundLabel: 'Ronda',
    nextIn: (s) => `Siguiente en ${s}s`,
    allBid: 'Todos han pujado',
    bidProgress: (n, total) => `${n} de ${total} han pujado`,
    notAwarded: 'Sin adjudicar',
    revealing: 'La Madre Bruja revela…',
    championLimit: 'Límite de campeones',
    bidFor: (n) => `Pujar ${n}`,
    bonusHeading: 'Cartas de bonificación — fuera del pool',
    bonusNote: 'Aleatorio · ningún campeón posible',
    spectator: 'Espectador — no se puede pujar',
    bidPlaced: (name, amount) => `Puja por ${name} · ${amount} de elixir`,
    setBidHint: 'Fija tu puja y luego elige una carta',
    elixirAvailable: 'elixir disponible',
    finalRoundTitle: 'Última ronda — todo o nada',
    finalRoundHint: 'El elixir sobrante no valdrá nada después: tu puja es automáticamente todo tu saldo. Solo elige una carta.',
    spectatorsHeading: 'Espectadores',
    you: 'TÚ',
    sold: '¡VENDIDA!',
    consolationStamp: 'CONSUELO',
    emptyStamp: 'VACÍA',
    auctionTitle: 'SUBASTA',
    noBids: 'Sin pujas',
  },
};

function Avatar({ id, color, size = 28 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 cr-avatar-pick"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${(color || '#888')}66` }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

/**
 * Kartenbild. `isPig` ersetzt das Motiv durch ein Schwein — das ist die Mutterhexen-
 * Fähigkeit „Schweinezauber", bei der die Gegner blind bieten müssen.
 * CARD_CROP zoomt leicht hinein, weil das offizielle Artwork den Seltenheitsrahmen
 * bereits eingebrannt mitbringt.
 */
/** Ein Tropfen je Spieler, der sich beim Gebot füllt (der Server meldet nur die Anzahl, nicht wer). */
const BidTokens = ({ done, total }) => (
  <span className="inline-flex items-center gap-0.5 align-middle mr-2">
    {Array.from({ length: total }, (_, i) => (
      <img key={i < done ? `f${i}` : `e${i}`} src={elixirIcon} alt=""
        className={`cr-bid-token ${i < done ? 'cr-bid-token--full' : 'cr-bid-token--empty'}`} />
    ))}
  </span>
);

const CardArt = ({ card, className = '', style }) => (
  // bg-[#0d0d14]: blickdichter Untergrund, solange das Bild noch lädt (oder falls es
  // fehlschlägt) — die Karte sitzt jetzt auf dem Diamant-Karo (siehe GameSurface) statt
  // auf einer einfarbigen Fläche, ohne eigenen Untergrund würde das Muster durchscheinen.
  // Kein eigener Untergrund mehr: CardFace zeigt nur den sichtbaren Kartenrahmen, ein
  // dunkler Kasten dahinter wirkte bei Legendären/Champions (schmaler) wie ein Rahmen im Rahmen.
  <div className={`relative overflow-hidden ${className}`} style={style}>
    {card.isPig ? (
      <div className="w-full h-full bg-white/5 flex items-center justify-center">
        {PIG_IMG
          ? <img src={PIG_IMG} alt="" className="w-full h-full object-cover" draggable={false} />
          : <span className="text-white/25 text-3xl font-black">?</span>}
      </div>
    ) : (
      <CardFace id={card.id} alt={card.name} />
    )}
  </div>
);

export default function ElixirAuction(props) {
  const { lang = 'de', myPlayerId, myBid, motherWitchVisit, onMotherWitchRespond } = props;
  const t = AUCTION_I18N[lang] || AUCTION_I18N.de;
  // Bietet man als Letzter, löst der Server sofort auf — die Elixiertropfen flögen dann auf
  // eine Karte, die es nicht mehr gibt. Deshalb erscheint die Auflösung erst, wenn der eigene
  // Tropfenflug gelandet ist (der Server plant dafür Puffer ein, siehe revealDurationMs).
  // Beim Klick gemerkt: Bietzustand von damals, bis die Tropfen gelandet sind. useClashSocket
  // setzt den Reveal-Zustand AUCH als auctionState — deshalb wird dieser Schnappschuss gezeigt,
  // nicht bloß revealState ausgeblendet. Die Entscheidung fällt direkt beim Rendern (nicht in
  // einem Effekt), sonst würden die Bietkarten einmal ab- und wieder aufgebaut und neu ausgeteilt.
  const [flight, setFlight] = useState(null);
  const holdReveal = !!(flight && props.revealState);
  const v = useAuctionView(holdReveal ? { ...props, revealState: null, auctionState: flight.bidState } : props);

  // ── Mutterhexe: „Vertauschte Karten" wird verzögert aufgedeckt ────────────
  // Betroffene sehen in der Auflösung zuerst kurz noch die falsche Zuordnung, die sie
  // beim Bieten hatten — sonst könnten sie nicht nachvollziehen, was schiefging.
  const state = v.ready ? v.state : null;
  const mwReveal = v.ready && v.isReveal ? state?.motherWitchReveal : null;
  const swapAffectsMe = !!(mwReveal?.ability === 'swap' && mwReveal.exemptPlayerId !== myPlayerId && mwReveal.swapMap);
  const [swapRevealed, setSwapRevealed] = useState(true);
  // Für den Tropfenflug beim Bieten: Herkunft (eigener Vorrat) und Ziel (Karte)
  const elixirRef = useRef(null);
  const cardRefs = useRef({});
  const stage3dRef = useRef(null);
  // In 3D liegt die Fußzeile ÜBER der Szene statt darunter: Die Zeichenfläche behält so immer
  // dieselbe Größe (ein Größenwechsel ließ die Kamera springen und das Bild aufblitzen, z. B. wenn
  // nach dem Gebot die Fußzeile wechselt oder in der Auflösung verschwindet). Die Szene schiebt
  // ihren Bildausschnitt stattdessen weich über die gemessene Fußzeilenhöhe.
  // Callback-Ref statt Effekt: die Fußzeile gibt es erst, wenn der Spielstand geladen ist
  const [footerH, setFooterH] = useState(0);
  const footerRoRef = useRef(null);
  const footerWrapRef = useCallback((el) => {
    footerRoRef.current?.disconnect();
    footerRoRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterH(el.getBoundingClientRect().height));
    ro.observe(el);
    footerRoRef.current = ro;
  }, []);
  const [witchAnsweredFor, setWitchAnsweredFor] = useState(null);
  const respondToWitch = (accepted) => { setWitchAnsweredFor(motherWitchVisit); onMotherWitchRespond?.(accepted); };
  const [webglFailed, setWebglFailed] = useState(false);
  // 3D nur, wenn gewünscht (Einstellung / Umschalter in der Kopfzeile) UND WebGL läuft
  const { prefs } = useCrPrefs();
  const show3d = prefs.scene3d && !webglFailed;

  useEffect(() => {
    if (!swapAffectsMe) { setSwapRevealed(true); return; }
    setSwapRevealed(false);
    const timer = setTimeout(() => setSwapRevealed(true), 900);
    return () => clearTimeout(timer);
  }, [swapAffectsMe, state?.round, v.isReveal]);

  // Auktionshammer: ein Ton je aufsteigendem Gebot und der Stempel-Sound genau dann, wenn auf
  // der jeweiligen Karte der Stempel knallt (Zeitplan aus auction/revealTiming.js, derselbe
  // wie in AuctionRevealCard)
  const revealCards = v.ready && v.isReveal && swapRevealed ? v.currentCards : null;
  useEffect(() => {
    if (!revealCards) return undefined;
    const sched = revealSchedule(revealCards.map((card, idx) => v.revealFor(card, idx).bids.length), swapAffectsMe ? 0.05 : 0.25);
    const timers = [];
    revealCards.forEach((card, idx) => {
      const c = sched.cards[idx];
      const bidCount = v.revealFor(card, idx).bids.length;
      for (let r = 0; r < bidCount; r++) timers.push(setTimeout(() => playSound('count'), c.chipAt(r) * 1000));
      timers.push(setTimeout(() => playSound('stamp'), c.slam * 1000));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealCards ? `${state?.round}:${revealCards.length}` : null]);

  // Bieten: Elixier fließt sichtbar vom eigenen Vorrat auf die Karte
  const bidWithFlight = (idx, amount) => {
    const from = elixirRef.current?.getBoundingClientRect();
    const to = show3d ? stage3dRef.current?.getCardRect(idx) : cardRefs.current[idx]?.getBoundingClientRect();
    const flightMs = flyParticles({ from, to, src: elixirIcon, size: 24, count: Math.max(3, Math.min(14, Math.ceil(amount / 6))) });
    if (flightMs > 0) {
      const f = { bidState: props.auctionState };
      setFlight(f);
      setTimeout(() => setFlight(cur => (cur === f ? null : cur)), flightMs);
      // Aufprall: Funken auf der Karte, sobald die Tropfen ankommen
      setTimeout(() => sparkBurst(to, { colors: ['#e879f9', '#c026d3', '#f5d0fe'], count: 14, spread: 80 }), flightMs - 120);
    }
    playSound('pour');
    v.placeBid(idx);
  };

  if (!v.ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-white/40 text-sm">{t.loading}</p>
      </div>
    );
  }

  const showFakeCards = swapAffectsMe && !swapRevealed;

  // Badge-Text: beim Bieten nur für den Auslöser, in der Auflösung für alle Beteiligten
  const badgeMine = MW_BADGE_MINE[lang] || MW_BADGE_MINE.de;
  const badgeAffected = MW_REVEAL_AFFECTED[lang] || MW_REVEAL_AFFECTED.de;
  const mwBadgeText = !v.isReveal && state.motherWitchMine
    ? badgeMine[state.motherWitchMine]
    : v.isReveal && mwReveal
      ? (mwReveal.exemptPlayerId === myPlayerId ? badgeMine[mwReveal.ability] : badgeAffected[mwReveal.ability])
      : null;

  const bonusResults = v.isReveal && v.playerResults
    ? Object.entries(v.playerResults).filter(([, r]) => r.isBonus && r.got)
    : [];

  // In der Auflösung erscheinen die gewonnenen Karten im Deck erst, wenn auf ihrer Karte der
  // Stempel gefallen ist — sonst verrät die Seitenleiste das Ergebnis vorab.
  // Bei vertauschten Karten (Mutterhexe) starten die echten Karten erst nach der Enttarnung.
  // Zeitplan der Auflösung: einmal für die Karten (nach einer Enttarnung kürzerer Vorlauf) und
  // einmal fürs Deck (ab Beginn der Auflösung, also inklusive der Enttarnungszeit)
  const bidCounts = v.isReveal ? v.currentCards.map((card, idx) => v.revealFor(card, idx).bids.length) : [];
  const cardSched = v.isReveal ? revealSchedule(bidCounts, swapAffectsMe ? 0.05 : 0.25) : null;
  const deckAppearAt = {};
  if (v.isReveal) {
    const deckSched = revealSchedule(bidCounts, swapAffectsMe ? 0.95 : 0.25);
    v.currentCards.forEach((card, idx) => {
      const r = v.revealFor(card, idx);
      if (r.winner || r.consolation) deckAppearAt[card.id] = deckSched.cards[idx].slam + 0.25;
    });
  }

  // Auflösung für den 3D-Saal: je Karte Empfänger, Stempel und alle Gebote fertig aufbereitet
  // (dieselben Angaben wie AuctionRevealCard — Gewinner, Trostpreis, jedes einzelne Gebot)
  const results3d = v.isReveal ? v.currentCards.map((card, idx) => {
    const r = v.revealFor(card, idx);
    const receiver = r.winner || r.consolation;
    return {
      receiver: receiver ? { name: receiver.name, color: receiver.color, avatar: receiver.avatar, isMe: receiver.id === myPlayerId } : null,
      stampText: r.winner ? t.sold : r.consolation ? t.consolationStamp : t.emptyStamp,
      stampColor: r.winner ? (r.winner.color || '#e879f9') : r.consolation ? '#f59e0b' : '#64748b',
      bids: r.bids.map((b) => {
        const bp = v.players.find(p => p.id === b.playerId);
        return {
          playerId: b.playerId, name: bp?.name || '?', color: bp?.color, avatar: bp?.avatar,
          amount: b.amount || 0, halved: !!b.halved,
          isWin: !!r.winner && b.playerId === r.winner.id, isMe: b.playerId === myPlayerId,
        };
      }),
    };
  }) : null;

  // Bonuskarten (wer leer ausging, bekommt Ersatz von außerhalb) — von 2D und 3D genutzt
  const bonusBlock = bonusResults.length > 0 ? (
    <>
      <div className="flex items-center gap-3 mb-4 max-w-2xl mx-auto">
        <div className="h-px flex-1 bg-amber-400/20" />
        <span className="text-amber-300/90 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#111d2c]">
          {t.bonusHeading}
        </span>
        <div className="h-px flex-1 bg-amber-400/20" />
      </div>
      <div className="flex flex-wrap gap-5 justify-center">
        {bonusResults.map(([pid, r]) => {
          const bp = v.players.find(p => p.id === pid);
          return (
            <div key={pid} className="rounded-2xl overflow-hidden bg-[#151022]"
              style={{ width: 160, border: '3px solid var(--cr-arcade-ink)' }}>
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10">
                <Avatar id={bp?.avatar} color={bp?.color} size={20} />
                <span className="text-amber-200 text-xs font-bold truncate flex-1">{bp?.name}</span>
                <img src={chestIcon} alt="" width={16} height={16} className="shrink-0" />
              </div>
              <div className="aspect-[4/5] overflow-hidden">
                <CardArt card={r.got} className="w-full h-full" />
              </div>
              <div className="px-3 py-2">
                <p className="text-white text-xs font-bold truncate">{r.got.name}</p>
                <p className="text-amber-400/60 text-[10px] mt-0.5">{t.bonusNote}</p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  ) : null;

  // ── Seitenleiste: Spieler mit Elixier und Deck, Zuschauer darunter ────────
  const sidebar = (
    <>
      {v.activePlayers.map(p => (
        <PlayerPanel key={p.id} isMe={p.id === myPlayerId}
          header={
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar id={p.avatar} color={p.color} size={28} />
              <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
              <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/8</span>
            </div>
          }>
          {/* Bezugsgröße ist das Startguthaben der Runde: Voller Vorrat = voller Balken */}
          {(p.id === myPlayerId || v.showOthersElixir) && (
            <ElixirBar value={p.elixir ?? 0} max={v.startElixir} size="sm" />
          )}
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }, (_, ci) => {
              const c = p.deck?.[ci];
              return (
                <div key={ci} className="aspect-[4/5] rounded-md overflow-hidden bg-black/25"
                  style={{ border: '1.5px solid rgba(0,0,0,0.5)' }}>
                  {c && (deckAppearAt[c.id] !== undefined
                    ? <div className="cr-card-pop w-full h-full" style={{ animationDelay: `${deckAppearAt[c.id]}s` }}><CardArt card={c} className="w-full h-full" /></div>
                    : <CardArt card={c} className="w-full h-full" />)}
                </div>
              );
            })}
          </div>
        </PlayerPanel>
      ))}

      {/* Zuschauer nehmen nicht teil — kompakt und abgesetzt ganz unten */}
      {v.spectators.length > 0 && (
        <>
          <div className="h-px bg-white/[0.06]" />
          {v.spectators.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-1 py-1 opacity-45">
              <Avatar id={p.avatar} color={p.color} size={20} />
              <span className="text-white/60 text-[11px] truncate flex-1">{p.name}</span>
              <CrTv size={16} className="text-white/40 shrink-0" />
            </div>
          ))}
        </>
      )}
    </>
  );

  return (
    <ModeShell sidebar={sidebar} playerCount={v.activePlayers.length} width="lg:w-56" lang={lang}>
      <MotherWitchVisit visit={motherWitchVisit} onRespond={respondToWitch} lang={lang} scene3d={show3d} />

      <div className="flex-1 flex flex-col overflow-hidden min-h-0 cr-arcade-bg relative">

        <GameHeader
          label={t.roundLabel} value={v.round} total={v.maxRounds}
          badge={mwBadgeText && (
            <span className="flex items-center gap-1.5 text-fuchsia-300 text-[11px] font-semibold">
              <CrStar size={18} className="shrink-0" />
              <span className="truncate max-w-[15rem] sm:max-w-none">{mwBadgeText}</span>
            </span>
          )}
          meta={!v.isReveal ? (
            <>
              <BidTokens done={v.pendingBidCount} total={v.effectiveActiveCount} />
              {v.allBid ? t.allBid : t.bidProgress(v.pendingBidCount, v.effectiveActiveCount)}
            </>
          ) : undefined}
          timerRemaining={!v.isReveal ? v.timerRemaining : undefined}
          timerUrgent={v.timerUrgent}
          right={<>
            <ViewToggle available={!webglFailed} label={t.viewMode} />
            {v.isReveal && <span className="text-fuchsia-300 text-sm font-semibold">{t.nextIn(v.revealCountdown)}</span>}
          </>}
        />

        <ProgressHairline pct={v.isReveal ? 0 : v.timerPct} accent="#e879f9" urgent={!v.isReveal && v.timerUrgent} />

        {/* ── Karten: 3D-Saal, ohne WebGL die 2D-Tafel ──────────────────────── */}
        {show3d ? (
          <div className="flex-1 relative min-h-0 overflow-hidden bg-[#07040a]">
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">{t.loading}</div>}>
              <Auction3D ref={stage3dRef}
                cards={showFakeCards ? v.currentCards.map((_, i) => v.currentCards[mwReveal.swapMap[i]]) : v.currentCards}
                round={v.round}
                revealKey={v.isReveal && !showFakeCards ? `${v.round}` : null}
                schedule={cardSched?.cards || null}
                results={results3d}
                bidStates={v.currentCards.map((card, idx) => (
                  myBid?.cardIndex === idx ? 'mine'
                    : card.isChampion && !card.isPig && v.myChampCount >= 2 ? 'locked'
                      : !myBid && !v.amSpectator && !v.isReveal ? 'open' : 'none'))}
                myBidAmount={myBid?.amount}
                witch={!!motherWitchVisit && witchAnsweredFor !== motherWitchVisit}
                witchImg={MOTHER_WITCH_IMG}
                pigImg={PIG_IMG}
                labels={{ title: t.auctionTitle, championLimit: t.championLimit, notAwarded: t.notAwarded, you: t.you, noBids: t.noBids }}
                onCardClick={(idx) => bidWithFlight(idx, v.finalRound ? v.myElixir : v.bidAmount)}
                onUnsupported={() => setWebglFailed(true)}
                bottomInset={footerH}
                afterReveal={bonusResults.length > 0 ? <div className="cr-arcade-panel p-4 max-w-full overflow-x-auto">{bonusBlock}</div> : null} />
            </Suspense>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6 sm:py-8">
          <div className="flex flex-wrap gap-5 sm:gap-8 justify-center items-start content-center min-h-full">
            {v.currentCards.map((card, idx) => {

              // ── Auflösung ────────────────────────────────────────────────
              // Gemeinsame Karte mit ALLEN Angaben (Gewinner, Trostpreis, jedes Gebot) —
              // siehe auction/AuctionRevealCard.jsx.
              if (v.isReveal) {
                const r = v.revealFor(card, idx);
                const shown = showFakeCards ? v.currentCards[mwReveal.swapMap[idx]] : card;
                return (
                  // key mit fake/echt: nach der Enttarnung kommt die echte Karte als neues
                  // Element und dreht sich mit Zauber-Effekt um
                  <AuctionRevealCard key={`${idx}-${showFakeCards ? 'f' : 'r'}`}
                    timing={cardSched.cards[idx]}
                    unmask={swapAffectsMe && !showFakeCards}
                    card={shown}
                    winner={showFakeCards ? null : r.winner}
                    consolation={showFakeCards ? null : r.consolation}
                    bids={r.bids}
                    players={v.players} accent="#e879f9" radius="rounded-2xl"
                    width={200} fake={showFakeCards}
                    myPlayerId={myPlayerId}
                    labels={{
                      notAwarded: t.notAwarded, revealing: t.revealing, you: t.you,
                      sold: t.sold, consolationStamp: t.consolationStamp, emptyStamp: t.emptyStamp,
                    }} />
                );
              }

              // ── Bieten ───────────────────────────────────────────────────
              const mine = myBid?.cardIndex === idx;
              const locked = card.isChampion && v.myChampCount >= 2;
              const clickable = !myBid && !locked && !v.amSpectator;

              return (
                // Eine einzige umrandete Kachel statt drei lose schwebender Teile (Karte,
                // Name-Plakette, Gebots-Hinweis) — Bild oben, Name+Gebot als ein
                // gemeinsames Namensschild unten, wie bei einer echten Sammelkarte.
                <button
                  // key mit Runde: neue Karten = neues Element → die Aufdreh-Animation läuft jede Runde
                  key={`${v.round}-${idx}`}
                  ref={(el) => { cardRefs.current[idx] = el; }}
                  onClick={() => clickable && bidWithFlight(idx, v.finalRound ? v.myElixir : v.bidAmount)}
                  disabled={!clickable}
                  className={`cr-auction-deal group rounded-2xl overflow-hidden text-left shadow-[0_10px_30px_rgba(2,8,20,0.5)] ${
                    clickable ? 'cursor-pointer cr-card-hover' : 'cursor-default'
                  }`}
                  style={{
                    width: 200, maxWidth: '42vw', animationDelay: `${idx * 0.12}s`,
                    border: `3px solid ${mine ? '#c026d3' : 'var(--cr-panel-edge)'}`,
                    background: 'linear-gradient(to bottom, #1c3860, #10223c)',
                  }}>

                  <div className="relative w-full px-2 pt-2">
                    <CardArt card={card}
                      className={locked ? 'opacity-35' : ''}
                      style={{ aspectRatio: '4/5' }} />

                    {card.isChampion && !card.isPig && (
                      <span className="absolute top-2.5 right-2.5 bg-black/55 backdrop-blur-sm rounded-lg p-1">
                        <img src={crownIcon} alt="" width={18} height={16} />
                      </span>
                    )}

                    {/* Champion-Sperre: sichtbar begründet, nicht nur ausgegraut */}
                    {locked && (
                      <span className="absolute inset-0 bg-black/55 flex items-center justify-center px-2 pointer-events-none">
                        <span className="text-red-300 text-xs font-bold text-center leading-tight">
                          {t.championLimit}
                        </span>
                      </span>
                    )}

                    {/* Auswahl als innerer Ring — kein Rahmen, kein Versprung */}
                    {(mine || clickable) && (
                      <span className={`absolute inset-0 pointer-events-none transition-opacity ${
                        mine ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                        style={{ boxShadow: 'inset 0 0 0 2px rgba(232,121,249,0.9)' }} />
                    )}
                  </div>

                  {/* Namensschild: Name UND Gebots-Hinweis in derselben Fläche statt zwei
                      getrennter Plaketten. */}
                  <div className="px-2.5 py-2 flex flex-col items-center gap-1">
                    <p className="text-white text-base font-cr truncate w-full text-center" style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
                      {card.name}
                    </p>
                    <div className="h-5 flex items-center justify-center w-full">
                      {mine ? (
                        <span className="cr-elixir-pill text-sm cr-win-pop">
                          <CrCheck size={16} /> <Elixir size={15} /> {myBid.amount}
                        </span>
                      ) : locked ? (
                        <span className="text-white/40 text-xs">{t.championLimit}</span>
                      ) : clickable ? (
                        <span className="flex items-center gap-1 text-white/60 text-xs font-semibold group-hover:text-fuchsia-200 transition-colors">
                          {t.bidFor(v.bidAmount)} <Elixir size={15} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Bonuskarten: wer leer ausging, bekommt Ersatz von außerhalb ──── */}
          {bonusResults.length > 0 && (
            <div className="mt-10">
              {bonusBlock}
            </div>
          )}
        </div>
        )}

        {/* ── Fußzeile: Zuschauer / bereits geboten / Gebot festlegen ───────── */}
        <div ref={footerWrapRef} className={show3d ? 'absolute inset-x-0 bottom-0 z-10' : 'contents'}>
        {!v.isReveal && v.amSpectator && (
          <GameFooter className="flex items-center justify-center gap-2 min-h-[148px]">
            <CrTv size={21} className="text-white/30" />
            <span className="text-white/35 text-sm">{t.spectator}</span>
          </GameFooter>
        )}

        {!v.isReveal && !v.amSpectator && myBid && (
          <GameFooter>
            {/* Gleiche Höhe wie die Regler-Fußzeile: sonst ändert sich nach dem Gebot die Größe der
                3D-Szene, die Kamera springt und das Bild blitzt kurz auf */}
            <div className="max-w-4xl mx-auto min-h-[100px] flex items-center justify-between gap-4 flex-wrap">
              <span className="flex items-center gap-2 text-fuchsia-300 text-sm font-semibold min-w-0">
                <CrCheck size={21} className="shrink-0" />
                <span className="truncate">
                  {t.bidPlaced(v.currentCards[myBid.cardIndex]?.name || '?', myBid.amount)}
                </span>
              </span>
              <ElixirAmount value={v.myElixir} size={40} />
            </div>
          </GameFooter>
        )}

        {!v.isReveal && !v.amSpectator && !myBid && (
          <GameFooter>
            {v.finalRound ? (
              /* Letzte Runde: Der Server bietet automatisch das gesamte Restguthaben —
                 ein Regler wäre eine Lüge, also steht hier nur noch, was passiert. */
              <div className="max-w-4xl mx-auto min-h-[100px] flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold">{t.finalRoundTitle}</p>
                  <p className="text-white/40 text-xs leading-relaxed mt-0.5">{t.finalRoundHint}</p>
                </div>
                <span ref={elixirRef} className="shrink-0"><ElixirAmount value={v.myElixir} size={64} /></span>
              </div>
            ) : (
              /* Bewusst breit (max-w-4xl): Bei 100 Elixier auf ~500px Reglerweg ist ein
                 Pixel ~0,2 Elixier — auf der vorherigen Breite ließ sich ein einzelner
                 Punkt kaum treffen. Die ±5-Knöpfe tragen jetzt denselben harten 3D-Druck
                 wie die ChunkyButtons im Hub (.cr-arcade-btn direkt statt der Komponente,
                 weil die für ein quadratisches Icon-only-Knöpfchen keine passende Größe
                 kennt). */
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Gebot mittig über dem Regler — rechts lag es auf dem Handy unter dem Emote-Knopf */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className="text-white/55 text-xs">{t.setBidHint}</span>
                  <span className="cr-elixir-pill text-2xl !px-3 !py-1">
                    <Elixir size={26} />
                    <span className="tabular-nums">{v.bidAmount}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Größer als zuvor und links vom Regler statt in einer eigenen leisen
                      Zeile darunter — genau hier, wo man gerade das Gebot zieht, will man
                      auf den ersten Blick sehen, wie viel Elixier überhaupt da ist. */}
                  <div ref={elixirRef} className="flex flex-col items-center gap-0.5 shrink-0">
                    <ElixirAmount value={v.myElixir} size={48} />
                    <span className="text-white/30 text-[10px] uppercase tracking-wide">{t.elixirAvailable}</span>
                  </div>
                  <button type="button" onClick={() => v.setBidAmount(x => Math.max(0, x - 5))}
                    className="cr-arcade-btn cr-arcade-btn--blue w-11 h-11 !p-0 shrink-0 text-lg font-black">
                    −
                  </button>
                  <input type="range" min={0} max={v.myElixir} value={v.bidAmount}
                    onChange={e => v.setBidAmount(Number(e.target.value))}
                    className="cr-elixir-slider flex-1"
                    aria-label={t.setBidHint}
                    style={{ '--cr-slider-fill': `${v.myElixir ? (v.bidAmount / v.myElixir) * 100 : 0}%` }} />
                  <button type="button" onClick={() => v.setBidAmount(x => Math.min(v.myElixir, x + 5))}
                    className="cr-arcade-btn cr-arcade-btn--blue w-11 h-11 !p-0 shrink-0 text-lg font-black">
                    +
                  </button>
                </div>
              </div>
            )}
          </GameFooter>
        )}
        </div>
      </div>
    </ModeShell>
  );
}
