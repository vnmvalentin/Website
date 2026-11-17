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
//                  npm run cr:badges -- --angleichen  (nur von Hand abgelegte Bilder auf die Größe der übrigen bringen,
//                                                      siehe angleichen() unten — nichts aus dem Netz)
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

// ── Angleichen ───────────────────────────────────────────────────────────────────────────────────────────────────
// Supercell lässt um jedes Abzeichen rund ein Drittel transparenten Rand (gemessen 17.11.2026: Inhalt 54–75 % der
// Bildbreite, CRL 64 %). Von Hand abgelegte Bilder (Screenshots, Nutzerdateien) sind meist eng zugeschnitten (86–92 %)
// und wirkten auf der Seite daneben deutlich größer. Solche Bilder werden hier auf FILL gebracht: Inhalt ohne
// Transparenz ausschneiden, auf FILL × SIZE verkleinern, mittig auf SIZE × SIZE setzen. Das Original wandert nach
// badges/originale/ (liegt nicht im Bilder-Glob der Seite). Nimmt auch .png unter dem API-Namen an (→ .webp).
const FILL = 0.65;
const HAND_MADE = 0.8; // so viel füllt kein Supercell-Bild
const NOT_BADGES = /^(crl|league2v2|crown-league-\d+|yearly_badge_.+)$/; // Symbole für andere Seiten, keine Abzeichen

/** Kasten um alle nicht (fast) durchsichtigen Pixel und dessen Anteil an der längeren Bildseite */
async function contentBox(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return { box, fill: Math.max(box.width, box.height) / Math.max(info.width, info.height) };
}

async function angleichen() {
  const ORIG = path.join(OUT, "originale");
  fs.mkdirSync(ORIG, { recursive: true });
  const inner = Math.round(SIZE * FILL);
  let done = 0;
  for (const f of fs.readdirSync(OUT).filter((n) => /\.(webp|png)$/i.test(n)).sort()) {
    const key = f.replace(/\.(webp|png)$/i, "");
    if (!safe(key) || /^Mastery/.test(key) || NOT_BADGES.test(key)) continue;
    const file = path.join(OUT, f);
    const png = /\.png$/i.test(f);
    // Erst in den Speicher: unter Windows hält sharp eine gelesene Datei offen, das Überschreiben schlüge dann fehl
    const src = fs.readFileSync(file);
    const m = await contentBox(src);
    if (!m) continue;
    // Supercell-Kopien (128 px, normaler Rand) bleiben, wie sie sind
    if (!png && m.fill <= HAND_MADE) continue;
    const buf = await sharp(src).extract(m.box)
      .resize(inner, inner, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    const left = Math.floor((SIZE - meta.width) / 2), top = Math.floor((SIZE - meta.height) / 2);
    const out = await sharp(buf)
      .extend({ left, top, right: SIZE - meta.width - left, bottom: SIZE - meta.height - top, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88 }).toBuffer();
    const backup = path.join(ORIG, f);
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    if (png) fs.unlinkSync(file);
    fs.writeFileSync(path.join(OUT, `${key}.webp`), out);
    done += 1;
    console.log(`${f}: Inhalt ${Math.round(m.fill * 100)} % → ${Math.round(FILL * 100)} %${png ? " (als .webp)" : ""}`);
  }
  console.log(`${done} Bilder angeglichen, Originale in ${path.relative(process.cwd(), ORIG)}`);
}

(async () => {
  if (process.argv.includes("--angleichen")) return angleichen();
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
