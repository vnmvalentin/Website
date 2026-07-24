// Bilder für den Karten-Evolution-Modus: Wildcard-Platzhalter (Start-Slots) + Evolutions-Tokens.
// Dateien liegen unter: Frontend/src/assets/clashRoyale/
//   - CommonWild.png / RareWild.png / EpicWild.png — Wildcard-Platzhalter nach Rarity
//   - tt-common.png   — normaler Evolutions-Token
//   - tt-legendary.png — Super-Evolutions-Token
const _wtGlob = import.meta.glob(
  '/src/assets/clashRoyale/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
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
