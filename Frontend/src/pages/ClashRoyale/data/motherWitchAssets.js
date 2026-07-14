// Bilder für die Mutterhexen-Besuche im Elixir-Auction-Modus.
// Dateien ablegen unter: Frontend/src/assets/clashRoyale/
//   - motherwitch.jpg (oder .png/.jpeg/.webp) — Portrait der Mutterhexe
//   - pig.jpg (oder .png/.jpeg/.webp) — Schwein-Platzhalter für den Schweinezauber
const _mwGlob = import.meta.glob(
  '/src/assets/clashRoyale/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
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
