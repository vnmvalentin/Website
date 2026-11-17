// utils/barrierefrei.js — Einstellungen für Barrierefreiheit, je Gerät (Seite /barrierefreiheit und Profil), und die
// Andockstelle für Spiele und Werkzeuge, die darauf reagieren sollen.
//
//   bewegung    "system" (wie im Betriebssystem, Standard) | "reduziert" (immer: keine automatische Bewegung)
//   kontrast    "system" (wie im Betriebssystem)           | "hoch" (blasse Schrift und Ränder kräftiger)
//   farbhilfe   true = Farben nie als einziges Merkmal (Spiele zeigen zusätzlich Zeichen/Muster, Links unterstrichen)
//   untertitel  true = wichtige Geräusche zusätzlich als Text (meldeGeraeusch → components/UntertitelLeiste.jsx)
//
// main.jsx ruft wendeBarrierefreiAn() einmal auf. Das setzt auf <html> data-bewegung="reduziert", data-kontrast="hoch",
// data-farbhilfe, data-untertitel — index.css hängt die Regeln für die ganze Website daran. data-kontrast steht auch,
// wenn nur das System mehr Kontrast wünscht (prefers-contrast: more). Bewegung dagegen nur bei eigener Wahl: unter
// „Wie im System“ gelten die vorhandenen @media (prefers-reduced-motion)-Regeln, die bewusst nur automatische
// Bewegung abschalten — die harte Regel für alles gibt es nur, wenn man „Immer“ wählt.
// OBS und Overlay-Seiten bekommen bewusst keine Attribute (wie utils/lowGfx.js): dort entscheidet der Streamer.
//
// Für Spiele (Anschlüsse im Ausbauplan):
//   bewegungReduziert()        → automatische Bewegung weglassen (Kamerawackeln, Dauer-Animationen, Einblenden).
//                                Hover/Klick-Reaktionen und das Spielgeschehen selbst laufen weiter.
//   farbhilfeAn() + FARBHILFE_FARBEN / FARBHILFE_ZEICHEN → Spielerfarben unterscheidbar machen
//   meldeGeraeusch(text, opts) → Untertitel für ein Geräusch (tut nichts, wenn Untertitel aus sind)
//   useBarrierefrei()          → alles davon als React-Hook, aktualisiert sich bei jeder Änderung

import { useSyncExternalStore } from "react";

const SCHLUESSEL = "barrierefrei";

export const BARRIEREFREI_STANDARD = Object.freeze({ bewegung: "system", kontrast: "system", farbhilfe: false, untertitel: false });

const ERLAUBT = {
  bewegung: (v) => v === "system" || v === "reduziert",
  kontrast: (v) => v === "system" || v === "hoch",
  farbhilfe: (v) => typeof v === "boolean",
  untertitel: (v) => typeof v === "boolean",
};

/** Nur bekannte Felder mit gültigen Werten; alles andere fällt auf den Standard zurück. */
export function bereinige(roh) {
  const aus = { ...BARRIEREFREI_STANDARD };
  if (roh && typeof roh === "object") {
    for (const [feld, gueltig] of Object.entries(ERLAUBT)) {
      if (gueltig(roh[feld])) aus[feld] = roh[feld];
    }
  }
  return aus;
}

/**
 * Farben, die auch bei Rot-Grün- und Blau-Gelb-Schwäche unterscheidbar bleiben (Okabe & Ito), in der Reihenfolge, in
 * der Spiele sie für Spieler 1, 2, 3 … vergeben sollten. Dazu je ein Zeichen, damit die Farbe nie allein trägt.
 */
export const FARBHILFE_FARBEN = Object.freeze([
  { id: "orange", hex: "#E69F00", name: { de: "Orange", en: "Orange" } },
  { id: "himmelblau", hex: "#56B4E9", name: { de: "Himmelblau", en: "Sky blue" } },
  { id: "gruen", hex: "#009E73", name: { de: "Blaugrün", en: "Bluish green" } },
  { id: "gelb", hex: "#F0E442", name: { de: "Gelb", en: "Yellow" } },
  { id: "blau", hex: "#0072B2", name: { de: "Blau", en: "Blue" } },
  { id: "zinnober", hex: "#D55E00", name: { de: "Zinnoberrot", en: "Vermilion" } },
  { id: "purpur", hex: "#CC79A7", name: { de: "Rotviolett", en: "Reddish purple" } },
]);
export const FARBHILFE_ZEICHEN = Object.freeze(["●", "▲", "■", "◆", "★", "✚", "⬟"]);

/**
 * Welche Spiele Farbhilfe und Untertitel schon können — die Seite /barrierefreiheit nennt sie bei der Einstellung.
 * Solange kein Spiel Untertitel kann, bleibt deren Schalter verborgen (er täte sonst nichts). Wer ein Spiel anbindet,
 * hängt hier eine Zeile an: { id: "lights-out", name: "Lights Out" } (id aus Backend/analytics/spiele.js).
 */
export const SPIELE_MIT = Object.freeze({
  farbhilfe: [],
  untertitel: [],
});

/**
 * Kern ohne Browser-Abhängigkeiten (Tests geben Speicher, Medienabfrage und Wurzel selbst mit).
 * @param {object} umgebung
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void }|null} [umgebung.speicher]
 * @param {(abfrage: string) => { matches: boolean, addEventListener?: Function }|null} [umgebung.medien]
 * @param {{ dataset: Record<string, string> }|null} [umgebung.wurzel]  meist document.documentElement
 * @param {boolean} [umgebung.overlay]  OBS/Overlay: keine Attribute setzen
 */
export function createBarrierefrei({ speicher = null, medien = null, wurzel = null, overlay = false } = {}) {
  const lies = () => {
    try { return bereinige(JSON.parse(speicher?.getItem(SCHLUESSEL) || "null")); } catch { return { ...BARRIEREFREI_STANDARD }; }
  };
  let stand = lies();
  const hoerer = new Set();
  const melde = () => hoerer.forEach((fn) => { try { fn(stand); } catch { /* ein Hörer darf die anderen nicht stören */ } });

  const abfrage = (q) => { try { return Boolean(medien?.(q)?.matches); } catch { return false; } };

  function setzeAttribute() {
    if (!wurzel || overlay) return;
    const d = wurzel.dataset;
    if (stand.bewegung === "reduziert") d.bewegung = "reduziert"; else delete d.bewegung;
    // Kontrast auch, wenn nur das System ihn wünscht — die Regeln in index.css hängen allein am Attribut
    if (stand.kontrast === "hoch" || abfrage("(prefers-contrast: more)")) d.kontrast = "hoch"; else delete d.kontrast;
    if (stand.farbhilfe) d.farbhilfe = ""; else delete d.farbhilfe;
    if (stand.untertitel) d.untertitel = ""; else delete d.untertitel;
  }

  const api = {
    lies: () => stand,
    /** Ändert einzelne Felder ({ farbhilfe: true }), merkt sie im Browser und meldet es allen Hörern. */
    setze(teil) {
      const neu = bereinige({ ...stand, ...teil });
      if (Object.keys(neu).every((k) => neu[k] === stand[k])) return stand;
      stand = neu;
      try {
        const abweichend = Object.fromEntries(Object.entries(stand).filter(([k, v]) => v !== BARRIEREFREI_STANDARD[k]));
        if (Object.keys(abweichend).length) speicher?.setItem(SCHLUESSEL, JSON.stringify(abweichend));
        else speicher?.removeItem?.(SCHLUESSEL);
      } catch { /* gesperrter Speicher: gilt dann nur für diesen Besuch */ }
      setzeAttribute();
      melde();
      return stand;
    },
    /** Liest den Speicher neu (anderer Tab hat umgestellt). */
    neuLesen() {
      const neu = lies();
      if (Object.keys(neu).every((k) => neu[k] === stand[k])) return;
      stand = neu;
      setzeAttribute();
      melde();
    },
    abonniere(fn) { hoerer.add(fn); return () => hoerer.delete(fn); },
    /** Für die Systemeinstellungen: Änderungen im Betriebssystem ebenfalls melden. */
    beobachteSystem() {
      const geaendert = () => { setzeAttribute(); melde(); };
      for (const q of ["(prefers-reduced-motion: reduce)", "(prefers-contrast: more)"]) {
        try { medien?.(q)?.addEventListener?.("change", geaendert); } catch { /* alte Browser: dann erst beim Neuladen */ }
      }
    },
    setzeAttribute,
    bewegungReduziert: () => stand.bewegung === "reduziert" || abfrage("(prefers-reduced-motion: reduce)"),
    mehrKontrast: () => stand.kontrast === "hoch" || abfrage("(prefers-contrast: more)"),
    farbhilfeAn: () => stand.farbhilfe,
    untertitelAn: () => stand.untertitel,
  };
  return api;
}

// ---------- Standard-Instanz für den Browser

function istOverlay() {
  try { return Boolean(window.obsstudio) || /overlay/i.test(window.location.pathname); } catch { return false; }
}

const imBrowser = typeof window !== "undefined" && typeof document !== "undefined";
const kern = createBarrierefrei(imBrowser ? {
  speicher: (() => { try { return window.localStorage; } catch { return null; } })(),
  medien: (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q) : null),
  wurzel: document.documentElement,
  overlay: istOverlay(),
} : {});

let angewendet = false;
/** Einmal beim Start (main.jsx): Attribute auf <html>, Abgleich zwischen Tabs, Systemänderungen beobachten. */
export function wendeBarrierefreiAn() {
  kern.setzeAttribute();
  if (angewendet || !imBrowser) return;
  angewendet = true;
  kern.beobachteSystem();
  window.addEventListener("storage", (e) => { if (e.key === SCHLUESSEL || e.key === null) kern.neuLesen(); });
}

export const getBarrierefrei = () => kern.lies();
export const setzeBarrierefrei = (teil) => kern.setze(teil);
/** fn(einstellungen) bei jeder Änderung (auch des Betriebssystems). Gibt die Abmeldung zurück. */
export const abonniereBarrierefrei = (fn) => kern.abonniere(fn);
export const bewegungReduziert = () => kern.bewegungReduziert();
export const mehrKontrast = () => kern.mehrKontrast();
export const farbhilfeAn = () => kern.farbhilfeAn();
export const untertitelAn = () => kern.untertitelAn();

// useSyncExternalStore braucht einen Schnappschuss, der sich nur bei echten Änderungen ändert
let schnappschuss = null;
let schnappschussSchluessel = "";
function holeSchnappschuss() {
  const e = kern.lies();
  const s = { ...e, bewegungReduziert: kern.bewegungReduziert(), mehrKontrast: kern.mehrKontrast() };
  const schluessel = JSON.stringify(s);
  if (schluessel !== schnappschussSchluessel) { schnappschuss = s; schnappschussSchluessel = schluessel; }
  return schnappschuss;
}
const serverSchnappschuss = { ...BARRIEREFREI_STANDARD, bewegungReduziert: false, mehrKontrast: false };

/**
 * Einstellungen für ein Bauteil, aktualisiert bei jeder Änderung.
 * @returns {{ bewegung: string, kontrast: string, farbhilfe: boolean, untertitel: boolean,
 *   bewegungReduziert: boolean, mehrKontrast: boolean, setze: (teil: object) => void }}
 */
export function useBarrierefrei() {
  const s = useSyncExternalStore(kern.abonniere, holeSchnappschuss, () => serverSchnappschuss);
  return { ...s, setze: setzeBarrierefrei };
}

// ---------- Untertitel für Geräusche

const geraeuschHoerer = new Set();
let naechsteId = 1;

/**
 * Zeigt ein Geräusch als Untertitel (components/UntertitelLeiste.jsx muss in der Hülle stehen). Tut nichts, solange
 * Untertitel aus sind — Spiele können es also bei jedem Geräusch aufrufen.
 * @param {string | { de: string, en?: string }} text   z. B. { de: "Schritte hinter dir", en: "Footsteps behind you" }
 * @param {object} [opts]
 * @param {"links"|"rechts"|"vorne"|"hinten"|null} [opts.richtung]  woher es kommt, falls das Spiel es weiß
 * @param {number} [opts.dauerMs]  Standard 3500
 * @param {string} [opts.schluessel]  gleiches Geräusch ersetzt den alten Eintrag statt sich zu stapeln
 * @returns {number|null} id des Untertitels oder null (Untertitel aus)
 */
export function meldeGeraeusch(text, { richtung = null, dauerMs = 3500, schluessel = null } = {}) {
  if (!kern.untertitelAn() || !text) return null;
  const eintrag = { id: naechsteId++, text, richtung, dauerMs: Math.max(800, Math.min(15000, Number(dauerMs) || 3500)), schluessel };
  geraeuschHoerer.forEach((fn) => { try { fn(eintrag); } catch { /* Anzeige darf das Spiel nie stören */ } });
  return eintrag.id;
}

/** Für die Anzeige: fn(eintrag) bei jedem gemeldeten Geräusch. Gibt die Abmeldung zurück. */
export function abonniereGeraeusche(fn) {
  geraeuschHoerer.add(fn);
  return () => geraeuschHoerer.delete(fn);
}
