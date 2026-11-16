// ui/table/TableScene.jsx — die Szenen des Pfads am Tisch (Rebuild „Am Tisch“, Phase 4).
//
// Ersetzt die Pergament-Formulare aus path/Scenes.jsx am Tisch im Kerzenlicht. Alle Szenen benutzen denselben
// Baukasten — so sieht jede anders aus, bedient sich aber gleich:
//   Blatt       oben liegt ein Blatt mit dem Namen des Orts und dem, was hier geschieht
//   Angebot     Karten, die hier zu haben sind, liegen offen (oder verdeckt) aus
//   Deck        braucht die Szene Karten aus dem eigenen Deck, fächert es sich aus dem Stapel auf den Tisch
//   Zettel      Wahlmöglichkeiten liegen als kleine Zettel da (Sigil, Wasserstand, Stamm, Einsatz …)
//   Stempel     der Siegelstempel (oder die Leertaste) führt aus, was das Blatt in der letzten Zeile nennt
//   Weitergehen ein Zettel am Rand: den Ort verlassen bzw. überspringen
// Dazu je Szene ihr eigener Gegenstand: die Feuerschale am Lagerfeuer, die Beutel des Händlers.
// Was eine Szene zeigt und tut, beschreibt je Art eine kleine Funktion (SPECS) — die Regeln selbst liegen in
// engine/path.js und sind unverändert.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CardDetail from "../card/CardDetail.jsx";
import TablePause from "./TablePause.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { CAMPFIRE_RISK, MIN_DECK } from "../../data/events.js";
import { MAX_ITEMS } from "../../data/items.js";
import { combineError, totemSlot } from "../../data/totems.js";
import { tribeIdsOf } from "../../data/tribes.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import { baseDesc, baseName, headKind, headName, headTarget, slotLabel, totemText } from "../common/totemText.js";
import { rowX, stageModel, timeLeft, totemsOnTable } from "./stageModel.js";

const pct = (x) => `${Math.round(x * 100)} %`;

/**
 * Was eine Szene zeigt und tut. Jede Funktion bekommt den Stand der Szene und liefert:
 *   title, intro, lines?      Text des Blatts
 *   offers?                   [{ uid, card, faceDown?, on?, run }] Karten zur Wahl
 *   deck?                     { enabled(dc), selected: string[], toggle(uid) } eigenes Deck auslegen
 *   options?                  [{ id, label, on?, dim?, tip?, run }] Zettel
 *   wares? fire? shown?       Beutel des Händlers · Feuerschale · eine einzelne Karte im Blickpunkt
 *   confirm?                  { label, ready, why?, run } Siegelstempel
 *   leave?                    { label, run } Zettel „Weitergehen“
 * c = { scene, deck, player, zirkel, st, set, act }: st/set = Auswahl des Spielers in dieser Szene
 * @type {Record<string, (c: any) => any>}
 */
const SPECS = {
  cardChoice({ scene, act }) {
    const variant = de.nodes.cardChoice.variants[scene.variant];
    return {
      title: de.nodes.cardChoice.name,
      intro: `Nimm eine der drei Karten${variant ? ` – ${variant}` : ""}${scene.costType ? ` (${de.costs[scene.costType].name})` : ""}.`,
      offers: scene.offers.map((id, i) => ({ uid: `angebot${i}`, card: id ? resolveCard(id, [], `angebot${i}`) : null, faceDown: scene.variant === "hidden" || !id, run: () => { sound.play("draw"); act("pick", { index: i }); } })),
      leave: scene.offers.length ? null : { label: de.ui.skip, run: () => act("skip") },
    };
  },
  fuse({ deck, st, set, act }) {
    const counts = new Map();
    for (const dc of deck) counts.set(dc.baseId, (counts.get(dc.baseId) || 0) + 1);
    const sel = st.sel || [];
    const first = deck.find((d) => d.uid === sel[0]);
    const hasPair = [...counts.values()].some((n) => n >= 2);
    return {
      title: de.nodes.fuse.name,
      intro: "Nadel und Faden: Zwei gleiche Karten werden zu einer. Angriff und Leben werden addiert, Sigils vereint (höchstens 4, Doppelte werden stärker).",
      lines: hasPair ? [] : ["Du hast keine zwei gleichen Karten."],
      deck: {
        enabled: (dc) => counts.get(dc.baseId) >= 2 && (!first || dc.baseId === first.baseId),
        selected: sel,
        toggle: (uid) => set({ sel: sel.includes(uid) ? sel.filter((x) => x !== uid) : sel.length < 2 ? [...sel, uid] : sel }),
      },
      confirm: { label: "Zusammennähen", ready: sel.length === 2, why: "Wähle zwei gleiche Karten.", run: () => { sound.play("needle"); act("fuse", { a: sel[0], b: sel[1] }); } },
      leave: { label: de.ui.skip, run: () => act("skip") },
    };
  },
  transfer({ deck, st, set, act }) {
    const { donor = null, sigil = null, target = null } = st;
    const d = deck.find((x) => x.uid === donor);
    const small = deck.length <= MIN_DECK;
    const step = !donor ? 1 : !sigil ? 2 : 3;
    const free = (dc) => dc.card.sigils.some((s) => parseSigil(s).id !== "fluchmal");
    return {
      title: de.nodes.transfer.name,
      intro: small ? "Dein Deck hat nur noch 8 Karten – hier darfst du nichts opfern."
        : step === 1 ? "Opfere eine Karte: Eines ihrer Sigils brennt sich in eine andere ein. Wähle zuerst die Karte, die du opferst."
          : step === 2 ? "Wähle das Sigil, das sich lösen soll." : "Wähle die Karte, in die es sich einbrennt (höchstens 4 Sigils).",
      deck: small ? null : {
        enabled: (dc) => (step === 1 ? free(dc) : step === 3 ? dc.uid !== donor && dc.card.sigils.length < 4 : dc.uid === donor),
        selected: [donor, target].filter(Boolean),
        toggle: (uid) => { if (step === 1) set({ donor: uid }); else if (step === 3) set({ target: uid === target ? null : uid }); },
      },
      options: [
        ...(d && step >= 2 ? d.card.sigils.filter((s) => parseSigil(s).id !== "fluchmal").map((s) => ({ id: `sigil:${s}`, label: de.sigils[parseSigil(s).id].name, on: sigil === s, tip: de.sigils[parseSigil(s).id].desc, run: () => set({ sigil: s }) })) : []),
        ...(donor ? [{ id: "neu", label: "Neu wählen", run: () => set({ donor: null, sigil: null, target: null }) }] : []),
      ],
      confirm: small ? null : { label: "Einbrennen", ready: !!donor && !!sigil && !!target, why: "Erst Opferkarte, Sigil und Zielkarte wählen.", run: () => { sound.play("fire"); act("transfer", { donor, sigil, target }); } },
      leave: { label: de.ui.skip, run: () => act("skip") },
    };
  },
  campfire({ scene, deck, st, set, act }) {
    const uid = scene.target || st.sel?.[0] || null;
    const card = deck.find((d) => d.uid === uid);
    const risk = CAMPFIRE_RISK[scene.uses];
    const spent = risk === undefined;
    const boost = (stat) => { sound.play("fire"); act("boost", { uid, stat }); };
    const next = CAMPFIRE_RISK.slice(scene.uses + 1).map(pct).join(" → ");
    return {
      title: de.nodes.campfire.name,
      intro: "Halte eine Karte über die Flammen: +1 Angriff oder +2 Leben. Du darfst wiederholen – aber das Feuer wird gierig.",
      lines: [
        spent ? "Das Feuer ist heruntergebrannt." : risk === 0 ? "Der erste Gang ist sicher." : `Risiko: ${pct(risk)}, dass die Karte verbrennt.`,
        ...(next ? [`Danach: ${next}`] : []),
      ],
      fire: true,
      shown: scene.target && card ? card.card : null,
      deck: scene.target ? null : { enabled: () => true, selected: uid ? [uid] : [], toggle: (x) => set({ sel: [x] }) },
      options: [
        { id: "angriff", label: "+1 Angriff", dim: !uid || spent, run: () => (uid && !spent ? boost("attack") : null) },
        { id: "leben", label: "+2 Leben", dim: !uid || spent, run: () => (uid && !spent ? boost("health") : null) },
      ],
      leave: { label: de.ui.leave, run: () => act("leave") },
    };
  },
  remove({ deck, st, set, act }) {
    const sel = st.sel?.[0] || null;
    const small = deck.length <= MIN_DECK;
    return {
      title: de.nodes.remove.name,
      intro: small ? "Dein Deck hat nur noch 8 Karten." : "Wähle eine Karte: Sie verschwindet für immer aus deinem Deck.",
      deck: small ? null : { enabled: () => true, selected: sel ? [sel] : [], toggle: (uid) => set({ sel: [uid] }) },
      confirm: small ? null : { label: "Entfernen", ready: !!sel, why: "Wähle erst eine Karte.", run: () => { sound.play("death"); act("remove", { uid: sel }); } },
      leave: { label: de.ui.skip, run: () => act("skip") },
    };
  },
  merchant({ scene, player, act }) {
    const full = player.items.length >= MAX_ITEMS;
    const buy = (o, i) => { if (!o.sold && player.shards >= o.price && !full) { sound.play("coins"); act("buy", { index: i }); } else sound.play("error"); };
    return {
      title: de.nodes.merchant.name,
      intro: `Ein Karren voller Kuriositäten. Du hast ${player.shards} Splitter und trägst ${player.items.length} von ${MAX_ITEMS} Items.`,
      lines: player.items.length ? [`Deine Items: ${player.items.map((i) => de.items[i].name).join(", ")}`] : [],
      wares: scene.offers.map((o, i) => ({ id: i, item: o.item, price: o.price, sold: o.sold, dim: o.sold || player.shards < o.price || full, run: () => buy(o, i) })),
      leave: { label: de.ui.leave, run: () => act("leave") },
    };
  },
  // ── Moorwanderung ──
  // Belohnung nach einem Kampf: 1 aus 3 Karten, dazu Splitter (bei Elite/Boss ein Item, schon eingesteckt)
  reward({ scene, act }) {
    const kind = scene.fightKind;
    return {
      title: de.run.rewardTitle[kind] || "Belohnung",
      intro: `${de.run.rewardHint[kind] || "Wähle eine Karte."} +${scene.shards} Splitter${scene.item ? ` · Item: ${de.items[scene.item].name}` : ""}.`,
      offers: scene.offers.map((id, i) => ({ uid: `belohnung${i}`, card: resolveCard(id, [], `belohnung${i}`), run: () => { sound.play("draw"); act("pick", { index: i }); } })),
      leave: { label: de.ui.skip, run: () => act("skip") },
    };
  },
  // Späherturm: einen Mitspieler wählen, seine öffentlich bekannten Karten liegen dann aus
  scout({ scene, act, others }) {
    const r = scene.report;
    const pub = r ? Object.keys(r.publicCards).filter((id) => CARDS[id]).slice(0, 8) : [];
    return {
      title: de.nodes.scout.name,
      intro: "Vom Turm aus sieht man weit übers Moor – und auf fremde Tische.",
      lines: r ? [`${r.name}: ${r.seals} von ${r.sealsTotal} Siegeln · ${r.deckSize} Karten im Deck`, pub.length ? "Offen bekannt (Rechtsklick: ansehen):" : de.run.noPublic] : ["Wähle einen Mitspieler."],
      options: others.map((o) => ({ id: `blick:${o.q}`, label: `${o.name}${o.alive ? "" : " (aus)"}`, on: scene.looked === o.q, run: () => act("look", { target: o.q }) })),
      offers: pub.map((id, i) => ({ uid: `spaeher${i}`, card: resolveCard(id, [], `spaeher${i}`), run: () => {} })),
      leave: { label: de.ui.leave, run: () => act("leave") },
    };
  },
  shrine({ scene, player, zirkel, st, set, act }) {
    // Erster Besuch ohne Totem (Regel seit 15.11.2026): drei fertige Totems zur Wahl, Nehmen setzt es gleich auf
    if (scene.first) {
      return {
        title: de.nodes.shrine.name,
        intro: scene.taken ? "Dein erstes Totem steht auf dem Tisch. Bei späteren Besuchen lässt es sich umbauen." : "Ein Schnitzmesser liegt bereit. Wähle dein erstes Totem – Kopf und Körper sind schon zusammengesetzt.",
        lines: [],
        // drei geschnitzte Figuren mit Namensschild: Kopf groß, Körper darunter
        figures: scene.taken ? [] : scene.offers.map((o, i) => ({
          id: `neu:${i}`, kind: o.head.kind, label: headName(o.head, zirkel), sub: baseName(o.base),
          tip: `${totemText(o.head, o.base, zirkel)} ${o.head.kind === "side" ? "" : `(${headKind(o.head)}: trifft ${headTarget(o.head, zirkel)}.)`}`.trim(),
          run: () => { sound.play("creak"); act("take", { index: i }); },
        })),
        leave: { label: de.ui.leave, run: () => act("leave") },
      };
    }
    const z = getZirkel(zirkel);
    const h = st.head !== undefined && st.head !== null ? player.heads[st.head] : null;
    const b = st.base !== undefined && st.base !== null ? player.bases[st.base] : null;
    const err = h && b ? combineError(h, b, z) : null;
    const slot = h ? totemSlot(h) : null;
    const current = slot ? player.totems?.[slot] : null;
    return {
      title: de.nodes.shrine.name,
      intro: scene.taken ? "Setze einen Kopf (wer es bekommt) auf einen Körper (was sie bekommen)." : "Ein Schnitzmesser liegt bereit. Nimm zuerst eines der drei neuen Teile, dann setze deine Totems zusammen.",
      lines: [
        h && b && !err ? `${totemText(h, b, zirkel)} ${current ? `(${de.totems.replaces(slotLabel(slot))})` : `(${de.totems.newSlot(slotLabel(slot))})`}`
          : err ? errorText(err) : scene.taken ? "Wähle einen Kopf und einen Körper." : "",
      ].filter(Boolean),
      groups: [
        ...(scene.taken ? [] : [{ z: -13, title: "Neues Teil", items: scene.offers.map((o, i) => ({
          id: `neu:${i}`, label: o.head ? `Neu: ${headName(o.head, zirkel)}` : `Neu: ${baseName(o.base)}`,
          tip: o.head ? `Neuer ${de.totems.head} (${headKind(o.head)}): trifft ${headTarget(o.head, zirkel)}.` : `Neuer ${de.totems.base}: ${baseDesc(o.base)}`,
          run: () => { sound.play("seal"); act("take", { index: i }); },
        })) }]),
        { z: -2, title: "Kopf", items: player.heads.map((x, i) => ({ id: `kopf:${i}`, label: headName(x, zirkel), on: st.head === i, tip: `${headKind(x)}: trifft ${headTarget(x, zirkel)}.`, run: () => set({ head: st.head === i ? null : i }) })) },
        { z: 9, title: "Körper", items: player.bases.map((x, i) => ({ id: `koerper:${i}`, label: baseName(x), on: st.base === i, dim: !!h && !!combineError(h, x, z), tip: baseDesc(x), run: () => set({ base: st.base === i ? null : i }) })) },
      ],
      confirm: { label: "Totem zusammensetzen", ready: !!h && !!b && !err, why: err ? errorText(err) : "Wähle einen Kopf und einen Körper.", run: () => { sound.play("creak"); act("assemble", { head: st.head, base: st.base }); set({ head: null, base: null }); } },
      leave: { label: de.ui.leave, run: () => act("leave") },
    };
  },
  copyist({ scene, st, set, act }) {
    const sel = st.sel?.[0] || null;
    return {
      title: de.nodes.copyist.name,
      intro: `Der Kopist zeichnet eine Karte nach. Die Kopie bekommt einen Makel: ${scene.flaw === "health" ? "−1 Leben" : "Kerzendocht 4"}.`,
      deck: { enabled: (dc) => !CARDS[dc.baseId].unique, selected: sel ? [sel] : [], toggle: (uid) => set({ sel: [uid] }) },
      confirm: { label: "Kopieren", ready: !!sel, why: "Wähle erst eine Karte.", run: () => { sound.play("draw"); act("copy", { uid: sel }); } },
      leave: { label: de.ui.skip, run: () => act("skip") },
    };
  },
  event({ scene, deck, player, zirkel, st, set, act }) {
    const e = de.events[scene.event] || { name: "?", intro: "", action: "" };
    const sel = st.sel || [];
    const one = { enabled: () => true, selected: sel, toggle: (uid) => set({ sel: [uid] }) };
    const skip = { label: de.ui.skip, run: () => act("skip") };
    const base = { title: e.name, intro: e.intro };
    const need = "Wähle erst eine Karte.";
    switch (scene.event) {
      case "faehrmann":
        return { ...base, deck: { ...one, enabled: (dc) => CARDS[dc.baseId].rarity !== "legendary" }, confirm: { label: e.action, ready: sel.length === 1, why: need, run: () => act("swap", { uid: sel[0] }) }, leave: skip };
      case "tintenwitwe":
      case "wachszieher":
      case "salzsieder":
        return { ...base, confirm: { label: e.action, ready: true, run: () => act("accept") }, leave: { label: "Ablehnen", run: () => act("decline") } };
      case "knochenorakel": {
        const pick = st.pick ?? 0;
        return {
          ...base,
          lines: ["Oben liegt, was das Orakel bietet: wähle eine. Unten dein Deck: wähle zwei für die Knochenschale."],
          offers: (scene.offers || []).map((id, i) => ({ uid: `orakel${i}`, card: resolveCard(id, [], `orakel${i}`), on: pick === i, run: () => set({ pick: i }) })),
          deck: { enabled: () => true, selected: sel, toggle: (uid) => set({ sel: sel.includes(uid) ? sel.filter((x) => x !== uid) : sel.length < 2 ? [...sel, uid] : sel }) },
          confirm: { label: e.action, ready: sel.length === 2 && deck.length - 1 >= MIN_DECK, why: deck.length - 1 < MIN_DECK ? "Dein Deck wäre danach zu klein." : "Wähle zwei Karten für die Schale.", run: () => act("offer", { uids: sel, pick }) },
          leave: skip,
        };
      }
      case "spiegelbrunnen":
        return { ...base, deck: { ...one, enabled: (dc) => !CARDS[dc.baseId].unique }, confirm: { label: e.action, ready: sel.length === 1, why: need, run: () => act("mirror", { uid: sel[0] }) }, leave: skip };
      case "mondfinsternis":
        return { ...base, deck: one, confirm: { label: e.action, ready: sel.length === 1, why: need, run: () => act("choose", { uid: sel[0] }) }, leave: skip };
      case "gluecksspieler": {
        const max = player.shards;
        const bet = Math.min(Math.max(1, st.bet ?? Math.max(1, Math.floor(max / 2))), Math.max(1, max));
        return {
          ...base,
          lines: [`Du hast ${max} Splitter. Dein Einsatz: ${max < 1 ? "–" : bet}`],
          options: max < 1 ? [] : [
            { id: "weniger", label: "− 1", dim: bet <= 1, run: () => set({ bet: Math.max(1, bet - 1) }) },
            { id: "mehr", label: "+ 1", dim: bet >= max, run: () => set({ bet: Math.min(max, bet + 1) }) },
            { id: "haelfte", label: "Hälfte", run: () => set({ bet: Math.max(1, Math.floor(max / 2)) }) },
            { id: "alles", label: "Alles", run: () => set({ bet: max }) },
          ],
          confirm: { label: `${e.action}: ${bet}`, ready: max >= 1, why: "Du hast keine Splitter.", run: () => { sound.play("coins"); act("bet", { amount: bet }); } },
          leave: { label: de.ui.leave, run: () => act("leave") },
        };
      }
      case "wrack":
        return { ...base, lines: player.items.length >= MAX_ITEMS ? ["Deine Taschen sind voll – ein Fund wird zu 3 Splittern."] : [], confirm: { label: e.action, ready: true, run: () => { sound.play("creak"); act("search"); } }, leave: { label: de.ui.leave, run: () => act("skip") } };
      case "gezeitentuempel": {
        const tide = st.tide || "high";
        return {
          ...base,
          options: ["high", "low"].map((t) => ({ id: `tide:${t}`, label: t === "high" ? de.tide.highShort : de.tide.lowShort, on: tide === t, run: () => set({ tide: t }) })),
          deck: { ...one, enabled: (dc) => !dc.card.tide },
          confirm: { label: e.action, ready: sel.length === 1, why: need, run: () => { sound.play("draw"); act("bind", { uid: sel[0], tide }); } },
          leave: skip,
        };
      }
      case "stammestreue": {
        const ids = tribeIdsOf(zirkel || "moor");
        const tribe = st.tribe || ids[0];
        return {
          ...base,
          options: ids.map((t) => ({ id: `stamm:${t}`, label: `${de.tribes[t].name} (${deck.filter((dc) => dc.card.tribe === t).length})`, on: tribe === t, run: () => set({ tribe: t }) })),
          confirm: { label: e.action, ready: true, run: () => act("choose", { tribe }) },
          leave: skip,
        };
      }
      default:
        return { ...base, leave: skip };
    }
  },
};

/** Zettel in Reihen legen (höchstens `per` nebeneinander). */
function slipRows(items, z0, { per = 5, w = 15, h = 5, gapX = 16, gapZ = 5.8 } = {}) {
  const out = [];
  for (let r = 0; r * per < items.length; r++) {
    const row = items.slice(r * per, (r + 1) * per);
    const xs = rowX(row.length, gapX);
    row.forEach((it, i) => out.push({ ...it, x: xs[i], z: z0 + r * gapZ, w, h }));
  }
  return out;
}

/**
 * @param {{ room: any, view: any, you: 0|1, send: (a: any) => Promise<any>, names: string[], timers?: any,
 *   clockOffset?: number, onFallback?: () => void, status?: string | null }} props
 */
export default function TableScene({ room, view, you, send, names, timers, clockOffset = 0, status, onFallback, run }) {
  const { showTip } = useShell();
  const zirkel = view.settings?.zirkel;
  const pp = view.path.players[you];
  const scene = pp.scene;
  const player = view.players[you];
  const opp = 1 - you;
  const deck = useMemo(() => player.deck || [], [player.deck]);
  const sceneKey = `${view.path.map.pathNo}-${pp.level}-${scene.kind}-${scene.event || ""}`;
  const [st, setSt] = useState(/** @type {any} */ ({ key: sceneKey }));
  // Neue Szene: die Auswahl der alten gilt nicht mehr
  const cur = st.key === sceneKey ? st : { key: sceneKey };
  const set = (patch) => setSt({ ...cur, ...patch });
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [paused, setPaused] = useState(false);
  const toastTimer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const act = async (op, extra = {}) => {
    const res = await send({ type: "nodeAction", op, ...extra });
    if (!res?.ok) { sound.play("error"); flash(errorText(res?.error)); }
    return res;
  };

  const spec = (SPECS[scene.kind] || (() => ({ title: "?", intro: "", leave: { label: de.ui.skip, run: () => act("skip") } })))({ scene, deck, player, zirkel, st: cur, set, act, others: run?.others || [] });

  // ── Anordnung auf dem Tisch ──
  const offers = spec.offers || [];
  const hasDeck = !!spec.deck;
  const placeholder = useMemo(() => resolveCard(Object.values(getZirkel(zirkel).sideDeckTypes)[0], [], "verdeckt"), [zirkel]);
  const loose = [];
  // Angebot: allein groß in der Mitte, zusammen mit dem Deck kleiner weiter hinten
  const offerScale = hasDeck ? 0.9 : offers.length > 3 ? 1.15 : 1.5;
  const offerX = rowX(offers.length, hasDeck ? 11.6 : offers.length > 3 ? 15.5 : 21);
  offers.forEach((o, i) => loose.push({ uid: o.uid, card: o.card || placeholder, faceUp: !o.faceDown, x: offerX[i], z: hasDeck ? -8 : 6, scale: offerScale, from: "table" }));
  // Eine Karte im Blickpunkt (Lagerfeuer: die Karte über den Flammen)
  if (spec.shown) loose.push({ uid: "blickpunkt", card: spec.shown, x: 0, z: 9, scale: 1.6, from: "deck" });
  // Zettel: Wahlmöglichkeiten; mehrere Gruppen (Schrein) liegen in eigenen Reihen
  const groups = spec.groups || (spec.options?.length ? [{ z: -12.5, items: spec.options }] : []);
  const slips = groups.flatMap((g) => slipRows(g.items, g.z));
  // Reihen-Titel (Schrein): ein kleiner Zettel links neben der Reihe, nicht anklickbar
  const titles = groups.filter((g) => g.title && g.items.length).map((g) => ({ id: `titel:${g.title}`, text: g.title, x: -(Math.min(5, g.items.length) - 1) * 8 - 17.5, z: g.z }));
  const optionRows = groups.reduce((n, g) => Math.max(n, Math.ceil(g.items.length / 5)), 0);
  // Deck: aus dem Stapel auf den Tisch gefächert, bis zu acht nebeneinander
  const deckTop = spec.groups ? 22 : offers.length ? 9 : slips.length ? -12.5 + optionRows * 5.8 + 6.5 : -5;
  if (hasDeck) {
    const per = 8;
    deck.forEach((dc, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, deck.length - row * per);
      const xs = rowX(inRow, 9.9);
      loose.push({ uid: dc.uid, card: dc.card, x: xs[i - row * per], z: deckTop + row * 13.4, scale: 0.76, from: "deck", dim: !spec.deck.enabled(dc) && !spec.deck.selected.includes(dc.uid) });
    });
  }
  // Geschnitzte Figuren (Schrein, erstes Totem): eine Reihe in der Tischmitte, darunter je ein Namensschild
  const figs = (spec.figures || []).map((fg, i, all) => ({ ...fg, x: rowX(all.length, 26)[i], z: 0 }));
  // Waren des Händlers mit Preiszettel
  const wareX = rowX((spec.wares || []).length, 21);
  const wares = (spec.wares || []).map((w, i) => ({ ...w, x: wareX[i], z: -2 })).filter((w) => !w.sold);
  const notes = [
    {
      id: "blatt", x: spec.fire ? -9 : 0, z: -29, w: spec.fire ? 46 : 62, h: 19,
      lines: [
        { text: spec.title, size: 1.45 },
        { text: spec.intro, size: 0.86, wrap: true },
        ...(spec.lines || []).map((l) => ({ text: l, size: 0.8, wrap: true })),
        ...(spec.confirm ? [{ text: `Siegelstempel: ${spec.confirm.label}`, size: 0.78 }] : []),
      ],
    },
    ...slips.map((s) => ({ id: s.id, x: s.x, z: s.z, w: s.w, h: s.h, lines: [{ text: s.label, size: 1 }], mark: !!s.on, dim: !!s.dim, click: true })),
    ...titles.map((t) => ({ id: t.id, x: t.x, z: t.z, w: 14, h: 4.2, lines: [{ text: t.text, size: 1 }], dim: true })),
    ...wares.map((w) => ({ id: `preis:${w.id}`, x: w.x, z: w.z + 10, w: 15, h: 5, lines: [{ text: `${w.price} Splitter`, size: 1 }], dim: w.dim, click: true })),
    ...figs.map((fg) => ({ id: fg.id, x: fg.x, z: fg.z + 11.5, w: 22, h: 7.6, lines: [{ text: fg.label, size: 1.2 }, { text: fg.sub, size: 0.85 }], click: true })),
    ...(spec.leave ? [{ id: "weiter", x: 50, z: -14, w: 19, h: 5.4, ry: -0.06, lines: [{ text: spec.leave.label, size: 1 }], click: true }] : []),
  ];
  const P = view.players;
  const model = {
    ...stageModel({ stage: "scene", zirkel, seat: you, myTurn: true, oppTurn: false }),
    me: { bones: 0, third: 0, deck: deck.length, items: player.items || [], totems: totemsOnTable(player, zirkel) },
    opp: { items: P[opp].itemCount ?? (P[opp].items || []).length, deck: P[opp].deckSize ?? 0, totems: totemsOnTable(P[opp], zirkel) },
    itemNames: Object.fromEntries(Object.keys(de.items).map((id) => [id, de.items[id]?.name || id])),
    loose,
    notes,
    wares: wares.map((w) => ({ id: w.id, name: de.items[w.item].name, x: w.x, z: w.z })),
    fire: spec.fire ? { x: 25, z: -29 } : null,
    choices: figs.map((fg) => ({ id: fg.id, kind: fg.kind, label: fg.label, x: fg.x, z: fg.z })),
  };
  const timer = timers?.[you];
  const enabledUids = hasDeck ? deck.filter((dc) => spec.deck.enabled(dc)).map((dc) => dc.uid) : [];
  const picked = [...(spec.deck?.selected || []), ...offers.filter((o) => o.on).map((o) => o.uid)];

  const confirm = () => {
    if (!spec.confirm) return;
    if (!spec.confirm.ready) { flash(spec.confirm.why || "Das geht noch nicht."); return; }
    room.pressSeal();
    spec.confirm.run();
  };

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how) => {
    if (!p) return;
    if (p.type === "loose") {
      const offer = offers.find((o) => o.uid === p.uid);
      const dc = deck.find((x) => x.uid === p.uid);
      if (how === "context") {
        const card = offer ? (offer.faceDown ? null : offer.card) : dc ? dc.card : p.uid === "blickpunkt" ? spec.shown : null;
        if (card) setDetail(card);
        return;
      }
      if (offer) offer.run();
      else if (dc && spec.deck) {
        if (spec.deck.enabled(dc) || spec.deck.selected.includes(dc.uid)) { sound.play("draw"); spec.deck.toggle(dc.uid); } else sound.play("error");
      }
      return;
    }
    if (how !== "click") return;
    // Figur oder ihr Namensschild anklicken: dieses Totem nehmen
    const fig = p.type === "choice" || p.type === "note" ? figs.find((x) => x.id === p.id) : null;
    if (fig) { fig.run(); return; }
    if (p.type === "note") {
      if (p.id === "weiter") { spec.leave?.run(); return; }
      if (String(p.id).startsWith("preis:")) { wares.find((w) => `preis:${w.id}` === p.id)?.run(); return; }
      const s = slips.find((x) => x.id === p.id);
      if (s && !s.dim) { sound.play("draw"); s.run(); } else if (s) sound.play("error");
    } else if (p.type === "ware") wares.find((w) => w.id === p.id)?.run();
    else if (p.type === "seal") confirm();
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    const fig = p?.type === "choice" || p?.type === "note" ? figs.find((x) => x.id === p.id) : null;
    if (fig) content = T(`${fig.label} · ${fig.sub}`, fig.tip, "Anklicken: dieses Totem nehmen.");
    else if (p?.type === "note") {
      const s = slips.find((x) => x.id === p.id);
      const w = wares.find((x) => `preis:${x.id}` === p.id);
      if (s?.tip) content = T(s.label, s.tip);
      else if (w) content = T(de.items[w.item].name, de.items[w.item].desc);
      else if (p.id === "weiter") content = T(spec.leave?.label || "", "Den Ort verlassen und zurück zur Karte.");
    } else if (p?.type === "ware") {
      const w = wares.find((x) => x.id === p.id);
      if (w) content = T(`${de.items[w.item].name} · ${w.price} Splitter`, de.items[w.item].desc, w.dim ? (player.items.length >= MAX_ITEMS ? "Deine Taschen sind voll." : "Dafür reichen deine Splitter nicht.") : "Anklicken: kaufen.");
    } else if (p?.type === "seal") content = spec.confirm ? T(spec.confirm.label, spec.confirm.ready ? "Stempel anklicken oder Leertaste." : spec.confirm.why) : null;
    else if (p?.type === "deck") content = T(`Dein Deck: ${deck.length} Karten`);
    else if (p?.type === "totem" && p.owner === "me") {
      const t = [player.totems?.tribe, player.totems?.lane, player.totems?.side].filter(Boolean)[p.index];
      if (t) content = T(totemText(t.head, t.base, zirkel), `${de.totems.base}: ${baseName(t.base)}`);
    } else if (p?.type === "hourglass" && timer) content = T(`Noch ${Math.ceil(timeLeft(timer, clockOffset) / 1000)} s`);
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };
  useEffect(() => {
    room.setHandlers({ onIntent: (p, how) => handlers.current.intent(p, how), onHover: (p, at) => handlers.current.hover(p, at) });
    room.setPose("brett");
    return () => { room.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  useEffect(() => {
    room.sync(model);
    room.setUi({ pickable: [...enabledUids, ...offers.map((o) => o.uid)], picked, canEnd: !!spec.confirm?.ready, choosable: figs.map((fg) => String(fg.id)) });
    room.setTimer(timer ? { remaining: timeLeft(timer, clockOffset), total: timer.total, paused: !!timer.paused, key: run ? `run:${view.path.map.pathNo}` : `s:${sceneKey}` } : null);
  });

  const keyRef = useRef(/** @type {any} */ (null));
  keyRef.current = (e) => {
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "Escape") { if (!detail) setPaused((v) => !v); return; }
    if (paused || detail) return;
    if (e.key === " " || e.code === "Space") { e.preventDefault(); confirm(); }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  return (
    <>
      <button type="button" className="st-menu-btn" onClick={() => setPaused(true)} aria-label="Menü (Esc)">Menü</button>
      {(toast || status) && <div className="st-toast ss-paper" role="status">{toast || status}</div>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {paused && (
        <TablePause
          title={spec.title}
          sub={run ? run.sub : <>Pfad {view.path.map.pathNo} · {names[0]} {view.wins[0]} : {view.wins[1]} {names[1]} · {de.ui.shards}: {player.shards}</>}
          surrenderText={run ? "Den ganzen Run aufgeben?" : undefined}
          onClose={() => setPaused(false)}
          onSurrender={() => send({ type: "surrender" })}
          onFallback={onFallback}
          help={<>
            Karte oder Zettel anklicken: wählen · Siegelstempel oder Leertaste: ausführen, was das Blatt in der letzten
            Zeile nennt · Zettel am rechten Rand: weitergehen · Rechtsklick (oder lange drücken): Karte ansehen.
          </>}
        />
      )}
    </>
  );
}
