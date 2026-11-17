// productTexts.js — Texte der Produktseiten /tools/win-tracker, /tools/win-challenge und /tools/twitch-overlays auf
// Deutsch und Englisch (Ausbauplan „produktseiten“, Spur C).
//
// Wozu eigene Seiten, obwohl die Werkzeuge selbst eine öffentliche Ansicht haben: Die Werkzeug-Adressen zeigen
// Angemeldeten den Editor — ein Link in einem Streamer-Discord landet also je nach Leser woanders. Die Produktseiten
// sehen für alle gleich aus, laufen mit der echten Overlay-Vorschau und sind vorgerendert. Der Win Tracker hatte
// bisher gar keine öffentliche Beschreibung.
//
// Nur belegte Funktionen: jede Aussage ist im Code des jeweiligen Werkzeugs nachgesehen. Dieselben Listen landen in
// den strukturierten Daten (buildProductJsonLd) — sichtbarer Text und JSON-LD können nicht auseinanderlaufen.
import { defineMessages } from "../../i18n/core.js";

export const PRODUCT_IDS = ["win-tracker", "win-challenge", "twitch-overlays"];
export const productPath = (id) => `/tools/${id}`;

/** Wo das Werkzeug selbst liegt, welcher Reiter der Galerie passt und welches Vorschaubild die Link-Vorschau zeigt. */
export const PRODUCT_META = {
  "win-tracker": { tool: "/clash-royale/win-tracker", gallery: "win-tracker", image: "/media/previews/win-tracker.webp" },
  "win-challenge": { tool: "/WinChallenge-Overlay", gallery: "win-challenge", image: "/media/previews/win-challenge.webp" },
  "twitch-overlays": { tool: "/twitch-tools", gallery: "twitch", image: "/media/previews/twitch-prediction.webp" },
};

const de = {
  ui: {
    back: "Streamer-Tools",
    setup: "Kostenlos einrichten",
    templates: "Vorlagen ansehen",
    facts: "Kostenlos · ohne Download · für OBS, Streamlabs und XSplit",
    previewNote: "Live-Vorschau mit Beispieldaten — so sieht es im Stream aus.",
    featuresHeading: "Was es kann",
    stepsHeading: "In drei Schritten im Stream",
    faqHeading: "Häufige Fragen",
    moreHeading: "Mehr für deinen Stream",
    allTools: "Alle Streamer-Tools",
    learnMore: "Mehr erfahren",
    home: "Startseite",
  },
  products: {
    "win-tracker": {
      name: "Win Tracker",
      seoTitle: "Clash Royale Win Tracker Overlay für OBS",
      description:
        "Kostenloses OBS-Overlay für Clash Royale: Liga, Medaillen oder Trophäen, Session-Bilanz, Siegquote und die letzten Spiele live aus der offiziellen API.",
      keywords:
        "Clash Royale Overlay, Clash Royale Win Tracker, Clash Royale OBS Overlay, Clash Royale Stream Overlay, " +
        "Medaillen Tracker, Trophäen Tracker, Path of Legend Overlay, Clash Royale Twitch Overlay",
      kicker: "Für Clash-Royale-Streamer",
      h1: "Clash Royale Win Tracker Overlay",
      lead:
        "Zeig deinen Zuschauern Liga, Medaillen oder Trophäen, die Bilanz der laufenden Session und die letzten Spiele " +
        "mit Deck — live aus der offiziellen Clash-Royale-API. Du spielst, der Tracker zählt von selbst mit.",
      teaser: "Liga, Session-Bilanz und letzte Spiele für Clash-Royale-Streams.",
      features: [
        {
          title: "Live aus der offiziellen API",
          text: "Kurz nach jedem Match stimmt das Overlay wieder: Liga mit Stufe oder Medaillen, Trophäen, Siege, Niederlagen und Siegquote. Eintragen musst du nichts.",
        },
        {
          title: "Session statt Kalendertag",
          text: "Die Bilanz zählt deine Session. Eine neue beginnt erst nach vier Stunden ohne Ranked-Match — ein Stream über Mitternacht bleibt eine Session.",
        },
        {
          title: "Letzte Spiele und Deck",
          text: "Die letzten fünf Ergebnisse auf einen Blick, dazu das Deck, mit dem du gerade spielst, dein Profil und auf Wunsch dein Clan.",
        },
        {
          title: "Alle Modi, auch Events",
          text: "Ranked, Trophäenpfad, 2v2-Ranked und saisonale Liga-Modi, dazu Challenges, Crown Series und Global Tournaments. Der Tracker wechselt von selbst auf den Modus, den du spielst.",
        },
        {
          title: "Befehle für deinen Chat",
          text: "Zuschauer fragen mit !rang, !session, !deck und !rekord selbst nach — jeder Befehl einzeln einschaltbar, mit Abklingzeit. Deine Mods tragen mit !tracker Accounts ein und wechseln sie.",
        },
        {
          title: "Dein Look, deine Accounts",
          text: "Schlicht oder im Clash-Royale-Stil mit fünf fertigen Vorlagen, Größe frei einstellbar. Mehrere Accounts, und am Saisonende ein Rückblick als Bild zum Teilen.",
        },
      ],
      steps: [
        {
          name: "Anmelden und Account eintragen",
          text: "Melde dich mit Twitch an und gib deinen Spieler-Tag ein, zum Beispiel #2PP. Weitere Accounts nimmst du jederzeit dazu.",
        },
        {
          name: "Aussehen wählen",
          text: "Leg fest, was das Overlay zeigt, und wähle einen Look — schlicht oder im Clash-Royale-Stil. Die Vorschau zeigt sofort das Ergebnis.",
        },
        {
          name: "Link in OBS einfügen",
          text: "Kopiere den Overlay-Link und füge ihn in OBS als Browserquelle ein. Ab dem nächsten Match zählt der Tracker mit.",
        },
      ],
      faq: [
        {
          q: "Ist der Win Tracker kostenlos?",
          a: "Ja. Es gibt kein Abo und keine Testphase. Du brauchst nur ein Twitch-Konto, damit deine Accounts und Einstellungen gespeichert werden.",
        },
        {
          q: "Woher kommen die Zahlen?",
          a: "Aus der offiziellen Clash-Royale-API von Supercell. Der Tracker liest dein öffentliches Spielerprofil und deine letzten Matches — ein Passwort oder Zugang zu deinem Spielkonto braucht er nicht.",
        },
        {
          q: "Wann beginnt eine neue Session?",
          a: "Nach vier Stunden ohne Ranked-Match. Ein Stream, der über Mitternacht geht, bleibt so eine Session, und am nächsten Streamtag beginnt die Bilanz von vorn.",
        },
        {
          q: "Welche Modi zeigt der Tracker?",
          a: "Ranked mit Liga und Medaillen, den Trophäenpfad, 2v2-Ranked, saisonale Liga-Modi, Challenges wie die 20-Sieg-Challenge, Crown Series und Global Tournaments. Spielst du einen anderen Modus, stellt sich das Overlay von selbst darauf um.",
        },
        {
          q: "Können Zuschauer meinen Rang im Chat abfragen?",
          a: "Ja, mit !rang, !session, !deck und !rekord. Jeden Befehl schaltest du im Editor einzeln ein und legst eine Abklingzeit fest; für deine Mods gilt sie nicht.",
        },
        {
          q: "Wie binde ich das Overlay in OBS ein?",
          a: "Kopiere im Editor den Overlay-Link, lege in OBS eine Browserquelle an und füge ihn ein. Größe und Format stellst du im Editor ein, damit die Schrift scharf bleibt — das geht auch in Streamlabs und XSplit.",
        },
        {
          q: "Gibt es das Overlay auch auf Englisch?",
          a: "Ja. Editor und Overlay gibt es auf Deutsch und Englisch, die Sprache stellst du oben im Editor um.",
        },
      ],
    },
    "win-challenge": {
      name: "Win Challenge",
      seoTitle: "Win Challenge Overlay für Twitch-Streams",
      description:
        "So sieht das kostenlose Win Challenge Overlay im Stream aus: Challenges mit Siegzähler, Timer, Steuerung per Chat und sechs Farbvorlagen.",
      keywords:
        "Win Challenge Overlay, Win Challenge Twitch, Win Challenge OBS, Stream Challenge Overlay, " +
        "Challenge Liste Overlay, Siegzähler Overlay, Twitch Overlay kostenlos",
      kicker: "Für Streamer",
      h1: "Win Challenge Overlay",
      lead:
        "Zeig deinen Zuschauern, welche Challenges noch offen sind: Siege zählen, Serien abhaken, Timer laufen lassen — " +
        "gesteuert im Editor oder direkt aus dem Twitch-Chat.",
      teaser: "Challenge-Liste mit Siegzähler, Timer und Chat-Steuerung.",
      features: [
        {
          title: "Challenges mit Siegzähler",
          text: "Beliebig viele Challenges mit eigenem Ziel. Siege hochzählen, Serien Win für Win abhaken, Erledigtes durchstreichen, Wichtiges anpinnen.",
        },
        {
          title: "Steuerung aus dem Chat",
          text: "Siege, Titel und Timer per Chat-Befehl steuern, ohne aus dem Spiel zu wechseln. Auch für mehrere Kanäle gleichzeitig.",
        },
        {
          title: "Rechte für Moderatoren",
          text: "Du gibst einzeln frei, was deine Mods dürfen: den Timer steuern, den Titel ändern oder Challenges bearbeiten.",
        },
        {
          title: "Eingebauter Timer",
          text: "Countdown oder Stoppuhr für Zeit-Challenges, direkt im Overlay. Startet, pausiert und springt per Befehl zurück.",
        },
        {
          title: "Sechs Farbvorlagen",
          text: "Von Twitch-Lila bis Neon, dazu eigene Farben, Schriftgröße, Breite, Ecken, Deckkraft und Animationen.",
        },
        {
          title: "Deutsch und Englisch",
          text: "Editor, Overlay und die Antworten im Chat gibt es auf Deutsch und Englisch. Deine Liste bleibt von Stream zu Stream gespeichert.",
        },
      ],
      steps: [
        {
          name: "Anmelden und Challenges eintragen",
          text: "Melde dich mit Twitch an und trag deine Challenges mit Namen und Ziel ein, etwa „10 Siege in Ranked“ oder „3 Spiele ohne Tod“.",
        },
        {
          name: "Design wählen",
          text: "Nimm eine der Farbvorlagen oder stell Farben, Breite und Ecken selbst ein. Die Vorschau zeigt jede Änderung sofort.",
        },
        {
          name: "Link in OBS einfügen",
          text: "Kopiere die Overlay-Adresse und leg in OBS eine Browserquelle in Leinwandgröße an, meist 1920 × 1080. Änderungen erscheinen ohne Neuladen.",
        },
      ],
      faq: [
        {
          q: "Was ist eine Win Challenge?",
          a: "Du legst dir vor dem Stream Ziele fest, zum Beispiel eine Anzahl Siege in einem Spiel oder Modus. Das Overlay zeigt jederzeit, was noch offen ist — solange etwas offen ist, wird weitergespielt.",
        },
        {
          q: "Ist das Overlay kostenlos?",
          a: "Ja, vollständig — ohne Abo und ohne Testphase. Du brauchst nur ein Twitch-Konto, damit deine Liste gespeichert wird.",
        },
        {
          q: "Kann ich Siege aus dem Chat zählen?",
          a: "Ja. Du und deine Mods zählen Siege, ändern den Titel und steuern den Timer per Befehl im Twitch-Chat. Was Mods dürfen, legst du selbst fest.",
        },
        {
          q: "Gibt es einen Timer für Zeit-Challenges?",
          a: "Ja. Der Timer läuft als Countdown oder Stoppuhr direkt im Overlay und lässt sich im Editor oder per Chat starten, anhalten und zurücksetzen.",
        },
        {
          q: "Funktioniert das Overlay mit Streamlabs oder XSplit?",
          a: "Ja. Es ist eine normale Webseite und läuft überall, wo es Browserquellen gibt — OBS Studio, Streamlabs Desktop, XSplit und Twitch Studio.",
        },
        {
          q: "Bleiben meine Challenges gespeichert?",
          a: "Ja. Die Liste hängt an deinem Twitch-Konto und steht beim nächsten Stream samt Fortschritt wieder da.",
        },
      ],
    },
    "twitch-overlays": {
      name: "Twitch-Overlays",
      seoTitle: "Twitch Overlays: Umfragen, Alerts und Ziele",
      description:
        "Kostenlose Twitch-Overlays für OBS: Umfragen, Vorhersagen, Alerts, Ziele, Stream-Statistik, Raid-Clips und Subathon-Timer in einer Browserquelle.",
      keywords:
        "Twitch Overlay kostenlos, Twitch Alerts OBS, Twitch Umfrage Overlay, Twitch Vorhersage Overlay, " +
        "Follower Ziel Overlay, Subathon Timer, Twitch Raid Clip, Stream Statistik Overlay",
      kicker: "Für Streamer",
      h1: "Twitch Overlays für OBS",
      lead:
        "Umfragen und Vorhersagen erscheinen von selbst, Alerts feiern neue Follower und Abos, Ziele und Statistik zählen " +
        "mit. Alle Module laufen über eine einzige Browserquelle und lassen sich frei auf deiner Szene platzieren.",
      teaser: "Umfragen, Alerts, Ziele, Statistik und Subathon-Timer in einer Quelle.",
      features: [
        {
          title: "Umfragen und Vorhersagen",
          text: "Du startest sie wie gewohnt in Twitch, das Overlay blendet sie mit Balken, Stimmen und Restzeit ein und nach dem Ergebnis wieder aus.",
        },
        {
          title: "Alerts",
          text: "Follow, Abo, Verlängerung, Geschenk-Abos, Bits und Raid — mit Ton, auf Wunsch vorgelesen und mit eigenen Texten. Mehrere laufen nacheinander.",
        },
        {
          title: "Follower- und Abo-Ziele",
          text: "Fortschrittsbalken für dein Ziel, direkt aus dem Creator-Dashboard gespiegelt oder mit eigenem Zielwert.",
        },
        {
          title: "Stream-Statistik",
          text: "Follows, Abos, Bits, Zuschauer, Höchststand und Laufzeit seit Sendebeginn — einzeln zuschaltbar.",
        },
        {
          title: "Clip des Raiders",
          text: "Raidet dich jemand, spielt das Overlay einen Clip aus dessen Kanal ab. Mindestzuschauer, Zeitraum und Lautstärke stellst du ein.",
        },
        {
          title: "Subathon-Timer",
          text: "Ein Countdown, den Abos, Geschenk-Abos, Bits und Spenden nach deinen Regeln verlängern — mit Obergrenze, Pause, Verlauf und Chat-Befehl.",
        },
      ],
      steps: [
        {
          name: "Kanal verbinden",
          text: "Melde dich mit Twitch an und verbinde deinen Kanal. Die Seite liest damit Umfragen, Ziele und Ereignisse — gestartet wird weiter in Twitch.",
        },
        {
          name: "Module einschalten und platzieren",
          text: "Schalte die Module ein, die du brauchst, und zieh sie auf der Leinwand an ihren Platz. Größe, Farbe und Deckkraft stellst du je Modul ein.",
        },
        {
          name: "Eine Browserquelle in OBS",
          text: "Kopiere die Overlay-Adresse und leg in OBS eine Browserquelle mit 1920 × 1080 an. Alle aktiven Module laufen über diese eine Quelle.",
        },
      ],
      faq: [
        {
          q: "Sind die Overlays kostenlos?",
          a: "Ja, alle Module auf dieser Seite sind kostenlos und ohne Abo nutzbar. Du brauchst nur ein Twitch-Konto, damit das Overlay die Daten deines Kanals lesen darf.",
        },
        {
          q: "Brauche ich für jedes Modul eine eigene Quelle?",
          a: "Nein. Alle eingeschalteten Module kommen über eine einzige Browserquelle mit 1920 × 1080. Was zu sehen ist, entscheiden die Schalter im Editor.",
        },
        {
          q: "Brauche ich für die Alerts ein weiteres Programm?",
          a: "Nein. Abos, Bits und Raids erkennt die Seite in deinem Chat, Follows kommen über die Follower-Liste von Twitch. Du verbindest nur einmal deinen Kanal.",
        },
        {
          q: "Muss ich Umfragen im Overlay starten?",
          a: "Nein. Umfragen und Vorhersagen startest du wie gewohnt in Twitch, im Creator-Dashboard oder per Chat. Das Overlay merkt es von selbst.",
        },
        {
          q: "Wie funktioniert der Subathon-Timer?",
          a: "Du legst fest, wie viel Zeit ein Abo je Stufe, 100 Bits oder ein Euro Spende bringen. Abos und Bits zählt der Timer von selbst, Spenden trägst du ein oder deine Mods schreiben !subathon spende 10 Name in den Chat.",
        },
        {
          q: "Gibt es die Overlays auch auf Englisch?",
          a: "Ja. Editor und alles, was deine Zuschauer im Stream sehen, gibt es auf Deutsch und Englisch, mit passenden Zahlenformaten.",
        },
      ],
    },
  },
};

const en = {
  ui: {
    back: "Streamer tools",
    setup: "Set it up for free",
    templates: "Browse templates",
    facts: "Free · no download · for OBS, Streamlabs and XSplit",
    previewNote: "Live preview with sample data — this is how it looks on stream.",
    featuresHeading: "What it does",
    stepsHeading: "On stream in three steps",
    faqHeading: "Frequently asked questions",
    moreHeading: "More for your stream",
    allTools: "All streamer tools",
    learnMore: "Learn more",
    home: "Home",
  },
  products: {
    "win-tracker": {
      name: "Win Tracker",
      seoTitle: "Clash Royale Win Tracker Overlay for OBS",
      description:
        "Free OBS overlay for Clash Royale: league, medals or trophies, session record, win rate and your latest games, live from the official API.",
      keywords:
        "Clash Royale overlay, Clash Royale win tracker, Clash Royale OBS overlay, Clash Royale stream overlay, " +
        "medals tracker, trophy tracker, Path of Legend overlay, Clash Royale Twitch overlay",
      kicker: "For Clash Royale streamers",
      h1: "Clash Royale Win Tracker Overlay",
      lead:
        "Show your viewers your league, medals or trophies, the record of the current session and your latest games with " +
        "deck — live from the official Clash Royale API. You play, the tracker counts along by itself.",
      teaser: "League, session record and latest games for Clash Royale streams.",
      features: [
        {
          title: "Live from the official API",
          text: "Shortly after every match the overlay is up to date again: league with step or medals, trophies, wins, losses and win rate. Nothing to enter by hand.",
        },
        {
          title: "Sessions, not calendar days",
          text: "The record counts your session. A new one only starts after four hours without a ranked match — a stream past midnight stays one session.",
        },
        {
          title: "Latest games and deck",
          text: "Your last five results at a glance, plus the deck you're playing right now, your profile and, if you like, your clan.",
        },
        {
          title: "Every mode, events too",
          text: "Ranked, Trophy Road, 2v2 ranked and seasonal league modes, plus challenges, Crown Series and Global Tournaments. The tracker switches to the mode you're playing by itself.",
        },
        {
          title: "Commands for your chat",
          text: "Viewers ask with !rank, !session, !deck and !record themselves — each command can be turned on separately, with a cooldown. Your mods add and switch accounts with !tracker.",
        },
        {
          title: "Your look, your accounts",
          text: "Plain or in Clash Royale style with five ready-made templates, any size you like. Several accounts, and a season recap as an image to share.",
        },
      ],
      steps: [
        {
          name: "Sign in and add your account",
          text: "Sign in with Twitch and enter your player tag, for example #2PP. You can add more accounts at any time.",
        },
        {
          name: "Pick a look",
          text: "Choose what the overlay shows and a look — plain or in Clash Royale style. The preview shows the result right away.",
        },
        {
          name: "Add the link in OBS",
          text: "Copy the overlay link and add it to OBS as a browser source. From your next match on, the tracker counts along.",
        },
      ],
      faq: [
        {
          q: "Is the Win Tracker free?",
          a: "Yes. There's no subscription and no trial. You only need a Twitch account so your accounts and settings can be saved.",
        },
        {
          q: "Where do the numbers come from?",
          a: "From Supercell's official Clash Royale API. The tracker reads your public player profile and your latest matches — it never needs a password or access to your game account.",
        },
        {
          q: "When does a new session start?",
          a: "After four hours without a ranked match. A stream that goes past midnight stays one session, and on your next streaming day the record starts over.",
        },
        {
          q: "Which modes does the tracker show?",
          a: "Ranked with league and medals, Trophy Road, 2v2 ranked, seasonal league modes, challenges like the 20-win challenge, Crown Series and Global Tournaments. When you play another mode, the overlay switches over by itself.",
        },
        {
          q: "Can viewers check my rank in chat?",
          a: "Yes, with !rank, !session, !deck and !record. You turn each command on separately in the editor and set a cooldown; it doesn't apply to your mods.",
        },
        {
          q: "How do I add the overlay to OBS?",
          a: "Copy the overlay link in the editor, create a browser source in OBS and paste it. Set size and format in the editor so the text stays sharp — this works in Streamlabs and XSplit too.",
        },
        {
          q: "Is the overlay available in English?",
          a: "Yes. The editor and the overlay come in German and English; switch the language at the top of the editor.",
        },
      ],
    },
    "win-challenge": {
      name: "Win Challenge",
      seoTitle: "Win Challenge Overlay for Twitch Streams",
      description:
        "See the free win challenge overlay in action: challenges with a win counter, a timer, chat control and six color templates.",
      keywords:
        "win challenge overlay, win challenge Twitch, win challenge OBS, stream challenge overlay, " +
        "challenge list overlay, win counter overlay, free Twitch overlay",
      kicker: "For streamers",
      h1: "Win Challenge Overlay",
      lead:
        "Show your viewers which challenges are still open: count wins, tick off streaks, run a timer — controlled in the " +
        "editor or straight from Twitch chat.",
      teaser: "Challenge list with win counter, timer and chat control.",
      features: [
        {
          title: "Challenges with a win counter",
          text: "As many challenges as you like, each with its own goal. Count wins up, tick off streaks win by win, cross out what's done, pin what matters.",
        },
        {
          title: "Control it from chat",
          text: "Control wins, title and timer with chat commands without leaving your game. Works for several channels at once.",
        },
        {
          title: "Permissions for mods",
          text: "You decide what your mods may do: control the timer, change the title or edit challenges.",
        },
        {
          title: "Built-in timer",
          text: "Countdown or stopwatch for timed challenges, right in the overlay. Starts, pauses and resets with a command.",
        },
        {
          title: "Six color templates",
          text: "From Twitch purple to neon, plus your own colors, font size, width, corners, opacity and animations.",
        },
        {
          title: "German and English",
          text: "Editor, overlay and the chat replies come in German and English. Your list stays saved from stream to stream.",
        },
      ],
      steps: [
        {
          name: "Sign in and add challenges",
          text: "Sign in with Twitch and add your challenges with a name and goal, such as \"10 wins in ranked\" or \"3 games without dying\".",
        },
        {
          name: "Pick a design",
          text: "Use one of the color templates or set colors, width and corners yourself. The preview shows every change instantly.",
        },
        {
          name: "Add the link in OBS",
          text: "Copy the overlay address and create a browser source at canvas size in OBS, usually 1920 × 1080. Changes show up without reloading.",
        },
      ],
      faq: [
        {
          q: "What is a win challenge?",
          a: "Before the stream you set yourself goals, for example a number of wins in a game or mode. The overlay always shows what's still open — as long as something is open, you keep playing.",
        },
        {
          q: "Is the overlay free?",
          a: "Yes, completely — no subscription and no trial. You only need a Twitch account so your list can be saved.",
        },
        {
          q: "Can I count wins from chat?",
          a: "Yes. You and your mods count wins, change the title and control the timer with commands in Twitch chat. You decide what mods are allowed to do.",
        },
        {
          q: "Is there a timer for timed challenges?",
          a: "Yes. The timer runs as a countdown or stopwatch right in the overlay and can be started, paused and reset in the editor or from chat.",
        },
        {
          q: "Does the overlay work with Streamlabs or XSplit?",
          a: "Yes. It's a regular web page and runs anywhere there are browser sources — OBS Studio, Streamlabs Desktop, XSplit and Twitch Studio.",
        },
        {
          q: "Are my challenges saved?",
          a: "Yes. The list belongs to your Twitch account and is back with all progress at your next stream.",
        },
      ],
    },
    "twitch-overlays": {
      name: "Twitch overlays",
      seoTitle: "Twitch Overlays: Polls, Alerts and Goals",
      description:
        "Free Twitch overlays for OBS: polls, predictions, alerts, goals, stream stats, raid clips and a subathon timer in one browser source.",
      keywords:
        "free Twitch overlay, Twitch alerts OBS, Twitch poll overlay, Twitch prediction overlay, " +
        "follower goal overlay, subathon timer, Twitch raid clip, stream stats overlay",
      kicker: "For streamers",
      h1: "Twitch Overlays for OBS",
      lead:
        "Polls and predictions appear by themselves, alerts celebrate new followers and subs, goals and stats count along. " +
        "Every module runs through a single browser source and can be placed anywhere on your scene.",
      teaser: "Polls, alerts, goals, stats and a subathon timer in one source.",
      features: [
        {
          title: "Polls and predictions",
          text: "Start them in Twitch as usual — the overlay shows them with bars, votes and time left, then hides them after the result.",
        },
        {
          title: "Alerts",
          text: "Follow, sub, resub, gift subs, bits and raid — with sound, read out if you like and with your own texts. Several play one after another.",
        },
        {
          title: "Follower and sub goals",
          text: "A progress bar for your goal, mirrored from the Creator Dashboard or with your own target.",
        },
        {
          title: "Stream stats",
          text: "Follows, subs, bits, viewers, peak and uptime since you went live — each one can be turned on separately.",
        },
        {
          title: "Raider's clip",
          text: "When someone raids you, the overlay plays a clip from their channel. You set minimum viewers, time range and volume.",
        },
        {
          title: "Subathon timer",
          text: "A countdown that subs, gift subs, bits and donations extend by your rules — with a cap, pause, history and a chat command.",
        },
      ],
      steps: [
        {
          name: "Connect your channel",
          text: "Sign in with Twitch and connect your channel so the page can read polls, goals and events — you still start everything in Twitch.",
        },
        {
          name: "Turn on and place modules",
          text: "Turn on the modules you need and drag them into place on the canvas. Set size, color and opacity per module.",
        },
        {
          name: "One browser source in OBS",
          text: "Copy the overlay address and create a 1920 × 1080 browser source in OBS. All active modules run through this one source.",
        },
      ],
      faq: [
        {
          q: "Are the overlays free?",
          a: "Yes, every module on this page is free to use without a subscription. You only need a Twitch account so the overlay may read your channel data.",
        },
        {
          q: "Do I need a separate source for each module?",
          a: "No. All active modules come through a single 1920 × 1080 browser source. The switches in the editor decide what's visible.",
        },
        {
          q: "Do I need another program for the alerts?",
          a: "No. The page picks up subs, bits and raids in your chat, and follows come from Twitch's follower list. You only connect your channel once.",
        },
        {
          q: "Do I have to start polls in the overlay?",
          a: "No. Start polls and predictions as usual in Twitch, in the Creator Dashboard or from chat. The overlay notices by itself.",
        },
        {
          q: "How does the subathon timer work?",
          a: "You decide how much time a sub per tier, 100 bits or one euro donated adds. Subs and bits count by themselves; you enter donations, or your mods type !subathon tip 10 Name in chat.",
        },
        {
          q: "Are the overlays available in English?",
          a: "Yes. The editor and everything your viewers see on stream come in German and English, with matching number formats.",
        },
      ],
    },
  },
};

export const PRODUCT_TEXTS = defineMessages({ de, en });

/** Adresse eines Werkzeugs bzw. einer Produktseite in der gewählten Sprache (englisch mit ?lang=en). */
export const withLang = (path, lang) => (lang === "en" ? `${path}${path.includes("?") ? "&" : "?"}lang=en` : path);

const DOMAIN = "https://vnmvalentin.de";

/**
 * Strukturierte Daten einer Produktseite: Anwendung, Brotkrumen und Fragen — aus denselben Texten wie die Seite.
 * @param {string} id    eine der PRODUCT_IDS
 * @param {string} lang  'de' | 'en'
 */
export function buildProductJsonLd(id, lang) {
  const t = PRODUCT_TEXTS.dict(lang);
  const p = t.products[id];
  const url = DOMAIN + withLang(productPath(id), lang);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: p.h1,
      url,
      description: p.description,
      inLanguage: lang,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web browser",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      featureList: p.features.map((f) => f.title),
      screenshot: DOMAIN + PRODUCT_META[id].image,
      author: { "@type": "Person", name: "vnmvalentin", url: DOMAIN },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t.ui.home, item: DOMAIN },
        { "@type": "ListItem", position: 2, name: t.ui.back, item: `${DOMAIN}/tools` },
        { "@type": "ListItem", position: 3, name: p.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: p.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
