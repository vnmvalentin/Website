// ui/path/PathScreen.jsx — Pfad-Phase: Pergamentkarte des Bioms (PathMap), die Holzfigur rückt vor.
// Knoten wählen, dann die Szene des Knotens. Vom Gegner sieht man nur „denkt …“ bzw. „hat gewählt“.
import React, { useEffect, useRef, useState } from "react";
import PathMap from "./PathMap.jsx";
import PathMap3D from "./PathMap3D.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import Card from "../card/Card.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import DeckSummary from "../common/DeckSummary.jsx";
import { CardChoiceScene, FuseScene, TransferScene, CampfireScene, RemoveScene, MerchantScene, ShrineScene, CopyistScene, EventScene } from "./Scenes.jsx";
import { BIOMES, biomeFor } from "../../data/modes/moorwanderung/biomes.js";
import { usePrefs } from "../prefs.js";
import { de, errorText } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { particles } from "../anim/particles.js";
import { useTableStage, useActiveTableScene } from "../battle/table3d/tableStage.js";

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
  pathFlaw: (e) => `Niederlage: eine Karte bekommt bis zum Ende des Pfads ${e.sigil.startsWith("kerzendocht") ? "Kerzendocht 3" : "Treibgut"}`,
  wreck: (e) => (e.item ? `Im Wrack gefunden: ${de.items[e.item].name}` : e.shards ? `Taschen voll – ${e.shards} Splitter statt eines Items` : "Aus dem Wrack kam etwas mit. Eine verfluchte Zeichnung ist in deinem Deck."),
  tideBound: (e) => `Die Karte gehört jetzt den Gezeiten (${e.tide === "high" ? de.tide.highShort : de.tide.lowShort}) und ist stärker`,
};

/**
 * @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[], busy: boolean, timers: any, clockOffset: number, events: any[],
 *   hideOpponent?: boolean, extraScenes?: Record<string, any> }} props
 *   hideOpponent/extraScenes: Moorwanderung (Fortschritt der Mitspieler steht in der eigenen Leiste; eigene Szenen)
 */
export default function PathScreen({ view, you, send, names, timers, clockOffset, events, hideOpponent = false, extraScenes }) {
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
  const prefs = usePrefs();
  // Duellmodus: Biom nur als Optik (Pfad n → n-tes Biom des Zirkels); Moorwanderung: Biom kommt vom Server
  const biome = (path.biome && BIOMES.find((x) => x.id === path.biome)) || biomeFor(view.settings.zirkel || "moor", map.pathNo - 1).biome;
  const cycle = path.biome ? path.cycle || 0 : 0;

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

  // Karte rollt sich wieder auf, wenn eine Szene endet
  const inScene = !!pp?.scene;
  const wasInScene = useRef(inScene);
  useEffect(() => {
    if (wasInScene.current && !inScene) sound.play("unroll");
    wasInScene.current = inScene;
  }, [inScene]);

  const Scene = pp?.scene ? (extraScenes?.[pp.scene.kind] || SCENES[pp.scene.kind]) : null;
  // 3D-Tisch: die Karte liegt als eigenes Pergament mit Holzmarken auf dem Tisch (bleibt auch hinter einer Szene liegen)
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  useTableStage(Scene ? "scene" : "map", { zirkel: view.settings.zirkel || "moor", anchor: rootRef, mapKey: `${map.pathNo}-${biome?.id || ""}-${cycle}` });
  const table = useActiveTableScene();
  useEffect(() => () => table?.setPathMap(null), [table]);

  return (
    <div ref={rootRef} className="max-w-[1600px] mx-auto px-3 py-4 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
      <section className="space-y-4">
        {Scene ? (
          <div className="ss-scene-in" key={`scene-${pp.level}-${pp.scene.kind}`}><Scene scene={pp.scene} deck={deck} player={player} act={act} zirkel={view.settings.zirkel} others={view.others} /></div>
        ) : (
          <div className="space-y-2 ss-map-in" key={`map-${map.pathNo}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="ss-dim">{pp?.done ? "Dein Weg ist gegangen. Warte auf die anderen Zeichner …" : you === null ? "Die Zeichner wandern." : "Wähle einen erreichbaren Ort – die Vorschau zeigt, was dort wartet."}</p>
              {you !== null && timers?.[you] && <TurnTimer timer={timers[you]} clockOffset={clockOffset} />}
            </div>
            {table
              ? <PathMap3D scene={table} map={map} pp={pp} onChoose={choose} biome={biome} cycle={cycle} subtitle={`Pfad ${map.pathNo} · Ebene ${Math.min((pp?.level ?? 0) + 1, map.levels)}/${map.levels}`} reduced={prefs.reduceMotion} />
              : <PathMap map={map} pp={pp} onChoose={choose} biome={biome} cycle={cycle} subtitle={`Pfad ${map.pathNo} · Ebene ${Math.min((pp?.level ?? 0) + 1, map.levels)}/${map.levels}`} reduced={prefs.reduceMotion} />}
          </div>
        )}
        {err && <p className="text-center text-[var(--wax-red-light)]" role="alert">{err}</p>}
      </section>
      <aside className="space-y-4 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto lg:pr-1">
        {!hideOpponent && <div className="ss-panel p-4">
          <p className="ss-title">{names[opp]}</p>
          <p className="ss-dim text-sm">
            {opPath.done ? "Hat den Pfad beendet." : opPath.chosen?.[opPath.level] ? de.ui.opponentChose : de.ui.opponentThinking}
            {" "}· Ebene {Math.min(opPath.level + 1, map.levels)}/{map.levels}
          </p>
        </div>}
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
          {result.ev.card && (
            <div className={`relative inline-block ${result.ev.type === "campfireLost" ? "ss-a-tear" : result.ev.type === "fused" ? "ss-a-land" : ""}`}>
              <Card card={result.ev.card} width={150} />
              {result.ev.type === "transferred" && <span className="absolute left-1/2 top-1/3 ss-a-burnin" aria-hidden><SigilIcon sigil={result.ev.sigil} size={56} /></span>}
            </div>
          )}
          {result.ev.victimCard && <p className="text-sm mt-2 text-[var(--ink)]">{result.ev.victimCard.name} bekommt Kerzendocht 3.</p>}
        </div>
      )}
    </div>
  );
}
