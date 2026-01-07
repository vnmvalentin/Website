const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const AWARDS_DB_PATH = path.join(__dirname, "awards-submissions.json");
const DEFAULT_AWARDS_SEASON = 2026;

// =================== HELPER =====================================

function loadAwardsDb() {
  try {
    if (!fs.existsSync(AWARDS_DB_PATH)) {
      return { submissions: [] };
    }
    const raw = fs.readFileSync(AWARDS_DB_PATH, "utf8");
    if (!raw.trim()) return { submissions: [] };

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.submissions)) {
      return { submissions: [] };
    }
    return parsed;
  } catch (e) {
    console.error("Fehler beim Laden von awards-submissions.json:", e);
    return { submissions: [] };
  }
}

function saveAwardsDb(db) {
  try {
    fs.writeFileSync(AWARDS_DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Fehler beim Speichern von awards-submissions.json:", e);
  }
}

// =================== ROUTER FACTORY ==============================

module.exports = function createAwardsRouter({
  requireAuth: requireAuthIn,
  STREAMER_TWITCH_ID: STREAMER_TWITCH_ID_IN,
  AWARDS_SEASON: AWARDS_SEASON_IN,
} = {}) {
  const router = express.Router();

  // Fallbacks (sollten i.d.R. aus index.js kommen)
  const requireAuth =
    requireAuthIn ||
    function requireAuthFallback(_req, res) {
      return res.status(401).json({ error: "Unauthorized" });
    };

  const STREAMER_TWITCH_ID =
    STREAMER_TWITCH_ID_IN || process.env.STREAMER_TWITCH_ID || "";

  const AWARDS_SEASON = Number(AWARDS_SEASON_IN) || DEFAULT_AWARDS_SEASON;

  // Eigene Einsendung für aktuelle Season holen
  router.get("/submissions/me", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const db = loadAwardsDb();

    const entry =
      (db.submissions || []).find(
        (s) =>
          String(s.twitchId) === twitchId &&
          Number(s.season) === Number(AWARDS_SEASON)
      ) || null;

    res.json(entry);
  });

  // Einsendung upsert (oder löschen wenn keine Antworten mehr vorhanden)
  router.post("/submissions", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const twitchLogin = String(req.twitchLogin || "");
    const { season, answers } = req.body || {};

    const seasonYear = Number(season) || AWARDS_SEASON;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Keine Antworten übergeben." });
    }

    const db = loadAwardsDb();
    db.submissions = Array.isArray(db.submissions) ? db.submissions : [];

    // vorhandene Einsendung für diese Season finden
    const idx = db.submissions.findIndex(
      (s) =>
        String(s.twitchId) === twitchId &&
        Number(s.season) === seasonYear
    );
    const base = idx >= 0 ? db.submissions[idx] : null;

    // Freitext -> Arrays (Komma-Trennung)
    const cleanedAnswers = {};
    for (const [key, value] of Object.entries(answers)) {
      if (typeof value !== "string") continue;

      const parts = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!parts.length) continue;
      cleanedAnswers[key] = parts;
    }

    const hasAny = Object.keys(cleanedAnswers).length > 0;

    // Wenn nichts mehr übrig ist → Einsendung löschen (falls vorhanden)
    if (!hasAny) {
      if (idx >= 0) {
        const removed = db.submissions.splice(idx, 1)[0];
        saveAwardsDb(db);
        return res.json({
          ok: true,
          deleted: true,
          id: removed.id,
          season: seasonYear,
        });
      }

      // Es gab gar keine Einsendung, aber wir behandeln es trotzdem als "ok"
      return res.json({
        ok: true,
        deleted: false,
        season: seasonYear,
      });
    }

    const now = Date.now();

    const entry = {
      id: base?.id || nanoid(12),
      twitchId,
      twitchLogin,
      season: seasonYear,
      answers: cleanedAnswers,
      createdAt: base?.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      db.submissions[idx] = entry;
    } else {
      db.submissions.push(entry);
    }

    saveAwardsDb(db);
    res.json(entry);
  });

  // Alle Einsendungen (nur Streamer)
  router.get("/submissions", requireAuth, (req, res) => {
    const authId = String(req.twitchId);

    if (!STREAMER_TWITCH_ID || String(authId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({
        error: "Nur der Streamer darf die Award-Einsendungen sehen.",
      });
    }

    const db = loadAwardsDb();
    res.json(db);
  });

  return router;
};
