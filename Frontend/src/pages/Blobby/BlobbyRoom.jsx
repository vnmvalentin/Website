// BlobbyRoom.jsx — Spielraum: Beitritts-Flow über den Link-Code (wie Connect4), danach das
// eigentliche Spielfeld auf einem Canvas.
//
// Netzcode: Der Server rechnet mit 75 Hz und schickt jeden zweiten Frame einen Schnappschuss.
// Die drei beweglichen Dinge werden bewusst unterschiedlich behandelt:
//
//   · Eigener Blob — lokal mitsimuliert, reagiert also ohne Wartezeit auf die Tastatur.
//     Der Server quittiert jede Eingabe mit laufender Nummer und Alter; damit vergleicht
//     der Client den Serverstand mit genau dem eigenen Frame, den dieser abbildet, und
//     korrigiert nur echte Abweichungen statt den Laufzeitversatz.
//   · Ball — Flugbahn ist bekannt, wird also um die gemessene halbe Laufzeit vorausgerechnet.
//   · Gegner — NICHT vorausgerechnet, sondern zwischen zwei gepufferten Schnappschüssen
//     interpoliert und dafür knapp einen Paketabstand verzögert gezeigt. Vorausrechnen
//     hieße raten, wann der andere loslässt, und jede Fehlannahme müsste sichtbar
//     zurückgenommen werden.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import {
  Volleyball, Copy, Check, LogOut, RotateCcw, Loader2, Users, Settings2, ArrowLeftRight,
  ChevronLeft, ChevronRight, ChevronUp,
} from "lucide-react";
import SEO from "../../components/SEO";
import BlobbySettings from "./BlobbySettings";
import { DEFAULT_SETTINGS, normalizeSettings, POWERUP_LABELS, settingsSummary } from "./settings";
import { SLOT_COLOR, TEAM_COLOR, POWERUP_COLOR, drawScene } from "./render";
import {
  WORLD_H, FIELD_W, NET_BASE_TOP, BALL_RADIUS, BLOBBY_SPEED, TICK_HZ, TICK_MS,
  teamOf, groundPlaneFor, slotStartX,
  stepBlob, clampToField, clampToHalf, blobNetCollision, blobBlobCollision,
  integrateBall, ballWorldCollision, ballBlobCollision, stepBallFree,
} from "./physics";
import { POWERUP_TYPES } from "./physics";

const HISTORY = 192;                                       // ~2,5 s eigene Vergangenheit
const NO_INPUT = { left: false, right: false, jump: false };

// Touch-Gerät? Dann kommen die drei Steuertasten unter das Feld und der Hinweistext
// erklärt sie statt der Tastatur.
const IS_COARSE_POINTER = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(pointer: coarse)").matches
  : false;

function freshWorld(mode) {
  const width = FIELD_W[mode] || FIELD_W["1v1"];
  const blobs = {};
  for (const slot of [1, 2, 3, 4]) {
    blobs[slot] = {
      x: slotStartX(slot, mode), y: groundPlaneFor(1), vy: 0,
      grounded: true, scale: 1, speed: 1,
    };
  }
  return {
    mode,
    width,
    netX: width / 2,
    netTop: NET_BASE_TOP,
    phase: "serve",
    frame: 0,
    blobs,
    ball: { x: slotStartX(1, mode), y: 269 + BALL_RADIUS, vx: 0, vy: 0 },
    ballPrev: { x: slotStartX(1, mode), y: 269 + BALL_RADIUS },
    touching: { 1: false, 2: false, 3: false, 4: false },
    powerup: null,
    rot: 0,
    bob: 0,
  };
}

// ── Spielfeld + Steuerung ───────────────────────────────────────────────────

// Wer rechts spielt, bekommt das Feld gespiegelt: jeder sieht sich selbst links. Intern
// bleibt alles in Weltkoordinaten — gespiegelt wird nur beim Zeichnen, und die Laufrichtung
// der Tasten wird beim Einlesen umgedreht.
function BlobbyGame({ socket, mySlot, status, players, settings, slots, mirror, onHud }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const worldRef = useRef(freshWorld(settings.mode));
  const inputRef = useRef({ left: false, right: false, jump: false });
  const sentMaskRef = useRef(0);
  // Gegner werden aus gepufferten Schnappschüssen interpoliert statt vorausgerechnet
  const remoteBufRef = useRef({});
  const gapRef = useRef(30);          // gemittelter Abstand zwischen zwei Schnappschüssen
  const lastSnapAtRef = useRef(0);
  const hitGuardRef = useRef(0);      // Frames, in denen der Serverball noch veraltet ist
  const lagMsRef = useRef(50);
  const liveRef = useRef(false);
  const namesRef = useRef({});
  const slotsRef = useRef(slots);
  const crossNetRef = useRef(settings.crossNet);
  // Eigene Vergangenheit: pro simuliertem Frame ein Eintrag. Damit lässt sich der
  // Serverstand mit genau dem eigenen Frame vergleichen, den er abbildet.
  const tickRef = useRef(0);
  const histRef = useRef(Array.from({ length: HISTORY }, () => ({ x: 0, y: 0, vy: 0, grounded: true })));
  const seqRef = useRef(0);
  const seqLogRef = useRef([{ seq: 0, tick: 0 }]);
  const driftRef = useRef(0);
  const [touchUi, setTouchUi] = useState({ left: false, right: false, jump: false });

  liveRef.current = status === "playing";
  slotsRef.current = slots;
  crossNetRef.current = settings.crossNet;
  namesRef.current = Object.fromEntries(slots.map((s) => [s, players?.[s]?.name || ""]));

  // Nur Änderungen gehen raus — gehaltene Tasten kosten kein Netz. Die laufende Nummer
  // kommt im Schnappschuss zurück und verankert dort die Vorhersage.
  const pushInput = useCallback(() => {
    const i = inputRef.current;
    const mask = (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.jump ? 4 : 0);
    if (mask === sentMaskRef.current) return;
    sentMaskRef.current = mask;
    seqRef.current += 1;
    seqLogRef.current.push({ seq: seqRef.current, tick: tickRef.current });
    if (seqLogRef.current.length > 64) seqLogRef.current.shift();
    socket?.emit("bv:input", { left: i.left, right: i.right, jump: i.jump, seq: seqRef.current });
  }, [socket]);

  // `field` ist die Richtung auf dem BILDSCHIRM, gespeichert wird in Weltkoordinaten
  const setKey = useCallback((field, down) => {
    if (!mySlot) return;
    const world = mirror && field === "left" ? "right" : mirror && field === "right" ? "left" : field;
    if (inputRef.current[world] === down) return;
    inputRef.current[world] = down;
    pushInput();
    setTouchUi((prev) => (prev[field] === down ? prev : { ...prev, [field]: down }));
  }, [mySlot, pushInput, mirror]);

  // ── Tastatur: WASD und Pfeiltasten, Sprung zusätzlich auf der Leertaste ──
  useEffect(() => {
    if (!mySlot) return undefined;
    const fieldFor = (key) => {
      if (key === "a" || key === "arrowleft") return "left";
      if (key === "d" || key === "arrowright") return "right";
      if (key === "w" || key === "arrowup" || key === " " || key === "spacebar") return "jump";
      return null;
    };
    const isTyping = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isTyping(e.target) || e.repeat) return;
      const field = fieldFor(e.key.toLowerCase());
      if (!field) return;
      e.preventDefault();
      setKey(field, true);
    };
    const onKeyUp = (e) => {
      const field = fieldFor(e.key.toLowerCase());
      if (!field) return;
      e.preventDefault();
      setKey(field, false);
    };
    // Fenster weg / Tab gewechselt: sonst läuft der Blob mit gehaltener Taste weiter
    const release = () => {
      inputRef.current = { left: false, right: false, jump: false };
      pushInput();
      setTouchUi({ left: false, right: false, jump: false });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [mySlot, setKey, pushInput]);

  // ── Laufzeitmessung für die Vorausberechnung ────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;
    const ping = () => {
      const sentAt = performance.now();
      socket.emit("bv:ping", { c: sentAt }, (res) => {
        if (!res?.c) return;
        const rtt = performance.now() - res.c;
        // gleitender Mittelwert: ein einzelner Ausreißer soll die Vorhersage nicht ruckeln lassen
        lagMsRef.current = lagMsRef.current * 0.7 + Math.min(300, rtt / 2) * 0.3;
      });
    };
    ping();
    const id = setInterval(ping, 2000);
    return () => clearInterval(id);
  }, [socket]);

  // ── Schnappschuss verarbeiten: Vorhersage gegen den Server abgleichen ────
  useEffect(() => {
    if (!socket) return undefined;
    const onTick = (s) => {
      const w = worldRef.current;
      const active = slotsRef.current;
      w.netTop = s.nt;
      w.powerup = s.pu ? { x: s.pu[0], y: s.pu[1], t: s.pu[2] } : null;

      // Serverstand um die Netzlaufzeit vorrechnen, damit "jetzt" auch wirklich jetzt ist
      const lagFrames = Math.max(0, Math.min(20, Math.round(lagMsRef.current / TICK_MS) + 1));
      const raw = {};
      for (const slot of active) {
        const p = s.pl?.[slot];
        if (!p) continue;
        raw[slot] = {
          x: p[0], y: p[1], vy: p[2], scale: p[3], speed: p[4], grounded: !!p[5],
          seq: p[6] || 0, age: p[7] || 0,
        };
      }

      // Nur der Ball wird vorausgerechnet — bei ihm ist die Flugbahn bekannt.
      const ballTgt = { x: s.b[0], y: s.b[1], vx: s.b[2], vy: s.b[3] };
      const known = Object.keys(raw).map(Number);
      for (let i = 0; i < lagFrames; i++) {
        // Blob-Kollision bleibt außen vor: der Serverball hat den Abpraller schon drin,
        // ein zweiter würde ihn doppelt wegschießen.
        if (s.ph === "rally") stepBallFree(ballTgt, w.width, w.netX, w.netTop);
      }

      // Aufschlag/Punkt setzen die Welt zurück — dann nicht blenden, sondern übernehmen
      const hardReset = w.phase !== s.ph || s.f < w.frame || s.f - w.frame > 60;
      w.phase = s.ph;
      w.frame = s.f;

      // ── Gegner: Zwischenspeicher füllen, nicht vorausrechnen ────────────────
      // Wann der andere loslässt, kann niemand wissen. Wer es trotzdem vorausrechnet,
      // muss die geratenen Frames zurücknehmen, sobald der Schnappschuss die Wahrheit
      // bringt — das ist das kurze Zurückziehen nach jeder Bewegung. Stattdessen werden
      // die Schnappschüsse gepuffert und der Gegner um eine knappe Paketdauer verzögert
      // ZWISCHEN zwei bekannten Ständen gezeigt. Nichts wird geraten, also nichts
      // zurückgenommen.
      const nowMs = performance.now();
      if (lastSnapAtRef.current) {
        const gap = nowMs - lastSnapAtRef.current;
        if (gap > 0 && gap < 400) gapRef.current = gapRef.current * 0.85 + gap * 0.15;
      }
      lastSnapAtRef.current = nowMs;
      for (const slot of known) {
        if (slot === mySlot) continue;
        const buf = (remoteBufRef.current[slot] ||= []);
        if (hardReset) buf.length = 0;   // Teleport nicht als Bewegung ausrollen
        buf.push({ t: nowMs, ...raw[slot] });
        if (buf.length > 24) buf.shift();
      }

      for (const slot of known) {
        if (slot === mySlot) continue;
        const b = w.blobs[slot];
        if (hardReset) {
          const r0 = raw[slot];
          b.x = r0.x; b.y = r0.y; b.vy = r0.vy;
          b.scale = r0.scale; b.speed = r0.speed; b.grounded = r0.grounded;
        }
      }

      if (mySlot && raw[mySlot]) {
        const b = w.blobs[mySlot];
        b.scale = raw[mySlot].scale;
        b.speed = raw[mySlot].speed;
        const slot = mySlot;

        // Eigener Blob: verglichen wird nicht mit "dem Serverstand von jetzt" — den gibt
        // es nicht, der Server hinkt immer eine Laufzeit hinterher. Verglichen wird mit
        // dem EIGENEN Frame, den dieser Serverstand abbildet: Der Server meldet, welche
        // Eingabe er rechnet (seq) und seit wie vielen Frames (age). Die Stelle in der
        // eigenen Vergangenheit ist damit eindeutig, und was dort abweicht, ist ein echter
        // Vorhersagefehler.
        //
        // Vorher wurde der Versatz geschätzt und großzügig toleriert. Das ließ die
        // Vorhersage bis zu 36 px abdriften — genug, dass Client und Server verschiedene
        // Pfeiler-Kollisionen rechneten und der Blob zwischen "oben drauf" und "daneben"
        // hin und her sprang.
        const r = raw[slot];
        const anchor = seqLogRef.current.find((e) => e.seq === r.seq);
        let ref = null;
        let refShift = 0;
        if (anchor && !hardReset) {
          // Runden ist Pflicht: driftRef wird langsam nachgeführt und ist fraktional,
          // ein gebrochener Index greift in der Historie ins Leere.
          const base = Math.min(tickRef.current, Math.round(anchor.tick + r.age + driftRef.current));
          // Von der Mitte nach außen suchen und einen Nachbarn nur bei ECHTER Verbesserung
          // nehmen. Sonst wäre die Suche im Countdown blind: dort stehen alle Blobs still,
          // alle Kandidaten sind gleich gut, und ein „irgendeiner gewinnt" ließe die
          // Nachführung unten bei jedem Schnappschuss weiterwandern — nach dem Anpfiff
          // verglich sie dann mit einem Frame von vor einer halben Sekunde und zerrte den
          // Blob aktiv von seiner richtigen Stelle weg.
          for (const d of [0, -1, 1, -2, 2, -3, 3]) {
            const tk = base + d;
            if (tk < 0 || tk > tickRef.current || tickRef.current - tk >= HISTORY) continue;
            const h = histRef.current[tk % HISTORY];
            const err = Math.abs(r.x - h.x) + Math.abs(r.y - h.y);
            if (!ref || err < ref.err - 0.05) { ref = { err, h }; refShift = d; }
          }
        }

        if (!ref || Math.abs(r.x - ref.h.x) > 120 || Math.abs(r.y - ref.h.y) > 120) {
          // Kein Anker oder grob auseinander (Aufschlag, Paketverlust, frisch verbunden)
          b.x = r.x; b.y = r.y; b.vy = r.vy; b.grounded = r.grounded;
          for (const h of histRef.current) { h.x = b.x; h.y = b.y; h.vy = b.vy; h.grounded = b.grounded; }
          driftRef.current = 0;
        } else {
          // Die beiden Takte laufen leicht auseinander; die gefundene Verschiebung langsam
          // nachführen, statt sie jedes Mal neu suchen zu müssen.
          driftRef.current = Math.max(-40, Math.min(40, driftRef.current + refShift * 0.25));

          const ex = r.x - ref.h.x;
          const ey = r.y - ref.h.y;
          // Ein Frame Taktversatz ist normal und kein Fehler — nur der Überschuss zählt.
          const slackX = BLOBBY_SPEED * b.speed * 1.5;
          const slackY = Math.max(3, Math.abs(ref.h.vy) * 1.5);
          const dx = Math.abs(ex) > slackX ? (ex - Math.sign(ex) * slackX) * 0.6 : 0;
          const dy = Math.abs(ey) > slackY ? (ey - Math.sign(ey) * slackY) * 0.6 : 0;
          if (dx || dy) {
            b.x += dx;
            b.y += dy;
            // Die Vergangenheit mitziehen, sonst meldet der nächste Schnappschuss denselben
            // Fehler noch einmal und die Korrektur schaukelt sich auf.
            for (const h of histRef.current) { h.x += dx; h.y += dy; }
          }
          // Bei einer deutlichen Höhenkorrektur gilt auch der Bewegungszustand des Servers —
          // sonst fällt der Blob lokal weiter, obwohl er dort längst auf dem Pfeiler steht.
          if (Math.abs(ey) > 20) { b.vy = r.vy; b.grounded = r.grounded; }
        }
      }

      // Ball: Geschwindigkeit vom Server übernehmen, Position weich nachziehen.
      //
      // Mit einer Ausnahme: Habe ich gerade selbst getroffen, ist der Schnappschuss noch
      // von VOR dem Abpraller — er trägt die alte Flugrichtung. Würde man sie übernehmen,
      // knickt der Ball bei jedem eigenen Schlag kurz zurück und springt dann wieder
      // vorwärts. Genau das fühlt sich beim Ballkontakt hakelig an. Also warten, bis der
      // Server denselben Abpraller meldet — erkennbar daran, dass seine Richtung wieder
      // zur eigenen passt.
      const ball = w.ball;
      const stale = hitGuardRef.current > 0
        && !hardReset
        && ball.vx * ballTgt.vx + ball.vy * ballTgt.vy <= 0;
      if (!stale) {
        hitGuardRef.current = 0;
        ball.vx = ballTgt.vx;
        ball.vy = ballTgt.vy;
        if (hardReset || Math.hypot(ballTgt.x - ball.x, ballTgt.y - ball.y) > 130) {
          ball.x = ballTgt.x; ball.y = ballTgt.y;
        } else {
          ball.x += (ballTgt.x - ball.x) * 0.4;
          ball.y += (ballTgt.y - ball.y) * 0.4;
        }
      }

      onHud({
        phase: s.ph,
        phaseFrames: s.pf,
        reason: s.pr,
        touches: s.tc,
        lastHit: s.lh,
        effects: (s.ef || []).map(([t, team, left]) => ({
          type: POWERUP_TYPES[t],
          team,
          secs: Math.max(1, Math.ceil(left / TICK_HZ)),
        })),
      });
    };
    socket.on("bv:tick", onTick);
    return () => socket.off("bv:tick", onTick);
  }, [socket, mySlot, onHud]);

  // ── Renderschleife ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    const worldW = worldRef.current.width;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = wrap.clientWidth;
      const cssH = Math.round((cssW * WORLD_H) / worldW);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const w = worldRef.current;
      const active = slotsRef.current;
      const crossNet = crossNetRef.current;

      let dt = now - last;
      last = now;
      if (dt > 250) dt = 250;    // Tab war im Hintergrund — nicht aufholen
      acc += dt;
      w.bob += dt * 0.004;

      // Fester 75-Hz-Takt wie auf dem Server, damit die Vorhersage nicht auseinanderläuft
      // ── Gegner: zwischen den beiden umliegenden Schnappschüssen ablesen ──────
      // Gezeigt wird bewusst ein Stück Vergangenheit — knapp mehr als ein Paketabstand,
      // damit immer zwei bekannte Stände umliegen. Reißt der Strom ab, bleibt der Gegner
      // beim letzten bekannten Stand stehen, statt ins Blaue weiterzulaufen.
      const showAt = now - Math.max(28, Math.min(150, gapRef.current * 1.7));
      for (const slot of active) {
        if (slot === mySlot) continue;
        const buf = remoteBufRef.current[slot];
        if (!buf || !buf.length) continue;
        const b = w.blobs[slot];
        let older = null, newer = null;
        for (let i = 0; i < buf.length; i++) {
          if (buf[i].t >= showAt) { newer = buf[i]; older = i > 0 ? buf[i - 1] : buf[i]; break; }
        }
        const src = newer || buf[buf.length - 1];
        if (newer && older !== newer) {
          const span = newer.t - older.t || 1;
          const u = Math.max(0, Math.min(1, (showAt - older.t) / span));
          b.x = older.x + (newer.x - older.x) * u;
          b.y = older.y + (newer.y - older.y) * u;
        } else {
          b.x = src.x;
          b.y = src.y;
        }
        b.vy = src.vy;
        b.scale = src.scale;
        b.speed = src.speed;
        b.grounded = src.grounded;
      }

      let steps = 0;
      while (acc >= TICK_MS && steps < 12) {
        acc -= TICK_MS;
        steps += 1;
        if (!liveRef.current) continue;
        // Im Countdown zählt keine Taste — genau wie auf dem Server
        const listening = w.phase === "rally";
        // Nur der eigene Blob wird simuliert; die Gegner stehen schon an ihrer
        // interpolierten Stelle und dürfen von der Simulation nicht verschoben werden.
        if (mySlot && w.blobs[mySlot]) {
          const b = w.blobs[mySlot];
          stepBlob(b, listening ? inputRef.current : NO_INPUT, b.scale, b.speed);
          clampToField(b, b.scale, w.width);
          if (crossNet) blobNetCollision(b, b.scale, w.netX, w.netTop);
          else clampToHalf(b, mySlot, b.scale, w.netX);
        }
        // Rempler nur einseitig auflösen: Der Gegner steht dort, wo der Server ihn zeigt,
        // und darf hier nicht verschoben werden — sonst zuckt er bei jeder Berührung.
        if (mySlot && w.blobs[mySlot]) {
          const me = w.blobs[mySlot];
          for (const slot of active) {
            if (slot === mySlot) continue;
            const other = w.blobs[slot];
            const keep = { x: other.x, y: other.y, vy: other.vy, grounded: other.grounded };
            blobBlobCollision(me, me.scale, other, other.scale);
            other.x = keep.x; other.y = keep.y; other.vy = keep.vy; other.grounded = keep.grounded;
          }
        }

        // Eigenen Stand dieses Frames merken — er ist die Vergleichsstelle für den
        // Schnappschuss, der ihn ein paar Frames später bestätigt oder korrigiert.
        tickRef.current += 1;
        if (mySlot && w.blobs[mySlot]) {
          const me = w.blobs[mySlot];
          const h = histRef.current[tickRef.current % HISTORY];
          h.x = me.x; h.y = me.y; h.vy = me.vy; h.grounded = me.grounded;
        }
        if (w.phase === "rally") {
          // Gleiche Reihenfolge wie im Server: fliegen, Blob, dann Welt. Der eigene
          // Abpraller wird lokal mitgerechnet, sonst steckt der Ball für zwei Frames
          // sichtbar im Blob.
          //
          // Nur der EIGENE: Der Gegner wird verzögert gezeigt, ein Abpraller an ihm käme
          // hier also zu spät — der Server hätte ihn längst gemeldet, und man sähe den
          // Ball zweimal abprallen.
          w.ballPrev.x = w.ball.x;
          w.ballPrev.y = w.ball.y;
          integrateBall(w.ball);
          if (mySlot && w.blobs[mySlot]) {
            const b = w.blobs[mySlot];
            const beforeX = w.ball.vx, beforeY = w.ball.vy;
            w.touching[mySlot] = ballBlobCollision(w.ball, w.ballPrev, b, b.scale, w.touching[mySlot]);
            if (w.ball.vx !== beforeX || w.ball.vy !== beforeY) {
              // Bis der Server denselben Treffer bestätigt, seinen älteren Ball ignorieren
              hitGuardRef.current = Math.min(30, Math.ceil((lagMsRef.current * 2 + 50) / TICK_MS));
            }
          }
          ballWorldCollision(w.ball, w.width, w.netX, w.netTop);
          w.rot += w.ball.vx * 0.006;
        }
        if (hitGuardRef.current > 0) hitGuardRef.current -= 1;
      }

      const scale = canvas.width / worldW;
      if (mirror) ctx.setTransform(-scale, 0, 0, scale, canvas.width, 0);
      else ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, w, { names: namesRef.current, slots: active, dpr, mirror });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [mySlot, mirror]);

  const padButton = (field, label, icon) => (
    <button
      key={field}
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); setKey(field, true); }}
      onPointerUp={(e) => { e.preventDefault(); setKey(field, false); }}
      onPointerCancel={() => setKey(field, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex-1 flex items-center justify-center h-16 rounded-lg border transition-colors select-none ${
        touchUi[field]
          ? "bg-violet-600 border-violet-400 text-white"
          : "bg-white/5 border-white/10 text-white/70"
      }`}
      style={{ touchAction: "none" }}
    >
      {icon}
    </button>
  );

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-xl border border-white/10 bg-[#0e2b46]"
        style={{ touchAction: "none" }}
      />
      {IS_COARSE_POINTER && mySlot && (
        <div className="flex gap-2 mt-3">
          {padButton("left", "Nach links", <ChevronLeft size={26} />)}
          {padButton("jump", "Springen", <ChevronUp size={26} />)}
          {padButton("right", "Nach rechts", <ChevronRight size={26} />)}
        </div>
      )}
    </div>
  );
}

// Eine Feldseite in der Anzeigetafel: ein Name im 1v1, zwei im 2v2
function TeamSide({ team, slots, players, mySlot }) {
  const right = team === 2;
  return (
    <div className={`flex-1 min-w-0 space-y-1 ${right ? "text-right" : ""}`}>
      {slots.map((slot) => {
        const player = players?.[slot];
        return (
          <div key={slot} className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/25"
              style={{ background: SLOT_COLOR[slot].hex }}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate leading-tight">
                {player ? player.name : "Wartet…"}
                {mySlot === slot && <span className="text-white/40 font-normal"> (Du)</span>}
              </div>
              {(!player || !player.connected) && (
                <div className="text-[11px] text-white/40 truncate leading-tight">
                  {!player ? "Platz frei" : "Getrennt…"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Raum ────────────────────────────────────────────────────────────────────

export default function BlobbyRoom() {
  const { code: rawCode } = useParams();
  const code = String(rawCode || "").toUpperCase();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const nameUsedRef = useRef("");

  const [socket, setSocket] = useState(null);
  const [connStatus, setConnStatus] = useState("connecting");
  const [phase, setPhase] = useState("loading"); // loading | name-entry | joining | in-game | not-found
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("blobby_last_name") || "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [game, setGame] = useState(null);
  const [mySlot, setMySlot] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hud, setHud] = useState({ phase: "serve", phaseFrames: 0, reason: "", touches: 0, lastHit: 0, effects: [] });

  // Der Tick feuert ~37×/s — nur echte Änderungen dürfen ein Rendern auslösen
  const handleHud = useCallback((next) => {
    const key = (h) => h.effects.map((e) => `${e.type}${e.team}${e.secs}`).join("|");
    setHud((prev) =>
      prev.phase === next.phase && prev.touches === next.touches &&
      prev.lastHit === next.lastHit && prev.reason === next.reason &&
      key(prev) === key(next) &&
      Math.abs(prev.phaseFrames - next.phaseFrames) < 8
        ? prev
        : next
    );
  }, []);

  const handleJoinAck = useCallback((res) => {
    if (!res?.ok) {
      try { localStorage.removeItem("blobby_session"); } catch { /* ignore */ }
      if (res?.error === "Spiel nicht gefunden.") {
        setPhase("not-found");
      } else {
        setError(res?.error || "Beitritt fehlgeschlagen.");
        setPhase("name-entry");
      }
      return;
    }
    setMySlot(res.slot ?? null);
    setIsSpectator(!!res.spectator);
    setError("");
    try {
      localStorage.setItem("blobby_last_name", nameUsedRef.current);
      localStorage.setItem("blobby_session", JSON.stringify({ code, name: nameUsedRef.current }));
    } catch { /* ignore */ }
    setPhase("in-game");
  }, [code]);

  useEffect(() => {
    const s = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      setConnStatus("connected");
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem("blobby_session") || "null"); } catch { /* ignore */ }
      if (saved?.code === code && saved?.name) {
        nameUsedRef.current = saved.name;
        setName(saved.name);
        setPhase((p) => (p === "in-game" ? p : "joining"));
        s.emit("bv:join", { code, name: saved.name }, handleJoinAck);
      } else {
        setPhase((p) => (p === "in-game" ? p : "name-entry"));
      }
    });

    s.on("disconnect", () => setConnStatus("reconnecting"));
    s.on("bv:state", (state) => setGame(state));
    s.on("bv:slot", (info) => {
      setMySlot(info?.slot ?? null);
      setIsSpectator(!!info?.spectator);
      if (info?.spectator) setToast("Der Modus wurde geändert — du schaust jetzt zu.");
    });
    s.on("bv:playerLeft", (info) => setToast(`${info?.name || "Ein Spieler"} hat das Spiel verlassen.`));

    return () => s.disconnect();
  }, [code, handleJoinAck]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const submitName = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte gib einen Namen ein.");
      return;
    }
    setError("");
    nameUsedRef.current = trimmed;
    setPhase("joining");
    socketRef.current?.emit("bv:join", { code, name: trimmed }, handleJoinAck);
  };

  const claimSlot = () => {
    const trimmed = nameUsedRef.current || name.trim();
    if (!trimmed) return;
    socketRef.current?.emit("bv:join", { code, name: trimmed }, handleJoinAck);
  };

  const leaveGame = () => {
    socketRef.current?.emit("bv:leave");
    socketRef.current?.disconnect();
    try { localStorage.removeItem("blobby_session"); } catch { /* ignore */ }
    navigate("/blobby");
  };

  const requestRematch = () => socketRef.current?.emit("bv:rematch");
  const changeSettings = (next) => socketRef.current?.emit("bv:settings", next);
  const swapTeam = () => socketRef.current?.emit("bv:swap");

  const copyLink = async () => {
    const url = `${window.location.origin}/blobby/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const settings = useMemo(() => normalizeSettings(game?.settings || DEFAULT_SETTINGS), [game?.settings]);
  const slots = useMemo(
    () => (game?.slots?.length ? game.slots : settings.mode === "2v2" ? [1, 2, 3, 4] : [1, 2]),
    [game?.slots, settings.mode]
  );

  // ---------- Zwischenzustände ----------
  if (phase === "loading" || phase === "joining") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-20 text-center">
        <SEO title="Blobby Volley" description="Tritt einer Blobby-Volley-Partie bei." path={`/blobby/${code}`} />
        <Loader2 size={24} className="animate-spin text-violet-300 mx-auto mb-3" />
        <p className="text-white/50 text-sm">{phase === "joining" ? "Trete bei…" : "Verbinde…"}</p>
      </div>
    );
  }

  if (phase === "not-found") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-16">
        <SEO title="Blobby Volley" description="Diese Blobby-Volley-Partie wurde nicht gefunden." path={`/blobby/${code}`} />
        <div className="panel p-6 text-center">
          <h1 className="font-display text-xl font-bold text-white mb-2">Spiel nicht gefunden</h1>
          <p className="text-sm text-white/50 mb-5">Dieser Link ist abgelaufen oder die Partie wurde beendet.</p>
          <button
            type="button"
            onClick={() => navigate("/blobby")}
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Neues Spiel erstellen
          </button>
        </div>
      </div>
    );
  }

  if (phase === "name-entry") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-16">
        <SEO title="Blobby Volley · Einladung" description="Tritt einer Blobby-Volley-Partie bei." path={`/blobby/${code}`} />
        <div className="panel p-6 text-center">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-4">
            <Volleyball size={26} />
          </span>
          <h1 className="font-display text-xl font-bold text-white mb-1">Blobby-Volley-Einladung</h1>
          <p className="text-xs uppercase tracking-widest text-white/30 mb-5">Code: {code}</p>
          <form onSubmit={submitName} className="space-y-3">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Dein Name"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none transition-colors text-sm text-center"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Beitreten
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- Spiel ----------
  const status = game?.status || "waiting";
  const score = game?.score || { 1: 0, 2: 0 };
  const winnerTeam = game?.winner || 0;
  const myTeam = mySlot ? teamOf(mySlot) : 0;
  const missing = slots.filter((s) => !game?.players?.[s]).length;
  const paused = status === "playing" && slots.some((s) => !game?.players?.[s]?.connected);
  const isHost = !!mySlot && mySlot === game?.hostSlot;
  const canSwap = !!mySlot && status !== "playing" &&
    slots.some((s) => !game?.players?.[s] && teamOf(s) !== myTeam);
  const winnerLabel = winnerTeam
    ? slots.filter((s) => teamOf(s) === winnerTeam).map((s) => game?.players?.[s]?.name).filter(Boolean).join(" & ")
    : "";
  const aspect = (FIELD_W[settings.mode] || 800) / WORLD_H;
  // Jeder sieht sich selbst links — wer für Team 2 spielt, bekommt das Feld gespiegelt
  const mirror = myTeam === 2;
  const leftTeam = mirror ? 2 : 1;
  const rightTeam = mirror ? 1 : 2;

  let banner = null;
  if (status === "finished") {
    banner = myTeam === winnerTeam ? "Ihr habt gewonnen!" : `${winnerLabel || "Die andere Seite"} hat gewonnen!`;
  } else if (missing > 0) {
    banner = missing === 1 ? "Warte auf einen weiteren Spieler…" : `Warte auf ${missing} weitere Spieler…`;
  } else if (paused) {
    banner = "Ein Spieler ist getrennt — das Spiel pausiert.";
  } else if (hud.phase === "serve") {
    banner = "Aufschlag…";
  } else if (hud.phase === "point") {
    banner = hud.reason === "touches" ? `Mehr als ${settings.maxTouches} Berührungen!` : "Punkt!";
  }

  return (
    <div className="page-fade w-full max-w-5xl mx-auto px-2 md:px-4 py-6 md:py-10">
      <SEO title={`Blobby Volley · ${code}`} description="Live-Partie Blobby Volley." path={`/blobby/${code}`} />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 panel-strong px-4 py-2.5 text-sm text-white/85 shadow-2xl shadow-black/60">
          {toast}
        </div>
      )}

      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center justify-center w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
            <Volleyball size={20} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Blobby Volley</h1>
            <p className="text-[11px] text-white/40 tracking-widest uppercase">
              Code: {code}
              {game?.spectatorCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-white/30">
                  <Users size={11} /> {game.spectatorCount}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
          >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
          <button
            type="button"
            onClick={leaveGame}
            className="flex items-center gap-2 bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            Verlassen
          </button>
        </div>
      </div>

      {connStatus === "reconnecting" && (
        <div className="mb-4 text-center text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-lg py-2">
          Verbindung wird wiederhergestellt…
        </div>
      )}

      {/* Anzeigetafel: Namen außen, Punkte in der Mitte — die Zusatzinfos stehen
          darunter, sonst wird es auf dem Handy zwischen den Namen zu eng */}
      <div className="panel px-3 sm:px-4 py-3 mb-4">
        {/* Reihenfolge folgt dem Feld: die eigene Seite steht auch hier links */}
        <div className="flex items-center gap-2 sm:gap-3">
          <TeamSide team={leftTeam} slots={slots.filter((s) => teamOf(s) === leftTeam)} players={game?.players} mySlot={mySlot} />
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="font-display text-3xl font-bold text-white tabular-nums">{score[leftTeam] ?? 0}</span>
            <span className="text-white/25 text-xl font-bold">:</span>
            <span className="font-display text-3xl font-bold text-white tabular-nums">{score[rightTeam] ?? 0}</span>
          </div>
          <TeamSide team={rightTeam} slots={slots.filter((s) => teamOf(s) === rightTeam)} players={game?.players} mySlot={mySlot} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-2 text-[11px] text-white/30">
          <span className="uppercase tracking-widest">bis {game?.scoreToWin || 15}</span>
          {settings.maxTouches > 0 && hud.touches > 0 && hud.lastHit > 0 && status === "playing" && (
            <span className="tabular-nums text-white/45">
              · {hud.touches}/{settings.maxTouches} Berührungen
            </span>
          )}
          {settingsSummary(settings).map((label) => (
            <span key={label} className="text-white/25">· {label}</span>
          ))}
        </div>
      </div>

      {/* Spielfeld. Die Breite wird zusätzlich von der Fensterhöhe gedeckelt, damit auf dem
          Notebook das ganze Feld sichtbar bleibt statt unter den Rand zu rutschen.
          Der Mindestwert hält es in Querlage auf dem Handy spielbar. */}
      <div
        className="relative mx-auto w-full"
        style={{ maxWidth: `max(360px, calc((100dvh - 340px) * ${aspect}))` }}
      >
        <BlobbyGame
          key={settings.mode}
          socket={socket}
          mySlot={mySlot}
          status={status}
          players={game?.players}
          settings={settings}
          slots={slots}
          mirror={mirror}
          onHud={handleHud}
        />

        {banner && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg bg-black/55 border border-white/10 backdrop-blur-sm pointer-events-none">
            <span className="text-white text-sm font-bold">{banner}</span>
          </div>
        )}

        {/* Laufende Powerups liegen ÜBER dem Feld statt darunter im Textfluss: sonst
            wächst die Seite, sobald eines aktiv wird, und das Spielfeld rutscht mitten
            im Ballwechsel hoch und runter. */}
        {hud.effects.length > 0 && status === "playing" && (
          <div className="absolute top-3 left-3 flex flex-col items-start gap-1 pointer-events-none">
            {hud.effects.map((e) => (
              <span
                key={`${e.type}-${e.team}`}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border backdrop-blur-sm"
                style={{
                  color: POWERUP_COLOR[e.type],
                  borderColor: `${POWERUP_COLOR[e.type]}66`,
                  background: "rgba(8, 16, 28, 0.6)",
                }}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: TEAM_COLOR[e.team] }} />
                {POWERUP_LABELS[e.type]}
                <span className="tabular-nums opacity-70">{e.secs}s</span>
              </span>
            ))}
          </div>
        )}

        {status !== "finished" && missing > 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/65 px-4">
            <div className="text-center max-w-md w-full">
              <Loader2 size={20} className="animate-spin text-violet-300 mx-auto mb-3" />
              <p className="text-white/70 text-sm mb-3">
                {missing === 1 ? "Noch ein Spieler fehlt. Schick den Link:" : `Noch ${missing} Spieler fehlen. Schick den Link:`}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs sm:text-sm truncate text-left">
                  {window.location.origin}/blobby/{code}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              {isSpectator && (
                <button
                  type="button"
                  onClick={claimSlot}
                  className="mt-4 inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <Volleyball size={15} /> Als Spieler mitspielen
                </button>
              )}
            </div>
          </div>
        )}

        {status === "finished" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 px-4">
            <div className="text-center">
              <p className="font-display text-2xl font-bold text-white mb-1">
                {myTeam === winnerTeam ? "Ihr habt gewonnen!" : `${winnerLabel || "Die andere Seite"} hat gewonnen!`}
              </p>
              <p className="text-white/50 text-sm mb-5 tabular-nums">
                {score[1]} : {score[2]}
              </p>
              {mySlot != null && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={requestRematch}
                    disabled={!!game?.rematch?.[mySlot]}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <RotateCcw size={15} />
                    {game?.rematch?.[mySlot] ? "Warte auf die anderen…" : "Revanche"}
                  </button>
                  {slots.some((s) => s !== mySlot && game?.rematch?.[s]) && !game?.rematch?.[mySlot] && (
                    <p className="text-xs text-violet-300">Die anderen wollen eine Revanche!</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(canSwap || (isHost && status !== "playing")) && (
        <div className="panel p-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Settings2 size={15} className="text-white/50" />
              Einstellungen
            </div>
            <div className="flex items-center gap-2">
              {canSwap && (
                <button
                  type="button"
                  onClick={swapTeam}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <ArrowLeftRight size={14} />
                  Seite wechseln
                </button>
              )}
              {isHost && status !== "playing" && (
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {showSettings ? "Zuklappen" : "Ändern"}
                </button>
              )}
            </div>
          </div>
          {isHost && status !== "playing" && showSettings ? (
            <div className="mt-4 pt-4 border-t border-white/10">
              <BlobbySettings value={settings} onChange={changeSettings} />
              <p className="text-xs text-white/35 mt-4">
                Änderungen setzen den Punktestand zurück. Beim Wechsel auf 1 gegen 1 werden die
                hinteren Plätze zu Zuschauern.
              </p>
            </div>
          ) : (
            <p className="text-xs text-white/40 mt-2">{settingsSummary(settings).join(" · ")}</p>
          )}
        </div>
      )}

      {mySlot && (
        <p className="text-center text-xs text-white/35 mt-3">
          {IS_COARSE_POINTER
            ? "Tasten unter dem Feld: laufen und springen (halten = höher)"
            : "A / D oder ← / → laufen · W, ↑ oder Leertaste springen (halten = höher)"}
          {settings.crossNet && " · auf den Pfeiler springen und rüberklettern ist erlaubt"}
          {settings.maxTouches > 0 && ` · max. ${settings.maxTouches} Berührungen pro Seite`}
        </p>
      )}
      {isSpectator && status === "playing" && (
        <p className="text-center text-xs text-white/35 mt-3">Du schaust zu.</p>
      )}
    </div>
  );
}
