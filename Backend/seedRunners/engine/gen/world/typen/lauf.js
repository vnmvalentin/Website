// Welttyp „Lauflinie“ (Prototyp 14.11.2026, seit Generator-Version 5 in den Rennen) — Strecken mit vollem Schwung statt
// einzelner Züge aus dem Stand.
//
// Anlass: Audit des Pfad-Generators (61 % schlichte Sprünge, Bauart „Plattform, Lücke, Plattform“; Rückmeldung: „eintönig …
// jedes Level sollte wie ein eigenes, selbst erstelltes krasses Level sein“). Hier ist die Einheit die STRECKE
// (lauf/strecken.js): eine Hüpfkette über Säulen, ein Stachellauf am Boden, ein Bröckelsprint, eine Federbahn, ein
// Wandkick-Kamin, ein Fallschacht. Jede wird vom Läufer (lauf/spiel.js) mit der Ungenauigkeit eines Menschen in der echten
// Sim durchgespielt, ohne stehen zu bleiben; das Gelände entsteht um die geflogene Bahn (lauf/ausbau.js).
//
// Ablauf:
//   1. Strecke um Strecke bauen — jede beginnt auf der Rastplattform, auf der die vorige endet
//   2. jede Strecke mit allen Zitter-Sätzen prüfen, ausbauen (Boden, Decke, Stacheln), erneut prüfen
//   3. Kettenlauf: alle Strecken am Stück in EINER Welt (der strengste Beweis, wie beim Pfad)
//
// registry.js ZUFALLS_TYPEN nennt ihn nicht: Gewählt wird er über die Generator-Version (gen/index.js weltParams, ab gv 5:
// Lobby-Runden, Vorrat, Tagesrennen ab seinem Stichtag) und in der Werkbank.

import { createRng } from '../../../sim/rng.js';
import { LIMITS } from '../../../level/limits.js';
import { neuerBau, baueKette, baueKamin, baueSturz, pruefeStrecke, KETTEN_ARTEN } from '../lauf/strecken.js';
import { baueAus, entschaerfe } from '../lauf/ausbau.js';
import { ausschnitt, spiele, standVon } from '../lauf/spiel.js';
import { GEFAHRENFREI } from '../gemeinsam/plattform.js';
import { LAUF_AUTOR, LAUF_FORMEN, laufIdee } from '../lauf/namen.js';

/** Strecken je Level-Länge */
const STRECKEN = Object.freeze({ short: 5, medium: 8, long: 12 });
const HOEHE = 158;
/** Elemente, die das Stachel-Budget frei lässt: Bröckelplatten und Federn der noch kommenden Strecken */
const RESERVE = 200;
/** Zeilen, in denen Rastplattformen liegen dürfen (darüber und darunter bleibt Platz für Decke und Grube) */
const OBEN = 26;
const UNTEN = 128;

/** Gewicht je Streckenart (Ketten nach Spielart) */
// (die gemischten und die mit eigenen Zug-Arten vorn: Rückmeldung 14.11.2026 „jeder Sprung fühlt sich wieder gleich an“)
const GEWICHT = Object.freeze({
  mix: 3, kehre: 2, kristall: 2, nadel: 2, turbo: 1.8, ringe: 1.5, huepfer: 1.2, weit: 1.2, boden: 1.5, broeckel: 1.2, feder: 1.2,
  treppe: 1, abstieg: 1, kamin: 1.5, sturz: 1.5,
});
/** Zeilen, die eine Spielart nach oben bzw. unten braucht (Standard 9 / 7) */
const HOCH = Object.freeze({ treppe: 22, kehre: 18, mix: 16, kristall: 14, ringe: 12 });
const TIEF = Object.freeze({ abstieg: 24, mix: 12, huepfer: 10 });

/**
 * Großformen (Rückmeldung 14.11.2026: „gerne … Richtungswechsel“):
 *   strom   breite Karte, immer nach rechts, Kamine und Fallschächte führen geradeaus weiter
 *   hoch    schmale Karte, Start unten: Am Rand wendet der Weg über einen Wendekamin und läuft eine Etage höher zurück
 *   runter  schmale Karte, Start oben: Am Rand geht es durch einen Wendesturz hinab und darunter zurück
 */
const FORMEN = Object.freeze({ strom: 1, hoch: 1.7, runter: 1.7 });

/**
 * Flut (sim/elements/flut.js) in eine fertige, geprüfte Strecke setzen: im Kamin steigende Lava, in einer Kette eine Wand,
 * die hinter einem herjagt. Ihr Tempo ist ein Anteil am Tempo des Läufers auf dieser Strecke (HAERTE.flutTempo); sie
 * bleibt nur, wenn ALLE Zitter-Sätze ihr entkommen — sonst langsamer, sonst gar nicht.
 * @returns {boolean} ob eine Flut gesetzt wurde
 */
function setzeFlut(B, st, spur) {
  const H = B.haerte;
  // Wie lange braucht der mittlere Satz für die Strecke?
  const a = ausschnitt(B.grid, B.entities, st.box, st.start);
  const r = spiele(a, st.skript, st.saetze[0], { cls: B.cls, maxT: st.maxT });
  if (!r.ok || r.ticks < 60) return false;
  let zone;
  if (st.art === 'kamin') {
    // Lava im Schacht: vom Boden bis knapp unter die Ausstiegsfläche
    const s = st.schacht;
    zone = { tx: s.x0, ty: st.aus.row + 1, w: s.x1 - s.x0 + 1, h: s.unten - st.aus.row, dir: 'up', delay: 0.9 };
  } else if (st.art === 'kette') {
    // Wand hinter dem Läufer: von der Absprungkante bis vor die Rastplattform, so hoch wie die Spur
    let oben = Infinity;
    let unten = -Infinity;
    for (const t of spur) { const y = Number(t.slice(t.indexOf(',') + 1)); if (y < oben) oben = y; if (y > unten) unten = y; }
    const x0 = st.dir > 0 ? st.ein.x1 + 2 : st.aus.x1 + 2;
    const x1 = st.dir > 0 ? st.aus.x0 - 2 : st.ein.x0 - 2;
    if (!Number.isFinite(oben) || x1 - x0 < 20) return false;
    zone = { tx: x0, ty: oben - 1, w: x1 - x0 + 1, h: unten - oben + 4, dir: st.dir > 0 ? 'right' : 'left', delay: 0.6 };
  } else return false;
  if (zone.h < 3 || zone.w < 3 || zone.w > 80 || zone.h > 80 || zone.ty < 1) return false;
  const laenge = (zone.dir === 'up' ? zone.h : zone.w) * 16;
  for (const faktor of [H.flutTempo, H.flutTempo * 0.8]) {
    const speed = Math.max(20, Math.min(400, Math.round((faktor * laenge) / (r.ticks / 120))));
    const flut = B.fuege({ type: 'flut', tx: zone.tx, ty: zone.ty, w: zone.w, h: zone.h, dir: zone.dir, speed, delay: zone.delay });
    if (pruefeStrecke(B, st).ok) { st.flut = zone.dir === 'up' ? 'lava' : 'walze'; return true; }
    B.entferne(flut);
  }
  B.grund('flut-zu-schnell');
  return false;
}

/** Nächste belegte Zeile über und unter `row` in den Spalten xa…xb (belegt = Fels, Eis oder Spur einer früheren Strecke) */
function freiraum(B, xa, xb, row) {
  const x0 = Math.max(0, Math.min(xa, xb));
  const x1 = Math.min(B.W - 1, Math.max(xa, xb));
  let oben = -1;
  let unten = B.H;
  for (let x = x0; x <= x1; x++) {
    for (let y = row - 1; y > oben; y--) if (B.grid[y][x] !== '.' || B.tabu.has(`${x},${y}`)) { oben = y; break; }
    for (let y = row + 2; y < unten; y++) if (B.grid[y][x] !== '.' || B.tabu.has(`${x},${y}`)) { unten = y; break; }
  }
  return { oben, unten };
}

/** Höchste und tiefste belegte Zeile in den Spalten xa…xb */
function ausdehnung(B, xa, xb) {
  const x0 = Math.max(0, Math.min(xa, xb));
  const x1 = Math.min(B.W - 1, Math.max(xa, xb));
  let top = B.H;
  let bottom = -1;
  for (let x = x0; x <= x1; x++) {
    for (let y = 0; y < top; y++) if (B.grid[y][x] !== '.' || B.tabu.has(`${x},${y}`)) { top = y; break; }
    for (let y = B.H - 1; y > bottom; y--) if (B.grid[y][x] !== '.' || B.tabu.has(`${x},${y}`)) { bottom = y; break; }
  }
  return { top, bottom };
}

/** Der Kettenlauf: alle Strecken hintereinander in einer Welt, je Zitter-Satz. @returns {{ ok: boolean, fehl?: object }} */
export function kettenlauf(grid, entities, strecken, cls, start, saetzeMax = 5) {
  if (!strecken.length) return { ok: true };
  const skript = strecken.flatMap((s) => s.skript);
  const box = { x0: 0, y0: 0, w: grid[0].length, h: grid.length };
  const a = ausschnitt(grid, entities, box, start);
  const letzte = strecken[strecken.length - 1];
  const n = Math.min(saetzeMax, ...strecken.map((s) => s.saetze.length));
  for (let k = 0; k < n; k++) {
    const zitter = strecken.flatMap((s) => s.saetze[k].slice(0, s.skript.length));
    const r = spiele(a, skript, zitter, { cls, maxT: 120 * 240 });
    const s = standVon(r.p);
    if (!r.ok || s.y !== letzte.aus.row - 1 || s.x < letzte.aus.x0 || s.x > letzte.aus.x1) {
      // In welcher Strecke blieb der Lauf hängen?
      let rest = r.schritt;
      let bei = 0;
      while (bei < strecken.length - 1 && rest >= strecken[bei].skript.length) { rest -= strecken[bei].skript.length; bei++; }
      return { ok: false, fehl: { satz: k, strecke: bei, art: strecken[bei].spielart, grund: r.grund || (r.ok ? 'daneben' : 'tot'), ticks: r.ticks, tx: Math.floor(r.p.x / 16), ty: Math.floor(r.p.y / 16) } };
    }
  }
  return { ok: true };
}

/** Ein Bauversuch: Großform würfeln, Strecke um Strecke bauen, Kettenlauf. */
function baueVersuch(ctx, rng) {
  const { params, reach } = ctx;
  const anzahl = STRECKEN[params.length] || STRECKEN.medium;
  // Kurze Level laufen geradeaus — für Etagen ist kein Platz; `ctx.laufForm` erzwingt eine Form (Tests, Werkbank)
  const formen = Object.keys(FORMEN);
  const form = FORMEN[ctx.laufForm] ? ctx.laufForm : anzahl <= 5 ? 'strom' : rng.weighted(formen, formen.map((x) => FORMEN[x]));
  const breite = form === 'strom' ? Math.min(LIMITS.maxWidth - 50, 140 + anzahl * 95) : rng.intRange(430, 540);
  const grid = ctx.neuesRaster(breite, HOEHE);
  const B = neuerBau(grid, params.speedClass, reach, params.difficulty);

  // Startplattform (die gemeinsame Schicht ebnet sie und räumt den Anlauf frei — der liegt ganz über dieser Fläche)
  const start = { x: 8, y: form === 'hoch' ? rng.intRange(112, 124) : form === 'runter' ? rng.intRange(36, 46) : rng.intRange(70, 96) };
  let plat = { x0: start.x - 3, x1: start.x + 15, row: start.y + 1 };
  for (let x = plat.x0; x <= plat.x1; x++) { grid[plat.row][x] = '#'; grid[plat.row + 1][x] = '#'; }
  const startPlat = plat;
  // Kopfraum über dem Start freihalten: Die gemeinsame Schicht räumt ihn später leer — eine Etage darüber darf dort nichts haben
  // (nur bis zur Kante: Dahinter beginnt die erste Strecke)
  for (let x = plat.x0 - 2; x <= plat.x1; x++) for (let y = start.y - 15; y <= start.y; y++) B.tabu.add(`${x},${y}`);

  // Handschrift des Levels: wie eng die Röhre ist, wie oft eine Decke hängt, ob Flächen auf Säulen stehen
  const hand = {
    decke: params.difficulty >= 3 ? rng.range(0.7, 1) : rng.range(0.35, 0.9),
    saeulen: rng.range(0.3, 0.9),
    dichte: rng.range(0.55, 0.95),
    // Abstand der Decke zur Bahn in Kacheln, und ob Bodenstacheln bis an die Bahn heranreichen (ab Stufe 3)
    luft: params.difficulty >= 3 ? 1 : 2,
    knapp: params.difficulty >= 3,
  };

  /** Ist über einer Fläche Platz für das Ziel (16 Zeilen nur Luft)? */
  const kopfraumFrei = (fl) => {
    for (let x = fl.x0; x <= fl.x1; x++) for (let y = fl.row - 16; y < fl.row; y++) if (y < 0 || grid[y][x] !== '.') return false;
    return true;
  };
  const strecken = [];
  const stachelnAlle = [];
  const genutzt = new Map();
  let dir = 1;
  let startX = plat.x1 - 4;
  let vorige = '';
  let wenden = 0;
  let fertig = false;
  for (let slot = 0; slot < anzahl + 4 && !fertig; slot++) {
    const kante = dir > 0 ? plat.x1 : plat.x0;
    const raum = dir > 0 ? breite - 16 - kante : kante - 16;            // Kacheln bis zum Kartenrand
    // Was liegt voraus über und unter dem Weg? Daraus das Band, in dem Flächen liegen dürfen (darüber Platz für Sprünge
    // und Decke, darunter für die Grube)
    const fr = freiraum(B, kante + dir, kante + dir * Math.max(1, Math.min(120, raum)), plat.row);
    const bandOben = Math.max(OBEN - 6, fr.oben + 14);
    const bandUnten = Math.min(UNTEN + 6, fr.unten - 9);
    const kannKette = raum >= 105 && plat.row - 1 - 4 >= bandOben && plat.row - 1 <= bandUnten;
    // Die letzte Strecke ist immer eine Kette (breites Ziel); geht hier keine, kommt erst eine Wende oder ein Schacht
    const letzte = strecken.length >= anzahl - 1 && kannKette;
    const k = strecken.length;

    // Wende: wie hoch bzw. tief muss es gehen, damit die neue Etage über bzw. unter allem liegt, was hinter einem steht?
    const hinten = ausdehnung(B, kante - dir * 130, kante + dir * 18);
    const wendeHoch = plat.row - (hinten.top - 12 - rng.intRange(0, 2));        // Zeilen, die der Wendekamin steigt
    const wendeTief = hinten.bottom + 23 + rng.intRange(0, 3) - plat.row;       // Zeilen, die der Wendesturz fällt
    const kannWendeHoch = form === 'hoch' && k >= 1 && raum >= 22 && wendeHoch >= 14 && wendeHoch <= 30 && plat.row - wendeHoch >= OBEN;
    const kannWendeTief = form === 'runter' && k >= 1 && raum >= 22 && wendeTief >= 26 && wendeTief <= 62 && plat.row + wendeTief <= UNTEN;

    const arten = Object.keys(GEWICHT).filter((art) => {
      if (art === 'kamin') return form !== 'runter' && !letzte && k >= 1 && raum >= 45 && plat.row - 26 >= OBEN && fr.oben < plat.row - 34 && art !== vorige && (genutzt.get(art) || 0) < 2;
      if (art === 'sturz') return form !== 'hoch' && !letzte && k >= 1 && raum >= 45 && plat.row + 50 <= UNTEN && fr.unten > plat.row + 54 && art !== vorige && (genutzt.get(art) || 0) < 2;
      if (!kannKette || art === vorige) return false;
      if ((genutzt.get(art) || 0) >= (art === 'mix' ? 3 : 2)) return false;
      if (letzte && art === 'broeckel') return false;
      if (HOCH[art] && plat.row - 1 - Math.min(HOCH[art], 12) < bandOben) return false;
      if (art === 'abstieg' && plat.row - 1 + 12 > bandUnten) return false;
      return true;
    });
    const reihenfolge = [];
    const topf = [...arten];
    while (topf.length) {
      const art = rng.weighted(topf, topf.map((x) => GEWICHT[x] / (1 + (genutzt.get(x) || 0))));
      reihenfolge.push(art);
      topf.splice(topf.indexOf(art), 1);
    }
    // Wenden: am Kartenrand (keine Kette passt mehr) zuerst; sonst gelegentlich mitten in der Etage
    const wendeArt = kannWendeHoch ? 'kaminW' : kannWendeTief ? 'sturzW' : null;
    if (wendeArt && !letzte) {
      if (!kannKette) reihenfolge.unshift(wendeArt);
      else if (k - wenden >= 3 && rng.chance(0.2)) reihenfolge.unshift(wendeArt);
      else reihenfolge.push(wendeArt);
    }

    let st = null;
    for (const art of reihenfolge) {
      for (let versuch = 0; versuch < 4 && !st; versuch++) {
        const r2 = rng.fork(`s${slot}:${art}:${versuch}`);
        const marke = B.marke();
        let kandidat = null;
        if (art === 'kamin') kandidat = baueKamin(B, { rng: r2, ein: plat, startX, dir, hoehe: r2.intRange(14, 22), wende: false });
        else if (art === 'kaminW') kandidat = baueKamin(B, { rng: r2, ein: plat, startX, dir, hoehe: wendeHoch, wende: true });
        else if (art === 'sturz') kandidat = baueSturz(B, { rng: r2, ein: plat, startX, dir, riegel: r2.intRange(1, 2), wende: false });
        else if (art === 'sturzW') kandidat = baueSturz(B, { rng: r2, ein: plat, startX, dir, tiefe: wendeTief, wende: true });
        else {
          const band = { oben: Math.max(bandOben, plat.row - 1 - (HOCH[art] || 9)), unten: Math.min(bandUnten, plat.row - 1 + (TIEF[art] || 7)) };
          kandidat = baueKette(B, { rng: r2, ein: plat, startX, dir, art, band, zielBreite: letzte ? 13 : 8 });
        }
        if (!kandidat) continue;
        // Das Ziel braucht Kopfraum (die gemeinsame Schicht räumt 14 Zeilen frei): Dort darf nichts von einer anderen Etage liegen
        if (letzte && !kopfraumFrei(kandidat.aus)) { B.zurueck(marke); B.grund('ziel-kopfraum'); continue; }
        // Spur aller Zitter-Sätze, dann ausbauen und erneut prüfen; stirbt ein Satz an einem Stachel, kommt der weg
        const spur = new Set();
        if (!pruefeStrecke(B, kandidat, spur).ok) { B.zurueck(marke); B.grund('spur'); continue; }
        const stil = { decke: r2.chance(hand.decke), saeulen: r2.chance(hand.saeulen), dichte: hand.dichte, luft: hand.luft, knapp: hand.knapp };
        // Stachel-Budget: was die Elemente-Grenze übrig lässt, gleichmäßig auf die noch kommenden Strecken verteilt
        const budget = Math.floor((LIMITS.maxElements - RESERVE - B.entities.length) / Math.max(1, anzahl - k));
        const { stacheln } = baueAus(B, kandidat, spur, { rng: r2.fork('ausbau'), stil, gefahrenfrei: { x: start.x, y: start.y, r: GEFAHRENFREI + 1 }, budget });
        let gut = false;
        for (let runde = 0; runde < 10; runde++) {
          const p = pruefeStrecke(B, kandidat);
          if (p.ok) { gut = true; break; }
          if (!p.r.tot || !entschaerfe(B, stacheln, Math.floor(p.r.p.x / 16), Math.floor(p.r.p.y / 16), 2)) break;
        }
        if (!gut) { B.zurueck(marke); B.grund('ausbau'); continue; }
        kandidat.stil = stil;
        kandidat.wende = art === 'kaminW' || art === 'sturzW';
        // Flut: Lava im Kamin, eine jagende Wand in der Kette — nie gleich in der ersten Strecke
        if (k >= 1 && r2.chance(kandidat.art === 'kamin' ? B.haerte.flutKamin : kandidat.art === 'kette' ? B.haerte.flutKette : 0)) setzeFlut(B, kandidat, spur);
        // Die Spur dieser Strecke ist ab jetzt Sperrfläche für alles, was noch gebaut wird
        for (const t of spur) B.tabu.add(t);
        stachelnAlle.push(...stacheln);
        st = kandidat;
      }
      if (st) break;
    }
    if (!st) break;
    strecken.push(st);
    const kennung = st.art === 'kette' ? st.spielart : st.art;
    genutzt.set(kennung, (genutzt.get(kennung) || 0) + 1);
    vorige = kennung;
    if (st.wende) wenden = strecken.length;
    plat = st.aus;
    dir = st.ausDir || st.dir;
    startX = dir > 0 ? Math.min(plat.x1 - 2, plat.x0 + 2) : Math.max(plat.x0 + 2, plat.x1 - 2);
    if (letzte) fertig = true;
  }

  // Ging es vorzeitig nicht weiter (kein Platz mehr für eine Wende): Das Level endet auf der letzten Rastplattform, über der
  // das Ziel Platz hat — Strecken dahinter werden zurückgenommen. Fehlen höchstens zwei, gilt das Level als vollständig.
  if (!fertig) {
    while (strecken.length > 1 && !kopfraumFrei(strecken[strecken.length - 1].aus)) {
      const weg = strecken.pop();
      B.zurueck(weg.marke);
      B.grund('ende-zurueck');
    }
    const letzteSt = strecken[strecken.length - 1];
    if (letzteSt) {
      plat = letzteSt.aus;
      dir = letzteSt.ausDir || letzteSt.dir;
      fertig = strecken.length >= anzahl - 2 && kopfraumFrei(plat);
    }
  }

  // Die letzte Fläche muss das Ziel tragen (11 breit): notfalls in Laufrichtung verbreitern
  const ziel = plat;
  for (let n = 0; ziel.x1 - ziel.x0 + 1 < 11 && n < 12; n++) {
    const x = dir > 0 ? ziel.x1 + 1 : ziel.x0 - 1;
    if (x < 2 || x > breite - 3 || grid[ziel.row][x] !== '.') break;
    grid[ziel.row][x] = '#';
    grid[ziel.row + 1][x] = '#';
    if (dir > 0) ziel.x1 = x; else ziel.x0 = x;
  }

  // Kettenlauf über das ganze Level; stirbt ein Satz an einem Stachel des Ausbaus, kommt der weg (Etagen liegen dicht beieinander)
  let lauf = { ok: true };
  for (let runde = 0; runde < 12; runde++) {
    lauf = kettenlauf(grid, B.entities, strecken, params.speedClass, { x: start.x, y: start.y });
    if (lauf.ok || lauf.fehl.grund !== 'spike' || !entschaerfe(B, stachelnAlle, lauf.fehl.tx, lauf.fehl.ty, 2)) break;
  }
  return { grid, B, strecken, start, startPlat, ziel, lauf, form, hand, anzahl, breite, fertig };
}

export default {
  id: 'lauf',
  label: 'Lauflinie',
  beschreibung: 'Strecken mit vollem Schwung: Hüpfketten, Stachelläufe, Wandkehren, Kristallflüge, Kamine, Fallschächte — das Gelände folgt der Bahn.',

  kamera: 'gemischt',
  achse: 'x',
  grundstoff: 'luft',
  faehigkeiten: ['boden', 'pfad'],

  palette: {
    haupt: ['spike'],
    neben: ['crumble', 'spring', 'saw', 'crystal', 'ring', 'flut', 'boost'],
    verboten: [],
  },

  biome: ['cave', 'meadow', 'factory', 'ice', 'sky'],
  gewicht: 1,

  /**
   * @param {{params, limits, reach, neuesRaster}} ctx
   */
  baue(ctx) {
    const { params } = ctx;
    const rng = createRng(params.seed, 'welttyp:lauf');
    // Bis zu drei Bauversuche: Der erste, dessen Kettenlauf besteht und der vollständig ist, gewinnt — sonst der beste
    let bau = null;
    for (let versuch = 0; versuch < (ctx.laufEinVersuch ? 1 : 3); versuch++) {
      const b = baueVersuch(ctx, rng.fork(`bau${versuch}`));
      const besser = !bau || (b.lauf.ok && !bau.lauf.ok) || (b.lauf.ok === bau.lauf.ok && b.strecken.length > bau.strecken.length);
      if (besser) bau = b;
      if (bau.lauf.ok && bau.fertig) break;
    }
    const { grid, B, strecken, start, startPlat, ziel, lauf, form, hand, anzahl, breite } = bau;

    // Zuschneiden: bis hinter die letzte belegte Spalte
    let rechts = ziel.x1;
    for (const r of grid) for (let x = r.length - 1; x > rechts; x--) if (r[x] !== '.') { rechts = x; break; }
    for (const e of B.entities) rechts = Math.max(rechts, e.tx);
    const maxX = Math.min(breite, rechts + 14);
    for (const r of grid) r.length = maxX;

    // Checkpoints auf Rastplattformen, etwa alle drei Strecken — nie auf der letzten
    const zonen = [{ id: 'start', kind: 'lauf', x0: 0, w: startPlat.x1 + 1, entryRow: startPlat.row, exitRow: startPlat.row, pruefpunkt: false }];
    strecken.forEach((s, i) => {
      const cp = i < strecken.length - 1 && i % 3 === 2;
      zonen.push({
        id: `s${i}`, kind: 'lauf', x0: s.aus.x0, w: s.aus.x1 - s.aus.x0 + 1, entryRow: s.aus.row, exitRow: s.aus.row,
        cpX: Math.round((s.aus.x0 + s.aus.x1) / 2), cpY: s.aus.row - 1, pruefpunkt: cp,
      });
    });
    zonen.push({ id: 'ziel', kind: 'lauf', x0: ziel.x0, w: ziel.x1 - ziel.x0 + 1, entryRow: ziel.row, exitRow: ziel.row, pruefpunkt: false });

    // Brücken für den Bewegungsgraph: jede Strecke von ihrer Eingangs- zur Ausgangsplattform (belegt durch die Sim)
    const stand = (p) => Array.from({ length: p.x1 - p.x0 + 1 }, (_, i) => ({ x: p.x0 + i, y: p.row - 1 }));
    const abschnitte = strecken.map((s) => ({ von: stand(s.ein), nach: stand(s.aus), kosten: 1 }));

    const arten = {};
    for (const s of strecken) arten[s.name] = (arten[s.name] || 0) + 1;
    // Zug-Arten über das ganze Level (für die Abwechslungs-Messung): Sprunggrößen, Kick, Dash, Ring, Fall, Röhren, Sägen
    const zugArten = {};
    for (const s of strecken) {
      if (s.flut) zugArten[s.flut] = (zugArten[s.flut] || 0) + 1;
      if (s.zuege) for (const [z, c] of Object.entries(s.zuege)) zugArten[z] = (zugArten[z] || 0) + c;
      else zugArten[s.art] = (zugArten[s.art] || 0) + 1;
    }
    return {
      grid,
      zonen,
      marken: { start, ziel: { x: Math.round((ziel.x0 + ziel.x1) / 2), y: ziel.row - 1 } },
      entities: B.entities,
      anchors: [],
      abschnitte,
      notizen: {
        form,
        wenden: strecken.filter((s) => s.wende).length,
        // Titel wie bei Pfad-Leveln „Leitidee · Autor“ (ui/levelRef.js): die Großform und „Lauflinie“; die Werkbank zeigt
        // im Satz die Abfolge der Strecken
        thema: LAUF_AUTOR,
        leitidee: { id: laufIdee(form), name: LAUF_FORMEN[form] || form, satz: strecken.map((s) => s.name).join(' → ') },
        strecken: strecken.map((s) => s.name),
        arten,
        zugArten,
        zuege: strecken.reduce((x, s) => x + s.skript.length, 0),
        geplant: anzahl,
        kettenlauf: lauf,
        // Skript und Zitter-Sätze je Strecke — für Tests und Werkzeuge (Kettenlauf mit frischen Sätzen)
        pruef: strecken.map((s) => ({ name: s.name, skript: s.skript, saetze: s.saetze, aus: s.aus })),
        gruende: B.gruende,
        handschrift: { decke: Math.round(hand.decke * 100) / 100, saeulen: Math.round(hand.saeulen * 100) / 100, dichte: Math.round(hand.dichte * 100) / 100, luft: hand.luft },
      },
    };
  },
};

export { KETTEN_ARTEN };
