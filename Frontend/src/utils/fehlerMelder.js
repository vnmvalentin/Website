// fehlerMelder.js — Fehler im Browser an das eigene Fehlerprotokoll melden (Backend/fehler, Admin-Reiter „Fehler“).
//
// Gemeldet werden Laufzeitfehler (window "error"), abgelehnte Promises ohne Behandlung, React-Fehler (main.jsx über
// onCaughtError/onUncaughtError) und echte WebGL-Abbrüche. Draußen bleibt Rauschen: Browser-Erweiterungen,
// „Script error.“ ohne Inhalt (fremde iframes wie Twitch), ResizeObserver-Warnungen und veraltete Chunks nach einem
// Deploy (die lädt main.jsx ohnehin neu). Je Seitenaufruf jedes Fehlerbild einmal, höchstens 10 Meldungen.
// Im Dev-Server aus (das lokale Backend kennt die Route evtl. nicht); einschalten mit localStorage fehlerMelderDev = "1".
//
// meldeFehler(art, fehler, kontext) ist die Andockstelle für Spiele, die eigene, abgefangene Fehler melden wollen
// (art "manuell"). Schlüssel aus Adressen schwärzt der Server; hier wird nur gesammelt und gekürzt.

const ENDPUNKT = "/api/fehler";
const MAX_MELDUNGEN = 10;

const RAUSCHEN = [
  /ResizeObserver loop/i,
  /dynamically imported module|Importing a module script failed|error loading dynamically imported/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
];
const FREMD = /(chrome|moz|safari(-web)?)-extension:\/\/|webkit-masked-url:/i;

/** Rauschen, das nichts über die eigene Seite sagt */
export function sollIgnorieren({ nachricht, stapel }) {
  const n = String(nachricht || "").trim();
  if (!n) return true;
  if (RAUSCHEN.some((re) => re.test(n))) return true;
  return FREMD.test(String(stapel || ""));
}

function alsText(wert) {
  try {
    return JSON.stringify(wert).slice(0, 300);
  } catch {
    return "[Objekt]";
  }
}

/** Was an den Server geht — reine Funktion, damit sie sich ohne Browser testen lässt */
export function berichtAus(art, fehler, kontext = "", { pfad = "/", obs = false } = {}) {
  let nachricht;
  let stapel = "";
  if (fehler instanceof Error) {
    nachricht = `${fehler.name && fehler.name !== "Error" ? `${fehler.name}: ` : ""}${fehler.message || ""}`;
    stapel = fehler.stack || "";
  } else if (fehler && typeof fehler === "object") {
    nachricht = typeof fehler.message === "string" ? fehler.message : alsText(fehler);
    stapel = typeof fehler.stack === "string" ? fehler.stack : "";
  } else {
    nachricht = String(fehler ?? "");
  }
  return {
    art: String(art || "error"),
    nachricht: nachricht.slice(0, 500),
    stapel: stapel.slice(0, 4000),
    seite: String(pfad || "/").slice(0, 300),
    kontext: String(kontext || "").slice(0, 200),
    obs: Boolean(obs),
  };
}

/** Melder mit eigener Drossel; senden/umgebung sind austauschbar (Tests) */
export function erstelleMelder({ senden, umgebung }) {
  const schon = new Set();
  let gesendet = 0;
  return function melde(art, fehler, kontext) {
    try {
      const bericht = berichtAus(art, fehler, kontext, umgebung());
      if (sollIgnorieren(bericht)) return false;
      const schluessel = `${bericht.art}|${bericht.nachricht.slice(0, 200)}`;
      if (schon.has(schluessel) || gesendet >= MAX_MELDUNGEN) return false;
      schon.add(schluessel);
      gesendet += 1;
      senden(bericht);
      return true;
    } catch {
      // Ein Fehler beim Melden darf nie selbst einer werden
      return false;
    }
  };
}

/** Kurzform eines React-Komponentenstapels: "GameContainer < Suspense < LazyRouteBoundary" */
export function komponentenKette(componentStack) {
  return String(componentStack || "")
    .split("\n")
    .map((z) => z.trim().replace(/^at\s+/, "").split(/[\s(@]/)[0])
    .filter(Boolean)
    .slice(0, 5)
    .join(" < ");
}

function sendeImBrowser(bericht) {
  const json = JSON.stringify(bericht);
  // Wie components/AnalyticsTracker.jsx: sendBeacon überlebt das Schließen des Tabs, sonst fetch mit keepalive
  try {
    if (navigator.sendBeacon?.(ENDPUNKT, new Blob([json], { type: "application/json" }))) return;
  } catch {
    // weiter mit fetch
  }
  fetch(ENDPUNKT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => {});
}

function aktiv() {
  if (!import.meta.env?.DEV) return true;
  try {
    return localStorage.getItem("fehlerMelderDev") === "1";
  } catch {
    return false;
  }
}

const browserMelder = erstelleMelder({
  senden: (bericht) => {
    if (aktiv()) sendeImBrowser(bericht);
  },
  umgebung: () => ({
    pfad: typeof location !== "undefined" ? location.pathname : "/",
    obs: typeof window !== "undefined" && Boolean(window.obsstudio),
  }),
});

/** Andockstelle: abgefangene Fehler selbst melden (z. B. ein Spiel, das auf 2D zurückfällt) */
export function meldeFehler(art, fehler, kontext) {
  return browserMelder(art || "manuell", fehler, kontext);
}

let installiert = false;

/** Einmal beim Start (main.jsx), vor dem ersten Rendern */
export function installiereFehlerMelder() {
  if (installiert || typeof window === "undefined") return;
  installiert = true;

  // Ohne capture: Lade-Fehler von Bildern/Skripten kommen hier nicht an, nur Laufzeitfehler
  window.addEventListener("error", (ev) => {
    if (!ev || typeof ev.message !== "string") return;
    const ort = ev.filename ? `\n    at ${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : "";
    browserMelder("error", ev.error instanceof Error ? ev.error : { message: ev.message, stack: ort });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    browserMelder("unhandledrejection", ev ? ev.reason : "unbekannt");
  });

  // Spiele geben ihren WebGL-Kontext beim Verlassen selbst frei (forceContextLoss) und entfernen danach die Fläche. Ein
  // echter Abbruch (GPU-Reset, Treiber) ist es nur, wenn die Fläche danach noch im Dokument steht.
  window.addEventListener("webglcontextlost", (ev) => {
    const flaeche = ev.target;
    setTimeout(() => {
      if (flaeche && flaeche.isConnected) {
        browserMelder("webgl", new Error("WebGL-Kontext verloren"), `Fläche ${flaeche.width || 0}×${flaeche.height || 0}`);
      }
    }, 1500);
  }, true);
}
