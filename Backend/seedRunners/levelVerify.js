// Seed Runners — Verifizierung eigener Level: Regeln.
//
// Wer im Editor ein Level baut, muss es einmal selbst durchspielen, bevor es veröffentlicht werden darf. Der Browser
// schickt das Level-Dokument samt Input-Log; der Server
//   1. prüft das Dokument (Schema, Grenzen, Rauchtest) und berechnet den Inhalts-Hash SELBST,
//   2. spielt das Log im Worker mit derselben Sim nach (verifier.js, Auftrag kind 'custom') — auf den Tick genau,
//   3. speichert die beste Zeit je Konto und Inhalts-Hash, samt Log (der spätere Ersteller-Geist).
//
// Die Verifizierung hängt an zwei Dingen:
//   · dem INHALTS-HASH: Jede Änderung an Gelände, Elementen oder Tempo-Klasse ergibt einen anderen Hash, ein Lauf auf
//     dem alten Stand gilt für den neuen nicht. Name, Beschreibung, Tags und Biom gehören nicht zum Hash.
//   · dem SIM-FINGERPRINT: Die Physik, gegen die geprüft wurde. Ändert sich die Sim, ist eine ältere Verifizierung
//     veraltet (`current: false`) — das Level muss neu durchgespielt werden. Der Generator zählt nicht dazu.
//
// Der Server glaubt dem Client weder Zeit noch Tode noch Hash: Er nimmt, was das Nachspielen ergibt. Ein mitgeschickter
// Hash dient nur als Kontrolle, dass Seite und Server das Level gleich berechnen.
'use strict';

const { checkLevel, currentFingerprints } = require('./levelCheck');
const { CUSTOM_MAX_TICKS } = require('./replay');

const HASH_RE = /^[0-9a-f]{64}$/;
const FP_RE = /^[A-Za-z0-9]{1,40}$/;
// 20 Minuten mit ein paar Eingaben je Sekunde bleiben weit darunter; mehr ist kein Lauf, sondern ein Angriff auf den Speicher
const MAX_LOG_NUMBERS = 120000;
const MAX_MASK = 255;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Ein Input-Log [tick, maske, …]: gerade Länge, Ticks aufsteigend im erlaubten Bereich, Masken 0–255 */
function cleanLog(raw) {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > MAX_LOG_NUMBERS) return null;
  let last = 0;
  for (let i = 0; i < raw.length; i += 2) {
    if (!isInt(raw[i], 0, CUSTOM_MAX_TICKS) || !isInt(raw[i + 1], 0, MAX_MASK) || raw[i] < last) return null;
    last = raw[i];
  }
  return raw;
}

/**
 * @param {{ store: object, verifier: { verify: Function }, check?: Function, fingerprints?: Function }} deps
 *   check         Level-Prüfung (Standard: levelCheck.checkLevel); Tests setzen eine Attrappe ein
 *   fingerprints  liefert { sim, engine } des Servers (Standard: aus dem Spiegel)
 */
function createLevelVerifyService(deps) {
  const { store, verifier } = deps;
  const check = deps.check || checkLevel;
  const fingerprints = deps.fingerprints || currentFingerprints;

  return {
    /**
     * Einen Verifizierungslauf prüfen und speichern.
     * @param {{ accountId: string, doc: unknown, log: unknown, ticks: unknown, fp?: unknown, hash?: unknown }} input
     * @returns {Promise<{ status: 'ok'|'abgelehnt'|'ungeprueft'|'busy'|'fehler'|'ungueltig', reason?: string, errors?: string[],
     *   hash?: string, ticks?: number, deaths?: number, playedTicks?: number, improved?: boolean, verifiedAt?: number }>}
     */
    async submit(input) {
      const { accountId } = input;
      if (!accountId) return { status: 'ungueltig', reason: 'Nicht angemeldet.' };
      if (!isInt(input.ticks, 60, 10 ** 9)) return { status: 'ungueltig', reason: 'Ungültige Zeit.' };
      if (input.ticks > CUSTOM_MAX_TICKS) return { status: 'abgelehnt', reason: 'Zeitlimit: Ein Verifizierungslauf darf höchstens 20 Minuten dauern.' };
      const log = cleanLog(input.log);
      if (!log) return { status: 'ungueltig', reason: 'Ungültiges Input-Log.' };
      const fp = FP_RE.test(String(input.fp || '')) ? String(input.fp) : '';

      // Das Dokument prüft der Server selbst und rechnet den Hash selbst aus — nie den des Clients übernehmen
      const checked = await check(input.doc, { includeDoc: true });
      if (!checked.ok) return { status: 'ungueltig', reason: 'Das Level ist ungültig.', errors: checked.errors };
      const hash = checked.hash;
      if (input.hash !== undefined && input.hash !== hash) {
        return { status: 'ungeprueft', reason: 'Deine Seite und der Server berechnen das Level nicht gleich — bitte lade die Seite neu.' };
      }
      const simFp = checked.fp.sim;
      if (fp !== simFp) return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };

      // Schon verifiziert (gegen die aktuelle Physik) und nicht schneller: nichts nachzuspielen, das Level gilt bereits
      const existing = store.getVerification(accountId, hash);
      if (existing && existing.simFp === simFp && existing.ticks <= input.ticks) {
        return { status: 'ok', hash, ticks: existing.ticks, deaths: existing.deaths, playedTicks: input.ticks, improved: false, verifiedAt: existing.verifiedAt };
      }

      const verdict = await verifier.verify({ kind: 'custom', doc: checked.doc, hash, log, ticks: input.ticks, fp });
      if (verdict.status === 'invalid') return { status: 'abgelehnt', reason: verdict.reason };
      if (verdict.status === 'skipped') return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };
      if (verdict.status === 'busy') return { status: 'busy', reason: 'Der Server prüft gerade viele Läufe. Versuch es gleich noch einmal.' };
      if (verdict.status !== 'ok') return { status: 'fehler', reason: 'Die Prüfung ist fehlgeschlagen. Versuch es gleich noch einmal.' };

      const improved = store.saveVerification({
        accountId, contentHash: hash, simFp, ticks: verdict.ticks, deaths: verdict.deaths, splits: verdict.splits, log,
      });
      const rec = store.getVerification(accountId, hash);
      return { status: 'ok', hash, ticks: rec.ticks, deaths: rec.deaths, playedTicks: verdict.ticks, improved, verifiedAt: rec.verifiedAt };
    },

    /**
     * Stand der Verifizierung dieses Kontos für einen Inhalts-Hash.
     * @returns {Promise<{ verified: false } | { verified: true, current: boolean, ticks: number, deaths: number, verifiedAt: number }>}
     *   current  false = gegen eine ältere Physik geprüft: gilt nicht mehr, das Level muss neu durchgespielt werden
     */
    async status(accountId, hash) {
      if (!HASH_RE.test(String(hash))) return { verified: false };
      const rec = store.getVerification(accountId, hash);
      if (!rec) return { verified: false };
      const fps = await fingerprints();
      return { verified: true, current: rec.simFp === fps.sim, ticks: rec.ticks, deaths: rec.deaths, verifiedAt: rec.verifiedAt };
    },
  };
}

module.exports = { createLevelVerifyService, cleanLog, HASH_RE, MAX_LOG_NUMBERS };
