# Modus-Grafiken der Clash-Royale-Minigames

Hier gehören die Bilder hin, die auf der Startseite als Kachel für jeden Spielmodus
angezeigt werden. **Solange ein Bild fehlt, zeigt die Kachel automatisch das Modus-Symbol
auf einer farbigen Fläche** — die Seite funktioniert also auch ohne diese Dateien.

## Dateinamen

Der Dateiname muss exakt der Modus-Kennung entsprechen (siehe
`Frontend/src/pages/ClashRoyale/modesConfig.js`):

| Datei                     | Modus                |
|---------------------------|----------------------|
| `snake.jpg`               | Snake Royale         |
| `auction.jpg`             | Elixir Auction       |
| `bingo.jpg`               | Bingo Royale         |
| `shadow-carousel.jpg`     | Blindes Karussell    |
| `elixir-rush.jpg`         | Elixir Rush          |
| `card-evolution.jpg`      | Karten-Evolution     |
| `angel-royale.jpg`        | Angel Royale         |
| `dark-maze.jpg`           | Dunkles Labyrinth    |

> **Hintergrundbilder der Spielansicht gibt es nicht mehr.** Die Entwürfe mit
> Vollbild-Motiv hinter dem Spielfeld (`<kennung>-bg.jpg`) sind zugunsten der ruhigen
> Fassung verworfen worden — die Karten sollen das Motiv sein, nicht der Hintergrund.
> Hier gehören nur noch die Kacheln der Startseite hin.

## Format

- **Seitenverhältnis 16:10** — so wird die Kachel zugeschnitten (`object-cover`),
  abweichende Verhältnisse werden mittig beschnitten.
- **Empfohlene Größe:** 800 × 500 px (deckt auch Retina-Displays ab, die Kachel ist
  je nach Spaltenzahl 260–400 px breit).
- **JPG**, ca. 70–80 % Qualität. Wer PNG braucht (Transparenz), muss zusätzlich die
  Endung in `modeImage()` in `modesConfig.js` anpassen.

Bilder in diesem Ordner werden **nicht** von Vite verarbeitet oder gehasht — sie landen
unverändert im Build. Beim Austauschen also ggf. den Browser-Cache leeren.
