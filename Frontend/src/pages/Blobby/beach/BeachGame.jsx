// Beach 3D — Spielfeld-Komponente im Blobby-Raum (statt BlobbyGame, wenn das Spielfeld
// in den Raumeinstellungen auf "Beach 3D" steht).
//
// Rollen:
//   · Host (wer den Raum aufgemacht hat): rechnet das Spiel in beach/hostWorker.js, nimmt
//     die Eingaben der anderen entgegen und verteilt Schnappschüsse.
//   · Mitspieler: schicken nur ihre Tasten und zeigen, was der Host schickt.
//   · Zuschauer: bekommen die Schnappschüsse über den Server.
//
// Angezeigt wird für alle gleich: ein Puffer aus Schnappschüssen, abgelesen an EINER Uhr
// in Spiel-Frames, ein Stück hinter dem neuesten Stand. Das ist dieselbe Regel wie im
// klassischen Modus (siehe Kopf von BlobbyRoom.jsx): keine Vorhersage, eine Wahrheit.
// Beim Host ist der Abstand praktisch null, bei Mitspielern so groß wie die Schwankung
// der Leitung verlangt.
import React, { useEffect, useRef, useState } from "react";
import { createBeachLink } from "./link";
import { teamOf, TICK_MS, TICK_HZ, POWERUP_TYPES } from "./sim";

const KEY_MAP = {
  w: "fwd", arrowup: "fwd",
  s: "back", arrowdown: "back",
  a: "left", arrowleft: "left",
  d: "right", arrowright: "right",
  " ": "jump",
};

const IS_COARSE_POINTER = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(pointer: coarse)").matches
  : false;

// Tasten → Weltrichtung. Die Kamera steht hinter dem eigenen Blob und schaut übers Netz:
// Team 1 schaut in +x, Team 2 in -x. "Rechts" ist dann +z bzw. -z.
function keysToInput(keys, slot) {
  const fwd = teamOf(slot) === 1 ? 1 : -1;
  const f = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
  const r = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  return { dx: f * fwd, dz: r * fwd, jump: !!keys.jump };
}

function lerpSnap(a, b, u) {
  const blobs = {};
  for (const slot in b.pl) {
    const pa = a.pl[slot] || b.pl[slot];
    const pb = b.pl[slot];
    blobs[slot] = {
      x: pa[0] + (pb[0] - pa[0]) * u,
      y: pa[1] + (pb[1] - pa[1]) * u,
      z: pa[2] + (pb[2] - pa[2]) * u,
      s: pb[4] || 1,
    };
  }
  const src = u > 0.5 ? b : a;
  const ball = {
    x: a.b[0] + (b.b[0] - a.b[0]) * u,
    y: a.b[1] + (b.b[1] - a.b[1]) * u,
    z: a.b[2] + (b.b[2] - a.b[2]) * u,
    vx: b.b[3], vy: b.b[4], vz: b.b[5],
  };
  const pu = src.pu ? { x: src.pu[0], y: src.pu[1], z: src.pu[2], type: POWERUP_TYPES[src.pu[3]] || "speed" } : null;
  return { blobs, ball, netTop: src.nt, powerup: pu };
}

export default function BeachGame({ socket, game, mySlot, onHud }) {
  const settings = game?.settings || {};
  const mode = settings.mode === "2v2" ? "2v2" : "1v1";
  const slots = game?.slots || [];
  const status = game?.status || "waiting";
  const isHost = !!mySlot && mySlot === game?.hostSlot;
  const matchId = game?.matchId || 0;

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const r3dRef = useRef(null);
  const linkRef = useRef(null);
  const workerRef = useRef(null);
  const bufRef = useRef([]);              // [{ f, m, b, pl, ph, ... }]
  const playRef = useRef({ f: 0, live: false });
  const netRef = useRef({ lastAt: 0, gap: TICK_MS, jit: 2 });
  const keysRef = useRef({});
  const seqRef = useRef(0);
  const lastInputRef = useRef("");
  const scoreSentRef = useRef("");
  const pingRef = useRef({ rtt: null });
  const gameRef = useRef(game);
  gameRef.current = game;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const mySlotRef = useRef(mySlot);
  mySlotRef.current = mySlot;
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;
  const [linkInfo, setLinkInfo] = useState({ status: {}, rtt: null });
  const [failed, setFailed] = useState(false);

  // ── Schnappschuss in den Puffer ───────────────────────────────────────────
  const pushSnapRef = useRef(null);
  pushSnapRef.current = (snap) => {
    const buf = bufRef.current;
    const last = buf[buf.length - 1];
    // Neue Partie (Revanche) oder Frame-Zähler von vorn: Puffer leeren statt rückwärts spielen
    if (last && (snap.m !== last.m || snap.f < last.f - 30)) {
      buf.length = 0;
      playRef.current.live = false;
    }
    if (last && snap.m === last.m && snap.f <= last.f) return;   // doppelt (direkt + Server)
    const now = performance.now();
    const n = netRef.current;
    if (n.lastAt) {
      const gap = now - n.lastAt;
      n.jit = n.jit * 0.9 + Math.abs(gap - n.gap) * 0.1;
      n.gap = n.gap * 0.9 + gap * 0.1;
    }
    n.lastAt = now;
    buf.push(snap);
    if (buf.length > 40) buf.shift();
    if (!playRef.current.live) {
      playRef.current.f = snap.f;
      playRef.current.live = true;
    }
    const me = mySlotRef.current ? snap.pl?.[mySlotRef.current] : null;
    const heldIdx = me ? me[5] : -1;
    onHudRef.current?.({
      phase: snap.ph, phaseFrames: snap.pf, reason: snap.pr,
      touches: snap.tc, lastHit: snap.lh,
      held: heldIdx >= 0 ? POWERUP_TYPES[heldIdx] : null,
      effects: (snap.ef || []).map(([t, team, left]) => ({
        type: POWERUP_TYPES[t], team, secs: Math.max(1, Math.ceil(left / TICK_HZ)),
      })),
    });
  };

  // ── Leitung ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;
    const link = createBeachLink({
      socket,
      mySlot,
      onStatus: (st) => setLinkInfo((prev) => ({ ...prev, status: st })),
      onMessage: (from, msg) => {
        if (msg.t === "s") {
          if (!isHostRef.current) pushSnapRef.current(msg);
        } else if (msg.t === "i") {
          if (!isHostRef.current || !workerRef.current) return;
          workerRef.current.postMessage({
            t: "input", slot: from,
            inp: { dx: Math.sign(msg.dx || 0), dz: Math.sign(msg.dz || 0), jump: !!msg.j },
          });
        } else if (msg.t === "u") {
          if (isHostRef.current) workerRef.current?.postMessage({ t: "power", slot: from });
        } else if (msg.t === "p") {
          if (isHostRef.current) link.toSlot(from, { t: "q", c: msg.c });
        } else if (msg.t === "q") {
          const rtt = performance.now() - msg.c;
          if (rtt >= 0 && rtt < 5000) {
            const prev = pingRef.current.rtt;
            pingRef.current.rtt = prev == null ? rtt : prev * 0.7 + rtt * 0.3;
          }
        }
      },
    });
    linkRef.current = link;
    link.sync(gameRef.current);
    return () => { link.close(); linkRef.current = null; };
  }, [socket, mySlot]);

  useEffect(() => { linkRef.current?.sync(game); }, [game]);

  // Mitspieler messen die Laufzeit zum Host — angezeigt in der Ecke
  useEffect(() => {
    if (isHost || !mySlot) return undefined;
    const id = setInterval(() => {
      linkRef.current?.toHost({ t: "p", c: performance.now() });
      const rtt = pingRef.current.rtt;
      setLinkInfo((prev) => ({ ...prev, rtt: rtt == null ? null : Math.round(rtt) }));
    }, 1000);
    return () => clearInterval(id);
  }, [isHost, mySlot]);

  // ── Host: Spielrechnung ───────────────────────────────────────────────────
  const playing = status === "playing";
  useEffect(() => {
    if (!isHost || !playing) return undefined;
    let worker;
    try {
      worker = new Worker(new URL("./hostWorker.js", import.meta.url), { type: "module" });
    } catch {
      return undefined;
    }
    workerRef.current = worker;
    const g = gameRef.current;
    scoreSentRef.current = "";
    worker.onmessage = (e) => {
      const m = e.data;
      if (m?.t !== "snap") return;
      const snap = { t: "s", m: matchId, ...m.snap };
      pushSnapRef.current(snap);
      const cur = gameRef.current;
      linkRef.current?.broadcast(snap, cur?.slots || [], (cur?.spectatorCount || 0) > 0);
      // Punktestand an den Server — der führt Lobby, Anzeigetafel und Revanche
      const key = `${snap.sc[0]}:${snap.sc[1]}:${snap.wn}`;
      if (key !== scoreSentRef.current) {
        scoreSentRef.current = key;
        socket.emit("bb:score", { matchId, sc: snap.sc, winner: snap.wn });
      }
    };
    worker.postMessage({
      t: "start", mode: g?.settings?.mode, serveTeam: g?.serveTeam || 1,
      maxTouches: g?.settings?.maxTouches || 0,
      powerups: !!g?.settings?.powerups,
    });
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [isHost, playing, matchId, socket]);

  // Ist jemand getrennt, hält der Host die Zeit an (wie der Server im klassischen Modus)
  const someoneAway = slots.some((s) => !game?.players?.[s]?.connected);
  useEffect(() => {
    workerRef.current?.postMessage({ t: "pause", v: someoneAway });
  }, [someoneAway, matchId, isHost, playing]);

  // ── Tastatur ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mySlot) return undefined;
    const send = (force) => {
      const inp = keysToInput(keysRef.current, mySlot);
      const key = `${inp.dx}|${inp.dz}|${inp.jump ? 1 : 0}`;
      if (!force && key === lastInputRef.current) return;
      lastInputRef.current = key;
      if (isHostRef.current) {
        workerRef.current?.postMessage({ t: "input", slot: mySlot, inp });
      } else {
        seqRef.current += 1;
        linkRef.current?.toHost({ t: "i", s: seqRef.current, dx: inp.dx, dz: inp.dz, j: inp.jump ? 1 : 0 });
      }
    };
    const isTyping = (e) => {
      const el = e.target;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onDown = (e) => {
      if (isTyping(e)) return;
      // E zündet das eingesammelte Powerup (Leertaste ist hier die Sprungtaste)
      if (e.key.toLowerCase() === "e" && !e.repeat) {
        if (isHostRef.current) workerRef.current?.postMessage({ t: "power", slot: mySlot });
        else linkRef.current?.toHost({ t: "u" });
        return;
      }
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (keysRef.current[k]) return;
      keysRef.current[k] = true;
      send(false);
    };
    const onUp = (e) => {
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k) return;
      keysRef.current[k] = false;
      send(false);
    };
    const onBlur = () => { keysRef.current = {}; send(false); };
    // Der Kanal ist bewusst unzuverlässig: ein verlorener Tastenwechsel würde sonst
    // hängen bleiben. Deshalb den aktuellen Stand regelmäßig wiederholen.
    const repeat = setInterval(() => send(true), 120);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      clearInterval(repeat);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [mySlot]);

  // ── Darstellung ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let ro = null;
    let instance = null;
    import("./renderBeach")
      .then(({ createBeach3D }) => {
        if (cancelled || !canvasRef.current || !wrapRef.current) return;
        instance = createBeach3D(canvasRef.current, { mode });
        if (!instance) { setFailed(true); return; }
        r3dRef.current = instance;
        const resize = () => {
          const w = wrapRef.current?.clientWidth || 0;
          if (w > 0) instance.setSize(w, Math.round((w * 9) / 16), window.devicePixelRatio || 1);
        };
        resize();
        ro = new ResizeObserver(resize);
        ro.observe(wrapRef.current);

        let last = performance.now();
        const frame = (now) => {
          raf = requestAnimationFrame(frame);
          let dt = now - last;
          last = now;
          if (dt > 250) dt = 250;
          const buf = bufRef.current;
          if (!buf.length) return;
          const play = playRef.current;
          const latest = buf[buf.length - 1];

          // Abstand zum neuesten Stand: beim Host ein Frame, sonst so viel, wie die
          // Leitung schwankt (ein Paketabstand plus zweimal die Schwankung).
          const n = netRef.current;
          const delayMs = isHostRef.current ? TICK_MS : Math.max(18, Math.min(220, n.gap + n.jit * 2));
          const target = latest.f - delayMs / TICK_MS;
          play.f += dt / TICK_MS;
          const err = target - play.f;
          if (Math.abs(err) > 25) play.f = target;
          else play.f += err * 0.06;

          let a = buf[0];
          let b = buf[0];
          for (let i = 1; i < buf.length; i++) {
            if (buf[i].f >= play.f) { a = buf[i - 1]; b = buf[i]; break; }
            a = buf[i]; b = buf[i];
          }
          const span = b.f - a.f || 1;
          const u = Math.max(0, Math.min(1, (play.f - a.f) / span));
          const st = lerpSnap(a, b, u);
          const rally = (u > 0.5 ? b : a).ph === "rally";
          st.rally = rally;

          const g = gameRef.current;
          const names = {};
          for (const s of g?.slots || []) names[s] = g?.players?.[s]?.name || "";
          instance.render(st, { slots: g?.slots || [], names, mySlot: mySlotRef.current, dt });
        };
        raf = requestAnimationFrame(frame);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      r3dRef.current = null;
      instance?.dispose();
    };
  }, [mode]);

  // Anzeige der Verbindung: Host / direkt / über Server
  let linkLabel = null;
  if (isHost) linkLabel = "Du bist Host";
  else if (mySlot) {
    const st = linkInfo.status[game?.hostSlot];
    const how = st === "direct" ? "Direktverbindung" : "über Server";
    linkLabel = linkInfo.rtt != null ? `${how} · ${linkInfo.rtt} ms` : how;
  }

  return (
    <div ref={wrapRef} className="w-full relative">
      <canvas ref={canvasRef} className="block w-full bv-field" style={{ aspectRatio: "16 / 9", touchAction: "none" }} />
      {linkLabel && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/55 text-[11px] text-white/80 pointer-events-none">
          {linkLabel}
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-white bg-black/60">
          3D wird von diesem Browser nicht unterstützt.
        </div>
      )}
      {IS_COARSE_POINTER && mySlot && (
        <p className="text-center text-xs bv-dim mt-2">Das Beach-Feld braucht im Moment eine Tastatur.</p>
      )}
    </div>
  );
}
