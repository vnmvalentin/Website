# Die Moorwanderung – Plan

Run-Modus für 2–6 Spieler neben dem 1v1-Duell. Jeder geht allein über die Karte, kämpft gegen NPCs, baut sein Deck
aus; nach einer einstellbaren Zahl Pfade treffen alle in Duellen aufeinander. Wer ein Duell verliert, verliert ein
Lebenssiegel; wer keins mehr hat, scheidet aus. Der letzte Spieler mit Siegeln gewinnt.

Dieser Plan baut auf dem aktuellen Stand auf (Runde 3 + 4), nicht auf dem älteren Stand der Aufgabenbeschreibung.

## 0. Anpassungen an den aktuellen Stand

| Aufgabenbeschreibung | Heute | Umsetzung |
|---|---|---|
| Startdeck mit eigenem Nebendeck-Typ (Moorling / Knochenkäfer / Wachsling) | Nebendeck ist fest (Moorling bzw. Strandkrabbe), verändert wird es über den **Nebendeck-Totem**; Knochenkäfer und Wachsling sind normale Karten | Jedes Startdeck bringt einen Nebendeck-Totem mit (Rudel: Doppelblut, Knochenmarsch: Leichtes Mark, Kerzenlicht: Wachsgabe). Knochenkäfer/Wachsling liegen als Karten im Deck. |
| „Kein Totem“ im Startdeck | Nebendeck-Totem ist ein eigener Platz | Stamm- und Lanenplatz bleiben leer, nur der Nebendeck-Platz ist belegt. |
| Zirkel „vorerst nur Moor“ | Gezeiten-Zirkel existiert | Beide Zirkel spielbar. Pro Zirkel: 3 Startdecks, 6 Biome, 16 NPCs, 6 Bosse. Alle Spieler eines Raums spielen denselben Zirkel. |
| Regeln | Tauchgang/Leibwächter wie in Inscryption, Überlauf, erster Zug ohne Angriff | Alle Kämpfe (NPC, Boss, Duell) nutzen unverändert die Kampf-Engine. |

## 1. Wiederverwendung

| Baustein | Wiederverwendet | Neu |
|---|---|---|
| Kampf | `engine/battle.js` komplett (2 Sitze pro Kampf) | Hausregeln (`engine/rules.js`) und Boss-Phasen als optionale Kampf-Felder |
| KI | `aiAction` für Kampfzüge (NPC = Sitz 1, Spiegelgeist, Auto-Kampf bei Zeitablauf), Pfad-Heuristiken aus `ai/index.js` | Run-KI: Startdeck, Knotenwahl, Belohnungen, Späherturm |
| Pfad | `createScene`/`sceneAction`/`defaultOp` aus `engine/path.js` für alle alten Knoten; Items, Totems, Lagerfeuer, Händler … | Kartengenerator mit NPC-Garantie, Knoten NPC/Elite/Boss/Späherturm, Belohnungs-Szene |
| Sicht | Filterlogik aus `engine/view.js` pro Kampf | `viewForRun` für N Spieler (nur öffentliche Karten + Deckgröße für andere) |
| Server | Aufbau von `roomManager.js` (Token-Reconnect, Zuschauer, tick) | `runRoomManager.js` für 2–6 Plätze, Phasen-Budget, Zug-Timer in Duellen |
| UI | `BattleScreen` samt Animations-Queue (über eine angepasste Sicht), Szenen, Karten, Icons | Run-Lobby, Startdeck-Wahl, Fortschrittsleiste, Lager, Duell-Ankündigung, Siegel, Podest, neue Pfadkarte |

## 2. Ordnerstruktur

```
engine/rules.js                              Hausregeln (NPC) + Boss-Phasen, von battle.js aufgerufen
engine/modes/moorwanderung/
  run.js        Zustandsmaschine: createRun, applyRunAction, awaitingRun, Budgets
  mapgen.js     Pfadkarte mit Kampf-Garantie (2–3 Kämpfe auf jedem Weg), Boss auf der letzten Ebene
  npc.js        NPC-/Boss-Decks nach Stufe, Spiegelgeist, Moorfürst
  pairing.js    Duell-Paarungen (keine direkten Wiederholungen, faire Geist-Rotation)
  view.js       viewForRun / eventsForRun (versteckte Information)
  ai.js         Run-KI (alle Entscheidungen, für Übung und Simulation)
data/modes/moorwanderung/
  starterDecks.js  biomes.js  npcs.js  bosses.js  budgets.js
tools/balanceRun.js                          npm run balance:run -- --players 6 --runs 1000
ui/run/*                                      Screens des Modus, README.md im Modus-Ordner
Backend/sacrificeSigils/runRoomManager.js    Räume (Ereignisse mw:*)
```

## 3. Datenmodell (Run-State)

```js
{ mode: "moorwanderung", seed, salt, settings, phase: "starter" | "path" | "duels" | "over",
  round, pathNo, pathInRound, legends, aiRng,
  path: { map, biome, tier, players: [PlayerPath & { fight, bonus }] },
  duels: { round, pairs: [{ a, b | null, ghost?, battle, done, winner, scale }] } | null,
  players: [{ name, starter, deck, sideType, heads, bases, totems, items, shards, seals, alive, place,
              publicCards, catchup, ghostCount, lastOpponent, stats }],
  placements, winner }
```

Aktionen: `chooseStarter`, `chooseNode`, `nodeAction` (alte Szenen + Belohnung + Späherturm), alle Kampfaktionen
(`draw`, `play`, `hammer`, … – gehen an den aktuellen NPC-Kampf bzw. das Duell des Spielers), `campTotem`,
`timeout` (eine Entscheidung), `budgetExpired` (Rest des Pfads automatisch), `surrender` (Run aufgeben).
NPC- und Geist-Züge spielt die Engine selbst mit der KI (deterministisch über `aiRng`) – serverautoritativ.

## 4. Pfad

- Ebenen: kurz 4 / normal 6 / lang 8, die letzte ist der Boss. Kampf-Garantie durch Konstruktion: zwei ganze Ebenen
  sind NPC-Kämpfe auf allen drei Strängen; höchstens eine weitere Ebene hat einen Elite-Kampf auf einem Nebenweg.
  So hat jeder Weg 2 oder 3 Kämpfe (Test über alle Wege).
- Stufe (`tier`) = Pfadnummer − 1; Biom = Stufe mod 6, danach wiederholt mit Stufe +1.
- Niederlage NPC/Elite: Trostsplitter, eine Karte bekommt Kerzendocht 3 bis Pfadende (Mod mit Quelle, wird entfernt;
  im Gezeiten-Zirkel Treibgut). Boss-Niederlage: normale Kartenwahl, bei „Hart“ −1 Siegel.
- Boss: zwei Phasen. Gewinnt der Spieler Phase 1 (Waage 5), wird die Waage auf 0 gesetzt, die Bossseite geräumt und
  neu aufgebaut, die Sonderregel wechselt.

## 5. Duelle

- Paarung: lebende Spieler, zuletzt gegeneinander nur, wenn es nicht anders geht (Test für 3–6 und nach Ausscheiden).
- Ungerade: der Spieler mit den wenigsten Geist-Duellen (Gleichstand: Seed) spielt gegen den Spiegelgeist (KI „schwer“,
  Kopie des aktuellen Decks eines anderen lebenden Spielers inkl. Totems, ohne Items) bzw. den Moorfürsten
  (Boss-NPC, Deck nach Durchschnitt der Deckgrößen/Seltenheiten).
- Startspieler: weniger Siegel; Gleichstand per Seed. Verlierer −1 Siegel und Aufholbonus (Splitter + zusätzliche
  Kartenwahl zu Beginn des nächsten Pfads), Sieger Splitter. Gespielte Karten werden öffentlich.
- Platzierung beim gleichzeitigen Ausscheiden: bessere Waage im letzten Duell, dann mehr Karten im Deck.

## 6. Synchronisierung

Budgets in `data/modes/moorwanderung/budgets.js` (entspannt/normal/schnell): Knoten 90/60/40 s, Kampf 360/240/150 s,
Duell-Zug 90/60/40 s, Startdeck 90/60/45 s. Pfad-Budget = Ebenen × Knoten + 4 × Kampf, gleiche Deadline für alle.
Warnung bei 60 s und 15 s, Ablauf ⇒ `budgetExpired` (Knoten per Standardregel, laufender Kampf per KI „normal“).
Getrennte Spieler: Budget läuft weiter, Wiedereinstieg an der aktuellen Stelle (Token).

## 7. Phasen (je Phase: Tests, Commit, kurze Zusammenfassung)

1. Grundgerüst: Modus auf der Startseite, Lobby 2–6 mit allen Einstellungen, Startdecks, Siegel, Paarung + Spiegelgeist
   + Moorfürst, Duellrunden, schlichter Pfad; lokale Übung gegen KI-Mitspieler.
2. PvE: NPC-Kämpfe (Engine-seitig), 16 NPCs je Zirkel mit Hausregeln, 6 Bosse mit 2 Phasen, Belohnungen, Elite,
   Späherturm, Niederlagen-Regeln.
3. Synchronisierung: Budget, Auto-Auflösung, Lager, Fortschrittsleiste, Zuschauen, Reconnect (Server).
4. Pfad-Redesign: Biome, Pergamentkarte, Nebel, Spielfigur, Wetter, Übergänge, Boss-Intro – auch im Duellmodus.
5. Look & Feel: Siegel-Animation, Duell-Ankündigung, Podest, Biom-Ambient, Porträts.
6. Balancing & Tests: `balance:run`, Zielwerte (NPC 25–35 %, Boss 40–50 %, Startdecks 45–55 %, Dauer), Paarungs-,
   Sichtbarkeits- und Timeout-Tests, Online-Durchlauf mit mehreren Browsern, Screenshots.
