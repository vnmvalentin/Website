// dailyRoutes.js — /api/clash/heute: Bestenliste der CR-Tagesrunde (Frontend: pages/ClashRoyale/clash/HeutePage.jsx).
//
//   GET  /board?tag=JJJJ-MM-TT   die Besten des Tages (Standard: heute) und — angemeldet — der eigene Eintrag
//   POST /result { day, scores }  eigene Punkte melden (Twitch-Login); nur für heute oder gestern (kurz nach
//                                 Mitternacht gespielt), je Spiel zählt die erste Meldung (dailyStore.js)
//
// „Heute“ ist der Kalendertag in Berlin — wie der Datum-Seed der Spiele (quizData.berlinDay).

const express = require('express');
const defaultStore = require('./dailyStore');
const { zaehlePartie } = require('../../lib/spielStatistik');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const POSTS_PER_MINUTE = 30;

const berlinDay = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
function prevDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const guestAuth = (req, res, next) => next();
const noAuth = (req, res) => res.status(401).json({ ok: false, key: 'loginRequired' });

/**
 * @param {object} [deps]
 * @param {Function} [deps.requireAuth]   setzt req.twitchId/req.twitchLogin oder antwortet 401
 * @param {Function} [deps.optionalAuth]  setzt sie, wenn angemeldet
 * @param {object} [deps.store]           Ersatz für dailyStore (Tests)
 * @param {() => Date} [deps.now]         Uhr (Tests)
 */
function createDailyRouter({ requireAuth = noAuth, optionalAuth = guestAuth, store = defaultStore, now = () => new Date() } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '4kb' }));

  // Grobe Bremse je Konto gegen Dauerfeuer
  const posts = new Map();
  const allowPost = (id) => {
    const t = Date.now();
    const b = posts.get(id);
    if (!b || t - b.start > 60000) { posts.set(id, { start: t, n: 1 }); if (posts.size > 5000) posts.clear(); return true; }
    b.n += 1;
    return b.n <= POSTS_PER_MINUTE;
  };

  let prunedDay = null;
  const pruneOnce = (today) => {
    if (prunedDay === today) return;
    prunedDay = today;
    const cut = new Date(`${today}T00:00:00Z`);
    cut.setUTCDate(cut.getUTCDate() - store.KEEP_DAYS);
    try { store.prune(cut.toISOString().slice(0, 10)); } catch { /* Aufräumen ist Beiwerk */ }
  };

  router.get('/board', optionalAuth, (req, res) => {
    const today = berlinDay(now());
    const day = DAY_RE.test(String(req.query.tag || '')) ? String(req.query.tag) : today;
    try {
      const b = store.board(day, 50);
      const me = req.twitchId ? store.entry(day, String(req.twitchId)) : null;
      res.json({ ok: true, day, today, players: b.players, top: b.top, me, loggedIn: !!req.twitchId });
    } catch (err) {
      console.error('[heute] Bestenliste:', err?.message || err);
      res.status(500).json({ ok: false, key: 'apiDown' });
    }
  });

  router.post('/result', requireAuth, (req, res) => {
    const today = berlinDay(now());
    const day = String(req.body?.day || '');
    if (day !== today && day !== prevDay(today)) return res.status(400).json({ ok: false, key: 'wrongDay' });
    const scores = store.cleanScores(req.body?.scores);
    if (!Object.keys(scores).length) return res.status(400).json({ ok: false, key: 'noScores' });
    const userId = String(req.twitchId);
    if (!allowPost(userId)) return res.status(429).json({ ok: false, key: 'rateLimited' });
    try {
      pruneOnce(today);
      const before = store.entry(day, userId);
      const me = store.submit(day, userId, req.twitchLogin || userId, scores);
      // Eine vollständig gespielte Tagesrunde zählt als Partie der Ratespiele (Admin-Reiter „Spiele“, Spur A)
      if (me?.games === store.GAMES.length && (!before || before.games < store.GAMES.length)) zaehlePartie('cr-ratespiele');
      res.json({ ok: true, day, me });
    } catch (err) {
      console.error('[heute] Melden:', err?.message || err);
      res.status(500).json({ ok: false, key: 'apiDown' });
    }
  });

  return router;
}

module.exports = { createDailyRouter, berlinDay, prevDay };
