const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const DATA_PATH = path.join(__dirname, "../data/gameSessions.json");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (!fs.existsSync(path.dirname(DATA_PATH))) fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify([], null, 2));

module.exports = function ({ requireAuth, io }) {
  const router = express.Router();

  const getSessions = () => JSON.parse(fs.readFileSync(DATA_PATH, "utf8") || "[]");
  const saveSessions = (data) => {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    const active = data.filter(s => !s.ended);
    const expired = data.filter(s => s.ended);
    io.emit("sessions_update", { active, expired });
  };

  router.get("/search-games", async (req, res) => {
      const query = req.query.q;

      if (!query || query.length < 2) return res.json([]);

      try {
          // 1. Prüfen, ob der API Key geladen wurde
          const apiKey = process.env.RAWG_API_KEY;
          if (!apiKey) {
              console.error("[GameSearch] FEHLER: RAWG_API_KEY fehlt in der .env Datei!");
              return res.json([]); // Oder res.status(500).json({error: "Server Config Error"})
          }

          // 2. Anfrage an RAWG senden
          const url = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(query)}&page_size=5`;
          

          const rawgRes = await fetch(url);
          
          if (!rawgRes.ok) {
              console.error(`[GameSearch] RAWG API Fehler: ${rawgRes.status} ${rawgRes.statusText}`);
              return res.json([]);
          }

          const data = await rawgRes.json();

          const results = (data.results || []).map(g => ({
              id: g.id,
              name: g.name,
              image: g.background_image
          }));

          res.json(results);

      } catch (e) {
          console.error("[GameSearch] CRITICAL ERROR:", e);
          res.json([]);
      }
  });

  router.get("/", (req, res) => {
    const sessions = getSessions();
    const now = Date.now();
    const active = [];
    const expired = [];

    sessions.forEach(s => {
        let isExpired = s.ended;
        if (!isExpired && s.date) {
            const sessionTime = new Date(s.date).getTime() + ONE_DAY_MS; 
            if (sessionTime < now) isExpired = true;
        }
        if (isExpired) expired.push(s); else active.push(s);
    });
    res.json({ active, expired });
  });

  // POST: Create
  router.post("/", requireAuth, (req, res) => {
    // FIX: 'date' hier hinzugefügt!
    const { title, game, backgroundImage, description, date, assets, schedulingType, timeOptions, fixedTime } = req.body;
    if (!title || !game) return res.status(400).json({ error: "Pflichtfelder fehlen" });

    const sessions = getSessions();
    const newSession = {
      id: nanoid(10),
      author: { id: req.twitchId, displayName: req.twitchLogin },
      createdAt: Date.now(),
      date: date || new Date().toISOString().split('T')[0],
      ended: false,
      title, game, backgroundImage: backgroundImage || "", description,
      assets: assets || [],
      schedulingType, fixedTime, timeOptions,
      participants: []
    };

    sessions.push(newSession);
    saveSessions(sessions);
    res.json({ success: true, session: newSession });
  });

  // PUT: Update
  router.put("/:id", requireAuth, (req, res) => {
    const sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Nicht gefunden" });

    const session = sessions[idx];
    const isAdmin = req.twitchId === "160224748"; 
    if (session.author.id !== req.twitchId && !isAdmin) return res.status(403).json({ error: "Keine Rechte" });

    // FIX: 'date' hier hinzugefügt!
    const { title, game, backgroundImage, description, date, assets, schedulingType, timeOptions, fixedTime } = req.body;
    
    sessions[idx] = {
        ...session,
        date: date || session.date,
        title: title || session.title,
        game: game || session.game,
        backgroundImage: backgroundImage !== undefined ? backgroundImage : session.backgroundImage,
        description: description !== undefined ? description : session.description,
        assets: assets || session.assets,
        schedulingType: schedulingType || session.schedulingType,
        timeOptions: timeOptions || session.timeOptions,
        fixedTime: fixedTime || session.fixedTime
    };

    saveSessions(sessions);
    res.json({ success: true, session: sessions[idx] });
  });

  // Actions
  router.post("/:id/join", requireAuth, (req, res) => {
    const { availability } = req.body;
    const sessions = getSessions();
    const s = sessions.find(x => x.id === req.params.id);
    if (!s || s.ended) return res.status(400).json({ error: "Fehler" });

    const pIdx = s.participants.findIndex(p => p.userId === req.twitchId);
    const pData = { userId: req.twitchId, displayName: req.twitchLogin, availability: availability || "Dabei", joinedAt: Date.now() };
    if (pIdx >= 0) s.participants[pIdx] = pData; else s.participants.push(pData);
    saveSessions(sessions);
    res.json({ success: true });
  });
  
  router.post("/:id/leave", requireAuth, (req, res) => {
      const sessions = getSessions();
      const s = sessions.find(x => x.id === req.params.id);
      if (s) { s.participants = s.participants.filter(p => p.userId !== req.twitchId); saveSessions(sessions); }
      res.json({ success: true });
  });

  router.delete("/:id", requireAuth, (req, res) => {
      let sessions = getSessions();
      sessions = sessions.filter(s => s.id !== req.params.id);
      saveSessions(sessions);
      res.json({ success: true });
  });

  router.post("/:id/end", requireAuth, (req, res) => {
      const sessions = getSessions();
      const s = sessions.find(x => x.id === req.params.id);
      if (s) { s.ended = true; saveSessions(sessions); }
      res.json({ success: true });
  });

  router.post("/:id/kick", requireAuth, (req, res) => {
    const { userIdToKick } = req.body;
    const sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Session nicht gefunden" });
    
    const session = sessions[idx];
    const isAdmin = req.twitchId === "160224748";
    if (session.author.id !== req.twitchId && !isAdmin) return res.status(403).json({ error: "Nur der Host darf kicken." });

    session.participants = session.participants.filter(p => p.userId !== userIdToKick);
    saveSessions(sessions);
    res.json({ success: true });
  });

  return router;
};