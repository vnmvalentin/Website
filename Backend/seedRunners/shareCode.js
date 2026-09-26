// Seed Runners — Share-Codes veröffentlichter Level: "SR-7K2-QX9".
//
// Sechs Zeichen aus einem Alphabet ohne Verwechslungen (kein 0/O, 1/I/L): rund eine Milliarde Codes, kurz genug zum
// Abtippen und Diktieren. Ein Code sagt nichts über das Level aus und lässt sich nicht erraten (zufällig, nicht
// fortlaufend). Eingaben werden großzügig gelesen: Klein-/Großschreibung, Leerzeichen, fehlendes "SR-" und fehlende Striche.
'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 31 Zeichen: ohne I, L, O, 0, 1
const CODE_RE = /^SR-[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/;

/** Ein neuer zufälliger Code. `randomInt` ist ersetzbar (Tests). */
function generateCode(randomInt = (n) => crypto.randomInt(n)) {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `SR-${s.slice(0, 3)}-${s.slice(3)}`;
}

/** Ist das ein Code in Normalform? */
const isCode = (s) => typeof s === 'string' && CODE_RE.test(s);

/**
 * Liest eine Eingabe als Code: "sr 7k2 qx9", "7K2QX9", "SR-7K2-QX9" → "SR-7K2-QX9". null, wenn es keiner sein kann.
 */
function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('SR') && s.length === 8) s = s.slice(2);
  if (s.length !== 6) return null;
  const code = `SR-${s.slice(0, 3)}-${s.slice(3)}`;
  return isCode(code) ? code : null;
}

module.exports = { generateCode, isCode, normalizeCode, ALPHABET };
