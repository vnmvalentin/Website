// data/changelogEntries.js
// Reine Textdaten fuer das Changelog-Modal in GameContainer.jsx — rausgezogen
// (Sept. 2026), weil GameContainer.jsx dadurch Babels 500-KB-Warnung ausloeste.
// Kein Verhalten hier, nur die Liste selbst.

// Changelog als Daten statt als handgebautes JSX — neue Einträge sind ein Objekt,
// kein weiterer verschachtelter Block.
export const CHANGELOG_ENTRIES = [
    {
        version: "v4.8",
        title: "Gold-Shop, Chat-Ausbau und der Ernte-Bug endlich gefunden",
        groups: [
            {
                heading: "Behoben",
                items: [
                    "Auf der eigenen Ernte schlug Ernten manchmal mit „Keine reife Frucht“ fehl, obwohl sichtbar reif — Browser und Server sagten die erste Reifezeit eines Dauerträgers unabhängig voneinander vorher (zwei echte Zufallszahlen für dasselbe Ereignis), und die Gießkanne speicherte nicht schnell genug, bevor geerntet wurde. Beide Stellen behoben.",
                    "Ein Shift-Klick auf eine reife Mehrfach-Frucht-Staude (z. B. Bohne) konnte zwei Ernte-Anfragen gleichzeitig auslösen — die zweite überschrieb einen schon geleerten Fruchtstand wieder mit dem alten Stand. Ergebnis: Frucht, die trotz Erntesound einfach hängen blieb und beim nächsten Klick nichts mehr hergab. Der Browser feuert nach jedem Klick automatisch noch ein zweites, überflüssiges Ereignis — das wird jetzt abgefangen.",
                    "Das Chat-Fenster ragte rechts aus dem Bildschirm, statt an seinem Knopf zu bleiben.",
                ],
            },
            {
                heading: "Neu: Gold-Shop",
                items: [
                    "Rein kosmetischer Shop für Schuppen-, Briefkasten- und Namensschild-Reskins — teuer, weil sie nichts als den Look ändern. Erreichbar über den neuen Knopf im HUD.",
                    "Einmal gekauft, kein Weg mehr zurück? Jede Kategorie hat jetzt einen kostenlosen „Standard“-Eintrag, der jederzeit zurückholt.",
                    "Eigene Icons statt Platzhalter, Kataloge nach Preis sortiert (teuerstes unten), der leere Werkzeug-Reiter wieder raus.",
                    "Das ausgerüstete Namensschild-Reskin zeigt sich jetzt auch am Schild unter der eigenen Farm, nicht nur über dem Kopf.",
                ],
            },
            {
                heading: "Chat",
                items: [
                    "Eigene Textfarbe wählbar (kleine feste Palette).",
                    "Emoji-Feld mit kuratierter Auswahl.",
                    "Nachrichtentext deutlich größer.",
                ],
            },
            {
                heading: "Welt und Mitspieler",
                items: [
                    "Lobby-Größe von 8 auf 6 Grundstücke (3 oben, 3 unten) — die Shops in der Mitte bleiben dabei zentriert.",
                    "Die Online-Liste zeigt jetzt das eigene Tier-Bild sowie Level und Gold mit Icons statt einer nackten Namensliste.",
                    "Der Countdown im Missionsbrett steht wieder in seiner eigenen Sprechblase und zeigt nur noch den Timer des gerade offenen Tabs (täglich/wöchentlich).",
                ],
            },
            {
                heading: "Deko",
                items: [
                    "Fünf neue Stücke: Kirschblütenbaum, Tulpenbeet, Heuballen, Vogelscheuche, Sonnenschirm.",
                ],
            },
            {
                heading: "Tiere",
                items: [
                    "Brutzeiten im Inkubator kräftig angehoben (Common 1 Std. bis Legendary 3 Tage) — vorher lag alles zwischen 2 Minuten und 2 Stunden.",
                ],
            },
        ],
    },
    {
        version: "v4.7",
        title: "Einrichten überarbeitet: Laternen, Bodenbeläge, Sichtbarkeit",
        groups: [
            {
                heading: "Behoben",
                items: [
                    "Hohe Deko (z. B. eine Laterne) ließ sich nicht setzen, sobald irgendetwas über der Ankerkachel stand — selbst wenn die Ankerkachel selbst frei war. Geprüft wird jetzt wie beim Acker-Rand nur noch die Ankerreihe.",
                    "Die letzte Bodenplatte eines Stapels wurde manchmal sofort wieder eingepackt, statt liegen zu bleiben: der automatische Klick, der nach dem Ziehen hinterherkommt, traf auf einen inzwischen leeren Vorrat und landete im „Deko aufheben\"-Zweig. Dieser Nachlaufklick wird jetzt erkannt und übersprungen.",
                    "Deko, die anderen Spielern (Feld-Manager, Besucher) auf einem stark dekorierten Grundstück angezeigt wurde, war ab Stück 121 stillschweigend abgeschnitten — sichtbar u. a. als fehlender Pool oder fehlende oberste Zaunreihe bei Freunden, obwohl beim Besitzer alles stand. Das Limit war für ein volles Grundstück (allein ein umlaufender Zaun aus 1×1-Feldern kommt auf über 80 Stück) deutlich zu knapp und ist jetzt großzügiger.",
                    "Laternen (und andere Deko) flackerten und verschwanden beim Herauszoomen, Hineinzoomen oder einfach beim Herumlaufen, obwohl sie eigentlich sichtbar waren. Ursache: das Sichtfenster, das entscheidet, welche Deko überhaupt gezeichnet wird, war fest auf Bildschirmpixel gerechnet statt auf die tatsächlich sichtbare Weltfläche — beim Herauszoomen (mehr Welt pro Bildschirm) blieb es dadurch enger als der wirklich sichtbare Bereich und schnitt Deko am Rand ab.",
                    "Bei vielen Laternen gleichzeitig ging zufällig mal die eine, mal die andere aus (unabhängig davon, wie nah man stand). Es gibt eine Obergrenze für gleichzeitig beleuchtete Laternen — vorher gewann schlicht, wer zuerst in der Liste stand, was je nach Bildausschnitt hin- und herkippte. Jetzt gewinnen immer die dem Spieler nächsten, weiter entfernte blenden sauber aus statt zu flackern.",
                ],
            },
            {
                heading: "Performance",
                items: [
                    "Bodenbeläge (Wege, Pflaster, …) werden jetzt pro Grundstück als fertige Fläche zwischengespeichert und nur bei einer echten Änderung neu gezeichnet, statt jede einzelne Kachel in jedem Bild neu zu zeichnen — bei einem voll gepflasterten Grundstück spürbar weniger Arbeit pro Bild.",
                ],
            },
            {
                heading: "Neu",
                items: [
                    "Bodenbeläge lassen sich jetzt drehen: [R] dreht einen ausgewählten Belag (z. B. den Trampelpfad) um 90°, damit er auch hochkant verlegt werden kann. Bei allem, was kein Belag ist, spiegelt [R] weiterhin wie bisher.",
                ],
            },
            {
                heading: "Editor",
                items: [
                    "Änderungen beim Einrichten (Deko setzen/einpacken, Gebäude umstellen) hingen bisher am allgemeinen 5-Sekunden-Autosave, der bei jeder einzelnen Aktion neu anlief — eine ganze Dekorier-Session konnte dadurch lange ungesichert bleiben. Der Editor sichert jetzt zusätzlich sofort beim Verlassen.",
                ],
            },
        ],
    },
    {
        version: "v4.6",
        title: "Zaun als Sichtschutz, neuer Katzengeist",
        groups: [
            {
                heading: "Zaun",
                items: [
                    "Der Spieler stand immer VOR jedem Zaun, auch wenn er eigentlich dahinter lief — bei einer Bank oder Statue war das richtig, bei einem Zaun sah es falsch aus. Zäune verdecken jetzt wie eine Pflanze: wer dahinter läuft, verschwindet auch dahinter.",
                ],
            },
            {
                heading: "Umkleide",
                items: [
                    "Ein neuer, personengebundener Geist ist dazugekommen. Wie beim Admin-Geist: er taucht nur in der Umkleide der einen Person auf, der er gehört, und wird vom Server bei allen anderen abgelehnt.",
                ],
            },
        ],
    },
    {
        version: "v4.5",
        title: "Dauerträger ohne Fehlalarm, Zaunfeld randlos",
        groups: [
            {
                heading: "Behoben",
                items: [
                    "Ein Dauerträger konnte für den Besitzer selbst mit „Noch nicht reif.“ abgelehnt werden, obwohl die Frucht sichtbar reif war — und auf demselben Feld für einen Feld-Manager sofort klappte. Ursache: der Browser sagt schon voraus, wann der erste Fruchtstand nach dem Aufwachsen reif wird, der Server würfelt das beim ersten Kontakt unabhängig noch einmal — zwei echte Zufallszahlen für dasselbe Ereignis, die selten genau übereinstimmen. Beide Seiten rechnen jetzt mit demselben, aus der Pflanze selbst abgeleiteten Ergebnis statt mit zwei eigenen Würfeln.",
                    "Eine frisch gepflanzte Pflanze bekam serverseitig nie eine feste Kennung — das Umtopfen per Plant Pot (siehe v4.4) fand deshalb in der Praxis so gut wie nie einen Treffer, sobald zwischen Pflanzen und Umtopfen auch nur ein einziges Neuladen lag (bei Tagen Wachstumszeit praktisch immer). Jede neu gesetzte Pflanze trägt jetzt von Anfang an ihre Kennung.",
                ],
            },
            {
                heading: "Zaunfeld",
                items: [
                    "Stand mit demselben Rand wie jede andere Deko in seiner Kachel (10 %) — dadurch blieb selbst mit dem geraden Zuschnitt von letztem Update noch eine sichtbare Lücke zwischen zwei Feldern. Es füllt seine Kachel jetzt randlos bis an beide Kanten.",
                ],
            },
        ],
    },
    {
        version: "v4.4",
        title: "Umtopfen ohne Reset, schnellerer Deko-Shop",
        groups: [
            {
                heading: "Behoben",
                items: [
                    "Ein Dauerträger, der mit dem Plant Pot umgesetzt wurde, verlor seinen ganzen Fortschritt — ein tragender Baum stand danach wieder als frischer Setzling da. Ursache: der Server erkennt eine Pflanze beim Speichern nur über ihre Zelle wieder, und die ändert sich beim Umtopfen naturgemäß. Er sucht jetzt zusätzlich über die feste Kennung jeder Pflanze weiter, falls die Zelle allein keinen Treffer findet.",
                    "Im Werkzeug-Laden stand mitunter noch „2 verfügbar“, obwohl längst alles vergriffen war und ein Kauf korrekt mit „keine verfügbar“ ablehnte — reiner Anzeigefehler nach einer verlorenen Server-Antwort (z. B. bei wackliger Verbindung), der sich jetzt spätestens beim nächsten Laden-Abgleich von selbst korrigiert.",
                    "Gold über etwa 10 Billionen wurde beim nächsten Speichern still auf diese Marke zurückgestutzt — eine zweite, veraltete Obergrenze in den Routen hatte sich seit Monaten nicht mehr mit der eigentlich gültigen gedeckt.",
                ],
            },
            {
                heading: "Deko-Shop: kleinere Bilder, ein Zaun, der zusammenpasst",
                items: [
                    "Alle Bilder im Deko-Ordner verkleinert (Bildgröße, nicht die Darstellung im Spiel) — zusammen rund 70 % weniger. Auf einem Grundstück mit sehr viel Deko (viele Bäume und Laternen auf den Holzwegen) konnte das beim Betreten spürbar ruckeln.",
                    "Das neue 1×1-Zaunfeld hatte überstehende Querbalken an beiden Enden und passte dadurch nicht sauber aneinander — zurechtgeschnitten, mehrere Felder nebeneinander ergeben jetzt einen durchgehenden Zaun.",
                    "Vier neue Wildblumen-Varianten (ohne Kasten, direkt im Gras) und eine kleine, runde Hecke stehen jetzt im Natur-Reiter.",
                ],
            },
        ],
    },
    {
        version: "v4.3",
        title: "Rucksack ohne Deckel, Wetter für sich allein",
        groups: [
            {
                heading: "Behoben",
                items: [
                    "Das Rucksack-Upgrade ließ sich nur EINMAL pro Zehn-Minuten-Rotation kaufen — obwohl der Preis mit jeder Stufe exponentiell steigt und genau das schon bremst. Wer aufrüsten wollte, musste dafür zehn Minuten pro Stufe warten. Das Limit ist weg, der steigende Preis bleibt die einzige Bremse.",
                    "Wetter und Uhrzeit standen in derselben Box zusammengequetscht, und „Sonne“ wurde als Wetterlage angezeigt — seit es Tag und Nacht gibt, ist das kein Wetter mehr, sondern der neutrale Grundzustand. Die Uhrzeit steht jetzt für sich, das Wetter daneben in einer eigenen Box und nur, wenn wirklich eins aktiv ist.",
                ],
            },
            {
                heading: "Balancing: neue Ziele fürs Lategame",
                items: [
                    "Der Rucksack geht jetzt bis Stufe 50 (550 statt 300 Plätze) statt bis 25. Dieselbe Formel einfach weitergezogen: Stufe 40 kostet rund 821 Mrd, die letzte Stufe rund 42,4 Billionen — vorher war bei rund 2,1 Mrd komplett Schluss.",
                    "Das Legendary Egg kostet jetzt 15 Mrd statt 800 Mio. Bei zweistelligem Milliarden-Einkommen war der alte Preis kaum mehr als Wechselgeld; wer eins kauft, tut es jetzt fürs Götterwesen (1 % Chance) oder den Tierplatz, nicht für eine schnelle Amortisation. Common bis Epic bleiben unverändert.",
                ],
            },
        ],
    },
    {
        version: "v4.2",
        title: "Tag und Nacht, Feld-Manager, Tiere als Boni",
        groups: [
            {
                heading: "Tag und Nacht",
                items: [
                    "Die Welt hat jetzt eine Uhr. Ein voller Tag dauert 24 Minuten — eine Minute ist eine Stunde, und die Uhrzeit steht oben rechts neben dem Wetter.",
                    "Zwischen 20 und 6 Uhr wird es dunkel, die Dämmerung läuft weich über drei Stunden. Alle in derselben Welt sehen dieselbe Tageszeit.",
                    "Damit tun Laternen, Feuerschalen und Kugellampen endlich, wofür sie da sind: sie leuchten jede Nacht, nicht mehr nur bei Mondschein-Wetter.",
                    "Nacht und Wetter verdunkeln nicht mehr doppelt — es zählt der stärkere von beiden. Ein Gewitter um Mitternacht ist dunkel, aber nicht schwarz.",
                ],
            },
            {
                heading: "Partyzeit",
                items: [
                    "Nachts kann eine Party losgehen: Discolaser über der ganzen Welt, eigene Musik und drei Minuten lang die vierfache Chance auf Rainbow.",
                    "Etwa jede dritte Nacht ist eine dabei, immer zur selben Zeit für alle in der Welt.",
                    "Vier Party-Titel wechseln sich ab. Welcher läuft, hängt an der Nacht — alle in der Welt hören denselben.",
                    "Die Partymusik läuft über denselben Regler wie das Thema — was du bei „Musik“ eingestellt hast, gilt auch dafür.",
                    "Dazu Konfetti und Bodennebel: die Laser hingen vorher im Nichts, jetzt ist zu sehen, worin sie leuchten.",
                    "Und die Party wirkt nicht mehr nur auf das, was du WÄHRENDDESSEN pflanzt: alle dreissig Sekunden bekommen auch schon stehende Pflanzen eine Chance, nachträglich Rainbow zu werden — über eine ganze Party rund 5 %. Bei Dauerträgern zählt jeder Fruchtstand für sich.",
                ],
            },
            {
                heading: "Erfahrung hängt jetzt an der Zeit",
                items: [
                    "Vorher zählte allein die Seltenheit. Ein Bambus, der acht Tage auf seiner Kachel steht, brachte damit dieselben 50 XP wie eine Acai-Frucht, die alle 22 Stunden nachwächst — und eine Mondblume mit zwanzig Tagen Wachstum ganze 120.",
                    "Jetzt kommt die Zykluslänge dazu: Bambus 559 XP, Acai 403 XP je Frucht, Mondblume 1.499 XP. Schnelle Sorten bleiben, wo sie waren (Löwenzahn 1 XP).",
                    "Der Zuwachs ist logarithmisch, nicht linear — sonst bekäme die Mondblume das Zweihundertfache eines Kürbisses und der Fähigkeitsbaum wäre mit einem Feld erledigt.",
                    "Was eine Sorte bringt, steht an der Pflanze und in den Details im Samenladen. Die Zahl kommt vom Server, es kann also nichts anderes dastehen als gutgeschrieben wird.",
                ],
            },
            {
                heading: "Admin: Wetter und Party von Hand",
                items: [
                    "Im Admin-Menü steht jetzt oben eine Weltleiste: jede Wetterlage lässt sich für 5 bis 60 Minuten setzen, und eine Party lässt sich jederzeit starten.",
                    "Das gilt für alle in allen Welten, endet von selbst und ist nach einem Serverneustart wieder weg — dann zählt wieder die Uhr.",
                    "Die Spielerliste sortiert Online-Spieler nach oben und zeigt, wie viele es sind. Die Gold-Bedienung sitzt in einem eigenen Kasten, damit man beim schnellen Klicken nicht daneben trifft.",
                    "Ein Punkt am Reiter zeigt, welche Listen dem Server gehören und sofort greifen.",
                ],
            },
            {
                heading: "Zweites Thema zur Auswahl",
                items: [
                    "Neben der bisherigen Farmhymne gibt es „Sunlight on the Barn“. In den Einstellungen unter Audio wählst du, welches der beiden läuft.",
                ],
            },
            {
                heading: "Feld-Manager: andere auf deinem Grundstück arbeiten lassen",
                items: [
                    "Neuer Knopf in der Werkzeugleiste. Trag einen Twitch-Namen ein und häkle an, was derjenige darf: Ernten, Pflanzen, Gießen, Tiere.",
                    "Alles, was ein Helfer bei dir erntet, landet bei DIR — samt Gold und Erfahrung. Er kann nichts verkaufen, nichts aus deiner Kiste nehmen und deine Deko nicht anfassen.",
                    "Was er mitbringt, bleibt seins: sein Samen, seine Gießkanne. Ein Tier, das er bei dir abstellt, arbeitet für dein Grundstück — verkaufen kannst du es nicht, nur zurückgeben.",
                    "Unter „Wo ich helfen darf“ siehst du, wer dich freigeschaltet hat. Dort stehen auch deine Tiere, die gerade auf fremdem Grund arbeiten, samt Knopf zum Zurückholen.",
                    "Auf einem fremden Feld arbeitest du wie auf deinem eigenen: klicken erntet, ein gewählter Samen pflanzt, die Gießkanne gießt.",
                ],
            },
            {
                heading: "Tiere sind jetzt Boni statt einer zweiten Farm",
                items: [
                    "Kein Offline-Verdienst mehr. Tiere arbeiten nur, während du im Spiel bist.",
                    "Der Erntehelfer erntet nicht mehr selbst. Stattdessen hat jede Pflanze, die DU abpflückst, eine Chance auf ein zweites Stück — bis zu 25 % auf Stufe 5, zusätzlich zu „Reiche Ernte“.",
                    "Warum: ein Stufe-5-Helfer hat über Nacht das ganze Feld abgeräumt und verkauft. Wer morgens einloggte, hatte nichts mehr zu tun — belohnt wurde das Wegbleiben.",
                    "Goldfinder und Gärtner arbeiten wie gehabt, nur eben online: Gold im Hintergrund, kostenloser Nachwuchs und schnelleres Wachstum.",
                    "Gleiche Fähigkeiten stapeln nicht — es zählt die höchste platzierte Stufe. Drei verschiedene Tiere bringen mehr als drei gleiche.",
                    "In der Tierliste oben rechts steht jetzt „Aktive Boni“: was deine drei Fähigkeiten gerade konkret bringen, in Zahlen.",
                ],
            },
            {
                heading: "Drei Tierplätze statt sechs",
                items: [
                    "Die drei kaufbaren Plätze sind weg. Seit nur die höchste Stufe je Fähigkeit zählt, hatten sie genau eine Wirkung übrig: mehr Goldfinder nebeneinander — also wieder „mehr Tiere = mehr passives Einkommen“, das wir gerade abgeschafft haben.",
                    "Drei Fähigkeiten, drei Plätze. Die Regel erklärt sich damit von selbst.",
                    "Das Gold für gekaufte Plätze bekommst du vollständig zurück (150 Mio, 600 Mio und 1,8 Mrd), und was über drei Tiere hinaus stand, liegt wieder in deinem Rucksack. Verliehene Tiere gehen an ihren Eigentümer zurück.",
                ],
            },
            {
                heading: "Züchter wirkt wieder auf alle Tiere",
                items: [
                    "Der Skill hieß „Deine Tiere lösen ihre Fähigkeit häufiger aus“ — und traf damit seit dem Umbau nur noch den Goldfinder, weil die anderen beiden gar nicht mehr ticken.",
                    "Jetzt ist es ein Aufschlag auf alle drei: mehr Gold, höhere Chance auf das zweite Erntestück, mehr Nachwuchs und schnelleres Wachstum. Voll ausgebaut sind das +32 %.",
                    "Der Nachwuchs des Gärtners ist bei 80 % gedeckelt. Bei 100 % wüchse eine Einmalernte immer von selbst nach und wäre damit dasselbe wie ein Dauerträger.",
                ],
            },
            {
                heading: "Acker und Deko liegen im selben Raster",
                items: [
                    "Der Acker sass eine halbe Kachel neben dem Dekoraster. Deshalb blieb neben ihm ein halbes Grasfeld stehen, und Deko auf dem Holzweg stand grundsätzlich einen halben Schritt daneben.",
                    "Jetzt fallen beide Raster zusammen. Pflanzen und freigelegte Felder ziehen mit, Deko bleibt liegen — es geht nichts verloren.",
                    "Und die Holzwege im Acker darf man ab sofort schmücken: pflanzen kann man dort ohnehin nicht.",
                ],
            },
            {
                heading: "Kleinigkeiten",
                items: [
                    "An jeder Pflanze steht jetzt, wie viel Erfahrung sie bringt — in der Hover-Karte auf dem Acker und in den Details im Samenladen. Die Zahl kommt vom Server, es kann also nichts anderes dastehen als gutgeschrieben wird.",
                    "Der Holzbogen ist einen Schritt breit statt zwei. Gezeichnet wird er unverändert groß, aber er lässt sich jetzt genau auf die Mittelachse deines Grundstücks setzen — mit zwei Kacheln Fußabdruck rastete er zwangsläufig auf eine Kachelgrenze und stand immer einen halben Schritt daneben. Bereits aufgestellte Bögen behalten ihren alten Platz, bis du sie einmal aufhebst und neu setzt.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Gekauftes Werkzeug konnte verlorengehen — „zehn Gießkannen gekauft, sechs bekommen“, und nach dem Deploy waren bei manchen die Pflanztöpfe weg. Ursache war die Aufteilung: das Gold gehörte dem Server, das Gekaufte dem Browser. Zwischen „bezahlt“ und „gespeichert“ lag eine Lücke, und jeder Weg, der den Browserstand verwirft — Nachladen nach einem Konflikt, eine Umstellung beim Deploy, ein zweiter Tab — fiel genau hinein.",
                    "Der Werkzeugkasten gehört jetzt dem Server. Kaufen und Verbrauchen sind je ein einziger Schritt: entweder Gold weg UND Werkzeug da, oder gar nichts. Ein Kauf überlebt damit auch ein sofortiges Neuladen.",
                    "Nebenbei geschlossen: Preise und Bestände im Werkzeugladen rechnete bisher der Browser. Nach einem Nachladen wich seine Rechnung mitunter vom Server ab — dann verschwand der Kaufknopf oder der Kauf schlug still fehl.",
                    "Wetter-Effekte verschwanden nach jedem Serverneustart und nur Golden und Rainbow blieben übrig. Ursache war eine alte Umstellung, die bei jedem Start über jede Pflanze geschrieben hat — sie machte reife Pflanzen wieder unreif, während die Wetter-Uhr weiterlief. Die Umstellung ist gestrichen, und die Uhr ruht jetzt, solange nichts reif ist.",
                    "Dieselbe Umstellung hat auch jedes Gießen beim nächsten Neustart wieder rückgängig gemacht. Auch das ist weg.",
                    "Der Samenladen zeigte für neun Sorten größere Vorräte an, als der Server führte. Der Frontend-Katalog wird jetzt aus dem Server-Katalog erzeugt statt danebengepflegt.",
                    "Die Hintergrundmusik lief gar nicht mehr — die Datei war beim Umsortieren verschoben worden.",
                    "Im Deko-Shop sprang beim Kategoriewechsel das ganze Fenster. Die Reiter stehen jetzt fest und das Fenster behält seine Höhe.",
                    "Auf der Farm stand „Home“ im Browser-Reiter. Die Seite bringt jetzt ihren eigenen Titel mit.",
                    "Der Chat scrollte nicht mehr automatisch mit. Zwei Ursachen: er hörte nur auf die ANZAHL der Zeilen — ab 80 Nachrichten fällt vorne eine heraus, sobald hinten eine dazukommt, und die Anzahl bleibt gleich. Und er scrollte über einen Anker, der die Seite darunter mitzog. Wer hochgescrollt hat, um etwas nachzulesen, wird jetzt übrigens nicht mehr weggerissen.",
                    "Im Changelog stand alles gleichrangig untereinander. Die neueste Fassung ist jetzt markiert und offen, die älteren sind zugeklappt.",
                ],
            },
            {
                heading: "Balancing",
                items: [
                    "Die Erscheinungschancen im Samenladen sind um 15 % gesenkt. Der Nachzieh-Zähler fängt Pechsträhnen weiterhin ab: keine Sorte bleibt länger als das Doppelte ihrer erwarteten Wartezeit aus dem Regal.",
                    "Die Stückzahlen im Regal bleiben unverändert — die sind von Hand je Sorte eingestellt.",
                ],
            },
        ],
    },
    {
        version: "v4.1",
        title: "Deko, Bodenbeläge, Licht und ein eigener Samenvorrat",
        groups: [
            {
                heading: "Samenladen: jeder hat wieder seinen eigenen Vorrat",
                items: [
                    "Der gemeinsame Vorrat aus v4.0 ist weg. Es gibt kein Wettrennen mehr: was im Regal steht, steht für JEDEN von euch in dieser Menge da. Niemand kauft dir mehr die letzten zwei Epic-Samen vor der Nase weg.",
                    "Der Vorrat wird trotzdem weiterhin vom SERVER gezählt, nicht vom Browser. Das Loch aus der Zeit davor — beliebig viele Samen über einen veränderten Client — bleibt zu.",
                    "Im Laden steht jetzt „noch X für dich\" statt „X auf Lager\", und wenn dein Kontingent für diese Rotation leer ist, heißt es „Kontingent leer\" statt „Ausverkauft\". Alle fünf Minuten kommt eine neue Rotation und damit ein neues Kontingent.",
                    "Epic und Legendary stehen wieder auf den Werten von vor v4.0. In v4.0 war die Chance je Sorte auf 1 % gefallen und der Vorrat auf 1–2 Stück — ein Epic-Samen war damit im Schnitt alle 44 Minuten überhaupt im Regal, und das für alle zusammen.",
                    "Epic: Chance je Sorte wieder 20 %. In 93 % aller Rotationen steht mindestens eine Epic-Sorte da, meistens zwei bis vier.",
                    "Legendary: Chance je Sorte wieder 5 % — in gut vier von zehn Rotationen ist eine dabei.",
                    "Auch der Vorrat ist der alte: Einmalernten liegen 5–20 Mal im Regal, Dauerträger 1–4 Mal. Das sind im Schnitt 14 Epic-Samen je Rotation für dich statt der 3–4 aus v4.0.",
                    "Common, Uncommon und Rare bleiben, wie sie sind. Die waren nie das Problem.",
                    "Behoben: Nach einem Kauf sprang die Stückzahl kurz auf den alten Wert zurück. Der Laden fragt alle vier Sekunden nach; traf eine Antwort ein, die vor dem Kauf losgeschickt worden war, überschrieb sie die frisch abgezogene Zahl. Solche Nachzügler werden jetzt verworfen.",
                ],
            },
            {
                heading: "Schnellernte",
                items: [
                    "Ernten im Ziehen läuft jetzt über SHIFT: Shift halten, linke Maustaste gedrückt lassen und über den Acker fahren — alles Reife darunter wird geerntet.",
                    "Vorher startete das nur, wenn schon die Kachel unter dem ersten Klick reif war. Wer auf einer leeren Stelle ansetzte und dann über ein volles Feld zog, erntete gar nichts.",
                    "Und umgekehrt: ohne Shift erntet Ziehen nicht mehr versehentlich mit. Ein Klick bleibt ein Klick.",
                    "Wird die Maustaste ausserhalb des Fensters losgelassen, endet der Zug jetzt auch wirklich — vorher lief er weiter, sobald der Zeiger zurückkam.",
                ],
            },
            {
                heading: "Bodenbeläge — die neue Ebene unter allem",
                items: [
                    "Acht Bodentexturen: Rasenstück, Trampelpfad, Kiesboden, Ziegelboden, Kopfsteinpflaster, Holzdielen, Moosplatten und Steinplatten. Sie ersetzen den Untergrund auf ihrer Kachel — aus Wiese wird ein gepflasterter Hof.",
                    "Beläge liegen UNTER allem anderen und belegen die Kachel nicht: auf deine Steinplatten kannst du zusätzlich eine Bank, eine Laterne oder einen Gartenzwerg stellen. Nur Belag verdrängt Belag.",
                    "Gemalt statt geklickt: Maustaste im Einrichtungs-Modus gedrückt halten und über die Fläche ziehen. Ein Hof aus zwanzig Kacheln ist damit eine Bewegung statt zwanzig Klicks.",
                    "Entsprechend billig — 600 bis 2.500 Gold je Kachel — und im Laden mit einem Knopf gleich zehnfach kaufbar.",
                    "Pflasterst du einen alten Belag über, wandert der zurück in den Rucksack. Umgestalten kostet nichts.",
                    "Beläge dürfen auch über den Acker. Gepflanzt wird darauf ganz normal weiter, die Pflanzen liegen darüber.",
                ],
            },
            {
                heading: "Licht",
                items: [
                    "Drei neue Leuchten, die nachts wirklich leuchten. Die Kugellampe deckt bewusst kaum mehr ab als ihre eigene Kachel, die Sternenlaterne reicht gut drei Kacheln weit, die Parklaterne ist mit knapp vier die hellste im Spiel.",
                    "Der Schein sitzt jetzt dort, wo die Leuchte ist: bei den Masten oben am Kopf, bei der Kugellampe knapp über dem Boden, bei der Feuerschale in der Flamme.",
                    "Schwerwiegend behoben: Die Lichtkegel haben ein LOCH in die Zeichenfläche gestanzt statt den Nachtschleier wegzunehmen. Unter jeder Laterne wurde das Bild durchsichtig, und durch das Loch schien der fast schwarze Seitenhintergrund — dazu ein dunkler Ring am Rand des Kegels. Statt beleuchtetem Boden sah man einen grauschwarzen Fleck. Der Schleier entsteht jetzt auf einer eigenen Ebene, in die die Laternen ihr Licht schneiden; darunter bleibt das Grundstück unangetastet sichtbar.",
                ],
            },
            {
                heading: "Neue Deko und ein aufgeräumter Laden",
                items: [
                    "Der Deko-Shop hat jetzt Reiter: Böden, Beleuchtung, Natur, Sitzen & Feuer und Objekte. Mit 32 Stücken war eine einzige Liste nicht mehr zu überblicken.",
                    "Neu dabei: Bistrostuhl, Liegestuhl, Gartenzaun und drei Blumenkästen.",
                    "Der Gartenzaun steht zwei Kacheln breit statt einer hoch — als schmales Türchen sah er albern aus.",
                    "Alle Deko-Bilder sind in Unterordner umgezogen. Bestehende Gärten werden beim Start automatisch mitgezogen; es geht nichts verloren und du musst nichts neu setzen.",
                    "Die Schaufel hebt jetzt zuerst das auf, was OBEN liegt. Steht eine Bank auf deinem Steinweg, bekommst du die Bank und nicht die Platte darunter.",
                ],
            },
            {
                heading: "Admin",
                items: [
                    "Der Streamer trägt ein eigenes Admin-Abzeichen statt des Sub-Sterns. Vergeben wird es vom Server anhand der Twitch-ID, nicht vom Browser — fälschen geht also nicht.",
                    "Behoben: Der Kanalinhaber kann seinen eigenen Kanal nicht abonnieren, galt für das Spiel deshalb als Nicht-Abonnent und ging beim Verkaufsbonus leer aus. Er bekommt die 50 % jetzt wie jeder Sub.",
                    "Der Admin hat eine Shotgun. Trifft sie dich, fliegst du aus der Welt — du kannst sofort wieder beitreten, dein Spielstand wird vorher gesichert. Ist reiner Spaß und kostet dich nichts.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Die Farm liess sich gar nicht mehr öffnen — die Seite brach beim Laden mit einem Fehler ab. Beim Umbau auf den gemeinsamen Ladenbestand war eine Funktion umbenannt worden, an zwei Stellen stand aber noch der alte Name.",
                    "Auf fremden Grundstücken haben Bodenbeläge und aufgestellte Deko jetzt getrennte Obergrenzen. Sonst hätte ein gepflasterter Hof beim Nachbarn dessen Zwerge, Laternen und Teiche aus der Anzeige gedrängt.",
                ],
            },
        ],
    },
    {
        version: "v4.0",
        title: "Wirtschaft, Fähigkeitsbaum, Umkleide und Oberfläche",
        groups: [
            {
                heading: "Pflanzenwerte auf Magic-Garden-Stand",
                items: [
                    "Der Katalog stand schon immer auf den Werten von Magic Garden — bei der Übernahme haben sich aber zwei Fehler eingeschlichen, die jetzt behoben sind.",
                    "Erstens: Magic Gardens Verkaufswert ist der DURCHSCHNITT einer Ernte. Bei uns stand er als Mindestwert, und der Höchstwert lag beim Dreifachen. Weil kleine Größen häufiger sind als große, lag der Schnitt damit 85 % über dem, was er sein sollte — auf jeder einzelnen Sorte. Aus einem Verhältnis von 2,0 wurde so 3,7. Ein Pfirsich bringt jetzt das 1,5-fache seines Saatguts statt des 2,6-fachen.",
                    "Zweitens: Bei Dauerträgern waren Aufbauzeit und Fruchtzyklus vertauscht. Die Bohne baut bei Magic Garden 15 Sekunden auf und trägt dann alle 70 Sekunden nach — bei uns stand es genau andersherum. Dadurch liefen alle Stauden sieben- bis fünfzehnmal zu schnell.",
                    "Damit zahlt sich keine Staude mehr in einem einzigen Zyklus ab. Vorher brachte ein voller Durchgang einer Stachelbeere das Sechsfache des Saatguts — jetzt gut zwei Drittel, wie im Vorbild.",
                    "Die kurzen Sorten am Anfang bleiben kurz: der Löwenzahn wächst weiter in vier Sekunden.",
                ],
            },
            {
                heading: "Fähigkeitsbaum",
                items: [
                    "Jede Karte zeigt jetzt groß, was die Fähigkeit AKTUELL bringt, und daneben den Wert der nächsten Stufe. Bei gestaffelten Fähigkeiten steht die ganze Leiter darunter — man sieht also vorher, dass die Sprünge nach hinten deutlich größer werden.",
                    "Der Baum war nach wenigen Minuten komplett ausgebaut und danach nur noch ein pauschaler Bonus. Er hat jetzt 74 Stufen bei 49 Punkten — du kannst also nie alles nehmen.",
                    "Die stärkeren Fähigkeiten öffnen sich erst, wenn vorher genug verteilt wurde: Lagerist und Wetterfühlig ab 8 vergebenen Punkten, Reiche Ernte und Züchter ab 20, Glückspilz ab 36. Punkte horten und am Stück in eine einzige Fähigkeit kippen geht nicht mehr.",
                    "Auch innerhalb einer Fähigkeit kostet Tiefe Breite: Stufe 2 verlangt 4 insgesamt vergebene Punkte, Stufe 10 dann 36.",
                    "NEU: Die späten Stufen einer Fähigkeit hängen zusätzlich an deinem Charakterlevel — nicht mehr nur die erste. Bisher reichte das Einstiegslevel plus ein Vorrat an Punkten, um eine Fähigkeit sofort bis zum Anschlag zu ziehen. Jetzt zieht sich jede über den halben Levelbereich: Regenmacher 1 / 14 / 27 / 40, Wetterfühlig 10 bis 45 in Fünferschritten, Glückspilz 28 bis 46, Bergmann 1 / 9 / 17 / 25 / 33.",
                    "Der Stufenbalken auf jeder Karte zeigt jetzt mit, wie weit dein Level überhaupt reicht — gesperrte Stufen stehen mit ihrer Levelangabe daneben.",
                    "Wenn du eine Stufe hattest, die dein Level nach der neuen Staffel noch nicht hergibt, wird sie gekürzt und der Punkt kommt zurück in den Vorrat. Verloren geht nichts.",
                    "Zurücksetzen kostet jetzt Gold, und der Preis wächst quadratisch mit den vergebenen Punkten — bei 20 Punkten sind es 80 Millionen. Vorher war es gratis, damit war die Verteilung keine Entscheidung.",
                    "Erfahrung sammelt sich deutlich langsamer: Level 5 kostet 8.000 XP, Level 18 schon 122.400 und Level 50 rund eine Million. Eine gewöhnliche Ernte gibt 1 XP, eine seltene 8.",
                    "WICHTIG: Dein Level sinkt dabei. Die alte Kurve war so flach, dass die XP-Nachzahlung aus dem Logbuch praktisch jeden sofort auf Höchstlevel gebracht hat — mit komplett offenem Fähigkeitsbaum, ohne dass man dafür gespielt hätte. Aus 73.500 XP wird jetzt Level 14 statt Level 50. Deine Erfahrung bleibt dabei vollständig erhalten, sie zählt nur anders.",
                    "Wenn dadurch mehr Punkte vergeben sind, als dein Level hergibt, bekommst du sie alle zurück und kannst neu verteilen. Es geht nichts verloren.",
                    "Die Boni selbst sind kleiner: Händler +20 % statt +25 %, Reiche Ernte +15 %, Glückspilz +10 %. Zusammen mit dem Sub-Bonus kommt der Verkaufsstapel auf gut das Doppelte statt auf das Achtfache.",
                    "Zwei neue Fähigkeiten: Lagerist (mehr Rucksackplätze) und Züchter (Tiere lösen häufiger aus).",
                ],
            },
            {
                heading: "Samenladen: Bestand und Angebot je Sorte",
                items: [
                    "Jede Sorte hat jetzt ihren eigenen Ladenbestand und ihre eigene Erscheinungschance — beides von Magic Garden übernommen. Vorher hing es nur an der Bauart: JEDE Einzelpflanze lag 5–20 Mal im Regal, JEDER Dauerträger 1–4 Mal. Die Mondblume für 50 Milliarden stand damit genauso oft und genauso reichlich da wie ein Löwenzahn für 10.",
                    "Ein paar Beispiele: Löwenzahn 100 % Chance und 6–25 Stück, Pilz-ähnliche Sorten wie Grapefruit nur 10 % Chance, dafür 16–25 Stück, Traube und Kiwi 1 % und genau 1 Stück, Mondblume 0,029 % und 1 Stück.",
                    "WICHTIG: Der Bestand ist ab sofort GLOBAL — und zwar über ALLE Welten hinweg, nicht je Welt. Es gibt genau eine Rotation und genau einen Vorrat je Sorte für den ganzen Server; wer in einer privaten Welt die letzte Mondblume kauft, nimmt sie allen in der öffentlichen weg. Wer zuerst kommt, mahlt zuerst. Vorher hatte jeder seinen eigenen.",
                    "Der Laden zeigt live mit, wie der Vorrat sinkt, solange er offen ist.",
                    "Schwerwiegend behoben: Der Bestand wurde ausschließlich im Browser geführt und vom Server nie geprüft. Ein veränderter Client konnte beliebig viele Samen kaufen — auch Mondblumen — und dabei den Preis selbst bestimmen. Kauf, Preis und Vorrat rechnet jetzt der Server.",
                ],
            },
            {
                heading: "Umkleide",
                items: [
                    "Der Hauptskin gibt es jetzt in zwölf Farben — auswählbar über Farbfelder ganz oben in der Umkleide. Alle frei, jederzeit wechselbar.",
                    "Zwölf neue Geister schalten sich über dein Level frei: Waldgeist ab 5, Wassergeist ab 8, weiter über Stein, Feuer, Zucker, Klang, Zeit, Spiegel, Maschine und Licht bis zum Alchemisten ab 41 und dem Astralgeist ab 46. Gesperrte werden mit ihrer Levelangabe angezeigt — du siehst also, worauf du hinarbeitest.",
                    "Es ist dasselbe Level wie im Fähigkeitsbaum, also dieselbe Erfahrung aus deinen Ernten.",
                    "Zauberer, König und Ente bleiben frei.",
                ],
            },
            {
                heading: "Gießkanne",
                items: [
                    "Sie kostet 5.000 Gold und lohnt sich damit auch auf kleinen Pflanzen.",
                    "Der Regenmacher staffelt jetzt deutlich: ohne Skill 5 Minuten, mit den vier Stufen dann 10, 20, 45 und eineinhalb Stunden. Vorher war es eine Minute je Stufe — auf einer Pflanze mit 22 Stunden Wachstum war das nichts wert.",
                    "Die Stufen kommen dafür über den ganzen Levelbereich verteilt: Stufe 2 ab Level 14, Stufe 3 ab 27, die eineinhalb Stunden ab Level 40. Anderthalb Stunden je Guss sind der stärkste Zeitraffer im Spiel — die gab es vorher praktisch am Anfang.",
                    "Es gibt keine Obergrenze: genug Kannen machen jede Pflanze fertig. Ein Löwenzahn braucht eine, ein Holunder zwei, eine Mondblume 320.",
                    "Wie im Vorbild wirkt ein Guss auf alle Fruchtstände einer Staude gleichzeitig.",
                    "Die Kanne zeigt in der Hand jetzt nach vorn statt zurück auf den eigenen Geist.",
                    "Behoben: Gießen wurde beim nächsten Speichern stillschweigend rückgängig gemacht. Der Server hat seine eigene Wachstumszeit zurückgeschrieben und die des Browsers verworfen.",
                    "Behoben: Die Meldung nach dem Gießen behauptete immer „Pflanze ist jetzt fertig\" — auch bei einer Ananas mit fünf Tagen Restzeit. Jetzt steht dort, wie viel abgezogen wurde und wie lange es noch dauert.",
                    "Behoben: Eine Staude mit einer einzigen reifen Frucht liess sich nicht mehr gießen, obwohl sechs weitere noch wuchsen.",
                    "Behoben: Gab es nichts zu verkürzen, war die Kanne trotzdem verbraucht. Jetzt wird erst gerechnet und dann bezahlt.",
                ],
            },
            {
                heading: "Oberfläche",
                items: [
                    "Neue Schrift: Nunito statt „Courier New\". Die Schreibmaschinenschrift mit ihren harten Kanten passte nicht zu einem Farmspiel — im HUD wie auf den Schildern, Namen und Zählern auf der Karte.",
                    "Alle Kanten sind weicher: Fenster, Knöpfe, Leisten und Kacheln haben durchgehend größere Radien.",
                    "Die Marktwagen standen zu dicht an den Grundstücksschildern — bei Feld 2 und Feld 6 war der Name dadurch nicht lesbar. Alle sechs Wagen halten jetzt Abstand.",
                ],
            },
            {
                heading: "Wetter, Tiere und Werkzeug",
                items: [
                    "Das Wetter hing bisher an der Wachstumsdauer: eine Pflanze mit tagelangem Wachstum bekam garantiert alle vier Effekte (×11,25), eine mit Minuten praktisch keinen (×1,02). Jetzt hat jede Sorte dieselbe Chance, unabhängig davon, wie lange sie braucht.",
                    "Aus dem Samenfinder wird der Gärtner. Er legt keine Samen mehr in den Rucksack — der lief nach ein paar Stunden über und blockierte jede weitere Ernte. Stattdessen wachsen Einmalernten mit etwas Glück kostenlos nach (bis 60 %) und alles auf dem Grundstück wächst schneller (bis 30 %). Wirkt auch, während du weg bist.",
                    "Der Erntehelfer nimmt deutlich mehr Zellen pro Auslösung ab. Mit acht Stück war er auf einem vollen Feld reine Zierde.",
                    "Bei den Eiern entscheidet jetzt das geschlüpfte Tier über die Fähigkeitsstufe. Vorher war die Seltenheit reine Optik — ein Götterwesen mit 1 % Chance war exakt so viel wert wie ein Einhorn mit 40 %.",
                    "Spitzhacken kosten 50.000 mal 1,26 hoch Anzahl — das komplette Steinfeld liegt damit bei knapp 16 Milliarden, die letzte Hacke bei 3,3. Vorher waren es 128 Milliarden und damit unerreichbar; die erste Korrektur ist dann zu weit gegangen und hat das ganze Grundstück zur Nebensache gemacht.",
                    "Der Bergmann gibt einen Preisnachlass statt einer Chance, die Aufladung zu behalten — als Chance hat er nicht 30 % der Kosten gespart, sondern 90 %, weil er den Exponenten gesenkt hat.",
                    "Du kannst keine Spitzhacken mehr kaufen, als es offene Steinfelder gibt. Der Laden zeigt, wie viele noch übrig sind.",
                    "Der Rucksack geht bis 300 Plätze. Ab Stufe 15 kostete jedes Upgrade Millionen und gab nichts mehr.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Der Samenladen hat aus einer zweiten, veralteten Preisliste verkauft — nicht aus dem Katalog, in dem das Balancing steht. Cranberry kostete 3.500 statt 55.000 (6 %), Stachelbeere 6.000 statt 25.900, Blaubeere 10.000 statt 30.200, Zucchini 500 statt 2.000. Alles Stauden, deren Fruchtwerte längst auf den neuen Preis ausgelegt waren: die Cranberry hat pro Zyklus das Sechzehnfache ihres Einkaufs abgeworfen. In der Gegenrichtung hast du für Kokosnuss und Dattel das Zehn- bzw. Dreifache bezahlt. Der Laden liest jetzt direkt den Katalog, die zweite Liste ist weg.",
                    "Schwerwiegend: Über einen manipulierten Spielstand liessen sich reife Pflanzen behaupten und in echtes Gold verwandeln, beliebig oft. Wachstumszeiten setzt jetzt der Server.",
                    "Schwerwiegend: Brach die Verbindung genau während einer Ernte ab, stand die Pflanze danach wieder da — das Gold dafür war aber schon gutgeschrieben. Bei unklarem Ausgang wird jetzt der echte Stand geholt.",
                    "Schwerwiegend: Ein Speichervorgang, der zeitgleich mit dem Betreten der Welt lief, konnte spurlos verloren gehen — samt frisch Gepflanztem, gekauften Samen und platzierter Deko.",
                    "Ein zweiter Tab hat weitergeerntet, obwohl er nicht mehr speichern durfte. Dadurch kamen abgeerntete Pflanzen im führenden Tab zurück, während das Gold blieb.",
                    "Ziehen mit gedrückter Maustaste hat nach der ersten Pflanze abgebrochen.",
                    "Beim Verlassen der Seite ging alles verloren, was seit dem letzten Speichern passiert war — bei Käufen samt bereits abgebuchtem Gold.",
                    "Ein Klick auf den Briefkasten eines Nachbarn meldete immer „Grundstück ist frei\". Über die E-Taste ging es.",
                    "Schaufel, Kiste und Vitrine liessen sich über einen manipulierten Spielstand eintragen, ohne sie je zu bezahlen.",
                    "Aubergine, Grapefruit und Zucchini brachten weniger ein, als ihr Saatgut gekostet hat — sie standen nur als Verlustgeschäft im Laden.",
                    "Seltene Samen kommen jetzt garantiert irgendwann im Laden vorbei — und der Nachzug zählt je SORTE statt je Seltenheit. Vorher wurde der Zähler geleert, sobald irgendeine Sorte derselben Stufe auftauchte: unter den RAREs stand die Erdbeere mit 40 % neben der Aprikose mit 5 %, die Erdbeere hat den Zähler praktisch jede Rotation geleert, und die Aprikose war nie geschützt.",
                    "Zwei offene Tabs haben sich einen Spieler geteilt — der Avatar zuckte für alle anderen zwischen beiden Standorten hin und her.",
                    "Im Werkzeug-Shop stand „Fehlt Gold\", obwohl genug da war — Anzeige und Kasse haben den Spitzhackenpreis aus zwei verschiedenen Ständen gerechnet, die einen Bildaufbau auseinanderlagen.",
                    "Mehrere Speicherlecks im Server und im Renderer behoben.",
                ],
            },
        ],
    },
    {
        version: "v3.2",
        title: "Chat, Sortierung und viel Kleinkram, der lange genervt hat",
        groups: [
            {
                heading: "Chat und Mitspieler",
                items: [
                    "Neu: ein Chat für die ganze Welt, rechts unter den Tieren. Er klappt per Klick auf und bleibt offen — beim Tippen soll er nicht zuschnappen, sobald die Maus danebengerät. Solange er zu ist, zählt ein Abzeichen die ungelesenen Zeilen.",
                    "Die Anwesenheitsliste oben links klappt jetzt auf und zeigt alle Namen samt Platznummer. Ein Klick auf einen Namen bringt dich direkt zu dessen Grundstück — genauso wie ein Klick auf den Namen im Chat.",
                    "Von fremden Grundstücken sind jetzt alle vier Bauten zu sehen, nicht mehr nur die Vitrine. Anfassen darfst du weiterhin nur die Vitrine: was in Inkubator, Mülleimer und Kiste liegt, geht niemanden außer dem Besitzer etwas an.",
                ],
            },
            {
                heading: "Kiste und Inventar",
                items: [
                    "Die Vorratskiste nimmt jetzt alles: Ernte, Samen, Eier, Deko und Tiere. Jedes Stück merkt sich, woher es kam, und geht beim Herausholen genau dorthin zurück. Die Vitrine bleibt bei der Ernte — ihr Inhalt geht an alle Mitspieler und ist auf Früchte zugeschnitten.",
                    "Zwei neue Knöpfe in der Mitte: alles auf einmal einlagern und alles auf einmal herausholen. Läuft die Kiste dabei voll oder der Rucksack über, steht in der Meldung, was liegen geblieben ist.",
                    "In Kiste und Vitrine steht jetzt der Verkaufswert jedes Stücks und die Summe über der Spalte. Vorher sah man eingelagert nicht mehr, was etwas wert ist.",
                    "Auch im Inventar steht oben, was deine Ernte insgesamt einbringt.",
                    "Sortierung für Inventar und Samen-Shop: im Rucksack nach Wert, Größe, Seltenheit oder Name, im Shop nach Seltenheit, Preis oder Name.",
                    "Tiere tragen im Inventar ihren Namen unter dem Bild — bei drei Hühnern war sonst nur am Hovern zu erkennen, welches Chicky ist.",
                ],
            },
            {
                heading: "Shop",
                items: [
                    "Gießkannen und Pflanztöpfe gibt es jetzt zehnmal pro Lieferung statt fünfmal.",
                    "Die Spitzhacke ist immer vorrätig. Das Limit von einem Stück pro Lieferung hieß in der Praxis: zehn Minuten warten. Gebremst wird sie weiterhin über ihren Preis, der mit jedem Kauf um 30 % steigt — der nächste Preis steht jetzt in der Zeile.",
                    "Die Tier-Plätze sind deutlich billiger geworden: 200 Millionen, 1 Milliarde und 2 Milliarden statt 1, 10 und 100 Milliarden. Der vierte Platz war vorher für die meisten unerreichbar.",
                ],
            },
            {
                heading: "Grundstück und Deko",
                items: [
                    "Inkubator, Mülleimer, Kiste und Vitrine stehen jetzt sauber auf ihrer Kachel, statt ein Stück darunter zu hängen. Am unteren Grundstücksrand ragte vorher jedes davon auf den Steinweg hinaus.",
                    "[R] spiegelt Deko, statt sie zu drehen. Drehen hat den belegten Platz mitgetauscht — aus einer 1×2-Laterne wurde eine 2×1, und derselbe Klick setzte sie mal hierhin, mal dorthin.",
                    "Deko wird jetzt immer von der angeklickten Kachel nach oben aufgebaut, die Kachel ist also die untere linke Ecke. Nur diese eine muss freie Wiese sein — was darüber liegt, darf über den Acker ragen. Damit bekommt man Laternen endlich auch auf den schmalen Streifen unter dem Acker.",
                ],
            },
            {
                heading: "Tiere und Inkubator",
                items: [
                    "Tiere sind jetzt je nach Art verschieden groß: ein Huhn ist deutlich kleiner als ein Pferd, und Drache und Götterwesen überragen alles andere.",
                    "Der Inkubator meldet sich, wenn etwas fertig ist: eine Nachricht, eine Zeile im Menü rechts und ein Marker über dem Gerät auf dem Grundstück. Vorher lief die Brutzeit bis zu zwei Stunden, ohne dass irgendetwas darauf hinwies.",
                    "Der Kaufknopf für Tier-Plätze war zwischen den Tierzeilen kaum zu erkennen und sitzt jetzt abgesetzt darunter.",
                ],
            },
            {
                heading: "Logbuch",
                items: [
                    "Neu aufgebaut: ein Klick auf eine Art klappt darunter alles aus, was es davon zu farmen gibt — Größe 1 und Größe 50, Golden, Rainbow und jeder Wetter-Effekt, jeweils mit dem eingefärbten Bild der Frucht. Was du schon hattest, ist hell und abgehakt, der Rest ausgegraut.",
                    "Vorher stand all das als eine Kette kleiner Textmarken hinter dem Namen; welche Ausprägungen es überhaupt gibt, war daran nicht abzulesen.",
                ],
            },
            {
                heading: "Optik",
                items: [
                    "Große Früchte werden in der Hand jetzt auch groß gezeichnet. Eine Honigmelone der Größe 50 ist fast so groß wie du selbst.",
                    "Sonderformen und Wetter-Effekte färben die Frucht jetzt überall ein, wo sie auftaucht: in Kiste, Vitrine, Briefkasten und auf der Hover-Karte. Bisher ging das nur im Rucksack und in der Schnellleiste.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Mit einer frischen Farm ließ sich nichts kaufen. Der Browser zeigte 500 Gold, der Server wusste von 0 — sein Spielstand entstand erst beim ersten Speichern, und Gold wird dort grundsätzlich aus dem bestehenden Stand übernommen. Wer davon betroffen war, bekommt sein Startkapital beim nächsten Laden zurück.",
                    "Schwerwiegend: Durch schnelles Klicken ließen sich mehr Gießkannen, Töpfe, Spitzhacken und Eier kaufen, als es überhaupt gab — jeder Klick kam durch dieselbe Prüfung, weil der Bestand erst nach der Antwort des Servers abgezogen wurde. Dasselbe galt für Schaufel, Kiste, Vitrine und die Rucksack-Upgrades, die sich mehrfach bezahlen ließen.",
                    "Schwerwiegend: Der Tool- und der Eier-Shop füllten sich alle 30 Sekunden von selbst wieder auf, ohne dass die Lieferung durch war. Gekauft, kurz gewartet, wieder da.",
                    "Verschenkte Früchte kamen beim Empfänger mit „0 Gold\" an. Der Wert reist bewusst nicht mit der Sendung — er wird jetzt beim Abholen neu gerechnet.",
                    "Das Ernten fühlte sich an, als wäre die Maus gedrosselt. Zwei Ursachen: Klicks während einer laufenden Ernte wurden weggeworfen statt angestellt, und nach jeder Frucht übernahm der Browser die Pflanze komplett vom Server — samt aller Fruchtstände, die seit dem letzten Speichern reif geworden waren. An einer Staude mit acht reifen Früchten kam so genau eine durch.",
                    "Der Marker über dem Inkubator wurde nie gezeichnet, und ein Platz ohne Ei riss den ganzen Spielbildschirm mit.",
                    "Bei den Grundstücken unterhalb des Weges standen Inkubator und Mülleimer am äußersten unteren Ende. Man musste erst das ganze Grundstück hinunterlaufen; jetzt stehen sie wie oben am Weg.",
                    "Die Gold-Bestenliste klappte hinter die Tierliste darunter.",
                    "Die Hover-Karte blieb über dem Spiel stehen, wenn man im Inventar einen Gegenstand anklickte.",
                    "Bei mehreren gleichartigen Eiern oder Dekos lagerte ein Klick auf das dritte Stück das erste ein.",
                    "Tiere verschiedener Stufen erzeugten laufend „429 Too Many Requests\" in der Browser-Konsole: der Browser fragte im Takt des schnellsten Tieres an, der Server rechnet aber pro Tier mit dessen eigener Stufe.",
                ],
            },
        ],
    },
    {
        version: "v3.1",
        title: "Lager, Logbuch und ein hartnäckiger Erntefehler",
        groups: [
            {
                heading: "Kiste, Vitrine und Logbuch",
                items: [
                    "Neu im Tool-Shop: die Vorratskiste. 100 Plätze für Ernte, die keinen Rucksackplatz belegen — endlich ein Ort für alles, was du nicht sofort verkaufen willst.",
                    "Ebenfalls neu: die Vitrine mit 12 Schauplätzen. Was dort steht, sehen alle in der Welt: sie können an deinem Grundstück vorbeikommen, die Vitrine anklicken und sich deine Prachtstücke mit Größe, Sonderform und Wetter-Effekt ansehen — anfassen aber nicht.",
                    "Beide stehen auf deinem Grundstück und lassen sich frei umstellen.",
                    "Neues Logbuch oben rechts: für jede Art die kleinste und größte Größe, die du je geerntet hast, dazu jede Veredelung, die dir untergekommen ist. Mit Suche und einem Filter für das, was du schon hattest.",
                ],
            },
            {
                heading: "Briefkasten",
                items: [
                    "Eine Sendung nimmt jetzt bis zu 12 Gegenstände auf, statt einem Samen oder einer Frucht. Gold und Nachricht kommen wie gehabt obendrauf.",
                    "Gleiche Sachen stehen als eine Zeile mit Anzahl da — sieben identische Karotten wählst du mit zwei Klicks statt mit sieben.",
                    "Läuft das Sendelimit, steht jetzt dabei, wie lange es noch dauert. Vorher war es ein stummer Fehler.",
                ],
            },
            {
                heading: "Grundstück, Tiere und Kamera",
                items: [
                    "Inkubator und Mülleimer lassen sich umstellen: Knopf im jeweiligen Fenster, dann einmal auf die Wiese klicken. Beide unabhängig voneinander.",
                    "Ab dem vierten Tier-Platz kannst du nachkaufen — bis zu sechs Tiere auf dem Grundstück. Die Plätze kosten 1, 10 und 100 Milliarden und werden direkt in der Tierliste angeboten.",
                    "Der Mülleimer nimmt jetzt auch Samen. Gleiche Sorten stehen zusammengefasst da, mit „Einen\" und „Alle\".",
                    "Mausrad zoomt die Kamera zwischen 32 % und 157 %. Weicht der Zoom vom Standard ab, steht oben rechts ein Prozentwert, der ihn per Klick zurücksetzt.",
                    "Pflanzen auf fremden Äckern lassen sich anhovern: Größe, Wert, Restzeit und Fruchtstände wie bei dir. Nur zum Ansehen — geerntet wird dort nichts.",
                    "Mehrkachelige Deko wächst nach unten, wenn nach oben kein Platz ist. Laterne und Statue passen damit auch auf den Wiesenstreifen direkt am Acker.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Dauerträger ließen sich oft nicht ernten („Noch nicht reif.\"), obwohl reife Früchte am Strauch hingen. Der Server hat die Umstellung von Struktur auf Frucht zwar ausgeliefert, aber nie gespeichert — und den ersten Fruchtzyklus ab dem Moment gerechnet, in dem er das nächste Mal hinsah, statt ab dem Reifezeitpunkt. Eine Staude, die über Nacht fertig wurde, stand dadurch noch einen ganzen Zyklus leer.",
                    "Wer gießt und sofort erntet, bekam ebenfalls ein „Noch nicht reif.\": der Acker liegt im Browser und wandert erst mit dem Speichern zum Server. Jetzt wird der Stand nachgereicht und die Ernte ein zweites Mal versucht.",
                    "Schnelles Klicken auf einen Dauerträger meldete Fehler, sobald mehr Klicks rausgingen als Früchte reif waren. Das ist jetzt ein stilles Nichts-Passiert statt einer Fehlermeldung — und kann keine Frucht doppelt auszahlen.",
                    "Schwerwiegend: Beim Verschenken mehrerer Sachen konnte ein Gegenstand verloren gehen. Wurde der Samen schon abgezogen und scheiterte danach die Prüfung des Tieres, war der Samen weg, ohne dass die Sendung zustande kam. Jetzt wird erst alles geprüft und dann in einem Schritt abgebucht.",
                    "Verschenktes verschwindet sofort aus dem Rucksack. Vorher blieb ein weggeschickter Samen bis zur Antwort des Servers auswählbar — und ließ sich in der Zwischenzeit noch einpflanzen.",
                    "Tiere kamen beim Empfänger als Ersatz-Emoji statt als Tier an, im Briefkasten wie im Rucksack. Dasselbe galt für verschenkte Samen. Der Bildpfad wird jetzt beim Empfänger aus der Art abgeleitet.",
                    "Beim Samenkauf zählte der Ernte-Teil des Rucksacks nicht mit — die Platzprüfung sah immer nur die Samen.",
                ],
            },
        ],
    },
    {
        version: "v3.0",
        title: "Die große Überarbeitung",
        groups: [
            {
                heading: "Gemeinsame Welt",
                items: [
                    "Die Karte hat jetzt immer acht Grundstücke und ist dauerhaft bewohnt — es gibt keinen Einzelspieler-Modus mehr. Allein startest du oben links.",
                    "Du siehst andere Farmer in Echtzeit über die Karte laufen, samt Namensschild, Abzeichen und ihrem Outfit.",
                    "Fremde Äcker werden live angezeigt: Pflanzen, Deko und Tiere der anderen sind sichtbar.",
                    "Private Welten mit fünfstelligem Code: eine eigene aufmachen, den Code weitergeben, gemeinsam farmen. Der Code steht oben rechts und lässt sich per Klick kopieren.",
                    "Ist eine öffentliche Welt voll, landest du automatisch in der nächsten statt abgewiesen zu werden.",
                    "Deine Farm zieht mit: der Acker hängt an deinem Konto, nicht an der Welt.",
                ],
            },
            {
                heading: "Briefkasten",
                items: [
                    "An jedem Grundstück steht ein Briefkasten. Am eigenen liest du Post, an fremden hinterlegst du Gold, Nachrichten und Samen.",
                    "Der Empfänger ergibt sich aus dem Briefkasten, vor dem du stehst — kein Name einzutippen, keine Vertipper.",
                    "Beträge prüft der Server: nur ganze Zahlen über 0, und nur wenn du sie wirklich besitzt. Es kann kein Gold aus dem Nichts entstehen.",
                    "Ein Hinweis am Kasten zeigt, wie viele Sendungen auf dich warten.",
                ],
            },
            {
                heading: "Acker und Pflanzen",
                items: [
                    "Jede Art hat eine eigene Wuchsform: Gurken und Trauben ranken am Spalier, Karotten sitzen im Erdhügel, Bambus wächst als Halm, Beeren am Strauch.",
                    "Alles wird nach Tiefe gezeichnet — du läufst hinter hohen Pflanzen und Gebäuden vorbei statt immer davor.",
                    "Große Pflanzen decken die Reihe dahinter nicht mehr zu, und über jeder erntereifen Pflanze schwebt ein Marker in Seltenheitsfarbe.",
                    "Bodenschatten und leichter Wind für Pflanzen, Deko und Tiere.",
                    "Neue Strukturen und Bodentexturen, dazu Zäune als Grundstücksgrenze.",
                    "Bei Schnee liegen Schneehaufen auf der Karte, bei Regen sammeln sich Pfützen.",
                ],
            },
            {
                heading: "Tiere",
                items: [
                    "Tiere lassen sich benennen; der Name steht für alle sichtbar über ihnen.",
                    "Neue Fähigkeit Erntehelfer: erntet reife Pflanzen selbstständig ab, 1 bis 8 Stück je nach Stufe.",
                    "Tiere können golden oder regenbogenfarben schlüpfen.",
                    "Eigene Laufbilder für Drache, Einhorn und Katze — weitere folgen.",
                    "Ein Klick auf ein Tier in der Liste zeigt Fundhöhe, Takt, Chance und Verkaufspreis.",
                    "Tiger, Phönix, Drache und Götterwesen haben endlich ihr eigenes Bild statt eines Platzhalters — sie waren nur wegen eines Namensfehlers unsichtbar.",
                    "Legendäre Eier: Einhorn 40 %, Tiger 30 %, Phönix 20 %, Drache 9 %, Götterwesen 1 %.",
                ],
            },
            {
                heading: "Gold und Ernte gehören jetzt dem Server",
                items: [
                    "Ernten, Verkaufen, Kaufen, Tierverkäufe und Tierfunde rechnet ab sofort der Server. Dein Browser meldet nur noch, was du tun willst.",
                    "Der Verkaufswert wird beim Verkauf neu aus Größe, Sonderform und Wetter berechnet — ein manipulierter Wert im Spielstand hat keine Wirkung mehr.",
                    "Ein Kauf wird erst gebucht, wenn der Server die Deckung bestätigt hat. Gold kann dabei nie unter null fallen.",
                    "Ein Doppelklick auf „Ernten\" oder „Kaufen\" zählt nur noch einmal.",
                    "Goldfunde deiner Tiere würfelt der Server und begrenzt ihren Takt — ein schnellerer Browser findet nicht mehr Gold.",
                    "Dein Kontostand überlebt jetzt auch dann, wenn zwei Tabs gleichzeitig offen sind.",
                ],
            },
            {
                heading: "Oberfläche",
                items: [
                    "HUD, Shops, Inventar und Menüs komplett überarbeitet: ruhigere Flächen, klare Icons statt Emojis.",
                    "Neue Hover-Karte an Pflanzen mit erwartetem Verkaufswert, Wuchsform, Restzeit und einer Zeile je Fruchtstand.",
                    "Wetter-Effekte zeigen endlich ihren echten Bonus: Nass +25 %, Gefroren +50 %, Aufgeladen +100 %, Mondlicht +200 %.",
                    "Info-Knopf im Samen-Shop mit Wachstumszeiten, Erträgen und Anzahl der Fruchtstände.",
                    "Mülleimer auf dem Grundstück: nicht mehr benötigte Deko endgültig wegwerfen.",
                    "Deko lässt sich beim Platzieren mit R drehen — Pool und Bank in der Ebene, anderes über Ansichten.",
                ],
            },
            {
                heading: "Leistung",
                items: [
                    "Im Leerlauf fallen statt 1541 nur noch 4 Oberflächen-Aktualisierungen in vier Sekunden an; die dafür nötige Rechenzeit sank von 1427 auf 23 Millisekunden.",
                    "Ein Schwenk mit der Maus über den Acker kostet 30 statt 518 Aktualisierungen.",
                    "Kein Einzelbild mehr über 20 Millisekunden — spürbar weniger Mikroruckler.",
                    "Eine versteckte Endlosschleife im Samen-Shop entfernt, die den Server ununterbrochen abgefragt hätte, sobald eine Rotation ohne Samen zurückkommt.",
                    "Grafiken zugeschnitten und verkleinert: rund 25 Prozent weniger Ladelast.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Zwei gefrorene Früchte am selben Strauch: das Ernten der einen setzte die andere zurück. Wetter-Effekte gehören jetzt zur einzelnen Frucht.",
                    "Beim Ernten wurde gefühlt immer nur die erste Frucht abgezogen — jetzt zuerst die am längsten reife, und die Hover-Karte sortiert reife nach vorn.",
                    "Die Hover-Karte zeigte nach dem Ernten weiter den alten Stand.",
                    "Balancing-Änderungen wurden bei jedem Serverstart wieder rückgängig gemacht, weil das Migrationsskript veraltete Werte mitbrachte. Spinat, Kohl, Zucchini und Blaubeere stehen jetzt korrekt.",
                    "Alte Pflanzen zeigten weiterhin ihre alten Strukturen; Bilder werden jetzt immer neu bestimmt statt aus dem Spielstand gelesen.",
                    "Die anklickbare Fläche von Tieren blieb dort liegen, wo das Tier abgesetzt wurde — ein Klick auf den Pool öffnete das Tierfenster.",
                    "Der Waschbär war unsichtbar, weil sein Bild anders hieß als erwartet.",
                    "Bäume hatten einen zweiten Stamm unter dem eigentlichen.",
                    "Das eigene Grundstück zeigte „Zu verkaufen“ statt deines Namens.",
                    "Inkubator und Mülleimer wurden über den Charakter gezeichnet, Marktdächer von den Grundstücken abgeschnitten.",
                    "Die Kategorienleiste in Shop und Inventar ließ sich minimal verschieben.",
                    "Ernte konnte bei alten Spielständen abstürzen, wenn Pflanzendaten unvollständig waren.",
                    "Die Schnellreise zum Shop-Areal setzte dich knapp außerhalb der Reichweite ab — der Öffnen-Knopf erschien nicht.",
                    "Schwerwiegend: Ein Browser, der noch nicht fertig geladen hatte, konnte beim Speichern Deko, Tiere und Eier auf dem Server löschen. Der Server nimmt einen rundum leeren Spielstand jetzt nicht mehr an, und der Browser speichert erst, wenn deine Farm geladen ist.",
                ],
            },
        ],
    },
    {
        version: "v2.1",
        title: "Optik & Bedienung",
        groups: [
            {
                heading: "Acker & Pflanzen",
                items: [
                    "Jede Art hat jetzt eine eigene Wuchsform: Gurke und Traube ranken am Spalier, Karotten sitzen im Erdhügel, Bambus wächst als Halm, Drachenfrucht am Pfosten.",
                    "Pflanzen, Deko, Tiere und dein Charakter werden nach Tiefe sortiert gezeichnet — du läufst hinter hohen Pflanzen vorbei statt immer davor.",
                    "Große Pflanzen decken die Reihe dahinter nicht mehr zu, und über jeder erntereifen Pflanze schwebt ein Marker in Seltenheitsfarbe.",
                    "Bodenschatten und leichter Wind für Pflanzen, Deko und Tiere.",
                    "Tiere unterscheiden sichtbar zwischen Laufen und Grasen.",
                ],
            },
            {
                heading: "Oberfläche",
                items: [
                    "HUD, Shops und Inventar komplett überarbeitet: ruhigere Flächen, klare Icons statt Emojis.",
                    "Neue Hover-Karte an Pflanzen — mit erwartetem Verkaufswert, Wuchsform, Restzeit und einer Zeile pro Fruchtstand.",
                    "Wetter-Effekte zeigen endlich ihren echten Bonus (Nass +25 %, Gefroren +50 %, Aufgeladen +100 %, Mondlicht +200 %).",
                    "Tiere lassen sich anklicken: eigenes Fenster mit Fundhöhe, Takt, Chance und Verkaufspreis.",
                    "Wetter-Effekte sind jetzt auch im Inventar am Item zu sehen, nicht nur auf dem Acker.",
                    "Deko lässt sich beim Platzieren mit R in 90°-Schritten drehen.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Waschbär-Grafik wurde wegen eines Dateinamens nie geladen und blieb unsichtbar.",
                ],
            },
        ],
    },
    {
        version: "v2.0",
        title: "Economy Update",
        groups: [
            {
                heading: "Wirtschaft",
                items: [
                    "Preise, Erträge und Wachstumszeiten auf ein neues Balancing umgestellt.",
                    "Einige Pflanzen haben sehr kurze Cooldowns ab 4 Sekunden — aktives Spielen lohnt sich.",
                    "Neue Ziele im Milliarden-Bereich, unter anderem die Mondblume.",
                    "Bereits gepflanzte Samen wurden automatisch migriert.",
                ],
            },
        ],
    },
    {
        version: "v1.1",
        title: "Alpha",
        groups: [
            {
                heading: "Neu",
                items: [
                    "Einheitliche Skins und angepasste Größen von Strukturen und Charakteren.",
                    "Überarbeitete Felder im 2×2-Design, neue Dekorationen in verschiedenen Größen.",
                    "Hintergrundmusik mit eigenem Regler, neue Sounds für Ernten, Verkaufen und Pflanzen.",
                    "Sub-Bonus (+50 % Verkauf) und Beta-Tester-Abzeichen.",
                    "Tiere können an einem eigenen Stand verkauft werden.",
                    "Deko, Tiere und Werkzeuge belegen keine Inventar-Slots mehr.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Inventar ist nicht mehr unbegrenzt groß.",
                    "Shop-Bestände werden korrekt aktualisiert und nicht mehr ungewollt zurückgesetzt.",
                    "Spezial-Overlays (Gold, Rainbow, Wetter) liegen bei Mehrfachpflanzen pro Frucht statt auf der ganzen Struktur.",
                    "Gestreckte Pflanzen und Dekorationen rendern wieder im richtigen Seitenverhältnis.",
                    "Eier- und Pflanzen-Timer laufen serverseitig statt lokal.",
                ],
            },
        ],
    },
];
