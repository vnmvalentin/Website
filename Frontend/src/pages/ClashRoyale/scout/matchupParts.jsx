// matchupParts.jsx — Bausteine des Matchup-Ratgebers (Ausbauplan „matchups“): Zeilen „gegen Deck-Typ“ und Karten mit
// ihrer Bilanz. Deck-Typ = die Win-Condition eines Decks (Hog Rider, Golem, …) — so fassen sich Decks zusammen, die
// sonst zu selten aufeinandertreffen. Zahlen: Backend clashRoyale/scout/scoutMatchups.js (45 Tage Verlauf).
// Genutzt auf der Deck-Seite (DeckPage.jsx), der Karten-Seite (CardsPage.jsx) und im Reiter „Form“ (playerTabs.jsx).
import React from 'react';
import { Bar, ScoutCard } from './parts';
import { cardKey } from './analysis';
import { fmtPct, useScoutText } from './scoutI18n';
import { localCard } from './scoutUtil';
import { BAD, GOOD, clearColor, typeCard } from './matchupUtil';
/** Bilanz gegen Deck-Typen, häufigster Gegner zuerst. list: [{ type, n, wins }] */
export function TypeRows({ list }) {
  const { t, lang } = useScoutText();
  return (
    <div className="crs-murows">
      {list.map((v) => {
        const card = typeCard(v.type);
        const color = clearColor(v.n, v.wins);
        return (
          <div key={v.type} className="crs-murow">
            <ScoutCard card={card} size="sm" level={false} link={!!card.id} />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <b className="truncate text-sm text-white">{card.name}</b>
                <span className="text-xs crs-muted crs-num whitespace-nowrap">{t.record(v.wins, v.n - v.wins)}</span>
              </div>
              <Bar value={v.wins / v.n} split className="mt-1.5" />
            </div>
            <b className="font-cr text-lg leading-none text-right crs-num" style={color ? { color } : undefined}>{fmtPct(v.wins / v.n, lang)}</b>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Karten mit ihrer Bilanz (Siege–Niederlagen aus Sicht des Decks bzw. der Karte). tone: 'hard' = rot, 'easy' = grün
 * (die Liste ist schon nach deutlichem Unterschied gefiltert); ohne tone grün ab 50 %.
 */
export function CardRecords({ title, icon, list, tone }) {
  const { lang } = useScoutText();
  if (!list.length) return null;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="cr-eyebrow">{title}</span></div>
      <div className={`crs-cardrecs${tone ? ' crs-cardrecs--six' : ''}`}>
        {list.map((e) => {
          const card = e.card.name ? e.card : localCard(e.card.id) || e.card;
          const color = tone === 'hard' ? BAD : tone === 'easy' ? GOOD : e.winRate >= 0.5 ? GOOD : BAD;
          return (
            <span key={cardKey(card)}>
              <ScoutCard card={card} level={false} link />
              <b style={{ color }}>{fmtPct(e.winRate, lang)}</b>
              <small className="crs-num">{e.wins}–{e.n - e.wins}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}
