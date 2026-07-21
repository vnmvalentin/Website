import React from 'react';
import { RARITY_COLOR, cardImageUrl } from '../data/cards';

// Dauer der Dreh-Animation — muss mit dem Timeout in NuzlockePage übereinstimmen
export const SPIN_DURATION_MS = 4200;

const R_OUTER = 150;   // Radius des Rads
const R_IMG = 96;      // Radius, auf dem die Kartenbilder sitzen
const IMG_W = 46;
const IMG_H = 55;

// Winkel ab 12 Uhr im Uhrzeigersinn → SVG-Koordinaten (Mittelpunkt 0,0)
function polar(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return [radius * Math.sin(rad), -radius * Math.cos(rad)];
}

function segmentPath(startDeg, endDeg, radius) {
  const [x0, y0] = polar(startDeg, radius);
  const [x1, y1] = polar(endDeg, radius);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M 0 0 L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}

/**
 * Glücksrad mit den aktuellen Deck-Karten als Segmenten.
 * Rein visuell — die Rotation (kumulierte Grad) steuert die Elternkomponente,
 * das Ergebnis bestimmt der Server. Animation nur über transform → GPU-günstig.
 * Beim Account-Wechsel per key remounten, damit die Rotation nicht zurückanimiert.
 */
export default function CardWheel({ cards, rotation, size = 360 }) {
  const n = cards.length;
  const seg = n > 0 ? 360 / n : 360;

  return (
    <div className="relative select-none w-full aspect-square" style={{ maxWidth: size }}>
      <svg viewBox="-170 -170 340 340" width="100%" height="100%">
        {/* Rotierender Teil */}
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '0px 0px',
            transition: `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)`,
          }}
        >
          <circle r={R_OUTER} fill="#0a0a0e" stroke="#ffffff1f" strokeWidth="2" />

          {n === 0 && (
            <circle r={R_OUTER - 10} fill="none" stroke="#ffffff10" strokeWidth="1" strokeDasharray="6 8" />
          )}

          {cards.map((card, i) => {
            const a0 = i * seg;
            const a1 = (i + 1) * seg;
            const mid = (a0 + a1) / 2;
            const [ix, iy] = polar(mid, R_IMG);
            const color = RARITY_COLOR[card.rarity] || '#888';
            return (
              <g key={card.id}>
                {n === 1 ? (
                  <circle r={R_OUTER - 2} fill={color + '26'} />
                ) : (
                  <path d={segmentPath(a0, a1, R_OUTER)} fill={color + '26'} stroke="#ffffff22" strokeWidth="1.5" />
                )}
                <g transform={`rotate(${mid} ${ix} ${iy})`}>
                  <image
                    href={cardImageUrl(card.id)}
                    x={ix - IMG_W / 2}
                    y={iy - IMG_H / 2}
                    width={IMG_W}
                    height={IMG_H}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <rect
                    x={ix - IMG_W / 2} y={iy - IMG_H / 2} width={IMG_W} height={IMG_H}
                    fill="none" stroke={color + 'aa'} strokeWidth="1.5"
                  />
                </g>
                <title>{card.name}</title>
              </g>
            );
          })}
        </g>

        {/* Statischer Teil: Nabe + Zeiger */}
        <circle r="30" fill="#16161a" stroke="#ffffff2e" strokeWidth="2" />
        <text y="1" textAnchor="middle" dominantBaseline="middle" fill={n > 0 ? '#ffffff' : '#6b7280'}
          fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif">
          {n}
        </text>
        <text y="15" textAnchor="middle" dominantBaseline="middle" fill="#6b7280"
          fontSize="7.5" fontFamily="system-ui, sans-serif">
          {n === 1 ? 'Karte' : 'Karten'}
        </text>
        <polygon points="-13,-166 13,-166 0,-140" fill="#06b6d4" stroke="#0a0a0e" strokeWidth="2" />
      </svg>

      {n === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-600 text-xs text-center max-w-[180px] mt-16">
            Füge Karten zu deinem Deck hinzu, um das Rad zu füllen
          </p>
        </div>
      )}
    </div>
  );
}
