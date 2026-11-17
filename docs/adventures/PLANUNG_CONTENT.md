# adVentures — Content-Update: Ideen und Reihenfolge

Stand 04.10.2026. Grundlage ist der Umbau vom selben Tag (Waffen/Talente beim Stufenaufstieg, Item-Kärtchen, Pixelsymbole,
Punkte-Bestenliste, härtere Skalierung).

**Teil A ist gebaut (04.10.2026)**, Teil B nicht. Wo es steht:
- Evolutionen: `data/weapons.js` (EVOLVED), Verhalten `engine/weapons.js`, Angebot `engine/levelup.js`
- Blutmond / Einkreisung / Champion: `engine/horde.js` (Blutmond-Kills geben nur 60 % Beute — sonst wurde es zu leicht)
- Neue Elite-Eigenschaften: `data/enemies.js` + `engine/enemies.js` (Liste `e.affixes`, Champions haben zwei)
- Schreine: `engine/interact.js`, Platzierung `engine/worldgen.js`; Schicksalsschrein nutzt das Kartenfenster (`openItemChoice`)
- Items: `data/items.js` (Glückspilz, Rückstoßhandschuh, Kettenhemd, Kompass, Gierfinger, Zwillingsstein, Erste Hilfe)
- Tageslauf, Erfolge, Albtraum+, Wochen-/Kit-Filter, Verlauf: `Backend/adventure/meta.js` + `routes.js`; Frontend
  `screens/Achievements.jsx`, `screens/History.jsx`, `KitSelect.jsx`, `MainMenu.jsx`; Albtraum+-Werte `engine/ascension.js`
- Farbvarianten: `data/skins.js`, Vorschau `ui/TintedSprite.jsx`
- Sound + Einstellungen + Todesursache: `ui/sound.js`, `ui/settings.js`, `engine/combat.js` (describeAttacker)

Abweichungen vom Plan: Erfolge schalten nur Farbvarianten frei (keine Spielvorteile); die Einstellungen liegen im
Pausenmenü; der Tageslauf erlaubt beliebig viele Versuche, der beste zählt.

Wichtigste Einschränkung: Fast alle vorhandenen Sprites unter `public/media/adventure/` sind schon im Spiel. Neue Gegner,
Bosse, Welten und Kits brauchen **neue Grafiken** — darum ist die Liste getrennt in „geht mit dem, was da ist" und
„braucht Bilder". Woher die Bilder kommen sollen, ist offen (siehe Fragen unten).

Aufwand: S = ein Abend, M = ein paar Abende, L = eigenes Projekt.

---

## A. Geht ohne neue Grafiken

### Waffen-Evolutionen (M) — größter Spaß pro Aufwand
Waffe auf Stufe 5 + ein bestimmtes Talent → beim nächsten Stufenaufstieg wird eine Evolution angeboten (wie bei Vampire
Survivors). Gibt dem Wählen ein Ziel. Zeichnung per Canvas wie die jetzigen Waffen.

| Waffe | + Talent | Evolution |
|---|---|---|
| Wurfdolche | Präzision | **Tausend Klingen** — Dolchfächer, Krits werfen nach |
| Feuerkugeln | Weite | **Sonnenkranz** — Kugeln explodieren beim Treffer |
| Donnerkeil | Hast | **Gewittersturm** — Dauerregen aus Blitzen um dich |
| Glutaura | Vitalität | **Höllenherz** — Aura heilt dich pro getroffenem Gegner |
| Bumerang | Vielfalt | **Kriegsrad** — kreist dauerhaft um dich |
| Säureflasche | Wissen | **Seuchenkessel** — Pfützen wandern zum nächsten Gegner |
| Kettenpeitsche | Macht | **Drachenschweif** — Hiebe in alle vier Richtungen |
| Schockwelle | Bollwerk | **Erdbeben** — Ring betäubt und lässt Felsen fallen |

### Horde-Momente (M)
- **Blutmond-Welle**: alle ~3 Minuten 30 s lang dreifacher Spawn, Bildschirm rot getönt, danach eine Kiste gratis.
- **Einkreisung**: Gegnerring schließt sich langsam um dich (klassisch Vampire Survivors) — man muss eine Lücke schlagen.
- **Champion**: alle ~4 Minuten ein großer Elite mit zwei Eigenschaften und Lebensbalken oben, lässt ein seltenes Item fallen.

### Neue Elite-Eigenschaften (S)
Spiegelnd (wirft jedes 5. Geschoss zurück), Vampirisch (heilt sich bei Treffern), Teilend (zerfällt in zwei kleine Kopien),
Hastig (doppelt so schnell, halbes Leben), Beschwörend (ruft Skelette). Nur Färbung + Verhalten, keine neuen Bilder.

### Neue Schreine (S–M)
- **Schicksalsschrein**: 1 aus 3 Items wählen (gleiches Kartenfenster wie beim Stufenaufstieg).
- **Opferaltar**: 20 % max. Leben für ein legendäres Item.
- **Fluchschrein**: die Welt wird härter, dafür +50 % Gold und Erfahrung bis zum Teleporter.
- **Würfelschrein**: tauscht ein zufälliges Item gegen eins einer höheren Seltenheit.

### Mehr Items (S je Item)
Ideen: Glückspilz (Krits geben Gold), Rückstoßhandschuh, Zwilling (jede 10. Waffenauslösung doppelt), Kettenhemd
(−1 Schaden pro Treffer pro Stapel), Erste Hilfe (Heilung unter 25 % Leben, Abklingzeit), Kompass (Teleporter von Anfang
an sichtbar), Gierfinger (Gold zieht aus doppelter Entfernung an). Symbole einfach in `ui/pixelIcons.js` ergänzen.

### Motivation über den Lauf hinaus (M)
- **Tageslauf**: gleicher Seed für alle, eigene Tages-Bestenliste. Die Seed-aus-Datum-Idee gibt es schon bei Seed Runners.
- **Erfolge** (z. B. „Thunderwing mit dem Ninja", „1000 Kills in einem Lauf", „ohne Item gewinnen") — schalten Farbvarianten
  der Kits frei (siehe unten, braucht keine neuen Bilder).
- **Albtraum+ Stufen** (wie Ascension): jede Stufe ein zusätzlicher Nachteil, Punkte-Multiplikator steigt.
- **Bestenliste filtern**: pro Kit, pro Woche.
- **Laufverlauf**: letzte 20 Läufe mit Waffen, Items, Todesursache.

### Gefühl (S–M)
- **Sound**: Treffer, Level-up, Item, Boss — WebAudio wie bei Clash Royale (`pages/ClashRoyale/ui/sound.js`), Lautstärke im Pausenmenü.
- Einstellungen: Schadenszahlen aus, Bildschirmwackeln aus, Hitstop-Dauer.
- Todesursache auf dem Endbildschirm („Getötet von: Feuermagier (Elite, Feurig)").

### Farbvarianten der Kits als Skins (S)
`render/assets.js` kann Sprites schon einfärben (`tinted`). Pro Kit 2–3 Farbvarianten (Gold, Schatten, Frost) als
Belohnung für Erfolge — sofort spielbar, keine neuen Zeichnungen.

---

## B. Früher: "braucht neue Grafiken" — seit dem flachen Stil alles im Code zeichenbar

**Gebaut (04.10.2026):** 6 neue Gegner — Zombie, Schildträger (Verlies), Fledermaus (Höhle), Sandwurm (Wüste),
Lawinenbär (Frost), Mörserkobold (Lava) — und 3 neue Bosse als zweite Wahl ihrer Welt: Gefallener Ritter (Verlies),
Pharao Ankhamun (Wüste), Lavawurm (Lava), jeder mit eigenem Boss-Item. Figuren in `render/flat/creatures.js`,
Verhalten in `engine/enemies.js` (KI shield/swarm/burrow/roller/mortar) bzw. `engine/bosses/`.
Noch offen aus dieser Liste: neue Welten, ein zweiter Boss für den Frostgipfel, neue Kits.

### Neue Gegner (M pro Welt)
Verhalten, das es noch nicht gibt — je Welt 1–2 neue:
- **Schildträger** (Verlies): blockt Geschosse von vorn, muss umlaufen werden.
- **Schwarmfledermäuse** (Höhle): 8–12 winzige, schnelle Gegner auf einmal — echte Horde.
- **Sandwurm** (Wüste): taucht unter, Telegraph am Boden, schnappt hoch.
- **Lawinenbär** (Frost): rollt als Kugel und prallt an Hindernissen ab.
- **Mörser-Kobold** (Lava): schießt im Bogen, Einschlag als Telegraph — zwingt zum Bewegen.

### Neue Welten (L je Welt)
Sumpf (Gift-Pfützen am Boden, Nebel), Pilzwald (Sporen verlangsamen), Uhrwerkturm (rotierende Fallen), Friedhof
(Gräber spawnen Skelette, wenn man vorbeiläuft). Jede braucht Boden, 2–3 Hindernisse, 3–4 Gegner und einen Boss.

### Neue Bosse (L)
Zweiter Boss pro Welt, damit Läufe sich unterscheiden (die Höhle hat schon zwei). Ideen: Gefallener Ritter (Verlies,
Duell mit Paraden), Pharao (Wüste, Sarkophage als Adds), Lavawurm (Lava, Körper aus Segmenten).

### Neue Kits (M–L)
Mönch (Nahkampf-Kombos), Nekromantin (Beschwörerin — Skelett-Armee), Alchemist (Tränke werfen, Effekte mischen),
Jägerin (Fallen + Begleittier). Jedes braucht 3–4 Sprites (Stand, Lauf, Porträt) und vier Fähigkeiten.

---

## Vorschlag Reihenfolge

1. **Evolutionen + Champion + neue Elite-Eigenschaften**: mehr Tiefe sofort, null Grafikbedarf.
2. **Sound + Todesursache + Einstellungen**: das Spiel fühlt sich fertiger an.
3. **Tageslauf + Erfolge + Farbvarianten**: Grund, wiederzukommen.
4. **Neue Schreine + Items**.
5. **Eine neue Welt komplett** (Gegner, Boss, Boden) als Muster, danach die nächsten.
6. **Neue Kits**.

## Offene Fragen

- **Grafiken**: Selbst zeichnen, Asset-Pack kaufen oder KI-Bilder über die Pipeline von Sacrifice & Sigils
  (`art:generate`)? Davon hängt Teil B ab.
- **Balance-Ziel**: Soll ein normaler Spieler Thunderwing beim 5.–10. Lauf schaffen oder deutlich später?
  Gemessen wird mit `engine/__tests__/balance.mjs`.

## C. Nach dem Sieg: Tiefe und Wendungen (16.11.2026, Ausbauplan „av-meta“)

Tageslauf, Albtraum+ 1–5, Erfolge mit Farbvarianten und der Verlauf standen schon (Teil A). Rückmeldung aus der Abnahme:
„Man fühlt sich sehr stark am Ende … durch mehr Stages im Endgame könnte man sehen, wie weit man kommt.“ Gewählt:
**Tiefe + Rangliste** und **Zyklen mit Wendungen**. Zyklus 1 bleibt unverändert (abgenommen).

- **Tiefe** = die Welt, in der ein Lauf endet, über alle Zyklen gezählt (1–6 erster Zyklus, 7 = Zyklus 2 Welt 1).
  Server: `depthBest` je Konto, Bestenliste `?scope=tiefe` („Am weitesten“: Tiefe, dann Punkte; Entspannt zählt nicht),
  Erfolge zyklus3/tiefe15/zyklus4/tiefe20 an den geprüften Welten. Spiel: Tiefe + Bestmarke im HUD (ab Zyklus 2),
  Banner bei neuer Bestmarke, Siegfenster stellt „Weiter“ vor „Beenden“ und nennt die Wendung des nächsten Zyklus,
  Endbildschirm und Verlauf zeigen die Tiefe.
- **Wendungen** (`engine/twists.js` TWISTS): ab Zyklus 2 je Zyklus eine aus dem Seed (Tageslauf: für alle gleich), nie zweimal
  hintereinander — Hast, Glaskanone, Menschenflut, Dürre, Zeit der Riesen, Elitenzug, Zähe Brut, Tyrannen, Nebel. Angesagt
  beim Betreten des Zyklus, im HUD und im Pausenmenü.
- **Warum die Zyklen vorher nie endeten** (gemessen mit dem Bot, Zyklen weitergespielt): Erfahrung und Gold je Kill wachsen
  mit der Gefahrenstufe, die in den Zyklen exponentiell steigt — Stufe 243 in Tiefe 19, Schaden ×160, Feuerrate ×75.
  Der Schaden lief im Takt mit dem Gegnerleben (×3 Mio.) mit, ab Tiefe 9 nahm der Bot gar keinen Schaden mehr.
- **Zyklus-Druck** (nur ab Zyklus 2, `LOOP` und `rewardCoeff` in twists.js): Beute oberhalb von Gefahr 20 wächst nur mit der
  Wurzel (der entscheidende Hebel), Gegner je Welt +8 % Tempo, Horde bis 1.100, Ausweichen je Welt −10 % (min. 20 %),
  jeder Treffer kostet mindestens 2,5 % des Lebens je Welt (max. 30 %, Flächen halb).
- **Gemessen** (7 Kits × 3 Seeds, bis 90 min): vorher endeten Sieger bei Tiefe 15–24 oder lebten nach 90 min noch; jetzt
  8, 10, 12, 12, 12, 16, 17, 18, 18, 19 — meist Zyklus 2–3, Tiefe 12 nach ~35–50 min. Die frühen Tode im ersten Zyklus sind
  identisch zu vorher. Der Bot weicht fast perfekt aus; ein Mensch endet eher früher.
- Messwerkzeug: der Bot reist jetzt nach dem Sieg weiter (engine/bot.js); Tiefe messen mit einem Skript nach Art von
  balance.mjs, das bis zum Tod läuft und `g.stagesCleared + 1` ausgibt.

## D. Neue Welten im Endgame (17.11.2026, Ausbauplan „av-welten“)

Entscheidung des Nutzers: Die neuen Welten kommen **ab Zyklus 2** — Zyklus 1 bleibt wie abgenommen. Kits folgen später als
eigener Schritt (dann mit Entscheidung zu den Figuren).

- **Welt-Sätze** (`data/biomes.js`): `BIOMES` (klassisch) und `BIOMES_NEU` (je Platz die neue Welt, sonst die klassische);
  `biomeFor(stageIndex, loop)` nimmt in Zyklus 2, 4, … die neuen, in Zyklus 3, 5, … die klassischen. Sechs Welten je Zyklus
  bleiben (Tiefe, Schwierigkeits-Tabelle, Erfolge). Neue Welten mischen keine Gegner anderer Welten bei (die kommen in
  Paketen — schon 6 % brachten ganze Schneemann-Trupps auf den Friedhof).
- **Friedhof** (Platz 1, statt Verlies): Boden mit Gras und Knöchelchen, Grabsteine, Gruften, kahle Bäume (2D in
  `render/flat/world.js`, 3D in `scene3d.js buildObstacles`). Mechanik `graeber` (`engine/worldMechanics.js`): ein Grab, an
  dem man vorbeigeht, kündigt sich 0,75 s an und weckt 3–8 Tote, dann ruht es 32 s. Gegner Ghul (Masse), Irrlicht (fliegt
  heran, zerplatzt), Grabwächter (Brocken, Werte wie der Barbar — mit 17 Schaden starben Bot-Läufe sofort), dazu Skelette.
  Boss **Klagende Witwe** (`engine/bosses/witwe.js`): Klageschrei als Fächer, Gräberruf, Schleier, Totentanz in Phase 2.
- **Frostgipfel** (Platz 4) bekommt in den neuen Zyklen den **Frostwyrm** (`engine/bosses/frostwyrm.js`): Eisatem,
  Eiszapfenregen, Sturzflug, Blizzard. Im ersten Zyklus bleibt es beim Yeti-Urahn (ein zweiter Boss hätte dort die
  Boss-Wahl je Seed verschoben).
- 3D-Figuren aus dem Bestand; neu ist die Variante `~grau` im Figuren-Lader (Farben entfärbt, dann getönt — die Färbung
  multipliziert nur, ein oranger Drache wird sonst nie eisblau). Kodex-Bilder der neuen Figuren nur ergänzt (die übrigen
  unverändert).
- Gemessen (Bot, 7 Kits × 3 Seeds): Zyklus 1 identisch; Sieger enden bei Tiefe 8–16 (ein Ausreißer 24), wie vorher.
- **Pilzwald, Sumpf, Uhrwerkturm (17.11.2026)** — Entscheidung des Nutzers: erst aus dem Bestand bauen, eigene
  Figuren später nachziehen. Damit hat Zyklus 2 nur noch neue Welten (außer Frostgipfel mit neuem Boss und Finale).
  - **Pilzwald** (Platz 2, statt Kristallhöhle), Mechanik `sporen`: Sporenpilze (Hindernis `sporeshroom`) kündigen sich
    an und stoßen eine Sporenwolke aus (Fläche `kind: "spores"`, nur Verlangsamung — Flächen mit `dmg: 0` wirken in
    `updateZones` nur ihren Zustand, sonst träfe der Mindestschaden ab Zyklus 2). Gegner Sporling, Sporenmotte,
    Stachelpilz, Bovist (Exploder, platzt zu einer kleinen Wolke — `effect`/`blastColor`/`cloud` am Gegner), Moosaffe
    (wirft Sporen), Waldschrat. Boss **Myzelkönig**: Sporenregen, Pilzsprossen, Brut, in Phase 2 Sprung mit Sporenwolke.
  - **Sumpf** (Platz 3, statt Glutwüste), Mechanik `pfuetzen`: 26 Giftpfützen aus eigenem Zufall in `worldgen.js`
    (`g.pools`, die übrigen Welten bauen sich Stein für Stein gleich), darin Gift (60 %, tötet nie) und Morast (−30 %).
    Nebel nur in 3D (`fog`, Nebelfarbe = `FLOORS.sumpf.outside`). Gegner Giftkröte, Moorglub (fliegt), Sumpfwicht,
    Tintenkrake (Mörser mit Gift), Riesenfrosch (Ansturm), Glubältester (Heiler). Boss **Moorhexe**: Giftkessel, Fluch, Ruf, in Phase 2
    Sumpfwelle (Ring-Gefahren — 3D zeichnet Ringe jetzt als Kette von Scheiben).
  - **Uhrwerkturm** (Platz 5, statt Schlackefeld), Mechanik `zahnraeder`: jede Zahnradfalle dreht eine Klinge
    (150 px, Winkel aus Lage + Weltzeit, `gearAngle`), trifft dich höchstens einmal je Durchgang und mahlt Gegner am
    Boden (Futter sofort, sonst 25 %, Elite 10 %, Champion/Koloss 6 %, Bosse nie). Der Mess-Bot umgeht die ganze
    Klinge. Gegner Blechknecht, Ölschleim, Surrdrohne, Bolzenwerfer, Schildwerk, Dampfmech, Messingmech.
    Boss **Uhrwerkkoloss**: Hieb, Zahnradwurf, Aufziehen (in Phase 2 doppelt), in Phase 2 Uhrzeiger.
  - Werte der Gegner wie die der klassischen Welt auf demselben Platz; Bosse teilen die Beute mit deren Bossen.
  - Gemessen (Bot, 7 Kits × 3 Seeds, bis 90 min): wer Zyklus 2 erreicht, endet bei Tiefe 8, 12 (5×), 15, 17, 19 und
    einmal lebend bei 23 — vorher 8–19. Keine Tode an Zahnradfallen; Sumpf und Uhrwerkturm drücken das Leben am
    stärksten (Uhrwerkturm wie das Schlackefeld im Zyklus 3).
  - Kodex zeigt die neuen Welten (Gegner und Bosse mit Welt), Probe-Seite `/adventures/probe3d` kann sie laden.
- **Eigene Figuren (17.11.2026, Nutzer: „ja bitte weitermachen“):** 16 neue Quaternius-Figuren (CC0, poly.pizza;
  Liste mit Seiten in `public/media/av3d/README.md`) — Roboter-Drohnen, zwei Mechs und der „Animated Robot“ als Boss
  im Uhrwerkturm, Frösche, Glubs, Krake und Sumpfwicht im Sumpf, Stachelpilz und Moosaffe im Pilzwald. Gegner und Boss
  wurden nach ihrer Figur umbenannt (Namen = Aussehen). Weiter aus dem Bestand: Sporling, Sporenmotte, Bovist,
  Waldschrat, Myzelkönig (Pilzkönig, passt), Moorhexe (Hexer, entfärbt).
  - `bakeFigures.mjs` backt mit Namensliste nur einzelne Figuren (die alten Quellen braucht es dann nicht) und misst bei
    den neuen die ganze Figur (`measureAll`): starre Teile wie der Automatenkopf zählten sonst nicht zur Höhe, die Figur
    wurde dreimal zu groß. Die Biene („Bee Enemy“) fällt beim Backen auf null Dreiecke zusammen — nicht benutzt.
- **Vier neue Kits (17.11.2026, Nutzer: CC0-Figuren suchen „ja bitte“):** Figuren aus Quaternius' „RPG Characters“
  (OpenGameArt, CC0, nur FBX — `bakeFigures.mjs` liest FBX jetzt selbst), Wolf von poly.pizza. Freischaltung auf Stufen,
  die bisher nur Items brachten (Backend/adventure/progression.js): Mönch 8, Jägerin 11, Alchemist 14, Nekromantin 16.
  - **Mönch**: `palm` ist ein Nahkampfschlag (`melee` in kits.js, Bogen `arc`, jeder 3. Schlag Druckwelle rundum — mehr
    Geschosse machen den Bogen breiter), Chi-Welle (durchschlägt alles), Windschritt (Ansturm mit Schaden), Hundert
    Fäuste (`p.spin` mit 0,1 s Takt).
  - **Jägerin**: Jagdpfeile, Fangeisen (Begleiter `trap` in allies.js: liegt, bis ein Gegner am Boden hineintritt, dann
    Fläche mit Einfrieren; höchstens 8), Rückwärtssalto (legt ein Fangeisen), Wolfsrudel (Begleiter `wolf`, eigene
    3D-Figur über `PET_FIG`/`KIT_PETS` in cast.js, nur für dieses Kit geladen).
  - **Nekromantin**: Seelenblitz mit `raise` (8 %, `raiseSkeleton`, höchstens `RAISE_CAP` 8), Knochendornen (Wirkung
    `chill`), Seelentausch (Teleport + Skelett), Heer der Toten (6 Skelette, `necroRage` verdoppelt ihren Schaden).
  - **Alchemist**: Wurfflasche (`lob`, fliegt zum Zeiger; Elemente reihum `ELEMENTS` = Brand, Kälte `chill`, Gift — neue
    Wirkungen eigener Flächen in combat.js), Elixier (Heilung + `elixir` +60 % Angriffstempo), Rauchbombe (Sprung +
    bremsender Rauch `kind: "smoke"`), Kettenreaktion (sechs Explosionen aller Elemente im Ring).
  - Gemessen (Bot, 5 Seeds, 1500 s): Siege Abenteurer 1, Ritter 1, Alchemist 1, Magier 2, Mönch 2, Jägerin 2, Ninja 3,
    Nekromantin 4. Vor dem Nachziehen waren Nekromantin und Jägerin klar vorn (unverwundbare Helfer skalieren mit dem
    Schaden) und der Alchemist hinten. Nekromantin beobachten.
- **av-welten damit fertig** (wartet auf Deploy, Frontend + Backend wegen der Freischaltungen).

## E. Rückmeldung nach den neuen Kits (17.11.2026)

Nutzer: bessere Darstellung für Kisten, Schreine, Fallen, Geschosse, Waffen · „Jägerin platziert alle Fallen auf einmal“
· „Wölfe targetten immer das gleiche Ziel — warum keine Wölfe als Gegner, mehr verschiedene Gegner?“ Entscheidung: neue
Gegner **auch in Zyklus 1** (hebt die frühere Vorgabe „Zyklus 1 unverändert“ für diesen Punkt auf).

- **Ladungen**: gehaltene Taste feuerte alle Ladungen in aufeinanderfolgenden Schritten (Fangeisen ×3, Türme ×2,
  Doppel-Schattenschritt). `CHARGE_GAP` 0,4 s in engine/player.js.
- **Helfer-Ziele**: Skelette und Wölfe behalten ihr Ziel und nehmen sonst eines, das noch kein anderer Helfer jagt
  (`pickTarget` in engine/allies.js).
- **Darstellung 3D**: Requisiten als starre Figuren (`static` in bakeFigures.mjs, `PROPS` in cast.js): Truhen
  (offen nach Benutzung), Steinschrein mit schwebendem Edelstein in Schreinfarbe, Kerzenaltar, Bärenfalle,
  Kristalle der Höhle. Geschosse nach Form (`SHOT_LOOK` in scene3d.js: Stab/Scheibe/Würfel/Kugel/Kristall), Orbitalklingen
  als Klingen, Kriegsrad als Rad. Fallback: solange ein Modell lädt, bleiben die alten Kästen.
- **Rudel** (neue KI `pack`): kreisen um den Helden (Platz je Wolf über die laufende Nummer), Ansage 0,45 s mit Bahn
  in Sprunglänge (`aimLen`), Sprung, Rückzug. Gruftwolf (Verlies, Friedhof), Schneewolf/Husky (Frostgipfel),
  Wüstenfuchs (Glutwüste), Glutwolf (Schlackefeld, Brand), Waldwolf (Pilzwald); Geschützwerk (Uhrwerkturm, Turm).
- **Gemessen** (Bot, 8 Kits × 5 Seeds, 1500 s): vor den Rudeln 16/40 Siege; erste Fassung 11/40 und doppelt so viele
  frühe Tode im Verlies → Rudel entschärft (Gruftwolf 28 Leben/7 Schaden, Biss ×1,1, Sprung alle ~3,2–3,4 s, seltener)
  → 22/40 Siege, 2 frühe Tode. Streuung groß (Nekromantin 4 → 1); Zyklus 1 ist nicht schwerer als vorher.
- Nebenbei: kompaktes HUD (Handy) kannte `depthBest` nicht und wäre ab Zyklus 2 abgestürzt — behoben.
- Krabbe und Biene (Quaternius „MonsterArmature“) fallen beim Backen auf null Dreiecke zusammen — nicht benutzt.
