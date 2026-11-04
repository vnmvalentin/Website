// garden/core/auftraege.js
// Händler-Aufträge: „Bring mir 8 Kohl" — gegen Gold und Erfahrung.
//
// WARUM ES DAS GIBT (Feedback 02.11. „der Shop bringt nur Müll"): Billige Sorten
// hatten ab dem ersten Spieltag keinen Zweck mehr. Ein Auftrag zahlt neben dem
// Warenwert einen Bonus, der mit dem Level wächst — zehn Kohl sind auf Level 40
// damit wieder Millionen wert, aber nur so oft, wie der Händler fragt.
//
// WARUM SERVER: Geliefert wird aus `harvestedItems`, und das gehört schon dem
// Server (siehe README, „Wer wem gehört"). Welche Aufträge es gibt, steht im
// Spielstand (`state.auftraege`) und wird hier gewürfelt — der Browser zeigt nur.
//
// Aufbau: drei Plätze. Platz 0 fragt immer nach günstigen Sorten (Common/Uncommon),
// die beiden anderen nach Sorten, die zum Level passen. Ein Platz hat entweder
// einen Auftrag oder eine Pause, nach der ein neuer kommt.

const { SEED_CATALOGUE } = require("./catalogue");
const { levelZuXp, belohnungsLevel, xpTabelle, gibFesteXp, wirkung } = require("./skills");
const { verkaufswert, gutschreiben } = require("./economy");
const { wetterListe } = require("./weather");
const { pityGrenze } = require("./laden");

const PLAETZE = 3;
const LAUFZEIT_MS = 36 * 60 * 60 * 1000;
const PAUSE_NACH_LIEFERUNG_MS = 2 * 60 * 60 * 1000;
const PAUSE_NACH_ABLEHNEN_MS = 15 * 60 * 1000;

// Nur Sorten, die man innerhalb der Laufzeit auch liefern KANN: höchstens ein Tag
// Wachstum bzw. Fruchtzyklus, und im Laden spätestens nach zwölf Stunden zu haben
// (über den Nachziehzähler). Wer eine seltenere Sorte schon auf dem Acker stehen
// hat, bekommt sie trotzdem — siehe kandidaten().
const MAX_ZYKLUS_SEK = 24 * 60 * 60;
const MAX_LADEN_WARTEZEIT_ROTATIONEN = 12 * 12;

// Ab welchem Level eine Seltenheit gefragt wird.
const STUFE_AB = { COMMON: 1, UNCOMMON: 6, RARE: 12, EPIC: 20, LEGENDARY: 30 };
const MENGE = {
    COMMON: [5, 12], UNCOMMON: [3, 8], RARE: [2, 5], EPIC: [2, 4], LEGENDARY: [1, 3],
};

/**
 * Merkmale. `chance` je Auftrag, `menge` deckelt die Stückzahl (eine goldene
 * Frucht ist mit 4 % je Ernte schon Aufgabe genug), `wert` ist der Faktor auf den
 * erwarteten Stückwert, `aufschlag` was der Händler darüber hinaus zahlt.
 */
const MERKMALE = {
    keins:  { chance: 0.60, menge: Infinity, aufschlag: 1.5 },
    gross:  { chance: 0.20, menge: 3, aufschlag: 1.75, text: "ab Größe 35" },
    wetter: { chance: 0.12, menge: 2, aufschlag: 2.0, text: "mit Wetter-Effekt" },
    golden: { chance: 0.08, menge: 1, aufschlag: 2.0, text: "golden oder Regenbogen" },
};
const GROSS_AB = 35;

// Levelbonus je Auftrag — dieselbe Staffel wie bei den Missionen (×10 je zehn
// Level). Der Grundwert liegt unter einer Tagesmission, weil Aufträge öfter kommen.
const BONUS_BASIS = 3000;
const BONUS_FAKTOR_JE_ZEHN_LEVEL = 10;

const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

function zufallsInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }

function schoeneZahl(n) {
    if (n < 100) return Math.max(1, Math.round(n));
    const stellen = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / stellen) * stellen;
}

function zyklusSek(s) {
    return s.singleUse ? (s.growMinSec + s.growMaxSec) / 2 : s.fruitCycleSec;
}

/** Erwarteter Verkaufswert EINES Stücks mit diesem Merkmal (ohne Wetterglück). */
function stueckWert(s, merkmal) {
    const min = s.singleUse ? s.sellMin : s.fruitSellMin;
    const max = s.singleUse ? s.sellMax : s.fruitSellMax;
    // Fruchtgröße: norm = U^1,35 → im Mittel 1/2,35. Ab Größe 35 liegt norm
    // zwischen 0,69 und 1, im Mittel bei ~0,85.
    const norm = merkmal === "gross" ? 0.85 : 1 / 2.35;
    let wert = min + (max - min) * norm;
    if (merkmal === "golden") wert *= 2;
    if (merkmal === "wetter") wert *= 1.25;
    return wert;
}

function erfuellt(item, auftrag) {
    if (!item || item.seedId !== auftrag.seedId) return false;
    if (auftrag.merkmal === "gross") return (Number(item.size) || 0) >= GROSS_AB;
    if (auftrag.merkmal === "golden") {
        const name = String(item.specialData?.name || "").toLowerCase();
        return name === "golden" || name === "rainbow";
    }
    if (auftrag.merkmal === "wetter") return wetterListe(item).length > 0;
    return true;
}

/** Was auf dem eigenen Acker steht — damit seltene Sorten trotzdem drankommen. */
function sortenAufDemAcker(state) {
    const da = new Set();
    for (const p of Object.values(state?.plotPlants || {})) if (p?.seedId) da.add(p.seedId);
    return da;
}

function kandidaten(state, seltenheiten) {
    const acker = sortenAufDemAcker(state);
    // Kreuzungen nicht: die gibt es nur per Zufall auf dem Acker, nie im Laden.
    return SEED_CATALOGUE.filter((s) => !s.kreuzung && seltenheiten.includes(s.rarity)
        && zyklusSek(s) <= MAX_ZYKLUS_SEK
        && (pityGrenze(s) <= MAX_LADEN_WARTEZEIT_ROTATIONEN || acker.has(s.id)));
}

function erlaubteSeltenheiten(level) {
    return Object.entries(STUFE_AB).filter(([, ab]) => level >= ab).map(([r]) => r);
}

function waehleMerkmal(rng) {
    let r = rng();
    for (const [name, m] of Object.entries(MERKMALE)) {
        r -= m.chance;
        if (r <= 0) return name;
    }
    return "keins";
}

/**
 * Einen Auftrag für Platz `platz` würfeln. Platz 0 fragt günstig, die anderen
 * meist nach der höchsten freigeschalteten Seltenheit (60 %), sonst nach der
 * darunter.
 */
function neuerAuftrag(state, platz, now, rng = Math.random) {
    const level = levelZuXp(state?.xp);
    const erlaubt = erlaubteSeltenheiten(level);
    let stufen;
    if (platz === 0) {
        stufen = erlaubt.filter((r) => r === "COMMON" || r === "UNCOMMON");
    } else {
        const oben = erlaubt[erlaubt.length - 1];
        const darunter = erlaubt[erlaubt.length - 2] || oben;
        stufen = [rng() < 0.6 ? oben : darunter];
    }
    let pool = kandidaten(state, stufen);
    if (pool.length === 0) pool = kandidaten(state, ["COMMON"]);
    // Nicht zweimal dieselbe Sorte gleichzeitig.
    const schonGefragt = new Set((state.auftraege?.plaetze || []).map((p) => p?.seedId).filter(Boolean));
    const frei = pool.filter((s) => !schonGefragt.has(s.id));
    if (frei.length > 0) pool = frei;
    const sorte = pool[Math.floor(rng() * pool.length)];

    const merkmal = waehleMerkmal(rng);
    const [mMin, mMax] = MENGE[sorte.rarity] || [1, 3];
    const anzahl = Math.max(1, Math.min(MERKMALE[merkmal].menge, zufallsInt(rng, mMin, mMax)));

    const warenwert = anzahl * stueckWert(sorte, merkmal);
    // Über Level 50 gedämpft wie Missionen und Erntefest (belohnungsLevel, core/skills.js).
    const bonus = BONUS_BASIS * Math.pow(BONUS_FAKTOR_JE_ZEHN_LEVEL, (belohnungsLevel(state?.xp) - 1) / 10);
    const gold = schoeneZahl(warenwert * MERKMALE[merkmal].aufschlag + bonus);
    const xp = Math.max(1, Math.round(anzahl * (xpTabelle()[sorte.id] || 1) * 2));

    return {
        id: `a_${now.toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
        seedId: sorte.id,
        anzahl,
        merkmal: merkmal === "keins" ? null : merkmal,
        gold,
        xp,
        bis: now + LAUFZEIT_MS,
    };
}

/**
 * Plätze auffüllen: abgelaufene Aufträge und vorbei gegangene Pausen werden zu
 * neuen Aufträgen. Lazy wie bringeQuestsAufStand — läuft bei jeder Berührung.
 * Gibt zurück, ob sich etwas geändert hat (dann muss gespeichert werden).
 */
function bringeAuftraegeAufStand(state, now = Date.now(), rng = Math.random) {
    let geaendert = false;
    if (!state.auftraege || typeof state.auftraege !== "object" || !Array.isArray(state.auftraege.plaetze)) {
        state.auftraege = { plaetze: [], erledigt: 0 };
        geaendert = true;
    }
    const a = state.auftraege;
    for (let i = 0; i < PLAETZE; i++) {
        const p = a.plaetze[i];
        const leer = !p || typeof p !== "object";
        const abgelaufen = !leer && p.seedId && Number(p.bis) <= now;
        const pauseVorbei = !leer && !p.seedId && Number(p.pauseBis || 0) <= now;
        if (leer || abgelaufen || pauseVorbei) {
            // Erst leeren, damit die Sorte des alten Auftrags wieder frei ist.
            a.plaetze[i] = null;
            a.plaetze[i] = neuerAuftrag(state, i, now, rng);
            geaendert = true;
        }
    }
    a.plaetze.length = PLAETZE;
    return geaendert;
}

function findePlatz(state, auftragId) {
    const id = String(auftragId || "");
    const idx = (state.auftraege?.plaetze || []).findIndex((p) => p?.id === id && p.seedId);
    return idx;
}

/** Ansicht für die Anzeige. Für jeden Auftrag auch, wie viel davon im Rucksack liegt. */
function auftragUebersicht(state, now = Date.now()) {
    const items = Array.isArray(state.harvestedItems) ? state.harvestedItems : [];
    return {
        plaetze: state.auftraege.plaetze.map((p, i) => {
            if (!p?.seedId) return { platz: i, pauseBis: Number(p?.pauseBis) || now };
            const s = KATALOG.get(p.seedId);
            return {
                ...p,
                platz: i,
                name: s?.name || p.seedId,
                emoji: s?.emoji || "",
                rarity: s?.rarity || "COMMON",
                singleUse: s ? s.singleUse !== false : true,
                merkmalText: p.merkmal ? MERKMALE[p.merkmal]?.text || null : null,
                vorhanden: items.filter((it) => erfuellt(it, p)).length,
            };
        }),
        erledigt: Number(state.auftraege.erledigt) || 0,
    };
}

/**
 * Liefern: nimmt die GÜNSTIGSTEN passenden Stücke aus dem Rucksack — wer eine
 * Regenbogen-Frucht im Rucksack hat, verliert sie nicht an einen einfachen Auftrag,
 * solange es gewöhnliche gibt. Gold und Erfahrung werden hier gutgeschrieben.
 */
function auftragLiefern(state, auftragId, now = Date.now()) {
    bringeAuftraegeAufStand(state, now);
    const idx = findePlatz(state, auftragId);
    if (idx < 0) return { ok: false, status: 400, error: "Diesen Auftrag gibt es nicht mehr." };
    const auftrag = state.auftraege.plaetze[idx];
    const lager = Array.isArray(state.harvestedItems) ? state.harvestedItems : [];
    const passend = lager
        .map((item, i) => {
            const wert = Number(verkaufswert(item));
            return { item, i, wert: Number.isFinite(wert) ? wert : 0 };
        })
        .filter(({ item }) => erfuellt(item, auftrag))
        .sort((x, y) => x.wert - y.wert);
    if (passend.length < auftrag.anzahl) {
        return { ok: false, status: 400, error: `Dafür fehlen noch ${auftrag.anzahl - passend.length} Stück im Rucksack.` };
    }
    const weg = new Set(passend.slice(0, auftrag.anzahl).map((p) => p.i));
    state.harvestedItems = lager.filter((_, i) => !weg.has(i));
    // Fähigkeit „Auftragsprofi" (Tier 5) legt auf die Belohnung drauf.
    const belohnung = Math.round(auftrag.gold * (1 + wirkung(state, "auftragsprofi")));
    gutschreiben(state, belohnung);
    gibFesteXp(state, auftrag.xp);
    state.auftraege.plaetze[idx] = { pauseBis: now + PAUSE_NACH_LIEFERUNG_MS };
    state.auftraege.erledigt = (Number(state.auftraege.erledigt) || 0) + 1;
    return {
        ok: true,
        belohnungGold: belohnung,
        belohnungXp: auftrag.xp,
        name: KATALOG.get(auftrag.seedId)?.name || auftrag.seedId,
        anzahl: auftrag.anzahl,
        auftraege: auftragUebersicht(state, now),
    };
}

/** Ablehnen: der Platz macht eine kurze Pause und bringt dann einen neuen Auftrag. */
function auftragAblehnen(state, auftragId, now = Date.now()) {
    bringeAuftraegeAufStand(state, now);
    const idx = findePlatz(state, auftragId);
    if (idx < 0) return { ok: false, status: 400, error: "Diesen Auftrag gibt es nicht mehr." };
    state.auftraege.plaetze[idx] = { pauseBis: now + PAUSE_NACH_ABLEHNEN_MS };
    return { ok: true, auftraege: auftragUebersicht(state, now) };
}

module.exports = {
    bringeAuftraegeAufStand, auftragUebersicht, auftragLiefern, auftragAblehnen,
    neuerAuftrag, erfuellt, MERKMALE, PLAETZE, STUFE_AB,
    PAUSE_NACH_LIEFERUNG_MS, PAUSE_NACH_ABLEHNEN_MS, LAUFZEIT_MS,
};
