// Ideen-Räume: Abschnitte, die eine KOMBINATION vorhandener Elemente zum Inhalt haben — nicht eine
// Gefahr auf ebenem Boden, sondern eine kleine Aufgabe (erst den Schlüssel holen, dann durch die Tür;
// oben schnell und riskant oder unten sicher und langsam). Vorbild sind die handgebauten Custom-Level
// SR-ERV-RAM und SR-ZZ7-PS3 (25.09.2026): Schlüssel vor der Tür, Wege, die sich trennen und wieder
// zusammenfinden, Bröckelpfad mit Schlüssel darüber.
//
// Dieselbe Form wie die Höhlen-Räume (motive/hoehlenraeume.js): flach (`entry === exit`), fester
// Boden am Instanzende, eingesetzt über `stempeln()` wie ein Baustein — keine neue Fähigkeit, keine
// neue Graph-Brücke. Jeder Raum ist algorithmisch erzeugt, zwei Läufe sehen nie gleich aus.
//
// Welche Variante ein Raum bekommt, folgt dem Bogen der Kernidee (einführen → variieren → zuspitzen):
// `ctx.fortschritt` (0..1 durchs Level), die Stufe (`ctx.tier`) und die Schwierigkeit schieben ihn
// nach hinten. Portale nur, wenn der Welttyp sie erlaubt (`ctx.erlaubt('portal')`) — Höhlen verbietet
// sie in seiner Palette, Parcours nicht.
//
// Lösbarkeit: Der Bewegungsgraph sieht nur die Brücke Eingang → Ausgang. Belegt wird jeder Raum mit
// dem echten Solver im Fenster (siehe PLANUNG_WELTTYPEN.md, Abschnitt 12) — bei der Gabelung JEDER
// Weg für sich, der andere zugemauert: Eine Gabelung, deren einer Arm nicht trägt, wäre eine Falle.

import { neuerGang, grube, BODEN, RAND } from './hoehlenraeume.js';
import { luecke } from './stockwerke.js';

const F = BODEN;              // Felszeile des Bodens; gestanden wird in F − 1
const TUER_H = 4;             // Türkacheln über dem Boden
const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const setz = (r, x, y, ch) => { if (x >= 0 && x < r.w && y >= 0 && y < r.h) r.rows[y][x] = ch; };
/** Waagerechte Felsreihe (eine Plattform ist eine Zeile dick) */
const reihe = (r, x, y, w, ch = '#') => { for (let i = 0; i < w; i++) setz(r, x + i, y, ch); };
const gefahr = (ctx, r, spec) => { if (ctx.erlaubt(spec.type)) r.entities.push(ctx.wandle(spec)); };

/**
 * Türwand in Spalte x: unten TUER_H Türkacheln, darüber Eis bis zur Oberkante der Instanz. Eis, weil
 * man an Eis keinen Wandsprung hat — über Fels könnte man die Tür überklettern. Die Wand ist 19 Zeilen
 * hoch; mehr als Doppelsprung (7,5) plus ein Wandsprung an der Tür (~4) erreicht niemand.
 */
function tuerwand(r, x) {
  for (let y = 0; y < F; y++) setz(r, x, y, y >= F - TUER_H ? 'Y' : 'I');
}

/** Bröckelreihe in der Bodenzeile (über einer Grube): Elemente, die Kachel selbst bleibt Luft */
function broeckelpfad(ctx, r, x, w, d) {
  const delay = [0.34, 0.3, 0.27, 0.24, 0.21][d - 1];
  for (let i = 0; i < w; i++) r.entities.push({ type: 'crumble', lx: x + i, ly: F, delay, respawn: 2.2 });
}

/** Wie weit ist der Bogen? 0 = Einführung, 1 = Zuspitzung. */
function zug(ctx) {
  return (ctx.fortschritt ?? 0.5) + (ctx.tier === 'stark' ? 0.15 : 0) + (ctx.d - 3) * 0.08;
}

// ── Schlüsselkammer (Kernidee „Schlüsselkette") ───────────────────────────────────────────────────
//
//   ablage    Der Schlüssel liegt auf einer schwebenden Ablage vor der Tür (ab Stufe 3 eine Grube dazwischen).
//   rueckweg  Die Treppe zum Schlüssel beginnt an der Tür und führt ZURÜCK — man läuft unter ihm durch,
//             steht vor der verschlossenen Tür und muss rückwärts hinauf (Katalog-Moment #32).
//   kette     Zwei Schlüssel, zwei Türen: Schlüssel 1 auf der Ablage, dahinter ein Bröckelpfad über einer
//             Grube, auf dem Schlüssel 2 liegt, dann Tür 2.
//   portal    Der Schlüssel liegt unerreichbar hoch; ein Portal im Boden bringt einen hinauf, hinunter
//             geht es zu Fuß (nur wo der Welttyp Portale erlaubt).

function ablage(ctx, r, x0) {
  const { rng, limits } = ctx;
  const hoehe = rng.intRange(3, Math.min(4, limits.maxUp));
  reihe(r, x0, F - hoehe, 3);
  setz(r, x0 + 1, F - hoehe - 1, 'K');
  return x0 + 3;
}

const SCHLUESSEL_VARIANTEN = {
  ablage(ctx) {
    const { rng, limits, d } = ctx;
    const x0 = RAND + rng.intRange(4, 7);
    let x = x0 + 3;
    const grubeW = d >= 3 ? klemme(rng.intRange(2, Math.max(2, luecke(limits, 0))), 2, 4) : 0;
    const grubeX = x + rng.intRange(2, 3);
    if (grubeW) x = grubeX + grubeW;
    const tuer = x + rng.intRange(3, 5);
    const r = neuerGang(tuer + 1 + RAND + rng.intRange(5, 8));
    ablage(ctx, r, x0);
    if (grubeW) grube(r, grubeX, grubeW, r.entities, ctx.wandle, ctx.erlaubt);
    tuerwand(r, tuer);
    return { r, schluessel: 1 };
  },

  rueckweg(ctx) {
    const { rng, limits, d } = ctx;
    const n = d >= 3 ? 3 : 2;
    const stufe = Math.min(3, limits.maxUp);
    // Von links nach rechts gebaut: oben links der Schlüssel, die Stufen fallen nach rechts zur Tür hin ab
    const xs = [RAND + rng.intRange(4, 6)];
    for (let i = 1; i < n; i++) xs.push(xs[i - 1] + 3 + rng.intRange(1, klemme(luecke(limits, stufe), 1, 4)));
    const tuer = xs[n - 1] + 3 + rng.intRange(3, 5);
    const r = neuerGang(tuer + 1 + RAND + rng.intRange(5, 8));
    xs.forEach((x, i) => {
      const y = F - stufe * (n - i);                  // i = 0 ist die höchste
      const mitte = n === 3 && i === 1;
      if (mitte) for (let k = 0; k < 3; k++) r.entities.push({ type: 'crumble', lx: x + k, ly: y, delay: [0.34, 0.3, 0.27, 0.24, 0.21][d - 1], respawn: 2.2 });
      else reihe(r, x, y, 3);
      if (i === 0) setz(r, x + 1, y - 1, 'K');
    });
    tuerwand(r, tuer);
    return { r, schluessel: 1 };
  },

  kette(ctx) {
    const { rng, d } = ctx;
    const x0 = RAND + rng.intRange(4, 6);
    const tuer1 = x0 + 3 + rng.intRange(3, 5);
    const pfadX = tuer1 + 1 + rng.intRange(3, 4);
    const pfadW = rng.intRange(6, 9);
    const tuer2 = pfadX + pfadW + rng.intRange(3, 4);
    const r = neuerGang(tuer2 + 1 + RAND + rng.intRange(5, 8));
    ablage(ctx, r, x0);
    tuerwand(r, tuer1);
    grube(r, pfadX, pfadW, r.entities, ctx.wandle, ctx.erlaubt);
    broeckelpfad(ctx, r, pfadX, pfadW, d);
    // Schlüssel 2 über der Mitte des Pfads, im Vorbeilaufen. Eine Fassung mit Sprung-Schlüssel ab Stufe 4 (zwei Kacheln
    // über Kopfhöhe) verfehlte der Menschen-Bot bei schnellem Tempo IMMER: zu früh gesprungen fliegt man drüber, zu spät
    // läuft man drunter durch — eine Präzisionsaufgabe mitten auf einem Pfad, auf dem man nicht stehen bleiben darf.
    setz(r, pfadX + Math.floor(pfadW / 2), F - 1, 'K');
    tuerwand(r, tuer2);
    return { r, schluessel: 2 };
  },

  portal(ctx) {
    const { rng } = ctx;
    const xa = RAND + rng.intRange(4, 6);
    const ablageX = xa + 3;
    const ablageY = F - 12;                           // 12 Zeilen: über jedem Doppelsprung
    const tuer = ablageX + 6 + rng.intRange(4, 6);
    const r = neuerGang(tuer + 1 + RAND + rng.intRange(5, 8));
    reihe(r, ablageX, ablageY, 6);
    r.entities.push({ type: 'portal', lx: xa, ly: F - 1, id: 'hoch', pair: 'ablage' });
    r.entities.push({ type: 'portal', lx: ablageX, ly: ablageY - 1, id: 'ablage', pair: 'hoch' });
    setz(r, ablageX + 4, ablageY - 1, 'K');
    tuerwand(r, tuer);
    return { r, schluessel: 1 };
  },
};

const SCHLUESSELKAMMER = {
  id: 'schluesselkammer', label: 'Schlüsselkammer', ab: 1, gewicht: 0.5, gefahren: () => [],
  variante(ctx) {
    const z = zug(ctx);
    if (ctx.erlaubt('portal') && z >= 0.3 && ctx.rng.range(0, 1) < 0.35) return 'portal';
    return z < 0.34 ? 'ablage' : z < 0.67 ? 'rueckweg' : 'kette';
  },
  baue(ctx) {
    const v = this.variante(ctx);
    const { r, schluessel } = SCHLUESSEL_VARIANTEN[v](ctx);
    return { ...r, tpl: { id: this.id, variante: v, tags: ['key', v], difficulty: Math.min(5, 1 + schluessel + (v === 'ablage' ? 0 : 1)) } };
  },
};

// ── Gabelung (Kernidee „Zwei Wege, eine Wahl") ───────────────────────────────────────────────────
//
// Beide Wege beginnen am selben Eingang und enden auf demselben Boden. Riskant heißt hier: Wer oben
// patzt, fällt auf den unteren Weg und verliert Zeit — selten den Kopf.
//
//   platte    Eine Trennplatte teilt den Raum. Oben ein Lauf über die Platte mit Lücken und Stachelkanten.
//             Unten eine Serpentine: unter der Platte nach rechts, eine Ebene tiefer zurück nach links,
//             noch eine tiefer wieder nach rechts, dann über zwei Stufen durch eine Einwegplatte hinauf.
//   schlucht  Eine Schlucht, höher als jeder Doppelsprung. Oben ein Bröckelpfad (ab Stufe 3 mit Lücke), unten hinaus
//             nur mit dem Aufzug an der (vereisten) rechten Wand — man wartet auf ihn und fährt.
//
// Gemessen, nicht geschätzt: Ein Umweg NACH UNTEN kostet in dieser Sim fast keine Zeit (in der Luft ist
// man genauso schnell wie am Boden). Die erste Fassung (ebener Gang, dann eine Senke; flache Schlucht mit
// Stufen) war oben nur 2–7 % schneller, einmal sogar langsamer. Zeit kosten nur WARTEN und RÜCKWEGE —
// deshalb Serpentine und Aufzug. Oben gibt es aus demselben Grund keine Säge: Warten auf sie würde den
// schnellen Weg langsam machen; das Risiko oben sind Stacheln und Lücken.

/** Aufbau der Gabelung „platte" — auch von den Beweis-Läufen gebraucht, um einen Weg zuzumauern */
const PLATTE_H = 6;           // Stehzeile auf der Platte liegt 6 über dem Boden, der Gang darunter ist 4 hoch

const GABEL_VARIANTEN = {
  platte(ctx) {
    const { rng, limits, d } = ctx;
    const stufeX = RAND + rng.intRange(3, 5);
    const a = stufeX + 3 + 2;                         // Plattenanfang (zwei freie Spalten nach der Stufe)
    const L = rng.intRange(16, 22);                    // Raum bleibt ≤ 56 breit (Parcours rechnet mit höchstens 56 je Baustein)
    const b = a + L;                                   // erste Spalte hinter der Platte
    const schacht = b + 1;                             // Aufstieg der Serpentine: Spalten schacht … schacht+3
    const r = neuerGang(schacht + 4 + RAND + rng.intRange(5, 8));
    reihe(r, stufeX, F - 3, 3);                        // Stufe auf halber Höhe
    reihe(r, a, F - PLATTE_H, L);
    reihe(r, a, F - PLATTE_H + 1, L);

    // Unten: Serpentine. Der Gang unter der Platte endet an einer Wand; ein Loch führt auf Ebene −1 (zurück nach
    // links), dort ein Loch auf Ebene −2 (wieder nach rechts, bis unter den Schacht).
    for (let y = F - PLATTE_H + 2; y < F; y++) setz(r, b - 1, y, '#');
    for (let x = a + 1; x <= b - 2; x++) for (let y = F + 1; y <= F + 3; y++) setz(r, x, y, '.');
    for (let x = b - 4; x <= b - 2; x++) setz(r, x, F, '.');
    for (let x = a + 1; x <= schacht + 3; x++) for (let y = F + 5; y <= F + 8; y++) setz(r, x, y, '.');
    for (let x = a + 1; x <= a + 3; x++) setz(r, x, F + 4, '.');
    // Schacht: zwei Stufen (je höchstens 4 Zeilen), oben eine Einwegplatte im Boden — von unten durchspringbar,
    // von oben begehbar: Wer oben läuft, merkt vom Schacht nichts.
    for (let x = schacht; x < schacht + 4; x++) { for (let y = F + 1; y <= F + 4; y++) setz(r, x, y, '.'); setz(r, x, F, '='); }
    reihe(r, schacht, F + 5, 2);
    reihe(r, schacht + 2, F + 2, 2);

    // Oben: Lücken in der Platte (wer hineinfällt, landet unten und nimmt die Serpentine), davor je eine Stachelkante
    const nL = d >= 3 ? 2 : 1;
    const lueckenW = () => klemme(rng.intRange(2, Math.max(2, luecke(limits, 0))), 2, 4);
    const luecken = [];
    const abschnitt = Math.floor(L / (nL + 1));
    for (let i = 1; i <= nL; i++) {
      const x = a + abschnitt * i + rng.intRange(-2, 1);
      const w = lueckenW();
      luecken.push({ x, w });
      for (let k = 0; k < w; k++) { setz(r, x + k, F - PLATTE_H, '.'); setz(r, x + k, F - PLATTE_H + 1, '.'); }
      if (d >= 2 && rng.range(0, 1) < 0.7) gefahr(ctx, r, { type: 'spike', lx: x - 1, ly: F - PLATTE_H - 1 });
    }
    const inLuecke = (x) => luecken.some((l) => x >= l.x - 2 && x < l.x + l.w + 2);
    if (d >= 4) {
      // Eine Stachelinsel mitten auf dem längsten lückenfreien Stück
      const kanten = [a, ...luecken.flatMap((l) => [l.x, l.x + l.w]), b];
      let best = null;
      for (let i = 0; i + 1 < kanten.length; i += 2) {
        const len = kanten[i + 1] - kanten[i];
        if (!best || len > best.len) best = { x: kanten[i], len };
      }
      if (best && best.len >= 7) gefahr(ctx, r, { type: 'spike', lx: best.x + Math.floor(best.len / 2), ly: F - PLATTE_H - 1 });
    }

    // Unten ab Stufe 3 ein Laser-Tor aus der Plattenunterseite (Warten, nie unter einer Lücke oder dem Loch)
    const belegt = [];
    if (d >= 3) {
      let x = a + Math.floor(L / 2);
      for (let schutz = 0; schutz < L && (inLuecke(x) || x > b - 7); schutz++) x = x + 1 <= b - 7 ? x + 1 : a + 3;
      if (!inLuecke(x) && x <= b - 7) {
        belegt.push(x);
        gefahr(ctx, r, {
          type: 'laser', lx: x, ly: F - PLATTE_H + 1, dir: 'down',
          period: [3.4, 3.2, 3.0, 2.8, 2.6][d - 1], on: [1.9, 1.8, 1.65, 1.55, 1.45][d - 1], warn: 0.5, phase: rng.range(0, 1),
        });
      }
    }
    return { r, info: { a, b, schacht, luecken, laser: belegt } };
  },

  schlucht(ctx) {
    const { rng, limits, d } = ctx;
    const span = rng.intRange(16, 26);
    const x0 = RAND + rng.intRange(6, 8);
    const r = neuerGang(x0 + span + RAND + rng.intRange(6, 8));
    const tief = 9;                                    // Grund: Stehzeile F + 8 — höher als jeder Doppelsprung (7,5)
    for (let x = x0; x < x0 + span; x++) for (let y = F; y < F + tief; y++) setz(r, x, y, '.');
    // Hinab über zwei Stufen an der linken Wand; die rechte Wand ist Eis (kein Wandsprung hinaus)
    const stufen = [{ x: x0, y: F + 3 }, { x: x0 + 2, y: F + 6 }];
    for (const st of stufen) reihe(r, st.x, st.y, 2);
    for (let y = F + 1; y < F + tief; y++) setz(r, x0 + span, y, 'I');
    // Oben: ein DURCHGEHENDER Bröckelpfad bis 3 Spalten vor der Wand (die zwei Spalten davor gehören dem Aufzug,
    // über sie springt man auf den Boden), ab Stufe 3 mit einer Lücke in der ersten Hälfte. Die erste Fassung hatte
    // 2 Kacheln breite Stücke mit Lücken: Ein voll gehaltener Sprung trägt 6–12 Kacheln und überspringt so ein
    // Stück — der Menschen-Bot (Reaktionszeit 17–150 ms) kam in 4 bis 33 % der Fälle durch. Hinter der Lücke läuft
    // der Pfad jetzt so lang weiter, dass jeder Sprung auf ihm landet.
    const pfadEnde = x0 + span - 3;
    const lueckeW = d >= 3 ? rng.intRange(2, klemme(luecke(limits, 0), 2, 3)) : 0;
    const lueckeX = lueckeW ? rng.intRange(x0 + 3, x0 + Math.floor(span / 2) - lueckeW) : -1;
    broeckelpfad(ctx, r, x0, pfadEnde - x0 + 1, d);
    if (lueckeW) r.entities = r.entities.filter((e) => !(e.type === 'crumble' && e.lx >= lueckeX && e.lx < lueckeX + lueckeW));
    // Unten hinaus nur mit dem Aufzug: unten eine Stufe über dem Grund, oben bündig mit dem Boden
    r.entities.push({
      type: 'mover', lx: x0 + span - 2, ly: F + tief - 1, path: [[0, 0], [0, -(tief - 1)]],
      speed: [45, 50, 55, 60, 65][d - 1], width: 2, phase: rng.range(0, 1),
    });
    // Und ab Stufe 2 eine kurze Sägenstreife in der Mitte des Grunds (warten auf einer Stufe oder drüberspringen)
    if (d >= 2 && span >= 14) {
      const von = x0 + Math.floor(span / 2) - 2;
      gefahr(ctx, r, { type: 'saw', lx: von, ly: F + tief - 1, path: [[0, 0], [4, 0]], speed: 35 + 5 * d, phase: rng.range(0, 1) });
    }
    return { r, info: { x0, span, tief, stufen } };
  },
};

const GABELUNG = {
  id: 'gabelung', label: 'Gabelung', ab: 1, gewicht: 0.5, gefahren: () => [],
  variante(ctx) {
    return ctx.rng.range(0, 1) < 0.5 ? 'platte' : 'schlucht';
  },
  baue(ctx) {
    const v = this.variante(ctx);
    const { r, info } = GABEL_VARIANTEN[v](ctx);
    return { ...r, tpl: { id: this.id, variante: v, info, tags: ['fork', v], difficulty: Math.min(5, 2 + Math.floor(ctx.d / 2)) } };
  },
};

// ── Federkette (Kernidee „Sprungpad-Ketten") ─────────────────────────────────────────────────────
//
// Eine Stachelgrube, darüber Säulen mit je einer Feder: Man berührt den Boden erst wieder hinter der Grube.
// Gemessen (Feder auf ebenem Boden, rechts halten): Flugzeit 1,01 s bei jedem Tempo, Scheitel 7,9 Kacheln, Landung
// 8,2–8,8 / 10,9–11,5 / 13,9–14,6 Kacheln hinter der Feder (normal/schnell/super) — unabhängig vom Anlauf. Die
// nächste Feder steht genau dort: RECHTS HALTEN GENÜGT, und wer in der Sekunde Flug korrigiert, hat eine Säule Platz.
// Die Stacheln sind Pflicht (`gefahren`): Ohne sie säße man in der 11 Zeilen tiefen Grube fest.

const FEDER_FLUG = 1.01;      // s, gemessen (siehe oben)

const FEDERKETTE = {
  id: 'federkette', label: 'Federkette', ab: 1, gewicht: 0.5, gefahren: () => ['spike'],
  baue(ctx) {
    const { rng, d } = ctx;
    // Ohne `reach` (Einzeltests) das Lauftempo der Klasse „normal" — die Form bleibt gültig, nur die Weite geschätzt
    const lauf = ctx.reach ? ctx.reach.runSpeed : 139;
    // Wo landet man nach k Federn? Die erste Feder löst schon aus, wenn die VORDERKANTE sie berührt (Spieler-x =
    // Feder − 0,625); jede weitere dort, wo man gelandet ist. Pro Flug wandert man Δ = Flugzeit × Lauftempo weiter —
    // mit festem Spaltenabstand liefe die Landestelle um einen Bruchteil je Sprung davon (1 Kachel breite Säulen
    // wurden bei Tempo „normal" ab der zweiten verfehlt). Die Feder steht in der Spalte unter der Spielermitte (+0,31).
    const delta = (FEDER_FLUG * lauf) / 16;
    const xs0 = RAND + rng.intRange(5, 7);                        // erste Feder, noch auf dem Boden
    const landung = (k) => xs0 - 0.625 + k * delta;               // Spieler-x (Kacheln) nach k Flügen
    const spalte = (k) => Math.floor(landung(k) + 0.31);
    const gewuenscht = d >= 3 ? 3 : 2;
    let m = gewuenscht;                                           // Säulen; Raum ≤ 56 breit
    while (m > 1 && spalte(m + 1) + RAND + 6 > 56) m--;
    const saeuleW = d >= 4 ? 1 : 3;
    const x0 = xs0 + 2;
    const xEnde = spalte(m + 1) - 1;                              // erste Spalte des Bodens hinter der Grube
    const r = neuerGang(spalte(m + 1) + RAND + rng.intRange(4, 6));
    grube(r, x0, xEnde - x0, r.entities, ctx.wandle, ctx.erlaubt);
    r.entities.push({ type: 'spring', lx: xs0, ly: F - 1, dir: 'up' });
    for (let k = 1; k <= m; k++) {
      const c = spalte(k);
      const links = c - Math.floor(saeuleW / 2);
      for (let x = links; x < links + saeuleW; x++) for (let y = F; y < r.h; y++) setz(r, x, y, '#');
      r.entities = r.entities.filter((e) => !(e.type === 'spike' && e.lx >= links && e.lx < links + saeuleW));
      r.entities.push({ type: 'spring', lx: c, ly: F - 1, dir: 'up' });
    }
    return { ...r, tpl: { id: this.id, info: { xs0, m, x0, xEnde, federn: Array.from({ length: m }, (_, k) => spalte(k + 1)) }, tags: ['spring', 'gap'], difficulty: Math.min(5, 1 + m + (saeuleW === 1 ? 1 : 0)) } };
  },
};

// ── Deckengang (Kernidee „Die Decke lebt") ─────────────────────────────────────────────────────────
//
// Ein Tunnel: über dem Gang massiver Fels bis zur Oberkante, man kann nicht obendrüber. Alle Gefahr kommt von oben:
//   zapfen      Stacheln hängen von der Decke — aber nur über Abschnitten OHNE Grube. Um jede Grube bleibt die Decke
//               auf der Länge eines vollen Sprungs frei (aus `reach` bemessen): Wer an der Grube springt, stößt nie an.
//               Die Decke zeigt so, wo man nicht springen darf.
//   steinschlag Fallblöcke hängen unter der Decke: Wer durchläuft, ist weg, bevor sie fallen (0,32 s Wackeln); wer
//               darunter stehen bleibt, wird getroffen.
//   gitter      Laser schießen getaktet aus der Decke nach unten; zwischen den Toren ist Platz zum Warten.
// Früh im Level eine davon, spät zwei zusammen (zapfen + gitter oder steinschlag + gitter).

const DECKE_FREI = 5;         // lichte Höhe im Tunnel (Zeilen über der Standfläche bis unter die Decke)

function baueTunnel(r, a, b) {
  // Fels von der Oberkante bis unter die Decke, über die ganze Tunnellänge
  for (let x = a; x < b; x++) for (let y = 0; y < F - DECKE_FREI; y++) setz(r, x, y, '#');
}
const DECKE_Y = F - DECKE_FREI;               // erste Luftzeile unter der Decke (dort hängen Stacheln und Blöcke)

const DECKEN_TEILE = {
  zapfen(ctx, r, a, b) {
    const { rng, limits } = ctx;
    // Länge eines vollen Sprungs (gemessen ≈ 0,88 × reach.gap.jump) plus Anlauf-Rand: so lang bleibt die Decke frei
    const J = ctx.reach ? ctx.reach.gap.jump : (limits.maxGap + 1) / 0.8;
    const frei = Math.ceil(0.9 * J) + 3;
    let x = a + 2;
    while (x + 3 + frei <= b - 2) {
      const zapfenW = rng.intRange(3, 5);
      for (let k = 0; k < zapfenW; k++) gefahr(ctx, r, { type: 'spike', lx: x + k, ly: DECKE_Y, dir: 'down' });
      x += zapfenW;
      // freie Strecke mit einer kleinen Grube in der Mitte
      const gw = klemme(rng.intRange(2, 3), 2, Math.max(2, luecke(limits, 0)));
      const gx = x + Math.floor((frei - gw) / 2);
      grube(r, gx, gw, r.entities, ctx.wandle, ctx.erlaubt);
      x += frei;
    }
    // Was hinter der letzten Grube an Decke übrig ist, bekommt auch Zapfen (bei super sonst nur eine Gruppe im Tunnel)
    for (let k = x; k < Math.min(x + 6, b - 2); k++) gefahr(ctx, r, { type: 'spike', lx: k, ly: DECKE_Y, dir: 'down' });
  },
  steinschlag(ctx, r, a, b) {
    const { rng, d } = ctx;
    const abstand = d >= 4 ? 2 : 3;
    for (let x = a + 3; x < b - 3; x += abstand + rng.intRange(0, 1)) {
      if (ctx.erlaubt('fallingBlock')) r.entities.push(ctx.wandle({ type: 'fallingBlock', lx: x, ly: DECKE_Y, width: 1, height: 1 }));
    }
  },
  gitter(ctx, r, a, b) {
    const { rng, d } = ctx;
    const n = Math.max(1, Math.floor((b - a - 4) / 7));
    for (let i = 0; i < n; i++) {
      const x = a + 4 + i * 7 + rng.intRange(0, 2);
      if (x >= b - 2) break;
      gefahr(ctx, r, {
        type: 'laser', lx: x, ly: DECKE_Y - 1, dir: 'down',
        period: [3.0, 2.8, 2.6, 2.4, 2.2][d - 1], on: [0.8, 0.85, 0.9, 0.95, 1.0][d - 1], warn: 0.5, phase: rng.range(0, 1),
      });
    }
  },
};

const DECKENGANG = {
  id: 'deckengang', label: 'Deckengang', ab: 1, gewicht: 0.5, gefahren: () => [],
  variante(ctx) {
    const z = zug(ctx);
    const einzeln = ['zapfen', 'steinschlag', 'gitter'];
    if (z < 0.6) return einzeln[ctx.rng.intRange(0, 2)];
    return ctx.rng.range(0, 1) < 0.5 ? 'zapfen+gitter' : 'steinschlag+gitter';
  },
  baue(ctx) {
    const v = this.variante(ctx);
    const teile = v.split('+');
    const { rng } = ctx;
    const a = RAND + rng.intRange(4, 6);
    const L = teile.includes('zapfen') ? rng.intRange(30, 34) : rng.intRange(22, 30);   // Raum bleibt ≤ 56 breit
    const b = a + L;
    const r = neuerGang(b + RAND + rng.intRange(4, 6));
    baueTunnel(r, a, b);
    if (teile.length === 1) DECKEN_TEILE[v](ctx, r, a, b);
    else {
      // Zwei Teile hintereinander (so überlagern sich Laser und Zapfen/Blöcke nicht); Zapfen brauchen den größeren
      // Teil, weil um jede Grube ein voller Sprung Decke frei bleiben muss
      const m = teile[0] === 'zapfen' ? b - 10 : a + Math.floor(L / 2);
      DECKEN_TEILE[teile[0]](ctx, r, a, m);
      DECKEN_TEILE[teile[1]](ctx, r, m, b);
    }
    // Eine Grube räumt ihre Spalten bis zur Oberkante — die Decke darüber wird wieder geschlossen
    baueTunnel(r, a, b);
    return { ...r, tpl: { id: this.id, variante: v, info: { a, b }, tags: ['ceiling', ...teile], difficulty: Math.min(5, 1 + teile.length + Math.floor(ctx.d / 3)) } };
  },
};

// ── Kletterschlucht (Kernidee „Wandsprung-Schluchten") ─────────────────────────────────────────────
//
// Eine Felsstufe, höher als jeder Doppelsprung, davor ein 4 Kacheln breiter Schacht zwischen einer freistehenden
// Säule und der Felswand: hinauf nur mit Wandsprüngen, oben ein Stück Weg, am Ende hinunterspringen. Maße wie der
// Chunk `wall-shaft`, den der Menschen-Bot in jedem Tempo mit 17–150 ms Reaktionszeit schafft (Abschnitt 14).
// KEINE Stacheln an den Schachtwänden: `spike-wall-shaft` war bei schnell/super für Menschen zu eng.
//   einfach    eine Schlucht
//   doppelt    zwei hintereinander
//   saegentor  eine Schlucht, oben patrouilliert eine Säge über den Weg — man steht sicher an der Kante und wartet

const SCHACHT_W = 4;

/** Eine Schlucht ab Spalte x (Säule dort). Liefert die erste Spalte hinter dem oberen Weg. */
function schlucht(r, x, hoehe, weg) {
  const oben = F - hoehe;                                   // Felszeile der Stufenoberkante
  for (let y = oben - 4; y <= F - 3; y++) for (let k = 0; k < 2; k++) setz(r, x + k, y, '#');   // Säule, unten 2 Zeilen frei
  const fels = x + 2 + SCHACHT_W;
  for (let xx = fels; xx < fels + weg; xx++) for (let y = oben; y < F; y++) setz(r, xx, y, '#');
  return { ende: fels + weg, oben, fels };
}

const KLETTERSCHLUCHT = {
  id: 'kletterschlucht', label: 'Kletterschlucht', ab: 1, gewicht: 0.5, gefahren: () => [],
  variante(ctx) {
    const z = zug(ctx);
    if (z < 0.34) return 'einfach';
    return ctx.rng.range(0, 1) < 0.5 ? 'doppelt' : 'saegentor';
  },
  baue(ctx) {
    const v = this.variante(ctx);
    const { rng, d } = ctx;
    const hoehe = () => rng.intRange(10, 12);
    const x0 = RAND + rng.intRange(4, 6);
    const weg = v === 'saegentor' ? rng.intRange(10, 12) : v === 'doppelt' ? rng.intRange(6, 7) : rng.intRange(6, 9);   // ≤ 56 breit
    const zweite = v === 'doppelt';
    const breite = x0 + (2 + SCHACHT_W + weg) * (zweite ? 2 : 1) + (zweite ? 5 : 0) + RAND + rng.intRange(5, 7);
    const r = neuerGang(breite);
    const s1 = schlucht(r, x0, hoehe(), weg);
    const schluchten = [s1];
    if (zweite) schluchten.push(schlucht(r, s1.ende + 5, hoehe(), weg));
    if (v === 'saegentor') {
      // Säge auf dem oberen Weg; die ersten 3 Spalten hinter der Kante bleiben frei (dort wartet man)
      const von = s1.fels + 3;
      const span = Math.max(3, weg - 5);
      gefahr(ctx, r, { type: 'saw', lx: von, ly: s1.oben - 1, path: [[0, 0], [span, 0]], speed: 40 + 6 * d, phase: rng.range(0, 1) });
    }
    return { ...r, tpl: { id: this.id, variante: v, info: { schluchten }, tags: ['wall', 'climb', v], difficulty: Math.min(5, 2 + (v === 'einfach' ? 0 : 1) + Math.floor(d / 3)) } };
  },
};

export { PLATTE_H };
export const IDEEN_RAEUME = [SCHLUESSELKAMMER, GABELUNG, FEDERKETTE, DECKENGANG, KLETTERSCHLUCHT];
export const IDEEN_RAUM_BY_ID = Object.fromEntries(IDEEN_RAEUME.map((m) => [m.id, m]));
