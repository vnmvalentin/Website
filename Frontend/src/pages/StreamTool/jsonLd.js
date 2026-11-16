// Strukturierte Daten (schema.org) für /twitch-tools.
//
// Aufbau wie beim Win Challenge Overlay: SoftwareApplication für das Angebot selbst,
// ItemList für die einzelnen Module (so kann Google sie einzeln zuordnen — jemand
// sucht nach „Twitch Vorhersage Overlay", nicht nach „Overlay-Sammlung"), HowTo für
// die Einrichtung und FAQPage für die Fragen unter dem Treffer.
//
// Fragen und Schritte kommen aus seoData.js, also aus derselben Quelle wie der
// sichtbare Text — Google verlangt für FAQ und HowTo, dass beides übereinstimmt.
// Je Sprache eine Fassung; die englische Seite hat die Adresse ?lang=en.

import { stSeo, ST_PATH } from './seoData.js';

const SITE_URL = 'https://vnmvalentin.de';

export function buildStreamToolJsonLd(lang = 'de') {
  const seo = stSeo(lang);
  const ld = seo.ld;
  const inLanguage = lang === 'en' ? 'en' : 'de';
  const pageUrl = `${SITE_URL}${ST_PATH}${inLanguage === 'en' ? '?lang=en' : ''}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: ld.appName,
      alternateName: ld.altName,
      url: pageUrl,
      description: seo.description,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Stream-Overlay',
      operatingSystem: 'Web browser',
      browserRequirements: ld.browser,
      inLanguage,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: seo.modules.map((m) => m.title),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: ld.listName,
      itemListElement: seo.modules.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: m.title,
        description: m.text,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: seo.stepsHeading,
      description: ld.howToDescription,
      totalTime: 'PT3M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: '0' },
      supply: [],
      tool: ld.tools.map((name) => ({ '@type': 'HowToTool', name })),
      step: seo.steps.map((step, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: step.name,
        text: step.text,
        url: `${pageUrl}#${ld.stepAnchor}-${i + 1}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: seo.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: ld.crumbs[0], item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: ld.crumbs[1], item: `${SITE_URL}/tools` },
        { '@type': 'ListItem', position: 3, name: ld.crumbs[2], item: pageUrl },
      ],
    },
  ];
}
