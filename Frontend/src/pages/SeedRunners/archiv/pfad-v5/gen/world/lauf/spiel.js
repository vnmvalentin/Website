// Lauflinie — der Läufer: spielt ein Skript aus Schritten in der ECHTEN Sim, ohne je stehen zu bleiben.
//
// Der Pfad-Generator (gen/world/pfad) prüft jeden Zug aus dem Stand und lässt ihn im Stand enden — daraus wird „Plattform,
// Lücke, Plattform“ (Audit 14.11.2026: 61 % schlichte Sprünge). Hier ist die Einheit eine STRECKE: mehrere Aktionen mit
// vollem Schwung hintereinander, das Gelände entsteht um die geflogene Bahn (strecken.js).
//
// Damit sich Ungenauigkeiten nicht aufsummieren (Lehre aus dem Flappy-Seil: „Griffe nach LAGE, nicht nach Zeit“), reagiert
// der Läufer auf den ZUSTAND, nicht auf die Uhr: Er springt, wenn er die Absprunglinie erreicht, kickt, wenn er die Wand
// berührt, steuert auf eine Stelle zu. Ein Mensch macht es genauso. Die Ungenauigkeit eines Menschen steckt im `zittern`:
// je Schritt eine Reaktionszeit, eine verschobene Absprunglinie und eine andere Haltedauer.
//
// Schritte:
//   { a: 'sprung', dir, abX, halte, doppel?: { nach, halte }, loslassen?, kick?: { reaktion, halte }, dash?: { reaktion, hoch } }
//        laufen, bis die Vorderkante `abX` (px) erreicht, springen (`halte` Ticks gehalten), optional Luftsprung `nach` Ticks
//        nach dem Absprung, optional die Richtung ab `loslassen` Ticks nach dem Absprung nicht mehr halten. Ende: Landung.
//        kick: an der Wand in Laufrichtung abspringen und zurück halten (die Landung liegt dann HINTER einem).
//        dash: sobald ein Kristall die Ladung gibt, dashen (waagerecht oder mit `hoch` schräg hinauf).
//   { a: 'flug', dir }     Richtung halten, bis man nach einer Flugphase wieder steht (Feder, Kante)
//   { a: 'kamin', dir, obenY, aus, reaktion, halte }
//        Wandkicks: zur Wand halten, bei Kontakt nach `reaktion` Ticks abspringen (`halte`) und zur anderen Wand halten —
//        bis die Füße über `obenY` (px) sind, dann nach `aus` (±1) hinaus. Ende: Landung oberhalb von `obenY`.
//   { a: 'sturz', dir, ziele: [{ y, x }] }
//        über die Kante laufen und im Fallen steuern: Solange die Füße über `y` (px) sind, auf die Mitte `x` (px) zu.
//        Ende: Landung.
//   { a: 'lauf', dir, bisX }   laufen, bis die Vorderkante `bisX` erreicht

import { INPUT } from '../../../sim/inputBits.js';
import { createWorld, stepWorld } from '../../../sim/world.js';
import { parseMap } from '../../../sim/tilemap.js';
import { classTuning } from '../../../sim/classes.js';
import { TILE, PLAYER_W, PLAYER_H } from '../../../sim/config.js';

/** Ungenauigkeit eines Menschen in Ticks (120 Hz): Reaktion bis 50 ms, Haltedauer ±33 ms, Absprunglinie bis 10 px früher */
export const ZITTER = Object.freeze({ reaktion: 6, halte: 4, versatz: 10 });

const taste = (dir) => (dir > 0 ? INPUT.RIGHT : INPUT.LEFT);
const vorne = (p, dir) => (dir > 0 ? p.x + PLAYER_W : p.x);

/**
 * Zittern für ein Skript: je Schritt { r, h, v } — Reaktionszeit (Ticks, ≥ 0), Haltedauer (± Ticks), Absprunglinie (px
 * früher, ≥ 0). `art`: 'mitte' (keine Abweichung), 'frueh', 'spaet' oder ein Zufallsstrom.
 */
export function zittern(n, art, faktor = 1) {
  const R = Math.round(ZITTER.reaktion * faktor);
  const H = Math.round(ZITTER.halte * faktor);
  const V = Math.round(ZITTER.versatz * faktor);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (art === 'mitte') out.push({ r: Math.min(2, R), h: 0, v: Math.min(4, V) });
    else if (art === 'frueh') out.push({ r: 0, h: -H, v: V });
    else if (art === 'spaet') out.push({ r: R, h: H, v: 0 });
    else out.push({ r: art.intRange(0, R), h: art.intRange(-H, H), v: art.intRange(0, V) });
  }
  return out;
}

/**
 * Die Zitter-Sätze einer Strecke: Mitte, beide Ränder und `zufall` gewürfelte. `faktor` staucht die Ungenauigkeit — auf
 * hohen Schwierigkeitsstufen wird mit weniger Spielraum gebaut (schmalere Spur, engere Landungen).
 */
export function zitterSaetze(rng, n, zufall = 8, faktor = 1) {
  const saetze = [zittern(n, 'mitte', faktor), zittern(n, 'frueh', faktor), zittern(n, 'spaet', faktor)];
  for (let k = 0; k < zufall; k++) saetze.push(zittern(n, rng, faktor));
  return saetze;
}

/**
 * Eingabe eines Skripts: (welt, zustand) → Tastenmaske. `zustand.i` = laufender Schritt; ist das Skript zu Ende, hält der
 * Läufer an (zustand.fertig).
 */
export function laeufer(skript, zitter) {
  return (welt, z) => {
    const p = welt.player;
    if (z.i === undefined) { z.i = 0; z.t = 0; }
    z.t++;
    for (let schutz = 0; schutz < 4; schutz++) {
      const s = skript[z.i];
      if (!s) { z.fertig = true; return 0; }
      const j = zitter[z.i] || { r: 0, h: 0, v: 0 };
      const weiter = () => { z.i++; z.ab = undefined; z.luft = false; z.ausl = undefined; z.wand = undefined; z.kontakt = undefined; z.druckBis = undefined; z.oben = false; z.gekickt = false; z.gedasht = false; z.dashAb = undefined; };

      if (s.a === 'lauf') {
        if (s.dir > 0 ? vorne(p, 1) >= s.bisX : vorne(p, -1) <= s.bisX) { weiter(); continue; }
        return taste(s.dir);
      }

      if (s.a === 'sprung') {
        if (z.ab === undefined) {
          if (z.ausl === undefined) {
            if (!p.onGround) return taste(s.dir);
            const linie = s.abX - s.dir * j.v;
            const erreicht = s.dir > 0 ? vorne(p, 1) >= linie : vorne(p, -1) <= linie;
            if (!erreicht) return taste(s.dir);
            z.ausl = z.t;
          }
          // (die Reaktionszeit läuft auch, wenn man dabei über die Kante gerät — den Absprung trägt dann die Coyote-Zeit)
          if (z.t - z.ausl < j.r) return taste(s.dir);
          z.ab = z.t;
        }
        const seit = z.t - z.ab;
        if (!p.onGround) z.luft = true;
        // (gelandet — aber erst, wenn man wirklich in der Luft war und der Druck vorbei ist)
        if (z.luft && p.onGround && seit > 4) { weiter(); continue; }
        // Wandkick: Berührt man im Flug die Wand in Laufrichtung, nach `reaktion` Ticks abspringen und ab da zurück halten
        if (s.kick && !z.gekickt && z.luft && p.wallDir === s.dir) {
          if (z.kontakt === undefined) z.kontakt = z.t;
          if (z.t - z.kontakt >= s.kick.reaktion + j.r) { z.gekickt = true; z.druckBis = z.t + Math.max(3, s.kick.halte + j.h); }
        }
        if (z.gekickt) return taste(-s.dir) | (z.t < z.druckBis ? INPUT.JUMP : 0);
        let m = s.loslassen != null && seit >= s.loslassen ? 0 : taste(s.dir);
        if (seit < Math.max(3, s.halte + j.h)) m |= INPUT.JUMP;
        if (s.doppel && seit >= s.doppel.nach + j.r && seit < s.doppel.nach + j.r + Math.max(3, s.doppel.halte + j.h)) m |= INPUT.JUMP;
        // Dash: sobald ein Kristall die Ladung gegeben hat (+Reaktion), einmal dashen — nach Zustand, nicht nach Zeit
        // (die Taste drei Ticks lang, auch wenn die Ladung dabei schon verbraucht ist — erst danach gilt der Dash als getan)
        if (s.dash && !z.gedasht && z.luft) {
          if (z.dashAb === undefined && p.dashCharges > 0) z.dashAb = z.t + s.dash.reaktion + j.r;
          if (z.dashAb !== undefined && z.t >= z.dashAb) {
            m = taste(s.dir) | INPUT.DASH | (s.dash.hoch ? INPUT.UP : 0);
            if (z.t >= z.dashAb + 2) z.gedasht = true;
          }
        }
        return m;
      }

      if (s.a === 'flug') {
        if (!p.onGround && (p.vy > 40 || p.vy < -40)) z.luft = true;
        if (z.luft && p.onGround) { weiter(); continue; }
        // (kommt gar keine Flugphase — die Feder fehlt noch bei der Probe —, endet der Schritt nach einer Sekunde)
        if (z.ab === undefined) z.ab = z.t;
        if (!z.luft && z.t - z.ab > 120) { weiter(); continue; }
        return taste(s.dir);
      }

      if (s.a === 'kamin') {
        const fuesse = p.y + PLAYER_H;
        if (z.wand === undefined) z.wand = s.dir;
        const drueckt = z.druckBis !== undefined && z.t < z.druckBis;
        if (p.onGround) {
          // oben angekommen
          if (fuesse <= s.obenY + 2) { weiter(); continue; }
          // Am Boden des Schachts (auch nach einem Absturz): zur fernen Wand und hochspringen — die Taste jedes Mal neu drücken
          z.wand = s.dir;
          z.kontakt = undefined;
          if (z.druckBis === undefined || z.t >= z.druckBis + 6) z.druckBis = z.t + Math.max(3, s.halte + j.h);
          return taste(z.wand) | (z.t < z.druckBis ? INPUT.JUMP : 0);
        }
        // Über der Kante: hinaus (ein laufender Sprungdruck wird zu Ende gehalten). Sinkt man wieder darunter, wird weiter gekickt.
        if (fuesse < s.obenY - 4) return taste(s.aus) | (drueckt ? INPUT.JUMP : 0);
        let m = taste(z.wand);
        if (drueckt) return m | INPUT.JUMP;
        if (p.wallDir === z.wand) {
          if (z.kontakt === undefined) z.kontakt = z.t;
          if (z.t - z.kontakt >= s.reaktion + j.r) {
            z.wand = -z.wand;
            z.kontakt = undefined;
            z.druckBis = z.t + Math.max(3, s.halte + j.h);
            m = taste(z.wand) | INPUT.JUMP;
          }
        } else z.kontakt = undefined;
        return m;
      }

      if (s.a === 'sturz') {
        if (z.ab === undefined) {
          // (erst wenn man wirklich fällt: Im ersten Tick nach dem Einsetzen steht man noch nicht auf dem Boden)
          if (p.onGround || p.vy < 40) return taste(s.dir);
          z.ab = z.t;
        }
        if (p.onGround && z.t - z.ab > 4) { weiter(); continue; }
        const fuesse = p.y + PLAYER_H;
        const ziel = s.ziele.find((q) => fuesse < q.y) || s.ziele[s.ziele.length - 1];
        const mitte = p.x + PLAYER_W / 2;
        // (träge wie ein Mensch: erst ab ein paar Pixeln Abstand gegensteuern, das Zittern verschiebt die Schwelle)
        const tot = 3 + j.v / 2;
        if (mitte < ziel.x - tot) return INPUT.RIGHT;
        if (mitte > ziel.x + tot) return INPUT.LEFT;
        return 0;
      }
      weiter();
    }
    return 0;
  };
}

/** Kacheln, die der Körper bei (x, y) berührt, in `set` eintragen ("x,y" in Kacheln des Ausschnitts + Versatz) */
function beruehre(set, p, ox, oy) {
  const tx0 = Math.floor(p.x / TILE);
  const tx1 = Math.floor((p.x + PLAYER_W - 0.01) / TILE);
  const ty0 = Math.floor(p.y / TILE);
  const ty1 = Math.floor((p.y + PLAYER_H - 0.01) / TILE);
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) set.add(`${x + ox},${y + oy}`);
}

/**
 * Welt auf einem Ausschnitt des Rasters. `box` = { x0, y0, w, h } in Rasterkacheln (wird an den Rasterrand geklemmt),
 * `start` = Standkachel im Raster (Luft über festem Boden).
 * @returns {{ karte: object, x0: number, y0: number }}
 */
export function ausschnitt(grid, entities, box, start) {
  const W = grid[0].length;
  const H = grid.length;
  const x0 = Math.max(0, Math.min(W - 1, box.x0));
  const y0 = Math.max(0, Math.min(H - 1, box.y0));
  const x1 = Math.max(x0 + 1, Math.min(W, box.x0 + box.w));
  const y1 = Math.max(y0 + 1, Math.min(H, box.y0 + box.h));
  const rows = [];
  for (let y = y0; y < y1; y++) {
    let z = '';
    for (let x = x0; x < x1; x++) {
      const ch = grid[y][x];
      z += x === start.x && y === start.y ? 'S' : (ch === 'S' || ch === 'E' || ch === 'C' ? '.' : ch);
    }
    rows.push(z);
  }
  const ents = [];
  for (const e of entities) {
    if (e.tx < x0 || e.tx >= x1 || e.ty < y0 || e.ty >= y1) continue;
    ents.push({ ...e, tx: e.tx - x0, ty: e.ty - y0 });
  }
  return { karte: parseMap(rows, { entities: ents }), x0, y0 };
}

/**
 * Ein Skript auf einem Ausschnitt spielen.
 * @param {{ karte, x0, y0 }} aus       von ausschnitt() — die Karte wird nicht verändert, mehrere Läufe dürfen sie teilen
 * @param {object[]} skript             Schritte in AUSSCHNITT-Pixeln? Nein: in RASTER-Pixeln; der Versatz wird hier abgezogen
 * @param {object[]} zitter
 * @param {{ cls: string, maxT?: number, bis?: (p, welt, z) => boolean, spur?: Set<string> }} opt
 *   bis   vorzeitiges Ende (Probe ohne Ziel): bekommt den Spieler in RASTER-Pixeln
 *   spur  hier werden die berührten Rasterkacheln eingetragen (mit `spurAb`: erst ab diesem Schritt)
 * @returns {{ ok: boolean, tot: boolean, grund?: string, fertig: boolean, gestoppt: boolean, p: {x,y,vx,vy,boden}, schritt: number, ticks: number }}
 */
export function spiele(aus, skript, zitter, opt) {
  const ox = aus.x0 * TILE;
  const oy = aus.y0 * TILE;
  // Skript in Ausschnitt-Pixel umrechnen (flache Kopie je Schritt)
  const lokal = skript.map((s) => {
    const t = { ...s };
    if (t.abX != null) t.abX -= ox;
    if (t.bisX != null) t.bisX -= ox;
    if (t.obenY != null) t.obenY -= oy;
    if (t.ziele) t.ziele = t.ziele.map((q) => ({ x: q.x - ox, y: q.y - oy }));
    return t;
  });
  const welt = createWorld(aus.karte, { tuning: classTuning(opt.cls) });
  const eingabe = laeufer(lokal, zitter);
  const z = {};
  const maxT = opt.maxT ?? 2400;
  const lage = () => ({ x: welt.player.x + ox, y: welt.player.y + oy, vx: welt.player.vx, vy: welt.player.vy, boden: welt.player.onGround });
  let t = 0;
  let vorher = lage();
  for (; t < maxT; t++) {
    const maske = eingabe(welt, z);
    if (z.fertig) return { ok: true, tot: false, fertig: true, gestoppt: false, p: lage(), schritt: z.i, ticks: t };
    stepWorld(welt, maske);
    // (beim Tod setzt die Sim den Spieler im selben Tick an den Start zurück — gemeldet wird die Stelle davor)
    if (welt.deaths) return { ok: false, tot: true, grund: welt.deathReason, fertig: false, gestoppt: false, p: vorher, schritt: z.i, ticks: t };
    vorher = lage();
    if (opt.spur && (opt.spurAb == null || z.i >= opt.spurAb)) beruehre(opt.spur, welt.player, aus.x0, aus.y0);
    if (opt.bis && opt.bis(lage(), welt, z)) return { ok: true, tot: false, fertig: false, gestoppt: true, p: lage(), schritt: z.i, ticks: t };
  }
  return { ok: false, tot: false, grund: 'zeit', fertig: false, gestoppt: false, p: lage(), schritt: z.i, ticks: t };
}

/** Standkachel (Luft über Fels) aus einer Pixelposition */
export const standVon = (p) => ({ x: Math.floor((p.x + PLAYER_W / 2) / TILE), y: Math.floor((p.y + PLAYER_H - 1) / TILE) });
