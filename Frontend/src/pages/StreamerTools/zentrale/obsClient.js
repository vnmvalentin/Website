// obsClient.js — ein kleiner Client für die WebSocket-Schnittstelle von OBS (obs-websocket 5, in OBS ab Version 28
// eingebaut). Der Browser verbindet sich direkt mit OBS auf diesem Rechner (ws://127.0.0.1:<port>); das Passwort
// geht nie an die Website.
//
// Geprüft (17.11.2026, Chrome 148): Eine HTTPS-Seite darf ws://127.0.0.1 öffnen — gemischte Inhalte sind dafür kein
// Hindernis. Chrome fragt aber seit Local Network Access einmal nach („… möchte auf Apps auf diesem Gerät
// zugreifen“). Ohne Zustimmung scheitert die Verbindung wie bei einem ausgeschalteten OBS.
//
// Protokoll: OBS schickt Hello (op 0, ggf. mit challenge/salt) → wir antworten Identify (op 1) → Identified (op 2).
// Danach Request (op 6) / RequestResponse (op 7). Anmeldung: base64(sha256(base64(sha256(passwort + salt)) + challenge)).

export const OBS_DEFAULT_PORT = 4455;
const OP = { Hello: 0, Identify: 1, Identified: 2, Request: 6, RequestResponse: 7 };
const CONNECT_TIMEOUT_MS = 6000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Fehler mit Code: unreachable (OBS aus, Server aus, Browser blockt), auth (Passwort falsch), auth_needed (OBS will
 * eins), version (OBS zu alt), timeout, closed, request_<OBS-Statuscode> (z. B. request_600 = nicht gefunden).
 */
export class ObsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

async function sha256Base64(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Anmelde-Zeichenkette für Identify (obs-websocket 5). */
export async function authString(password, salt, challenge) {
  const secret = await sha256Base64(String(password) + salt);
  return sha256Base64(secret + challenge);
}

/**
 * Verbinden und anmelden.
 * @param {object} opts
 * @param {number} [opts.port]
 * @param {string} [opts.password]
 * @param {Function} [opts.WebSocketImpl]  für Tests
 * @returns {Promise<{ request: (type: string, data?: object) => Promise<object>, close: () => void,
 *   onClose: (fn: () => void) => () => void }>}
 */
export function connectObs({ port = OBS_DEFAULT_PORT, password = "", WebSocketImpl = globalThis.WebSocket, timeoutMs = CONNECT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const pending = new Map();
    const closeListeners = new Set();
    let ws = null;
    let settled = false;
    let identified = false;
    let seq = 0;

    const fail = (code, message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch { /* schon zu */ }
      reject(new ObsError(code, message));
    };
    const timer = setTimeout(() => fail("timeout"), timeoutMs);

    const api = {
      request(requestType, requestData = {}) {
        return new Promise((res, rej) => {
          if (!ws || ws.readyState !== 1) {
            rej(new ObsError("closed"));
            return;
          }
          seq += 1;
          const requestId = `r${seq}`;
          const t = setTimeout(() => {
            if (pending.delete(requestId)) rej(new ObsError("timeout", requestType));
          }, REQUEST_TIMEOUT_MS);
          pending.set(requestId, { resolve: (v) => { clearTimeout(t); res(v); }, reject: (e) => { clearTimeout(t); rej(e); } });
          ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, requestData } }));
        });
      },
      close() {
        try { ws && ws.close(1000); } catch { /* schon zu */ }
      },
      onClose(fn) {
        closeListeners.add(fn);
        return () => closeListeners.delete(fn);
      },
    };

    const port_ = Math.round(Number(port)) || OBS_DEFAULT_PORT;
    try {
      ws = new WebSocketImpl(`ws://127.0.0.1:${port_}`);
    } catch (e) {
      fail("unreachable", e && e.message);
      return;
    }

    ws.onerror = () => { if (!identified) fail("unreachable"); };
    ws.onclose = (ev) => {
      if (!identified) fail(ev && ev.code === 4009 ? "auth" : ev && ev.code === 4010 ? "version" : "unreachable");
      for (const p of pending.values()) p.reject(new ObsError("closed"));
      pending.clear();
      if (identified) for (const fn of closeListeners) { try { fn(); } catch { /* weiter */ } }
    };
    ws.onmessage = async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const d = msg && msg.d ? msg.d : {};
      if (msg.op === OP.Hello) {
        const identify = { rpcVersion: 1, eventSubscriptions: 0 };
        if (d.authentication) {
          if (!password) {
            fail("auth_needed");
            return;
          }
          try {
            identify.authentication = await authString(password, d.authentication.salt, d.authentication.challenge);
          } catch (e) {
            fail("auth", e && e.message);
            return;
          }
        }
        ws.send(JSON.stringify({ op: OP.Identify, d: identify }));
      } else if (msg.op === OP.Identified) {
        identified = true;
        settled = true;
        clearTimeout(timer);
        resolve(api);
      } else if (msg.op === OP.RequestResponse) {
        const p = pending.get(d.requestId);
        if (!p) return;
        pending.delete(d.requestId);
        if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
        else p.reject(new ObsError(`request_${(d.requestStatus && d.requestStatus.code) || 0}`, (d.requestStatus && d.requestStatus.comment) || d.requestType));
      }
    };
  });
}

/**
 * Hat der Browser den Zugriff auf Apps auf diesem Gerät ausdrücklich verboten? (Chrome: Local Network Access)
 * @returns {Promise<boolean>} true nur bei „denied“; unbekannt oder nicht unterstützt → false
 */
export async function localAccessDenied() {
  if (typeof navigator === "undefined" || !navigator.permissions || !navigator.permissions.query) return false;
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      const s = await navigator.permissions.query({ name });
      return s.state === "denied";
    } catch { /* Name unbekannt — nächsten versuchen */ }
  }
  return false;
}
