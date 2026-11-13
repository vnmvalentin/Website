// components/GameTable.jsx — der Spieltisch: 3D-Szene (scene/tableScene.js) plus Anzeigen darüber.
//
//   oben Mitte   Weltenrad (dreht sich wie die Welt: die aktuelle liegt unten; Ringe = Ladung jeder Welt)
//   oben links   Name der aktuellen Welt, ihr Gesetz und ihr nächstes Ereignis
//   Mitte        großes Feld, wenn ein Weltereignis ausgelöst wird; kleinere Einblendung für Karten und Weltwechsel
//   an den Figuren  Namensschilder mit Zustand (dran, eingefroren, Schild, weggeweht)
//   unten        eigene Zeile (dran / ziehen), eigener Zustand als Rahmen ums Bild, Verlauf (klappt beim Überfahren auf)
//
// Der Tisch kennt weder Bots noch Server. Wer ihn benutzt (WfLocal, WfRoom), schiebt Stände hinein:
//   ref.push({ fresh: true, view, players, seat })   neue Runde: Plätze aufbauen, austeilen
//   ref.push({ events, view })                       ein Zug: Ereignisse abspielen, dann auf die Sicht stellen
// und bekommt Züge über onAct(action) zurück. onIdle() meldet, dass alles abgespielt ist.
// Die Anzeige (view) wechselt erst NACH dem Abspielen — Knöpfe und Endbildschirm kommen also nie zu früh.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bot, Eye, History, Moon, RotateCcw, RotateCw, Shield, Snowflake, Wind } from "lucide-react";
import { createTableScene } from "../scene/tableScene.js";
import { clearCardArt } from "../scene/cardArt.js";
import { playerColor } from "../skins.js";
import { EVENTS, KINDS, RULES, WORLDS, isLegal } from "../engine/index.js";
import { isLowGfx } from "../../../utils/lowGfx.js";
import { sfx } from "../sound.js";

const FLASH_MS = 2700;
const SPLASH_MS = 2600;
const LOG_MAX = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const liveOf = (v) => ({
  world: v.world, charges: v.charges, next: v.next, turn: v.winner === null ? v.turn : -1, dir: v.dir, dark: v.dark > 0,
  shield: v.shield, frozen: v.frozen,
});
const patch = (list, i, value) => list.map((x, k) => (k === i ? value : x));

// ── Weltenrad ───────────────────────────────────────────────────────────────────────────────
const polar = (r, deg) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
function band(r0, r1, a0, a1) {
  const [x0, y0] = polar(r0, a0);
  const [x1, y1] = polar(r0, a1);
  const [x2, y2] = polar(r1, a1);
  const [x3, y3] = polar(r1, a0);
  return `M${x0} ${y0}A${r0} ${r0} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 0 0 ${x3} ${y3}Z`;
}

/** Vier Viertel = vier Welten, je vier Ringe = Ladung. Dreht sich wie die Trommel: die aktuelle Welt liegt unten. */
function WorldWheel({ world, charges }) {
  // fortlaufender Winkel, damit das Rad immer den kurzen Weg dreht
  const rot = useRef(world * 90);
  rot.current += ((world * 90 - rot.current + 540) % 360) - 180;
  return (
    <svg className="wf-wheel" viewBox="-80 -80 160 160" aria-hidden="true">
      <g style={{ transform: `rotate(${rot.current}deg)` }} className="wf-wheel-spin">
        {WORLDS.map((w, i) => {
          const mid = 90 - i * 90; // Welt 0 unten, 1 rechts, 2 oben, 3 links (bei Drehung 0)
          return (
            <g key={w.id} opacity={i === world ? 1 : 0.6}>
              {Array.from({ length: RULES.CHARGE_MAX }, (_, k) => (
                <path key={k} d={band(21 + k * 13.5, 32 + k * 13.5, mid - 41, mid + 41)} fill={k < charges[i] ? w.color : "#34313f"} />
              ))}
            </g>
          );
        })}
      </g>
      <circle r="15" fill={WORLDS[world].color} />
      <path d="M-9 76 L9 76 L0 66 Z" fill="#f4eedf" />
    </svg>
  );
}

const GameTable = forwardRef(function GameTable({ onAct, onIdle, deadline = null, turnSeconds = 0, renderOverlay }, ref) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const queueRef = useRef([]);
  const busyRef = useRef(false);
  const tableRef = useRef({ players: [], seat: null, teams: null });
  const countsRef = useRef([]);
  const plateEls = useRef({});
  const worldEl = useRef(null);
  const cb = useRef({});
  const timers = useRef({ flash: null, splash: null, sent: null });

  const [failed, setFailed] = useState(false);
  const [table, setTable] = useState(tableRef.current);
  const [view, setView] = useState(null);
  const [live, setLive] = useState(null);
  const [away, setAway] = useState([]); // vom Sturm weggeweht, bis man wieder dran ist (nur Anzeige, keine Regel)
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [flash, setFlash] = useState(null);
  const [splash, setSplash] = useState(null); // großes Feld: Weltereignis
  const [tint, setTint] = useState(null);
  const [tip, setTip] = useState(null); // Karte unter dem Zeiger
  const [log, setLog] = useState([]); // Verlauf: die letzten Züge und Ereignisse, neueste zuerst
  const [choice, setChoice] = useState(null); // { card, world: null | 0–3 }
  const [now, setNow] = useState(() => Date.now());

  const note = useCallback((text, color) => {
    setLog((l) => [{ key: Math.random(), text, color }, ...l].slice(0, LOG_MAX));
  }, []);

  // low: Ansage unten über der eigenen Zeile (wenn oben die groß gezeigte Karte hängt)
  const showFlash = useCallback((title, text, color, low = false) => {
    note(text ? `${title}: ${text}` : title, color);
    clearTimeout(timers.current.flash);
    setFlash({ key: Math.random(), title, text, color, low });
    timers.current.flash = setTimeout(() => setFlash(null), FLASH_MS);
  }, [note]);

  // Ein Ereignis beginnt: Einblendung, Ton, mitlaufende Anzeige
  const announce = useCallback((e) => {
    const { players, seat: me } = tableRef.current;
    const name = (s) => players[s]?.name || "Jemand";
    const who = (s, du, er) => (s === me ? du : `${name(s)} ${er}`);
    const counts = countsRef.current;
    const up = (fn) => setLive((l) => l && fn(l));
    switch (e.t) {
      case "play":
        counts[e.seat] = Math.max(0, (counts[e.seat] || 0) - 1);
        up((l) => ({ ...l, world: e.world, charges: e.charges }));
        // Effektkarte: groß ansagen, was sie tut (die Karte selbst hängt so lange vor der Kamera)
        if (e.card.k !== "n") showFlash(KINDS[e.card.k].name, `${e.seat === me ? "Du legst" : `${name(e.seat)} legt`}: ${KINDS[e.card.k].text}`, WORLDS[e.world].color, true);
        else note(`${e.seat === me ? "Du legst" : `${name(e.seat)} legt`} ${WORLDS[e.card.w].name} ${e.card.n}`, WORLDS[e.card.w].color);
        if (counts[e.seat] === 1 && e.card.k !== "n") note(e.seat === me ? "Du hast nur noch eine Karte" : `${name(e.seat)} hat nur noch eine Karte`);
        else if (counts[e.seat] === 1) showFlash("Letzte Karte", e.seat === me ? "Noch eine, dann hast du gewonnen" : `${name(e.seat)} hat nur noch eine`);
        break;
      case "draw":
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        if (e.n) note(`${e.seat === me ? "Du ziehst" : `${name(e.seat)} zieht`} ${e.n === 1 ? "eine Karte" : `${e.n} Karten`}`);
        break;
      case "world":
        up((l) => ({ ...l, world: e.to }));
        setTint({ key: Math.random(), color: WORLDS[e.to].color });
        showFlash(WORLDS[e.to].name, `${WORLDS[e.to].law}: ${WORLDS[e.to].lawText}`, WORLDS[e.to].color);
        break;
      case "flip":
        up((l) => ({ ...l, dir: e.dir }));
        showFlash("Richtungswechsel", e.dir < 0 ? "Jetzt geht es gegen den Uhrzeigersinn" : "Wieder im Uhrzeigersinn");
        break;
      case "skip":
        setAway((a) => patch(a, e.seat, true));
        showFlash("Sturm", who(e.seat, "Du wirst weggeweht und setzt aus", "wird weggeweht und setzt aus"));
        break;
      case "meteor":
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        showFlash("Meteor", who(e.seat, "Du ziehst 2 Karten und setzt aus", "zieht 2 Karten und setzt aus"), WORLDS[0].color);
        break;
      case "walze":
        showFlash("Feuerwalze", KINDS.walze.text, WORLDS[0].color);
        break;
      case "frost":
        up((l) => ({ ...l, frozen: patch(l.frozen, e.seat, true) }));
        showFlash("Frost", who(e.seat, "Du bist eingefroren und setzt einmal aus", "ist eingefroren und setzt einmal aus"), WORLDS[1].color);
        break;
      case "again":
        showFlash("Welle", who(e.seat, "Du bist gleich noch einmal dran", "ist gleich noch einmal dran"), WORLDS[1].color);
        break;
      case "shield":
        up((l) => ({ ...l, shield: patch(l.shield, e.seat, true) }));
        showFlash("Dornenschild", who(e.seat, "Der nächste Angriff prallt an dir ab", "ist vor dem nächsten Angriff geschützt"), WORLDS[2].color);
        break;
      case "block":
        up((l) => ({ ...l, shield: patch(l.shield, e.seat, false) }));
        showFlash("Abgewehrt", e.seat === me ? "Dein Dornenschild fängt den Angriff ab" : `Der Dornenschild von ${name(e.seat)} fängt den Angriff ab`, WORLDS[2].color);
        break;
      case "thaw":
        up((l) => ({ ...l, frozen: patch(l.frozen, e.seat, false) }));
        showFlash("Aufgetaut", who(e.seat, "Du taust auf und setzt dafür aus", "taut auf und setzt dafür aus"), WORLDS[1].color);
        break;
      case "gift":
        counts[e.from] = Math.max(0, (counts[e.from] || 0) - 1);
        counts[e.to] = (counts[e.to] || 0) + 1;
        showFlash("Saat", e.to === me ? `${name(e.from)} drückt dir eine Karte in die Hand` : e.from === me ? `${name(e.to)} bekommt eine Karte von dir` : `${name(e.from)} gibt ${name(e.to)} eine Karte`, WORLDS[2].color);
        break;
      case "swap": {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        showFlash("Wurmloch", other !== null ? `Du tauschst die Hand mit ${name(other)}` : `${name(e.a)} und ${name(e.b)} tauschen die Hände`, WORLDS[3].color);
        break;
      }
      case "beam":
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        showFlash("Strahl", who(e.seat, "Du ziehst 2 Karten", "zieht 2 Karten"), WORLDS[3].color);
        break;
      case "erupt": {
        // Weltereignis: großes Feld quer über die Mitte
        up((l) => ({ ...l, charges: patch(l.charges, e.world, 0), ...(e.flip ? { dir: e.flip } : {}), ...(e.freeze ? { frozen: l.frozen.map((f, s) => f || e.freeze.includes(s)) } : {}) }));
        const w = WORLDS[e.world];
        setTint({ key: Math.random(), color: w.color });
        setFlash(null);
        note(`${EVENTS[e.ev].name}: ${EVENTS[e.ev].text}`, w.color);
        clearTimeout(timers.current.splash);
        setSplash({ key: Math.random(), world: w, name: EVENTS[e.ev].name, text: EVENTS[e.ev].text, by: e.by === me ? "von dir ausgelöst" : `ausgelöst von ${name(e.by)}` });
        timers.current.splash = setTimeout(() => setSplash(null), SPLASH_MS);
        break;
      }
      case "dark":
        up((l) => ({ ...l, dark: true }));
        showFlash("Finsternis", me === null || e.by === me ? "Die Gegner spielen eine Runde blind" : "Wer geblendet ist, sieht seine Karten nicht — die Reihenfolge bleibt");
        break;
      case "light":
        up((l) => ({ ...l, dark: false }));
        break;
      case "misplay":
        showFlash("Daneben", e.seat === me ? "Die Karte passt nicht: Strafkarte für dich" : `Strafkarte für ${name(e.seat)}`);
        break;
      case "turn":
        up((l) => ({ ...l, turn: e.seat }));
        setAway((a) => (a[e.seat] ? patch(a, e.seat, false) : a));
        if (e.seat === me) sfx.turn();
        break;
      case "win": {
        up((l) => ({ ...l, turn: -1 }));
        setAway((a) => a.map(() => false));
        const { teams } = tableRef.current;
        const mine = me === null || e.seat === me || (teams && teams[me] === e.team);
        if (mine) sfx.win();
        else sfx.lose();
        break;
      }
      default:
    }
  }, [showFlash, note]);

  // Warteschlange abarbeiten: immer nur ein Stand gleichzeitig
  const pump = useCallback(async () => {
    if (busyRef.current || !sceneRef.current) return;
    busyRef.current = true;
    setBusy(true);
    while (queueRef.current.length) {
      const scene = sceneRef.current;
      if (!scene) break;
      const b = queueRef.current.shift();
      clearTimeout(timers.current.sent);
      setSent(false);
      scene.setInteractive({});
      if (b.fresh) {
        tableRef.current = { players: b.players, seat: b.seat, teams: b.view.teams };
        setTable(tableRef.current);
        setChoice(null);
        setFlash(null);
        setSplash(null);
        setTip(null);
        setLog([]);
        setAway(new Array(b.view.n).fill(false));
        scene.setSeats(b.view.n, b.seat, b.view.teams, b.players.map((p) => p.skin));
        scene.sync(b.view, true);
        countsRef.current = b.view.counts.slice();
        setView(b.view);
        setLive(liveOf(b.view));
        await sleep(b.view.hand ? 500 + b.view.hand.length * 110 : 400);
        continue;
      }
      if (b.players) {
        tableRef.current = { ...tableRef.current, players: b.players };
        setTable(tableRef.current);
      }
      // Rückstand (Tab war im Hintergrund): nicht alles nachspielen, nur aufholen
      if (b.events?.length && queueRef.current.length < 3) await scene.play(b.events, announce);
      if (!sceneRef.current) break;
      scene.sync(b.view);
      countsRef.current = b.view.counts.slice();
      setView(b.view);
      setLive(liveOf(b.view));
      // wer dran ist, ist nicht mehr weggeweht (auch wenn das Abspielen übersprungen wurde)
      if (b.view.winner === null) setAway((a) => (a[b.view.turn] ? patch(a, b.view.turn, false) : a));
    }
    busyRef.current = false;
    setBusy(false);
    cb.current.onIdle?.();
  }, [announce]);

  useImperativeHandle(ref, () => ({
    push(batch) {
      queueRef.current.push(batch);
      pump();
    },
  }), [pump]);

  const send = useCallback((action) => {
    setSent(true);
    setChoice(null);
    setTip(null);
    sceneRef.current?.setInteractive({});
    clearTimeout(timers.current.sent);
    timers.current.sent = setTimeout(() => setSent(false), 2500); // abgelehnt oder verloren: wieder freigeben
    cb.current.onAct?.(action);
  }, []);

  const me = table.seat;
  const teams = table.teams;
  const foe = (a, b) => a !== b && (!teams || teams[a] !== teams[b]);
  const blindMe = !!view && view.dark > 0 && me !== null && view.darkBy !== null && foe(view.darkBy, me);

  cb.current = {
    onAct,
    onIdle,
    card(id) {
      const card = view?.hand?.find((c) => c.id === id);
      if (!card) return;
      // Welt oder Ziel wählen — blind entscheidet das Spiel (man weiß ja nicht, was man gegriffen hat)
      if (!blindMe && (card.w < 0 || KINDS[card.k].target)) setChoice({ card, world: card.w < 0 ? null : card.w });
      else send({ t: "play", id });
    },
    draw() {
      send({ t: "draw" });
    },
  };

  // Szene anlegen (einmal), sobald die Spielschrift für die Karten da ist
  useEffect(() => {
    let alive = true;
    let scene = null;
    const positionPlates = () => {
      for (const [seat, el] of Object.entries(plateEls.current)) {
        const p = el && scene?.plate(Number(seat));
        if (!p) continue;
        // Schild bleibt ganz im Bild, auch wenn die Figur am Rand sitzt (Hochformat)
        const half = (el.lastElementChild?.offsetWidth || 120) / 2 + 6;
        const max = (canvasRef.current?.clientWidth || 0) - half;
        const x = max > half ? Math.min(max, Math.max(half, p.x)) : p.x;
        // nicht über der Welt-Tafel oben links landen: dort rutscht das Schild unter die Tafel
        const panel = worldEl.current;
        const under = panel && x - half < panel.offsetLeft + panel.offsetWidth ? panel.offsetTop + panel.offsetHeight + el.lastElementChild.offsetHeight + 8 : 70;
        // und nicht unter dem Weltenrad oben in der Mitte
        const mid = (canvasRef.current?.clientWidth || 0) / 2;
        const wheel = Math.abs(x - mid) < half + 84 ? 164 + el.lastElementChild.offsetHeight : 0;
        el.style.transform = `translate(${x.toFixed(1)}px, ${Math.max(under, wheel, p.y).toFixed(1)}px)`;
      }
    };
    const start = () => {
      if (!alive || !canvasRef.current) return;
      clearCardArt();
      try {
        scene = createTableScene(canvasRef.current, {
          low: isLowGfx(),
          onCard: (id) => cb.current.card(id),
          onDraw: () => cb.current.draw(),
          onHover: (card) => setTip(card && card.k !== "n" ? card : null),
          onFrame: positionPlates,
        });
      } catch (e) {
        console.error("[worldflip] 3D-Szene:", e);
        setFailed(true);
        return;
      }
      sceneRef.current = scene;
      pump();
    };
    const font = document.fonts?.load ? document.fonts.load('900 100px "Rubik"').catch(() => {}) : Promise.resolve();
    Promise.race([font, sleep(1500)]).then(start);
    const t = timers.current;
    return () => {
      alive = false;
      sceneRef.current = null;
      busyRef.current = false;
      scene?.dispose();
      clearTimeout(t.flash);
      clearTimeout(t.splash);
      clearTimeout(t.sent);
    };
  }, [pump]);

  const myTurn = !!view && view.winner === null && me !== null && view.turn === me;
  const canAct = myTurn && !busy && !sent && !choice;

  // Was darf gerade angeklickt werden?
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!canAct) {
      scene.setInteractive({});
      return;
    }
    const pseudo = { drawn: view.drawn, combo: view.combo, world: view.world, pile: [view.top] };
    const cards = blindMe ? view.hand.filter((c) => !view.drawn.length || view.drawn.includes(c.id)) : view.hand.filter((c) => isLegal(pseudo, c));
    scene.setInteractive({ playable: cards.map((c) => c.id), canDraw: !view.drawn.length && view.combo === null });
  }, [canAct, view, blindMe]);

  // Zugzeit
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const shown = live || (view && liveOf(view));
  const w = shown ? WORLDS[shown.world] : null;
  const turnName = shown && shown.turn >= 0 ? table.players[shown.turn]?.name : null;
  const timeLeft = deadline && view && view.winner === null && turnSeconds ? Math.max(0, Math.min(1, (deadline - now) / (turnSeconds * 1000))) : null;
  const color = (seat) => playerColor(table.players, teams, seat);
  // Zustand eines Platzes als beschriftete Marken
  const status = (seat) => shown && (
    <>
      {shown.frozen[seat] && <span className="wf-status wf-status-frozen"><Snowflake size={13} />Eingefroren</span>}
      {shown.shield[seat] && <span className="wf-status wf-status-shield"><Shield size={13} />Schild</span>}
      {away[seat] && <span className="wf-status wf-status-away"><Wind size={13} />Weggeweht</span>}
    </>
  );
  const passing = myTurn && !busy && (view.drawn.length > 0 || view.combo !== null);
  // eigener Zustand: Rahmen ums ganze Bild (das Wichtigste gewinnt)
  const self = !view || me === null || view.winner !== null || !shown ? null
    : shown.frozen[me] ? { cls: "frozen", text: "Du bist eingefroren — dein nächster Zug fällt aus" }
      : away[me] ? { cls: "away", text: "Du wurdest weggeweht — dieser Zug fällt aus" }
        : shown.shield[me] ? { cls: "shield", text: "Dornenschild aktiv — der nächste Angriff prallt ab" }
          : null;
  return (
    <div className="wf-stage">
      <canvas ref={canvasRef} />
      {failed && (
        <div className="wf-center">
          <div className="wf-card p-5 max-w-sm text-center">
            <h2 className="wf-display text-xl mb-2">3D geht hier nicht</h2>
            <p className="wf-dim">Dein Browser stellt gerade keine 3D-Grafik bereit. Schalte die Hardwarebeschleunigung ein oder probier einen anderen Browser.</p>
          </div>
        </div>
      )}
      <div className="wf-hud">
        {tint && <div key={tint.key} className="wf-tint" style={{ background: tint.color }} />}
        {self && <div className={`wf-selfframe wf-selfframe-${self.cls}`}><span>{self.text}</span></div>}
        {myTurn && !busy && !self && <div className="wf-myturn" />}

        {w && view && (
          <>
            <div className="wf-wheelbox" title="Ladung der vier Welten — die aktuelle liegt unten">
              <WorldWheel world={shown.world} charges={shown.charges} />
            </div>
            <div className="wf-panel wf-world" ref={worldEl} style={{ "--wf-w": w.color }}>
              <div className="wf-world-head">
                <span className="wf-world-name">{w.name}</span>
                <span className="wf-world-dir" title={shown.dir > 0 ? "im Uhrzeigersinn" : "gegen den Uhrzeigersinn"}>
                  {shown.dark && <Moon size={14} />}
                  {shown.dir > 0 ? <RotateCw size={14} /> : <RotateCcw size={14} />}
                  {shown.dir > 0 ? "rechtsherum" : "linksherum"}
                </span>
              </div>
              <div className="wf-world-row"><i>Immer</i><span><b>{w.law}</b> {w.lawText}</span></div>
              <div className="wf-world-row wf-world-next">
                <i>Bei {RULES.CHARGE_MAX} Ladung</i>
                <span><b>{EVENTS[shown.next[shown.world]].name}</b> {EVENTS[shown.next[shown.world]].text}</span>
              </div>
              {timeLeft !== null && <div className="wf-timer"><i style={{ width: `${timeLeft * 100}%` }} /></div>}
            </div>
          </>
        )}

        {view && table.players.map((p, seat) => seat !== me && (
          <div key={seat} className="wf-plate" ref={(el) => { plateEls.current[seat] = el; }}>
            <span className="wf-plate-stack">
              <span className="wf-panel wf-plate-box" data-turn={shown?.turn === seat}>
                <span className="wf-seat-dot" style={{ background: color(seat) }} />
                {p.bot && <Bot size={14} aria-label="Bot" />}
                <span style={p.connected === false ? { opacity: 0.5 } : undefined}>{p.name}</span>
                {teams && me !== null && !foe(me, seat) && <span className="text-xs font-medium opacity-70">Partner</span>}
                <span className="wf-plate-count wf-num" data-last={view.counts[seat] === 1}>{view.counts[seat]}</span>
                {shown?.turn === seat && <span className="wf-plate-turn">ist dran</span>}
              </span>
              <span className="wf-plate-status">{status(seat)}</span>
            </span>
          </div>
        ))}

        {flash && !splash && (
          <div key={flash.key} className={`wf-panel wf-flash${flash.low ? " wf-flash-low" : ""}`} style={flash.color ? { borderColor: flash.color } : undefined}>
            <div className="wf-flash-title" style={flash.color ? { color: flash.color } : undefined}>{flash.title}</div>
            {flash.text && <div className="wf-flash-text">{flash.text}</div>}
          </div>
        )}

        {splash && (
          <div key={splash.key} className="wf-splash" style={{ "--wf-w": splash.world.color, "--wf-wd": splash.world.dark }}>
            <div className="wf-splash-band">
              <div className="wf-splash-kicker">Weltereignis · {splash.world.name}</div>
              <div className="wf-splash-title">{splash.name}</div>
              <div className="wf-splash-text">{splash.text}</div>
              <div className="wf-splash-by">{splash.by}</div>
            </div>
          </div>
        )}

        {view && view.winner === null && log.length > 0 && (
          <div className="wf-logbox" tabIndex={0}>
            <ul className="wf-log" aria-label="Verlauf">
              {log.map((l) => (
                <li key={l.key}>
                  <span className="wf-chip" style={{ background: l.color || "var(--wf-surface-3)", width: 8, height: 8 }} />{l.text}
                </li>
              ))}
            </ul>
            <span className="wf-panel wf-logtab"><History size={14} />Verlauf</span>
          </div>
        )}

        {tip && !choice && view?.winner === null && (
          <div className="wf-panel wf-tip"><b>{KINDS[tip.k].name}</b>{KINDS[tip.k].text}</div>
        )}

        {view && view.winner === null && !choice && (
          <div className="wf-panel wf-turnbar" data-mine={myTurn && !busy}>
            {me === null && <><Eye size={15} /><span>Du schaust zu{turnName ? ` · ${turnName} ist dran` : ""}</span></>}
            {me !== null && !(myTurn && !busy) && (
              <span>
                {turnName && shown.turn !== me && <span className="wf-seat-dot inline-block mr-2 align-middle" style={{ background: color(shown.turn) }} />}
                {turnName && shown.turn !== me ? `${turnName} ist dran` : "Gleich geht es weiter"}
              </span>
            )}
            {myTurn && !busy && !passing && (
              <>
                <span>{blindMe ? "Du bist dran und spielst blind" : "Du bist dran"}</span>
                <button type="button" className="wf-btn wf-btn-sm" disabled={!canAct} onClick={() => send({ t: "draw" })}>{view.world === 0 ? "2 ziehen" : "Ziehen"}</button>
              </>
            )}
            {passing && (
              <>
                <span>{view.combo !== null ? `Strömung: noch eine ${view.combo} nachlegen?` : blindMe ? "Gezogene Karte blind legen?" : "Die gezogene Karte passt"}</span>
                <button type="button" className="wf-btn wf-btn-sm" disabled={!canAct} onClick={() => send({ t: "pass" })}>{view.combo !== null ? "Weiter" : "Behalten"}</button>
              </>
            )}
          </div>
        )}

        {view && me !== null && (
          <div className="wf-panel wf-me">
            <span className="wf-seat-dot" style={{ background: color(me) }} />
            <span>{table.players[me]?.name}</span>
            <span className="wf-plate-count wf-num" data-last={view.counts[me] === 1}>{view.counts[me]}</span>
            {status(me)}
          </div>
        )}

        {choice && (
          <div className="wf-center">
            <div className="wf-card p-5 w-full max-w-md">
              <div className="wf-label mb-1">{KINDS[choice.card.k].name}</div>
              <p className="wf-dim text-sm mb-3">{KINDS[choice.card.k].text}</p>
              {choice.world === null ? (
                <>
                  <h2 className="wf-display text-2xl mb-3">{choice.card.k === "zuender" ? "Welche Welt bricht aus?" : "Welche Welt?"}</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {WORLDS.map((wd, i) => (
                      <button
                        key={wd.id}
                        type="button"
                        className="wf-worldbtn"
                        style={{ background: wd.color }}
                        onClick={() => (KINDS[choice.card.k].target ? setChoice({ ...choice, world: i }) : send({ t: "play", id: choice.card.id, world: i }))}
                      >
                        {wd.name}
                        <small>
                          {choice.card.k === "zuender"
                            ? `${EVENTS[view.next[i]].name}: ${EVENTS[view.next[i]].text}`
                            : `${view.hand.filter((c) => c.w === i).length} auf deiner Hand · ${wd.law}`}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="wf-display text-2xl mb-3">Wen trifft es?</h2>
                  <div className="grid gap-2">
                    {table.players.map((p, seat) => seat !== me && (
                      <button
                        key={seat}
                        type="button"
                        className="wf-btn wf-btn-quiet justify-between"
                        onClick={() => send({ t: "play", id: choice.card.id, ...(choice.card.w < 0 ? { world: choice.world } : {}), target: seat })}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="wf-seat-dot" style={{ background: color(seat) }} />{p.name}
                          {teams && !foe(me, seat) && <span className="wf-faint normal-case font-medium">(Partner)</span>}
                          {status(seat)}
                        </span>
                        <span className="wf-num">{view.counts[seat]} Karten</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button type="button" className="wf-btn wf-btn-sm wf-btn-ghost mt-4" onClick={() => setChoice(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {renderOverlay?.({ view, table, busy })}
      </div>
    </div>
  );
});

export default GameTable;
