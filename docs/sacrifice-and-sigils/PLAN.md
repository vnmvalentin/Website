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
