// chatAvatars.js — Twitch-Profilbilder für die Murmelköpfe der 3D-Szenen.
//
// Anfragen werden kurz gesammelt und gebündelt an /api/chat-avatars geschickt (App-Token im Backend).
// Bilder werden mit crossOrigin geladen — ohne CORS-Freigabe darf WebGL sie nicht als Textur benutzen.
// Wer kein Bild hat (oder Demo-Chatter), behält den Anfangsbuchstaben.

const BATCH_MS = 350;
const entries = new Map();     // Schlüssel → { state: 'wait'|'done', img, cbs: [] }
let pending = new Map();       // Schlüssel → { kind, value }
let timer = 0;

function finish(key, img) {
  const e = entries.get(key);
  if (!e) return;
  e.state = 'done';
  e.img = img;
  for (const cb of e.cbs) cb(img);
  e.cbs = [];
}

function loadImage(key, url) {
  if (!url) { finish(key, null); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => finish(key, img);
  img.onerror = () => finish(key, null);
  img.src = url;
}

async function flush() {
  timer = 0;
  // höchstens 100 je Art pro Anfrage (Twitch-Grenze), der Rest geht in die nächste Runde
  const all = [...pending.entries()];
  const ids = all.filter(([, b]) => b.kind === 'id').slice(0, 100).map(([, b]) => b.value);
  const logins = all.filter(([, b]) => b.kind === 'login').slice(0, 100).map(([, b]) => b.value);
  for (const v of ids) pending.delete(`id:${v}`);
  for (const v of logins) pending.delete(`login:${v}`);
  if (pending.size) timer = setTimeout(flush, BATCH_MS);
  let data = { ids: {}, logins: {} };
  try {
    const res = await fetch(`/api/chat-avatars?ids=${ids.join(',')}&logins=${logins.join(',')}`);
    if (res.ok) data = await res.json();
  } catch { /* Backend nicht erreichbar: Buchstaben bleiben */ }
  for (const v of ids) loadImage(`id:${v}`, data.ids?.[v]);
  for (const v of logins) loadImage(`login:${v}`, data.logins?.[v]);
}

/**
 * Profilbild anfordern. `onImage(img|null)` wird genau einmal gerufen (auch sofort, falls schon geladen).
 * @param {{ userId?: string, login?: string }} who
 */
export function requestChatAvatar({ userId, login }, onImage) {
  let kind = null;
  let value = null;
  if (/^\d{1,20}$/.test(String(userId || ''))) { kind = 'id'; value = String(userId); }
  else if (/^[a-z0-9_]{2,25}$/i.test(String(login || ''))) { kind = 'login'; value = String(login).toLowerCase(); }
  if (!kind) { onImage(null); return; }
  const key = `${kind}:${value}`;
  let e = entries.get(key);
  if (e?.state === 'done') { onImage(e.img); return; }
  if (!e) {
    e = { state: 'wait', img: null, cbs: [] };
    entries.set(key, e);
    pending.set(key, { kind, value });
    if (!timer) timer = setTimeout(flush, BATCH_MS);
  }
  e.cbs.push(onImage);
}
