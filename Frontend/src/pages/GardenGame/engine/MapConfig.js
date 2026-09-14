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

    // War 28 — mit dirtOffsetX=7 (7 Kacheln Rand links) blieben rechts nur 6.
    // Der Acker sitzt auf `slot.x + dirtOffsetX` und bleibt bei 15 Kacheln breit,
    // eine zusätzliche Spalte GRUNDSTÜCKSBREITE legt sich also als zusätzliche
    // Graskachel rein rechts an — links bleibt alles exakt, wie es war (Acker-
    // und Dekoraster hängen an dirtOffsetX, nicht an territoryWidth).
    territoryWidth: 29 * TILE_SIZE,
    // v2-Fundament: war 33 (1 Rand + 15 Acker + 1 Rand + 16 Stein), der Acker ist
    // jetzt nur noch ein 7×7-Block statt zwei — dieselbe Rechnung mit 7 statt 15
    // ergibt 25. Ohne diese Kürzung bliebe hinter dem (jetzt näher am Acker
    // liegenden) Steinfeld ein Streifen ungenutztes Gras stehen, der vorher vom
    // zweiten Acker-Band gefüllt war. Muss zu GRUNDSTUECK_KACHELN_Y in
    // routes/gardenGameRoutes.js passen.
    territoryHeight: 25 * TILE_SIZE,

    // v2-Fundament: Acker ist nur noch EIN 7x7-Block (vorher zwei, siehe Steinfeld-
    // Kommentar unten — die zweite Hälfte ist jetzt Teil des Steinfelds). Die Breite
    // bleibt 15 (7 + senkrechter Weg + 7), weil der Weg auch das Steinfeld links/
    // rechts teilt und Acker- und Steinraster dieselbe Spaltenzahl brauchen.
    baseDirtWidth: 15 * TILE_SIZE,
    baseDirtHeight: 7 * TILE_SIZE,
    /**
     * Abstand des Ackers zur linken Grundstueckskante — in GANZEN Kacheln.
     *
     * WARUM NICHT MEHR 6,5: das Grundstueck ist 28 Kacheln breit, der Acker 15. Mittig
     * gesetzt ergibt das 6,5 Kacheln Rand — und damit lag das ACKERRASTER um eine halbe
     * Kachel gegen das DEKORASTER verschoben. Deko rastet auf `slot.x` ein (siehe
     * platziereDeko im GameContainer), der Acker auf `slot.x + dirtOffsetX`. Sichtbar
     * war das an zwei Stellen: neben dem Acker blieb ein halbes Grasfeld stehen, und
     * Deko auf dem Holzweg des Steinfelds stand grundsaetzlich einen halben Schritt
     * daneben.
     *
     * Mit 7 fallen beide Raster zusammen. Der Acker sitzt dadurch eine halbe Kachel
     * weiter rechts (7 Kacheln Rand links, 6 rechts) — das faellt nicht auf, das schiefe
     * Raster tat es.
     *
     * Bestehende Gaerten ueberstehen die Verschiebung ohne Datenumbau: Pflanzen und
     * freigelegte Felder haengen an ZELLKOORDINATEN und ziehen mit, Deko haengt am
     * Dekoraster und bleibt liegen. Die fuer Deko gesperrten Spalten werden dabei
     * WENIGER (vorher 6–21, jetzt 7–21) — es kann also nichts nachtraeglich ungueltig
     * werden. Das Sicherheitsnetz dazu steht trotzdem im GameContainer
     * (ACKERRASTER_MARKE): landet doch etwas auf dem Acker, raeumt es das auf.
     */
    dirtOffsetX: 7 * TILE_SIZE,

    worldMargin: 8 * TILE_SIZE,
    expansionStep: TILE_SIZE,

    // Player movement — v2-Fundament: Kachel-Sprung statt kontinuierlicher
    // Bewegung (playerSpeed/playerSize von vorher sind damit hinfällig, siehe
    // engine/InputHandler.js consumeHop und GameContainer.jsx Game-Loop).
    // War 150/160, dann 100/100 — beim Feedback vom 28.08. weiterhin "will
    // schneller laufen können". hopMs = hopRepeatMs, damit bei gehaltener Taste
    // der nächste Sprung exakt startet, sobald der vorige fertig ist (keine
    // Lücke, aber auch keine Überlappung).
    hopMs: 80,        // Dauer eines einzelnen Sprungs (Animation, Kachelmitte zu Kachelmitte)
    hopRepeatMs: 80,  // Abstand zwischen automatischen Folgesprüngen bei gehaltener Taste
    hopBobPx: 6,       // kleiner optischer Hüpfer nach oben während des Sprungs
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
// also 196 Steinfelder — UNVERÄNDERT seit v3.3. v2-Fundament rührt nur den
// ACKER an (siehe baseDirtHeight oben): der war zwei 7×7-Blöcke, davon fällt
// die vom Acker weiter entfernte Hälfte komplett weg (nicht zu Stein — einfach
// weg, das Grundstück ist dadurch insgesamt eine Bande kürzer). Die verbleibende
// Ackerhälfte rückt dadurch direkt ans bestehende Steinfeld heran, das selbst
// unangetastet bleibt: weiterhin 4 Blöcke, 196 Felder, dieselbe Formel. Bis v3.3
// war EXTRA_ROWS = 15 und der Querweg lag auf r = 8 — der acker-nahe Block hatte
// dadurch nur 7×6, und es waren 182 statt 196 (siehe garden/migrations/plot.js,
// DIESE Verschiebung betraf nur alte Spielstände von vor v3.3 und bleibt
// unberührt — sie hat mit der v2-Ackerkürzung nichts zu tun).
export const STEIN_REIHEN = 16;
const EXTRA_ROWS = STEIN_REIHEN;
/** Senkrechter Holzweg — teilt Acker UND Steinfeld in linke und rechte Hälfte. */
export const WEG_SPALTE = 7;
/** Länge eines Block-Zyklus: 1 Holzweg + 7 Stein. */
const STEINBLOCK_PERIODE = 8;
/** Wie viele der STEIN_REIHEN Holzweg sind — mirror für STEINFELDER_GESAMT-Formeln
 * in werkzeug.js (Backend) und GameContainer.jsx: STEINFELDER_GESAMT =
 * (STEIN_REIHEN - STEIN_WEG_REIHEN) * (Spalten - 1). */
export const STEIN_WEG_REIHEN = STEIN_REIHEN / STEINBLOCK_PERIODE;
/** Liegt Reihe r (1 = direkt am Acker, vom Acker weg gezählt) auf einem der
 * Holzwege im Steinfeld? Ersetzt die früheren Einzelvergleiche gegen genau EINEN
 * Quer-weg (MITTELWEG_REIHE) — mit mehr als einem Querweg reicht das nicht mehr. */
export function istSteinfeldWegRow(r) {
    return r >= 1 && (r - 1) % STEINBLOCK_PERIODE === 0;
}
/** Reihe des ERSTEN Querwegs — nur noch für Anzeige/Altcode, das Prüfen selbst
 * läuft über istSteinfeldWegRow bzw. istWegReihe. */
export const MITTELWEG_REIHE = 1 + STEINBLOCK_PERIODE; // 9

// Feedback 01.09.: "Lobby-Größe von 8 auf 6 reduzieren (3 Farmen oben, 3 unten)" —
// Default und Deckel waren 8. Muss zu WORLD_SLOTS in GameContainer.jsx UND
// MAX_SLOTS in Backend/garden/world/lobby.js passen (dieselbe Zahl aus drei
// verschiedenen Blickwinkeln: Layout, Spielaufruf, Server-Kapazität).
export function generatePlotSlots(playerCount = 6) {
    const slots = [];
    const totalPlots = Math.max(1, Math.min(6, playerCount));
    const totalPlotsPerRow = Math.ceil(totalPlots / 2);
    const startX = MAP_CONFIG.worldMargin;
    const maxTerritoryHeight = MAP_CONFIG.territoryHeight;

    // WICHTIG: für den ABSTAND zwischen Grundstücken zählt die Breite VOR der
    // zusätzlichen Graskachel rechts (siehe territoryWidth oben) — nicht die
    // erweiterte. Sonst rutscht jedes Grundstück ausser dem ersten einer Reihe
    // um eine Kachel nach rechts, sobald territoryWidth wächst: der Acker (der
    // sich aus dem NEUEN slot.x neu zeichnet) zöge mit, bereits gesetzte Deko
    // (an ABSOLUTEN Weltkoordinaten aus der Zeit VOR der Verschiebung) aber
    // nicht — sie stünde danach scheinbar eine Kachel zu weit links, mitten im
    // Beet oder im hohen Gras. Genau das ist am 21.08.2026 passiert und wieder
    // rückgängig gemacht: mit `spacingWidth` bleibt slot.x für JEDES Grundstück
    // exakt, was es vor der Graskachel-Erweiterung war.
    const spacingWidth = MAP_CONFIG.territoryWidth - TILE_SIZE;

    const centerPathTopY = MAP_CONFIG.worldMargin + maxTerritoryHeight;
    const centerPathBottomY = centerPathTopY + MAP_CONFIG.centerPathHeight;

    for (let i = 0; i < totalPlots; i++) {
        const isTopRow = i < totalPlotsPerRow;
        const colIndex = isTopRow ? i : i - totalPlotsPerRow;
        const x = startX + (colIndex * (spacingWidth + MAP_CONFIG.plotSpacing));
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
    const worldWidth = (MAP_CONFIG.worldMargin * 2) + (totalPlotsPerRow * spacingWidth) + (Math.max(0, totalPlotsPerRow - 1) * MAP_CONFIG.plotSpacing);
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

/**
 * Erste Ackerspalte im KACHELRASTER des Grundstuecks (Deko rastet auf dieses Raster
 * ein). Seit dirtOffsetX ganzzahlig ist, laesst sich der Acker in Kachelindizes
 * ausdruecken statt in Pixeln — die frueheren Pixelvergleiche hatten an beiden Raendern
 * je eine Spalte zu viel gesperrt, weil sie mit <= gegen die Kante pruften.
 */
export const ACKER_SPALTE_0 = Math.round(MAP_CONFIG.dirtOffsetX / TILE_SIZE);

/** Erste Ackerzeile im Kachelraster — oben liegt der Acker am unteren Rand. */
export function ackerZeile0(slot) {
    return slot?.isTopRow
        ? Math.round((MAP_CONFIG.territoryHeight - MAP_CONFIG.baseDirtHeight) / TILE_SIZE) - 1
        : 1;
}

/**
 * Ackerzelle unter einer Grundstueckskachel — oder null, wenn die Kachel Wiese ist.
 * Wegkacheln (senkrechter Holzweg und Querweg) gelten NICHT als Acker: dort waechst
 * ohnehin nichts, und seit die Raster zusammenfallen darf man sie schmuecken.
 */
export function ackerZelleAusKachel(slot, tileX, tileY) {
    const cols = Math.round(MAP_CONFIG.baseDirtWidth / TILE_SIZE);
    const rows = Math.round(MAP_CONFIG.baseDirtHeight / TILE_SIZE);
    const cellX = tileX - ACKER_SPALTE_0;
    const cellY = tileY - ackerZeile0(slot);
    if (cellX < 0 || cellX >= cols || cellY < 0 || cellY >= rows) return null;
    if (cellX === WEG_SPALTE) return null;
    return { cellX, cellY };
}

/** Liegt diese Grundstueckskachel auf bepflanzbarem Acker? */
export function kachelIstAcker(slot, tileX, tileY) {
    return ackerZelleAusKachel(slot, tileX, tileY) !== null;
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
        candidateY = Math.floor((worldY - topY) / TILE_SIZE) - EXTRA_ROWS; // -24..6
    } else {
        const bottomY = dirtY + baseDirtHeight + EXTRA_ROWS * TILE_SIZE;
        if (worldY < dirtY || worldY > bottomY) return null;
        candidateY = Math.floor((worldY - dirtY) / TILE_SIZE); // 0..30
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
    const aufWeg = cellX === WEG_SPALTE || istWegReihe(candidateY);
    if (aufWeg) {
        return pflanzen?.[key] ? { cellX, cellY: candidateY, nurRaeumen: true } : null;
    }

    if (candidateY >= 0 && candidateY < BASE_ROWS) return { cellX, cellY: candidateY };
    return unlocked.has(key) ? { cellX, cellY: candidateY } : null;
}

/**
 * Zellzeilen zählen je nach Grundstücksreihe anders: oben wachsen die Erweiterungen
 * nach oben (-1 … -24), unten nach unten (7 … 30). Erweiterung r ist oben -r und
 * unten 6+r. Wer beim Rejoin die Reihe wechselt, muss seine Felder umrechnen.
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

/** Liegt diese Zellzeile auf einem der Holzwege des Steinfelds? */
export function istWegReihe(cellY) {
    if (cellY < 0) return istSteinfeldWegRow(-cellY);
    if (cellY >= BASE_ROWS) return istSteinfeldWegRow(cellY - BASE_ROWS + 1);
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
        cellY = Math.floor((worldY - (dirtY - EXTRA_ROWS * TILE_SIZE)) / TILE_SIZE) - EXTRA_ROWS; // -24..-1
    } else {
        const startY = dirtY + baseDirtHeight;
        const endY = startY + EXTRA_ROWS * TILE_SIZE;
        if (worldY < startY || worldY >= endY) return null;
        cellY = BASE_ROWS + Math.floor((worldY - startY) / TILE_SIZE); // 7..30
    }
    // Holzwege (jetzt drei statt einem) gelten für BEIDE Ausrichtungen gleich —
    // istWegReihe kennt die Unterscheidung schon, keine eigene Kopie mehr nötig.
    if (istWegReihe(cellY)) return null;
    const key = `${cellX}_${cellY}`;
    if (unlocked.has(key)) return null;
    return { cellX, cellY, key };
}