// Öffentlicher Teil von /twitch-tools — alles, was OHNE Twitch-Login sichtbar ist.
//
// Gleiche Ausgangslage wie beim Win Challenge Overlay: Der Editor liegt hinter dem
// Login, ein Crawler sah vorher 278 Zeichen Text, davon die Hälfte Navigation. Der
// Titel war zwar gut gefüllt, aber mit 101 Zeichen zu lang für die Suchergebnisse —
// Google schnitt ihn ab und schrieb sich oft einen eigenen.
//
// Hier stehen die fünf Module, die Einrichtung und die häufigen Fragen. Alle Angaben
// decken sich mit MODULE_DEFAULTS aus streamToolConfig.js.
//
// Nur die Texte — gerendert wird in seoContent.jsx. Getrennt, weil dieselben Listen
// auch in jsonLd.js als HowTo und FAQPage landen: eine Quelle, damit sichtbarer Text
// und strukturierte Daten nicht auseinanderlaufen können.
//
// Deutsch und Englisch (seit 16.11.2026): die englische Fassung hat wie bei der Win
// Challenge eine eigene Adresse (?lang=en), siehe ST_ALTERNATES.

import { BarChart3, TrendingUp, Target, Activity, Clapperboard } from 'lucide-react';

export const ST_PATH = '/twitch-tools';

/** Sprachfassungen der Seite für die hreflang-Verweise (siehe components/SEO.jsx). */
export const ST_ALTERNATES = [
  { hrefLang: 'de', path: ST_PATH },
  { hrefLang: 'en', path: ST_PATH, search: '?lang=en' },
  { hrefLang: 'x-default', path: ST_PATH },
];

const ICONS = [BarChart3, TrendingUp, Target, Activity, Clapperboard];

const ST_SEO = {
  de: {
    // 34 Zeichen — mit dem automatischen Zusatz " - vnmvalentin" bleibt der Titel unter den
    // rund 60 Zeichen, die Google in den Ergebnissen anzeigt.
    title: 'Kostenlose Twitch Overlays für OBS',
    // Rund 155 Zeichen — siehe Anmerkung in WinChallenge/seoContent.jsx: Google schneidet
    // den Ausschnitt etwa dort ab, der Satz muss also vorher fertig sein.
    description:
      'Kostenlose OBS-Overlays für Twitch: Umfragen, Vorhersagen, Follower- und Abo-Ziele, ' +
      'Stream-Statistik und Raid-Clips live einblenden. Ohne Download.',
    keywords:
      'Twitch Overlay kostenlos, Twitch Umfrage Overlay, Twitch Poll OBS, Twitch Vorhersage ' +
      'Overlay, Twitch Prediction Overlay, Follower Ziel Overlay, Abo Ziel Overlay, Twitch Raid ' +
      'Clip Overlay, Stream Statistik Overlay, OBS Overlay Twitch, Bits pro Stream',
    heading: 'Twitch Overlays für OBS',
    lead: 'Umfragen, Vorhersagen, Follower- und Abo-Ziele, Stream-Statistik und Raid-Clips live im Stream einblenden. Kostenlos, ohne Download, alles über eine einzige Browserquelle.',
    platforms: 'Für Twitch · OBS, Streamlabs, XSplit · keine Kosten, kein Abo',
    modulesHeading: 'Diese Overlays gibt es',
    stepsHeading: 'Twitch-Overlays in OBS einrichten',
    faqHeading: 'Häufige Fragen zu den Twitch-Overlays',
    /** Die fünf Module — zugleich featureList und ItemList in den strukturierten Daten. */
    modules: [
      {
        title: 'Umfragen',
        text: 'Zeigt laufende Twitch-Umfragen mit Balken, Stimmen und Restzeit. Du startest sie wie gewohnt in Twitch, das Overlay blendet sie automatisch ein und nach dem Ende wieder aus.',
      },
      {
        title: 'Vorhersagen',
        text: 'Kanalpunkte-Vorhersagen mit allen Optionen, Quoten und Einsätzen. Auf Wunsch verschwindet die Karte, solange die Vorhersage gesperrt ist und sich ohnehin nichts mehr tut.',
      },
      {
        title: 'Follower- und Abo-Ziel',
        text: 'Fortschrittsbalken für dein Ziel — entweder direkt aus dem Creator-Dashboard gespiegelt oder mit eigenem Zielwert. Erreichte Ziele können automatisch weiterzählen.',
      },
      {
        title: 'Statistik dieses Streams',
        text: 'Follows, Abos, Bits, Zuschauer, Höchststand und Laufzeit seit Sendebeginn — einzeln zuschaltbar, nebeneinander oder als Liste.',
      },
      {
        title: 'Raid-Clips',
        text: 'Raidet dich jemand, spielt das Overlay automatisch einen Clip des Raiders ab. Mindestzuschauerzahl, Zeitraum, Länge und Lautstärke stellst du selbst ein.',
      },
    ],
    steps: [
      {
        name: 'Mit Twitch anmelden',
        text: 'Melde dich mit deinem Twitch-Konto an. Die Freigabe erlaubt der Seite, Umfragen, Ziele und Ereignisse deines Kanals zu lesen.',
      },
      {
        name: 'Module auswählen',
        text: 'Schalte die Overlays frei, die du brauchst: Umfragen, Vorhersagen, Follower-Ziel, Abo-Ziel, Stream-Statistik oder Raid-Clips.',
      },
      {
        name: 'Auf der Leinwand platzieren',
        text: 'Zieh jedes Modul in der Vorschau an seinen Platz und stell Größe, Akzentfarbe, Deckkraft und Einblend-Animation ein.',
      },
      {
        name: 'Overlay in OBS einbinden',
        text: 'Kopiere die Overlay-Adresse und lege in OBS eine Browserquelle mit 1920 × 1080 an. Alle aktiven Module laufen über diese eine Quelle.',
      },
      {
        name: 'Ganz normal streamen',
        text: 'Umfragen und Vorhersagen startest du wie immer in Twitch, Ziele und Statistik laufen von allein mit. Das Overlay blendet sich passend ein und aus.',
      },
    ],
    faq: [
      {
        q: 'Sind die Twitch-Overlays kostenlos?',
        a: 'Ja, alle Module sind kostenlos und ohne Abo nutzbar. Du brauchst nur ein Twitch-Konto, damit das Overlay die Daten deines Kanals lesen darf.',
      },
      {
        q: 'Wie binde ich die Overlays in OBS ein?',
        a: 'Kopiere die Overlay-Adresse aus dem Editor und lege in OBS eine neue Quelle vom Typ „Browser" an. Adresse einfügen, Breite 1920 und Höhe 1080 setzen — fertig. Alle aktiven Module kommen über diese eine Quelle, du brauchst also nicht pro Modul eine eigene.',
      },
      {
        q: 'Muss ich die Umfrage im Overlay starten?',
        a: 'Nein. Du startest Umfragen und Vorhersagen wie gewohnt in Twitch, im Creator-Dashboard oder per Chat. Das Overlay merkt es von selbst, blendet die Karte ein und nach dem Ergebnis wieder aus.',
      },
      {
        q: 'Kann ich Position, Farben und Größe der Overlays ändern?',
        a: 'Ja. Jedes Modul wird in der Vorschau frei auf der Leinwand platziert. Größe, Akzentfarbe, Deckkraft, Einblend-Animation und die Balkenfarben lassen sich einzeln einstellen — auch die Kopfzeile kann ganz weg, wenn es kleiner sein soll.',
      },
      {
        q: 'Wie funktioniert das Raid-Clip-Overlay?',
        a: 'Raidet dich jemand, sucht das Overlay einen Clip aus dessen Kanal und spielt ihn im Stream ab. Du legst fest, ab wie vielen mitgebrachten Zuschauern das passiert, aus welchem Zeitraum der Clip stammen darf, wie lang er höchstens sein soll und wie laut er läuft. Ein kleiner Vorlauf sorgt dafür, dass er nicht in deinen Raid-Alert hineinredet.',
      },
      {
        q: 'Zeigt die Stream-Statistik auch Bits und neue Abos?',
        a: 'Ja. Seit Sendebeginn zählt das Overlay Follows, Abos und Bits mit, dazu auf Wunsch Zuschauerzahl, Höchststand und Laufzeit. Bei den Abos kannst du festlegen, ob Wiederholungsabos und verschenkte Abos mitzählen.',
      },
      {
        q: 'Funktionieren die Overlays auch mit Streamlabs oder XSplit?',
        a: 'Ja. Die Overlays sind normale Webseiten und laufen überall, wo es Browserquellen gibt — OBS Studio, Streamlabs Desktop, XSplit und Twitch Studio.',
      },
    ],
    // Nur für die strukturierten Daten (jsonLd.js)
    ld: {
      appName: 'Twitch Overlays für OBS',
      altName: 'Twitch-Overlay-Tools',
      browser: 'Benötigt JavaScript und einen aktuellen Browser',
      listName: 'Verfügbare Twitch-Overlay-Module',
      howToDescription: 'In fünf Schritten vom Twitch-Login zu Umfragen, Zielen und Stream-Statistik in der OBS-Browserquelle.',
      tools: ['OBS Studio, Streamlabs oder XSplit', 'Twitch-Konto'],
      stepAnchor: 'schritt',
      crumbs: ['Startseite', 'Streamer-Tools', 'Twitch Overlays'],
    },
  },
  en: {
    title: 'Free Twitch Overlays for OBS',
    description:
      'Free OBS overlays for Twitch: show polls, predictions, follower and sub goals, ' +
      'stream stats and raid clips live on stream. No download needed.',
    keywords:
      'free Twitch overlay, Twitch poll overlay, Twitch poll OBS, Twitch prediction overlay, ' +
      'follower goal overlay, sub goal overlay, Twitch raid clip overlay, stream stats overlay, ' +
      'OBS overlay Twitch, bits per stream',
    heading: 'Twitch Overlays for OBS',
    lead: 'Show polls, predictions, follower and sub goals, stream stats and raid clips live on stream. Free, no download, all through a single browser source.',
    platforms: 'For Twitch · OBS, Streamlabs, XSplit · no cost, no subscription',
    modulesHeading: 'Available overlays',
    stepsHeading: 'Set up Twitch overlays in OBS',
    faqHeading: 'FAQ about the Twitch overlays',
    modules: [
      {
        title: 'Polls',
        text: 'Shows running Twitch polls with bars, votes and time left. You start them in Twitch as usual; the overlay shows them automatically and hides them again when they end.',
      },
      {
        title: 'Predictions',
        text: 'Channel points predictions with all outcomes, odds and bets. If you like, the card disappears while the prediction is locked and nothing is happening anyway.',
      },
      {
        title: 'Follower and sub goal',
        text: 'Progress bar for your goal — either mirrored straight from your Creator Dashboard or with your own target. Reached goals can keep counting automatically.',
      },
      {
        title: 'Stats for this stream',
        text: 'Follows, subs, bits, viewers, peak and uptime since the stream started — each one optional, side by side or as a list.',
      },
      {
        title: 'Raid clips',
        text: "When someone raids you, the overlay automatically plays a clip from the raider. You set the minimum viewers, time range, length and volume yourself.",
      },
    ],
    steps: [
      {
        name: 'Log in with Twitch',
        text: 'Log in with your Twitch account. The permission lets the site read polls, goals and events from your channel.',
      },
      {
        name: 'Pick your modules',
        text: 'Turn on the overlays you need: polls, predictions, follower goal, sub goal, stream stats or raid clips.',
      },
      {
        name: 'Place them on the canvas',
        text: 'Drag each module to its spot in the preview and set size, accent color, opacity and entrance animation.',
      },
      {
        name: 'Add the overlay to OBS',
        text: 'Copy the overlay address and add a 1920 × 1080 browser source in OBS. All active modules run through this one source.',
      },
      {
        name: 'Stream as usual',
        text: 'Start polls and predictions in Twitch as always; goals and stats update on their own. The overlay shows and hides itself at the right moments.',
      },
    ],
    faq: [
      {
        q: 'Are the Twitch overlays free?',
        a: 'Yes, all modules are free to use without a subscription. You only need a Twitch account so the overlay may read your channel data.',
      },
      {
        q: 'How do I add the overlays to OBS?',
        a: 'Copy the overlay address from the editor and add a new source of type "Browser" in OBS. Paste the address, set width 1920 and height 1080 — done. All active modules come through this one source, so you don\'t need a separate one per module.',
      },
      {
        q: 'Do I have to start the poll in the overlay?',
        a: 'No. Start polls and predictions in Twitch as usual, in the Creator Dashboard or via chat. The overlay notices on its own, shows the card and hides it again after the result.',
      },
      {
        q: 'Can I change the position, colors and size of the overlays?',
        a: 'Yes. Each module is placed freely on the canvas in the preview. Size, accent color, opacity, entrance animation and bar colors can be set individually — you can even drop the header entirely to make it smaller.',
      },
      {
        q: 'How does the raid clip overlay work?',
        a: "When someone raids you, the overlay picks a clip from their channel and plays it on stream. You decide from how many incoming viewers this happens, which time range the clip may come from, its maximum length and how loud it plays. A short delay makes sure it doesn't talk over your raid alert.",
      },
      {
        q: 'Do the stream stats include bits and new subs?',
        a: 'Yes. Since the stream started, the overlay counts follows, subs and bits, plus viewer count, peak and uptime if you like. For subs you can decide whether resubs and gifted subs count.',
      },
      {
        q: 'Do the overlays work with Streamlabs or XSplit?',
        a: 'Yes. The overlays are regular web pages and run anywhere browser sources are supported — OBS Studio, Streamlabs Desktop, XSplit and Twitch Studio.',
      },
    ],
    ld: {
      appName: 'Twitch Overlays for OBS',
      altName: 'Twitch overlay tools',
      browser: 'Requires JavaScript and an up-to-date browser',
      listName: 'Available Twitch overlay modules',
      howToDescription: 'In five steps from Twitch login to polls, goals and stream stats in your OBS browser source.',
      tools: ['OBS Studio, Streamlabs or XSplit', 'Twitch account'],
      stepAnchor: 'step',
      crumbs: ['Home', 'Streamer tools', 'Twitch Overlays'],
    },
  },
};

/** Texte der öffentlichen Seite in einer Sprache; Module mit ihrem Symbol. */
export function stSeo(lang) {
  const seo = ST_SEO[lang] || ST_SEO.de;
  return { ...seo, modules: seo.modules.map((m, i) => ({ ...m, icon: ICONS[i] })) };
}

/** Rohfassung je Sprache (für den Vollständigkeits-Test). */
export const ST_SEO_TEXTS = ST_SEO;
