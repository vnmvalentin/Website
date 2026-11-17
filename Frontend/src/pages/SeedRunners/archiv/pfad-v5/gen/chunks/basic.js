// Grundlagen: Laufen, Springen, Lücken, Stufen, Plattformen. Schwierigkeit 1–2, wenige Mechaniken.
// Hier stehen auch die ersten Begegnungen mit Federn, bröckelnden Blöcken, Förderbändern, Eis und
// bewegten Plattformen — in einer harmlosen Form, damit man sie kennenlernt, bevor sie ernst werden.
import { chunk, R } from '../builder.js';

export const BASIC = [
  chunk('run-flat', {
    w: 22, h: 18, entry: 13, exit: 13, difficulty: 1, tags: ['run'], mirror: true, iceable: true,
    stretch: [{ col: 4, max: 8 }],
  }, (b) => {
    b.ground(0, 22);
    b.rect(8, 12, 2, 1);          // 1 Tile hoch
    b.rect(15, 11, 2, 2);         // 2 Tiles hoch
  }),

  chunk('gap-small', {
    w: 24, h: 18, entry: 13, exit: 13, difficulty: 1, tags: ['gap'], needs: ['jump'], mirror: true, iceable: true,
    stretch: [{ col: 11, reach: 'jump', base: 3, max: 6 }],
  }, (b) => {
    b.ground(0, 10);
    b.ground(13, 24);
  }),

  chunk('gap-twin', {
    w: 32, h: 18, entry: 13, exit: 13, difficulty: 1, tags: ['gap'], needs: ['jump'], mirror: true, iceable: true,
    stretch: [
      { col: 9, reach: 'jump', base: 3, max: 4 },
      { col: 20, reach: 'jump', base: 3, max: 4 },
    ],
  }, (b) => {
    b.ground(0, 8);
    b.ground(11, 19);
    b.ground(22, 32);
  }),

  chunk('steps-up', {
    w: 26, h: 22, entry: 18, exit: 14, difficulty: 1, tags: ['climb'], needs: ['jump'],
    stretch: [{ col: 3, max: 4 }],
  }, (b) => {
    b.ground(0, 6, 18);
    b.ground(6, 12, 17);
    b.ground(12, 18, 16);
    b.ground(18, 22, 15);
    b.ground(22, 26, 14);
  }),

  chunk('steps-down', {
    w: 26, h: 22, entry: 14, exit: 18, difficulty: 1, tags: ['climb'],
    stretch: [{ col: 3, max: 4 }],
  }, (b) => {
    b.ground(0, 4, 14);
    b.ground(4, 10, 15);
    b.ground(10, 16, 16);
    b.ground(16, 22, 17);
    b.ground(22, 26, 18);
  }),

  chunk('pillars', {
    w: 34, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['run', 'climb'], needs: ['jump'], mirror: true, iceable: true,
    stretch: [{ col: 5, max: 3 }, { col: 12, max: 3 }, { col: 20, max: 3 }],
  }, (b) => {
    b.ground(0, 34);
    b.rect(8, 11, 2, 2);
    b.rect(15, 10, 2, 3);
    b.rect(23, 11, 2, 2);
  }),

  chunk('spike-pit', {
    w: 28, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['spikes'], needs: ['jump'], intro: 'spikes', mirror: true,
    stretch: [{ col: 11, reach: 'jump', base: 4, max: 4 }],
  }, (b) => {
    b.ground(0, 28);
    for (let x = 10; x < 14; x++) b.put(x, 12, '^');
  }),

  chunk('gap-double', {
    w: 30, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['gap', 'double'], needs: ['double'], intro: 'double', mirror: true,
    stretch: [{ col: 12, reach: 'double', base: 6, max: 8 }],
  }, (b) => {
    b.ground(0, 9);
    b.ground(15, 30);
  }),

  chunk('ledge-high', {
    w: 26, h: 22, entry: 17, exit: 12, difficulty: 2, tags: ['climb', 'double'], needs: ['double'], intro: 'double',
    stretch: [{ col: 4, max: 3 }],
  }, (b) => {
    b.ground(0, 11, 17);
    b.ground(11, 26, 12);
  }),

  chunk('oneway-tower', {
    w: 30, h: 30, entry: 26, exit: 14, difficulty: 2, tags: ['oneway', 'climb'], needs: ['jump'], intro: 'oneway',
  }, (b) => {
    b.ground(0, 6, 26);
    b.plat(6, 23, 5, '=');
    b.plat(11, 20, 5, '=');
    b.plat(16, 17, 5, '=');
    b.ground(21, 30, 14);
  }),

  chunk('spring-tower', {
    w: 24, h: 35, entry: 30, exit: 23, difficulty: 2, tags: ['spring', 'climb'], intro: 'spring',
  }, (b) => {
    b.ground(0, 8, 30);
    b.put(7, 29, 'P');
    b.ground(10, 24, 23);
  }),

  chunk('spring-gap', {
    w: 34, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['spring', 'gap'],
  }, (b) => {
    b.ground(0, 10);
    b.put(8, 12, 'P');
    b.ground(22, 34);
  }),

  chunk('crumble-bridge', {
    w: 30, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['crumble'], intro: 'crumble',
    stretch: [{ col: 14, max: 4 }],
  }, (b) => {
    b.ground(0, 7);
    b.ground(23, 30);
    for (let x = 7; x < 23; x++) b.put(x, 13, '~');
  }),

  chunk('conveyor-run', {
    w: 26, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['conveyor'], intro: 'conveyor', mirror: true,
    stretch: [{ col: 12, max: 6 }],
  }, (b) => {
    b.ground(0, 26);
    b.rect(6, 13, 14, 1, '<');
  }),

  chunk('moving-h', {
    w: 32, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['mover'], intro: 'mover', mirror: true,
  }, (b) => {
    b.ground(0, 8);
    b.ground(24, 32);
    b.marker(8, 13, { type: 'mover', width: 3, path: [[0, 0], [13, 0]], speed: R(38, 55), phase: R(0, 1) });
  }),

  chunk('ice-slide-gap', {
    w: 30, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['ice', 'gap'], intro: 'ice',
    stretch: [{ col: 22, reach: 'jump', base: 4, max: 2 }],
  }, (b) => {
    b.ground(0, 6);
    b.ground(6, 20);
    b.rect(6, 13, 14, 1, 'I');
    b.ground(24, 30);
  }),
];
