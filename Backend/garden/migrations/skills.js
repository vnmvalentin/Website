// garden/migrations/skills.js
// Vorhandene Fähigkeitsstufen auf die neue Levelstaffel zurechtstutzen.
//
// WARUM
// Bis v4.0 galt das Mindestlevel `ab` nur für die ERSTE Stufe einer Fähigkeit. Wer
// das Einstiegslevel hatte und Punkte gehortet hatte, konnte sie am Stück bis zum
// Anschlag ziehen — beim Regenmacher hiess das: die 90-Minuten-Stufe, der stärkste
// Zeitraffer im Spiel, praktisch zu Spielbeginn. Jetzt verlangt Stufe N zusätzlich
// `ab + (N−1) · levelProStufe`.
//
// Bestehende Stände müssen mitgezogen werden, sonst behalten genau die Konten den
// Vorteil, wegen denen die Staffel eingebaut wurde. Gekürzt wird nur so weit, wie
// das aktuelle Level es verlangt — die Punkte werden nicht eingezogen, sondern
// stehen sofort wieder zur freien Verteilung bereit (offene Punkte werden aus Level
// minus Ausgaben gerechnet, siehe core/skills.js → skillStand).
//
// Idempotent über die Marke: läuft genau einmal je Spielstand.

const { SKILLS, levelFuerStufe, levelZuXp } = require("../core/skills");

const MARKE = "skillLevelStaffel";

function runSkillStaffelMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let gekuerzteStufen = 0;

    for (const [userId, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE]) continue;
        state[MARKE] = true;

        const skills = state.skills;
        if (!skills || typeof skills !== "object") continue;

        const level = levelZuXp(Math.max(0, Number(state.xp) || 0));
        let geaendert = false;

        for (const skill of SKILLS) {
            const jetzt = Math.max(0, Math.floor(Number(skills[skill.id]) || 0));
            if (jetzt === 0) continue;

            // Höchste Stufe, die dieses Level nach der neuen Staffel hergibt.
            let erlaubt = 0;
            while (erlaubt < jetzt && level >= levelFuerStufe(skill, erlaubt + 1)) erlaubt++;

            if (erlaubt < jetzt) {
                gekuerzteStufen += jetzt - erlaubt;
                geaendert = true;
                if (erlaubt === 0) delete skills[skill.id];
                else skills[skill.id] = erlaubt;
                console.log(`[Garden] Skillstaffel ${userId}: ${skill.name} `
                    + `Stufe ${jetzt} → ${erlaubt} (Level ${level}, `
                    + `Stufe ${jetzt} braucht Level ${levelFuerStufe(skill, jetzt)})`);
            }
        }

        if (geaendert) staende++;
    }

    if (staende > 0) {
        console.log(`[Garden] Skillstaffel: ${gekuerzteStufen} Stufen bei ${staende} `
            + `Spielständen zur Neuverteilung freigegeben.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { staende, gekuerzteStufen };
}

module.exports = { runSkillStaffelMigration, MARKE };
