// Bilder für die Mutterhexen-Besuche im Elixir-Auction-Modus.
// Dateien ablegen unter: Frontend/src/assets/clashRoyale/ui/ (Endung egal: jpg/png/webp)
//   - motherwitch — Portrait der Mutterhexe
//   - pig — Schwein-Platzhalter für den Schweinezauber
// Nur diese Namen im Glob — ui/ enthält ~100 weitere Bilder, die hier nicht mitgeladen werden sollen.
const _mwGlob = import.meta.glob(
  '/src/assets/clashRoyale/ui/{motherwitch,pig}.{jpg,jpeg,png,webp}',
  { eager: true }
);
const MW_MAP = Object.fromEntries(
  Object.entries(_mwGlob).map(([p, m]) => [
    p.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(),
    m.default,
  ])
);

export const MOTHER_WITCH_IMG = MW_MAP['motherwitch'] || null;
export const PIG_IMG = MW_MAP['pig'] || null;
