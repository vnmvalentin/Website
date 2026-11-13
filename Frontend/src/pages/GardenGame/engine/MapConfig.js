// engine/MapConfig.js
// Bleibt bei 64. Eine größere Kachel skaliert Pflanze UND Feld gleichmäßig — die
// Dichte bleibt exakt gleich, nur die Laufwege werden länger. Gegen das Gedränge
// wirken stattdessen zwei andere Hebel: die Kamera zoomt näher heran (WORLD_ZOOM in
// GameContainer) und die Pflanzen sind schmaler als ihre Kachel (widthScale in
// ARCHETYPE_PROFILES), sodass zwischen Nachbarn sichtbar Boden bleibt.
export const TILE_SIZE = 64;

// Lage der Grundstücke und der Weltkarte: siehe „Weltkarte" weiter unten
// (generatePlotSlots). Hier stehen nur noch die Maße EINES Grundstücks.
export const MAP_CONFIG = {
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
    // Freies Laufen (06.11.): Pixel je Sekunde. Das Hüpfen schaffte eine Kachel (64)
    // je 80 ms = 800/s; stufenlos wirkt dasselbe Tempo schneller, daher etwas weniger.
    laufTempo: 720,
    laufSchrittePS: 7, // Wipper-Schritte je Sekunde beim Laufen
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

// ─── Weltkarte „Dorfplatz am Teich“ (Phase 7) ───────────────────────────────
// Statt eines Rechtecks mit einem Kiesband in der Mitte: ein großer Dorfplatz mit
// Teich und Steg, die Straße mündet links und rechts hinein, rundherum Wald,
// Wäldchen und kleine Teiche. Entwurf: Fahrplan Phase 7, Schritt „karte“.
//
// Alle Maße stehen in KACHELN. Die Grundstücke selbst bleiben unverändert — Acker,
// Steinfeld, Schuppen und Deko hängen an Kacheln RELATIV zu slot.x/anchorY, also
// ziehen sie beim Verschieben mit. Nur `oben` (isTopRow) darf sich je Platz nicht
// ändern, sonst läge der Acker auf der anderen Seite.
//
// Reihenfolge der Plätze bleibt: 0–2 obere Reihe von links, 3–5 untere Reihe.
// Feedback 01.09.: 6 Plätze. Muss zu WORLD_SLOTS in GameContainer.jsx UND
// MAX_SLOTS in Backend/garden/world/lobby.js passen.
export const WELT_KACHELN_X = 141;
export const WELT_KACHELN_Y = 104;

const GRUNDSTUECK_KX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);   // 29
const GRUNDSTUECK_KY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);  // 25

/** Linke obere Kachel jedes Grundstücks. Die mittleren liegen direkt am Platz. */
const PLAETZE = [
    { kx: 12, ky: 22, oben: true },
    { kx: 56, ky: 9, oben: true },
    { kx: 100, ky: 22, oben: true },
    { kx: 12, ky: 57, oben: false },
    { kx: 56, ky: 70, oben: false },
    { kx: 100, ky: 57, oben: false },
];

/** Dorfplatz (Kies), als abgerundetes Rechteck — Kachelgrenzen einschließlich. */
const DORFPLATZ = { x0: 43, y0: 34, x1: 97, y1: 69, radius: 5 };
/** Straße von West nach Ost, mündet links und rechts in den Platz. */
const STRASSE = { x0: 9, x1: 131, y0: 47, y1: 56 };
/** Teiche: Mitte und Halbachsen in Kacheln. Der erste ist der Dorfteich. */
const TEICHE = [
    { cx: 70.5, cy: 52, rx: 11.5, ry: 6.5 },
    { cx: 116, cy: 89, rx: 6, ry: 3.4 },
    { cx: 121, cy: 13, rx: 4.5, ry: 3 },
];
/**
 * Kies auf dem Dorfplatz — der Rest des Platzes ist Park (Rasen, Blumen, Büsche).
 * `ring` ist der Rundweg um den Dorfteich (so viele Kacheln breiter als der Teich),
 * die Flächen tragen die Stände, die Wege führen zu den beiden Mittelgrundstücken.
 */
const PLATZ_KIES = {
    ring: 3.5,
    flaechen: [
        { x0: 44, x1: 57, y0: 35, y1: 46 },  // Einkaufen
        { x0: 84, x1: 97, y0: 35, y1: 46 },  // Verkaufen + Missionen
        { x0: 45, x1: 56, y0: 60, y1: 68 },  // Gold-Shop
        { x0: 84, x1: 97, y0: 60, y1: 68 },  // Händler + Erntefest
        { x0: 68, x1: 73, y0: 34, y1: 42 },  // Weg zum oberen Mittelgrundstück
        { x0: 68, x1: 73, y0: 62, y1: 69 },  // Weg zum unteren Mittelgrundstück
    ],
};
/** Holzsteg vom Südufer in den Dorfteich. */
const STEG = { x0: 70, x1: 71, y0: 53, y1: 58 };
/** Wäldchen zwischen den Grundstücken: Mitte + Radius in Kacheln. */
const WAELDCHEN = [
    { cx: 20, cy: 13, r: 3.5 },
    { cx: 48, cy: 15, r: 3 },
    { cx: 93, cy: 15, r: 3 },
    { cx: 48, cy: 85, r: 3 },
    { cx: 93, cy: 85, r: 3 },
    { cx: 26, cy: 90, r: 3.2 },
];

/**
 * Standplätze auf dem Dorfplatz, Kachelmitte (x.5 = Mitte einer Kachel).
 * Oben links Einkaufen, oben rechts Verkaufen + Missionen, unten die Besucher.
 * Zwischen den Ständen bleibt mindestens eine freie Kachel, und keiner steht in
 * der Mündung der Straße (Reihen 47–56) — der Laufweg bleibt frei.
 * Unten links der Gold-Shop, unten rechts Händler und Erntefest (05.11. eingebaut,
 * vorher nur Reiter am Missionsbrett).
 */
//
// Die Mitte jedes Stands liegt in der Höhe auf einer KACHELGRENZE (ganze Zahl): dann
// ist die Kachel direkt davor 2,5 Kacheln entfernt — außerhalb des Sperrkreises
// (130 px), aber in Reichweite zum Öffnen (180 px). Auf einer Kachelmitte (x.5)
// läge die Kachel davor im Sperrkreis und die nächste schon außer Reichweite.
const STANDORTE_KACHEL = {
    // 05.11.: acht statt sechs Kacheln zwischen den Ständen und eine Reihe mehr Luft
    // dazwischen — man soll bequem zwischen ihnen durchlaufen können.
    seedShop: [46.5, 38],
    toolShop: [54.5, 38],
    eggShop: [46.5, 44],
    decoShop: [54.5, 44],
    market: [86.5, 38],
    petMarket: [94.5, 38],
    questBoard: [90.5, 44],
    goldShop: [50.5, 64],
    haendler: [86.5, 64],
    erntefest: [94.5, 64],
    // 06.11.: Angelstelle auf dem Steg (STEG x 70–71, y 53–58). 10.11.: vorn am Stegkopf —
    // geangelt wird jetzt im Teich selbst, der Schwimmer landet im Wasser davor.
    angeln: [71, 54.4],
};
/** Startpunkt: zwischen dem Schild des oberen Mittelgrundstücks und dem Teich. */
const START_KACHEL = [70.5, 41.5];

/** Bodenarten der Weltkarte (außerhalb der Grundstücke). */
export const BODEN = { WIESE: 0, WALD: 1, WASSER: 2, KIES: 3, STEG: 4, GRUNDSTUECK: 5, BUSCH: 6 };

/** Liegt die Kachel auf einem Kiesweg des Dorfplatzes (Rundweg oder Standfläche)? */
function istPlatzKies(x, y) {
    const t = TEICHE[0];
    const r = PLATZ_KIES.ring;
    if (((x + 0.5 - t.cx) / (t.rx + r)) ** 2 + ((y + 0.5 - t.cy) / (t.ry + r)) ** 2 < 1) return true;
    return PLATZ_KIES.flaechen.some((f) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1);
}

function weltHash(x, y, salz) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salz | 0, 2246822519);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}
/** Weiches Rauschen 0..1 (Wertrauschen, bilinear) — für den Waldrand. */
export function weltRauschen(x, y, salz, groesse) {
    const gx = x / groesse, gy = y / groesse;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const sm = (t) => t * t * (3 - 2 * t);
    const u = sm(gx - x0), v = sm(gy - y0);
    const a = weltHash(x0, y0, salz), b = weltHash(x0 + 1, y0, salz);
    const c = weltHash(x0, y0 + 1, salz), d = weltHash(x0 + 1, y0 + 1, salz);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export { weltHash };

function imDorfplatz(x, y) {
    const { x0, y0, x1, y1, radius } = DORFPLATZ;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    // Ecken abrunden: Abstand der Kachelmitte zur Eck-Kreismitte
    const cx = Math.min(Math.max(x + 0.5, x0 + radius), x1 + 1 - radius);
    const cy = Math.min(Math.max(y + 0.5, y0 + radius), y1 + 1 - radius);
    return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius;
}

/** Bodenkarte der Welt, eine Zahl je Kachel (BODEN). Rein aus Zahlen, kein Zufall. */
function baueBoden(plaetze) {
    const W = WELT_KACHELN_X, H = WELT_KACHELN_Y;
    const boden = new Uint8Array(W * H);
    const setze = (x, y, art) => { if (x >= 0 && y >= 0 && x < W && y < H) boden[y * W + x] = art; };

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const rand = Math.min(x, W - 1 - x, y, H - 1 - y);
            const tiefe = 2.5 + weltRauschen(x, y, 7, 6) * 5;
            let art = rand < tiefe ? BODEN.WALD : BODEN.WIESE;
            for (const w of WAELDCHEN) {
                const d = Math.hypot(x + 0.5 - w.cx, y + 0.5 - w.cy);
                if (d < w.r + (weltRauschen(x, y, 13, 2.5) - 0.5) * 1.6) art = BODEN.WALD;
            }
            for (const t of TEICHE) {
                const d = ((x + 0.5 - t.cx) / t.rx) ** 2 + ((y + 0.5 - t.cy) / t.ry) ** 2;
                // Glatte Ellipse: der Renderer malt das Ufer genau so (layout.teiche),
                // dann passt die gesperrte Fläche zum sichtbaren Wasser.
                if (d < 1) art = BODEN.WASSER;
            }
            if (art !== BODEN.WASSER && imDorfplatz(x, y)) art = istPlatzKies(x, y) ? BODEN.KIES : BODEN.WIESE;
            if (art !== BODEN.WASSER && x >= STRASSE.x0 && x <= STRASSE.x1 && y >= STRASSE.y0 && y <= STRASSE.y1) {
                // Enden der Straße abgerundet statt eckig in den Wald
                const ende = Math.min(x - STRASSE.x0, STRASSE.x1 - x);
                const rand2 = Math.min(y - STRASSE.y0, STRASSE.y1 - y);
                if (ende >= 2 || rand2 >= 2 - ende) art = BODEN.KIES;
            }
            boden[y * W + x] = art;
        }
    }
    for (let y = STEG.y0; y <= STEG.y1; y++) for (let x = STEG.x0; x <= STEG.x1; x++) setze(x, y, BODEN.STEG);
    // Büsche im Park des Dorfplatzes: nur auf Rasen, der ringsum (8 Nachbarn) auch
    // Rasen ist — so steht keiner am Wegrand oder versperrt einen Durchgang.
    const busche = [];
    for (let y = DORFPLATZ.y0 + 1; y < DORFPLATZ.y1; y++) {
        for (let x = DORFPLATZ.x0 + 1; x < DORFPLATZ.x1; x++) {
            if (boden[y * W + x] !== BODEN.WIESE || weltHash(x, y, 61) > 0.09) continue;
            let frei = true;
            for (let dy = -1; dy <= 1 && frei; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (boden[(y + dy) * W + x + dx] !== BODEN.WIESE) { frei = false; break; }
            }
            if (frei) busche.push(y * W + x);
        }
    }
    for (const i of busche) boden[i] = BODEN.BUSCH;
    // Grundstücke zuletzt: dort ist nie Wald oder Wasser, eine Kachel Rand ringsum
    // bleibt ebenfalls frei (Wiese), damit man um jedes Grundstück herum kommt.
    for (const p of plaetze) {
        for (let y = p.ky - 1; y <= p.ky + GRUNDSTUECK_KY; y++) {
            for (let x = p.kx - 1; x <= p.kx + GRUNDSTUECK_KX; x++) {
                const innen = x >= p.kx && x < p.kx + GRUNDSTUECK_KX && y >= p.ky && y < p.ky + GRUNDSTUECK_KY;
                const i = y * W + x;
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                if (innen) boden[i] = BODEN.GRUNDSTUECK;
                else if (boden[i] === BODEN.WALD || boden[i] === BODEN.WASSER) boden[i] = BODEN.WIESE;
            }
        }
    }
    return boden;
}

/**
 * Laternen am Wegrand (06.11.): auf Rasen direkt neben Kies (Rundweg, Standflächen,
 * Wege) und auf den Randreihen der Straße. Nie neben einem Grundstück, nie nah an
 * einem Stand, mindestens LATERNEN_ABSTAND Kacheln voneinander — feste Reihenfolge,
 * also auf jedem Gerät dieselben Plätze. Rein zur Zierde: sie sperren nichts.
 */
const LATERNEN_ABSTAND = 7;
function setzeWegLaternen(boden, W, H, plaetze = []) {
    const art = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? BODEN.WALD : boden[y * W + x]);
    const nachbarn = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const standNah = (x, y) => Object.values(STANDORTE_KACHEL).some(([sx, sy]) => Math.abs(x + 0.5 - sx) < 4 && Math.abs(y + 0.5 - sy) < 4.6);
    const kandidaten = [];
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const a = art(x, y);
            let ok = false;
            if (a === BODEN.WIESE && imDorfplatz(x, y)) {
                ok = nachbarn.some(([dx, dy]) => art(x + dx, y + dy) === BODEN.KIES);
            } else if (a === BODEN.KIES && (y === STRASSE.y0 || y === STRASSE.y1) && (x < DORFPLATZ.x0 - 1 || x > DORFPLATZ.x1 + 1)) {
                ok = x - STRASSE.x0 >= 3 && STRASSE.x1 - x >= 3;
            }
            // Vor jedem Grundstück stehen mittig Namensschild und Briefkasten — dort keine Laterne
            const vorSchild = plaetze.some((p) => Math.abs(x + 0.5 - (p.kx + GRUNDSTUECK_KX / 2)) < 4.5 && Math.abs(y + 0.5 - (p.oben ? p.ky + GRUNDSTUECK_KY : p.ky)) < 3);
            if (!ok || vorSchild || standNah(x, y)) continue;
            let amGrundstueck = false;
            for (let dy = -1; dy <= 1 && !amGrundstueck; dy++) for (let dx = -1; dx <= 1; dx++) {
                const n = art(x + dx, y + dy);
                if (n === BODEN.GRUNDSTUECK || n === BODEN.STEG) { amGrundstueck = true; break; }
            }
            // An der Straße liegen die Grundstücke direkt an — dort reicht kein Rasenrand.
            if (amGrundstueck && a !== BODEN.KIES) continue;
            kandidaten.push([x, y]);
        }
    }
    const gewaehlt = [];
    for (const [x, y] of kandidaten) {
        if (gewaehlt.some(([gx, gy]) => Math.hypot(gx - x, gy - y) < LATERNEN_ABSTAND)) continue;
        gewaehlt.push([x, y]);
    }
    return gewaehlt.map(([x, y]) => ({
        x: (x + 0.5) * TILE_SIZE,
        // Fuß unten in der Kachel: die Laterne (60 px) bleibt so ganz in ihrer Kachel und
        // ragt nicht ins Grundstück darüber, das später gemalt wird und sie sonst abschnitt.
        y: (y + 1) * TILE_SIZE - 4,
    }));
}

export function generatePlotSlots(playerCount = 6) {
    const totalPlots = Math.max(1, Math.min(PLAETZE.length, playerCount));
    const plaetze = PLAETZE.slice(0, totalPlots);
    const slots = plaetze.map((p, i) => ({
        id: i + 1,
        x: p.kx * TILE_SIZE,
        // anchorY: oben die UNTERkante des Grundstücks (zur Straße/zum Platz), unten
        // die Oberkante — wie bisher, Acker und Steinfeld rechnen davon aus.
        anchorY: (p.oben ? p.ky + GRUNDSTUECK_KY : p.ky) * TILE_SIZE,
        isTopRow: p.oben,
        currentExpansions: 0,
        unlockedCells: [],
        owner: null,
        plants: {}, // key: "cellX_cellY" → plant instance
    }));

    const boden = baueBoden(plaetze);
    const W = WELT_KACHELN_X, H = WELT_KACHELN_Y;
    const standorte = {};
    for (const [art, [kx, ky]] of Object.entries(STANDORTE_KACHEL)) {
        standorte[art] = { x: kx * TILE_SIZE, y: ky * TILE_SIZE };
    }
    const laternen = setzeWegLaternen(boden, W, H, plaetze);

    return {
        slots,
        worldWidth: W * TILE_SIZE,
        worldHeight: H * TILE_SIZE,
        kachelnX: W,
        kachelnY: H,
        /** Bodenart der Kachel (BODEN), außerhalb der Welt Wald. */
        bodenAn: (kx, ky) => (kx < 0 || ky < 0 || kx >= W || ky >= H) ? BODEN.WALD : boden[ky * W + kx],
        /** Darf man diese Kachel betreten? Wald, Wasser und Büsche nicht, alles andere schon. */
        begehbar: (kx, ky) => {
            if (kx < 0 || ky < 0 || kx >= W || ky >= H) return false;
            const art = boden[ky * W + kx];
            return art !== BODEN.WALD && art !== BODEN.WASSER && art !== BODEN.BUSCH;
        },
        standorte,
        teiche: TEICHE.map((t) => ({ ...t })),
        // Für den Renderer: der Rundweg wird als glatte Ellipse gemalt, Kies in
        // diesen Rechtecken (Standflächen, Straße) bleibt kachelweise.
        rundweg: { cx: TEICHE[0].cx, cy: TEICHE[0].cy, rx: TEICHE[0].rx + PLATZ_KIES.ring, ry: TEICHE[0].ry + PLATZ_KIES.ring },
        kiesRechtecke: [...PLATZ_KIES.flaechen, { x0: STRASSE.x0, x1: STRASSE.x1, y0: STRASSE.y0, y1: STRASSE.y1 }],
        centerX: START_KACHEL[0] * TILE_SIZE,
        centerY: START_KACHEL[1] * TILE_SIZE,
        /** Laternen am Wegrand (Fußpunkt in Weltpixeln), gehen nachts an — siehe setzeWegLaternen. */
        laternen,
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