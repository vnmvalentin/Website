// obsClient.js — Minimaler OBS-WebSocket-v5-Client (obs-websocket 5.x, OBS 28+).
// Bewusst ohne Fremdbibliothek: Es werden nur Handshake + einzelne Requests gebraucht.
//
// Verbindungen gehen IMMER vom Browser des Streamers zu seinem lokalen OBS
// (ws://127.0.0.1:4455) — der Webserver kann OBS hinter NAT nicht erreichen.
// Browser erlauben localhost-Websockets auch von HTTPS-Seiten aus.

async function sha256Base64(input) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Verbindet zu OBS und identifiziert sich (inkl. Passwort-Challenge).
 * @returns {Promise<{connected: boolean, request: Function, close: Function, onClose: Function}>}
 */
export function connectObs({ host = "127.0.0.1", port = 4455, password = "", timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = `ws://${(host || "127.0.0.1").trim()}:${port || 4455}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return reject(new Error(`WebSocket zu ${url} konnte nicht erstellt werden: ${e.message}`));
    }

    let settled = false;
    let reqCounter = 0;
    const pending = new Map();
    const closeHandlers = new Set();

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* */ }
      reject(new Error(
        "Zeitüberschreitung — läuft OBS und ist der WebSocket-Server aktiv? (OBS: Werkzeuge → WebSocket-Servereinstellungen)"
      ));
    }, timeoutMs);

    const client = {
      get connected() {
        return ws.readyState === WebSocket.OPEN;
      },
      request(requestType, requestData = {}) {
        return new Promise((res, rej) => {
          if (ws.readyState !== WebSocket.OPEN) return rej(new Error("OBS nicht verbunden"));
          const requestId = "r" + ++reqCounter;
          pending.set(requestId, { res, rej });
          ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
          setTimeout(() => {
            if (pending.has(requestId)) {
              pending.delete(requestId);
              rej(new Error(`${requestType}: keine Antwort von OBS`));
            }
          }, 8000);
        });
      },
      close() {
        try { ws.close(); } catch { /* */ }
      },
      onClose(cb) {
        closeHandlers.add(cb);
      },
    };

    ws.onmessage = async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.op === 0) {
        // Hello → Identify (bei aktiviertem Passwort mit Challenge/Salt-Antwort)
        const d = { rpcVersion: 1, eventSubscriptions: 0 };
        const auth = msg.d?.authentication;
        if (auth) {
          if (!password) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* */ }
            return reject(new Error("OBS verlangt ein WebSocket-Passwort — bitte eintragen."));
          }
          const secret = await sha256Base64(password + auth.salt);
          d.authentication = await sha256Base64(secret + auth.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        // Identified — Verbindung steht
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(client);
        }
      } else if (msg.op === 7) {
        const { requestId, requestStatus, responseData } = msg.d || {};
        const p = pending.get(requestId);
        if (!p) return;
        pending.delete(requestId);
        if (requestStatus?.result) p.res(responseData || {});
        else p.rej(new Error(requestStatus?.comment || `OBS-Request fehlgeschlagen (Code ${requestStatus?.code})`));
      }
    };

    ws.onclose = (ev) => {
      clearTimeout(timer);
      for (const { rej } of pending.values()) rej(new Error("OBS-Verbindung geschlossen"));
      pending.clear();
      if (!settled) {
        settled = true;
        const hint =
          ev.code === 4009
            ? "Falsches OBS-WebSocket-Passwort."
            : `Keine Verbindung zu OBS (${url}). Läuft OBS? Ist der WebSocket-Server aktiviert?`;
        reject(new Error(hint));
      }
      closeHandlers.forEach((cb) => {
        try { cb(ev); } catch { /* */ }
      });
    };
    ws.onerror = () => {
      /* Details kommen über onclose */
    };
  });
}

/** Alle Szenennamen (in OBS-Reihenfolge, oben zuerst). */
export async function fetchScenes(client) {
  const { scenes } = await client.request("GetSceneList");
  return (scenes || [])
    .slice()
    .sort((a, b) => (b.sceneIndex ?? 0) - (a.sceneIndex ?? 0))
    .map((s) => s.sceneName);
}

/**
 * Quellen einer Szene — INKLUSIVE der Inhalte von Gruppen (OBS-"Ordnern").
 * OBS behandelt eine Gruppe intern wie eine eigene Mini-Szene: ihre Kinder werden
 * über den Gruppennamen als eigenen `sceneName` abgefragt, nicht über die
 * äußere Szene. Deshalb reicht ein einfaches GetSceneItemList nicht — verschachtelte
 * Quellen (z. B. eine Screen-Capture in einem Ordner "Grafics") würden sonst nicht
 * auftauchen, nur der Ordner selbst.
 * @returns {{ containerName: string, sourceName: string, label: string }[]}
 *   containerName ist der tatsächlich adressierbare Name (Szene ODER Gruppe) —
 *   der wird für GetSceneItemId/SetSceneItemEnabled gebraucht, nicht die äußere Szene.
 */
export async function fetchSceneSourcesDeep(client, sceneName) {
  const { sceneItems } = await client.request("GetSceneItemList", { sceneName });
  const out = [];
  for (const item of sceneItems || []) {
    if (item.isGroup) {
      try {
        // Gruppen dürfen NICHT über GetSceneItemList abgefragt werden — OBS antwortet
        // dann mit einem Fehler ("scene is a group"). Dafür gibt es GetGroupSceneItemList.
        const { sceneItems: children } = await client.request("GetGroupSceneItemList", {
          sceneName: item.sourceName,
        });
        for (const child of children || []) {
          out.push({
            containerName: item.sourceName,
            sourceName: child.sourceName,
            label: `${item.sourceName} / ${child.sourceName}`,
          });
        }
      } catch {
        // Gruppe konnte nicht aufgelöst werden — wenigstens den Ordner selbst anbieten
        out.push({ containerName: sceneName, sourceName: item.sourceName, label: item.sourceName });
      }
    } else {
      out.push({ containerName: sceneName, sourceName: item.sourceName, label: item.sourceName });
    }
  }
  return out;
}

/**
 * Führt die konfigurierten Aktionen eines Events aus:
 * - sceneName: Programm-Szene wechseln
 * - source: { sceneName, sourceName, action: 'show'|'hide' } ein-/ausblenden
 */
export async function runObsEventActions(client, actionCfg) {
  if (!actionCfg) return;
  if (actionCfg.sceneName) {
    await client.request("SetCurrentProgramScene", { sceneName: actionCfg.sceneName });
  }
  const src = actionCfg.source;
  if (src?.sceneName && src?.sourceName && (src.action === "show" || src.action === "hide")) {
    const { sceneItemId } = await client.request("GetSceneItemId", {
      sceneName: src.sceneName,
      sourceName: src.sourceName,
    });
    await client.request("SetSceneItemEnabled", {
      sceneName: src.sceneName,
      sceneItemId,
      sceneItemEnabled: src.action === "show",
    });
  }
}
