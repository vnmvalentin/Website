// tools.js — die Streamer-Werkzeuge, die in der Tool-Hülle (ToolShell.jsx) laufen.
// Bestimmt Name und Symbol in der Kopfleiste und die Liste im Tools-Menü. Ein neues Werkzeug
// hier eintragen UND in App.jsx unter eine der ToolShell-Routen hängen.
// ownerOnly: nur für den Kanalbetreiber (config/owner.js) — für alle anderen weder im Menü noch als Name in der Leiste.
import { Trophy, BarChart3, Grid3x3, Bot, Clapperboard } from "lucide-react";
import { isOwner } from "../../config/owner";

export const TOOLS = [
  { key: "win-challenge", label: "Win Challenge", icon: Trophy, to: "/WinChallenge-Overlay", match: /^\/winchallenge(-overlay|control)(\/|$)/i },
  { key: "twitch-tools", label: "Twitch-Overlays", icon: BarChart3, to: "/twitch-tools", match: /^\/twitch-tools(\/|$)/i },
  { key: "stream-szenen", label: "Stream-Szenen", icon: Clapperboard, to: "/stream-szenen", match: /^\/stream-szenen(\/|$)/i, ownerOnly: true },
  { key: "bingo", label: "Bingo", icon: Grid3x3, to: "/Bingo", match: /^\/bingo(\/|$)/i },
  { key: "discord-bot", label: "Discord-Bot", icon: Bot, to: "/discord-bot", match: /^\/discord-bot(\/|$)/i },
];

/** Die Werkzeuge, die dieser Nutzer sehen darf */
export function visibleTools(user) {
  return TOOLS.filter((t) => !t.ownerOnly || isOwner(user));
}

export function toolForPath(pathname, user) {
  return visibleTools(user).find((t) => t.match.test(pathname)) || null;
}
