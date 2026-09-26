// Gefahren im Vordergrund: Sägen, Laser, fallende Blöcke, Spikes. Schwierigkeit 3–4. Alle Zeiten
// sind Zufallsbereiche, damit derselbe Chunk mit jedem Seed anders getaktet ist.
import { chunk, R } from '../builder.js';

export const HAZARDS = [
  chunk('spike-gauntlet', {
    w: 40, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['spikes'], needs: ['jump'], mirror: true,
  }, (b) => {
    b.ground(0, 40);
    for (const x of [8, 14, 20, 26]) {
      b.put(x, 12, '^');
      b.put(x + 1, 12, '^');
    }
  }),

  chunk('saw-patrol', {
    w: 34, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['saw'], needs: ['jump'], intro: 'saw', mirror: true,
  }, (b) => {
    b.ground(0, 34);
    b.marker(9, 12, { type: 'saw', path: [[0, 0], [15, 0]], speed: R(45, 70), phase: R(0, 1) });
  }),

  chunk('saw-orbit', {
    w: 36, h: 22, entry: 17, exit: 17, difficulty: 4, tags: ['saw', 'gap'], needs: ['double'],
    gaps: [{ reach: 'double', width: 7 }, { reach: 'double', width: 9 }],
  }, (b) => {
    b.ground(0, 8);
    b.ground(28, 36);
    b.plat(15, 17, 4);
    b.marker(16, 15, { type: 'saw', orbit: 3, turnsPerSecond: R(0.22, 0.3), phase: R(0, 1) });
  }),

  chunk('laser-gates', {
    w: 40, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['laser'], intro: 'laser', mirror: true,
  }, (b) => {
    b.ground(0, 40);
    [10, 18, 26].forEach((x) => b.marker(x, 5, {
      type: 'laser', dir: 'down', period: R(2.2, 2.8), on: R(0.7, 0.9), warn: 0.4, phase: R(0, 1),
    }));
  }),

  chunk('falling-blocks', {
    w: 34, h: 20, entry: 15, exit: 15, difficulty: 3, tags: ['falling'], intro: 'falling', mirror: true,
    stretch: [{ col: 6, max: 4 }],
  }, (b) => {
    b.ground(0, 34);
    for (const x of [10, 15, 20, 25]) b.put(x, 8, 'F');
  }),

  // Niedrige Decke mit hängenden Spikes: unter den Spikes darf man nicht voll springen. Wo Bodenspikes
  // darunter stehen, bleibt ein Fenster von gut 3 Tiles — ein kurzer Hüpfer, kein Vollsprung.
  chunk('spike-ceiling', {
    w: 44, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['spikes'], needs: ['jump'], mirror: true,
  }, (b) => {
    b.ground(0, 44);
    b.rect(6, 3, 32, 5);
    for (const x of [12, 13, 22, 23]) {
      b.put(x, 8, '^');
      b.put(x, 12, '^');
    }
    for (const x of [32, 33]) b.put(x, 8, '^');
  }),

  // Wandschacht mit Spikes an beiden Wänden. Sie sitzen versetzt: Wo links Spikes sind, ist rechts frei.
  chunk('spike-wall-shaft', {
    // Nur Tempo „normal“ (Menschen-Prüfung 25.09.2026): Der Schacht hat feste Maße, der Wandsprung stößt bei schnell/super
    // aber weiter ab — man trifft die Wände in anderen Höhen, an manchen Stellen blieben 0–4 Ticks (≤ 33 ms) Spielraum.
    w: 34, h: 40, entry: 36, exit: 14, difficulty: 4, tags: ['spikes', 'wall', 'climb'], needs: ['wall'], classes: ['normal'],
  }, (b) => {
    b.ground(0, 15, 36);
    b.ground(15, 34, 14);
    b.rect(9, 8, 2, 26);
    for (const y of [31, 32, 23, 24]) b.put(11, y, '^');
    for (const y of [27, 28, 19, 20]) b.put(14, y, '^');
  }),

  // Zwei Sägen auf derselben Bahn, gegenläufig und mit unterschiedlichem Tempo: Sie treffen sich
  // jedes Mal an einer anderen Stelle.
  chunk('saw-twin-lane', {
    w: 44, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['saw'], needs: ['jump'], mirror: true,
  }, (b) => {
    b.ground(0, 44);
    b.marker(10, 12, { type: 'saw', path: [[0, 0], [24, 0]], speed: R(50, 65), phase: 0 });
    b.marker(34, 12, { type: 'saw', path: [[0, 0], [-24, 0]], speed: R(42, 58), phase: R(0.1, 0.4) });
  }),

  // Vier Sägen hintereinander, abwechselnd auf senkrechter Bahn (unten durchlaufen, wenn sie oben ist)
  // und auf waagerechter (drüberspringen).
  chunk('saw-gauntlet', {
    w: 52, h: 20, entry: 15, exit: 15, difficulty: 3, tags: ['saw'], needs: ['jump'], mirror: true,
  }, (b) => {
    b.ground(0, 52);
    b.marker(12, 14, { type: 'saw', path: [[0, 0], [0, -4]], speed: R(38, 50), phase: R(0, 1) });
    b.marker(20, 14, { type: 'saw', path: [[0, 0], [6, 0]], speed: R(45, 60), phase: R(0, 1) });
    b.marker(32, 14, { type: 'saw', path: [[0, 0], [0, -4]], speed: R(38, 50), phase: R(0, 1) });
    b.marker(38, 14, { type: 'saw', path: [[0, 0], [6, 0]], speed: R(45, 60), phase: R(0, 1) });
  }),

  // Wie saw-orbit, aber mit zwei Plattformen und zwei kreisenden Sägen in versetztem Takt.
  chunk('saw-orbit-twin', {
    w: 46, h: 22, entry: 17, exit: 17, difficulty: 4, tags: ['saw', 'gap'], needs: ['double'],
    gaps: [{ reach: 'double', width: 6 }, { reach: 'double', width: 8 }, { reach: 'double', width: 8 }],
  }, (b) => {
    b.ground(0, 8);
    b.ground(38, 46);
    b.plat(14, 17, 4);
    b.plat(26, 17, 4);
    b.marker(15, 15, { type: 'saw', orbit: 3, turnsPerSecond: R(0.2, 0.28), phase: 0 });
    b.marker(27, 15, { type: 'saw', orbit: 3, turnsPerSecond: R(0.2, 0.28), phase: 0.5 });
  }),

  // Wandschacht mit waagerechten Lasern: Die Strahlen queren den Schacht, man klettert im Takt.
  chunk('laser-shaft', {
    // Nur Tempo „normal“ (Menschen-Prüfung 25.09.2026): Der Schacht hat feste Maße, der Wandsprung stößt bei schnell/super
    // aber weiter ab — man trifft die Wände in anderen Höhen, an manchen Stellen blieben 0–4 Ticks (≤ 33 ms) Spielraum.
    w: 34, h: 40, entry: 36, exit: 14, difficulty: 4, tags: ['laser', 'wall', 'climb'], needs: ['wall'], classes: ['normal'],
  }, (b) => {
    b.ground(0, 15, 36);
    b.ground(15, 34, 14);
    b.rect(9, 8, 2, 26);
    [[30, 0], [24, 0.33], [18, 0.66]].forEach(([y, phase]) => b.marker(10, y, {
      type: 'laser', dir: 'right', period: R(2.4, 2.8), on: R(0.7, 0.9), warn: 0.4, phase,
    }));
  }),

  // Laser-Welle: Die Phasen laufen gestaffelt, so dass ein sicheres Fenster mitwandert. Wer im Takt
  // läuft, kommt ohne Stopp durch; wer zögert, wartet vor dem nächsten Laser.
  chunk('laser-pattern', {
    w: 48, h: 18, entry: 13, exit: 13, difficulty: 4, tags: ['laser'], mirror: true,
  }, (b) => {
    b.ground(0, 48);
    [10, 17, 24, 31, 38].forEach((x, i) => b.marker(x, 5, {
      type: 'laser', dir: 'down', period: 2.4, on: 0.8, warn: 0.4, phase: i * 0.2,
    }));
  }),

  chunk('spike-corridor', {
    w: 36, h: 20, entry: 15, exit: 15, difficulty: 4, tags: ['spikes', 'gap'], needs: ['jump'],
    gaps: [{ reach: 'jump', width: 5 }, { reach: 'jump', width: 5 }],
  }, (b) => {
    b.ground(0, 12);
    b.ground(24, 36);
    // Boden der Grube voller Spikes, Trittstein in der Mitte
    b.rect(12, 18, 12, 2, '#');
    for (let x = 12; x < 24; x++) b.put(x, 17, '^');
    b.plat(17, 15, 2);   // Trittstein in Bodenhöhe: zwei Sprünge à 5 Tiles
  }),
];

