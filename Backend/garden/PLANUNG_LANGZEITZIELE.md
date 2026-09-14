# Langzeitziele — Planung (Stand 21.08.2026)

Auslöser: 38 Mrd. Gold, alles Wichtige gekauft, kein Ziel mehr. Ursache: Bonus,
Wetter, Skillbaum, Events und Party-Rainbow stapeln sich beim Verkauf, aber kaum
etwas im Spiel wird mit demselben Tempo teurer — die Ausgabenseite hält mit der
Einnahmeseite nicht mit.

Dieses Dokument ist reine Planung, nichts hier ist implementiert (Ausnahme:
Abschnitt 0, der ist bereits umgesetzt und dient nur als Bezugspunkt).

## 0. Bereits umgesetzt (21.08.2026)

Zwei kleine, risikoarme Hebel sofort gezogen, weil sie an bereits bestehenden,
unlimitierten Formeln hängen und keine Balance angefasst haben, die an
Wachstumszeiten hängt (siehe Abschnitt 1):

- **Rucksack-Deckel 25 → 50 Stufen** (`garden/core/werkzeug.js`,
  `BACKPACK_MAX_LEVEL`). Gleiche Formel (20.000 · 1,55ⁿ) einfach weitergezogen:
  Stufe 40 ≈ 821 Mrd., Stufe 49 (letzter Kauf) ≈ 42,4 Billionen, kumuliert bis
  Stufe 50 ≈ 119,5 Billionen. Vorher war bei ≈ 2,1 Mrd. endgültig Schluss.
- **Legendary Egg 800 Mio. → 15 Mrd.** (`routes/gardenGameRoutes.js` UND der
  Frontend-Spiegel in `GameContainer.jsx` — Eier haben kein Spiegel-Skript,
  beide Stellen von Hand angepasst). Bewusst nur Legendary; Common bis Epic
  bleiben am ursprünglichen Amortisations-Gedanken (siehe Kommentar dort).

Damit ist das PROBLEM nicht gelöst, nur der akute Schmerzpunkt entschärft. Die
eigentliche Frage bleibt offen: was macht ein Spieler mit 500 Mrd., wenn Rucksack
UND Eier auch das nicht mehr sind?

## 1. Warum "einfach alle Preise verzehnfachen" nicht reicht

Der Samenkatalog (`garden/core/catalogue.js`) ist NICHT frei skalierbar wie
Rucksack oder Eier. Jeder Preis dort ist gegen Wachstumszeit und Verkaufswert
tariert — die Datei ist voller `// Balancing:`-Kommentare, die genau diese
Rechnung dokumentieren (z. B. Kohl: "war 76-228 (garantierter Verlust)").
Kaufpreis pauschal hochskalieren, ohne Wachstumszeit und Verkaufswert im selben
Verhältnis mitzuziehen, reißt diese Rechnung wieder auf — dieselbe Klasse Fehler,
die dort gerade erst repariert wurde.

Zwei Sinks sind zusätzlich strukturell ENDLICH, keine Preiserhöhung ändert das:

- **Spitzhacke**: gedeckelt durch `STEINFELDER_GESAMT` (196 Steinfelder) — wer
  das Grundstück freigelegt hat, kann keine Ladung mehr sinnvoll kaufen. Absicht
  (verhindert Hortung nutzloser Ladungen), keine Lücke.
- **Schaufel/Kiste/Vitrine**: einmalige Meilensteine. Ihren Preis zu erhöhen
  hilft nur zukünftigen Neueinsteigern, nicht Bestandsspielern, die sie längst
  besitzen — für das akute Problem wirkungslos.

Was WIRKLICH fehlt, ist nicht "teurer", sondern **neue Sachen, in die
beliebig oft Gold fließen kann**, ohne die botanische Balance anzufassen. Genau
danach fragt Punkt 4 der ursprünglichen Anfrage auch: Prestige, Shop, "andere
neue Sachen".

## 2. Bausteine, nach Aufwand sortiert

### A — Weitere Zahlen-Skalierung (klein, jederzeit nachziehbar)

- **Neue Seltenheitsstufe über MYTHIC.** Technisch güns­tig: Pflanzen sind
  Emoji-basiert (`emoji: "🌼"` etc.), kein Sprite nötig — eine neue Stufe kostet
  kein neues Artwork, nur eine durchgerechnete Preis/Wachstum/Verkauf-Zeile nach
  demselben Muster wie Mondblume (aktuell einziger MYTHIC-Eintrag: 50 Mrd.
  Kaufpreis, 65–195 Mrd. Verkauf, 0,025 % Ladenchance). Aufwand: eine
  durchgerechnete Katalogzeile, kein Code-Umbau.
- **Werkzeug-Meilensteine (Schaufel/Kiste/Vitrine) in Stufen statt einmalig.**
  Aktuell `art: "einmalig"` in `werkzeug.js` — z. B. "Vitrine II" mit mehr
  Plätzen für mehr Gold wäre strukturell dieselbe Änderung wie der
  Rucksack-Deckel eben. Aufwand: mittel (neue Kapazitätskonstanten,
  Frontend-Anzeige, aber kein neues System).
- **Grenzen dagegen bewusst NICHT anfassen:** `GOLD_MAX` (9 Billiarden) liegt
  weit über allem hier Geplanten und muss vorerst nicht angerührt werden.

Realistischer Zeitrahmen: einzelne Sitzung, kein eigenes Projekt.

### B — Kosmetischer Gold-Sink-Shop (mittel)

Idee aus der ursprünglichen Anfrage: etwas, das rein für Prestige gekauft wird,
ohne jede Ertrags-Erwartung — Preis kann also beliebig hoch stehen, ohne
irgendeine ROI-Rechnung zu verletzen.

Heute gibt es DAFÜR noch keine Infrastruktur: alle Skins in `wardrobe.js` sind
**level-gated, nicht gold-gated** (`istFreigeschaltet` prüft nur `ab: <Level>`).
Ein Gold-Shop bräuchte eine zweite Freischaltungs-Dimension und — anders als bei
neuen Samen — **echtes Artwork**: `wardrobe.js` referenziert PNG-Dateien unter
`Frontend/public/garden-assets/wardrobe/`, keine Emoji. Neue Farmer-Skins,
Geister oder Deko-Varianten brauchen also entweder von dir gelieferte Bilder
oder generierte Assets.

Naheliegender Umfang für eine erste Version:
- Neue Deko-Varianten (Deko ist bereits ein reines Kosmetik-System, siehe
  `garden/core/deko.js` — der Shop-Mechanismus existiert, nur die Preisspanne
  ist noch klein) mit Preisen, die bewusst in die Milliarden/Billionen gehen.
- ODER Farbvarianten/Sonder-Skins für den Farmer, die nicht am Level, sondern an
  einem Gold-Kauf hängen (`gruppe: "farbe"` bzw. neue Gruppe `"kauf"` in
  `wardrobe.js`, Prüfung serverseitig genau wie bei den Geistern).

Aufwand: mittel — neue Katalogstruktur + Serverprüfung (analog `wardrobe.js`),
plus Asset-Entscheidung von dir (liefern oder generieren lassen). Eigene
Sitzung, kein Nebenbei-Fix.

### C — Prestige-System mit Space-Reskin (groß)

Die Idee aus der Anfrage: Reset bei z. B. 50 Billionen, danach Farm, Pflanzen,
Tiere und Skins im Space-Stil, mit einer bleibenden Belohnung.

Das ist ein eigenständiges Feature, kein Nebenbei-Fix:

- **Reset-Mechanik**: was genau resettet (Gold sicher; Rucksack-Level, Skills,
  Ladenbestand? Feld-Erweiterungen?) und was bleibt (Tiere? Freundschaften/
  Feld-Manager-Rechte? Deko-Platzierungen?) muss Zeile für Zeile durch
  `compactFarmState` und alle Migrationen durch — jedes Feld, das falsch
  behandelt wird, ist ein Item, das verschwindet oder dupliziert wird.
- **Bleibende Belohnung**: ein Multiplikator, ein Skill-Bonus, ein exklusiver
  Skin — muss so gewählt sein, dass er den Reset lohnend macht, ohne die
  Erst-Progression für neue Spieler zu entwerten (dieselbe Welt ist geteilt,
  Prestige-Spieler und Erstspieler laufen nebeneinander).
- **Space-Reskin**: JEDE Pflanze (57 Sorten), Tiere, Farmer-Skins UND das
  Grundstück selbst bräuchten eine zweite visuelle Variante. Bei
  Emoji-Pflanzen ggf. günstiger (andere Emoji-Auswahl + Tönung?), bei
  Tieren/Skins/Deko sind es echte neue Bild-Assets — der mit Abstand größte
  Aufwandsposten im ganzen Vorschlag.
- **Multiplayer-Konsequenz**: die Welt ist geteilt (`garden/world/lobby.js`,
  6 Plätze je Welt, seit Feedback 01.09. — war 8). Ein Prestige-Spieler neben
  fünf Nicht-Prestige-Spielern auf demselben Grundstücksraster braucht eine
  durchdachte Antwort — eigene Welt-Kategorie? Eigenes Grundstück? Das ist
  eine Design-Entscheidung, keine technische.

Aufwand: großes, eigenständiges Projekt (mehrere Sitzungen), braucht vorab
Antworten auf die vier Punkte oben, bevor überhaupt Code sinnvoll ist.

## 3. Offene Entscheidungen, bevor B oder C startet

Bei Bedarf einfach eine neue Sitzung mit Verweis auf dieses Dokument anfangen —
diese Fragen sind der Startpunkt, nicht vorher zu beantworten nötig:

1. **B zuerst oder C zuerst?** B liefert schneller ein spürbares Ergebnis, C ist
   das größere, aber langsamer wirksame Ziel.
2. **Assets für B/C**: lieferst du Bilder, oder sollen sie generiert werden
   (`generate_mesh`/`generate_material` o. ä. existieren aktuell nur für die
   Roblox-Studio-Anbindung, nicht fürs Garden Game — für 2D-Sprites bräuchte es
   einen anderen Weg)?
3. **Für C: Reset-Schwelle und was genau übersteht ihn** — konkrete Zahl statt
   "z. B. 50 Billionen", und eine Feld-für-Feld-Liste (Gold/Rucksack/Skills/
   Tiere/Deko/Ladenbestand).
4. **Für C: die bleibende Belohnung** — Prozent-Multiplikator? Exklusiver Skin?
   Beides?
