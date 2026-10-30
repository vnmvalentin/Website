// statusWatch/tools/releaseUpdates.mjs — gesammelte Änderungen aus UPDATES_OFFEN.md als neue Version oben in
// Frontend/src/utils/newData.js (NEWS_UPDATES) eintragen und die Sammeldatei danach leeren. Läuft LOKAL in deploy.sh
// vor dem Frontend-Build; /updates zeigt die Version danach, post_updates postet sie nach Discord #updates.
//
//   node Backend/statusWatch/tools/releaseUpdates.mjs            eintragen + leeren
//   node Backend/statusWatch/tools/releaseUpdates.mjs --pruefen  nur zeigen, was entstehen würde
//
// Format der Sammeldatei: "## Überschrift", darunter "- Punkt" (eingerückte Folgezeilen gehören zum Punkt davor).
// Optional vor der ersten Überschrift "Titel: …" und "Version: v7.0". Ohne Version wird die letzte Zahl der
// neuesten Version hochgezählt (v6.9 → v6.10), ohne Titel entsteht er aus den Überschriften.
// HTML-Kommentare <!-- … --> werden ignoriert.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..", "..");
// Umleitbar für Tests — nie gegen die echten Dateien testen
const PENDING_FILE = process.env.UPDATES_PENDING_FILE || path.join(ROOT, "UPDATES_OFFEN.md");
const NEWS_FILE = process.env.UPDATES_NEWS_FILE || path.join(ROOT, "Frontend", "src", "utils", "newData.js");
const ANCHOR = "export const NEWS_UPDATES = [";

export const PENDING_TEMPLATE = `# Offene Updates

<!--
Sammelt alle sichtbaren Änderungen seit dem letzten Deploy. Beim nächsten ./deploy.sh (frontend oder beides)
wird daraus automatisch eine neue Version auf /updates und ein Post in Discord #updates; danach ist die Datei leer.

Format:
  Titel: Kurzer Titel der Version        (optional, sonst aus den Überschriften)
  Version: v7.0                          (optional, sonst letzte Zahl +1)

  ## Überschrift (wird in Discord gezeigt)
  - Ein Punkt in Nutzersprache, ohne Technik-Begriffe
-->
`;

/** Sammeldatei → { title, version, sections[] }; leere Abschnitte fallen weg, gleiche Überschriften werden zusammengelegt. */
export function parsePending(text) {
  const clean = String(text).replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  let title = "";
  let version = "";
  const sections = [];
  let current = null;
  let lastItemIdx = -1;
  for (const raw of clean.split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = /^##\s+(.+)$/.exec(trimmed);
    if (heading) {
      const name = heading[1].trim();
      current = sections.find((s) => s.title.toLowerCase() === name.toLowerCase());
      if (!current) {
        current = { title: name, items: [] };
        sections.push(current);
      }
      lastItemIdx = current.items.length - 1;
      continue;
    }
    if (!current) {
      const meta = /^(Titel|Version)\s*:\s*(.*)$/i.exec(trimmed);
      if (meta && meta[1].toLowerCase() === "titel") title = meta[2].trim();
      else if (meta) version = meta[2].trim();
      continue; // "# Offene Updates" und anderer Vorspann
    }
    const item = /^[-*]\s+(.+)$/.exec(trimmed);
    if (item) {
      current.items.push(item[1].trim());
      lastItemIdx = current.items.length - 1;
    } else if (/^\s/.test(raw) && lastItemIdx >= 0) {
      current.items[lastItemIdx] += ` ${trimmed}`;
    } else {
      throw new Error(`Zeile passt nicht ins Format (erwartet "## Überschrift" oder "- Punkt"): ${trimmed}`);
    }
  }
  return { title, version, sections: sections.filter((s) => s.items.length) };
}

/** "v6.9: …" → "v6.10"; ohne erkennbare Zahl "v1.0". */
export function nextVersion(latest) {
  const num = String(latest || "").split(":")[0].trim();
  const m = /^(.*?)(\d+)$/.exec(num);
  return m ? `${m[1]}${Number(m[2]) + 1}` : "v1.0";
}

export function defaultTitle(sections) {
  const names = sections.map((s) => s.title).filter((t) => !/^weitere/i.test(t));
  const pick = (names.length ? names : sections.map((s) => s.title)).slice(0, 3);
  if (pick.length <= 1) return pick[0] || "Neuerungen";
  return `${pick.slice(0, -1).join(", ")} und ${pick[pick.length - 1]}`;
}

export function todayDe(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Eintrag im Stil von newData.js (Strings per JSON.stringify → immer gültiges JS). */
export function renderEntry(entry) {
  const s = JSON.stringify;
  const sections = entry.sections
    .map(
      (sec) =>
        `      {\n        title: ${s(sec.title)},\n        items: [\n${sec.items
          .map((it) => `          ${s(it)},\n`)
          .join("")}        ]\n      },\n`
    )
    .join("");
  return `  {\n    date: ${s(entry.date)},\n    version: ${s(entry.version)},\n    sections: [\n${sections}    ]\n  },\n`;
}

async function loadNews(file) {
  // Abfrage-Zusatz, damit nach dem Schreiben nicht die zwischengespeicherte Fassung geladen wird
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  if (!Array.isArray(mod.NEWS_UPDATES)) throw new Error(`NEWS_UPDATES fehlt in ${file}`);
  return mod.NEWS_UPDATES;
}

async function main() {
  const dryRun = process.argv.includes("--pruefen");
  if (!fs.existsSync(PENDING_FILE)) {
    console.log(`[updates] ${path.basename(PENDING_FILE)} fehlt — keine offenen Updates.`);
    return;
  }
  const pending = parsePending(fs.readFileSync(PENDING_FILE, "utf8"));
  if (!pending.sections.length) {
    console.log("[updates] keine offenen Updates — keine neue Version.");
    return;
  }

  const before = fs.readFileSync(NEWS_FILE, "utf8");
  const anchorAt = before.indexOf(ANCHOR);
  if (anchorAt === -1) throw new Error(`"${ANCHOR}" nicht gefunden in ${NEWS_FILE}`);
  const news = await loadNews(NEWS_FILE);

  const num = pending.version || nextVersion(news[0] && news[0].version);
  if (news.some((e) => String(e.version).split(":")[0].trim() === num)) {
    throw new Error(`Version ${num} gibt es schon in newData.js — in UPDATES_OFFEN.md eine andere angeben.`);
  }
  const entry = {
    date: todayDe(),
    version: `${num}: ${pending.title || defaultTitle(pending.sections)}`,
    sections: pending.sections,
  };

  const items = entry.sections.reduce((n, sec) => n + sec.items.length, 0);
  console.log(`[updates] neue Version ${entry.version} (${entry.sections.length} Abschnitte, ${items} Punkte)`);
  for (const sec of entry.sections) console.log(`  • ${sec.title}`);
  if (dryRun) return;

  const lineEnd = before.indexOf("\n", anchorAt) + 1;
  const after = before.slice(0, lineEnd) + renderEntry(entry) + before.slice(lineEnd);
  fs.writeFileSync(NEWS_FILE, after);
  try {
    const check = await loadNews(NEWS_FILE);
    if (check[0].version !== entry.version || check.length !== news.length + 1) throw new Error("Eintrag fehlt nach dem Schreiben");
  } catch (e) {
    fs.writeFileSync(NEWS_FILE, before);
    throw new Error(`newData.js wäre kaputt gegangen, alter Stand wiederhergestellt: ${e.message}`);
  }
  fs.writeFileSync(PENDING_FILE, PENDING_TEMPLATE);
  console.log(`[updates] in newData.js eingetragen, ${path.basename(PENDING_FILE)} geleert.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`[updates] ${e.message}`);
    process.exit(1);
  });
}
