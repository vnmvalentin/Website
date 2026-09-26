// ui/anim/useAnimationQueue.js — spielt die Ereignisse jeder Charge nacheinander ab.
//
//   const q = useAnimationQueue(batches, { speed, reduced, onEvent })
//   q.view     die Sicht, die gerade gezeigt wird (erst nach Ablauf aller Ereignisse der Charge die neue)
//   q.display  Kampf-Anzeigemodell (wird Ereignis für Ereignis fortgeschrieben)
//   q.anim     das laufende Ereignis { ev, key, dur, stage: "pre"|"post" } für CSS-Klassen der Komponenten
//   q.busy     noch etwas in der Warteschlange
//   q.skip()   alles sofort anwenden (Klick zum Überspringen)
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDisplayEvent, displayFromView } from "./display.js";
import { EVENT_TIMING, durationFor } from "./timing.js";

const BATTLE_EVENTS = new Set(Object.keys(EVENT_TIMING).filter((k) => !["phase", "battleResult"].includes(k)));

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
  const [busy, setBusy] = useState(false);
  const timer = useRef(/** @type {any} */ (null));
  const running = useRef(false);
  const animKey = useRef(0);

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
    const item = queue.current.shift();
    if (!item) {
      running.current = false;
      setBusy(false);
      setAnim(null);
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
      rerender();
      runNext();
      return;
    }
    if (!isBattleEvent || !d) {
      optsRef.current.onEvent?.(ev, "post", d);
      runNext();
      return;
    }
    const t = EVENT_TIMING[ev.type];
    const dur = durationFor(ev.type, speed, reduced);
    const key = ++animKey.current;
    if (t?.when === "pre") {
      setAnim({ ev, key, dur, stage: "pre" });
      optsRef.current.onEvent?.(ev, "pre", d);
      timer.current = setTimeout(() => {
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
      for (const ev of b.events) queue.current.push({ batchId: b.id, ev, view: b.view });
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

  const skip = useCallback(() => {
    if (!running.current) return;
    clearTimeout(timer.current);
    let lastView = null;
    for (const item of queue.current) {
      if (item.sync) lastView = item.view;
      else if (displayRef.current && BATTLE_EVENTS.has(item.ev.type)) applyDisplayEvent(displayRef.current, item.ev);
    }
    queue.current = [];
    running.current = false;
    setAnim(null);
    setBusy(false);
    if (lastView) sync(lastView);
  }, [sync]);

  return { view, display: displayRef.current, anim, busy, skip };
}
