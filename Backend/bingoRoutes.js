const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const BINGO_THEMES_PATH = path.join(__dirname, "bingo-themes.json");
const BINGO_SESSIONS_PATH = path.join(__dirname, "bingo-sessions.json");

// ---- Helpers ----
function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("readJson failed:", filePath, e);
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  try {
    const tmp = filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error("writeJsonAtomic failed:", filePath, e);
  }
}

function clampInt(n, min, max, fallback) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeWords(input) {
  const lines = Array.isArray(input)
    ? input
    : String(input || "")
        .split("\n")
        .map((s) => s.trim());

  const cleaned = [];
  const seen = new Set();
  for (const w of lines) {
    const t = String(w || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(t);
  }
  return cleaned;
}

const DEFAULT_STYLE = {
  cardBg: "#000000",
  cardOpacity: 0.6,
  textColor: "#ffffff",
  lineColor: "#ffffff",
  lineWidth: 2,
  // multiplier for the computed grid font size (0.7 .. 1.8)
  textScale: 0.8,
};

function normalizeStyle(style = {}) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  s.cardBg = typeof s.cardBg === "string" ? s.cardBg : DEFAULT_STYLE.cardBg;
  s.textColor =
    typeof s.textColor === "string" ? s.textColor : DEFAULT_STYLE.textColor;
  s.lineColor =
    typeof s.lineColor === "string" ? s.lineColor : DEFAULT_STYLE.lineColor;

  const op = Number(s.cardOpacity);
  s.cardOpacity = Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : 0.6;

  const lw = parseInt(s.lineWidth, 10);
  s.lineWidth = Number.isFinite(lw) ? Math.min(8, Math.max(1, lw)) : 2;

  const ts = Number(s.textScale);
  s.textScale = Number.isFinite(ts)
    ? Math.min(1.8, Math.max(0.7, ts))
    : DEFAULT_STYLE.textScale;

  return s;
}

function emptyCard(gridSize) {
  const n = gridSize * gridSize;
  return Array.from({ length: n }, () => ({
    text: "",
    mark: "none", // none | x | color
    markColor: "",
  }));
}

function makeCard(words, gridSize) {
  const n = gridSize * gridSize;
  const pool = shuffle(Array.isArray(words) ? words : []);
  const cells = emptyCard(gridSize);
  for (let i = 0; i < n; i++) {
    cells[i].text = pool[i] || "";
  }
  return cells;
}

function canMarkNow(session) {
  return session?.mode === "single" || !!session.locked;
}

function ensureBingoFilesExist() {
  if (!fs.existsSync(BINGO_THEMES_PATH)) {
    writeJsonAtomic(BINGO_THEMES_PATH, []);
  }
  if (!fs.existsSync(BINGO_SESSIONS_PATH)) {
    writeJsonAtomic(BINGO_SESSIONS_PATH, {});
  }
}

function loadThemes() {
  ensureBingoFilesExist();
  return readJson(BINGO_THEMES_PATH, []);
}

function loadSessions() {
  ensureBingoFilesExist();
  return readJson(BINGO_SESSIONS_PATH, {});
}

function saveSessions(sessions) {
  writeJsonAtomic(BINGO_SESSIONS_PATH, sessions);
}

// --- Permissions ---
const DEFAULT_PLAYER_PERMS = {
  canEditWords: false,
  canEditDesign: false,
  canRandomize: true,
  canMark: true,
};

const DEFAULT_EDITOR_PERMS = {
  canEditWords: false,
  canEditDesign: false,
  canRandomize: false,
  canMark: true,
};

const HOST_PERMS = {
  canEditWords: true,
  canEditDesign: true,
  canRandomize: true,
  canMark: true,
};

function normalizePerms(p = {}, fallback = DEFAULT_PLAYER_PERMS) {
  const src = p && typeof p === "object" ? p : {};
  return {
    canEditWords: !!src.canEditWords ?? fallback.canEditWords,
    canEditDesign: !!src.canEditDesign ?? fallback.canEditDesign,
    canRandomize: !!src.canRandomize ?? fallback.canRandomize,
    canMark: !!src.canMark ?? fallback.canMark,
  };
}

function isHost(session, req) {
  return String(session.host?.twitchId) === String(req.twitchId);
}

function getMember(session, req) {
  const id = String(req.twitchId);
  return session.participants?.[id] || null;
}

function bump(session) {
  session.refreshNonce = (session.refreshNonce || 0) + 1;
  session.updatedAt = Date.now();
}

// ---- Router factory ----
module.exports = function createBingoRouter({ requireAuth }) {
  const router = express.Router();

  // Public: Themes
  router.get("/themes", (req, res) => {
    const themes = loadThemes().map((t) => ({
      id: t.id,
      name: t.name,
      words: Array.isArray(t.words) ? t.words : [],
      wordsCount: Array.isArray(t.words) ? t.words.length : 0,
    }));
    res.json({ themes });
  });

  // Public: Overlay data by overlayKey
  router.get("/overlay/:overlayKey", (req, res) => {
    const overlayKey = String(req.params.overlayKey || "").trim();
    if (!overlayKey) return res.status(400).json({ error: "overlayKey fehlt" });

    const since = parseInt(req.query.since || "0", 10) || 0;
    const sessions = loadSessions();

    for (const sess of Object.values(sessions)) {
      if (!sess) continue;

      if (sess.mode === "single" && sess.overlayKey === overlayKey) {
        const nonce = sess.refreshNonce || 0;
        if (since && since === nonce) {
          return res.json({ unchanged: true, refreshNonce: nonce });
        }
        return res.json({
          unchanged: false,
          refreshNonce: nonce,
          updatedAt: sess.updatedAt || 0,
          gridSize: sess.gridSize,
          style: normalizeStyle(sess.style),
          themeName: sess.theme?.name || "Bingo",
          locked: !!sess.locked,
          cells: sess.card || [],
        });
      }

      if (sess.mode === "group" && sess.participants) {
        for (const p of Object.values(sess.participants)) {
          if (p?.overlayKey === overlayKey) {
            const nonce = sess.refreshNonce || 0;
            if (since && since === nonce) {
              return res.json({ unchanged: true, refreshNonce: nonce });
            }
            return res.json({
              unchanged: false,
              refreshNonce: nonce,
              updatedAt: sess.updatedAt || 0,
              gridSize: sess.gridSize,
              style: normalizeStyle(sess.style),
              themeName: sess.theme?.name || "Bingo",
              locked: !!sess.locked,
              cells: p.card || [],
            });
          }
        }
      }
    }

    res.status(404).json({ error: "Overlay nicht gefunden" });
  });

  // Auth: list my bingo sessions
  router.get("/my", requireAuth, (req, res) => {
    const sessions = loadSessions();
    const myId = String(req.twitchId);

    const list = [];
    for (const sess of Object.values(sessions)) {
      if (!sess || !sess.participants) continue;
      if (!sess.participants[myId]) continue;

      const me = sess.participants[myId];
      const overlayKey =
        sess.mode === "single" ? sess.overlayKey : me?.overlayKey;

      list.push({
        sessionId: sess.id,
        mode: sess.mode,
        themeName: sess.theme?.name || "Bingo",
        locked: !!sess.locked,
        role: me?.role || "player",
        overlayKey: overlayKey || "",
        updatedAt: sess.updatedAt || 0,
      });
    }

    // newest first
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ sessions: list });
  });

  // Auth: Create session (single or group)
  router.post("/session", requireAuth, (req, res) => {
    const body = req.body || {};
    const mode = body.mode === "group" ? "group" : "single";
    const gridSize = clampInt(body.gridSize, 3, 6, 5);

    const themes = loadThemes();
    const themeId = String(body.themeId || "");
    const isCustom = body.custom === true || themeId === "custom";

    let theme = null;

    if (!isCustom) {
      theme = themes.find((t) => String(t.id) === themeId) || null;
      if (!theme) return res.status(400).json({ error: "Ungültiges Theme" });
    } else {
      const customName = String(body.customName || "Custom Bingo").trim();
      const words = normalizeWords(body.words || []);
      theme = { id: "custom", name: customName, words };
    }

    const sessions = loadSessions();

    const sessionId = "sess_" + nanoid(10);
    const joinKey = "join_" + nanoid(16);
    const now = Date.now();

    const hostId = String(req.twitchId);
    const hostLogin = String(req.twitchLogin);

    const style = normalizeStyle(body.style || {});

    const base = {
      id: sessionId,
      mode,
      createdAt: now,
      updatedAt: now,
      refreshNonce: 1,
      host: { twitchId: hostId, twitchLogin: hostLogin },
      theme: { id: theme.id, name: theme.name, words: theme.words || [] },
      gridSize,
      style,
      locked: false,
      startedAt: 0,
      joinKey,
      openJoin: mode === "group",
      invites: {}, // login -> { permissions, invitedAt }
      participants: {}, // twitchId -> { ... }
    };

    // Host participant
    base.participants[hostId] = {
      twitchId: hostId,
      twitchLogin: hostLogin,
      role: "host",
      permissions: HOST_PERMS,
      joinedAt: now,
      overlayKey: mode === "group" ? "ov_" + nanoid(16) : "",
      card: mode === "group" ? makeCard(base.theme.words, gridSize) : undefined,
    };

    if (mode === "single") {
      base.overlayKey = "ov_" + nanoid(16);
      base.card = makeCard(base.theme.words, gridSize);
    }

    sessions[sessionId] = base;
    saveSessions(sessions);

    const myOverlayKey =
      mode === "single" ? base.overlayKey : base.participants[hostId].overlayKey;

    res.json({
      sessionId,
      mode,
      joinKey,
      overlayKey: myOverlayKey,
    });
  });

  // Auth: Get session editor state (must be participant)
  router.get("/session/:sessionId", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });

    const host = isHost(sess, req);

    const overlayKey =
      sess.mode === "single" ? sess.overlayKey : me.overlayKey;

    // Participants list (host sees overlayKeys)
    const participants = Object.values(sess.participants || {}).map((p) => ({
      twitchId: p.twitchId,
      twitchLogin: p.twitchLogin,
      role: p.role,
      permissions: p.permissions,
      joinedAt: p.joinedAt || 0,
      overlayKey: host ? (sess.mode === "single" ? sess.overlayKey : p.overlayKey) : "",
    }));

    res.json({
      session: {
        id: sess.id,
        mode: sess.mode,
        theme: { id: sess.theme?.id, name: sess.theme?.name, words: sess.theme?.words || [], wordsCount: (sess.theme?.words || []).length },
        gridSize: sess.gridSize,
        style: normalizeStyle(sess.style),
        locked: !!sess.locked,
        startedAt: sess.startedAt || 0,
        refreshNonce: sess.refreshNonce || 0,
        updatedAt: sess.updatedAt || 0,

        // host-only
        joinKey: host ? sess.joinKey : "",
        openJoin: host ? !!sess.openJoin : false,
        invites: host ? sess.invites || {} : {},
        hostLogin: sess.host?.twitchLogin || "",
        participants,
      },
      me: {
        twitchId: me.twitchId,
        twitchLogin: me.twitchLogin,
        role: me.role,
        permissions: me.permissions,
        overlayKey,
        card: sess.mode === "single" ? (sess.card || []) : (me.card || []),
      },
    });
  });

  // Auth: Join by joinKey (group participants OR single editors)
  router.post("/join/:joinKey", requireAuth, (req, res) => {
    const joinKey = String(req.params.joinKey || "");
    const sessions = loadSessions();

    const sess = Object.values(sessions).find((s) => s?.joinKey === joinKey);
    if (!sess) return res.status(404).json({ error: "Join-Link ungültig" });

    const now = Date.now();
    const myId = String(req.twitchId);
    const myLogin = String(req.twitchLogin);

    if (sess.participants?.[myId]) {
      return res.json({ ok: true, sessionId: sess.id });
    }

    const host = String(sess.host?.twitchId) === myId;
    const invite = sess.invites?.[normalizeLogin(myLogin)] || null;

    if (sess.mode === "group") {
      const allowed = host || !!sess.openJoin;
      if (!allowed) {
        return res.status(403).json({
          error:
            "Join ist geschlossen (Open-Join deaktiviert).",
        });
      }

      const perms = DEFAULT_PLAYER_PERMS;

      sess.participants[myId] = {
        twitchId: myId,
        twitchLogin: myLogin,
        role: host ? "host" : "player",
        permissions: host ? HOST_PERMS : perms,
        joinedAt: now,
        overlayKey: "ov_" + nanoid(16),
        card: makeCard(sess.theme?.words || [], sess.gridSize),
      };
      bump(sess);
      sessions[sess.id] = sess;
      saveSessions(sessions);
      return res.json({ ok: true, sessionId: sess.id });
    }

    // single -> editor join (no extra card)
    const allowed = host || !!invite;
    if (!allowed) {
      return res.status(403).json({
        error: "Du bist kein Editor dieser Einzelsession (keine Einladung).",
      });
    }

    const perms = invite
      ? normalizePerms(invite.permissions, DEFAULT_EDITOR_PERMS)
      : DEFAULT_EDITOR_PERMS;

    sess.participants[myId] = {
      twitchId: myId,
      twitchLogin: myLogin,
      role: host ? "host" : "editor",
      permissions: host ? HOST_PERMS : perms,
      joinedAt: now,
      overlayKey: "",
      card: undefined,
    };
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);
    return res.json({ ok: true, sessionId: sess.id });
  });

  // Host: invite logins (for group participants OR single editors)
  
  // Host: delete session (remove from sessions.json)
  router.delete("/session/:sessionId", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    if (!isHost(sess, req)) {
      return res.status(403).json({ error: "Nur Host" });
    }

    delete sessions[sessionId];
    saveSessions(sessions);

    res.json({ ok: true });
  });

router.post("/session/:sessionId/invite", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });
    if (!isHost(sess, req)) return res.status(403).json({ error: "Nur Host" });

    const logins = Array.isArray(req.body?.twitchLogins)
      ? req.body.twitchLogins
      : String(req.body?.twitchLogins || "")
          .split(/[,\s]+/g)
          .filter(Boolean);

    const normalized = logins.map(normalizeLogin).filter(Boolean);

    const fallback = sess.mode === "single" ? DEFAULT_EDITOR_PERMS : DEFAULT_PLAYER_PERMS;
    const perms = normalizePerms(req.body?.permissions || {}, fallback);
    const now = Date.now();

    sess.invites = sess.invites || {};
    for (const login of normalized) {
      sess.invites[login] = { permissions: perms, invitedAt: now };
    }
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true, invites: sess.invites });
  });

  // Host: remove invite by login
  router.post("/session/:sessionId/uninvite", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });
    if (!isHost(sess, req)) return res.status(403).json({ error: "Nur Host" });

    const login = normalizeLogin(req.body?.twitchLogin || "");
    if (!login) return res.status(400).json({ error: "twitchLogin fehlt" });

    if (sess.invites?.[login]) delete sess.invites[login];
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true, invites: sess.invites || {} });
  });

  // Host: kick participant by twitchId
  router.post("/session/:sessionId/kick", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });
    if (!isHost(sess, req)) return res.status(403).json({ error: "Nur Host" });

    const targetId = String(req.body?.twitchId || "");
    if (!targetId) return res.status(400).json({ error: "twitchId fehlt" });

    if (String(sess.host?.twitchId) === String(targetId)) {
      return res.status(400).json({ error: "Host kann nicht entfernt werden" });
    }

    if (sess.participants?.[targetId]) delete sess.participants[targetId];
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true });
  });

  // Host: update participant permissions by twitchId (or invite by login)
  router.put("/session/:sessionId/permissions", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });
    if (!isHost(sess, req)) return res.status(403).json({ error: "Nur Host" });

    const targetId = String(req.body?.twitchId || "");
    const targetLogin = normalizeLogin(req.body?.twitchLogin || "");
    const perms = normalizePerms(
      req.body?.permissions || {},
      sess.mode === "single" ? DEFAULT_EDITOR_PERMS : DEFAULT_PLAYER_PERMS
    );

    if (targetId && sess.participants?.[targetId]) {
      // host perms must stay full
      if (String(sess.host?.twitchId) === String(targetId)) {
        sess.participants[targetId].permissions = HOST_PERMS;
      } else {
        sess.participants[targetId].permissions = perms;
      }
      bump(sess);
      sessions[sess.id] = sess;
      saveSessions(sessions);
      return res.json({ ok: true });
    }

    if (targetLogin && sess.invites?.[targetLogin]) {
      sess.invites[targetLogin].permissions = perms;
      bump(sess);
      sessions[sess.id] = sess;
      saveSessions(sessions);
      return res.json({ ok: true });
    }

    res.status(404).json({ error: "Ziel nicht gefunden" });
  });

  // Anyone with permission: update style (only before start)
  router.put("/session/:sessionId/style", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });
    if (!me.permissions?.canEditDesign) {
      return res.status(403).json({ error: "Keine Design-Rechte" });
    }

    sess.style = normalizeStyle({ ...sess.style, ...(req.body || {}) });
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);
    res.json({ ok: true, style: normalizeStyle(sess.style) });
  });

  // Anyone with permission: update settings (gridSize/openJoin) (only before start)
  router.put("/session/:sessionId/settings", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });

    const wantsGrid = typeof req.body?.gridSize !== "undefined";
    const wantsOpenJoin = typeof req.body?.openJoin === "boolean";

    // Open-Join: host-only, allowed even after start (so host can close join)
    if (wantsOpenJoin) {
      if (!isHost(sess, req) || sess.mode !== "group") {
        return res
          .status(403)
          .json({ error: "Open-Join nur für Host (Gruppensession)" });
      }
      sess.openJoin = !!req.body.openJoin;
    }

    // Grid size: only with Design-rights; in group-sessions it stays stable once started
    if (wantsGrid) {
      if (!me.permissions?.canEditDesign) {
        return res.status(403).json({ error: "Keine Rechte" });
      }
      if (sess.mode === "group" && sess.locked) {
        return res.status(400).json({ error: "Grid ist nach Start gesperrt." });
      }

      const newGrid = clampInt(req.body?.gridSize, 3, 6, sess.gridSize);

      if (newGrid !== sess.gridSize) {
        sess.gridSize = newGrid;

        // regenerate cards for new size (and clear marks)
        if (sess.mode === "single") {
          sess.card = makeCard(sess.theme?.words || [], sess.gridSize);
        } else {
          for (const p of Object.values(sess.participants || {})) {
            if (!p) continue;
            p.card = makeCard(sess.theme?.words || [], sess.gridSize);
          }
        }
      }
    }

    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);
    res.json({ ok: true, gridSize: sess.gridSize, openJoin: !!sess.openJoin });
  });

  // Anyone with permission: update words (only before start)
  router.put("/session/:sessionId/words", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });
    if (!me.permissions?.canEditWords) {
      return res.status(403).json({ error: "Keine Wörter-Rechte" });
    }

    const words = normalizeWords(req.body?.words || []);
    if (words.length < 1) {
      return res.status(400).json({ error: "Mindestens 1 Wort nötig" });
    }

    // force custom theme when words are edited
    const customName = String(req.body?.customName || sess.theme?.name || "Custom Bingo").trim();
    sess.theme = { id: "custom", name: customName, words };

    // regenerate cards
    if (sess.mode === "single") {
      sess.card = makeCard(sess.theme.words, sess.gridSize);
    } else {
      for (const p of Object.values(sess.participants || {})) {
        if (!p) continue;
        p.card = makeCard(sess.theme.words, sess.gridSize);
      }
    }

    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);
    res.json({ ok: true, theme: { id: sess.theme.id, name: sess.theme.name } });
  });

  // Randomize: single -> shared card; group -> my card
  router.post("/session/:sessionId/randomize", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });
    if (!me.permissions?.canRandomize) {
      return res.status(403).json({ error: "Keine Randomize-Rechte" });
    }

    if (sess.mode === "single") {
      sess.card = makeCard(sess.theme?.words || [], sess.gridSize);
    } else {
      me.card = makeCard(sess.theme?.words || [], sess.gridSize);
      sess.participants[String(req.twitchId)] = me;
    }

    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);
    res.json({ ok: true });
  });

  // Host: start/lock session
  router.post("/session/:sessionId/start", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });
    if (!isHost(sess, req)) return res.status(403).json({ error: "Nur Host" });
    if (sess.mode !== "group") {
      return res.status(400).json({ error: "Start ist nur für Gruppensessions." });
    }


    if (sess.locked) return res.json({ ok: true, locked: true });

    sess.locked = true;
    sess.startedAt = Date.now();
    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true, locked: true, startedAt: sess.startedAt });
  });

  // Mark a cell (only after start)
  
  // Host: stop group session (unlock) and clear marks
  router.post("/session/:sessionId/stop", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    if (!isHost(sess, req)) {
      return res.status(403).json({ error: "Nur Host" });
    }
    if (sess.mode !== "group") {
      return res.status(400).json({ error: "Stop ist nur für Gruppensessions." });
    }

    // unlock + clear marks
    sess.locked = false;
    sess.startedAt = 0;

    for (const p of Object.values(sess.participants || {})) {
      if (!p?.card) continue;
      p.card = (p.card || []).map((c) => ({ ...c, mark: "none", markColor: "" }));
    }

    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true });
  });

router.post("/session/:sessionId/mark", requireAuth, (req, res) => {
    const sessionId = String(req.params.sessionId || "");
    const sessions = loadSessions();
    const sess = sessions[sessionId];
    if (!sess) return res.status(404).json({ error: "Session nicht gefunden" });

    const me = getMember(sess, req);
    if (!me) return res.status(403).json({ error: "Kein Zugriff" });

    if (!canMarkNow(sess)) {
      return res.status(400).json({ error: "Session noch nicht gestartet." });
    }
    if (!me.permissions?.canMark) {
      return res.status(403).json({ error: "Keine Mark-Rechte" });
    }

    const idx = clampInt(req.body?.cellIndex, 0, 9999, -1);
    const mark = String(req.body?.mark || "none");
    const markColor = String(req.body?.markColor || "");

    const allowedMarks = new Set(["none", "x", "color"]);
    if (!allowedMarks.has(mark)) {
      return res.status(400).json({ error: "Ungültiger mark" });
    }

    const card = sess.mode === "single" ? (sess.card || []) : (me.card || []);
    if (!Array.isArray(card) || idx < 0 || idx >= card.length) {
      return res.status(400).json({ error: "Ungültiger cellIndex" });
    }

    const cell = { ...card[idx] };
    if (mark === "none") {
      cell.mark = "none";
      cell.markColor = "";
    } else if (mark === "x") {
      cell.mark = "x";
      cell.markColor = "";
    } else {
      cell.mark = "color";
      cell.markColor = markColor || "#22c55e";
    }

    card[idx] = cell;

    if (sess.mode === "single") {
      sess.card = card;
    } else {
      me.card = card;
      sess.participants[String(req.twitchId)] = me;
    }

    bump(sess);
    sessions[sess.id] = sess;
    saveSessions(sessions);

    res.json({ ok: true });
  });

  return router;
};
