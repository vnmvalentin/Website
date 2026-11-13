// garden/migrations/weltkarte.js
// Aufgestellte Deko und Tiere auf die neue Weltkarte „Dorfplatz am Teich“ ziehen.
//
// WARUM
// Deko (decoPlacements) und Tiere (petPlacements) speichern ABSOLUTE Weltpixel
// plus den Index ihres Grundstücks. Die neue Karte (Frontend engine/MapConfig.js,
// PLAETZE) legt die sechs Grundstücke an andere Stellen der Welt. Ohne diese
// Umstellung stünde jede Deko am alten Ort — mitten auf dem Dorfplatz oder im Wald,
// während das eigene Grundstück leer wäre.
//
// Jedes Grundstück behält seine Reihe (oben/unten), also ist es eine reine
// Verschiebung um den Versatz zwischen alter und neuer Lage desselben Index.
// Acker, Steinfeld und Pflanzen hängen an Zellen relativ zum Grundstück und
// brauchen nichts.
//
// Idempotent über die Marke.

const KACHEL = 64;

/**
 * Linke obere Ecke je Grundstücksindex in Kacheln.
 * ALT: Rechteck-Karte bis Phase 6 (worldMargin 8, Abstand 28 + 4, Kiesweg 12).
 * NEU: muss zu PLAETZE in Frontend/src/pages/GardenGame/engine/MapConfig.js passen.
 */
const ALT = [[8, 8], [40, 8], [72, 8], [8, 45], [40, 45], [72, 45]];
const NEU = [[12, 22], [56, 9], [100, 22], [12, 57], [56, 70], [100, 57]];

const MARKE = "weltkarteDorfplatz";

/** Versatz in Weltpixeln für ein Grundstück, oder null bei unbekanntem Index. */
function versatz(slotIndex) {
    if (!Number.isInteger(slotIndex) || !ALT[slotIndex] || !NEU[slotIndex]) return null;
    return {
        dx: (NEU[slotIndex][0] - ALT[slotIndex][0]) * KACHEL,
        dy: (NEU[slotIndex][1] - ALT[slotIndex][1]) * KACHEL,
    };
}

/** Verschiebt eine Liste. Gibt zurück, wie viele Einträge sich änderten. */
function verschiebeListe(liste) {
    if (!Array.isArray(liste)) return 0;
    let geaendert = 0;
    for (const e of liste) {
        if (!e || typeof e !== "object") continue;
        const v = versatz(e.slotIndex);
        if (!v) continue;
        const x = Number(e.x);
        const y = Number(e.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        e.x = x + v.dx;
        e.y = y + v.dy;
        geaendert++;
    }
    return geaendert;
}

function runWeltkarteMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);
    let staende = 0;
    let deko = 0;
    let tiere = 0;
    for (const [, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE]) continue;
        state[MARKE] = true;
        const d = verschiebeListe(state.decoPlacements);
        const t = verschiebeListe(state.petPlacements);
        if (d + t === 0) continue;
        deko += d;
        tiere += t;
        staende++;
        // Ein Tab, der den Neustart überlebt hat, schickt sonst die alten Lagen
        // wieder hoch — mit dem erhöhten Zähler lädt er neu (wie migrations/deko.js).
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        state.serverAenderungAb = state.stateVersion;
    }
    if (staende > 0) {
        console.log(`[Garden] Weltkarte Dorfplatz: ${deko} Deko / ${tiere} Tiere bei ${staende} Spielständen verschoben.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { staende, deko, tiere };
}

module.exports = { runWeltkarteMigration, MARKE, versatz };
