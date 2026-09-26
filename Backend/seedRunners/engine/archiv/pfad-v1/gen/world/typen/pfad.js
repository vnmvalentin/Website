// Welttyp „Pfad" — der Weg zuerst, die Welt drumherum (Rückmeldung 25.09.2026: „jedes Level eine Kopie vom anderen").
//
// Die alten Welttypen haben eine feste Großform (Höhlen: Aufstieg – Lauf – Abstieg; Turm: Halle mit Luke) und setzen
// Gefahren dorthin, wo man ohnehin nicht vorbeikommt. Hier ist es umgekehrt:
//   1. Szenenplan (pfad/szenen.js): Folge von Szenen mit eigenem Muster (Traverse, Aufstieg, Rückweg, Serpentine …)
//   2. Weg (pfad/planer.js): Zug um Zug in der echten Sim gespielt, mit der Ungenauigkeit eines Menschen
//   3. Füllung (pfad/fuellung.js): Stacheln direkt am Weg, Fels dahinter — je Szene als Höhle oder offen
//   4. Nachprüfung: jeder Zug auf der fertigen Karte erneut gespielt
// Lösbarkeit durch Konstruktion: Jeder Zug ist für den Bewegungsgraph eine Brücke (Fähigkeit „pfad").

import { createRng } from '../../../sim/rng.js';
import { planeSzenen, FORMEN } from '../pfad/szenen.js';
import { planePfad } from '../pfad/planer.js';
import { waehleHandschrift } from '../pfad/handschrift.js';
import { waehleLeitidee, aktPlan } from '../pfad/leitideen.js';
import { planeMotive } from '../pfad/motive.js';
import { fuelle, verifiziere } from '../pfad/fuellung.js';
import { START_BREITE } from '../gemeinsam/plattform.js';
import { LIMITS } from '../../../level/limits.js';

// Lang ist wirklich lang (Rückmeldung: generierte kurze Level sind in 20 s vorbei; 27.09.2026: „für lange Level finde ich
// 1 min Durchschnitt nicht wirklich lang“ — 56 Züge spielten sich in 1–1:30 min, ein Turm sogar in 27 s)
const ZUEGE = Object.freeze({ short: 18, medium: 32, long: 90 });
/**
 * Lange Level in Etappen: drei Großformen hintereinander, je 30 Züge — so wird ein langes Level auch in sich abwechslungs-
 * reich (Rückmeldung: „lange Level sollten sich schon auch unterscheiden“) und ein Turm nicht mehr von der Kartenhöhe
 * gedeckelt. Die Folgen sind so gewählt, dass die Höhe aufgeht (hinauf, quer, hinab …).
 */
const ETAPPEN = [
  ['strom', 'turm', 'absturz'], ['strom', 'turm', 'strom'], ['turm', 'strom', 'absturz'], ['welle', 'turm', 'absturz'],
  ['strom', 'welle', 'strom'], ['absturz', 'strom', 'turm'], ['turm', 'welle', 'absturz'], ['welle', 'strom', 'welle'],
];
/** Großformen und ihr Gewicht (pfad/szenen.js); die Halle nur ab mittlerer Länge — kurz wäre sie kaum mehr als ein Raum */
const FORM_GEWICHT = { strom: 2, turm: 1.5, absturz: 1.5, halle: 1.2, welle: 1.5 };
/** Ergebnis von baue() → der geplante Weg (Züge, Start) — für den Kettenlauf-Test, ohne die Level-Daten aufzublähen */
export const WEGE = new WeakMap();

export default {
  id: 'pfad',
  label: 'Pfad',
  beschreibung: 'Der Weg zuerst, die Welt drumherum: gewundene Wege in jede Richtung, Stacheln direkt am Weg — jede Szene anders.',

  kamera: 'gemischt',
  achse: 'x',
  grundstoff: 'luft',
  faehigkeiten: ['boden', 'pfad'],

  palette: {
    haupt: ['spike'],
    neben: [],
    verboten: [],
  },

  biome: ['cave', 'meadow', 'factory', 'ice', 'sky'],
  gewicht: 1,

  /**
   * @param {{params, limits, reach, neuesRaster}} ctx
   */
  baue(ctx) {
    const { params, limits, reach } = ctx;
    const rng = createRng(params.seed, 'welttyp:pfad');
    const n = ZUEGE[params.length] || ZUEGE.medium;
    const formen = Object.keys(FORM_GEWICHT).filter((f) => f !== 'halle' || params.length !== 'short');
    // Leitidee (pfad/leitideen.js): der Satz, den das Level in vier Akten erzählt. `ctx.pfadIdee` erzwingt eine ('keine' =
    // ohne); ein erzwungenes Thema ohne erzwungene Idee baut ohne Leitidee — sonst stimmte die Palette des Autors nicht mehr
    // Nur lange Level: Bei 18 oder 32 Zügen blieben 4–8 Züge je Akt, kein Bogen (gemessen: kurze Level liefen dabei
    // vorzeitig aus); und nie in der Halle, deren Etagen-Rhythmus fest ist (die Akt-Aufgaben trieben sie an die Wand)
    const ohneIdee = params.length !== 'long' || ctx.pfadForm === 'halle';
    const idee = waehleLeitidee(rng.fork('leitidee'), ctx.pfadIdee ?? (ctx.pfadThema || ohneIdee ? 'keine' : null));
    // Handschrift des „Autors" dieses Levels (pfad/handschrift.js); `ctx.pfadThema` erzwingt ein Thema (Tests, Werkbank).
    // Mit Leitidee kommt der Autor aus ihrer Liste und gibt nur noch den Stil — die Aufgaben bestimmen die Akte.
    const autor = ctx.pfadThema || (idee ? rng.fork('autor').weighted(Object.keys(idee.autoren), Object.values(idee.autoren)) : null);
    const hand = waehleHandschrift(rng.fork('handschrift'), autor);
    if (idee) hand.zielschalter = idee.zielschloss;
    // Extrem-Level (~12 %): Autor bzw. Leitidee allein — sonst breite Mischung mit ihrer Vorliebe (szenen.js). Erzwungenes
    // Thema oder erzwungene Idee (Tests, Werkbank) bauen wie bisher allein; `ctx.pfadExtrem` legt es fest.
    hand.extrem = ctx.pfadExtrem ?? (ctx.pfadThema || ctx.pfadIdee ? true : rng.fork('extrem').range(0, 1) < 0.12);
    // `ctx.pfadForm`: Form erzwingen (Tests, Werkbank); sonst würfelt der Seed — gewichtet nach den Vorlieben des Autors
    const etappig = params.length === 'long' && !FORMEN[ctx.pfadForm];
    // Form-Vorlieben: des Autors und der Leitidee (der Seilakt meidet Absturz und Turm — dort gibt es kaum waagerechte Züge,
    // gemessen: ein Seilakt mit Absturz-Etappe brach nach 23 Zügen ab)
    const vorliebe = (f) => (hand.formen[f] ?? 1) * (idee?.formen?.[f] ?? 1);
    const formId = FORMEN[ctx.pfadForm] ? ctx.pfadForm : rng.fork('form').weighted(formen, formen.map((f) => FORM_GEWICHT[f] * vorliebe(f)));
    // Etappen (nur lang, ohne erzwungene Form): gewichtet nach den Form-Vorlieben des Autors
    const etappen = etappig ? rng.fork('etappen').weighted(ETAPPEN, ETAPPEN.map((e) => e.reduce((a, f) => a * vorliebe(f), 1))) : [formId];
    const form = FORMEN[etappen[0]];
    const nJe = etappig ? Math.round(n / etappen.length) : n;
    const breite = Math.min(LIMITS.maxWidth - 50, etappen.reduce((a, f) => a + FORMEN[f].groesse(nJe, reach).w, 0));
    const HOEHE = Math.max(...etappen.map((f) => FORMEN[f].groesse(nJe, reach).h));
    const start = form.start();
    const akte = idee ? aktPlan(idee, nJe * etappen.length) : null;

    const szenen = [];
    const richtungen = [];
    etappen.forEach((f, k) => {
      // (Der Akt-Plan läuft über alle Etappen: Züge dieser Etappe beginnen bei richtungen.length)
      const vorher = richtungen.length;
      const leit = akte ? { akt: (i) => akte.akt(vorher + i), rest: (i) => akte.rest(vorher + i), akte: akte.akte } : null;
      const teil = planeSzenen(rng.fork(k ? `szenen${k}` : 'szenen'), nJe, f, hand, leit);
      const versatz = szenen.length;
      szenen.push(...teil.szenen.map((sz) => ({ ...sz, etappe: f })));
      // Jede Etappe bringt ihre Ausweichrichtungen mit (Turm: lieber hoch, Absturz: lieber runter)
      richtungen.push(...teil.richtungen.map((r) => ({ ...r, szene: r.szene + versatz, ausweich: FORMEN[f].ausweich })));
    });
    // Motive (pfad/motive.js): 1–2 Phrasen, die abgewandelt wiederkehren — nur in langen Leveln (erst dort ist Platz für
    // Vorstellung und drei Wiederholungen). `ctx.pfadMotive === false` schaltet sie ab (Tests).
    const palette = idee ? [...new Set(idee.akte.flatMap((a) => a.mechaniken.flatMap((m) => m.split('+'))))] : hand.palette;
    const motivPlan = params.length === 'long' && ctx.pfadMotive !== false ? planeMotive(rng.fork('motive'), richtungen, palette) : [];
    // Dosierung über den ganzen Plan (szenen.js zählt nur innerhalb einer Etappe): höchstens 2 GLEICHE Aufgaben am Stück —
    // an Etappengrenzen standen sonst 3 gleiche hintereinander (andere Aufgaben dazwischen sind erwünscht)
    let aufgabenFolge = 0;
    let vorige = '';
    for (const r of richtungen) {
      if (!r.mechanik || r.abstecher) { aufgabenFolge = 0; vorige = ''; continue; }
      aufgabenFolge = r.mechanik === vorige ? aufgabenFolge + 1 : 1;
      if (aufgabenFolge > 2 && !r.motiv) { r.mechanik = ''; aufgabenFolge = 0; vorige = ''; } else vorige = r.mechanik;
    }
    // Portale sind selten und weit: 1 im kurzen Level, sonst 2
    const portalBudget = params.length === 'short' ? 1 : etappig ? 3 : 2;
    // Endet der Weg vorzeitig (er hat sich eingekreist), mit neuem Zufall noch einmal — der längste Versuch gewinnt. Enge
    // Formen (Halle, Turm) liefen sonst bei jedem dritten bis vierten Seed zu kurz aus.
    let grid = null;
    let weg = null;
    for (let versuch = 0; versuch < 3 && (!weg || weg.abbruch); versuch++) {
      const g2 = ctx.neuesRaster(breite, HOEHE);
      const w2 = planePfad({ rng: rng.fork(versuch ? `weg${versuch}` : 'weg'), cls: params.speedClass, d: params.difficulty, limits, reach, grid: g2, start, richtungen, portalBudget, ausweich: form.ausweich, plattform: hand.plattform, zielschalter: hand.zielschalter, extrem: hand.extrem });
      if (!weg || w2.schritte.length > weg.schritte.length) { grid = g2; weg = w2; }
    }

    // Stacheln der Füllung: höchstens 450, und nur so viele, wie der Weg (Seilgang-Decken, Bröckelblöcke, Laser …) vom
    // Elemente-Limit übrig lässt — 40 bleiben für die gemeinsame Schicht
    const maxStacheln = Math.max(0, Math.min(etappig ? 700 : 450, LIMITS.maxElements - weg.entities.length - 40));
    const { gesetzt, gruppen, gruppeVon } = fuelle({ grid, entities: weg.entities, korridor: weg.korridor, schritte: weg.schritte, rng: rng.fork('fuellung'), d: params.difficulty, start, szenen, halle: !etappig && formId === 'halle', maxStacheln, hand });
    const pruefung = verifiziere({ grid, entities: weg.entities, schritte: weg.schritte, cls: params.speedClass, laufTempo: reach.runSpeed, gesetzt, gruppen, gruppeVon, korridor: weg.korridor, start });

    // Bis zum Ende des Weges zuschneiden (etwas Rand für die Zielplattform)
    const letzte = weg.schritte.length ? weg.schritte[weg.schritte.length - 1].ziel : weg.plattformen[0];
    const maxX = Math.min(breite, Math.max(...weg.plattformen.map((p) => p.x1)) + 14);
    for (const r of grid) r.length = maxX;

    // Checkpoints am Anfang jeder Szene (ab der zweiten): dort, wo etwas Neues beginnt. Stur alle 6 Züge lagen sie oft
    // mitten in einer Folge und wirkten wie Umwege (Rückmeldung 25.09.2026). Nie auf den letzten beiden Plattformen.
    const zonen = [{ id: 'start', kind: 'pfad', x0: 0, w: start.x + START_BREITE, entryRow: start.y + 1, exitRow: start.y + 1, pruefpunkt: false }];
    // (Rückmeldung 27.09.2026: „nach 2 Sprüngen der nächste Checkpoint … 22 in einem Level ist krankhaft“): mindestens
    // ABSTAND Züge zwischen zwei Checkpoints — bei 90 Zügen rund 7. Bevorzugt am Szenenanfang; findet sich dort lange keiner,
    // auch mitten in einer Szene.
    const ABSTAND = Math.max(10, Math.round(weg.schritte.length / 7));
    let letzterCp = 0;
    weg.schritte.forEach((s, i) => {
      const naechster = weg.schritte[i + 1];
      if (!naechster || i >= weg.schritte.length - 2 || i < 2 || s.ziel.broeckel || s.ziel.farbe != null || s.ziel.bruecke) return;
      const szenenwechsel = naechster.szene !== s.szene;
      if (i - letzterCp < ABSTAND || (!szenenwechsel && i - letzterCp < Math.round(ABSTAND * 1.5))) return;
      letzterCp = i;
      zonen.push({
        id: `z${i}`, kind: 'pfad', x0: s.ziel.x0, w: s.ziel.x1 - s.ziel.x0 + 1, entryRow: s.ziel.row, exitRow: s.ziel.row,
        cpX: s.landungen[0].x, cpY: s.ziel.row - 1, pruefpunkt: true,
      });
    });
    zonen.push({ id: 'ziel', kind: 'pfad', x0: letzte.x0, w: letzte.x1 - letzte.x0 + 1, entryRow: letzte.row, exitRow: letzte.row, pruefpunkt: false });

    // Brücken für den Bewegungsgraph: von jeder Standzelle der Absprung- zu jeder der Landeplattform
    const stand = (p) => Array.from({ length: p.x1 - p.x0 + 1 }, (_, k) => ({ x: p.x0 + k, y: p.row - 1 }));
    const abschnitte = weg.schritte.map((s, i) => ({
      von: stand(i === 0 ? weg.plattformen[0] : weg.schritte[i - 1].ziel),
      nach: stand(s.ziel),
      kosten: 1,
    }));

    const ergebnis = {
      grid,
      zonen,
      marken: {
        start,
        // Mit Zielschloss sitzt das Ziel im Käfig am fernen Ende der Zielplattform
        ziel: weg.zielPunkt || { x: Math.round((letzte.x0 + letzte.x1) / 2), y: letzte.row - 1 },
      },
      entities: weg.entities.map(({ fuellung, kappe, sockel, ...e }) => { void fuellung; void kappe; void sockel; return e; }),
      anchors: [],
      abschnitte,
      notizen: {
        form: etappig ? etappen.join('>') : formId,
        thema: hand.thema,
        extrem: hand.extrem,
        leitidee: idee ? { id: idee.id, name: idee.name, satz: idee.satz } : null,
        // Je Motiv: geplante Stellen und wie viele davon wirklich mit dem Motiv-Zug gebaut wurden (Teile je Stelle gezählt)
        motive: motivPlan.map((m) => {
          const teile = weg.schritte.filter((s) => s.motiv && s.motiv.id === m.id);
          return { ...m, vorgestellt: teile.filter((s) => s.motiv.rolle === 'setzen').length, wiederholt: teile.filter((s) => s.motiv.rolle === 'wiederholen').length, geplant: m.laenge * m.stellen };
        }),
        zielschloss: !!weg.zielPunkt,
        handschrift: { plattform: hand.plattform.art, schlicht: Math.round(hand.schlicht * 100) / 100, szenen: hand.szenen, stacheln: Math.round(hand.stacheln * 100) / 100, saeulen: Math.round(hand.saeulen * 100) / 100, grotte: Math.round(hand.grotte * 100) / 100 },
        szenen: szenen.map((s) => `${s.akt != null ? `A${s.akt + 1} ` : ''}${s.muster}/${s.stil}/${s.mechanik || 'sprung'}`),
        zuege: weg.schritte.length,
        mechaniken: weg.schritte.reduce((m, s) => ({ ...m, [s.mechanik]: (m[s.mechanik] || 0) + 1 }), {}),
        pruefung: { zurueckgenommen: pruefung.zurueckgenommen, offen: pruefung.offen },
        gruende: weg.gruende,
      },
    };
    WEGE.set(ergebnis, { schritte: weg.schritte, plattformen: weg.plattformen, start });
    return ergebnis;
  },
};
