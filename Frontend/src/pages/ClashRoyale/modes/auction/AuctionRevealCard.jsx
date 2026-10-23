// Auflösung einer Auktionskarte — mit ALLEN Angaben, die der Spielfluss braucht.
//
// WARUM DAS EINE EIGENE DATEI IST:
// Beim ersten Entwurf der Design-Varianten hatte ich die Gebotsliste weggelassen und
// nur den Gewinner gezeigt. Das war ein echter Verlust: Man sieht dann nicht mehr, wie
// viel die anderen geboten haben — und genau daraus zieht man die Schlüsse für die
// nächste Runde ("der hat 40 gesetzt, der ist jetzt arm").
//
// Diese Komponente ist deshalb die EINZIGE Stelle, an der eine Auflösung gebaut wird:
//
//   • Gewinner mit Avatar und Name (in seiner Spielerfarbe)
//   • Trostpreis-Empfänger, falls niemand geboten hat
//   • "Nicht vergeben", falls die Karte niemand bekommt
//   • JEDES Gebot auf diese Karte mit Spieler, Betrag und Halbierungs-Markierung
//   • Champion-Krone
//
// Inszenierung "Auktionshammer" (Okt. 2026): Die Karte dreht sich auf (--d0) und wartet
// abgedunkelt, bis sie dran ist (--focus). Dann hebt sie sich, die Gebote steigen langsam vom
// niedrigsten (unten) zum höchsten (oben) auf und zählen hoch (--cd), dann knallt der Stempel
// in der Farbe des Gewinners herunter (--slam) — Stoßwelle, Splitter, Gewinnerrahmen,
// Verlierer-Gebote treten zurück. Den Zeitplan liefert der Aufrufer (auction/revealTiming.js).

import React, { useEffect, useRef } from 'react';
import CardFace from '../../ui/CardFace';
import { CrStar } from '../../ui/CrIcons';
import crownIcon from '../../../../assets/clashRoyale/ui/crown.png';
import elixirIcon from '../../../../assets/clashRoyale/ui/elixir_1.png';
import { avatarUrl } from '../../components/avatars';

const SHARDS = 10;
const animationsOff = () => typeof document !== 'undefined' && document.documentElement.dataset.crAnim === 'off';

function Avatar({ id, color, size = 20 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 cr-avatar-pick"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${(color || '#888')}88` }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

/** Zahl, die ab `delay` Sekunden von 0 auf `to` hochzählt — per rAF direkt am Element, ohne Re-Render. */
function CountUp({ to, delay = 0, duration = 0.5 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    if (animationsOff()) { ref.current.textContent = String(to); return undefined; }
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      if (ref.current) ref.current.textContent = String(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration]);
  return <span ref={ref} className="tabular-nums">0</span>;
}

/**
 * @param {object} card              Aufgelöste Karte
 * @param {object|null} winner       Gewinnender Spieler
 * @param {object|null} consolation  Empfänger des Trostpreises
 * @param {Array}  bids              [{ playerId, amount, halved }]
 * @param {Array}  players           Alle Spieler (für Namen/Avatare)
 * @param {string} accent            Akzentfarbe (CSS-Farbe)
 * @param {string} radius            Tailwind-Rundung, z.B. 'rounded-2xl'
 * @param {number} width             Breite in px
 * @param {object} labels            { notAwarded, revealing, you, sold, consolationStamp, emptyStamp }
 * @param {boolean} fake             Mutterhexe „Vertauschte Karten": kurz noch die falsche
 *                                   Zuordnung zeigen, bevor aufgedeckt wird
 * @param {boolean} unmask           Gerade enttarnt (nach `fake`) — Zauber-Dreh statt Aufdrehen
 * @param {string} myPlayerId        Eigene ID — markiert die selbst gewonnene Karte ("DU")
 * @param {object} timing            Zeitplan dieser Karte aus revealSchedule() (revealTiming.js):
 *                                   { flip, focus, slam, chipAt(rank) } in Sekunden
 */
export default function AuctionRevealCard({
  card, winner, consolation, bids = [], players = [],
  accent = '#a78bfa', radius = 'rounded-xl', width = 186, labels, fake = false, unmask = false,
  myPlayerId, timing,
}) {
  // Wer bekommt die Karte? Gewinner, sonst Trostpreis — und ist man das selbst?
  const receiver = fake ? null : (winner || consolation);
  const mine = !!receiver && receiver.id === myPlayerId;
  // Anzeige absteigend (gewinnendes Gebot oben), Erscheinen aufsteigend (Spannung bis zum Höchsten)
  const sortedBids = [...bids].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const slam = timing.slam;
  const winColor = winner ? (winner.color || accent) : consolation ? '#f59e0b' : '#64748b';
  const stampText = winner ? labels.sold : consolation ? labels.consolationStamp : labels.emptyStamp;

  const vars = {
    '--d0': `${timing.flip}s`,
    '--slam': `${slam}s`,
    '--head': `${slam + 0.15}s`,
    '--wc': winColor,
  };

  return (
    // Hülle: wartet abgedunkelt, bis diese Karte dran ist, und hebt sich während ihrer Auflösung
    <div className={fake ? '' : 'cr-reveal-focus'} style={{
      width,
      '--focus': `${timing.focus}s`,
      '--fdur': `${Math.max(0.4, slam + 0.45 - timing.focus)}s`,
    }}>
    <div className={`${unmask ? 'cr-mw-unmask' : 'cr-reveal-card'} relative ${radius} flex flex-col`}
      style={{
        width, ...vars,
        // Kein Gold-Rahmen vorab: wer gewonnen hat, zeigt erst der Ring beim Hammerschlag
        border: '3px solid var(--cr-panel-edge)',
        background: 'linear-gradient(to bottom, #1c3860, #10223c)',
        boxShadow: '0 12px 28px rgba(2,8,20,0.5)',
      }}>
      {/* Rahmen in Gewinnerfarbe, erscheint mit dem Hammerschlag */}
      {!fake && receiver && <span className={`cr-reveal-ring ${radius}`} aria-hidden="true" />}

      {/* Kopf: wer hat sie bekommen. Solange die Mutterhexe noch aufdeckt, darf hier
          nichts stehen — der Gewinner gehört zur echten Karte, nicht zur vertauschten. */}
      <div className={`overflow-hidden ${radius} !rounded-b-none`}>
        {fake ? (
          <div className="flex items-center gap-1.5 px-3 py-2 text-fuchsia-300 text-xs font-semibold">
            <CrStar size={18} className="shrink-0" /> {labels.revealing}
          </div>
        ) : receiver ? (
          <div className="cr-reveal-head flex items-center justify-center gap-2 px-3 py-2"
            style={{ backgroundColor: (winner ? receiver.color : '#f59e0b') + '38' }}>
            <Avatar id={receiver.avatar} color={receiver.color} size={24} />
            <span className="font-cr text-[15px] truncate" style={{ color: winner ? receiver.color : '#fcd34d', textShadow: '0 1px 0 rgba(2,8,20,0.7)' }}>
              {receiver.name}
            </span>
          </div>
        ) : (
          <div className="cr-reveal-head px-3 py-2 text-white/35 text-xs text-center">{labels.notAwarded}</div>
        )}
      </div>

      {/* Kartenbild — nur der sichtbare Rahmen (ui/CardFace.jsx), 4:5 */}
      <div className="relative aspect-[4/5] px-2 pt-1 transition-opacity duration-300"
        style={{ opacity: fake ? 0.5 : (!receiver ? 0.55 : 1) }}>
        <CardFace id={card.id} alt={card.name} />
        {/* Eigene Karte: goldenes "DU"-Band quer über die Bildecke (nicht über den Namen) */}
        {mine && <span className="cr-you-ribbon cr-after-slam">{labels.you}</span>}
        {!fake && card.isChampion && (
          <span className="absolute top-2 right-2 bg-black/65 rounded-md p-1">
            <img src={crownIcon} alt="" width={15} height={13} />
          </span>
        )}
      </div>

      {/* Hammerschlag: Stempel, Stoßwelle, Splitter */}
      {!fake && (
        <>
          <span className="cr-shockwave" aria-hidden="true" />
          {receiver && Array.from({ length: SHARDS }, (_, i) => (
            <span key={i} className="cr-shard" aria-hidden="true"
              style={{ '--a': `${(360 / SHARDS) * i + (i % 2 ? 12 : -8)}deg` }} />
          ))}
          <span className="cr-stamp" aria-hidden="true">{stampText}</span>
        </>
      )}

      <p className="px-3 pt-1.5 pb-2 text-white font-cr text-[15px] text-center truncate" style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
        {card.name}
      </p>

      {/* Gebotsliste — jedes einzelne Gebot, nicht nur das gewinnende. Ohne sie fehlt die
          Grundlage für die nächste Runde. Beträge zählen beim Erscheinen hoch. */}
      {!fake && sortedBids.length > 0 && (
        <div className={`mt-auto bg-[rgba(6,16,32,0.55)] border-t-2 border-[var(--cr-panel-edge)] px-2 py-2 space-y-1.5 ${radius} !rounded-t-none`}>
          {sortedBids.map((bid, bi) => {
            const bp = players.find(p => p.id === bid.playerId);
            const isWin = winner && bid.playerId === winner.id;
            // Erscheinen aufsteigend: das niedrigste Gebot zuerst, das höchste zuletzt
            const appear = timing.chipAt(sortedBids.length - 1 - bi);
            return (
              <div key={bid.playerId}
                className={`${isWin ? 'cr-bid-chip--win' : 'cr-bid-chip--lose'} flex items-center gap-2 rounded-lg px-2 py-1.5`}
                style={{ '--cd': `${appear}s`, borderLeft: `4px solid ${bp?.color || '#888'}` }}>
                <Avatar id={bp?.avatar} color={bp?.color} size={28} />
                <span className={`flex-1 text-[13px] font-bold truncate ${isWin ? 'text-white' : 'text-white/80'}`}>
                  {bp?.name}{bp?.id === myPlayerId ? ` (${labels.you})` : ''}
                </span>
                <span className="cr-elixir-pill text-base">
                  <img src={elixirIcon} alt="" style={{ height: 20, width: 'auto' }} className="shrink-0" />
                  <CountUp to={bid.amount || 0} delay={appear} />
                  {/* Halbiertes Gebot durch die Mutterhexe */}
                  {bid.halved && <span className="text-[10px] text-fuchsia-200">½</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
