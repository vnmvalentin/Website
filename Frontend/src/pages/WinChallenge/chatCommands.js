// Gemeinsame Referenz der Twitch-Chat-Befehle — genutzt vom Editor und der Moderator-Ansicht.
// Die Verarbeitung passiert im Backend (Backend/lib/winchallengeIrc.js).

export const CHAT_COMMAND_DOCS = [
  { cmd: "!starttimer", desc: "Timer starten", perm: "timer" },
  { cmd: "!stoptimer / !pausetimer", desc: "Timer pausieren", perm: "timer" },
  { cmd: "!resettimer", desc: "Timer auf 00:00:00 zurücksetzen", perm: "timer" },
  { cmd: "!settimer 01:30:00", desc: "Timer auf eine Zeit setzen (HH:MM:SS oder MM:SS)", perm: "timer" },
  { cmd: "!hidetimer / !showtimer", desc: "Timer im Overlay aus- bzw. einblenden", perm: "timer" },
  { cmd: "!pin [Name]", desc: "Challenge anpinnen — unscharfe Suche, z. B. \"!pin minecraft\"", perm: "challenges" },
  { cmd: "!unpin [Name]", desc: "Angepinnte Challenge wieder lösen", perm: "challenges" },
  { cmd: "!+ [Name]", desc: "Zähler +1 — ohne Zähler: Challenge abschließen", perm: "challenges" },
  { cmd: "!- [Name]", desc: "Zähler −1 — ohne Zähler: Challenge wieder öffnen", perm: "challenges" },
];
