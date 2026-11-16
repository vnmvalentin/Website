// i18n/LanguageSwitch.jsx — Sprachumschalter mit Flaggen, wie er in der Mitte der Tool-Leiste steht.
// Ohne eigenen Stand: Sprache und Wechsel kommen vom Aufrufer (meist aus useLanguage()).
import React from "react";
import { FlagDE, FlagES, FlagGB } from "../components/Flags";

const FLAGS = { de: FlagDE, en: FlagGB, es: FlagES };

/**
 * @param {object} props
 * @param {string} props.lang                 aktuelle Sprache
 * @param {string[]} props.langs              angebotene Sprachen
 * @param {(lang: string) => void} props.onChange
 * @param {string} [props.label]              Name der Gruppe für Screenreader, in der aktuellen Sprache
 */
export default function LanguageSwitch({ lang, langs, onChange, label = "Sprache / Language" }) {
  return (
    <div className="flex bg-white/[0.06] rounded-md p-0.5" role="group" aria-label={label}>
      {langs.map((l) => {
        const Flag = FLAGS[l];
        return (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            aria-pressed={lang === l}
            className={`flex items-center gap-2 px-2 sm:px-2.5 h-8 rounded-[5px] text-xs font-bold uppercase transition-colors ${
              lang === l ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
            }`}
          >
            {Flag && <Flag size={18} />}
            <span className={Flag ? "hidden sm:inline" : ""}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}
