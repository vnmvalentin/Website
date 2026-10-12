// engine/difficulty.js — Schwierigkeit wie bei Risk of Rain: sie wächst mit der Spielzeit und mit jeder geschafften
// Welt. Wer trödelt, trifft auf stärkere Gegner; wer schnell ist, verpasst Kisten. Daraus folgt alles Weitere:
// Gegnerleben/-schaden, Spawn-Budget, Kistenpreise, Gold und XP pro Kill.

export const DIFFICULTIES = {
  easy: { id: "easy", name: "Entspannt", rate: 0.6, enemyDmg: 0.75, desc: "Langsamer Anstieg, Gegner treffen schwächer. 80 % Account-XP." },
  normal: { id: "normal", name: "Normal", rate: 1.0, enemyDmg: 1, desc: "So ist das Spiel gedacht." },
  hard: { id: "hard", name: "Albtraum", rate: 1.5, enemyDmg: 1.25, desc: "Schneller Anstieg, harte Treffer. 140 % Account-XP." },
};

const TIERS = ["Sehr leicht", "Leicht", "Normal", "Schwer", "Sehr schwer", "Brutal", "Gnadenlos", "Unmöglich", "Ich sehe dich", "Kein Entkommen", "HAHAHAHA"];

// Pro Minute +0,15 (vorher 0,11): Trödeln und Kisten-Farmen kostet spürbar, sonst lohnte sich Farmen immer
export function coefficient(timeSec, stagesCleared, difficulty) {
  const minutes = timeSec / 60;
  return (1 + minutes * 0.15 * difficulty.rate) * Math.pow(1.22, stagesCleared);
}

// Eine Anzeige-Stufe = 0,9 Koeffizient: "Unmöglich" beginnt bei 7,3 (vorher 6,25)
export function tierInfo(coeff) {
  const raw = (coeff - 1) / 0.9;
  const idx = Math.min(TIERS.length - 1, Math.floor(raw));
  return { label: TIERS[idx], index: idx, progress: idx >= TIERS.length - 1 ? 1 : raw - idx };
}

// Leben wachsen spät überproportional (quadratischer Anteil): früh bleibt es fair, aber irgendwann holt dich jeder
// Lauf ein. Vorher linear 1,15 / 0,7 — damit überlebte der Test-Bot jeden Lauf bis zum Ende (Oktober 2026 gemessen).
export const enemyHpMult = (coeff) => 1 + 1.35 * (coeff - 1) + 0.2 * (coeff - 1) * (coeff - 1);
export const enemyDmgMult = (coeff, difficulty) => (1 + 0.95 * (coeff - 1)) * difficulty.enemyDmg;
// Anfangs günstig, später teuer: das Gold pro Kill wächst linear mit dem Koeffizienten, die Preise schneller
export const chestPrice = (base, coeff) => Math.round(base * Math.pow(coeff, 1.45));
