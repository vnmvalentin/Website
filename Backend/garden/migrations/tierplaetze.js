// garden/migrations/tierplaetze.js
// Zurück auf drei Tierplätze — gekauftes Gold erstatten, überzählige Tiere zurückgeben.
//
// WARUM
// Seit dem Tier-Umbau (August 2026) zählt je Fähigkeit nur die HÖCHSTE platzierte
// Stufe. Ein zweiter Gärtner oder Erntehelfer bringt damit nichts, und die drei
// kaufbaren Plätze hatten nur noch eine Wirkung: mehr Goldfinder nebeneinander.
// Das ist genau das, was der Umbau abschaffen sollte — „mehr Tiere = mehr passives
// Einkommen". Drei Fähigkeiten, drei Plätze; die Regel erklärt sich damit von selbst.
//
// Nebeneffekt, der es zusätzlich richtig macht: `petSlots` lag in `toolInventory`
// und damit beim BROWSER. Ein veränderter Client konnte sich die Plätze schlicht
// eintragen, ohne zu zahlen. Mit einer festen Zahl gibt es nichts mehr zu fälschen.
//
// WAS PASSIERT
//   * Gold für die Plätze 4–6 kommt vollständig zurück (Preise unten).
//   * Was über drei Tiere hinaus auf dem Grundstück steht, wandert in den Rucksack.
//     GELIEHENE Tiere (Feld-Manager) gehen zuerst und zurück an ihren Eigentümer —
//     die gehören nicht dem Grundstücksbesitzer.
//   * `petSlots` wird aus dem Werkzeugkasten entfernt.
//
// Die Platzierungen gehören dem Browser. Er erfährt von der Änderung über
// `serverAenderungAb`: sein nächster Speicherversuch läuft in den 409 und lädt nach,
// statt die überzähligen Tiere wieder hinzustellen.

/**
 * Was die Plätze gekostet haben. Muss zu PET_SLOT_PREISE gepasst haben, wie es bis
 * August 2026 im GameContainer stand — die Tabelle ist dort mit dieser Migration
 * verschwunden, deshalb steht sie hier als Beleg für die Erstattung.
 */
const PREISE = { 4: 150_000_000, 5: 600_000_000, 6: 1_800_000_000 };
/** Drei Fähigkeiten, drei Plätze. Muss zu PET_SLOTS im GameContainer passen. */
const PLAETZE = 3;
const GOLD_MAX = 9_999_999_999_999;
const MARKE = "tierplaetzeAufDrei";

function liste(state, feld) {
    return Array.isArray(state?.[feld]) ? state[feld] : [];
}

function runTierplatzMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let erstattet = 0;
    let eingepackt = 0;
    let zurueckgegeben = 0;

    for (const [userId, state] of entries) {
        if (!state || typeof state !== "object" || state[MARKE]) continue;
        let veraendert = false;

        // ── Gold für gekaufte Plätze zurück ──────────────────────────────────
        const gekauft = Math.max(PLAETZE, Math.min(6, Number(state.toolInventory?.petSlots) || PLAETZE));
        if (state.toolInventory && "petSlots" in state.toolInventory) {
            const { petSlots, ...rest } = state.toolInventory;
            state.toolInventory = rest;
            veraendert = true;
        }
        if (gekauft > PLAETZE) {
            let summe = 0;
            for (let platz = PLAETZE + 1; platz <= gekauft; platz++) summe += PREISE[platz] || 0;
            if (summe > 0) {
                state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + summe);
                erstattet += summe;
                veraendert = true;
                console.log(`[Garden] Tierplätze erstattet an ${userId}: `
                    + `${summe.toLocaleString("de-DE")} Gold für ${gekauft - PLAETZE} Plätze.`);
            }
        }

        // ── Überzählige Tiere zurückgeben ────────────────────────────────────
        const platzierungen = liste(state, "petPlacements");
        if (platzierungen.length > PLAETZE) {
            // Geliehene zuerst: sie gehören jemand anderem, also ist ihr Platz der
            // erste, der frei wird. Der Rest der Reihenfolge bleibt, wie er war —
            // wer zuletzt hingestellt wurde, geht zuerst zurück in den Rucksack.
            const geliehen = platzierungen.filter((p) => p?.leihgabeVon);
            const eigene = platzierungen.filter((p) => !p?.leihgabeVon);

            for (const tier of geliehen) {
                const eigentuemer = farmStates.get
                    ? farmStates.get(String(tier.leihgabeVon))
                    : farmStates[String(tier.leihgabeVon)];
                if (!eigentuemer) continue;
                const { leihgabeVon, leihgabeLogin, leihgabeQuelle, x, y, vx, vy, changeDirAt, ...rein } = tier;
                eigentuemer.petInventory = [...liste(eigentuemer, "petInventory"),
                    { ...rein, id: leihgabeQuelle || rein.id }];
                eigentuemer.stateVersion = (Number(eigentuemer.stateVersion) || 0) + 1;
                eigentuemer.serverAenderungAb = eigentuemer.stateVersion;
                zurueckgegeben++;
            }

            const bleiben = eigene.slice(0, PLAETZE);
            const raus = eigene.slice(PLAETZE);
            state.petPlacements = bleiben;
            state.petInventory = [...liste(state, "petInventory"), ...raus.map((tier) => {
                const { x, y, vx, vy, changeDirAt, facingRight, ...rein } = tier;
                return rein;
            })];
            eingepackt += raus.length;
            veraendert = true;
        }

        state[MARKE] = true;
        staende++;
        if (!veraendert) continue;
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        // Die Platzierungen gehören dem Browser — ohne diese Marke stellt sein
        // nächster Speichervorgang die überzähligen Tiere einfach wieder hin.
        state.serverAenderungAb = state.stateVersion;
    }

    if (staende > 0 && (erstattet > 0 || eingepackt > 0 || zurueckgegeben > 0)) {
        console.log(`[Garden] Tierplätze auf ${PLAETZE}: ${erstattet.toLocaleString("de-DE")} Gold erstattet, `
            + `${eingepackt} Tiere eingepackt, ${zurueckgegeben} Leihgaben zurückgegeben.`);
        scheduleFarmsSave?.(farmStates);
    }
    return { staende, erstattet, eingepackt, zurueckgegeben };
}

module.exports = { runTierplatzMigration, MARKE, PLAETZE, PREISE };
