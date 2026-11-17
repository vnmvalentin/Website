// gameModesSpiegel.js — Spiegelt die offiziellen Modusnamen aus den Spieldaten in lib/gameModes.json: interner Name
// der API (battle.gameMode.name, z. B. "Draft_Competitive") → Name im Spiel auf Englisch und Deutsch („Triple Draft“ /
// „Dreifach-Auswahlkampf“) und der Symbol-Schlüssel des Spiels (icon_mode_draft → "draft").
//
// Quelle: RoyaleAPI cr-api-data (game_modes.json, aus den Spieldateien gezogen, Texte samt Übersetzungen). Die
// Sammlung ist seit Okt. 2023 eingefroren — neuere Modi und schief benannte Einträge ergänzt lib/gameModes.js (EIGENE).
//
// Aufruf: `npm run cr:modes` (Backend). Übernommen werden nur Einträge mit echtem Namen (nicht der Rohname selbst).
const fs = require("fs");
const path = require("path");

const SRC = "https://royaleapi.github.io/cr-api-data/json/game_modes.json";
const OUT = path.join(__dirname, "../lib/gameModes.json");

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
// Ein Name, der nur den Rohnamen oder eine Text-ID wiederholt, ist keiner
const isRealName = (text, raw) => !!text && text !== raw && !/^TID_/.test(text) && !/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(text);
const iconKey = (icon) => clean(icon).replace(/^icon_mode_/, "").replace(/^icon_/, "");

async function main() {
  const res = await fetch(SRC, { headers: { "User-Agent": "cr-game-modes-mirror" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${SRC}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("Unerwartetes Format: keine Liste");
  const out = {};
  let skipped = 0;
  for (const m of list) {
    const raw = clean(m?.name);
    const en = clean(m?.name_en || m?._lang?.tid?.en);
    if (!raw || !isRealName(en, raw)) { skipped += 1; continue; }
    const de = clean(m?._lang?.tid?.de);
    out[raw] = { en, ...(de && de !== en ? { de } : null), ...(m.icon ? { icon: iconKey(m.icon) } : null) };
  }
  // Eine Zeile je Modus, nach Namen sortiert — Änderungen bleiben im Diff lesbar
  const names = Object.keys(out).sort((a, b) => a.localeCompare(b));
  const body = names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(out[n])}`).join(",\n");
  fs.writeFileSync(OUT, `{\n${body}\n}\n`);
  console.log(`${names.length} Modi geschrieben nach ${path.relative(process.cwd(), OUT)} (${skipped} ohne echten Namen übersprungen)`);
}

main().catch((err) => {
  console.error("Fehler:", err.message || err);
  process.exit(1);
});
