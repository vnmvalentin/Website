// ui/path/PathScreen.jsx — Pfad-Phase: Pergamentkarte, Wege werden mit Tusche gezeichnet, die Schachfigur rückt vor.
// Knoten wählen, dann die Szene des Knotens. Vom Gegner sieht man nur „denkt …“ bzw. „hat gewählt“.
import React, { useEffect, useMemo, useState } from "react";
import NodeIcon from "./NodeIcon.jsx";
import Card from "../card/Card.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import { CardChoiceScene, FuseScene, TransferScene, CampfireScene, RemoveScene, MerchantScene, ShrineScene, CopyistScene, EventScene } from "./Scenes.jsx";
import { reachable, STRANDS } from "../../engine/path.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { particles } from "../anim/particles.js";

const SCENES = {
  cardChoice: CardChoiceScene, fuse: FuseScene, transfer: TransferScene, campfire: CampfireScene, remove: RemoveScene,
  merchant: MerchantScene, shrine: ShrineScene, copyist: CopyistScene, event: EventScene,
};

const RESULT_TEXT = {
  gainCard: (e) => (e.cursed ? "Die Tintenwitwe lächelt. Eine verfluchte Zeichnung ist in deinem Deck." : "Neu in deinem Deck"),
  fused: () => "Zusammengenäht",
  transferred: () => "Das Sigil hat sich eingebrannt",
  campfireBoost: (e) => `Die Flammen stärken die Karte${e.next != null ? ` – nächstes Risiko ${Math.round(e.next * 100)} %` : ""}`,
  campfireLost: () => "Die Karte ist verbrannt …",
  removed: () => "Aus dem Deck getilgt",
  bought: (e) => `${de.items[e.item].name} gekauft`,
  copied: () => "Kopie angefertigt",
  ferried: () => "Der Fährmann hat getauscht",
  oracle: () => "Das Orakel hat gesprochen",
  eclipse: () => "Der Mond verdunkelt sich",
  gamble: (e) => (e.win ? `Gewonnen! +${e.amount} Splitter` : `Verloren: −${e.amount} Splitter`),
  deckChanged: () => "Dein Deck hat sich verändert",
  totemBuilt: () => "Totem geschnitzt",
  totemPart: () => "Neues Totem-Teil",
};

/** Kartengeometrie: Ebenen von unten nach oben, 3 Stränge nebeneinander. */
function nodePos(level, strand, levels) {
  const x = 90 + strand * 110;
  const y = 380 - (level + 1) * (300 / (levels + 1));
  return { x, y };
}

/**
 * @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], busy: boolean, timers: any, clockOffset: number, events: any[] }} props
 */
export default function PathScreen({ view, you, send, names, timers, clockOffset, events }) {
  const path = view.path;
  const map = path.map;
  const me = you ?? 0;
  const opp = 1 - me;
  const pp = you !== null ? path.players[you] : null;
  const opPath = path.players[opp];
  const player = view.players[me];
  const deck = player.deck || [];
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const [result, setResult] = useState(/** @type {any} */ (null));
  const [inkKey] = useState(() => Math.random());

  // Ergebnisse eigener Szenen kurz zeigen (Karte, Verbrennen, Nähen …)
  const lastBatch = events[events.length - 1];
  useEffect(() => {
    if (!lastBatch || you === null) return undefined;
    const ev = [...lastBatch.events].reverse().find((e) => RESULT_TEXT[e.type] && (e.player === undefined || e.player === you));
    if (!ev) return undefined;
    setResult({ ev, id: lastBatch.id });
    if (ev.type === "campfireLost") {
      sound.play("fire");
      particles.burst("ember", window.innerWidth / 2, window.innerHeight / 2, { n: 40, spread: 2 });
    } else if (ev.type === "fused") sound.play("needle");
    else if (ev.type === "transferred") sound.play("fire");
    else if (ev.type === "totemBuilt") particles.burst("shavings", window.innerWidth / 2, window.innerHeight / 2);
    const t = setTimeout(() => setResult((r) => (r?.id === lastBatch.id ? null : r)), 2600);
    return () => clearTimeout(t);
  }, [lastBatch, you]);

  const act = async (op, extra = {}) => {
    const res = await send({ type: "nodeAction", op, ...extra });
    if (!res?.ok) {
      sound.play("error");
      setErr(errorText(res?.error));
      setTimeout(() => setErr(null), 2600);
    }
    return res;
  };

  const choose = async (strand) => {
    sound.play("seal");
    const res = await send({ type: "chooseNode", strand });
    if (!res?.ok) setErr(errorText(res?.error));
  };

  const options = pp && !pp.scene && !pp.done ? reachable(pp.strand) : [];
  const piece = pp && pp.strand !== null ? nodePos(Math.max(0, pp.level - (pp.scene ? 0 : 1)), pp.strand, map.levels) : { x: 200, y: 372 };

  const edges = useMemo(() => {
    const out = [];
    for (let lv = 0; lv < map.levels; lv++) {
      for (let st = 0; st < STRANDS; st++) {
        const a = lv === 0 ? { x: 200, y: 372 } : nodePos(lv - 1, st, map.levels);
        const targets = lv === 0 ? [st] : reachable(st);
        if (lv === 0 && st !== 1) continue;
        for (const t of lv === 0 ? [0, 1, 2] : targets) {
          const b = nodePos(lv, t, map.levels);
          out.push({ key: `${lv}-${st}-${t}`, d: `M${a.x} ${a.y}C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}`, lv });
        }
      }
    }
    return out;
  }, [map.levels]);

  const Scene = pp?.scene ? SCENES[pp.scene.kind] : null;

  return (
    <div className="max-w-[1300px] mx-auto px-3 py-4 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
      <section className="space-y-4">
        {Scene ? (
          <Scene scene={pp.scene} deck={deck} player={player} act={act} />
        ) : (
          <div className="ss-paper p-3 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <p className="ss-title !text-[var(--ink)] text-2xl">Die Moorkarte · Pfad {map.pathNo}</p>
              {you !== null && timers?.[you] && <TurnTimer timer={timers[you]} clockOffset={clockOffset} />}
            </div>
            <p className="opacity-75 mb-2">{pp?.done ? "Dein Weg ist gegangen. Warte auf den anderen Zeichner …" : you === null ? "Die Zeichner wandern." : "Wähle einen erreichbaren Knoten."}</p>
            <svg viewBox="0 0 400 400" className="w-full max-w-[560px] mx-auto block" role="img" aria-label="Moorkarte">
              <defs>
                <filter id="mapInk"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="5" /><feDisplacementMap in="SourceGraphic" scale="2.2" /></filter>
              </defs>
              {/* Moor-Kritzeleien */}
              <g opacity="0.25" stroke="#1a1612" fill="none" strokeWidth="0.8">
                <path d="M20 330q20 -8 40 0t40 0M300 320q20 -8 40 0t40 0M30 120q15 -6 30 0t30 0M310 90q15 -6 30 0t30 0" />
                <path d="M40 200l6 -14l6 14M52 200l5 -10l5 10M340 220l6 -14l6 14M352 220l5 -10l5 10" />
              </g>
              <g filter="url(#mapInk)" key={inkKey}>
                {edges.map((e) => (
                  <path key={e.key} d={e.d} fill="none" stroke="#1a1612" strokeWidth="1.6" strokeDasharray="5 4" className="ss-draw-ink" style={{ "--len": 420, animationDelay: `${e.lv * 0.35}s` }} />
                ))}
              </g>
              <circle cx="200" cy="372" r="7" fill="#1a1612" />
              {map.nodes.map((row, lv) => row.map((node, st) => {
                const { x, y } = nodePos(lv, st, map.levels);
                const isOption = pp && pp.level === lv && options.includes(st);
                const visited = pp && pp.visited && lv < pp.level && pp.strand !== null;
                return (
                  <g key={`${lv}-${st}`} transform={`translate(${x} ${y})`} className={isOption ? "cursor-pointer" : ""} onClick={() => isOption && choose(st)} role={isOption ? "button" : undefined} tabIndex={isOption ? 0 : undefined} onKeyDown={(e) => isOption && (e.key === "Enter" || e.key === " ") && choose(st)} aria-label={`${de.nodes[node.type].name}${isOption ? " – wählbar" : ""}`}>
                    <circle r="19" fill={isOption ? "#f2dca8" : "#e6d8b6"} stroke={isOption ? "#8e1b1b" : "#1a1612"} strokeWidth={isOption ? 2.4 : 1.3} opacity={pp && lv < pp.level && !visited ? 0.5 : 1}>
                      {isOption && <animate attributeName="r" values="18;21;18" dur="1.6s" repeatCount="indefinite" />}
                    </circle>
                    <g transform="translate(-12 -12)"><NodeIcon type={node.type} size={24} /></g>
                    <title>{de.nodes[node.type].name}{node.variant && de.nodes.cardChoice.variants[node.variant] ? ` – ${de.nodes.cardChoice.variants[node.variant]}` : ""}{node.costType ? ` (${de.costs[node.costType].name})` : ""}</title>
                  </g>
                );
              }))}
              {/* Schachfigur */}
              {you !== null && (
                <g style={{ transform: `translate(${piece.x}px, ${piece.y - 16}px)`, transition: "transform 0.6s cubic-bezier(0.3, 0.7, 0.3, 1)" }}>
                  <path d="M-7 14h14l-2 -5h-10zM-4 9l1 -9h6l1 9zM0 0a4 4 0 100 -8a4 4 0 100 8z" fill="#8e1b1b" stroke="#1a1612" strokeWidth="1" />
                </g>
              )}
            </svg>
            <div className="flex flex-wrap gap-3 justify-center text-sm mt-2">
              {Object.entries(de.nodes).map(([k, n]) => (
                <span key={k} className="flex items-center gap-1 opacity-75"><NodeIcon type={k} size={16} /> {n.name}</span>
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-center text-[var(--wax-red-light)]" role="alert">{err}</p>}
      </section>
      <aside className="space-y-4">
        <div className="ss-panel p-4">
          <p className="ss-title">{names[opp]}</p>
          <p className="ss-dim text-sm">
            {opPath.done ? "Hat den Pfad beendet." : opPath.chosen?.[opPath.level] ? de.ui.opponentChose : de.ui.opponentThinking}
            {" "}· Ebene {Math.min(opPath.level + 1, map.levels)}/{map.levels}
          </p>
        </div>
        {you !== null && (
          <div className="ss-paper p-4">
            <DeckSummary cards={deck.map((d) => d.card)} title="Dein Deck" />
            <p className="text-sm mt-2">{de.ui.shards}: <b className="ss-num">{player.shards}</b> · {de.ui.items}: {player.items.map((i) => de.items[i].name).join(", ") || "–"}</p>
          </div>
        )}
      </aside>
      {result && (
        <div className="ss-banner ss-paper" style={{ animationDuration: "2.6s", top: "45%" }} role="status">
          <p className="ss-title !text-[var(--ink)] text-2xl mb-2">{RESULT_TEXT[result.ev.type](result.ev)}</p>
          {result.ev.card && <div className={`inline-block ${result.ev.type === "campfireLost" ? "ss-a-tear" : result.ev.type === "fused" ? "ss-a-land" : ""}`}><Card card={result.ev.card} width={150} /></div>}
          {result.ev.victimCard && <p className="text-sm mt-2 text-[var(--ink)]">{result.ev.victimCard.name} bekommt Kerzendocht 3.</p>}
        </div>
      )}
    </div>
  );
}
