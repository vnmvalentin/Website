const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

/* ================= FETCH ================= */

async function safeFetch(...args) {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch(...args);
  }
  const mod = await import("node-fetch");
  return mod.default(...args);
}

/* ================= KONFIG ================= */

const GIVEAWAYS_PATH = path.join(__dirname, "../data/giveaways.json");
const DISCORD_GIVEAWAY_WEBHOOK_URL =
  process.env.DISCORD_GIVEAWAY_WEBHOOK_URL || "";

/* ================= HELPER ================= */

function loadGiveaways() {
  try {
    if (!fs.existsSync(GIVEAWAYS_PATH)) return [];
    const raw = fs.readFileSync(GIVEAWAYS_PATH, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Giveaways laden fehlgeschlagen:", e);
    return [];
  }
}

function saveGiveaways(list) {
  try {
    fs.writeFileSync(GIVEAWAYS_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.error("Giveaways speichern fehlgeschlagen:", e);
  }
}

function normalizeGiveaway(raw = {}) {
  const quantity = Math.max(1, parseInt(raw.quantity || 1, 10));

  const endDate =
    typeof raw.endDate === "number"
      ? raw.endDate
      : Date.parse(raw.endDate || Date.now());

  return {
    id: raw.id || nanoid(10),
    title: raw.title || "",
    prize: raw.prize || "",
    quantity,
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    endDate,
    createdAt: raw.createdAt || Date.now(),
    createdBy: raw.createdBy || "",
    participants: raw.participants || {},
    winners: raw.winners || [],
    discordNotified: !!raw.discordNotified,
  };
}

/* ================= GIVEAWAY FINALIZE ================= */

async function maybeFinalizeGiveaway(giveaway) {
  const now = Date.now();

  if (giveaway.winners.length > 0) return giveaway;
  if (!giveaway.endDate || giveaway.endDate > now) return giveaway;

  const participantIds = Object.keys(giveaway.participants || {});
  const maxWinners = Math.min(giveaway.quantity, participantIds.length);

  const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, maxWinners);

  giveaway.winners = winners;

  if (DISCORD_GIVEAWAY_WEBHOOK_URL && !giveaway.discordNotified) {
    const names = winners.map(
      (id) => giveaway.participants[id]?.displayName || id
    );

    const content =
      `🎁 **Giveaway beendet**\n` +
      `**${giveaway.title}**\n` +
      `Gewinn: ${giveaway.prize || "-"}\n` +
      `Gewinner (${names.length}): ${names.map((n) => `**${n}**`).join(", ")}`;

    try {
      await safeFetch(DISCORD_GIVEAWAY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      giveaway.discordNotified = true;
    } catch (e) {
      console.error("Discord Webhook Fehler:", e);
    }
  }

  return giveaway;
}

/* ================= HINTERGRUND-JOB ================= */

async function finalizeExpiredGiveaways() {
  let list = loadGiveaways().map(normalizeGiveaway);
  let changed = false;

  for (let i = 0; i < list.length; i++) {
    const before = JSON.stringify(list[i]);
    list[i] = await maybeFinalizeGiveaway({ ...list[i] });
    if (before !== JSON.stringify(list[i])) {
      changed = true;
    }
  }

  if (changed) {
    saveGiveaways(list);
    console.log("[Giveaways] Automatisch finalisiert");
  }
}

// ⏱ alle 60 Sekunden prüfen
setInterval(() => {
  finalizeExpiredGiveaways().catch(console.error);
}, 60 * 1000);

/* ================= ROUTER ================= */

module.exports = function createGiveawayRouter({
  requireAuth,
  STREAMER_TWITCH_ID,
} = {}) {
  const router = express.Router();

  /* ---------- GET LIST ---------- */

  router.get("/api/giveaways", async (_req, res) => {
    const list = loadGiveaways().map(normalizeGiveaway);
    const now = Date.now();

    res.json({
      active: list.filter((g) => g.endDate > now),
      expired: list.filter((g) => g.endDate <= now),
    });
  });

  /* ---------- CREATE ---------- */

  router.post("/api/giveaways", requireAuth, (req, res) => {
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: "Nur Streamer erlaubt." });
    }

    const { title, prize, quantity, endDate, requirements } = req.body;

    if (!title || !endDate) {
      return res.status(400).json({ error: "Titel & Enddatum fehlen." });
    }

    const list = loadGiveaways();
    list.push(
      normalizeGiveaway({
        id: nanoid(10),
        title,
        prize,
        quantity,
        requirements,
        endDate,
        createdBy: req.twitchId,
      })
    );

    saveGiveaways(list);
    res.status(201).json({ ok: true });
  });

  /* ---------- DELETE ---------- */

  router.delete("/api/giveaways/:id", requireAuth, (req, res) => {
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: "Nur Streamer erlaubt." });
    }

    const list = loadGiveaways();
    const idx = list.findIndex((g) => g.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: "Nicht gefunden." });
    }

    list.splice(idx, 1);
    saveGiveaways(list);
    res.json({ ok: true });
  });

  /* ---------- JOIN ---------- */

  router.post("/api/giveaways/:id/join", requireAuth, (req, res) => {
    const list = loadGiveaways().map(normalizeGiveaway);
    const g = list.find((x) => x.id === req.params.id);

    if (!g || g.endDate <= Date.now()) {
      return res.status(400).json({ error: "Giveaway beendet." });
    }

    g.participants[req.twitchId] = {
      id: req.twitchId,
      displayName: req.body.displayName,
      profileImageUrl: req.body.profileImageUrl,
    };

    saveGiveaways(list);
    res.json({ ok: true });
  });

  /* ---------- LEAVE ---------- */

  router.post("/api/giveaways/:id/leave", requireAuth, (req, res) => {
    const list = loadGiveaways().map(normalizeGiveaway);
    const g = list.find((x) => x.id === req.params.id);

    if (!g || g.endDate <= Date.now()) {
      return res.status(400).json({ error: "Giveaway beendet." });
    }

    delete g.participants[req.twitchId];
    saveGiveaways(list);
    res.json({ ok: true });
  });

  return router;
};
