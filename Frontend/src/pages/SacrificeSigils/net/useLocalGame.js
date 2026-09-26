// net/useLocalGame.js — Spiel komplett im Browser: Übung gegen die KI, Hotseat (zwei Spieler an einem Gerät), Tutorial.
// Gleiche Engine und gleiche KI wie Server und Balancing-Tool. Liefert dieselbe Form wie useOnlineGame.
import { useCallback, useEffect, useRef, useState } from "react";
import { createMatch, applyAction, awaiting } from "../engine/match.js";
import { viewFor, eventsFor } from "../engine/view.js";
import { aiAction } from "../engine/ai/index.js";
import { streamFrom } from "../engine/rng.js";

let batchSeq = 0;
const AI_DELAY = { easy: 650, normal: 750, hard: 850 };

/**
 * @param {{ seed: string, settings: any, names: string[], aiLevel?: "easy"|"normal"|"hard", hotseat?: boolean,
 *   initialState?: any, aiPlayer?: 0|1, aiEnabled?: boolean }} opts
 */
export function useLocalGame(opts) {
  const { hotseat = false, aiLevel = "normal", aiPlayer = 1 } = opts;
  const matchRef = useRef(/** @type {any} */ (null));
  if (!matchRef.current) {
    matchRef.current = opts.initialState || createMatch({ seed: opts.seed, settings: opts.settings, names: opts.names, salt: `lokal-${opts.seed}` });
  }
  const aiRng = useRef(streamFrom("ki", opts.seed, Date.now() % 100000));
  const decider = (m) => {
    if (!hotseat) return 0;
    const w = awaiting(m);
    return /** @type {0|1} */ (w.length ? w[0] : 0);
  };
  const [you, setYou] = useState(/** @type {0|1} */ (decider(matchRef.current)));
  const [view, setView] = useState(() => viewFor(matchRef.current, decider(matchRef.current)));
  const [batches, setBatches] = useState(() => [{ id: ++batchSeq, view: viewFor(matchRef.current, decider(matchRef.current)), events: [{ type: "phase", phase: matchRef.current.phase }] }]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [handoff, setHandoff] = useState(false);

  const publish = useCallback((events, actor) => {
    const m = matchRef.current;
    const next = decider(m);
    // Hotseat: die Ereignisse sieht der Handelnde; wechselt der Entscheider, kommt ein Übergabe-Vorhang
    const viewer = hotseat ? actor : 0;
    const v = viewFor(m, viewer);
    setView(v);
    setBatches((b) => [...b.slice(-40), { id: ++batchSeq, view: v, events: eventsFor(events, viewer) }]);
    if (hotseat && next !== actor && m.phase !== "over") {
      setHandoff(true);
    }
    setStep((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotseat]);

  const apply = useCallback((action) => {
    const res = applyAction(matchRef.current, action);
    if (res.error) return { ok: false, error: res.error };
    matchRef.current = res.state;
    publish(res.events, action.player);
    return { ok: true };
  }, [publish]);

  const send = useCallback(async (action) => apply({ ...action, player: you }), [apply, you]);

  /** Hotseat: nächster Spieler hat das Gerät übernommen. */
  const confirmHandoff = useCallback(() => {
    const m = matchRef.current;
    const next = decider(m);
    setYou(next);
    const v = viewFor(m, next);
    setView(v);
    setBatches((b) => [...b.slice(-40), { id: ++batchSeq, view: v, events: [] }]);
    setHandoff(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KI am Zug?
  useEffect(() => {
    if (hotseat || opts.aiEnabled === false || busy) return undefined;
    const m = matchRef.current;
    if (m.phase === "over" || !awaiting(m).includes(aiPlayer)) return undefined;
    const t = setTimeout(() => {
      const cur = matchRef.current;
      if (!awaiting(cur).includes(aiPlayer)) return;
      const a = aiAction(cur, aiPlayer, aiLevel, aiRng.current);
      if (!a) return;
      const res = apply(a);
      if (!res.ok) apply({ type: "timeout", player: aiPlayer });
    }, AI_DELAY[aiLevel] || 700);
    return () => clearTimeout(t);
  }, [step, busy, hotseat, aiLevel, aiPlayer, apply, opts.aiEnabled]);

  /** Direkter Zugriff (Tutorial): Aktion für einen beliebigen Spieler anwenden. */
  const applyAs = useCallback((action) => apply(action), [apply]);

  const lobby = {
    rematch: () => {
      const seed = `${opts.seed}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`.slice(-12);
      matchRef.current = createMatch({ seed, settings: opts.settings, names: opts.names, salt: `lokal-${seed}`, draftRound: (matchRef.current.draftRound || 0) + 1 });
      publish([{ type: "phase", phase: "draft" }], decider(matchRef.current));
      setYou(decider(matchRef.current));
      return Promise.resolve({ ok: true });
    },
  };

  return {
    mode: hotseat ? "hotseat" : "local",
    you,
    view,
    batches,
    timers: {},
    clockOffset: 0,
    connection: "connected",
    notice: null,
    error: null,
    send,
    applyAs,
    setBusy,
    handoff,
    confirmHandoff,
    lobby,
    getMatch: () => matchRef.current,
  };
}
