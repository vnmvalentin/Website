// garden/core/kreuzung.js
// Kreuzungen: zwei passende Sorten direkt nebeneinander → beim Ernten eine kleine
// Chance auf den Samen einer neuen Sorte, die es nie im Laden gibt.
//
// Geprüft wird beim ERNTEN, weil der Server nur dort sicher dabei ist (der Acker
// gehört sonst dem Browser, siehe README). Nachbarn sind die vier Kacheln
// links/rechts/oben/unten der geernteten. Welche Sorte geerntet wird und welche
// danebensteht, ist egal — die Rezepte sind ungeordnet.
//
// Der Samen geht wie beim Kauf als fertiges Objekt an den Browser zurück (Feld
// `kreuzung` im Ernte-Ergebnis); in den Rucksack legt ihn der Browser, der den
// Rucksack auch sonst führt (gardenGameRoutes.js, kaufeSamen).

const { randomUUID } = require("crypto");
const { SEED_CATALOGUE } = require("./catalogue");

const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/** Chance je Ernte, wenn ein passender Nachbar steht. */
const KREUZUNG_CHANCE = 0.05;

// Die Rezepte stehen an den Kreuzungs-Sorten selbst (Feld `eltern` im Katalog) —
// so kennt sie auch der Browser über den erzeugten Katalog-Spiegel, ohne dritte Liste.
const REZEPTE = SEED_CATALOGUE.filter((s) => s.kreuzung).map((s) => ({ eltern: s.eltern || [], kind: s.id }));


// Beim Laden prüfen, dass jedes Rezept auf echte Sorten zeigt — ein Tippfehler
// hier gäbe sonst einen Samen, den der Browser nicht kennt.
for (const r of REZEPTE) {
    for (const id of [...r.eltern, r.kind]) {
        if (!KATALOG.has(id)) throw new Error(`kreuzung.js: unbekannte Sorte "${id}"`);
    }
    if (r.eltern.length !== 2) throw new Error(`kreuzung.js: "${r.kind}" braucht genau zwei Eltern`);
}

/** Alle Kinder, die `a` mit `b` ergeben kann (in der Regel null oder eins). */
function kinderVon(a, b) {
    return REZEPTE.filter((r) => (r.eltern[0] === a && r.eltern[1] === b) || (r.eltern[0] === b && r.eltern[1] === a))
        .map((r) => r.kind);
}

function nachbarn(key) {
    const [xs, ys] = String(key).split("_");
    const x = Number(xs); const y = Number(ys);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
    return [`${x - 1}_${y}`, `${x + 1}_${y}`, `${x}_${y - 1}`, `${x}_${y + 1}`];
}

/**
 * Würfelt beim Ernten von `seedId` auf Zelle `key` eine Kreuzung aus.
 * @returns {object|null} der neue Samen (wie ein gekaufter) oder null
 */
function kreuzungBeiErnte(state, key, seedId, rng = Math.random) {
    const plants = state?.plotPlants || {};
    const moegliche = [];
    for (const nk of nachbarn(key)) {
        const nachbar = plants[nk];
        if (!nachbar?.seedId) continue;
        moegliche.push(...kinderVon(seedId, nachbar.seedId));
    }
    if (moegliche.length === 0 || rng() >= KREUZUNG_CHANCE) return null;
    const kind = KATALOG.get(moegliche[Math.floor(rng() * moegliche.length)]);
    return {
        instanceId: randomUUID(),
        seedId: kind.id,
        name: kind.name,
        emoji: kind.emoji,
        rarity: kind.rarity,
        shopPrice: 0,
        singleUse: kind.singleUse,
        kreuzung: true,
    };
}

/** Für die Anzeige (Logbuch): aus welchen Eltern eine Kreuzung entsteht. */
function rezeptFuer(kindId) {
    return REZEPTE.find((r) => r.kind === kindId) || null;
}

module.exports = { kreuzungBeiErnte, kinderVon, rezeptFuer, REZEPTE, KREUZUNG_CHANCE };
