// Team-Zuordnung für Duo-Lobbys (2v2-Modi).
//
// Ein Team besteht aus genau 2 Slots (1 und 2) — welcher Slot welche Rolle in einem Modus
// spielt (z.B. "sieht Karte X" vs. "sieht Karte Y" bei Elixir Auction 2v2), entscheidet der
// jeweilige Modus selbst. Hier steht nur die reine Zuordnung: wer ist in welchem Team, an
// welchem Slot, und sind beide Teams vollständig.

const TEAM_IDS = ['A', 'B'];

// { A: [slot1Player|null, slot2Player|null], B: [...] } — nur aktive (nicht Zuschauer,
// nicht gegangene) Spieler zählen, sonst könnte ein Team durch einen Zuschauer "voll" wirken.
function teamPlayers(lobby) {
  const out = { A: [null, null], B: [null, null] };
  for (const p of lobby?.players || []) {
    if (p.isSpectator || p.left || !p.teamId || !TEAM_IDS.includes(p.teamId)) continue;
    const idx = p.teamSlot === 2 ? 1 : 0; // Slot 1 → Index 0, Slot 2 → Index 1, unbekannt → 1
    out[p.teamId][idx] = p;
  }
  return out;
}

// Für 2v2-Modi: beide Teams müssen exakt 2 aktive Spieler haben (Slot 1 UND Slot 2 besetzt).
function isDuoTeamsReady(lobby) {
  const teams = teamPlayers(lobby);
  return TEAM_IDS.every(id => teams[id][0] && teams[id][1]);
}

module.exports = { TEAM_IDS, teamPlayers, isDuoTeamsReady };
