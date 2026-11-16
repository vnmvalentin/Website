// Sprachwahl der Clash-Royale-Minigames und Turniere (DE, EN, ES).
//
// Seit Nov. 2026 die eine Sprachwahl der Website (i18n/language.js): ?lang=en bzw. ?lang=es in der Adresse gilt für
// den Besuch, sonst die zuletzt gewählte (siteLang), sonst Deutsch. Die Sprache steht immer in der Adresse (syncUrl),
// damit jede Sprachfassung direkt verlinkbar und für Suchmaschinen als eigene Seite adressierbar ist; umgeschrieben
// wird per replaceState, der Zurück-Button springt also nicht zwischen Sprachständen hin und her.
// Wer hier Spanisch wählt und danach eine Seite ohne Spanisch öffnet, bekommt dort Englisch (pickLang im Kern).

import { useLanguage as useSiteLanguage } from '../../i18n/language';
import { dictFor } from './i18n';

const SUPPORTED_LANGS = ['de', 'en', 'es'];

export function useLanguage() {
  const { lang, setLang } = useSiteLanguage({ supported: SUPPORTED_LANGS, syncUrl: true });
  return { lang, t: dictFor(lang), changeLang: setLang };
}
