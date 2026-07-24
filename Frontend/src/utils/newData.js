export const NEWS_UPDATES = [
  {
    date: "24.07.2026",
    version: "v6.1: Connect 4, Clash-Royale-Übersetzung komplett & Discord-Rechtliches",
    sections: [
      {
        title: "Neu: Connect 4",
        items: [
          "Neues Minispiel: Vier Gewinnt gegen einen Freund — Lobby-Link teilen und direkt loslegen, kein Account nötig",
          "Zuschauer können einer laufenden Partie beitreten und live mitschauen",
          "Kurze Gnadenfrist bei Verbindungsabbruch (2 Minuten) — die Partie ist nicht sofort verloren",
        ]
      },
      {
        title: "Clash Royale — Englisch-Übersetzung abgeschlossen",
        items: [
          "Alle Spielmodi (Snake Royale, Elixir Auction, Bingo Royale, Blindes Karussel, Elixir Rush) sind jetzt komplett über den EN/DE-Button umschaltbar — vorher galt das nur für Lobby und Streamer Setup",
        ]
      },
      {
        title: "Clash Royale — Zuschauer-Verbesserungen",
        items: [
          "Bingo Royale: Zuschauer können jetzt zwischen den Spielern wechseln und deren Bingo-Board live mitverfolgen, statt nur die Mini-Decks in der Seitenleiste zu sehen",
          "Blindes Karussel: aufgedeckte Karten sind für Zuschauer jetzt sofort sichtbar, statt erst nach dem Rundenwechsel",
        ]
      },
      {
        title: "Clash Royale — Neu: „Benutzt von“-Anzeige",
        items: [
          "Zeigt auf der Clash-Royale-Seite Streamer, die die Minigames in ihren Streams nutzen, inklusive Live-Status direkt von Twitch",
        ]
      },
      {
        title: "Clash Royale — Neuer Modus in Vorbereitung",
        items: [
          "Karten-Evolution befindet sich aktuell in internen Tests: Start mit Wildcards, die per Evolutions-Tokens aus einem gemeinsamen Kartenpool auf- oder abgewertet werden — folgt nach Abschluss der Tests",
        ]
      },
      {
        title: "Discord-Bot",
        items: [
          "Neuer Command: /größe — verrät eine zufällige Körpergröße",
          "Nutzungsbedingungen und Datenschutzerklärung für den Bot jetzt als eigene Seiten abrufbar",
        ]
      },
    ]
  },
  {
    date: "21.07.2026",
    version: "v6.0: Komplettes Redesign, PvPvE Arena & Profil-Seite",
    sections: [
      {
        title: "Neues Design",
        items: [
          "Die komplette Seite hat ein neues, einheitliches Design bekommen: animierter Aurora-Hintergrund statt einfarbiger Fläche, neue Schriftarten (Space Grotesk & Inter)",
          "Navigation komplett neu strukturiert: statt einer langen Liste gibt es jetzt 5 Kategorien (Fun, Community, Clash Royale, Streamer-Tools, Contact) mit eigener Übersichtsseite pro Kategorie",
          "Alle Menüs, Buttons und Karten wurden auf den neuen, ruhigeren Stil umgestellt — weniger Neon, klarere Hierarchie",
        ]
      },
      {
        title: "Neu: Profil-Seite",
        items: [
          "Zentrale Profil-Seite statt verstreuter Einstellungen: eigenes Twitch-Profilbild, verbundene Accounts auf einen Blick",
          "Discord-Account jetzt direkt im Profil verknüpfbar/trennbar (inkl. Anzeige von Discord-Name & Avatar)",
          "Promo-Codes werden jetzt im Profil eingelöst, Account-Wechsel und Logout ebenfalls von dort aus",
        ]
      },
      {
        title: "adVentures",
        items: [
          "Neuer Modus: PvPvE Arena (Beta) — Multiplayer-Karte, auf der alle gemeinsam Monster für Level farmen und sich gegenseitig angreifen können. Eigene Rangliste, Killfeed und Live-Ranking",
          "Elite-Gegner ab Stage 12: seltene, deutlich stärkere Monster mit goldenem Ring, die dafür dreifaches Gold droppen",
          "2 neue Meilensteine nach jedem Boss: Schnellfeuer (+30% Feuerrate) und Fortuna (+1 Glück)",
          "Neues Powerup: Blitzschlag — Flächenschaden am Cursor mit kurzer Warnung",
          "Balancing überarbeitet: flachere Schwierigkeitskurve bei Gegner-HP/Schaden, faireres Rage-Mode (offene Tür), Gift/Brand skalieren jetzt mit der Stage, Glück gibt planbar +50% Gold statt Multiplikator",
          "Bugfixes: Spinnennetz-Effekt im Nahkampf funktionierte nicht, Schutzschild-Cooldown war fälschlich nur 6 statt 45 Sekunden, Shop-Preise resetteten sich nach einem Reload auf den Basispreis",
          "Händler, Meilenstein-Auswahl, Spielstand- und Game-Over-Bildschirm im neuen Design",
          "Performance: UI-Aktualisierung im Kampf von bis zu 165x/Sekunde auf 10x/Sekunde gedrosselt (spürbar flüssiger auf schwächeren Geräten)",
        ]
      },
      {
        title: "Virtual Farm",
        items: [
          "Mehrere Pflanzen, bei denen die Wartezeit nie ins Gold-Verhältnis passte, wurden neu bepreist (u.a. Spinat, Kohl, Blaubeere, Zucchini, Dattel, Kokosnuss)",
          "Eier-Shop: seltene Eier (Rare/Epic/Legendary) tauchen jetzt deutlich häufiger im Rotations-Shop auf",
          "Brutzeit im Inkubator richtet sich jetzt nach der Seltenheit des Eis (2 Min bis 2 Std, vorher pauschal 5 Min für alle)",
          "Wetter-Effekte auf Pflanzen (Nass/Gefroren/Aufgeladen/Mondlicht) geben jetzt einen echten Verkaufsbonus statt nur Optik",
        ]
      },
      {
        title: "Clash Royale — Neu: Win Tracker Overlay",
        items: [
          "Neue Seite unter Clash Royale: eigenes OBS-Overlay mit Liga-Emblem, globaler Platzierung, Trophäen bzw. Season-Medaillen (Path of Legend) — umschaltbar zwischen beiden",
          "Mehrere Accounts verknüpfbar wie beim Nuzlocke — der aktive Account speist automatisch das Overlay",
          "Tagesstatistik seit 00:00 Uhr: Profit, Win/Loss-Zahlen und Win-Rate in Prozent, jeweils einzeln ein-/ausblendbar",
          "Letzte 5 Spiele als farbige Verlaufsanzeige (grün/rot) mit gewonnenen bzw. verlorenen Medaillen pro Match, neuestes zuerst — ebenfalls ausblendbar",
          "Hintergrundfarbe und Transparenz der Overlay-Karte frei einstellbar",
          "Läuft direkt über die offizielle Clash-Royale-API",
        ]
      },
      {
        title: "Entfernt",
        items: [
          "Casino komplett entfernt",
          "Awards-2026-Seiten (Einreichung & Admin) entfernt",
        ]
      },
      {
        title: "Sicherheit & Performance",
        items: [
          "Sicherheitslücke bei der Discord-Verknüpfung geschlossen (Open-Redirect über den Rücksprung-Parameter)",
          "Mehr Seiten werden jetzt vorgerendert (die neuen Kategorie-Seiten) für schnellere erste Ladezeit",
        ]
      },
    ]
  },
  {
    date: "21.07.2026",
    version: "v5.4: Win-Challenge Neuerungen, Clash Royale Streamer Setup & Teilübersetzung",
    sections: [
      {
        title: "Win-Challenge — Neue Chat-Commands",
        items: [
          "!settimer 01:30:00 — Timer direkt auf eine Zeit setzen (HH:MM:SS oder MM:SS)",
          "!pin [Name] / !unpin [Name] — Challenge anpinnen bzw. wieder lösen, mit unscharfer Namenssuche (auch bei Tippfehlern)",
          "!+ [Name] / !- [Name] — Zähler hoch- bzw. runterzählen, ohne Zähler schließt bzw. öffnet es die Challenge",
          "!hidetimer / !showtimer sowie !resettimer für den Timer direkt aus dem Chat",
        ]
      },
      {
        title: "Win-Challenge — Editor & Moderator-Ansicht",
        items: [
          "Moderator-Ansicht komplett überarbeitet: manuelle Zeiteingabe, +10m/-10m-Buttons, klarer Sichtbarkeits-Toggle für den Timer",
          "Eingebaute Befehlsreferenz sowohl im Editor als auch in der Moderator-Ansicht — dort automatisch gefiltert nach den freigeschalteten Rechten",
          "Bis zu 10 Twitch-Kanäle pro Overlay verwaltbar, statt nur einem einzelnen Kanal",
          "Live-Vorschau im Editor skaliert jetzt korrekt mit der verfügbaren Breite",
          "Speicherung robuster: gleichzeitige Änderungen von Mods überschreiben deine laufende Bearbeitung nicht mehr",
        ]
      },
      {
        title: "Clash Royale — Streamer Setup",
        items: [
          "Neues Setup-Panel für Streamer: Verbindung zu OBS direkt aus dem Browser per WebSocket",
          "Automatisch Szene wechseln oder eine Quelle ein-/ausblenden, sobald ein Minigame startet oder ein Draft abgeschlossen ist",
          "Globales Deck-Overlay als Browserquelle für OBS — zeigt nach jedem abgeschlossenen Draft automatisch die finalen Decks, egal in welcher Lobby",
          "Findet beim Einrichten jetzt auch Quellen innerhalb von Ordnern/Gruppen in OBS korrekt",
        ]
      },
      {
        title: "Englisch-Übersetzung (Teil 1)",
        items: [
          "Clash Royale Minigames: Lobby (Warteraum, Modus- und Kartenpool-Einstellungen) sowie das Streamer Setup sind jetzt über den EN/DE-Button umschaltbar",
          "Die eigentlichen Spielbildschirme der Modi folgen in einem späteren Update",
        ]
      },
      {
        title: "Discord-Bot",
        items: [
          "/aussehen, /iq, /pp und /ship haben kein Tageslimit mehr — beliebig oft neu würfeln statt nur einmal pro Tag",
          "Twitch-Benachrichtigung: Rollen lassen sich jetzt per @-Autovervollständigung in die Nachricht einfügen, statt die Rollen-ID von Hand einzutippen",
        ]
      },
    ]
  },
  {
    date: "19.07.2026",
    version: "v5.3: Bingo Royale Rework, Lobby-Fixes & Voice-Commands",
    sections: [
      {
        title: "Clash Royale — Neuer Modus: Elixir Rush",
        items: [
          "Echtzeit-Draft: Dein Elixierbalken füllt sich automatisch wie in Clash Royale — schön pink und gut sichtbar",
          "Auf dem Marktplatz erscheinen Karten mit ihren echten Elixierkosten — wer zuerst klickt (und genug Elixier hat), bekommt die Karte",
          "Nicht gekaufte Karten laufen ab und werden ausgetauscht (mit Flip-Animation über die verdeckte Karte)",
          "Klares Feedback beim Klicken: Du siehst sofort, ob DU die Karte bekommen hast oder jemand schneller war",
          "Anti-AFK: Wer 10 Sekunden mit vollem Balken nichts kauft, bekommt automatisch eine zufällige Karte",
          "Keine doppelten Karten — abgelaufene Karten können mit Abstand wieder auftauchen",
          "Einstellbar: Anzahl der Marktplatz-Karten, wie lange Karten liegen bleiben und ob das Elixier der Mitspieler sichtbar ist",
          "8 Käufe = fertiges Deck — das Spiel endet, wenn alle Decks voll sind",
        ]
      },
      {
        title: "Clash Royale — Bingo Royale",
        items: [
          "Bingo-Karte komplett überarbeitet: größere Felder und Schrift, Board hebt sich jetzt klar vom Hintergrund ab",
          "Deutliche Warnung, wenn eine Karte auf kein freies Feld passt — Blockieren muss jetzt per Doppelklick bestätigt werden (kein versehentliches Blockieren mehr)",
          "Neues Zug-Banner: Es ist jetzt groß sichtbar, wer gerade dran ist (mit Avatar), statt klein oben links",
          "Token-Shop: Jeder Spieler bekommt 2 zufällige der 3 Power-Ups zugelost",
          "Token-Shop: Einstellbares Zeitlimit pro Token — wer nicht rechtzeitig wählt, verliert den Token",
          "Tokens zählen in der Seitenleiste live mit und ihr seht in Echtzeit, welches Power-Up ein anderer Spieler gerade auswählt — statt Wartebildschirm und nur der Auflösung",
          "Spielerreihenfolge wird jetzt für jedes Rundenpaar neu zufällig gemischt — niemand ist mehr in jeder Runde Spieler 1",
          "E-Giant zählt beim Bingo-Attribut Geschlecht jetzt als männlich",
        ]
      },
      {
        title: "Clash Royale — Blindes Karussel",
        items: [
          "Tische als abgehobene Panels mit eigener Kopfzeile neu gestaltet",
          "Status-Banner zeigt klar, was gerade zu tun ist — und wer schon gewählt hat, ist die ganze Runde über sichtbar",
          "Größere Schrift und Buttons für bessere Lesbarkeit",
        ]
      },
      {
        title: "Clash Royale — Lobby-System",
        items: [
          "Aktives Verlassen wirkt jetzt sofort — auch mitten im Spiel bleibt niemand mehr minutenlang in der Lobby hängen",
          "Ein neuer Einladungslink ersetzt die gespeicherte Sitzung — kein ungewolltes Zurück-Joinen in die alte Lobby mehr",
          "Doppelte Spieler unmöglich: Ein zweiter Tab mit gleichem Namen übernimmt die Sitzung, statt einen Duplikat-Spieler zu erzeugen",
          "Abgelaufene Sitzungen werden still aufgeräumt — kein „Lobby nicht gefunden“ mehr beim Öffnen der Seite",
          "F5 mitten im Spiel übernimmt jetzt auch Gebote, Bingo-Tokens und Karten-Zuordnungen korrekt",
        ]
      },
      {
        title: "Discord-Bot",
        items: [
          "Neue Voice-Commands: /voice_hide, /voice_unhide und /voice_transfer (Besitzer-Status übergeben)",
          "Die angepinnte Commands-Nachricht zeigt jetzt unten den aktuellen Voice Channel Besitzer und aktualisiert sich bei jedem Besitzerwechsel",
          "Rollen-Buttons: Auswahl zwischen Mehrfach-Auswahl und Single-Choice (nur 1 Rolle — alte Rolle wird beim Klick automatisch ausgetauscht) jetzt klar erklärt im Dashboard",
        ]
      },
    ]
  },
  {
    date: "14.07.2026",
    version: "v5.2: Blindes Karussel & Discord Rollen-Tags",
    sections: [
      {
        title: "Discord-Bot",
        items: [
          "Twitch-Benachrichtigung unterstützt jetzt auch das Taggen serverspezifischer Rollen",
        ]
      },
      {
        title: "Clash Royale",
        items: [
          "Neuer Spielmodus: Blindes Karussel",
          "Neues Lobby-System für die Minigames — Modusauswahl jetzt direkt in den Lobby-Einstellungen statt neuer Lobbys pro Modus",
          "Nuzlocke Seite auf eine eigene Seite gebracht mit Account Verknüpfung, integriertem Glücksrad und Leaderboard",
        ]
      },
    ]
  },
  {
    date: "07.07.2026",
    version: "v5.1: Casino Daily Bonus, Clash Royale Menü & Aufräumarbeiten",
    sections: [
      {
        title: "Allgemein",
        items: [
          "Pack-Opening komplett entfernt (Shop, Sammlung, Ausrüstung, Schmiede, Achievements, Vorschläge)",
          "Hub entfernt (Münzen-Rangliste, Spielerprofile, Quick-Links)",
          "Die Clash Royale Kategorie im Menü mit dem Punkt: Minigames wurde hinzugefügt."
        ]
      },
      {
        title: "Casino",
        items: [
          "Daily Bonus jetzt direkt im Casino abholbar statt im (entfernten) Hub",
          "Mystery Case: Center-Marker-Pfeile jetzt korrekt mit der Linie zentriert",
        ]
      },
      {
        title: "Virtual Farm & Win-Challenge",
        items: [
          "Seltene Abstürze durch übrig gebliebene sql.js-Reste behoben — beide laufen jetzt vollständig auf better-sqlite3",
        ]
      },
      {
        title: "YTM Songrequest Bot",
        items: [
          "Das Vorschaubild wurde aktualisiert um dem neuen Design der App zu entsprechen.",
        ]
      },
    ]
  },
  {
    date: "22.05.2026",
    version: "v5.0: Discord-Bot Update und mehr",
    sections: [
      {
        title: "Discord-Bot",
        items: [
          "Discord-Bot wieder da mit Dashboard-Integration",
          "Funktionen: Willkommens-Nachricht, Verabschiedungs-Nachricht, Reaktionsrollen, Fun-Commands, Custom Voice Channel, Twitch Benachrichtigung, Tavern-Channel, Auto Roles, Statistiken, Image Only und mehr"
        ]
      },
      {
        title: "Virtual Farm",
        items: [
          "Kleine Bug-Fixes und Datenbank Wechsel von sql.js zu better-sqlite3",
          "Subscriber-Bonus jetzt aktiv und funktionsfähig (endlich)",
        ]
      },
      {
        title: "Allgemein",
        items: [
          "Handy Nutzerfreundlichkeit erhöht",
          "Viewer Sea zu Viewer Sky geändert -> Overlay jetzt oben am Bildschirm mit Vögel statt Fischen",
          "YTM Bot hat jetzt die Funktionen und einen Screenshot aufgelistet",

        ]
      },
      {
        title: "Win Challenge Overlay",
        items: [
          "Wechsel der Datenbank von sql.js zu better-sqlite3 mit mehreren Backups",
          "14 Tage Inaktivität sorgt für den Reset vom Overlay damit Speicherplatz geschont wird (hohe Nachfrage vom Overlay)",
          "Dashboard nutzt jetzt kompletten Platz"

        ]
      },
    ]
  },
  {
    date: "09.05.2026",
    version: "v4.1: Big Virtual Farm Update",
    sections: [
      {
        title: "Virtual Farm",
        items: [
          "Checked den Ingame Changelog oder den Discord für die Änderungen",
        ]
      },
    ]
  },
  {
    date: "28.04.2026",
    version: "v4.0: New Game - Virtual Farm",
    sections: [
      {
        title: "Allgemein",
        items: [
          "Neues Spiel: Virtual Farm (Testphase)",
          "Entfernung von einigen Subseiten und Seasons",
        ]
      },
      {
        title: "Win-Challenge",
        items: [
          "Neuer Twitch-Chatbot zum bearbeiten von Timer per Commands (neue Befehle in Zukunft)",
          "Umzug von .json zu Datenbank"
        ]
      },
      {
        title: "YTM Songrequest",
        items: [
          "Neue eigene App von Github in der Seite hinterlegt (weg von Streamer.bot)"
        ]
      },
    ]
  },
  {
    date: "14.03.2026",
    version: "v3.2: Seasons",
    sections: [
      {
        title: "Allgemein",
        items: [
          "Neues Season-System im Hub bei der Fun Kategorie mit Leaderboard und Dailys"
        ]
      },
      {
        title: "Packs",
        items: [
          "50 neue Karten",
          "Verbesserung bei Schmiede",
          "10 Packs als Option zum Kaufen hinzugefügt"
        ]
      },
      {
        title: "Casino",
        items: [
          "Odds angepasst -> Ab jetzt wirklich ein Casino (keine Gelddruckmaschine)",
          "Geld wird in den meisten Fällen verloren... spielen auf eigene Gefahr"
        ]
      },
      {
        title: "Win-Challenge",
        items: [
          "Neues Overlay mit einem kompletten Fenster für mehr Übersicht"
        ]
      },
      {
        title: "Viewer-Sea",
        items: [
          "Neuer Fisch"
        ]
      }
    ]
  },
  {
    date: "27.02.2026",
    version: "v3.1: Hotfix",
    sections: [
      {
        title: "Allgemein",
        items: [
          "Broadcast Popup für Meldungen implementiert",
          "Promo-Code: catsandgambling"
        ]
      },
      {
        title: "Packs",
        items: [
          "Ausrüstungsseite verbessert beim Hinzufügen von Karten",
          "Ein Achievement gefixt was nicht einlösbar war"
        ]
      },
      {
        title: "Casino",
        items: [
          "Slots Multiplikator angepasst nachdem ein Fehler im Backend zu falschen Berechnungen geführt hat"
        ]
      },
    ]
  },
  {
    date: "27.02.2026",
    version: "v3: Großer Schritt in die richtige Richtung",
    sections: [
      {
        title: "Allgemein",
        items: [
          "UI wieder vereinfach aber dafür User-freundlicher",
          "Navigations-Menü hat direkt alle Punkte wieder (kein mehrfaches Klicken um auf Seiten zu kommen)",
          "Schlichteres, kompakteres Design statt zu moderne und unübersichtliche Overlays",
          "Daily jetzt überall abholbar in dem Layout und einen Streak-Bonus als Belohnung für Aktivität (Capped bei 1500)",
          "Channel Point Belohnung auf Twitch gibt jetzt 1500 statt 500 Coins",
          "Mute-Button für Sounds im Header"
        ]
      },
      {
        title: "Packs",
        items: [
          "All in One: Am Beispiel vom Casino jetzt alles in einem Menü erreichbar",
          "Neues Pack: Cartoon-Katzen",
          "Günstigerer Preis von 500 auf 250",
          "Reduzierte Anzahl an Karten pro Pack von 4 auf 3",
          "Compensation der letzten Karten gegeben",
          "Neuer Tab: Ausrüstung - Passives Einkommen mit Karten und Set-Boni",
          "Neuer Tab: Schmiede - Werte Karten mit doppelten auf um Sie besseres Einkommen generieren zu lassen",
          "Bank nach 5 Tagen voll - regelmäßig entleeren"
        ]
      },
      {
        title: "Casino",
        items: [
          "Alles unter einer Haube: Vereinfachung der Navigation indem man von Game zu Game springen kann",
          "Slots wurden verbessert (mehr Joker und höhere Multiplikator für Standard und Ketten)",
          "Sounds wurden hinzugefügt für: Slots, Roulette, Mines, Blackjack, Dice",
          "In Mines kann man über Neues Spiel direkt mit den selben Einstellungen wieder reinstarten ohne Mines und Cash noch mal anzupassen (dafür ist der neue Menü-Button)",
        ]
      },
      {
        title: "Viewer Sea",
        items: [
          "Begrenzt auf meine Community statt als globales Tool",
          "Bessere Integration mit Website und Besonderheit für meinen Stream",
          "Neue Farben die per Pack-Achievements erhältlich sind"
        ]
      },
    ]
  },
  {
    date: "09.02.2026",
    version: "v2.3: Quality Of Life",
    sections: [
      {
        title: "Allgemein",
        items: [
          "Parameter für Socials, Setup in Home -> man kann die beiden Fenster direkt per URL aufrufen",
          "Parameter für Casino Games (Das gleiche)",
          "Direkte Aktualisierung bei Überweisung von Credits beim Empfänger",
        ]
      },
      {
        title: "Viewer Sea",
        items: [
          "Neue Slider für Dekorationsgröße und Fischgröße",
          "Border verbessert damit Fische nicht mehr drüberschwimmen",
          "Exklusive Fisch-Skins für einzelne Streamer jetzt möglich",
        ]
      },
      {
        title: "Casino",
        items: [
          "Neuer Button in Roulette um letzten Einsatz zu wiederholen"
        ]
      },
    ]
  },
  {
    date: "07.02.2026",
    version: "v2.2: Neuer Perk Shop",
    sections: [
      {
        title: "Perk Shop",
        items: [
          "Kaufe Perks mit Casino Coins für den Stream",
          "Erreichbar unter dem Community-Tab oder vnmvalentin.de/shop",
          "Inventar zeigt an welche Perks man hat und einlösen per Commands"
        ]
      },
      {
        title: "Allgemein",
        items: [
          "Kleine UI Changes für aktive Abstimmungen und Giveaways"
        ]
      },
    ]
  },
  {
    date: "31.01.2026",
    version: "v2.1: Neues Stream Tool",
    sections: [
      {
        title: "Viewer Sea",
        items: [
          "Neues Overlay für den Stream!",
          "Streamer.bot wird benötigt",
          "Aufgebaut wie StreamAvatars, aber kostenlos!",
          "Fische schwimmen entweder oben am Rand oder unten in einem See",
          "Wähle deinen Fisch aus für die Streamer die dieses Overlay nutzen und nutze Commands",
          "Customizable Background und Rollen-Verwaltung für die Auswahl der Fische",
          "Events wie Raids oder HypeTrains triggern Special Effects",
          "Steigere deine Zuschauerinteraktivität und lasse Sie als süße Fische im Stream schwimmen"
        ]
      },
    ]
  },
  {
    date: "26.01.2026",
    version: "v2: Großes UI Update",
    sections: [
      {
        title: "Layout",
        items: [
          "Neuer Hintergrund, neues Menü, neue modernere UI überall!",
        ]
      },
      {
        title: "Allgemeine Änderungen",
        items: [
          "Clipqueue-Seite entfernt aus Streamer-Tools",
          "Knowledge-Base Seite entfernt aus About (Tutorial oder ähnliches kommen jetzt direkt in passende Kategorie)",
          "Youtube Music Songrequest für Twitch Tutorial hinzugefügt und unter Streamer-Tools erreichbar",
          "Youtube Music Einrichtung für Stream Deck hinzugefügt und unter Streamer-Tools erreichbar",
          "Feedback-Feld in Contact hinterlegt für direkten Kontakt der automatisch in den Discord geschickt wird"
        ]
      }
    ]
  },
  {
    date: "24.01.2026",
    version: "v1.1.1",
    sections: [
      {
        title: "Kleine Überarbeitung des Win-Challenge Overlays",
        items: [
          "Zurückgesetzt bei älteren WinChallenges",
          "Timer ist jetzt nur noch im Footer (nicht mehr im Header + Footer)",
          "Speicherung der Daten jetzt mit Nutzernamen",
          "Challenge Seite ist jetzt die initial Seite und übersichtlichere Anpassung bei der Customization",
          "Overlay-Kopier-Button jetzt immer oben"
        ]
      },
      {
        title: "Slot-Machine Änderung",
        items: [
          "Paytable hinzugefügt",
          "Multiplier angepasst"
        ]
      }
    ]
  },
  {
    date: "24.01.2026",
    version: "v1.1",
    sections: [
      {
        title: "Slot-Machine Änderung",
        items: [
          "Keine Früchte mehr sondern Waifus als Früchte",
          "Statt 3 Rollen mit 5 Gewinn-Lines sind es jetzt 5 Rollen mit 11 Gewinn-Lines",
          "Freispiele verfügbar bei 3 Star-Waifus mit Sticky Joker"
        ]
      },
      {
        title: "Admin-Dashboard und Promo-Codes",
        items: [
          "Ab sofort gibt es für eine einfachere Adminstration ein Admin-Dashboard für mich um nicht immer ins Backend zu müssen",
          "Ich habe Promo-Codes eingerichtet die ihr oben rechts unter eurem Profil einlösen könnt",
          "Erster Promo-Code für Free 1000 Coins um im neuen Waifu-Slot alles zu vergambeln: ilikedicks"
        ]
      }
    ]
  },
  {
    date: "19.01.2026",
    version: "v1.0",
    sections: [
      {
        title: "adVentures Balancing/ Anpassung",
        items: [
          "Magnet-Upgrade abgeschwächt (Scaling reduziert)",
          "Slime Boss: Acid Puddles reichen nun bis zum Rand",
          "Drachen Boss: Elektro-Bälle sind nun schneller",
          "Performance verbessert: 87% an Datengröße gekürzt",
          "Cooldown der PowerUps erhöht"
        ]
      },
      {
        title: "System",
        items: [
          "Layout Optimierungen",
          "neuer News-Tab"
        ]
      }
    ]
  }
];