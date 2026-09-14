// crProfileStore.js — dauerhaftes Clash-Royale-Profil in SQLite (better-sqlite3).
// Pro Twitch-ID: Anzeigename, Profilbild-Wahl (fester Avatar ODER Twitch-Bild) und der
// zuletzt verknüpfte Clash-Royale-Tag. Gebaut nach demselben Muster wie
// crStreamerStore.js (ein Row pro twitch_id, JSON-Blob) — bewusst eine EIGENE Tabelle
// statt die Streamer-Config mitzubenutzen: beide Features werden unabhängig voneinander
// gelesen/geschrieben (Profil auch ohne je ein Streamer-Setup zu öffnen), eine gemeinsame
// Tabelle hätte die beiden Sorgen nur künstlich verknüpft.
//
// Gäste ohne Twitch-Login bekommen KEINE Zeile hier — deren Profil lebt rein im Browser
// (localStorage, siehe Frontend/src/pages/ClashRoyale/useProfile.js).
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "cr_profiles.db");

let _db = null;

// Mehrere Clash-Royale-Accounts pro Profil: crAccounts ist die Liste ({tag, name}), crTag/
// crName bleiben als "gerade aktiver" Zeiger erhalten — bestehende Leser (Auto-Link beim
// Lobby-Betreten in ClashRoyalePage.jsx, die Anzeige im Profil) brauchen dadurch keine Änderung.
const MAX_CR_ACCOUNTS = 6;

const DEFAULT_PROFILE = {
  twitchLogin: "",
  displayName: "",
  /** Dateiname aus dem festen Avatar-Satz (Frontend/src/assets/avatars/) */
  avatarId: "",
  /** true = Twitch-Profilbild statt avatarId anzeigen (nur wirksam, solange verbunden) */
  useTwitchAvatar: false,
  /** Alle verknüpften CR-Accounts dieses Profils. */
  crAccounts: [],
  /** Der gerade aktive Account — muss (falls gesetzt) auch in crAccounts stehen. */
  crTag: null,
  crName: null,
  updatedAt: 0,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initCrProfileStore() {
  if (_db) return;
  ensureDataDir();
  _db = new Database(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS cr_profiles (
      twitch_id TEXT PRIMARY KEY,
      data      TEXT NOT NULL
    );
  `);
}

function normalizeCrAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const tag = entry?.tag ? String(entry.tag).slice(0, 20) : null;
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push({ tag, name: entry.name ? String(entry.name).slice(0, 40) : null });
    if (out.length >= MAX_CR_ACCOUNTS) break;
  }
  return out;
}

function normalizeProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  let crAccounts = normalizeCrAccounts(p.crAccounts);
  // Migration: ein Profil von vor der Mehrfach-Account-Umstellung kennt nur crTag/crName,
  // keine Liste — als ersten (und dann aktiven) Eintrag übernehmen, statt ihn beim nächsten
  // Laden kommentarlos zu verlieren (siehe crTag-Prüfung direkt unten).
  if (!crAccounts.length && p.crTag) {
    crAccounts = normalizeCrAccounts([{ tag: p.crTag, name: p.crName }]);
  }
  // crTag muss auf einen tatsächlich gespeicherten Account zeigen — sonst zeigt die
  // Oberfläche "aktiv" für einen Account, der aus der Liste schon wieder raus ist.
  const crTag = p.crTag && crAccounts.some((a) => a.tag === p.crTag) ? String(p.crTag).slice(0, 20) : null;
  const active = crTag ? crAccounts.find((a) => a.tag === crTag) : null;
  return {
    ...DEFAULT_PROFILE,
    ...p,
    twitchLogin: String(p.twitchLogin || "").slice(0, 60),
    displayName: String(p.displayName || "").trim().slice(0, 20),
    avatarId: String(p.avatarId || "").slice(0, 120),
    useTwitchAvatar: !!p.useTwitchAvatar,
    crAccounts,
    crTag,
    crName: active ? active.name : null,
    updatedAt: Number(p.updatedAt) || 0,
  };
}

function rowToProfile(row) {
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data); }
  catch { /* korrupte Zeile → Defaults */ }
  const profile = normalizeProfile(data);
  profile.twitchId = row.twitch_id;
  return profile;
}

function persist(twitchId, profile) {
  const { twitchId: _tid, ...data } = profile;
  _db
    .prepare("INSERT OR REPLACE INTO cr_profiles (twitch_id, data) VALUES (?, ?)")
    .run(String(twitchId), JSON.stringify(data));
}

/** Profil laden; legt bei Bedarf einen leeren Eintrag an. */
function getOrCreateProfile(twitchId, twitchLogin = "") {
  if (!_db) return null;
  const id = String(twitchId);
  const row = _db.prepare("SELECT * FROM cr_profiles WHERE twitch_id = ?").get(id);
  if (row) {
    const profile = rowToProfile(row);
    if (twitchLogin && profile.twitchLogin !== twitchLogin) {
      profile.twitchLogin = twitchLogin;
      persist(id, profile); // direkt persistieren, nicht über saveProfile() (sonst Rekursion)
    }
    return profile;
  }
  const profile = normalizeProfile({ twitchLogin, updatedAt: Date.now() });
  profile.twitchId = id;
  persist(id, profile);
  return profile;
}

/** Profil lesen ohne anzulegen (für Stellen, die nur bei vorhandenem Profil etwas tun). */
function getProfile(twitchId) {
  if (!_db) return null;
  const row = _db.prepare("SELECT * FROM cr_profiles WHERE twitch_id = ?").get(String(twitchId));
  return rowToProfile(row);
}

/** Teil-Update: nur die übergebenen Felder ändern, Rest bleibt. */
function saveProfile(twitchId, patch) {
  if (!_db) return null;
  const current = getOrCreateProfile(twitchId, patch?.twitchLogin || "");
  const next = normalizeProfile({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: Date.now(),
  });
  next.twitchId = String(twitchId);
  persist(twitchId, next);
  return next;
}

/** Neuen CR-Account hinzufügen (oder, falls schon vorhanden, nur den Namen auffrischen) und
 *  sofort als aktiv markieren — genau wie das bisherige Ein-Account-linkCr es tat. */
function addCrAccount(twitchId, twitchLogin, tag, name) {
  const current = getOrCreateProfile(twitchId, twitchLogin);
  const rest = current.crAccounts.filter((a) => a.tag !== tag);
  const crAccounts = [...rest, { tag, name }];
  return saveProfile(twitchId, { twitchLogin, crAccounts, crTag: tag, crName: name });
}

/** Einen Account aus der Liste entfernen. War er aktiv, rückt der nächste verbliebene nach
 *  (oder null, wenn keiner mehr da ist). */
function removeCrAccount(twitchId, tag) {
  const current = getOrCreateProfile(twitchId);
  const crAccounts = current.crAccounts.filter((a) => a.tag !== tag);
  const patch = { crAccounts };
  if (current.crTag === tag) {
    const next = crAccounts[0] || null;
    patch.crTag = next?.tag ?? null;
    patch.crName = next?.name ?? null;
  }
  return saveProfile(twitchId, patch);
}

/** Nur den aktiven Account wechseln — keine erneute API-Prüfung nötig, der Tag steckt schon
 *  verifiziert in crAccounts. Unbekannter Tag ändert nichts. */
function setActiveCrAccount(twitchId, tag) {
  const current = getOrCreateProfile(twitchId);
  const found = current.crAccounts.find((a) => a.tag === tag);
  if (!found) return current;
  return saveProfile(twitchId, { crTag: found.tag, crName: found.name });
}

module.exports = {
  initCrProfileStore,
  getOrCreateProfile,
  getProfile,
  saveProfile,
  addCrAccount,
  removeCrAccount,
  setActiveCrAccount,
  getDbPath: () => DB_PATH,
};
