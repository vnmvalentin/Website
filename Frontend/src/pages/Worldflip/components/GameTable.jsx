// components/GameTable.jsx — der Spieltisch: 3D-Szene (scene/tableScene.js) plus Anzeigen darüber.
//
//   oben Mitte   Ladungs-Türme der vier Welten (die aktuelle hell, mit Marke darunter); links daneben Name der Welt und
//                ihr Gesetz (passiv, gilt immer), rechts ihr nächstes Ereignis (aktiv, bei voller Ladung)
//   Handkarten   Zeichen an Karten, die beim Legen eine Welt ausbrechen lassen (tableScene setBadge)
//   Mitte        großes Feld, wenn ein Weltereignis ausgelöst wird; kleinere Einblendung für Karten und Weltwechsel
//   an den Figuren  Namensschilder mit Zustand (dran, eingefroren, Schild, weggeweht)
//   oben rechts  2 gegen 2: die Karten des Partners (view.mate)
//   Mitte        Flaschenpost: die Hand, in die man gerade schauen darf (ein paar Sekunden)
//   unten        eigene Zeile (dran / ziehen / auf einen Angriff antworten), eigener Zustand als Rahmen ums Bild, Verlauf (klappt beim Überfahren auf)
//
// Der Tisch kennt weder Bots noch Server. Wer ihn benutzt (WfLocal, WfRoom), schiebt Stände hinein:
//   ref.push({ fresh: true, view, players, seat })   neue Runde: Plätze aufbauen, austeilen
//   ref.push({ events, view })                       ein Zug: Ereignisse abspielen, dann auf die Sicht stellen
// und bekommt Züge über onAct(action) zurück. onIdle() meldet, dass alles abgespielt ist.
// Die Anzeige (view) wechselt erst NACH dem Abspielen — Knöpfe und Endbildschirm kommen also nie zu früh.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bot, Cloud, Eye, History, Moon, RotateCcw, RotateCw, Shield, Snowflake, Wind, X } from "lucide-react";
import CardImg from "./CardImg.jsx";
import { createTableScene } from "../scene/tableScene.js";
import { clearCardArt } from "../scene/cardArt.js";
import { playerColor } from "../skins.js";
import { EVENTS, KINDS, RULES, WORLDS, effectOf, eruptsWith, isCosmic, isLegal, needsTarget } from "../engine/index.js";
import { isLowGfx } from "../../../utils/lowGfx.js";
import { meldeFehler } from "../../../utils/fehlerMelder.js";
import { sfx } from "../sound.js";

const FLASH_MS = 2700;
const SPLASH_MS = 1800; // muss zu .wf-splash-band in theme.css passen; danach zeigt die Szene die Wirkung (tableScene erupt)
const PEEK_MS = 8000; // so lange bleibt die per Flaschenpost gezeigte Hand stehen
const POP_MS = 1600; // so lange steht „+N“ über dem Namensschild (Animation in theme.css .wf-pop)
const LOG_MAX = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// turn: wer gerade handeln darf — bei einem offenen Angriff der, der antworten kann
const liveOf = (v) => ({
  world: v.world, charges: v.charges, next: v.next, turn: v.winner === null ? (v.react ? v.react.seat : v.turn) : -1, dir: v.dir, dark: v.dark > 0,
  shield: v.shield, frozen: v.frozen, out: v.out || [], fog: v.fog || [],
});
// Reihenfolge der Partnerhand: nach Welt, dann Kartenart, dann Zahl (wie die eigene Hand)
const KIND_INDEX = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, i]));
const handOrder = (a, b) => ((a.w < 0 ? 4 : a.w) - (b.w < 0 ? 4 : b.w)) || (KIND_INDEX[a.k] - KIND_INDEX[b.k]) || ((a.n || 0) - (b.n || 0)) || (a.id - b.id);
const patch = (list, i, value) => list.map((x, k) => (k === i ? value : x));

// ── Ladungs-Türme ───────────────────────────────────────────────────────────────────────────
// Seit 16.11.2026 statt des Weltenrads (Wunsch des Nutzers: „anderes Symbol, wie Türme“, Gesetz und Ereignis links und
// rechts daneben). Jede Welt ein Turm aus RULES.CHARGE_MAX Steinen, die von unten in ihrer Farbe aufleuchten.
const TW = 24; // Turmbreite
const TS = 14; // Abstand der Türme
const BH = 11; // Steinhöhe
const BG = 3; // Fuge
const CREST = 9; // Zinnen
function ChargeTowers({ world, charges }) {
  const M = RULES.CHARGE_MAX;
  const H = CREST + 3 + M * (BH + BG);
  const W = 4 * TW + 3 * TS;
  return (
    <svg className="wf-towers" viewBox={`-2 -2 ${W + 4} ${H + 14}`} aria-hidden="true">
      {WORLDS.map((w, i) => {
        const x = i * (TW + TS);
        const on = i === world;
        return (
          <g key={w.id} opacity={on ? 1 : 0.55}>
            {[0, 1, 2].map((k) => (
              <rect key={k} x={x + k * (TW / 3) + 1.5} y={0} width={TW / 3 - 3} height={CREST} rx="1.5" fill={on ? w.color : "#4a4658"} />
            ))}
            {Array.from({ length: M }, (_, k) => (
              <rect key={k} x={x} y={CREST + 3 + (M - 1 - k) * (BH + BG)} width={TW} height={BH} rx="2" fill={k < charges[i] ? w.color : "#34313f"} />
            ))}
            {on && <path d={`M${x + TW / 2 - 6} ${H + 11} L${x + TW / 2 + 6} ${H + 11} L${x + TW / 2} ${H + 3} Z`} fill="#f4eedf" />}
          </g>
        );
      })}
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
  const fogRef = useRef([]); // wer gerade im Nebel steht — dessen Kartenzahl wird nicht angesagt
  const seenWorldsRef = useRef(new Set()); // Welten, deren Gesetz in dieser Partie schon groß angesagt wurde
  const plateEls = useRef({});
  const barEl = useRef(null); // Leiste oben: Gesetz, Türme, Ereignis
  const mateEl = useRef(null);
  const cb = useRef({});
  const timers = useRef({ flash: null, splash: null, sent: null, peek: null });

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
  const [choice, setChoice] = useState(null); // { card, world: null | 0–3, target: braucht die Karte ein Ziel? }
  const [peek, setPeek] = useState(null); // Flaschenpost: { seat, cards } — die Hand, in die ich gerade schauen darf
  const [pops, setPops] = useState([]); // „+N“ am Namensschild, sobald gezogene Karten angekommen sind (scene onDealt)
  const [now, setNow] = useState(() => Date.now());

  const popDraw = useCallback((seat, n) => {
    const key = Math.random();
    setPops((list) => [...list.filter((p) => p.seat !== seat), { key, seat, n }]);
    setTimeout(() => setPops((list) => list.filter((p) => p.key !== key)), POP_MS);
  }, []);
  const popOf = (seat) => {
    const p = pops.find((x) => x.seat === seat);
    return p ? <span key={p.key} className="wf-pop" data-big={p.n >= 3} aria-hidden="true">+{p.n}</span> : null;
  };

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
        if (e.card.k === "echo") showFlash("Echo", `${e.seat === me ? "Du wiederholst" : `${name(e.seat)} wiederholt`}: ${e.echo ? `${KINDS[e.echo].name} — ${KINDS[e.echo].text}` : "nichts, es lag noch keine Effektkarte"}`, WORLDS[e.world].color, true);
        else if (e.card.k === "spiegel") showFlash("Spiegel", e.seat === me ? "Du legst ihn nur ab — wirken würde er als Antwort auf einen Angriff" : `${name(e.seat)} legt ihn nur ab, die Welt bleibt`, WORLDS[e.world].color, true);
        else if (e.card.k !== "n") showFlash(KINDS[e.card.k].name, `${e.seat === me ? "Du legst" : `${name(e.seat)} legt`}: ${KINDS[e.card.k].text}`, WORLDS[e.world].color, true);
        else note(`${e.seat === me ? "Du legst" : `${name(e.seat)} legt`} ${WORLDS[e.card.w].name} ${e.card.n}`, WORLDS[e.card.w].color);
        if (fogRef.current[e.seat] && e.seat !== me) break; // im Nebel verrät die Ansage nichts über die Kartenzahl
        if (counts[e.seat] === 1 && e.card.k !== "n") note(e.seat === me ? "Du hast nur noch eine Karte" : `${name(e.seat)} hat nur noch eine Karte`);
        else if (counts[e.seat] === 1) showFlash("Letzte Karte", e.seat === me ? "Noch eine, dann hast du gewonnen" : `${name(e.seat)} hat nur noch eine`);
        break;
      case "draw":
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        if (e.n) note(`${e.seat === me ? "Du ziehst" : `${name(e.seat)} zieht`} ${e.n === 1 ? "eine Karte" : `${e.n} Karten`}`);
        break;
      case "world":
        up((l) => ({ ...l, world: e.to }));
        // Das Gesetz groß nur beim ersten Besuch einer Welt in der Partie, danach steht es nur in der Tafel oben links
        // und im Verlauf (Rückmeldung 16.11.2026: am Anfang zu viel auf einmal). Abblenden macht die Szene (swapWorld).
        if (seenWorldsRef.current.has(e.to)) note(`Welt: ${WORLDS[e.to].name} (${WORLDS[e.to].law})`, WORLDS[e.to].color);
        else showFlash(WORLDS[e.to].name, `${WORLDS[e.to].law}: ${WORLDS[e.to].lawText}`, WORLDS[e.to].color);
        seenWorldsRef.current.add(e.to);
        break;
      case "flip":
        up((l) => ({ ...l, dir: e.dir }));
        showFlash("Richtungswechsel", e.dir < 0 ? "Jetzt geht es gegen den Uhrzeigersinn" : "Wieder im Uhrzeigersinn");
        break;
      case "skip":
        setAway((a) => patch(a, e.seat, true));
        if (Number.isInteger(e.mirror)) up((l) => ({ ...l, out: patch(l.out, e.seat, true) }));
        showFlash("Sturm", Number.isInteger(e.mirror)
          ? who(e.seat, "Dein Sturm kommt zurück: Du wirst weggeweht und setzt aus", "wird vom eigenen Sturm weggeweht und setzt aus")
          : who(e.seat, "Du wirst weggeweht und setzt aus", "wird weggeweht und setzt aus"));
        break;
      case "hagel":
      case "meteor": {
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        const title = KINDS[e.t].name;
        // beide lassen nur ziehen (der Meteor ließ bis 16.11.2026 auch aussetzen)
        showFlash(e.t === "hagel" && e.plus > KINDS.hagel.plus ? `Hagel × ${e.plus / KINDS.hagel.plus}` : title, Number.isInteger(e.mirror)
          ? who(e.seat, `Dein ${title} kommt zurück: Du ziehst ${e.plus} Karten`, `bekommt den eigenen ${title} ab und zieht ${e.plus} Karten`)
          : who(e.seat, `Du ziehst ${e.plus} Karten`, `zieht ${e.plus} Karten`), e.t === "hagel" ? "#bfe9ff" : WORLDS[0].color);
        break;
      }
      case "sitout":
        up((l) => ({ ...l, out: patch(l.out, e.seat, false) }));
        setAway((a) => (a[e.seat] ? patch(a, e.seat, false) : a));
        showFlash("Aussetzen", who(e.seat, "Dein Zug fällt aus", "setzt aus"));
        break;
      case "burn":
        counts[e.seat] = Math.max(0, (counts[e.seat] || 0) - e.losses.length);
        showFlash("Brandopfer", e.losses.length ? who(e.seat, "Eine deiner Karten verbrennt", "verbrennt eine eigene Karte") : "Die letzte Karte bleibt verschont", WORLDS[0].color);
        break;
      case "peek":
        if (e.cards) {
          // ich darf schauen: Die Hand bleibt ein paar Sekunden stehen
          clearTimeout(timers.current.peek);
          setPeek({ seat: e.seat, cards: e.cards });
          timers.current.peek = setTimeout(() => setPeek(null), PEEK_MS);
        }
        if (e.cards) note(`Flaschenpost: Du siehst die Karten von ${name(e.seat)}`, WORLDS[1].color);
        else showFlash("Flaschenpost", e.seat === me ? `${name(e.by)} sieht deine Karten` : `${name(e.by)} sieht die Karten von ${name(e.seat)}`, WORLDS[1].color);
        break;
      case "fog":
        fogRef.current[e.seat] = true;
        up((l) => ({ ...l, fog: patch(l.fog, e.seat, true) }));
        showFlash("Nebel", who(e.seat, "Niemand sieht mehr, wie viele Karten du hältst", "verbirgt, wie viele Karten er hält"), WORLDS[3].color);
        break;
      case "unfog":
        fogRef.current[e.seat] = false;
        up((l) => ({ ...l, fog: patch(l.fog, e.seat, false) }));
        showFlash("Der Nebel lichtet sich", who(e.seat, "Deine Kartenzahl ist wieder zu sehen", "zeigt seine Karten wieder"), WORLDS[3].color);
        break;
      case "nova":
        up((l) => ({ ...l, charges: e.charges }));
        showFlash("Supernova", "Alle anderen Welten laden sich um 1 auf", WORLDS[3].color);
        break;
      case "rotate":
        showFlash("Wurmlöcher", "Alle Hände wandern einen Platz weiter", WORLDS[3].color);
        break;
      case "ask":
        up((l) => ({ ...l, turn: e.seat }));
        if (e.seat === me) sfx.turn();
        note(e.seat === me ? "Du darfst antworten" : `${name(e.seat)} darf antworten`);
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
      case "reflect":
        counts[e.seat] = Math.max(0, (counts[e.seat] || 0) - 1);
        showFlash("Spiegel", e.seat === me ? `Du wirfst den Angriff auf ${name(e.to)} zurück`
          : e.to === me ? `${name(e.seat)} wirft deinen Angriff auf dich zurück`
            : `${name(e.seat)} wirft den Angriff auf ${name(e.to)} zurück`, WORLDS[3].color, true);
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
        showFlash("Wurmlöcher", other !== null ? `Du tauschst die Hand mit ${name(other)}` : `${name(e.a)} und ${name(e.b)} tauschen die Hände`, WORLDS[3].color);
        break;
      }
      case "beam":
        counts[e.seat] = (counts[e.seat] || 0) + e.n;
        showFlash("Strahl", who(e.seat, "Du ziehst 2 Karten", "zieht 2 Karten"), WORLDS[3].color);
        break;
      case "erupt": {
        // Weltereignis: großes Feld quer über die Mitte
        up((l) => ({ ...l, charges: e.charges || patch(l.charges, e.world, 0), ...(e.freeze ? { frozen: l.frozen.map((f, s) => f || e.freeze.includes(s)) } : {}) }));
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
        setPeek(null);
        setTip(null);
        setLog([]);
        setAway(new Array(b.view.n).fill(false));
        scene.setSeats(b.view.n, b.seat, b.view.teams, b.players.map((p) => p.skin));
        scene.sync(b.view, true);
        countsRef.current = b.view.counts.slice();
        fogRef.current = (b.view.fog || []).slice();
        seenWorldsRef.current = new Set([b.view.world]);
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
      fogRef.current = (b.view.fog || []).slice();
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
      // Antwort auf einen Angriff: Spiegel oder Hagel
      if (view.react) {
        send({ t: "react", id });
        return;
      }
      // Welt oder Ziel wählen — blind entscheidet das Spiel (man weiß ja nicht, was man gegriffen hat)
      const target = needsTarget(view, card);
      const pickWorld = card.w < 0 && card.k !== "spiegel"; // der Spiegel passt immer, lässt die Welt aber, wie sie ist
      if (!blindMe && (pickWorld || target)) setChoice({ card, world: pickWorld ? null : card.w, target });
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
        // nicht unter der Leiste oben (Gesetz, Türme, Ereignis) landen: dort rutscht das Schild darunter
        const plateH = el.lastElementChild.offsetHeight;
        const bar = barEl.current;
        const under = bar && x + half > bar.offsetLeft && x - half < bar.offsetLeft + bar.offsetWidth ? bar.offsetTop + bar.offsetHeight + plateH + 8 : 70;
        // genauso bei der Partner-Tafel oben rechts (2 gegen 2)
        const matePanel = mateEl.current;
        const underMate = matePanel && x + half > matePanel.offsetLeft ? matePanel.offsetTop + matePanel.offsetHeight + plateH + 8 : 70;
        el.style.transform = `translate(${x.toFixed(1)}px, ${Math.max(under, underMate, p.y).toFixed(1)}px)`;
      }
    };
    // Partner-Tafel (2 gegen 2) rechts oben — stößt sie an die Leiste, rutscht sie darunter
    const positionMate = () => {
      const bar = barEl.current;
      const m = mateEl.current;
      if (!m) return;
      const width = canvasRef.current?.clientWidth || 0;
      const clash = bar && width - 10 - m.offsetWidth < bar.offsetLeft + bar.offsetWidth + 6;
      const top = `${clash ? bar.offsetTop + bar.offsetHeight + 8 : 10}px`;
      if (m.style.top !== top) m.style.top = top;
    };
    const start = () => {
      if (!alive || !canvasRef.current) return;
      clearCardArt();
      try {
        scene = createTableScene(canvasRef.current, {
          low: isLowGfx(),
          onCard: (id) => cb.current.card(id),
          onDraw: () => cb.current.draw(),
          onHover: (card) => setTip(card || null),
          onDealt: (seat, n) => popDraw(seat, n),
          onFrame: () => {
            positionMate();
            positionPlates();
          },
        });
      } catch (e) {
        console.error("[worldflip] 3D-Szene:", e);
        meldeFehler("manuell", e, "Worldflip: 3D-Tisch konnte nicht starten");
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
      clearTimeout(t.peek);
    };
  }, [pump, popDraw]);

  // am Zug — oder Ziel eines Angriffs, auf den ich antworten darf (dann ruht der Zug des Angreifers)
  const myTurn = !!view && view.winner === null && me !== null && view.turn === me && !view.react;
  const myReact = !!view && view.winner === null && me !== null && !!view.react && view.react.seat === me;
  const canAct = (myTurn || myReact) && !busy && !sent && !choice;

  // Was darf gerade angeklickt werden?
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!canAct) {
      scene.setInteractive({});
      return;
    }
    if (myReact) {
      // Antwort: nur Spiegel und (gegen Hagel) der eigene Hagel lassen sich anklicken
      scene.setInteractive({ playable: view.hand.filter((c) => c.k === "spiegel" || (c.k === "hagel" && view.react.k === "hagel")).map((c) => c.id) });
      return;
    }
    const pseudo = { drawn: view.drawn, combo: view.combo, world: view.world, pile: [view.top] };
    const cards = blindMe ? view.hand.filter((c) => !view.drawn.length || view.drawn.includes(c.id)) : view.hand.filter((c) => isLegal(pseudo, c));
    // Hinweis an den spielbaren Karten, die eine Welt ausbrechen lassen (blind sieht man sie ja nicht)
    const erupts = blindMe ? [] : cards.map((c) => ({ id: c.id, world: eruptsWith(view, c)[0] })).filter((x) => x.world !== undefined);
    scene.setInteractive({ playable: cards.map((c) => c.id), canDraw: !view.drawn.length && view.combo === null, erupts });
  }, [canAct, view, blindMe, myReact]);

  // Zugzeit
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const shown = live || (view && liveOf(view));
  const w = shown ? WORLDS[shown.world] : null;
  const turnName = shown && shown.turn >= 0 ? table.players[shown.turn]?.name : null;
  // Zeitbalken: für eine Antwort läuft die kürzere Antwortzeit
  const span = view?.react ? Math.min(RULES.REACT_SECONDS, turnSeconds) : turnSeconds;
  const timeLeft = deadline && view && view.winner === null && span ? Math.max(0, Math.min(1, (deadline - now) / (span * 1000))) : null;
  const color = (seat) => playerColor(table.players, teams, seat);
  // Zustand eines Platzes als beschriftete Marken
  const status = (seat) => shown && (
    <>
      {shown.frozen[seat] && <span className="wf-status wf-status-frozen"><Snowflake size={13} />Eingefroren</span>}
      {shown.shield[seat] && <span className="wf-status wf-status-shield"><Shield size={13} />Schild</span>}
      {shown.fog[seat] && <span className="wf-status wf-status-fog"><Cloud size={13} />{seat === me && view.fogLeft > 0 ? `Nebel · noch ${view.fogLeft}` : "Nebel"}</span>}
      {away[seat] ? <span className="wf-status wf-status-away"><Wind size={13} />Weggeweht</span>
        : shown.out[seat] && <span className="wf-status wf-status-away"><Wind size={13} />Setzt aus</span>}
    </>
  );
  const passing = myTurn && !busy && (view.drawn.length > 0 || view.combo !== null);
  // eigener Zustand: Rahmen ums ganze Bild (das Wichtigste gewinnt)
  const self = !view || me === null || view.winner !== null || !shown ? null
    : shown.frozen[me] ? { cls: "frozen", text: "Du bist eingefroren — dein nächster Zug fällt aus" }
      : away[me] ? { cls: "away", text: "Du wurdest weggeweht — dieser Zug fällt aus" }
        : shown.out[me] ? { cls: "away", text: "Dein nächster Zug fällt aus" }
          : shown.shield[me] ? { cls: "shield", text: "Dornenschild aktiv — der nächste Angriff prallt ab" }
            : null;
  const mate = view && view.winner === null ? view.mate : null;
  // Antwort auf einen Angriff: Welche Karten kommen in Frage, was droht?
  const react = view && view.winner === null ? view.react : null;
  const answers = myReact ? view.hand.filter((c) => c.k === "spiegel" || (c.k === "hagel" && react.k === "hagel")) : [];
  const threat = !react ? "" : react.k === "sturm" ? "aussetzen" : react.k === "frost" ? "einfrieren"
    : react.k === "hagel" || react.k === "meteor" || react.k === "strahl" ? `${react.plus} Karten ziehen`
      : react.k === "saat" ? "eine Karte dazu" : "in deine Karten schauen";
  // Erklärung der Karte unter dem Zeiger: Effektkarten, das Echo mit dem, was es gerade wiederholt, 0 und 7 im Kosmos —
  // und ob die Karte eine Welt ausbrechen lässt (dann trägt sie in der Hand auch ein Zeichen)
  const tipOf = (c) => {
    const burst = view ? eruptsWith(view, c).map((w) => `Bricht aus: ${WORLDS[w].name} — ${EVENTS[view.next[w]].name}: ${EVENTS[view.next[w]].text}`).join(" ") : "";
    let base;
    if (c.k === "n") {
      if (view && isCosmic(view, c)) base = { name: `${WORLDS[3].law} · ${c.n}`, text: c.n === 7 ? "Du tauschst die Hand mit einem Spieler deiner Wahl." : "Alle Hände wandern einen Platz in Spielrichtung weiter." };
      else if (burst) base = { name: `${WORLDS[c.w].name} ${c.n}`, text: "" };
      else return null;
    } else {
      const fx = view && c.k === "echo" ? effectOf(view, c) : null;
      base = { name: KINDS[c.k].name, text: c.k === "echo" ? `${KINDS.echo.text} Gerade: ${fx ? `${KINDS[fx].name} — ${KINDS[fx].text}` : "noch nichts."}` : KINDS[c.k].text };
      if (c.w < 0) base.text += " Lädt keine Welt auf.";
    }
    return { ...base, burst };
  };
  const tipInfo = tip && !choice && view?.winner === null ? tipOf(tip) : null;
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
          <div className="wf-worldbar" ref={barEl} style={{ "--wf-w": w.color }}>
            <div className="wf-panel wf-wb-side wf-wb-law">
              <div className="wf-world-head">
                <span className="wf-world-name">{w.name}</span>
                <span className="wf-world-dir" title={shown.dir > 0 ? "im Uhrzeigersinn" : "gegen den Uhrzeigersinn"}>
                  {shown.dark && <Moon size={14} />}
                  {shown.dir > 0 ? <RotateCw size={14} /> : <RotateCcw size={14} />}
                  <span className="wf-world-dir-text">{shown.dir > 0 ? "rechtsherum" : "linksherum"}</span>
                </span>
              </div>
              <i className="wf-wb-label">Passiv · gilt immer</i>
              <p><b>{w.law}</b> {w.lawText}</p>
            </div>
            <div className="wf-panel wf-wb-towers" title="Ladung der vier Welten — die aktuelle ist hell, darunter die Marke">
              <ChargeTowers world={shown.world} charges={shown.charges} />
            </div>
            <div className="wf-panel wf-wb-side wf-wb-event">
              <div className="wf-world-head">
                <i className="wf-wb-label">Aktiv · bei {RULES.CHARGE_MAX} Ladung</i>
                <span className="wf-wb-count wf-num">{shown.charges[shown.world]}/{RULES.CHARGE_MAX}</span>
              </div>
              <p><b>{EVENTS[shown.next[shown.world]].name}</b> {EVENTS[shown.next[shown.world]].text}</p>
            </div>
            {timeLeft !== null && <div className="wf-timer wf-wb-timer"><i style={{ width: `${timeLeft * 100}%` }} /></div>}
          </div>
        )}

        {mate && (
          <div className="wf-panel wf-mate" ref={mateEl}>
            <div className="wf-mate-head">
              <span className="wf-seat-dot" style={{ background: color(mate.seat) }} />
              <span className="truncate">{table.players[mate.seat]?.name}</span>
              <i>Partner</i>
            </div>
            {mate.hand ? (
              <div className="wf-mate-cards">
                {mate.hand.slice().sort(handOrder).map((c) => (
                  <span key={c.id} onPointerEnter={() => setTip(c)} onPointerLeave={() => setTip(null)}>
                    <CardImg card={c} />
                  </span>
                ))}
              </div>
            ) : (
              <div className="wf-mate-dark">Im Dunkeln siehst du auch diese Karten nicht.</div>
            )}
          </div>
        )}

        {view && table.players.map((p, seat) => seat !== me && (
          <div key={seat} className="wf-plate" ref={(el) => { plateEls.current[seat] = el; }}>
            <span className="wf-plate-stack">
              {popOf(seat)}
              <span className="wf-panel wf-plate-box" data-turn={shown?.turn === seat}>
                <span className="wf-seat-dot" style={{ background: color(seat) }} />
                {p.bot && <Bot size={14} aria-label="Bot" />}
                <span style={p.connected === false ? { opacity: 0.5 } : undefined}>{p.name}</span>
                {teams && me !== null && !foe(me, seat) && <span className="text-xs font-medium opacity-70">Partner</span>}
                <span className="wf-plate-count wf-num" data-last={view.counts[seat] === 1} title={view.counts[seat] === null ? "Im Nebel: Kartenzahl verborgen" : undefined}>{view.counts[seat] ?? "?"}</span>
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

        {peek && view?.winner === null && (
          <div className="wf-panel wf-peek">
            <div className="wf-mate-head">
              <span className="wf-seat-dot" style={{ background: color(peek.seat) }} />
              <span className="truncate">Karten von {table.players[peek.seat]?.name}</span>
              <button type="button" className="wf-peek-close" onClick={() => setPeek(null)} aria-label="Schließen"><X size={15} /></button>
            </div>
            <div className="wf-peek-cards">
              {peek.cards.slice().sort(handOrder).map((c) => (
                <span key={c.id} onPointerEnter={() => setTip(c)} onPointerLeave={() => setTip(null)}><CardImg card={c} /></span>
              ))}
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

        {tipInfo && (
          <div className="wf-panel wf-tip">
            <b>{tipInfo.name}</b>{tipInfo.text}
            {tipInfo.burst && <span className="wf-tip-burst">{tipInfo.burst}</span>}
          </div>
        )}

        {view && view.winner === null && !choice && (
          <div className="wf-panel wf-turnbar" data-mine={(myTurn || myReact) && !busy}>
            {me === null && <><Eye size={15} /><span>Du schaust zu{turnName ? ` · ${turnName} ${react ? "darf antworten" : "ist dran"}` : ""}</span></>}
            {me !== null && !((myTurn || myReact) && !busy) && (
              <span>
                {turnName && shown.turn !== me && <span className="wf-seat-dot inline-block mr-2 align-middle" style={{ background: color(shown.turn) }} />}
                {turnName && shown.turn !== me ? `${turnName} ${react && !busy ? "darf antworten" : "ist dran"}` : "Gleich geht es weiter"}
              </span>
            )}
            {myReact && !busy && (
              <>
                <span>
                  <span className="wf-seat-dot inline-block mr-2 align-middle" style={{ background: color(react.by) }} />
                  {`${table.players[react.by]?.name} greift an: ${KINDS[react.k].name} — ${threat}`}
                </span>
                {answers.some((c) => c.k === "spiegel") && (
                  <button type="button" className="wf-btn wf-btn-sm" disabled={!canAct} onClick={() => send({ t: "react", id: answers.find((c) => c.k === "spiegel").id })}>Spiegel</button>
                )}
                {answers.some((c) => c.k === "hagel") && (
                  <button type="button" className="wf-btn wf-btn-sm" disabled={!canAct} onClick={() => send({ t: "react", id: answers.find((c) => c.k === "hagel").id })}>Hagel drauf</button>
                )}
                <button type="button" className="wf-btn wf-btn-sm wf-btn-take" disabled={!canAct} onClick={() => send({ t: "take" })}>Hinnehmen</button>
              </>
            )}
            {myTurn && !busy && !passing && (
              <>
                <span>{blindMe ? "Du bist dran und spielst blind" : "Du bist dran"}</span>
                <button type="button" className="wf-btn wf-btn-sm" disabled={!canAct} onClick={() => send({ t: "draw" })}>{view.drawUntil ? "Ziehen, bis es passt" : view.world === 0 ? "2 ziehen" : "Ziehen"}</button>
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
            {popOf(me)}
            <span className="wf-seat-dot" style={{ background: color(me) }} />
            <span>{table.players[me]?.name}</span>
            <span className="wf-plate-count wf-num" data-last={view.counts[me] === 1}>{view.counts[me]}</span>
            {status(me)}
          </div>
        )}

        {choice && (
          <div className="wf-center">
            <div className="wf-card p-5 w-full max-w-md">
              <div className="wf-label mb-1">{tipOf(choice.card)?.name}</div>
              <p className="wf-dim text-sm mb-3">{tipOf(choice.card)?.text}{tipOf(choice.card)?.burst ? ` ${tipOf(choice.card).burst}` : ""}</p>
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
                        onClick={() => (choice.target ? setChoice({ ...choice, world: i }) : send({ t: "play", id: choice.card.id, world: i }))}
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
                  <h2 className="wf-display text-2xl mb-3">{choice.card.k === "n" ? "Mit wem tauschst du?" : effectOf(view, choice.card) === "flaschenpost" ? "Wessen Karten?" : "Wen trifft es?"}</h2>
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
                        <span className="wf-num">{view.counts[seat] ?? "?"} Karten</span>
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
