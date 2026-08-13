// garden/core/catalogue.js
// EINZIGE Backend-Quelle fuer die Pflanzenwerte.
//
// Erzeugt aus Frontend/src/pages/GardenGame/engine/PlantSystem.js. Vorher hatte
// garden/migrations/plants.js eine eigene, eingefrorene Kopie — die stand noch auf den
// Werten VOR dem Balancing und hat es bei jedem Serverstart wieder rueckgaengig
// gemacht (Spinat 30-90 statt 450-1350, Blaubeere 21h-Zyklus statt 3h, …).
//
// Beim naechsten Balancing: hier UND im Frontend aendern, sonst laufen sie erneut
// auseinander.
const SEED_CATALOGUE = [
    // ── COMMON ──
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 40,       growMinSec: 4,       growMaxSec: 12,      sellMin: 65,       sellMax: 195       }, // mg: Carrot
    { id: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 525,      growMinSec: 60,      growMaxSec: 150,     sellMin: 851,       sellMax: 2553      }, // mg: Daisy
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 393,      growMinSec: 45,      growMaxSec: 112,     sellMin: 636,      sellMax: 1908      }, // mg: Aloe
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 2400,      growMinSec: 240,     growMaxSec: 720,     sellMin: 3890,      sellMax: 11670     }, // Balancing: war 30-90 (Verlust bei 4-12min Wachstum)
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600,      growMinSec: 60,      growMaxSec: 180,     sellMin: 972,      sellMax: 2916     }, // mg: Beet
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 3750,      growMinSec: 300,     growMaxSec: 1200,    sellMin: 6080,      sellMax: 18240     }, // mg: Rose
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 780,      growMinSec: 78,      growMaxSec: 234,     sellMin: 1260,      sellMax: 3780     }, // Balancing: war 76-228 (garantierter Verlust)
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 500,     growMinSec: 50,      growMaxSec: 150,     sellMin: 810,     sellMax: 2430     }, // mg: Daffodil
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 7200,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 11700,     sellMax: 35100     }, // mg: Watermelon
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 1800,       structureGrowSec: 45,    fruitCycleSec: 35,    maxFruits: 1,  fruitSellMin: 189,    fruitSellMax: 567   }, // mg: Cabbage
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 1800,       structureGrowSec: 70,    fruitCycleSec: 10,    maxFruits: 5,  fruitSellMin: 11,    fruitSellMax: 33    }, // mg: Strawberry

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 168000,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 272000,     sellMax: 816000    }, // mg: Pumpkin
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 9000,     growMinSec: 120,     growMaxSec: 330,     sellMin: 14600,     sellMax: 43800    }, // mg: Echeveria
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 7200,     growMinSec: 90,      growMaxSec: 270,     sellMin: 11700,    sellMax: 35100    }, // mg: Gentian
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 8000,    growMinSec: 100,     growMaxSec: 300,     sellMin: 13000,    sellMax: 39000    }, // mg: Lavender
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 288000,    growMinSec: 3600,   growMaxSec: 10800,   sellMin: 467000,    sellMax: 1401000    }, // mg: Pine Tree
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 18000,    growMinSec: 240,     growMaxSec: 660,     sellMin: 29200,    sellMax: 87600    }, // mg: Lily
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 14400,    growMinSec: 180,     growMaxSec: 540,     sellMin: 23300,    sellMax: 69900   }, // mg: Saffron
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 900,   fruitCycleSec: 240,   maxFruits: 8,  fruitSellMin: 1300,    fruitSellMax: 3900    }, // mg: Fava Bean
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 105,   fruitCycleSec: 22,    maxFruits: 5,  fruitSellMin: 190,    fruitSellMax: 570    }, // mg: Blueberry
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 33300,   fruitSellMax: 99900   }, // Balancing: Ertrag an 6h-Aufbauzeit angepasst
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 1100,  fruitCycleSec: 40,    maxFruits: 2,  fruitSellMin: 864,    fruitSellMax: 2592    }, // mg: Tomato
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,     structureGrowSec: 130,   fruitCycleSec: 30,    maxFruits: 1,  fruitSellMin: 1300,    fruitSellMax: 3900    }, // mg: Corn

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 6910000,   growMinSec: 14400,   growMaxSec: 28800,  sellMin: 11200000,   sellMax: 33600000   }, // mg: Mushroom
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 4030000,   growMinSec: 9000,    growMaxSec: 16200,   sellMin: 6530000,   sellMax: 19590000   }, // mg: Cactus
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 4610000,   growMinSec: 9000,   growMaxSec: 19800,   sellMin: 7470000,   sellMax: 22410000  }, // mg: Bamboo
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 5760000,   growMinSec: 12600,   growMaxSec: 23400,  sellMin: 9340000,   sellMax: 28020000  }, // mg: Violet Cort
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,     structureGrowSec: 1500,  fruitCycleSec: 200,   maxFruits: 3,  fruitSellMin: 23000,  fruitSellMax: 69000  }, // mg: Squash
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 1730000,     structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 267000,   fruitSellMax: 801000   }, // mg: Pear
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 43200, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 533000,  fruitSellMax: 1599000  }, // Balancing: war 21h-Zyklus mit 30-90 Gold (kaputt)
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 14400, fruitCycleSec: 4500,  maxFruits: 5,  fruitSellMin: 311000,  fruitSellMax: 933000  }, // mg: Banana
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 8,  fruitSellMin: 467000,  fruitSellMax: 1401000 }, // mg: Camellia
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 7200,  fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 267000,  fruitSellMax: 801000 }, // mg: Peach
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 1800,  fruitCycleSec: 100,   maxFruits: 2,  fruitSellMin: 17300,  fruitSellMax: 51900 }, // mg: Burro's Tail

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 18400000,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 29900000,  sellMax: 89700000  }, // mg: Ube
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 36800000,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 59700000,  sellMax: 179100000 }, // Interpolated
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 73700000,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 119000000,  sellMax: 357000000 }, // Interpolated
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 111000000, growMinSec: 28800,  growMaxSec: 57600,  sellMin: 179000000, sellMax: 537000000 }, // mg: Dawnbreaker
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 10800, fruitCycleSec: 5400,  maxFruits: 4,  fruitSellMin: 3730000, fruitSellMax: 11190000 }, // mg: Poinsettia
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 2700,  fruitCycleSec: 7200,  maxFruits: 3,  fruitSellMin: 6630000,fruitSellMax: 19890000}, // mg: Eggplant
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 4260000, fruitSellMax: 12780000 }, // mg: Chrysanthemum
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 64800, fruitCycleSec: 3600,  maxFruits: 11, fruitSellMin: 905000, fruitSellMax: 2715000 }, // mg: Date
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 86400, fruitCycleSec: 900,   maxFruits: 1,  fruitSellMin: 2490000, fruitSellMax: 7470000 }, // mg: Grape
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 560,   fruitCycleSec: 600,   maxFruits: 9,  fruitSellMin: 184000,  fruitSellMax: 552000 }, // mg: Pepper
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 43200, fruitCycleSec: 3600,  maxFruits: 6,  fruitSellMin: 1660000, fruitSellMax: 4980000 }, // mg: Lemon
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 86400, fruitCycleSec: 2700,  maxFruits: 2,  fruitSellMin: 3730000, fruitSellMax: 11190000 }, // mg: Passion Fruit

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 590000000, growMinSec: 21600,  growMaxSec: 36000,  sellMin: 957000000, sellMax: 2871000000}, // Interpolated Huge
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 886000000,growMinSec: 28800,  growMaxSec: 57600, sellMin: 1440000000,sellMax: 4320000000}, // Interpolated Huge
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1330000000,growMinSec: 43200,  growMaxSec: 86400, sellMin: 2150000000,sellMax: 6450000000},// Interpolated Huge
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1770000000,growMinSec: 57600,  growMaxSec: 115200, sellMin: 2870000000,sellMax: 8610000000},// Interpolated Huge
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000, structureGrowSec: 1800,  fruitCycleSec: 900,   maxFruits: 7,  fruitSellMin: 2850000, fruitSellMax: 8550000 }, // mg: Dragon Fruit
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 5400,  maxFruits: 6,  fruitSellMin: 19900000, fruitSellMax: 59700000}, // mg: Cacao
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 1800,  maxFruits: 6,  fruitSellMin: 6640000, fruitSellMax: 19920000}, // mg: Lychee
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 18000, maxFruits: 1,  fruitSellMin: 399000000,fruitSellMax: 1197000000},// mg: Sunflower
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 1910000000,fruitSellMax: 5730000000},// Balancing: ROI war 45-90 Tage
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 1910000000,fruitSellMax: 5730000000},// Balancing: ROI war >1 Jahr

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 28400000000,growMinSec: 115200, growMaxSec: 230400, sellMin: 46000000000, sellMax: 138000000000}, // mg: Moonbinder (interpolated for Single Use)
];

module.exports = { SEED_CATALOGUE };
