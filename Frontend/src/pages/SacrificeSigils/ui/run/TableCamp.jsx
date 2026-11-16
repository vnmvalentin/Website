// ui/run/TableCamp.jsx — Lager und Duellrunde der Moorwanderung am Tisch (Rebuild „Am Tisch“, Phase 6).
//
// Ersetzt CampScreen und DuelBoard am Tisch im Kerzenlicht: Wer seinen Pfad beendet hat (oder ausgeschieden ist,
// oder nur zuschaut), sitzt allein am Tisch. Hinten liegt ein Blatt „Lager“ neben der Feuerschale, davor je laufendem
// Kampf ein Zettel („Nachbartische“: wer gegen wen, Zug, Waage), links die Mitspieler. Ein Zettel anklicken = an diesen
// Tisch schauen: Der fremde Kampf liegt dann auf dem eigenen Brett (öffentliche Sicht, keine Hände), seine Gestalt
// setzt sich gegenüber, man selbst schaut von der Seite zu — „Zurück ins Lager“ (Zettel, Pausenmenü) beendet es.
// Der eigene Stapel fächert das Deck zum Ansehen auf; ein Zettel „Totems umbauen“ öffnet die Werkbank.
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import TableHost from "../table/TableHost.jsx";
import TablePause from "../table/TablePause.jsx";
import CardDetail from "../card/CardDetail.jsx";
import TotemBench from "./TotemBench.jsx";
import { opponentName, npcDef, statusText } from "./names.js";
import { npcDecor, npcMask } from "./npcMask.js";
import { maskFromText } from "../table/masks.js";
import { displayFromView } from "../anim/display.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { rowX, stageModel, timeLeft, totemsOnTable } from "../table/stageModel.js";

const TableBattle = lazy(() => import("../table/TableBattle.jsx"));

/** Zettel der Nachbartische: bis zu drei nebeneinander, zwei Reihen vor dem Lager-Blatt. */
const FIGHT_GAP = 27;
const FIGHT_Z = [-12, -1.5];
/** Beim Zuschauen (Blick „seite“, Kamera rechts vorn) liegen die Zettel zur Kamera gedreht. */
const WATCH_RY = 0.85;

/**
 * Laufende (und in der Duellrunde schon entschiedene) Kämpfe der anderen.
 * @param {any} rv Run-Sicht
 */
function fightsOf(rv) {
  const nameOf = (w, i) => (w.seats[i] !== null && w.seats[i] !== undefined ? rv.players[w.seats[i]].name : opponentName(rv, w, 1 - i));
  const lead = (names, scale) => (scale > 0 ? `${names[0]} +${scale}` : scale < 0 ? `${names[1]} +${-scale}` : "ausgeglichen");
  if (rv.phase === "duels" && rv.duels) {
    return rv.duels.pairs.map((x) => {
      const key = `d${x.id}`;
      const w = rv.watch?.[key] || { kind: "duel", seats: x.seats, ghost: x.ghost };
      const names = [nameOf(w, 0), nameOf(w, 1)];
      const winner = x.done ? (x.winner !== null && x.winner !== undefined ? rv.players[x.winner]?.name : names[1]) : null;
      return { key, kind: "duel", names, npc: null, done: !!x.done, line: x.done ? `vorbei · ${winner} gewinnt` : `Zug ${x.turn} · Waage ${lead(names, x.scale)}`, watchable: !!rv.watch?.[key], rule: null };
    });
  }
  return Object.entries(rv.watch || {}).map(([key, w]) => {
    const names = [nameOf(w, 0), nameOf(w, 1)];
    const b = w.battle;
    const done = b.phase === "over";
    const rule = (b.rules || []).find((r) => r.seat === 1) || null;
    return {
      key, kind: w.kind, names, npc: w.kind === "duel" ? null : npcDef(w.bossId || w.npcId), done, rule,
      line: done ? `vorbei · ${names[b.winner] || "?"} gewinnt` : `Zug ${b.turn} · Waage ${lead(names, b.scale)}`, watchable: true,
    };
  });
}

/** Überschrift eines Kampfs (Kampf, Elite, Boss, Duell). */
const kindTitle = (f, rv) => (f.kind === "duel" ? `${de.run.duels} ${rv.round}` : de.run.fightKinds[f.kind] || "Kampf");

/**
 * Am Nachbartisch zuschauen: der fremde Kampf am eigenen Tisch, nur ansehen.
 * @param {{ room: any, game: any, fight: any, onBack: () => void, onFallback: () => void }} props
 */
function WatchAtTable({ room, game, fight, onBack, onFallback }) {
  const rv = game.view;
  const w = rv.watch[fight.key];
  const display = useMemo(() => displayFromView({ battle: w.battle }), [w.battle]);
  const view = useMemo(() => ({
    phase: "battle", battle: w.battle, battleNo: rv.round, seed: rv.seed,
    settings: { ...rv.settings, winsNeeded: 1, turnTimer: 0 }, wins: [0, 0], players: fight.names.map((name) => ({ name })),
  }), [w.battle, rv.round, rv.seed, rv.settings, fight.names]);
  const title = kindTitle(fight, rv);
  const bossPhase = w.battle.boss?.phase;
  const ruleText = fight.rule ? `${bossPhase > 1 ? `${de.run.bossPhase2} · ` : ""}${de.run.rules[fight.rule.id]}` : null;
  // Zuschauer sehen von der Seite: Die Zettel liegen an der vorderen Kante, wo sonst die eigene Hand liegt (beim
  // Zuschauen ist sie leer) — links neben dem Brett wären sie klein und lägen unter der Knochenschale
  const run = {
    title: `${title} · ${fight.names[0]} gegen ${fight.names[1]}`,
    sub: <>Du schaust zu · {de.ui.turn} {w.battle.turn}</>,
    notes: [
      {
        id: "lauf", x: -20, z: 53, w: 28, h: ruleText ? 11.5 : 8.4, ry: WATCH_RY,
        lines: [
          { text: fight.names[0], size: 1 },
          { text: `gegen ${fight.names[1]}`, size: 0.85 },
          ...(ruleText ? [{ text: ruleText, size: 0.74, wrap: true }] : []),
          { text: fight.line, size: 0.74 },
        ],
      },
      { id: "zurueck", x: 6, z: 63, w: 22, h: 5.4, ry: WATCH_RY, lines: [{ text: "Zurück ins Lager", size: 1 }], click: true },
    ],
    noteTip: (id) => (id === "zurueck" ? <><b>Zurück ins Lager</b><br /><span className="opacity-80">Anklicken (oder Esc → Zurück ins Lager).</span></>
      : id === "lauf" ? (
        <>
          <b>{title} · {fight.names[0]} gegen {fight.names[1]}</b>
          {ruleText && <><br /><span className="opacity-80">{de.run.houseRule}: {ruleText}</span></>}
          <br /><span className="opacity-80">{fight.line}</span>
          <br /><span className="opacity-80">Du siehst das Brett, aber keine Handkarten.</span>
        </>
      ) : null),
    onNote: (id) => { if (id === "zurueck") onBack(); },
  };
  return (
    <TableBattle
      room={room} view={view} display={display} anim={null} you={null} send={async () => ({ ok: false })}
      timers={{}} clockOffset={game.clockOffset} busy={false} names={fight.names} run={run} onFallback={onFallback}
      pauseExtra={<button type="button" className="ss-btn" onClick={onBack}>Zurück ins Lager</button>}
    />
  );
}

/**
 * Das Lager selbst: allein am Tisch, Zettel für die Nachbartische.
 * @param {{ room: any, game: any, how: "camp" | "eliminated" | "spectator", fights: any[], onWatch: (key: string) => void,
 *   toast: string | null, flash: (t: string) => void, onFallback: () => void }} props
 */
function CampAtTable({ room, game, how, fights, onWatch, toast, flash, onFallback }) {
  const { showTip } = useShell();
  const rv = game.view;
  const you = game.you;
  const zirkel = rv.settings.zirkel;
  const me = you !== null ? rv.players[you] : null;
  const deck = useMemo(() => me?.deck || [], [me?.deck]);
  const [fan, setFan] = useState(false);
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [bench, setBench] = useState(false);
  const [paused, setPaused] = useState(false);
  const canBench = how === "camp" && rv.phase === "path" && !!me?.heads?.length;
  const duels = rv.phase === "duels";

  const title = how === "spectator" ? de.ui.spectator : how === "eliminated" ? de.run.eliminated : duels ? `${de.run.duels} ${rv.round}` : de.run.camp;
  const hint = how === "spectator" ? "Du schaust zu. Ein Zettel vorn führt an den Tisch dieses Kampfs."
    : how === "eliminated" ? de.run.eliminatedHint
      : duels ? "Die anderen tragen ihre Duelle aus. Ein Zettel vorn führt an ihren Tisch."
        : "Du hast den Pfad beendet. Bis alle fertig sind: Stapel anklicken für dein Deck, Zettel vorn für die Nachbartische.";
  const others = rv.players.map((P, q) => ({ q, P })).filter((o) => o.q !== you);
  const row = (i) => Math.floor(i / 3);
  const fightNotes = fights.slice(0, 6).map((f, i) => {
    const inRow = Math.min(3, fights.length - row(i) * 3);
    return {
      id: `tisch:${f.key}`, x: rowX(inRow, FIGHT_GAP)[i % 3], z: FIGHT_Z[row(i)], w: 25.5, h: 9.6, ry: [0.03, -0.02, 0.025][i % 3],
      dim: f.done || !f.watchable, click: f.watchable,
      // drei Zeilen: „A gegen B“ in einer Zeile ließ die Schrift bei langen Namen schrumpfen
      lines: [{ text: f.names[0], size: 1 }, { text: `gegen ${f.names[1]}`, size: 0.85 }, { text: f.line, size: 0.74 }],
    };
  });
  const notes = [
    { id: "lager", x: -14, z: -30, w: 46, h: 11.5, ry: 0.015, lines: [{ text: title, size: 1.3 }, { text: hint, size: 0.78, wrap: true }] },
    ...(fightNotes.length ? fightNotes : [{ id: "ruhe", x: 0, z: -9, w: 30, h: 5, ry: 0.02, dim: true, lines: [{ text: "Gerade kämpft niemand.", size: 0.95 }] }]),
    ...(others.length ? [{
      id: "mitspieler", x: -55, z: 15, w: 28, h: 4.4 + others.length * 3.1, ry: 0.03,
      lines: [{ text: "Mitspieler", size: 1 }, ...others.map(({ P }) => ({ text: `${P.name} · ${P.alive ? `${P.seals}/${rv.settings.seals} · ${de.run.status[P.status?.stage] || ""}` : "aus"}`, size: 0.8 }))],
    }] : []),
    ...(canBench ? [{ id: "totem", x: 50, z: -22, w: 21, h: 5.4, ry: -0.05, lines: [{ text: "Totems umbauen", size: 1 }], click: true }] : []),
  ];
  const model = {
    ...stageModel({ stage: "camp", zirkel, seat: 0, myTurn: false, oppTurn: false }),
    hand: fan ? deck.map((dc) => ({ ...dc.card, uid: dc.uid })) : [],
    me: { bones: 0, third: 0, deck: fan ? 0 : deck.length, items: me?.items || [], totems: me ? totemsOnTable(me, zirkel) : [] },
    itemNames: Object.fromEntries(Object.keys(de.items).map((id) => [id, de.items[id]?.name || id])),
    notes,
    fire: { x: 22, z: -30 },
  };
  const timer = rv.phase === "path" ? game.timers?.path : null;

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how2) => {
    if (p?.type === "hand") { const dc = deck.find((x) => x.uid === p.uid); if (dc) setDetail(dc.card); return; }
    if (how2 !== "click") { if (fan) setFan(false); return; }
    if (!p) return;
    if (p.type === "deck" && deck.length) { setFan((v) => !v); sound.play("draw"); }
    else if (p.type === "note" && String(p.id).startsWith("tisch:")) {
      const f = fights.find((x) => `tisch:${x.key}` === p.id);
      if (f?.watchable) onWatch(f.key);
      else flash("An diesen Tisch kann man nicht schauen.");
    } else if (p.type === "note" && p.id === "totem") setBench(true);
  };
  handlers.current.hover = (p, at) => {
    const T = (head, ...lines) => <><b>{head}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    const f = p?.type === "note" ? fights.find((x) => `tisch:${x.key}` === p.id) : null;
    if (f) {
      content = T(`${kindTitle(f, rv)} · ${f.names[0]} gegen ${f.names[1]}`, f.rule ? `${de.run.houseRule}: ${de.run.rules[f.rule.id]}` : null, f.line,
        f.watchable ? "Anklicken: an diesen Tisch schauen." : null);
    } else if (p?.type === "note" && p.id === "mitspieler") {
      content = T("Mitspieler", ...others.map(({ P }) => `${P.name}: ${P.alive ? `${P.seals} von ${rv.settings.seals} Siegeln, ${statusText(rv, P.status)}` : "ausgeschieden"}`));
    } else if (p?.type === "note" && p.id === "lager") content = T(title, hint);
    else if (p?.type === "note" && p.id === "totem") content = T("Totems umbauen", "Vorhandene Köpfe und Körper neu zusammensetzen.");
    else if (p?.type === "deck" && me) content = T(`Dein Deck: ${deck.length} Karten`, deck.length ? "Anklicken: auffächern und ansehen." : null, `${de.ui.shards}: ${me.shards ?? 0}`);
    else if (p?.type === "item") content = T(de.items[p.id].name, de.items[p.id].desc);
    else if (p?.type === "hourglass" && timer) content = T(`Noch ${Math.ceil(timeLeft(timer, game.clockOffset) / 1000)} s`, "So lange haben die anderen noch für ihren Pfad.");
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };
  useEffect(() => {
    room.setHandlers({ onIntent: (p, how2) => handlers.current.intent(p, how2), onHover: (p, at) => handlers.current.hover(p, at) });
    room.setPose("brett");
    return () => { room.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  useEffect(() => {
    room.sync(model);
    room.setUi({});
    room.setTimer(timer ? { remaining: timeLeft(timer, game.clockOffset), total: timer.total, paused: !!timer.paused, key: `run:${rv.pathNo}` } : null);
  });
  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || detail || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (bench) setBench(false);
      else if (fan) setFan(false);
      else setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [detail, bench, fan]);

  const notice = how === "camp" && !duels ? `${de.run.waitingOthers} ${others.filter(({ P }) => P.alive && P.status?.stage !== "camp").length} noch unterwegs.` : null;
  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || notice) && <div className="st-toast ss-paper" role="status">{toast || notice}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {bench && me && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0c0806]/80 p-4" onClick={() => setBench(false)} role="dialog" aria-modal="true" aria-label="Totems umbauen">
          <div className="max-w-3xl w-full max-h-[85dvh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <TotemBench player={me} zirkel={zirkel} send={game.send} />
            <div className="text-right"><button type="button" className="ss-btn" onClick={() => setBench(false)}>Fertig</button></div>
          </div>
        </div>
      )}
      {paused && (
        <TablePause
          title={title}
          sub={<>Runde {rv.round + 1}{me ? <> · {de.run.seals}: {me.seals} von {rv.settings.seals} · {de.ui.shards}: {me.shards ?? 0}</> : null}</>}
          surrenderText="Den ganzen Run aufgeben?"
          onClose={() => setPaused(false)}
          onSurrender={me?.alive ? () => game.send({ type: "surrender" }) : null}
          onFallback={onFallback}
          help={<>
            Zettel vorn anklicken: an den Tisch dieses Kampfs schauen · eigenen Stapel anklicken: Deck auffächern
            (Rechtsklick auf eine Karte: ansehen) · Mauszeiger auf dem Zettel links: was die anderen gerade tun.
          </>}
        />
      )}
    </>
  );
}

/**
 * @param {{ game: any, how: "camp" | "eliminated" | "spectator", onFallback: () => void }} props
 */
export default function TableCamp({ game, how, onFallback }) {
  const rv = game.view;
  const fights = useMemo(() => fightsOf(rv), [rv]);
  const [watching, setWatching] = useState(/** @type {string|null} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const toastTimer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  const fight = watching && rv.watch?.[watching] ? fights.find((f) => f.key === watching) || null : null;
  // Ist der Kampf am Nachbartisch vorbei (er verschwindet aus der Sicht), geht es von selbst zurück ins Lager
  const gone = !!watching && !fight;
  useEffect(() => {
    if (!gone) return;
    setWatching(null);
    setToast("Der Kampf am Nachbartisch ist vorbei.");
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, [gone]);
  const oppMask = fight ? (fight.npc ? npcMask(fight.npc, fight.kind === "boss") : maskFromText(`${rv.seed}:${fight.names[1]}`)) : undefined;
  const decor = npcDecor(!!fight && fight.kind === "boss", fight ? rv.watch[fight.key]?.battle?.boss?.phase || 1 : 1);
  const watch = (key) => { sound.play("seal"); setWatching(key); };
  const back = () => { sound.play("draw"); setWatching(null); };
  return (
    <TableHost zirkel={rv.settings.zirkel} seated={!!fight} oppMask={oppMask} oppCrown={decor.crown} oppCracked={decor.cracked} onFallback={onFallback}>
      {(room) => (
        <Suspense fallback={null}>
          {fight
            ? <WatchAtTable key={fight.key} room={room} game={game} fight={fight} onBack={back} onFallback={onFallback} />
            : <CampAtTable room={room} game={game} how={how} fights={fights} onWatch={watch} toast={toast} flash={flash} onFallback={onFallback} />}
        </Suspense>
      )}
    </TableHost>
  );
}
