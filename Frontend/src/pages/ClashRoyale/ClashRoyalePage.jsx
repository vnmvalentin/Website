import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { io } from 'socket.io-client';
import {
  Sword, Copy, Check, Users, Clock, Play, Crown, LogOut,
  Link2, UserX, Eye, EyeOff, Trophy, Worm, Droplets, Zap,
  LayoutGrid, Rows, Hash, Shield, ArrowLeftRight, XCircle, X,
  ChevronDown, Repeat, AlertTriangle, Ban, Search, Monitor, Sparkles,
  QrCode, ExternalLink, FishingRod, Flashlight, HelpCircle, MessageCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import archerQueenImg from '../../assets/clashRoyale/goldenknight.png';
import { buildDeckLink } from './data/cardDeckIds';
import StreamerConfigPanel from './streamer/StreamerConfigPanel';
import SEO from '../../components/SEO';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { RARITY_COLOR, ALL_CARDS } from './data/cards';
import SnakeRoyale from './modes/SnakeRoyale';
import ElixirAuction from './modes/ElixirAuction';
import BingoRoyale from './modes/BingoRoyale';
import ShadowCarousel from './modes/ShadowCarousel';
import ElixirRush from './modes/ElixirRush';
import CardEvolution from './modes/CardEvolution';
import AngelRoyale from './modes/AngelRoyale';
import DarkMaze from './modes/DarkMaze';
const STREAMER_ID = '160224748';

const MODES = [
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
    icon: Droplets,
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
    desc: 'Karten treiben in zufälligen Bahnen über den Fluss — manche schnell, manche in Wellenlinien, manche tauchen kurz ab und sind dann nicht fangbar. Klicke sie an, um sie zu angeln. Nach jedem Fang braucht deine Angel einen Moment.',
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

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120];

// Einstellungs-Presets: die konkreten Werte kommen vom Server (lobbyData.modePresets),
// hier stehen nur Beschriftung, Beschreibung und Symbol. So gibt es keine zweite Stelle,
// an der Zahlen gepflegt werden müssten.
const PRESET_META = {
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

// Hub-/Landingpage UND Lobby sind zweisprachig — die eigentlichen Spielmodi-Bildschirme
// (Snake Royale, Elixir Auction, Bingo Royale, Blindes Karussel, Elixir Rush selbst)
// bleiben (vorerst) Deutsch. Englische Namen/Beschreibungen der Modi separat,
// damit MODES selbst (weiterhin Deutsch als Basis) unverändert bleibt.
const MODE_DESC_EN = {
  snake: 'Pick cards from an 11×11 grid — but only ones adjacent to your last pick. Build the best possible deck!',
  auction: 'Start with 100 elixir and bid on the cards shown each round. Highest bidder wins — losers get a consolation prize!',
  bingo: 'Fill your bingo card with Clash Royale cards. Bingos grant power-ups to improve your own deck or sabotage opponents.',
  'shadow-carousel': 'Each player has a table full of face-down cards. Reveal cards each round and take one — even blindly. Tables then rotate carousel-style.',
  'elixir-rush': 'Your elixir refills automatically — the marketplace shows cards at their real elixir cost. First click gets the card. 8 buys = finished deck!',
  'card-evolution': '3 rounds: upgrade and lock cards at progressive token costs, then sabotage opponents, then keep upgrading. Cards come from a shared pool — every card belongs to only one player at a time.',
  'angel-royale': 'Cards drift across the river on random paths — some fast, some in sine waves, some briefly submerge and can\'t be caught. Click them to reel them in. After every catch your rod needs a moment.',
  'dark-maze': 'A maze regenerated on every start, in complete darkness — you only see your own cone of light. Collect draft chests (1 of 2) and loose floor cards; a joker waits in the center. When time runs out, empty deck slots are filled randomly.',
};
// Modus-Namen sind größtenteils bereits englische Markennamen — nur "Blindes Karussel"/"Karten-Evolution" brauchen eine Übersetzung.
const MODE_NAME_EN = {
  'shadow-carousel': 'Shadow Carousel',
  'card-evolution': 'Card Evolution',
  'angel-royale': 'Fishing Royale',
  'dark-maze': 'Dark Maze',
};
// ── Strukturierte Daten (schema.org) für die Hubseite ───────────────────────
// Die Minigames sind eine Single-Page-App: ohne diese Angaben sieht Google außer der
// Überschrift kaum Text. WebApplication beschreibt das Angebot, ItemList macht die acht
// Modi maschinenlesbar, FAQPage kann als Rich Result in den Suchergebnissen erscheinen
// (die Fragen stehen deshalb auch sichtbar auf der Seite) und BreadcrumbList liefert den
// Pfad "Startseite › Clash Royale › Minigames" unter dem Suchtreffer.
const SITE_URL = 'https://vnmvalentin.de';
function buildClashJsonLd(t, lang) {
  const pageUrl = lang === 'en' ? `${SITE_URL}/clash-royale?lang=en` : `${SITE_URL}/clash-royale`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: lang === 'en' ? 'Clash Royale Minigames' : 'Clash Royale Minigames',
      url: pageUrl,
      description: t.seoDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: lang === 'en' ? 'Multiplayer draft minigames' : 'Multiplayer-Draft-Minigames',
      operatingSystem: 'Web browser',
      browserRequirements: lang === 'en' ? 'Requires JavaScript and a modern browser' : 'Benötigt JavaScript und einen aktuellen Browser',
      inLanguage: lang === 'en' ? 'en' : 'de',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: MODES.filter(m => m.available).map(m => modeNameFor(m.id, lang)),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: lang === 'en' ? 'Clash Royale minigame modes' : 'Clash Royale Spielmodi',
      itemListElement: MODES.filter(m => m.available).map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: modeNameFor(m.id, lang),
        description: modeDescFor(m.id, lang),
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (t.faqItems || []).map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: lang === 'en' ? 'Home' : 'Startseite', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Clash Royale', item: `${SITE_URL}/clash` },
        { '@type': 'ListItem', position: 3, name: 'Minigames', item: pageUrl },
      ],
    },
  ];
}

const modeNameFor = (id, lang) => {
  const m = MODES.find(mm => mm.id === id) || MODES[0];
  return lang === 'en' ? (MODE_NAME_EN[m.id] || m.name) : m.name;
};
const modeDescFor = (id, lang) => {
  const m = MODES.find(mm => mm.id === id) || MODES[0];
  return lang === 'en' ? (MODE_DESC_EN[m.id] || m.desc) : m.desc;
};

const PAGE_I18N = {
  de: {
    // Hub
    subtitle: 'Multiplayer Minigames · Echtzeit · Lobbybasiert',
    streamerSetup: 'Streamer Setup',
    streamerSetupTitle: 'OBS-Automatiken & Deck-Overlay konfigurieren',
    tabCreate: 'Lobby erstellen',
    tabJoin: 'Lobby beitreten',
    namePlaceholder: 'Dein Name…',
    avatarLabel: 'Profilbild wählen',
    codePlaceholder: 'Lobby-Code eingeben…',
    createBtn: 'Lobby erstellen',
    joinBtn: 'Beitreten',
    errNameRequired: 'Bitte Namen eingeben',
    errCodeRequired: 'Bitte Lobby-Code eingeben',
    comingSoon: 'Bald verfügbar',
    support: 'Support & Feedback:',
    joinDiscord: 'Discord beitreten',
    usedBy: 'Benutzt von',
    // Zusammengefasster Infobereich unter der Lobby-Karte
    tabModes: 'Spielmodi',
    tabModesCount: (n) => `${n} Modi`,
    tabFaq: 'Häufige Fragen',
    tabSupport: 'Support',
    playNowHint: 'Für 2–8 Spieler · kein Download, keine Anmeldung',
    supportIntro: 'Fragen, Ideen oder ein Bug gefunden? Schreib mir — am schnellsten geht es über Discord.',

    // SEO / crawlbarer Inhalt der Hubseite
    seoTitle: 'Clash Royale Minigames — Draft-Modi kostenlos im Browser spielen',
    seoDesc: 'Acht Clash-Royale-Minigames für 2–8 Spieler: Snake Royale, Elixir Auction, Bingo Royale, Blindes Karussell, Elixir Rush, Karten-Evolution, Angel Royale und Dunkles Labyrinth. Lobby erstellen, Code teilen, sofort im Browser draften — kostenlos und ohne Installation.',
    seoKeywords: 'Clash Royale Minigames, Clash Royale Draft, Snake Royale, Elixir Auction, Bingo Royale, Clash Royale Deck Generator, Clash Royale Browserspiel, Clash Royale Stream Minigames, Clash Royale Custom Modus',
    introText: 'Erstelle eine Lobby, teile den Code mit 2–8 Freunden und draftet gemeinsam Decks in acht verschiedenen Minigames. Alles läuft in Echtzeit im Browser — ohne Download, ohne Anmeldung. Am Ende bekommt jedes Deck einen Link, mit dem du es direkt in Clash Royale öffnest.',
    faqHeading: 'Häufige Fragen',
    faqItems: [
      {
        q: 'Was sind die Clash Royale Minigames?',
        a: 'Acht Draft-Spielmodi für 2 bis 8 Spieler, in denen ihr euch abwechselnd oder gleichzeitig ein 8-Karten-Deck aus dem Clash-Royale-Kartenpool zusammenstellt — jeder Modus mit eigenen Regeln, von einem Snake-Raster über eine Elixier-Auktion bis zu einem dunklen Labyrinth.',
      },
      {
        q: 'Brauche ich einen Account oder eine Installation?',
        a: 'Nein. Die Minigames laufen komplett im Browser. Du gibst nur einen Namen ein, erstellst eine Lobby und teilst den 6-stelligen Code oder den Einladungslink. Ein Twitch-Login brauchst du nur für Zusatzfunktionen wie das Win-Tracker-Overlay.',
      },
      {
        q: 'Wie viele Spieler können mitspielen?',
        a: 'Zwei bis acht aktive Spieler pro Lobby, zusätzlich beliebig viele Zuschauer. Bei manchen Modi begrenzt der Kartenpool die Spielerzahl — die Lobby zeigt dir das Maximum direkt an.',
      },
      {
        q: 'Kann ich das gedraftete Deck in Clash Royale nutzen?',
        a: 'Ja. Nach jedem Spiel gibt es zu jedem Deck einen Kopieren-Link und einen QR-Code. Damit öffnest du das komplette Deck mit einem Klick direkt in der Clash-Royale-App.',
      },
      {
        q: 'Kann ich Karten vom Draft ausschließen?',
        a: 'Ja. Der Host legt einen Kartenpool fest und kann einzelne Karten sperren oder ein fertiges Preset laden — zum Beispiel den Kartenpool eines offiziellen Clash-Royale-Spezialmodus. Die Auswahl gilt für alle Spielmodi der Lobby.',
      },
      {
        q: 'Eignen sich die Minigames für Streams?',
        a: 'Ja, sie sind genau dafür gebaut: Zuschauer können mitspielen oder zuschauen, es gibt OBS-Overlays für die gedrafteten Decks, gesperrte Karten und einen Win Tracker mit Liga, Medaillen und Tagesstatistik.',
      },
    ],

    // Lobby
    lobbySeoDesc: 'Warte auf Mitspieler',
    historyTitle: 'Spielverlauf dieser Sitzung',
    historyEmpty: 'Noch kein abgeschlossenes Spiel in dieser Sitzung.',
    historyGame: (n) => `Spiel ${n}`,
    cardsUnit: 'Karten',
    waitingForPlayers: 'Warte auf Spieler…',
    history: 'Verlauf',
    copy: 'Kopieren',
    codeLabel: 'Code',
    linkLabel: 'Link',
    playersSpectators: (players, spectators) => `${players} Spieler · ${spectators} Zuschauer`,
    admin: 'Admin',
    spectator: 'Zuschauer',
    play: 'Mitspielen',
    spectate: 'Zuschauen',
    reactivate: 'Reaktivieren',
    setSpectator: 'Zuschauer',
    reactivateTitle: 'Wieder aktivieren',
    setSpectatorTitle: 'Als Zuschauer setzen',
    transferHostTitle: 'Host-Status übergeben',
    kickTitle: 'Kicken',
    adminAccessNote: 'Admin-Zugriff — du steuerst diese Lobby, ohne Host zu sein.',
    gameMode: 'Spielmodus',
    presets: 'Voreinstellungen',
    presetsNote: 'Setzt alle Regler dieses Modus auf einen fertigen Satz Werte. Danach kannst du einzelne Werte weiter anpassen.',
    presetCustom: 'Eigene Werte',
    cardPool: 'Kartenpool',
    allCardsInDraft: (n) => `Alle ${n} Karten im Draft`,
    excludedInDraft: (excluded, pool) => `${excluded} ausgeschlossen · ${pool} Karten im Draft`,
    edit: 'Bearbeiten',
    cardPoolNote: 'Ausgeschlossene Karten tauchen in keinem Spielmodus im Draft auf — gilt für alle Spiele dieser Lobby.',
    poolTooSmall: (mode, need, have) => `Zu viele Karten ausgeschlossen — ${mode} benötigt mind. ${need} Karten (${have} verfügbar).`,
    timePerRound: 'Zeit pro Runde',
    timePerPick: 'Zeit pro Pick',
    marketplaceCards: 'Karten auf dem Marktplatz',
    marketplaceCardsNote: 'So viele Karten liegen gleichzeitig auf dem Marktplatz zur Auswahl.',
    marketplaceLifetime: 'Kartenzeit auf dem Marktplatz',
    marketplaceLifetimeNote: 'Nicht gekaufte Karten werden nach dieser Zeit gegen neue ausgetauscht.',
    showOthersElixir: 'Elixier anderer Spieler anzeigen',
    showOthersElixirNoteRush: 'Blendet die Elixierbalken der Mitspieler in der Seitenleiste ein oder aus',
    showOthersElixirNoteAuction: 'Alle sehen das Elixier aller Mitspieler in der Seitenleiste',
    rushShowTimer: 'Restzeit-Timer bei Karten anzeigen',
    rushShowTimerNote: 'Zeigt einen Balken unter jeder Marktplatz-Karte, wie lange sie noch verfügbar ist, bevor sie ausgetauscht wird.',
    cardsPerTable: 'Karten pro Tisch',
    cardsPerTableDisabledTitle: (pool, n) => `Kartenpool (${pool}) reicht nicht für 2 Tische à ${n} Karten`,
    maxPlayersTitle: (n) => `Max. ${n} Spieler`,
    carouselAllUsed: 'Alle Karten werden verbraucht — am Ende sind alle Tische leer.',
    carouselSomeUnused: (n) => `Nach den 8 Picks bleiben ${n} Karten pro Tisch ungenutzt — mehr Auswahl, mehr Ungewissheit.`,
    carouselMaxPlayersNote: (n) => `Max. ${n} Spieler.`,
    carouselTooMany: (active, pool, n) => `Zu viele aktive Spieler (${active}) — der Kartenpool (${pool}) reicht nicht für ${active} Tische à ${n} Karten.`,
    revealsPerRound: 'Aufdeckungen pro Runde',
    revealDynamic: 'Dynamisch',
    revealAlwaysTwo: 'Immer 2',
    revealAlwaysOne: 'Immer 1',
    revealDynamicNote: 'Runde 1–4: 2 Aufdeckungen · ab Runde 5: nur noch 1 (Standard)',
    revealTwoNote: 'In jeder Runde dürfen 2 Karten aufgedeckt werden.',
    revealOneNote: 'In jeder Runde darf nur 1 Karte aufgedeckt werden.',
    gridSize: 'Rastergröße',
    gridSizeTooSmallTitle: (need, pool) => `Benötigt ${need} Karten — nur ${pool} im Pool`,
    gridAllCards: 'Alle 121 Karten · kein Zufall',
    gridRandomCards: (n) => `${n} zufällige Karten aus dem Pool`,
    poolSuffix: (pool) => ` · Pool: ${pool} Karten`,
    cardsPerRound: (min) => `Karten pro Runde (min. ${min})`,
    cardsPerRoundTooBigTitle: (n, pool) => `Benötigt ${8 * n} Karten (8 Runden × ${n}) — nur ${pool} im Pool`,
    cardsPerRoundNoteBingo: 'Karten die pro Runde zur Auswahl stehen (mindestens 1 pro Spieler)',
    poolFor8Rounds: (pool) => ` · Pool: ${pool} Karten für 8 Runden`,
    poolFor8RoundsStandalone: (pool) => `Pool: ${pool} Karten für 8 Runden`,
    timePerToken: 'Zeit pro Token im Token-Shop',
    tokenTimeoutNote: 'Wer sein Power-Up nicht rechtzeitig einsetzt, verliert den Token.',
    startingElixir: 'Start-Elixier',
    motherWitchVisits: 'Mutterhexen Besuche',
    motherWitchNote: 'In Runde 2-7: 30% Chance, dass ein zufälliger Spieler von der Mutterhexe eine Fähigkeit angeboten bekommt',
    evolutionPickTimer: 'Pick-Runden Zeit (Runde 1 & 3)',
    evolutionPickTimerNote: 'Zeit für die Karten-Auswahl in Runde 1 und 3. Danach wird automatisch zur nächsten Runde gewechselt.',
    evolutionSabotageTimer: 'Sabotage-Runden Zeit (Runde 2)',
    evolutionSabotageTimerNote: 'Zeit, um Karten anderer Spieler zu sabotieren, bevor es zurück zur Auswahl geht.',
    evolutionTokens: 'Evolutions-Tokens',
    evolutionTokensNote: 'Wie viele Tokens jeder Spieler zu Beginn erhält.',
    fishSpawnRate: 'Karten pro Sekunde',
    fishSpawnRateNote: 'So viele Karten spawnen durchschnittlich pro Sekunde im Fluss.',
    fishCooldown: 'Angel-Cooldown nach Fang',
    fishCooldownNote: 'Nach einem erfolgreichen Fang kann so lange nicht erneut geangelt werden.',
    mazeTime: 'Zeitlimit im Labyrinth',
    mazeTimeNote: 'Läuft die Zeit ab, werden leere Deck-Plätze automatisch mit zufälligen Karten aufgefüllt.',
    startGame: 'Spiel starten',
    startBlockedCarousel: (max, cards) => `Max. ${max} Spieler bei ${cards} Karten pro Tisch`,
    startBlockedPool: (have, need) => `Kartenpool zu klein (${have}/${need} Karten)`,
    startBlockedPlayers: 'Mind. 2 aktive Spieler benötigt',
    excludedCardsView: (n) => `${n} Karten ausgeschlossen — ansehen`,
    waitingForHost: 'Warte auf den Host…',

    // Game phase / admin panel / swap modal / game over
    gameSeoDesc: 'Wähle dein Deck!',
    loadingGame: 'Lade Spiel…',
    adminControlTitle: 'Admin-Steuerung',
    cancelGameTitle: 'Spiel abbrechen',
    cancelGameBtn: 'Abbrechen',
    cancelGameConfirm: 'Spiel wirklich abbrechen? Alle Spieler kehren zur Lobby zurück, der Fortschritt dieser Runde geht verloren.',
    noPlayersInSession: 'Keine Spieler in dieser Sitzung.',
    swapCardTitle: (name) => `Karte austauschen · ${name}`,
    replaceWith: (name) => `${name} ersetzen durch…`,
    searchCardPlaceholder: 'Karte suchen…',
    alreadyInDeck: (name) => `${name} — bereits im Deck`,
    championLimitTitle: (name) => `${name} — Champion-Limit (max. 2)`,
    noCardFound: 'Keine Karte gefunden.',
    draftDone: 'Drafting abgeschlossen',
    adminSwapHint: 'Klicke eine Deck-Karte an, um sie als Admin auszutauschen',
    allDecksReady: 'Alle Decks wurden zusammengestellt',
    layoutGrid: 'Nebeneinander',
    layoutList: 'Untereinander',
    playAgain: 'Erneut spielen',
    // Hieß mal "Zur Übersicht" — das wurde als "zurück in die Lobby" gelesen und ständig
    // aus Versehen gedrückt, obwohl es die Lobby verlässt. Jetzt eindeutig plus Rückfrage.
    leaveLobbyBtn: 'Lobby verlassen',
    leaveLobbyConfirm: 'Lobby wirklich verlassen? Du landest wieder auf der Startseite und brauchst den Lobby-Code, um erneut beizutreten. Für eine weitere Runde nutze „Erneut spielen“.',
    leaveLobbyConfirmGuest: 'Lobby wirklich verlassen? Du landest wieder auf der Startseite und brauchst den Lobby-Code, um erneut beizutreten.',
    youLabel: 'Du',
    swapCardHint: (name) => `${name} — austauschen`,
    deckQrBtn: 'QR-Code',
    deckQrTitle: (name) => `Deck von ${name}`,
    deckQrHint: 'Mit dem Handy scannen, um das Deck direkt in Clash Royale zu öffnen.',
    deckQrCopy: 'Link kopieren',
    deckQrCopied: 'Kopiert!',
    deckQrOpenApp: 'In Clash Royale öffnen',
    deckQrUnavailable: (names) => `Noch kein Deck-Link möglich — Kartendaten fehlen für: ${names}`,
  },
  en: {
    // Hub
    subtitle: 'Multiplayer minigames · Real-time · Lobby-based',
    streamerSetup: 'Streamer Setup',
    streamerSetupTitle: 'Configure OBS automations & deck overlay',
    tabCreate: 'Create lobby',
    tabJoin: 'Join lobby',
    namePlaceholder: 'Your name…',
    avatarLabel: 'Choose profile picture',
    codePlaceholder: 'Enter lobby code…',
    createBtn: 'Create lobby',
    joinBtn: 'Join',
    errNameRequired: 'Please enter a name',
    errCodeRequired: 'Please enter a lobby code',
    comingSoon: 'Coming soon',
    support: 'Support & Feedback:',
    joinDiscord: 'Join Discord',
    usedBy: 'Used by',
    // Combined info section below the lobby card
    tabModes: 'Game modes',
    tabModesCount: (n) => `${n} modes`,
    tabFaq: 'FAQ',
    tabSupport: 'Support',
    playNowHint: 'For 2–8 players · no download, no sign-up',
    supportIntro: 'Questions, ideas or found a bug? Get in touch — Discord is the fastest way.',

    // SEO / crawlable content of the hub page
    seoTitle: 'Clash Royale Minigames — play draft modes free in your browser',
    seoDesc: 'Eight Clash Royale minigames for 2–8 players: Snake Royale, Elixir Auction, Bingo Royale, Shadow Carousel, Elixir Rush, Card Evolution, Fishing Royale and Dark Maze. Create a lobby, share the code, start drafting in your browser — free, no install.',
    seoKeywords: 'Clash Royale minigames, Clash Royale draft, Snake Royale, Elixir Auction, Bingo Royale, Clash Royale deck generator, Clash Royale browser game, Clash Royale stream minigames, Clash Royale custom mode',
    introText: 'Create a lobby, share the code with 2–8 friends and draft decks together across eight different minigames. Everything runs in real time in your browser — no download, no sign-up. At the end every deck gets a link that opens it straight in Clash Royale.',
    faqHeading: 'Frequently asked questions',
    faqItems: [
      {
        q: 'What are the Clash Royale minigames?',
        a: 'Eight draft game modes for 2 to 8 players in which you build an 8-card deck from the Clash Royale card pool, taking turns or all at once — each mode with its own rules, from a snake grid to an elixir auction to a dark maze.',
      },
      {
        q: 'Do I need an account or an installation?',
        a: 'No. The minigames run entirely in the browser. You just enter a name, create a lobby and share the 6-character code or the invite link. A Twitch login is only needed for extras such as the win tracker overlay.',
      },
      {
        q: 'How many players can join?',
        a: 'Two to eight active players per lobby, plus any number of spectators. In some modes the card pool limits the player count — the lobby always shows you the current maximum.',
      },
      {
        q: 'Can I use the drafted deck in Clash Royale?',
        a: 'Yes. After every game each deck comes with a copy link and a QR code that opens the full deck in the Clash Royale app with one tap.',
      },
      {
        q: 'Can I exclude cards from the draft?',
        a: 'Yes. The host defines the card pool and can ban individual cards or load a ready-made preset — for example the card pool of an official Clash Royale special mode. The selection applies to every game mode in the lobby.',
      },
      {
        q: 'Are the minigames suitable for streaming?',
        a: 'Yes, that is exactly what they were built for: viewers can play or spectate, and there are OBS overlays for drafted decks, banned cards and a win tracker with league, medals and daily stats.',
      },
    ],

    // Lobby
    lobbySeoDesc: 'Waiting for players',
    historyTitle: 'Game history for this session',
    historyEmpty: 'No completed games in this session yet.',
    historyGame: (n) => `Game ${n}`,
    cardsUnit: 'cards',
    waitingForPlayers: 'Waiting for players…',
    history: 'History',
    copy: 'Copy',
    codeLabel: 'Code',
    linkLabel: 'Link',
    playersSpectators: (players, spectators) => `${players} players · ${spectators} spectators`,
    admin: 'Admin',
    spectator: 'Spectator',
    play: 'Play',
    spectate: 'Spectate',
    reactivate: 'Reactivate',
    setSpectator: 'Spectator',
    reactivateTitle: 'Reactivate',
    setSpectatorTitle: 'Set as spectator',
    transferHostTitle: 'Transfer host status',
    kickTitle: 'Kick',
    adminAccessNote: 'Admin access — you control this lobby without being the host.',
    gameMode: 'Game mode',
    presets: 'Presets',
    presetsNote: 'Sets every slider of this mode to a ready-made set of values. You can still fine-tune individual values afterwards.',
    presetCustom: 'Custom values',
    cardPool: 'Card pool',
    allCardsInDraft: (n) => `All ${n} cards in the draft`,
    excludedInDraft: (excluded, pool) => `${excluded} excluded · ${pool} cards in the draft`,
    edit: 'Edit',
    cardPoolNote: 'Excluded cards never appear in the draft of any game mode — applies to every game in this lobby.',
    poolTooSmall: (mode, need, have) => `Too many cards excluded — ${mode} needs at least ${need} cards (${have} available).`,
    timePerRound: 'Time per round',
    timePerPick: 'Time per pick',
    marketplaceCards: 'Cards in the marketplace',
    marketplaceCardsNote: 'This many cards are available in the marketplace at once.',
    marketplaceLifetime: 'Card lifetime in the marketplace',
    marketplaceLifetimeNote: 'Unbought cards are swapped for new ones after this time.',
    showOthersElixir: "Show other players' elixir",
    showOthersElixirNoteRush: "Shows or hides other players' elixir bars in the sidebar",
    showOthersElixirNoteAuction: "Everyone sees every player's elixir in the sidebar",
    rushShowTimer: 'Show countdown timer on cards',
    rushShowTimerNote: 'Shows a bar under each marketplace card for how long it stays available before being swapped out.',
    cardsPerTable: 'Cards per table',
    cardsPerTableDisabledTitle: (pool, n) => `Card pool (${pool}) isn't enough for 2 tables of ${n} cards`,
    maxPlayersTitle: (n) => `Max. ${n} players`,
    carouselAllUsed: 'All cards get used up — every table ends up empty.',
    carouselSomeUnused: (n) => `After the 8 picks, ${n} cards per table go unused — more choice, more uncertainty.`,
    carouselMaxPlayersNote: (n) => `Max. ${n} players.`,
    carouselTooMany: (active, pool, n) => `Too many active players (${active}) — the card pool (${pool}) isn't enough for ${active} tables of ${n} cards.`,
    revealsPerRound: 'Reveals per round',
    revealDynamic: 'Dynamic',
    revealAlwaysTwo: 'Always 2',
    revealAlwaysOne: 'Always 1',
    revealDynamicNote: 'Rounds 1–4: 2 reveals · from round 5: only 1 (default)',
    revealTwoNote: '2 cards may be revealed each round.',
    revealOneNote: 'Only 1 card may be revealed each round.',
    gridSize: 'Grid size',
    gridSizeTooSmallTitle: (need, pool) => `Needs ${need} cards — only ${pool} in the pool`,
    gridAllCards: 'All 121 cards · no randomness',
    gridRandomCards: (n) => `${n} random cards from the pool`,
    poolSuffix: (pool) => ` · Pool: ${pool} cards`,
    cardsPerRound: (min) => `Cards per round (min. ${min})`,
    cardsPerRoundTooBigTitle: (n, pool) => `Needs ${8 * n} cards (8 rounds × ${n}) — only ${pool} in the pool`,
    cardsPerRoundNoteBingo: 'Cards available to pick from each round (at least 1 per player)',
    poolFor8Rounds: (pool) => ` · Pool: ${pool} cards for 8 rounds`,
    poolFor8RoundsStandalone: (pool) => `Pool: ${pool} cards for 8 rounds`,
    timePerToken: 'Time per token in the token shop',
    tokenTimeoutNote: "Anyone who doesn't use their power-up in time loses the token.",
    startingElixir: 'Starting elixir',
    motherWitchVisits: 'Mother Witch visits',
    motherWitchNote: 'In rounds 2–7: 30% chance a random player gets offered an ability by the Mother Witch',
    evolutionPickTimer: 'Pick round time (round 1 & 3)',
    evolutionPickTimerNote: 'Time to pick cards in round 1 and 3. Automatically advances to the next round afterwards.',
    evolutionSabotageTimer: 'Sabotage round time (round 2)',
    evolutionSabotageTimerNote: "Time to sabotage other players' cards before it's back to picking.",
    evolutionTokens: 'Evolution tokens',
    evolutionTokensNote: 'How many tokens each player starts with.',
    fishSpawnRate: 'Cards per second',
    fishSpawnRateNote: 'On average this many cards spawn in the river per second.',
    fishCooldown: 'Rod cooldown after a catch',
    fishCooldownNote: 'After a successful catch you can\'t fish again for this long.',
    mazeTime: 'Maze time limit',
    mazeTimeNote: 'When time runs out, empty deck slots are filled with random cards automatically.',
    startGame: 'Start game',
    startBlockedCarousel: (max, cards) => `Max. ${max} players at ${cards} cards per table`,
    startBlockedPool: (have, need) => `Card pool too small (${have}/${need} cards)`,
    startBlockedPlayers: 'Need at least 2 active players',
    excludedCardsView: (n) => `${n} cards excluded — view`,
    waitingForHost: 'Waiting for the host…',

    // Game phase / admin panel / swap modal / game over
    gameSeoDesc: 'Choose your deck!',
    loadingGame: 'Loading game…',
    adminControlTitle: 'Admin controls',
    cancelGameTitle: 'Cancel game',
    cancelGameBtn: 'Cancel',
    cancelGameConfirm: 'Really cancel the game? All players will return to the lobby and this round\'s progress will be lost.',
    noPlayersInSession: 'No players in this session.',
    swapCardTitle: (name) => `Swap card · ${name}`,
    replaceWith: (name) => `Replace ${name} with…`,
    searchCardPlaceholder: 'Search cards…',
    alreadyInDeck: (name) => `${name} — already in deck`,
    championLimitTitle: (name) => `${name} — champion limit (max. 2)`,
    noCardFound: 'No card found.',
    draftDone: 'Draft complete',
    adminSwapHint: 'Click a deck card to swap it as admin',
    allDecksReady: 'All decks have been assembled',
    layoutGrid: 'Side by side',
    layoutList: 'Stacked',
    playAgain: 'Play again',
    leaveLobbyBtn: 'Leave lobby',
    leaveLobbyConfirm: 'Really leave the lobby? You will end up back on the start page and need the lobby code to rejoin. Use “Play again” for another round.',
    leaveLobbyConfirmGuest: 'Really leave the lobby? You will end up back on the start page and need the lobby code to rejoin.',
    youLabel: 'You',
    swapCardHint: (name) => `${name} — swap`,
    deckQrBtn: 'QR code',
    deckQrTitle: (name) => `${name}'s deck`,
    deckQrHint: 'Scan with your phone to open this deck directly in Clash Royale.',
    deckQrCopy: 'Copy link',
    deckQrCopied: 'Copied!',
    deckQrOpenApp: 'Open in Clash Royale',
    deckQrUnavailable: (names) => `No deck link yet — missing card data for: ${names}`,
  },
};

const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

// Alle Bilder aus src/assets/avatars/ automatisch einlesen (wird beim Build aufgelöst)
const _avatarGlob = import.meta.glob(
  '/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}',
  { eager: true }
);
// Map: "held.png" → "/assets/held-abc123.png"
const AVATAR_URL_MAP = Object.fromEntries(
  Object.entries(_avatarGlob).map(([p, m]) => [p.split('/').pop(), m.default])
);
const AVATAR_IDS = Object.keys(AVATAR_URL_MAP).sort();

function avatarUrl(id) {
  if (!id) return null;
  return AVATAR_URL_MAP[id] ?? null;
}

function PlayerAvatar({ avatarId, size = 28, className = '', isAdmin = false }) {
  if (isAdmin) {
    return (
      <div className={`rounded-full shrink-0 bg-violet-500/20 border-2 border-violet-400 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}>
        <Shield size={Math.round(size * 0.55)} className="text-violet-300" />
      </div>
    );
  }
  const url = avatarUrl(avatarId);
  if (!url) return (
    <div className={`rounded-full shrink-0 bg-black/40 border border-white/20 ${className}`}
      style={{ width: size, height: size }} />
  );
  return (
    <div className={`rounded-full overflow-hidden shrink-0 border border-white/20 bg-black/40 ${className}`}
      style={{ width: size, height: size }}>
      <img src={url} alt=""
        className="w-full h-full object-cover object-center" />
    </div>
  );
}


// Flaggen als Inline-SVG statt Emoji: Windows besitzt keine Glyphen für Flaggen-Emojis
// (🇩🇪 würde dort nur als Buchstabenkasten "DE" erscheinen).
function FlagDE({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="10" fill="#000000" />
      <rect y="10" width="60" height="10" fill="#DD0000" />
      <rect y="20" width="60" height="10" fill="#FFCE00" />
    </svg>
  );
}

function FlagGB({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="3" />
      <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

const LANGUAGES = [
  { id: 'de', label: 'Deutsch', Flag: FlagDE },
  { id: 'en', label: 'English', Flag: FlagGB },
];

// Sprachauswahl als Flaggen-Dropdown — deutlich schneller zu finden als ein DE/EN-Kürzel
function LanguageSelect({ lang, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = LANGUAGES.find(l => l.id === lang) || LANGUAGES[0];
  const CurrentFlag = current.Flag;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={lang === 'de' ? 'Sprache wählen' : 'Choose language'}
        title={lang === 'de' ? 'Sprache wählen' : 'Choose language'}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
        <CurrentFlag />
        <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-full mt-1.5 z-50 min-w-[9.5rem] panel-strong overflow-hidden py-1">
          {LANGUAGES.map(l => {
            const Flag = l.Flag;
            const active = l.id === lang;
            return (
              <button key={l.id} role="option" aria-selected={active}
                onClick={() => { onChange(l.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-white/[0.06] text-white font-semibold' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}>
                <Flag />
                <span className="flex-1 text-left">{l.label}</span>
                {active && <Check size={13} className="text-violet-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const USED_BY_FALLBACK = [
  { name: 'BigSpin', login: 'bigspincr', avatar: null, live: false },
  { name: 'xopxsam', login: 'xopxsam', avatar: null, live: false },
  { name: 'Zodiac_Cr', login: 'zodiac_cr', avatar: null, live: false },
  { name: 'Dooomcr', login: 'dooomcr', avatar: null, live: false },
  { name: 'Vinc', login: 'vinc', avatar: null, live: false },
  { name: 'Tryaz', login: 'tryaz', avatar: null, live: false },
  { name: 'Morten', login: 'mortenroyale', avatar: null, live: false },
];

// Streamer, die die Clash-Royale-Minigames in ihrem Stream nutzen — Profilbild + Live-Punkt (Twitch Helix, serverseitig gecached).
function UsedByPanel({ t }) {
  const [streamers, setStreamers] = useState(USED_BY_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/used-by');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length) setStreamers(data);
      } catch {
        // Fallback-Liste bleibt sichtbar
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="panel-strong overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
        <Users size={14} className="text-violet-300" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-violet-300/80">{t.usedBy}</h2>
      </div>
      <ul className="flex flex-col p-2">
        {streamers.map(s => (
          <li key={s.login}>
            <a href={`https://twitch.tv/${s.login}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
              {s.avatar ? (
                <img src={s.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-xs font-bold shrink-0">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-white/80 hover:text-white transition-colors truncate flex-1">
                {s.name}
              </span>
              {s.live ? (
                <span className="flex items-center gap-1.5 shrink-0" title="Live">
                  <span className="text-[9px] font-bold text-red-500 tracking-wider">LIVE</span>
                  <span className="relative w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping" />
                    <span className="absolute inset-0 rounded-full bg-red-500" />
                  </span>
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-white/15 shrink-0" title="Offline" />
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ClashRoyalePage() {
  const { user } = useContext(TwitchAuthContext);
  const socketRef      = useRef(null);
  const playerNameRef  = useRef('');
  const avatarRef      = useRef('');
  const [phase, setPhase] = useState('hub');
  const [hubTab, setHubTab] = useState('create'); // 'create' | 'join'
  const [infoTab, setInfoTab] = useState('modes'); // Hub-Infobereich: 'modes' | 'faq' | 'support'
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [codeHidden, setCodeHidden] = useState(true);
  const [linkHidden, setLinkHidden] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [streamerCfgOpen, setStreamerCfgOpen] = useState(false);
  // Sprache der Hub-/Landingpage (Lobby & Minigames bleiben Deutsch) — per ?lang=en direkt verlinkbar
  const [lang, setLang] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'de'; }
    catch { return 'de'; }
  });
  const t = PAGE_I18N[lang];
  // Ref für Socket-Handler (registriert einmalig beim Mount) — vermeidet stale closure bei Sprachwechsel
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);
  const changeLang = (next) => {
    if (next !== 'de' && next !== 'en') return;
    setLang(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'en') url.searchParams.set('lang', 'en');
      else url.searchParams.delete('lang');
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch { /* ignore */ }
  };

  const [selectedAvatar, setSelectedAvatar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clash_session') || '{}').avatar || AVATAR_IDS[0] || ''; }
    catch { return AVATAR_IDS[0] ?? ''; }
  });
  const [lobbyData, setLobbyData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myId, setMyId] = useState('');
  // Derive host status from lobbyData so host-transfers via disconnect are reflected immediately
  const effectiveIsHost = lobbyData ? lobbyData.host === (myId || socketRef.current?.id) : isHost;
  const mySocketId = myId || socketRef.current?.id;
  const myPlayerEntry = lobbyData?.players?.find(p => p.id === mySocketId);
  const isClashAdmin = !!myPlayerEntry?.isAdmin;
  // Host-Aktionen (Einstellungen, Kick, Spiel abbrechen, ...) dürfen auch vom Admin ausgeführt werden
  const canControlLobby = effectiveIsHost || isClashAdmin;
  const isAdminModeRef = useRef(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  // Auction-specific
  const [auctionState, setAuctionState] = useState(null);
  const [auctionReveal, setAuctionReveal] = useState(null);
  const [myBid, setMyBid] = useState(null);
  const [motherWitchVisit, setMotherWitchVisit] = useState(null);
  // Bingo-specific
  const [bingoState, setBingoState] = useState(null);
  // Schatten-Karussel-specific
  const [carouselState, setCarouselState] = useState(null);
  // Elixir-Rush-specific
  const [rushState, setRushState] = useState(null);
  const [rushDenied, setRushDenied] = useState(null);
  // Karten-Evolution-specific
  const [evoState, setEvoState] = useState(null);
  // Angel-Royale-specific
  const [fishState, setFishState] = useState(null);
  const [fishDenied, setFishDenied] = useState(null);
  // Dunkles-Labyrinth-specific
  const [mazeState, setMazeState] = useState(null);

  // Keep refs in sync for use inside socket handlers (avoid stale closure)
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { avatarRef.current = selectedAvatar; }, [selectedAvatar]);

  // Pre-fill code from URL ?code= then immediately clean URL.
  // Ein neuer Einladungslink schlägt eine gespeicherte Sitzung: Zeigt die URL einen ANDEREN
  // Lobby-Code als localStorage, wird die alte Sitzung verworfen (kein Auto-Rejoin in die
  // alte Lobby mehr) — Name und Avatar bleiben als Vorbelegung erhalten.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('code');
    if (c) {
      const urlCode = c.toUpperCase();
      setJoinCode(urlCode);
      setHubTab('join');
      try {
        const saved = JSON.parse(localStorage.getItem('clash_session') || 'null');
        if (saved?.code && saved.code !== urlCode) {
          localStorage.removeItem('clash_session');
          if (saved.playerName) { setPlayerName(saved.playerName); playerNameRef.current = saved.playerName; }
          if (saved.avatar)     { setSelectedAvatar(saved.avatar); avatarRef.current = saved.avatar; }
        }
      } catch { /* ignore */ }
      window.history.replaceState({}, '', '/clash-royale');
    }
  }, []);

  // Socket setup — guard against React StrictMode double-invoke
  useEffect(() => {
    if (socketRef.current?.connected) return; // bereits verbunden, nicht neu erstellen
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);
      // Auto-rejoin from localStorage after page reload
      try {
        const saved = JSON.parse(localStorage.getItem('clash_session') || 'null');
        if (saved?.code && saved?.playerName) {
          setPlayerName(saved.playerName);
          playerNameRef.current = saved.playerName;
          if (saved.avatar) { setSelectedAvatar(saved.avatar); avatarRef.current = saved.avatar; }
          // auto: true → bei ungültiger Sitzung räumt der Server still auf statt einen Fehler zu zeigen
          socket.emit('clash:joinLobby', { code: saved.code, playerName: saved.playerName, avatar: saved.avatar || '', auto: true });
        }
      } catch { /* ignore */ }
    });
    if (socket.id) setMyId(socket.id);
    socket.on('clash:lobbyCreated', ({ code }) => {
      setIsHost(true); setPhase('lobby');
      try { localStorage.setItem('clash_session', JSON.stringify({ code, playerName: playerNameRef.current, avatar: avatarRef.current })); } catch { /* ignore */ }
    });
    socket.on('clash:lobbyJoined', ({ isHost: h, code }) => {
      setIsHost(h); setPhase('lobby');
      // Admin-Beobachter-Sessions nicht in localStorage persistieren (kein Auto-Rejoin als Admin)
      if (code && !isAdminModeRef.current) {
        try { localStorage.setItem('clash_session', JSON.stringify({ code, playerName: playerNameRef.current, avatar: avatarRef.current })); } catch { /* ignore */ }
      }
    });
    socket.on('clash:gameReconnect', () => {
      // Restore game phase without resetting game state
      setPhase('game'); setGameOver(null);
    });
    socket.on('clash:lobbyUpdate', setLobbyData);
    socket.on('clash:gameStart', () => { setPhase('game'); setGameOver(null); setAuctionState(null); setAuctionReveal(null); setMyBid(null); setBingoState(null); setCarouselState(null); setRushState(null); setRushDenied(null); setMotherWitchVisit(null); setEvoState(null); setFishState(null); setFishDenied(null); setMazeState(null); });
    socket.on('clash:gameState', setGameState);
    socket.on('clash:timerTick', ({ remaining }) => {
      setGameState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setAuctionState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setBingoState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setCarouselState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setEvoState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
    });
    socket.on('clash:gameOver', setGameOver);
    socket.on('clash:auctionRound', (data) => { setAuctionState(data); setAuctionReveal(null); setMyBid(null); });
    socket.on('clash:auctionBidUpdate', ({ pendingBidCount }) =>
      setAuctionState(prev => prev ? { ...prev, pendingBidCount } : prev));
    socket.on('clash:auctionReveal', (data) => { setAuctionReveal(data); setAuctionState(data); });
    socket.on('clash:bingo:state', setBingoState);
    socket.on('clash:carousel:state', setCarouselState);
    socket.on('clash:evo:state', setEvoState);
    // Elixir Rush: voller State bei jedem Marktereignis, leichter Elixier-Sync jede Sekunde.
    // clientReceivedAt erlaubt dem Client, den Elixierbalken zwischen Syncs flüssig hochzurechnen.
    socket.on('clash:rush:state', (data) => setRushState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:rush:sync', (sync) => setRushState(prev => {
      if (!prev) return prev;
      const byId = Object.fromEntries((sync.players || []).map(p => [p.id, p]));
      return {
        ...prev,
        serverNow: sync.serverNow,
        clientReceivedAt: Date.now(),
        players: prev.players.map(p => byId[p.id]
          ? { ...p, elixir: byId[p.id].elixir, fullDeadline: byId[p.id].fullDeadline }
          : p),
      };
    }));
    socket.on('clash:rush:denied', (d) => setRushDenied({ ...d, ts: Date.now() }));
    // Angel Royale: voller State bei jedem Spawn/Fang/Despawn — Bewegung rechnen die Clients selbst
    socket.on('clash:fish:state', (data) => setFishState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:fish:denied', (d) => setFishDenied({ ...d, ts: Date.now() }));
    // Dunkles Labyrinth: voller State bei Item-/Draft-Ereignissen, leichter Positions-Sync alle 100ms
    socket.on('clash:maze:state', (data) => setMazeState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:maze:pos', ({ positions }) => setMazeState(prev => prev ? { ...prev, positions } : prev));
    socket.on('clash:historyData', setHistoryData);
    socket.on('clash:motherWitch:visit', (data) => setMotherWitchVisit(data));
    socket.on('clash:motherWitch:expire', () => setMotherWitchVisit(null));
    socket.on('clash:motherWitch:resolved', ({ accepted, elixir }) => {
      setMotherWitchVisit(null);
      if (accepted && typeof elixir === 'number') {
        const myPid = socketRef.current?.id;
        setAuctionState(prev => prev ? {
          ...prev,
          players: prev.players.map(p => p.id === myPid ? { ...p, elixir } : p),
        } : prev);
      }
    });
    socket.on('clash:lobbyRestart', ({ cancelled } = {}) => {
      setPhase('lobby');
      setGameOver(null); setGameState(null);
      setAuctionState(null); setAuctionReveal(null); setMyBid(null);
      setBingoState(null); setCarouselState(null); setRushState(null); setRushDenied(null); setMotherWitchVisit(null);
      setFishState(null); setFishDenied(null); setMazeState(null);
      setCodeHidden(true); setLinkHidden(true);
      if (cancelled) {
        setError(langRef.current === 'en' ? 'The game was cancelled by the host/admin.' : 'Das Spiel wurde vom Host/Admin abgebrochen.');
        setTimeout(() => setError(''), 4000);
      }
    });
    socket.on('clash:kicked', () => {
      try { localStorage.removeItem('clash_session'); } catch { /* ignore */ }
      setError(langRef.current === 'en' ? 'You were removed from the lobby.' : 'Du wurdest aus der Lobby entfernt.');
      setPhase('hub'); setLobbyData(null); setGameState(null);
    });
    // Gespeicherte Sitzung ist nicht mehr gültig (Lobby existiert nicht mehr o.ä.) — still aufräumen
    socket.on('clash:sessionExpired', () => {
      try { localStorage.removeItem('clash_session'); } catch { /* ignore */ }
    });
    // Ein anderer Tab / eine neue Verbindung hat diese Sitzung übernommen — zurück zum Hub.
    // localStorage NICHT löschen: die Sitzung gehört jetzt dem anderen Tab.
    socket.on('clash:sessionTakeover', () => {
      setPhase('hub'); setLobbyData(null); setGameState(null); setGameOver(null);
      setAuctionState(null); setAuctionReveal(null); setMyBid(null);
      setBingoState(null); setCarouselState(null); setMotherWitchVisit(null);
      setFishState(null); setFishDenied(null); setMazeState(null);
      setError(langRef.current === 'en' ? 'Your session was taken over in another tab/window.' : 'Deine Sitzung wurde in einem anderen Tab/Fenster übernommen.');
      setTimeout(() => setError(''), 5000);
    });
    socket.on('clash:error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 3000);
    });

    return () => socket.disconnect();
  }, []);

  // Admin-Einstieg über ?adminCode=XXX (z.B. aus dem Admin-Dashboard verlinkt) — nur für den Streamer
  const adminJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (adminJoinAttemptedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const adminCode = params.get('adminCode');
    if (!adminCode) return;
    if (!user) return; // Twitch-Auth lädt noch nach — später erneut versuchen
    if (String(user.id) !== STREAMER_ID) {
      window.history.replaceState({}, '', '/clash-royale');
      return;
    }
    adminJoinAttemptedRef.current = true;
    isAdminModeRef.current = true;
    window.history.replaceState({}, '', '/clash-royale');
    const doJoin = () => socketRef.current?.emit('clash:adminJoinLobby', { code: adminCode.toUpperCase() });
    if (socketRef.current?.connected) doJoin();
    else socketRef.current?.once('connect', doJoin);
  }, [user]);

  const emit = useCallback((ev, data) => socketRef.current?.emit(ev, data), []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!playerName.trim()) return setError(t.errNameRequired);
    setError('');
    // Modus wird erst in der Lobby gewählt — Lobby startet mit Standardmodus
    emit('clash:createLobby', { playerName: playerName.trim(), mode: 'snake', timerSeconds: 60, avatar: selectedAvatar });
  };

  const handleJoin = (codeOverride) => {
    const code = (codeOverride || joinCode).toUpperCase().trim();
    if (!playerName.trim()) return setError(t.errNameRequired);
    if (!code) return setError(t.errCodeRequired);
    setError('');
    emit('clash:joinLobby', { code, playerName: playerName.trim(), avatar: selectedAvatar });
  };

  const handlePickCard = useCallback((cellIndex) =>
    emit('clash:pickCard', { code: lobbyData?.code, cellIndex }), [emit, lobbyData?.code]);

  const handleStart = () => emit('clash:startGame', { code: lobbyData?.code });
  const handleKick = (id) => emit('clash:kickPlayer', { code: lobbyData?.code, playerId: id });
  const handleSetTimer = (s) => emit('clash:setTimer', { code: lobbyData?.code, seconds: s });
  const handleSetCardsPerRound = (n) => emit('clash:setCardsPerRound', { code: lobbyData?.code, count: n });
  const handleAuctionBid = useCallback((cardIndex, amount) => {
    setMyBid({ cardIndex, amount });
    emit('clash:auction:bid', { code: lobbyData?.code, cardIndex, amount });
  }, [emit, lobbyData?.code]);

  const handleLeave = () => {
    try { localStorage.removeItem('clash_session'); } catch { /* ignore */ }
    // Erst NACH der Server-Bestätigung (Ack) trennen — sonst geht das leaveLobby-Paket
    // beim sofortigen disconnect() gelegentlich verloren und der Spieler bleibt hängen
    const finish = () => {
      socketRef.current?.disconnect();
      socketRef.current?.connect();
      setPhase('hub'); setLobbyData(null); setGameState(null); setGameOver(null); setIsHost(false);
      setAuctionState(null); setAuctionReveal(null); setMyBid(null); setBingoState(null); setCarouselState(null); setRushState(null); setRushDenied(null); setMotherWitchVisit(null);
      setFishState(null); setFishDenied(null); setMazeState(null);
      setCodeHidden(true); setLinkHidden(true);
    };
    if (lobbyData?.code && socketRef.current?.connected) {
      let doneCalled = false;
      const fallback = setTimeout(() => { if (!doneCalled) { doneCalled = true; finish(); } }, 1000);
      socketRef.current.emit('clash:leaveLobby', { code: lobbyData.code }, () => {
        if (!doneCalled) { doneCalled = true; clearTimeout(fallback); finish(); }
      });
    } else {
      finish();
    }
  };

  const handleRestart = () => emit('clash:restartLobby', { code: lobbyData?.code });
  const handleCancelGame = () => {
    if (window.confirm(t.cancelGameConfirm)) {
      emit('clash:restartLobby', { code: lobbyData?.code });
    }
  };
  const handleTransferHost = (targetId) => {
    const target = lobbyData?.players?.find(p => p.id === targetId);
    if (!target) return;
    const confirmMsg = lang === 'en'
      ? `Transfer host status to "${target.name}"?${effectiveIsHost ? ' You will lose your host rights afterwards.' : ''}`
      : `Host-Status an "${target.name}" übergeben?${effectiveIsHost ? ' Du verlierst danach deine Host-Rechte.' : ''}`;
    if (window.confirm(confirmMsg)) {
      emit('clash:transferHost', { code: lobbyData?.code, targetPlayerId: targetId });
    }
  };
  const handleSetPlayerSpectator = (targetId, isSpectator) =>
    emit('clash:setPlayerSpectator', { code: lobbyData?.code, targetPlayerId: targetId, isSpectator });
  const handleBingoPick = useCallback((cardIndex, bingoCell) =>
    emit('clash:bingo:pick', { code: lobbyData?.code, cardIndex, bingoCell }), [emit, lobbyData?.code]);
  const handleCarouselFlip = useCallback((slotIdx) =>
    emit('clash:carousel:flip', { code: lobbyData?.code, slotIdx }), [emit, lobbyData?.code]);
  const handleCarouselPick = useCallback((slotIdx) =>
    emit('clash:carousel:pick', { code: lobbyData?.code, slotIdx }), [emit, lobbyData?.code]);
  const handleSetCarouselCards = (count) => emit('clash:setCarouselCards', { code: lobbyData?.code, count });
  const handleSetCarouselReveal = (mode) => emit('clash:setCarouselReveal', { code: lobbyData?.code, mode });
  const handleEvoAction = useCallback((slotIdx, direction) =>
    emit('clash:evo:action', { code: lobbyData?.code, slotIdx, direction }), [emit, lobbyData?.code]);
  const handleEvoResolvePending = useCallback((chosenIndex) =>
    emit('clash:evo:resolvePending', { code: lobbyData?.code, chosenIndex }), [emit, lobbyData?.code]);
  const handleEvoLock = useCallback((slotIdx) =>
    emit('clash:evo:lock', { code: lobbyData?.code, slotIdx }), [emit, lobbyData?.code]);
  const handleEvoSabotage = useCallback((targetPlayerId, slotIdx) =>
    emit('clash:evo:sabotage', { code: lobbyData?.code, targetPlayerId, slotIdx }), [emit, lobbyData?.code]);
  const handleSetEvolutionPickSeconds = (seconds) => emit('clash:setEvolutionPickSeconds', { code: lobbyData?.code, seconds });
  const handleSetEvolutionSabotageSeconds = (seconds) => emit('clash:setEvolutionSabotageSeconds', { code: lobbyData?.code, seconds });
  const handleSetEvolutionTokens = (count) => emit('clash:setEvolutionTokens', { code: lobbyData?.code, count });
  const handleRushBuy = useCallback((slotIdx, seq) =>
    emit('clash:rush:buy', { code: lobbyData?.code, slotIdx, seq }), [emit, lobbyData?.code]);
  const handleFishCatch = useCallback((fishId) =>
    emit('clash:fish:catch', { code: lobbyData?.code, fishId }), [emit, lobbyData?.code]);
  const handleSetFishSpawnRate = (rate) => emit('clash:setFishSpawnRate', { code: lobbyData?.code, rate });
  const handleSetFishCooldown = (seconds) => emit('clash:setFishCooldown', { code: lobbyData?.code, seconds });
  const handleMazeMove = useCallback((dir) =>
    emit('clash:maze:move', { code: lobbyData?.code, dir }), [emit, lobbyData?.code]);
  const handleMazePickup = useCallback(() =>
    emit('clash:maze:pickup', { code: lobbyData?.code }), [emit, lobbyData?.code]);
  const handleMazeDraftPick = useCallback((choice) =>
    emit('clash:maze:draftPick', { code: lobbyData?.code, choice }), [emit, lobbyData?.code]);
  const handleMazeJokerPick = useCallback((cardId) =>
    emit('clash:maze:jokerPick', { code: lobbyData?.code, cardId }), [emit, lobbyData?.code]);
  const handleMazeCloseDraft = useCallback(() =>
    emit('clash:maze:closeDraft', { code: lobbyData?.code }), [emit, lobbyData?.code]);
  const handleSetMazeTime = (seconds) => emit('clash:setMazeTime', { code: lobbyData?.code, seconds });
  const handleSetRushMarketSize = (count) => emit('clash:setRushMarketSize', { code: lobbyData?.code, count });
  const handleSetRushLifetime = (seconds) => emit('clash:setRushLifetime', { code: lobbyData?.code, seconds });
  const handleSetRushShowElixir = (show) => emit('clash:setRushShowElixir', { code: lobbyData?.code, show });
  const handleSetRushShowTimer = (show) => emit('clash:setRushShowTimer', { code: lobbyData?.code, show });
  const handleBingoPowerup = useCallback((type, params) =>
    emit('clash:bingo:powerup', { code: lobbyData?.code, type, ...params }), [emit, lobbyData?.code]);
  // Live-Übertragung der Token-Shop-Auswahl an alle Mitspieler
  const handleBingoTokenAction = useCallback((data) =>
    emit('clash:bingo:tokenAction', { code: lobbyData?.code, ...data }), [emit, lobbyData?.code]);
  const handleSetTokenShopTimer = (s) => emit('clash:setTokenShopTimer', { code: lobbyData?.code, seconds: s });
  const handleToggleSpectator = () => emit('clash:toggleSpectator', { code: lobbyData?.code });
  const handleSetShowElixir = (show) => emit('clash:setShowElixir', { code: lobbyData?.code, show });
  const handleSetStartElixir = (amount) => emit('clash:setStartElixir', { code: lobbyData?.code, amount });
  const handleSetMotherWitch = (enabled) => emit('clash:setMotherWitch', { code: lobbyData?.code, enabled });
  const handleMotherWitchRespond = useCallback((accept) =>
    emit('clash:motherWitch:respond', { code: lobbyData?.code, accept }), [emit, lobbyData?.code]);
  const handleSetGridSize = (size) => emit('clash:setGridSize', { code: lobbyData?.code, size });
  // Global ausgeschlossene Karten — gelten für alle Spielmodi dieser Lobby
  const excludedCards = lobbyData?.excludedCards || [];
  const handleSetExcludedCards = (cardIds) => emit('clash:setExcludedCards', { code: lobbyData?.code, cardIds });
  const handleToggleExcludeCard = (cardId) => {
    const next = excludedCards.includes(cardId)
      ? excludedCards.filter(id => id !== cardId)
      : [...excludedCards, cardId];
    handleSetExcludedCards(next);
  };
  const handleSetMode = (mode) => {
    setModeMenuOpen(false);
    if (mode !== lobbyData?.mode) emit('clash:setMode', { code: lobbyData?.code, mode });
  };
  // Fertige Einstellungs-Sätze des aktuellen Modus (Werte liefert der Server)
  const modePresets = lobbyData?.modePresets || [];
  const handleApplyPreset = (presetId) => emit('clash:applyModePreset', { code: lobbyData?.code, presetId });
  // Welches Preset entspricht dem aktuellen Zustand? Verglichen wird gegen die Werte, die
  // der Server für diese Lobby berechnet hat (cardsPerRound hängt z.B. an der Spielerzahl).
  const activePresetId = modePresets.find(p =>
    Object.entries(p.values).every(([key, value]) => lobbyData?.[key] === value)
  )?.id || null;
  const handleOpenHistory = () => {
    emit('clash:requestHistory', { code: lobbyData?.code });
    setHistoryOpen(true);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const lobbyLink = lobbyData ? `${window.location.origin}/clash-royale?code=${lobbyData.code}` : '';

  // ── Hub ───────────────────────────────────────────────────────────────────
  if (phase === 'hub') return (
    <div className="page-fade h-full overflow-y-auto custom-scrollbar">
      <SEO
        title={t.seoTitle}
        description={t.seoDesc}
        keywords={t.seoKeywords}
        path="/clash-royale"
        search={lang === 'en' ? '?lang=en' : ''}
        lang={lang}
        alternates={[
          { hrefLang: 'de', search: '' },
          { hrefLang: 'en', search: '?lang=en' },
          { hrefLang: 'x-default', search: '' },
        ]}
        jsonLd={buildClashJsonLd(t, lang)} />

      <div className="w-full px-2 md:px-4 xl:px-8 py-4 md:py-8">
        <div className="max-w-[105rem] mx-auto xl:grid xl:grid-cols-[18rem_1fr_18rem] xl:gap-x-10">

        {/* Hero — bleibt in der mittleren Spalte, exakt so breit wie der Content darunter */}
        <div className="flex flex-col items-center text-center gap-4 mb-10 xl:col-start-2 xl:row-start-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 overflow-hidden shrink-0">
              <img src={archerQueenImg} alt="" className="w-full h-full object-cover object-top" />
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight">Clash Royale Draft Minigames</h1>
          </div>
          <p className="text-white/50 text-sm md:text-base">{t.subtitle}</p>
          {/* Einleitung: erklärt Besuchern in zwei Sätzen, was die Seite ist — und ist
              gleichzeitig der einzige Fließtext, den Suchmaschinen oben auf der Seite finden */}
          <p className="text-white/40 text-sm leading-relaxed max-w-2xl">{t.introText}</p>

          <div className="flex items-center gap-2">
            <LanguageSelect lang={lang} onChange={changeLang} />
            <button
              onClick={() => setStreamerCfgOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold transition-colors"
              title={t.streamerSetupTitle}>
              <Monitor size={13} />
              {t.streamerSetup}
            </button>
          </div>
        </div>

        {streamerCfgOpen && <StreamerConfigPanel onClose={() => setStreamerCfgOpen(false)} lang={lang} />}

        {/* Unterhalb xl ist kein Platz für die Seitenleiste — hier stattdessen eingebettet */}
        <div className="xl:hidden mb-6">
          <UsedByPanel t={t} />
        </div>

        {/* Streamer, die diese Minigames nutzen — ganz links, auf Höhe des Lobby-Panels, mit Abstand zum Hauptinhalt */}
        <div className="hidden xl:block xl:col-start-1 xl:row-start-2 xl:sticky xl:top-4">
          <UsedByPanel t={t} />
        </div>

        <div className="flex flex-col gap-6 xl:col-start-2 xl:row-start-2">

          {/* Lobby erstellen / beitreten — die eigentliche Aktion der Seite und deshalb der
              einzige hervorgehobene Block (Violett-Ring + Schatten). Alles darunter sind nur
              Informationen und liegt zusammengefasst in EINEM ruhigen Panel. */}
          <div className="panel-strong overflow-hidden h-fit ring-1 ring-violet-500/25 shadow-xl shadow-black/40">
            <div className="grid grid-cols-2 border-b border-white/10 bg-violet-500/[0.06]">
              <button onClick={() => setHubTab('create')}
                className={`flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors border-b-2 ${
                  hubTab === 'create' ? 'border-violet-400 text-white bg-white/[0.04]' : 'border-transparent text-white/40 hover:text-white/70'
                }`}>
                <Sword size={14} />
                {t.tabCreate}
              </button>
              <button onClick={() => setHubTab('join')}
                className={`flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors border-b-2 ${
                  hubTab === 'join' ? 'border-violet-400 text-white bg-white/[0.04]' : 'border-transparent text-white/40 hover:text-white/70'
                }`}>
                <Link2 size={14} />
                {t.tabJoin}
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name + selected avatar preview */}
              <div className="flex items-center gap-3">
                <PlayerAvatar avatarId={selectedAvatar} size={40} />
                <input
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (hubTab === 'create' ? handleCreate() : handleJoin())}
                  placeholder={t.namePlaceholder}
                  maxLength={20}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm transition-colors"
                />
              </div>

              {/* Avatar picker — nur anzeigen wenn Bilder vorhanden */}
              {AVATAR_IDS.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs mb-2">{t.avatarLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_IDS.map(id => (
                      <button key={id}
                        onClick={() => setSelectedAvatar(id)}
                        title={id.replace(/\.[^.]+$/, '')}
                        className={`rounded-full overflow-hidden border-2 transition-all shrink-0 ${
                          selectedAvatar === id
                            ? 'border-violet-400 ring-2 ring-violet-400/30 scale-110'
                            : 'border-white/15 hover:border-white/40'
                        }`}
                        style={{ width: 48, height: 48 }}>
                        <img src={AVATAR_URL_MAP[id]} alt={id}
                          className="w-full h-full object-cover object-center" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hubTab === 'join' && (
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder={t.codePlaceholder}
                  maxLength={6}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm font-mono tracking-widest uppercase transition-colors"
                />
              )}

              {hubTab === 'create' ? (
                <button onClick={handleCreate}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Sword size={16} />
                  {t.createBtn}
                </button>
              ) : (
                <button onClick={() => handleJoin()}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Link2 size={16} />
                  {t.joinBtn}
                </button>
              )}
              <p className="text-white/30 text-xs text-center">{t.playNowHint}</p>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          </div>

          {/* Infobereich — Spielmodi, FAQ und Support lagen vorher als drei einzelne Panels
              untereinander und ließen die Seite überladen wirken. Jetzt EIN ruhiges Panel mit
              Reitern.
              WICHTIG: Alle drei Inhalte bleiben immer im DOM und werden nur per CSS
              ausgeblendet. Als bedingtes {tab === … && …} wären Modusbeschreibungen und FAQ
              für Suchmaschinen unsichtbar — genau das ist der Seiteninhalt, auf den die
              strukturierten Daten aus buildClashJsonLd() verweisen. */}
          <div className="panel-strong overflow-hidden">
            <div className="flex border-b border-white/10 overflow-x-auto">
              {[
                { id: 'modes', label: t.tabModes, icon: LayoutGrid, badge: t.tabModesCount(MODES.filter(m => m.available).length) },
                { id: 'faq', label: t.tabFaq, icon: HelpCircle },
                { id: 'support', label: t.tabSupport, icon: MessageCircle },
              ].map(item => {
                const TabIcon = item.icon;
                const active = infoTab === item.id;
                return (
                  <button key={item.id} onClick={() => setInfoTab(item.id)} aria-selected={active}
                    className={`flex items-center gap-2 px-4 sm:px-5 py-3.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
                      active ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-white/40 hover:text-white/70'
                    }`}>
                    <TabIcon size={14} />
                    {item.label}
                    {item.badge && (
                      <span className="text-[10px] font-semibold text-white/30 tabular-nums">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Spielmodi */}
            <div className={infoTab === 'modes' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
                {MODES.map(m => {
                  const Icon = m.icon;
                  const desc = modeDescFor(m.id, lang);
                  return (
                    <div key={m.id} className="rounded-lg bg-black/25 border border-white/5 p-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                          <Icon size={15} />
                        </span>
                        <h3 className="text-white font-semibold text-sm leading-tight">{modeNameFor(m.id, lang)}</h3>
                      </div>
                      {!m.available && (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 text-white/35 mb-2">
                          {t.comingSoon}
                        </span>
                      )}
                      {desc && <div className="text-white/40 text-xs leading-relaxed">{desc}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Häufige Fragen — sichtbarer Inhalt zu den FAQPage-Daten aus buildClashJsonLd().
                Google verlangt für das FAQ-Rich-Result, dass Frage und Antwort auch auf der
                Seite selbst stehen. */}
            <div className={infoTab === 'faq' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 p-5">
                {(t.faqItems || []).map((item, i) => (
                  <div key={i}>
                    <h3 className="text-white/90 font-semibold text-sm mb-1.5">{item.q}</h3>
                    <p className="text-white/40 text-xs leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Support */}
            <div className={infoTab === 'support' ? 'block' : 'hidden'}>
              <div className="p-5 space-y-3">
                <p className="text-white/40 text-xs leading-relaxed max-w-xl">{t.supportIntro}</p>
                <div className="flex flex-wrap gap-3">
                  <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors">
                    <img src="https://cdn.simpleicons.org/discord/5865F2" alt="Discord" className="w-5 h-5 shrink-0" />
                    <span className="text-white font-semibold text-sm">{t.joinDiscord}</span>
                  </a>
                  <a href="https://twitch.tv/vnmvalentin" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#9146FF]/50 hover:bg-[#9146FF]/10 transition-colors">
                    <img src="https://cdn.simpleicons.org/twitch/9146FF" alt="Twitch" className="w-5 h-5 shrink-0" />
                    <span className="text-white font-semibold text-sm">twitch.tv/vnmvalentin</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

        </div>

        </div>
      </div>
    </div>
  );

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const realPlayers = (lobbyData?.players || []).filter(p => !p.isAdmin);
    const activePlayers = realPlayers.filter(p => !p.isSpectator);
    // Kartenpool = alle Karten abzüglich der global ausgeschlossenen
    const poolSize = ALL_CARDS.length - excludedCards.length;
    // Karussel: Kartenpool begrenzt die Tischanzahl — z.B. 122 Karten bei 16 pro Tisch → max. 7 Spieler
    const currentCarouselCards = lobbyData?.carouselCardsPerTable || 8;
    const currentCarouselReveal = lobbyData?.carouselRevealMode || 'dynamic';
    const carouselMaxPlayers = Math.min(8, Math.floor(poolSize / currentCarouselCards));
    const carouselTooMany = lobbyData?.mode === 'shadow-carousel' && activePlayers.length > carouselMaxPlayers;
    // Mindestgröße des Pools je nach Modus (Karussel wird über carouselTooMany abgedeckt)
    const effCardsPerRound = Math.max(activePlayers.length || 2, lobbyData?.cardsPerRound || activePlayers.length || 2);
    const currentRushMarket = lobbyData?.rushMarketSize || 5;
    const currentRushLifetime = lobbyData?.rushCardLifetime || 15;
    const currentRushShowElixir = lobbyData?.rushShowElixir ?? false;
    const currentRushShowTimer = lobbyData?.rushShowTimer ?? true;
    const requiredPool = lobbyData?.mode === 'snake'
      ? (lobbyData?.gridSize || 11) * (lobbyData?.gridSize || 11)
      : lobbyData?.mode === 'shadow-carousel'
        ? activePlayers.length * currentCarouselCards
        : lobbyData?.mode === 'elixir-rush'
          ? activePlayers.length * 8 + currentRushMarket
          : lobbyData?.mode === 'angel-royale'
            ? activePlayers.length * 8 + 6
            : lobbyData?.mode === 'dark-maze'
              ? activePlayers.length * 8 + 2
              : lobbyData?.mode === 'card-evolution'
                ? 0 // Start ist reine Wildcards — kein Mindestpool nötig, echte Karten kommen erst on-demand
                : 8 * effCardsPerRound;
    const poolTooSmall = lobbyData?.mode !== 'shadow-carousel' && lobbyData?.mode !== 'card-evolution' && poolSize < requiredPool;
    const canStart = canControlLobby && activePlayers.length >= 2 && !carouselTooMany && !poolTooSmall;
    const currentTimer = lobbyData?.timerSeconds || 60;
    const currentTokenShopTimer = lobbyData?.tokenShopTimerSeconds || 60;
    const currentStartElixir = lobbyData?.startElixir ?? 100;
    const currentShowElixir = lobbyData?.showElixir ?? false;
    const currentMotherWitch = lobbyData?.motherWitchEnabled ?? false;
    const currentGridSize = lobbyData?.gridSize || 11;
    const currentEvolutionPickSeconds = lobbyData?.evolutionPickSeconds || 30;
    const currentEvolutionSabotageSeconds = lobbyData?.evolutionSabotageSeconds || 20;
    const currentEvolutionTokens = lobbyData?.evolutionTokensStart || 30;
    const currentFishSpawnRate = lobbyData?.fishSpawnRate ?? 1;
    const currentFishCooldown = lobbyData?.fishCatchCooldown ?? 3;
    const currentMazeTime = lobbyData?.mazeTimeSeconds || 120;
    const currentModeInfo = MODES.find(m => m.id === lobbyData?.mode) || MODES[0];
    const CurrentModeIcon = currentModeInfo.icon;

    return (
      <div className="h-full overflow-y-auto custom-scrollbar">
        {/* Lobby-/Spielansicht liegt auf derselben URL wie der Hub, hat aber keinen
            eigenständigen Inhalt für die Suche — noindex, damit Google die Hubseite indexiert */}
        <SEO title="Lobby · Clash Royale" description={t.lobbySeoDesc} path="/clash-royale" lang={lang} noindex />

        {/* Kartenpool-Modal — Karten global vom Draft ausschließen */}
        {excludeOpen && (
          <CardExclusionModal
            excluded={excludedCards}
            canEdit={canControlLobby}
            onToggle={handleToggleExcludeCard}
            onReset={() => handleSetExcludedCards([])}
            onSetExcluded={handleSetExcludedCards}
            onClose={() => setExcludeOpen(false)}
            lang={lang}
          />
        )}

        {/* History Modal */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setHistoryOpen(false)}>
            <div className="panel-strong w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                <span className="text-white font-bold flex items-center gap-2"><Trophy size={15} className="text-amber-400" /> {t.historyTitle}</span>
                <button onClick={() => setHistoryOpen(false)} className="text-white/40 hover:text-white p-1">✕</button>
              </div>
              <div className="overflow-y-auto custom-scrollbar p-5 space-y-8">
                {historyData.length === 0 ? (
                  <p className="text-white/40 text-sm text-center py-8">{t.historyEmpty}</p>
                ) : historyData.map((game, gi) => (
                  <div key={gi}>
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">{t.historyGame(game.gameNum)} · {modeNameFor(game.mode, lang)}</p>
                    <div className={`grid gap-4 ${game.players.filter(p=>!p.isSpectator).length <= 2 ? 'grid-cols-2' : game.players.filter(p=>!p.isSpectator).length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                      {game.players.filter(p => !p.isSpectator).map((p, pi) => (
                        <div key={pi} className="panel p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar avatarId={p.avatar} size={28} />
                            <span className="text-white font-semibold text-xs truncate flex-1">{p.name}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {p.deck.map((card, ci) => (
                              <div key={ci} title={card.name} className="aspect-square rounded-[2px] overflow-hidden">
                                <img src={`${CARD_CDN}${card.id}.png`} alt={card.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                              </div>
                            ))}
                          </div>
                          <p className="text-white/30 text-[9px]">{p.deck.length}/8 {t.cardsUnit}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
                {lobbyData?.mode ? modeNameFor(lobbyData.mode, lang) : 'Lobby'}
              </p>
              <h1 className="font-display text-2xl font-bold text-white">{t.waitingForPlayers}</h1>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelect lang={lang} onChange={changeLang} />
              {(lobbyData?.historyCount > 0) && (
                <button onClick={handleOpenHistory} title={t.history}
                  className="p-2 border border-white/10 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition-colors text-white/40 flex items-center gap-1.5 text-xs font-semibold px-3">
                  <Trophy size={13} /> {t.history}
                </button>
              )}
              <button onClick={handleLeave}
                className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white">
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          <div className="space-y-6">

          {/* Lobby code card */}
          <div className="panel p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs w-10 shrink-0">{t.codeLabel}</span>
              <span className={`flex-1 text-3xl font-black text-white tracking-[0.25em] font-mono transition-all ${codeHidden ? 'blur-md select-none pointer-events-none' : 'select-all'}`}>
                {lobbyData?.code || '------'}
              </span>
              <button onClick={() => copyText(lobbyData?.code, 'code')} title={t.copy}
                className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white shrink-0">
                {copied === 'code' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              <button onClick={() => setCodeHidden(v => !v)}
                className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white shrink-0">
                {codeHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs w-10 shrink-0">{t.linkLabel}</span>
              <div className={`flex-1 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-white/40 text-xs font-mono truncate transition-all ${linkHidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
                {lobbyLink}
              </div>
              <button onClick={() => copyText(lobbyLink, 'link')} title={t.copy}
                className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white shrink-0">
                {copied === 'link' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              <button onClick={() => setLinkHidden(v => !v)}
                className="p-2 border border-white/10 rounded-lg hover:border-white/30 transition-colors text-white/40 hover:text-white shrink-0">
                {linkHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>

          {/* Player list */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold text-sm flex items-center gap-2">
                <Users size={14} className="text-white/40" />
                {t.playersSpectators(activePlayers.length, realPlayers.length - activePlayers.length)}
              </span>
            </div>
            <div className="space-y-2">
              {lobbyData?.players?.map(p => {
                const showOwnToggle = p.id === mySocketId && !p.isAdmin;
                const showHostTools = canControlLobby && p.id !== mySocketId && !p.isAdmin;
                const showTransfer = showHostTools && p.id !== lobbyData?.host;
                const showKick = canControlLobby && p.id !== lobbyData?.host && !p.isAdmin;
                const hasActionRow = showOwnToggle || showHostTools || showKick;
                return (
                <div key={p.id} className={`rounded-lg overflow-hidden ${p.isAdmin ? 'bg-violet-500/5 border border-violet-500/20' : p.isSpectator ? 'bg-white/5' : 'bg-black/30'}`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <PlayerAvatar avatarId={p.avatar} size={36} isAdmin={p.isAdmin} />
                    <span className={`font-semibold flex-1 truncate text-sm ${p.isAdmin ? 'text-violet-300' : p.isSpectator ? 'text-white/40' : 'text-white'}`}>{p.name}</span>
                    {p.id === lobbyData?.host && <Crown size={14} className="text-amber-400 shrink-0" />}
                    {p.isAdmin && <span className="text-[9px] text-violet-300 border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 rounded-md shrink-0">{t.admin}</span>}
                    {!p.isAdmin && p.isSpectator && <span className="text-[9px] text-white/30 border border-white/10 px-1.5 py-0.5 rounded-md shrink-0">{t.spectator}</span>}
                  </div>

                  {hasActionRow && (
                    <div className="flex items-center gap-1.5 px-3 pb-2.5 flex-wrap">
                      {showOwnToggle && (
                        <button onClick={handleToggleSpectator}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors ${p.isSpectator ? 'border-violet-500/40 text-violet-300 hover:bg-violet-500/10' : 'border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5'}`}>
                          {p.isSpectator ? <Eye size={13} /> : <EyeOff size={13} />}
                          {p.isSpectator ? t.play : t.spectate}
                        </button>
                      )}
                      {showHostTools && (
                        <button onClick={() => handleSetPlayerSpectator(p.id, !p.isSpectator)}
                          title={p.isSpectator ? t.reactivateTitle : t.setSpectatorTitle}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors ${p.isSpectator ? 'border-violet-500/40 text-violet-300 hover:bg-violet-500/10' : 'border-white/10 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5'}`}>
                          {p.isSpectator ? <Eye size={13} /> : <EyeOff size={13} />}
                          {p.isSpectator ? t.reactivate : t.setSpectator}
                        </button>
                      )}
                      <div className="flex-1" />
                      {showTransfer && (
                        <button onClick={() => handleTransferHost(p.id)} title={t.transferHostTitle}
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-white/10 text-white/40 hover:text-amber-300 hover:border-amber-500/30 hover:bg-amber-500/10 transition-colors">
                          <ArrowLeftRight size={13} />
                          <span className="hidden sm:inline">{t.transferHostTitle}</span>
                        </button>
                      )}
                      {showKick && (
                        <button onClick={() => handleKick(p.id)} title={t.kickTitle}
                          className="flex items-center justify-center p-1.5 rounded-md border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors shrink-0">
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          </div>

          <div className="space-y-6">

          {/* Host controls */}
          {canControlLobby && (
            <div className="panel p-5 space-y-5">
              {isClashAdmin && !effectiveIsHost && (
                <p className="text-violet-400 text-xs flex items-center gap-1.5">
                  <Shield size={12} /> {t.adminAccessNote}
                </p>
              )}
              {/* Spielmodus — kann bis zum Start jederzeit gewechselt werden */}
              <div>
                <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                  <Sword size={13} className="text-white/40" />
                  {t.gameMode}
                </p>
                <div className="relative">
                  <button onClick={() => setModeMenuOpen(v => !v)}
                    className={`w-full flex items-center gap-2.5 bg-black/30 border rounded-lg px-3.5 py-2.5 text-left transition-colors ${modeMenuOpen ? 'border-violet-500/50' : 'border-white/10 hover:border-white/25'}`}>
                    <CurrentModeIcon size={15} className="text-violet-400 shrink-0" />
                    <span className="text-white text-sm font-semibold flex-1">{modeNameFor(currentModeInfo.id, lang)}</span>
                    <ChevronDown size={14} className={`text-white/40 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {modeMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full panel-strong shadow-2xl shadow-black/60 overflow-hidden">
                        {MODES.filter(m => m.available).map(m => {
                          const Icon = m.icon;
                          const active = m.id === lobbyData?.mode;
                          return (
                            <button key={m.id} onClick={() => handleSetMode(m.id)}
                              className={`w-full flex items-start gap-2.5 px-3.5 py-3 text-left transition-colors ${active ? 'bg-violet-500/10' : 'hover:bg-white/5'}`}>
                              <Icon size={15} className={`shrink-0 mt-0.5 ${active ? 'text-violet-400' : 'text-white/40'}`} />
                              <span className="flex-1">
                                <span className={`block text-sm font-semibold ${active ? 'text-violet-300' : 'text-white'}`}>{modeNameFor(m.id, lang)}</span>
                                <span className="block text-white/40 text-xs leading-relaxed mt-0.5">{modeDescFor(m.id, lang)}</span>
                              </span>
                              {active && <Check size={14} className="text-violet-400 shrink-0 mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <p className="text-white/30 text-xs mt-2">{modeDescFor(currentModeInfo.id, lang)}</p>
              </div>

              {/* Voreinstellungen — ein Klick setzt alle Regler dieses Modus */}
              {modePresets.length > 0 && (
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Sparkles size={13} className="text-white/40" />
                    {t.presets}
                  </p>
                  {/* flex statt fester Spaltenzahl: Modi mit nur einer Einstellung bringen
                      auch nur ein Preset mit (siehe Backend/clashRoyale/core/modePresets.js) */}
                  <div className="flex gap-2">
                    {modePresets.map(p => {
                      const meta = PRESET_META[p.id];
                      if (!meta) return null;
                      const PresetIcon = meta.icon;
                      const active = activePresetId === p.id;
                      const copy = meta[lang] || meta.de;
                      return (
                        <button key={p.id} onClick={() => handleApplyPreset(p.id)} title={copy.desc}
                          className={`flex-1 flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-violet-500 text-white border-violet-500'
                              : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'
                          }`}>
                          <PresetIcon size={14} className={active ? 'text-white' : 'text-white/40'} />
                          {copy.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {activePresetId
                      ? (PRESET_META[activePresetId][lang] || PRESET_META[activePresetId].de).desc
                      : `${t.presetCustom} — ${t.presetsNote}`}
                  </p>
                </div>
              )}

              {/* Kartenpool — gilt global für alle Spielmodi */}
              <div>
                <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                  <Ban size={13} className="text-white/40" />
                  {t.cardPool}
                </p>
                <button onClick={() => setExcludeOpen(true)}
                  className="w-full flex items-center justify-between gap-2 bg-black/30 border border-white/10 hover:border-white/25 rounded-lg px-3.5 py-2.5 transition-colors text-left">
                  <span className={`text-sm font-semibold ${excludedCards.length ? 'text-white' : 'text-white/50'}`}>
                    {excludedCards.length === 0
                      ? t.allCardsInDraft(ALL_CARDS.length)
                      : t.excludedInDraft(excludedCards.length, poolSize)}
                  </span>
                  <span className="text-violet-400 text-xs font-semibold shrink-0">{t.edit}</span>
                </button>
                <p className="text-white/30 text-xs mt-2">
                  {t.cardPoolNote}
                </p>
                {poolTooSmall && (
                  <p className="text-red-400 text-xs mt-1">
                    {t.poolTooSmall(modeNameFor(currentModeInfo.id, lang), requiredPool, poolSize)}
                  </p>
                )}
              </div>

              {/* Timer — Elixir Rush/Angel Royale laufen in Echtzeit, Karten-Evolution und das
                  Labyrinth haben eigene Gesamt-Timer statt eines Zug-Timers */}
              {!['elixir-rush', 'card-evolution', 'angel-royale', 'dark-maze'].includes(lobbyData?.mode) && (
              <div>
                <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                  <Clock size={13} className="text-white/40" />
                  {lobbyData?.mode === 'auction' ? t.timePerRound : t.timePerPick}
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  {TIMER_OPTIONS.map(s => (
                    <button key={s} onClick={() => handleSetTimer(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${currentTimer === s ? 'bg-violet-500 text-white border-violet-500' : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                      {s}s
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input type="number" min={5} max={300} placeholder="Custom"
                      className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-violet-500 outline-none tabular-nums placeholder-gray-600"
                      onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetTimer(Math.max(5, Math.min(300, Number(e.target.value))))}
                      onBlur={e => e.target.value && handleSetTimer(Math.max(5, Math.min(300, Number(e.target.value))))} />
                    <span className="text-white/30 text-xs">s</span>
                  </div>
                </div>
              </div>
              )}

              {lobbyData?.mode === 'elixir-rush' && (<>
                {/* Marktplatz-Größe */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Zap size={13} className="text-fuchsia-400" />
                    {t.marketplaceCards}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[3, 4, 5, 6, 7, 8].map(n => (
                      <button key={n} onClick={() => handleSetRushMarketSize(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentRushMarket === n ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {t.marketplaceCardsNote}
                  </p>
                </div>

                {/* Kartenzeit */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-fuchsia-400" />
                    {t.marketplaceLifetime}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[5, 8, 10, 15, 20, 30].map(s => (
                      <button key={s} onClick={() => handleSetRushLifetime(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentRushLifetime === s ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {t.marketplaceLifetimeNote}
                  </p>
                </div>

                {/* Elixier anderer anzeigen */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.showOthersElixir}</p>
                    <p className="text-white/30 text-xs mt-0.5">{t.showOthersElixirNoteRush}</p>
                  </div>
                  <button onClick={() => handleSetRushShowElixir(!currentRushShowElixir)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentRushShowElixir ? 'bg-fuchsia-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentRushShowElixir ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Restzeit-Timer bei Karten anzeigen */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.rushShowTimer}</p>
                    <p className="text-white/30 text-xs mt-0.5">{t.rushShowTimerNote}</p>
                  </div>
                  <button onClick={() => handleSetRushShowTimer(!currentRushShowTimer)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentRushShowTimer ? 'bg-fuchsia-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentRushShowTimer ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </>)}

              {lobbyData?.mode === 'angel-royale' && (<>
                {/* Spawn-Rate (cardsPerSecond) */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <FishingRod size={13} className="text-sky-400" />
                    {t.fishSpawnRate}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[0.5, 0.75, 1, 1.5, 2].map(r => (
                      <button key={r} onClick={() => handleSetFishSpawnRate(r)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border tabular-nums ${
                          currentFishSpawnRate === r ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.fishSpawnRateNote}</p>
                </div>

                {/* Angel-Cooldown (catchCooldown) */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-sky-400" />
                    {t.fishCooldown}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[0, 1, 2, 3, 5].map(s => (
                      <button key={s} onClick={() => handleSetFishCooldown(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentFishCooldown === s ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.fishCooldownNote}</p>
                </div>
              </>)}

              {lobbyData?.mode === 'dark-maze' && (
                /* Zeitlimit (timeLimitInSeconds) */
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-violet-400" />
                    {t.mazeTime}
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {[60, 90, 120, 180, 240].map(s => (
                      <button key={s} onClick={() => handleSetMazeTime(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentMazeTime === s ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={30} max={600} placeholder="Custom"
                        className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-violet-500 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetMazeTime(Math.max(30, Math.min(600, Number(e.target.value))))}
                        onBlur={e => e.target.value && handleSetMazeTime(Math.max(30, Math.min(600, Number(e.target.value))))} />
                      <span className="text-white/30 text-xs">s</span>
                    </div>
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.mazeTimeNote}</p>
                </div>
              )}

              {lobbyData?.mode === 'card-evolution' && (<>
                {/* Pick-Runden Zeit (Runde 1 & 3) */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-cyan-400" />
                    {t.evolutionPickTimer}
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {[30, 40].map(s => (
                      <button key={s} onClick={() => handleSetEvolutionPickSeconds(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentEvolutionPickSeconds === s ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={5} max={120} placeholder="Custom"
                        className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-cyan-500 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetEvolutionPickSeconds(Math.max(5, Math.min(120, Number(e.target.value))))}
                        onBlur={e => e.target.value && handleSetEvolutionPickSeconds(Math.max(5, Math.min(120, Number(e.target.value))))} />
                      <span className="text-white/30 text-xs">s</span>
                    </div>
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.evolutionPickTimerNote}</p>
                </div>

                {/* Sabotage-Runden Zeit (Runde 2) */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-amber-400" />
                    {t.evolutionSabotageTimer}
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {[20, 30].map(s => (
                      <button key={s} onClick={() => handleSetEvolutionSabotageSeconds(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentEvolutionSabotageSeconds === s ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={5} max={60} placeholder="Custom"
                        className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-amber-500 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetEvolutionSabotageSeconds(Math.max(5, Math.min(60, Number(e.target.value))))}
                        onBlur={e => e.target.value && handleSetEvolutionSabotageSeconds(Math.max(5, Math.min(60, Number(e.target.value))))} />
                      <span className="text-white/30 text-xs">s</span>
                    </div>
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.evolutionSabotageTimerNote}</p>
                </div>

                {/* Start-Tokens */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Sparkles size={13} className="text-cyan-400" />
                    {t.evolutionTokens}
                  </p>
                  <div className="flex items-center gap-1">
                    <input type="number" min={1} max={99} defaultValue={currentEvolutionTokens} key={`tokens-${currentEvolutionTokens}`}
                      className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:border-cyan-500 outline-none tabular-nums"
                      onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetEvolutionTokens(Math.max(1, Math.min(99, Number(e.target.value))))}
                      onBlur={e => e.target.value && handleSetEvolutionTokens(Math.max(1, Math.min(99, Number(e.target.value))))} />
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.evolutionTokensNote}</p>
                </div>
              </>)}

              {lobbyData?.mode === 'shadow-carousel' && (<>
                {/* Karten pro Tisch */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Repeat size={13} className="text-violet-400" />
                    {t.cardsPerTable}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[8, 12, 16].map(n => {
                      const maxP = Math.min(8, Math.floor(poolSize / n));
                      const unplayable = maxP < 2;
                      return (
                        <button key={n} onClick={() => handleSetCarouselCards(n)} disabled={unplayable}
                          title={unplayable ? t.cardsPerTableDisabledTitle(poolSize, n) : t.maxPlayersTitle(maxP)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                            unplayable ? 'bg-black/30 text-white/20 border-white/5 cursor-not-allowed'
                            : currentCarouselCards === n ? 'bg-violet-500 text-white border-violet-500'
                            : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {currentCarouselCards === 8
                      ? t.carouselAllUsed
                      : t.carouselSomeUnused(currentCarouselCards - 8)}
                    {' '}{t.carouselMaxPlayersNote(carouselMaxPlayers)}
                  </p>
                  {carouselTooMany && (
                    <p className="text-red-400 text-xs mt-1">
                      {t.carouselTooMany(activePlayers.length, poolSize, currentCarouselCards)}
                    </p>
                  )}
                </div>

                {/* Aufdecksystem */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Eye size={13} className="text-violet-400" />
                    {t.revealsPerRound}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: 'dynamic', label: t.revealDynamic },
                      { id: 'two', label: t.revealAlwaysTwo },
                      { id: 'one', label: t.revealAlwaysOne },
                    ].map(o => (
                      <button key={o.id} onClick={() => handleSetCarouselReveal(o.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${currentCarouselReveal === o.id ? 'bg-violet-500 text-white border-violet-500' : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {currentCarouselReveal === 'dynamic'
                      ? t.revealDynamicNote
                      : currentCarouselReveal === 'two'
                        ? t.revealTwoNote
                        : t.revealOneNote}
                  </p>
                </div>
              </>)}

              {lobbyData?.mode === 'snake' && (
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Worm size={13} className="text-violet-400" />
                    {t.gridSize}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[7, 8, 9, 10, 11].map(s => {
                      const tooBig = s * s > poolSize;
                      return (
                        <button key={s} onClick={() => handleSetGridSize(s)} disabled={tooBig}
                          title={tooBig ? t.gridSizeTooSmallTitle(s * s, poolSize) : undefined}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                            tooBig ? 'bg-black/30 text-white/20 border-white/5 cursor-not-allowed'
                            : currentGridSize === s ? 'bg-violet-500 text-white border-violet-500'
                            : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                          {s}×{s}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {currentGridSize === 11 ? t.gridAllCards : t.gridRandomCards(currentGridSize * currentGridSize)}
                    {excludedCards.length > 0 && t.poolSuffix(poolSize)}
                  </p>
                </div>
              )}

              {lobbyData?.mode === 'bingo' && (<>
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Hash size={13} className="text-amber-400" />
                    {t.cardsPerRound(activePlayers.length || 2)}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[2,3,4,5,6,7,8,9,10].filter(n => n >= (activePlayers.length || 2)).map(n => {
                      const tooBig = 8 * n > poolSize;
                      return (
                        <button key={n} onClick={() => handleSetCardsPerRound(n)} disabled={tooBig}
                          title={tooBig ? t.cardsPerRoundTooBigTitle(n, poolSize) : undefined}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                            tooBig ? 'bg-black/30 text-white/20 border-white/5 cursor-not-allowed'
                            : (lobbyData?.cardsPerRound || activePlayers.length || 2) === n ? 'bg-amber-400 text-black border-amber-400'
                            : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {t.cardsPerRoundNoteBingo}
                    {excludedCards.length > 0 && t.poolFor8Rounds(poolSize)}
                  </p>
                </div>

                {/* Zeitlimit pro Token im Token-Shop */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-amber-400" />
                    {t.timePerToken}
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {TIMER_OPTIONS.map(s => (
                      <button key={s} onClick={() => handleSetTokenShopTimer(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${currentTokenShopTimer === s ? 'bg-amber-400 text-black border-amber-400' : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}s
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={10} max={300} placeholder="Custom"
                        className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-amber-400 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetTokenShopTimer(Math.max(10, Math.min(300, Number(e.target.value))))}
                        onBlur={e => e.target.value && handleSetTokenShopTimer(Math.max(10, Math.min(300, Number(e.target.value))))} />
                      <span className="text-white/30 text-xs">s</span>
                    </div>
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    {t.tokenTimeoutNote}
                  </p>
                </div>
              </>)}

              {lobbyData?.mode === 'auction' && (<>
                {/* Karten pro Runde */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Droplets size={13} className="text-purple-400" />
                    {t.cardsPerRound(activePlayers.length || 2)}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[2,3,4,5,6,7,8].filter(n => n >= (activePlayers.length || 2)).map(n => {
                      const tooBig = 8 * n > poolSize;
                      return (
                        <button key={n} onClick={() => handleSetCardsPerRound(n)} disabled={tooBig}
                          title={tooBig ? t.cardsPerRoundTooBigTitle(n, poolSize) : undefined}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                            tooBig ? 'bg-black/30 text-white/20 border-white/5 cursor-not-allowed'
                            : (lobbyData?.cardsPerRound || activePlayers.length || 2) === n ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {excludedCards.length > 0 && (
                    <p className="text-white/30 text-xs mt-2">{t.poolFor8RoundsStandalone(poolSize)}</p>
                  )}
                </div>

                {/* Start-Elixir */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Droplets size={13} className="text-violet-400" />
                    {t.startingElixir}
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {[50, 100, 150, 200].map(v => (
                      <button key={v} onClick={() => handleSetStartElixir(v)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${currentStartElixir === v ? 'bg-violet-500 text-white border-violet-500' : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {v}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={10} max={500} placeholder="Custom"
                        className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-1.5 text-white text-sm text-center focus:border-violet-500 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetStartElixir(Number(e.target.value))}
                        onBlur={e => e.target.value && handleSetStartElixir(Number(e.target.value))} />
                    </div>
                  </div>
                </div>

                {/* Elixier anderer anzeigen */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.showOthersElixir}</p>
                    <p className="text-white/30 text-xs mt-0.5">{t.showOthersElixirNoteAuction}</p>
                  </div>
                  <button onClick={() => handleSetShowElixir(!currentShowElixir)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentShowElixir ? 'bg-violet-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentShowElixir ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Mutterhexen Besuche */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.motherWitchVisits}</p>
                    <p className="text-white/30 text-xs mt-0.5">{t.motherWitchNote}</p>
                  </div>
                  <button onClick={() => handleSetMotherWitch(!currentMotherWitch)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentMotherWitch ? 'bg-violet-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentMotherWitch ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </>)}

              <button onClick={handleStart} disabled={!canStart}
                className="w-full bg-violet-600 disabled:bg-white/5 disabled:text-white/30 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                <Play size={15} />
                {canStart
                  ? t.startGame
                  : carouselTooMany
                    ? t.startBlockedCarousel(carouselMaxPlayers, currentCarouselCards)
                    : poolTooSmall
                      ? t.startBlockedPool(poolSize, requiredPool)
                      : t.startBlockedPlayers}
              </button>
            </div>
          )}

          {!canControlLobby && (
            <div className="panel p-5 space-y-2">
              <p className="text-white/40 text-xs uppercase tracking-wider">{t.gameMode}</p>
              <div className="flex items-center gap-2">
                <CurrentModeIcon size={15} className="text-violet-400 shrink-0" />
                <span className="text-white font-bold text-sm">{modeNameFor(currentModeInfo.id, lang)}</span>
              </div>
              <p className="text-white/30 text-xs leading-relaxed">{modeDescFor(currentModeInfo.id, lang)}</p>
              {excludedCards.length > 0 && (
                <button onClick={() => setExcludeOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                  <Ban size={11} className="text-red-400 shrink-0" />
                  {t.excludedCardsView(excludedCards.length)}
                </button>
              )}
              <p className="text-white/30 text-sm text-center pt-3">{t.waitingForHost}</p>
            </div>
          )}

          </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Game ──────────────────────────────────────────────────────────────────
  const gameModeName = modeNameFor(lobbyData?.mode || 'snake', lang);
  if (phase === 'game') return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0a0a0d]">
      <SEO title={gameModeName} description={t.gameSeoDesc} path="/clash-royale" lang={lang} noindex />
      <div className="shrink-0 h-12 bg-black/25 border-b border-white/10 flex items-center px-4 gap-3">
        {lobbyData?.mode === 'auction'
          ? <Droplets size={15} className="text-purple-400 shrink-0" />
          : lobbyData?.mode === 'bingo'
            ? <Hash size={15} className="text-amber-400 shrink-0" />
            : lobbyData?.mode === 'shadow-carousel'
              ? <Repeat size={15} className="text-violet-400 shrink-0" />
              : lobbyData?.mode === 'elixir-rush'
                ? <Zap size={15} className="text-fuchsia-400 shrink-0" />
                : lobbyData?.mode === 'card-evolution'
                  ? <Sparkles size={15} className="text-cyan-400 shrink-0" />
                  : lobbyData?.mode === 'angel-royale'
                    ? <FishingRod size={15} className="text-sky-400 shrink-0" />
                    : lobbyData?.mode === 'dark-maze'
                      ? <Flashlight size={15} className="text-violet-400 shrink-0" />
                      : <Worm size={15} className="text-violet-400 shrink-0" />}
        <span className="text-white font-semibold text-sm">{gameModeName}</span>
        <div className="flex-1" />
        {error && <span className="text-red-400 text-xs animate-pulse">{error}</span>}
        <LanguageSelect lang={lang} onChange={changeLang} />
        {isClashAdmin && (
          <button onClick={() => setShowAdminPanel(v => !v)} title={t.adminControlTitle}
            className={`p-1.5 rounded-lg border transition-colors ${showAdminPanel ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'border-white/10 text-white/40 hover:text-violet-300 hover:border-violet-500/30'}`}>
            <Shield size={14} />
          </button>
        )}
        {canControlLobby && !gameOver && (
          <button onClick={handleCancelGame} title={t.cancelGameTitle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold">
            <XCircle size={13} /> {t.cancelGameBtn}
          </button>
        )}
        <button onClick={handleLeave}
          className="text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
          <LogOut size={15} />
        </button>
      </div>
      {showAdminPanel && isClashAdmin && (
        <AdminControlPanel
          players={(lobbyData?.players || []).filter(p => !p.isAdmin)}
          hostId={lobbyData?.host}
          onTransferHost={handleTransferHost}
          onSetSpectator={handleSetPlayerSpectator}
          onClose={() => setShowAdminPanel(false)}
          t={t}
        />
      )}
      <div className="flex-1 overflow-hidden">
        {gameOver ? (
          <GameOverScreen gameOver={gameOver} myId={myId || socketRef.current?.id} isHost={canControlLobby}
            isAdmin={isClashAdmin}
            onSwapCard={(targetPlayerId, deckIndex, newCardId) =>
              emit('clash:admin:swapCard', { code: lobbyData?.code, targetPlayerId, deckIndex, newCardId })}
            onLeave={handleLeave} onRestart={handleRestart} lang={lang} t={t} />
        ) : lobbyData?.mode === 'auction' ? (
          <ElixirAuction
            auctionState={auctionState}
            revealState={auctionReveal}
            myPlayerId={myId || socketRef.current?.id}
            myBid={myBid}
            onBid={handleAuctionBid}
            showElixirProp={lobbyData?.showElixir}
            motherWitchVisit={motherWitchVisit}
            onMotherWitchRespond={handleMotherWitchRespond}
            lang={lang}
          />
        ) : lobbyData?.mode === 'bingo' ? (
          <BingoRoyale
            bingoState={bingoState}
            myPlayerId={myId || socketRef.current?.id}
            onPick={handleBingoPick}
            onPowerup={handleBingoPowerup}
            onTokenAction={handleBingoTokenAction}
            players={lobbyData?.players || []}
            lang={lang}
          />
        ) : lobbyData?.mode === 'shadow-carousel' ? (
          <ShadowCarousel
            carouselState={carouselState}
            myPlayerId={myId || socketRef.current?.id}
            onFlip={handleCarouselFlip}
            onPick={handleCarouselPick}
            lang={lang}
          />
        ) : lobbyData?.mode === 'elixir-rush' ? (
          <ElixirRush
            rushState={rushState}
            myPlayerId={myId || socketRef.current?.id}
            onBuy={handleRushBuy}
            denied={rushDenied}
            lang={lang}
          />
        ) : lobbyData?.mode === 'card-evolution' ? (
          <CardEvolution
            evoState={evoState}
            myPlayerId={myId || socketRef.current?.id}
            onAction={handleEvoAction}
            onResolvePending={handleEvoResolvePending}
            onLock={handleEvoLock}
            onSabotage={handleEvoSabotage}
            lang={lang}
          />
        ) : lobbyData?.mode === 'angel-royale' ? (
          <AngelRoyale
            fishState={fishState}
            myPlayerId={myId || socketRef.current?.id}
            onCatch={handleFishCatch}
            denied={fishDenied}
            lang={lang}
          />
        ) : lobbyData?.mode === 'dark-maze' ? (
          <DarkMaze
            mazeState={mazeState}
            myPlayerId={myId || socketRef.current?.id}
            onMove={handleMazeMove}
            onPickup={handleMazePickup}
            onDraftPick={handleMazeDraftPick}
            onJokerPick={handleMazeJokerPick}
            onCloseDraft={handleMazeCloseDraft}
            lang={lang}
          />
        ) : gameState ? (
          <SnakeRoyale
            gameState={gameState}
            players={lobbyData?.players || []}
            myPlayerId={socketRef.current?.id || myId}
            onPickCard={handlePickCard}
            lang={lang}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-white/40 text-sm animate-pulse">{t.loadingGame}</p>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}

// ── Kartenpool-Modal: Karten global vom Draft ausschließen ──────────────────
const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const RARITY_LABEL = { Common: 'Gewöhnlich', Rare: 'Selten', Epic: 'Episch', Legendary: 'Legendär', Champion: 'Champions' };

const CARD_EXCLUSION_I18N = {
  de: {
    title: 'Kartenpool',
    tabCards: 'Karten',
    tabPresets: 'Presets',
    searchPlaceholder: 'Karte suchen…',
    excludedInDraft: (excluded, inDraft) => `${excluded} ausgeschlossen · ${inDraft} im Draft`,
    reset: 'Zurücksetzen',
    editNote: 'Klicke auf eine Karte, um sie aus dem Draft zu entfernen — gilt für alle Spielmodi dieser Lobby.',
    readOnlyNote: 'Nur der Host (oder Admin) kann den Kartenpool ändern.',
    noneFound: 'Keine Karte gefunden.',
    presetsIntro: 'Ein Preset setzt den Kartenpool auf eine feste Kartenauswahl — alle übrigen Karten werden ausgeschlossen.',
    presetsEmpty: 'Noch keine Presets vorhanden.',
    presetsLoading: 'Lade Presets…',
    presetsError: 'Presets konnten nicht geladen werden.',
    presetApply: 'Laden',
    presetActive: 'Aktiv',
    presetAllCards: 'Alle Karten',
    presetAllCardsDesc: 'Kein Ausschluss — der komplette Kartensatz ist im Draft.',
    presetCardCount: (n) => `${n} Karten`,
    presetAuto: 'Automatisch erkannt',
    presetAutoNote: () => 'Aus echten Spielen dieses offiziellen Modus erkannt — enthält die Karten der letzten 14 Tage und zieht nach, wenn Supercell den Pool ändert.',
    presetMissing: (n) => `${n} Karten des Presets kennt diese Seite nicht und werden übersprungen.`,
  },
  en: {
    title: 'Card pool',
    tabCards: 'Cards',
    tabPresets: 'Presets',
    searchPlaceholder: 'Search cards…',
    excludedInDraft: (excluded, inDraft) => `${excluded} excluded · ${inDraft} in the draft`,
    reset: 'Reset',
    editNote: 'Click a card to remove it from the draft — applies to every game mode in this lobby.',
    readOnlyNote: 'Only the host (or an admin) can change the card pool.',
    noneFound: 'No cards found.',
    presetsIntro: 'A preset sets the card pool to a fixed selection — every other card is excluded.',
    presetsEmpty: 'No presets available yet.',
    presetsLoading: 'Loading presets…',
    presetsError: 'Presets could not be loaded.',
    presetApply: 'Load',
    presetActive: 'Active',
    presetAllCards: 'All cards',
    presetAllCardsDesc: 'No exclusions — the complete card set is in the draft.',
    presetCardCount: (n) => `${n} cards`,
    presetAuto: 'Auto-detected',
    presetAutoNote: () => 'Detected from real games of this official mode — contains the cards seen in the last 14 days and follows along when Supercell changes the pool.',
    presetMissing: (n) => `${n} cards of this preset are unknown to this site and get skipped.`,
  },
};

// Presets-Tab: fertige Kartenpools laden. Quelle 'auto' = aus echten Battlelogs erkannter
// Kartenpool eines offiziellen Clash-Royale-Spezialmodus, 'admin' = selbst angelegt.
function PresetsTab({ excluded, canEdit, onApplyPreset, L }) {
  const [state, setState] = React.useState({ status: 'loading', presets: [] });

  React.useEffect(() => {
    let alive = true;
    fetch('/api/clash/presets')
      .then(r => r.json())
      .then(d => { if (alive) setState({ status: 'ready', presets: d.presets || [] }); })
      .catch(() => { if (alive) setState({ status: 'error', presets: [] }); });
    return () => { alive = false; };
  }, []);

  const validIds = React.useMemo(() => new Set(ALL_CARDS.map(c => c.id)), []);
  const excludedSet = new Set(excluded);
  // Der aktuelle Pool = alle Karten minus die ausgeschlossenen
  const poolIds = ALL_CARDS.filter(c => !excludedSet.has(c.id)).map(c => c.id);
  const isActive = (cardIds) => {
    const known = cardIds.filter(id => validIds.has(id));
    return known.length === poolIds.length && known.every(id => !excludedSet.has(id));
  };

  if (state.status === 'loading') return <p className="text-white/40 text-sm text-center py-10">{L.presetsLoading}</p>;
  if (state.status === 'error') return <p className="text-red-400 text-sm text-center py-10">{L.presetsError}</p>;

  const entries = [
    { presetId: '__all__', name: L.presetAllCards, description: L.presetAllCardsDesc, cardIds: ALL_CARDS.map(c => c.id), source: 'builtin' },
    ...state.presets,
  ];

  return (
    <div className="space-y-3">
      <p className="text-white/30 text-xs">{L.presetsIntro}</p>
      {state.presets.length === 0 && (
        <p className="text-white/30 text-xs italic">{L.presetsEmpty}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map(preset => {
          const known = preset.cardIds.filter(id => validIds.has(id));
          const missing = preset.cardIds.length - known.length;
          const active = isActive(preset.cardIds);
          return (
            <div key={preset.presetId}
              className={`panel p-4 flex flex-col gap-2.5 ${active ? 'border-violet-500/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{preset.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">{L.presetCardCount(known.length)}</p>
                </div>
                {preset.source === 'auto' && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-300 border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                    {L.presetAuto}
                  </span>
                )}
              </div>

              {preset.description && (
                <p className="text-white/40 text-xs leading-relaxed">{preset.description}</p>
              )}
              {preset.source === 'auto' && (
                <p className="text-white/25 text-[11px] leading-relaxed">{L.presetAutoNote()}</p>
              )}
              {missing > 0 && <p className="text-amber-400/70 text-[11px]">{L.presetMissing(missing)}</p>}

              {/* Kartenvorschau — die ersten Karten des Pools */}
              <div className="flex flex-wrap gap-1">
                {known.slice(0, 14).map(id => (
                  <img key={id} src={`${CARD_CDN}${id}.png`} alt="" loading="lazy" decoding="async"
                    className="w-6 h-7 object-cover rounded-[3px] border border-white/10"
                    onError={e => { e.target.style.display = 'none'; }} />
                ))}
                {known.length > 14 && (
                  <span className="text-white/30 text-[10px] self-center ml-1">+{known.length - 14}</span>
                )}
              </div>

              {active ? (
                <span className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300">
                  <Check size={13} /> {L.presetActive}
                </span>
              ) : (
                <button onClick={() => onApplyPreset(known)} disabled={!canEdit || known.length === 0}
                  className="text-xs font-bold py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {L.presetApply}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardExclusionModal({ excluded, canEdit, onToggle, onReset, onSetExcluded, onClose, lang = 'de' }) {
  const [query, setQuery] = React.useState('');
  const [tab, setTab] = React.useState('cards'); // 'cards' | 'presets'
  const excludedSet = new Set(excluded);
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_CARDS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CARDS;
  const L = CARD_EXCLUSION_I18N[lang] || CARD_EXCLUSION_I18N.de;

  // Preset laden = alles außer den Preset-Karten ausschließen
  const applyPreset = (cardIds) => {
    const keep = new Set(cardIds);
    onSetExcluded(ALL_CARDS.filter(c => !keep.has(c.id)).map(c => c.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <span className="text-white font-bold flex items-center gap-2">
            <Ban size={15} className="text-red-400" /> {L.title}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
        </div>

        {/* Karten einzeln sperren oder ein fertiges Preset laden */}
        <div className="flex border-b border-white/5 shrink-0">
          {[
            { id: 'cards', label: L.tabCards, icon: LayoutGrid },
            { id: 'presets', label: L.tabPresets, icon: Sparkles },
          ].map(item => {
            const TabIcon = item.icon;
            return (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-colors border-b-2 ${
                  tab === item.id ? 'border-violet-400 text-white bg-white/[0.03]' : 'border-transparent text-white/40 hover:text-white/70'
                }`}>
                <TabIcon size={13} />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === 'presets' ? (
          <div className="overflow-y-auto custom-scrollbar p-5">
            <PresetsTab excluded={excluded} canEdit={canEdit} onApplyPreset={applyPreset} L={L} />
          </div>
        ) : (<>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] focus-within:border-violet-500 transition-colors">
            <Search size={13} className="text-white/30 shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={L.searchPlaceholder}
              className="bg-transparent text-white text-sm placeholder-gray-600 outline-none w-full" />
          </div>
          <span className="text-white/40 text-xs shrink-0">
            {L.excludedInDraft(excluded.length, ALL_CARDS.length - excluded.length)}
          </span>
          {canEdit && excluded.length > 0 && (
            <button onClick={onReset}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shrink-0">
              {L.reset}
            </button>
          )}
        </div>
        <p className="px-5 pt-3 text-white/30 text-xs shrink-0">
          {canEdit ? L.editNote : L.readOnlyNote}
        </p>
        <div className="overflow-y-auto custom-scrollbar p-5 space-y-5">
          {RARITY_ORDER.map(rarity => {
            const cards = filtered.filter(c => c.rarity === rarity);
            if (!cards.length) return null;
            return (
              // content-visibility: auto — der Browser überspringt Rendern/Painting von Abschnitten
              // außerhalb des sichtbaren Bereichs, das macht das Scrollen über 122 Karten flüssig
              <div key={rarity} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 480px' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: RARITY_COLOR[rarity] }}>
                  {lang === 'en' ? rarity : (RARITY_LABEL[rarity] || rarity)}
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
                  {cards.map(card => {
                    const isExcluded = excludedSet.has(card.id);
                    return (
                      <button key={card.id} title={card.name}
                        onClick={() => canEdit && onToggle(card.id)}
                        disabled={!canEdit}
                        className={`relative aspect-[5/6] rounded-lg overflow-hidden border ${
                          isExcluded ? 'border-red-500/60 bg-red-500/5' : 'border-white/10 bg-black/30'
                        } ${canEdit ? 'hover:border-white/40' : 'cursor-default'}`}>
                        <img src={`${CARD_CDN}${card.id}.png`} alt={card.name}
                          loading="lazy" decoding="async" draggable={false}
                          className={`w-full h-full object-cover ${isExcluded ? 'grayscale opacity-30' : ''}`}
                          onError={e => { e.target.style.display = 'none'; }} />
                        {isExcluded && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Ban size={16} className="text-red-400" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-white/40 text-sm text-center py-8">{L.noneFound}</p>}
        </div>
        </>)}
      </div>
    </div>
  );
}

// ── Admin-Steuerung (während einer laufenden Runde) ─────────────────────────
function AdminControlPanel({ players, hostId, onTransferHost, onSetSpectator, onClose, t }) {
  return (
    <div className="shrink-0 bg-black/25 border-b border-violet-500/20 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-violet-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Shield size={12} /> {t.adminControlTitle}
        </span>
        <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5">
            <PlayerAvatar avatarId={p.avatar} size={20} />
            <span className="text-white text-xs font-semibold max-w-[100px] truncate">{p.name}</span>
            {p.id === hostId && <Crown size={10} className="text-amber-400 shrink-0" />}
            {p.isSpectator && <span className="text-[8px] text-white/40 border border-white/10 px-1 rounded-lg shrink-0">{t.spectator}</span>}
            <button onClick={() => onSetSpectator(p.id, !p.isSpectator)}
              title={p.isSpectator ? t.reactivateTitle : t.setSpectatorTitle}
              className={`text-[9px] px-1.5 py-0.5 rounded-lg border transition-colors shrink-0 ${p.isSpectator ? 'border-violet-500/40 text-violet-400 hover:bg-violet-500/10' : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}>
              {p.isSpectator ? t.reactivate : t.setSpectator}
            </button>
            {p.id !== hostId && (
              <button onClick={() => onTransferHost(p.id)} title={t.transferHostTitle}
                className="text-white/40 hover:text-amber-400 transition-colors p-0.5 shrink-0">
                <ArrowLeftRight size={11} />
              </button>
            )}
          </div>
        ))}
        {players.length === 0 && <p className="text-white/30 text-xs italic">{t.noPlayersInSession}</p>}
      </div>
    </div>
  );
}

// ── Admin: Deck-Karte im Endscreen austauschen ──────────────────────────────
function AdminCardSwapModal({ player, deckIndex, onPick, onClose, lang = 'de', t }) {
  const [query, setQuery] = React.useState('');
  const oldCard = player.deck[deckIndex];
  const deckIds = new Set(player.deck.map(c => c.id));
  const champCount = player.deck.filter((c, i) => c.isChampion && i !== deckIndex).length;
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_CARDS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CARDS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <span className="text-white font-bold flex items-center gap-2">
            <Shield size={15} className="text-violet-400" /> {t.swapCardTitle(player.name)}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0 flex-wrap">
          {oldCard && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-9 aspect-[5/6] rounded-lg overflow-hidden border border-white/10 bg-black/30">
                <img src={`${CARD_CDN}${oldCard.id}.png`} alt={oldCard.name}
                  className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
              </div>
              <span className="text-white/40 text-xs">{t.replaceWith(oldCard.name)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] focus-within:border-violet-500 transition-colors">
            <Search size={13} className="text-white/30 shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchCardPlaceholder} autoFocus
              className="bg-transparent text-white text-sm placeholder-gray-600 outline-none w-full" />
          </div>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-5 space-y-5">
          {RARITY_ORDER.map(rarity => {
            const cards = filtered.filter(c => c.rarity === rarity);
            if (!cards.length) return null;
            return (
              <div key={rarity} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 480px' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: RARITY_COLOR[rarity] }}>
                  {lang === 'en' ? rarity : (RARITY_LABEL[rarity] || rarity)}
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
                  {cards.map(card => {
                    const inDeck = deckIds.has(card.id);
                    const champBlocked = !inDeck && card.isChampion && champCount >= 2;
                    const disabled = inDeck || champBlocked;
                    return (
                      <button key={card.id} disabled={disabled}
                        title={inDeck ? t.alreadyInDeck(card.name) : champBlocked ? t.championLimitTitle(card.name) : card.name}
                        onClick={() => onPick(card.id)}
                        className={`aspect-[5/6] rounded-lg overflow-hidden border bg-black/30 ${
                          disabled ? 'border-white/5 cursor-not-allowed' : 'border-white/10 hover:border-violet-400'}`}>
                        <img src={`${CARD_CDN}${card.id}.png`} alt={card.name}
                          loading="lazy" decoding="async" draggable={false}
                          className={`w-full h-full object-cover ${disabled ? 'grayscale opacity-30' : ''}`}
                          onError={e => { e.target.style.display = 'none'; }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-white/40 text-sm text-center py-8">{t.noCardFound}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────
const SIZE_COLS = { s: 'grid-cols-4', m: 'grid-cols-3', l: 'grid-cols-2' };

// Kleiner Button neben dem Spielernamen — öffnet den QR-Code-Dialog für dessen Deck. Bleibt
// deaktiviert, wenn buildDeckLink() für mindestens eine Karte im Deck keine Supercell-ID kennt
// (z.B. sehr neue Karten) — dann gibt es lieber gar keinen Link statt einen falschen.
function DeckQrButton({ player, t, onOpen }) {
  const deckLink = buildDeckLink(player.deck);
  return (
    <button onClick={() => deckLink.ok && onOpen(player, deckLink)} disabled={!deckLink.ok}
      title={deckLink.ok ? t.deckQrBtn : t.deckQrUnavailable(deckLink.missing.join(', '))}
      className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
        deckLink.ok ? 'border-white/10 text-white/40 hover:text-violet-300 hover:border-violet-400/40' : 'border-white/5 text-white/15 cursor-not-allowed'
      }`}>
      <QrCode size={13} />
    </button>
  );
}

// ── Deck-QR-Code-Dialog: Scannen leitet direkt in die Clash-Royale-App zum Deck-Import weiter ──
function DeckQrModal({ player, deckLink, onClose, t }) {
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!deckLink.ok) return;
    let cancelled = false;
    QRCode.toDataURL(deckLink.url, { width: 240, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deckLink.ok, deckLink.url]);

  const copyLink = () => {
    if (!deckLink.ok) return;
    navigator.clipboard.writeText(deckLink.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-sm shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <span className="text-white font-bold flex items-center gap-2">
            <QrCode size={15} className="text-violet-400" /> {t.deckQrTitle(player.name)}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          {deckLink.ok ? (
            <>
              <p className="text-white/40 text-xs text-center">{t.deckQrHint}</p>
              <div className="bg-white rounded-lg p-3 w-[240px] h-[240px] flex items-center justify-center shrink-0">
                {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-full h-full" /> : <span className="text-black/30 text-xs">…</span>}
              </div>
              <div className="flex items-center gap-2 w-full">
                <button onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  {copied ? t.deckQrCopied : t.deckQrCopy}
                </button>
                <a href={deckLink.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                  <ExternalLink size={14} /> {t.deckQrOpenApp}
                </a>
              </div>
            </>
          ) : (
            <p className="text-amber-300 text-sm text-center py-6">{t.deckQrUnavailable(deckLink.missing.join(', '))}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Deck-Karte im Endscreen — für Admins klickbar, um sie auszutauschen
function DeckCardTile({ card, canSwap, onSwap, t }) {
  const img = (
    <img src={`${CARD_CDN}${card.id}.png`} alt={card.name}
      className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
  );
  if (!canSwap) return (
    <div title={card.name} className="aspect-square rounded-lg overflow-hidden">{img}</div>
  );
  return (
    <button title={t.swapCardHint(card.name)} onClick={onSwap}
      className="relative aspect-square rounded-lg overflow-hidden border border-transparent hover:border-violet-400 transition-colors group">
      {img}
      <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50">
        <ArrowLeftRight size={14} className="text-violet-300" />
      </span>
    </button>
  );
}

function GameOverScreen({ gameOver, myId, isHost, isAdmin, onSwapCard, onLeave, onRestart, lang = 'de', t }) {
  const [size, setSize] = React.useState('m');
  const [layout, setLayout] = React.useState('grid'); // 'grid' | 'list'
  const [swapTarget, setSwapTarget] = React.useState(null); // { player, deckIndex }
  const [qrTarget, setQrTarget] = React.useState(null); // { player, deckLink }

  const activePlayers = (gameOver.players || []).filter(p => !p.isSpectator);

  // Verlassen ist nicht rückholbar (zurück auf die Startseite, Wiedereintritt nur mit Code) —
  // deshalb einmal nachfragen. Der Hinweis auf "Erneut spielen" steht nur beim Host, weil nur
  // er eine neue Runde starten kann.
  const confirmLeave = () => {
    if (window.confirm(isHost ? t.leaveLobbyConfirm : t.leaveLobbyConfirmGuest)) onLeave();
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      {swapTarget && (
        <AdminCardSwapModal
          player={swapTarget.player}
          deckIndex={swapTarget.deckIndex}
          onPick={(newCardId) => {
            onSwapCard(swapTarget.player.id, swapTarget.deckIndex, newCardId);
            setSwapTarget(null);
          }}
          onClose={() => setSwapTarget(null)}
          lang={lang}
          t={t}
        />
      )}
      {qrTarget && (
        <DeckQrModal player={qrTarget.player} deckLink={qrTarget.deckLink} onClose={() => setQrTarget(null)} t={t} />
      )}
      <div className="max-w-6xl mx-auto space-y-5">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">{t.draftDone}</h2>
              <p className="text-white/40 text-xs">
                {isAdmin ? t.adminSwapHint : t.allDecksReady}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Layout toggle */}
            <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5">
              <button onClick={() => setLayout('grid')} title={t.layoutGrid}
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'grid' ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'}`}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setLayout('list')} title={t.layoutList}
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'list' ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'}`}>
                <Rows size={13} />
              </button>
            </div>
            {/* Size toggle — nur im Grid-Modus sinnvoll */}
            {layout === 'grid' && (
              <div className="flex items-center gap-1 border border-white/10 rounded-lg p-0.5">
                {Object.keys(SIZE_COLS).map(k => (
                  <button key={k} onClick={() => setSize(k)}
                    className={`w-7 h-6 text-xs font-bold rounded-[2px] transition-colors ${
                      size === k ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'
                    }`}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              {isHost ? (
                <>
                  {/* "Erneut spielen" ist die Hauptaktion — es führt zurück in die Lobby.
                      Das Verlassen daneben ist bewusst zurückhaltend gestaltet und fragt nach. */}
                  <button onClick={onRestart}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm flex items-center gap-2">
                    <Repeat size={14} />
                    {t.playAgain}
                  </button>
                  <button onClick={confirmLeave}
                    className="bg-transparent border border-white/10 text-white/50 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 font-bold px-5 py-2 rounded-lg transition-colors text-sm flex items-center gap-2">
                    <LogOut size={14} />
                    {t.leaveLobbyBtn}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-white/40 text-sm">{t.waitingForHost}</span>
                  <button onClick={confirmLeave}
                    className="bg-transparent border border-white/10 text-white/50 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 font-bold px-5 py-2 rounded-lg transition-colors text-sm flex items-center gap-2">
                    <LogOut size={14} />
                    {t.leaveLobbyBtn}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {layout === 'grid' ? (
          <div className={`grid ${SIZE_COLS[size]} gap-4`}>
            {activePlayers.map((p, i) => (
              <div key={p.id || i} className="panel p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar avatarId={p.avatar} size={36} />
                  <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
                  <DeckQrButton player={p} t={t} onOpen={(player, deckLink) => setQrTarget({ player, deckLink })} />
                  {p.id === myId && <span className="text-[10px] text-violet-400 font-semibold shrink-0">{t.youLabel}</span>}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {p.deck.map((card, ci) => (
                    <DeckCardTile key={ci} card={card} canSwap={isAdmin} t={t}
                      onSwap={() => setSwapTarget({ player: p, deckIndex: ci })} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {activePlayers.map((p, i) => (
              <div key={p.id || i} className="panel p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <PlayerAvatar avatarId={p.avatar} size={32} />
                  <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
                  <DeckQrButton player={p} t={t} onOpen={(player, deckLink) => setQrTarget({ player, deckLink })} />
                  {p.id === myId && <span className="text-[10px] text-violet-400 font-semibold shrink-0">{t.youLabel}</span>}
                  <span className="text-white/30 text-xs shrink-0">{p.deck.length}/8</span>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {p.deck.map((card, ci) => (
                    <DeckCardTile key={ci} card={card} canSwap={isAdmin} t={t}
                      onSwap={() => setSwapTarget({ player: p, deckIndex: ci })} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
