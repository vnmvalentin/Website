// statusWatch/updateEmbed.js — ein Eintrag aus Frontend/src/utils/newData.js (NEWS_UPDATES) → Embed für #updates.
// Gepostet werden nur die Überschriften der Abschnitte; der Link führt zur vollständigen Updates-Seite.
// Discord-Grenzen: Titel 256, Beschreibung 4096, 6000 Zeichen je Embed.

const COLOR = 0x8b5cf6; // Violett wie die Versionsmarke auf /updates
const TITLE_MAX = 256;
// Platz unter dem Beschreibungsdeckel (4096) für die Link-Zeile
const DESCRIPTION_BUDGET = 3800;

// Gleiche Trennung wie Frontend/src/pages/Updates.jsx (splitVersion): "v6.8: Titel"
function splitVersion(version) {
  const v = String(version || "");
  const idx = v.indexOf(":");
  if (idx === -1) return { num: v.trim(), title: "" };
  return { num: v.slice(0, idx).trim(), title: v.slice(idx + 1).trim() };
}

// Texte sind Fließtext von der Website — *, _, ` usw. sollen in Discord nicht als Formatierung wirken.
// Zeilenanfänge (#, >, -) sind kein Thema: jede Zeile beginnt mit "• ".
const escapeMarkdown = (s) => String(s).replace(/([\\*_`~|\[\]])/g, "\\$1");

function cut(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Nur die Abschnitts-Überschriften als Liste — die Stichpunkte stehen auf der Website.
 * @param {{date:string, version:string, sections:{title:string, items:string[]}[]}} entry
 * @param {string} updatesUrl  z.B. https://vnmvalentin.de/updates
 */
function buildUpdatePayload(entry, updatesUrl) {
  const { num, title } = splitVersion(entry.version);
  const sections = Array.isArray(entry.sections) ? entry.sections : [];
  const headings = sections.map((s) => String(s?.title || "").trim()).filter(Boolean);

  const lines = [];
  let used = 0;
  for (let i = 0; i < headings.length; i++) {
    const line = `• ${escapeMarkdown(cut(headings[i], TITLE_MAX))}`;
    const reserve = i < headings.length - 1 ? 30 : 0;
    if (used + line.length + 1 + reserve > DESCRIPTION_BUDGET) {
      lines.push(`*… und ${headings.length - i} weitere*`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  lines.push("", `[Alle Details auf der Website](${updatesUrl})`);

  return {
    content: "",
    embeds: [
      {
        title: cut(title ? `${num} – ${title}` : num, TITLE_MAX),
        url: updatesUrl,
        color: COLOR,
        description: lines.join("\n"),
        footer: { text: `Update vom ${entry.date}` },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Welche Einträge noch nicht gepostet sind, älteste zuerst.
 * Ohne bisherigen Stand nur der neueste — sonst käme beim ersten Mal die ganze Historie.
 * @param {object[]} entries  neueste zuerst (wie NEWS_UPDATES)
 * @param {string[]|null} posted bereits gepostete Versionen
 */
function selectNewEntries(entries, posted, max = 3) {
  if (!entries.length) return [];
  if (!posted) return [entries[0]];
  const seen = new Set(posted);
  const fresh = [];
  for (const e of entries) {
    if (seen.has(e.version)) break;
    fresh.push(e);
  }
  return fresh.slice(0, max).reverse();
}

module.exports = { buildUpdatePayload, selectNewEntries, splitVersion, escapeMarkdown };
