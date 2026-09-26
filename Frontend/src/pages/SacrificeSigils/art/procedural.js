// art/procedural.js — prozedurale Artworks im Kohle-/Tusche-Stil, deterministisch aus art.seed.
//
// Aufbau jedes Bildes (viewBox 100×76, das Artwork-Fenster der Karte):
//   Pergament-Grund mit Stammfarbe getönt, Vignette, Stammsymbol als blasses Wasserzeichen,
//   Kohle-Schwaden, Boden mit Schraffur, die Kreatur aus parametrischen Pfaden (13 Familien),
//   zittrige Linie per feTurbulence + feDisplacementMap, Schraffur per <pattern> (unten rechts stärker),
//   Papierkorn-Overlay, leuchtende Augen als einziger Farbakzent.
//   Selten: Ornamente und Glyphenring. Legendär: animierter Glüh-Effekt. Verflucht: rissige Tintenadern.
//
// Ausgabe ist ein vollständiges SVG-Dokument (String). Die Karte zeigt es als <img src="data:…">, dadurch sind
// IDs isoliert und der Browser rastert jedes Bild nur einmal. Ergebnis wird pro Karte im Speicher gecacht.

import { hashParts, rand } from "../engine/rng.js";
import { TRIBE_BY_ID } from "../data/tribes.js";
import { TRIBE_SYMBOLS } from "./tribeSymbols.js";

const W = 100;
const H = 76;
const INK = "#1a1612";
const PAPER = "#e6d8b6";

// ───────────────────────── Werkzeuge ─────────────────────────

const f = (n) => (Math.round(n * 10) / 10).toString();

/** @param {{rng:number}} s @param {number} a @param {number} b */
const rr = (s, a, b) => a + rand(s) * (b - a);
/** @param {{rng:number}} s @param {number} a @param {number} b */
const ri = (s, a, b) => Math.floor(rr(s, a, b + 1));
/** @param {{rng:number}} s @param {number} p */
const chance = (s, p) => rand(s) < p;
/** @template T @param {{rng:number}} s @param {T[]} arr @returns {T} */
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

/** Catmull-Rom → kubische Bézier, geschlossen. @param {number[][]} pts */
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Catmull-Rom offen. @param {number[][]} pts */
function smoothOpen(pts) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Unregelmäßiger Klecks. */
function blob(s, cx, cy, rx, ry, n = 9, jit = 0.12, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rr(s, -jit, jit);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return smoothClosed(pts);
}

/** Sich verjüngendes Glied als Fläche. */
function taper(x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return `M${f(x1 + nx * w1)} ${f(y1 + ny * w1)}L${f(x2 + nx * w2)} ${f(y2 + ny * w2)}L${f(x2 - nx * w2)} ${f(y2 - ny * w2)}L${f(x1 - nx * w1)} ${f(y1 - ny * w1)}Z`;
}

/** Glied mit Knick (Gelenk). */
function jointLeg(x1, y1, kx, ky, x2, y2, w) {
  return `${taper(x1, y1, kx, ky, w, w * 0.8)}${taper(kx, ky, x2, y2, w * 0.8, w * 0.45)}`;
}

/** Zeichenpuffer einer Kreatur. */
class Sketch {
  constructor() {
    /** @type {string[]} */
    this.back = [];
    /** @type {string[]} */
    this.body = [];
    /** @type {string[]} */
    this.lines = [];
    /** @type {string[]} */
    this.eyes = [];
    this.color = "#c8643a";
  }

  /** Fläche: Papier-Grund, Schraffur im Schatten, Tuschekontur plus versetzter Skizzenstrich. */
  shape(d, { w = 1.25, dark = false, layer = "body" } = {}) {
    const out = [
      `<path d="${d}" fill="${dark ? "#4a3d30" : PAPER}"/>`,
      `<path d="${d}" fill="url(#hatch)" mask="url(#shadeMask)"/>`,
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`,
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="0.45" opacity="0.45" transform="translate(0.7 -0.5)"/>`,
    ];
    (layer === "back" ? this.back : this.body).push(...out);
  }

  /** Reine Linie (Haare, Federn, Details). */
  line(d, w = 0.9, opacity = 1) {
    this.lines.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`);
  }

  /** Dunkle Tuschefläche (Nüstern, Schlund). */
  inkFill(d, opacity = 0.9) {
    this.lines.push(`<path d="${d}" fill="${INK}" opacity="${opacity}"/>`);
  }

  /** Leuchtendes Auge — der einzige Farbakzent. */
  eye(x, y, r = 1.5) {
    this.eyes.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="${this.color}" opacity="0.35" filter="url(#glow)"/>`,
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${this.color}" stroke="${INK}" stroke-width="0.5"/>`,
      `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.35)}" fill="#fff6d8"/>`,
    );
  }
}

// ───────────────────────── Silhouetten-Familien ─────────────────────────
// Jede Familie zeichnet nach rechts blickend um (cx, ground). Gespiegelt wird später per transform.

/** Körperbau der Vierbeiner-Arten. */
const QUAD = {
  wolf: { bw: [17, 21], bh: [8, 10], legH: [12, 15], heavy: false, ears: "pointed", snout: [6, 9], head: [5.5, 7], tail: "bushy", mane: 0.6, spots: false },
  bear: { bw: [19, 23], bh: [11, 13], legH: [8, 11], heavy: true, ears: "round", snout: [3, 5], head: [7, 8.5], tail: "stub", mane: 0.2, spots: false },
  boar: { bw: [17, 21], bh: [9, 11], legH: [7, 9], heavy: true, ears: "small", snout: [5, 7], head: [6, 7.5], tail: "curl", mane: 1, spots: false },
  lynx: { bw: [15, 18], bh: [8, 9.5], legH: [13, 16], heavy: false, ears: "tufted", snout: [2.5, 3.5], head: [5.5, 6.5], tail: "stub", mane: 0.1, spots: true },
  hyena: { bw: [16, 19], bh: [9, 11], legH: [12, 15], heavy: false, ears: "round", snout: [5, 7], head: [6, 7], tail: "thin", mane: 0.9, spots: true },
  pup: { bw: [11, 13], bh: [7, 8], legH: [7, 9], heavy: false, ears: "big", snout: [3, 4], head: [6, 7], tail: "thin", mane: 0, spots: false },
};

/** Art aus dem Kartennamen ableiten (damit „Keiler“ wie ein Keiler aussieht). */
const SPECIES_RULES = [
  [/keiler|bache|rotte|frischling/, "boar"], [/bär|baer|braer/, "bear"], [/luchs/, "lynx"], [/hyän|hyaen/, "hyena"], [/welpe/, "pup"],
  [/eule|kauz|uhu/, "owl"], [/reiher/, "heron"], [/geier/, "vulture"], [/krähe|kraehe|rabe/, "crow"], [/segler|ziegenmelker|schwalbe/, "swift"], [/fink|sperling/, "finch"],
  [/käfer|kaefer/, "beetle"], [/wespe|hornisse/, "wasp"], [/ameise|termite/, "ant"], [/larve|knäuel|kadaver/, "larva"],
  [/aal/, "eel"], [/krake/, "squid"], [/krebs/, "crab"], [/qualle/, "jelly"], [/wels|grundel|hecht/, "fish"],
  [/laich/, "eggs"], [/kröte|kroete|unke|frosch/, "toad"], [/echse|salamander/, "lizard"], [/natter|otter|häutige|haeutige|schleicher/, "snake"],
  [/maulwurf/, "mole"], [/schläfer|schlaefer|bilch/, "dormouse"],
  [/raupe/, "caterpillar"], [/fledermaus|flughund|blutsauger/, "bat"],
  [/stumpf|knorr|wall/, "stump"], [/kapsel|samen/, "pod"],
  [/haufen/, "pile"], [/schädel|schaedel/, "skull"], [/grabhund|knochenhund|dachs/, "dog"],
  [/widder|bock/, "ram"], [/elch/, "elk"], [/kalb|kitz/, "fawn"], [/hirsch/, "deer"],
  [/scheuche/, "scarecrow"], [/glocke/, "bell"], [/spiegel|glas/, "mirror"], [/puppe/, "doll"], [/uhr|automat|aufzieh|kartograph/, "automaton"], [/golem|rüstung|ruestung/, "golem"], [/klecks|herz/, "blob"],
];

/** @param {{ id: string, name?: string }} card */
export function speciesOf(card) {
  const key = `${card.name || ""} ${card.id}`.toLowerCase();
  for (const [re, sp] of SPECIES_RULES) if (re.test(key)) return sp;
  return null;
}

/** @type {Record<string, (s: {rng:number}, k: Sketch, g: {cx:number, ground:number}, v: string|null) => void>} */
const FAMILIES = {
  quadruped(s, k, g, v) {
    // Arten: Wolf, Bär, Keiler, Luchs, Hyäne, Welpe (aus dem Kartennamen), sonst per Seed
    const sp = v && QUAD[v] ? v : pick(s, ["wolf", "wolf", "bear", "boar", "lynx", "hyena"]);
    const Q = QUAD[sp];
    const bw = rr(s, Q.bw[0], Q.bw[1]);
    const bh = rr(s, Q.bh[0], Q.bh[1]);
    const legH = rr(s, Q.legH[0], Q.legH[1]);
    const by = g.ground - legH - bh * 0.4;
    const bx = g.cx - 4;
    const heavy = Q.heavy;
    // Schwanz
    if (Q.tail === "bushy") {
      const tail = [[bx - bw * 0.9, by - 2], [bx - bw - rr(s, 4, 7), by - rr(s, 0, 6)], [bx - bw - rr(s, 7, 12), by + rr(s, 2, 8)]];
      k.shape(`${smoothOpen(tail)}L${f(tail[2][0] + 3)} ${f(tail[2][1] - 1)}Q${f(bx - bw - 3)} ${f(by + 1)} ${f(bx - bw * 0.85)} ${f(by + 2)}Z`, { layer: "back" });
    } else if (Q.tail === "curl") {
      k.line(`M${f(bx - bw * 0.95)} ${f(by - 1)}c-3 -1 -4 -4 -2 -5c2 -1 3 1 1 2`, 0.9);
    } else if (Q.tail === "stub") {
      k.shape(blob(s, bx - bw * 0.97, by - bh * 0.3, 2.4, 2, 6, 0.1), { layer: "back" });
    } else {
      k.line(smoothOpen([[bx - bw * 0.9, by - 2], [bx - bw - 5, by - 4], [bx - bw - 9, by + 3]]), 1.8);
    }
    const legW = heavy ? 2.6 : 1.8;
    /** Hinterbein: Keule, Unterschenkel nach hinten, Mittelfuß nach vorn, Pfote. */
    const hind = (x, layer) => {
      const dark = layer === "back";
      k.shape(blob(s, x, by + bh * 0.25, bh * 0.45, bh * 0.75, 7, 0.08, 0.2), { dark, layer });
      const knee = [x - 1.5, by + bh * 0.85];
      const hock = [x - rr(s, 2, 4) * (heavy ? 0.5 : 1), by + bh * 0.45 + legH * 0.55];
      const paw = [x - 1, g.ground - 0.8];
      k.shape(taper(knee[0], knee[1], hock[0], hock[1], legW * 1.25, legW * 0.85), { dark, layer });
      k.shape(taper(hock[0], hock[1], paw[0], paw[1], legW * 0.85, legW * 0.65), { dark, layer });
      k.shape(sp === "boar" ? `M${f(paw[0] - 1)} ${f(g.ground - 1.5)}l1.2 1.8l1.2 -1.8z` : blob(s, paw[0] + 1.2, g.ground - 0.6, heavy ? 2.8 : 2.2, 1.1, 6, 0.05), { dark, layer });
    };
    /** Vorderbein: Schulter, Unterarm, Pfote. */
    const fore = (x, layer) => {
      const dark = layer === "back";
      const elbow = [x + 0.5, by + bh * 0.55 + legH * 0.3];
      const paw = [x + rr(s, 0, 2), g.ground - 0.8];
      k.shape(taper(x, by + bh * 0.2, elbow[0], elbow[1], legW * 1.35, legW * 0.9), { dark, layer });
      k.shape(taper(elbow[0], elbow[1], paw[0], paw[1], legW * 0.9, legW * 0.65), { dark, layer });
      k.shape(sp === "boar" ? `M${f(paw[0] - 1)} ${f(g.ground - 1.5)}l1.2 1.8l1.2 -1.8z` : blob(s, paw[0] + 1.2, g.ground - 0.6, heavy ? 2.8 : 2.2, 1.1, 6, 0.05), { dark, layer });
    };
    hind(bx - bw * 0.58, "back");
    fore(bx + bw * 0.52, "back");
    // Körper: Hyäne mit abfallendem Rücken, Bär mit Buckel, Keiler keilförmig
    const tilt = sp === "hyena" ? -0.16 : sp === "boar" ? -0.05 : rr(s, -0.08, 0.05);
    k.shape(blob(s, bx, by, bw, bh, 11, 0.08, tilt));
    if (sp === "bear") k.shape(blob(s, bx + bw * 0.35, by - bh * 0.55, bw * 0.4, bh * 0.45, 8, 0.06));
    k.line(`M${f(bx - bw * 0.6)} ${f(by + bh * 0.55)}Q${f(bx)} ${f(by + bh * 0.95)} ${f(bx + bw * 0.6)} ${f(by + bh * 0.5)}`, 0.5, 0.6);
    hind(bx - bw * 0.45, "body");
    fore(bx + bw * 0.7, "body");
    if (sp !== "boar") for (const px of [bx - bw * 0.45, bx + bw * 0.7]) k.line(`M${f(px + 2.8)} ${f(g.ground - 0.2)}l1 0.6M${f(px + 2.4)} ${f(g.ground + 0.2)}l0.9 0.8`, 0.5);
    // Rückenkamm, Borsten oder Mähne
    if (chance(s, Q.mane)) {
      const n = sp === "boar" ? ri(s, 10, 14) : ri(s, 5, 9);
      let d = "";
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = bx - bw * 0.7 + t * bw * 1.3;
        const y = by - bh * (0.85 + 0.1 * Math.sin(t * Math.PI)) + (sp === "hyena" ? (t - 0.5) * -4 : 0);
        d += `M${f(x)} ${f(y + 1)}l${f(rr(s, -1, 1.5))} ${f(-rr(s, 2, sp === "boar" ? 4 : 5))}`;
      }
      k.line(d, sp === "boar" ? 0.8 : 1);
    }
    // Flecken (Luchs, Hyäne)
    if (Q.spots) {
      let sd = "";
      for (let i = 0; i < 10; i++) sd += `M${f(bx + rr(s, -bw * 0.75, bw * 0.7))} ${f(by + rr(s, -bh * 0.6, bh * 0.5))}a${f(rr(s, 0.7, 1.4))} ${f(rr(s, 0.6, 1.1))} 0 1 0 0.1 0`;
      k.inkFill(sd, 0.55);
    }
    // Hals + Kopf
    const low = sp === "boar" || sp === "bear";
    const hx = bx + bw * 0.95 + rr(s, 1, 4) * (low ? 0.4 : 1);
    const hy = by - bh * (low ? rr(s, 0.1, 0.35) : rr(s, 0.6, 1.1));
    const hr = rr(s, Q.head[0], Q.head[1]);
    k.shape(taper(bx + bw * 0.6, by - 2, hx - 2, hy + 1, bh * 0.55, hr * 0.7), { layer: "back" });
    if (sp === "hyena" || sp === "lynx") k.shape(blob(s, hx - hr * 0.6, hy + hr * 0.4, hr * 0.7, hr * 0.5, 7, 0.1), { layer: "back" });
    k.shape(blob(s, hx, hy, hr, hr * 0.85, 8, 0.1));
    // Schnauze
    const snL = rr(s, Q.snout[0], Q.snout[1]);
    k.shape(`M${f(hx + hr * 0.4)} ${f(hy - hr * 0.35)}Q${f(hx + hr + snL)} ${f(hy - 1)} ${f(hx + hr + snL)} ${f(hy + 1.5)}Q${f(hx + hr)} ${f(hy + hr * 0.8)} ${f(hx + hr * 0.2)} ${f(hy + hr * 0.6)}Z`);
    if (sp === "boar") {
      k.shape(blob(s, hx + hr + snL, hy + 0.8, 1.2, 2.2, 6, 0.04));
      k.inkFill(`M${f(hx + hr + snL - 0.3)} ${f(hy)}a0.4 0.6 0 1 0 0.1 0zM${f(hx + hr + snL - 0.3)} ${f(hy + 1.6)}a0.4 0.6 0 1 0 0.1 0z`);
      // Hauer
      k.lines.push(`<path d="M${f(hx + hr + snL - 3)} ${f(hy + 2.2)}q2 0 2.5 -4" fill="none" stroke="#1a1612" stroke-width="2.2" stroke-linecap="round"/><path d="M${f(hx + hr + snL - 3)} ${f(hy + 2.2)}q2 0 2.5 -4" fill="none" stroke="#efe6d0" stroke-width="1.2" stroke-linecap="round"/>`);
    } else {
      k.inkFill(`M${f(hx + hr + snL - 1.2)} ${f(hy)}a1 0.8 0 1 0 0.1 0z`);
      if (chance(s, 0.6)) k.line(`M${f(hx + hr + 1)} ${f(hy + 2.6)}l0.6 1.6l0.6 -1.4l0.6 1.5`, 0.6);
    }
    // Ohren
    for (const dx of [-2.5, 1]) {
      const ex = hx + dx;
      const ey = hy - hr * 0.8;
      if (Q.ears === "round") k.shape(blob(s, ex, ey - 1.5, 2.2, 2.4, 6, 0.1));
      else if (Q.ears === "small") k.shape(`M${f(ex - 1.5)} ${f(ey + 1)}L${f(ex - 3)} ${f(ey - 3)}L${f(ex + 1.5)} ${f(ey + 0.5)}Z`);
      else k.shape(`M${f(ex - 2)} ${f(ey + 1)}L${f(ex + rr(s, -1, 1))} ${f(ey - rr(s, Q.ears === "big" ? 8 : 5, Q.ears === "big" ? 10 : 8))}L${f(ex + 2.2)} ${f(ey + 1)}Z`);
      if (Q.ears === "tufted") k.line(`M${f(ex)} ${f(ey - 7)}l0.3 -3.5`, 0.8);
    }
    // Augen (1–3)
    const nEyes = pick(s, [1, 1, 1, 2, 3]);
    for (let i = 0; i < nEyes; i++) k.eye(hx + hr * 0.35 - i * 2.2, hy - hr * 0.2 - (i % 2) * 1.6, i === 0 ? 1.5 : 1);
    // Fellstriche
    let fur = "";
    for (let i = 0; i < (heavy ? 14 : 9); i++) {
      const x = bx + rr(s, -bw * 0.8, bw * 0.8);
      const y = by + rr(s, -bh * 0.6, bh * 0.6);
      fur += `M${f(x)} ${f(y)}l${f(rr(s, -2.5, -1))} ${f(rr(s, 0.5, 2))}`;
    }
    k.line(fur, 0.5, 0.7);
  },

  horned(s, k, g, v) {
    // Hirsch/Bock: hochbeiniger Vierbeiner mit Geweih oder Widderhörnern
    const bw = rr(s, 15, 19);
    const bh = rr(s, 8, 10);
    const legH = rr(s, 15, 19);
    const by = g.ground - legH - bh * 0.3;
    const bx = g.cx - 5;
    k.line(`M${f(bx - bw)} ${f(by - 2)}q-3 -1 -3 -4`, 1.6);
    for (const [ox, dark] of [[-0.6, true], [0.62, true], [-0.35, false], [0.85, false]]) {
      const x = bx + bw * /** @type {number} */ (ox);
      k.shape(jointLeg(x, by + 2, x + (ox > 0 ? 1.5 : -1.5), by + legH * 0.55, x + rr(s, -1, 1), g.ground, 1.4), { dark: /** @type {boolean} */ (dark), layer: dark ? "back" : "body" });
      if (!dark) k.inkFill(`M${f(x - 1.2)} ${f(g.ground)}h2.6l-0.4 -1.6h-1.8z`);
    }
    k.shape(blob(s, bx, by, bw, bh, 10, 0.08, -0.05));
    const hx = bx + bw + rr(s, 4, 7);
    const hy = by - rr(s, 10, 15);
    k.shape(taper(bx + bw * 0.6, by - 2, hx - 1, hy + 2, 4.2, 2.8), { layer: "back" });
    k.shape(`M${f(hx - 3)} ${f(hy - 3)}Q${f(hx + 2)} ${f(hy - 5)} ${f(hx + 9)} ${f(hy + 2)}Q${f(hx + 8)} ${f(hy + 5)} ${f(hx + 4)} ${f(hy + 4)}Q${f(hx - 2)} ${f(hy + 5)} ${f(hx - 3)} ${f(hy - 3)}Z`);
    k.inkFill(`M${f(hx + 8)} ${f(hy + 1.8)}a0.9 0.7 0 1 0 0.1 0z`);
    k.eye(hx + 2, hy - 1.2, 1.3);
    // Ohr
    k.shape(`M${f(hx - 2)} ${f(hy - 2)}l-5 -2l3 4z`);
    const kind = v === "ram" ? "ram" : v === "fawn" ? "none" : v === "elk" ? "palm" : v === "deer" ? "antler" : pick(s, ["antler", "antler", "ram", "spire"]);
    if (kind === "none") {
      let spots = "";
      for (let i = 0; i < 8; i++) spots += `M${f(bx + rr(s, -bw * 0.7, bw * 0.6))} ${f(by + rr(s, -bh * 0.5, bh * 0.3))}a0.9 0.7 0 1 0 0.1 0`;
      k.line(spots, 0.8, 0.9);
      return;
    }
    if (kind === "palm") {
      for (const side of [-1, 1]) {
        k.shape(`M${f(hx)} ${f(hy - 4)}L${f(hx + side * 4)} ${f(hy - 8)}Q${f(hx + side * 14)} ${f(hy - 12)} ${f(hx + side * 13)} ${f(hy - 20)}l${f(-side * 2)} 2l-1 -3l${f(-side * 2)} 3l-1 -3l${f(-side * 2)} 3Q${f(hx + side * 6)} ${f(hy - 12)} ${f(hx)} ${f(hy - 5)}Z`, { layer: side < 0 ? "back" : "body" });
      }
      return;
    }
    if (kind === "ram") {
      k.shape(`M${f(hx - 1)} ${f(hy - 3)}c-6 -6 -12 1 -8 5c3 3 6 0 4 -2c-2 1 -4 0 -3 -2c1 -2 5 -3 7 -1z`, { w: 1.6 });
      k.line(`M${f(hx - 2)} ${f(hy - 4)}c-5 -4 -9 1 -6 3`, 0.6);
    } else if (kind === "spire") {
      for (const dx of [-1.5, 1]) k.shape(taper(hx + dx, hy - 4, hx + dx + rr(s, -3, 1), hy - rr(s, 16, 22), 1.2, 0.2));
    } else {
      // Geweih: verzweigte Linien
      const branch = (x, y, ang, len, depth) => {
        const x2 = x + Math.cos(ang) * len;
        const y2 = y + Math.sin(ang) * len;
        k.line(`M${f(x)} ${f(y)}L${f(x2)} ${f(y2)}`, 0.6 + depth * 0.45);
        if (depth > 0) {
          branch(x2, y2, ang - rr(s, 0.3, 0.6), len * 0.7, depth - 1);
          if (chance(s, 0.8)) branch(x2, y2, ang + rr(s, 0.3, 0.6), len * 0.6, depth - 1);
        }
      };
      branch(hx - 1, hy - 4, -Math.PI / 2 - 0.5, rr(s, 6, 8), 3);
      branch(hx + 1, hy - 4, -Math.PI / 2 + 0.2, rr(s, 5, 7), 3);
    }
  },

  bird(s, k, g, v) {
    const sp = ["owl", "heron", "vulture", "crow", "swift", "finch"].includes(v) ? v : pick(s, ["owl", "crow", "finch", "swift"]);
    const heron = sp === "heron";
    const perch = g.ground - 2;
    if (heron) {
      let wl = "";
      for (let i = 0; i < 3; i++) wl += `M${f(g.cx - 34 + i * 20)} ${f(g.ground - 1 + i)}q5 -1.5 10 0t10 0`;
      k.line(wl, 0.6, 0.6);
    } else {
      k.shape(`M${f(g.cx - 34)} ${f(perch)}Q${f(g.cx)} ${f(perch - 3)} ${f(g.cx + 34)} ${f(perch + 1)}L${f(g.cx + 34)} ${f(perch + 3.2)}Q${f(g.cx)} ${f(perch)} ${f(g.cx - 34)} ${f(perch + 2.4)}Z`, { dark: true, layer: "back" });
    }
    const size = { owl: [9, 11, 12, 15], heron: [7, 9, 9, 11], vulture: [11, 13, 14, 16], crow: [8, 10, 11, 13], swift: [6, 8, 8, 10], finch: [6.5, 8, 8, 10] }[sp];
    const bw = rr(s, size[0], size[1]);
    const bh = rr(s, size[2], size[3]);
    const legLen = heron ? rr(s, 16, 20) : 0;
    const bx = g.cx - 2;
    const by = (heron ? g.ground - legLen : perch) - bh * 1.05 - (heron ? 0 : rr(s, 3, 6));
    const dark = sp === "crow" || sp === "vulture";
    const spread = sp === "swift" || (sp === "crow" && chance(s, 0.35)) || (sp === "vulture" && chance(s, 0.4)) || (sp === "owl" && chance(s, 0.3));
    // Schwanzfedern
    const tl = heron ? rr(s, 5, 8) : sp === "swift" ? rr(s, 12, 16) : rr(s, 8, 14);
    for (let i = -1; i <= 1; i++) k.shape(taper(bx - bw * 0.3, by + bh * 0.7, bx - bw * 0.3 - tl * 0.6 + i * (sp === "swift" ? 5 : 3), by + bh * 0.7 + tl, 2.2, sp === "swift" ? 0.4 : 1.1), { layer: "back", dark });
    if (spread) {
      for (const side of [-1, 1]) {
        const wx = bx + side * 2;
        const wy = by - 2;
        const span = rr(s, 24, 34) * (sp === "vulture" ? 1.1 : 1);
        const tip = [wx + side * span, wy - rr(s, sp === "swift" ? 4 : 12, sp === "swift" ? 8 : 20)];
        const d = `M${f(wx)} ${f(wy)}Q${f(wx + side * span * 0.5)} ${f(wy - 18)} ${f(tip[0])} ${f(tip[1])}` +
          `L${f(tip[0] - side * 4)} ${f(tip[1] + 6)}L${f(tip[0] - side * 3)} ${f(tip[1] + 9)}L${f(tip[0] - side * 8)} ${f(tip[1] + 12)}` +
          `L${f(tip[0] - side * 9)} ${f(tip[1] + 16)}Q${f(wx + side * span * 0.4)} ${f(wy + 4)} ${f(wx)} ${f(wy + 8)}Z`;
        k.shape(d, { layer: side < 0 ? "back" : "body", dark });
        let fe = "";
        for (let i = 1; i < 6; i++) fe += `M${f(wx + side * i * 3.5)} ${f(wy + 2)}l${f(side * 5)} ${f(-6 - i)}`;
        k.line(fe, 0.5, 0.8);
      }
    }
    // Beine
    if (heron) {
      k.line(`M${f(bx - 1)} ${f(by + bh)}l-1 ${f(legLen * 0.5)}l1 ${f(legLen * 0.5)}l-2 0.6M${f(bx + 2)} ${f(by + bh)}l1 ${f(legLen * 0.5)}l-0.5 ${f(legLen * 0.5)}l2 0.6`, 0.8);
    }
    k.shape(blob(s, bx, by + bh * 0.2, bw, bh, 9, 0.08), { dark });
    if (!spread) {
      const d = `M${f(bx - 1)} ${f(by - bh * 0.4)}Q${f(bx + bw * 0.6)} ${f(by)} ${f(bx - bw * 0.4)} ${f(by + bh * 1.1)}Q${f(bx - bw * 1.2)} ${f(by + bh * 0.5)} ${f(bx - 1)} ${f(by - bh * 0.4)}Z`;
      k.shape(d, { dark });
      let fe = "";
      for (let i = 0; i < 4; i++) fe += `M${f(bx - bw * 0.2 - i * 1.3)} ${f(by + i * 2.5)}q-2 3 -3 7`;
      k.line(fe, 0.5, 0.8);
    }
    let br = "";
    for (let i = 0; i < 6; i++) br += `M${f(bx + rr(s, 0, bw * 0.7))} ${f(by + rr(s, 0, bh))}q1 1 2 0`;
    k.line(br, 0.5, 0.8);
    // Hals und Kopf
    let hr = rr(s, 5, 7);
    if (sp === "finch" || sp === "swift") hr = rr(s, 3.8, 4.6);
    if (sp === "vulture") hr = rr(s, 3.2, 4);
    let hx = bx + bw * 0.35;
    let hy = by - bh * 0.75 - hr * 0.4;
    if (heron) {
      const nx = bx + bw * 0.5;
      const ny = by - bh * 0.4;
      hx = nx + rr(s, 4, 7);
      hy = ny - rr(s, 16, 20);
      const neck = `M${f(nx)} ${f(ny)}C${f(nx + 8)} ${f(ny - 5)} ${f(nx - 4)} ${f(hy + 8)} ${f(hx - 1)} ${f(hy + 1)}`;
      k.back.push(`<path d="${neck}" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="${neck}" fill="none" stroke="${PAPER}" stroke-width="2.4" stroke-linecap="round"/>`);
    }
    if (sp === "vulture") {
      k.shape(blob(s, hx - 1, hy + hr * 1.3, hr * 1.8, hr * 1.1, 10, 0.18), { dark: false });
      let ruff = "";
      for (let i = 0; i < 8; i++) ruff += `M${f(hx - 1 + rr(s, -hr * 1.6, hr * 1.6))} ${f(hy + hr * 1.3 + rr(s, -1, 1.5))}l${f(rr(s, -1, 1))} 2`;
      k.line(ruff, 0.5, 0.8);
    }
    k.shape(blob(s, hx, hy, hr, hr * 0.95, 8, 0.08), { dark: dark && sp !== "vulture" });
    if (sp === "owl") {
      k.shape(`M${f(hx - hr)} ${f(hy - hr * 0.5)}l-1 -5l4 3zM${f(hx + hr)} ${f(hy - hr * 0.5)}l1 -5l-4 3z`);
      k.line(`M${f(hx)} ${f(hy - hr * 0.6)}v${f(hr * 0.8)}M${f(hx - hr * 0.8)} ${f(hy - 0.5)}a${f(hr * 0.45)} ${f(hr * 0.45)} 0 1 0 ${f(hr * 0.8)} 0M${f(hx + hr * 0.02)} ${f(hy - 0.5)}a${f(hr * 0.45)} ${f(hr * 0.45)} 0 1 0 ${f(hr * 0.8)} 0`, 0.5, 0.6);
      k.eye(hx - hr * 0.42, hy - 0.5, 1.5);
      k.eye(hx + hr * 0.42, hy - 0.5, 1.5);
      k.inkFill(`M${f(hx - 1)} ${f(hy + 1.5)}l1 2.5l1 -2.5z`);
    } else {
      const bl = { heron: rr(s, 11, 14), crow: rr(s, 6, 8), vulture: rr(s, 4, 5), swift: rr(s, 2.5, 3.5), finch: rr(s, 2.5, 3.5) }[sp] ?? rr(s, 4, 9);
      if (sp === "vulture") k.shape(`M${f(hx + hr * 0.7)} ${f(hy - 1.5)}Q${f(hx + hr + bl)} ${f(hy - 2)} ${f(hx + hr + bl)} ${f(hy + 2.5)}L${f(hx + hr + bl - 1.2)} ${f(hy + 1.2)}L${f(hx + hr * 0.7)} ${f(hy + 1.8)}Z`);
      else k.shape(`M${f(hx + hr * 0.7)} ${f(hy - 1.5)}L${f(hx + hr + bl)} ${f(hy + rr(s, 0, 2))}L${f(hx + hr * 0.7)} ${f(hy + 1.8)}Z`, { dark: sp === "crow" });
      if (heron) k.line(`M${f(hx - hr)} ${f(hy - 1)}q-5 -1 -8 2`, 0.7);
      k.eye(hx + hr * 0.25, hy - 1, sp === "finch" || sp === "swift" ? 1.1 : 1.3);
    }
    if (!heron) k.line(`M${f(bx - 2)} ${f(by + bh * 1.1)}v${f(perch - by - bh * 1.1)}l-1.5 1M${f(bx + 2)} ${f(by + bh * 1.1)}v${f(perch - by - bh * 1.1)}l1.5 1`, 0.8);
  },

  fish(s, k, g, v) {
    const kind = ["fish", "eel", "squid", "crab", "jelly"].includes(v) ? v : pick(s, ["fish", "fish", "eel", "squid", "crab"]);
    const cy = g.ground - 22;
    // Wasserlinien
    let wl = "";
    for (let i = 0; i < 4; i++) {
      const y = 12 + i * 15 + rr(s, -3, 3);
      wl += `M${f(rr(s, 2, 20))} ${f(y)}q6 -2 12 0t12 0`;
      wl += `M${f(rr(s, 60, 80))} ${f(y + 6)}q5 -2 10 0t10 0`;
    }
    k.lines.push(`<path d="${wl}" fill="none" stroke="${INK}" stroke-width="0.45" opacity="0.35"/>`);
    if (kind === "eel") {
      const pts = [];
      const amp = rr(s, 5, 9);
      for (let i = 0; i <= 8; i++) pts.push([g.cx - 36 + i * 9, cy + Math.sin(i * 0.9 + rr(s, 0, 1)) * amp]);
      k.line(smoothOpen(pts), rr(s, 7, 9));
      k.lines.pop();
      k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="${INK}" stroke-width="${f(9.5)}" stroke-linecap="round"/>`);
      k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="${PAPER}" stroke-width="7.2" stroke-linecap="round"/>`);
      k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="url(#hatch)" stroke-width="7.2" stroke-linecap="round" mask="url(#shadeMask)"/>`);
      const [hx, hy] = pts[pts.length - 1];
      k.line(smoothOpen(pts.map(([x, y]) => [x, y - 2.5])), 0.5, 0.6);
      k.eye(hx - 1, hy - 1.5, 1.4);
      k.inkFill(`M${f(hx + 2)} ${f(hy + 0.5)}l2 1.5l-2.5 0.5z`);
      return;
    }
    if (kind === "jelly") {
      const hx = g.cx;
      const hy = cy - 10;
      for (let i = 0; i < 9; i++) {
        const x0 = hx - 12 + i * 3;
        const pts = [[x0, hy + 4]];
        for (let j = 1; j <= 5; j++) pts.push([x0 + Math.sin(j * 1.3 + i) * 2.5, hy + 4 + j * 6.5]);
        k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="${INK}" stroke-width="${i % 3 === 1 ? 1.1 : 0.6}" opacity="0.8"/>`);
      }
      k.back.push(`<path d="M${f(hx - 15)} ${f(hy + 5)}C${f(hx - 16)} ${f(hy - 18)} ${f(hx + 16)} ${f(hy - 18)} ${f(hx + 15)} ${f(hy + 5)}Q${f(hx)} ${f(hy + 1)} ${f(hx - 15)} ${f(hy + 5)}Z" fill="${PAPER}" opacity="0.7" stroke="${INK}" stroke-width="1.1"/>`);
      k.line(`M${f(hx - 9)} ${f(hy + 2)}Q${f(hx - 8)} ${f(hy - 10)} ${f(hx)} ${f(hy - 11)}M${f(hx + 9)} ${f(hy + 2)}Q${f(hx + 8)} ${f(hy - 10)} ${f(hx)} ${f(hy - 11)}`, 0.5, 0.6);
      k.eye(hx - 4, hy - 3, 1.2);
      k.eye(hx + 4, hy - 3, 1.2);
      return;
    }
    if (kind === "squid") {
      const hx = g.cx;
      const hy = cy - 6;
      for (let i = 0; i < 7; i++) {
        const x0 = hx - 9 + i * 3;
        const pts = [[x0, hy + 8]];
        let x = x0;
        for (let j = 1; j <= 4; j++) {
          x += rr(s, -5, 5);
          pts.push([x, hy + 8 + j * 6]);
        }
        k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="${INK}" stroke-width="${f(2.6 - i * 0.05)}" stroke-linecap="round"/>`);
        k.back.push(`<path d="${smoothOpen(pts)}" fill="none" stroke="${PAPER}" stroke-width="1.3" stroke-linecap="round"/>`);
      }
      k.shape(`M${f(hx - 11)} ${f(hy + 9)}C${f(hx - 13)} ${f(hy - 12)} ${f(hx - 4)} ${f(hy - 24)} ${f(hx)} ${f(hy - 25)}C${f(hx + 4)} ${f(hy - 24)} ${f(hx + 13)} ${f(hy - 12)} ${f(hx + 11)} ${f(hy + 9)}Z`);
      let spots = "";
      for (let i = 0; i < 6; i++) spots += `M${f(hx + rr(s, -7, 7))} ${f(hy + rr(s, -18, 2))}a1 1 0 1 0 0.1 0`;
      k.line(spots, 0.6, 0.8);
      k.eye(hx - 4.5, hy + 3, 1.6);
      k.eye(hx + 4.5, hy + 3, 1.6);
      return;
    }
    if (kind === "crab") {
      const bx = g.cx;
      const by = g.ground - 12;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) k.shape(jointLeg(bx + side * 6, by + 2 + i, bx + side * (14 + i * 2), by - 4 + i * 2, bx + side * (18 + i * 2), g.ground, 0.9), { layer: "back" });
        const cxp = bx + side * 17;
        const cyp = by - 14;
        k.shape(jointLeg(bx + side * 7, by - 3, bx + side * 12, by - 12, cxp, cyp, 1.6));
        k.shape(`M${f(cxp)} ${f(cyp + 3)}c${f(side * 8)} -2 ${f(side * 8)} -10 0 -9c${f(side * 4)} 2 ${f(side * 4)} 5 0 5c${f(side * 5)} 0 ${f(side * 3)} 5 0 4z`);
      }
      k.shape(`M${f(bx - 12)} ${f(by)}Q${f(bx)} ${f(by - 16)} ${f(bx + 12)} ${f(by)}Q${f(bx)} ${f(by + 6)} ${f(bx - 12)} ${f(by)}Z`);
      k.line(`M${f(bx - 2)} ${f(by - 7)}l-1.5 -5M${f(bx + 2)} ${f(by - 7)}l1.5 -5`, 0.7);
      k.eye(bx - 3.5, by - 12, 1.2);
      k.eye(bx + 3.5, by - 12, 1.2);
      return;
    }
    // Fisch
    const bw = rr(s, 22, 30);
    const bh = rr(s, 9, 14);
    const bx = g.cx - 3;
    k.shape(`M${f(bx - bw * 0.9)} ${f(cy)}L${f(bx - bw - 10)} ${f(cy - rr(s, 7, 11))}Q${f(bx - bw - 6)} ${f(cy)} ${f(bx - bw - 10)} ${f(cy + rr(s, 7, 11))}Z`, { layer: "back" });
    k.shape(`M${f(bx - bw * 0.3)} ${f(cy - bh * 0.8)}Q${f(bx)} ${f(cy - bh - rr(s, 5, 10))} ${f(bx + bw * 0.3)} ${f(cy - bh * 0.85)}Z`, { layer: "back" });
    k.shape(`M${f(bx - bw)} ${f(cy)}Q${f(bx - bw * 0.3)} ${f(cy - bh * 1.2)} ${f(bx + bw * 0.6)} ${f(cy - bh * 0.5)}Q${f(bx + bw)} ${f(cy - 1)} ${f(bx + bw)} ${f(cy + 1)}Q${f(bx + bw * 0.6)} ${f(cy + bh * 0.8)} ${f(bx - bw * 0.3)} ${f(cy + bh * 0.9)}Q${f(bx - bw * 0.8)} ${f(cy + bh * 0.4)} ${f(bx - bw)} ${f(cy)}Z`);
    k.line(`M${f(bx + bw * 0.45)} ${f(cy - bh * 0.5)}q-3 ${f(bh * 0.5)} 0 ${f(bh * 1.1)}`, 0.8);
    let sc = "";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) sc += `M${f(bx - bw * 0.6 + c * 5 + (r % 2) * 2.5)} ${f(cy - bh * 0.4 + r * 3.5)}q1.5 1.8 3 0`;
    k.line(sc, 0.45, 0.7);
    k.inkFill(`M${f(bx + bw - 1)} ${f(cy + 2)}l-3 0.5l3 1z`);
    if (chance(s, 0.5)) k.line(`M${f(bx + bw - 2)} ${f(cy + 2)}q4 3 2 9M${f(bx + bw - 3)} ${f(cy + 2.5)}q2 4 -1 8`, 0.6);
    k.eye(bx + bw * 0.65, cy - 2.5, 1.6);
  },

  insect(s, k, g, v) {
    const sp = ["ant", "wasp", "beetle", "larva"].includes(v) ? v : pick(s, ["ant", "wasp", "beetle"]);
    const cx = g.cx;
    const cy = g.ground - 18;
    if (sp === "larva") {
      // Madenwurm: Segmente auf einem Bogen
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.95 + (i / (n - 1)) * 1.05);
        const r = 17;
        const x = cx + Math.cos(a) * r * 1.2;
        const y = g.ground - 8 + Math.sin(a) * r * 0.9;
        k.shape(blob(s, x, y, 4.5 - i * 0.18, 5 - i * 0.2, 7, 0.06), { layer: i < 4 ? "back" : "body" });
      }
      const hx = cx + Math.cos(Math.PI * 2) * 17 * 1.2;
      k.eye(hx - 1, g.ground - 10, 1.1);
      k.eye(hx + 1.5, g.ground - 9, 0.8);
      k.line(`M${f(hx + 3)} ${f(g.ground - 7)}l2 1.5l-2 1`, 0.7);
      return;
    }
    const winged = sp === "wasp" || (sp === "ant" && chance(s, 0.2));
    if (winged) {
      for (const side of [-1, 1]) {
        k.back.push(`<path d="${blob(s, cx + side * 11, cy - 12, 13, 5, 8, 0.05, side * -0.5)}" fill="${PAPER}" opacity="0.55" stroke="${INK}" stroke-width="0.7"/>`);
        k.back.push(`<path d="M${f(cx)} ${f(cy - 5)}L${f(cx + side * 22)} ${f(cy - 20)}M${f(cx + side * 8)} ${f(cy - 9)}l${f(side * 4)} -9" fill="none" stroke="${INK}" stroke-width="0.4" opacity="0.6"/>`);
      }
    }
    // Beine (6, gelenkig)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const ax = cx + side * 3;
        const ay = cy - 1 + i * 3;
        const kx = cx + side * rr(s, 11, 16);
        const ky = cy - rr(s, 6, 1) + i * 3;
        const fx = cx + side * rr(s, 16, 24);
        const fy = g.ground - (i === 1 ? 0 : rr(s, 0, 2));
        k.back.push(`<path d="M${f(ax)} ${f(ay)}L${f(kx)} ${f(ky - 3)}L${f(fx)} ${f(fy)}l${f(side * 1.5)} 0.4" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
    // Hinterleib, Brust, Kopf
    const al = sp === "beetle" ? rr(s, 13, 16) : rr(s, 10, 15);
    const ah = sp === "beetle" ? rr(s, 9, 11) : rr(s, 6, 8);
    k.shape(blob(s, cx - 13, cy + 2, al, ah, 10, 0.06));
    if (sp === "beetle") {
      // Deckflügel mit Naht und Glanzlicht
      k.line(`M${f(cx - 1)} ${f(cy + 2)}L${f(cx - 13 - al * 0.95)} ${f(cy + 2)}`, 0.9);
      k.line(`M${f(cx - 8)} ${f(cy - ah * 0.6)}q-8 -2 -14 2`, 0.5, 0.6);
      if (chance(s, 0.6)) k.shape(`M${f(cx + 11)} ${f(cy - 3)}q6 -3 4 -10l-2 1q1 5 -3 7z`);
    } else {
      let seg = "";
      for (let i = 1; i < 4; i++) seg += `M${f(cx - 13 - al + i * al * 0.5)} ${f(cy - 4)}q1.5 6 0 12`;
      k.line(seg, 0.6, 0.8);
      if (sp === "wasp") {
        let bands = "";
        for (let i = 1; i < 4; i++) bands += `M${f(cx - 13 - al + i * al * 0.5 - 1.2)} ${f(cy - ah + 2)}h2.4v${f(ah * 2 - 4)}h-2.4z`;
        k.inkFill(bands, 0.75);
        k.shape(`M${f(cx - 13 - al)} ${f(cy + 2)}l-6 1l6 1.4z`);
      }
    }
    k.shape(blob(s, cx, cy, 5.5, 5, 8, 0.06));
    const hx = cx + 8.5;
    k.shape(blob(s, hx, cy - 2, 4.5, 4, 8, 0.06));
    // Mandibeln + Fühler
    k.line(`M${f(hx + 3.5)} ${f(cy)}q3 1 2 4M${f(hx + 3)} ${f(cy + 1)}q2 2 0 4`, 0.8);
    const ant = rr(s, 8, 14);
    k.line(`M${f(hx + 1)} ${f(cy - 5)}q${f(ant * 0.4)} ${f(-ant)} ${f(ant)} ${f(-ant * 0.8)}M${f(hx - 1)} ${f(cy - 5)}q${f(ant * 0.2)} ${f(-ant)} ${f(ant * 0.6)} ${f(-ant * 1.1)}`, 0.6);
    const n = pick(s, [1, 2, 2, 3]);
    for (let i = 0; i < n; i++) k.eye(hx + 1.5 - i * 1.6, cy - 3 + (i % 2) * 1.4, i ? 0.8 : 1.2);
  },

  serpent(s, k, g, v) {
    const kind = ["snake", "lizard", "toad", "eggs"].includes(v) ? v : pick(s, ["snake", "snake", "lizard", "toad"]);
    if (kind === "eggs") {
      // Froschlaich: Eier in Gallerte, in manchen glüht ein Auge
      k.back.push(`<path d="${blob(s, g.cx, g.ground - 12, 30, 12, 12, 0.12)}" fill="${PAPER}" opacity="0.6" stroke="${INK}" stroke-width="0.7"/>`);
      for (let i = 0; i < 22; i++) {
        const x = g.cx + rr(s, -26, 26);
        const y = g.ground - 12 + rr(s, -9, 9);
        k.lines.push(`<circle cx="${f(x)}" cy="${f(y)}" r="3.4" fill="${PAPER}" stroke="${INK}" stroke-width="0.6" opacity="0.9"/><circle cx="${f(x + 0.4)}" cy="${f(y + 0.3)}" r="1.1" fill="${INK}"/>`);
        if (i % 7 === 3) k.eye(x + 0.4, y + 0.3, 0.9);
      }
      return;
    }
    if (kind === "toad") {
      const cx = g.cx;
      const cy = g.ground - 10;
      for (const side of [-1, 1]) {
        k.shape(jointLeg(cx + side * 10, cy + 2, cx + side * 20, cy - 2, cx + side * 22, g.ground, 2.2), { layer: "back" });
        k.shape(`M${f(cx + side * 22)} ${f(g.ground)}l${f(side * 3)} 0.5l${f(-side * 2)} -1.5l${f(side * 3)} -1z`);
      }
      k.shape(blob(s, cx, cy, 16, 10, 12, 0.06));
      let warts = "";
      for (let i = 0; i < 12; i++) warts += `M${f(cx + rr(s, -12, 12))} ${f(cy + rr(s, -7, 6))}a0.8 0.8 0 1 0 0.1 0`;
      k.line(warts, 0.6, 0.8);
      k.line(`M${f(cx - 10)} ${f(cy + 2)}Q${f(cx)} ${f(cy + 7)} ${f(cx + 10)} ${f(cy + 2)}`, 0.8);
      k.shape(blob(s, cx - 6, cy - 9, 3.5, 3, 6, 0.05));
      k.shape(blob(s, cx + 6, cy - 9, 3.5, 3, 6, 0.05));
      k.eye(cx - 6, cy - 9, 1.5);
      k.eye(cx + 6, cy - 9, 1.5);
      return;
    }
    const pts = [];
    const n = 8;
    const amp = kind === "lizard" ? rr(s, 2, 4) : rr(s, 5, 9);
    const baseY = g.ground - (kind === "lizard" ? 9 : 8);
    const ph = rr(s, 0, 6);
    for (let i = 0; i < n; i++) pts.push([g.cx - 38 + i * 10, baseY - Math.sin(i * 0.95 + ph) * amp - (i === n - 1 ? 8 : 0)]);
    const d = smoothOpen(pts);
    const thick = kind === "lizard" ? 7 : rr(s, 6, 8.5);
    k.back.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(thick + 2.2)}" stroke-linecap="round"/>`);
    k.back.push(`<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${f(thick)}" stroke-linecap="round"/>`);
    k.back.push(`<path d="${d}" fill="none" stroke="url(#hatch)" stroke-width="${f(thick)}" stroke-linecap="round" mask="url(#shadeMask)"/>`);
    // Schuppenmuster
    k.line(smoothOpen(pts.map(([x, y]) => [x, y])), 0.5, 0.35);
    let marks = "";
    for (let i = 1; i < n - 1; i++) marks += `M${f(pts[i][0] - 2)} ${f(pts[i][1] - 1.5)}l2 1.5l2 -1.5`;
    k.line(marks, 0.7, 0.8);
    if (kind === "lizard") {
      for (const i of [2, 5]) {
        for (const side of [-1, 1]) k.shape(jointLeg(pts[i][0], pts[i][1], pts[i][0] + 4, pts[i][1] + side * 4 + 3, pts[i][0] + 6, g.ground, 1));
      }
    }
    const [hx, hy] = pts[n - 1];
    k.shape(`M${f(hx - 5)} ${f(hy - 3.5)}Q${f(hx + 4)} ${f(hy - 6)} ${f(hx + 8)} ${f(hy)}Q${f(hx + 4)} ${f(hy + 4)} ${f(hx - 5)} ${f(hy + 3.5)}Z`);
    k.eye(hx + 1.5, hy - 1.5, 1.3);
    // gespaltene Zunge (Rot-Akzent)
    k.lines.push(`<path d="M${f(hx + 8)} ${f(hy)}l4 0.5l2 -1.5M${f(hx + 12)} ${f(hy + 0.5)}l2 1.5" fill="none" stroke="#8e1b1b" stroke-width="0.8" stroke-linecap="round"/>`);
  },

  rodent(s, k, g, v) {
    const sp = ["mole", "dormouse"].includes(v) ? v : pick(s, ["rat", "rat", "mouse"]);
    if (sp === "mole") {
      const bx = g.cx - 2;
      const by = g.ground - 9;
      k.shape(`M${f(g.cx - 34)} ${f(g.ground + 1)}Q${f(g.cx - 20)} ${f(g.ground - 9)} ${f(g.cx - 6)} ${f(g.ground + 1)}Z`, { dark: true, layer: "back" });
      k.shape(blob(s, bx, by, 17, 9, 11, 0.05, -0.05));
      let fur = "";
      for (let i = 0; i < 14; i++) fur += `M${f(bx + rr(s, -14, 14))} ${f(by + rr(s, -6, 6))}l-1.5 0.6`;
      k.line(fur, 0.45, 0.7);
      // Grabschaufeln
      for (const dx of [8, 12]) k.shape(`M${f(bx + dx)} ${f(by + 5)}l3 5l2.5 -0.5l0.5 -1.5l1 1l0.5 -2l-3 -4z`);
      k.shape(`M${f(bx + 15)} ${f(by - 3)}Q${f(bx + 26)} ${f(by - 1)} ${f(bx + 27)} ${f(by + 1)}Q${f(bx + 22)} ${f(by + 4)} ${f(bx + 15)} ${f(by + 3)}Z`);
      k.inkFill(`M${f(bx + 26.5)} ${f(by + 0.5)}a1.2 1 0 1 0 0.1 0z`);
      k.eye(bx + 17, by - 2, 0.7);
      return;
    }
    const bx = g.cx - 3;
    const by = g.ground - 10;
    const bw = rr(s, 12, 16);
    const bh = rr(s, 8, 10);
    // Schwanz: lang und nackt (Ratte) oder buschig über den Rücken gerollt (Bilch)
    if (sp === "dormouse") {
      k.shape(`M${f(bx - bw * 0.8)} ${f(by + 2)}C${f(bx - bw - 12)} ${f(by - 4)} ${f(bx - bw - 6)} ${f(by - 22)} ${f(bx - 2)} ${f(by - 16)}C${f(bx - bw - 1)} ${f(by - 16)} ${f(bx - bw - 5)} ${f(by - 6)} ${f(bx - bw * 0.6)} ${f(by - 1)}Z`, { layer: "back" });
    } else {
      const tail = [[bx - bw * 0.9, by + 3], [bx - bw - 8, by + rr(s, 0, 6)], [bx - bw - 18, by - rr(s, 2, 10)], [bx - bw - 26, by - rr(s, -4, 14)]];
      k.line(smoothOpen(tail), sp === "mouse" ? 0.7 : 1.1);
    }
    k.shape(`M${f(bx - bw * 0.4)} ${f(by + 3)}l-2 ${f(g.ground - by - 3)}h4zM${f(bx + bw * 0.5)} ${f(by + 3)}l1 ${f(g.ground - by - 3)}h4z`, { layer: "back" });
    k.shape(blob(s, bx, by, bw, bh, 10, 0.06, -0.12));
    const hx = bx + bw * 0.85;
    const hy = by - bh * 0.5;
    k.shape(`M${f(hx - 5)} ${f(hy - 5)}Q${f(hx + 6)} ${f(hy - 5)} ${f(hx + 11)} ${f(hy + 2)}Q${f(hx + 5)} ${f(hy + 6)} ${f(hx - 5)} ${f(hy + 5)}Z`);
    k.inkFill(`M${f(hx + 10.5)} ${f(hy + 1.8)}a1.1 0.9 0 1 0 0.1 0z`);
    k.line(`M${f(hx + 9)} ${f(hy + 2)}l6 -2M${f(hx + 9)} ${f(hy + 2.5)}l6 1M${f(hx + 9)} ${f(hy + 3)}l5 3`, 0.35);
    const earR = rr(s, 3, 5);
    k.shape(blob(s, hx - 2, hy - 5.5, earR, earR * 1.1, 7, 0.08), { layer: "back" });
    k.line(`M${f(hx - 3)} ${f(hy - 6)}a${f(earR * 0.5)} ${f(earR * 0.6)} 0 1 1 1 0`, 0.5, 0.7);
    k.eye(hx + 3, hy - 1.5, 1.4);
    if (chance(s, 0.4)) k.eye(hx + 1, hy - 3, 0.8);
    k.line(`M${f(hx + 9)} ${f(hy + 4)}v2M${f(hx + 10)} ${f(hy + 4)}v2`, 0.6);
    k.shape(jointLeg(hx - 3, hy + 5, hx - 1, by + bh, hx + 1, g.ground, 1));
  },

  fungus(s, k, g) {
    // Myzelfäden am Boden
    let threads = "";
    for (let i = 0; i < 8; i++) {
      const x = g.cx + rr(s, -30, 30);
      threads += `M${f(x)} ${f(g.ground)}q${f(rr(s, -6, 6))} ${f(rr(s, 2, 5))} ${f(rr(s, -12, 12))} ${f(rr(s, 3, 8))}`;
    }
    k.lines.push(`<path d="${threads}" fill="none" stroke="${INK}" stroke-width="0.5" opacity="0.6"/>`);
    const n = pick(s, [1, 2, 3, 3]);
    const caps = [];
    for (let i = 0; i < n; i++) {
      const big = i === 0;
      const x = g.cx + (big ? 0 : (i === 1 ? -1 : 1) * rr(s, 15, 22));
      const h = big ? rr(s, 26, 34) : rr(s, 12, 18);
      const cw = big ? rr(s, 17, 23) : rr(s, 8, 11);
      caps.push({ x, h, cw, big });
    }
    caps.sort((a, b) => (a.big ? 1 : 0) - (b.big ? 1 : 0));
    for (const c of caps) {
      const top = g.ground - c.h;
      const sw = c.cw * 0.28;
      k.shape(`M${f(c.x - sw)} ${f(g.ground)}Q${f(c.x - sw * 0.6)} ${f(top + c.h * 0.4)} ${f(c.x - sw * 0.7)} ${f(top + 2)}L${f(c.x + sw * 0.7)} ${f(top + 2)}Q${f(c.x + sw * 0.6)} ${f(top + c.h * 0.4)} ${f(c.x + sw)} ${f(g.ground)}Z`, { layer: c.big ? "body" : "back" });
      if (c.big && chance(s, 0.6)) k.line(`M${f(c.x - sw * 0.7)} ${f(top + 8)}q${f(sw * 0.7)} 3 ${f(sw * 1.4)} 0`, 0.7);
      const capH = c.cw * rr(s, 0.5, 0.8);
      k.shape(`M${f(c.x - c.cw)} ${f(top + 3)}Q${f(c.x - c.cw * 0.9)} ${f(top - capH)} ${f(c.x)} ${f(top - capH)}Q${f(c.x + c.cw * 0.9)} ${f(top - capH)} ${f(c.x + c.cw)} ${f(top + 3)}Q${f(c.x)} ${f(top + 0.5)} ${f(c.x - c.cw)} ${f(top + 3)}Z`, { layer: c.big ? "body" : "back" });
      let gills = "";
      for (let i = -3; i <= 3; i++) gills += `M${f(c.x + i * c.cw * 0.25)} ${f(top + 2.5)}l${f(i * 0.3)} -2`;
      k.line(gills, 0.4, 0.8);
      let spots = "";
      for (let i = 0; i < (c.big ? 7 : 3); i++) spots += `M${f(c.x + rr(s, -c.cw * 0.7, c.cw * 0.7))} ${f(top - rr(s, 1, capH * 0.8))}a${f(rr(s, 0.8, 1.8))} ${f(rr(s, 0.6, 1.2))} 0 1 0 0.1 0`;
      k.line(spots, 0.6, 0.9);
      if (c.big) {
        k.eye(c.x - sw * 0.35, top + c.h * 0.35, 1.3);
        k.eye(c.x + sw * 0.4, top + c.h * 0.35, 1.3);
        k.inkFill(`M${f(c.x - 2)} ${f(top + c.h * 0.55)}q2 2.5 4 0q-2 1 -4 0z`);
      }
    }
    // Sporen
    let sp = "";
    for (let i = 0; i < 14; i++) sp += `M${f(g.cx + rr(s, -40, 40))} ${f(rr(s, 6, 40))}a0.5 0.5 0 1 0 0.1 0`;
    k.lines.push(`<path d="${sp}" fill="none" stroke="${INK}" stroke-width="0.9" opacity="0.5"/>`);
  },

  root(s, k, g, v) {
    const cx = g.cx;
    if (v === "pod") {
      k.line(`M${f(cx)} ${f(g.ground)}q-2 -6 0 -10`, 1.2);
      k.shape(`M${f(cx)} ${f(g.ground - 38)}C${f(cx - 15)} ${f(g.ground - 32)} ${f(cx - 13)} ${f(g.ground - 12)} ${f(cx)} ${f(g.ground - 9)}C${f(cx + 13)} ${f(g.ground - 12)} ${f(cx + 15)} ${f(g.ground - 32)} ${f(cx)} ${f(g.ground - 38)}Z`);
      k.line(`M${f(cx)} ${f(g.ground - 37)}Q${f(cx + 3)} ${f(g.ground - 24)} ${f(cx)} ${f(g.ground - 10)}`, 0.9);
      k.line(`M${f(cx)} ${f(g.ground - 38)}q2 -5 7 -6M${f(cx + 3)} ${f(g.ground - 42)}q3 -1 5 1`, 0.8);
      k.eye(cx - 4, g.ground - 24, 1.1);
      return;
    }
    if (v === "stump") {
      const w = rr(s, 16, 20);
      const h = rr(s, 18, 24);
      let roots = "";
      for (let i = 0; i < 5; i++) roots += `M${f(cx + rr(s, -w, w))} ${f(g.ground - 1)}q${f(rr(s, -8, 8))} 1 ${f(rr(s, -14, 14))} ${f(rr(s, 1, 4))}`;
      k.line(roots, 1.3);
      k.shape(`M${f(cx - w)} ${f(g.ground)}L${f(cx - w * 0.85)} ${f(g.ground - h)}L${f(cx + w * 0.85)} ${f(g.ground - h - 3)}L${f(cx + w)} ${f(g.ground)}Z`);
      k.shape(`M${f(cx - w * 0.85)} ${f(g.ground - h)}Q${f(cx)} ${f(g.ground - h - 8)} ${f(cx + w * 0.85)} ${f(g.ground - h - 3)}Q${f(cx)} ${f(g.ground - h + 5)} ${f(cx - w * 0.85)} ${f(g.ground - h)}Z`);
      k.line(`M${f(cx - 8)} ${f(g.ground - h - 1)}q8 -4 16 -1M${f(cx - 4)} ${f(g.ground - h - 1.5)}q4 -2 8 -0.5`, 0.6, 0.8);
      let bark = "";
      for (let i = 0; i < 7; i++) bark += `M${f(cx + rr(s, -w * 0.8, w * 0.8))} ${f(g.ground - rr(s, 2, h - 3))}v${f(rr(s, 3, 7))}`;
      k.line(bark, 0.6, 0.8);
      k.inkFill(`M${f(cx - 5)} ${f(g.ground - h * 0.5)}a2 2.6 0 1 0 0.1 0zM${f(cx + 5)} ${f(g.ground - h * 0.5)}a2 2.6 0 1 0 0.1 0z`, 0.85);
      k.eye(cx - 5, g.ground - h * 0.5, 0.9);
      k.eye(cx + 5, g.ground - h * 0.5, 0.9);
      return;
    }
    const trunkW = rr(s, 7, 11);
    const h = rr(s, 36, 46);
    const top = g.ground - h;
    // Wurzeln
    let roots = "";
    for (let i = 0; i < 6; i++) {
      const x = cx + rr(s, -trunkW, trunkW);
      roots += `M${f(x)} ${f(g.ground - 2)}q${f(rr(s, -10, 10))} 2 ${f(rr(s, -18, 18))} ${f(rr(s, 2, 6))}`;
    }
    k.line(roots, 1.3);
    // Stamm als verdrehte Form
    const pts = [
      [cx - trunkW, g.ground], [cx - trunkW * 0.7 + rr(s, -2, 2), g.ground - h * 0.35], [cx - trunkW * 0.8 + rr(s, -3, 1), g.ground - h * 0.7],
      [cx - trunkW * 0.5, top], [cx + trunkW * 0.6, top + rr(s, -2, 3)], [cx + trunkW * 0.7 + rr(s, -1, 3), g.ground - h * 0.7],
      [cx + trunkW * 0.6 + rr(s, -2, 2), g.ground - h * 0.35], [cx + trunkW, g.ground],
    ];
    k.shape(smoothClosed(pts), { w: 1.4 });
    // Äste mit Dornen
    const branch = (x, y, ang, len, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      k.shape(taper(x, y, x2, y2, depth * 0.9 + 0.5, depth * 0.5 + 0.2));
      if (chance(s, 0.7)) {
        const t = rr(s, 0.3, 0.8);
        k.line(`M${f(x + (x2 - x) * t)} ${f(y + (y2 - y) * t)}l${f(rr(s, -2, 2))} ${f(-rr(s, 1.5, 3))}`, 0.7);
      }
      if (depth > 0) {
        branch(x2, y2, ang - rr(s, 0.3, 0.7), len * 0.7, depth - 1);
        branch(x2, y2, ang + rr(s, 0.2, 0.6), len * 0.65, depth - 1);
      }
    };
    branch(cx - trunkW * 0.4, top + 4, -Math.PI / 2 - rr(s, 0.4, 0.8), rr(s, 9, 13), 2);
    branch(cx + trunkW * 0.4, top + 6, -Math.PI / 2 + rr(s, 0.3, 0.7), rr(s, 8, 12), 2);
    // Rinde
    let bark = "";
    for (let i = 0; i < 7; i++) {
      const y = g.ground - rr(s, 3, h - 6);
      bark += `M${f(cx + rr(s, -trunkW * 0.6, trunkW * 0.3))} ${f(y)}q2 ${f(rr(s, -2, 2))} ${f(rr(s, 3, 6))} ${f(rr(s, -1, 1))}`;
    }
    k.line(bark, 0.6, 0.8);
    // Gesicht aus Astlöchern
    const fy = g.ground - h * rr(s, 0.55, 0.7);
    k.inkFill(`M${f(cx - 3.5)} ${f(fy)}a2.2 2.8 0 1 0 0.1 0zM${f(cx + 3.5)} ${f(fy)}a2.2 2.8 0 1 0 0.1 0z`, 0.85);
    k.eye(cx - 3.5, fy + 0.2, 1);
    k.eye(cx + 3.5, fy + 0.2, 1);
    k.inkFill(`M${f(cx - 3)} ${f(fy + 7)}q3 ${f(rr(s, 2, 4))} 6 0q-3 1.5 -6 0z`);
    // Blätter
    let leaves = "";
    for (let i = 0; i < 5; i++) {
      const x = cx + rr(s, -18, 18);
      const y = top + rr(s, -8, 6);
      leaves += `M${f(x)} ${f(y)}q2 -3 4 0q-2 3 -4 0z`;
    }
    k.line(leaves, 0.6);
  },

  skeleton(s, k, g, v) {
    const cx = g.cx;
    const kind = v === "dog" ? "dog" : v === "pile" ? "pile" : v === "skull" ? "skull" : pick(s, ["standing", "dog", "standing"]);
    const skull = (x, y, r) => {
      k.shape(`M${f(x - r)} ${f(y + r * 0.3)}C${f(x - r * 1.1)} ${f(y - r * 1.3)} ${f(x + r * 1.1)} ${f(y - r * 1.3)} ${f(x + r)} ${f(y + r * 0.3)}L${f(x + r * 0.6)} ${f(y + r * 0.9)}H${f(x - r * 0.6)}Z`);
      k.inkFill(`M${f(x - r * 0.42)} ${f(y)}a${f(r * 0.3)} ${f(r * 0.34)} 0 1 0 0.1 0zM${f(x + r * 0.42)} ${f(y)}a${f(r * 0.3)} ${f(r * 0.34)} 0 1 0 0.1 0z`);
      k.eye(x - r * 0.42, y + 0.2, r * 0.14);
      k.eye(x + r * 0.42, y + 0.2, r * 0.14);
    };
    if (kind === "pile") {
      for (let i = 0; i < 9; i++) {
        const x = cx + rr(s, -22, 22);
        const y = g.ground - rr(s, 2, 14) * (1 - Math.abs(x - cx) / 30);
        const a = rr(s, -0.8, 0.8);
        const l = rr(s, 7, 12);
        k.line(`M${f(x - Math.cos(a) * l)} ${f(y - Math.sin(a) * l)}L${f(x + Math.cos(a) * l)} ${f(y + Math.sin(a) * l)}`, 2.2);
        k.lines.push(`<path d="M${f(x - Math.cos(a) * l)} ${f(y - Math.sin(a) * l)}L${f(x + Math.cos(a) * l)} ${f(y + Math.sin(a) * l)}" stroke="${PAPER}" stroke-width="0.9" stroke-linecap="round"/>`);
      }
      skull(cx + rr(s, -6, 6), g.ground - 18, 6.5);
      return;
    }
    if (kind === "skull") {
      // Schädelträger: Gestalt mit Kette aus Schädeln
      k.shape(`M${f(cx - 9)} ${f(g.ground)}L${f(cx - 7)} ${f(g.ground - 34)}Q${f(cx)} ${f(g.ground - 40)} ${f(cx + 7)} ${f(g.ground - 34)}L${f(cx + 9)} ${f(g.ground)}Z`, { dark: true });
      skull(cx, g.ground - 42, 6.5);
      for (let i = 0; i < 5; i++) skull(cx - 10 + i * 5, g.ground - 26 + Math.sin(i / 4 * Math.PI) * 6, 2.4);
      return;
    }
    if (kind === "dog") {
      const by = g.ground - 20;
      k.line(`M${f(cx - 16)} ${f(by)}Q${f(cx)} ${f(by - 5)} ${f(cx + 14)} ${f(by - 2)}`, 1.8);
      let ribs = "";
      for (let i = 0; i < 6; i++) ribs += `M${f(cx - 10 + i * 3.5)} ${f(by - 2)}q-1.5 6 0 ${f(10 - Math.abs(i - 2.5))}`;
      k.line(ribs, 1.1);
      for (const x of [cx - 14, cx - 11, cx + 9, cx + 12]) k.line(`M${f(x)} ${f(by)}l1 9l-1 ${f(g.ground - by - 9)}`, 1.2);
      k.line(`M${f(cx - 16)} ${f(by)}q-6 -2 -8 -8`, 1);
      const hx = cx + 19;
      const hy = by - 7;
      k.shape(`M${f(hx - 5)} ${f(hy - 4)}Q${f(hx + 2)} ${f(hy - 7)} ${f(hx + 10)} ${f(hy)}L${f(hx + 10)} ${f(hy + 2.5)}L${f(hx - 3)} ${f(hy + 4)}Z`);
      k.inkFill(`M${f(hx - 1)} ${f(hy - 1.5)}a2 1.8 0 1 0 0.1 0z`);
      k.eye(hx - 1, hy - 1.4, 1);
      k.line(`M${f(hx + 2)} ${f(hy + 2.5)}l0.7 1.5l0.7 -1.5l0.7 1.5l0.7 -1.5l0.7 1.5`, 0.5);
      return;
    }
    const top = g.ground - rr(s, 50, 58);
    // Wirbelsäule
    let spine = "";
    for (let i = 0; i < 9; i++) spine += `M${f(cx - 1.2)} ${f(top + 12 + i * 3)}h2.4`;
    k.line(`M${f(cx)} ${f(top + 11)}V${f(top + 39)}`, 1.3);
    k.line(spine, 1.4);
    // Rippen
    let ribs = "";
    for (let i = 0; i < 5; i++) {
      const y = top + 15 + i * 3.4;
      const w = 9 - Math.abs(i - 1.5) * 1.2;
      ribs += `M${f(cx)} ${f(y)}q${f(-w)} 0 ${f(-w)} ${f(3)}M${f(cx)} ${f(y)}q${f(w)} 0 ${f(w)} ${f(3)}`;
    }
    k.line(ribs, 1.1);
    // Becken
    k.shape(`M${f(cx - 7)} ${f(top + 38)}Q${f(cx)} ${f(top + 34)} ${f(cx + 7)} ${f(top + 38)}L${f(cx + 4)} ${f(top + 43)}L${f(cx - 4)} ${f(top + 43)}Z`);
    // Beine & Arme (Knochenlinien mit Gelenken)
    const bone = (x1, y1, x2, y2) => {
      k.line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, 1.5);
      k.line(`M${f(x1)} ${f(y1)}m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0M${f(x2)} ${f(y2)}m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0`, 0.6);
    };
    bone(cx - 4, top + 43, cx - 6, top + 50);
    bone(cx - 6, top + 50, cx - 5, g.ground);
    bone(cx + 4, top + 43, cx + 6, top + 50);
    bone(cx + 6, top + 50, cx + 7, g.ground);
    const armUp = chance(s, 0.5);
    bone(cx - 9, top + 14, cx - 14, top + 24);
    bone(cx - 14, top + 24, armUp ? cx - 20 : cx - 13, armUp ? top + 14 : top + 34);
    bone(cx + 9, top + 14, cx + 14, top + 24);
    bone(cx + 14, top + 24, cx + 13, top + 34);
    if (chance(s, 0.5)) k.line(`M${f(cx + 13)} ${f(top + 34)}L${f(cx + 16)} ${f(g.ground)}M${f(cx + 13)} ${f(top + 30)}l-3 -18l4 2z`, 1);
    // Schädel
    const sy = top + 5;
    k.shape(`M${f(cx - 6.5)} ${f(sy + 2)}C${f(cx - 7)} ${f(sy - 8)} ${f(cx + 7)} ${f(sy - 8)} ${f(cx + 6.5)} ${f(sy + 2)}L${f(cx + 4)} ${f(sy + 6)}H${f(cx - 4)}Z`);
    k.inkFill(`M${f(cx - 2.8)} ${f(sy)}a2 2.2 0 1 0 0.1 0zM${f(cx + 2.8)} ${f(sy)}a2 2.2 0 1 0 0.1 0z`);
    k.eye(cx - 2.8, sy + 0.2, 0.9);
    k.eye(cx + 2.8, sy + 0.2, 0.9);
    k.line(`M${f(cx - 3)} ${f(sy + 6)}v2M${f(cx - 1)} ${f(sy + 6)}v2M${f(cx + 1)} ${f(sy + 6)}v2M${f(cx + 3)} ${f(sy + 6)}v2`, 0.6);
    if (chance(s, 0.35)) k.line(`M${f(cx - 5)} ${f(sy - 5)}l-2 -5l3 2l1 -3l1 3l2 -3l1 3l3 -2l-2 5`, 0.8);
  },

  candle(s, k, g) {
    const n = pick(s, [1, 2, 3]);
    const specs = [];
    for (let i = 0; i < n; i++) {
      const main = i === 0;
      specs.push({ x: g.cx + (main ? 0 : (i === 1 ? -1 : 1) * rr(s, 14, 20)), h: main ? rr(s, 28, 38) : rr(s, 12, 20), w: main ? rr(s, 7, 10) : rr(s, 4, 6), main });
    }
    // Wachsgeist-Schleier
    if (chance(s, 0.7)) {
      const c = specs[0];
      const ty = g.ground - c.h - 16;
      const d = `M${f(c.x - 6)} ${f(ty + 18)}C${f(c.x - 20)} ${f(ty + 6)} ${f(c.x - 10)} ${f(ty - 16)} ${f(c.x)} ${f(ty - 14)}C${f(c.x + 12)} ${f(ty - 12)} ${f(c.x + 18)} ${f(ty + 4)} ${f(c.x + 7)} ${f(ty + 16)}`;
      k.back.push(`<path d="${d}" fill="${PAPER}" opacity="0.55" stroke="${INK}" stroke-width="0.6" stroke-dasharray="3 2"/>`);
      k.eye(c.x - 4, ty - 5, 1.3);
      k.eye(c.x + 4, ty - 5, 1.3);
      k.inkFill(`M${f(c.x - 2.5)} ${f(ty + 1)}q2.5 3 5 0q-2.5 4 -5 0z`, 0.7);
    }
    for (const c of specs) {
      const top = g.ground - c.h;
      let d = `M${f(c.x - c.w)} ${f(g.ground)}L${f(c.x - c.w)} ${f(top + 2)}`;
      // Tropfen an der Oberkante
      const drips = ri(s, 2, 4);
      for (let i = 0; i < drips; i++) {
        const x = c.x - c.w + ((i + 1) / (drips + 1)) * c.w * 2;
        const dl = rr(s, 3, 9);
        d += `L${f(x - 1.4)} ${f(top + 1)}Q${f(x - 1.3)} ${f(top + dl)} ${f(x)} ${f(top + dl)}Q${f(x + 1.3)} ${f(top + dl)} ${f(x + 1.4)} ${f(top + 1)}`;
      }
      d += `L${f(c.x + c.w)} ${f(top + 2)}L${f(c.x + c.w)} ${f(g.ground)}Z`;
      k.shape(d);
      k.line(`M${f(c.x - c.w * 0.4)} ${f(top + 4)}v${f(c.h - 8)}`, 0.5, 0.5);
      k.line(`M${f(c.x)} ${f(top + 1)}v-3`, 0.9);
      const fh = c.main ? 9 : 6;
      k.eyes.push(
        `<ellipse cx="${f(c.x)}" cy="${f(top - 5)}" rx="${f(fh * 0.9)}" ry="${f(fh * 1.1)}" fill="${k.color}" opacity="0.25" filter="url(#glow)"/>`,
        `<path d="M${f(c.x)} ${f(top - 2 - fh)}C${f(c.x - fh * 0.5)} ${f(top - 5)} ${f(c.x - fh * 0.35)} ${f(top - 1)} ${f(c.x)} ${f(top - 1.5)}C${f(c.x + fh * 0.35)} ${f(top - 1)} ${f(c.x + fh * 0.5)} ${f(top - 5)} ${f(c.x)} ${f(top - 2 - fh)}Z" fill="${k.color}" stroke="${INK}" stroke-width="0.5"/>`,
        `<path d="M${f(c.x)} ${f(top - 4)}q-1 -2 0 -4q1 2 0 4z" fill="#fff6d8"/>`,
      );
    }
    // Wachspfütze
    k.shape(`M${f(g.cx - 26)} ${f(g.ground + 1)}Q${f(g.cx)} ${f(g.ground - 3)} ${f(g.cx + 26)} ${f(g.ground + 1)}Q${f(g.cx)} ${f(g.ground + 3)} ${f(g.cx - 26)} ${f(g.ground + 1)}Z`, { layer: "back" });
  },

  moth(s, k, g, v) {
    const cx = g.cx;
    const cy = g.ground - 26;
    if (v === "caterpillar") {
      k.shape(`M${f(cx - 34)} ${f(g.ground - 14)}Q${f(cx)} ${f(g.ground - 20)} ${f(cx + 34)} ${f(g.ground - 12)}L${f(cx + 34)} ${f(g.ground - 9)}Q${f(cx)} ${f(g.ground - 17)} ${f(cx - 34)} ${f(g.ground - 11)}Z`, { dark: true, layer: "back" });
      for (let i = 0; i < 8; i++) {
        const x = cx - 20 + i * 5.2;
        const y = g.ground - 22 - Math.sin((i / 7) * Math.PI) * 9;
        k.shape(blob(s, x, y, 3.6, 3.8, 7, 0.05));
        k.line(`M${f(x)} ${f(y + 3.6)}v2`, 0.6);
      }
      const hx = cx + 20 + 4;
      k.shape(blob(s, hx, g.ground - 24, 4, 4, 7, 0.04));
      k.eye(hx + 1.2, g.ground - 25, 1);
      k.line(`M${f(hx + 1)} ${f(g.ground - 28)}q1 -4 4 -4`, 0.6);
      return;
    }
    const bat = v === "bat" ? true : chance(s, 0.4);
    if (bat) {
      for (const side of [-1, 1]) {
        const span = rr(s, 30, 38);
        const tipY = cy - rr(s, 10, 16);
        const d = `M${f(cx + side * 3)} ${f(cy - 3)}Q${f(cx + side * span * 0.5)} ${f(tipY - 6)} ${f(cx + side * span)} ${f(tipY)}` +
          `Q${f(cx + side * span * 0.85)} ${f(cy + 4)} ${f(cx + side * span * 0.72)} ${f(cy + 8)}Q${f(cx + side * span * 0.6)} ${f(cy + 1)} ${f(cx + side * span * 0.45)} ${f(cy + 7)}` +
          `Q${f(cx + side * span * 0.32)} ${f(cy + 1)} ${f(cx + side * span * 0.18)} ${f(cy + 8)}Q${f(cx + side * 6)} ${f(cy + 3)} ${f(cx + side * 3)} ${f(cy + 5)}Z`;
        k.shape(d, { dark: false });
        k.line(`M${f(cx + side * 3)} ${f(cy - 2)}L${f(cx + side * span * 0.72)} ${f(cy + 7)}M${f(cx + side * 3)} ${f(cy - 2)}L${f(cx + side * span * 0.45)} ${f(cy + 6)}M${f(cx + side * 3)} ${f(cy - 2)}L${f(cx + side * span * 0.18)} ${f(cy + 7)}`, 0.5, 0.8);
      }
      k.shape(blob(s, cx, cy + 3, 4.5, 8, 8, 0.05));
      k.shape(blob(s, cx, cy - 7, 4.2, 4, 7, 0.05));
      k.shape(`M${f(cx - 3.5)} ${f(cy - 9)}l-1.5 -6l3.5 3.5zM${f(cx + 3.5)} ${f(cy - 9)}l1.5 -6l-3.5 3.5z`);
      k.eye(cx - 1.8, cy - 7.5, 1.1);
      k.eye(cx + 1.8, cy - 7.5, 1.1);
      k.line(`M${f(cx - 1)} ${f(cy - 4.5)}l0.5 1.4l0.5 -1.4M${f(cx + 0.2)} ${f(cy - 4.5)}l0.5 1.4l0.5 -1.4`, 0.5);
      k.line(`M${f(cx - 2)} ${f(cy + 11)}l-1 4M${f(cx + 2)} ${f(cy + 11)}l1 4`, 0.8);
      return;
    }
    for (const side of [-1, 1]) {
      const fw = rr(s, 20, 28);
      const fh = rr(s, 14, 20);
      k.shape(`M${f(cx + side * 2)} ${f(cy - 2)}C${f(cx + side * fw * 0.4)} ${f(cy - fh - 4)} ${f(cx + side * fw * 1.1)} ${f(cy - fh)} ${f(cx + side * fw)} ${f(cy - 3)}C${f(cx + side * fw * 0.9)} ${f(cy + 2)} ${f(cx + side * 8)} ${f(cy + 3)} ${f(cx + side * 2)} ${f(cy + 1)}Z`);
      k.shape(`M${f(cx + side * 2)} ${f(cy + 2)}C${f(cx + side * fw * 0.7)} ${f(cy + 3)} ${f(cx + side * fw * 0.75)} ${f(cy + fh * 0.7)} ${f(cx + side * fw * 0.4)} ${f(cy + fh * 0.75)}C${f(cx + side * 6)} ${f(cy + fh * 0.7)} ${f(cx + side * 3)} ${f(cy + 8)} ${f(cx + side * 2)} ${f(cy + 4)}Z`);
      // Augenflecke
      const ex = cx + side * fw * 0.6;
      const ey = cy - fh * 0.45;
      k.line(`M${f(ex - 3)} ${f(ey)}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M${f(ex - 1.4)} ${f(ey)}a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0`, 0.6);
      let veins = "";
      for (let i = 0; i < 4; i++) veins += `M${f(cx + side * 3)} ${f(cy - 1)}q${f(side * (6 + i * 4))} ${f(-8 + i * 2)} ${f(side * (10 + i * 4))} ${f(-6 + i * 3)}`;
      k.line(veins, 0.4, 0.7);
    }
    k.shape(blob(s, cx, cy + 5, 2.4, 9, 8, 0.05));
    let segs = "";
    for (let i = 0; i < 4; i++) segs += `M${f(cx - 2)} ${f(cy + 2 + i * 3)}h4`;
    k.line(segs, 0.5);
    k.shape(blob(s, cx, cy - 4.5, 2.6, 2.4, 6, 0.05));
    k.line(`M${f(cx - 1)} ${f(cy - 6.5)}q-4 -6 -8 -7M${f(cx + 1)} ${f(cy - 6.5)}q4 -6 8 -7`, 0.7);
    let feather = "";
    for (let i = 1; i < 5; i++) feather += `M${f(cx - 1 - i * 1.6)} ${f(cy - 7 - i * 1.3)}l-1 -1.5M${f(cx + 1 + i * 1.6)} ${f(cy - 7 - i * 1.3)}l1 -1.5`;
    k.line(feather, 0.4);
    k.eye(cx - 1.4, cy - 4.8, 0.9);
    k.eye(cx + 1.4, cy - 4.8, 0.9);
  },

  construct(s, k, g, v) {
    const kind = ["golem", "automaton", "scarecrow", "bell", "mirror", "doll", "blob"].includes(v) ? v : pick(s, ["golem", "automaton", "scarecrow", "bell", "mirror", "doll"]);
    const cx = g.cx;
    if (kind === "blob") {
      // Tintenklecks-Wesen: Spritzer mit Tropfen
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = (i % 2 ? 12 : 18) + rr(s, -3, 3);
        pts.push([cx + Math.cos(a) * r, g.ground - 20 + Math.sin(a) * r * 0.8]);
      }
      k.lines.push(`<path d="${smoothClosed(pts)}" fill="#1a1612" opacity="0.92"/>`);
      let drops = "";
      for (let i = 0; i < 7; i++) drops += `<circle cx="${f(cx + rr(s, -30, 30))}" cy="${f(g.ground - rr(s, 2, 40))}" r="${f(rr(s, 0.8, 2.4))}" fill="#1a1612"/>`;
      k.lines.push(drops);
      k.eye(cx - 4, g.ground - 23, 1.6);
      k.eye(cx + 4, g.ground - 23, 1.6);
      k.lines.push(`<path d="M${f(cx - 4)} ${f(g.ground - 15)}q4 3 8 0" fill="none" stroke="#e6d8b6" stroke-width="0.9"/>`);
      return;
    }
    if (kind === "bell") {
      const top = g.ground - 44;
      k.line(`M${f(cx - 26)} ${f(top)}H${f(cx + 26)}M${f(cx - 22)} ${f(top)}V${f(g.ground)}M${f(cx + 22)} ${f(top)}V${f(g.ground)}`, 1.6);
      k.shape(`M${f(cx - 14)} ${f(g.ground - 8)}C${f(cx - 13)} ${f(top + 12)} ${f(cx - 9)} ${f(top + 4)} ${f(cx)} ${f(top + 4)}C${f(cx + 9)} ${f(top + 4)} ${f(cx + 13)} ${f(top + 12)} ${f(cx + 14)} ${f(g.ground - 8)}L${f(cx + 17)} ${f(g.ground - 5)}H${f(cx - 17)}Z`);
      k.line(`M${f(cx - 13)} ${f(g.ground - 12)}H${f(cx + 13)}M${f(cx - 11)} ${f(top + 14)}H${f(cx + 11)}`, 0.6);
      k.shape(blob(s, cx, g.ground - 2, 3, 3, 6, 0.05));
      k.eye(cx - 4, top + 20, 1.2);
      k.eye(cx + 4, top + 20, 1.2);
      return;
    }
    if (kind === "mirror") {
      const top = g.ground - 48;
      k.shape(`M${f(cx - 13)} ${f(top + 12)}Q${f(cx)} ${f(top - 4)} ${f(cx + 13)} ${f(top + 12)}V${f(g.ground - 6)}H${f(cx - 13)}Z`, { w: 2 });
      k.back.push(`<path d="M${f(cx - 10)} ${f(top + 13)}Q${f(cx)} ${f(top)} ${f(cx + 10)} ${f(top + 13)}V${f(g.ground - 9)}H${f(cx - 10)}Z" fill="#b8b09a" opacity="0.5"/>`);
      k.line(`M${f(cx - 6)} ${f(top + 20)}l10 -6M${f(cx - 7)} ${f(top + 30)}l14 -9M${f(cx - 2)} ${f(top + 12)}l6 22l-9 6`, 0.6, 0.8);
      k.line(`M${f(cx - 16)} ${f(g.ground - 6)}H${f(cx + 16)}M${f(cx - 8)} ${f(g.ground - 6)}l-3 6M${f(cx + 8)} ${f(g.ground - 6)}l3 6`, 1.4);
      k.eye(cx - 3, top + 24, 1.2);
      k.eye(cx + 3, top + 24, 1.2);
      return;
    }
    if (kind === "scarecrow") {
      const top = g.ground - 52;
      k.line(`M${f(cx)} ${f(g.ground)}V${f(top + 8)}M${f(cx - 22)} ${f(top + 18)}H${f(cx + 22)}`, 2.2);
      k.shape(`M${f(cx - 10)} ${f(top + 15)}H${f(cx + 10)}L${f(cx + 12)} ${f(top + 38)}L${f(cx + 6)} ${f(top + 36)}L${f(cx + 2)} ${f(top + 40)}L${f(cx - 3)} ${f(top + 36)}L${f(cx - 8)} ${f(top + 39)}L${f(cx - 12)} ${f(top + 37)}Z`);
      k.line(`M${f(cx - 6)} ${f(top + 20)}l2 3M${f(cx + 4)} ${f(top + 26)}l3 2M${f(cx - 2)} ${f(top + 30)}l-2 3`, 0.7);
      let straw = "";
      for (const x of [cx - 22, cx + 22]) for (let i = 0; i < 4; i++) straw += `M${f(x)} ${f(top + 18)}l${f((x < cx ? -1 : 1) * rr(s, 2, 4))} ${f(rr(s, -3, 4))}`;
      k.line(straw, 0.6);
      k.shape(blob(s, cx, top + 7, 6.5, 6.5, 8, 0.06));
      k.shape(`M${f(cx - 10)} ${f(top + 3)}H${f(cx + 10)}L${f(cx + 5)} ${f(top + 1)}L${f(cx + 3)} ${f(top - 7)}L${f(cx - 4)} ${f(top - 6)}L${f(cx - 5)} ${f(top + 1)}Z`, { dark: true });
      k.eye(cx - 2.5, top + 7, 1.1);
      k.eye(cx + 2.5, top + 7, 1.1);
      k.line(`M${f(cx - 3)} ${f(top + 10)}l1 1l1 -1l1 1l1 -1l1 1`, 0.6);
      return;
    }
    if (kind === "automaton") {
      const top = g.ground - 46;
      const gear = (x, y, r, teeth) => {
        let d = "";
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          d += `M${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}L${f(x + Math.cos(a) * (r + 2))} ${f(y + Math.sin(a) * (r + 2))}`;
        }
        k.line(`${d}M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0M${f(x - r * 0.35)} ${f(y)}a${f(r * 0.35)} ${f(r * 0.35)} 0 1 0 ${f(r * 0.7)} 0a${f(r * 0.35)} ${f(r * 0.35)} 0 1 0 ${f(-r * 0.7)} 0`, 0.9);
      };
      k.shape(`M${f(cx - 5)} ${f(top + 38)}L${f(cx - 7)} ${f(g.ground)}H${f(cx - 3)}ZM${f(cx + 5)} ${f(top + 38)}L${f(cx + 7)} ${f(g.ground)}H${f(cx + 3)}Z`, { dark: true, layer: "back" });
      k.shape(`M${f(cx - 11)} ${f(top + 14)}H${f(cx + 11)}L${f(cx + 8)} ${f(top + 38)}H${f(cx - 8)}Z`);
      gear(cx, top + 25, 5, 10);
      if (chance(s, 0.6)) gear(cx - 16, top + 12, 3.5, 8);
      k.shape(taper(cx - 11, top + 16, cx - 17, top + 32, 1.6, 1.2));
      k.shape(taper(cx + 11, top + 16, cx + 17, top + 32, 1.6, 1.2));
      k.shape(`M${f(cx - 6)} ${f(top + 2)}H${f(cx + 6)}V${f(top + 13)}H${f(cx - 6)}Z`);
      k.line(`M${f(cx)} ${f(top + 2)}V${f(top - 4)}`, 0.8);
      k.shape(blob(s, cx, top - 5, 1.6, 1.6, 6, 0.02));
      k.eye(cx - 2.5, top + 6.5, 1.2);
      k.eye(cx + 2.5, top + 6.5, 1.2);
      k.line(`M${f(cx - 3)} ${f(top + 10.5)}H${f(cx + 3)}`, 0.7);
      return;
    }
    if (kind === "doll") {
      const top = g.ground - 38;
      k.shape(`M${f(cx - 4)} ${f(top + 26)}L${f(cx - 6)} ${f(g.ground)}H${f(cx - 2)}ZM${f(cx + 4)} ${f(top + 26)}L${f(cx + 6)} ${f(g.ground)}H${f(cx + 2)}Z`, { layer: "back" });
      k.shape(`M${f(cx - 8)} ${f(top + 12)}H${f(cx + 8)}L${f(cx + 11)} ${f(top + 28)}H${f(cx - 11)}Z`);
      k.line(`M${f(cx - 8)} ${f(top + 16)}l16 0M${f(cx)} ${f(top + 12)}v16`, 0.5, 0.7);
      k.line(`M${f(cx - 5)} ${f(top + 20)}l2 2M${f(cx + 3)} ${f(top + 21)}l2 -2`, 0.7);
      k.shape(taper(cx - 8, top + 13, cx - 14, top + 24, 1.6, 1.4));
      k.shape(taper(cx + 8, top + 13, cx + 14, top + 24, 1.6, 1.4));
      k.shape(blob(s, cx, top + 5, 7, 7, 8, 0.04));
      k.line(`M${f(cx - 7)} ${f(top + 3)}q7 -8 14 0`, 1.6);
      k.line(`M${f(cx - 4)} ${f(top + 3)}l2 2M${f(cx - 2)} ${f(top + 3)}l-2 2`, 0.6);
      k.eye(cx + 2.5, top + 4, 1.2);
      k.line(`M${f(cx - 3)} ${f(top + 8.5)}h1M${f(cx - 1)} ${f(top + 8.5)}h1M${f(cx + 1)} ${f(top + 8.5)}h1`, 0.6);
      return;
    }
    // Golem: blockige Steine/Holz
    const top = g.ground - rr(s, 44, 52);
    k.shape(blob(s, cx - 6, g.ground - 5, 5, 6, 6, 0.1), { layer: "back" });
    k.shape(blob(s, cx + 6, g.ground - 5, 5, 6, 6, 0.1), { layer: "back" });
    k.shape(blob(s, cx, top + 26, 14, 14, 8, 0.12));
    k.shape(blob(s, cx - 17, top + 22, 5, 9, 6, 0.1, 0.3));
    k.shape(blob(s, cx + 17, top + 22, 5, 9, 6, 0.1, -0.3));
    k.shape(blob(s, cx - 19, top + 33, 4.5, 4.5, 6, 0.12));
    k.shape(blob(s, cx + 19, top + 33, 4.5, 4.5, 6, 0.12));
    k.shape(blob(s, cx, top + 7, 7.5, 6.5, 7, 0.1));
    let cracks = "";
    for (let i = 0; i < 5; i++) cracks += `M${f(cx + rr(s, -10, 10))} ${f(top + rr(s, 16, 36))}l${f(rr(s, -3, 3))} ${f(rr(s, 2, 5))}l${f(rr(s, -3, 3))} ${f(rr(s, 1, 4))}`;
    k.line(cracks, 0.6);
    k.eye(cx - 3, top + 7, 1.3);
    k.eye(cx + 3, top + 7, 1.3);
    k.lines.push(`<circle cx="${f(cx)}" cy="${f(top + 25)}" r="3" fill="none" stroke="${k.color}" stroke-width="0.9" opacity="0.8"/>`);
  },
};

// ───────────────────────── Zusammenbau ─────────────────────────

/** Vergrößerung je Familie, damit jede Kreatur das Fenster ähnlich füllt. */
const FAMILY_SCALE = {
  quadruped: 1.32, horned: 1.18, bird: 1.2, fish: 1.2, insect: 1.35, serpent: 1.12, rodent: 1.45,
  fungus: 1.08, root: 1.08, skeleton: 1.05, candle: 1.12, moth: 1.2, construct: 1.1,
};

/** Ornamente seltener Karten (Messinglinien in den Ecken) und Glyphenring. */
function ornaments(s, color) {
  const o = [];
  const corner = (x, y, sx, sy) => `M${x} ${y + sy * 12}Q${x} ${y} ${x + sx * 12} ${y}M${x + sx * 3} ${y + sy * 9}q${sx * 2} ${sy * -6} ${sx * 7} ${sy * -6}M${x + sx * 4} ${y + sy * 4}a1.2 1.2 0 1 0 0.1 0`;
  o.push(`<path d="${corner(4, 4, 1, 1)}${corner(96, 4, -1, 1)}${corner(4, 72, 1, -1)}${corner(96, 72, -1, -1)}" fill="none" stroke="#6f5530" stroke-width="0.9" opacity="0.85"/>`);
  let glyphs = "";
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = 50 + Math.cos(a) * 33;
    const y = 38 + Math.sin(a) * 27;
    glyphs += `M${f(x)} ${f(y)}l${f(rr(s, -1.5, 1.5))} ${f(rr(s, -2, 2))}m1 0l1.2 1.2`;
  }
  o.push(`<ellipse cx="50" cy="38" rx="33" ry="27" fill="none" stroke="${color}" stroke-width="0.4" opacity="0.4"/>`);
  o.push(`<path d="${glyphs}" fill="none" stroke="#3a2d20" stroke-width="0.6" opacity="0.55"/>`);
  return o.join("");
}

/** Rissige Tintenadern verfluchter Karten. */
function inkVeins(s) {
  let d = "";
  for (let i = 0; i < 6; i++) {
    let x = pick(s, [0, 100, rr(s, 0, 100)]);
    let y = x === 0 || x === 100 ? rr(s, 0, 76) : pick(s, [0, 76]);
    d += `M${f(x)} ${f(y)}`;
    for (let j = 0; j < 6; j++) {
      x += rr(s, -9, 9) + (50 - x) * 0.12;
      y += rr(s, -7, 7) + (38 - y) * 0.12;
      d += `L${f(x)} ${f(y)}`;
      if (chance(s, 0.3)) d += `M${f(x)} ${f(y)}l${f(rr(s, -6, 6))} ${f(rr(s, -6, 6))}M${f(x)} ${f(y)}`;
    }
  }
  return `<rect width="100" height="76" fill="#2a0a0a" opacity="0.16"/><path d="${d}" fill="none" stroke="#120808" stroke-width="1.1" opacity="0.75" filter="url(#wobble)"/><path d="${d}" fill="none" stroke="#6a1010" stroke-width="0.4" opacity="0.6" transform="translate(0.5 0.4)"/>`;
}

/** @type {Map<string, string>} */
const CACHE = new Map();

/**
 * Artwork einer Karte als SVG-Text.
 * @param {{ id: string, tribe: string, rarity: string, cursed?: boolean, art: { silhouette: string, seed: number, palette?: string } }} card
 * @returns {string}
 */
export function renderArtSvg(card) {
  const key = `${card.id}|${card.art.seed}|${card.rarity}|${card.cursed ? 1 : 0}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const s = { rng: hashParts("artwork", card.art.seed, card.id) };
  const tribe = TRIBE_BY_ID[card.tribe] || TRIBE_BY_ID.stammlose;
  const color = TRIBE_BY_ID[card.art.palette]?.color || tribe.color;
  const k = new Sketch();
  k.color = color;
  const g = { cx: 50 + rr(s, -3, 3), ground: 66 + rr(s, -2, 2) };
  const family = FAMILIES[card.art.silhouette] || FAMILIES.construct;
  family(s, k, g, speciesOf(card));
  const scale = FAMILY_SCALE[card.art.silhouette] || 1;
  const flip = chance(s, 0.35);
  const wobbleSeed = Math.floor(rr(s, 1, 99));
  const hatchAngle = f(rr(s, 30, 50));

  const symbol = TRIBE_SYMBOLS[card.tribe] || TRIBE_SYMBOLS.stammlose;
  let smudges = "";
  for (let i = 0; i < 4; i++) smudges += `<ellipse cx="${f(rr(s, 10, 90))}" cy="${f(rr(s, 10, 60))}" rx="${f(rr(s, 10, 22))}" ry="${f(rr(s, 5, 12))}" fill="#2a2016" opacity="${f(rr(s, 0.05, 0.12))}"/>`;

  // Vergrößern um den Bodenpunkt, dann ggf. spiegeln
  const tf = `${flip ? "translate(100 0) scale(-1 1) " : ""}translate(${f(g.cx)} ${f(g.ground)}) scale(${scale}) translate(${f(-g.cx)} ${f(-g.ground)})`;
  const creature = `<g transform="${tf}"><g filter="url(#wobble)">${k.back.join("")}${k.body.join("")}${k.lines.join("")}</g>${k.eyes.join("")}</g>`;
  const eyes = "";
  const legendary = card.rarity === "legendary"
    ? `<ellipse cx="50" cy="40" rx="30" ry="26" fill="url(#aura)"><animate attributeName="opacity" values="0.35;0.8;0.45;0.75;0.35" dur="4.2s" repeatCount="indefinite"/></ellipse>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    "<defs>" +
    `<filter id="wobble" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="${wobbleSeed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G"/></filter>` +
    `<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${wobbleSeed + 3}"/><feColorMatrix values="0 0 0 0 0.25 0 0 0 0 0.18 0 0 0 0 0.1 0 0 0 0.55 0"/></filter>` +
    `<filter id="smudge"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<pattern id="hatch" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(${hatchAngle})"><line x1="0" y1="0" x2="0" y2="2.4" stroke="${INK}" stroke-width="0.75"/></pattern>` +
    `<pattern id="cross" patternUnits="userSpaceOnUse" width="2.2" height="2.2" patternTransform="rotate(-${hatchAngle})"><line x1="0" y1="0" x2="0" y2="2.2" stroke="${INK}" stroke-width="0.5"/></pattern>` +
    `<linearGradient id="shadeG" x1="0.1" y1="0" x2="0.8" y2="1"><stop offset="0.35" stop-color="#000"/><stop offset="0.75" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
    `<mask id="shadeMask" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#shadeG)"/></mask>` +
    `<radialGradient id="vig" cx="0.5" cy="0.45" r="0.72"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a1208" stop-opacity="0.62"/></radialGradient>` +
    `<radialGradient id="light" cx="0.35" cy="0.25" r="0.8"><stop offset="0" stop-color="#fff5dc" stop-opacity="0.55"/><stop offset="1" stop-color="#fff5dc" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="aura"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
    "</defs>" +
    `<rect width="${W}" height="${H}" fill="#d6c59c"/>` +
    `<rect width="${W}" height="${H}" fill="${color}" opacity="0.08"/>` +
    `<rect width="${W}" height="${H}" fill="url(#light)"/>` +
    `<g filter="url(#smudge)">${smudges}</g>` +
    `<g transform="translate(26 8) scale(2.5)" opacity="0.09"><path d="${symbol}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>` +
    (card.rarity === "rare" || card.rarity === "legendary" ? ornaments(s, color) : "") +
    legendary +
    `<ellipse cx="50" cy="${f(g.ground + 2)}" rx="38" ry="5" fill="url(#cross)" opacity="0.5"/>` +
    `<path d="M4 ${f(g.ground + 1)}Q30 ${f(g.ground - 1)} 50 ${f(g.ground + 1)}T96 ${f(g.ground)}" fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.6"/>` +
    creature +
    eyes +
    (card.cursed ? inkVeins(s) : "") +
    `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.55"/>` +
    `<rect width="${W}" height="${H}" fill="url(#vig)"/>` +
    "</svg>";
  CACHE.set(key, svg);
  return svg;
}

/** @type {Map<string, string>} */
const URI_CACHE = new Map();

/** Data-URI für <img> (gecacht: encodeURIComponent eines ~15-KB-SVG bei jedem Rendern wäre teuer). @param {any} card */
export function artDataUri(card) {
  const key = `${card.id}|${card.art.seed}|${card.rarity}|${card.cursed ? 1 : 0}`;
  let uri = URI_CACHE.get(key);
  if (!uri) {
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderArtSvg(card))}`;
    URI_CACHE.set(key, uri);
  }
  return uri;
}

export const SILHOUETTE_FAMILIES = Object.keys(FAMILIES);
