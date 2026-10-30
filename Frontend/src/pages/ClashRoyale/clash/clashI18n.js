// clashI18n.js — Texte für /clash (Hub) und die Kartenspiele, Deutsch + Englisch.
// Sprache: ?lang=en in der Adresse (wie die übrigen CR-Seiten), sonst die zuletzt gewählte (localStorage), sonst
// Browsersprache. Alle Seiten unter /clash teilen denselben Stand (useClashLang), damit der Wechsel zwischen Hub und
// Spielen die Sprache behält.
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'crq_lang';
const LANGS = ['de', 'en'];

function initial() {
  try {
    const url = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.includes(url)) return url;
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
    return /^de\b/i.test(navigator.language || 'de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

let current = typeof window === 'undefined' ? 'de' : initial();
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function useClashLang() {
  const lang = useSyncExternalStore(subscribe, () => current, () => 'de');
  const changeLang = useCallback((next) => {
    if (!LANGS.includes(next) || next === current) return;
    current = next;
    try {
      localStorage.setItem(KEY, next);
      const url = new URL(window.location.href);
      if (next === 'de') url.searchParams.delete('lang'); else url.searchParams.set('lang', next);
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    } catch { /* Komfort */ }
    listeners.forEach((fn) => fn());
  }, []);
  return { lang, t: DICT[lang] || DICT.de, changeLang };
}

/** [Deutsch, Englisch] → Text in der Sprache */
export const pick = (pair, lang) => (Array.isArray(pair) ? (lang === 'en' ? pair[1] : pair[0]) : pair);

const DE = {
  settings: 'Einstellungen',
  website: 'Website',
  clashRoyale: 'Clash Royale',
  crowns: (n) => `${n} von 3 Kronen`,
  daily: 'Tagesrunde',
  free: 'Freies Spiel',
  newRound: 'Neue Runde',
  nextDaily: 'Die nächste Tagesrunde gibt es morgen.',
  correct: 'Richtig!',
  wrong: 'Leider falsch.',
  notAffiliated: 'Diese Inhalte sind nicht mit Supercell verbunden und werden nicht von Supercell unterstützt oder gesponsert. Mehr dazu in',
  fanPolicy: 'Supercells Richtlinie für Fan-Inhalte',

  // Hub
  hubNew: 'Neu: Karten-Wordle und Viewer Games — das Chat-Quiz als OBS-Overlay für deinen Stream',
  hubMinigames: 'Deck Draft Minigames',
  hubMinigamesText: 'Zehn Draft-Modi für 2–8 Spieler — Lobby erstellen, Link teilen, losdraften.',
  play: 'Spielen',
  open: 'Öffnen',
  tournaments: 'Turniere', tournamentsText: 'Brackets mit Gruppenphase, Live-Stand und automatischem Spielstart.',
  nuzlocke: 'Nuzlocke', nuzlockeText: 'Die Challenge, bei der verlorene Karten für immer weg sind.',
  winTracker: 'Win Tracker', winTrackerText: 'OBS-Overlay mit Liga, Trophäen, Deck und den letzten Matches.',
  forStreamers: 'Für Streamer', forStreamersSub: 'OBS-Overlays für deinen Clash-Royale-Stream',
  cardGames: 'Kartenspiele', cardGamesSub: 'schnelle Runden mit allen Clash-Royale-Karten',
  solvedToday: 'Heute gelöst',
  guessTitle: 'Kartenraten', guessText: '24 Karten liegen vor dir, pro Runde kommt ein Hinweis. Klapp um, was es nicht sein kann — dann tippen.', guessTag: 'Allein · Tagesrunde',
  whoTitle: 'Wer bin ich?', whoText: 'Das Klappbrett-Spiel zu zweit: geheime Karte wählen, Ja/Nein-Fragen stellen, umklappen, raten.', whoTag: 'Zu zweit · per Link',
  statsTitle: 'Stats-Duell', statsText: 'Höher oder tiefer mit echten Kampfwerten: Leben, Schaden, DPS, Angriffstempo, Reichweite …', statsTag: 'Allein · Serie',
  zoomTitle: 'Zoom-Raten', zoomText: 'Ein winziger Ausschnitt, extrem nah herangezoomt. Alle zwei Versuche siehst du etwas mehr.', zoomTag: 'Allein · Tagesrunde',
  pixelTitle: 'Pixel-Raten', pixelText: 'Die ganze Karte — aber so verpixelt, dass man kaum etwas erkennt. Alle zwei Versuche wird sie schärfer.', pixelTag: 'Allein · Tagesrunde',

  // Karten-Wordle
  wordleTitle: 'Karten-Wordle', wordleText: 'Rate eine Karte — jede Eigenschaft zeigt dir, wie nah du dran bist. Elixier, Seltenheit, Tempo, Leben …', wordleTag: 'Allein · Tagesrunde',
  wordleHelp: 'Tippe eine beliebige Karte. Grün = stimmt, Rot = stimmt nicht, ▲▼ = die gesuchte Karte hat mehr bzw. weniger.',
  wordleWon: (c, n) => `Gesucht war ${c} — gefunden mit ${n} ${n === 1 ? 'Tipp' : 'Tipps'}.`,
  wordleTries: (n) => `${n} ${n === 1 ? 'Tipp' : 'Tipps'} bisher`,
  wordleCard: 'Karte', wordleHigher: 'höher', wordleLower: 'niedriger',
  wordleLegend: 'Tempo und Leben auf Turnierniveau (Level 11); „—“ = gibt es bei dieser Karte nicht (z. B. Zauber).',
  wordleSeo: 'Clashdle — das Wordle mit Clash-Royale-Karten: Rate die Karte des Tages, jede Eigenschaft zeigt dir, wie nah du dran bist.',

  // Viewer Games
  vgTitle: 'Viewer Games', vgText: 'Chat-Quiz für deinen Stream: Pixel- und Zoom-Raten als OBS-Overlay, dein Chat rät mit !tipp.', vgTag: 'Für Streamer · OBS',
  vgSeo: 'Chat-Quiz für Twitch: Clash-Royale-Karten verpixelt oder herangezoomt als OBS-Overlay, deine Zuschauer raten mit !tipp und sammeln Punkte.',
  vgIntro: 'Ein Chat-Quiz für deinen Stream: Das Overlay zeigt eine verpixelte oder stark herangezoomte Clash-Royale-Karte, die immer deutlicher wird. Deine Zuschauer raten im Twitch-Chat mit „!tipp Kartenname“ — wer zuerst trifft, bekommt Punkte.',
  vgLogin: 'Mit Twitch anmelden', vgLoadError: 'Konnte die Einstellungen nicht laden.', vgSaveError: 'Speichern fehlgeschlagen.',
  vgObs: 'OBS-Browserquelle',
  vgObsHelp: 'In OBS: Quelle hinzufügen → Browser → diesen Link einfügen, Größe 400 × 820. Den Link nicht im Stream zeigen. Solange die Quelle offen ist, liest der Bot deinen Chat mit.',
  vgChatOk: (l) => `Chat-Bot verbunden — liest in #${l} mit, sobald das Overlay läuft.`,
  vgChatOff: 'Chat-Bot gerade nicht verbunden — Tipps aus dem Chat kommen nicht an.',
  vgModes: 'Spielmodi', vgPixelText: 'Die ganze Karte, extrem verpixelt.', vgZoomText: 'Ein winziger Ausschnitt, extrem nah herangezoomt.',
  vgBothModes: 'Beide aktiv: Der Modus wechselt zufällig von Runde zu Runde.',
  vgFlow: 'Ablauf', vgAdvance: 'Bild wird deutlicher …', vgByTime: 'Nach Zeit', vgByGuesses: 'Nach Fehltipps',
  vgAdvanceTime: 'Alle paar Sekunden eine Stufe deutlicher — mit Zeitbalken im Overlay.',
  vgAdvanceGuesses: 'Nach einer Anzahl falscher Tipps aus dem Chat eine Stufe deutlicher.',
  vgStageSeconds: 'Sekunden pro Stufe', vgGuessesPerStage: 'Falsche Tipps pro Stufe',
  vgFinalSeconds: 'Letzte Stufe', vgFinalNote: 'So lange bleibt die schärfste Stufe stehen, bevor aufgelöst wird.',
  vgPause: 'Pause zwischen Runden',
  vgDisplay: 'Anzeige & Chat', vgAnnounce: 'Gewinner im Chat ansagen', vgAnnounceNote: 'Der Bot schreibt, wer die Karte erraten hat und wie viele Punkte es gab.',
  vgLeaderboard: 'Bestenliste im Overlay', vgLanguage: 'Sprache von Overlay und Chat-Ansage',
  vgNext: 'Neue Runde', vgReset: 'Bestenliste zurücksetzen', vgResetConfirm: 'Alle Punkte deiner Zuschauer löschen?',
  vgNewKey: 'Neuer Link', vgNewKeyConfirm: 'Neuen Overlay-Link erzeugen? Der alte funktioniert danach nicht mehr — in OBS neu eintragen.',
  vgSaved: 'Gespeichert', vgPreview: 'Live-Vorschau', vgPreviewNote: 'Zeigt dieselbe Runde wie deine OBS-Quelle. Solange diese Seite offen ist, liest der Bot ebenfalls mit — so kannst du es ausprobieren.',

  // Zoom-/Pixel-Raten
  imageAlt: 'Verdecktes Kartenbild',
  stage: (a, b) => `Stufe ${a}/${b}`,
  solvedAt: (s, n) => ` — erkannt auf Stufe ${s}, Versuch ${n}.`,
  zoomHelp: 'Welche Karte steckt hinter diesem Ausschnitt? Tippe den Namen. Alle zwei Fehlversuche zoomt das Bild ein Stück heraus.',
  pixelHelp: 'Welche Karte ist das? Tippe den Namen. Alle zwei Fehlversuche wird das Bild schärfer.',
  triesLeft: (n) => `${n} Versuche übrig`,
  clearerIn: (n) => (n === 1 ? 'Nach dem nächsten Versuch deutlicher' : `In ${n} Versuchen deutlicher`),
  typeName: 'Kartenname eingeben (englisch) …',
  skip: 'Überspringen — deutlicher zeigen',
  zoomSeo: 'Erkennst du die Clash-Royale-Karte an einem winzigen, stark vergrößerten Ausschnitt? Alle zwei Versuche zoomt das Bild heraus. Jeden Tag eine neue Karte.',
  pixelSeo: 'Erkennst du die Clash-Royale-Karte, obwohl sie extrem verpixelt ist? Alle zwei Versuche wird sie schärfer. Jeden Tag eine neue Karte.',

  // Kartenraten
  hints: 'Hinweise',
  nextHint: 'Nächster Hinweis', noMoreHints: 'Keine Hinweise mehr',
  guess: 'Tippen', tapCard: 'Karte antippen …', sure: (n) => `${n} — sicher?`, cancel: 'Doch nicht',
  guessHelp: 'Klick auf eine Karte klappt sie um. Du hast nur einen Tipp — je weniger Hinweise, desto mehr Kronen.',
  wasSecret: (n) => `Gesucht war ${n}`,
  foundAfter: (n) => ` — gefunden nach ${n} ${n === 1 ? 'Hinweis' : 'Hinweisen'}.`,
  cardsOpen: (n) => `${n} Karten offen`,
  guessMode: 'Tipp-Modus: Welche Karte ist es?',
  guessSeo: 'Vor dir liegen 24 Clash-Royale-Karten. Pro Runde ein Hinweis — klapp aus, was es nicht sein kann, und tippe die gesuchte Karte. Jeden Tag eine neue Runde.',

  // Stats-Duell
  streak: 'Serie', best: 'Bestwert',
  missed: 'Daneben!', yourStreak: (n) => `Deine Serie: ${n}`, newBest: ' — neuer Bestwert!', again: 'Nochmal',
  duelQuestion: (r, stat, more, less, l) => [`Ist `, r, ` bei `, stat, ` ${more} oder ${less} als `, l, `?`],
  statsSource: (d) => `Werte auf Turnierniveau (Level 11) aus dem Clash-Royale-Wiki · abgerufen ${d}`,
  lastChange: (d) => `zuletzt geändert ${d}`,
  valueOf: 'Wert von',
  statsSeo: 'Höher oder tiefer mit den echten Kampfwerten aller Clash-Royale-Karten: Leben, Schaden, DPS, Angriffstempo, Tempo und Reichweite auf Turnierniveau.',

  // Wer bin ich?
  whoIntro: 'Das Klappbrett-Spiel zu zweit. Phase 1: Jeder bekommt eigene Karten und wählt geheim eine davon. Phase 2: Du bekommst die Karten deines Gegners vor dich — stellt abwechselnd Ja/Nein-Fragen (hier im Chat oder per Voice) und klappt um, was es nicht mehr sein kann. Wer zuerst die Karte des anderen errät, gewinnt. Falsch geraten heißt verloren.',
  yourName: 'Dein Name', name: 'Name',
  createRoom: 'Raum erstellen', join: 'Beitreten', code: 'CODE', roomCode: 'Raumcode',
  roomFull: 'Der Raum ist voll.', roomNotFound: 'Raum nicht gefunden.', newRoom: 'Neuen Raum erstellen',
  whatsYourName: 'Wie heißt du?', connecting: 'Verbinde …',
  you: 'du', waitingSlot: 'Wartet …', shareLink: 'Link teilen', disconnected: 'getrennt', picking: 'wählt …', picked: 'hat gewählt',
  openCards: (n) => `${n} Karten offen`, onTurn: 'am Zug',
  waitOpponent: 'Warte auf deinen Gegner', sendLink: (c) => ['Schick ihm diesen Link oder den Code ', c, ':'],
  copy: 'Link kopieren', copied: 'Kopiert',
  gridSize: 'Kartenraster', gridHostOnly: 'Nur der Raumersteller kann das Raster ändern.',
  phase1: 'Phase 1 — wähle deine geheime Karte', take: (n) => `${n} nehmen`, waitPick: (n) => `Gewählt — warte auf ${n} …`,
  phase2: (n) => `Phase 2 — das sind die Karten von ${n}. Welche hat ${n} gewählt?`,
  whichCard: (n) => `Welche Karte hat ${n}?`,
  won: 'Gewonnen!', lost: 'Verloren.', hadCard: (n, c) => `${n} hatte ${c}.`,
  yourCard: 'Deine Karte', endTurn: 'Zug beenden', guessBtn: 'Raten', theirTurn: (n) => `${n} ist am Zug.`,
  flipHelp: 'Klick auf eine Karte klappt sie um — das siehst nur du.',
  rematch: 'Revanche', waitRematch: 'Warte auf Revanche …',
  chat: 'Chat', yes: 'Ja', no: 'Nein', suggestions: 'Frage-Vorschläge', askPh: 'Frage stellen …', msgPh: 'Nachricht …', send: 'Senden',
  qHint: (n) => `Endet deine Nachricht mit „?“, kann ${n} mit Ja/Nein antworten.`,
  opponent: 'dein Gegner', player: 'Spieler',
  sys: {
    newRound: 'Neue Runde — wählt eure geheime Karte.',
    waiting: 'Warte auf den zweiten Spieler.',
    joined: (n) => `${n} ist da — wählt eure geheime Karte.`,
    left: (n) => `${n || 'Ein Spieler'} hat den Raum verlassen.`,
    start: (n) => `Los geht's — ${n} fragt zuerst.`,
    turn: (n) => `${n} ist dran.`,
    right: (n) => `${n} hat richtig geraten!`,
    wrongGuess: (n) => `${n} hat falsch geraten.`,
    grid: (n) => `Neues Raster: ${n} Karten.`,
  },
  whoSeo: 'Das Klappbrett-Spiel mit Clash-Royale-Karten: wähle geheim eine Karte, stellt euch abwechselnd Ja/Nein-Fragen und klappt um, bis einer richtig rät. Link teilen und los.',
};

const EN = {
  settings: 'Settings',
  website: 'Website',
  clashRoyale: 'Clash Royale',
  crowns: (n) => `${n} of 3 crowns`,
  daily: 'Daily round',
  free: 'Free play',
  newRound: 'New round',
  nextDaily: 'The next daily round arrives tomorrow.',
  correct: 'Correct!',
  wrong: 'Wrong guess.',
  notAffiliated: 'This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. For more information see',
  fanPolicy: "Supercell's Fan Content Policy",

  hubNew: 'New: Card Wordle and Viewer Games — the chat quiz as an OBS overlay for your stream',
  hubMinigames: 'Deck Draft Minigames',
  hubMinigamesText: 'Ten draft modes for 2–8 players — create a lobby, share the link, start drafting.',
  play: 'Play',
  open: 'Open',
  tournaments: 'Tournaments', tournamentsText: 'Brackets with group stage, live standings and automatic match start.',
  nuzlocke: 'Nuzlocke', nuzlockeText: 'The challenge where lost cards are gone for good.',
  winTracker: 'Win Tracker', winTrackerText: 'OBS overlay with league, trophies, deck and your latest matches.',
  forStreamers: 'For streamers', forStreamersSub: 'OBS overlays for your Clash Royale stream',
  cardGames: 'Card games', cardGamesSub: 'quick rounds with every Clash Royale card',
  solvedToday: 'Solved today',
  guessTitle: 'Card Guess', guessText: '24 cards in front of you, one clue per round. Flip down what it can’t be — then make your guess.', guessTag: 'Solo · daily round',
  whoTitle: 'Guess Who?', whoText: 'The classic flip-board game for two: pick a secret card, ask yes/no questions, flip, guess.', whoTag: 'Two players · via link',
  statsTitle: 'Stats Duel', statsText: 'Higher or lower with real battle stats: hitpoints, damage, DPS, hit speed, range …', statsTag: 'Solo · streak',
  zoomTitle: 'Zoom Guess', zoomText: 'A tiny detail, zoomed in extremely close. Every two guesses you see a bit more.', zoomTag: 'Solo · daily round',
  pixelTitle: 'Pixel Guess', pixelText: 'The whole card — but so pixelated you can barely tell. Every two guesses it gets sharper.', pixelTag: 'Solo · daily round',

  wordleTitle: 'Card Wordle', wordleText: 'Guess a card — every attribute tells you how close you are. Elixir, rarity, speed, hitpoints …', wordleTag: 'Solo · daily round',
  wordleHelp: 'Type any card. Green = match, red = no match, ▲▼ = the secret card has more or less.',
  wordleWon: (c, n) => `The card was ${c} — found in ${n} ${n === 1 ? 'guess' : 'guesses'}.`,
  wordleTries: (n) => `${n} ${n === 1 ? 'guess' : 'guesses'} so far`,
  wordleCard: 'Card', wordleHigher: 'higher', wordleLower: 'lower',
  wordleLegend: 'Speed and hitpoints at tournament standard (level 11); “—” = not applicable for this card (e.g. spells).',
  wordleSeo: 'Clashdle — Wordle with Clash Royale cards: guess the card of the day, every attribute tells you how close you are.',

  vgTitle: 'Viewer Games', vgText: 'A chat quiz for your stream: Pixel and Zoom Guess as an OBS overlay, your chat guesses with !tipp.', vgTag: 'For streamers · OBS',
  vgSeo: 'Chat quiz for Twitch: pixelated or zoomed-in Clash Royale cards as an OBS overlay, your viewers guess with !tipp and collect points.',
  vgIntro: 'A chat quiz for your stream: the overlay shows a pixelated or heavily zoomed-in Clash Royale card that gets clearer over time. Your viewers guess in Twitch chat with “!tipp card name” (or !guess) — first correct guess scores points.',
  vgLogin: 'Log in with Twitch', vgLoadError: 'Could not load your settings.', vgSaveError: 'Saving failed.',
  vgObs: 'OBS browser source',
  vgObsHelp: 'In OBS: add source → Browser → paste this link, size 400 × 820. Don’t show the link on stream. While the source is open, the bot reads your chat.',
  vgChatOk: (l) => `Chat bot connected — reads #${l} as soon as the overlay is running.`,
  vgChatOff: 'Chat bot is not connected right now — guesses from chat won’t arrive.',
  vgModes: 'Game modes', vgPixelText: 'The whole card, extremely pixelated.', vgZoomText: 'A tiny detail, zoomed in extremely close.',
  vgBothModes: 'Both active: the mode switches randomly from round to round.',
  vgFlow: 'Flow', vgAdvance: 'Image gets clearer …', vgByTime: 'Over time', vgByGuesses: 'After wrong guesses',
  vgAdvanceTime: 'One stage clearer every few seconds — with a time bar in the overlay.',
  vgAdvanceGuesses: 'One stage clearer after a number of wrong guesses from chat.',
  vgStageSeconds: 'Seconds per stage', vgGuessesPerStage: 'Wrong guesses per stage',
  vgFinalSeconds: 'Final stage', vgFinalNote: 'How long the sharpest stage stays up before the answer is revealed.',
  vgPause: 'Pause between rounds',
  vgDisplay: 'Display & chat', vgAnnounce: 'Announce winner in chat', vgAnnounceNote: 'The bot posts who guessed the card and how many points they got.',
  vgLeaderboard: 'Leaderboard in overlay', vgLanguage: 'Overlay and chat language',
  vgNext: 'New round', vgReset: 'Reset leaderboard', vgResetConfirm: 'Delete all of your viewers’ points?',
  vgNewKey: 'New link', vgNewKeyConfirm: 'Create a new overlay link? The old one stops working — update it in OBS.',
  vgSaved: 'Saved', vgPreview: 'Live preview', vgPreviewNote: 'Shows the same round as your OBS source. While this page is open, the bot reads your chat too — so you can try it out.',

  imageAlt: 'Hidden card image',
  stage: (a, b) => `Stage ${a}/${b}`,
  solvedAt: (s, n) => ` — spotted at stage ${s}, guess ${n}.`,
  zoomHelp: 'Which card hides behind this detail? Type its name. Every two wrong guesses the image zooms out a bit.',
  pixelHelp: 'Which card is this? Type its name. Every two wrong guesses the image gets sharper.',
  triesLeft: (n) => `${n} guesses left`,
  clearerIn: (n) => (n === 1 ? 'Clearer after your next guess' : `Clearer in ${n} guesses`),
  typeName: 'Type a card name …',
  skip: 'Skip — show more',
  zoomSeo: 'Can you recognise the Clash Royale card from a tiny, extremely zoomed-in detail? Every two guesses the image zooms out. A new card every day.',
  pixelSeo: 'Can you recognise the Clash Royale card even though it is extremely pixelated? Every two guesses it gets sharper. A new card every day.',

  hints: 'Clues',
  nextHint: 'Next clue', noMoreHints: 'No more clues',
  guess: 'Guess', tapCard: 'Tap a card …', sure: (n) => `${n} — sure?`, cancel: 'Never mind',
  guessHelp: 'Click a card to flip it down. You only get one guess — fewer clues means more crowns.',
  wasSecret: (n) => `The card was ${n}`,
  foundAfter: (n) => ` — found after ${n} ${n === 1 ? 'clue' : 'clues'}.`,
  cardsOpen: (n) => `${n} cards up`,
  guessMode: 'Guess mode: which card is it?',
  guessSeo: '24 Clash Royale cards in front of you. One clue per round — flip down what it can’t be and guess the card. A new round every day.',

  streak: 'Streak', best: 'Best',
  missed: 'Missed!', yourStreak: (n) => `Your streak: ${n}`, newBest: ' — new best!', again: 'Play again',
  duelQuestion: (r, stat, more, less, l) => [`Does `, r, ` have ${more} or ${less} `, stat, ` than `, l, `?`],
  statsSource: (d) => `Tournament-standard stats (level 11) from the Clash Royale Wiki · fetched ${d}`,
  lastChange: (d) => `last changed ${d}`,
  valueOf: 'Value of',
  statsSeo: 'Higher or lower with the real battle stats of every Clash Royale card: hitpoints, damage, DPS, hit speed, movement speed and range at tournament standard.',

  whoIntro: 'The classic flip-board game for two. Phase 1: each of you gets your own cards and secretly picks one. Phase 2: you get your opponent’s cards — take turns asking yes/no questions (in the chat here or on voice) and flip down what it can’t be. First to guess the other’s card wins. A wrong guess loses.',
  yourName: 'Your name', name: 'Name',
  createRoom: 'Create room', join: 'Join', code: 'CODE', roomCode: 'Room code',
  roomFull: 'This room is full.', roomNotFound: 'Room not found.', newRoom: 'Create a new room',
  whatsYourName: 'What’s your name?', connecting: 'Connecting …',
  you: 'you', waitingSlot: 'Waiting …', shareLink: 'Share the link', disconnected: 'disconnected', picking: 'picking …', picked: 'has picked',
  openCards: (n) => `${n} cards up`, onTurn: 'turn',
  waitOpponent: 'Waiting for your opponent', sendLink: (c) => ['Send them this link or the code ', c, ':'],
  copy: 'Copy link', copied: 'Copied',
  gridSize: 'Card grid', gridHostOnly: 'Only the room creator can change the grid.',
  phase1: 'Phase 1 — pick your secret card', take: (n) => `Take ${n}`, waitPick: (n) => `Picked — waiting for ${n} …`,
  phase2: (n) => `Phase 2 — these are ${n}’s cards. Which one did ${n} pick?`,
  whichCard: (n) => `Which card does ${n} have?`,
  won: 'You won!', lost: 'You lost.', hadCard: (n, c) => `${n} had ${c}.`,
  yourCard: 'Your card', endTurn: 'End turn', guessBtn: 'Guess', theirTurn: (n) => `${n}’s turn.`,
  flipHelp: 'Click a card to flip it down — only you see this.',
  rematch: 'Rematch', waitRematch: 'Waiting for rematch …',
  chat: 'Chat', yes: 'Yes', no: 'No', suggestions: 'Question ideas', askPh: 'Ask a question …', msgPh: 'Message …', send: 'Send',
  qHint: (n) => `End your message with “?” and ${n} can answer yes or no.`,
  opponent: 'your opponent', player: 'Player',
  sys: {
    newRound: 'New round — pick your secret cards.',
    waiting: 'Waiting for the second player.',
    joined: (n) => `${n} is here — pick your secret cards.`,
    left: (n) => `${n || 'A player'} left the room.`,
    start: (n) => `Let's go — ${n} asks first.`,
    turn: (n) => `${n}’s turn.`,
    right: (n) => `${n} guessed right!`,
    wrongGuess: (n) => `${n} guessed wrong.`,
    grid: (n) => `New grid: ${n} cards.`,
  },
  whoSeo: 'The flip-board guessing game with Clash Royale cards: secretly pick a card, take turns asking yes/no questions and flip until someone guesses right. Share the link and play.',
};

const DICT = { de: DE, en: EN };
