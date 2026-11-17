// tools.js — die Streamer-Werkzeuge, die in der Tool-Hülle (ToolShell.jsx) laufen.
// Bestimmt Name und Symbol in der Kopfleiste und die Liste im Tools-Menü. Ein neues Werkzeug
// hier eintragen UND in App.jsx unter eine der ToolShell-Routen hängen.
// ownerOnly: nur für den Kanalbetreiber (config/owner.js) — für alle anderen weder im Menü noch als Name in der Leiste.
// label: Name je Sprache; Deutsch muss immer da sein (toolLabel fällt darauf zurück).
// langs: Sprachen, in denen das Werkzeug vollständig übersetzt ist. Erst wenn es mehr als Deutsch kann, zeigt die
// Hülle den Umschalter und schreibt Leiste und Menü in der gewählten Sprache (Werkzeuge ohne Eintrag bleiben deutsch).
import { Trophy, BarChart3, Grid3x3, Bot, Clapperboard, LayoutDashboard } from "lucide-react";
import { isOwner } from "../../config/owner";

export const TOOLS = [
  // Gemeinsamer Startpunkt: Stand aller Werkzeuge und Einrichtungs-Assistent (pages/StreamerTools/zentrale)
  { key: "zentrale", label: { de: "Streamer-Zentrale", en: "Streamer dashboard" }, icon: LayoutDashboard, to: "/streamer-zentrale", match: /^\/streamer-zentrale(\/|$)/i, langs: ["de", "en"] },
  { key: "win-challenge", label: { de: "Win Challenge", en: "Win Challenge" }, icon: Trophy, to: "/WinChallenge-Overlay", match: /^\/winchallenge(-overlay|control)(\/|$)/i, langs: ["de", "en"] },
  { key: "twitch-tools", label: { de: "Twitch-Overlays", en: "Twitch overlays" }, icon: BarChart3, to: "/twitch-tools", match: /^\/twitch-tools(\/|$)/i, langs: ["de", "en"] },
  { key: "stream-szenen", label: { de: "Stream-Szenen", en: "Stream scenes" }, icon: Clapperboard, to: "/stream-szenen", match: /^\/stream-szenen(\/|$)/i, ownerOnly: true },
  { key: "bingo", label: { de: "Bingo", en: "Bingo" }, icon: Grid3x3, to: "/Bingo", match: /^\/bingo(\/|$)/i, langs: ["de", "en"] },
  { key: "discord-bot", label: { de: "Discord-Bot", en: "Discord bot" }, icon: Bot, to: "/discord-bot", match: /^\/discord-bot(\/|$)/i, langs: ["de", "en"] },
];

/** Name eines Werkzeugs in einer Sprache */
export function toolLabel(tool, lang) {
  return tool.label[lang] || tool.label.de;
}

/** Die Werkzeuge, die dieser Nutzer sehen darf */
export function visibleTools(user) {
  return TOOLS.filter((t) => !t.ownerOnly || isOwner(user));
}

export function toolForPath(pathname, user) {
  return visibleTools(user).find((t) => t.match.test(pathname)) || null;
}
