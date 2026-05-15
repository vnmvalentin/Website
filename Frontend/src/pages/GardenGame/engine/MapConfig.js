// engine/MapConfig.js
export const TILE_SIZE = 64; // Slightly smaller for smoother feel

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
const EXTRA_ROWS = 15;

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
export function getHoveredCell(slot, worldX, worldY) {
    const { baseDirtWidth, baseDirtHeight } = MAP_CONFIG;
    const { dirtX, dirtY } = getBaseDirtBounds(slot);
    const unlocked = getUnlockedSet(slot);

    if (worldX < dirtX || worldX > dirtX + baseDirtWidth) return null;
    const cellX = Math.floor((worldX - dirtX) / TILE_SIZE);
    if (cellX === 7) return null; // vertical wood path column
    let candidateY = null;
    if (slot.isTopRow) {
        const topY = dirtY - EXTRA_ROWS * TILE_SIZE;
        if (worldY < topY || worldY > dirtY + baseDirtHeight) return null;
        candidateY = Math.floor((worldY - topY) / TILE_SIZE) - EXTRA_ROWS; // -15..14
    } else {
        const bottomY = dirtY + baseDirtHeight + EXTRA_ROWS * TILE_SIZE;
        if (worldY < dirtY || worldY > bottomY) return null;
        candidateY = Math.floor((worldY - dirtY) / TILE_SIZE); // 0..29
    }
    if (candidateY >= 0 && candidateY < BASE_ROWS) {
        if (candidateY === 7) return null; // horizontal wood path row
        return { cellX, cellY: candidateY };
    }
    const extraKey = `${cellX}_${candidateY}`;
    if (unlocked.has(extraKey)) return { cellX, cellY: candidateY };
    return null;
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
        cellY = Math.floor((worldY - (dirtY - EXTRA_ROWS * TILE_SIZE)) / TILE_SIZE) - EXTRA_ROWS; // -15..-1
        if (cellY === -1) return null;  // separator between dirt and stones
        if (cellY === -8) return null;  // mid-stone horizontal path
    } else {
        const startY = dirtY + baseDirtHeight;
        const endY = startY + EXTRA_ROWS * TILE_SIZE;
        if (worldY < startY || worldY >= endY) return null;
        cellY = BASE_ROWS + Math.floor((worldY - startY) / TILE_SIZE); // 15..29
        if (cellY === BASE_ROWS) return null;      // separator between dirt and stones
        if (cellY === BASE_ROWS + 7) return null;  // mid-stone horizontal path
    }
    const key = `${cellX}_${cellY}`;
    if (unlocked.has(key)) return null;
    return { cellX, cellY, key };
}