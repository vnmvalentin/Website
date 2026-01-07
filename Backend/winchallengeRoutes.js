const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { nanoid } = require("nanoid");

const DB_PATH = path.join(__dirname, "winchallenge.json");

// ===== DB (RAM-Cache + atomisches Speichern + Key-Indizes) =====
// Wichtig: Diese File-DB ist für EINEN Node-Prozess gedacht (nicht mehrere Instanzen / PM2 cluster).
let dbCache = null; // { [userId]: doc }
let overlayIndex = new Map(); // overlayKey -> userId
let controlIndex = new Map(); // controlKey -> userId

let saveChain = Promise.resolve();
let savePending = false;

function loadDbFromDisk() {
  try {
    if (!fs.existsSync(DB_PATH)) return {}; // Datei fehlt -> leere DB
    const raw = fs.readFileSync(DB_PATH, "utf8");
    if (!raw.trim()) return {}; // leere Datei -> leere DB
    return JSON.parse(raw);
  } catch (e) {
    console.error("loadDb failed:", e);
    // Korrupt -> nach Backup benennen
    try {
      fs.renameSync(DB_PATH, DB_PATH + ".broken." + Date.now());
    } catch {}
    return {};
  }
}

async function writeDbAtomic(dbObj) {
  const json = JSON.stringify(dbObj, null, 2);
  const tmpPath = `${DB_PATH}.tmp.${process.pid}.${Date.now()}.${nanoid(6)}`;
  await fsp.writeFile(tmpPath, json, "utf8");
  await fsp.rename(tmpPath, DB_PATH);
}

function rebuildIndexes() {
  overlayIndex = new Map();
  controlIndex = new Map();
  if (!dbCache) return;

  for (const [uid, doc] of Object.entries(dbCache)) {
    if (!doc || typeof doc !== "object") continue;
    if (doc.overlayKey) overlayIndex.set(doc.overlayKey, uid);
    if (doc.controlKey) controlIndex.set(doc.controlKey, uid);
  }
}

function ensureLoaded() {
  if (dbCache) return;
  dbCache = loadDbFromDisk();
  rebuildIndexes();
}

function loadDb() {
  ensureLoaded();
  return dbCache;
}

// schneller "braucht Migration?" Check (kein Deep-Compare)
function needsMigration(doc) {
  if (!doc || typeof doc !== "object") return true;
  if (!doc.userId) return true;
  if (!doc.overlayKey || !doc.controlKey) return true;
  if (!doc.timer || typeof doc.timer !== "object") return true;
  if (doc.timer.visible === undefined) return true;
  if (!doc.controlPermissions) return true;
  if (doc.refreshNonce === undefined) return true;
  if (doc.updatedAt === undefined) return true;
  if (!doc.style) return true;
  if (!doc.pager) return true;
  return false;
}

// Setter, damit Indizes konsistent bleiben (Keys können sich bei ensureDocShape ändern)
function setUserDoc(userId, nextDoc) {
  ensureLoaded();
  const prev = dbCache[userId];

  if (prev?.overlayKey && overlayIndex.get(prev.overlayKey) === userId) {
    overlayIndex.delete(prev.overlayKey);
  }
  if (prev?.controlKey && controlIndex.get(prev.controlKey) === userId) {
    controlIndex.delete(prev.controlKey);
  }

  dbCache[userId] = nextDoc;

  if (nextDoc?.overlayKey) overlayIndex.set(nextDoc.overlayKey, userId);
  if (nextDoc?.controlKey) controlIndex.set(nextDoc.controlKey, userId);
}

/**
 * Coalescing Save:
 * - mehrere Updates kurz hintereinander => wir schreiben so oft wie nötig, aber seriell.
 */
function saveDb(db) {
  ensureLoaded();
  if (db && db !== dbCache) {
    // falls doch mal ein anderes Objekt übergeben wurde
    dbCache = db;
    rebuildIndexes();
  }

  savePending = true;

  saveChain = saveChain
    .then(async () => {
      while (savePending) {
        savePending = false;
        try {
          await writeDbAtomic(dbCache);
        } catch (e) {
          console.error("saveDb failed:", e);
        }
      }
    })
    .catch((e) => console.error("saveDb chain failed:", e));

  return saveChain;
}

// ===== DEIN BESTEHENDER CODE (Defaults/Normalizer) =====

const DEFAULT_STYLE = {
  boxBg: "#0B0F1A",
  textColor: "#ffffff",
  accent: "#9146FF",
  opacity: 0.6,
  borderRadius: 12,
  scale: 1,
  boxWidth: 520,
  titleAlign: "left",
  titleColor: "#ffffff",
  headerBg: "#0B0F1A",
  titleFontSize: 20,
  itemFontSize: 16,
  itemBg: "#151b2c",
  headerOpacity: 0.6,
};

const DEFAULT_TIMER = {
  running: false,
  startedAt: 0,
  elapsedMs: 0,
  visible: true,
};

const DEFAULT_PAGER = {
  enabled: false,
  pageSize: 5,
  intervalSec: 20,
};

const DEFAULT_PERMISSIONS = {
  allowModsTimer: true,
  allowModsTitle: false,
  allowModsChallenges: false,
};

function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE, ...style };

  const baseOpacity = Math.min(1, Math.max(0, Number(s.opacity ?? 0.6)));
  s.opacity = baseOpacity;
  s.headerOpacity = Math.min(
    1,
    Math.max(0, Number(s.headerOpacity ?? baseOpacity))
  );

  s.borderRadius = Math.max(0, parseInt(s.borderRadius ?? 12, 10));
  s.scale = Number(s.scale ?? 1);
  s.boxWidth = Math.min(900, Math.max(280, parseInt(s.boxWidth ?? 520, 10)));
  s.titleAlign = s.titleAlign === "center" ? "center" : "left";

  s.titleFontSize = Math.max(
    10,
    Math.min(48, parseInt(s.titleFontSize ?? 20, 10))
  );
  s.itemFontSize = Math.max(
    8,
    Math.min(36, parseInt(s.itemFontSize ?? 16, 10))
  );
  return s;
}

function normalizeAnimation(animation, pagerRaw) {
  const pagerEnabled = !!pagerRaw?.enabled;
  const a = typeof animation === "object" && animation ? { ...animation } : {};
  const enabled =
    a.enabled !== undefined ? !!a.enabled : pagerEnabled ? true : false;

  const mode = a.mode === "scrolling" ? "scrolling" : "paging";

  const paging = {
    ...(a.paging || {}),
    pageSize: Math.max(
      1,
      Math.min(20, parseInt(a.paging?.pageSize ?? pagerRaw?.pageSize ?? 5, 10))
    ),
    intervalSec: Math.max(
      2,
      Math.min(
        120,
        parseInt(a.paging?.intervalSec ?? pagerRaw?.intervalSec ?? 20, 10)
      )
    ),
  };

  const scrolling = {
    ...(a.scrolling || {}),
    speedPxPerSec: Math.max(
      1,
      Math.min(60, parseInt(a.scrolling?.speedPxPerSec ?? 5, 10))
    ),
    visibleRows: Math.max(
      1,
      Math.min(20, parseInt(a.scrolling?.visibleRows ?? 5, 10))
    ),
    pauseSec: Math.max(0, Math.min(30, parseInt(a.scrolling?.pauseSec ?? 2, 10))),
  };

  return { enabled, mode, paging, scrolling };
}

function pagerFromAnimation(animation, pagerRaw) {
  const enabled = !!animation?.enabled && animation?.mode === "paging";
  return {
    enabled,
    pageSize: animation?.paging?.pageSize ?? pagerRaw?.pageSize ?? 5,
    intervalSec: animation?.paging?.intervalSec ?? pagerRaw?.intervalSec ?? 20,
  };
}

/**
 * Bringt einen rohen Datensatz aus winchallenge.json in die endgültige Form,
 * ergänzt fehlende Felder.
 *
 * FIX: updatedAt / refreshNonce werden nicht mehr bei JEDEM ensureDocShape neu gesetzt.
 */
function ensureDocShape(input = {}) {
  const doc = { ...input };

  if (!doc.overlayKey) doc.overlayKey = nanoid(12);
  if (!doc.controlKey) doc.controlKey = nanoid(12);

  const timer = { ...DEFAULT_TIMER, ...(doc.timer || {}) };
  const style = normalizeStyle(doc.style || {});
  const pagerRaw = { ...DEFAULT_PAGER, ...(doc.pager || {}) };
  const animation = normalizeAnimation(doc.animation, pagerRaw);
  const pager = pagerFromAnimation(animation, pagerRaw);
  const controlPermissions = {
    ...DEFAULT_PERMISSIONS,
    ...(doc.controlPermissions || {}),
  };

  return {
    userId: doc.userId,
    title: typeof doc.title === "string" ? doc.title : "Win-Challenge",
    items: Array.isArray(doc.items) ? doc.items : [],
    style,
    timer,
    pager,
    animation,
    controlPermissions,
    overlayKey: doc.overlayKey,
    controlKey: doc.controlKey,
    refreshNonce:
      Number.isFinite(Number(doc.refreshNonce)) && Number(doc.refreshNonce) > 0
        ? Number(doc.refreshNonce)
        : 1,
    updatedAt:
      Number.isFinite(Number(doc.updatedAt)) && Number(doc.updatedAt) > 0
        ? Number(doc.updatedAt)
        : Date.now(),
  };
}

// ---- Router factory ----
function createWinchallengeRouter({ requireAuth } = {}) {
  const router = express.Router();

  // Express 4: async errors sauber an next() weiterreichen
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  // ========== WinChallenge: Haupt-Routen (per Twitch-User) ==========

  router.get(
    "/:twitchId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const authId = String(req.twitchId);
      const twitchId = String(req.params.twitchId);

      if (authId !== twitchId) {
        return res
          .status(403)
          .json({ error: "Nicht erlaubt (falsche Twitch-ID)" });
      }

      const db = loadDb();

      if (!db[twitchId]) {
        const doc = ensureDocShape({ userId: twitchId });
        setUserDoc(twitchId, doc);
        await saveDb(db);
        return res.json(doc);
      }

      if (needsMigration(db[twitchId])) {
        const doc = ensureDocShape(db[twitchId]);
        setUserDoc(twitchId, doc);
        await saveDb(db);
        return res.json(doc);
      }

      res.json(ensureDocShape(db[twitchId]));
    })
  );

  router.put(
    "/:twitchId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const authId = String(req.twitchId);
      const twitchId = String(req.params.twitchId);

      if (authId !== twitchId) {
        return res
          .status(403)
          .json({ error: "Nicht erlaubt (falsche Twitch-ID)" });
      }

      const db = loadDb();

      const existing = db[twitchId] || { userId: twitchId };
      const incoming = req.body || {};

      if (String(req.query.reset || "") === "1") {
        const doc = ensureDocShape({ userId: twitchId });
        setUserDoc(twitchId, doc);
        await saveDb(db);
        return res.json(doc);
      }

      const mergedRaw = {
        ...existing,
        ...incoming,
        userId: existing.userId || twitchId,
        items: Array.isArray(incoming.items) ? incoming.items : existing.items,
        style: {
          ...(existing.style || {}),
          ...(incoming.style || {}),
        },
        pager: {
          ...(existing.pager || {}),
          ...(incoming.pager || {}),
        },
        animation: {
          ...(existing.animation || {}),
          ...(incoming.animation || {}),
          paging: {
            ...(existing.animation?.paging || {}),
            ...(incoming.animation?.paging || {}),
          },
          scrolling: {
            ...(existing.animation?.scrolling || {}),
            ...(incoming.animation?.scrolling || {}),
          },
        },
        controlPermissions: {
          ...(existing.controlPermissions || {}),
          ...(incoming.controlPermissions || {}),
        },
        timer: {
          ...(existing.timer || {}),
          ...(incoming.timer || {}),
        },
      };

      const merged = ensureDocShape(mergedRaw);

      setUserDoc(twitchId, merged);
      await saveDb(db);
      res.json(merged);
    })
  );

  // ========== WinChallenge: Overlay & Control Routen ==========

  router.get("/overlay/:overlayKey", (req, res) => {
    const { overlayKey } = req.params;
    const db = loadDb();

    let userId = overlayIndex.get(overlayKey);

    // Fallback (z.B. nach manueller winchallenge.json Änderung): einmalig langsam suchen
    if (!userId) {
      userId = Object.keys(db).find(
        (uid) => db[uid] && db[uid].overlayKey === overlayKey
      );
      if (userId) rebuildIndexes();
    }

    if (!userId) {
      return res.status(404).json({ error: "Overlay nicht gefunden" });
    }

    const doc = ensureDocShape(db[userId]);
    res.json(doc);
  });

  router.get("/control/:controlKey", (req, res) => {
    const { controlKey } = req.params;
    const db = loadDb();

    let userId = controlIndex.get(controlKey);

    // Fallback (z.B. nach manueller winchallenge.json Änderung): einmalig langsam suchen
    if (!userId) {
      userId = Object.keys(db).find(
        (uid) => db[uid] && db[uid].controlKey === controlKey
      );
      if (userId) rebuildIndexes();
    }

    if (!userId) {
      return res.status(404).json({ error: "Control-Link nicht gefunden" });
    }

    const doc = ensureDocShape(db[userId]);
    res.json(doc);
  });

  // Control schreiben
  router.put(
    "/control/:controlKey",
    asyncHandler(async (req, res) => {
      const { controlKey } = req.params;
      const db = loadDb();

      let userId = controlIndex.get(controlKey);

      // Fallback (z.B. nach manueller winchallenge.json Änderung): einmalig langsam suchen
      if (!userId) {
        userId = Object.keys(db).find(
          (uid) => db[uid] && db[uid].controlKey === controlKey
        );
        if (userId) rebuildIndexes();
      }

      if (!userId) {
        return res.status(404).json({ error: "Control-Link nicht gefunden" });
      }

      let doc = ensureDocShape(db[userId]);
      const perms = doc.controlPermissions || DEFAULT_PERMISSIONS;

      const action = String(req.body?.action || "");

      if (action === "setTitle") {
        if (!perms.allowModsTitle) {
          return res
            .status(403)
            .json({ error: "Titel bearbeiten nicht erlaubt" });
        }
        const title = String(req.body.title || "").slice(0, 80);
        doc.title = title || "Win-Challenge";
      } else if (action === "setItems") {
        if (!perms.allowModsChallenges) {
          return res
            .status(403)
            .json({ error: "Challenges bearbeiten nicht erlaubt" });
        }
        if (!Array.isArray(req.body.items)) {
          return res.status(400).json({ error: "items muss ein Array sein" });
        }
        doc.items = req.body.items;
      } else if (action === "timerStart") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }
        if (!doc.timer.running) {
          doc.timer.running = true;
          doc.timer.startedAt = Date.now() - (doc.timer.elapsedMs || 0);
        }
      } else if (action === "timerStop") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }
        if (doc.timer.running) {
          doc.timer.running = false;
          doc.timer.elapsedMs = Date.now() - (doc.timer.startedAt || Date.now());
        }
      } else if (action === "timerReset") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }
        doc.timer.running = false;
        doc.timer.startedAt = 0;
        doc.timer.elapsedMs = 0;
      } else if (action === "timerToggleVisible") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }
        if (typeof req.body.visible !== "boolean") {
          return res.status(400).json({ error: "visible muss boolean sein" });
        }
        doc.timer.visible = !!req.body.visible;
      } else if (action === "timerAdjust") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }

        const deltaMs = Number(req.body.deltaMs || 0);
        if (!Number.isFinite(deltaMs) || deltaMs === 0) {
          return res.status(400).json({ error: "Ungültiger deltaMs-Wert" });
        }

        const t = doc.timer || DEFAULT_TIMER;

        const currentElapsed = t.running
          ? Date.now() - (t.startedAt || Date.now())
          : t.elapsedMs || 0;

        const nextElapsed = Math.max(0, currentElapsed + deltaMs);

        if (t.running) {
          t.startedAt = Date.now() - nextElapsed;
        } else {
          t.elapsedMs = nextElapsed;
        }

        doc.timer = t;
      } else if (action === "hardRefresh") {
        doc.refreshNonce = (doc.refreshNonce || 1) + 1;
      } else {
        return res.status(400).json({ error: "Unbekannte Action" });
      }

      doc.updatedAt = Date.now();
      setUserDoc(userId, doc);
      await saveDb(db);

      res.json(doc);
    })
  );

  return router;
}

// optional: helpers weiterhin exportierbar machen (falls du sie irgendwo brauchst)
createWinchallengeRouter.loadDb = loadDb;
createWinchallengeRouter.saveDb = saveDb;
createWinchallengeRouter.DB_PATH = DB_PATH;

module.exports = createWinchallengeRouter;
