// garden/migrations/plot.js
// Einmalige Umstellung des Steinfelds auf vier gleich große Blöcke.
//
// WARUM
// Die Erweiterung lag in 15 Reihen: Holzweg am Acker (r=1), sechs Reihen Stein,
// Querweg (r=8), sieben Reihen Stein. Der acker-nahe Block war damit 7×6 statt
// 7×7 — 182 Steinfelder statt der erwarteten 196. Wer die vier Blöcke nachzählt,
// kommt genau deshalb nicht auf 4×49.
//
// WAS SICH ÄNDERT
// Der Querweg rückt von r=8 auf r=9, die freiwerdende Reihe r=8 wird Stein:
//
//   vorher   r1 Weg | r2–r7 Stein (6) | r8 Weg | r9–r15  Stein (7)
//   nachher  r1 Weg | r2–r8 Stein (7) | r9 Weg | r10–r16 Stein (7)
//
// Die sechs acker-nahen Reihen behalten ihre Koordinaten — es bewegt sich NUR das
// äußere Band, und zwar um genau eine Kachel nach außen. Das ist die Variante mit
// der geringsten Bewegung; ein Einfügen direkt am Acker hätte alles verschoben.
//
// WAS MITGEZOGEN WIRD
// Freigelegte Felder und Pflanzen — beide hängen an Zellkoordinaten und lassen sich
// hier verschieben. Es geht nichts verloren und nichts wird überschrieben: die neue
// Steinreihe entsteht dort, wo vorher der Weg lag, also auf einem Feld, auf dem
// ohnehin nie etwas stehen konnte.
//
// NICHT MITGEZOGEN werden Deko und Tiere. Die führen absolute Weltkoordinaten, und
// die hängen am Platz in der Welt — den vergibt die Lobby bei jedem Neustart neu,
// der Server kennt ihn hier nicht. Wer Deko genau auf dem äußeren Steinband stehen
// hatte, findet sie danach eine Kachel neben ihrem Feld und kann sie mit einem
// Klick zurücksetzen. Verloren geht dabei nichts.

const { SEED_CATALOGUE } = require("../core/catalogue");

const BASE_ROWS = 15;
const SPALTEN = 15;
const WEG_SPALTE = 7;
/** Der Weg quer durch den Acker — 15×15 sind 7×7, Weg, 7×7. */
const ACKER_WEG = 7;
/** Muss zu world/mail.js passen: Sendungen je Briefkasten, Anhänge je Sendung. */
const MAIL_MAX_ITEMS = 50;
const MAIL_MAX_ANHANG = 12;
const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));
/** Erste Reihe, die nach außen rückt (der alte Querweg lag auf r=8). */
const AB_REIHE = 9;
/** Reihen des ALTEN Rasters: Weg am Acker, Querweg, und wie viele es gab. */
const ALT_QUERWEG = 8;
const ALT_REIHEN = 15;
const MARKE = "plotSteinreihen3";
/** Erste Fassung der Umstellung — verschob nur, ohne die alte Zählweise zu lösen. */
const MARKE_ALT = "plotSteinreihen2";
/**
 * Eigene Marke für das Räumen der Wege. Muss von MARKE getrennt bleiben: die
 * Verschiebung war schon ausgerollt, als es das Räumen noch nicht gab — an
 * derselben Marke liefe es nie bei denen, die es brauchen.
 */
const MARKE_WEGE = "plotWegeGeraeumt";

/** Reihe einer Zellzeile, vom Acker weg gezählt. Null im Acker selbst. */
function reihe(y) {
    if (y < 0) return -y;                                   // obere Grundstücksreihe
    if (y >= BASE_ROWS) return y - BASE_ROWS + 1;           // untere Grundstücksreihe
    return 0;
}

/** Neue Zellzeile nach der Umstellung. */
function neueZeile(y) {
    if (reihe(y) < AB_REIHE) return y;
    return y < 0 ? y - 1 : y + 1;
}

/**
 * Die alte Zählweise in echte Felder übersetzen — im ALTEN Raster.
 *
 * Ältere Spielstände führten keine Liste freigelegter Felder, sondern nur eine
 * ANZAHL Reihen (`plotExpansions`); die Liste wurde im Browser daraus erzeugt.
 * Diese Rechnung kennt aber nur 15 Reihen. Nach der Umstellung wanderten die
 * Pflanzen auf Reihe 16, die Freigabe blieb bei 15 stehen — die äußerste Reihe war
 * wieder Stein, mit der alten Saat darauf. Deshalb wird hier einmalig eine echte
 * Liste geschrieben; die Zählweise wird danach nicht mehr gebraucht.
 */
function ausAlterZaehlweise(expansions, obereReihe) {
    const level = Math.max(0, Math.min(ALT_REIHEN, Number(expansions) || 0));
    const raus = [];
    for (let row = 2; row <= level; row++) {
        if (row === ALT_QUERWEG) continue;                 // alter Querweg
        const y = obereReihe ? -row : BASE_ROWS + row - 1;
        for (let x = 0; x < SPALTEN; x++) {
            if (x === WEG_SPALTE) continue;                // senkrechter Weg
            raus.push(`${x}_${y}`);
        }
    }
    return raus;
}

/**
 * Liegt diese Kachel auf einem Weg? Genau die Fälle, die `getHoveredCell` im
 * Browser ablehnt: die senkrechte Wegspalte, der Weg quer durch den Acker und
 * die beiden Holzwege im Steinfeld. Auf keiner davon kann man legitim pflanzen.
 */
function istWegkachel(schluessel) {
    const [xs, ys] = String(schluessel).split("_");
    if (Number(xs) === WEG_SPALTE) return true;
    const y = Number(ys);
    if (!Number.isInteger(y)) return false;
    if (y >= 0 && y < BASE_ROWS) return y === ACKER_WEG;
    return y < 0
        ? (y === -1 || y === -AB_REIHE)
        : (y === BASE_ROWS || y === BASE_ROWS + AB_REIHE - 1);
}

/** Erstes freies Feld des Grundstücks — Acker zuerst, dann freigelegter Stein. */
function freieKachel(state, belegt) {
    for (let y = 0; y < BASE_ROWS; y++) {
        if (y === ACKER_WEG) continue;
        for (let x = 0; x < SPALTEN; x++) {
            if (x === WEG_SPALTE) continue;
            const k = `${x}_${y}`;
            if (!belegt.has(k)) return k;
        }
    }
    for (const k of state.plotUnlockedCells || []) {
        if (!belegt.has(k)) return k;
    }
    return null;
}

/**
 * Schickt Samen als Sendung in den Briefkasten zurück. Rückgabe: wie viele
 * angenommen wurden. Ist der Briefkasten voll, wird NICHTS verworfen — der Rest
 * bleibt liegen und wird oben protokolliert.
 */
function samenZurueck(state, pflanzen) {
    if (!pflanzen || pflanzen.length === 0) return 0;
    const box = Array.isArray(state.mailbox) ? state.mailbox : [];
    const platz = Math.max(0, MAIL_MAX_ITEMS - box.length) * MAIL_MAX_ANHANG;
    if (platz === 0) return 0;

    const anhaenge = [];
    for (const pflanze of pflanzen.slice(0, platz)) {
        const seedId = pflanze?.seedId;
        if (!seedId) continue;
        const k = KATALOG.get(seedId);
        anhaenge.push({
            seedId,
            name: pflanze.name || k?.name || seedId,
            rarity: pflanze.rarity || k?.rarity || "COMMON",
            singleUse: k ? k.singleUse !== false : pflanze.singleUse !== false,
            shopPrice: Number(k?.shopPrice) || Number(pflanze.shopPrice) || 0,
        });
    }
    if (anhaenge.length === 0) return 0;

    const sendungen = [];
    for (let i = 0; i < anhaenge.length; i += MAIL_MAX_ANHANG) {
        const teil = anhaenge.slice(i, i + MAIL_MAX_ANHANG);
        sendungen.push({
            id: `plotmig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            from: "gärtnerei",
            sentAt: Date.now(),
            gold: 0,
            message: "Diese Saat stand auf einem Holzweg und hatte dort keinen Boden. Hier ist sie zurück.",
            seeds: teil, items: [], pets: [],
            // Einzelfelder für Browser, die die Listen noch nicht kennen (siehe world/mail.js)
            seed: teil[0] || null, item: null, pet: null,
            claimed: false,
        });
    }
    state.mailbox = [...sendungen, ...box].slice(0, MAIL_MAX_ITEMS);
    return anhaenge.length;
}

function verschiebeSchluessel(schluessel) {
    const teile = String(schluessel).split("_");
    if (teile.length !== 2) return schluessel;
    const y = Number(teile[1]);
    if (!Number.isInteger(y)) return schluessel;
    return `${teile[0]}_${neueZeile(y)}`;
}

/**
 * Stellt alle Spielstände um. Idempotent: ein Stand mit der Marke wird übersprungen.
 *
 * Ob ein Grundstück oben oder unten liegt, muss hier NICHT bekannt sein: die
 * Zellzeile trägt es schon in sich (negativ = obere Reihe, ab 15 = untere), und
 * `neueZeile` schiebt in beide Richtungen jeweils vom Acker weg.
 */
function runPlotMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let felder = 0;
    let pflanzen = 0;
    let uebersetzt = 0;
    let nachgereicht = 0;
    let wegeGeraeumt = 0;
    let umgezogen = 0;
    let zurueckgeschickt = 0;
    let geraeumt = 0;

    for (const [userId, state] of entries) {
        if (!state || typeof state !== "object") continue;
        let veraendert = false;

        // ═══ Durchgang 1: Steinreihen verschieben ═════════════════════════════
        if (!state[MARKE]) {
        // Wer die erste Fassung schon hinter sich hat, darf NICHT ein zweites Mal
        // verschoben werden — für den bleibt nur die Nacharbeit unten.
        const schonVerschoben = state[MARKE_ALT] === true;

        const vorhanden = Array.isArray(state.plotUnlockedCells) ? state.plotUnlockedCells : [];
        const obereReihe = vorhanden.some((k) => Number(String(k).split("_")[1]) < 0)
            || Object.keys(state.plotPlants || {}).some((k) => Number(String(k).split("_")[1]) < 0);

        // ── Freigelegte Felder ────────────────────────────────────────────────
        if (vorhanden.length === 0 && (Number(state.plotExpansions) || 0) > 0) {
            // Kein Verzeichnis, nur die alte Reihen-Anzahl: jetzt einmal ausschreiben
            // (im alten Raster) und mitverschieben.
            state.plotUnlockedCells = ausAlterZaehlweise(state.plotExpansions, obereReihe)
                .map(verschiebeSchluessel);
            felder += state.plotUnlockedCells.length;
            uebersetzt++;
        } else if (!schonVerschoben) {
            const neu = vorhanden.map(verschiebeSchluessel);
            felder += neu.filter((k, i) => k !== vorhanden[i]).length;
            state.plotUnlockedCells = neu;
        }

        // ── Pflanzen ──────────────────────────────────────────────────────────
        if (!schonVerschoben && state.plotPlants && typeof state.plotPlants === "object") {
            const neu = {};
            for (const [k, pflanze] of Object.entries(state.plotPlants)) {
                const nk = verschiebeSchluessel(k);
                if (nk !== k) {
                    pflanzen++;
                    // cellY wird an manchen Stellen mitgeführt (handleMovePlantWithPot)
                    if (pflanze && Number.isInteger(pflanze.cellY)) pflanze.cellY = neueZeile(pflanze.cellY);
                }
                neu[nk] = pflanze;
            }
            state.plotPlants = neu;
        }

        state[MARKE] = true;
        state[MARKE_ALT] = true;
        staende++;
        veraendert = true;
        }

        // ═══ Durchgang 2: Wege räumen ═════════════════════════════════════════
        // EIGENE Marke, und das ist der ganze Punkt: Durchgang 1 lief bereits, bevor
        // es diesen hier gab. Hinge die Räumung an derselben Marke, liefe sie genau
        // bei den Spielständen NICHT, bei denen die Saat auf dem Steg steht.
        if (!state[MARKE_WEGE]) {
        // ── Wegkacheln aus der Freigabeliste werfen ───────────────────────────
        // Die alte Rückfall-Rechnung gab ganze Reihen frei, die beiden Holzwege und
        // die Wegspalte eingeschlossen; der Browser hat diese Liste dann gespeichert.
        // Wen das getroffen hat, der konnte mitten auf den Steg pflanzen.
        if (Array.isArray(state.plotUnlockedCells)) {
            const vorherZahl = state.plotUnlockedCells.length;
            state.plotUnlockedCells = state.plotUnlockedCells.filter((k) => !istWegkachel(k));
            wegeGeraeumt += vorherZahl - state.plotUnlockedCells.length;
        }

        // ── Was auf einem Weg steht, muss herunter ────────────────────────────
        // Sonst zieht das Sicherheitsnetz weiter unten die Kachel gleich wieder in
        // die Freigabeliste, und der Steg bliebe bepflanzt. Es geht dabei nichts
        // verloren: die Pflanze zieht mit ihrem gesamten Wachstum auf ein freies
        // Feld um. Nur wenn wirklich keines mehr frei ist, geht der Samen als
        // Sendung zurück in den Briefkasten.
        const aufWegen = Object.keys(state.plotPlants || {}).filter(istWegkachel);
        if (aufWegen.length > 0) {
            const belegt = new Set(Object.keys(state.plotPlants));
            const heimatlos = [];
            for (const alt of aufWegen) {
                const ziel = freieKachel(state, belegt);
                if (!ziel) { heimatlos.push(state.plotPlants[alt]); }
                else {
                    const pflanze = state.plotPlants[alt];
                    const [zx, zy] = ziel.split("_").map(Number);
                    // cellX/cellY werden an manchen Stellen mitgeführt (handleMovePlantWithPot)
                    if (pflanze && Number.isInteger(pflanze.cellX)) pflanze.cellX = zx;
                    if (pflanze && Number.isInteger(pflanze.cellY)) pflanze.cellY = zy;
                    state.plotPlants[ziel] = pflanze;
                    belegt.add(ziel);
                    umgezogen++;
                }
                delete state.plotPlants[alt];
                belegt.delete(alt);
            }
            zurueckgeschickt += samenZurueck(state, heimatlos);
        }

        // ── Sicherheitsnetz: worauf etwas wächst, muss auch freigelegt sein ───
        // Fängt jeden Fall ab, in dem Pflanze und Freigabe auseinandergelaufen
        // sind — genau das Bild „oberste Reihe wieder Stein, alte Saat obendrauf".
        const frei = new Set(state.plotUnlockedCells || []);
        let dazu = 0;
        for (const k of Object.keys(state.plotPlants || {})) {
            const y = Number(String(k).split("_")[1]);
            if (!Number.isInteger(y)) continue;
            if (y >= 0 && y < BASE_ROWS) continue;   // Acker ist immer nutzbar
            if (frei.has(k)) continue;
            frei.add(k);
            dazu++;
        }
        if (dazu > 0) {
            state.plotUnlockedCells = [...frei];
            nachgereicht += dazu;
        }

        state[MARKE_WEGE] = true;
        geraeumt++;
        veraendert = true;
        }

        // Deko und Tiere führen absolute WELTkoordinaten, und die hängen am Platz in
        // der Welt — den vergibt die Lobby bei jedem Neustart neu, der Server kann
        // ihn hier also nicht kennen. Diese beiden Listen zieht deshalb der Browser
        // nach, sobald der Spieler die Welt betritt (siehe GameContainer, derselbe
        // Effekt, der schon den Reihenwechsel abfängt).

        if (!veraendert) continue;
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        // Merken, dass der SERVER diesen Stand verändert hat — nicht der Spieler.
        // Ein Browser, dessen Tab den Neustart überlebt hat, darf seinen älteren
        // Stand dann nicht einfach nachreichen, sondern muss neu laden.
        state.serverAenderungAb = state.stateVersion;
        if (felder || pflanzen) {
            console.log(`[Garden] Steinfeld umgestellt für ${userId}: `
                + `${state.plotUnlockedCells?.length || 0} Felder, ${Object.keys(state.plotPlants || {}).length} Pflanzen`);
        }
    }

    if (staende > 0 || geraeumt > 0) {
        console.log(`[Garden] Steinfeld-Umstellung: ${staende} Spielstände verschoben, `
            + `${felder} Felder, ${pflanzen} Pflanzen, ${uebersetzt} alte Zählweisen übersetzt.`);
        console.log(`[Garden] Wege geräumt: ${geraeumt} Spielstände, ${wegeGeraeumt} Kacheln, `
            + `${umgezogen} Pflanzen vom Weg umgezogen, ${zurueckgeschickt} Samen per Post zurück, `
            + `${nachgereicht} bepflanzte Felder nachträglich freigelegt.`);
        scheduleFarmsSave?.(farmStates);
    }
    return { staende, geraeumt, felder, pflanzen, uebersetzt, nachgereicht, wegeGeraeumt, umgezogen, zurueckgeschickt };
}

module.exports = {
    runPlotMigration, neueZeile, verschiebeSchluessel, ausAlterZaehlweise,
    istWegkachel, MARKE, MARKE_ALT, MARKE_WEGE, AB_REIHE,
};
