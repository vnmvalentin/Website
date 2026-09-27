// ui/anim/useAnimationQueue.js — spielt die Ereignisse jeder Charge strikt nacheinander ab.
//
//   const q = useAnimationQueue(batches, { speed, reduced, onEvent })
//   q.view     die Sicht, die gerade gezeigt wird (erst nach Ablauf aller Ereignisse der Charge die neue)
//   q.display  Kampf-Anzeigemodell (wird Ereignis für Ereignis fortgeschrieben)
//   q.anim     das laufende Ereignis { ev, key, dur, stage: "pre"|"post" } für CSS-Klassen der Komponenten
//   q.hold     Angriff, dessen Karte gerade vorgestoßen ist (bis zum Rückweg) – { uid, lane, target, … } | null
//   q.busy     noch etwas in der Warteschlange
//   q.skip()   nur die laufende Animation beenden (Klick)
//   q.skipAll() alles sofort anwenden (Knopf „Alle überspringen“)
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDisplayEvent, displayFromView } from "./display.js";
import { EVENT_TIMING, durationFor } from "./timing.js";

const BATTLE_EVENTS = new Set(Object.keys(EVENT_TIMING).filter((k) => !["phase", "battleResult"].includes(k)));
/** Nach diesen Ereignissen kehrt eine vorgestoßene Karte zurück, bevor es weitergeht. */
const RETURN_BEFORE = new Set(["attack", "attackPhase", "turnEnd", "battleEnd", "move", "submerge", "wick", "candle", "turnStart", "firstTurnNoAttack"]);

/**
 * Angriffs-Rückwege einfügen: Zwischen „attack“ und dem nächsten Angriff (bzw. dem Ende der Angriffsphase) bleibt die
 * Karte vorgestoßen; dann folgt ein eigenes Ereignis für den Rückweg mit kleiner Landung.
 * @param {any[]} events
 */
export function withAttackReturns(events) {
  const out = [];
  let open = null;
  for (const ev of events) {
    if (open && RETURN_BEFORE.has(ev.type)) {
      out.push({ type: "attackReturn", uid: open.uid, lane: open.lane });
      open = null;
    }
    out.push(ev);
    if (ev.type === "attack") open = ev;
  }
  if (open) out.push({ type: "attackReturn", uid: open.uid, lane: open.lane });
  return out;
}

/**
 * @param {any[]} batches
 * @param {{ speed: number, reduced: boolean, onEvent?: (ev: any, stage: "pre"|"post", display: any) => void }} opts
 */
export function useAnimationQueue(batches, opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const queue = useRef(/** @type {any[]} */ ([]));
  const seen = useRef(0);
  const displayRef = useRef(/** @type {any} */ (null));
  const [view, setView] = useState(() => batches[batches.length - 1]?.view ?? null);
  const [, setTick] = useState(0);
  const [anim, setAnim] = useState(/** @type {any} */ (null));
  const [hold, setHold] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  const timer = useRef(/** @type {any} */ (null));
  const running = useRef(false);
  const animKey = useRef(0);
  /** Laufendes „pre“-Ereignis, das beim Überspringen noch angewandt werden muss. */
  const pendingPre = useRef(/** @type {any} */ (null));
  const holdRef = useRef(/** @type {any} */ (null));

  if (displayRef.current === null && view?.battle && queue.current.length === 0) {
    displayRef.current = displayFromView(view);
  }

  const rerender = () => setTick((t) => t + 1);

  const sync = useCallback((v) => {
    displayRef.current = displayFromView(v);
    setView(v);
    rerender();
  }, []);

  const runNext = useCallback(() => {
    pendingPre.current = null;
    const item = queue.current.shift();
    if (!item) {
      running.current = false;
      setBusy(false);
      setAnim(null);
      holdRef.current = null;
      setHold(null);
      return;
    }
    if (item.sync) {
      sync(item.view);
      runNext();
      return;
    }
    const ev = item.ev;
    const { speed, reduced } = optsRef.current;
    let d = displayRef.current;
    const isBattleEvent = BATTLE_EVENTS.has(ev.type);
    // Neuer Kampf oder kein Modell: Anzeige direkt auf den End-State der Charge setzen, Rest der Charge still
    if (isBattleEvent && (!d || (item.view?.battle && d.battleNo !== item.view.battle.battleNo))) {
      queue.current = queue.current.filter((x) => x.batchId !== item.batchId || x.sync);
      d = displayFromView(item.view);
      displayRef.current = d;
      holdRef.current = null;
      setHold(null);
      rerender();
      runNext();
      return;
    }
    if (!isBattleEvent || !d) {
      optsRef.current.onEvent?.(ev, "post", d);
      runNext();
      return;
    }
    // Vorgestoßene Karte: bleibt vom Angriff bis einschließlich Rückweg markiert (für Richtung/Weite der Animation)
    if (ev.type === "attack") holdRef.current = ev;
    else if (ev.type === "attackReturn") holdRef.current = holdRef.current ? { ...holdRef.current, returning: true } : null;
    else if (holdRef.current?.returning) holdRef.current = null;
    setHold(holdRef.current);
    const t = EVENT_TIMING[ev.type];
    const dur = durationFor(ev.type, speed, reduced);
    const key = ++animKey.current;
    if (t?.when === "pre") {
      pendingPre.current = ev;
      setAnim({ ev, key, dur, stage: "pre" });
      optsRef.current.onEvent?.(ev, "pre", d);
      timer.current = setTimeout(() => {
        pendingPre.current = null;
        applyDisplayEvent(displayRef.current, ev);
        rerender();
        runNext();
      }, dur);
    } else {
      applyDisplayEvent(d, ev);
      rerender();
      setAnim({ ev, key, dur, stage: "post" });
      optsRef.current.onEvent?.(ev, "post", d);
      timer.current = setTimeout(runNext, dur);
    }
  }, [sync]);

  // Neue Chargen einreihen
  useEffect(() => {
    let added = false;
    for (const b of batches) {
      if (b.id <= seen.current) continue;
      seen.current = b.id;
      for (const ev of withAttackReturns(b.events)) queue.current.push({ batchId: b.id, ev, view: b.view });
      queue.current.push({ batchId: b.id, sync: true, view: b.view });
      added = true;
    }
    if (added && !running.current) {
      running.current = true;
      setBusy(true);
      runNext();
    }
  }, [batches, runNext]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Klick: nur die laufende Animation abschließen, dann geht es mit der nächsten weiter
  const skip = useCallback(() => {
    if (!running.current) return;
    clearTimeout(timer.current);
    if (pendingPre.current && displayRef.current) {
      applyDisplayEvent(displayRef.current, pendingPre.current);
      rerender();
    }
    runNext();
  }, [runNext]);

  const skipAll = useCallback(() => {
    if (!running.current) return;
    clearTimeout(timer.current);
    if (pendingPre.current && displayRef.current) applyDisplayEvent(displayRef.current, pendingPre.current);
    pendingPre.current = null;
    let lastView = null;
    for (const item of queue.current) {
      if (item.sync) lastView = item.view;
      else if (displayRef.current && BATTLE_EVENTS.has(item.ev.type)) applyDisplayEvent(displayRef.current, item.ev);
    }
    queue.current = [];
    running.current = false;
    setAnim(null);
    holdRef.current = null;
    setHold(null);
    setBusy(false);
    if (lastView) sync(lastView);
    else rerender();
  }, [sync]);

  return { view, display: displayRef.current, anim, hold, busy, skip, skipAll };
}
