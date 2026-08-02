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
};

export const MODULE_DEFAULTS = {
  poll: { ...BASE_MODULE, x: 90, y: 620, colors: [...POLL_COLORS] },
  prediction: {
    ...BASE_MODULE,
    x: 1090,
    y: 620,
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
};

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
  return { v: CONFIG_VERSION, modules: JSON.parse(JSON.stringify(MODULE_DEFAULTS)) };
}

/** Gespeicherte Konfiguration auf die aktuelle Struktur heben. */
export function mergeConfig(saved) {
  const base = defaultConfig();
  if (!saved || typeof saved !== 'object') return base;

  const modules = {};
  for (const id of MODULE_IDS) {
    const def = base.modules[id];
    const got = saved.modules?.[id];
    modules[id] = {
      ...def,
      ...(got && typeof got === 'object' ? got : {}),
      colors: Array.isArray(got?.colors) && got.colors.length ? got.colors : def.colors,
    };
  }

  // Einmalige Umstellung: Der alte Standard des Abo-Ziels war fest "Abo-Punkte".
  // Wer nie bewusst etwas anderes gewählt hat, bekommt jetzt 'Automatisch' —
  // sonst bleibt das Modul leer, sobald im Creator-Dashboard ein Ziel über die
  // Anzahl statt über die Punkte läuft. Eine spätere eigene Wahl bleibt stehen,
  // weil ab v2 die Version mitgespeichert wird.
  if (Number(saved.v) < CONFIG_VERSION && modules.subGoal.twitchType === 'subscription') {
    modules.subGoal.twitchType = 'auto';
  }

  return { v: CONFIG_VERSION, modules };
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
    hint: 'Im Twitch-Chat abstimmen',
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
      label: module.label || g.description || 'Ziel',
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
 * Raid-Clip. Das Backend legt beim Raid ein Ereignis mit fertigem Clip ab und
 * setzt gleich mit, wie lange es zu sehen sein soll — hier wird nur noch
 * entschieden, ob es noch läuft.
 * @returns Widget-Daten oder null
 */
export function toRaidView(raid, module, now) {
  if (!raid || !module?.enabled) return null;
  // Vorlauf: das Overlay bleibt leer, bis der Raid-Alert durch ist
  if (raid.startsAt && now < raid.startsAt) return null;
  if (raid.endsAt && now > raid.endsAt) return null;
  return {
    id: raid.id,
    raider: raid.raider || { name: '', viewers: 0 },
    clip: raid.clip || null,
    playSeconds: Math.max(1, Number(raid.playSeconds) || 0),
    error: raid.error || null,
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

const DEMO_POLL = {
  title: 'Welche Map zocken wir als Nächstes?',
  duration: 90,
  choices: ['Rust', 'Dust II', 'Überraschung'],
};
const DEMO_PREDICTION = {
  title: 'Schaffen wir den Run ohne Tod?',
  window: 120,
  outcomes2: ['Ja, easy', 'Auf keinen Fall'],
  outcomes4: ['Locker', 'Knapp', 'Eher nicht', 'Niemals'],
};
// Zum Ausrichten des Raid-Moduls. endsAt bleibt 0, damit die Karte in der
// Vorschau stehen bleibt; abgespielt wird in der Demo nichts.
const DEMO_RAID = {
  id: 'demo-raid',
  demo: true,
  startsAt: 0,
  endsAt: 0,
  playSeconds: 24,
  raider: { login: 'beispielkanal', name: 'BeispielKanal', viewers: 137 },
  clip: { id: '', title: 'Der beste Moment des Streams', duration: 24, mp4: '', thumbnail: '', creator: 'BeispielKanal' },
  error: null,
};

function freshSim(outcomeCount) {
  return {
    votes: DEMO_POLL.choices.map(() => 30 + Math.floor(Math.random() * 140)),
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
 */
export function useDemoSim(enabled, outcomeCount = 2) {
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
        s.votes = DEMO_POLL.choices.map(() => 30 + Math.floor(Math.random() * 120));
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

  if (!enabled) return { poll: null, prediction: null, goals: null, raid: null };

  const s = sim.current;
  const now = Date.now();
  // Ziele kriechen langsam hoch, damit man den Balken laufen sieht
  const creep = Math.floor((now - s.pollStart) / 4000);
  const names = outcomeCount > 2 ? DEMO_PREDICTION.outcomes4 : DEMO_PREDICTION.outcomes2;
  const predStatus = s.predPhase === 'run' ? 'ACTIVE' : (s.predPhase === 'locked' ? 'LOCKED' : 'RESOLVED');

  return {
    poll: {
      title: DEMO_POLL.title,
      status: s.pollDone ? 'COMPLETED' : 'ACTIVE',
      duration: DEMO_POLL.duration,
      remaining: Math.max(0, DEMO_POLL.duration - (now - s.pollStart) / 1000),
      totalVotes: s.votes.reduce((sum, v) => sum + v, 0),
      hint: 'Vorschau — Demo-Daten',
      choices: DEMO_POLL.choices.map((title, i) => ({ id: `demo-${i}`, title, votes: s.votes[i] || 0 })),
    },
    prediction: {
      title: DEMO_PREDICTION.title,
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
        follower: { id: 'demo-f', type: 'follower', description: 'Auf zu 1000!', current: 742 + creep, target: 1000 },
        subscription: { id: 'demo-s', type: 'subscription', description: 'Abo-Ziel', current: 81 + Math.floor(creep / 3), target: 150 },
        subscription_count: { id: 'demo-sc', type: 'subscription_count', description: 'Abos', current: 63 + Math.floor(creep / 4), target: 100 },
      },
      at: now,
    },
    raid: DEMO_RAID,
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
