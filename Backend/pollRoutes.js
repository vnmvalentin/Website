const express = require("express");
const fs = require("fs");
const path = require("path");

const POLLS_FILE = path.join(__dirname, "polls.json");

// ================ HELPER ==============

function loadPolls() {
  try {
    if (!fs.existsSync(POLLS_FILE)) return [];
    const data = fs.readFileSync(POLLS_FILE, "utf-8");
    if (!data.trim()) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("❌ Fehler beim Laden der Polls:", err);
    return [];
  }
}

function savePolls(polls) {
  try {
    fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Fehler beim Speichern der Polls:", err);
  }
}

// ---------------- ROUTER FACTORY ----------------
//
// Hinweis: In deinem index.js wird dieser Router auf "/" gemountet,
// deshalb bleiben die Pfade /api/polls/* unverändert.
module.exports = function createPollRouter({
  requireAuth: requireAuthIn,
  STREAMER_TWITCH_ID: STREAMER_TWITCH_ID_IN,
} = {}) {
  const router = express.Router();

  const requireAuth =
    requireAuthIn ||
    function requireAuthFallback(_req, res) {
      return res.status(401).json({ error: "Unauthorized" });
    };

  const STREAMER_TWITCH_ID =
    STREAMER_TWITCH_ID_IN || process.env.STREAMER_TWITCH_ID || "";

  const isStreamer = (req) => {
    const authId = String(req.twitchId || "");
    return !!STREAMER_TWITCH_ID && authId === String(STREAMER_TWITCH_ID);
  };

  // Alle Polls
  router.get("/api/polls", (_req, res) => {
    res.json(loadPolls());
  });

  // Einzelnen Poll
  router.get("/api/polls/:id", (req, res) => {
    const pollId = Number(req.params.id);
    const polls = loadPolls();
    const poll = polls.find((p) => Number(p.id) === pollId);
    if (!poll) return res.status(404).json({ error: "Poll nicht gefunden" });
    res.json(poll);
  });

  // Poll erstellen (nur Streamer)
  router.post("/api/polls", requireAuth, (req, res) => {
    if (!isStreamer(req)) {
      return res.status(403).json({ error: "Nur der Streamer darf Abstimmungen erstellen." });
    }

    const { title, background, endDate, questions } = req.body || {};
    if (!title || !endDate) {
      return res.status(400).json({ error: "Titel und Enddatum erforderlich" });
    }

    const polls = loadPolls();

    const newPoll = {
      id: Date.now(), // bewusst so gelassen (Frontend nutzt das auch)
      title: String(title).trim(),
      background: background ? String(background).trim() : "",
      endDate,
      questions: Array.isArray(questions) ? questions : [],
      votes: {},
      createdAt: Date.now(),
      createdBy: String(req.twitchId),
    };

    polls.push(newPoll);
    savePolls(polls);
    res.status(201).json(newPoll);
  });

  // Abstimmen (nur eingeloggte User; ein User nur einmal)
  router.put("/api/polls/:id", (req, res) => {
    try {
      const polls = loadPolls();

      const pollId = parseInt(req.params.id, 10);
      const index = polls.findIndex((p) => p.id === pollId);

      if (index === -1) {
        return res.status(404).json({ error: "Poll nicht gefunden" });
      }

      const currentPoll = polls[index];
      const { votes, replace } = req.body; // 👈 NEU

      const userIds = Object.keys(votes || {});
      if (userIds.length === 0) {
        return res.status(400).json({ error: "Keine User-ID übergeben" });
      }

      const userId = userIds[0];
      const userVote = votes[userId];

      if (!userVote) {
        return res.status(400).json({ error: "Keine Antwort übergeben" });
      }

      // 👇 nur blocken, wenn NICHT replace=true
      if (currentPoll.votes && currentPoll.votes[userId] && !replace) {
        return res.status(400).json({ error: "User hat bereits abgestimmt" });
      }

      // 👇 bei replace überschreiben wir einfach den Wert
      currentPoll.votes = { ...(currentPoll.votes || {}), [userId]: userVote };

      polls[index] = currentPoll;
      savePolls(polls);

      return res.json(currentPoll);
    } catch (err) {
      console.error("❌ Fehler beim Aktualisieren der Abstimmung:", err);
      res.status(500).json({ error: "Fehler beim Speichern der Stimme" });
    }
  });

  return router;
};

// optional: helpers exportierbar lassen
module.exports.loadPolls = loadPolls;
module.exports.savePolls = savePolls;
module.exports.POLLS_FILE = POLLS_FILE;
