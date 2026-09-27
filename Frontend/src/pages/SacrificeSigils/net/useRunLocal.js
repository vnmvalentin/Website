// net/useRunLocal.js — Moorwanderung komplett im Browser: du (Platz 0) gegen 1–5 KI-Mitspieler.
// Gleiche Engine und KI wie Server und Simulation. Liefert dieselbe Form wie useOnlineGame (prefix "mw").
//
// Die KI-Mitspieler handeln sofort, solange sie auf ihrem eigenen Pfad unterwegs sind (dort sieht man ihnen nicht zu).
// Im Duell gegen dich warten sie, bis deine Animationen durch sind, und ziehen dann mit kurzer Pause.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRun, applyRunAction, awaitingRun } from "../engine/modes/moorwanderung/run.js";
import { viewForRun, eventsForRun } from "../engine/modes/moorwanderung/view.js";
import { runAiAction } from "../engine/modes/moorwanderung/ai.js";
import { streamFrom } from "../engine/rng.js";

let batchSeq = 0;
const DUEL_DELAY = { easy: 650, normal: 750, hard: 850 };
const BOT_NAMES = ["Die Schilfhexe", "Der Laternenmann", "Mutter Asche", "Der Aalstecher", "Die Knochenwitwe"];

/**
 * @param {{ seed: string, settings: any, name: string, bots: number, aiLevel?: "easy"|"normal"|"hard", initialState?: any,
 *   aiEnabled?: boolean }} opts  initialState/aiEnabled: Dev-Fixtures (fester Stand, KI steht still)
 */
export function useRunLocal(opts) {
  const { aiLevel = "normal" } = opts;
  const runRef = useRef(/** @type {any} */ (null));
  if (!runRef.current && opts.initialState) runRef.current = opts.initialState;
  if (!runRef.current) {
    const names = [opts.name, ...BOT_NAMES.slice(0, Math.max(1, Math.min(5, opts.bots)))];
    runRef.current = createRun({ seed: opts.seed, settings: { ...opts.settings, players: names.length }, names, salt: `lokal-${opts.seed}` });
  }
  const aiRng = useRef(streamFrom("run-ki", opts.seed, Date.now() % 100000));
  const [view, setView] = useState(() => viewForRun(runRef.current, 0));
  const [batches, setBatches] = useState(() => [{ id: ++batchSeq, view: viewForRun(runRef.current, 0), events: [{ type: "phase", phase: "starter" }] }]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  const publish = useCallback((events) => {
    const v = viewForRun(runRef.current, 0);
    setView(v);
    setBatches((b) => [...b.slice(-40), { id: ++batchSeq, view: v, events: eventsForRun(events, 0) }]);
    setStep((x) => x + 1);
  }, []);

  const apply = useCallback((action) => {
    const res = applyRunAction(runRef.current, action);
    if (res.error) return { ok: false, error: res.error };
    runRef.current = res.state;
    publish(res.events);
    return { ok: true };
  }, [publish]);

  const send = useCallback(async (action) => apply({ ...action, player: 0 }), [apply]);

  // KI-Mitspieler: alles außer dem Duell gegen dich sofort (gebündelt), das Duell gegen dich mit Pause
  useEffect(() => {
    const s = runRef.current;
    if (s.phase === "over" || opts.aiEnabled === false) return undefined;
    const bots = awaitingRun(s).filter((p) => p !== 0);
    if (!bots.length) return undefined;
    const vsMe = (/** @type {number} */ p) => s.phase === "duels" && s.duels.pairs.some((x) => !x.done && x.seats.includes(p) && x.seats.includes(0));
    const quick = bots.filter((p) => !vsMe(p));
    const slow = bots.filter(vsMe);
    if (quick.length) {
      const t = setTimeout(() => {
        // Viele kleine Schritte auf einmal, damit die Mitspieler ihren Pfad in etwa deinem Tempo gehen
        let events = [];
        for (let i = 0; i < 40; i++) {
          const cur = runRef.current;
          const who = awaitingRun(cur).filter((p) => p !== 0 && !(cur.phase === "duels" && cur.duels.pairs.some((x) => !x.done && x.seats.includes(p) && x.seats.includes(0))));
          if (!who.length || cur.phase === "over") break;
          const p = who[i % who.length];
          let res = applyRunAction(cur, runAiAction(cur, p, aiLevel, aiRng.current));
          if (res.error) res = applyRunAction(cur, { type: "timeout", player: p });
          if (res.error) break;
          runRef.current = res.state;
          events = events.concat(res.events);
        }
        publish(events);
      }, 420);
      return () => clearTimeout(t);
    }
    if (slow.length && !busy) {
      const t = setTimeout(() => {
        const cur = runRef.current;
        const p = slow[0];
        if (!awaitingRun(cur).includes(p)) return;
        const res = apply(runAiAction(cur, p, aiLevel, aiRng.current));
        if (!res.ok) apply({ type: "timeout", player: p });
      }, DUEL_DELAY[aiLevel] || 750);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step, busy, aiLevel, apply, publish, opts.aiEnabled]);

  const lobby = {
    rematch: () => {
      const seed = `${opts.seed}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`.slice(-12);
      runRef.current = createRun({ seed, settings: runRef.current.settings, names: runRef.current.players.map((/** @type {any} */ P) => P.name), salt: `lokal-${seed}` });
      publish([{ type: "phase", phase: "starter" }]);
      return Promise.resolve({ ok: true });
    },
    leave: () => Promise.resolve({ ok: true }),
  };

  return {
    mode: "local",
    room: null,
    you: 0,
    view,
    batches,
    timers: {},
    clockOffset: 0,
    connection: "connected",
    notice: null,
    error: null,
    send,
    setBusy,
    lobby,
    getRun: () => runRef.current,
  };
}
