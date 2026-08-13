// engine/MapConfig.js
// Bleibt bei 64. Eine größere Kachel skaliert Pflanze UND Feld gleichmäßig — die
// Dichte bleibt exakt gleich, nur die Laufwege werden länger. Gegen das Gedränge
// wirken stattdessen zwei andere Hebel: die Kamera zoomt näher heran (WORLD_ZOOM in
// GameContainer) und die Pflanzen sind schmaler als ihre Kachel (widthScale in
// ARCHETYPE_PROFILES), sodass zwischen Nachbarn sichtbar Boden bleibt.
export const TILE_SIZE = 64;

export const MAP_CONFIG = {
    centerPathHeight: 12 * TILE_SIZE,
    plotSpacing: 4 * TILE_SIZE,

    territoryWidth: 28 * TILE_SIZE,
    territoryHeight: 33 * TILE_SIZE,

    // 15x15 dirt grid (7x7 + path + 7x7)
    baseDirtWidth: 15 * TILE_SIZE,
    baseDirtHeight: 15 * TILE_SIZE,
    // Center dirt bed inside 28-tile territory (6.5 tiles left/right).
    dirtOffsetX: 6.5 * TILE_SIZE,

    worldMargin: 8 * TILE_SIZE,
    expansionStep: TILE_SIZE,

    // Player movement
    playerSpeed: 5,        // pixels per frame (smooth)
    playerSize: 24,        // radius

    // Shop proximity
    shopInteractRadius: 220,
};
const BASE_ROWS = Math.round(MAP_CONFIG.baseDirtHeight / TILE_SIZE);

// ─── Steinfeld ───────────────────────────────────────────────────────────────
// Die Erweiterung liegt in Reihen, gezählt vom Acker weg (r = 1 ist die Reihe
// direkt daneben). Zwei davon sind Holzweg, der Rest ist Stein:
//
//   r = 1              Holzweg am Acker
//   r = 2 … 8          Stein   7 Reihen
//   r = 9              Holzweg quer
//   r = 10 … 16        Stein   7 Reihen
//
// Zusammen mit dem senkrechten Weg bei x = 7 ergibt das vier Blöcke à 7×7,
// also 196 Steinfelder. Bis v3.3 war EXTRA_ROWS = 15 und der Querweg lag auf
// r = 8 — der acker-nahe Block hatte dadurch nur 7×6, und es waren 182 statt
// 196. Wer das nachrechnet, kommt genau deshalb nicht auf vier gleiche Blöcke.
// Die Verschiebung bestehender Spielstände macht garden/migrations/plot.js.
export const STEIN_REIHEN = 16;
const EXTRA_ROWS = STEIN_REIHEN;
/** Senkrechter Holzweg — teilt Acker UND Steinfeld in linke und rechte Hälfte. */
export const WEG_SPALTE = 7;
/** Waagerechter Holzweg mitten im Acker: 15×15 sind 7×7, Weg, 7×7. */
export const ACKER_WEG = 7;
/** Reihe des Querwegs, vom Acker weg gezählt. */
export const MITTELWEG_REIHE = 9;
/** Zeilen-Index des Querwegs in Zellkoordinaten. */
const MITTELWEG_OBEN = -MITTELWEG_REIHE;                 // -9
const MITTELWEG_UNTEN = BASE_ROWS + MITTELWEG_REIHE - 1; // 23

export function generatePlotSlots(playerCount = 8) {
    const slots = [];
    const totalPlots = Math.max(1, Math.min(8, playerCount));
    const totalPlotsPerRow = Math.ceil(totalPlots / 2);
    const startX = MAP_CONFIG.worldMargin;
    const maxTerritoryHeight = MAP_CONFIG.territoryHeight;

    const centerPathTopY = MAP_CONFIG.worldMargin + maxTerritoryHeight;
    const centerPathBottomY = centerPathTopY + MAP_CONFIG.centerPathHeight;

    for (let i = 0; i < totalPlots; i++) {
        const isTopRow = i < totalPlotsPerRow;
        const colIndex = isTopRow ? i : i - totalPlotsPerRow;
        const x = startX + (colIndex * (MAP_CONFIG.territoryWidth + MAP_CONFIG.plotSpacing));
        const anchorY = isTopRow ? centerPathTopY : centerPathBottomY;

        slots.push({
            id: i + 1,
            x,
            anchorY,
            isTopRow,
            currentExpansions: 0,
            unlockedCells: [],
            owner: null,
            plants: {}, // key: "cellX_cellY" → plant instance
        });
    }

    const hasBottomRow = totalPlots > totalPlotsPerRow;
    const worldWidth = (MAP_CONFIG.worldMargin * 2) + (totalPlotsPerRow * MAP_CONFIG.territoryWidth) + (Math.max(0, totalPlotsPerRow - 1) * MAP_CONFIG.plotSpacing);
    const worldHeight = (MAP_CONFIG.worldMargin * 2) + (hasBottomRow ? maxTerritoryHeight * 2 + MAP_CONFIG.centerPathHeight : maxTerritoryHeight + MAP_CONFIG.centerPathHeight);

    return {
        slots,
        centerPathTopY,
        centerPathBottomY,
        worldWidth,
        worldHeight,
        centerX: worldWidth / 2,
        centerY: centerPathTopY + (MAP_CONFIG.centerPathHeight / 2),
    };
}

/**
 * Position von Schild und Briefkasten eines Grundstücks in Weltkoordinaten.
 * Renderer und Klickabfrage lesen beide von hier, damit die anklickbare Fläche
 * nicht neben dem gezeichneten Briefkasten liegt.
 */
export const SIGN_WIDTH = 180;
export const SIGN_HEIGHT = 36;
export const MAILBOX_WIDTH = 40;

export function getSignLayout(slot) {
    const centerX = slot.x + MAP_CONFIG.territoryWidth / 2;
    // Schild und Briefkasten stehen am WEG, nicht auf dem Grundstück.
    //
    // Vorher lagen sie innerhalb der Fläche, direkt an der Kante zum Weg — und weil
    // sie nach der Tiefensortierung gezeichnet werden, deckten sie jede Deko ab, die
    // dort stand. Auf dem Weg kann keine Deko liegen (die Platzprüfung lässt nur
    // Kacheln innerhalb des Grundstücks zu), damit ist die Überdeckung strukturell
    // ausgeschlossen statt nur unwahrscheinlicher gemacht.
    //
    // `anchorY` ist bei der oberen Reihe die UNTERkante des Grundstücks, bei der
    // unteren die Oberkante — der Weg liegt also jeweils auf der anderen Seite.
    const centerY = slot.isTopRow ? slot.anchorY + 16 : slot.anchorY - 52;
    return { centerX, centerY, w: SIGN_WIDTH, h: SIGN_HEIGHT };
}

/** Klick-/Trefferfläche des Briefkastens (großzügiger als das Bild). */
export function getMailboxHitArea(slot) {
    const { centerX, centerY, w, h } = getSignLayout(slot);
    const x = centerX + w / 2 + 20;
    const y = centerY + h / 2;
    return { x: x + MAILBOX_WIDTH / 2, y, radius: 46 };
}

function getUnlockedSet(slot) {
    return new Set(Array.isArray(slot?.unlockedCells) ? slot.unlockedCells : []);
}

function getBaseDirtBounds(slot) {
    const { baseDirtHeight, dirtOffsetX, territoryHeight } = MAP_CONFIG;
    const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
    const dirtX = slot.x + dirtOffsetX;
    const dirtY = slot.isTopRow
        ? slot.anchorY - baseDirtHeight - TILE_SIZE
        : drawY + TILE_SIZE;
    return { dirtX, dirtY };
}

// Get the world-space position of a dirt cell (top-left corner)
export function getDirtCellWorldPos(slot, cellX, cellY) {
    const { dirtX, dirtY } = getBaseDirtBounds(slot);

    return {
        x: dirtX + cellX * TILE_SIZE,
        y: dirtY + cellY * TILE_SIZE,
    };
}

// Get which dirt cell a world position falls into for a given slot (-1 if outside)
export function getHoveredCell(slot, worldX, worldY, pflanzen = null) {
    const { baseDirtWidth, baseDirtHeight } = MAP_CONFIG;
    const { dirtX, dirtY } = getBaseDirtBounds(slot);
    const unlocked = getUnlockedSet(slot);

    if (worldX < dirtX || worldX > dirtX + baseDirtWidth) return null;
    const cellX = Math.floor((worldX - dirtX) / TILE_SIZE);
    let candidateY = null;
    if (slot.isTopRow) {
        const topY = dirtY - EXTRA_ROWS * TILE_SIZE;
        if (worldY < topY || worldY > dirtY + baseDirtHeight) return null;
        candidateY = Math.floor((worldY - topY) / TILE_SIZE) - EXTRA_ROWS; // -16..14
    } else {
        const bottomY = dirtY + baseDirtHeight + EXTRA_ROWS * TILE_SIZE;
        if (worldY < dirtY || worldY > bottomY) return null;
        candidateY = Math.floor((worldY - dirtY) / TILE_SIZE); // 0..29
    }

    // ── Wege ─────────────────────────────────────────────────────────────────
    // Auf einem Weg lässt sich nichts pflanzen. Was dort trotzdem steht, muss man
    // aber ABRÄUMEN können — sonst liegt es unerreichbar für immer da.
    //
    // Genau das ist passiert: alte Spielstände hatten die Wegkacheln in der
    // Freigabeliste (die frühere Rückfall-Rechnung aus der reinen Reihen-Anzahl gab
    // ganze Reihen frei, Wege eingeschlossen), man konnte auf den Steg pflanzen, und
    // ein pauschales `return null` hat die Saat dort dann eingesperrt.
    //
    // Deshalb wird hier nicht mehr gefragt „ist das Acker?", sondern „darf hier etwas
    // Neues hin?" und „liegt hier schon etwas?" — zwei verschiedene Fragen.
    const key = `${cellX}_${candidateY}`;
    const aufWeg = cellX === WEG_SPALTE
        || istWegReihe(candidateY)
        || (candidateY >= 0 && candidateY < BASE_ROWS && candidateY === ACKER_WEG);
    if (aufWeg) {
        return pflanzen?.[key] ? { cellX, cellY: candidateY, nurRaeumen: true } : null;
    }

    if (candidateY >= 0 && candidateY < BASE_ROWS) return { cellX, cellY: candidateY };
    return unlocked.has(key) ? { cellX, cellY: candidateY } : null;
}

/**
 * Zellzeilen zählen je nach Grundstücksreihe anders: oben wachsen die Erweiterungen
 * nach oben (-1 … -16), unten nach unten (15 … 30). Erweiterung r ist oben -r und
 * unten 14+r. Wer beim Rejoin die Reihe wechselt, muss seine Felder umrechnen.
 *
 * Beides steht hier und nicht im GameContainer, damit die Zählweise an EINER Stelle
 * definiert ist — dieselbe Datei, die auch weiß, welche Zeilen Weg sind.
 */
export function istAndereReihe(cellY, zielIstObenreihe) {
    return zielIstObenreihe ? cellY >= BASE_ROWS : cellY < 0;
}

export function spiegleZeile(cellY, zielIstObenreihe) {
    return zielIstObenreihe ? -(cellY - (BASE_ROWS - 1)) : (BASE_ROWS - 1) - cellY;
}

/** Liegt diese Zellzeile auf einem der beiden Holzwege des Steinfelds? */
export function istWegReihe(cellY) {
    if (cellY < 0) return cellY === -1 || cellY === MITTELWEG_OBEN;
    if (cellY >= BASE_ROWS) return cellY === BASE_ROWS || cellY === MITTELWEG_UNTEN;
    return false;
}

export function getHoveredRock(slot, worldX, worldY, maxExpansions = 8) {
    const { baseDirtWidth, baseDirtHeight } = MAP_CONFIG;
    const { dirtX, dirtY } = getBaseDirtBounds(slot);
    const unlocked = getUnlockedSet(slot);
    if (Math.max(0, slot.currentExpansions || 0) >= maxExpansions) return null;
    if (worldX < dirtX || worldX > dirtX + baseDirtWidth) return null;

    const cellX = Math.floor((worldX - dirtX) / TILE_SIZE);
    if (cellX === 7) return null; // vertical wood path column
    let cellY;
    if (slot.isTopRow) {
        if (worldY < dirtY - EXTRA_ROWS * TILE_SIZE || worldY >= dirtY) return null;
        cellY = Math.floor((worldY - (dirtY - EXTRA_ROWS * TILE_SIZE)) / TILE_SIZE) - EXTRA_ROWS; // -16..-1
        if (cellY === -1) return null;  // separator between dirt and stones
        if (cellY === MITTELWEG_OBEN) return null;  // mid-stone horizontal path
    } else {
        const startY = dirtY + baseDirtHeight;
        const endY = startY + EXTRA_ROWS * TILE_SIZE;
        if (worldY < startY || worldY >= endY) return null;
        cellY = BASE_ROWS + Math.floor((worldY - startY) / TILE_SIZE); // 15..30
        if (cellY === BASE_ROWS) return null;      // separator between dirt and stones
        if (cellY === MITTELWEG_UNTEN) return null;  // mid-stone horizontal path
    }
    const key = `${cellX}_${cellY}`;
    if (unlocked.has(key)) return null;
    return { cellX, cellY, key };
}