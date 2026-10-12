// engine/ascension.js — Albtraum+ (nur auf Albtraum, Stufe 1–5, jede gilt zusammen mit allen darunter). Die Texte und
// die Freischaltung stehen im Backend (adventure/meta.js ASCENSIONS); hier nur die Werte, die die Simulation braucht.

const asc = (g, n) => (g.ascension || 0) >= n;

export const ascEnemyHp = (g) => (asc(g, 1) ? 1.2 : 1);       // 1: Gegner +20 % Leben
export const ascPrice = (g) => (asc(g, 2) ? 1.25 : 1);        // 2: Kisten/Schreine +25 %
export const ascEliteChance = (g) => (asc(g, 3) ? 2 : 1);     // 3: Elite doppelt so häufig …
export const ascChampionEvery = (g) => (asc(g, 3) ? 0.7 : 1); //    … und Champions öfter
export const ascRegen = (g) => (asc(g, 4) ? 0.5 : 1);         // 4: halbe Regeneration
export const ascBossHp = (g) => (asc(g, 5) ? 1.3 : 1);        // 5: Bosse +30 % Leben …
export const ascBossRage = (g) => (asc(g, 5) ? 0.65 : 0.5);   //    … und Raserei ab 65 %
