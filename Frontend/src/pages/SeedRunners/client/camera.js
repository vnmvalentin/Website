// Kamera: folgt dem Spieler mit Glättung und Vorausschau in Laufrichtung.
//
// Die Kamera gehört zum Rendering, nicht zur Sim: Sie läuft mit echter Bildzeit (dt in
// Sekunden) und darf deshalb Math.exp & Co. benutzen. Auf das Spielergebnis hat sie keinen
// Einfluss.

import { TILE, PLAYER_W, PLAYER_H } from '../sim/config.js';

// Sichtfenster in Weltpixeln (16:9). Der Canvas skaliert das auf seine tatsächliche Größe.
export const VIEW_W = 480;
export const VIEW_H = 270;

const LOOK_AHEAD_PX = 44;        // so weit schaut die Kamera in Laufrichtung voraus
const LOOK_AHEAD_SPEED = 140;    // ab diesem Tempo ist die Vorausschau voll ausgeprägt
const FOLLOW_RATE = 9;           // je höher, desto straffer folgt die Kamera
const LOOK_RATE = 4;             // Vorausschau wechselt bewusst träger als die Kamera selbst
const FALL_LOOK = 0.12;          // beim schnellen Fallen etwas nach unten schauen
const SNAP_DISTANCE = VIEW_W * 0.6;
// Senkrechte Totzone (Rückmeldung 14.11.2026: „das Bild ruckelt beim Laufen“): So weit darf die Figur von der Bildmitte
// nach oben oder unten wandern, ohne dass die Kamera folgt — ein Hüpfer bewegt das Bild nicht mehr. Vorher folgte die Kamera
// jedem Sprungbogen (gemessen: bis 78 px Hub in einer halben Sekunde), und bei jeder Landung fiel der Blick nach unten
// schlagartig weg (Kamera-Tempo sprang um 400 px/s in einem Bild).
const DEAD_ZONE_Y = 26;
const RECENTER_RATE = 3;         // am Boden zieht die Kamera gemächlich nach, bis die Figur wieder mittig steht

export function createCamera() {
  return { x: 0, y: 0, lookX: 0, lookY: 0, centerY: 0, ready: false };
}

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @param cam    Kamera (wird verändert)
 * @param px,py  Spielerposition (linke obere Ecke der Hitbox), bereits interpoliert
 * @param p      Spieler (für Blickrichtung/Tempo)
 * @param map    Karte (für die Grenzen)
 * @param dt     Bildzeit in Sekunden
 */
export function updateCamera(cam, px, py, p, map, dt) {
  const cx = px + PLAYER_W / 2;
  const cy = py + PLAYER_H / 2;

  const speedFactor = Math.min(1, Math.abs(p.vx) / LOOK_AHEAD_SPEED);
  const targetLook = p.facing * LOOK_AHEAD_PX * speedFactor;
  cam.lookX += (targetLook - cam.lookX) * ease(LOOK_RATE, dt);

  // Senkrecht: Die Bildmitte bleibt stehen, solange die Figur in der Totzone ist; verlässt sie sie, wird die Mitte
  // mitgeschoben. Der Blick nach unten beim Fallen wird geglättet statt sofort gesetzt — er endete sonst bei jeder Landung
  // mit einem Ruck.
  if (!cam.ready) { cam.centerY = cy; cam.lookY = 0; }
  if (cy < cam.centerY - DEAD_ZONE_Y) cam.centerY = cy + DEAD_ZONE_Y;
  else if (cy > cam.centerY + DEAD_ZONE_Y) cam.centerY = cy - DEAD_ZONE_Y;
  if (p.onGround) cam.centerY += (cy - cam.centerY) * ease(RECENTER_RATE, dt);
  cam.lookY += (Math.max(0, p.vy) * FALL_LOOK - cam.lookY) * ease(LOOK_RATE, dt);

  let tx = cx + cam.lookX - VIEW_W / 2;
  let ty = cam.centerY + cam.lookY - VIEW_H / 2;

  const maxX = map.w * TILE - VIEW_W;
  const maxY = map.h * TILE - VIEW_H;
  tx = maxX <= 0 ? maxX / 2 : Math.min(maxX, Math.max(0, tx));
  ty = maxY <= 0 ? maxY / 2 : Math.min(maxY, Math.max(0, ty));

  // Beim Respawn/Warp springt die Zielposition weit — dann nicht quer durch die Karte fahren.
  if (!cam.ready || Math.abs(tx - cam.x) > SNAP_DISTANCE || Math.abs(ty - cam.y) > SNAP_DISTANCE) {
    // (nach einem Respawn/Warp steht die Figur wieder mittig)
    cam.centerY = cy;
    cam.lookY = 0;
    ty = cy - VIEW_H / 2;
    ty = maxY <= 0 ? maxY / 2 : Math.min(maxY, Math.max(0, ty));
    cam.x = tx;
    cam.y = ty;
    cam.lookX = 0;
    cam.ready = true;
    return;
  }
  const k = ease(FOLLOW_RATE, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}
