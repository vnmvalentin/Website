## 2. Virtual Farm

### 2.1 Sprite/UI-Aufträge

Stand August 2026, gegen den Ordner `Frontend/public/garden-assets/` geprüft.
**Alle 57 Pflanzen sind vollständig** (`seed_shop.png` + `plant.png` bzw. `structure.png` + `fruit.png`) — hier fehlt nichts.

#### Größen-Konvention

Die Kachel ist 64 px (`TILE_SIZE`). Der Renderer skaliert **über die Höhe** und begrenzt die Breite,
d. h. die Quellauflösung muss nur größer sein als die maximale Darstellungsgröße. Bei Zoom 2,4
wird eine Pflanze bis ~270 px hoch → **Quellhöhe ca. 250–350 px** ist der richtige Zielbereich.
Alles PNG mit Transparenz, Blickrichtung **rechts** (Engine spiegelt selbst).

| Kategorie | Ordner | Ist-Größen (gemessen) | Empfehlung für Neues |
|---|---|---|---|
| Pflanze einjährig | `plants/<id>/plant.png` | 145×332 (Karotte) | 200×300, Fußpunkt unten mittig |
| Pflanze mehrjährig | `plants/<id>/structure.png` | 177×149 | 250×250 |
| Frucht | `plants/<id>/fruit.png` | 159×162 | 160×160, quadratisch |
| Samen-Icon | `plants/<id>/seed_shop.png` | ~120×160 | 128×128 |
| Tier | `animals/*.png` | 179×246 | 200×260, seitlich stehend |
| Gebäude | `world/*.png` | 450×503 – 1024×559 | 600–1024 breit |
| Deko | `deco/*.png` | 107×287 – 508×336 | je Kachelgröße ×250 px |
| Werkzeug | `tools/*.png` | 236×317 | 240×320 |
| Ei | `eggs/*.png` | 126×173 | 128×176 |
| Skin | `wardrobe/*.png` | 214×248 | 220×250 |
| Terrain-Kachel | `structure/*.png` | ~455×455 | 256×256 quadratisch, nahtlos |

#### Fehlt wirklich (404 im Live-Betrieb)

- **5 Sounds** — `GameContainer.ensureGardenSounds()` lädt sie, sie existieren aber nicht:
  `sounds/menu_open.mp3`, `menu_close.mp3`, `kaching.mp3`, `rain.mp3`, `thunder.mp3`.
  (Vorhanden: `theme`, `rotation`, `cash`, `plant`, `harvest`.)
- **Atlas:** `atlas/garden_atlas.png` + `.json` werden referenziert, der Ordner existiert nicht.
  Fallback greift, kostet aber ~15 Einzelrequests beim Boot. Entweder bauen oder Referenz entfernen.
- ~~`animals/waschbaer.png`~~ — **behoben**: Datei hieß `waschbär.png`, der Code slugifiziert aber
  zu `waschbaer`. Umbenannt.

#### Neue Sprites (Wunschliste)

| Datei | Größe | Zweck |
|---|---|---|
| ~~`animals/phoenix.png`~~ | 200×260 | vorhanden |
| ~~`animals/tiger.png`~~ | 200×260 | vorhanden |
| ~~`animals/drache.png`~~ | 220×280 | vorhanden (mit Laufbildern) |
| ~~`animals/goetterwesen.png`~~ | 200×280 | vorhanden |
| `world/icon_sun/rain/snow/thunder/moon.png` | 64×64 | Wetter-HUD ohne Emoji |
| `common/water_splash1/2.png` | 128×128 | 2-Frame-Gieß-Animation |
| `common/sparkle1-3.png` | 64×64 | Ernte-Partikel für Golden/Rainbow |
| `world/sign_seed/tool/egg/deco/market.png` | 200×160 | Hängeschilder, damit Shops ohne Text lesbar sind |
| `deco/lamp.png`, `statue.png`, `fountain.png` | s. o. | ersetzen die `*_placeholder`-Dateien (die sind bereits echte Grafiken, nur unglücklich benannt) |

#### Strukturen der Mehrfachpflanzen (`plants/<id>/structure.png`)

28 Arten tragen dauerhaft und brauchen eine Struktur. Zwei Regeln entscheiden darüber,
ob die Grafik am Ende richtig sitzt:

**Regel 1 — kein doppeltes Gerüst.** Der Renderer zeichnet bei den meisten Wuchsformen
selbst ein Gerüst *hinter* die Grafik (Spalier, Ruten, Stab, Bodenranken). Diese Teile
gehören dann **nicht** ins Bild, sonst steht beides übereinander — genau der Fehler, den
Bäume anfangs mit dem doppelten Stamm hatten.

**Regel 2 — Fruchtzone auf der richtigen Höhe.** Früchte werden in einem waagerechten Band
auf die Struktur gesetzt, gemessen von unten in Prozent der Pflanzenhöhe. Was dort im Bild
liegt, trägt später die Früchte — dort müssen also Äste, Ranken oder Zweige sein, sonst
hängen die Früchte in der Luft.

Alle Bilder: PNG mit Transparenz, **Fußpunkt unten mittig**, Quellhöhe ~250–350 px.

| Wuchsform | Arten | Was die Struktur zeigt | Eigenes Gerüst? | Fruchtzone |
|---|---|---|---|---|
| **Baum** | kirsche, limette, apfel, birne, orange, pflaume, mango, olive, sternfrucht | Stamm mit Astwerk und Krone — der Stamm gehört **ins Bild** | ja, selbst zeichnen | 62 % |
| **Palme** | banane, acai, dattel, kokosnuss | Schlanker Stamm mit Segmenten, Wedelkrone oben | ja, selbst zeichnen | 72 % |
| **Rankpflanze** | erbsen, bohne, gurke, traube, kiwi, passionsfrucht | **Nur die Ranke**: Triebe, Blätter, Ranktriebe — kein Gitter, keine Stäbe | nein, Renderer zeichnet ein Spalier dahinter | 55 % |
| **Rutenstrauch** | himbeere | Nur Laub und Seitentriebe | nein, Renderer zeichnet die Ruten | 50 % |
| **Strauch** | tomate, chili, stachelbeere, blaubeere | Kompakter Busch, rundlich, aus einem Punkt wachsend | nein, Renderer setzt einen schlanken Stab an den Rand | 45 % |
| **Bodenranke** | zucchini, cranberry, erdbeere | Flaches Blattpolster, breiter als hoch | nein, Renderer zeichnet Bodenranken | 30 % |
| **Blattgemüse** | rhabarber | Blattstiele aus einem Punkt, große Blätter obenauf | nein (braucht keins) | 35 % |

Beispiele, was das konkret heißt:

- **Traube** — heute ein Bild mit eigenem Gitter. Richtig wäre nur der Rebstock mit Trieben;
  das Spalier kommt vom Renderer. Die Trauben hängen dann bei 55 % Höhe an den Trieben.
- **Erdbeere** — kein Busch, sondern ein flaches Polster aus dreiteiligen Blättern; die
  Früchte liegen tief bei 30 %, also fast auf dem Boden.
- **Banane** — kein Baumstamm mit Ästen, sondern ein Scheinstamm aus Blattscheiden mit
  Wedelkrone; das Büschel sitzt hoch bei 72 %, direkt unter der Krone.
- **Tomate** — nur der Busch. Den Stab setzt der Renderer schlank an den Rand, damit nicht
  wieder Schnüre quer über die Pflanze laufen.

Wer die Fruchtzone verschieben will, ändert `canopy` in `ARCHETYPE_PROFILES`
(`engine/PlantSystem.js`) — dort stehen auch Höhe, Breite, Wind und Schattengröße je Wuchsform.

#### Deko-Ansichten (neu, August 2026)

Deko wird beim Platzieren mit **R** nicht mehr in der Ebene gedreht — das legte einen Pool
seitlich auf den Rasen —, sondern zeigt eine andere **Ansicht**. Der Renderer sucht dafür eine
Variante neben dem Grundbild:

```
deco/teich.png          ← Grundbild, Ansicht "front" (vorhanden)
deco/teich_right.png    ← Ansicht von rechts
deco/teich_back.png     ← Ansicht von hinten
```

- **„links" braucht kein eigenes Bild** — der Renderer spiegelt `_right` horizontal.
- **Fehlt eine Variante, passiert nichts Schlimmes:** es bleibt beim Grundbild stehen. Man kann
  also Stück für Stück nachliefern, ohne dass etwas bricht.
- Größe identisch zum Grundbild (siehe Tabelle oben, je Kachelgröße ×250 px).

Lohnend zuerst für die Objekte, bei denen eine Drehung überhaupt sichtbar ist:
`bank`, `tisch`, `grill`, `brunnen1`, `teich`, `pool`, `bogen`, `lamp_placeholder`,
`statue_placeholder`, `fountain_placeholder`. Bei den Gartenzwergen und der Feuerschale
reicht die Frontansicht.

#### Für den Multiplayer-Umbau (Phase 3) zusätzlich

| Datei | Größe | Zweck |
|---|---|---|
| `world/mailbox_full.png` | 162×310 | Briefkasten mit Post (Variante zu `mailbox.png`) |
| `world/plot_sign_empty.png` | 200×160 | „Frei"-Schild für unbelegte Grundstücke |
| `world/fence_h.png`, `fence_v.png`, `fence_corner.png` | 128×128 | Grundstücksgrenzen statt der gezeichneten Linie |

> Prozedural gelöst und **nicht** als Grafik nötig: Stützgerüste (Spalier, Rankpfosten, Stäbe,
> Ranken, Erdhügel), Bodenschatten, Wind. Siehe `ARCHETYPE_PROFILES` in `engine/PlantSystem.js`.

### 2.2 Umgesetzte Balancing-Änderungen (Referenz)

- Verlust-Pflanzen gefixt: Spinat (30-90 → 450-1350), Kohl (76-228 → 750-2250),
  Blaubeere (21h-Zyklus/30-90 → 3h-Zyklus/2500-7500), Zucchini-Früchte 150-320
- Endgame-ROI: Dattel 30-60M/Frucht, Kokosnuss 150-375M/Frucht (vorher >1 Jahr ROI)
- Eier-Shop: RARE 35%, EPIC 15%, LEGENDARY 5% pro Rotation (vorher 6/2/0.6% — praktisch nie)
- Brutzeiten nach Rarity: 2min / 5min / 15min / 45min / 2h (vorher pauschal 5min)
- **Wetter-Effekte geben jetzt Verkaufsbonus:** Nass +25%, Gefroren +50%, Aufgeladen +100%, Mondlicht +200%

### 2.3 Content-Ideen v2.1+

- **Quests/Aufträge:** NPC am Marktstand verlangt z. B. „5× Golden Tomate" gegen Bonus-Gold
- **Sprinkler** (Deko mit Funktion): verkürzt Wachstum im 3×3-Umkreis passiv um 10%
- **Mutations-System:** benachbarte gleiche Pflanzen → Chance auf „Riesen"-Variante (2×2-Zelle)
- **Saison-Events:** Winter-Rotation mit exklusiven Samen (nutzt vorhandenes Wetter-System)
- **Pet-Ausbau:** dritte Fähigkeit „Harvester" (erntet automatisch 1 Feld/min)

### 2.4 Overhaul (August 2026) — Phasenplan

**Phase 1 — Optik der Welt · erledigt**

- **Botanische Archetypen** (`ARCHETYPE_PROFILES` in `engine/PlantSystem.js`): 13 Wuchsformen,
  jede der 57 Arten ist einer zugeordnet. Steuert Höhe, Breite, Wind, Schattengröße,
  Fruchtzone und das prozedurale Stützgerüst — dadurch sind Gurke (Spalier), Karotte (Erdhügel),
  Bambus (Halme) und Drachenfrucht (Pfosten) auf einen Blick zu trennen, ohne neue Grafiken.
- **Tiefensortierung:** Pflanzen, Deko, Tiere und der Spieler liegen in *einer* nach Fußpunkt
  sortierten Liste statt in vier getrennten Durchgängen. Der Spieler läuft jetzt hinter hohen
  Pflanzen vorbei. Die Einträge kommen aus einem Pool (kein GC-Druck pro Frame).
- **Verdeckung entschärft:** Höhenspanne auf 0,9–1,75 Kacheln begrenzt (vorher zogen Bäume
  über zwei Reihen). Zusätzlich schwebt über jeder erntereifen Pflanze ein Marker in
  Seltenheitsfarbe, gezeichnet **nach** allem anderen — eine fertige Ernte kann nie verdeckt sein.
- **Bodenschatten** für Pflanzen, Deko, Tiere; **Wind-Sway** um den Fußpunkt (Gerüste bleiben starr).
- **Tiere:** Federung/Neigung unterscheidet Laufen von Grasen, Phasenversatz pro Tier.
- **Wetter-Tints im Inventar** (`STATUS_TINT_STYLES`): Nass/Gefroren/Aufgeladen/Mondlicht waren
  bisher nur auf dem Acker sichtbar, jetzt auch im Rucksack — Farben identisch mit dem Renderer.
- **Deko drehbar:** `R` beim Platzieren, 90°-Schritte. Bei nicht-quadratischen Objekten dreht
  sich die belegte Fläche mit.
- Bäume/Palmen bekommen **kein** prozedurales Gerüst — ihre PNGs enthalten schon einen Stamm,
  ein zusätzlicher ergab einen sichtbaren Doppelstamm.

**Phase 2 — UI/HUD + Shops · erledigt**

- **Neues UI-Kit** unter `ui/`: `gardenTokens.js` (Icons, Rarity-Farben, `HUD_SURFACE`, Formatierer)
  und `gardenUi.jsx` (`GardenModal`, `TabBar`, `PrimaryButton`, `StatLine`, `ProgressBar`, …).
  Die Trennung ist nicht kosmetisch — `react-refresh/only-export-components` verbietet, dass eine
  Datei Komponenten *und* geteilte Werte exportiert.
- **Alle Emojis raus** aus HUD, Shops, Inventar, Meldungen und Changelog; stattdessen lucide-Icons.
  Radien auf `rounded-md`/`rounded-sm`, keine Glow-Schatten, keine Scale-Hovers, keine
  Deko-Animationen — geprüft per DOM-Scan über HUD, Changelog und Einstellungen (jeweils 0 Treffer).
- **Neue Pflanzen-Hover-Karte** (`ui/PlantHoverCard.jsx`): Wuchsform, Einmalernte/Dauerträger,
  Fortschritt, Restzeit, **erwarteter Verkaufswert**, Größe, Veredelungen und eine Zeile je
  Fruchtstand. Der **Wetter-Bonus wird als Prozentwert ausgewiesen** — vorher war er im Code
  vergraben und für den Spieler unsichtbar. Die Karte tickt selbst im Sekundentakt; vorher hing
  der Countdown daran, dass die Maus sich bewegt.
- **Tier-Modal** (`ui/PetDetailModal.jsx`): Klick auf ein platziertes Tier zeigt Fähigkeit,
  Fundhöhe, Takt, Chance und Verkaufspreis, mit Einpacken/Verkaufen. Mit Schaufel bleibt der
  direkte Einpack-Weg erhalten.
- **Geteilte Datenquellen** gegen Auseinanderlaufen: `WEATHER_SELL_BOOST` + `getExpectedSellValue`
  in `engine/PlantSystem.js`, alle Tier-Fähigkeitswerte in neuem `engine/PetSystem.js`.
  Beides lag vorher inline in `GameContainer` und wurde nirgends angezeigt.
- **Changelog** ist jetzt datengetrieben (`CHANGELOG_ENTRIES`) statt handgebautem JSX.

**Phase 3 — Multiplayer + Briefkasten · erledigt**

- **Dauerhafte Welt:** kein Singleplayer-Layout mehr — die Karte hat immer 8 Grundstücke
  (`WORLD_SLOTS`), der Server vergibt den Slot, allein bekommt man Slot 0 (oben links).
  Eigene Tiere und Deko werden auf den zugewiesenen Slot umgeschrieben, damit sie nicht auf
  dem Grundstück des Vorbesitzers stehen bleiben.
- **`Backend/lib/gardenLobby.js`** hängt am bestehenden socket.io (Port 3001, `/socket.io`) —
  kein zweiter Prozess. Positionen laufen über einen gesammelten Server-Tick mit 15 Hz statt
  eines Echos pro Bewegung (bei 8 Spielern × 60 Hz wären das bis zu 3.360 Nachrichten/s).
  Der Client zieht fremde Avatare zwischen den Ticks weich nach.
- **Fremde Äcker** werden aus dem gespeicherten Farm-State als reduzierte Momentaufnahme
  verteilt (nur was der Renderer braucht — **kein** Gold, **kein** Inventar).
- **`Frontend/.../useGardenLobby.js`:** Positionen landen bewusst in Refs, nicht in React-State —
  sonst 120 Re-Renders/s der großen Komponente.
- **Briefkasten** (`Backend/lib/gardenMail.js` + `ui/MailboxModal.jsx`): Gold, Nachricht und
  Samen zwischen Farmen, mit HUD-Knopf und Ungelesen-Zähler.

**Welten mit Code (August 2026)**

`gardenLobby.js` verwaltet nicht mehr eine einzige Welt, sondern eine Map davon:

- **Öffentliche Welt** (`OEFFENTLICH`) — Beitritt ohne Code, existiert dauerhaft.
- **Private Welten** — `garden:create` vergibt einen fünfstelligen Code aus einem Alphabet
  **ohne 0/O und 1/I/L**, damit man ihn vorlesen kann. Beitritt über `garden:join { code }`,
  Groß-/Kleinschreibung egal. Ein unbekannter Code wird abgelehnt statt still eine Welt zu
  erzeugen — sonst legt jeder Tippfehler eine tote Welt an.
- Jede Welt hat **eigene 8 Slots, eigene Anwesenheitsliste und einen eigenen socket.io-Raum**
  (`garden:world:<code>`). Positionen, Acker-Momentaufnahmen und Post-Benachrichtigungen gehen
  ausschließlich an den Raum der jeweiligen Welt.
- Leere private Welten verschwinden von selbst; die öffentliche bleibt. Gedeckelt auf 200 Welten,
  fünf Neugründungen pro Minute und Spieler.
- **Die Farm zieht mit:** der Farm-State hängt an der Twitch-ID, nicht an der Welt. Man nimmt
  seinen Acker in jede Welt mit und bekommt dort einen (möglicherweise anderen) Slot.

Geprüft mit drei echten Socket-Clients (18 Zusicherungen): Slot-Vergabe je Welt, Trennung der
Welten (Bewegung und Anwesenheit lecken nicht hinüber), Wechsel per Code, Ablehnung falscher
Codes, Codes ohne verwechselbare Zeichen.

**Autoritätsmodell (wichtig für spätere Änderungen)**

| Bereich | Autorität |
|---|---|
| Positionen/Anwesenheit | Server verteilt, Client bewegt sich selbst (Cheat schadet nur dem eigenen Avatar) |
| Farm-Inhalte | weiterhin **client-autoritativ** per REST-PUT — unverändertes Bestandsmodell |
| Briefkasten | **vollständig serverseitig** |

Der Briefkasten ist bewusst der einzige serverautoritative Teil, weil dort Wert zwischen zwei
Konten wandert. Konkret abgesichert: Beträge müssen ganzzahlig und > 0 sein (das schließt den
Minusbetrags-Fall aus), der Absender muss die Summe laut **Server**-State besitzen, Abbuchung und
Einlage passieren in einem Schritt, verschenkte Samen müssen im Server-Inventar liegen.

Dabei zwei echte Bugs gefunden und behoben:
1. `compactFarmState` übernahm `mailbox` aus dem Client-Payload — jeder Auto-Save hätte
   zwischenzeitlich eingetroffene Post **gelöscht**, und ein manipulierter Client hätte sich
   selbst Gold-Sendungen eintragen können. Die Mailbox ist jetzt server-eigen.
2. `startWorldBoot` baut `layout.current` neu auf; der Effekt, der das eigene Schild beschriftet,
   lief danach nicht erneut → das eigene Grundstück zeigte „Zu verkaufen".

**Noch client-autoritativ und damit offen:** der eigene Goldstand im Farm-State-PUT. Der
Briefkasten macht das nicht schlimmer, löst es aber auch nicht — dafür müsste die Ernte-/Kauf-Logik
auf den Server wandern (eigenes Projekt).

**Phase 4 — Performance · erledigt**

Gemessen mit einem vollen Acker (196 Pflanzen) über den React-Profiler und einen
rAF-Sampler, jeweils 4 s Leerlauf und ein Schwenk mit 200 Mausbewegungen:

| | Commits Leerlauf (4 s) | React-Zeit | Commits bei 200 Mausbewegungen | React-Zeit | schlechtestes Frame |
|---|---|---|---|---|---|
| vorher | 1541 | 1427 ms | 518 | 875 ms | 22,5 ms |
| nachher | **4** | **23 ms** | **30** | **42 ms** | **15,6 ms** |

Was dahintersteckt:

1. **Nachlade-Schleife im Samen-Shop (der große Brocken).** Der Effekt, der eine fehlende
   Rotation nachlädt, hing am *gesamten* `shopRotation`-Objekt und setzte es selbst neu.
   Kommt eine Rotation ohne Samen zurück, greift die Abbruchprüfung `seeds?.length` nicht →
   holen, setzen, Effekt läuft erneut, in Netzgeschwindigkeit. Das erzeugte ~490
   Zustandsänderungen pro Sekunde und damit praktisch alle Commits im Leerlauf.
   Jetzt: ein Ref begrenzt auf einen Versuch, Abhängigkeit nur noch auf `seeds?.length`.
   **Hinweis:** mit dem aktuellen Backend tritt das nicht auf, weil `generateGlobalShopRotation`
   immer alle 57 Samen liefert. Es ist ein latenter Fehler, den der Prüfstand ausgelöst hat.
2. **Hover aus dem React-Pfad** (`ui/hoverStore.js` + `ui/PlantHoverLayer.jsx`): Der
   Canvas-Handler schreibt in einen externen Store, der nur bei **Zellwechsel** meldet.
   Vorher erzeugte jede Mausbewegung ein neues `hoverInfo`-Objekt und rerenderte die ganze
   Komponente — 200 Bewegungen sind jetzt 30 Commits statt mindestens 200.
   Nebeneffekt: die Karte klebt nicht mehr am Zeiger, sondern steht ruhig an der Zelle.
3. **Interaktions-Ziel ohne Objekt pro Frame:** kein `{...area, dist}`-Spread mehr, und
   `setCurrentInteractable` läuft nur noch bei echtem Typwechsel statt in jedem Frame.
4. **Renderer ohne Zeichenketten pro Pflanze und Frame:** Der Pflanzen-Cache liegt jetzt je
   Grundstück und nutzt den bereits vorhandenen Zellschlüssel; der Zustand wird als 20-Bit-Zahl
   verglichen statt als Template-String. Vorher entstanden bei ~200 Pflanzen und 60 FPS rund
   24.000 Wegwerf-Strings pro Sekunde. Die Windphase kommt aus den Zellkoordinaten statt aus
   einem String-Hash. Cache-Canvases werden wiederverwendet statt pro Signaturwechsel neu erzeugt.

### 2.5 Offene Punkte nach dem Overhaul

Stand August 2026, nach Phase 1–4. Sortiert nach Tragweite, nicht nach Aufwand.

#### A. Client-Autorität über den eigenen Kontostand — **erledigt für Gold, offen für Besitz**

**Umgesetzt (August 2026):** Gold gehört dem Server. `compactFarmState` nimmt `gold` und
`harvestedItems` nicht mehr aus dem PUT entgegen, sondern übernimmt beide aus dem bestehenden
Server-Stand. Jede Bewegung läuft über `POST /api/garden/action` (`Backend/lib/gardenEconomy.js`):

| Aktion | Wer rechnet | Prüfung |
|---|---|---|
| `harvest` / `harvestMany` | Server | Reife aus den Zeitstempeln, Rucksackgrenze, Wert aus `gardenCatalogue` + Sonderform + Wetter |
| `sellAll` | Server | Wert wird aus den gespeicherten Eigenschaften **neu berechnet**, `sellValue` aus dem Client wird ignoriert; Sub-Bonus über die echte Twitch-Abfrage |
| `spend` | Server | ganzzahlig, > 0, gedeckt — kann Gold nur verringern |
| `sellPet` | Server | Tier muss im Server-Stand liegen, Preis aus `Backend/lib/gardenPets.js` |
| `petFind` | Server | würfelt den Betrag selbst, Takt pro Tier serverseitig begrenzt (429 bei zu früh) |

Der Briefkasten war bereits serverautoritativ und bleibt es.

**Weiterhin offen — Besitz statt Wert:**

- `plotPlants`, `inventory`, `petPlacements` und `decoPlacements` kommen weiterhin vom Client.
  Ein manipulierter Client kann sich also *Gegenstände* eintragen und eine Pflanze vorzeitig
  „reif" melden. Aus dem Nichts entsteht dabei kein Gold — der Wert bleibt durch Katalog und
  Feldanzahl gedeckelt — aber der Weg dorthin ist abkürzbar.
- Was ein Kauf *einbringt*, entscheidet noch der Client: `spend` bucht nur ab, der Gegenstand
  wird lokal gutgeschrieben. Nächster sinnvoller Schnitt: `buy`-Aktionen mit Shop-Bestand und
  Preis auf dem Server.
- Pflanzen wachsen clientseitig weiter (siehe C) — ein serverseitiger Wachstumstakt wäre die
  Voraussetzung dafür, `plotPlants` ganz zu übernehmen.
- Die alte v1.1-Changelog-Zeile („Ercheaten komplett unterbunden") stimmt weiterhin nicht
  wörtlich: sie gilt jetzt für Gold, nicht für Gegenstände.

#### B. Assets, die im Live-Betrieb fehlen

- **5 Sounds** werden geladen, existieren aber nicht: `menu_open`, `menu_close`, `kaching`,
  `rain`, `thunder` (siehe 2.1). Menüs und Wetter sind deshalb stumm.
- **Atlas** `atlas/garden_atlas.png` + `.json` werden referenziert, der Ordner existiert nicht.
  Fallback greift, kostet aber ~15 Einzelrequests beim Start.
- ~~Sprites für die Hatch-Typen **Phönix, Tiger, Drache, Götterwesen** fehlen~~ — die vier
  Bilder liegen vor. Sie waren nur unerreichbar, weil die automatische Namensableitung aus
  „Phönix"/„Götterwesen" `phonix.png`/`gotterwesen.png` machte; beide stehen jetzt mit
  explizitem Eintrag in `PET_IMAGE_BY_TYPE`.
- Wetter-Icons, Gieß-Animation, Ernte-Partikel, Shop-Schilder — vollständige Liste mit
  Pixelgrößen in 2.1.

#### C. Multiplayer-Ausbau

- **Fremde Äcker sind reine Anzeige.** Man sieht sie, kann aber nicht darauf reagieren
  (kein Gießen für andere, kein Besuchen-Bonus).
- **Briefkasten am fremden Grundstück:** aktuell läuft alles über den HUD-Knopf. Der Renderer
  zeichnet fremde Briefkästen bereits — ein Klick darauf könnte das Sendefenster mit dem
  Besitzer vorbelegen.
- **Welt voll (8/8):** man landet als Zuschauer ohne Grundstück. Es gibt bisher keine
  Warteschlange; man kann dann aber eine private Welt aufmachen oder einer per Code beitreten (siehe 2.4).
- **Pflanzen laufen clientseitig weiter.** Zwei Tabs derselben Person können auseinanderlaufen;
  gewinnt der letzte PUT.

#### D. Kleinere offene Punkte

- **Lobby-Bildschirm** wurde bewusst nicht angefasst (nutzt weiterhin das Aurora-System). Wenn er
  zum neuen HUD passen soll, ist das ein eigener, kleiner Schritt.
- **15 `react-hooks/exhaustive-deps`-Warnungen** in `GameContainer.jsx` — alle aus der Zeit vor
  dem Overhaul. Keine davon ist aktuell ein Fehler, aber jede ist eine potenzielle Stale-Closure.
- **`GameContainer.jsx` ist weiterhin ~4.300 Zeilen.** Shops, Inventar und Inkubator ließen sich
  nach `ui/` ziehen wie Hover-Karte, Tier- und Briefkasten-Fenster.
- **`harvestFlashes`** wird in `GameContainer` gepflegt, aber nirgends mehr gezeichnet (der
  Renderer-Aufruf ist entfallen) — entweder umsetzen oder entfernen.
- **Deko-Drehung** wirkt auf platzierte Objekte; das Vorschaubild in der Hand dreht sich nicht mit.
- **`_drawImageOrEmoji`/Atlas-Pfad** ist toter Code, solange kein Atlas existiert.

#### E. Ideen, die durch den Umbau erst möglich wurden

- Die Archetypen (`ARCHETYPE_PROFILES`) könnten Spielmechanik tragen statt nur Optik:
  Rankpflanzen brauchen ein gekauftes Spalier, Bäume belegen dauerhaft eine Zelle.
- Der Briefkasten ist die vorhandene Grundlage für **Quests/Aufträge** (2.3) und für Handel.
- Die Tiefensortierung erlaubt jetzt mehrzellige Objekte (2×2-Bäume, „Riesen"-Mutationen aus 2.3),
  ohne dass die Zeichenreihenfolge kaputtgeht.

### 2.6 Performance-Notiz: public/ vs. src/

Empfehlung: **Bilder bleiben in `public/`.** Gründe:
1. Die Pfade werden dynamisch zusammengesetzt (`/garden-assets/plants/${seedId}/plant.png`) und
   kommen z. T. **aus dem Backend/Savegames** — statische `import`s kann Vite dafür nicht auflösen.
2. Der eigentliche „Performance-Bug" war, dass der Ordner unter `public/assets/garden-assets` lag,
   der Code aber `/garden-assets/...` lädt → **jedes Bild war ein 404** (Emoji-Fallbacks + sinnlose
   Requests). Das ist behoben (Ordner verschoben).
3. Sinnvoller nächster Schritt: Cache-Header (`Cache-Control: public, max-age=31536000, immutable`)
   für `/garden-assets/` im Hosting/NGINX setzen + optional den Atlas bauen (2.1).
