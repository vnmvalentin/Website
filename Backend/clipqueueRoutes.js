const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const CLIPQUEUE_DB_PATH = path.join(__dirname, "clipqueue.json");

// ==================== HELPER ===================================

const DEFAULT_CLIPQUEUE_CONFIG = {
  enabled: false,
  allowedPlatforms: {
    twitch: true,
    kick: true,
    youtube: true,
    tiktok: true,
    instagram: true,
  },
  maxDurationSec: 120, // z.B. 2 Minuten
  queue: [],
};

function loadClipQueueDb() {
  try {
    if (!fs.existsSync(CLIPQUEUE_DB_PATH)) return {};
    const raw = fs.readFileSync(CLIPQUEUE_DB_PATH, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Laden von clipqueue.json:", e);
    return {};
  }
}

function saveClipQueueDb(db) {
  try {
    fs.writeFileSync(CLIPQUEUE_DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Fehler beim Speichern von clipqueue.json:", e);
  }
}

function ensureClipQueueEntry(db, twitchId) {
  const id = String(twitchId);

  if (!db[id]) {
    db[id] = {
      ...DEFAULT_CLIPQUEUE_CONFIG,
      twitchId: id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } else {
    const existing = db[id] || {};
    db[id] = {
      ...DEFAULT_CLIPQUEUE_CONFIG,
      ...existing,
      allowedPlatforms: {
        ...DEFAULT_CLIPQUEUE_CONFIG.allowedPlatforms,
        ...(existing.allowedPlatforms || {}),
      },
      queue: Array.isArray(existing.queue) ? existing.queue : [],
      twitchId: id,
      updatedAt: existing.updatedAt || Date.now(),
    };
  }

  return db[id];
}

// =================== ROUTER FACTORY ==============================

module.exports = function createClipqueueRouter({ requireAuth: requireAuthIn } = {}) {
  const router = express.Router();

  const requireAuth =
    requireAuthIn ||
    function requireAuthFallback(_req, res) {
      return res.status(401).json({ error: "Unauthorized" });
    };

  // ========== CLIP-QUEUE ROUTEN ==========

  // Config + Queue des eingeloggten Streamers holen
  router.get("/me", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const db = loadClipQueueDb();
    const entry = ensureClipQueueEntry(db, twitchId);
    saveClipQueueDb(db);
    res.json(entry);
  });

  // Config updaten (aktiviert/deaktiviert, Plattformen, max. Länge)
  router.put("/me", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const db = loadClipQueueDb();
    const entry = ensureClipQueueEntry(db, twitchId);
    const body = req.body || {};

    entry.enabled =
      typeof body.enabled === "boolean" ? body.enabled : entry.enabled;

    entry.allowedPlatforms = {
      ...entry.allowedPlatforms,
      ...(body.allowedPlatforms || {}),
    };

    const maxDuration = Number(body.maxDurationSec);
    if (Number.isFinite(maxDuration)) {
      entry.maxDurationSec = Math.max(1, maxDuration);
    }

    entry.updatedAt = Date.now();
    db[twitchId] = entry;
    saveClipQueueDb(db);

    res.json(entry);
  });

  // Skip-Button: ersten Clip aus der Queue entfernen
  router.post("/me/skip", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const db = loadClipQueueDb();
    const entry = ensureClipQueueEntry(db, twitchId);

    if (entry.queue && entry.queue.length > 0) {
      entry.queue.shift();
      entry.updatedAt = Date.now();
      db[twitchId] = entry;
      saveClipQueueDb(db);
    }

    res.json(entry);
  });

  // Optional: Einzelnen Clip per ID aus der Queue löschen
  router.delete("/me/:clipId", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const { clipId } = req.params;

    const db = loadClipQueueDb();
    const entry = ensureClipQueueEntry(db, twitchId);

    entry.queue = (entry.queue || []).filter(
      (c) => String(c.id) !== String(clipId)
    );
    entry.updatedAt = Date.now();
    db[twitchId] = entry;
    saveClipQueueDb(db);

    res.json(entry);
  });

  // Clip hinzufügen
  router.post("/me/clip", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const { url, platform, durationSec, title, submittedBy } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Keine gültige URL übergeben" });
    }

    const db = loadClipQueueDb();
    const entry = ensureClipQueueEntry(db, twitchId);

    if (!entry.enabled) {
      return res.json({
        ok: true,
        added: false,
        reason: "Clip-Queue ist deaktiviert",
      });
    }

    const plat = String(platform || "").toLowerCase();
    if (!entry.allowedPlatforms[plat]) {
      return res.json({
        ok: true,
        added: false,
        reason: `Plattform ${plat || "-"} ist deaktiviert`,
      });
    }

    const dur = Number(durationSec || 0);
    if (entry.maxDurationSec && dur > entry.maxDurationSec) {
      return res.json({
        ok: true,
        added: false,
        reason: "Clip ist länger als erlaubte Maximaldauer",
      });
    }

    const clip = {
      id: nanoid(10),
      url,
      platform: plat,
      durationSec: dur || 0,
      title: title || "",
      submittedBy: submittedBy || "",
      createdAt: Date.now(),
    };

    entry.queue = entry.queue || [];
    entry.queue.push(clip);
    entry.updatedAt = Date.now();

    db[twitchId] = entry;
    saveClipQueueDb(db);

    res.json({ ok: true, added: true, clipCount: entry.queue.length });
  });

  return router;
};
