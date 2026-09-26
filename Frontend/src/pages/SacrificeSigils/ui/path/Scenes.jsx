// ui/path/Scenes.jsx — die Knoten-Szenen der Pfad-Phase (je eine kleine Szene).
import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../card/Card.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { Shard } from "../icons/GameIcons.jsx";
import DeckPicker from "./DeckPicker.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { CAMPFIRE_RISK, MIN_DECK } from "../../data/events.js";
import { MAX_ITEMS } from "../../data/items.js";
import { TRIBE_IDS } from "../../data/tribes.js";
import { de } from "../../i18n/de.js";
import { particles } from "../anim/particles.js";
import { sound } from "../../audio/sound.js";
import { totemText } from "../common/totemText.js";

function SceneFrame({ title, intro, children, actions }) {
  return (
    <div className="ss-paper p-4 md:p-6 max-w-[980px] mx-auto ss-fade-in">
      <p className="ss-title !text-[var(--ink)] text-2xl">{title}</p>
      {intro && <p className="opacity-80 mb-3">{intro}</p>}
      {children}
      {actions && <div className="flex flex-wrap gap-3 justify-center mt-4">{actions}</div>}
    </div>
  );
}

/** @param {{ scene: any, deck: any[], player: any, act: (op: string, extra?: any) => Promise<any> }} props */
export function CardChoiceScene({ scene, act }) {
  const [revealed, setRevealed] = useState(/** @type {number|null} */ (null));
  const hidden = scene.variant === "hidden";
  const variant = de.nodes.cardChoice.variants[scene.variant];
  return (
    <SceneFrame title={de.nodes.cardChoice.name} intro={`Wähle 1 aus 3${variant ? ` – ${variant}` : ""}${scene.costType ? ` (${de.costs[scene.costType].name})` : ""}.`}>
      <div className="flex flex-wrap gap-5 justify-center py-3">
        {scene.offers.map((id, i) => (
          <div key={i} className="transition-transform hover:-translate-y-2" style={{ transform: `rotate(${(i - 1) * 4}deg)` }}>
            <Card card={id ? resolveCard(id, [], `o${i}`) : null} faceDown={hidden || !id} width={150} glow onClick={async () => { setRevealed(i); sound.play("draw"); await act("pick", { index: i }); }} tabIndex={0} selected={revealed === i} />
          </div>
        ))}
      </div>
      {!scene.offers.length && <div className="text-center"><button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button></div>}
    </SceneFrame>
  );
}

export function FuseScene({ deck, act }) {
  const [sel, setSel] = useState(/** @type {string[]} */ ([]));
  const counts = useMemo(() => {
    const m = new Map();
    for (const dc of deck) m.set(dc.baseId, (m.get(dc.baseId) || 0) + 1);
    return m;
  }, [deck]);
  const first = deck.find((d) => d.uid === sel[0]);
  const hasPair = [...counts.values()].some((n) => n >= 2);
  return (
    <SceneFrame
      title={de.nodes.fuse.name}
      intro="Nadel und Faden: Zwei gleiche Karten werden zu einer. Angriff und Leben werden addiert, Sigils vereint (max. 4, Doppelte werden stärker)."
      actions={<>
        <button type="button" className="ss-seal" disabled={sel.length !== 2} onClick={() => { sound.play("needle"); act("fuse", { a: sel[0], b: sel[1] }); }}>Zusammennähen</button>
        <button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>
      </>}
    >
      {!hasPair && <p className="text-center text-[var(--wax-red)] mb-2">Du hast keine zwei gleichen Karten.</p>}
      <DeckPicker
        deck={deck}
        selected={sel}
        isEnabled={(dc) => counts.get(dc.baseId) >= 2 && (!first || dc.baseId === first.baseId)}
        onToggle={(uid) => setSel((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : s.length < 2 ? [...s, uid] : s))}
      />
    </SceneFrame>
  );
}

export function TransferScene({ deck, act }) {
  const [donor, setDonor] = useState(/** @type {string|null} */ (null));
  const [sigil, setSigil] = useState(/** @type {string|null} */ (null));
  const [target, setTarget] = useState(/** @type {string|null} */ (null));
  const d = deck.find((x) => x.uid === donor);
  const small = deck.length <= MIN_DECK;
  const step = !donor ? 1 : !sigil ? 2 : 3;
  return (
    <SceneFrame
      title={de.nodes.transfer.name}
      intro={small ? "Dein Deck hat nur noch 8 Karten – hier darfst du nichts opfern." : step === 1 ? "1. Wähle die Karte, die du opferst." : step === 2 ? "2. Wähle das Sigil, das sich lösen soll." : "3. Wähle die Karte, in die es sich einbrennt (max. 4 Sigils)."}
      actions={<>
        <button type="button" className="ss-seal" disabled={!donor || !sigil || !target} onClick={() => { sound.play("fire"); act("transfer", { donor, sigil, target }); }}>Einbrennen</button>
        <button type="button" className="ss-btn" onClick={() => { setDonor(null); setSigil(null); setTarget(null); }}>Neu wählen</button>
        <button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>
      </>}
    >
      {step === 2 && d && (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {d.card.sigils.filter((s) => parseSigil(s).id !== "fluchmal").map((s) => (
            <button key={s} type="button" className={`ss-btn ss-btn-sm ${sigil === s ? "!border-[var(--wax-red-light)]" : ""}`} onClick={() => setSigil(s)}>
              <SigilIcon sigil={s} size={22} /> {de.sigils[parseSigil(s).id].name}
            </button>
          ))}
        </div>
      )}
      {!small && (
        <DeckPicker
          deck={deck}
          selected={[donor, target].filter(Boolean)}
          isEnabled={(dc) => (step === 1 ? dc.card.sigils.some((s) => parseSigil(s).id !== "fluchmal") : step === 3 ? dc.uid !== donor && dc.card.sigils.length < 4 : dc.uid === donor)}
          onToggle={(uid) => { if (step === 1) setDonor(uid); else if (step === 3) setTarget(uid); }}
        />
      )}
    </SceneFrame>
  );
}

export function CampfireScene({ scene, deck, act }) {
  const [sel, setSel] = useState(/** @type {string|null} */ (scene.target));
  const fireRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const uid = scene.target || sel;
  const card = deck.find((d) => d.uid === uid);
  const risk = CAMPFIRE_RISK[scene.uses];
  useEffect(() => {
    const el = fireRef.current;
    if (!el) return undefined;
    const t = setInterval(() => {
      const r = el.getBoundingClientRect();
      particles.burst("ember", r.left + r.width / 2, r.top + r.height * 0.7, { n: 4, spread: 1.4 });
    }, 420);
    return () => clearInterval(t);
  }, []);
  const boost = (stat) => {
    sound.play("fire");
    act("boost", { uid, stat });
  };
  return (
    <SceneFrame
      title={de.nodes.campfire.name}
      intro="Halte eine Karte über die Flammen: +1 Angriff oder +2 Leben. Du darfst wiederholen – aber das Feuer wird gierig."
      actions={<button type="button" className="ss-btn" onClick={() => act("leave")}>{de.ui.leave}</button>}
    >
      <div className="grid md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="flex flex-col items-center">
          <div className="relative" style={{ animation: "ss-flame 3s ease-in-out infinite" }}>
            {card ? <Card card={card.card} width={150} /> : <Card faceDown width={150} />}
          </div>
          <div ref={fireRef} className="relative w-40 h-16 -mt-2" aria-hidden>
            <div className="absolute inset-x-6 bottom-2 h-3 rounded-full bg-[#2a1a0e]" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="absolute bottom-3" style={{ left: 42 + i * 20, width: 22, height: 40 - i * 6, borderRadius: "50% 50% 45% 45% / 65% 65% 35% 35%", background: "radial-gradient(ellipse at 50% 75%, #fff6d8 0 15%, #ffd98a 35%, #f2b54a 55%, rgb(224 118 42 / 0.5) 80%, transparent)", animation: `ss-flame ${1.4 + i * 0.3}s ease-in-out infinite`, transformOrigin: "50% 100%" }} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {risk !== undefined ? (
            <p className={`text-lg ${risk > 0 ? "text-[var(--wax-red)]" : ""}`}>
              {risk === 0 ? "Der erste Gang ist sicher." : <><b>Risiko: {Math.round(risk * 100)} %</b>, dass die Karte verbrennt.</>}
            </p>
          ) : <p>Das Feuer ist heruntergebrannt.</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="ss-seal" disabled={!uid || risk === undefined} onClick={() => boost("attack")}>+1 Angriff</button>
            <button type="button" className="ss-seal" disabled={!uid || risk === undefined} onClick={() => boost("health")}>+2 Leben</button>
          </div>
          <p className="text-sm opacity-70">Nächste Stufen: {CAMPFIRE_RISK.slice(scene.uses + 1).map((r) => `${Math.round(r * 100)} %`).join(" → ") || "–"}</p>
        </div>
      </div>
      {!scene.target && (
        <>
          <p className="mt-4 mb-1 text-center">Welche Karte hältst du ins Feuer?</p>
          <DeckPicker deck={deck} selected={sel ? [sel] : []} onToggle={setSel} />
        </>
      )}
    </SceneFrame>
  );
}

export function RemoveScene({ deck, act }) {
  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  const small = deck.length <= MIN_DECK;
  return (
    <SceneFrame
      title={de.nodes.remove.name}
      intro={small ? "Dein Deck hat nur noch 8 Karten." : "Diese Karte verschwindet für immer aus deinem Deck."}
      actions={<>
        <button type="button" className="ss-seal" disabled={!sel || small} onClick={() => { sound.play("death"); act("remove", { uid: sel }); }}>Entfernen</button>
        <button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>
      </>}
    >
      {!small && <DeckPicker deck={deck} selected={sel ? [sel] : []} onToggle={setSel} />}
    </SceneFrame>
  );
}

export function MerchantScene({ scene, player, act }) {
  return (
    <SceneFrame
      title={de.nodes.merchant.name}
      intro={`Ein Karren voller Kuriositäten. Du hast ${player.shards} Splitter und trägst ${player.items.length}/${MAX_ITEMS} Items.`}
      actions={<button type="button" className="ss-btn" onClick={() => act("leave")}>{de.ui.leave}</button>}
    >
      <div className="grid sm:grid-cols-3 gap-3">
        {scene.offers.map((o, i) => (
          <div key={i} className={`ss-panel p-4 text-[var(--bone)] ${o.sold ? "opacity-40" : ""}`}>
            <p className="ss-title text-lg">{de.items[o.item].name}</p>
            <p className="text-sm ss-dim min-h-[3em]">{de.items[o.item].desc}</p>
            <button type="button" className="ss-btn ss-btn-sm mt-2 w-full" disabled={o.sold || player.shards < o.price || player.items.length >= MAX_ITEMS} onClick={() => { sound.play("coins"); act("buy", { index: i }); }}>
              {o.sold ? "Verkauft" : <><Shard size={14} /> {o.price}</>}
            </button>
          </div>
        ))}
      </div>
      {player.items.length > 0 && <p className="mt-3 text-sm">Deine Items: {player.items.map((i) => de.items[i].name).join(", ")}</p>}
    </SceneFrame>
  );
}

export function ShrineScene({ scene, player, act }) {
  const [head, setHead] = useState(/** @type {number|null} */ (null));
  const [base, setBase] = useState(/** @type {number|null} */ (null));
  const offerLabel = (o) => (o.head
    ? (o.head.kind === "tribe" ? `${de.totems.tribeHead}: ${de.tribes[o.head.tribe].name}` : `${de.totems.laneHead}: ${de.totems.lane(o.head.lane)}`)
    : (o.base.kind === "sigil" ? `${de.totems.base}: ${de.sigils[o.base.sigil].name}` : `${de.totems.base}: ${de.totems.props[o.base.prop].name}`));
  const validPair = head !== null && base !== null && !(player.heads[head].kind === "tribe" && player.bases[base].kind !== "sigil");
  return (
    <SceneFrame
      title={de.nodes.shrine.name}
      intro="Ein Schnitzmesser liegt bereit. Nimm ein neues Teil und setze deine Totems zusammen."
      actions={<button type="button" className="ss-btn" onClick={() => act("leave")}>{de.ui.leave}</button>}
    >
      {!scene.taken && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {scene.offers.map((o, i) => (
            <button key={i} type="button" className="ss-panel p-3 text-left text-[var(--bone)] hover:brightness-110" onClick={() => { sound.play("seal"); act("take", { index: i }); }}>
              <p className="ss-title">{offerLabel(o)}</p>
              <p className="text-sm ss-dim">{o.base ? (o.base.kind === "sigil" ? de.sigils[o.base.sigil].desc : de.totems.props[o.base.prop].desc) : "Ein neuer Kopf für ein Totem."}</p>
            </button>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="ss-title !text-[var(--ink)]">Köpfe</p>
          {player.heads.map((h, i) => (
            <button key={i} type="button" className={`block w-full text-left px-2 py-1 border-b border-dashed border-black/20 ${head === i ? "bg-[#8e1b1b]/15" : ""}`} onClick={() => setHead(i)}>
              {h.kind === "tribe" ? `${de.totems.tribeHead}: ${de.tribes[h.tribe].name}` : `${de.totems.laneHead}: ${de.totems.lane(h.lane)}`}
            </button>
          ))}
        </div>
        <div>
          <p className="ss-title !text-[var(--ink)]">Basen</p>
          {player.bases.map((b, i) => (
            <button key={i} type="button" className={`flex items-center gap-2 w-full text-left px-2 py-1 border-b border-dashed border-black/20 ${base === i ? "bg-[#8e1b1b]/15" : ""}`} onClick={() => setBase(i)}>
              {b.kind === "sigil" && <SigilIcon sigil={b.sigil} size={18} />}
              {b.kind === "sigil" ? de.sigils[b.sigil].name : `${de.totems.props[b.prop].name} (nur Lane)`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 text-center">
        <button type="button" className="ss-seal" disabled={!validPair} onClick={() => { sound.play("creak"); act("assemble", { head, base }); }}>Totem zusammensetzen</button>
        {head !== null && base !== null && !validPair && <p className="text-sm text-[var(--wax-red)] mt-1">Lanen-Eigenschaften brauchen einen Lanenkopf.</p>}
      </div>
      <div className="mt-4 text-sm">
        <p className="ss-title !text-[var(--ink)]">Aktive Totems</p>
        {["tribe", "lane"].map((slot) => (
          <p key={slot}>{slot === "tribe" ? de.totems.tribeSlot : de.totems.laneSlot}: {player.totems[slot] ? totemText(player.totems[slot].head, player.totems[slot].base) : "–"}</p>
        ))}
      </div>
    </SceneFrame>
  );
}

export function CopyistScene({ scene, deck, act }) {
  const [sel, setSel] = useState(/** @type {string|null} */ (null));
  return (
    <SceneFrame
      title={de.nodes.copyist.name}
      intro={`Der Kopist zeichnet eine Karte nach. Die Kopie bekommt einen Makel: ${scene.flaw === "health" ? "−1 Leben" : "Kerzendocht 4"}.`}
      actions={<>
        <button type="button" className="ss-seal" disabled={!sel} onClick={() => { sound.play("draw"); act("copy", { uid: sel }); }}>Kopieren</button>
        <button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>
      </>}
    >
      <DeckPicker deck={deck} selected={sel ? [sel] : []} onToggle={setSel} isEnabled={(dc) => !CARDS[dc.baseId].unique} />
    </SceneFrame>
  );
}

export function EventScene({ scene, deck, player, act }) {
  const e = de.events[scene.event];
  const [sel, setSel] = useState(/** @type {string[]} */ ([]));
  const [pick, setPick] = useState(0);
  const [bet, setBet] = useState(Math.max(1, Math.floor(player.shards / 2)));
  const [tribe, setTribe] = useState(TRIBE_IDS[0]);
  const one = (uid) => setSel([uid]);
  const skip = <button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>;
  switch (scene.event) {
    case "faehrmann":
      return (
        <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" disabled={!sel.length} onClick={() => act("swap", { uid: sel[0] })}>{e.action}</button>{skip}</>}>
          <DeckPicker deck={deck} selected={sel} onToggle={one} isEnabled={(dc) => CARDS[dc.baseId].rarity !== "legendary"} />
        </SceneFrame>
      );
    case "tintenwitwe":
      return <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" onClick={() => act("accept")}>{e.action}</button><button type="button" className="ss-btn" onClick={() => act("decline")}>Ablehnen</button></>} />;
    case "knochenorakel":
      return (
        <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" disabled={sel.length !== 2 || deck.length - 1 < MIN_DECK} onClick={() => act("offer", { uids: sel, pick })}>{e.action}</button>{skip}</>}>
          <p className="text-center mb-2">Wähle deine Belohnung:</p>
          <div className="flex flex-wrap gap-3 justify-center mb-4">
            {(scene.offers || []).map((id, i) => <Card key={id} card={resolveCard(id, [], `or${i}`)} width={110} selected={pick === i} onClick={() => setPick(i)} tabIndex={0} />)}
          </div>
          <p className="text-center mb-2">Wähle zwei Karten für die Knochenschale:</p>
          <DeckPicker deck={deck} selected={sel} onToggle={(uid) => setSel((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : s.length < 2 ? [...s, uid] : s))} />
        </SceneFrame>
      );
    case "spiegelbrunnen":
      return (
        <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" disabled={!sel.length} onClick={() => act("mirror", { uid: sel[0] })}>{e.action}</button>{skip}</>}>
          <DeckPicker deck={deck} selected={sel} onToggle={one} isEnabled={(dc) => !CARDS[dc.baseId].unique} />
        </SceneFrame>
      );
    case "wachszieher":
      return <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" onClick={() => act("accept")}>{e.action}</button><button type="button" className="ss-btn" onClick={() => act("decline")}>Ablehnen</button></>} />;
    case "mondfinsternis":
      return (
        <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" disabled={!sel.length} onClick={() => act("choose", { uid: sel[0] })}>{e.action}</button>{skip}</>}>
          <DeckPicker deck={deck} selected={sel} onToggle={one} />
        </SceneFrame>
      );
    case "gluecksspieler":
      return (
        <SceneFrame title={e.name} intro={`${e.intro} Du hast ${player.shards} Splitter.`} actions={<><button type="button" className="ss-seal" disabled={player.shards < 1} onClick={() => { sound.play("coins"); act("bet", { amount: bet }); }}>{e.action}: {bet}</button><button type="button" className="ss-btn" onClick={() => act("leave")}>{de.ui.leave}</button></>}>
          {player.shards > 0 && <input type="range" min={1} max={player.shards} value={Math.min(bet, player.shards)} onChange={(ev) => setBet(Number(ev.target.value))} className="w-full accent-[#8e1b1b]" aria-label="Einsatz" />}
        </SceneFrame>
      );
    case "stammestreue":
      return (
        <SceneFrame title={e.name} intro={e.intro} actions={<><button type="button" className="ss-seal" onClick={() => act("choose", { tribe })}>{e.action}</button>{skip}</>}>
          <div className="flex flex-wrap gap-2 justify-center">
            {TRIBE_IDS.map((t) => {
              const n = deck.filter((dc) => dc.card.tribe === t).length;
              return <button key={t} type="button" className={`ss-btn ss-btn-sm ${tribe === t ? "!border-[var(--wax-red-light)] !text-[var(--candle)]" : ""}`} onClick={() => setTribe(t)}>{de.tribes[t].name} ({n})</button>;
            })}
          </div>
        </SceneFrame>
      );
    default:
      return <SceneFrame title="?" actions={skip} />;
  }
}
