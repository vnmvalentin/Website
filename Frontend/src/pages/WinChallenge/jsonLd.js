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
// (seoContent.jsx) — so können die Angaben gar nicht auseinanderlaufen.

import { WC_DESCRIPTION, WC_FEATURES, WC_STEPS, WC_FAQ } from './seoData';

const SITE_URL = 'https://vnmvalentin.de';
const PAGE_URL = `${SITE_URL}/WinChallenge-Overlay`;

export function buildWinChallengeJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Win Challenge Overlay',
      alternateName: 'WinChallenge Overlay für OBS',
      url: PAGE_URL,
      description: WC_DESCRIPTION,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Stream-Overlay',
      operatingSystem: 'Web browser',
      browserRequirements: 'Benötigt JavaScript und einen aktuellen Browser',
      inLanguage: 'de',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'vnmvalentin', url: SITE_URL },
      featureList: WC_FEATURES.map((f) => f.title),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Win Challenge Overlay in OBS einrichten',
      description:
        'In fünf Schritten vom Twitch-Login zum fertigen Win Challenge Overlay in der OBS-Browserquelle.',
      totalTime: 'PT2M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: '0' },
      supply: [],
      tool: [
        { '@type': 'HowToTool', name: 'OBS Studio, Streamlabs oder XSplit' },
        { '@type': 'HowToTool', name: 'Twitch-Konto' },
      ],
      step: WC_STEPS.map((step, i) => ({
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
      mainEntity: WC_FAQ.map((item) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Win Challenge Overlay', item: PAGE_URL },
      ],
    },
  ];
}
