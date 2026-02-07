// routes/pollRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const POLLS_FILE = path.join(__dirname, "../data/polls.json");

function loadPolls() {
  try {
    if (!fs.existsSync(POLLS_FILE)) return [];
    const data = fs.readFileSync(POLLS_FILE, "utf-8");
    return JSON.parse(data) || [];
  } catch (err) { return []; }
}

function savePolls(polls) {
  try { fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2), "utf-8"); } catch (e) {}
}

// Helper: Liste laden und via Socket senden
const broadcastPolls = (io) => {
    if (!io) return;
    const polls = loadPolls();
    io.emit("polls_update", polls); // Sende an ALLE verbundenen Clients
};

module.exports = function createPollRouter({ requireAuth, STREAMER_TWITCH_ID, io }) {
  const router = express.Router();
  
  // Auth Middleware (wie gehabt)
  const checkAuth = requireAuth || ((_req, res, next) => next()); 
  const isStreamer = (req) => String(req.twitchId) === String(STREAMER_TWITCH_ID);

  // GET
  router.get("/api/polls", (req, res) => res.json(loadPolls()));

  // GET SINGLE
  router.get("/api/polls/:id", (req, res) => {
    const p = loadPolls().find(x => x.id === Number(req.params.id));
    p ? res.json(p) : res.status(404).json({ error: "Not found" });
  });

  // CREATE
  router.post("/api/polls", checkAuth, (req, res) => {
    if (!isStreamer(req)) return res.status(403).json({ error: "Forbidden" });
    
    const polls = loadPolls();
    const newPoll = {
      id: Date.now(),
      title: req.body.title,
      background: req.body.background || "",
      endDate: req.body.endDate,
      questions: req.body.questions || [],
      votes: {},
      createdAt: Date.now(),
      createdBy: req.twitchId
    };
    
    polls.push(newPoll);
    savePolls(polls);
    
    broadcastPolls(io); // <--- LIVE UPDATE
    res.status(201).json(newPoll);
  });

  // DELETE
  router.delete("/api/polls/:id", checkAuth, (req, res) => {
    if (!isStreamer(req)) return res.status(403).json({ error: "Forbidden" });
    
    let polls = loadPolls();
    const initLen = polls.length;
    polls = polls.filter(p => p.id !== Number(req.params.id));
    
    if (polls.length !== initLen) {
        savePolls(polls);
        broadcastPolls(io); // <--- LIVE UPDATE
    }
    res.json({ ok: true });
  });

  // VOTE (PUT)
  router.put("/api/polls/:id", (req, res) => {
    const polls = loadPolls();
    const idx = polls.findIndex(p => p.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    const { votes } = req.body; // { "userid": "vote" }
    const userId = Object.keys(votes)[0];
    
    // Simpler Vote Merge
    polls[idx].votes = { ...polls[idx].votes, [userId]: votes[userId] };
    
    savePolls(polls);
    broadcastPolls(io); // <--- LIVE UPDATE
    
    res.json(polls[idx]);
  });

  return router;
};