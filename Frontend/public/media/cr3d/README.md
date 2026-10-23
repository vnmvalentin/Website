# 3D-Fotoassets (Lights Out, Stream-Szenen, ältere CR-Szenen)

Alle Dateien stammen von [Poly Haven](https://polyhaven.com) und stehen unter **CC0** (frei nutzbar,
auch kommerziell, ohne Namensnennung). Geladen werden sie über `src/pages/ClashRoyale/modes/scene3d/kit.js`
(`createAssets`) — nur in lazy geladenen 3D-Szenen. Der Ordnername stammt aus der ersten Runde (CR-Minigames);
die CR-Szenen nutzen inzwischen den gemalten CR-Stil, die Fotoassets gehören vor allem zu:

- **Lights Out** (`src/pages/LightsOut/`, photoWorld.js + forestWorld.js + game.js): Wald, Anstalt, Keller
- **Stream Starting/Ending** (`src/pages/StreamScenes/`): Party-Saal (Beton), Kino (Holz, Stoff, Samt)

Aufbau:

- `tex/<id>/` — `diff.webp` (Farbe), `nor.webp` (Normal, OpenGL), `arm.webp` (R: AO, G: Rauheit, B: Metall), 1k
- `hdri/<id>_1k.hdr` — Umgebungslicht; `hdri/<id>_4k.jpg` — sichtbarer Himmel (aus dem Tonemapped-JPG verkleinert)
- `models/<id>.glb` — mit gltf-transform aufbereitet: Texturen 512 px (Nahes 1024 px) als WebP, meshopt-komprimiert,
  Scans vereinfacht (`simplify`). Was tausendfach instanziert wird (Wurzeln, Stümpfe, Totholz), liegt bei
  höchstens ~8 000 Punkten — sonst bricht die Bildrate im Wald ein. Der Lader setzt den MeshoptDecoder.
- `impostor/fir_<0|1|2>.webp` — die drei Fichten aus `fir_tree_01` (roh 478 MB Nadelkarten; vereinfacht
  verlor der Scan fast alle Nadeln). Aus dem vollen Scan gerendert: links Vorder-, rechts Seitenansicht,
  je 512×1024, eingebackene Verdeckung über die Vertexfarben des Scans. Maße und Kronenansatz in `photoWorld.js` (FIRS).

Neue Assets: Poly-Haven-ID nachsehen (`api.polyhaven.com/files/<id>`), Größe prüfen (Baum-Scans haben 40–950 MB
Geometrie), dann `gltf-transform simplify → resize → webp → meshopt` außerhalb des Projekts und nur die `.glb`
hierher legen. Sets mit mehreren Varianten in einer Datei (Felsen, Gras, Farn) wählt `model(id, h, { part })` aus.

Die Chatter-Figur der Stream-Szenen (Mannequin + Motion-Capture-Tänze) liegt getrennt in `../stream3d/`.
