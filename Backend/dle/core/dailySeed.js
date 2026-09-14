// dailySeed.js — deterministisches Ziehen von Runden aus einem Datensatz-Pool.
//
// "Deterministisch" heißt hier: derselbe Seed-String liefert IMMER dieselbe Auswahl in
// derselben Reihenfolge, auf jeder Maschine, in jedem Node-Prozess. Damit sehen alle
// Spieler weltweit exakt dieselben 5 Tagesrunden, ohne dass der Server sich irgendetwas
// merken müsste — dieselbe Kombination aus Spiel-ID + Datum ergibt beim erneuten
// Anfragen (GET /rounds) UND beim Prüfen der Einsendung (POST /submit) wieder denselben
// Pool-Ausschnitt. Kein Zufalls-Modul (Math.random) verwenden, das ist bewusst NICHT
// reproduzierbar.
// FNV-1a: einfacher, schneller String-Hash — muss nicht kryptographisch sicher sein,
// nur gut genug streuen, damit aufeinanderfolgende Tage (2026-09-11 vs 2026-09-12)
// völlig unterschiedliche Startwerte ergeben.
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 — kleiner deterministischer PRNG (32-bit State, gute Streuung für unsere
// Zwecke). Referenz: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded Fisher-Yates: zieht `count` unterschiedliche Einträge aus `pool`, in einer vom
// Seed abhängigen, aber sonst gleichverteilten Reihenfolge.
function seededPick(pool, count, seedStr) {
  const rng = mulberry32(hashStringToSeed(seedStr));
  const arr = pool.slice();
  const n = Math.min(count, arr.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

// Kalendertag in der Zeitzone Europe/Berlin (nicht UTC, nicht Server-Ortszeit): Seite und
// Zielgruppe sind deutschsprachig, "um 0 Uhr zurücksetzen" meint also deutsche Mitternacht.
// Mit UTC lag der Wechsel vorher 1-2h (je nach Sommer-/Winterzeit) NACH der deutschen
// Mitternacht — wer kurz nach 0 Uhr spielte, bekam noch das Rätsel von gestern. Ein einziges
// "heute" für alle Spieler bleibt trotzdem gewahrt (kein Wechsel pro Spieler-Zeitzone), nur
// die Referenz-Zeitzone ist jetzt Berlin statt UTC. Intl.DateTimeFormat statt manueller
// Offset-Rechnung, damit die Sommerzeit-Umstellung automatisch mitläuft.
function todayDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

module.exports = { hashStringToSeed, mulberry32, seededPick, todayDateKey };
