// ui/table/TableBattle.jsx — der Kampf am neuen Tisch (Rebuild „Am Tisch“, Phase 1).
//
// Ersetzt BattleScreen.jsx am Tisch im Kerzenlicht (Standard): dieselben Regeln, dieselben Aktionen, aber bedient
// wird an den Gegenständen der 3D-Szene (scene/tableRoom.js). Im Bild stehen keine Kästen und Knöpfe mehr —
// DOM gibt es nur noch für: Erklärblatt einer Karte (Rechtsklick / lange drücken), Tooltip an Gegenständen, kurze
// Meldungen, die seltenen Auswahlen (Seher, Pinzette) und das Pausenmenü (Esc).
//
// Bedienung: Stapel anklicken = ziehen · Handkarte anklicken = nehmen · eigene Karten anklicken = opfern (bis das
// Blut reicht), dann das Feld anklicken · Siegelstempel oder Leertaste = Zug beenden · Hammer nehmen, eigene Karte
// treffen · Rechtsklick oder Esc legt alles zurück.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import { SeerDialog } from "../battle/BattleScreen.jsx";
import GestureWheel from "./GestureWheel.jsx";
import TablePause from "./TablePause.jsx";
import { GESTURES } from "./masks.js";
import SigilIcon from "../icons/SigilIcon.jsx";
import { Resolver, SCALE_WIN, STALEMATE_TURN, CANDLE_WARNING_TURN, candleWeight, TIDE_FLOOD, tideAt, HAND_LIMIT } from "../../engine/battle.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { ITEM_BY_ID } from "../../data/items.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { usePrefs } from "../prefs.js";
import { baseDesc, baseName, headLabel, headName, totemText } from "../common/totemText.js";
import "./table.css";

/** Klicks auf diese Dinge lösen eine Aktion aus (und brechen dafür laufende Abläufe ab). */
const ACTIONABLE = new Set(["hand", "unit", "slot", "deck", "seal", "hammer", "item"]);

/** Reihe der Szene ↔ Spieler und Zone der Engine. */
const rowOf = (p, zone, bottom) => `${p === bottom ? "own" : "opp"}${zone === "front" ? "Front" : "Back"}`;
const parseRow = (row, bottom) => ({ p: row.startsWith("own") ? bottom : 1 - bottom, zone: row.endsWith("Front") ? "front" : "back" });

/** Aura-Sigils (Totems), die für eine Einheit gelten. */
function aurasOf(b, u) {
  const a = b.players[u.owner].auras || {};
  const out = [];
  if (a.tribeSigil && a.tribe === u.card.tribe) out.push(a.tribeSigil);
  if (a.laneSigil && a.lane === u.lane) out.push(a.laneSigil);
  return out;
}

/** Karte in der Hand spielbar? @returns {{ ok: boolean, need: number, tide?: boolean }} */
function affordable(r, P, card, p) {
  const c = card.cost;
  if (card.tide && r.tide() !== null && (card.tide === "high") !== r.highWater()) return { ok: false, need: 0, tide: true };
  if (c.type === "bones") return { ok: P.bones >= c.amount, need: 0 };
  if (c.type === "wax") return { ok: P.wax >= c.amount, need: 0 };
  if (c.type === "salt") return { ok: (P.salt || 0) >= c.amount, need: 0 };
  const need = Math.max(0, c.amount - (P.bloodBonus || 0));
  if (need === 0) return { ok: true, need };
  let sum = 0;
  for (const u of r.units(p)) if (r.laneProp(p, u.lane) !== "heilig") sum += r.bloodValueOf(u);
  return { ok: sum >= need, need };
}

/** Metamorphose-Countdown (null = keine). */
function metamorphLeft(r, u) {
  if (!u.card.evolvesTo || r.level(u, "metamorphose") <= 0) return null;
  return Math.max(0, 2 - (u.turns || 0));
}

function tideTurnsLeft(tide, turn, shift) {
  let left = 1;
  while (left < 3 && tideAt(turn + left, shift) === tide) left++;
  return left;
}

/**
 * @param {{ room: any, view: any, display: any, anim: any, you: 0|1|null, send: (a: any) => Promise<any>, timers: any, clockOffset: number,
 *   busy: boolean, names: string[], skipAll?: () => void, rush?: () => void, status?: string | null,
 *   aiManners?: boolean,
 *   gesture?: { n: number, seat: number, kind: string, target?: any } | null,
 *   onGesture?: (kind: string, target?: any) => void, onFallback?: () => void, pauseExtra?: React.ReactNode,
 *   run?: { title?: string, sub?: React.ReactNode, notes?: any[], noteTip?: (id: string) => React.ReactNode, onNote?: (id: string) => void, surrenderText?: string } }} props
 *   run: Kampf der Moorwanderung — Titel, Zettel (Hausregel, Siegel) und der Text beim Aufgeben (es kostet den ganzen Run);
 *     onNote: Klick auf einen Zettel mit click: true (Lager: „Zurück ins Lager“ beim Zuschauen am Nachbartisch)
 *   room: die Szene (scene/tableRoom.js) — sie gehört der Hülle TableHost und steht schon
 *   pauseExtra: zusätzliche Knöpfe im Pausenmenü (Tutorial: neu starten)
 *   onFallback: für diesen Kampf auf den bisherigen Tisch ausweichen (im Pausenmenü gewählt)
 *   rush: laufende Abläufe im Zeitraffer zu Ende spielen · skipAll: sofort auf den Endstand springen
 *   status: Meldung von außen (Verbindung verloren, Hinweis des Raums)
 *   gesture: zuletzt empfangene Geste eines anderen (n zählt hoch) · onGesture: eigene Geste verschicken
 *   aiManners: die Gestalt antwortet von selbst auf Gesten (Spiel gegen die KI)
 */
export default function TableBattle({ room, view, display, anim, you, send, timers, clockOffset, busy, names, skipAll, rush, status, aiManners, gesture, onGesture, onFallback, pauseExtra, run }) {
  const { showTip } = useShell();
  const prefs = usePrefs();
  const b = display;
  const bottom = you ?? 0;
  const top = 1 - bottom;
  const r = useMemo(() => new Resolver(b), [b]);
  const live = view.battle;
  const me = b.players[bottom];
  const opp = b.players[top];
  const myTurn = you !== null && live.active === you && live.phase !== "over";
  const canAct = myTurn && !busy;
  const liveMe = you !== null ? live.players[you] : null;
  const pending = live.pending?.[0];
  const needDraw = !!(canAct && liveMe && !liveMe.drew && !pending);

  // Die Szene gehört der Hülle (TableHost): sie steht schon, wenn der Kampf beginnt
  const roomRef = useRef(/** @type {any} */ (room));
  roomRef.current = room;
  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  const [sacs, setSacs] = useState(/** @type {Array<{zone: string, lane: number}>} */ ([]));
  const [mode, setMode] = useState(/** @type {"idle"|"hammer"|"item"|"point"} */ ("idle"));
  const [wheel, setWheel] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const lastGesture = useRef(0);
  const mannerTimers = useRef(/** @type {any[]} */ ([]));
  const [item, setItem] = useState(/** @type {string|null} */ (null));
  const [pinUnit, setPinUnit] = useState(/** @type {any} */ (null));
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [paused, setPaused] = useState(false);
  const [totemGlow, setTotemGlow] = useState(/** @type {any} */ (null));
  const toastTimer = useRef(/** @type {any} */ (null));
  const posePin = useRef(/** @type {string|null} */ (null));


  const reset = () => {
    setSel(null);
    setSacs([]);
    setMode("idle");
    setItem(null);
    setPinUnit(null);
  };
  useEffect(() => { if (!myTurn) reset(); }, [myTurn]);

  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const act = async (a) => {
    const res = await send(a);
    if (!res?.ok) {
      sound.play("error");
      flash(errorText(res?.error));
      return false;
    }
    return true;
  };

  const selCard = sel ? me.hand.find((c) => c.uid === sel) : null;
  const selAfford = selCard ? affordable(r, me, selCard, bottom) : null;
  const needBlood = selAfford?.need ?? 0;
  const needsSac = !!selCard && selCard.cost.type === "blood" && needBlood > 0;
  const sacSum = sacs.reduce((s, ref) => {
    const u = me[ref.zone][ref.lane];
    return s + (u ? r.bloodValueOf(u) : 0);
  }, 0);
  const bloodReady = !needsSac || sacSum >= needBlood;
  const isMarked = (zone, lane) => sacs.some((s) => s.zone === zone && s.lane === lane);
  /** Wird dieses Feld durch ein gewähltes Opfer frei? (Ewiges Opfer bleibt liegen.) */
  const freed = (zone, lane) => isMarked(zone, lane) && !!me[zone][lane] && r.level(me[zone][lane], "ewigesopfer") === 0;

  const tryPlay = async (zone, lane, sacrifices) => {
    if (!selCard) return;
    const ok = await act({ type: "play", uid: selCard.uid, zone, lane, sacrifices });
    if (ok) reset();
  };

  const openDetail = (u) => setDetail({ card: u.card, unit: u, auras: aurasOf(b, u), attack: r.attackOf(u) });

  // ───── Klick auf ein Feld oder eine Karte auf dem Feld ─────
  const onSlot = async (p, zone, lane) => {
    if (!canAct || pending) return;
    const u = b.players[p][zone][lane];
    if (mode === "hammer") {
      if (p === bottom && u && await act({ type: "hammer", zone, lane })) reset();
      return;
    }
    if (mode === "item" && item) {
      const t = ITEM_BY_ID[item].target;
      if (t === "enemyUnit" && p === top && u) { if (await act({ type: "item", item, target: { zone, lane } })) reset(); return; }
      if (t === "enemyFront" && p === top && zone === "front" && u) { if (await act({ type: "item", item, target: { lane } })) reset(); return; }
      if (t === "ownSlot" && p === bottom && !u) { if (await act({ type: "item", item, target: { zone, lane } })) reset(); return; }
      if (t === "enemySigil" && p === top && u && u.sigils.length) { setPinUnit({ zone, lane, unit: u }); return; }
      return;
    }
    if (selCard) {
      if (p !== bottom) return;
      if (!needsSac) {
        if (!u) await tryPlay(zone, lane, []);
        return;
      }
      const marked = isMarked(zone, lane);
      if (!bloodReady) {
        // Opfer sammeln: antippen markiert, nochmal antippen hebt die Wahl auf
        if (!u) { flash(`Erst opfern: ${selCard.name} kostet ${needBlood} Blut.`); return; }
        if (marked) { setSacs((cur) => cur.filter((s) => !(s.zone === zone && s.lane === lane))); return; }
        if (r.laneProp(bottom, lane) === "heilig") { flash("Auf heiligem Grund wird nicht geopfert."); return; }
        setSacs((cur) => [...cur, { zone, lane }]);
        sound.play("seal");
        return;
      }
      // Genug Blut: ein freies Feld oder das Feld eines Opfers nimmt die Karte auf
      if (!u || freed(zone, lane)) { await tryPlay(zone, lane, sacs); return; }
      if (marked) setSacs((cur) => cur.filter((s) => !(s.zone === zone && s.lane === lane)));
      return;
    }
    // Nichts gewählt: Vorpreschen aus der Hinterreihe
    if (u && p === bottom && zone === "back" && !me.front[lane] && !u.rushed && r.level(u, "vorpreschen") > 0) {
      await act({ type: "rush", lane });
    }
  };

  // ───── Hand ─────
  const onHandCard = async (card) => {
    if (pending?.kind === "discard" && canAct) {
      await act({ type: "discard", uid: card.uid });
      return;
    }
    if (!canAct) return;
    if (needDraw) { flash(errorText("mustDrawFirst")); return; }
    if (sel === card.uid) { reset(); return; }
    reset();
    const aff = affordable(r, me, card, bottom);
    if (!aff.ok) {
      sound.play("error");
      const key = aff.tide ? "wrongTide" : { blood: "notEnoughBlood", bones: "notEnoughBones", wax: "notEnoughWax", salt: "notEnoughSalt" }[card.cost.type];
      flash(errorText(key));
      return;
    }
    setSel(card.uid);
    sound.play("draw");
  };

  const endTurn = async () => {
    if (!canAct || pending) return;
    if (needDraw) { flash(errorText("mustDrawFirst")); return; }
    reset();
    if (await act({ type: "endTurn" })) roomRef.current?.pressSeal();
  };

  // ───── Gesten (statt Chat) ─────
  /** Die Gestalt gegenüber führt eine Geste aus; bei „Animationen reduzieren“ steht sie stattdessen als Zeile da. */
  const showOppGesture = (kind, target) => {
    const g = GESTURES.find((x) => x.id === kind);
    if (!g) return;
    const row = target && [0, 1].includes(target.p) ? rowOf(target.p, target.zone === "back" ? "back" : "front", bottom) : null;
    roomRef.current?.gesture(kind, "opp", row ? { row, lane: target.lane } : null);
    if (kind === "klopfen" && prefs.reduceMotion) sound.play("knock");
    if (prefs.reduceMotion) flash(`${names[top]} ${g.does}.`);
  };
  /** Gegen die KI antwortet die Gestalt von selbst — kleine Tischmanieren, keine Spielwirkung. */
  const manners = (kind, delay) => {
    mannerTimers.current.push(setTimeout(() => showOppGesture(kind, null), delay));
  };
  useEffect(() => () => mannerTimers.current.forEach(clearTimeout), []);
  /** Eigene Geste: sofort zeigen, an das Gegenüber schicken. @param {string} kind @param {{ row: string, lane: number }} [at] */
  const doGesture = (kind, at) => {
    if (you === null) return;
    const now = Date.now();
    if (now - lastGesture.current < 1200) return;
    lastGesture.current = now;
    roomRef.current?.gesture(kind, "me", at || null);
    const target = at ? { ...parseRow(at.row, bottom), lane: at.lane } : undefined;
    onGesture?.(kind, target);
    if (aiManners) {
      const reply = { verbeugen: "verbeugen", nicken: "nicken", haende: "kopfschuetteln", kopfschuetteln: "haende", zeigen: "nicken" }[kind];
      if (reply) manners(reply, 900 + Math.random() * 500);
    }
  };
  const pickGesture = (kind) => {
    setWheel(null);
    if (kind === "zeigen") { reset(); setMode("point"); return; }
    doGesture(kind);
  };
  // Geste eines anderen (online): die Gestalt führt sie aus
  useEffect(() => {
    if (!gesture || gesture.seat === you) return;
    // Zuschauer sehen nur die Gesten dessen, der oben sitzt (unten sitzt keine Gestalt)
    if (gesture.seat !== top) return;
    showOppGesture(gesture.kind, gesture.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture?.n]);

  const playItem = async (id) => {
    if (!canAct || needDraw || pending) { if (canAct && needDraw) flash(errorText("mustDrawFirst")); return; }
    const t = ITEM_BY_ID[id].target;
    if (t === "none") { await act({ type: "item", item: id, target: {} }); reset(); return; }
    if (mode === "item" && item === id) { reset(); return; }
    reset();
    setMode("item");
    setItem(id);
  };

  const unitByUid = (uid) => {
    for (const P of b.players) for (const zone of ["front", "back"]) for (const u of P[zone]) if (u && u.uid === uid) return u;
    return null;
  };

  // Die Szene ruft immer die Handler des aktuellen Renders auf
  const handlers = useRef(/** @type {any} */ ({}));
  /** Klick, der auf das Ende eines laufenden Ablaufs wartet (siehe unten). */
  const queued = useRef(/** @type {any} */ (null));
  useEffect(() => {
    if (busy || !queued.current) return;
    const pick = queued.current;
    queued.current = null;
    handlers.current.intent(pick, "click");
  }, [busy]);
  handlers.current.intent = (pick, how, at) => {
    if (how === "context") {
      if (pick?.type === "hand") { const c = me.hand.find((x) => x.uid === pick.uid); if (c) setDetail({ card: c }); return; }
      if (pick?.type === "unit") { const u = unitByUid(pick.uid); if (u) openDetail(u); return; }
      // Auf dem Tisch: erst die laufende Auswahl zurücklegen; ist nichts gewählt, öffnet sich das Gestenrad
      if (sel || mode !== "idle" || pinUnit) reset();
      else if (you !== null) setWheel(at || { x: window.innerWidth / 2, y: window.innerHeight * 0.55 });
      return;
    }
    if (!pick) return;
    // Zeigen: die nächste angeklickte Karte (oder ihr Feld) ist das Ziel der Geste — keine Spielaktion
    if (mode === "point") {
      if (pick.type === "unit" || pick.type === "slot") { doGesture("zeigen", { row: pick.row, lane: pick.lane }); reset(); }
      return;
    }
    // Nie auf das Spiel warten: läuft im eigenen Zug noch ein Ablauf, spult er im Zeitraffer zu Ende, und der Klick
    // wird gleich danach ausgeführt
    if (busy && myTurn && ACTIONABLE.has(pick.type) && (rush || skipAll)) {
      queued.current = pick;
      (rush || skipAll)();
      return;
    }
    switch (pick.type) {
      case "hand": { const c = me.hand.find((x) => x.uid === pick.uid); if (c) onHandCard(c); break; }
      case "unit":
      case "slot": { const { p, zone } = parseRow(pick.row, bottom); onSlot(p, zone, pick.lane); break; }
      case "deck":
        if (needDraw) act({ type: "draw", pile: pick.pile });
        else if (canAct && !pending) flash("In diesem Zug hast du schon gezogen.");
        break;
      case "seal": endTurn(); break;
      case "hammer":
        if (!canAct || pending) break;
        if (needDraw) { flash(errorText("mustDrawFirst")); break; }
        if (liveMe?.hammerUsed) { flash("Der Hammer schlägt nur einmal pro Zug."); break; }
        if (mode === "hammer") reset();
        else { reset(); setMode("hammer"); }
        break;
      case "item": playItem(pick.id); break;
      case "note": if (how === "click") run?.onNote?.(pick.id); break;
      default: break;
    }
  };
  handlers.current.hover = (pick, at) => {
    if (pick?.type === "note" && run?.noteTip) {
      const content = run.noteTip(pick.id);
      showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
      return;
    }
    const totem = pick?.type === "totem" ? totemsOf(pick.owner === "me" ? bottom : top)[pick.index] || null : null;
    setTotemGlow(totem && pick.owner === "me" ? totem : null);
    const content = tipFor(pick, totem);
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };

  const scaleView = bottom === 0 ? b.scale : -b.scale;
  const zirkel = getZirkel(live.zirkel);
  const third = zirkel.bonusResource === "salt" ? "salt" : "wax";
  const tideOn = b.tide !== null && b.tide !== undefined;
  const turnTimer = live.phase !== "over" ? timers?.[live.active] : null;
  /** Restzeit in ms (Serverzeit, mit Uhrenabgleich). */
  const timeLeft = (tm) => (tm.paused ? tm.remaining : Math.max(0, tm.deadline - (Date.now() + (clockOffset || 0))));

  /** Tooltip-Inhalt für einen Gegenstand (Karten und Felder haben keinen: die Karte hebt sich selbst). */
  function tipFor(pick, totem) {
    if (!pick) return null;
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    switch (pick.type) {
      case "scale": return T(`Waage: ${scaleView > 0 ? "+" : ""}${scaleView}`, `Wer ${SCALE_WIN} im Vorteil ist, gewinnt den Kampf.`, scaleView > 0 ? "Du liegst vorn." : scaleView < 0 ? `${names[top]} liegt vorn.` : "Ausgeglichen.");
      case "bones": return T(`${de.costs.bones.name}: ${me.bones}`, de.costs.bones.desc);
      case "third": return T(`${de.costs[third].name}: ${third === "salt" ? me.salt || 0 : me.wax}`, de.costs[third].desc);
      case "deck": return pick.pile === "main"
        ? T(`${de.ui.drawMain}: ${me.deckSize ?? 0} Karten`, needDraw ? "Anklicken: eine Karte ziehen." : null)
        : T(de.sides[me.sideType]?.name || de.ui.drawSide, "Geht nie aus.", needDraw ? "Anklicken: eine Karte ziehen." : null);
      case "seal": return T(de.ui.endTurn, "Stempel anklicken oder Leertaste.", `${de.ui.hand}: ${me.hand.length}/${HAND_LIMIT}`);
      case "hammer": return T(de.ui.hammer, "Einmal pro Zug eine eigene Karte zerstören (gibt Knochen, kein Blut).");
      case "item": return T(de.items[pick.id].name, de.items[pick.id].desc);
      case "oppItem": return T(`${names[top]}: ${opp.itemCount ?? (opp.items || []).length} Items`);
      case "oppHand": return T(`${names[top]}: ${opp.handSize ?? opp.hand.length} Karten auf der Hand`);
      case "oppDeck": return T(`${names[top]}: ${opp.deckSize ?? 0} Karten im Hauptdeck`);
      case "oppSeal": return T(`Siegelstempel von ${names[top]}`, "Damit beendet dein Gegenüber seinen Zug.");
      case "candle": return b.turn >= CANDLE_WARNING_TURN
        ? T("Die Kerzen", STALEMATE_TURN - b.turn > 0 ? de.ui.candleWarn(STALEMATE_TURN - b.turn) : de.ui.candleBurning(candleWeight(b.turn)))
        : T(`Die Kerzen · ${de.ui.turn} ${b.turn}`, `Ab Zug ${STALEMATE_TURN} kostet jedes Zugende ein Gewicht.`);
      case "hourglass": {
        if (!turnTimer) return T("Stundenglas", "Dieses Spiel hat kein Zeitlimit.");
        const secs = Math.ceil(timeLeft(turnTimer) / 1000);
        return T(turnTimer.paused ? "Zugzeit angehalten" : `Zugzeit: noch ${secs} s`, live.active === you ? "Dein Zug." : `${names[live.active]} ist am Zug.`, turnTimer.paused ? "Die Verbindung ist unterbrochen." : null);
      }
      case "tide": {
        if (!tideOn) return null;
        const left = tideTurnsLeft(b.tide, b.turn, b.tideShift || 0);
        return T(de.tide.phases[b.tide], ...de.tide.phaseEffects[b.tide].map((i) => de.tide.effects[i]), de.tide.thenTitle(de.tide.phases[(b.tide + 1) % 4], left));
      }
      case "totem": return totem ? T(totemText(totem.head, totem.base, live.zirkel), `${pick.owner === "me" ? de.ui.you : names[top]} · ${headLabel(totem.head)}`, `${de.totems.base}: ${baseName(totem.base)}`, baseDesc(totem.base)) : null;
      default: return null;
    }
  }

  // ───── Bedienung an der Szene anmelden (sie selbst gehört der Hülle, TableHost) ─────
  useEffect(() => {
    room.setHandlers({
      onIntent: (pick, how, at) => handlers.current.intent(pick, how, at),
      onHover: (pick, at) => handlers.current.hover(pick, at),
    });
    return () => {
      room.setHandlers(null);
      showTip(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // ───── Anzeigemodell → Szene (bei jedem Render; die Szene baut nur um, was sich geändert hat) ─────
  const totemsOf = (p) => {
    const t = view.players[p]?.totems;
    return t ? [t.tribe, t.lane, t.side].filter(Boolean) : [];
  };
  const units = [];
  for (const p of [0, 1]) {
    for (const zone of ["front", "back"]) {
      b.players[p][zone].forEach((u, lane) => {
        if (!u) return;
        units.push({
          uid: u.uid, row: rowOf(p, zone, bottom), lane, card: u.card, attack: r.attackOf(u), health: u.health, maxHealth: u.maxHealth,
          auras: aurasOf(b, u), submerged: !!u.submerged,
          state: { wick: u.wick ?? null, stunned: !!u.stunned, glued: u.glued || 0, shield: r.level(u, "schildrinde") > 0 && !u.shieldUsed, meta: metamorphLeft(r, u) },
        });
      });
    }
  }
  const model = {
    stage: "battle",
    zirkel: live.zirkel || "moor",
    turn: b.turn,
    stalemateTurn: STALEMATE_TURN,
    scale: scaleView,
    third,
    tide: tideOn ? b.tide : null,
    flooded: tideOn && b.tide === TIDE_FLOOD,
    myTurn: you === null || (b.active === you && b.phase !== "over"),
    oppTurn: b.active === top && b.phase !== "over",
    seat: bottom,
    units,
    hand: you !== null ? me.hand.filter((c) => !c.hidden) : [],
    oppHand: opp.hand.map((c) => (c.hidden ? null : c)),
    me: {
      bones: me.bones, third: third === "salt" ? me.salt || 0 : me.wax, deck: me.deckSize ?? 0, items: you !== null ? me.items || [] : [],
      totems: totemsOf(bottom).map((t) => ({ kind: t.head.kind, label: headName(t.head, live.zirkel) })),
    },
    opp: { items: opp.itemCount ?? (opp.items || []).length, deck: opp.deckSize ?? 0, totems: totemsOf(top).map((t) => ({ kind: t.head.kind, label: headName(t.head, live.zirkel) })) },
    itemNames: Object.fromEntries(Object.keys(ITEM_BY_ID).map((id) => [id, de.items[id]?.name || id])),
    // Moorwanderung: Hausregel des NPCs und die Lebenssiegel als Zettel links neben dem Brett
    notes: run?.notes || [],
  };

  // Was ist gerade anklickbar?
  const targets = [];
  const glow = [];
  if (canAct && !pending) {
    for (const zone of ["front", "back"]) {
      for (let lane = 0; lane < 4; lane++) {
        const own = me[zone][lane];
        const foe = opp[zone][lane];
        let ownOk = false;
        let foeOk = false;
        if (selCard) {
          if (!needsSac) ownOk = !own;
          else if (!bloodReady) ownOk = !!own && !isMarked(zone, lane) && r.laneProp(bottom, lane) !== "heilig";
          else ownOk = !own || freed(zone, lane);
        } else if (mode === "hammer") ownOk = !!own;
        else if (mode === "item" && item) {
          const t = ITEM_BY_ID[item].target;
          ownOk = t === "ownSlot" && !own;
          foeOk = (t === "enemyUnit" && !!foe) || (t === "enemyFront" && zone === "front" && !!foe) || (t === "enemySigil" && !!foe && foe.sigils.length > 0);
        }
        if (ownOk) targets.push(rowOf(bottom, zone, bottom) + ":" + lane);
        if (foeOk) targets.push(rowOf(top, zone, bottom) + ":" + lane);
      }
    }
  }
  // Totem unter dem Zeiger: welche eigenen Felder/Karten trifft es?
  if (totemGlow) {
    for (const zone of ["front", "back"]) {
      for (let lane = 0; lane < 4; lane++) {
        const u = me[zone][lane];
        const hit = totemGlow.head.kind === "lane" ? totemGlow.head.lane === lane
          : totemGlow.head.kind === "tribe" ? !!u && u.card.tribe === totemGlow.head.tribe
            : !!u && String(u.card.baseId).startsWith("side_");
        if (hit) glow.push(rowOf(bottom, zone, bottom) + ":" + lane);
      }
    }
  }
  const ui = {
    selected: sel,
    marked: sacs.map((s) => me[s.zone][s.lane]?.uid).filter(Boolean),
    targets,
    glow,
    drawable: needDraw,
    canEnd: canAct && !needDraw && !pending && !sel && mode === "idle",
    hammer: mode === "hammer" ? "active" : liveMe?.hammerUsed ? "off" : "ready",
  };
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    room.sync(model);
    room.setUi(ui);
    // Zugzeit ins Stundenglas (der Schlüssel wechselt mit jedem Zug: dann dreht es sich um)
    room.setTimer(turnTimer ? { remaining: timeLeft(turnTimer), total: turnTimer.total, paused: !!turnTimer.paused, key: `${live.battleNo}:${live.turn}:${live.active}` } : null);
  });

  // Ereignisse: kleine Gesten in der Szene, dazu die wenigen Hinweise, die man sonst nicht sähe
  useEffect(() => {
    const ev = anim?.ev;
    if (!ev) return;
    roomRef.current?.play(ev, anim.dur);
    // Nur Entwicklung: Zeitpunkte der Ereignisse zum Nachmessen des Takts
    if (import.meta.env.DEV) (window.__ssEvents ||= []).push({ t: performance.now(), type: ev.type, uid: ev.uid });
    if (ev.type === "firstTurnNoAttack") flash(de.ui.firstTurnNoAttack);
    else if (ev.type === "candleWarning" || ev.type === "candle") {
      const left = STALEMATE_TURN - b.turn;
      flash(left > 0 ? de.ui.candleWarn(left) : de.ui.candleBurning(candleWeight(b.turn)));
    } else if (ev.type === "deckEmpty" && ev.player === you) flash("Dein Hauptdeck ist leer.");
    // Tischmanieren der KI: Verbeugung zu Beginn, am Ende je nach Ausgang
    if (aiManners && ev.type === "battleStart") manners("verbeugen", 700);
    if (aiManners && ev.type === "battleEnd") manners(ev.winner === top ? "nicken" : "verbeugen", 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.key]);

  // Blick: eigener Zug = Brett, Zug des Gegenübers = Blick hoch zu ihm; Zuschauer sitzen seitlich am Tisch
  const oppTurn = you !== null && b.active !== you && b.phase !== "over";
  useEffect(() => {
    posePin.current = null;
    roomRef.current?.setPose(you === null ? "seite" : oppTurn ? "gegenueber" : "brett");
  }, [oppTurn, you]);

  // Tastatur
  const keyRef = useRef(/** @type {any} */ (null));
  keyRef.current = (e) => {
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (detail || pending?.kind === "seer") return;      // eigene Dialoge schließen sich selbst
      if (wheel) setWheel(null);
      else if (pinUnit || sel || mode !== "idle") reset();
      else { setPaused((v) => !v); }
      return;
    }
    if (paused || detail) return;
    if ((e.key === "g" || e.key === "G") && you !== null) {
      setWheel((w) => (w ? null : { x: window.innerWidth / 2, y: window.innerHeight * 0.55 }));
      return;
    }
    if (wheel) return;
    if (e.key === " " || e.code === "Space") { e.preventDefault(); endTurn(); return; }
    if (import.meta.env.DEV && ["1", "2", "3"].includes(e.key)) {
      // Nur Entwicklung: Blick von Hand umschalten (bis zum nächsten Zugwechsel)
      const name = ["brett", "gegenueber", "aufsicht"][Number(e.key) - 1];
      posePin.current = name;
      roomRef.current?.setPose(name);
    }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const notice = pending?.kind === "discard" && canAct ? "Handlimit erreicht: Tippe eine Handkarte an, um sie abzuwerfen."
    : mode === "item" && item && !pinUnit ? `${de.items[item].name}: Ziel antippen.`
      : mode === "point" ? "Zeigen: Karte oder Feld antippen."
        : null;

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => { setPaused(true); }} aria-label="Menü (Esc)">Menü</button>

      {(toast || notice || status) && <div className="st-toast ss-paper" role="status">{toast || notice || status}</div>}
      {wheel && !paused && <GestureWheel at={wheel} onPick={pickGesture} onClose={() => setWheel(null)} />}

      {pinUnit && (
        <div className="st-choice ss-paper" role="dialog" aria-label="Sigil wählen">
          <p className="ss-title !text-[var(--ink)]">Welches Sigil soll entfernt werden?</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {pinUnit.unit.sigils.map((s) => (
              <button key={s} type="button" className="ss-btn ss-btn-sm" onClick={async () => { if (await act({ type: "item", item, target: { zone: pinUnit.zone, lane: pinUnit.lane, sigil: s } })) reset(); }}>
                <SigilIcon sigil={s} size={20} /> {de.sigils[parseSigil(s).id]?.name}
              </button>
            ))}
            <button type="button" className="ss-btn ss-btn-sm" onClick={reset}>{de.ui.cancel}</button>
          </div>
        </div>
      )}

      {pending?.kind === "seer" && canAct && pending.cards && (
        <SeerDialog cards={pending.cards} onConfirm={(order) => act({ type: "seer", order })} />
      )}
      {detail && <CardDetail card={detail.card} unit={detail.unit} auras={detail.auras} attack={detail.attack} onClose={() => setDetail(null)} />}

      {anim?.ev?.type === "battleEnd" && (
        <div className="st-banner">
          <p className="ss-title">{you === null ? `${names[anim.ev.winner]} gewinnt` : anim.ev.winner === you ? de.ui.victory : de.ui.defeat}</p>
          <p className="st-banner-sub">{run?.title || `Kampf ${b.battleNo}`}</p>
        </div>
      )}

      {paused && (
        <TablePause
          title={run?.title || `Kampf ${b.battleNo}`}
          sub={run?.sub || <>{names[0]} {view.wins[0]} : {view.wins[1]} {names[1]} · {view.settings.winsNeeded} {view.settings.winsNeeded === 1 ? de.ui.win : de.ui.wins} nötig · {de.ui.turn} {b.turn}</>}
          surrenderText={run?.surrenderText}
          extra={<>{busy && skipAll ? <button type="button" className="ss-btn" onClick={() => { skipAll(); setPaused(false); }}>Laufende Abläufe überspringen</button> : null}{pauseExtra}</>}
          onClose={() => setPaused(false)}
          onSurrender={you !== null && live.phase !== "over" ? () => send({ type: "surrender" }) : null}
          onFallback={onFallback}
          help={<>
            Stapel anklicken: ziehen · Karte anklicken: nehmen, dann Feld wählen · eigene Karten anklicken: opfern ·
            Siegelstempel oder Leertaste: Zug beenden · Rechtsklick (oder lange drücken): Karte ansehen bzw. Auswahl zurücklegen ·
            Rechtsklick auf den Tisch oder Taste G: Geste
          </>}
        />
      )}
    </>
  );
}
