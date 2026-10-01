// Auflösung einer Auktionskarte — mit ALLEN Angaben, die der Spielfluss braucht.
//
// WARUM DAS EINE EIGENE DATEI IST:
// Beim ersten Entwurf der Design-Varianten hatte ich die Gebotsliste weggelassen und
// nur den Gewinner gezeigt. Das war ein echter Verlust: Man sieht dann nicht mehr, wie
// viel die anderen geboten haben — und genau daraus zieht man die Schlüsse für die
// nächste Runde ("der hat 40 gesetzt, der ist jetzt arm").
//
// Diese Komponente ist deshalb die EINZIGE Stelle, an der eine Auflösung gebaut wird.
// Varianten geben nur Farben und Rundungen vor. Was angezeigt wird, kann keine Variante
// mehr entscheiden — und damit auch nicht versehentlich weglassen:
//
//   • Gewinner mit Avatar und Name (in seiner Spielerfarbe)
//   • Trostpreis-Empfänger, falls niemand geboten hat
//   • "Nicht vergeben", falls die Karte niemand bekommt
//   • JEDES Gebot auf diese Karte mit Spieler, Betrag und Halbierungs-Markierung
//   • Champion-Krone

import React from 'react';
import CardFace from '../../ui/CardFace';
import { CrStar } from '../../ui/CrIcons';
import crownIcon from '../../../../assets/clashRoyale/ui/crown.png';
import elixirIcon from '../../../../assets/clashRoyale/ui/elixir_1.png';
import { avatarUrl } from '../../components/avatars';


function Avatar({ id, color, size = 20 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 cr-avatar-pick"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${(color || '#888')}88` }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
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
 * @param {object} labels            { notAwarded, revealing, you }
 * @param {boolean} fake             Mutterhexe „Vertauschte Karten": kurz noch die falsche
 *                                   Zuordnung zeigen, bevor aufgedeckt wird
 * @param {string} myPlayerId        Eigene ID — markiert die selbst gewonnene Karte ("DU")
 * @param {number} index             Position in der Reihe — staffelt die Umdreh-Animation
 */
export default function AuctionRevealCard({
  card, winner, consolation, bids = [], players = [],
  accent = '#a78bfa', radius = 'rounded-xl', width = 186, labels, fake = false,
  myPlayerId, index = 0,
}) {
  // Wer bekommt die Karte? Gewinner, sonst Trostpreis — und ist man das selbst?
  const receiver = fake ? null : (winner || consolation);
  const mine = !!receiver && receiver.id === myPlayerId;
  // Gebote absteigend: das gewinnende oben, damit die Liste von oben nach unten "fällt"
  const sortedBids = [...bids].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const delay = `${index * 0.14}s`;

  return (
    <div className={`cr-flip-in relative ${radius} overflow-hidden flex flex-col transition-opacity duration-300 ${
      mine ? 'shadow-[0_0_0_3px_var(--cr-arcade-gold),0_14px_30px_rgba(2,8,20,0.55)]' : 'shadow-[0_12px_28px_rgba(2,8,20,0.5)]'
    }`}
      style={{
        width, animationDelay: delay,
        border: `3px solid ${mine ? 'var(--cr-arcade-gold-dark)' : 'var(--cr-panel-edge)'}`,
        background: 'linear-gradient(to bottom, #1c3860, #10223c)',
      }}>

      {/* Kopf: wer hat sie bekommen. Solange die Mutterhexe noch aufdeckt, darf hier
          nichts stehen — der Gewinner gehört zur echten Karte, nicht zur vertauschten. */}
      {fake ? (
        <div className="flex items-center gap-1.5 px-3 py-2 text-fuchsia-300 text-xs font-semibold">
          <CrStar size={18} className="shrink-0" /> {labels.revealing}
        </div>
      ) : receiver ? (
        <div className="cr-drop-in flex items-center justify-center gap-2 px-3 py-2"
          style={{ animationDelay: `${index * 0.14 + 0.35}s`, backgroundColor: (winner ? receiver.color : '#f59e0b') + '38' }}>
          <Avatar id={receiver.avatar} color={receiver.color} size={24} />
          <span className="font-cr text-[15px] truncate" style={{ color: winner ? receiver.color : '#fcd34d', textShadow: '0 1px 0 rgba(2,8,20,0.7)' }}>
            {receiver.name}
          </span>
        </div>
      ) : (
        <div className="px-3 py-2 text-white/35 text-xs text-center">{labels.notAwarded}</div>
      )}

      {/* Kartenbild — nur der sichtbare Rahmen (ui/CardFace.jsx), 4:5 */}
      <div className="relative aspect-[4/5] overflow-hidden transition-opacity duration-300 px-2 pt-1"
        style={{ opacity: fake ? 0.5 : 1 }}>
        <CardFace id={card.id} alt={card.name} />
        {/* Eigene Karte: goldenes "DU"-Band quer über die Bildecke (nicht über den Namen) */}
        {mine && <span className="cr-you-ribbon">{labels.you}</span>}
        {!fake && card.isChampion && (
          <span className="absolute top-2 right-2 bg-black/65 rounded-md p-1">
            <img src={crownIcon} alt="" width={15} height={13} />
          </span>
        )}
      </div>

      <p className="px-3 pt-1.5 pb-2 text-white font-cr text-[15px] text-center truncate" style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
        {card.name}
      </p>

      {/* Gebotsliste — jedes einzelne Gebot, nicht nur das gewinnende. Ohne sie fehlt die
          Grundlage für die nächste Runde. Beträge als Elixier-Plakette. */}
      {!fake && sortedBids.length > 0 && (
        <div className="mt-auto bg-[rgba(6,16,32,0.55)] border-t-2 border-[var(--cr-panel-edge)] px-2 py-1.5 space-y-1">
          {sortedBids.map((bid, bi) => {
            const bp = players.find(p => p.id === bid.playerId);
            const isWin = winner && bid.playerId === winner.id;
            return (
              <div key={bid.playerId}
                className={`cr-drop-in flex items-center gap-2 rounded-lg px-1.5 py-1 ${isWin ? '' : 'opacity-60'}`}
                style={{
                  animationDelay: `${index * 0.14 + 0.5 + bi * 0.08}s`,
                  backgroundColor: isWin ? (bp?.color || accent) + '26' : undefined,
                }}>
                <Avatar id={bp?.avatar} color={bp?.color} size={20} />
                <span className={`flex-1 text-xs font-semibold truncate ${isWin ? 'text-white' : 'text-white/70'}`}>
                  {bp?.name}{bp?.id === myPlayerId ? ` (${labels.you})` : ''}
                </span>
                <span className={`cr-elixir-pill text-sm ${isWin ? 'cr-win-pop' : ''}`}
                  style={isWin ? { animationDelay: `${index * 0.14 + 0.75}s` } : undefined}>
                  <img src={elixirIcon} alt="" style={{ height: 16, width: 'auto' }} className="shrink-0" />
                  {bid.amount}
                  {/* Halbiertes Gebot durch die Mutterhexe */}
                  {bid.halved && <span className="text-[10px] text-fuchsia-200">½</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
