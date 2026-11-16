// badgeSpiegel.js — Legt die Abzeichen-Bilder (Spielerprofil → Reiter „Abzeichen“ unter /clash/spieler/…) als Dateien
// nach Frontend/src/assets/clashRoyale/badges/, damit die Seite nicht von api-assets.clashroyale.com abhängt (dort
// fehlen für neuere Abzeichen ohnehin Bilder, siehe playerTabs.jsx).
//
// Die API kennt keine Liste aller Abzeichen — es gibt sie nur an echten Profilen. Das Werkzeug sammelt deshalb über
// die öffentlichen Stats-Routen (/api/clash/scout) Profile ein: Weltrangliste, Länder-Ranglisten (dort spielen auch
// schwächere Spieler → niedrigere Stufen) und Clans dieser Spieler. Abzeichen mit Stufen haben JE STUFE ein eigenes
// Bild (z. B. YearsPlayed, Grand12Wins) → Dateiname <Name>__<Stufe>.webp, ohne Stufen <Name>.webp.
// Vorhandene Dateien bleiben unangetastet (auch von Hand abgelegte); erneut laufen lassen ergänzt nur Fehlendes.
//
// Aufruf (Backend): npm run cr:badges -- [--profile 120] [--quelle https://…/api/clash/scout] [--tags TAG1,TAG2]
//                  npm run cr:badges -- --nur-liste   (keine Profile abrufen, nur Fehlendes aus badges/_liste.json laden)
// Lokal geht die Clash-API selbst nicht (Schlüssel an die Server-IP gebunden) — deshalb standardmäßig über die Live-
// Seite. Achtung: Jeder Profilabruf dort setzt das Profil 7 Tage auf die Beobachtungsliste (scoutRoutes → watch).
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const OUT = path.join(__dirname, "../../../Frontend/src/assets/clashRoyale/badges");
const REPORT = path.join(OUT, "_liste.json");
// sharp liegt im Frontend (dort für Bildwerkzeuge installiert) — von dort laden statt im Backend doppelt
const sharp = createRequire(path.join(__dirname, "../../../Frontend/package.json"))("sharp");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SRC = arg("quelle", process.env.SCOUT_URL || "https://vnmvalentin.de/api/clash/scout").replace(/\/$/, "");
const BUDGET = Math.max(1, Number(arg("profile", 120)) || 120);
const EXTRA = String(arg("tags", "")).split(",").map((t) => t.trim().replace(/^#/, "").toUpperCase()).filter(Boolean);
const SIZE = 128; // angezeigt mit 64px (scout.css .crs-badge) → doppelte Auflösung
const UA = { "User-Agent": "vnmvalentin.de badge mirror" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(p) {
  const res = await fetch(SRC + p, { headers: UA });
  const j = await res.json().catch(() => null);
  await sleep(1500); // freundlich zum eigenen Server und zur Clash-API dahinter
  return j && j.ok ? j : null;
}

/** Dateiname eines Abzeichens: Stufe nur, wenn es Stufen gibt (dann hat jede ihr eigenes Bild). Leerzeichen im Namen
 *  (z. B. "MasteryElixir Collector") werden zu _ — dieselbe Regel steht in playerTabs.jsx (badgeFile). */
const fileName = (name) => String(name).trim().replace(/\s+/g, "_");
const keyOf = (b) => (b.maxLevel > 1 && b.level ? `${fileName(b.name)}__${b.level}` : fileName(b.name));
const safe = (k) => /^[A-Za-z0-9_-]+$/.test(k);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const seen = new Map(); // key → Bild-Adresse
  // Bisher gesammelte Liste übernehmen — so bleibt sie über mehrere Läufe vollständig
  try { for (const [k, url] of Object.entries(JSON.parse(fs.readFileSync(REPORT, "utf8")).badges || {})) seen.set(fileName(k), url); } catch { /* erster Lauf */ }
  const ONLY_LIST = process.argv.includes("--nur-liste");
  const queue = ONLY_LIST ? [] : [...EXTRA];
  const queued = new Set(queue);
  const push = (tag) => { if (tag && !queued.has(tag)) { queued.add(tag); queue.push(tag); } };

  // Startpunkte: Weltrangliste (jeder 4.) und ein paar Länder-Ranglisten, dort eher die hinteren Plätze
  const top = ONLY_LIST ? null : await getJson("/ranking/players");
  (top?.items || []).filter((_, i) => i % 4 === 0).forEach((p) => push(p.tag));
  for (const loc of ONLY_LIST ? [] : [57000094, 57000056, 57000218, 57000120, 57000038, 57000153, 57000193, 57000007]) {
    const r = await getJson(`/ranking/players?loc=${loc}`);
    (r?.items || []).slice(-25).filter((_, i) => i % 3 === 0).forEach((p) => push(p.tag));
  }
  console.log(`${queue.length} Spieler in der Warteschlange, Budget ${BUDGET} Profile`);

  const clansDone = new Set();
  let profiles = 0;
  while (queue.length && profiles < BUDGET) {
    const tag = queue.shift();
    const j = await getJson(`/player/${tag}`);
    profiles += 1;
    const prof = j?.profile;
    if (!prof) continue;
    for (const b of prof.badges || []) if (b.icon && b.name) { const k = keyOf(b); if (!seen.has(k)) seen.set(k, b.icon); }
    // Clan des Spielers: Mitglieder aller Stärken — aber nur von schwächeren Spielern, die Top-Clans ähneln sich
    const clan = prof.clan?.tag;
    if (clan && !clansDone.has(clan) && clansDone.size < 6 && (prof.trophies ?? 0) < 9000) {
      clansDone.add(clan);
      const c = await getJson(`/clan/${clan}`);
      const members = c?.clan?.members || c?.members || [];
      members.filter((_, i) => i % 5 === 0).forEach((m) => push(m.tag));
    }
    if (profiles % 20 === 0) console.log(`… ${profiles} Profile, ${seen.size} Abzeichen-Bilder bekannt`);
  }

  let saved = 0, kept = 0;
  const failed = [];
  for (const [key, url] of seen) {
    if (!safe(key)) { failed.push(`${key} (Name)`); continue; }
    const file = path.join(OUT, `${key}.webp`);
    if (fs.existsSync(file)) { kept += 1; continue; }
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toFile(file);
      saved += 1;
    } catch (e) {
      failed.push(`${key} (${e.message})`);
    }
    await sleep(120);
  }
  // Liste aller gefundenen Abzeichen samt Adresse — zum Nachsehen, welche (noch) kein Bild bei Supercell haben
  fs.writeFileSync(REPORT, `${JSON.stringify({ at: new Date().toISOString().slice(0, 10), profiles, badges: Object.fromEntries([...seen].sort()) }, null, 1)}\n`);
  console.log(`${profiles} Profile, ${seen.size} Abzeichen-Bilder: ${saved} neu, ${kept} schon da, ${failed.length} ohne Bild`);
  if (failed.length) console.log("Ohne Bild:", failed.join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
