// useFriends.js — Freundesliste der Minigames (Anzeige: FriendsPanel.jsx).
//
// Lesen über den bestehenden Minigame-Socket: bei jedem (Re-)Connect meldet sich der Client mit
// clash:friends:hello und seiner Visitenkarte (Name + Avatar), der Server antwortet mit dem
// kompletten Stand und schickt ihn danach von selbst, sobald sich etwas ändert (Freund kommt
// online, betritt eine Lobby …, siehe Backend/clashRoyale/core/friends.js). Wichtig ist das
// erneute hello nach Reconnects: "Lobby verlassen" trennt den Socket bewusst und baut ihn neu
// auf (useClashSocket.leaveLobby), der neue Socket ist für den Server ein Unbekannter.
//
// Ändern über REST (/api/clash/friends/*) — jede Antwort trägt den neuen eigenen Stand.
import { useCallback, useEffect, useRef, useState } from 'react';

const HELLO_DEBOUNCE_MS = 400;

async function post(path, body) {
  const res = await fetch(`/api/clash/friends/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return { ok: false, key: 'unauthorized' };
  try { return await res.json(); }
  catch { return { ok: false, key: 'friendServerError' }; }
}

/**
 * @param {{ current: import('socket.io-client').Socket | null }} socketRef  Socket aus useClashSocket
 * @param {object|null} user      eingeloggter Twitch-Nutzer (ohne: Liste zeigt nur den Login-Hinweis)
 * @param {{ name: string, avatarId: string, avatarUrl: string|null }} identity  eigene Visitenkarte
 */
export function useFriends(socketRef, user, identity) {
  // null = noch kein Stand vom Server
  const [state, setState] = useState(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const sayHello = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const { name, avatarId, avatarUrl } = identityRef.current;
    socket.emit('clash:friends:hello', { name, avatarId, avatarUrl: avatarUrl || '' });
  }, [socketRef]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !user) return undefined;
    const onState = (s) => setState(s);
    socket.on('connect', sayHello);
    socket.on('clash:friends:state', onState);
    sayHello();
    return () => {
      socket.off('connect', sayHello);
      socket.off('clash:friends:state', onState);
    };
  }, [socketRef, user, sayHello]);

  // Name/Avatar geändert (z.B. im Profil) → Visitenkarte auffrischen, entprellt.
  useEffect(() => {
    if (!user) return undefined;
    const id = setTimeout(sayHello, HELLO_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [user, identity.name, identity.avatarId, identity.avatarUrl, sayHello]);

  useEffect(() => { if (!user) setState(null); }, [user]);

  /** Führt eine Aktion aus; liefert { ok, key?, accepted? } für die Rückmeldung im Panel. */
  const run = useCallback(async (path, body) => {
    try {
      const res = await post(path, body);
      if (res.ok && res.state) setState(res.state);
      return res;
    } catch {
      return { ok: false, key: 'network' };
    }
  }, []);

  return {
    state,
    sendRequest: (login) => run('request', { login }),
    accept: (id) => run('accept', { id }),
    decline: (id) => run('decline', { id }),
    cancel: (id) => run('cancel', { id }),
    remove: (id) => run('remove', { id }),
  };
}
