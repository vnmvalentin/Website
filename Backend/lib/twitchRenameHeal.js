/**
 * Kanal nach Twitch-Umbenennung nachziehen.
 *
 * Benennt sich ein Streamer um, steht in unseren Stores weiter sein alter Login als Kanal —
 * der IRC-Bot versucht dann alle 30 s, einem Kanal beizutreten, den es nicht mehr gibt
 * ("join failed (2x) …"), und Chatbefehle/Overlays hören im neuen Kanal nichts.
 *
 * Alle drei Quellen haben die Twitch-ID des Besitzers als Schlüssel und kennen seinen EIGENEN
 * Login: Stream-Tool (stream_tool_settings.twitch_login), Win-Tracker (Konten.twitch_login,
 * Chat-Kanal in den Einstellungen) und Win-Challenge (doc.hostName, doc.channels). Geheilt wird
 * nur, wenn der tote Kanal genau dieser eigene Login war — dann ist sicher, dass der Besitzer
 * seinen eigenen Kanal meinte. Ein fremder Kanal, der sich umbenannt hat, bleibt unangetastet
 * (der IRC-Teil probiert ihn nur noch selten, siehe Backoff in winchallengeIrc.js).
 *
 * @param {string} login   toter Kanal (klein, ohne #)
 * @param {object} deps
 *   helixGet(pathAndQuery) -> Promise<json|null>   Helix-Aufruf mit Bot-Token
 *   streamToolDb, winTrackerDb                       better-sqlite3-Instanzen
 *   winchallenge: { loadDb(), saveDb(db) }
 * @returns {Promise<{exists: boolean, healed: Array<{source, userId, from, to}>}>}
 */
async function healRenamedChannel(login, deps) {
  const from = String(login || "").trim().toLowerCase().replace(/^#/, "");
  const healed = [];
  if (!from) return { exists: false, healed };

  // Gibt es den Kanal noch, ist es kein Umbenennungs-Problem (Twitch-Störung, Bann o. Ä.)
  const existing = await deps.helixGet(`users?login=${encodeURIComponent(from)}`);
  if (!existing) return { exists: true, healed }; // Helix nicht erreichbar → lieber nichts ändern
  if ((existing.data || []).length) return { exists: true, healed };

  // Besitzer, deren EIGENER Login der tote Kanal war
  const owners = new Set();
  const stRows = deps.streamToolDb
    .prepare("SELECT user_id FROM stream_tool_settings WHERE lower(twitch_login) = ?").all(from);
  stRows.forEach((r) => owners.add(String(r.user_id)));
  const wtRows = deps.winTrackerDb
    .prepare("SELECT DISTINCT user_id FROM cr_wintracker_accounts WHERE lower(twitch_login) = ?").all(from);
  wtRows.forEach((r) => owners.add(String(r.user_id)));
  const wcDb = deps.winchallenge.loadDb() || {};
  for (const [uid, doc] of Object.entries(wcDb)) {
    if (String(doc?.hostName || "").trim().toLowerCase() === from) owners.add(String(uid));
  }
  if (!owners.size) return { exists: false, healed };

  // Aktuelle Logins über die (unveränderliche) Twitch-ID
  const ids = [...owners].filter((id) => /^\d+$/.test(id));
  if (!ids.length) return { exists: false, healed };
  const q = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const current = await deps.helixGet(`users?${q}`);
  const loginById = new Map((current?.data || []).map((u) => [String(u.id), String(u.login).toLowerCase()]));

  let wcChanged = false;
  for (const uid of ids) {
    const to = loginById.get(uid);
    if (!to || to === from) continue;

    const st = deps.streamToolDb
      .prepare("UPDATE stream_tool_settings SET twitch_login = ?, updated_at = ? WHERE user_id = ? AND lower(twitch_login) = ?")
      .run(to, Date.now(), uid, from);
    if (st.changes) healed.push({ source: "stream-tool", userId: uid, from, to });

    const wtChat = deps.winTrackerDb
      .prepare("UPDATE cr_wintracker_settings SET chat_channel = ? WHERE user_id = ? AND lower(chat_channel) = ?")
      .run(to, uid, from);
    deps.winTrackerDb
      .prepare("UPDATE cr_wintracker_accounts SET twitch_login = ? WHERE user_id = ? AND lower(twitch_login) = ?")
      .run(to, uid, from);
    if (wtChat.changes) healed.push({ source: "win-tracker", userId: uid, from, to });

    const doc = wcDb[uid];
    if (doc && String(doc.hostName || "").trim().toLowerCase() === from) {
      doc.hostName = to;
      const cc = doc.chatCommands;
      if (cc) {
        if (Array.isArray(cc.channels)) cc.channels = [...new Set(cc.channels.map((c) => (String(c).toLowerCase() === from ? to : c)))];
        if (String(cc.channel || "").toLowerCase() === from) cc.channel = to;
      }
      wcChanged = true;
      healed.push({ source: "win-challenge", userId: uid, from, to });
    }
  }
  if (wcChanged) await deps.winchallenge.saveDb(wcDb);
  return { exists: false, healed };
}

module.exports = { healRenamedChannel };
