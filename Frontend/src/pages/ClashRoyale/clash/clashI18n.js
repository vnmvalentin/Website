// clashI18n.js — Texte für /clash (Hub) und die Kartenspiele, Deutsch + Englisch.
// Sprache: die eine Sprachwahl der Website (i18n/language.js) — ?lang=en in der Adresse gilt für den Besuch, sonst
// die zuletzt gewählte (siteLang), sonst Deutsch. Seit Nov. 2026 ohne Erkennung über die Browsersprache: der
// Google-Crawler meldet Englisch und hätte die vorgerenderten deutschen Seiten sonst englisch gerendert.
// Hub, Kartenspiele und Stats teilen den Stand mit jedem anderen übersetzten Bereich der Website.
import { useEffect } from 'react';
import { setLanguage, useLanguage } from '../../../i18n/language';

const LANGS = ['de', 'en'];

// Früher merkten sich die CR-Seiten ihre Sprache selbst (crq_lang). Die Wahl gilt beim ersten Besuch einer CR-Seite
// einmal als gemeinsame Wahl — aber nur, wenn es noch keine gibt, und erst HIER, nicht beim Laden der ganzen Website:
// sonst stellte eine alte CR-Wahl die Win Challenge (samt ihrer Chat-Antworten) um, ohne dass man CR je wieder öffnet.
const OLD_KEY = 'crq_lang';
let adopted = false;
function adoptOldChoice() {
  if (adopted || typeof window === 'undefined') return;
  adopted = true;
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old === null) return;
    localStorage.removeItem(OLD_KEY);
    if (!LANGS.includes(old) || localStorage.getItem('siteLang')) return;
    // Eine ?lang-Angabe gilt für diesen Besuch weiter; die alte Wahl wird dann nur gemerkt
    if (new URLSearchParams(window.location.search).has('lang')) localStorage.setItem('siteLang', old);
    else setLanguage(old);
  } catch { /* gesperrter Speicher: dann ohne Übernahme */ }
}

export function useClashLang() {
  // syncUrl: die englische Fassung steht immer mit ?lang=en in der Adresse (eigene Adresse für Suchmaschinen, Links)
  const { lang, setLang } = useLanguage({ supported: LANGS, syncUrl: true });
  useEffect(adoptOldChoice, []);
  return { lang, t: DICT[lang] || DICT.de, changeLang: setLang };
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
  hubNew: 'Neu: Spieler-Stats, Clans, Ranglisten mit Decks und die Decks der Besten',
  hubMinigames: 'Deck Draft Minigames',
  tabStats: 'Stats', tabStatsSub: 'Spieler, Clans, Ranglisten, Decks und Karten — live aus dem Spiel',
  statsPlayers: 'Spieler & Clans', statsPlayersText: 'Profil mit Ranked-Deck, allen Kämpfen, Sammlung mit Aufwert-Rechner und Abzeichen.',
  tabMinigames: 'Minigames', tabMinigamesSub: 'mit Freunden draften oder die Nuzlocke-Challenge wagen',
  hubMinigamesText: 'Zehn Draft-Modi für 2–8 Spieler — Lobby erstellen, Link teilen, losdraften.',
  play: 'Spielen',
  nextUp: 'Als Nächstes',
  open: 'Öffnen',
  tournaments: 'Turniere', tournamentsText: 'Brackets mit Gruppenphase, Live-Stand und automatischem Spielstart.',
  nuzlocke: 'Nuzlocke', nuzlockeText: 'Die Challenge, bei der verlorene Karten für immer weg sind.',
  winTracker: 'Win Tracker', winTrackerText: 'OBS-Overlay mit Liga, Trophäen, Deck und den letzten Matches.',
  forStreamers: 'Für Streamer', forStreamersSub: 'OBS-Overlays für deinen Clash-Royale-Stream',
  cardGames: 'Kartenspiele', cardGamesSub: 'schnelle Runden mit allen Clash-Royale-Karten',
  solvedToday: 'Heute gelöst',
  // Tagesrunde aller Ratespiele (HeutePage.jsx)
  heuteTitle: 'Tagesrunde', heuteSub: 'Alle fünf Ratespiele, einmal am Tag — für alle dieselben Karten.',
  heuteSeo: 'Die tägliche Clash-Royale-Raterunde: Karten-Wordle, Kartenraten, Zoom-, Pixel- und Farb-Raten mit gemeinsamem Punktestand, Serie und Bestenliste.',
  heuteTotal: 'Punkte heute', heuteOf: (n) => `${n} von 5 gespielt`, heuteOpen: 'Offen',
  heuteStreak: (n) => `Serie ${n}`, heuteStreakNote: (best) => `Tage in Folge mit allen fünf Spielen · beste ${best}`,
  heuteShare: 'Ergebnis kopieren', heuteCopied: 'Kopiert', heuteShareHeading: 'Clash Royale – Tagesrunde', heuteTotalShort: 'Gesamt',
  heuteBoard: 'Bestenliste heute', heuteBoardPlayers: (n) => `${n} dabei`, heuteBoardEmpty: 'Noch steht niemand in der Liste.',
  heuteBoardDown: 'Die Bestenliste ist gerade nicht erreichbar.', heuteLogin: 'Mit Twitch anmelden, um in die Bestenliste zu kommen.',
  heuteLoginBtn: 'Mit Twitch anmelden', heuteYou: 'Du', heuteRank: (n) => `Platz ${n}`, heuteGames: (n) => `${n}/5`,
  heuteAllDone: 'Alle fünf geschafft — morgen gibt es neue Karten.', heuteFirstOnly: 'Es zählt das erste Ergebnis des Tages.',
  heuteTileText: 'Alle fünf Ratespiele des Tages in einer Runde — mit Punkten, Serie und Bestenliste.', heuteTileTag: (n) => `${n}/5 heute`,
  heuteDoneTitle: 'Tagesrunde geschafft', heuteDoneText: 'Alle fünf gespielt — sieh dir Ergebnis und Bestenliste an.', heuteResult: 'Zum Ergebnis',
  guessTitle: 'Kartenraten', guessText: '24 Karten liegen vor dir, pro Runde kommt ein Hinweis. Klapp um, was es nicht sein kann — dann tippen.', guessTag: 'Allein · Tagesrunde',
  whoTitle: 'Wer bin ich?', whoText: 'Das Klappbrett-Spiel zu zweit: geheime Karte wählen, Ja/Nein-Fragen stellen, umklappen, raten.', whoTag: 'Zu zweit · per Link',
  statsTitle: 'Stats-Duell', statsText: 'Höher oder tiefer mit echten Kampfwerten: Leben, Schaden, DPS, Angriffstempo, Reichweite …', statsTag: 'Allein · Serie',
  zoomTitle: 'Zoom-Raten', zoomText: 'Ein winziger Ausschnitt, extrem nah herangezoomt. Alle zwei Versuche siehst du etwas mehr.', zoomTag: 'Allein · Tagesrunde',
  pixelTitle: 'Pixel-Raten', pixelText: 'Die ganze Karte — aber so verpixelt, dass man kaum etwas erkennt. Alle zwei Versuche wird sie schärfer.', pixelTag: 'Allein · Tagesrunde',
  colorTitle: 'Farb-Raten', colorText: 'Der Karte fehlt eine Farbe. Misch sie mit drei Reglern aus dem Gedächtnis nach — die Karte färbt sich live mit.', colorTag: 'Allein · Tagesrunde',

  // Karten-Wordle
  wordleTitle: 'Karten-Wordle', wordleText: 'Rate eine Karte — jede Eigenschaft zeigt dir, wie nah du dran bist. Elixier, Seltenheit, Leben, Schaden, Erscheinungsjahr …', wordleTag: 'Allein · Tagesrunde',
  wordleHelp: 'Tippe eine beliebige Karte. Grün = stimmt, Orange = knapp daneben, Rot = daneben, ▲▼ = die gesuchte Karte hat mehr bzw. weniger.',
  wordleWon: (c, n) => `Gesucht war ${c} — gefunden mit ${n} ${n === 1 ? 'Tipp' : 'Tipps'}.`,
  wordleTries: (n) => `${n} ${n === 1 ? 'Tipp' : 'Tipps'} bisher`,
  wordleCard: 'Karte', wordleHigher: 'höher', wordleLower: 'niedriger',
  wordleLegend: 'Werte auf Turnierniveau (Level 11). Knapp daneben: ±1 Elixier, eine Tempostufe, ±25 % Leben bzw. Schaden pro Sekunde, ±2 Jahre. „—“ = gibt es bei dieser Karte nicht (z. B. Zauber).',
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
  vgBothModes: 'Mehrere aktiv: Der Modus wechselt zufällig von Runde zu Runde.',
  vgStatTitle: 'Werte schätzen', vgStatText: 'Eine Karte, ein Wert (Leben oder Schaden) — wer mit !tipp 1700 am nächsten liegt, gewinnt.',
  vgWordleTitle: 'Chat-Wordle', vgWordleText: 'Der Chat rät gemeinsam eine Karte, jeder Tipp zeigt Elixier, Seltenheit, Art und Jahr im Vergleich.',
  vgImageOnly: 'Gilt für Pixel- und Zoom-Raten.',
  vgEstimateSeconds: 'Zeit zum Schätzen', vgWordleSeconds: 'Zeit fürs Chat-Wordle',
  vgScope: 'Bestenliste zählt', vgScopeSeason: 'Diese Saison', vgScopeAll: 'Alle Zeiten',
  vgScopeNote: 'Die Saison wechselt mit der Clash-Royale-Saison am ersten Montag im Monat. Gezählt wird immer beides.',
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

  // Farb-Raten
  colorHelp: 'Dieser Karte fehlt eine Farbe. Misch sie aus dem Gedächtnis mit den drei Reglern nach — die Karte färbt sich live mit. Ein Tipp pro Karte.',
  colorSeo: 'Einer Clash-Royale-Karte fehlt eine Farbe: Misch sie mit drei Reglern aus dem Gedächtnis nach, die Karte färbt sich live mit. Jeden Tag fünf Karten, gewertet nach Treffgenauigkeit.',
  colorRound: (a, b) => `Karte ${a}/${b}`,
  colorHue: 'Farbton', colorSat: 'Sättigung', colorLight: 'Helligkeit',
  colorSubmit: 'Farbe festlegen', colorNext: 'Nächste Karte', colorFinish: 'Ergebnis zeigen',
  colorYours: 'Deine Farbe', colorOriginal: 'Original', colorYourCard: 'Deine Karte',
  colorMatch: 'Treffer', colorAverage: 'Durchschnitt',
  colorVerdict: (n) => (n >= 97 ? 'Perfekt!' : n >= 90 ? 'Fast identisch' : n >= 78 ? 'Sehr nah dran' : n >= 60 ? 'Richtige Richtung' : 'Daneben'),
  colorMoveFirst: 'Beweg einen Regler, um die Farbe einzusetzen.',
  colorLoadError: 'Diese Karte konnte nicht geladen werden.',
  colorAlt: 'Karte, der eine Farbe fehlt',

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

  hubNew: 'New: player stats, clans, leaderboards with decks and the decks of the best',
  hubMinigames: 'Deck Draft Minigames',
  tabStats: 'Stats', tabStatsSub: 'players, clans, leaderboards, decks and cards — live from the game',
  statsPlayers: 'Players & Clans', statsPlayersText: 'Profile with ranked deck, every battle, collection with upgrade calculator and badges.',
  tabMinigames: 'Minigames', tabMinigamesSub: 'draft with friends or take on the Nuzlocke challenge',
  hubMinigamesText: 'Ten draft modes for 2–8 players — create a lobby, share the link, start drafting.',
  play: 'Play',
  nextUp: 'Up next',
  open: 'Open',
  tournaments: 'Tournaments', tournamentsText: 'Brackets with group stage, live standings and automatic match start.',
  nuzlocke: 'Nuzlocke', nuzlockeText: 'The challenge where lost cards are gone for good.',
  winTracker: 'Win Tracker', winTrackerText: 'OBS overlay with league, trophies, deck and your latest matches.',
  forStreamers: 'For streamers', forStreamersSub: 'OBS overlays for your Clash Royale stream',
  cardGames: 'Card games', cardGamesSub: 'quick rounds with every Clash Royale card',
  solvedToday: 'Solved today',
  // Daily round of all guessing games (HeutePage.jsx)
  heuteTitle: 'Daily round', heuteSub: 'All five guessing games, once a day — the same cards for everyone.',
  heuteSeo: 'The daily Clash Royale guessing round: Card Wordle, Card Guess, Zoom, Pixel and Colour Guess with a shared score, streak and leaderboard.',
  heuteTotal: 'Points today', heuteOf: (n) => `${n} of 5 played`, heuteOpen: 'Open',
  heuteStreak: (n) => `Streak ${n}`, heuteStreakNote: (best) => `days in a row with all five games · best ${best}`,
  heuteShare: 'Copy result', heuteCopied: 'Copied', heuteShareHeading: 'Clash Royale – daily round', heuteTotalShort: 'Total',
  heuteBoard: 'Today’s leaderboard', heuteBoardPlayers: (n) => `${n} playing`, heuteBoardEmpty: 'Nobody is on the list yet.',
  heuteBoardDown: 'The leaderboard is not reachable right now.', heuteLogin: 'Log in with Twitch to get on the leaderboard.',
  heuteLoginBtn: 'Log in with Twitch', heuteYou: 'You', heuteRank: (n) => `Rank ${n}`, heuteGames: (n) => `${n}/5`,
  heuteAllDone: 'All five done — new cards tomorrow.', heuteFirstOnly: 'Your first result of the day counts.',
  heuteTileText: 'All five guessing games of the day in one round — with points, streak and leaderboard.', heuteTileTag: (n) => `${n}/5 today`,
  heuteDoneTitle: 'Daily round done', heuteDoneText: 'All five played — check your result and the leaderboard.', heuteResult: 'See result',
  guessTitle: 'Card Guess', guessText: '24 cards in front of you, one clue per round. Flip down what it can’t be — then make your guess.', guessTag: 'Solo · daily round',
  whoTitle: 'Guess Who?', whoText: 'The classic flip-board game for two: pick a secret card, ask yes/no questions, flip, guess.', whoTag: 'Two players · via link',
  statsTitle: 'Stats Duel', statsText: 'Higher or lower with real battle stats: hitpoints, damage, DPS, hit speed, range …', statsTag: 'Solo · streak',
  zoomTitle: 'Zoom Guess', zoomText: 'A tiny detail, zoomed in extremely close. Every two guesses you see a bit more.', zoomTag: 'Solo · daily round',
  pixelTitle: 'Pixel Guess', pixelText: 'The whole card — but so pixelated you can barely tell. Every two guesses it gets sharper.', pixelTag: 'Solo · daily round',
  colorTitle: 'Colour Guess', colorText: 'One colour of the card is missing. Mix it back from memory with three sliders — the card recolours live.', colorTag: 'Solo · daily round',

  wordleTitle: 'Card Wordle', wordleText: 'Guess a card — every attribute tells you how close you are. Elixir, rarity, hitpoints, damage, release year …', wordleTag: 'Solo · daily round',
  wordleHelp: 'Type any card. Green = match, orange = close, red = off, ▲▼ = the secret card has more or less.',
  wordleWon: (c, n) => `The card was ${c} — found in ${n} ${n === 1 ? 'guess' : 'guesses'}.`,
  wordleTries: (n) => `${n} ${n === 1 ? 'guess' : 'guesses'} so far`,
  wordleCard: 'Card', wordleHigher: 'higher', wordleLower: 'lower',
  wordleLegend: 'Stats at tournament standard (level 11). Close: ±1 elixir, one speed step, ±25 % hitpoints or damage per second, ±2 years. “—” = not applicable for this card (e.g. spells).',
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
  vgBothModes: 'Several active: the mode switches randomly from round to round.',
  vgStatTitle: 'Estimate stats', vgStatText: 'One card, one value (hitpoints or damage) — whoever gets closest with !tipp 1700 wins.',
  vgWordleTitle: 'Chat Wordle', vgWordleText: 'Chat guesses a card together, every guess compares elixir, rarity, type and year.',
  vgImageOnly: 'Applies to Pixel and Zoom Guess.',
  vgEstimateSeconds: 'Time to estimate', vgWordleSeconds: 'Time for Chat Wordle',
  vgScope: 'Leaderboard counts', vgScopeSeason: 'This season', vgScopeAll: 'All time',
  vgScopeNote: 'The season changes with the Clash Royale season on the first Monday of the month. Both are always counted.',
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

  // Color Guess
  colorHelp: 'One colour of this card is missing. Mix it from memory with the three sliders — the card changes live. One guess per card.',
  colorSeo: 'One colour of a Clash Royale card is missing: mix it back from memory with three sliders while the card recolours live. Five cards a day, scored by how close you get.',
  colorRound: (a, b) => `Card ${a}/${b}`,
  colorHue: 'Hue', colorSat: 'Saturation', colorLight: 'Lightness',
  colorSubmit: 'Lock in colour', colorNext: 'Next card', colorFinish: 'Show result',
  colorYours: 'Your colour', colorOriginal: 'Original', colorYourCard: 'Your card',
  colorMatch: 'match', colorAverage: 'Average',
  colorVerdict: (n) => (n >= 97 ? 'Perfect!' : n >= 90 ? 'Almost identical' : n >= 78 ? 'Very close' : n >= 60 ? 'Right direction' : 'Way off'),
  colorMoveFirst: 'Move a slider to fill in the colour.',
  colorLoadError: 'This card could not be loaded.',
  colorAlt: 'Card with one colour missing',

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
