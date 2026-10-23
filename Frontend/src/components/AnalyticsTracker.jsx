// AnalyticsTracker.jsx — meldet Seitenaufrufe und sichtbare Zeit an die eigene Besucherstatistik
// (Backend/analytics/). Setzt kein Cookie und legt nichts im Browser ab; gezählt wird auf dem
// Server, die Auswertung steht im Admin-Dashboard unter "Besucher".
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const ENDPOINT = "/api/analytics/hit";

// OBS-Overlays, Steuer-Links, Login-Rücksprung und Admin zählen nicht (der Server verwirft sie
// ebenfalls, siehe analytics/normalize.js) — hier spart es nur die Anfrage.
const EXCLUDED = /(^\/winchallengeoverlay\/)|(\/overlay\/)|(^\/winchallengecontrol(\/|$))|(^\/admin(\/|$))|(^\/auth(\/|$))/i;

// navigator.webdriver: prerender.js und die Puppeteer-Prüfstände sollen keine Besuche erzeugen.
const enabled = typeof navigator !== "undefined" && !navigator.webdriver;

function send(body) {
  try {
    const json = JSON.stringify(body);
    // sendBeacon überlebt das Schließen des Tabs, fetch nicht zuverlässig.
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: "application/json" }))) return;
    fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true })
      .catch(() => {});
  } catch { /* Statistik ist Beiwerk — ein Fehler hier darf die Seite nie stören */ }
}

function campaignTag() {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("utm_source") || q.get("ref") || undefined;
  } catch {
    return undefined;
  }
}

export default function AnalyticsTracker() {
  const { pathname } = useLocation();
  // path: gerade gezählte Seite · since: seit wann sie sichtbar ist (0 = Tab im Hintergrund) · entry: erster Aufruf dieses Seitenladens
  const state = useRef({ path: null, since: 0, entry: true });

  // Sichtbare Zeit der aktuellen Seite abschicken und die Uhr anhalten.
  const flush = () => {
    const s = state.current;
    if (s.path && s.since) {
      const seconds = Math.round((performance.now() - s.since) / 1000);
      if (seconds >= 1) send({ t: "time", p: s.path, s: seconds });
    }
    s.since = 0;
  };

  useEffect(() => {
    if (!enabled) return;
    const s = state.current;
    flush();
    if (EXCLUDED.test(`${pathname}/`)) {
      s.path = null;
      return;
    }
    s.path = pathname;
    s.since = document.visibilityState === "visible" ? performance.now() : 0;
    const view = { t: "view", p: pathname, l: navigator.language };
    if (s.entry) {
      view.e = 1;
      view.r = document.referrer || "";
      view.c = campaignTag();
      s.entry = false;
    }
    send(view);
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else if (state.current.path) state.current.since = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}
