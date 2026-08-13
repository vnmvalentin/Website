// Spiegel der Server-Physik aus Backend/routes/blobbyRoutes.js.
//
// Der Server bleibt die einzige Wahrheit. Gespiegelt wird nur noch, was der Client für den
// EIGENEN Blob braucht: Der soll ohne Wartezeit auf die Tastatur reagieren, also läuft er
// lokal mit und wird von jedem Schnappschuss wieder geradegezogen.
//
// Was hier NICHT mehr steht, ist die Ball-Blob-Kollision — der Ball ist ein entferntes
// Objekt und wird zusammen mit den Gegnern aus den Schnappschüssen abgelesen (siehe unten
// und den Kopf von BlobbyRoom.jsx). `stepBallFree` bleibt trotzdem: damit füllt der Client
// eine Paketlücke ballistisch auf, statt den Ball in der Luft anzuhalten.
//
// Maßstab und Tempofaktor der Blobs (Powerups) kommen fertig aus dem Schnappschuss, die
// Wirkdauer muss der Client also nicht nachrechnen.
// Wer an den hier gespiegelten Werten etwas ändert, muss es im Backend mitändern.

export const WORLD_H = 600;
export const GROUND_Y = 500;
export const FIELD_W = { "1v1": 800, "2v2": 1200 };

export const BLOBBY_HEIGHT = 89;
export const BLOBBY_HALF_H = BLOBBY_HEIGHT / 2;
export const BLOBBY_UPPER_SPHERE = 19;
export const BLOBBY_UPPER_RADIUS = 25;
export const BLOBBY_LOWER_SPHERE = 13;
export const BLOBBY_LOWER_RADIUS = 33;

export const BALL_RADIUS = 31.5;

export const NET_RADIUS = 14;
export const NET_BASE_TOP = 284;
const NET_DAMPING = 0.85;

export const POWERUP_TYPES = ["speed", "grow", "shrink", "netHigh", "netLow"];
export const POWERUP_RADIUS = 21;

// Aufschlagball: Höhe und Versatz Richtung Netz. Genau über dem Kopf fliegt er beim
// Sprung nur senkrecht hoch. Siehe Backend, dort stehen die Messungen.
export const SERVE_BALL_HEIGHT = 220;
export const SERVE_BALL_OFFSET = 25;

export const BLOBBY_SPEED = 4.5;
const BLOBBY_JUMP_ACCELERATION = 15.1;
const BLOBBY_JUMP_BUFFER = 0.44;
const GRAVITATION = 0.88;
const BALL_GRAVITATION = 0.287;
// BALL_COLLISION_VELOCITY steht bewusst NICHT mehr hier: Der Abpraller wird nur noch im
// Server gerechnet, und dort geht seit BLOB_MOMENTUM_TRANSFER auch die Anfahrgeschwindigkeit
// des Blobs ein. Eine Kopie hier wäre eine stille Falschaussage.

export const TICK_HZ = 75;
export const TICK_MS = 1000 / TICK_HZ;

export const teamOf = (slot) => (slot % 2 === 1 ? 1 : 2);
export const groundPlaneFor = (scale) => GROUND_Y - BLOBBY_HALF_H * scale;

export function slotStartX(slot, mode) {
  const netX = FIELD_W[mode] / 2;
  const frac = mode === "2v2" ? (slot <= 2 ? 0.36 : 0.8) : 0.5;
  const dist = netX * frac;
  return teamOf(slot) === 1 ? netX - dist : netX + dist;
}

export function stepBlob(b, inp, scale = 1, speedFactor = 1) {
  const plane = groundPlaneFor(scale);
  const onSand = b.y >= plane - 0.001;
  const onGround = b.grounded || onSand;
  // Im Sand federt man wie im Original weiter, solange die Taste gehalten wird. Auf einem
  // Absatz — Pfeilerkante oder fremder Kopf — braucht es dagegen einen neuen Tastendruck:
  // sonst wird man dort sofort ein zweites Mal katapultiert, aus 216 px Höhe, und fliegt
  // weit über das Feld hinaus. Geprüft wird die Sandhöhe und nicht die Kollision, weil
  // Client und Server die Sandhöhe exakt gleich berechnen — ein von der Kollision
  // abhängiges Merkmal ließe die beiden gelegentlich uneins sein, und dann springt einer
  // und der andere nicht.
  const freshPress = inp.jump && !b.jumpWasDown;
  const mayJump = inp.jump && onGround && (onSand || freshPress);
  b.jumpWasDown = inp.jump;
  b.grounded = false;
  if (mayJump) b.vy = -BLOBBY_JUMP_ACCELERATION;
  if (inp.jump && b.vy < 0) b.vy -= BLOBBY_JUMP_BUFFER;
  const vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * BLOBBY_SPEED * speedFactor;
  b.vy += GRAVITATION;
  b.x += vx;
  b.y += b.vy;
  if (b.y > plane) { b.y = plane; b.vy = 0; b.grounded = true; }
}

export function clampToField(b, scale, width) {
  const r = BLOBBY_LOWER_RADIUS * scale;
  if (b.x < r) b.x = r;
  if (b.x > width - r) b.x = width - r;
}

export function clampToHalf(b, slot, scale, netX) {
  const r = BLOBBY_LOWER_RADIUS * scale;
  if (teamOf(slot) === 1) {
    const maxX = netX - NET_RADIUS - r;
    if (b.x > maxX) b.x = maxX;
  } else {
    const minX = netX + NET_RADIUS + r;
    if (b.x < minX) b.x = minX;
  }
}

export function blobNetCollision(b, scale, netX, netTop) {
  const halfW = BLOBBY_LOWER_RADIUS * scale;
  const halfH = BLOBBY_HALF_H * scale;
  const left = netX - NET_RADIUS;
  const right = netX + NET_RADIUS;

  if (b.x + halfW <= left || b.x - halfW >= right) return;
  if (b.y + halfH <= netTop) return;

  const pushLeft = (b.x + halfW) - left;
  const pushRight = right - (b.x - halfW);
  const pushUp = (b.y + halfH) - netTop;
  const pushX = pushLeft < pushRight ? -pushLeft : pushRight;

  if (pushUp <= Math.abs(pushX)) {
    b.y -= pushUp;
    // Nur wer fällt, landet — sonst gäbe die gehaltene Sprungtaste beim Streifen der
    // Kante mitten im Aufstieg einen zweiten vollen Impuls.
    if (b.vy >= 0) { b.vy = 0; b.grounded = true; }
  } else {
    b.x += pushX;
  }
}

export function blobBlobCollision(a, sa, b, sb) {
  const halfW = BLOBBY_LOWER_RADIUS * sa + BLOBBY_LOWER_RADIUS * sb;
  const halfH = BLOBBY_HALF_H * sa + BLOBBY_HALF_H * sb;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ox = halfW - Math.abs(dx);
  const oy = halfH - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return;

  if (oy < ox) {
    const upper = dy < 0 ? b : a;
    upper.y -= oy;
    if (upper.vy >= 0) { upper.vy = 0; upper.grounded = true; }
  } else {
    const push = ox / 2;
    if (dx < 0) { b.x -= push; a.x += push; }
    else { b.x += push; a.x -= push; }
  }
}

export function integrateBall(ball) {
  ball.vy += BALL_GRAVITATION;
  ball.x += ball.vx;
  ball.y += ball.vy;
}

// Pfeiler, Seitenwände, Boden — läuft im Server nach der Blob-Kollision, hier genauso
export function ballWorldCollision(ball, width, netX, netTop) {
  const dx = ball.x - netX;
  const dy = ball.y - netTop;
  const d = Math.hypot(dx, dy);
  if (d < BALL_RADIUS + NET_RADIUS) {
    const nx = d < 1e-6 ? 0 : dx / d;
    const ny = d < 1e-6 ? -1 : dy / d;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx = (ball.vx - 2 * dot * nx) * NET_DAMPING;
      ball.vy = (ball.vy - 2 * dot * ny) * NET_DAMPING;
    }
    ball.x = netX + nx * (BALL_RADIUS + NET_RADIUS);
    ball.y = netTop + ny * (BALL_RADIUS + NET_RADIUS);
  } else if (ball.y > netTop) {
    if (ball.x < netX && ball.x + BALL_RADIUS > netX - NET_RADIUS) {
      ball.x = netX - NET_RADIUS - BALL_RADIUS;
      if (ball.vx > 0) ball.vx = -ball.vx;
    } else if (ball.x >= netX && ball.x - BALL_RADIUS < netX + NET_RADIUS) {
      ball.x = netX + NET_RADIUS + BALL_RADIUS;
      if (ball.vx < 0) ball.vx = -ball.vx;
    }
  }

  if (ball.x - BALL_RADIUS < 0 && ball.vx < 0) {
    ball.vx = -ball.vx;
    ball.x = BALL_RADIUS;
  } else if (ball.x + BALL_RADIUS > width && ball.vx > 0) {
    ball.vx = -ball.vx;
    ball.x = width - BALL_RADIUS;
  }

  if (ball.y + BALL_RADIUS >= GROUND_Y) {
    ball.y = GROUND_Y - BALL_RADIUS;
    ball.vx = 0;
    ball.vy = 0;
  }
}

// Ball ohne Blob-Kollision, ein kompletter Frame
export function stepBallFree(ball, width, netX, netTop) {
  integrateBall(ball);
  ballWorldCollision(ball, width, netX, netTop);
}

// Ball-gegen-Blob wird im Client NICHT mehr gerechnet.
//
// Bis zur Netzcode-Umstellung lag hier eine Kopie der Server-Kollision (blobShape,
// blobDistance, sweepBlob, ballBlobCollision), damit der eigene Abpraller sofort sichtbar
// war. Der Ball ist inzwischen ein rein entferntes Objekt: er wird zusammen mit den
// Gegnern aus den Schnappschüssen an einer gemeinsamen Uhr abgelesen (BlobbyRoom.jsx).
//
// Die Kopie wurde entfernt statt liegengelassen, weil sie inzwischen FALSCH wäre — der
// Server rechnet die Anfahrgeschwindigkeit des Blobs mit in den Abpraller (siehe
// BLOB_MOMENTUM_TRANSFER in blobbyRoutes.js), diese Fassung tat das nicht. Eine stille
// Abweichung an genau der Stelle, an der beide Seiten übereinstimmen müssten, ist
// gefährlicher als gar kein Code. Wer die Vorhersage je wiederbeleben will, holt sich die
// aktuelle Fassung aus dem Backend.
