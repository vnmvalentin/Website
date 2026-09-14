// Strukturierte Daten (schema.org) für die Hubseite.
//
// Die Minigames sind eine Single-Page-App: ohne diese Angaben sieht Google außer der
// Überschrift kaum Text. WebApplication beschreibt das Angebot, ItemList macht die acht
// Modi maschinenlesbar, FAQPage kann als Rich Result in den Suchergebnissen erscheinen
// (die Fragen stehen deshalb auch sichtbar auf der Seite) und BreadcrumbList liefert den
// Pfad "Startseite › Clash Royale › Minigames" unter dem Suchtreffer.

import { SITE_URL } from './constants';
import { MODES, modeNameFor, modeDescFor } from './modesConfig';

// Nur die paar Wörter, die nicht schon über t (PAGE_I18N) oder modesConfig.js laufen.
const JSONLD_I18N = {
  de: {
    subCategory: 'Multiplayer-Draft-Minigames',
    browserReq: 'Benötigt JavaScript und einen aktuellen Browser',
    modesListName: 'Clash Royale Spielmodi',
    home: 'Startseite',
  },
  en: {
    subCategory: 'Multiplayer draft minigames',
    browserReq: 'Requires JavaScript and a modern browser',
    modesListName: 'Clash Royale minigame modes',
    home: 'Home',
  },
  es: {
    subCategory: 'Minijuegos de draft multijugador',
    browserReq: 'Requiere JavaScript y un navegador moderno',
    modesListName: 'Modos de minijuegos de Clash Royale',
    home: 'Inicio',
  },
};

export function buildClashJsonLd(t, lang) {
  const j = JSONLD_I18N[lang] || JSONLD_I18N.de;
  // lang selbst ist bereits 'de'/'en'/'es' — passt 1:1 als ?lang= und als inLanguage-Code,
  // Deutsch bleibt ohne Parameter die kanonische Fassung.
  const pageUrl = lang === 'de' ? `${SITE_URL}/clash-royale` : `${SITE_URL}/clash-royale?lang=${lang}`;
  const availableModes = MODES.filter(m => m.available);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Clash Royale Minigames',
      url: pageUrl,
      description: t.seoDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: j.subCategory,
      operatingSystem: 'Web browser',
      browserRequirements: j.browserReq,
      inLanguage: lang,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: availableModes.map(m => modeNameFor(m.id, lang)),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: j.modesListName,
      itemListElement: availableModes.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: modeNameFor(m.id, lang),
        description: modeDescFor(m.id, lang),
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (t.faqItems || []).map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: j.home, item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Clash Royale', item: `${SITE_URL}/clash` },
        { '@type': 'ListItem', position: 3, name: 'Minigames', item: pageUrl },
      ],
    },
  ];
}
