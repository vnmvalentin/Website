// REST-Aufrufe der Turniere (Backend/clashRoyale/tournament/routes.js).
//
// Anmeldungen ohne Twitch-Login (signupMode 'open') erkennt der Server an einem Geheimschlüssel,
// den er beim Anmelden einmal zurückgibt. Der Browser hält ihn je Turnier in localStorage und
// schickt ihn als X-Tournament-Secret mit — wer den Browser wechselt, ist für das Turnier fremd.

const BASE = '/api/clash/tournaments';
const SECRET_KEY = (id) => `cr_tournament_secret_${id}`;

export const getSecret = (id) => {
  try { return localStorage.getItem(SECRET_KEY(id)) || ''; } catch { return ''; }
};
export const setSecret = (id, secret) => {
  try {
    if (secret) localStorage.setItem(SECRET_KEY(id), secret);
    else localStorage.removeItem(SECRET_KEY(id));
  } catch { /* privater Modus — Anmeldung gilt dann nur in diesem Tab */ }
};

/** Wirft { error: '<schlüssel>' } bei Fehlern — tError() aus tI18n.js übersetzt das. */
async function call(method, path, { body, tournamentId } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const secret = tournamentId ? getSecret(tournamentId) : '';
  if (secret) headers['X-Tournament-Secret'] = secret;
  let res;
  try {
    res = await fetch(BASE + path, {
      method, headers, credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { error: 'network' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { error: data.error || (res.status === 401 ? 'tournamentLoginRequired' : 'network'), params: data.params };
  return data;
}

export const tournamentApi = {
  meta: () => call('GET', '/meta'),
  list: () => call('GET', '/'),
  mine: () => call('GET', '/mine'),
  get: (id) => call('GET', `/${encodeURIComponent(id)}`, { tournamentId: id }),
  create: (settings) => call('POST', '/', { body: { settings } }),
  update: (id, settings) => call('PATCH', `/${encodeURIComponent(id)}`, { body: { settings } }),
  cancel: (id) => call('POST', `/${encodeURIComponent(id)}/cancel`),
  join: async (id, payload) => {
    const data = await call('POST', `/${encodeURIComponent(id)}/join`, { body: payload, tournamentId: id });
    if (data.secret) setSecret(id, data.secret);
    return data;
  },
  leave: async (id) => {
    const data = await call('POST', `/${encodeURIComponent(id)}/leave`, { tournamentId: id });
    setSecret(id, null);
    return data;
  },
  setFriendLink: (id, friendLink) => call('PATCH', `/${encodeURIComponent(id)}/me`, { body: { friendLink }, tournamentId: id }),
  start: (id) => call('POST', `/${encodeURIComponent(id)}/start`),
  setResult: (id, mid, result) => call('POST', `/${encodeURIComponent(id)}/matches/${encodeURIComponent(mid)}/result`, { body: result }),
  removeParticipant: (id, pid) => call('DELETE', `/${encodeURIComponent(id)}/participants/${encodeURIComponent(pid)}`),
};

/** Hängt ?lang=… an interne Links, damit die Sprache beim Navigieren erhalten bleibt. */
export const withLang = (path, lang) => (lang && lang !== 'de' ? `${path}?lang=${lang}` : path);
