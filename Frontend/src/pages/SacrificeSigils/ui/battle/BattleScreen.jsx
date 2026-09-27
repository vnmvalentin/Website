// ui/battle/BattleScreen.jsx — der Kampf-Tisch.
//   Oben: gegnerische Hinterreihe, gegnerische Frontreihe · Mitte: Trennlinie · Unten: eigene Front, eigene Hinterreihe, Hand.
//   Links die Waage und Items, rechts Ressourcen (Blutschale, Knochenhaufen, Kerze), Hauptdeck und Nebendeck, Totems.
// Bedienung: Tap statt Drag (Karte antippen, dann Slot), zum Opfern Karten nacheinander antippen und bestätigen.
// Auf dem Desktop zusätzlich Drag & Drop aus der Hand auf einen Slot.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../card/Card.jsx";
import CardDetail, { SigilTexts } from "../card/CardDetail.jsx";
import Scale from "./Scale.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { BloodDrop, Bone, CandleStub, Hammer, Shard, Claw, Hourglass, ShieldBark, RushArrow, InkChevron, WaxHeart } from "../icons/GameIcons.jsx";
import { Resolver, LANES, WAX_MAX, STALEMATE_TURN, CANDLE_WARNING_TURN, candleWeight, HAND_LIMIT, NO_ATTACK_TURNS, SCALE_WIN } from "../../engine/battle.js";
import { deepClone } from "../../engine/match.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { ITEM_BY_ID } from "../../data/items.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell, useTipHandlers } from "../shellContext.js";
import "./battle.css";

const ROWS_FOR = (bottom) => [
  { p: 1 - bottom, zone: "back", label: "Hinterreihe" },
  { p: 1 - bottom, zone: "front", label: "Front" },
  { p: bottom, zone: "front", label: "Front" },
  { p: bottom, zone: "back", label: "Hinterreihe" },
];

/** Aura-Sigils (Totems), die für eine Einheit gelten. */
function aurasOf(b, u) {
  const a = b.players[u.owner].auras || {};
  const out = [];
  if (a.tribeSigil && a.tribe === u.card.tribe) out.push(a.tribeSigil);
  if (a.laneSigil && a.lane === u.lane) out.push(a.laneSigil);
  return out;
}

/** Karte in der Hand spielbar? @returns {{ ok: boolean, need: number }} */
function affordable(r, P, card, p) {
  const c = card.cost;
  if (c.type === "bones") return { ok: P.bones >= c.amount, need: 0 };
  if (c.type === "wax") return { ok: P.wax >= c.amount, need: 0 };
  const need = Math.max(0, c.amount - (P.bloodBonus || 0));
  if (need === 0) return { ok: true, need };
  let sum = 0;
  for (const u of r.units(p)) if (r.laneProp(p, u.lane) !== "heilig") sum += r.bloodValueOf(u);
  return { ok: sum >= need, need };
}

function SeerDialog({ cards, onConfirm }) {
  const [order, setOrder] = useState(cards.map((_, i) => i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Seher">
      <div className="ss-paper ss-modal-box p-5 max-w-[640px] w-full">
        <p className="ss-title !text-[var(--ink)] text-xl">Seher: Ordne die obersten Karten</p>
        <p className="text-sm opacity-70 mb-3">Links liegt oben – diese Karte ziehst du als nächstes.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          {order.map((ci, i) => (
            <div key={ci} className="flex flex-col items-center gap-2">
              <Card card={cards[ci]} width={120} />
              <div className="flex gap-1">
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach vorn"><InkChevron dir={-1} size={16} /></button>
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Nach hinten"><InkChevron dir={1} size={16} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-4"><button type="button" className="ss-seal" onClick={() => onConfirm(order)}>{de.ui.confirm}</button></div>
      </div>
    </div>
  );
}

/**
 * Zieh-Stapel (Runde 2, D1): Höhe zeigt die Menge, Zahl daneben, Klick zieht, pulsiert wenn gezogen werden muss.
 * @param {{ label: string, count: number|null, side?: boolean, drawable: boolean, anchor?: string, onDraw: () => void, width: number }} props
 */
function DeckStack({ label, count, side = false, drawable, anchor, onDraw, width }) {
  const layers = count === null ? 5 : Math.min(8, Math.ceil(count / 2));
  return (
    <div className="ss-stack-wrap">
      <button type="button" className={`ss-deck-stack ${drawable ? "ss-drawable" : ""} ${side ? "ss-side-stack" : ""}`} data-anchor={anchor} disabled={!drawable} onClick={onDraw}
        aria-label={`${label}${count === null ? " (unendlich)" : `: ${count} Karten`}${drawable ? " – ziehen" : ""}`}>
        {Array.from({ length: Math.max(1, layers) }, (_, i) => (
          <Card key={i} faceDown width={width} className="ss-stack-card" style={{ transform: `translate(${i * 1.2}px, ${-i * 2.4}px)`, opacity: count === 0 ? 0.3 : 1 }} />
        ))}
      </button>
      <span className="ss-stack-label"><span className="ss-stack-count ss-num">{count === null ? "∞" : count}</span><span className="ss-stack-name">{label}</span></span>
    </div>
  );
}

/** Item-Knopf mit Tooltip. */
function ItemButton({ id, active, disabled, onClick }) {
  const tip = useTipHandlers(() => <><b>{de.items[id].name}</b><br />{de.items[id].desc}</>);
  return (
    <button type="button" className={`ss-item-btn ${active ? "ss-active" : ""}`} disabled={disabled} onClick={onClick} {...tip}>
      <Shard size={14} /> {de.items[id].name}
    </button>
  );
}

function TotemFigure({ totem, kind, owner, onHover }) {
  const tip = useTipHandlers(() => {
    const base = totem.base.kind === "sigil" ? de.sigils[totem.base.sigil].name : de.totems.props[totem.base.prop].name;
    const text = totem.base.kind === "sigil" ? de.sigils[totem.base.sigil].desc : de.totems.props[totem.base.prop].desc;
    const head = totem.head.kind === "tribe" ? `${de.totems.tribeHead}: ${de.tribes[totem.head.tribe].name}` : `${de.totems.laneHead}: ${de.totems.lane(totem.head.lane)}`;
    return <><b>{head}</b><br />{de.totems.base}: {base}<br /><span className="opacity-80">{text}</span></>;
  });
  return (
    <div className="ss-totem" {...tip} onMouseEnter={(e) => { tip.onMouseEnter(e); onHover(totem); }} onMouseLeave={() => { tip.onMouseLeave(); onHover(null); }} tabIndex={0}>
      <div className="ss-totem-figure" aria-hidden />
      <div className="text-xs leading-tight">
        <div className="ss-title text-[13px]">{owner ? <span className="ss-faint">{owner}: </span> : null}{totem.head.kind === "tribe" ? de.tribes[totem.head.tribe].name : de.totems.lane(totem.head.lane)}</div>
        <div className="flex items-center gap-1">
          {totem.base.kind === "sigil" ? <SigilIcon sigil={totem.base.sigil} size={18} /> : null}
          <span className="ss-dim">{totem.base.kind === "sigil" ? de.sigils[totem.base.sigil].name : de.totems.props[totem.base.prop].name}</span>
        </div>
      </div>
      <span className="sr-only">{kind}</span>
    </div>
  );
}

/**
 * @param {{ view: any, display: any, anim: any, you: 0|1|null, send: (a: any) => Promise<any>, timers: any, clockOffset: number,
 *   busy: boolean, names: string[], hintExtra?: any, onAction?: (a: any) => void }} props
 */
export default function BattleScreen({ view, display, anim, hold, you, send, timers, clockOffset, busy, names, hintExtra, onAction }) {
  const { shake } = useShell();
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
  const needDraw = canAct && liveMe && !liveMe.drew && !pending;

  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  const [sacs, setSacs] = useState(/** @type {Array<{zone: string, lane: number}>} */ ([]));
  const [target, setTarget] = useState(/** @type {{zone: string, lane: number}|null} */ (null));
  const [mode, setMode] = useState(/** @type {"idle"|"hammer"|"item"} */ ("idle"));
  const [item, setItem] = useState(/** @type {string|null} */ (null));
  const [pinUnit, setPinUnit] = useState(/** @type {any} */ (null));
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [dragOver, setDragOver] = useState(/** @type {string|null} */ (null));
  const [hoverSlot, setHoverSlot] = useState(/** @type {string|null} */ (null));
  const [totemHover, setTotemHover] = useState(/** @type {any} */ (null));
  const toastTimer = useRef(/** @type {any} */ (null));
  const [hover, setHover] = useState(/** @type {any} */ (null));
  const hoverTimer = useRef(/** @type {any} */ (null));
  const { w: vw, h: vh } = useViewport();
  const mobile = vw < 1080;
  // Layout (Runde 2, D2): Desktop quer · Tablet/kleiner Laptop · Handy hochkant · Handy quer (kompakt)
  const layout = vw < 700 && vh >= vw ? "portrait" : vh < 560 && vw > vh ? "landscape-s" : vw < 1180 || vh < 720 ? "tablet" : "desktop";
  // Der Kampf füllt genau den Rest des Fensters (dvh), nichts scrollt; die Kartengröße folgt dem Platz des Tischs
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const boardRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [topOff, setTopOff] = useState(100);
  const [boardBox, setBoardBox] = useState({ w: 520, h: 520 });
  const handBoxRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [handBoxW, setHandBoxW] = useState(600);
  useEffect(() => {
    const measure = () => {
      if (rootRef.current) setTopOff(Math.round(rootRef.current.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    const el = boardRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(([e]) => {
      setBoardBox({ w: e.contentRect.width, h: e.contentRect.height });
      measure();
    }) : null;
    if (ro && el) ro.observe(el);
    const hel = handBoxRef.current;
    const hro = typeof ResizeObserver !== "undefined" && hel ? new ResizeObserver(([e]) => setHandBoxW(e.contentRect.width)) : null;
    if (hro && hel) hro.observe(hel);
    return () => {
      hro?.disconnect();
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);
  // 4 Lanes nebeneinander (+ Reihenbeschriftung), 4 Reihen à 1,2 Slot-Höhen + Mittellinie untereinander
  const labelSpace = layout === "desktop" || layout === "tablet" ? 34 : 6;
  const slotPx = Math.floor(Math.max(40, Math.min(190, (boardBox.w - labelSpace) / 4, (boardBox.h - 22) / (4 * 1.2))));
  const handW = Math.round(Math.max(56, Math.min(layout === "portrait" ? vw / 4.6 : 150, slotPx * (layout === "portrait" ? 0.95 : 0.84))));
  const floats = useFloats(anim, b);

  const reset = () => {
    setSel(null);
    setSacs([]);
    setTarget(null);
    setMode("idle");
    setItem(null);
    setPinUnit(null);
  };
  useEffect(() => { if (!myTurn) reset(); }, [myTurn]);

  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const act = async (a) => {
    onAction?.(a);
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
  const sacSum = sacs.reduce((s, ref) => {
    const u = me[ref.zone][ref.lane];
    return s + (u ? r.bloodValueOf(u) : 0);
  }, 0);
  const needBlood = selAfford?.need ?? 0;
  const bloodReady = selCard && selCard.cost.type === "blood" && needBlood > 0 ? sacSum >= needBlood : true;

  const freedSlot = (zone, lane) => sacs.some((s) => s.zone === zone && s.lane === lane) && me[zone][lane] && r.level(me[zone][lane], "ewigesopfer") === 0;

  const tryPlay = async (tgt, sacrifices = sacs) => {
    if (!selCard) return;
    const ok = await act({ type: "play", uid: selCard.uid, zone: tgt.zone, lane: tgt.lane, sacrifices });
    if (ok) {
      shake();
      reset();
    }
  };

  // ───── Klicks auf Slots ─────
  const onSlot = async (p, zone, lane) => {
    if (!canAct || pending) return;
    const u = b.players[p][zone][lane];
    if (mode === "hammer") {
      if (p === bottom && u) {
        const ok = await act({ type: "hammer", zone, lane });
        if (ok) reset();
      }
      return;
    }
    if (mode === "item" && item) {
      const t = ITEM_BY_ID[item].target;
      if ((t === "enemyUnit") && p === top && u) { if (await act({ type: "item", item, target: { zone, lane } })) reset(); return; }
      if ((t === "enemyFront") && p === top && zone === "front" && u) { if (await act({ type: "item", item, target: { lane } })) reset(); return; }
      if (t === "ownSlot" && p === bottom && !u) { if (await act({ type: "item", item, target: { zone, lane } })) reset(); return; }
      if (t === "enemySigil" && p === top && u) { setPinUnit({ zone, lane, unit: u }); return; }
      return;
    }
    if (selCard) {
      if (p !== bottom) return;
      const needsSac = selCard.cost.type === "blood" && needBlood > 0;
      if (u && needsSac && !freedSlot(zone, lane) && r.laneProp(bottom, lane) !== "heilig") {
        // Opfer an-/abwählen; ist genug Blut da, macht ein Klick auf ein Opfer dessen Slot zum Ziel
        setSacs((cur) => (cur.some((s) => s.zone === zone && s.lane === lane) ? cur.filter((s) => !(s.zone === zone && s.lane === lane)) : [...cur, { zone, lane }]));
        sound.play("seal");
        return;
      }
      if (u && needsSac && freedSlot(zone, lane) && bloodReady) {
        setTarget({ zone, lane });
        return;
      }
      if (!u || freedSlot(zone, lane)) {
        if (!needsSac) { await tryPlay({ zone, lane }, []); return; }
        setTarget({ zone, lane });
        return;
      }
      return;
    }
    if (u) openDetail(u);
  };

  const openDetail = (u) => setDetail({ card: u.card, unit: u, auras: aurasOf(b, u), attack: r.attackOf(u) });

  // ───── Hand ─────
  const onHandCard = async (card) => {
    if (pending?.kind === "discard" && canAct) {
      await act({ type: "discard", uid: card.uid });
      return;
    }
    if (!canAct) {
      // Während eigener Animationen überspringt der Klick nur (GameScreen); Details gibt es per Rechtsklick/Long-Press
      if (!myTurn) setDetail({ card });
      return;
    }
    if (needDraw) {
      flash(errorText("mustDrawFirst"));
      return;
    }
    if (sel === card.uid) { reset(); return; }
    reset();
    const aff = affordable(r, me, card, bottom);
    if (!aff.ok) {
      sound.play("error");
      flash(card.cost.type === "blood" ? errorText("notEnoughBlood") : card.cost.type === "bones" ? errorText("notEnoughBones") : errorText("notEnoughWax"));
      return;
    }
    setSel(card.uid);
    sound.play("draw");
  };

  // ───── Drag & Drop (Desktop) ─────
  const onDragStartCard = (e, card) => {
    if (!canAct || needDraw) { e.preventDefault(); return; }
    const aff = affordable(r, me, card, bottom);
    if (!aff.ok) { e.preventDefault(); flash(errorText("notEnoughBlood")); return; }
    e.dataTransfer.setData("text/plain", card.uid);
    e.dataTransfer.effectAllowed = "move";
    setSel(card.uid);
    setSacs([]);
    setTarget(null);
  };
  const onDrop = async (e, zone, lane) => {
    e.preventDefault();
    setDragOver(null);
    const uid = e.dataTransfer.getData("text/plain");
    const card = me.hand.find((c) => c.uid === uid);
    if (!card) return;
    const aff = affordable(r, me, card, bottom);
    if (card.cost.type === "blood" && aff.need > 0) {
      setSel(uid);
      setTarget({ zone, lane });
      flash("Wähle deine Opfer und bestätige.");
      return;
    }
    if (me[zone][lane]) return;
    const ok = await act({ type: "play", uid, zone, lane, sacrifices: [] });
    if (ok) { shake(); reset(); }
  };

  // ───── Vorschau: „Was passiert, wenn ich hier spiele?“ ─────
  const preview = useMemo(() => {
    if (!selCard || !hoverSlot) return null;
    const [zone, laneStr] = hoverSlot.split(":");
    const lane = Number(laneStr);
    if (zone !== "front") return null;
    try {
      const c = deepClone(b);
      const rr = new Resolver(c);
      for (const s of sacs) if (c.players[bottom][s.zone][s.lane] && rr.level(c.players[bottom][s.zone][s.lane], "ewigesopfer") === 0) c.players[bottom][s.zone][s.lane] = null;
      if (c.players[bottom][zone][lane]) return null;
      const u = rr.makeUnit({ ...selCard }, bottom, "front", lane);
      c.players[bottom].front[lane] = u;
      const atk = rr.attackOf(u);
      const opposing = c.players[top].front[lane];
      const flying = rr.level(u, "schwinge") > 0;
      const direct = !opposing || (flying && rr.level(opposing, "hochwuchs") === 0);
      const spill = direct || !opposing ? 0 : Math.max(0, atk - Math.max(0, opposing.health));
      return { lane, atk, direct, spill };
    } catch {
      return null;
    }
  }, [selCard, hoverSlot, b, sacs, bottom, top]);

  // ───── Hinweiszeile ─────
  let hint = null;
  if (live.phase === "over") hint = null;
  else if (you === null) hint = `${names[live.active]} ist am Zug.`;
  else if (!myTurn) hint = pending ? null : `${de.ui.opponentThinking}`;
  else if (pending?.kind === "discard") hint = "Handlimit: Wirf eine Karte ab (antippen).";
  else if (liveMe && !liveMe.drew) hint = "Ziehe eine Karte: Hauptdeck oder Nebendeck.";
  else if (mode === "hammer") hint = "Hammer: Tippe eine eigene Karte an, um sie zu zerstören (gibt Knochen, kein Blut).";
  else if (mode === "item" && item) hint = pinUnit ? "Wähle das Sigil, das entfernt werden soll." : `${de.items[item].name}: Ziel wählen.`;
  else if (selCard && selCard.cost.type === "blood" && needBlood > 0) hint = `Opfer wählen: ${sacSum}/${needBlood} Blut${target ? " – dann bestätigen" : bloodReady ? " – jetzt Zielslot antippen" : ""}.`;
  else if (selCard) hint = "Zielslot antippen (Front oder Hinterreihe).";
  else hint = "Karte antippen oder ziehen, dann einen freien Slot wählen. Zug beenden, wenn du fertig bist.";
  if (hint && live.phase !== "over" && b.turn <= NO_ATTACK_TURNS) hint = `${de.ui.firstTurnNoAttack}. ${hint}`;

  const scaleView = bottom === 0 ? b.scale : -b.scale;
  const turnTimer = timers?.[live.active];
  const candleTurns = STALEMATE_TURN - b.turn;

  // Einheiten-Animationsklasse
  const animClassFor = (u) => {
    if (!anim) return "";
    const ev = anim.ev;
    // Zwischen Stoß und Rückweg bleibt der Angreifer vorn (Einschlag, Überlauf, Tod des Ziels …)
    if (hold && hold.uid === u.uid && !hold.returning && ev.type !== "attack") return "ss-a-hold";
    switch (ev.type) {
      case "play": case "spawn": case "revive": return ev.uid === u.uid ? "ss-a-land" : "";
      case "attack":
        if (ev.uid !== u.uid) return "";
        return ev.flying && ev.direct ? "ss-a-fly-strike" : "ss-a-strike";
      case "attackReturn": return ev.uid === u.uid ? "ss-a-return" : "";
      case "damage": return ev.uid === u.uid ? "ss-a-hit" : "";
      case "death": case "shed": return ev.uid === u.uid ? "ss-a-tear" : "";
      case "sacrifice": return ev.uid === u.uid ? "ss-a-ash" : "";
      case "transform": return ev.uid === u.uid ? "ss-a-char" : "";
      case "wick": return ev.uid === u.uid ? "ss-a-wick" : "";
      case "moveBlocked": return ev.uid === u.uid ? "ss-a-bump" : "";
      case "buff": return ev.uid === u.uid ? "ss-a-buff" : "";
      case "debuff": return ev.uid === u.uid ? "ss-a-debuff" : "";
      case "heal": return ev.uid === u.uid ? "ss-a-heal" : "";
      case "submerge": return ev.uid === u.uid ? "ss-a-sink" : "";
      case "surface": return ev.uid === u.uid ? "ss-a-rise" : "";
      case "shield": return ev.uid === u.uid ? "ss-a-shield" : "";
      case "stunned": return ev.uid === u.uid ? "ss-a-stun" : "";
      default: return "";
    }
  };

  // Stoß-Richtung und -Weite (CSS-Variablen für ss-a-strike/-hold/-return), Dauer folgt dem Tempo
  const strikeStyle = (u, own) => {
    const ev = hold?.uid === u.uid ? hold : anim?.ev?.uid === u.uid ? anim.ev : null;
    const style = anim?.ev?.uid === u.uid ? { animationDuration: `${Math.round(anim.dur)}ms`, "--anim-dur": `${Math.round(anim.dur)}ms`, "--dir": anim.ev.dir || 1 } : {};
    if (!ev || (ev.type !== "attack" && !hold)) return style;
    const reach = ev.flying && ev.direct ? 1.25 : ev.direct ? 0.95 : 0.55;
    const dir = own ? -1 : 1;
    return {
      ...style,
      "--tx": `calc(var(--slot-w) * ${((ev.lane ?? u.lane) - u.lane) * 0.85})`,
      "--ty": `calc((var(--slot-h) + 18px) * ${dir * reach})`,
      "--tilt": `${own ? -2 : 2}deg`,
    };
  };

  // Beim Ausspielen einer Blutkarte: welche eigenen Karten dürfen geopfert werden (und sind noch nicht gewählt)?
  const sacrificable = (u) => !!(canAct && selCard && selCard.cost.type === "blood" && needBlood > 0 && u.owner === bottom &&
    !sacs.some((x) => x.zone === u.zone && x.lane === u.lane) && r.laneProp(bottom, u.lane) !== "heilig");

  const rows = ROWS_FOR(bottom);
  const rowTop = (i) => `calc(var(--slot-h) * ${i} + ${i >= 2 ? 18 : 0}px)`;
  const totemLane = totemHover?.head?.kind === "lane" ? totemHover.head.lane : null;
  const totemTribe = totemHover?.head?.kind === "tribe" ? totemHover.head.tribe : null;

  // Einheiten flach sammeln (für die Ebene mit transform-Übergängen)
  const units = [];
  rows.forEach((row, ri) => {
    b.players[row.p][row.zone].forEach((u, lane) => { if (u) units.push({ u, ri, lane }); });
  });

  const hand = me.hand;
  const stackW = layout === "desktop" ? 84 : layout === "tablet" ? Math.round(Math.max(48, Math.min(68, vw * 0.07 - 4))) : layout === "portrait" ? 42 : 50;
  // Fächerbreite: die Hand muss in ihren Bereich passen (hochkant teilt sie sich die Zeile mit den Stapeln)
  // Randkarten sind gedreht und ragen etwas hinaus: dafür eine halbe Kartenbreite Luft lassen
  const handAreaW = Math.max(120, handBoxW - 12 - handW * 0.6);
  const spread = Math.max(8, Math.min(handW * 0.72, (handAreaW - handW) / Math.max(1, hand.length - 1)));

  const itemsList = me.items || [];

  return (
    <div
      ref={rootRef}
      className={`ss-battle ss-lay-${layout} ss-shake-target ${myTurn ? "ss-my-turn" : ""}`}
      style={{ "--slot-w": `${slotPx}px`, "--slot-h": `${slotPx * 1.2}px`, "--hand-w": `${handW}px`, height: `calc(100dvh - ${topOff}px)` }}
    >
      <div className="ss-col ss-col-left">
      {/* ── Status: Waage mit Zahl, wer ist am Zug, Timer ── */}
      <div className="ss-b-status ss-panel">
        <Scale value={scaleView} compact={layout !== "desktop"} labels={[you === null ? names[0] : de.ui.you, you === null ? names[1] : names[top] || de.ui.opponent]} />
        <div className="ss-b-statusinfo">
          <p className={`ss-scale-num ${scaleView > 0 ? "ss-pos" : scaleView < 0 ? "ss-neg" : ""}`} title="Waage aus deiner Sicht: 5 im Vorteil gewinnt">
            {scaleView > 0 ? `+${scaleView}` : scaleView}
            <span className="ss-scale-num-of">/ {SCALE_WIN}</span>
          </p>
          <p className={`ss-turn-who ${myTurn ? "ss-mine" : ""}`} role="status">
            {live.phase === "over" ? "Kampf vorbei" : you === null ? `${names[live.active]} ist am Zug` : myTurn ? "Dein Zug" : `${names[top]} ist am Zug`}
          </p>
          <div className="flex items-center gap-2">
            <TurnTimer timer={turnTimer} clockOffset={clockOffset} />
            <span className="text-xs ss-faint">{de.ui.turn} {b.turn}</span>
          </div>
        </div>
      </div>

      </div>

      <div className="ss-col ss-col-center">
      {/* ── Gegner: Name, verdeckte Hand ── */}
      <div className="ss-b-opp">
        <span className="ss-title text-base md:text-lg truncate">{names[top]}</span>
        <div className="ss-opp-hand" aria-label={`${opp.handSize ?? opp.hand.length} Karten auf der Hand`}>
          {Array.from({ length: Math.min(8, opp.hand.length) }, (_, i) => (
            opp.hand[i] && !opp.hand[i].hidden
              ? <Card key={opp.hand[i].uid} card={opp.hand[i]} width={30} />
              : <Card key={i} faceDown width={30} style={{ transform: `rotate(${(i - opp.hand.length / 2) * 4}deg)` }} />
          ))}
        </div>
        <span className="text-xs ss-faint whitespace-nowrap">{opp.handSize ?? opp.hand.length} Karten · {opp.itemCount ?? (opp.items || []).length} Items</span>
      </div>

      {/* ── Tisch ── */}
      <div className="ss-b-board" ref={boardRef}>
        {b.turn >= CANDLE_WARNING_TURN && b.phase !== "over" && (
          <p className="ss-hint ss-candle-hint">{candleTurns > 0 ? de.ui.candleWarn(candleTurns) : de.ui.candleBurning(candleWeight(b.turn))}</p>
        )}
        <div className="ss-table-wrap">
          <div className="ss-table" role="grid" aria-label="Spielfeld">
            <div className="ss-side-shade ss-opp" aria-hidden />
            <div className="ss-side-shade ss-own" aria-hidden />
            <div className="ss-own-front" aria-hidden />
            {rows.map((row, ri) => (
              <React.Fragment key={`${row.p}${row.zone}`}>
                <span className="ss-row-label" style={{ top: rowTop(ri), height: "var(--slot-h)" }}>{you === null ? `${names[row.p]} · ` : row.p === bottom ? "Du · " : ""}{row.label}</span>
                {Array.from({ length: LANES }, (_, lane) => {
                  const u = b.players[row.p][row.zone][lane];
                  const own = row.p === bottom;
                  const key = `${row.zone}:${lane}`;
                  let targetable = false;
                  if (canAct && !pending) {
                    if (selCard && own) {
                      const needsSac = selCard.cost.type === "blood" && needBlood > 0;
                      if (!needsSac) targetable = !u;
                      else if (u && !freedSlot(row.zone, lane)) targetable = r.laneProp(bottom, lane) !== "heilig";
                      else targetable = bloodReady;
                    } else if (mode === "hammer") targetable = own && !!u;
                    else if (mode === "item" && item) {
                      const t = ITEM_BY_ID[item].target;
                      targetable = (t === "enemyUnit" && !own && !!u) || (t === "enemyFront" && !own && row.zone === "front" && !!u) || (t === "ownSlot" && own && !u) || (t === "enemySigil" && !own && !!u && u.sigils.length > 0);
                    }
                  }
                  const chosen = own && target && target.zone === row.zone && target.lane === lane;
                  const laneGlow = (totemLane !== null && totemLane === lane && own);
                  return (
                    <div
                      key={key}
                      className={`ss-slot ${row.zone === "back" ? "ss-back" : ""} ${targetable ? "ss-target" : ""} ${chosen ? "ss-chosen" : ""} ${dragOver === `${row.p}${key}` ? "ss-dragover" : ""} ${laneGlow ? "ss-lane-glow" : ""}`}
                      style={{ left: `calc(var(--slot-w) * ${lane})`, top: rowTop(ri) }}
                      data-slot={`${row.p}:${row.zone}:${lane}`}
                      onDragOver={own && canAct ? (e) => { e.preventDefault(); setDragOver(`${row.p}${key}`); } : undefined}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={own && canAct ? (e) => onDrop(e, row.zone, lane) : undefined}
                      onMouseEnter={() => own && setHoverSlot(key)}
                      onMouseLeave={() => setHoverSlot(null)}
                    >
                      {!u && (
                        <button type="button" onClick={() => onSlot(row.p, row.zone, lane)} aria-label={`${own ? "Eigener" : "Gegnerischer"} Slot ${row.label} ${lane + 1}`} tabIndex={targetable ? 0 : -1} />
                      )}
                      {preview && own && row.zone === "front" && preview.lane === lane && (
                        <span className="ss-badge absolute bottom-[6%] z-10 inline-flex items-center gap-1"><Claw size={12} /> {preview.atk}{preview.direct ? " → Waage" : preview.spill > 0 ? ` · Überlauf ${preview.spill}` : ""}</span>
                      )}
                    </div>
                  );
                })}
                {ri === 1 && (
                  <div className="ss-divider" style={{ top: `calc(var(--slot-h) * 2)` }} aria-hidden />
                )}
              </React.Fragment>
            ))}

            {units.map(({ u, ri, lane }) => {
              const own = u.owner === bottom;
              const marked = own && sacs.some((s) => s.zone === u.zone && s.lane === u.lane);
              const auras = aurasOf(b, u);
              const atk = r.attackOf(u);
              const glow = totemTribe && u.card.tribe === totemTribe && own;
              return (
                <div key={u.uid} className={`ss-unit ${sacrificable(u) ? "ss-sacrificable" : ""}`} style={{ transform: `translate(calc(var(--slot-w) * ${lane}), ${rowTop(ri)})`, zIndex: anim?.ev?.uid === u.uid || hold?.uid === u.uid ? 20 : 5, ...(anim?.ev?.uid === u.uid && anim.ev.type === "move" ? { transitionDuration: `${Math.round(anim.dur)}ms` } : {}) }}>
                  <div
                    className={animClassFor(u)}
                    style={strikeStyle(u, own)}
                    onMouseEnter={(e) => {
                      if (mobile) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      clearTimeout(hoverTimer.current);
                      hoverTimer.current = setTimeout(() => setHover({ uid: u.uid, rect }), 380);
                    }}
                    onMouseLeave={() => { clearTimeout(hoverTimer.current); setHover(null); }}
                  >
                    <Card
                      card={u.card}
                      uid={u.uid}
                      width={slotPx * 0.84}
                      attack={atk}
                      health={u.health}
                      maxHealth={u.maxHealth}
                      auras={auras}
                      wick={u.wick}
                      submerged={u.submerged}
                      marked={marked}
                      glow={glow || (chosenUnit(target, u, own))}
                      onClick={() => onSlot(u.owner, u.zone, u.lane)}
                      onDetail={() => openDetail(u)}
                      tabIndex={0}
                    />
                  </div>
                  {(anim?.ev?.type === "wanderStart" || anim?.ev?.type === "turnAround") && anim.ev.uid === u.uid && (
                    <WanderArrow dir={anim.ev.dir} />
                  )}
                  <div className="ss-unit-badges">
                    {metamorphLeft(r, u) !== null && <span className="ss-badge ss-badge-meta" title="Metamorphose: verwandelt sich am Ende deines Zugs, wenn der Zähler 0 erreicht">Verwandlung {metamorphLeft(r, u)}</span>}
                    {u.stunned && <span className="ss-badge" title="Greift im nächsten Zug nicht an"><Hourglass size={12} /></span>}
                    {u.glued > 0 && <span className="ss-badge" title="Festgeleimt">Leim {u.glued}</span>}
                    {r.level(u, "schildrinde") > 0 && !u.shieldUsed && <span className="ss-badge" title="Schildrinde bereit"><ShieldBark size={12} /></span>}
                  </div>
                  {canAct && own && u.zone === "back" && !me.front[u.lane] && !u.rushed && r.level(u, "vorpreschen") > 0 && (
                    <button type="button" className="ss-btn ss-btn-sm ss-rush" onClick={() => act({ type: "rush", lane: u.lane })} title="Vorpreschen" aria-label="Vorpreschen"><RushArrow size={16} /></button>
                  )}
                  {u.submerged && <span className="ss-ripple" aria-hidden />}
                </div>
              );
            })}

            {floats.map((f) => {
              const ri = rows.findIndex((row) => row.p === f.p && row.zone === f.zone);
              if (ri < 0) return null;
              // Überlauf: Weg bis zur Zielreihe (Hinterreihe) oder aus dem Feld hinaus Richtung Waage
              const ti = f.toZone ? rows.findIndex((row) => row.p === f.p && row.zone === f.toZone) : -1;
              const dy = f.kind !== "spill" ? null : ti >= 0 ? `calc(${rowTop(ti)} - ${rowTop(ri)})` : `calc(var(--slot-h) * ${f.p === bottom ? 0.9 : -0.9})`;
              return (
                <span key={f.id} className={`ss-float ss-float-${f.kind}`} style={{ left: `calc(var(--slot-w) * ${f.lane + 0.5})`, top: `calc(${rowTop(ri)} + var(--slot-h) * 0.35)`, ...(dy ? { "--dy": dy } : {}) }}>{f.text}</span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Hinweis, Opfer-Zähler, Bestätigen ── */}
      <div className="ss-b-hint">
        {selCard && selCard.cost.type === "blood" && needBlood > 0 && (
          <span className={`ss-blood-count ${bloodReady ? "ss-ready" : ""}`} aria-live="polite">
            <BloodDrop size={22} /> Blut {Math.min(sacSum, needBlood)} / {needBlood}
          </span>
        )}
        {hint && <p className="ss-hint">{hint}</p>}
        {hintExtra}
        {selCard && selCard.cost.type === "blood" && needBlood > 0 && (
          <button type="button" className="ss-seal !min-h-[44px] !px-5" disabled={!bloodReady || !target} onClick={() => tryPlay(target)}>{de.ui.confirm}</button>
        )}
        {(selCard || mode !== "idle") && <button type="button" className="ss-btn ss-btn-sm min-h-[44px]" onClick={reset}>{de.ui.cancel}</button>}
      </div>
        {pinUnit && (
          <div className="ss-paper p-3 flex flex-wrap gap-2 items-center justify-center my-1">
            {pinUnit.unit.sigils.map((s) => (
              <button key={s} type="button" className="ss-btn ss-btn-sm" onClick={async () => { if (await act({ type: "item", item, target: { zone: pinUnit.zone, lane: pinUnit.lane, sigil: s } })) reset(); }}>
                <SigilIcon sigil={s} size={20} /> {de.sigils[parseSigil(s).id]?.name}
              </button>
            ))}
          </div>
        )}

      {/* ── Hand ── */}
      <div ref={handBoxRef} className={`ss-b-hand ${layout === "landscape-s" ? "ss-peek" : layout === "portrait" ? "ss-peek ss-peek-lite" : ""}`}>
        <div className="ss-hand" style={{ "--hand-w": `${handW}px` }} aria-label="Deine Hand">
          {you !== null && hand.map((card, i) => {
            if (card.hidden) return null;
            const n = hand.length;
            const off = i - (n - 1) / 2;
            const aff = affordable(r, me, card, bottom);
            const drawAnim = anim?.ev && (anim.ev.type === "draw" || anim.ev.type === "handAdd") && anim.ev.uid === card.uid;
            return (
              <div
                key={card.uid}
                className={`ss-hand-card ${!aff.ok && canAct ? "ss-unplayable" : ""} ${sel === card.uid ? "ss-sel" : ""}`}
                style={{ transform: `translateX(calc(-50% + ${off * spread}px)) translateY(${Math.abs(off) * 4}px) rotate(${off * Math.min(6, 40 / n) * (layout === "portrait" ? 0.5 : 1)}deg)`, zIndex: 10 + i }}
                onMouseMove={(e) => {
                  const el = e.currentTarget.querySelector(".ss-tilt");
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
                  el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
                  el.style.setProperty("--gx", `${x * 100}%`);
                  el.style.setProperty("--gy", `${y * 100}%`);
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget.querySelector(".ss-tilt");
                  el?.style.setProperty("--ry", "0deg");
                  el?.style.setProperty("--rx", "0deg");
                }}
              >
                <div className={`ss-tilt ${drawAnim ? "ss-a-draw" : ""}`} style={{ transform: sel === card.uid ? "translateY(-26px) scale(1.06)" : undefined }}>
                  <Card
                    card={card}
                    uid={card.uid}
                    width={handW}
                    selected={sel === card.uid}
                    glow={pending?.kind === "discard" && canAct}
                    onClick={() => onHandCard(card)}
                    onDetail={() => setDetail({ card })}
                    tabIndex={0}
                    draggable={canAct && !needDraw}
                    onDragStart={(e) => onDragStartCard(e, card)}
                    onDragEnd={() => setDragOver(null)}
                  />
                </div>
              </div>
            );
          })}
          {you === null && <p className="text-center ss-dim pt-6">Zuschauer sehen nur öffentliche Information.</p>}
        </div>
      </div>

      </div>

      <div className="ss-col ss-col-left2">
      {/* ── Ressourcen ── */}
      {you !== null && (
        <div className="ss-b-res ss-panel">
          <div className="ss-res" data-anchor={`blood-${bottom}`} title="Blutschale: Opfer beim Ausspielen (plus Blutphiole)">
            <div className="ss-bowl"><div className="ss-bowl-fill" style={{ height: `${Math.min(100, ((sacSum + (me.bloodBonus || 0)) / 4) * 100)}%` }} /></div>
            <span className="ss-res-num">{sacSum + (me.bloodBonus || 0)}</span>
            <span className="ss-res-label">Blut</span>
          </div>
          <div className="ss-res" data-anchor={`bones-${bottom}`} title="Knochen">
            <div className="ss-pile flex items-end justify-center"><Bone size={22} /><Bone size={18} className="-ml-3 rotate-45" /></div>
            <span className="ss-res-num">{me.bones}</span>
            <span className="ss-res-label">{de.costs.bones.name}</span>
          </div>
          <div className="ss-res" data-anchor={`wax-${bottom}`} title={`Wachs (höchstens ${WAX_MAX})`}>
            <div className="ss-pile flex items-end justify-center"><CandleStub size={30} /></div>
            <span className="ss-res-num">{me.wax}</span>
            <span className="ss-res-label">Wachs</span>
          </div>
        </div>
      )}

      {/* ── Items und Totems (klein, Details per Tooltip) ── */}
      {you !== null && (
        <div className="ss-b-extras">
          {itemsList.map((id, i) => (
            <ItemButton key={`${id}${i}`} id={id} active={mode === "item" && item === id} disabled={!canAct || needDraw || !!pending}
              onClick={async () => {
                const t = ITEM_BY_ID[id].target;
                if (t === "none") { await act({ type: "item", item: id, target: {} }); reset(); return; }
                reset();
                setMode("item");
                setItem(id);
              }} />
          ))}
          {[bottom, top].map((p) => {
            const tot = view.players[p]?.totems;
            const list = tot ? [tot.tribe, tot.lane].filter(Boolean) : [];
            return list.map((t, i) => <TotemFigure key={`${p}${i}`} totem={t} kind={i ? "Lane" : "Stamm"} owner={p === bottom && you !== null ? de.ui.you : names[p]} onHover={p === bottom ? setTotemHover : () => {}} />);
          })}
        </div>
      )}

      </div>

      <div className="ss-col ss-col-right">
      {/* ── Decks: Hauptdeck und Nebendeck als eigene Stapel ── */}
      {you !== null && (
        <div className="ss-b-decks" style={{ "--stack-w": `${stackW}px` }}>
          <DeckStack width={stackW} label={de.ui.drawMain} count={me.deckSize ?? 0} drawable={needDraw} anchor={`deck-${bottom}`} onDraw={() => act({ type: "draw", pile: "main" })} />
          <DeckStack width={stackW} label={de.sides[me.sideType]?.name || de.ui.drawSide} count={null} side drawable={needDraw} onDraw={() => act({ type: "draw", pile: "side" })} />
        </div>
      )}

      {/* ── Aktionen: großer Zug-beenden-Knopf, Hammer ── */}
      <div className="ss-b-actions">
        {you !== null && (
          <>
            <button type="button" className="ss-seal ss-endturn" disabled={!canAct || needDraw || !!pending} onClick={async () => { reset(); await act({ type: "endTurn" }); }}>
              {de.ui.endTurn}
            </button>
            <button type="button" className={`ss-btn ss-btn-sm ss-hammer ${mode === "hammer" ? "!border-[var(--wax-red-light)]" : ""}`} disabled={!canAct || needDraw || !!pending || liveMe?.hammerUsed} onClick={() => { reset(); setMode("hammer"); }} title="1× pro Zug eine eigene Karte zerstören" aria-label={de.ui.hammer}>
              <Hammer size={16} /> <span className="ss-hammer-label">{de.ui.hammer}</span>
            </button>
            <span className="text-xs ss-faint text-center">{de.ui.hand}: {me.hand.length}/{HAND_LIMIT}</span>
          </>
        )}
        {you === null && <p className="text-xs ss-faint text-center">{names[bottom]}: {me.handSize ?? me.hand.length} Karten · {names[top]}: {opp.handSize ?? opp.hand.length} Karten</p>}
      </div>

      </div>

      {pending?.kind === "seer" && canAct && pending.cards && (
        <SeerDialog cards={pending.cards} onConfirm={(order) => act({ type: "seer", order })} />
      )}
      {hover && !detail && (() => {
        const found = units.find((x) => x.u.uid === hover.uid);
        if (!found) return null;
        const u = found.u;
        const left = hover.rect.right + 300 < vw ? hover.rect.right + 12 : hover.rect.left - 302;
        const topPx = Math.max(64, Math.min(vh - 460, hover.rect.top - 40));
        return (
          <div className="ss-hover-preview ss-paper" style={{ left, top: topPx }} aria-hidden>
            <div className="flex justify-center mb-2"><Card card={u.card} width={170} attack={r.attackOf(u)} health={u.health} maxHealth={u.maxHealth} auras={aurasOf(b, u)} wick={u.wick} /></div>
            <SigilTexts sigils={u.sigils} auras={aurasOf(b, u)} />
          </div>
        );
      })()}
      {detail && <CardDetail card={detail.card} unit={detail.unit} auras={detail.auras} attack={detail.attack} onClose={() => setDetail(null)} />}
      {toast && <div className="ss-toast ss-paper" role="status">{toast}</div>}
      {anim?.ev?.type === "battleEnd" && (
        <div className="ss-banner ss-paper">
          <p className="ss-title !text-[var(--ink)] text-4xl">{you === null ? `${names[anim.ev.winner]} gewinnt` : anim.ev.winner === you ? de.ui.victory : de.ui.defeat}</p>
          <p className="text-[var(--ink)] opacity-75">Kampf {b.battleNo}</p>
        </div>
      )}
      {anim?.ev?.type === "firstTurnNoAttack" && (
        <div className="ss-banner ss-banner-soft" style={{ animationDuration: "1.2s" }}>
          <p className="ss-title text-xl text-[var(--parchment)] opacity-85">{de.ui.firstTurnNoAttack}</p>
        </div>
      )}
      {anim?.ev?.type === "turnStart" && you !== null && anim.ev.player === you && (
        <div className="ss-banner" style={{ animationDuration: "0.9s" }}>
          <p className="ss-title text-3xl text-[var(--candle)]">Dein Zug</p>
        </div>
      )}
    </div>
  );
}

/** Metamorphose-Countdown: wie viele eigene Zugenden noch bis zur Verwandlung (null = keine Metamorphose). */
function metamorphLeft(r, u) {
  if (!u.card.evolvesTo || r.level(u, "metamorphose") <= 0) return null;
  return Math.max(0, 2 - (u.turns || 0));
}

/** Richtungspfeil beim Wandern (Tuschestrich statt Symbolzeichen). */
function WanderArrow({ dir }) {
  return (
    <svg className="ss-wander-arrow" viewBox="0 0 40 20" style={{ transform: `translateX(-50%) scaleX(${dir < 0 ? -1 : 1})` }} aria-hidden>
      <path d="M3 10c9-1 20-1 31 0" fill="none" stroke="#f2e6c8" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 4l9 6-9 6" fill="none" stroke="#f2e6c8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Fenstergröße (für Karten- und Slotgrößen). */
function useViewport() {
  const read = () => ({ w: typeof window !== "undefined" ? window.innerWidth : 1280, h: typeof window !== "undefined" ? window.innerHeight : 900 });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

const FLOAT_KIND = { damage: "dmg", heal: "heal", buff: "buff", debuff: "debuff", overflow: "spill" };

/** Schwebende Zahlen (Schaden als Tusche-Klecks, Heilung, Buffs) aus dem laufenden Ereignis. */
function useFloats(anim, b) {
  const [list, setList] = useState(/** @type {any[]} */ ([]));
  useEffect(() => {
    const ev = anim?.ev;
    if (!ev || !FLOAT_KIND[ev.type] || !b) return undefined;
    let pos = null;
    if (ev.type === "overflow") {
      // Überlauf: die Restzahl löst sich von der getroffenen Karte und wandert zur Hinterreihe bzw. zur Waage
      pos = { p: ev.player, zone: ev.fromZone, lane: ev.lane, toZone: ev.to ? "back" : null };
    } else {
      for (const P of b.players) for (const zone of ["front", "back"]) P[zone].forEach((u, lane) => { if (u && u.uid === ev.uid) pos = { p: u.owner, zone, lane }; });
    }
    if (!pos) return undefined;
    const amount = ev.type === "damage" || ev.type === "overflow" ? ev.amount : ev.type === "heal" ? ev.amount : (ev.attack || 0) + (ev.health || 0);
    const signed = (/** @type {number} */ n) => `${n > 0 ? "+" : ""}${n}`;
    const text = ev.type === "damage" || ev.type === "overflow" ? String(amount) : ev.type === "heal" ? `+${amount}` : (
      <>
        {ev.attack ? <span className="inline-flex items-center">{signed(ev.attack)}<Claw size={18} /></span> : null}
        {ev.health ? <span className="inline-flex items-center ml-1">{signed(ev.health)}<WaxHeart size={16} /></span> : null}
      </>
    );
    const f = { id: anim.key, kind: FLOAT_KIND[ev.type], text, ...pos };
    setList((l) => [...l.slice(-8), f]);
    // Kein Aufräumen beim nächsten Ereignis: die Zahl soll ihre Animation zu Ende spielen
    setTimeout(() => setList((l) => l.filter((x) => x.id !== f.id)), 950);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.key]);
  return list;
}

function chosenUnit(target, u, own) {
  return !!(own && target && target.zone === u.zone && target.lane === u.lane);
}
