// cardStatsSpiegel.js — Spiegelt die Kampfwerte aller Karten (Leben, Schaden, Angriffstempo, Tempo, Reichweite …)
// aus dem Clash-Royale-Wiki (clashroyale.fandom.com) in eine JSON-Datei fürs Frontend
// (Frontend/src/pages/ClashRoyale/data/cardStats.json, genutzt vom Höher-Tiefer-Spiel unter /clash).
//
// Warum das Wiki: Die offizielle API (/v1/cards) liefert nur Name, Elixier, Seltenheit — keine Werte. Die
// RoyaleAPI-Datensammlung (cr-api-data) ist seit Okt. 2023 eingefroren (14 neuere Karten fehlen, alte Balance).
// Das Wiki pflegt die Werte auf Turnierniveau (Level 11) aktuell; ausgelesen werden nur Zahlen.
//
// Aufruf: `npm run cr:card-stats` (Backend). Nach Balance-Änderungen oder neuen Karten erneut laufen lassen.
// Schreibt nur Karten mit Werten; was fehlt, steht am Ende in der Ausgabe.
const fs = require("fs");
const path = require("path");
const { ALL_CARDS } = require("../core/cards");

const OUT = path.join(__dirname, "../../../Frontend/src/pages/ClashRoyale/data/cardStats.json");
const API = "https://clashroyale.fandom.com/api.php";
// Wo unser Kartenname nicht dem Wiki-Titel entspricht
const TITLE = { "boss-bandit": "Boss Bandit", "mini-pekka": "Mini P.E.K.K.A", pekka: "P.E.K.K.A", "x-bow": "X-Bow", "the-log": "The Log" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => {
  const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

async function wikitext(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&redirects=1`;
  const res = await fetch(url, { headers: { "User-Agent": "vnmvalentin.de card-stats mirror (contact via website)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.parse) throw new Error(j.error?.info || "keine Seite");
  return j.parse.wikitext["*"];
}

/** Erste Eigenschaften-Tabelle der Seite: Spaltennamen + erste Datenzeile */
function attributes(w) {
  const at = w.indexOf("unit-attributes-table");
  if (at < 0) return {};
  const table = w.slice(at).split("\n|}")[0];
  const [headPart, ...rows] = table.split("\n|-");
  const heads = headPart.split("\n").filter((l) => l.startsWith("!"))
    .map((l) => l.replace(/^!\s*(scope="col"\s*\|)?/, "").replace(/<br\s*\/?>.*$/i, "").replace(/\{\{.*$/, "").trim());
  if (!rows.length) return {};
  // Zellen können über mehrere Zeilen verteilt sein: alles nach "|" zusammenziehen, an "||" bzw. Zeilenanfängen teilen
  const cells = rows[0].split("\n").filter((l) => l.startsWith("|")).map((l) => l.slice(1)).join("||").split("||").map((c) => c.trim());
  // Nur übernehmen, wenn Spalten und Zellen zusammenpassen — sonst landen Werte in der falschen Spalte
  // (Seiten mit mehreren Einheiten haben mehrere Zeilen bzw. Zusatzspalten)
  if (cells.length !== heads.filter(Boolean).length || rows.length > 2) return {};
  const out = {};
  heads.forEach((h, i) => { if (h) out[h] = cells[i]; });
  return out;
}

/** "1 min 50 sec" → 110, "30 sec" → 30 */
function seconds(s) {
  if (s == null) return null;
  const t = String(s);
  const min = t.match(/([\d.]+)\s*min/);
  const sec = t.match(/([\d.]+)\s*sec/);
  if (!min && !sec) return num(t);
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0);
}

function vars(w) {
  const out = {};
  for (const m of w.matchAll(/#vardefine:\s*([a-z0-9_]+)\s*\|\s*([^}]*)\}/gi)) {
    if (!(m[1] in out)) out[m[1]] = num(m[2]);
  }
  return out;
}

/* Karten mit mehreren Einheiten: welche Wiki-Variable gilt und wozu sie gehört ([Deutsch, Englisch]).
   hp/dmg: Variablenname oder null (= Wert weglassen, weil nicht sinnvoll vergleichbar). note: Zusatzhinweis. */
const U = (de, en) => [de, en];
const PICK = {
  "suspicious-bush": { hp: "bush_hp_11", hpOf: U("Busch", "Bush"), dmgOf: U("Busch-Kobolde", "Bush Goblins") },
  "skeleton-barrel": { hpOf: U("Fass", "Barrel"), dmgOf: U("Skelette", "Skeletons") },
  tombstone: { hp: "tomb_hp_11", hpOf: U("Grabstein", "Tombstone"), dmgOf: U("Skelette", "Skeletons") },
  "goblin-hut": { hp: "hut_hp_11", hpOf: U("Hütte", "Hut"), dmgOf: U("Speerkobolde", "Spear Goblins") },
  "barbarian-hut": { hp: "hut_hp_11", hpOf: U("Hütte", "Hut"), dmgOf: U("Barbaren", "Barbarians") },
  "goblin-cage": { hp: "cage_hp_11", hpOf: U("Käfig", "Cage"), dmgOf: U("Kobold-Schläger", "Goblin Brawler") },
  "goblin-drill": { hp: "drill_hp_11", hpOf: U("Bohrer", "Drill"), dmgOf: U("Kobolde", "Goblins") },
  "battle-ram": { hp: "ram_hp_11", dmg: "ram_dmg_11", hpOf: U("Rammbock", "Ram"), dmgOf: U("Rammbock, ohne Sturmangriff", "Ram, without charge") },
  furnace: { dmg: null, hpOf: U("Ofen", "Furnace") },
  "goblin-curse": { hp: null, dmg: null },
  rascals: { hp: "boy_hp_11", dmg: "boy_dmg_11", hpOf: U("Rabauken-Junge", "Rascal Boy"), dmgOf: U("Rabauken-Junge", "Rascal Boy") },
  "goblin-gang": { hp: "stab_hp_11", dmg: "stab_dmg_11", hpOf: U("Messer-Kobold", "Goblin"), dmgOf: U("Messer-Kobold", "Goblin") },
  "elixir-golem": { hp: "golem_hp_11", dmg: "golem_dmg_11", hpOf: U("Golem, ohne Teilstücke", "Golem, without splits"), dmgOf: U("Golem", "Golem") },
  golem: { hp: "golem_hp_11", dmg: "golem_dmg_11", hpOf: U("Golem, ohne Golemites", "Golem, without Golemites"), dmgOf: U("Golem", "Golem") },
  "goblin-giant": { hp: "giant_hp_11", dmg: "giant_dmg_11", hpOf: U("Riese, ohne Speerkobolde", "Giant, without Spear Goblins"), dmgOf: U("Riese", "Giant") },
  "lava-hound": { hp: "hound_hp_11", dmg: "hound_dmg_11", hpOf: U("Lavahund, ohne Welpen", "Hound, without Pups"), dmgOf: U("Lavahund", "Hound") },
  witch: { hpOf: U("Hexe, ohne Skelette", "Witch, without Skeletons"), dmgOf: U("Hexe", "Witch") },
  "night-witch": { hpOf: U("Nachthexe, ohne Fledermäuse", "Night Witch, without Bats"), dmgOf: U("Nachthexe", "Night Witch") },
  "mother-witch": { hpOf: U("Mutterhexe", "Mother Witch"), dmgOf: U("Mutterhexe", "Mother Witch") },
  "little-prince": { hpOf: U("Prinz, ohne Wächter", "Prince, without Guardienne"), dmgOf: U("Prinz", "Prince") },
  goblinstein: { hp: "monster_hp_11", dmg: "monster_dmg_11", hpOf: U("Monster", "Monster"), dmgOf: U("Monster", "Monster") },
  "ram-rider": { hpOf: U("Widder", "Ram"), dmgOf: U("Widder, ohne Reiterin", "Ram, without Rider") },
  // Schaden steigt beim Dauerstrahl an — ein einzelner Wert wäre irreführend
  "inferno-tower": { dmg: null }, "inferno-dragon": { dmg: null }, "mighty-miner": { dmg: null }, void: { dmg: null },
};
const SPAWNERS = new Set(["suspicious-bush", "skeleton-barrel", "tombstone", "goblin-hut", "barbarian-hut", "goblin-cage", "goblin-drill"]);
const SPELL_NOTE = U("Schaden gegen Truppen, ohne Kronenturm-Schaden", "Damage to troops, not crown towers");

/** Letzte Balance-Änderung laut Abschnitt „History“ (Datum T/M/JJJJ) als JJJJ-MM-TT */
function lastChange(w) {
  const i = w.search(/==\s*History\s*==/);
  if (i < 0) return null;
  const rest = w.slice(i + 5);
  const end = rest.search(/\n==[^=]/);
  const h = end < 0 ? rest : rest.slice(0, end);
  const dates = [...h.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map((m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`).sort();
  return dates.at(-1) || null;
}

function shape(card, w) {
  const a = attributes(w);
  const v = vars(w);
  const get = (...names) => { const k = Object.keys(a).find((h) => names.some((n) => h.toLowerCase() === n)); return k ? a[k] : undefined; };
  const speedTxt = get("speed");
  const rangeTxt = get("range");
  // Haupteinheit: hp_11 bzw. das erste "<einheit>_hp_11" (Golem vor Golemite); Werte auf Level 1 (hp_base) nicht
  const first = (re) => { const k = Object.keys(v).find((x) => re.test(x)); return k ? v[k] : null; };
  const pick = PICK[card.id] || {};
  const from = (key, fallback) => (key === null ? null : key ? v[key] ?? null : fallback);
  const stats = {
    hp: from(pick.hp, v.hp_11 ?? first(/^[a-z]+_hp_11$/)),
    damage: from(pick.dmg, v.dmg_11 ?? first(/^[a-z]+_dmg_11$/)),
    hitSpeed: seconds(get("hit speed")) ?? v.atk_speed ?? first(/^[a-z]+_atk_speed$/),
    speed: speedTxt ? num(String(speedTxt).match(/\((\d+)\)/)?.[1]) : null,
    range: rangeTxt ? num(String(rangeTxt).match(/\(([\d.]+)\)/)?.[1] ?? rangeTxt) : null,
    deployTime: seconds(get("deploy time")),
    count: num(get("count")),
    lifetime: v.life ?? seconds(get("lifetime")),
    radius: num(get("radius")),
  };
  const isSpell = /Spell/.test(get("type") || "") || (stats.hp == null && stats.hitSpeed == null && stats.damage != null);
  // Mehrfachtreffer je Angriff (Jäger ×10, Henker ×2 …): Schaden bleibt pro Treffer, DPS zählt alle Treffer
  const hits = !isSpell && v.dmg_hits > 1 ? v.dmg_hits : 1;
  if (stats.damage && stats.hitSpeed) stats.dps = Math.round((stats.damage * hits) / stats.hitSpeed);
  // Zwei Einheitenarten (Kobold-Gang: Speer + Messer): die Anzahl der Tabelle zählt nur eine davon
  const units = new Set(Object.keys(v).map((k) => k.match(/^([a-z]+)_hp_11$/)?.[1]).filter(Boolean));
  if (units.size > 1) delete stats.count;
  // Leere Werte weglassen
  Object.keys(stats).forEach((k) => { if (stats[k] == null || Number.isNaN(stats[k])) delete stats[k]; });

  // Wozu gehören die Werte? Nur wo es nicht offensichtlich ist
  const of = {};
  if (pick.hpOf && stats.hp != null) of.hp = pick.hpOf;
  if (pick.dmgOf && stats.damage != null) { of.damage = pick.dmgOf; if (stats.dps != null) of.dps = pick.dmgOf; }
  // Gebäude/Busch, die Einheiten erzeugen: Tempo, Angriffstempo, Reichweite und Anzahl gehören zur erzeugten Einheit
  if (SPAWNERS.has(card.id) && pick.dmgOf) for (const k of ["hitSpeed", "speed", "range", "count"]) if (stats[k] != null) of[k] = pick.dmgOf;
  if (hits > 1 && stats.damage != null) of.damage = U(`pro Treffer, ×${hits} je Angriff`, `per hit, ×${hits} per attack`);
  if (isSpell && stats.damage != null) of.damage = v.dmg_hits > 1 ? U(`${SPELL_NOTE[0]}, pro Welle (×${v.dmg_hits})`, `${SPELL_NOTE[1]}, per wave (×${v.dmg_hits})`) : SPELL_NOTE;
  const out = { ...stats };
  if (Object.keys(of).length) out.of = of;
  const changed = lastChange(w);
  if (changed) out.changed = changed;
  return out;
}

(async () => {
  const result = {};
  const missing = [];
  for (const card of ALL_CARDS) {
    const title = TITLE[card.id] || card.name;
    try {
      const stats = shape(card, await wikitext(title));
      if (Object.keys(stats).length) result[card.id] = stats;
      else missing.push(`${card.id} (keine Werte)`);
    } catch (e) {
      missing.push(`${card.id} (${e.message})`);
    }
    await sleep(250); // freundlich zum Wiki
  }
  fs.writeFileSync(OUT, `${JSON.stringify({ source: "clashroyale.fandom.com (Level 11)", fetchedAt: new Date().toISOString().slice(0, 10), cards: result }, null, 1)}\n`);
  console.log(`${Object.keys(result).length}/${ALL_CARDS.length} Karten geschrieben → ${path.relative(process.cwd(), OUT)}`);
  if (missing.length) console.log("Fehlend:", missing.join(", "));
})();
