// zentraleView.js — aus dem Stand (/api/streamer-zentrale + Discord) wird die Anzeige je Werkzeug: Zustand,
// Kennzahlen, Hinweise. Ohne React, damit es sich ohne Browser prüfen lässt (__tests__/zentrale.test.js).
import { BarChart3, Trophy, Swords, Gamepad2, Grid3x3, Bot } from "lucide-react";
import { agoText, LIVE_MS, WT_LIVE_MS } from "./zentraleTexts.js";

/**
 * Die Werkzeuge der Zentrale. overlay: hat einen eigenen OBS-Link, den der Assistent holen kann; size: empfohlene
 * Größe der Browserquelle (null = steht im Werkzeug); wizard: im Assistenten wählbar; cr: nur für Clash Royale.
 */
export const ZENTRALE_TOOLS = [
  { key: "twitch", to: "/twitch-tools", icon: BarChart3, overlay: true, size: [1920, 1080], wizard: true },
  { key: "winChallenge", to: "/WinChallenge-Overlay", icon: Trophy, overlay: true, size: [1920, 1080], wizard: true },
  { key: "winTracker", to: "/clash-royale/win-tracker", icon: Swords, overlay: true, size: null, wizard: true, cr: true },
  { key: "viewerGames", to: "/clash/viewer-games", icon: Gamepad2, overlay: true, size: [400, 820], wizard: true, cr: true },
  { key: "bingo", to: "/Bingo", icon: Grid3x3, overlay: false, wizard: true },
  { key: "discord", to: "/discord-bot", icon: Bot, overlay: false, wizard: false },
];
export const WIZARD_TOOLS = ZENTRALE_TOOLS.filter((x) => x.wizard);

/** Läuft die OBS-Quelle dieses Werkzeugs (laut Stand der Zentrale)? */
export function isConnected(tool, status) {
  const s = status?.tools?.[tool];
  if (!s || !s.used) return false;
  const now = status.serverNow || Date.now();
  if (tool === "viewerGames") return !!s.live;
  if (tool === "winTracker") return !!s.lastFetched && now - s.lastFetched < WT_LIVE_MS;
  return !!s.seenAt && now - s.seenAt < LIVE_MS;
}

/**
 * Anzeige eines Werkzeugs.
 * @returns {{ key, used, facts: string[], issues: string[], overlayPath: string, state: { kind, text } }}
 *   kind: live | seen | ready | never | off
 */
export function toolView(key, status, discord, t, lang) {
  const now = status?.serverNow || Date.now();
  const s = status?.tools?.[key] || { used: false, issues: [] };
  const seen = (ts) => {
    if (ts && now - ts < LIVE_MS) return { kind: "live", text: t.state.live };
    if (ts) return { kind: "seen", text: t.state.seen(agoText(t, ts, now, lang)) };
    return { kind: "never", text: t.state.never };
  };
  const out = { key, used: !!s.used, facts: [], issues: [...(s.issues || [])], overlayPath: s.overlayPath || "", state: null };

  if (key === "twitch" && s.used) {
    out.facts.push(Array.isArray(s.modules) ? t.facts.twitchModules(s.modules.length) : t.facts.twitchDefault);
    if (s.login) out.facts.push(t.facts.twitchChannel(s.login));
    out.state = seen(s.seenAt);
  }
  if (key === "winChallenge" && s.used) {
    out.facts.push(s.total ? t.facts.wcOpen(s.open, s.total) : t.facts.wcEmpty);
    if (s.chat) out.facts.push(t.facts.wcChat);
    out.state = seen(s.seenAt);
  }
  if (key === "winTracker" && s.used) {
    out.facts.push(t.facts.wtAccounts(s.accounts || 0));
    if (s.active) out.facts.push(t.facts.wtActive(s.active));
    if (s.lastFetched && now - s.lastFetched < WT_LIVE_MS) out.state = { kind: "live", text: t.state.live };
    else if (s.lastFetched) out.state = { kind: "seen", text: t.state.data(agoText(t, s.lastFetched, now, lang)) };
    else out.state = { kind: "never", text: t.state.never };
  }
  if (key === "viewerGames" && s.used) {
    const names = (s.modes || []).map((m) => t.facts.vgModeNames[m] || m);
    if (names.length) out.facts.push(t.facts.vgModes(names.join(", ")));
    out.state = s.live ? { kind: "live", text: t.state.live } : { kind: "ready", text: t.state.ready };
  }
  if (key === "bingo" && s.used) {
    out.facts.push(t.facts.bingoCards(s.cards || 0));
    if (s.latest) out.facts.push(t.facts.bingoLatest(s.latest));
    out.state = seen(s.seenAt);
  }
  if (key === "discord") {
    const bots = (discord?.guilds || []).filter((g) => g.botPresent).length;
    out.used = !!discord?.linked && bots > 0;
    // Ohne Verknüpfung ist es schlicht „nicht eingerichtet“ — ein Hinweis erst, wenn jemand angefangen hat
    if (discord?.linked && discord.down) out.issues.push("discord_down");
    else if (discord?.linked && bots === 0) out.issues.push("discord_no_bot");
    if (bots) out.facts.push(t.facts.discordServers(bots));
    out.state = out.used ? { kind: "ready", text: t.state.ready } : null;
  }
  if (!out.used && key !== "discord") out.issues = [];
  if (!out.state) out.state = { kind: "off", text: t.state.notSetUp };
  return out;
}
