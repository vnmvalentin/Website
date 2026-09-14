// Übersetzt die sprachneutralen Merkmals-Tag-IDs vom Server (buildHintTags() in
// Backend/clashRoyale/modes/elixirAuction2v2.js, z.B. "cost:5", "unit:ground",
// "target:groundAir", "trait:splash") in lesbaren Text.
//
// Bewusst NICHT vom Server übersetzt: Spieler in derselben Lobby können unterschiedliche
// UI-Sprachen haben (lang lebt pro Browser, nicht pro Lobby) — die Übersetzung passiert
// deshalb hier, beim Rendern.

const UNIT_LABEL = {
  spell: { de: 'Zauber', en: 'Spell', es: 'Hechizo' },
  building: { de: 'Gebäude', en: 'Building', es: 'Edificio' },
  air: { de: 'Lufttruppe', en: 'Air troop', es: 'Tropa aérea' },
  ground: { de: 'Bodentruppe', en: 'Ground troop', es: 'Tropa terrestre' },
};

const TARGET_LABEL = {
  groundAir: { de: 'Boden und Luft', en: 'Ground & air', es: 'Tierra y aire' },
  ground: { de: 'Nur Boden', en: 'Ground only', es: 'Solo tierra' },
};

const TRAIT_LABEL = {
  splash: { de: 'Flächenschaden', en: 'Splash damage', es: 'Daño en área' },
  swarm: { de: 'Schwarm', en: 'Swarm', es: 'Enjambre' },
  target_buildings: { de: 'Zielt Gebäude', en: 'Targets buildings', es: 'Ataca edificios' },
  has_evo: { de: 'Evolution', en: 'Evolution', es: 'Evolución' },
  champion: { de: 'Champion', en: 'Champion', es: 'Campeón' },
  rarity_legendary: { de: 'Legendär', en: 'Legendary', es: 'Legendaria' },
  rarity_epic: { de: 'Episch', en: 'Epic', es: 'Épica' },
  rarity_rare: { de: 'Selten', en: 'Rare', es: 'Rara' },
  rarity_common: { de: 'Gewöhnlich', en: 'Common', es: 'Común' },
};

/** "cost:5" | "unit:ground" | "target:groundAir" | "trait:splash" → lesbarer Text. */
export function hintTagLabel(tagId, lang = 'de') {
  const [kind, value] = String(tagId || '').split(':');
  const l = lang === 'en' || lang === 'es' ? lang : 'de';
  if (kind === 'cost') {
    const n = Number(value) || 0;
    return l === 'en' ? `${n} Elixir` : l === 'es' ? `${n} de elixir` : `${n} Elixier`;
  }
  if (kind === 'unit') return UNIT_LABEL[value]?.[l] || value;
  if (kind === 'target') return TARGET_LABEL[value]?.[l] || value;
  if (kind === 'trait') return TRAIT_LABEL[value]?.[l] || value;
  return tagId;
}
