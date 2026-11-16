// ui/run/TableRunResult.jsx — Ende der Moorwanderung am Tisch (Rebuild „Am Tisch“, Phase 6).
//
// Ersetzt RunResult am Tisch im Kerzenlicht, im Muster des Duell-Ergebnisses (table/TableResult.jsx): Ein Blatt hinten
// nennt den Sieger, davor wachsen drei Holzblöcke als Podest aus dem Tisch (auf jedem die verbliebenen Lebenssiegel),
// davor Namenszettel. Links liegt die Rangliste mit den Zahlen aller. Einen Namenszettel (oder den eigenen Stapel)
// anklicken fächert das Deck dieses Spielers auf. Neuer Run = eine Kerze anzünden; „Aufstehen“ führt ins Hauptmenü.
import React, { useEffect, useMemo, useRef, useState } from "react";
import TableHost from "../table/TableHost.jsx";
import TablePause from "../table/TablePause.jsx";
import CardDetail from "../card/CardDetail.jsx";
import { CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { stageModel } from "../table/stageModel.js";

/** Wie im Podest der Szene (scene/tableRoom.js: PODIUM_X): Platz 1 Mitte, 2 links, 3 rechts. */
const PODIUM_X = [0, -17, 17];

/** Stärkste Karte eines Spielers (meister Schaden) als Text. */
function best(P) {
  const e = Object.entries(P.stats?.damageByCard || {}).filter(([id]) => CARDS[id]).sort((a, b) => b[1] - a[1])[0];
  return e ? `${CARDS[e[0]].name} (${e[1]} Schaden)` : null;
}

/** @param {{ room: any, game: any, onExit: () => void, onFallback: () => void }} props */
function ResultAtTable({ room, game, onExit, onFallback }) {
  const { showTip } = useShell();
  const rv = game.view;
  const you = game.you;
  const P = rv.players;
  const zirkel = rv.settings.zirkel;
  const ranked = useMemo(() => P.map((pl, q) => ({ P: pl, q })).sort((a, b) => (a.P.place ?? 99) - (b.P.place ?? 99)), [P]);
  const top3 = ranked.filter((r) => r.P.place && r.P.place <= 3);
  const [fanOf, setFanOf] = useState(/** @type {number|null} */ (null));
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [paused, setPaused] = useState(false);
  const [asked, setAsked] = useState(false);
  const canRematch = you !== null && !!game.lobby?.rematch;
  const seats = game.room?.seats || [];
  const myRematch = asked || (you !== null && !!seats[you]?.rematch);
  const othersRematch = seats.some((s, i) => i !== you && !!s?.rematch);
  const myPlace = you !== null ? P[you].place : null;

  useEffect(() => { if (myPlace === 1) sound.play("victory"); }, [myPlace]);

  const deckOf = (q) => P[q]?.deck || [];
  const fan = fanOf !== null ? deckOf(fanOf) : [];
  const nameOf = (q) => `${P[q].name}${q === you ? " (du)" : ""}`;
  const statLine = (pl) => `Duelle ${pl.stats?.duelsWon ?? 0}:${pl.stats?.duelsLost ?? 0} · NPCs ${pl.stats?.npcWins ?? 0}`;
  const title = rv.winner !== null && rv.winner !== undefined ? `${P[rv.winner].name} gewinnt die Moorwanderung` : "Die Moorwanderung ist vorbei";
  const notes = [
    { id: "ergebnis", x: 0, z: -33, w: 54, h: 7.5, ry: 0.01, lines: [{ text: title, size: 1.35 }, ...(myPlace ? [{ text: `Du bist auf Platz ${myPlace}.`, size: 0.85 }] : [])] },
    ...top3.map(({ P: pl, q }) => ({
      id: `platz:${q}`, x: PODIUM_X[pl.place - 1], z: -4, w: 15.5, h: 6.4, ry: [0, 0.03, -0.03][pl.place - 1], mark: fanOf === q, click: !!pl.deck,
      lines: [{ text: nameOf(q), size: 1 }, { text: pl.seals > 0 ? `${pl.seals} von ${rv.settings.seals} Siegeln` : "ohne Siegel", size: 0.75 }],
    })),
    {
      id: "rangliste", x: -55, z: 15, w: 28, h: 4.4 + ranked.length * 3.1, ry: 0.03,
      lines: [{ text: "Rangliste", size: 1 }, ...ranked.map(({ P: pl, q }) => ({ text: `${pl.place ?? "–"}. ${P[q].name} · ${statLine(pl)}`, size: 0.78 }))],
    },
    ...(onExit ? [{ id: "aufstehen", x: 27, z: 25, w: 21, h: 6.4, ry: -0.06, mark: true, click: true, lines: [{ text: "Aufstehen", size: 1.3 }, { text: "zurück ins Hauptmenü", size: 0.85 }] }] : []),
  ];
  const model = {
    ...stageModel({ stage: "result", zirkel, seat: 0, myTurn: false, oppTurn: false }),
    hand: fan.map((dc) => ({ ...dc.card, uid: dc.uid })),
    me: { bones: 0, third: 0, deck: you !== null && fanOf !== you ? deckOf(you).length : 0, items: [], totems: [] },
    notes,
    podium: top3.map(({ P: pl }) => ({ place: pl.place, seals: pl.seals })),
    // links die eigene Kerze (neuer Run), rechts brennt sie, sobald ein anderer einen neuen Run will
    candles: [myRematch, othersRematch],
  };

  const rematch = () => {
    if (!canRematch || myRematch) return;
    sound.play("fire");
    setAsked(true);
    game.lobby.rematch();
  };
  const toggleFan = (q) => {
    if (!deckOf(q).length) return;
    sound.play("draw");
    setFanOf((cur) => (cur === q ? null : q));
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (p?.type === "hand") { const dc = fan.find((x) => x.uid === p.uid); if (dc) setDetail(dc.card); return; }
    if (how !== "click") { if (fanOf !== null) setFanOf(null); return; }
    if (!p) return;
    if (p.type === "candle") rematch();
    else if (p.type === "deck" && you !== null) toggleFan(you);
    else if (p.type === "podium") { const r = top3.find((x) => x.P.place === p.place); if (r) toggleFan(r.q); }
    else if (p.type === "note" && String(p.id).startsWith("platz:")) toggleFan(Number(String(p.id).slice(6)));
    else if (p.type === "note" && p.id === "aufstehen" && onExit) { sound.play("creak"); onExit(); }
  };
  handlers.current.hover = (p, at) => {
    const T = (head, ...lines) => <><b>{head}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    const q = p?.type === "note" && String(p.id).startsWith("platz:") ? Number(String(p.id).slice(6))
      : p?.type === "podium" ? top3.find((x) => x.P.place === p.place)?.q ?? null : null;
    if (q !== null && q !== undefined && P[q]) {
      const pl = P[q];
      content = T(`${pl.place}. ${nameOf(q)}`, statLine(pl), `Verschmelzungen ${pl.stats?.fuses ?? 0}`, best(pl) ? `Stärkste Karte: ${best(pl)}` : null, pl.deck ? "Anklicken: Deck auffächern." : null);
    } else if (p?.type === "note" && p.id === "rangliste") {
      content = T("Rangliste", ...ranked.map(({ P: pl, q: r }) => `${pl.place ?? "–"}. ${nameOf(r)}: ${statLine(pl)} · Verschmelzungen ${pl.stats?.fuses ?? 0}`));
    } else if (p?.type === "candle") {
      if (canRematch) content = myRematch ? T("Deine Kerze brennt", "Ein neuer Run beginnt, sobald es losgeht.") : T("Kerze anzünden: neuer Run", othersRematch ? "Jemand wartet schon." : "Neuer Run mit neuem Seed.");
    } else if (p?.type === "note" && p.id === "aufstehen") content = T("Aufstehen", "Zurück ins Hauptmenü.");
    else if (p?.type === "deck" && you !== null) content = T(`Dein Deck: ${deckOf(you).length} Karten`, "Anklicken: auffächern und ansehen.");
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };
  useEffect(() => {
    room.setHandlers({ onIntent: (p, how) => handlers.current.intent(p, how), onHover: (p, at) => handlers.current.hover(p, at) });
    room.setPose("brett");
    return () => { room.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  useEffect(() => {
    room.sync(model);
    room.setUi({});
    room.setTimer(null);
  });
  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || detail || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (fanOf !== null) setFanOf(null); else setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [detail, fanOf]);

  const notice = !canRematch ? null
    : myRematch ? "Deine Kerze brennt – gleich geht es los …"
      : "Noch ein Run? Zünde eine Kerze an – oder steh auf (Zettel rechts).";
  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {notice && <div className="st-toast ss-paper" role="status">{notice}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title={title}
          sub={myPlace ? <>Du bist auf Platz {myPlace} · {statLine(P[you])}</> : null}
          extra={<>
            {canRematch && !myRematch && <button type="button" className="ss-btn" onClick={() => { setPaused(false); rematch(); }}>Neuer Run</button>}
            {onExit && <button type="button" className="ss-btn" onClick={onExit}>{de.ui.back}</button>}
          </>}
          onClose={() => setPaused(false)}
          onSurrender={null}
          onFallback={onFallback}
          help={<>
            Eine Kerze anklicken: neuer Run · Namenszettel oder Podest anklicken: Deck dieses Spielers auffächern
            (Rechtsklick auf eine Karte: ansehen) · Zettel links: alle Plätze mit Zahlen · Zettel „Aufstehen“: zurück.
          </>}
        />
      )}
    </>
  );
}

/** @param {{ game: any, onExit: () => void, onFallback: () => void }} props */
export default function TableRunResult({ game, onExit, onFallback }) {
  return (
    <TableHost zirkel={game.view.settings.zirkel} seated={false} onFallback={onFallback}>
      {(room) => <ResultAtTable room={room} game={game} onExit={onExit} onFallback={onFallback} />}
    </TableHost>
  );
}
