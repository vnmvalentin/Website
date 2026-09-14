// dleRoutes.js — HTTP-Schicht für alle -dle-Spiele. Bewusst ohne Login-Pflicht (anders als
// z.B. crPresetRoutes.js): Favoriten/Spielername leben rein im Browser (localStorage), ein
// zufälliger playerKey vom Client reicht, um Mehrfach-Einsendungen desselben Geräts an
// einem Tag zu erkennen. Wer eingeloggt spielen will, tut das über sein Profil an anderer
// Stelle der Seite — hier unten geht es nur um die Tagesrätsel selbst.
//
// Antworten (inkl. des korrekten Werts!) werden schon mit GET /rounds ausgeliefert, nicht
// erst nach dem Raten — genau wie bei praktisch jedem anderen -dle-Spiel im Netz (Wordle
// inklusive: die komplette Wortliste liegt im Client-Bundle). Der Kompromiss ist bewusst:
// ein serverseitig rundenweise geprüfter Ablauf wäre deutlich komplexer, für ein Spiel ohne
// echten Einsatz (nur Bestenliste unter Freunden) aber kaum mehr wert. Trotzdem rechnet
// POST /submit die Punktzahl SELBST aus den eingesendeten Rohwerten nach, statt einer vom
// Client mitgeschickten Endsumme zu vertrauen — die Bestenliste bleibt so wenigstens gegen
// simple "totalScore: 500"-Manipulation abgesichert.
const express = require('express');
const { getGame } = require('../core/games');
const { scoreGuess } = require('../core/scoring');
const { scoreColor, isValidColor } = require('../core/colorScoring');
const { scoreYearGuess } = require('../core/yearScoring');
const { todayDateKey } = require('../core/dailySeed');
const store = require('../store/dleStore');

const MAX_NAME_LENGTH = 24;
const MAX_PLAYER_KEY_LENGTH = 64;

const cleanName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) || 'Anonym';
const cleanPlayerKey = (raw) => String(raw ?? '').trim().slice(0, MAX_PLAYER_KEY_LENGTH);

module.exports = function createDleRouter() {
  const router = express.Router();

  router.get('/:gameId/rounds', (req, res) => {
    const game = getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Unbekanntes Spiel' });

    const mode = req.query.mode === 'practice' ? 'practice' : 'daily';
    if (mode === 'practice') {
      const { rounds } = game.practiceRounds();
      return res.json({ mode, unit: game.unit, roundsPerGame: game.ROUNDS_PER_GAME, rounds });
    }
    const { dateKey, rounds } = game.dailyRounds();
    res.json({ mode, dateKey, unit: game.unit, roundsPerGame: game.ROUNDS_PER_GAME, rounds });
  });

  router.get('/:gameId/leaderboard', (req, res) => {
    const game = getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Unbekanntes Spiel' });

    const dateKey = String(req.query.dateKey || todayDateKey());
    res.json({
      dateKey,
      leaderboard: store.getLeaderboard(game.id, dateKey),
      playedCount: store.countPlayedToday(game.id, dateKey),
    });
  });

  router.post('/:gameId/submit', (req, res) => {
    const game = getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Unbekanntes Spiel' });

    const dateKey = String(req.body?.dateKey || '');
    const today = todayDateKey();
    if (dateKey !== today) {
      // Läuft eine Runde über Mitternacht (UTC), landet sie hier absichtlich NICHT beim
      // neuen Tag — einfachste sichere Lösung ist, nur "heute" zu akzeptieren; der Client
      // fordert dann einfach frische Runden an, statt ein Ergebnis falsch zuzuordnen.
      return res.status(409).json({ error: 'Der Tag ist vorbei — bitte Seite neu laden.' });
    }

    const playerKey = cleanPlayerKey(req.body?.playerKey);
    if (!playerKey) return res.status(400).json({ error: 'playerKey fehlt' });

    const { rounds } = game.dailyRounds(dateKey);
    const rawGuesses = req.body?.guesses;

    // Drei grundverschiedene Antwortarten: eine Zahl auf einer Skala (Tempdle & Co., siehe
    // core/scoring.js), ein Kalenderjahr (Inventiondle, siehe core/yearScoring.js — braucht
    // eine eigene Formel, weil Jahr 0 kein echter Nullpunkt ist) oder eine Farbe (CR Color
    // Match, siehe core/colorScoring.js) — welche gilt, sagt `game.answerType` (Standard:
    // 'number', siehe core/games/*.js).
    let scoredRounds;
    if (game.answerType === 'color') {
      const guesses = Array.isArray(rawGuesses) ? rawGuesses : null;
      if (!guesses || guesses.length !== rounds.length || guesses.some((g) => !isValidColor(g))) {
        return res.status(400).json({ error: 'Ungültige Antworten' });
      }
      scoredRounds = rounds.map((r, i) => ({ ...r, guess: guesses[i], score: scoreColor(guesses[i], r.value) }));
    } else if (game.answerType === 'year') {
      const guesses = Array.isArray(rawGuesses) ? rawGuesses.map(Number) : null;
      if (!guesses || guesses.length !== rounds.length || guesses.some((g) => !Number.isFinite(g))) {
        return res.status(400).json({ error: 'Ungültige Antworten' });
      }
      scoredRounds = rounds.map((r, i) => ({ ...r, guess: guesses[i], score: scoreYearGuess(guesses[i], r.value) }));
    } else {
      const guesses = Array.isArray(rawGuesses) ? rawGuesses.map(Number) : null;
      if (!guesses || guesses.length !== rounds.length || guesses.some((g) => !Number.isFinite(g))) {
        return res.status(400).json({ error: 'Ungültige Antworten' });
      }
      // game.minTolerance (aktuell nur bei Probabildle/Velocidle/Duratidle/Balancdle gesetzt,
      // siehe jeweiliger Kommentar) überschreibt core/scoring.js' Standard-Mindesttoleranz von
      // 7 — undefined lässt scoreGuess einfach auf seinen Default zurückfallen, alle anderen
      // Spiele bleiben also unverändert.
      scoredRounds = rounds.map((r, i) => ({ ...r, guess: guesses[i], score: scoreGuess(guesses[i], r.value, game.minTolerance) }));
    }

    const existing = store.getExistingRun(game.id, dateKey, playerKey);
    if (existing) {
      return res.json({ result: existing, leaderboard: store.getLeaderboard(game.id, dateKey), alreadyPlayed: true });
    }

    const totalScore = scoredRounds.reduce((sum, r) => sum + r.score, 0);

    const result = store.recordRun({
      gameId: game.id,
      dateKey,
      playerKey,
      playerName: cleanName(req.body?.playerName),
      totalScore,
      rounds: scoredRounds,
    });

    res.json({ result, leaderboard: store.getLeaderboard(game.id, dateKey) });
  });

  return router;
};
