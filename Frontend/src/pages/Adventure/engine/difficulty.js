// engine/difficulty.js — Schwierigkeit wie bei Risk of Rain: sie wächst mit der Spielzeit und mit jeder geschafften
// Welt. Wer trödelt, trifft auf stärkere Gegner; wer schnell ist, verpasst Kisten. Daraus folgt alles Weitere:
// Gegnerleben/-schaden, Spawn-Budget, Kistenpreise, Gold und XP pro Kill.

export const DIFFICULTIES = {
  easy: { id: "easy", name: "Entspannt", rate: 0.6, enemyDmg: 0.75, desc: "Langsamer Anstieg, Gegner treffen schwächer. 80 % Account-XP." },
  normal: { id: "normal", name: "Normal", rate: 1.0, enemyDmg: 1, desc: "So ist das Spiel gedacht." },
  hard: { id: "hard", name: "Albtraum", rate: 1.5, enemyDmg: 1.25, desc: "Schneller Anstieg, harte Treffer. 140 % Account-XP." },
};

const TIERS = ["Sehr leicht", "Leicht", "Normal", "Schwer", "Sehr schwer", "Brutal", "Gnadenlos", "Unmöglich", "Ich sehe dich", "Kein Entkommen", "HAHAHAHA"];

// Jede geschaffte Welt macht alles härter — und zwar hinten stärker als vorn. Bis November 2026 galt gleichmäßig 1,22
// pro Welt (Finale: 2,7); damit kam ein geübter Spieler im ersten Lauf mit vollem Ausbau durch. Ein gleichmäßig
// höherer Faktor (1,33) ließ den Test-Bot dagegen schon in Welt 2 sterben. Deshalb eine Tabelle: Welt 2 wie bisher,
// ab Welt 3 zieht es an. Index = geschaffte Welten; danach (Schleifen) geht es mit STAGE_GROWTH weiter.
const STAGE_MULT = [1, 1.27, 1.72, 2.4, 3.25, 4];
const STAGE_GROWTH = 1.33;
export function stageMult(stagesCleared) {
  const last = STAGE_MULT.length - 1;
  return stagesCleared <= last ? STAGE_MULT[Math.max(0, stagesCleared)] : STAGE_MULT[last] * Math.pow(STAGE_GROWTH, stagesCleared - last);
}

// Pro Minute +0,15 (vorher 0,11): Trödeln und Kisten-Farmen kostet spürbar, sonst lohnte sich Farmen immer
export function coefficient(timeSec, stagesCleared, difficulty) {
  const minutes = timeSec / 60;
  return (1 + minutes * 0.15 * difficulty.rate) * stageMult(stagesCleared);
}

// Eine Anzeige-Stufe = 1,3 Koeffizient (vorher 0,9): mit der steileren Welt-Tabelle stand die Anzeige sonst schon in
// Welt 5 am Anschlag. So beginnt "Unmöglich" etwa dort, und die letzte Stufe erreicht man im Finale.
export function tierInfo(coeff) {
  const raw = (coeff - 1) / 1.3;
  const idx = Math.min(TIERS.length - 1, Math.floor(raw));
  return { label: TIERS[idx], index: idx, progress: idx >= TIERS.length - 1 ? 1 : raw - idx };
}

// Leben wachsen spät überproportional (quadratischer Anteil): früh bleibt es fair, aber irgendwann holt dich jeder
// Lauf ein. Vorher linear 1,15 / 0,7 — damit überlebte der Test-Bot jeden Lauf bis zum Ende (Oktober 2026 gemessen).
export const enemyHpMult = (coeff) => 1 + 1.35 * (coeff - 1) + 0.2 * (coeff - 1) * (coeff - 1);
// Futter (data/enemies.js, tier "futter") wächst nur linear und flacher: wer seine Waffen ausbaut, soll die Masse bis
// zum Schluss mit einem Treffer fällen können — die Gefahr kommt aus der Zahl, nicht aus dem einzelnen Gegner
export const fodderHpMult = (coeff) => 1 + 0.8 * (coeff - 1);
export const enemyDmgMult = (coeff, difficulty) => (1 + 0.95 * (coeff - 1)) * difficulty.enemyDmg;
// Anfangs günstig, später teuer: das Gold pro Kill wächst linear mit dem Koeffizienten, die Preise schneller
export const chestPrice = (base, coeff) => Math.round(base * Math.pow(coeff, 1.45));
