// shareText.js — das teilbare Ergebnis des Tagesrennens, wie bei Wordle: ein paar Zeilen Text für Discord & Co.
// Die Quadrate zeigen je Abschnitt (Checkpoint zu Checkpoint), wie nah man an der schnellsten Abschnittszeit des Tages war.
// Reine Funktionen, ohne React.
import { formatTicks } from './format.js';
import { germanDate } from '../ui/tagesArchiv.js';

// Bis +3 % auf die schnellste Abschnittszeit: grün, bis +12 %: gelb, darüber rot
export const GRUEN_BIS = 0.03;
export const GELB_BIS = 0.12;

/** Abschnittszeiten aus kumulativen Zwischenzeiten: Map cp → Ticks seit dem vorigen Checkpoint */
function abschnitte(splits) {
  const sortiert = [...(splits || [])].sort((a, b) => a[0] - b[0]);
  const m = new Map();
  let vorher = 0;
  for (const [cp, tick] of sortiert) {
    m.set(cp, tick - vorher);
    vorher = tick;
  }
  return m;
}

/** Ein Quadrat je eigenem Checkpoint, verglichen mit der schnellsten Abschnittszeit aller Ranglisten-Läufe */
export function abschnittQuadrate(splits, entries) {
  const meine = abschnitte(splits);
  const beste = new Map();
  for (const e of entries || []) {
    for (const [cp, t] of abschnitte(e.splits)) {
      if (t > 0 && (!beste.has(cp) || t < beste.get(cp))) beste.set(cp, t);
    }
  }
  let out = '';
  for (const [cp, t] of meine) {
    const b = beste.get(cp);
    if (!b || t <= b) { out += '🟩'; continue; }
    const mehr = (t - b) / b;
    out += mehr <= GRUEN_BIS ? '🟩' : mehr <= GELB_BIS ? '🟨' : '🟥';
  }
  return out;
}

/**
 * Der Text zum Teilen.
 * @param dateKey  JJJJ-MM-TT
 * @param lauf     { ticks, deaths, splits } — die eigene Bestzeit des Tages (oder der letzte Lauf)
 * @param rank     Platz in der Rangliste oder null (Archiv, nicht bestätigt)
 * @param total    bestätigte Läufe des Tages
 * @param entries  Ranglisten-Einträge mit splits (für die Quadrate)
 * @param url      Link zum Tagesrennen
 * @param archiv   true = vergangener Tag, ohne Platz
 */
export function tagesrennenText({ dateKey, lauf, rank, total, entries, url, archiv = false }) {
  const kopf = `Seed Runners · ${archiv ? 'Archiv' : 'Tagesrennen'} ${germanDate(dateKey)}`;
  const tode = `${lauf.deaths} ${lauf.deaths === 1 ? 'Tod' : 'Tode'}`;
  const teile = [formatTicks(lauf.ticks)];
  if (!archiv && rank) teile.push(total ? `Platz ${rank} von ${total}` : `Platz ${rank}`);
  teile.push(tode);
  const quadrate = abschnittQuadrate(lauf.splits, entries);
  return [kopf, teile.join(' · '), quadrate, url].filter(Boolean).join('\n');
}
