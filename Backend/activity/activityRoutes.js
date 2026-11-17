// activity/activityRoutes.js — "Gerade los" auf der Startseite: ein paar Zahlen, die zeigen, dass die Seite benutzt wird.
//
// Regel: Eine Zahl erscheint erst, wenn sie über ihrer Schwelle liegt. "Heute 2 Läufe" schadet mehr, als es nützt — dann
// lieber gar nichts. Die Schwellen stehen nur hier; der Browser zeigt, was er bekommt (und bei leerer Liste nichts).
//
//   GET /api/activity  → { items: [{ id, value, label, labelEn, href }] }   (5 Minuten zwischengespeichert)
'use strict';

const express = require('express');

const CACHE_MS = 5 * 60 * 1000;
const MAX_ITEMS = 4;

// Ab wann eine Zahl gezeigt wird
const THRESHOLDS = {
  wtBattles7: 500,
  wtUsers7: 10,
  dailyRuns7: 50,
  levelsPublished: 20,
  openTournaments: 1,
};

/**
 * @param stats  { wtBattles7, wtUsers7, dailyRuns7, levelsPublished, openTournaments: [{ id, name }] } — Felder dürfen fehlen
 * @returns [{ id, value, label, labelEn, href }] in fester Reihenfolge, höchstens MAX_ITEMS (labelEn: englische Startseite)
 */
function buildItems(stats = {}) {
  const items = [];
  const over = (key, n) => Number.isFinite(n) && n >= THRESHOLDS[key];

  const open = Array.isArray(stats.openTournaments) ? stats.openTournaments : [];
  if (over('openTournaments', open.length)) {
    items.push({
      id: 'turniere',
      value: open.length,
      label: open.length === 1 ? `Turnier offen: ${open[0].name}` : 'Clash-Royale-Turniere offen',
      labelEn: open.length === 1 ? `Tournament open: ${open[0].name}` : 'Clash Royale tournaments open',
      href: open.length === 1 ? `/clash-royale/turnier/${open[0].id}` : '/clash-royale',
    });
  }
  if (over('wtBattles7', stats.wtBattles7)) {
    items.push({ id: 'wt-matches', value: stats.wtBattles7, label: 'Clash-Royale-Matches diese Woche im Win Tracker', labelEn: 'Clash Royale matches in the Win Tracker this week', href: '/clash-royale/win-tracker' });
  }
  if (over('wtUsers7', stats.wtUsers7)) {
    items.push({ id: 'wt-kanaele', value: stats.wtUsers7, label: 'Kanäle nutzen den Win Tracker diese Woche', labelEn: 'channels use the Win Tracker this week', href: '/clash-royale/win-tracker' });
  }
  if (over('dailyRuns7', stats.dailyRuns7)) {
    items.push({ id: 'tagesrennen', value: stats.dailyRuns7, label: 'Läufe im Seed-Runners-Tagesrennen diese Woche', labelEn: 'runs in the Seed Runners daily race this week', href: '/seed-runners/daily' });
  }
  if (over('levelsPublished', stats.levelsPublished)) {
    items.push({ id: 'level', value: stats.levelsPublished, label: 'Community-Level in Seed Runners', labelEn: 'community levels in Seed Runners', href: '/seed-runners/levels' });
  }
  return items.slice(0, MAX_ITEMS);
}

/**
 * @param getStats  () => stats (siehe buildItems); jede Quelle darf fehlen, ein Fehler ergibt eine leere Liste
 * @param now       Uhr (für Tests)
 */
function createActivityRouter({ getStats, now = () => Date.now() } = {}) {
  const router = express.Router();
  let cache = { at: 0, items: null };

  router.get('/', (req, res) => {
    const t = now();
    if (!cache.items || t - cache.at > CACHE_MS) {
      let stats = {};
      try {
        stats = getStats?.() || {};
      } catch (e) {
        console.error('[activity] Zahlen nicht lesbar:', e.message);
      }
      cache = { at: t, items: buildItems(stats) };
    }
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ items: cache.items });
  });

  return router;
}

module.exports = { createActivityRouter, buildItems, THRESHOLDS };
