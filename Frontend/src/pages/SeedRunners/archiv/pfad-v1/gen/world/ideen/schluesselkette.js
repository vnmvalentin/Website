// Kernidee „Schlüsselkette" (Katalog Nr. 19) — jeder Schlüssel öffnet die Tür zum nächsten.
//
// Die Idee greift nicht selbst ins Raster: Sie bevorzugt beim Motiv-Wählen die Schlüsselkammer
// (motive/ideenraeume.js), deren Varianten dem Bogen folgen — Schlüssel auf einer Ablage, dann über
// eine Treppe zurück, dann zwei Schlüssel mit Bröckelpfad, wo erlaubt auch hinter einem Portal. Keine
// Grundregel eines Elements ändert sich (Design-Vorgabe: Kombinationen, keine Umbauten).

const MOTIV = 'schluesselkammer';

export default {
  id: 'schluesselkette',
  label: 'Schlüsselkette',
  beschreibung: 'Jeder Schlüssel öffnet die Tür zum nächsten — auf Ablagen, über Umwege, in Ketten.',
  kompatibel: ['hoehlen', 'parcours'],

  gewichteMotive(ids, gewichte, kontext) {
    const mult = kontext.tier === 'stark' ? 12 : 6;
    return gewichte.map((g, i) => (ids[i] === MOTIV ? Math.max(g, 1) * mult : g));
  },
};
