// i18n/language.js — die eine Sprachwahl der Website und der Hook useLanguage().
//
// Woher die Sprache kommt, in dieser Reihenfolge:
//   1. ?lang=en in der Adresse — gilt für diesen Besuch, wird aber nicht gespeichert (ein geteilter Link soll die
//      Wahl des Empfängers nicht dauerhaft umstellen). Jede Sprachfassung hat so eine eigene Adresse für Suchmaschinen.
//   2. die zuletzt gewählte Sprache im Browser (siteLang; frühere Einzelspeicher aus LEGACY_KEYS werden übernommen)
//   3. Deutsch
// Bewusst KEINE Erkennung über die Browsersprache: der Google-Crawler meldet Englisch und sähe dann unter der deutschen
// Adresse den englischen Text.
//
// Alle Seiten, die useLanguage() nutzen, teilen denselben Stand: wer in der Win Challenge Englisch wählt, sieht jedes
// andere übersetzte Werkzeug ebenfalls auf Englisch.
//
// Für eine spätere Speicherung am Konto: nach dem Login setLanguage(gespeicherteSprache) aufrufen und mit
// subscribeLanguage() jede neue Wahl an den Server schicken. Mehr braucht dieser Kern dafür nicht.

import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { BASE_LANG, normalizeLang, pickLang } from "./core.js";

const STORAGE_KEY = "siteLang";
/** Frühere Speicher einzelner Bereiche. Ihre Wahl wird beim ersten Laden übernommen, falls siteLang noch fehlt. */
const LEGACY_KEYS = ["wcLang", "site_lang"]; // site_lang: Umschalter der Profilseite bis 16.11.2026

function readUrlLang() {
  try {
    return normalizeLang(new URLSearchParams(window.location.search).get("lang"));
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    const own = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if (own) return own;
    for (const key of LEGACY_KEYS) {
      const old = normalizeLang(localStorage.getItem(key));
      if (old) {
        localStorage.setItem(STORAGE_KEY, old);
        return old;
      }
    }
  } catch { /* gesperrter Speicher (privater Modus): dann eben ohne gemerkte Wahl */ }
  return null;
}

/**
 * Schreibt die Sprache in die Adresse (Deutsch = ohne ?lang). replaceState statt eines neuen Verlaufseintrags: der
 * Zurück-Knopf soll nicht zwischen Sprachständen springen.
 * @param {boolean} onlyIfPresent  nur eine schon vorhandene ?lang-Angabe anpassen, keine neue anhängen
 */
function writeUrlLang(lang, onlyIfPresent) {
  try {
    const url = new URL(window.location.href);
    if (onlyIfPresent && !url.searchParams.has("lang")) return;
    if (lang === BASE_LANG) url.searchParams.delete("lang");
    else url.searchParams.set("lang", lang);
    const next = url.pathname + url.search + url.hash;
    const now = window.location.pathname + window.location.search + window.location.hash;
    if (next !== now) window.history.replaceState(window.history.state, "", next);
  } catch { /* die Adresse umzuschreiben ist Komfort, kein Muss */ }
}

function initialState() {
  if (typeof window === "undefined") return { lang: BASE_LANG, source: "default" };
  const fromUrl = readUrlLang();
  if (fromUrl) return { lang: fromUrl, source: "url" };
  const stored = readStoredLang();
  if (stored) return { lang: stored, source: "storage" };
  return { lang: BASE_LANG, source: "default" };
}

/** source: "url" | "storage" | "user" (in diesem Besuch umgestellt) | "default" */
let state = initialState();
let pendingEmit = false;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(state.lang));
}

/** Die gewählte Sprache der Website (kann eine sein, die der aktuelle Bereich nicht kennt — dafür pickLang). */
export function getLanguage() {
  return state.lang;
}

/**
 * Stellt die Sprache für die ganze Website um und merkt sie im Browser. Eine ?lang-Angabe in der Adresse wird
 * nachgezogen, damit Adresse und Anzeige nie widersprechen.
 * @returns {boolean} false bei einer unbekannten Sprache
 */
export function setLanguage(next) {
  const lang = normalizeLang(next);
  if (!lang) return false;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* dann nur für diesen Besuch */ }
  writeUrlLang(lang, true);
  const changed = lang !== state.lang;
  state = { lang, source: "user" };
  if (changed) emit();
  return true;
}

/**
 * Woher die aktuelle Sprache stammt: "url" (?lang= dieses Besuchs), "storage" (gemerkt), "user" (in diesem Besuch
 * umgestellt) oder "default". Für die Speicherung am Konto (utils/konto.js): nur "user" wird ans Konto geschickt,
 * eine ?lang-Adresse überstimmt das Konto nur für den Besuch.
 */
export function getLanguageSource() {
  return state.source;
}

/** Ruft fn(lang) bei jeder Änderung der Sprache auf. Gibt die Abmeldung zurück. */
export function subscribeLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = () => state.lang;
const getServerSnapshot = () => BASE_LANG;

/**
 * Sprache für ein Bauteil.
 * @param {object} [opts]
 * @param {string[]} [opts.supported]  Sprachen, die der Bereich kann (z. B. texts.langs aus defineMessages); fehlt die
 *                                     gewählte, entscheidet pickLang()
 * @param {boolean} [opts.syncUrl]     die Sprache immer in der Adresse führen (?lang=en). Für Seiten mit eigener
 *                                     englischer Fassung bei Suchmaschinen; ein Lesezeichen ohne ?lang landet dann
 *                                     trotzdem in der gemerkten Sprache und bekommt die Angabe nachgetragen.
 * @returns {{ lang: string, setLang: (next: string) => void, explicit: boolean }}
 *   explicit  true, wenn die Sprache beim Öffnen gewählt war (Adresse, Browser-Speicher oder vorher in diesem Besuch)
 *             und nicht nur die Grundeinstellung ist — dann darf sie gespeicherte Einstellungen eines Werkzeugs
 *             überstimmen
 */
export function useLanguage({ supported, syncUrl = false } = {}) {
  // Eine ?lang-Angabe gilt auch, wenn diese Datei schon früher geladen war und erst jetzt eine Seite mit ?lang
  // geöffnet wird. Der Stand wird hier, vor dem ersten Lesen, nachgezogen, damit schon das erste Bild stimmt; die
  // übrigen Leser erfahren es gleich danach.
  const [explicit] = useState(() => {
    const fromUrl = typeof window === "undefined" ? null : readUrlLang();
    if (fromUrl && fromUrl !== state.lang) {
      state = { lang: fromUrl, source: "url" };
      pendingEmit = true;
    }
    return state.source !== "default";
  });
  const chosen = useSyncExternalStore(subscribeLanguage, getSnapshot, getServerSnapshot);
  const lang = pickLang(chosen, supported);

  useLayoutEffect(() => {
    if (pendingEmit) {
      pendingEmit = false;
      emit();
    }
  }, []);

  useLayoutEffect(() => {
    if (syncUrl) writeUrlLang(lang, false);
  }, [syncUrl, lang]);

  const supportedKey = Array.isArray(supported) ? supported.join(",") : "";
  const setLang = useCallback((next) => {
    if (supportedKey && !supportedKey.split(",").includes(next)) return;
    setLanguage(next);
  }, [supportedKey]);

  return { lang, setLang, explicit };
}
