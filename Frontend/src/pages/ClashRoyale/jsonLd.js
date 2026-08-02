// Strukturierte Daten (schema.org) für die Hubseite.
//
// Die Minigames sind eine Single-Page-App: ohne diese Angaben sieht Google außer der
// Überschrift kaum Text. WebApplication beschreibt das Angebot, ItemList macht die acht
// Modi maschinenlesbar, FAQPage kann als Rich Result in den Suchergebnissen erscheinen
// (die Fragen stehen deshalb auch sichtbar auf der Seite) und BreadcrumbList liefert den
// Pfad "Startseite › Clash Royale › Minigames" unter dem Suchtreffer.

import { SITE_URL } from './constants';
import { MODES, modeNameFor, modeDescFor } from './modesConfig';

export function buildClashJsonLd(t, lang) {
  const pageUrl = lang === 'en' ? `${SITE_URL}/clash-royale?lang=en` : `${SITE_URL}/clash-royale`;
  const availableModes = MODES.filter(m => m.available);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Clash Royale Minigames',
      url: pageUrl,
      description: t.seoDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: lang === 'en' ? 'Multiplayer draft minigames' : 'Multiplayer-Draft-Minigames',
      operatingSystem: 'Web browser',
      browserRequirements: lang === 'en' ? 'Requires JavaScript and a modern browser' : 'Benötigt JavaScript und einen aktuellen Browser',
      inLanguage: lang === 'en' ? 'en' : 'de',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: availableModes.map(m => modeNameFor(m.id, lang)),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: lang === 'en' ? 'Clash Royale minigame modes' : 'Clash Royale Spielmodi',
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
        { '@type': 'ListItem', position: 1, name: lang === 'en' ? 'Home' : 'Startseite', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Clash Royale', item: `${SITE_URL}/clash` },
        { '@type': 'ListItem', position: 3, name: 'Minigames', item: pageUrl },
      ],
    },
  ];
}
