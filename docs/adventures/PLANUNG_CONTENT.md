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
