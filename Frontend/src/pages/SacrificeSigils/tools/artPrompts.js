#!/usr/bin/env node
// tools/artPrompts.js — erzeugt art-prompts.md mit einem Bildprompt pro Karte (Motiv, Stamm, Stimmung, einheitlicher Stil).
//   npm run art:prompts
// Die fertigen Bilder als public/assets/cards/<id>.webp (oder .png) ablegen — der Renderer nimmt sie dann automatisch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CARDS } from "../data/cards/index.js";
import { de } from "../i18n/de.js";
import { parseSigil } from "../engine/sigils/index.js";
import { speciesOf } from "../art/procedural.js";

const SPECIES_EN = {
  boar: "wild boar", bear: "bear", lynx: "lynx", hyena: "hyena", pup: "wolf pup", owl: "owl", heron: "heron", vulture: "vulture",
  crow: "crow", swift: "swift", finch: "small finch", beetle: "beetle", wasp: "wasp", ant: "ant", larva: "larva", eel: "eel",
  squid: "squid", crab: "crab", jelly: "jellyfish", fish: "fish", eggs: "frog spawn", toad: "toad", lizard: "salamander",
  snake: "snake", mole: "mole", dormouse: "dormouse", caterpillar: "caterpillar", bat: "bat", stump: "gnarled tree stump",
  pod: "seed pod", pile: "pile of bones", skull: "cloaked figure wearing a chain of skulls", dog: "skeletal hound", ram: "ram",
  elk: "elk", fawn: "fawn", deer: "stag", scarecrow: "scarecrow", bell: "chapel bell", mirror: "cracked mirror", doll: "rag doll",
  automaton: "brass automaton", golem: "golem", blob: "ink blot creature",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "art-prompts.md");

const STYLE = "charcoal and ink sketch on aged parchment, loose trembling linework, cross-hatched shadows, paper grain, "
  + "dark vignette, muted sepia palette, only the eyes glow in a single accent colour, eerie but quiet, no text, no border, 4:3 composition";

const SILHOUETTE_EN = {
  quadruped: "four-legged beast", bird: "night bird", fish: "creature of the deep water", insect: "insect", serpent: "reptile or amphibian",
  rodent: "small rodent", fungus: "mushroom creature", root: "gnarled root or thorn being", skeleton: "skeletal creature", candle: "living candle or wax spirit",
  horned: "horned animal", moth: "moth or bat", construct: "strange construct or curiosity",
};

const MOOD = {
  bestien: "feral, smouldering, ash in the fur", nachtvoegel: "silent, watchful, moonlit", aasfresser: "patient, hungry, carrion field",
  schwaerme: "buzzing, many small bodies", tiefe: "drowned, murky water, slow", kriecher: "venomous, slick, coiled",
  nager: "furtive, burrowing, nervous", myzel: "damp, rotting, spores drifting", wurzelvolk: "ancient, thorny, mossy",
  gebeine: "hollow, rattling, grave dust", kerzenwesen: "flickering, melting wax, fleeting", gehoernte: "proud, heavy, antlers against fog",
  flatterer: "fluttering, dusty wings, candle-drawn", stammlose: "uncanny, handmade, out of place",
};

const lines = [
  "# Sacrifice & Sigils – Bildprompts",
  "",
  "Ein Prompt pro Karte. Einheitlicher Stil-Suffix am Ende jedes Prompts. Fertige Bilder als `public/assets/cards/<id>.webp` ablegen (Seitenverhältnis 100:76).",
  "",
  `**Stil:** ${STYLE}`,
  "",
];
let tribe = "";
for (const c of ALL_CARDS) {
  if (c.tribe !== tribe) {
    tribe = c.tribe;
    lines.push(`## ${de.tribes[tribe].name}`, "");
  }
  const sig = c.sigils.map((s) => de.sigils[parseSigil(s).id]?.name).filter(Boolean);
  const rarity = { common: "", uncommon: "", rare: ", ornate details and faint glyphs", legendary: ", ornate details, faint golden glow around it" }[c.rarity];
  const cursed = c.cursed ? ", black ink veins cracking across the image" : "";
  const species = SPECIES_EN[speciesOf(c)];
  const motif = `${c.name} – a ${species || SILHOUETTE_EN[c.art.silhouette]}, ${MOOD[c.tribe]}${rarity}${cursed}`;
  lines.push(`### ${c.name} (\`${c.id}\`)`);
  lines.push(`> „${c.flavor}“${sig.length ? ` · Sigils: ${sig.join(", ")}` : ""}`);
  lines.push("");
  lines.push("```");
  lines.push(`${motif}. Inspired by the line: "${c.flavor}". ${STYLE}`);
  lines.push("```");
  lines.push("");
}
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`${ALL_CARDS.length} Prompts nach ${path.relative(process.cwd(), out)} geschrieben.`);
