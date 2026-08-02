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
import { Crown, Sparkles } from 'lucide-react';
import { CARD_CROP } from '../cardCrop';
import { ElixirDrop } from '../../ui/CrIcons';

const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';
const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));

function Avatar({ id, color, size = 20 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 bg-[#1a1a20]"
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
 * @param {string} accent            Akzentfarbe der Variante (CSS-Farbe)
 * @param {string} radius            Tailwind-Rundung, z.B. 'rounded-2xl'
 * @param {number} width             Breite in px
 * @param {object} labels            { notAwarded, revealing }
 * @param {boolean} fake             Mutterhexe „Vertauschte Karten": kurz noch die falsche
 *                                   Zuordnung zeigen, bevor aufgedeckt wird
 */
export default function AuctionRevealCard({
  card, winner, consolation, bids = [], players = [],
  accent = '#a78bfa', radius = 'rounded-xl', width = 186, labels, fake = false,
}) {
  return (
    <div className={`${radius} overflow-hidden bg-black/35 flex flex-col transition-opacity duration-300`}
      style={{ width }}>

      {/* Kopf: wer hat sie bekommen. Solange die Mutterhexe noch aufdeckt, darf hier
          nichts stehen — der Gewinner gehört zur echten Karte, nicht zur vertauschten. */}
      {fake ? (
        <div className="flex items-center gap-1.5 px-3 py-2 text-fuchsia-300 text-xs font-semibold">
          <Sparkles size={12} className="shrink-0" /> {labels.revealing}
        </div>
      ) : winner ? (
        <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: winner.color + '2e' }}>
          <Avatar id={winner.avatar} color={winner.color} size={22} />
          <span className="font-bold text-sm truncate" style={{ color: winner.color }}>{winner.name}</span>
        </div>
      ) : consolation ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/12">
          <Avatar id={consolation.avatar} color={consolation.color} size={22} />
          <span className="font-bold text-sm truncate text-amber-300">{consolation.name}</span>
        </div>
      ) : (
        <div className="px-3 py-2 text-white/25 text-xs">{labels.notAwarded}</div>
      )}

      {/* Kartenbild */}
      <div className="relative aspect-square overflow-hidden transition-opacity duration-300"
        style={{ opacity: fake ? 0.5 : 1 }}>
        <img src={`${CARD_CDN}${card.id}.png`} alt={card.name}
          className="w-full h-full object-cover" style={CARD_CROP} draggable={false}
          onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
        {!fake && card.isChampion && (
          <span className="absolute top-2 right-2 bg-black/65 rounded-md p-1">
            <Crown size={12} className="text-amber-300" />
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        <p className="text-white text-sm font-bold truncate">{card.name}</p>
      </div>

      {/* Gebotsliste — jedes einzelne Gebot, nicht nur das gewinnende.
          Ohne sie fehlt die Grundlage für die nächste Runde. */}
      {!fake && bids.length > 0 && (
        <div className="border-t border-white/[0.07] divide-y divide-white/[0.05] mt-auto">
          {bids.map(bid => {
            const bp = players.find(p => p.id === bid.playerId);
            const isWin = winner && bid.playerId === winner.id;
            return (
              <div key={bid.playerId}
                className={`flex items-center gap-2 px-2.5 py-1.5 ${isWin ? '' : 'opacity-45'}`}
                style={isWin ? { backgroundColor: (bp?.color || accent) + '16' } : undefined}>
                <Avatar id={bp?.avatar} color={bp?.color} size={17} />
                <span className={`flex-1 text-[11px] font-semibold truncate ${isWin ? 'text-white' : 'text-white/60'}`}>
                  {bp?.name}
                </span>
                <span className={`font-mono font-bold text-[13px] tabular-nums ${isWin ? 'text-white' : 'text-white/45'}`}>
                  {bid.amount}
                </span>
                {/* Halbiertes Gebot durch die Mutterhexe */}
                {bid.halved && <span className="text-[9px] shrink-0" style={{ color: accent }}>(½)</span>}
                <ElixirDrop size={11} className={isWin ? '' : 'opacity-50'} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
