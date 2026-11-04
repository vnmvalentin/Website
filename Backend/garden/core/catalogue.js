// garden/core/catalogue.js
// EINZIGE Backend-Quelle fuer die Pflanzenwerte.
//
// DIESE DATEI IST DIE QUELLE. Der Frontend-Spiegel wird daraus ERZEUGT, nicht von
// Hand gepflegt:
//
//     cd Backend && npm run garden:spiegel          (schreibt den Spiegel neu)
//     cd Backend && npm run garden:spiegel:pruefen  (meldet nur Abweichungen)
//
// Vorher hatte garden/migrations/plants.js eine eigene, eingefrorene Kopie — die
// stand noch auf den Werten VOR dem Balancing und hat es bei jedem Serverstart
// wieder rueckgaengig gemacht. Danach lief stattdessen der Frontend-Spiegel weg
// (neun Sorten mit groesseren Ladenbestaenden als der Server fuehrte). Beides ist
// dieselbe Krankheit: ein zweiter Datenhalter, der von Hand gepflegt wird.
//
// ── stockMin / stockMax ──────────────────────────────────────────────────────
// HANDARBEIT. Diese Zahlen sind bewusst je Sorte eingestellt und duerfen nicht
// pauschal umgerechnet werden — ein Skript, das sie "balanciert", macht genau die
// Feinarbeit kaputt, fuer die sie da sind.
//
// ── shopChance ───────────────────────────────────────────────────────────────
// Aug 2026 um 15 % gesenkt (x0,85). Der Nachzieh-Zaehler in core/laden.js
// (pityGrenze) faengt Pechstraehnen weiterhin ab: keine Sorte bleibt laenger als
// das Doppelte ihrer erwarteten Wartezeit aus dem Regal.
//
// v2-Balancing (Punkt 5): innerhalb COMMON/UNCOMMON/RARE gab es schon echte
// Varianz zwischen den Sorten. EPIC (12 Sorten) und LEGENDARY (10 Sorten) hatten
// dagegen trotz 20-facher bzw. 200-facher Preisspanne innerhalb der Stufe eine
// einzige, identische shopChance (0.17 / 0.043) — die teuersten Sorten waren
// nicht seltener als die billigsten. Neu gestaffelt mit shopChance_i ∝ 1/√preis_i,
// normiert auf denselben Stufen-Mittelwert wie vorher (Summe bleibt 12×0.17 bzw.
// 10×0.043) — der Nachzieh-Zaehler bleibt dadurch fuer die Stufe insgesamt fair,
// nur innerhalb der Stufe verschiebt sich, wer haeufiger/seltener auftaucht.
// pityGrenze() haengt ohnehin an der shopChance JEDER Sorte einzeln, nicht an
// einem Stufen-Mittelwert, und braucht deshalb keine Anpassung.
//
// BALANCING 14.09. (Feedback "gute Pflanzen sind zu häufig"): RARE/EPIC/LEGENDARY
// pauschal je Stufe herunterskaliert (RARE ×0,85, EPIC ×0,65, LEGENDARY ×0,5),
// COMMON/UNCOMMON/MYTHIC unangetastet. Innerhalb einer Stufe bleibt das Verhältnis
// zwischen den Sorten (aus der 1/√preis-Staffelung oben) unverändert — es sinkt
// nur, wie oft die Stufe insgesamt im Laden steht. pityGrenze() (core/laden.js)
// haengt weiterhin an der (jetzt kleineren) shopChance jeder Sorte und verlängert
// die garantierte Wartezeit automatisch mit — keine Sorte bleibt beliebig lang aus.
//
// BALANCING 02.11. (Feedback "der Shop bringt nur Müll") — Dauerträger auf eine
// gemeinsame Linie: Ertrag je Feld und Stunde steigt mit dem Kaufpreis, und die
// Zeit bis zur Amortisation (Aufbau + Preis ÷ Ertrag/h) liegt je Stufe in einem
// Band: Rare mit 22-h-Zyklus ~12–15 h, Rare mit Kurzzyklus ~3 h, Epic 1,5 Tage
// (billigste) bis 2,5 Tage (Olive), Legendary unverändert ~3,5 Tage.
//   Zu stark → PREIS hoch (bereits gepflanzte Stauden bleiben unverändert gut):
//     Cranberry 55k → 350k (amortisierte in 41 min), Limette 93k → 175k,
//     Birne 500k → 1,6 Mio (bezahlte sich vor allen teureren Epics ab).
//   Zu schwach → FRUCHTWERT hoch (wirkt sofort, auch auf stehende Stauden):
//     Kiwi ×3,5, Pflaume ×3,1, Apfel ×2,3, Traube ×1,3, Himbeere ×1,25,
//     Tomate ×3,7, Mango/Orange leicht — Kiwi/Pflaume/Apfel brauchten 4–6 Tage.
// Rechnung: Erwartungswert Fruchtgröße (norm = U^1,35) × Sonderform × Wetter ≈ 2,48 × fruitSellMin.
//
// WARTEBONUS 02.11. — Einmalernten. Fast jede Sorte brachte ~2,9× ihren Kaufpreis,
// egal ob sie zwei Minuten oder vierzehn Tage wuchs; Warten zahlte sich nur in XP
// aus. Jetzt gilt eine Untergrenze für den erwarteten Erlös je Kaufpreis:
//
//     2,85 × (1 + 0,15 · log2(1 + Stunden))      Stunden = mittlere Wachstumszeit
//     6 h → 4,0×    2 Tage → 5,2×    6 Tage → 5,9×    14 Tage → 6,4×    20 Tage → 6,7×
//
// Nur ANGEHOBEN, wer mehr als 5 % darunter lag (Karotte, Knoblauch, alle vier
// Rare-Einmalernten, Pfirsich, Avocado, alle Legendary-Einmalernten, Mondblume);
// wer darüber liegt (Paprika, Kürbis, Holunder, Aubergine …) bleibt, wie er ist.
// Bewusst 0,15 und nicht 0,25: mit 0,25 hätte sich der Gewinn aus Legendary-
// Einmalernten zusammen mit der häufigeren Legendary im Laden (core/laden.js)
// gegenüber vorher etwa versechsfacht — im späten Spiel gibt es ohnehin schon mehr
// Gold als Ziele (PLANUNG_LANGZEITZIELE.md). Pro Stunde und Feld bleiben kurze
// Pflanzen vorn; lange lohnen sich jetzt für "einmal am Tag reinschauen".
const SEED_CATALOGUE = [
    // ── COMMON ──
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 10, shopChance: 0.85, stockMin: 6, stockMax: 25,       growMinSec: 4,       growMaxSec: 12,      sellMin: 20,       sellMax: 60       }, // mg: Carrot
    { id: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 100, shopChance: 0.64, stockMin: 3, stockMax: 10,      growMinSec: 90,      growMaxSec: 270,     sellMin: 130,       sellMax: 390      }, // mg: Daisy
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 135, shopChance: 0.64, stockMin: 3, stockMax: 10,      growMinSec: 45,      growMaxSec: 135,     sellMin: 310,      sellMax: 930      }, // mg: Aloe
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 170, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 120,     growMaxSec: 360,     sellMin: 260,      sellMax: 780     }, // Balancing: war 30-90 (Verlust bei 4-12min Wachstum)
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 210, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 60,      growMaxSec: 180,     sellMin: 350,      sellMax: 1050     }, // mg: Beet
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 229, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 300,     growMaxSec: 900,    sellMin: 300,      sellMax: 900     }, // mg: Rose
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600, shopChance: 0.29, stockMin: 6, stockMax: 25,      growMinSec: 90,      growMaxSec: 270,     sellMin: 800,      sellMax: 2400     }, // Balancing: war 76-228 (garantierter Verlust)
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 948, shopChance: 0.13, stockMin: 1, stockMax: 4,     growMinSec: 50,      growMaxSec: 150,     sellMin: 1090,     sellMax: 3270     }, // mg: Daffodil
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 2350, shopChance: 0.12, stockMin: 1, stockMax: 6,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 2900,     sellMax: 8700     }, // mg: Watermelon
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 52, shopChance: 0.85, stockMin: 2, stockMax: 3,       structureGrowSec: 52,    fruitCycleSec: 45,    maxFruits: 1,  fruitSellMin: 42,    fruitSellMax: 126   }, // mg: Cabbage
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 86, shopChance: 0.85, stockMin: 1, stockMax: 6,       structureGrowSec: 15,    fruitCycleSec: 70,    maxFruits: 5,  fruitSellMin: 14,    fruitSellMax: 42    }, // mg: Strawberry

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 3000, shopChance: 0.085, stockMin: 1, stockMax: 4,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 4000,     sellMax: 12000    }, // mg: Pumpkin
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 2500, shopChance: 0.12, stockMin: 1, stockMax: 2,     growMinSec: 1200,     growMaxSec: 3600,     sellMin: 3200,     sellMax: 9600    }, // mg: Echeveria
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 8700, shopChance: 0.43, stockMin: 1, stockMax: 3,     growMinSec: 90,      growMaxSec: 270,     sellMin: 10000,    sellMax: 30000    }, // mg: Gentian
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 10000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 100,     growMaxSec: 300,     sellMin: 20000,    sellMax: 60000    }, // mg: Lavender
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 12000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 79200,   growMaxSec: 237600,   sellMin: 75000,    sellMax: 225000    }, // mg: Pine Tree
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 17500, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 240,     growMaxSec: 720,     sellMin: 20123,    sellMax: 60369    }, // mg: Lily
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 30000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 120,     growMaxSec: 360,     sellMin: 50000,    sellMax: 150000   }, // mg: Saffron
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 296, shopChance: 0.64, stockMin: 2, stockMax: 5,      structureGrowSec: 360,   fruitCycleSec: 900,   maxFruits: 8,  fruitSellMin: 30,    fruitSellMax: 90    }, // mg: Fava Bean
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 400, shopChance: 0.64, stockMin: 1, stockMax: 5,      structureGrowSec: 33,   fruitCycleSec: 105,    maxFruits: 5,  fruitSellMin: 23,    fruitSellMax: 69    }, // mg: Blueberry
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 2000, shopChance: 0.15,  stockMin: 1, stockMax: 6,      structureGrowSec: 300, fruitCycleSec: 1200,  maxFruits: 7,  fruitSellMin: 70,   fruitSellMax: 210   }, // Balancing: Ertrag an 6h-Aufbauzeit angepasst
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 800, shopChance: 0.64, stockMin: 1, stockMax: 3,      structureGrowSec: 60,  fruitCycleSec: 1100,    maxFruits: 2,  fruitSellMin: 100,    fruitSellMax: 300    }, // mg: Tomato
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 1300, shopChance: 0.15,  stockMin: 1, stockMax: 6,     structureGrowSec: 45,   fruitCycleSec: 130,    maxFruits: 1,  fruitSellMin: 36,    fruitSellMax: 108    }, // mg: Corn

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 139000, shopChance: 0.072, stockMin: 16, stockMax: 25,   growMinSec: 79200,   growMaxSec: 237600,  sellMin: 290000,   sellMax: 870000   }, // mg: Mushroom
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 191000, shopChance: 0.072, stockMin: 5, stockMax: 15,   growMinSec: 10800,    growMaxSec: 32400,   sellMin: 310000,   sellMax: 930000   }, // mg: Cactus
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 400000, shopChance: 0.037, stockMin: 5, stockMax: 10,   growMinSec: 79200,   growMaxSec: 237600,   sellMin: 840000,   sellMax: 2520000  }, // mg: Bamboo
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 520000, shopChance: 0.037, stockMin: 3, stockMax: 9,   growMinSec: 79200,   growMaxSec: 237600,  sellMin: 1090000,   sellMax: 3270000  }, // mg: Violet Cort
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 350000, shopChance: 0.289, stockMin: 1, stockMax: 1,     structureGrowSec: 900,  fruitCycleSec: 1500,   maxFruits: 3,  fruitSellMin: 7000,  fruitSellMax: 21000  }, // mg: Squash
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 25900, shopChance: 0.072, stockMin: 1, stockMax: 2,     structureGrowSec: 8100, fruitCycleSec: 79200,  maxFruits: 7,  fruitSellMin: 3000,   fruitSellMax: 9000   }, // mg: Pear
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 30200, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 10800, fruitCycleSec: 79200, maxFruits: 7,  fruitSellMin: 3500,  fruitSellMax: 10500  }, // Balancing: war 21h-Zyklus mit 30-90 Gold (kaputt)
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 15000, shopChance: 0.179, stockMin: 1, stockMax: 3,    structureGrowSec: 6750, fruitCycleSec: 79200,  maxFruits: 5,  fruitSellMin: 2200,  fruitSellMax: 6600  }, // mg: Banana
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 55000, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 8100, fruitCycleSec: 79200, maxFruits: 8,  fruitSellMin: 4875,  fruitSellMax: 14625 }, // mg: Camellia
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 85000, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 8100,  fruitCycleSec: 79200,  maxFruits: 7,  fruitSellMin: 9000,  fruitSellMax: 27000 }, // mg: Peach
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 175000, shopChance: 0.289, stockMin: 2, stockMax: 3,    structureGrowSec: 270,  fruitCycleSec: 1800,   maxFruits: 2,  fruitSellMin: 6000,  fruitSellMax: 18000 }, // mg: Burro's Tail

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 1000000, shopChance: 0.124, stockMin: 3, stockMax: 13,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 2000000,  sellMax: 6000000  }, // mg: Ube
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 2500000, shopChance: 0.078, stockMin: 5, stockMax: 15,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 4000000,  sellMax: 12000000 }, // Interpolated
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 5000000, shopChance: 0.059, stockMin: 7, stockMax: 14,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 8500000,  sellMax: 25500000 }, // Interpolated
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 10000000, shopChance: 0.039, stockMin: 4, stockMax: 12, growMinSec: 244800,  growMaxSec: 734400,  sellMin: 23700000, sellMax: 71100000 }, // mg: Dawnbreaker
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 900000, shopChance: 0.13, stockMin: 1, stockMax: 4,   structureGrowSec: 540, fruitCycleSec: 79200,  maxFruits: 4,  fruitSellMin: 45000, fruitSellMax: 135000 }, // mg: Poinsettia
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 1600000, shopChance: 0.176, stockMin: 1, stockMax: 4,   structureGrowSec: 10800,  fruitCycleSec: 79200,  maxFruits: 3,  fruitSellMin: 100000,fruitSellMax: 300000}, // mg: Eggplant
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 670000, shopChance: 0.15, stockMin: 1, stockMax: 4,   structureGrowSec: 16200, fruitCycleSec: 79200, maxFruits: 7,  fruitSellMin: 24000, fruitSellMax: 72000 }, // mg: Chrysanthemum
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 750000, shopChance: 0.143, stockMin: 1, stockMax: 4,   structureGrowSec: 10800, fruitCycleSec: 79200,  maxFruits: 11, fruitSellMin: 16000, fruitSellMax: 48000 }, // mg: Date
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 850000, shopChance: 0.137, stockMin: 1, stockMax: 4,   structureGrowSec: 1350, fruitCycleSec: 79200,   maxFruits: 1,  fruitSellMin: 175000, fruitSellMax: 525000 }, // mg: Grape
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 1000000, shopChance: 0.124, stockMin: 1, stockMax: 4,  structureGrowSec: 270,   fruitCycleSec: 79200,   maxFruits: 9,  fruitSellMin: 22000,  fruitSellMax: 66000 }, // mg: Pepper
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 2000000, shopChance: 0.091, stockMin: 1, stockMax: 4,  structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 55000, fruitSellMax: 165000 }, // mg: Lemon
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 2750000, shopChance: 0.078, stockMin: 1, stockMax: 4,  structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 2,  fruitSellMin: 200000, fruitSellMax: 600000 }, // mg: Passion Fruit

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 50000000, shopChance: 0.0205, stockMin: 5, stockMax: 7, growMinSec: 259200,  growMaxSec: 777600,  sellMin: 119000000, sellMax: 357000000}, // Interpolated Huge
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 100000000, shopChance: 0.0145, stockMin: 2, stockMax: 6,growMinSec: 345600,  growMaxSec: 1036800, sellMin: 246000000,sellMax: 738000000}, // Interpolated Huge
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 500000000, shopChance: 0.0065, stockMin: 3, stockMax: 8,growMinSec: 432000,  growMaxSec: 1296000, sellMin: 1260000000,sellMax: 3780000000},// Interpolated Huge
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1000000000, shopChance: 0.0045, stockMin: 4, stockMax: 10,growMinSec: 604800,  growMaxSec: 1814400, sellMin: 2600000000,sellMax: 7800000000},// Interpolated Huge
    // BALANCING Aug 2026 (zweite Runde — banane/passionsfrucht/sternfrucht/dattel/
    // kokosnuss): ROI (Kaufpreis ÷ Ertrag pro Stunde, bei maximaler Fruchtgröße)
    // lag bei 7–25 Tagen, bei Kokosnuss und Passionsfrucht abgezogen von der
    // fruitCycleSec-Rechnung sogar noch länger. Referenz ist Acai (unverändert,
    // ROI ~3,5 Tage, stündlicher Ertrag ~1,2 % des Kaufpreises) — alle fünf sind
    // jetzt auf denselben Maßstab gebracht, ~3 Tage ROI und 1,4–1,5 % Kaufpreis/h.
    // Bei Sternfrucht/Dattel/Kokosnuss (je nur EIN Fruchtstand, ein Fruchtstand
    // pro Tag) ging das nicht über den Verkaufswert allein: ihre lange
    // Aufbauzeit (22–46 h) hätte sonst entweder einen Ertrag verlangt, der die
    // ganze Investition mit der ERSTEN Frucht zurückzahlt (Preisverzerrung nach
    // oben), oder wäre bei moderatem Ertrag nie unter ~5,4 Tage gekommen — die
    // Aufbauzeit ist deshalb ebenfalls gekürzt (nicht auf null: sie bleiben
    // spürbar langsamer als Acai/Banane/Passionsfrucht mit ihren vielen
    // Fruchtständen). fruitCycleSec/maxFruits bleiben unangetastet — daran hängt
    // auch die Erfahrung (siehe xpFuerErnte in economy.js), die soll hier
    // unberührt bleiben.
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 5000000, shopChance: 0.0655, stockMin: 1, stockMax: 4, structureGrowSec: 450,  fruitCycleSec: 79200,   maxFruits: 7,  fruitSellMin: 75000, fruitSellMax: 225000 }, // mg: Dragon Fruit
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000, shopChance: 0.046, stockMin: 1, stockMax: 4,structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 150000, fruitSellMax: 450000}, // mg: Cacao — Preis unveraendert, Referenzwert für die Balancing-Runde oben
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 25000000, shopChance: 0.029, stockMin: 1, stockMax: 4,structureGrowSec: 900, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 425000, fruitSellMax: 1275000}, // mg: Lychee
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 100000000, shopChance: 0.0145, stockMin: 1, stockMax: 4,structureGrowSec: 9900, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 12000000,fruitSellMax: 35000000},// mg: Sunflower
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 300000000, shopChance: 0.0085, stockMin: 1, stockMax: 3,structureGrowSec: 20700, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 40000000,fruitSellMax: 110000000},// Balancing: ROI war 45-90 Tage, dann ~14 Tage, jetzt ~3 Tage
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 1000000000, shopChance: 0.0045, stockMin: 1, stockMax: 2,structureGrowSec: 20700, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 120000000,fruitSellMax: 360000000},// Balancing: ROI war >1 Jahr, dann ~15 Tage, jetzt ~3 Tage

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 50000000000, shopChance: 0.00025, stockMin: 1, stockMax: 3,growMinSec: 864000, growMaxSec: 2592000, sellMin: 115000000000, sellMax: 320000000000}, // mg: Moonbinder (interpolated for Single Use). Balancing 04.11.2026 (Fahrplan Phase 6): war 134–402 Mrd — brachte allein ~30–38 % allen Goldes; 100–250 war zu wenig (Simulator kaufte sie gar nicht mehr), Mittelweg 115–320.

    // ── KREUZUNGEN (02.11.) ──
    // Nie im Laden (`kreuzung: true`, shopChance 0 — SHOP_POOL filtert sie heraus).
    // Entstehen nur beim Ernten, wenn die beiden `eltern` nebeneinander stehen —
    // die Regel dazu steht in core/kreuzung.js. Der Samen kostet nichts, deshalb liegt der
    // Erlös nur etwa beim Doppelten des besseren Elternteils, nicht darüber hinaus.
    // `shopPrice` ist 0: nichts kann sie kaufen, und kein Wert hängt daran.
    // Bilder fehlen noch (kommen von Hand) — bis dahin zeigt das Spiel das Emoji.
    { id: "knoblauchzwiebel", name: "Knoblauchzwiebel", emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  kreuzung: true, eltern: ["zwiebel", "knoblauch"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 600,    growMaxSec: 1800,   sellMin: 8000,       sellMax: 24000 },
    { id: "tomoffel",         name: "Tomoffel",         emoji: "🍅", rarity: "UNCOMMON", singleUse: true,  kreuzung: true, eltern: ["tomate", "kartoffel"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 1200,   growMaxSec: 3600,   sellMin: 12000,      sellMax: 36000 },
    { id: "kuerbini",         name: "Kürbini",          emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  kreuzung: true, eltern: ["zucchini", "kuebi"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 180,    growMaxSec: 540,    sellMin: 120000,     sellMax: 360000 },
    { id: "erdhimbeere",      name: "Erdhimbeere",      emoji: "🍓", rarity: "RARE",     singleUse: false, kreuzung: true, eltern: ["erdbeere", "himbeere"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, structureGrowSec: 6750, fruitCycleSec: 79200, maxFruits: 8, fruitSellMin: 12000, fruitSellMax: 36000 },
    { id: "zitrange",         name: "Zitrange",         emoji: "🍊", rarity: "RARE",     singleUse: true,  kreuzung: true, eltern: ["zitrone", "orange"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 10800,  growMaxSec: 32400,  sellMin: 900000,     sellMax: 2700000 },
    { id: "aprikosenpflaume", name: "Aprikosenpflaume", emoji: "🍑", rarity: "EPIC",     singleUse: true,  kreuzung: true, eltern: ["pflaume", "aprikose"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 14400,  growMaxSec: 43200,  sellMin: 17000000,   sellMax: 51000000 },
    { id: "mangave",          name: "Mangave",          emoji: "🥭", rarity: "EPIC",     singleUse: false, kreuzung: true, eltern: ["mango", "guave"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, structureGrowSec: 5400, fruitCycleSec: 79200, maxFruits: 6, fruitSellMin: 110000, fruitSellMax: 330000 },
    { id: "sternendrache",    name: "Sternendrache",    emoji: "🌟", rarity: "LEGENDARY", singleUse: true, kreuzung: true, eltern: ["sternfrucht", "drachenfrucht"], shopPrice: 0, shopChance: 0, stockMin: 1, stockMax: 1, growMinSec: 259200, growMaxSec: 777600, sellMin: 5200000000, sellMax: 15600000000 },
];

module.exports = { SEED_CATALOGUE };
