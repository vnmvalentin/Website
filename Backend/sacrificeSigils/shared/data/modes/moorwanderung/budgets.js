// data/modes/moorwanderung/budgets.js — Zeitbudgets der Moorwanderung (Sekunden) je Tempo-Einstellung.
//
//   node       pro Knotenebene des Pfads
//   fight      pro Kampf (normaler NPC, Elite, Boss)
//   fightsPerPath  mit so vielen Kämpfen rechnet das Pfad-Budget (höchstens 3 NPC/Elite + Boss)
//   duelTurn   Zug-Timer in den Duellen
//   starter    Startdeck wählen
//   warn       Warnungen vor Ablauf des Pfad-Budgets
//
// Pfad-Budget = Ebenen × node + fightsPerPath × fight. Alle Spieler eines Pfads haben dieselbe Deadline.

export const BUDGETS = {
  relaxed: { node: 90, fight: 360, fightsPerPath: 4, duelTurn: 90, starter: 90 },
  normal: { node: 60, fight: 240, fightsPerPath: 4, duelTurn: 60, starter: 60 },
  fast: { node: 40, fight: 150, fightsPerPath: 4, duelTurn: 40, starter: 45 },
};

export const BUDGET_WARNINGS = [60, 15];

/** @param {string} pace */
export function budgetFor(pace) {
  return BUDGETS[pace] || BUDGETS.normal;
}
