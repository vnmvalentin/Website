// engine/Renderer.js
import { MAP_CONFIG, TILE_SIZE } from './MapConfig';
import { getGrowthProgressForRender, isPlantReadyForRender, getPlantVisuals } from './PlantSystem';

const RARITY_COLORS = {
    COMMON:    "#94a3b8",
    UNCOMMON:  "#4ade80",
    RARE:      "#60a5fa",
    EPIC:      "#a855f7",
    LEGENDARY: "#f59e0b",
    MYTHIC:    "#ec4899",
};
const ATLAS_IMAGE_SRC = "/garden-assets/atlas/garden_atlas.png";
const ATLAS_MANIFEST_SRC = "/garden-assets/atlas/garden_atlas.json";
const TERRAIN_TILE_IMAGES = {
    grass: [
        "/garden-assets/structure/gras1.png",
        "/garden-assets/structure/gras2.png"
        
    ],
    field: ["/garden-assets/structure/acker.png"],
    rock: ["/garden-assets/structure/stein.png"],
};
const PATH_TILE_IMAGES = [
    "/garden-assets/structure/kiesweg1.png",
    "/garden-assets/structure/kiesweg2.png"
];
const WOOD_PATH_IMAGE = "/garden-assets/structure/wood.png";
const TALL_GRASS_TILE_IMAGES = [
    "/garden-assets/structure/hohes_gras1.png",
    "/garden-assets/structure/hohes_gras2.png"
];
const TERRAIN_FALLBACK_COLORS = {
    grass: "#22c55e",
    field: "#6b3410",
    rock: "#71717a",
};
const TOOL_IMAGE_BY_KEY = {
    pickaxe: "/garden-assets/tools/spitzhacke.png",
    shovel: "/garden-assets/tools/schaufel.png",
    pot: "/garden-assets/tools/topf.png",
    watering: "/garden-assets/tools/gieskanne.png",
    backpack: "/garden-assets/tools/rucksack.png",
};
const TOOL_EMOJI_BY_KEY = {
    pickaxe: "⛏️",
    shovel: "🪓",
    pot: "🪴",
    watering: "🪣",
    backpack: "🎒",
};
const DEFAULT_RENDER_PROFILE = {
    level: "high",
    particleScale: 1,
    simplifyPlantUi: false,
};
const MERGED_TILE_STRIDE = 2; // permanent 2x2 tile merge
const MAX_VISIBLE_FRUITS = 6;
const PLANT_CACHE_MAX = 400;

function lerpSize(a, b, t) {
    return a + (b - a) * t;
}
/** Pflanzen-Norm 0..1 (beim Setzen) entspricht später Größe 1..50 – skaliert sichtbares Wachstum. */
function visualScaleFromPlantNorm(norm) {
    if (norm == null || !Number.isFinite(norm)) return 0.65;
    const t = Math.max(0, Math.min(1, norm));
    return lerpSize(0.3, 1.12, t);
}
/** Früchte-Größe 1..50 sichtbar differenzieren. */
function visualScaleFromFruitSize(size1to50) {
    const s = Math.max(1, Math.min(50, Number(size1to50) || 1));
    return lerpSize(0.32, 1.02, (s - 1) / 49);
}

export default class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.frame = 0;
        this._groundPattern = null;
        this._imageCache = new Map();
        this._plantCache = new Map();
        this._atlasImage = null;
        this._atlasFrames = new Map();
        this._atlasLoaded = false;
        this._atlasLoadStarted = false;
        this._tileVariantCache = new Map();
        this._slotStaticCache = new Map();
        this._renderProfile = DEFAULT_RENDER_PROFILE;
        this._frameNow = Date.now();
        // Reusable scratch canvas for isolated tinted blits (multi-use fruits, held items).
        // We need an offscreen surface so source-atop maskings only affect the item's pixels,
        // not whatever background was already drawn underneath on the main canvas.
        this._tintScratch = document.createElement("canvas");
        this._tintScratch.width = 128;
        this._tintScratch.height = 128;
        this._tintScratchCtx = this._tintScratch.getContext("2d");
        this._loadAtlas();
    }

    draw(state, player) {
        this._frameNow = Date.now();
        const { ctx, canvas } = this;
        const {
            layout,
            areas,
            zoom = 1,
            selectedTool = null,
            petPlacements = [],
            decoPlacements = [],
            heldItem = null,
            weather = { type: "sun" },
            renderProfile = DEFAULT_RENDER_PROFILE,
            remotePlayers = [],
            localPlayerName = "",
            playerAppearance = {},
            playerBadge = null,
        } = state;
        this._renderProfile = renderProfile || DEFAULT_RENDER_PROFILE;
        this.frame++;

        // Background
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Camera follows player
        ctx.save();
        ctx.translate(Math.round(canvas.width / 2), Math.round(canvas.height / 2));
        ctx.scale(zoom, zoom);
        ctx.translate(Math.round(-player.x), Math.round(-player.y));

        // World border
        ctx.strokeStyle = "rgba(255,80,80,0.4)";
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, layout.worldWidth, layout.worldHeight);

        // Ground texture (cached pattern)
        this._drawGround(layout, player);

        this._drawCenterPath(layout, player);

        this.drawTerritories(layout, player, petPlacements, decoPlacements, state.harvestFlashes || []);
        this.drawHubAreas(areas, state.readyEggsCount);
        if (Array.isArray(remotePlayers) && remotePlayers.length > 0) {
            for (const rp of remotePlayers) {
                if (!rp || !Number.isFinite(rp.x) || !Number.isFinite(rp.y)) continue;
                this.drawRemotePlayer(rp);
            }
        }
        this.drawPlayer(player, selectedTool, heldItem, localPlayerName, playerAppearance, playerBadge);

        ctx.restore();
        // 1. ANPASSUNG: Player übergeben für Map-relativen Regen
        this._drawWeatherOverlay(weather, player); 
    }

    _drawGround(layout, player) {
        const { ctx, canvas } = this;
        const step = TILE_SIZE * MERGED_TILE_STRIDE;
        if (!this._groundPattern) {
            const patternCanvas = document.createElement("canvas");
            patternCanvas.width = TILE_SIZE * 2;
            patternCanvas.height = TILE_SIZE * 2;
            const pctx = patternCanvas.getContext("2d");
            pctx.fillStyle = "#166534";
            pctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
            pctx.fillStyle = "rgba(0,0,0,0.08)";
            pctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            this._groundPattern = ctx.createPattern(patternCanvas, "repeat");
        }

        ctx.fillStyle = "#166534";
        ctx.fillRect(0, 0, layout.worldWidth, layout.worldHeight);
        if (this._groundPattern) {
            ctx.fillStyle = this._groundPattern;
            ctx.fillRect(-canvas.width, -canvas.height, layout.worldWidth + canvas.width * 2, layout.worldHeight + canvas.height * 2);
        }

        const viewLeft = player.x - canvas.width / 2 - TILE_SIZE * 2;
        const viewRight = player.x + canvas.width / 2 + TILE_SIZE * 2;
        const viewTop = player.y - canvas.height / 2 - TILE_SIZE * 2;
        const viewBottom = player.y + canvas.height / 2 + TILE_SIZE * 2;
        const startX = Math.max(0, Math.floor(viewLeft / step) * step);
        const endX = Math.min(layout.worldWidth, Math.ceil(viewRight / step) * step);
        const startY = Math.max(0, Math.floor(viewTop / step) * step);
        const endY = Math.min(layout.worldHeight, Math.ceil(viewBottom / step) * step);

        // Tall grass texture for dark green ground areas (outside center path) — 1×1 tiles.
        for (let y = startY; y < endY; y += TILE_SIZE) {
            for (let x = startX; x < endX; x += TILE_SIZE) {
                const inCenterPath = y >= layout.centerPathTopY && y < layout.centerPathBottomY;
                if (inCenterPath) continue;
                this._drawTerrainTile("tallGrass", x, y, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE), 9991, TILE_SIZE);
            }
        }
    }

    _drawCenterPath(layout, player) {
        const { ctx, canvas } = this;
        const step = TILE_SIZE * MERGED_TILE_STRIDE;
        const pathTop = layout.centerPathTopY;
        const pathHeight = layout.centerPathBottomY - layout.centerPathTopY;
        const viewLeft = player.x - canvas.width / 2 - TILE_SIZE * 2;
        const viewRight = player.x + canvas.width / 2 + TILE_SIZE * 2;
        const startX = Math.max(0, Math.floor(viewLeft / step) * step);
        const endX = Math.min(layout.worldWidth, Math.ceil(viewRight / step) * step);

        for (let y = pathTop; y < pathTop + pathHeight; y += step) {
            for (let x = startX; x <= endX; x += step) {
                this._drawTerrainTile("path", x, y, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE), 4407, step);
            }
        }

        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        for (let x = startX; x <= endX; x += TILE_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, pathTop);
            ctx.lineTo(x, pathTop + pathHeight);
            ctx.stroke();
        }
    }

    // 1. ANPASSUNG: Player Objekt ergänzt für Parallax Scrolling
    _drawWeatherOverlay(weather, player) {
        const type = weather?.type || "sun";
        const intensity = Math.max(0, Math.min(1, Number.isFinite(weather?.intensity) ? weather.intensity : 1));
        const { ctx, canvas } = this;
        if (type === "sun" || intensity <= 0.01) return;

        // Offset des Spielers abziehen, damit Regen an der Map "klebt"
        const pxOffset = player ? player.x : 0;
        const pyOffset = player ? player.y : 0;

        ctx.save();
        if (type === "moonlight") {
            // 2. ANPASSUNG: Hellerer Hintergrund und Schein von oben rechts
            ctx.fillStyle = `rgba(15, 23, 42, ${0.4 * intensity})`; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const gradient = ctx.createRadialGradient(canvas.width, 0, 0, canvas.width, 0, canvas.width * 0.8);
            gradient.addColorStop(0, `rgba(186, 230, 253, ${0.2 * intensity})`);
            gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.restore();
            return;
        }

        if (type === "thunder") {
            ctx.fillStyle = `rgba(15, 23, 42, ${0.45 * intensity})`; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const particleScale = Math.max(0.2, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
            const boltCount = Math.max(1, Math.round(4 * particleScale));
            for (let b = 0; b < boltCount; b++) {
                const phase = (this.frame + b * 67) % 220;
                if (phase > 10) continue;
                
                const xRaw = ((this.frame * 13 + b * 191) % (canvas.width + 80)) - 40 - (pxOffset * 0.05); // Leichter Parallax für Blitze
                let x = ((xRaw % (canvas.width + 100)) + (canvas.width + 100)) % (canvas.width + 100) - 50;
                let y = -20;
                
                ctx.strokeStyle = `rgba(196,181,253,${0.6 + intensity * 0.4})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, y);
                
                while (y < canvas.height + 50) {
                    x += (Math.random() - 0.5) * 120;
                    y += (canvas.height / 6) + Math.random() * 40; 
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
                
                ctx.shadowBlur = 25;
                ctx.shadowColor = "rgba(196,181,253,0.8)";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
            return;
        }

        const particleScale = Math.max(0.15, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
        const baseCount = type === "snow" ? 90 : 140;
        const particleCount = Math.max(10, Math.round(baseCount * particleScale * (0.4 + intensity * 0.6)));
        for (let i = 0; i < particleCount; i++) {
            const seed = i * 97.13;
            const speed = type === "snow" ? (0.3 + (i % 7) * 0.05) : (0.9 + (i % 11) * 0.07);
            const drift = type === "snow" ? Math.sin(this.frame * 0.008 + seed) * 12 : Math.sin(this.frame * 0.02 + seed) * 2.5;
            
            // 1. ANPASSUNG: Player Offsets abziehen
            const yRaw = this.frame * speed * 2 + i * 37 - pyOffset;
            const xRaw = i * 53 + this.frame * (type === "snow" ? 0.15 : 0.45) + drift - pxOffset;
            
            // Sauberer positiver Modulo für flüssiges Wrappen über den Bildschirm
            const y = ((yRaw % (canvas.height + 40)) + (canvas.height + 40)) % (canvas.height + 40) - 20;
            const x = ((xRaw % (canvas.width + 20)) + (canvas.width + 20)) % (canvas.width + 20) - 10;
            
            ctx.strokeStyle = type === "snow"
                ? `rgba(255,255,255,${0.28 + intensity * 0.42})`
                : `rgba(167,243,255,${0.16 + intensity * 0.26})`;
            ctx.lineWidth = type === "snow" ? 2 : 1.4;
            ctx.beginPath();
            if (type === "snow") {
                ctx.moveTo(x - 1, y - 1);
                ctx.lineTo(x + 1, y + 1);
            } else {
                ctx.moveTo(x, y);
                ctx.lineTo(x - 3, y + 12);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    drawTerritories(layout, player, petPlacements = [], decoPlacements = [], harvestFlashes = []) {
        const { ctx } = this;
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const viewMargin = 200;
        const viewLeft = player.x - this.canvas.width / 2 - viewMargin;
        const viewRight = player.x + this.canvas.width / 2 + viewMargin;
        const viewTop = player.y - this.canvas.height / 2 - viewMargin;
        const viewBottom = player.y + this.canvas.height / 2 + viewMargin;

        layout.slots.forEach(slot => {
            const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
            const slotRight = slot.x + territoryWidth;
            const slotBottom = drawY + territoryHeight;
            const isVisible = slotRight >= viewLeft && slot.x <= viewRight && slotBottom >= viewTop && drawY <= viewBottom;
            if (!isVisible) return;

            const unlockedCells = Array.isArray(slot.unlockedCells) ? slot.unlockedCells : [];
            const staticLayer = this._getSlotStaticLayer(slot, drawY, unlockedCells);
            if (staticLayer) ctx.drawImage(staticLayer, slot.x, drawY);
            this._drawDecoForSlot(slot, drawY, decoPlacements, viewLeft, viewTop, viewRight, viewBottom);
            this._drawPlantsForSlot(slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth);
            if (harvestFlashes.length) this._drawHarvestFlashesForSlot(slot, drawY, dirtOffsetX, baseDirtHeight, harvestFlashes);

            const signX = slot.x + (territoryWidth / 2);
            const signY = slot.isTopRow ? slot.anchorY - 52 : slot.anchorY + 8;
            this._drawPetsForSlot(slot, drawY, petPlacements);
            this._drawSign(slot, signX, signY);
        });
    }

    _drawHarvestFlashesForSlot(slot, drawY, dirtOffsetX, baseDirtHeight, harvestFlashes) {
        return;
    }

    _drawDecoForSlot(slot, drawY, decoPlacements, viewLeft, viewTop, viewRight, viewBottom) {
        if (!Array.isArray(decoPlacements) || decoPlacements.length === 0) return;
        const slotDeco = decoPlacements.filter((deco) => deco?.slotIndex === slot.id - 1);
        if (!slotDeco.length) return;
        for (const deco of slotDeco) {
            const x = Number(deco?.x); // center of bottom-left anchor tile
            const y = Number(deco?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const dw = deco.width || 1;
            const dh = deco.height || 1;
            // Shift visual center: right by (dw-1)/2 tiles, up by (dh-1)/2 tiles
            const visualX = x + ((dw - 1) * TILE_SIZE) / 2;
            const visualY = y - ((dh - 1) * TILE_SIZE) / 2;
            const drawSize = TILE_SIZE * Math.max(dw, dh) * 0.9;
            if (visualX + drawSize < viewLeft || visualX - drawSize > viewRight ||
                visualY + drawSize < viewTop  || visualY - drawSize > viewBottom) continue;
            this._drawImageOrEmojiContain(deco.image, deco.emoji || "🪴", visualX, visualY, drawSize);
        }
    }

    _getSlotStaticLayer(slot, drawY, unlockedCells) {
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const dirtCols = Math.round(baseDirtWidth / TILE_SIZE);
        const dirtRows = Math.round(baseDirtHeight / TILE_SIZE);
        const EXTRA_ROWS = 15;
        const normalizedUnlocked = [...new Set(unlockedCells)].sort().join("|");
        const cacheKey = `${slot.owner || ""}:${normalizedUnlocked}:${slot.isTopRow ? 1 : 0}`;
        const cached = this._slotStaticCache.get(slot.id);
        if (cached?.cacheKey === cacheKey) return cached.canvas;

        const layer = document.createElement("canvas");
        layer.width = territoryWidth;
        layer.height = territoryHeight;
        const lctx = layer.getContext("2d");
        if (!lctx) return null;

        lctx.save();
        lctx.translate(-slot.x, -drawY);

        // Territory grass tiles
        for (let gy = drawY; gy < drawY + territoryHeight; gy += TILE_SIZE) {
            for (let gx = slot.x; gx < slot.x + territoryWidth; gx += TILE_SIZE) {
                const tileX = Math.floor((gx - slot.x) / TILE_SIZE);
                const tileY = Math.floor((gy - drawY) / TILE_SIZE);
                this._drawTerrainTile("grass", gx, gy, tileX, tileY, slot.id, TILE_SIZE, lctx);
            }
        }

        // Border
        lctx.strokeStyle = slot.owner ? "#86efac" : "#166534";
        lctx.lineWidth = slot.owner ? 3 : 2;
        lctx.strokeRect(slot.x, drawY, territoryWidth, territoryHeight);

        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const unlockedSet = new Set(unlockedCells);

        for (let cy = 0; cy < dirtRows; cy++) {
            for (let cx = 0; cx < dirtCols; cx++) {
                const cellX = dirtX + cx * TILE_SIZE;
                const cellY = dirtY + cy * TILE_SIZE;
                if (cx === 7 || cy === 7) {
                    const woodImg = this._getImage(WOOD_PATH_IMAGE);
                    if (woodImg) {
                        lctx.drawImage(woodImg, cellX, cellY, TILE_SIZE, TILE_SIZE);
                    } else {
                        lctx.fillStyle = "#92400e";
                        lctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    this._drawTerrainTile("field", cellX + 1, cellY + 1, cx, cy, slot.id, TILE_SIZE - 2, lctx);
                    lctx.strokeStyle = "rgba(0,0,0,0.3)";
                    lctx.lineWidth = 1;
                    lctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        for (let cx = 0; cx < dirtCols; cx++) {
            for (let r = 1; r <= EXTRA_ROWS; r++) {
                const cellX = dirtX + cx * TILE_SIZE;
                const isTop = slot.isTopRow;
                const cellY = isTop ? (dirtY - r * TILE_SIZE) : (dirtY + baseDirtHeight + (r - 1) * TILE_SIZE);
                const logicalY = isTop ? -r : (dirtRows + r - 1);
                const key = `${cx}_${logicalY}`;
                if (cx === 7 || r === 1 || r === 8) {
                    const woodImg = this._getImage(WOOD_PATH_IMAGE);
                    if (woodImg) {
                        lctx.drawImage(woodImg, cellX, cellY, TILE_SIZE, TILE_SIZE);
                    } else {
                        lctx.fillStyle = "#92400e";
                        lctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    this._drawExpansionCell(cellX, cellY, null, unlockedSet.has(key), cx === 0 && r === 1, cx, logicalY, slot.id, lctx);
                }
            }
        }

        const expandedY = slot.isTopRow ? (dirtY - EXTRA_ROWS * TILE_SIZE) : dirtY;
        const expandedH = baseDirtHeight + EXTRA_ROWS * TILE_SIZE;
        lctx.strokeStyle = "rgba(15,23,42,0.8)";
        lctx.lineWidth = 2;
        lctx.strokeRect(dirtX, expandedY, baseDirtWidth, expandedH);

        lctx.restore();
        this._slotStaticCache.set(slot.id, { cacheKey, canvas: layer });
        return layer;
    }

    _drawPlantsForSlot(slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth) {
        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const dirtyRight = dirtX + baseDirtWidth;
        const dirtyTop = slot.isTopRow ? dirtY - 15 * TILE_SIZE : dirtY;
        const dirtyBottom = slot.isTopRow ? (dirtY + baseDirtHeight) : (dirtY + baseDirtHeight + 15 * TILE_SIZE);
        if (dirtyRight < viewLeft || dirtX > viewRight || dirtyBottom < viewTop || dirtyTop > viewBottom) return;

        // 2. ANPASSUNG: Y-Sortierung, damit untere Pflanzen die oberen verdecken!
        const plantsArray = Object.entries(slot.plants || {})
            .map(([key, plant]) => ({ key, plant, cy: Number(key.split("_")[1]) }))
            .filter(item => Number.isInteger(item.cy) && item.plant)
            .sort((a, b) => a.cy - b.cy);

        for (const { key, plant } of plantsArray) {
            const cx = Number(key.split("_")[0]);
            const cy = Number(key.split("_")[1]);
            const cellX = dirtX + cx * TILE_SIZE;
            const cellY = dirtY + cy * TILE_SIZE;
            if (cellX + TILE_SIZE < viewLeft || cellX > viewRight || cellY + TILE_SIZE < viewTop || cellY > viewBottom) continue;
            this._drawPlant(plant, cellX, cellY, `s${slot.id}_${key}`);
        }
    }

    _drawPetsForSlot(slot, drawY, petPlacements) {
        const { ctx, frame } = this;
        const pets = Array.isArray(petPlacements)
            ? petPlacements.filter((pet) => pet?.slotIndex === slot.id - 1)
            : [];
        if (!pets.length) return;
        
        const bob = Math.sin(frame * 0.08) * 2;
        
        for (const pet of pets) {
            const x = Number.isFinite(pet.x) ? pet.x : slot.x + MAP_CONFIG.territoryWidth / 2;
            const y = Number.isFinite(pet.y) ? pet.y : drawY + MAP_CONFIG.territoryHeight / 2;
            const facingRight = pet.facingRight !== false;

            // Schatten (nicht spiegeln)
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath();
            ctx.ellipse(x, y + 14, 12, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.translate(x, y + bob);
            ctx.scale(facingRight ? 1 : -1, 1);

            if (pet.image) {
                // Einfach Contain anhängen!
                this._drawImageOrEmojiContain(pet.image, pet.emoji || "🐾", 0, 0, TILE_SIZE * 0.62);
            } else {
                ctx.font = "28px serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(pet.emoji || "🐾", 0, 0);
            }

            ctx.restore();
        }
    }

    _drawExpansionCell(cellX, cellY, plant, unlocked, isFirstInRow, logicalX, logicalY, slotId, targetCtx = this.ctx) {
        const ctx = targetCtx;
        const { frame } = this;
        if (unlocked) {
            this._drawTerrainTile("field", cellX + 1, cellY + 1, logicalX, logicalY, slotId, TILE_SIZE - 2, ctx);
            if (plant) this._drawPlant(plant, cellX, cellY, `ex${slotId}_${logicalX}_${logicalY}`);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08);
        this._drawTerrainTile("rock", cellX + 1, cellY + 1, logicalX, logicalY, slotId, TILE_SIZE - 2, ctx);
        ctx.fillStyle = `rgba(30,41,59,${0.2 + pulse * 0.18})`;
        ctx.fillRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
        if (isFirstInRow) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "bold 18px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("⛏️", cellX + TILE_SIZE / 2, cellY + TILE_SIZE / 2);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
        }
    }
    _getPlantHash(plant) {
        const now = this._frameNow;
        const progress = Math.floor(getGrowthProgressForRender(plant, now) * 20);
        const fr = plant.fruitSlots?.filter((s) => (s?.readyAt || 0) <= now).length ?? 0;
        const ft = plant.fruitSlots?.length ?? 0;
        return `${plant?.seedId}_${plant?.stage}_${progress}_${fr}_${ft}_${plant?.statusEffect ?? ""}_${plant?.specialType || ""}`;
    }

    /**
     * Zeichnet eine Pflanze in Kachelkoordinaten (0..TILE); für Offscreen-Cache.
     * Kein shadowBlur / kein Puls-Rand (nur in _drawPlant auf Main-Canvas).
     */
    _renderPlantBodyLocal(plant, cellX, cellY, now, simplifyPlantUi) {
        const progress = getGrowthProgressForRender(plant, now);
        const ready = isPlantReadyForRender(plant, now);
        const rarityColor = RARITY_COLORS[plant.rarity] || "#94a3b8";
        const visuals = {
            ...getPlantVisuals(plant.seedId, plant.singleUse),
            ...(plant || {}),
        };

        const drawBaseX = cellX + TILE_SIZE / 2;
        const drawBaseY = cellY + TILE_SIZE;
        const drawCenterX = drawBaseX + TILE_SIZE / 2;
        const drawBottomY = drawBaseY + TILE_SIZE * 0.95;

        const drawWithAspect = (src, emoji, sizeScale) => {
            const m = TILE_SIZE * sizeScale;
            const img = this._getImage(src);
            if (img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                const scale = m / Math.max(nw, nh);
                const dw = nw * scale;
                const dh = nh * scale;
                this.ctx.drawImage(img, drawCenterX - dw / 2, drawBottomY - dh, dw, dh);
            } else {
                this.ctx.font = `${Math.max(12, Math.floor(m))}px serif`;
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "bottom";
                this.ctx.fillText(emoji || "🌱", drawCenterX, drawBottomY);
            }
        };

        // Single-use: full plant body. Multi-use: structure only (fruits drawn dynamically in _drawPlant).
        if (plant.singleUse) {
            if (progress < 0.2) {
                drawWithAspect(visuals.plantedSeedImage, "🌱", 0.45);
            } else {
                const growthPhase = Math.max(0, Math.min(1, (progress - 0.2) / 0.8));
                const normScale = visualScaleFromPlantNorm(plant.norm);
                const sizeScale = (0.35 + growthPhase * 0.9) * normScale;
                drawWithAspect(visuals.growthImage, plant.emoji, sizeScale);
            }
        } else {
            const structureProgress = plant.structureGrowthMs
                ? Math.max(0, Math.min(1, (now - (plant.plantedAt || now)) / plant.structureGrowthMs))
                : 1;
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);

            if (inStructure && structureProgress < 0.2) {
                drawWithAspect(visuals.plantedSeedImage, "🌱", 0.45);
            } else {
                const structurePhase = inStructure
                    ? Math.max(0, Math.min(1, (structureProgress - 0.2) / 0.8))
                    : 1;
                const sizeScale = (0.45 + structurePhase * 0.8);
                drawWithAspect(visuals.structureImage || visuals.growthImage, plant.emoji, sizeScale);
            }
        }

        // Tint overlay baked into cache (gold / rainbow / weather effect).
        // Only baked for single-use plants — multi-use structures stay neutral and
        // the overlay is applied per-fruit in _drawPlant (only the fruit gets tinted, not the structure).
        if (!simplifyPlantUi && plant.singleUse) {
            const effect = plant?.statusEffect || null;
            const specialName = plant?.specialType || plant?.specialData?.name || null;
            const overlay = this._resolveItemOverlay(effect, specialName);
            if (overlay) {
                // Tint the plant pixels we just drew. Use the full cache canvas extents
                // so the gradient (rainbow) covers the whole plant area.
                this._drawTintOverlay(this.ctx, overlay, 0, 0, TILE_SIZE * 2, TILE_SIZE * 2);
            }
        }

        if (!ready && !simplifyPlantUi) {
            const barW = TILE_SIZE - 8;
            const barH = 4;
            const barX = drawBaseX + 4;
            const barY = drawBaseY + TILE_SIZE - 8;
            this.ctx.fillStyle = "rgba(0,0,0,0.5)";
            this.ctx.fillRect(barX, barY, barW, barH);
            this.ctx.fillStyle = rarityColor;
            this.ctx.fillRect(barX, barY, barW * progress, barH);
        }
    }

    _drawPlant(plant, cellX, cellY, plantCacheKey) {
        const simplifyPlantUi = Boolean(this._renderProfile?.simplifyPlantUi);
        const now = this._frameNow;
        const keyBase = plantCacheKey != null && plantCacheKey !== "" ? String(plantCacheKey) : `g${cellX}_${cellY}`;
        const fullKey = `${keyBase}|${this._getPlantHash(plant)}`;

        if (isPlantReadyForRender(plant, now) && !simplifyPlantUi) {
            const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.08);
            this.ctx.save();
            this.ctx.strokeStyle = RARITY_COLORS[plant.rarity] || "#94a3b8";
            this.ctx.lineWidth = 1.5 + pulse * 2;
            this.ctx.strokeRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.fillStyle = `${RARITY_COLORS[plant.rarity] || "#94a3b8"}18`;
            this.ctx.fillRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.restore();
        }

        // Structure canvas (cached; fruits drawn dynamically below)
        let entry = this._plantCache.get(fullKey);
        if (!entry) {
            if (this._plantCache.size > PLANT_CACHE_MAX) this._plantCache.clear();
            const oc = document.createElement("canvas");
            oc.width = TILE_SIZE * 2; oc.height = TILE_SIZE * 2;
            const octx = oc.getContext("2d");
            if (octx) {
                const prev = this.ctx;
                this.ctx = octx;
                try {
                    this._renderPlantBodyLocal(plant, 0, 0, now, simplifyPlantUi);
                } finally {
                    this.ctx = prev;
                }
            }
            entry = { canvas: oc };
            this._plantCache.set(fullKey, entry);
        }

        const effect = plant?.statusEffect || null;

        // 1. Draw structure
        //    Single-use: tint already baked into cache (no per-frame filter work).
        //    Multi-use: structure drawn plain; per-fruit overlays applied below.
        this.ctx.drawImage(entry.canvas, cellX - TILE_SIZE / 2, cellY - TILE_SIZE);

        // 2. For multi-use: draw each fruit dynamically with weather + per-slot special effect
        if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
            if (!inStructure && plant.fruitSlots.length > 0) {
                const visuals = getPlantVisuals(plant.seedId, plant.singleUse);
                const slotCount = plant.fruitSlots.length;
                const cycle = Math.max(1, plant.fruitCycleMs || 60000);
                const maxSlotsToDraw = simplifyPlantUi ? Math.min(2, slotCount) : Math.min(MAX_VISIBLE_FRUITS, slotCount);
                const drawCenterX = cellX + TILE_SIZE / 2;
                const drawBottomY = cellY + TILE_SIZE * 0.95;
                const img = this._getImage(visuals.fruitImage);

                for (let i = 0; i < maxSlotsToDraw; i++) {
                    const slot = plant.fruitSlots[i];
                    const angle = (Math.PI * 2 * i) / slotCount - Math.PI / 2;
                    const radius = TILE_SIZE * 0.35;
                    const fx = drawCenterX + Math.cos(angle) * radius;
                    const fy = drawBottomY - (TILE_SIZE * 0.7) + Math.sin(angle) * radius;

                    const slotProgress = Math.max(0, Math.min(1, 1 - ((slot.readyAt || now) - now) / cycle));
                    const sizeScaleFruit = visualScaleFromFruitSize(slot.size);
                    const fruitSize = TILE_SIZE * (0.12 + slotProgress * 0.4) * sizeScaleFruit;

                    // Resolve overlay once per fruit (no filter / no shadowBlur)
                    const fruitSpecial = (!simplifyPlantUi && slot.specialType) || null;
                    const overlay = simplifyPlantUi ? null : this._resolveItemOverlay(effect, fruitSpecial);

                    if (img) {
                        const nw = Math.max(1, img.naturalWidth || img.width);
                        const nh = Math.max(1, img.naturalHeight || img.height);
                        const scale = fruitSize / Math.max(nw, nh);
                        const dw = nw * scale;
                        const dh = nh * scale;
                        const dx = fx - dw / 2;
                        const dy = fy - dh / 2;
                        if (overlay) {
                            this._drawTintedImage(img, dx, dy, dw, dh, overlay);
                        } else {
                            this.ctx.drawImage(img, dx, dy, dw, dh);
                        }
                    } else {
                        this.ctx.save();
                        this.ctx.font = `${Math.floor(fruitSize)}px serif`;
                        this.ctx.textAlign = "center";
                        this.ctx.textBaseline = "middle";
                        this.ctx.fillText(plant.emoji, fx, fy);
                        this.ctx.restore();
                    }
                }
            }
        }
    }

    /**
     * Draw an image with a tint overlay applied — using a scratch offscreen canvas
     * so the source-atop composite only affects the image's own pixels, not the
     * background already drawn on the main canvas.
     *
     * Used for multi-use fruits and held items, where the plant cache can't bake
     * the tint in advance. The scratch canvas is reused across calls (no allocation).
     */
    _drawTintedImage(img, dx, dy, dw, dh, overlay) {
        if (!img) return;
        if (!overlay) {
            this.ctx.drawImage(img, dx, dy, dw, dh);
            return;
        }
        const sw = Math.max(1, Math.ceil(dw));
        const sh = Math.max(1, Math.ceil(dh));
        // Grow scratch canvas if the item is larger than current scratch size
        if (this._tintScratch.width < sw || this._tintScratch.height < sh) {
            this._tintScratch.width = Math.max(this._tintScratch.width, sw, 128);
            this._tintScratch.height = Math.max(this._tintScratch.height, sh, 128);
        }
        const sctx = this._tintScratchCtx;
        // Clear only the area we'll use
        sctx.clearRect(0, 0, sw, sh);
        // Draw image into scratch
        sctx.drawImage(img, 0, 0, sw, sh);
        // Apply tint via source-atop — only image pixels get tinted (scratch bg is transparent)
        sctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            sctx.fillStyle = overlay.color;
            sctx.fillRect(0, 0, sw, sh);
        } else if (overlay.kind === "rainbow") {
            const grad = sctx.createLinearGradient(0, 0, 0, sh);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            sctx.fillStyle = grad;
            sctx.fillRect(0, 0, sw, sh);
        }
        sctx.globalCompositeOperation = "source-over";
        // Blit the tinted image back to main canvas
        this.ctx.drawImage(this._tintScratch, 0, 0, sw, sh, dx, dy, dw, dh);
    }

    /**
     * Resolve which tint overlay to apply for an item.
     * Returns a descriptor consumed by _drawTintOverlay/_drawTintedImage, or null if no overlay needed.
     *
     * Performance note:
     * The previous implementation used ctx.filter (sepia/saturate/hue-rotate) plus shadowBlur,
     * which is extremely expensive when applied per-plant per-frame on Canvas 2D.
     * This new approach replaces those filters with a single masked composite pass, which
     * the browser handles in a single GPU blit and which can be baked into the plant cache.
     */
    _resolveItemOverlay(effect, specialName) {
        // Special types take priority over weather
        if (specialName === "Golden") {
            return { kind: "solid", color: "rgba(250, 204, 21, 0.55)" };
        }
        if (specialName === "Rainbow") {
            return { kind: "rainbow" };
        }
        if (effect === "frozen")  return { kind: "solid", color: "rgba(186, 230, 253, 0.42)" };
        if (effect === "wet")     return { kind: "solid", color: "rgba(56, 189, 248, 0.32)" };
        if (effect === "charged") return { kind: "solid", color: "rgba(196, 181, 253, 0.38)" };
        if (effect === "moonlit") return { kind: "solid", color: "rgba(129, 140, 248, 0.32)" };
        return null;
    }

    /**
     * Apply a single-pass tinted overlay onto already-drawn pixels in the given rect.
     * Uses globalCompositeOperation = "source-atop" so only the visible pixels (the plant)
     * get tinted — transparent areas stay transparent. The clip() restricts the operation
     * to the given rect so neighboring already-drawn pixels are unaffected.
     *
     * This replaces ctx.filter + shadowBlur entirely. One drawRect/gradient pass per plant.
     */
    _drawTintOverlay(ctx, overlay, x, y, w, h) {
        if (!overlay) return;
        ctx.save();
        // Clip ensures source-atop only tints the rect we're drawing into,
        // not any previously-drawn pixels that happen to lie elsewhere.
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            ctx.fillStyle = overlay.color;
            ctx.fillRect(x, y, w, h);
        } else if (overlay.kind === "rainbow") {
            // Compress gradient to the lower 70% of the tile where the plant sprite actually lives
            const gradStart = y + h * 0.25;
            const gradEnd   = y + h * 0.95;
            const grad = ctx.createLinearGradient(0, gradStart, 0, gradEnd);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
    }

    _getTileVariantIndex(kind, x, y, slotSeed, variantCount) {
        if (variantCount <= 1) return 0;
        const cacheKey = `${kind}:${slotSeed}:${x}:${y}`;
        const cached = this._tileVariantCache.get(cacheKey);
        if (cached !== undefined) return cached;

        // Patch-level hash (groups of ~4 tiles) → determines dominant variant in a patch
        const px = Math.floor(x / 4);
        const py = Math.floor(y / 4);
        let hp = (Math.imul((px + 7) | 0, 374761393) ^ Math.imul((py + 13) | 0, 668265263) ^ Math.imul((slotSeed + 23) | 0, 1274126177)) | 0;
        hp ^= hp >>> 13;
        hp = Math.imul(hp, 1274126177);
        hp ^= hp >>> 16;
        const patchBase = Math.abs(hp) % variantCount;

        // Per-tile noise decides if this tile deviates from its patch (20% chance)
        let ht = (Math.imul((x + 11) | 0, 374761393) ^ Math.imul((y + 17) | 0, 668265263)) | 0;
        ht ^= ht >>> 13;
        ht = Math.imul(ht, 1274126177);
        const tileNoise = (Math.abs(ht) & 0xff) / 255.0;

        const index = tileNoise < 0.2 ? (patchBase + 1) % variantCount : patchBase;
        this._tileVariantCache.set(cacheKey, index);
        return index;
    }

    _drawTerrainTile(kind, x, y, logicalX, logicalY, slotId, size = TILE_SIZE, targetCtx = this.ctx) {
        const variants = kind === "path"
            ? PATH_TILE_IMAGES
            : kind === "tallGrass"
                ? TALL_GRASS_TILE_IMAGES
                : (TERRAIN_TILE_IMAGES[kind] || []);
        const variantCount = variants.length || 1;
        const variantIdx = this._getTileVariantIndex(kind, logicalX, logicalY, slotId, variantCount);
        const src = variants[variantIdx] || null;
        const img = this._getImage(src);
        if (img) {
            targetCtx.drawImage(img, x, y, size, size);
            return;
        }
        targetCtx.fillStyle = TERRAIN_FALLBACK_COLORS[kind] || (kind === "path" ? "#1e293b" : (kind === "tallGrass" ? "#14532d" : "#64748b"));
        targetCtx.fillRect(x, y, size, size);
    }

    _getImage(src) {
        if (!src) return null;
        const cached = this._imageCache.get(src);
        if (cached) return cached.status === "ready" ? cached.img : null;
        const img = new Image();
        const entry = { status: "loading", img };
        this._imageCache.set(src, entry);
        img.onload = () => {
            entry.status = "ready";
            this._slotStaticCache.clear();
            this._plantCache.clear();
        };
        img.onerror = () => { entry.status = "error"; };
        img.src = src;
        return null;
    }

    _loadAtlas() {
        if (this._atlasLoadStarted) return;
        this._atlasLoadStarted = true;
        fetch(ATLAS_MANIFEST_SRC)
            .then((res) => (res.ok ? res.json() : null))
            .then((manifest) => {
                const frames = manifest?.frames && typeof manifest.frames === "object" ? manifest.frames : null;
                if (!frames) return;
                const atlas = new Image();
                atlas.onload = () => {
                    this._atlasImage = atlas;
                    this._atlasFrames.clear();
                    for (const [key, frame] of Object.entries(frames)) {
                        const x = Number(frame?.x);
                        const y = Number(frame?.y);
                        const w = Number(frame?.w);
                        const h = Number(frame?.h);
                        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
                        this._atlasFrames.set(key, { x, y, w, h });
                    }
                    this._atlasLoaded = this._atlasFrames.size > 0;
                };
                atlas.onerror = () => {
                    this._atlasLoaded = false;
                    this._atlasImage = null;
                };
                atlas.src = manifest?.image || ATLAS_IMAGE_SRC;
            })
            .catch(() => {
                this._atlasLoaded = false;
                this._atlasImage = null;
            });
    }

    _drawFromAtlas(src, centerX, centerY, size) {
        if (!this._atlasLoaded || !this._atlasImage || !src) return false;
        const frame = this._atlasFrames.get(src);
        if (!frame) return false;
        const { ctx } = this;
        ctx.drawImage(
            this._atlasImage,
            frame.x, frame.y, frame.w, frame.h,
            centerX - size / 2, centerY - size / 2, size, size
        );
        return true;
    }

    _drawImageOrEmoji(src, emoji, centerX, centerY, size) {
        const { ctx } = this;
        if (this._drawFromAtlas(src, centerX, centerY, size)) return;
        
        // 1. FIX: Bildladen anstoßen BEVOR wir den Lade-Status abfragen
        const img = this._getImage(src);
        
        const cacheEntry = this._imageCache.get(src);
        if (cacheEntry && cacheEntry.status === "loading") {
            return; // Gar nichts zeichnen, während das Bild lädt -> Verhindert Emoji-Flash!
        }

        if (img) {
            ctx.drawImage(img, centerX - size / 2, centerY - size / 2, size, size);
            return;
        }
        
        ctx.font = `${Math.max(12, Math.floor(size))}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji || "🌱", centerX, centerY);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

    /** Wie _drawImageOrEmoji, aber Seitenverhältnis beibehalten (z. B. Hände / Shop-Icons). */
    _drawImageOrEmojiContain(src, emoji, centerX, centerY, maxBox) {
        const { ctx } = this;
        const m = maxBox;
        if (this._atlasLoaded && this._atlasImage && src) {
            const frame = this._atlasFrames.get(src);
            if (frame) {
                const ar = frame.w / frame.h;
                let dw = m;
                let dh = m;
                if (ar > 1) dh = m / ar;
                else dw = m * ar;
                ctx.drawImage(
                    this._atlasImage,
                    frame.x, frame.y, frame.w, frame.h,
                    centerX - dw / 2, centerY - dh / 2, dw, dh
                );
                return;
            }
        }
        
        // 1. FIX: Auch hier das Bild zuerst anfragen
        const img = this._getImage(src);

        const cacheEntry = this._imageCache.get(src);
        if (cacheEntry && cacheEntry.status === "loading") {
            return; 
        }

        if (img) {
            const nw = Math.max(1, img.naturalWidth || img.width);
            const nh = Math.max(1, img.naturalHeight || img.height);
            const sc = Math.min(m / nw, m / nh);
            const dw = nw * sc;
            const dh = nh * sc;
            ctx.drawImage(img, centerX - dw / 2, centerY - dh / 2, dw, dh);
            return;
        }
        
        ctx.font = `${Math.max(12, Math.floor(m * 0.9))}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji || "🌱", centerX, centerY);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

    _drawSign(slot, centerX, centerY) {
        const { ctx } = this;
        const w = 180; const h = 36;
        ctx.fillStyle = "#92400e";
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(centerX - w / 2, centerY, w, h, 6);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = slot.owner ? `🏠 ${slot.owner}` : "📋 Zu verkaufen";
        ctx.fillText(label, centerX, centerY + h / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        // Draw Mailbox
        if (slot.owner) {
            const mailboxImg = this._getImage("/garden-assets/world/mailbox.png");
            if (mailboxImg) {
                // Preserve aspect ratio
                const imgRatio = mailboxImg.width / mailboxImg.height;
                const mbWidth = 40;
                const mbHeight = mbWidth / imgRatio;
                const mbX = centerX + w / 2 + 20;
                const mbY = centerY + h / 2 - mbHeight + 10;
                ctx.drawImage(mailboxImg, mbX, mbY, mbWidth, mbHeight);
                
                // Draw notification indicator if there's mail
                if (slot.hasMail) {
                    ctx.fillStyle = "#ef4444";
                    ctx.beginPath();
                    ctx.arc(mbX + mbWidth - 5, mbY + 5, 6, 0, Math.PI * 2);
                    ctx.fill();
                }
            
                
            }
        }
    }

    drawHubAreas(areas, readyEggsCount = 0) { // readyEggsCount als Parameter hinzufügen
        if (!areas) return;
        this._drawAreaBuilding(areas.seedShop, "#2563eb", "🌱", "Samen");
        this._drawAreaBuilding(areas.toolShop, "#9333ea", "🛠️", "Tools");
        this._drawAreaBuilding(areas.eggShop, "#0d9488", "🥚", "Eier");
        this._drawAreaBuilding(areas.decoShop, "#db2777", "🪴", "Deko");
        this._drawAreaBuilding(areas.incubator, "#14b8a6", "🧪", "Inkubator", readyEggsCount); // Hier weitergeben
        this._drawAreaBuilding(areas.market, "#ea580c", "💰", "Verkauf");
        this._drawAreaBuilding(areas.petMarket, "#b45309", "🐾", "Tier-Verkauf");
    }

    _drawAreaBuilding(area, color, icon, label, readyEggsCount = 0) {
        if (!area) return;
        const { ctx, frame } = this;
        const image = this._getImage(area.image);
        
        const isIncubator = area.type === "incubator";
        const isPetMarket = area.type === "petMarket";
        const maxW = isIncubator ? 100 : isPetMarket ? 250 : 370;
        const maxH = isIncubator ? 80 : isPetMarket ? 200 : 300;

        if (image) {
            const naturalW = Math.max(1, image.naturalWidth || image.width || maxW);
            const naturalH = Math.max(1, image.naturalHeight || image.height || maxH);
            const scale = Math.min(maxW / naturalW, maxH / naturalH);
            const drawW = Math.round(naturalW * scale);
            const drawH = Math.round(naturalH * scale);
            ctx.drawImage(image, area.x - drawW / 2, area.y - drawH / 2, drawW, drawH);
            return;
        }
        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.05);
        ctx.fillStyle = color;
        ctx.beginPath();
        
        const boxW = isIncubator ? 200 : isPetMarket ? 260 : 375;
        const boxH = isIncubator ? 140 : isPetMarket ? 185 : 264;
        const roofY = isIncubator ? 120 : isPetMarket ? 150 : 225;
        const textY = isIncubator ? -6 : isPetMarket ? -8 : -12;

        ctx.roundRect(area.x - boxW/2, area.y - boxH/2, boxW, boxH, 24);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.22 + pulse * 0.2})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.moveTo(area.x - (boxW/2 + 16), area.y - boxH/2);
        ctx.lineTo(area.x, area.y - roofY);
        ctx.lineTo(area.x + (boxW/2 + 16), area.y - boxH/2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = (isIncubator || isPetMarket) ? "bold 16px monospace" : "bold 24px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${icon} ${label}`, area.x, area.y + textY);
        ctx.textAlign = "left";

        if (area.type === "incubator" && readyEggsCount > 0) {
            ctx.save();
            const bob = Math.sin(frame * 0.1) * 5; // Kleiner Animationseffekt
            ctx.fillStyle = "#ef4444"; 
            ctx.beginPath();
            ctx.arc(area.x + 35, area.y - 45 + bob, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.font = "bold 16px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", area.x + 35, area.y - 45 + bob);
            ctx.restore();
        }

    }

    _drawPlayerNametag(centerX, topY, label, style = "local", badge = null) {
        const { ctx } = this;
        const text = String(label || "").trim();
        if (!text) return;
        const isLocal = style === "local";

        const badgeText = badge === "subscriber" ? "⭐ Sub" : badge === "beta" ? "🔬 Beta" : null;

        ctx.save();
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const padX = 8;
        const padY = 4;
        const metrics = ctx.measureText(text);
        const w = Math.min(200, Math.ceil(metrics.width) + padX * 2);
        const h = 18;
        const x = centerX - w / 2;
        const y = topY - h;
        ctx.fillStyle = isLocal ? "rgba(15,23,42,0.88)" : "rgba(30,58,138,0.88)";
        ctx.strokeStyle = isLocal ? "rgba(148,163,184,0.7)" : "rgba(147,197,253,0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isLocal ? "#e2e8f0" : "#dbeafe";
        ctx.fillText(text.length > 22 ? `${text.slice(0, 20)}…` : text, centerX, topY - padY);

        if (badgeText) {
            ctx.font = "bold 9px monospace";
            const bm = ctx.measureText(badgeText);
            const bw = Math.ceil(bm.width) + 8;
            const bh = 13;
            const bx = centerX - bw / 2;
            const by = y - bh - 1;
            ctx.fillStyle = badge === "subscriber" ? "rgba(250,176,5,0.92)" : "rgba(96,165,250,0.92)";
            ctx.strokeStyle = badge === "subscriber" ? "#fbbf24" : "#93c5fd";
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#0f172a";
            ctx.fillText(badgeText, centerX, by + bh - 2);
        }

        ctx.restore();
    }

    drawRemotePlayer(rp) {
        const { ctx, frame } = this;
        const { x: px, y: py, name, tool, heldItem, appearance, facingRight, badge } = rp;
        const rx = Math.round(px);
        const ry = Math.round(py);
        const isFacingRight = facingRight !== false;

        // Schatten unter dem Spieler
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(rx, ry + 22, 18, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(rx, ry);
        ctx.scale(isFacingRight ? 1 : -1, 1);

        const skinUrl = appearance?.skin || "/garden-assets/wardrobe/farmer.png";
        const skinBob = Math.sin(frame * 0.2) * 2;
        this._drawImageOrEmojiContain(skinUrl, "", 0, -20 + skinBob, 56);

        if (tool) {
            const toolImg = TOOL_IMAGE_BY_KEY[tool];
            const toolEmoji = TOOL_EMOJI_BY_KEY[tool];
            this._drawImageOrEmojiContain(toolImg, toolEmoji, 22, -6, 32);
            
            if (tool === "pot" && heldItem) {
                this._renderHeldPlantEffect(heldItem, 22, -24);
            }
        } else if (heldItem) {
            const isHeldPlant = heldItem._type === "plant" || heldItem.stage;
            if (isHeldPlant) {
                this._renderHeldPlantEffect(heldItem, 22, -8);
            } else {
                const heldImage = heldItem.image || heldItem.seedImage || heldItem.seedShopImage || heldItem.harvestImage || null;
                const heldEmoji = heldItem.emoji || ""; 
                this._drawImageOrEmojiContain(heldImage, heldEmoji, 22, -6, 32);
            }
        }

        ctx.restore();

        // Nametag
        const bob = Math.sin(frame * 0.06) * 0.5;
        this._drawPlayerNametag(rx, ry - 38 + bob, name, "remote", badge || null);
    }

    _renderHeldPlantEffect(item, x, y) {
        let scale = 1;
        if (item.size) {
            scale = visualScaleFromFruitSize(item.size);
        } else if (item.norm) {
            scale = visualScaleFromPlantNorm(item.norm);
        }

        const drawSize = 38 * scale;
        const imgSrc = item.harvestImage || item.image || item.fruitImage || item.growthImage;

        const specialName = item.specialType || item.specialData?.name || null;
        const effect = item.statusEffect || null;
        const overlay = this._resolveItemOverlay(effect, specialName);

        if (!overlay) {
            this._drawImageOrEmojiContain(imgSrc, item.emoji, x, y, drawSize);
            return;
        }

        // With overlay: draw image into scratch canvas, tint there, then blit.
        // Resolve source (atlas or regular image) and final aspect-fit dimensions.
        let src = null;       // either atlas image with crop, or full image
        let cropX = 0, cropY = 0, cropW = 0, cropH = 0;
        let dw = drawSize, dh = drawSize;

        if (this._atlasLoaded && this._atlasImage && imgSrc) {
            const frame = this._atlasFrames.get(imgSrc);
            if (frame) {
                const ar = frame.w / frame.h;
                if (ar > 1) dh = drawSize / ar;
                else dw = drawSize * ar;
                src = this._atlasImage;
                cropX = frame.x; cropY = frame.y; cropW = frame.w; cropH = frame.h;
            }
        }
        if (!src) {
            const img = this._getImage(imgSrc);
            const cacheEntry = this._imageCache.get(imgSrc);
            if (cacheEntry && cacheEntry.status === "loading") return;
            if (img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                const sc = Math.min(drawSize / nw, drawSize / nh);
                dw = nw * sc; dh = nh * sc;
                src = img;
                cropX = 0; cropY = 0; cropW = nw; cropH = nh;
            }
        }
        if (!src) {
            // Emoji fallback — no tint applied (tinting emojis would just darken them)
            this._drawImageOrEmojiContain(imgSrc, item.emoji, x, y, drawSize);
            return;
        }

        const dx = x - dw / 2;
        const dy = y - dh / 2;
        const sw = Math.max(1, Math.ceil(dw));
        const sh = Math.max(1, Math.ceil(dh));
        if (this._tintScratch.width < sw || this._tintScratch.height < sh) {
            this._tintScratch.width = Math.max(this._tintScratch.width, sw, 128);
            this._tintScratch.height = Math.max(this._tintScratch.height, sh, 128);
        }
        const sctx = this._tintScratchCtx;
        sctx.clearRect(0, 0, sw, sh);
        sctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, sw, sh);
        sctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            sctx.fillStyle = overlay.color;
            sctx.fillRect(0, 0, sw, sh);
        } else if (overlay.kind === "rainbow") {
            const grad = sctx.createLinearGradient(0, 0, 0, sh);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            sctx.fillStyle = grad;
            sctx.fillRect(0, 0, sw, sh);
        }
        sctx.globalCompositeOperation = "source-over";
        this.ctx.drawImage(this._tintScratch, 0, 0, sw, sh, dx, dy, dw, dh);
    }

    drawPlayer(player, selectedTool, heldItem = null, localPlayerName = "", playerAppearance = {}, badge = null) {
        const { ctx, frame } = this;
        const px = Math.round(player.x);
        const py = Math.round(player.y);
        const facingRight = player.facingRight !== false; // Standard nach rechts

        ctx.save();
        // Nullpunkt auf den Spieler legen, damit wir sauber spiegeln können
        ctx.translate(px, py);
        ctx.scale(facingRight ? 1 : -1, 1);

        const skinUrl = playerAppearance?.skin || "/garden-assets/wardrobe/farmer.png";
        const bob = player.isMoving ? Math.sin(frame * 0.2) * 3 : 0;
        this._drawImageOrEmojiContain(skinUrl, "", 0, -20 + bob, 80);

        const selectedToolKey = selectedTool || null;
        const isHeldPlant = heldItem && (heldItem._type === "plant" || heldItem.stage);

        // Held items / Tools (Werden automatisch mitgespiegelt)
        if (selectedToolKey) {
            const toolImg = TOOL_IMAGE_BY_KEY[selectedToolKey];
            const toolEmoji = TOOL_EMOJI_BY_KEY[selectedToolKey];
            this._drawImageOrEmojiContain(toolImg, toolEmoji, 22, -6, 32);
            
            if (selectedToolKey === "pot" && heldItem) {
                this._renderHeldPlantEffect(heldItem, 22, -24); 
            }
        } else if (heldItem) {
            if (isHeldPlant) {
                this._renderHeldPlantEffect(heldItem, 22, -8);
            } else {
                const heldImage = heldItem.image || heldItem.seedImage || heldItem.seedShopImage || heldItem.harvestImage || null;
                const heldEmoji = heldItem.emoji || ""; 
                this._drawImageOrEmojiContain(heldImage, heldEmoji, 22, -6, 32);
            }
        }

        ctx.restore(); // Spiegelung aufheben

        // Nametag (darf NICHT gespiegelt werden!)
        if (localPlayerName) {
            this._drawPlayerNametag(px, py - 57, localPlayerName, "local", badge);
        }
    }
}