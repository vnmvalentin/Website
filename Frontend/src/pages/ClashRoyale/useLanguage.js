// Sprachwahl der Clash-Royale-Seiten.
//
// Die Sprache steht in der URL (?lang=en, ?lang=es), damit jede Sprachfassung direkt
// verlinkbar und für Suchmaschinen als eigene Seite adressierbar ist. Der Wechsel
// schreibt die URL per replaceState um, ohne einen Navigationseintrag zu erzeugen —
// der Zurück-Button soll nicht zwischen Sprachständen hin- und herspringen.

import { useCallback, useState } from 'react';
import { dictFor } from './i18n';

const SUPPORTED_LANGS = ['de', 'en', 'es'];

const readLangFromUrl = () => {
  try {
    const raw = new URLSearchParams(window.location.search).get('lang');
    return SUPPORTED_LANGS.includes(raw) ? raw : 'de';
  } catch {
    return 'de';
  }
};

export function useLanguage() {
  const [lang, setLang] = useState(readLangFromUrl);

  const changeLang = useCallback((next) => {
    if (!SUPPORTED_LANGS.includes(next)) return;
    setLang(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'de') url.searchParams.delete('lang');
      else url.searchParams.set('lang', next);
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch { /* URL-Umschreiben ist Komfort, kein Muss */ }
  }, []);

  return { lang, t: dictFor(lang), changeLang };
}
