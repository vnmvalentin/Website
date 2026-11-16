// i18n/core.js — der gemeinsame Kern aller Übersetzungen, ohne Browser und ohne React (läuft auch in node --test).
//
// So entsteht ein neuer zweisprachiger Bereich:
//   1. Eine Textdatei mit je einem Objekt pro Sprache, Deutsch vollständig:
//        const texts = defineMessages({ de: { title: "Titel", count: (n) => `${n} Einträge` }, en: { … } });
//      Werte sind Text, eine Funktion (Werte → Text) für eingesetzte Zahlen und Namen, eine Liste oder ein
//      verschachteltes Objekt. Fehlt in einer Sprache ein Schlüssel, steht dort der deutsche Text statt `undefined`.
//   2. Im Bauteil: const { lang } = useLanguage({ supported: texts.langs }); const t = texts.dict(lang);
//      (useLanguage steht in ./language.js, den Umschalter gibt es als ./LanguageSwitch.jsx)
//   3. Ein Test prüft mit missingKeys(), dass die zweite Sprache vollständig ist.
//
// Die Sprachwahl selbst gilt für die ganze Website (siehe ./language.js). Jeder Bereich sagt nur, welche Sprachen er
// kann; wer eine Sprache gewählt hat, die ein Bereich nicht kennt, bekommt dort pickLang().

/** Sprachen, die irgendein Bereich der Website kann. Die Reihenfolge bestimmt die Reihenfolge im Umschalter. */
export const KNOWN_LANGS = ["de", "en", "es"];
/** Grundsprache: in ihr ist jedes Wörterbuch vollständig, auf sie fällt alles zurück. */
export const BASE_LANG = "de";

/** Eine bekannte Sprache oder null (Eingaben aus Adresse und Speicher sind nicht vertrauenswürdig). */
export function normalizeLang(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return KNOWN_LANGS.includes(code) ? code : null;
}

/**
 * Die Sprache, in der ein Bereich erscheint, der nur `supported` kann.
 * Wer etwas anderes als Deutsch gewählt hat, versteht eher Englisch als Deutsch — deshalb Englisch vor der Grundsprache.
 */
export function pickLang(preferred, supported) {
  const list = Array.isArray(supported) && supported.length ? supported : [BASE_LANG];
  if (list.includes(preferred)) return preferred;
  if (preferred && preferred !== BASE_LANG && list.includes("en")) return "en";
  if (list.includes(BASE_LANG)) return BASE_LANG;
  return list[0];
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Legt `over` über `base`: verschachtelte Objekte werden gemischt, alles andere (Text, Funktion, Liste) ersetzt. */
function overlay(base, over) {
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? overlay(base[key], value) : value;
  }
  return out;
}

/**
 * Die Wörterbücher eines Bereichs.
 * @param {Record<string, object>} dicts  je Sprache ein Objekt; die Grundsprache muss dabei sein
 * @returns {{ langs: string[], dict: (lang: string) => object }}
 *   langs  die Sprachen des Bereichs, in der Reihenfolge von KNOWN_LANGS
 *   dict   das Wörterbuch einer Sprache, Lücken mit der Grundsprache gefüllt; unbekannte Sprache → Grundsprache.
 *          Für jede Sprache immer dasselbe Objekt (taugt als Abhängigkeit in useMemo/useEffect).
 */
export function defineMessages(dicts) {
  if (!isPlainObject(dicts) || !isPlainObject(dicts[BASE_LANG])) {
    throw new Error(`defineMessages: das Wörterbuch für "${BASE_LANG}" fehlt`);
  }
  const unknown = Object.keys(dicts).filter((l) => !KNOWN_LANGS.includes(l));
  if (unknown.length) throw new Error(`defineMessages: unbekannte Sprache ${unknown.join(", ")}`);

  const base = dicts[BASE_LANG];
  const merged = {};
  for (const lang of Object.keys(dicts)) merged[lang] = lang === BASE_LANG ? base : overlay(base, dicts[lang]);
  const langs = KNOWN_LANGS.filter((l) => l in merged);

  return {
    langs,
    dict: (lang) => merged[lang] || base,
  };
}

/**
 * Schlüssel, die in `other` fehlen oder eine andere Art haben als in `base` (Text statt Funktion, Liste statt
 * Objekt …). Für Tests: `assert.deepEqual(missingKeys(de, en), [])`. Listen werden nur auf gleiche Länge geprüft.
 * @returns {string[]} Pfade wie "styles.list" oder "steps (Länge 3 statt 2)"
 */
export function missingKeys(base, other, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(base)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in (other || {}))) { out.push(path); continue; }
    const theirs = other[key];
    if (isPlainObject(value)) {
      if (!isPlainObject(theirs)) out.push(`${path} (Objekt erwartet)`);
      else out.push(...missingKeys(value, theirs, path));
    } else if (Array.isArray(value)) {
      if (!Array.isArray(theirs)) out.push(`${path} (Liste erwartet)`);
      else if (theirs.length !== value.length) out.push(`${path} (Länge ${theirs.length} statt ${value.length})`);
    } else if (typeof value !== typeof theirs) {
      out.push(`${path} (${typeof value} erwartet, ${typeof theirs} gefunden)`);
    }
  }
  return out;
}

/**
 * Setzt Werte in einen Text mit Platzhaltern: fmt("{n} Siege", { n: 3 }) → "3 Siege".
 * Unbekannte Platzhalter bleiben stehen, damit ein Tippfehler im Wörterbuch auffällt statt still zu verschwinden.
 */
export function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null ? String(vars[name]) : whole
  ));
}
