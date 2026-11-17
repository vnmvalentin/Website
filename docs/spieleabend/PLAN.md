# Spieleabend — 3D-Spielzimmer mit Tisch (ersetzt Connect 4)

Stand 17.11.2026, Spur D. Ausbauplan-Punkt „brettspiele“; die ursprüngliche Idee (Mühle, Dame, Reversi, Halma als
2D-Ecke) ist durch die Idee des Nutzers ersetzt:

> wieder 3D-Lobby … Menü ist direkt in der Lobby integriert: Man lädt Leute ein → die spawnen an einem Tisch. Je nach
> Spiel andere Kamera. 4 gewinnt hat das Plastikbrett in der Mitte vom Tisch stehen mit den Kreisen zum Einsetzen
> (man sitzt dem Gegner gegenüber). Weitere: z. B. Mensch ärgere dich nicht mit Würfel und Animation, bis zu 4.
> Gemeinsames Drawpad (vielleicht auch Impostor mit Zeichnen → ein Spieler kriegt kein Wort, die anderen kriegen
> eins → alle müssen nacheinander z. B. eine Linie zeichnen).

Name „Spieleabend“ (vom Nutzer gewählt, 17.11.2026). Figuren am Tisch: die Worldflip-Blobs mit ihrem Skin-Editor (vom Nutzer gewählt).

## Was es schon gibt

- **Connect 4** (`pages/Connect4`, `Backend/connect4/socket.js`): Raumcode, zwei Plätze, Zuschauer, Gnadenfrist bei
  Verbindungsabbruch, Revanche; meldet Räume/Partien an den Admin (`spielStatistik`). Wird ersetzt — `/connect4` leitet
  danach ins Spielzimmer mit 4 gewinnt weiter, die alte Seite fällt weg.
- **3D-Tisch mit Menü in der Szene**: Sacrifice & Sigils „Am Tisch“ (`ui/table/scene/tableRoom.js`, TableLobby/TableMenu)
  — Vorbild für „Menü direkt in der Lobby“.
- **Figuren am Tisch**: Worldflip (`scene/avatars.js`): schwebende Blobs mit Hut/Gesicht aus einem Skin-Editor,
  Gesten (am Zug, Sieger …). Wiederverwendbar als Spielerfiguren.

## Aufbau

- **Server** `Backend/spieleabend/`: ein Raum-Verwalter (Code, bis 4 Plätze + Zuschauer, Host wählt das Spiel,
  Gnadenfrist, Revanche) und je Spiel ein Regel-Modul ohne Netz (`vierGewinnt.js`, `maedn.js`, `zeichnen.js`) —
  server-autoritativ wie Connect 4, alles im Speicher. Ereignisse `sa:*` über den Hauptprozess (socket.io wie Connect 4).
  Admin-Statistik über `meldeSpielAn` / `zaehlePartie`.
- **Client** `pages/Spieleabend/`: eine three.js-Szene „Zimmer“ (Tisch, Stühle, Licht), Figuren auf den Plätzen, je
  Spiel ein Tisch-Aufbau (Brett/Würfel/Zeichenblatt) und eine Kameraposition. Menü (Spiel wählen, Einladen, Start,
  Plätze) als Gegenstände/Schilder am Tisch, dazu eine schmale DOM-Leiste für Link und Name.
- **Bots** füllen leere Plätze bei 4 gewinnt und Mensch ärgere dich nicht (Connect 4 hatte keine KI — der Bot ist neu:
  Negamax mit Alpha-Beta, Stufen leicht/mittel/schwer). Das Zeichenspiel braucht echte Mitspieler (ab 3).
- Kein „Partien über Tage“ (vom Nutzer abgelehnt), keine Freundesliste (abgelehnt): eingeladen wird per Link/Code.

## Phasen

1. **Zimmer + 4 gewinnt** (fertig 17.11.2026, siehe „Stand Phase 1“). Raum-Verwalter, Szene mit Tisch, Figuren setzen sich beim Beitreten, Menü am Tisch,
   Einladen per Link. 4 gewinnt: Plastikbrett steht in der Tischmitte, man sitzt sich gegenüber, Steine fallen
   sichtbar in die Spalten, Gewinnreihe leuchtet; Bot für allein. `/connect4` leitet weiter.
2. **Mensch ärgere dich nicht** (fertig 17.11.2026, siehe „Stand Phase 2“) (2–4, Bots füllen auf): Brett liegt auf dem Tisch, Kamera schräg von oben, Würfel
   rollt sichtbar, Figuren hüpfen Feld für Feld, Rauswerfen mit Animation.
3. **Zeichnen** (Zeichen-Hochstapler fertig 17.11.2026, siehe „Stand Phase 3“; freies Zeichnen ohne Regeln nicht gebaut): Zeichenblatt in der Tischmitte. Freies gemeinsames Zeichnen und „Zeichen-Hochstapler“: alle außer einem
   bekommen dasselbe Wort, reihum zeichnet jeder einen Strich (zwei Runden), dann zeigt jeder auf den Verdächtigen;
   wird der Hochstapler gefunden, darf er das Wort raten.
4. **Feinschliff**: Handy/Touch, Klänge, Englisch, Startseiten-Karte, Admin-Zahlen, Update-Log.

## Stand Phase 1 (gebaut 17.11.2026, wartet auf Deploy)

- Server `Backend/spieleabend/`: `zimmer.js` (createZimmer({ send, now, random }), ohne Netz testbar), `socket.js`
  (Ereignisse `sa:*`, Protokoll im Kopf), `spiele/vierGewinnt.js` (Regeln + Bot, Schnittstelle für weitere Spiele im
  Kopf). Bis 6 Figuren im Zimmer, danach Zuschauer ohne Figur. Wer kommt, setzt sich auf den ersten freien Spielstuhl;
  Gastgeber = wer am längsten da ist. Getrennt: Platz 2 min reserviert, am Zug nach 15 s vertritt ein Bot; Gehen in
  der Partie → Bot übernimmt. Nach dem Ende Wartestand mit stehendem Brett, nächste Partie beginnt der andere Platz.
  Tests: `npm test -- spieleabend` (Backend).
- Client `pages/Spieleabend/`: `Zimmer.jsx` (eine Seite für `/spieleabend` und `/spieleabend/:code`; ohne Code wird
  ein Zimmer angelegt und die Adresse ersetzt), `scene/zimmerSzene.js` (Figuren, Stühle, Kamera, Klicks, Anker für
  Schilder), `scene/raum.js` (Zimmer und Tisch), `scene/vierGewinnt3d.js` (Brett), `spiele.js` (Sitzordnung, Farben,
  Kamera je Spiel). Knöpfe hängen als HTML-Schilder an 3D-Ankern (`person:<id>`, `bot:<platz>`, `stuhl:<i>`, `brett`).
- Tisch mit 8 Positionen; 4 gewinnt: Spielstühle 0 und 4, Zuschauer seitlich (2, 6, …) ein Stück abgerückt. Kamera
  hinter dem eigenen Spielstuhl; Zuschauer schauen schräg hinter Rot hervor. Blobs ×1,25, Brett so klein, dass man den
  Gegner darüber sieht. Am Handy: erst Spalte zeigen, zweites Tippen wirft ein.
- Prüfstand: Server-Attrappe nur mit sa:-Sockets auf 3341, Vite 5340 (Proxy /socket.io); Dev-Server legt
  `window.__saSpalte(c)` an (Bildschirmpunkt einer Spalte). Vorschaubild: `node scripts/vorschaubilder.cjs spieleabend`.
- Connect 4 ist entfernt (`/connect4` und alte Einladungen leiten auf ein neues Zimmer), Admin-Statistik zählt
  `/connect4`-Aufrufe beim Spieleabend mit.

## Stand Phase 2 (gebaut 17.11.2026, wartet auf Deploy)

- Regeln `Backend/spieleabend/spiele/maedn.js` (klassisch, ohne Schlagzwang; Figur-Stand -1 Haus, 0–39 Runde,
  40–43 Ziel). Nur ein möglicher Zug → der Server führt ihn beim Würfeln gleich aus; gleichwertige Hausfiguren zählen
  als eine Wahl. `animMs(z)` meldet, wie lange der Browser zeigt (Würfel 950 ms, je Feld 170 ms, Heimflug 650 ms) —
  so lange wartet ein Bot. Bot: leicht 60 % zufällig, mittel nach Wert (schlagen, raus, ins Ziel), schwer zusätzlich
  nach Gefahr (wer kann mich im nächsten Wurf erreichen).
- Zimmer: Spiele mit `minSpieler` < `plaetze` erlauben „Leer lassen“ je Stuhl (`sa:leer`), Start braucht mindestens
  `minSpieler` Besetzte; leere Plätze überspringt das Spiel. Spielwahl als Umschalter im Schild am Brett.
- Szene: jedes Spiel ist ein Spielobjekt mit gleicher Schnittstelle (`createVierGewinntSpiel`, `createMaednSpiel`:
  setze/treffer/hover/klick/update/anker/restZeit/dispose); Wechsel = altes schrumpft, neues wächst. MÄDN-Stühle auf
  den Positionen 0, 6, 4, 2 (reihum im Uhrzeigersinn wie die Figuren laufen), Brettgruppe um 90° gedreht.
  Kamera: Blickwinkel bleibt beim Einpassen, hochkant steiler (`steil`), nie durch Decke oder Wand.
- Prüfstand: `window.__saAnker("figur:<platz>:<figur>")` und `window.__saView()` im Dev-Server.

## Zimmer zum Herumlaufen (Nutzerwunsch 17.11.2026, gebaut)

- Wer ins Zimmer kommt, steht (nicht mehr automatisch am Stuhl) und läuft als Blob: WASD/Pfeile oder Klick auf den
  Boden, Hindernisse in `raum.js HINDERNISSE`, außen um den Tisch herum. Position meldet der eigene Browser (`sa:ort`,
  ~10/s, „volatile“), der Server begrenzt und reicht sie weiter; der ganze Zimmerstand trägt `leute[].ort` für Neue.
  Stuhl anklicken: hinlaufen, dann `sa:platz`; der Blob hüpft auf den Stuhl, beim Aufstehen hinter den Stuhl.
  Beim Start ohne Sitzende setzt sich der Gastgeber.
- Kamera im Stehen: folgt schräg von oben; Wände, Decke und Hängelampe zwischen Kamera und Zimmer werden ausgeblendet
  (Puppenhaus). Am Stuhl wie bisher je Spiel.
- Spieleregal (`regal.js`) an der Rückwand: Kartons je Spiel mit Titelbild, Klick = Spielwahl (nur Gastgeber).
  Couchtisch mit Chips: Klick → hinlaufen, Chip fliegt zum Mund, Knuspern (`sa:geste chips`, für alle).
- Fenster: echte Öffnung in der Rückwand mit Laibung, Sprossen, Glas, Kerze und Kaktus; draußen (`draussen.js`)
  Himmel, Mond, verschneite Häuser, Tannen, Schneefall mit echter Tiefe.
- Fehler behoben: Der Stuhl auf Platz 0 stand verkehrt herum (lookAt + Nullsetzen der Achsen); Stühle drehen jetzt
  direkt über den Winkel.

## Ich-Sicht, Umkleide, Spaß (Nutzerwunsch 17.11.2026, gebaut)

- Ich-Sicht ist Standard beim Laufen (Augenhöhe, W/S vor/zurück, A/D seitwärts, Pfeile/Q/E drehen, Maus/Finger
  ziehen = umschauen), Taste V oder Knopf oben wechselt zur Ansicht von schräg oben (`spieleabend.ansicht` im Browser).
  Der eigene Blob liegt in der Ich-Sicht auf Ebene 1: die Kamera sieht ihn nicht, der Spiegel (three Reflector) schon.
- Umkleide (`raum.js`, linke Wand vorn): Standspiegel, Paravent, Kleiderständer, Schild, Matte. Klick → hinlaufen →
  `ui/Umkleide.jsx` (Name, Farbe, Hut, Gesicht); der eigene Blob trägt die Auswahl sofort (`anprobieren(skin)`),
  „Fertig“ schickt `sa:profil`. Ersetzt den früheren Knopf „Dein Blob“.
- Chips machen dick: Server zählt `bauch` je Person (max. 10, nach 45 s ohne Chips −1 alle 20 s), steht im Zimmerstand
  und kommt mit `sa:geste chips`. Breite ×(1 + 0,07·Bauch), Tempo bis −35 %, bei vollem Bauch manchmal ein Rülpser.
- Kissenschlacht: `sa:geste { art: "hau", ziel }` (alle 650 ms), Klick auf einen Blob oder F. Hauer schwingt ein
  Kissen, beim Getroffenen Federn und Sterne; dessen eigener Browser schubst ihn weg (Position gehört ihm).
- Klänge: Würfel und Chips sind CC0-Aufnahmen in `public/media/spieleabend/klang` (Kenney „Casino Audio“,
  StarNinjas „7 eating crunches“), Kissen und Rülpser erzeugt; ohne Aufnahme springt der erzeugte Klang ein.
- Regal: Bücher stehen nur noch, wo sie ganz hineinpassen; statt schräger Bücher liegende Stapel.

## Maus wie im Ego-Spiel, Tür, Pflanzen (Nutzerwunsch 17.11.2026, gebaut)

- Ziehen zum Umschauen am PC ersetzt (wirkte verbuggt): In der Ich-Sicht fängt der erste Klick die Maus (Pointer
  Lock), `movementX/Y` drehen Blick und Neigung, Esc gibt frei. Hinsetzen, Umkleide und Ansicht von oben geben die
  Maus ebenfalls frei. Am Handy bleibt Wischen.
- Fadenkreuz (`.sa-faden` in Zimmer.jsx): jedes Bild ein Strahl durch die Bildmitte (`treffer("mitte")`), Änderung
  per `onZiel` an die Seite, die schreibt darunter, was ein Klick tut. Mit gefangener Maus wirkt ein Klick NUR auf
  Ziele (Stuhl, Karton, Chips, Blob, Umkleide), nie auf den Boden: sonst schickten schnelle Klicks auf die Chips den
  Blob dorthin, wohin der Blick beim Hinlaufen gerade schwenkt.
- Chips im Dauerfeuer: lokale Sperre 1,25 s, alter Chip und Krümel werden vor dem nächsten Bissen weggeräumt, Krümel
  bleiben am Boden liegen.
- Neue Leute kommen durch die Tür (vorne rechts, `TUER` in raum.js und Backend `zimmer.js`) und stehen, statt hinter
  den Stühlen zu erscheinen, als säßen sie schon.
- Regal: nur noch drei Fächer, Pokal und Grünlilie stehen oben auf dem Deckel (ragten vorher durch das flache vierte
  Fach). Pflanzen aus gebogenen Blättern mit Textur (`scene/pflanzen.js`: Bogenhanf in der Ecke, Grünlilie).

## Spaß-Runde 2 (Nutzerwunsch 17.11.2026, gebaut)

- Gesten-Rad (`scene/gesten.js` + `ui/GestenRad.jsx`): winken, tanzen, jubeln, schmollen, klatschen, Mittelfinger
  (verpixelter Zensurbalken + Piep — so auch im Stream vorzeigbar), zeigen (Ring am Zielpunkt, `punkt` geht an den
  Server). Taste G halten (Maus wählt bei gefangenem Zeiger über den Mausweg, sonst per Zeiger), 1–7 direkt, Knopf
  „Gesten“. Die Hände der Blobs kommen aus `createAvatar().hands` (additiv in Worldflip/avatars.js). Ich-Sicht: zwei
  kleine Hände vor der Kamera (Ebene 2, der Spiegel sieht sie nicht).
- Bauch bis 40 (fünfmal so breit, am Spielstuhl gedeckelt auf 1,9), einer mehr → `platzt` (Server setzt 0, Luftballon-
  Flug im Browser). Kollision wächst mit (`bauchPlatz`, höchstens 0,9).
- Limo (Couchtisch): `sa:geste limo` → `hicksBis`; der Server-Tick schickt `hicks` an alle (auch an den Trinker).
- Sofa: `sa:sofa`, drei Plätze (`raum.js sofaPlatz`), eigene Kamera hoch hinter der Lehne, Mausrad = Blickwinkel.
- Licht: `sa:licht` (Zimmerstand `licht`), aus = Mondkegel mit Schatten (Fensterkreuz), Kerze weiter, Taschenlampen
  (`scene/taschenlampen.js`: eigene an der Kamera mit Schatten, 5 feste Lichter für die nächsten anderen — die Zahl der
  Lichter ändert sich nur beim Schalten, sonst würde three.js ständig neu übersetzen). Blick hoch/runter geht als `n`
  mit `sa:ort` mit.
- Fenster: `sa:fenster`, untere Flügel schwingen nach innen (Kerze/Kaktus an die Enden der Bank gerückt), Flocken
  (Punkte mit runder Textur), Wind; `sa:schnee` holt am offenen Fenster 3 Bälle (Server prüft Nähe), geworfen wird
  wie beim Kissen (`sa:geste schnee` mit `ziel` oder `punkt`).
- Katze (`Backend/spieleabend/katze.js` + `scene/katze.js`): Server wählt Modus/Ziel (ort, stuhl, fensterbank,
  betteln, schnurren), Browser läuft selbst hin. `sa:katze` geht NICHT in den Zimmerstand der Seite (sonst setzte die
  Szene alle Blobs auf ältere Positionen zurück).
- Klicks: das nächste Ziel gewinnt; schnelle Klicks nur aufs selbe Ziel (`klickSperre`); nach dem Hinlaufen schaut
  man aufs Ziel (`blickAuf`), damit Dauerklicks nicht das Sofa hinter der Schale treffen.

## Runde 3: Menü, Hinweise in Reichweite, Bauch (Nutzerwunsch 17.11.2026, gebaut)

- Esc öffnet das Menü (`ui/Menue.jsx`): Ton/Lautstärke (sound.js `setLautstaerke`, `abonniere` hält die Kopfleiste
  gleich), Mausgeschwindigkeit (prefs.js, `szene.setMausTempo`), Leute + Hinauswerfen (Gastgeber; `sa:kicken`,
  Token kommt in `room.rausgeworfen`, `sa:rausgeworfen` an den Betroffenen), Einladungslink. Der Browser löst die
  Mauszeiger-Sperre bei Esc selbst: `onSperre` erkennt, dass nicht die Szene sie gelöst hat (`selbstFrei`), und
  öffnet das Menü. Hinsetzen, Sofa, Umkleide lösen sie selbst → kein Menü. „Weiter“ fängt die Maus wieder.
- Im Stehen keine Schilder (nur Namen der Leute; Minka meldet sich, wenn sie gestreichelt werden will). Das Fadenkreuz
  zeigt nur Dinge in `GREIFWEITE` (3,3 vom Auge, Blobs 2,8), Klick oder E benutzt sie ohne Hinlaufen (`direktModus`);
  Q/E drehen nicht mehr. Stuhl-Schilder, Brett-Karte (Start, Bots, Spielwahl) erst im Sitzen; Ergebnis für Stehende
  als Hinweis.
- Bauch nur am Körper: `createAvatar().setBauch(breite, hoehe)` (additiv in Worldflip/avatars.js) skaliert den
  Körper, hebt Kopf/Gesicht/Hut/Krone; ab Breite 1,5 feineres Kapsel-Gitter. Breite 1 + 0,1·Bauch, Höhe 1 + 0,03·Bauch
  (bei 40: Kugel, Kopf gut 2 Einheiten höher, Augenhöhe in der Ich-Sicht steigt mit). Hände schiebt gesten.js
  (`mitBauch`) nach außen; Umweg um den Tisch wächst mit (`weg(…, extra)`), sonst blieben Dicke beim Hinlaufen hängen.
- Nachtrag (Nutzer: „zu dick → nicht mehr an die Chips, nicht auf den Teppich“): Kollision wächst mit dem Bauch nur
  noch um höchstens 0,3 (`bauchPlatz`) — der Bauch ragt durch Möbel; mit 1,3 war Tisch+Stühle größer als der Teppich.
  Die Greifweite wächst mit Kopfhöhe und Bauch (`fadenZiel`), sonst lag die Schale ab ~30 Chips außer Reichweite und
  der Platz-Chip war unerreichbar. `klickSperre` gilt nur fürs Hinlaufen, nicht für direkte Aktionen am Fadenkreuz.

## Stand Phase 3 (gebaut 17.11.2026, wartet auf Deploy)

- `Backend/spieleabend/spiele/zeichnen.js`: Rollen (ein Hochstapler kennt nur die Kategorie), Phasen wort → zeichnen
  (zwei Runden, je Platz ein Strich, 25 s) → abstimmen (45 s, eindeutige Mehrheit nötig) → raten (30 s, ein
  Tippfehler ab 5 Buchstaben zählt) → ende. Fristen über `tick(z, jetzt)`, je Empfänger eigene `sicht(z, platz)`,
  Strich-Stücke als `sa:live` nur an die anderen. Spiele mit `ohneBots`: leere Stühle bleiben leer, ab `minSpieler`.
- Client `scene/zeichnen3d.js`: Blatt mit Karos, Striche per Ziehen (Szene leitet Zeiger an `ziehenStart/ziehen/
  ziehenEnde`), Buntstift in der Farbe des Zeichners. Seite: Rollen-Tafel oben, Abstimm-Schilder an den Köpfen,
  Rate-Feld in der Mitte, Ergebnis am Blatt. Sieger mehrerer Plätze über `sicht.siegerListe`.
- Phase 4 (Feinschliff) noch offen: Englisch, Spiele ans Konto.

## Entschieden (Nutzer, 17.11.2026)

- Name: Spieleabend.
- Figuren: Worldflip-Blobs (Skin aus dem vorhandenen Editor).
