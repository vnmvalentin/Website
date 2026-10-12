// Welttyp „Höhlen & Minen" — der Generator aus Phase 1 und 2, jetzt als EINER von vielen.
//
// Er behält, was er gut kann: gegrabene Gänge mit Wänden zum Wandspringen, Schächte mit
// Vorsprüngen, Inselpassagen und Verzweigungen mit einer Senke im Hauptweg. Was er nicht mehr darf,
// ist der Anspruch, die einzige Form der Welt zu sein — genau daraus kam der Eindruck, dass „alle
// Level wie bergige Höhlen aussehen".
//
// Die Schwerarbeit liegt weiterhin in ../../v2/: Dieses Modul ist der Vertragspartner, nicht der
// Baumeister. So bleibt die Phase-1/2-Arbeit erhalten und ist trotzdem austauschbar.

import { createRng } from '../../../sim/rng.js';
import { buildLayout, ROUTE_TOP, ROUTE_BOTTOM } from '../../v2/layout.js';
import { buildTerrain } from '../../v2/terrain.js';
import { naechsteStandflaeche, GEFAHRENFREI } from '../gemeinsam/plattform.js';
import { neuerBausteinLauf, naechsterBaustein, stempeln, UNTERKANTE } from '../gemeinsam/bausteine.js';
import { wendeGewichtePalette, wendeWandleElement, wendeGewichteMotive } from '../ideen/vertrag.js';
import { naechsterRaum, schachtEntities, RAEUME } from '../motive/hoehlenraeume.js';
import { IDEEN_RAEUME } from '../motive/ideenraeume.js';

const kategorie = (art) => (art === 'spike' || art === 'saw' || art === 'laser' ? art : 'struktur');

// Portale und Gravitationswechsel gehören zu anderen Welttypen — hier würden sie die Form verwässern,
// statt sie zu schärfen. Fokus macht Level einprägsam. (Auch die Ideen-Räume fragen danach.)
const VERBOTEN = ['portal', 'gravityZone'];

/** Höhlens eigene Räume plus die Ideen-Räume (Schlüsselkammer, Gabelung) — letztere mit kleinem Grundgewicht */
const MOTIVE = [...RAEUME, ...IDEEN_RAEUME];

/** Ein Ersatz-Template für die Kernidee-Frage „ist diese Gefahrenart hier erlaubt?" (wie bei Turm) */
const alsTemplate = (arten) => ({ rows: [], markers: Object.fromEntries(arten.map((a, i) => [String.fromCharCode(97 + i), { type: a }])) });

// Zonenarten, in denen Elemente sicher blind gesetzt werden dürfen: eben oder eben-ähnlich, volle
// Breite begehbar. NICHT 'aufstieg'/'abstieg' (Schächte mit schmalen, versetzten Vorsprüngen — ein
// blind gesetztes Hindernis könnte wie beim Turm genau auf der einzigen Kletterspur landen, siehe
// PLANUNG_WELTTYPEN.md) und NICHT 'inseln' (schmale Sprunginseln, dieselbe Gefahr).
const BESTREUBAR = new Set(['lauf', 'tunnel', 'kammer']);
/** Abstand vom Zonenrand, den kein Element betritt (Übergänge bleiben lesbar) */
const ZONEN_RAND = 6;

/**
 * Verstreut Gefahren in einer ebenen Zone. `profile[x]` ist nur eine grobe Interpolation zwischen
 * den Zonen-Ecken (layout.js) — die WIRKLICHE Standfläche wird deshalb je Spalte im fertigen Raster
 * gesucht (`naechsteStandflaeche`), nicht blind auf die Profil-Zeile gesetzt.
 */
function bestreueZone(grid, rng, z, profile, entities, idee, ideeZustand, kontext) {
  const anzahl = Math.max(1, Math.round(z.w / 18));
  const basis = { liste: ['spike', 'saw', 'laser', 'spring'], gewichte: [3, 2, 2, 1] };
  const hookKontext = { ...kontext, zustand: ideeZustand, kategorie };
  const { liste, gewichte } = wendeGewichtePalette(idee, basis.liste, basis.gewichte, hookKontext);
  const wandeln = (spec) => wendeWandleElement(idee, spec, hookKontext);
  if (z.w <= 2 * ZONEN_RAND) return;
  for (let i = 0; i < anzahl; i++) {
    const x = z.x0 + ZONEN_RAND + rng.int(z.w - 2 * ZONEN_RAND);
    const mitte = profile[x] ?? Math.round((z.entryRow + z.exitRow) / 2);
    const y = naechsteStandflaeche(grid, x, Math.max(0, mitte - 6), Math.min(grid.length - 2, mitte + 6));
    if (y < 0) continue;                          // an dieser Spalte zufällig keine Standfläche (Lücke, Wand) — auslassen statt erzwingen
    const art = rng.weighted(liste, gewichte);
    if (art === 'saw') entities.push(wandeln({ type: 'saw', tx: x, ty: y }));
    else if (art === 'laser') entities.push(wandeln({ type: 'laser', tx: x, ty: y + 1, dir: 'up', period: rng.range(1.8, 2.6), on: 0.7, warn: 0.5, reach: 9 }));
    else if (art === 'spring') entities.push(wandeln({ type: 'spring', tx: x, ty: y }));
    else entities.push(wandeln({ type: 'spike', tx: x, ty: y }));
  }
}

/** Zeilen Boden-Vorlauf vor dem Baustein in einer erweiterten Zone (die Zone beginnt mit ihrem Nahtbereich) */
const VORLAUF = 2;
/** Mindestbreite, die nach einem Baustein bis zum Zonenende bleibt (der Boden dort folgt wieder dem Gelände) */
const NACHLAUF = 6;
/** So viel Höhenunterschied zwischen Baustein und Zone darf die späteren Zonen verschieben */
const MAX_VERSCHIEBUNG = 10;
/**
 * Zonenarten, die einen Baustein aufnehmen dürfen: offene Laufzonen — und Tunnel und Kammern, in denen der
 * Chunk als Schlucht zum Himmel aufbricht (die Decke fällt über seinen Spalten weg, davor und danach bleibt
 * sie). Nie Schächte und Inseln (eigene, schmale Form) und nie eine Zone mit Abkürzung (braucht ihre Senke).
 */
const BAUSTEIN_ZONEN = new Set(['lauf', 'tunnel', 'kammer']);

/**
 * Nur Bausteine mit FESTEM Unterrand: In einer massiven Höhle (Grundstoff 'fels') gibt es unter einer
 * Grube keinen Abgrund, in den man fallen könnte — sie liefe als Schacht bis zum Rasterrand, ein
 * Sturz dauerte Sekunden. Bausteine mit offener Grube gehören in Welten aus Luft (Parcours, Himmelsreich).
 */
const bodenVoll = (tpl) => !tpl.rows[tpl.h - 1].includes('.');

/**
 * Wählt für offene Laufzonen ihren Inhalt und macht ihm Platz: die Zone wird breiter (alle folgenden
 * Zonen rücken nach rechts) und ihr Ausgang folgt der Höhe des Eingesetzten (alle folgenden Zonen
 * verschieben sich um denselben Betrag nach oben/unten). Verändert `layout` an Ort und Stelle —
 * BEVOR das Gelände gegraben wird, damit Terrain und Inhalt von Anfang an zusammenpassen.
 *
 * Nur ebene Hauptzonen (BAUSTEIN_ZONEN, nicht Start/Ziel, keine Abkürzung): Schächte und Inseln haben
 * ihre eigene, schmale Form, und die Abkürzung braucht ihre Senke.
 *
 * `holeInstanz(fortschritt, z, spaetMin, spaetMax)` liefert die einzusetzende Instanz oder `null` —
 * woher sie kommt (eigener Raum oder alter Chunk-Baustein), entscheidet der Aufrufer.
 *
 * @returns {{zone: object, inst: object}[]}
 */
function planeBausteinZonen(layout, holeInstanz) {
  const zonen = layout.zones;
  const gewaehlt = [];
  let dx = 0;
  let dr = 0;
  for (let i = 0; i < zonen.length; i++) {
    const z = zonen[i];
    z.x0 += dx; z.entryRow += dr; z.exitRow += dr;
    if (!BAUSTEIN_ZONEN.has(z.kind) || z.role !== 'main' || z.shortcut) continue;

    // Wie weit dürfen die Zeilen aller FOLGENDEN Zonen wandern, ohne das Routenband zu verlassen?
    let spaetMin = Infinity;
    let spaetMax = -Infinity;
    for (let k = i + 1; k < zonen.length; k++) {
      spaetMin = Math.min(spaetMin, zonen[k].entryRow + dr, zonen[k].exitRow + dr);
      spaetMax = Math.max(spaetMax, zonen[k].entryRow + dr, zonen[k].exitRow + dr);
    }
    const inst = holeInstanz(zonen.length > 1 ? i / (zonen.length - 1) : 0, z, spaetMin, spaetMax);
    if (!inst) continue;

    const neuAusgang = z.entryRow + (inst.exit - inst.entry);
    const verschiebung = neuAusgang - z.exitRow;
    const neueBreite = Math.max(z.w, VORLAUF + inst.w + NACHLAUF);
    z.baustein = { inst, x: z.x0 + VORLAUF, bodenRow: z.entryRow };
    z.name = inst.tpl.id;
    z.cpX = z.x0 + VORLAUF;
    z.exitRow = neuAusgang;
    dx += neueBreite - z.w;
    dr += verschiebung;
    z.w = neueBreite;
    gewaehlt.push({ zone: z, inst });
  }

  // Breite und Höhenprofil neu: innerhalb einer Zone linear (wie layout.js) — bei einer Baustein-Zone
  // liegt der Boden bis hinter den Baustein auf der Eingangshöhe und danach flach auf der Ausgangshöhe.
  layout.width = zonen.length ? zonen[zonen.length - 1].x0 + zonen[zonen.length - 1].w : 0;
  const profile = new Array(layout.width);
  for (const z of zonen) {
    const bausteinEnde = z.baustein ? VORLAUF + z.baustein.inst.w : 0;
    for (let i = 0; i < z.w; i++) {
      if (z.baustein) { profile[z.x0 + i] = i < bausteinEnde ? z.entryRow : z.exitRow; continue; }
      const t = z.w === 1 ? 1 : i / (z.w - 1);
      profile[z.x0 + i] = Math.round(z.entryRow + (z.exitRow - z.entryRow) * t);
    }
  }
  layout.profile = profile;
  return gewaehlt;
}

export default {
  id: 'hoehlen',
  label: 'Höhlen & Minen',
  beschreibung: 'Gegrabene Gänge, senkrechte Schächte und Inselpassagen. Geschlossen, bergig, bodenständig.',

  kamera: 'horizontal',
  achse: 'x',
  grundstoff: 'fels',
  // 'boden' plus 'baustein': Dieser Welttyp setzt nichts voraus, was der Graph nicht sicher kennt. Die
  // Route hängt nie an Movern oder Federn im Beiwerk; ein eingesetzter Baustein ist für den Graph nur
  // eine Brücke von Ein- zu Ausgang (faehigkeiten/baustein.js).
  faehigkeiten: ['boden', 'baustein'],

  palette: {
    haupt: ['spike', 'saw', 'crumble'],
    neben: ['laser', 'mover', 'spring', 'fallingBlock', 'crystal'],
    verboten: VERBOTEN,
  },

  biome: ['cave', 'meadow', 'factory'],
  gewicht: 1,

  /**
   * @param {{params, limits, neuesRaster, idee, ideeZustand, tier}} ctx
   * @returns {{grid, zonen, marken, notizen, entities}}
   */
  baue(ctx) {
    const { params, limits, reach, biomeId, idee, ideeZustand, tier } = ctx;
    const layout = buildLayout(params);
    const d = params.difficulty;
    const kontextFuer = (fortschritt) => ({ fortschritt, tier, welttyp: 'hoehlen', zustand: ideeZustand, kategorie });
    const artErlaubt = (art, kontext) => !idee || typeof idee.erlaubtBaustein !== 'function' || idee.erlaubtBaustein(alsTemplate([art]), kontext);

    // Räume (motive/hoehlenraeume.js) UND die alten Chunk-Bausteine bewerben sich um dieselben offenen
    // Laufzonen — Räume zuerst (eigene, seedabhängig IMMER anders geformte Erzeugung, wie die
    // Turm-Stockwerke), Chunks als Rückfall, wenn kein Raum passt oder die Zone nicht auf Räume trifft.
    // MACHT den Zonen Platz, BEVOR das Gelände gegraben wird, damit Terrain und Inhalt von Anfang an
    // zusammenpassen. Die Schwierigkeitsstufe deckelt beides, Kernideen können Gefahrenarten ausschließen
    // (ihre Elemente werden nie verändert — sie sind nur in dieser Form bewiesen).
    // Eine Kernidee, die über Motive wirkt (Schlüsselkette, Zwei Wege), braucht Räume. Gemessen: Mit 70 % Raum-Chance
    // und Wechselpflicht blieb in gut der Hälfte der Level kein einziger Ideen-Raum übrig (28 von 54) — die Idee stand
    // über dem Level, kam darin aber nicht vor. Deshalb, NUR mit einer solchen Idee: 90 % Raum-Chance, der erste Platz
    // gehört sicher der Idee (einführen), und ihr Raum darf direkt wiederkommen (Höhlen hat wenige Plätze, kurz ~1,
    // mittel ~3; seine Varianten wechseln ohnehin mit dem Fortschritt). Ohne Idee bleibt alles wie zuvor.
    const mitMotiven = !!idee && typeof idee.gewichteMotive === 'function';
    const RAUM_CHANCE = mitMotiven ? 0.9 : 0.7;
    const deckel = d + 1;
    const raumRng = createRng(params.seed, 'welttyp:hoehlen:raeume');
    const lauf = neuerBausteinLauf(params, biomeId, { basisZeile: Math.round((ROUTE_TOP + ROUTE_BOTTOM) / 2), rasterHoehe: layout.height });
    let letzterRaumId = null;
    let ideeGesetzt = false;
    const holeInstanz = (fortschritt, z, spaetMin, spaetMax) => {
      const passt = (entry, h, exit) => {
        if (entry > z.entryRow || z.entryRow + (h - entry) + UNTERKANTE > layout.height) return false;
        const dv = z.entryRow + (exit - entry) - z.exitRow;
        return Math.abs(dv) <= MAX_VERSCHIEBUNG && spaetMin + dv >= ROUTE_TOP + 6 && spaetMax + dv <= ROUTE_BOTTOM - 4;
      };
      const wurf = raumRng.range(0, 1);
      if (wurf < RAUM_CHANCE || (mitMotiven && !ideeGesetzt)) {
        const kontext = kontextFuer(fortschritt);
        const bevorzugt = (id) => mitMotiven && wendeGewichteMotive(idee, [id], [1], kontext)[0] > 1;
        const raumCtx = {
          rng: raumRng, limits, reach, d, fortschritt, tier,
          wandle: (spec) => wendeWandleElement(idee, spec, kontext),
          erlaubt: (art) => !VERBOTEN.includes(art) && artErlaubt(art, kontext),
          // Solange die Idee noch nicht vorkam, nur ihre eigenen Räume
          gewichte: (ids, gewichte) => wendeGewichteMotive(idee, ids, gewichte, kontext)
            .map((g, i) => (mitMotiven && !ideeGesetzt && !bevorzugt(ids[i]) ? 0 : g)),
        };
        const raum = naechsterRaum(raumCtx, letzterRaumId && bevorzugt(letzterRaumId) ? null : letzterRaumId, MOTIVE);
        if (raum && passt(raum.entry, raum.h, raum.exit)) {
          letzterRaumId = raum.tpl.id;
          if (bevorzugt(raum.tpl.id)) ideeGesetzt = true;
          return raum;
        }
      }
      // „Nie zweimal dieselbe Art hintereinander" meint direkt hintereinander — kommt ein Chunk dazwischen, ist die
      // Folge unterbrochen. Ohne das Zurücksetzen sperrte ein einmal gewählter Raum sich selbst für den Rest des Levels.
      letzterRaumId = null;
      return naechsterBaustein(lauf, fortschritt, (tpl) => bodenVoll(tpl) && tpl.difficulty <= deckel
        && artErlaubtFuerChunk(idee, tpl, kontextFuer(fortschritt)) && passt(tpl.entry, tpl.h, tpl.exit), z.entryRow);
    };
    const bausteinZonen = planeBausteinZonen(layout, holeInstanz);

    const grid = ctx.neuesRaster(layout.width, layout.height);
    const { shapes, shortcuts } = buildTerrain(layout, params, limits, grid);

    const entities = [];
    const bausteine = [];
    for (const { zone, inst } of bausteinZonen) {
      bausteine.push(stempeln(grid, inst, zone.baustein.x, zone.baustein.bodenRow, bausteine.length, entities, { fels: true }));
      // Das ausgeformte Objekt (Zeilen, Elemente) gehört nicht ins Level-Layout: Es wird kopiert und
      // mitgespeichert. Übrig bleibt, WO es sitzt.
      zone.baustein = { x: zone.baustein.x, w: inst.w };
    }

    // Schacht-Ideen (motive/hoehlenraeume.js): Gefahren IN den Lücken zwischen den bereits ausgegrabenen
    // Vorsprüngen von Aufstiegs-/Abstiegs-Zonen — genau die Stelle, die bisher (wie einst beim Turm)
    // immer leer blieb, "nur veränderte normale Blöcke". Die Vorsprünge selbst bleiben unverändert, der
    // Bewegungsgraph sieht also weiterhin dieselbe bewiesene Geometrie.
    const schachtRng = createRng(params.seed, 'welttyp:hoehlen:schaechte');
    // Sicherer Abstand zum Start: Die gemeinsame Schicht setzt ihn erst NACH diesem Schritt endgültig
    // (setzeStartplattform), aber der Welttyp-eigene Vorschlag (erste.x0+4, unten dieselbe Formel bei
    // `marken.start`) liegt praktisch immer daneben. Ohne diese Schranke konnte der allererste Schacht
    // (direkt hinter der Startzone) ein Laser-/Sägentor bekommen, das näher als GEFAHRENFREI am Start
    // stand — gefunden über den bestehenden Start-Sicherheitstest, nicht durch Zusehen.
    const startX = layout.zones[0].x0 + 4;
    const climbShapes = shapes.filter((s) => s.ledges && s.shaftLeft - GEFAHRENFREI - 4 > startX);
    climbShapes.forEach((shape, i) => {
      const kontext = kontextFuer(climbShapes.length > 1 ? i / (climbShapes.length - 1) : 0);
      const schachtCtx = {
        rng: schachtRng, d,
        wandle: (spec) => wendeWandleElement(idee, spec, kontext),
        erlaubt: (art) => artErlaubt(art, kontext),
      };
      for (const e of schachtEntities(schachtCtx, shape)) entities.push(e);
    });

    const erste = layout.zones[0];
    const letzte = layout.zones[layout.zones.length - 1];

    // Gefahren verstreuen — bis hierhin hatte Höhlen gar keine (gemeldet: "keine Elemente, sieht
    // immer gleich aus"). Nur in ebenen Zonen (siehe BESTREUBAR), mit demselben Kernidee-Haken wie
    // parcours/turm (gen/world/ideen/), damit z. B. "Ein Element, alle Rollen" auch hier greift.
    const bestreuRng = createRng(params.seed, 'welttyp:hoehlen:gefahren');
    const zonenOhneRand = layout.zones.slice(1, -1);
    zonenOhneRand.forEach((z, i) => {
      if (!BESTREUBAR.has(z.kind) || z.baustein) return;
      const fortschritt = zonenOhneRand.length > 1 ? i / (zonenOhneRand.length - 1) : 0;
      bestreueZone(grid, bestreuRng, z, layout.profile, entities, idee, ideeZustand, { fortschritt, tier, welttyp: 'hoehlen' });
    });

    return {
      grid,
      zonen: layout.zones,
      // Nur ein VORSCHLAG — eben, breit und frei macht daraus die gemeinsame Schicht
      // (gemeinsam/plattform.js), und zwar für jeden Welttyp gleich.
      marken: {
        start: { x: erste.x0 + 4, y: erste.entryRow },
        ziel: { x: letzte.x0 + letzte.w - 6, y: letzte.exitRow },
      },
      entities,
      bausteine,
      notizen: { profile: layout.profile, edges: layout.edges, shapes, shortcuts },
    };
  },
};

/** Wie `idee.erlaubtBaustein(tpl, kontext)` — nur so genannt, um sie von der Raum-Fassung (`artErlaubt`) zu unterscheiden */
function artErlaubtFuerChunk(idee, tpl, kontext) {
  return !idee || typeof idee.erlaubtBaustein !== 'function' || idee.erlaubtBaustein(tpl, kontext);
}
