// Sprachwahl der Clash-Royale-Seiten.
//
// Die Sprache steht in der URL (?lang=en), damit eine englische Fassung direkt
// verlinkbar und für Suchmaschinen als eigene Seite adressierbar ist. Der Wechsel
// schreibt die URL per replaceState um, ohne einen Navigationseintrag zu erzeugen —
// der Zurück-Button soll nicht zwischen Sprachständen hin- und herspringen.

import { useCallback, useState } from 'react';
import { dictFor } from './i18n';

const readLangFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
};

export function useLanguage() {
  const [lang, setLang] = useState(readLangFromUrl);

  const changeLang = useCallback((next) => {
    if (next !== 'de' && next !== 'en') return;
    setLang(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'en') url.searchParams.set('lang', 'en');
      else url.searchParams.delete('lang');
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch { /* URL-Umschreiben ist Komfort, kein Muss */ }
  }, []);

  return { lang, t: dictFor(lang), changeLang };
}
