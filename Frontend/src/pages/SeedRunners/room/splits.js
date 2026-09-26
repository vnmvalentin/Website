// splits.js — Zwischenzeiten je Checkpoint vergleichen (Tagesrennen). Eine Zwischenzeit ist [Checkpoint-Nummer, Tick seit dem
// Start]; die der Rangliste stammen aus dem Nachspielen des Servers. Reine Funktionen, ohne React.

/** Alle Checkpoint-Nummern, die in irgendeiner der Listen vorkommen, aufsteigend */
export function checkpointSpalten(...listen) {
  const cps = new Set();
  for (const liste of listen) for (const s of liste || []) cps.add(s[0]);
  return [...cps].sort((a, b) => a - b);
}

/** Die schnellste Zwischenzeit je Checkpoint aus den Ranglisten-Einträgen: Map cp → { tick, name } */
export function besteJeCheckpoint(entries) {
  const beste = new Map();
  for (const e of entries || []) {
    for (const [cp, tick] of e.splits || []) {
      const alt = beste.get(cp);
      if (!alt || tick < alt.tick) beste.set(cp, { tick, name: e.name });
    }
  }
  return beste;
}

/**
 * Eine Zeile je Checkpoint des eigenen Laufs: die eigene Zeit, die eigene Bestzeit des Tages und die schnellste des Tages am
 * selben Checkpoint, jeweils mit Abstand (negativ = man war schneller).
 * @param lauf     Zwischenzeiten des Laufs, der verglichen wird
 * @param meine    Zwischenzeiten der eigenen Bestzeit des Tages (oder leer)
 * @param entries  Ranglisten-Einträge mit splits
 */
export function splitVergleich(lauf, meine, entries) {
  const du = new Map(lauf || []);
  const bestDu = new Map(meine || []);
  const tag = besteJeCheckpoint(entries);
  return checkpointSpalten(lauf).map((cp) => {
    const t = du.get(cp);
    const b = bestDu.get(cp);
    const tb = tag.get(cp) || null;
    return {
      cp,
      du: t,
      bestDu: b ?? null,
      zuBestDu: b === undefined ? null : t - b,
      tagesBest: tb,
      zuTagesBest: tb ? t - tb.tick : null,
    };
  });
}
