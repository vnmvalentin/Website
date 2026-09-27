// ui/dev/fixtures.js — nur im Dev-Build: feste Spielstände für die Pflicht-Screenshots (Runde 2, D2).
// Aufruf: /sacrifice-and-sigils/uebung?fixture=<name>. Im Produktions-Build wird dieses Modul nie geladen.
import { createMatch, applyAction, awaiting } from "../../engine/match.js";
import { aiAction } from "../../engine/ai/index.js";
import { createScene } from "../../engine/path.js";
import { EVENTS } from "../../data/events.js";

const SCENES = ["cardChoice", "fuse", "transfer", "campfire", "remove", "merchant", "shrine", "copyist"];
export const FIXTURES = ["draft", "extras", "path", "battle", "result", ...SCENES.map((k) => `scene:${k}`), ...EVENTS.map((e) => `event:${e}`)];

/** @param {string} name */
export function buildFixture(name) {
  let s = createMatch({ seed: "SHOTS", names: ["Zeichnerin", "KI (Normal)"], salt: "fixture", settings: { turnTimer: 0 } });
  const rng = { rng: 7 };
  const run = (/** @type {(x: any) => boolean} */ done) => {
    for (let guard = 0; !done(s) && s.phase !== "over" && guard < 8000; guard++) {
      const p = awaiting(s)[0];
      const r = applyAction(s, aiAction(s, p, "normal", rng));
      s = r.error ? applyAction(s, { type: "timeout", player: p }).state : r.state;
    }
  };
  if (name === "draft") run((x) => x.phase === "draft" && x.draft.index >= 6 && awaiting(x)[0] === 0);
  else if (name === "extras") run((x) => x.phase === "extras" && awaiting(x)[0] === 0);
  else if (name === "path") run((x) => x.phase === "path");
  else if (name === "battle") run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
  else if (name === "result") run((x) => x.phase === "over");
  else if (name.startsWith("scene:") || name.startsWith("event:")) {
    run((x) => x.phase === "path");
    const [kind, id] = name.split(":");
    const node = kind === "event" ? { type: "event", event: id } : id === "cardChoice" ? { type: "cardChoice", variant: "normal" } : { type: id };
    const pp = s.path.players[0];
    s.players[0].shards = 9;
    pp.scene = createScene(s, 0, node, pp.level, 1);
  }
  return s;
}
