# Offene Updates

<!--
Sammelt alle sichtbaren Änderungen seit dem letzten Deploy. Beim nächsten ./deploy.sh (frontend oder beides)
wird daraus automatisch eine neue Version auf /updates und ein Post in Discord #updates; danach ist die Datei leer.

Format:
  Titel: Kurzer Titel der Version        (optional, sonst aus den Überschriften)
  Version: v7.0                          (optional, sonst letzte Zahl +1)

  ## Überschrift (wird in Discord gezeigt)
  - Ein Punkt in Nutzersprache, ohne Technik-Begriffe
-->

## Clash Royale Stats
- Neu für Clan-Anführer: der Reiter „Zentrale“ auf jeder Clan-Seite. Eine Ampel zeigt auf einen Blick, wer aktiv ist, wer nachlässt und wer abgetaucht ist. Für jedes Mitglied siehst du die Kriegsdecks der letzten Wochen, die Spenden je Woche und seit wann es im Clan ist. Dazu kommen Vorschläge, wen du befördern oder entfernen könntest, jeweils mit Begründung, und eine Liste, wer kam, ging oder eine neue Rolle bekam
- Erinnerungen in Discord: Trag in der Zentrale einen Discord-Webhook ein. Dann schreibt die Seite vor dem Ende jedes Kampftags in deinen Kanal, wer noch Decks offen hat, und schickt montags nach dem Rennen einen Wochenbericht. Geht mit jedem Konto, auch ohne Twitch
- Meta Decks: Bei „Gespielt von“ steht jetzt der aktuelle Platz in der Weltrangliste, genau wie in der Rangliste selbst. Bisher konnte er einige Stunden alt sein
- Meta Decks: Die Karten sind jetzt so groß wie in der Rangliste und viel besser zu erkennen
- Meta Decks: Neben jedem Deck stehen nur noch Siegquote und wie viele Spieler es nutzen. Standardmäßig sind die Decks danach sortiert, wie viele Spieler sie nutzen. Wie oft ein Deck gespielt wurde, siehst du auf seiner Deck-Seite
- Meta Decks: Durchschnittliches Elixier und Cycle stehen jetzt direkt unter den Karten, genau wie in der Rangliste
- Crown Series: Die Karten sind jetzt so groß wie bei den Meta Decks. In den Sets stehen Elixier, Rundensiege und der Kopieren-Knopf neben dem Deck, bei „Einzelne Decks“ stehen Elixier und Cycle unter den Karten
- Karten: Die Liste ist jetzt standardmäßig nach Seltenheit sortiert, von Gewöhnlich bis Champion und innerhalb jeder Seltenheit die günstigsten Karten zuerst
- Karten: Unter jeder Karte stehen jetzt nur noch die zwei wichtigsten Werte, Nutzung und Siegquote. Die Elixierkosten findest du weiter in der Tabellenansicht
- Spielerprofile: Das Crown-Series-Duell-Set bleibt jetzt sichtbar, auch wenn der Spieler seitdem viele andere Kämpfe gespielt hat. Daneben steht, wann er es zuletzt gespielt hat
- Kämpfe: Classic- und Grand-Challenge zeigen jetzt ihren grünen bzw. goldenen Kranz statt des Draft-Symbols, mit dem Namen der Challenge und den Siegen vor dem Kampf, auch bei 0 Siegen
- Kämpfe: Die Siege vor dem Kampf stehen jetzt als kleine Bubble direkt neben dem Namen, bei dir und beim Gegner. In Challenges, der Crown Series und Turnieren steht auch „0 Siege“ da, statt dass die Angabe fehlt, auch bei älteren Kämpfen
- Kämpfe: Jeder Modus heißt jetzt so wie im Spiel, auf Deutsch und Englisch, etwa „Dreifach-Auswahlkampf“, „Kronen-K.o.-Kampf“ oder „1v1-Showdown“. Viele Modi haben dazu ihr eigenes Symbol, zum Beispiel Mega Draft, Sudden Death oder Spiegelkampf
- Spielerprofile: Die Abzeichen sind jetzt nach Art sortiert, mit Ranglisten, CRL, Events & Challenges, Laufbahn sowie Saisons & Jahre. Innerhalb steht das Neueste vorn, so stehen zum Beispiel alle CRL-Abzeichen nach Jahr beisammen
- Abzeichen: Bei Ranglisten und Turnieren steht jetzt, wie oft du dich platziert oder ein Event geschafft hast, bei der CRL-Challenge deine Siege von 20. Saison-Abzeichen heißen wie ihr Monat, etwa „Saison Juli 2025“
- Abzeichen: Alle sind jetzt ungefähr gleich groß, auch CRL 2026 und das Jahresabzeichen 2026. „Secret Chaos“ heißt jetzt auch so
- Kämpfe: Gewöhnliche 2v2-Kämpfe zeigen jetzt das 2v2-Wappen, nur Kämpfe in der 2v2-Liga das Liga-Symbol und den Namen „2v2-Liga“. Viele Modi haben dazu ihr eigenes Symbol bekommen, etwa Chaos-Draft, 7x Elixier, Dreifach-Elixier, Heist, Touchdown, Dragon Hunt, Chess Royale, Elixir Capture, Berserk und das Global Tournament
- Clash-Royale-Seiten laden etwas schneller: Viele Symbole sind jetzt deutlich kleinere Dateien, ohne dass man einen Unterschied sieht
- Die Modus-Symbole sind jetzt viel schärfer, auch auf hochauflösenden Bildschirmen
- Win Tracker: Im Global Tournament zeigt dein Overlay jetzt das Global-Tournament-Symbol aus dem Spiel statt des Pokals
- Win Tracker: Kommt nach einem Match dein neuer Medaillen- oder Trophäenstand vor dem Match selbst an, springen jetzt auch Gewinn, Siege/Niederlagen und „Letzte 5“ sofort mit. Bisher zog nur der Kopf nach, wenn das Match zuerst da war
- Ranglisten: Die Decks folgen jetzt dem Profil. Hat ein Spieler seit dem letzten Blick gespielt, wird sein Deck nach spätestens einer Viertelstunde neu geholt statt erst nach einem Tag. Ein Deck, das im Profil schon aktuell ist, steht auch gleich so in der Rangliste
- Ranglisten, Profile und der Win Tracker laden schneller: Ranglisten erscheinen sofort und aktualisieren sich im Hintergrund, und Win Tracker und Stats teilen sich ihre Abfragen, statt dasselbe doppelt zu holen
- Rufst du in kurzer Zeit sehr viele Spieler und Clans auf, steht jetzt da, ab welcher Uhrzeit es weitergeht. Mit Twitch oder Discord angemeldet hast du deutlich mehr Spielraum, auch wenn sich mehrere Leute einen Internetanschluss teilen

## Visitenkarte
- Dein öffentliches Profil wird zur Visitenkarte zum Teilen, etwa in deiner Bio. Du bestimmst, welche Abschnitte in welcher Reihenfolge erscheinen, blendest einzelne aus und zeigst dein Lieblingsspiel mit Bild
- Zeig dein Clash-Royale-Konto mit Liga, Trophäen und Clan. Wähle eines deiner verknüpften Konten oder gib einfach deinen Spieler-Tag ein
- Die Visitenkarte gibt es jetzt für jedes Konto, auch mit Discord oder als Gast, unter einer eigenen Adresse wie vnmvalentin.de/u/deinname. Bisherige Profil-Links funktionieren weiter
- Bis zu sechs Abzeichen aus deinen Spielen stellst du in eine Vitrine ganz oben. Deine Website-Stufe mit Fortschritt und deine Bestwerte stehen ebenfalls auf der Karte. Die Karte gibt es auf Deutsch und Englisch, und Ausschalten wirkt sofort
- Die Karte hat einen eigenen Kopf bekommen: oben ein Banner mit dem Bild deines Lieblingsspiels und dem Logo der Website, darunter dein Bild, dein Name, deine Stufe mit Fortschritt und die wichtigsten Zahlen auf einen Blick. Die Abzeichen deiner Vitrine stehen als Plaketten direkt darunter

## Profil
- Dein Profil ist jetzt in Reiter aufgeteilt, statt alles untereinander zu zeigen: Übersicht (Stufe, Spiele, Abzeichen), Visitenkarte, Abo & Laden, Einladen, Einstellungen (Mitteilungen, Barrierefreiheit) und Konto (Anmeldewege, Name, Abmelden)
- Von der Übersicht kommst du mit einem Klick in jeden Bereich. Welcher Reiter offen ist, steht in der Adresse, du kannst ihn also als Lesezeichen speichern

## Startseite
- Angemeldet begrüßt dich die Startseite jetzt mit deinem Namen und zeigt, was heute ansteht: die CR-Tagesrunde mit Punkten und Serie und deinen Platz im Seed-Runners-Tagesrennen. Ein Klick führt direkt hin
- „Neu seit deinem letzten Besuch“: Die Startseite listet die Updates, die du noch nicht gesehen hast. Ein Klick öffnet genau diesen Eintrag, mit dem Kreuz blendest du die Liste aus
- Von der Startseite kommst du mit einem Klick zu deiner Visitenkarte oder richtest sie ein

## Website auf Englisch
- Kopfzeile, Menü, Startseite, die Übersichten „Fun“, „Community“ und „Contact“, das Verzeichnis unten auf jeder Seite und die Fehlerseite gibt es jetzt auch auf Englisch
- Die Sprache wählst du ganz unten auf jeder Seite, im Handy-Menü oder auf großen Bildschirmen oben rechts in der Kopfzeile. Sie gilt für alle übersetzten Bereiche der Website und bleibt gespeichert

## Website als App
- Die Website lässt sich jetzt als App installieren: mit eigenem Symbol auf dem Startbildschirm und ohne Browser-Leiste. Auf dem Handy findest du „App installieren“ im Menü, im Profil unter „App & Mitteilungen“ steht, wie es auf dem iPhone geht
- Neu: Mitteilungen aufs Handy oder an den Rechner. Unter dem Stream auf der Startseite schaltest du mit „Bei Live benachrichtigen“ einen Hinweis ein, sobald der Stream startet. Das geht auch ohne Anmeldung
- Im Profil wählst du unter „App & Mitteilungen“, worüber du benachrichtigt wirst: Stream ist live, neue Updates der Website und Antworten auf dein Feedback. Mit „Probe senden“ siehst du sofort, wie es aussieht. Auf dem iPhone gibt es Mitteilungen nur in der installierten App

## Glocke
- Oben rechts gibt es jetzt eine Glocke mit Zähler. Sie zeigt, wenn der Stream live ist, welche Updates du noch nicht gesehen hast und Nachrichten nur für dich
- Feedback geht jetzt mit jedem Konto, auch mit Discord oder als Gast. Wenn ich auf dein Feedback antworte, findest du die Antwort in der Glocke und auf Wunsch auch als Mitteilung

## Schnellsuche
- Neu: die Schnellsuche. Drück Strg+K (am Mac ⌘K) oder tippe auf die Lupe oben rechts und finde jede Seite und jedes Spiel, alle Clash-Royale-Karten sowie Spieler und Clans
- Gib einen Spieler-Tag wie #2PP ein und spring direkt zum Spieler oder Clan. Mit den Pfeiltasten wählst du aus, Enter öffnet
- Ohne Eingabe stehen oben die Ziele, die du zuletzt gesucht oder besucht hast. Die Suche gibt es auf Deutsch und Englisch

## Freunde einladen
- Im Profil findest du jetzt deinen eigenen Einladungslink. Legt ein Freund darüber ein neues Konto an, auch einfach als Gast, und kommt an einem anderen Tag wieder, bekommt ihr beide ein Abzeichen für eure Visitenkarte
- Je mehr Freunde dabeibleiben, desto mehr Abzeichen: Gastgeber ab einem, Netzwerker ab drei und Botschafter ab zehn Freunden. Wenn ein Freund über deinen Link dazukommt, steht es in der Glocke
- Wer einen Einladungslink öffnet, sieht oben, wer ihn eingeladen hat, und kann sich mit einem Klick anmelden

## Jetzt mitspielen
- Wenn im Stream mit der Community gespielt wird, steht der Raum jetzt ganz oben auf der Startseite und in der Glocke. Ein Klick, und du bist dabei
- Ist der Raum begehrt, stellst du dich auf der neuen Seite „Jetzt mitspielen“ an und siehst deinen Platz. Bist du dran, kommt der Link in die Glocke und als Mitteilung aufs Handy
- Im Chat verrät !mitspielen jederzeit, wo gerade gespielt wird

## Barrierefreiheit
- Neu: die Seite „Barrierefreiheit“, unten auf jeder Seite und im Profil. Dort stellst du ein, dass sich nichts mehr von selbst bewegt, dass blasse Schrift und Ränder kräftiger werden und dass Links im Text zusätzlich unterstrichen sind. Das gilt sofort auf der ganzen Website. Wünscht dein System mehr Kontrast, übernimmt die Website das von selbst
- Ganz ohne Maus: Der erste Druck auf Tab bietet „Zum Inhalt springen“ an, und was gerade gewählt ist, trägt jetzt überall einen deutlichen Rahmen. Menü, Suche, Glocke und Feedback holen sich beim Öffnen den Fokus, und Esc bringt dich dorthin zurück, wo du warst
- Mit Screenreader hörst du bei jedem Seitenwechsel, welche Seite geladen wurde. Die Sprach-Knöpfe mit Flagge haben jetzt einen Namen
- Kleine graue Schrift ist auf der ganzen Website besser lesbar

## Sacrifice & Sigils
- Am Handy: Drehst du dein Handy quer, spielst du am Tisch im Kerzenlicht, hochkant auf dem flachen Tisch. Der Wechsel klappt jederzeit, auch mitten in einer Partie. Hochkant erinnert dich eine leise Zeile daran, die du ausblenden kannst
- Mit dem Finger: Tippst du auf die Waage, ein Totem, die Kerzen, die Knochen oder einen anderen Gegenstand, steht daneben, was er bedeutet. Das Menü im Spiel nennt die Handgriffe für Finger, also antippen und lange drücken
- Auf kleinen Handys im Querformat passen das Hauptmenü, die Lobby, das Kartenbuch und die Hinweise im Tutorial jetzt ganz auf den Bildschirm
- Ganz ohne Maus: Am Tisch spielst du jetzt jede Phase auch nur mit der Tastatur. Tab springt zwischen Hand, Brett, ausliegenden Karten, Pfadkarte und Gegenständen, die Pfeiltasten wählen, Eingabe klickt und I zeigt eine Karte groß. Was gewählt ist, hebt sich auf dem Tisch an, und unten links steht, was es ist
- Mit Screenreader: Er liest jede Karte mit Kosten, Angriff, Leben und Sigils vor, dazu jedes Feld, jeden Zettel und jeden Gegenstand samt Erklärung
- Schont Akku und Lüfter: Passiert am Tisch gerade nichts, zeichnet das Spiel deutlich weniger Bilder pro Sekunde. Sobald du die Maus bewegst oder etwas geschieht, läuft es wieder in voller Flüssigkeit. Auf Handys und Tablets rechnet der Tisch etwas sparsamer
- Ohne Grafikkarte (Sparmodus) läuft der flache Tisch jetzt flüssig: Das Kerzenlicht flackert dort nicht mehr, und der 3D-Hintergrund bleibt aus. Die Einstellungen sagen dir, wenn der Sparmodus an ist

## adVentures: Wie weit kommst du?
- Nach dem Sieg über Thunderwing geht es jetzt richtig weiter: Jede Welt danach zählt als „Tiefe“, und die neue Bestenliste „Am weitesten“ zeigt, wer am tiefsten gekommen ist. Im Spiel siehst du ab dem zweiten Zyklus deine Tiefe und deine Bestmarke, eine neue Bestmarke wird angesagt
- Jeder weitere Zyklus bringt eine Wendung, zum Beispiel Hast (Gegner schneller), Glaskanone (mehr Schaden geben und nehmen), Dürre (halbe Heilung, doppeltes Gold) oder Tyrannen (stärkere Bosse). Welche als Nächstes kommt, steht schon im Siegfenster
- Die Zyklen werden mit jeder Welt härter: Gegner werden schneller, Ausweichen hilft weniger, und jeder Treffer tut spürbar weh. Vorher konnte ein starker Lauf praktisch endlos weitergehen, jetzt endet er irgendwo, und genau das zählt. Der erste Zyklus bleibt, wie er ist
- Vier neue Erfolge: Dritter Zyklus, Tiefer als tief (Tiefe 15), Vierter Zyklus und Bodenlos (Tiefe 20)
- Neue Welt im zweiten Zyklus: der Friedhof statt des Verlieses. Gehst du an einem Grab vorbei, steigen nach kurzer Warnung Tote heraus. Dort warten Ghule, Irrlichter, die heranfliegen und zerplatzen, und schwere Grabwächter, am Ende die Klagende Witwe als neuer Boss
- Auf dem Frostgipfel des zweiten Zyklus wartet ein neuer Boss: der Frostwyrm mit Eisatem, Eiszapfenregen und Sturzflug
- Drei weitere neue Welten im zweiten Zyklus: Im Pilzwald stoßen dicke Sporenpilze Wolken aus, die dich bremsen, bis der Myzelkönig selbst auf dich springt. Im Sumpf liegen Giftpfützen im Nebel, und die Moorhexe wirft mit Giftflaschen. Im Uhrwerkturm drehen Zahnradfallen ihre Klingen. Die treffen dich, mahlen aber auch die Horde klein, die dir hinterherläuft. Am Ende wartet der Uhrwerkkoloss
- Die neuen Welten haben eigene Gegner: Stachelpilze und Moosaffen im Pilzwald, Giftkröten, Glubs, Tintenkraken und Riesenfrösche im Sumpf, Roboter-Drohnen und Mechs im Uhrwerkturm
- Der Kodex zeigt jetzt auch die Gegner und Bosse der neuen Welten
- Auf dem Friedhof stehen die kahlen Bäume jetzt als Bäume da und nicht mehr als grüne Tannen, und Gräber, Sporen und Zahnräder sind zu hören

## adVentures: Vier neue Kits
- Mönch (ab Stufe 8): kämpft mit bloßen Händen, jeder dritte Schlag wird zur Druckwelle. Dazu Chi-Welle, Windschritt und Hundert Fäuste
- Jägerin (ab Stufe 11): legt Fangeisen, die Gegner festhalten, springt per Salto aus der Menge und ruft ein Wolfsrudel
- Alchemist (ab Stufe 14): wirft Flaschen, die abwechselnd brennen, bremsen und vergiften. Mit Elixier, Rauchbombe und einer Kettenreaktion aus allen drei Elementen
- Nekromantin (ab Stufe 16): wer durch ihren Seelenblitz fällt, steht als Skelett für sie wieder auf. Mit Knochendornen, Seelentausch und dem Heer der Toten
- Wer die Stufe schon erreicht hat, kann das Kit sofort spielen. Jedes Kit hat wie die anderen drei Farbvarianten zum Freispielen

## adVentures: Wolfsrudel und eine schönere Welt
- Neue Gegner in fast allen Welten, auch im ersten Zyklus: Wolfsrudel kreisen um dich und springen dich nach kurzer Ansage an. Gruftwölfe im Verlies und auf dem Friedhof, Schneewölfe auf dem Frostgipfel, Glutwölfe im Schlackefeld (ihr Biss brennt), Wüstenfüchse in der Glutwüste und Waldwölfe im Pilzwald. Dazu das Geschützwerk im Uhrwerkturm
- In der 3D-Ansicht sind Kisten jetzt echte Truhen (geöffnete bleiben offen stehen), Schreine Steinpfeiler mit ihrem Edelstein darüber, der Opferaltar ein Kerzenschrein, und die Kristallhöhle hat echte Kristalle
- Geschosse und Waffen haben eigene Formen: Pfeile und Dolche fliegen als Pfeile, Wurfsterne und Bumerangs drehen sich, Eis kommt als Kristall, die Orbitalklingen kreisen als Klingen
- Fähigkeiten mit mehreren Ladungen feuern bei gehaltener Taste nicht mehr alle auf einmal (Geschütztürme des Tüftlers, Schattenschritt des Ninjas)
- Helfer wie Skelette und Begleittiere verteilen sich auf verschiedene Gegner, statt alle auf denselben zu gehen

## Blobby Volley: Partyregeln und König des Strandes
- Neue Partyregeln, frei kombinierbar: Doppelball (zwei Bälle gleichzeitig, der erste im Sand entscheidet), Wind (wechselt bei jedem Aufschlag Richtung und Stärke und ist oben rechts zu sehen), Riesenball (größer und schwebender) und Mini-Netz
- König des Strandes: kurze Partien bis 7. Der Sieger bleibt auf dem Platz, wer zuschaut, stellt sich an und rückt der Reihe nach gegen ihn an. Die Anzeigetafel zeigt den König mit seinen Siegen in Folge und die Warteschlange, die nächste Runde startet von selbst
- Ideal für Mitspiel-Streams: Zuschauer kommen über den Link dazu und warten, bis sie dran sind

## Neu: Spieleabend
- Connect 4 wird zum Spieleabend: ein gemütliches 3D-Zimmer mit rundem Tisch, Hängelampe, Sofa und einem Fenster, durch das man auf verschneite Dächer und den Mond schaut. Du öffnest es mit einem Klick, ohne Anmeldung
- Du bist als dein eigener Blob im Zimmer und läufst aus seinen Augen herum: Klick ins Bild, dann schaust du einfach mit der Maus umher wie in einem Ego-Spiel und läufst mit WASD. Im Zimmer hängen keine Schilder herum: Erst wenn du nah an etwas herankommst und es anschaust, steht unter dem Punkt in der Bildmitte, was du tun kannst (Platz nehmen, Spiel wählen, Chips essen …), und E oder ein Klick macht es. Am Tisch ist die Maus frei für das Spiel. Am Handy wischst du zum Umschauen und tippst auf den Boden, um hinzulaufen. Mit der Taste V oder dem Knopf oben schaust du stattdessen von schräg oben zu
- Esc (oder der Knopf „Menü“) öffnet das Menü: Ton und Lautstärke, Mausgeschwindigkeit, wer gerade im Zimmer ist und der Link zum Einladen. Der Gastgeber kann dort auch jemanden hinauswerfen, der kommt dann nicht wieder herein
- Freunde holst du per Link dazu: Wer ihn öffnet, kommt durch die Zimmertür herein. Bis zu sechs Blobs passen hinein, alle sehen sich gegenseitig herumlaufen
- In der Ecke steht ein großer Bogenhanf, oben auf dem Spieleregal ein Pokal und eine Grünlilie, deren Blätter über die Kante hängen
- Zum Mitspielen gehst du an einen freien Stuhl und drückst E: Dein Blob hüpft hinauf. Mit „Aufstehen“ springt er wieder herunter. Wer nicht am Tisch sitzt, bekommt das Ergebnis einer Partie als kurze Meldung
- Im Spieleregal an der Wand stehen die Spiele als Kartons, der Gastgeber wählt per Klick
- Am Couchtisch steht eine Schale Chips: ein Klick und dein Blob holt sich einen, es knuspert hörbar. Wer viele isst, bekommt einen immer dickeren Bauch, bis er eine riesige Kugel mit kleinem Kopf obendrauf ist, wird langsamer und schwabbelt beim Laufen; der Bauch ragt dann einfach durch die Möbel, an Chips, Teppich und Tisch kommst du trotzdem. Mit der Zeit verdaut er wieder. Wer dann noch einen isst, platzt wie ein Luftballon, schwirrt pfeifend durchs Zimmer und ist wieder schlank
- Neben den Chips steht Limo: ein Schluck und dein Blob hat eine Weile Schluckauf und hüpft ab und zu mit einem „hick“
- Gesten-Rad: Halte G (oder tippe oben auf „Gesten“) und wähle winken, tanzen, jubeln, schmollen, klatschen, Mittelfinger (wird verpixelt und weggepiept) oder zeigen; mit den Tasten 1 bis 7 geht es direkt. Beim Zeigen sehen alle einen Ring an der Stelle, auf die du zeigst
- Aufs Sofa plumpsen: Klick aufs Sofa und dein Blob lässt sich hineinfallen. Von dort schaust du über deinen Kopf hinweg auf den Tisch, mit dem Mausrad holst du das Spiel näher heran. Laufen oder Leertaste: wieder aufstehen
- Lichtschalter neben der Tür: Licht aus, und es leuchten nur noch die Kerze und der Mond, der das Fensterkreuz auf den Boden wirft. Dann hat jeder eine Taschenlampe, die dorthin leuchtet, wohin er schaut, und ab und zu knarzt eine Diele
- Schneeballschlacht: Fenster öffnen (Flocken wehen herein), vom Sims draußen drei Schneebälle holen und auf andere werfen (anklicken oder F) oder einfach irgendwohin. Wer getroffen wird, hat kurz Schnee im Gesicht
- Minka, die Zimmerkatze, streift umher, legt sich auf freie Stühle, sitzt auf der Fensterbank und kommt zu dir, wenn sie gestreichelt werden will. Ein Klick und sie schnurrt, Herzchen steigen auf. Im Dunkeln leuchten ihre Augen. Ihre Ohren zucken ab und zu, und im Sitzen schlägt die Schwanzspitze
- Kissenschlacht: Klick auf einen anderen Blob (oder F, wenn er vor dir steht) und du haust ihm ein Kissen um die Ohren. Federn fliegen, Sterne kreisen über seinem Kopf und er wird ein Stück weggeschubst
- In der Umkleide an der linken Wand ziehst du dich um: Farbe, Hut, Gesicht und Name probierst du direkt an deinem Blob an. Im großen Spiegel daneben siehst du dich auch, wenn du aus deinen eigenen Augen schaust
- 4 gewinnt steht als Plastikbrett in der Tischmitte, ihr sitzt euch gegenüber und seht euch über das Brett hinweg. Die Steine fallen hörbar in ihre Spalte, die Gewinnreihe leuchtet, und vor der nächsten Partie fallen alle Steine unten heraus
- Unter dem Brett startest du die Partie, stellst die Bots ein (leicht, mittel, schwer) und spielst nochmal. Allein spielst du gegen einen Bot, geht jemand mitten in der Partie, spielt ein Bot für ihn weiter
- Dein Blob ist derselbe wie in Worldflip
- Am Handy tippst du eine Spalte an und mit dem zweiten Tippen fällt der Stein. Alte Connect-4-Links führen in ein neues Zimmer
- Neu am Tisch: Mensch ärgere dich nicht für 2 bis 4. Das Brett liegt auf dem Tisch, du schaust schräg von oben darauf, die anderen sitzen links, rechts und gegenüber
- Der Würfel fliegt vom Platz des Werfenden auf den Tisch und rollt aus, man hört ihn erst in der Hand klappern und dann auf den Tisch fallen. Würfeln kannst du per Klick auf den Würfel, mit dem Knopf unten oder mit der Leertaste
- Figuren hüpfen Feld für Feld, wer rausgeworfen wird, fliegt im Bogen zurück ins Haus. Welche Figuren ziehen können, zeigen Pfeil und Ring, beim Darüberfahren siehst du das Zielfeld (rot, wenn dort jemand rausfliegt)
- Es gelten die bekannten Regeln: mit der 6 raus, nach einer 6 nochmal, drei Versuche, wenn keine Figur draußen ist, Startfeld frei machen, im Ziel nicht überspringen. Gibt es nur einen möglichen Zug, macht ihn das Spiel gleich selbst
- Das Spiel wählt der Gastgeber am Regal oder direkt am Brett. Leere Stühle übernehmen Bots, bei Mensch ärgere dich nicht kann ein Stuhl auch leer bleiben
- Neu am Tisch: Zeichen-Hochstapler für 3 bis 6. Alle bekommen dasselbe Wort, nur einer nicht: Er kennt bloß die Kategorie und muss so tun, als wüsste er es
- Auf einem großen Blatt in der Tischmitte zeichnet reihum jeder einen einzigen Strich, ohne abzusetzen, zwei Runden lang. Die anderen sehen die Linie live entstehen, ein Buntstift in deiner Farbe folgt ihr
- Danach verdächtigt jeder jemanden über das Schild am Kopf. Wird der Hochstapler mit Mehrheit erwischt, darf er das Wort raten und gewinnt trotzdem, wenn er trifft
- Oben steht immer dein Wort oder deine Rolle, unten läuft die Zeit für Strich, Abstimmung und Raten mit. Am Ende wird aufgedeckt, wer es war und wie das Wort hieß

## Seed Runners: Lauflinie in den Rennen
- Zufallsrunden in der Lobby bauen jetzt Level aus Strecken mit vollem Schwung: Hüpfketten über Säulen, Stachelläufe, Wandkehren, Kristallflüge, Kamine und Fallschächte. Du läufst durch, statt vor jedem Sprung stehen zu bleiben
- Neu in diesen Leveln: Boost-Streifen, die dich auf mehr als doppeltes Tempo schießen, steigende Lava im Kamin und eine Wand, die dich durch eine Strecke jagt. Manche Level wenden und führen eine Etage höher oder tiefer zurück
- Ein Level entsteht in wenigen Sekunden. Im Ergebnis steht seine Form, etwa „Aufstieg · Lauflinie“
- Das Tagesrennen wechselt am 20. November auf die neuen Level. Frühere Tagesrennen, Favoriten und geteilte Seeds bleiben genau so, wie sie waren

## Giveaways
- Bei Giveaways machst du jetzt auf drei Wegen mit: hier auf der Website, im Twitch-Chat mit einem Stichwort wie !giveaway oder im Discord mit dem Knopf unter dem Giveaway-Beitrag. Der Bot sagt im Chat, wer neu dabei ist
- Bedingungen gibt es jetzt mehr: dem Kanal folgen, auf dem Discord-Server sein oder bei einer Zahl von Streams in den letzten 30 Tagen dabei gewesen sein. Angemeldet siehst du bei jedem Giveaway, welche du schon erfüllst und was noch fehlt, etwa mit einem Knopf zum Verbinden deines Discord-Kontos
- Gezogen wird live im Stream: Erst laufen die Namen der Teilnehmer durch, dann stehen die Gewinner im Bild. Wer gewinnt, bekommt eine Nachricht im Discord, in der Glocke und auf Wunsch aufs Handy
- Die Giveaway-Seite gibt es jetzt auch auf Englisch

## Streamer-Tools
- Neu in den Twitch-Overlays: der Subathon-Timer. Ein Countdown, den Abos, Geschenk-Abos und Bits von selbst verlängern. Wie viel Zeit jede Art bringt, legst du fest, etwa 5 Minuten je Abo, mehr für Stufe 2 und 3 und eine Minute je 100 Bits. Neue Zeit springt kurz als „+5:00“ neben der Uhr auf, darunter steht, wer zuletzt verlängert hat
- Spenden trägst du im Editor ein. Dort gibst du auch Zeit von Hand dazu oder ziehst sie ab, hältst den Timer an und lässt ihn weiterlaufen. Auf Wunsch gibt es eine Obergrenze für die Gesamtdauer, und ein Verlauf zeigt jede einzelne Verlängerung
- Im Chat nennt !subathon allen die Restzeit. Deine Mods steuern den Timer mit Befehlen wie !subathon +10m, !subathon spende 10 Name oder !subathon pause. Der Stand bleibt erhalten, auch wenn dein Subathon über Tage läuft. Den Timer gibt es auf Deutsch und Englisch, und er läuft in derselben OBS-Quelle wie die übrigen Overlays
- Win Tracker, Win Challenge und die Twitch-Overlays haben jetzt je eine eigene Seite zum Teilen, etwa in Streamer-Discords: Das echte Overlay läuft dort mit Beispieldaten, darunter stehen die Funktionen, die Einrichtung in drei Schritten und häufige Fragen. Alle drei gibt es auf Deutsch und Englisch, zu finden unter „Für Streamer“ bei „Die Werkzeuge im Detail“
- Neu: die Streamer-Zentrale. Sie zeigt alle deine Werkzeuge auf einen Blick: Twitch-Overlays, Win Challenge, Win Tracker, Viewer Games, Bingo und Discord-Bot. Du siehst, welche OBS-Quelle gerade läuft oder wann sie zuletzt da war und was noch fehlt, etwa ein nicht verbundener Kanal oder ein fehlendes Twitch-Recht. Den OBS-Link kopierst du direkt von dort. Du findest sie unter „Für Streamer“ und im Werkzeug-Menü ganz oben
- Für dein erstes Overlay führt dich ein Assistent durch drei Schritte: anmelden, Overlay wählen, Link in OBS einfügen. Sobald deine OBS-Quelle läuft, zeigt er einen Haken — so weißt du sofort, dass alles verbunden ist
- OBS per Knopfdruck: Verbinde die Streamer-Zentrale einmal mit OBS (in OBS unter Werkzeuge → WebSocket-Server-Einstellungen), dann legt „In OBS anlegen“ die Browserquelle für Twitch-Overlays, Win Challenge, Win Tracker oder Viewer Games direkt in der gewählten Szene an, gleich in der passenden Größe. Kein Link-Kopieren mehr
- Hast du einen Overlay-Link neu erzeugt, erkennt die Zentrale die veraltete Quelle in OBS und bringt sie mit „In OBS aktualisieren“ auf den neuen Stand. Deine eigene Größe und Position in OBS bleiben dabei erhalten. Das OBS-Passwort bleibt in deinem Browser und geht nie an die Website; auf Wunsch merkt sich die Zentrale es auf diesem Gerät und verbindet sich beim nächsten Mal von selbst
- Neu in der Overlay-Galerie: Looks von Streamern. Unter „Von Streamern“ teilst du deinen eigenen Look für Win Challenge, Win Tracker oder die Twitch-Overlays mit einem Namen, und andere übernehmen ihn mit einem Klick. Geteilt wird nur das Aussehen — deine Challenges, Accounts, Texte und die Größe im Stream bleiben bei dir. Jede Vorlage zeigt das echte Overlay als Vorschau und wie oft sie schon übernommen wurde, sortiert nach „Beliebt“ oder „Neu“
- Eigene Vorlagen kannst du jederzeit wieder löschen. Passt eine Vorlage nicht in die Galerie, kannst du sie melden — sie wird dann geprüft und bei Bedarf entfernt
- Vorschau auf das kommende Abo der Twitch-Overlays: Neben den Szenen kommen drei Extras dazu. Eine eigene Schrift für alle Karten, zehn zur Auswahl. Eigene Töne und Bilder für jede Alert-Art, auch GIFs. Und die Happy Hour im Subathon: Für eine Zeit, die du festlegst, zählen Abos, Bits und Spenden doppelt oder dreifach, mit Band und Restzeit im Overlay. Im Editor sind die Extras schon zu sehen und mit „Abo“ markiert

## Discord-Bot
- Der Discord-Bot hat eine eigene Seite: Dort steht, was er kann, mit einem Beispiel, wie er in deinem Server schreibt, der Einrichtung in drei Schritten und häufigen Fragen. Mit „Zu Discord hinzufügen“ holst du ihn direkt auf deinen Server. Die Seite gibt es auf Deutsch und Englisch, zu finden unter „Für Streamer“ bei „Die Werkzeuge im Detail“
- Für das Dashboard brauchst du kein Twitch mehr: Melde dich mit Discord an oder als Gast
- Fügst du den Bot einem Server hinzu, meldet er sich dort mit einer kurzen Anleitung und einem Knopf, der das Dashboard mit genau diesem Server öffnet. Er schreibt gleich in der Sprache deines Servers. Lädst du ihn aus dem Dashboard ein, öffnet sich der Server dort von selbst, sobald der Bot angekommen ist
- Neu unter „Allgemein“: der Einrichtungs-Check. Er zeigt, wo dem Bot ein Recht fehlt — etwa in einem Kanal, den er nicht sehen darf, oder bei einer Rolle, die über seiner eigenen steht — und führt mit einem Klick dorthin. Daneben zeigen „Erste Schritte“ die beliebtesten Bereiche mit Haken
- Beim Einladen fragt der Bot nur noch die Rechte an, die seine Funktionen brauchen, statt Administrator-Rechte
- Der Bot spricht jetzt ganz Englisch, wenn du ihn auf Englisch stellst, auch bei den Spaß-Befehlen wie /ship, /coinflip oder der magischen Miesmuschel. Die Beschreibungen der Befehle zeigt Discord in der Sprache deiner App, in einer englischen App heißen deutsche Befehle wie /punkte dann /points
- Die frechen Antworten von /superkraft und /ausrede kommen nur noch in Kanälen, die in Discord als „ab 18“ markiert sind

## Abo und Unterstützen
- Das Abo der Twitch-Overlays ist da: Für 4 € im Monat schaltest du Hype Train, Raid-Ansturm, Flugzeug und Murmelbahn frei, dazu eigene Töne und Bilder für jede Alert-Art, eine eigene Schrift und die Happy Hour im Subathon. Abschließen kannst du es im Twitch-Dashboard oder in deinem Profil
- Dein Abo verwaltest du im Profil: Zahlungsart ändern, Rechnungen ansehen oder kündigen. Unten auf jeder Seite führt „Abo kündigen“ direkt dorthin
- Bekommst du das Abo geschenkt, etwa als Gewinn, steht es in deiner Glocke, mit dem Datum, bis wann es gilt
- Neu: die Seite „Unterstützen“. Mit einem einmaligen Betrag hilfst du der Website und bekommst das Abzeichen „Unterstützer“ für deine Visitenkarte. Auf Wunsch steht dein Name in der Dankesliste
- Auf derselben Seite gibt es die ersten Designs für die Spiele, je 1,99 €. Sie ändern nur das Aussehen, nie das Spiel: Pizza- und Sushi-Scheiben für Flick Soccer, Königskrone und Krake für deinen Blob in Worldflip und am Spieleabend, Sonnenbrille und Strohhut in Blobby Volley, Erdbeermütze und Imkerhut für deine Figur auf der Farm. Die anderen sehen sie online mit
- Gekaufte Designs hängen an deinem Konto und stehen danach im jeweiligen Spiel zur Auswahl: in Flick Soccer im Profil unter Designs, in Worldflip und am Spieleabend beim Hut, in Blobby Volley im Menü unter deinem Namen, auf der Farm im Gold-Shop bei den Hüten
- Nach dem Kauf führt dich die Glocke direkt ins Spiel und sagt, wo du dein Design auswählst. Im Profil stehen unter „Unterstützen“ alle deine Designs mit dem Weg ins jeweilige Spiel
- Impressum, Datenschutz, AGB und Widerrufsrecht findest du jetzt unten auf jeder Seite

## Worldflip: Mitten in der Welt
- Du sitzt jetzt mitten in der Welt, die gerade gilt, statt zwischen allen vier. Die Welten sind ruhiger gestaltet, damit du dich aufs Spiel konzentrieren kannst, und beim Wechsel stehst du sofort in der neuen Welt, ohne Abblenden
- Tisch und Karten in der Mitte sind größer
- Oben in der Mitte zeigen vier Türme die Ladung der Welten. Links daneben steht das Gesetz der aktuellen Welt, das immer gilt, rechts das Ereignis, das bei voller Ladung kommt
- Lässt eine Karte auf deiner Hand eine Welt ausbrechen, trägt sie oben ein Zeichen in der Farbe dieser Welt. Fährst du mit dem Zeiger darüber, steht dort auch, welches Ereignis kommt
- Eine Welt bricht jetzt erst bei 5 Ladung aus statt bei 4. Karten, die immer passen (Portal, Finsternis, Zünder, Spiegel), laden keine Welt mehr auf
- Der Meteor lässt nur noch 3 Karten ziehen, aussetzen musst du nicht mehr
- Neue Einstellung „Ziehen: Bis es passt“: Du ziehst so lange, bis eine passende Karte dabei ist. Gibt es gegen Bots und in Online-Räumen
- Nach Effekten geht es schneller weiter, auch die Bots sind danach schneller wieder am Zug

## Dein Fortschritt am Konto
- Bist du angemeldet, egal ob mit Twitch, Discord oder als Gast, speichern Flick Soccer, Lights Out, Blobby Volley, Worldflip, Sacrifice & Sigils, der Spieleabend und Seed Runners deinen Fortschritt jetzt an deinem Konto. Auf einem anderen Gerät oder Browser geht es genau dort weiter
- Was du schon vorher gespielt hast, geht nicht verloren: Bei der ersten Anmeldung wird dein bisheriger Stand übernommen. Hast du auf zwei Geräten gespielt, bleibt von beiden alles erhalten, was du freigeschaltet hast
- Jede Partie bringt Erfahrungspunkte für deine Website-Stufe, auch adVentures-Läufe. Im Profil siehst du deine Stufe und wie viel jedes Spiel dazu beigetragen hat
- Neue Abzeichen aus den Spielen, zum Beispiel „Hattrick“ in Flick Soccer, „Entkommen“ in Lights Out, „König des Strandes“ in Blobby Volley, „Drachentöter“ in adVentures oder „Hochstapler“ am Spieleabend. Bestwerte wie deine schnellste Flucht aus Lights Out oder deine Höchstpunkte in adVentures erscheinen auf deiner Visitenkarte

## Ergebnisse teilen
- Nach einer gewonnenen Partie gibt es jetzt den Knopf „Ergebnis teilen“: Er macht ein Bild im Hochformat für deine Story, deinen Status oder Discord, im Look des jeweiligen Spiels mit Spielszene, deinem Ergebnis und den wichtigsten Zahlen
- Dabei sind Lights Out (deine Zeit für alle Ebenen), das Seed-Runners-Tagesrennen (Zeit, Platz und ein farbiges Feld je Abschnitt), adVentures (besiegte Gegner, Zeit, Welten oder Tiefe), Worldflip, Flick Soccer, Blobby Volley (auch als König des Strandes), Sacrifice & Sigils (Duell und Moorwanderung) und der Spieleabend
- Vor dem Teilen siehst du das Bild genau so, wie es verschickt wird. Am Handy teilst du es direkt in deine Apps, am Rechner speicherst oder kopierst du es und fügst es zum Beispiel in Discord ein. „Text kopieren“ gibt dir dazu eine Zeile mit Link, der direkt ins Spiel führt

## Weitere Neuerungen
- Win Tracker: „Session zurücksetzen“ setzt jetzt auch in Classic, Grand und 20-Win-Challenge den Run auf 0 zurück. Bisher blieb ein angefangener Run stehen, etwa wenn seine letzte Niederlage nie im Overlay ankam. In der Crown Series bleibt dein Lauf erhalten, weil dort der echte Stand aus dem Spiel kommt
- Win Tracker: Classic-, Grand- und 20-Win-Challenge übernehmen jetzt deine Siege direkt aus dem Spiel, statt selbst mitzuzählen. Startest du das Overlay mitten in einem Run oder fehlt ein Match, stimmt der Stand trotzdem, spätestens nach dem nächsten Kampf
- Datenschutzerklärung: Die Angabe, woher die Clash-Royale-Bilder kommen, ist jetzt richtig. Kartenbilder lädt dein Browser von Supercell, alle anderen Symbole kommen von unserem eigenen Server
