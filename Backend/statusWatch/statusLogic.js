// statusWatch/statusLogic.js — aus den Rohmessungen einer Prüfrunde den öffentlichen Status machen.
// Rein (keine Ein-/Ausgabe), damit sich Entprellung, Wartung und Störungsverlauf testen lassen.
//
// Stufen je Teil: "up" (grün), "slow"/"connecting"/"maintenance" (gelb), "down" (rot).
// Rot erst nach FAIL_THRESHOLD Fehlschlägen in Folge: Ein Backend-Neustart beim Deploy dauert ein
// paar Sekunden und soll keinen Alarm auslösen. Bis dahin bleibt der zuletzt gezeigte Stand stehen.

const FAIL_THRESHOLD = 3;
// So lange nach einem Backend-Start gilt ein noch nicht verbundener Bot als "verbindet" statt "offline"
const BOT_CONNECT_GRACE_S = 120;

const COMPONENTS = ["website", "server", "bot"];

const LEVEL_RANK = { up: 0, slow: 1, connecting: 1, maintenance: 1, down: 2 };

/**
 * Was diese Runde gemessen wurde, je Teil eine Stufe (ohne Entprellung).
 * @param {{ website: {ok:boolean, slow?:boolean}, server: {ok:boolean, uptimeS?:number, botReady?:boolean}, maintenance: boolean }} probe
 */
function rawLevels(probe) {
  const website = probe.website.ok ? (probe.website.slow ? "slow" : "up") : "down";

  let server;
  let bot;
  if (probe.server.ok) {
    server = "up";
    if (probe.server.botReady) bot = "up";
    else if (probe.maintenance || (probe.server.uptimeS ?? Infinity) < BOT_CONNECT_GRACE_S) bot = "connecting";
    else bot = "down";
  } else if (probe.maintenance) {
    server = "maintenance";
    bot = "maintenance";
  } else {
    // Der Bot läuft im selben Prozess wie das Backend — ohne Backend kein Bot
    server = "down";
    bot = "down";
  }
  return { website, server, bot };
}

function emptyState() {
  const components = {};
  for (const c of COMPONENTS) components[c] = { shown: "up", streak: 0 };
  return { components, overall: "up", since: null, incident: null, lastIncident: null, messageId: null };
}

function overallOf(components) {
  let worst = "up";
  for (const c of COMPONENTS) {
    const lvl = components[c].shown;
    if (LEVEL_RANK[lvl] > LEVEL_RANK[worst]) worst = lvl;
  }
  if (worst === "up") return "up";
  if (worst === "down") return "down";
  // Gelb: Wartung hat Vorrang in der Überschrift, sonst "eingeschränkt"
  return COMPONENTS.some((c) => components[c].shown === "maintenance") ? "maintenance" : "degraded";
}

/**
 * Nächster Zustand nach einer Prüfrunde.
 * @param {object} prev  bisheriger Zustand (emptyState()-Form)
 * @param {object} probe siehe rawLevels
 * @param {number} now   ms
 */
function nextState(prev, probe, now) {
  const base = prev && prev.components ? prev : emptyState();
  const raw = rawLevels(probe);
  const components = {};

  for (const c of COMPONENTS) {
    const before = base.components[c] || { shown: "up", streak: 0 };
    const measured = raw[c];
    if (measured === "down") {
      const streak = before.streak + 1;
      components[c] = { shown: streak >= FAIL_THRESHOLD ? "down" : before.shown, streak };
    } else {
      // Gelb und Grün sofort zeigen: Wartung ist angekündigt, "langsam"/"verbindet" ist kein Alarm
      components[c] = { shown: measured, streak: 0 };
    }
  }

  const overall = overallOf(components);
  const since = base.since == null || overall !== base.overall ? now : base.since;

  // Störungsverlauf: von Grün weg beginnt eine Störung, zurück auf Grün wird sie zur "letzten Störung"
  let incident = base.incident;
  let lastIncident = base.lastIncident;
  const affected = COMPONENTS.filter((c) => components[c].shown !== "up");
  if (overall !== "up") {
    if (!incident) incident = { start: now, components: affected, maintenance: overall === "maintenance", worst: overall };
    else {
      incident = {
        ...incident,
        components: [...new Set([...incident.components, ...affected])],
        // Einmal echter Ausfall bleibt Ausfall, auch wenn es danach nur noch Wartung ist
        worst: overall === "down" || incident.worst === "down" ? "down" : incident.worst,
        maintenance: incident.maintenance && overall === "maintenance",
      };
    }
  } else if (incident) {
    lastIncident = { ...incident, end: now };
    incident = null;
  }

  return { ...base, components, overall, since, incident, lastIncident };
}

module.exports = { FAIL_THRESHOLD, BOT_CONNECT_GRACE_S, COMPONENTS, rawLevels, emptyState, nextState };
