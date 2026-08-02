# Performance- & Code-Review

**Datum:** 2026-07-28 · **Umfang:** `Frontend/` (Vite + React 19) und `Backend/` (Express 5 + socket.io)

---

## 0. Tech-Stack

| Bereich | Stack |
|---|---|
| Build | Vite 7.3, `vite build && node prerender.js` (Puppeteer-Prerendering von 13 Routen) |
| UI | React 19.2, React Router 7, Tailwind 4 (via `@tailwindcss/vite`), lucide-react |
| Realtime | socket.io-client 4.8 (Modul-Singleton, `autoConnect: true`) |
| Backend | Express 5, socket.io 4.8, better-sqlite3 12, discord.js 14, tmi.js |
| Lint | ESLint 9 Flat Config + react-hooks + react-refresh |

**Kein** Next.js, kein SSR zur Laufzeit — nur statisches Prerendering beim Build.

## 1. Diagnose-Befehle

```
npm run lint    →  29 Probleme (3 Fehler, 26 Warnungen)
npm run build   →  OK in 3,17 s
                   dist/assets/index-*.js    1.369,54 kB │ gzip: 370,55 kB   ← EIN einziger Chunk
                   dist/assets/index-*.css     146,95 kB │ gzip:  21,71 kB
```

---

# 🔴 KRITISCH — die wahrscheinlichen Lag-Ursachen

> **Stand 2026-07-28:** K1, K2, K3 und K4 sind umgesetzt (siehe „Erledigt"-Kästen).
> Bei K4 hat die Nachmessung die ursprüngliche Einstufung widerlegt — Details im Kasten dort.

## K1 · Vier dauerhaft animierte 110px-Blur-Flächen auf **jeder** Seite

> ✅ **Erledigt.** `filter: blur(110px)` und alle `scale()` aus den Keyframes entfernt; der weiche Rand
> kommt jetzt aus dem Verlauf selbst. Zusätzlich musste `border-radius: 50%` weichen: es beschnitt das
> Quadrat hart, und weil der Verlauf an dieser Kante noch Deckkraft hatte, wurde der Schnitt nach dem
> Entfernen des Blurs sichtbar — der Blur hatte ihn vorher nur verdeckt. Die Form kommt nun aus
> `radial-gradient(circle closest-side …)`, das mit Deckkraft 0 exakt an der Boxkante endet.
> Optisch per Screenshot gegen den alten Zustand geprüft. Im gebauten CSS: 0× `blur(` auf den Orbs,
> 0× `scale(` in den `orbDrift`-Keyframes.

`Frontend/src/index.css:20-58` · gerendert über `AppBackground` in [Layout.jsx:214](Frontend/src/pages/Layout.jsx#L214)

```css
.app-bg__orb {
  filter: blur(110px);          /* ← teuerster Teil */
  will-change: transform;
}
.app-bg__orb--1 {
  width: 55vw; height: 55vw;    /* auf 1920px = 1056×1056 px */
  animation: orbDrift1 46s ease-in-out infinite alternate;
}
@keyframes orbDrift1 {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(8vw,6vh,0) scale(1.08); }   /* ← scale() ist das Problem */
  100% { transform: translate3d(2vw,12vh,0) scale(0.96); }
}
```

**Warum das ruckelt:**

1. Ein `filter: blur()` zwingt den Compositor, für das Element eine eigene *Render-Surface* anzulegen und einen mehrpassigen Gauß-Blur darüber zu legen.
2. Solange nur `translate` animiert wird, kann der Compositor die geblurrte Textur wiederverwenden. **Sobald `scale()` in den Keyframes steht, ändert sich die Rasterskalierung — die Surface muss neu gerastert werden**, also Blur-Neuberechnung Frame für Frame.
3. Das passiert bei **4 Orbs gleichzeitig**, zusammen ca. 2,6 Mio. Pixel, **endlos** (`infinite alternate`), auf **jeder Route**.
4. Verstärker: **65 `backdrop-blur-*`-Elemente** im Frontend. `backdrop-filter` muss den Hintergrund neu abtasten, *sobald der sich ändert* — und der ändert sich hier permanent. Jedes Glas-Panel wird damit zu einem Per-Frame-Recomposite.

Das erklärt das Symptom exakt: kein Totalausfall, sondern überall ein leichtes, dauerhaftes Stocken — und nur „bei einigen Nutzern", nämlich denen mit integrierter GPU, Laptop im Energiesparmodus oder hohem DPI.

**Lösung — Blur backen statt animieren.** Der optische Effekt bleibt praktisch identisch:

```css
.app-bg__orb {
  position: absolute;
  border-radius: 50%;
  /* Statt filter: blur() den Verlauf selbst weich auslaufen lassen —
     kostet null Raster-Arbeit, weil es ein reiner Farbverlauf ist. */
  filter: none;
  will-change: transform;
  /* Der Compositor bekommt eine eigene Ebene, die er nur noch verschieben muss. */
  transform: translateZ(0);
}

.app-bg__orb--1 {
  width: 55vw; height: 55vw;
  min-width: 480px; min-height: 480px;
  top: -18%; left: -12%;
  /* Weicher Auslauf über mehrere Stopps ersetzt den 110px-Blur */
  background: radial-gradient(circle at 40% 40%,
    rgba(79,70,229,0.55) 0%,
    rgba(79,70,229,0.34) 28%,
    rgba(79,70,229,0.14) 50%,
    transparent 72%);
  animation: orbDrift1 46s ease-in-out infinite alternate;
}

/* WICHTIG: kein scale() mehr — nur noch Translation. Damit rastert der
   Compositor die Ebene genau einmal und schiebt sie danach nur herum. */
@keyframes orbDrift1 {
  0%   { transform: translate3d(0, 0, 0); }
  50%  { transform: translate3d(8vw, 6vh, 0); }
  100% { transform: translate3d(2vw, 12vh, 0); }
}
@keyframes orbDrift2 {
  0%   { transform: translate3d(0, 0, 0); }
  50%  { transform: translate3d(-7vw, -8vh, 0); }
  100% { transform: translate3d(-2vw, -14vh, 0); }
}
@keyframes orbDrift3 {
  0%   { transform: translate3d(0, 0, 0); }
  50%  { transform: translate3d(-10vw, 8vh, 0); }
  100% { transform: translate3d(6vw, -6vh, 0); }
}
```

Falls der Blur-Look unbedingt bleiben soll, ist die zweitbeste Variante: `filter: blur(110px)` behalten, aber **`scale()` aus allen drei Keyframes streichen** und die Orb-Anzahl von 4 auf 2 reduzieren. Das allein nimmt den Großteil der Last.

> **In 30 Sekunden selbst verifizieren:** DevTools → Rendering → „Paint flashing" und „Frame Rendering Stats" aktivieren, Startseite öffnen. Dann in den Styles `.app-bg__orb { animation: none }` setzen und den Unterschied im FPS-Meter vergleichen. *(Headless-Chrome konnte ich hier nicht zur Messung heranziehen — ohne echten Bildschirm rastert er nicht und meldet in beiden Fällen dieselben 165 FPS. Die Bewertung oben stützt sich auf den Rendering-Pfad, nicht auf eine Messung.)*

---

## K2 · Kein Code-Splitting: **1,37 MB JavaScript in einem einzigen Chunk**

> ✅ **Erledigt.** Startseiten-Bundle **1.374 kB → 661 kB** (gzip **374 kB → 189 kB**), also
> −52 %. Ausgelagert wurden die vier Schwergewichte plus — feiner als geplant — die acht
> Clash-Modi einzeln, weil immer nur einer gespielt wird und die Lobby keinen davon braucht:
>
> | Chunk | Größe | wird geladen bei |
> |---|---:|---|
> | `index` (Startseite) | 645 kB | immer |
> | `ClashRoyalePage` | 162 kB | `/clash-royale` |
> | `GameContainer` | 153 kB | `/garden` |
> | `AdventureGame` | 106 kB | `/adventures` |
> | `DiscordBotDashboard` | 105 kB | `/discord-bot` |
> | `BingoRoyale` … `SnakeRoyale` (8 Modi) | 8–52 kB | erst beim Spielstart des jeweiligen Modus |
>
> Im Browser gegengeprüft: Die Startseite lädt **keinen einzigen** dieser Chunks, jede Route
> holt genau ihren eigenen, und `/clash-royale` zieht in der Lobby **keinen** Modus-Chunk.
> Damit beim Spielstart kein Platzhalter aufblitzt, wird der Modus-Chunk schon vorgeladen,
> sobald in der Lobby feststeht, was gespielt wird.
>
> **Zwei Dinge, die der Umbau nötig gemacht hat:**
>
> 1. **`LazyRouteBoundary` in `App.jsx`.** Beim Test zeigte sich: Schlägt ein Chunk-Download
>    fehl, wirft `React.lazy`, und ohne Error Boundary hängt sich der komplette Baum aus —
>    der Nutzer sieht eine **weiße Seite**. Der reale Auslöser dafür ist ein Deploy während
>    einer offenen Sitzung: die Chunk-Namen sind gehasht, der Nachladeversuch bekommt eine
>    404. Die Boundary fängt das ab und bietet Neuladen an. Das ist ein Fehlerbild, das es
>    vor dem Code-Splitting schlicht nicht gab.
> 2. **`prerender.js` abgesichert.** `/clash-royale` und `/discord-bot` werden vorgerendert.
>    Ohne Anpassung hätte das Skript den Suspense-Fallback ins ausgelieferte HTML gebacken —
>    für Crawler wäre die Seite dann leer, und es wäre erst im Ranking aufgefallen. Das
>    Skript wartet jetzt darauf, dass `[data-page-fallback]` verschwindet, und **bricht den
>    Build mit Exit-Code 1 ab**, wenn eine Seite doch nur Ladeplatzhalter
>    (`data-page-fallback`), die Fehlermeldung (`data-page-error`) oder ein praktisch leeres
>    `#root` enthält. Beide Marker sind die Schnittstelle zwischen `App.jsx` und
>    `prerender.js` — beim Umbenennen mitziehen.

[Frontend/src/App.jsx:1-36](Frontend/src/App.jsx#L1-L36) — alle 30 Routen sind statische Imports.

Nachgewiesen am gebauten Bundle:

```
Anzahl JS-Chunks in dist/assets:  1
Suche im Startseiten-Bundle:      "garden-assets" 99×  ·  "Nuzlocke" 16×
                                  "adventure" 36×      ·  "connect4" 24×
                                  "discord-bot" 22×    ·  "WinChallenge" 16×
```

Wer die Startseite öffnet, lädt und **parst** also: das komplette Garden-Game (4.218 Zeilen `GameContainer` + 1.328 Zeilen `Renderer`), die Adventure-Engine (2.802 Zeilen), alle 10 Clash-Royale-Modi, das Discord-Dashboard, Connect4, WinChallenge und Nuzlocke.

370 kB gzip klingt harmlos — die Kosten liegen aber im **Parsen und Kompilieren**, und das blockiert den Main-Thread. Auf einem Mittelklasse-Handy sind das schnell 400-800 ms, in denen die Seite auf keine Eingabe reagiert. Genau das beschreiben Nutzer als „verzögert reagiert".

**Lösung — Routen lazy laden.** `Layout`, `Home` und `TwitchAuthProvider` bleiben eager (das ist die Startseite), alles andere wird nachgeladen:

```jsx
// App.jsx
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./pages/Layout";
import Home from "./pages/Home";
import TwitchAuthProvider from "./components/TwitchAuthProvider";

// Schwergewichte: erst laden, wenn die Route wirklich aufgerufen wird
const GameContainer   = lazy(() => import("./pages/GardenGame/GameContainer"));
const AdventureGame   = lazy(() => import("./pages/Adventure/AdventureGame"));
const ClashRoyalePage = lazy(() => import("./pages/ClashRoyale/ClashRoyalePage"));
const NuzlockePage    = lazy(() => import("./pages/ClashRoyale/Nuzlocke/NuzlockePage"));
const WinTrackerPage  = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerPage"));
const DiscordBotDashboard = lazy(() => import("./pages/Discord/DiscordBotDashboard"));
const AdminDashboard  = lazy(() => import("./pages/AdminDashboard"));
const WinChallenge    = lazy(() => import("./pages/WinChallenge/WinChallenge"));
const Connect4Page    = lazy(() => import("./pages/Connect4/Connect4Page"));
const Connect4Room    = lazy(() => import("./pages/Connect4/Connect4Room"));
// … analog für Bingo, Giveaways, Abstimmung, YTM, Updates, Profile, Overlays

function PageFallback() {
  return <div className="min-h-[60vh] flex items-center justify-center text-white/40 text-sm">Lädt…</div>;
}

export default function App() {
  return (
    <TwitchAuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* … unverändert … */}
        </Routes>
      </Suspense>
    </TwitchAuthProvider>
  );
}
```

Zusätzlich in `vite.config.js` die Vendor-Libs abtrennen, damit sie über Deploys hinweg gecacht bleiben (der Kommentar „Keine manualChunks mehr!" steht dem aktuell im Weg):

```js
build: {
  chunkSizeWarningLimit: 2000,
  rollupOptions: {
    output: {
      assetFileNames: /* … unverändert … */,
      manualChunks: {
        'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
        'socket-vendor': ['socket.io-client'],
      },
    },
  },
},
```

**Wichtig für `prerender.js`:** Das Skript rendert 13 Routen mit Puppeteer vor. Mit `lazy()` muss es nach dem Navigieren auf den aufgelösten Chunk warten (`page.waitForSelector` auf ein Element der Zielseite statt nur `networkidle`), sonst landet der Fallback im vorgerenderten HTML.

---

## K3 · Avatare: 2,4 MB Originalbilder → **33 MB dekodierte Bitmaps**, angezeigt mit 48×48 px

> ✅ **Erledigt.** Alle 17 Avatare auf 128 px (kürzere Kante) herunterskaliert — **2,41 MB → 0,17 MB
> (−93 %)**, RAM nach Decode **33 MB → 1,1 MB**. Skaliert mit Chrome über Puppeteer (bereits als
> devDependency vorhanden), also ohne neue Abhängigkeit. **Dateinamen und Endungen sind unverändert**,
> weil der Dateiname die Avatar-ID ist (`localStorage.clash_session`, `p.avatar` im Backend) — eine
> Umstellung auf `.webp` hätte jede gespeicherte Auswahl entwertet. Die zwei PNGs mit Alphakanal
> blieben PNG. `loading="lazy"`, `decoding="async"` und feste `width`/`height` ergänzt in
> `ClashRoyalePage` (Picker + `PlayerAvatar`) und in `AvatarCircle` aller 8 Spielmodi.
> Sichtprüfung bei 30/44/48/96 px: keine Artefakte.
>
> Die Originale liegen als Backup im Scratchpad dieser Sitzung; über `git checkout` sind sie ohnehin
> wiederherstellbar.
>
> **Noch offen, gleiche Klasse:** In `src/assets/clashRoyale/` liegen weiterhin drei große Bilder —
> `Royale_Ghost.png` (321 KB), `goldenknight.png` (172 KB), `archerqueen.png` (141 KB). Die waren nicht
> Teil dieses Punktes, lohnen aber dieselbe Behandlung.

[ClashRoyalePage.jsx:1281-1293](Frontend/src/pages/ClashRoyale/ClashRoyalePage.jsx#L1281-L1293) rendert alle 17 Avatare gleichzeitig als 48×48-Buttons — mit den unskalierten Originalen:

| Datei | Download | Auflösung | RAM nach Decode |
|---|---:|---:|---:|
| Gniesbert.png | 737 KB | 841×841 | 2,7 MB |
| PotenzSpin.png | 559 KB | 832×832 | 2,6 MB |
| QueenFeet.jpg | 297 KB | **1614×1577** | **9,7 MB** |
| Messi.jpg | 130 KB | 887×887 | 3,0 MB |
| ArcherFeet.jpg | 116 KB | 1125×1215 | 5,2 MB |
| *(12 weitere)* | | | |
| **Summe** | **2,41 MB** | | **≈ 33 MB** |

Der Browser dekodiert jedes Bild in voller Auflösung in den Speicher und skaliert es dann auf 48 px herunter. Das Dekodieren eines 1614×1577-JPEGs kostet auf schwacher Hardware zweistellige Millisekunden — 17 davon nacheinander sind ein sichtbarer Hänger beim Öffnen der Clash-Royale-Lobby. Dieselben Bilder werden über `AVATAR_MAP` außerdem in **8 weiteren Dateien** (allen Spielmodi) referenziert.

**Lösung, Schritt 1 — Bilder verkleinern.** Die Originale gehören auf max. 128×128 (2× für Retina bei 48 px Anzeige) und als WebP:

```bash
# einmalig, z.B. mit sharp-cli
npx sharp-cli --input "Frontend/src/assets/avatars/*.{png,jpg}" \
              --output Frontend/src/assets/avatars/ \
              resize 128 128 --fit cover -- webp --quality 82
```

Das drückt die 2,41 MB auf grob 150-250 KB und die 33 MB RAM auf unter 1,5 MB.

**Lösung, Schritt 2 — Decode entkoppeln und Ladepriorität senken.** In der Picker-Liste:

```jsx
<img src={AVATAR_URL_MAP[id]} alt={id}
     width={48} height={48}
     loading="lazy"            {/* außerhalb des Viewports gar nicht erst laden */}
     decoding="async"          {/* Decode blockiert den Main-Thread nicht */}
     className="w-full h-full object-cover object-center" />
```

`loading="lazy"` wird aktuell in genau 2 von 80 `<img>`-Stellen im Frontend benutzt — es lohnt sich, das breit nachzuziehen.

---

## K4 · Garden-Game: kompletter State-Klon in **jedem** Frame

> ✅ **Umgesetzt** — aber ⚠️ **die Einstufung als KRITISCH war falsch.** Nachgemessen (Node,
> `--expose-gc`, 3600 Frames = 60 s Spielzeit, 8 Slots, eigener Acker voll bepflanzt):
>
> | Pflanzen | Block | Speicher/Frame | CPU/Frame | % vom 16,7 ms-Budget |
> |---:|---|---:|---:|---:|
> | 300 | Game-Loop **vorher** | 0,21 KB | 39,0 µs | 0,23 % |
> | 300 | Game-Loop **nachher** | 0,03 KB | 0,1 µs | 0,00 % |
> | 120 | Game-Loop **vorher** | 0,05 KB | 13,7 µs | 0,08 % |
> | 120 | Game-Loop **nachher** | 0,03 KB | 0,1 µs | 0,00 % |
>
> Die Umstellung ist real — der Block wird ~390× billiger und allokiert im Normalbetrieb gar
> nichts mehr. Nur: **39 µs von 16.667 µs sind 0,23 % des Frame-Budgets.** Das erklärt keine
> sichtbaren Ruckler. Ein PerformanceObserver auf `gc` zeigte über 60 s Spielzeit **null**
> Sammelläufe in beiden Varianten — die Allokationsmenge bleibt unter V8s Scavenge-Schwelle.
> Meine Formulierung „genau die Mikro-Ruckler" war eine Vermutung ohne Messung und ist damit
> widerlegt. Richtig eingeordnet gehört dieser Punkt nach 🟡 MITTEL: sauberer Code, messbar
> billiger, aber kein spürbarer Effekt.
>
> **Ebenfalls korrigiert:** Die Warnung weiter unten, der Loop werde durch `activateInteractable`
> abgerissen, trifft nicht zu — der Callback hat `[]` als Dependencies und ist stabil. Der Effekt
> läuft nur beim Betreten/Verlassen des Spiels neu. Der Absatz ist damit gegenstandslos.
>
> **Wo die Garden-Last stattdessen liegt** (gemessen, gleicher Lauf): Zwei Blöcke im Renderer
> allokieren pro sichtbarem Slot **pro Frame** deutlich mehr als der Game-Loop es je tat —
> zusammen bei 300 Pflanzen 2,74 KB/Frame gegenüber 0,21 KB:
>
> | Block | Speicher/Frame | CPU/Frame |
> |---|---:|---:|
> | `Renderer._drawPlantsForSlot` — `Object.entries().map().filter().sort()` ([Renderer.js:467](Frontend/src/pages/GardenGame/engine/Renderer.js#L467)) | 1,08 KB | 65,2 µs |
> | `Renderer._getSlotStaticLayer` — `[...new Set()].sort().join()` nur zum Cache-Vergleich ([Renderer.js:373](Frontend/src/pages/GardenGame/engine/Renderer.js#L373)) | 1,66 KB | 9,5 µs |
>
> Aber auch die bleiben zusammen unter 0,5 % des Frame-Budgets. **Fazit: Die Garden-Ruckler
> kommen mit hoher Wahrscheinlichkeit nicht aus JS-Allokationen, sondern aus der eigentlichen
> Zeichenarbeit** (`drawImage`-Aufrufe, die 6 `shadowBlur`-Stellen im Renderer, das
> Wetter-Overlay). Das gehört mit einem echten Browser-Profil im laufenden Spiel untersucht,
> nicht per Code-Lesen — sonst rate ich wieder.

[GameContainer.jsx:1780-1800](Frontend/src/pages/GardenGame/GameContainer.jsx#L1780-L1800), im `gameLoop` bei 60 FPS:

```js
const slots = l.slots.map((slot, i) => {
    if (i === myPlotSlotIndex) {
        const visiblePlants = { ...engine.plotPlants };      // ← Vollklon, jeden Frame
        if (movingPlantSourceRef.current && selectedToolRef.current === "pot") {
            delete visiblePlants[movingPlantSourceRef.current];
        }
        return { ...slot, plants: visiblePlants, /* … */ };  // ← neues Objekt, jeden Frame
    }
    return slot;
});
renderer.draw({ /* … */ layout: { ...l, slots }, /* … */ }, player);   // ← noch ein Objekt
```

Pro Frame entstehen ein Klon aller Pflanzen (bei ausgebauter Farm dreistellig viele Einträge), ein neues Slot-Array und zwei weitere Objekte — **60× pro Sekunde**. Das ist reiner Müll für den Garbage Collector, und dessen Sammelläufe sind exakt die Mikro-Ruckler, die man als „leichtes Laggen" wahrnimmt.

**Lösung — nur klonen, wenn wirklich etwas ausgeblendet wird, und die Hüllobjekte wiederverwenden:**

```js
// Vor dem Loop einmalig anlegen — wird pro Frame nur befüllt, nie neu erzeugt.
const drawPayload = {};
const slotsBuf = [];

const gameLoop = () => {
    // …
    const hidePlant = selectedToolRef.current === "pot" ? movingPlantSourceRef.current : null;

    // Der Klon ist nur nötig, solange tatsächlich eine Pflanze umgetopft wird.
    let visiblePlants = engine.plotPlants;
    if (hidePlant && visiblePlants[hidePlant]) {
        visiblePlants = { ...engine.plotPlants };
        delete visiblePlants[hidePlant];
    }

    slotsBuf.length = 0;
    for (let i = 0; i < l.slots.length; i++) {
        const slot = l.slots[i];
        if (i !== myPlotSlotIndex) { slotsBuf.push(slot); continue; }
        slotsBuf.push({
            ...slot,
            plants: visiblePlants,
            currentExpansions: plotExpansionsRef.current,
            unlockedCells: plotUnlockedCellsRef.current,
        });
    }

    // Felder überschreiben statt Objekt neu bauen
    drawPayload.areas = engine.areas;
    drawPayload.readyEggsCount = readyEggsCount;
    drawPayload.layout = l;
    drawPayload.slots = slotsBuf;          // Renderer liest Slots künftig direkt hier
    drawPayload.zoom = 1;
    drawPayload.selectedTool = selectedToolRef.current;
    drawPayload.heldItem = activeHeldItem;
    drawPayload.weather = weatherStateRef.current;
    drawPayload.renderProfile = renderProfileRef.current;
    drawPayload.petPlacements = engine.petPlacements;
    drawPayload.decoPlacements = engine.decoPlacements;
    drawPayload.harvestFlashes = harvestFlashesRef.current;
    drawPayload.localPlayerName = localPlayerNameRef.current;
    drawPayload.playerAppearance = appearanceRef.current;
    drawPayload.playerBadge = playerBadgeRef.current;

    renderer.draw(drawPayload, player);
    animFrame = requestAnimationFrame(gameLoop);
};
```

Im Normalfall (kein Umtopfen) fällt damit **jede** Allokation pro Frame weg. `Renderer.draw` muss dafür `slots` aus dem Payload statt aus `layout.slots` lesen.

~~**Zusatz:** Der Effekt hängt an `[showLobbyScreen, activateInteractable]`. Ändert sich `activateInteractable`, wird der komplette Loop abgerissen …~~ — **hinfällig, siehe Kasten oben:** `activateInteractable` hat `[]` als Dependencies und ist über Renders hinweg stabil. Der Loop startet nur beim Betreten/Verlassen des Spiels neu, Renderer-Caches gehen dabei nicht verloren.

---

# 🟡 MITTEL

## M1 · `useNow(100)` rendert die Spielmodi 10× pro Sekunde komplett neu

Identisch in [AngelRoyale.jsx:86-93](Frontend/src/pages/ClashRoyale/modes/AngelRoyale.jsx#L86-L93), [DarkMaze.jsx:77](Frontend/src/pages/ClashRoyale/modes/DarkMaze.jsx#L77), [ElixirRush.jsx:96](Frontend/src/pages/ClashRoyale/modes/ElixirRush.jsx#L96):

```js
const id = setInterval(() => setNow(Date.now()), intervalMs);   // alle 100 ms
```

`now` wird nur für Countdown, Cooldown-Balken und Toast gebraucht — trotzdem rendert React 10×/s den **gesamten** Modus neu, inklusive `AngelSidebar` mit 8 Spielern × 8 Deck-Slots und je einem `<img>`. Parallel läuft der rAF-Canvas-Loop. Auf schwachen Geräten konkurrieren beide um denselben Thread.

Günstigster Fix: die Sidebar aus dem Takt nehmen, weil sie von `now` gar nicht abhängt.

```js
const AngelSidebar = React.memo(function AngelSidebar({ state, myPlayerId, t }) {
  // … unverändert …
});
```

Noch besser: `useNow` auf 250 ms senken (der Cooldown wird ohnehin nur mit einer Nachkommastelle angezeigt) und den Deck-Balken per Ref direkt ins DOM schreiben — so wie es `WinChallengeOverlay` bereits vorbildlich macht.

## M2 · Socket verbindet sich auf **jeder** Seite, auch ohne Bedarf

[utils/socket.js](Frontend/src/utils/socket.js) baut die Verbindung beim Import auf:

```js
export const socket = io(socketServerUrl, { autoConnect: true, /* … */ });
```

`Layout` importiert das Modul — und weil es kein Code-Splitting gibt (K2), passiert das bei **jedem** Seitenaufruf, auch auf Impressum, Updates oder Tutorial-Seiten. Jeder Besucher öffnet einen WebSocket zum Backend. Empfehlung: `autoConnect: false` und `socket.connect()` erst dort, wo Realtime gebraucht wird (Clash Royale, Garden, Connect4, Bingo, Layout-Broadcast).

## M3 · Kaum Memoization bei sehr großen Komponenten

| Datei | Zeilen | `useState` | `useMemo` | `React.memo` |
|---|---:|---:|---:|---:|
| `GardenGame/GameContainer.jsx` | 4.218 | 62 | 1 | 1 |
| `ClashRoyale/ClashRoyalePage.jsx` | 3.018 | 46 | 1 | 0 |

Im gesamten Frontend gibt es **2** `React.memo`-Aufrufe. In `ClashRoyalePage` löst jede eingehende Socket-Nachricht — z. B. `clash:fish:state`, das während Angel Royale im 250-ms-Takt kommt ([Zeile 946](Frontend/src/pages/ClashRoyale/ClashRoyalePage.jsx#L946)) — ein Re-Render der kompletten 3.018-Zeilen-Komponente aus. Lohnendster erster Schritt: Sidebar, Spielerliste und Deck-Leisten als `React.memo`-Kinder herauslösen.

## M4 · Overlays pollen im Sekundentakt und rendern bedingungslos neu

[WinChallengeOverlay.jsx:62](Frontend/src/pages/WinChallenge/WinChallengeOverlay.jsx#L62): `setInterval(load, 1000)` mit `setDoc(data)` ohne Vergleich — also 86.400 Requests pro Tag und Overlay, und jede Sekunde ein Re-Render, auch wenn sich nichts geändert hat. Overlays laufen in OBS dauerhaft.

Die Timer-Anzeige derselben Datei ist dagegen bereits sehr sauber gelöst (direkte DOM-Writes, `transform`-basiertes Scrollen) — dieses Muster gehört auf `setDoc` ausgeweitet:

```js
const raw = JSON.stringify(data);
if (raw !== lastRawRef.current) { lastRawRef.current = raw; setDoc(data); }
```

Mittelfristig ist das Polling durch ein Socket-Event zu ersetzen — socket.io ist ohnehin schon verbunden.

## M5 · CSS-Keyframes animieren Layout-Eigenschaften

`index.css` — diese drei lösen pro Frame Layout + Paint aus statt nur Compositing:

```css
@keyframes rise         { 0% { bottom: -20px; } 100% { bottom: 120%; } }   /* Zeile 188 */
@keyframes swarm-pass   { 0% { left: -20%; }   100% { left: 120%; } }      /* Zeile 235 */
@keyframes scroll-credits { 0% { top: 100%; }  100% { top: 0; } }          /* Zeile 252 */
```

Umbauen auf `transform: translate3d(...)`, z. B.:

```css
@keyframes rise {
  0%   { transform: translate3d(0, 0, 0);          opacity: 0; }
  10%  { opacity: 0.8; }
  80%  { opacity: 0.9; }
  100% { transform: translate3d(30px, -120vh, 0);  opacity: 0; }
}
```

`swarm-pass` und `rise` werden aktuell in keiner Komponente verwendet (Suchtreffer: 0) — die können auch ersatzlos raus. `animate-scroll-credits` läuft in `StreamCredits` und animiert 100 s lang `top`.

## M6 · Ungenutzte Abhängigkeiten im Frontend

> ✅ **Erledigt.** 11 Pakete entfernt, `node_modules` von **302 auf 241 Pakete** (−61).
> Vor dem Entfernen jedes einzeln im gesamten Projektcode gegengeprüft (Import-, `require`-
> und dynamische Import-Form): null Treffer.
>
> Entfernt: `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/cannon`,
> `@react-three/rapier`, `@types/three`, `react-quill-new`, `dompurify`, `canvas-confetti`,
> `baseline-browser-mapping`, **`socket.io`**.
>
> **Zwei Nachträge zur ursprünglichen Liste:**
> - `socket.io` — das **Server**-Paket stand in den Frontend-Dependencies, obwohl dort nur
>   `socket.io-client` benutzt wird (6 Importe gegen 0). Stand nicht im ursprünglichen
>   Report, gehört aber in dieselbe Kategorie.
> - `baseline-browser-mapping` kommt ohnehin transitiv über `autoprefixer → browserslist`;
>   der direkte Eintrag war redundant.
>
> **Falscher Alarm vermieden:** Eine erste Suche meldete 5 `canvas-confetti`-Importe. Die lagen
> alle in `.claude/worktrees/agent-…/` — einem Claude-Code-Worktree mit altem Stand, in dem
> die längst entfernten Casino-Komponenten noch liegen. Kein Projektcode.
>
> Der Bundle-Hash blieb nach dem Entfernen unverändert (`index-CYDIYRim.js`, 660,97 kB) —
> Beleg dafür, dass die Pakete dank Tree-Shaking nie im Bundle waren. Der Gewinn liegt bei
> Installations- und CI-Zeit, nicht bei der Ladezeit.
>
> **Noch offen:** Im Repo-Wurzelverzeichnis liegt eine eigene `package.json`, die als einzige
> Abhängigkeit `canvas-confetti` führt — ohne `name`, ohne Skripte, mit eigenem
> `node_modules`. Die sieht versehentlich aus. Sie ganz zu löschen ist aber eine andere
> Entscheidung als das Aufräumen von Abhängigkeiten, deshalb habe ich sie stehen lassen.

Kein einziger Import in `src/` für:

```
three  ·  @react-three/fiber  ·  @react-three/drei
@react-three/cannon  ·  @react-three/rapier  ·  @types/three
react-quill-new  ·  dompurify  ·  canvas-confetti
```

*(Die Treffer auf `"three"` stammen alle von der Karte `three-musketeers`.)*

Sie landen dank Tree-Shaking nicht im Bundle, blähen aber `node_modules`, Installations- und CI-Zeit auf. `npm uninstall three @react-three/fiber @react-three/drei @react-three/cannon @react-three/rapier @types/three react-quill-new dompurify canvas-confetti` — vorher kurz gegenprüfen, ob eine der Overlay-Seiten sie zur Laufzeit über einen dynamischen Pfad zieht.

---

# 🔵 NIEDRIG

## N1 · Die 3 Lint-Fehler

> ✅ **Erledigt** (bei K2 mitgenommen, weil `process.exit(1)` in `prerender.js` denselben
> Fehler ein weiteres Mal ausgelöst hat). `npm run lint` meldet jetzt **0 Fehler**,
> 26 Warnungen (alle `exhaustive-deps`, siehe N2).

```
prerender.js:170:3   'process' is not defined   no-undef
vite.config.js:6:17  'process' is not defined   no-undef
AngelRoyale.jsx:226  'myPlayerId' is defined but never used   ← bereits behoben
```

Die beiden `process`-Fehler sind Konfigurationssache: beide Dateien laufen in Node, die Flat Config gibt aber nur `globals.browser` frei. Ergänzen in `eslint.config.js`:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    // Node-Skripte: eigene Globals, sonst schlägt `process` als no-undef auf
    files: ['vite.config.js', 'prerender.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    // … bestehender Block unverändert …
  },
])
```

## N2 · 26 `react-hooks/exhaustive-deps`-Warnungen

Schwerpunkt `GardenGame/GameContainer.jsx` (13 Stück). Die meisten sind bewusst gesetzt und teils kommentiert — aber jede davon ist ein potenzieller Stale-Closure-Bug. Empfehlung: einzeln durchgehen und die absichtlichen mit `// eslint-disable-next-line react-hooks/exhaustive-deps` **plus Begründung** markieren, damit die Liste wieder aussagekräftig wird. Besonders ansehen:

- `GameContainer.jsx:1832` — „ref value 'engineRef.current' will likely have changed by the time this effect cleanup runs": Das ist die Cleanup-Funktion des Haupt-Game-Loops. Wenn `engineRef.current` bis dahin ausgetauscht wurde, wird der **falsche** `InputHandler` zerstört und der alte behält seine `window`-Listener → echtes Leak-Risiko beim Verlassen der Garden-Seite.

## N3 · 46× `key={index}` in Listen

React kann Elemente bei Umsortierung/Einfügen nicht wiederverwenden und baut stattdessen DOM neu auf. Wo eine stabile ID existiert (`card.id`, `p.id`, `f.fishId`), gehört die als `key`. Bei reinen Platzhalter-Rastern fester Länge — etwa den Deck-Slots in `AngelRoyale` — ist der Index dagegen korrekt und kann bleiben.

## N4 · Der Avatar-Glob steht 8× identisch im Code

```js
const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,…}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
```

Wortgleich in `AngelRoyale`, `BingoRoyale`, `CardEvolution`, `DarkMaze`, `ElixirAuction`, `ElixirRush`, `ShadowCarousel`, `SnakeRoyale` — und ein neuntes Mal leicht abgewandelt in `ClashRoyalePage`. Vite dedupliziert das im Build, die Wartung leidet aber: eine Änderung an der Dateiendungs-Liste muss neunmal nachgezogen werden. Gehört in ein `data/avatars.js` mit `export const AVATAR_MAP` und `export function avatarUrl(id)`.

## N5 · Irreführende Kommentare in `vite.config.js`

```js
// WICHTIG: rollupOptions komplett entfernen oder leer lassen!
rollupOptions: {
  // Keine manualChunks mehr!
```

Die Kommentare halten von genau der Optimierung ab, die unter K2 empfohlen wird. Falls es dafür einen historischen Grund gab (vermutlich ein Ladefehler durch falsch aufgeteilte Chunks), sollte er dort stehen — sonst löschen.

---

## Empfohlene Reihenfolge

| # | Maßnahme | Aufwand | Erwarteter Effekt |
|---|---|---|---|
| 1 | **K1** `scale()` aus den Orb-Keyframes, Blur in Verlauf backen | ~15 min | Ruckeln auf **allen** Seiten |
| 2 | **K3** Avatare auf 128 px verkleinern + `loading="lazy"` | ~30 min | Hänger in der Clash-Lobby, 2,4 MB → ~200 KB |
| 3 | **K2** Routen auf `React.lazy` umstellen | ~2 h (inkl. `prerender.js`) | Startseite reagiert deutlich früher |
| 4 | **K4** Frame-Allokationen im Garden-Loop entfernen | ~1 h | Mikro-Ruckler im Garden-Game |
| 5 | **M1/M3** `React.memo` auf Sidebars, `useNow` entschärfen | ~1 h | Clash-Royale-Modi |
| 6 | **M2** `autoConnect: false` | ~20 min | Backend-Last, Verbindungen |

Punkte 1 und 2 zusammen sind unter einer Stunde Arbeit und decken den site-weiten Teil der Beschwerden ab — damit würde ich anfangen und danach erneut Feedback einholen.
