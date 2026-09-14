// garden/core/skills.js
// Erfahrung, Level und Fähigkeiten der Virtual Farm.
//
// WO WAS LIEGT — und warum
// XP und Fähigkeiten gehören dem SERVER. Sie steuern Gold und Ertrag; lägen sie
// wie der Rucksack beim Browser, könnte man sich Level und Punkte im laufenden
// Spiel selbst zuschreiben. Vergeben wird XP deshalb genau dort, wo ohnehin schon
// serverseitig geerntet wird (core/economy.js → harvestCell) — an keiner zweiten Stelle.
//
// Die WIRKUNG einer Fähigkeit sitzt dagegen dort, wo ihr System schon liegt:
//
//   Gold, Doppelernte, Veredelung → Server (core/economy.js)
//   Spitzhacke, Gießkanne, Wachstum, Wetter → Browser
//
// Das ist keine Nachlässigkeit, sondern die bestehende Aufteilung: Acker, Werkzeug
// und Wachstum sind seit jeher client-autoritativ, und eine Fähigkeit, die nur
// Kacheln freilegt oder Pflanzen schneller wachsen lässt, verschiebt daran nichts.
// Alles, was am Ende GOLD ergibt, rechnet der Server.

// Für die Anzeige von „Wetterfühlig": aus der Chance je Effekt wird der
// Verkaufsfaktor gerechnet (siehe wetterFaktor). weather.js zieht nichts aus
// dieser Datei, ein Ringschluss entsteht also nicht.
const { WEATHER_SELL_BOOST } = require("./weather");

/**
 * Ab Level 2 ist die Summe XP_FAKTOR·(L−1)·L.
 *
 * BALANCING: Der Faktor war 30. Der Baum hat 34 Stufen, Punkte gibt es `level−1`,
 * also war ab Level 35 alles ausgebaut — bei 35.700 XP. Auf einem Bananenfeld
 * (50 XP je Ernte, ~105 Ernten/min) waren das SIEBEN MINUTEN. Danach war der Baum
 * kein Fortschritt mehr, sondern ein pauschaler Bonus.
 *
 * Mit 250 liegt derselbe Punkt bei 297.500 XP. Zusammen mit den erweiterten
 * Höchststufen weiter unten (73 Stufen statt 34) bleibt der Baum über Wochen eine
 * Entscheidung statt einer Formalie.
 *
 * ACHTUNG: Bestehende Spielstände werden in migrations/xp.js mit demselben Faktor
 * hochgerechnet — niemand verliert durch die Umstellung ein Level.
 */
const XP_FAKTOR = 400;
const XP_FAKTOR_ALT = 30;
const MAX_LEVEL = 50;

/**
 * Zurücksetzen kostet — und zwar quadratisch mit den vergebenen Punkten.
 *
 * Vorher war es gratis („der Baum soll zum Ausprobieren einladen"). Damit musste
 * man sich beim Verteilen aber überhaupt keine Gedanken machen: für jede Aufgabe
 * kurz umbauen, danach zurück. Eine Entscheidung, die nichts kostet, ist keine.
 *
 *   5 Punkte →  5 Mio      20 Punkte →  80 Mio      49 Punkte → 480 Mio
 */
const RESET_BASIS = 200000;
function resetKosten(punkte) {
    const n = Math.max(0, Math.floor(punkte) || 0);
    return RESET_BASIS * n * n;
}

/**
 * Wie viele Punkte insgesamt vergeben sein müssen, um eine Fähigkeit auf Stufe N
 * zu heben. Verhindert, dass man Punkte hortet und sie am Stück in eine einzige
 * Fähigkeit kippt — Tiefe muss man sich über Breite verdienen.
 *
 *   Stufe 2 ab 4 Punkten, Stufe 3 ab 8, … Stufe 10 ab 36.
 */
const PUNKTE_JE_STUFE = 4;
function punkteFuerStufe(stufe) {
    return Math.max(0, (Math.floor(stufe) - 1) * PUNKTE_JE_STUFE);
}

/**
 * Tier-Breite (v2, Skillbaum-Neuzeichnung — Feedback 28.08.: "richtige Sperrung,
 * z. B. 3 von 4 Skills auf einer Höhe, bevor es weitergeht").
 *
 * VORHER hing das Öffnen einer Fähigkeit an `benoetigtPunkte` — einer simplen
 * Gesamt-Punkte-Schwelle über den GANZEN Baum. Das liess sich mit Tiefe statt
 * Breite umgehen: 4 Punkte am Stück in "Bergmann" reichten genauso wie 4 Punkte
 * verteilt auf vier Fähigkeiten, obwohl der Baum optisch "Breite vor Tiefe"
 * verspricht (siehe SkillKarte im Frontend). Der Baum war insofern nicht wirklich
 * VERBUNDEN — die Linien zwischen den Fähigkeiten zeigten keine echte Regel.
 *
 * JETZT hat jede Fähigkeit ein `tier` (0 = sofort offen). Um Punkte in Tier N zu
 * investieren, muss man vorher in mindestens `TIER_BREITE[N]` VERSCHIEDENEN
 * Fähigkeiten aus Tier N−1 schon mindestens einen Punkt gesetzt haben — echte
 * Breite, kein Gesamt-Zähler. Index 0 ist unbenutzt (Tier 0 hat kein Vorher).
 */
const TIER_BREITE = [0, 3, 1, 1, 2];

/** Alle Fähigkeiten eines Tiers, in der Reihenfolge von SKILLS. */
function tierFaehigkeiten(tier) {
    return SKILLS.filter((s) => s.tier === tier);
}

/**
 * Wie viele Fähigkeiten aus Tier `tier − 1` schon mindestens eine Stufe haben —
 * und wie viele es dafür braucht. `benoetigt` ist auf die tatsächliche Anzahl
 * der Vorgänger-Fähigkeiten gedeckelt (ein Tier mit nur einer Fähigkeit davor
 * kann nicht mehr als "1 von 1" verlangen).
 */
function tierBreiteStand(state, tier) {
    const vorherige = tier > 0 ? tierFaehigkeiten(tier - 1) : [];
    const benoetigt = tier > 0 ? Math.min(TIER_BREITE[tier] || 0, vorherige.length) : 0;
    const investiert = vorherige.filter((s) => stufeVon(state, s.id) >= 1).length;
    return { benoetigt, investiert, vorherigeAnzahl: vorherige.length, offen: investiert >= benoetigt };
}

/** Ist Tier `tier` für diesen Spielstand freigeschaltet? Tier 0 immer. */
function tierFreigeschaltet(state, tier) {
    if (tier <= 0) return true;
    return tierBreiteStand(state, tier).offen;
}

/** Übersicht aller Tiere für den Browser — eine Zeile pro Tier, in Reihenfolge. */
function tierUebersicht(state) {
    const tiers = Array.from(new Set(SKILLS.map((s) => s.tier))).sort((a, b) => a - b);
    return tiers.map((tier) => ({
        tier,
        skillIds: tierFaehigkeiten(tier).map((s) => s.id),
        ...tierBreiteStand(state, tier),
    }));
}

/**
 * Wirkung der Gießkanne in MINUTEN, nach Stufe von „Regenmacher" (0 = ungelernt).
 *
 * Bewusst nicht linear: mit gleichmäßigen Schritten wäre der Skill auf langen
 * Pflanzen wertlos geblieben (fünf Minuten auf 22 Stunden sind nichts). Die
 * Staffel macht ihn zum echten Ausbau — und weil die Kanne bei 5.000 Gold bleibt,
 * bleibt sie auch für kleine Pflanzen bezahlbar.
 */
// ACHTUNG: Index 0 ist der Grundwert OHNE Skill. Die Fähigkeit hat deshalb eine
// Stufe WENIGER als diese Tabelle Einträge — `stufen` und `werte` am Skill werden
// unten daraus abgeleitet, damit beides nicht auseinanderlaufen kann.
const GIESSKANNE_MINUTEN = [5, 10, 20, 45, 90];

/**
 * Wie viel eine Pflanze innerhalb EINES Zyklus insgesamt gegossen werden darf,
 * als Anteil ihrer ursprünglichen Wachstums- bzw. Zykluszeit.
 *
 * 1.0 heisst: man darf sie bis zur Reife herunterwässern — es gibt also keine
 * Balancing-Grenze mehr. Der Wert steht trotzdem hier und wird serverseitig
 * geprüft, weil er eine ANDERE Aufgabe hat: ohne ihn könnte ein manipulierter
 * Browser bei jedem Speichern erneut Zeit abziehen und damit unbegrenzt ernten.
 * Mit ihm ist bei „einmal fertig" Schluss, bis der Fruchtstand nachgewachsen ist.
 */
const GIESSKANNE_MAX_ANTEIL = 1.0;

/** Minuten, die ein Guss bei dieser Regenmacher-Stufe abnimmt. */
function giesskanneMinuten(stufe) {
    const s = Math.max(0, Math.min(GIESSKANNE_MINUTEN.length - 1, Math.floor(Number(stufe) || 0)));
    return GIESSKANNE_MINUTEN[s];
}

/**
 * Grundchance, dass ein Wetter eine Pflanze über ihren Zyklus zeichnet.
 * Muss zu WETTER_ZIEL in Frontend/src/pages/GardenGame/engine/PlantSystem.js passen.
 *
 * BALANCING (Feedback 29.08.: "viel zu viel Special Wetter momentan"): war 0.15.
 * Mit vier unabhängigen Effekten (wet/frozen/charged/moonlit) ergibt das
 * 1−(1−0,15)⁴ ≈ 48 % Chance auf MINDESTENS einen Effekt bei JEDER Ernte, egal
 * wie schnell die Pflanze zykelt (siehe wetterChanceFuer in PlantSystem.js —
 * bewusst so gebaut, dass jede Pflanze denselben Erwartungswert bekommt). Bei
 * einem schnell zykelnden Dauerträger, den man in einer Minute ein Dutzend Mal
 * erntet, sah dadurch gefühlt jedes zweite Stück gefärbt aus. Mit 0,06 liegt
 * die Chance auf mindestens einen Effekt bei ≈ 22 % (voll ausgebautem
 * "Wetterfühlig" bei ≈ 40 %) — weiterhin ein echter Bonus, aber wieder ein
 * Fund und kein Dauerzustand.
 */
const WETTER_ZIEL = 0.06;

/**
 * Durchschnittlicher VERKAUFSFAKTOR durch Wetter bei gegebener Chance je Effekt.
 *
 * Die vier Effekte werden unabhängig gewürfelt und multiplizieren sich, wenn eine
 * Frucht mehrere abbekommt. Der Erwartungswert ist deshalb das Produkt über
 * (1 + Chance × (Aufschlag − 1)).
 *
 * WOFÜR: „Wetterfühlig" erhöht die CHANCE, nicht den Erlös. Die Karte im
 * Fähigkeitsbaum zeigte bisher den rohen Aufschlag auf die Chance — bei voller
 * Stufe also „+100 %", was sich unweigerlich wie „100 % Wetter" liest. Tatsächlich
 * steigt die Chance von 15 % auf 30 % und der Erlös um gut die Hälfte. Damit die
 * Anzeige nicht länger etwas anderes verspricht als die Kasse zahlt, liefert der
 * Server jetzt die fertigen Faktoren mit.
 */
function wetterFaktor(chance) {
    let faktor = 1;
    for (const aufschlag of Object.values(WEATHER_SELL_BOOST)) {
        faktor *= 1 + Math.max(0, Math.min(0.9, chance)) * (aufschlag - 1);
    }
    return Math.round(faktor * 1000) / 1000;
}

const WETTERFUEHLIG_STUFEN = 8;
const WETTERFUEHLIG_PRO_STUFE = 0.125;

/** XP je Ernte nach Seltenheit der Pflanze. */
/**
 * Grunderfahrung je Ernte nach Seltenheit. Das ist nur noch die HÄLFTE der
 * Rechnung — der Zeitfaktor unten kommt dazu.
 */
const XP_JE_SELTENHEIT = {
    COMMON: 1, UNCOMMON: 3, RARE: 8, EPIC: 20, LEGENDARY: 50, MYTHIC: 120,
};

/**
 * Erfahrung je Ernte — Seltenheit MAL Zykluslänge.
 *
 * WARUM UMGEBAUT: vorher zählte allein die Seltenheit. Ein Bambus, der acht Tage
 * auf seiner Kachel steht und eine Milliarde kostet, brachte damit dieselben 50 XP
 * wie eine Acai-Frucht, die alle 22 Stunden nachwächst — und eine Mondblume mit
 * zwanzig Tagen Wachstum ganze 120. Wer den Baum ausbauen wollte, hatte keinen
 * Grund, überhaupt etwas Langes zu pflanzen.
 *
 * Der Zeitfaktor wächst logarithmisch, nicht linear: linear bekäme die Mondblume
 * das Zweihundertfache eines Kürbisses und der Baum wäre mit einem Feld erledigt.
 * So liegt die Spanne bei 1 bis rund 1.500 XP je Ernte.
 *
 *   10 min → ×2      1 h → ×3,8      1 Tag → ×8,2      8 Tage → ×11,2
 *
 * @param {string} seltenheit COMMON … MYTHIC
 * @param {number} zyklusMinuten Wachstumszeit (Einmalernte) bzw. Fruchtzyklus
 */
function xpFuerErnte(seltenheit, zyklusMinuten) {
    const basis = XP_JE_SELTENHEIT[String(seltenheit || "").toUpperCase()] || 1;
    const min = Math.max(0, Number(zyklusMinuten) || 0);
    const zeitFaktor = 1 + Math.log2(1 + min / 10);
    return Math.max(1, Math.round(basis * zeitFaktor));
}

/**
 * Was jede Sorte des Katalogs an Erfahrung bringt — { seedId: xp }.
 *
 * Der Browser bekommt diese Tabelle über GET /api/garden/skills und muss die
 * Formel damit nicht spiegeln. Eine Anzeige, die etwas anderes verspricht als die
 * Kasse zahlt, ist schlimmer als gar keine Anzeige — dieselbe Regel wie beim Baum.
 */
function xpTabelle() {
    const { SEED_CATALOGUE } = require("./catalogue");
    const raus = {};
    for (const s of SEED_CATALOGUE) {
        const sekunden = s.singleUse !== false
            ? ((Number(s.growMinSec) || 0) + (Number(s.growMaxSec) || 0)) / 2
            : (Number(s.fruitCycleSec) || 0);
        raus[s.id] = xpFuerErnte(s.rarity, sekunden / 60);
    }
    return raus;
}

/**
 * Der Fähigkeitsbaum.
 *
 * `stufen` ist die Höchststufe, `proStufe` der Zuwachs je Stufe. `ab` nennt das
 * Mindestlevel — daran hängt die Baumstruktur: die vier Grundfähigkeiten stehen
 * sofort offen, die stärkeren erst später.
 *
 * `levelProStufe` staffelt zusätzlich INNERHALB einer Fähigkeit: Stufe N verlangt
 * `ab + (N−1) · levelProStufe`. Vorher galt `ab` nur für die erste Stufe — wer das
 * Einstiegslevel hatte, konnte die Fähigkeit mit gehorteten Punkten sofort bis zum
 * Anschlag ziehen. Genau das war beim Regenmacher zu sehen: die 90-Minuten-Stufe,
 * das stärkste Werkzeug im Spiel, lag praktisch am Anfang. Jetzt zieht sich jede
 * Fähigkeit über den halben Levelbereich, und die letzten Stufen sind ein Ziel
 * für später statt eine Formalie.
 */
const SKILLS = [
    {
        id: "bergbau",
        name: "Bergmann",
        // UMGEBAUT: war eine SAVE-CHANCE beim Abbau (5 × 6 %). Die Spitzhacke
        // kostet 40.000·1,16^n; alles, was die ANZAHL der Käufe senkt, senkt auch
        // den Exponenten und wirkt damit überproportional — die 30 % Ersparnis
        // haben in der Summe rund 90 % des grössten Goldsinks gestrichen.
        // Dasselbe gälte für Zusatzladungen. Ein reiner Preisnachlass ist der
        // einzige Weg, der linear bleibt und sich vorhersagen lässt.
        beschreibung: "Spitzhacken sind im Tool-Shop günstiger.",
        stufen: 5, proStufe: 0.06, ab: 1, levelProStufe: 8, tier: 0, seite: "links",
        einheit: "prozent",
    },
    {
        id: "giesskanne",
        name: "Regenmacher",
        // Nicht linear: die Stufen sind eine feste Staffel (siehe GIESSKANNE_MINUTEN).
        // Eine Kanne allein bringt 5 Minuten, voll ausgebaut anderthalb Stunden —
        // damit lohnt sie sich auch auf Pflanzen mit stundenlangem Wachstum.
        beschreibung: `Die Gießkanne verkürzt das Wachstum stärker (ohne Skill ${GIESSKANNE_MINUTEN[0]} Minuten).`,
        // Aus der Tabelle abgeleitet: Index 0 ist der Grundwert, die Stufen sind
        // alles danach. So kann die Anzeige nicht mehr von der Wirkung abweichen.
        stufen: GIESSKANNE_MINUTEN.length - 1,
        werte: GIESSKANNE_MINUTEN.slice(1),
        grundwert: GIESSKANNE_MINUTEN[0],
        // Die weiteste Staffel im ganzen Baum: 1 → 14 → 27 → 40. Anderthalb Stunden
        // je Guss sind der stärkste Zeitraffer im Spiel — auf einer Ananas mit fünf
        // Tagen Wachstum spart eine Shop-Rotation damit einen halben Tag. Das darf
        // kein Frühstart sein.
        ab: 1, levelProStufe: 13, tier: 0, seite: "links",
        einheit: "minuten",
    },
    {
        id: "gruener_daumen",
        name: "Grüner Daumen",
        beschreibung: "Alles auf deinem Acker wächst schneller.",
        stufen: 10, proStufe: 0.02, ab: 1, levelProStufe: 4, tier: 0, seite: "mitte",
        einheit: "prozent",
    },
    {
        id: "haendler",
        name: "Händler",
        beschreibung: "Höherer Verkaufserlös für alles, was du erntest.",
        stufen: 10, proStufe: 0.02, ab: 1, levelProStufe: 4, tier: 0, seite: "rechts",
        einheit: "prozent",
    },
    {
        id: "lagerist",
        name: "Lagerist",
        // UMGEBAUT (v2, Punkt 4): war "+5 Rucksackplätze je Stufe" — exakt derselbe
        // Effekt wie der Shop-Kauf `backpack_upgrade` (+10 Plätze je Stufe), nur über
        // einen zweiten Hebel. Zwei Wege zum selben Ziel sind keine Wahl, sondern
        // Redundanz. Jetzt macht der Lagerist den KAUF selbst günstiger — analog zu
        // "Bergmann" bei der Spitzhacke (siehe preisFuer in werkzeug.js), eine
        // eigene, nicht überlappende Nische neben der 50-Stufen-Kaufkurve.
        beschreibung: "Rucksack-Upgrades im Tool-Shop günstiger.",
        // benoetigtPunkte war 8. Zusammen mit der neuen Levelstaffel entstand daraus
        // eine Sackgasse: zwischen Level 8 und 13 waren nur vier Fähigkeiten offen,
        // alle bei Stufe 2 gedeckelt — macht höchstens 7 vergebene Punkte, während
        // jede weitere Stufe 8 verlangte. Auf Level 13 lagen fünf Punkte brach.
        // Der Lagerist ist über `ab: 8` ohnehin gebremst; 4 reicht als Astgrenze.
        stufen: 8, proStufe: 0.05, ab: 8, levelProStufe: 4, tier: 1, seite: "links",
        einheit: "prozent",
    },
    {
        id: "wetterfuehlig",
        name: "Wetterfühlig",
        beschreibung: `Das Wetter zeichnet deine Pflanzen häufiger — Grundchance ${Math.round(WETTER_ZIEL * 100)} % je Effekt.`,
        stufen: WETTERFUEHLIG_STUFEN, proStufe: WETTERFUEHLIG_PRO_STUFE,
        // Stärkster Verkaufsbonus im Baum (voll ausgebaut ×2,57 statt ×1,67) und
        // deshalb die längste Leiter: 10 → 15 → … → 45.
        ab: 10, levelProStufe: 5, tier: 2, seite: "mitte",
        // `anzeigeWerte` ist NUR für die Darstellung — gerechnet wird weiter mit
        // proStufe (dem Aufschlag auf die Chance). Angezeigt wird der Verkaufs-
        // faktor, weil „+100 %" sonst wie „100 % Wetter" gelesen wird.
        einheit: "faktor",
        grundwert: wetterFaktor(WETTER_ZIEL),
        anzeigeWerte: Array.from({ length: WETTERFUEHLIG_STUFEN }, (_, i) =>
            wetterFaktor(WETTER_ZIEL * (1 + (i + 1) * WETTERFUEHLIG_PRO_STUFE))),
    },
    {
        id: "ertrag",
        name: "Reiche Ernte",
        beschreibung: "Chance, beim Ernten ein zweites Stück derselben Frucht zu bekommen.",
        stufen: 10, proStufe: 0.015, ab: 18, levelProStufe: 3, tier: 3, seite: "rechts",
        einheit: "prozent",
    },
    {
        id: "zuechter",
        name: "Züchter",
        // UMGEBAUT: war „Tiere lösen ihre Fähigkeit häufiger aus" und wirkte damit nur
        // auf den TAKT. Seit dem Tier-Umbau tickt aber nur noch der Goldfinder —
        // Erntehelfer und Gärtner wirken beim Ernten bzw. dauerhaft. Der Skill hätte
        // damit nur noch eine von drei Fähigkeiten betroffen, obwohl sein Name das
        // Gegenteil verspricht. Jetzt ist es EIN Aufschlag auf alle Fähigkeiten:
        //   Goldfinder    häufigere Auslösung (wie bisher)
        //   Erntehelfer   höhere Chance auf das zweite Erntestück
        //   Gärtner       mehr Nachwuchs und schnelleres Wachstum
        //   Forscher      mehr XP je Ernte (v2, Punkt 9)
        //   Händler       höherer Verkaufspreis (v2, Punkt 9)
        // Gerechnet wird das über tierVerstaerkung() in core/economy.js. Mit den zwei
        // neuen Fähigkeiten wertet dieser eine Skillpunkt automatisch weiter auf, ohne
        // dass proStufe hier angefasst werden musste.
        beschreibung: "Alle Fähigkeiten deiner Tiere wirken stärker.",
        stufen: 8, proStufe: 0.04, ab: 18, levelProStufe: 3, tier: 3, seite: "mitte",
        einheit: "prozent",
    },
    {
        id: "seltenheit",
        name: "Glückspilz",
        // BALANCING (Feedback 29.08.: "Fähigkeiten wie Glückspilz nicht schon so
        // früh haben, erst später freischalten") — testweise auf ab 34 gesetzt,
        // per Feedback 30.08. ausdrücklich wieder auf 28 zurückgesetzt: die
        // niedrigere Wetter-Grundchance (siehe WETTER_ZIEL oben) allein reicht
        // als Korrektur, der Capstone (Tier 4) selbst sollte nicht zusätzlich
        // weiter nach hinten rücken.
        beschreibung: "Chance, dass eine gewöhnliche Ernte doch noch Golden oder Rainbow wird.",
        stufen: 10, proStufe: 0.01, ab: 28, levelProStufe: 2, tier: 4, seite: "links",
        einheit: "prozent",
    },
];

/**
 * Charakterlevel, ab dem Stufe `stufe` dieser Fähigkeit gekauft werden darf.
 * Ohne `levelProStufe` gilt weiterhin nur das Einstiegslevel.
 */
function levelFuerStufe(skill, stufe) {
    if (!skill) return 1;
    const n = Math.max(1, Math.floor(Number(stufe) || 1));
    const schritt = Math.max(0, Number(skill.levelProStufe) || 0);
    return Math.min(MAX_LEVEL, (Number(skill.ab) || 1) + (n - 1) * schritt);
}

// Einmal beim Laden ausrechnen und an die Fähigkeit hängen. Die Route schickt
// SKILLS unveraendert an den Browser — so muss die Oberflaeche die Staffel nicht
// nachbauen und kann nicht davon abweichen.
for (const skill of SKILLS) {
    skill.levelJeStufe = Array.from({ length: skill.stufen }, (_, i) => levelFuerStufe(skill, i + 1));
}

const SKILL_NACH_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** Gesamt-XP, die für dieses Level nötig sind. Level 1 ist der Anfang. */
function xpFuerLevel(level) {
    const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
    return XP_FAKTOR * (l - 1) * l;
}

/** Level zu einer XP-Summe. Umkehrung von xpFuerLevel, ohne Schleife. */
function levelZuXp(xp) {
    const menge = Math.max(0, Number(xp) || 0);
    // 30·(L−1)·L ≤ xp  →  L = floor((1 + sqrt(1 + 4·xp/30)) / 2)
    const l = Math.floor((1 + Math.sqrt(1 + (4 * menge) / XP_FAKTOR)) / 2);
    return Math.max(1, Math.min(MAX_LEVEL, l));
}

/** Wie viele Stufen in einer Fähigkeit stecken — geputzt und begrenzt. */
function stufeVon(state, id) {
    const skill = SKILL_NACH_ID.get(id);
    if (!skill) return 0;
    const roh = Number(state?.skills?.[id]) || 0;
    return Math.max(0, Math.min(skill.stufen, Math.floor(roh)));
}

/**
 * Wirkung einer Fähigkeit als Faktor bzw. Wahrscheinlichkeit (0 = nicht gelernt).
 *
 * Fähigkeiten mit `werte` sind nicht linear (siehe Regenmacher): dort steht der
 * ABSOLUTE Wert je Stufe in der Tabelle statt eines Zuwachses. Ohne diesen Zweig
 * käme `proStufe * stufe` heraus — bei einer Staffel wie 10/20/45/90 sinnlos.
 */
function wirkung(state, id) {
    const skill = SKILL_NACH_ID.get(id);
    if (!skill) return 0;
    const stufe = stufeVon(state, id);
    if (Array.isArray(skill.werte)) return stufe === 0 ? 0 : (skill.werte[stufe - 1] ?? 0);
    return stufe * skill.proStufe;
}

/**
 * Übersicht für den Browser: Level, XP-Fortschritt, offene Punkte, gelernte Stufen.
 *
 * Die offenen Punkte werden AUS Level und Ausgaben gerechnet, nicht getrennt
 * mitgeführt. Ein eigener Zähler könnte auseinanderlaufen — hier ist das unmöglich.
 */
function skillStand(state) {
    const xp = Math.max(0, Number(state?.xp) || 0);
    const level = levelZuXp(xp);
    const stufen = {};
    let ausgegeben = 0;
    for (const skill of SKILLS) {
        const s = stufeVon(state, skill.id);
        if (s > 0) stufen[skill.id] = s;
        ausgegeben += s;
    }
    return {
        xp,
        level,
        xpDiesesLevel: xp - xpFuerLevel(level),
        xpFuersNaechste: level >= MAX_LEVEL ? 0 : xpFuerLevel(level + 1) - xpFuerLevel(level),
        punkteGesamt: level - 1,          // Level 1 bringt noch keinen Punkt
        punkteOffen: Math.max(0, (level - 1) - ausgegeben),
        punkteVergeben: ausgegeben,
        resetKosten: resetKosten(ausgegeben),
        skills: stufen,
        // Für die Baum-Darstellung: pro Tier, ob es freigeschaltet ist und wie
        // weit die Breiten-Anforderung schon erfüllt ist (siehe TIER_BREITE).
        tiere: tierUebersicht(state),
    };
}

/**
 * XP für eine Ernte gutschreiben. Gibt zurück, ob dabei ein Level dazukam.
 *
 * `multiplikator` ist der Forscher-Tieraufschlag (v2, Punkt 9) — kommt fertig
 * gerechnet aus economy.js (forscherBoost), damit skills.js nicht von pets.js
 * abhängen muss. Default 1 lässt jeden anderen Aufrufer unverändert.
 */
function gibXp(state, seltenheit, zyklusMinuten = 0, multiplikator = 1) {
    const dazu = Math.round(xpFuerErnte(seltenheit, zyklusMinuten) * (Number(multiplikator) || 1));
    const vorher = levelZuXp(state.xp);
    state.xp = Math.max(0, Number(state.xp) || 0) + dazu;
    const nachher = levelZuXp(state.xp);
    return { xp: dazu, level: nachher, aufgestiegen: nachher > vorher };
}

/**
 * Einen FESTEN XP-Betrag gutschreiben — anders als gibXp() nicht aus Seltenheit
 * und Zykluslänge einer Ernte errechnet, sondern von aussen vorgegeben (Missionen,
 * core/quests.js). Dieselbe Vorher/Nachher-Meldung wie gibXp, damit ein Aufsteig
 * beim Abholen einer Missionsbelohnung genauso erkannt wird wie beim Ernten.
 */
function gibFesteXp(state, betrag) {
    const dazu = Math.max(0, Math.round(Number(betrag) || 0));
    const vorher = levelZuXp(state.xp);
    state.xp = Math.max(0, Number(state.xp) || 0) + dazu;
    const nachher = levelZuXp(state.xp);
    return { xp: dazu, level: nachher, aufgestiegen: nachher > vorher };
}

/** Einen Punkt in eine Fähigkeit stecken. Prüft Level, Punkte und Höchststufe. */
function lerneSkill(state, id) {
    const skill = SKILL_NACH_ID.get(String(id));
    if (!skill) return { ok: false, status: 400, error: "Diese Fähigkeit gibt es nicht." };
    const stand = skillStand(state);
    if (stand.level < skill.ab) {
        return { ok: false, status: 400, error: `${skill.name} gibt es erst ab Level ${skill.ab}.` };
    }
    // Baumstufe: die stärkeren Fähigkeiten setzen voraus, dass vorher wirklich
    // BREIT investiert wurde — nicht nur irgendwo insgesamt genug Punkte liegen
    // (siehe TIER_BREITE oben für die Begründung des Umbaus).
    const breite = tierBreiteStand(state, skill.tier);
    if (!breite.offen) {
        return {
            ok: false, status: 400,
            error: `${skill.name} öffnet sich erst, wenn du in ${breite.benoetigt} von `
                + `${breite.vorherigeAnzahl} Fähigkeiten davor mindestens einen Punkt gesetzt hast `
                + `(bisher ${breite.investiert}).`,
        };
    }
    if (stand.punkteOffen < 1) {
        return { ok: false, status: 400, error: "Du hast keinen Fähigkeitspunkt übrig." };
    }
    const jetzt = stufeVon(state, id);
    if (jetzt >= skill.stufen) {
        return { ok: false, status: 400, error: `${skill.name} ist schon voll ausgebaut.` };
    }
    // Staffel INNERHALB der Fähigkeit: die späten Stufen sind an das Charakterlevel
    // gebunden, nicht nur die erste. Sonst reicht das Einstiegslevel plus ein Vorrat
    // an Punkten, um sofort durchzuziehen.
    const noetigesLevel = levelFuerStufe(skill, jetzt + 1);
    if (stand.level < noetigesLevel) {
        return {
            ok: false, status: 400,
            error: `Stufe ${jetzt + 1} von ${skill.name} gibt es ab Level ${noetigesLevel} `
                + `(du bist Level ${stand.level}).`,
        };
    }
    // Tiefe kostet Breite: Stufe N verlangt (N−1)×4 insgesamt vergebene Punkte.
    // Sonst wäre „alles in eine Fähigkeit" immer die stärkste Verteilung.
    const tiefe = punkteFuerStufe(jetzt + 1);
    if (stand.punkteVergeben < tiefe) {
        return {
            ok: false, status: 400,
            error: `Stufe ${jetzt + 1} von ${skill.name} braucht ${tiefe} insgesamt vergebene Punkte `
                + `(du hast ${stand.punkteVergeben}). Verteile erst breiter.`,
        };
    }
    if (!state.skills || typeof state.skills !== "object") state.skills = {};
    state.skills[skill.id] = jetzt + 1;
    return { ok: true, stand: skillStand(state) };
}

/**
 * Alle Punkte zurückholen — gegen Gold.
 *
 * Kostete früher nichts, und damit war das Verteilen keine Entscheidung: man
 * konnte für jede Aufgabe kurz umbauen und danach zurückschalten. Der Preis
 * wächst quadratisch mit den vergebenen Punkten, ein später Umbau ist also ein
 * echter Einschnitt.
 */
function skillsZuruecksetzen(state) {
    const stand = skillStand(state);
    if (stand.punkteVergeben === 0) {
        return { ok: false, status: 400, error: "Du hast noch keine Punkte vergeben." };
    }
    const kosten = resetKosten(stand.punkteVergeben);
    const vorhanden = Math.max(0, Number(state.gold) || 0);
    if (vorhanden < kosten) {
        return {
            ok: false, status: 400,
            error: `Zurücksetzen kostet ${kosten.toLocaleString("de-DE")} Gold `
                + `(${stand.punkteVergeben} vergebene Punkte). Dir fehlen `
                + `${(kosten - vorhanden).toLocaleString("de-DE")}.`,
        };
    }
    state.gold = vorhanden - kosten;
    state.skills = {};
    return { ok: true, stand: skillStand(state), gold: state.gold, bezahlt: kosten };
}

module.exports = {
    SKILLS, MAX_LEVEL, XP_JE_SELTENHEIT, XP_FAKTOR, XP_FAKTOR_ALT, xpFuerErnte, xpTabelle,
    xpFuerLevel, levelZuXp, stufeVon, wirkung, resetKosten, punkteFuerStufe, levelFuerStufe,
    skillStand, gibXp, gibFesteXp, lerneSkill, skillsZuruecksetzen,
    GIESSKANNE_MINUTEN, GIESSKANNE_MAX_ANTEIL, giesskanneMinuten,
};
