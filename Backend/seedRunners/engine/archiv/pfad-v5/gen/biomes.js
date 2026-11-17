// Biome: Optik und bevorzugte Mechaniken eines Levels.
//
// Ein Biom entscheidet per Seed (oder Wahl des Hosts) über:
//   · die Farben (`palette`, vom Renderer benutzt)
//   · wie oft welche Mechanik vorkommt (`prefer`: Faktor je Tag, > 1 häufiger, < 1 seltener)
//   · ob der Boden vereist (`iceFloors`: Chunks mit `iceable` bekommen Eis auf der Oberfläche)
// Alle Chunks bleiben in allen Biomen möglich, nur ihre Häufigkeit ändert sich — so ist ein
// Fabrik-Level nicht plötzlich ein Laser-Marathon ohne Abwechslung.

export const BIOMES = Object.freeze({
  meadow: {
    id: 'meadow', label: 'Wiese',
    prefer: { spikes: 1.5, double: 1.3, wall: 1.2, spring: 1.3, mover: 1.2, laser: 0.4, conveyor: 0.4, gravity: 0.5, ice: 0.3 },
    iceFloors: false,
    palette: { bg: '#0d1620', tile: '#2c3a2f', tileTop: '#5f8f58', accent: '#8fd17a', far: '#14202b' },
  },
  ice: {
    id: 'ice', label: 'Eis',
    prefer: { ice: 3, wind: 2, sticky: 2, wall: 1.3, crumble: 0.7, conveyor: 0.3, laser: 0.4 },
    iceFloors: true,
    palette: { bg: '#0b1420', tile: '#243a4e', tileTop: '#8ccbe8', accent: '#bfe8f7', far: '#122234' },
  },
  factory: {
    id: 'factory', label: 'Fabrik',
    prefer: { conveyor: 3, laser: 3, saw: 2.5, switch: 2, mover: 1.5, ice: 0.2, wind: 0.4, crumble: 0.5 },
    iceFloors: false,
    palette: { bg: '#121118', tile: '#33303a', tileTop: '#d19a3b', accent: '#f0b94a', far: '#1b1922' },
  },
  cave: {
    id: 'cave', label: 'Höhle',
    prefer: { crumble: 3, falling: 3, spikes: 2, saw: 1.5, grapple: 1.3, wind: 0.3, ring: 0.4, portal: 0.5 },
    iceFloors: false,
    palette: { bg: '#0a0a10', tile: '#2a2431', tileTop: '#7a5d9c', accent: '#b592e0', far: '#12101a' },
  },
  sky: {
    id: 'sky', label: 'Himmel',
    prefer: { wind: 3, ring: 3, spring: 2.5, portal: 2.5, gravity: 2.5, mover: 2, spikes: 0.5, crumble: 0.5, conveyor: 0.2 },
    iceFloors: false,
    palette: { bg: '#0d1226', tile: '#2a3357', tileTop: '#7f9be8', accent: '#a9c0ff', far: '#151c3a' },
  },
});

export const BIOME_IDS = Object.keys(BIOMES);
export const isBiome = (id) => Object.prototype.hasOwnProperty.call(BIOMES, id);
