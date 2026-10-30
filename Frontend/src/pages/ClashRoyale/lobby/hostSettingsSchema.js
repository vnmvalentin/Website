// Beschreibung aller Host-Einstellungen als Daten statt als JSX.
//
// Vorher stand jede Einstellung als eigener, handgeschriebener Block in der Lobby:
// Überschrift mit Symbol, eine Reihe Buttons, ein grauer Hinweistext — vierzehnmal,
// jeweils leicht anders. Hier steht pro Einstellung eine Zeile Konfiguration, und
// HostSettings.jsx rendert sie generisch.
//
// WICHTIG — Bedienelement passend zur Server-Prüfung wählen:
// Das Backend prüft jede Einstellung in ihrem sanitize() (siehe Backend/clashRoyale/
// modes/*.js). Zwei Sorten:
//
//   • Bereich   — Math.max(min, Math.min(max, …)): jeder Wert dazwischen ist gültig
//                 → 'slider'
//   • Whitelist — LISTE.includes(Number(v)) ? … : undefined: NUR die genannten Werte
//                 → 'segmented'
//
// Ein Slider auf einer Whitelist-Einstellung würde Zwischenwerte senden, die der
// Server kommentarlos verwirft — der Regler spränge für den Host sichtbar zurück.
// Die Listen unten sind deshalb exakte Kopien der Backend-Konstanten.

// Alle Einstellungs-Symbole sind echte Clash-Royale-Grafiken — siehe ui/CrIcons.jsx.
import {
  CrClock, CrMegaDraft, CrClassicDecks, CrCards, CrElixir, CrTrader, CrEye, CrFisherman,
  CrStopwatch, CrTelescope, CrBoost, CrSkull, CrLock, CrTripleDraft, CrMotherWitch,
} from '../ui/CrIcons';

// Whitelists — müssen mit dem Backend übereinstimmen (Datei/Zeile als Fundstelle):
const RUSH_MARKET_SIZES = [3, 4, 5, 6, 7, 8];          // modes/elixirRush.js
const RUSH_LIFETIMES = [4, 6, 8, 10, 15, 20, 30];      // modes/elixirRush.js
// Aufladetempo-Stufen — dieselben IDs wie RUSH_SPEED_MS in Backend/clashRoyale/core/rushSpeed.js
const RUSH_SPEEDS = ['slow', 'normal', 'fast', 'veryfast'];
const FISH_SPAWN_RATES = [1, 1.5, 2, 2.5, 3];          // modes/angelRoyale.js
const FISH_COOLDOWNS = [0, 1, 2, 3, 5];                // modes/angelRoyale.js
const FISH_IDLE_SECONDS = [0, 3, 5, 8, 10];            // modes/angelRoyale.js
const CAROUSEL_TABLE_SIZES = [8, 12, 16];              // modes/shadowCarousel.js
const TRAP_DISGUISE_COUNTS = [1, 2, 3];                // modes/trapSetter.js
const TRAP_GRID_SIZES = [9, 12, 16];                   // modes/trapSetter.js
const PYRAMID_BLOCK_OPTIONS = [0, 1, 2, 3];            // modes/pyramidDraft.js
const PYRAMID_ROWS_HEADROOM = 8;                       // modes/pyramidDraft.js

// Kopie der Dreieckszahl-Formel aus modes/pyramidDraft.js — bestimmt, wie weit der
// Rastergrößen-Regler nach unten gehen darf (das rechnerische Minimum für 8 Runden).
function pyramidMinRows(active, blocksPerRound) {
  const needed = 8 * (Math.max(1, active) + blocksPerRound);
  let n = 1, total = 1;
  while (total < needed) { n++; total += n; }
  return n;
}

/** Farbwelten je Modus. `css` geht in den Slider-Verlauf, die übrigen sind Tailwind-Klassen. */
export const ACCENT = {
  violet: { css: '#8b5cf6', toggle: 'bg-violet-500', seg: 'bg-violet-500 text-white', icon: 'text-violet-400' },
  purple: { css: '#a855f7', toggle: 'bg-purple-500', seg: 'bg-purple-500 text-white', icon: 'text-purple-400' },
  fuchsia: { css: '#d946ef', toggle: 'bg-fuchsia-500', seg: 'bg-fuchsia-500 text-white', icon: 'text-fuchsia-400' },
  sky: { css: '#0ea5e9', toggle: 'bg-sky-500', seg: 'bg-sky-500 text-white', icon: 'text-sky-400' },
  cyan: { css: '#06b6d4', toggle: 'bg-cyan-500', seg: 'bg-cyan-500 text-white', icon: 'text-cyan-400' },
  amber: { css: '#f0b429', toggle: 'bg-amber-400', seg: 'bg-amber-400 text-black', icon: 'text-amber-400' },
  neutral: { css: '#8b5cf6', toggle: 'bg-violet-500', seg: 'bg-violet-500 text-white', icon: 'text-white/40' },
};

const secs = (v) => `${v}s`;

/**
 * Alle Einstellungen in Anzeigereihenfolge.
 *
 * Felder:
 *   key      Feld in lobbyData — zugleich der angezeigte Wert
 *   modes    Für welche Spielmodi die Einstellung gilt
 *   control  'slider' | 'segmented' | 'toggle'
 *   label / note / warning   (ctx) => string | null   — ctx siehe HostSettings.jsx
 *   apply    (actions, value) => void — welche Aktion den Wert setzt
 *
 * Slider zusätzlich: min/max (Zahl oder (ctx) => Zahl), step, format
 * Segmented zusätzlich: options(ctx) => [{ id, label, disabled?, title? }]
 */
export const HOST_SETTINGS = [
  // ── Modusübergreifend ─────────────────────────────────────────────────────
  {
    key: 'timerSeconds',
    // Elixir Rush und Angel Royale laufen in Echtzeit, Karten-Evolution und das
    // Labyrinth haben eigene Gesamt-Timer statt eines Zug-Timers. Fallensteller nutzt eine
    // eigene Einstellung fürs Verschleiern (trapDisguiseSeconds), nicht diese hier.
    modes: ['snake', 'auction', 'bingo', 'shadow-carousel', 'pyramid-draft'],
    control: 'slider',
    icon: CrClock, accent: 'neutral',
    label: ({ t, mode }) => (mode === 'auction' ? t.timePerRound : t.timePerPick),
    min: 5, max: 300, step: 5, format: secs,
    apply: (a, v) => a.setTimer(v),
  },

  // ── Snake Royale ──────────────────────────────────────────────────────────
  {
    key: 'gridSize',
    modes: ['snake'],
    control: 'slider',
    icon: CrMegaDraft, accent: 'violet',
    label: ({ t }) => t.gridSize,
    min: 7,
    // Der Server lehnt jedes Raster ab, für das der Kartenpool nicht reicht
    // (s*s > Pool). Also gar nicht erst so weit ziehen lassen.
    max: ({ poolSize }) => Math.max(7, Math.min(11, Math.floor(Math.sqrt(poolSize)))),
    step: 1,
    format: (v) => `${v}×${v}`,
    note: ({ t, value, excludedCount, poolSize }) =>
      (value === 11 ? t.gridAllCards : t.gridRandomCards(value * value))
      + (excludedCount > 0 ? t.poolSuffix(poolSize) : ''),
    apply: (a, v) => a.setGridSize(v),
  },

  // ── Elixir Auction ────────────────────────────────────────────────────────
  {
    key: 'cardsPerRound',
    modes: ['auction', 'bingo'],
    control: 'slider',
    icon: ({ mode }) => (mode === 'bingo' ? CrClassicDecks : CrCards),
    accent: ({ mode }) => (mode === 'bingo' ? 'amber' : 'purple'),
    label: ({ t, activeCount }) => t.cardsPerRound(activeCount || 2),
    // Mindestens eine Karte pro Spieler, und der Pool muss für 8 Runden reichen
    min: ({ activeCount }) => Math.max(2, activeCount || 2),
    max: ({ poolSize, mode }) => Math.max(2, Math.min(mode === 'bingo' ? 10 : 8, Math.floor(poolSize / 8))),
    step: 1,
    note: ({ t, mode, excludedCount, poolSize }) => {
      if (mode === 'bingo') return t.cardsPerRoundNoteBingo + (excludedCount > 0 ? t.poolFor8Rounds(poolSize) : '');
      return excludedCount > 0 ? t.poolFor8RoundsStandalone(poolSize) : null;
    },
    apply: (a, v) => a.setCardsPerRound(v),
  },
  {
    key: 'startElixir',
    modes: ['auction'],
    control: 'slider',
    icon: CrElixir, accent: 'violet',
    label: ({ t }) => t.startingElixir,
    min: 10, max: 500, step: 10,
    apply: (a, v) => a.setStartElixir(v),
  },
  {
    key: 'showElixir',
    modes: ['auction'],
    control: 'toggle', icon: CrEye, accent: 'violet',
    label: ({ t }) => t.showOthersElixir,
    note: ({ t }) => t.showOthersElixirNoteAuction,
    apply: (a, v) => a.setShowElixir(v),
  },
  {
    key: 'motherWitchEnabled',
    modes: ['auction'],
    control: 'toggle', icon: CrMotherWitch, accent: 'violet',
    label: ({ t }) => t.motherWitchVisits,
    note: ({ t }) => t.motherWitchNote,
    apply: (a, v) => a.setMotherWitch(v),
  },

  // ── Elixir Auction 2v2 ────────────────────────────────────────────────────
  // cardsPerRound ist hier "Karten pro Seite" (X- und Y-Karten je Runde) — eigener Eintrag
  // statt den geteilten 'auction'/'bingo'-Regler oben mitzunutzen, weil Bedeutung, Bereich
  // und Beschriftung hier komplett anders sind (siehe elixirAuction2v2.js computeRoundSizing).
  {
    key: 'cardsPerRound',
    modes: ['elixir-auction-2v2'],
    control: 'segmented',
    icon: CrCards, accent: 'purple',
    label: ({ t }) => t.cardsPerSide,
    // Untergrenze 2 (nicht 1): das geteilte clash:setCardsPerRound klemmt ohnehin auf
    // Math.max(2, …) — siehe Backend/routes/clashRoyaleRoutes.js.
    options: () => [2, 3, 4, 5, 6].map(n => ({ id: n, label: String(n) })),
    note: ({ t }) => t.cardsPerSideNote,
    apply: (a, v) => a.setCardsPerRound(v),
  },
  {
    key: 'teamElixirPool',
    modes: ['elixir-auction-2v2'],
    control: 'slider',
    icon: CrElixir, accent: 'violet',
    label: ({ t }) => t.teamElixirPool,
    note: ({ t }) => t.teamElixirPoolNote,
    min: 20, max: 2000, step: 10,
    apply: (a, v) => a.setTeamElixirPool(v),
  },

  // ── Bingo Royale ──────────────────────────────────────────────────────────
  {
    key: 'tokenShopTimerSeconds',
    modes: ['bingo'],
    control: 'slider',
    icon: CrClock, accent: 'amber',
    label: ({ t }) => t.timePerToken,
    min: 10, max: 300, step: 5, format: secs,
    note: ({ t }) => t.tokenTimeoutNote,
    apply: (a, v) => a.setTokenShopTimer(v),
  },

  // ── Blindes Karussell ─────────────────────────────────────────────────────
  {
    key: 'carouselCardsPerTable',
    modes: ['shadow-carousel'],
    control: 'segmented',
    icon: CrTrader, accent: 'violet',
    label: ({ t }) => t.cardsPerTable,
    options: ({ t, poolSize }) => CAROUSEL_TABLE_SIZES.map(n => {
      const maxPlayers = Math.min(8, Math.floor(poolSize / n));
      const unplayable = maxPlayers < 2;
      return {
        id: n,
        label: String(n),
        disabled: unplayable,
        title: unplayable ? t.cardsPerTableDisabledTitle(poolSize, n) : t.maxPlayersTitle(maxPlayers),
      };
    }),
    note: ({ t, value, carouselMaxPlayers }) =>
      `${value === 8 ? t.carouselAllUsed : t.carouselSomeUnused(value - 8)} ${t.carouselMaxPlayersNote(carouselMaxPlayers)}`,
    warning: ({ t, carouselTooMany, activeCount, poolSize, value }) =>
      (carouselTooMany ? t.carouselTooMany(activeCount, poolSize, value) : null),
    apply: (a, v) => a.setCarouselCards(v),
  },
  {
    key: 'carouselRevealMode',
    modes: ['shadow-carousel'],
    control: 'segmented',
    icon: CrEye, accent: 'violet',
    label: ({ t }) => t.revealsPerRound,
    options: ({ t }) => [
      { id: 'dynamic', label: t.revealDynamic },
      { id: 'two', label: t.revealAlwaysTwo },
      { id: 'one', label: t.revealAlwaysOne },
    ],
    note: ({ t, value }) =>
      (value === 'dynamic' ? t.revealDynamicNote : value === 'two' ? t.revealTwoNote : t.revealOneNote),
    apply: (a, v) => a.setCarouselReveal(v),
  },

  // ── Elixir Rush ───────────────────────────────────────────────────────────
  {
    key: 'rushElixirSpeed',
    modes: ['elixir-rush'],
    control: 'segmented',
    icon: CrElixir, accent: 'fuchsia',
    label: ({ t }) => t.rushSpeed,
    options: ({ t }) => RUSH_SPEEDS.map(id => ({ id, label: t.rushSpeedOptions[id] })),
    note: ({ t }) => t.rushSpeedNote,
    apply: (a, v) => a.setRushElixirSpeed(v),
  },
  {
    key: 'rushMarketSize',
    modes: ['elixir-rush'],
    control: 'segmented',
    icon: CrCards, accent: 'fuchsia',
    label: ({ t }) => t.marketplaceCards,
    options: () => RUSH_MARKET_SIZES.map(n => ({ id: n, label: String(n) })),
    note: ({ t }) => t.marketplaceCardsNote,
    apply: (a, v) => a.setRushMarketSize(v),
  },
  {
    key: 'rushCardLifetime',
    modes: ['elixir-rush'],
    control: 'segmented',
    icon: CrClock, accent: 'fuchsia',
    label: ({ t }) => t.marketplaceLifetime,
    options: () => RUSH_LIFETIMES.map(s => ({ id: s, label: secs(s) })),
    note: ({ t }) => t.marketplaceLifetimeNote,
    apply: (a, v) => a.setRushLifetime(v),
  },
  {
    key: 'rushShowElixir',
    modes: ['elixir-rush'],
    control: 'toggle', icon: CrEye, accent: 'fuchsia',
    label: ({ t }) => t.showOthersElixir,
    note: ({ t }) => t.showOthersElixirNoteRush,
    apply: (a, v) => a.setRushShowElixir(v),
  },
  {
    key: 'rushShowTimer',
    modes: ['elixir-rush'],
    control: 'toggle', icon: CrStopwatch, accent: 'fuchsia',
    label: ({ t }) => t.rushShowTimer,
    note: ({ t }) => t.rushShowTimerNote,
    apply: (a, v) => a.setRushShowTimer(v),
  },

  // ── Elixir Rush 2v2 ───────────────────────────────────────────────────────
  // Marktgröße/Kartenlebensdauer 1:1 wie im Solo-Modus, dazu Aufladetempo und Kapazität des
  // geteilten Team-Elixier-Balkens (siehe modes/elixirRush2v2.js).
  {
    key: 'rush2v2ElixirSpeed',
    modes: ['elixir-rush-2v2'],
    control: 'segmented',
    icon: CrElixir, accent: 'fuchsia',
    label: ({ t }) => t.rushSpeed,
    options: ({ t }) => RUSH_SPEEDS.map(id => ({ id, label: t.rushSpeedOptions[id] })),
    note: ({ t }) => t.rushSpeedNote,
    apply: (a, v) => a.setRush2v2ElixirSpeed(v),
  },
  {
    key: 'rush2v2MarketSize',
    modes: ['elixir-rush-2v2'],
    control: 'segmented',
    icon: CrCards, accent: 'fuchsia',
    label: ({ t }) => t.marketplaceCards,
    options: () => RUSH_MARKET_SIZES.map(n => ({ id: n, label: String(n) })),
    note: ({ t }) => t.marketplaceCardsNote,
    apply: (a, v) => a.setRush2v2MarketSize(v),
  },
  {
    key: 'rush2v2CardLifetime',
    modes: ['elixir-rush-2v2'],
    control: 'segmented',
    icon: CrClock, accent: 'fuchsia',
    label: ({ t }) => t.marketplaceLifetime,
    options: () => RUSH_LIFETIMES.map(s => ({ id: s, label: secs(s) })),
    note: ({ t }) => t.marketplaceLifetimeNote,
    apply: (a, v) => a.setRush2v2Lifetime(v),
  },
  {
    key: 'rush2v2MaxElixir',
    modes: ['elixir-rush-2v2'],
    control: 'slider',
    icon: CrElixir, accent: 'fuchsia',
    label: ({ t }) => t.rush2v2MaxElixir,
    note: ({ t }) => t.rush2v2MaxElixirNote,
    min: 10, max: 40, step: 2,
    apply: (a, v) => a.setRush2v2MaxElixir(v),
  },

  // ── Angel Royale ──────────────────────────────────────────────────────────
  {
    key: 'fishSpawnRate',
    modes: ['angel-royale'],
    control: 'segmented',
    icon: CrFisherman, accent: 'sky',
    label: ({ t }) => t.fishSpawnRate,
    options: () => FISH_SPAWN_RATES.map(r => ({ id: r, label: String(r) })),
    note: ({ t }) => t.fishSpawnRateNote,
    apply: (a, v) => a.setFishSpawnRate(v),
  },
  {
    key: 'fishCatchCooldown',
    modes: ['angel-royale'],
    control: 'segmented',
    icon: CrClock, accent: 'sky',
    label: ({ t }) => t.fishCooldown,
    options: () => FISH_COOLDOWNS.map(s => ({ id: s, label: secs(s) })),
    note: ({ t }) => t.fishCooldownNote,
    apply: (a, v) => a.setFishCooldown(v),
  },
  {
    key: 'fishIdleSeconds',
    modes: ['angel-royale'],
    control: 'segmented',
    icon: CrStopwatch, accent: 'sky',
    label: ({ t }) => t.fishIdle,
    options: ({ t }) => FISH_IDLE_SECONDS.map(s => ({ id: s, label: s === 0 ? t.fishIdleOff : secs(s) })),
    note: ({ t }) => t.fishIdleNote,
    apply: (a, v) => a.setFishIdle(v),
  },

  // ── Dunkles Labyrinth ─────────────────────────────────────────────────────
  {
    key: 'mazeTimeSeconds',
    modes: ['dark-maze'],
    control: 'slider',
    icon: CrTelescope, accent: 'violet',
    label: ({ t }) => t.mazeTime,
    min: 30, max: 600, step: 10, format: secs,
    note: ({ t }) => t.mazeTimeNote,
    apply: (a, v) => a.setMazeTime(v),
  },

  // ── Karten-Evolution ──────────────────────────────────────────────────────
  {
    key: 'evolutionPickSeconds',
    modes: ['card-evolution'],
    control: 'slider',
    icon: CrClock, accent: 'cyan',
    label: ({ t }) => t.evolutionPickTimer,
    min: 5, max: 120, step: 5, format: secs,
    note: ({ t }) => t.evolutionPickTimerNote,
    apply: (a, v) => a.setEvolutionPickSeconds(v),
  },
  {
    key: 'evolutionSabotageSeconds',
    modes: ['card-evolution'],
    control: 'slider',
    icon: CrClock, accent: 'amber',
    label: ({ t }) => t.evolutionSabotageTimer,
    min: 5, max: 60, step: 5, format: secs,
    note: ({ t }) => t.evolutionSabotageTimerNote,
    apply: (a, v) => a.setEvolutionSabotageSeconds(v),
  },
  {
    key: 'evolutionTokensStart',
    modes: ['card-evolution'],
    control: 'slider',
    icon: CrBoost, accent: 'cyan',
    label: ({ t }) => t.evolutionTokens,
    min: 1, max: 99, step: 1,
    note: ({ t }) => t.evolutionTokensNote,
    apply: (a, v) => a.setEvolutionTokens(v),
  },

  // ── Fallensteller ─────────────────────────────────────────────────────────
  {
    key: 'trapDisguiseSeconds',
    modes: ['trap-setter'],
    control: 'slider',
    icon: CrClock, accent: 'amber',
    label: ({ t }) => t.trapDisguiseTime,
    min: 5, max: 90, step: 5, format: secs,
    note: ({ t }) => t.trapDisguiseTimeNote,
    apply: (a, v) => a.setTrapDisguiseSeconds(v),
  },
  {
    key: 'trapDisguiseCount',
    modes: ['trap-setter'],
    control: 'segmented',
    icon: CrSkull, accent: 'amber',
    label: ({ t }) => t.trapCount,
    options: () => TRAP_DISGUISE_COUNTS.map(n => ({ id: n, label: String(n) })),
    note: ({ t }) => t.trapCountNote,
    apply: (a, v) => a.setTrapDisguiseCount(v),
  },
  {
    key: 'trapGridSize',
    modes: ['trap-setter'],
    control: 'segmented',
    icon: CrMegaDraft, accent: 'amber',
    label: ({ t }) => t.trapGridSizeLabel,
    // 9 = 3×3, 12 = 4×3, 16 = 4×4 — die Beschriftung zeigt die Spaltenform, keine Wurzel
    // (12 ist kein perfektes Quadrat).
    options: ({ t }) => [
      { id: 9, label: t.trapGridLabel(9, '3×3') },
      { id: 12, label: t.trapGridLabel(12, '4×3') },
      { id: 16, label: t.trapGridLabel(16, '4×4') },
    ],
    note: ({ t }) => t.trapGridSizeNote,
    // active × Fallen pro Spieler muss ins Raster passen — sonst lehnt der Server den Start ab.
    warning: ({ t, activeCount, lobbyData, value }) => {
      const active = activeCount || 2;
      const needed = active * (lobbyData?.trapDisguiseCount || 1);
      return needed > value ? t.trapGridTooSmallWarning(needed, value) : null;
    },
    apply: (a, v) => a.setTrapGridSize(v),
  },

  // ── Pyramidendraft ───────────────────────────────────────────────────────
  {
    key: 'pyramidBlocksPerRound',
    modes: ['pyramid-draft'],
    control: 'segmented',
    icon: CrLock, accent: 'sky',
    label: ({ t }) => t.pyramidBlocks,
    options: () => PYRAMID_BLOCK_OPTIONS.map(n => ({ id: n, label: String(n) })),
    note: ({ t }) => t.pyramidBlocksNote,
    apply: (a, v) => a.setPyramidBlocks(v),
  },
  {
    key: 'pyramidRows',
    modes: ['pyramid-draft'],
    control: 'slider',
    icon: CrTripleDraft, accent: 'sky',
    label: ({ t }) => t.pyramidRowsLabel,
    // Minimum hängt von Spielerzahl UND der (eventuell schon geänderten) Blockrate ab —
    // beides schon in lobbyData bekannt, sobald der Host eins von beiden anfasst.
    min: ({ activeCount, lobbyData }) => pyramidMinRows(activeCount || 2, lobbyData?.pyramidBlocksPerRound ?? 1),
    max: ({ activeCount, lobbyData }) => pyramidMinRows(activeCount || 2, lobbyData?.pyramidBlocksPerRound ?? 1) + PYRAMID_ROWS_HEADROOM,
    step: 1,
    format: (v) => `${v} (${(v * (v + 1)) / 2})`,
    note: ({ t }) => t.pyramidRowsNote,
    apply: (a, v) => a.setPyramidRows(v),
  },
];
