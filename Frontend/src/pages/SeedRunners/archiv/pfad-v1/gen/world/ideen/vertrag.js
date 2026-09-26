// Kernidee-Vertrag — Pflichtfelder für „eine Idee pro Level" (gen/PLANUNG_WELTTYPEN.md, Phase C).
//
// Anders als ein Welttyp (der ein eigenes Raster baut) greift eine Kernidee NIE selbst ins Raster
// ein — sie verändert nur, WELCHES Element der Welttyp an seinen eigenen Entscheidungspunkten wählt
// und mit welchen Parametern. Der Vertrag ist deshalb klein: drei optionale Hooks, alle mit
// no-op-Vorgabe, plus ein paar Pflichtangaben zum Anzeigen und Filtern.
//
//   vorbereiten(rng, kontext) -> zustand
//     EINMAL pro Level, vor dem eigentlichen Bau. `rng` ist ein eigener, vom Welttyp UNABHÄNGIGER
//     Teilstrom — eine Idee, die einmal würfelt (z. B. "welche Gefahrenart wird DIE eine"), tut das
//     hier, nicht verstreut an jedem Aufrufpunkt. `zustand` wird danach bei jedem Hook-Aufruf als
//     `kontext.zustand` mitgereicht.
//
//   gewichtePalette(liste, gewichte, kontext) -> { liste, gewichte }
//     Bei JEDER gewichteten Wahl, die ein Welttyp trifft (z. B. parcours' `baueSegment()`).
//     `kontext.kategorie(art)` ordnet ein Welttyp-internes Label einer welttyp-UNABHÄNGIGEN
//     Kategorie zu ('spike' | 'saw' | 'laser' | 'struktur' | 'sonst') — nur darüber bleibt eine Idee
//     wiederverwendbar, ohne die genauen Label-Namen jedes Welttyps zu kennen.
//
//   wandleElement(spec, kontext) -> spec
//     Bei JEDEM erzeugten Element, kurz bevor es in `entities` landet — für Parameter-Eingriffe wie
//     einen gemeinsamen Takt.
//
//   erlaubtBaustein(tpl, kontext) -> boolean   (optional)
//     Bevor ein handgebauter Baustein (gemeinsam/bausteine.js) gewählt wird. Seine Elemente werden NIE
//     verändert (sie sind in genau dieser Form vom Solver bewiesen) — wenn sein Inhalt dem Versprechen
//     der Idee widerspricht, wird er stattdessen ausgeschlossen. `gefahrenImBaustein(tpl)` sagt, welche
//     Gefahrenarten er enthält.
//
//   gewichteMotive(ids, gewichte, kontext) -> gewichte   (optional)
//     Bevor ein Welttyp ein MOTIV wählt (einen Höhlen-Raum, einen Ideen-Raum aus motive/ideenraeume.js).
//     Anders als `gewichtePalette` geht es nicht um ein einzelnes Element, sondern um einen ganzen
//     Abschnitt mit eigener Form — der Weg, über den eine Idee wie „Schlüsselkette" ihre Räume ins Level
//     bringt, ohne selbst ins Raster zu greifen. Gewicht 0 heißt: dieses Motiv nicht.
//
// `kontext` trägt in jedem Hook mindestens: { fortschritt (0..1 durchs Level), tier, welttyp,
// zustand, kategorie }.

const PFLICHTFELDER = ['id', 'label', 'beschreibung', 'kompatibel'];
const HOOKS = ['vorbereiten', 'gewichtePalette', 'wandleElement', 'erlaubtBaustein', 'gewichteMotive'];

export function pruefeIdee(idee) {
  const fehler = [];
  for (const feld of PFLICHTFELDER) if (idee[feld] === undefined) fehler.push(`fehlt: ${feld}`);
  if (idee.kompatibel !== undefined && idee.kompatibel !== 'alle' && !Array.isArray(idee.kompatibel)) {
    fehler.push('kompatibel muss "alle" oder ein Array von Welttyp-ids sein');
  }
  if (Array.isArray(idee.kompatibel) && idee.kompatibel.length === 0) {
    fehler.push('kompatibel ist ein leeres Array — die Idee würde nie gewählt');
  }
  if (!HOOKS.some((h) => typeof idee[h] === 'function')) {
    fehler.push(`muss mindestens einen Hook implementieren (${HOOKS.join('/')})`);
  }
  for (const h of HOOKS) if (idee[h] !== undefined && typeof idee[h] !== 'function') fehler.push(`${h} muss eine Funktion sein`);
  return fehler;
}

export function forderIdee(idee) {
  const fehler = pruefeIdee(idee);
  if (fehler.length) throw new Error(`Kernidee "${idee.id || '?'}" verletzt den Vertrag: ${fehler.join('; ')}`);
  return idee;
}

export const passtZuWelttyp = (idee, welttypId) => idee.kompatibel === 'alle' || idee.kompatibel.includes(welttypId);

/** Palette unverändert lassen / Element unverändert lassen — die Vorgabe, wenn eine Idee (oder gar keine) den Hook nicht hat. */
export function wendeGewichtePalette(idee, liste, gewichte, kontext) {
  if (!idee || typeof idee.gewichtePalette !== 'function') return { liste, gewichte };
  const out = idee.gewichtePalette(liste, gewichte, kontext);
  return out && out.liste && out.liste.length ? out : { liste, gewichte };
}

/** Motiv-Gewichte durch die Idee schicken; ohne Hook (oder bei unbrauchbarer Antwort) unverändert. */
export function wendeGewichteMotive(idee, ids, gewichte, kontext) {
  if (!idee || typeof idee.gewichteMotive !== 'function') return gewichte;
  const out = idee.gewichteMotive(ids, gewichte, kontext);
  return Array.isArray(out) && out.length === ids.length && out.every((g) => Number.isFinite(g) && g >= 0) ? out : gewichte;
}

export function wendeWandleElement(idee, spec, kontext) {
  if (!idee || typeof idee.wandleElement !== 'function') return spec;
  return idee.wandleElement(spec, kontext) || spec;
}

/**
 * Welche Gefahrenarten ('spike' | 'saw' | 'laser') ein Chunk-Template wirklich enthält — aus seinen
 * Rasterzeichen UND Markern, nicht aus seinen Tags: Tags sind Mechaniken für die Einführungsreihenfolge,
 * kein Inhaltsverzeichnis (ein Chunk mit Spikes am Grubenboden trägt nicht zwingend das Tag 'spikes').
 * @returns {Set<string>}
 */
export function gefahrenImBaustein(tpl) {
  const arten = new Set();
  if (tpl.rows.some((r) => r.includes('^'))) arten.add('spike');
  for (const def of Object.values(tpl.markers || {})) if (def.type === 'spike' || def.type === 'saw' || def.type === 'laser') arten.add(def.type);
  return arten;
}
