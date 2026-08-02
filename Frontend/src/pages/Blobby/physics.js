// Spiegel der Server-Physik aus Backend/routes/blobbyRoutes.js.
//
// Der Server bleibt die einzige Wahrheit — diese Kopie dient nur der Vorhersage im Client:
// Der eigene Blob soll ohne Wartezeit auf die Tastatur reagieren, und Ball wie Gegner werden
// um die gemessene Netzlaufzeit vorausgerechnet, damit alles zusammen den Stand von JETZT
// zeigt statt den von vor 50 ms. Jeder Schnappschuss zieht die Vorhersage wieder gerade.
//
// Die Ball-Blob-Kollision wird hier bewusst MITgerechnet: ohne sie fliegt der Ball lokal
// erst durch den Blob hindurch und springt zwei Frames später zurück — genau das fühlt
// sich wie eine falsche Hitbox an. Gezählt wird die Berührung trotzdem nur serverseitig.
//
// Maßstab und Tempofaktor der Blobs (Powerups) kommen fertig aus dem Schnappschuss, die
// Wirkdauer muss der Client also nicht nachrechnen.
// Wer hier etwas ändert, muss es im Backend mitändern.

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

export const BLOBBY_SPEED = 4.5;
const BLOBBY_JUMP_ACCELERATION = 15.1;
const BLOBBY_JUMP_BUFFER = 0.44;
const GRAVITATION = 0.88;
const BALL_GRAVITATION = 0.287;
const BALL_COLLISION_VELOCITY = 13.125;

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

// ── Der Blob als EIN Körper ─────────────────────────────────────────────────
// Kollidiert wird gegen die konvexe Hülle der beiden Kugeln (abgerundeter Kegel), nicht
// gegen jede einzeln: An den Schnittpunkten der Kreise hätte die Vereinigung eine
// einspringende Kante, und eine Auflösung gegen den Kopf setzt den Ball dort zwangsläufig
// in die untere Kugel — er rutscht sichtbar durch. Konvex kann das nicht passieren.
// Der gezeichnete Blob nutzt exakt dieselbe Form (siehe render.js).
export function blobShape(b, scale) {
  return {
    ax: b.x, ay: b.y - BLOBBY_UPPER_SPHERE * scale, ar: BLOBBY_UPPER_RADIUS * scale,
    bx: b.x, by: b.y + BLOBBY_LOWER_SPHERE * scale, br: BLOBBY_LOWER_RADIUS * scale,
  };
}

// Vorzeichenbehafteter Abstand zur um `pad` aufgeblasenen Hülle plus Außennormale.
export function blobDistance(px, py, s, pad) {
  const R1 = s.ar + pad;
  const R2 = s.br + pad;
  let ux = s.bx - s.ax;
  let uy = s.by - s.ay;
  const L = Math.hypot(ux, uy) || 1e-6;
  ux /= L; uy /= L;
  const sinA = (R2 - R1) / L;
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));

  const rx = px - s.ax;
  const ry = py - s.ay;
  const along = rx * ux + ry * uy;
  const side = rx * -uy + ry * ux;
  const reach = Math.abs(side) * sinA + along * cosA;

  if (reach <= 0) {
    const d = Math.hypot(rx, ry) || 1e-6;
    return { d: d - R1, nx: rx / d, ny: ry / d };
  }
  if (reach >= L * cosA) {
    const qx = px - s.bx, qy = py - s.by;
    const d = Math.hypot(qx, qy) || 1e-6;
    return { d: d - R2, nx: qx / d, ny: qy / d };
  }
  const sg = side < 0 ? -1 : 1;
  const ex = -uy * sg, ey = ux * sg;
  return {
    d: Math.abs(side) * cosA - along * sinA - R1,
    nx: ex * cosA - ux * sinA,
    ny: ey * cosA - uy * sinA,
  };
}

// Erste Berührung der Ballstrecke mit der Hülle (Kegelverfolgung, siehe Backend).
export function sweepBlob(px, py, vx, vy, s, pad) {
  let probe = blobDistance(px, py, s, pad);
  if (probe.d <= 0) return { t: 0, d: probe.d, nx: probe.nx, ny: probe.ny };
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return null;
  let t = 0;
  for (let i = 0; i < 32; i++) {
    t += probe.d / len;
    if (t > 1) return null;
    probe = blobDistance(px + vx * t, py + vy * t, s, pad);
    if (probe.d <= 0.02) return { t, d: probe.d, nx: probe.nx, ny: probe.ny };
  }
  return null;
}

// Gibt zurück, ob der Ball in diesem Frame am Blob angelegen hat. `touching` ist der
// Zustand aus dem letzten Frame und wird zurückgegeben, damit der Aufrufer ihn merkt.
// `prev` ist der Startpunkt der Flugstrecke und wird bei einem Treffer auf den
// Abprallpunkt gesetzt — der nächste Blob prüft dann gegen die neue Strecke.
export function ballBlobCollision(ball, prev, b, scale, touching) {
  const shape = blobShape(b, scale);
  const hit = sweepBlob(prev.x, prev.y, ball.x - prev.x, ball.y - prev.y, shape, BALL_RADIUS);
  const here = blobDistance(ball.x, ball.y, shape, BALL_RADIUS);
  const blocked = touching && here.d <= 0.01;

  if (hit && !blocked) {
    const cx = prev.x + (ball.x - prev.x) * hit.t - hit.d * hit.nx;
    const cy = prev.y + (ball.y - prev.y) * hit.t - hit.d * hit.ny;
    ball.x = cx;
    ball.y = cy;
    prev.x = cx;
    prev.y = cy;
    ball.vx = hit.nx * BALL_COLLISION_VELOCITY;
    ball.vy = hit.ny * BALL_COLLISION_VELOCITY;
    ball.x += ball.vx;
    ball.y += ball.vy;
    return false;   // liegt nach dem Stoß weit draußen — Sperre sofort wieder frei
  }

  if (here.d < 0) {
    ball.x -= here.d * here.nx;
    ball.y -= here.d * here.ny;
    return true;
  }
  return here.d <= 0.01;
}

export const inputFromMask = (m) => ({
  left: !!(m & 1),
  right: !!(m & 2),
  jump: !!(m & 4),
});
