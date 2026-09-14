// cardIconSpiegel.js — Spiegelt die Karten-Icon-URLs der OFFIZIELLEN Clash-Royale-API
// (api-assets.clashroyale.com) in eine lokale JSON-Datei, statt sie live von einem
// Drittanbieter (cdn.royaleapi.com) zu laden. Grund: royaleapi.com selbst war zuletzt spürbar
// langsam/unzuverlässig — Supercells eigenes CDN ist die stabilere Quelle, die wir ohnehin
// schon per Token ansprechen dürfen (siehe crApi.js).
//
// WICHTIG — NUR URLs, KEINE BILDDATEN: Supercells Kartenartwork darf laut Fan-Content-Policy
// nicht als Datei mitgeliefert werden (siehe Kommentar in Frontend/src/pages/ClashRoyale/ui/
// CrIcons.jsx und modes/cardCrop.js). Diese Datei speichert deshalb NUR die Bild-URLs
// (Text/Links), niemals die Bilder selbst — der Browser lädt die Bilder weiterhin live direkt
// von api-assets.clashroyale.com, genau wie vorher von cdn.royaleapi.com. Nichts an diesem
// Skript lädt oder schreibt Bilddaten.
//
// Die URLs sind hash-basiert und über Jahre stabil beobachtet (dieselbe Karte behält ihren
// Hash i.d.R. auch nach Balance-Änderungen) — trotzdem kein Live-Dauerzustand: bei neuen Karten
// oder falls sich einzelne URLs doch ändern, dieses Skript erneut laufen lassen
// (`npm run cr:card-icons` im Backend-Ordner), analog zu garden:spiegel.
//
// Matching: ALL_CARDS (core/cards.js, unsere kebab-case ids) gegen die offizielle
// /cards-Antwort (echte Namen) über den normalisierten Namen — dieselbe Normalisierung wie
// normalizeCardName in crWinTrackerRoutes.js.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ALL_CARDS } = require("../core/cards");

const TOKEN = process.env.CLASH_ROYALE_API_TOKEN_WINTRACKER || process.env.CLASH_ROYALE_API_TOKEN;

const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  if (!TOKEN) {
    console.error("Kein CLASH_ROYALE_API_TOKEN(_WINTRACKER) gesetzt — Abbruch.");
    process.exit(1);
  }

  const res = await fetch("https://api.clashroyale.com/v1/cards", {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    console.error(`Offizielle API antwortete mit ${res.status} — Abbruch.`);
    process.exit(1);
  }
  const data = await res.json();
  const officialByName = new Map(data.items.map((c) => [normalize(c.name), c]));

  const mapping = {};
  const missing = [];
  for (const card of ALL_CARDS) {
    const official = officialByName.get(normalize(card.name));
    if (!official) { missing.push(card.id); continue; }
    const urls = official.iconUrls || {};
    const entry = { base: urls.medium || null };
    if (urls.evolutionMedium) entry.ev1 = urls.evolutionMedium;
    if (urls.heroMedium) entry.hero = urls.heroMedium;
    mapping[card.id] = entry;
  }

  if (missing.length) {
    console.error("KEIN Treffer für:", missing.join(", "));
    console.error(`${missing.length} von ${ALL_CARDS.length} Karten nicht zugeordnet — Datei wird NICHT geschrieben.`);
    process.exit(1);
  }

  const json = JSON.stringify(mapping, null, 2) + "\n";
  const targets = [
    path.join(__dirname, "..", "data", "cardIconUrls.json"),
    path.join(__dirname, "..", "..", "..", "Frontend", "src", "pages", "ClashRoyale", "data", "cardIconUrls.json"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, json, "utf8");
    console.log("geschrieben:", t);
  }

  // Zusätzlich als globale JS-Variable für admin-lasso.html (dle/tools/) — die Seite läuft per
  // Doppelklick über file:// (siehe eigener Kommentar dort), fetch()/import auf eine JSON-Datei
  // würde dort an CORS scheitern. Ein simples <script src>-Include auf eine Nachbardatei
  // funktioniert dagegen auch über file://.
  const adminLassoTarget = path.join(__dirname, "..", "..", "dle", "tools", "adminLassoCardIconUrls.js");
  fs.writeFileSync(adminLassoTarget, `// Automatisch erzeugt von cardIconSpiegel.js — nicht von Hand bearbeiten.\nwindow.CR_CARD_ICON_URLS = ${json};\n`, "utf8");
  console.log("geschrieben:", adminLassoTarget);

  const withEvo = Object.values(mapping).filter((e) => e.ev1).length;
  const withHero = Object.values(mapping).filter((e) => e.hero).length;
  console.log(`${ALL_CARDS.length} Karten gespiegelt (${withEvo} mit Evolution, ${withHero} mit Hero-Form).`);
}

main().catch((e) => { console.error("cardIconSpiegel fehlgeschlagen:", e.message); process.exit(1); });
