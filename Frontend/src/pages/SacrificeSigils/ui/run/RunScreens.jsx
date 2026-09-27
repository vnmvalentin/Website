// ui/run/RunScreens.jsx — Bildschirme der Moorwanderung außerhalb des Kampfs: Pfad, Lager, Duellrunde, Ergebnis.
import React, { useMemo, useState } from "react";
import PathScreen from "../path/PathScreen.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import Card from "../card/Card.jsx";
import BoardPeek from "./BoardPeek.jsx";
import Seals from "./Seals.jsx";
import { opponentName, statusText } from "./names.js";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { RUN_SCENES } from "./sceneRegistry.js";
import TotemBench from "./TotemBench.jsx";

// ───────── Pfad ─────────

/** Run-Sicht → Sicht des Pfadbildschirms (eigener Fortschritt als Platz 0). @param {any} rv @param {number} you */
function pathView(rv, you) {
  const me = rv.players[you];
  return {
    ...rv,
    path: { map: rv.path.map, players: [rv.path.me, { level: 0, done: false, chosen: [] }] },
    players: [me, { name: "" }],
    others: rv.players.map((P, q) => ({ q, name: P.name, alive: P.alive, seals: P.seals, deckSize: P.deckSize })).filter((x) => x.q !== you),
  };
}

/** @param {{ game: any }} props */
export function RunPath({ game }) {
  const rv = game.view;
  const you = game.you;
  const view = useMemo(() => pathView(rv, you), [rv, you]);
  // Ergebnisse (Kartenwahl, Lagerfeuer …) meldet der Pfadbildschirm für „Spieler 0“
  const events = useMemo(() => game.batches.map((b) => ({ ...b, events: b.events.map((e) => ({ ...e, player: e.player === you ? 0 : 99 })) })), [game.batches, you]);
  return (
    <PathScreen
      view={view}
      you={0}
      send={game.send}
      names={[rv.players[you].name, ""]}
      busy={false}
      timers={rv.phase === "path" && game.timers?.path ? { 0: game.timers.path } : {}}
      clockOffset={game.clockOffset}
      events={events}
      hideOpponent
      extraScenes={RUN_SCENES}
    />
  );
}

// ───────── Zuschauen ─────────

/** Laufende fremde Kämpfe zum Zuschauen. @param {{ view: any }} props */
function WatchList({ view }) {
  const [open, setOpen] = useState(/** @type {string|null} */ (null));
  const entries = Object.entries(view.watch || {});
  if (!entries.length) return <p className="ss-dim text-sm">Gerade kämpft niemand.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([key, w]) => {
        const names = w.seats.map((q, i) => (q !== null && q !== undefined ? view.players[q].name : opponentName(view, w, 1 - i)));
        return (
          <div key={key} className="py-2 border-b border-[rgb(176_141_87/0.25)] last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm"><b>{names[0]}</b> gegen <b>{names[1]}</b>{w.done ? " · vorbei" : ""}</span>
              <button type="button" className="ss-btn ss-btn-sm" onClick={() => setOpen(open === key ? null : key)}>{open === key ? de.run.stopWatch : de.run.watch}</button>
            </div>
            {open === key && <div className="mt-3"><BoardPeek battle={w.battle} names={names} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// ───────── Lager ─────────

/** @param {{ game: any, eliminated?: boolean, spectator?: boolean }} props */
export function CampScreen({ game, eliminated = false, spectator = false }) {
  const rv = game.view;
  const me = game.you !== null ? rv.players[game.you] : null;
  return (
    <div className="max-w-[1300px] mx-auto px-3 py-5 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      <section className="space-y-4">
        <div className="ss-paper p-5">
          <p className="ss-title !text-[var(--ink)] text-2xl">{spectator ? de.ui.spectator : eliminated ? de.run.eliminated : de.run.camp}</p>
          <p className="mt-1">{spectator ? "Du schaust zu. Oben siehst du, wo alle stehen; unten kannst du in laufende Kämpfe schauen." : eliminated ? de.run.eliminatedHint : de.run.campHint}</p>
        </div>
        <div className="ss-panel p-4 space-y-3">
          <p className="ss-title">{de.run.watch}</p>
          <WatchList view={rv} />
        </div>
        {!eliminated && rv.phase === "path" && me?.heads && <TotemBench player={me} zirkel={rv.settings.zirkel} send={game.send} />}
        <p className="text-sm ss-dim">Das <a className="underline" href="/sacrifice-and-sigils/kartenbuch" target="_blank" rel="noreferrer">Kartenbuch</a> öffnet sich in einem neuen Tab – dein Platz am Tisch bleibt.</p>
      </section>
      {me?.deck && (
        <aside className="ss-paper p-4">
          <DeckSummary cards={me.deck.map((d) => d.card)} title="Dein Deck" />
          <p className="text-sm mt-2">{de.ui.shards}: <b className="ss-num">{me.shards}</b> · {de.ui.items}: {(me.items || []).map((i) => de.items[i].name).join(", ") || "–"}</p>
        </aside>
      )}
    </div>
  );
}

// ───────── Duellrunde (wer nicht mehr kämpft) ─────────

/** @param {{ game: any }} props */
export function DuelBoard({ game }) {
  const rv = game.view;
  const name = (q) => rv.players[q]?.name;
  return (
    <div className="max-w-[1100px] mx-auto px-3 py-5 space-y-4">
      <div className="ss-paper p-5">
        <p className="ss-title !text-[var(--ink)] text-2xl">{de.run.duels} {rv.round}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {(rv.duels?.pairs || []).map((x) => {
            const a = x.seats[0];
            const b = x.seats[1];
            const bName = b !== null ? name(b) : x.ghost?.kind === "lord" ? de.run.lord : de.run.mirror(name(x.ghost?.of) || "?");
            return (
              <div key={x.id} className="py-2 border-b border-black/20">
                <p className="ss-title !text-[var(--ink)]">{name(a)} <span className="opacity-60">gegen</span> {bName}</p>
                <p className="text-sm opacity-75">
                  {x.done
                    ? `Sieger: ${x.winner !== null ? name(x.winner) : bName}`
                    : `Zug ${x.turn} · Waage ${x.scale > 0 ? `${name(a)} +${x.scale}` : x.scale < 0 ? `${bName} +${-x.scale}` : "ausgeglichen"}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ss-panel p-4 space-y-3">
        <p className="ss-title">{de.run.watch}</p>
        <WatchList view={rv} />
      </div>
    </div>
  );
}

// ───────── Öffentlich bekannte Karten ─────────

/** @param {{ view: any, q: number, onClose: () => void }} props */
export function PublicCards({ view, q, onClose }) {
  const P = view.players[q];
  const ids = Object.keys(P.publicCards || {}).filter((id) => CARDS[id]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0c0806]/85 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ss-paper ss-modal-box p-5 max-w-3xl w-full max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="ss-title !text-[var(--ink)] text-xl">{P.name}</p>
          <Seals left={P.seals} total={view.settings.seals} />
        </div>
        <p className="text-sm mb-3">{statusText(view, P.status)} · {P.deckSize} Karten im Deck · {P.itemCount} Items</p>
        <p className="ss-title !text-[var(--ink)] mb-2">{de.run.publicCards}</p>
        {ids.length ? (
          <div className="flex flex-wrap gap-2">{ids.map((id) => <Card key={id} card={resolveCard(id, [], `pub${id}`)} width={96} />)}</div>
        ) : <p className="opacity-70">{de.run.noPublic}</p>}
        <div className="mt-4 text-right"><button type="button" className="ss-btn" onClick={onClose}>{de.ui.back}</button></div>
      </div>
    </div>
  );
}

// ───────── Ergebnis ─────────

/** @param {{ game: any, onExit: () => void }} props */
export function RunResult({ game, onExit }) {
  const rv = game.view;
  const ranked = rv.players.map((P, q) => ({ P, q })).sort((a, b) => (a.P.place ?? 99) - (b.P.place ?? 99));
  const [deckOf, setDeckOf] = useState(game.you ?? ranked[0].q);
  const shown = rv.players[deckOf];
  const best = (P) => {
    const e = Object.entries(P.stats?.damageByCard || {}).sort((a, b) => b[1] - a[1])[0];
    return e ? `${CARDS[e[0]]?.name || e[0]} (${e[1]})` : "–";
  };
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-5">
      <div className="ss-paper p-5 md:p-7">
        <p className="ss-title !text-[var(--ink)] text-3xl">{rv.winner !== null ? `${rv.players[rv.winner].name} gewinnt die Moorwanderung` : "Die Moorwanderung ist vorbei"}</p>
        <ol className="mt-4 space-y-1.5">
          {ranked.map(({ P, q }) => (
            <li key={q} className="grid grid-cols-[3rem_1fr] sm:grid-cols-[3rem_12rem_1fr] gap-2 items-baseline">
              <span className="ss-title !text-[var(--ink)] text-xl">{P.place}.</span>
              <button type="button" className={`text-left ${deckOf === q ? "underline" : ""}`} onClick={() => setDeckOf(q)}>{P.name}{q === game.you ? " (du)" : ""}</button>
              <span className="text-sm opacity-80 col-span-2 sm:col-span-1">
                Duelle {P.stats?.duelsWon ?? 0}:{P.stats?.duelsLost ?? 0} · NPCs besiegt {P.stats?.npcWins ?? 0} · Verschmelzungen {P.stats?.fuses ?? 0} · stärkste Karte {best(P)}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          {game.lobby?.rematch && <button type="button" className="ss-seal" onClick={() => game.lobby.rematch()}>Neuer Run</button>}
          <button type="button" className="ss-btn" onClick={onExit}>{de.ui.back}</button>
        </div>
      </div>
      {shown?.deck && (
        <div className="ss-paper p-5">
          <DeckSummary cards={shown.deck.map((d) => d.card)} title={`Deck von ${shown.name}`} />
        </div>
      )}
    </div>
  );
}
