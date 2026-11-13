// scene/avatars.js — die Mitspieler am Tisch: schwebende Blobs. Farbe, Hut und Gesicht kommen aus dem Skin
// (skins.js: im Menü gestaltet, Bots zufällig).
//
// Was man an der Figur sieht:
//   am Zug        lehnt sich vor, darüber hüpft ein Pfeil
//   letzte Karte  zittert
//   im Visier     roter Ring kreist um die Figur, sie reißt die Augen auf (setTargeted)
//   Dornenschild  grüne Stachelkugel um die Figur
//   eingefroren   Eisblock mit weißen Kanten, die Figur steht still
//   weggeweht     fliegt davon und bleibt weg, bis sie wieder dran ist (setAway)
//   Sieger        hüpft und trägt eine Krone
//   Team          Reif in der Teamfarbe unter der Figur (2 gegen 2)
import * as THREE from 'three';
import { SKIN_COLORS, normalizeSkin } from '../skins.js';

const hdr = (color, boost, extra = {}) => {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.color.multiplyScalar(boost);
  m.toneMapped = false;
  return m;
};
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

// ── Hüte (Index wie skins.SKIN_HATS). Liefert die Gruppe und optional eine Funktion für Bewegung. ──
function buildHat(kind) {
  const g = new THREE.Group();
  const dark = std('#221f2b');
  let tick = null;
  if (kind === 1) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 12), std('#5b3fd0'));
    cone.position.y = 0.3;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), std('#3d2a94'));
    g.add(cone, brim);
  } else if (kind === 2) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), dark);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.42, 16), dark);
    top.position.y = 0.21;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 16), std('#d8343f'));
    band.position.y = 0.08;
    g.add(brim, top, band);
  } else if (kind === 3) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), dark);
    stick.position.y = 0.2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hdr('#ff5a5a', 1.8));
    ball.position.y = 0.46;
    g.add(stick, ball);
    tick = (t) => {
      stick.rotation.z = Math.sin(t * 3) * 0.15;
      ball.position.x = -Math.sin(t * 3) * 0.07;
    };
  } else if (kind === 4) {
    for (const x of [-0.22, 0.22]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 8), std('#f4eedf'));
      horn.position.set(x, 0.1, 0);
      horn.rotation.z = -x * 1.4;
      g.add(horn);
    }
  } else if (kind === 5) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#2f6fd6'));
    cap.position.y = -0.08;
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16, 1, false, -0.9, 1.8), std('#1d4a96'));
    peak.position.set(0, -0.04, 0.3);
    g.add(cap, peak);
  } else if (kind === 6) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#e7453c'));
    cap.position.y = -0.06;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), dark);
    pin.position.y = 0.3;
    const rotor = new THREE.Group();
    for (const r of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.09), std('#ffd23f'));
      blade.rotation.y = r;
      rotor.add(blade);
    }
    rotor.position.y = 0.38;
    g.add(cap, pin, rotor);
    tick = (t) => {
      rotor.rotation.y = t * 14;
    };
  } else if (kind === 7) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), std('#3dbb4f'));
    stem.position.y = 0.12;
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), std('#ffd23f'));
    mid.position.y = 0.3;
    g.add(stem, mid);
    for (let i = 0; i < 6; i += 1) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std('#ff7ab8'));
      petal.position.set(Math.sin((i / 6) * Math.PI * 2) * 0.14, 0.3, Math.cos((i / 6) * Math.PI * 2) * 0.14);
      petal.scale.y = 0.5;
      g.add(petal);
    }
    tick = (t) => {
      g.rotation.z = Math.sin(t * 1.8) * 0.1;
    };
  } else if (kind === 8) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), hdr('#ffe98a', 2));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.3;
    g.add(halo);
    tick = (t) => {
      halo.position.y = 0.3 + Math.sin(t * 2) * 0.04;
    };
  } else if (kind === 9) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#d8343f'));
    cap.scale.y = 0.7;
    cap.position.y = -0.04;
    g.add(cap);
    for (const [x, y, z] of [[0, 0.27, 0], [0.22, 0.14, 0.14], [-0.2, 0.15, 0.16], [0.05, 0.16, -0.26], [-0.24, 0.12, -0.12]]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#ffffff'));
      dot.position.set(x, y, z);
      dot.scale.y = 0.4;
      g.add(dot);
    }
  }
  return { group: g, tick };
}

// ── Gesichter (Index wie skins.SKIN_FACES). Liefert die Augen-Gruppe und wie weit die Augen offen stehen. ──
function buildFace(kind) {
  const eyes = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#14121a' });
  const eye = (x, size = 1) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.115 * size, 12, 10), white);
    e.position.set(x, 0, 0.36);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.058 * size, 10, 8), black);
    p.position.set(x, -0.01, 0.36 + 0.095 * size);
    eyes.add(e, p);
  };
  const extra = new THREE.Group(); // blinzelt nicht mit
  if (kind === 4) eye(0, 1.7);
  else {
    eye(-0.16);
    eye(0.16);
  }
  if (kind === 1) {
    for (const x of [-0.16, 0.16]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 20), black);
      rim.position.set(x, 0, 0.42);
      extra.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.022), black);
    bridge.position.set(0, 0.02, 0.44);
    extra.add(bridge);
  } else if (kind === 3) {
    for (const x of [-0.16, 0.16]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), black);
      brow.position.set(x, 0.13, 0.43);
      brow.rotation.z = x > 0 ? 0.45 : -0.45;
      extra.add(brow);
    }
  } else if (kind === 5) {
    for (const x of [-0.1, 0.1]) {
      const half = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 4, 8), black);
      half.position.set(x, -0.2, 0.42);
      half.rotation.z = Math.PI / 2 + (x > 0 ? -0.3 : 0.3);
      extra.add(half);
    }
  }
  return { eyes, extra, open: kind === 2 ? 0.42 : 1 };
}

/**
 * @param {number} seat    Platz am Tisch
 * @param {object} [skin]  { c, h, f } aus skins.js — fehlt er, kommt das Aussehen des Platzes
 * @param {string|null} [team]  Teamfarbe (2 gegen 2): Reif unter der Figur
 */
export function createAvatar(seat, skin, team = null) {
  const look = normalizeSkin(skin, seat);
  const color = new THREE.Color(SKIN_COLORS[look.c].hex);
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const headMat = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.22), roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.62, 4, 14), bodyMat);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 22, 16), headMat);
  head.position.y = 1.78;
  inner.add(body, head);

  const face = buildFace(look.f);
  face.eyes.position.y = 1.84;
  face.extra.position.y = 1.84;
  inner.add(face.eyes, face.extra);

  for (const x of [-0.5, 0.5]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), headMat);
    hand.position.set(x, 0.98, 0.5);
    inner.add(hand);
  }

  const hat = buildHat(look.h);
  hat.group.position.y = 2.16;
  inner.add(hat.group);

  // Krone für den Sieger
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3f', roughness: 0.3, metalness: 0.6 });
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.16, 12, 1, true), gold));
  for (let i = 0; i < 6; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), gold);
    spike.position.set(Math.sin((i / 6) * Math.PI * 2) * 0.28, 0.17, Math.cos((i / 6) * Math.PI * 2) * 0.28);
    crown.add(spike);
  }
  crown.position.y = 2.24;
  crown.visible = false;
  inner.add(crown);
  inner.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // Team: Reif unter der Figur
  if (team) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 32), hdr(team, 1.5));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.16;
    inner.add(band);
  }

  // Hier hängt der Kartenfächer (tableScene.js füllt ihn)
  const fan = new THREE.Group();
  fan.position.set(0, 1.02, 0.72);
  inner.add(fan);

  // Am Zug: Pfeil über dem Kopf (bleibt am Platz, auch wenn die Figur hüpft)
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 4), hdr('#f4eedf', 1.9));
  arrow.rotation.x = Math.PI;
  arrow.visible = false;
  group.add(arrow);

  // Im Visier: zwei gekreuzte rote Ringe kreisen um die Figur
  const target = new THREE.Group();
  const targetMat = hdr('#ff3b30', 2.2);
  for (const tilt of [0.5, -0.5]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 40), targetMat);
    ring.rotation.set(Math.PI / 2 + tilt, 0, 0);
    target.add(ring);
  }
  target.position.y = 1.25;
  target.scale.setScalar(0.001);
  group.add(target);

  // Dornenschild: Kugel mit Stachelgitter und Stacheln
  const shield = new THREE.Group();
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.2, depthWrite: false });
  shield.add(new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), bubbleMat));
  const thorns = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), hdr('#9dffb0', 1.05, { wireframe: true, transparent: true, opacity: 0.55 }));
  shield.add(thorns);
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.42, 5);
  const spikeMat = hdr('#7dff9a', 1.25);
  for (let i = 0; i < 14; i += 1) {
    const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - (2 * (i + 0.5)) / 14), i * 2.4);
    const s = new THREE.Mesh(spikeGeo, spikeMat);
    s.position.copy(dir).multiplyScalar(1.45);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shield.add(s);
  }
  shield.position.y = 1.2;
  shield.scale.setScalar(0.001);
  group.add(shield);

  // Eisblock mit hellen Kanten
  const iceGeo = new THREE.BoxGeometry(1.8, 3, 1.8);
  const ice = new THREE.Mesh(
    iceGeo,
    new THREE.MeshStandardMaterial({ color: '#9fdcff', transparent: true, opacity: 0.62, roughness: 0.1, metalness: 0.15, flatShading: true, depthWrite: false }),
  );
  ice.add(new THREE.LineSegments(new THREE.EdgesGeometry(iceGeo), new THREE.LineBasicMaterial({ color: '#ffffff' })));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 5), hdr('#dff4ff', 1.5));
  cap.position.y = 1.9;
  ice.add(cap);
  ice.position.y = 1.25;
  ice.rotation.y = 0.5;
  ice.scale.setScalar(0.001);
  group.add(ice);

  const phase = seat * 1.7;
  const st = { active: false, nervous: false, hit: 0, cheer: false, hop: 0, lean: 0, shield: false, frozen: false, away: false, gone: 0, targeted: false };

  return {
    group,
    fan,
    color: `#${color.getHexString()}`,
    baseY: -0.62,
    bodyY: 1.3,
    get away() { return st.away; },
    setActive(v) { st.active = v; },
    setNervous(v) { st.nervous = v; },
    setCheer(v) { st.cheer = v; crown.visible = v; hat.group.visible = !v; },
    setShield(v) { st.shield = v; },
    setFrozen(v) { st.frozen = v; },
    /** Im Visier eines Effekts: Ringe kreisen, die Figur erschrickt. */
    setTargeted(v) {
      st.targeted = v;
      if (v) st.hit = 1;
    },
    /** Vom Sturm weggeweht: fliegt davon und bleibt weg, bis setAway(false) sie zurückholt. now: ohne Flug. */
    setAway(v, now = false) {
      st.away = v;
      if (now) st.gone = v ? 1 : 0;
    },
    hit() { st.hit = 1; },
    hop() { st.hop = 1; },
    /** Punkt über dem Platz (Weltkoordinaten) für das Namensschild — bleibt stehen, auch wenn die Figur weg ist. */
    plateWorld(out) {
      group.getWorldPosition(out);
      out.y += 2.62;
      return out;
    },
    /** Hand der Figur (Weltkoordinaten): von hier streckt sich der Zeige-Arm. */
    handWorld(out) {
      group.localToWorld(out.set(0.5, 1.0 + inner.position.y, 0.5));
      return out;
    },
    update(time, dt) {
      const k = 1 - Math.exp(-dt * 8);
      shield.scale.setScalar(Math.max(0.001, shield.scale.x + ((st.shield && st.gone < 0.5 ? 1 : 0) - shield.scale.x) * k));
      shield.visible = shield.scale.x > 0.01;
      thorns.rotation.y = time * 0.5;
      thorns.rotation.x = time * 0.3;
      shield.rotation.y = time * 0.25;
      bubbleMat.opacity = 0.18 + Math.sin(time * 3) * 0.04;
      ice.scale.setScalar(Math.max(0.001, ice.scale.x + ((st.frozen && st.gone < 0.5 ? 1 : 0) - ice.scale.x) * k));
      ice.visible = ice.scale.x > 0.01;
      target.scale.setScalar(Math.max(0.001, target.scale.x + ((st.targeted ? 1 : 0) - target.scale.x) * (1 - Math.exp(-dt * 14))));
      target.visible = target.scale.x > 0.01;
      target.rotation.y = time * 5;

      const t = st.frozen ? phase : time; // eingefroren: steht still
      st.lean += ((st.active ? 0.24 : st.targeted ? -0.3 : 0) - st.lean) * k;
      let y = Math.sin(t * 1.6 + phase) * 0.05;
      let x = 0;
      let z = 0;
      let ry = 0;
      let rz = st.nervous || st.targeted ? Math.sin(t * 34) * 0.035 : 0;
      if (st.hit > 0) {
        st.hit = Math.max(0, st.hit - dt * (st.targeted ? 0.4 : 1.8));
        x += Math.sin(time * 55) * 0.13 * st.hit;
      }
      if (st.hop > 0) {
        st.hop = Math.max(0, st.hop - dt * 2.2);
        y += Math.sin((1 - st.hop) * Math.PI) * 0.4;
      }
      // Weggeweht: hinaus und nach oben, trudelnd; zurück geht es schneller
      st.gone = Math.max(0, Math.min(1, st.gone + (st.away ? dt / 1.1 : -dt / 0.7)));
      if (st.gone > 0) {
        const g = st.gone * st.gone;
        y += g * 11;
        z -= g * 9;
        ry = st.gone * Math.PI * 7;
        rz += Math.sin(st.gone * Math.PI) * 0.8;
      }
      inner.visible = st.gone < 0.995;
      if (st.cheer) y += Math.abs(Math.sin(time * 6 + phase)) * 0.55;
      inner.position.set(x, y, z);
      inner.rotation.set(st.lean, ry, rz);
      hat.tick?.(time);
      // getroffen oder im Visier: Augen weit auf; sonst ab und zu blinzeln
      const wide = 1 + st.hit * 0.45;
      face.eyes.scale.set(wide, wide * face.open, wide);
      if (st.hit <= 0 && (t + phase) % 3.7 < 0.12) face.eyes.scale.y = 0.12;

      arrow.visible = st.active && st.gone < 0.5;
      arrow.position.y = 3.6 + Math.abs(Math.sin(time * 4)) * 0.28;
      arrow.rotation.y = time * 2;
    },
  };
}
