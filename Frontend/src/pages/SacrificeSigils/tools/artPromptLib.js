// tools/artPromptLib.js — ein Bildprompt pro Karte (Motiv, Stamm, Stimmung, einheitlicher Stil).
// Gemeinsame Quelle für art-prompts.md (artPrompts.js) und die KI-Bilderzeugung (artGenerate.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { de } from "../i18n/de.js";
import { parseSigil } from "../engine/sigils/index.js";
import { speciesOf } from "../art/procedural.js";
import { ALL_CARDS } from "../data/cards/index.js";
import { TRIBE_BY_ID } from "../data/tribes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND = path.resolve(here, "..", "..", "..", "..");
/** Zielordner der Kartenbilder (CardArt.jsx lädt /media/cards/<id>.webp bzw. .png). */
export const CARD_ART_DIR = path.join(FRONTEND, "public", "media", "cards");

/** Zirkel einer Karte (aus ihrem Stamm). @param {any} c */
export function zirkelOf(c) {
  return TRIBE_BY_ID[c.tribe]?.zirkel || "moor";
}

/** Ist für die Karte schon ein Bild abgelegt? @param {string} id @param {string} [dir] */
export function hasArt(id, dir = CARD_ART_DIR) {
  return fs.existsSync(path.join(dir, `${id}.webp`)) || fs.existsSync(path.join(dir, `${id}.png`));
}

/**
 * Gemeinsame Kartenauswahl der Bild-Skripte: --only a,b · --tribe x · --zirkel moor|gezeiten · --limit n · --force ·
 * --out <ordner> (Zielordner statt public/media/cards, z. B. für Testläufe).
 * Liest die bekannten Schalter aus `argv` und gibt die übrigen zurück.
 * @param {string[]} argv
 */
export function selectCards(argv) {
  const sel = { only: /** @type {Set<string>|null} */ (null), tribe: null, zirkel: null, limit: Infinity, force: false, out: CARD_ART_DIR };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      return v;
    };
    if (a === "--only") sel.only = new Set(val().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--tribe") sel.tribe = val();
    else if (a === "--zirkel") sel.zirkel = val();
    else if (a === "--limit") sel.limit = Math.max(1, Number(val()) || 1);
    else if (a === "--force") sel.force = true;
    else if (a === "--out") sel.out = path.resolve(val());
    else rest.push(a);
  }
  const cards = ALL_CARDS.filter((c) => (!sel.only || sel.only.has(c.id)) && (!sel.tribe || c.tribe === sel.tribe) && (!sel.zirkel || zirkelOf(c) === sel.zirkel));
  if (sel.only) for (const id of sel.only) if (!cards.some((c) => c.id === id)) console.warn(`Unbekannte Karten-ID: ${id}`);
  const todo = cards.filter((c) => sel.force || !hasArt(c.id, sel.out)).slice(0, sel.limit);
  console.log(`${cards.length} Karten passen, ${todo.length} werden erzeugt (Rest hat schon ein Bild oder liegt über --limit).`);
  return { todo, rest, out: sel.out };
}

/** sharp ist optional (kein Projekt-Paket): damit werden Bilder verkleinert und als WebP gespeichert. */
export async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

const SPECIES_EN = {
  boar: "wild boar", bear: "bear", lynx: "lynx", hyena: "hyena", pup: "wolf pup", owl: "owl", heron: "heron", vulture: "vulture",
  crow: "crow", swift: "swift", finch: "small finch", beetle: "beetle", wasp: "wasp", ant: "ant", larva: "larva", eel: "eel",
  squid: "squid", crab: "crab", jelly: "jellyfish", fish: "fish", eggs: "frog spawn", toad: "toad", lizard: "salamander",
  snake: "snake", mole: "mole", dormouse: "dormouse", caterpillar: "caterpillar", bat: "bat", stump: "gnarled tree stump",
  pod: "seed pod", pile: "pile of bones", skull: "cloaked figure wearing a chain of skulls", dog: "skeletal hound", ram: "ram",
  elk: "elk", fawn: "fawn", deer: "stag", scarecrow: "scarecrow", bell: "old bronze bell", mirror: "cracked mirror", doll: "rag doll",
  automaton: "brass automaton", golem: "golem", blob: "ink blot creature",
  // Gezeiten
  anemone: "sea anemone", barnacle: "cluster of barnacles", bivalve: "mussel", branch: "branching coral", seal: "seal",
  snail: "sea snail", sponge: "sea sponge", walrus: "walrus", standing: "drowned figure standing in the surf",
};

const SILHOUETTE_EN = {
  quadruped: "four-legged beast", bird: "night bird", fish: "creature of the deep water", insect: "insect", serpent: "reptile or amphibian",
  rodent: "small rodent", fungus: "mushroom creature", root: "gnarled root or thorn being", skeleton: "skeletal creature", candle: "living candle or wax spirit",
  horned: "horned animal", moth: "moth or bat", construct: "strange construct or curiosity",
  shell: "shelled sea creature", seal: "seal", coral: "living coral",
};

const MOOD = {
  bestien: "feral, smouldering, ash in the fur", nachtvoegel: "silent, watchful, moonlit", aasfresser: "patient, hungry, carrion field",
  schwaerme: "buzzing, many small bodies", tiefe: "drowned, murky water, slow", kriecher: "venomous, slick, coiled",
  nager: "furtive, burrowing, nervous", myzel: "damp, rotting, spores drifting", wurzelvolk: "ancient, thorny, mossy",
  gebeine: "hollow, rattling, grave dust", kerzenwesen: "flickering, melting wax, fleeting", gehoernte: "proud, heavy, antlers against fog",
  flatterer: "fluttering, dusty wings, candle-drawn", stammlose: "uncanny, handmade, out of place",
  // Gezeiten
  muschelvolk: "closed, patient, salt crust on the shell", ertrunkene: "pale, waterlogged, seaweed in the ribs",
  tangwesen: "swaying kelp, dripping, tangled", moewen: "screeching, greedy, grey coastal wind",
  waerter: "lighthouse keeper's lantern, salt-stained brass", scherenvolk: "armoured, snapping claws, wet sand",
  quallen: "translucent, drifting, faint stinging threads", robben: "heavy, sleek, resting on cold rocks",
  raubfische: "sharp teeth, fast, dark water", tiefseeleuchter: "abyssal dark, a single lure of light",
  schnecken: "slow, spiral shell, slime trail", korallen: "branching, brittle, reef in low water",
  wracks: "rotten planks, barnacles, sunken ship", treibgut: "washed ashore, flotsam, tangled rope",
};

// Stil: Flux ist stark auf Fotorealismus trainiert und gewichtet den Anfang des Prompts am meisten. Deshalb beginnt
// jeder Prompt mit dem Zeichenmedium (promptFor) und dieser Teil beschreibt Strich und Papier – keine Foto-Begriffe
// wie Vignette, Beleuchtung oder Bildformat. Keine Verneinungen („no text“): Flux versteht „no“ schlecht und holt das
// Genannte eher ins Bild – stattdessen positiv beschreiben, dass Ecken und Ränder leeres Papier sind.
// Einzelnes loses Blatt statt „sketchbook“: sonst malt Flux eine Doppelseite mit Falz quer durchs Motiv.
// Stil „C“ (30.09.2026 vom Nutzer gewählt, gerendert mit Flux dev fp8 + Pencil-Sketch-LoRA auf 0.5): grobe Tusche statt
// weicher Graphitschattierung – „smudged graphite“ und „soft light“ hatten die Bilder fotorealistisch gemacht.
// Die Signatur unten rechts malt Flux trotzdem (auch ohne LoRA): dagegen hilft nur `--crop-bottom`.
export const STYLE = "Bold, uneven black outlines, simplified and slightly exaggerated shapes, only a few rough hatching strokes "
  + "for the shadows, large areas of untouched yellowed paper. Stylized folk-horror illustration, eerie and unsettling, "
  + "the eyes glow a faint amber. The corners of the page are plain, empty paper.";

/**
 * Negativ-Prompt für Modelle, die einen nutzen (SDXL u. ä. mit cfg > 1). Flux dev läuft mit cfg 1.0 und rechnet ihn
 * gar nicht ein – dort bleibt der negative Text-Node leer (er ist nur nötig, weil der KSampler den Eingang verlangt).
 */
export const NEGATIVE = "text, letters, watermark, signature, border, frame, card frame, colorful, saturated colors, photo, 3d render, "
  + "smooth digital painting, anime, cartoon, blurry, deformed, extra limbs";

/** Namen der Sigils einer Karte (für die Beschreibung). @param {any} c */
export function sigilNames(c) {
  return c.sigils.map((/** @type {string} */ s) => de.sigils[parseSigil(s).id]?.name).filter(Boolean);
}

/** Vollständiger Bildprompt einer Karte. @param {any} c */
export function promptFor(c) {
  const rarity = { common: "", uncommon: "", rare: ", ornate details and faint glyphs", legendary: ", ornate details, faint golden glow around it" }[c.rarity] || "";
  const cursed = c.cursed ? ", black ink veins cracking across the image" : "";
  const species = SPECIES_EN[speciesOf(c)];
  const mood = MOOD[c.tribe] ? `, ${MOOD[c.tribe]}` : "";
  // Kein Kartenname und kein Zitat in Anführungszeichen: Bildmodelle (v. a. Flux) schreiben solchen Text sonst ins Bild
  const subject = species || SILHOUETTE_EN[c.art.silhouette] || "strange creature";
  const article = /^[aeiou]/i.test(subject) ? "an" : "a";
  const motif = `A crude, expressive ink drawing of ${article} ${subject}${mood}${rarity}${cursed}, `
    + "drawn fast with a scratchy dip pen and a dry brush on a single loose sheet of old yellowed paper";
  return `${motif}. Mood of the scene: ${c.flavor.replace(/["„“”]/g, "").replace(/[.!?…\s]+$/, "")}. ${STYLE}`;
}
