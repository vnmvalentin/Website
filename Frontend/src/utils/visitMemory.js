// visitMemory.js — merkt sich NUR im Browser (localStorage), welche Bereiche der Seite man oft besucht, für
// "Schnell weiter" auf der Startseite. Geht nirgendwohin, kein Konto nötig; ohne Speicher (privates Fenster)
// bleibt der Schnellzugriff einfach leer.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { showcaseLinks } from "../config/navigation";

const KEY = "vnm_visits_v1";
const MAX_ENTRIES = 40;

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

/** Unterseite zu einem Pfad: der längste passende Eintrag (/clash-royale/win-tracker vor /clash-royale) */
export function linkForPath(pathname, links = showcaseLinks()) {
  const p = String(pathname || "").toLowerCase();
  let best = null;
  for (const l of links) {
    const to = l.to.toLowerCase();
    if ((p === to || p.startsWith(`${to}/`)) && (!best || to.length > best.to.length)) best = l;
  }
  return best;
}

export function recordVisit(pathname, now = Date.now()) {
  const link = linkForPath(pathname);
  if (!link) return;
  try {
    const d = read();
    const e = d[link.id] || { n: 0, last: 0 };
    // Mehrere Unterseiten desselben Bereichs kurz hintereinander zählen einmal
    if (now - e.last > 10 * 60 * 1000) e.n += 1;
    e.last = now;
    d[link.id] = e;
    const ids = Object.keys(d);
    if (ids.length > MAX_ENTRIES) ids.sort((a, b) => d[a].last - d[b].last).slice(0, ids.length - MAX_ENTRIES).forEach((id) => delete d[id]);
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* Speicher gesperrt — dann eben kein Schnellzugriff */ }
}

/** Besuche je Unterseite: Map id → Anzahl (für die Sortierung in den Türen der Startseite) */
export function visitCounts() {
  const d = read();
  return new Map(Object.entries(d).map(([id, e]) => [id, { n: Number(e?.n) || 0, last: Number(e?.last) || 0 }]));
}

/** Die meistbesuchten Unterseiten (bei Gleichstand die zuletzt besuchte zuerst) */
export function topVisited(k = 4) {
  const d = read();
  const byId = new Map(showcaseLinks().map((l) => [l.id, l]));
  return Object.entries(d)
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    .slice(0, k)
    .map(([id]) => byId.get(id));
}

/** In App einhängen: zählt jeden Seitenwechsel mit */
export function VisitMemory() {
  const { pathname } = useLocation();
  useEffect(() => { recordVisit(pathname); }, [pathname]);
  return null;
}
