// engine/sigils/index.js — alle Sigils als Datenobjekte.
//
// Jedes Sigil: { id, iconId, category, power, maxLevel?, merge?, aura?, flags?, hooks }
// Name, Kurztext und Beispiel stehen in i18n/de.js (sigils.<id>) — die Engine ist sprachneutral.
//
// Hooks bekommen den Kampf-Kontext `ctx` (battle.js → makeCtx) und mutieren über dessen Helfer den Arbeits-Klon
// des States; jedes sichtbare Ergebnis wird als Ereignis per ctx.emit gemeldet. Rein passive Schlüsselwörter
// (Schwinge, Hochwuchs, Panzer …) wertet die Kampfauflösung direkt über ctx.level() aus; ihre Wirkung steht in
// `flags`, damit Tests und Tooltips wissen, wo sie greifen.
//
// Stufen: "id:n" (z. B. "dornenkleid:2"). Beim Verschmelzen werden doppelte Sigils nach `merge` zusammengelegt
// ("sum" = Stufen addieren bis maxLevel, "max" = größerer Parameter). Ohne maxLevel > 1 bleibt ein Duplikat Stufe 1.

/** @typedef {import("../types.js").Unit} Unit */

/**
 * "id:n" zerlegen.
 * @param {string} ref
 * @returns {{ id: string, n: number }}
 */
export function parseSigil(ref) {
  const i = ref.indexOf(":");
  if (i < 0) return { id: ref, n: 1 };
  const n = Number(ref.slice(i + 1));
  return { id: ref.slice(0, i), n: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1 };
}

/** @param {string} id @param {number} n */
export function sigilRef(id, n) {
  return n > 1 || SIGILS[id]?.param ? `${id}:${n}` : id;
}

// Hilfsfunktionen für Hooks
const neighbors = (lane) => [lane - 1, lane + 1].filter((l) => l >= 0 && l < 4);

/** @type {Record<string, any>} */
export const SIGILS = {
  // ───────────────────────── Bewegung ─────────────────────────
  schwinge: {
    category: "bewegung", power: 2.5, aura: true,
    flags: { flying: true },
    hooks: {},
  },
  hochwuchs: {
    category: "bewegung", power: 0.5, aura: true,
    flags: { blocksFlying: true },
    hooks: {},
  },
  tauchgang: {
    category: "bewegung", power: 1.5,
    flags: { submergeAfterAttack: true },
    hooks: {},
  },
  wanderer: {
    category: "bewegung", power: 0,
    hooks: {
      onTurnEnd(ctx, u) { ctx.stepUnit(u, false); },
    },
  },
  grabwuehler: {
    category: "bewegung", power: 1,
    flags: { burrowGuard: true },
    hooks: {},
  },
  fluchtreflex: {
    category: "bewegung", power: 1, aura: true,
    hooks: {
      onSurvivedHit(ctx, u) {
        if (u.glued > 0 || u.zone !== "front") return;
        const row = ctx.row(u.owner, "front");
        for (const l of neighbors(u.lane)) {
          if (!row[l]) { ctx.moveUnit(u, "front", l, "dodge"); return; }
        }
      },
    },
  },
  rammbock: {
    category: "bewegung", power: 0.5,
    hooks: {
      onTurnEnd(ctx, u) { ctx.stepUnit(u, true); },
    },
  },
  vorpreschen: {
    category: "bewegung", power: 0.5,
    flags: { rush: true },
    hooks: {},
  },

  // ───────────────────────── Angriff ─────────────────────────
  dreizack: {
    category: "angriff", power: 3,
    hooks: {
      modifyAttackTargets(_ctx, u, lanes) {
        const set = new Set(lanes);
        [u.lane - 1, u.lane, u.lane + 1].forEach((l) => l >= 0 && l < 4 && set.add(l));
        return [...set].sort((a, b) => a - b);
      },
    },
  },
  gabelstoss: {
    category: "angriff", power: 1.5,
    hooks: {
      modifyAttackTargets(ctx, u, lanes) {
        // Mit Dreizack zusammen bleibt es beim Dreizack (geradeaus inklusive)
        if (ctx.level(u, "dreizack") > 0) return lanes;
        return neighbors(u.lane);
      },
    },
  },
  zwillingsbiss: {
    category: "angriff", power: 3.5,
    flags: { strikes: 2 },
    hooks: {},
  },
  todesstachel: {
    category: "angriff", power: 3,
    flags: { deathtouch: true },
    hooks: {},
  },
  wucht: {
    category: "angriff", power: 1, aura: true,
    hooks: {
      onHit(ctx, u, target) {
        if (!ctx.alive(target) || target.zone !== "front" || target.glued > 0) return;
        if (!ctx.row(target.owner, "back")[target.lane]) ctx.moveUnit(target, "back", target.lane, "knockback");
      },
    },
  },
  aderlass: {
    category: "angriff", power: 2, aura: true,
    hooks: {
      onHit(ctx, u, target) {
        if (target.attack > 0) {
          ctx.buff(target, -1, 0, "aderlass");
          ctx.buff(u, 1, 0, "aderlass");
        }
      },
    },
  },
  durchbohren: {
    category: "angriff", power: 1.5, aura: true,
    flags: { pierce: true },
    hooks: {},
  },
  hinterhalt: {
    category: "angriff", power: 1.5, aura: true,
    flags: { ambush: true },
    hooks: {},
  },
  rudelruf: {
    category: "angriff", power: 1.5, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      selfAttack(ctx, u, v, n) {
        let count = 0;
        for (const other of ctx.units(u.owner)) if (other !== u && other.card.tribe === u.card.tribe) count++;
        return v + count * n;
      },
    },
  },
  rachsucht: {
    category: "angriff", power: 1, aura: true,
    hooks: {
      onAllyDeath(ctx, u, dead) {
        if (dead.zone === u.zone && Math.abs(dead.lane - u.lane) === 1) ctx.buff(u, 1, 0, "rachsucht");
      },
    },
  },
  ruestungsbrecher: {
    category: "angriff", power: 1, aura: true,
    flags: { armorBreak: true },
    hooks: {},
  },
  spiegelbild: {
    category: "angriff", power: 1.5,
    flags: { mirror: true },
    hooks: {},
  },

  // ───────────────────────── Verteidigung ─────────────────────────
  dornenkleid: {
    category: "verteidigung", power: 1.5, maxLevel: 3, merge: "sum", aura: true,
    hooks: {
      onStruck(ctx, u, attacker, n) {
        if (ctx.alive(attacker)) ctx.damageUnit(attacker, n, u, "thorns");
      },
    },
  },
  schildrinde: {
    category: "verteidigung", power: 2, aura: true,
    flags: { shield: true },
    hooks: {},
  },
  panzer: {
    category: "verteidigung", power: 2, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      modifyDamage(_ctx, _u, dmg, n) { return Math.max(1, dmg - n); },
    },
  },
  wiedergaenger: {
    category: "verteidigung", power: 3,
    hooks: {
      onDeath(ctx, u, info) {
        if (info.cause === "sacrifice") return;
        ctx.revive(u);
      },
    },
  },
  leibwaechter: {
    category: "verteidigung", power: 1.5, aura: true,
    flags: { guard: true },
    hooks: {},
  },
  moosheilung: {
    category: "verteidigung", power: 1.5, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      onTurnEnd(ctx, u, n) { ctx.heal(u, n); },
    },
  },
  haeutung: {
    category: "verteidigung", power: 1.5,
    flags: { shed: true },
    hooks: {},
  },
  koeder: {
    category: "verteidigung", power: 1,
    flags: { lure: true },
    hooks: {},
  },

  // ───────────────────────── Ressourcen ─────────────────────────
  knochenmark: {
    category: "ressourcen", power: 1, aura: true,
    hooks: {
      bonesOnDeath(_ctx, _u, v) { return Math.max(v, 3); },
    },
  },
  markleicht: {
    category: "ressourcen", power: 0.5, hidden: true,
    hooks: {
      bonesOnDeath(_ctx, _u, v) { return Math.max(v, 2); },
    },
  },
  dreifachblut: {
    category: "ressourcen", power: 3,
    hooks: {
      bloodValue(_ctx, _u, v) { return Math.max(v, 3); },
    },
  },
  ewigesopfer: {
    category: "ressourcen", power: 3,
    flags: { undying: true },
    hooks: {},
  },
  aschenspende: {
    category: "ressourcen", power: 1, aura: true,
    hooks: {
      onSacrificed(ctx, u) { ctx.gainBones(u.owner, 2, u); },
    },
  },
  wachsgabe: {
    category: "ressourcen", power: 0.5, hidden: true,
    hooks: {
      onSacrificed(ctx, u) { ctx.gainWax(u.owner, 1, u); },
    },
  },
  wachsquelle: {
    category: "ressourcen", power: 1.5, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      onTurnStart(ctx, u, n) { ctx.gainWax(u.owner, n, u); },
    },
  },
  blutschuld: {
    category: "ressourcen", power: 1,
    hooks: {
      onPlay(ctx, u) {
        ctx.drawMain(u.owner, 2, "blutschuld");
        ctx.addScale(1 - u.owner, 1, "blutschuld");
      },
    },
  },

  // ───────────────────────── Spielfeld & Verwandlung ─────────────────────────
  brut: {
    category: "feld", power: 1.5,
    hooks: {
      onPlay(ctx, u) {
        const row = ctx.row(u.owner, u.zone);
        for (const l of neighbors(u.lane)) {
          if (!row[l]) ctx.spawn(u.owner, u.zone, l, `token_brut_${u.card.tribe}`, "brut");
        }
      },
    },
  },
  metamorphose: {
    category: "feld", power: 1,
    hooks: {
      onTurnEnd(ctx, u) {
        if (u.turns >= 2 && u.card.evolvesTo) ctx.transform(u, u.card.evolvesTo);
      },
    },
  },
  nachgeburt: {
    category: "feld", power: 1.5,
    hooks: {
      onDeath(ctx, u, info) {
        if (info.cause === "sacrifice" || !u.card.evolvesTo) return;
        if (!ctx.row(u.owner, u.zone)[u.lane]) ctx.spawn(u.owner, u.zone, u.lane, u.card.evolvesTo, "nachgeburt", u.card.mods);
      },
    },
  },
  kundschafter: {
    category: "feld", power: 1, maxLevel: 2, merge: "sum",
    hooks: {
      onPlay(ctx, u, n) { ctx.drawMain(u.owner, n, "kundschafter"); },
    },
  },
  seher: {
    category: "feld", power: 0.5,
    hooks: {
      onPlay(ctx, u) { ctx.startSeer(u.owner); },
    },
  },
  faeulnis: {
    category: "feld", power: 1.5, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      onTurnEnd(ctx, u, n) {
        if (u.zone !== "front") return;
        const target = ctx.row(1 - u.owner, "front")[u.lane];
        if (target) ctx.damageUnit(target, n, u, "rot");
      },
    },
  },
  stinkdruese: {
    category: "feld", power: 1, maxLevel: 2, merge: "sum", aura: true,
    flags: { stink: true },
    hooks: {},
  },
  leittier: {
    category: "feld", power: 2, maxLevel: 2, merge: "sum", aura: true,
    hooks: {
      auraAttack(_ctx, source, v, target, n) {
        return v + (source.zone === target.zone && Math.abs(source.lane - target.lane) === 1 ? n : 0);
      },
    },
  },
  nesthueter: {
    category: "feld", power: 1.5,
    hooks: {
      onDeath(ctx, u) { ctx.nestCopy(u); },
    },
  },
  kerzendocht: {
    category: "feld", power: -2, param: true, maxLevel: 9, merge: "max",
    // Leistungswert hängt vom Parameter ab (kürzerer Docht = teurer), siehe cards.js → sigilPower
    hooks: {},
  },
  hunger: {
    category: "feld", power: -0.5,
    hooks: {
      onTurnEnd(ctx, u) {
        const row = ctx.row(u.owner, u.zone);
        for (const l of neighbors(u.lane)) {
          const prey = row[l];
          if (prey) { ctx.devour(u, prey); return; }
        }
        ctx.damageUnit(u, 1, u, "hunger");
      },
    },
  },
  glockenschlag: {
    category: "feld", power: 0.5,
    hooks: {
      onPlay(ctx) { ctx.advanceAll("glockenschlag"); },
    },
  },
  fluchmal: {
    category: "feld", power: -3, cursedOnly: true,
    hooks: {
      onTurnEnd(ctx, u) { ctx.addScale(1 - u.owner, 1, "fluchmal"); },
    },
  },
};

for (const [id, def] of Object.entries(SIGILS)) {
  def.id = id;
  def.iconId = def.iconId || id;
  def.maxLevel = def.maxLevel || 1;
  def.merge = def.merge || "none";
}

/** Sigils, die als Totem-Basis taugen (Aura). */
export const AURA_SIGILS = Object.values(SIGILS).filter((s) => s.aura).map((s) => s.id);

/** Öffentliche (nicht versteckte) Sigils. */
export const PUBLIC_SIGILS = Object.values(SIGILS).filter((s) => !s.hidden).map((s) => s.id);

/**
 * Leistungswert einer Sigil-Referenz (für die Balancing-Formel).
 * @param {string} ref
 */
export function sigilPower(ref) {
  const { id, n } = parseSigil(ref);
  const def = SIGILS[id];
  if (!def) return 0;
  if (id === "kerzendocht") return -Math.max(0.5, 4 - n * 0.75);
  return def.power * (def.maxLevel > 1 ? n : 1);
}

/**
 * Sigil-Liste zusammenführen: max. 4 Einträge, Duplikate nach `merge`.
 * @param {string[]} base
 * @param {string[]} extra
 * @param {number} [max]
 * @returns {string[]}
 */
export function mergeSigils(base, extra, max = 4) {
  /** @type {Map<string, number>} */
  const levels = new Map();
  const order = [];
  for (const ref of [...base, ...extra]) {
    const { id, n } = parseSigil(ref);
    const def = SIGILS[id];
    if (!def) continue;
    if (!levels.has(id)) {
      if (order.length >= max) continue;
      order.push(id);
      levels.set(id, n);
      continue;
    }
    const cur = levels.get(id) ?? 1;
    if (def.merge === "sum") levels.set(id, Math.min(def.maxLevel, cur + n));
    else if (def.merge === "max") levels.set(id, Math.max(cur, n));
  }
  return order.map((id) => sigilRef(id, levels.get(id) ?? 1));
}
