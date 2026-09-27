# Zirkel – Deck-Welten für Sacrifice & Sigils

Ein **Zirkel** ist eine in sich geschlossene Deck-Welt: eigene Ressourcen, eigene Stämme bzw. Klassen, eigene Sigils,
eigene Nebendecks, eigene Pfadknoten und ein eigener Look. Heute gibt es genau einen Zirkel, den **Moor-Zirkel**
(`moor`: Blut, Knochen, Wachs, Tiere aus dem Aschemoor). Dieses Dokument beschreibt die technische Grundlage und drei
Konzepte für neue Zirkel. Karten für neue Zirkel werden erst gebaut, wenn die Konzepte abgenommen sind.

Alle Konzepte sind eigenständig erfunden. Sie übernehmen keine Namen, Figuren, Karten oder Regeln aus Inscryption.

---

## 1. Architektur (umgesetzt)

Ein Zirkel ist ein reines Datenpaket (`engine/zirkel/<id>.js`, registriert in `engine/zirkel/index.js`):

```js
{
  id: "moor",
  name: "Moor-Zirkel",
  resources: [ { id: "blood", … }, { id: "bones", … }, { id: "wax", … } ],
  tribes: TRIBES,             // Stämme bzw. Klassen
  cards: CARDS,               // alle Karten des Zirkels (inkl. Nebendeck- und Folgeformen)
  sigils: SIGILS,             // Sigil-Definitionen inkl. Hooks
  sideDeckTypes: SIDE_TYPES,  // Nebendeck-Typ -> Karten-ID
  pathNodeTypes: NODE_TYPES,  // Knotentypen des Pfads mit Gewichten
  events: EVENTS,             // seltene Pfad-Ereignisse
  theme: { palette, font, table, … },
}
```

- Das Match speichert `settings.zirkel`. Die Engine holt Ressourcen, Sigils, Nebendecks und Pfadknoten über
  `zirkelOf(match)` bzw. `getZirkel(id)` aus dem Paket, statt sie fest einzubauen.
- Der bisherige Inhalt ist der Zirkel `moor`; das Verhalten ist unverändert (alle Tests grün).
- Lobby-Option „Zirkel“: beide spielen denselben Zirkel. „Gemischt“ (jeder seinen eigenen) ist sichtbar, aber
  ausgegraut („bald“) und wird von der Engine abgelehnt, bis mindestens zwei Zirkel existieren.

**Was ein neuer Zirkel mitbringen muss**

| Teil | Pflicht | Hinweis |
|---|---|---|
| Ressourcen | ja | Moor-Ressourcen haben feste Namen in der Engine (`blood/bones/wax`). Neue Ressourcen brauchen einen eigenen Ressourcen-Hook (Zugbeginn, Kosten, Anzeige), siehe Konzepte. |
| Karten + Sigils | ja | gleiche Kartenstruktur (`defineCards`), Sigils mit denselben Hooks wie heute. |
| Nebendecks | ja | mindestens 1, ideal 3. |
| Pfadknoten | ja | eigene Knoten ergänzen die gemeinsamen (Kartenwahl, Händler, Lagerfeuer …). |
| Theme | ja | Palette, Material, Schrift, Kartenrücken, Sound-Set. |
| KI-Bewertung | später | `cardScore` liest heute nur Werte + Sigil-Power, das reicht für den Start. |

---

## 2. Konzept A: Uhrwerk-Zirkel

**Welt.** Eine verlassene Turmstadt, deren Uhrmacher vor langer Zeit verschwunden sind. Ihre Automaten laufen weiter:
Kupferkäfer, Taubenmaschinen, Glockenwächter, Messingritter. Jeder Mechanismus trägt eine Seriennummer und eine
Aufgabe, an die er sich nicht mehr erinnert. Im Kampf ziehen zwei Zeichner an denselben Schlüsseln.

**Ressourcenmechanik: Federspannung**
- Zu Beginn jedes eigenen Zugs baut sich **Federspannung** auf: +2, höchstens 8. Nicht ausgegebene Spannung bleibt,
  „überdreht“ aber: über 6 verliert man am Zugende 1 (die Feder schnappt nach).
- Karten kosten Spannung beim **Ausspielen** (z. B. „Kosten 3 Spannung“).
- Viele Konstrukte haben **aktivierbare Fähigkeiten** („Aufziehen: 2 Spannung – +2 Angriff bis Zugende“). Jede
  Fähigkeit höchstens einmal pro Zug; die Kosten stehen als kleines Zahnrad am Sigil.
- **Zahnrad-Sockel:** Jeder Spieler hat drei Sockel neben dem Feld. Bestimmte Karten („Getriebe-Karten“) setzen beim
  Ausspielen ein Zahnrad in einen freien Sockel. Karten mit dem Vermerk „braucht 2 Zahnräder“ lassen sich erst
  spielen, wenn so viele Sockel belegt sind. Wird eine Getriebe-Karte zerstört, fällt ihr Zahnrad heraus.
- Es gibt kein Opfern. Stattdessen **Ausschlachten**: Ein eigenes Konstrukt vom Feld nehmen gibt seine halben Kosten
  als Spannung zurück (abgerundet) und 1 **Bauteil** für die Pfad-Phase.

**Konstrukte aus Bauteilen (Pfad-Phase).** Karten sind Konstrukte. In der Pfad-Phase montiert man sie:
Ein Konstrukt besteht aus **Rahmen** (bestimmt Leben und Grundkosten), **Antrieb** (Angriff) und bis zu zwei
**Modulen** (Sigils). Draft und Pfad liefern Bauteile statt fertiger Karten; der Knoten „Werkbank“ setzt sie zusammen.
Das Deck besteht also aus selbst gebauten Maschinen, deren Werte transparent aus den Teilen folgen.

**8 Beispiel-Sigils**
1. **Aufziehen (n):** Aktivierbar, n Spannung: +2 Angriff bis Zugende.
2. **Schwungrad:** Nicht ausgegebene Spannung am Zugende gibt diesem Konstrukt +1 Leben (höchstens +3).
3. **Kettenglied:** Greift ein benachbartes eigenes Kettenglied an, greift dieses Konstrukt direkt danach dieselbe Lane an.
4. **Getriebe:** Beim Ausspielen: setzt ein Zahnrad in einen freien Sockel.
5. **Pendel:** Wechselt am Zugende zwischen „Angriff“ und „Abwehr“ (+2 Angriff oder +2 Leben).
6. **Überdruck:** Stirbt es, erleidet die gegnerische Karte gegenüber 2 Schaden.
7. **Taktgeber:** Eigene aktivierbare Fähigkeiten kosten 1 Spannung weniger (mindestens 1).
8. **Rost:** Verliert am Ende jedes eigenen Zugs 1 Leben, kostet aber 2 Spannung weniger.

**Klassen (statt Stämme)**
- **Glockenwächter** – schwere Verteidiger mit Pendel und Schwungrad.
- **Kupferkäfer** – billige Schwärme, Getriebe-Lieferanten.
- **Taubenwerke** – fliegende Uhrwerkvögel, schnelle Direktschaden-Konstrukte.
- **Ritter aus Messing** – teure Kämpfer, die zwei Zahnräder brauchen.
- **Laufwerke** – bewegliche Maschinen (Wandern, Kettenglied).
- **Pfeifenorgeln** – Unterstützer, die Spannung weitergeben.

**Nebendecks:** Schraubenwichtel (0/1, beim Ausschlachten +1 Spannung), Zahnradkiste (0/2, Getriebe), Ölkanne (0/1, heilt 1).

**Besondere Pfadknoten**
- **Werkbank:** Aus Bauteilen ein neues Konstrukt montieren oder ein Modul tauschen.
- **Schrottplatz:** Ein Konstrukt zerlegen, alle Bauteile behalten.
- **Uhrturm:** Wähle: +1 maximale Federspannung für den nächsten Kampf oder ein zusätzlicher Zahnrad-Sockel.
- **Ersatzteilhändler:** Bauteile gegen Splitter.

**Artstyle.** Palette: Messing (#b08d57), gealtertes Kupfer mit Grünspan (#4f7f6a), Ruß (#1c1a17), Emaille-Weiß für
Zifferblätter, ein warmes Signal-Orange für aktive Fähigkeiten. Material: technische Zeichnung auf vergilbtem
Blaupausenpapier, Schraffur wie in alten Patentschriften, Zahnräder als Kartenrahmen-Ecken. Silhouetten: geometrisch,
sichtbare Nieten, Schlüssel im Rücken, Glaskuppeln mit Mechanik darin. Keine Gesichter, höchstens Zifferblätter.

**Sound-Stimmung.** Ticken als Grundpuls (Tempo steigt mit der Waage), Federn, die sich spannen, Zahnräder, die
einrasten, Glockenschläge bei Treffern, ein tiefes Brummen alter Transformatoren als Ambient.

---

## 3. Konzept B: Gezeiten-Zirkel

**Welt.** Eine versunkene Küstenstadt, zweimal am Tag trocken, zweimal überflutet. Zwischen Kirchtürmen, die aus
dem Watt ragen, leben Muschelvolk, Ertrunkene, Tangwesen und Möwenschwärme. Wer hier kämpft, kämpft mit dem Wasser.

**Ressourcenmechanik: Gezeitenstand und Salz**
- Ein gemeinsamer **Gezeitenstand** läuft für beide Spieler: Ebbe → steigend → Flut → fallend, je ein Schritt pro
  Runde (beide Züge). Er ist offen sichtbar und vorhersagbar.
- Jede Karte hat eine **Gezeitenbedingung** (spielbar nur bei Ebbe, nur bei Flut oder immer) und kostet **Salz**.
- Salz gewinnt man, wenn eigene Karten in der **Uferreihe** (Hinterreihe) einen eigenen Zug überstehen: +1 je Karte.
- Bei Flut sind alle Hinterreihen „unter Wasser“: Karten dort können nicht angegriffen werden, aber auch nicht
  nachrücken. Bei Ebbe liegen Schätze frei: wer eine leere Lane hat, zieht bei Ebbe am Zugbeginn eine Nebendeck-Karte.

**8 Beispiel-Sigils**
1. **Brandung:** Bei Flut +2 Angriff.
2. **Watt-Läufer:** Bei Ebbe darf die Karte in eine beliebige leere Lane wandern.
3. **Gezeitenschild:** Bei steigendem Wasser: der erste Treffer pro Zug wird aufgehoben.
4. **Sog:** Zieht am Zugende die gegnerische Frontkarte gegenüber in die Hinterreihe, wenn dort frei ist.
5. **Salzkruste:** Nimmt höchstens 2 Schaden pro Treffer.
6. **Muschelgrab:** Stirbt es, wird es zu einer Muschel (0/2), die bei Ebbe 1 Salz gibt.
7. **Leuchtfeuer:** Solange es lebt, sieht der Besitzer die oberste Karte seines Decks.
8. **Treibgut:** Kostet kein Salz, verschwindet aber bei der nächsten Flut.

**Stämme:** Muschelvolk (Verteidiger, Salz), Ertrunkene (kehren bei Flut zurück), Tangwesen (Kontrolle, Sog),
Möwenschwärme (fliegend, klein), Leuchtturmwärter (Unterstützer, Information).

**Nebendecks:** Strandkrabbe (0/1, Watt-Läufer), Seepocke (0/2), Treibholz (0/1, beim Tod +1 Salz).

**Besondere Pfadknoten**
- **Gezeitentümpel:** Eine Karte bekommt eine andere Gezeitenbedingung.
- **Wrack:** Durchsuchen: zufälliges Item oder Fluch-Karte.
- **Leuchtturm:** Sieh die nächsten zwei Knoten beider Stränge vor der Wahl.

**Artstyle.** Palette: Schiefergrau-Blau (#3e5563), Seegras-Oliv (#6d7a3e), Sandbeige (#d8c9a5), Rost von
Ankerketten (#8a4b2a), Schaumweiß. Material: Aquarell auf salzfleckigem Papier, Ränder gewellt wie nass gewordenes
Papier. Silhouetten: rund und schwer (Muscheln, Glocken, Bojen), lange Tangfäden, Möwen als wenige Striche.

**Sound-Stimmung.** Brandung als Atem des Kampfes (Flut laut, Ebbe fast still), ferne Kirchenglocken unter Wasser,
knarrendes Holz, Möwenrufe als Akzente bei Direktschaden.

---

## 4. Konzept C: Sternwarten-Zirkel

**Welt.** Ein Observatorium auf einem Berg über den Wolken. Die Sterndeuter haben die Sternbilder vom Himmel
geholt und in Glas gegossen; nun streiten zwei Deuter darum, wessen Himmel gilt. Karten sind Himmelskörper,
Instrumente und Sternbild-Wesen.

**Ressourcenmechanik: Sternlicht aus Konstellationen**
- **Sternlicht** entsteht aus der **Anordnung** der eigenen Karten: Am Zugbeginn gibt jedes Muster auf dem Feld Licht,
  zum Beispiel drei Karten in einer Reihe nebeneinander (+2), zwei Karten übereinander in derselben Lane (+1),
  alle vier Lanes besetzt (+3).
- Karten kosten Sternlicht. Licht verfällt am Zugende zur Hälfte (abgerundet).
- **Nachtzyklus:** Jeder Kampf beginnt in der Dämmerung; ab Zug 6 ist Nacht (Muster geben +1 zusätzlich), ab Zug 14
  Morgengrauen (Muster geben 1 weniger). Das begrenzt lange Kämpfe auf natürliche Weise.
- **Fernrohr-Aktion** statt Hammer: einmal pro Zug 2 Licht zahlen und die oberste Karte des Decks ansehen und
  wahlweise unter das Deck legen.

**8 Beispiel-Sigils**
1. **Leitstern:** Zählt für Muster als zwei Karten.
2. **Umlaufbahn:** Tauscht am Zugende den Platz mit der Karte in der Nachbarlane (im Uhrzeigersinn).
3. **Sonnenwind:** Greift an und schiebt die getroffene Karte eine Lane weiter.
4. **Finsternis:** Beim Ausspielen: die gegnerische Karte gegenüber gibt in ihrem nächsten Zug kein Licht und greift nicht an.
5. **Komet:** Kann in den ersten zwei Zügen nach dem Ausspielen nicht geblockt werden, stirbt danach.
6. **Linse:** Verdoppelt das Licht des ersten Musters, zu dem es gehört.
7. **Gravitation:** Gegnerische Karten in Nachbarlanes können nicht wandern.
8. **Sternstaub:** Stirbt es, bleibt ein Sternstaub-Plättchen (0/1) liegen, das in Mustern zählt.

**Klassen:** Planeten (schwer, zentral), Kometen (schnell, vergänglich), Instrumente (Unterstützer, Fernrohr, Linse),
Sternbild-Wesen (Jäger, Bär, Schwan – je nach Muster stärker), Deuter (Kartenvorteil).

**Nebendecks:** Glasmurmel (0/1, zählt für Muster), Sternenkarte (0/1, beim Ziehen 1 Licht), Messinstrument (0/2).

**Besondere Pfadknoten**
- **Planetarium:** Ordne die Reihenfolge der nächsten fünf Karten deines Decks für den nächsten Kampf.
- **Glasbläserei:** Eine Karte bekommt „Leitstern“ oder „Linse“.
- **Himmelskarte:** Tausche ein Muster-Ziel (z. B. „drei in einer Reihe“ gegen „Diagonale“) für dein Deck.

**Artstyle.** Palette: Nachtblau (#141b33), Tintenviolett (#3a2e55), Goldfolie (#caa45a), Kreideweiß für Sternlinien,
ein kaltes Türkis für Licht. Material: Kupferstich-Himmelsatlas, Goldprägung, feine Punktraster für Nebel.
Silhouetten: aus Sternen und Verbindungslinien gebaute Tiere, runde Planeten mit Ringen, Messinginstrumente.

**Sound-Stimmung.** Glasharfe und leise Chöre als Ambient, helle Glockenspiel-Töne beim Entstehen von Mustern,
tiefe Gongs bei Finsternis, ein Uhrwerk des Teleskops, das sich dreht, wenn die Waage kippt.

---

## 5. Nächste Schritte (nach Abnahme)

1. Ressourcen-Hooks verallgemeinern (Zugbeginn-Gewinn, Kostenprüfung, Anzeige) und Moor darüber abbilden.
2. Pro Zirkel: 40–60 Karten, 16–24 Sigils, 3 Nebendecks, 3–4 eigene Pfadknoten, Theme.
3. KI: `cardScore`/`evaluateBattle` pro Zirkel ergänzen (Muster, Gezeiten, Spannung).
4. Balancing-Tool: Zirkel als Parameter, Vergleich Zirkel gegen Zirkel erst mit „gemischt“.
