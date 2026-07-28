// Supercells interne (numerische) Karten-IDs — nötig, um offizielle Deck-Import-Links zu bauen
// (https://link.clashroyale.com/deck/...?deck=<id1>;<id2>;...). Diese IDs ändern sich nie,
// sobald eine Karte im Spiel existiert.
//
// Quelle: direkt von der offiziellen Clash-Royale-API (GET https://api.clashroyale.com/v1/cards,
// Auth über CLASH_ROYALE_API_TOKEN — derselbe Token, den Backend/routes/crWinTrackerRoutes.js und
// nuzlockeRoutes.js schon verwenden). Stand: Juli 2026, vollständig — alle 122 Karten aus
// ALL_CARDS (cards.js) sind abgedeckt, per Namensabgleich 1:1 verifiziert.
//
// Falls hier künftig neue Karten in ALL_CARDS ergänzt werden, bevor diese Liste nachgezogen
// ist: buildDeckLink() unten erkennt fehlende IDs automatisch und liefert { ok: false }, statt
// einen falschen Link zu erzeugen. Auffrischen einfach per selbem API-Call (Karten-Name → id).
export const CARD_DECK_ID = {
  'knight': 26000000,
  'archers': 26000001,
  'goblins': 26000002,
  'giant': 26000003,
  'pekka': 26000004,
  'minions': 26000005,
  'balloon': 26000006,
  'witch': 26000007,
  'barbarians': 26000008,
  'golem': 26000009,
  'skeletons': 26000010,
  'valkyrie': 26000011,
  'skeleton-army': 26000012,
  'bomber': 26000013,
  'musketeer': 26000014,
  'baby-dragon': 26000015,
  'prince': 26000016,
  'wizard': 26000017,
  'mini-pekka': 26000018,
  'spear-goblins': 26000019,
  'giant-skeleton': 26000020,
  'hog-rider': 26000021,
  'minion-horde': 26000022,
  'ice-wizard': 26000023,
  'royal-giant': 26000024,
  'guards': 26000025,
  'princess': 26000026,
  'dark-prince': 26000027,
  'three-musketeers': 26000028,
  'lava-hound': 26000029,
  'ice-spirit': 26000030,
  'fire-spirit': 26000031,
  'miner': 26000032,
  'sparky': 26000033,
  'bowler': 26000034,
  'lumberjack': 26000035,
  'battle-ram': 26000036,
  'inferno-dragon': 26000037,
  'ice-golem': 26000038,
  'mega-minion': 26000039,
  'dart-goblin': 26000040,
  'goblin-gang': 26000041,
  'electro-wizard': 26000042,
  'elite-barbarians': 26000043,
  'hunter': 26000044,
  'executioner': 26000045,
  'bandit': 26000046,
  'royal-recruits': 26000047,
  'night-witch': 26000048,
  'bats': 26000049,
  'royal-ghost': 26000050,
  'ram-rider': 26000051,
  'zappies': 26000052,
  'rascals': 26000053,
  'cannon-cart': 26000054,
  'mega-knight': 26000055,
  'skeleton-barrel': 26000056,
  'flying-machine': 26000057,
  'wall-breakers': 26000058,
  'royal-hogs': 26000059,
  'goblin-giant': 26000060,
  'fisherman': 26000061,
  'magic-archer': 26000062,
  'electro-dragon': 26000063,
  'firecracker': 26000064,
  'mighty-miner': 26000065,
  'elixir-golem': 26000067,
  'battle-healer': 26000068,
  'skeleton-king': 26000069,
  'archer-queen': 26000072,
  'golden-knight': 26000074,
  'monk': 26000077,
  'skeleton-dragons': 26000080,
  'mother-witch': 26000083,
  'electro-spirit': 26000084,
  'electro-giant': 26000085,
  'phoenix': 26000087,
  'little-prince': 26000093,
  'goblin-demolisher': 26000095,
  'goblin-machine': 26000096,
  'suspicious-bush': 26000097,
  'goblinstein': 26000099,
  'rune-giant': 26000101,
  'berserker': 26000102,
  'boss-bandit': 26000103,
  'ronin': 26000106,
  'cannon': 27000000,
  'goblin-hut': 27000001,
  'mortar': 27000002,
  'inferno-tower': 27000003,
  'bomb-tower': 27000004,
  'barbarian-hut': 27000005,
  'tesla': 27000006,
  'elixir-collector': 27000007,
  'x-bow': 27000008,
  'tombstone': 27000009,
  'furnace': 27000010,
  'goblin-cage': 27000012,
  'goblin-drill': 27000013,
  'fireball': 28000000,
  'arrows': 28000001,
  'rage': 28000002,
  'rocket': 28000003,
  'goblin-barrel': 28000004,
  'freeze': 28000005,
  'mirror': 28000006,
  'lightning': 28000007,
  'zap': 28000008,
  'poison': 28000009,
  'graveyard': 28000010,
  'the-log': 28000011,
  'tornado': 28000012,
  'clone': 28000013,
  'earthquake': 28000014,
  'barbarian-barrel': 28000015,
  'heal-spirit': 28000016,
  'giant-snowball': 28000017,
  'royal-delivery': 28000018,
  'void': 28000023,
  'goblin-curse': 28000024,
  'spirit-empress': 28000025,
  'vines': 28000026,
};

// Baut den offiziellen Clash-Royale-Deck-Import-Link. Gibt { ok: false, missing } zurück statt
// eines falschen/unvollständigen Links, wenn für mindestens eine Karte im Deck keine ID bekannt
// ist — lieber gar kein QR-Code als einer, der beim Scannen ein falsches Deck importiert.
//
// Format-Hinweis: Ein simples "link.clashroyale.com/deck/en?deck=..." reicht NICHT — das öffnet
// die App zwar und zeigt eine Vorschau, aber "Speichern" bleibt ein Silent Fail. Das tatsächlich
// funktionierende Format (verifiziert an echten, live funktionierenden Deck-Links) bettet das
// clashroyale://copyDeck-Schema als Query-String ein, plus zwei Pflicht-Parameter: l= (Label,
// wird 1:1 von echten Links übernommen) und tt= (Standard-Tower-Troop, ohne die eigene Auswahl
// des Spielers — unsere Modi erfassen keine Tower-Troop, daher fixer Platzhalter-Wert).
const DECK_LINK_LABEL = 'Royals';
const DECK_LINK_TOWER_TROOP = 159000000;
// In Clash Royale liegen die Champion-Slots fest auf Deck-Position 2 und 3 (0-indexiert 1
// und 2) — nur wenn Champions dort stehen, erkennt der Import sie korrekt als Champions.
const CHAMPION_SLOT_INDICES = [1, 2];

// Sortiert Champions an die festen Champion-Slots (Position 2+3), alle anderen Karten
// behalten ihre relative Reihenfolge und füllen die restlichen Plätze auf. Betrifft nur die
// Kartenreihenfolge im Link — die Anzeige im Endscreen bleibt unangetastet.
function withChampionsInSlot(deck) {
  const champs = deck.filter(c => c.isChampion);
  if (!champs.length) return deck;
  const rest = deck.filter(c => !c.isChampion);
  const ordered = new Array(deck.length);
  let champI = 0;
  let restI = 0;
  for (let i = 0; i < deck.length; i++) {
    ordered[i] = CHAMPION_SLOT_INDICES.includes(i) && champI < champs.length
      ? champs[champI++]
      : rest[restI++];
  }
  return ordered;
}

export function buildDeckLink(deck) {
  const missing = [];
  const ids = [];
  for (const card of withChampionsInSlot(deck || [])) {
    const numId = CARD_DECK_ID[card.id];
    if (numId == null) missing.push(card.name);
    else ids.push(numId);
  }
  if (missing.length) return { ok: false, missing };
  const url = `https://link.clashroyale.com/en/?clashroyale://copyDeck?deck=${ids.join(';')}&l=${DECK_LINK_LABEL}&tt=${DECK_LINK_TOWER_TROOP}`;
  return { ok: true, url };
}
