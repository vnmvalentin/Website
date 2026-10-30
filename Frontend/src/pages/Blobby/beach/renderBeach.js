// Beach 3D — Darstellung des Feldes.
//
// Zeichnet nur, was beach/sim.js ausgerechnet hat (über BeachGame.jsx, interpoliert).
// Koordinaten 1:1 wie in der Simulation: x entlang des Feldes, z quer, y nach oben.
// Die Bausteine (Strand, Palmen, Blob-Form, Ball) teilt sich die Datei mit der
// 3D-Seitenansicht des klassischen Modus (../render3d.js).
import * as THREE from "three";
import {
  skyTexture, sandTexture, seaTexture, netTexture, shadowTexture, ballTexture,
  labelTexture, blobGeometry, makePalm, canvasTexture, powerupTexture,
} from "../render3d";
import { SLOT_COLOR } from "../render";
import {
  COURTS, NET_TOP, NET_RADIUS, BALL_RADIUS, UPPER_SPHERE, UPPER_RADIUS, LOWER_RADIUS, teamOf, POWERUP_TYPES,
} from "./sim";

const TAU = Math.PI * 2;

// Landepunkt: Ring mit Punkt in der Mitte. Bewusst kräftig — er ist DIE Hilfe, um in 3D
// die Entfernung zum Ball abzuschätzen.
function ringTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.strokeStyle = "rgba(255, 255, 255, 0.95)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(w / 2, h / 2, 52, 0, TAU);
    g.stroke();
    g.fillStyle = "rgba(255, 255, 255, 0.9)";
    g.beginPath();
    g.arc(w / 2, h / 2, 9, 0, TAU);
    g.fill();
  }, { srgb: false });
}

export function createBeach3D(canvas, { mode }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const court = COURTS[mode] || COURTS["1v1"];
  const { L, W } = court;
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };

  const scene = new THREE.Scene();
  scene.background = own(skyTexture());
  scene.fog = new THREE.Fog(0xbfe0ea, 2400, 7500);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 10, 16000);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0xd8b078, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-700, 1500, 900);
  scene.add(sun);

  // ── Kulisse ───────────────────────────────────────────────────────────────
  const sand = new THREE.Mesh(
    own(new THREE.PlaneGeometry(12000, 9000)),
    own(new THREE.MeshLambertMaterial({ map: own(sandTexture()) })),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.z = 1500;
  scene.add(sand);

  // Meer an einer Längsseite — vom eigenen Platz aus liegt es seitlich
  const sea = new THREE.Mesh(
    own(new THREE.PlaneGeometry(16000, 7000)),
    own(new THREE.MeshLambertMaterial({ map: own(seaTexture()), color: 0xbfe9ff })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 1, -W - 1100 - 3500);
  scene.add(sea);
  const foam = new THREE.Mesh(
    own(new THREE.PlaneGeometry(16000, 60)),
    own(new THREE.MeshBasicMaterial({ color: 0xeefcff })),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 1.5, -W - 1100);
  scene.add(foam);

  const palmMats = {
    trunk: own(new THREE.MeshLambertMaterial({ color: 0x6d4a2f })),
    leaf: own(new THREE.MeshLambertMaterial({ color: 0x2f9155 })),
    leafDark: own(new THREE.MeshLambertMaterial({ color: 0x1f6b41 })),
  };
  const palms = [
    [-L - 380, -W - 300, 340, 1, 0.3], [L + 400, -W - 340, 320, -1, 2.0],
    [-L * 0.3, -W - 650, 300, -1, 1.1], [L * 0.4, -W - 700, 360, 1, -0.6],
    [-L - 420, W + 380, 360, 1, -0.8], [L + 440, W + 360, 330, -1, 0.9],
    [0, W + 900, 380, 1, 2.6], [-L - 900, 0, 300, -1, 0.2], [L + 900, 80, 320, 1, 1.4],
  ];
  for (const [x, z, h, lean, yaw] of palms) {
    const p = makePalm(own, palmMats, h, lean, yaw);
    p.position.set(x, 0, z);
    scene.add(p);
  }

  // ── Feld ──────────────────────────────────────────────────────────────────
  const lineMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  const addLine = (w, d, x, z) => {
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d)), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.8, z);
    scene.add(m);
  };
  addLine(L * 2, 8, 0, -W);
  addLine(L * 2, 8, 0, W);
  addLine(8, W * 2, -L, 0);
  addLine(8, W * 2, L, 0);
  // Angriffslinien als Orientierung
  addLine(5, W * 2, -L / 3, 0);
  addLine(5, W * 2, L / 3, 0);

  // Bande: der Ball prallt an den Feldgrenzen ab (wie an den Wänden im Original). Niedrige
  // Bretter machen sichtbar, wo das passiert; darüber ist die Wand unsichtbar.
  const boardMat = own(new THREE.MeshLambertMaterial({ color: 0x2b7fb8 }));
  const boardH = 26;
  const addBoard = (w, d, x, z) => {
    const m = new THREE.Mesh(own(new THREE.BoxGeometry(w, boardH, d)), boardMat);
    m.position.set(x, boardH / 2, z);
    scene.add(m);
  };
  addBoard(L * 2 + 16, 8, 0, -W - 4);
  addBoard(L * 2 + 16, 8, 0, W + 4);
  addBoard(8, W * 2, -L - 4, 0);
  addBoard(8, W * 2, L + 4, 0);

  // Netz über die ganze Breite: Maschen, weißes Band oben, zwei Pfosten. Die Höhe ändert
  // sich mit den Powerups (Netz hoch/tief) — deshalb Einheitsformen, die in render()
  // auf die aktuelle Höhe gestreckt werden.
  const netTex = own(netTexture());
  const net = new THREE.Mesh(
    own(new THREE.PlaneGeometry(W * 2, 1)),
    own(new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })),
  );
  net.rotation.y = Math.PI / 2;
  scene.add(net);
  const band = new THREE.Mesh(
    own(new THREE.CylinderGeometry(NET_RADIUS * 0.7, NET_RADIUS * 0.7, W * 2, 12)),
    own(new THREE.MeshLambertMaterial({ color: 0xffffff })),
  );
  band.rotation.x = Math.PI / 2;
  scene.add(band);
  const postMat = own(new THREE.MeshStandardMaterial({ color: 0x9d9db2, roughness: 0.5 }));
  const postGeo = own(new THREE.CylinderGeometry(7, 7, 1, 12));
  const posts = [-W - 10, W + 10].map((z) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.userData.z = z;
    scene.add(post);
    return post;
  });
  let shownNetTop = -1;
  function setNetTop(top) {
    if (top === shownNetTop) return;
    shownNetTop = top;
    netTex.repeat.set((W * 2) / 24, top / 24);
    net.scale.y = top;
    net.position.set(0, top / 2, 0);
    band.position.set(0, top, 0);
    for (const p of posts) {
      p.scale.y = top + 20;
      p.position.set(0, (top + 20) / 2, p.userData.z);
    }
  }
  setNetTop(NET_TOP);

  // Powerup: schwebendes Schild über dem Netz, das immer zur Kamera schaut
  const powerupTex = Object.fromEntries(POWERUP_TYPES.map((t) => [t, own(powerupTexture(t))]));
  const powerupMat = own(new THREE.SpriteMaterial({ map: powerupTex.speed }));
  const powerup = new THREE.Sprite(powerupMat);
  powerup.scale.set(52, 52, 1);
  powerup.visible = false;
  scene.add(powerup);

  // ── Schatten, Landepunkt ──────────────────────────────────────────────────
  const shadowMat = own(new THREE.MeshBasicMaterial({ map: own(shadowTexture()), transparent: true, depthWrite: false }));
  const shadowGeo = own(new THREE.PlaneGeometry(1, 1));
  const makeShadow = () => {
    const s = new THREE.Mesh(shadowGeo, shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.renderOrder = 1;
    scene.add(s);
    return s;
  };
  const ringMat = own(new THREE.MeshBasicMaterial({
    map: own(ringTexture()), transparent: true, depthWrite: false, color: 0xfff3b0,
  }));
  const ring = new THREE.Mesh(own(new THREE.PlaneGeometry(BALL_RADIUS * 2.6, BALL_RADIUS * 2.6)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 2;
  scene.add(ring);

  // Ballanzeige am Boden: Ring GENAU UNTER dem Ball, wandert mit ihm mit (nicht schon an der
  // Landestelle — Wunsch: man soll sehen, wo der Ball gerade ist). Der Kreis drumherum ist
  // groß, solange der Ball hoch fliegt, und schließt sich mit sinkender Höhe; kurz vor dem
  // Boden liegt er auf dem Ring. Farbe wandert dabei von Hellgelb über Gelb nach Rot.
  const CLOSE_FULL_HEIGHT = 600;    // ab dieser Höhe über dem Ball-Aufsetzpunkt ist der Kreis ganz offen
  const closeMat = own(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  }));
  const closeGeo = own(new THREE.RingGeometry(0.88, 1, 64));
  const closing = new THREE.Mesh(closeGeo, closeMat);
  closing.rotation.x = -Math.PI / 2;
  closing.renderOrder = 3;
  closing.visible = false;
  scene.add(closing);
  const colWhite = new THREE.Color(0xfff6d8);
  const colYellow = new THREE.Color(0xffd23f);
  const colRed = new THREE.Color(0xff3b30);

  // ── Blobs ─────────────────────────────────────────────────────────────────
  const blobGeo = own(blobGeometry());
  const eyeGeo = own(new THREE.SphereGeometry(7.5, 16, 12));
  const pupilGeo = own(new THREE.SphereGeometry(3.8, 12, 8));
  const eyeMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
  const pupilMat = own(new THREE.MeshBasicMaterial({ color: 0x15151c }));
  const blobs = {};
  for (const slot of [1, 2, 3, 4]) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(blobGeo, own(new THREE.MeshStandardMaterial({
      color: SLOT_COLOR[slot].hex, roughness: 0.32,
    }))));
    const eyes = [-1, 1].map((side) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(UPPER_RADIUS * 0.72, UPPER_SPHERE + 2, side * 10);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      group.add(eye, pupil);
      return { eye, pupil };
    });
    group.visible = false;
    scene.add(group);
    blobs[slot] = {
      group, eyes, shadow: makeShadow(), yaw: teamOf(slot) === 1 ? 0 : Math.PI,
      label: null, labelText: "",
    };
  }

  const ball = new THREE.Mesh(
    own(new THREE.SphereGeometry(BALL_RADIUS, 32, 20)),
    own(new THREE.MeshStandardMaterial({ map: own(ballTexture()), roughness: 0.45 })),
  );
  scene.add(ball);
  const ballShadow = makeShadow();
  const spinAxis = new THREE.Vector3();
  const spinQ = new THREE.Quaternion();

  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  const cam = { pos: new THREE.Vector3(), at: new THREE.Vector3(), init: false };
  const goalPos = new THREE.Vector3();
  const goalAt = new THREE.Vector3();
  let time = 0;

  function setLabel(b, text) {
    if (b.labelText === text) return;
    b.labelText = text;
    if (b.label) {
      b.group.remove(b.label);
      b.label.material.map.dispose();
      b.label.material.dispose();
      b.label = null;
    }
    if (!text) return;
    const { tex, w, h } = labelTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(w * 0.55, h * 0.55, 1);
    sprite.position.set(0, UPPER_SPHERE + UPPER_RADIUS + 26, 0);
    sprite.renderOrder = 5;
    b.group.add(sprite);
    b.label = sprite;
  }

  /**
   * @param {{ ball, blobs, landing }} st  interpolierter Stand: ball {x,y,z,vx,vz},
   *        blobs {slot: {x,y,z}}, landing {x,z}|null
   */
  function render(st, { slots, names, mySlot, dt = 16 }) {
    time += dt;
    const k = 1 - Math.exp(-dt / 160);
    const active = new Set(slots);

    for (const slot of [1, 2, 3, 4]) {
      const b = blobs[slot];
      const src = st.blobs[slot];
      const on = active.has(slot) && !!src;
      b.group.visible = on;
      b.shadow.visible = on;
      if (!on) continue;
      b.group.position.set(src.x, src.y, src.z);
      // Größer/kleiner per Powerup — gedämpft, damit es wächst statt springt
      const sc = b.group.scale.x + ((src.s || 1) - b.group.scale.x) * Math.min(1, k * 2);
      b.group.scale.setScalar(sc);

      // Zum Ball drehen (lokal +x ist vorn), gedämpft
      const target = Math.atan2(-(st.ball.z - src.z), st.ball.x - src.x);
      let diff = target - b.yaw;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      b.yaw += diff * Math.min(1, k * 1.5);
      b.group.rotation.y = b.yaw;

      b.group.updateMatrixWorld();
      look.set(st.ball.x, st.ball.y, st.ball.z);
      b.group.worldToLocal(look);
      for (const { eye, pupil } of b.eyes) {
        tmp.copy(look).sub(eye.position).normalize().multiplyScalar(5.2);
        pupil.position.copy(eye.position).add(tmp);
      }

      const air = Math.max(0, src.y - 44.5 * sc);
      const s = Math.max(0.35, 1 - air / 420) * sc;
      b.shadow.position.set(src.x, 0.9, src.z);
      b.shadow.scale.set(LOWER_RADIUS * 2.6 * s, LOWER_RADIUS * 2.6 * s, 1);
      setLabel(b, slot === mySlot ? "" : names?.[slot] || "");
    }

    // Ball mit Rollbewegung passend zur Flugrichtung
    ball.position.set(st.ball.x, st.ball.y, st.ball.z);
    const sp = Math.hypot(st.ball.vx || 0, st.ball.vz || 0);
    if (sp > 0.05) {
      spinAxis.set(st.ball.vz, 0, -st.ball.vx).normalize();
      spinQ.setFromAxisAngle(spinAxis, (sp / BALL_RADIUS) * (dt / 13.3));
      ball.quaternion.premultiply(spinQ);
    }
    const ballAir = Math.max(0, st.ball.y - BALL_RADIUS);
    const bs = Math.max(0.3, 1 - ballAir / 900);
    ballShadow.position.set(st.ball.x, 1, st.ball.z);
    ballShadow.scale.set(BALL_RADIUS * 2.2 * bs, BALL_RADIUS * 2.2 * bs, 1);

    setNetTop(st.netTop || NET_TOP);
    if (st.powerup) {
      const tex = powerupTex[st.powerup.type] || powerupTex.speed;
      if (powerupMat.map !== tex) { powerupMat.map = tex; powerupMat.needsUpdate = true; }
      powerup.visible = true;
      powerup.position.set(st.powerup.x, st.powerup.y + Math.sin(time * 0.004) * 8, st.powerup.z);
    } else {
      powerup.visible = false;
    }

    const ballHeight = st.ball.y - BALL_RADIUS;
    if (st.rally && ballHeight > 1) {
      ring.visible = true;
      ring.position.set(st.ball.x, 1.4, st.ball.z);
      ring.scale.set(1, 1, 1);

      // Höhe 0…1 (1 = hoch oben). Der Radius schrumpft mit der Höhe — ein Blick auf den
      // Boden genügt, um zu wissen, wie viel Zeit noch bleibt.
      const left = Math.min(1, ballHeight / CLOSE_FULL_HEIGHT);
      const minR = BALL_RADIUS * 1.3;
      const r = minR + left * BALL_RADIUS * 5;
      closing.visible = true;
      closing.position.set(st.ball.x, 1.6, st.ball.z);
      closing.scale.set(r, r, 1);
      if (left > 0.5) closeMat.color.copy(colWhite).lerp(colYellow, (1 - left) * 2);
      else closeMat.color.copy(colYellow).lerp(colRed, 1 - left * 2);
      closeMat.opacity = 0.8 + (1 - left) * 0.2;
    } else {
      ring.visible = false;
      closing.visible = false;
    }

    // ── Kamera: hinter dem eigenen Blob, Blick übers Netz ──────────────────
    const me = mySlot ? st.blobs[mySlot] : null;
    if (me) {
      const fwd = teamOf(mySlot) === 1 ? 1 : -1;
      // Seitlich nur gedämpft mitgehen — sonst kippt bei jedem Schritt das ganze Bild.
      // Weit hinten und hoch, Blick leicht angehoben: Der leichte Ball fliegt bis ~650
      // hoch und soll dabei im Bild bleiben, ohne dass man den eigenen Blob verliert.
      goalPos.set(me.x - fwd * 840, 560, me.z * 0.7);
      goalAt.set(me.x + fwd * 430, 150, me.z * 0.4);
    } else {
      goalPos.set(0, 620, W + 1050);
      goalAt.set(0, 60, 0);
    }
    if (!cam.init) { cam.pos.copy(goalPos); cam.at.copy(goalAt); cam.init = true; }
    cam.pos.lerp(goalPos, k);
    cam.at.lerp(goalAt, k);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.at);

    renderer.render(scene, camera);
  }

  function setSize(cssW, cssH, dpr) {
    renderer.setPixelRatio(Math.min(2, dpr || 1));
    renderer.setSize(cssW, cssH, true);
    camera.aspect = cssW / Math.max(1, cssH);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    for (const b of Object.values(blobs)) setLabel(b, "");
    for (const d of disposables) d.dispose?.();
    renderer.dispose();
  }

  return { render, setSize, dispose };
}
