# Sacrifice & Sigils

1v1-Kartenspiel der Website: Draft → Pfad → Kampf → [Pfad → Kampf] … → Ergebnis. Online über eine Lobby (Socket.io, serverautoritativ),
gegen die KI (drei Stufen), als Hotseat oder im Tutorial. Route: `/sacrifice-and-sigils`.

Architektur, Datenmodell und bewusste Abweichungen vom Auftrag: [`docs/sacrifice-and-sigils/PLAN.md`](../../../../docs/sacrifice-and-sigils/PLAN.md).

## Lokal starten

```bash
# Backend (Socket.io auf Port 3001, enthält die Räume)
cd Backend && npm start

# Frontend (Vite, leitet /socket.io an 3001 weiter)
cd Frontend && npm run dev
# → http://localhost:5173/sacrifice-and-sigils
```

Übung, Hotseat, Tutorial und Kartenbuch laufen komplett im Browser und brauchen kein Backend. Für ein Online-Match zwei
Browserfenster (oder ein privates Fenster) öffnen: im ersten „Spiel erstellen“, den Link ins zweite kopieren, beide „Bereit“.

## Tests und Werkzeuge

| Befehl (im Ordner `Frontend`) | Zweck |
|---|---|
| `npm run test:sigils` | Engine-Tests: jedes Sigil, Ressourcen, Waage, Draft, Pfad-Knoten, Determinismus, 1000-Spiele-Fuzz, versteckte Info |
| `npm run sigils:check` | Datenvalidierung aller Karten (Sigils, Folgeformen, Kosten, Budget-Warnungen) |
| `npm run balance -- --games 5000` | KI gegen KI, Bericht nach `docs/sacrifice-and-sigils/balance-report.json` (Optionen: `--level easy\|normal\|hard`, `--workers n`, `--out pfad`) |
| `npm run art:export` | alle prozeduralen Artworks als SVG nach `public/assets/cards/generated/` (+ `index.html` zum Durchblättern, nicht eingecheckt) |
| `npm run art:prompts` | `art-prompts.md` mit einem Bildprompt pro Karte |

Im Ordner `Backend`: `npm run test:sigils` (Raum-Manager) und `npm run sigils:spiegel` (siehe unten).

## Engine-Spiegel (wichtig vor jedem Deploy)

Der Server spielt mit derselben Engine wie der Browser. Quelle sind `engine/` und `data/` in diesem Ordner; das Backend bekommt
eine erzeugte Kopie unter `Backend/sacrificeSigils/shared/`. **Nach jeder Änderung an Engine oder Karten:**

```bash
cd Backend && npm run sigils:spiegel
```

`deploy.sh` prüft das (`--pruefen`) und bricht mit veraltetem Spiegel ab. Browser mit altem Stand bekommen nach einem Deploy
einen Hinweis zum Neuladen (Fingerprint in `version.js`).

## Karten hinzufügen

1. In der passenden Stammdatei `data/cards/<stamm>.js` eine Zeile ergänzen:
   ```js
   ["glutwolf", "Glutwolf", "b2", 3, 2, ["rudelruf", "durchbohren"], "uncommon", "Kurzer, poetischer Flavor (max. 90 Zeichen)."],
   ```
   Kosten: `b0`–`b4` Blut, `k1`–`k10` Knochen, `w1`–`w6` Wachs. Angriff darf `"schwarmzahl" | "knochenlast" | "flammenmass" | "handschwere"` sein.
   Optional als 9. Eintrag: `{ evolvesTo: "key", token: true, cursed: true, silhouette: "bird", balanceNote: "…" }`.
2. `npm run sigils:check` — prüft Sigils, Folgeformen und das Kostenbudget (Formel aus dem Auftrag, Toleranz ±1,5).
3. `npm run test:sigils`, dann `npm run balance -- --games 2000` und Ausreißer (< 44 % / > 56 %) nachjustieren.
4. `cd ../Backend && npm run sigils:spiegel`.

Neue Sigils: Objekt in `engine/sigils/index.js` (Hooks), Name/Text in `i18n/de.js`, Glyphe in `ui/icons/SigilIcon.jsx`, ein Test in
`__tests__/sigils.test.js` (der Test „Jedes öffentliche Sigil ist getestet“ schlägt sonst fehl).

## Artwork ersetzen

Jede Karte zeichnet ihr Bild prozedural (`art/procedural.js`, deterministisch aus `art.seed`). Echtes Artwork einfach als
`Frontend/public/assets/cards/<karten-id>.webp` (oder `.png`) ablegen, Seitenverhältnis 100:76 — der Renderer nimmt die Datei
automatisch. Die IDs stehen im Kartenbuch (Detailansicht) und in `art-prompts.md`.

## Sounds ersetzen

Alle Sounds sind Web-Audio-Synthese (`audio/sound.js`). Eine Datei `Frontend/public/assets/sfx/<key>.ogg` ersetzt den
jeweiligen Klang. Keys: `draw`, `place`, `sacrifice`, `bones`, `attack`, `hit`, `wing`, `splash`, `crackle`, `fire`, `needle`,
`chain`, `creak`, `scale`, `weight`, `seal`, `coins`, `death`, `heartbeat`, `transform`, `victory`, `defeat`, `turn`, `error`.

## Ordner

```
engine/      reine Spiel-Engine (kein DOM, kein Netz, deterministisch) – wird ins Backend gespiegelt
data/        Karten, Stämme, Items, Totems, Ereignisse
i18n/de.js   alle Texte (Englisch kann dieselben Schlüssel liefern)
art/         prozedurale Artworks
audio/       Sound-Manager
net/         Online- (Socket.io) und lokaler Spielzustand
ui/          Hülle, Screens, Kampf-Tisch, Pfad, Animations-Queue, Partikel
tools/       Balancing, Artwork-Export, Prompts, Kartenprüfung
__tests__/   node --test
```
