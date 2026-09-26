// engine/items.js — Wirkung der Items im Kampf (je 1× nutzbar). Daten/Preise: data/items.js.
import { resolveCard } from "./cards.js";
import { parseSigil } from "./sigils/index.js";

/** @typedef {import("./battle.js").Resolver} Resolver */

/**
 * @param {Resolver} r
 * @param {number} p
 * @param {any} t { player?, zone?, lane?, sigil? }
 */
function enemyUnit(r, p, t) {
  const zone = t.zone === "back" ? "back" : t.zone === "front" ? "front" : null;
  if (!zone || !Number.isInteger(t.lane) || t.lane < 0 || t.lane > 3) return null;
  return r.row(1 - p, zone)[t.lane] || null;
}

/**
 * Item anwenden. Gibt einen Fehler-Schlüssel zurück oder null.
 * @param {Resolver} r @param {0|1} p @param {string} item @param {any} t
 * @returns {string|null}
 */
export function applyItemEffect(r, p, item, t) {
  const P = r.P(p);
  switch (item) {
    case "schere": {
      const u = enemyUnit(r, p, t);
      if (!u) return "badTarget";
      r.emit({ type: "item", player: p, item, target: u.uid });
      r.kill(u, "item", null);
      return null;
    }
    case "blutphiole":
      P.bloodBonus += 2;
      r.emit({ type: "item", player: p, item, amount: 2 });
      return null;
    case "knochensack":
      r.emit({ type: "item", player: p, item });
      r.gainBones(p, 4, null);
      return null;
    case "waagstein":
      r.emit({ type: "item", player: p, item });
      r.addScale(p, 1, "item");
      return null;
    case "kerzenstumpf":
      r.emit({ type: "item", player: p, item });
      r.gainWax(p, 3, null);
      return null;
    case "rabenfeder":
      r.emit({ type: "item", player: p, item });
      r.drawMain(p, 2, "item");
      return null;
    case "tintenfass": {
      const u = Number.isInteger(t.lane) ? r.row(1 - p, "front")[t.lane] : null;
      if (!u) return "badTarget";
      r.emit({ type: "item", player: p, item, target: u.uid });
      const copy = resolveCard(u.card.baseId, u.card.mods, r.newUid());
      r.addToHand(p, copy, "tintenfass");
      return null;
    }
    case "stundenglas": {
      const u = Number.isInteger(t.lane) ? r.row(1 - p, "front")[t.lane] : null;
      if (!u) return "badTarget";
      u.stunned = true;
      r.emit({ type: "item", player: p, item, target: u.uid });
      return null;
    }
    case "leimtopf": {
      const u = enemyUnit(r, p, t);
      if (!u) return "badTarget";
      u.glued = 2;
      r.emit({ type: "item", player: p, item, target: u.uid });
      return null;
    }
    case "pinzette": {
      const u = enemyUnit(r, p, t);
      if (!u) return "badTarget";
      const id = typeof t.sigil === "string" ? parseSigil(t.sigil).id : "";
      const i = u.sigils.findIndex((s) => parseSigil(s).id === id);
      if (i < 0) return "badSigil";
      const [removed] = u.sigils.splice(i, 1);
      if (id === "kerzendocht") u.wick = null;
      r.emit({ type: "item", player: p, item, target: u.uid, sigil: removed });
      return null;
    }
    case "gluehwurmglas":
      P.peek = true;
      r.emit({ type: "item", player: p, item });
      return null;
    case "moorlaterne": {
      const zone = t.zone === "back" ? "back" : "front";
      if (!Number.isInteger(t.lane) || t.lane < 0 || t.lane > 3 || r.row(p, zone)[t.lane]) return "badTarget";
      r.emit({ type: "item", player: p, item });
      r.spawn(p, zone, t.lane, "token_laterne", "item");
      return null;
    }
    default:
      return "noSuchItem";
  }
}
