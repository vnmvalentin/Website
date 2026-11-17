// kontoStand.js — Lights Out am Konto (utils/spielKonto.js): Stand, Zusammenführen, Abzeichen, Bestwerte.
// Rein, ohne React und Netz (node --test).
//
// Der Browser hält den Fortschritt in vier Schlüsseln (erreichte Ebene, gefundene Notizen, schnellster Durchgang,
// Fluchten); am Konto liegt er als ein Stand { level, notes, best, fluchten, koop }. Einstellungen bleiben je Gerät.
import { LEVELS } from './levels.js';
import { ALL_NOTES } from './lore.js';
import { ganz, kleinsterPositiver, liesJson, schreibJson, vereinige } from '../../utils/spielstand.js';

export const SCHLUESSEL = { level: 'lo:progress', notes: 'lo:notes', best: 'lo:best-run', laeufe: 'lo:runs' };
const NOTIZ_IDS = new Set(ALL_NOTES.map((n) => n.id));

export function normalisiere(s) {
  return {
    level: Math.min(LEVELS.length - 1, ganz(s?.level)),
    notes: (Array.isArray(s?.notes) ? s.notes : []).filter((id) => NOTIZ_IDS.has(id)),
    best: Number(s?.best) > 0 ? Number(s.best) : 0, // Sekunden
    fluchten: ganz(s?.fluchten),
    koop: !!s?.koop,
  };
}

export function zusammenfuehren(konto, browser) {
  const a = normalisiere(konto);
  const b = normalisiere(browser);
  return {
    level: Math.max(a.level, b.level),
    notes: vereinige(a.notes, b.notes),
    best: kleinsterPositiver(a.best, b.best),
    fluchten: Math.max(a.fluchten, b.fluchten),
    koop: a.koop || b.koop,
  };
}

/** Eine Flucht aus dem Sanatorium zählen (alle Ebenen geschafft); im Koop zählt sie auch für das Koop-Abzeichen. */
export function zaehleFlucht({ koop = false } = {}, speicher) {
  const alt = liesJson(SCHLUESSEL.laeufe, speicher) || {};
  return schreibJson(SCHLUESSEL.laeufe, { fluchten: ganz(alt.fluchten) + 1, koop: !!alt.koop || koop }, speicher);
}

export function liesStand(speicher) {
  const level = liesJson(SCHLUESSEL.level, speicher);
  const notes = liesJson(SCHLUESSEL.notes, speicher);
  const best = liesJson(SCHLUESSEL.best, speicher);
  const laeufe = liesJson(SCHLUESSEL.laeufe, speicher);
  if (!level && !notes && !best && !laeufe) return null;
  return normalisiere({ level: level?.level, notes: notes?.ids, best: best?.time, fluchten: laeufe?.fluchten, koop: laeufe?.koop });
}

export function schreibStand(stand, speicher) {
  const s = normalisiere(stand);
  schreibJson(SCHLUESSEL.level, { level: s.level }, speicher);
  schreibJson(SCHLUESSEL.notes, { ids: s.notes }, speicher);
  if (s.best > 0) schreibJson(SCHLUESSEL.best, { time: s.best }, speicher);
  schreibJson(SCHLUESSEL.laeufe, { fluchten: s.fluchten, koop: s.koop }, speicher);
}

export const LIGHTS_OUT_KONTO = {
  lies: () => liesStand(),
  schreib: (stand) => schreibStand(stand),
  // Fortschritt statt Partien: 15 je geschaffter Ebene, 3 je Notiz, 20 je Flucht
  xp: (stand) => {
    const s = normalisiere(stand);
    return s.level * 15 + s.notes.length * 3 + s.fluchten * 20;
  },
  zusammenfuehren,
  erfolge: (stand) => {
    const s = normalisiere(stand);
    const entkommen = s.fluchten > 0 || s.best > 0;
    return [
      (s.level >= 1 || entkommen) && 'erste-ebene',
      entkommen && 'entkommen',
      s.notes.length >= NOTIZ_IDS.size && 'akte',
      s.koop && 'gemeinsam',
    ].filter(Boolean);
  },
  bestwerte: (stand) => ({ 'schnellste-flucht': normalisiere(stand).best * 1000 }),
};
