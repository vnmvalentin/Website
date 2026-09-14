// garden/core/deko.js
// Der Deko-Katalog des Servers — Spiegel von
// Frontend/src/pages/GardenGame/ui/deko.js.
//
// WARUM ZWEIMAL
// Der Browser braucht ihn zum Zeichnen und für den Laden, der Server zum Bauen der
// Stücke im Admin-Menü (garden/admin.js). Ein gemeinsames Modul gäbe es nur um den
// Preis, dass das Backend aus dem Frontend-Ordner liest — dagegen entschieden.
// Wer hier etwas ändert, ändert es DORT ebenfalls.
//
// `ebene: "boden"` markiert Bodenbeläge: sie liegen flach unter allem und belegen
// das Feld nicht. `licht` beschreibt die Lichtquelle in Weltpixeln (Kachel = 64).

const BASIS = "/garden-assets/deco";

const KATEGORIEN = [
    { id: "texture",  name: "Böden" },
    { id: "lighting", name: "Beleuchtung" },
    { id: "nature",   name: "Natur" },
    { id: "social",   name: "Sitzen & Feuer" },
    { id: "objects",  name: "Objekte" },
];

const LICHT = {
    laterne:     { radius: 215, farbe: [253, 224, 71],  hoehe: 76,  flackern: 0.05 },
    feuerschale: { radius: 165, farbe: [251, 146, 60],  hoehe: 12,  flackern: 0.17 },
    kugel:       { radius: 96,  farbe: [254, 243, 199], hoehe: 38,  flackern: 0.02 },
    sternenmast: { radius: 200, farbe: [252, 211, 77],  hoehe: 104, flackern: 0.08 },
    parklaterne: { radius: 240, farbe: [254, 240, 200], hoehe: 108, flackern: 0.03 },
};

const DEKO_KATALOG = [
    { id: "boden_gras",      name: "Rasenstück",        emoji: "🌱", rarity: "COMMON",   price: 600,  image: `${BASIS}/texture/gras.jpg`,       width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_pfad",      name: "Trampelpfad",       emoji: "🥾", rarity: "COMMON",   price: 900,  image: `${BASIS}/texture/path1.jpg`,      width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_kies",      name: "Kiesboden",         emoji: "🪨", rarity: "COMMON",   price: 1200, image: `${BASIS}/texture/gravel.jpg`,     width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_ziegel",    name: "Ziegelboden",       emoji: "🧱", rarity: "COMMON",   price: 1500, image: `${BASIS}/texture/brick.jpg`,      width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_kopfstein", name: "Kopfsteinpflaster", emoji: "🪨", rarity: "UNCOMMON", price: 1800, image: `${BASIS}/texture/smallstone.jpg`, width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_diele",     name: "Holzdielen",        emoji: "🪵", rarity: "UNCOMMON", price: 2000, image: `${BASIS}/texture/plank.jpg`,      width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_moos",      name: "Moosplatten",       emoji: "🍀", rarity: "UNCOMMON", price: 2200, image: `${BASIS}/texture/moss.jpg`,       width: 1, height: 1, kategorie: "texture", ebene: "boden" },
    { id: "boden_stein",     name: "Steinplatten",      emoji: "🧱", rarity: "RARE",     price: 2500, image: `${BASIS}/texture/stone.jpg`,      width: 1, height: 1, kategorie: "texture", ebene: "boden" },

    { id: "licht_kugel",  name: "Kugellampe",     emoji: "💡", rarity: "COMMON",   price: 9000,  image: `${BASIS}/lighting/light2.png`,           width: 1, height: 1, kategorie: "lighting", licht: LICHT.kugel },
    { id: "deco_lamp",    name: "Laterne",        emoji: "🏮", rarity: "COMMON",   price: 12000, image: `${BASIS}/lighting/lamp_placeholder.png`, width: 1, height: 2, kategorie: "lighting", licht: LICHT.laterne },
    { id: "licht_sterne", name: "Sternenlaterne", emoji: "✨", rarity: "UNCOMMON", price: 45000, image: `${BASIS}/lighting/light.png`,            width: 1, height: 2, kategorie: "lighting", licht: LICHT.sternenmast },
    { id: "licht_park",   name: "Parklaterne",    emoji: "🕯️", rarity: "RARE",     price: 90000, image: `${BASIS}/lighting/light3.png`,           width: 1, height: 2, kategorie: "lighting", licht: LICHT.parklaterne },

    { id: "plant",   name: "Pflanze",      emoji: "🪴", rarity: "COMMON", price: 5000, image: `${BASIS}/nature/plant.png`,   width: 1, height: 1, kategorie: "nature" },
    { id: "flower1", name: "Blumenkasten", emoji: "🌼", rarity: "COMMON", price: 6000, image: `${BASIS}/nature/flower1.png`, width: 1, height: 1, kategorie: "nature" },
    { id: "flower2", name: "Blumenkiste",  emoji: "🌻", rarity: "COMMON", price: 6000, image: `${BASIS}/nature/flower2.png`, width: 1, height: 1, kategorie: "nature" },
    { id: "flower3", name: "Blumentrog",   emoji: "🌷", rarity: "COMMON", price: 6000, image: `${BASIS}/nature/flower3.png`, width: 1, height: 1, kategorie: "nature" },
    // Ohne Kasten/Kiste/Trog — steht direkt im Gras, kein Behälter drunter.
    // Vier Farbmischungen zur Auswahl, gleiches Muster wie bei den drei Gartenzwergen.
    { id: "blumen_wiese",  name: "Wildblumen",    emoji: "🌸", rarity: "COMMON", price: 4500, image: `${BASIS}/nature/blumen_wiese.png`,  width: 1, height: 1, kategorie: "nature" },
    { id: "blumen_wiese2", name: "Wildblumen II", emoji: "🌸", rarity: "COMMON", price: 4500, image: `${BASIS}/nature/blumen_wiese2.png`, width: 1, height: 1, kategorie: "nature" },
    { id: "blumen_wiese3", name: "Wildblumen III", emoji: "🌸", rarity: "COMMON", price: 4500, image: `${BASIS}/nature/blumen_wiese3.png`, width: 1, height: 1, kategorie: "nature" },
    { id: "blumen_wiese4", name: "Wildblumen IV", emoji: "🌸", rarity: "COMMON", price: 4500, image: `${BASIS}/nature/blumen_wiese4.png`, width: 1, height: 1, kategorie: "nature" },
    // Wie der Zaun (siehe unten) breit statt hoch: 2×1, sonst steht sie als schmale
    // Säule da statt als Hecke, an der man entlangläuft.
    { id: "hecke",       name: "Hecke",       emoji: "🌳", rarity: "COMMON", price: 9000, image: `${BASIS}/nature/hecke.png`,       width: 2, height: 1, kategorie: "nature" },
    { id: "hecke_klein", name: "Kleine Hecke", emoji: "🌳", rarity: "COMMON", price: 5000, image: `${BASIS}/nature/hecke_klein.png`, width: 1, height: 1, kategorie: "nature" },
    // Feedback 01.09.: neu geliefert. Baum steht hoch statt breit (1×2), wie die
    // Laterne oben — sonst wirkt die Krone gestaucht auf einem 1×1-Feld.
    { id: "cherry_blossom", name: "Kirschblütenbaum", emoji: "🌸", rarity: "COMMON", price: 12000, image: `${BASIS}/nature/cherry_blossom.png`, width: 1, height: 2, kategorie: "nature" },
    { id: "tulpenbett",     name: "Tulpenbeet",        emoji: "🌷", rarity: "COMMON", price: 6000,  image: `${BASIS}/nature/tulpenbett.png`,     width: 1, height: 1, kategorie: "nature" },

    { id: "deco_bench", name: "Gartenbank",  emoji: "🪑", rarity: "COMMON",   price: 8000,   image: `${BASIS}/social/bank.png`,      width: 1, height: 1, kategorie: "social" },
    { id: "stuhl",      name: "Bistrostuhl", emoji: "🪑", rarity: "COMMON",   price: 9000,   image: `${BASIS}/social/chair.png`,     width: 1, height: 1, kategorie: "social" },
    { id: "liegestuhl", name: "Liegestuhl",  emoji: "🏖️", rarity: "UNCOMMON", price: 15000,  image: `${BASIS}/social/lawnchair.png`, width: 1, height: 1, kategorie: "social" },
    // Feedback 01.09.: neu geliefert. 1×2 wie gewünscht — der Schirm überragt den
    // Fuß deutlich, ein 1×1-Feld hätte das Dach oben abgeschnitten wirken lassen.
    { id: "sonnenschirm", name: "Sonnenschirm", emoji: "⛱️", rarity: "UNCOMMON", price: 16000,  image: `${BASIS}/social/sonnenschirm.png`, width: 1, height: 2, kategorie: "social" },
    { id: "feuer",      name: "Feuerschale", emoji: "🔥", rarity: "UNCOMMON", price: 20000,  image: `${BASIS}/social/feuer.png`,     width: 1, height: 1, kategorie: "social", licht: LICHT.feuerschale },
    { id: "grill",      name: "Grill",       emoji: "🍖", rarity: "UNCOMMON", price: 35000,  image: `${BASIS}/social/grill.png`,     width: 1, height: 1, kategorie: "social" },
    { id: "tisch",      name: "Gartentisch", emoji: "🪵", rarity: "UNCOMMON", price: 40000,  image: `${BASIS}/social/tisch.png`,     width: 1, height: 1, kategorie: "social" },
    { id: "pool",       name: "Pool",        emoji: "🏊", rarity: "EPIC",     price: 400000, image: `${BASIS}/social/pool.png`,      width: 2, height: 2, kategorie: "social" },

    // `sichtschutz: true`: anders als sonstige Deko darf ein Zaun den Spieler
    // verdecken wie eine Pflanze — dahinter zu verschwinden sieht bei einem Zaun
    // richtig aus, bei einer Bank oder Statue nicht (siehe Renderer.compareByBaseY).
    { id: "zaun",          name: "Gartenzaun",    emoji: "🚧", rarity: "COMMON",    price: 7000,    image: `${BASIS}/objects/fence.png`,                width: 2, height: 1, kategorie: "objects", sichtschutz: true },
    // Einzelnes Zaunfeld, 1×1 — anders als der Gartenzaun oben absichtlich OHNE
    // Endpfosten an beiden Seiten, damit mehrere nebeneinander wie EIN durch-
    // gehender Zaun aussehen statt wie einzelne, doppelt umrandete Segmente.
    // `voll: true`: normale Deko steht mit 10 % Rand in ihrer Kachel (siehe
    // Renderer._collectDeco), sonst blitzt zwischen zwei Zaunfeldern Gras durch
    // und der Zaun "knüpft" nicht wirklich an — dieses Stück füllt die Kachel
    // deshalb randlos bis an beide Kanten.
    { id: "zaun_klein",    name: "Zaunfeld",      emoji: "🚧", rarity: "COMMON",    price: 4000,    image: `${BASIS}/objects/fence_1x1.png`,            width: 1, height: 1, kategorie: "objects", voll: true, sichtschutz: true },
    // Feedback 01.09.: neu geliefert. Schlichtes Hofstück, 1×1 wie gewünscht.
    { id: "heuballen",     name: "Heuballen",     emoji: "🌾", rarity: "COMMON",    price: 4000,    image: `${BASIS}/objects/heuballen.png`,            width: 1, height: 1, kategorie: "objects" },
    { id: "gnome1",        name: "Gartenzwerg",   emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: `${BASIS}/objects/gnome1.png`,               width: 1, height: 1, kategorie: "objects" },
    { id: "gnome2",        name: "Gartenzwerg 2", emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: `${BASIS}/objects/gnome2.png`,               width: 1, height: 1, kategorie: "objects" },
    { id: "gnome3",        name: "Gartenzwerg 3", emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: `${BASIS}/objects/gnome3.png`,               width: 1, height: 1, kategorie: "objects" },
    // Feedback 01.09.: neu geliefert. 1×2 wie gewünscht — steht auf einem Pfahl,
    // die Arme reichen bis knapp unter die Kachelgrenze, ein 1×1-Feld hätte den
    // Hut oben abgeschnitten.
    { id: "vogelscheuche", name: "Vogelscheuche", emoji: "🧑‍🌾", rarity: "UNCOMMON", price: 18000,  image: `${BASIS}/objects/vogelscheuche.png`,        width: 1, height: 2, kategorie: "objects" },
    { id: "deco_statue",   name: "Statue",        emoji: "🗿", rarity: "RARE",      price: 80000,   image: `${BASIS}/objects/statue_placeholder.png`,   width: 1, height: 2, kategorie: "objects" },
    { id: "teich",         name: "Teich",         emoji: "🐟", rarity: "RARE",      price: 120000,  image: `${BASIS}/objects/teich.png`,                width: 2, height: 2, kategorie: "objects" },
    { id: "brunnen",       name: "Brunnen",       emoji: "⛲", rarity: "RARE",      price: 150000,  image: `${BASIS}/objects/brunnen1.png`,             width: 2, height: 2, kategorie: "objects" },
    { id: "deco_fountain", name: "Großbrunnen",   emoji: "⛲", rarity: "EPIC",      price: 500000,  image: `${BASIS}/objects/fountain_placeholder.png`, width: 2, height: 2, kategorie: "objects" },
    // Ein Feld BREIT, obwohl das Bild zwei Kacheln füllt: nur so lässt sich der Bogen
    // auf die Mittelachse des Grundstücks setzen. Ein zwei Kacheln breiter Fußabdruck
    // rastet zwangsläufig auf eine Kachelgrenze ein und steht damit immer einen halben
    // Schritt neben der Mitte. Gezeichnet wird unverändert groß — die Größe hängt an
    // max(width, height), und die Höhe bleibt 2.
    { id: "deco_arch",     name: "Holzbogen",     emoji: "🏛️", rarity: "LEGENDARY", price: 2000000, image: `${BASIS}/objects/bogen.png`,                width: 1, height: 2, kategorie: "objects" },
];

/**
 * Wohin die alten Pfade gezogen sind.
 *
 * Bis zur Ordnerumstellung lag jede Deko direkt unter /garden-assets/deco/. Jeder
 * gespeicherte Garten und jeder Rucksack zeigt noch dorthin — ohne diese Tabelle
 * wäre nach der Umstellung jedes gesetzte Stück ein 404, also unsichtbar.
 * Schlüssel ist der DATEINAME, damit die Zuordnung unabhängig vom Präfix greift.
 */
const ALTER_ORDNER = {
    "plant.png":                "nature",
    "flower1.png":              "nature",
    "flower2.png":              "nature",
    "flower3.png":              "nature",
    "bank.png":                 "social",
    "chair.png":                "social",
    "lawnchair.png":            "social",
    "feuer.png":                "social",
    "grill.png":                "social",
    "tisch.png":                "social",
    "pool.png":                 "social",
    "lamp_placeholder.png":     "lighting",
    "light.png":                "lighting",
    "light2.png":               "lighting",
    "light3.png":               "lighting",
    "fence.png":                "objects",
    "gnome1.png":               "objects",
    "gnome2.png":               "objects",
    "gnome3.png":               "objects",
    "statue_placeholder.png":   "objects",
    "teich.png":                "objects",
    "brunnen1.png":             "objects",
    "fountain_placeholder.png": "objects",
    "bogen.png":                "objects",
};

/**
 * Alten Deko-Bildpfad auf die neue Ordnerstruktur ziehen. Unbekannte und bereits
 * umgezogene Pfade kommen unverändert zurück.
 */
function normalisiereDekoPfad(pfad) {
    if (typeof pfad !== "string" || !pfad.startsWith(`${BASIS}/`)) return pfad;
    const rest = pfad.slice(BASIS.length + 1);
    if (rest.includes("/")) return pfad;          // steht schon in einem Unterordner
    const ordner = ALTER_ORDNER[rest];
    return ordner ? `${BASIS}/${ordner}/${rest}` : pfad;
}

const NACH_ID = new Map(DEKO_KATALOG.map((d) => [d.id, d]));

function dekoInfo(decoId) {
    return NACH_ID.get(String(decoId || "")) || null;
}

function istBoden(deco) {
    if (!deco) return false;
    if (deco.ebene === "boden") return true;
    return dekoInfo(deco.decoId || deco.id)?.ebene === "boden";
}

/**
 * Was von einem Katalogeintrag in den Rucksack wandert. Spiegel von
 * alsVorratsstueck in Frontend/src/pages/GardenGame/ui/deko.js — beide Wege
 * (Laden im Browser, Admin-Menü hier) müssen dasselbe Stück ablegen.
 */
function alsVorratsstueck(deko) {
    const stueck = {
        id: deko.id,
        name: deko.name,
        emoji: deko.emoji,
        image: deko.image,
        rarity: deko.rarity || "COMMON",
        price: deko.price,
        width: deko.width || 1,
        height: deko.height || 1,
    };
    if (deko.ebene) stueck.ebene = deko.ebene;
    return stueck;
}

module.exports = {
    BASIS, KATEGORIEN, DEKO_KATALOG, LICHT,
    dekoInfo, istBoden, alsVorratsstueck, normalisiereDekoPfad, ALTER_ORDNER,
};
