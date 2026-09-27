// engine/rules.js — Hausregeln der NPCs und Bosse (Moorwanderung). Texte in i18n/de.js (run.rules.<id>).
//
// Eine Regel gilt für einen Sitz (`seat`, die NPC-Seite) und kann mitbringen:
//   aura         Sigil, das alle Karten dieses Sitzes zusätzlich tragen
//   auraIf(u)    Sigil nur für bestimmte Karten (wird bei jeder Abfrage neu geprüft)
//   deckDelta    Änderung der Deckgröße beim Deckbau (npc.js)
//   start(r, seat, rule)            einmal nach dem Austeilen
//   turnStart(r, seat, p, rule)     zu Beginn jedes Zugs (p = aktiver Spieler)
//   turnEnd(r, seat, p, rule)       am Ende jedes Zugs, nach Nachrücken und Abtauchen
//   unitMade(r, seat, u, rule)      wenn eine Karte dieses Sitzes aufs Feld kommt (Werte anpassen)
// Hooks verändern den Kampfzustand nur über den Resolver (battle.js) und zählen gegen das Ketten-Budget.
// `rule.count` darf eine Regel als eigenen Zähler benutzen (liegt im State, bleibt deterministisch).

/** Eigene Züge des Sitzes mitzählen (für „jeden dritten Zug“). */
function ownTurn(/** @type {any} */ rule) {
  rule.count = (rule.count || 0) + 1;
  return rule.count;
}

/** @type {Record<string, any>} */
export const RULES = {
  // ───── Auren ─────
  schlammbad: { aura: "tauchgang" },
  dornenhecke: { aura: "dornenkleid" },
  hinterlist: { aura: "hinterhalt" },
  grabesruhe: { aura: "markleicht" },
  irrlichter: { aura: "wanderer" },
  wattgang: { aura: "wattlaeufer" },
  schlickfeld: { aura: "schlick" },
  leuchtturm: { aura: "leuchtfeuer" },
  kraehenzug: { auraIf: (/** @type {any} */ u) => (u.health <= 1 ? "schwinge" : null) },
  panzerhaut: { auraIf: (/** @type {any} */ u) => (u.maxHealth >= 4 ? "panzer" : null) },
  giftzahn: { auraIf: (/** @type {any} */ u) => (u.attack === 1 ? "todesstachel" : null) },

  // ───── Werte ─────
  zaehesfleisch: {
    unitMade(_r, _seat, u) { u.health += 1; u.maxHealth += 1; },
  },
  raserei: {
    unitMade(_r, _seat, u) {
      u.attack += 1;
      u.health = Math.max(1, u.health - 1);
      u.maxHealth = Math.max(1, u.maxHealth - 1);
    },
  },

  // ───── Start ─────
  knochenhort: {
    start(r, seat) { r.gainBones(seat, 3, null); },
  },
  vorsprung: {
    deckDelta: -2,
    start(r, seat) { r.addScale(seat, 1, "rule"); },
  },
  bluternte: {
    start(r, seat) { r.P(seat).bloodBonus = 2; },
  },
  flutzeit: {
    // Gezeiten: der Kampf beginnt bei Flut (im Moor wirkungslos)
    start(r) { r.shiftTide(2, "rule"); },
  },

  // ───── Laufend ─────
  vorrat: {
    turnStart(r, seat, p) { if (p === seat) r.drawMain(seat, 1, "rule"); },
  },
  zufluss: {
    turnStart(r, seat, p) { if (p === seat) r.gainRes(seat, r.z.bonusResource || "wax", 1, null); },
  },
  sporenregen: {
    turnStart(r, seat, p, rule) {
      if (p !== seat || ownTurn(rule) % 2 !== 0) return;
      const back = r.row(seat, "back");
      const lane = back.findIndex((/** @type {any} */ u) => !u);
      if (lane >= 0) r.spawn(seat, "back", lane, `token_brut_${rule.tribe}`, "rule");
    },
  },
  glockengelaeut: {
    turnEnd(r, seat, p, rule) {
      if (p !== seat || ownTurn(rule) % 3 !== 0) return;
      r.emit({ type: "ruleFired", rule: "glockengelaeut", seat });
      r.advanceAll("glockenschlag");
    },
  },
  aschenregen: {
    turnEnd(r, seat, p, rule) {
      if (p !== seat || ownTurn(rule) % 3 !== 0) return;
      r.emit({ type: "ruleFired", rule: "aschenregen", seat });
      for (const u of [...r.row(1 - seat, "front")]) if (u && !u.submerged) r.damageUnit(u, 1, null, "rule");
    },
  },
};

export const RULE_IDS = Object.keys(RULES);
