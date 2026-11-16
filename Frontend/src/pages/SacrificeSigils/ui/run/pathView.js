// ui/run/pathView.js — Run-Sicht in die Sicht des Pfadbildschirms umrechnen (bisheriger Pfad und Pfad am Tisch).

/** Run-Sicht → Sicht des Pfadbildschirms (eigener Fortschritt als Platz 0). @param {any} rv @param {number} you */
export function pathView(rv, you) {
  const me = rv.players[you];
  return {
    ...rv,
    path: { map: rv.path.map, biome: rv.path.biome, cycle: rv.path.cycle, players: [rv.path.me, { level: 0, done: false, chosen: [] }] },
    players: [me, { name: "" }],
    others: rv.players.map((P, q) => ({ q, name: P.name, alive: P.alive, seals: P.seals, deckSize: P.deckSize })).filter((x) => x.q !== you),
  };
}
