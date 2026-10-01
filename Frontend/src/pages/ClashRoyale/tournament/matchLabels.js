// Bezeichnungen von Matches (Gruppe/Runde/Finale) — von Bracket, Raum und "Dein nächstes Match" geteilt.

/** Lesbare Bezeichnung eines Matches innerhalb der Match-Liste des Turniers. */
export function matchLabel(m, matches, t) {
  if (m.stage === 'group') return `${t.groupName(m.group)} · ${t.roundN(m.round)}`;
  if (m.stage === 'grand') return m.round === 1 ? t.grandFinal : t.bracketReset;
  const sameStage = matches.filter(x => x.stage === m.stage);
  const last = Math.max(...sameStage.map(x => x.round));
  const double = matches.some(x => x.stage === 'lower' || x.stage === 'grand');
  if (m.stage === 'lower') return m.round === last ? t.lowerFinal : t.lowerRound(m.round);
  if (double) return m.round === last ? t.upperFinal : t.roundN(m.round);
  if (m.round === last) return t.final;
  if (m.round === last - 1) return t.semiFinal;
  if (m.round === last - 2) return t.quarterFinal;
  return t.roundN(m.round);
}

export const hasPlayer = (m, pid) => !!pid && (m.a === pid || m.b === pid);
