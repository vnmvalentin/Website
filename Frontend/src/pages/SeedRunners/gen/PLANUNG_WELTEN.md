# Weltengenerierung v2 — Architektur-Plan

Stand: 23.09.2026 · Status: **wartet auf Freigabe** (noch kein Code geschrieben)

Ziel laut Auftrag: Der Generator soll keine Chunk-Kette mehr aneinanderreihen, sondern **Welten**
bauen — Höhenunterschiede, Tunnel, verzweigte Routen, clevere Kombinationen, Abkürzungen. Jeder
Seed soll sich wie ein handgebautes Level anfühlen.

---

## 1. Was heute da ist (Analyse)

| Baustein | Stand | Für v2 |
| --- | --- | --- |
| `gen/generator.js` | Kette aus Chunks, Schwierigkeitskurve, Mechanik-Einführung, Spiegeln/Vereisen, eigener RNG-Strom je Chunk | Ablauf wird ersetzt, die **Ideen** (Kurve, Einführung, Sub-Seeds) bleiben |
| `gen/chunks/*` (68 Stück) | Handgebaute Rechtecke mit festem `entry`/`exit`, per Solver bewiesen | **Bleiben** — werden zu „Räumen“, die eine Zone füllen |
| `gen/builder.js` | Zeichen-API (`ground`, `rect`, `marker`, Zufallsbereiche) | Bleibt, bekommt Terrain-Funktionen dazu |
| `gen/validator.js` | Prüft Lückenbreiten gegen `reach × SAFETY` | Bleibt als schnelle Vorprüfung |
| `gen/solver.js` | Beam-Search mit der **echten Sim**, Makroaktionen à 6 Ticks | Bleibt — aber nur noch für Bauteile und Offline-Tests (siehe 2.) |
| `sim/reach.js` | Reichweiten **gemessen**, pro Tempo-Klasse | Grundlage für den Bewegungsgraph |
| `level/format.js` | `levelToDoc()` existiert schon → Editor-Format ist ohne Zusatzarbeit erreichbar | Bleibt |
| Fingerprints | SIM / GEN / ENGINE getrennt | Wichtig: Generator-Änderung entwertet **keine** Custom-Level |

**Geometrie heute:** Grundlinie `BASE_ROW = 80`, Drift `MAX_DRIFT = 14`. Das ganze Level bewegt
sich also in einem 28 Kacheln hohen Band — genau das ist der Grund, warum es sich flach anfühlt.
Erlaubt sind 1200 × 160.

**Gemessen (heute, dieser Rechner):**

| | kurz (436 × 43) | mittel (1224 × 49) |
| --- | --- | --- |
| Erzeugen | 35 ms | 6 ms |
| Solver (`beam` 150 → 400 → 900) | **9 s, findet keinen Weg** | **49 s, findet keinen Weg** |

Das ist der wichtigste Befund des Plans: Der Solver ist für **Chunks** (20–35 Kacheln) gebaut. Auf
Levelebene ist er zwei Größenordnungen zu langsam **und** unzuverlässig. „Garantiert schaffbar“ kann
deshalb nicht heißen „wir suchen zur Laufzeit einen Weg“.

---

## 2. Die drei Entscheidungen, die alles andere tragen

### E1 — Lösbarkeit durch Konstruktion, nicht durch Suche

Drei Ebenen statt einer:

1. **Bauteile sind vorab bewiesen.** Jeder Raum und jede Verbindungsart wird einmalig per echtem
   Solver in allen Tempo-Klassen durchgespielt (wie heute `npm run seedrunners:solve`). Das Ergebnis
   wird als Datei eingecheckt („Raum X ist in Klasse Y lösbar, Ein-/Ausgang A→B“). Kosten zur
   Laufzeit: null.
2. **Verbindungen prüft ein Bewegungsgraph, keine Sim.** Knoten = Standflächen (Kanten von
   Plattformen, Wandenden, Anker, Sprungpads), Kanten = „von hier nach dort mit Sprung /
   Doppelsprung / Dash / Wandsprung / Grapple“, gefüttert aus `sim/reach.js` × SAFETY. Reine
   Geometrie, Millisekunden statt Sekunden. Damit wird bei jeder Zone geprüft: Ist der Ausgang vom
   Eingang aus erreichbar?
3. **Der echte Solver läuft offline.** Batch-Test über 1000 Seeds (CI/Nacht), nicht im Browser. Er
   ist das Sicherheitsnetz, das Lücken im Graph-Modell findet — jede gefundene Lücke wird zu einer
   neuen Regel oder einem strengeren SAFETY-Wert.

> Folge: Ein Level kann nur so gut garantiert sein wie das Graph-Modell. Deshalb Phase 2 (Graph +
> Reparatur) **vor** Phase 4 (viele Regeln) — sonst baut man Regeln auf ungeprüftem Fundament.

### E2 — Zonen-Graph als Datenmodell, Rechteck-Chunks als Füllung

Der Zonen-Graph ist die neue Ebene darüber; die bestehenden 68 Chunks werden nicht weggeworfen,
sondern sind eine mögliche **Füllung** einer Zone. Neu gebaute Zonentypen (Schacht, Tunnel, Kammer,
Insel) kommen dazu. So ist ab Phase 1 sofort etwas Spielbares da, statt dass 68 bewiesene Bauteile
verfallen.

### E3 — Version einfrieren statt umbauen

`LEVEL_VERSION = 1` bleibt wie er ist, v2 ist ein eigener Pfad (`gen/v2/`). Ein Level trägt seine
Generator-Version; alte Seeds erzeugen weiter exakt das alte Level. Umschalten passiert an genau
einer Stelle (welche Version ein neuer Raum/Tagesrennen benutzt).

---

## 3. Pipeline

Jede Stufe hat einen eigenen Sub-Seed (`createRng(seed, "v2:terrain")`), damit eine Änderung an
einer Stufe die anderen nicht verschiebt.

```
Parameter (Seed, Länge, Klasse, Biom, Schwierigkeit)
  │
  ├─ S1  Makro-Layout ......... Zonen-Graph: Start → Zonen → Ziel, Verzweigungen, Höhenprofil
  ├─ S2  Terrain .............. Zonen zu Geometrie ausformen (Noise, Tunnel graben, Wände, Decken)
  ├─ S3  Rhythmus ............. Intensität je Zone, Flow- vs. Präzisionsabschnitte, Checkpoints
  ├─ S4  Grammatik ............ Kombinationsregeln in die Zonen setzen (Elemente)
  ├─ S5  Prüfen & Reparieren .. Bewegungsgraph, lokale Reparatur, Abkürzungen nachrechnen
  └─ S6  Bewerten ............. Score, bester Kandidat je Zone, Schwierigkeitsstufen
  │
  └→ Level (rows + entities)  →  levelToDoc()  →  Editor-Dokument
```

### S1 — Makro-Layout

* Zonen-Graph: `{ id, kind, rect (x,y,w,h), entry, exit, difficulty, tags }` plus Kanten
  `{ from, to, type: 'haupt' | 'abkürzung' | 'geheim' }`.
* **Höhenprofil zuerst, Inhalt danach:** Eine Kurve über die Levellänge legt fest, auf welcher Höhe
  die Hauptroute verläuft (Aufstieg, Plateau, Sturz, Tiefe). Erst daraus entstehen Zonen. Damit sind
  Höhenunterschiede kein Zufallsergebnis, sondern Vorgabe. Zielband: die vollen 160 Zeilen statt der
  heutigen 28.
* Zonentypen: `lauf`, `aufstieg` (Wandschacht/Grapple), `abstieg` (Fallschacht mit Hindernissen),
  `tunnel`, `kammer`, `inseln`, `übergang`.
* Verzweigung: Eine Zone kann zwei Ausgänge haben, die sich später wieder treffen. Die Abkürzung
  bekommt eine Anforderung (`needs: ['dash','double']`) und muss laut Graph **messbar kürzer** sein
  (Ticks-Schätzung aus Weglänge/Lauftempo), sonst wird sie verworfen.

### S2 — Terrain

* Zonen werden nicht „hingestellt“, sondern **ausgegraben**: Fläche füllt sich mit Fels, der Weg
  wird herausgeschnitten. Das erzeugt automatisch Wände (Wandsprung), Decken (Kopfstoß) und
  Überhänge — die heutigen schwebenden Plattformen können das nicht.
* Kanten glätten und schrägen (Noise mit fester Amplitude, gerastert auf Kacheln).
* **Lesbarkeit als Regel, nicht als Zufall:** Jede Zone markiert ihren Ausgang sichtbar (Kante,
  Pickup, Lichtquelle, Kamerablick). Wird in S6 bewertet.
* Biom entscheidet Stil (Eishöhle, Fabrikrohre, schwebende Ruinen, Tiefe).

### S3 — Rhythmus

* Intensitätskurve über die Zonen: Einstieg → Aufbau → Verschnaufen → Höhepunkt → Pause → größerer
  Höhepunkt → Finale. Die Kurve steuert, welche Regeln S4 in einer Zone überhaupt ziehen darf.
* **Flow** (lange Passage ohne Stopp, Momentum erhalten) vs. **Präzision** (kurz, knifflig,
  Checkpoint davor). Checkpoints nach Schwierigkeit und Weglänge, nicht nach festem Abstand.

### S4 — Kombinations-Grammatik

Eine Regel ist Daten, kein Code:

```js
{
  id: 'wallshaft-laser',
  needs: ['wall'],            // Fähigkeiten
  zone: ['aufstieg'],         // wo sie passt
  space: { w: 6, h: 14 },     // Platzbedarf
  difficulty: 3,
  intensity: 'hoch',
  elements: 4,                // Budget (Limit: 600 im ganzen Level)
  teaches: ['laser'],         // für Einführen → Üben → Kombinieren
  build(b, rng, fit) { … },   // zeichnet in die Zone
  proof: 'solver',            // einmalig offline bewiesen
}
```

* Ziel ≥ 40 Regeln, davon ein Teil aus den heutigen Chunks abgeleitet.
* **Portale** bekommen eigene Regeln (Momentum umlenken, Ketten, Rückwurf, per Schalter
  umverdrahtet, Höhenwechsel im Tunnel).
* Einführen → Üben → Kombinieren bleibt (`teaches`), ebenso „keine Regel zweimal direkt
  hintereinander“.
* **Set-Pieces:** 1–2 pro Level, eigene Liste (Gefahrenwand, Portalkammer, langer Grapple-Schwung).

### S5 — Prüfen & Reparieren

* Bewegungsgraph je Zone: Eingang → Ausgang erreichbar? Abkürzung wirklich schneller? Kein Softlock
  (Schalter/Schlüssel hinter der eigenen Tür)? Kein Mega-Skip (Abkürzung, die halbe Zonen
  überspringt)?
* **Lokale Reparatur statt Neuwurf:** Plattform verschieben, Anker ergänzen, Lücke schmaler,
  Element entfernen — in dieser Reihenfolge, höchstens N Versuche, dann Zone neu würfeln.

### S6 — Bewerten

* Score je Zone und Level: Höhenvarianz, Vielfalt der Regeln, Flow-Anteil, Verzweigungen, tote
  Strecke (lang ohne Entscheidung = Abzug), Lesbarkeit, Elementbudget.
* Mehrere Kandidaten je Zone (deterministisch aus dem Sub-Seed), der beste gewinnt.
* Schwierigkeitsstufen steuern SAFETY, Timing-Fenster, Kombinationstiefe, Präzisionsanteil.

---

## 4. Grenzen, die im Weg stehen (und der Umgang damit)

| Grenze | Wert | Umgang |
| --- | --- | --- |
| Level-Fläche | 1200 × 160 Kacheln | Reicht für kurz/mittel/lang. **Marathon (10 min) passt nicht**, solange die Route grob linear läuft. Vorschlag: Marathon = mehrere Level hintereinander (Biom-Wechsel als Levelgrenze) statt ein Riesenraster. |
| Elemente | 600 | Budget je Zone verteilen (S4 `elements`), sonst frisst eine Portalkammer das halbe Level. |
| Dokumentgröße | 400 KB | 1200 × 160 sind allein 192 KB Raster — passt, aber knapp; im Blick behalten. |
| Erzeugungszeit | Ziel < 1–2 s | Heute 6–35 ms. Mit Noise, Graph-Prüfung und Kandidatenauswahl realistisch 200–800 ms. Ab Phase 2 in einem **Web Worker** mit Ladeanimation, damit die Seite nie hängt. |
| GEN-Fingerprint | ändert sich mit v2 | Betrifft **Tagesrennen und Raum-Läufe** (sie hängen an ENGINE = sim+gen+level). Custom-Level sind sicher (nur SIM). Heißt: Der Umstieg braucht einen Stichtag, ab dem die Tagesrangliste neu zählt — oder v2 startet nur in Räumen und übernimmt das Tagesrennen später. **Das ist eine Entscheidung für dich.** |

---

## 5. Phasen (nach jeder Phase: kurzer Bericht + Beispiel-Seeds zum Anschauen)

| Phase | Inhalt | Fertig, wenn … |
| --- | --- | --- |
| **1** | Zonen-Graph, Höhenprofil, Terrain-Formung (Tunnel/Schächte/Inseln), Debug-Ansicht. Noch fast keine Elemente. | Man läuft durch eine Welt mit echten Höhenunterschieden und sieht im Debug-Overlay Graph + Höhenprofil. |
| **2** | Bewegungsgraph, Validierung, lokale Reparatur, Web Worker. | 200 Seeds erzeugen ohne unlösbare Zone; Erzeugung im Worker < 1 s. |
| **3** | Rhythmuskurve, Flow-/Präzisionsabschnitte, Checkpoint-Platzierung. | Intensitätskurve im Debug sichtbar; Checkpoints sitzen vor den harten Stellen. |
| **4** | Grammatik ≥ 40 Regeln, Portal-Tricks, Set-Pieces, Einführen→Üben→Kombinieren. | Jede Regel einmal offline per Solver bewiesen; keine Wiederholung direkt hintereinander. |
| **5** | Qualitäts-Score, Kandidatenauswahl, Schwierigkeitsstufen, Batch-Test 1000 Seeds, Seed-Galerie, „Im Editor öffnen“. | Batch-Statistik (Fehlerquote, Score, Zeit, Regelhäufigkeit) steht; Galerie zeigt 20 Seeds als Minikarten. |

Vorschau-Kamerafahrt und Biom-Übergänge hänge ich an Phase 5 an (Präsentation, kein Fundament).

---

## 6. Entscheidungen (freigegeben am 23.09.2026)

1. **Pipeline wie oben freigegeben**, inklusive E1: Garantie durch Konstruktion + Bewegungsgraph,
   echter Solver nur offline im Batch.
2. **Tagesrennen läuft sofort auf v2.** Die Tagesrangliste zählt ab dem Umstellungstag neu (der
   GEN-Fingerprint ändert sich, ältere Läufe sind nicht mehr vergleichbar). Alte Einträge bleiben
   stehen, werden aber nicht mit neuen vermischt — der Stichtag steht im Umstellungsschritt.
3. **Marathon = mehrere Level hintereinander**, nicht ein Riesenlevel. Damit gibt es zwischen den
   Leveln eine Pause, und pro Level gibt es Punkte. Punktegleichstand: **gleicher Platz = gleiche
   Punkte** (zwei erste Plätze bei drei Teilnehmern → beide 3 Punkte, der Dritte 1).
   *Das ist bereits das Verhalten des Serien-Systems aus Phase 4* (`rank()` vergibt bei gleicher
   Zielzeit denselben Platz, Punkte = Teilnehmerzahl − Platz + 1) — Marathon wird also eine Serien-
   Voreinstellung mit mehreren Runden und Biom-Wechsel, kein neues Punktesystem.
4. **v2 wird komplett neu gebaut, ohne die alten Chunks als Bauteile.** Ideen daraus dürfen in
   Regeln einfließen, aber als **seltene** Bausteine (niedrige Häufigkeit in der Auswahl), damit v2
   nicht wieder nach Chunk-Kette aussieht.

## 7. Fortschritt

| Phase | Stand |
| --- | --- |
| 1 Makro-Layout + Terrain + Debug-Ansicht | **fertig** (23.09.2026) |
| 2 Bewegungsgraph, Reparatur, Worker | **fertig** (23.09.2026) |
| 3 Rhythmus, Checkpoints | offen |
| 4 Grammatik ≥ 40 Regeln, Portale, Set-Pieces | offen |
| 5 Score, Kandidaten, Batch, Galerie, Marathon-Serie | offen |

### Was Phase 1 gemessen hat

| Größe | Wert |
| --- | --- |
| Zusammenhang (Bewegungsgraph) | **540 / 540 Welten** über 3 Längen × 3 Tempo-Klassen × 60 Seeds |
| Erzeugen | ⌀ 0,7 ms (Ziel war < 1–2 s) |
| Prüfen (Graph über die ganze Welt) | ⌀ 7,1 ms |
| Größtes Level | 531 × 150 Kacheln |
| Höhenspanne der Route | ⌀ 72 Zeilen (v1: fest auf 28 begrenzt) |

**Schacht-Geometrie, gegen den echten Solver geprüft** (nicht nur gegen den Graph): Ein aus der Welt
herausgeschnittener Aufstieg wird mit `solveLevel({ beam: 250, maxSteps: 900 })` gelöst — 4 von 5
Schächten in ⌀ 1,7 s. Der Versuch, die Vorsprünge „großzügiger" zu machen (Schachtbreite 6–8 statt
5–7), fiel dabei auf **0 von 5**: Breitere Schächte bedeuten einen weiteren Zickzack zwischen den
Seiten. Die Zahlen 5–7 stehen deshalb als Messwert im Code, nicht als Geschmacksfrage.

### Was Phase 2 gebracht hat

| Größe | Wert |
| --- | --- |
| Phasenziel „200 Seeds ohne unlösbare Zone" | **200 / 200**, über alle Längen, Tempo-Klassen und Schwierigkeitsgrade |
| Gebaute Abkürzungen | 208, davon beanstandet **0** |
| Reparaturen, die von selbst nötig wurden | 1 von 200 |
| Erzeugen | ⌀ 9,7 ms, schlimmster Fall 40,1 ms (Ziel war < 1–2 s) |
| Prüfen (zwei Flutungen: mit und ohne Abkürzung) | ⌀ 15,2 ms |
| Bildrate während 12 Erzeugungen hintereinander | 153 Hz — der Haupt-Faden bleibt frei |
| Schächte, die der echte Solver schafft | **5 / 5** (Strahl 250 → 900 → 1500), und ⌀ 192 statt 1120 Ticks |

**Drei Fehler, die Phase 1 hinterlassen hatte und die Phase 2 gefunden hat:**

1. **Abkürzungen wurden gezählt, aber nie gebaut.** Im Layout standen `edges` vom Typ `abkuerzung`,
   `terrain.js` kannte das Wort nicht — die Kennzahl in der Werkbank war eine Falschaussage. Jetzt
   baut `carveBranch()` eine Senke in den Hauptweg und Trittsteine darüber; gemeldet wird nur, was
   wirklich Steine hat (`layout.shortcuts` statt `layout.edges`).
2. **Die Schacht-Vorsprünge überlappten sich.** Lagen zwei weniger als `HEAD_ROOM + 1` Zeilen
   auseinander und teilten sich eine Spalte, nahm der obere dem unteren die Kopffreiheit — dort
   konnte man nicht mehr stehen, und der Aufstieg riss lautlos ab. Sichtbar nur bei Schwierigkeit
   1–2 (78 von 270 Welten), weil Phase 1 **nur mit der Voreinstellung 3 geprüft hatte**. Die
   Vorsprünge liegen jetzt einheitlich höchstens 3 Zeilen auseinander und überlappen nie.
3. **Ein Absturz in `carveBranch()`**, wenn keine Trittsteine zustande kamen. Abgefangen.

**Und ein Fehler in der Prüfung selbst:** Um zu messen, ob eine Abkürzung schneller ist, wird die
Welt ein zweites Mal ohne sie geflutet. Beim ersten Versuch habe ich die Trittsteine *zugemauert* —
sie sind aber selbst Fels, also änderte das nichts, und alle 83 Abkürzungen galten als „nicht
schneller". Weggenommen heißt **Luft**.
