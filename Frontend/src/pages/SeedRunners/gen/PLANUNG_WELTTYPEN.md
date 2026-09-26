# Umbau: Welttypen statt einer Generator-Form

*Kurswechsel vom 23.09.2026. Ersetzt die Phasen 3–5 aus [PLANUNG_WELTEN.md](./PLANUNG_WELTEN.md);
Phase 1 und 2 von dort bleiben als Fundament bestehen und werden hier zerlegt.*

---

## 1. Befund: Was hält, was bricht

Ich habe den Bestand daraufhin gelesen, ob er eine Annahme über die FORM der Welt macht.

| Baustein | Urteil | Begründung |
| --- | --- | --- |
| `level/format.js`, `level/limits.js` | **hält** | Kennt nur Raster + Elemente. `meta` steht außerhalb des Inhalts-Hashs — Welttyp und Kernidee passen dort hinein, ohne bestehende Level zu entwerten. |
| `sim/` (16 Elemente, Kachelarten) | **hält** | Mover, Portal, Gravitationszone, Wind, Bröckel, Fallblock, Feder, Ring, Kristall, Schalter, Tür, Laser, Säge, Spike + Eis/Klebrig/Förderband/Einweg als Kacheln. Das reicht für alle 10 gewünschten Welttypen ohne ein einziges neues Element. |
| `gen/solver.js` | **hält im Kern** | Spielt die echte Sim, kennt also Timing. Hat bereits Grapple-Aktionen und Schlüssel/Tür-Teilziele. Zwei Schwächen, siehe unten. |
| `client/worldOverview.js`, Worker | **hält** | Zeichnet Raster und Marken, unabhängig von der Form. |
| `gen/v2/repair.js` | **halb** | Die Schleife „Front suchen → flicken" ist allgemein. `patch()` verlängert aber immer **nach rechts** — in einem Turm muss sie nach oben flicken. |
| `gen/v2/layout.js` | **bricht** | `profile` ist ein Wert JE SPALTE: eine eindimensionale Höhenfunktion. Das *ist* die Annahme „ein durchgehender Boden". Auch `zones` mit `x0/w/entryRow/exitRow` ist rein waagerecht gedacht. |
| `gen/v2/terrain.js` | **bricht** | Jede Grabefunktion beginnt bei einer Bodenlinie. `createGrid` füllt mit **Fels** — für das Himmelsreich ist Luft der Grundstoff, dort ist alles invertiert. |
| `gen/v2/reachability.js` | **bricht** | `isStanding` = Luft über Fels. Bewegende Plattformen, Grapple-Anker, Portale, Gravitationswechsel und Federn sind für den Graph **unsichtbar**. Das ist der größte Blocker. |
| `gen/v2/generate.js` | **bricht** | Die Reihenfolge der Stufen ist fest verdrahtet. |
| `client/camera.js` | **fehlt etwas** | Folgt sauber in beide Richtungen (ein Turm geht also schon), aber kennt kein Auto-Scrollen (für „Dauerlauf"). |

### Zwei konkrete Fehler, die dabei aufgefallen sind

**1. Der Solver verwechselt Zeitpunkte.** In `keyOf()` steht die Zeit-Phase als
`Math.floor(tick / 6) % 24` — das sind 144 Ticks, also **1,2 Sekunden**. Ein Laser hat aber eine
Periode von 2,4 s, eine Säge umkreist ihren Anker in 3,3 s. Zwei Zustände, die eine halbe
Laserperiode auseinanderliegen, gelten dem Solver damit als **derselbe** und einer wird verworfen.

Das macht keine falschen Level gültig — `finish()` spielt den gefundenen Weg in einer frischen Welt
nach und würde einen Scheinweg abfangen. Es macht den Solver aber **blind für Timing-Level**: Er
findet den Weg nicht, obwohl es ihn gibt. Für „Laser-Hölle" und „Uhrwerk" ist das der Unterschied
zwischen „geht" und „geht nicht". Muss in Phase B auf das kleinste gemeinsame Vielfache der
tatsächlich vorkommenden Perioden geweitet werden.

**2. Die Heuristik ist Luftlinie.** `score()` bewertet nach `|dx| + 0,7·|dy|` zum Ziel. In einem
Portal-Labyrinth zeigt die Luftlinie in die falsche Richtung, und in einem Turm ebenso, sobald der
Weg erst nach unten führt. Lösung steht unten: Der Bewegungsgraph liefert die Heuristik.

---

## 2. Die tragende Idee des Umbaus

Heute gibt es **eine** Pipeline mit Parametern. Künftig gibt es **einen Vertrag** und viele Module,
die ihn erfüllen. Der Generator wird vom Baumeister zum Bauamt: Er stellt Werkzeug und Regeln, das
Level entwirft der Welttyp.

```
gen/world/
  vertrag.js          was ein Welttyp liefern muss — und die Prüfung, dass er es tut
  registry.js         alle Welttypen, Gewichte, Auswahl per Seed
  typen/
    hoehlen.js        der heutige Generator, eingepackt  (Phase A)
    himmelsreich.js   parcours.js   turm.js              (Phase B)
    …                 je Welttyp EINE Datei              (Phase E)
  gemeinsam/
    startplattform.js sichere Start- und Zielplattform — für ALLE verbindlich
    marken.js         Checkpoints setzen (nie auf Bewegtem)
    palette.js        Element-Palette mit Gewichtung
    raster.js         Rasterwerkzeug, Grundstoff Fels ODER Luft
  reichweite/
    graph.js          Kern des Bewegungsgraphs
    faehigkeiten/     je Kantenart ein Modul: boden, mover, grapple, portal, gravitation, feder
  ideen/
    kernideen/  extrem/  momente/  mutatoren/
  KATALOG_IDEEN.md
```

### Der Vertrag

```js
{
  id, label, beschreibung,
  kamera:      'horizontal' | 'aufwaerts' | 'abwaerts' | 'gemischt' | 'autoscroll',
  achse:       'x' | 'y',            // Hauptrichtung — Reparatur und Bewertung brauchen sie
  grundstoff:  'fels' | 'luft',      // womit das leere Raster beginnt
  faehigkeiten: ['boden', 'mover', 'grapple', …],   // welche Kanten der Graph hier zählen darf
  palette:     { haupt: […], neben: […], verboten: […] },
  biome:       […],
  masse(params) -> { width, height },
  baue(ctx)    -> { raster, zonen, marken, notizen },
}
```

`vertrag.js` prüft jedes Modul beim Laden: Sind die Pflichtfelder da, ist die Palette widerspruchsfrei
(nichts gleichzeitig Haupt- und verboten), passen die Maße in `LIMITS`? Ein Welttyp, der den Vertrag
bricht, fliegt sofort auf und nicht erst als kaputtes Level.

### Der steckbare Bewegungsgraph — und warum er überhaupt funktioniert

Der Graph kennt heute eine Kantenart. Künftig trägt jede **Fähigkeit** eigene Kanten bei:

| Fähigkeit | Kante |
| --- | --- |
| `boden` | wie heute: Standfläche → Standfläche |
| `mover` | jeder Punkt der Plattformbahn wird zur Standfläche |
| `grapple` | Anker in Reichweite → Schwungziele |
| `portal` | Eingang → Ausgang, kostenlos |
| `gravitation` | in der Zone kehrt sich der Standflächen-Test um (Decke wird Boden) |
| `feder` / `ring` | Absprung → Landepunkt auf der Wurfbahn |

**Dass das überhaupt erlaubt ist, folgt aus einer Regel, die du selbst gesetzt hast:** „Nie eine
Stelle, die nur mit einem bestimmten Startzeitpunkt lösbar ist — Wartepunkte oder Zyklen, die Warten
erlauben." Genau deshalb darf der Graph die Zeit wegabstrahieren: Was zyklisch wiederkehrt und
worauf man warten kann, ist im Graph eine ganz gewöhnliche, immer vorhandene Kante. Die Fairness-
Regel ist nicht nur Spielerfreundlichkeit — sie ist die Voraussetzung dafür, dass die schnelle
Prüfung (Millisekunden) überhaupt gültig bleibt. Der Preis: Jeder Welttyp muss sie einhalten, und
`vertrag.js` muss sie erzwingen.

### Der Solver bekommt die Heuristik aus dem Graph

Statt Luftlinie: eine Breitensuche vom ZIEL rückwärts über den Bewegungsgraph liefert für jede
Standfläche die Restentfernung. Der Solver benutzt sie als Bewertung. Das kostet fast nichts (der
Graph existiert ohnehin) und löst Portale, Türme und Abstiege in einem Zug — überall dort, wo die
Luftlinie lügt.

---

## 3. Feste Regeln für alle Welttypen

Diese stehen in `gemeinsam/` und werden von `vertrag.js` erzwungen, nicht der Höflichkeit überlassen:

1. **Sichere Startplattform**: mindestens 8 Kacheln eben, keine Gefahr in 12 Kacheln Umkreis, freier
   Himmel darüber. Das behebt zugleich, dass Level heute auf unebenem Grund beginnen.
2. **Erkennbare Zielplattform**: eben, breiter als der Rest, von weitem sichtbar.
3. **Die ersten Sekunden sind ungefährlich** und zeigen die Kernidee harmlos.
4. **Checkpoints auf festem Grund**, nie auf Bewegtem, nie in einer Gravitationszone.
5. **Jede Gefahr ist sichtbar, bevor sie tötet** — Prüfung: Auf der Route gibt es keinen Punkt, an
   dem eine tödliche Kachel außerhalb des Sichtfensters (480 × 270) liegt und in < 0,4 s erreicht wird.
6. **Warten muss möglich sein** (siehe oben).
7. Welttyp und Kernidee stehen im Level und werden vor dem Start angezeigt.

---

## 4. Phasen

| Phase | Inhalt | Fertig, wenn … |
| --- | --- | --- |
| **A** | Vertrag, Registry, `gemeinsam/` (Startplattform!), Höhlen als erster Welttyp, Seed-Galerie mit 30 Minikarten | Der heutige Generator läuft unverändert als Welttyp „Höhlen"; jedes Level startet auf einer ebenen sicheren Plattform; die Galerie zeigt 30 Seeds. |
| **B** | Himmelsreich, Hindernis-Parcours, Turm. Graph-Fähigkeiten mover/grapple/feder. Solver: Zeit-Phase weiten + Heuristik aus dem Graph. Reparatur mit Achse. | Die drei Typen sind schon als Minikarte auseinanderzuhalten; Solver schafft Stichproben aus jedem Typ; Batch-Statistik je Typ steht. |
| **C** | Kernideen-System (Bogen: einführen → variieren → zuspitzen → brechen), ≥ 20 Kernideen, Extrem-Varianten, Signature-Momente als Bausteine | Jede Kernidee ist einmal per Solver belegt; Galerie filtert nach Idee/Extrem/Moment. |
| **D** | Die ursprünglichen Phasen 3–5 — Rhythmus, Kombinations-Grammatik, Qualitäts-Score — aber **je Welttyp konfigurierbar** | Score und Rhythmus lassen sich pro Typ anders gewichten; Batch über 1000 Seeds. |
| **E** | Restliche Welttypen, restliche Ideen, Mutatoren | Laufend. |

**Verteilung** (Phase C): ~65 % normal, ~25 % starke Kernidee, ~10 % Extrem; Signature-Momente 1–3
je Level; Mutatoren ~10 %. Dieselbe Idee nie in zwei aufeinanderfolgenden Runden einer Lobby —
das gehört in `roomManager.js` zur Serien-Planung, nicht in den Generator.

---

## 5. Was der Umbau kostet (ehrlich)

- **Der SIM-Fingerprint muss sich einmal ändern.** „Eine Taste weniger", niedrige Schwerkraft und
  doppeltes Tempo brauchen eine Feinabstimmung, die am LEVEL hängt; heute nimmt `createLevelWorld()`
  sie nur als Aufruf-Option entgegen. Das ist eine Änderung in `sim/`.

  *Korrektur gegenüber der ersten Fassung dieses Plans:* Ich hatte geschrieben, das entwerte die
  Prüfsummen auch für eigene Level. **Das stimmt nicht.** Geprüft wird EINMAL beim Einreichen
  (`daily.js submit()` → `verifier.verify()` → `recordVerified()`); gespeicherte Läufe behalten ihr
  `simFp` und werden nie erneut geprüft. Ein SIM-Wechsel kostet damit nur ein kurzes Deploy-Fenster,
  in dem ein Browser mit altem Stand „ungeprueft / bitte neu laden" zurückbekommt. Rückwirkend geht
  nichts verloren.
- **Der GEN-Fingerprint ändert sich laufend**, solange gebaut wird. Das Tagesrennen sollte deshalb
  erst mit Phase D auf v2 umgestellt werden, nicht vorher.
- Phase 1/2-Code wird nicht weggeworfen, aber **zerlegt**: `layout.js` und `terrain.js` wandern
  weitgehend nach `typen/hoehlen.js`, `reachability.js` wird zu `reichweite/graph.js` +
  `faehigkeiten/boden.js`.

---

## 6. Entscheidungen (getroffen am 23.09.2026)

1. **Der SIM-Bruch kommt in Phase C**, nicht früher — und dann gebündelt mit allem, was die Sim für
   den Katalog braucht (Feinabstimmung am Level, Sprungsperre). Begründung: Der Grund, früh zu
   brechen, war die Angst vor rückwirkend entwerteten Prüfsummen — die es nachweislich nicht gibt
   (siehe Korrektur oben). Damit gilt wieder die einfachere Regel: **ändern, wenn es gebraucht
   wird**, nicht auf Vorrat. Phase A und B kommen ohne aus.
2. **Alte Chunks**: nach Messung entschieden, siehe Abschnitt 7.
3. **Das Tagesrennen bleibt bis Phase D auf v1** (vom Nutzer bestätigt). Bis dahin darf sich der
   GEN-Fingerprint beliebig oft ändern, ohne dass es jemanden stört.
4. **Der Ideen-Katalog bleibt vorerst vollständig.** Aussortiert wird später beim Spielen, nicht
   vorher auf dem Papier.

---

## 7. Fortschritt

| Phase | Stand |
| --- | --- |
| A Vertrag, Registry, gemeinsame Regeln, Höhlen, Seed-Galerie | **fertig** (23.09.2026) |
| B Himmelsreich, Parcours, Turm · Graph-Fähigkeiten · Solver | **fertig** (23.09.2026) |
| C Kernideen, Extrem-Varianten, Signature-Momente · SIM-Bruch | **begonnen** — System + 9/25 Kernideen fertig (#9/#10/#25 am 23.09., #12/#19/#5/#11/#21/#20 am 25.09.2026, siehe Abschnitte 12–15), Rest offen |
| D Rhythmus, Grammatik, Score je Welttyp · Tagesrennen auf v3 | offen |
| E Restliche Welttypen, Mutatoren | offen |

### Die alten Chunks: gemessen, nicht geschätzt

`npm run seedrunners:solve -- --class all --samples 2` → **396 / 396 gelöst in 327 s**. Alle 68
v1-Chunks sind in allen drei Tempo-Klassen vom echten Solver bewältigt. Sie bleiben also und werden
in Phase D zu Bausteinen für den Welttyp „Höhlen" (und nur dort, wo die Palette passt). Die Frage
„je nachdem, wie gut sie funktionieren" ist damit beantwortet: Sie funktionieren vollständig.

### Was Phase A gebracht hat

| Größe | Wert |
| --- | --- |
| Welttypen in der Registry | 1 (Höhlen & Minen) — der Rahmen trägt, die Vielfalt kommt in B und E |
| Zusammenhang | 270 / 270 über alle Längen, Tempo-Klassen und Schwierigkeitsgrade |
| Startplattform-Mängel | 0 von 30 — jedes Level beginnt eben, frei und ohne Gefahr in Reichweite |
| Seed-Galerie | 30 Minikarten, nach Welttyp gruppiert |
| SIM-Fingerprint | **unverändert** (`6fbba6ad…`) — Phase A kam ohne Sim-Änderung aus |

**Ein Fehler, den Phase A selbst erzeugt und wieder eingefangen hat:** Der freie Anlauf hinter der
neuen Startplattform räumte stur sechs Spalten weiter — mitten in den Schacht der Nachbarzone, wo er
die Vorsprünge löschte. Die Route riss ab, und die Reparatur flickte danach zehn Runden lang an den
Folgen statt an der Ursache (3 von 30 Welten). Die Plattform bekommt jetzt eine `grenze` mitgegeben
und fasst nichts außerhalb der Startzone an; ein Test hält das fest.

**Und einen, den erst die Galerie sichtbar gemacht hat:** Die Gruppenüberschrift hieß „?" und die
Kennzahl „Welttyp" war leer — der Worker erzeugte noch über den alten v2-Einstieg. Genau dafür ist
die Galerie da: Eine einzelne Welt sah völlig in Ordnung aus.

`gen/v2/generate.js` ist entfallen — `gen/world/generate.js` ersetzt ihn. `gen/v2/` ist jetzt das,
was es sein soll: die Bausteine (Layout, Terrain, Bewegungsgraph, Reparatur), die der Welttyp
„Höhlen" benutzt.

### Was Phase B gebracht hat

Drei neue Welttypen, der Bewegungsgraph wurde dafür STECKBAR gemacht (`floodReachable()` nimmt
jetzt einen optionalen vierten Parameter `zusatz` mit `virtualStands` und `brueckenVon` entgegen —
ohne ihn byte-identisch zum alten Verhalten, geprüft). Drei neue Fähigkeits-Module
(`gen/world/faehigkeiten/`): `mover.js` (bewegte Plattformen als virtuelle Standflächen — erlaubt
durch die Fairness-Regel „man darf warten"), `grapple.js` (Anker als Brücken, Reichweite aus
`TUNING.grappleRange`, nicht geraten), `feder.js` (Federn/Ringe als ballistische Landepunkte).

| Welttyp | Kamera/Achse | Fähigkeiten | Zusammenhang gemessen | Solver-Beweis |
| --- | --- | --- | --- | --- |
| Himmelsreich | horizontal/x | boden, mover, grapple | **270/270** (0 Reparaturen nach dem Fix) | 5/5 kurze Level komplett gelöst (1300–1832 Ticks) |
| Hindernis-Parcours | horizontal/x | boden | **270/270** | 5/5 kurze Level komplett gelöst (1300–1356 Ticks) |
| Turm | aufwärts/y | boden | ~~270/270~~ **falsch**: der Graph war durchlässig, KEIN Turm war spielbar (siehe „Der Turm war nie durchspielbar", 24.09.2026) | seit 24.09.2026: **90/90** ganze Türme (Umweg-Heuristik) |

**Drei Fehler in Himmelsreich, alle durch Batch-Messung gefunden, keiner durch Zusehen:**
1. Ein VORGRIFF im RNG-Strom: Die „nächste Inselhöhe" wurde zur Bemessung einer Brücke einmal
   vorab gezogen und in der nächsten Runde NOCH EINMAL gewürfelt — zwei verschiedene Werte aus
   demselben Strom. Jede Pendelplattform fuhr dadurch an der falschen Stelle vorbei. Behoben durch
   zwei Durchgänge: erst ALLE Inselhöhen, dann erst die Brücken.
2. Ein Index-Fehler (dieselbe Verschiebung wie in `v2/terrain.js carveIslands`, dort korrekt
   behandelt): Das Sprungbudget aus dem Graphen ist ein `dx`-Abstand zwischen Standkacheln, „Lücke"
   in der Erzeugung war die Zahl LEERER Spalten dazwischen — ein Kachel-Unterschied, der bei
   ausgereiztem Budget (Schwierigkeit 1) genau den Unterschied zwischen Sprung und Sturz machte.
3. Der Greifanker-Reichweitentest erzwang „mindestens `maxGap`" als Lücke, auch wenn die Geometrie
   (feste Ankerreichweite gegen wachsendes `maxGap` bei hoher Schwierigkeit) das gar nicht hergab —
   erzeugte Lücken, die kein Anker der Welt überbrückt. Jetzt bestimmt die Geometrie die Obergrenze,
   nicht umgekehrt.

**Ein Fehler, der zweimal auftrat (Himmelsreich UND Turm) und beide Male dieselbe Lehre bestätigt:**
`repairWorld()` zielte auf „nahe am Kartenrand" statt auf den echten Zielpunkt. Bei Himmelsreich
(16 Spalten Nachlauf hinter der Zielplattform) lief die Reparatur sinnlos bis in die leere Luft
weiter — 558 überflüssige Flicken über 270 Welten, obwohl praktisch jede Welt schon beim ersten
Bauen vollständig zusammenhing. Behoben: `repairWorld()` bekommt jetzt optional das ECHTE Ziel
(`opts.ziel`), fällt ohne Angabe auf das alte Randverhalten zurück (Höhlen unverändert).

### Turm: die Lücke, jetzt strukturell behoben

Turm hängt seine Rastkammern in DENSELBEN Spalten wie den Schacht an (Höhlens Ausstieg liegt
versetzt in einer eigenen Spur). Dadurch konnte der ÄUSSERSTE Vorsprung eines Schachts der
Kopffreiheit-Prüfung (`HEAD_ROOM` = 3 freie Zeilen ÜBER der Standfläche) zu nahe an den Kammerboden
rücken: `buildLedges()` endete planmäßig nur `dy` (≤ 3 Zeilen, `LEDGE_DY`) unter der Zielhöhe — das
reicht nicht, wenn genau dort eine volle Zeile Kammerboden wartet. Die Standfläche verschwand dann
lautlos aus dem Bewegungsgraphen (kein Fehler, sie erfüllte die Bedingung schlicht nicht mehr).

Erstmessung (10 Seeds × 3 Längen × 3 Tempo-Klassen = 90 Welten je Schwierigkeit):
S1 49/90 · S2 57/90 · S3 65/90 · S4 65/90 · S5 90/90 — nur bei der höchsten Schwierigkeit
(größtes `maxUp`) verschwand die Lücke von selbst.

**Zwei Nachbesserungen am Symptom sind gescheitert, bevor der Fix an der Wurzel ansetzte:**
1. Ein reines „Lücke halbiert" in der Reparatur brauchte bei größerem Rückstand unendlich viele,
   immer kleinere Schritte (24 identische Flicken in Folge, kein Fortschritt).
2. Ein nachträgliches „zu nahe Vorsprünge entfernen, einen neuen im richtigen Abstand danebensetzen"
   (`sichereLetzteStufe()`, inzwischen wieder entfernt) traf beim Setzen der neuen Stufe fast immer
   eine BESTEHENDE, weiter innen liegende Sprosse auf derselben Spalte — jedes Kopfraum-Fenster, ob
   `CORRIDOR_H` (11 Zeilen, zu großzügig) oder `HEAD_ROOM + 1` (4 Zeilen, immer noch zu viel), erwischte
   irgendwann eine Sprosse, die genau in diesem Abstand lag, und löschte sie wieder. Whack-a-Mole,
   kein Fix.

**Der eigentliche Fix sitzt jetzt in `buildLedges()` selbst** (`gen/v2/terrain.js`, neuer optionaler
Parameter `edgeGap`): Statt die Leiter blind gleichmäßig über den GANZEN Schacht zu verteilen und
hinterher am Rand nachzubessern, wird bei `edgeGap > 0` der Bereich, über den verteilt wird, von
vornherein um `edgeGap` an beiden Enden verkürzt — UND (anders als im Normalfall, der beide Enden
überspringt) werden genau die beiden Randsprossen mitgesetzt. Der äußerste Vorsprung landet dadurch
exakt `edgeGap` vor der echten Grenze, alle Zwischenschritte bleiben wie gehabt ≤ `maxUp`. Turm ruft
das mit `edgeGap = min(maxUp, HEAD_ROOM + 1)` auf; ohne den Parameter (Höhlen) ist das Verhalten
unverändert. Keine nachträgliche Kollision mehr möglich, weil nichts mehr nachträglich verschoben
wird — die Leiter ist von Anfang an richtig.

**Nebenbefund beim Debuggen — ein zweiter, unabhängiger Fehler in gemeinsamem Code seit Phase 1:**
`flightClear()` (`gen/v2/reachability.js`) behandelte einen rein senkrechten Sprung (`dx = 0`, x0
== x1) falsch: `dir = x1 > x0 ? 1 : -1` wird bei Gleichheit zu `-1`, die Schleife lief dann von x0
aus IMMER WEITER WEG vom Ziel und brach erst am simulierten Kartenrand ab — das Ergebnis war für
JEDEN senkrechten Sprung ohne seitlichen Versatz `false`, obwohl nichts im Weg stand. Bei Höhlen
unbemerkt geblieben, weil die abwechselnden Vorsprünge dort so gut wie nie exakt in derselben Spalte
übereinanderliegen; beim Turm, wo eine volle Kammerbreite als Ziel gilt (jede Spalte ist ein
gültiges Ziel), tritt `dx = 0` dagegen ständig auf. Jetzt ein eigener Zweig für den Fall `x0 === x1`.
Für sich genommen hat dieser Fix die vier zuletzt verbliebenen Fehlschläge NICHT behoben (dieselben
Seeds fielen davor und danach gleich aus) — die eigentliche Ursache war der `buildLedges()`-Fix oben.
Trotzdem ein echter, reportabler Fund: ein seit Phase 1 unbemerkter Fehler im gemeinsamen
Bewegungsgraphen, nicht turm-spezifisch.

Endmessung nach beiden Fixes (6 Seeds × 3 Längen × 3 Tempo-Klassen × 5 Schwierigkeiten = 270):
**270/270, 0 Reparaturen.** Ein Test hält das für alle fünf Schwierigkeiten fest
(`gen/world/__tests__/welt.test.js`, „hängt bei jeder Schwierigkeit vollständig zusammen").

### Was Phase C bisher gebracht hat (begonnen, nicht fertig)

**Das System steht, drei von 25 Kernideen sind gebaut und solver-geprüft.** Architektur unter
`gen/world/ideen/` (spiegelt `gen/world/` selbst): `vertrag.js` (Pflichtfelder + drei optionale
Hooks), `registry.js` (Auswahl per Seed, eigener Teilstrom `v2:kernidee`, unabhängig von
`v2:welttyp`). Eine Kernidee greift NIE selbst ins Raster ein — sie beeinflusst nur, welches
Element ein Welttyp an seinen EIGENEN Entscheidungspunkten wählt (`gewichtePalette`) und mit
welchen Parametern (`wandleElement`); ein optionaler dritter Hook (`vorbereiten`) würfelt EINMAL pro
Level einen Idee-eigenen Zustand (z. B. "welche Gefahrenart wird DIE eine"), über einen eigenen,
an die Idee-id gebundenen Teilstrom.

Damit eine Idee ohne die genauen Label-Namen jedes Welttyps auskommt, übergibt jeder Welttyp beim
Aufruf eine `kategorie(art)`-Funktion, die sein eigenes internes Vokabular ("saege", "spikePaar", …)
auf eine welttyp-unabhängige Kategorie abbildet (`'spike' | 'saw' | 'laser' | 'struktur' | 'sonst'`).
Nur so bleibt „Sägen im Takt" wiederverwendbar, egal ob parcours seine Sägen "saege" nennt oder ein
künftiger Welttyp sie anders nennt.

**Verteilung normal/stark/extrem (65/25/10, §4)** ist gebaut — der Extrem-Katalog selbst noch nicht,
eine gewürfelte "extrem"-Stufe fällt deshalb vorerst auf "stark" zurück (EIN Wurf, ein
Nachbearbeitungsschritt, kein zweiter Wurf — sonst verschöbe sich bei jedem künftigen
Extrem-Varianten-Zuwachs, welche Kernidee ein bestehender Seed bekommt).

**Drei Kernideen, kompatibel mit parcours und turm:**
- **Sägen im Takt** (#9): alle bewegten Sägen teilen Tempo und Phase, die Periode verengt sich zum
  Levelende (3,2 s → 2,0 s normal, → 1,6 s stark).
- **Laser-Ampeln** (#10): alle nicht-drehenden Laser laufen synchron im selben Takt (gehen/halten),
  Tastverhältnis 55 %, Periode verengt sich ebenso.
- **Ein Element, alle Rollen** (#25): eine von drei Gefahrenarten (Spike/Säge/Laser) wird einmal pro
  Level gewürfelt, die Palette lässt danach nur noch diese eine Art zu (Struktur-Elemente wie Lücken
  und Federn bleiben immer erlaubt — die Idee schränkt die Gefahr ein, nicht die Fortbewegung).

Gemessen (jede Idee × jeder kompatible Welttyp × 3 Schwierigkeiten × 3 Längen × 3 Seeds):
**270/270 hängen zusammen, 0 Start-Mängel.** Zusätzlich 1080 Kombinationen über
Welttyp×Kernidee×Länge×Tempo-Klasse×Schwierigkeit×3-Seeds ohne einen einzigen Fehlschlag.
20 neue Tests unter `gen/world/ideen/__tests__/ideen.test.js` (Vertrag, Registry, Zusammenspiel mit
`generateWorld()`, sichtbare Wirkung jeder Idee, Zusammenhang).

**Bewusst NICHT in diesem Schritt:**
- Höhlen und Himmelsreich bekommen noch keine Kernidee-Hooks (ihre internen Entscheidungspunkte
  liegen tiefer in `v2/terrain.js` bzw. `himmelsreich.js`s Brücken-Logik — ein Umbau mit mehr
  Regressionsrisiko als parcours'/turms bereits vorhandene, saubere weighted-pick-Stellen).
- Extrem-Varianten (§3, 25 Einträge) und Signature-Momente (§4, 35 Einträge) sind noch nicht
  gebaut — beide brauchen eine EIGENE Auswahl-/Kombinationslogik, keine Erweiterung der Kernidee.
- Der SIM-Bruch (Level-Tuning, Sprungsperre — §6 der Katalog-Tabelle "was noch fehlt") ist noch
  nicht nötig gewesen: Alle drei gebauten Ideen kommen mit dem heutigen Sim-Vorrat aus.
- Ideen, die Boden-Kachelart wechseln (Förderband/Eis/klebrig — Kernidee #2, #17, Mutator #7/#10),
  sind ABSICHTLICH noch nicht gebaut: Abspringen von einem Förderband übernimmt dessen Tempo
  (`p.vx += p.lastGroundVx`, sim/player.js) — ein Sprung GEGEN die Bandrichtung könnte dadurch kürzer
  tragen, als der Bewegungsgraph (gemessen an stillstehendem Boden) annimmt. Vor dem ersten
  Boden-Reskin-Kernidee braucht es eine eigene, gemessene Reichweiten-Korrektur dafür — nicht
  nebenbei mitgebaut, sondern ein eigener, kleiner Schritt (mit einem Sicherheitsabzug bei
  Sprüngen ENTGEGEN der Bandrichtung).
- Weder Galerie- noch Werkbank-Filterung "nach Idee/Extrem/Moment" (das Fertig-Kriterium aus §4)
  ist vollständig — Werkbank und Galerie können eine Kernidee aber schon ERZWINGEN (Dropdown) und
  zeigen sie an (Kpi bzw. Minikarten-Beschriftung), das war mit nur 3 Ideen der sinnvollere erste
  Schritt als ein Filter für einen Katalog, der noch zu 88 % leer ist.

### Nach dem ersten echten Spieltest (23.09.2026): sechs gemeldete Probleme

Der bis dahin ausschließlich mit Graph/Solver geprüfte Stand hatte eine Lücke, die keiner der beiden
Nachweise sieht: Ob ein Element GESPIELT werden kann. `checkLevel` prüft nur Fels-Geometrie, gar
keine Elemente; der Solver ist zu langsam für volle Türme und wurde für Himmelsreich/Höhlen nicht
auf JEDE Kombination losgelassen. Sechs reale Befunde, alle behoben oder ehrlich als offen markiert:

1. **Turm: manche Level nicht schaffbar.** Ursache: Das Gefahr-je-zweitem-Schacht-Element (turm.js)
   schwebte MITTEN im engen (5–7 Kacheln breiten) Schacht — genau dort, wo die einzige Kletterspur
   zwischen zwei Vorsprüngen verläuft. `checkLevel` prüft nur Fels, hätte einen dort sitzenden Saw
   oder Laser nie gefunden. Fix: Das Element sitzt jetzt auf dem KAMMERBODEN (volle Turmbreite,
   Bodenhindernis wie bei parcours übergehbar) statt frei im Schacht.
   **Korrektur (24.09.2026): Das war NICHT die Ursache, jedenfalls nicht die einzige — jeder Schacht war oben von
   der Kammerdecke verschlossen, siehe „Der Turm war nie durchspielbar" am Ende dieser Datei.**
2. **Höhlen: keine Elemente, sieht immer gleich aus.** `hoehlen.js` gab noch nie `entities` zurück —
   ein seit Phase 1/2 offener Rest, keine Regression. Neu: `bestreueZone()` verstreut Spike/Saw/
   Laser/Feder in ebenen Zonen (lauf/tunnel/kammer — NICHT in Schächten/Inseln, dieselbe Lehre wie
   Punkt 1), über den `naechsteStandflaeche()`-Sucher (gemeinsam/plattform.js, neu), weil `profile[x]`
   nur eine grobe Interpolation ist, keine exakte Standflächen-Zusage (gemessen: 18 von 23 Stichproben
   auf der reinen Profil-Zeile lagen NICHT auf echtem Boden). Über denselben Kernidee-Haken wie
   parcours/turm — `hoehlen` ist jetzt drittes kompatibles Welttyp für alle drei bisherigen Ideen.
3. **Serverlast bei vielen Seeds: kein Problem.** Geprüft im Store (`Backend/seedRunners/store.js`):
   Gespeichert wird pro Tag/Level NIE der generierte Inhalt, nur ein winziger Datensatz (Zeit, Tode,
   Replay-Log). Level entstehen serverseitig wie clientseitig deterministisch aus dem Seed neu — auch
   bei Millionen Einträgen bleibt jede Zeile ein paar hundert Byte bis wenige KB. Nur veröffentlichte
   CUSTOM-Level (`sr_levels`, Editor) speichern ein komprimiertes Dokument — das ist an redaktionelle
   Veröffentlichung gebunden, nicht an Seed-Anzahl.
4. **Fällt zu lange bis zum Tod.** Ursache gefunden UND gemessen: `world.js` tötet erst am Kartenrand
   (`map.h*TILE+KILL_MARGIN`); WORLD_H=150 ist so groß bemessen, dass das Routenprofil überall
   zwischen ROUTE_TOP(12) und ROUTE_BOTTOM(136) driften darf. Bei Himmelsreich (Grundstoff 'luft':
   ÜBERALL Luft außer den Inseln) sitzt darunter buchstäblich nichts — ein Sturz von einer hoch
   gelegenen Insel ging bei terminalSpeed=380px/s über 4 Sekunden. Fix (generate.js, gemeinsame
   Schicht): Das Raster wird hinter der tatsächlich tiefsten benutzten Zeile abgeschnitten (Raster-
   Scan, nicht nur Zonen-Metadaten — eine Senke/Abkürzung könnte tiefer reichen als das Zonen-Profil),
   plus 18 Kacheln Sicherheitsrand (~0,9 s Sturz). Bei 'fels'-Welttypen (Höhlen/Parcours) ist das ein
   No-op: Dort ist der Grundstoff SOLIDE, ein Sturz endet fast immer schnell am nächsten Fels — nur
   Himmelsreich schrumpfte in der Messung wirklich (150 → 102 Zeilen).
5. **Parcours: Sachen im Boden.** Root Cause: `spike`/`spring` erwarten laut ihrem eigenen Modul
   (spike.js `facing()`, spring.js `padRect()`) UND laut Testkonvention (`STAND`, elements.test.js)
   die STANDFLÄCHE (Luft über dem Boden) als `ty` — parcours.js setzte `ty: row`, die FELS-Zeile
   selbst. Die Trefferfläche landete dadurch eine Kachel zu tief, im Fels. `saw` war schon korrekt
   (`ty: row - 1`), `laser` braucht `ty: row` ABSICHTLICH (`ELEMENT_TILE.laser = SOLID`, der Emitter
   sitzt im Block). Fix: `spike`/`spring` jetzt auf `row - 1`. Verifiziert: 18 von 18 Stichproben
   jetzt auf Luft-über-Fels statt im Fels.
6. **Himmelsreich: Grapple-Aufstieg stößt von unten gegen die Zielplattform.** Ursache gefunden:
   Der Anker saß auf halber Höhe zwischen Start- und Zielinsel minus einem festen, kleinen Lift (3) —
   bei einem großen Höhenunterschied (rise ~6) landete er dadurch UNGEFÄHR AUF Höhe der Zielinsel,
   nicht darüber. Fix: Der Anker sitzt jetzt über der HÖHEREN der beiden Inseln (`ANKER_LIFT` jetzt
   8 statt 3), mit angepasster `grappleGapMax`-Geometrie (die tiefere Insel ist jetzt weiter vom
   Anker weg als vorher — das schrumpft die geometrisch erlaubte Lückenweite, bewusst: Reichweite
   darf nie größer aussehen, als der Anker wirklich hergibt). **Ehrlich unklar, was der Solver dazu
   sagt:** Batch von 21 Himmelsreich-Kurzleveln mit mindestens einer Aufstiegs-Brücke (rise > 3):
   VORHER 15/21 lösbar, NACHHER ebenfalls 15/21 — dieselbe Quote, aber eine ANDERE Teilmenge (zwei
   Level kippten von fehlgeschlagen zu gelöst, zwei umgekehrt). Der reale Sim-Solver verlangt zwei
   Dinge, die der Bewegungsgraph NICHT prüft: freie Sichtlinie zum Anker (`lineOfSight`) UND einen
   Mindest-Zielwinkel beim Greifen (`GRAPPLE_MIN_AIM_DOT`, player.js) — Stichprobe zeigte freie
   Sichtlinie in allen geprüften Fällen, der Solver nutzt zudem ein FESTES, kleines Set an
   Eingabe-Makros (`ACTIONS`, solver.js) für die Zielrichtung beim Greifen, das feine Anker-Winkel
   verfehlen kann. Die geometrische Korrektur behebt das GEMELDETE Symptom (Anker sitzt jetzt
   nachweislich nicht mehr auf/unter Zielhöhe) und regressiert nichts (alle bisherigen Tests grün,
   270/270 Zusammenhang weiterhin), ist aber NICHT als vollständig gelöst zu verstehen — die
   verbleibende Solver-Quote braucht entweder ein besseres Makro-Set für Grapple-Zielwinkel oder eine
   gezieltere Einzelfall-Untersuchung, beides nicht in dieser Sitzung geleistet.

**Dash nur noch über Kristalle (Sim-Änderung, ebenfalls 23.09.2026).** Rückmeldung: Dash sei "zu op,
besonders im sehr schnellen Modus"; auf Nachfrage global für alle Modi bestätigt. `sim/player.js`:
Bodenkontakt füllt Dash nicht mehr auf (samt dem damit funktionslos gewordenen `dashGroundCooldown`,
komplett entfernt aus player.js/hash.js/config.js); `spring.js` und `ring.js` füllen nur noch den
Luftsprung auf. Einzige Quelle ist `crystal.js` (unverändert). **SIM-Fingerprint gebrochen**
(`6fbba6ad…` → `f3b1ba3f…`) — der in §6 Entscheidung 1 vorgesehene einmalige Bruch, gebündelt mit
Phase C. Nachweis: alle 68 v1-Chunks lösen weiter, **396/396** (vorher ebenfalls 396/396); die
generierten Welten waren nie auf Dash angewiesen (`reachability.js`: "Bewusst NICHT fest verdrahtet:
… Dash-Jump"). Vier Tests, die die alte Auffüllung ausdrücklich prüften, wurden auf das neue
Verhalten umgeschrieben (Bodenkontakt/Sprungpad/Ring füllen Dash NICHT); ein Anti-Cheat-Test
(`Backend/seedRunners/__tests__/replay.test.js`) nutzte einen Chunk, dessen Lösung durch den Umbau so
einfach wurde, dass selbst ein stark gekürztes Log zufällig ins Ziel hielt — auf `spike-gauntlet`
umgestellt, kein Sicherheitsproblem.

**Design-Vorgabe des Nutzers, die den Rest von Phase C steuert:** Gewünscht sind kreative Level aus
KOMBINATIONEN des vorhandenen Element-Vorrats, wie bei Super Mario — nicht das Verändern der
Grundregel eines einzelnen Elements ("komische Modifikationen, wo ein Grappler auf einmal nur noch
einmal funktioniert"), und "nicht zu kompliziert". Betrifft Katalog-Einträge wie Kernidee #1
(Verschwindende Anker), #4 (Checkpoint dreht Gravitation) o. Ä.: Vor dem Bauen einzeln gegenchecken,
nicht automatisch übernehmen. Die drei gebauten Ideen (Rhythmus/Palette) sind davon nicht betroffen.

**Weiterhin offen, nicht behoben:** "Sieht immer gleich aus" ist mit den obigen Fixes (Höhlen hat
jetzt Elemente, Himmelsreich-Geometrie sauberer) nur TEILWEISE angegangen — die strukturelle
Vielfalt (Kernideen, Extrem-Varianten, Signature-Momente, Biom-Einfluss auf Häufigkeiten statt nur
Farben) ist weiterhin der Rest von Phase C, siehe oben.

### Bausteine: Mario-Vielfalt aus dem vorhandenen Vorrat (24.09.2026)

**Befund per Screenshot statt Vermutung.** Die Werkbank-Übersicht zeichnete Elemente gar nicht (nur
Fels) — das allein erklärt einen Teil des „sieht gleich aus"-Eindrucks. Nach dem Nachrüsten (Elemente,
Kachel-Glyphen, Baustein-Namen; `client/worldOverview.js`, liegt bewusst außerhalb von gen/) zeigte sich
das eigentliche Bild: **Parcours** war ein völlig flacher Tunnel (nur die Reihenfolge der Spikes
wechselte), **Höhlen** Hügel mit Ein-Kachel-Stufen und wenigen Punkten, **Himmelsreich** eine glatte
Inselwelle, **Turm** identische Schächte. Die Vielfalt fehlte im GELÄNDE, nicht nur bei den Gefahren.

**Der Hebel lag schon im Repo:** die 68 handgebauten, vom Solver in allen Tempo-Klassen bewiesenen Chunks
(`gen/chunks/`, 396/396) — Gelände (Treppen, Gruben, Schächte, Decken) PLUS eine erprobte Kombination
vorhandener Elemente (Sägen über Eis, Ringe mit Lasern, Bröckelbrücke …). Genau die Art Vielfalt, die der
Nutzer meint („coole Kombinationen aus den Elementen, die wir schon haben", kein Umbau von Grundregeln).

**Umsetzung (Parcours zuerst):**
- `gemeinsam/bausteine.js`: wählt (Kurve, Einführungsreihenfolge, Biom-Vorlieben — unverändert der
  v1-`pickChunk`, dafür exportiert und um einen optionalen `filter` erweitert) und setzt einen Chunk
  **1:1** ins Raster (`stempeln`): dieselben Zeilen, dieselben Elemente, offener Himmel darüber, Fels
  bzw. Luft darunter — wie `assemble()` im v1-Generator, damit der Solver-Beweis weiter gilt.
- Neue Fähigkeit **`baustein`** (`faehigkeiten/baustein.js`): Für den Bewegungsgraph ist ein Chunk eine
  Brücke von Ein- zu Ausgang (sein Inneres kennt der Graph nicht und muss es nicht). Reparatur und
  Prüfung nutzen dieselbe Fähigkeit — sonst „repariert" sie Gruben INNERHALB eines Chunks.
- **Parcours neu:** offener Himmel, Boden = dünne Felsplatte über Luft (Grundstoff `luft`), abwechselnd
  Streusegmente (wie bisher) und Bausteine. Nebenbei ein echter Fehler behoben: die alte „Grube" löschte
  nur die oberste Zeile, der Block darunter blieb Fels — eine harmlose Kerbe statt eines Abgrunds.
  Jetzt sind Gruben wirklich tödlich, und der Sturz endet dank Sturz-Tiefen-Kürzung (generate.js) nach
  wenigen Kacheln.
- Die Schwierigkeitsstufe des Levels deckelt die Bausteine (Stufe 1 → höchstens Chunk-Schwierigkeit 2 usw.).
- **Kernideen ändern Chunk-Elemente NIE** (sie sind nur in genau dieser Form bewiesen). Stattdessen neuer
  optionaler Hook `erlaubtBaustein(tpl, kontext)`: `saegenTakt` schließt Bausteine mit Sägen aus,
  `laserAmpeln` solche mit Lasern, `einElement` alle mit einer anderen Gefahrenart als der gewählten.
  `gefahrenImBaustein(tpl)` liest den Inhalt aus Rasterzeichen und Markern (Tags sind kein Inhaltsverzeichnis).
- `generate.js`: `biomeId` geht an den Welttyp, `meta.bausteine` steht im Level, Zonen können eine
  eigene Checkpoint-Spalte (`cpX`) haben (ein Chunk hat nur zwei sichere Randspalten).

**Gemessen:** Parcours über 162 Kombinationen (Länge × Tempo × Schwierigkeit × Seeds): **162/162** hängen
zusammen, 0 Reparaturen, Start sicher, Sim baut jedes Level, Breite ≤ 726, ≤ 55 Elemente; über das Batch
**48 verschiedene Bausteine**. 10 neue Tests (`__tests__/bausteine.test.js`), gesamt 347 Frontend-/173
Backend-Tests grün. SIM-Fingerprint unverändert (`f3b1ba3f…`), GEN gebrochen (erwartet, Tagesrennen liegt
bis Phase D auf v1). Solver auf GANZEN Leveln: siehe Fortschrittsvermerk am Ende dieses Abschnitts.

**Serverseite (Frage des Nutzers):** Ein Seed braucht keine gespeicherte Konfiguration — die „Konfiguration"
IST der Generator-Code. Gleicher Code + gleicher Seed + gleiche Parameter = bitgleiches Level (Determinismus-
Wache, GEN-Fingerprint). Der Server erzeugt ein Level nur beim Prüfen eines eingereichten Laufs neu
(gemessen 3–70 ms je Level, dazu ein LRU-Zwischenspeicher `levelCache` in `replay.js`). Der Preis ist
Disziplin: Ändert sich der Generator, bedeutet derselbe Seed eine andere Welt. Für die Umstellung des
Tagesrennens auf v3 (Phase D) muss deshalb je Tag die Generator-Version mit abgelegt werden, sonst sind
alte Tage nicht mehr reproduzierbar (gespeicherte Läufe behalten ihre Zeit, werden aber nie neu geprüft).

**Nachprüfung des Parcours mit dem echten Solver (wie belastbar ist „162/162"?).** Der Graph kennt das
Innere eines Chunks nicht, also beweist er dort nichts. Deshalb zwei Solver-Wege:
- **Fenster-Test** (jeder eingesetzte Baustein samt Umgebung als eigenes Mini-Level, ~1 s je Fenster):
  **1080 von 1080 gelöst** (30 Seeds × Schwierigkeit 1/3/5 × 3 Tempo-Klassen), 0 Fehlschläge.
- **Ganze Level:** 4 von 12 mit fester Strahlbreite 200 gelöst, dazu 2 im ersten Lauf. Die Fehlschläge
  häufen sich an denselben Stellen (`key-door`, `sticky-climb`, `spring-tower`). Eingegrenzt: `sp-3`
  löst mit der normalen Eskalation (150→400→900); für `sp-2` (`key-door`) löst ein Fenster mit
  `gap-double` + `key-door` (156 Kacheln) in 9 s, im ganzen Level bleibt die Suche auch nach 7 min hängen
  → **Solver-Skalierung, kein Level-Fehler** (bekannte Schwäche: Zeit-Phase 1,2 s im Zustandsschlüssel,
  Suchbreite; siehe „Zwei Solver-Schwächen"). Die lokalen Beweise setzen sich zusammen, weil Baustein-
  Ränder gefahrenfreier ebener Boden sind (Warten ist erlaubt). Ehrlich: Für `sp-2`/`sp-5` gibt es damit
  keinen Ganzlevel-Beweis, nur die Fenster-Beweise. **(Nachtrag 24.09.2026: gelöst, siehe „Schlüssel-Bonus" am Ende — die Ursache lag im Solver, nicht in den Levels.)**

**Himmelsreich: Baustein-Inseln (dasselbe Werkzeug, Grundstoff Luft).** Einige Inseln werden zu
Baustein-Inseln (feste Zahl je Länge: 3/5/7; Inselzahl insgesamt 14/24/34, damit die Breite unter dem
Limit 1200 bleibt — mit 46 Inseln + 9 Bausteinen kamen 1270 heraus). Eine Baustein-Insel hat zwei Höhen
(`yL`/`yR`); die Brücken rechnen mit der rechten Höhe der einen und der linken der nächsten. Start-
und Zielinsel bleiben schlicht. Fähigkeiten jetzt `['boden','mover','grapple','baustein']`.
**Ein Fehler dabei, ehrlich:** Zuerst ignorierte `naechsterBaustein()` die übergebene echte Inselhöhe und
prüfte den Platz mit der Parcours-Grundlinie — ein hoher Chunk auf einer hohen Insel wäre oben
abgeschnitten worden, ohne dass Graph oder Tests es bemerkt hätten (das Innere ist ihnen unsichtbar).
Jetzt gibt es den Parameter `bodenRow` (Höhe legt der Aufrufer fest, v1-Drift-Filter neutral) und einen
Test, der prüft, dass kein Chunk über den Rasterrand ragt. Gemessen: Graph **324/324**, 0 Reparaturen,
Breite 225–958, 30/42/44 verschiedene Bausteine (kurz/mittel/lang). Fenster-Test (Vorgänger-Insel ·
Brücke · Baustein · Brücke · Nachfolger): rund 300 Fenster, davon 13 in der Standard-Suche offen; ein
zerlegtes Beispiel (`spring-gap`) löst jede Teilstrecke einzeln (Brücke rein 0,2 s, Chunk 0,9 s, Brücke
raus 0,2 s) und die Kette mit Strahlbreite 1500 in 18 s (671 Ticks) — Suchbreite, kein Level-Fehler.
Wiederholung der offenen Fenster mit Breite 1500: 7 von 14 gelöst; die übrigen (`sticky-climb`, ein `ledge-high`) sind
Suchgrenzen der Luftlinien-Heuristik, keine Level-Fehler — mit der Umweg-Heuristik (siehe unten) sind sie als ganze Level
und zerlegt bewiesen.

**Höhlen: Bausteine in Lauf-, Tunnel- und Kammerzonen.** Anders als bei Luft-Welten gibt es hier zwei
Regeln: (1) **nur Chunks mit festem Unterrand** (34 von 68) — in massivem Fels gäbe es unter einer Grube
keinen Abgrund, sie liefe als Schacht bis zum Rasterrand; (2) die Zone wird **vor dem Graben** verbreitert
und ihr Ausgang folgt der Höhe des Bausteins (alle folgenden Zonen rücken nach rechts und um den
Höhenunterschied nach oben/unten; Breite und Profil werden neu berechnet), damit Terrain und Baustein von
Anfang an zusammenpassen — statt hinterher einen Chunk in ein fertiges Gelände zu pressen. Über einem
Baustein in einem Tunnel bricht die Decke zu einer Schlucht zum Himmel auf. Erste Fassung (nur `lauf`-Zonen):
nur 0,8 geeignete Zonen je Level und 12 verschiedene Chunks — deshalb Tunnel/Kammer dazu und die erlaubte
Verschiebung von 4 auf 10 Zeilen. Jetzt: durchschnittlich **3,6 Bausteine je Level, 27 verschiedene, kein
Level ohne**; Graph **216/216**, Fenster-Test bisher 243/243 gelöst. Der Phase-1/2-Test `world.test.js`
musste auf die fähigkeitsbewusste Prüfung umgestellt werden (dieselbe Lehre wie bei Mover/Grapple: die
rohe Prüfung kennt die Baustein-Brücke nicht). 18 Tests in `__tests__/bausteine.test.js`.

**Noch NICHT umgestellt:** Turm (Kammern; Chunk-Geometrie ist waagerecht, der Turm hat 24–28 Kacheln
Breite — bräuchte ein Stockwerk-Konzept). Und: Kernideen, die ganze Bausteine als „Familie" wählen
(z. B. ein reines Säge-Level), wären der natürliche nächste Baustein des Kernideen-Systems — ohne
Regeländerung eines Elements.

### Der Turm war nie durchspielbar (24.09.2026) — und warum keine Prüfung es sah

**Befund.** Beim Versuch, einen ganzen Turm mit dem Solver zu lösen, kam er nie über die erste Kammer hinaus. Die
Ursache stand in `typen/turm.js`: `baueKammer()` mauert die Bodenzeile einer Kammer über die volle Breite zu —
NACHDEM der Schacht ausgehoben wurde. Damit war der Schacht oben in jeder Kammer von einer Kachel Fels gedeckelt.
Gemessen mit einer Breitensuche durch Luftkacheln (unabhängig vom Graphen und der Sim): **0 von 60 Türmen** hatten
eine Luftverbindung von Start zu Ziel; Höhlen, Parcours und Himmelsreich hatten 60/60. Das heißt: Die vom Nutzer
gemeldeten „ein paar Türme gehen nicht" waren in Wahrheit ALLE Türme. Die früheren Fixes (Gefahr auf den
Kammerboden, `edgeGap`, `flightClear` bei dx = 0) haben real vorhandene Fehler behoben, das Wesentliche aber nie berührt.

**Warum der Graph es meldete.** `flightClear()` prüfte bei einem Sprung nur die Spalten ZWISCHEN Start- und Zielfläche.
Bei einer Verschiebung um eine Spalte gibt es keine; der Sprung „von unter der Platte auf die Platte" galt als frei. Der
Graph meldete deshalb `reachedEnd` und 270/270, obwohl der Weg durch Fels führte. Genau die Warnung aus dem Plan
(„Geometrie-Prüfung und Spielbarkeit sind zwei verschiedene Aussagen"): Ich hatte Turm nie ganz mit dem Solver
durchgespielt (ein Versuch lief > 100 s ohne Ergebnis, und ich hatte ihn als „zu langsam" abgehakt statt als Warnsignal
zu lesen).

**Behoben.**
1. `turm.js`: Die oberste Sprosse jedes Schachts (bei `buildLedges` immer links) bekommt eine LUKE im Kammerboden über
   ihren 2–3 Spalten. Erst versucht: das ganze Schachtprofil öffnen. Das teilte den Kammerboden durch ein 5–7 breites
   Loch (> `maxGap`) in zwei Hälften und löste 15 Reparaturen aus; die Luke ist überspringbar und lässt eine durchgehende
   Fläche. Gefahren auf dem Kammerboden halten zwei Spalten Abstand zur Luke.
2. `v2/reachability.js`: `flightClear()` verlangt bei Höhenunterschied zusätzlich, dass es zwischen den Flächen einen
   zusammenhängenden Weg durch LUFT gibt (`luftweg()`, Breitensuche im Rechteck + 1 Spalte/2 Zeilen Rand). Eine
   notwendige, keine hinreichende Bedingung — sie macht den Graphen nur dort strenger, wo er Fels durchquerte. Gemessen
   über 1200 Welten (4 Typen × 5 Schwierigkeiten × 20 Seeds × 3 Klassen): identische Ergebnisse für Höhlen/Parcours/
   Himmelsreich, Turm 300/300 mit 0 Reparaturen; ca. 20 ms je Level.
3. Tests: `Bewegungsgraph: eine eine Kachel dicke Decke …` (schlägt mit der alten `flightClear` fehl, besteht mit der
   neuen — Gegenprobe gefahren) und `Welt v3: von JEDEM Start führt ein Weg durch Luft zum Ziel` (alle Welttypen).
   Dazu `Solver löst ganze Türme von unten bis oben`.

**Solver: Umweg-Abstand statt Luftlinie (`opts.geo`).** Die Luftlinie zum Ziel führt in Sackgassen, sobald der Weg erst vom
Ziel wegführt. Beispiel Höhlen `ho-4` (ohne jeden Baustein): Der Solver hing an der Wand bei x = 75, weil der Weg zuerst
einen 4 breiten Schacht abwärts führt. Jetzt kann die Suche mit einem Abstandsfeld arbeiten (Flutung durch Nicht-Fels-Kacheln
vom Ziel aus); Standard bleibt die Luftlinie, damit die 396/396-Chunk-Beweise unverändert bleiben. Zweite Option
`startDash`: Dash-Ladungen am Start, ohne das Maximum zu ändern, das Kristalle auffüllen (ein erster Versuch über `tuning`
machte Kristalle wirkungslos — der Test war damit falsch, nicht die Chunks).

**Beweise nach diesen Änderungen (alle mit 0 Dash am Start, dem schlechtesten Fall):**
- Chunks: alle 68 in allen drei Klassen lösbar OHNE Start-Dash (die Kristallkette braucht keinen; `pillars` und `ring-launch`
  fielen nur bei Beam 150 durch und lösen mit der normalen Eskalation).
- **Turm: 90/90 ganze Level** (5 Schwierigkeiten × 3 Klassen × kurz/mittel × 3 Seeds), je 2–10 s Suche.
- Höhlen: alle 18 (6 Seeds × 3 Klassen) beweisbar — 17 zerlegt, `ho-4` normal ganz (mein Schrittlimit 400 war zu klein);
  ganze Level zusätzlich Schwierigkeit 1 und 5: 8/8. Ein Level (`ho-0`) löst ganz nicht (Suchbreite am Schlüssel-Chunk),
  zerlegt 5/5.
- Parcours: alle 18 zerlegt (54/54 Strecken je Klasse) — darunter `sp-2` und `sp-5`, für die es vorher keinen Beweis gab;
  ganze Level Schwierigkeit 1 und 5: 8/8.
- Himmelsreich: alle 18 zerlegt (42/42 Strecken je Klasse); ganze Level: 17 von 18 bei Schwierigkeit 3 (das 18. lief in
  ein Zeitlimit, kein Fehlschlag), 4/4 bei Schwierigkeit 1, 3/4 bei Schwierigkeit 5 — das vierte (`rd-2`) zerlegt 7/7.

**Wie der zerlegte Beweis zusammensetzt:** Baustein-Ränder sind gefahrenfreier ebener Boden, Warten ist erlaubt; jede
Strecke Start → Baustein-Anfang → Baustein-Ende → … → Ziel wird einzeln gelöst. Weil jede Strecke mit 0 Dash beginnt, ist das
der schlechteste Fall — ein vorher verbrauchter Dash kann keine Strecke unlösbar machen.

**Was die Lehre ist.** Bei jedem Welttyp zuerst die billige, graphunabhängige Bedingung prüfen (Luftverbindung Start → Ziel),
dann den ganzen Solver laufen lassen. „Zu langsam" bei einem Solver-Lauf ohne Ergebnis ist ein Befund, kein Grund, die
Prüfung auf später zu schieben. Fingerprints: `gen/` inklusive `solver.js` steckt im GEN-Fingerprint, er ändert sich mit
diesen Dateien (Turm-Welten sind tatsächlich anders); der Sim-Fingerprint ist unverändert.

### Nachtrag: warum `key-door` in ganzen Leveln nie ging (Solver-Fehler, behoben)

Ganze Parcours-Level mit dem `key-door`-Chunk (`sp-2`) und Höhlen `ho-0` blieben als Ganzes ungelöst, jede Teilstrecke und
jedes Fenster ging. Beide hingen an derselben Stelle: direkt neben dem Schlüssel, `keys: 0`. Ursache in `solver.js`:
Solange eine Tür zu ist, ist der nächste Schlüssel das Teilziel; nimmt man ihn, wechselt das Teilziel zum Ziel — und die
Punktzahl fällt um fast die ganze Restdistanz (~6500 px), während der Schlüssel-Bonus fest 2000 betrug. Die Suche
bestrafte das Schlüsselnehmen also, sobald das Ziel weit war; in Chunks und Fenstern ist es nah, deshalb ging es dort.
Fix (nur mit `opts.geo`, Standard und Chunk-Beweise unberührt): Der Bonus wächst mit der Startdistanz zum Ziel
(`2000 + Umweg-Abstand · TILE`). Test: ein handgebautes Level mit Schlüssel, Tür und 260 Kacheln Auslauf — mit dem
alten Bonus bleibt der Solver neben dem Schlüssel stehen (Gegenprobe gefahren), mit dem neuen löst er es in ~4 s.

Ergebnis: `sp-2` ganz gelöst (35 s Spielzeit, Beam 900), `ho-0` normal/fast ganz gelöst, `sp-5` mit der Umweg-Heuristik ganz gelöst.
**Parcours Schwierigkeit 3, ganze Level, endgültiger Solver: 12/12** (Seeds 0–5, normal und fast; Suchbreite 150–900, bis
8 min Rechenzeit je Level). Die Fenster-Läufe des Parcours (30 Seeds × Schwierigkeit 1/3/5 × 3 Klassen) stehen endgültig bei
**1080/1080**, kein Fenster fehlgeschlagen.

---

## 8. Spieltest-Rückmeldung vom 24.09.2026 — Dash ganz weg, Turm neu gedacht

Der Nutzer wollte nach dem ersten Spieltest (Abschnitt 6) drei Dinge, wörtlich zusammengefasst: (1) den
Start-Dash auch entfernen (Dash sollte schon "nur über die Kristalle" gehen, hatte aber noch eine Ladung
am Start/Respawn), (2) den Turm so umbauen, dass er wirklich mittig erklettert werden muss, mit Lasern,
Sägen, schwebenden Plattformen und Bröckelblöcken an genau den richtigen Stellen statt "immer nur
Aufstiege aus veränderten normalen Blöcken" — dasselbe Problem sah er bei Höhlen, aber "beim Turm
gerade besonders", (3) das allgemeine Gefühl, dass sich Himmelsreich immer gleich anfühlt, weil man nie
wirklich auf den Plattformen mitfährt ("man bewegt sich btw nicht mit denen mit -> eis?").

### Dash: die letzte Ladung war noch da

`sim/player.js` gab `dashCharges: cfg.dashCharges` in `createPlayer()` — das lief bei JEDEM Start UND
JEDEM Respawn, nicht nur beim allerersten Mal. Jetzt `dashCharges: 0`; die einzige Quelle ist weiterhin
`elements/crystal.js`. Betroffen waren: die Reichweiten-Messung (`sim/reach.js` maß "dash"-Sprünge ohne
Ladung — jetzt bekommt die Messwelt explizit eine, weil die Zahl beschreiben soll, was mit einer Ladung
geht, nicht ob man eine hat), zwei Chunks, deren erste Dash-Lücke direkt hinter dem Eingang lag
(`crystal-chain`, `combo-shaft-dash` — beide bekamen einen Kristall am Boden vor der Lücke) und alle
Bewegungs-/Dash-Tests (neuer Helfer `mitDash()` in `sim/__tests__/helpers.js`). Neuer Regressionstest:
"Der Dash gehört nicht zur Grundausstattung" (startet ohne, ein Dash-Versuch tut nichts, nach Neustart
wieder ohne).

### Himmelsreich: Plattformen fuhren zur Hälfte durch Fels

Kontrollmessung (unabhängig vom Solver): Eine Plattformbahn Punkt für Punkt gegen `rectHitsSolid`
geprüft — **182 von 220 Bahnen** liefen mitten durch Fels. Ursache: `platziereBruecken()` in
`himmelsreich.js` setzte die Plattform in die LETZTE Spalte von Insel A und ließ sie zur ERSTEN Spalte
von Insel B fahren — beide Enden lagen damit *in* der jeweiligen Insel, nicht in der Lücke dazwischen.
Wer mitfuhr, blieb beim Aufstieg in der Startinsel hängen. Fix: Die Bahn dockt jetzt am ersten
Luftpunkt hinter A und mit ihrer eigenen Breite vor B an; `speed` wird aus der wirklichen Streckenlänge
berechnet (vorher fest 55 px/s, unabhängig von der Distanz) und auf 45–80 px/s begrenzt, damit die
Fahrzeit nicht ausufert.

**Mitfahren war zweitens auf schrägen Bahnen kaputt**, seit es Himmelsreich überhaupt gibt: `mover.js`
nahm erst waagerecht, dann senkrecht mit. Steigt die Plattform dabei, ragt ihre neue Oberkante in die
Füße des Mitfahrers — die waagerechte Bewegung galt dann als Wandkollision, man fuhr nur mit dem
senkrechten Anteil mit und rutschte am Ende der Plattform herunter. Reihenfolge getauscht (erst Y, dann
X); die meisten Himmelsreich-Brücken laufen schräg, das war also der Normalfall, nicht der Ausnahmefall
— exakt das "man bewegt sich nicht mit denen mit"-Gefühl des Nutzers. (Die Vermutung "Eis?" war nicht
die Ursache — Eis beeinflusst nur die eigene Bodenreibung, nicht das Mitfahren.)

**Drittens** waren Start- und Zielinsel schmaler als die gemeinsame Plattform, die auf ihnen sitzt
(4–7 statt `START_BREITE`/`ZIEL_BREITE` = 10/9) — die erste Brücke setzte deshalb teils direkt in die
Plattform hinein. Jetzt sind erste/letzte Insel fest so breit wie die Plattform, die dort entsteht.
**Viertens** übernahm die gemeinsame Schicht `y` der Insel (ihre FELS-Oberkante) statt `y − 1`
(die Steh-Luftzeile) als Start-/Zielpunkt — der erste Sprung war dadurch eine Zeile höher als geplant
gemessen; Greifanker verschwanden zudem, wenn die Startplattform-Räumung über sie hinwegging, jetzt
werden sie nach dem Setzen der gemeinsamen Plattformen erneut gesetzt, falls dort inzwischen Luft ist.

Gemessen nach allen vier Fixes: **300/300 Himmelsreich-Level (5 Schwierigkeiten × 20 Seeds × 3 Klassen)
0 Reparaturen** (vorher 276/300 — der Umgang mit dem echten Andocken deckte 24 vorher unsichtbare
Rissstellen auf), **220 von 220 Plattformbahnen ohne jede Felsüberlappung** (Mitte UND Enden). Zwei neue
Regressionstests: `Bewegte Plattform: trägt auch auf SCHRÄGEN Bahnen seitlich mit` (5 Richtungen,
sim/__tests__/elements.test.js) und `Himmelsreich: keine Pendelplattform überlappt an irgendeiner Stelle
ihrer Bahn Fels` (36 Level × alle ihre Plattformen, gen/world/__tests__/welt.test.js).

### Turm: von der Schachtleiter zu Stockwerken mit eigener Idee

Der alte Turm war (siehe Abschnitt 7, "Der Turm war nie durchspielbar") gerade erst zum ersten Mal
überhaupt spielbar geworden — und genau in dem Moment sichtbar geworden, dass er trotzdem "immer
dasselbe" war: ein Schacht mit Sprossen, alle 2 Schächte optional eine einzelne Gefahr auf dem
Kammerboden. Kein Bröckelblock, kein Laser im Aufstieg selbst, keine schwebende Plattform — genau die
Beschwerde des Nutzers.

**Neue Architektur** (`gen/world/motive/stockwerke.js`, `gen/world/typen/turm.js` komplett neu
geschrieben, `gen/world/faehigkeiten/stockwerk.js` neu): Der Turm ist jetzt eine Kette von
STOCKWERKEN. Jedes ist eine Halle mit Eiswänden (kein Wandsprung an Eis — keine Abkürzung außen
herum), Plattformen MITTEN im Raum, einer Decke mit einer 4 Kacheln breiten Luke (= der Boden des
nächsten Stockwerks) und einer eigenen Idee:

| Stockwerk | Idee | ab Schwierigkeit |
| --- | --- | --- |
| `stufen` | einfache Treppe, ab Stufe 3 vereinzelte Spikes an Plattformkanten | 1 (immer als erstes: sichere Erstbegegnung) |
| `broeckelleiter` | jede Plattform ein Bröckelblock, eine feste Rastplattform in der Mitte | 1 |
| `laserkamin` | Plattformkette, jeder zweite/jeder Anstieg (je Schwierigkeit) von einem waagerechten Laser gequert | 2 |
| `saegenpendel` | wie Laserkamin, aber eine pendelnde Säge statt eines Lasers | 3 |
| `federfeld` | Federn im Zickzack, ab Stufe 3 Spikes an den Plattformrändern | 2 |
| `aufzug` | eine senkrechte Pendelplattform (derselbe Mover wie bei Himmelsreich) zwischen zwei Ablagen | 2 |

Ein Turm bekommt ein "Thema" (zwei bevorzugte Stockwerksarten, seedabhängig gewichtet 2,5×), das erste
Stockwerk ist immer `stufen`, danach nie zweimal dieselbe Art hintereinander. Die Höhe jedes Stockwerks
wird gewürfelt; reicht `LIMITS.maxHeight` nicht, wird das am weitesten vom Minimum entfernte Stockwerk
schrittweise niedriger (kein Stockwerk fällt weg — sonst bräuchte ein anderes plötzlich die
Rand-Luke-Eigenschaft, die es nicht hat).

**Lösbarkeit kommt NICHT vom Bewegungsgraph** (er kennt Bröckelblöcke, Aufzüge, Federn nicht), sondern
aus der neuen Fähigkeit `stockwerk`: Jedes Stockwerk ist für den Graph eine Brücke von den zwei
Randzellen neben der unteren Luke zu den zwei neben der oberen (`faehigkeiten/stockwerk.js`,
`baueStockwerkBruecken`) — genau wie `baustein` es für einen Chunk tut. Die eigentliche Zusage kommt
aus dem echten Solver, Stockwerk für Stockwerk.

**Zwei Baufehler unterwegs, beide durch Messen gefunden, nicht durch Zusehen:**
1. Die Kantenbedingung fürs oberste Stockwerk ("Luke am Rand, damit die Zielplattform Platz hat") war
   zu streng (`r.luke <= 3` / `>= r.W−1−LUKE_BREITE−2`) — bei manchen Kombinationen aus Breite/Höhe/
   Einstieg fand `mitSeite()` in 40 Versuchen keine passende Kette und warf. Gelockert auf "9 Kacheln
   Platz für die Zielplattform reichen" (`<= r.W−14` / `>= 10`) UND die letzten Schritte der Kette
   ziehen jetzt aktiv zur vorgegebenen Seite (92 % Wahrscheinlichkeit je Schritt) statt rein zufällig
   zur Mitte zu pendeln. Nachgemessen: 0 Fehlschläge über alle 6 Stockwerksarten × 5 Schwierigkeiten ×
   2 Seiten × 200 Versuche (vorher bis zu 146 von 800 ohne Rand-Luke, je nach Stockwerk/Schwierigkeit).
2. `stufen()`s Verteilung der Anstiegshöhen konnte die letzte, kleinste Stufe unter 1 Zeile drücken
   (Rundungsfehler bei ungünstigem `R`/`dhMax`) — behoben, indem `dhMin` sich am tatsächlich
   verfügbaren Rest orientiert statt an einer festen Untergrenze.

**Beweise (alle mit dem echten Solver, `opts.geo`):**
- Graph-Zusammenhang: **300/300** Türme (5 Schwierigkeiten × 20 Seeds × 3 Klassen), 0 Reparaturen.
- Fenster-Test je Stockwerksart (Boden → jede Plattform → Decke, mit demselben Prüfwerkzeug wie bei den
  Bausteinen): `stufen` 180/180, `laserkamin` 144/144, `saegenpendel` 108/108, `federfeld` 144/144,
  `aufzug` 144/144 über alle 3 Klassen und alle zulässigen Schwierigkeiten — restlos gelöst.
  `broeckelleiter` 172/180: alle 8 Fehlschläge sind DIESELBE eine Fenstergeometrie
  (Hallenbreite 22, Höhe 18, Einstieg bei Spalte 14) bei Standardsuchbreite (150→400→900) — mit Breite
  2500–4000 lösen alle acht in 5–75 s, also Suchbreiten-Grenze, kein Level-Fehler (dieselbe Lehre wie
  beim Schlüssel-Bonus in Abschnitt 6 und dem `sticky-climb`-Fenster in Himmelsreich).
- Ganze Level: 8 von 8 mittellange Level bei Schwierigkeit 3, Klasse normal, vollständig vom Solver
  gelöst (12–53 s Spielzeit, bis zu 4 min Suche).
- Negative Kontrollen (das Prüfwerkzeug muss auch NEIN sagen können): Luke zugemauert → nicht lösbar;
  Aufzug-Plattform entfernt → nicht lösbar; Laser dauerhaft an statt getaktet → nicht lösbar. Alle drei
  wie erwartet gescheitert — das Werkzeug ist kein Blindgänger, der immer "gelöst" meldet.

**Tests:** `gen/world/__tests__/stockwerke.test.js` (neu, 6 Tests: jedes Stockwerk baut für jede
Kombination aus Breite/Höhe/Schwierigkeit/Seite, die eingesetzte Luke ist wirklich offen, `erlaubt()`
wird respektiert, der Turm meldet die Fähigkeit, ohne sie gilt er dem Graph als gerissen). Der
bestehende Solver-Test "löst ganze Türme von unten bis oben" (gen/__tests__/solver.test.js, Seeds
`tu-0/1/2`) lief unverändert weiter und bestand mit dem neuen Generator — zusätzliche Bestätigung ohne
eigens dafür geschrieben zu sein.

**Sichtprobe:** Vier Türme in der Werkbank gerendert (`/seed-runners/welten`, Puppeteer) — deutlich
verschiedene Stockwerksfolgen und -formen, sichtbare Bröckelblöcke/Laser/Federn/Aufzüge statt
identischer Sprossen. Ein Turm zusätzlich in der laufenden App mit echter Tastatureingabe gespielt
(20 s, einfacher Bot): keine Konsolenfehler aus der Seed-Runners-Sim, HUD/Checkpoints/Kamera
funktionieren.

**Regression insgesamt:** Frontend 368 Tests (vorher 359), Backend 173 Tests, ESLint sauber, Vite-Build
grün, Backend-Spiegel neu erzeugt (Sim- UND Gen-Fingerprint ändern sich — der Dash-Fix sitzt in `sim/`,
der Rest in `gen/`).

**Offen / nächste Schritte:**
- Höhlen hat dieselbe Rückmeldung bekommen ("beim Turm gerade besonders", heißt: bei Höhlen auch, nur
  weniger dringend) — Höhlen ist noch NICHT auf eigene "Stockwerke"/Motive umgestellt, nutzt weiter nur
  die alten Bausteine + `bestreueZone()`.
- Parcours und Himmelsreich haben ebenfalls noch keine Turm-artigen "Motive" — nur Bausteine.
- `broeckelleiter` hat eine bekannte Suchbreiten-Lücke bei einer Geometrie; für den Solver-Batch in CI
  wäre eine gezielt höhere Suchbreite für dieses Stockwerk billiger als die pauschale Eskalation zu
  erhöhen.
- Nicht geprüft: Menschentauglichkeit der neuen Stockwerke (Reaktionszeiten, siehe
  [[feedback-seed-runners-human-playability]]) — bisher nur der Solver und ein dummer Zufalls-Bot.

---

## 9. Höhlen auf ein eigenes Motiv-System (24.09.2026, direkt im Anschluss an Abschnitt 8)

Rückmeldung des Nutzers, nachdem er den Turm gesehen hatte: Höhlen hat dasselbe Problem — und zwar
NICHT "weniger dringend" (seine Worte), weil genau die Vielfalt der Weltengenerierung gerade der
ganze Auftrag ist. Höhlens Bausteine (Abschnitt 7) hatten das Problem nur gemildert: Sie stempeln
die 68 HANDGEZEICHNETEN v1-Chunks 1:1 ins Raster — dieselbe endliche Bibliothek, die auch Parcours
und Himmelsreich benutzen, keine für Höhlen eigene Idee. Und die Aufstiegs-/Abstiegs-Schächte (die
„Aufstiege und abstiege aus verändernden normalen Blöcken", die der Nutzer ausdrücklich nannte)
hatten bis hierhin GAR KEINE Gefahren — genau wie der alte Turm.

### Räume: dieselbe Bauweise wie die Turm-Stockwerke, cave-eigen

Neu: `gen/world/motive/hoehlenraeume.js`. Wie bei den Turm-Stockwerken ist ein Raum eine
ALGORITHMISCHE Erzeugung (Position und Zahl von Gruben, Plattformen, Gefahren aus dem Seed), keine
Vorlage — zwei Läufe derselben Raumart sehen nie gleich aus. Anders als beim Turm bleibt ein Raum
BODENSTÄNDIG (Höhlens eigene Beschreibung: „geschlossen, bergig, bodenständig") statt schwebender
Plattformen: ein durchgehender Boden, `entry === exit`, keine Kletter-Anteile (die übernehmen weiter
die Schacht-Zonen). Fünf Räume:

| Raum | Idee | ab Schwierigkeit |
| --- | --- | --- |
| `spitzenschlucht` | 2–3 Gruben im Sprungbudget, Stachelkante direkt vor mancher Grube | 1 |
| `saegenhalle` | 1–2 Sägen patrouillieren quer über den Boden — Tor, das man im richtigen Moment durchläuft | 1 |
| `laserstollen` | 1–2 getaktete Lasertore quer über den Boden | 2 |
| `broeckelschlucht` | EIN weiter Abgrund, ausschließlich über eine Kette Bröckelblöcke zu queren | 1 |
| `steinschlaggang` | herabstürzende Brocken über dem Laufweg — ausweichen/timen statt springen | 2 |

**Eingesetzt wird ein Raum genau wie ein alter Chunk-Baustein** — `stempeln()`/
`baueBausteinBruecken()` kennen nur die Form `{w,h,entry,exit,rows,entities,tpl}`, keine
Content-Quelle. Das bedeutet: KEINE neue Fähigkeit, KEINE neue Graph-Brücke, kein neuer
Test-Unterbau für die Brücke selbst — nur eine zweite Quelle für dieselbe Einsetzung. In
`typen/hoehlen.js` wurde dafür `planeBausteinZonen()`s Auswahlaufruf von "immer ein Chunk" auf
"erst ein Raum versuchen (70 % Chance, gewichtet nach Raumart), sonst ein alter Chunk als
Rückfall" verallgemeinert (`holeInstanz(fortschritt, z, spaetMin, spaetMax)` statt eines festen
`naechsterBaustein`-Aufrufs) — die Zonen-Verbreiterungslogik selbst blieb dabei unangetastet.

### Schacht-Ideen: die Aufstiege/Abstiege bekommen Gefahren, OHNE die bewiesene Leiter anzurühren

Neu in derselben Datei: `SCHACHT_IDEEN` (`leiter`, `saegenschacht`, `laserschacht`). Sie rühren die
bereits ausgegrabenen Vorsprünge (`carveShaft()`/`buildLedges()`) NICHT an — eine Gefahr sitzt immer
im Luftraum ZWISCHEN zwei Vorsprüngen (`saegenschacht`: eine quer patrouillierende Säge auf Höhe des
unteren Vorsprungs; `laserschacht`: ein getaktetes Lasertor, im Fels außerhalb des Schachts
eingebettet), nie auf einem Vorsprung selbst — dieselbe Regel wie Turms `laserkamin`/`saegenpendel`.
Der Bewegungsgraph sieht deshalb weiterhin exakt dieselbe, bewiesene Geometrie (300/300, 0
Reparaturen, unverändert). Eingebunden über `buildTerrain()`s ohnehin vorhandene Rückgabe (`shapes`
enthält für jede Aufstiegs-/Abstiegs-Zone bereits `ledges`) — keine Änderung an `v2/terrain.js`.

### Zwei echte Fehler, gefunden über den bestehenden Testlauf, nicht durch Zusehen

1. **125 Kacheln freier Fall.** `spitzenschlucht`/`broeckelschlucht` bauten ihre Gruben zunächst wie
   Parcours' „echte Gruben" (Boden bis zum Instanzrand offen, `stempeln()`s `opt.fels`-Verlängerung
   lässt dann NICHTS darunter). Das funktioniert bei Parcours/Himmelsreich, weil deren Grundstoff
   `luft` ist — die ganze Welt ist ohnehin offener Himmel, ein Sturz ist kurz. Höhlens Grundstoff ist
   `fels`: Eine Spalte ohne eigenen Boden fällt bis zur nächsten zufällig TIEF liegenden Bodenzeile
   eines völlig ANDEREN Levelabschnitts — gemessen bis zu **125 Kacheln**, über 2 Sekunden Fall.
   Gefunden über den bestehenden Fenster-Solver-Test für `broeckelschlucht` (0/90, vorher 100 % bei
   den anderen vier Räumen) und beim Nachrechnen der tatsächlichen Fallhöhe. Fix: Eine Grube bekommt
   jetzt einen FESTEN, mit Spitzen ausgelegten Boden `PIT_TIEFE = 11` Zeilen unter dem Hauptboden,
   innerhalb der Instanz selbst (nicht am Rand) — ein Sturz bleibt tödlich (Spitzen), aber immer
   gleich kurz. Nachgemessen: größte Fallhöhe über 20 Seeds jetzt 12 Kacheln (vorher bis 125).
2. **Laser 11 statt mindestens 12 Kacheln vom Start.** Der allererste Schacht direkt hinter der
   Startzone konnte eine Schacht-Idee mit Gefahr bekommen — ohne Prüfung, wie nah das am Start liegt.
   Gefunden über den BESTEHENDEN Start-Sicherheitstest (`pruefeStart`, GEFAHRENFREI=12), der beim
   ersten Lauf sofort rot wurde (nicht neu geschrieben, einfach mitgelaufen). Fix: Schächte innerhalb
   von `GEFAHRENFREI + 4` Kacheln der Startzone bekommen keine Idee (bleiben leere Leiter). Beide
   Funde zusammen sind ein Beleg dafür, dass sich das Nachrüsten in den bestehenden Testlauf lohnt,
   statt nur neue, isolierte Tests für das neue Feature zu schreiben.

### Beweise (alle mit dem echten Solver)

- Graph-Zusammenhang: **300/300** Höhlen-Level (5 Schwierigkeiten × 20 Seeds × 3 Klassen), 0
  Reparaturen (identisch zum Stand vor diesem Umbau — reine Element-Ergänzung, keine
  Geometrieänderung an den Zonen selbst).
- Fenster-Test je Raumart (Boden vor dem Raum → Boden danach, mit demselben Prüfwerkzeug wie bei den
  Turm-Stockwerken), alle drei Klassen × alle Schwierigkeiten: `saegenhalle` 90/90, `laserstollen`
  72/72, `steinschlaggang` 72/72, `broeckelschlucht` 90/90 — restlos. `spitzenschlucht` 87/90, alle
  drei offenen Fälle bei Standardsuchbreite gelöst mit Breite 400 (Suchbreiten-Grenze, kein
  Level-Fehler, dieselbe Lehre wie beim Turm).
- Fenster-Test je Schacht-Idee, aus ECHT generierten Leveln ausgeschnitten (Zone samt ihrer
  wirklichen Dekoration), alle drei Klassen × Schwierigkeit 2–5 (`saegenschacht`/`laserschacht` erst
  ab Stufe 2), je 6 Beispiele: **234/234**, kein einziger Fehlschlag.
- Ganze Level, zerlegt an jeder Zonengrenze (Baustein, Schacht, Insel) — der direkte Ganzlevel-Solver
  bleibt bei 6 Schächten + 3 Räumen in einem Level oft im Suchraum stecken (nicht ungelöst, nur
  überfordert — Beleg: dasselbe Level segmentweise löst in unter 8 s je Segment), deshalb der
  zerlegte Beweis wie schon bei Parcours in Abschnitt 6: **16 von 16 Leveln vollständig gelöst**
  (8 Seeds bei Schwierigkeit 3, je 4 zusätzlich bei Schwierigkeit 1 und 5).

**Tests:** `gen/world/__tests__/hoehlenraeume.test.js` (neu, 9 Tests: jeder Raum baut ohne Ausnahme,
eine Grube lässt nie lange durchfallen, `erlaubt()` wird respektiert, `naechsterRaum()` wiederholt
nie dieselbe Art, Schacht-Gefahren sitzen nie auf einem Vorsprung, ohne Fähigkeit gilt der Graph als
gerissen, UND — als Regressionsschutz für Fund 2 — ein voller `generateWorld()`-Lauf gegen
`pruefeStart`). Der geänderte Zeilen-Test in `bausteine.test.js` misst jetzt direkt im fertigen
Raster (deckt Chunks UND Räume gleich ab), statt eine feste Chunk-Vorlage vorauszusetzen.

**Sichtprobe:** Vier Höhlen in der Werkbank gerendert — sichtbar unterschiedliche Raum-/Schacht-Folgen
(`laserstollen`, `steinschlaggang`, `saegenhalle`, `spitzenschlucht`, `broeckelschlucht` neben den
alten Chunks und den unveränderten `aufstieg`/`abstieg`/`inseln`-Zonen). Eine Höhle zusätzlich in der
laufenden App mit echter Tastatureingabe gespielt — keine Konsolenfehler, HUD/Checkpoints/Kamera ok.

**Regression insgesamt:** Frontend 377 Tests (vorher 368), Backend 173 Tests, ESLint sauber,
Vite-Build grün, Backend-Spiegel neu erzeugt (nur GEN-Fingerprint ändert sich, Sim ist unverändert).

**Offen / nächste Schritte:**
- Parcours und Himmelsreich haben weiterhin keine eigenen Motive, nur Bausteine — dieselbe Frage
  stellt sich dort, sobald sie an der Reihe sind.
- `spitzenschlucht` hat dieselbe bekannte Suchbreiten-Lücke wie Turms `broeckelleiter` — für einen
  Solver-Batch in CI wäre eine gezielt höhere Suchbreite billiger als die pauschale Eskalation zu
  erhöhen.
- Menschentauglichkeit der neuen Räume/Schacht-Ideen ungeprüft — bisher nur Solver und Sichtprobe.
- Die Rückfall-Quote (30 % alter Chunk statt neuer Raum) ist eine geschätzte Zahl, nicht gemessen —
  könnte je nach Spielgefühl noch verschoben werden.

## 10. Nur noch Super schnell, Turm-Prüfpunkte auf die Route (24.09.2026, im Anschluss)

**Rückmeldung:** Normal/Schnell fühlen sich beim Spielen langweilig an, "super schnell ist das
einzige tempo was richtig spaß macht" — weite Sprünge, Plattformen teils übersprungen statt benutzt.
Konkret genannt gut: `welt-68494` (Turm), `welt-51638` (lang). Dazu ein zweiter, unabhängiger Fund:
Turm-Prüfpunkte zwangen zu einem Umweg abseits der Route.

**Tempo:** `SeedRunnersWorldLab.jsx` bietet kein Tempo-Dropdown mehr — `speedClass` ist eine feste
Konstante `"super"`. `gen/world/generate.js`s Fallback für einen fehlenden/ungültigen Wert zeigt
jetzt ebenfalls auf `'super'` statt `'normal'`. Bewusst NICHT angefasst: `sim/classes.js`
(alle drei Klassen bleiben als Definitionen bestehen — nichts hängt an ihrem Verschwinden), das
Live-Spiel/Tagesrennen/Mehrspieler (laufen weiterhin auf dem alten v1-Generator, unberührt von der
gesamten Welttypen-Arbeit). Keine gesonderte Neukalibrierung der Sprungweiten nötig: Die Generierung
ist vollständig über `reachForClass(cls)` + `SAFETY[difficulty]` parametrisiert, kein Welttyp/Motiv
hat `'normal'` hartverdrahtet (geprüft: 0 Treffer in `typen/`, `motive/`, `faehigkeiten/`,
`reichweite/`, `gemeinsam/`) — allein `super` als einzige Klasse ergibt automatisch die breiteren
Lücken/weiteren Sprünge, die die Rückmeldung beschreibt.

**Turm-Prüfpunkte:** saßen bisher an einer FESTEN Ecke der Halle ("weit weg von der Luke" — ursprünglich
gedacht, um nicht mit der Einstiegsöffnung selbst zu kollidieren), unabhängig davon, wo die eigentliche
Kletterroute verlief — das erzwang jedes Mal einen Umweg. Jetzt sitzt der Prüfpunkt direkt NEBEN der
Luke, durch die man gerade gekommen ist (`einLuke ∓ 2`, je nachdem wo Platz ist) — genau dort, wo man
nach dem Durchklettern ohnehin steht.

**Regression:** Frontend 377 Tests (unverändert in der Zahl, alle weiterhin grün), Backend 173, ESLint
sauber, Build grün, Backend-Spiegel neu erzeugt (nur GEN, Sim unverändert). Sichtprobe: Werkbank zeigt
"Tempo: Super schnell" als festen Text statt Auswahl; Prüfpunkte in mehreren generierten Türmen liegen
direkt neben der jeweiligen Einstiegsluke (nicht mehr in einer festen Hallenecke).

**Offen:** Falls der Nutzer die Tempo-Einschränkung auch fürs Live-Spiel will, ist das ein eigener,
größerer Schritt (Tagesrennen-Generierung, Mehrspieler-Lobby-Auswahl, Editor, gespeicherte
Custom-Level — alles noch v1, nicht Teil der heutigen Welttypen-Arbeit).

## 11. Checkpoints bekommen eine explizite Nummer — Turm-Respawn-Bug behoben (25.09.2026)

**Rückmeldung:** Im eigenen (handgebauten) Turm-Level respawnte ein tieferer Checkpoint, obwohl der
Spieler längst einen höheren erreicht hatte.

**Root Cause:** `sim/tilemap.js` sortierte Checkpoints seit jeher strikt nach `tx` (links→rechts) —
bei einem SENKRECHTEN Level die falsche Achse. Ein tieferes Stockwerk kann zufällig weiter rechts
liegen als eines darüber und bekommt so fälschlich den höheren Index; `world.spawns[checkpointIndex]`
zeigte dann auf den unteren statt den zuletzt erreichten oberen Checkpoint.

**Fix:** neues, optionales Feld `checkpointOrder` ({tx,ty,order}[]) im Level-Dokument. `parseMap`
sortiert danach, wenn es GENAU alle Checkpoints abdeckt (sonst leiser Fallback auf die alte
Positions-Sortierung — nie ein Absturz, wichtig für die Editor-Live-Vorschau während des
Nummerierens). `level/validate.js` prüft streng: entweder alle Checkpoints nummeriert und eindeutig,
oder keiner. Editor: Checkpoint-Kachel auswählen zeigt einen Umschalter "Feste Reihenfolge-Nummer"
(Muster wie Winds/Spikes optionale Gruppen); die Nummer klebt an ihrer Kachel durch Kopieren,
Verschieben, Spiegeln und Größenänderung. `gen/world/generate.js` sammelt Checkpoints ohnehin schon
in der korrekten BAU-Reihenfolge (`pruefzonen`) — das ging bisher nur beim Parsen wieder verloren;
der Generator gibt diese Reihenfolge jetzt explizit mit, was denselben Bug in JEDEM prozedural
erzeugten Turm behebt, nicht nur in handgebauten Leveln.

**Bewusst NICHT im Inhalts-Hash:** DOC_VERSION steht seit Projektbeginn unverändert auf 1, es gibt
keine Migrations-Infrastruktur. Ein zusätzliches Hash-Feld hätte den Hash JEDES bestehenden Levels
geändert und alle bestehenden Verifizierungen entwertet — Nutzer-Entscheidung nach Rückfrage, siehe
Kommentar in `level/format.js` (`contentOf()`).

**Regression:** Frontend 384/384 (5 neue Tests), Backend 173/173, gen/ 133/133, ESLint sauber, Build
grün, Backend-Spiegel neu erzeugt (SIM geändert, da tilemap.js betroffen). Live verifiziert: Editor-UI
(Umschalten, Wert setzen, Validierungsfehler bei unvollständiger Nummerierung), Sim-Ebene (dedizierter
Test reproduziert den exakten gemeldeten Bug und bestätigt den Fix), Generator (18 Turm-Seeds, Reihenfolge
entspricht exakt dem Baufortschritt).

## 12. Kernideen #12 „Zwei Wege" und #19 „Schlüsselkette" über Ideen-Räume (25.09.2026)

**Entscheidung des Nutzers:** Option A: erst weitere Kernideen (Phase C), Phase D danach. Vorbild waren die
beiden veröffentlichten Custom-Level SR-ERV-RAM und SR-ZZ7-PS3: Schlüssel vor der Tür, Wege, die sich
trennen und wieder treffen, ein Bröckelpfad mit Schlüssel darüber.

**Architektur.** Eine Kernidee greift weiterhin nie selbst ins Raster. Neu ist der optionale Haken
`gewichteMotive(ids, gewichte, kontext)` (ideen/vertrag.js). Mit ihm bevorzugt eine Idee ganze
**Motive** statt einzelner Elemente. Die Motive stehen in `motive/ideenraeume.js`, gebaut wie die
Höhlen-Räume (flach, fester Boden, Einsatz über `stempeln()`, keine neue Fähigkeit):

| Raum | Variante | Inhalt |
| --- | --- | --- |
| Schlüsselkammer | `ablage` | Schlüssel auf einer Ablage vor der Tür, ab Stufe 3 eine Grube dazwischen |
| | `rueckweg` | Treppe zum Schlüssel führt von der Tür ZURÜCK (Signature-Moment #32), ab Stufe 3 Mittelstufe bröckelt |
| | `kette` | zwei Schlüssel, zwei Türen, Schlüssel 2 auf einem Bröckelpfad über einer Grube |
| | `portal` | Schlüssel 12 Zeilen hoch, hinauf per Portal (nur wo der Welttyp Portale erlaubt) |
| Gabelung | `platte` | oben Lauf über eine Trennplatte mit Lücken und Stacheln, unten Serpentine über drei Ebenen, Ausstieg durch eine Einwegplatte |
| | `schlucht` | oben Bröckelstücke, unten hinaus nur per Aufzug an einer Eiswand |

Türwände sind über der Tür bis zur Oberkante Eis: Über Fels könnte man sie per Wandsprung überklettern.
Die Variante folgt dem Bogen (`fortschritt`, Stufe, Schwierigkeit): früh die Ablage, spät die Kette.

**Einbindung.** Höhlen: Ideen-Räume stehen mit Grundgewicht 0,5 in der Raumauswahl (auch ohne Idee,
selten). Mit einer Motiv-Idee gilt: 90 % statt 70 % Raum-Chance, der erste Platz gehört sicher der Idee,
und ihr Raum darf direkt wiederkommen. Portale bleiben dort aus, weil die Palette sie verbietet.
Parcours: Nur mit Motiv-Idee bekommt ein Baustein-Platz zu 60 % (stark 80 %) einen Ideen-Raum, über
einen eigenen Teilstrom. Ohne Idee bleibt Parcours unverändert. Nebenbei behoben: `letzterRaumId` wurde
bei einem Chunk dazwischen nie zurückgesetzt. Ein Raum sperrte sich dadurch für den Rest des Levels
(Parcours hatte deshalb immer genau einen Ideen-Raum).

**Ein Befund, der das Design geändert hat.** Die erste Gabelung (ebener Gang unter der Platte, dann eine
Senke; flache Schlucht mit Stufen) war oben nur 2–7 % schneller, einmal sogar langsamer. Ein Umweg
**nach unten** kostet in dieser Sim fast keine Zeit, weil man in der Luft genauso schnell nach rechts
kommt. Zeit kosten nur **Warten** und **Rückwege**. Deshalb gibt es unten die Serpentine und den Aufzug.
Oben gibt es keine Säge, weil Warten auf sie den schnellen Weg langsam gemacht hätte.

**Beweise (echter Solver, Fenster Startboden · Raum · Zielboden, `geo`, 0 Start-Dash, 3 Klassen × 5
Schwierigkeiten × 3 Seeds):**

| Fenster | gelöst | Ticks im Mittel |
| --- | --- | --- |
| Schlüsselkammer ablage / rueckweg / kette / portal | je 45/45 | 531 / 652 / 657 / 539 |
| Gabelung platte: beide Wege frei / nur oben / nur unten | je 45/45 | 726 / 726 / **1136** (+56 %) |
| Gabelung schlucht: beide Wege frei / nur oben / nur unten | je 45/45 | 652 / 653 / **861** (+32 %) |
| Gegenproben ohne Schlüssel (ablage, kette, portal) | **0/12**, wie verlangt | — |

„Nur oben" heißt: Einwegdeckel zugemauert bzw. Schluchtgrund tödlich. „Nur unten" heißt: Plattenlücken
zu und Eissäule am Plattenanfang bzw. Bröckelstücke entfernt. Eine Falle beim Prüfen: Die Eissäule
reichte zuerst nur bis zur Raumoberkante, darüber lag im Fenster offener Himmel. Die Umweg-Heuristik
lockte den Solver über die Säule (5 von 18 hängen geblieben). Bis zum Fensterrand hochgezogen, gingen
alle. Das war ein Fehler im Werkzeug, kein Level-Fehler.

**Ganze Level** (Höhlen, 5 Schwierigkeiten × 8 Seeds × 2 Klassen je Länge): mit Idee im Mittel 1,0 /
2,4 / 3,7 Ideen-Räume (kurz/mittel/lang). Mittel und lang haben immer mindestens einen, kurz hat 10/80
keinen (Level ohne passenden Platz). Parcours: 3,6–3,8 von 8 Plätzen. 0 gerissen, 0 Start-Mängel, keine
neuen Reparaturen.

**Tests:** `gen/world/__tests__/ideenraeume.test.js` (12). Frontend 396/396, Backend 173/173, ESLint sauber,
Spiegel neu erzeugt (nur GEN; `sim/` unverändert).

**Offen:**
- Menschentauglichkeit ungeprüft: Bröckelpfad mit Sprung-Schlüssel (`kette` ab Stufe 4) und die
  Bröckelstücke der Schlucht nur mit dem Solver belegt, noch nicht mit dem Bot aus `designed-routes.test.js`.
- Turm und Himmelsreich haben noch keine Ideen-Räume. Beim Turm bräuchte eine Tür in der Luke eine eigene
  Lösung.
- Schalter bewusst nicht verwendet: `flags.sw` gilt levelweit, ein Schalterraum würde Farbblöcke in anderen
  Räumen umstellen. Für #13 „Das Tor" braucht es erst einen eigenen Kanal je Raum.

## 13. Menschen-Bot für die Bröckel-Stellen, Turm-Motiv-Haken, Kernideen #5 und #11 (25.09.2026)

**Menschen-Bot zuerst** (Muster aus `gen/__tests__/designed-routes.test.js`): rechts halten, 1,5 Kacheln vor jeder
Absprungkante auslösen, 2–18 Ticks (17–150 ms, Sim läuft mit 120 Hz) Verzögerung, Sprung gehalten. Er hat drei
echte Fehler gefunden, die der Solver nicht sieht, weil er den einen exakten Sprung findet:

| Stelle | vorher (Bot) | Ursache | jetzt |
| --- | --- | --- | --- |
| Gabelung `schlucht`, oben | 4–50 % | 2 Kacheln breite Bröckelstücke; ein voller Sprung trägt 6–10 Kacheln und überspringt sie | durchgehender Bröckelpfad, ab Stufe 3 eine Lücke, dahinter lang genug zum Landen: **alle** |
| Schlüsselkammer `kette` ab Stufe 4 | 33 % (schnell/super: 0) | Schlüssel zwei Kacheln über Kopfhöhe: zu früh drüber, zu spät drunter durch | Schlüssel im Durchlauf: **alle** |
| **Bröckelschlucht** (Höhlen-Raum seit 24.09.) | 0–100 %, im Mittel ~35 % | dieselbe Form (2 breit, Lücke bis maxGap − 1) | nach gemessener Sprungweite bemessen: **240/240** |

Gemessene Landeweite eines vollen Sprungs auf gleicher Höhe (Kacheln ab Kante): normal 5,9 / schnell 7,7 /
super 9,9, bei 1,5 Kacheln zu frühem Absprung 4,5 / 6,3 / 8,3 — ≈ 0,82–0,88 × `reach.gap.jump`. Die Bröckelschlucht
nimmt jetzt Lücke ≤ „früher Sprung − Körper" und Stückbreite ≥ „später Sprung − Lücke" + 1 (5–7 Kacheln statt 2);
dafür reichen Höhlen und Parcours `reach` an die Räume durch. Gegenprobe: Ein Bot, der nicht springt, fällt durch.

**Turm:** `waehleStockwerke()` hat jetzt den Haken `gewichteMotive`. Was die Idee bevorzugt, darf direkt
wiederkommen; das erste Stockwerk bleibt die einfache Treppe.

**Kernidee #5 „Bröckelkette"** (`ideen/broeckelkette.js`, Höhlen/Parcours/Turm): bevorzugt Bröckelschlucht und
Bröckelleiter. Parcours darf dafür die Bröckelschlucht aus den Höhlen nehmen (`PARCOURS_MOTIVE`).

**Kernidee #11 „Sprungpad-Ketten"** (`ideen/sprungpadKetten.js`, Höhlen/Parcours/Turm): bevorzugt die neue
**Federkette** (`motive/ideenraeume.js`) und das Federfeld des Turms. Federkette: Feder auf dem Boden, 1–3
Säulen mit Feder über einer Stachelgrube, Landung dahinter. Gemessen: Flugzeit 1,01 s bei jedem Tempo, Scheitel
7,9 Kacheln, Weite nur vom Lauftempo abhängig (nicht vom Anlauf). Die Federn stehen dort, wo man mit **nur rechts
halten** landet. Ein Fehler dabei: Mit festem Spaltenabstand wanderte die Landestelle je Sprung um einen Bruchteil
weiter (die erste Feder löst an der Vorderkante aus, die folgenden am Landepunkt) — 1 Kachel breite Säulen (ab Stufe
4) wurden bei Tempo normal ab der zweiten verfehlt. Jetzt fortlaufend aus der echten Landeposition berechnet. Die
Stacheln sind Pflicht (`gefahren`), ohne sie säße man in der Grube fest.

**Beweise:**

| Prüfung | Ergebnis |
| --- | --- |
| Solver-Fenster Bröckelschlucht (neu bemessen), Federkette, Schlucht (3 Modi), Kette | je 45/45 |
| Menschen-Bot Schlucht oben / Kette / Bröckelschlucht (4 Verzögerungen) / Federkette (nur rechts) | alle |
| Motive je Level (5 Seeds × 3 Längen × 3 Stufen × 2 Tempi) | Bröckelkette 2,9 / 3,8 / 3,0 (Höhlen/Parcours/Turm), Sprungpad-Ketten 3,3 / 3,9 / 1,3 |
| Ganze Level mit den neuen Ideen | 0 gerissen, 0 Start-Mängel |

Frontend 401/401 (17 Tests in `ideenraeume.test.js`), Backend 173/173, ESLint sauber, Spiegel neu (nur GEN).

**Offen:**
- Sprungpad-Ketten im Turm fehlt in 38 von 90 Leveln: Das Federfeld ist erst ab Stufe 2 freigegeben und darf nicht
  oberstes Stockwerk sein. Es auf Stufe 1 freizugeben, bräuchte einen neuen Stockwerks-Beweis.
- Turm-Stockwerke (Bröckelleiter, Federfeld) noch nicht mit dem Menschen-Bot geprüft — ein Kletter-Bot braucht
  Lenkung links/rechts, anders als die Läufe hier.
- Der Bot hat eine Lücke in der Chunk-Bibliothek nahegelegt, ohne dass ich sie geprüft hätte: Chunks mit ähnlicher
  Form (schmale Bröckelstücke) sind vermutlich ebenso nur Solver-belegt.

## 14. Menschen-Prüfung aller 71 Chunk-Vorlagen und der 6 Turm-Stockwerke (25.09.2026)

**Auftrag des Nutzers:** erst die alten Chunks und die Turm-Stockwerke prüfen, dann weitere Kernideen.

**Methode — was NICHT funktioniert hat (damit es nicht wiederholt wird):**
- Den Solver-Weg blind mit Verwacklung nachspielen: Fehler summieren sich über den Weg, fast alles fällt durch.
- Das Zeitfenster jedes Drucks im Solver-Weg messen („landet wieder an derselben Stelle?"): misst die Eigenheiten
  des Solvers — Bunny-Hops im Landetick, Doppelsprünge aus der Luft, wo ein Mensch vom Boden springt.
- Spielraum je Wandsprung per Tiefensuche: meldete selbst für den nachweislich leichten `wall-shaft` 3 Ticks.

**Was funktioniert hat (Werkzeuge unter `gen/tools/menschen/`):**
1. Allgemeiner Menschen-Bot mit Vorausschau (`mensch2.mjs`): wählt alle 50 ms eine einfache Handlung (laufen,
   springen, Doppelsprung, gegensteuern, warten, Wandsprung, Dash, Greifen) — nur, was AUCH 100 ms später noch
   gutgeht. Das Gegensteuern in der Luft war entscheidend (ohne es überspringt man schmale Ziele zwangsläufig).
2. Gedachte Wege mit Stellgrößen und Rastersuche (`routen.mjs`), Ergebnis als Zeitfenster (z. B. „Absprung-Fenster
   0,45 s").
3. **Verzeihlichkeit** (`verzeihlich.mjs`): Jeder Druck des Solver-Wegs wird um ±4/8/12 Ticks verschoben, danach
   plant der Solver NEU (dafür die Option `startWelt` in `solver.js`, ohne sie unverändert). Eng heißt: weder 4 Ticks
   früher noch später ist noch rettbar. Das ist die belastbarste Methode — sie verzeiht Solver-Eigenheiten, weil
   jede Abweichung neu geplant wird; nur Tödliches und Ausweg-loses zählt.

**Ergebnis:**

| Gruppe | Befund |
| --- | --- |
| 39 Chunks | allgemeiner Bot schafft sie in jedem Tempo mit jeder Reaktionszeit |
| 8 Chunks mit vereinzelten Bot-Toden (Säge-Orbits, Stacheln, Wind, Fabrik …) | Bot-Schwächen: mit Gegensteuern bzw. gemessenem Fenster fair (Wind-Stacheln z. B. 1,4 s Absprung-Fenster) |
| Mechanik-Chunks (Wand, Greifen, Schlüssel, Schalter, Mover, Einweg, Kristall) | fair; Kristallketten, fallende Brücke, Federschacht hatten schon Bot-Tests |
| **`ring-launch`** | **bei normal nur per Wandsprung-Rettung** an der Gegenwand (Ring + Doppelsprung trug nicht bis über die Kante); Absprung-Fenster 0 → **behoben**: Zielboden ab Spalte 23 statt 26 → normal 446 ms, schnell 308 ms, super 216 ms |
| **`combo-shaft-dash`** | bei normal Dash-Fenster ~0,1 s → **behoben**: Lücke 10 statt 11 → 50–200 ms. (Bei 9 wäre der Dash überflüssig; bei schnell/super war er es schon immer.) |
| **`laser-shaft`, `spike-wall-shaft`** | bei normal fair, bei schnell/super systematisch 0–4 Ticks Spielraum (Wandsprung stößt schneller ab, Wände werden in anderen Höhen getroffen) → **nur noch `classes: ['normal']`** |
| Turm-Stockwerke | 42 Läufe (6 Arten × 3 Tempi × leichteste/Stufe 5, Bröckelleiter mit 6 weiteren Seeds): **kein enger Druck** außer einem Einzelfall, der mit weiteren Seeds nicht wiederkam |

Solver-Nachweis der geänderten Chunks 24/24. Drei neue Tests in `designed-routes.test.js` (Gegenprobe: beide Bot-Tests
scheitern mit der alten Geometrie). Frontend 404/404, Backend 173/173, Spiegel neu.

**Achtung Tagesrennen:** Die Chunks gehören auch zum v1-Generator. Das Tageslevel eines Seeds ändert sich mit dem
Deploy; Läufe mit altem Stand gelten als „nicht geprüft". Deploy am besten kurz nach dem Tageswechsel (2 Uhr).

**Offen:** Ob schnelle Runden `laser-shaft`/`spike-wall-shaft` in einer je Tempo vermessenen Fassung zurückbekommen
sollen, ist eine Design-Entscheidung — der vorsichtige Eingriff war, sie dort herauszunehmen.

## 15. Kernideen #21 „Die Decke lebt" und #20 „Wandsprung-Schluchten" (25.09.2026)

Beide über Motive, Höhlen und Parcours (Parcours darf dafür auch den Steinschlaggang der Höhlen nehmen).

**Deckengang** (`motive/ideenraeume.js`): ein Tunnel, über dem Gang massiver Fels bis zur Oberkante (kein Weg obendrüber),
lichte Höhe 5. Teile: `zapfen` (hängende Stacheln, aber um jede Grube bleibt die Decke auf der Länge eines vollen Sprungs
frei — aus `reach` bemessen), `steinschlag` (Fallblöcke unter der Decke: wer durchläuft, ist weg, bevor sie fallen),
`gitter` (getaktete Laser aus der Decke, Pausen ≥ 1,2 s). Früh einer, spät zwei kombiniert. Eine Grube räumt ihre Spalten
bis zur Oberkante — die Decke wird danach neu geschlossen (Test).

**Kletterschlucht:** Felsstufe 10–12 hoch (höher als jeder Doppelsprung), davor ein 4 breiter Schacht zwischen Säule
und Wand — die Maße von `wall-shaft`, den der Menschen-Bot in jedem Tempo schafft. Varianten `einfach`, `doppelt`,
`saegentor` (Säge auf dem oberen Weg). Bewusst keine Stacheln an den Schachtwänden (Abschnitt 14).

**Beweise:**

| Prüfung | Ergebnis |
| --- | --- |
| Solver-Fenster, 8 Varianten × 3 Tempi × 5 Stufen × 3 Seeds | 360/360 |
| Verzeihlichkeit (±4/8/12 Ticks, neu geplant), 8 Varianten × 3 Tempi × Stufe 3/5 | kein enger Druck — bis auf einen Sprung über die Säge im Sägentor (super) |
| Sägentor gesondert: blind zu beliebigem Zeitpunkt loslaufen, mit 17–150 ms Verzögerung über die Säge springen | 68–87 % — mit abgepasstem Moment fair |
| Menschen-Bots (Tests): Zapfen mit vollem Sprung an Gruben, Steinschlag nur durchlaufen, Kletterschlucht im Zickzack mit 17–150 ms | alle Stufen, alle Tempi |
| Ganze Level (5 Seeds × 3 Längen × 3 Stufen × 2 Tempi) | Motive je Level: Decke 2,9 (Höhlen) / 5,6 (Parcours), Schluchten 2,8 / 3,9; kein mittleres/langes Level ohne, 0 gerissen, 0 Start-Mängel |

Frontend 409/409, Backend 173/173, ESLint sauber, Spiegel neu (nur GEN). Stand Phase C: **9/25 Kernideen**.

**Offen:** Turm hat für beide Ideen keine passenden Stockwerke (die Halle hat Eiswände; ein Wandsprung-Stockwerk oder eine
„lebende Decke" im Turm wären eigene Stockwerksarten). „Die Decke lebt" macht Parcours sehr dicht (5,6 von 8 Plätzen,
weil sich zwei bevorzugte Räume abwechseln) — beim Spielen beobachten.

## 16. Kurswechsel: „Weg zuerst" — Welttyp `pfad` (25.09.2026)

**Rückmeldung des Nutzers:** Alles fühlt sich an wie eine Kopie — Türme immer gleich (Federfeld knallt gegen die Decke),
Höhlen ein Déjà-vu (Aufstieg – Lauf – Abstieg, Säge im Boden, Abkürzungen), „Die Decke lebt" mit „D gedrückt halten"
zu schaffen, Schlüssel und Schalter ohne Aufgabe. Vorbild sind seine Level „Fast Höhle" (160×60, 209 Elemente, davon 178
Stacheln direkt am Weg; Weg läuft rechts, hoch, zurück nach links) und „Up it Goes" (fünf Szenen übereinander, jede
eine eigene Komposition aus 3–4 Mechaniken). **Entscheidung:** Weg zuerst; die Mitte (Stufe 3) soll an seine Level
herankommen.

**Diagnose:** Die alten Welttypen haben eine feste Großform, und die Räume setzten Gefahren dorthin, wo man ohnehin nicht
vorbeikommt — ich hatte „menschentauglich" so optimiert, dass nichts mehr übrig blieb.

**Sofort behoben:** Säge der Sägenhalle auf die Standfläche (lag in der Felszeile), Abkürzungen in Höhlen abgeschaltet,
letzte Federplattform im Federfeld ohne Feder, `switch-gate`/`switch-air` nicht mehr in den Welttypen (v1 unverändert).
Dabei zwei Tests korrigiert — einer prüfte nach dem Abschalten der Abkürzungen gar nichts mehr (0 von 12 Fällen).

**Neu — `gen/world/pfad/`, Welttyp `pfad`:**
- `probe.js`: jeden Zug in der ECHTEN Sim spielen, auf einem Ausschnitt des entstehenden Rasters (80×60).
- `zuege.js`: Züge wie ein Mensch sie drückt — sprung, doppel, fall, feder, portal, Greifen — mit Varianten (±6 Ticks
  auf jede Stellgröße = ±50 ms).
- `planer.js`: Zug würfeln → ohne Ziel spielen → Landeplattform auf die Flugbahn → alle Varianten müssen landen →
  Korridor. Mechaniken (Feder, Ring, Anker, Portalpaar) über eine Rückgängig-Liste; Rücknahme früherer Züge bei
  Sackgassen; **Störprüfung**: Jeder neue Zug spielt alle früheren in seiner Nähe erneut (vorher störten 52 von 882 Zügen
  frühere) und übernimmt deren geänderte Flugbahn in den Korridor. Start- und Zielkopfraum sind reserviert (die
  gemeinsame Zielplattform räumte sonst frühere Plattformen weg).
- `fuellung.js`: „Korridor | Stachelschicht | Fels" — Stacheln direkt am Korridor, Fels erst mit Abstand 2 (kein
  Wandkontakt, der die Flugbahn ändert). Stile `hoehle` (ausgehöhlter Gang) und `offen`. Höchstens 450 Stacheln. Danach
  wird jeder Zug auf der fertigen Karte erneut gespielt.
- `szenen.js`: Szenen mit Muster (Traverse, Aufstieg, Abstieg, Rückweg, Serpentine, Zickzack …), Stil und Mechanik —
  nie zweimal dieselben hintereinander.
- Fähigkeit `pfad` für den Bewegungsgraph (jeder Zug eine Brücke), Solver-Option `startWelt` (Menschen-Prüfung).

**Stand der Messung:** Jeder Zug trägt auf der fertigen Karte (0 von 24 Leveln mit Ausreißer, 0 Kacheln Füllung
zurückgenommen); Graph 18/18, keine Reparatur, Start sicher; der echte Solver löst 6/6 ganze Level (unabhängig vom Planer);
im Mittel je Level 5 Ringe, 6 Federn, 5 Portalpaare, 2–3 Anker, bis 450 Stacheln; 100–300 ms je Level. Der
Determinismus-Test fand `Math.hypot` und `**` (nicht bitgleich) — ersetzt. Frontend 415/415, Backend 173/173.

**Noch nicht drin (nächste Schritte):** getaktete Tore (Laser/Säge an Wartestellen), Wandsprung-Schächte als Zug,
Bröckel-Landeflächen, Mover zum Mitfahren, Schlüssel/Schalter mit echter Aufgabe (Schalter lässt die Brücke verschwinden,
auf der man kam), Schwierigkeitskalibrierung gegen die Level des Nutzers. Pfad ist ein fünfter Welttyp neben den alten;
ob er sie ersetzt, entscheidet der Nutzer nach dem Anspielen.

### 16a. Nach dem ersten Anspielen von `pfad` (25.09.2026)

**Rückmeldung:** Richtung stimmt, aber: jedes Level eine Stachelhöhle als Irrgarten; Stacheln, wo man sie nicht braucht (bei
ihm: unter Schwungbahnen und an präzisen Sprüngen); Greifanker nutzlos (Sprung geht auch ohne, dazu in engen Höhlen);
Checkpoints führen in die Irre; über die Map klettern und fast direkt zum Ziel; fünf Teleporter, die drei Felder weit
tragen.

**Umgebaut:**
- `fuellung.js` neu: **keine Felsmassen** mehr (deren Oberseiten waren begehbar — daher das „über die Map klettern").
  Gefahren mit Zweck: flacher Stachelboden unter jeder Lücke (knapp unter dem tiefsten Punkt des Sprungs), Stacheln auf
  ungenutzten Teilen der Landeplattformen (enge Landung), ab Stufe 3 Stachel-Deckel über hohen Bögen (oben besetzt).
- `regeln.js` neu: **keine Abkürzung** (eine neue Plattform darf von keiner 3+ Schritte älteren erreichbar sein, großzügig
  geschätzt samt Fallweite und Federn) und **Notwendigkeit** (Feder, Ring, Anker, Portal fliegen raus, wenn einer von 21
  schlichten Sprüngen/Doppelsprüngen/Fällen dasselbe Ziel schafft).
- Portale: höchstens 1 (kurz) bzw. 2 Paare, Ausgang 20–36 Kacheln entfernt. Federn: Ziel 8–12 Zeilen höher (was ein
  Doppelsprung nicht schafft), Doppelsprung im Flug, Richtung dorthin, wo Platz ist.
- Checkpoints am Anfang jeder Szene statt alle 6 Züge. Karte 150 Zeilen hoch.

**Gemessen (24 Level):** je Level 2,7 Federn, 2,9 Ringe, 1,5 Portalpaare, 1,9 Anker (alle nötig), ~227 Stacheln, 6–7
Checkpoints; 23 von 24 Wegen vollständig; 0 Züge ohne Halt; ~300 ms je Level. Tests: 3 neue (Abkürzung, Portal-Budget,
keine Standfläche abseits des Weges). Frontend 418/418, Backend 173/173.

**Offen:** getaktete Tore, Wandsprung-Zug, Bröckel, Mover, Schlüssel/Schalter mit Aufgabe; ein eigener Test für die
Notwendigkeit (bisher nur beim Planen erzwungen).

### 16b. Großformen und drei neue Mechaniken (25.09.2026)

**Rückmeldung:** Pfad gefällt besser als die alten Welttypen, aber alle Level sind gleich gebaut (links nach rechts,
Sprünge über Stachelgruben). Weitere Mechaniken ja, aber die Level sollen sich immer im Aufbau unterscheiden; lange Level
keine drei aneinandergehängten kurzen. Kurze Level sind fraglich (20 s); Lobby und Tagesrennen sollen später nur „super".

**Großformen** (`pfad/szenen.js`, `FORMEN`) — der Seed wählt die Form des ganzen Levels:
- `strom` links→rechts, auf und ab · `turm` schmal senkrecht, Zickzack (Breite nach Sprungweite: normal ~100, super ~130;
  höchstens 34 Züge) · `absturz` von oben nach unten · `halle` geschlossener Raum mit Eiswänden, Etagen hin und her
  (immer ganze Etagen: 4 waagerecht + 3 Aufstiege im Zickzack auf der Stelle; nicht in „kurz") · `welle` weite Auf- und
  Abstiege, vorwärts (`bergauf`/`bergab`: 2 von 3 Zügen mit fester Richtung rechts — frei gewürfelt driftete die Welle an
  den linken Rand).
- Keine Kombination aus Muster und Mechanik zweimal in einem Level; Szenen 3–9 Züge lang.
- Endet ein Weg vorzeitig, plant `typen/pfad.js` mit neuem Zufall (höchstens 3 Versuche, der längste gewinnt).
- Höhenbudget im Planer: Über dem Ziel müssen alle noch geplanten Aufstiege je 3 Zeilen Platz haben; schlichte Sprünge
  werden gekürzt, Wandschacht/Feder verworfen.

**Neue Mechaniken** (Züge in `zuege.js`, Aufbau in `planer.js`):
- **Wandschacht** (`wand`): Wand A über der Plattformkante (unten offen), Wand B jenseits, Plattform oben auf B, A höher und
  oben mit Stachel. Zug: in den Schacht springen, bei jedem Wandkontakt `reaktion` Ticks rutschen, abspringen. 11–15
  Zeilen hoch. Schachtbreite = round(Lauftempo/58) + 0..1 (gemessen mit allen Varianten: normal 2–3, schnell 3–4, super
  4–5). Sprünge lang gehalten (26–34 Ticks) — kurz gedrückt kam man nicht über den Schacht UND höher. Nie zwei
  hintereinander.
- **Zeittor** (`tor`): Laser von oben durch die Mitte der Flugbahn, Periode 2,0–2,8 s, an 0,6–0,9 s. Der Zug wartet auf die
  Abschalt-Flanke (+ `torReaktion`) — unabhängig davon, wann man ankommt. Der Strahl endet an einem eigenen Fänger (Fels
  mit Stachel) unter der Bahn; **kein anderer Zug darf ihn kreuzen** (`strahlen`, sonst Zufallstod je nach Takt).
- **Bröckelplattform** (`broeckel`): Die Landefläche besteht aus Bröckelblöcken (0,28 s), schmal. Von ihr aus keine Feder,
  kein Portal, kein Checkpoint. Geprüft wird der nächste Zug mit 16 Ticks Vorlauf (Landen + Abbremsen). Der Graph kennt
  ihre Oberseiten als virtuelle Standflächen (`reichweite/graph.js`).
- **Seilgang** (Anker): Stacheldecke knapp über dem Anker über die ganze Schwungbreite. Seil-Parameter jetzt weit
  (halten 40–70 Ticks, Anker 4–7 voraus und hoch) — gemessen trägt ein Schwung bis 22 Kacheln (normal), ein Doppelsprung
  8,4; mit den alten, zaghaften Werten war fast jeder Ankerzug „unnötig". Die Plattform deckt die Landestreuung ALLER
  Varianten ab (Seil und Ring; höchstens 10 Kacheln).

**Menschlicher gemacht:** Ein Zug endet erst, wenn man nach der Landung losgelassen hat und STEHT (vorher: 3 Ticks nach
dem Aufsetzen). Die Rutschstrecke gehört damit zur Bahn — vorher setzte die Füllung Landekanten-Stacheln genau dorthin, und
nach einem Ring rutschte man hinein. Plattformen werden um den Bremsweg v²/(2·1900) verlängert.

**Kettenlauf** (neuer Test): alle Züge nacheinander in EINER Welt der ganzen Karte — echte Levelzeit (Laser-Takt),
Bröckel-Zustand, Schwung vom vorigen Zug. Gemessen 23 von 24 ganzen Leveln am Stück (der eine: Sprung nach einem Ring
landet eine Plattform zu weit — Schwung aus dem Stand vs. im Spiel). `WEGE` (WeakMap in `typen/pfad.js`) reicht den Weg an
Tests weiter, ohne die Level-Daten aufzublähen.

**Elemente-Limit:** Der Stacheldeckel der Füllung ist jetzt min(450, 600 − Elemente des Weges − 40).

**Gemessen (32 Level):** je Level ~28 schlichte Sprünge, 2,5 Wandschächte, 2,7 Tore, 3 Bröckelplattformen, 1,8 Ringe,
1,9 Federn, 1,1 Portalpaare, 0,6 Anker (alle nötig); alle Formen vollständig bis auf je einen Zug. Frontend 422/422.

**Offen:** Mover, Schlüssel/Schalter mit Aufgabe; Anker noch selten; Phase D: Tagesrennen und Lobby auf Pfad, nur
„super", Entscheidung über „kurz".

### 16c. Sicht, Stacheln mit Zweck, Aufgaben statt Kernideen (25.09.2026)

**Rückmeldung:** (1) Anker und Wege oft nicht im Bild. (2) Welten sehen fast gleich aus — braucht es dafür wirklich unzählige
Kernideen? Wunsch: Schlüssel über eine Extra-Route, schwere Einzelblock-Sprünge. (3) Stacheln schweben überall, Blöcke mit
Stacheln oben und unten ohne Zweck. Sein Prinzip: Stacheln nur, wo man bei einem Sprung patzt oder an knappen Sprüngen;
Wände, an denen man nicht schummeln soll, aus Eis (kein Wandsprung).

**Sicht** (`planer.js`, `imBild`): Kamera 480×270 px (±15 × ±8,4 Kacheln, 44 px Vorausschau). Die Landestelle muss spätestens
am Scheitel im Bild sein (bei Fall-Zügen bis zur Landung), ein Anker schon beim Absprung — Anker sitzen höchstens 6 Zeilen
über der Standfläche (vorher bis 11: unsichtbar).

**Füllung neu** (`fuellung.js`): Gelände statt Streifen.
- Das Aussehen legt der Szenenplan fest (`szenen[i].saeulen`, 65 %): Säulen-Szenen = Plattformen auf Felssäulen, dazwischen
  Stachelgruben über die ganze Zugbreite, darunter Fels bis zum Kartenrand; sonst schwebend über dem Abgrund.
- Grotten-Decke folgt dem Weg (3 Zeilen über der Bahn, bis zum oberen Rand). Alle freien Seitenflächen der Füllung: Eis.
- Keine Deckel, keine Grotten-Stacheln mehr. Kappen des Planers (Wand A, Laser-Sender, Seilgang-Decke) wachsen zu Fels:
  breite bis zum Rand, einzelne nur bis an Fels (≤ 20 Zeilen) — sonst bleibt die Stachel.
- Die Füllung besteht aus Gruppen (Säulen); Rücknahmen und Ausdünnen nehmen immer ganze Säulen (Ausdünnen: ganze Gruben
  eines Zugs), Kappen bekommen dabei ihre Stachel zurück. Danach: schwebende Stacheln weg, freie Oberseiten besetzt
  (Sicherheitsnetz), Schlussprüfung ALLER Züge.
- Tore nur noch in Grotten-Säulen-Szenen (Sender an der Decke, Fänger im Boden); der Tor-Zug findet SEINEN Laser über die
  gemerkte Lage (`torRel`) statt „nächster in Laufrichtung" (Kettenlauf starb sonst am falschen Laser).

**Aufgaben** (kombinierbar mit Formen und Mechaniken, statt immer neuer Kernideen):
- `einzelblock`: Landefläche 1–2 Kacheln (so breit wie die Landestreuung), ab Stufe 3 mit ±4 statt ±6 Ticks geprüft.
- `schluessel`: Hub → Sprung vorn hinab in eine Nische (4–6 vor dem Hub, 3–6 tiefer, 4–7 breit, nach Tempo) mit dem
  Schlüssel → Rücksprung auf den Hub → erst dann Eiswand vom oberen bis zum unteren Rand gleich hinter allem, was der
  Abstecher berührt, mit 7 Zeilen hoher Tür in Hub-Höhe → der nächste Zug springt über die Nische durch die Tür. Prüfwelten
  nach dem Schlüssel starten mit `flags.keys = 1`. Findet der Abstecher keinen Platz, wird er aufgegeben (zurück bis zu
  seinem Anfang, schlichte Züge) statt den Weg abzubrechen. Irrwege, gemessen: nach oben kein Platz (Anflugbogen/Tür), zwei
  Aufstiege = Rückfall auf die Zwischenplattform, Feder auf dem Hub = Rückfall schleudert hoch, Nische zu nah = Kopfstoß.
- Allgemein: Blockierte Plattformenden werden gekürzt, solange die Landestelle ±1 bleibt.

**Gemessen:** 64 Level (zwei Seed-Reihen): alle vollständig, 0 schwebende Stacheln, 0 freie Standflächen, Kettenlauf 64/64.
Schlüssel-Abstecher gelingen in ~40 % der geplanten Szenen (sonst aufgegeben), Einzelblöcke ~1 je Szene. Tests: 4 neue
(schwebende Stacheln, Anker im Bild, Einzelblockbreite, Schlüssel/Wand ohne Lücke). Frontend 426/426, Backend 173/173.

**Offen:** mehr Aufgaben (Schalter, Mover, Kristall-Dash-Stellen …), Schlüssel-Quote erhöhen, Phase D.

### 16d. Mehr Aufgaben — weg von „nur Sprünge über Stachelgruben“ (26.09.2026)

**Rückmeldung:** gefällt, aber eintönig — fast nur Sprünge mit Stachelgruben; mit mehr Aufgaben weitermachen.

**Neue Aufgaben** (Elemente, die im Pfad-Generator vorher fehlten; alle mit Varianten in der Sim geprüft):
- **Dash-Tunnel** (`dash`): über die Kante laufen, Kristall am Plattformrand, flach hinüberdashen; darüber eine niedrige
  Stachel-Decke direkt über Kopfhöhe, an der jeder Sprung endet. Gemessen: Als Weiten-/Höhenhilfe taugt der kurze Dash
  (0,14 s) nicht — Doppelsprung + Dash nur 1–2 Kacheln weiter als ein guter Doppelsprung, schräg hoch +1,3 Zeilen.
  Landung 2–4 Zeilen tiefer (auf Standhöhe erkannte die Probe die „Landung“ sofort neben der Kante), Plattform beginnt erst
  an der Landestelle.
- **Rückenwind** (`wind`): Windzone über der Lücke, Stärke nach Tempo (normal 500–900, schnell 800–1300 px/s²; gemessen
  1000–1500 → 4 auf 10–13 Kacheln). **Aufwind** (`aufwind`): Säule 3–5 breit direkt vor der Kante, −1200…−1700 px/s², hebt
  7–12 Zeilen. Windzonen berührt kein anderer Zug (wie Laserstrahlen, über `strahlen`), keine Plattform liegt darin; Sicht
  bis zur Landung.
- **Schalter-Brücke** (`schalter`): Schalter am Scheitel des Bogens (jede Variante muss ihn treffen), die nächsten 2–3
  Landeplattformen aus Farbblöcken seines Kanals (fest erst nach dem Schalten). Prüfwelten danach mit `flags.sw`.
  Kein anderer Zug berührt den Schalter. Graph: Farbblock-Oberseiten als virtuelle Standflächen.
- **Schlüssel** jetzt mit fester **Schwelle** hinter der Tür (4 Kacheln) und eigenem Tür-Schritt (`abstecher: 'tuer'`).

**Mehr Aufgaben je Level:** In den ersten 20 Versuchen eines Zugs wird genau eine Mechanik seiner Szene erzwungen (vorher
gewann meist ein schlichter Sprung); Bröckel dabei mit Gewicht 0,35. Der Szenenplan vergibt nur Mechaniken, die zu den
Richtungen der Szene passen (Aufwind nur mit Aufstiegen, Wind/Dash nur mit waagerechten Zügen), und gewichtet die neuen
Aufgaben (Schlüssel 3, andere 2).

**Menschlicher geprüft (gefunden im Kettenlauf):**
- Störprüfung: Ein früherer Zug gilt auch als gestört, wenn er woanders zum Stehen kommt (er landete auf der Feder des
  nächsten Zugs und sprang 7 Kacheln weiter).
- Jeder Zug wird zusätzlich mit ±4 px versetztem Start gespielt und von JEDER Landekachel des vorigen Zugs aus (jeweils
  mit ±4 px) — auf Einzelblöcken entscheiden 2 px über die Absprunggeschwindigkeit.
- Leere Spur (Tod im ersten Tick) zählt als gescheiterte Variante statt abzustürzen.
- Plattformenden, die blockiert sind, werden gekürzt (Landestelle ±1 bleibt).

**Gemessen (64 Level):** je Level ~42 Züge, davon 20 schlicht (vorher 30); Bröckel 4,4, Einzelblock 2,9, Tor 2,7, Feder 2,5,
Ring 1,9, Schalter 1,5, Wandschacht 1,3, Rückenwind 1,1, Dash 0,9, Anker 0,7, Aufwind 0,6, Portal 0,6, Schlüssel 0,2.
Alle vollständig, Kettenlauf 64/64, 0 schwebende Stacheln, 0 freie Standflächen. Tests: 2 neue (Aufgaben kommen vor; Wind
und Schalter berührt nur ihr Zug).

**Offen:** bewegte Plattformen (Mitfahren mit Warte-Taktik wie beim Tor), Schwerkraft-Zonen, Aufwind/Schlüssel noch selten.

### 16e. Handschrift und Mitfahr-Plattformen (26.09.2026)

**Rückmeldung:** mehr hinzufügen; es darf Level geben, die nur aus Einzelsprüngen bestehen, oder nur aus Mitfahr-Plattformen
— aber nicht jedes Level so. „Jedes Level wie ein komplett eigenes … als ob ein anderer Mensch jedes Level machen würde.
Wie eine eigene Handschrift.“

**Handschrift** (`pfad/handschrift.js`): Der Seed wählt einen „Autor“ — ein Thema mit eigener Mechanik-Palette — und würfelt
seine Eigenheiten: Anteil schlichter Szenen, Szenenlänge (kurz 3–5 oder lang 5–9), Plattformbreite (schmal/normal/breit),
Stacheldichte an Landekanten, Grubentiefe, Säulen- und Grotten-Anteil, bevorzugte Großformen.
Themen: `allrounder` (alles), `klassiker` (nur Sprünge), `praezision` (Einzelblock, Bröckel; schmal, viele Stacheln),
`faehrmann` (nur Mitfahrt; meidet Absturz und Turm), `windlaeufer` (Wind, Aufwind, Ring), `uhrwerk` (Tor, Bröckel,
Schalter; viel Grotte), `kletterer` (Wand, Feder, Aufwind, Mitfahrt; mag Turm/Halle), `akrobat` (Anker, Ring, Feder;
wenig Säulen), `tueftler` (Schalter, Schlüssel, Portal, Einzelblock), `flitzer` (Dash, Ring, Bröckel, Wind).
Der Szenenplan wählt nur Mechaniken der Palette (Wiederholung erlaubt) und bevorzugt Wegmuster, in denen sie gehen.
`ctx.pfadThema` erzwingt ein Thema; `notizen.thema`/`notizen.handschrift` zeigen, wer das Level „gebaut“ hat.

**Mitfahrt** (`mitfahrt`): Fähre (waagerecht, 6–12 Kacheln) oder Aufzug (senkrecht, 6–11 Zeilen), bewegte Plattform 3 breit,
50–80 px/s. Zug: an die Kante gehen, warten bis die Plattform am nahen Ende ist, aus dem Stand aufspringen, mitfahren bis
zum fernen Ende, abspringen. Die überstrichene Fläche ist für andere Züge gesperrt. Gemessen: Wer erst beim Eintreffen
losläuft, kommt zu spät (46 Ticks Anlauf).

**Prüfung:** Jeder Zug zusätzlich von jeder Kachel im Landebereich des Vorzugs ±1 (auf dessen Plattform). Kettenlauf-
Restfehler sind jetzt Unterschiede von wenigen Pixeln innerhalb einer Kachel bei knappen Sprüngen (ein Mensch passt den
Anlauf an, der Kettenlauf nicht).

**Gemessen (je Thema 4 Level):** Klassiker 100 % Sprünge; Präzision 39 % Sprung / 43 % Bröckel / 19 % Einzelblock; Fährmann
~50 % Mitfahrt; Uhrwerk 21 % Bröckel, 17 % Tor, 11 % Schalter; Kletterer 21 % Mitfahrt, 15 % Feder … Laufzeit 0,5–6 s je
Level (Akrobat am langsamsten: Seil-Streuung). Tests: 2 neue (Palette wird eingehalten; verschiedene Autoren, Mitfahr-Level).

**Offen:** Schwerkraft-Zonen, Dash im Flitzer selten, Laufzeit des Akrobaten.

### 16f. Zielschloss, Ring-Ketten, Wechselschalter, Abkürzung über Aufwind (26.09.2026)

**Rückmeldung:** gefällt sehr (knappe Sprünge, Böen, Schalter in der Luft). Wünsche: (1) Ziel versperrt, erst ein Knopf
öffnet es; (2) Boost-Ringe gehen oft auch per Doppelsprung; (3) mehr solche kreativen Ideen wie Schalter-Landeflächen;
(4) welt-88169: am Ende links direkt zum Ziel, rechts zu zwei unnötigen Checkpoints; (5) nur noch lange Zufallswelten;
(6) Bröckelplattformen schmal, wenig Zeit zum Absprung.

- **(4) Abkürzung über Aufwindsäulen:** Die Säulen bleiben stehen — wer wieder hineinspringt, fährt bis oben und driftet zur
  oberen Plattformreihe. Die Oberkante jeder Säule zählt jetzt für die Abkürzungsregel wie eine Plattform mit Feder
  (`schritt.lift`). Dabei auch: Die Ausnahme für den Schlüssel-Hub prüfte Koordinaten statt des Objekts — jetzt nur `hub`.
  Neuer Test über ganze Level aller Formen (auch Windläufer); Gegenprobe: ohne die Regel schlägt er an.
- **(5)** Welten-Werkbank fest auf „Lang“ (Live-Spiel folgt in Phase D).
- **(6)** Bröckel: Plattform = Landestreuung (höchstens 3 Kacheln), Zerfall 0,30 s (Stufe 1) bis 0,22 s (Stufe 5).
- **(2) Ring-Ketten:** Sprung → Doppelsprung → Ring am zweiten Scheitel → noch ein Luftsprung (der Ring gibt ihn zurück).
  Gemessen normal/super: 18/20 Kacheln statt 8/13,5 (Doppelsprung), aufwärts 11 statt 6,6 Zeilen. Notwendigkeit für Ringe
  mit ~50 statt 21 schlichten Probesprüngen; Sicht bis zur Landung. Die Grundregel des Rings bleibt unverändert.
- **(1) Zielschloss:** Die Zielplattform wird 9 Kacheln länger, am fernen Ende sitzt das Ziel in einem Käfig aus
  Farbblöcken; ein Schalter im Scheitel eines letzten Sprungs (Schritt `zielschalter`) öffnet ihn. Senkrecht flog man zweimal
  durch den Schalter (an, wieder aus) — daher ein Bogen Richtung Käfig. Handschrift: Tüftler 85 %, Uhrwerk 80 %, sonst 35 %.
  Test im fertigen Level: mit Schalter ins Ziel, ohne nicht (7/7 gemessen).
- **Schalter-Kanäle richtig modelliert:** Die Sim hat 4 Kanäle; ab dem 5. Schalter wird einer wiederverwendet und schaltet
  AUS. Der Planer kippt das Bit (`swMaske ^=`), Brücken/Käfig richten sich nach dem Zustand nach dem Umschalten
  (`schalterZiel`).
- **(3) Wechselschalter:** Die Landefläche eines Schalter-Zugs besteht aus Farbblöcken des NEUEN Zustands — sie erscheint erst,
  wenn man den Schalter im Flug trifft. In einer Szene bleibt es derselbe Kanal: Die Plattform hinter einem verschwindet, die
  vor einem erscheint (Rot/Blau im Wechsel).

### 16g. Etappen, Nadelöhr, Fallblock, neue Autoren (27.09.2026)

**Rückmeldung:** mehr Aufgaben („so viele wie es gibt“); Kernideen/Welttypen noch nötig?; welt-37272 in 27 s durch
(Turm, gedeckelt auf 34 Züge), lange Level mit ~1 min „nicht wirklich lang“; welt-85825 (Akrobat, Schwung) gefiel;
„Flappy Bird mit den Grapplern“.

- **Etappen:** Lange Level (ohne erzwungene Form) = drei Großformen hintereinander, je ~30 Züge (`ETAPPEN` in
  typen/pfad.js, 8 Folgen, gewichtet nach Form-Vorlieben des Autors), `ZUEGE.long` 56 → 90. Jede Richtung trägt die
  Ausweichrichtungen ihrer Etappe (`eintrag.ausweich`). Gemessen (8 Level, super): 87–91 Züge, alle im Kettenlauf durch,
  Bot-Zeit 98–263 s, Erzeugung 1,5–17 s.
- **Grenzen:** `LIMITS.maxWidth` 1200 → 1800, `maxElements` 600 → 900 (gilt auch für den Editor); Stachel-Budget für
  Etappen-Level 700.
- **Nadelöhr** (`nadeloehr`): Eisröhren quer durch die Flugbahn, je 8 Kacheln über/unter der Lücke (Lücke = berührte
  Kacheln aller Varianten ±1). Beim Seil hinten nach dem Loslassen (Röhren kappten das Seil). Notwendigkeit erst MIT
  Röhren. In Kombinationen nur als Zusatz (allein gewann sonst immer der einfache Nadelöhr-Sprung). Seil+Röhren noch
  selten — der Seilschwung streut zu stark (eigener Umbau nötig).
- **Fallblock** (`fallblock`): Block 9 Zeilen über der Landefläche (5 → Kopfstoß beim Absprung), Wackeln 0,3–0,45 s
  (super) bzw. 0,55–0,75 s (normal). Er löst schon im Anflug aus: Vorlauf des nächsten Zugs = gemessene Zeit seit dem
  Eintritt in die Zone; Fallzonen dürfen später keine anderen Züge berühren (sonst erschlagen).
- **Autoren:** Windläufer ohne Ring (45 % Ringe!), dafür Nadelöhr; neu Seiltänzer (Seil, Nadelöhr, Ring); Uhrwerk und
  Flitzer mit Fallblock; Akrobat Gewicht 1,5.
- Baukasten-Artifact auf den neuen Stand gebracht (Ablauf, Formen, Autoren, Aufgaben, Regeln, Ideen, Offenes).

### 16h. Nur noch Pfad, Leitideen in vier Akten (26.09.2026)
**Entscheidung:** alte Welttypen und Kernideen stillgelegt, nur noch Pfad. Stillgelegt heißt abgeschaltet, nicht
gelöscht: `ZUFALLS_TYPEN = ['pfad']` in registry.js (ein ausdrücklicher `worldType` baut die alten weiter — Tests),
Kernidee nur noch auf ausdrücklichen Wunsch (generate.js). Werkbank/Galerie ohne Welttyp-/Kernidee-Auswahl.

**Leitideen** (`pfad/leitideen.js`, Anregung aus einem Gespräch des Nutzers mit Claude im Web): Stufe 0 vor dem
Szenenplan. Die Handschrift gab jedem Level einen Stil, aber keine Absicht; eine Leitidee ist ein Satz, den das Level in
vier Akten erzählt (Kishōtenketsu): Einführung (Aufgabe allein, Stufe −1) — Steigerung (dichter, kombiniert) — Twist
(Verwandtes, das die Regel umdreht; je Idee FEST gewählt, nicht gewürfelt) — Finale (beides, Stufe +1). Anteile
20/30/20/30 % der Züge über alle Etappen; Szenen schneiden an der Aktgrenze.
- Je Akt: `mechaniken` (auch Kombinationen außerhalb des allgemeinen Topfs), `schlicht`, `dVersatz`. Der Planer rechnet
  je Zug `dZug` (Bröckelzeit, Einzelblock-Toleranz, Doppelsprung-Anteil, Plattformrand).
- Passt keine Akt-Mechanik zur Szene (Rückenwind in der Welle: nur bergauf/bergab), nimmt sie eine der Akte davor,
  notfalls den nächsten.
- Autor aus `idee.autoren` (nur noch Stil); `zielschloss` der Idee gilt. 60 % der Level bekommen eine Leitidee;
  erzwungenes Thema ohne erzwungene Idee baut ohne (Paletten-Tests). Nur in LANGEN Leveln und nie in der Halle: bei
  18/32 Zügen blieben 4–8 Züge je Akt (ein kurzes Level lief nach 11 Zügen aus), der Hallen-Rhythmus trieb an die Wand.
- Behoben (älter, erst durch „nur noch Pfad“ im Zusammenhangs-Test sichtbar): Läuft ein Weg vorzeitig aus, war sein
  letzter Zug nie als Zielzug geplant — die gemeinsame Schicht schob ein Ziel nahe dem oberen Rand nach unten (ebneFlaeche
  klemmt auf KOPFRAUM+2) oder überbaute mit dem Kopfraum eine ältere Plattform. Jetzt nimmt planePfad nach einem Abbruch
  zurück, bis die letzte Plattform taugt (Zeile ≥ KOPFRAUM+3, fest, im Zielbereich keine fremde Plattform/Element); und
  der geplante Zielzug verlangt dieselbe Mindestzeile (`ZIEL_ZEILE_MIN`; frei() hält Zeilen über dem Rand für frei).
- Erste drei: **Taktwerk** (Schalter → Schalter+Bröckel → Tor/Fallblock → Schalter+Tor/Fallblock, Zielschloss),
  **Bröckelkaskade** (Bröckel → +Einzelblock → Fallblock „die Decke fällt“ → Bröckel+Fallblock/Dash),
  **Böenwelt** (Wind → Wind/Aufwind/Ring → Nadelöhr → Wind/Aufwind+Nadelöhr).
- Dabei zwei Fallblock-Fehler behoben (Kettenlauf): (1) ein FRÜHERER Zug flog durch die Auslösezone, der Block lag beim
  Landen schon auf der Plattform → `fallblock-frueh`; (2) über Farbblöcken fällt der Block durch (die Sim prüft beim
  Sturz nur Kacheln) und blieb auf der nächsten Felsplattform liegen → Fallblock-Landeflächen sind nie Farbblöcke.
- Werkbank zeigt Leitidee, Autor und den Satz der Idee.

### 16i. Motive — Signatur-Phrasen, die abgewandelt wiederkehren (26.09.2026)
Schritt 2 nach den Leitideen. `pfad/motive.js` + planer.js.
- **Phrase statt Einzelzug:** 2–3 aufeinanderfolgende Züge. Ein einzelner Sprung fällt unter 90 nicht auf; dieselbe Folge
  von Eingaben ergibt dieselbe Geometrie (gemessen mo-4: Plattform-Versätze 13/15/27 → „weiter“ 15/14/27 → „verschärft“
  13/11/25, schmaler und mit Nadelöhr).
- **Plan** (nur lange Level, `planeMotive` nach dem Szenenplan): Motiv A bei ~10 % vorgestellt, wiederholt gespiegelt
  (~36 %), weiter (~78 %), verschärft (~92 %); bei der Hälfte der Level Motiv B (26 % / gespiegelt 44 % / knapp 85 %).
  Abgestimmt auf die Akte der Leitideen: Der Twist (50–70 %) bleibt frei.
- **Planer:** Die Vorstellung merkt sich die Eingaben (`motivKopie` ohne abgeleitete Felder wie doppelNach2, Schalterkanal)
  und `dy` wie gebaut; beim Zurücknehmen wird sie vergessen. Vorstellungen nehmen keine zustandsbehafteten Aufgaben
  (Schalter, Tor, Mitfahrt, Wand, Portal) — sonst stellte das Taktwerk nie ein Motiv vor. Wiederholung: 3 Versuche die
  Abwandlung, 3 unverändert („gleich“, `statt`), dann normal — Lösbarkeit geht vor.
- **Abwandlungen:** gespiegelt (Richtung und Ring), weiter (+6 Halten, +4 Doppelsprung, +10 Seil), knapp (`zug.knapp`:
  Landefläche = Streuung, höchstens 3 Kacheln, ±33 ms — mit „höchstens 2“ scheiterten fast alle Doppelsprünge),
  verschärft (Bröckel oder Nadelöhr, nur was die Palette des Levels erlaubt; sonst knapp).
- Gemessen (12 lange Level): alle im Kettenlauf durch; wiederholt meist 5–9 von 9 geplanten Wiederholungs-Zügen, schwach
  bei Seil/Nadelöhr (Menschen-Varianten scheitern an den Röhren) und bei Abbrüchen. Werkbank-KPI „Motive“ (A 6/9 …);
  dafür „Zonen“ aus der Kennzahlenleiste genommen.

### 16j. Brückenblock statt Durchlauf-Fallblock, Böen im Takt, Leitidee „Brückenbauer“ (26.09.2026)
**Rückmeldung:** „Decke lebt“ ist nicht challenging — Fallblöcke, unter denen man nur durchläuft, will der Nutzer nicht.
Cooler: Blöcke, die man AUSLÖSEN muss, damit sie den Weg frei machen, weil sie zu lang sind.
- **Brückenblock** (`bruecke`, neuer Zug in planer.js/zuege.js): Grube breiter als jeder Doppelsprung
  (`ceil(reach.gap.double) + 1–3`, super ~21, normal ~14), darüber eine Platte, die je 2 Kacheln übersteht (25–27 lang
  bei super), 3 dick, 5–6 Zeilen hoch (Oberseite 8–9 > Doppelsprung 7,5; geprüft, indem die hängende Platte als Fels
  gilt und ihre Oberseite Ziel der schlichten Proben ist). Eingabe in vier Phasen: an den Rand, bis sie wackelt → aus
  ihrer Spalte zurück (bis draußen UND nicht mehr auf sie zu — sonst rutschte man mit vollem Tempo hinein, Kettenlauf-
  Fehler) → warten, bis sie liegt → hinaufspringen (voll gehalten, bei Abprall erneut), hinüber, dahinter anhalten.
  Liegezeit = gemessene Überquerung + 1,5 s (4–4,5 s). Die Platte findet der Zug über `blockRel`.
  Regeln: kein Brückenblock von Bröckel-/Farbblöcken (man wartet dort — Kettenlauf-Tod); Anlauf: Die Startplattform
  wird verlängert, bis zwischen Landestelle und Überstand 2 Kacheln frei sind (ohne scheiterte fast jeder Versuch);
  Auslösezone von keinem Zug berührt; hängend/fallend/liegend als Strahl gesperrt; keine Landekanten-Stacheln unter
  einem Fallblock (fuellung.js).
  Der alte Fallblock („landen und weg“) ist aus Szenen-Topf, Autoren und Leitideen genommen; der Code bleibt.
- **Böen im Takt** (`boee`): Rückenwind mit `period` 2,4–3,2 s, davon 1,0–1,4 s an. Der Zug geht bis 12 px vor die
  Absprunglinie und wartet auf den ANFANG einer Böe (+`boeeReaktion`), wie das Tor auf seine Flanke; `boeeRel`.
  Windläufer-Palette + Böenwelt (Steigerung, Finale mit Nadelöhr).
- **Leitidee Brückenbauer:** Brückenblock → +Bröckel → Twist Schalter (die Brücke erscheint per Schalter) → Schalter +
  Brückenblock. Bröckelkaskade-Twist jetzt Brückenblock („den Boden selbst herunterholen“), Taktwerk-Twist Tor/Brücke.
- Gemessen: 22 lange Level der vier Ideen alle im Kettenlauf durch (6–27 Brücken je Brückenbauer-Level).
- Offen/nächste Aufgaben: Deckel (Platte verschließt einen Schacht nach oben — auslösen, ausweichen, durch, bevor sie
  zurückfährt), Taktstacheln, einseitiger Eisschacht, senkrechte Kristallkette, Schalter startet Fähre, Flappy-Seil.

### 16k. Deckel, Flappy-Seil, Leitidee „Seilakt“ (26.09.2026)
- **Deckel** (`deckel`, Zug in planer.js/zuege.js): Decke 4–5 Zeilen über der Plattform, darin ein Loch (3–4 breit), das
  eine Platte verschließt; Ziel oben auf der Decke neben dem Loch. Auslösen/zurückweichen/warten teilt er mit dem
  Brückenblock (`ausloesen()` in zuege.js), dann: auf den liegenden Block hüpfen (Richtung über dessen Kante loslassen —
  mit vollem Druck trug der Hüpfer über den ganzen Block), auf der Mitte ausrollen, senkrecht hinauf (Doppelsprung), erst
  über der Decke zur Seite. Liegezeit = gemessen bis „über der Decke“ + 1,5 s. Die Decke wächst diesseits so weit, wie
  Platz ist (3–12; mit fester Länge schnitt sie fast immer den Anflug des vorigen Zugs); ob man außen herum hinaufkommt,
  prüft eine Probe mit geschlossenem Deckel als Fels gegen die ganze Deckenoberseite. Die allgemeine „unnötig“-Prüfung
  gilt für ihn nicht (ohne Platte ist das Loch offen). Boden unter dem Loch wird ergänzt. Selten (0–5 je Level):
  meist fehlt der Platz für die Decke.
- **Flappy-Seil** (`flappy`): 2–3 Anker am Stück, Röhren (Nadelöhr) zwischen je zwei Ankern, Landung erst am Ende
  (33–47 Kacheln weit). Entscheidend: Griffe nach LAGE statt nach Zeit (`greif[k] = {vor, los, r1, r2}`: greifen r1
  Ticks, nachdem man `vor` px vor dem Anker ist; loslassen r2 Ticks, nachdem man `los` px dahinter ist) — mit Zeiten
  summierten sich ±50 ms über die Schwünge auf, keine Variante traf den nächsten Anker. Anker per `seilRel` relativ zur
  Startkachel, gesucht beim ERSTEN Aufruf (nach dem Absprung lag die Kachel woanders). Landefläche bis 18 breit, Streuung
  inkl. Starts ±4 px; Sichtregel bis zur Landung. Nicht im Motiv-Kopien (greif/seilRel/roehrenX sind Ortsdaten).
- **Leitidee Seilakt:** einzelne Schwünge → Seilketten (+ Seil durchs Nadelöhr) → Twist Ringe statt Seile → Seilketten
  im Wechsel mit Ringen. Autoren Seiltänzer, Akrobat. ~10 Seilketten je Level. Deckel zusätzlich im Brückenbauer und
  beim Kletterer.
- **Schalter startet Fähre:** braucht eine Erweiterung der Sim — der Mover ist eine reine Funktion der Zeit, ohne
  Zustand. Nicht gebaut; offen, ob der Nutzer die Sim-Änderung will.
- **Form-Vorlieben je Leitidee** (`idee.formen`, mit denen des Autors multipliziert): Seilakt (strom 3, welle 0,2,
  absturz 0,1, turm 0,2) — in Welle/Absturz passt keine Seilkette, der Szenenplan nahm dann Ringe bzw. der Weg brach nach
  23 Zügen ab; Brückenbauer (strom 3, turm 0,6, welle 0,2, absturz 0,3) — „Welle > Turm > Absturz“ hatte eine einzige
  Brücke. Seilschwung (`greifen`) nur noch in Szenen mit waagerechten Zügen. Gemessen danach: Seilakt 8–14 Seilketten,
  Brückenbauer 11–17 Brücken + 3–10 Deckel, alle Kettenläufe durch. Bauzeit Seilakt 7–50 s (Seilketten-Proben) — offen.

### 16l. Weniger ist mehr: Dosierung, Checkpoints, echte Seilschwünge, Bauzeit (27.09.2026)
**Rückmeldung:** (1) Aufgaben komplett übertrieben — ~10 Schalter-Sprünge oder 5 Brücken hintereinander; Brücken „zu riesig
und uninteressant“, alles soll kleiner und einfacher sein. (2) Checkpoint-Spam (22 in einem Level, alle 2 Sprünge).
(3) Seilsprünge gehen zu 90 % auch mit Doppelsprung. (4) Erzeugung schneller — 5 Runden im Multiplayer; hält der Server 100
Spieler aus?
- **Dosierung** (szenen.js `dosiere`): Nur ein Teil der Züge einer Szene trägt ihre Aufgabe — höchstens 2 hintereinander
  (auch über Szenengrenzen), höchstens 3 je Szene, sonst 55 %. Nach einem Schalter 1–2 statt 2–3 Farbblock-Plattformen.
  Gemessen: längste Folge derselben Aufgabe 2 (vorher 5–10).
- **Brückenblock** nur noch in der Leitidee Brückenbauer (nicht im allgemeinen Topf, bei keinem Autor); Taktwerk-Twist
  Tor/Böe, Bröckelkaskade-Twist Einzelblock/Feder/Deckel. Eine kleine Brücke (kurze Grube unter tiefer Platte) wäre möglich —
  nicht gebaut, Vorschlag an den Nutzer.
- **Checkpoints** (typen/pfad.js): mindestens max(10, Züge/7) Züge Abstand, bevorzugt am Szenenanfang, sonst nach 1,5×
  Abstand mitten in der Szene. Gemessen: 4–6 je langem Level (vorher bis 22), kleinster Abstand ≥ 13.
- **Seil nur, wo der Doppelsprung nicht hinreicht:** `erreichbar(plat, ziel, reach)` (großzügige Schätzung der
  Abkürzungsregel) muss für Seil und Flappy-Seil NEIN sagen. Grund des alten Fehlers: Die Sim-Proben der Notwendigkeit
  halten die Richtung immer bis zur Landung — ein Mensch lässt los und bremst auf die Plattform. Gemessen mit breiter
  „menschlicher“ Probe (Loslassen, Absprung an der Kante, Fall+Doppelsprung): 23 von 52 alten Seil-Zügen gingen ohne Seil.
- **Bauzeit:** Profil (fbz-13/14): ~30 % Sim, ~19 % Ausschnitt einlesen, 17 % Spur mitschreiben. Ein Karten-Cache traf zwar,
  kostete aber für den Schlüssel fast so viel (−4 %) — verworfen; Ausschnitt per slice/join statt Zeichen für Zeichen
  behalten. Durch die Dosierung (weniger teure Aufgaben-Versuche) jetzt 0,8–6,5 s, Mittel 3,1 s (16 lange Level).
  client/generateWorldAsync.js: Worker-POOL (Kerne − 1, höchstens 4) statt eines Workers — mehrere Level gleichzeitig.
- **Server (für Phase D):** Browser erzeugen selbst (Seed → Level); der Server erzeugt jedes Level nur zur Replay-Prüfung,
  EINMAL je Seed (Cache 6) in EINEM Worker-Thread, streng nacheinander. 100 Spieler im selben Level = 1 Erzeugung + 100
  Replays. Viele Lobbys mit eigenen Seeds stauen die Schlange → in Phase D: Level beim Anlegen der Runde vorab erzeugen,
  Cache größer, 2+ Prüf-Threads.

### 16m. Bewegung statt Warten: Flacher Sprung, Dash-Sprung (27.09.2026)
**Rückmeldung:** kleine Brücken und Schalter-Fähre als Idee erst mal weglassen; lieber mehr „movement based“ — eigener
Input statt Warten.
- **Flacher Sprung** (`flach`): kurz getippt (halte 4–8) unter einer Stacheldecke, die eine Kachel über der höchsten
  Stelle ALLER Varianten hängt — jeder normale Sprung stößt hinein. Genauigkeitsaufgabe (keine „unnötig“-Prüfung).
  Präzisions-Autor; 3–7 je Level.
- **Dash-Sprung** (`dashsprung`): Kristall vor der Kante, Dash an der Absprunglinie, 2–6 Ticks später springen (Tech-
  Fenster), geprüft mit ±25 ms. Meist flach unter Stacheldecke (Dash macht den getippten Sprung ~43 % schneller), sonst
  weit (Lücke > reach.gap.double, Landefläche beginnt an der kürzesten Variante). Gemessen: selten (0–2 je Flitzer-Level) —
  der weite gewinnt nur 1–2 Kacheln, unter der Decke erreicht oft ein gehaltener Hüpfer dasselbe (Prüfung richtig).
  Dash knapp VOR der Kante (dahinter fehlte manchen Varianten der Boden-Tech).
- **Wandkick** gebaut und wieder entfernt: trägt nur ~10 Zeilen, der Vorsprung muss über 8,5 liegen — zu knapp, streute,
  kein einziger gelang. Später evtl. mit Decke über der Startplattform (dann kein direkter Sprung nach oben).
- Warte-Aufgaben im allgemeinen Topf leiser (Tor 0,6, Mitfahrt/Böe/Deckel 1).
- Dosierung nachgeschärft: Motiv „verschärft“ nur auf dem letzten Phrasen-Zug, Nachbarn einer Wiederholung schlicht, und
  „höchstens 2 hintereinander“ noch einmal über den ganzen Plan (Etappen zählten getrennt). Ein „Nachholen“ gescheiterter
  Aufgaben verdoppelte die Bauzeit — verworfen. Aufgaben-Anteil ~22–26 %.

### 16n. Warum Aufgaben zu schlichten Sprüngen wurden; Kopfüber-Passage, Kristallkette, Leitidee „Schwerelos“ (27.09.2026)
**Rückmeldung:** „Wieso scheitern viele Aufgaben und werden zu schlichten Sprüngen? … viele Aufgaben sollten nicht zu mehr
Normalität führen, sondern zum Gegenteil“; dazu Chain-Kristalle und Schwerkraft-Zonen, kombiniert mit bestehenden Aufgaben.
- **Diagnose** (14 Level, `geplant` je Schritt): Nur 28 % der Züge hatten überhaupt eine Aufgabe im Plan (die Dosierung
  ließ die Lücken leer), und nur 55 % der geplanten gelangen (Seil 0 % wegen der neuen Reichweiten-Regel, Aufwind 10 %,
  Böe 30 %, Deckel 35 % — meist Platz oder Höhenbudget).
- **Lücken mit anderen Aufgaben füllen** (szenen.js `dosiere`): Szenen-Aufgabe 65 % (max 2 am Stück, 3 je Szene), Lücken zu
  85 % eine ANDERE Aufgabe der Szene; die Gesamtregel zählt nur noch GLEICHE hintereinander.
- **Ersatz-Aufgabe** je Zug (`ersatz`): 10 Versuche die geplante, 10 den Ersatz, dann wie bisher. (Nachholen auf dem
  nächsten Zug verdoppelte die Bauzeit — verworfen.)
- Seil unter Seilgang-Decke: gründliche Sim-Probe statt Reichweiten-Schätzung; Windzonen kleiner; Dash-Sprung unter der
  Decke mit zwei getippten Sprüngen.
- Ergebnis: Züge mit Aufgabe 15 % → 34–35 %, geplante Züge mit irgendeiner Aufgabe ~62 %; Bauzeit ~4,5 s (ohne Last).
- **Kopfüber-Passage** (`kopfueber`, eigener Zug): Decke 6–8 Zeilen über der Plattform, darunter Schwerkraft-Zone bis 3
  Zeilen über dem Boden; Sprung an der Kante → Schwerkraft kippt → kopfüber an der Decke laufen und über Stachelstreifen
  (Stacheln nach unten an einer Felszeile darüber) springen → am Zonenende zurück, Landung auf der Zielplattform (per
  Probe gelegt; ein Tod erst in der Fallphase zählt nicht, die Probe läuft vor der Zielplattform). Schwer (ab Stufe 3,
  jede zweite): zwei Streifen mit 2 Kacheln Decke dazwischen — Einzelblock kopfüber. Erstes Deckenstück 7–9 (super) bzw.
  5–7: Man „landet“ ~4 Kacheln hinter der Kante an der Decke. Nie im Turm (braucht 20+ Kacheln Breite → Abbruch).
- **Kristallkette** (`kette`): Sprung, Doppelsprung (kurz gehalten), am Scheitel ein Kristall → Dash nach oben, am nächsten
  Scheitel der nächste … letzter Dash schräg; Ziel 10–13 Zeilen höher (12–15 sprengte das Höhenbudget). Gedasht wird nach
  Zustand (Ladung + nahe Scheitel) + Reaktionszeit; Kristalle setzt der Planer entlang der gespielten Bahn.
- **Leitidee Schwerelos:** kopfüber → kopfüber/Ring → Twist Kristallkette/Dash-Sprung → kopfüber + Kette. Gemessen: 10–15
  Kopfüber-Passagen und 4–5 Ketten je Level, Kettenlauf durch.

### 16o. Breite Mischung statt Themen-Level, Windzonen-Polster, senkrechte Kristallkette (27.09.2026)
**Rückmeldung:** welt-78594 „mit einer Böe in einer Decke stuck“; welt-46032 „extrem geil, richtig schwer“ (10 min), die
3er-Kristallsprünge sehr schwer, weil man zwischen den Dashes seitlich muss — einfacher nur nach oben; und: Eine Idee soll
sich nicht durch das ganze Level ziehen — „von allem ein bisschen“, Extremfälle dürfen bleiben.
- **Windzonen-Polster:** 2 Zeilen über und 1 Spalte neben jeder Windzone kommen in den Korridor — die Grotten-Decke der
  Füllung lag mit Stufen/Taschen direkt am Zonenrand, der Wind drückte einen hinein.
- **Kristallkette senkrecht:** ab dem ersten Dash keine Richtung bis zum letzten (schrägen) Dash → Kristalle genau
  übereinander (gemessen: gleiche Spalte bei allen Ketten).
- **Mischung** (szenen.js): Normalfall = alle Aufgaben im Topf; Palette/Akt nur Vorliebe (×4), jede Aufgabe mit jeder
  Verwendung leiser (÷(1+0,5·n)), schlichte Szenen höchstens ein Viertel. Extrem-Level (~12 %, `hand.extrem`; erzwungenes
  Thema/Idee = extrem) wie bisher allein. Gemessen: normale Level 11–15 verschiedene Aufgaben, häufigste 15–33 %.
- **Bauzeit gehalten:** teure Aufgaben (TEUER: Flappy, Seil, Brücke, Deckel, Kopfüber, Mitfahrt, Dash-Sprung, Kette) ohne
  Vorliebe ×0,35; deterministisches Budget von 400 teuren Versuchen je Level (gezählt, nicht gestoppt); Notwendigkeit mit
  Vorprüfung per `erreichbar()` (verlustfrei); 8+8 Zwangsversuche statt 10+10. Mittel ~7 s (vorher 15 s mit Mischung).
- Ring 0,35 (gelang fast immer, auch als Ersatz, und dominierte).
- Beim Bauen: Die letzten zwei gleich → diese Aufgabe nicht noch einmal (Kombinationen wie „schalter+tor“).

### 16p. Phase D: Live-Runden und Tagesrennen mit Pfad (27.09.2026)

**Was sich ändert.** Zufallsrunden einer Lobby und das Tagesrennen bauen ab jetzt mit dem Pfad-Generator, immer
„lang“ und „super“ (Länge/Tempo sind in den Einstellungen nur noch Anzeige). Die Runden-Parameter tragen `gen: 'pfad'`;
`gen/index.js` → `levelFuerParams(params)` wählt danach Pfad (`generateWorld`) oder den alten Chunk-Generator. Derselbe
Einstieg läuft im Server-Replay (`Backend/seedRunners/replay.js`) — alte v1-Läufe bleiben prüfbar, weil v1-Parameter
unverändert beim Chunk-Generator landen.

**Tagesrennen.** Umstellung ab `2026-09-28` (Frontend `PFAD_TAGESRENNEN_AB` in `gen/generator.js`, Backend `PFAD_AB` in
`Backend/seedRunners/daily.js` — beide Daten müssen gleich sein). Frühere Tage bleiben v1, ihre Bestzeiten bleiben gültig.

**Ladezeit.** Ein Pfad-Level braucht im Browser Sekunden (gemessen 5–9 s, einmal 24 s mit zwei Headless-Browsern auf
einer Maschine). Deshalb:
- `RaceView` ist ein Mantel: Pfad-Level entstehen im Worker-Pool (`client/generateWorldAsync.js` → `pfadLevel`), bis
  dahin „Level wird erzeugt …“; die eigentliche Ansicht heißt `RennAnsicht` und bekommt immer ein fertiges Level.
- Serien würfeln ihre Zufallsrunden beim Start aus (`buildSeriesPlan`); die Parameter der **nächsten** Runde stehen erst
  auf dem Ergebnisbildschirm im Zustand (`series.naechste`, sonst könnte man das Level während der Runde erkunden). Der
  Raum baut sie dort per `vorerzeugen` vor — Runde 2 startete im E2E nach 1,2 s statt 5–24 s.
- Das Tagesrennen wird beim Öffnen der Daily-Seite vorgebaut.
- Lade-Timeout für Pfad-Runden 60 s (`LOAD_TIMEOUT_PFAD_MS`), sonst 20 s.

**Server.** Replay-Cache 24 Level (statt 6). Nach jeder Änderung an gen/ oder sim/: `npm run seedrunners:spiegel` im
Backend, sonst passt `ENGINE_FINGERPRINT` nicht.

**Geprüft.** Backend-Tests inkl. echtem Lauf durch ein Pfad-Level (verifyRun ok, ein Tick weniger ungültig), Daily-
Umstellung, Serien-Vorauswürfeln; Browser-E2E mit zwei Spielern (Platzhalter, gleiches Level, Pfad-Parameter, Runde 2
vorgebaut, keine Konsolenfehler) 3/3 grün.

### 16q. Spiel-Hülle, Sterne/Favoriten, Streamer-Schutz (26.09.2026)

Eigene Hülle ohne Website-Layout (`ui/GameShell.jsx`, Look `ui/theme.css`), Sterne 1–5 und Favoriten für Community- und
Zufallslevel (ersetzen die Likes), Level-Auswahl in der Lobby (`room/LevelPicker.jsx`). Streamer-Schutz (`room/raumCode.js`):
Nach dem Beitreten steht in der Adresse `/seed-runners/raum` (Code im Sitzungsspeicher des Tabs), der Code ist auf der Seite
verdeckt (Auge deckt auf, der Browser merkt es sich), der Tab-Titel nennt ihn nie; kopiert wird der echte Einladungslink.
Tagesrennen mit Pfad schon ab 26.09.2026 (statt 28.09.). Biom und Länge/Tempo sind in der Lobby nicht mehr einstellbar.

### 16r. Generator-Versionen: Ein Seed bleibt für immer dasselbe Level (26.09.2026)

**Warum.** Ein Zufallslevel ist nur „Seed + Biom + Generator-Version (`gv`)“. Ohne Version würde jede Generator-Änderung
Favoriten, vergangene Tagesrennen und geteilte Seeds still in andere Level verwandeln.

**Wie.** Jede ausgelieferte Version liegt eingefroren unter `archiv/pfad-vN/` (vollständige Kopie von sim/, gen/, level/ —
die Sim gehört dazu, weil der Generator beim Bauen Züge mit der Physik ausprobiert). Die Runden-Parameter tragen `gv`
(Räume: `Backend/seedRunners/genVersion.js`, Tagesrennen: fest je Tag in `dailyParams`, Favoriten/Sterne: im Schlüssel
`p<gv>:<Biom>:<Seed>`). Gebaut wird im Browser über `client/generatorArchiv.js` (die laufende Version live, ältere per
nachgeladenem Code-Teil), auf dem Server in `replay.js` (`engine/archiv/…`, kommt mit dem Spiegel). Unbekannte Versionen
werden abgelehnt statt still falsch gebaut.

**Wächter.** `client/__tests__/generatorVersionen.test.js` vergleicht jede Version im Archiv und den laufenden Generator
mit Referenz-Leveln. Jede Version wird BEI IHRER AUSLIEFERUNG eingefroren (v1 am 26.09.2026) — der laufende Generator ist
also immer gleich der neuesten Archiv-Version, bis man ihn ändert. Schlägt der Wächter an, hat sich der Generator verändert;
dann NICHT die Referenz anpassen, sondern:
1. `GEN_VERSION` (gen/generator.js) und `PFAD_GEN_VERSION` (Backend/seedRunners/genVersion.js) um eins erhöhen (N+1);
2. den NEUEN Stand einfrieren: `node src/pages/SeedRunners/gen/tools/einfrieren.mjs <N+1>`, in `client/generatorArchiv.js`
   eintragen und im Wächter Referenz-Level für N+1 ergänzen — Version N liegt unverändert im Archiv und baut ihre Seeds weiter;
3. im Tagesrennen einen Stichtag für die neue Version eintragen (frühere Tage behalten ihre);
4. Backend `npm run seedrunners:spiegel` (der Server-Test prüft, dass die laufende Version im Archiv liegt).

**Grenze.** Gespielt wird immer mit der AKTUELLEN Physik. Eine Physik-Änderung kann ein altes Level (Zufall wie Community)
schwerer oder unschaffbar machen — Community-Level fängt die Neu-Verifizierung auf (levelService.reverifyStale), für alte
Zufallslevel gibt es das nicht. Physik-Änderungen also mit Bedacht.

**Level auf den Server bringen.** `./deploy.sh level` listet die lokal veröffentlichten Level, `./deploy.sh level SR-…`
überträgt sie (Backend/seedRunners/tools/levelTransfer.js; nie überschreibend, Import als www-data).
