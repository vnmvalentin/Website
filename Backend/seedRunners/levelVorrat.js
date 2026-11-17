// Seed Runners — Level-Vorrat: Zufallslevel werden im Leerlauf VORGEBAUT und fertig ausgeliefert.
//
// Warum (14.11.2026): Ein Pfad-Level zu bauen dauert je Seed 3–30 s — im Browser jedes Spielers, bei jedem Rundenstart
// („Level wird erzeugt …“). Und weil es in Sekunden fertig sein muss, darf der Generator nie wählerisch sein: Gemessen
// bestanden 61 % aller Züge aus schlichten Sprüngen, je nach Seed 43–81 %. Der Vorrat löst beides:
//   1. Der Server baut im Hintergrund (eigener Worker-Thread, vorratWorker.js), der Browser lädt das fertige Level
//      (GET /api/seed-runners/vorrat/level) — keine Wartezeit.
//   2. Gebaut wird auf Vorrat, also darf AUSSORTIERT werden: Nur Level, die die Güte-Schwelle bestehen (`bewerte`),
//      kommen hinein. Die Seeds der Zufallsrunden stammen dann aus dem Vorrat (socket.js → roomManager `randomSeed`).
//
// Ein Level ist weiter nur „Seed + Biom + Generator-Version“: Der Vorrat ist ein Zwischenspeicher, keine Quelle. Fehlt ein
// Level (leerer Vorrat, selbst eingetippter Seed, alter Eintrag schon gelöscht), baut der Browser es wie bisher selbst —
// und bekommt bitgleich dasselbe. Der Server baut NIE auf Zuruf (jeder Bau kostet Sekunden Rechenzeit): Die Schnittstelle
// liefert nur, was schon da ist.
//
// Zwei Arten von Einträgen:
//   vorrat   für Zufallsrunden: frei, bis `nimm()` den Seed an einen Raum vergibt; abrufbar erst DANACH
//   tag      das Tagesrennen (Seed „daily-JJJJ-MM-TT“): ohne Güte-Schwelle (der Seed steht fest), abrufbar ab seinem Tag
'use strict';

const zlib = require('zlib');
const crypto = require('crypto');

const STANDARD = Object.freeze({
  /** So viele freie Level sollen bereitliegen (0 = Vorrat aus) */
  ZIEL: 24,
  /** Pause zwischen zwei Bauten: Der Worker soll den Rechner nicht dauerhaft auslasten */
  PAUSE_MS: 3000,
  /** Vergebene Level bleiben so lange abrufbar (Nachzügler, Revanche, Verlauf) — danach baut der Browser selbst */
  HALTEN_MS: 10 * 24 * 3600 * 1000,
  /** Tages-Level bleiben länger (Archiv) */
  HALTEN_TAG_MS: 60 * 24 * 3600 * 1000,
  /** Nach so vielen Fehlschlägen am Stück (Worker kaputt, Zeitüberschreitung) pausiert das Auffüllen */
  FEHLER_FOLGE_MAX: 4,
  FEHLER_PAUSE_MS: 10 * 60 * 1000,
});

/** Güte-Schwelle der Pfad-Level (bis gv 4). Gemessen an 40 Leveln (gv 4): besteht rund jedes dritte. */
const GUETE = Object.freeze({
  /** Anteil schlichter Sprünge an allen Zügen */
  schlichtMax: 0.58,
  /** längste Folge schlichter Sprünge am Stück */
  folgeMax: 12,
  /** verschiedene Aufgaben im Level (Extrem-Level tragen absichtlich nur eine oder zwei: dort nicht gefordert) */
  artenMin: 10,
  /** ein Weg, der vorzeitig abbrach, ist kein langes Level */
  zuegeMin: 80,
});

/**
 * Güte-Schwelle der Lauf-Level (ab gv 5). Die Lauflinie plant Abwechslung von sich aus (nie zwei schlichte Sprünge am Stück
 * geplant): Gemessen an 16 langen Leveln 6–20 % schlichte Schritte, Folge höchstens 2, 11–14 Zug-Arten, 10–13 Strecken,
 * Kettenlauf 16 von 16. Die Schwelle fängt also nur Ausreißer: einen gescheiterten Kettenlauf oder ein Level, das vorzeitig
 * auf einer Rastplattform endete.
 */
const GUETE_LAUF = Object.freeze({
  schlichtMax: 0.25,
  folgeMax: 3,
  artenMin: 10,
  /** gebaute Strecken mindestens: geplant minus so viele */
  streckenFehlMax: 2,
});

const SEED_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const BIOME_RE = /^[a-z]{1,16}$/;
const TAG_RE = /^daily-(\d{4}-\d{2}-\d{2})$/;

/**
 * Besteht ein Level die Güte-Schwelle?
 * @param {{ zuege: number, schlicht: number, folge: number, arten: number, extrem?: boolean, welt?: string }} k  Kennzahlen
 *   (vorratWorker.js; welt 'lauf' = Lauf-Level, dann gilt GUETE_LAUF)
 * @returns {{ ok: boolean, grund?: string }}
 */
function bewerte(k, guete = GUETE) {
  if (!k || !Number.isFinite(k.zuege) || k.zuege <= 0) return { ok: false, grund: 'keine Kennzahlen' };
  if (k.welt === 'lauf') return bewerteLauf(k);
  if (k.zuege < guete.zuegeMin) return { ok: false, grund: 'zu kurz' };
  if (k.schlicht / k.zuege > guete.schlichtMax) return { ok: false, grund: 'zu viele schlichte Sprünge' };
  if (k.folge > guete.folgeMax) return { ok: false, grund: 'lange Folge schlichter Sprünge' };
  if (!k.extrem && k.arten < guete.artenMin) return { ok: false, grund: 'zu wenige verschiedene Aufgaben' };
  return { ok: true };
}

/** Güte eines Lauf-Levels (Kennzahlen aus vorratWorker.js kennzahlenLauf). */
function bewerteLauf(k, guete = GUETE_LAUF) {
  if (!k.kettenlauf) return { ok: false, grund: 'Kettenlauf gescheitert' };
  if (k.strecken < k.geplant - guete.streckenFehlMax) return { ok: false, grund: 'zu kurz' };
  if (k.schlicht / k.zuege > guete.schlichtMax) return { ok: false, grund: 'zu viele schlichte Sprünge' };
  if (k.folge > guete.folgeMax) return { ok: false, grund: 'lange Folge schlichter Sprünge' };
  if (k.arten < guete.artenMin) return { ok: false, grund: 'zu wenige verschiedene Aufgaben' };
  return { ok: true };
}

const schluesselVon = (gv, biome, seed) => `${gv}|${biome}|${seed}`;

/**
 * @param {{ db: object, baue: (params: object) => Promise<object>, gv: number, heute: () => string,
 *           now?: () => number, zufallsSeed?: () => string, config?: object, log?: (text: string) => void }} deps
 *   db     better-sqlite3-Datenbank (dieselbe Datei wie store.js)
 *   baue   (params) → { status: 'ok', json, hash, kennzahlen } | { status: 'error'|'busy', reason } — baut im Worker
 *   gv     laufende Generator-Version (genVersion.js); nur für sie wird gebaut
 *   heute  Datumsschlüssel von heute (Berliner Zeit)
 */
function createLevelVorrat(deps) {
  const { db, baue, gv, heute } = deps;
  const now = deps.now || Date.now;
  const zufallsSeed = deps.zufallsSeed || (() => crypto.randomBytes(4).toString('hex'));
  const cfg = { ...STANDARD, ...(deps.config || {}) };
  const log = deps.log || (() => {});

  db.exec(`CREATE TABLE IF NOT EXISTS sr_vorrat (
    schluessel TEXT PRIMARY KEY,
    gv INTEGER NOT NULL,
    biome TEXT NOT NULL,
    seed TEXT NOT NULL,
    art TEXT NOT NULL,
    level_z BLOB NOT NULL,
    hash TEXT NOT NULL,
    kennzahlen_json TEXT NOT NULL,
    gebaut_at INTEGER NOT NULL,
    vergeben_at INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_vorrat_frei ON sr_vorrat(art, gv, biome, vergeben_at, gebaut_at)');

  const stmt = {
    einfuegen: db.prepare(`INSERT OR IGNORE INTO sr_vorrat
      (schluessel, gv, biome, seed, art, level_z, hash, kennzahlen_json, gebaut_at, vergeben_at)
      VALUES (@schluessel, @gv, @biome, @seed, @art, @levelZ, @hash, @kennzahlenJson, @gebautAt, NULL)`),
    frei: db.prepare("SELECT schluessel, seed FROM sr_vorrat WHERE art = 'vorrat' AND gv = ? AND biome = ? AND vergeben_at IS NULL ORDER BY gebaut_at LIMIT 1"),
    freiZahl: db.prepare("SELECT COUNT(*) AS c FROM sr_vorrat WHERE art = 'vorrat' AND gv = ? AND vergeben_at IS NULL"),
    vergib: db.prepare('UPDATE sr_vorrat SET vergeben_at = ? WHERE schluessel = ? AND vergeben_at IS NULL'),
    hole: db.prepare('SELECT art, level_z, vergeben_at FROM sr_vorrat WHERE schluessel = ?'),
    hat: db.prepare('SELECT 1 FROM sr_vorrat WHERE schluessel = ?'),
    zahl: db.prepare('SELECT art, COUNT(*) AS c, SUM(vergeben_at IS NOT NULL) AS vergeben FROM sr_vorrat GROUP BY art'),
    // Aufräumen: vergebene alte Level, alte Tages-Level, und freie Level einer überholten Generator-Version
    alt: db.prepare("DELETE FROM sr_vorrat WHERE art = 'vorrat' AND vergeben_at IS NOT NULL AND vergeben_at < ?"),
    altTag: db.prepare("DELETE FROM sr_vorrat WHERE art = 'tag' AND gebaut_at < ?"),
    ueberholt: db.prepare("DELETE FROM sr_vorrat WHERE art = 'vorrat' AND vergeben_at IS NULL AND gv != ?"),
  };

  const zaehler = { gebaut: 0, aufgenommen: 0, verworfen: 0, fehler: 0, vergeben: 0, leer: 0, gruende: {} };
  let laeuft = false;
  let zu = false;
  let timer = null;
  let fehlerFolge = 0;
  let pauseBis = 0;

  const freie = () => stmt.freiZahl.get(gv).c;

  function speichere(art, params, res) {
    return stmt.einfuegen.run({
      schluessel: schluesselVon(params.gv, params.biome, params.seed),
      gv: params.gv, biome: params.biome, seed: params.seed, art,
      levelZ: zlib.gzipSync(Buffer.from(res.json, 'utf8')),
      hash: String(res.hash || ''),
      kennzahlenJson: JSON.stringify(res.kennzahlen || {}),
      gebautAt: now(),
    }).changes > 0;
  }

  const pfadParams = (seed) => ({ seed, length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad', gv });

  /** Einen Kandidaten bauen und, wenn er die Schwelle besteht, aufnehmen. @returns {Promise<'aufgenommen'|'verworfen'|'fehler'>} */
  async function baueEinen() {
    const params = pfadParams(zufallsSeed());
    if (stmt.hat.get(schluesselVon(params.gv, params.biome, params.seed))) return 'verworfen';
    const res = await baue(params);
    if (zu) return 'fehler';
    if (!res || res.status !== 'ok') {
      zaehler.fehler++;
      fehlerFolge++;
      if (fehlerFolge >= cfg.FEHLER_FOLGE_MAX) {
        pauseBis = now() + cfg.FEHLER_PAUSE_MS;
        fehlerFolge = 0;
        log(`Vorrat pausiert nach wiederholten Fehlern: ${res ? res.reason || res.status : 'keine Antwort'}`);
      }
      return 'fehler';
    }
    fehlerFolge = 0;
    zaehler.gebaut++;
    const urteil = bewerte(res.kennzahlen);
    if (!urteil.ok) {
      zaehler.verworfen++;
      zaehler.gruende[urteil.grund] = (zaehler.gruende[urteil.grund] || 0) + 1;
      return 'verworfen';
    }
    if (speichere('vorrat', params, res)) zaehler.aufgenommen++;
    return 'aufgenommen';
  }

  /** Auffüllen, bis ZIEL freie Level bereitliegen — ein Bau nach dem anderen, mit Pause. Läuft höchstens einmal zugleich. */
  async function auffuellen() {
    if (laeuft || zu || cfg.ZIEL <= 0) return;
    laeuft = true;
    try {
      while (!zu && now() >= pauseBis && freie() < cfg.ZIEL) {
        await baueEinen();
        if (cfg.PAUSE_MS > 0) await new Promise((r) => { const t = setTimeout(r, cfg.PAUSE_MS); t.unref?.(); });
      }
    } catch (e) {
      log(`Vorrat: Auffüllen fehlgeschlagen: ${e && e.message ? e.message : e}`);
    } finally {
      laeuft = false;
    }
  }

  return {
    /**
     * Seed eines vorgebauten Levels für eine Zufallsrunde — oder null (leer, oder ein festes Biom: Der Vorrat baut nur
     * „Biom aus dem Seed“). Der Seed ist danach vergeben; das Auffüllen läuft von selbst wieder an.
     */
    nimm(biome = 'random') {
      if (zu || cfg.ZIEL <= 0 || biome !== 'random') return null;
      const zeile = stmt.frei.get(gv, 'random');
      if (!zeile || stmt.vergib.run(now(), zeile.schluessel).changes === 0) { zaehler.leer++; return null; }
      zaehler.vergeben++;
      auffuellen();
      return zeile.seed;
    },

    /**
     * Das fertige Level (gzip-komprimiertes JSON) — oder null. Freie Vorrats-Level werden NICHT ausgeliefert (niemand kennt
     * ihren Seed, und so bleibt es dabei), Tages-Level erst ab ihrem Tag.
     */
    hole({ seed, biome, gv: g }) {
      if (zu || !SEED_RE.test(String(seed)) || !BIOME_RE.test(String(biome)) || !Number.isInteger(g)) return null;
      const zeile = stmt.hole.get(schluesselVon(g, biome, seed));
      if (!zeile) return null;
      if (zeile.art === 'vorrat' && zeile.vergeben_at == null) return null;
      const tag = TAG_RE.exec(seed);
      if (tag && tag[1] > heute()) return null;
      return zeile.level_z;
    },

    /** Das Tages-Level eines Tages vorbauen (ohne Güte-Schwelle). @returns {Promise<boolean>} liegt es danach im Vorrat? */
    async tagVorbauen(params) {
      if (zu || cfg.ZIEL <= 0 || !params || params.gen !== 'pfad' || params.gv !== gv || !TAG_RE.test(String(params.seed))) return false;
      if (stmt.hat.get(schluesselVon(params.gv, params.biome, params.seed))) return true;
      const res = await baue(params);
      if (zu || !res || res.status !== 'ok') return false;
      speichere('tag', params, res);
      return true;
    },

    auffuellen,

    /** Regelmäßig auffüllen und aufräumen (runtime.js). */
    starte(verzoegerungMs = 30000, taktMs = 5 * 60 * 1000) {
      if (timer || cfg.ZIEL <= 0) return;
      const runde = () => {
        try {
          stmt.alt.run(now() - cfg.HALTEN_MS);
          stmt.altTag.run(now() - cfg.HALTEN_TAG_MS);
          stmt.ueberholt.run(gv);
        } catch (e) {
          log(`Vorrat: Aufräumen fehlgeschlagen: ${e && e.message ? e.message : e}`);
        }
        auffuellen();
      };
      const erst = setTimeout(runde, verzoegerungMs);
      erst.unref?.();
      timer = setInterval(runde, taktMs);
      timer.unref?.();
    },

    /** Kennzahlen für Protokoll und Admin */
    stand() {
      const zeilen = stmt.zahl.all();
      const von = (art) => zeilen.find((z) => z.art === art) || { c: 0, vergeben: 0 };
      return { frei: freie(), ziel: cfg.ZIEL, vorrat: von('vorrat').c, tage: von('tag').c, laeuft, ...zaehler, gruende: { ...zaehler.gruende } };
    },

    close() {
      zu = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { createLevelVorrat, bewerte, GUETE, GUETE_LAUF, STANDARD };
