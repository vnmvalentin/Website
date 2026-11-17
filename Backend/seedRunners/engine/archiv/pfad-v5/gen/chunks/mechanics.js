// Eine Mechanik im Vordergrund: Wandsprung, Grapple, Dash, Wind, Portale, Schalter, Schlüssel …
// Schwierigkeit 2–4. Wer hier neue Chunks ergänzt, folgt der Faustregel: EINE Idee pro Chunk,
// die Kombinationen stehen in combos.js.
import { chunk, R } from '../builder.js';

// Kristallkette. Nach einem Dash fliegt man 0,2 s waagerecht und fällt dann — die Kette liegt
// deshalb ABSTEIGEND (jeder Kristall ≈ 1 Tile tiefer, man fällt also mit) und die Kristalle sind
// größer (Radius 9), damit eine menschliche Reaktionszeit reicht. Ein waagerechter Verlauf, wie
// er der Solver-Bot zeigt, funktioniert für Menschen nicht: nach 1–2 Kristallen fällt man darunter.
// Die Abstände wachsen mit dem Tempo (Dash und Anlauf sind schneller), darum je Klasse eine Variante.
// Geprüft mit einem Bot, der nach dem Einsammeln 2–18 Ticks (17–150 ms) zögert, bevor er dasht.
const CRYSTAL_COLS = { normal: [13, 17, 21, 26, 30], fast: [14, 19, 24, 29, 34], super: [14, 21, 27, 33, 39] };
const crystalChain = (cls) => {
  const cols = CRYSTAL_COLS[cls];
  const last = cols[cols.length - 1];
  return chunk(cls === 'normal' ? 'crystal-chain' : `crystal-chain-${cls}`, {
    w: last + 15, h: 25, entry: 14, exit: 21, difficulty: 3, tags: ['dash', 'crystal', 'gap'], needs: ['dash'],
    intro: 'crystal', classes: [cls],
  }, (b) => {
    b.ground(0, 10, 14);
    b.ground(last + 3, last + 15, 21);
    // Man beginnt ohne Dash: Ein Kristall auf dem Boden vor der Kante gibt die Ladung für den ersten Sprung der Kette.
    b.marker(7, 13, { type: 'crystal', radius: 9 });
    cols.forEach((x, i) => b.marker(x, 13 + i, { type: 'crystal', radius: 9 }));
  });
};

export const MECHANICS = [
  // Wandschacht mit Einstieg unten: die linke Wand lässt zwei Zeilen frei, damit man hineinkommt.
  chunk('wall-shaft', {
    w: 30, h: 26, entry: 22, exit: 12, difficulty: 3, tags: ['wall', 'climb'], needs: ['wall'], intro: 'wall',
  }, (b) => {
    b.ground(0, 15, 22);
    b.ground(15, 30, 12);
    b.rect(9, 8, 2, 12);
  }),

  chunk('wall-shaft-tall', {
    w: 34, h: 40, entry: 36, exit: 14, difficulty: 4, tags: ['wall', 'climb'], needs: ['wall'],
  }, (b) => {
    b.ground(0, 15, 36);
    b.ground(15, 34, 14);
    b.rect(9, 8, 2, 26);
  }),

  chunk('sticky-climb', {
    w: 26, h: 26, entry: 22, exit: 12, difficulty: 3, tags: ['sticky', 'climb'], needs: ['wall'], intro: 'sticky',
  }, (b) => {
    b.ground(0, 9, 22);
    b.ground(9, 26, 12);
    b.rect(9, 12, 1, 10, 'W');
  }),

  chunk('grapple-pit', {
    w: 40, h: 24, entry: 19, exit: 19, difficulty: 3, tags: ['grapple', 'gap'], needs: ['grapple'], intro: 'grapple',
  }, (b) => {
    b.ground(0, 10);
    b.ground(28, 40);
    b.put(14, 12, 'G');
    b.put(23, 12, 'G');
  }),

  chunk('grapple-long', {
    w: 52, h: 24, entry: 19, exit: 19, difficulty: 4, tags: ['grapple', 'gap'], needs: ['grapple'],
  }, (b) => {
    b.ground(0, 10);
    b.ground(42, 52);
    for (const x of [14, 23, 32]) b.put(x, 12, 'G');
  }),

  chunk('grapple-swing-up', {
    w: 44, h: 34, entry: 29, exit: 20, difficulty: 4, tags: ['grapple', 'climb'], needs: ['grapple'],
  }, (b) => {
    b.ground(0, 12, 29);
    b.ground(32, 44, 20);
    b.put(18, 18, 'G');
    b.put(27, 14, 'G');
  }),

  ...['normal', 'fast', 'super'].map(crystalChain),

  chunk('ring-launch', {
    w: 42, h: 20, entry: 15, exit: 15, difficulty: 3, tags: ['ring', 'gap'], intro: 'ring',
  }, (b) => {
    b.ground(0, 10);
    // Zielboden ab Spalte 23 (war 26): Bei Tempo „normal“ trug der Ring allein nur bis knapp UNTER die Kante — man kam
    // nur per Wandsprung-Rettung an der Gegenwand hinauf (Menschen-Prüfung 25.09.2026). Einführungs-Chunk: Der Ring muss tragen.
    b.ground(23, 42);
    b.marker(10, 11, { type: 'ring', dir: 'upRight' });
  }),

  chunk('wind-updraft', {
    w: 28, h: 34, entry: 30, exit: 18, difficulty: 3, tags: ['wind', 'climb'], intro: 'wind',
  }, (b) => {
    b.ground(0, 10, 30);
    b.ground(14, 28, 18);
    b.marker(10, 16, { type: 'wind', w: 4, h: 14, ay: -1000 });
  }),

  chunk('wind-headwind', {
    w: 36, h: 20, entry: 15, exit: 15, difficulty: 3, tags: ['wind', 'gap'], needs: ['double'], mirror: false,
  }, (b) => {
    b.ground(0, 12);
    b.ground(19, 36);
    b.marker(10, 4, { type: 'wind', w: 11, h: 11, ax: -450, ay: 0 });
  }),

  chunk('portal-hop', {
    w: 44, h: 20, entry: 15, exit: 15, difficulty: 2, tags: ['portal'], intro: 'portal',
  }, (b) => {
    b.ground(0, 12);
    b.ground(32, 44);
    b.marker(10, 14, { type: 'portal', id: 'in', pair: 'out' });
    b.marker(33, 11, { type: 'portal', id: 'out', pair: 'in' });
  }),

  // Zwei Schalter: Nach beiden ist der Zustand wieder wie am Anfang (siehe Kommentar in world.js
  // zu den Schnappschüssen) — jeder Schalter-Chunk muss eine GERADE Zahl Schalter haben.
  chunk('switch-gate', {
    w: 32, h: 18, entry: 13, exit: 13, difficulty: 2, tags: ['switch'], intro: 'switch',
  }, (b) => {
    b.ground(0, 32);
    b.put(6, 12, 'T');
    b.rect(16, 9, 1, 4, 'R');
    b.put(20, 12, 'T');
    b.rect(25, 9, 1, 4, 'B');
  }),

  chunk('key-door', {
    w: 36, h: 22, entry: 17, exit: 17, difficulty: 3, tags: ['key', 'double'], needs: ['double'], intro: 'key',
  }, (b) => {
    b.ground(0, 36);
    b.plat(8, 12, 4);
    b.put(9, 11, 'K');
    b.rect(26, 0, 2, 12);
    b.rect(26, 12, 1, 5, 'Y');
  }),

  chunk('moving-v', {
    w: 26, h: 32, entry: 28, exit: 18, difficulty: 3, tags: ['mover', 'climb'],
  }, (b) => {
    b.ground(0, 8, 28);
    b.ground(18, 26, 18);
    b.marker(10, 28, { type: 'mover', width: 3, path: [[0, 0], [0, -10]], speed: R(35, 48), phase: R(0, 1) });
  }),

  chunk('gravity-ceiling', {
    w: 32, h: 26, entry: 21, exit: 21, difficulty: 4, tags: ['gravity'], intro: 'gravity',
  }, (b) => {
    b.ground(0, 8);
    b.ground(24, 32);
    b.rect(8, 10, 16, 1);
    b.marker(8, 11, { type: 'gravityZone', w: 16, h: 14 });
  }),

  chunk('ice-gap', {
    w: 34, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['ice', 'gap'], needs: ['jump'],
    stretch: [
      { col: 7, reach: 'jump', base: 3, max: 3 },
      { col: 18, reach: 'jump', base: 3, max: 3 },
    ],
  }, (b) => {
    b.ground(0, 6);
    b.ground(9, 17);
    b.rect(9, 13, 8, 1, 'I');
    b.ground(20, 26);
    b.rect(20, 13, 6, 1, 'I');
    b.ground(29, 34);
  }),

  chunk('crumble-stairs', {
    w: 32, h: 22, entry: 17, exit: 17, difficulty: 3, tags: ['crumble', 'gap'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 6);
    b.ground(26, 32);
    [8, 11, 14, 17, 20, 23].forEach((x, i) => b.put(x, i % 2 === 0 ? 16 : 15, '~'));
  }),

  // ── Aus dem Feedback vom 21.09.2026 ────────────────────────────────────────

  // Breiter Block als Brücke: Er hängt über der Lücke, sein linkes Ende über dem Rand. Am Rand stehend
  // löst man ihn aus, macht einen Schritt zurück, und er landet auf dem Rand: eine Stufe, 2 Tiles hoch,
  // die über die Lücke ragt. Unterlaufen geht nicht (die Lücke ist dahinter).
  chunk('falling-bridge', {
    w: 36, h: 22, entry: 15, exit: 15, difficulty: 3, tags: ['falling', 'gap'],
  }, (b) => {
    b.ground(0, 10);
    b.ground(24, 36);
    b.marker(8, 5, { type: 'fallingBlock', width: 12, height: 2, reset: 8, margin: 32 });
  }),

  // Breiter Block als Deckel: Über einer Spike-Grube hängt ein Block genau in Grubenbreite. Am Rand
  // ausgelöst, füllt er die Grube und liegt bündig als Brücke.
  chunk('falling-lid', {
    w: 40, h: 22, entry: 15, exit: 15, difficulty: 3, tags: ['falling', 'spikes', 'gap'],
  }, (b) => {
    b.ground(0, 12);
    b.ground(20, 40);
    b.rect(12, 18, 8, 4);
    for (let x = 12; x < 20; x++) b.put(x, 17, '^');
    b.marker(12, 9, { type: 'fallingBlock', width: 8, height: 3, reset: 6, margin: 24 });
  }),

  // Plattform auf Kreisbahn zwischen zwei Rändern: aufspringen, mitfahren, im richtigen Moment abspringen.
  chunk('mover-loop', {
    w: 40, h: 22, entry: 15, exit: 15, difficulty: 3, tags: ['mover', 'gap'], mirror: true,
  }, (b) => {
    b.ground(0, 10);
    b.ground(27, 40);
    b.marker(20, 10, {
      type: 'mover', mode: 'loop', width: 3, speed: R(55, 75),
      path: [[0, 0], [-0.88, 2.12], [-3, 3], [-5.12, 2.12], [-6, 0], [-5.12, -2.12], [-3, -3], [-0.88, -2.12], [0, 0]],
    });
  }),

  // Schrägpads: tragen etwa 10 Tiles weit. Das zweite Pad steht auf der Mittelinsel, man landet fast darauf
  // und fliegt ohne Halt weiter.
  chunk('spring-diagonal', {
    w: 44, h: 22, entry: 17, exit: 17, difficulty: 3, tags: ['spring', 'gap'],
  }, (b) => {
    b.ground(0, 9);
    b.ground(16, 23);
    b.ground(30, 44);
    b.marker(7, 16, { type: 'spring', dir: 'upRight' });
    b.marker(21, 16, { type: 'spring', dir: 'upRight' });
  }),

  // Pads an den Schachtwänden: Sie werfen abwechselnd nach rechts und links, jedes genau eine Zeile höher
  // (ein Wurf steigt gut 1 Tile, bevor er die Gegenwand erreicht). Der Anfang braucht einen Sprung ans erste
  // Pad, den Rest erledigt der Schacht; oben hilft der Doppelsprung auf den Absatz.
  chunk('spring-ricochet', {
    w: 34, h: 40, entry: 36, exit: 14, difficulty: 4, tags: ['spring', 'wall', 'climb'],
  }, (b) => {
    b.ground(0, 15, 36);
    b.ground(15, 34, 14);
    b.rect(9, 8, 2, 26);
    for (let y = 32; y >= 18; y -= 2) b.marker(11, y, { type: 'spring', dir: 'right' });
    for (let y = 31; y >= 19; y -= 2) b.marker(14, y, { type: 'spring', dir: 'left' });
  }),

  // Ringkette: vier große Ringe, die einander die Flugbahn zuspielen (schräg hoch, waagerecht, schräg hoch,
  // waagerecht). Mit dem Bot auf Robustheit geprüft: Startversatz ±6 px und Steuerfehler stören nicht.
  // Nach dem letzten Ring fällt man auf den tiefer liegenden Boden.
  chunk('ring-chain', {
    w: 46, h: 32, entry: 22, exit: 28, difficulty: 3, tags: ['ring', 'gap'],
  }, (b) => {
    b.ground(0, 12, 22);
    b.ground(31, 46, 28);
    [[11, 21, 'upRight'], [15, 19, 'right'], [19, 21, 'upRight'], [23, 18, 'right']]
      .forEach(([x, y, dir]) => b.marker(x, y, { type: 'ring', dir, radius: 16 }));
  }),

  // Böen: Gegenwind über der Lücke weht nur im Takt. Vor dem Absprung die Bö abwarten.
  chunk('wind-gusts', {
    w: 36, h: 20, entry: 15, exit: 15, difficulty: 3, tags: ['wind', 'gap'], needs: ['double'],
    gaps: [{ reach: 'double', width: 7 }],
  }, (b) => {
    b.ground(0, 12);
    b.ground(19, 36);
    b.marker(10, 4, {
      type: 'wind', w: 11, h: 11, ax: -450, ay: 0, period: R(2.4, 3.0), on: R(1.0, 1.4), phase: R(0, 1), warn: 0.3,
    });
  }),

  // Aufwind in Böen: Nur solange er weht, trägt er. Am Schachtgrund liegt ein Boden, ein verpasster
  // Moment kostet also Zeit, nicht das Leben.
  chunk('wind-updraft-gusts', {
    w: 28, h: 34, entry: 30, exit: 18, difficulty: 3, tags: ['wind', 'climb'],
  }, (b) => {
    b.ground(0, 10, 30);
    b.ground(14, 28, 18);
    b.rect(10, 32, 4, 2);
    b.marker(10, 16, {
      type: 'wind', w: 4, h: 14, ay: -1000, period: R(2.6, 3.2), on: R(1.2, 1.6), phase: R(0, 1), warn: 0.3,
    });
  }),

  // Kopfüber-Korridor mit Spikes, die von der Decke hängen. In der Zone ist die Decke der Boden:
  // Man läuft und springt kopfüber über sie.
  chunk('gravity-spikes', {
    w: 36, h: 26, entry: 21, exit: 21, difficulty: 4, tags: ['gravity', 'spikes'],
  }, (b) => {
    b.ground(0, 8);
    b.ground(28, 36);
    b.rect(8, 10, 20, 1);
    b.marker(8, 11, { type: 'gravityZone', w: 20, h: 14 });
    for (const x of [14, 15, 21, 22]) b.put(x, 11, '^');
  }),

  // Kopfüber über Lücken: Die Decke ist in Stücke geteilt, dazwischen springt man (nach unten) hinüber.
  // Wer verfehlt, pendelt an der Zonengrenze und muss sich wieder unter ein Stück steuern.
  chunk('gravity-hop', {
    w: 40, h: 26, entry: 21, exit: 21, difficulty: 4, tags: ['gravity', 'gap'], needs: ['jump'],
    gaps: [{ reach: 'jump', width: 5 }, { reach: 'jump', width: 5 }],
  }, (b) => {
    b.ground(0, 8);
    b.ground(32, 40);
    b.rect(8, 10, 5, 1);
    b.rect(18, 10, 5, 1);
    b.rect(28, 10, 4, 1);
    b.marker(8, 11, { type: 'gravityZone', w: 24, h: 14 });
  }),

  // Portalfalle: Das erste Portal führt mitten in die Spikes und muss gemieden werden (drüberhüpfen).
  // Das zweite ist die Abkürzung über die Grube.
  chunk('portal-trap', {
    w: 40, h: 22, entry: 15, exit: 15, difficulty: 3, tags: ['portal', 'spikes', 'gap'],
  }, (b) => {
    b.ground(0, 16);
    b.ground(24, 40);
    b.rect(16, 18, 8, 4);
    for (let x = 16; x < 24; x++) b.put(x, 17, '^');
    b.marker(10, 14, { type: 'portal', id: 'trap', pair: 'trapExit' });
    b.marker(19, 15, { type: 'portal', id: 'trapExit', pair: 'trap' });
    b.marker(14, 14, { type: 'portal', id: 'skip', pair: 'skipExit' });
    b.marker(28, 14, { type: 'portal', id: 'skipExit', pair: 'skip' });
  }),

  // Schalter mitten in der Luft: Man muss hineinspringen. Der erste öffnet die rote, der zweite die blaue Wand.
  chunk('switch-air', {
    w: 38, h: 18, entry: 13, exit: 13, difficulty: 3, tags: ['switch'], needs: ['jump'],
  }, (b) => {
    b.ground(0, 38);
    b.put(8, 10, 'T');
    b.rect(14, 3, 1, 10, 'R');
    b.put(20, 10, 'T');
    b.rect(26, 3, 1, 10, 'B');
  }),
];
