// Gemeinsame Referenz der Twitch-Chat-Befehle — genutzt vom Editor und der Moderator-Ansicht.
// Die Verarbeitung passiert im Backend (Backend/lib/winchallengeIrc.js).

const COMMANDS = [
  { cmd: "!starttimer", perm: "timer", de: "Timer starten", en: "Start the timer" },
  { cmd: "!stoptimer / !pausetimer", perm: "timer", de: "Timer pausieren", en: "Pause the timer" },
  { cmd: "!resettimer", perm: "timer", de: "Timer zurücksetzen (Countdown: zurück auf die Startzeit)", en: "Reset the timer (countdown: back to the start time)" },
  { cmd: "!settimer 01:30:00", perm: "timer", de: "Timer auf eine Zeit setzen (HH:MM:SS oder MM:SS) — beim Countdown die Restzeit", en: "Set the timer to a time (HH:MM:SS or MM:SS) — for a countdown, the time left" },
  { cmd: "!hidetimer / !showtimer", perm: "timer", de: "Timer im Overlay aus- bzw. einblenden", en: "Hide or show the timer in the overlay" },
  { cmd: "!pin [Name]", perm: "challenges", de: "Challenge anpinnen — unscharfe Suche, z. B. \"!pin minecraft\"", en: "Pin a challenge — fuzzy search, e.g. \"!pin minecraft\"" },
  { cmd: "!unpin [Name]", perm: "challenges", de: "Angepinnte Challenge wieder lösen", en: "Unpin a pinned challenge" },
  { cmd: "!+ [Name]", perm: "challenges", de: "Zähler +1, bei einer Serie den nächsten Win abhaken — ohne Zähler: Challenge abschließen", en: "Counter +1, for a streak tick off the next win — without a counter: complete the challenge" },
  { cmd: "!- [Name]", perm: "challenges", de: "Zähler −1, bei einer Serie den letzten Win zurücknehmen — ohne Zähler: Challenge wieder öffnen", en: "Counter −1, for a streak take back the last win — without a counter: reopen the challenge" },
  { cmd: "!reset [Name]", perm: "challenges", de: "Zähler oder Serie zurück auf 0 — z. B. wenn die Serie gerissen ist", en: "Counter or streak back to 0 — e.g. when the streak is broken" },
];

/** Befehlsliste mit Beschreibung in der gewählten Sprache. */
export function chatCommandDocs(lang = "de") {
  return COMMANDS.map((c) => ({ cmd: c.cmd, perm: c.perm, desc: c[lang] || c.de }));
}
