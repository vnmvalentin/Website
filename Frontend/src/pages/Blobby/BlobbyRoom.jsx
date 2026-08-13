// BlobbyRoom.jsx — Spielraum: Beitritts-Flow über den Link-Code (wie Connect4), danach das
// eigentliche Spielfeld auf einem Canvas.
//
// Netzcode: EINE Simulation, EINE Uhr. Der Server rechnet mit 75 Hz, der Client rechnet
// gar nichts — er liest Ball, Gegner UND den eigenen Blob aus demselben Schnappschuss-
// Puffer an derselben Abspieluhr ab und zeichnet sie.
//
// Warum keine Vorhersage mehr (Messung vom 09.08.2026):
// Vorher lief der eigene Blob lokal mit und wurde von jedem Schnappschuss geradegezogen.
// Das kostete drei Fehlerklassen, die sich gegenseitig gefüttert haben:
//
//   · Der Abgleich schob den Blob (`b.y += dy`) und verschob danach die ganze eigene
//     Historie um denselben Betrag. Damit war derselbe Fehler beim nächsten Schnappschuss
//     wieder plausibel, die Korrektur wirkte erneut in dieselbe Richtung — der Blob stieg.
//     Gemessen mit einem Bot, der von unten gegen den Ball springt: 327-479 px über dem
//     Sand bei einer physikalischen Sprungdecke von 259 px, dazu 18-33 sichtbare
//     Korrekturen pro Sekunde. Der Server blieb im selben Szenario bei 251 px.
//   · Die Rempler-Auflösung gegen den Gegner rechnete gegen dessen INTERPOLIERTE, also
//     45 ms alte Position und hob den eigenen Blob an Stellen an, an denen sich beim
//     Server nie etwas berührt hat.
//   · Der eigene Blob stand auf "jetzt", der Ball 45 ms in der Vergangenheit. Beim Sprung
//     (14,2 px/Frame) sind das ~65 px Versatz bei 89 px Blobhöhe — der Ball wurde sichtbar
//     im eigenen Körper gezeichnet.
//
// Alle drei verschwinden nicht durch Nachbessern, sondern nur dadurch, dass es nur noch
// eine Wahrheit gibt. Der Preis ist Eingabeverzögerung: halbe Laufzeit bis zum Server plus
// Puffertiefe. Für ein Browser-Volleyball ist das der bessere Tausch — ein Blob, der 30 ms
// später losläuft, stört niemanden; ein Blob, der aus dem Bild fliegt, macht das Spiel
// kaputt.
//
// Fehlt ein Paket, füllt der Ball die Lücke ballistisch auf DERSELBEN Uhr auf (nach oben
// begrenzt), statt in der Luft stehen zu bleiben; Blobs bleiben beim letzten bekannten
// Stand stehen, statt ins Blaue zu laufen.
//
// Positioniert wird ausschließlich über die Server-Frame-Nummer aus dem Schnappschuss.
// Die Ankunftszeit taugt dafür nicht: Unter Last kamen gemessen zwei Schnappschüsse
// 0,3 ms auseinander an, die 2-3 Server-Frames auseinanderlagen — an der Ankunft
// abgelesen raste die Interpolation dann in einem Frame durch beide Stände.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import {
  Volleyball, Copy, Check, LogOut, RotateCcw, Loader2, Users, Settings2, ArrowLeftRight,
  ChevronLeft, ChevronRight, ChevronUp, Zap,
} from "lucide-react";
import SEO from "../../components/SEO";
import BlobbySettings from "./BlobbySettings";
import { DEFAULT_SETTINGS, normalizeSettings, POWERUP_LABELS, settingsSummary } from "./settings";
import { BLOBBY_SOCKET_OPTS } from "./net";
import { SLOT_COLOR, TEAM_COLOR, POWERUP_COLOR, drawScene } from "./render";
import {
  WORLD_H, FIELD_W, NET_BASE_TOP, BALL_RADIUS, TICK_HZ, TICK_MS,
  SERVE_BALL_HEIGHT, SERVE_BALL_OFFSET, teamOf, groundPlaneFor, slotStartX,
  stepBallFree,
} from "./physics";
import { POWERUP_TYPES } from "./physics";

// So weit darf der Ball eine Paketlücke höchstens ballistisch überbrücken. Danach bleibt
// er stehen: eine längere Rechnung ohne neue Wahrheit wird zur Fantasieflugbahn, die
// beim nächsten Schnappschuss sichtbar zurückgenommen werden müsste.
const BALL_FILL_MAX_MS = 120;

// Untergrenze der Puffertiefe. Seit der Client nichts mehr vorhersagt, ist dieser Wert
// unmittelbar spürbare Eingabeverzögerung — jede Millisekunde zählt. Unter einen halben
// Paketabstand darf er trotzdem nie, sonst ist der Puffer per Definition leer.
const DELAY_FLOOR = 16;

// ── Ablesen aus dem Schnappschuss-Puffer ────────────────────────────────────
// Die beiden Stände um `t` herum suchen. Liegt `t` hinter dem letzten bekannten Stand
// (Paket fehlt), kommt dieser unverändert zurück — geraten wird nichts.
// `dry` heißt: Der Zeitpunkt liegt HINTER dem letzten bekannten Stand — das Paket, das
// jetzt an der Reihe wäre, ist noch nicht da. Genau das ist das Signal, dass der Puffer zu
// flach ist; der Aufrufer führt ihn daraufhin nach.
function sampleAt(buf, t) {
  if (!buf || !buf.length) return null;
  if (t <= buf[0].st) return { a: buf[0], b: buf[0], u: 0, dry: false };
  for (let i = 1; i < buf.length; i++) {
    if (buf[i].st >= t) {
      const a = buf[i - 1], b = buf[i];
      const span = b.st - a.st || 1;
      return { a, b, u: Math.max(0, Math.min(1, (t - a.st) / span)), dry: false };
    }
  }
  const last = buf[buf.length - 1];
  return { a: last, b: last, u: 0, dry: true };
}

function sampleBlob(target, buf, t) {
  const s = sampleAt(buf, t);
  if (!s) return false;
  target.x = s.a.x + (s.b.x - s.a.x) * s.u;
  target.y = s.a.y + (s.b.y - s.a.y) * s.u;
  // Zustandswerte werden nicht gemischt — sie sind Schalter, keine Strecken
  const src = s.u > 0.5 ? s.b : s.a;
  target.vy = src.vy;
  target.scale = src.scale;
  target.speed = src.speed;
  target.grounded = src.grounded;
  return s.dry;
}

function sampleBall(ball, buf, t, rally, width, netX, netTop) {
  const s = sampleAt(buf, t);
  if (!s) return false;
  if (s.a !== s.b) {
    ball.x = s.a.x + (s.b.x - s.a.x) * s.u;
    ball.y = s.a.y + (s.b.y - s.a.y) * s.u;
    ball.vx = s.a.vx + (s.b.vx - s.a.vx) * s.u;
    ball.vy = s.a.vy + (s.b.vy - s.a.vy) * s.u;
    return false;
  }
  ball.x = s.a.x; ball.y = s.a.y; ball.vx = s.a.vx; ball.vy = s.a.vy;
  if (!rally) return s.dry;               // im Aufschlag hängt der Ball, da wird nichts gefüllt
  const ahead = Math.min(BALL_FILL_MAX_MS, t - s.a.st);
  const steps = Math.round(ahead / TICK_MS);
  for (let i = 0; i < steps; i++) stepBallFree(ball, width, netX, netTop);
  return s.dry;
}

// Touch-Gerät? Dann kommen die drei Steuertasten unter das Feld und der Hinweistext
// erklärt sie statt der Tastatur.
const IS_COARSE_POINTER = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(pointer: coarse)").matches
  : false;

// Detailwerte zur Verbindung einblenden: /blobby/CODE?net=1
const NET_DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("net");

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
    ball: { x: slotStartX(1, mode) + SERVE_BALL_OFFSET, y: SERVE_BALL_HEIGHT, vx: 0, vy: 0 },
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
  // Lazy: `useRef(f())` wertet sein Argument bei JEDEM Render neu aus und wirft das
  // Ergebnis weg — bei der Historie unten wären das 192 Objekte pro Render.
  const worldRef = useRef(null);
  if (!worldRef.current) worldRef.current = freshWorld(settings.mode);
  const inputRef = useRef({ left: false, right: false, jump: false });
  const sentMaskRef = useRef(0);
  // Alles Entfernte kommt aus diesen Puffern — Zeitstempel ist die Server-Frame-Nummer
  const remoteBufRef = useRef({});
  const ballBufRef = useRef([]);
  // Abspieluhr in Server-Millisekunden. Sie läuft mit der echten Zeit mit und wird sanft
  // an den Schnappschuss-Strom angeglichen; ihr fester Abstand zum neuesten Stand ist die
  // EINZIGE Stelle, an der Verzögerung entsteht — und sie gilt für Ball wie Gegner.
  const clockRef = useRef({ t: 0, live: false });
  const latestStRef = useRef(0);
  // Gemittelter ANKUNFTSabstand. Er bemisst nur, wie tief der Puffer sein muss (das ist
  // eine Netzeigenschaft); abgelesen wird ausschließlich über die Server-Zeit.
  const gapRef = useRef(30);
  // Schwankung des Ankunftsabstands. Sie allein bemisst die Puffertiefe.
  const jitterRef = useRef(4);
  const lastSnapAtRef = useRef(0);
  const liveRef = useRef(false);
  const rafCountRef = useRef(0);   // nur für die ?net=1-Diagnose
  const namesRef = useRef({});
  const slotsRef = useRef(slots);
  // Laufende Nummer der Eingabe. Der Server schickt sie im Schnappschuss zurück; gebraucht
  // wird sie dort nur noch, um überholte Pakete zu verwerfen — der Client gleicht nichts
  // mehr damit ab.
  const seqRef = useRef(0);
  const [touchUi, setTouchUi] = useState({ left: false, right: false, jump: false });
  // Eingesammeltes, noch nicht gezündetes Powerup des eigenen Platzes. Als Ref für den
  // Tastaturfilter (der soll nicht bei jeder Änderung neu gebunden werden) und als State
  // für die Handy-Taste.
  const heldRef = useRef(null);
  const [heldType, setHeldType] = useState(null);

  // Verbindungsmesswerte. rtt/jit gehen an den Server (damit beide Seiten die Qualität des
  // anderen sehen), der Rest bleibt lokal für die Detailanzeige (?net=1).
  //
  // Korrekturzähler gibt es nicht mehr: Es wird nichts mehr vorhergesagt, also kann auch
  // nichts mehr korrigiert werden. Der aussagekräftige Wert ist jetzt `dry` — wie oft der
  // Puffer leer lief — und die Bildrate der eigenen Renderschleife.
  const netRef = useRef({
    rtt: 0, jit: 0, snaps: 0, srvFrames: 0, srvSelf: 0, srvBlock: 0, dry: 0, dryTick: 0,
  });
  const [net, setNet] = useState(null);

  // Einmal pro Sekunde die Zähler einsammeln und weiterreichen. Bewusst nicht öfter: Die
  // Anzeige soll ablesbar sein und darf die Renderschleife nicht mit React-Rendern stören.
  useEffect(() => {
    let lastAt = performance.now();
    let lastRaf = rafCountRef.current;
    const id = setInterval(() => {
      const n = netRef.current;
      const nowAt = performance.now();
      const secs = Math.max(0.2, (nowAt - lastAt) / 1000);
      lastAt = nowAt;
      // Bildrate der eigenen Renderschleife. Sie gehört hierher, weil eine gedrosselte
      // Seite (Hintergrund-Tab, verdecktes Fenster, überlasteter Rechner) genauso aussieht
      // wie ein Netzproblem: Gemessen mit stehender Schleife waren es 0 Bilder/s, und alles
      // ruckelte, obwohl die Verbindung tadellos war.
      const fps = Math.round((rafCountRef.current - lastRaf) / secs);
      lastRaf = rafCountRef.current;

      const snap = {
        rtt: Math.round(n.rtt), jit: Math.round(n.jit), fps,
        snaps: n.snaps, srv: Math.round(n.srvFrames / secs),
        srvSelf: n.srvSelf, srvBlock: n.srvBlock, dry: n.dry,
        delay: Math.round(delayRef.current),
      };
      n.snaps = 0; n.srvFrames = 0; n.dry = 0;
      setNet(snap);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const firePowerup = useCallback(() => {
    if (!mySlot || !heldRef.current) return;   // spart das Ereignis bei leerem Slot
    socket?.emit("bv:power");
  }, [socket, mySlot]);

  // Wie weit in der Vergangenheit die Welt gezeigt wird — ADAPTIV.
  //
  // Puffer braucht man gegen SCHWANKUNG, nicht gegen Paketabstand. Ein fester Wert war
  // vorher der Denkfehler: Auf localhost sah alles perfekt aus, über echtes Internet lief
  // der Puffer dauernd leer und die Blobs sprangen.
  //
  // Jetzt entscheidet die Wirklichkeit: Läuft die Interpolation ins Leere, wird sofort
  // tiefer gepuffert. Lief eine Sekunde alles glatt, sinkt die Verzögerung wieder ein
  // Stück — sonst bliebe sie nach einem einzelnen Aussetzer für immer hoch.
  //
  // Seit die Vorhersage weg ist, ist dieser Wert direkt die Eingabeverzögerung: Er liegt
  // zwischen Tastendruck und sichtbarer Bewegung, zusammen mit der halben Laufzeit. Der
  // Boden ist deshalb so tief wie vertretbar — knapp mehr als ein Paketabstand
  // (SNAPSHOT_EVERY=2, also 26,7 ms). Tiefer geht nur mit häufigeren Schnappschüssen.
  const delayRef = useRef(70);
  const lastTuneRef = useRef(0);
  const remoteDelay = useCallback(() => delayRef.current, []);

  // Messzugang für automatisierte Tests — nur mit ?net=1, sonst existiert er gar nicht.
  // Ohne diesen Zugang bleibt "es bugged" eine Beschreibung statt einer Zahl.
  useEffect(() => {
    if (!NET_DEBUG || typeof window === "undefined") return undefined;
    window.__blobby = () => {
      const w = worldRef.current;
      const me = mySlot && w ? w.blobs[mySlot] : null;
      return {
        slot: mySlot,
        phase: w?.phase,
        frame: w?.frame,
        // Bilder der Renderschleife: Eine gedrosselte Seite (Hintergrund-Tab, verdecktes
        // Fenster, überlasteter Rechner) sieht sonst aus wie ein Netzproblem.
        raf: rafCountRef.current,
        live: liveRef.current,
        me: me && { x: me.x, y: me.y, vy: me.vy, grounded: !!me.grounded, scale: me.scale },
        plane: me ? groundPlaneFor(me.scale) : null,
        ball: w && { x: w.ball.x, y: w.ball.y },
        delay: delayRef.current,
        net: { ...netRef.current },
      };
    };
    return () => { delete window.__blobby; };
  }, [mySlot]);

  liveRef.current = status === "playing";
  slotsRef.current = slots;
  namesRef.current = Object.fromEntries(slots.map((s) => [s, players?.[s]?.name || ""]));

  // Nur Änderungen gehen raus — gehaltene Tasten kosten kein Netz. Die laufende Nummer
  // dient dem Server nur dazu, überholte Pakete zu verwerfen.
  const pushInput = useCallback(() => {
    const i = inputRef.current;
    const mask = (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.jump ? 4 : 0);
    if (mask === sentMaskRef.current) return;
    sentMaskRef.current = mask;
    seqRef.current += 1;
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

  // ── Tastatur: WASD und Pfeiltasten zum Laufen/Springen, Leertaste zündet das Powerup ──
  // Die Leertaste war früher eine zweite Sprungtaste. Seit Powerups in einem Slot landen
  // und selbst gezündet werden, braucht es dafür eine eigene Taste — gesprungen wird also
  // nur noch mit W bzw. Pfeil-hoch.
  useEffect(() => {
    if (!mySlot) return undefined;
    const isSpace = (key) => key === " " || key === "spacebar";
    const fieldFor = (key) => {
      if (key === "a" || key === "arrowleft") return "left";
      if (key === "d" || key === "arrowright") return "right";
      if (key === "w" || key === "arrowup") return "jump";
      return null;
    };
    const isTyping = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isTyping(e.target) || e.repeat) return;
      const key = e.key.toLowerCase();
      if (isSpace(key)) {
        e.preventDefault();          // sonst scrollt die Seite
        firePowerup();
        return;
      }
      const field = fieldFor(key);
      if (!field) return;
      e.preventDefault();
      setKey(field, true);
    };
    const onKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (isSpace(key)) { e.preventDefault(); return; }
      const field = fieldFor(key);
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
  }, [mySlot, setKey, pushInput, firePowerup]);

  // ── Verbindungsmessung ──────────────────────────────────────────────────
  // Die Simulation braucht die Laufzeit nicht mehr (gepuffert wird gegen Jitter, siehe
  // remoteDelay). Gemessen wird trotzdem: zum Anzeigen für beide Spieler — und weil man
  // ohne Zahlen nicht beurteilen kann, ob ein Ruckler am Netz oder am Code liegt.
  //
  // `jit` ist die mittlere Abweichung der Einzelmessungen vom Mittelwert. Sie sagt mehr
  // über die Spielbarkeit aus als der Ping selbst: konstante 120 ms lassen sich glatt
  // wegpuffern, zwischen 30 und 130 ms schwankende nicht.
  useEffect(() => {
    if (!socket) return undefined;
    let sent = 0;
    const ping = () => {
      const t0 = performance.now();
      socket.emit("bv:ping", { c: t0 }, (res) => {
        if (!res?.c) return;
        const rtt = performance.now() - res.c;
        const n = netRef.current;
        n.rtt = n.rtt ? n.rtt * 0.8 + rtt * 0.2 : rtt;
        n.jit = n.jit ? n.jit * 0.8 + Math.abs(rtt - n.rtt) * 0.2 : 0;
        // Nicht bei jeder Messung melden — der Server broadcastet daraufhin die Lobby
        if (++sent % 3 === 0) socket.emit("bv:rtt", { rtt: n.rtt, jit: n.jit });
      });
    };
    ping();
    const id = setInterval(ping, 1500);
    return () => clearInterval(id);
  }, [socket]);

  // ── Schnappschuss verarbeiten: Vorhersage gegen den Server abgleichen ────
  useEffect(() => {
    if (!socket) return undefined;
    const onTick = (s) => {
      const w = worldRef.current;
      const active = slotsRef.current;
      const st = s.f * TICK_MS;      // Server-Zeit dieses Schnappschusses
      w.netTop = s.nt;
      w.powerup = s.pu ? { x: s.pu[0], y: s.pu[1], t: s.pu[2] } : null;

      const raw = {};
      for (const slot of active) {
        const p = s.pl?.[slot];
        if (!p) continue;
        raw[slot] = {
          x: p[0], y: p[1], vy: p[2], scale: p[3], speed: p[4], grounded: !!p[5],
          seq: p[6] || 0, age: p[7] || 0,
          held: p.length > 8 && p[8] >= 0 ? POWERUP_TYPES[p[8]] : null,
        };
      }
      const known = Object.keys(raw).map(Number);

      const held = mySlot ? raw[mySlot]?.held ?? null : null;
      if (heldRef.current !== held) {
        heldRef.current = held;
        setHeldType(held);
      }

      // Aufschlag/Punkt setzen die Welt zurück — dann nicht blenden, sondern übernehmen
      const prevFrame = w.frame;
      const hardReset = w.phase !== s.ph || s.f < w.frame || s.f - w.frame > 60;
      w.phase = s.ph;
      w.frame = s.f;
      latestStRef.current = st;

      // Ankunftsabstand mitteln — nur zur Bemessung der Puffertiefe
      const nowMs = performance.now();
      const gapMs = lastSnapAtRef.current ? nowMs - lastSnapAtRef.current : 0;
      if (gapMs > 0 && gapMs < 400) {
        gapRef.current = gapRef.current * 0.85 + gapMs * 0.15;
        // Schwankung der ANKUNFT, nicht der Round-Trip-Zeit. Nur sie entscheidet, wie tief
        // gepuffert werden muss: Ein hoher, aber gleichmäßiger Ping braucht keinen tiefen
        // Puffer, ein niedriger mit Ausreißern schon. Der Puffer wurde vorher aus der Zahl
        // leergelaufener Bilder abgeleitet — die hängt aber an der Bildrate des Monitors,
        // nicht am Netz, und war damit auf einem 165-Hz-Schirm fast dreimal so empfindlich
        // wie auf 60 Hz.
        jitterRef.current = jitterRef.current * 0.9 + Math.abs(gapMs - gapRef.current) * 0.1;
      }
      lastSnapAtRef.current = nowMs;
      netRef.current.snaps += 1;
      // Frame-Fortschritt gegen echte Zeit: daraus ergibt sich die Server-Rate. Auch bei
      // einem hardReset mitzählen — der Frame-Zähler läuft über Aufschlag und Punktpause
      // hinweg weiter, das Auslassen hätte die Rate künstlich kleingerechnet.
      const dFrames = s.f - prevFrame;
      if (dFrames > 0 && dFrames < 200) netRef.current.srvFrames += dFrames;
      // Selbstauskunft des Servers: was er selbst gerechnet hat und wie lange sein
      // Event-Loop am Stück blockiert war. Weicht das von meiner eigenen Zählung ab,
      // liegt der Verlust am Netz; stimmt es überein, liegt er im Server.
      if (typeof s.sh === "number") netRef.current.srvSelf = s.sh;
      if (typeof s.sb === "number") netRef.current.srvBlock = s.sb;

      if (hardReset || !clockRef.current.live) {
        clockRef.current.t = st - remoteDelay();
        clockRef.current.live = true;
      }

      // ── Puffer füllen: Ball und ALLE Blobs gleichbehandelt ──────────────────
      // Zeitstempel ist die SERVER-Zeit, nicht der Moment der Ankunft. Unter Last kamen
      // gemessen zwei Schnappschüsse 0,3 ms auseinander an, die 2-3 Server-Frames
      // auseinanderlagen — an der Ankunft abgelesen raste die Interpolation dann in einem
      // Frame durch beide Stände und der Gegner teleportierte.
      const ballBuf = ballBufRef.current;
      if (hardReset) ballBuf.length = 0;
      ballBuf.push({ st, x: s.b[0], y: s.b[1], vx: s.b[2], vy: s.b[3] });
      if (ballBuf.length > 32) ballBuf.shift();

      // Auch der EIGENE Platz landet im Puffer — er ist jetzt genauso ein entferntes
      // Objekt wie jeder andere Blob. Genau das ist der Kern der Umstellung: eine Uhr für
      // alles, was auf dem Feld steht, und damit keine zwei Zeitebenen mehr, zwischen denen
      // etwas klemmen könnte.
      for (const slot of known) {
        const buf = (remoteBufRef.current[slot] ||= []);
        if (hardReset) buf.length = 0;   // Teleport nicht als Bewegung ausrollen
        buf.push({ st, ...raw[slot] });
        if (buf.length > 32) buf.shift();
      }

      // Der eigene Blob wird NICHT mehr gesondert behandelt. Früher stand hier der Abgleich
      // von Vorhersage und Serverstand — Anker über seq/age, Suche nach dem passenden
      // eigenen Frame, Drift-Nachführung, Ortskorrektur, Übernahme von grounded/vy. Das ist
      // ersatzlos weg (Begründung im Kopf der Datei): Es hat nicht nur nichts gebracht,
      // sondern den Blob aktiv nach oben getrieben, weil die Korrektur die eigene Historie
      // mitverschob und sich damit selbst bestätigte.

      // Der Ball braucht hier nichts mehr: Er liegt im Puffer und wird in der
      // Renderschleife an derselben Uhr abgelesen wie die Gegner. Die frühere
      // Sonderbehandlung (Geschwindigkeit übernehmen, Position nachziehen, nach einem
      // eigenen Treffer den Serverball per Skalarprodukt als "veraltet" verwerfen) ist
      // damit entfallen — sie war nur nötig, weil der Ball auf einer eigenen Uhr lief.

      onHud({
        phase: s.ph,
        phaseFrames: s.pf,
        reason: s.pr,
        touches: s.tc,
        lastHit: s.lh,
        held,
        effects: (s.ef || []).map(([t, team, left]) => ({
          type: POWERUP_TYPES[t],
          team,
          secs: Math.max(1, Math.ceil(left / TICK_HZ)),
        })),
      });
    };
    socket.on("bv:tick", onTick);
    return () => socket.off("bv:tick", onTick);
  }, [socket, mySlot, onHud, remoteDelay]);

  // ── Renderschleife ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    const worldW = worldRef.current.width;
    let raf = 0;
    let last = performance.now();
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
      rafCountRef.current += 1;
      const w = worldRef.current;
      const active = slotsRef.current;

      let dt = now - last;
      last = now;
      if (dt > 250) dt = 250;    // Tab war im Hintergrund — nicht aufholen
      w.bob += dt * 0.004;

      // ── Abspieluhr fortschreiben ────────────────────────────────────────────
      // Sie läuft mit der echten Zeit und wird sanft an den Schnappschuss-Strom
      // herangezogen. Sanft, weil ein hartes Setzen bei jedem Paket genau das Ruckeln
      // erzeugen würde, das die Pufferung verhindern soll.
      const clock = clockRef.current;
      if (clock.live) {
        clock.t += dt;
        const target = latestStRef.current - remoteDelay();
        const err = target - clock.t;
        if (Math.abs(err) > 250) clock.t = target;   // Pause, Reconnect, Tab war weg
        else clock.t += err * 0.05;
      }

      // ── Alles an DIESER einen Uhr ablesen: Ball und ALLE Blobs ───────────────
      // Sie stammen damit garantiert aus demselben Augenblick. Kein Objekt auf dem Feld
      // hat mehr eine eigene Zeit — das war die Quelle sowohl des Balls im eigenen Körper
      // als auch des davonfliegenden Blobs.
      const rally = w.phase === "rally";
      let dry = false;
      for (const slot of active) {
        if (sampleBlob(w.blobs[slot], remoteBufRef.current[slot], clock.t)) dry = true;
      }
      if (clock.live) {
        const beforeVx = w.ball.vx;
        if (sampleBall(w.ball, ballBufRef.current, clock.t, rally, w.width, w.netX, w.netTop)) dry = true;
        if (rally) w.rot += ((beforeVx + w.ball.vx) / 2) * 0.006 * (dt / TICK_MS);
      }

      // Puffertiefe: direkt aus dem gemessenen Jitter, nicht mehr aus einer Sperrklinke.
      //
      // Vorher wurde bei mehr als zwei leergelaufenen BILDERN pro Sekunde um 20 ms erhöht
      // und nur bei einer völlig sauberen Sekunde um 5 ms gesenkt. Zwei Fehler darin:
      // Erstens hing die Empfindlichkeit an der Bildrate des Monitors statt am Netz.
      // Zweitens war es eine Sperrklinke — mit echtem Jitter gibt es kaum eine perfekt
      // saubere Sekunde, also stieg der Puffer und kam nie zurück. Gemessen bei 70 ms
      // Ping mit ±8 ms Jitter: Der Puffer pendelte zwischen 32 und 52 ms, und die
      // Eingabeverzögerung lag im Median bei 126 ms.
      //
      // Jetzt: Ziel ist ein Paketabstand (damit überhaupt etwas zum Interpolieren da ist)
      // plus dreifacher Ankunftsjitter. Das ist symmetrisch — wird die Leitung ruhiger,
      // sinkt der Puffer von selbst wieder. `dry` bleibt als Notnagel für den schnellen
      // Anstieg, wenn die Schätzung danebenlag.
      if (clock.live) {
        if (dry) netRef.current.dry += 1;
        if (now - lastTuneRef.current > 250) {
          lastTuneRef.current = now;
          // Ein Paketabstand als Sockel (darunter ist per Definition nichts da) plus die
          // doppelte Schwankung. Zwei Sigma decken die üblichen Ausreißer ab; drei waren in
          // der Messung reine Verzögerung ohne Gewinn an Ruhe.
          const target = Math.max(
            DELAY_FLOOR,
            Math.min(200, gapRef.current + jitterRef.current * 2),
          );
          // Nach oben zügig (ein zu flacher Puffer ruckelt sofort), nach unten gemächlich
          // (sonst pumpt die Verzögerung bei jeder ruhigen Viertelsekunde).
          const k = target > delayRef.current ? 0.5 : 0.08;
          delayRef.current += (target - delayRef.current) * k;
          // Notnagel: Lief der Puffer seit der letzten Prüfung überhaupt leer, einmalig
          // aufschlagen. Bewusst hier und nicht pro Bild — sonst hinge die Stärke des
          // Aufschlags wieder an der Bildrate des Monitors statt am Netz.
          if (netRef.current.dryTick) delayRef.current = Math.min(200, delayRef.current + 6);
          netRef.current.dryTick = 0;
        }
        if (dry) netRef.current.dryTick = 1;
      }

      // Hier stand die lokale Simulation des eigenen Blobs (stepBlob, Feld- und
      // Pfeilerkollision, Historie, Akkumulator mit `stepMs`). Alles entfallen: Der eigene
      // Blob kommt jetzt aus derselben Schleife oben. Die Tastatur schickt nur noch
      // `bv:input` an den Server und wartet auf den nächsten Schnappschuss.

      const scale = canvas.width / worldW;
      if (mirror) ctx.setTransform(-scale, 0, 0, scale, canvas.width, 0);
      else ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, w, { names: namesRef.current, slots: active, dpr, mirror });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [mySlot, mirror, remoteDelay]);

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
    <div ref={wrapRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-xl border border-white/10 bg-[#0e2b46]"
        style={{ touchAction: "none" }}
      />
      {/* Detailwerte für die Fehlersuche, per ?net=1 in der Adresszeile.
          „leer" ist der wichtigste Wert: so oft pro Sekunde war der nächste Schnappschuss
          noch nicht da, als er gebraucht wurde. Alles über 0 heißt, der Puffer ist zu flach
          für diese Verbindung — er zieht dann selbst nach (siehe „Puffer"). */}
      {NET_DEBUG && net && (
        <div className="absolute top-2 right-2 px-2 py-1.5 rounded bg-black/75 border border-white/15 font-mono text-[10px] leading-relaxed text-white/70 pointer-events-none">
          <div>ping {net.rtt} ms · jitter {net.jit} ms</div>
          <div>puffer {net.delay} ms · pakete {net.snaps}/s</div>
          <div className={net.srv < 70 ? "text-amber-300" : ""}>
            server {net.srv} frames/s
          </div>
          <div className={net.srvSelf < 70 || net.srvBlock > 60 ? "text-amber-300" : ""}>
            laut server {net.srvSelf}/s · blockade {net.srvBlock} ms
          </div>
          <div className={net.dry > 0 ? "text-amber-300" : ""}>leer {net.dry}/s</div>
          {/* Der eigene Takt gehörte von Anfang an hierher: Steht die Renderschleife still —
              Hintergrund-Tab, verdecktes Fenster, überlasteter Rechner —, dann rechnet der
              Client gar nichts mehr vorher und wird nur noch von den Schnappschüssen
              gezogen. Das sieht genau aus wie ein Netzproblem, ist aber keins, und ohne
              diese Zeile war es von außen nicht zu unterscheiden. Gemessen mit stehender
              Schleife: 0 Bilder/s, eigener Takt 0/s, sichtbare Korrekturen 16/s. */}
          <div className={net.fps < 30 ? "text-amber-300" : ""}>bilder {net.fps}/s</div>
        </div>
      )}
      {IS_COARSE_POINTER && mySlot && (
        <div className="flex gap-2 mt-3">
          {padButton("left", "Nach links", <ChevronLeft size={26} />)}
          {padButton("jump", "Springen", <ChevronUp size={26} />)}
          {padButton("right", "Nach rechts", <ChevronRight size={26} />)}
          {/* Erscheint nur mit gefülltem Slot — eine dauerhaft tote Taste würde die drei
              Steuertasten unnötig schmal machen. */}
          {heldType && (
            <button
              type="button"
              aria-label={`Powerup einsetzen: ${POWERUP_LABELS[heldType]}`}
              onPointerDown={(e) => { e.preventDefault(); firePowerup(); }}
              onContextMenu={(e) => e.preventDefault()}
              className="flex-1 flex items-center justify-center h-16 rounded-lg border transition-colors select-none"
              style={{
                touchAction: "none",
                borderColor: POWERUP_COLOR[heldType],
                background: `${POWERUP_COLOR[heldType]}26`,
                color: POWERUP_COLOR[heldType],
              }}
            >
              <Zap size={24} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Verbindungsqualität eines Spielers. Bewertet wird NICHT der Ping allein, sondern vor
// allem der Jitter: konstante 150 ms lassen sich glatt wegpuffern, zwischen 30 und 130 ms
// schwankende nicht — und genau das erzeugt das Ruckeln, das man als "Lag" wahrnimmt.
function connectionQuality(rtt, jit) {
  if (rtt == null) return null;
  if (rtt > 220 || jit > 45) return { label: "schlecht", color: "#ef4444" };
  if (rtt > 110 || jit > 20) return { label: "mittel", color: "#f59e0b" };
  return { label: "gut", color: "#22c55e" };
}

function ConnectionBadge({ player }) {
  const q = connectionQuality(player?.rtt, player?.jit);
  if (!player?.connected || !q) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] tabular-nums shrink-0"
      style={{ color: q.color }}
      title={`Ping ${player.rtt} ms, Schwankung ±${player.jit} ms — ${q.label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: q.color }} />
      {player.rtt}
      <span className="opacity-60">±{player.jit}</span>
    </span>
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
              <div className={`flex items-center gap-1.5 min-w-0 ${right ? "flex-row-reverse" : ""}`}>
                <span className="text-sm font-semibold text-white truncate leading-tight">
                  {player ? player.name : "Wartet…"}
                  {mySlot === slot && <span className="text-white/40 font-normal"> (Du)</span>}
                </span>
                <ConnectionBadge player={player} />
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
  const [hud, setHud] = useState({ phase: "serve", phaseFrames: 0, reason: "", touches: 0, lastHit: 0, held: null, effects: [] });

  // Der Tick feuert jetzt bis zu 75×/s — nur echte Änderungen dürfen ein Rendern auslösen
  const handleHud = useCallback((next) => {
    const key = (h) => h.effects.map((e) => `${e.type}${e.team}${e.secs}`).join("|");
    setHud((prev) =>
      prev.phase === next.phase && prev.touches === next.touches &&
      prev.lastHit === next.lastHit && prev.reason === next.reason &&
      prev.held === next.held &&
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
      ...BLOBBY_SOCKET_OPTS,
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

        {/* Powerup-Slot unten links. Eingesammelt wird automatisch, gezündet per
            Leertaste — die Anzeige ist deshalb auch die einzige Stelle, an der die
            Taste erklärt wird. Der leere Slot bleibt sichtbar, sonst wüsste niemand,
            dass es ihn gibt, bis zufällig das erste Powerup eingesammelt wird. */}
        {settings.powerups && status === "playing" && mySlot && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            {hud.held ? (
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded border backdrop-blur-sm"
                style={{
                  borderColor: `${POWERUP_COLOR[hud.held]}66`,
                  background: "rgba(8, 16, 28, 0.72)",
                }}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: POWERUP_COLOR[hud.held] }} />
                <span className="text-[11px] font-semibold" style={{ color: POWERUP_COLOR[hud.held] }}>
                  {POWERUP_LABELS[hud.held]}
                </span>
                <span className="text-[10px] text-white/45 border-l border-white/15 pl-2">
                  {IS_COARSE_POINTER ? "Taste rechts" : "Leertaste"}
                </span>
              </div>
            ) : (
              <div className="px-2.5 py-1.5 rounded border border-dashed border-white/15 bg-black/35">
                <span className="text-[11px] text-white/30">Powerup-Slot leer</span>
              </div>
            )}
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
            : "A / D oder ← / → laufen · W oder ↑ springen (halten = höher)"}
          {settings.powerups && (IS_COARSE_POINTER
            ? " · Powerup mit der rechten Taste einsetzen"
            : " · Leertaste setzt das gesammelte Powerup ein")}
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
