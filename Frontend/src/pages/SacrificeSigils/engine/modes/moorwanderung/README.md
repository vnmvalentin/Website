# Die Moorwanderung

Run-Modus für 2–6 Spieler. Jeder geht allein über dieselbe Karte, kämpft gegen NPCs und einen Boss und baut sein Deck
aus. Nach den Pfaden einer Runde treffen alle im Duell aufeinander. Wer verliert, verliert ein Lebenssiegel; ohne
Siegel scheidet man aus. Der letzte Spieler mit Siegeln gewinnt.

## Ablauf

```
Startdeck wählen → [Pfad: Knoten, 2–3 NPC-Kämpfe, Pfad-Boss] × Pfade pro Runde → Duellrunde → … → 1 Spieler übrig
```

| Phase | Was passiert | Code |
|---|---|---|
| `starter` | Alle wählen gleichzeitig eines von drei Startdecks (8 Karten + Nebendeck-Totem) | `run.js` → `applyStarter` |
| `path` | Eigene Karte je Spieler (gleicher Seed), gemeinsames Zeitbudget; NPC-, Elite- und Boss-Kämpfe laufen in der Kampf-Engine, der NPC-Sitz wird von der KI gespielt | `run.js` → `pathPhase`, `startFight`, `finishFight`; `mapgen.js` |
| `duels` | Paarung ohne direkte Wiederholung; bei ungerader Zahl Spiegelgeist oder Moorfürst | `run.js` → `startDuels`, `finishDuel`; `pairing.js`, `npc.js` |
| `over` | Platzierung, Podium | `run.js` → `eliminate`, `checkRunEnd` |

Alles ist deterministisch (Seed + Aktionen) und läuft identisch im Browser (Übung gegen KI) und auf dem Server
(`Backend/sacrificeSigils/runRoomManager.js`, Spiegel über `npm run sigils:spiegel` im Backend).
`view.js` filtert die Sicht je Spieler: fremde Decks, Hände, Items und Szenen bleiben verborgen, öffentlich sind nur
Siegel, Deckgröße, Status und im Duell gespielte Karten.

## Einstellungen (`normalizeRunSettings`)

| Einstellung | Werte | Standard |
|---|---|---|
| Spieler | 2–6 | 4 |
| Lebenssiegel | auto / 2 / 3 / 4 | auto = 3 bei 2–3 Spielern, 2 ab 4 (`sealsFor`) |
| Pfade pro Duellrunde | auto / 1 / 2 / 3 | auto = 1 (`pathsPerRound`) |
| Pfadlänge | kurz 4 / normal 6 / lang 8 Ebenen | normal |
| Ungerade Spielerzahl | Spiegelgeist / Moorfürst | Spiegelgeist |
| Boss „Hart“ | Boss-Niederlage kostet ein Siegel | aus |
| Tempo | entspannt / normal / schnell (Budgets in `data/modes/moorwanderung/budgets.js`) | normal |
| Zirkel | Moor / Gezeiten | Moor |
| Zuschauer | ja / nein | ja |

„auto“ bei Siegeln und Pfaden kommt aus dem Balancing (siehe unten): Mit 2 Pfaden pro Runde und 3 Siegeln dauert ein
Run mit 4 Spielern rund 110 Minuten.

## Inhalte ergänzen

Alle Inhalte liegen in `data/modes/moorwanderung/`. Die Tests (`npm run test:sigils`) prüfen, dass jede Regel, jede
Karte und jeder Text existiert.

**NPC** (`npcs.js`, Liste `NPCS`): `{ id, zirkel, biome, name, tribes, rule, silhouette, enter, exit }`.
`tribes` bestimmt das Deck (zwei von drei Karten aus diesen Stämmen), `rule` ist eine Hausregel aus `engine/rules.js`,
`silhouette` eine Silhouette aus `art/procedural.js` (Porträt). Pro Biom mindestens drei NPCs.

**Boss** (`npcs.js`, Liste `BOSSES`): wie ein NPC, aber mit
`phases: [{ rule }, { rule, spawn: [kartenIds] }]` und den Zeilen `enter`, `phase2`, `exit`. Genau ein Boss pro Biom.
In Phase 2 erscheinen auf Stufe 0–1 die erste, danach die ersten beiden Karten aus `spawn`; die Reihenfolge der Liste
ist also Teil des Balancings.

**Hausregel** (`engine/rules.js`): ein Eintrag in `RULES` mit einem oder mehreren Haken: `aura`/`auraIf` (Sigil für
alle eigenen Karten), `unitMade` (Werte ändern), `start`, `turnStart`, `turnEnd`, optional `deckDelta`. Dazu der Text
in `i18n/de.js` unter `run.rules`.

**Startdeck** (`starterDecks.js`): `{ id, zirkel, name, idea, cards: [8 Karten-IDs], sideSigil, tribes }`. Genau drei
pro Zirkel; `sideSigil` muss in der Nebendeck-Totem-Liste des Zirkels stehen.

**Biom** (`biomes.js`): Palette, Wetter, Landschafts-Zeichnungen (`ui/path/mapDecor.jsx`), Knotengewichte und
Klangkulisse (`audio/sound.js` → `BIOME_AMBIENT`). Sechs pro Zirkel; die Reihenfolge ist die Stufenfolge.

## Balancing-Simulation

```
npm run balance:run -- --players 6 --runs 1000
npm run balance:run -- --players 4 --runs 1000 --zirkel gezeiten --seals 3 --paths 2 --out bericht.json
```

Spielt komplette Runs KI gegen KI (Worker-Threads) und gibt aus:
- Startdecks: Run-Siege, Anteil zum fairen 1/n, mittlerer Platz.
- Kämpfe: NPC-/Elite-/Boss-Siegquote gesamt, je Stufe und je Gegner; bei Bossen auch, wie oft Phase 2 erreicht wird.
- Dauer: Kampfzüge und geschätzte Spielzeit nach einem Zeitmodell (14 s je eigenem Zug, 4 s je KI-Zug, 8 s je
  Knoten, 12 s je Szene; Pfade laufen parallel, es zählt der langsamste Spieler).
- Knotenwahl: wie oft ein Typ gewählt wird, wenn er erreichbar ist.
- Ausreißer gegen die Zielwerte, markiert mit `<- außerhalb`.

Zielwerte: normale NPCs gewinnen 25–35 %, Bosse 40–50 %, jedes Startdeck hat einen Anteil von 0,9–1,1 (entspricht
45–55 % im 1-gegen-1), 4 Spieler 35–50 Minuten, 6 Spieler höchstens etwa 60 Minuten.

Stellschrauben: `NPC_AI` (KI-Stufe der Gegner) und Deckgrößen in `run.js` → `startFight`, Seltenheit in
`npc.js` → `rarityWeights`, Regeln und Beschwörungen der Bosse in `npcs.js`, Startdecks in `starterDecks.js`.
