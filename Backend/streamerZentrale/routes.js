// routes.js — /api/streamer-zentrale: der Stand aller Streamer-Werkzeuge des angemeldeten Nutzers.
//
//   GET /   → buildStatus (status.js): je Werkzeug eingerichtet ja/nein, wann die OBS-Quelle zuletzt da war,
//             was fehlt. Rein lesend — legt nichts an.
//
// Die echten Speicher werden erst beim ersten Abruf geladen (lazy). Win Tracker und Viewer Games gehören Spur B:
// hier nur lesen, nichts daran ändern.
const express = require("express");
const { buildStatus } = require("./status");
const presence = require("./presence");

function liveSources() {
  return {
    streamToolRow: (userId) => {
      const { db } = require("../streamTool/lib/streamToolStore");
      return db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?").get(userId) || null;
    },
    wcDoc: (userId) => {
      const wc = require("../winchallenge/winchallengeRoutes");
      const doc = wc.loadDb()[userId];
      // Kopie: ensureDocShape ergänzt fehlende Felder, der gespeicherte Stand bleibt unberührt
      return doc ? wc.ensureDocShape(JSON.parse(JSON.stringify(doc))) : null;
    },
    bingoSessions: (userId) => require("../bingo/routes").listSessionsOf(userId),
    wtSettings: (userId) => {
      const db = require("../clashRoyale/lib/winTrackerStore");
      return db.prepare("SELECT overlay_key FROM cr_wintracker_settings WHERE user_id = ?").get(userId) || null;
    },
    wtAccounts: (userId) => {
      const db = require("../clashRoyale/lib/winTrackerStore");
      return db.prepare(
        "SELECT player_name, player_tag, is_active, last_fetched FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY is_active DESC"
      ).all(userId);
    },
    vgRow: (userId) => {
      const row = require("../clashRoyale/viewerGames/viewerGamesStore").get(userId);
      if (!row) return null;
      const vg = require("../clashRoyale/viewerGames/viewerGames");
      return { overlay_key: row.overlay_key, settings: vg.normalizeSettings(row.settings) };
    },
    // Der Bot liest bei den Viewer Games nur mit, solange die Quelle abfragt — dann steht der Kanal hier drin
    vgLive: (login) => !!login && require("../clashRoyale/viewerGames/viewerGames").getChannels().includes(login),
    irc: () => require("../lib/winchallengeIrc").getIrcStatus(),
    presence: (userId) => presence.lastSeen(userId),
  };
}

module.exports = function createStreamerZentraleRouter({ requireAuth }) {
  const router = express.Router();
  router.get("/", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(buildStatus(liveSources(), { id: req.twitchId, login: req.twitchLogin }));
  });
  return router;
};
