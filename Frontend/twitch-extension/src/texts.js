// texts.js — Texte der Twitch-Erweiterung (Panel und Einstellungsseite), Deutsch und Englisch.
// Panel: Sprache des Zuschauers, Einstellungsseite: Sprache des Streamers (beides aus Twitchs ?language=).
import { defineMessages } from "../../src/i18n/core.js";

const de = {
  panel: {
    loading: "Lade Win Tracker …",
    noTracker: "Für diesen Kanal ist noch kein Win Tracker eingerichtet.",
    noAccount: "Noch kein Clash-Royale-Account verbunden.",
    error: "Gerade keine Verbindung — es geht gleich von selbst weiter.",
    footer: "Win Tracker · vnmvalentin.de",
  },
  config: {
    title: "Win Tracker unter deinem Stream",
    intro: "Das Panel zeigt deinen Zuschauern dasselbe wie dein Win-Tracker-Overlay: Liga oder Trophäen, die Bilanz der Session, die letzten Spiele und dein Deck — in ihrer Sprache.",
    checking: "Prüfe deinen Win Tracker …",
    found: "Verbunden",
    foundText: (name, tag) => `Das Panel zeigt den aktiven Account ${name}${tag ? ` (${tag})` : ""}.`,
    noAccountTitle: "Win Tracker gefunden, aber ohne Account",
    noAccountText: "Trag im Win Tracker deinen Spieler-Tag ein. Diese Seite merkt es von selbst.",
    missingTitle: "Noch kein Win Tracker",
    missingSteps: [
      "Öffne den Win Tracker auf vnmvalentin.de und melde dich mit DIESEM Twitch-Konto an.",
      "Trag deinen Spieler-Tag ein, zum Beispiel #2PP.",
      "Komm hierher zurück — die Seite prüft es von selbst.",
    ],
    openTracker: "Win Tracker öffnen",
    recheck: "Erneut prüfen",
    lookHint: "Look, Module und Modus stellst du im Win Tracker ein — Panel und OBS-Overlay folgen denselben Einstellungen. Feste Größen fürs OBS gelten im Panel nicht.",
    previewTitle: "Vorschau",
    error: "Der Server antwortet gerade nicht. Versuch es gleich noch einmal.",
    notConfigured: "Die Erweiterung ist auf dem Server noch nicht eingerichtet.",
    privacy: "Gespeichert wird nichts über deine Zuschauer: Das Panel liest nur die öffentlichen Clash-Royale-Zahlen deines Win Trackers.",
  },
};

const en = {
  panel: {
    loading: "Loading Win Tracker …",
    noTracker: "This channel hasn't set up the Win Tracker yet.",
    noAccount: "No Clash Royale account connected yet.",
    error: "No connection right now — it will continue on its own.",
    footer: "Win Tracker · vnmvalentin.de",
  },
  config: {
    title: "Win Tracker below your stream",
    intro: "The panel shows your viewers the same as your Win Tracker overlay: league or trophies, your session record, your latest games and your deck — in their language.",
    checking: "Checking your Win Tracker …",
    found: "Connected",
    foundText: (name, tag) => `The panel shows your active account ${name}${tag ? ` (${tag})` : ""}.`,
    noAccountTitle: "Win Tracker found, but no account yet",
    noAccountText: "Add your player tag in the Win Tracker. This page notices by itself.",
    missingTitle: "No Win Tracker yet",
    missingSteps: [
      "Open the Win Tracker on vnmvalentin.de and sign in with THIS Twitch account.",
      "Add your player tag, for example #2PP.",
      "Come back here — this page checks by itself.",
    ],
    openTracker: "Open Win Tracker",
    recheck: "Check again",
    lookHint: "You set look, modules and mode in the Win Tracker — panel and OBS overlay follow the same settings. Fixed sizes for OBS don't apply to the panel.",
    previewTitle: "Preview",
    error: "The server isn't responding right now. Please try again in a moment.",
    notConfigured: "The extension hasn't been set up on the server yet.",
    privacy: "Nothing about your viewers is stored: the panel only reads the public Clash Royale numbers of your Win Tracker.",
  },
};

export const EXT_TEXTS = defineMessages({ de, en });
