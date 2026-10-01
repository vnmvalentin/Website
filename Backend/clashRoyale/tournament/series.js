// Serien-Logik eines Matches (Best of 1/3/5): Spielstand, Modus-Wahl per Pick/Ban oder Zufall.
// Reine Funktionen ohne I/O — getestet in __tests__/series.test.js. Plan: ../PLANUNG_TURNIER.md.
//
// Ein Spiel: { gameNo, status: 'banning'|'drafting'|'battle'|'done'|'void', offer, bans: [{ side, mode }],
//              mode, winner: 'a'|'b'|null, crownsA, crownsB }

const PICKBAN_OFFER = 3;

/** Serienstand aus den entschiedenen Spielen. */
function seriesScore(games) {
  const done = games.filter(g => g.status === 'done');
  return {
    a: done.filter(g => g.winner === 'a').length,
    b: done.filter(g => g.winner === 'b').length,
    crownsA: done.reduce((s, g) => s + (g.crownsA || 0), 0),
    crownsB: done.reduce((s, g) => s + (g.crownsB || 0), 0),
  };
}

/** Sieger der Serie ('a'|'b') oder null, solange keiner die nötigen Siege hat. */
function seriesWinner(bestOf, score) {
  const need = Math.ceil(bestOf / 2);
  if (score.a >= need) return 'a';
  if (score.b >= need) return 'b';
  return null;
}

/** Das laufende Spiel (weder entschieden noch annulliert) oder null. */
const activeGame = (games) => games.find(g => g.status !== 'done' && g.status !== 'void') || null;

/** Nummer des nächsten Spiels — annullierte zählen mit, damit die Nummern eindeutig bleiben. */
const nextGameNo = (games) => (games.length ? Math.max(...games.map(g => g.gameNo)) + 1 : 1);

/**
 * Wer bannt zuerst? Im ersten Spiel Spieler B (Spieler A darf dafür den Raum starten), danach
 * abwechselnd — gezählt werden nur entschiedene Spiele, ein annulliertes ändert nichts.
 */
function firstBanner(games) {
  const played = games.filter(g => g.status === 'done').length;
  return played % 2 === 0 ? 'b' : 'a';
}

/** Wer ist beim Bannen dran? null, wenn fertig gebannt. */
function banTurn(game, first) {
  if (game.status !== 'banning') return null;
  if (game.bans.length >= PICKBAN_OFFER - 1) return null;
  const second = first === 'a' ? 'b' : 'a';
  return game.bans.length === 0 ? first : second;
}

/** Modi, die in dieser Serie schon gespielt wurden, kommen nur nach, wenn sonst zu wenige da sind. */
function freshFirst(pool, games, rng) {
  const played = new Set(games.filter(g => g.status === 'done' && g.mode).map(g => g.mode));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [...shuffled.filter(m => !played.has(m)), ...shuffled.filter(m => played.has(m))];
}

/** Drei verschiedene Modi für Pick/Ban (bevorzugt in dieser Serie noch nicht gespielte). */
function drawOffer(pool, games, rng = Math.random) {
  if (pool.length < PICKBAN_OFFER) throw new Error('tournamentPickBanNeedsThree');
  return freshFirst(pool, games, rng).slice(0, PICKBAN_OFFER);
}

/** Zufallsmodus (bevorzugt in dieser Serie noch nicht gespielt). */
function randomMode(pool, games, rng = Math.random) {
  if (!pool.length) throw new Error('tournamentNoModes');
  return freshFirst(pool, games, rng)[0];
}

/**
 * Bann eintragen. Gibt das aktualisierte Spiel zurück; ist danach nur noch ein Modus übrig,
 * steht er in `mode` (Status bleibt 'banning' — den Wechsel zu 'drafting' macht der Aufrufer,
 * sobald die Lobby steht). Wirft einen Fehlerschlüssel.
 */
function applyBan(game, first, side, mode) {
  if (banTurn(game, first) !== side) throw new Error('tournamentNotYourTurn');
  if (!game.offer.includes(mode) || game.bans.some(b => b.mode === mode)) throw new Error('tournamentInvalidBan');
  const bans = [...game.bans, { side, mode }];
  const left = game.offer.filter(m => !bans.some(b => b.mode === m));
  return { ...game, bans, mode: left.length === 1 ? left[0] : null };
}

module.exports = {
  PICKBAN_OFFER, seriesScore, seriesWinner, activeGame, nextGameNo, firstBanner, banTurn, drawOffer, randomMode, applyBan,
};
