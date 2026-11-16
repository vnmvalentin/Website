// Tests der Tagesrunde (dailyRound.js): Wertung je Spiel, Verlauf mit „erstes Ergebnis bleibt“, Serie, Teilen-Text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_GAMES, MAX_TOTAL, complete, doneCount, markOf, prevDay, scoreColor, scoreGuess, scoreImage, scoreWordle,
  shareText, streakOf, syncDaily, totalOf,
} from '../dailyRound.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m };
};

test('Wertung: Kartenraten nach Hinweisen, Wordle nach Versuchen, Zoom/Pixel nach Versuchen, Farbe als Schnitt', () => {
  assert.equal(scoreGuess({ over: true, won: true, shown: 1 }), 100);
  assert.equal(scoreGuess({ over: true, won: true, shown: 6 }), 17);
  assert.equal(scoreGuess({ over: true, won: false, shown: 2 }), 0);
  assert.equal(scoreGuess({ over: false, shown: 3 }), null);
  assert.equal(scoreWordle({ won: true, guesses: ['a'] }), 100);
  assert.equal(scoreWordle({ won: true, guesses: Array(4).fill('x') }), 70);
  assert.equal(scoreWordle({ won: true, guesses: Array(20).fill('x') }), 10);
  assert.equal(scoreWordle({ won: false, guesses: ['a', 'b'] }), null);
  assert.equal(scoreImage({ over: true, won: true, wrong: [], skips: 0 }), 100);
  assert.equal(scoreImage({ over: true, won: true, wrong: ['a', 'b'], skips: 1 }), 75);
  assert.equal(scoreImage({ over: true, won: false, wrong: Array(12).fill('x'), skips: 0 }), 0);
  assert.equal(scoreColor({ over: true, results: [{ score: 90 }, { score: 70 }, { score: 80 }, { score: 0, skipped: true }, { score: 60 }] }), 60);
  assert.equal(scoreColor({ over: false, results: [{ score: 90 }] }), null);
});

test('Verlauf: nur fertige Runden von heute, das erste Ergebnis bleibt stehen', () => {
  const day = '2026-11-16';
  const s = memory({
    crq_wordle_v1: { daily: { day, won: true, guesses: ['a', 'b'] } },
    crq_guess_v3: { daily: { day, over: false, shown: 2 } }, // läuft noch
    crq_zoom_v1: { daily: { day: '2026-11-15', over: true, won: true, wrong: [], skips: 0 } }, // von gestern
    crq_color_v1: { daily: { day, over: true, results: [{ score: 50 }] } },
  });
  const r = syncDaily({ storage: s, day });
  assert.deepEqual(r.scores, { wordle: 90, farbe: 50 });
  // später „besser“ nachgespielt (z. B. Speicher gelöscht und neu): bleibt beim ersten Ergebnis
  s.setItem('crq_color_v1', JSON.stringify({ daily: { day, over: true, results: [{ score: 99 }] } }));
  assert.equal(syncDaily({ storage: s, day }).scores.farbe, 50);
  assert.equal(doneCount(r.scores), 2);
  assert.equal(totalOf(r.scores), 140);
  assert.equal(complete(r.scores), false);
  // kaputter Speicher wirft nicht
  assert.deepEqual(syncDaily({ storage: { getItem: () => '{kaputt', setItem: () => {} }, day }).scores, {});
});

test('Serie: Tage in Folge mit kompletter Runde; heute offen zählt bis gestern, Lücke reißt sie', () => {
  const full = Object.fromEntries(DAILY_GAMES.map((g) => [g.key, 50]));
  const days = { '2026-11-12': full, '2026-11-13': full, '2026-11-14': full, '2026-11-15': full, '2026-11-16': { wordle: 90 } };
  assert.deepEqual(streakOf(days, '2026-11-16'), { current: 4, best: 4 });
  assert.deepEqual(streakOf({ ...days, '2026-11-16': full }, '2026-11-16'), { current: 5, best: 5 });
  // ein Tag fehlt ganz → neu zählen, beste Serie bleibt
  assert.deepEqual(streakOf({ '2026-11-01': full, '2026-11-02': full, '2026-11-03': full, '2026-11-15': full }, '2026-11-16'), { current: 1, best: 3 });
  assert.deepEqual(streakOf({}, '2026-11-16'), { current: 0, best: 0 });
  assert.equal(prevDay('2026-03-01'), '2026-02-28');
  assert.equal(prevDay('2027-01-01'), '2026-12-31');
});

test('Teilen: Farbe je Spiel, Gesamtpunkte, Serie und Link', () => {
  const labels = { wordle: 'Wordle', kartenraten: 'Kartenraten', zoom: 'Zoom', pixel: 'Pixel', farbe: 'Farbe' };
  const text = shareText({
    scores: { wordle: 90, kartenraten: 50, zoom: 0, farbe: 67 }, streak: 3, labels, heading: 'Clash Royale – Tagesrunde', dateText: '16.11.2026',
    totalLabel: 'Gesamt', streakLabel: (n) => `Serie ${n}`, url: 'vnmvalentin.de/clash/heute',
  });
  assert.equal(text, ['Clash Royale – Tagesrunde 16.11.2026', '🟩 Wordle 90', '🟨 Kartenraten 50', '🟥 Zoom 0', '⬜ Pixel', '🟩 Farbe 67',
    `Gesamt 207/${MAX_TOTAL} · Serie 3`, 'vnmvalentin.de/clash/heute'].join('\n'));
  assert.equal(markOf(33), '🟥');
  assert.equal(markOf(34), '🟨');
});
