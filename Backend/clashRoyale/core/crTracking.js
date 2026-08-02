// Lobby-Tracking über die offizielle Clash-Royale-API.
//
// Idee: Der Host verknüpft die Spieler-Tags und schaltet das Tracking ein. Ab diesem
// Moment zählt der Server für jeden verknüpften Spieler mit, wie viele Partien er
// gewinnt und verliert — der Stand steht neben dem Namen in der Lobby und am Ende auf
// dem Leaderboard.
//
// ── Was die API hergibt, und was nicht ──────────────────────────────────────────────
// Es gibt KEINEN Endpunkt für den Fortschritt einer laufenden Challenge. Die einzige
// Quelle ist /players/{tag}/battlelog, und die hat drei harte Grenzen:
//
//   1. Sie enthält nur die letzten ~25 Partien.
//   2. Sie aktualisiert sich verzögert (erfahrungsgemäß bis zu ein paar Minuten).
//   3. Sie hat keinen Cursor — man bekommt immer denselben Ausschnitt.
//
// Deshalb arbeitet dieses Modul mit einem Zeitstempel je Tag: Beim Einschalten wird die
// neueste Partie gemerkt, danach zählt jeder Durchlauf nur, was seitdem dazugekommen ist.
// Wer zwischen zwei Durchläufen mehr als 25 Partien spielt, verliert den Anschluss —
// bei einem 30-Sekunden-Takt praktisch ausgeschlossen.
//
// ── Anfragelast ─────────────────────────────────────────────────────────────────────
// Eine Anfrage pro verknüpftem Tag und Durchlauf. Bei 8 Spielern und 30s Takt sind das
// 16 Anfragen/Minute. Mehrere Lobbys mit demselben Tag (Streamer spielt in zweien mit)
// teilen sich den Cache unten, damit die Last nicht mit der Lobbyzahl wächst.

const { isConfigured, fetchBattlelog } = require('../../lib/crApi');

const POLL_INTERVAL_MS = 30 * 1000;
// So lange gilt ein einmal geholtes Battlelog als frisch genug, um es erneut zu benutzen.
// Etwas kürzer als der Takt, damit ein Durchlauf nicht versehentlich die Daten des
// vorherigen wiederverwendet.
const BATTLELOG_CACHE_MS = 25 * 1000;

// tag → { at, battles }
const battlelogCache = new Map();

let timer = null;
let deps = null; // { lobbies, broadcastLobby }

/** Battlelog mit Cache. Fehler laufen als leeres Array durch — siehe safe:true. */
async function getBattlelog(tag) {
  const hit = battlelogCache.get(tag);
  if (hit && Date.now() - hit.at < BATTLELOG_CACHE_MS) return hit.battles;
  const battles = await fetchBattlelog(tag, { safe: true });
  battlelogCache.set(tag, { at: Date.now(), battles });
  return battles;
}

/** Alle Spieler einer Lobby, für die getrackt werden kann. */
const trackablePlayers = (lobby) =>
  lobby.players.filter(p => !p.isAdmin && !p.left && p.crTag);

/**
 * Tracking einschalten: aktuellen Stand jedes Tags merken, damit vergangene Partien
 * nicht mitgezählt werden.
 *
 * Schlägt der erste Abruf fehl (API nicht erreichbar, Tag gerade nicht auflösbar), wird
 * der Einschaltzeitpunkt als Grenze gesetzt. Sonst stünde die Grenze bei 0 und der
 * nächste Durchlauf würde das komplette Battlelog als "neu" verbuchen.
 */
async function startTracking(lobby) {
  const startedAt = Date.now();
  lobby.tracking = { enabled: true, startedAt, cursors: {}, scores: {} };

  await Promise.all(trackablePlayers(lobby).map(async (p) => {
    const battles = await getBattlelog(p.crTag);
    const newest = battles.length ? Math.max(...battles.map(b => b.battleTimeMs)) : 0;
    lobby.tracking.cursors[p.crTag] = newest || startedAt;
    lobby.tracking.scores[p.id] = { wins: 0, losses: 0, lastMode: '', updatedAt: startedAt };
  }));
}

function stopTracking(lobby) {
  if (!lobby.tracking) return;
  lobby.tracking.enabled = false;
}

/**
 * Einen frisch verknüpften Spieler in ein laufendes Tracking aufnehmen — sonst stünde
 * er bis zum nächsten Ein-/Ausschalten ohne Punktestand da.
 */
async function onPlayerLinked(lobby, player) {
  if (!lobby.tracking?.enabled) return;
  const battles = await getBattlelog(player.crTag);
  const newest = battles.length ? Math.max(...battles.map(b => b.battleTimeMs)) : 0;
  lobby.tracking.cursors[player.crTag] = newest || Date.now();
  lobby.tracking.scores[player.id] = { wins: 0, losses: 0, lastMode: '', updatedAt: Date.now() };
}

/** Punktestände einer Lobby aktualisieren. @returns true, wenn sich etwas geändert hat */
async function pollLobby(lobby) {
  if (!lobby.tracking?.enabled) return false;
  let changed = false;

  await Promise.all(trackablePlayers(lobby).map(async (p) => {
    const cursor = lobby.tracking.cursors[p.crTag] ?? lobby.tracking.startedAt;
    const battles = await getBattlelog(p.crTag);
    const fresh = battles.filter(b => b.battleTimeMs > cursor);
    if (!fresh.length) return;

    const score = lobby.tracking.scores[p.id]
      || (lobby.tracking.scores[p.id] = { wins: 0, losses: 0, lastMode: '', updatedAt: 0 });

    for (const b of fresh) {
      if (b.result === 'win') score.wins++;
      else if (b.result === 'loss') score.losses++;
      // Unentschieden zählen für keine Seite — in Clash Royale die absolute Ausnahme
    }
    // Neueste zuerst: der zuletzt gespielte Modus landet in lastMode
    const newest = fresh.reduce((a, b) => (b.battleTimeMs > a.battleTimeMs ? b : a));
    score.lastMode = newest.gameMode || score.lastMode;
    score.updatedAt = Date.now();
    lobby.tracking.cursors[p.crTag] = newest.battleTimeMs;
    changed = true;
  }));

  return changed;
}

/** Ein Durchlauf über alle Lobbys mit aktivem Tracking. */
async function tick() {
  if (!deps) return;
  const { lobbies, broadcastLobby } = deps;
  for (const lobby of lobbies.values()) {
    if (!lobby.tracking?.enabled) continue;
    try {
      if (await pollLobby(lobby)) broadcastLobby(lobby);
    } catch (err) {
      // Eine kaputte Lobby darf die übrigen nicht mitreißen
      console.error(`[crTracking] Lobby ${lobby.code}:`, err.message);
    }
  }
}

/**
 * Schleife starten. Genau EIN Intervall für alle Lobbys — ein Timer pro Lobby würde bei
 * vielen gleichzeitigen Runden die API im Sekundentakt treffen.
 *
 * @param {Map}      lobbies         die Lobby-Registry
 * @param {Function} broadcastLobby  (lobby) => verteilt den Zustand an alle im Raum
 * @returns true, wenn die Schleife jetzt läuft (false ohne API-Token oder wenn schon aktiv)
 */
function initCrTracking({ lobbies, broadcastLobby }) {
  if (timer || !isConfigured()) return false;
  deps = { lobbies, broadcastLobby };
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
  // Der Prozess soll nicht wegen dieser Schleife am Leben bleiben
  timer.unref?.();
  return true;
}

/** Punktestände für den Client. */
function trackingScoreFor(lobby, playerId) {
  const s = lobby?.tracking?.scores?.[playerId];
  if (!s) return null;
  return { wins: s.wins, losses: s.losses, lastMode: s.lastMode, updatedAt: s.updatedAt };
}

module.exports = {
  initCrTracking,
  startTracking,
  stopTracking,
  onPlayerLinked,
  trackingScoreFor,
  // Ein einzelner Durchlauf für eine Lobby. Wird von tick() benutzt und ist die Stelle,
  // an der die eigentliche Zähllogik steckt — deshalb hier exportiert und einzeln prüfbar.
  pollLobby,
  POLL_INTERVAL_MS,
};
