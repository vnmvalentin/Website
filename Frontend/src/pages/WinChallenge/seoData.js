// Öffentlicher Teil von /WinChallenge-Overlay — alles, was OHNE Twitch-Login sichtbar ist.
//
// Warum es diese Datei gibt: Der Editor liegt komplett hinter dem Login. Ein Crawler
// (und jeder Erstbesucher) sah vorher genau einen Satz — "Mit Twitch anmelden um
// Challenges zu erstellen", 142 Zeichen Text auf der ganzen Seite. Damit kann Google
// die Seite nur auf den exakten Titel matchen; für alles andere fehlt schlicht der
// Inhalt, den es bewerten könnte.
//
// Hier steht deshalb, was das Overlay kann, wie man es in OBS einrichtet und was
// Zuschauer typischerweise dazu fragen. Der Text beschreibt nur Funktionen, die es
// wirklich gibt (Challenge-Liste, Design-Vorlagen, Chat-Steuerung, Timer) — erfundene
// Features würden die Absprungrate hochtreiben und das Ranking wieder kosten.
//
// Nur die Texte — gerendert wird in seoContent.jsx. Getrennt, weil dieselben Listen
// auch in jsonLd.js als HowTo und FAQPage landen: eine Quelle, damit sichtbarer Text
// und strukturierte Daten nicht auseinanderlaufen können.
//
// Deutsch und Englisch stehen nebeneinander (wcSeo(lang)). Die englische Fassung ist unter
// ?lang=en eine eigene Adresse und zielt auf die englischen Suchbegriffe.

import { Trophy, Palette, MessageSquare, Timer, MonitorPlay, Users } from 'lucide-react';

// Reihenfolge = Reihenfolge der features-Listen unten
const FEATURE_ICONS = [Trophy, MessageSquare, Users, Palette, Timer, MonitorPlay];

const de = {
  title: 'Kostenloses Win Challenge Overlay für OBS',
  // Rund 155 Zeichen: Google schneidet den Ausschnitt in den Ergebnissen etwa dort ab.
  // Der Text muss also an dieser Stelle von selbst zu Ende sein, sonst steht in der
  // Suche ein angefangener Satz.
  description:
    'Win Challenge Overlay für OBS und Twitch — kostenlos und ohne Download. ' +
    'Challenges anlegen, Siege per Chat zählen, Design frei einstellen, in 2 Minuten eingerichtet.',
  keywords:
    'Win Challenge Overlay, Win Challenge OBS, Win Challenge Overlay kostenlos, Winchallenge ' +
    'Overlay Twitch, OBS Overlay Challenge, Stream Challenge Overlay, Win Tracker Overlay, ' +
    'Challenge Liste Stream, Twitch Overlay kostenlos',
  h1: 'Win Challenge Overlay für OBS',
  lead:
    'Lege deine Stream-Ziele fest und zeig deinen Zuschauern jederzeit, was noch offen ist. ' +
    'Kostenlos, ohne Download, in zwei Minuten in OBS eingerichtet.',
  sub: 'Für Twitch · OBS, Streamlabs, XSplit · keine Kosten, kein Abo',
  featuresHeading: 'Was das Overlay kann',
  stepsHeading: 'Win Challenge Overlay in OBS einrichten',
  faqHeading: 'Häufige Fragen zum Win Challenge Overlay',
  howToDescription:
    'In fünf Schritten vom Twitch-Login zum fertigen Win Challenge Overlay in der OBS-Browserquelle.',
  alternateName: 'WinChallenge Overlay für OBS',
  browserRequirements: 'Benötigt JavaScript und einen aktuellen Browser',
  tools: ['OBS Studio, Streamlabs oder XSplit', 'Twitch-Konto'],
  breadcrumbs: ['Startseite', 'Streamer-Tools', 'Win Challenge Overlay'],
  // Die sechs Punkte, die als Feature-Liste UND als featureList im JSON-LD dienen.
  features: [
    {
      title: 'Challenge-Liste mit Siegzähler',
      text: 'Beliebig viele Challenges mit eigenem Ziel. Siege hochzählen, erledigte abhaken, wichtige anpinnen und die Reihenfolge per Ziehen ändern.',
    },
    {
      title: 'Steuerung über den Twitch-Chat',
      text: 'Siege, Titel und Timer direkt aus dem Chat steuern — ohne Alt-Tab aus dem Spiel. Mehrere Kanäle gleichzeitig möglich.',
    },
    {
      title: 'Rechte für Moderatoren',
      text: 'Einzeln freigeben, was deine Mods dürfen: Timer starten und stoppen, den Titel ändern oder Challenges bearbeiten.',
    },
    {
      title: 'Design frei einstellbar',
      text: 'Sechs fertige Farbvorlagen von Twitch-Lila bis Neon, dazu eigene Farben, Schriftgröße, Breite, Ecken, Deckkraft und Animationen.',
    },
    {
      title: 'Eingebauter Timer',
      text: 'Countdown oder Stoppuhr für Zeit-Challenges, direkt im Overlay. Startet, pausiert und springt per Chat-Befehl zurück.',
    },
    {
      title: 'Eine Browserquelle, fertig',
      text: 'Du bekommst eine feste Adresse für die OBS-Browserquelle. Änderungen im Editor sind sofort im Stream zu sehen — kein Neuladen der Szene.',
    },
  ],
  // Einrichtungsschritte — dieselben Texte landen als HowTo in den strukturierten Daten.
  steps: [
    {
      name: 'Mit Twitch anmelden',
      text: 'Melde dich oben mit deinem Twitch-Konto an. Es entsteht automatisch eine Challenge-Liste, die nur dir gehört.',
    },
    {
      name: 'Challenges eintragen',
      text: 'Trage deine Challenges mit Namen und Ziel ein, zum Beispiel „10 Siege in Ranked" oder „3 Spiele ohne Tod".',
    },
    {
      name: 'Aussehen anpassen',
      text: 'Wähle unter „Design" eine Farbvorlage oder stelle Farben, Breite, Ecken und Deckkraft selbst ein. Die Vorschau zeigt sofort das Ergebnis.',
    },
    {
      name: 'Overlay in OBS einbinden',
      text: 'Kopiere die Overlay-Adresse, füge sie in OBS als neue Browserquelle ein und setze Breite und Höhe auf deine Leinwandgröße, üblicherweise 1920 × 1080.',
    },
    {
      name: 'Im Stream steuern',
      text: 'Zähle Siege über den Editor oder per Chat-Befehl hoch. Das Overlay im Stream aktualisiert sich sofort mit.',
    },
  ],
  faq: [
    {
      q: 'Ist das Win Challenge Overlay kostenlos?',
      a: 'Ja, vollständig. Es gibt keine Kosten, keine Testphase und kein Abo. Du brauchst nur ein Twitch-Konto, damit deine Challenge-Liste gespeichert werden kann.',
    },
    {
      q: 'Wie binde ich das Overlay in OBS ein?',
      a: 'Kopiere im Editor die Overlay-Adresse und lege in OBS eine neue Quelle vom Typ „Browser" an. Adresse einfügen, Breite und Höhe auf deine Leinwandgröße setzen (meist 1920 × 1080) — fertig. Änderungen erscheinen sofort, ohne die Szene neu zu laden.',
    },
    {
      q: 'Funktioniert das Overlay auch mit Streamlabs oder anderen Programmen?',
      a: 'Ja. Das Overlay ist eine normale Webseite, deshalb läuft es überall, wo es Browserquellen gibt — Streamlabs Desktop, XSplit, Twitch Studio und OBS Studio.',
    },
    {
      q: 'Was ist eine Win Challenge überhaupt?',
      a: 'Bei einer Win Challenge legst du dir vor dem Stream Ziele fest, zum Beispiel eine bestimmte Anzahl Siege pro Spiel oder Modus. Das Overlay zeigt deinen Zuschauern jederzeit, welche Ziele offen sind und wie weit du bist. Solange etwas offen ist, wird weitergespielt.',
    },
    {
      q: 'Können meine Moderatoren die Challenges mitbedienen?',
      a: 'Ja. Unter „Einrichtung“ gibst du einzeln frei, was Mods dürfen: den Timer steuern, den Titel ändern oder Challenges bearbeiten. So musst du während des Spiels nicht selbst ins Menü.',
    },
    {
      q: 'Kann ich die Siege aus dem Chat heraus zählen?',
      a: 'Ja. Das Overlay hängt sich an deinen Twitch-Chat, sodass du und deine Moderatoren Siege, Titel und Timer per Befehl steuern könnt, ohne aus dem Spiel zu wechseln. Mehrere Kanäle gleichzeitig sind möglich.',
    },
    {
      q: 'Bleiben meine Challenges nach dem Stream gespeichert?',
      a: 'Ja. Deine Liste hängt an deinem Twitch-Konto und steht beim nächsten Stream unverändert wieder da — auch der Fortschritt bleibt erhalten.',
    },
  ],
};

const en = {
  title: 'Free Win Challenge Overlay for OBS',
  description:
    'Win challenge overlay for OBS and Twitch — free, no download. ' +
    'Add challenges, count wins from chat, style it your way, set up in 2 minutes.',
  keywords:
    'win challenge overlay, win challenge OBS, free win challenge overlay, win challenge ' +
    'overlay Twitch, OBS challenge overlay, stream challenge overlay, win counter overlay, ' +
    'stream goals overlay, free Twitch overlay',
  h1: 'Win Challenge Overlay for OBS',
  lead:
    'Set your stream goals and show your viewers what is still open at any time. ' +
    'Free, no download, set up in OBS in two minutes.',
  sub: 'For Twitch · OBS, Streamlabs, XSplit · no cost, no subscription',
  featuresHeading: 'What the overlay can do',
  stepsHeading: 'Set up the Win Challenge overlay in OBS',
  faqHeading: 'Frequently asked questions about the Win Challenge overlay',
  howToDescription:
    'Five steps from the Twitch login to a finished win challenge overlay in your OBS browser source.',
  alternateName: 'WinChallenge overlay for OBS',
  browserRequirements: 'Requires JavaScript and a current browser',
  tools: ['OBS Studio, Streamlabs or XSplit', 'Twitch account'],
  breadcrumbs: ['Home', 'Streamer tools', 'Win Challenge Overlay'],
  features: [
    {
      title: 'Challenge list with win counter',
      text: 'As many challenges as you like, each with its own goal. Count wins, tick off finished ones, pin important ones and reorder by dragging.',
    },
    {
      title: 'Control from Twitch chat',
      text: 'Control wins, title and timer straight from chat, without tabbing out of the game. Several channels at once are possible.',
    },
    {
      title: 'Permissions for moderators',
      text: 'Decide one by one what your mods may do: start and stop the timer, change the title or edit challenges.',
    },
    {
      title: 'Fully customizable design',
      text: 'Six ready-made color presets from Twitch purple to neon, plus custom colors, font size, width, corners, opacity and animations.',
    },
    {
      title: 'Built-in timer',
      text: 'A timer for timed challenges, right in the overlay. Start, pause and reset it with a chat command.',
    },
    {
      title: 'One browser source, done',
      text: 'You get one fixed address for the OBS browser source. Changes in the editor show up on stream immediately, without reloading the scene.',
    },
  ],
  steps: [
    {
      name: 'Log in with Twitch',
      text: 'Log in at the top with your Twitch account. A challenge list that belongs only to you is created automatically.',
    },
    {
      name: 'Add your challenges',
      text: 'Enter your challenges with a name and a goal, for example “10 wins in ranked” or “3 games without dying”.',
    },
    {
      name: 'Adjust the look',
      text: 'Pick a color preset under “Design” or set colors, width, corners and opacity yourself. The preview shows the result right away.',
    },
    {
      name: 'Add the overlay to OBS',
      text: 'Copy the overlay address, add it to OBS as a new browser source and set width and height to your canvas size, usually 1920 × 1080.',
    },
    {
      name: 'Control it on stream',
      text: 'Count wins in the editor or with a chat command. The overlay on stream updates immediately.',
    },
  ],
  faq: [
    {
      q: 'Is the Win Challenge overlay free?',
      a: 'Yes, completely. There is no cost, no trial and no subscription. You only need a Twitch account so your challenge list can be saved.',
    },
    {
      q: 'How do I add the overlay to OBS?',
      a: 'Copy the overlay address in the editor and create a new source of type “Browser” in OBS. Paste the address, set width and height to your canvas size (usually 1920 × 1080) and you are done. Changes appear immediately, without reloading the scene.',
    },
    {
      q: 'Does the overlay work with Streamlabs or other software?',
      a: 'Yes. The overlay is a normal web page, so it runs anywhere browser sources exist: Streamlabs Desktop, XSplit, Twitch Studio and OBS Studio.',
    },
    {
      q: 'What is a win challenge?',
      a: 'In a win challenge you set goals before the stream, for example a certain number of wins per game or mode. The overlay shows your viewers at any time which goals are still open and how far you are. As long as something is open, you keep playing.',
    },
    {
      q: 'Can my moderators help manage the challenges?',
      a: 'Yes. Under “Setup” you decide one by one what mods may do: control the timer, change the title or edit challenges. That way you do not have to open the menu yourself mid-game.',
    },
    {
      q: 'Can I count wins from chat?',
      a: 'Yes. The overlay connects to your Twitch chat, so you and your moderators can control wins, title and timer with commands without leaving the game. Several channels at once are possible.',
    },
    {
      q: 'Are my challenges saved after the stream?',
      a: 'Yes. Your list is tied to your Twitch account and is there unchanged for your next stream, including the progress.',
    },
  ],
};

const withIcons = (text) => ({
  ...text,
  features: text.features.map((f, i) => ({ ...f, icon: FEATURE_ICONS[i] })),
});

const WC_SEO = { de: withIcons(de), en: withIcons(en) };

/** Alle öffentlichen Texte der Seite in einer Sprache. */
export const wcSeo = (lang) => WC_SEO[lang] || WC_SEO.de;
