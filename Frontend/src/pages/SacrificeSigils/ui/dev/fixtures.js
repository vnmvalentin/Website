// ui/dev/fixtures.js — nur im Dev-Build: feste Spielstände für die Pflicht-Screenshots (Runde 2, D2).
// Aufruf: /sacrifice-and-sigils/uebung?fixture=<name>. Im Produktions-Build wird dieses Modul nie geladen.
import { createMatch, applyAction, awaiting } from "../../engine/match.js";
import { aiAction } from "../../engine/ai/index.js";
import { createScene } from "../../engine/path.js";
import { EVENTS } from "../../data/events.js";
import { Resolver } from "../../engine/battle.js";
import { resolveCard } from "../../engine/cards.js";

const SCENES = ["cardChoice", "fuse", "transfer", "campfire", "remove", "merchant", "shrine", "copyist"];
export const FIXTURES = ["draft", "extras", "path", "battle", "sacrifice", "showcase", "interlude", "result", ...SCENES.map((k) => `scene:${k}`), ...EVENTS.map((e) => `event:${e}`)];

/**
 * @param {string} name  Präfix „gz-“ = derselbe Stand im Gezeiten-Zirkel (z. B. gz-battle, gz-extras, gz-scene:shrine)
 */
export function buildFixture(name) {
  const zirkel = name.startsWith("gz-") ? "gezeiten" : "moor";
  if (zirkel !== "moor") name = name.slice(3);
  let s = createMatch({ seed: "SHOTS", names: ["Zeichnerin", "KI (Normal)"], salt: "fixture", settings: { turnTimer: 0, zirkel } });
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
  else if (name === "sacrifice") {
    // Opferwahl prüfen: zwei eigene Karten auf dem Feld, eine 2-Blut-Karte vorn auf der Hand, schon gezogen
    run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
    const B = s.battle;
    const r = new Resolver(B);
    const P = B.players[0];
    for (const [zone, lane, id] of [["front", 0, "side_moorling"], ["front", 2, "stammlose_holzgolem"], ["back", 1, "side_moorling"]]) {
      P[zone][lane] = r.makeUnit(resolveCard(id, [], r.newUid()), 0, zone, lane);
    }
    P.hand.unshift(resolveCard("bestien_aschbaer", [], r.newUid()));
    P.drew = true;
  }
  else if (name === "showcase") {
    // Stilprobe des neuen Tischs (?fixture=showcase&tisch=neu): volles Brett mit allen Rahmen-Seltenheiten,
    // beide Hinterreihen besetzt, Waage im Vorteil, Knochen und Wachs vorhanden
    run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
    const B = s.battle;
    const r = new Resolver(B);
    const put = (p, zone, lane, id) => { B.players[p][zone][lane] = r.makeUnit(resolveCard(id, [], r.newUid()), p, zone, lane); };
    for (const p of [0, 1]) for (const zone of ["front", "back"]) B.players[p][zone].fill(null);
    put(0, "front", 0, "side_moorling");
    put(0, "front", 1, "bestien_mondluchs");
    put(0, "front", 2, "stammlose_holzgolem");
    put(0, "back", 1, "wurzelvolk_knorrstumpf");
    put(0, "back", 3, "nachtvoegel_sturmkauz");
    put(1, "front", 1, "kerzenwesen_wachsmaske");
    put(1, "front", 2, "bestien_grauerfuerst");
    put(1, "front", 3, "bestien_aschwolf");
    put(1, "back", 0, "gebeine_sargwaechter");
    put(1, "back", 2, "side_moorling");
    B.players[0].front[2].health = 2;
    B.players[0].hand.unshift(resolveCard("bestien_aschbaer", [], r.newUid()));
    B.players[0].bones = 4;
    B.players[0].wax = 3;
    B.players[1].bones = 2;
    B.players[0].drew = true;
    B.players[0].items = ["schere", "blutphiole", "moorlaterne"];
    B.players[1].items = ["leimtopf"];
    B.scale = 2;
  }
  else if (name === "attack4") {
    // Taktmessung (Rebuild Phase 2): vier eigene Angreifer — zwei treffen eine Karte, einer tötet, einer geht auf
    // die Waage. Schon gezogen, also genügt „Zug beenden“.
    run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
    const B = s.battle;
    const r = new Resolver(B);
    const put = (p, zone, lane, id) => { B.players[p][zone][lane] = r.makeUnit(resolveCard(id, [], r.newUid()), p, zone, lane); };
    for (const p of [0, 1]) for (const zone of ["front", "back"]) B.players[p][zone].fill(null);
    put(0, "front", 0, "kerzenwesen_wachsmaske");
    put(0, "front", 1, "stammlose_holzgolem");
    put(0, "front", 2, "kerzenwesen_wachsmaske");
    put(0, "front", 3, "stammlose_holzgolem");
    put(1, "front", 0, "wurzelvolk_knorrstumpf");
    put(1, "front", 1, "side_moorling");
    // Totems aus dem Spiel nehmen, damit die Werte der Karten gelten (sonst endet der Kampf vor dem vierten Stoß)
    for (const P of B.players) P.auras = {};
    B.players[0].drew = true;
    B.scale = 0;
  }
  else if (name === "oppturn") {
    // Zug des Gegenübers ansehen (Rebuild Phase 3, tools/tisch/gegenueber.cjs): nach dem eigenen Zugende zieht die KI,
    // opfert, legt eine Karte, benutzt vielleicht ein Item und stempelt. Mit &ki=1 aufrufen.
    run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
    const B = s.battle;
    const r = new Resolver(B);
    const put = (p, zone, lane, id) => { B.players[p][zone][lane] = r.makeUnit(resolveCard(id, [], r.newUid()), p, zone, lane); };
    for (const p of [0, 1]) for (const zone of ["front", "back"]) B.players[p][zone].fill(null);
    for (const P of B.players) P.auras = {};
    put(0, "front", 0, "stammlose_holzgolem");
    put(0, "back", 2, "wurzelvolk_knorrstumpf");
    put(1, "front", 1, "side_moorling");
    put(1, "back", 2, "side_moorling");
    B.players[1].hand = ["bestien_aschwolf", "bestien_mondluchs", "side_moorling"].map((id) => resolveCard(id, [], r.newUid()));
    B.players[1].items = ["leimtopf"];
    B.players[0].drew = true;
    B.scale = 0;
  }
  else if (name === "checks" || name === "lose" || name === "matchend") {
    // Prüfstände des neuen Tischs (tools/tisch/sonderfaelle.cjs):
    //   checks  Abwerfen bei Handlimit, Seher, Pinzette, Item ohne Ziel, Item auf eigenes Feld, Vorpreschen,
    //           Tauchen und Verwandlung am Zugende
    //   lose    die Waage steht kurz vor der Niederlage — nach dem eigenen Zugende gewinnt das Gegenüber
    run((x) => x.phase === "battle" && x.battle.turn >= 7 && x.battle.active === 0);
    const B = s.battle;
    const r = new Resolver(B);
    const put = (p, zone, lane, id) => { B.players[p][zone][lane] = r.makeUnit(resolveCard(id, [], r.newUid()), p, zone, lane); return B.players[p][zone][lane]; };
    for (const p of [0, 1]) for (const zone of ["front", "back"]) B.players[p][zone].fill(null);
    for (const P of B.players) P.auras = {};
    const me = B.players[0];
    if (name === "checks") {
      put(0, "front", 0, "tiefe_moraal");
      put(0, "front", 1, "bestien_grauwelpe").turns = 2;
      put(0, "back", 2, "gehoernte_sturmwidder");
      put(1, "front", 3, "bestien_grauerfuerst");
      me.hand = ["flatterer_nachtfalter", "side_moorling", "side_moorling", "side_moorling", "side_moorling", "side_moorling", "side_moorling", "side_moorling"]
        .map((id) => resolveCard(id, [], r.newUid()));
      me.wax = 3;
      me.drew = false;
      me.items = ["pinzette", "blutphiole", "moorlaterne"];
      B.scale = 0;
    } else {
      put(1, "front", 1, "bestien_grauerfuerst");
      put(1, "front", 2, "bestien_aschwolf");
      me.drew = true;
      B.scale = -4;
      // matchend: dem Gegenüber fehlt nur noch dieser Sieg — danach ist das Match vorbei (Ergebnis am Tisch)
      if (name === "matchend") s.wins[1] = s.settings.winsNeeded - 1;
    }
  }
  else if (name === "interlude") {
    // Rast nach dem Pfad (Rebuild Phase 4): möglichst so, dass der Spieler (Platz 0) entscheidet, wer beginnt
    run((x) => x.phase === "interlude" && x.interlude.chooser === 0);
    if (s.phase !== "interlude") {
      s = createMatch({ seed: "SHOTS", names: ["Zeichnerin", "KI (Normal)"], salt: "fixture", settings: { turnTimer: 0, zirkel } });
      run((x) => x.phase === "interlude");
    }
  }
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
