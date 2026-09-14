// Spielmodus-Katalog der Lobby: Beschriftung, Symbol, Beschreibung und Chunk-Loader.
//
// Deutsch ist die Basis (MODES), Englisch überschreibt nur die Felder, die sich wirklich
// unterscheiden — die meisten Modusnamen sind bereits englische Markennamen. Die
// Modus-Kennungen müssen mit registry.modeIds() im Backend übereinstimmen.

import {
  Worm, Hash, Repeat, Zap, Sparkles, FishingRod, Flashlight, Skull, Triangle,
  Check, AlertTriangle, Users,
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
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'auction',
    name: 'Elixir Auction',
    icon: ElixirDrop,
    desc: 'Starte mit 100 Elixier und biete in jeder Runde auf angezeigte Karten. Der Höchstbietende gewinnt – Verlierer erhalten einen Trostpreis!',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'bingo',
    name: 'Bingo Royale',
    icon: Hash,
    desc: 'Fülle deine Bingo-Karte mit Clash Royale Karten. Bingos geben dir PowerUps mit denen du dein Deck verbessern oder gegnerische sabotieren kannst.',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'shadow-carousel',
    name: 'Blindes Karussell',
    icon: Repeat,
    desc: 'Jeder Spieler hat einen Tisch voller verdeckter Karten. Decke pro Runde Karten auf und nimm eine — auch blind. Danach wandern die Tische im Karussell weiter.',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'elixir-rush',
    name: 'Elixir Rush',
    icon: Zap,
    desc: 'Dein Elixier lädt sich automatisch auf — auf dem Marktplatz erscheinen Karten mit echten Elixierkosten. Wer zuerst klickt, bekommt die Karte. 8 Käufe = fertiges Deck!',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'card-evolution',
    name: 'Karten-Evolution',
    icon: Sparkles,
    desc: '3 Runden: Karten mit progressiven Tokenkosten aufwerten und locken, dann Gegner sabotieren, dann weiter aufwerten. Karten kommen aus einem geteilten Pool — jede Karte gehört immer nur einem Spieler gleichzeitig.',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'angel-royale',
    name: 'Angel Royale',
    icon: FishingRod,
    desc: 'Karten treiben in zufälligen Bahnen über den Fluss — manche schnell, manche in Wellenlinien, manche tauchen kurz ab und sind dann nicht fangbar. Klicke sie an, um sie zu angeln. Nach jedem Fang braucht deine Angel einen Moment — und wer zu lange gar nicht angelt, bekommt eine zufällige Karte zugelost.',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'dark-maze',
    name: 'Dunkles Labyrinth',
    icon: Flashlight,
    desc: 'Ein bei jedem Start neu generiertes Labyrinth in völliger Dunkelheit — du siehst nur deinen eigenen Lichtkegel. Sammle Draft-Kisten (1 aus 2) und lose Bodenkarten, in der Mitte wartet ein Joker. Läuft die Zeit ab, werden leere Deck-Plätze zufällig aufgefüllt.',
    available: true,
    // Fehlt partyModes, ist ein Modus solo-only (siehe registry.js im Backend — dieselbe
    // Default-Regel gilt dort für Modi ohne eigenes partyModes-Feld). Alle bisherigen Modi
    // kennen kein Team-Konzept und tauchen deshalb nur im Solo-Moduswähler auf.
    partyModes: ['solo'],
  },
  {
    id: 'trap-setter',
    name: 'Fallensteller',
    icon: Skull,
    desc: 'Tarne eine deiner Trap-Karten als etwas Attraktives und lege sie zu echten Karten in ein gemeinsames Raster. Nach kurzem Countdown klicken alle so schnell wie möglich — der Langsamere bei einer Kollision wird zufällig umgeleitet und tappt vielleicht in eine fremde Falle.',
    available: true,
    isNew: true,
    partyModes: ['solo'],
  },
  {
    id: 'pyramid-draft',
    name: 'Pyramidendraft',
    icon: Triangle,
    desc: 'Nur die unterste Reihe der Kartenpyramide liegt offen — der Rest ist verdeckt. Eine Karte wird erst sichtbar, wenn beide Karten direkt darunter vergeben sind. Reihum draften, jede Runde in anderer Reihenfolge; am Rundenende wird zusätzlich eine offene Karte zufällig blockiert.',
    available: true,
    isNew: true,
    partyModes: ['solo'],
  },
  {
    id: 'elixir-auction-2v2',
    name: 'Elixir Auction 2v2',
    icon: ElixirDrop,
    desc: 'Zwei Teams, ein gemeinsamer Elixier-Pool. Jede Runde siehst du eine Karte und schickst 2 Merkmale davon an deinen Partner — danach bietet ihr blind auf die Karte des jeweils anderen. Wer mehr bietet, bekommt sie fürs eigene Deck.',
    available: true,
    isNew: true,
    partyModes: ['duo'],
  },
  {
    id: 'elixir-rush-2v2',
    name: 'Elixir Rush 2v2',
    icon: Users,
    desc: 'Getrennte Marktplätze, eine gemeinsame Elixierleiste. Du und dein Partner kaufen unabhängig voneinander vom Team-Elixier — das lädt schneller auf und fasst mehr als im Solo-Modus.',
    available: true,
    isNew: true,
    partyModes: ['duo'],
  },
];

/** Nur die Modi, deren Name sich im Englischen wirklich ändert. */
const MODE_NAME_EN = {
  'shadow-carousel': 'Shadow Carousel',
  'card-evolution': 'Card Evolution',
  'angel-royale': 'Fishing Royale',
  'dark-maze': 'Dark Maze',
  'trap-setter': 'Trap Setter',
  'pyramid-draft': 'Pyramid Draft',
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
  'trap-setter': 'Disguise one of your trap cards as something attractive and drop it into a shared grid alongside real cards. After a short countdown, everyone clicks as fast as possible — lose a collision and you\'re redirected at random, maybe straight into someone else\'s trap.',
  'pyramid-draft': 'Only the bottom row of the card pyramid lies face up — everything else is hidden. A card is only revealed once both cards directly beneath it are gone. Draft in turn order that rotates every round; at the end of each round one more face-up card gets randomly blocked.',
  'elixir-auction-2v2': 'Two teams, one shared elixir pool. Each round you see one card and send your partner 2 of its traits — then you both bid blind on the other pair\'s card. Highest bid wins it for their own deck.',
  'elixir-rush-2v2': 'Separate marketplaces, one shared elixir bar. You and your partner buy independently from the team\'s elixir — it refills faster and holds more than in solo mode.',
};

// "Angel" (fischen) und "Fallensteller" tragen im Deutschen ein Wortspiel bzw. einen
// Eigennamen, der weder im Englischen (siehe oben) noch im Spanischen wörtlich funktioniert
// — deshalb hier wie dort ein eigener, sinngemäßer Name statt einer 1:1-Übersetzung.
const MODE_NAME_ES = {
  'shadow-carousel': 'Carrusel de Sombras',
  'card-evolution': 'Evolución de Cartas',
  'angel-royale': 'Pesca Royale',
  'dark-maze': 'Laberinto Oscuro',
  'trap-setter': 'El Trampero',
  'pyramid-draft': 'Draft de Pirámide',
};

const MODE_DESC_ES = {
  snake: 'Elige cartas en una cuadrícula de 11×11 — pero solo las que sean adyacentes a tu última elección. ¡Construye el mejor mazo posible!',
  auction: 'Empieza con 100 de elixir y puja por las cartas que aparecen cada ronda. El mejor postor se la lleva — ¡los demás reciben un premio de consolación!',
  bingo: 'Rellena tu cartón de bingo con cartas de Clash Royale. Los bingos dan power-ups para mejorar tu propio mazo o sabotear a los rivales.',
  'shadow-carousel': 'Cada jugador tiene una mesa llena de cartas boca abajo. Revela cartas cada ronda y toma una — incluso a ciegas. Después las mesas rotan como en un carrusel.',
  'elixir-rush': 'Tu elixir se recarga automáticamente — el mercado muestra cartas con su coste de elixir real. El primer clic se lleva la carta. ¡8 compras = mazo terminado!',
  'card-evolution': '3 rondas: mejora y bloquea cartas con costes de fichas progresivos, luego sabotea a los rivales, luego sigue mejorando. Las cartas salen de un pool compartido — cada carta pertenece a un solo jugador a la vez.',
  'angel-royale': 'Las cartas flotan por el río siguiendo trayectorias aleatorias — algunas rápidas, algunas en zigzag, algunas se sumergen brevemente y no se pueden atrapar. Haz clic para pescarlas. Después de cada captura tu caña necesita un momento — y quien deje de pescar demasiado tiempo recibe una carta aleatoria.',
  'dark-maze': 'Un laberinto que se regenera en cada partida, en completa oscuridad — solo ves tu propio cono de luz. Recoge cofres de draft (1 de 2) y cartas sueltas en el suelo; en el centro espera un comodín. Cuando se acaba el tiempo, las casillas de mazo vacías se rellenan al azar.',
  'trap-setter': 'Disfraza una de tus cartas trampa como algo atractivo y colócala en una cuadrícula compartida junto a cartas reales. Tras una breve cuenta atrás, todos hacen clic lo más rápido posible — si pierdes una colisión te redirigen al azar, quizá directo a la trampa de otro.',
  'pyramid-draft': 'Solo la fila inferior de la pirámide de cartas está boca arriba — el resto permanece oculto. Una carta solo se revela cuando las dos que tiene justo debajo han sido elegidas. Se draftea por turnos que rotan cada ronda; al final de cada ronda, una carta boca arriba más se bloquea al azar.',
  'elixir-auction-2v2': 'Dos equipos, un pool de elixir compartido. Cada ronda ves una carta y le envías a tu compañero 2 de sus características — luego ambos pujáis a ciegas por la carta del otro par. La puja más alta se la lleva para su propio mazo.',
  'elixir-rush-2v2': 'Mercados separados, una barra de elixir compartida. Tú y tu compañero compráis de forma independiente del elixir del equipo — se recarga más rápido y tiene más capacidad que en solitario.',
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
export const modeImage = (id) => `/cr-modes/${id}.png`;

// Echte Gameplay-Screenshots (src/assets/clashRoyale/screenshots/<id>.webp) statt der
// gezeichneten Modus-Logos oben — zeigen, wie eine Runde tatsächlich aussieht, statt nur
// eines Icons. Lag vorher nur lokal in HeroCarousel.jsx; jetzt hier zentral, damit auch
// die Modus-Kachel im Hub/Modus-Wähler (ModeCard) und die Anleitung (ModeTutorialModal)
// denselben Screenshot zeigen, statt jede Stelle ihr eigenes import.meta.glob mitzuführen.
// Fehlt für einen Modus (noch) kein Screenshot, fällt modeCover() auf modeImage() zurück.
const SCREENSHOT_MODULES = import.meta.glob('../../assets/clashRoyale/screenshots/*.webp', { eager: true, import: 'default' });
const MODE_SCREENSHOTS = Object.fromEntries(
  Object.entries(SCREENSHOT_MODULES).map(([path, mod]) => [path.match(/([^/]+)\.webp$/)[1], mod])
);

/** Bevorzugt den echten Screenshot eines Modus, sonst dessen gezeichnetes Logo. */
export const modeCover = (id) => MODE_SCREENSHOTS[id] || modeImage(id);

const MODE_NAME_OVERRIDES = { en: MODE_NAME_EN, es: MODE_NAME_ES };
const MODE_DESC_OVERRIDES = { en: MODE_DESC_EN, es: MODE_DESC_ES };

export const modeNameFor = (id, lang) => {
  const m = modeInfo(id);
  return MODE_NAME_OVERRIDES[lang]?.[m.id] || m.name;
};

export const modeDescFor = (id, lang) => {
  const m = modeInfo(id);
  return MODE_DESC_OVERRIDES[lang]?.[m.id] || m.desc;
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
  'trap-setter': () => import('./modes/TrapSetter'),
  'pyramid-draft': () => import('./modes/PyramidDraft'),
  'elixir-auction-2v2': () => import('./modes/ElixirAuction2v2'),
  'elixir-rush-2v2': () => import('./modes/ElixirRush2v2'),
};

// Einstellungs-Presets: die konkreten Werte kommen vom Server (lobbyData.modePresets),
// hier stehen nur Beschriftung, Beschreibung und Symbol. So gibt es keine zweite Stelle,
// an der Zahlen gepflegt werden müssten.
export const PRESET_META = {
  suggested: {
    icon: Check,
    de: { label: 'Vorgeschlagen', desc: 'Ausbalancierte Werte, passend zur aktuellen Spielerzahl — guter Startpunkt für die erste Runde.' },
    en: { label: 'Suggested', desc: 'Balanced values, scaled to the current player count — a good starting point for a first round.' },
    es: { label: 'Sugerido', desc: 'Valores equilibrados, ajustados al número actual de jugadores — un buen punto de partida para la primera ronda.' },
  },
  fast: {
    icon: Zap,
    de: { label: 'Blitz', desc: 'Kurze Timer und schnellere Abläufe — für eine Runde zwischendurch.' },
    en: { label: 'Blitz', desc: 'Short timers and a faster pace — for a quick round.' },
    es: { label: 'Rápido', desc: 'Temporizadores cortos y un ritmo más rápido — para una ronda rápida.' },
  },
  chaos: {
    icon: AlertTriangle,
    de: { label: 'Chaos', desc: 'Bewusst überdreht: maximaler Druck, mehr Karten, alles gleichzeitig.' },
    en: { label: 'Chaos', desc: 'Deliberately over the top: maximum pressure, more cards, everything at once.' },
    es: { label: 'Caos', desc: 'Deliberadamente exagerado: presión máxima, más cartas, todo a la vez.' },
  },
};
