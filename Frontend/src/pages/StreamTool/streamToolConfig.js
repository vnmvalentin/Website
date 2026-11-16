// Konfiguration der Overlay-Module und die Umrechnung von Twitch-Daten in
// Widget-Daten. Dashboard und OBS-Overlay teilen sich das, damit Vorschau und
// Ausgabe garantiert dasselbe zeigen.
//
// Die Struktur ist bewusst modul-basiert: ein neues Overlay-Modul braucht nur
// einen Eintrag in MODULE_DEFAULTS und eine Widget-Komponente — die gesamte
// Layout-Oberfläche im Dashboard funktioniert dann automatisch mit.
import { useEffect, useRef, useState } from 'react';

/** Wie lange ein Ergebnis nach dem Ende noch stehen bleibt, bevor es ausblendet. */
const POLL_LINGER_MS = 20000;
const PREDICTION_LINGER_MS = 25000;

// Kategoriale Palette, gegen dunklen Untergrund geprüft (Helligkeitsband, Chroma,
// Farbfehlsichtigkeit, Kontrast). Reihenfolge nicht ändern und nicht zyklisch
// weiterdrehen — benachbarte Slots sind genau in dieser Folge unterscheidbar.
// Eine frei zusammengestellte Palette fiel hier durch: Grün und Amber waren für
// Protanopie nicht auseinanderzuhalten.
const CATEGORICAL = [
  '#3987e5', // blau
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // gelb
  '#d55181', // magenta
  '#008300', // grün
  '#9085e9', // violett
  '#e66767', // rot
];

/** Balkenfarben der Abstimmung — Twitch erlaubt bis zu 5 Antworten. */
export const POLL_COLORS = CATEGORICAL.slice(0, 5);

/**
 * Twitch erlaubt bis zu 10 Vorhersage-Optionen. Ab Slot 9 kommt bewusst Grau
 * statt einer erfundenen Farbe: mehr als acht Farbklassen verschwimmen. Die
 * Optionen sind ohnehin alle beschriftet, die Farbe ist nur Zugabe.
 */
export const PREDICTION_COLORS = [...CATEGORICAL, '#8b8b98', '#5f5f6c'];

/** Einstellungen, die jedes Modul hat. */
const BASE_MODULE = {
  enabled: true,
  x: 90,
  y: 620,
  scale: 1,
  opacity: 80,     // Deckkraft der Karte in Prozent
  accent: '#9146ff',
  anim: 'up',      // up | fade | left | right
  timer: true,
  glass: true,
  // false = Akzentfarbe, Deckkraft und Glas kommen aus dem gemeinsamen Design
  // (THEME_DEFAULTS); true = dieses Modul benutzt seine eigenen Werte.
  ownLook: false,
};

/**
 * Gemeinsames Design aller Karten. Stil und Ecken gelten immer für alle, die
 * übrigen Werte für jedes Modul ohne `ownLook`.
 * style: 'clean' = moderner Stil (Standard), 'classic' = die ursprünglichen Karten.
 */
export const THEME_DEFAULTS = {
  style: 'clean',
  accent: '#9146ff',
  opacity: 80,
  glass: true,
  radius: 12,
};

/**
 * Karten, die dem gemeinsamen Design folgen. Die Murmelbahn fehlt bewusst: sie
 * ist eine große Zeichenfläche mit eigener, höherer Deckkraft.
 */
export const THEMED_IDS = ['poll', 'prediction', 'followerGoal', 'subGoal', 'streamStats', 'raidClip', 'alerts'];

/** Arten von Alerts — Reihenfolge wie im Editor. Gleiche Liste wie KINDS in Backend/streamTool/lib/alertsCore.js. */
export const ALERT_KINDS = ['follow', 'sub', 'resub', 'gift', 'bits', 'raid'];
/** Feld mit dem Text je Art (Platzhalter: siehe fillAlertText). */
export const ALERT_TEXT_FIELD = {
  follow: 'textFollow', sub: 'textSub', resub: 'textResub', gift: 'textGift', bits: 'textBits', raid: 'textRaid',
};

const LOOK_KEYS = ['accent', 'opacity', 'glass'];

/**
 * Module so, wie die Widgets sie brauchen: das gemeinsame Design ist bereits
 * eingerechnet. Overlay, Dashboard-Bühne und Vorschauen gehen alle hier durch —
 * die Einstellungen im Dashboard dagegen lesen die gespeicherten Werte.
 */
export function effectiveModules(config) {
  const theme = { ...THEME_DEFAULTS, ...(config?.theme || {}) };
  const out = { ...config.modules };
  for (const id of THEMED_IDS) {
    const mod = out[id];
    if (!mod) continue;
    out[id] = {
      ...mod,
      ...(mod.ownLook ? {} : { accent: theme.accent, opacity: theme.opacity, glass: theme.glass }),
      style: theme.style,
      radius: theme.radius,
    };
  }
  return out;
}

/**
 * Wie viel Platz ein Ziel einnimmt. Beide Ziel-Module teilen sich das:
 * 'full'   — Beschriftung, große Zahl und Balken (drei Zeilen)
 * 'inline' — Beschriftung oben, Zahlen im Balken (zwei Zeilen)
 * 'bar'    — nur der Balken, Beschriftung und Zahlen darin (eine Zeile)
 */
const GOAL_LOOK = {
  goalLayout: 'full',
  barHeight: 14,
  showPercent: true,
};

export const MODULE_DEFAULTS = {
  // showHead: Kopfzeile der Karte (Art des Moduls, Status, Timer). Wer das
  // Overlay klein halten will, schaltet die ganze Zeile ab.
  // layout: 'card' = Karte mit einer Zeile je Antwort, 'bar' = eine schmale
  // Leiste über die Breite (Frage, Antworten, Zeit in einer Zeile).
  poll: { ...BASE_MODULE, x: 90, y: 620, showHead: true, layout: 'card', colors: [...POLL_COLORS] },
  prediction: {
    ...BASE_MODULE,
    x: 1090,
    y: 620,
    showHead: true,
    layout: 'card',
    colors: [...PREDICTION_COLORS],
    // Zwischen Sperrung und Auflösung passiert nichts mehr — auf Wunsch
    // verschwindet das Overlay so lange, statt eingefroren stehen zu bleiben.
    hideWhileLocked: false,
  },
  followerGoal: {
    ...BASE_MODULE,
    enabled: false,
    x: 90,
    y: 90,
    timer: false,
    colors: [CATEGORICAL[0]],
    label: 'Follower-Ziel',
    ...GOAL_LOOK,
    // 'twitch' = das im Creator-Dashboard gesetzte Ziel spiegeln,
    // 'manual' = eigener Zielwert (funktioniert auch ohne Twitch-Ziel)
    source: 'twitch',
    twitchType: 'follower',
    target: 1000,
    // Ab null zählen oder ab einem Startwert (z.B. "Ziel für heute")
    startAt: 0,
    // Nur für 'manual': um wie viel der Zielwert nach dem Erreichen steigt (0 = aus)
    autoIncrease: 0,
  },
  subGoal: {
    ...BASE_MODULE,
    enabled: false,
    x: 90,
    y: 260,
    timer: false,
    colors: [CATEGORICAL[4]],
    label: 'Abo-Ziel',
    ...GOAL_LOOK,
    source: 'twitch',
    // 'auto' nimmt das Abo-Ziel, das im Creator-Dashboard wirklich aktiv ist.
    // Vorher stand hier fest "subscription" (Abo-PUNKTE) — wer stattdessen ein
    // Ziel über die ANZAHL gesetzt hatte, sah nie etwas und konnte nur raten,
    // woran es liegt. Follower fiel das nicht auf: dort gibt es nur einen Typ.
    twitchType: 'auto',
    target: 100,
    startAt: 0,
    autoIncrease: 0,
    // Twitch zählt Tier 2 doppelt und Tier 3 sechsfach — das sind die "Punkte"
    usePoints: false,
  },
  streamStats: {
    ...BASE_MODULE,
    enabled: false,
    x: 90,
    y: 900,
    timer: false,
    colors: [CATEGORICAL[2]],
    label: 'Dieser Stream',
    // 'row' = nebeneinander, 'column' = untereinander als Blöcke,
    // 'list' = untereinander mit Beschriftung links und Zahl rechts
    layout: 'row',
    // Beschriftung über ('top') oder unter ('bottom') der Zahl
    capPos: 'top',
    // 'center' stellt jede Kennzahl in ein gleich breites, unsichtbares
    // Kästchen — nur so stehen Wort und Zahl wirklich übereinander.
    align: 'center',
    // Welche Kennzahlen die Karte zeigt — Reihenfolge ist fest
    show: { follows: true, subs: true, bits: true, viewers: false, peak: false, uptime: false },
    // Was als Abo zählt. Neuabos zählen immer.
    countResubs: true,
    countGifts: true,
    // Zwischen zwei Sendungen die letzten Zahlen stehen lassen oder ausblenden
    hideOffline: false,
    // Kopfzeile aus Überschrift und Live-Schild
    showHead: true,
    // Kleines Schild, solange Twitch den Kanal als live führt
    liveDot: true,
  },
  raidClip: {
    ...BASE_MODULE,
    enabled: false,
    // 800 px breit -> waagerecht mittig auf der 1920er Bühne
    x: 560,
    y: 240,
    timer: false,
    colors: [CATEGORICAL[6]],
    // Ab wie vielen mitgebrachten Zuschauern der Clip überhaupt läuft
    minViewers: 1,
    // Zeitraum der Clip-Suche in Tagen (0 = seit jeher)
    period: 30,
    // 'top' = zufällig aus den meistgesehenen, 'random' = quer durch alle
    pick: 'top',
    maxSeconds: 30,
    // Ton an oder aus. Wirkt nur in OBS: dort spielt das Overlay die Videodatei
    // des Clips selbst ab und darf sie auch laut starten. Im Browser bleibt der
    // Clip stumm, und fällt das Overlay auf die Twitch-Einbettung zurück, ist er
    // es ebenfalls — die startet immer stumm.
    sound: true,
    volume: 100,
    showRaider: true,
    // Vorlauf, damit der Clip nicht in den Raid-Alert hineinredet
    delaySeconds: 5,
  },
  // Kurze Hinweise im Stream. Kommen mehrere kurz hintereinander, laufen sie nacheinander (Warteschlange).
  alerts: {
    ...BASE_MODULE,
    enabled: false,
    // 600 px breit -> waagerecht mittig auf der 1920er Bühne
    x: 660,
    y: 120,
    timer: false,
    // Farbe des Namens im Text
    colors: [CATEGORICAL[3]],
    kinds: { follow: true, sub: true, resub: true, gift: true, bits: true, raid: true },
    // Kleinere Cheers und Raids bekommen keinen Alert
    minBits: 1,
    minRaidViewers: 1,
    // Wie lange ein Alert stehen bleibt
    seconds: 6,
    // Nachricht zu Verlängerung und Bits mit anzeigen
    showMessage: true,
    // Kurzer Ton aus dem Browser (kein Audio-Paket nötig). Wirkt in OBS; im Dashboard nur beim Testen.
    sound: true,
    volume: 60,
    // Text vorlesen (Sprachausgabe des Rechners) — ob OBS Stimmen hat, hängt vom PC ab
    tts: false,
    // Texte je Art. Platzhalter: {name} {amount} {months} {subs} {bits} {viewers} {tier}
    textFollow: '{name} folgt jetzt!',
    textSub: '{name} hat abonniert!',
    textResub: '{name} ist seit {months} Monaten dabei!',
    textGift: '{name} verschenkt {subs}!',
    textBits: '{name} schickt {bits}!',
    textRaid: '{name} raidet mit {viewers}!',
  },

  /* ── Szenen ──────────────────────────────────────────────────────────────
     Sie spielen quer über das ganze Bild statt als Karte an einer Stelle. Von
     der Platzierung zählt deshalb nur y (die Höhe der Spur) und die Größe. Die
     Murmelbahn ist die Ausnahme: sie ist eine Karte wie die anderen. */
  hypeTrain: {
    ...BASE_MODULE,
    enabled: false,
    x: 0,
    y: 850,
    timer: true,
    // [Zugfarbe, Wagenfarbe]
    colors: ['#9146ff', '#23232d'],
    // Aus welcher Richtung der Zug einfährt
    from: 'left',
    showProgress: true,
    showNames: false,
    // Echter 3D-Zug (three.js); ohne WebGL fährt automatisch der flache Zug
    view3d: true,
  },
  raidStorm: {
    ...BASE_MODULE,
    enabled: false,
    x: 0,
    y: 760,
    timer: false,
    // Farben der Oberteile, der Reihe nach verteilt
    colors: [...CATEGORICAL],
    // In welche Richtung die Menge rennt
    direction: 'right',
    minViewers: 1,
    // Vorlauf wie beim Raid-Clip. Er gibt Twitch zugleich Zeit, die
    // Zuschauerliste nachzuziehen — daraus stammen die Namen.
    delaySeconds: 8,
    // Mehr Figuren zeichnet das Overlay nicht; die echte Zahl steht auf der Fahne
    maxFigures: 100,
    showNames: true,
    // Namen aus der Zuschauerliste schätzen (Twitch nennt die Raider nicht)
    guessNames: true,
  },
  planeBanner: {
    ...BASE_MODULE,
    enabled: false,
    x: 0,
    y: 50,
    timer: false,
    // [Flugzeug, Banner, Schrift]
    colors: ['#d95926', '#f3efe4', '#17171c'],
    // Eine Nachricht je Zeile — bei mehreren wechselt das Flugzeug durch
    messages: 'Schön, dass du da bist!',
    intervalMin: 10,
    // Sekunden für einen Überflug
    flightSeconds: 24,
    direction: 'right',
  },
  marbleRun: {
    ...BASE_MODULE,
    enabled: false,
    x: 1260,
    y: 60,
    opacity: 88,
    timer: true,
    colors: [...CATEGORICAL],
    joinCommand: '!murmel',
    // Anmeldezeit in Sekunden; 0 = von Hand starten
    joinSeconds: 60,
    maxPlayers: 40,
    // Länge der Bahn in Abschnitten (12 ergeben im Mittel etwa 40 Sekunden)
    sections: 12,
    // Wie lange der Sieger stehen bleibt
    winnerSeconds: 15,
    // Öffnung und Sieger im Chat ansagen
    announce: true,
    // Siegermeldung im Chat um so viele Sekunden verzögern (Stream-Verzögerung, sonst Spoiler)
    announceDelay: 6,
    showNames: true,
    // Bahn in 3D zeichnen (three.js); ohne WebGL bleibt es bei 2D
    view3d: false,
    // ID einer Kanalpunkte-Belohnung, die die Anmeldung öffnet ('' = aus)
    rewardId: '',
    // true = die Seite hat die Belohnung selbst angelegt und fragt die Einlösungen
    // bei Twitch ab (kein Textfeld nötig); false = erkannt über den Chat-Bot
    rewardManaged: false,
    rewardTitle: '',
    // Die drei Besten auf der Anmeldekarte zeigen
    showTop: true,
  },
};

/** Module, die über die ganze Bildbreite spielen statt als verschiebbare Karte. */
export const SCENE_IDS = ['hypeTrain', 'raidStorm', 'planeBanner'];

/** Zieltypen, die Twitch im Creator-Dashboard kennt. */
export const TWITCH_GOAL_TYPES = {
  followerGoal: [
    { value: 'follower', label: 'Follower' },
  ],
  subGoal: [
    { value: 'auto', label: 'Automatisch' },
    { value: 'subscription', label: 'Abo-Punkte' },
    { value: 'subscription_count', label: 'Abos (Anzahl)' },
    { value: 'new_subscription', label: 'Neue Abo-Punkte' },
    { value: 'new_subscription_count', label: 'Neue Abos (Anzahl)' },
  ],
};

/**
 * Welche Twitch-Zieltypen zu einem Modul gehören — in dieser Reihenfolge sucht
 * 'Automatisch'. Zugleich die Liste, an der das Dashboard erkennt, ob im
 * Creator-Dashboard ein passendes Ziel läuft, das nur anders heißt.
 */
export const TWITCH_GOAL_FAMILY = {
  followerGoal: ['follower'],
  subGoal: ['subscription', 'subscription_count', 'new_subscription', 'new_subscription_count'],
};

/** Das Twitch-Ziel, das ein Modul gerade meint — oder null. */
export function resolveTwitchGoal(id, goals, module) {
  const all = goals?.twitch;
  if (!all) return null;
  const wanted = module?.twitchType;
  if (wanted && wanted !== 'auto') return all[wanted] || null;
  for (const type of TWITCH_GOAL_FAMILY[id] || []) {
    if (all[type]) return all[type];
  }
  return null;
}

/** Welche selbst gezählte Kennzahl ein Ziel-Modul im Modus 'manual' liest. */
export const GOAL_SOURCE = {
  followerGoal: (goals) => goals?.followers,
  subGoal: (goals, module) => (module.usePoints ? goals?.subPoints : goals?.subs),
};

export const MODULE_IDS = Object.keys(MODULE_DEFAULTS);

/** Erhöhen, wenn gespeicherte Konfigurationen einmalig angefasst werden müssen. */
export const CONFIG_VERSION = 2;

export function defaultConfig() {
  return { v: CONFIG_VERSION, language: 'de', theme: { ...THEME_DEFAULTS }, modules: JSON.parse(JSON.stringify(MODULE_DEFAULTS)) };
}

/** Sprachen, in denen die Overlays im Stream erscheinen können (config.language). */
export const OVERLAY_LANGS = ['de', 'en'];

/**
 * Standardtexte, die der Streamer ändern kann. Wechselt die Sprache der Overlays, werden nur die mitübersetzt, die
 * noch genau dem Standard einer Sprache entsprechen — eigene Texte bleiben, wie sie sind. Der Befehl der Murmelbahn
 * gehört bewusst nicht dazu: den kennt die Community, er soll sich nicht still ändern.
 */
export const DEFAULT_TEXTS = {
  de: {
    followerGoal: { label: 'Follower-Ziel' },
    subGoal: { label: 'Abo-Ziel' },
    streamStats: { label: 'Dieser Stream' },
    planeBanner: { messages: 'Schön, dass du da bist!' },
    alerts: {
      textFollow: '{name} folgt jetzt!',
      textSub: '{name} hat abonniert!',
      textResub: '{name} ist seit {months} Monaten dabei!',
      textGift: '{name} verschenkt {subs}!',
      textBits: '{name} schickt {bits}!',
      textRaid: '{name} raidet mit {viewers}!',
    },
  },
  en: {
    followerGoal: { label: 'Follower goal' },
    subGoal: { label: 'Sub goal' },
    streamStats: { label: 'This stream' },
    planeBanner: { messages: 'Great to have you here!' },
    alerts: {
      textFollow: '{name} just followed!',
      textSub: '{name} just subscribed!',
      textResub: '{name} has been subscribed for {months} months!',
      textGift: '{name} gifted {subs}!',
      textBits: '{name} cheered {bits}!',
      textRaid: '{name} is raiding with {viewers}!',
    },
  },
};

/** Konfiguration mit neuer Overlay-Sprache; unveränderte Standardtexte wechseln mit (siehe DEFAULT_TEXTS). */
export function withLanguage(config, lang) {
  if (!OVERLAY_LANGS.includes(lang)) return config;
  const modules = { ...config.modules };
  for (const [id, fields] of Object.entries(DEFAULT_TEXTS[lang])) {
    if (!modules[id]) continue;
    for (const [field, text] of Object.entries(fields)) {
      const current = modules[id][field];
      const isDefault = OVERLAY_LANGS.some((l) => DEFAULT_TEXTS[l][id]?.[field] === current);
      if (isDefault && current !== text) modules[id] = { ...modules[id], [field]: text };
    }
  }
  return { ...config, language: lang, modules };
}

/** Nur gültige Werte aus einem gespeicherten Design übernehmen. */
function mergeTheme(saved) {
  const t = { ...THEME_DEFAULTS };
  if (!saved || typeof saved !== 'object') return t;
  if (saved.style === 'classic' || saved.style === 'clean') t.style = saved.style;
  if (/^#[0-9a-fA-F]{6}$/.test(saved.accent || '')) t.accent = saved.accent;
  if (Number.isFinite(Number(saved.opacity))) t.opacity = Math.min(100, Math.max(0, Number(saved.opacity)));
  if (Number.isFinite(Number(saved.radius))) t.radius = Math.min(24, Math.max(0, Number(saved.radius)));
  if (typeof saved.glass === 'boolean') t.glass = saved.glass;
  return t;
}

/** Gespeicherte Konfiguration auf die aktuelle Struktur heben. */
export function mergeConfig(saved) {
  const base = defaultConfig();
  if (!saved || typeof saved !== 'object') return base;

  const modules = {};
  for (const id of MODULE_IDS) {
    const def = base.modules[id];
    const got = saved.modules?.[id];
    const merged = {
      ...def,
      ...(got && typeof got === 'object' ? got : {}),
      colors: Array.isArray(got?.colors) && got.colors.length ? got.colors : def.colors,
    };
    // Verschachtelte Schalter einzeln zusammenführen, sonst würde eine
    // gespeicherte Auswahl später hinzugekommene Kennzahlen verschlucken.
    if (def.show) {
      merged.show = { ...def.show, ...(got?.show && typeof got.show === 'object' ? got.show : {}) };
    }
    if (def.kinds) {
      merged.kinds = { ...def.kinds, ...(got?.kinds && typeof got.kinds === 'object' ? got.kinds : {}) };
    }
    modules[id] = merged;
  }

  // Einmalige Umstellung: Der alte Standard des Abo-Ziels war fest "Abo-Punkte".
  // Wer nie bewusst etwas anderes gewählt hat, bekommt jetzt 'Automatisch' —
  // sonst bleibt das Modul leer, sobald im Creator-Dashboard ein Ziel über die
  // Anzahl statt über die Punkte läuft. Eine spätere eigene Wahl bleibt stehen,
  // weil ab v2 die Version mitgespeichert wird.
  if (Number(saved.v) < CONFIG_VERSION && modules.subGoal.twitchType === 'subscription') {
    modules.subGoal.twitchType = 'auto';
  }

  // Gemeinsames Design. Stände von vor seiner Einführung haben keines: dann
  // gibt die Abstimmung Farbe, Deckkraft und Glas vor, und jedes Modul, das
  // davon abweicht, behält seine eigenen Werte (ownLook) — niemandes Overlay
  // sieht nach dem Umstieg anders gefärbt aus als vorher.
  let theme;
  if (saved.theme && typeof saved.theme === 'object') {
    theme = mergeTheme(saved.theme);
  } else {
    theme = mergeTheme({ accent: modules.poll.accent, opacity: modules.poll.opacity, glass: modules.poll.glass });
    for (const id of THEMED_IDS) {
      modules[id].ownLook = LOOK_KEYS.some((k) => modules[id][k] !== theme[k]);
    }
  }

  const language = OVERLAY_LANGS.includes(saved.language) ? saved.language : 'de';
  // Fehlende Felder kommen aus MODULE_DEFAULTS und sind deutsch — bei einer englischen Konfiguration (etwa ein
  // später hinzugekommenes Modul) also die Standardtexte an die Sprache angleichen. Eigene Texte bleiben unberührt.
  return withLanguage({ v: CONFIG_VERSION, language, theme, modules }, language);
}

/* ── Twitch-Daten -> Widget-Daten ─────────────────────────────────────────── */

/** @returns Widget-Daten oder null, wenn nichts angezeigt werden soll. */
export function toPollView(poll, module, now) {
  if (!poll) return null;
  const active = poll.status === 'ACTIVE';
  if (!active && now - poll.endsAt > POLL_LINGER_MS) return null;

  return {
    title: poll.title,
    status: active ? 'ACTIVE' : 'COMPLETED',
    duration: poll.duration,
    remaining: active ? Math.max(0, (poll.endsAt - now) / 1000) : 0,
    totalVotes: poll.totalVotes,
    choices: poll.choices.map((c, i) => ({
      id: c.id,
      title: c.title,
      votes: c.votes,
      color: module.colors[i % module.colors.length],
    })),
  };
}

export function toPredictionView(prediction, module, now) {
  if (!prediction || prediction.status === 'CANCELED') return null;
  // Gesperrt: auf Wunsch ausblenden, bis der Gewinner feststeht
  if (module.hideWhileLocked && prediction.status === 'LOCKED') return null;
  if (prediction.status === 'RESOLVED' && prediction.endedAt && now - prediction.endedAt > PREDICTION_LINGER_MS) return null;
  if (!prediction.outcomes?.length) return null;

  return {
    title: prediction.title,
    status: prediction.status,
    window: prediction.window,
    remaining: prediction.status === 'ACTIVE' ? Math.max(0, (prediction.locksAt - now) / 1000) : 0,
    winnerId: prediction.status === 'RESOLVED' ? prediction.winningOutcomeId : null,
    outcomes: prediction.outcomes.map((o, i) => ({
      ...o,
      color: module.colors[i % module.colors.length],
    })),
  };
}

/**
 * Ziel-Module (Follower, Abos). @returns Widget-Daten oder null, wenn Twitch die
 * Zahl nicht liefert — etwa weil die Leserechte fehlen oder der Kanal kein
 * Affiliate ist. Dann bleibt das Overlay leer statt "0 von 1000" zu behaupten.
 */
export function toGoalView(id, goals, module) {
  // Modus "Twitch-Ziel": Zielwert, Fortschritt und Beschreibung kommen komplett
  // aus dem Creator-Dashboard. Was Twitch dort mit dem Zielwert macht — auch
  // eine automatische Erhöhung nach dem Erreichen — spiegelt das Overlay 1:1.
  if (module.source === 'twitch') {
    const g = resolveTwitchGoal(id, goals, module);
    if (!g) return null;
    return {
      label: module.label || g.description || '',
      note: g.description && module.label ? g.description : '',
      reached: g.current,
      target: g.target,
      percent: Math.min(100, (g.current / g.target) * 100),
      done: g.current >= g.target,
      color: module.colors[0],
      fromTwitch: true,
    };
  }

  const current = GOAL_SOURCE[id]?.(goals, module);
  if (typeof current !== 'number') return null;

  const start = Math.max(0, Number(module.startAt) || 0);
  const base = Math.max(1, Number(module.target) || 1);
  const reached = Math.max(0, current - start);

  // Eigene automatische Erhöhung: bewusst aus dem aktuellen Stand gerechnet und
  // nirgends gespeichert — so zeigen Dashboard und Overlay immer dasselbe, egal
  // wann eines von beiden geladen wurde.
  const step = Math.max(0, Number(module.autoIncrease) || 0);
  const target = step > 0 && reached >= base
    ? base + step * (Math.floor((reached - base) / step) + 1)
    : base;

  return {
    label: module.label,
    note: '',
    reached,
    target,
    // Über 100 % wird nicht abgeschnitten — der Balken ist voll, die Zahl zählt weiter
    percent: Math.min(100, (reached / target) * 100),
    done: reached >= target,
    color: module.colors[0],
    fromTwitch: false,
  };
}

/**
 * Kennzahlen der Stream-Statistik in fester Reihenfolge. Der Schlüssel steht so
 * auch in module.show — eine neue Kennzahl braucht hier eine Zeile und einen
 * Eintrag im Standard.
 */
export const STAT_METRICS = [
  { key: 'follows', label: 'Follows' },
  { key: 'subs', label: 'Abos' },
  { key: 'bits', label: 'Bits' },
  { key: 'viewers', label: 'Zuschauer' },
  { key: 'peak', label: 'Höchststand' },
  { key: 'uptime', label: 'Laufzeit' },
];

/** Abos je nach Einstellung zusammenzählen. Neuabos zählen immer mit. */
function countSubs(subs, module) {
  if (!subs) return 0;
  return (
    (Number(subs.new) || 0) +
    (module.countResubs === false ? 0 : Number(subs.resub) || 0) +
    (module.countGifts === false ? 0 : Number(subs.gift) || 0)
  );
}

/**
 * Stream-Statistik. Die Zahlen kommen fertig gezählt vom Backend; hier wird nur
 * ausgewählt, was die Karte zeigt.
 * @returns Widget-Daten oder null, wenn (noch) keine Sendung erkannt wurde
 */
export function toStatsView(stats, module) {
  if (!stats) return null;
  if (module.hideOffline && !stats.live) return null;

  const show = module.show || {};
  const values = {
    follows: stats.follows,
    subs: countSubs(stats.subs, module),
    bits: Number(stats.bits) || 0,
    viewers: Number(stats.viewers) || 0,
    peak: Number(stats.peakViewers) || 0,
    uptime: null, // zählt im Widget selbst weiter, siehe startedAt
  };

  const items = STAT_METRICS
    .filter((mtr) => show[mtr.key])
    .map((mtr) => ({ key: mtr.key, label: mtr.label, value: values[mtr.key] }));
  if (!items.length) return null;

  return {
    label: module.label || '',
    live: !!stats.live,
    // Nur für die Laufzeit: die Karte rechnet selbst weiter, damit das Overlay
    // dafür keine durchlaufende Uhr braucht.
    startedAt: Number(stats.startedAt) || 0,
    items,
    color: module.colors[0],
  };
}

/**
 * Raid-Clip. Das Backend legt beim Raid ein Ereignis mit fertigem Clip ab und
 * setzt gleich mit, wie lange es zu sehen sein soll — hier wird nur noch
 * entschieden, ob es noch läuft.
 * @returns Widget-Daten oder null
 */
export function toRaidView(raid, module, now) {
  if (!raid || !module?.enabled) return null;
  // Das Modul zeigt ausschließlich den Clip: hat der Kanal keinen (oder war
  // Twitch nicht erreichbar), bleibt das Overlay ganz leer — auch die
  // Begrüßung entfällt, sonst stünde eine Karte ohne Inhalt im Bild.
  if (!raid.clip) return null;
  // Vorlauf: das Overlay bleibt leer, bis der Raid-Alert durch ist
  if (raid.startsAt && now < raid.startsAt) return null;
  if (raid.endsAt && now > raid.endsAt) return null;
  return {
    id: raid.id,
    raider: raid.raider || { name: '', viewers: 0 },
    clip: raid.clip,
    playSeconds: Math.max(1, Number(raid.playSeconds) || 0),
    demo: !!raid.demo,
    color: module.colors[0],
  };
}

/**
 * Hält den letzten Datenstand noch kurz fest, nachdem er null geworden ist.
 * Ohne das würde das Widget beim Ende einer Abstimmung sofort aus dem DOM
 * verschwinden und die Ausblend-Animation nie zu sehen sein.
 */
export function useLinger(value, ms = 600) {
  const last = useRef(value);
  const [, force] = useState(0);
  const present = !!value;
  if (value) last.current = value;

  useEffect(() => {
    if (present) return undefined;
    const t = setTimeout(() => { last.current = null; force((n) => n + 1); }, ms);
    return () => clearTimeout(t);
  }, [present, ms]);

  return value || last.current;
}

/* ── Demo-Daten ───────────────────────────────────────────────────────────── */
/* Nur für die Vorschau im Dashboard und zum Ausrichten in OBS (?demo=1).
   Echte Abstimmungen und Vorhersagen startet man in Twitch selbst.            */

const DEMO_POLL = { duration: 90, choiceCount: 3 };
const DEMO_PREDICTION = { window: 120 };

/** Texte der Demo-Daten; die Vorschau zeigt sie in der Sprache der Overlays. */
const DEMO_TEXTS = {
  de: {
    pollTitle: 'Welche Map zocken wir als Nächstes?',
    choices: ['Rust', 'Dust II', 'Überraschung'],
    predTitle: 'Schaffen wir den Run ohne Tod?',
    outcomes2: ['Ja, easy', 'Auf keinen Fall'],
    outcomes4: ['Locker', 'Knapp', 'Eher nicht', 'Niemals'],
    followerGoal: 'Auf zu 1000!',
    subGoal: 'Abo-Ziel',
    subCount: 'Abos',
    raider: 'BeispielKanal',
    clipTitle: 'Der beste Moment des Streams',
    names: ['Kieselkönig', 'Rollmops', 'Kugelblitz', 'Glasperle', 'Schusser', 'Flummi', 'Looping', 'Trudel', 'Kreisel', 'Prellbock', 'Wirbelwind'],
  },
  en: {
    pollTitle: 'Which map should we play next?',
    choices: ['Rust', 'Dust II', 'Surprise me'],
    predTitle: 'Can we finish the run without dying?',
    outcomes2: ['Yes, easy', 'No way'],
    outcomes4: ['Easy', 'Close call', 'Unlikely', 'Never'],
    followerGoal: 'Road to 1000!',
    subGoal: 'Sub goal',
    subCount: 'Subs',
    raider: 'ExampleChannel',
    clipTitle: 'Best moment of the stream',
    names: ['PebbleKing', 'Marbles', 'Zoomer', 'GlassBead', 'Shooter', 'Bouncy', 'Loopy', 'Wobbles', 'Spinner', 'Bumper', 'Whirlwind'],
  },
};
const demoText = (lang) => DEMO_TEXTS[lang] || DEMO_TEXTS.de;
// Zum Ausrichten des Raid-Moduls. endsAt bleibt 0, damit die Karte in der
// Vorschau stehen bleibt; abgespielt wird in der Demo nichts.
function demoRaid(lang) {
  const tx = demoText(lang);
  return {
    id: 'demo-raid',
    demo: true,
    startsAt: 0,
    endsAt: 0,
    playSeconds: 24,
    raider: { login: tx.raider.toLowerCase(), name: tx.raider, viewers: 137 },
    clip: { id: '', title: tx.clipTitle, duration: 24, mp4: '', thumbnail: '', creator: tx.raider },
    error: null,
  };
}

function freshSim(outcomeCount) {
  return {
    votes: Array.from({ length: DEMO_POLL.choiceCount }, () => 30 + Math.floor(Math.random() * 140)),
    // Feste Beispiel-Sendung: der Beginn darf nicht mitwandern, sonst springt
    // die Laufzeit in der Vorschau bei jedem Takt.
    streamStart: Date.now() - (2 * 3600 + 743) * 1000,
    pollStart: Date.now(),
    pollDone: 0,
    points: Array.from({ length: outcomeCount }, () => 1800 + Math.floor(Math.random() * 3200)),
    users: Array.from({ length: outcomeCount }, () => 14 + Math.floor(Math.random() * 55)),
    predStart: Date.now(),
    predPhase: 'run',
    predAt: 0,
    winner: 0,
  };
}

/**
 * @param {boolean} enabled
 * @param {number}  outcomeCount  2 = Versus-Balken, mehr = Ringdiagramm
 * @param {string}  [lang]        Sprache der Beispieltexte (config.language)
 */
export function useDemoSim(enabled, outcomeCount = 2, lang = 'de') {
  const sim = useRef(freshSim(outcomeCount));
  const [, force] = useState(0);

  useEffect(() => {
    sim.current = freshSim(outcomeCount);
  }, [outcomeCount]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      const s = sim.current;
      const now = Date.now();

      if (!s.pollDone) {
        if (Math.random() < 0.55) s.votes[Math.floor(Math.random() * s.votes.length)] += 1 + Math.floor(Math.random() * 6);
        if ((now - s.pollStart) / 1000 >= DEMO_POLL.duration) s.pollDone = now;
      } else if (now - s.pollDone > 9000) {
        s.votes = Array.from({ length: DEMO_POLL.choiceCount }, () => 30 + Math.floor(Math.random() * 120));
        s.pollStart = now;
        s.pollDone = 0;
      }

      if (s.predPhase === 'run') {
        if (Math.random() < 0.7) {
          const i = Math.floor(Math.random() * s.points.length);
          s.points[i] += 50 + Math.floor(Math.random() * 700);
          if (Math.random() < 0.4) s.users[i] += 1;
        }
        if ((now - s.predStart) / 1000 >= DEMO_PREDICTION.window) { s.predPhase = 'locked'; s.predAt = now; }
      } else if (s.predPhase === 'locked' && now - s.predAt > 6000) {
        s.predPhase = 'resolved';
        s.winner = Math.floor(Math.random() * s.points.length);
        s.predAt = now;
      } else if (s.predPhase === 'resolved' && now - s.predAt > 9000) {
        Object.assign(sim.current, freshSim(s.points.length));
      }

      force((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [enabled, outcomeCount]);

  if (!enabled) return { poll: null, prediction: null, goals: null, raid: null, stats: null };

  const s = sim.current;
  const now = Date.now();
  // Ziele kriechen langsam hoch, damit man den Balken laufen sieht
  const creep = Math.floor((now - s.pollStart) / 4000);
  const tx = demoText(lang);
  const names = outcomeCount > 2 ? tx.outcomes4 : tx.outcomes2;
  const predStatus = s.predPhase === 'run' ? 'ACTIVE' : (s.predPhase === 'locked' ? 'LOCKED' : 'RESOLVED');

  return {
    poll: {
      title: tx.pollTitle,
      status: s.pollDone ? 'COMPLETED' : 'ACTIVE',
      duration: DEMO_POLL.duration,
      remaining: Math.max(0, DEMO_POLL.duration - (now - s.pollStart) / 1000),
      totalVotes: s.votes.reduce((sum, v) => sum + v, 0),
      demo: true, // Fußzeile „Vorschau — Demo-Daten“ (overlayI18n)
      choices: tx.choices.map((title, i) => ({ id: `demo-${i}`, title, votes: s.votes[i] || 0 })),
    },
    prediction: {
      title: tx.predTitle,
      status: predStatus,
      window: DEMO_PREDICTION.window,
      remaining: Math.max(0, DEMO_PREDICTION.window - (now - s.predStart) / 1000),
      winnerId: predStatus === 'RESOLVED' ? `demo-o${s.winner}` : null,
      outcomes: s.points.map((points, i) => ({
        id: `demo-o${i}`,
        title: names[i % names.length],
        points,
        users: s.users[i] || 0,
      })),
    },
    goals: {
      followers: 742 + creep,
      subs: 63 + Math.floor(creep / 4),
      subPoints: 81 + Math.floor(creep / 3),
      // So sähen die im Creator-Dashboard gesetzten Ziele aus
      twitch: {
        follower: { id: 'demo-f', type: 'follower', description: tx.followerGoal, current: 742 + creep, target: 1000 },
        subscription: { id: 'demo-s', type: 'subscription', description: tx.subGoal, current: 81 + Math.floor(creep / 3), target: 150 },
        subscription_count: { id: 'demo-sc', type: 'subscription_count', description: tx.subCount, current: 63 + Math.floor(creep / 4), target: 100 },
      },
      at: now,
    },
    stats: {
      live: true,
      startedAt: s.streamStart,
      endedAt: 0,
      viewers: 137 + (creep % 11),
      peakViewers: 214,
      follows: 18 + creep,
      subs: { new: 4, resub: 3, gift: 5 },
      bits: 4250 + creep * 25,
    },
    raid: demoRaid(lang),
  };
}

/* ── Szenen: Hilfen und Standbilder ───────────────────────────────────────── */

/** Nachrichten des Flugzeugs aus dem Textfeld: eine je Zeile. */
export function planeMessages(module) {
  return String(module.messages || '')
    .split('\n')
    .map((l) => l.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 12);
}

const demoHypes = {};

/** Stehender Beispielzug zum Ausrichten (Dashboard und ?demo=1). Je Sprache dasselbe Objekt (sonst stiege der Zug neu ein). */
export function demoHype(lang = 'de') {
  const key = DEMO_TEXTS[lang] ? lang : 'de';
  if (!demoHypes[key]) {
    demoHypes[key] = {
      id: `demo-train-${key}`,
      level: 3,
      total: 4200,
      progress: 620,
      goal: 1000,
      expiresAt: 0,
      endedAt: 0,
      people: DEMO_TEXTS[key].names.map((name, i) => ({ id: `demo-${i}`, name, avatar: '' })),
    };
  }
  return demoHypes[key];
}

/** Anmeldung der Murmelbahn mit Beispielspielern — zum Ausrichten, wenn nichts läuft. */
export function demoMarbles(module, lang = 'de') {
  return {
    id: 'demo',
    phase: 'join',
    command: String(module.joinCommand || '!murmel'),
    joinEndsAt: 0,
    seed: 0,
    startsAt: 0,
    winner: null,
    players: demoText(lang).names.slice(0, 9).map((name, i) => ({ id: `demo-${i}`, name, avatar: '' })),
  };
}

/** Weist den Demo-Daten dieselben Farben zu wie den echten. */
export function paintDemo(view, module) {
  if (!view) return null;
  if (view.choices) {
    return { ...view, choices: view.choices.map((c, i) => ({ ...c, color: module.colors[i % module.colors.length] })) };
  }
  return { ...view, outcomes: view.outcomes.map((o, i) => ({ ...o, color: module.colors[i % module.colors.length] })) };
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

/** Text eines Alerts: der eingestellte Text, leer = Standard der Sprache. */
export function alertTemplate(module, kind, lang) {
  const field = ALERT_TEXT_FIELD[kind];
  const own = String(module?.[field] ?? '').trim();
  if (own) return own;
  return (DEFAULT_TEXTS[lang] || DEFAULT_TEXTS.de).alerts[field] || '';
}

/**
 * Alert-Text mit eingesetzten Platzhaltern als Liste von Stücken — isName markiert den Namen, den das Widget
 * hervorhebt. Platzhalter: {name} {amount} {months} {subs} {bits} {viewers} {tier}; unbekannte bleiben stehen.
 * @param {object} t    Texte aus overlayI18n (anonymous, subsWord, bitsWord, viewersWord, tierWord)
 * @param {Function} num Zahlformat der Sprache
 */
export function alertTextParts(template, ev, t, num) {
  const amount = Number(ev?.amount) || 0;
  const vars = {
    name: ev?.name || t.anonymous,
    amount: num(amount),
    months: num(Number(ev?.months) || 0),
    subs: t.subsWord(amount, num(amount)),
    bits: t.bitsWord(amount, num(amount)),
    viewers: t.viewersWord(amount, num(amount)),
    tier: ev?.tier ? (t.tierWord[ev.tier] || '') : '',
  };
  const parts = [];
  for (const piece of String(template || '').split(/(\{\w+\})/)) {
    const m = piece.match(/^\{(\w+)\}$/);
    if (m && Object.prototype.hasOwnProperty.call(vars, m[1])) parts.push({ text: vars[m[1]], isName: m[1] === 'name' });
    else if (piece) parts.push({ text: piece, isName: false });
  }
  return parts;
}

/** Beispiel-Alert für die Bühne im Editor (zum Ausrichten). */
export function demoAlert(kind, t) {
  const amounts = { gift: 5, bits: 500, raid: 42 };
  return {
    id: `demo-${kind}`,
    kind,
    name: 'Mika',
    amount: amounts[kind] || 0,
    months: 14,
    tier: '1',
    message: t.demoAlertMessage[kind] || '',
    at: 0,
    test: true,
  };
}
