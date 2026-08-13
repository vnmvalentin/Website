// engine/Renderer.js
import { MAP_CONFIG, TILE_SIZE, STEIN_REIHEN, MITTELWEG_REIHE, getSignLayout } from './MapConfig';
import { versionedAsset } from './assetVersion';
import {
    getGrowthProgressForRender,
    isPlantReadyForRender,
    getPlantVisuals,
    getPlantArchetype,
    getPlantArchetypeKey,
    ARCHETYPE_PROFILES,
    USE_PROCEDURAL_SUPPORTS,
} from './PlantSystem';
import { getPetSize } from './PetSystem';

/**
 * Kantenlänge eines Tieres bei Größenfaktor 1. Bezug ist die Spielfigur, die mit
 * 80 px gezeichnet wird (siehe drawPlayer) — ein Faktor über 1 ist also größer als
 * der Spieler. Vorher lag die Grundgröße bei TILE_SIZE * 0.62 (rund 40 px), womit
 * selbst ein Pferd nur halb so groß war wie sein Besitzer.
 */
const PET_BASIS_GROESSE = 70;

/**
 * Ersatzdarstellung der Gebäude, solange (oder falls) kein Bild vorliegt: farbige
 * Fläche mit Symbol. Gilt für alle, die auf einem Grundstück stehen.
 */
const AREA_ERSATZ = {
    incubator: { farbe: "#14b8a6", symbol: "🧪" },
    trash:     { farbe: "#57534e", symbol: "🗑️" },
    chest:     { farbe: "#a16207", symbol: "📦" },
    vitrine:   { farbe: "#7c3aed", symbol: "🏆" },
};

/**
 * Welche BAUART ein Areal zeichnerisch ist. Bei fremden Grundstücken sagt `type`
 * nur, ob man das Gebäude anlaufen darf ("fremdeVitrine" ja, "fremdesGebaeude"
 * nein) — die Größe und der Ersatzkasten hängen aber an der Bauart, die dann in
 * `art` steht. Ohne diese Trennung wäre der Mülleimer des Nachbarn so groß wie
 * eine Marktbude gezeichnet worden.
 */
function bauart(area) {
    return area?.art || area?.type || "incubator";
}

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
// Nur Dateinamen — den Ordner entscheidet die Grafik-Einstellung (neu vs. alt).
const TERRAIN_FILES = {
    grass:     ["gras1.png", "gras2.png"],
    field:     ["acker.png"],
    rock:      ["stein.png"],
    path:      ["kiesweg1.png", "kiesweg2.png"],
    tallGrass: ["hohes_gras1.png", "hohes_gras2.png"],
    wood:      ["wood.png"],
};
const STRUCTURE_DIR = "/garden-assets/structure/";
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

/**
 * Deko, die nachts leuchtet — Schlüssel ist die `decoId` der Platzierung.
 *
 *   radius    Reichweite in Weltpixeln (wird mit dem Zoom skaliert)
 *   farbe     Warmton des Scheins
 *   hoehe     Wie weit ÜBER dem Fußpunkt die Flamme sitzt. Bei der 1×2 hohen
 *             Laterne oben am Mast, bei der Feuerschale fast auf dem Boden —
 *             ein Schein aus der Bildmitte sähe bei beiden falsch aus.
 *   flackern  Anteil, um den der Radius atmet (0 = ruhig, 1 = wild)
 */
const DEKO_LICHT = {
    deco_lamp: { radius: 215, farbe: [253, 224, 71], hoehe: 76, flackern: 0.05 },
    feuer: { radius: 165, farbe: [251, 146, 60], hoehe: 12, flackern: 0.17 },
};
/** Obergrenze je Bild — ein Garten voller Laternen soll die Bildrate nicht drücken. */
const LICHT_MAX = 24;
const MAX_VISIBLE_FRUITS = 6;
const PLANT_CACHE_MAX = 400;

// Farben für die prozeduralen Stützgerüste (Spalier, Stamm, Ranken …).
const SUPPORT_COLORS = {
    wood:      "#6b4726",
    woodLight: "#8a5f36",
    twine:     "#a8916b",
    stem:      "#3f7a35",
    stemDark:  "#2c5726",
    soil:      "#4a2c14",
    soilLight: "#633d1d",
};
const SHADOW_COLOR = "rgba(12, 20, 10, 0.30)";

function lerpSize(a, b, t) {
    return a + (b - a) * t;
}
/** Sortierkriterium der Tiefenliste: kleinerer Fußpunkt = weiter hinten = zuerst gezeichnet. */
function compareByBaseY(a, b) {
    return a.baseY - b.baseY;
}
/** Stabiler 0..1-Hash für Phasenversatz (Wind, Tier-Federung) — gleiche Pflanze wackelt immer gleich. */
function hashUnit(seed) {
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
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

/**
 * Dasselbe für die HAND — mit deutlich mehr Spanne.
 *
 * Auf dem Acker muss eine Frucht in ihre Kachel passen, in der Hand nicht: dort ist
 * die Größe das Erzählenswerte. Eine 50er füllt jetzt fast den ganzen Charakter,
 * eine 1er ist ein Krümel. Bewusst eine eigene Kurve, damit das Feld unverändert
 * bleibt.
 */
function handScaleFromFruitSize(size1to50) {
    const s = Math.max(1, Math.min(50, Number(size1to50) || 1));
    return lerpSize(0.5, 1.9, (s - 1) / 49);
}

/** Gleiche Spreizung für Pflanzen, die nur `norm` mitbringen (z. B. im Topf). */
function handScaleFromPlantNorm(norm) {
    if (norm == null || !Number.isFinite(norm)) return 0.9;
    return lerpSize(0.5, 1.9, Math.max(0, Math.min(1, norm)));
}

/**
 * Eine Zeichenfläche wirklich freigeben. Das blosse Fallenlassen der Referenz
 * reicht nicht zuverlässig — erst Breite und Höhe auf 0 geben den Bildspeicher
 * sofort zurück.
 */
function freigeben(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
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
        // Tiefensortierte Zeichenliste pro Grundstück. Die Einträge stammen aus einem
        // Pool, damit bei 60 FPS keine paar hundert Wegwerf-Objekte pro Frame anfallen
        // (genau die GC-Sammelläufe, die vorher als Mikro-Ruckler sichtbar waren).
        this._renderBucket = [];
        this._renderPool = [];
        /** Leuchtende Deko dieses Bildes — wird je Bild neu gefüllt (siehe draw). */
        this._lichter = [];
        this._poolUsed = 0;
        // Stützgerüste hängen nur an (Archetyp, Höhenstufe), nicht an der einzelnen
        // Pflanze — deshalb reichen ein paar Dutzend geteilte Canvases für den ganzen Acker.
        this._supportCache = new Map();
        this._plantGeoCache = new Map();
        this._petFrameCache = new Map();
        // Wiederverwendete Hülle, damit der Render-Aufruf pro Frame kein neues Objekt erzeugt
        this._playerPayload = {
            selectedTool: null, heldItem: null, localPlayerName: "", playerAppearance: null, playerBadge: null,
        };
        this._remotePlayers = null;
        this._drawnRemotes = new Set();
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
            fremdeGebaeude = [],
            zoom = 1,
            selectedTool = null,
            petPlacements = [],
            decoPlacements = [],
            heldItem = null,
            weather = { type: "sun" },
            renderProfile = DEFAULT_RENDER_PROFILE,
            localPlayerName = "",
            playerAppearance = {},
            playerBadge = null,
            remotePlayers = null,
        } = state;
        this._remotePlayers = remotePlayers;
        this._readyEggs = state.readyEggsCount || 0;
        // Auf welchem Grundstück das Editor-Raster liegt (slot.id, nicht der Index)
        // — null heisst: Editor aus.
        this._editorSlotId = Number.isInteger(state.editorSlotId) ? state.editorSlotId : null;
        this._zoom = zoom;
        this._weather = weather;
        this._renderProfile = renderProfile || DEFAULT_RENDER_PROFILE;
        this.frame++;

        // Leuchtende Deko wird beim Einsortieren eingesammelt (siehe _collectDeco) und
        // erst ganz zum Schluss über dem Dunkelheits-Schleier ausgewertet.
        this._lichter.length = 0;

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
        this._drawWeatherGround(layout, player, weather);

        // Der Spieler wird in die Tiefensortierung des Grundstücks eingereiht, auf dem
        // er steht — damit läuft er hinter hohen Pflanzen vorbei statt immer davor.
        this._playerPayload.selectedTool = selectedTool;
        this._playerPayload.heldItem = heldItem;
        this._playerPayload.localPlayerName = localPlayerName;
        this._playerPayload.playerAppearance = playerAppearance;
        this._playerPayload.playerBadge = playerBadge;

        // Inkubator und Mülleimer stehen AUF einem Grundstück und werden dort in die
        // Tiefenliste einsortiert (siehe _collectPlotAreas). Alles andere steht am
        // Kiesweg und wird wie gehabt danach gezeichnet — sonst schnitte die Rasenfläche
        // des Grundstücks die Dächer der Marktwagen ab.
        // Die Gebäude der anderen kommen mit in die Tiefenliste: _collectPlotAreas
        // sortiert jeden Eintrag über seine Koordinaten dem richtigen Grundstück zu,
        // also landen sie automatisch beim jeweiligen Nachbarn.
        this._plotAreas = [areas.incubator, areas.trash, areas.chest, areas.vitrine, ...fremdeGebaeude]
            .filter((a) => a && a.aktiv !== false);
        const playerDrawn = this.drawTerritories(
            layout, player, petPlacements, decoPlacements, this._playerPayload,
        );
        this.drawHubAreas(areas, state.readyEggsCount);
        // Wer auf dem Kiesweg oder zwischen den Grundstücken steht, wurde oben nicht
        // einsortiert und gehört obenauf.
        if (remotePlayers) {
            for (const remote of remotePlayers) {
                if (this._drawnRemotes.has(remote)) continue;
                this.drawPlayer(remote, null, remote.held || null, remote.name, remote.appearance || {}, remote.badge, "remote");
            }
        }
        if (!playerDrawn) {
            this.drawPlayer(player, selectedTool, heldItem, localPlayerName, playerAppearance, playerBadge);
        }

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

    /**
     * Wetterspuren auf dem Boden: Schneehaufen bei Schnee, Pfützen bei Regen.
     *
     * Bewusst im WELTRAUM gezeichnet (vor den Grundstücken, nach dem Boden) — anders
     * als die Flocken/Tropfen, die als Bildschirm-Overlay laufen. Dadurch bleiben sie
     * an ihrer Stelle liegen, wenn man sich bewegt.
     *
     * Die Positionen kommen aus einem Rasterhash, nicht aus Math.random: derselbe
     * Fleck liegt bei jedem Frame an derselben Stelle und flackert nicht.
     */
    _drawWeatherGround(layout, player, weather, bounds) {
        const type = weather && weather.type;
        if (type !== "snow" && type !== "rain") return;
        if (this._renderProfile && this._renderProfile.simplifyPlantUi) return;
        const intensity = Math.max(0, Math.min(1, Number(weather.intensity)));
        if (!(intensity > 0.05)) return;

        const { ctx, canvas } = this;
        const zoom = this._zoom || 1;
        const stride = TILE_SIZE * 3;
        const halfW = canvas.width / (2 * zoom) + stride;
        const halfH = canvas.height / (2 * zoom) + stride;
        // Mit bounds nur dieses Grundstück, sonst das ganze Sichtfeld.
        const loX = bounds ? Math.max(bounds.x0, player.x - halfW) : player.x - halfW;
        const hiX = bounds ? Math.min(bounds.x1, player.x + halfW) : player.x + halfW;
        const loY = bounds ? Math.max(bounds.y0, player.y - halfH) : player.y - halfH;
        const hiY = bounds ? Math.min(bounds.y1, player.y + halfH) : player.y + halfH;
        if (hiX <= loX || hiY <= loY) return;
        const startX = Math.floor(loX / stride) * stride;
        const startY = Math.floor(loY / stride) * stride;
        const endX = hiX;
        const endY = hiY;
        const maxX = layout.worldWidth;
        const maxY = layout.worldHeight;

        ctx.save();
        for (let gy = startY; gy < endY; gy += stride) {
            if (gy < 0 || gy > maxY) continue;
            for (let gx = startX; gx < endX; gx += stride) {
                if (gx < 0 || gx > maxX) continue;

                // Ein Hash je Rasterzelle, daraus mehrere Werte über die Bits
                let h = Math.imul((gx / stride) | 0, 374761393) ^ Math.imul((gy / stride) | 0, 668265263);
                h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
                const u = (h >>> 0) / 4294967295;
                if (u > 0.42) continue; // nicht in jeder Zelle etwas

                const ox = ((h >>> 3) & 0xff) / 255 * stride * 0.8;
                const oy = ((h >>> 11) & 0xff) / 255 * stride * 0.8;
                const size = 0.55 + (((h >>> 19) & 0xff) / 255) * 0.75;
                const x = gx + ox;
                const y = gy + oy;
                const rx = TILE_SIZE * 0.42 * size;
                const ry = rx * 0.42;

                if (bounds && (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)) continue;

                if (type === "snow") {
                    ctx.fillStyle = "rgba(244, 249, 255, " + (0.55 * intensity).toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Kleine hellere Kuppe, damit es als Haufen liest statt als Fleck
                    ctx.fillStyle = "rgba(255, 255, 255, " + (0.5 * intensity).toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.ellipse(x - rx * 0.12, y - ry * 0.45, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillStyle = "rgba(38, 74, 104, " + (0.34 * intensity).toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Schmaler Glanz auf der Wasserfläche
                    ctx.strokeStyle = "rgba(186, 226, 255, " + (0.3 * intensity).toFixed(3) + ")";
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.ellipse(x, y - ry * 0.25, rx * 0.55, ry * 0.4, 0, Math.PI * 1.05, Math.PI * 1.95);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
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
    /**
     * Laternen und Feuerschalen leuchten in die Dunkelheit.
     *
     * Läuft NACH dem dunklen Schleier und in Bildschirmkoordinaten — die Kamera ist
     * an dieser Stelle längst zurückgesetzt, deshalb wird ihre Rechnung hier von Hand
     * nachgezogen (dieselben Rundungen wie in draw(), sonst zittert der Lichtkegel
     * gegen die Deko, auf der er sitzt).
     *
     * Zwei Durchgänge: erst wird der Schleier weggenommen (`destination-out`), damit
     * unter der Laterne wirklich das Grundstück sichtbar wird statt nur ein heller
     * Fleck AUF dem Dunkel. Dann kommt der warme Schein obendrauf.
     */
    _leuchteLichter(staerke, player) {
        const lichter = this._lichter;
        if (!lichter || lichter.length === 0 || staerke <= 0.01) return;
        const { ctx, canvas } = this;
        const zoom = this._zoom || 1;
        const mx = Math.round(canvas.width / 2);
        const my = Math.round(canvas.height / 2);
        const ox = Math.round(-(player?.x || 0));
        const oy = Math.round(-(player?.y || 0));

        // Bildschirmposition und Flackern einmal ausrechnen, nicht je Durchgang.
        const sichtbar = [];
        for (const l of lichter) {
            const sx = mx + (l.x + ox) * zoom;
            const sy = my + (l.y + oy) * zoom;
            const r = l.licht.radius * zoom;
            if (sx + r < 0 || sx - r > canvas.width || sy + r < 0 || sy - r > canvas.height) continue;
            // Phase aus der Position: sonst flackern alle Laternen im Gleichtakt.
            const p = this.frame * 0.08 + l.x * 0.017 + l.y * 0.011;
            const welle = 0.5 + 0.5 * (Math.sin(p) * 0.6 + Math.sin(p * 2.7) * 0.4);
            sichtbar.push({ sx, sy, r: r * (1 - l.licht.flackern + l.licht.flackern * welle), farbe: l.licht.farbe });
            if (sichtbar.length >= LICHT_MAX) break;
        }
        if (sichtbar.length === 0) return;

        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        for (const l of sichtbar) {
            const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.r);
            g.addColorStop(0, `rgba(0,0,0,${0.92 * staerke})`);
            g.addColorStop(0.55, `rgba(0,0,0,${0.45 * staerke})`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.fillRect(l.sx - l.r, l.sy - l.r, l.r * 2, l.r * 2);
        }
        ctx.globalCompositeOperation = "lighter";
        for (const l of sichtbar) {
            const [cr, cg, cb] = l.farbe;
            const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.r * 0.8);
            g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.34 * staerke})`);
            g.addColorStop(0.4, `rgba(${cr},${cg},${cb},${0.13 * staerke})`);
            g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(l.sx - l.r, l.sy - l.r, l.r * 2, l.r * 2);
        }
        ctx.restore();
    }

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
            // Nach dem restore: die Lichter setzen ihren eigenen Zeichenmodus.
            this._leuchteLichter(intensity, player);
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
            this._leuchteLichter(intensity, player);
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

    /**
     * Zeichnet alle Grundstücke. Pflanzen, Deko, Tiere und (falls er darauf steht)
     * der Spieler landen in EINER nach Fußpunkt sortierten Liste — dadurch verdeckt
     * konsequent das Vordere das Hintere, statt dass jede Kategorie in einem eigenen
     * Durchgang pauschal über der vorherigen liegt.
     *
     * @returns {boolean} ob der Spieler bereits einsortiert gezeichnet wurde
     */
    drawTerritories(layout, player, petPlacements = [], decoPlacements = [], playerPayload = null) {
        const { ctx } = this;
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const viewMargin = 200;
        const viewLeft = player.x - this.canvas.width / 2 - viewMargin;
        const viewRight = player.x + this.canvas.width / 2 + viewMargin;
        const viewTop = player.y - this.canvas.height / 2 - viewMargin;
        const viewBottom = player.y + this.canvas.height / 2 + viewMargin;
        let playerDrawn = false;
        // Ein Mitspieler darf nur einmal gezeichnet werden, auch wenn sich Grundstücke
        // an den Rändern überlappen.
        const drawnRemotes = this._drawnRemotes;
        drawnRemotes.clear();

        layout.slots.forEach(slot => {
            const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
            const slotRight = slot.x + territoryWidth;
            const slotBottom = drawY + territoryHeight;
            const isVisible = slotRight >= viewLeft && slot.x <= viewRight && slotBottom >= viewTop && drawY <= viewBottom;
            if (!isVisible) return;

            const unlockedCells = Array.isArray(slot.unlockedCells) ? slot.unlockedCells : [];
            const staticLayer = this._getSlotStaticLayer(slot, drawY, unlockedCells);
            if (staticLayer) ctx.drawImage(staticLayer, slot.x, drawY);
            // Editor: Kachelraster über dem eigenen Grundstück, damit man sieht,
            // woran sich Deko und Gebäude ausrichten.
            if (this._editorSlotId === slot.id) this._drawEditorRaster(slot, drawY);
            // Wetterspuren gehören ÜBER den Bodenlayer des Grundstücks — davor
            // gezeichnet wurden sie von Rasen und Acker vollständig zugedeckt.
            this._drawWeatherGround(layout, player, this._weather, {
                x0: slot.x, y0: drawY, x1: slotRight, y1: slotBottom,
            });

            const bucket = this._renderBucket;
            bucket.length = 0;
            this._poolUsed = 0;

            this._collectPlants(bucket, slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth);
            this._collectDeco(bucket, slot, drawY, decoPlacements, viewLeft, viewTop, viewRight, viewBottom);
            this._collectPets(bucket, slot, petPlacements, drawY);

            // Der Spieler wird nur auf dem Grundstück einsortiert, auf dem er steht —
            // sonst läuft er hinter einem Baum vorbei, der drei Plots weiter steht.
            if (playerPayload && !playerDrawn
                && player.x >= slot.x && player.x <= slotRight
                && player.y >= drawY && player.y <= slotBottom) {
                const entry = this._poolEntry();
                entry.kind = "player";
                entry.baseY = player.y;
                bucket.push(entry);
                playerDrawn = true;
            }

            // Mitspieler auf diesem Grundstück ebenfalls einsortieren
            if (this._remotePlayers) {
                for (const remote of this._remotePlayers) {
                    if (drawnRemotes.has(remote)) continue;
                    if (remote.x < slot.x || remote.x > slotRight || remote.y < drawY || remote.y > slotBottom) continue;
                    const entry = this._poolEntry();
                    entry.kind = "remote";
                    entry.ref = remote;
                    entry.baseY = remote.y;
                    bucket.push(entry);
                    drawnRemotes.add(remote);
                }
            }

            // Inkubator/Mülleimer dieses Grundstücks mit einsortieren
            if (this._plotAreas) {
                for (const area of this._plotAreas) {
                    if (!area || area.x < slot.x || area.x > slotRight) continue;
                    if (area.y < drawY || area.y > slotBottom) continue;
                    const entry = this._poolEntry();
                    entry.kind = "area";
                    entry.ref = area;
                    // Fußpunkt, wenn das Gebäude einen kennt — sonst grob geschätzt.
                    entry.baseY = Number.isFinite(area.fussY) ? area.fussY : area.y + 35;
                    bucket.push(entry);
                }
            }

            bucket.sort(compareByBaseY);

            for (let i = 0; i < bucket.length; i++) {
                const entry = bucket[i];
                if (entry.kind === "plant") {
                    this._drawPlant(entry.plant, entry.cellX, entry.cellY, entry.slotId, entry.cacheKey);
                } else if (entry.kind === "deco") {
                    this._drawDecoItem(entry);
                } else if (entry.kind === "area") {
                    const a = entry.ref;
                    const ersatz = AREA_ERSATZ[bauart(a)] || AREA_ERSATZ.incubator;
                    this._drawAreaBuilding(
                        a, ersatz.farbe, ersatz.symbol,
                        a.label || "", a.type === "incubator" ? this._readyEggs : 0,
                    );
                } else if (entry.kind === "pet") {
                    this._drawPetItem(entry);
                } else if (entry.kind === "remote") {
                    // Fremde tragen ihr Item sichtbar in der Hand — inklusive
                    // Groesse und Sonderform, gezeichnet vom selben Code wie beim
                    // eigenen Spieler.
                    this.drawPlayer(
                        entry.ref, null, entry.ref.held || null,
                        entry.ref.name, entry.ref.appearance || {}, entry.ref.badge, "remote",
                    );
                } else if (entry.kind === "player") {
                    this.drawPlayer(
                        player,
                        playerPayload.selectedTool,
                        playerPayload.heldItem,
                        playerPayload.localPlayerName,
                        playerPayload.playerAppearance,
                        playerPayload.playerBadge,
                    );
                }
            }

            // Reife-Marker ganz zum Schluss: eine erntereife Pflanze darf nie hinter
            // einem hohen Nachbarn verschwinden.
            this._drawReadyMarkers(bucket);

            // Aus MapConfig, nicht noch einmal hier gerechnet: die Klickfläche des
            // Briefkastens leitet sich aus derselben Funktion ab. Zwei Kopien der
            // Formel hiessen, dass ein Verschieben die Klickfläche zurücklässt.
            const schild = getSignLayout(slot);
            this._drawSign(slot, schild.centerX, schild.centerY);
        });

        return playerDrawn;
    }

    _poolEntry() {
        const pool = this._renderPool;
        let entry = pool[this._poolUsed];
        if (!entry) {
            entry = { kind: "", baseY: 0, plant: null, cellX: 0, cellY: 0, slotId: 0, cacheKey: "", ref: null, size: 0, x: 0, y: 0 };
            pool[this._poolUsed] = entry;
        }
        this._poolUsed++;
        return entry;
    }

    _collectDeco(bucket, slot, drawY, decoPlacements, viewLeft, viewTop, viewRight, viewBottom) {
        if (!Array.isArray(decoPlacements) || decoPlacements.length === 0) return;
        const slotIndex = slot.id - 1;
        for (const deco of decoPlacements) {
            if (deco?.slotIndex !== slotIndex) continue;
            const x = Number(deco?.x); // Mitte der unten-links liegenden Ankerkachel
            const y = Number(deco?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const dw = deco.width || 1;
            const dh = deco.height || 1;
            // Sichtbare Mitte: nach rechts um (dw-1)/2, nach oben um (dh-1)/2 Kacheln
            const visualX = x + ((dw - 1) * TILE_SIZE) / 2;
            const visualY = y - ((dh - 1) * TILE_SIZE) / 2;
            const drawSize = TILE_SIZE * Math.max(dw, dh) * 0.9;
            if (visualX + drawSize < viewLeft || visualX - drawSize > viewRight ||
                visualY + drawSize < viewTop || visualY - drawSize > viewBottom) continue;
            const entry = this._poolEntry();
            entry.kind = "deco";
            entry.ref = deco;
            entry.x = visualX;
            entry.y = visualY;
            entry.size = drawSize;
            // Fußpunkt = Unterkante der Ankerkachel
            entry.baseY = y + TILE_SIZE / 2;
            bucket.push(entry);

            // Leuchtet das Stück nachts? Der Leuchtpunkt sitzt nicht in der Bildmitte,
            // sondern dort, wo die Flamme ist — bei der Laterne oben am Mast.
            const licht = DEKO_LICHT[deco.decoId];
            if (licht) this._lichter.push({ x: visualX, y: entry.baseY - licht.hoehe, licht });
        }
    }

    /**
     * Bildpfad einer Deko.
     *
     * `view` stammt aus der alten Ansichten-Mechanik und kommt bei NEUEN Platzierungen
     * nicht mehr vor — [R] spiegelt jetzt nur noch. Für bereits gesetzte Deko wird die
     * Variante weiterhin gesucht (`deco/teich.png` → `deco/teich_right.png`), damit
     * bestehende Gärten unverändert aussehen. Fehlt sie, bleibt das Grundbild stehen.
     */
    _resolveDecoImage(deco) {
        const base = deco?.image;
        if (!base) return base;
        const view = deco.view;
        if (!view || view === "front") return base;
        const variant = base.replace(/\.png$/i, `_${view}.png`);
        const status = this._bildStatus(variant);
        if (status === "error") return base;          // Variante gibt es nicht
        if (!status) this._getImage(variant);         // Laden anstoßen
        return status === "ready" ? variant : base;
    }

    _drawDecoItem(entry) {
        const deco = entry.ref;
        // Bewusst KEIN Bodenschatten: Deko sitzt oft flach auf dem Boden (Pool, Teich),
        // ein Schatten darunter sah aus, als würde das Wasser schweben.
        const src = this._resolveDecoImage(deco);

        // Gedrehte Deko gibt es nur noch aus alten Spielständen (rotation/view). Neue
        // Platzierungen tragen ausschließlich `mirrored`.
        const spin = Number(deco.rotation) || 0;
        if (spin) {
            const { ctx } = this;
            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.rotate((spin * Math.PI) / 180);
            this._drawImageOrEmojiContain(src, deco.emoji || "", 0, 0, entry.size);
            ctx.restore();
            return;
        }
        // Gespiegelt: neu über `mirrored`, bei alter Deko über die Ansicht „links".
        if (deco.mirrored || deco.view === "left") {
            const { ctx } = this;
            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.scale(-1, 1);
            this._drawImageOrEmojiContain(src, deco.emoji || "", 0, 0, entry.size);
            ctx.restore();
            return;
        }
        this._drawImageOrEmojiContain(src, deco.emoji || "", entry.x, entry.y, entry.size);
    }

    /**
     * Kachelraster des Editors — pulsiert, damit es sich vom Untergrund abhebt,
     * ohne ihn zuzudecken.
     *
     * Bewusst NICHT in den zwischengespeicherten Bodenlayer: der wird nur bei
     * Änderungen neu gebaut, ein Pulsieren bräuchte ihn jeden Frame neu. Hier sind
     * es ein paar hundert Linien pro Bild, das kostet nichts.
     */
    _drawEditorRaster(slot, drawY) {
        const { ctx } = this;
        const { territoryWidth, territoryHeight } = MAP_CONFIG;
        const spalten = Math.round(territoryWidth / TILE_SIZE);
        const reihen = Math.round(territoryHeight / TILE_SIZE);
        // 0.35 … 0.75 in etwa zwei Sekunden
        const puls = 0.35 + 0.2 * (1 + Math.sin(this.frame * 0.05));

        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(167, 139, 250, ${puls.toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i <= spalten; i++) {
            const x = Math.round(slot.x + i * TILE_SIZE) + 0.5;
            ctx.moveTo(x, drawY);
            ctx.lineTo(x, drawY + territoryHeight);
        }
        for (let j = 0; j <= reihen; j++) {
            const y = Math.round(drawY + j * TILE_SIZE) + 0.5;
            ctx.moveTo(slot.x, y);
            ctx.lineTo(slot.x + territoryWidth, y);
        }
        ctx.stroke();

        // Aussenkante kräftiger — sie sagt, wie weit das eigene Grundstück reicht.
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(167, 139, 250, ${Math.min(1, puls + 0.25).toFixed(3)})`;
        ctx.strokeRect(slot.x, drawY, territoryWidth, territoryHeight);
        ctx.restore();
    }

    _getSlotStaticLayer(slot, drawY, unlockedCells) {
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const dirtCols = Math.round(baseDirtWidth / TILE_SIZE);
        const dirtRows = Math.round(baseDirtHeight / TILE_SIZE);
        // Muss zu EXTRA_ROWS und MITTELWEG_REIHE in MapConfig.js passen — dort steht
        // auch, warum es 16 Reihen sind und der Querweg auf 9 liegt.
        const EXTRA_ROWS = STEIN_REIHEN;
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

        // Grundstücksgrenze: bevorzugt ein Zaunbild, sonst die alte Linie.
        // Der Zaun wird nur an den SEITEN gestapelt — oben und unten grenzen die
        // Grundstücke an den Kiesweg bzw. den Weltrand, dort stünde er im Weg.
        const fence = this._getImage("/garden-assets/structure/fence_v.png");
        if (fence) {
            const fw = Math.max(1, fence.naturalWidth || fence.width);
            const fh = Math.max(1, fence.naturalHeight || fence.height);
            // Auf Kachelhöhe skalieren, Seitenverhältnis behalten
            const drawH = TILE_SIZE;
            const drawW = fw * (drawH / fh);
            for (let fy = drawY; fy < drawY + territoryHeight; fy += drawH) {
                const h = Math.min(drawH, drawY + territoryHeight - fy);
                const sh = fh * (h / drawH);
                lctx.drawImage(fence, 0, 0, fw, sh, slot.x - drawW / 2, fy, drawW, h);
                lctx.drawImage(fence, 0, 0, fw, sh, slot.x + territoryWidth - drawW / 2, fy, drawW, h);
            }
        } else {
            lctx.strokeStyle = slot.owner ? "#86efac" : "#166534";
            lctx.lineWidth = slot.owner ? 3 : 2;
            lctx.strokeRect(slot.x, drawY, territoryWidth, territoryHeight);
        }

        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const unlockedSet = new Set(unlockedCells);

        for (let cy = 0; cy < dirtRows; cy++) {
            for (let cx = 0; cx < dirtCols; cx++) {
                const cellX = dirtX + cx * TILE_SIZE;
                const cellY = dirtY + cy * TILE_SIZE;
                if (cx === 7 || cy === 7) {
                    const woodImg = this._getImage(this._terrainSrc("wood", "wood.png"));
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
                if (cx === 7 || r === 1 || r === MITTELWEG_REIHE) {
                    const woodImg = this._getImage(this._terrainSrc("wood", "wood.png"));
                    if (woodImg) {
                        lctx.drawImage(woodImg, cellX, cellY, TILE_SIZE, TILE_SIZE);
                    } else {
                        lctx.fillStyle = "#92400e";
                        lctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    this._drawExpansionCell(cellX, cellY, unlockedSet.has(key), cx === 0 && r === 1, cx, logicalY, slot.id, lctx);
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

    _collectPlants(bucket, slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth) {
        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const dirtyRight = dirtX + baseDirtWidth;
        // Grobe Sichtprüfung für das ganze Grundstück. MUSS die volle Erweiterung
        // abdecken: mit einer Reihe zu wenig verschwinden die Pflanzen der äußersten
        // Steinreihe, sobald nur noch sie im Bild ist.
        const dirtyTop = slot.isTopRow ? dirtY - STEIN_REIHEN * TILE_SIZE : dirtY;
        const dirtyBottom = slot.isTopRow ? (dirtY + baseDirtHeight) : (dirtY + baseDirtHeight + STEIN_REIHEN * TILE_SIZE);
        if (dirtyRight < viewLeft || dirtX > viewRight || dirtyBottom < viewTop || dirtyTop > viewBottom) return;

        const plants = slot.plants;
        if (!plants) return;
        for (const key in plants) {
            const plant = plants[key];
            if (!plant) continue;
            const sep = key.indexOf("_");
            if (sep < 0) continue;
            const cx = Number(key.slice(0, sep));
            const cy = Number(key.slice(sep + 1));
            if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
            const cellX = dirtX + cx * TILE_SIZE;
            const cellY = dirtY + cy * TILE_SIZE;
            if (cellX + TILE_SIZE < viewLeft || cellX > viewRight || cellY + TILE_SIZE < viewTop || cellY > viewBottom) continue;
            const entry = this._poolEntry();
            entry.kind = "plant";
            entry.plant = plant;
            entry.cellX = cellX;
            entry.cellY = cellY;
            entry.slotId = slot.id;
            entry.cacheKey = key; // vorhandener Zellschlüssel — keine Zeichenkette pro Frame
            // Fußpunkt der Pflanze = Unterkante ihrer Kachel
            entry.baseY = cellY + TILE_SIZE;
            bucket.push(entry);
        }
    }

    _collectPets(bucket, slot, petPlacements, drawY) {
        if (!Array.isArray(petPlacements) || petPlacements.length === 0) return;
        const slotIndex = slot.id - 1;
        for (const pet of petPlacements) {
            if (pet?.slotIndex !== slotIndex) continue;
            const entry = this._poolEntry();
            entry.kind = "pet";
            entry.ref = pet;
            entry.x = Number.isFinite(pet.x) ? pet.x : slot.x + MAP_CONFIG.territoryWidth / 2;
            entry.y = Number.isFinite(pet.y) ? pet.y : drawY + MAP_CONFIG.territoryHeight / 2;
            // Fußpunkt wächst mit der Art mit — ein Pferd steht tiefer als ein Huhn und
            // gehört in der Tiefensortierung entsprechend weiter nach vorn.
            entry.baseY = entry.y + 14 * getPetSize(pet.name);
            bucket.push(entry);
        }
    }

    /**
     * Laufbilder eines Tieres: /garden-assets/animals/<name>/1.png und 2.png
     * (auch .jpg). Gibt es den Ordner nicht, bleibt es beim Einzelbild — Tiere
     * ohne eigene Sprites behalten also die bisherige Feder-Animation.
     *
     * Das Ergebnis wird je Tierart gemerkt, damit nicht jeder Frame neu probiert wird.
     */
    /**
     * Ladezustand eines Bildes.
     *
     * MUSS über versionedAsset gehen: _getImage legt den Eintrag unter der Adresse
     * MIT Versionsanhang ab. Eine Abfrage mit dem rohen Pfad traf deshalb nie etwas —
     * genau daran sind die Laufbilder gescheitert (jeder Frame hielt sich für den
     * Erstkontakt, stiess das Laden erneut an und zeichnete weiter das Einzelbild).
     */
    _bildStatus(rawSrc) {
        return this._imageCache.get(versionedAsset(rawSrc))?.status || null;
    }

    _resolvePetFrames(baseImage) {
        const m = /\/animals\/([^/.]+)\.(?:png|jpg|jpeg)$/i.exec(baseImage || "");
        if (!m) return null;
        const slug = m[1];
        const gemerkt = this._petFrameCache.get(slug);
        if (gemerkt !== undefined) return gemerkt;

        for (const ext of ["png", "jpg"]) {
            const ordner = "/garden-assets/animals/" + slug + "/";
            const f1 = ordner + "1." + ext;
            const f2 = ordner + "2." + ext;
            const status = this._bildStatus(f1);
            if (!status) {
                // Erstkontakt: Laden anstoßen, diesen Frame noch statisch zeichnen
                this._getImage(f1);
                this._getImage(f2);
                return null;
            }
            if (status === "loading") return null;
            if (status === "ready") {
                // Erst wenn BEIDE Bilder da sind — sonst blinkt der zweite Schritt
                // beim ersten Durchlauf durch ein fehlendes Bild.
                const s2 = this._bildStatus(f2);
                if (!s2 || s2 === "loading") return null;
                const frames = s2 === "ready" ? [f1, f2] : [f1, f1];
                this._petFrameCache.set(slug, frames);
                return frames;
            }
            // status === "error" → nächste Endung versuchen
        }
        this._petFrameCache.set(slug, null); // keine Laufbilder vorhanden
        return null;
    }
    _drawPetItem(entry) {
        const { ctx, frame } = this;
        const pet = entry.ref;
        const x = entry.x;
        const y = entry.y;
        const facingRight = pet.facingRight !== false;
        const moving = Math.abs(Number(pet.vx) || 0) + Math.abs(Number(pet.vy) || 0) > 0.15;

        // Eigener Phasenversatz pro Tier, damit eine Herde nicht im Gleichschritt hüpft
        const phase = hashUnit(pet.id || `${Math.round(x)}_${Math.round(y)}`) * Math.PI * 2;
        // Laufende Tiere federn schneller und höher als grasende
        const bobSpeed = moving ? 0.22 : 0.06;
        const bobHeight = moving ? 3.2 : 1.1;
        const bob = Math.sin(frame * bobSpeed + phase) * bobHeight;
        // Beim Laufen leicht in Bewegungsrichtung kippen
        const lean = moving ? Math.sin(frame * bobSpeed + phase) * 0.05 : 0;

        // Laufbilder wechseln nur in Bewegung; im Stand bleibt Bild 1 stehen.
        const frames = this._resolvePetFrames(pet.image);
        const src = frames
            ? (moving ? frames[Math.floor(this.frame / 9) % 2] : frames[0])
            : pet.image;
        // Mit echten Laufbildern braucht es kaum Federung — sonst hüpft es doppelt.
        const bobUsed = frames ? bob * 0.3 : bob;

        // Jede Art hat ihre eigene Größe (siehe PET_SIZE_BY_TYPE). Schatten und
        // Namensschild wachsen mit, sonst schwebt ein Drache über einem Hühnerschatten.
        const groesse = getPetSize(pet.name);
        const box = PET_BASIS_GROESSE * groesse;

        this._drawGroundShadow(
            x, y + 14 * groesse,
            (12 - (moving ? bobUsed * 0.4 : 0)) * groesse, 5 * groesse, 0.85,
        );

        ctx.save();
        ctx.translate(x, y + bobUsed);
        ctx.rotate(frames ? 0 : lean);
        ctx.scale(facingRight ? 1 : -1, 1);
        if (src) {
            // Tiere können wie Pflanzen golden oder regenbogenfarben sein.
            const overlay = this._resolveItemOverlay(null, pet.specialType || null);
            const img = overlay ? this._getImage(src) : null;
            if (overlay && img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                const sc = Math.min(box / nw, box / nh);
                const dw = nw * sc;
                const dh = nh * sc;
                this._drawTintedImage(img, -dw / 2, -dh / 2, dw, dh, overlay);
            } else {
                this._drawImageOrEmojiContain(src, pet.emoji || "", 0, 0, box);
            }
        } else {
            ctx.font = `${Math.round(28 * groesse)}px serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pet.emoji || "", 0, 0);
        }
        ctx.restore();

        // Namensschild — nicht mitspiegeln, deshalb erst nach dem restore().
        // Steht auch auf fremden Grundstücken, damit Besucher die Tiere benennen sehen.
        if (!this._renderProfile?.simplifyPlantUi) {
            const label = String(pet.customName || pet.name || "").trim();
            if (label) this._drawPetNameTag(x, y - TILE_SIZE * 0.34 * groesse + bob, label, pet.specialType);
        }
    }

    _drawPetNameTag(centerX, bottomY, label, specialType) {
        const { ctx } = this;
        const text = label.length > 16 ? `${label.slice(0, 15)}…` : label;
        ctx.save();
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = Math.ceil(ctx.measureText(text).width) + 12;
        const h = 15;
        const x = centerX - w / 2;
        const y = bottomY - h;
        ctx.fillStyle = "rgba(15,23,42,0.85)";
        ctx.strokeStyle = specialType === "Golden" ? "rgba(251,191,36,0.9)"
            : specialType === "Rainbow" ? "rgba(232,121,249,0.9)"
            : "rgba(148,163,184,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(text, centerX, y + h / 2 + 0.5);
        ctx.restore();
    }

    /** Weicher Bodenschatten — trägt am meisten dazu bei, dass Objekte "aufstehen" statt zu schweben. */
    _drawGroundShadow(cx, cy, rx, ry, alphaScale = 1) {
        if (rx <= 0 || ry <= 0) return;
        const { ctx } = this;
        ctx.save();
        ctx.globalAlpha = alphaScale;
        ctx.fillStyle = SHADOW_COLOR;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Overlay-Durchgang: kleiner schwebender Marker über jeder erntereifen Pflanze.
     * Läuft nach der sortierten Liste, damit ein hoher Nachbar eine fertige Ernte
     * niemals verstecken kann.
     */
    _drawReadyMarkers(bucket) {
        if (this._renderProfile?.simplifyPlantUi) return;
        const { ctx } = this;
        const now = this._frameNow;
        const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.09);
        for (let i = 0; i < bucket.length; i++) {
            const entry = bucket[i];
            if (entry.kind !== "plant") continue;
            const plant = entry.plant;
            if (!isPlantReadyForRender(plant, now)) continue;

            const profile = getPlantArchetype(plant.seedId);
            const color = RARITY_COLORS[plant.rarity] || "#94a3b8";
            const cx = entry.cellX + TILE_SIZE / 2;
            const topY = entry.cellY + TILE_SIZE * 0.95 - profile.heightTiles * TILE_SIZE - 10;
            const float = Math.sin(this.frame * 0.06 + cx * 0.01) * 2.5;

            ctx.save();
            ctx.globalAlpha = 0.75 + pulse * 0.25;
            ctx.fillStyle = color;
            // Nach unten zeigendes Dreieck über der Pflanzenspitze
            ctx.beginPath();
            ctx.moveTo(cx - 6, topY + float);
            ctx.lineTo(cx + 6, topY + float);
            ctx.lineTo(cx, topY + float + 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // Zeichnet nur den Untergrund einer Erweiterungszelle (Acker bzw. Stein).
    // Pflanzen darin laufen über die normale Tiefenliste in _collectPlants — dieser
    // Aufruf kam ausschließlich aus dem statischen Slot-Layer und bekam nie eine Pflanze.
    _drawExpansionCell(cellX, cellY, unlocked, isFirstInRow, logicalX, logicalY, slotId, targetCtx = this.ctx) {
        const ctx = targetCtx;
        const { frame } = this;
        if (unlocked) {
            this._drawTerrainTile("field", cellX + 1, cellY + 1, logicalX, logicalY, slotId, TILE_SIZE - 2, ctx);
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
    /**
     * Zustandssignatur einer Pflanze als ZAHL statt als String.
     *
     * Vorher wurde pro Pflanze und Frame ein Template-String gebaut und mit dem
     * Zellschlüssel zu einem zweiten String verkettet. Bei ~200 Pflanzen und 60 FPS
     * sind das rund 24.000 Wegwerf-Strings pro Sekunde — reine GC-Last für eine
     * Information, die in 20 Bit passt.
     */
    _getPlantSignature(plant, now) {
        const progress = Math.min(20, Math.max(0, Math.floor(getGrowthProgressForRender(plant, now) * 20)));
        let ready = 0;
        let total = 0;
        const slots = plant.fruitSlots;
        if (slots) {
            total = Math.min(15, slots.length);
            for (let i = 0; i < slots.length; i++) {
                if ((slots[i]?.readyAt || 0) <= now) ready++;
            }
            ready = Math.min(15, ready);
        }
        const stage = plant.stage === "structure" ? 0
            : plant.stage === "fruiting" ? 1
            : plant.stage === "growing" ? 2 : 3;
        const special = plant.specialType === "Golden" ? 1 : plant.specialType === "Rainbow" ? 2 : 0;
        const effect = plant.statusEffect === "wet" ? 1
            : plant.statusEffect === "frozen" ? 2
            : plant.statusEffect === "charged" ? 3
            : plant.statusEffect === "moonlit" ? 4 : 0;
        return progress | (ready << 5) | (total << 9) | (stage << 13) | (special << 15) | (effect << 17);
    }

    /** Windphase aus den Zellkoordinaten — spart den String-Hash pro Pflanze und Frame. */
    _swayPhase(cellX, cellY) {
        let h = Math.imul(cellX | 0, 374761393) ^ Math.imul(cellY | 0, 668265263);
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177);
        h ^= h >>> 16;
        return ((h >>> 0) / 4294967295) * Math.PI * 2;
    }

    /** Pflanzen-Cache je Grundstück, damit als Schlüssel der bereits vorhandene Zell-String reicht. */
    _slotPlantCache(slotId) {
        let map = this._plantCache.get(slotId);
        if (!map) {
            // Eine Welt hat 8 Grundstücke — die alte Grenze von 16 wurde damit NIE
            // erreicht, und der Cache eines verlassenen Slots blieb für immer
            // liegen (bis zu PLANT_CACHE_MAX Offscreen-Canvases). Beim Wechsel des
            // eigenen Grundstücks summierte sich das über eine Sitzung.
            if (this._plantCache.size >= 8) {
                const aeltester = this._plantCache.keys().next().value;
                const alt = this._plantCache.get(aeltester);
                if (alt) for (const entry of alt.values()) freigeben(entry?.canvas);
                this._plantCache.delete(aeltester);
            }
            map = new Map();
            this._plantCache.set(slotId, map);
        }
        return map;
    }

    /**
     * Alles freigeben, was über den Frame hinaus lebt.
     *
     * Es gab bisher gar keine Aufräummethode: der Spielschleifen-Effekt hat nur
     * den InputHandler zerstört. Jede Renderer-Instanz hält aber die dekodierten
     * Bilder, je Grundstück bis zu PLANT_CACHE_MAX Offscreen-Canvases, die
     * grundstücksgroßen Statik-Ebenen und die Stützgerüste. Noch laufende
     * img.onload-Closures halten die Instanz zusätzlich am Leben, deshalb werden
     * die Handler hier ausdrücklich gelöst und die Canvas-Maße auf null gesetzt —
     * das gibt den Speicher sofort frei statt irgendwann.
     */
    destroy() {
        for (const slotCache of this._plantCache.values()) {
            for (const entry of slotCache.values()) freigeben(entry?.canvas);
            slotCache.clear();
        }
        this._plantCache.clear();
        for (const eintrag of this._slotStaticCache.values()) freigeben(eintrag?.canvas);
        this._slotStaticCache.clear();
        for (const canvas of this._supportCache.values()) freigeben(canvas);
        this._supportCache.clear();
        for (const eintrag of this._imageCache.values()) {
            if (!eintrag?.img) continue;
            eintrag.img.onload = null;
            eintrag.img.onerror = null;
            eintrag.img.src = "";
        }
        this._imageCache.clear();
        this._atlasFrames.clear();
        this._tileVariantCache.clear();
        this._plantGeoCache.clear();
        this._petFrameCache.clear();
        freigeben(this._tintScratch);
        this._tintScratchCtx = null;
        this._atlasImage = null;
        this._groundPattern = null;
        this._renderBucket.length = 0;
        this._renderPool.length = 0;
        this._lichter.length = 0;
        this._drawnRemotes.clear();
        this._remotePlayers = null;
        this.ctx = null;
    }

    /**
     * Cache-Maße pro Archetyp. Breite fix (2 Kacheln), Höhe nach maximaler Wuchshöhe —
     * ein Salat braucht keine Baum-Leinwand. Der Fußpunkt liegt bei (w/2, h - pad),
     * damit Stützgerüst und Körper deckungsgleich geblittet werden können.
     */
    _plantGeometry(archetypeKey) {
        let geo = this._plantGeoCache.get(archetypeKey);
        if (geo) return geo;
        const profile = ARCHETYPE_PROFILES[archetypeKey] || ARCHETYPE_PROFILES.leafy;
        const h = Math.max(96, Math.ceil(((profile.heightTiles + 0.35) * TILE_SIZE) / 32) * 32);
        geo = { w: TILE_SIZE * 2, h, pad: 6 };
        this._plantGeoCache.set(archetypeKey, geo);
        return geo;
    }

    /** Aktuelle sichtbare Höhe in px — teilen sich Körper, Stützgerüst, Früchte und Reife-Marker. */
    _plantVisualHeight(plant, profile, now) {
        const full = TILE_SIZE * profile.heightTiles;
        if (plant.singleUse) {
            const progress = getGrowthProgressForRender(plant, now);
            if (progress < 0.2) return TILE_SIZE * 0.45;
            const phase = Math.max(0, Math.min(1, (progress - 0.2) / 0.8));
            return full * visualScaleFromPlantNorm(plant.norm) * (0.30 + phase * 0.70);
        }
        const structureProgress = plant.structureGrowthMs
            ? Math.max(0, Math.min(1, (now - (plant.plantedAt || now)) / plant.structureGrowthMs))
            : 1;
        const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
        if (inStructure && structureProgress < 0.2) return TILE_SIZE * 0.45;
        const phase = inStructure ? Math.max(0, Math.min(1, (structureProgress - 0.2) / 0.8)) : 1;
        return full * (0.35 + phase * 0.65);
    }

    /**
     * Zeichnet den Pflanzenkörper mit Fußpunkt (baseX, baseY); für Offscreen-Cache.
     * Kein shadowBlur / kein Puls-Rand (nur in _drawPlant auf Main-Canvas).
     */
    _renderPlantBodyLocal(plant, baseX, baseY, now, simplifyPlantUi, profile, geo) {
        const progress = getGrowthProgressForRender(plant, now);
        const ready = isPlantReadyForRender(plant, now);
        const rarityColor = RARITY_COLORS[plant.rarity] || "#94a3b8";
        // Immer ableiten statt aus dem Pflanzenobjekt lesen: gespeicherte Pfade sind
        // veraltet, sobald sich die Zuordnung Wuchsform -> Struktur aendert.
        const visuals = getPlantVisuals(plant.seedId, plant.singleUse);
        const isSeedling = progress < 0.2;
        const targetH = this._plantVisualHeight(plant, profile, now);
        const maxW = TILE_SIZE * profile.widthScale * 1.15;

        // Höhe führt, Breite begrenzt: dadurch bleibt ein Baum schlank und hoch statt
        // die ganze Nachbarreihe zuzudecken.
        const drawAnchored = (src, emoji, heightPx, widthCap) => {
            const img = this._getImage(src);
            if (img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                let dh = heightPx;
                let dw = nw * (dh / nh);
                if (dw > widthCap) {
                    dw = widthCap;
                    dh = nh * (dw / nw);
                }
                this.ctx.drawImage(img, baseX - dw / 2, baseY - dh, dw, dh);
            } else {
                this.ctx.font = `${Math.max(12, Math.floor(heightPx))}px serif`;
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "bottom";
                this.ctx.fillText(emoji || "", baseX, baseY);
            }
        };

        // Single-use: kompletter Körper. Multi-use: nur Struktur (Früchte dynamisch in _drawPlant).
        if (isSeedling && plant.singleUse) {
            drawAnchored(visuals.plantedSeedImage, "", targetH, TILE_SIZE * 0.6);
        } else if (plant.singleUse) {
            drawAnchored(visuals.growthImage, plant.emoji, targetH, maxW);
        } else {
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
            const structureProgress = plant.structureGrowthMs
                ? Math.max(0, Math.min(1, (now - (plant.plantedAt || now)) / plant.structureGrowthMs))
                : 1;
            if (inStructure && structureProgress < 0.2) {
                drawAnchored(visuals.plantedSeedImage, "", targetH, TILE_SIZE * 0.6);
            } else {
                drawAnchored(visuals.structureImage || visuals.growthImage, plant.emoji, targetH, maxW);
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
                this._drawTintOverlay(this.ctx, overlay, 0, 0, geo.w, geo.h);
            }
        }

        if (!ready && !simplifyPlantUi) {
            const barW = TILE_SIZE - 8;
            const barH = 4;
            const barX = baseX - barW / 2;
            const barY = baseY - 5;
            this.ctx.fillStyle = "rgba(0,0,0,0.5)";
            this.ctx.fillRect(barX, barY, barW, barH);
            this.ctx.fillStyle = rarityColor;
            this.ctx.fillRect(barX, barY, barW * progress, barH);
        }
    }

    _drawPlant(plant, cellX, cellY, slotId, cellKey) {
        const simplifyPlantUi = Boolean(this._renderProfile?.simplifyPlantUi);
        const now = this._frameNow;
        const archetypeKey = getPlantArchetypeKey(plant.seedId);
        const profile = ARCHETYPE_PROFILES[archetypeKey] || ARCHETYPE_PROFILES.leafy;
        const geo = this._plantGeometry(archetypeKey);
        const cache = this._slotPlantCache(slotId);
        const signature = this._getPlantSignature(plant, now);

        const baseX = cellX + TILE_SIZE / 2;
        const baseY = cellY + TILE_SIZE * 0.95;
        const blitX = baseX - geo.w / 2;
        const blitY = baseY - (geo.h - geo.pad);
        const spriteH = this._plantVisualHeight(plant, profile, now);

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

        // Bodenschatten: verankert die Pflanze im Acker statt sie schweben zu lassen
        if (!simplifyPlantUi) {
            const shadowR = TILE_SIZE * profile.shadow * 0.40;
            this._drawGroundShadow(baseX, baseY - 3, shadowR, shadowR * 0.34, 0.9);
        }

        // Reife Früchte mit Sonderform bekommen einen kleinen Ring auf der Kachel,
        // damit man auf einen Blick sieht, dass an DIESEM Strauch etwas Besonderes hängt.
        if (!simplifyPlantUi && !plant.singleUse && Array.isArray(plant.fruitSlots)) {
            let goldene = 0;
            let regenbogen = 0;
            for (const s of plant.fruitSlots) {
                if (!s || (s.readyAt || 0) > now || !s.specialType) continue;
                if (s.specialType === "Golden") goldene++;
                else if (s.specialType === "Rainbow") regenbogen++;
            }
            if (goldene || regenbogen) {
                this.ctx.save();
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = regenbogen ? "#e879f9" : "#fbbf24";
                this.ctx.strokeRect(cellX + 3, cellY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
                this.ctx.restore();
            }
        }

        // Stützgerüst: bewusst OHNE Wind — ein Spalier schwankt nicht mit der Ranke mit
        if (USE_PROCEDURAL_SUPPORTS && !simplifyPlantUi && profile.support !== "none" && spriteH > TILE_SIZE * 0.5) {
            const support = this._getSupportLayer(archetypeKey, profile, spriteH, geo);
            if (support) this.ctx.drawImage(support, blitX, blitY);
        }

        // Structure canvas (cached; fruits drawn dynamically below).
        // Der Zellschlüssel existiert bereits — es wird pro Frame kein String erzeugt.
        let entry = cache.get(cellKey);
        if (!entry || entry.signature !== signature || entry.seedId !== plant.seedId) {
            if (!entry) {
                if (cache.size > PLANT_CACHE_MAX) cache.clear();
                entry = { signature: -1, seedId: null, canvas: document.createElement("canvas") };
                cache.set(cellKey, entry);
            }
            const oc = entry.canvas;
            if (oc.width !== geo.w || oc.height !== geo.h) {
                oc.width = geo.w;
                oc.height = geo.h;
            }
            const octx = oc.getContext("2d");
            if (octx) {
                octx.clearRect(0, 0, geo.w, geo.h);
                const prev = this.ctx;
                this.ctx = octx;
                try {
                    this._renderPlantBodyLocal(plant, geo.w / 2, geo.h - geo.pad, now, simplifyPlantUi, profile, geo);
                } finally {
                    this.ctx = prev;
                }
            }
            entry.signature = signature;
            entry.seedId = plant.seedId;
        }

        // 1. Körper zeichnen — bei Wind um den Fußpunkt gekippt, sodass die Pflanze
        //    im Boden verwurzelt bleibt und nur die Krone mitgeht.
        const sway = simplifyPlantUi ? 0 : profile.sway;
        if (sway > 0.01) {
            const phase = this._swayPhase(cellX, cellY);
            const angle = Math.sin(this.frame * 0.021 + phase) * sway * 0.035;
            this.ctx.save();
            this.ctx.translate(baseX, baseY);
            this.ctx.rotate(angle);
            this.ctx.drawImage(entry.canvas, blitX - baseX, blitY - baseY);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(entry.canvas, blitX, blitY);
        }

        // 2. For multi-use: draw each fruit dynamically with weather + per-slot special effect
        if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
            if (!inStructure && plant.fruitSlots.length > 0) {
                const visuals = getPlantVisuals(plant.seedId, plant.singleUse);
                const slotCount = plant.fruitSlots.length;
                const cycle = Math.max(1, plant.fruitCycleMs || 60000);
                const maxSlotsToDraw = simplifyPlantUi ? Math.min(2, slotCount) : Math.min(MAX_VISIBLE_FRUITS, slotCount);
                // Früchte hängen in der Krone der jeweiligen Wuchsform, nicht pauschal
                // eine halbe Kachel über dem Boden.
                const canopyY = baseY - spriteH * profile.canopy;
                const radius = Math.min(spriteH * 0.30, TILE_SIZE * 0.42);
                const img = this._getImage(visuals.fruitImage);

                for (let i = 0; i < maxSlotsToDraw; i++) {
                    const slot = plant.fruitSlots[i];
                    const angle = (Math.PI * 2 * i) / slotCount - Math.PI / 2;
                    const fx = baseX + Math.cos(angle) * radius;
                    // Flacher Bogen statt Kreis: mit 0.7 lag die oberste Frucht deutlich
                    // ueber der Laubzone und schwebte ueber der Pflanze.
                    const fy = canopyY + Math.sin(angle) * radius * 0.42;

                    const slotProgress = Math.max(0, Math.min(1, 1 - ((slot.readyAt || now) - now) / cycle));
                    const sizeScaleFruit = visualScaleFromFruitSize(slot.size);
                    const fruitSize = TILE_SIZE * (0.12 + slotProgress * 0.4) * sizeScaleFruit;

                    // Overlay je Frucht: Sonderform UND Wetter-Effekt hängen am Fruchtstand,
                    // nicht an der Staude — zwei Früchte am selben Strauch können also
                    // unterschiedlich aussehen.
                    const fruitSpecial = (!simplifyPlantUi && slot.specialType) || null;
                    const fruitEffect = slot.statusEffect || null;
                    const overlay = simplifyPlantUi ? null : this._resolveItemOverlay(fruitEffect, fruitSpecial);

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
     * Stützgerüst-Layer. Hängt nur an (Archetyp, Höhenstufe) — ein einziges Spalier-Canvas
     * bedient alle Gurken auf dem Acker. 13 Archetypen × 6 Stufen = höchstens 78 Canvases.
     */
    _getSupportLayer(archetypeKey, profile, spriteH, geo) {
        const maxH = TILE_SIZE * profile.heightTiles;
        const step = Math.max(0, Math.min(5, Math.round((spriteH / maxH) * 5)));
        const cacheKey = `${archetypeKey}:${step}`;
        const cached = this._supportCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const canvas = document.createElement("canvas");
        canvas.width = geo.w;
        canvas.height = geo.h;
        const sctx = canvas.getContext("2d");
        if (!sctx) {
            this._supportCache.set(cacheKey, null);
            return null;
        }
        const h = maxH * (step / 5);
        this._paintSupport(sctx, profile.support, geo.w / 2, geo.h - geo.pad, h, TILE_SIZE * profile.widthScale * 0.5);
        this._supportCache.set(cacheKey, canvas);
        return canvas;
    }

    /** Prozedurale Wuchsgerüste — das ist es, was Gurke, Kirschbaum und Karotte auf einen Blick trennt. */
    _paintSupport(ctx, kind, cx, baseY, h, halfW) {
        if (!kind || kind === "none" || h <= 6) return;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (kind === "trunk") {
            const trunkH = h * 0.5;
            const w = Math.max(3, h * 0.085);
            ctx.fillStyle = SUPPORT_COLORS.wood;
            ctx.beginPath();
            ctx.moveTo(cx - w * 1.5, baseY);
            ctx.lineTo(cx - w * 0.5, baseY - trunkH);
            ctx.lineTo(cx + w * 0.5, baseY - trunkH);
            ctx.lineTo(cx + w * 1.5, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = SUPPORT_COLORS.woodLight;
            ctx.fillRect(cx - w * 0.45, baseY - trunkH, w * 0.42, trunkH);
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, w * 0.55);
            ctx.beginPath();
            ctx.moveTo(cx, baseY - trunkH * 0.78);
            ctx.lineTo(cx - h * 0.16, baseY - trunkH * 1.05);
            ctx.moveTo(cx, baseY - trunkH * 0.6);
            ctx.lineTo(cx + h * 0.15, baseY - trunkH * 0.95);
            ctx.stroke();
        } else if (kind === "palm") {
            const trunkH = h * 0.66;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(4, h * 0.075);
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            ctx.quadraticCurveTo(cx - h * 0.07, baseY - trunkH * 0.55, cx - h * 0.05, baseY - trunkH);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.woodLight;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 1; i <= 5; i++) {
                const t = i / 6;
                const y = baseY - trunkH * t;
                const x = cx - h * 0.07 * t;
                ctx.moveTo(x - h * 0.035, y);
                ctx.lineTo(x + h * 0.035, y);
            }
            ctx.stroke();
        } else if (kind === "trellis") {
            const postH = h * 0.92;
            const sp = halfW * 0.85;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, h * 0.035);
            ctx.beginPath();
            ctx.moveTo(cx - sp, baseY); ctx.lineTo(cx - sp, baseY - postH);
            ctx.moveTo(cx + sp, baseY); ctx.lineTo(cx + sp, baseY - postH);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.twine;
            ctx.lineWidth = Math.max(1, h * 0.016);
            ctx.beginPath();
            for (let i = 1; i <= 3; i++) {
                const y = baseY - postH * (i / 3.4);
                ctx.moveTo(cx - sp, y); ctx.lineTo(cx + sp, y);
            }
            ctx.moveTo(cx - sp, baseY - postH * 0.1); ctx.lineTo(cx + sp, baseY - postH * 0.88);
            ctx.moveTo(cx + sp, baseY - postH * 0.1); ctx.lineTo(cx - sp, baseY - postH * 0.88);
            ctx.stroke();
        } else if (kind === "canes") {
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(1.5, h * 0.032);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const t = (i / 4 - 0.5) * 2;
                ctx.moveTo(cx, baseY);
                ctx.quadraticCurveTo(cx + t * halfW * 0.5, baseY - h * 0.8, cx + t * halfW * 1.05, baseY - h * 0.5);
            }
            ctx.stroke();
        } else if (kind === "post") {
            const postH = h * 0.85;
            const w = Math.max(3, h * 0.07);
            ctx.fillStyle = SUPPORT_COLORS.wood;
            ctx.fillRect(cx - w, baseY - postH, w * 2, postH);
            ctx.strokeStyle = SUPPORT_COLORS.twine;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 1; i <= 3; i++) {
                const y = baseY - postH * (i / 4);
                ctx.moveTo(cx - w * 2.4, y); ctx.lineTo(cx + w * 2.4, y);
            }
            ctx.stroke();
        } else if (kind === "stalks") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(2, h * 0.045);
            ctx.beginPath();
            for (let i = -1; i <= 1; i++) {
                ctx.moveTo(cx + i * halfW * 0.28, baseY);
                ctx.lineTo(cx + i * halfW * 0.52, baseY - h * 0.84);
            }
            ctx.stroke();
        } else if (kind === "stake") {
            // Nur ein schlanker Stab am Rand, keine quer über den Strauch gespannten
            // Schnüre mehr — die sahen aus wie „komische Sachen am Busch".
            const stakeH = h * 0.72;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, h * 0.038);
            ctx.beginPath();
            ctx.moveTo(cx + halfW * 0.62, baseY);
            ctx.lineTo(cx + halfW * 0.52, baseY - stakeH);
            ctx.stroke();
        } else if (kind === "rosette") {
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(2, h * 0.07);
            ctx.beginPath();
            for (let i = 0; i < 7; i++) {
                const a = -Math.PI + (i / 6) * Math.PI;
                ctx.moveTo(cx, baseY - 2);
                ctx.lineTo(cx + Math.cos(a) * halfW * 0.9, baseY - 2 + Math.sin(a) * h * 0.45);
            }
            ctx.stroke();
        } else if (kind === "runners") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(1.5, h * 0.05);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const t = (i / 3 - 0.5) * 2;
                ctx.moveTo(cx, baseY - 2);
                ctx.quadraticCurveTo(cx + t * halfW * 0.6, baseY - h * 0.3, cx + t * halfW * 1.1, baseY - 1);
            }
            ctx.stroke();
        } else if (kind === "mound") {
            ctx.fillStyle = SUPPORT_COLORS.soil;
            ctx.beginPath();
            ctx.ellipse(cx, baseY - 3, halfW * 0.9, h * 0.17, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = SUPPORT_COLORS.soilLight;
            ctx.beginPath();
            ctx.ellipse(cx, baseY - 5, halfW * 0.55, h * 0.10, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "stem") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(2, h * 0.05);
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            ctx.quadraticCurveTo(cx + h * 0.05, baseY - h * 0.45, cx, baseY - h * 0.82);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(1.5, h * 0.035);
            ctx.beginPath();
            ctx.moveTo(cx, baseY - h * 0.4);
            ctx.quadraticCurveTo(cx - halfW * 0.5, baseY - h * 0.5, cx - halfW * 0.75, baseY - h * 0.34);
            ctx.moveTo(cx, baseY - h * 0.55);
            ctx.quadraticCurveTo(cx + halfW * 0.5, baseY - h * 0.64, cx + halfW * 0.72, baseY - h * 0.48);
            ctx.stroke();
        }

        ctx.restore();
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

    /**
     * Pfad einer Terrain-Kachel. Der Ordner haengt an der Grafik-Einstellung:
     * "alt" zieht aus structure/_original/, sonst aus structure/.
     */
    _terrainSrc(kind, file) {
        return file ? STRUCTURE_DIR + file : null;
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
        const files = TERRAIN_FILES[kind] || [];
        const variantCount = files.length || 1;
        const variantIdx = this._getTileVariantIndex(kind, logicalX, logicalY, slotId, variantCount);
        const src = this._terrainSrc(kind, files[variantIdx] || files[0]);
        const img = this._getImage(src);
        if (img) {
            targetCtx.drawImage(img, x, y, size, size);
            return;
        }
        targetCtx.fillStyle = TERRAIN_FALLBACK_COLORS[kind] || (kind === "path" ? "#1e293b" : (kind === "tallGrass" ? "#14532d" : "#64748b"));
        targetCtx.fillRect(x, y, size, size);
    }

    _getImage(rawSrc) {
        if (!rawSrc) return null;
        // Zentrale Stelle fuer den Cache-Buster: alles, was auf die Leinwand kommt,
        // laeuft hier durch — Boden, Strukturen, Pflanzen, Deko, Tiere, Gebaeude.
        const src = versionedAsset(rawSrc);
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
        
        // Bildladen anstoßen BEVOR wir den Lade-Status abfragen
        const img = this._getImage(src);

        if (this._bildStatus(src) === "loading") {
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
        
        // Auch hier das Bild zuerst anfragen
        const img = this._getImage(src);

        if (this._bildStatus(src) === "loading") {
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
        const label = slot.owner ? `${slot.owner}` : "Zu verkaufen";
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

    /**
     * @param {number|null} playerY  Fußpunkt des Spielers
     * @param {"behind"|"front"|null} phase
     *
     * Gebäude wurden bisher pauschal NACH den Grundstücken gezeichnet — Inkubator und
     * Mülleimer stehen aber auf dem eigenen Acker und deckten den Charakter dadurch zu.
     * Jetzt entscheidet der Fußpunkt: was weiter oben steht, kommt vor den Spieler.
     */
    drawHubAreas(areas, readyEggsCount = 0) {
        if (!areas) return;
        // Auf einem Grundstueck stehende Bereiche sind schon einsortiert gezeichnet.
        const plotAreas = this._plotAreas || [];
        this._drawAreaBuilding(areas.seedShop, "#2563eb", "🌱", "Samen");
        this._drawAreaBuilding(areas.toolShop, "#9333ea", "🛠️", "Tools");
        this._drawAreaBuilding(areas.eggShop, "#0d9488", "🥚", "Eier");
        this._drawAreaBuilding(areas.decoShop, "#db2777", "🪴", "Deko");
        if (!plotAreas.includes(areas.incubator)) this._drawAreaBuilding(areas.incubator, "#14b8a6", "🧪", "Inkubator", readyEggsCount);
        this._drawAreaBuilding(areas.market, "#ea580c", "💰", "Verkauf");
        this._drawAreaBuilding(areas.petMarket, "#b45309", "🐾", "Tier-Verkauf");
        if (!plotAreas.includes(areas.trash)) this._drawAreaBuilding(areas.trash, "#57534e", "🗑️", "Müll");
        if (!plotAreas.includes(areas.chest)) this._drawAreaBuilding(areas.chest, "#a16207", "📦", "Kiste");
        if (!plotAreas.includes(areas.vitrine)) this._drawAreaBuilding(areas.vitrine, "#7c3aed", "🏆", "Vitrine");
    }

    _drawAreaBuilding(area, color, icon, label, readyEggsCount = 0) {
        // `aktiv: false` = noch nicht gekauft (Kiste, Vitrine)
        if (!area || area.aktiv === false) return;
        const { ctx, frame } = this;
        const image = this._getImage(area.image);
        
        const art = bauart(area);
        const isIncubator = art === "incubator";
        const isPetMarket = art === "petMarket";
        // Kiste und Vitrine stehen wie Inkubator und Mülleimer auf dem Grundstück,
        // sind also klein gegenüber den Marktbuden am Kiesweg.
        const isKlein = art === "trash" || art === "chest" || art === "vitrine";
        const maxW = isKlein ? 80 : isIncubator ? 85 : isPetMarket ? 200 : 290;
        const maxH = isKlein ? 100 : isIncubator ? 70 : isPetMarket ? 160 : 235;

        if (image) {
            const naturalW = Math.max(1, image.naturalWidth || image.width || maxW);
            const naturalH = Math.max(1, image.naturalHeight || image.height || maxH);
            const scale = Math.min(maxW / naturalW, maxH / naturalH);
            const drawW = Math.round(naturalW * scale);
            const drawH = Math.round(naturalH * scale);
            // Gebäude auf einem Grundstück tragen einen Fußpunkt (Unterkante ihrer
            // 1×1-Kachel) und STEHEN darauf. Alles am Kiesweg hat keinen und bleibt
            // wie gehabt auf seiner Mitte zentriert.
            const oben = Number.isFinite(area.fussY)
                ? area.fussY - drawH
                : area.y - drawH / 2;
            ctx.drawImage(image, area.x - drawW / 2, oben, drawW, drawH);
            // Der Marker für fertige Eier hing bisher IM Ersatzkasten und war damit
            // nie zu sehen: sobald es ein Bild gibt (und das gibt es), kam der Code
            // nie an. Jetzt sitzt er über dem gezeichneten Inkubator.
            if (isIncubator && readyEggsCount > 0) {
                this._drawEierMarker(area.x, oben - 14, readyEggsCount);
            }
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

        if (isIncubator && readyEggsCount > 0) {
            this._drawEierMarker(area.x, area.y - 45, readyEggsCount);
        }
    }

    /**
     * „Hier ist etwas fertig" über dem Inkubator: Anzahl in einer Sprechblase, die
     * sanft auf und ab wippt. Die Bewegung ist der eigentliche Zweck — ein starrer
     * Punkt geht zwischen Pflanzen und Deko unter.
     */
    _drawEierMarker(x, y, anzahl) {
        const { ctx, frame } = this;
        const bob = Math.sin(frame * 0.1) * 4;
        const text = String(anzahl);
        ctx.save();
        ctx.font = "bold 15px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const breite = Math.max(26, ctx.measureText(text).width + 20);
        const mitteY = y + bob;
        ctx.fillStyle = "#7c3aed";
        ctx.beginPath();
        ctx.roundRect(x - breite / 2, mitteY - 12, breite, 24, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Spitze nach unten, damit klar ist, worauf sich der Marker bezieht.
        ctx.beginPath();
        ctx.moveTo(x - 5, mitteY + 11);
        ctx.lineTo(x, mitteY + 18);
        ctx.lineTo(x + 5, mitteY + 11);
        ctx.closePath();
        ctx.fillStyle = "#7c3aed";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, mitteY);
        ctx.restore();
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

    _renderHeldPlantEffect(item, urspungX, y) {
        let scale = 1;
        if (item.size) {
            scale = handScaleFromFruitSize(item.size);
        } else if (item.norm) {
            scale = handScaleFromPlantNorm(item.norm);
        }

        // Große Früchte rücken nach außen, sonst verschwindet die Figur dahinter.
        const x = urspungX + Math.max(0, scale - 1) * 14;
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
            if (this._bildStatus(imgSrc) === "loading") return;
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

    drawPlayer(player, selectedTool, heldItem = null, localPlayerName = "", playerAppearance = {}, badge = null, nametagStyle = "local") {
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
            this._drawPlayerNametag(px, py - 57, localPlayerName, nametagStyle, badge);
        }
    }
}