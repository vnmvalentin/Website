// Spielmodus-Katalog der Lobby: Beschriftung, Symbol, Beschreibung und Chunk-Loader.
//
// Deutsch ist die Basis (MODES), Englisch überschreibt nur die Felder, die sich wirklich
// unterscheiden — die meisten Modusnamen sind bereits englische Markennamen. Die
// Modus-Kennungen müssen mit registry.modeIds() im Backend übereinstimmen.

import {
  Worm, Hash, Repeat, Zap, Sparkles, FishingRod, Flashlight,
  Check, AlertTriangle,
} from 'lucide-react';
// Der Elixiertropfen aus dem Spiel statt eines generischen Wassertropfens —
// siehe ui/CrIcons.jsx.
import { ElixirDrop } from './ui/CrIcons';

export const MODES = [
  {
    id: 'snake',
    name: 'Snake Royale',
    icon: Worm,
    desc: 'Wähle Karten aus einem 11×11-Raster – aber nur anliegend an die zuletzt gewählte Karte. Baue das beste Deck!',
    available: true,
  },
  {
    id: 'auction',
    name: 'Elixir Auction',
    icon: ElixirDrop,
    desc: 'Starte mit 100 Elixier und biete in jeder Runde auf angezeigte Karten. Der Höchstbietende gewinnt – Verlierer erhalten einen Trostpreis!',
    available: true,
  },
  {
    id: 'bingo',
    name: 'Bingo Royale',
    icon: Hash,
    desc: 'Fülle deine Bingo-Karte mit Clash Royale Karten. Bingos geben dir PowerUps mit denen du dein Deck verbessern oder gegnerische sabotieren kannst.',
    available: true,
  },
  {
    id: 'shadow-carousel',
    name: 'Blindes Karussell',
    icon: Repeat,
    desc: 'Jeder Spieler hat einen Tisch voller verdeckter Karten. Decke pro Runde Karten auf und nimm eine — auch blind. Danach wandern die Tische im Karussell weiter.',
    available: true,
  },
  {
    id: 'elixir-rush',
    name: 'Elixir Rush',
    icon: Zap,
    desc: 'Dein Elixier lädt sich automatisch auf — auf dem Marktplatz erscheinen Karten mit echten Elixierkosten. Wer zuerst klickt, bekommt die Karte. 8 Käufe = fertiges Deck!',
    available: true,
  },
  {
    id: 'card-evolution',
    name: 'Karten-Evolution',
    icon: Sparkles,
    desc: '3 Runden: Karten mit progressiven Tokenkosten aufwerten und locken, dann Gegner sabotieren, dann weiter aufwerten. Karten kommen aus einem geteilten Pool — jede Karte gehört immer nur einem Spieler gleichzeitig.',
    available: true,
  },
  {
    id: 'angel-royale',
    name: 'Angel Royale',
    icon: FishingRod,
    desc: 'Karten treiben in zufälligen Bahnen über den Fluss — manche schnell, manche in Wellenlinien, manche tauchen kurz ab und sind dann nicht fangbar. Klicke sie an, um sie zu angeln. Nach jedem Fang braucht deine Angel einen Moment — und wer zu lange gar nicht angelt, bekommt eine zufällige Karte zugelost.',
    available: true,
  },
  {
    id: 'dark-maze',
    name: 'Dunkles Labyrinth',
    icon: Flashlight,
    desc: 'Ein bei jedem Start neu generiertes Labyrinth in völliger Dunkelheit — du siehst nur deinen eigenen Lichtkegel. Sammle Draft-Kisten (1 aus 2) und lose Bodenkarten, in der Mitte wartet ein Joker. Läuft die Zeit ab, werden leere Deck-Plätze zufällig aufgefüllt.',
    available: true,
  },
];

/** Nur die Modi, deren Name sich im Englischen wirklich ändert. */
const MODE_NAME_EN = {
  'shadow-carousel': 'Shadow Carousel',
  'card-evolution': 'Card Evolution',
  'angel-royale': 'Fishing Royale',
  'dark-maze': 'Dark Maze',
};

const MODE_DESC_EN = {
  snake: 'Pick cards from an 11×11 grid — but only ones adjacent to your last pick. Build the best possible deck!',
  auction: 'Start with 100 elixir and bid on the cards shown each round. Highest bidder wins — losers get a consolation prize!',
  bingo: 'Fill your bingo card with Clash Royale cards. Bingos grant power-ups to improve your own deck or sabotage opponents.',
  'shadow-carousel': 'Each player has a table full of face-down cards. Reveal cards each round and take one — even blindly. Tables then rotate carousel-style.',
  'elixir-rush': 'Your elixir refills automatically — the marketplace shows cards at their real elixir cost. First click gets the card. 8 buys = finished deck!',
  'card-evolution': '3 rounds: upgrade and lock cards at progressive token costs, then sabotage opponents, then keep upgrading. Cards come from a shared pool — every card belongs to only one player at a time.',
  'angel-royale': 'Cards drift across the river on random paths — some fast, some in sine waves, some briefly submerge and can\'t be caught. Click them to reel them in. After every catch your rod needs a moment — and anyone who stops fishing for too long gets a random card assigned.',
  'dark-maze': 'A maze regenerated on every start, in complete darkness — you only see your own cone of light. Collect draft chests (1 of 2) and loose floor cards; a joker waits in the center. When time runs out, empty deck slots are filled randomly.',
};

/** Modus-Deskriptor zu einer Kennung; fällt auf Snake zurück, damit nie undefined entsteht. */
export const modeInfo = (id) => MODES.find(m => m.id === id) || MODES[0];

/**
 * Kachelbild eines Modus auf der Startseite.
 *
 * Liegt in public/ statt in src/assets/, damit neue Grafiken einfach in den Ordner
 * gelegt werden können, ohne den Build anzufassen (dieselbe Handhabung wie bei den
 * Garden-Assets). Fehlt die Datei, fängt ModeCard das ab und zeigt das Modus-Symbol —
 * die Seite bleibt also auch ohne Bilder vollständig.
 */
export const modeImage = (id) => `/cr-modes/${id}.jpg`;

export const modeNameFor = (id, lang) => {
  const m = modeInfo(id);
  return lang === 'en' ? (MODE_NAME_EN[m.id] || m.name) : m.name;
};

export const modeDescFor = (id, lang) => {
  const m = modeInfo(id);
  return lang === 'en' ? (MODE_DESC_EN[m.id] || m.desc) : m.desc;
};

// Damit beim Spielstart kein Ladeplatzhalter aufblitzt: Sobald in der Lobby feststeht,
// welcher Modus gespielt wird, holt useClashSocket dessen Chunk schon im Hintergrund.
// Bis der Host auf Start drückt, liegt er im Browser-Cache. Vite dedupliziert den Import,
// ein zweiter Aufruf kostet also nichts.
export const MODE_CHUNK_LOADERS = {
  snake: () => import('./modes/SnakeRoyale'),
  auction: () => import('./modes/ElixirAuction'),
  bingo: () => import('./modes/BingoRoyale'),
  'shadow-carousel': () => import('./modes/ShadowCarousel'),
  'elixir-rush': () => import('./modes/ElixirRush'),
  'card-evolution': () => import('./modes/CardEvolution'),
  'angel-royale': () => import('./modes/AngelRoyale'),
  'dark-maze': () => import('./modes/DarkMaze'),
};

// Einstellungs-Presets: die konkreten Werte kommen vom Server (lobbyData.modePresets),
// hier stehen nur Beschriftung, Beschreibung und Symbol. So gibt es keine zweite Stelle,
// an der Zahlen gepflegt werden müssten.
export const PRESET_META = {
  suggested: {
    icon: Check,
    de: { label: 'Vorgeschlagen', desc: 'Ausbalancierte Werte, passend zur aktuellen Spielerzahl — guter Startpunkt für die erste Runde.' },
    en: { label: 'Suggested', desc: 'Balanced values, scaled to the current player count — a good starting point for a first round.' },
  },
  fast: {
    icon: Zap,
    de: { label: 'Blitz', desc: 'Kurze Timer und schnellere Abläufe — für eine Runde zwischendurch.' },
    en: { label: 'Blitz', desc: 'Short timers and a faster pace — for a quick round.' },
  },
  chaos: {
    icon: AlertTriangle,
    de: { label: 'Chaos', desc: 'Bewusst überdreht: maximaler Druck, mehr Karten, alles gleichzeitig.' },
    en: { label: 'Chaos', desc: 'Deliberately over the top: maximum pressure, more cards, everything at once.' },
  },
};
