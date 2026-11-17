// scene/avatars.js — die Mitspieler am Tisch: schwebende Blobs. Farbe, Hut und Gesicht kommen aus dem Skin
// (skins.js: im Menü gestaltet, Bots zufällig).
//
// Was man an der Figur sieht:
//   am Zug        lehnt sich vor, darüber hüpft ein Pfeil
//   letzte Karte  zittert
//   im Visier     roter Ring kreist um die Figur, sie reißt die Augen auf (setTargeted)
//   Dornenschild  grüne Stachelkugel um die Figur
//   Nebel         Wolke vor den Karten — wie viele es sind, sieht man nicht
//   eingefroren   Eisblock mit weißen Kanten, die Figur steht still
//   weggeweht     fliegt davon und bleibt weg, bis sie wieder dran ist (setAway)
//   Sieger        hüpft und trägt eine Krone
//   Team          Reif in der Teamfarbe unter der Figur (2 gegen 2)
import * as THREE from 'three';
import { SKIN_COLORS, normalizeSkin } from '../skins.js';
import { createSchlauch } from './schlauch.js';

const hdr = (color, boost, extra = {}) => {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.color.multiplyScalar(boost);
  m.toneMapped = false;
  return m;
};
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

// Mittellinie eines Krakenarms (Hut 27), vom Ansatz am Kopf nach außen und unten; für alle Arme dieselbe
const ARM_LINIE = [
  [0.02, 0.03], [-0.02, 0.09], [-0.07, 0.15], [-0.125, 0.2], [-0.18, 0.235], [-0.225, 0.25], [-0.25, 0.235],
].map(([y, z]) => new THREE.Vector3(0, y, z));

// ── Hüte (Index wie skins.SKIN_HATS). Liefert die Gruppe und optional eine Funktion für Bewegung. ──
function buildHat(kind, headColor) {
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
  } else if (kind === 10) {
    // Katzenohren in Kopffarbe, innen rosa; zucken ab und zu
    const ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), std(headColor));
      outer.rotation.y = Math.PI / 4;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.19, 4), std('#ff9ec4'));
      inner.rotation.y = Math.PI / 4;
      inner.position.set(0, -0.03, 0.06);
      ear.add(outer, inner);
      ear.position.set(side * 0.25, 0.02, -0.02);
      ear.rotation.z = -side * 0.42;
      g.add(ear);
      ears.push({ ear, side });
    }
    tick = (t) => {
      for (const { ear, side } of ears) ear.rotation.z = -side * (0.42 + ((t + (side > 0 ? 1.9 : 0)) % 4.3 < 0.16 ? 0.28 : 0));
    };
  } else if (kind === 11) {
    // Partyhut: schräger Kegel mit Ringen und Bommel
    const party = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.52, 16), std('#ff5d8f'));
    cone.position.y = 0.24;
    party.add(cone);
    for (const [y, col] of [[0.1, '#ffd23f'], [0.26, '#3ddbd9']]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21 * (1 - (y + 0.02) / 0.52) + 0.012, 0.022, 6, 20), std(col));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      party.add(ring);
    }
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std('#ffd23f'));
    pom.position.y = 0.5;
    party.add(pom);
    party.rotation.z = 0.18;
    g.add(party);
  } else if (kind === 12) {
    // Pudelmütze mit Krempe und wippendem Bommel
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#3ddbd9'));
    cap.position.y = -0.18;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 24), std('#f6f4ee'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.15;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std('#f6f4ee'));
    pom.position.y = 0.27;
    g.add(cap, rim, pom);
    tick = (t) => {
      pom.position.x = Math.sin(t * 2.4) * 0.03;
    };
  } else if (kind === 13) {
    // Cowboyhut
    const brown = std('#8a5a2b');
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 28), brown);
    brim.position.y = -0.04;
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 32), brown);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = -0.03;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.32, 16), brown);
    crown.position.y = 0.13;
    crown.scale.z = 0.85;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.32, 0.06, 16), dark);
    band.position.y = 0.02;
    band.scale.z = 0.86;
    g.add(brim, edge, crown, band);
    g.rotation.x = -0.08;
  } else if (kind === 14) {
    // Kochmütze: Band und Bauschwolke
    const white = std('#f6f4ee');
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 18), white);
    band.position.y = 0.03;
    g.add(band);
    for (let i = 0; i < 5; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), white);
      puff.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.2, 0.25, Math.cos((i / 5) * Math.PI * 2) * 0.2);
      g.add(puff);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), white);
    top.position.y = 0.34;
    g.add(top);
  } else if (kind === 15) {
    // Piratenhut: Zweispitz mit Totenkopf
    const black = std('#1d1b24');
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), black);
    cap.position.y = -0.1;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 0.56, 0.34, 0, Math.PI, false);
    shape.lineTo(0.56, 0);
    const front = extrude(shape, 0.16, black);
    front.position.set(0, -0.06, 0.04);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 28, Math.PI), std('#e0b84a', { metalness: 0.4 }));
    trim.scale.y = 0.6;
    trim.position.set(0, -0.06, 0.13);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), std('#f6f4ee'));
    skull.position.set(0, 0.12, 0.13);
    g.add(cap, front, trim, skull);
    for (const x of [-0.024, 0.024]) {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), std('#14121a'));
      hole.position.set(x, 0.13, 0.19);
      g.add(hole);
    }
  } else if (kind === 16) {
    // Hasenohren, eins knickt ab; beide schwingen
    const ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 10), std('#f6f4ee'));
      outer.scale.z = 0.5;
      outer.position.y = 0.26;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 8), std('#ff9ec4'));
      inner.scale.z = 0.4;
      inner.position.set(0, 0.26, 0.03);
      ear.add(outer, inner);
      ear.position.set(side * 0.15, -0.02, 0);
      g.add(ear);
      ears.push({ ear, side });
    }
    tick = (t) => {
      for (const { ear, side } of ears) {
        ear.rotation.z = -side * 0.16 + Math.sin(t * 2 + side) * 0.06;
        ear.rotation.x = side > 0 ? -0.55 : 0;
      }
    };
  } else if (kind === 17) {
    // Wikingerhelm
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#9aa3ad', { metalness: 0.5, roughness: 0.4 }));
    helm.position.y = -0.16;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 28), std('#c9a23a', { metalness: 0.5 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.14;
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20, Math.PI), std('#c9a23a', { metalness: 0.5 }));
    ridge.rotation.y = Math.PI / 2;
    ridge.position.y = -0.16;
    g.add(helm, band, ridge);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 10), std('#f4eedf'));
      horn.position.set(side * 0.44, 0.02, 0);
      horn.rotation.z = -side * 0.95;
      g.add(horn);
    }
  } else if (kind === 18) {
    // Sombrero: breite Krempe mit hochgebogenem Rand
    const straw = std('#e7b84a');
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.03, 32), straw);
    brim.position.y = -0.03;
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 6, 40), std('#d8343f'));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.01;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.38, 16), straw);
    crown.position.y = 0.17;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), straw);
    dome.scale.y = 0.5;
    dome.position.y = 0.36;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.07, 16), std('#3dbb4f'));
    band.position.y = 0.03;
    g.add(brim, edge, crown, dome, band);
  } else if (kind === 19) {
    // Doktorhut mit schwingender Quaste
    const black = std('#1d1b24');
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.16, 18), black);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.7), black);
    board.position.y = 0.1;
    board.rotation.y = Math.PI / 4;
    const gold = std('#e0b84a', { metalness: 0.4 });
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), gold);
    button.position.y = 0.13;
    const tassel = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), gold);
    cord.position.y = -0.1;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), gold);
    tuft.position.y = -0.22;
    tassel.add(cord, tuft);
    tassel.position.set(0.44, 0.11, 0);
    g.add(cap, board, button, tassel);
    tick = (t) => {
      tassel.rotation.z = Math.sin(t * 2.6) * 0.25;
    };
  } else if (kind === 20) {
    // Kopfhörer: Bügel über den Kopf, Muscheln an den Seiten
    const phones = new THREE.Group();
    g.add(phones);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 28, Math.PI), dark);
    band.position.y = -0.38;
    phones.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 18), std('#ff5d8f'));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.46, -0.38, 0);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), dark);
      pad.rotation.z = Math.PI / 2;
      pad.position.set(side * 0.53, -0.38, 0);
      phones.add(cup, pad);
    }
    tick = (t) => {
      phones.position.y = Math.abs(Math.sin(t * 4.2)) * 0.02; // wippt im Takt
    };
  } else if (kind === 21) {
    // Einhorn-Horn mit goldener Windung
    const horn = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.44, 12), std('#fbf1ff'));
    cone.position.y = 0.22;
    horn.add(cone);
    for (const y of [0.08, 0.18, 0.28]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08 * (1 - y / 0.44) + 0.004, 0.012, 5, 16), std('#e0b84a', { metalness: 0.4 }));
      ring.rotation.x = Math.PI / 2 - 0.25;
      ring.position.y = y;
      horn.add(ring);
    }
    horn.position.set(0, -0.06, 0.2);
    horn.rotation.x = 0.45;
    g.add(horn);
  } else if (kind === 22) {
    // Frosch, der ab und zu hüpft
    const frog = new THREE.Group();
    const green = std('#5cc95a');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), green);
    body.scale.set(1.2, 0.72, 1);
    body.position.y = 0.06;
    frog.add(body);
    for (const x of [-0.1, 0.1]) {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), green);
      bump.position.set(x, 0.17, 0.08);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), std('#ffffff'));
      white.position.set(x, 0.18, 0.13);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), std('#14121a'));
      pupil.position.set(x, 0.18, 0.18);
      frog.add(bump, white, pupil);
    }
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std('#c8f0a0'));
    belly.scale.set(1.1, 0.5, 0.6);
    belly.position.set(0, 0.03, 0.14);
    frog.add(belly);
    g.add(frog);
    tick = (t) => {
      const p = t % 3.6;
      frog.position.y = p < 0.42 ? Math.sin((p / 0.42) * Math.PI) * 0.16 : 0;
    };
  } else if (kind === 23) {
    // Weihnachtsmütze mit umgeknickter Spitze
    const red = std('#d8343f');
    const white = std('#f6f4ee');
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.08, 8, 24), white);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.1;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.37, 0.3, 18), red);
    base.position.y = 0.04;
    const tip = new THREE.Group();
    const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 16), red);
    tipCone.position.y = 0.17;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), white);
    pom.position.y = 0.36;
    tip.add(tipCone, pom);
    tip.position.y = 0.18;
    g.add(rim, base, tip);
    tick = (t) => {
      tip.rotation.z = -1.0 + Math.sin(t * 2) * 0.1;
    };
  } else if (kind === 24) {
    // Schleife seitlich am Kopf
    const pink = std('#ff5d8f');
    const bow = new THREE.Group();
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), pink);
      loop.rotation.z = side * Math.PI / 2;
      loop.position.x = -side * 0.11;
      loop.scale.z = 0.5;
      bow.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std('#e0457a'));
    bow.add(knot);
    bow.position.set(0.24, -0.02, 0.14);
    bow.rotation.set(0, 0.4, -0.35);
    g.add(bow);
  } else if (kind === 25) {
    // Quietscheente, die schaukelt
    const duck = new THREE.Group();
    const yellow = std('#ffd23f');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), yellow);
    body.scale.set(1.15, 0.82, 1.1);
    body.position.y = 0.06;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), yellow);
    head.position.set(0, 0.24, 0.07);
    const beak = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std('#ff8a3d'));
    beak.scale.set(1, 0.4, 1.3);
    beak.position.set(0, 0.22, 0.19);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), yellow);
    tail.position.set(0, 0.14, -0.2);
    tail.rotation.x = -1;
    duck.add(body, head, beak, tail);
    for (const x of [-0.05, 0.05]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), std('#14121a'));
      eye.position.set(x, 0.27, 0.17);
      duck.add(eye);
    }
    g.add(duck);
    tick = (t) => {
      duck.rotation.z = Math.sin(t * 2.2) * 0.12;
    };
  } else if (kind === 26) {
    // Königskrone (Laden): Samtkappe, Hermelinrand, Goldreif mit Zacken und Steinen, Bügel mit Reichsapfel
    const gold = std('#f2c14e', { metalness: 0.45, roughness: 0.32 });
    const samt = std('#a3263a', { roughness: 0.8 });
    const fell = std('#f6f3ea', { roughness: 0.9 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), samt);
    cap.scale.y = 1.15;
    cap.position.y = 0.02;
    const hermelin = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 10, 28), fell);
    hermelin.rotation.x = Math.PI / 2;
    hermelin.position.y = -0.04;
    g.add(cap, hermelin);
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const tupf = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), dark);
      tupf.position.set(Math.sin(a) * 0.4, -0.02, Math.cos(a) * 0.4);
      g.add(tupf);
    }
    const reif = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.14, 24, 1, true), gold);
    reif.material.side = THREE.DoubleSide;
    reif.position.y = 0.08;
    g.add(reif);
    const steine = ['#d8343f', '#2f7cf6', '#2fae66', '#d8343f', '#2f7cf6', '#2fae66'];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const zacke = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), gold);
      zacke.position.set(Math.sin(a) * 0.3, 0.22, Math.cos(a) * 0.3);
      const kugel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), gold);
      kugel.position.set(Math.sin(a) * 0.3, 0.31, Math.cos(a) * 0.3);
      const stein = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), std(steine[i], { roughness: 0.2 }));
      stein.scale.z = 0.5;
      stein.position.set(Math.sin(a) * 0.325, 0.08, Math.cos(a) * 0.325);
      stein.rotation.y = a;
      g.add(zacke, kugel, stein);
    }
    for (const r of [0, Math.PI / 2]) {
      const buegel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 6, 20, Math.PI), gold);
      buegel.rotation.y = r;
      buegel.position.y = 0.12;
      buegel.scale.y = 0.9;
      g.add(buegel);
    }
    const apfel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), gold);
    apfel.position.y = 0.43;
    const kreuzH = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), gold);
    kreuzH.position.y = 0.53;
    const kreuzQ = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.025), gold);
    kreuzQ.position.y = 0.55;
    g.add(apfel, kreuzH, kreuzQ);
  } else if (kind === 27) {
    // Krake (Laden): sitzt oben auf dem Kopf, schaut nach vorn, die Arme hängen herab und wackeln
    const krake = new THREE.Group();
    const lila = std('#c25bd6');
    const hell = std('#e7a6f0');
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), lila);
    kopf.scale.set(1, 1.15, 0.95);
    kopf.position.y = 0.2;
    krake.add(kopf);
    for (const [x, y, z, r] of [[0.1, 0.36, -0.12, 0.04], [-0.13, 0.3, -0.1, 0.03], [0.16, 0.22, -0.14, 0.025], [-0.06, 0.42, -0.04, 0.025]]) {
      const fleck = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), hell);
      fleck.position.set(x, y, z);
      krake.add(fleck);
    }
    for (const x of [-0.09, 0.09]) {
      const auge = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), std('#ffffff'));
      auge.position.set(x, 0.19, 0.18);
      const pupille = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), std('#14121a'));
      pupille.position.set(x, 0.18, 0.235);
      krake.add(auge, pupille);
    }
    const arme = [];
    const armMat = std('#ffffff', { vertexColors: true });
    for (let i = 0; i < 6; i += 1) {
      const a = ((i + 0.5) / 6) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.position.set(Math.sin(a) * 0.2, 0.04, Math.cos(a) * 0.2);
      arm.rotation.y = a;
      // ein Stück (schlauch.js): nach außen und unten gebogen, zur hellen Spitze dünner, die Spitze rollt sich leicht ein
      const schlauch = createSchlauch({
        punkte: ARM_LINIE.length,
        rund: 8,
        radius: (k) => 0.062 - k * 0.034,
        farbe: (k) => (k > 0.74 ? '#e7a6f0' : '#c25bd6'),
        material: armMat,
      });
      schlauch.setze(ARM_LINIE);
      arm.add(schlauch.mesh);
      krake.add(arm);
      arme.push(arm);
    }
    g.add(krake);
    tick = (t) => {
      krake.position.y = Math.sin(t * 1.6) * 0.02;
      arme.forEach((arm, i) => { arm.rotation.x = Math.sin(t * 2.4 + i * 1.1) * 0.25; });
    };
  }
  return { group: g, tick };
}

/** Flache Form (Shape) mit Dicke, um die eigene Mitte zentriert. */
function extrude(shape, depth, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mat);
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -1);
  s.bezierCurveTo(-0.6, -0.5, -1.1, -0.1, -1, 0.35);
  s.bezierCurveTo(-0.9, 0.85, -0.25, 0.95, 0, 0.5);
  s.bezierCurveTo(0.25, 0.95, 0.9, 0.85, 1, 0.35);
  s.bezierCurveTo(1.1, -0.1, 0.6, -0.5, 0, -1);
  return s;
}

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  s.closePath();
  return s;
}

// ── Gesichter (Index wie skins.SKIN_FACES). Liefert die Augen-Gruppe und wie weit die Augen offen stehen. ──
function buildFace(kind) {
  const eyes = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#14121a' });
  const pink = new THREE.MeshBasicMaterial({ color: '#ff7aa8' });
  const catIris = new THREE.MeshBasicMaterial({ color: '#c8f05a' });
  const eye = (x, size = 1, cat = false) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.115 * size, 12, 10), cat ? catIris : white);
    e.position.set(x, 0, 0.36);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.058 * size, 10, 8), black);
    p.position.set(x, -0.01, 0.36 + 0.095 * size);
    if (cat) p.scale.set(0.38, 1.35, 0.6); // Schlitzpupille
    eyes.add(e, p);
  };
  const extra = new THREE.Group(); // blinzelt nicht mit
  /** Halbbogen: up = ∩ (fröhlich zugekniffen), sonst ∪. tilt kippt den unteren Teil an den Kopf. */
  const arc = (parent, x, y, z, r, tube, up, mat = black) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 16, Math.PI), mat);
    m.position.set(x, y, z);
    m.rotation.set(up ? -0.2 : 0.12, 0, up ? 0 : Math.PI);
    parent.add(m);
    return m;
  };
  const catMouth = (y = -0.15) => {
    arc(extra, -0.045, y, 0.435, 0.045, 0.015, false);
    arc(extra, 0.045, y, 0.435, 0.045, 0.015, false);
  };
  const smile = (r = 0.1, y = -0.15) => arc(extra, 0, y, 0.43, r, 0.018, false);
  const blush = () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#ff8fb1', transparent: true, opacity: 0.75, depthWrite: false });
    for (const x of [-0.26, 0.26]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mat);
      b.scale.set(1.2, 0.6, 0.4);
      b.position.set(x, -0.1, 0.35);
      b.rotation.y = x * 1.6;
      extra.add(b);
    }
  };
  const flat = (shape, x, size, color) => {
    const m = extrude(shape, 0.04, new THREE.MeshBasicMaterial({ color }));
    m.scale.set(size, size, 1);
    m.position.set(x, 0, 0.43);
    m.rotation.y = x * 0.9;
    eyes.add(m);
  };

  if (kind === 4) eye(0, 1.7);
  else if (kind === 6) {
    eye(-0.16, 1, true);
    eye(0.16, 1, true);
  } else if (kind === 7) {
    for (const x of [-0.15, 0.15]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), black);
      dot.position.set(x, 0, 0.4);
      eyes.add(dot);
    }
  } else if (kind === 8 || kind === 9) {
    for (const x of [-0.16, 0.16]) arc(eyes, x, kind === 8 ? 0.03 : -0.02, 0.42, 0.065, 0.02, kind === 9);
  } else if (kind === 10) {
    flat(heartShape(), -0.16, 0.11, '#ff3b6b');
    flat(heartShape(), 0.16, 0.11, '#ff3b6b');
  } else if (kind === 13) {
    flat(starShape(), -0.16, 0.13, '#ffd23f');
    flat(starShape(), 0.16, 0.13, '#ffd23f');
  } else if (kind === 14) {
    eye(-0.16, 1.15);
    eye(0.16, 1.15);
  } else {
    eye(-0.16);
    eye(0.16);
  }

  if (kind === 6) {
    // Katze: rosa Nase, Mäulchen, Schnurrhaare
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), pink);
    nose.scale.set(1.35, 0.8, 0.7);
    nose.position.set(0, -0.09, 0.43);
    extra.add(nose);
    catMouth(-0.13);
    for (const side of [-1, 1]) {
      for (const [y, tilt] of [[-0.09, 0.14], [-0.14, -0.08]]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.012), black);
        w.position.set(side * 0.29, y, 0.36);
        w.rotation.set(0, side * 0.55, side * tilt);
        extra.add(w);
      }
    }
  } else if (kind === 7) catMouth();
  else if (kind === 8) {
    catMouth(-0.13);
    blush();
  } else if (kind === 9) {
    smile(0.09);
    blush();
  } else if (kind === 10 || kind === 13) smile(0.08);
  else if (kind === 11) {
    smile(0.08, -0.14);
    const tongue = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 8), pink);
    tongue.scale.z = 0.5;
    tongue.position.set(0.02, -0.23, 0.405);
    tongue.rotation.set(0.35, 0, 0.15);
    extra.add(tongue);
  } else if (kind === 12) {
    smile(0.11, -0.13);
    const fangMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const x of [-0.065, 0.065]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 6), fangMat);
      fang.rotation.x = Math.PI;
      fang.position.set(x, -0.225, 0.42);
      extra.add(fang);
    }
  } else if (kind === 14) {
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), black);
    mouth.scale.set(0.85, 1.1, 0.4);
    mouth.position.set(0, -0.19, 0.405);
    extra.add(mouth);
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

  const hands = [];
  for (const x of [-0.5, 0.5]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), headMat);
    hand.position.set(x, 0.98, 0.5);
    inner.add(hand);
    hands.push(hand);
  }

  const hat = buildHat(look.h, headMat.color);
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

  // Nebel: Wolke aus weichen Kugeln vor dem Kartenfächer
  const fog = new THREE.Group();
  const fogMat = new THREE.MeshBasicMaterial({ color: '#d9d2ee', transparent: true, opacity: 0.9, depthWrite: false });
  const puffs = [];
  for (const [x, y, z, r] of [[-0.62, 0, 0, 0.42], [-0.2, 0.16, 0.1, 0.5], [0.26, 0.12, 0.08, 0.52], [0.66, -0.02, 0, 0.4], [0.02, -0.2, 0.16, 0.46], [-0.42, -0.18, 0.1, 0.36], [0.46, -0.2, 0.1, 0.36]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), fogMat);
    puff.position.set(x, y, z);
    puff.userData.home = puff.position.clone();
    puffs.push(puff);
    fog.add(puff);
  }
  fog.position.set(0, 1.05, 0.86);
  fog.scale.setScalar(0.001);
  inner.add(fog);

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
  const st = { active: false, nervous: false, hit: 0, cheer: false, hop: 0, lean: 0, shield: false, fog: false, frozen: false, away: false, gone: 0, targeted: false };
  // Spieleabend (Chips): nur der Körper wird dicker; was auf ihm sitzt, rückt mit nach oben
  const obenauf = [[head, head.position.y], [face.eyes, face.eyes.position.y], [face.extra, face.extra.position.y], [hat.group, hat.group.position.y], [crown, crown.position.y]];

  return {
    group,
    fan,
    /** Die beiden Hände [rechte (x −0.5), linke (x +0.5)]; Ruhelage (±0.5, 0.98, 0.5). Der Spieleabend bewegt sie für Gesten. */
    hands,
    color: `#${color.getHexString()}`,
    baseY: -0.62,
    bodyY: 1.3,
    get away() { return st.away; },
    setActive(v) { st.active = v; },
    setNervous(v) { st.nervous = v; },
    setCheer(v) { st.cheer = v; crown.visible = v; hat.group.visible = !v; },
    setShield(v) { st.shield = v; },
    setFrozen(v) { st.frozen = v; },
    setFog(v) { st.fog = v; },
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
    /**
     * Spieleabend: Körper breiter (breite, 1 = normal) und höher (hoehe); Kopf, Gesicht, Hut und Krone sitzen weiter
     * obendrauf. Gibt zurück, um wie viel der Kopf gestiegen ist (Avatar-Einheiten).
     */
    setBauch(breite = 1, hoehe = 1) {
      // richtig dick: feineres Gitter, sonst sieht man am Umriss die Kanten
      if (breite > 1.5 && !body.userData.fein) {
        body.geometry.dispose();
        body.geometry = new THREE.CapsuleGeometry(0.46, 0.62, 10, 36);
        body.userData.fein = true;
      }
      body.scale.set(breite, hoehe, breite);
      body.position.y = 0.01 + 0.77 * hoehe; // Unterkante bleibt am Boden
      const heben = 1.54 * (hoehe - 1);
      for (const [o, y] of obenauf) o.position.y = y + heben;
      return heben;
    },
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
      fog.scale.setScalar(Math.max(0.001, fog.scale.x + ((st.fog ? 1 : 0) - fog.scale.x) * k));
      fog.visible = fog.scale.x > 0.01;
      if (fog.visible) puffs.forEach((p, i) => p.position.set(p.userData.home.x + Math.sin(time * 0.7 + i * 1.3) * 0.07, p.userData.home.y + Math.sin(time * 0.9 + i) * 0.05, p.userData.home.z));
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
