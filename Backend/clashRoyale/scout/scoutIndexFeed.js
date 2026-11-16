// scoutIndexFeed.js — füttert den Namens-Index (scoutStore) einmal am Tag in der Breite: für jedes Land die
// Ranked-Rangliste (bis 200 Spieler mit Name und Clan) und die Mitglieder der bestplatzierten Clans.
//
// Warum so: Ein Abruf einer Rangliste liefert 200 Namen, ein Clan 50 — ganz ohne Battlelogs. Bei rund 200 Ländern
// sind das gut 1.000 Abrufe am Tag für Zehntausende Namen. Ein „Schneeball" über Gegner von Gegnern bräuchte für
// jeden neuen Namen einen eigenen Abruf, und die meisten so gefundenen Spieler sucht nie jemand.
//
// Ergänzt die übrigen Quellen des Index (Profilabrufe, Meta-Sammler über die Top 1000, Clan-Seiten, Ranglisten-
// Aufrufe). Abruf und Speicher kommen herein — der Lauf selbst hat Tests in __tests__/scout.test.js.

const HOUR = 60 * 60 * 1000;

/**
 * @param {object} deps
 * @param {() => Promise<Array<{ id: number }>>} deps.fetchLocations          Länder ([] bei Fehler)
 * @param {(loc: number) => Promise<Array|null>} deps.fetchPlayers            Ranked-Rangliste eines Landes (shapePlayerRanking)
 * @param {(loc: number) => Promise<Array|null>} deps.fetchClans              Clan-Rangliste eines Landes (shapeClanRanking)
 * @param {(tag: string) => Promise<object|null>} deps.fetchClan              Clan mit Mitgliedern (shapeClan)
 * @param {(list: Array) => void} deps.remember                               in den Namens-Index schreiben
 * @param {{ getValue: Function, setValue: Function }} deps.store
 */
function createIndexFeeder({
  fetchLocations, fetchPlayers, fetchClans, fetchClan, remember, store,
  clansPerCountry = 5, intervalMs = 24 * HOUR, spacingMs = 350, log = console,
}) {
  let running = false;
  let timer = null;
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  /** Ein Lauf über alle Länder. Liefert { countries, players, clans, members } oder null, wenn nichts ging. */
  async function run() {
    if (running) return null;
    running = true;
    const stats = { countries: 0, players: 0, clans: 0, members: 0 };
    try {
      const locations = await fetchLocations();
      if (!locations.length) return null;
      let failures = 0;
      for (const loc of locations) {
        const players = await fetchPlayers(loc.id);
        await sleep(spacingMs);
        const clans = clansPerCountry > 0 ? await fetchClans(loc.id) : [];
        await sleep(spacingMs);
        if (players === null && clans === null) {
          if (++failures >= 15) break; // API offenbar nicht erreichbar
          continue;
        }
        failures = 0;
        stats.countries += 1;
        if (players?.length) {
          remember(players.map((p) => ({ tag: p.tag, name: p.name, clan: p.clan?.name || '' })));
          stats.players += players.length;
        }
        for (const c of (clans || []).slice(0, clansPerCountry)) {
          const clan = await fetchClan(c.tag);
          await sleep(spacingMs);
          if (!clan?.members?.length) continue;
          remember(clan.members.map((m) => ({ tag: m.tag, name: m.name, trophies: m.trophies, clan: clan.name })));
          stats.clans += 1;
          stats.members += clan.members.length;
        }
      }
      if (!stats.countries) return null;
      store.setValue('indexFeed', { at: Date.now(), ...stats });
      return stats;
    } catch (err) {
      log.warn?.('[scout] Index-Füller fehlgeschlagen:', err?.message || err);
      return null;
    } finally {
      running = false;
    }
  }

  /** Stündlich prüfen, ob der letzte Lauf einen Tag her ist. Der erste Blick wartet, damit der Start nicht stockt. */
  function start({ firstDelayMs = 15 * 60 * 1000, checkEveryMs = HOUR } = {}) {
    if (timer) return;
    const check = () => {
      let last = null;
      try { last = store.getValue('indexFeed')?.value || null; } catch { /* Speicher nicht verfügbar */ }
      if (!last || Date.now() - last.at >= intervalMs) run();
    };
    const first = setTimeout(check, firstDelayMs);
    first.unref?.();
    timer = setInterval(check, checkEveryMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { run, start, stop };
}

module.exports = { createIndexFeeder };
