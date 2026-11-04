// hooks/useAckerUmzug.js
// Einmalige Korrekturen am Grundstück: Umzug auf ein anderes Grundstück (Deko, Tiere, Steinfelder
// mitnehmen, bei Reihenwechsel spiegeln) und die Umstellung des Ackers aufs Deko-Raster.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import { MAP_CONFIG, istAndereReihe, spiegleZeile, TILE_SIZE, kachelIstAcker } from "../engine/MapConfig";
import { normalizePlotUnlockedCells, freiesAckerfeld } from "../engine/gameConstants";
import { istBoden } from "../ui/deko";

export default function useAckerUmzug({
    showLobbyScreen, isInitialLoadDone, mySlotIndex, layout, plotUnlockedCells, plotPlants,
    decoPlacements, petPlacements, setDecoPlacements, setPetPlacements, setPlotUnlockedCells,
    setPlotPlants, notify, debouncedSave, ackerRasterMigriert, setAckerRasterMigriert,
}) {
    /**
     * Grundstück gewechselt? Alles mitnehmen, was am alten Platz klebt.
     *
     * Die Welten liegen nur im Arbeitsspeicher — nach einem Serverneustart vergibt die
     * Lobby die Plätze neu. Wer vorher unten stand und danach oben landet, wechselt
     * damit die REIHE, und daran hängen zwei verschiedene Altlasten:
     *
     *  1. Deko und Tiere speichern absolute Weltkoordinaten plus den Index ihres
     *     Grundstücks. Ohne Umrechnung lagen sie weiter an der alten Stelle — quer
     *     über der Karte auf fremdem Grund, während das eigene Grundstück leer war.
     *
     *  2. Freigelegte Steinfelder und die Pflanzen darauf zählen je nach Reihe ANDERS:
     *     oben wachsen die Erweiterungen nach oben (Reihe -1 bis -15), unten nach unten
     *     (Reihe 15 bis 29). Eine von unten mitgebrachte Reihe 16 landete oben rechnerisch
     *     unterhalb des Grundstücks — die Pflanzen standen auf dem Kiesweg.
     *
     * Das Grundstück ist zwischen den Reihen gespiegelt (der Acker liegt immer am Weg),
     * deshalb wird beim Reihenwechsel gespiegelt statt nur verschoben.
     */
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return;
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const ziel = layout.current.slots[mySlotIndex];
        if (!ziel) return;
        const obenkante = (slot) => (slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY);

        // ── Deko und Tiere: umrechnen, was auf einem anderen Grundstück verbucht ist ──
        const umziehen = (liste) => {
            if (!Array.isArray(liste) || liste.length === 0) return null;
            let geaendert = false;
            const neu = liste.map((eintrag) => {
                const alt = layout.current.slots[eintrag?.slotIndex];
                if (!alt || eintrag.slotIndex === mySlotIndex) return eintrag;
                geaendert = true;
                const x = Number.isFinite(eintrag.x) ? eintrag.x + (ziel.x - alt.x) : eintrag.x;
                let y = eintrag.y;
                if (Number.isFinite(y)) {
                    const relativ = y - obenkante(alt);
                    // Gleiche Reihe: schlicht verschieben. Andere Reihe: spiegeln, sonst
                    // landet Deko vom unteren Wiesenstreifen oben mitten im Acker.
                    y = alt.isTopRow === ziel.isTopRow
                        ? obenkante(ziel) + relativ
                        : obenkante(ziel) + MAP_CONFIG.territoryHeight - relativ;
                }
                return { ...eintrag, slotIndex: mySlotIndex, x, y };
            });
            return geaendert ? neu : null;
        };

        // ── Erweiterungsfelder: Zählweise der Reihe angleichen ───────────────────
        // Gültig sind oben -15..14, unten 0..29. Alles außerhalb stammt aus der
        // anderen Reihe und wird umgerechnet: Erweiterung n ist oben -n und unten 14+n.
        const andereReihe = (y) => istAndereReihe(y, ziel.isTopRow);
        const umrechnenY = (y) => spiegleZeile(y, ziel.isTopRow);

        const neueZellen = (() => {
            if (!Array.isArray(plotUnlockedCells) || plotUnlockedCells.length === 0) return null;
            let geaendert = false;
            const raus = plotUnlockedCells.map((key) => {
                const [xs, ys] = String(key).split("_");
                const y = Number(ys);
                if (!Number.isInteger(y) || !andereReihe(y)) return key;
                geaendert = true;
                return `${xs}_${umrechnenY(y)}`;
            });
            return geaendert ? normalizePlotUnlockedCells(raus) : null;
        })();

        const neuePflanzen = (() => {
            const keys = Object.keys(plotPlants || {});
            if (keys.length === 0) return null;
            let geaendert = false;
            const raus = {};
            // Erst alles übernehmen, was schon in der Zählweise dieser Reihe steht —
            // sonst könnte eine umgerechnete Pflanze eine bestehende überschreiben.
            const umzuziehen = [];
            for (const key of keys) {
                const y = Number(key.split("_")[1]);
                if (!Number.isInteger(y) || !andereReihe(y)) { raus[key] = plotPlants[key]; continue; }
                geaendert = true;
                umzuziehen.push(key);
            }
            for (const key of umzuziehen) {
                const [xs, ys] = key.split("_");
                const ziel = `${xs}_${umrechnenY(Number(ys))}`;
                // Ein gemischter Stand (beide Zählweisen gleichzeitig) sollte nicht
                // vorkommen, ein verspäteter PUT kann ihn aber erzeugen. Dann lieber
                // ein freies Nachbarfeld suchen als eine Pflanze verschwinden lassen.
                raus[raus[ziel] ? freiesAckerfeld(raus) || ziel : ziel] = plotPlants[key];
            }
            return geaendert ? raus : null;
        })();

        const neueDeko = umziehen(decoPlacements);
        const neueTiere = umziehen(petPlacements);
        if (!neueDeko && !neueTiere && !neueZellen && !neuePflanzen) return;
        if (neueDeko) setDecoPlacements(neueDeko);
        if (neueTiere) setPetPlacements(neueTiere);
        if (neueZellen) setPlotUnlockedCells(neueZellen);
        if (neuePflanzen) setPlotPlants(neuePflanzen);
        notify("Dein Grundstück liegt jetzt woanders — Acker, Deko und Tiere sind mitgezogen.");
        debouncedSave();
    }, [showLobbyScreen, isInitialLoadDone, mySlotIndex, decoPlacements, petPlacements,
        plotUnlockedCells, plotPlants, notify, debouncedSave]);

    /**
     * Rasterumstellung: Deko, die nach der Verschiebung auf dem Acker steht.
     *
     * Der Acker ist um eine halbe Kachel nach rechts gerückt, damit Acker- und
     * Dekoraster zusammenfallen (siehe dirtOffsetX in engine/MapConfig.js). Rechnerisch
     * kann dabei nichts ungültig werden — die gesperrten Spalten wurden WENIGER, nicht
     * mehr. Trotzdem läuft dieser Durchgang einmal je Spielstand: Gärten, die vor der
     * Ackerprüfung eingerichtet wurden, haben teils Stücke mitten im Feld stehen, und
     * ein zweites Mal sortiert er sie nicht (Marke im Spielstand).
     *
     * Bodenbeläge bleiben, wo sie sind: sie liegen UNTER allem und dürfen den Acker
     * überziehen — das ist beim Aufstellen ausdrücklich erlaubt.
     */
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone || ackerRasterMigriert) return;
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const slot = layout.current.slots[mySlotIndex];
        if (!slot) return;
        const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
        const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
        const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
        const eigene = decoPlacements.filter((d) => d && d.slotIndex === mySlotIndex);
        const ankerKachel = (d) => ({
            tx: Math.floor((d.x - slot.x) / TILE_SIZE),
            ty: Math.floor((d.y - drawY) / TILE_SIZE),
        });
        const belegt = new Set();
        for (const d of eigene) {
            if (istBoden(d)) continue;
            for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.add(k);
        }
        const passt = (tx, ty, w, h) => {
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < h; dy++) {
                    const cx = tx + dx;
                    const cy = ty - dy;
                    if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) return false;
                    if (belegt.has(`${cx}_${cy}`)) return false;
                    if (dy === 0 && kachelIstAcker(slot, cx, cy)) return false;
                }
            }
            return true;
        };
        // Ringweise nach außen suchen, damit ein verschobenes Stück möglichst nah an
        // seinem alten Platz stehen bleibt.
        const freierPlatz = (tx, ty, w, h) => {
            for (let r = 1; r <= maxTilesY; r++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                        if (passt(tx + dx, ty + dy, w, h)) return { tx: tx + dx, ty: ty + dy };
                    }
                }
            }
            return null;
        };

        let verschoben = 0;
        const naechste = decoPlacements.map((d) => {
            if (!d || d.slotIndex !== mySlotIndex || istBoden(d)) return d;
            const { tx, ty } = ankerKachel(d);
            if (!kachelIstAcker(slot, tx, ty)) return d;
            const w = d.width || 1;
            const h = d.height || 1;
            for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.delete(k);
            const ziel = freierPlatz(tx, ty, w, h);
            if (!ziel) { for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.add(k); return d; }
            const occupiedKeys = [];
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < h; dy++) occupiedKeys.push(`${ziel.tx + dx}_${ziel.ty - dy}`);
            }
            for (const k of occupiedKeys) belegt.add(k);
            verschoben++;
            return {
                ...d,
                x: slot.x + ziel.tx * TILE_SIZE + TILE_SIZE / 2,
                y: drawY + ziel.ty * TILE_SIZE + TILE_SIZE / 2,
                occupiedKeys,
            };
        });

        setAckerRasterMigriert(true);
        if (verschoben > 0) {
            setDecoPlacements(naechste);
            notify(`Der Acker liegt jetzt im selben Raster wie die Deko — ${verschoben} Stück wurden von der Erde geräumt.`);
        }
        debouncedSave();
    }, [showLobbyScreen, isInitialLoadDone, ackerRasterMigriert, mySlotIndex,
        decoPlacements, notify, debouncedSave]);
}
