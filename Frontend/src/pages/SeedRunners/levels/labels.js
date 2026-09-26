// Beschriftungen und Formate der Level-Seiten — an einer Stelle, damit Browser, Karte, Detailseite und Editor dasselbe sagen.

export const SORT_OPTIONS = [
  { id: 'new', label: 'Neu' },
  { id: 'popular', label: 'Beliebt' },
  { id: 'rated', label: 'Bestbewertet' },
  { id: 'hardest', label: 'Am schwersten' },
  { id: 'random', label: 'Zufällig' },
];

export const DIFFICULTIES = [
  { value: 1, label: '1 · Sehr leicht' },
  { value: 2, label: '2 · Leicht' },
  { value: 3, label: '3 · Mittel' },
  { value: 4, label: '4 · Schwer' },
  { value: 5, label: '5 · Extrem' },
];

export const REPORT_REASONS = [
  { id: 'anstoessig', label: 'Anstößiger Inhalt (Name, Beschreibung oder Level)' },
  { id: 'unspielbar', label: 'Unspielbar oder kaputt' },
  { id: 'kopie', label: 'Kopie eines fremden Levels' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

/** Status, den nur Ersteller und Moderation sehen (für andere ist ein Level in diesen Zuständen unsichtbar) */
export const STATUS_LABELS = {
  hidden: { label: 'Ausgeblendet', hint: 'Die Moderation hat dieses Level ausgeblendet. Nur du und die Moderation sehen es.' },
  reverify: { label: 'Neu verifizieren', hint: 'Die Spielphysik wurde aktualisiert und dein Verifizierungslauf besteht sie nicht mehr. Spiele das Level einmal neu durch, dann ist es wieder sichtbar.' },
};

/** Anteil als ganze Prozent; "–" ohne Grundlage */
export const formatPercent = (rate) => (rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)} %`);

export const formatDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString('de-DE', { dateStyle: 'medium' }) : '');

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Der Text zu einem abgelehnten oder fehlgeschlagenen Ergebnis des Servers: Grund, sonst ein allgemeiner Satz */
export const reasonOf = (res) => res?.reason || 'Das hat nicht geklappt. Versuch es gleich noch einmal.';
