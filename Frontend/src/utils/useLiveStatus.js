// useLiveStatus.js — ist der Kanal gerade live? Fragt das eigene Backend (/api/live, Backend/routes/liveRoutes.js),
// nicht Twitch direkt. Alle Stellen, die den Zustand zeigen (Kopfzeile, Startseite), teilen sich eine Anfrage.
// Ohne Antwort (Backend aus, Vorrendern) gilt „nicht live" — dann erscheint einfach kein Hinweis.
import { useEffect, useState } from "react";

const OFFLINE = { live: false, title: null, game: null, viewers: null, startedAt: null };
const REFRESH_MS = 2 * 60 * 1000;

let current = OFFLINE;
let fetchedAt = 0;
let pending = null;
const listeners = new Set();

function load() {
  if (pending) return;
  pending = fetch("/api/live")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { current = d && typeof d.live === "boolean" ? d : OFFLINE; })
    .catch(() => { /* Backend nicht erreichbar: letzter Stand bleibt */ })
    .finally(() => {
      fetchedAt = Date.now();
      pending = null;
      listeners.forEach((notify) => notify(current));
    });
}

/** @returns {{ live: boolean, title: string|null, game: string|null, viewers: number|null, startedAt: string|null }} */
export function useLiveStatus() {
  const [state, setState] = useState(current);

  useEffect(() => {
    listeners.add(setState);
    setState(current);
    // 5 s Spielraum: der Takt läuft ab dem Einhängen, fetchedAt erst ab der Antwort — sonst fiele jeder zweite Takt aus
    const refresh = () => { if (!document.hidden && Date.now() - fetchedAt >= REFRESH_MS - 5000) load(); };
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      listeners.delete(setState);
      clearInterval(id);
    };
  }, []);

  return state;
}
