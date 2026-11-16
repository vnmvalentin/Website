#!/usr/bin/env node
// clashRoyale/tools/kartenSpiegel.js
// Spiegelt die Kartendaten, die die Viewer Games am Server brauchen (Werte schätzen, Chat-Wordle), ins Backend.
//
//   Quelle    Frontend/src/pages/ClashRoyale/data/cardStats.json      Kampfwerte (Turnierniveau), Erscheinungsjahr
//             Frontend/src/pages/ClashRoyale/data/bingoAttributes.js  Art der Karte (Truppe/Zauber/Gebäude)
//             Frontend/src/pages/ClashRoyale/data/cardElixir.js       Elixier
//             Frontend/src/pages/ClashRoyale/scout/deckBuilder.js     Rollen: Siegbedingung, Panzer (Deck-Typen der Matchups)
//   Spiegel   Backend/clashRoyale/core/cardFacts.json                 { [id]: { type, elixir, released, hp, damage, dps, of, win?: Rang, tank? } }
//
// Frontend und Backend werden getrennt ausgeliefert (deploy.sh) — die Frontend-Dateien sind die einzige Quelle, das
// Backend bekommt sie erzeugt, nie von Hand gepflegt. Neue Kartenwerte: im Frontend `npm run cr:card-stats`
// (Backend), danach `npm run spiegel -- clash`.
//
//   node clashRoyale/tools/kartenSpiegel.js             schreibt den Spiegel
//   node clashRoyale/tools/kartenSpiegel.js --pruefen   meldet nur, Rückgabewert 1 bei Abweichung

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WURZEL = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(WURZEL, 'Frontend', 'src', 'pages', 'ClashRoyale', 'data');
const SPIEGEL = path.join(WURZEL, 'Backend', 'clashRoyale', 'core', 'cardFacts.json');
const STATS = ['hp', 'damage', 'dps'];
const TYPES = { type_troop: 'troop', type_spell: 'spell', type_building: 'building' };

async function sollInhalt() {
  const stats = JSON.parse(fs.readFileSync(path.join(DATA, 'cardStats.json'), 'utf8')).cards || {};
  const { CARD_ATTRS } = await import(pathToFileURL(path.join(DATA, 'bingoAttributes.js')).href);
  const { ELIXIR_COST } = await import(pathToFileURL(path.join(DATA, 'cardElixir.js')).href);
  const { WIN_CONDITIONS, TANKS } = await import(pathToFileURL(path.join(DATA, '..', 'scout', 'deckBuilder.js')).href);
  const out = {};
  for (const id of Object.keys(ELIXIR_COST).sort()) {
    const s = stats[id] || {};
    const typeAttr = (CARD_ATTRS[id] || []).find((a) => TYPES[a]);
    // Fehlt die Karte in den Bingo-Eigenschaften (neue Karten), verraten die Kampfwerte die Art
    const fromStats = typeof s.speed === 'number' ? 'troop' : typeof s.lifetime === 'number' ? 'building' : typeof s.radius === 'number' && typeof s.hp !== 'number' ? 'spell' : null;
    const entry = { type: typeAttr ? TYPES[typeAttr] : fromStats, elixir: ELIXIR_COST[id], released: Number.isFinite(s.released) ? s.released : null };
    for (const k of STATS) if (typeof s[k] === 'number') entry[k] = s[k];
    // Wozu ein Wert gehört (z. B. „Schaden gegen Truppen“) — nur für die gespiegelten Werte
    const of = Object.fromEntries(Object.entries(s.of || {}).filter(([k]) => STATS.includes(k)));
    if (Object.keys(of).length) entry.of = of;
    // Rollen aus dem Deck-Baukasten: bestimmen den Deck-Typ in den Matchups (scout/scoutMatchups.js). win = Platz in der
    // Liste (1 = zuerst genannt) — entscheidet bei zwei gleich teuren Siegbedingungen, welche den Typ benennt
    if (WIN_CONDITIONS.has(id)) entry.win = [...WIN_CONDITIONS].indexOf(id) + 1;
    if (TANKS.has(id)) entry.tank = true;
    out[id] = entry;
  }
  return `${JSON.stringify({ quelle: 'Frontend/src/pages/ClashRoyale/data (kartenSpiegel.js)', karten: out }, null, 1)}\n`;
}

(async () => {
  const soll = await sollInhalt();
  const ist = fs.existsSync(SPIEGEL) ? fs.readFileSync(SPIEGEL, 'utf8').replace(/\r\n/g, '\n') : null;
  if (process.argv.includes('--pruefen')) {
    if (ist === soll) { console.log('Kartendaten (clash): Spiegel aktuell.'); return; }
    console.error('Kartendaten (clash): Spiegel veraltet — npm run spiegel -- clash');
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(SPIEGEL, soll);
  console.log(`Kartendaten (clash): ${Object.keys(JSON.parse(soll).karten).length} Karten nach ${path.relative(WURZEL, SPIEGEL)} geschrieben.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
