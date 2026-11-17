// Der VERTRAG, den jeder Welttyp erfüllt.
//
// Bis Phase 2 gab es eine Pipeline mit Parametern — deshalb sahen alle Welten gleich aus. Ab jetzt
// gibt es diesen Vertrag und viele Module, die ihn erfüllen: Der Generator stellt Werkzeug und
// Regeln, entworfen wird das Level vom Welttyp.
//
// `pruefeWelttyp()` läuft, sobald ein Welttyp in die Registry aufgenommen wird. Ein Modul, das den
// Vertrag bricht, soll BEIM LADEN auffallen und nicht erst als kaputtes Level in einer Lobby.

/** Wie die Kamera dem Lauf folgt. 'autoscroll' schiebt von selbst (Extrem „Dauerlauf"). */
export const KAMERA_ARTEN = Object.freeze(['horizontal', 'aufwaerts', 'abwaerts', 'gemischt', 'autoscroll']);

/** Hauptrichtung des Levels. Reparatur und Bewertung müssen wissen, wohin „vorwärts" zeigt. */
export const ACHSEN = Object.freeze(['x', 'y']);

/**
 * Womit das leere Raster beginnt.
 *   'fels' — es wird gegraben (Höhlen, Turm, Fabrik)
 *   'luft' — es wird gebaut  (Himmelsreich, Neon-Stadt)
 * Das ist keine Kosmetik: Beim Himmelsreich ist der Abgrund der Normalfall, und ein Generator, der
 * erst alles zumauert und dann 95 % wieder wegräumt, beschreibt die Welt falsch herum.
 */
export const GRUNDSTOFFE = Object.freeze(['fels', 'luft']);

/**
 * Welche Kantenarten der Bewegungsgraph in diesem Welttyp zählen darf.
 *
 * Ein Welttyp darf nur voraussetzen, was er hier anmeldet — sonst entsteht eine Garantie, die nur
 * auf dem Papier gilt. Umgekehrt gilt: Was angemeldet ist, MUSS der Graph auch können, sonst hält
 * er lösbare Welten für kaputt.
 */
export const FAEHIGKEITEN = Object.freeze(['boden', 'mover', 'grapple', 'portal', 'gravitation', 'feder', 'baustein', 'stockwerk', 'pfad']);

// Pflichtfelder eines Welttyp-Moduls.
//
// `masse()` stand hier zuerst auch drin — ein Welttyp sollte vorab sagen, wie groß seine Welt wird.
// Das geht nicht ehrlich: Bei den Höhlen ergibt sich die Breite erst aus den gewürfelten Zonen, ein
// Voraus-Wert wäre entweder geraten oder doppelte Arbeit. Maßgeblich ist deshalb das Raster, das
// `baue()` zurückgibt; gegen LIMITS geprüft wird danach.
const PFLICHT = ['id', 'label', 'beschreibung', 'kamera', 'achse', 'grundstoff', 'faehigkeiten', 'palette', 'biome', 'baue'];

const istListe = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0);

/**
 * Prüft ein Welttyp-Modul gegen den Vertrag.
 * @returns {string[]} leere Liste = in Ordnung; sonst je ein Satz je Verstoß
 */
export function pruefeWelttyp(typ) {
  const fehler = [];
  if (!typ || typeof typ !== 'object') return ['Welttyp ist kein Objekt'];
  const name = typ.id || '(ohne id)';

  for (const feld of PFLICHT) {
    if (typ[feld] === undefined || typ[feld] === null) fehler.push(`${name}: Feld "${feld}" fehlt`);
  }
  if (typeof typ.id === 'string' && !/^[a-z][a-z0-9-]*$/.test(typ.id)) {
    fehler.push(`${name}: id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten`);
  }
  if (typ.kamera && !KAMERA_ARTEN.includes(typ.kamera)) fehler.push(`${name}: unbekannte Kamera "${typ.kamera}"`);
  if (typ.achse && !ACHSEN.includes(typ.achse)) fehler.push(`${name}: unbekannte Achse "${typ.achse}"`);
  if (typ.grundstoff && !GRUNDSTOFFE.includes(typ.grundstoff)) fehler.push(`${name}: unbekannter Grundstoff "${typ.grundstoff}"`);

  if (typ.faehigkeiten !== undefined) {
    if (!istListe(typ.faehigkeiten)) fehler.push(`${name}: faehigkeiten muss eine Liste von Namen sein`);
    else {
      for (const f of typ.faehigkeiten) if (!FAEHIGKEITEN.includes(f)) fehler.push(`${name}: unbekannte Fähigkeit "${f}"`);
      // Ohne 'boden' gibt es keine Standfläche, auf der Start, Ziel und Checkpoints liegen könnten.
      if (!typ.faehigkeiten.includes('boden')) fehler.push(`${name}: "boden" ist Pflicht — Marken brauchen festen Grund`);
    }
  }

  if (typ.palette !== undefined) {
    const p = typ.palette;
    if (!p || typeof p !== 'object') fehler.push(`${name}: palette muss ein Objekt sein`);
    else {
      for (const rolle of ['haupt', 'neben', 'verboten']) {
        if (p[rolle] !== undefined && !istListe(p[rolle])) fehler.push(`${name}: palette.${rolle} muss eine Liste sein`);
      }
      // Ein Element kann nicht gleichzeitig tragende Rolle und verboten sein. Das klingt
      // selbstverständlich, passiert aber sofort, wenn man eine Palette von einem Nachbarn kopiert.
      const verboten = new Set(p.verboten || []);
      for (const rolle of ['haupt', 'neben']) {
        for (const el of p[rolle] || []) {
          if (verboten.has(el)) fehler.push(`${name}: "${el}" steht in palette.${rolle} UND in palette.verboten`);
        }
      }
      if ((p.haupt || []).length === 0) fehler.push(`${name}: palette.haupt ist leer — ein Welttyp ohne tragende Mechanik ist keiner`);
    }
  }

  if (typ.biome !== undefined && (!istListe(typ.biome) || typ.biome.length === 0)) {
    fehler.push(`${name}: biome muss eine nicht leere Liste sein`);
  }
  for (const feld of ['baue']) {
    if (typ[feld] !== undefined && typeof typ[feld] !== 'function') fehler.push(`${name}: ${feld} muss eine Funktion sein`);
  }
  if (typ.gewicht !== undefined && !(typeof typ.gewicht === 'number' && typ.gewicht > 0)) {
    fehler.push(`${name}: gewicht muss eine positive Zahl sein`);
  }

  return fehler;
}

/** Wirft, wenn der Welttyp den Vertrag bricht. Für die Registry. */
export function forderVertrag(typ) {
  const fehler = pruefeWelttyp(typ);
  if (fehler.length) throw new Error(`Welttyp verletzt den Vertrag:\n  ${fehler.join('\n  ')}`);
  return typ;
}
