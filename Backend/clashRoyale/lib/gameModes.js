// gameModes.js — Index der Spielmodi: interner Name aus der API (battle.gameMode.name, z. B. "Draft_Competitive") →
// Name im Spiel auf Englisch und Deutsch („Triple Draft“ / „Dreifach-Auswahlkampf“) und Symbol-Schlüssel des Spiels.
//
// Reihenfolge: EIGENE (Hand-Einträge) → gameModes.json (offizielle Namen aus den Spieldaten, `npm run cr:modes`, siehe
// tools/gameModesSpiegel.js) → lesbar gemachter Rohname. Noch genauer ist nur der Event-Titel aus GET /events
// („Grand Challenge“, „Spooky Chess League“) — den kennt allein der Kampf selbst über seinen eventTag (scout/scoutShape.js).
'use strict';

const DATA = require('./gameModes.json');

// Modi, die schon die Kampfgruppe benennt (Ranked, Trophäenstraße, Crown Series, gewöhnlicher Freundschafts-, Turnier-
// und 2v2-Kampf): kein eigener Name, sonst stünde dort „Ranked · Ranked“ oder „Freundschaft · Solokampf“.
const PLAIN = [/^Ranked1v1/i, /^Ladder$/i, /^Competitive_Multideck/i, /^Friendly$/i, /^Tournament$/i, /^TeamVsTeam(Ladder)?$/i];

// Hand-Einträge: Modi, die in den Spieldaten fehlen (neuer als Okt. 2023) oder dort nach einem einmaligen Event heißen.
// Ohne `de` gilt der englische Name auch auf Deutsch. Geprüft gegen die Modi von 70.000 gespeicherten Kämpfen (16.11.2026).
const EIGENE = [
  // Classic, Grand und 20 Win teilen sich diesen Modus — welche es war, verrät nur der Event-Titel
  [/^Challenge_AllCards_EventDeck/i, { en: 'Challenge', icon: 'challenge' }],
  // Spieldaten: „Mega Draft Challenge“ — derselbe Modus läuft aber auch als Freundschaftskampf und Event
  [/^PickMode|MegaDraft/i, { en: 'Mega Draft', de: 'Mega-Auswahl', icon: 'mega_draft' }],
  // Spieldaten: „Legendaray's Infinite Elixir“ (Name eines einzelnen Events)
  [/^7xElixir/i, { en: '7x Elixir', icon: '7x_elixir' }],
  // Spieldaten: Symbol des gewöhnlichen Drafts — das Spiel zeigt für Triple Draft ein eigenes
  [/^Draft_Competitive/i, { en: 'Triple Draft', de: 'Dreifach-Auswahlkampf', icon: 'triple_draft' }],
  // Spieldaten: nur der Rohname
  [/^CW_Battle_1v1$/i, { en: '1v1 Battle', de: 'Solokampf', icon: '1v1' }],
];

/** "202610_Event_Spooky_Chess" → "Spooky Chess", "SomeNewMode_Friendly" → "Some New Mode" */
function readable(name) {
  return String(name || '')
    .replace(/^\d{6}_/, '').replace(/^(Event|Challenge)_/i, '').replace(/_(Friendly|Ladder|Tournament)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const cache = new Map();

/**
 * Name und Symbol eines Modus. null für Modi, die schon die Kampfgruppe benennt (PLAIN), und für leere Namen.
 * @param {string} gameMode  battle.gameMode.name
 * @returns {{ en: string, de: string, icon: string } | null}  icon = Symbol-Schlüssel des Spiels ('' = keins)
 */
function modeInfo(gameMode) {
  const name = String(gameMode || '').trim();
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);
  let info = null;
  if (!PLAIN.some((re) => re.test(name))) {
    const own = EIGENE.find(([re]) => re.test(name));
    const hit = own ? own[1] : (Object.prototype.hasOwnProperty.call(DATA, name) ? DATA[name] : null);
    if (hit) info = { en: hit.en, de: hit.de || hit.en, icon: hit.icon || '' };
    else {
      const en = readable(name);
      if (en) info = { en, de: en, icon: '' };
    }
  }
  cache.set(name, info);
  return info;
}

module.exports = { modeInfo, readable };
