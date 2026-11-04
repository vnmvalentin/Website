# Virtual Farm — Backend

Alles, was das Garden Game serverseitig ausmacht. Bis August 2026 lagen diese
Dateien als `lib/garden*.js` zwischen den übrigen Modulen; hier sind sie nach
Zuständigkeit geschnitten, wie `clashRoyale/` und `discord/`.

Die Route bleibt bewusst draußen: `routes/gardenGameRoutes.js` ist der HTTP-Rand,
er gehört zu den anderen Routen. Dasselbe gilt für die Admin-Route.

## Aufbau

```
garden/
  core/           Spiellogik — kennt keine HTTP-Schicht und keine Sockets
    catalogue.js  Samen-Katalog: Preise, Wachszeiten, Erlöse, Seltenheit
    weather.js    Wetter-Effekte an Ware (Liste, stärkster, Aufschlag)
    tageszeit.js  Tag, Nacht und das Party-Event — aus der Uhr, nicht aus Zustand
    skills.js     Erfahrung, Level, Fähigkeitsbaum
    economy.js    Ernte, Verkauf, Kiste und Vitrine — hier entsteht Gold
    pets.js       Tiere: Arten, Stufen, Fähigkeiten
    werkzeug.js   Werkzeugkasten: Preise, Kauf, Verbrauch
    laden.js      Samenladen: welche Sorten eine Rotation zeigt (Nachzug, Deckel, Mindestplätze)
    quests.js     Tages- und Wochenmissionen, Belohnung wächst mit dem Level
    auftraege.js  Händler-Aufträge: 3 Plätze, Liefern aus dem Rucksack, Pausen
    kreuzung.js   Kreuzungen: Eltern nebeneinander → Chance auf neuen Samen beim Ernten
    brutkasten.js Eier, Brutkasten, Schlüpfen; Tier-Abgleich beim Speichern
    vielfalt.js   Vielfalt-Bonus: verschiedene Sorten auf dem Acker → mehr Erlös je Ernte
    wetterVerlauf.js  welches Wetter wann lief — prüft gemeldete Wetter-Effekte
  world/          Mehrspieler
    lobby.js      Welten, Slot-Vergabe, Anwesenheit, Momentaufnahmen, Chat
    mail.js       Briefkasten: senden, abholen, Drosselung
    ereignisse.js Wetter und Party von Hand — die Ausnahme über der Uhr
    erntefest.js  Erntefest am Wochenende: Punkte aller Spieler, Ziel, Belohnung
    zweitkonto.js eine Farm je Gerät, keine Post zwischen verknüpften Accounts
  store/
    farms.js      SQLite-Persistenz der Spielstände + rollendes Backup
  migrations/
    index.js      fährt alle Umstellungen in fester Reihenfolge
    plot.js       Steinfeld auf 4×(7×7), räumt Wegkacheln
    deko.js       Bildpfade auf die neue Ordnerstruktur
    tierplaetze.js  Tierplätze zurück auf 3 — Gold erstatten, Tiere zurückgeben
    xp.js         zahlt Erfahrung aus dem Logbuch nach
    skills.js     kürzt Fähigkeitsstufen auf die neue Levelstaffel
  tools/
    katalogSpiegel.js  erzeugt die Frontend-Spiegel (npm run garden:spiegel)
    simulator.js  Wirtschafts-Simulator mit den echten Spielfunktionen (npm run garden:sim)
  admin.js        was das Admin-Menü am Spielstand verändern darf
```

## Wer wem gehört

Die wichtigste Regel im ganzen Spiel — sie erklärt die meisten Entscheidungen:

| Gehört dem **Server** | Gehört dem **Browser** | Browser mit Grenzen (seit Nov. 2026) |
| --- | --- | --- |
| `gold`, `harvestedItems` | `decoPlacements`, `decoInventory` | `inventory` — nur entfernen |
| `chestItems`, `vitrineItems` | `appearance` | `plotPlants` — neue nur gegen verbrauchten Samen |
| `toolInventory`, `inventoryMaxSlots` | Ladenbestände (Anzeige) | `petInventory`, `petPlacements` — nur aufstellen/einpacken/umbenennen, max. 3 |
| `eggInventory`, `incubator` | | `plotUnlockedCells` — höchstens `steinfelderErlaubt` |
| `mailbox`, `xp`, `skills` | | |
| `stateVersion`, `letzterTab` | | |

Serverbesitz heißt: der Wert steht **nicht** in `compactFarmState` und wird beim
PUT aus dem bestehenden Stand übernommen. Alles, woraus sich Gold machen lässt,
liegt links oder rechts.

**Browser mit Grenzen**: Acker, Samen und Tiere ändern sich zu oft für eine
Server-Runde je Klick, deshalb schickt sie weiter der Browser. Der PUT gleicht sie
aber gegen den Serverstand ab — er darf Dinge wegnehmen oder verschieben, nie neue
erschaffen oder ihre Werte ändern:

| Was | Regel | Wo |
| --- | --- | --- |
| Samen | behalten wird nur, was der Server unter derselben `instanceId` kennt (SEIN Eintrag). Kauf, Kreuzung, Post und Kiste legen Samen auf dem Server ab. | `gleicheSamenAb` |
| Neue Pflanze | braucht einen Samen derselben Sorte, der in diesem PUT aus dem Rucksack verschwunden ist | `verplausibilisierePflanzen` |
| Tiere | erkannt an der festen `id`; Art, Seltenheit, Fähigkeit vom Server; Lage und Name vom Browser; weggelassene bleiben im Rucksack | `core/brutkasten.js` → `gleicheTiereAb` |
| Eier, Brutkasten | Kauf, Einlegen, Schlüpfen, Freischalten nur über `POST /action` (`buyEgg`, `eiEinlegen`, `eiAbholen`, `brutplatzFreischalten`) | `core/brutkasten.js` |
| Steinfelder | eins je verbrauchtem Spitzhacken-Schlag (`steinfelderErlaubt`) | `core/werkzeug.js` |
| Rucksackplätze | 50 + 10 je Rucksackstufe, vom Server gerechnet | `rucksackPlaetze` |
| Wetter-Effekte | neue nur, wenn das Wetter seit dem letzten Speichern lief (Verlauf der Laden-Rotationen + Admin-Wetter, 2 h); Ablauf-Uhr an reifer Ware führt der Server; abgelaufene zählen bei der Ernte nicht | `core/wetterVerlauf.js` |
| Goldfinder | Ob ein Takt etwas findet (10 % × Züchter), würfelt der Server; der Browser fragt nur je Takt an | `economy.petFind` |

Die Kennungen dafür vergeben `migrations/samenKennung.js` und `migrations/tierKennung.js`.
Zwei Tabs überschreiben einander weiterhin nicht — dagegen laufen `stateVersion`
und `letzterTab` (siehe `routes/gardenGameRoutes.js`, PUT-Weg).

## Zweit-Accounts (seit Nov. 2026)

`world/zweitkonto.js`. Der Browser schickt bei jeder Anfrage eine dauerhafte
Geräte-Kennung (`X-VF-Geraet`, localStorage `vf_geraet`); gespeichert werden nur
gesalzene Prüfsummen in `state.kennzeichen` (Geräte + Anschlüsse, letztere 30 Tage).

* **Gleiches Gerät** → nur die Farm, die es zuerst gesehen hat, ist spielbar.
  GET/PUT /farm-state und POST /action antworten sonst mit 403 `{ zweitkonto: true }`,
  der Browser zeigt „Nur eine Farm pro Gerät".
* **Gleicher Anschluss** (Internet-Adresse) → beide spielbar, aber keine Post zwischen ihnen.
* Ausnahmen: `GARDEN_ZWEITKONTO_AUSNAHMEN` (Twitch-IDs oder Logins, kommagetrennt).
  Salz: `GARDEN_KONTO_SALT`.

## Feld-Manager (entfernt)

Gab anderen Spielern über eine Helferliste (`world/rechte.js`, vier Rechte:
ernten/pflanzen/giessen/tiere) die Möglichkeit, auf dem eigenen Grundstück zu
arbeiten (`world/helfen.js`). Ernten war schon vorher gestrichen (Feedback
30.08.: der Konflikt-Pfad — `serverAenderungAb` zwingt den Besitzer zum
Nachladen, sobald ein Helfer bei ihm arbeitet — sah während dessen eigener
Sitzung wie ein Reset des ganzen Ackers aus). Feedback 30.08. (zweite Runde):
das galt fürs Gießen/Pflanzen/Tiere-Abstellen genauso, also ist die ganze
Funktion samt beider Dateien, der `/rechte`-Routen und des Feld-Manager-Fensters
gestrichen. Auf dem eigenen Grundstück arbeitet jetzt wieder nur der Besitzer.

## Tiere sind Boni, keine zweite Farm

Seit August 2026 gibt es **kein Offline-Farmen** mehr (`core/offline.js` ist
gestrichen) und der Erntehelfer erntet nicht mehr selbst. Die drei Fähigkeiten:

| Fähigkeit | Wirkung | Wo gerechnet |
| --- | --- | --- |
| Goldfinder | Gold im Takt, solange der Spieler online ist | `economy.petFind` |
| Erntehelfer | Chance auf ein zweites Stück bei JEDER eigenen Ernte | `economy.harvestCell` |
| Gärtner | Nachwuchs ohne Samen + schnelleres Wachstum | `economy.nachwuchsChance` / `wachstumsBonus` |

Gleiche Fähigkeiten stapeln nicht — es zählt die höchste platzierte Stufe
(`pets.besteStufe`). Deshalb lohnen sich drei verschiedene Tiere, nicht drei
gleiche. Der alte Zustand belohnte Abwesenheit: ein Stufe-5-Erntehelfer räumte
über Nacht das ganze Feld ab und verkaufte es.

**Drei Plätze, fest.** Bis August 2026 waren drei weitere kaufbar. Mit der
Bestleistungs-Regel hatten die nur noch eine Wirkung — mehr Goldfinder
nebeneinander, also genau das wieder, was der Umbau abgeschafft hat. Nebenbei war
`petSlots` das einzige Kaufgut im BROWSER (in `toolInventory`) und damit
fälschbar; eine feste Zahl ist es nicht. Erstattung und Rückgabe macht
`migrations/tierplaetze.js`.

**Züchter** (`economy.tierVerstaerkung`) ist der eine Aufschlag auf alle drei
Fähigkeiten. Vorher hing er allein an der Auslösechance und traf damit nur noch
den Goldfinder, weil die anderen beiden nicht mehr ticken. Der Nachwuchs ist bei
80 % gedeckelt: bei 100 % wäre die Einmalernte dasselbe wie ein Dauerträger.

## Der Werkzeugkasten gehört dem Server

`core/werkzeug.js`. Bis August 2026 kam `toolInventory` aus dem PUT, nur Schaufel,
Kiste und Vitrine waren geschützt. Gold gehörte aber schon dem Server — und damit
lag zwischen „bezahlt" und „gespeichert" eine Lücke, in die jeder Weg fiel, der den
Browserstand verwirft: Nachladen nach Konflikt, Migration beim Deploy, zweiter Tab,
Verbindungsabriss. Zweimal gemeldet: „zehn Gießkannen gekauft, sechs bekommen" und
„nach dem Deploy sind die Pflanztöpfe weg".

Dagegen hilft kein besseres Nachreichen, sondern nur, beide Hälften in EINEN Schritt
zu legen. `POST /action` kennt dafür zwei Aktionen:

| Aktion | Was passiert |
| --- | --- |
| `buyTool` | Preis rechnen, Gold abbuchen, Werkzeug eintragen — ohne `await` dazwischen |
| `useTool` | Verbrauchsgut herunterzählen |

Der Preis wird ebenfalls hier gerechnet (Spitzhacke 50.000·1,26^n, Rucksack
20.000·1,55^n, „Bergmann" als Nachlass bis 60 %). Der Browser zeigt ihn nur an; wich
seine Rechnung nach einem Nachladen ab, schlug der Kauf vorher still fehl.

## Tag, Nacht und Party

`core/tageszeit.js` rechnet beides aus der Uhr — 24 echte Minuten sind ein
Spieltag, die Nacht liegt zwischen 20 und 6 Uhr. In einer Nacht kann eine Party
laufen (35 % Chance, drei Spielstunden): Discolaser im Browser, doppelte
Rainbow-Chance auf dem Server.

Aus der Uhr und nicht aus einer Servermeldung, weil es **beide Seiten** brauchen
und **gleichzeitig** gelten muss: der Browser zeichnet, der Server würfelt. Eine
verteilte Nachricht kann verlorengehen, erreicht Nachzügler nicht und liesse sich
von einem manipulierten Client erfinden. Dasselbe Muster wie bei Ladenrotation
und Wetter.

**Die Ausnahme davon** ist `world/ereignisse.js`: der Admin kann Wetter setzen und
eine Party starten. „Jetzt Party" lässt sich aus keiner Uhr ablesen, deshalb liegt
das als befristete Übersteuerung DANEBEN statt in der Uhr — nur im Arbeitsspeicher,
nach einem Neustart zählt wieder die Uhr. Jede serverseitige Würfelstelle geht über
`ereignisse.sonderform()` statt direkt über `tageszeit.wuerfleSonderform()`, sonst
wirkte eine gestartete Party nur optisch.

Während einer Party läuft dort auch die **Veredelung**: alle 30 Sekunden bekommt
jede Pflanze ohne Sonderform eine Chance auf Rainbow, so bemessen, dass über die
ganze Party 2 % herauskommen — egal ob sie drei Minuten oder zwanzig läuft. Ohne
das träfe die Party nur, was man während ihrer Dauer NEU setzt, also auf einem
eingerichteten Acker fast nichts. Betroffene Zellen gehen als
`garden:veredelt` an den Besitzer; ein Nachladen alle 30 Sekunden wäre die
schlechtere Lösung, weil es seinen Acker jedes Mal durch die Serverfassung ersetzt.

Veredelt wird dabei NUR, wer gerade online ist (`world/lobby.js` → `istOnline`).
`farmStates` hält die Äcker aller Spieler dauerhaft im Speicher, auch die von
Abwesenden — ohne diese Prüfung veredelte die Schleife jede Party auch Äcker, an
denen niemand sass, und nach ein paar Nächten im Hintergrund war der ganze Acker
Regenbogen, ohne dass der Besitzer je zugesehen hätte.

## Erfahrung

`core/skills.js` → `xpFuerErnte(seltenheit, zyklusMinuten)`. Bis August 2026 zählte
allein die Seltenheit: ein Bambus mit acht Tagen Wachstum brachte dieselben 50 XP
wie eine Acai-Frucht alle 22 Stunden. Jetzt kommt ein **logarithmischer** Zeitfaktor
dazu — linear bekäme die Mondblume das Zweihundertfache eines Kürbisses und der
Baum wäre mit einem Feld erledigt.

Der Browser bekommt über `GET /skills` die fertige Tabelle `xpJeSorte` und spiegelt
die Formel nicht.

## Migrationen

Jede trägt ihre **eigene** Marke im Spielstand und läuft genau einmal. Sie sind
absichtlich nicht zu einer gemeinsamen Marke zusammengefasst: neue Umstellungen
kommen dazu, wenn die alten längst ausgerollt sind — an einer geteilten Marke
liefe die neue dann nie bei genau den Ständen, die sie brauchen.

| Datei | Marke |
| --- | --- |
| `plot.js` | `plotSteinreihen3`, `plotWegeGeraeumt` |
| `deko.js` | `dekoOrdnerUmzug` |
| `tierplaetze.js` | `tierplaetzeAufDrei` |
| `xp.js` | `xpAusLogbuch`, `xpKurve400`, `xpKurveKorrektur` |
| `skills.js` | `skillLevelStaffel` |

`index.js` prüft vorab, ob **alle** Stände **alle** Marken tragen; dann wird der
ganze Durchgang übersprungen und das Startprotokoll meldet „stillgelegt". Der Code
bleibt für Spielstände aus einem alten Backup erhalten, kostet im Regelfall aber
keinen Handschlag mehr.

**Gestrichen:** `plants.js`. Sie war die einzige Umstellung ohne Marke und lief
deshalb bei JEDEM Serverstart über JEDE Pflanze — sie hat `growthMs` neu gerechnet
(jedes Gießen war beim nächsten Neustart weg), reife Pflanzen wieder unreif
gemacht und dadurch über die weiterlaufende Wetter-Uhr alle Wetter-Effekte
gelöscht. Übrig blieben Golden und Rainbow, die keine Uhr haben. Ihre Aufgabe
braucht es nicht mehr: Verkaufswerte kommen zur Laufzeit aus dem Katalog, die
Zeiten einer bestehenden Pflanze gehören `verplausibilisierePflanzen`.

Marken müssen den PUT überleben. Wo das passiert: `compactFarmState` in
`routes/gardenGameRoutes.js`.

## Doppelt geführte Werte

Ein paar Zahlen stehen zwangsläufig auf beiden Seiten, weil der Browser dieselbe
Rechnung für die Anzeige braucht. Zwei davon werden inzwischen **erzeugt** statt
gepflegt:

```
cd Backend && npm run garden:spiegel          # schreibt die Spiegel neu
cd Backend && npm run garden:spiegel:pruefen  # meldet nur (Rückgabewert 1)
```

| Wert | Server | Browser | Abgeglichen |
| --- | --- | --- | --- |
| Samen-Katalog | `core/catalogue.js` | `engine/PlantSystem.js` | erzeugt |
| Tag/Nacht/Party | `core/tageszeit.js` | `engine/Tageszeit.js` | erzeugt |
| Wetter-Aufschläge | `core/weather.js` | `engine/PlantSystem.js` | von Hand |
| Tier-Werte | `core/pets.js` | `engine/PetSystem.js` | von Hand |
| Fähigkeits-Stufen | `core/skills.js` | kommt über `GET /api/garden/skills` | Route |
| Rastermaße | `migrations/plot.js` | `engine/MapConfig.js` | von Hand |

Der Fähigkeitsbaum ist der Sollzustand: der Browser lädt ihn vom Server, statt
ihn zu kennen. Eine Anzeige, die etwas anderes verspricht als die Kasse zahlt,
ist schlimmer als gar keine Anzeige. Wo das nicht geht (der Browser braucht die
Zahl 60-mal pro Sekunde), wird der Spiegel erzeugt.
