// Zufallsmodus der normalen Lobby: statt eines festen Modus lost der Server beim Start einen
// aus dem vom Host gewählten Pool aus. Bewusst KEIN eigener Registry-Modus — lobby.mode bleibt
// immer ein echter Modus, damit Presets, Pool-Prüfungen und alles Übrige unverändert greifen.
// Der Zufallsmodus ist nur ein Schalter (lobby.randomEnabled) plus Pool (lobby.randomModes).
//
// Gespielt wird immer mit dem Preset "Vorgeschlagen" des ausgelosten Modus — wie im Turnier.
// Die Regler eines einzelnen Modus vorab einzustellen ergibt keinen Sinn, wenn noch nicht
// feststeht, welcher es wird.

const registry = require('./registry');
const { getCardPool } = require('./cards');
const { applySuggestedPreset } = require('./modePresets');

// Dauer der Walze auf dem Client: Drehen (ModeSpin SPIN_MS) + Stehenbleiben (LAND_HOLD_MS) +
// kurze Modus-Einblendung. Erst danach startet der Server das Spiel — die Clients wechseln mit
// clash:gameStart von selbst in die Spielansicht.
const RANDOM_SPIN_MS = 3600 + 1700 + 2200;

/** Pool vom Client: nur bekannte Modus-IDs, ohne Doppelte. Leere Liste ist erlaubt (Startknopf sperrt). */
function sanitizeRandomModes(list) {
  if (!Array.isArray(list)) return undefined;
  return [...new Set(list.filter(id => typeof id === 'string' && registry.getMode(id)))];
}

/** Modi des Pools, die im aktuellen Party-Modus (Solo/Duo) überhaupt wählbar sind. */
function partyPool(lobby) {
  const party = lobby.partyMode || 'solo';
  return (lobby.randomModes || []).filter(id => registry.modeAllowsParty(registry.getMode(id), party));
}

/**
 * Prüft einen Modus an einer Kopie der Lobby mit dessen "Vorgeschlagen"-Werten — genau so, wie
 * er nach der Auslosung gestartet würde. Die Kopie ist flach: applyModePreset setzt nur Felder
 * auf oberster Ebene, Spielerliste und ausgeschlossene Karten werden nur gelesen.
 * Liefert null (startbar) oder { key, params } wie canStart().
 */
function probeMode(lobby, modeId) {
  const mode = registry.getMode(modeId);
  if (!mode) return { key: 'unknownMode' };
  const probe = { ...lobby, mode: modeId };
  applySuggestedPreset(probe);
  const poolSize = getCardPool(probe).length;
  const blocked = mode.canStart?.(probe, poolSize);
  if (blocked) return blocked;
  const activeCount = probe.players.filter(p => !p.isSpectator).length;
  const needed = mode.requiredPool ? (mode.requiredPool(probe, activeCount) ?? 0) : 0;
  if (poolSize < needed) return { key: 'poolTooSmall', params: { needed, available: poolSize } };
  return null;
}

/**
 * Lost einen startbaren Modus aus. Modi, die mit der aktuellen Spielerzahl oder dem Kartenpool
 * nicht laufen würden, fallen still heraus; "Keine Wiederholung" meidet den zuletzt gespielten,
 * solange noch ein anderer übrig ist.
 * @returns {{ mode: string, pool: string[] } | { error: { key, params? } }}
 */
function drawRandomMode(lobby, rng = Math.random) {
  const pool = partyPool(lobby);
  if (pool.length === 0) return { error: { key: 'randomNoModes' } };
  const results = pool.map(id => ({ id, blocked: probeMode(lobby, id) }));
  let candidates = results.filter(r => !r.blocked).map(r => r.id);
  // Nichts startbar: den Grund des ersten Modus zeigen — bei nur einem Modus im Pool ist das
  // genau die Meldung, die der Host auch ohne Zufallsmodus bekäme.
  if (candidates.length === 0) return { error: results[0].blocked };
  if (lobby.randomNoRepeat && candidates.length > 1) {
    candidates = candidates.filter(id => id !== lobby.lastRandomMode);
  }
  return { mode: candidates[Math.floor(rng() * candidates.length)], pool };
}

module.exports = { RANDOM_SPIN_MS, sanitizeRandomModes, partyPool, probeMode, drawRandomMode };
