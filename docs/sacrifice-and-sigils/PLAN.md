# Sacrifice & Sigils — Plan

Neuer 1v1-Kartenmodus („Zeichner“ in der versunkenen Kapelle im Aschemoor). Dieses Dokument hält Architektur,
Ordnerstruktur, Datenmodell und Phasen fest. Die Regeln selbst stehen im Auftrag; hier nur, *wie* sie gebaut werden
und wo bewusst abgewichen wird.

## 1. Bestandsaufnahme (was wiederverwendet wird)

| Thema | Bestand | Verwendung |
|---|---|---|
| Frontend | React 19, Vite 7, Tailwind 4, react-router 7, lucide-react, reines **JavaScript** (kein TS im Projekt) | Neue Seite unter `Frontend/src/pages/SacrificeSigils/`, lazy geladen in `App.jsx`, eigene Hülle wie Seed Runners |
| Backend | Express 5 + **Socket.io 4** im Hauptprozess (`Backend/index.js`), CommonJS | `Backend/routes/sacrificeSigilsRoutes.js` registriert die Socket-Ereignisse (`ss:*`), Räume im Speicher wie Connect4 |
| Geteilte Logik | Seed Runners spiegelt `Frontend/…/sim` nach `Backend/seedRunners/engine` (Skript + `--pruefen` im `deploy.sh`) | Gleiches Muster: `engine/` + `data/` werden nach `Backend/sacrificeSigils/engine/` gespiegelt (`npm run sigils:spiegel`), `deploy.sh` bricht bei veraltetem Spiegel ab |
| Tests | `node --test` (Seed Runners, beide Seiten) | Engine-Tests als `*.test.js` mit `node --test`, keine neue Test-Bibliothek |
| Lobby | Raum-Code (5 Zeichen), Name, Token für Reconnect, Zuschauer (Connect4 / Seed Runners) | Gleiches Muster, erweitert um Einstellungen, Bereit-Knöpfe und Match-Zustand |
| Navigation | `Frontend/src/config/navigation.js` → Kategorie „Fun“ | Eintrag „Sacrifice & Sigils“ unter Fun, Sitemap + Changelog (`utils/newData.js`) |
| Schriften | Google Fonts per `<link>` (Seed-Runners-Hülle) | IM Fell English SC / IM Fell English / EB Garamond ebenso per `<link>` |

### Bewusste Abweichungen vom Auftrag

1. **JavaScript + JSDoc statt TypeScript.** Das Projekt hat weder `typescript` noch einen TS-Lint-Aufbau, das Backend
   läuft als CommonJS ohne Build-Schritt, und der Engine-Spiegel wird unverändert auf dem Server ausgeführt.
   Die Engine ist deshalb reines ES-Modul-JS mit durchgehenden `@typedef`-Typen (`engine/types.js`), ohne DOM,
   ohne Netzwerk, ohne `Math.random`/`Date`. Kann später 1:1 nach TS umgezogen werden.
2. **Keine Zod-Abhängigkeit:** eigene Validierung (`engine/validate.js`), läuft in den Tests und über `npm run sigils:check`.
3. **`applyAction(state, action)`** statt `applyAction(state, action, rng)`: Der PRNG-Zustand (mulberry32) lebt *im*
   State. Das macht Determinismus trivial (State + Aktion ⇒ Ergebnis) und der Server muss nichts neben dem State halten.
   Der Server mischt ein geheimes Salz in den Kampf-RNG, damit niemand mit dem öffentlichen Seed die Deck-Reihenfolge
   des Gegners vorausrechnen kann (Pool, Karte, Händler, Lagerfeuer bleiben rein seed-bestimmt, wie verlangt).
4. **Hooks mutieren einen Arbeits-Klon** über Helfer im Kontext (`ctx.damage`, `ctx.emit`, …), statt Diff-Objekte
   zurückzugeben. `applyAction` klont den State vorher, nach außen bleibt die Funktion rein.
5. **Totem-Köpfe im Draft kommen mit einer Start-Basis**, sonst wäre der gewählte Kopf bis zum ersten
   Totem-Schrein wirkungslos (der Schrein ist nicht garantiert). Im Schrein lassen sich Kopf und Basis frei tauschen.
6. **Ausgleich für den Zweitspieler geändert (Ergebnis des Balancing-Tools).** Mit den Regeln aus 3.3/3.4 (Startspieler
   zieht im ersten Zug nicht, Zweiter +1 Wachs und +1 Nebendeck-Karte) gewann der Startspieler nur 17 % der Kämpfe
   (5000 Matches). Gemessen wurden vier Varianten; gewählt ist „Startspieler zieht normal, Zweiter +1 Wachs“ mit 52–54 %.
   Umschaltbar über `SECOND_PLAYER_BONUS` in `engine/battle.js`.
   **Runde 2 (A1/A2):** Im jeweils ersten eigenen Zug greift niemand an (`NO_ATTACK_TURNS = 2`), Überlaufschaden ist
   Grundregel. Danach neu gemessen; gewählt ist „Startspieler zieht, Zweiter +1 Wachs +1 Knochen“
   (Startspieler 51,3 % normal / 5000 Matches, 50,5 % schwer / 2000 Matches). Alle Varianten stehen an `SECOND_PLAYER_BONUS`.
7. **Patt-Brecher eskaliert:** ab Zug 30 zunächst 1 Gewicht pro Zugende, alle 6 Züge eines mehr. Mit konstant 1 Gewicht
   pendelte die Waage bei festgefahrenen Brettern endlos zwischen beiden Seiten (vom Fuzz-Test gefunden).
8. **Opfer und Todeseffekte:** Opfern zählt als Tod (Knochen, Nesthüter, Rachsucht …), Wiedergänger und Nachgeburt greifen
   beim Opfern aber nicht, weil der Slot sonst der ausgespielten Karte im Weg stünde.
9. **Handlimit beim passiven Spieler:** Karten, die der gerade nicht aktive Spieler über 8 hinaus bekäme (z. B. Nesthüter
   im gegnerischen Zug), verbrennen sofort, weil er nicht am Zug ist, um abzuwerfen.

## 2. Ordnerstruktur

```
docs/sacrifice-and-sigils/PLAN.md          dieses Dokument
Frontend/src/pages/SacrificeSigils/
  README.md                                Start, Karten hinzufügen, Artwork/Sounds ersetzen, Balancing
  engine/                                  REINE Spiel-Engine (wird ins Backend gespiegelt)
    types.js        JSDoc-Typen
    rng.js          mulberry32, Seed-Hash, Mischen
    cards.js        Kartenregister, Modifikatoren → effektive Karte, Kostenbudget
    sigils/         Sigil-Definitionen (Hooks) + Register
    battle.js       Kampf: Zugablauf, Angriff, Tod, Waage, Hooks-Dispatcher
    items.js        Items (Wirkung im Kampf)
    totems.js       Totem-Köpfe, Basen, Lanen-Eigenschaften
    draft.js        Pool, Snake-Draft, getrennte Pools, Extras
    path.js         Moorkarte, Knoten, Szenen, Ereignisse
    match.js        Match-Zustandsmaschine + applyAction
    view.js         pro Spieler gefilterter State und Events (versteckte Info)
    ai/             KI (leicht/normal/schwer), gemeinsam für Übung und Balancing
    validate.js     Datenvalidierung
  data/
    tribes.js, items.js, events.js
    cards/<stamm>.js                       160+ Karten
  i18n/de.js                               alle UI-Texte
  art/                                     prozedurale Artworks (13 Silhouetten-Familien)
  audio/                                   Sound-Manager + Synth-Funktionen
  ui/                                      Screens, Kartenrahmen, Tisch, Animations-Queue, Partikel
  net/                                     Socket-Client
  tools/balance.js, artExport.js, artPrompts.js, spiegel-Check
  __tests__/                               node --test
Backend/sacrificeSigils/
  engine/                                  ERZEUGTER Spiegel (nie von Hand ändern)
  roomManager.js                           Räume, Timer, Reconnect, Zuschauer
  tools/spiegel.js                         Spiegel-Skript (+ --pruefen)
Backend/routes/sacrificeSigilsRoutes.js    Socket.io-Anbindung
```

## 3. Datenmodell

```js
// Kartendefinition (data/cards/*.js)
{ id, name, tribe, cost: { type: "blood"|"bones"|"wax", amount }, attack: 3 | { special }, health,
  sigils: ["rudelruf", "kerzendocht:3"], rarity, unique, evolvesTo?, cursed?, token?, flavor,
  art: { silhouette, seed, palette } }

// Karte im Deck (Match): Basis + Modifikatoren, nie eine neue ID
{ uid, baseId, mods: [{ kind: "campfire", attack: 1 }, { kind: "sigilAdd", sigil: "schwinge" }, …] }

// Einheit auf dem Feld (Kampf)
{ uid, card /*effektiv*/, owner, attack, health, maxHealth, sigils, removedSigils, turns, wick, submerged,
  dir, shieldUsed, glued, stunned, … }

// Match
{ seed, salt, settings, phase: "draft"|"extras"|"battle"|"interlude"|"path"|"over",
  players: [{ name, deck, sideType, heads, bases, totems, items, shards, stats }],
  draft, battle, path, battleNo, wins, starterChooser, legendsTaken, rng }
```

Sigils mit Stufe/Parameter werden als `"id:n"` notiert (`kerzendocht:3`, verstärkte Stufe nach Verschmelzung
`dornenkleid:2`).

## 4. Netzwerk

- Ereignisse `ss:create`, `ss:join`, `ss:settings`, `ss:ready`, `ss:action`, `ss:leave`, `ss:rematch`;
  Server → Client `ss:state { view, events }`.
- Der Server wendet jede Aktion mit der Engine an; ungültig ⇒ Fehler per Ack, State unverändert.
- `view.js` filtert pro Empfänger (Spieler 0/1/Zuschauer). Test: gefilterter State enthält keine gegnerischen Hand-/Deck-UIDs.
- Reconnect per Token; Gegner sieht „Verbindung verloren…“, Timer pausiert bis 60 s, nach 3 min Abwesenheit Aufgabe.
- Übung gegen KI: dieselbe Engine läuft im Browser, ein lokaler „Server“-Adapter mit derselben Schnittstelle.

## 5. Phasen

1. Engine & Hotseat — Regeln, Ressourcen, Waage, Hinterreihe, Grund-Karten und -Sigils, Tests, Hotseat-UI.
2. Multiplayer — Lobby, Draft (beide Modi), serverautoritative Züge, versteckte Info, Reconnect, Timer, Zuschauer.
3. Run-Struktur — Pfad, alle Knoten und Ereignisse, Items, Splitter, Totems, Best-of.
4. Look & Feel — Stil, Kartenrahmen, Artworks, Screens, Animationen, Waage, Sound, Mobile.
5. Content & KI — 160+ Karten, 47 Sigils, KI-Stufen, Tutorial, Kartenbuch, Balancing-Lauf + Korrekturen.
6. Polish — Performance, Barrierefreiheit, Bugfixes, Zusammenfassung.

Nach jeder Phase: Tests, Commit, kurze Zusammenfassung.

## 6. Runde 2 (Regeln, Ablauf, Animationen, Layout, Zirkel)

| Teil | Umsetzung | Wo |
|---|---|---|
| A1 Erster Zug ohne Angriff | `NO_ATTACK_TURNS = 2`, Ereignis `firstTurnNoAttack`, Hinweis im Spiel | `engine/battle.js` |
| A2 Überlaufschaden | `Resolver.overflow()`: Front → Hinterreihe → Waage; Schild/Panzer pro Karte, Todesstachel nur erste Karte, Tauchgang lässt durch; Durchbohren überspringt die Hinterreihe | `engine/battle.js`, `sigils/index.js` |
| A3 Best-of-1 | `winsNeeded` 1/2/3 | `engine/match.js`, Lobby |
| B1 Pfad nach dem Draft | Draft → Extras → Pfad (3 Start-Splitter) → Kampf; kein Zwischenspiel vor Kampf 1 | `engine/match.js` |
| B2 Runden-Draft | 6 × 4 Karten, A-B-A-B mit wechselndem Erstzugriff, 3–5 Duplikate nie in derselben Runde, Kopf/Nebendeck nacheinander und exklusiv; getrennte Pools: 2 aus 4 gleichzeitig | `engine/draft.js` |
| C Animationen | Grundtempo 1,6× langsamer (1/1,5/2×), Klick überspringt nur die laufende Animation, Angriffssequenz mit Halten und Rückweg (`attackReturn`), sichtbares Zugende in fester Reihenfolge | `ui/anim/*`, `battle.css` |
| D Layout | Grid mit gemessener Slotgröße (ResizeObserver, dvh), 4 Layouts (Desktop, Tablet, hochkant, quer), Stapel unten rechts, Einstellungen als Dialog, Tooltips mit Kollisionserkennung, Touch-Ziele ≥ 44 px, keine Emojis (Test) | `ui/battle/*`, `ui/Shell.jsx` |
| F Zirkel | Datenpaket `moor`, Lobby-Option „Zirkel“ | `engine/zirkel/*`, `ZIRKEL.md` |

**Abweichung 10 (Runde 2):** Beim gemeinsamen Pool sind Totem-Kopf und Nebendeck *exklusiv* (was einer nimmt, ist für
den anderen weg) – nur so hat der „abwechselnde Erstzugriff“ eine Wirkung. Bei getrennten Pools bleibt die Wahl
gleichzeitig und frei.

**Abweichung 11 (Runde 2):** Der Überlauf aus einem *Hinterhalt*-Treffer (Zusatzangriff auf die Hinterreihe) geht nicht
auf die Waage; sonst würde Hinterhalt denselben Schaden doppelt verwerten.

## 7. Runde 3 (Regeln näher an Inscryption, Multiplayer)

Grundlage: die Akt-1-Regeln von Inscryption (Waage mit 5, Starthand 3 + 1 Nebendeck-Karte, Ziehen aus Haupt- *oder*
Nebendeck, Blut = Opfer beim Ausspielen und nie gespeichert, Knochen aus eigenen Toden, Totems = Kopf + Sigil-Basis,
Eichhörnchen als festes Nebendeck samt Eichhörnchen-Kopf). Übernommen wurden die Regeln, nicht Namen, Karten oder Bilder.

| Teil | Umsetzung | Wo |
|---|---|---|
| Festes Nebendeck | Beide ziehen Moorlinge (0/1). Knochenkäfer und Wachsling sind jetzt normale Draft-Karten ihres Stamms | `data/sides.js`, `data/cards/*` |
| Nebendeck-Totem | Neuer Kopf `{ kind: "side" }`: jeder gezogene Moorling trägt das Basis-Sigil. Nach dem Draft statt der Nebendeck-Wahl: 3 Sigils aus dem Seed, genau eines davon ein Opfer-Sigil (Doppelblut, Wachsgabe, Leichtes Mark); Opfer-Sigils nur auf diesem Kopf. Im Totem-Schrein tauschbar | `data/totems.js`, `engine/draft.js`, `engine/match.js`, `engine/battle.js → newSideCard` |
| Tauchgang wie Waterborne | Taucht am Ende *jedes* eigenen Zugs ab (auch ohne Angriff, auch nach dem Nachrücken). Eine abgetauchte Karte besetzt die Lane nicht: voller Angriff direkt auf die Waage, an der Hinterreihe vorbei; auch Fäulnis erreicht sie nicht | `engine/battle.js`, `sigils/index.js` |
| Leibwächter wie Guardian | Springt, sobald eine gegnerische Karte gegenüber einer leeren eigenen Lane gelegt wird oder aus der Hinterreihe nachrückt (nicht mehr beim Angriff). Grabwühler bleibt wie Burrower | `engine/battle.js → guardCheck` |
| Überlauf | Unverändert Grundregel; Test mit dem Beispiel 7 Angriff gegen 2 + 3 Leben (beide sterben, 2 auf die Waage) | `__tests__/battle.test.js` |
| Keine Blutanzeige | Blutschale und Blut-Flug beim Opfern entfernt (Opfer geben nur Knochen). Die Blutphiole zeigt sich als kleines Abzeichen, solange sie wirkt | `ui/battle/BattleScreen.jsx`, `ui/GameScreen.jsx` |
| Sinnvolle Sigils | Prüfregel: Tauchgang nie mit Sigils, die nur beim Getroffenwerden wirken (Köder, Schildrinde, Dornenkleid …). Einziger Treffer: Tiefenmutter → Tauchgang, Brut, Leittier | `engine/validate.js`, `data/cards/tiefe.js` |

**Abweichung 12 (Runde 3):** Dreifachblut auf jedem Moorling gewann 56,0 % der Kämpfe (5000 Matches) – in Inscryption
wurde das Eichhörnchen-Totem aus demselben Grund aus Kaycee's Mod gestrichen. Der Nebendeck-Kopf bekommt deshalb
**Doppelblut** (2 Blut, 54,5–54,7 %). Hochwuchs, Fluchtreflex und Leibwächter fehlen in der Nebendeck-Liste, weil ein
0/1 keinen Treffer überlebt (41–43 %); Ewiges Opfer fehlt, weil ein unsterblicher Moorling jede 1-Blut-Karte bezahlt.

**Abweichung 13 (Runde 3):** Weiter bewusst anders als Inscryption: Wachs (dritte Ressource), Hinterreihe mit Überlauf
auf die Waage, Metamorphose nach 2 statt 1 Zug (die Moor-Brutlinge kosten 0 statt 1 Blut), erster Zug ohne Angriff.

**Messung (Runde 3):** Startspieler 52,8 % normal / 51,9 % schwer. Ausgleichsvarianten: +1 Wachs +2 Knochen 47,5 %,
+2 Wachs +1 Knochen 46,6 %, zusätzlicher Moorling 27,8 % – der bisherige Ausgleich bleibt. Schwer zeigt drei knappe
Ausreißer (Sporenknirps 57 %, Hirschkalb 56 %, Grauwelpe 56 %), normal keine.

## 8. Runde 4 (Gezeiten-Zirkel)

Zweiter Zirkel nach Konzept B aus `ZIRKEL.md`; Einzelheiten, Zahlen und bewusste Abweichungen stehen dort in Abschnitt 3a.

| Teil | Umsetzung | Wo |
|---|---|---|
| Register | Karten, Stämme und Sigils sind global; jede Karte kennt ihren Zirkel (aus dem Stamm), zirkeleigene Sigils tragen `zirkel` | `data/tribes.js`, `data/cards/_define.js`, `engine/sigils/*` |
| Ressourcen | Salz (`kind: "shore"`), generische Kosten/Abzüge, `bonusResource`, `secondPlayerBonus` pro Zirkel | `engine/battle.js`, `engine/zirkel/*` |
| Gezeiten | `tide`/`tideShift` im Kampfzustand, Flut/Ebbe-Wirkungen, Gezeiten-Bindung (`wrongTide`) | `engine/battle.js` |
| Inhalt | 14 Stämme, 172 sammelbare + 9 verfluchte Karten, 19 Sigils, 3 Ereignisse, Strandkrabbe | `data/gezeiten/*`, `engine/sigils/gezeiten.js`, `engine/path.js` |
| Validator | Pro Zirkel ≥ 160 Karten / 8 legendär / 8 verflucht, Kostenart und Sigils passend zum Zirkel, Tauchgang-Konflikte inkl. Tintenwolke/Gezeitenschild/Salzkruste | `engine/validate.js` |
| UI | Salz, Gezeitenanzeige, Uferreihe, Flut-Tönung, Gezeiten-Marke, Theme, Kartenbuch/Übung mit Zirkel-Wahl, neue Ereignis-Szenen, 19 Icons, 3 Silhouetten | `ui/*`, `art/procedural.js` |
| Tests | 19 Sigil-Tests, Regeltests (Flut, Ebbe, Salz, Bindung), 300 KI-Matches + Determinismus im Gezeiten-Zirkel | `__tests__/gezeiten.test.js`, `__tests__/sigils.test.js` |
| Balancing | `npm run balance -- --zirkel gezeiten`; Moor unverändert (52,8 %) | `tools/balance.js` |
