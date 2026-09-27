// ui/run/RunScenes.jsx — Knoten-Szenen, die es nur in der Moorwanderung gibt (Späherturm; Belohnung folgt mit Phase 2).
import React from "react";
import Card from "../card/Card.jsx";
import Seals from "./Seals.jsx";
import { resolveCard, CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

function Frame({ title, intro, children, actions }) {
  return (
    <div className="ss-paper p-5 md:p-7 space-y-4">
      <p className="ss-title !text-[var(--ink)] text-2xl">{title}</p>
      {intro && <p>{intro}</p>}
      {children}
      {actions && <div className="flex flex-wrap gap-3 justify-center">{actions}</div>}
    </div>
  );
}

/** Belohnung nach einem Kampf: 1 aus 3 Karten, dazu Splitter (und bei Elite/Boss ein Item, schon eingesteckt). */
export function RewardScene({ scene, act }) {
  const kind = scene.fightKind;
  return (
    <Frame
      title={de.run.rewardTitle[kind]}
      intro={`${de.run.rewardHint[kind]} +${scene.shards} Splitter${scene.item ? ` · Item: ${de.items[scene.item].name}` : ""}.`}
      actions={<button type="button" className="ss-btn" onClick={() => act("skip")}>{de.ui.skip}</button>}
    >
      <div className="flex flex-wrap gap-4 justify-center">
        {scene.offers.map((id, i) => (
          <Card key={`${id}${i}`} card={resolveCard(id, [], `rw${i}`)} width={150} onClick={() => { sound.play("draw"); act("pick", { index: i }); }} tabIndex={0} />
        ))}
      </div>
    </Frame>
  );
}

/** Späherturm: einen Mitspieler wählen, seine öffentlich bekannten Karten ansehen. */
export function ScoutScene({ scene, act, others = [] }) {
  const r = scene.report;
  return (
    <Frame title={de.nodes.scout.name} intro="Vom Turm aus sieht man weit übers Moor – und auf fremde Tische." actions={<button type="button" className="ss-btn" onClick={() => act("leave")}>{de.ui.leave}</button>}>
      <div className="flex flex-wrap gap-2 justify-center">
        {others.map((o) => (
          <button key={o.q} type="button" className={`ss-btn ss-btn-sm ${scene.looked === o.q ? "!border-[var(--wax-red-light)] !text-[var(--candle)]" : ""}`} onClick={() => act("look", { target: o.q })}>
            {o.name}{o.alive ? "" : " (ausgeschieden)"}
          </button>
        ))}
      </div>
      {r && (
        <div className="space-y-2">
          <p className="flex items-center gap-2"><b>{r.name}</b> <Seals left={r.seals} total={r.sealsTotal} /> · {r.deckSize} Karten im Deck</p>
          {Object.keys(r.publicCards).length ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.keys(r.publicCards).filter((id) => CARDS[id]).map((id) => <Card key={id} card={resolveCard(id, [], `sc${id}`)} width={92} />)}
            </div>
          ) : <p className="text-center opacity-70">{de.run.noPublic}</p>}
        </div>
      )}
    </Frame>
  );
}
