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

## Virtual Farm: faires Spiel
- Rucksack-Ausbauten ab Stufe 30 geben jetzt wirklich zusätzliche Plätze. Vorher brachten sie trotz Bezahlung nichts mehr.
- Eier, Brutkasten und Schlüpfen laufen jetzt komplett über den Server. Gekaufte Eier und geschlüpfte Tiere können nicht mehr verloren gehen, und niemand kann sich Tiere oder Eier erschummeln.
- Samen, Felder, Tiere und Wetter-Effekte sind gegen Schummeln geschützt. So bleiben Ranglisten und Erntefest fair.
- Pro Gerät ist nur noch eine Farm spielbar, und zwischen Accounts vom selben Internet-Anschluss gibt es keine Post mehr. Zweit-Accounts bringen damit keinen Vorteil.
- Per Post erhaltenes Gold zählt nicht mehr zum „insgesamt gesammelten Gold“, nur selbst Verdientes.

## Virtual Farm: Neue Saat
- Neu: die „Neue Saat“. Ab Level 100 und mit genug verdientem Gold (beim ersten Mal 750 Milliarden) kannst du deine Farm neu anfangen und bekommst dafür für immer einen Stern. Zu finden im Profil.
- Jeder Stern bringt dauerhaft +10 % Gold beim Verkaufen und +10 % Erfahrung beim Ernten, bis zu fünf Sterne. Jede weitere Neue Saat braucht doppelt so viel verdientes Gold wie die vorige.
- Dabei werden Gold, Level, Fähigkeiten, Felder, Rucksack, Samen, Ernte, Kiste, Vitrine und Werkzeuge zurückgesetzt. Logbuch, Zuchtbuch, Tiere, Eier, Deko, Umkleide, Gold-Shop-Käufe und deine Wettbewerbs-Siege bleiben.
- Sterne sieht man: ein Stern am Namen, ab zwei Sternen ein goldener Name, ab drei eine Sternenspur beim Laufen, ab vier goldene Ernte-Funken und mit fünf der Titel „Sternengärtner“.
- Die Bestenliste im Menü sortiert jetzt zuerst nach Sternen. Wer neu anfängt, fällt also nicht nach unten.
- Die Mondblume bringt beim Verkauf etwas weniger (115 bis 320 statt 134 bis 402 Milliarden). Sie hat bisher allein rund ein Drittel allen Goldes eingebracht.

## Virtual Farm: Saisonziele und Bestenlisten
- Neu: Saisonziele. Jede Jahreszeit hat vier Ziele, zum Beispiel Saisonsorten ernten, Käfer fangen oder gefragte Früchte verkaufen. Du findest sie im Missionsbrett unter „Jahreszeit“.
- Wer alle vier schafft, bekommt das Namensschild der Jahreszeit: Kirschblüte, Sonnenglut, Laubgold oder Raureif. Mit allen vier gibt es zusätzlich „Jahreskreis“. Diese Schilder kann man nicht kaufen, ausrüsten kannst du sie im Gold-Shop.
- Die Bestenliste im Hauptmenü hat jetzt vier Reiter: Gold, Logbuch (komplette Seiten), Siege (Wochenwettbewerb) und Saison (geschaffte Saisonziele).
- Im Profil zeigt eine neue Übersicht „Sammlung“, wie weit du bei Logbuch-Seiten, Kreuzungen und Jahreszeiten-Namensschildern bist.
- Das Missionsbrett ist etwas breiter, damit alle Reiter in eine Zeile passen.

## Virtual Farm: Level 100 und Vielfalt-Bonus
- Das Höchstlevel steigt von 50 auf 100. Ab Level 52 gibt es drei neue Fähigkeiten: Sortenkenner (stärkerer Vielfalt-Bonus), Auftragsprofi (mehr Gold für Händler-Aufträge) und Festkomitee (größere Erntefest-Belohnung).
- Neu: der Vielfalt-Bonus. Je mehr verschiedene Sorten auf deinem Acker stehen (bis zu drei je Seltenheit), desto mehr bringt jede Ernte, bis zu +32 %. Den aktuellen Bonus siehst du oben rechts unter „Vielfalt“.
- Belohnungen von Missionen, Erntefest und Händler-Aufträgen wachsen ab Level 50 nicht mehr weiter mit dem Level.

## Virtual Farm: besseres Schnell-Ernten
- Beim Ernten mit gedrückter Shift-Taste reagiert jedes Feld sofort, sobald du darüber fährst: ein kurzer Ton, ein kleiner Funkenstoß, und die Frucht fliegt los. Vorher passierte beim Drüberziehen erst einmal nichts.
- Neuer Ernte-Ton: Erntest du schnell hintereinander, steigt er mit jedem Feld eine Stufe höher. Töne schneiden sich nicht mehr gegenseitig ab, ein Zug über das ganze Feld klingt jetzt wie eine kleine Melodie.
- Während du mit Shift über den Acker ziehst, verdeckt die Pflanzen-Infokarte nichts mehr.
- Neu: Käfer und Unkraut. Während du erntest, setzt sich ab und zu ein Käfer auf eine Pflanze oder Unkraut wächst auf einem freien Feld. Klick sie weg (oder zieh mit Shift drüber) und du bekommst etwas Gold. Ignorierst du sie, passiert nichts — sie verschwinden nach einer Weile von selbst.
- Neu: das Zuchtbuch. Kreuzungen, die du noch nicht gefunden hast, stehen im Logbuch nur als Umriss mit Hinweisen auf ihre Elternsorten. Erntest du eine Elternsorte 25-mal, zeigt sie sich. Nach deiner ersten gelungenen Kreuzung steht das ganze Rezept da. Kreuzungen, die du schon kennst, bleiben aufgedeckt.
- Neu: gefragte Sorten am Markt. Jede volle Stunde sind drei bis vier Sorten besonders gefragt und bringen beim Verkaufen 20 bis 50 % mehr. Welche gerade dran sind, siehst du oben rechts unter „Markt gefragt“. Alle anderen Sorten bringen weiter den normalen Preis.
- Neu: der Wochenwettbewerb „Rekord-Ernte der Woche“. Jede Woche gibt es eine Sorte, und wer das größte Stück davon erntet, gewinnt. Rangliste und Preise findest du im Missionsbrett unter „Wettbewerb“, die besten drei bekommen nach Wochenende Gold und ein Abzeichen im Profil.
- Früchte haben jetzt eine genauere Größe von 1,0 bis 100,0, zum Beispiel 85,8. So steht im Wochenwettbewerb fast nie Gleichstand. Eine glatte 100,0 ist sehr selten, etwa einmal in 13.500 Ernten. Was eine Frucht beim Verkauf bringt, ändert sich dadurch nicht, und alte Früchte werden auf die neue Skala umgerechnet.
- Im Logbuch heißen die beiden Größen-Ausprägungen jetzt „Winzling“ (unter Größe 2) und „Riese“ (ab Größe 99). Wer sie schon hatte, behält sie.
- Im Hinweis zur Jahreszeit und in der Meldung beim Saisonwechsel stehen jetzt die richtigen Sortennamen statt interner Bezeichnungen.
- Neu: der Ernte-Rausch. Wer dranbleibt und regelmäßig erntet (spätestens jede Minute), baut ihn auf — nach zehn Minuten bringt jede Ernte +15 % mehr Gold. Machst du länger Pause, sinkt er langsam wieder. Den Stand siehst du oben rechts als Balken.

## Virtual Farm: neues Hauptmenü und neuer Ladebildschirm
- Das Hauptmenü ist aufgeräumt: Spielen und Bestenliste stehen nebeneinander auf einer Höhe, die Bestenliste zeigt jetzt alle zehn Plätze und hebt deinen eigenen Eintrag hervor.
- Wer noch nicht angemeldet ist, sieht alles Wichtige auf einen Blick, ohne scrollen zu müssen.
- Der Ladebildschirm passt jetzt zum Menü: dieselbe Wiese, ein gut lesbarer Fortschrittsbalken, verständliche Statustexte und wechselnde Spieltipps.

## Virtual Farm: aufgeräumte Fenster
- Alle Fenster haben jetzt denselben Aufbau: Läden, Mülleimer und Gold-Shop zeigen ihre Einträge in einheitlichen Zeilen, Preis rechts, Nebenknöpfe wie „Alle“ oder „×10“ immer links vom grünen Kaufen-Knopf.
- Der Deko-Shop zeigt seine Stücke in einer Liste wie die anderen Läden, mit denselben Reitern oben. Auch Kiste und Vitrine haben jetzt diese Reiter.
- Fenster haben nur noch drei feste Breiten, statt dass jedes etwas anders breit ist.
- Hinter einem offenen Fenster wird das Spiel nur noch abgedunkelt statt verschwommen, und der Schließen-Knopf wackelt beim Drüberfahren nicht mehr.
- Die Anzeige oben rechts ist geordnet: erst die Knöpfe (Briefkasten, Gold-Shop, Tiere, Chat), darunter eine Tafel mit Uhrzeit, Jahreszeit, Wetter und deinem Vielfalt-Bonus.

## Virtual Farm: neue Bilder
- Alle acht Kreuzungen haben jetzt eigene Bilder: die Pflanze bzw. Frucht auf dem Acker, eine eigene Samentüte im Rucksack und eigene Samen auf dem Acker. Vorher fehlten sie ganz.
- Phönix, Tiger, Waschbär und Ziege laufen jetzt sichtbar über den Hof, und im Rucksack und Brutkasten haben alle Tiere wieder ihr Bild. Vorher fehlten diese Bilder.
