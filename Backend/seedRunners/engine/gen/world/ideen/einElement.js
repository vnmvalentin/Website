// Kernidee „Ein Element, alle Rollen" (Katalog Nr. 25) — nur EINE Gefahrenart im ganzen Level,
// dafür in jeder denkbaren Anordnung. Die Wahl fällt einmal (`vorbereiten`), nicht bei jeder
// Gelegenheit neu — sonst wäre es dasselbe gemischte Level wie ohne die Idee.
//
// "Struktur"-Kategorien (Lücken, Federn — alles, was keine Gefahrenart im eigentlichen Sinn ist)
// bleiben immer erlaubt: Die Idee schränkt die GEFAHR ein, nicht die Fortbewegung.

import { gefahrenImBaustein } from './vertrag.js';

export default {
  id: 'einElement',
  label: 'Ein Element, alle Rollen',
  beschreibung: 'Nur eine Gefahrenart im ganzen Level — dafür in jeder denkbaren Anordnung.',
  kompatibel: ['parcours', 'turm', 'hoehlen'],

  vorbereiten(rng) {
    return { art: rng.pick(['spike', 'saw', 'laser']) };
  },

  gewichtePalette(liste, gewichte, kontext) {
    const { art } = kontext.zustand;
    const out = { liste: [], gewichte: [] };
    for (let i = 0; i < liste.length; i++) {
      const kat = kontext.kategorie(liste[i]);
      if (kat === 'struktur' || kat === art) { out.liste.push(liste[i]); out.gewichte.push(gewichte[i]); }
    }
    return out;
  },

  // Nur Bausteine, deren Gefahren ausschließlich die EINE gewählte Art sind (Struktur ohne Gefahr
  // geht immer). Ihre Elemente werden nie verändert — sie sind in dieser Form bewiesen.
  erlaubtBaustein(tpl, kontext) {
    for (const art of gefahrenImBaustein(tpl)) if (art !== kontext.zustand.art) return false;
    return true;
  },
};
