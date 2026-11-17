# Figuren der 3D-Ansicht von adVentures

Jede `.bin` ist eine fertig gerechnete Figur: acht Schritte einer Gangart und die stehende Figur als starre Körper,
Farben als Punktfarben, keine Texturen. Geladen von `src/pages/Adventure/render3d/figures3d.js`, erzeugt von
`src/pages/Adventure/render3d/tools/bakeFigures.mjs` (dort stehen das Dateiformat und die Liste der Figuren).
Welche Figur welchen Gegner darstellt, steht in `CAST` / `BOSS_CAST` / `HEROES` in `render3d/cast.js`.

Alle Quellen sind **CC0** (gemeinfrei). Die Originale liegen nicht im Projekt.

## Herkunft

### Verlies und Helden — KayKit (Kay Lousberg, www.kaylousberg.com)

- „Character Pack: Skeletons“ (1.0): Skeleton_Minion, _Warrior, _Rogue, _Mage und ihre Waffen/Schilde
  https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
- „Character Pack: Adventurers“ (1.0): Knight, Barbarian, Mage, Rogue, Rogue_Hooded
  https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

Die Lizenztexte beider Pakete liegen in diesem Ordner. Vom selben Zeichner stammt die Halloween-Deko der
Stream-Szenen (`../stream3d/halloween`).

| Datei | Quelle | Rolle |
|---|---|---|
| skelett_knecht | Skeleton_Minion + Klinge | die Masse im Verlies |
| skelett_schleicher | Skeleton_Rogue | langsame Kämpfer |
| skelett_krieger | Skeleton_Warrior + Axt, kleiner Schild | Kämpfer |
| skelett_schild | Skeleton_Warrior + Klinge, großer Schild | Schildträger |
| skelett_schuetze | Skeleton_Rogue mit Kapuze + Armbrust | Fernkämpfer |
| skelett_magier | Skeleton_Mage + Stab | Beschwörer, Boss Nekromant |
| barbar_wild | Barbarian + Zweihandaxt | Brocken, Koloss |
| ritter_dunkel | Knight + Zweihandschwert | Boss Gefallener Ritter |
| held_ritter, held_schurke, held_kapuze, held_magier, held_barbar | Knight, Rogue, Rogue_Hooded, Mage, Barbarian | Helden |

### Übrige Welten — Quaternius „Ultimate Monsters“

https://quaternius.com/packs/ultimatemonsters.html — „Free to use in any project, even commercially (CC0)“.
Geladen als einzelne `.glb` von poly.pizza (dort jeweils als „CC0 1.0“ von Quaternius geführt); der Download-Ordner
des Zeichners auf Google Drive war am 13.11.2026 wegen Abruf-Limit nicht erreichbar.

| Datei | Quelldatei (Nummer = Reihenfolge auf poly.pizza) | Seite |
|---|---|---|
| schleim | 601_GreenBlob.glb | https://poly.pizza/m/y4kJh8EeYS |
| fledermaus | 576_Goleling.glb | https://poly.pizza/m/71gomWolax |
| pilzling | 604_Mushnub.glb | https://poly.pizza/m/LWKmS30Xxl |
| pilzkoenig | 569_MushroomKing.glb | https://poly.pizza/m/grnFTziU8u |
| tentakel | 573_Alien.glb | https://poly.pizza/m/RRliSQBP7r |
| kaktus | 596_Cactoro.glb | https://poly.pizza/m/66CYX5UhRK |
| biene | 594_Armabee.glb | https://poly.pizza/m/42djT5zJnx |
| kaktusriese | 574_Cactoro.glb | https://poly.pizza/m/IGn9lhdama |
| dino | 566_Dino.glb | https://poly.pizza/m/wuerCFCWNR |
| maske | 585_Tribal.glb | https://poly.pizza/m/t91lDHaqRW |
| koenig | 591_AlpakingEvolved.glb | https://poly.pizza/m/UdJudob66v |
| yeti_klein | 579_Yeti.glb | https://poly.pizza/m/S1E7idPFhe |
| vogel | 589_Pigeon.glb | https://poly.pizza/m/9NGlBTpDEr |
| yeti | 570_Yeti.glb | https://poly.pizza/m/ceRHrn8HHE |
| geist | 581_Ghost.glb | https://poly.pizza/m/Iip30bDHmu |
| schleim_rosa | 587_PinkSlime.glb | https://poly.pizza/m/AyP8sQmDLh |
| drache_klein | 599_Dragon.glb | https://poly.pizza/m/3rUm1cN3yp |
| hexer | 577_Wizard.glb | https://poly.pizza/m/o87Upt5uHX |
| kobold | 606_OrcEnemy.glb | https://poly.pizza/m/Q3z8ZX4kUy |
| daemon | 572_Demon.glb | https://poly.pizza/m/LnfIziKv4o |
| drache | 584_DragonEvolved.glb | https://poly.pizza/m/LlwD0QNUPj |

### Neue Welten ab Zyklus 2 — Quaternius auf poly.pizza (November 2026)

Weitere Figuren von Quaternius, auf poly.pizza jeweils als „Public Domain (CC0)“ geführt (Monster aus „Ultimate
Monsters“, Roboter-Gegner und Mechs aus dem „Ultimate Space Kit“, dazu der „Animated Robot“). Geladen am 17.11.2026 als
`https://static.poly.pizza/<uuid>.glb`, Quellordner `poly/` (Dateiname = Spalte 2). Bei diesen Figuren zählt beim Backen
die ganze Figur zur Höhe (`measureAll`), weil manche Teile starr sind (Kopf des Automaten).

| Datei | Quelldatei | Seite | Rolle |
|---|---|---|---|
| stachelpilz | MushnubEvolved.glb | https://poly.pizza/m/0SZyA6MV51 | Pilzwald: Stachelpilz |
| affenwicht | Monkroose.glb | https://poly.pizza/m/j4rVPvxyLg | Pilzwald: Moosaffe |
| kroete | Frog_b.glb (Frog) | https://poly.pizza/m/37wofOCOzG | Sumpf: Giftkröte |
| riesenfrosch | Frog_a.glb (Frog) | https://poly.pizza/m/9Z2V8fpazF | Sumpf: Riesenfrosch (hüpft: Frog_Jump) |
| glub | Glub.glb | https://poly.pizza/m/x59pqJscry | Sumpf: Moorglub |
| glub_gross | GlubEvolved.glb | https://poly.pizza/m/Z9lddNpM1M | Sumpf: Glubältester |
| krake | Squidle.glb | https://poly.pizza/m/54QyRcsogk | Sumpf: Tintenkrake |
| sumpfwicht | EnemyLarge.glb | https://poly.pizza/m/UgBmRVnQ9h | Sumpf: Sumpfwicht |
| robo_laeufer | RobotEnemy.glb | https://poly.pizza/m/1gNo5ezvmr | Uhrwerkturm: Blechknecht |
| robo_drohne | RobotEnemyFlying.glb | https://poly.pizza/m/lF3jeRJwiH | Uhrwerkturm: Surrdrohne |
| robo_kugel | RobotEnemyLarge.glb | https://poly.pizza/m/mPDR0L5uKx | Uhrwerkturm: Schildwerk |
| robo_kanone | RobotEnemyLegsGun.glb | https://poly.pizza/m/lFZfDh2hzP | Uhrwerkturm: Bolzenwerfer |
| mech_gelb | Mech_d.glb (Mech) | https://poly.pizza/m/4UvIHxnoSR | Uhrwerkturm: Messingmech |
| mech_orange | Mech_b.glb (Mech) | https://poly.pizza/m/D5wW2jDO42 | Uhrwerkturm: Dampfmech |
| automat | AnimatedRobot.glb | https://poly.pizza/m/QCm7qe9uNJ | Uhrwerkturm: Boss Uhrwerkkoloss |
| hornschleim | SlimeEnemy.glb | https://poly.pizza/m/eSLKTsbl7F | Uhrwerkturm: Ölschleim (entfärbt) |

Die Biene („Bee Enemy“) ließ sich nicht backen (fiel auf null Dreiecke zusammen) und ist nicht dabei.

| wolf | Wolf.glb (Wolf) | https://poly.pizza/m/P1gU3Qkr9r | Begleiter der Jägerin (Wolfsrudel); Gegner Gruft-, Glut-, Waldwolf |
| fuchs | Fox.glb (Fox) | https://poly.pizza/m/Bc97C66HKi | Gegner Wüstenfuchs |
| husky | Husky.glb (Husky) | https://poly.pizza/m/wcWiuEqwzq | Gegner Schneewolf |
| robo_geschuetz | RobotEnemyLargeGun.glb | https://poly.pizza/m/mWojM4i2IH | Gegner Geschützwerk (Uhrwerkturm) |

Die Krabbe („Crab Enemy“) fällt beim Backen wie die Biene auf null Dreiecke zusammen (gleiches Monster-Skelett) und ist
nicht dabei.

### Requisiten — starre Modelle (prop/, `static` in bakeFigures.mjs: nur ein Standbild)

Auf poly.pizza jeweils „Public Domain (CC0)“, geladen am 17.11.2026; Quellordner `prop/`. Aufstellung in `cast.js PROPS`.

| Datei | Quelldatei | Seite | Rolle |
|---|---|---|---|
| kiste | Chest_a.glb (Quaternius) | https://poly.pizza/m/O72u4Drp8k | Kiste |
| kiste_gross | Chest_c.glb (Quaternius) | https://poly.pizza/m/eEcIqgJzJ1 | große Kiste |
| kiste_rot | Chest_d.glb (Quaternius) | https://poly.pizza/m/RfSBvgcZUD | Ausrüstungskiste |
| kiste_offen | Chest_b.glb (Quaternius) | https://poly.pizza/m/IbCTSkyWDT | geöffnete Kisten |
| schrein | Shrine_a.glb (Kay Lousberg) | https://poly.pizza/m/tFxdxO5clk | Schreine (Edelstein darüber im Zeichner) |
| altar | Shrine_b.glb (Kay Lousberg) | https://poly.pizza/m/Qq8M5LSXQ2 | Opferaltar |
| fangeisen | BearTrap_a.glb (Quaternius) | https://poly.pizza/m/UTau9hyAnm | Fangeisen der Jägerin |
| kristall, kristall2 | Crystal_a/_b.glb (iPoly3D) | https://poly.pizza/m/WzWPKHFMkL, https://poly.pizza/m/dxCmHfpqc5 | Kristalle der Kristallhöhle |

### Helden der neuen Kits — Quaternius „RPG Characters – Nov 2020“

https://opengameart.org/node/126989 („LowPoly RPG Characters“, CC0 1.0 laut `License.txt` im Paket, geladen am
17.11.2026 als `rpg_characters_-_nov_2020.zip`). Nur als FBX zu haben: `bakeFigures.mjs` liest es mit dem FBXLoader von
three.js und nimmt die Farben aus den PNG-Texturen des Pakets (`textures`, V-Achse gespiegelt, `texGain` hellt auf).
Quellordner `rpg/` = die Ordner `FBX/` und `Textures/` aus dem Zip.

| Datei | Quelldatei | Kit |
|---|---|---|
| held_moench | FBX/Monk.fbx + Textures/Monk_Texture.png | Mönch |
| held_jaegerin | FBX/Ranger.fbx + Ranger_Texture, Ranger_Bow_Texture | Jägerin |
| held_klerikerin | FBX/Cleric.fbx + Cleric_Texture, Cleric_Staff_Texture | Nekromantin (lila getönt) |
| held_gelehrter | FBX/Wizard.fbx + Wizard_Texture, Wizard_Staff_Texture | Alchemist |

## Neu erzeugen

1. Einen Quellordner anlegen:
   - `kaykit/` — die neun `.glb` aus `addons/…/Characters/gltf/` der beiden KayKit-Pakete
   - `kaykit/assets/` — die Waffen der Skelette aus `addons/kaykit_character_pack_skeletons/Assets/gltf/`
     (je `.gltf` + `.bin`): Skeleton_Blade, _Axe, _Staff, _Crossbow, _Shield_Large_A, _Shield_Small_A
   - `monster/` — die `.glb` der Tabelle oben, benannt wie in der Spalte „Quelldatei“
   - `poly/` — die `.glb` der Tabelle „Neue Welten ab Zyklus 2“ (und Wolf, Fuchs, Husky), benannt wie in der Spalte „Quelldatei“
   - `prop/` — die `.glb` der Requisiten-Tabelle
   - `rpg/` — die Ordner `FBX/` und `Textures/` aus Quaternius' „RPG Characters – Nov 2020“
2. Im Ordner `Frontend`: `npm run adventure:figuren -- <Quellordner>`
   (nur einzelne Figuren: `npm run adventure:figuren -- <Quellordner> stachelpilz,automat` — dann braucht es nur
   deren Quellen; die übrigen Dateien bleiben unverändert)

Eine neue Figur ist ein Eintrag in `FIGURES` (Quelldatei, Gangart, Ausrüstung) und ein Eintrag in der Besetzung
(`src/pages/Adventure/render3d/cast.js`).

## Bilder für Menüs, HUD und Kodex (`bilder/`)

Je Gegner, Boss und Held ein kleines Bild der 3D-Figur mit durchsichtigem Grund (`gegner_<id>.png`, `boss_<id>.png`,
`held_<kit>.png` und je Farbvariante `held_<kit>_<skin>.png`), gezeigt über `src/pages/Adventure/ui/FlatSprite.jsx`. Nach Änderungen an Besetzung oder Figuren neu erzeugen: Dev-Server starten
(`npm run dev`), dann `npm run adventure:bilder` (ein anderer Port als 5173 als Adresse dahinter:
`npm run adventure:bilder -- http://localhost:5199`).
