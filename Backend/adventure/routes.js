// adventure/routes.js — API von adVentures (/api/adventure). Speichert in data/adventures-users.json (Admin-Dashboard
// und Promo-Codes lesen dieselbe Datei).
//
// Seit dem Umbau (v2) gibt es keine Käufe mehr: Kits schalten sich über die Account-Stufe frei, Ausrüstung findet man im
// Lauf. Credits gibt es auf der Website nicht mehr (Oktober 2026) — Läufe bringen nur Account-XP, Punkte und Erfolge.
// Alte Konten werden beim ersten Aufruf auf v2 gehoben: gekaufte Skins bleiben als Kits frei, Powerups und Slots fallen weg.
//
// Ein Lauf: POST /start-run → (POST /save-run am Anfang jeder Welt) → POST /end-run. Der Server prüft die gemeldeten
// Werte grob gegen die echte Laufzeit, damit niemand sich per Hand Stufen schickt.

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { readJson, writeJsonAtomic } = require("../lib/jsonFile");
const P = require("./progression");
const M = require("./meta");

const GAME_DATA_PATH = path.join(__dirname, "../data/adventures-users.json");
const SCHEMA = 2;
const MAX_SNAPSHOT_BYTES = 24_000;
const HISTORY_SIZE = 20;

const loadGameData = () => readJson(GAME_DATA_PATH, {});
const saveGameData = (data) => writeJsonAtomic(GAME_DATA_PATH, data);

// Liefert den Nutzer (legt ihn an / hebt ihn auf v2)
function ensureUser(db, id, name) {
  if (!db[id]) db[id] = { name: name || "Unbekannt", skins: ["default"], highScore: 0 };
  const u = db[id];
  if (name) u.name = name;
  if (!Array.isArray(u.skins)) u.skins = ["default"];
  if (u.v !== SCHEMA) {
    if (u.highScore) u.legacyHighScore = u.highScore;
    u.highScore = 0;
    u.xp = u.xp || 0;
    u.runs = u.runs || 0;
    u.wins = u.wins || 0;
    u.discovered = Array.isArray(u.discovered) ? u.discovered : [];
    u.best = u.best || null;
    delete u.powerups; delete u.loadout; delete u.unlockedSlots; delete u.activeRun; delete u.activeSkin;
    u.v = SCHEMA;
  }
  delete u.refundNotice; // Hinweis auf die frühere Credit-Erstattung
  return u;
}

function profilePayload(u) {
  const lv = P.levelInfo(u.xp);
  const unlocks = P.unlocksFor(lv.level, u.skins);
  return {
    name: u.name,
    xp: u.xp,
    level: lv.level,
    levelXp: lv.into,
    levelNeed: lv.need,
    unlocks,
    track: P.UNLOCK_TRACK,
    discovered: u.discovered || [],
    runs: u.runs || 0,
    wins: u.wins || 0,
    best: u.best || null,
    legacyHighScore: u.legacyHighScore || 0,
    activeRun: u.activeRun ? { kitId: u.activeRun.kitId, difficulty: u.activeRun.difficulty, mode: u.activeRun.mode || "normal", ascension: u.activeRun.ascension || 0, stageIndex: u.activeRun.snapshot?.stageIndex ?? 0, loop: u.activeRun.snapshot?.loop ?? 0, time: u.activeRun.snapshot?.time ?? 0, hasSnapshot: !!u.activeRun.snapshot } : null,
    achievements: u.achievements || [],
    achievementDefs: M.ACHIEVEMENT_DEFS,
    ascension: u.ascension || 0,
    ascensions: M.ASCENSIONS,
    daily: { day: M.dayKey(), best: u.daily?.day === M.dayKey() ? u.daily.best : null },
  };
}

const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
// Bestwert = meiste Punkte. Alte Einträge (vor den Punkten) werden aus ihren gespeicherten Werten nachgerechnet.
const scoreOf = (entry) => entry.score ?? P.runScore({ kills: entry.kills, stagesCleared: entry.stages, timeSec: entry.timeSec, won: entry.won, difficulty: entry.difficulty });
const better = (a, b) => !b || scoreOf(a) > scoreOf(b);

// Bestwerte pro Kit und pro Woche (für die Filter der Bestenliste). Ältere Konten haben nur user.best.
function recordBests(user, entry) {
  user.kitBest = user.kitBest || (user.best ? { [user.best.kitId]: user.best } : {});
  if (better(entry, user.kitBest[entry.kitId])) user.kitBest[entry.kitId] = entry;
  const week = M.weekKey();
  if (!user.weekBest || user.weekBest.week !== week) user.weekBest = { week, all: null, kits: {} };
  if (better(entry, user.weekBest.all)) user.weekBest.all = entry;
  if (better(entry, user.weekBest.kits[entry.kitId])) user.weekBest.kits[entry.kitId] = entry;
}

// Was der Client zusätzlich meldet — nur für Verlauf und kosmetische Erfolge, darum nur Form und Größe prüfen
const ID_RE = /^[a-z0-9]{2,24}$/;
const cleanText = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, max);
function cleanExtra(b) {
  const list = (arr, max, map) => (Array.isArray(arr) ? arr.slice(0, max).map(map).filter(Boolean) : []);
  return {
    evolutions: int(b.evolutions, 8),
    champions: int(b.champions, 60),
    loop: int(b.loop, 20),
    itemCount: int(b.itemCount, 500),
    weapons: list(b.weapons, 6, (w) => (w && ID_RE.test(w.id) ? { id: w.id, level: Math.max(1, int(w.level, 5)) } : null)),
    itemStacks: list(b.itemStacks, 60, (it) => (it && ID_RE.test(it.id) ? { id: it.id, n: Math.max(1, int(it.n, 99)) } : null)),
    deathCause: b.deathCause && typeof b.deathCause === "object"
      ? { name: cleanText(b.deathCause.name, 40), affixes: list(b.deathCause.affixes, 3, (a) => cleanText(a, 20) || null), boss: !!b.deathCause.boss, champion: !!b.deathCause.champion }
      : null,
  };
}

module.exports = function createAdventureRouter({ requireAuth }) {
  const router = express.Router();

  // Laden und ggf. auf v2 heben
  function withUser(req) {
    const db = loadGameData();
    const user = ensureUser(db, req.twitchId, req.twitchLogin);
    return { db, user };
  }

  router.get("/profile", requireAuth, (req, res) => {
    const { db, user } = withUser(req);
    saveGameData(db);
    res.json(profilePayload(user));
  });

  // Tageslauf (mode "daily"): gleicher Seed für alle, immer Normal, alle Items im Pool, kein Startgeschenk — damit die
  // Tagesbestenliste fair ist. Albtraum+ gibt es nur auf Albtraum und nur bis zur freigespielten Stufe.
  router.post("/start-run", requireAuth, (req, res) => {
    const { kitId, skin = "" } = req.body || {};
    const mode = req.body?.mode === "daily" ? "daily" : "normal";
    const { db, user } = withUser(req);
    const lv = P.levelInfo(user.xp);
    const unlocks = P.unlocksFor(lv.level, user.skins);
    const difficulty = mode === "daily" ? "normal" : req.body?.difficulty;
    if (!unlocks.kits.includes(kitId)) return res.status(400).json({ error: "Dieses Kit ist noch nicht freigeschaltet." });
    if (!unlocks.difficulties.includes(difficulty)) return res.status(400).json({ error: "Diese Schwierigkeit ist noch nicht freigeschaltet." });
    if (!M.skinUnlocked(user.achievements, kitId, skin)) return res.status(400).json({ error: "Diese Farbvariante ist noch nicht freigeschaltet." });
    const ascension = difficulty === "hard" && mode === "normal" ? int(req.body?.ascension, M.MAX_ASCENSION) : 0;
    if (ascension > (user.ascension || 0)) return res.status(400).json({ error: "Diese Albtraum+-Stufe ist noch nicht freigeschaltet." });
    const day = M.dayKey();
    const seed = mode === "daily" ? M.dailySeed(day) : crypto.randomInt(1, 2 ** 31 - 1);
    user.activeRun = { id: crypto.randomUUID(), kitId, difficulty, seed, mode, day: mode === "daily" ? day : undefined, skin: skin || "", ascension, startedAt: Date.now(), snapshot: null };
    user.runs = (user.runs || 0) + 1;
    saveGameData(db);
    res.json({
      runId: user.activeRun.id, seed, mode, skin: skin || "", ascension, difficulty,
      lockedItems: mode === "daily" ? [] : unlocks.lockedItems, startItems: mode === "daily" ? 0 : unlocks.startItems,
    });
  });

  router.post("/save-run", requireAuth, (req, res) => {
    const { runId, snapshot } = req.body || {};
    const { db, user } = withUser(req);
    if (!user.activeRun || user.activeRun.id !== runId) return res.status(409).json({ error: "Kein passender Lauf aktiv." });
    if (!snapshot || snapshot.v !== 1 || snapshot.kitId !== user.activeRun.kitId || snapshot.seed !== user.activeRun.seed) {
      return res.status(400).json({ error: "Ungültiger Spielstand." });
    }
    if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return res.status(413).json({ error: "Spielstand zu groß." });
    user.activeRun.snapshot = snapshot;
    user.activeRun.savedAt = Date.now();
    saveGameData(db);
    res.json({ success: true });
  });

  router.get("/load-run", requireAuth, (req, res) => {
    const { db, user } = withUser(req);
    saveGameData(db);
    if (!user.activeRun) return res.json({ success: false });
    const lv = P.levelInfo(user.xp);
    const unlocks = P.unlocksFor(lv.level, user.skins);
    const r = user.activeRun;
    res.json({ success: true, run: { runId: r.id, kitId: r.kitId, difficulty: r.difficulty, seed: r.seed, snapshot: r.snapshot, mode: r.mode || "normal", skin: r.skin || "", ascension: r.ascension || 0,
      lockedItems: r.mode === "daily" ? [] : unlocks.lockedItems } });
  });

  router.post("/abandon-run", requireAuth, (req, res) => {
    const { db, user } = withUser(req);
    delete user.activeRun;
    saveGameData(db);
    res.json({ success: true });
  });

  router.post("/end-run", requireAuth, (req, res) => {
    const b = req.body || {};
    const { db, user } = withUser(req);
    const run = user.activeRun;
    if (!run || run.id !== b.runId) return res.status(409).json({ error: "Kein passender Lauf aktiv." });

    // Grobe Plausibilität gegen die echte Zeit seit dem Start
    const elapsed = (Date.now() - run.startedAt) / 1000;
    const stagesCleared = Math.min(int(b.stagesCleared, 60), Math.floor(elapsed / 35));
    const bossesKilled = Math.min(int(b.bossesKilled, 70), stagesCleared + 1);
    const kills = Math.min(int(b.kills, 100000), Math.floor(elapsed * 8) + 50);
    const timeSec = Math.min(int(b.timeSec, 36000), Math.floor(elapsed) + 30);
    const won = !!b.won && bossesKilled >= 6;
    const mode = run.mode || "normal";
    const ascension = run.ascension || 0;
    const result = { kills, stagesCleared, bossesKilled, timeSec, won, difficulty: run.difficulty, mode, ascension, kitId: run.kitId };
    const extra = cleanExtra(b);

    const before = P.levelInfo(user.xp);
    const unlocksBefore = P.unlocksFor(before.level, user.skins);
    const xpGained = P.runXp(result);
    user.xp = (user.xp || 0) + xpGained;
    const after = P.levelInfo(user.xp);
    const unlocksAfter = P.unlocksFor(after.level, user.skins);
    const newUnlocks = P.UNLOCK_TRACK.filter((u) => u.level > before.level && u.level <= after.level).map((u) => u.label);

    if (won) user.wins = (user.wins || 0) + 1;
    const score = P.runScore(result);
    const entry = { score, stages: stagesCleared, bosses: bossesKilled, timeSec, kitId: run.kitId, difficulty: run.difficulty, ascension, mode, won, kills, at: Date.now() };
    const isRecord = better(entry, user.best);
    if (isRecord) user.best = entry;
    const bestScore = scoreOf(user.best);
    user.highScore = user.best?.stages || 0; // fürs Admin-Dashboard
    recordBests(user, entry);

    // Tageslauf: zählt nur am selben Tag, an dem er gestartet wurde
    let dailyBest = null;
    if (mode === "daily" && run.day === M.dayKey()) {
      if (!user.daily || user.daily.day !== run.day) user.daily = { day: run.day, best: null };
      if (better(entry, user.daily.best)) user.daily.best = entry;
      dailyBest = scoreOf(user.daily.best);
    }

    // Albtraum+: Sieg auf der höchsten freien Stufe schaltet die nächste frei
    if (won && run.difficulty === "hard" && mode === "normal" && ascension === (user.ascension || 0) && ascension < M.MAX_ASCENSION) {
      user.ascension = ascension + 1;
      newUnlocks.push(`Albtraum+ ${user.ascension}`);
    }

    const gained = M.newAchievements(user.achievements, result, extra);
    if (gained.length) user.achievements = [...(user.achievements || []), ...gained.map((a) => a.id)];

    user.history = [{ ...entry, weapons: extra.weapons, items: extra.itemStacks, deathCause: extra.deathCause }, ...(user.history || [])].slice(0, HISTORY_SIZE);

    if (Array.isArray(b.items)) {
      const seen = new Set(user.discovered || []);
      for (const id of b.items.slice(0, 120)) if (typeof id === "string" && /^[a-z0-9]{2,24}$/.test(id)) seen.add(id);
      user.discovered = [...seen];
    }
    delete user.activeRun;

    saveGameData(db);

    res.json({
      success: true, xpGained, isRecord, score, bestScore, dailyBest,
      newAchievements: gained.map(({ test: _t, ...a }) => a),
      levelBefore: before.level, levelAfter: after.level, levelXp: after.into, levelNeed: after.need,
      newUnlocks, newKits: unlocksAfter.kits.filter((k) => !unlocksBefore.kits.includes(k)),
      result,
    });
  });

  // ?scope=all|week|daily und optional ?kit=<id>. Der Tageslauf hat keinen Kit-Filter (jeder spielt denselben Seed).
  router.get("/leaderboard", (req, res) => {
    const db = loadGameData();
    const scope = ["week", "daily"].includes(req.query.scope) ? req.query.scope : "all";
    const kit = P.KIT_IDS.includes(req.query.kit) ? req.query.kit : null;
    const week = M.weekKey();
    const day = M.dayKey();
    const pick = (u) => {
      if (scope === "daily") return u.daily?.day === day ? u.daily.best : null;
      if (scope === "week") return u.weekBest?.week === week ? (kit ? u.weekBest.kits?.[kit] : u.weekBest.all) : null;
      if (kit) return u.kitBest?.[kit] ?? (u.best?.kitId === kit ? u.best : null);
      return u.best;
    };
    const rows = Object.values(db)
      .map((u) => ({ u, e: pick(u) }))
      .filter(({ e }) => e && scoreOf(e) > 0)
      .map(({ u, e }) => ({ u, e, score: scoreOf(e) }))
      .sort((a, b) => (b.score - a.score) || (a.e.timeSec - b.e.timeSec))
      .slice(0, 50)
      .map(({ u, e, score }) => ({
        name: u.name, score, stages: e.stages, timeSec: e.timeSec, kitId: e.kitId, won: !!e.won,
        difficulty: e.difficulty, ascension: e.ascension || 0, level: P.levelInfo(u.xp).level,
      }));
    res.json(rows);
  });

  router.get("/history", requireAuth, (req, res) => {
    const db = loadGameData();
    res.json(db[req.twitchId]?.history || []);
  });

  router.post("/feedback", requireAuth, async (req, res) => {
    const message = String(req.body?.message || "").trim().slice(0, 1500);
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!message) return res.status(400).json({ error: "Nachricht darf nicht leer sein." });
    if (!webhook) return res.status(500).json({ error: "Feedback ist gerade nicht eingerichtet." });
    try {
      const r = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "adVentures Feedback",
          embeds: [{ title: "Feedback / Bugreport", color: 15770428,
            fields: [{ name: "User", value: req.twitchLogin || "Unbekannt", inline: true }, { name: "Nachricht", value: message }],
            footer: { text: `Gesendet am ${new Date().toLocaleString("de-DE")}` } }],
        }),
      });
      if (!r.ok) { console.error("adVentures Feedback:", await r.text()); return res.status(502).json({ error: "Discord hat das Feedback abgelehnt." }); }
      res.json({ success: true });
    } catch (e) {
      console.error("adVentures Feedback:", e);
      res.status(500).json({ error: "Feedback konnte nicht gesendet werden." });
    }
  });

  return router;
};

module.exports.ensureUser = ensureUser;
