# Figuren der 3D-Stream-Szenen

`dancer.glb` — die Chatter-Figur für Stream Starting (Party) und Stream Ending (Kino), geladen über
`src/pages/StreamScenes/mocapFigure.js`.

- **Figur + Alltagsclips:** Quaternius „Universal Animation Library“ (Standard), **CC0**.
  Behalten: idle, talk, walk, jog, sitEnter, sit, sitTalk, sitExit, danceQ, jumpStart, jumpLand.
- **Tänze:** CMU Graphics Lab Motion Capture Database (BVH-Fassung von B. Hahne / cgspeed),
  frei nutzbar, auch kommerziell — nur die Rohdaten selbst dürfen nicht weiterverkauft werden.
  Clips: salsa (60_01), salsa2 (61_03), charleston (93_03), charleston2 (93_08), lambada (55_02),
  whirl (55_01), russian (90_30), mickey (120_05), groove (111_05), groove2 (113_04),
  chicken (18_15), modern (05_02), bhangra (94_01), jacks (22_16), hop (49_02), footwork (85_04),
  sideflip (90_08, einmalig), moonwalk (90_32, Wanderung entfernt — die Szene schiebt die Figur).

Aufbereitung: `scripts/dancerBake/` — BVH → Mannequin über Weltdrehungen relativ zur T-Pose (beide
Skelette stehen im ersten Bild in T-Pose mit Blick nach +z), Schleifenpunkt per Posenabstand,
Hüfte auf 30 % der Wanderung gedämpft, Boden über das 10-%-Quantil des tiefsten Fußes.
Danach `gltf-transform resample → prune → meshopt`.

## Comic-Figuren (`people/`)

Standard-Figuren beider Szenen seit 21.10.2026 (Roboter weiter per `?figuren=roboter`), geladen über
`src/pages/StreamScenes/peopleFigure.js`.

- **Figuren:** Quaternius „Ultimate Animated Character Pack“ (Nov 2019), **CC0** (OpenGameArt). 38 Figuren,
  je eine Datei, alle mit demselben Skelett. Ausgelassen: Ninjas (fehlerhafte Hüllbox), Soldaten, Knight_Male.
- **`clips.glb`:** BaseCharacter + alle 29 Bewegungen aus `dancer.glb`, übertragen mit
  `scripts/dancerBake/retargetPeople.mjs` (Ziel erst rechnerisch in T-Pose, Füße sind IK-Knochen).
- Umwandlung: FBX → GLB mit FBX2glTF, dann gltf-transform `dedup → weld → resample → prune → meshopt`
  (Werkzeuge nur im Scratch-Ordner installiert). Haut ist im Paket ein schwarzer Platzhalter — der Hautton
  wird zur Laufzeit gesetzt; „Face“ sind die Augen.

## Auch für Lights Out

`dancer.glb` ist seit 21.10.2026 zugleich die Grundlage der drei Monster in Lights Out
(`src/pages/LightsOut/monsterModel.js`: ausgedünnt, Glieder verlängert, eigene Köpfe; genutzt werden
nur die Clips idle/walk/jog). Datei also nicht als „nur Stream“ entfernen oder umbenennen.
