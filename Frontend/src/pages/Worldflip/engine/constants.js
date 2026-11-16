// engine/constants.js — feste Werte von Worldflip: Welten mit ihren Gesetzen, Weltereignisse, Kartenarten, Regeln,
// Dauer der Animationen.
//
// Die Engine ist die einzige Quelle der Regeln. Sie läuft im Browser (Spiel gegen Bots) und als Spiegel auf dem
// Server (Online-Räume, Backend/worldflip/shared — erzeugt mit Backend/worldflip/tools/spiegel.js).

/**
 * Die vier Welten = die vier Kartenfarben. Reihenfolge = Platz auf der Welten-Trommel (je 90° weiter).
 * law/lawText: das Gesetz, das gilt, solange diese Welt unten liegt (umgesetzt in game.js).
 */
export const WORLDS = [
  { id: 'vulkan', name: 'Vulkan', color: '#f0562b', deep: '#8f2410', dark: '#3d1009', sky: '#4a1c12', law: 'Hitze', lawText: 'Wer zieht, zieht 2 Karten.' },
  { id: 'ozean', name: 'Ozean', color: '#2b93f0', deep: '#12508f', dark: '#092544', sky: '#0d4263', law: 'Strömung', lawText: 'Nach einer Zahl darfst du gleiche Zahlen nachlegen.' },
  { id: 'dschungel', name: 'Dschungel', color: '#3dbb4f', deep: '#1c6b2a', dark: '#0c3314', sky: '#234f27', law: 'Wildwuchs', lawText: 'Jede Karte lädt die Welt doppelt auf.' },
  { id: 'kosmos', name: 'Kosmos', color: '#9b62f2', deep: '#4b2a94', dark: '#1e1045', sky: '#16103a', law: 'Wurmlöcher', lawText: 'Eine 0 reicht alle Hände in Spielrichtung weiter. Mit einer 7 tauschst du die Hand mit einem Spieler deiner Wahl.' },
];

/**
 * Weltereignisse: Ist eine Welt voll geladen, bricht sie aus und löst ihr nächstes Ereignis aus (vorher sichtbar).
 * „Gegner" = alle anderen, im 2 gegen 2 nur das andere Team.
 */
export const EVENTS = {
  ausbruch: { world: 0, name: 'Ausbruch', text: 'Alle Gegner ziehen 1 Karte.' },
  lavabombe: { world: 0, name: 'Lavabombe', text: 'Ein zufälliger Gegner zieht 3 Karten.' },
  glutwind: { world: 0, name: 'Glutwind', text: 'Wer auslöst, verbrennt eine zufällige eigene Karte.' },
  flut: { world: 1, name: 'Flut', text: 'Alle Hände wandern einen Platz weiter.' },
  strudel: { world: 1, name: 'Strudel', text: 'Alle Karten werden gemischt und gleichmäßig neu verteilt.' },
  ebbe: { world: 1, name: 'Ebbe', text: 'Jeder verliert eine zufällige Karte.' },
  wuchern: { world: 2, name: 'Wuchern', text: 'Wer die wenigsten Karten hat, zieht 2.' },
  fesseln: { world: 2, name: 'Fesseln', text: 'Wer die wenigsten Karten hat, setzt einmal aus.' },
  fruchtregen: { world: 2, name: 'Fruchtregen', text: 'Wer die meisten Karten hat, wirft 2 ab.' },
  loch: { world: 3, name: 'Schwarzes Loch', text: 'Wer 3 oder mehr Karten hat, verliert eine.' },
  zeitschleife: { world: 3, name: 'Zeitschleife', text: 'Wer auslöst, ist gleich noch einmal dran.' },
  konjunktion: { world: 3, name: 'Konjunktion', text: 'Alle anderen Welten laden sich um 2 auf. Was voll wird, bricht sofort aus.' },
};
export const EVENTS_BY_WORLD = [0, 1, 2, 3].map((w) => Object.keys(EVENTS).filter((id) => EVENTS[id].world === w));

/**
 * Kartenarten. world: Welt, zu der die Karte gehört (null = gibt es in jeder Welt, -1 = passt immer, Welt wird gewählt).
 * target: der Spieler wählt einen Mitspieler. plus: so viele Karten lässt die Karte ziehen (steht als Marke auf der Karte).
 * copies: so oft liegt eine weltgebundene Karte im Stapel (sonst 2); Karten, die immer passen, zählt buildDeck selbst ab.
 * attack: Angriff auf genau einen Spieler — der darf mit einem Spiegel antworten (game.js: react).
 */
export const KINDS = {
  n: { name: 'Zahl', world: null, text: '' },
  kipp: { name: 'Wirbel', world: null, text: 'Der Tisch wirbelt herum: Die Spielrichtung dreht sich.' },
  sturm: { name: 'Sturm', world: null, attack: true, text: 'Der Nächste wird weggeweht und setzt aus.' },
  hagel: { name: 'Hagel', world: null, attack: true, plus: 2, text: 'Der Nächste zieht 2 Karten — oder legt selbst einen Hagel drauf und reicht alles weiter.' },
  meteor: { name: 'Meteor', world: 0, attack: true, plus: 3, text: 'Der Nächste zieht 3 Karten und setzt aus.' },
  walze: { name: 'Feuerwalze', world: 0, plus: 1, text: 'Alle Gegner ziehen 1 Karte.' },
  brandopfer: { name: 'Brandopfer', world: 0, text: 'Du verbrennst eine zufällige eigene Karte.' },
  frost: { name: 'Frost', world: 1, attack: true, target: true, text: 'Friert einen Spieler ein: Er setzt seinen nächsten Zug aus.' },
  welle: { name: 'Welle', world: 1, text: 'Du bist gleich noch einmal dran.' },
  flaschenpost: { name: 'Flaschenpost', world: 1, attack: true, target: true, text: 'Du siehst kurz die Karten eines Spielers deiner Wahl.' },
  schild: { name: 'Dornenschild', world: 2, text: 'Schützt dich vor dem nächsten Angriff oder Weltereignis.' },
  saat: { name: 'Saat', world: 2, attack: true, target: true, text: 'Ein Spieler bekommt eine zufällige Karte aus deiner Hand.' },
  echo: { name: 'Echo', world: 2, text: 'Wiederholt die zuletzt gelegte Effektkarte.' },
  strahl: { name: 'Strahl', world: 3, attack: true, target: true, plus: 2, text: 'Ein Spieler deiner Wahl zieht 2 Karten.' },
  supernova: { name: 'Supernova', world: 3, copies: 3, text: 'Alle anderen Welten laden sich um 1 auf. Was voll wird, bricht sofort aus.' },
  nebel: { name: 'Nebel', world: 3, text: 'Verbirgt 5 Züge lang, wie viele Karten du hältst — oder bis du nur noch eine hast.' },
  portal: { name: 'Portal', world: -1, text: 'Passt immer. Du bestimmst die nächste Welt.' },
  finsternis: { name: 'Finsternis', world: -1, text: 'Passt immer. Deine Gegner spielen eine Runde blind.' },
  zuender: { name: 'Zünder', world: -1, text: 'Passt immer. Die gewählte Welt bricht sofort aus.' },
  spiegel: { name: 'Spiegel', world: -1, text: 'Passt immer. Als Antwort auf einen Angriff gegen dich wirft er ihn auf den zurück, der ihn gelegt hat.' },
};

export const RULES = {
  CHARGE_MAX: 4, // so viel Ladung, dann bricht die Welt aus (bleibt beim Weltwechsel erhalten)
  HAND_SIZES: [5, 7, 10],
  DEFAULT_HAND: 7,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  NUMBERS: 7, // Zahlen 1–7, je zweimal pro Welt; dazu eine 0 je Welt
  HAGEL_PER_WORLD: 2,
  TURN_SECONDS: [20, 40, 60], // nur online
  DEFAULT_TURN_SECONDS: 40,
  FOG_TURNS: 5, // so viele eigene Züge hält der Nebel
  REACT_SECONDS: 12, // so lange darf man online auf einen Angriff antworten (höchstens die Zugzeit)
};

/** 2 gegen 2: Partner sitzen sich gegenüber (Plätze 0 + 2 gegen 1 + 3). */
export const TEAMS = [
  { name: 'Team Gold', color: '#ffcf3f' },
  { name: 'Team Türkis', color: '#45d6e6' },
];

/**
 * Dauer je Ereignis in Millisekunden. Der Browser spielt die Ereignisse genau so lange ab (scene/tableScene.js),
 * der Server wartet so lange, bevor ein Bot zieht oder die Zugzeit läuft (durationOf in game.js).
 */
export const ANIM = {
  play: 1000, // Zahlenkarte
  playFx: 2600, // Effektkarte: wird groß gezeigt, bevor sie auf die Ablage fällt
  draw: 850,
  misplay: 1700,
  world: 2100,
  flip: 2200,
  skip: 2300,
  hagel: 2900,
  meteor: 3300,
  walze: 2000,
  frost: 2600,
  again: 1200,
  shield: 1300,
  gift: 2400,
  swap: 2600,
  beam: 2900,
  block: 1200,
  ask: 300, // jemand darf antworten (Spiegel, Hagel drauflegen)
  reflect: 2300, // Spiegel wird gezeigt und wirft den Angriff zurück
  sitout: 900,
  burn: 1800,
  peek: 2600,
  nova: 2200,
  fog: 1600,
  unfog: 1000,
  rotate: 2600,
  thaw: 1200,
  combo: 300,
  erupt: 3800,
  dark: 1500,
  light: 900,
  reshuffle: 600,
  turn: 450,
  win: 800,
};
