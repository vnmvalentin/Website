# Figuren der 3D-Ansicht von adVentures

Jede `.bin` ist eine fertig gerechnete Figur: acht Schritte einer Gangart und die stehende Figur als starre Körper,
Farben als Punktfarben, keine Texturen. Geladen von `src/pages/Adventure/render3d/figures3d.js`, erzeugt von
`src/pages/Adventure/render3d/tools/bakeFigures.mjs` (dort stehen das Dateiformat und die Liste der Figuren).
Welche Figur welchen Gegner darstellt, steht in `CAST` / `BOSS_CAST` / `HEROES` in `render3d/scene3d.js`.

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

## Neu erzeugen

1. Einen Quellordner anlegen:
   - `kaykit/` — die neun `.glb` aus `addons/…/Characters/gltf/` der beiden KayKit-Pakete
   - `kaykit/assets/` — die Waffen der Skelette aus `addons/kaykit_character_pack_skeletons/Assets/gltf/`
     (je `.gltf` + `.bin`): Skeleton_Blade, _Axe, _Staff, _Crossbow, _Shield_Large_A, _Shield_Small_A
   - `monster/` — die `.glb` der Tabelle oben, benannt wie in der Spalte „Quelldatei“
2. Im Ordner `Frontend`: `npm run adventure:figuren -- <Quellordner>`

Eine neue Figur ist ein Eintrag in `FIGURES` (Quelldatei, Gangart, Ausrüstung) und ein Eintrag in der Besetzung
(`src/pages/Adventure/render3d/cast.js`).

## Bilder für Menüs, HUD und Kodex (`bilder/`)

Je Gegner, Boss und Held ein kleines Bild der 3D-Figur mit durchsichtigem Grund (`gegner_<id>.png`, `boss_<id>.png`,
`held_<kit>.png` und je Farbvariante `held_<kit>_<skin>.png`), gezeigt über `src/pages/Adventure/ui/FlatSprite.jsx`. Nach Änderungen an Besetzung oder Figuren neu erzeugen: Dev-Server starten
(`npm run dev`), dann `npm run adventure:bilder` (ein anderer Port als 5173 als Adresse dahinter:
`npm run adventure:bilder -- http://localhost:5199`).
