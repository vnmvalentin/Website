export const NEWS_UPDATES = [
  {
    date: "14.09.2026",
    version: "v6.5: Sechs neue Daily Games, Clash-Royale-Win-Tracker im 2v2-Modus & Virtual Farm mit neuer Oberfläche",
    sections: [
      {
        title: "Neu: Daily Games",
        items: [
          "Neuer Spielhub unter /daily mit sechs täglichen Rate-Minispielen: Tempdle (Temperaturen), Velocidle (Geschwindigkeiten), Duratidle (Zeitspannen), Inventiondle (Erfindungsjahre), Pricedle (Einführungspreise von Technik-Produkten) und Balancdle (Gewichte). Ein siebtes, CR Color Match für Clash-Royale-Kartenfarben, ist in der Kachel-Übersicht schon sichtbar und folgt, sobald die Kalibrierung für alle Karten fertig ist",
          "Jede Runde: den echten Wert über einen Regler schätzen, Punkte nach Nähe zum tatsächlichen Wert (bis 100 pro Runde), mehrere Runden pro Spiel und Tag",
          "Für jedes Spiel einzeln als Favorit markierbar, die Kachel zeigt direkt, ob heute schon gespielt wurde und mit welchem Ergebnis",
          "Rundenverlauf einsehbar, Ergebnis teilbar — kein Account nötig, für alle nutzbar",
        ]
      },
      {
        title: "Clash Royale — Win Tracker: 2v2-Modus & Twitch-Commands",
        items: [
          "Der Win Tracker kennt jetzt einen dritten trackbaren Wert: 2v2 Ranked, neben den bisherigen Ranked-Medaillen und der Trophäenstraße — mit eigenem zuletzt gespieltem Deck, getrennt von 1v1",
          "Neue Twitch-Chat-Befehle für Mods und den Broadcaster: „!tracker set #TAG“ schaltet den aktiven Account um, „!tracker mode <ranked|trophy|2v2>“ wechselt den getrackten Wert, „!tracker add #TAG“ verknüpft einen neuen Account und „!tracker list“ zeigt alle verknüpften Accounts mit Spielername. Der bisherige Kurzbefehl „!tracker #TAG“ bleibt als Alias erhalten",
          "Antworten im Chat erscheinen auf Deutsch oder Englisch, je nachdem, welche Sprache im Overlay eingestellt ist",
        ]
      },
      {
        title: "Virtual Farm — Komplett neue Oberfläche",
        items: [
          "Das ganze HUD ist neu gezeichnet: aus flachen, dunklen Flächen wurden Fenster im Holzschild-Look — Farbverlauf für Volumen, dicke dunkle Kontur, große Radien. Knöpfe bekommen einen sichtbaren „Stufen-Schatten“, der beim Klicken einsackt, statt nur die Farbe zu wechseln",
          "Jedes Fenster (Shop, Inventar, Fähigkeitsbaum, Logbuch, Briefkasten, Missionsbrett, …) läuft jetzt über einen gemeinsamen Rahmen mit demselben Kopf- und Schließ-Verhalten, statt dass sich jedes Fenster seinen eigenen Header und Radius gebaut hat. Dazu ein „Zurück“-Knopf für Fenster, die aus einem anderen Fenster heraus geöffnet wurden (z. B. Profil → Umkleide, Schuppen → Kiste)",
          "Eigenes, handgezeichnetes Icon-Set ersetzt lucide-Icons und Emojis in großen Teilen des HUDs",
          "Das Dropdown-Menü ist weg: ein einziges Profil-Widget oben rechts zeigt Charakterbild, Name, Gold sowie Level mit XP-Balken auf einen Blick. Ein Klick öffnet direkt Umkleide oder Fähigkeitsbaum, statt durch eine lange Liste zu blättern — offene Fähigkeitspunkte zeigen sich jetzt als pulsierende Zahl direkt am Profilbild",
          "Mitspieler-Liste und Chat neu gestaltet, Reiter in Shops und Fenstern laufen jetzt über einen Unterstrich statt runder „Pillen“-Buttons, der Inkubator ist in den Schuppen gewandert statt ein eigenes Klapp-Menü zu sein",
        ]
      },
      {
        title: "Virtual Farm — Neuer Inhalt",
        items: [
          "Der Charakter ist jetzt durchgängig eine Katze: zwölf echte Farb- und Musterungs-Varianten statt der bisherigen eingefärbten Standard-Figur, alle von Level 1 an frei wählbar",
          "Zehn neue, über das Level freischaltbare Kostüme (vom Entdecker bis zum Astronauten) ersetzen die alten Fantasy-Geister und die alten levelfreien Outfits",
          "Neuer Gold-Shop: rein kosmetische Reskins für Schuppen, Briefkasten und Namensschild — teuer, weil sie nichts als den Look ändern. Jede Kategorie hat einen kostenlosen Weg zurück zum Standard-Look",
          "Neues Missionsbrett: tägliche und wöchentliche Aufgaben (Ernten, Verkaufen, Gießen, Samen kaufen) gegen Gold und Erfahrung",
          "Drei neue Tiere: Waschbär, Ziege und Tiger",
          "Neuer, größerer Ladebildschirm beim Weltbeitritt",
          "Gegen das Lategame-Problem „nichts mehr zu kaufen“ sind weitere Bausteine in Planung, darunter ein Prestige-System",
        ]
      },
    ]
  },
  {
    date: "06.08.2026",
    version: "v6.4: Win-Challenge überarbeitet, Stream-Statistik & Raid-Clips",
    sections: [
      {
        title: "Win-Challenge — Overlay-Darstellung",
        items: [
          "Lange Challenge-Namen haben die Zähler-Anzeige zusammengedrückt, bis „42 / 100“ auf zwei Zeilen umbrach. Jetzt bricht der Name früher um, der Zähler bleibt einzeilig und mittig",
          "Erledigte Challenges bekommen einen grünen Haken hinter dem Eintrag. Der Platz dafür ist immer reserviert, damit die Zeile beim Abhaken nicht springt",
          "Der Haken sieht überall gleich aus. Challenges ohne Zähler hatten vorher ein umrandetes Kästchen, Challenges mit Zähler einen freistehenden Haken — dasselbe Ergebnis in zwei Darstellungen",
          "Eckenradius steht bei neuen Overlays jetzt auf 0. Innenliegende Ecken folgen dem Wert mit: vorher blieben Zeilen und Zähler rund, auch wenn die Box eckig war",
        ]
      },
      {
        title: "Win-Challenge — Deckkraft je Fläche",
        items: [
          "Hintergrund, Header, Challenge-Zeilen, Zähler und Timer-Leiste haben jetzt jeweils einen eigenen Regler. „Hintergrund“ betrifft nur noch die Fläche um die Zeilen herum",
          "Vorher lag eine einzige Ebene über die ganze Box — auch unter Header und Timer. Deren Deckkraft ließ sich dadurch nie ganz herunterziehen: Timer auf 0 % blieb sichtbar, weil der Hintergrund durchschien. Jetzt füllt jeder Abschnitt nur seine eigene Fläche und jeder Regler erreicht 0",
          "An bestehenden Overlays ändert sich nichts: fehlende Werte übernehmen die bisherige Hintergrund-Deckkraft des jeweiligen Overlays",
        ]
      },
      {
        title: "Win-Challenge — Editor",
        items: [
          "Die Design-Seite empfing einen mit zehn Reglern und sechs Farbfeldern gleichzeitig. Jetzt stehen dort sechs fertige Vorlagen zum Anklicken (Twitch, Mitternacht, Hell, Neon, Wald, Sand) und darunter zugeklappte Abschnitte, die im geschlossenen Zustand ihren aktuellen Wert anzeigen",
          "Farben sind auf Hintergrund, Text und Akzent reduziert; Header-, Zeilen- und Titelfarbe liegen hinter einem Aufklapper",
          "Challenges umsortieren zeigt jetzt, was passiert: eine Einfügemarke ober- oder unterhalb der Zielzeile, die gezogene Zeile wird abgedunkelt. Die Einfügeposition richtet sich danach, in welcher Hälfte du loslässt — vorher landete der Eintrag immer an der Position des Ziels",
          "Zusätzlich Pfeiltasten je Zeile, falls Ziehen unpraktisch ist",
          "Das Dashboard wurde auf 1366×768, 1920×1080 und 2560×1440 nachgemessen — kein seitliches Scrollen, nichts unterhalb des Bildrands",
        ]
      },
      {
        title: "Win-Challenge — Chat-Bot",
        items: [
          "Der Bot hat jede Chatnachricht durch die volle Verarbeitung geschickt, bevor er prüfte, ob es überhaupt ein Befehl ist. Diese Prüfung steht jetzt an erster Stelle — normale Chatnachrichten kosten dadurch rund 650-mal weniger Rechenzeit. Gespeichert wurde dabei nie etwas, weder vorher noch jetzt",
          "In Chats von Overlays, die seit 14 Tagen kein Lebenszeichen hatten, liest der Bot nicht mehr mit",
          "Antworten laufen jetzt über eine Warteschlange mit Twitch-konformem Tempo. Vorher ging bei mehreren Befehlen kurz hintereinander alles gleichzeitig raus und lief ins Limit — die Antworten kamen dann gar nicht an",
          "Ist derselbe Kanal in mehreren Overlays eingetragen, wird das jetzt gemeldet. Befehle wirkten dort still nur auf das erste",
        ]
      },
      {
        title: "Twitch-Overlay-Tools — Neu: Stream-Statistik",
        items: [
          "Neues Modul „Dieser Stream“: Follows, Abos, Bits, Zuschauer, Höchststand und Laufzeit seit Sendungsbeginn — jede Zahl einzeln ein- und ausblendbar",
          "Follows werden als Abstand zum Stand bei Sendungsbeginn berechnet. Abos und Bits kommen dagegen als Ereignis aus dem Chat, weil eine ausgelaufene Mitgliedschaft die Gesamtzahl nach unten zieht — ein neues Abo in dieser Sendung ist trotzdem eins",
          "Die Zähler lassen sich jederzeit von Hand zurücksetzen, und das Widget kann sich außerhalb der Sendung selbst ausblenden",
          "Anordnung wahlweise als Zeile oder Raster",
        ]
      },
      {
        title: "Twitch-Overlay-Tools — Neu: Clip des Raiders",
        items: [
          "Raidet dich jemand, spielt das Overlay automatisch einen Clip aus dessen Kanal ab",
          "Einstellbarer Vorlauf, damit dein eigener Raid-Alert vorher ausreden kann; zu lange Clips werden gekürzt",
          "Mindestzahl an Zuschauern einstellbar, damit nicht jeder kleine Raid einen Clip auslöst",
          "Raids, Cheers und Abos sieht nur der Chat-Bot — steht er nicht im Kanal, weist das Dashboard bei beiden Modulen darauf hin, statt sie stillschweigend leer zu lassen",
        ]
      },
      {
        title: "Twitch-Overlay-Tools — Ziele",
        items: [
          "Follower- und Abo-Ziele gibt es jetzt in drei Formen: ausführlich mit großer Zahl, kompakt oder nur als Balken",
          "Beim Abo-Ziel ist jetzt wählbar, ob Abo-Punkte oder die reine Anzahl gezählt werden — und ob nur die in dieser Sendung dazugekommenen",
        ]
      },
      {
        title: "Blobby Volley vorübergehend geschlossen",
        items: [
          "Blobby Volley wird überarbeitet und ist bis auf Weiteres im Menü gesperrt. Das Spiel bleibt über den direkten Link erreichbar, taucht in der Navigation aber nur noch als Schloss auf",
          "Steuerung dabei geändert: Springen liegt jetzt auf W bzw. Pfeil hoch, die Leertaste setzt das gesammelte Powerup ein",
        ]
      },
    ]
  },
  {
    date: "03.08.2026",
    version: "v6.3: Blobby Volley & Clash Royale von Grund auf überarbeitet",
    sections: [
      {
        title: "Neu: Blobby Volley",
        items: [
          "Neues Minispiel: Volleyball am Strand gegen Freunde — Lobby-Link teilen und loslegen, kein Account nötig. Wahlweise 1 gegen 1 oder 2 gegen 2 auf einem breiteren Feld",
          "Die Physik ist aus dem Original Blobby Volley 2 übernommen — gleiche Konstanten, gleiche Reihenfolge der Rechenschritte. Der Sprung hat einen festen Impuls, gedrückt halten springt höher, und der Ball prallt immer mit derselben Geschwindigkeit von der Blob-Mitte weg. Wie schnell du dich bewegst, ändert am Abpraller nichts: gesteuert wird über die Stelle, an der du den Ball triffst",
          "Vier Regeln zum Einstellen: Feldgröße (1v1/2v2), Pfeiler offen oder Hälften getrennt, Berührungen frei oder klassisch auf 3 begrenzt, Powerups an oder aus",
          "Bei offenem Pfeiler darfst du hochspringen, rüberklettern und den Gegner anrempeln — auf dem Kopf des anderen kann man tatsächlich stehen bleiben",
          "Fünf Powerups schweben über dem Pfeiler und werden mit dem Ball oder direkt mit dem Blob eingesammelt: Schneller, Größer, Gegner klein, Pfeiler hoch, Pfeiler tief. Jedes wirkt 10 Sekunden für das ganze Team",
          "Gespielt wird auf 15 Punkte mit 2 Punkten Vorsprung, danach Revanche per Knopfdruck",
          "Zuschauer können jederzeit beitreten; bei Verbindungsabbruch bleibt der Platz 2 Minuten reserviert und das Spiel pausiert so lange",
          "Jeder sieht sich selbst auf der linken Seite — wer für die rechte Seite spielt, bekommt das Feld gespiegelt, damit die Tasten für alle gleich liegen",
          "Am Handy erscheinen drei Tasten unter dem Feld",
          "Damit sich nichts zäh anfühlt, rechnet der Server mit 75 Hz und der Browser zeigt drei Dinge unterschiedlich: Dein eigener Blob läuft lokal mit und reagiert ohne Wartezeit auf die Tastatur, der Ball wird um die gemessene Leitungszeit vorausgerechnet, und die Gegner werden zwischen zwei bekannten Ständen abgespielt statt geraten — Vorausrechnen hieße dort raten, wann jemand loslässt, und jede Fehlannahme müsste sichtbar zurückgenommen werden",
        ]
      },
      {
        title: "Clash Royale — Startseite mit echten Anleitungen",
        items: [
          "Jeder Modus hat jetzt eine Bildkachel statt fünf Zeilen Fließtext. Ein Klick öffnet eine vollständige Anleitung: Ziel, Ablauf einer Runde, Tipps, die man sonst erst nach ein paar Partien merkt, und was der Host einstellen kann",
          "Vorher sah man acht Modi und konnte über keinen davon mehr erfahren, ohne ihn zu starten",
          "Die Startseite ist zu zwei zusammenhängenden Flächen zusammengefasst worden statt einem Haufen loser Fenster: Lobby erstellen/beitreten über die volle Breite, darunter die acht Modi, darunter alles Erklärende",
          "Die häufigen Fragen stehen jetzt in einem Akkordeon, „Benutzt von“ in einer eigenen Spalte",
          "Für Google liegen strukturierte Daten auf der Seite (Modus-Liste, FAQ, Pfad-Anzeige unter dem Suchtreffer) — die Texte sind dabei nur sichtbar gekürzt, nicht entfernt",
        ]
      },
      {
        title: "Clash Royale — auf dem Handy endlich spielbar",
        items: [
          "Auf einem 390px-Handy nahm die feste Mitspieler-Leiste bisher die Hälfte bis zwei Drittel des Bildschirms weg: bei Snake Royale blieben 166px fürs Spielfeld, bei Bingo, Karussell und Karten-Evolution nur 150px. Darin war das eigentliche Spiel nicht mehr bedienbar",
          "Jetzt bekommt das Spielfeld auf schmalen Bildschirmen die volle Breite. Die Mitspieler stehen in einem schmalen Streifen darüber und ausführlich in einem Blatt, das von unten hereinfährt. Auf großen Bildschirmen bleibt alles wie gehabt",
          "Alle Modi teilen sich jetzt dieselbe Kopfzeile, Seitenleiste und Fußleiste. Vorher hatte das jeder Modus einzeln gebaut — mal mit diesem Rahmen, mal mit jener Rundung — und dadurch wirkten sie zusammengewürfelt, obwohl sie zum selben Spiel gehören",
        ]
      },
      {
        title: "Clash Royale — Lobby & Host-Einstellungen",
        items: [
          "Die Host-Einstellungen sind aus der Lobby in ein eigenes Fenster gezogen. Vorher füllte die Einstellungsspalte zwei Bildschirme und schob die Spielerliste auf dem Handy nach ganz unten",
          "Der Start-Knopf ist immer erreichbar, egal wie weit man in den Einstellungen gescrollt hat",
          "Neu: Lobby sperren — es kommt niemand Neues mehr rein. Wer schon drin war und nur einen Netzwerk-Hänger oder einen Tab-Reload hatte, kommt weiterhin zurück. Die Sperre bleibt auch über eine laufende Runde hinweg gesetzt",
          "Die Lobby zeigt „3/8 Spieler“ und bei gesperrter Lobby auch Gästen den Grund, statt einer kommentarlosen Fehlermeldung",
          "Das zuletzt beendete Spiel steht jetzt direkt in der Lobby, alles Weitere hinter „Alle ansehen“",
        ]
      },
      {
        title: "Clash Royale — Neu: Live-Tracking über die offizielle API",
        items: [
          "Spieler können ihren Clash-Royale-Account mit ihrem Lobby-Platz verknüpfen; Host und Admin dürfen das zusätzlich für alle anderen tun — praktisch, wenn im Stream reihum durchgegeben wird",
          "Der Tag wird vor dem Speichern gegen die offizielle API geprüft. Ein Tippfehler fällt damit sofort auf und nicht erst als Spieler, der beim Tracking dauerhaft 0–0 stehen bleibt",
          "Ist das Tracking an, zählt der Server ab diesem Moment für jeden verknüpften Spieler Siege und Niederlagen mit. Der Stand steht neben dem Namen in der Lobby und am Ende auf einem eigenen Leaderboard — das während des Endscreens weiterläuft, wer noch eine Partie beendet, rutscht dort hoch",
          "Am Spielende gibt es das fertige Deck als QR-Code, als Kopierlink und zum Direktöffnen in Clash Royale",
          "Admins können im Endscreen einzelne Deck-Karten nachträglich tauschen",
        ]
      },
      {
        title: "Clash Royale — Regeln & Balance",
        items: [
          "Angel Royale: Der Fluss ist jetzt deutlich voller — 2 statt 1 Karte pro Sekunde als Standard, einstellbar bis 3. Vorher wartete man die halbe Zeit auf überhaupt eine Auswahl, und die Frage war „nehme ich das Einzige“ statt „welche nehme ich“",
          "Angel Royale — neu: Angel-Zwang. Wer sein Zeitfenster (Standard 5 Sekunden, abschaltbar) verstreichen lässt, bekommt eine zufällige treibende Karte zugelost. Ohne das konnte man in Ruhe warten, bis genau die passende Karte vorbeikam, und sich so ein besseres Deck bauen als jemand, der zügig entscheidet. Die Frist läuft erst ab dem Moment, in dem die Angel wieder bereit ist",
          "Angel Royale — neu: Flitzer. Etwa jede fünfte Karte schießt in kurzen Schüben quer durch den Fluss. Fangbar bleibt sie dabei — genau das ist der Reiz. Flitzer tauchen nie ab, beides zusammen wäre kaum zu treffen",
          "Elixir Rush: Karten liegen jetzt 8 statt 15 Sekunden auf dem Markt, neu wählbar sind auch 4 und 6. 15 Sekunden waren zu gemütlich — der Markt stand länger still, als man zum Entscheiden braucht, und „Rush“ hieß vor allem Warten",
          "Blindes Karussell: Du musst deine Aufdeckungen verbrauchen, bevor du eine Karte nehmen darfst. Vorher durfte man sofort blind zugreifen — das war nie die bessere Wahl, ließ die Runde aber in einer Sekunde vorbei sein und nahm dem Modus seinen Kern. Das Risiko bleibt: genommen werden darf danach jede Karte, auch eine verdeckte",
          "Elixier-Auktion: In der letzten Runde wird automatisch das gesamte Restguthaben geboten. Elixier zu sparen bringt dort nichts mehr, wer weniger bietet verschenkt nur die Karte — jetzt entscheidet die Runde sauber danach, wer noch was übrig hat",
          "Elixier-Auktion: Die Elixierbalken richten sich nach dem Startguthaben der Runde. Bei 100 Start-Elixier war der Balken vorher nur halb voll, obwohl man noch alles hatte",
          "Dunkles Labyrinth: Das Laufen ruckelt nicht mehr zurück. Schritte kommen über das Netz gebündelt an (WLAN-Aussetzer, TCP-Stau); das alte starre Zeitfenster hat sie verworfen, und man wurde sichtbar zurückgerissen. Jetzt gibt es ein kleines Schritt-Guthaben, und der Server quittiert jeden Zug einzeln — auch einen abgelehnten",
        ]
      },
      {
        title: "Unter der Haube",
        items: [
          "Fehlermeldungen der Spielmodi sind jetzt zweisprachig. Vorher schickte der Server fertige deutsche Sätze — englische Spieler bekamen mitten in einer englischen Oberfläche „Max. 2 Champions pro Deck!“ zu sehen",
          "Die Hauptdatei der Clash-Royale-Seite hatte 3.094 Zeilen und enthielt Startseite, Lobby, Spielphase, Endscreen, fünf Dialoge, die komplette Netzwerkschicht und das Wörterbuch. Sie ist in einzelne Bereiche aufgeteilt und orchestriert jetzt nur noch",
          "Die vierzehn Host-Regler wurden aus rund 620 Zeilen mit vierzehn Kopien derselben Struktur auf eine gemeinsame Beschreibung umgestellt — vorher hatten sich Abstände und Farben zwischen ihnen auseinandergelebt",
          "Zugriffe auf die Clash-Royale-API laufen über einen gemeinsamen Client. Transport, Tag-Prüfung und Battlelog-Umformung standen vorher dreimal getrennt im Code (Win Tracker, Nuzlocke, Modus-Scanner)",
        ]
      },
    ]
  },
  {
    date: "29.07.2026",
    version: "v6.2: Twitch-Overlay-Tools, drei neue Clash-Royale-Modi & spürbar schnellere Seite",
    sections: [
      {
        title: "Neu: Twitch-Overlay-Tools",
        items: [
          "Neue Seite unter Streamer-Tools: Abstimmungen, Vorhersagen sowie Follower- und Abo-Ziele als OBS-Overlay — eine einzige Browserquelle für alle Module",
          "Abstimmungen und Vorhersagen startest du wie gewohnt direkt in Twitch. Das Overlay liest nur mit und zeigt sie animiert im Stream — angefragt werden ausschließlich Leserechte, niemand muss erlauben, seine Abstimmungen zu verwalten",
          "Vorhersagen mit zwei Optionen erscheinen als Versus-Balken, bei dem beide Seiten gegeneinander drücken; ab drei Optionen als Anteilsleiste mit beschrifteter Rangliste",
          "Follower- und Abo-Ziele spiegeln wahlweise das Ziel aus deinem Twitch-Creator-Dashboard — dort eingestellt erscheint es weiterhin unter dem Stream und im Chat, das Overlay zeigt dieselben Zahlen nur schöner und zieht bei Zielwert-Änderungen automatisch mit",
          "Alternativ rechnet das Overlay ein eigenes Ziel: mit Startwert und automatischer Erhöhung nach jedem Erreichen",
          "Widgets per Drag & Drop auf einer 1920×1080-Leinwand platzieren; Position, Größe, Deckkraft, Farben, Timer und Einblend-Animation lassen sich je Modul einstellen",
          "Welche Module im Stream auftauchen, entscheiden Häkchen im Dashboard — der OBS-Link bleibt dabei immer derselbe",
          "Die Standardfarben sind auf Farbfehlsichtigkeit geprüft, damit die Balken auch für rot-grün-schwache Zuschauer unterscheidbar bleiben",
        ]
      },
      {
        title: "Clash Royale — drei neue Modi",
        items: [
          "Karten-Evolution ist aus den internen Tests raus: 3 Runden, in denen Karten mit steigenden Tokenkosten auf- oder abgewertet und gelockt werden, dazwischen eine Sabotage-Phase. Alle Karten kommen aus einem geteilten Pool — dieselbe Karte kann nie bei zwei Spielern gleichzeitig liegen",
          "Angel Royale: Karten treiben in zufälligen Bahnen über den Fluss — manche schnell, manche in Wellenlinien, manche tauchen kurz ab und sind dann nicht fangbar. Anklicken zum Angeln, nach jedem Fang braucht die Angel einen Moment. Wer zu lange gar nicht angelt, bekommt eine zufällige Karte zugelost",
          "Dunkles Labyrinth: ein bei jedem Start neu generiertes Labyrinth in völliger Dunkelheit — du siehst nur deinen eigenen Lichtkegel, Zuschauer sehen alles. Sammle Draft-Kisten (1 aus 2) und lose Bodenkarten, in der Mitte wartet genau ein Joker. Läuft die Zeit ab, werden leere Deck-Plätze zufällig aufgefüllt",
        ]
      },
      {
        title: "Die Seite läuft deutlich flüssiger",
        items: [
          "Der Aurora-Hintergrund war die Hauptursache für das leichte Dauerstocken: vier riesige, permanent weichgezeichnete Flächen mussten Bild für Bild neu berechnet werden. Die Unschärfe kommt jetzt aus dem Farbverlauf selbst — optisch unverändert, aber ohne die Rechenlast",
          "Startseite lädt nur noch halb so viel JavaScript (1.374 kB → 661 kB, komprimiert 374 kB → 189 kB): die schweren Bereiche wie Garden-Game, adVentures, Clash Royale und das Discord-Dashboard werden erst geladen, wenn man sie wirklich aufruft",
          "Die Spieler-Avatare in den Clash-Royale-Lobbys von 2,41 MB auf 0,17 MB geschrumpft — sie wurden in voller Auflösung geladen und dann auf 48 Pixel angezeigt",
          "11 ungenutzte Pakete aus dem Frontend entfernt",
          "Nebenbei: Abstimmungs- und Giveaway-Updates gehen nur noch an die, die die jeweilige Seite offen haben. Vorher bekam jede offene Verbindung bei jeder einzelnen Stimme die komplette Liste geschickt — auch OBS-Overlays und Clash-Royale-Spieler",
        ]
      },
      {
        title: "Discord-Bot",
        items: [
          "Neuer Command: /gewicht — misst dein Gewicht in kg",
        ]
      },
    ]
  },
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