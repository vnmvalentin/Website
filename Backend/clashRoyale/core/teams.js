// Team-Zuordnung für Duo-Lobbys (2v2-Modi).
//
// Ein Team besteht aus genau 2 Slots (1 und 2) — welcher Slot welche Rolle in einem Modus
// spielt (z.B. "sieht Karte X" vs. "sieht Karte Y" bei Elixir Auction 2v2), entscheidet der
// jeweilige Modus selbst. Hier steht nur die reine Zuordnung: wer ist in welchem Team, an
// welchem Slot, und sind alle Teams vollständig.
//
// Die Lobby legt fest, wie viele Teams es gibt (lobby.teamCount, 2–4 — bei max. 8 Spielern
// passen genau vier 2er-Teams). Es zählen immer die ersten teamCount Buchstaben.

const TEAM_IDS = ['A', 'B', 'C', 'D'];
const TEAM_COUNT_MIN = 2;
const TEAM_COUNT_MAX = 4;

/** Anzahl Teams dieser Lobby (fehlt das Feld, wie bisher 2). */
function teamCountOf(lobby) {
  const n = Number(lobby?.teamCount);
  return Number.isInteger(n) ? Math.max(TEAM_COUNT_MIN, Math.min(TEAM_COUNT_MAX, n)) : TEAM_COUNT_MIN;
}

/** Die Buchstaben der Teams, die in dieser Lobby gerade existieren. */
function activeTeamIds(lobby) {
  return TEAM_IDS.slice(0, teamCountOf(lobby));
}

// { A: [slot1Player|null, slot2Player|null], B: [...], … } — nur aktive (nicht Zuschauer,
// nicht gegangene) Spieler zählen, sonst könnte ein Team durch einen Zuschauer "voll" wirken.
function teamPlayers(lobby) {
  const ids = activeTeamIds(lobby);
  const out = Object.fromEntries(ids.map(id => [id, [null, null]]));
  for (const p of lobby?.players || []) {
    if (p.isSpectator || p.left || !p.teamId || !ids.includes(p.teamId)) continue;
    const idx = p.teamSlot === 2 ? 1 : 0; // Slot 1 → Index 0, Slot 2 → Index 1, unbekannt → 1
    out[p.teamId][idx] = p;
  }
  return out;
}

// Für 2v2-Modi: jedes Team braucht exakt 2 aktive Spieler (Slot 1 UND Slot 2 besetzt).
function isDuoTeamsReady(lobby) {
  const teams = teamPlayers(lobby);
  return Object.values(teams).every(([a, b]) => a && b);
}

module.exports = { TEAM_IDS, TEAM_COUNT_MIN, TEAM_COUNT_MAX, teamCountOf, activeTeamIds, teamPlayers, isDuoTeamsReady };
