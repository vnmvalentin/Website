// Virtual Farm — Bildvorlagen für ComfyUI (Flux-dev + LoRA game_asst 0.7). Genutzt von tools/farmArt.js.
//
// Ein Prompt = ART-Vorlage (was für ein Bild) + MOTIV (was darauf ist) + STIL (wie es aussieht).
// STIL ist für alle Bilder gleich und wird nie pro Motiv angepasst — nur so bleibt der Look
// einheitlich. Flux kennt keinen Negativ-Prompt: beschreiben, was man will, statt „no …".
//
// Bildarten und wohin sie im Spiel gehören (engine/PlantSystem.js getPlantVisuals):
//   pflanze  — Einmal-Ernte: ganze Pflanze MIT Ernte dran        → plants/<id>/plant.png
//   struktur — Dauerträger-Gerüst OHNE Früchte, je Wuchsform     → structure/<datei>.png
//   frucht   — eine einzelne Frucht; das Spiel setzt sie einzeln
//              in die Krone/Ranke des Gerüsts                    → plants/<id>/fruit.png
//   tier, stand — Tiere und Gebäude (Stände dürfen eigenen Boden haben)

import { STILE } from "./artStilprobe.js";

/** Auslösewort der LoRA game_asst.safetensors (gokaygokay/Flux-Game-Assets-LoRA-v2). */
export const LORA_WORT = "wbgmsst";

export const STIL =
  "polished cartoon style with crisp sharp details, saturated colors with soft shading, " +
  "warm light from the top left, seen slightly from above, isolated on a plain white background";

/** Je Bildart: Satz rund um das Motiv. Pflanzen und Tiere schweben frei — den Boden malt das Spiel. */
export const ARTEN = {
  pflanze: "game asset for a cozy farming game, {MOTIV}, a fully grown plant ready to harvest, the whole plant floating freely with nothing beneath it",
  struktur: "game asset for a cozy farming game, {MOTIV}, with only green leaves, branches and stems and nothing growing on it, the whole plant floating freely with nothing beneath it",
  frucht: "game icon for a cozy farming game, a single {MOTIV}, exactly one piece, centered, filling most of the image",
  tier: "game asset for a cozy farming game, {MOTIV}, full body, natural proportions, floating freely with nothing beneath it",
  stand: "game asset for a cozy farming game, {MOTIV}, a complete small building",
  figur: "game character for a cozy farming game, a cute chibi cat character with a big round head, pointy ears, big friendly eyes and a short body, standing upright on two legs facing the viewer, its long tail curling out to one side, {MOTIV}, full body, floating freely with nothing beneath it",
  gegenstand: "game item for a cozy farming game, {MOTIV}, centered, filling most of the image",
  symbol: "game UI icon for a cozy farming game, {MOTIV}, one centered subject with a bold clear silhouette that stays readable at a tiny size, filling most of the image",
  deko: "game asset for a cozy farming game, garden decoration: {MOTIV}, the whole object floating freely with nothing beneath it",
  samen: "game icon for a cozy farming game, a single plump kidney bean seed standing upright, a curved kidney bean outline with an inward dent on its right side holding a small pale oval seed scar, the bean skin is colored and patterned like {MOTIV}, centered, filling most of the image",
  boden: "seamless tileable ground texture for a cozy top-down farming game, {MOTIV}, seen straight from above, the pattern evenly filling the whole image edge to edge",
};

/** Bodenbeläge: flach von oben, gleichmäßiges Licht (eine Lichtrichtung würde beim Kacheln streifen). */
export const STIL_BODEN = "polished cartoon style with crisp sharp details, natural muted colors with soft shading, flat even lighting, the same density and brightness everywhere";

/** Bildarten ohne Freistellen — die füllen ihr Bild randlos (farmArt.js lässt die Hintergrund-Entfernung weg). */
export const OHNE_FREISTELLEN = new Set(["boden"]);

/**
 * Motive. `breite`/`hoehe` optional (Standard 1024×1024, Vielfache von 64).
 * `ziel` = Pfad unter public/garden-assets, wohin das ausgewählte Bild später kommt.
 * @type {{id: string, art: keyof typeof ARTEN, motiv: string, ziel?: string, breite?: number, hoehe?: number}[]}
 */
const SCHLICHT = new Set(["boden_gras", "boden_pfad", "boden_kies"]);

export const MOTIVE = [
  // ── Kreuzungen (haben noch gar keine Bilder) ──
  { id: "tomoffel", art: "pflanze", ziel: "plants/tomoffel/plant.png", motiv: "fantasy crossbreed of tomato and potato: a leafy green tomato bush with thin stems and many small round red tomatoes, and below its short stem a cluster of golden brown potatoes attached to its roots" },
  { id: "knoblauchzwiebel", art: "pflanze", ziel: "plants/knoblauchzwiebel/plant.png", motiv: "fantasy crossbreed of garlic and onion: a plump purple and white bulb shaped like an onion but divided into garlic cloves, with long green hollow leaves on top and a few roots below" },
  { id: "kuerbini", art: "pflanze", ziel: "plants/kuerbini/plant.png", motiv: "fantasy crossbreed of zucchini and pumpkin: a long zucchini-shaped vegetable with orange pumpkin ribs and dark green stripes, lying under broad zucchini leaves with one yellow blossom" },
  { id: "zitrange", art: "pflanze", ziel: "plants/zitrange/plant.png", motiv: "fantasy crossbreed of lemon and orange: a small young citrus tree with glossy dark green leaves carrying round fruits whose skin blends from lemon yellow into orange" },
  { id: "aprikosenpflaume", art: "pflanze", ziel: "plants/aprikosenpflaume/plant.png", motiv: "fantasy crossbreed of apricot and plum: a small young fruit tree with a thin brown trunk and a round green leafy crown, carrying many round fruits whose skin blends from apricot orange into deep plum purple" },
  { id: "sternendrache", art: "pflanze", ziel: "plants/sternendrache/plant.png", motiv: "fantasy crossbreed of dragon fruit and star fruit: a tall green segmented column cactus carrying star-shaped five-ridged fruits with bright pink dragon fruit skin and green scale tips" },
  { id: "erdhimbeere", art: "frucht", ziel: "plants/erdhimbeere/fruit.png", motiv: "fantasy berry that is half strawberry and half raspberry: a heart-shaped berry covered entirely in small round bumpy pinkish-red raspberry beads instead of seeds, with a green strawberry leaf crown on top" },
  { id: "mangave", art: "frucht", ziel: "plants/mangave/fruit.png", motiv: "fruit that is a crossbreed of mango and guava: an oval mango shape with green skin blushing into pink and a slightly bumpy guava texture" },

  // ── Dauerträger-Beispiel: Gerüst + einzelne Frucht ──
  // Hochformat: auf dem Acker ist ein Baum 0.92 Kacheln breit und 1.65 hoch — breite Kronen ragen ins Nachbarfeld.
  { id: "baum", art: "struktur", ziel: "structure/tree.png", breite: 768, hoehe: 1024, motiv: "a young deciduous fruit tree, a little taller than wide, with a short straight brown trunk and a wide rounded lush green crown that fills the upper two thirds of the tree" },
  { id: "apfel", art: "frucht", ziel: "plants/apfel/fruit.png", motiv: "shiny red apple with a short brown stem and one small green leaf" },

  // ── Gerüste je Wuchsform (engine/PlantSystem.js ARCHETYPE_STRUCTURE_IMAGE) ──
  // USE_PROCEDURAL_SUPPORTS ist aus: Spalier/Stab müssen IM Bild sein.
  { id: "palme", art: "struktur", ziel: "structure/palm.png", breite: 768, hoehe: 1024, motiv: "a slender young palm tree with a gently curved ringed trunk and a crown of large arching green fronds" },
  { id: "ranke", art: "struktur", ziel: "structure/vines.png", breite: 768, hoehe: 1024, motiv: "a climbing vine plant growing up a simple wooden trellis frame, with broad green leaves and curly tendrils" },
  { id: "rute", art: "struktur", ziel: "structure/canebush.png", breite: 768, hoehe: 1024, motiv: "a cane bush made of several thin upright woody canes with serrated green leaves, tied to a short wooden stake" },
  { id: "strauch", art: "struktur", ziel: "structure/bush.png", motiv: "a round compact leafy green shrub with small oval leaves" },
  { id: "bodenranke", art: "struktur", ziel: "structure/groundvines.png", breite: 1024, hoehe: 768, motiv: "a low sprawling ground vine with large round leaves and curly runners spreading wide and flat" },
  { id: "blattstaude", art: "struktur", ziel: "structure/reddish.png", motiv: "a rhubarb plant with huge wrinkled green leaves on thick red stalks" },

  // ── Früchte der Dauerträger (je eine; das Spiel setzt sie einzeln aufs Gerüst) ──
  ...[
    ["erbsen", "open green pea pod showing a row of round green peas"],
    ["bohne", "slender green bean pod"],
    ["rhabarber", "single long straight rhubarb stalk like a thick pink-red celery stick with fine lengthwise ridges and a small ruffled green leaf at its top end, lying diagonally"],
    ["gurke", "green cucumber with small bumps"],
    ["zucchini", "dark green zucchini with a short stem"],
    ["tomate", "ripe red tomato with a green star-shaped calyx"],
    ["chili", "curved red chili pepper with a green stem"],
    ["cranberry", "small cluster of three deep red cranberries"],
    ["stachelbeere", "translucent green striped gooseberry"],
    ["blaubeere", "small cluster of three dusty blue blueberries"],
    ["himbeere", "ripe red raspberry"],
    ["erdbeere", "ripe red strawberry with a green leaf crown"],
    ["kirsche", "pair of glossy red cherries on one stem"],
    ["limette", "green lime"],
    ["birne", "yellow-green pear with a brown stem and a small leaf"],
    ["traube", "bunch of purple grapes with a small vine leaf"],
    ["orange", "orange fruit with a small green leaf"],
    ["kiwi", "fuzzy brown kiwi fruit"],
    ["pflaume", "dark purple plum with a soft bloom"],
    ["mango", "ripe mango blushing from green to red and orange"],
    ["olive", "small sprig with three green olives"],
    ["banane", "bunch of three yellow bananas"],
    ["acai", "small cluster of dark purple acai berries"],
    ["passionsfrucht", "round purple passion fruit"],
    ["sternfrucht", "yellow star fruit with five ridges"],
    ["dattel", "cluster of three glossy brown dates"],
    ["kokosnuss", "brown hairy coconut"],
  ].map(([id, motiv]) => ({ id, art: "frucht", ziel: `plants/${id}/fruit.png`, motiv })),

  // ── Einmal-Ernten (plant.png = Acker UND Erntestück im Rucksack) ──
  // Wurzelgemüse zeigt die Ernte sichtbar (herausgezogen), Bäume als kleines Bäumchen voller Früchte.
  ...[
    ["loewenzahn", "dandelion plant with a rosette of jagged green leaves, two bright yellow flowers and one white fluffy seed head"],
    ["minze", "bushy mint herb with many bright green oval serrated leaves on upright stems"],
    ["brennnesseln", "stinging nettle plant with upright stems and pointed serrated dark green leaves covered in fine hairs"],
    ["spinat", "spinach plant with a rosette of glossy dark green rounded leaves"],
    ["salat", "fresh round head of green butterhead lettuce with soft ruffled leaves"],
    ["radieschen", "two red radishes pulled out of the earth, round red roots with white tips and fresh green leaves"],
    ["kohl", "big round green cabbage head with wide wavy outer leaves"],
    ["zwiebel", "golden brown onion bulb pulled out of the earth with long green hollow leaves and a few roots"],
    ["karotte", "two orange carrots pulled out of the earth with feathery green tops"],
    ["knoblauch", "white garlic bulb with purple streaks pulled out of the earth, long flat green leaves and roots"],
    ["kartoffel", "potato plant pulled out of the earth with green leaves and a cluster of golden brown potatoes hanging from its roots"],
    ["ingwer", "knobbly beige ginger root pulled out of the earth with tall slender green leafy shoots"],
    ["paprika", "compact pepper plant with green leaves carrying three glossy bell peppers in red, yellow and green"],
    ["aubergine", "eggplant plant with large soft green leaves carrying two glossy deep purple eggplants"],
    ["mais", "tall corn stalk with long green leaves and two ripe yellow corn cobs peeking out of their husks"],
    ["kuebi", "big round orange pumpkin with a curly vine, a few broad green leaves and one yellow blossom"],
    ["grapefruit", "small young citrus tree with glossy green leaves carrying large round pinkish-yellow grapefruits"],
    ["zitrone", "small young lemon tree with glossy green leaves carrying bright yellow lemons"],
    ["aprikose", "small young apricot tree with a thin trunk and green leaves carrying soft orange apricots"],
    ["honigmelone", "pale yellow honeydew melon lying among broad green melon leaves with a curly vine"],
    ["holunder", "elderberry bush with green leaves carrying hanging umbrella-shaped clusters of tiny dark purple berries"],
    ["guave", "small young guava tree with oval green leaves carrying round light green guavas"],
    ["pfirsich", "small young peach tree with long narrow leaves carrying fuzzy peaches blushing from yellow to red"],
    ["avocado", "small young avocado tree with large glossy leaves carrying dark green pear-shaped avocados"],
    ["ananas", "pineapple plant with a rosette of long spiky green leaves and a golden pineapple growing in the center, the leaves meeting at the bottom in a short stem with a few thin roots"],
    ["bambus", "cluster of three tall green bamboo stalks with segmented joints and narrow leaves at the top"],
    ["kakao", "small young cacao tree with large leaves and big ribbed orange-brown cacao pods growing directly on its trunk"],
    ["drachenfrucht", "dragon fruit cactus: a few long green three-edged cactus stems arching out from one short base with thin roots, carrying bright pink dragon fruits with green scale tips"],
    ["mondblume", "magical moonflower plant with a slender stem, silver-blue leaves and one large glowing pale blue blossom shaped like a crescent moon, with tiny sparkles"],
  ].map(([id, motiv]) => ({ id, art: "pflanze", ziel: `plants/${id}/plant.png`, motiv })),

  // ── Samentüte: EINE leere Tüte, das Skript setzt je Sorte Frucht/Pflanze darauf (--tueten) ──
  { id: "samentuete", art: "gegenstand", breite: 768, hoehe: 1024, motiv: "an empty paper seed packet seen from the front, with a folded and crimped top edge, plain warm cream paper with a thin green border and a large blank empty area in the middle" },

  // ── Stände ──
  { id: "haendlerstand", art: "stand", breite: 1216, hoehe: 832, motiv: "a wooden market stall with a green and cream striped canvas awning, crates full of vegetables, a hanging scale and a chalk price board" },
  { id: "erntefeststand", art: "stand", breite: 1216, hoehe: 832, motiv: "an autumn harvest festival booth with a warm orange and red striped awning, pumpkins and corn sheaves, hanging paper lanterns, a wreath of colorful leaves and a wooden prize board" },

  // ── Tiere ──
  // Alle in Seitenansicht nach rechts (das Spiel spiegelt für links). Ziel = Vorschaubild;
  // das Übernahme-Skript legt zusätzlich <tier>/1.png und 2.png (Laufbilder) an.
  { id: "ziege", art: "tier", ziel: "animals/ziege.png", motiv: "a goat standing on four legs, side view facing right, beige fur, curved horns, small beard" },
  ...[
    ["huhn", "a plump brown hen standing, side view facing right, red comb and wattles, yellow legs", 1024, 1024],
    ["ente", "a mallard duck standing on its orange feet, side view facing right, green head, white neck ring, brown chest, grey body", 1024, 1024],
    ["schwein", "a chubby pink pig standing on four legs, side view facing right, curly tail, round snout", 1216, 832],
    ["katze", "a calico cat walking on four legs, side view facing right, white fur with orange and black patches, tail raised", 1216, 832],
    ["waschbaer", "a raccoon standing on four legs, side view facing right, grey fur, black eye mask, ringed bushy tail", 1216, 832],
    ["kuh", "a black and white spotted dairy cow standing on four legs, side view facing right, small horns, pink udder, brass bell on a collar", 1216, 832],
    ["schaf", "a fluffy white sheep standing on four legs, side view facing right, thick woolly fleece, cream face and dark legs", 1216, 832],
    ["pferd", "a chestnut brown horse standing on four legs, side view facing right, dark brown mane and tail", 1216, 832],
    ["esel", "a grey donkey standing on four legs, side view facing right, long ears, light muzzle, short dark mane", 1216, 832],
    ["hund", "a golden retriever dog standing on four legs, side view facing right, fluffy golden fur, friendly face", 1216, 832],
    ["einhorn", "a white unicorn standing on four legs, side view facing right, long pastel pink and lilac mane and tail, golden spiral horn", 1216, 832],
    ["tiger", "a tiger standing on four legs, side view facing right, orange fur with black stripes, white belly", 1216, 832],
    ["phoenix", "a phoenix bird standing on its legs, side view facing right, fiery red orange and gold feathers, long flowing tail feathers like flames, wings folded", 1024, 1024],
    ["drache", "a small friendly green dragon standing on four legs, side view facing right, cream belly scales, folded leathery wings, short horns", 1216, 832],
    ["goetterwesen", "a divine winged white horse standing on four legs, side view facing right, large feathered wings with gold tips, golden halo floating above its head, flowing golden mane", 1216, 832],
  ].map(([id, motiv, breite, hoehe]) => ({ id, art: "tier", ziel: `animals/${id}.png`, motiv, breite, hoehe })),

  // ── Deko (Dateinamen wie bisher, damit Katalog und Spielstände unverändert bleiben) ──
  // Größe nach Fußabdruck: 1×2 hoch (832×1216), 2×1 breit (1216×832), sonst quadratisch.
  ...[
    ["licht_kugel", "lighting/light2.png", "a round glowing white glass globe garden lamp sitting on a small dark metal stand", 1024, 1024],
    ["deco_lamp", "lighting/lamp_placeholder.png", "a black iron garden lantern with warm glowing yellow light hanging from a curved shepherd hook post", 832, 1216],
    ["licht_sterne", "lighting/light.png", "a slim modern garden light pole with a frosted glass top and a string of tiny star shaped fairy lights wound around it", 832, 1216],
    ["licht_park", "lighting/light3.png", "a classic black cast iron park street lamp with a glass lantern head on a tall slender post", 832, 1216],
    ["plant", "nature/plant.png", "a leafy green potted plant with a few small orange flowers in a terracotta pot on a little wooden stand", 1024, 1024],
    ["flower1", "nature/flower1.png", "a wooden planter box full of red, yellow and blue flowers", 1216, 832],
    ["flower2", "nature/flower2.png", "a rough grey stone trough planter full of purple lavender and small white daisies", 1216, 832],
    ["flower3", "nature/flower3.png", "a rusty corten steel planter full of succulents and tall ornamental grass", 1216, 832],
    ["blumen_wiese", "nature/blumen_wiese.png", "a lush clump of wildflowers with red poppies, blue cornflowers and yellow daisies among green grass", 1024, 1024],
    ["blumen_wiese2", "nature/blumen_wiese2.png", "a lush clump of wildflowers with white chamomile, pink clover and purple bellflowers among green grass", 1024, 1024],
    ["blumen_wiese3", "nature/blumen_wiese3.png", "a lush clump of wildflowers with blue forget-me-nots, yellow buttercups and orange marigolds among green grass", 1024, 1024],
    ["blumen_wiese4", "nature/blumen_wiese4.png", "a lush clump of tall wildflowers with purple foxgloves, white daisies and pink thistles among green grass", 1024, 1024],
    ["hecke", "nature/hecke.png", "a long neatly trimmed rectangular green boxwood hedge, much wider than tall", 1216, 832],
    ["hecke_klein", "nature/hecke_klein.png", "a small fluffy round green garden shrub made of many soft rounded leaf clusters, like a little cloud of leaves, gentle leafy bumps along its outline", 1024, 1024],
    ["cherry_blossom", "nature/cherry_blossom.png", "a small cherry blossom tree with a slender brown trunk and a crown full of pink blossoms", 832, 1216],
    ["tulpenbett", "nature/tulpenbett.png", "a small square wooden raised bed full of colorful red, yellow, pink and purple tulips", 1024, 1024],
    ["deco_bench", "social/bank.png", "a garden bench with green painted wooden slats and black wrought iron legs and armrests", 1216, 832],
    ["stuhl", "social/chair.png", "a french bistro chair with a black metal frame and a woven cream rattan seat and back", 1024, 1024],
    ["liegestuhl", "social/lawnchair.png", "a wooden folding deck chair with red and white striped canvas", 1024, 1024],
    ["sonnenschirm", "social/sonnenschirm.png", "an open beach parasol with blue, white and yellow stripes on a white pole with a round base", 832, 1216],
    ["feuer", "social/feuer.png", "a round copper fire pit bowl on short legs with burning logs and bright flames", 1024, 1024],
    ["grill", "social/grill.png", "a round black kettle barbecue grill on three legs with small wheels", 832, 1216],
    ["tisch", "social/tisch.png", "a small round bistro garden table with a white marble top and a black metal pedestal", 1024, 1024],
    ["pool", "social/pool.png", "a small rectangular swimming pool with turquoise water, a light stone border and a metal ladder, seen from above", 1024, 1024],
    ["zaun", "objects/fence.png", "a straight section of natural brown wooden picket fence seen exactly from the front, two thick end posts and pointed pickets between them on two horizontal rails", 1216, 832],
    ["zaun_klein", "objects/fence_1x1.png", "a straight section of natural wooden picket fence seen exactly from the front, four evenly spaced pointed pickets on two horizontal rails that run straight out to both image edges", 1024, 1024],
    ["heuballen", "objects/heuballen.png", "a rectangular golden hay bale tied with two ropes", 1024, 1024],
    ["gnome1", "objects/gnome1.png", "a garden gnome statue with a red pointed hat and white beard holding a small watering can, standing on a round base", 832, 1216],
    ["gnome2", "objects/gnome2.png", "a garden gnome statue with a red pointed hat and white beard holding a fishing rod, standing on a round base", 832, 1216],
    ["gnome3", "objects/gnome3.png", "a garden gnome statue with a red pointed hat and white beard sitting cross-legged on a mossy round stone", 832, 1216],
    ["vogelscheuche", "objects/vogelscheuche.png", "a friendly scarecrow on a wooden post with a straw hat, blue overalls, patched shirt and outstretched arms, a little bird sitting on the hat", 832, 1216],
    ["deco_statue", "objects/statue_placeholder.png", "a classical grey stone statue of a robed woman on a square stone pedestal", 832, 1216],
    ["teich", "objects/teich.png", "a small round garden pond with a grey stone rim, clear blue water and floating lily pads with a pink water lily", 1216, 832],
    ["brunnen", "objects/brunnen1.png", "a round stone garden fountain basin with a stone bird statue in the middle spouting a small stream of water", 1024, 1024],
    ["deco_fountain", "objects/fountain_placeholder.png", "a large ornate round two-tiered stone fountain with water splashing down into a wide basin", 1216, 832],
    ["deco_arch", "objects/bogen.png", "a rustic wooden garden arch made of thick beams with a curved top beam", 1024, 1024],
  ].map(([id, datei, motiv, breite, hoehe]) => ({ id, art: "deko", ziel: `deco/${datei}`, motiv, breite, hoehe, ...(id === "zaun_klein" && { zaunFeld: true }) })),

  // ── Bodenbeläge: eine Kachel je Bild; nahtlos macht sie erst farmArtUebernehmen.js.
  // Schlichte Beläge nur aus der Bildmitte (ausschnitt), sonst entsteht ein Kachelgitter. ──
  ...[
    ["boden_gras", "gras.jpg", "dense short natural green lawn grass, countless small grass blades packed tightly together with a few tiny clover leaves"],
    ["boden_pfad", "path1.jpg", "packed brown earth of a dirt footpath, densely sprinkled all over with small pebbles and tiny cracks"],
    ["boden_kies", "gravel.jpg", "a ground densely packed with countless small round grey and beige gravel stones lying next to each other"],
    ["boden_ziegel", "brick.jpg", "red clay brick paving laid in a regular running bond pattern with thin light mortar lines"],
    ["boden_kopfstein", "smallstone.jpg", "colorful rounded cobblestones in grey, brown and reddish tones tightly set next to each other"],
    ["boden_diele", "plank.jpg", "natural brown wooden deck planks running horizontally with visible wood grain and small nails"],
    ["boden_moos", "moss.jpg", "irregular grey flagstones with bright green moss growing in the gaps between them"],
    ["boden_stein", "stone.jpg", "large sandy beige square stone slabs in a regular grid with darker joints"],
  ].map(([id, datei, motiv]) => ({ id, art: "boden", ziel: `deco/texture/${datei}`, motiv, ...(SCHLICHT.has(id) && { ausschnitt: 0.5 }) })),

  // ── Gesäte Samen: Bohnenform mit der Haut der Sorte (wie die bisherigen „themed samen“) ──
  ...Object.entries({
    loewenzahn: "a bright yellow dandelion flower with fine petals",
    minze: "fresh green mint leaves with serrated edges",
    brennnesseln: "dark green stinging nettle leaves with tiny hairs",
    spinat: "smooth dark green spinach leaves",
    salat: "crisp light green lettuce leaves",
    radieschen: "a shiny red radish with a white tip",
    kohl: "pale green cabbage leaves with veins",
    zwiebel: "golden brown papery onion skin",
    karotte: "an orange carrot with fine rings and a little green top",
    erbsen: "a bright green pea pod",
    bohne: "a smooth green bean pod",
    knoblauch: "white and purple striped garlic skin",
    kartoffel: "a light brown potato with small eyes",
    ingwer: "knobbly beige ginger root skin",
    paprika: "a glossy red bell pepper with a green stem on top",
    aubergine: "a glossy deep purple eggplant with a green cap on top",
    mais: "rows of golden yellow corn kernels",
    kuebi: "a ribbed orange pumpkin with a short stem on top",
    rhabarber: "pink and green streaked rhubarb stalks",
    gurke: "a dark green cucumber with small bumps",
    zucchini: "a speckled dark green zucchini",
    tomate: "a shiny red tomato with a green star-shaped calyx on top",
    chili: "a glossy bright red chili pepper",
    grapefruit: "pinkish yellow dimpled grapefruit peel",
    zitrone: "bright yellow dimpled lemon peel",
    aprikose: "soft orange apricot skin with a rosy blush",
    honigmelone: "smooth pale yellow honeydew melon rind",
    cranberry: "deep glossy red cranberry skin",
    stachelbeere: "translucent green gooseberry skin with fine stripes",
    blaubeere: "dusty dark blue blueberry skin",
    himbeere: "a red raspberry made of little round drupelets",
    erdbeere: "a red strawberry with tiny yellow seeds and green leaves on top",
    kirsche: "glossy dark red cherry skin with a stem on top",
    limette: "bright green dimpled lime peel",
    holunder: "clusters of tiny dark purple elderberries",
    guave: "light green guava skin",
    pfirsich: "fuzzy peach skin in orange and pink",
    avocado: "bumpy dark green avocado skin",
    apfel: "shiny red apple skin with a small stem and leaf on top",
    birne: "speckled golden green pear skin",
    traube: "a bunch of small purple grapes",
    orange: "bright orange dimpled orange peel",
    kiwi: "fuzzy brown kiwi skin",
    pflaume: "dusty deep purple plum skin",
    mango: "mango skin blending from green to red and orange",
    olive: "glossy dark green olive skin",
    ananas: "golden pineapple skin with a diamond pattern and a small green crown on top",
    bambus: "green bamboo with segmented rings and a little leaf on top",
    kakao: "a ridged orange-brown cacao pod",
    drachenfrucht: "hot pink dragon fruit skin with green scale tips",
    banane: "smooth yellow banana peel with a brown tip",
    acai: "deep purple almost black acai berry skin",
    passionsfrucht: "wrinkled dark purple passion fruit skin",
    sternfrucht: "waxy yellow star fruit skin with ridges",
    dattel: "wrinkled glossy brown date skin",
    kokosnuss: "hairy brown coconut shell",
    mondblume: "pale silvery blue moonlight petals that softly glow",
    knoblauchzwiebel: "purple and white onion skin divided into garlic cloves",
    tomoffel: "half red tomato skin and half brown potato skin",
    kuerbini: "orange pumpkin ribs with dark green zucchini stripes",
    erdhimbeere: "a red berry made of tiny drupelets dotted with small yellow strawberry seeds",
    zitrange: "dimpled citrus peel blending from lemon yellow to orange",
    aprikosenpflaume: "plum purple skin blending into apricot orange",
    mangave: "mango orange skin with blue-green agave leaf stripes",
    sternendrache: "deep magenta dragon fruit skin dotted with tiny glowing golden stars",
  }).map(([sorte, motiv]) => ({ id: `samen_${sorte}`, art: "samen", ziel: `plants/${sorte}/seed.png`, motiv, breite: 832, hoehe: 1216 })),

  // ── Symbole (Knöpfe, Reiter, Fähigkeiten, Wetter) → icons/<gruppe>/<datei>.png ──
  // Die Namensplakette (hud/nameplate) bleibt: sie ist ein Rahmen für Text, kein Symbol.
  ...[
    ["hud/back", "a thick glossy sky blue arrow whose tip points to the left, a simple U-turn arrow curving back toward the left side"],
    ["hud/changelog", "a rolled-open parchment scroll with a few lines of writing and a feather quill"],
    ["hud/chat", "a round sky blue speech bubble with three white dots"],
    ["hud/check", "a thick glossy green check mark"],
    ["hud/chevron", "a thick rounded downward pointing chevron arrow, slate blue"],
    ["hud/close", "a thick glossy red X cross made of two rounded bars"],
    ["hud/editor", "a small wooden clipboard with a paper plan sketch of garden beds and a pencil"],
    ["hud/farm", "a small red barn with a white trimmed roof next to a tiny green field and a silo"],
    ["hud/gold", "a single shiny gold coin with a star embossed in the middle, seen from the front"],
    ["hud/gold_lifetime", "a pink ceramic piggy bank with a gold coin dropping into its slot"],
    ["hud/gold_shop", "a small cozy shop building with a golden roof and a stack of gold bars at its door"],
    ["hud/inventory", "a brown canvas backpack with leather straps and a few vegetables peeking out"],
    ["hud/invite", "a cream envelope with a red heart seal and a small yellow chick holding it"],
    ["hud/kiste", "a wooden treasure chest with iron bands, lid closed"],
    ["hud/level", "a golden trophy cup with two handles and a star on its front"],
    ["hud/locked", "a closed iron padlock with a keyhole"],
    ["hud/logbuch", "a thick brown leather journal lying open with a feather quill"],
    ["hud/mailbox", "a rustic red farm mailbox on a short wooden post with its flag raised and a letter sticking out"],
    ["hud/move_all", "a burlap sack full of harvested vegetables with a curved green arrow sweeping around it"],
    ["hud/move_one", "a single small burlap sack of grain with a curved orange arrow pointing to the right"],
    ["hud/palette", "a wooden painter's palette with colorful paint blobs and a brush"],
    ["hud/party", "a festive bundle of colorful balloons tied together with confetti around it"],
    ["hud/players", "three friendly cartoon farmer heads side by side, one with a straw hat"],
    ["hud/remove", "a red round prohibition sign with a diagonal bar over a small vegetable sack"],
    ["hud/reposition", "a small red barn with four green arrows pointing outwards up, down, left and right"],
    ["hud/revoke", "a grey iron chain wrapped around a small padlock next to an old key"],
    ["hud/ruler", "a wooden ruler lying next to a fresh orange carrot"],
    ["hud/search", "a magnifying glass with a wooden handle enlarging a red tomato"],
    ["hud/sell_area", "a market stall with a green and white striped awning, a scale and vegetable crates"],
    ["hud/send", "a white carrier pigeon flying with a small letter in its beak"],
    ["hud/settings", "an orange metal cogwheel with a small wrench and screwdriver crossed in its middle"],
    ["hud/shed", "a small wooden garden shed with a blue door and a little window"],
    ["hud/shop_area", "a small village shop with a red awning, flower boxes and a hanging sign"],
    ["hud/star", "a plump glossy golden star"],
    ["hud/tools", "a red metal toolbox with a handle and a hammer peeking out"],
    ["hud/trusted", "a blue shield with a golden check mark and a golden wheat ear along its side"],
    ["hud/vitrine", "a glass display dome on a wooden stand with a golden carrot inside"],
    ["hud/wardrobe", "an open wooden wardrobe with colorful clothes and a hat inside"],
    ["hud/world_code", "two overlapping white paper sheets with folded top corners, one slightly offset behind the other, the classic copy symbol"],
    ["pets/empty_slot", "a dark wooden round badge with a faint glowing paw print in the middle"],
    ["pets/erntehelfer", "a little pink pig carrying a woven basket full of vegetables"],
    ["pets/forscher", "a wise brown owl with round glasses holding a small glass flask with a green sprout"],
    ["pets/gaertner", "a cute brown bunny in a green apron holding a small watering can"],
    ["pets/goldfinder", "a pile of glittering gold nuggets with a small pickaxe leaning on it"],
    ["pets/kaufmann", "a grey tabby cat merchant with a monocle standing behind a tiny shop counter with a price tag"],
    ["skills/bergmann", "a pickaxe and a shovel crossed over a small heap of rocks with gold nuggets"],
    ["skills/ertrag", "a woven basket overflowing with fruits, vegetables and golden wheat"],
    ["skills/glueckspilz", "a green four-leaf clover with a small golden horseshoe in front of it"],
    ["skills/gruener_daumen", "a thumbs-up hand with a green thumb and a small sprout growing from it"],
    ["skills/haendler", "two hands shaking in front of a small market stall with an awning"],
    ["skills/lagerist", "a sturdy wooden storage shelf stacked with crates and sacks"],
    ["skills/learn", "a thick glossy golden plus sign"],
    ["skills/regenmacher", "a fluffy blue rain cloud pouring raindrops onto a small patch of brown soil"],
    ["skills/reset", "a round wreath of green vine leaves forming a circular arrow"],
    ["skills/wetterfuehlig", "a rooftop weather vane with a rooster on top and small sun, cloud and snowflake symbols around it"],
    ["skills/zuechter", "a little white sheep and a little brown cow standing together with a small red heart above them"],
    ["special/golden", "a golden laurel wreath with shining golden fruits woven into it"],
    ["special/rainbow", "a bright rainbow arching over a small woven basket of colorful fruits"],
    ["status/charged", "a bright yellow lightning bolt crackling with small blue sparks"],
    ["status/frozen", "a clear light blue ice cube with frosty edges"],
    ["status/moonlit", "a pale silver crescent moon with a soft glow"],
    ["status/wet", "a single big glossy blue water drop"],
    ["tabs/all", "an open wooden crate full of mixed items: a vegetable, a seed packet, a small gnome and a toy bear"],
    ["tabs/deco", "a garden gnome with a red pointed hat and white beard"],
    ["tabs/egg", "a white egg in a small nest of golden straw"],
    ["tabs/pet", "a cute black and white puppy sitting"],
    ["tabs/plant", "a young green plant with broad leaves growing in a terracotta pot"],
    ["tabs/seed", "a brown seed sprouting two fresh green leaves from a small mound of soil"],
    ["tabs/tool", "a small garden spade with a wooden handle and a clump of soil on its blade"],
    ["weather/moonlight", "a slim pale silver crescent moon opening to the right, with three small golden stars beside it"],
    ["weather/rain", "a grey-blue rain cloud with blue raindrops falling below it"],
    ["weather/snow", "a soft white snow cloud with light blue snowflakes falling below it"],
    ["weather/sun", "a bright golden sun with wavy rays"],
    ["weather/thunder", "a dark storm cloud with a yellow lightning bolt striking below it"],
  ].map(([datei, motiv]) => ({ id: `symbol_${datei.replace("/", "_")}`, art: "symbol", ziel: `icons/${datei}.png`, motiv })),

  // ── Eier (Shop, Brutkasten, Rucksack) und Werkzeuge ──
  ...[
    ["eggs/common_egg", "a plain smooth light brown hen egg", 832, 1216],
    ["eggs/uncommon_egg", "a mossy green egg speckled with dark brown spots", 832, 1216],
    ["eggs/rare_egg", "a pale icy blue egg with delicate swirling silver patterns", 832, 1216],
    ["eggs/epic_egg", "a deep purple egg with glowing violet crystal facets set in dark silver bands", 832, 1216],
    ["eggs/legendary_egg", "a radiant pearly white and gold egg wrapped in ornate golden filigree with small gems", 832, 1216],
    ["tools/gieskanne", "a light blue metal watering can with a long spout and a rose nozzle", 1216, 832],
    ["tools/rucksack", "a sturdy olive green canvas backpack with leather straps and side pockets", 832, 1216],
    ["tools/schaufel", "a garden shovel with a wooden handle with a grip and a steel blade, lying diagonally with the blade at the bottom left and the grip at the top right", 1024, 1024],
    ["tools/spitzhacke", "a miner's pickaxe standing upright: a long wooden handle with a long curved iron head across its top that tapers into sharp points on both ends", 832, 1216],
    ["tools/topf", "an empty terracotta flower pot with a painted orange pattern band", 1024, 1024],
  ].map(([datei, motiv, breite, hoehe]) => ({ id: `item_${datei.replace("/", "_")}`, art: "gegenstand", ziel: `${datei}.png`, motiv, breite, hoehe })),

  // Umkleide (ui/wardrobe.js): zwölf Fellfarben derselben Farmer-Katze — gemeinsamer Seed,
  // damit nur Fell und Kleiderfarben wechseln — plus zehn Kostüme der orange getigerten Katze.
  ...[
    ["normal", "orange tabby fur with darker orange stripes", "a red checkered shirt and green denim overalls"],
    ["white", "pure white fur", "a grey checkered shirt and dark grey denim overalls"],
    ["black", "black fur", "a yellow checkered shirt and red denim overalls"],
    ["grey", "silver grey tabby fur with dark grey stripes", "a blue checkered shirt and brown denim overalls"],
    ["brown", "brown tabby fur with dark brown stripes", "a green checkered shirt and mustard yellow denim overalls"],
    ["brownmix", "tortoiseshell fur in patches of black and warm brown", "a green checkered shirt and brown denim overalls"],
    ["mixed", "calico fur with white, orange and black patches", "a pink checkered shirt and light blue denim overalls"],
    ["orange", "bright golden ginger fur with soft stripes", "a green checkered shirt and blue denim overalls"],
    ["pink", "pastel pink fur", "a light green checkered shirt and purple denim overalls"],
    ["blue", "pastel blue fur", "a colorful checkered shirt and orange denim overalls"],
    ["purple", "lilac purple fur", "a yellow checkered shirt and green denim overalls"],
    ["cyan", "turquoise fur", "a red checkered shirt and navy blue denim overalls"],
  ].map(([id, fell, kleidung]) => ({ id: `figur_farmer_${id}`, seedVon: "figur_farmer", art: "figur", ziel: `wardrobe/farmer/${id}.png`, breite: 832, hoehe: 1088, motiv: `with ${fell}, dressed as a farmer in a frayed straw hat, ${kleidung} with a small patch on one knee` })),
  ...[
    ["explorer", "dressed as a jungle explorer in a beige pith helmet and a khaki safari shirt with many pockets, binoculars hanging around its neck, brown boots"],
    ["cowboy", "dressed as a cowboy in a big brown cowboy hat, a red bandana, a brown leather vest over a plaid shirt, jeans and boots, holding a coiled lasso"],
    ["painter", "dressed as a painter in a red beret and a white smock covered in colorful paint splashes, holding a wooden palette and a brush"],
    ["detective", "dressed as a detective in a brown checkered deerstalker cap and a long checkered trench coat, holding a magnifying glass"],
    ["musician", "dressed as a musician in a small black bowler hat, a dark vest over a white shirt, playing a wooden acoustic guitar"],
    ["pirate", "dressed as a pirate in a black tricorn hat with a white skull emblem, an eye patch, a striped shirt, a red sash and a short curved sword"],
    ["knight", "dressed as a knight in shiny silver plate armor and an open helmet with a red plume, holding a small sword and a round shield"],
    ["ninja", "dressed as a ninja in a black ninja suit with a hood and face mask showing only its eyes, a katana on its back"],
    ["wizard", "dressed as a wizard in a tall pointed blue hat and a long blue robe covered in golden stars, holding a wooden staff with a glowing blue crystal"],
    ["astronaut", "dressed as an astronaut in a white space suit with a round glass helmet, colorful buttons on the chest"],
  ].map(([id, motiv]) => ({ id: `figur_${id}`, art: "figur", ziel: `wardrobe/${id}.png`, breite: 832, hoehe: 1088, motiv: `with orange tabby fur, ${motiv}` })),

  // Welt: Läden am Kiesweg (bis 290×235 gezeichnet), Missionsbrett, Schuppen + Gold-Shop-Reskins
  // (ui/reskins.js), Briefkasten + Reskins (40 px breit, hochkant) und die Schrotflinte.
  ...[
    ["seed_shop", "a wooden market cart with two big spoked wheels and a green and cream striped awning, shelves full of small seed packets and seed sacks", 1216, 1024],
    ["tool_shop", "a wooden market cart with two big spoked wheels and a dark red canvas awning, garden tools hanging on its side, shovels, rakes and watering cans on display", 1216, 1024],
    ["egg_shop", "a wooden market cart with two big spoked wheels and a light blue canvas awning, baskets and straw nests full of colorful eggs on display", 1216, 1024],
    ["deco_shop", "a wooden market cart with two big spoked wheels and a teal canvas awning with colorful bunting flags, garden gnomes, small lanterns and potted flowers on display", 1216, 1024],
    ["market", "an open wooden market stall with a shingled roof on four posts, a counter with crates of fresh vegetables and fruit, a brass weighing scale and a small chalk board", 1024, 1024],
    ["pet_market", "an open wooden market stall with a shingled roof on four posts, straw bales, a small wooden animal pen, sacks of animal feed and a hanging bell", 1024, 1024],
    ["quest_board", "a wooden notice board on two posts with a little roof, pinned paper notes with simple drawings and checkboxes", 1216, 1024],
    ["shed", "a small wooden garden shed with a red roof, a blue wooden door and a window with a flower box, a little grass patch around its base", 1024, 1024],
    ["shed_variants/celestial", "a small magical garden shed made of pale lilac crystal and silver, a glowing cyan crystal door, a round window showing a galaxy, a little satellite dish on the roof", 1024, 1024],
    ["shed_variants/forge", "a small blacksmith forge shed of dark wood and stone with copper pipes, a chimney, an anvil and a heap of coal beside it, a warm glowing furnace window", 1024, 1024],
    ["shed_variants/herbs", "a small herbalist shed of dark wood with a hanging sign, bundles of dried herbs hanging from the roof, jars of potions in the window, lavender growing around it", 1024, 1024],
    ["shed_variants/observatory", "a small enchanted observatory shed with a mossy roof, a brass orrery on top, an ornate teal door with leaf patterns and glowing purple crystals around its base", 1024, 1024],
    ["shed_variants/orbital", "a small futuristic space station module shed of white and grey metal panels, a round airlock door, solar panels on the roof and a round window showing planet earth", 1024, 1024],
    ["shed_variants/seedsman", "a small old seed merchant shed of carved warm wood with a hanging shop sign, a wall of little seed drawers and a green gem above the door", 1024, 1024],
    ["shed_variants/void_weaver", "a small mysterious dark shed of black wood with bone white trim, a glowing purple eye above the door, a swirling dark portal window and floating rune stones", 1024, 1024],
    ["mailbox", "a classic red metal mailbox with a rounded top and a little flag, on a tall wooden post", 768, 1344],
    ["mailbox_variants/brick", "a mailbox built from red and grey toy building bricks with a red flag, on a tall grey brick post", 768, 1344],
    ["mailbox_variants/cyber", "a black high tech mailbox with glowing cyan screen and neon lights, on a tall black metal lattice post", 768, 1344],
    ["mailbox_variants/dark", "a glossy black mailbox with golden trim and a red flag, on a tall dark wooden post", 768, 1344],
    ["mailbox_variants/future", "a sleek silver futuristic mailbox with a glowing blue slot, on a tall metal truss post", 768, 1344],
    ["mailbox_variants/magepunk", "a brass and copper steampunk mailbox with gears and a glowing purple rune, a small dragon ornament on top, on a twisted brass post", 768, 1344],
    ["mailbox_variants/nature", "a mossy wooden birdhouse style mailbox with leaves and an autumn leaf flag, on a tall thin tree trunk post", 768, 1344],
    ["mailbox_variants/rusty", "an old rusty dented grey metal mailbox with a tattered flag, on a weathered wooden post set in a small stone", 768, 1344],
  ].map(([datei, motiv, breite, hoehe]) => ({ id: `welt_${datei.replace("/", "_")}`, art: /^(mailbox|quest_board)/.test(datei) ? "deko" : "stand", ziel: `world/${datei}.png`, motiv, breite, hoehe })),
  { id: "welt_shotgun", art: "gegenstand", ziel: "world/shotgun-removebg-preview.png", breite: 1344, hoehe: 768, motiv: "a short cartoon pump action shotgun with a wooden stock and grip, seen from the side, the barrel pointing to the right" },
];

/** Größte Kantenlänge beim Übernehmen je Bildart (Standard 400 px). Symbole sind im Spiel nur 16–48 px hoch. */
export const MAX_PX_JE_ART = { symbol: 160, gegenstand: 256, figur: 320 };

/** Fertiger Prompt für ein Motiv. @param {{art: string, motiv: string}} m @param {boolean} mitLora */
/**
 * @param {string} [stilName] anderer Stil aus artStilprobe.js (z. B. "pixel", vom Nutzer am 04.11.
 *   gewählt) statt des Standard-STIL — farmArt.js --stil <name>.
 */
export function promptFuer(m, mitLora, stilName) {
  // Stilproben (artStilprobe.js) bringen ihren fertigen Prompt mit.
  if (m.prompt) return mitLora ? `${LORA_WORT}, ${m.prompt}` : m.prompt;
  const vorlage = ARTEN[m.art];
  if (!vorlage) throw new Error(`Unbekannte Bildart: ${m.art}`);
  const anderer = stilName ? STILE[stilName] : null;
  if (stilName && !anderer) throw new Error(`Unbekannter Stil: ${stilName} (vorhanden: ${Object.keys(STILE).join(", ")})`);
  const stil = m.art === "boden" ? (anderer?.boden ?? STIL_BODEN) : (anderer?.objekt ?? STIL);
  const text = `${vorlage.replace("{MOTIV}", m.motiv)}, ${stil}`;
  return mitLora ? `${LORA_WORT}, ${text}` : text;
}
