// Ego-Volleyball — Spielfeld-Komponente im Blobby-Raum (statt BlobbyGame, wenn das Spielfeld
// in den Raumeinstellungen auf "Ego 3D" steht; der Einstellungswert heißt weiter "beach").
//
// Rollen:
//   · Host (wer den Raum aufgemacht hat): rechnet das Spiel in beach/hostWorker.js, nimmt
//     die Eingaben der anderen entgegen und verteilt Schnappschüsse.
//   · Mitspieler: schicken nur ihre Eingaben und zeigen, was der Host schickt.
//   · Zuschauer: bekommen die Schnappschüsse über den Server und sehen das Feld von der Seite.
//
// Angezeigt wird für alle gleich: ein Puffer aus Schnappschüssen, abgelesen an EINER Uhr
// in Spiel-Frames, ein Stück hinter dem neuesten Stand. Das ist dieselbe Regel wie im
// klassischen Modus (siehe Kopf von BlobbyRoom.jsx): keine Vorhersage, eine Wahrheit.
// Die einzige Ausnahme ist der eigene BLICK: Er kommt direkt von der Maus und läuft nie
// durchs Netz — eine Kamera, die der Maus hinterherhängt, ist unspielbar.
//
// Üben: Solange der Host auf Mitspieler wartet, kann er allein gegen den Bot spielen
// (beach/bot.js). Das läuft komplett lokal; der Server erfährt davon nichts. Ein- und
// ausgeschaltet wird es im Raum (BlobbyRoom.jsx: Knopf in der Warte-Karte).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { createBeachLink } from "./link";
import { createSfx } from "./sfx";
import { teamOf, slotsFor, startYaw, inReach, TICK_MS, TICK_HZ, POWERUP_TYPES, DASH_COOLDOWN } from "./sim";

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

const MOUSE_RAD_PER_PX = 0.0022;
const PITCH_LIMIT = 1.45;
const SENS_KEY = "blobby_ego_sens";
const SEND_MS = 33;          // Blick und Tasten höchstens so oft schicken …
const REPEAT_MS = 120;       // … und spätestens so oft wiederholen (die Leitung darf verlieren)
const PRACTICE_MATCH = -1;   // Kennung der Übungspartie im Schnappschuss

function readSens() {
  try {
    const v = Number(localStorage.getItem(SENS_KEY));
    return v >= 0.3 && v <= 2.5 ? v : 1;
  } catch {
    return 1;
  }
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

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
      yaw: pb[6] || 0,
      pitch: pb[7] || 0,
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

const Key = ({ children }) => <span className="bv-kbd">{children}</span>;

export default function BeachGame({ socket, game, mySlot, onHud, practice = false, onPractice }) {
  const settings = game?.settings || {};
  const mode = settings.mode === "2v2" ? "2v2" : "1v1";
  const status = game?.status || "waiting";
  const isHost = !!mySlot && mySlot === game?.hostSlot;
  const matchId = game?.matchId || 0;
  const playing = status === "playing";

  const [practiceRun, setPracticeRun] = useState(0);
  const [practiceOver, setPracticeOver] = useState(0);   // Siegerteam der Übungspartie
  const canPractice = isHost && status === "waiting";
  const practising = practice && canPractice;
  const active = !!mySlot && (playing || practising);
  // Beim Üben sind alle Plätze besetzt (die fehlenden spielt der Bot)
  const slots = practising ? slotsFor(mode) : (game?.slots || []);

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const crossRef = useRef(null);
  const arrowRef = useRef(null);
  const dashRef = useRef(null);
  const scoreRef = useRef(null);
  const r3dRef = useRef(null);
  const linkRef = useRef(null);
  const workerRef = useRef(null);
  const sfxRef = useRef(null);
  const bufRef = useRef([]);              // [{ f, m, b, pl, ph, ... }]
  const playRef = useRef({ f: 0, live: false });
  const netRef = useRef({ lastAt: 0, gap: TICK_MS, jit: 2 });
  const keysRef = useRef({});
  const lookRef = useRef({ yaw: startYaw(mySlot || 1), pitch: 0 });
  const clickRef = useRef({ hc: 0, hk: 1, dc: 0 });
  const sensRef = useRef(readSens());
  const seqRef = useRef(0);
  const seenSeqRef = useRef({});          // Host: letzte Eingabenummer je Platz
  const sentRef = useRef({ key: "", at: 0 });
  const evRef = useRef(0);
  const scoreSeenRef = useRef("");
  const punchRef = useRef(false);
  const scoreSentRef = useRef("");
  const pingRef = useRef({ rtt: null });
  const gameRef = useRef(game);
  gameRef.current = game;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const mySlotRef = useRef(mySlot);
  mySlotRef.current = mySlot;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const practisingRef = useRef(practising);
  practisingRef.current = practising;
  const activeRef = useRef(active);
  activeRef.current = active;
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;
  const [linkInfo, setLinkInfo] = useState({ status: {}, rtt: null });
  const [failed, setFailed] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  lockedRef.current = locked;
  const [full, setFull] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sens, setSens] = useState(sensRef.current);

  // Übung endet von selbst, sobald die echte Partie startet oder man nicht mehr Host ist
  useEffect(() => {
    if (!canPractice && practice) onPractice?.(false);
  }, [canPractice, practice, onPractice]);

  // Neuer Platz (Seitenwechsel): Blick wieder übers Netz
  useEffect(() => {
    lookRef.current = { yaw: startYaw(mySlot || 1), pitch: 0 };
  }, [mySlot]);

  useEffect(() => {
    const sfx = createSfx();
    sfxRef.current = sfx;
    setMuted(sfx.muted);
    return () => { sfx.close(); sfxRef.current = null; };
  }, []);

  // ── Schnappschuss in den Puffer ───────────────────────────────────────────
  const pushSnapRef = useRef(null);
  pushSnapRef.current = (snap) => {
    const buf = bufRef.current;
    const last = buf[buf.length - 1];
    // Neue Partie (Revanche, Übung) oder Frame-Zähler von vorn: Puffer leeren statt rückwärts spielen
    if (last && (snap.m !== last.m || snap.f < last.f - 30)) {
      buf.length = 0;
      playRef.current.live = false;
      evRef.current = snap.ev?.[0] || 0;
      scoreSeenRef.current = "";
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

    // Ballberührung: Ton für alle, Bildruck beim eigenen Schlag
    const my = mySlotRef.current;
    const ev = snap.ev;
    if (ev && ev[0] !== evRef.current) {
      evRef.current = ev[0];
      const mine = ev[2] === my;
      sfxRef.current?.touch(ev[1], mine ? 1 : 0.6);
      if (mine && ev[1] > 0) punchRef.current = true;
    }
    const scoreKey = `${snap.sc[0]}:${snap.sc[1]}`;
    if (scoreKey !== scoreSeenRef.current) {
      if (scoreSeenRef.current && my) {
        const [a, b] = scoreSeenRef.current.split(":").map(Number);
        const scorer = snap.sc[0] > a ? 1 : snap.sc[1] > b ? 2 : 0;
        if (scorer) sfxRef.current?.point(scorer === teamOf(my));
      }
      scoreSeenRef.current = scoreKey;
    }
    if (snap.m === PRACTICE_MATCH && snap.wn) setPracticeOver(snap.wn);

    const me = my ? snap.pl?.[my] : null;
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
          if (!isHostRef.current || !workerRef.current || practisingRef.current) return;
          // Die Leitung ist ungeordnet: Ein überholtes Paket darf den neueren Stand nicht
          // zurückdrehen. Ein Neustart des Zählers (Mitspieler neu verbunden) wird angenommen.
          const s = Number(msg.s) || 0;
          const seen = seenSeqRef.current[from] || 0;
          if (s <= seen && s > seen - 200) return;
          seenSeqRef.current[from] = s;
          workerRef.current.postMessage({
            t: "input", slot: from,
            inp: {
              dx: num(msg.dx, -1, 1), dz: num(msg.dz, -1, 1), jump: !!msg.j,
              yaw: num(msg.y, -10, 10), pitch: num(msg.p, -1.5, 1.5),
              hc: msg.hc | 0, hk: msg.hk === 2 ? 2 : 1, dc: msg.dc | 0,
            },
          });
        } else if (msg.t === "u") {
          if (isHostRef.current && !practisingRef.current) workerRef.current?.postMessage({ t: "power", slot: from });
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

  // ── Host: Spielrechnung (echte Partie oder Übung gegen den Bot) ────────────
  useEffect(() => {
    if (!isHost || !(playing || practising)) return undefined;
    let worker;
    try {
      worker = new Worker(new URL("./hostWorker.js", import.meta.url), { type: "module" });
    } catch {
      return undefined;
    }
    workerRef.current = worker;
    const g = gameRef.current;
    const buf = bufRef.current;
    const play = playRef.current;
    const solo = practising;
    scoreSentRef.current = "";
    seenSeqRef.current = {};
    sentRef.current = { key: "", at: 0 };
    setPracticeOver(0);
    worker.onmessage = (e) => {
      const m = e.data;
      if (m?.t !== "snap") return;
      const snap = { t: "s", m: solo ? PRACTICE_MATCH : matchId, ...m.snap };
      pushSnapRef.current(snap);
      if (solo) return;
      const cur = gameRef.current;
      linkRef.current?.broadcast(snap, cur?.slots || [], (cur?.spectatorCount || 0) > 0);
      // Punktestand an den Server — der führt Lobby, Anzeigetafel und Revanche
      const key = `${snap.sc[0]}:${snap.sc[1]}:${snap.wn}`;
      if (key !== scoreSentRef.current) {
        scoreSentRef.current = key;
        socket.emit("bb:score", { matchId, sc: snap.sc, winner: snap.wn });
      }
    };
    const me = mySlotRef.current;
    worker.postMessage({
      t: "start", mode: g?.settings?.mode, serveTeam: solo ? teamOf(me) : (g?.serveTeam || 1),
      maxTouches: g?.settings?.maxTouches || 0,
      powerups: !!g?.settings?.powerups,
      bots: solo ? slotsFor(g?.settings?.mode).filter((s) => s !== me) : [],
    });
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      // Der Übungsstand soll nicht stehen bleiben, wenn die Übung endet
      if (solo) { buf.length = 0; play.live = false; }
    };
  }, [isHost, playing, practising, practiceRun, matchId, socket]);

  // Ist jemand getrennt, hält der Host die Zeit an (wie der Server im klassischen Modus)
  const someoneAway = playing && (game?.slots || []).some((s) => !game?.players?.[s]?.connected);
  useEffect(() => {
    workerRef.current?.postMessage({ t: "pause", v: someoneAway });
  }, [someoneAway, matchId, isHost, playing]);

  // ── Eingaben ──────────────────────────────────────────────────────────────
  // Laufrichtung hängt am Blick: vorwärts ist (cos yaw, sin yaw), rechts (-sin yaw, cos yaw).
  const sendInput = useCallback((force) => {
    const slot = mySlotRef.current;
    if (!slot || !activeRef.current) return;
    const k = keysRef.current;
    const { yaw, pitch } = lookRef.current;
    const f = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    const r = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    let dx = f * c - r * s;
    let dz = f * s + r * c;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const cl = clickRef.current;
    const inp = {
      dx: round3(dx), dz: round3(dz), jump: !!k.jump,
      yaw: round3(yaw), pitch: round3(pitch), hc: cl.hc, hk: cl.hk, dc: cl.dc,
    };
    const key = `${inp.dx}|${inp.dz}|${inp.jump ? 1 : 0}|${inp.yaw}|${inp.pitch}|${inp.hc}|${inp.dc}`;
    const now = performance.now();
    const sent = sentRef.current;
    if (!force && (key === sent.key ? now - sent.at < REPEAT_MS : false)) return;
    sent.key = key;
    sent.at = now;
    if (isHostRef.current) {
      workerRef.current?.postMessage({ t: "input", slot, inp });
    } else {
      seqRef.current += 1;
      linkRef.current?.toHost({
        t: "i", s: seqRef.current, dx: inp.dx, dz: inp.dz, j: inp.jump ? 1 : 0,
        y: inp.yaw, p: inp.pitch, hc: inp.hc, hk: inp.hk, dc: inp.dc,
      });
    }
  }, []);

  const zuenden = useCallback(() => {
    const slot = mySlotRef.current;
    if (!slot) return;
    if (isHostRef.current) workerRef.current?.postMessage({ t: "power", slot });
    else linkRef.current?.toHost({ t: "u" });
  }, []);

  const toggleFull = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => { /* vom Browser verweigert — dann eben im Fenster */ });
  }, []);

  const toggleMute = useCallback(() => {
    const sfx = sfxRef.current;
    if (!sfx) return;
    sfx.setMuted(!sfx.muted);
    setMuted(sfx.muted);
  }, []);

  const lockMouse = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !activeRef.current) return;
    try {
      const p = c.requestPointerLock?.();
      if (p && typeof p.catch === "function") p.catch(() => { /* zu schnell nach Esc — nächster Klick klappt */ });
    } catch { /* nicht unterstützt */ }
  }, []);

  useEffect(() => {
    if (!mySlot) return undefined;
    const isTyping = (e) => {
      const el = e.target;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onDown = (e) => {
      if (isTyping(e) || !activeRef.current) return;
      const key = e.key.toLowerCase();
      if (e.repeat && (key === "e" || key === "shift" || key === "f" || key === "m")) return;
      if (key === "e") { zuenden(); return; }
      if (key === "f") { toggleFull(); return; }
      if (key === "m") { toggleMute(); return; }
      if (key === "shift") {
        clickRef.current.dc += 1;
        sfxRef.current?.dash();
        sendInput(true);
        return;
      }
      const k = KEY_MAP[key];
      if (!k) return;
      e.preventDefault();
      if (keysRef.current[k]) return;
      keysRef.current[k] = true;
      sendInput(true);
    };
    const onUp = (e) => {
      const k = KEY_MAP[e.key.toLowerCase()];
      if (!k || !keysRef.current[k]) return;
      keysRef.current[k] = false;
      sendInput(true);
    };
    const release = () => { keysRef.current = {}; sendInput(true); };
    const onLock = () => {
      const on = document.pointerLockElement === canvasRef.current;
      setLocked(on);
      if (!on) release();
    };
    const onMove = (e) => {
      if (document.pointerLockElement !== canvasRef.current) return;
      const look = lookRef.current;
      const k = MOUSE_RAD_PER_PX * sensRef.current;
      let yaw = look.yaw + e.movementX * k;
      if (yaw > Math.PI) yaw -= Math.PI * 2;
      else if (yaw < -Math.PI) yaw += Math.PI * 2;
      look.yaw = yaw;
      look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch - e.movementY * k));
    };
    const onMouseDown = (e) => {
      if (document.pointerLockElement !== canvasRef.current || !activeRef.current) return;
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      clickRef.current.hk = e.button === 2 ? 2 : 1;
      clickRef.current.hc += 1;
      sfxRef.current?.swing();
      // Sofort schicken, mit dem Blick dieses Augenblicks — der Schlag geht dorthin
      sendInput(true);
    };
    const onFull = () => setFull(document.fullscreenElement === wrapRef.current);
    // Blick fließt ständig; alle 33 ms reicht, weil er nur beim Schlag und für die Figur zählt
    const timer = setInterval(() => sendInput(false), SEND_MS);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    document.addEventListener("pointerlockchange", onLock);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("pointerlockchange", onLock);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, [mySlot, sendInput, zuenden, toggleFull, toggleMute]);

  // Partie vorbei oder Übung beendet: Maus wieder freigeben
  useEffect(() => {
    if (!active && document.pointerLockElement === canvasRef.current) document.exitPointerLock?.();
  }, [active]);

  // ── Darstellung ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let ro = null;
    let instance = null;
    let resize = null;
    import("./renderBeach")
      .then(({ createBeach3D }) => {
        if (cancelled || !canvasRef.current || !wrapRef.current) return;
        instance = createBeach3D(canvasRef.current, { mode });
        if (!instance) { setFailed(true); return; }
        r3dRef.current = instance;
        resize = () => {
          const wrap = wrapRef.current;
          if (!wrap) return;
          const w = wrap.clientWidth || 0;
          const fs = document.fullscreenElement === wrap;
          const h = fs ? wrap.clientHeight : Math.round((w * 9) / 16);
          if (w > 0 && h > 0) instance.setSize(w, h, window.devicePixelRatio || 1);
        };
        resize();
        ro = new ResizeObserver(resize);
        ro.observe(wrapRef.current);
        document.addEventListener("fullscreenchange", resize);

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
          const solo = practisingRef.current;
          const my = mySlotRef.current;
          const shown = slotsRef.current;
          const names = {};
          for (const s of shown) names[s] = g?.players?.[s]?.name || (solo ? "Bot" : "");
          const ego = !!my && activeRef.current;
          const punch = punchRef.current;
          punchRef.current = false;
          const ballView = instance.render(st, {
            slots: shown, names, mySlot: ego ? my : null,
            look: ego ? lookRef.current : null, punch, dt,
          });

          // Anzeigen direkt am DOM — kein React-Render pro Bild
          const me = ego ? st.blobs[my] : null;
          if (crossRef.current) {
            const reach = !!me && rally && inReach(st.ball, me);
            crossRef.current.dataset.reach = reach ? "1" : "0";
            crossRef.current.style.display = ego ? "" : "none";
          }
          if (arrowRef.current) {
            const show = ego && rally && ballView.off;
            arrowRef.current.style.display = show ? "" : "none";
            if (show) {
              arrowRef.current.style.left = `${50 + ballView.ax * 42}%`;
              arrowRef.current.style.top = `${50 - ballView.ay * 40}%`;
              arrowRef.current.style.transform =
                `translate(-50%, -50%) rotate(${Math.atan2(ballView.ax, ballView.ay)}rad)`;
            }
          }
          if (dashRef.current) {
            const cool = ego ? (latest.pl?.[my]?.[9] || 0) : 0;
            dashRef.current.style.transform = `scaleX(${1 - Math.min(1, cool / DASH_COOLDOWN)})`;
            dashRef.current.parentElement.style.display = ego ? "" : "none";
          }
          if (scoreRef.current) {
            const myTeam = my ? teamOf(my) : 1;
            const own = latest.sc[myTeam - 1];
            const other = latest.sc[myTeam === 1 ? 1 : 0];
            const text = `${own} : ${other}`;
            if (scoreRef.current.textContent !== text) scoreRef.current.textContent = text;
          }
        };
        raf = requestAnimationFrame(frame);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (resize) document.removeEventListener("fullscreenchange", resize);
      r3dRef.current = null;
      instance?.dispose();
    };
  }, [mode]);

  const changeSens = (e) => {
    const v = Number(e.target.value);
    sensRef.current = v;
    setSens(v);
    try { localStorage.setItem(SENS_KEY, String(v)); } catch { /* privates Fenster */ }
  };

  // Anzeige der Verbindung: Host / direkt / über Server
  let linkLabel = null;
  if (practising) linkLabel = "Übung gegen den Bot";
  else if (isHost) linkLabel = "Du bist Host";
  else if (mySlot) {
    const st = linkInfo.status[game?.hostSlot];
    const how = st === "direct" ? "Direktverbindung" : "über Server";
    linkLabel = linkInfo.rtt != null ? `${how} · ${linkInfo.rtt} ms` : how;
  }

  const showMenu = active && !locked && !failed && !IS_COARSE_POINTER;
  const myTeam = mySlot ? teamOf(mySlot) : 0;

  return (
    <div ref={wrapRef} className="w-full relative bg-black select-none">
      <canvas
        ref={canvasRef}
        className="block w-full bv-field"
        style={full ? { height: "100%", touchAction: "none" } : { aspectRatio: "16 / 9", touchAction: "none" }}
        onClick={lockMouse}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Fadenkreuz: wird kräftig, sobald der Ball in Schlagreichweite ist */}
      <div ref={crossRef} className="bv-ego-cross" data-reach="0" style={{ display: "none" }} />

      {/* Pfeil am Bildrand zum Ball, wenn er außerhalb des Blickfelds fliegt */}
      <div ref={arrowRef} className="bv-ego-arrow" style={{ display: "none" }}>
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <path d="M17 3 L30 24 L17 18 L4 24 Z" fill="#fff" stroke="#12304d" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Hechtsprung: Balken füllt sich, bis er wieder bereit ist */}
      <div className="bv-ego-dash" style={{ display: "none" }} title="Hechtsprung">
        <div ref={dashRef} />
      </div>

      {/* Eigener Spielstand im Bild — im Vollbild und beim Üben gibt es sonst keinen */}
      {active && (full || practising) && (
        <div className="absolute top-3 right-3 px-3 py-1 rounded-md bg-[var(--bv-paper)] border-2 border-[var(--bv-ink)] pointer-events-none">
          <span ref={scoreRef} className="bv-display text-[20px] text-[var(--bv-ink)] tabular-nums">0 : 0</span>
        </div>
      )}

      {linkLabel && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/55 text-[11px] text-white/80 pointer-events-none">
          {linkLabel}
        </div>
      )}

      {active && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <button type="button" onClick={toggleMute} className="bv-ego-tool" title={muted ? "Ton an (M)" : "Ton aus (M)"} aria-label={muted ? "Ton an" : "Ton aus"}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button type="button" onClick={toggleFull} className="bv-ego-tool" title="Vollbild (F)" aria-label="Vollbild">
            <Maximize size={15} />
          </button>
        </div>
      )}

      {/* Maus nicht gefangen: Menü mit Steuerung. Die Partie läuft dahinter weiter. */}
      {showMenu && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-[rgb(8_16_28_/_0.55)]">
          <div className="bv-card w-full max-w-[440px] p-5 text-[var(--bv-ink)]">
            {practising && practiceOver ? (
              <h3 className="bv-display text-[24px] mb-3">{practiceOver === myTeam ? "Gewonnen!" : "Der Bot hat gewonnen"}</h3>
            ) : (
              <h3 className="bv-display text-[24px] mb-3">{practising ? "Übung gegen den Bot" : "Ego-Volleyball"}</h3>
            )}
            <ul className="space-y-2 text-[14px] mb-4">
              <li className="flex flex-wrap items-center gap-1.5"><Key>Maus</Key> umsehen — der Ball fliegt dorthin, wo du hinschaust</li>
              <li className="flex flex-wrap items-center gap-1.5"><Key>Linksklick</Key> schlagen — im Sprung vor der Angriffslinie wird daraus ein Schmetterball</li>
              <li className="flex flex-wrap items-center gap-1.5"><Key>Rechtsklick</Key> hoch zuspielen</li>
              <li className="flex flex-wrap items-center gap-1.5"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> laufen · <Key>Leertaste</Key> springen · <Key>Shift</Key> Hechtsprung</li>
              <li className="bv-dim">Nur Schläge zählen: Ohne Klick fliegt der Ball durch dich hindurch. Der Ring im Sand liegt genau unter dem Ball.</li>
            </ul>
            <label className="flex items-center gap-3 text-[13px] font-semibold mb-4">
              <span className="shrink-0">Maus-Tempo</span>
              <input type="range" min="0.3" max="2.5" step="0.1" value={sens} onChange={changeSens} className="grow" style={{ accentColor: "var(--bv-sea)" }} />
              <span className="tabular-nums w-8 text-right">{sens.toFixed(1)}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {practising && practiceOver ? (
                <button type="button" className="bv-btn" onClick={() => { setPracticeRun((n) => n + 1); lockMouse(); }}>Nochmal</button>
              ) : (
                <button type="button" className="bv-btn" onClick={lockMouse}>Spielen</button>
              )}
              {practising && (
                <button type="button" className="bv-btn bv-btn-ghost" onClick={() => onPractice?.(false)}>Übung beenden</button>
              )}
            </div>
            <p className="text-xs bv-faint mt-3">Esc gibt die Maus wieder frei · F Vollbild · M Ton</p>
          </div>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-white bg-black/60">
          3D wird von diesem Browser nicht unterstützt.
        </div>
      )}
      {IS_COARSE_POINTER && mySlot && !full && (
        <p className="text-center text-xs bv-dim mt-2 bg-[var(--bv-sand)]">Ego-Volleyball braucht Maus und Tastatur.</p>
      )}
    </div>
  );
}
