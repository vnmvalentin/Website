// Strukturierte Daten (schema.org) für /WinChallenge-Overlay.
//
// Vier Blöcke, jeder mit eigenem Zweck in der Suche:
//   SoftwareApplication  beschreibt das Overlay als kostenloses Werkzeug — der
//                        Preis 0 ist die Angabe, über die Google „kostenlos" belegt sieht
//   HowTo                die fünf Einrichtungsschritte, Grundlage für die Schritt-Ansicht
//   FAQPage              kann als aufklappbares Rich Result unter dem Treffer erscheinen
//   BreadcrumbList       ergibt den Pfad „Startseite › Streamer-Tools › …" im Treffer
//
// Bedingung für FAQ und HowTo: Fragen, Antworten und Schritte müssen auch sichtbar auf
// der Seite stehen. Beides kommt deshalb aus derselben Quelle wie der Seiteninhalt
// (seoContent.jsx) — so können die Angaben gar nicht auseinanderlaufen. Aus demselben
// Grund ist die Sprache ein Parameter: die Daten müssen zur angezeigten Fassung passen.

import { wcSeo } from './seoData';

const SITE_URL = 'https://vnmvalentin.de';

export function buildWinChallengeJsonLd(lang = 'de') {
  const s = wcSeo(lang);
  const pageUrl = `${SITE_URL}/WinChallenge-Overlay${lang === 'en' ? '?lang=en' : ''}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Win Challenge Overlay',
      alternateName: s.alternateName,
      url: pageUrl,
      description: s.description,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Stream-Overlay',
      operatingSystem: 'Web browser',
      browserRequirements: s.browserRequirements,
      inLanguage: lang === 'en' ? 'en' : 'de',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: s.features.map((f) => f.title),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: s.stepsHeading,
      description: s.howToDescription,
      totalTime: 'PT2M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: '0' },
      supply: [],
      tool: s.tools.map((name) => ({ '@type': 'HowToTool', name })),
      step: s.steps.map((step, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: step.name,
        text: step.text,
        url: `${pageUrl}#schritt-${i + 1}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: s.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: s.breadcrumbs[0], item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: s.breadcrumbs[1], item: `${SITE_URL}/tools` },
        { '@type': 'ListItem', position: 3, name: s.breadcrumbs[2], item: pageUrl },
      ],
    },
  ];
}
