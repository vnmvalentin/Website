// giveawayApi.js — Schnittstelle der Giveaways (Backend/giveaways/routes.js). Fehler tragen code (und bei Bedingungen
// die ergebnisse), die Texte stehen in giveawayTexts.js.

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    err.ergebnisse = json.ergebnisse;
    throw err;
  }
  return json;
}

const enc = encodeURIComponent;

/** { active: [], expired: [] } */
export const listGiveaways = () => call("/api/giveaways");
/** { dabei: [ids], betreiber } */
export const myGiveaways = () => call("/api/giveaways/mein");
/** { ok, ergebnisse: [{ id, ok, grund?, wert?, noetig? }], dabei } */
export const checkGiveaway = (id) => call(`/api/giveaways/${enc(id)}/pruefen`);
export const joinGiveaway = (id, user) =>
  call(`/api/giveaways/${enc(id)}/join`, { method: "POST", body: { displayName: user?.displayName, profileImageUrl: user?.profileImageUrl } });
export const leaveGiveaway = (id) => call(`/api/giveaways/${enc(id)}/leave`, { method: "POST" });
export const createGiveaway = (data) => call("/api/giveaways", { method: "POST", body: data });
export const deleteGiveaway = (id) => call(`/api/giveaways/${enc(id)}`, { method: "DELETE" });
export const drawGiveaway = (id) => call(`/api/giveaways/${enc(id)}/ziehen`, { method: "POST" });
export const redrawWinner = (id, index) => call(`/api/giveaways/${enc(id)}/neu`, { method: "POST", body: { index } });
/** { twitch: {...}, streams: { gezaehlt, live }, discord: { bereit, guildId, channelId }, server: [{ id, name, channels }] } */
export const giveawaySettings = () => call("/api/giveaways/einstellungen");
export const saveGiveawaySettings = (guildId, channelId) =>
  call("/api/giveaways/einstellungen", { method: "PUT", body: { guildId, channelId } });
/** { laufend, show, serverNow } — öffentlich, fürs OBS-Overlay */
export const giveawayStage = () => call("/api/giveaways/buehne");
/** Discord verknüpfen und danach zurück auf diese Seite */
export const discordLinkUrl = () => call(`/api/discord/login-url?returnTo=${enc("/Giveaways")}`).then((d) => d.url);
