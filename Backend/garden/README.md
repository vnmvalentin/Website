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
    skills.js     Erfahrung, Level, Fähigkeitsbaum
    economy.js    Ernte, Verkauf, Kiste und Vitrine — hier entsteht Gold
    pets.js       Tiere: Arten, Stufen, Fähigkeiten
    offline.js    Was Tiere verdienen, während niemand zusieht
  world/          Mehrspieler
    lobby.js      Welten, Slot-Vergabe, Anwesenheit, Momentaufnahmen, Chat
    mail.js       Briefkasten: senden, abholen, Drosselung
  store/
    farms.js      SQLite-Persistenz der Spielstände + rollendes Backup
  migrations/
    index.js      fährt alle Umstellungen in fester Reihenfolge
    plants.js     ergänzt fehlende Felder an alten Pflanzen
    plot.js       Steinfeld auf 4×(7×7), räumt Wegkacheln
    xp.js         zahlt Erfahrung aus dem Logbuch nach
  admin.js        was das Admin-Menü am Spielstand verändern darf
```

## Wer wem gehört

Die wichtigste Regel im ganzen Spiel — sie erklärt die meisten Entscheidungen:

| Gehört dem **Server** | Gehört dem **Browser** |
| --- | --- |
| `gold`, `harvestedItems` | `plotPlants`, `plotUnlockedCells` |
| `chestItems`, `vitrineItems` | `inventory`, `toolInventory` |
| `mailbox` | `decoPlacements`, `petPlacements` |
| `xp`, `skills` | Ladenbestände |
| `stateVersion`, `letzterTab` | `appearance` |

Serverbesitz heißt: der Wert steht **nicht** in `compactFarmState` und wird beim
PUT aus dem bestehenden Stand übernommen. Alles, woraus sich Gold machen lässt,
liegt links.

Browserbesitz ist kein Versehen, sondern Absicht: Acker und Rucksack ändern sich
zu oft für eine Server-Runde je Klick. Der Preis dafür ist, dass zwei Tabs
einander überschreiben könnten — dagegen laufen `stateVersion` und `letzterTab`
(siehe `routes/gardenGameRoutes.js`, PUT-Weg).

## Migrationen

Jede trägt ihre **eigene** Marke im Spielstand und läuft genau einmal. Sie sind
absichtlich nicht zu einer gemeinsamen Marke zusammengefasst: neue Umstellungen
kommen dazu, wenn die alten längst ausgerollt sind — an einer geteilten Marke
liefe die neue dann nie bei genau den Ständen, die sie brauchen.

| Datei | Marke |
| --- | --- |
| `plants.js` | im Modul |
| `plot.js` | `plotSteinreihen3`, `plotWegeGeraeumt` |
| `xp.js` | `xpAusLogbuch` |

Marken müssen den PUT überleben. Wo das passiert: `compactFarmState` in
`routes/gardenGameRoutes.js`.

## Doppelt geführte Werte

Ein paar Zahlen stehen zwangsläufig auf beiden Seiten, weil der Browser dieselbe
Rechnung für die Anzeige braucht. Sie sind im Code gegenseitig vermerkt:

| Wert | Server | Browser |
| --- | --- | --- |
| Wetter-Aufschläge | `core/weather.js` | `engine/PlantSystem.js` |
| Fähigkeits-Stufen | `core/skills.js` | kommt über `GET /api/garden/skills` |
| Samen-Katalog | `core/catalogue.js` | `engine/PlantSystem.js` |
| Rastermaße | `migrations/plot.js` | `engine/MapConfig.js` |

Der Fähigkeitsbaum ist der Sollzustand: der Browser lädt ihn vom Server, statt
ihn zu kennen. Eine Anzeige, die etwas anderes verspricht als die Kasse zahlt,
ist schlimmer als gar keine Anzeige.
