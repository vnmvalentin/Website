# Game Design Roadmap — adVentures & Virtual Farm

Stand: Juli 2026. Dieses Dokument sammelt Sprite-Aufträge (mit exakten Dateinamen/Konventionen),
neue Content-Ideen und offene Balancing-Notizen für den Live-Release.

---

## 1. adVentures

### 1.1 Sprite-Konvention (wichtig für alle neuen Monster)

Die Engine lädt Gegner automatisch über `loadAnim(name, file, hasRun, attackCount, hasIdleFile)`:

| Datei | Bedeutung |
|---|---|
| `name.png` | Idle-Frame (bzw. Lauf-Frame 1, wenn `name3.png` existiert) |
| `name2.png` | Lauf-Frame 2 |
| `name3.png` | Separater Idle-Frame (optional) |
| `name_attack.png` | Angriff (1 Frame) |
| `name_attack1.png` … `name_attackN.png` | Angriff (mehrere Frames) |

Alle Sprites: PNG mit Transparenz, Blickrichtung **rechts** (Engine spiegelt automatisch),
ca. 64–128px Kantenlänge, Stil passend zu den bestehenden Pixel-Assets.

### 1.2 Neue Monster (pro Theme ein Sprite-Set)

| Theme | Monster | Rolle | Dateien (Ordner `public/assets/adventure/...`) |
|---|---|---|---|
| Dungeon | **Fledermaus** | schneller Schwarm-Gegner, wenig HP | `dungeon/bat.png`, `bat2.png` |
| Dungeon | **Mimic** | tarnt sich als Kiste, explodiert bei Nähe | `dungeon/mimic.png`, `mimic_attack.png` |
| Desert | **Sandwurm** | taucht ab/auf, kurzer Burst | `desert/sandworm.png`, `sandworm2.png`, `sandworm_attack.png` |
| Ice | **Frostwolf** | Rudel-Spawn (3 auf einmal) | `ice/frostwolf.png`, `frostwolf2.png`, `frostwolf_attack.png` |
| Lava | **Magma-Schnecke** | hinterlässt Feuerspur (nutzt Acid-Puddle-System) | `lava/magmasnail.png`, `magmasnail2.png` |
| Cave | **Glühwürmchen-Schwarm** | Support: macht andere Gegner schneller | `cave/fireflies.png`, `fireflies2.png` |
| Alle | **Elite-Aura** (optional) | Overlay-Ring für Elite-Gegner (aktuell Canvas-Ring) | `world/elite_ring.png` |

### 1.3 Neue Bosse (Sprite-Sets)

1. **Boss 3 — „STONEHEART" (Golem-König, Stage 30/60/…)**
   Arena: Cave. Mechaniken: Bodenschlag mit Schockwellen-Ringen, Felsbrocken-Regen
   (Warning-Circles wiederverwendbar), Phase 2: zerbricht in 2 Mini-Golems.
   Dateien: `boss3/golem_idle.png`, `golem_walk1/2.png`, `golem_slam1/2/3.png`,
   `golem_crack.png` (Phase-2-Übergang), `boss3/rock_projectile.png`, `stagetheme/floor_boss3.png`
2. **Boss 4 — „NOKTIS" (Schatten-Magier, Stage 40/80/…)**
   Arena: Dungeon (dunkel). Mechaniken: Teleport + Schattenklone (Decoy-System invertiert),
   rotierende Laser (Triple-Beam-Code wiederverwendbar).
   Dateien: `boss4/mage_idle.png`, `mage_cast1/2.png`, `mage_teleport1/2.png`,
   `boss4/shadow_orb.png`, `stagetheme/floor_boss4.png`

### 1.4 Neue Spieler-Skins

- **Samurai** (`skins/player_samurai(.2/.3).png`) — Projektil: Klingenwelle (`projectiles/slash.png`)
- **Piratin** (`skins/player_pirate…`) — Projektil: Kanonenkugel
- **Astronaut** (`skins/player_astro…`) — Projektil: Plasmakugel (laserball vorhanden)
- Skins als Arena-Belohnung: „Arena-Champion"-Skin ab Leaderboard Top 3

### 1.5 Level/Hindernis-Sprites

- Dungeon: zerbrochene Statue, Kerzenständer (`world/statue.png`, `world/candle.png`)
- Desert: Ruinen-Bogen, Knochenhaufen (`desert/ruins.png`, `desert/bones.png`)
- Ice: gefrorener Baum, Eisloch (begehbar-Ausgrenzung) (`ice/frozentree.png`, `ice/icehole.png`)
- Lava: Obsidian-Säule, Lavariss (animierbar 2 Frames) (`lava/obsidian.png`, `lava/crack1/2.png`)
- Interaktiv (Code + Sprite): **zerstörbare Fässer** mit Gold/Heil-Drop (`world/barrel.png`, `barrel_broken.png`)

### 1.6 Arena (PvPvE) — Assets & Ausbau

- Eigenes Arena-Floor-Tile (`stagetheme/floor_arena.png`, aktuell Cave-Floor als Platzhalter)
- XP-Kristall-Sprite für passive Farm-Objekte (`world/xp_crystal.png`) → diep.io-Shapes-Feeling
- Geplante Features v2: Wahl von Upgrade-Pfaden beim Levelup (Damage/Tank/Speed),
  Safe-Zone am Spawn (5s Schutz), Tages-/Wochen-Leaderboard, Team-Modus (2v2v2v2)

### 1.7 Umgesetzte Balancing-Änderungen (Referenz)

- Kills pro Stage: `10 + 2×Stage`, Cap 55 (vorher `12 + 3×Stage`, ungedeckelt)
- Monster: HP `18 + 3.5×Stage + 30×Tier`, DMG `6 + 1.2×Stage + 4×Tier` (flacher)
- Rage-Mode (Tür offen): 1.5×HP / 1.3×DMG (vorher 2.0/1.5)
- Boss: `900 + 250×Stage`, Drache 2.6× (vorher 3.5× → Stage-20-Mauer)
- Gift/Brand skalieren jetzt mit Stage; Fernkämpfer nutzen echte Monster-Stats
- Crit-Cap 50%; Glück gibt +50% Gold pro Punkt (statt Multiplikator)
- Elite-Gegner ab Stage 12 (7%): 2.5×HP, 1.4×DMG, 3× Gold, Goldring-Markierung
- Neue Meilensteine: Schnellfeuer (+30% Feuerrate), Fortuna (+1 Glück)
- Neues Powerup: **Blitzschlag** (AoE am Cursor, 30s CD)
- Schutzschild-Cooldown-Fix: 45s (war versehentlich 6s)

---

## 2. Virtual Farm

### 2.1 Sprite/UI-Aufträge

- **Atlas fehlt:** `public/garden-assets/atlas/garden_atlas.png` + `.json` werden vom Renderer
  referenziert, existieren aber nicht → entweder Atlas generieren (alle Struktur-Tiles) oder
  Referenz entfernen. Ein echter Atlas spart ~15 Einzelrequests beim Boot.
- **Platzhalter-Dekos ersetzen:** `deco/lamp_placeholder.png`, `statue_placeholder.png`,
  `fountain_placeholder.png` sind noch Platzhalter.
- **Wetter-Icons** für die HUD-Anzeige (`world/icon_sun/rain/snow/thunder/moon.png`) statt Emoji.
- **Gieß-Animation:** 2-Frame-Splash (`common/water_splash1/2.png`) beim Wässern.
- **Ernte-Partikel:** kleines Glitzer-Sheet (`common/sparkle1-3.png`) für Golden/Rainbow-Ernten.
- **Shop-Schilder:** je Shop ein Hängeschild-Sprite, damit Gebäude ohne Text erkennbar sind.
- **Neue Tiere (Sprites fehlen für Hatch-Typen):** Phönix, Tiger, Drache, Götterwesen haben
  Emoji-Fallback → `animals/phoenix.png`, `tiger.png`, `drache.png`, `goetterwesen.png`.

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

### 2.4 Performance-Notiz: public/ vs. src/

Empfehlung: **Bilder bleiben in `public/`.** Gründe:
1. Die Pfade werden dynamisch zusammengesetzt (`/garden-assets/plants/${seedId}/plant.png`) und
   kommen z. T. **aus dem Backend/Savegames** — statische `import`s kann Vite dafür nicht auflösen.
2. Der eigentliche „Performance-Bug" war, dass der Ordner unter `public/assets/garden-assets` lag,
   der Code aber `/garden-assets/...` lädt → **jedes Bild war ein 404** (Emoji-Fallbacks + sinnlose
   Requests). Das ist behoben (Ordner verschoben).
3. Sinnvoller nächster Schritt: Cache-Header (`Cache-Control: public, max-age=31536000, immutable`)
   für `/garden-assets/` im Hosting/NGINX setzen + optional den Atlas bauen (2.1).
