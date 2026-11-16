// Kamera (client/camera.js): ruhiges Bild beim Laufen und Hüpfen.
// Rückmeldung 14.11.2026: „das Bild ruckelt ein bisschen beim Laufen“ — gemessen folgte die Kamera jedem Sprungbogen, und
// bei jeder Landung sprang ihr Tempo um ~400 px/s in einem Bild (der Blick nach unten beim Fallen fiel schlagartig weg).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, updateCamera, VIEW_H } from '../camera.js';

const KARTE = { w: 400, h: 200 };
const DT = 1 / 60;

/** Einen Bewegungsablauf abspielen: `lage(i)` → { x, y, vx, vy, onGround }; liefert die Kamera-y je Bild */
function spiele(n, lage, cam = createCamera()) {
  const ys = [];
  for (let i = 0; i < n; i++) {
    const p = { facing: 1, ...lage(i) };
    updateCamera(cam, p.x, p.y, p, KARTE, DT);
    ys.push(cam.y);
  }
  return { ys, cam };
}

const groessterTempoSprung = (ys) => {
  let max = 0;
  for (let i = 2; i < ys.length; i++) max = Math.max(max, Math.abs((ys[i] - ys[i - 1]) - (ys[i - 1] - ys[i - 2])) / DT);
  return max;
};

test('Ein kleiner Hüpfer bewegt das Bild nicht', () => {
  // Laufen auf y = 1600, dazwischen ein Hüpfer von 22 px Höhe (getippter Sprung)
  const boden = 1600;
  const { ys } = spiele(90, (i) => {
    const t = i - 30;
    const inLuft = t >= 0 && t < 24;
    const hoehe = inLuft ? 22 * (1 - ((t - 12) / 12) * ((t - 12) / 12)) : 0;
    return { x: 2000 + i * 3.85, y: boden - hoehe, vx: 231, vy: inLuft ? (t - 12) * 30 : 0, onGround: !inLuft };
  });
  const spanne = Math.max(...ys.slice(10)) - Math.min(...ys.slice(10));
  // (nur der geglättete Blick nach unten im Fallen bewegt es um wenige Pixel)
  assert.ok(spanne < 12, `Kamera wanderte ${spanne.toFixed(1)} px`);
});

test('Eine Landung aus dem Fall gibt keinen Ruck', () => {
  // 40 Bilder fallen mit 380 px/s, dann stehen
  const { ys } = spiele(120, (i) => (i < 40
    ? { x: 2000 + i * 3.85, y: 1000 + i * 380 * DT, vx: 231, vy: 380, onGround: false }
    : { x: 2000 + i * 3.85, y: 1000 + 40 * 380 * DT, vx: 231, vy: 0, onGround: true }));
  // Vorher: ~400 px/s Tempo-Sprung im Bild der Landung. Die Kamera darf bremsen, aber nicht schlagartig umkehren.
  assert.ok(groessterTempoSprung(ys.slice(5)) < 120, `Tempo-Sprung ${groessterTempoSprung(ys.slice(5)).toFixed(0)} px/s`);
});

test('Am Boden kommt die Figur wieder in die Bildmitte; ein weiter Aufstieg wird mitgegangen', () => {
  // 60 Zeilen hinauf (weit über die Totzone), dann stehen: Die Kamera folgt und richtet sich mittig aus
  const { cam } = spiele(240, (i) => {
    const y = i < 60 ? 2000 - i * 6 : 2000 - 360;
    return { x: 3000, y, vx: 0, vy: i < 60 ? -360 : 0, onGround: i >= 60 };
  });
  const mitte = cam.y + VIEW_H / 2;
  assert.ok(Math.abs(mitte - (2000 - 360 + 7)) < 3, `Bildmitte ${mitte.toFixed(1)}, Figur ${(2000 - 360 + 7).toFixed(1)}`);
});

test('Nach einem Respawn (weiter Sprung der Position) steht die Figur sofort mittig', () => {
  const cam = createCamera();
  spiele(30, () => ({ x: 3000, y: 2400, vx: 0, vy: 0, onGround: true }), cam);
  const { cam: c2 } = spiele(1, () => ({ x: 500, y: 900, vx: 0, vy: 0, onGround: true }), cam);
  assert.ok(Math.abs(c2.y + VIEW_H / 2 - (900 + 7)) < 1);
});
