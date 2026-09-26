// Füllung: Gelände und Gefahren um den fertigen Weg — nach dem Vorbild der Level des Nutzers (Rückmeldung 25.09.2026):
//   „Stacheln nur da, wo man bei einem Sprung failen kann, oder an knappen Sprüngen … für die Wände immer Eiswände, wo man
//   nicht drüber cheaten soll, weil man da keine Wandsprünge machen kann."
//
//   1. Grube      unter jeder Flugbahn ein flacher Stachelboden — darunter GELÄNDE: Fels bis zum Kartenrand (keine
//                 schwebenden Streifen mehr). Wer patzt, stirbt.
//   2. Säulen     in manchen Szenen stehen die Plattformen auf Felssäulen bis hinunter zum Grubenboden
//   3. Landekante Stacheln auf den Teilen der Landeplattform, die weder zum Landen noch zum Anlauf gebraucht werden
//   4. Umgebung   Grotte: Felsdecke bis zum oberen Kartenrand; Halle: Eiswände, Decke, Stachelboden
//   5. Kappen     Bauteile des Planers mit Stachel obendrauf (Wand A, Laser-Sender, Seilgang-Decke) wachsen, wo es geht,
//                 als Fels bis zum oberen Rand — dann ist die Stachel überflüssig und fällt weg
//   Zum Schluss werden alle freien Seitenflächen der Füllung Eis: Dort kann niemand per Wandsprung abkürzen.
//
// Was es NICHT mehr gibt: Deckel (Block mit Stacheln oben und unten über Bögen), Stacheln an Grotten-Decken, einzelne
// schwebende Stacheln. Gelände wird nur gebaut, wo es bis zum Kartenrand oder an vorhandenen Fels reicht — sonst entstünde
// eine freie Oberseite, auf der man stehen und abkürzen könnte. Die Füllung ist in GRUPPEN (Säulen) organisiert: Muss
// etwas zurückgenommen werden, dann immer eine ganze Säule samt Stachel.
//
// Nichts davon liegt je in einer berührten Kachel eines Zugs; am Ende wird trotzdem jeder Zug auf der fertigen Karte
// erneut gespielt (verifiziere()).

import { pruefeZug } from './planer.js';
import { beruehrteKacheln } from './probe.js';

const ROCK = '#';
const ICE = 'I';
const AIR = '.';
const k = (x, y) => `${x},${y}`;
const fest = (c) => c === ROCK || c === ICE;

/**
 * @param {object} p
 * @param {string[][]} p.grid
 * @param {object[]} p.entities       wird ergänzt (Stacheln); Planer-Stacheln mit `kappe`/`sockel` werden ggf. zu Gelände
 * @param {Set<string>} p.korridor    berührte Kacheln + reservierter Kopfraum (planer.js)
 * @param {object[]} p.schritte       Züge mit `beruehrt` (Set), `ziel`, `szene`
 * @param {object} p.rng
 * @param {number} p.d                Schwierigkeit
 * @param {{x,y}} p.start             Standkachel am Start (dort bleibt es gefahrenfrei)
 * @param {number} [p.maxStacheln]    Obergrenze für Stacheln der Füllung (Level dürfen höchstens 600 Elemente haben)
 * @returns {{ gesetzt: Set<string>, gruppen: Map<string, {kacheln: string[]}>, gruppeVon: Map<string, string> }}
 */
export function fuelle({ grid, entities, korridor, schritte, rng, d, start, maxStacheln = 450, szenen = [], halle = false, hand = null }) {
  const gesetzt = new Set();
  const gruppen = new Map();
  const gruppeVon = new Map();
  const H = grid.length;
  const W = grid[0].length;
  const nahStart = (x, y) => Math.abs(x - start.x) < 15 && Math.abs(y - start.y) < 15;   // feste Regel: gefahrenfrei
  // Kacheln, auf denen ein Element sitzt (im Raster Luft, aber belegt)
  const belegt = new Set(entities.map((e) => k(e.tx, e.ty)));
  const drin = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const frei = (x, y) => drin(x, y) && grid[y][x] === AIR && !korridor.has(k(x, y)) && !belegt.has(k(x, y)) && !nahStart(x, y);

  let gid = 0;
  const neueGruppe = (art) => { const id = `g${gid++}`; gruppen.set(id, { art, kacheln: [] }); return id; };
  const setze = (x, y, ch, g) => {
    grid[y][x] = ch;
    gesetzt.add(k(x, y));
    belegt.add(k(x, y));
    gruppen.get(g).kacheln.push(k(x, y));
    gruppeVon.set(k(x, y), g);
  };
  const stachel = (x, y, dir, art, g) => {
    entities.push({ type: 'spike', tx: x, ty: y, dir, fuellung: art });
    gesetzt.add(k(x, y));
    belegt.add(k(x, y));
    if (g) { gruppen.get(g).kacheln.push(k(x, y)); gruppeVon.set(k(x, y), g); }
  };
  /**
   * Freie Kacheln einer Säule ab (x, y0) in Richtung dy bis zum Kartenrand oder an Fels.
   * @returns {number[]|null} die Zeilen — oder null, wenn der Lauf vorher auf etwas anderes trifft (Korridor, Element)
   */
  const saeulenLauf = (x, y0, dy) => {
    const ys = [];
    for (let y = y0; ; y += dy) {
      if (y < 0 || y >= H) return ys;
      if (fest(grid[y][x])) return ys;
      if (!frei(x, y)) return null;
      ys.push(y);
    }
  };

  // Aussehen je Szene: Säulen (Plattformen auf Fels, dazwischen Stachelgruben — Gelände) oder schwebend (freie Plattformen
  // über dem Abgrund; wer fällt, fällt aus der Karte). Die Halle hat ihren eigenen Boden.
  const saeulenSzene = szenen.map((sz) => !halle && !!sz.saeulen);

  // 1. Grube unter jeder Flugbahn in Säulen-Szenen: Stachelreihe über die ganze Breite des Zugs, darunter Gelände bis zum
  //    unteren Rand (oder bis es auf etwas trifft — eine hängende Unterseite ist keine Standfläche)
  // (Handschrift: manche setzen den Grubenboden knapper unter den Sprung als andere)
  const tiefe = Math.max(2, [6, 5, 4, 4, 3][d - 1] + (hand ? hand.tiefe : 0));
  for (const s of schritte) {
    if (!saeulenSzene[s.szene]) continue;
    const tiefste = new Map();                               // Spalte → tiefste berührte Zeile dieses Zugs
    for (const key of s.beruehrt) {
      const [x, y] = key.split(',').map(Number);
      tiefste.set(x, Math.max(tiefste.get(x) ?? -1, y));
    }
    // Ein FLACHER Stachelboden unter der ganzen Lücke, knapp unter dem tiefsten Punkt des Sprungs
    const luecke = [];
    for (const [x, yMax] of tiefste) {
      let darunter = false;                                  // steht unter der Bahn schon etwas (eine Plattform)?
      for (let y = yMax + 1; y <= yMax + tiefe + 1 && !darunter; y++) if (y < H && grid[y][x] !== AIR) darunter = true;
      if (!darunter) luecke.push(x);
    }
    if (!luecke.length) continue;
    // …und immer mindestens 2 Zeilen unter beiden Plattformen des Zugs (bei Abstiegen läge sie sonst neben der Landefläche)
    const ys = Math.max(Math.max(...luecke.map((x) => tiefste.get(x))) + tiefe, s.ziel.row + 2, s.von.y + 3);
    if (ys + 1 >= H) continue;
    // Über die ganze Breite des Zugs (auch unter den Plattformen — dort stoßen gleich die Säulen darauf); nur die Tiefe
    // richtet sich nach der Lücke. Schmale Streifen nur unter der Lücke sahen wie dünne Eisstriche aus.
    // (Portal: Die Bahn reicht vom Eingang bis zum Ausgang — dort nur die Lücke)
    const xs = s.zug.art === 'portal' ? luecke : [...tiefste.keys()];
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
      if (!frei(x, ys) || !frei(x, ys + 1)) continue;
      const g = neueGruppe('grube');
      gruppen.get(g).grube = s;                              // zu welcher Grube (Zug) die Säule gehört — fürs Ausdünnen
      stachel(x, ys, 'up', 'grube', g);
      setze(x, ys + 1, ROCK, g);
      for (let y = ys + 2; y < H && frei(x, y); y++) setze(x, y, ROCK, g);
    }
  }

  // 2. Säulen: In Säulen-Szenen stehen die Plattformen auf Fels bis hinunter — ganz oder gar nicht
  schritte.forEach((s) => {
    if (!saeulenSzene[s.szene] || s.ziel.broeckel) return;
    const laeufe = [];
    for (let x = s.ziel.x0; x <= s.ziel.x1; x++) {
      if (grid[s.ziel.row][x] !== ROCK) return;
      const lauf = saeulenLauf(x, s.ziel.row + 1, 1);
      if (!lauf) return;
      laeufe.push([x, lauf]);
    }
    const g = neueGruppe('saeule');
    for (const [x, lauf] of laeufe) for (const y of lauf) setze(x, y, ROCK, g);
  });

  // 3. Landekanten: Plattformteile, die kein Zug berührt, werden Stachel — je höher die Stufe, desto häufiger
  // (nicht unter einem Fallblock: Ein Brückenblock landet auf diesen Kacheln)
  const fallbloecke = entities.filter((e) => e.type === 'fallingBlock');
  const unterFallblock = (x, y) => fallbloecke.some((e) => x >= e.tx && x < e.tx + (e.width || 1) && y > e.ty);
  const bahn = new Set();
  for (const s of schritte) for (const key of s.beruehrt) bahn.add(key);
  // (Handschrift: mancher besetzt Landekanten dichter, mancher kaum)
  const kanteQuote = Math.min(0.97, [0, 0.3, 0.6, 0.8, 0.95][d - 1] * (hand ? hand.stacheln : 1));
  schritte.forEach((s, i) => {
    // (…auch nicht auf der Zielplattform, wenn noch ein Zielschalter-Sprung folgt — dort sitzt das Ziel im Käfig;
    // `zielPlattform` setzt der Planer, der Schalter-Sprung landet auf einem Teilstück davon)
    if (i === schritte.length - 1 || s.ziel.zielPlattform || s.ziel.broeckel || s.ziel.farbe != null) return;   // Ziel frei; Bröckel-/Farbblöcke sind Elemente
    const y = s.ziel.row - 1;
    for (let x = s.ziel.x0; x <= s.ziel.x1; x++) {
      if (bahn.has(k(x, y)) || grid[y][x] !== AIR || belegt.has(k(x, y)) || nahStart(x, y) || unterFallblock(x, y)) continue;
      if (rng.range(0, 1) >= kanteQuote) continue;
      stachel(x, y, 'up', 'kante', null);
    }
  });

  // 4. Umgebung. Decken wachsen bis zum oberen Rand — ganz oder gar nicht je Spalte, damit keine Oberseite frei liegt.
  const kasten = (liste) => {
    const xs = []; const ys = [];
    for (const s of liste) for (const key of s.beruehrt) { const [x, y] = key.split(',').map(Number); xs.push(x); ys.push(y); }
    return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null;
  };
  const decke = (x0, x1, y) => {
    for (let x = x0; x <= x1; x++) {
      if (y < 1 || !frei(x, y)) continue;
      const lauf = saeulenLauf(x, y, -1);
      if (!lauf) continue;
      const g = neueGruppe('decke');
      for (const yy of lauf) setze(x, yy, ROCK, g);
    }
  };
  // Grotte: Die Decke folgt dem Weg — je Spalte 3 Zeilen über dem höchsten Punkt der Bahn in ±3 Spalten (flach auf die
  // höchste Stelle der Szene gesetzt, hing sie als riesiger Klotz weit über dem Weg)
  szenen.forEach((sz, i) => {
    if (sz.stil !== 'grotte') return;
    const oben = new Map();
    for (const s of schritte) {
      if (s.szene !== i) continue;
      for (const key of s.beruehrt) {
        const [x, y] = key.split(',').map(Number);
        for (let dx = -3; dx <= 3; dx++) oben.set(x + dx, Math.min(oben.get(x + dx) ?? Infinity, y));
      }
    }
    for (const [x, y] of oben) decke(x, x, y - 3);
  });
  if (halle) {
    const b = kasten(schritte);
    if (b) {
      const x0 = b.x0 - 3; const x1 = b.x1 + 3; const y0 = b.y0 - 4; const y1 = b.y1 + 4;
      decke(x0 - 1, x1 + 1, y0);
      for (const x of [x0 - 1, x0, x1, x1 + 1]) {
        const g = neueGruppe('wand');
        for (let y = y0 + 1; y < H; y++) if (frei(x, y)) setze(x, y, ICE, g);
      }
      for (let x = x0 + 1; x < x1; x++) {
        if (!frei(x, y1 - 1) || !frei(x, y1)) continue;
        const g = neueGruppe('grube');
        stachel(x, y1 - 1, 'up', 'grube', g);
        for (let y = y1; y < H && frei(x, y); y++) setze(x, y, ROCK, g);
      }
    }
  }

  // 5. Kappen des Planers zu Gelände: wächst der Fels unter der Stachel nach oben an Fels oder an den Rand, braucht es
  //    sie nicht mehr. Breite Kappen (Seilgang-Decke, ab 3 Kacheln) dürfen bis zum Rand wachsen; einzelne (Wand, Laser-
  //    Sender) nur, wenn sie binnen 20 Zeilen an Fels stoßen (etwa an die Grotten-Decke) — sonst stünden dünne Striche bis zum oberen Rand.
  //    Sockel (Laser-Fänger) wachsen nach unten wie der Grubenboden.
  const kappen = new Set(entities.filter((e) => e.type === 'spike' && e.kappe).map((e) => k(e.tx, e.ty)));
  const breite = (e) => { let n = 1; for (let x = e.tx - 1; kappen.has(k(x, e.ty)); x--) n++; for (let x = e.tx + 1; kappen.has(k(x, e.ty)); x++) n++; return n; };
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (e.type !== 'spike' || (!e.kappe && !e.sockel)) continue;
    if (e.kappe) {
      belegt.delete(k(e.tx, e.ty));
      const lauf = saeulenLauf(e.tx, e.ty, -1);
      // an Fels gestoßen (nicht am oberen Rand geendet) und kurz genug?
      const anFels = lauf && lauf.length <= 20 && (lauf.length === 0 || lauf[lauf.length - 1] > 0);
      if (!lauf || (breite(e) < 3 && !anFels)) { belegt.add(k(e.tx, e.ty)); continue; }
      entities.splice(i, 1);
      const g = neueGruppe('kappe');
      gruppen.get(g).stachel = e;                            // wird die Säule zurückgenommen, kommt die Stachel wieder
      for (const y of lauf) setze(e.tx, y, ROCK, g);
    } else {
      const g = neueGruppe('sockel');
      for (let y = e.ty + 2; y < H && frei(e.tx, y); y++) setze(e.tx, y, ROCK, g);
    }
  }

  // Über der Obergrenze ausdünnen: erst Landekanten, dann ganze Gruben eines Zugs auf einmal — die Lücke wird zum Abgrund
  // (auch tödlich, ohne Standfläche). Einzelne Säulen herauszunehmen hinterließ gestreifte Gruben voller Eisstriche.
  let zuViel = entities.filter((e) => e.fuellung).length - maxStacheln;
  for (const art of ['kante', 'grube']) {
    while (zuViel > 0) {
      const kandidaten = entities.map((e, i) => (e.fuellung === art ? i : -1)).filter((i) => i >= 0);
      if (!kandidaten.length) break;
      const e = entities[kandidaten[rng.intRange(0, kandidaten.length - 1)]];
      const g = gruppeVon.get(k(e.tx, e.ty));
      const grube = g && gruppen.get(g).grube;
      if (grube) {
        for (const [id, gr] of [...gruppen]) if (gr.grube === grube) { zuViel--; entferneGruppe({ grid, entities, gesetzt, gruppen, gruppeVon }, id); }
        continue;
      }
      if (g) entferneGruppe({ grid, entities, gesetzt, gruppen, gruppeVon }, g);
      else { entities.splice(entities.indexOf(e), 1); gesetzt.delete(k(e.tx, e.ty)); }
      zuViel--;
    }
  }

  eisSeiten(grid, gesetzt);
  return { gesetzt, gruppen, gruppeVon };
}

/** Eine ganze Säule (Fels + ihre Stachel) zurücknehmen */
function entferneGruppe({ grid, entities, gesetzt, gruppen, gruppeVon }, g) {
  const gr = gruppen.get(g);
  if (!gr) return 0;
  for (const key of gr.kacheln) {
    const [x, y] = key.split(',').map(Number);
    if (fest(grid[y][x])) grid[y][x] = AIR;
    for (let j = entities.length - 1; j >= 0; j--) if (entities[j].fuellung && entities[j].tx === x && entities[j].ty === y) entities.splice(j, 1);
    gesetzt.delete(key);
    gruppeVon.delete(key);
  }
  gruppen.delete(g);
  // Kappe: Ohne ihre Säule läge die Oberseite des Planer-Bauteils frei — die ursprüngliche Stachel kommt zurück
  if (gr.stachel) entities.push(gr.stachel);
  return gr.kacheln.length;
}

/** Freie Seitenflächen der Füllung werden Eis: kein Wandsprung, keine Abkürzung an Gelände entlang */
function eisSeiten(grid, gesetzt) {
  for (const key of gesetzt) {
    const [x, y] = key.split(',').map(Number);
    if (grid[y][x] !== ROCK) continue;
    if (grid[y][x - 1] === AIR || grid[y][x + 1] === AIR) grid[y][x] = ICE;
  }
}

/**
 * Sicherheitsnetz: Jede freie Oberseite (Fels oder Eis mit Luft darüber) abseits der Plattformen des Weges bekommt eine
 * Stachel — sonst könnte man dort stehen und abkürzen. Solche Stellen entstehen, wenn eine Rücknahme ein Bauteil nur
 * teilweise abträgt. Liegt die Stelle im Korridor, bleibt sie frei (dort fliegt ein Zug; die Schlussprüfung zeigt es).
 */
function oberseitenBesetzen({ grid, entities, schritte, korridor, start }) {
  const stand = new Set();
  for (const s of schritte) for (let x = s.ziel.x0; x <= s.ziel.x1; x++) stand.add(k(x, s.ziel.row - 1));
  const belegt = new Set(entities.map((e) => k(e.tx, e.ty)));
  for (let y = 1; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (!fest(grid[y][x]) || grid[y - 1][x] !== AIR) continue;
      const key = k(x, y - 1);
      if (stand.has(key) || belegt.has(key) || korridor.has(key)) continue;
      if (start && Math.abs(x - start.x) < 15 && Math.abs(y - 1 - start.y) < 15) continue;
      entities.push({ type: 'spike', tx: x, ty: y - 1, dir: 'up', fuellung: 'oberseite' });
    }
  }
}

/** Stacheln der Füllung ohne Halt (etwa nach einer Rücknahme) entfernen — nichts soll in der Luft schweben */
function schwebendeWeg(grid, entities, gesetzt) {
  const halt = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
  for (let j = entities.length - 1; j >= 0; j--) {
    const e = entities[j];
    if (!e.fuellung) continue;
    const [dx, dy] = halt[e.dir] || [0, 1];
    if (!fest(grid[e.ty + dy]?.[e.tx + dx])) { entities.splice(j, 1); gesetzt.delete(k(e.tx, e.ty)); }
  }
}

/**
 * Jeden Zug auf der fertigen Karte erneut spielen; wo eine Variante scheitert, die Füllung um ihre Flugbahn zurücknehmen —
 * immer ganze Säulen.
 * @returns {{ ok: boolean, zurueckgenommen: number, offen: number[] }}  offen: Indizes der Schritte, die nicht mehr tragen
 */
export function verifiziere({ grid, entities, schritte, cls, laufTempo, gesetzt, gruppen = new Map(), gruppeVon = new Map(), korridor = null, start = null }) {
  let zurueck = 0;
  const ctx = { grid, entities, gesetzt, gruppen, gruppeVon };
  const nimmZurueck = (keys) => {
    const gs = new Set();
    for (const key of keys) {
      if (!gesetzt.has(key)) continue;
      const g = gruppeVon.get(key);
      if (g) gs.add(g);
      else {
        // Einzelne Stachel (Landekante)
        const [x, y] = key.split(',').map(Number);
        for (let j = entities.length - 1; j >= 0; j--) if (entities[j].fuellung && entities[j].tx === x && entities[j].ty === y) entities.splice(j, 1);
        gesetzt.delete(key);
        zurueck++;
      }
    }
    for (const g of gs) zurueck += entferneGruppe(ctx, g);
    if (gs.size) eisSeiten(grid, gesetzt);
  };
  schritte.forEach((schritt) => {
    for (let runde = 0; runde < 6; runde++) {
      const p = pruefeZug(grid, entities, cls, laufTempo, schritt);
      if (p.ok) return;
      // Füllung in der Nähe der gescheiterten Flugbahn zurücknehmen (Radius 2 um jede berührte Kachel)
      const nah = new Set();
      for (const s of beruehrteKacheln(p.spuren[p.spuren.length - 1])) {
        const [x, y] = s.split(',').map(Number);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) nah.add(k(x + dx, y + dy));
      }
      nimmZurueck(nah);
    }
    // Letzte Stufe: die ganze Füllung im Bereich dieses Zugs räumen
    if (!pruefeZug(grid, entities, cls, laufTempo, schritt).ok && schritt.box) {
      const b = schritt.box;
      nimmZurueck([...gesetzt].filter((s) => {
        const [x, y] = s.split(',').map(Number);
        return x >= b.x0 - 3 && x <= b.x1 + 3 && y >= b.y0 - 3 && y <= b.y1 + 3;
      }));
    }
  });
  schwebendeWeg(grid, entities, gesetzt);
  if (korridor) oberseitenBesetzen({ grid, entities, schritte, korridor, start });
  // Schlussprüfung ALLER Züge: Eis, das nach einer späteren Rücknahme frei lag, darf keinen früheren Zug verändert haben
  const offen = [];
  schritte.forEach((schritt, i) => { if (!pruefeZug(grid, entities, cls, laufTempo, schritt).ok) offen.push(i); });
  return { ok: offen.length === 0, zurueckgenommen: zurueck, offen };
}
