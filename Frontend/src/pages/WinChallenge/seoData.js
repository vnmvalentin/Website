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

import { Trophy, Palette, MessageSquare, Timer, MonitorPlay, Users } from 'lucide-react';

export const WC_TITLE = 'Kostenloses Win Challenge Overlay für OBS';

// Rund 155 Zeichen: Google schneidet den Ausschnitt in den Ergebnissen etwa dort ab.
// Der Text muss also an dieser Stelle von selbst zu Ende sein, sonst steht in der
// Suche ein angefangener Satz.
export const WC_DESCRIPTION =
  'Win Challenge Overlay für OBS und Twitch — kostenlos und ohne Download. ' +
  'Challenges anlegen, Siege per Chat zählen, Design frei einstellen, in 2 Minuten eingerichtet.';

export const WC_KEYWORDS =
  'Win Challenge Overlay, Win Challenge OBS, Win Challenge Overlay kostenlos, Winchallenge ' +
  'Overlay Twitch, OBS Overlay Challenge, Stream Challenge Overlay, Win Tracker Overlay, ' +
  'Challenge Liste Stream, Twitch Overlay kostenlos';

/** Die sechs Punkte, die als Feature-Liste UND als featureList im JSON-LD dienen. */
export const WC_FEATURES = [
  {
    icon: Trophy,
    title: 'Challenge-Liste mit Siegzähler',
    text: 'Beliebig viele Challenges mit eigenem Ziel. Siege hochzählen, erledigte abhaken, wichtige anpinnen und die Reihenfolge per Ziehen ändern.',
  },
  {
    icon: MessageSquare,
    title: 'Steuerung über den Twitch-Chat',
    text: 'Siege, Titel und Timer direkt aus dem Chat steuern — ohne Alt-Tab aus dem Spiel. Mehrere Kanäle gleichzeitig möglich.',
  },
  {
    icon: Users,
    title: 'Rechte für Moderatoren',
    text: 'Einzeln freigeben, was deine Mods dürfen: Timer starten und stoppen, den Titel ändern oder Challenges bearbeiten.',
  },
  {
    icon: Palette,
    title: 'Design frei einstellbar',
    text: 'Sechs fertige Farbvorlagen von Twitch-Lila bis Neon, dazu eigene Farben, Schriftgröße, Breite, Ecken, Deckkraft und Animationen.',
  },
  {
    icon: Timer,
    title: 'Eingebauter Timer',
    text: 'Countdown oder Stoppuhr für Zeit-Challenges, direkt im Overlay. Startet, pausiert und springt per Chat-Befehl zurück.',
  },
  {
    icon: MonitorPlay,
    title: 'Eine Browserquelle, fertig',
    text: 'Du bekommst eine feste Adresse für die OBS-Browserquelle. Änderungen im Editor sind sofort im Stream zu sehen — kein Neuladen der Szene.',
  },
];

/** Einrichtungsschritte — dieselben Texte landen als HowTo in den strukturierten Daten. */
export const WC_STEPS = [
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
];

export const WC_FAQ = [
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
    a: 'Ja. In den Einstellungen gibst du einzeln frei, was Mods dürfen: den Timer steuern, den Titel ändern oder Challenges bearbeiten. So musst du während des Spiels nicht selbst ins Menü.',
  },
  {
    q: 'Kann ich die Siege aus dem Chat heraus zählen?',
    a: 'Ja. Das Overlay hängt sich an deinen Twitch-Chat, sodass du und deine Moderatoren Siege, Titel und Timer per Befehl steuern könnt, ohne aus dem Spiel zu wechseln. Mehrere Kanäle gleichzeitig sind möglich.',
  },
  {
    q: 'Bleiben meine Challenges nach dem Stream gespeichert?',
    a: 'Ja. Deine Liste hängt an deinem Twitch-Konto und steht beim nächsten Stream unverändert wieder da — auch der Fortschritt bleibt erhalten.',
  },
];
