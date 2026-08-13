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

import { BarChart3, TrendingUp, Target, Activity, Clapperboard } from 'lucide-react';

// 34 Zeichen — mit dem automatischen Zusatz " - vnmvalentin" bleibt der Titel unter den
// rund 60 Zeichen, die Google in den Ergebnissen anzeigt.
export const ST_TITLE = 'Kostenlose Twitch Overlays für OBS';

// Rund 155 Zeichen — siehe Anmerkung in WinChallenge/seoContent.jsx: Google schneidet
// den Ausschnitt etwa dort ab, der Satz muss also vorher fertig sein.
export const ST_DESCRIPTION =
  'Kostenlose OBS-Overlays für Twitch: Umfragen, Vorhersagen, Follower- und Abo-Ziele, ' +
  'Stream-Statistik und Raid-Clips live einblenden. Ohne Download.';

export const ST_KEYWORDS =
  'Twitch Overlay kostenlos, Twitch Umfrage Overlay, Twitch Poll OBS, Twitch Vorhersage ' +
  'Overlay, Twitch Prediction Overlay, Follower Ziel Overlay, Abo Ziel Overlay, Twitch Raid ' +
  'Clip Overlay, Stream Statistik Overlay, OBS Overlay Twitch, Bits pro Stream';

/** Die fünf Module — zugleich featureList und ItemList in den strukturierten Daten. */
export const ST_MODULES = [
  {
    icon: BarChart3,
    title: 'Umfragen',
    text: 'Zeigt laufende Twitch-Umfragen mit Balken, Stimmen und Restzeit. Du startest sie wie gewohnt in Twitch, das Overlay blendet sie automatisch ein und nach dem Ende wieder aus.',
  },
  {
    icon: TrendingUp,
    title: 'Vorhersagen',
    text: 'Kanalpunkte-Vorhersagen mit allen Optionen, Quoten und Einsätzen. Auf Wunsch verschwindet die Karte, solange die Vorhersage gesperrt ist und sich ohnehin nichts mehr tut.',
  },
  {
    icon: Target,
    title: 'Follower- und Abo-Ziel',
    text: 'Fortschrittsbalken für dein Ziel — entweder direkt aus dem Creator-Dashboard gespiegelt oder mit eigenem Zielwert. Erreichte Ziele können automatisch weiterzählen.',
  },
  {
    icon: Activity,
    title: 'Statistik dieses Streams',
    text: 'Follows, Abos, Bits, Zuschauer, Höchststand und Laufzeit seit Sendebeginn — einzeln zuschaltbar, nebeneinander oder als Liste.',
  },
  {
    icon: Clapperboard,
    title: 'Raid-Clips',
    text: 'Raidet dich jemand, spielt das Overlay automatisch einen Clip des Raiders ab. Mindestzuschauerzahl, Zeitraum, Länge und Lautstärke stellst du selbst ein.',
  },
];

export const ST_STEPS = [
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
];

export const ST_FAQ = [
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
];
