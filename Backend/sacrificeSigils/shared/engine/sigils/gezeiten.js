// engine/sigils/gezeiten.js — Sigils des Gezeiten-Zirkels. Gleiche Form wie in sigils/index.js (dort zusammengeführt).
//
// Wasserstand (battle.js): Ebbe → steigend → Flut → fallend, je 2 Züge. „Hochwasser“ = steigend oder Flut,
// „Niedrigwasser“ = fallend oder Ebbe. Die meisten Gezeiten-Sigils fragen den Wasserstand über ctx.highWater() ab.
// Rein passive Sigils (Gezeitenschild, Leuchtfeuer, Treibgut, Anker) wertet battle.js direkt über ctx.level() aus.

const neighbors = (/** @type {number} */ lane) => [lane - 1, lane + 1].filter((l) => l >= 0 && l < 4);

/** @type {Record<string, any>} */
export const GEZEITEN_SIGILS = {
  // ───────── Bewegung ─────────
  wattlaeufer: {
    // Bei Niedrigwasser zu Zugbeginn: steht gegenüber ein Blocker, läuft es in eine freie Nachbarlane ohne Gegner
    category: "bewegung", power: 1, zirkel: "gezeiten",
    hooks: {
      onTurnStart(ctx, u) {
        if (!ctx.lowWater() || u.zone !== "front" || u.glued > 0) return;
        const opp = ctx.row(1 - u.owner, "front");
        if (!opp[u.lane] || opp[u.lane].submerged) return;
        const own = ctx.row(u.owner, "front");
        for (const l of neighbors(u.lane)) {
          if (!own[l] && (!opp[l] || opp[l].submerged)) { ctx.moveUnit(u, "front", l, "watt"); return; }
        }
      },
    },
  },
  anker: {
    // Lässt sich nicht verschieben (Sog, Wucht) und rückt auch bei Flut aus der Uferreihe nach
    category: "bewegung", power: 0.5, aura: true, zirkel: "gezeiten",
    flags: { anchored: true },
    hooks: {},
  },
  sog: {
    category: "bewegung", power: 2, zirkel: "gezeiten",
    hooks: {
      onTurnEnd(ctx, u) {
        if (u.zone !== "front") return;
        const q = 1 - u.owner;
        const t = ctx.row(q, "front")[u.lane];
        if (!t || t.submerged || t.glued > 0 || ctx.level(t, "anker") > 0) return;
        if (!ctx.row(q, "back")[u.lane]) ctx.moveUnit(t, "back", u.lane, "sog");
      },
    },
  },

  // ───────── Angriff ─────────
  brandung: {
    category: "angriff", power: 2, aura: true, zirkel: "gezeiten",
    hooks: {
      selfAttack(ctx, _u, v) { return ctx.highWater() ? v + 2 : v; },
    },
  },
  flutwelle: {
    category: "angriff", power: 1.5, zirkel: "gezeiten",
    hooks: {
      onPlay(ctx, u) {
        if (!ctx.highWater()) return;
        for (const t of [...ctx.row(1 - u.owner, "front")]) {
          if (t && !t.submerged) ctx.damageUnit(t, 1, u, "wave");
        }
      },
    },
  },
  schlick: {
    category: "angriff", power: 1, aura: true, zirkel: "gezeiten",
    hooks: {
      onHit(ctx, _u, target) {
        if (!ctx.alive(target)) return;
        target.glued = Math.max(target.glued, 2);
        ctx.emit({ type: "glued", uid: target.uid, turns: 2 });
      },
    },
  },

  // ───────── Verteidigung ─────────
  gezeitenschild: {
    // Wie Schildrinde, aber nur bei Hochwasser (battle.js → hitUnit)
    category: "verteidigung", power: 1.5, aura: true, zirkel: "gezeiten",
    flags: { shieldHighWater: true },
    hooks: {},
  },
  salzkruste: {
    category: "verteidigung", power: 2, aura: true, zirkel: "gezeiten",
    hooks: {
      modifyDamage(_ctx, _u, dmg) { return Math.min(dmg, 2); },
    },
  },
  tintenwolke: {
    category: "verteidigung", power: 1.5, aura: true, zirkel: "gezeiten",
    hooks: {
      onStruck(ctx, _u, attacker) {
        if (!ctx.alive(attacker) || attacker.stunned) return;
        attacker.stunned = true;
        ctx.emit({ type: "inked", uid: attacker.uid });
      },
    },
  },
  heimkehr: {
    // Ertrunkene: stirbt die Karte (nicht geopfert), kehrt sie mit der nächsten Flut auf die Hand zurück
    category: "verteidigung", power: 1.5, zirkel: "gezeiten",
    hooks: {
      onDeath(ctx, u, info) {
        if (info.cause === "sacrifice") return;
        ctx.queueReturn(u);
      },
    },
  },
  muschelgrab: {
    category: "verteidigung", power: 1, zirkel: "gezeiten",
    hooks: {
      onDeath(ctx, u, info) {
        if (info.cause === "sacrifice") return;
        if (!ctx.row(u.owner, u.zone)[u.lane]) ctx.spawn(u.owner, u.zone, u.lane, "token_muschel", "muschelgrab");
      },
    },
  },

  // ───────── Ressourcen ─────────
  salzader: {
    category: "ressourcen", power: 1.5, maxLevel: 2, merge: "sum", aura: true, zirkel: "gezeiten",
    hooks: {
      onTurnStart(ctx, u, n) { ctx.gainRes(u.owner, "salt", n, u); },
    },
  },
  salzgabe: {
    category: "ressourcen", power: 0.5, zirkel: "gezeiten",
    hooks: {
      onSacrificed(ctx, u) { ctx.gainRes(u.owner, "salt", 1, u); },
    },
  },
  perle: {
    category: "ressourcen", power: 1, aura: true, zirkel: "gezeiten",
    hooks: {
      onDeath(ctx, u) { ctx.gainRes(u.owner, "salt", 2, u); },
    },
  },
  strandgut: {
    category: "ressourcen", power: 1, zirkel: "gezeiten",
    hooks: {
      onDeath(ctx, u) { ctx.addToHand(u.owner, ctx.newSideCard(u.owner), "strandgut"); },
    },
  },

  // ───────── Spielfeld ─────────
  leuchtfeuer: {
    // Solange es lebt, können gegnerische Karten nicht abtauchen; beim Ausspielen tauchen sie sofort auf
    category: "feld", power: 1, zirkel: "gezeiten",
    flags: { noEnemyDive: true },
    hooks: {
      onPlay(ctx, u) {
        for (const t of ctx.units(1 - u.owner)) {
          if (t.submerged) { t.submerged = false; ctx.emit({ type: "surface", uid: t.uid }); }
        }
      },
    },
  },
  treibgut: {
    // Vergänglich: stirbt, sobald die Flut kommt (battle.js → tideChanged)
    category: "feld", power: -1.5, zirkel: "gezeiten",
    flags: { diesAtFlood: true },
    hooks: {},
  },
  flaschenpost: {
    category: "feld", power: 1.5, zirkel: "gezeiten",
    hooks: {
      onPlay(ctx, u) { ctx.drawMain(u.owner, ctx.highWater() ? 2 : 1, "flaschenpost"); },
    },
  },
  mondzug: {
    category: "feld", power: 1, zirkel: "gezeiten",
    hooks: {
      onPlay(ctx) { ctx.shiftTide(1, "mondzug"); },
    },
  },
};
