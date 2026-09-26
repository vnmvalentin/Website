// winTrackerChat.js — Twitch-Chat-Befehle für den Clash-Royale-Win-Tracker. Läuft über die
// gemeinsame IRC-Verbindung aus winchallengeIrc.js (kein eigener Twitch-Connect, keine
// zusätzliche Anfragelast) und nutzt deren Sendewarteschlange für Antworten. Nur Moderatoren
// und der Broadcaster des hinterlegten Kanals dürfen die Befehle auslösen.
//
//   !tracker #TAG / !tracker set #TAG   — aktiven Account umschalten (nur bereits verknüpfte;
//                                          "#TAG" bare bleibt als Alias erhalten, war der
//                                          einzige Befehl vor dieser Erweiterung)
//   (kein "!tracker mode" mehr — track_mode wird IMMER automatisch auf den zuletzt gespielten
//    Modus gestellt, siehe autoSwitchTrackMode in crWinTrackerRoutes.js)
//   !tracker reset                      — Session (Profit/Win-Loss/letzte 5) des AKTIVEN
//                                          Accounts im GERADE getrackten Modus zurücksetzen, ohne
//                                          auf die automatische 4h-Pausen-Regel zu warten (siehe
//                                          SESSION_GAP_MS in crWinTrackerRoutes.js) — trackt der
//                                          aktive Account z.B. 2v2, resettet das NUR die 2v2-
//                                          Session, nicht Ranked1v1 (und umgekehrt)
//   !tracker add #TAG                   — neuen Account verknüpfen (ruft dieselbe
//                                          Erstbefüllung wie POST /accounts auf, siehe
//                                          addAccountForUser in crWinTrackerRoutes.js)
//   !tracker list                       — alle verknüpften Accounts mit Spielername auflisten
const db = require("./winTrackerStore");
// addAccountForUser für "!tracker add" — dieselbe Erstbefüllung (Spielerdaten, Battlelog, Deck,
// Stufen-Anker) wie POST /accounts, nicht ein zweites Mal ausgeschrieben.
const { addAccountForUser } = require("../routes/crWinTrackerRoutes");

const getSettingsByChatChannel = db.prepare(
  "SELECT * FROM cr_wintracker_settings WHERE chat_channel = ? AND chat_enabled = 1"
);
const getAccountsByUser = db.prepare(
  "SELECT account_id, player_tag, player_name, track_mode, is_active FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY created_at ASC"
);
const deactivateAll = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 0 WHERE user_id = ?");
const activateOne = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 1 WHERE account_id = ?");
// Manueller Session-Reset für "!tracker reset" — dieselben drei Spalten wie der Reset-Button im
// Editor (siehe POST /accounts/:id/reset-session in crWinTrackerRoutes.js): session_reset_at für
// Ranked1v1/medals, session_reset_trophy_at für den Trophäenmodus (eigene Session seit dem
// "Seasonal Trophy Road"-Fix, siehe isTrophyRoadArena in crWinTrackerRoutes.js), session_reset_2v2_at
// für die eigenständige 2v2-Ranked-Session.
const setSessionResetStmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_at = ? WHERE account_id = ?");
const setSessionReset2v2Stmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_2v2_at = ? WHERE account_id = ?");
const setSessionResetTrophyStmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_trophy_at = ? WHERE account_id = ?");

const normalizeChannel = (ch) => String(ch || "").trim().toLowerCase().replace(/^#/, "");
// Gleiche Normalisierung wie crApi.js: O wird als 0 gelesen (Verwechslungsgefahr in der Spielschrift).
const normalizeTag = (raw) => String(raw || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");

/** Alle Kanäle, in denen der Bot wegen der Win-Tracker-Chat-Befehle mitlesen soll. */
function getTrackerChannels() {
  const rows = db
    .prepare("SELECT chat_channel FROM cr_wintracker_settings WHERE chat_enabled = 1 AND chat_channel <> ''")
    .all();
  return [...new Set(rows.map((r) => normalizeChannel(r.chat_channel)))].filter(Boolean);
}

/** Mod, Broadcaster oder globaler Mod — dieselbe Prüfung wie winchallengeIrc.js:isAllowedSender. */
function isAllowedSender(tags) {
  if (tags.mod === true || tags.mod === "1") return true;
  const userType = tags["user-type"] || tags.userType;
  if (userType === "mod" || userType === "global_mod") return true;
  // tmi.js: badges oft { broadcaster: "1" }
  const b = tags.badges;
  if (b && typeof b === "object" && b.broadcaster != null) return true;
  if (typeof b === "string" && b.includes("broadcaster")) return true;
  return false;
}

// ── Kleines DE/EN-Wörterbuch für Chat-Antworten ───────────────────────────────────────────────
// Eigenständig statt der Frontend-wtI18n.js (die ist im Frontend-Bundle, hier serverseitig nicht
// erreichbar) — selbes Muster wie core/errors.js → resolveError() im Backend. settings.language
// ist bereits vorhanden (steuert Editor-UI + Overlay-Inhalt) und wird hier für Chat-Antworten
// mitgenutzt, statt eine dritte, unabhängige Sprachwahl einzuführen.
const T = {
  de: {
    help: "Befehle: !tracker set #TAG, !tracker reset, !tracker add #TAG, !tracker list",
    noTag: (arg) => `Kein Spieler-Kürzel angegeben. Beispiel: !tracker set #${arg || "2PP0V9YLL"}`,
    setOk: (name, tag) => `Tracker zeigt jetzt ${name} (#${tag}).`,
    setNotFound: (tag) => `Kein verknüpfter Account mit #${tag} gefunden.`,
    resetNoActive: () => `Kein aktiver Account — erst mit !tracker set #TAG einen auswählen.`,
    resetOk: (name, label) => `${name}: ${label}-Session zurückgesetzt.`,
    addNoTag: () => `Bitte ein Spieler-Kürzel angeben: !tracker add #TAG`,
    addOk: (name, tag) => `Account #${tag} (${name}) hinzugefügt.`,
    listEmpty: () => `Noch kein Account verknüpft.`,
    listPrefix: (n) => `${n} Account${n === 1 ? "" : "s"}: `,
    listEntry: (name, tag, active) => `#${tag} (${name}${active ? ", aktiv" : ""})`,
    modeLabels: { medals: "Ranked (Medaillen)", trophies: "Trophäenstraße", "2v2": "2v2 Ranked" },
  },
  en: {
    help: "Commands: !tracker set #TAG, !tracker reset, !tracker add #TAG, !tracker list",
    noTag: (arg) => `No player tag given. Example: !tracker set #${arg || "2PP0V9YLL"}`,
    setOk: (name, tag) => `Tracker now shows ${name} (#${tag}).`,
    setNotFound: (tag) => `No linked account with #${tag} found.`,
    resetNoActive: () => `No active account — pick one first with !tracker set #TAG.`,
    resetOk: (name, label) => `${name}: ${label} session reset.`,
    addNoTag: () => `Please give a player tag: !tracker add #TAG`,
    addOk: (name, tag) => `Account #${tag} (${name}) added.`,
    listEmpty: () => `No account linked yet.`,
    listPrefix: (n) => `${n} account${n === 1 ? "" : "s"}: `,
    listEntry: (name, tag, active) => `#${tag} (${name}${active ? ", active" : ""})`,
    modeLabels: { medals: "Ranked (medals)", trophies: "Trophy Road", "2v2": "2v2 Ranked" },
  },
};
const dict = (row) => (row?.language === "en" ? T.en : T.de);

/** Zeigt den angegebenen (bereits verknüpften) Account im Overlay an. */
function cmdSet(row, t, rawTag) {
  const tag = normalizeTag(rawTag);
  if (!tag) return t.noTag(rawTag);
  const match = getAccountsByUser.all(row.user_id).find((a) => a.player_tag === tag);
  if (!match) return t.setNotFound(tag);
  deactivateAll.run(row.user_id);
  activateOne.run(match.account_id);
  return t.setOk(match.player_name || "#" + tag, tag);
}

/**
 * Setzt den Sessionbeginn des AKTIVEN Accounts auf "jetzt" — nur für dessen GERADE getrackten
 * Modus (medals, trophies und 2v2 haben seit dem "Seasonal Trophy Road"-Fix je eine eigene
 * Session, siehe computeSessionStartMs/computeTrophySessionStartMs/compute2v2SessionStartMs in
 * crWinTrackerRoutes.js). Wirkt nur als untere Schranke: läuft die automatische 4h-Lücken-Regel
 * später ohnehin eine neue Session an, sticht sie den manuellen Reset von selbst wieder aus.
 */
function cmdReset(row, t) {
  const active = getAccountsByUser.all(row.user_id).find((a) => a.is_active);
  if (!active) return t.resetNoActive();
  const mode = active.track_mode || "medals";
  if (mode === "2v2") setSessionReset2v2Stmt.run(Date.now(), active.account_id);
  else if (mode === "trophies") setSessionResetTrophyStmt.run(Date.now(), active.account_id);
  else setSessionResetStmt.run(Date.now(), active.account_id);
  return t.resetOk(active.player_name || "#" + active.player_tag, t.modeLabels[mode] || t.modeLabels.medals);
}

/** Verknüpft einen neuen Account — dieselbe Erstbefüllung wie die Account-Seite. */
async function cmdAdd(row, t, rawTag) {
  if (!normalizeTag(rawTag)) return t.addNoTag();
  const result = await addAccountForUser(row.user_id, "", rawTag);
  if (!result.ok) return result.error;
  return t.addOk(result.account.playerName, result.account.playerTag);
}

/** Listet alle verknüpften Accounts mit Spielername auf. Twitch-Nachrichten sind auf ~500 Byte
 *  begrenzt (siehe trySendChatViaHelix in winchallengeIrc.js) — bei vielen Accounts wird gekappt. */
function cmdList(row, t) {
  const accounts = getAccountsByUser.all(row.user_id);
  if (!accounts.length) return t.listEmpty();
  let out = t.listPrefix(accounts.length);
  const entries = accounts.map((a) => t.listEntry(a.player_name || "#" + a.player_tag, a.player_tag, !!a.is_active));
  for (let i = 0; i < entries.length; i++) {
    const next = out + (i > 0 ? ", " : "") + entries[i];
    if (next.length > 450) { out += ` … (+${entries.length - i} mehr)`; break; }
    out = next;
  }
  return out;
}

/**
 * Wertet eine Chatzeile aus. Kein Treffer, falscher Kanal oder kein Mod/Broadcaster:
 * `reply: null` (still, kein Chat-Spam durch Fehlversuche Dritter). Async wegen "add" (ruft die
 * Royale API auf) — die anderen Unterbefehle laufen synchron durch.
 * @param {string} channel  Kanalname (mit oder ohne "#")
 * @param {object} tags     IRC-Tags der Nachricht
 * @param {string} message  Chatzeile
 * @returns {Promise<{ reply: string|null }>}
 */
async function applyTrackerChatLine(channel, tags, message) {
  const m = /^!tracker(?:\s+(.*))?$/i.exec(String(message || "").trim());
  if (!m) return { reply: null };

  const row = getSettingsByChatChannel.get(normalizeChannel(channel));
  if (!row) return { reply: null };
  if (!isAllowedSender(tags || {})) return { reply: null };

  const t = dict(row);
  const parts = (m[1] || "").trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();

  if (!sub) return { reply: t.help };
  if (sub === "list") return { reply: cmdList(row, t) };
  if (sub === "reset") return { reply: cmdReset(row, t) };
  if (sub === "add") return { reply: await cmdAdd(row, t, parts[1]) };
  if (sub === "set") return { reply: cmdSet(row, t, parts[1]) };
  // Bare "!tracker #TAG" (bzw. "!tracker TAG") — der einzige Befehl vor dieser Erweiterung,
  // als Alias für "set" erhalten, damit bestehende Chat-Gewohnheiten weiterlaufen.
  return { reply: cmdSet(row, t, parts[0]) };
}

module.exports = { getTrackerChannels, applyTrackerChatLine };
