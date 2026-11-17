// Kombinations-Chunks: mehrere Mechaniken hintereinander (z.B. Wandsprung → Dash → Grapple).
// Sie kommen nur im hinteren Teil eines Levels vor, wenn der Spieler die Einzelteile schon
// kennengelernt hat. Schwierigkeit 4–5.
import { chunk, R } from '../builder.js';

export const COMBOS = [
  chunk('combo-shaft-dash', {
    w: 48, h: 34, entry: 30, exit: 20, difficulty: 4, combo: true, tags: ['wall', 'dash', 'gap', 'climb'], needs: ['wall', 'dash'],
    gaps: [{ reach: 'dashDouble', width: 10 }],
  }, (b) => {
    b.ground(0, 15, 30);
    b.ground(15, 27, 20);
    b.rect(9, 12, 2, 16);
    // Zielboden ab Spalte 37 (war 38): Bei Tempo „normal“ blieb für den Dash nur ein Fenster von ~0,1 s (Menschen-Prüfung
    // 25.09.2026). Jetzt 50–200 ms, fast egal, wann der Doppelsprung kommt. Bei 36 wäre der Dash ganz überflüssig; bei
    // schnell/super war er es schon immer.
    b.ground(37, 48, 20);
    // Die letzte Lücke ist auf den Dash zugeschnitten; man beginnt ohne, also liegt die Ladung am Einstieg bereit.
    b.marker(4, 29, { type: 'crystal', radius: 9 });
  }),

  chunk('combo-factory', {
    w: 56, h: 20, entry: 15, exit: 15, difficulty: 4, combo: true, tags: ['conveyor', 'laser', 'saw'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 56);
    b.rect(6, 15, 14, 1, '<');
    b.marker(25, 7, { type: 'laser', dir: 'down', period: R(2.2, 2.8), on: R(0.7, 0.9), warn: 0.4, phase: R(0, 1) });
    b.marker(31, 14, { type: 'saw', path: [[0, 0], [10, 0]], speed: R(50, 75), phase: R(0, 1) });
    b.marker(46, 7, { type: 'laser', dir: 'down', period: R(2.2, 2.8), on: R(0.7, 0.9), warn: 0.4, phase: R(0, 1) });
  }),

  chunk('combo-ice-spikes', {
    w: 40, h: 18, entry: 13, exit: 13, difficulty: 4, combo: true, tags: ['ice', 'spikes'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 6);
    b.ground(6, 26);
    b.rect(6, 13, 20, 1, 'I');
    b.ground(26, 40);
    for (const x of [26, 27, 28]) b.put(x, 12, '^');
  }),

  // Rückenwind-Bö über einer Spike-Grube: 14 Tiles sind zu weit für einen sauberen Doppelsprung,
  // die Bö trägt hinüber — wer sie verpasst oder zu früh springt, landet in den Spikes.
  chunk('combo-wind-spikes', {
    w: 48, h: 20, entry: 15, exit: 15, difficulty: 4, combo: true, tags: ['wind', 'spikes', 'gap'], needs: ['double'],
  }, (b) => {
    b.ground(0, 10);
    b.ground(24, 48);
    b.rect(10, 18, 14, 2);
    for (let x = 10; x < 24; x++) b.put(x, 17, '^');
    b.marker(10, 6, { type: 'wind', w: 14, h: 11, ax: 650, ay: 0, period: 2.8, on: 1.5, phase: 0, warn: 0.3 });
  }),

  // Ringkette mit senkrechten Lasern quer zur Flugbahn: Man startet im Takt, der Flug selbst lässt sich
  // kaum noch lenken.
  chunk('combo-ring-lasers', {
    w: 46, h: 32, entry: 22, exit: 28, difficulty: 4, combo: true, tags: ['ring', 'laser', 'gap'],
  }, (b) => {
    b.ground(0, 12, 22);
    b.ground(31, 46, 28);
    [[11, 21, 'upRight'], [15, 19, 'right'], [19, 21, 'upRight'], [23, 18, 'right']]
      .forEach(([x, y, dir]) => b.marker(x, y, { type: 'ring', dir, radius: 16 }));
    b.marker(17, 8, { type: 'laser', dir: 'down', period: 2.4, on: 0.8, warn: 0.4, phase: 0 });
    b.marker(27, 8, { type: 'laser', dir: 'down', period: 2.4, on: 0.8, warn: 0.4, phase: 0.15 });
  }),

  // Kopfüber unter der Decke laufen, und von unten schießen Laser quer durch den Korridor.
  chunk('combo-gravity-laser', {
    w: 36, h: 28, entry: 21, exit: 21, difficulty: 5, combo: true, tags: ['gravity', 'laser'],
  }, (b) => {
    b.ground(0, 8);
    b.ground(28, 36);
    b.rect(8, 10, 20, 1);
    b.rect(8, 24, 20, 4);
    b.marker(8, 11, { type: 'gravityZone', w: 20, h: 13 });
    [[13, 0], [19, 0.45], [25, 0.2]].forEach(([x, phase]) => b.marker(x, 24, {
      type: 'laser', dir: 'up', period: 2.6, on: 0.8, warn: 0.4, phase,
    }));
  }),

  // Glatte Eisfläche, auf der zwei Sägen gegeneinander patrouillieren: stehen bleiben geht nicht.
  chunk('combo-ice-saws', {
    w: 40, h: 18, entry: 13, exit: 13, difficulty: 4, combo: true, tags: ['ice', 'saw'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 6);
    b.ground(6, 34);
    b.rect(6, 13, 28, 1, 'I');
    b.ground(34, 40);
    b.marker(10, 12, { type: 'saw', path: [[0, 0], [12, 0]], speed: R(45, 60), phase: 0 });
    b.marker(28, 12, { type: 'saw', path: [[0, 0], [-12, 0]], speed: R(45, 60), phase: R(0.1, 0.5) });
  }),

  chunk('combo-cave-rush', {
    w: 46, h: 24, entry: 17, exit: 17, difficulty: 5, combo: true, tags: ['crumble', 'falling', 'spikes'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 8);
    b.ground(38, 46);
    b.rect(8, 22, 30, 2, '#');
    for (let x = 8; x < 38; x++) b.put(x, 21, '^');
    [10, 14, 18, 22, 26, 30, 34].forEach((x, i) => b.put(x, i % 2 === 0 ? 16 : 15, '~'));
    for (const x of [18, 26, 34]) b.put(x, 6, 'F');
  }),
];
