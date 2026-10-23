// Sprachwahl der Win-Challenge-Seiten.
//
// Wie bei den Clash-Royale-Seiten steht die Sprache in der URL (?lang=en), damit die englische
// Fassung eine eigene, verlinkbare Adresse für Suchmaschinen hat. Zusätzlich merkt sich der
// Browser die Wahl — ein Streamer öffnet den Editor über sein Lesezeichen ohne ?lang und soll
// trotzdem in seiner Sprache landen.
//
// Bewusst KEINE Erkennung über die Browsersprache: der Google-Crawler meldet Englisch und sähe
// dann unter der deutschen Adresse den englischen Text.

import { useCallback, useEffect, useState } from "react";
import { WC_LANGS, dictForWc } from "./wcI18n";

const STORAGE_KEY = "wcLang";

function readParam() {
  try {
    const raw = new URLSearchParams(window.location.search).get("lang");
    return WC_LANGS.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return WC_LANGS.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeUrl(lang) {
  try {
    const url = new URL(window.location.href);
    if (lang === "de") url.searchParams.delete("lang");
    else url.searchParams.set("lang", lang);
    // replaceState: der Zurück-Button soll nicht zwischen Sprachständen hin- und herspringen
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  } catch { /* URL-Umschreiben ist Komfort, kein Muss */ }
}

/**
 * @returns {{ lang: "de"|"en", t: object, changeLang: (next: string) => void, explicit: boolean }}
 *   explicit  true, wenn die Sprache beim Öffnen aus der URL oder aus dem Browser-Speicher kam —
 *             dann hat sie Vorrang vor der im Overlay gespeicherten Sprache
 */
export function useWcLanguage() {
  const [initial] = useState(() => {
    const fromUrl = readParam();
    const stored = fromUrl ? null : readStored();
    return { lang: fromUrl || stored || "de", explicit: !!(fromUrl || stored), fromStorage: !!stored };
  });
  const [lang, setLang] = useState(initial.lang);

  // Gemerkte Sprache ohne ?lang in der Adresse: die URL nachziehen, damit beides übereinstimmt.
  useEffect(() => {
    if (initial.fromStorage) writeUrl(initial.lang);
  }, [initial]);

  const changeLang = useCallback((next) => {
    if (!WC_LANGS.includes(next)) return;
    setLang(next);
    writeUrl(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* privater Modus: dann eben nur für diese Sitzung */ }
  }, []);

  return { lang, t: dictForWc(lang), changeLang, explicit: initial.explicit };
}
