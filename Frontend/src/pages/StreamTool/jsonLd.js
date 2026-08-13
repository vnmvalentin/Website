// Strukturierte Daten (schema.org) für /twitch-tools.
//
// Aufbau wie beim Win Challenge Overlay: SoftwareApplication für das Angebot selbst,
// ItemList für die einzelnen Module (so kann Google sie einzeln zuordnen — jemand
// sucht nach „Twitch Vorhersage Overlay", nicht nach „Overlay-Sammlung"), HowTo für
// die Einrichtung und FAQPage für die Fragen unter dem Treffer.
//
// Fragen und Schritte kommen aus seoContent.jsx, also aus derselben Quelle wie der
// sichtbare Text — Google verlangt für FAQ und HowTo, dass beides übereinstimmt.

import { ST_DESCRIPTION, ST_MODULES, ST_STEPS, ST_FAQ } from './seoData';

const SITE_URL = 'https://vnmvalentin.de';
const PAGE_URL = `${SITE_URL}/twitch-tools`;

export function buildStreamToolJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Twitch Overlays für OBS',
      alternateName: 'Twitch-Overlay-Tools',
      url: PAGE_URL,
      description: ST_DESCRIPTION,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Stream-Overlay',
      operatingSystem: 'Web browser',
      browserRequirements: 'Benötigt JavaScript und einen aktuellen Browser',
      inLanguage: 'de',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: ST_MODULES.map((m) => m.title),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Verfügbare Twitch-Overlay-Module',
      itemListElement: ST_MODULES.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: m.title,
        description: m.text,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Twitch-Overlays in OBS einrichten',
      description:
        'In fünf Schritten vom Twitch-Login zu Umfragen, Zielen und Stream-Statistik in der OBS-Browserquelle.',
      totalTime: 'PT3M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: '0' },
      supply: [],
      tool: [
        { '@type': 'HowToTool', name: 'OBS Studio, Streamlabs oder XSplit' },
        { '@type': 'HowToTool', name: 'Twitch-Konto' },
      ],
      step: ST_STEPS.map((step, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: step.name,
        text: step.text,
        url: `${PAGE_URL}#schritt-${i + 1}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ST_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Startseite', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Streamer-Tools', item: `${SITE_URL}/tools` },
        { '@type': 'ListItem', position: 3, name: 'Twitch Overlays', item: PAGE_URL },
      ],
    },
  ];
}
