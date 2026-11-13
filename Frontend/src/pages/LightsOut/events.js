// events.js — Schreckmomente, die zur jeweiligen Karte gehören. Sie erschrecken nur: nichts davon kann einen
// erwischen. Jeder hat ein Bild und einen Ton.
//   Wald:    Fledermäuse brechen aus den Kronen und fegen über den Kopf · ein Wildschwein rennt quer durchs Licht ·
//            ein Augenpaar im Dunkeln, das flieht, wenn man es anleuchtet
//   Anstalt: ein Rollstuhl mit einem Toten steht plötzlich hinter einem · eine Zimmertür schlägt zu ·
//            eine Lampe platzt
//   Keller:  Ratten huschen an einem vorbei · ein Rohr platzt und bläst Dampf · ein verschnürter Körper fällt
//            an einer Kette von der Decke und pendelt · eine Lampe platzt
//   Garten:  Krähen fliegen von der Mauer auf · eine Steinfigur dreht sich einem zu, sobald man wegsieht ·
//            Augenpaar · Fledermäuse
// Ausgelöst werden sie von der Schreck-Regie (scares.js), die auch die Abstände einhält: nie zwei große Momente
// hintereinander, nie während einer Verfolgung. Hier steht nur, wie sie aussehen und ablaufen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** [Name, Gewicht] je Welt — die Regie mischt sie unter ihre eigenen Schrecks. */
const TABLE = {
  forest: [['bats', 4], ['boar', 3], ['eyes', 3]],
  halls: [['corpse', 3], ['slam', 3], ['burst', 2]],
  cellar: [['rats', 3], ['steam', 3], ['hang', 2], ['burst', 2]],
  garden: [['crows', 4], ['statue', 3], ['eyes', 2], ['bats', 2]],
};

/**
 * @param {object} c
 * @param {THREE.Scene} c.scene
 * @param {(x:any)=>any} c.keep
 * @param {()=>number} c.rng
 * @param {any} c.audio
 * @param {{x:number,z:number,yaw:number,lightOn?:boolean}} c.player
 * @param {'forest'|'halls'|'cellar'|'garden'} c.theme
 * @param {boolean} c.soft                          sanfte Schreckmomente
 * @param {number} c.wallH
 * @param {(x:number,z:number)=>boolean} c.free    Stelle begehbar?
 * @param {(x0:number,z0:number,x1:number,z1:number)=>boolean} c.los
 * @param {(v:number)=>void} c.shake
 * @param {(secs:number)=>void} c.flicker
 * @param {(secs:number)=>void} c.blackout
 * @param {(cx:number,cz:number,hx:number,hz:number)=>void} c.addProp
 * @param {any} c.assets
 * @param {()=>any[]} [c.lamps]                     Flackerlampen (decor.js) dieser Ebene
 * @param {{mesh:THREE.Object3D, x:number, z:number, open:number, closed:number}[]} [c.leaves]  Türblätter (Anstalt)
 * @param {{x:number, z:number, turnable:boolean, target?:number}[]} [c.statues]               Figuren (Garten)
 */
export function createEvents(c) {
  const { scene, keep, rng, audio, player, soft } = c;
  /** Laufende Ereignisse: update(dt) liefert false, wenn es vorbei ist. */
  let active = [];
  const fwd = () => [-Math.sin(player.yaw), -Math.cos(player.yaw)];
  const inView = (x, z, cosMin = 0.5) => {
    const [fx, fz] = fwd();
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * fx + dz * fz) / d > cosMin;
  };
  const distTo = (x, z) => Math.hypot(x - player.x, z - player.z);
  // (beleuchtbar: im Lichtkegel blitzen die Flügel auf — ganz schwarz verschwanden die Tiere vor dem Nachthimmel)
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 1, side: THREE.DoubleSide }));
  /** Krähen: fast schwarz */
  const black = keep(new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.8, side: THREE.DoubleSide }));

  // ── Schwarm (Fledermäuse, Krähen) ───────────────────────────────────────
  const wingGeo = (() => {
    // ein Flügel in der Waagerechten, Ansatz im Ursprung, Spitze bei x = 1; hinten gezackt
    const s = new THREE.Shape();
    s.moveTo(0, 0.1);
    s.lineTo(0.55, 0.16);
    s.lineTo(1, 0);
    s.lineTo(0.78, -0.12);
    s.lineTo(0.6, -0.3);
    s.lineTo(0.42, -0.16);
    s.lineTo(0.24, -0.32);
    s.lineTo(0, -0.14);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return keep(g);
  })();
  const bodyGeo = keep(new THREE.SphereGeometry(1, 6, 5).scale(0.16, 0.13, 0.36));
  /** Ein Tier: Rumpf und zwei Flügel, die um die Längsachse schlagen. span = Spannweite in Metern. */
  const makeFlyer = (span, mat) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.setScalar(span * 0.5);
    const wings = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(wingGeo, mat);
      w.scale.set(s * span * 0.5, 1, span * 0.5);
      pivot.add(w);
      g.add(pivot);
      return [pivot, s];
    });
    g.add(body);
    return { g, wings };
  };
  const _aim = new THREE.Vector3();
  /**
   * Schwarm von from nach to (Weltpunkte). spread = Streuung am Ziel, speed in m/s, flap = Flügelschläge (rad/s).
   */
  function flock({ count, span, from, to, spread, speed, flap, mat = dark }) {
    const birds = [];
    for (let i = 0; i < count; i++) {
      const f = makeFlyer(span * (0.8 + rng() * 0.4), mat);
      const start = new THREE.Vector3(from[0] + (rng() - 0.5) * 1.6, from[1] + (rng() - 0.5) * 1.2, from[2] + (rng() - 0.5) * 1.6);
      const end = new THREE.Vector3(to[0] + (rng() - 0.5) * spread, to[1] + (rng() - 0.5) * spread * 0.4, to[2] + (rng() - 0.5) * spread);
      const v = end.clone().sub(start);
      const len = v.length();
      const sp = speed * (0.8 + rng() * 0.45);
      v.multiplyScalar(sp / len);
      f.g.position.copy(start);
      f.g.visible = false;
      scene.add(f.g);
      birds.push({ ...f, v, left: len / sp, wait: rng() * 0.45, phase: rng() * 6, flap: flap * (0.85 + rng() * 0.3), wob: 0.6 + rng() * 0.8 });
    }
    let t = 0;
    active.push({
      update(dt) {
        t += dt;
        let alive = false;
        for (const b of birds) {
          if (b.wait > 0) { b.wait -= dt; alive = true; continue; }
          if (b.left <= 0) { b.g.visible = false; continue; }
          alive = true;
          b.left -= dt;
          b.g.visible = true;
          b.g.position.addScaledVector(b.v, dt);
          // Flattern: unruhige Bahn
          b.g.position.x += Math.sin(t * 9 * b.wob + b.phase) * dt * 1.4;
          b.g.position.y += Math.cos(t * 11 * b.wob + b.phase) * dt * 1.1;
          b.g.lookAt(_aim.copy(b.g.position).add(b.v));
          const a = Math.sin(t * b.flap + b.phase) * 0.95;
          for (const [pivot, s] of b.wings) pivot.rotation.z = s * a;
        }
        return alive;
      },
      dispose() { for (const b of birds) scene.remove(b.g); },
    });
  }

  function bats() {
    const [fx, fz] = fwd();
    // aus dem Dunkel vor einem, mitten durch den Lichtkegel und dicht am Kopf vorbei nach hinten
    flock({
      count: 22, span: 0.44, speed: 11, flap: 30, spread: 2.6,
      from: [player.x + fx * 12, 3.3, player.z + fz * 12],
      to: [player.x - fx * 12, 1.9, player.z - fz * 12],
    });
    audio?.bats();
    c.shake(soft ? 0.05 : 0.2);
    return true;
  }

  function crows() {
    const [fx, fz] = fwd();
    const x = player.x + fx * 4.5;
    const z = player.z + fz * 4.5;
    if (!c.free(x, z)) return false;
    // saßen am Boden vor einem: fliegen auf, mitten durch den Lichtkegel und dicht über den Kopf hinweg
    flock({
      count: 8, span: 1.0, speed: 6.5, flap: 11, spread: 5, mat: black,
      from: [x, 0.7, z],
      to: [player.x - fx * 9, 6.5, player.z - fz * 9],
    });
    audio?.caws(x, 1, z);
    c.shake(soft ? 0.04 : 0.15);
    return true;
  }

  // ── Wildschwein ─────────────────────────────────────────────────────────
  let boarKit = null;
  const buildBoar = () => {
    const hide = keep(new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.95 }));
    const tusk = keep(new THREE.MeshStandardMaterial({ color: 0xb8ac90, roughness: 0.5 }));
    const parts = [
      new THREE.SphereGeometry(1, 14, 10).scale(0.6, 0.34, 0.27).translate(0, 0.58, 0),            // Rumpf
      new THREE.SphereGeometry(1, 12, 8).scale(0.34, 0.3, 0.25).translate(0.3, 0.7, 0),            // Widerrist
      new THREE.SphereGeometry(1, 10, 8).scale(0.26, 0.26, 0.24).translate(-0.4, 0.56, 0),         // Hinterteil
      new THREE.ConeGeometry(0.2, 0.52, 10).rotateZ(-Math.PI / 2).translate(0.78, 0.5, 0),         // Kopf, spitz nach vorn
      new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8).rotateZ(Math.PI / 2).translate(1.04, 0.47, 0), // Rüsselscheibe
      new THREE.BoxGeometry(0.75, 0.07, 0.03).translate(0.1, 0.94, 0),                             // Borstenkamm
      new THREE.CylinderGeometry(0.008, 0.012, 0.2, 5).rotateZ(1.1).translate(-0.66, 0.62, 0),     // Schwanz
    ];
    for (const s of [-1, 1]) parts.push(new THREE.ConeGeometry(0.05, 0.13, 5).translate(0.58, 0.76, s * 0.11)); // Ohren
    const bodyG = keep(mergeGeometries(parts.map((p) => p.toNonIndexed())));
    for (const p of parts) p.dispose();
    bodyG.computeVertexNormals();
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyG, hide);
    body.castShadow = true;
    g.add(body);
    const tuskGeo = keep(new THREE.ConeGeometry(0.014, 0.08, 5));
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(tuskGeo, tusk);
      t.position.set(0.9, 0.5, s * 0.075);
      t.rotation.z = -0.5;
      g.add(t);
    }
    const legGeo = keep(new THREE.BoxGeometry(0.075, 0.44, 0.075).translate(0, -0.22, 0));
    const legs = [[0.36, 0.13], [0.36, -0.13], [-0.36, 0.13], [-0.36, -0.13]].map(([x, z], i) => {
      const leg = new THREE.Mesh(legGeo, hide);
      leg.position.set(x, 0.44, z);
      leg.castShadow = true;
      g.add(leg);
      return [leg, i < 2 ? 0 : Math.PI];
    });
    g.scale.setScalar(1.3);
    g.visible = false;
    scene.add(g);
    return { g, legs, body };
  };

  function boar() {
    const [fx, fz] = fwd();
    // quer zur Blickrichtung, ein Stück voraus; die Strecke soll möglichst frei von Stämmen sein
    let best = null;
    for (const dist of [6.5, 7.5, 5.5, 9, 10.5]) {
      for (const side of rng() < 0.5 ? [-1, 1] : [1, -1]) {
        const ax = player.x + fx * dist + fz * side * 7.5;
        const az = player.z + fz * dist - fx * side * 7.5;
        const bx = player.x + fx * dist - fz * side * 7.5;
        const bz = player.z + fz * dist + fx * side * 7.5;
        let blocked = 0;
        for (let k = 0; k <= 15; k++) if (!c.free(ax + ((bx - ax) * k) / 15, az + ((bz - az) * k) / 15)) blocked++;
        if (!best || blocked < best.blocked) best = { ax, az, bx, bz, blocked };
        if (blocked === 0) break;
      }
      if (best?.blocked === 0) break;
    }
    if (!best || best.blocked > 2) return false;
    if (!boarKit) boarKit = buildBoar();
    const { g, legs, body } = boarKit;
    const len = Math.hypot(best.bx - best.ax, best.bz - best.az);
    const dx = (best.bx - best.ax) / len;
    const dz = (best.bz - best.az) / len;
    const speed = 8.5;
    g.position.set(best.ax, 0, best.az);
    // Modell schaut nach +x
    g.rotation.y = Math.atan2(-dz, dx);
    g.visible = true;
    let t = 0;
    let stepAt = 0;
    let squealed = false;
    audio?.boarGrunt(best.ax, 0.5, best.az);
    active.push({
      update(dt) {
        t += dt;
        const s = t * speed;
        const x = best.ax + dx * s;
        const z = best.az + dz * s;
        g.position.set(x, Math.abs(Math.sin(t * 13)) * 0.06, z);
        body.rotation.z = Math.sin(t * 13) * 0.07;
        for (const [leg, ph] of legs) leg.rotation.z = Math.sin(t * 26 + ph) * 0.8;
        if (t > stepAt) { stepAt = t + 0.11; audio?.hoof(x, 0.1, z); }
        if (!squealed && s > len * 0.45) { squealed = true; audio?.boarSqueal(x, 0.5, z); c.shake(soft ? 0.05 : 0.18); }
        if (s < len) return true;
        g.visible = false;
        return false;
      },
      dispose() { g.visible = false; },
    });
    return true;
  }

  // ── Augenpaar im Dunkeln ────────────────────────────────────────────────
  const eyeGeo = keep(new THREE.SphereGeometry(0.034, 8, 6));
  const eyeMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.95, 0.4).multiplyScalar(1.2), fog: false }));
  function eyes() {
    const [fx, fz] = fwd();
    for (let tries = 0; tries < 8; tries++) {
      // seitlich im Blickfeld, aber neben dem Lichtkegel — angeleuchtet sind sie sofort weg
      const a = (rng() < 0.5 ? -1 : 1) * (0.42 + rng() * 0.4);
      const d = 7 + rng() * 3.5;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      const x = player.x + dx * d;
      const z = player.z + dz * d;
      if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        // quer zur Blickrichtung nebeneinander
        e.position.set(-dz * s * 0.07, 0, dx * s * 0.07);
        g.add(e);
      }
      g.position.set(x, 0.5 + rng() * 0.25, z);
      scene.add(g);
      let t = 0;
      let blinkAt = 1 + rng() * 2;
      let flee = -1;
      const side = rng() < 0.5 ? -1 : 1;
      active.push({
        update(dt) {
          t += dt;
          if (flee >= 0) {
            // huscht zur Seite weg
            flee += dt;
            g.position.x += -dz * side * 7 * dt;
            g.position.z += dx * side * 7 * dt;
            return flee < 0.45;
          }
          // blinzeln
          if (t > blinkAt) { blinkAt = t + 1.5 + rng() * 3; g.userData.blink = 0.14; }
          if (g.userData.blink > 0) { g.userData.blink -= dt; g.scale.y = 0.1; } else g.scale.y = 1;
          const dist = distTo(g.position.x, g.position.z);
          // angeleuchtet oder zu nah: weg
          const lit = player.lightOn && dist < 16 && inView(g.position.x, g.position.z, Math.cos(0.28));
          if (lit || dist < 5) {
            flee = 0;
            audio?.twig(g.position.x, 0.2, g.position.z);
            return true;
          }
          return t < 10;
        },
        dispose() { scene.remove(g); },
      });
      audio?.twig(x, 0.2, z);
      return true;
    }
    return false;
  }

  // ── Toter im Rollstuhl (Anstalt) ────────────────────────────────────────
  // Steht plötzlich ein paar Schritte hinter einem auf dem Flur — man hört nur das Quietschen der Räder. Dreht man
  // sich um, sitzt er da. Schaut man wieder weg, ist der Flur leer.
  let chair = null;
  let corpse = null;
  const chairGroup = () => {
    if (chair) return chair;
    chair = new THREE.Group();
    // (das Rollstuhl-Modell schaut nach +z, wie die Figur)
    chair.add(c.assets.model('wheelchair_01', 0.95));
    chair.visible = false;
    scene.add(chair);
    return chair;
  };
  function corpseChair() {
    if (!corpse || active.some((e) => e.kind === 'corpse')) return false;
    const [fx, fz] = fwd();
    for (const dist of [3.6, 4.4, 2.9, 5.4]) {
      const x = player.x - fx * dist;
      const z = player.z - fz * dist;
      if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
      const g = chairGroup();
      g.position.set(x, 0, z);
      // dem Spieler zugewandt
      g.rotation.y = Math.atan2(player.x - x, player.z - z);
      g.visible = true;
      audio?.squeak(x, 0.4, z);
      let t = 0;
      let seenAt = -1;
      let awayFor = 0;
      active.push({
        kind: 'corpse',
        update(dt) {
          t += dt;
          const looking = inView(x, z, 0.55);
          if (looking && seenAt < 0) {
            seenAt = t;
            if (!soft) audio?.stinger();
            c.shake(soft ? 0.06 : 0.3);
            c.flicker(0.5);
          }
          if (seenAt >= 0) awayFor = looking ? 0 : awayFor + dt;
          const gone = (seenAt >= 0 && awayFor > 0.7) || distTo(x, z) < 1.5 || t > 16 || distTo(x, z) > 11;
          if (!gone) return true;
          g.visible = false;
          if (seenAt >= 0) c.blackout(0.18);
          return false;
        },
        dispose() { g.visible = false; },
      });
      return true;
    }
    return false;
  }

  // ── Tür schlägt zu (Anstalt) ────────────────────────────────────────────
  function slam() {
    const list = (c.leaves || []).filter((l) => !l.busy && distTo(l.x, l.z) > 2.2 && distTo(l.x, l.z) < 9 && inView(l.x, l.z, 0.35));
    if (!list.length) return false;
    const leaf = list.sort((a, b) => distTo(a.x, a.z) - distTo(b.x, b.z))[0];
    leaf.busy = true;
    let t = 0;
    let banged = false;
    // kürzester Drehweg von offen nach zu
    const turn = Math.atan2(Math.sin(leaf.closed - leaf.open), Math.cos(leaf.closed - leaf.open));
    active.push({
      update(dt) {
        t += dt;
        // 0–0,16 s: schlägt zu · bis 1,6 s: bleibt zu · danach knarrt sie langsam wieder auf
        let k;
        if (t < 0.16) k = (t / 0.16) ** 2;
        else if (t < 1.6) k = 1;
        else k = Math.max(0, 1 - (t - 1.6) / 1.8);
        leaf.mesh.rotation.y = leaf.open + turn * k;
        if (!banged && t >= 0.16) {
          banged = true;
          audio?.slam(leaf.x, 1.2, leaf.z);
          c.shake(soft ? 0.08 : 0.3);
        }
        if (t > 1.6 && !leaf.creaked) { leaf.creaked = true; audio?.creak(leaf.x, 1.2, leaf.z); }
        if (t < 3.4) return true;
        leaf.mesh.rotation.y = leaf.open;
        leaf.busy = false;
        leaf.creaked = false;
        return false;
      },
      dispose() { leaf.mesh.rotation.y = leaf.open; leaf.busy = false; },
    });
    return true;
  }

  // ── Lampe platzt (Anstalt, Keller) ──────────────────────────────────────
  const sparkMat = keep(new THREE.PointsMaterial({ color: new THREE.Color(1, 0.8, 0.45).multiplyScalar(3), size: 0.035, sizeAttenuation: true }));
  function burst() {
    const lamps = (c.lamps?.() || []).filter((L) => L.alive && distTo(L.x, L.z) > 2 && distTo(L.x, L.z) < 9 && inView(L.x, L.z, 0.3));
    if (!lamps.length) return false;
    const L = lamps.sort((a, b) => distTo(a.x, a.z) - distTo(b.x, b.z))[0];
    // sie ist danach tot
    L.alive = false;
    L.mat.color.setScalar(0.03);
    const n = 22;
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = L.x; pos[i * 3 + 1] = L.y + 0.2; pos[i * 3 + 2] = L.z;
      const a = rng() * Math.PI * 2;
      vel.push([Math.cos(a) * (0.5 + rng() * 2), 0.5 + rng() * 2, Math.sin(a) * (0.5 + rng() * 2)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, sparkMat);
    pts.frustumCulled = false;
    scene.add(pts);
    audio?.bulbPop(L.x, L.y, L.z);
    c.shake(soft ? 0.05 : 0.22);
    let t = 0;
    active.push({
      update(dt) {
        t += dt;
        for (let i = 0; i < n; i++) {
          vel[i][1] -= 9.8 * dt;
          pos[i * 3] += vel[i][0] * dt;
          pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i][1] * dt);
          pos[i * 3 + 2] += vel[i][2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        return t < 0.9;
      },
      dispose() { scene.remove(pts); geo.dispose(); },
    });
    return true;
  }

  // ── Ratten (Keller) ─────────────────────────────────────────────────────
  const ratGeo = (() => {
    const parts = [
      new THREE.SphereGeometry(1, 8, 6).scale(0.11, 0.045, 0.045),
      new THREE.SphereGeometry(1, 6, 5).scale(0.045, 0.035, 0.035).translate(0.12, 0.004, 0),
      new THREE.CylinderGeometry(0.004, 0.009, 0.2, 5).rotateZ(Math.PI / 2).translate(-0.2, -0.01, 0),
    ];
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    for (const p of parts) p.dispose();
    g.translate(0, 0.045, 0);
    return keep(g);
  })();
  const ratMat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1815, roughness: 0.9 }));
  function rats() {
    const [fx, fz] = fwd();
    // der Gang vor einem muss ein Stück weit frei sein
    let reach = 0;
    while (reach < 9 && c.free(player.x + fx * (reach + 0.6), player.z + fz * (reach + 0.6))) reach += 0.6;
    if (reach < 4.2) return false;
    const pack = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(ratGeo, ratMat);
      m.scale.setScalar(1.3 + rng() * 0.5);
      const off = (rng() - 0.5) * 1.3;
      const start = reach - 0.3 - rng() * 1.6;
      m.position.set(player.x + fx * start + fz * off, 0, player.z + fz * start - fx * off);
      // Modell schaut nach +x, läuft auf einen zu
      m.rotation.y = Math.atan2(fz, -fx);
      scene.add(m);
      pack.push({ m, sp: 4.5 + rng() * 2.5, ph: rng() * 6, left: (start + 4 + rng() * 2) });
    }
    audio?.rats();
    let t = 0;
    active.push({
      update(dt) {
        t += dt;
        let alive = false;
        for (const r of pack) {
          if (r.left <= 0) { r.m.visible = false; continue; }
          alive = true;
          const step = r.sp * dt;
          r.left -= step;
          const wig = Math.sin(t * 14 + r.ph) * 0.5 * dt;
          r.m.position.x += -fx * step + fz * wig;
          r.m.position.z += -fz * step - fx * wig;
        }
        return alive;
      },
      dispose() { for (const r of pack) scene.remove(r.m); },
    });
    return true;
  }

  // ── Rohr platzt: Dampf (Keller) ─────────────────────────────────────────
  let puff = null;
  const puffTexture = () => {
    if (puff) return puff;
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    puff = keep(new THREE.CanvasTexture(cv));
    return puff;
  };
  let steamMat = null;
  const steamMaterial = () => {
    if (!steamMat) {
      steamMat = keep(new THREE.PointsMaterial({
        map: puffTexture(), color: 0xb9c2c4, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.32, depthWrite: false,
      }));
    }
    return steamMat;
  };
  function steam() {
    if (active.some((e) => e.kind === 'steam')) return false;
    const [fx, fz] = fwd();
    for (const dist of [3, 3.8, 2.4]) {
      const side = (rng() - 0.5) * 1.2;
      const x = player.x + fx * dist + fz * side;
      const z = player.z + fz * dist - fx * side;
      if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
      const n = 70;
      const pos = new Float32Array(n * 3);
      const life = new Float32Array(n).fill(-1);
      const vel = [];
      for (let i = 0; i < n; i++) vel.push([0, 0, 0]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = steamMaterial();
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      const top = c.wallH - 0.25;
      const DUR = 2.6;
      audio?.steam(x, top, z, DUR);
      c.shake(soft ? 0.05 : 0.2);
      let t = 0;
      let next = 0;
      active.push({
        kind: 'steam',
        update(dt) {
          t += dt;
          for (let i = 0; i < n; i++) {
            if (life[i] < 0) {
              // der Strahl bläst schräg nach unten auf einen zu
              if (t < DUR && t >= next) {
                next = t + DUR / (n * 1.6);
                life[i] = 0;
                pos[i * 3] = x; pos[i * 3 + 1] = top; pos[i * 3 + 2] = z;
                vel[i] = [-fx * (1.2 + rng() * 1.6) + (rng() - 0.5) * 1.2, -(1.6 + rng() * 2), -fz * (1.2 + rng() * 1.6) + (rng() - 0.5) * 1.2];
              } else { pos[i * 3 + 1] = -5; }
              continue;
            }
            life[i] += dt;
            vel[i][1] += 1.6 * dt;       // Dampf steigt wieder
            pos[i * 3] += vel[i][0] * dt;
            pos[i * 3 + 1] += vel[i][1] * dt;
            pos[i * 3 + 2] += vel[i][2] * dt;
            if (life[i] > 0.9) life[i] = -1;
          }
          geo.attributes.position.needsUpdate = true;
          mat.opacity = 0.32 * Math.min(1, (DUR + 0.9 - t) / 0.9);
          return t < DUR + 0.9;
        },
        dispose() { scene.remove(pts); geo.dispose(); },
      });
      return true;
    }
    return false;
  }

  // ── Körper an der Kette (Keller) ────────────────────────────────────────
  // Fällt ein paar Schritte vor einem von der Decke — kopfüber, an den Füßen —, federt und pendelt aus. Er bleibt
  // hängen: beim nächsten Mal weiß man, dass er da ist. Höchstens zwei je Ebene.
  let hung = 0;
  let sackGeo = null;
  let ropeGeo = null;
  /**
   * In ein Tuch geschnürter Körper, kopfüber an den Füßen aufgehängt: unten der Kopf, darüber Schultern, Hüfte, zu
   * den zusammengebundenen Füßen hin schmal. Flach wie ein Mensch, beulig, am Kopf dunkel durchgesuppt.
   */
  const buildSack = () => {
    if (sackGeo) return;
    const prof = [[0.02, -0.72], [0.1, -0.7], [0.125, -0.6], [0.1, -0.48], [0.2, -0.38], [0.215, -0.22], [0.17, -0.02],
      [0.19, 0.12], [0.15, 0.32], [0.11, 0.52], [0.075, 0.66], [0.05, 0.72], [0.02, 0.74]];
    sackGeo = keep(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18));
    const p = sackGeo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cloth = new THREE.Color(0x4f4739);
    const stain = new THREE.Color(0x1f0c09);
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const lump = 1 + Math.sin(a * 3 + y * 9) * 0.07 + Math.sin(a * 7 - y * 17) * 0.03;
      // der Kopf hängt leicht zur Seite
      const lean = y < -0.45 ? (-0.45 - y) * 0.25 : 0;
      p.setXYZ(i, p.getX(i) * lump + lean, y, p.getZ(i) * lump * 0.7);
      const wet = Math.min(1, Math.max(0, (-0.3 - y) / 0.35)) * 0.85 + (Math.sin(a * 2.3 + y * 6) > 0.6 ? 0.35 : 0);
      tmp.copy(cloth).lerp(stain, Math.min(1, wet));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    sackGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sackGeo.computeVertexNormals();
    ropeGeo = keep(new THREE.TorusGeometry(1, 0.07, 5, 16));
  };
  const shroud = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  const iron = keep(new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.6, metalness: 0.7 }));
  function hang() {
    if (hung >= 2) return false;
    const [fx, fz] = fwd();
    for (const dist of [3.4, 4.2, 2.8]) {
      const x = player.x + fx * dist;
      const z = player.z + fz * dist;
      if (!c.free(x, z) || !c.los(player.x, player.z, x, z)) continue;
      buildSack();
      const pivot = new THREE.Group();
      pivot.position.set(x, c.wallH, z);
      const drop = new THREE.Group();
      const LEN = 0.75;
      const chain = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, LEN, 5)), iron);
      chain.position.y = -LEN / 2;
      const body = new THREE.Mesh(sackGeo, shroud);
      body.position.y = -LEN - 0.72;
      body.castShadow = true;
      // Stricke: um die Füße, die Hüfte, den Hals
      for (const [y, r] of [[-LEN - 0.1, 0.085], [-LEN - 0.62, 0.185], [-LEN - 1.2, 0.11]]) {
        const rope = new THREE.Mesh(ropeGeo, iron);
        rope.rotation.x = Math.PI / 2;
        rope.position.y = y;
        rope.scale.set(r, r * 0.72, r);
        drop.add(rope);
      }
      drop.add(chain, body);
      pivot.add(drop);
      scene.add(pivot);
      c.addProp(x, z, 0.2, 0.2);
      hung++;
      audio?.chainDrop(x, c.wallH - 0.6, z);
      c.shake(soft ? 0.08 : 0.35);
      // Pendelachse quer zur Blickrichtung: er schwingt auf einen zu
      const ax = new THREE.Vector3(-fz, 0, fx);
      let t = 0;
      let creakAt = 0.9;
      active.push({
        update(dt) {
          t += dt;
          // Fall aus der Decke (1,7 m über der Endlage), mit Nachfedern
          const fall = t < 0.28 ? 1 - (t / 0.28) ** 2 : 0;
          drop.position.y = fall * 1.7 + (t >= 0.28 ? Math.exp(-(t - 0.28) * 6) * Math.sin((t - 0.28) * 22) * 0.08 : 0);
          const swing = t < 0.28 ? 0 : 0.42 * Math.exp(-(t - 0.28) * 0.32) * Math.sin((t - 0.28) * 2.6);
          pivot.quaternion.setFromAxisAngle(ax, swing);
          if (t > creakAt && t < 6) { creakAt = t + 1.2; audio?.squeak(x, c.wallH - 0.2, z); }
          // nach 12 s hängt er still (bleibt in der Welt)
          return t < 12;
        },
      });
      return true;
    }
    return false;
  }

  // ── Steinfigur dreht sich einem zu (Garten) ─────────────────────────────
  function statue() {
    const list = (c.statues || []).filter((s) => !s.turnable && distTo(s.x, s.z) < 10 && distTo(s.x, s.z) > 2.5);
    if (!list.length) return false;
    // am liebsten eine, die man gerade nicht ansieht
    const s = list.find((q) => !inView(q.x, q.z, 0.3)) || list[0];
    let t = 0;
    let next = 0;
    active.push({
      update(dt) {
        t += dt;
        if (t >= next) {
          next = t + 2.2;
          // dreht sich nur, während man wegsieht (beim ersten Mal auch so)
          if (t < 0.1 || !inView(s.x, s.z, 0.4)) {
            s.target = Math.atan2(player.x - s.x, player.z - s.z);
            audio?.grind(s.x, 0.6, s.z);
          }
        }
        return t < 22 && distTo(s.x, s.z) < 16;
      },
    });
    return true;
  }

  const kinds = { bats, crows, boar, eyes, corpse: corpseChair, slam, burst, rats, steam, hang, statue };

  // Alles, was die Ereignisse dieser Karte brauchen, schon jetzt bauen und unsichtbar in die Szene hängen: das
  // Vorwärmen des Spiels (game.js: warm) übersetzt dann ihre Shader mit. Sonst entstünden Modell und Shader erst
  // im Schreckmoment selbst — und genau dann stockte das Bild.
  {
    const mine = new Set((TABLE[c.theme] || []).map(([k]) => k));
    const stash = (obj) => {
      obj.visible = false;
      obj.frustumCulled = false;
      scene.add(obj);
    };
    const onePoint = () => {
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      return g;
    };
    if (mine.has('boar')) boarKit = buildBoar();
    if (mine.has('bats')) stash(makeFlyer(0.4, dark).g);
    if (mine.has('crows')) stash(makeFlyer(1, black).g);
    if (mine.has('eyes')) stash(new THREE.Mesh(eyeGeo, eyeMat));
    if (mine.has('rats')) stash(new THREE.Mesh(ratGeo, ratMat));
    if (mine.has('burst')) stash(new THREE.Points(onePoint(), sparkMat));
    if (mine.has('steam')) stash(new THREE.Points(onePoint(), steamMaterial()));
    if (mine.has('hang')) {
      buildSack();
      stash(new THREE.Mesh(sackGeo, shroud));
      stash(new THREE.Mesh(ropeGeo, iron));
    }
    if (mine.has('corpse')) chairGroup();
  }

  return {
    /** [Name, Gewicht] für die Regie */
    table: TABLE[c.theme] || [],
    /** Ereignis auslösen. false, wenn es hier gerade nicht geht (kein Platz, keine Lampe in Sicht …). */
    trigger(name) { return !!kinds[name]?.(); },
    /** Der Tote für den Rollstuhl (Figur aus monsterModel.js, sitzend) — kommt nach, sobald das Skelett geladen ist. */
    setCorpse(group) {
      corpse = group;
      const g = chairGroup();
      // sitzt auf der Sitzfläche (0,5 m), Rücken an der Lehne, Gesicht in Fahrtrichtung des Stuhls
      group.position.set(0, group.userData.seatY ?? -0.4, -0.1);
      g.add(group);
    },
    update(dt) {
      if (!active.length) return;
      const still = [];
      for (const e of active) {
        if (e.update(dt)) still.push(e); else e.dispose?.();
      }
      active = still;
    },
    dispose() {
      for (const e of active) e.dispose?.();
      active = [];
    },
  };
}
