// utils/schnellsuche.js — Suchlogik der Schnellsuche (components/Schnellsuche.jsx), ohne React (Tests: node --test).
//
// Durchsucht: die Seitenliste (config/navigation.js, in der gewählten Sprache), dazu wichtige Unterseiten, die dort
// nicht stehen (EXTRA_SEITEN), die Clash-Royale-Karten und — in der Komponente über die API von Spur B — Spieler und
// Clans. Ein eingetippter Spieler-Tag (#2PP…) führt direkt zu Spieler bzw. Clan.

/** Kleinbuchstaben, ohne Akzente (ä → a), ß → ss, einfache Leerzeichen */
export function normalisiere(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

// Unterseiten ohne eigenen Eintrag in navigation.js — damit man sie trotzdem findet (Ziele aus den Routen)
export const EXTRA_SEITEN = [
  { id: "start", ziel: "/", titel: { de: "Startseite", en: "Home" }, stichwoerter: "home start" },
  { id: "profil", ziel: "/profile", titel: { de: "Profil", en: "Profile" }, text: { de: "Konto, Anmeldewege, Visitenkarte, App & Mitteilungen", en: "Account, sign-in methods, profile card, app & notifications" }, stichwoerter: "konto account visitenkarte mitteilungen benachrichtigung einstellungen settings" },
  { id: "updates", ziel: "/updates", titel: { de: "Updates & News", en: "Updates & news" }, text: { de: "Alle Neuerungen der Website", en: "Everything new on the website" }, stichwoerter: "changelog neu news" },
  // verkauf: nur, wenn verkauft werden darf (config/legal.js salesVisible → seitenIndex(…, { verkauf: true }))
  { id: "laden", ziel: "/laden", verkauf: true, titel: { de: "Unterstützen", en: "Support" }, text: { de: "Einmal unterstützen und Designs für die Spiele", en: "One-time support and designs for the games" }, stichwoerter: "laden shop spenden donate unterstuetzer supporter designs" },
  { id: "mitspielen", ziel: "/mitspielen", titel: { de: "Jetzt mitspielen", en: "Play along" }, text: { de: "Der aktuelle Stream-Raum und die Warteschlange", en: "The current stream room and the queue" }, stichwoerter: "stream raum mitspielen warteschlange queue play" },
  { id: "barrierefreiheit", ziel: "/barrierefreiheit", titel: { de: "Barrierefreiheit", en: "Accessibility" }, text: { de: "Bewegung reduzieren, mehr Kontrast, Farbhilfe", en: "Reduce motion, more contrast, colour help" }, stichwoerter: "accessibility a11y bewegung motion kontrast contrast farbschwaeche farbenblind colorblind tastatur keyboard screenreader untertitel captions" },
  { id: "tools", ziel: "/tools", titel: { de: "Streamer-Tools", en: "Streamer tools" }, text: { de: "Alle Overlays und Werkzeuge für Streamer", en: "All overlays and tools for streamers" }, stichwoerter: "overlay obs streamer" },
  { id: "discord-bot-info", ziel: "/tools/discord-bot", titel: { de: "Discord-Bot: Funktionen", en: "Discord bot: features" }, text: { de: "Was der Bot kann und wie er auf deinen Server kommt", en: "What the bot does and how to add it to your server" }, stichwoerter: "discord bot einladen invite hinzufuegen add funktionen features" },
  { id: "cr-karten", ziel: "/clash/karten", titel: { de: "Clash Royale Karten", en: "Clash Royale cards" }, text: { de: "Alle Karten mit Werten, Nutzung und Siegquote", en: "All cards with stats, usage and win rate" }, stichwoerter: "karten cards" },
  { id: "cr-decks", ziel: "/clash/decks", titel: { de: "Meta Decks", en: "Meta decks" }, text: { de: "Die Decks der besten Spieler", en: "The decks of the best players" }, stichwoerter: "deck meta" },
  { id: "cr-baukasten", ziel: "/clash/baukasten", titel: { de: "Deck-Baukasten", en: "Deck builder" }, text: { de: "Eigenes Deck bauen und prüfen", en: "Build and check your own deck" }, stichwoerter: "deck builder bauen" },
  { id: "cr-heute", ziel: "/clash/heute", titel: { de: "CR-Tagesrunde", en: "CR daily round" }, text: { de: "Fünf Ratespiele, jeden Tag neu", en: "Five guessing games, new every day" }, stichwoerter: "taeglich daily wordle raten" },
  { id: "cr-crown", ziel: "/clash/crown-series", titel: { de: "Crown Series", en: "Crown Series" }, stichwoerter: "turnier esport" },
  { id: "cr-vergleich", ziel: "/clash/vergleich", titel: { de: "Spieler vergleichen", en: "Compare players" }, stichwoerter: "vergleich compare" },
  { id: "wt-rueckblick", ziel: "/clash-royale/win-tracker/rueckblick", titel: { de: "Win Tracker: Saisonrückblick", en: "Win Tracker: season recap" }, stichwoerter: "rueckblick saison recap" },
  { id: "sr-daily", ziel: "/seed-runners/daily", titel: { de: "Seed Runners Tagesrennen", en: "Seed Runners daily race" }, stichwoerter: "daily taeglich rennen" },
  { id: "sr-levels", ziel: "/seed-runners/levels", titel: { de: "Seed Runners Community-Level", en: "Seed Runners community levels" }, stichwoerter: "level editor community" },
];

// Zusätzliche Suchwörter für Einträge der Seitenliste (id → Wörter), DE und EN gemischt
const STICHWOERTER = {
  "cr-stats": "spieler player profil stats statistik suche clan",
  "cr-rankings": "rangliste leaderboard top",
  "cr-minigames": "minispiele draft lobby",
  "win-tracker": "overlay obs medaillen liga",
  "win-challenge": "overlay obs challenge",
  "twitch-tools": "overlay umfrage poll prediction alerts subathon",
  garden: "farm garten",
  spieleabend: "vier gewinnt connect 4 brettspiel spieleabend game night mensch ärgere dich nicht ludo würfel zeichnen hochstapler impostor",
  "discord-bot": "bot server",
  "ytm-bot": "musik music songrequest",
  abstimmungen: "umfrage vote poll",
};

/** Seitenliste (navigationFuer(lang)) + Extras → flache Liste suchbarer Einträge */
export function seitenIndex(kategorien, lang = "de", { verkauf = false } = {}) {
  const liste = [];
  for (const c of kategorien || []) {
    if (c.to) liste.push({ art: "seite", id: `kat:${c.key}`, titel: c.label, text: c.description || "", ziel: c.to, bereich: "", stichwoerter: c.tagline || "", icon: c.icon || null });
    for (const l of c.links || []) {
      if (l.soon || l.locked) continue;
      liste.push({
        art: "seite",
        id: l.id || l.href || l.action,
        titel: l.label,
        text: l.description || "",
        ziel: l.to || l.href || null,
        extern: Boolean(l.href),
        aktion: l.action || null,
        bereich: c.label,
        stichwoerter: STICHWOERTER[l.id] || "",
        icon: l.icon || null,
      });
    }
  }
  for (const e of EXTRA_SEITEN) {
    if (e.verkauf && !verkauf) continue;
    liste.push({ art: "seite", id: e.id, titel: e.titel[lang] || e.titel.de, text: e.text ? (e.text[lang] || e.text.de) : "", ziel: e.ziel, bereich: "", stichwoerter: e.stichwoerter || "" });
  }
  // Doppelte Ziele (Seitenliste und Extra) nur einmal
  const gesehen = new Set();
  return liste.filter((e) => {
    const k = e.ziel || e.aktion || e.id;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

/**
 * Punkte für einen Eintrag; 0 = passt nicht. Jedes Wort der Anfrage muss irgendwo vorkommen.
 * Titel zählt mehr als Stichwörter, die mehr als die Beschreibung.
 */
export function bewerte({ titel = "", text = "", stichwoerter = "" }, anfrage) {
  const q = normalisiere(anfrage);
  if (!q) return 0;
  const t = normalisiere(titel);
  const s = normalisiere(stichwoerter);
  const d = normalisiere(text);
  const woerter = q.split(" ");
  if (!woerter.every((w) => t.includes(w) || s.includes(w) || d.includes(w))) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const titelWoerter = t.split(" ");
  if (woerter.every((w) => titelWoerter.some((tw) => tw.startsWith(w)))) return 60;
  if (t.includes(q)) return 45;
  if (woerter.every((w) => t.includes(w) || s.includes(w))) return 30;
  return 10;
}

/** Beste Treffer einer Liste (stabil sortiert) */
export function suche(liste, anfrage, max = 8) {
  return liste
    .map((e, i) => ({ e, p: bewerte(e, anfrage), i }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.e);
}

/** Karten (ALL_CARDS) als suchbare Einträge → Kartenseite /clash/karten/<id> */
export function kartenIndex(karten) {
  return (karten || []).map((k) => ({
    art: "karte",
    id: `karte:${k.id}`,
    titel: k.name,
    text: k.rarity || "",
    ziel: `/clash/karten/${k.id}`,
    stichwoerter: k.id.replace(/-/g, " "),
    kartenId: k.id,
  }));
}

/** „#2ppo“ → „2PP0“, sonst null (Zeichen, die in Clash-Royale-Tags vorkommen) */
export function alsTag(anfrage) {
  const t = String(anfrage || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  return /^[0289PYLQGRJCUV]{3,12}$/.test(t) && /^#|[0-9]/.test(String(anfrage).trim()) ? t : null;
}

// ── Zuletzt gewählt (nur im Browser) ─────────────────────────────────────────────────────────────────────────────

const ZULETZT_KEY = "vnm_suche_zuletzt_v1";
const ZULETZT_MAX = 6;

export function zuletztGewaehlt(storage = globalThis.localStorage) {
  try {
    const l = JSON.parse(storage.getItem(ZULETZT_KEY) || "[]");
    return Array.isArray(l) ? l.filter((e) => e && typeof e.ziel === "string" && typeof e.titel === "string") : [];
  } catch {
    return [];
  }
}

/** Gewähltes Ziel vorn einreihen (gleiches Ziel nur einmal). Aktionen (Feedback) und externe Links nicht. */
export function merkeZiel(eintrag, storage = globalThis.localStorage) {
  if (!eintrag?.ziel || eintrag.extern || eintrag.aktion || !eintrag.ziel.startsWith("/")) return;
  const knapp = { art: eintrag.art, titel: String(eintrag.titel).slice(0, 80), text: String(eintrag.text || "").slice(0, 120), ziel: eintrag.ziel, kartenId: eintrag.kartenId };
  try {
    const neu = [knapp, ...zuletztGewaehlt(storage).filter((e) => e.ziel !== knapp.ziel)].slice(0, ZULETZT_MAX);
    storage.setItem(ZULETZT_KEY, JSON.stringify(neu));
  } catch { /* privates Fenster */ }
}

// ── Offen/zu der Schnellsuche (ein Fenster für die ganze Seite) ──────────────────────────────────────────────────

let sucheOffen = false;
const sucheHoerer = new Set();
const meldeSuche = () => sucheHoerer.forEach((fn) => fn());
/** Öffnet die Schnellsuche (Knopf im Kopf, Tastenkürzel — auch von anderen Stellen aus nutzbar) */
export function oeffneSuche() { sucheOffen = true; meldeSuche(); }
export function schliesseSuche() { sucheOffen = false; meldeSuche(); }
export const istSucheOffen = () => sucheOffen;
export function abonniereSuche(fn) {
  sucheHoerer.add(fn);
  return () => sucheHoerer.delete(fn);
}
