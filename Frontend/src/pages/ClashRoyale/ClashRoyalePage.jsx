import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { io } from 'socket.io-client';
import {
  Sword, Copy, Check, Users, Clock, Play, Crown, LogOut,
  Link2, UserX, Eye, EyeOff, Trophy, Worm, Droplets, Zap,
  LayoutGrid, Rows, Hash, Shield, ArrowLeftRight, XCircle, X,
  ChevronDown, Repeat, AlertTriangle, Ban, Search, Monitor, Sparkles,
} from 'lucide-react';
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
    desc: 'Starte mit 8 Wildcards und werte sie mit Evolutions-Tokens auf oder ab. Karten kommen aus einem geteilten Pool — jede Karte gehört immer nur einem Spieler gleichzeitig.',
    // Bewusst noch gesperrt (available: false) — Modus ist fertig implementiert, wird aber
    // erst nach weiteren Tests für alle freigegeben. Zeigt automatisch den "Bald verfügbar"-
    // Badge im Home-Menü und ist im Lobby-Modus-Umschalter nicht auswählbar.
    // Bewusst noch gesperrt (available: false) — Modus ist fertig implementiert, wird aber
    // erst nach weiteren Tests für alle freigegeben. Zeigt automatisch den "Bald verfügbar"-
    // Badge im Home-Menü und ist im Lobby-Modus-Umschalter nicht auswählbar.
    available: false,
  },
];

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120];

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
  'card-evolution': 'Start with 8 wildcards and upgrade or downgrade them with evolution tokens. Cards come from a shared pool — every card belongs to only one player at a time.',
};
// Modus-Namen sind größtenteils bereits englische Markennamen — nur "Blindes Karussel"/"Karten-Evolution" brauchen eine Übersetzung.
const MODE_NAME_EN = {
  'shadow-carousel': 'Shadow Carousel',
  'card-evolution': 'Card Evolution',
};
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
    modesHeading: 'Verfügbare Spielmodi (Beschreibungen)',
    viewModes: 'Modi anschauen',
    comingSoon: 'Bald verfügbar',
    support: 'Support & Feedback:',
    joinDiscord: 'Discord beitreten',
    usedBy: 'Benutzt von',

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
    evolutionTimer: 'Gesamt-Timer fürs Picken',
    evolutionTimerNote: 'Nach Ablauf werden übrig gebliebene Wildcards automatisch aufgelöst und das Spiel endet.',
    unlimited: 'Unbegrenzt',
    evolutionTokens: 'Evolutions-Tokens (normal)',
    evolutionTokensNote: 'Wie viele normale Tokens jeder Spieler zu Beginn erhält.',
    evolutionSuperTokens: 'Super-Evolutions-Tokens',
    evolutionSuperTokensNote: 'Wie viele Super-Tokens jeder Spieler zu Beginn erhält.',
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
    backToLobby: 'Zur Übersicht',
    endAnyway: 'Trotzdem beenden',
    youLabel: 'Du',
    swapCardHint: (name) => `${name} — austauschen`,
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
    modesHeading: 'Available game modes (descriptions)',
    viewModes: 'View modes',
    comingSoon: 'Coming soon',
    support: 'Support & Feedback:',
    joinDiscord: 'Join Discord',
    usedBy: 'Used by',

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
    evolutionTimer: 'Overall pick timer',
    evolutionTimerNote: 'When it runs out, leftover wildcards resolve automatically and the game ends.',
    unlimited: 'Unlimited',
    evolutionTokens: 'Evolution tokens (normal)',
    evolutionTokensNote: 'How many normal tokens each player starts with.',
    evolutionSuperTokens: 'Super evolution tokens',
    evolutionSuperTokensNote: 'How many super tokens each player starts with.',
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
    backToLobby: 'Back to overview',
    endAnyway: 'Leave anyway',
    youLabel: 'You',
    swapCardHint: (name) => `${name} — swap`,
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
              <span className={`w-2 h-2 rounded-full shrink-0 ${s.live ? 'bg-red-500' : 'bg-white/15'}`}
                title={s.live ? 'Live' : 'Offline'} />
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
  const [modesOpen, setModesOpen] = useState(false); // Hub: "Modi anschauen"-Ausklapper, standardmäßig eingeklappt
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
  const toggleLang = () => {
    const next = lang === 'de' ? 'en' : 'de';
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
    socket.on('clash:gameStart', () => { setPhase('game'); setGameOver(null); setAuctionState(null); setAuctionReveal(null); setMyBid(null); setBingoState(null); setCarouselState(null); setRushState(null); setRushDenied(null); setMotherWitchVisit(null); setEvoState(null); });
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
  const handleEvoAction = useCallback((slotIdx, tokenType, direction) =>
    emit('clash:evo:action', { code: lobbyData?.code, slotIdx, tokenType, direction }), [emit, lobbyData?.code]);
  const handleEvoResolvePending = useCallback((chosenIndex) =>
    emit('clash:evo:resolvePending', { code: lobbyData?.code, chosenIndex }), [emit, lobbyData?.code]);
  const handleSetEvolutionTimer = (seconds) => emit('clash:setEvolutionTimer', { code: lobbyData?.code, seconds });
  const handleSetEvolutionTokens = (count) => emit('clash:setEvolutionTokens', { code: lobbyData?.code, count });
  const handleSetEvolutionSuperTokens = (count) => emit('clash:setEvolutionSuperTokens', { code: lobbyData?.code, count });
  const handleRushBuy = useCallback((slotIdx, seq) =>
    emit('clash:rush:buy', { code: lobbyData?.code, slotIdx, seq }), [emit, lobbyData?.code]);
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
        title="Clash Royale Minigames"
        description={lang === 'en' ? 'Multiplayer minigames in Clash Royale style.' : 'Multiplayer Minigames im Clash Royale Stil.'}
        path="/clash-royale" />

      <div className="w-full px-2 md:px-4 xl:px-8 py-4 md:py-8">
        <div className="max-w-[105rem] mx-auto xl:grid xl:grid-cols-[18rem_1fr_18rem] xl:gap-x-10">

        {/* Hero — bleibt in der mittleren Spalte, exakt so breit wie der Content darunter */}
        <div className="flex flex-col items-center text-center gap-4 mb-10 xl:col-start-2 xl:row-start-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
              <Crown size={26} />
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight">Clash Royale</h1>
          </div>
          <p className="text-white/50 text-sm md:text-base">{t.subtitle}</p>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold transition-colors"
              title={lang === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}>
              {lang === 'de' ? 'EN' : 'DE'}
            </button>
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

          {/* Lobby erstellen / beitreten — volle Breite */}
          <div className="panel-strong overflow-hidden h-fit">
            <div className="grid grid-cols-2 border-b border-white/10">
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

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          </div>

          {/* Modi anschauen — ausklappbar, standardmäßig eingeklappt */}
          <div className="panel-strong overflow-hidden">
            <button onClick={() => setModesOpen(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors">
              <span className="flex items-center gap-2.5 text-sm font-bold text-white">
                <LayoutGrid size={15} className="text-violet-300" />
                {t.viewModes}
              </span>
              <ChevronDown size={16} className={`text-white/40 transition-transform ${modesOpen ? 'rotate-180' : ''}`} />
            </button>
            {modesOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 pt-0">
                {MODES.map(m => {
                  const Icon = m.icon;
                  const desc = modeDescFor(m.id, lang);
                  return (
                    <div key={m.id} className="panel p-5">
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                          <Icon size={16} />
                        </span>
                        <span className="text-white font-semibold text-sm">{modeNameFor(m.id, lang)}</span>
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
            )}
          </div>

          {/* Support-Kanäle — ganz unten */}
          <div className="panel p-5">
            <h2 className="text-white font-semibold text-sm mb-3">{t.support}</h2>
            <div className="flex flex-wrap gap-3">
              <a href="https://twitch.tv/vnmvalentin" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#9146FF]/50 hover:bg-[#9146FF]/10 transition-colors">
                <img src="https://cdn.simpleicons.org/twitch/9146FF" alt="Twitch" className="w-5 h-5 shrink-0" />
                <span className="text-white font-semibold text-sm">twitch.tv/vnmvalentin</span>
              </a>
              <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors">
                <img src="https://cdn.simpleicons.org/discord/5865F2" alt="Discord" className="w-5 h-5 shrink-0" />
                <span className="text-white font-semibold text-sm">{t.joinDiscord}</span>
              </a>
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
    const currentEvolutionTimer = lobbyData?.evolutionTimerSeconds || 0;
    const currentEvolutionTokens = lobbyData?.evolutionTokensStart || 15;
    const currentEvolutionSuperTokens = lobbyData?.evolutionSuperTokensStart ?? 3;
    const currentModeInfo = MODES.find(m => m.id === lobbyData?.mode) || MODES[0];
    const CurrentModeIcon = currentModeInfo.icon;

    return (
      <div className="h-full overflow-y-auto custom-scrollbar">
        <SEO title="Lobby · Clash Royale" description={t.lobbySeoDesc} path="/clash-royale" />

        {/* Kartenpool-Modal — Karten global vom Draft ausschließen */}
        {excludeOpen && (
          <CardExclusionModal
            excluded={excludedCards}
            canEdit={canControlLobby}
            onToggle={handleToggleExcludeCard}
            onReset={() => handleSetExcludedCards([])}
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
              <button
                onClick={toggleLang}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold transition-colors"
                title={lang === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}>
                {lang === 'de' ? 'EN' : 'DE'}
              </button>
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

              {/* Timer — Elixir Rush läuft in Echtzeit, Karten-Evolution hat einen Gesamt- statt Zug-Timer */}
              {lobbyData?.mode !== 'elixir-rush' && lobbyData?.mode !== 'card-evolution' && (
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

              {lobbyData?.mode === 'card-evolution' && (<>
                {/* Gesamt-Timer fürs Picken (statt Pro-Zug-Timer) */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-cyan-400" />
                    {t.evolutionTimer}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[60, 90, 0].map(s => (
                      <button key={s} onClick={() => handleSetEvolutionTimer(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          currentEvolutionTimer === s ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s === 0 ? t.unlimited : `${s}s`}
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.evolutionTimerNote}</p>
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

                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Sparkles size={13} className="text-amber-400" />
                    {t.evolutionSuperTokens}
                  </p>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={20} defaultValue={currentEvolutionSuperTokens} key={`super-${currentEvolutionSuperTokens}`}
                      className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:border-cyan-500 outline-none tabular-nums"
                      onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetEvolutionSuperTokens(Math.max(0, Math.min(20, Number(e.target.value))))}
                      onBlur={e => e.target.value && handleSetEvolutionSuperTokens(Math.max(0, Math.min(20, Number(e.target.value))))} />
                  </div>
                  <p className="text-white/30 text-xs mt-2">{t.evolutionSuperTokensNote}</p>
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
      <SEO title={gameModeName} description={t.gameSeoDesc} path="/clash-royale" />
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
                  : <Worm size={15} className="text-violet-400 shrink-0" />}
        <span className="text-white font-semibold text-sm">{gameModeName}</span>
        <div className="flex-1" />
        {error && <span className="text-red-400 text-xs animate-pulse">{error}</span>}
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold transition-colors"
          title={lang === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}>
          {lang === 'de' ? 'EN' : 'DE'}
        </button>
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
    title: 'Karten ausschließen',
    searchPlaceholder: 'Karte suchen…',
    excludedInDraft: (excluded, inDraft) => `${excluded} ausgeschlossen · ${inDraft} im Draft`,
    reset: 'Zurücksetzen',
    editNote: 'Klicke auf eine Karte, um sie aus dem Draft zu entfernen — gilt für alle Spielmodi dieser Lobby.',
    readOnlyNote: 'Nur der Host (oder Admin) kann den Kartenpool ändern.',
    noneFound: 'Keine Karte gefunden.',
  },
  en: {
    title: 'Exclude cards',
    searchPlaceholder: 'Search cards…',
    excludedInDraft: (excluded, inDraft) => `${excluded} excluded · ${inDraft} in the draft`,
    reset: 'Reset',
    editNote: 'Click a card to remove it from the draft — applies to every game mode in this lobby.',
    readOnlyNote: 'Only the host (or an admin) can change the card pool.',
    noneFound: 'No cards found.',
  },
};

function CardExclusionModal({ excluded, canEdit, onToggle, onReset, onClose, lang = 'de' }) {
  const [query, setQuery] = React.useState('');
  const excludedSet = new Set(excluded);
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_CARDS.filter(c => c.name.toLowerCase().includes(q)) : ALL_CARDS;
  const L = CARD_EXCLUSION_I18N[lang] || CARD_EXCLUSION_I18N.de;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel-strong w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <span className="text-white font-bold flex items-center gap-2">
            <Ban size={15} className="text-red-400" /> {L.title}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
        </div>
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

  const activePlayers = (gameOver.players || []).filter(p => !p.isSpectator);

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
                  <button onClick={onRestart}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm">
                    {t.playAgain}
                  </button>
                  <button onClick={onLeave}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm">
                    {t.backToLobby}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-white/40 text-sm">{t.waitingForHost}</span>
                  <button onClick={onLeave}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm">
                    {t.endAnyway}
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
