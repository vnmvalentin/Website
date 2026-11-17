// ui/table/TableMap.jsx — die Pfadkarte am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Die Pergamentkarte mit Holzmarken und Spielfigur (battle/table3d/pathMap3d.js) liegt jetzt auf demselben Tisch wie
// alles andere: Sie wird zwischen den Szenen des Pfads ausgerollt. Eine erreichbare Marke anklicken geht dorthin; der
// Mauszeiger auf einer Marke zeigt, was dort wartet. Den eigenen Stapel anklicken fächert das Deck zum Ansehen auf.
// Wie weit das Gegenüber ist, steht auf einem Zettel an der hinteren Kante.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import TablePause from "./TablePause.jsx";
import { NodePreview } from "../path/PathMap.jsx";
import { reachable } from "../../engine/path.js";
import { BIOMES, biomeFor } from "../../data/modes/moorwanderung/biomes.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { helpFor } from "./touch.js";
import { usePrefs } from "../prefs.js";
import { stageModel, timeLeft, totemsOnTable } from "./stageModel.js";

/**
 * @param {{ room: any, view: any, you: 0|1, send: (a: any) => Promise<any>, names: string[], timers?: any,
 *   clockOffset?: number, onFallback?: () => void, status?: string | null,
 *   run?: { others: Array<{ q: number, name: string, alive: boolean, seals: number, status: string, short?: string }>, sealsTotal: number, sub: React.ReactNode } }} props
 *   run: Moorwanderung — statt des einen Gegenübers die Mitspieler (Zettel links), eigene Unterzeile im Pausenmenü
 */
export default function TableMap({ room, view, you, send, names, timers, clockOffset = 0, status, onFallback, run }) {
  const { showTip } = useShell();
  const prefs = usePrefs();
  const zirkel = view.settings?.zirkel;
  const path = view.path;
  const map = path.map;
  const pp = path.players[you];
  const opp = 1 - you;
  const opPath = path.players[opp];
  const player = view.players[you];
  const deck = useMemo(() => player.deck || [], [player.deck]);
  const [fan, setFan] = useState(false);
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [paused, setPaused] = useState(false);
  const toastTimer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // Duellmodus: das Biom ist nur Optik (Pfad n → n-tes Biom des Zirkels)
  const biome = (path.biome && BIOMES.find((x) => x.id === path.biome)) || biomeFor(zirkel || "moor", map.pathNo - 1).biome;
  const cycle = path.biome ? path.cycle || 0 : 0;
  const level = Math.min((pp.level ?? 0) + 1, map.levels);
  const subtitle = `Pfad ${map.pathNo} · Ebene ${level}/${map.levels}`;
  const options = !pp.scene && !pp.done ? reachable(pp.strand) : [];
  const isOption = (n) => !!n && n.lv === pp.level && options.includes(n.st);
  // Die Karte wird nur neu gemalt, wenn sich an ihr etwas ändert (nicht bei jedem Bild des Bauteils)
  const mapData = useMemo(() => ({ map, pp, biome, cycle, subtitle, disabled: false }), [map, pp, biome, cycle, subtitle]);

  // Schritte, während die Figur zum gewählten Ort läuft
  const routeLen = pp.route?.length || 0;
  const prevLen = useRef(routeLen);
  useEffect(() => {
    if (routeLen === prevLen.current) return undefined;
    prevLen.current = routeLen;
    if (prefs.reduceMotion) return undefined;
    // je Hüpfer ein Schritt, im Takt der Figur (pathMap3d.js: 0,16 s Anlauf, dann vier Hüpfer in 1 s)
    const timersId = [0, 1, 2, 3].map((i) => setTimeout(() => sound.play("step"), 120 + (i + 1) * 250));
    return () => timersId.forEach(clearTimeout);
  }, [routeLen, prefs.reduceMotion]);
  // Die Karte rollt sich aus, wenn man von einer Szene zurückkommt
  useEffect(() => { sound.play("unroll"); }, []);

  const P = view.players;
  const oppLine = opPath.done ? `${names[opp]} hat den Pfad beendet`
    : `${names[opp]}: Ebene ${Math.min(opPath.level + 1, map.levels)} von ${map.levels}${opPath.chosen?.[opPath.level] ? " – unterwegs" : ""}`;
  const model = {
    ...stageModel({ stage: "map", zirkel, seat: you, myTurn: !pp.done, oppTurn: false }),
    hand: fan ? deck.map((dc) => ({ ...dc.card, uid: dc.uid })) : [],
    me: { bones: 0, third: 0, deck: fan ? 0 : deck.length, items: player.items || [], totems: totemsOnTable(player, zirkel) },
    opp: { items: P[opp].itemCount ?? (P[opp].items || []).length, deck: P[opp].deckSize ?? 0, totems: totemsOnTable(P[opp], zirkel) },
    itemNames: Object.fromEntries(Object.keys(de.items).map((id) => [id, de.items[id]?.name || id])),
    map: mapData,
    // Moorwanderung: die Mitspieler auf einem Zettel links neben der Karte; im Duell das Gegenüber an der hinteren Kante
    notes: run ? [{
      id: "mitspieler", x: -55, z: 15, w: 28, h: 4.4 + run.others.length * 3.1, ry: 0.03,
      lines: [{ text: "Mitspieler", size: 1 }, ...run.others.map((o) => ({ text: `${o.name} · ${o.alive ? `${o.seals}/${run.sealsTotal} · ${o.short || o.status}` : "aus"}`, size: 0.8 }))],
    }] : [{ id: "gegner", x: -18, z: -50.2, w: 30, h: 4.4, ry: 0.02, lines: [{ text: oppLine, size: 1 }] }],
  };
  const timer = timers?.[you];

  const choose = async (st) => {
    sound.play("seal");
    const res = await send({ type: "chooseNode", strand: st });
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); }
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "hand") { const dc = deck.find((x) => x.uid === p.uid); if (dc) setDetail(dc.card); return; }
    if (how !== "click") { if (fan) setFan(false); return; }
    if (p.type === "node") {
      if (isOption(p)) choose(p.st);
      else if (!pp.done && p.lv === pp.level) flash("Dorthin führt von hier kein Weg.");
    } else if (p.type === "deck") { setFan((v) => !v); sound.play("draw"); }
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    if (p?.type === "node") {
      // Vorschau nur für Orte, die schon aus dem Nebel sind (bis eine Ebene voraus)
      const node = p.lv <= pp.level + 1 ? map.nodes[p.lv]?.[p.st] : null;
      if (node) content = <><NodePreview node={node} />{isOption(p) && <span className="opacity-80">Anklicken: hierhin gehen.</span>}</>;
    } else if (p?.type === "deck") content = T(`Dein Deck: ${deck.length} Karten`, "Anklicken: auffächern und ansehen.", `${de.ui.shards}: ${player.shards}`);
    else if (p?.type === "item") content = T(de.items[p.id].name, de.items[p.id].desc);
    else if (p?.type === "note" && run) content = T("Mitspieler", ...run.others.map((o) => `${o.name}: ${o.alive ? `${o.seals} von ${run.sealsTotal} Siegeln, ${o.status}` : "ausgeschieden"}`));
    else if (p?.type === "note") content = T(names[opp], opPath.done ? "Wartet auf dich." : opPath.chosen?.[opPath.level] ? de.ui.opponentChose : de.ui.opponentThinking, "Welche Orte dein Gegenüber besucht, siehst du erst bei der Rast.");
    else if (p?.type === "totem" && p.owner === "me") content = T("Dein Totem", "Im Totem-Schrein auf dem Pfad lässt es sich umbauen.");
    else if (p?.type === "hourglass" && timer) content = T(`Noch ${Math.ceil(timeLeft(timer, clockOffset) / 1000)} s`);
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
    room.setTimer(timer ? { remaining: timeLeft(timer, clockOffset), total: timer.total, paused: !!timer.paused, key: run ? `run:${map.pathNo}` : `m:${map.pathNo}:${pp.level}` } : null);
  });

  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (detail) return;
      if (fan) setFan(false); else setPaused((v) => !v);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [detail, fan]);

  // Ein Satz am ersten Ort, danach spricht die Karte für sich; am Ende der Hinweis, dass man wartet
  const notice = pp.done ? (run ? "Dein Weg ist gegangen." : `Dein Weg ist gegangen. Warte auf ${names[opp]} …`)
    : routeLen === 0 ? "Wähle einen leuchtenden Ort – der Mauszeiger zeigt, was dort wartet."
      : null;

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || notice || status) && <div className="st-toast ss-paper" role="status">{toast || notice || status}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title={`${biome?.name || "Pfad"} · ${subtitle}`}
          sub={run ? run.sub : <>{names[0]} {view.wins[0]} : {view.wins[1]} {names[1]} · {de.ui.shards}: {player.shards} · {oppLine}</>}
          surrenderText={run ? "Den ganzen Run aufgeben?" : undefined}
          onClose={() => setPaused(false)}
          onSurrender={() => send({ type: "surrender" })}
          onFallback={onFallback}
          help={helpFor(<>
            Leuchtende Marke anklicken: dorthin gehen · Mauszeiger auf einer Marke: was dort wartet · eigenen Stapel
            anklicken: Deck auffächern (Rechtsklick auf eine Karte: ansehen) · Orte weiter oben liegen im Nebel, bis du
            näher kommst.
          </>, <>
            Leuchtende Marke antippen: dorthin gehen · andere Marke antippen: was dort wartet · eigenen Stapel antippen:
            Deck auffächern (Karte lange drücken: ansehen) · Orte weiter oben liegen im Nebel, bis du näher kommst.
          </>)}
        />
      )}
    </>
  );
}
