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

/** Je eigenem Checkpoint „gruen“ | „gelb“ | „rot“, verglichen mit der schnellsten Abschnittszeit aller Ranglisten-Läufe */
export function abschnittWertung(splits, entries) {
  const meine = abschnitte(splits);
  const beste = new Map();
  for (const e of entries || []) {
    for (const [cp, t] of abschnitte(e.splits)) {
      if (t > 0 && (!beste.has(cp) || t < beste.get(cp))) beste.set(cp, t);
    }
  }
  const out = [];
  for (const [cp, t] of meine) {
    const b = beste.get(cp);
    if (!b || t <= b) { out.push('gruen'); continue; }
    const mehr = (t - b) / b;
    out.push(mehr <= GRUEN_BIS ? 'gruen' : mehr <= GELB_BIS ? 'gelb' : 'rot');
  }
  return out;
}

const QUADRAT = { gruen: '🟩', gelb: '🟨', rot: '🟥' };
/** Ein Quadrat je eigenem Checkpoint (siehe abschnittWertung) */
export function abschnittQuadrate(splits, entries) {
  return abschnittWertung(splits, entries).map((w) => QUADRAT[w]).join('');
}

// Farben der Quadrate im Ergebnisbild (wie die Emoji-Quadrate, abgestimmt auf den dunklen Grund)
const BILD_FARBE = { gruen: '#5fcf6b', gelb: '#f2c744', rot: '#e5534b' };

/**
 * Das Ergebnisbild des Tagesrennens (utils/ergebnisbild.js): Zeit groß, Platz, Tode, Quadrate je Abschnitt.
 * Gleiche Eingaben wie tagesrennenText, ohne url (den Link baut das Ergebnisbild selbst, mit ?ref).
 */
export function tagesrennenErgebnis({ dateKey, lauf, rank, total, entries, archiv = false }) {
  const tode = `${lauf.deaths} ${lauf.deaths === 1 ? 'Tod' : 'Tode'}`;
  const werte = [];
  if (!archiv && rank) werte.push({ name: 'Platz', wert: total ? `${rank} von ${total}` : String(rank) });
  werte.push({ name: 'Tode', wert: String(lauf.deaths) });
  const wertung = abschnittWertung(lauf.splits, entries);
  if (wertung.length) {
    const gruen = wertung.filter((w) => w === 'gruen').length;
    werte.push({ name: 'Nah an der Bestzeit', wert: `${gruen} / ${wertung.length} Abschnitte` });
  }
  const teile = [formatTicks(lauf.ticks)];
  if (!archiv && rank) teile.push(total ? `Platz ${rank} von ${total}` : `Platz ${rank}`);
  teile.push(tode);
  return {
    spiel: 'seed-runners',
    pfad: archiv ? `/seed-runners/daily/${dateKey}` : '/seed-runners/daily',
    kicker: `${archiv ? 'Archiv' : 'Tagesrennen'} · ${germanDate(dateKey)}`,
    marke: !archiv && rank === 1 ? 'Platz 1' : null,
    gross: formatTicks(lauf.ticks),
    unter: archiv ? 'Zeit im Archiv-Level' : rank ? 'Bestzeit des Tages' : 'Letzter Lauf',
    raster: wertung.map((w) => BILD_FARBE[w]),
    werte,
    aufruf: archiv ? 'Gleiches Level, deine Zeit?' : 'Heute für alle dasselbe Level. Bist du schneller?',
    text: `Seed Runners · ${archiv ? 'Archiv' : 'Tagesrennen'} ${germanDate(dateKey)}: ${teile.join(' · ')}`,
  };
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
