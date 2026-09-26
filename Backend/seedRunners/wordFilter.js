// Seed Runners — Wortfilter für Levelnamen, Beschreibungen und Tags. Bewusst eine EIGENE, kurze Liste (keine Bibliothek):
// Sie hält Hassrede, schwere Beleidigungen, Sexuelles und Werbelinks aus dem öffentlichen Browser fern. Alles Übrige regelt
// die Meldefunktion und die Moderation — ein Filter, der zu viel blockiert, ärgert ehrliche Ersteller mehr, als er nützt.
//
// Gelesen wird großzügig: Groß-/Kleinschreibung, Umlaute und Akzente (ü → u, ß → ss), Zahlen und Zeichen als Buchstaben
// ("n1gg3r", "h1tl3r") und Leerzeichen oder Zeichen zwischen den Buchstaben ("n i g g e r").
//
// Zwei Arten von Einträgen:
//   SUBSTRINGS  eindeutige Ausdrücke, die in keinem harmlosen Wort vorkommen — sie zählen auch mitten in einem Wort
//   WORDS       Wörter, die nur GANZ zählen (sonst träfe der Filter "Scunthorpe" oder "Assassin")
'use strict';

const SUBSTRINGS = [
  'nigger', 'nigga', 'faggot', 'kanake', 'hurensohn', 'wichser', 'fotze', 'schwuchtel', 'vergewalt',
  'siegheil', 'heilhitler', 'kinderporn', 'kindersex', 'judensau',
];
const WORDS = new Set([
  'nazi', 'nazis', 'hitler', 'kkk', 'porn', 'porno', 'hentai', 'fick', 'ficken', 'fickt', 'ficker', 'arschloch',
  'neger', 'schlampe', 'nutte', 'hure', 'cunt', 'fag', 'fags', 'retard', 'retarded', 'spast', 'spasti', 'mongo', 'kys',
]);

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '€': 'e', '+': 't' };

/** Text in die Form bringen, in der gesucht wird: klein, ohne Akzente, Zeichen als Buchstaben */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0134578@$!€+]/g, (c) => LEET[c]);
}

/** Der erste unzulässige Ausdruck im Text oder null */
function findBlocked(text) {
  const s = normalize(text);
  const squashed = s.replace(/[^a-z]/g, '');
  for (const w of SUBSTRINGS) if (squashed.includes(w)) return w;
  for (const token of s.split(/[^a-z]+/)) if (token && WORDS.has(token)) return token;
  // Buchstaben mit Leerzeichen dazwischen ("n i g g e r" wurde oben schon über `squashed` gefunden); einzelne Wörter, die nur
  // mit Trennzeichen getrennt geschrieben wurden ("f.i.c.k"), fängt diese Zeile:
  const letters = s.replace(/[^a-z]+/g, ' ').trim();
  if (/^(?:[a-z] )+[a-z]$/.test(letters) && WORDS.has(letters.replace(/ /g, ''))) return letters.replace(/ /g, '');
  return null;
}

const LINK_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|de|net|org|gg|tv|io|ly|me|xyz)\b/i;

/**
 * Prüft die Textangaben eines Levels. @returns {string[]}  Fehlermeldungen (leer = in Ordnung)
 */
function checkLevelTexts({ name = '', description = '', tags = [] }) {
  const errors = [];
  const fields = [['Der Levelname', name], ['Die Beschreibung', description], ['Die Tags', tags.join(' ')]];
  for (const [label, text] of fields) {
    if (!text) continue;
    if (findBlocked(text)) errors.push(`${label} enthält Wörter, die hier nicht erlaubt sind.`);
    else if (LINK_RE.test(text)) errors.push(`${label} darf keine Links enthalten.`);
  }
  return errors;
}

module.exports = { findBlocked, checkLevelTexts, normalize };
