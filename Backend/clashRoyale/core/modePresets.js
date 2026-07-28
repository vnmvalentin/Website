// Einstellungs-Presets der Spielmodi.
//
// Statt sich durch alle Regler zu klicken, wählt der Host oben in den Lobby-Einstellungen
// einen fertigen Satz Werte: "Vorgeschlagen" (der ausbalancierte Standard), "Blitz" (schnelle
// Runden) oder "Chaos" (bewusst überdreht). Die Werte gehören dem Server — der Client
// bekommt sie über sanitizeLobby() mitgeliefert und braucht sie nicht zu kennen.
//
// Ein Preset ist:
//   id      'suggested' | 'fast' | 'chaos'   (Beschriftung/Beschreibung liegen im Frontend, zweisprachig)
//   values  Objekt mit Einstellungsfeldern ODER (lobby, activeCount) => Objekt
//
// DREI REGELN, die sich in der Praxis ergeben haben:
//
// 1. "Vorgeschlagen" SKALIERT mit der Spielerzahl. Ein 60-Sekunden-Zugtimer ist bei zwei
//    Spielern angenehm und bei acht Spielern eine Dreiviertelstunde Wartezeit; ein Marktplatz
//    mit 5 Karten ist bei acht Spielern ein Gedränge. Deshalb bekommen die Presets die Zahl
//    aktiver Spieler und rechnen ihre Werte daraus.
//
// 2. Ein Modus mit nur EINER Einstellung braucht keine drei Presets — dort steht nur
//    "Vorgeschlagen" (Dunkles Labyrinth: nur das Zeitlimit). Drei Varianten einer einzigen
//    Zahl sind bloß drei Klicks für dasselbe wie der Regler daneben.
//
// 3. "Vorgeschlagen" IST der Startzustand: es wird beim Erstellen der Lobby und bei jedem
//    Moduswechsel gesetzt und folgt danach der Spielerzahl, solange der Host keinen Regler
//    von Hand anfasst. Deshalb muss jeder Modus ein 'suggested'-Preset haben.
//
// Angewendet wird jeder Wert einzeln über die sanitize()-Prüfung seines Modus (Registry).
// Ein Wert, den der aktuelle Kartenpool nicht zulässt, wird dabei still übersprungen —
// so kann ein Preset eine Lobby nie in einen unspielbaren Zustand bringen.

const registry = require('./registry');
const { getCardPool } = require('./cards');

// ── Helfer zum Skalieren ────────────────────────────────────────────────────
// Nächstgelegener erlaubter Wert einer festen Auswahlliste (Marktplatzgröße, Spawnrate …),
// niemals kleiner als der gewünschte Wert, solange die Liste das zulässt.
const atLeast = (options, wanted) =>
  [...options].sort((a, b) => a - b).find(o => o >= wanted) ?? Math.max(...options);

// Karten pro Runde: jeder Spieler braucht mindestens eine, `extra` sorgt für echte Auswahl.
// Untergrenze 2 und Obergrenze 12 sind dieselben wie in applyModePreset() — sonst würde hier
// ein Wert angekündigt (z.B. 1, wenn der Host allein in der Lobby ist), der beim Anwenden
// hochgeklemmt wird. Der Client vergleicht angekündigt gegen gesetzt und hätte das Preset
// dann nicht als aktiv erkannt.
const perRound = (activeCount, extra) => Math.max(2, Math.min(12, activeCount + extra));

// Snake: größtes Raster bis `wanted`, für das der Kartenpool reicht — jede Zelle braucht eine
// Karte. Ohne diese Klammer würde sanitize() einen zu großen Wunschwert einfach ablehnen und
// das Raster auf dem alten (womöglich unspielbaren) Wert stehen lassen.
const gridSizeFor = (lobby, wanted) => {
  const pool = getCardPool(lobby).length;
  for (let size = Math.min(11, wanted); size >= 7; size--) {
    if (size * size <= pool) return size;
  }
  return 7; // Pool reicht für kein Raster — die Lobby blockiert den Start mit eigener Meldung
};

// Karussel: größte Tischgröße, bei der der Pool noch für alle Spieler reicht.
// sanitize() prüft nur, ob überhaupt 2 Tische möglich sind — ein zu großer Wert wäre also
// gültig, würde die Lobby aber unstartbar machen (carouselTooMany). Deshalb hier rechnen.
const carouselSize = (lobby, activeCount, wanted) => {
  const pool = getCardPool(lobby).length;
  const needed = Math.max(2, activeCount);
  return [wanted, 12, 8].find(size => Math.floor(pool / size) >= needed) ?? 8;
};

const FISH_SPAWN_RATES = [0.5, 0.75, 1, 1.5, 2];
const RUSH_MARKET_SIZES = [3, 4, 5, 6, 7, 8];

// Jeder Modus MUSS dieses Preset haben — es ist der Startzustand jeder Lobby.
const SUGGESTED_ID = 'suggested';

const MODE_PRESETS = {
  // Zugbasiert: die Gesamtdauer wächst mit jedem Spieler, also sinkt der Timer.
  snake: [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        gridSize: gridSizeFor(lobby, n <= 3 ? 10 : 11),
        timerSeconds: 30,
      }),
    },
    { id: 'fast',  values: (lobby) => ({ gridSize: gridSizeFor(lobby, 9), timerSeconds: 15 }) },
  ],
  // Gleichzeitiges Bieten: der Timer bleibt, aber es sollten mehr Karten als Spieler
  // ausliegen — sonst bekommt jeder ohnehin eine und Bieten ist sinnlos.
  auction: [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        timerSeconds: 60, cardsPerRound: perRound(n, 0),
        startElixir: 100, showElixir: false, motherWitchEnabled: false,
      }),
    },
    {
      id: 'chaos',
      values: (lobby, n) => ({
        timerSeconds: 45, cardsPerRound: perRound(n, 0),
        startElixir: 100, showElixir: true, motherWitchEnabled: true,
      }),
    },
  ],
  bingo: [
    {
      id: 'suggested',
      values: (lobby, n) => ({ timerSeconds: 60, cardsPerRound: perRound(n, 0), tokenShopTimerSeconds: 60 }),
    },
    { id: 'fast',  values: (lobby, n) => ({ timerSeconds: 15, cardsPerRound: perRound(n, 0), tokenShopTimerSeconds: 30 }) },
  ],
  // Jeder Spieler braucht einen eigenen Tisch — die Tischgröße hängt am Kartenpool.
  'shadow-carousel': [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        timerSeconds: 45,
        carouselCardsPerTable: carouselSize(lobby, n, 12),
        carouselRevealMode: 'two',
      }),
    },
    {
      id: 'fast',
      values: (lobby, n) => ({
        timerSeconds: 20, carouselCardsPerTable: carouselSize(lobby, n, 8), carouselRevealMode: 'dynamic',
      }),
    },
    {
      id: 'chaos',
      values: (lobby, n) => ({
        timerSeconds: 30, carouselCardsPerTable: carouselSize(lobby, n, 16), carouselRevealMode: 'two',
      }),
    },
  ],
  // Echtzeit, wer zuerst klickt: mit mehr Spielern muss mehr gleichzeitig ausliegen.
  'elixir-rush': [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        rushMarketSize: atLeast(RUSH_MARKET_SIZES, 5), rushCardLifetime: 15,
        rushShowElixir: false, rushShowTimer: true,
      }),
    },
    { id: 'chaos', values: { rushMarketSize: 8, rushCardLifetime: 5, rushShowElixir: true, rushShowTimer: false } },
  ],
  // Sabotage-Runde: mehr Spieler = mehr mögliche Ziele = mehr Zeit nötig.
  'card-evolution': [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        evolutionPickSeconds: 30, evolutionSabotageSeconds: n <= 4 ? 20 : 30, evolutionTokensStart: 30,
      }),
    },
  ],
  // Alle fischen im selben Fluss: die Spawnrate muss mit der Spielerzahl mithalten.
  'angel-royale': [
    {
      id: 'suggested',
      values: (lobby, n) => ({
        fishSpawnRate: atLeast(FISH_SPAWN_RATES, n <= 3 ? 1 : n <= 5 ? 1.5 : 2),
        fishCatchCooldown: 3,
      }),
    },
    { id: 'chaos', values: { fishSpawnRate: 2, fishCatchCooldown: 0 } },
  ],
  // Nur eine Einstellung (Zeitlimit) → nur "Vorgeschlagen". Mehr Spieler streiten sich um
  // dieselben Kisten, deshalb etwas mehr Zeit.
  'dark-maze': [
    { id: 'suggested', values: (lobby, n) => ({ mazeTimeSeconds: n <= 4 ? 120 : 180 }) },
  ],
};

// Empfehlungen rechnen mit mindestens zwei Spielern — so viele braucht jede Runde. Sitzt der
// Host noch allein in der Lobby, sind die vorgeschlagenen Werte deshalb schon die für das
// erste echte Spiel und springen nicht, sobald der zweite Spieler beitritt.
const activePlayerCount = (lobby) =>
  Math.max(2, lobby.players.filter(p => !p.isSpectator && !p.isAdmin && !p.left).length);

function resolveValues(preset, lobby) {
  return typeof preset.values === 'function'
    ? preset.values(lobby, activePlayerCount(lobby))
    : preset.values;
}

// Presets des aktuellen Modus samt aufgelöster Werte — der Client stellt daraus die
// Buttons zusammen und erkennt am Wertevergleich, welches Preset gerade aktiv ist.
function presetsForLobby(lobby) {
  return (MODE_PRESETS[lobby?.mode] || []).map(p => ({ id: p.id, values: resolveValues(p, lobby) }));
}

// Setzt ein Preset. Gibt true zurück, wenn das Preset existiert (auch wenn einzelne Werte
// von ihrer sanitize()-Prüfung abgelehnt wurden).
function applyModePreset(lobby, presetId) {
  const preset = (MODE_PRESETS[lobby?.mode] || []).find(p => p.id === presetId);
  if (!preset) return false;

  // Gemerkt, damit die Werte der Spielerzahl folgen können (reapplyActivePreset) und der
  // passende Button im Client von Anfang an eingefärbt ist.
  lobby.activePresetId = presetId;
  const poolSize = getCardPool(lobby).length;
  for (const [key, raw] of Object.entries(resolveValues(preset, lobby))) {
    // timerSeconds und cardsPerRound teilen sich mehrere Modi und gehören deshalb nicht
    // der Registry, sondern der Lobby-Grundausstattung — dieselben Grenzen wie in ihren
    // Socket-Handlern (clash:setTimer / clash:setCardsPerRound).
    if (key === 'timerSeconds') {
      lobby.timerSeconds = Math.max(5, Math.min(300, Number(raw) || 60));
      continue;
    }
    if (key === 'cardsPerRound') {
      const n = Math.max(2, Math.min(12, Number(raw) || 4));
      if (8 * n <= poolSize) lobby.cardsPerRound = n;
      continue;
    }
    const spec = registry.getSettingSpec(key);
    if (!spec) continue;
    const value = spec.sanitize ? spec.sanitize(raw, lobby) : raw;
    if (value !== undefined) lobby[key] = value;
  }
  return true;
}

// "Vorgeschlagen" ist der Startzustand jeder Lobby: beim Erstellen und bei jedem
// Moduswechsel wird es gesetzt. Vorher standen dort die nackten Standardwerte der Modi, die
// zufällig mal passten und mal nicht — entsprechend war beim Öffnen der Lobby kein Preset
// markiert, obwohl genau der empfohlene Zustand gemeint war.
const applySuggestedPreset = (lobby) => applyModePreset(lobby, SUGGESTED_ID);

// Hält das gesetzte Preset an der Spielerzahl: die Werte skalieren mit ihr, also müssen sie
// nachgezogen werden, wenn jemand dazukommt oder geht (bei Auction/Bingo hängt z.B. die
// Anzahl Karten pro Runde direkt an der Spielerzahl). Sobald der Host einen Regler von Hand
// anfasst, wird activePresetId gelöscht — dann bleibt sein Wert unangetastet.
function reapplyActivePreset(lobby) {
  if (!lobby || lobby.started || !lobby.activePresetId) return false;
  return applyModePreset(lobby, lobby.activePresetId);
}

// Der Host hat einen einzelnen Wert von Hand gesetzt: ab jetzt folgt die Lobby keinem Preset
// mehr, damit reapplyActivePreset() die Änderung nicht wieder überschreibt.
function clearActivePreset(lobby) {
  if (lobby) lobby.activePresetId = null;
}

module.exports = {
  MODE_PRESETS,
  SUGGESTED_ID,
  presetsForLobby,
  applyModePreset,
  applySuggestedPreset,
  reapplyActivePreset,
  clearActivePreset,
};
