// Bilder für den Karten-Evolution-Modus: Wildcard-Platzhalter (Start-Slots) + Evolutions-Tokens.
// Dateien liegen unter: Frontend/src/assets/clashRoyale/ui/ (Endung egal: jpg/png/webp)
//   - CommonWild / RareWild / EpicWild — Wildcard-Platzhalter nach Rarity
//   - tt-common    — normaler Evolutions-Token
//   - tt-legendary — Super-Evolutions-Token
// Nur diese Namen im Glob — ui/ enthält ~100 weitere Bilder, die hier nicht mitgeladen werden sollen.
const _wtGlob = import.meta.glob(
  '/src/assets/clashRoyale/ui/{CommonWild,RareWild,EpicWild,tt-common,tt-legendary}.{jpg,jpeg,png,webp}',
  { eager: true }
);
const WT_MAP = Object.fromEntries(
  Object.entries(_wtGlob).map(([p, m]) => [
    p.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(),
    m.default,
  ])
);

export const WILDCARD_IMG = {
  Common: WT_MAP['commonwild'] || null,
  Rare: WT_MAP['rarewild'] || null,
  Epic: WT_MAP['epicwild'] || null,
};

export const TOKEN_IMG = {
  normal: WT_MAP['tt-common'] || null,
  super: WT_MAP['tt-legendary'] || null,
};
