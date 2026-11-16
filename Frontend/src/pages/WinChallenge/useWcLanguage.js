// Sprachwahl der Win-Challenge-Seiten — seit 15.11.2026 die gemeinsame Sprachwahl der Website (i18n/language.js).
//
// Die Sprache steht immer in der Adresse (?lang=en), damit die englische Fassung eine eigene, verlinkbare Adresse für
// Suchmaschinen hat. Ein Streamer, der den Editor über sein Lesezeichen ohne ?lang öffnet, landet trotzdem in seiner
// zuletzt gewählten Sprache (die frühere eigene Speicherung „wcLang“ wird dabei übernommen).

import { useLanguage } from "../../i18n/language";
import { WC_LANGS, dictForWc } from "./wcI18n";

/**
 * @returns {{ lang: "de"|"en", t: object, changeLang: (next: string) => void, explicit: boolean }}
 *   explicit  true, wenn die Sprache beim Öffnen gewählt war (Adresse, Browser-Speicher oder vorher in diesem Besuch)
 *             — dann hat sie Vorrang vor der im Overlay gespeicherten Sprache
 */
export function useWcLanguage() {
  const { lang, setLang, explicit } = useLanguage({ supported: WC_LANGS, syncUrl: true });
  return { lang, t: dictForWc(lang), changeLang: setLang, explicit };
}
