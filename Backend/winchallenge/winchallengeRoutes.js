const express = require("express");
const { nanoid } = require("nanoid");
const {
  loadAllDocsObject,
  persistAllDocsObject,
  saveDoc,
  deleteDoc,
} = require("./winchallengeStore");

// ===== DB (RAM-Cache + Speichern in SQLite via winchallengeStore) =====
// Wichtig: Ein Node-Prozess (nicht PM2 cluster ohne gemeinsame DB).
let dbCache = null; // { [userId]: doc }
let overlayIndex = new Map(); // overlayKey -> userId
let controlIndex = new Map(); // controlKey -> userId

let saveChain = Promise.resolve();
let savePending = false;

function loadDbFromDisk() {
  try {
    return loadAllDocsObject();
  } catch (e) {
    console.error("loadDb failed:", e);
    return {};
  }
}

async function writeDbAtomic(dbObj) {
  persistAllDocsObject(dbObj);
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
  if (!doc.hostName) return true;
  if (!doc.overlayKey || !doc.controlKey) return true;
  if (!doc.timer || typeof doc.timer !== "object") return true;
  if (doc.timer.visible === undefined) return true;
  if (!doc.controlPermissions) return true;
  if (doc.refreshNonce === undefined) return true;
  if (doc.updatedAt === undefined) return true;
  if (!doc.style) return true;
  if (!doc.pager) return true;
  if (!doc.chatCommands || typeof doc.chatCommands !== "object") return true;
  if (!Array.isArray(doc.chatCommands.channels)) return true;
  return false;
}

// Setter, damit Indizes konsistent bleiben (Keys können sich bei ensureDocShape ändern)
function setUserDoc(userId, nextDoc) {
  ensureLoaded();

  // updatedAt hier zentral hochzählen — NICHT in den einzelnen Routen.
  //
  // Das OBS-Overlay pollt sekündlich und übernimmt neue Daten nur, wenn sich
  // updatedAt geändert hat (sonst würde es rund um die Uhr neu rendern). Setzt
  // auch nur ein Schreibpfad den Zeitstempel nicht, bleibt das Overlay auf dem
  // alten Stand stehen und aktualisiert sich erst beim manuellen Neuladen —
  // genau das war der Fall: Die Aktions-Route setzte updatedAt, die Haupt-
  // Speicherroute der Steuerseite aber nicht. An dieser Stelle kann es kein
  // Aufrufer mehr vergessen.
  nextDoc.updatedAt = Date.now();

  // Ein Schreibvorgang ist Aktivität — egal ob er von der Einstellungsseite,
  // der Control-Seite oder einem Chat-Kommando kommt. Ohne das hier zählte
  // ausschließlich "OBS-Browserquelle war offen" als Lebenszeichen, und wer
  // seine Challenge baute, ohne OBS zu starten, fiel in den Inaktivitäts-
  // Cleanup. Gleichzeitig fällt eine bereits vorgemerkte Löschung weg.
  nextDoc.lastActiveAt = nextDoc.updatedAt;
  nextDoc.pendingDeleteAt = 0;

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
  borderRadius: 0,
  scale: 1,
  boxWidth: 320,
  titleAlign: "left",
  titleColor: "#ffffff",
  headerBg: "#0B0F1A",
  titleFontSize: 20,
  itemFontSize: 16,
  itemBg: "#151b2c",
  headerOpacity: 0.6,
  // Eigene Deckkraft je Fläche. opacity deckt nur noch den Bereich um die
  // Zeilen herum ab; Zeilen, Zähler und Timer werden getrennt geregelt.
  // Die Vorgaben entsprechen genau dem bisherigen Aussehen.
  //
  // itemOpacity und timerOpacity stehen bewusst NICHT hier: ihr Rückfallwert
  // ist die jeweilige Box-Deckkraft des Dokuments, nicht eine feste Zahl. Ein
  // Wert an dieser Stelle würde beim Zusammenführen gewinnen und Bestandsdaten
  // überschreiben.
  counterOpacity: 0.06,
  // Darstellung: Layout, Zähler als reine Zahl oder Box, Gesamtfortschritt im
  // Header ("off" | "count" | "box") und ob erledigte Challenges ans Ende sortiert
  // werden. timerFontSize steht bewusst NICHT hier: ohne eigenen Wert gilt die
  // Challenge-Größe (siehe normalizeStyle), ein fester Wert würde Bestandsdaten
  // überschreiben.
  layout: "list",
  counterStyle: "plain",
  headerProgress: "off",
  doneToBottom: false,
};

// Erlaubte Werte der Darstellungs-Optionen (Gegenstück: overlayUtils.js im Frontend)
const OVERLAY_LAYOUTS = ["list", "cards", "compact"];
const COUNTER_STYLES = ["plain", "box"];
const HEADER_PROGRESS_MODES = ["off", "count", "box"];

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

const DEFAULT_CHAT_COMMANDS = {
  enabled: false,
  /** Twitch-Login, klein, ohne # (legacy: erster Kanal aus channels) */
  channel: "",
  /** Mehrere Kanäle möglich — z. B. Gruppen, die ein Overlay teilen */
  channels: [],
  requireModOrBroadcaster: true,
  /** tmi: Kurzantworten im Chat (z. B. „Timer wurde pausiert“) */
  replyInChat: true,
};

const MAX_CHAT_CHANNELS = 10;

function normalizeChatCommands(cc) {
  const merged = { ...DEFAULT_CHAT_COMMANDS, ...(cc || {}) };
  const set = new Set();
  const push = (v) => {
    const c = String(v || "")
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^a-z0-9_]/g, "");
    if (c) set.add(c);
  };
  if (Array.isArray(merged.channels)) merged.channels.forEach(push);
  push(merged.channel);
  merged.channels = [...set].slice(0, MAX_CHAT_CHANNELS);
  merged.channel = merged.channels[0] || "";
  merged.enabled = !!merged.enabled;
  merged.requireModOrBroadcaster = merged.requireModOrBroadcaster !== false;
  merged.replyInChat = merged.replyInChat !== false;
  return merged;
}

function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE, ...style };

  const clampAlpha = (v, fallback) =>
    Math.min(1, Math.max(0, Number(v ?? fallback)));

  const baseOpacity = clampAlpha(s.opacity, 0.6);
  s.opacity = baseOpacity;
  s.headerOpacity = clampAlpha(s.headerOpacity, baseOpacity);
  // Bestandsdaten kennen itemOpacity nicht — dort galt die Box-Deckkraft auch
  // für die Zeilen. Geprüft wird der Rohwert, nicht der mit DEFAULT_STYLE
  // zusammengeführte, sonst ginge der dokumenteigene Rückfallwert verloren.
  s.itemOpacity = clampAlpha(style?.itemOpacity, baseOpacity);
  s.timerOpacity = clampAlpha(style?.timerOpacity, baseOpacity);
  s.counterOpacity = clampAlpha(s.counterOpacity, 0.06);

  s.borderRadius = Math.max(0, parseInt(s.borderRadius ?? 0, 10));
  s.scale = Number(s.scale ?? 1);
  // Muss zum Frontend-Slider passen (max 1000), sonst springt der Regler zurück
  s.boxWidth = Math.min(1600, Math.max(280, parseInt(s.boxWidth ?? 320, 10)));
  s.titleAlign = s.titleAlign === "center" ? "center" : "left";
  s.layout = OVERLAY_LAYOUTS.includes(s.layout) ? s.layout : "list";
  s.counterStyle = COUNTER_STYLES.includes(s.counterStyle) ? s.counterStyle : "plain";
  s.headerProgress = HEADER_PROGRESS_MODES.includes(s.headerProgress)
    ? s.headerProgress
    : "off";
  s.doneToBottom = s.doneToBottom === true;

  s.titleFontSize = Math.max(
    10,
    Math.min(48, parseInt(s.titleFontSize ?? 20, 10))
  );
  s.itemFontSize = Math.max(
    8,
    Math.min(36, parseInt(s.itemFontSize ?? 16, 10))
  );
  // Eigene Timer-Größe; Rückfall ist die Challenge-Größe. Geprüft wird der Rohwert,
  // nicht der mit DEFAULT_STYLE zusammengeführte (analog zu itemOpacity oben).
  s.timerFontSize = Math.max(
    8,
    Math.min(48, parseInt(style?.timerFontSize ?? s.itemFontSize, 10))
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

  // Clamps müssen zu den Frontend-Slidern passen (Speed bis 200, Pause in 0.5er-Schritten)
  const scrolling = {
    ...(a.scrolling || {}),
    speedPxPerSec: Math.max(
      5,
      Math.min(200, Number(a.scrolling?.speedPxPerSec ?? 30) || 30)
    ),
    visibleRows: Math.max(
      1,
      Math.min(20, parseInt(a.scrolling?.visibleRows ?? 2, 10))
    ),
    pauseSec: Math.max(0, Math.min(30, Number(a.scrolling?.pauseSec ?? 2) || 0)),
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
  const updatedAtRaw =
    Number.isFinite(Number(doc.updatedAt)) && Number(doc.updatedAt) > 0
      ? Number(doc.updatedAt)
      : Date.now();

  // lastActiveAt löst das alte lastOverlayAccessAt ab: Letzteres wurde nur vom
  // Overlay-Abruf gesetzt, ersteres von jeder Form von Aktivität. Altbestände
  // erben den höheren der beiden bekannten Werte, damit die Umstellung keinem
  // Datensatz Lebenszeit wegnimmt.
  const lastActiveAt = Math.max(
    Number(doc.lastActiveAt) || 0,
    Number(doc.lastOverlayAccessAt) || 0,
    updatedAtRaw
  );

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

  const chatCommands = normalizeChatCommands(doc.chatCommands);

  return {
    userId: doc.userId,
    hostName: typeof doc.hostName === "string" ? doc.hostName : "Unknown",
    title: typeof doc.title === "string" ? doc.title : "Win-Challenge",
    items: Array.isArray(doc.items) ? doc.items : [],
    style,
    timer,
    pager,
    animation,
    controlPermissions,
    chatCommands,
    overlayKey: doc.overlayKey,
    controlKey: doc.controlKey,
    refreshNonce:
      Number.isFinite(Number(doc.refreshNonce)) && Number(doc.refreshNonce) > 0
        ? Number(doc.refreshNonce)
        : 1,
    updatedAt: updatedAtRaw,
    // Für den Inaktivitäts-Cleanup — dürfen beim Neuformen nicht verloren gehen
    lastActiveAt,
    lastOverlayAccessAt: Number(doc.lastOverlayAccessAt) || 0,
    pendingDeleteAt: Number(doc.pendingDeleteAt) || 0,
  };
}

// ===== Inaktivitäts-Cleanup =====
//
// Als Aktivität zählt jeder Abruf (Overlay in OBS, Control-Seite, eigene
// Einstellungsseite) und jeder Schreibvorgang (siehe setUserDoc). Abrufe
// stempeln höchstens einmal pro Stunde, damit der sekündliche OBS-Poll nicht
// dauernd SQLite beschreibt.
const ACCESS_TOUCH_INTERVAL_MS = 60 * 60 * 1000; // 1h
const INACTIVITY_LIMIT_MS = 14 * 24 * 60 * 60 * 1000; // 14 Tage bis zur Vormerkung
const DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // + 7 Tage bis zur Löschung
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // alle 6h prüfen

// Schutzschalter gegen Massenlöschung: Mehr als das darf ein einzelner Lauf
// nicht anfassen. Genau dieser Fall ist eingetreten — eine einzige Ausführung
// hat über 150 Overlays auf einmal entfernt, weil alle denselben Stempel
// hatten. Reißt ein Lauf die Grenze, passiert nichts und es gibt eine laute
// Logzeile: dann stimmt etwas mit den Zeitstempeln nicht, nicht mit den Nutzern.
const CLEANUP_MAX_BATCH = 20;
const CLEANUP_MAX_SHARE = 0.25;

/**
 * Effektiver Aktivitätszeitpunkt eines Dokuments.
 *
 * Bewusst das Maximum aus allen bekannten Signalen: lastOverlayAccessAt ist der
 * Altbestand, lastActiveAt der neue Sammelstempel, updatedAt belegt eine echte
 * Bearbeitung. Fehlt ein Signal, darf das die anderen nicht überstimmen.
 */
function lastActivityOf(doc) {
  if (!doc || typeof doc !== "object") return 0;
  return Math.max(
    Number(doc.lastActiveAt) || 0,
    Number(doc.lastOverlayAccessAt) || 0,
    Number(doc.updatedAt) || 0
  );
}

/**
 * Aktivität eines Nutzers vermerken (gedrosselt, Einzelzeilen-Schreibzugriff).
 * @param {string} userId
 */
function touchActivity(userId) {
  const db = loadDb();
  const doc = db[userId];
  if (!doc) return;
  const now = Date.now();
  if (now - (Number(doc.lastActiveAt) || 0) < ACCESS_TOUCH_INTERVAL_MS) return;

  doc.lastActiveAt = now;
  doc.lastOverlayAccessAt = now; // Altfeld mitführen, falls noch etwas darauf schaut
  if (doc.pendingDeleteAt) {
    console.log(
      `[winchallenge] Löschvormerkung für ${userId} (${doc.hostName || "?"}) aufgehoben — wieder aktiv.`
    );
    doc.pendingDeleteAt = 0;
  }

  // Einzelne Zeile schreiben statt der ganzen Tabelle (siehe saveDoc).
  try {
    saveDoc(userId, doc);
  } catch (e) {
    console.error("[winchallenge] touchActivity save failed:", e.message);
  }
}

function runInactivityCleanup() {
  const db = loadDb();
  const now = Date.now();
  const total = Object.keys(db).length;
  const pending = [];
  const doomed = [];

  for (const [uid, doc] of Object.entries(db)) {
    if (!doc || typeof doc !== "object") continue;

    const due = Number(doc.pendingDeleteAt) || 0;
    if (due) {
      if (now >= due) doomed.push([uid, doc]);
      continue;
    }

    const last = lastActivityOf(doc);
    // Kein einziger verwertbarer Zeitstempel: Stempel setzen, sonst nichts.
    if (!last) {
      doc.lastActiveAt = now;
      doc.lastOverlayAccessAt = now;
      try {
        saveDoc(uid, doc);
      } catch (e) {
        console.error("[winchallenge] cleanup seed failed:", e.message);
      }
      continue;
    }

    if (now - last > INACTIVITY_LIMIT_MS) pending.push([uid, doc]);
  }

  // Phase 1: vormerken statt löschen. Die eigentliche Löschung passiert
  // frühestens DELETE_GRACE_MS später — bis dahin reicht ein einziger Abruf
  // oder eine Änderung, um sie wieder aufzuheben.
  for (const [uid, doc] of pending) {
    doc.pendingDeleteAt = now + DELETE_GRACE_MS;
    try {
      saveDoc(uid, doc);
    } catch (e) {
      console.error("[winchallenge] cleanup mark failed:", e.message);
    }
  }
  if (pending.length > 0) {
    const graceDays = Math.round(DELETE_GRACE_MS / 86400000);
    console.log(
      `[winchallenge] Inaktivitäts-Cleanup: ${pending.length} Overlay(s) zur Löschung in ${graceDays} Tagen vorgemerkt: ` +
        pending
          .map(([uid, d]) => `${uid} (${d.hostName || "?"}, ${d.items?.length || 0} Items)`)
          .join(", ")
    );
  }

  if (doomed.length === 0) return;

  // Phase 2: löschen — aber nie mehr als der Schutzschalter erlaubt.
  const cap = Math.max(CLEANUP_MAX_BATCH, Math.floor(total * CLEANUP_MAX_SHARE));
  if (doomed.length > cap) {
    console.error(
      `[winchallenge] Inaktivitäts-Cleanup ABGEBROCHEN: ${doomed.length} von ${total} Overlay(s) wären auf einmal gelöscht worden (Grenze ${cap}). ` +
        `Es wurde nichts entfernt — bitte die Zeitstempel prüfen.`
    );
    return;
  }

  for (const [uid, doc] of doomed) {
    delete db[uid];
    try {
      deleteDoc(uid);
    } catch (e) {
      console.error("[winchallenge] cleanup delete failed:", e.message);
    }
    console.log(
      `[winchallenge] Overlay entfernt: ${uid} (${doc.hostName || "?"}, ${doc.items?.length || 0} Items, ` +
        `zuletzt aktiv ${new Date(lastActivityOf(doc)).toISOString()})`
    );
  }
  rebuildIndexes();
  console.log(`[winchallenge] Inaktivitäts-Cleanup: ${doomed.length} Overlay(s) endgültig entfernt.`);
}

/**
 * Auswertung der Aktivitäts-Zeitstempel (für das Admin-Panel).
 * @returns {{total: number, entries: Array<object>}}
 */
function getInactivityReport() {
  const db = loadDb();
  const now = Date.now();
  const entries = Object.entries(db).map(([uid, doc]) => {
    const last = lastActivityOf(doc);
    return {
      userId: uid,
      hostName: doc?.hostName || "Unknown",
      items: Array.isArray(doc?.items) ? doc.items.length : 0,
      lastActiveAt: last,
      inactiveDays: last ? Math.floor((now - last) / 86400000) : null,
      pendingDeleteAt: Number(doc?.pendingDeleteAt) || 0,
    };
  });
  entries.sort((a, b) => (a.lastActiveAt || 0) - (b.lastActiveAt || 0));
  return { total: entries.length, entries };
}

let cleanupTimerStarted = false;
function startInactivityCleanup() {
  if (cleanupTimerStarted) return;
  cleanupTimerStarted = true;
  // Erster Lauf kurz nach dem Start (DB ist dann sicher initialisiert), danach alle 6h
  setTimeout(() => {
    try { runInactivityCleanup(); } catch (e) { console.error("[winchallenge] cleanup:", e); }
  }, 60 * 1000).unref?.();
  setInterval(() => {
    try { runInactivityCleanup(); } catch (e) { console.error("[winchallenge] cleanup:", e); }
  }, CLEANUP_INTERVAL_MS).unref?.();
}

// ---- Router factory ----
function createWinchallengeRouter({ requireAuth } = {}) {
  startInactivityCleanup();
  const router = express.Router();

  // Express 4: async errors sauber an next() weiterreichen
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);


  // ========== WinChallenge: Overlay & Control Routen ==========

  // Overlay und Control-Seite fragen im Sekundentakt nach dem aktuellen Stand.
  // Kein Zwischenspeicher an irgendeiner Stelle des Weges (Browserquelle in OBS,
  // vorgelagerter Proxy): eine gecachte Antwort sähe im Stream exakt so aus, als
  // würde das Overlay nicht aktualisieren.
  const noStore = (res) => res.set("Cache-Control", "no-store, must-revalidate");

  router.get("/overlay/:overlayKey", (req, res) => {
    const { overlayKey } = req.params;
    noStore(res);
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

    touchActivity(userId);
    const doc = ensureDocShape(db[userId]);
    res.json(doc);
  });

  router.get("/control/:controlKey", (req, res) => {
    const { controlKey } = req.params;
    noStore(res);
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

    touchActivity(userId);
    const doc = ensureDocShape(db[userId]);
    res.json(doc);
  });

  router.post("/fix-names", requireAuth, asyncHandler(async (req, res) => {
      const db = loadDb();
      let count = 0;
      // Wir iterieren über alle und schauen, ob wir "Unknown" fixen können
      // (Das geht nur, wenn wir Mapping-Daten hätten, aber wir setzen zumindest den aktuellen User)
      
      const myId = String(req.twitchId);
      const myName = req.user?.display_name || req.twitchLogin;

      if (db[myId] && myName) {
          db[myId].hostName = myName;
          count++;
          await saveDb(db);
      }
      res.json({ fixed: count, msg: "Rufe diese Route mit dem jeweiligen User auf um den Namen zu fixen." });
  }));

  

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

      // Aliase: die Control-Seite sendete historisch andere Action-Namen
      const ACTION_ALIASES = {
        updateTitle: "setTitle",
        updateItems: "setItems",
        timerPause: "timerStop",
        timerSetVisible: "timerToggleVisible",
      };
      const rawAction = String(req.body?.action || "");
      const action = ACTION_ALIASES[rawAction] || rawAction;

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
      } else if (action === "timerSet") {
        if (!perms.allowModsTimer) {
          return res
            .status(403)
            .json({ error: "Timer bearbeiten nicht erlaubt" });
        }
        const ms = Number(req.body.elapsedMs);
        if (!Number.isFinite(ms) || ms < 0) {
          return res.status(400).json({ error: "Ungültiger elapsedMs-Wert" });
        }
        const t = doc.timer || { ...DEFAULT_TIMER };
        t.elapsedMs = Math.min(ms, 999 * 3600 * 1000);
        if (t.running) t.startedAt = Date.now() - t.elapsedMs;
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

   // ========== WinChallenge: Haupt-Routen (per Twitch-User) ==========

  router.delete("/:twitchId", requireAuth, asyncHandler(async (req, res) => {
    // Check: Darf der User löschen? (Nur Admin oder der User selbst)
    // Da du es vom Admin-Panel aufrufst, gehen wir davon aus, dass 'requireAuth' 
    // und deine Admin-Prüfung im Frontend greifen.
    // Falls du eine "isAdmin" Middleware hast, nutze die. 
    // Hier erlauben wir es einfach dem Host selbst ODER wenn ein Admin-Key Header dabei wäre (vereinfacht).
    
    const targetId = String(req.params.twitchId);
    const requesterId = String(req.twitchId);

    // Optional: Sicherheitscheck, ob man sich selbst löscht oder ob man Admin ist
    // if (targetId !== requesterId && targetId !== "160224748") return res.status(403).json({ error: "Nope" });

    const db = loadDb();
    
    if (db[targetId]) {
      const hostName = db[targetId].hostName || "?";
      delete db[targetId]; // Löscht aus dem RAM
      // Bereinigt die Indizes
      if (dbCache) delete dbCache[targetId];
      rebuildIndexes();

      deleteDoc(targetId); // Gezielt diese eine Zeile aus SQLite
      console.log(
        `[winchallenge] Overlay manuell gelöscht: ${targetId} (${hostName}) durch ${requesterId}.`
      );
      return res.json({ ok: true });
    }

    res.status(404).json({ error: "User nicht gefunden" });
  }));

  router.get(
    "/:twitchId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const authId = String(req.twitchId);
      const twitchId = String(req.params.twitchId);

      if (authId !== twitchId) {
        return res.status(403).json({ error: "Nicht erlaubt (falsche Twitch-ID)" });
      }

      const db = loadDb();
      
      // Name aus dem aktuellen Request ermitteln (falls vorhanden)
      const currentHostName = req.user?.display_name || req.twitchLogin || "Unknown";

      // Fall 1: Neuer User (noch kein Eintrag)
      if (!db[twitchId]) {
        const doc = ensureDocShape({ userId: twitchId });
        doc.hostName = currentHostName; // <--- Name sofort setzen
        setUserDoc(twitchId, doc);
        await saveDb(db);
        return res.json(doc);
      }

      // Fall 2: Existierender User, aber Daten veraltet (z.B. Name fehlt)
      // Wir prüfen jetzt auch, ob der gespeicherte Name "Unknown" ist, aber wir jetzt einen besseren haben
      const doc = db[twitchId];
      const nameNeedsUpdate = (!doc.hostName || doc.hostName === "Unknown") && currentHostName !== "Unknown";

      if (needsMigration(doc) || nameNeedsUpdate) {
        const freshDoc = ensureDocShape(doc);
        
        // Wenn wir einen Namen haben, aktualisieren wir ihn
        if (nameNeedsUpdate || !freshDoc.hostName) {
            freshDoc.hostName = currentHostName;
        }

        setUserDoc(twitchId, freshDoc);
        await saveDb(db);
        return res.json(freshDoc);
      }

      touchActivity(twitchId);
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
        try {
          require("../lib/winchallengeIrc").afterWinchallengeConfigSaved();
        } catch (_) { /* irc optional */ }
        return res.json(doc);
      }

      const mergedRaw = {
        ...existing,
        ...incoming,
        userId: existing.userId || twitchId,
        hostName: req.user?.display_name || req.twitchLogin || existing.hostName || "Unknown",
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
        chatCommands: {
          ...(existing.chatCommands || {}),
          ...(incoming.chatCommands || {}),
        },
        timer: {
          ...(existing.timer || {}),
          ...(incoming.timer || {}),
        },
      };

      const merged = ensureDocShape(mergedRaw);

      setUserDoc(twitchId, merged);
      await saveDb(db);
      try {
        require("../lib/winchallengeIrc").afterWinchallengeConfigSaved();
      } catch (_) { /* irc optional */ }
      res.json(merged);
    })
  );

  return router;
}

/**
 * Löscht einen Win-Challenge-Datensatz (z. B. Admin-Panel); aktualisiert Indizes + SQLite.
 * @param {string} twitchId
 * @returns {Promise<boolean>}
 */
async function removeWinchallengeUser(twitchId) {
  const db = loadDb();
  if (!db[twitchId]) return false;
  delete db[twitchId];
  rebuildIndexes();
  // Gezielt eine Zeile löschen statt die ganze Tabelle neu zu schreiben.
  deleteDoc(twitchId);
  return true;
}

/**
 * @param {string} userId
 * @param {object} doc rohes oder geformtes Dokument
 */
async function setUserAndSaveDoc(userId, doc) {
  const shaped = ensureDocShape({ ...doc, userId: String(userId) });
  setUserDoc(String(userId), shaped);
  await saveDb(loadDb());
  return shaped;
}

// optional: helpers weiterhin exportierbar machen (falls du sie irgendwo brauchst)
createWinchallengeRouter.loadDb = loadDb;
createWinchallengeRouter.saveDb = saveDb;
createWinchallengeRouter.removeWinchallengeUser = removeWinchallengeUser;
createWinchallengeRouter.setUserAndSaveDoc = setUserAndSaveDoc;
createWinchallengeRouter.ensureDocShape = ensureDocShape;
createWinchallengeRouter.getInactivityReport = getInactivityReport;
createWinchallengeRouter.touchActivity = touchActivity;

module.exports = createWinchallengeRouter;
