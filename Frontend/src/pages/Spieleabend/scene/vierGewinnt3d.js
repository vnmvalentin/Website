// scene/vierGewinnt3d.js — das 4-gewinnt-Brett aus blauem Plastik, das in der Tischmitte steht.
//
// Zwei gelochte Platten mit Spalt dazwischen, Seitenstützen mit Füßen, unten der Schieber. Die Steine fallen sichtbar
// in ihre Spalte (mit kleinem Nachhüpfen), die Gewinnreihe pulsiert, und vor einer neuen Partie fallen alle Steine
// unten heraus. Das Brett steht in der x-y-Ebene: Platz 0 sitzt bei +z, Platz 1 gegenüber bei −z.
//
// Unsichtbare Klickflächen je Spalte (pickTargets, userData.spalte) liegen vor und hinter dem Brett — Raycaster
// treffen sie auch ohne Sichtbarkeit.
import * as THREE from "three";

export const REIHEN = 6;
export const SPALTEN = 7;
export const ZELLE = 0.18; // Zellengröße (so klein, dass man über das Brett hinweg den Gegner sieht)
const S = ZELLE;
const LOCH_R = 0.069;
const STEIN_R = 0.077;
const W = SPALTEN * S + 0.12;
const H = REIHEN * S + 0.12;
const Y0 = 0.17; // Unterkante des Gitters über der Tischplatte
const OBEN = Y0 + H;
const PLATTE = 0.022;
const SPALT = 0.034; // halbe Spaltbreite zwischen den Platten
const G = 10; // Fallbeschleunigung (Welt-Einheiten/s²)

const zelleX = (c) => (c - 3) * S;
const zelleY = (r) => Y0 + 0.06 + (REIHEN - 1 - r) * S + S / 2;

function platteGeometrie() {
  const shape = new THREE.Shape();
  const r = 0.05;
  const w = W / 2;
  shape.moveTo(-w + r, 0);
  shape.lineTo(w - r, 0);
  shape.quadraticCurveTo(w, 0, w, r);
  shape.lineTo(w, H - r);
  shape.quadraticCurveTo(w, H, w - r, H);
  shape.lineTo(-w + r, H);
  shape.quadraticCurveTo(-w, H, -w, H - r);
  shape.lineTo(-w, r);
  shape.quadraticCurveTo(-w, 0, -w + r, 0);
  for (let row = 0; row < REIHEN; row += 1) {
    for (let c = 0; c < SPALTEN; c += 1) {
      const hole = new THREE.Path();
      hole.absarc(zelleX(c), zelleY(row) - Y0, LOCH_R, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATTE, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 18 });
  geo.translate(0, Y0, 0);
  return geo;
}

// Spielstein: Scheibe mit erhabenem Ring auf beiden Seiten (gedreht, Achse entlang z)
function steinGeometrie() {
  const k = STEIN_R / 0.085; // Profil für Radius 0.085 gezeichnet
  const p = [
    [0, 0.017], [0.046, 0.017], [0.052, 0.024], [0.066, 0.024], [0.085, 0.017],
    [0.085, -0.017], [0.066, -0.024], [0.052, -0.024], [0.046, -0.017], [0, -0.017],
  ].map(([x, y]) => new THREE.Vector2(x * k, y));
  const geo = new THREE.LatheGeometry(p, 28);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * @param {{ low?: boolean }} opts
 */
export function createVierGewinnt({ low = false } = {}) {
  const group = new THREE.Group();
  const plastik = new THREE.MeshStandardMaterial({ color: "#1f5ad6", roughness: 0.32, metalness: 0.02 });
  const plastikDunkel = new THREE.MeshStandardMaterial({ color: "#1846a8", roughness: 0.4 });
  const schieberMat = new THREE.MeshStandardMaterial({ color: "#c9ced8", roughness: 0.45 });

  const pg = platteGeometrie();
  const vorne = new THREE.Mesh(pg, plastik);
  vorne.position.z = SPALT;
  const hinten = new THREE.Mesh(pg, plastik);
  hinten.position.z = -SPALT - PLATTE;
  group.add(vorne, hinten);

  // Stege zwischen den Spalten (sieht man am Lochrand)
  const steg = new THREE.BoxGeometry(0.014, H - 0.04, SPALT * 2);
  for (let c = 0; c <= SPALTEN; c += 1) {
    const m = new THREE.Mesh(steg, plastikDunkel);
    m.position.set((c - 3.5) * S, Y0 + H / 2, 0);
    group.add(m);
  }
  // Seitenstützen mit Füßen
  for (const sx of [-1, 1]) {
    const stuetze = new THREE.Mesh(new THREE.BoxGeometry(0.075, OBEN + 0.03, 0.15), plastik);
    stuetze.position.set(sx * (W / 2 + 0.035), (OBEN + 0.03) / 2, 0);
    const fuss = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.78), plastikDunkel);
    fuss.position.set(sx * (W / 2 + 0.035), 0.03, 0);
    for (const sz of [-1, 1]) {
      const kappe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 14), plastikDunkel);
      kappe.position.set(sx * (W / 2 + 0.035), 0.03, sz * 0.39);
      group.add(kappe);
    }
    group.add(stuetze, fuss);
  }
  // Schieber unten (hält die Steine; vor einer neuen Partie gleitet er heraus)
  const schieber = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.035, SPALT * 2 + 0.05), schieberMat);
  schieber.position.set(0, Y0 + 0.02, 0);
  group.add(schieber);
  const griff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.12), schieberMat);
  schieber.add(griff);
  griff.position.set(W / 2 + 0.06, 0, 0);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !low;
      o.receiveShadow = !low;
    }
  });

  // Klickflächen je Spalte
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickGeo = new THREE.BoxGeometry(S, H + 0.55, 0.7);
  const pickTargets = [];
  for (let c = 0; c < SPALTEN; c += 1) {
    const m = new THREE.Mesh(pickGeo, pickMat);
    m.position.set(zelleX(c), Y0 + (H + 0.55) / 2, 0);
    m.userData.spalte = c;
    group.add(m);
    pickTargets.push(m);
  }

  // ── Steine ──────────────────────────────────────────────────────────────────────────────
  const steinGeo = steinGeometrie();
  let farben = ["#e23a3a", "#f4c20d"];
  const mats = [];
  const glanz = [];
  function setFarben(f) {
    farben = f;
    mats.splice(0).forEach((m) => m.dispose());
    glanz.splice(0).forEach((m) => m.dispose());
    for (const hex of farben) {
      mats.push(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.38 }));
      glanz.push(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, emissive: hex, emissiveIntensity: 0.55 }));
    }
    for (const st of steine.values()) st.mesh.material = (st.sieg ? glanz : mats)[st.stein - 1];
    geist.material.color.set(farben[geistStein - 1] || farben[0]);
  }

  const steine = new Map(); // "r,c" -> { mesh, stein, fall?, sieg }
  const fallend = [];
  const raus = [];
  const steinGruppe = new THREE.Group();
  group.add(steinGruppe);

  function neuerStein(stein) {
    const mesh = new THREE.Mesh(steinGeo, mats[stein - 1]);
    mesh.castShadow = !low;
    steinGruppe.add(mesh);
    return mesh;
  }

  function leeren() {
    for (const st of steine.values()) steinGruppe.remove(st.mesh);
    steine.clear();
    fallend.length = 0;
  }

  /** Brett hart auf einen Stand setzen (ohne Animation). reihe: Gewinnzellen [[r,c],…]. */
  function setzeHart(brett, reihe = []) {
    leeren();
    for (let r = 0; r < REIHEN; r += 1) {
      for (let c = 0; c < SPALTEN; c += 1) {
        const v = brett?.[r]?.[c];
        if (!v) continue;
        const mesh = neuerStein(v);
        mesh.position.set(zelleX(c), zelleY(r), 0);
        steine.set(`${r},${c}`, { mesh, stein: v, sieg: false });
      }
    }
    gewinn(reihe);
  }

  /** Ein Stein fällt in seine Zelle. onLand(tiefe) beim Aufschlag (für den Klang). */
  function fallen(spalte, reihe, stein, onLand) {
    const mesh = neuerStein(stein);
    const y0 = OBEN + 0.2;
    const y1 = zelleY(reihe);
    mesh.position.set(zelleX(spalte), y0, 0);
    const st = { mesh, stein, sieg: false };
    steine.set(`${reihe},${spalte}`, st);
    fallend.push({ st, t: 0, y0, y1, dauer: Math.sqrt((2 * (y0 - y1)) / G), onLand, tiefe: reihe + 1, gelandet: false });
  }

  /** Alle Steine fallen unten heraus (neue Partie). */
  function ausleeren() {
    for (const st of steine.values()) {
      raus.push({ mesh: st.mesh, t: -(st.mesh.position.y - Y0) * 0.18, v: 0 });
    }
    steine.clear();
    fallend.length = 0;
    schieberOffen = 0.45;
  }

  let siegZeit = 0;
  function gewinn(reihe = []) {
    const set = new Set((reihe || []).map(([r, c]) => `${r},${c}`));
    for (const [k, st] of steine) {
      st.sieg = set.has(k);
      st.mesh.material = (st.sieg ? glanz : mats)[st.stein - 1];
      if (!st.sieg) st.mesh.scale.setScalar(1);
    }
    siegZeit = 0;
  }

  // Vorschau-Stein über der Spalte, auf die man zeigt
  const geist = new THREE.Mesh(steinGeo, new THREE.MeshStandardMaterial({ color: farben[0], transparent: true, opacity: 0.6, roughness: 0.4 }));
  geist.visible = false;
  group.add(geist);
  let geistStein = 1;
  let geistSpalte = null;
  function zeigeGeist(spalte, stein = 1) {
    geistSpalte = spalte;
    if (stein !== geistStein) {
      geistStein = stein;
      geist.material.color.set(farben[stein - 1]);
    }
    geist.visible = spalte !== null;
    if (spalte !== null) geist.position.x = zelleX(spalte);
  }

  let schieberOffen = 0;
  function update(dt, time) {
    for (let i = fallend.length - 1; i >= 0; i -= 1) {
      const f = fallend[i];
      f.t += dt;
      const m = f.st.mesh;
      if (f.t < f.dauer) {
        m.position.y = f.y0 - 0.5 * G * f.t * f.t;
      } else {
        if (!f.gelandet) {
          f.gelandet = true;
          f.onLand?.(f.tiefe);
        }
        // kurzes Nachhüpfen
        const b = f.t - f.dauer;
        const hb = 0.035 * Math.max(0, 1 - b / 0.16);
        m.position.y = f.y1 + Math.abs(Math.sin((b / 0.16) * Math.PI)) * hb;
        if (b > 0.16) {
          m.position.y = f.y1;
          fallend.splice(i, 1);
        }
      }
    }
    for (let i = raus.length - 1; i >= 0; i -= 1) {
      const r = raus[i];
      r.t += dt;
      if (r.t < 0) continue;
      r.v += G * dt;
      r.mesh.position.y -= r.v * dt;
      if (r.mesh.position.y < Y0 - 0.05) {
        // unter dem Brett: schrumpfen und weg
        r.mesh.scale.setScalar(Math.max(0.001, r.mesh.scale.x - dt * 6));
        r.mesh.position.y = Math.max(r.mesh.position.y, 0.02);
      }
      if (r.mesh.scale.x <= 0.01) {
        steinGruppe.remove(r.mesh);
        raus.splice(i, 1);
      }
    }
    schieberOffen = Math.max(0, schieberOffen - dt * 0.6);
    schieber.position.x = Math.sin(Math.min(1, schieberOffen / 0.45) * Math.PI) * 0.35;
    siegZeit += dt;
    for (const st of steine.values()) if (st.sieg) st.mesh.scale.setScalar(1 + Math.abs(Math.sin(siegZeit * 4)) * 0.14);
    if (geist.visible) geist.position.y = OBEN + 0.16 + Math.sin(time * 4) * 0.025;
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    [plastik, plastikDunkel, schieberMat, pickMat, geist.material, ...mats, ...glanz].forEach((m) => m.dispose());
  }

  setFarben(farben);

  return {
    group,
    pickTargets,
    setFarben,
    setzeHart,
    fallen,
    ausleeren,
    gewinn,
    zeigeGeist,
    get geistSpalte() {
      return geistSpalte;
    },
    get faellt() {
      return fallend.length > 0;
    },
    update,
    dispose,
    /** Punkt über dem Brett (lokal, für Beschriftungen) */
    oben: OBEN,
  };
}

/**
 * Spielobjekt für zimmerSzene.js — dieselbe Schnittstelle haben alle Spiele (siehe maedn3d.js):
 *   setze({ partie, sicht, meinPlatz, farben, erstes })  Server-Stand übernehmen, Neues animieren
 *   treffer(ray) → Treffer | null, hover(treffer), klick(treffer, touch) → Aktion für den Server | null
 *   update(dt, time), anker(key, out), restZeit() (s bis die Animation fertig ist), dispose()
 */
export function createVierGewinntSpiel({ low = false, sound }) {
  const brett = createVierGewinnt({ low });
  let brettNr = null;
  let brettZuege = 0;
  let klickbar = false;
  let stein = 1;

  function setze({ partie, sicht, meinPlatz, farben }) {
    if (farben) brett.setFarben(farben);
    if (!partie) {
      if (brettNr !== null) {
        brett.ausleeren();
        sound.ausleeren();
      }
      brettNr = null;
      brettZuege = 0;
    } else if (partie.nr !== brettNr) {
      if (brettNr !== null && sicht.zuege === 0) {
        brett.ausleeren();
        sound.ausleeren();
      } else brett.setzeHart(sicht.brett, sicht.reihe);
      brettNr = partie.nr;
      brettZuege = sicht.zuege;
    } else if (sicht.zuege === brettZuege + 1 && sicht.letzter) {
      const l = sicht.letzter;
      sound.einwurf();
      brett.fallen(l.spalte, l.reihe, l.platz + 1, (tiefe) => {
        sound.klack(tiefe);
        brett.gewinn(sicht.reihe);
      });
      brettZuege = sicht.zuege;
    } else if (sicht.zuege !== brettZuege) {
      brett.setzeHart(sicht.brett, sicht.reihe);
      brettZuege = sicht.zuege;
    }
    klickbar = !!partie?.laeuft && meinPlatz !== null && sicht.amZug === meinPlatz;
    stein = (meinPlatz ?? 0) + 1;
    if (!klickbar) brett.zeigeGeist(null);
  }

  function treffer(ray) {
    if (!klickbar) return null;
    const hit = ray.intersectObjects(brett.pickTargets, false)[0];
    return hit ? { art: "spalte", spalte: hit.object.userData.spalte } : null;
  }
  function hover(hit) {
    brett.zeigeGeist(hit ? hit.spalte : null, stein);
  }
  function klick(hit, touch) {
    if (!hit) {
      brett.zeigeGeist(null);
      return null;
    }
    // am Handy: erst zeigen, mit dem zweiten Tippen einwerfen
    if (touch && brett.geistSpalte !== hit.spalte) {
      brett.zeigeGeist(hit.spalte, stein);
      return null;
    }
    brett.zeigeGeist(null);
    return { spalte: hit.spalte };
  }
  function anker(key, out) {
    // Schild des Bretts hängt unter dem Brett (darüber schaut der Gegner hervor)
    if (key === "brett") return out.set(0, 0.04, 0);
    if (key.startsWith("spalte:")) return out.set((Number(key.slice(7)) - 3) * ZELLE, brett.oben * 0.55, 0);
    return null;
  }

  return {
    group: brett.group,
    setze,
    treffer,
    hover,
    klick,
    update: (dt, time) => brett.update(dt, time),
    anker,
    restZeit: () => (brett.faellt ? 0.65 : 0),
    dispose: () => brett.dispose(),
  };
}
