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
const XP_FAKTOR = 250;
const XP_FAKTOR_ALT = 30;
const MAX_LEVEL = 50;

/** XP je Ernte nach Seltenheit der Pflanze. */
const XP_JE_SELTENHEIT = {
    COMMON: 1, UNCOMMON: 3, RARE: 8, EPIC: 20, LEGENDARY: 50, MYTHIC: 120,
};

/**
 * Der Fähigkeitsbaum.
 *
 * `stufen` ist die Höchststufe, `proStufe` der Zuwachs je Stufe. `ab` nennt das
 * Mindestlevel — daran hängt die Baumstruktur: die vier Grundfähigkeiten stehen
 * sofort offen, die stärkeren erst später.
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
        stufen: 5, proStufe: 0.06, ab: 1, seite: "links",
        einheit: "prozent",
    },
    {
        id: "giesskanne",
        name: "Regenmacher",
        beschreibung: "Die Gießkanne beschleunigt das Wachstum stärker.",
        stufen: 5, proStufe: 0.10, ab: 1, seite: "links",
        einheit: "prozent",
    },
    {
        id: "gruener_daumen",
        name: "Grüner Daumen",
        beschreibung: "Alles auf deinem Acker wächst schneller.",
        stufen: 10, proStufe: 0.03, ab: 1, seite: "mitte",
        einheit: "prozent",
    },
    {
        id: "haendler",
        name: "Händler",
        beschreibung: "Höherer Verkaufserlös für alles, was du erntest.",
        stufen: 10, proStufe: 0.04, ab: 1, seite: "rechts",
        einheit: "prozent",
    },
    {
        id: "lagerist",
        name: "Lagerist",
        beschreibung: "Zusätzliche Rucksackplätze — Samen und Ernte teilen sie sich.",
        stufen: 8, proStufe: 5, ab: 4, seite: "links",
        einheit: "absolut",
    },
    {
        id: "wetterfuehlig",
        name: "Wetterfühlig",
        beschreibung: "Das Wetter zeichnet deine Pflanzen häufiger.",
        stufen: 8, proStufe: 0.125, ab: 6, seite: "mitte",
        einheit: "prozent",
    },
    {
        id: "ertrag",
        name: "Reiche Ernte",
        beschreibung: "Chance, beim Ernten ein zweites Stück derselben Frucht zu bekommen.",
        stufen: 10, proStufe: 0.03, ab: 10, seite: "rechts",
        einheit: "prozent",
    },
    {
        id: "zuechter",
        name: "Züchter",
        beschreibung: "Deine Tiere lösen ihre Fähigkeit häufiger aus.",
        stufen: 8, proStufe: 0.05, ab: 12, seite: "mitte",
        einheit: "prozent",
    },
    {
        id: "seltenheit",
        name: "Glückspilz",
        beschreibung: "Chance, dass eine gewöhnliche Ernte doch noch Golden oder Rainbow wird.",
        stufen: 10, proStufe: 0.02, ab: 15, seite: "links",
        einheit: "prozent",
    },
];

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

/** Wirkung einer Fähigkeit als Faktor bzw. Wahrscheinlichkeit (0 = nicht gelernt). */
function wirkung(state, id) {
    const skill = SKILL_NACH_ID.get(id);
    if (!skill) return 0;
    return stufeVon(state, id) * skill.proStufe;
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
        skills: stufen,
    };
}

/** XP für eine Ernte gutschreiben. Gibt zurück, ob dabei ein Level dazukam. */
function gibXp(state, seltenheit) {
    const dazu = XP_JE_SELTENHEIT[String(seltenheit || "").toUpperCase()] || 1;
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
    if (stand.punkteOffen < 1) {
        return { ok: false, status: 400, error: "Du hast keinen Fähigkeitspunkt übrig." };
    }
    const jetzt = stufeVon(state, id);
    if (jetzt >= skill.stufen) {
        return { ok: false, status: 400, error: `${skill.name} ist schon voll ausgebaut.` };
    }
    if (!state.skills || typeof state.skills !== "object") state.skills = {};
    state.skills[skill.id] = jetzt + 1;
    return { ok: true, stand: skillStand(state) };
}

/**
 * Alle Punkte zurückholen. Kostet nichts — der Baum soll zum Ausprobieren einladen,
 * und es gibt nichts zu gewinnen, indem man ihn hin- und herschaltet: die Wirkungen
 * greifen erst bei der nächsten Ernte.
 */
function skillsZuruecksetzen(state) {
    state.skills = {};
    return { ok: true, stand: skillStand(state) };
}

module.exports = {
    SKILLS, MAX_LEVEL, XP_JE_SELTENHEIT, XP_FAKTOR, XP_FAKTOR_ALT,
    xpFuerLevel, levelZuXp, stufeVon, wirkung,
    skillStand, gibXp, lerneSkill, skillsZuruecksetzen,
};
