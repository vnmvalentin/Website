// ui/screens/ResultScreen.jsx — Ergebnis: beide finalen Decks (soweit sichtbar), Statistik, Revanche mit neuem Seed.
import React, { useEffect, useState } from "react";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import { CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { particles } from "../anim/particles.js";

function strongest(stats) {
  const entries = Object.entries(stats?.damageByCard || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { id: entries[0][0], dmg: entries[0][1] };
}

/** @param {{ view: any, you: 0|1|null, names: string[], onRematch?: () => any, onExit?: () => void, rematchState?: any }} props */
export default function ResultScreen({ view, you, names, onRematch, onExit, rematchState }) {
  const [detail, setDetail] = useState(null);
  const won = you !== null && view.winner === you;
  useEffect(() => {
    if (won) particles.burst("ember", window.innerWidth / 2, window.innerHeight * 0.3, { n: 60, spread: 3 });
  }, [won]);
  const reason = view.endReason === "surrender" ? `${names[1 - view.winner]} hat aufgegeben.` : `${view.wins[view.winner]}:${view.wins[1 - view.winner]} Siege.`;
  const waitingRematch = rematchState?.seats?.some((s) => s?.rematch);
  const myRematch = you !== null && rematchState?.seats?.[you]?.rematch;
  return (
    <div className="max-w-[1150px] mx-auto px-4 py-8 space-y-6">
      <div className="ss-paper p-6 text-center">
        <p className="ss-title !text-[var(--ink)] text-4xl md:text-5xl">{you === null ? `${names[view.winner]} gewinnt` : won ? de.ui.victory : de.ui.defeat}</p>
        <p className="text-lg opacity-80 mt-1">{you === null ? reason : won ? `${de.ui.matchWon} ${reason}` : `${de.ui.matchLost} ${reason}`}</p>
        <div className="flex flex-wrap gap-3 justify-center mt-5">
          {onRematch && you !== null && (
            <button type="button" className="ss-seal" disabled={myRematch} onClick={() => { sound.play("seal"); onRematch(); }}>
              {myRematch ? "Warte auf den Gegner …" : de.ui.rematch}
            </button>
          )}
          {onExit && <button type="button" className="ss-btn" onClick={onExit}>Zum Hauptmenü</button>}
        </div>
        {waitingRematch && !myRematch && <p className="mt-2 text-[var(--wax-red)]">Der Gegner will eine Revanche.</p>}
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {[0, 1].map((p) => {
          const P = view.players[p];
          const best = strongest(P.stats);
          return (
            <div key={p} className="ss-panel p-5 space-y-3">
              <p className="ss-title text-xl">{p === you ? `${de.ui.you} (${P.name})` : P.name}{view.winner === p ? " 👑" : ""}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="ss-dim">Schaden auf die Waage</dt><dd className="ss-num">{P.stats.direct}</dd>
                <dt className="ss-dim">Opfer</dt><dd className="ss-num">{P.stats.sacrifices}</dd>
                <dt className="ss-dim">Karten gespielt</dt><dd className="ss-num">{P.stats.played}</dd>
                <dt className="ss-dim">Gegner besiegt</dt><dd className="ss-num">{P.stats.kills}</dd>
                <dt className="ss-dim">Splitter</dt><dd className="ss-num">{P.shards}</dd>
              </dl>
              {best && CARDS[best.id] && (
                <div className="flex items-center gap-3">
                  <Card card={{ ...CARDS[best.id], baseId: best.id, mods: [], uid: `best${p}` }} width={84} onClick={() => setDetail({ ...CARDS[best.id], baseId: best.id, mods: [] })} />
                  <p className="text-sm">Stärkste Karte: <b>{CARDS[best.id].name}</b><br /><span className="ss-dim">{best.dmg} Schaden</span></p>
                </div>
              )}
              {P.deck ? (
                <div className="ss-paper p-3"><DeckSummary cards={P.deck.map((d) => d.card)} title="Finales Deck" onCard={setDetail} /></div>
              ) : (
                <p className="text-sm ss-dim">Deck: {P.deckSize} Karten.</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="ss-panel p-4 text-sm">
        <p className="ss-title mb-2">Verlauf</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          {view.history.map((h) => <li key={h.battleNo}>Kampf {h.battleNo}: {names[h.winner]} ({h.turns} Züge{h.overkill ? `, +${h.overkill} Überschuss` : ""})</li>)}
        </ol>
      </div>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
