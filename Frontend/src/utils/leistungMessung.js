// leistungMessung.js — misst, wie schnell und flüssig die Seite bei echten Besuchern läuft (Backend/leistung,
// Admin-Reiter „Leistung“). Am Server landen nur Tageswerte; im Browser wird nichts gespeichert.
//
// SEITEN — Kennzahlen wie Googles Web Vitals, ohne Fremdpaket über PerformanceObserver:
//   fcp  erster Inhalt sichtbar      lcp  größter Inhalt sichtbar   (beide nur beim ersten Laden der Seite)
//   inp  Reaktionszeit auf Eingaben  cls  Layout-Sprünge             (je Seite; ein Seitenwechsel in der App
//                                                                      meldet und zählt neu)
//   Chrome, Edge und Android-WebViews liefern alles, Firefox nur fcp/lcp, Safari kaum etwas.
// SPIELE — auf Spielseiten zählt ein requestAnimationFrame-Zähler die Bilder, ohne jede Änderung an den Spielen:
//   Bildzeit, Bilder über 33 ms (unter 30 fps) und über 50 ms (Ruckler). Die ersten 3 s nach dem Betreten zählen nicht
//   (Laden), Zeit im Hintergrund auch nicht. Die Bildrate hängt auch an der Bildwiederholrate des Geräts (60/120/144 Hz);
//   aussagekräftiger ist der Anteil langer Bilder.
// Gesendet wird beim Verlassen einer Seite und wenn der Tab in den Hintergrund geht. Nicht gemessen: OBS-Overlays,
// Steuer-Links, Admin, Prüfstände (navigator.webdriver). Im Dev-Server aus; an mit localStorage leistungMessungDev = "1".

import { isLowGfx } from "./lowGfx.js";

const ENDPUNKT = "/api/leistung";
const AUSGESCHLOSSEN = /(^\/winchallengeoverlay\/)|(\/overlay\/)|(^\/winchallengecontrol(\/|$))|(^\/admin(\/|$))|(^\/auth(\/|$))/i;
const SPIELE = ["/adventures", "/garden", "/blobby", "/seed-runners", "/sacrifice-and-sigils", "/flick-soccer", "/worldflip", "/lights-out", "/connect4"];
const AUFWAERMEN_MS = 3000;
const WIEDER_AUFWAERMEN_MS = 1000;
const MIN_SPIEL_MS = 5000;

// ---------- reine Regeln (getestet in pages/Admin/__tests__/leistungMessung.test.js) ----------------------------------

/** Spielseiten mit Bild-Zähler. Bei Clash Royale nur der Minigame-Hub selbst, nicht Turniere und Win Tracker. */
export function istSpielseite(pfad) {
  const p = String(pfad || "").toLowerCase();
  if (p === "/clash-royale") return true;
  return SPIELE.some((s) => p === s || p.startsWith(`${s}/`));
}

export const wirdGemessen = (pfad) => !AUSGESCHLOSSEN.test(`${String(pfad || "")}/`);

/** CLS wie bei Google: größtes „Sitzungsfenster“ (Sprünge < 1 s auseinander, Fenster ≤ 5 s), Sprünge nach Eingaben zählen nicht */
export function clsAus(eintraege) {
  let groesstes = 0;
  let fenster = 0;
  let erster = 0;
  let letzter = 0;
  for (const e of eintraege || []) {
    if (!e || e.hadRecentInput || !(e.value > 0)) continue;
    if (fenster && e.startTime - letzter < 1000 && e.startTime - erster < 5000) {
      fenster += e.value;
    } else {
      fenster = e.value;
      erster = e.startTime;
    }
    letzter = e.startTime;
    groesstes = Math.max(groesstes, fenster);
  }
  return groesstes;
}

/** INP wie bei Google: die längste Interaktion, ab 50 Interaktionen je 50 eine Ausreißerin weggelassen */
export function inpAus(dauern) {
  const d = (dauern || []).filter((x) => x > 0).sort((a, b) => b - a);
  if (!d.length) return 0;
  return d[Math.min(d.length - 1, Math.floor(d.length / 50))];
}

export const neuerAbschnitt = () => ({ ms: 0, bilder: 0, ueber33: 0, ueber50: 0 });

/** Ein Bild zählen. Lücken ab 1 s (Tab kurz weg, Debugger) sind keine Bilder. */
export function zaehleBild(abschnitt, dauer) {
  if (!abschnitt || !(dauer > 0) || dauer >= 1000) return;
  abschnitt.ms += dauer;
  abschnitt.bilder += 1;
  if (dauer > 33.4) abschnitt.ueber33 += 1;
  if (dauer > 50) abschnitt.ueber50 += 1;
}

// ---------- im Browser -------------------------------------------------------------------------------------------------

function devErlaubt() {
  try {
    return localStorage.getItem("leistungMessungDev") === "1";
  } catch {
    return false;
  }
}

function aktiv() {
  if (typeof window === "undefined") return false;
  if (import.meta.env?.DEV || navigator.webdriver) return devErlaubt();
  return !window.obsstudio;
}

function sende(bericht) {
  try {
    const json = JSON.stringify(bericht);
    // Wie components/AnalyticsTracker.jsx: sendBeacon überlebt das Schließen des Tabs
    if (navigator.sendBeacon?.(ENDPUNKT, new Blob([json], { type: "application/json" }))) return;
    fetch(ENDPUNKT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => {});
  } catch {
    // Messen ist Beiwerk — ein Fehler hier darf die Seite nie stören
  }
}

const z = {
  pfad: null,
  hatteSeite: false,
  erstesLaden: true,
  versteckt: false,
  gemeldet: false,
  clsMoeglich: false,
  cls: [],
  inp: new Map(),
  lcp: null,
  fcp: null,
  abschnitt: null,
  raf: 0,
  letzte: 0,
  warmBis: 0,
};
let installiert = false;

function geraet() {
  return { sparmodus: isLowGfx(), kerne: Number(navigator.hardwareConcurrency) || 0 };
}

function meldeSeite() {
  if (!z.pfad || z.gemeldet) return;
  z.gemeldet = true;
  const werte = {};
  if (z.erstesLaden && !z.versteckt) {
    if (z.fcp != null) werte.fcp = Math.round(z.fcp);
    if (z.lcp != null) werte.lcp = Math.round(z.lcp);
  }
  if (z.clsMoeglich) werte.cls = Math.round(clsAus(z.cls) * 1000) / 1000;
  if (z.inp.size) werte.inp = Math.round(inpAus([...z.inp.values()]));
  if (Object.keys(werte).length) sende({ art: "seite", seite: z.pfad, werte, ...geraet() });
}

function meldeSpiel() {
  const a = z.abschnitt;
  if (!a) return;
  if (a.ms >= MIN_SPIEL_MS) {
    sende({ art: "spiel", seite: z.pfad, ms: Math.round(a.ms), bilder: a.bilder, ueber33: a.ueber33, ueber50: a.ueber50, ...geraet() });
  }
  z.abschnitt = neuerAbschnitt();
}

function schritt(t) {
  if (z.letzte && t >= z.warmBis) zaehleBild(z.abschnitt, t - z.letzte);
  z.letzte = t;
  z.raf = requestAnimationFrame(schritt);
}

function starteZaehler(aufwaermen) {
  if (z.raf || !z.abschnitt) return;
  z.letzte = 0;
  z.warmBis = performance.now() + aufwaermen;
  z.raf = requestAnimationFrame(schritt);
}

function stoppeZaehler() {
  if (z.raf) cancelAnimationFrame(z.raf);
  z.raf = 0;
  z.letzte = 0;
}

function abschliessen() {
  meldeSeite();
  stoppeZaehler();
  meldeSpiel();
}

function beobachte(typ, optionen, verarbeite) {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(typ)) return false;
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries()) verarbeite(e);
    }).observe({ type: typ, buffered: true, ...optionen });
    return true;
  } catch {
    return false;
  }
}

/** Einmal beim Start (main.jsx). Gepuffert: Einträge vom Laden vor dem ersten Rendern zählen mit. */
export function installiereLeistungsMessung() {
  if (installiert || !aktiv()) return;
  installiert = true;
  // Im Hintergrund geöffnete Tabs haben keine aussagekräftigen Ladezeiten
  z.versteckt = document.visibilityState === "hidden";
  beobachte("paint", {}, (e) => { if (e.name === "first-contentful-paint") z.fcp = e.startTime; });
  beobachte("largest-contentful-paint", {}, (e) => { if (z.erstesLaden) z.lcp = e.startTime; });
  z.clsMoeglich = beobachte("layout-shift", {}, (e) => { z.cls.push({ value: e.value, startTime: e.startTime, hadRecentInput: e.hadRecentInput }); });
  beobachte("event", { durationThreshold: 40 }, (e) => {
    if (e.interactionId) z.inp.set(e.interactionId, Math.max(z.inp.get(e.interactionId) || 0, e.duration));
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      z.versteckt = true;
      abschliessen();
    } else if (z.abschnitt) {
      starteZaehler(WIEDER_AUFWAERMEN_MS);
    }
  });
  window.addEventListener("pagehide", abschliessen);
}

/** Andockstelle für den Router (components/LeistungTracker.jsx): bei jedem Seitenwechsel in der App aufrufen */
export function seitenwechsel(pfad) {
  if (!installiert) return;
  abschliessen();
  const erste = !z.hatteSeite;
  z.hatteSeite = true;
  z.erstesLaden = erste;
  if (!erste) {
    // Gepufferte Einträge vom ersten Laden gehören zur ersten Seite; danach zählt jede Seite für sich
    z.cls = [];
    z.inp = new Map();
  }
  z.pfad = wirdGemessen(pfad) ? String(pfad) : null;
  z.gemeldet = false;
  z.abschnitt = z.pfad && istSpielseite(z.pfad) ? neuerAbschnitt() : null;
  if (z.abschnitt && document.visibilityState === "visible") starteZaehler(AUFWAERMEN_MS);
}
