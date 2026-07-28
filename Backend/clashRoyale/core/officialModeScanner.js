// officialModeScanner.js — erkennt die Kartenpools offizieller Clash-Royale-Spezialmodi.
//
// WARUM SO KOMPLIZIERT?
// Die offizielle Clash-Royale-API hat keinen Endpoint, der die in einem Spezialmodus
// erlaubten Karten verrät. /challenges antwortet mit 404, /tournaments kennt nur
// Spieler-Turniere und /cards liefert immer den kompletten Kartensatz. Was die API aber
// liefert, ist der Battlelog jedes Spielers — inklusive gameMode.name und aller acht Karten
// beider Seiten. Aus vielen Battlelogs lässt sich der Pool eines Modus rekonstruieren:
//
//   1. /leaderboards nennt die gerade laufenden Event-Modi mit Namen
//      ("Mega Draft Challenge", "Retro Royale", "Goblin Queen's Journey", …)
//   2. /leaderboard/{id} liefert die Spieler, die dieses Event gerade spielen
//   3. deren /players/{tag}/battlelog liefert gameMode + tatsächlich gespielte Karten
//   4. Die Vereinigung aller in einem Modus gesehenen Karten sättigt sich beim echten Pool
//
// Messung aus der Praxis (108 gecrawlte Spiele): "Crazy_Arena" blieb bei 57 verschiedenen
// Karten stehen (ab ~85 Spielen kam keine neue mehr dazu), während Ladder/Ranked im
// gleichen Lauf bei 116–118 von 122 Karten landeten. Ein eingeschränkter Pool ist also
// klar erkennbar. Deshalb gilt ein Modus als Spezialmodus, wenn er nach genügend
// beobachteten Spielen deutlich unter dem vollen Kartensatz bleibt.
//
// Die gesammelten Karten wachsen über mehrere Scans hinweg an (siehe crPresetStore).

const presetStore = require('../../lib/crPresetStore');
const { ALL_CARDS } = require('./cards');

const CR_API_TOKEN = process.env.CLASH_ROYALE_API_TOKEN || '';
const CR_API_BASE = process.env.CLASH_ROYALE_API_BASE || 'https://api.clashroyale.com/v1';

// Wie oft gescannt wird und wie groß ein Lauf maximal ist (Rate-Limit-Schutz)
const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;   // alle 6 Stunden
const FIRST_SCAN_DELAY_MS = 60 * 1000;         // nicht direkt beim Serverstart
const MAX_BATTLELOGS_PER_SCAN = 60;
const REQUEST_SPACING_MS = 120;

// Erkennungsschwellen
const MIN_GAMES_FOR_MODE = 8;                  // darunter ist die Stichprobe zu klein
const RESTRICTED_POOL_RATIO = 0.75;            // < 75% des Kartensatzes = eingeschränkter Pool
const MIN_CARDS_TO_PUBLISH = 12;               // darunter lohnt sich das Preset nicht
const MIN_GAMES_TO_PUBLISH = 25;               // erst mit genug Spielen ist der Pool gesättigt
// Der Pool besteht aus den Karten, die in den letzten 14 Tagen in diesem Modus gespielt
// wurden. Supercell tauscht Karten mitten im Event aus (der Chaos-Modus lief in mehreren
// Phasen) — dieses gleitende Fenster lässt Karten einer alten Phase wieder herausfallen,
// statt am Ende die Vereinigung aller Phasen zu liefern. Details in crPresetStore.upsertAutoPreset().
const POOL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Modi mit vollem Kartensatz bzw. Regelvarianten ohne Karteneinschränkung. Die Ratio-Regel
// filtert sie ohnehin fast immer heraus; diese Liste sparte uns aber die Battlelog-Auswertung
// und verhindert Ausrutscher bei kleinen Stichproben.
const IGNORED_MODE_PREFIXES = [
  'Ladder', 'Ranked1v1', 'CW_', 'ClanWar_', 'TeamVsTeam', 'Friendly', 'PickMode',
  'TripleElixir', 'DoubleElixir', 'RampUpElixir', '7xElixir', 'Showdown', 'MirrorDeck',
  'Tournament', 'Casual', 'Practice',
];
// Draft-/Pick-Formate teilen zufällige Karten aus dem KOMPLETTEN Satz aus. Bei kleiner
// Stichprobe sehen sie deshalb wie ein eingeschränkter Pool aus ("Touchdown_Draft" landete
// im Test mit 8 Spielen bei 70 Karten und wäre fälschlich als Spezialmodus durchgegangen).
const IGNORED_MODE_SUBSTRINGS = ['draft', 'touchdown'];

// Offizieller Kartenname -> lokale Karten-ID. Verglichen wird über Kleinbuchstaben ohne
// Sonderzeichen, damit "P.E.K.K.A" und "X-Bow" ohne Extrawurst passen.
const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CARD_BY_NAME = new Map(ALL_CARDS.map(c => [normalizeName(c.name), c.id]));

// Interner Codename -> Name, unter dem der Modus im Spiel wirklich heißt.
//
// Die offizielle API liefert in gameMode.name AUSSCHLIESSLICH den internen Codenamen
// ("Crazy_Arena") und sonst kein Feld — kein TID, kein lokalisierter Name. Anzeigenamen gibt
// es dort nur für laufende Event-Leaderboards (/leaderboards), und die lassen sich keiner
// gameMode-ID zuordnen; brandneue Modi wie Chaos stehen da überhaupt nicht drin. Der einzige
// öffentliche Datensatz mit Modusnamen (RoyaleAPI/cr-api-data) endet bei ID 72000379 und hat
// seit Oktober 2023 keinen Commit mehr — Chaos hat 72000502, kommt dort also nie an.
//
// Deshalb diese kurze, von Hand gepflegte Liste. Was hier fehlt, benennt der Admin im
// Dashboard um; ein dort gesetzter Anzeigename überlebt jeden weiteren Scan.
const MODE_DISPLAY_NAMES = {
  Crazy_Arena: 'Chaos',              // C.H.A.O.S, seit März 2026 (10-jähriges Jubiläum)
  Retro_Royale: 'Retro Royale',
  MegaDraft: 'Mega Draft',
  Touchdown_Draft: 'Touchdown Draft',
  Showdown_Friendly: '1v1 Showdown',
  CW_Duel_1v1: 'Duell',
  TeamVsTeam: '2v2',
};

const prettyModeName = (raw) =>
  MODE_DISPLAY_NAMES[raw]
  || String(raw || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiGet(path) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${CR_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${CR_API_TOKEN}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Spieler-Tags einsammeln: bevorzugt aus den Event-Leaderboards (dort spielen genau die
// Leute, deren Battlelogs die Spezialmodi enthalten), aufgefüllt mit Mitgliedern großer Clans.
async function collectPlayerTags() {
  const tags = new Set();

  const boards = await apiGet('/leaderboards');
  const named = (boards?.items || []).filter(b => b.name).slice(0, 5);
  for (const board of named) {
    const rows = await apiGet(`/leaderboard/${board.id}?limit=20`);
    for (const p of rows?.items || []) if (p.tag) tags.add(p.tag);
    await sleep(REQUEST_SPACING_MS);
    if (tags.size >= MAX_BATTLELOGS_PER_SCAN) break;
  }

  if (tags.size < MAX_BATTLELOGS_PER_SCAN) {
    const clans = await apiGet('/clans?minMembers=45&limit=5');
    for (const clan of clans?.items || []) {
      const members = await apiGet(`/clans/%23${String(clan.tag).replace('#', '')}/members`);
      for (const m of (members?.items || []).slice(0, 15)) if (m.tag) tags.add(m.tag);
      await sleep(REQUEST_SPACING_MS);
      if (tags.size >= MAX_BATTLELOGS_PER_SCAN) break;
    }
  }

  return [...tags].slice(0, MAX_BATTLELOGS_PER_SCAN);
}

function isIgnoredMode(modeName) {
  const lower = modeName.toLowerCase();
  return IGNORED_MODE_PREFIXES.some(prefix => modeName.startsWith(prefix))
    || IGNORED_MODE_SUBSTRINGS.some(part => lower.includes(part));
}

// Ein Scan-Durchlauf. Gibt eine Zusammenfassung zurück (auch für die Admin-Seite).
async function scanOfficialModes({ log = () => {} } = {}) {
  if (!CR_API_TOKEN) return { ok: false, error: 'CLASH_ROYALE_API_TOKEN fehlt' };

  const tags = await collectPlayerTags();
  if (!tags.length) return { ok: false, error: 'Keine Spieler-Tags von der API erhalten' };

  // gameMode.name -> { games, cardIds:Set, unknownNames:Set }
  const seen = new Map();
  for (const tag of tags) {
    const log2 = await apiGet(`/players/%23${String(tag).replace('#', '')}/battlelog`);
    await sleep(REQUEST_SPACING_MS);
    if (!Array.isArray(log2)) continue;
    for (const battle of log2) {
      const modeName = battle.gameMode?.name;
      if (!modeName || isIgnoredMode(modeName)) continue;
      if (!seen.has(modeName)) seen.set(modeName, { games: 0, cardIds: new Set(), unknown: new Set() });
      const entry = seen.get(modeName);
      entry.games++;
      for (const side of [...(battle.team || []), ...(battle.opponent || [])]) {
        for (const card of side.cards || []) {
          const localId = CARD_BY_NAME.get(normalizeName(card.name));
          if (localId) entry.cardIds.add(localId);
          else entry.unknown.add(card.name);
        }
      }
    }
  }

  const maxPoolSize = Math.floor(ALL_CARDS.length * RESTRICTED_POOL_RATIO);
  const detected = [];
  for (const [modeName, entry] of seen) {
    // Zu kleine Stichprobe oder offensichtlich voller Kartensatz → kein Spezialmodus
    if (entry.games < MIN_GAMES_FOR_MODE) continue;
    if (entry.cardIds.size > maxPoolSize) continue;

    const cardIds = [...entry.cardIds];
    const saved = presetStore.upsertAutoPreset({
      gameModeKey: modeName,
      name: prettyModeName(modeName),
      cardIds,
      gamesSeen: entry.games,
      windowMs: POOL_WINDOW_MS,
      // Sichtbar erst, wenn über alle Scans hinweg genug Spiele beobachtet wurden und der
      // gesammelte Pool spielbar groß ist. Hat der Admin die Sichtbarkeit selbst gesetzt,
      // bleibt seine Entscheidung stehen (publishLocked im Store).
      shouldPublish: (total) => total.cardCount >= MIN_CARDS_TO_PUBLISH && total.gamesSeen >= MIN_GAMES_TO_PUBLISH,
    });
    detected.push({
      gameModeKey: modeName,
      name: saved?.name,
      gamesThisScan: entry.games,
      cardsThisScan: cardIds.length,
      cardsTotal: saved?.cardIds.length ?? cardIds.length,
      added: saved?.lastAdded?.length ?? 0,
      removed: saved?.lastRemoved?.length ?? 0,
      published: saved?.isPublished ?? false,
      unknownNames: [...entry.unknown],
    });
    log(`Spezialmodus "${modeName}": ${entry.games} Spiele, ${cardIds.length} Karten in diesem Lauf, Pool jetzt ${saved?.cardIds.length}`);
  }

  const summary = {
    ok: true,
    scannedAt: Date.now(),
    playersScanned: tags.length,
    modesObserved: seen.size,
    detected,
  };
  presetStore.setMeta('lastScan', JSON.stringify(summary));
  return summary;
}

let timer = null;
// Regelmäßiger Scan im Hintergrund. Ohne API-Token passiert gar nichts.
function startModeScanner() {
  if (!CR_API_TOKEN || timer) return false;
  const run = () => scanOfficialModes({ log: (m) => console.log(`[CR-Modus-Scan] ${m}`) })
    .then(r => { if (!r.ok) console.log(`[CR-Modus-Scan] übersprungen: ${r.error}`); })
    .catch(e => console.log(`[CR-Modus-Scan] Fehler: ${e.message}`));
  setTimeout(run, FIRST_SCAN_DELAY_MS);
  timer = setInterval(run, SCAN_INTERVAL_MS);
  return true;
}

const lastScanSummary = () => {
  try { return JSON.parse(presetStore.getMeta('lastScan') || 'null'); } catch { return null; }
};

module.exports = { scanOfficialModes, startModeScanner, lastScanSummary, prettyModeName };
