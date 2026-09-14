// garden/core/reskins.js
// Kosmetische Reskins für Schuppen, Briefkasten und Namensschild.
// Rein optisch — keine Werte, keine Vorteile, nur ein anderer Look. Genau
// deswegen dürfen sie richtig teuer sein: sie kosten nichts außer Gold, das
// sonst nur auf dem Konto steht.
//
// MUSS ZU ui/reskins.js (Frontend) PASSEN — dieselbe Liste baut dort den
// Laden auf. Läuft eine der beiden auseinander, verspricht der Laden etwas,
// das der Server nicht kennt (siehe core/deko.js für denselben Grundsatz).
const BASIS = "/garden-assets/world";

const RESKIN_KATALOG = {
    // Sortiert nach Preis aufsteigend (Feedback 01.09.: "am teuersten unten im
    // Menü") — reskinUebersicht reicht diese Reihenfolge unverändert an
    // GoldShopModal durch, die Liste hier IST die Anzeigereihenfolge.
    shed: [
        { id: "forge", name: "Alchemistenschmiede", price: 1_000_000, image: `${BASIS}/shed_variants/forge.png` },
        { id: "seedsman", name: "Globaler Saatenhandel", price: 3_000_000, image: `${BASIS}/shed_variants/seedsman.png` },
        { id: "herbs", name: "Kräuterkammer", price: 10_000_000, image: `${BASIS}/shed_variants/herbs.png` },
        { id: "orbital", name: "Orbitalstation", price: 25_000_000, image: `${BASIS}/shed_variants/orbital.png` },
        { id: "celestial", name: "Himmelskristall-Schrein", price: 50_000_000, image: `${BASIS}/shed_variants/celestial.png` },
        { id: "observatory", name: "Druidenhütte", price: 75_000_000, image: `${BASIS}/shed_variants/observatory.png` },
        { id: "void_weaver", name: "Leerenweber-Schrein", price: 100_000_000, image: `${BASIS}/shed_variants/void_weaver.png` },
    ],
    mailbox: [
        { id: "dark", name: "Schattenpost", price: 1_500_000, image: `${BASIS}/mailbox_variants/dark.png` },
        { id: "rusty", name: "Rostiger Postkasten", price: 2_500_000, image: `${BASIS}/mailbox_variants/rusty.png` },
        { id: "brick", name: "Backstein-Postkasten", price: 5_000_000, image: `${BASIS}/mailbox_variants/brick.png` },
        { id: "cyber", name: "Cyber-Postfach", price: 10_000_000, image: `${BASIS}/mailbox_variants/cyber.png` },
        { id: "future", name: "Zukunftspost", price: 25_000_000, image: `${BASIS}/mailbox_variants/future.png` },
        { id: "magepunk", name: "Magepunk-Postfach", price: 35_000_000, image: `${BASIS}/mailbox_variants/magepunk.png` },
        { id: "nature", name: "Waldpostkasten", price: 50_000_000, image: `${BASIS}/mailbox_variants/nature.png` },
    ],
    // Kein Bildwechsel — eine reine Farb-/Rahmen-Variante des Namensschilds über
    // dem Spieler, deshalb ohne `image`, dafür mit `farbe`.
    nameplate: [
        // `bg2` ist der zweite Farbverlaufs-Halt (Feedback 01.09.: "Textur statt
        // flacher Farbe") — ein diagonaler Verlauf von `bg` nach `bg2` statt einer
        // flachen Füllung, gezeichnet in _drawPlayerNametag (Renderer.js). Rein
        // kosmetisch wie der Rest hier, kein drittes Feld, weil ein Farbverlauf
        // ohne echte Textur-Grafik auskommt.
        { id: "gold", name: "Gold", price: 1_000_000, farbe: { bg: "#fef3c7", bg2: "#fcd34d", border: "#92400e", text: "#78350f" } },
        { id: "royal", name: "Königlich", price: 2_000_000, farbe: { bg: "#ede9fe", bg2: "#c4b5fd", border: "#5b21b6", text: "#4c1d95" } },
        { id: "neon", name: "Neon", price: 25_000_000, farbe: { bg: "#022c22", bg2: "#065f46", border: "#10b981", text: "#6ee7b7" } },
        { id: "rose", name: "Rosenquarz", price: 50_000_000, farbe: { bg: "#fce7f3", bg2: "#f9a8d4", border: "#be185d", text: "#831843" } },
        { id: "obsidian", name: "Obsidian", price: 5_000_000, farbe: { bg: "#18181b", bg2: "#3f3f46", border: "#71717a", text: "#e4e4e7" } },
    ],
};

const KATEGORIEN = Object.keys(RESKIN_KATALOG);

function katalogFuer(kategorie) {
    return RESKIN_KATALOG[String(kategorie || "")] || null;
}

function eintragFuer(kategorie, id) {
    const liste = katalogFuer(kategorie);
    if (!liste) return null;
    return liste.find((r) => r.id === String(id || "")) || null;
}

/** Lazy wie bei Quests/Skills: legt die Struktur an, wenn sie noch fehlt. */
function bringeReskinsAufStand(state) {
    if (!state.reskins || typeof state.reskins !== "object") state.reskins = {};
    if (!state.reskins.gekauft || typeof state.reskins.gekauft !== "object") state.reskins.gekauft = {};
    if (!state.reskins.ausgeruestet || typeof state.reskins.ausgeruestet !== "object") state.reskins.ausgeruestet = {};
    for (const kat of KATEGORIEN) {
        if (!Array.isArray(state.reskins.gekauft[kat])) state.reskins.gekauft[kat] = [];
    }
    return state.reskins;
}

function reskinKaufen(state, kategorie, id) {
    const eintrag = eintragFuer(kategorie, id);
    if (!eintrag) return { ok: false, status: 400, error: "Diesen Reskin gibt es nicht." };
    const r = bringeReskinsAufStand(state);
    if (r.gekauft[kategorie].includes(eintrag.id)) return { ok: false, status: 400, error: "Schon gekauft." };
    const kontostand = Number(state.gold) || 0;
    if (kontostand < eintrag.price) return { ok: false, status: 400, error: "Nicht genug Gold." };
    state.gold = kontostand - eintrag.price;
    r.gekauft[kategorie].push(eintrag.id);
    // Frisch Gekauftes gleich anlegen — wer extra nochmal ins Menü tippen muss,
    // um das gerade Gekaufte überhaupt zu sehen, hält es leicht für kaputt.
    r.ausgeruestet[kategorie] = eintrag.id;
    // KEIN `gold` hier drin (Lehre aus core/quests.js questAbholen): die Antwort-
    // Hülle in gardenGameRoutes.js mischt ergebnis per Spread in ein Objekt, das
    // schon sein eigenes `gold` führt — der Kontostand kommt von DORT.
    return { ok: true, kategorie, id: eintrag.id };
}

function reskinAusruesten(state, kategorie, id) {
    if (!KATEGORIEN.includes(String(kategorie || ""))) return { ok: false, status: 400, error: "Unbekannte Kategorie." };
    const r = bringeReskinsAufStand(state);
    // Leer/null = zurück zum Standard-Look.
    if (id === null || id === undefined || id === "") {
        r.ausgeruestet[kategorie] = null;
        return { ok: true, kategorie, id: null };
    }
    const gewuenscht = String(id);
    if (!r.gekauft[kategorie].includes(gewuenscht)) return { ok: false, status: 400, error: "Noch nicht gekauft." };
    r.ausgeruestet[kategorie] = gewuenscht;
    return { ok: true, kategorie, id: gewuenscht };
}

/** Für die eigene Laden-Ansicht: Katalog samt "schon gekauft" je Stück. */
function reskinUebersicht(state) {
    const r = bringeReskinsAufStand(state);
    const katalog = {};
    for (const kat of KATEGORIEN) {
        katalog[kat] = RESKIN_KATALOG[kat].map((eintrag) => ({
            ...eintrag,
            gekauft: r.gekauft[kat].includes(eintrag.id),
        }));
    }
    return { katalog, ausgeruestet: r.ausgeruestet };
}

/** Für die Welt-Momentaufnahme (siehe world/lobby.js): nur, was gerade sichtbar
 *  sein muss — Bildpfade fürs eigene UND fremde Grundstück, Nameplate-Farbe. */
function ausgeruesteteReskins(state) {
    const r = bringeReskinsAufStand(state);
    return { ...r.ausgeruestet };
}

module.exports = {
    RESKIN_KATALOG, KATEGORIEN, katalogFuer, eintragFuer,
    reskinKaufen, reskinAusruesten, reskinUebersicht, ausgeruesteteReskins, bringeReskinsAufStand,
};
