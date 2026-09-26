# Ideen-Katalog

*Entwurf zum Durchsehen. Streichen und Ergänzen erwünscht, danach wird daraus je Eintrag ein Modul
unter `gen/world/ideen/`.*

**Gebaut (Stand 25.09.2026):** Kernideen #9 Sägen im Takt, #10 Laser-Ampeln, #25 Ein Element,
#12 Zwei Wege, #19 Schlüsselkette, #5 Bröckelkette, #11 Sprungpad-Ketten, #21 Die Decke lebt, #20 Wandsprung-Schluchten (die letzten sechs über Motive:
Ideen-Räume in `gen/world/motive/ideenraeume.js`, Höhlen-Räume, Turm-Stockwerke). Als Teil dieser Räume steckt auch
Signature-Moment #32 „Der Rückwärtssprung" drin (Schlüsselkammer, Variante `rueckweg`). Alles andere
ist weiterhin Entwurf.

Gebaut wird alles aus dem vorhandenen Vorrat, damit nichts erfunden werden muss, was die Sim nicht
kann: **Kacheln** fest · Eis · klebrig · Förderband ←→ · Einweg · Anker. **Elemente** Mover ·
Portal · Gravitationszone · Wind · Bröckelblock · Fallblock · Feder · Ring · Kristall · Schalter ·
Tür · Schlüssel · Laser (auch drehend) · Säge (auch mehrere je Bahn, auch kreisend) · Spike (auch
einfahrend) · Farbblock. **Können** Laufen · Sprung · Doppelsprung · Dash · Wandsprung · Grapple ·
Gravitationswechsel.

Wo ein Eintrag mit **(neu)** markiert ist, braucht er eine Erweiterung der Sim — die würde ich
einzeln vorschlagen, nicht nebenbei einbauen.

---

## 1. Welttypen

Deine zehn plus sechs eigene.

| # | Welttyp | Form | Hauptmechaniken | Kamera |
| --- | --- | --- | --- | --- |
| 1 | **Himmelsreich** | kaum fester Block, schwebende Inseln, Abgrund überall | Grapple, Doppelsprung, Mover, Wind | horizontal |
| 2 | **Hindernis-Parcours** | völlig ebener Boden, dichte Gefahrenfolge | Timing, Dash, Sprungpads | horizontal |
| 3 | **Turm** | senkrecht nach oben, Wandsprung-Schächte | Wandsprung, Mover, Feder | aufwärts |
| 4 | **Abgrund-Sturz** | senkrecht nach unten, Hindernisse im freien Fall | Fallsteuerung, Dash, Ausweichen | abwärts |
| 5 | **Höhlen & Minen** | der heutige Generator | alles gemischt | horizontal |
| 6 | **Fabrik** | rechteckige Architektur, Räume und Gänge | Förderband, Schalter, Tür, Laser, Presse | horizontal |
| 7 | **Portal-Labyrinth** | getrennte Räume, nur über Portale verbunden | Portal, Momentum | gemischt |
| 8 | **Gravitations-Tempel** | Decken- und Bodenläufe gleichwertig | Gravitationszone | horizontal |
| 9 | **Eiswelt** | glatte weite Flächen, lange Anläufe | Momentum, weite Sprünge | horizontal |
| 10 | **Ruinen / Burg** | zerfallende Architektur, Fallen | Bröckel, Fallblock, Schlüssel & Tür | horizontal |
| 11 | **Kanalisation** *(eigene)* | enges Röhrennetz, niedrige Decken, Einwegplatten | Förderband als Strömung, Tunnelrouten | gemischt |
| 12 | **Vulkan** *(eigene)* | steigende Todeslinie von unten | Tempo erzwungen, Aufstieg | aufwärts |
| 13 | **Neon-Stadt** *(eigene)* | Dächer mit tiefen Schluchten dazwischen | Grapple über Straßen, Wind zwischen Türmen | horizontal |
| 14 | **Dschungel** *(eigene)* | dichte Ankerfelder als Lianen, Etagen im Blätterdach | Grapple-Ketten, Federn | gemischt |
| 15 | **Uhrwerk** *(eigene)* | alles läuft auf EINEM globalen Takt | Rhythmus lesen | horizontal |
| 16 | **Windkanal** *(eigene)* | dauerhaft starker Wind, Geometrie karg | Wind ausnutzen statt bekämpfen | horizontal |

---

## 2. Kernideen (25)

Eine pro Level, nach dem Bogen **einführen → variieren → zuspitzen → brechen**.

| # | Kernidee | Ein Satz |
| --- | --- | --- |
| 1 | Verschwindende Anker | Jeder Grapple-Anker löst sich nach dem Loslassen auf. |
| 2 | Alles auf Förderbändern | Kein Boden steht still. |
| 3 | Die Abkürzung ist immer oben | Jeder Abschnitt hat eine schnelle Oberlinie mit weiten Sprüngen. |
| 4 | Jeder Checkpoint dreht die Gravitation | Nach jedem Checkpoint läuft man an der Decke. |
| 5 | Bröckelkette | Jede Plattform zerfällt beim Betreten — kein Zurück. |
| 6 | Ein Schalter, ein Level | Ein einziger Schalter kippt den Zustand der ganzen Welt. |
| 7 | Der Boden steigt | Eine Gefahrenlinie kriecht von unten nach — Tempo ist Pflicht. |
| 8 | Dash-Diät | Nur eine Dash-Ladung; Kristalle sind die Lebensader. |
| 9 | Sägen im Takt | Alle Sägen teilen sich einen Rhythmus. |
| 10 | Laser-Ampeln | Laser als Ampeln: gehen, halten, gehen. |
| 11 | Sprungpad-Ketten | Man berührt fast nie den Boden, nur Federn. |
| 12 | Zwei Wege, eine Wahl | Jeder Abschnitt gabelt sich: sicher-langsam oder riskant-schnell. |
| 13 | Türme aus Fallblöcken | Alles Feste fällt, sobald man es belastet. |
| 14 | Der Wind dreht sich | An jedem Checkpoint kehrt der Wind seine Richtung um. |
| 15 | Portale in Sichtweite | Zu jedem Eingang ist der Ausgang sichtbar — Planen statt Raten. |
| 16 | Enge und Weite | Klaustrophobische Tunnel wechseln mit riesigen Sprüngen. |
| 17 | Eis nur an den Wänden | Böden normal, Wände glatt: kein Wandsprung, nur Rutschen. |
| 18 | Der lange Fall | Das Level führt nur nach unten, jeder Abschnitt ist ein gesteuerter Sturz. |
| 19 | Schlüsselkette | Jeder Schlüssel öffnet die Tür zum nächsten Schlüssel. |
| 20 | Wandsprung-Schluchten | Schmale Senkrechte, nur mit Wandsprüngen zu nehmen. |
| 21 | Die Decke lebt | Alle Gefahr kommt von oben. |
| 22 | Momentum-Pflicht | Förderband und Eis: wer zu langsam ankommt, schafft den Sprung nicht. |
| 23 | Rückwärts | Die zweite Hälfte ist die erste, gespiegelt und rückwärts gebaut. |
| 24 | Sichtbare Zukunft | Der nächste Abschnitt ist immer schon zu sehen, bevor man ihn betritt. |
| 25 | Ein Element, alle Rollen | Nur EINE Gefahrenart im ganzen Level, aber in jeder denkbaren Anordnung. |

---

## 3. Extrem-Varianten (25)

Deine sieben plus achtzehn eigene. Kompromisslos, angekündigt mit eigenem Titelbild
(„EXTREM: Laser-Hölle"), ~10 % der Level. **Kein Rückfall auf normale Elemente** — repariert wird
innerhalb der Idee.

| # | Name | Kompromisslos heißt hier |
| --- | --- | --- |
| 1 | Kein Boden | Außer Start, Ziel und Checkpoint-Inseln kein fester Block. |
| 2 | Laser-Hölle | Dutzende Laser mit verschiedenen Zyklen; man tanzt durch die Lücken. |
| 3 | Eine Taste weniger | Kein Doppelsprung — oder nur Grapple und Dash. **(neu: Level-Tuning)** |
| 4 | Nur Wände | Fast alles ist Zickzack in Schächten. |
| 5 | Alles zerfällt | Jede Plattform bröselt; keine Pause, kein Zurück. |
| 6 | Portal-Wahnsinn | Mehr Portale als Plattformen. |
| 7 | Dauerlauf | Die Kamera scrollt von selbst; Stehenbleiben ist tödlich. **(neu: Auto-Scroll)** |
| 8 | Nadelbett *(eigene)* | Der ganze Boden ist einfahrender Spike; sicher ist nur ein Zeitfenster. |
| 9 | Kristall-Abhängig *(eigene)* | Dash füllt sich NUR an Kristallen — und die sind knapp. |
| 10 | Schwerkraft-Pendel *(eigene)* | Die Gravitation kippt im festen Takt, ohne dein Zutun. |
| 11 | Sägen-Regen *(eigene)* | Sägen fallen ununterbrochen von oben, das ganze Level lang. |
| 12 | Kein Halt *(eigene)* | Jede Fläche ist Eis; es gibt nirgends Bremsweg. |
| 13 | Blindflug *(eigene)* | Sichtradius auf wenige Kacheln geschrumpft. |
| 14 | Ein Sprung *(eigene)* | Kein Doppelsprung, kein Dash — nur Laufen und ein Sprung. **(neu)** |
| 15 | Sturmfront *(eigene)* | Der Wind kehrt alle zwei Sekunden um, in voller Stärke. |
| 16 | Fließband-Hölle *(eigene)* | Jede Fläche ist Förderband, die meisten gegen dich. |
| 17 | Der Schlund *(eigene)* | Eine steigende Todeslinie über das ganze Level; reines Tempo nach oben. |
| 18 | Die Presse *(eigene)* | Decke und Boden fahren zyklisch zusammen; man läuft durch schließende Spalten. |
| 19 | Nur Federn *(eigene)* | Der Sprung ist gesperrt; Fortbewegung nur über Federn und Ringe. **(neu)** |
| 20 | Kettenreaktion total *(eigene)* | Das ganze Level ist EINE ausgelöste Kaskade; man reitet sie oder stirbt. |
| 21 | Spiegellauf *(eigene)* | Das Level läuft von rechts nach links — Start rechts, Ziel links. |
| 22 | Ein Checkpoint *(eigene)* | Genau einer, in der Mitte. |
| 23 | Portalsturz *(eigene)* | Ein endloser Fall durch Portalschleifen; man steuert, landet aber nie. |
| 24 | Uhrwerk-Tod *(eigene)* | Ein globaler Takt, auf dem JEDE Gefahr feuert; man bewegt sich im Takt. |
| 25 | Nadelöhr-Marathon *(eigene)* | Das ganze Level ist eine Folge enger Dash-Lücken. |

---

## 4. Signature-Momente (35)

Deine fünf plus dreißig eigene. Einzelne befriedigende Stellen, 1–3 pro Level eingestreut.
Jeder Eintrag: **Mechaniken · Schwierigkeit (1–5) · passende Welttypen · Varianten**.

| # | Name | Was passiert | Mechaniken | Schw. | Welttypen | Varianten |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Grapple-Schwung in die Lücke | Großer Schwung über den Abgrund, im richtigen Moment loslassen, genau in einen schmalen Spalt fliegen | Grapple | 4 | 1, 13, 14 | Spalthöhe, Schwungweite, Richtung |
| 2 | Nadelöhr-Dash | Dash zwischen zwei Sägen, genau wenn sie sich öffnen | Dash, Säge | 4 | 2, 5, 6 | Sägenzahl, Öffnungsdauer, waagerecht/senkrecht |
| 3 | Portal-Kanone | In ein Portal fallen, mit voller Geschwindigkeit seitlich herausschießen, weit fliegen | Portal | 3 | 7, 11 | Fallhöhe, Austrittswinkel, Ziel eng/weit |
| 4 | Kettenreaktion | Ein Schalter löst eine sichtbare Abfolge aus, auf der man mitreitet | Schalter, Fallblock, Mover | 3 | 6, 10, 15 | Kettenlänge, Tempo, Richtung |
| 5 | Fall ins Ungewisse | Langer Sturz mit spät sichtbaren Hindernissen und sicherem Landepunkt | Fallsteuerung | 3 | 4, 5, 12 | Tiefe, Hindernisdichte, Landebreite |
| 6 | Der Absprung | Feder schleudert quer über den Bildschirm in einen Wandsprung-Fang | Feder, Wandsprung | 3 | 3, 13 | Weite, Wandhöhe, Winkel |
| 7 | Doppeltes Nadelöhr | Zwei Sägenlücken hintereinander, je ein Dash, kein Boden dazwischen | Dash, Säge | 5 | 2, 6 | Abstand, Phasenversatz |
| 8 | Ankerwechsel | Einen Anker loslassen und in der Luft sofort den nächsten fassen | Grapple | 4 | 1, 13, 14 | Ankerabstand, Höhenversatz, Kettenlänge |
| 9 | Der Aufzug | Auf einem Mover hochfahren, während Laser den Schacht queren | Mover, Laser | 3 | 3, 6, 12 | Fahrdauer, Laserzahl, Zyklus |
| 10 | Wandsprung-Treppe | Abwechselnde Wandsprünge eine sich weitende Schlucht hinauf | Wandsprung | 3 | 3, 5, 10 | Weitungsrate, Höhe, Gefahr an den Wänden |
| 11 | Der Sturzflug | Dash nach unten durch einen engen Schacht in eine knappe Landung | Dash | 4 | 4, 11 | Schachtbreite, Tiefe, Landefläche |
| 12 | Brückenschlag | Eine Fallblock-Brücke, die hinter einem zusammenbricht | Fallblock | 2 | 10, 6 | Länge, Verzögerung, Lücken |
| 13 | Das Tor | Ein Schalter öffnet die Tür für 1,5 s — der Schalter liegt einen Sprung entfernt | Schalter, Tür | 3 | 6, 10 | Offenzeit, Entfernung, Weg dazwischen |
| 14 | Ringkette | Drei Boost-Ringe im Bogen über einem Abgrund | Ring | 2 | 1, 13, 15 | Ringzahl, Bogenform, Abstand |
| 15 | Gegenwind-Sprung | Ein Sprung, der nur in der Böenpause gelingt | Wind | 4 | 1, 16, 13 | Böenzyklus, Weite, Windstärke |
| 16 | Der Schlüsselwurf | Der Schlüssel liegt auf einem Mover, der in die Gegenrichtung fährt | Schlüssel, Mover | 3 | 6, 10 | Movertempo, Bahnlänge |
| 17 | Das Fenster | Ein drehender Laser lässt einen Keil frei — hindurchlaufen | Laser (drehend) | 4 | 6, 15 | Drehtempo, Keilbreite, Strecke |
| 18 | Aufsetzer | Auf einem Bröckelblock landen und sofort weiterspringen | Bröckel | 2 | 10, 5 | Bröckelzeit, Kettenlänge, Abstand |
| 19 | Die Schaukel | Grapple-Schwung, der im Scheitel losgelassen werden muss, um eine Deckenkante zu nehmen | Grapple | 5 | 1, 14 | Kantenhöhe, Ankerposition |
| 20 | Der Kamin | Enger Senkrechtschacht mit Wandsprüngen, während Spikes ein- und ausfahren | Wandsprung, Spike | 5 | 3, 10, 12 | Schachthöhe, Spike-Zyklus, Breite |
| 21 | Konvoi | Drei Mover in Reihe, von einem auf den nächsten | Mover | 2 | 1, 6, 11 | Tempo, Abstand, Gegenrichtung |
| 22 | Der Knick | Ein Förderband trägt dich in eine Wand — im richtigen Moment springen | Förderband | 2 | 6, 11 | Bandtempo, Wandhöhe |
| 23 | Spiegelsprung | Eine Gravitationszone kippt dich mitten im Sprung; man landet an der Decke | Gravitationszone | 4 | 8, 7 | Zonenhöhe, Sprungweite |
| 24 | Das Loch im Boden | Der Boden öffnet sich und man fällt in die eigentliche Route | Fallblock/Spike | 2 | 5, 10, 11 | Lochbreite, Fallhöhe |
| 25 | Der zweite Anlauf | Eine Lücke, zu weit für einen Sprung — eine Feder mitten in der Luft macht sie möglich | Feder | 3 | 1, 9 | Federhöhe, Gesamtweite |
| 26 | Sägenschere | Zwei Sägen kommen von beiden Seiten; in der Mitte hindurch | Säge | 4 | 2, 6 | Anfahrttempo, Lückenbreite |
| 27 | Der Vorhang | Eine Laserwand mit einer wandernden Lücke — seitlich mitlaufen | Laser | 3 | 6, 15 | Wanderrichtung, Tempo, Strecke |
| 28 | Kaltstart | Ein Eis-Anlauf in einen Weitsprung: zu langsam heißt Absturz | Eis, Momentum | 3 | 9, 5 | Anlauflänge, Sprungweite |
| 29 | Das Karussell | Eine Säge kreist um genau den Anker, den man greifen muss | Grapple, Säge | 5 | 1, 14 | Kreisradius, Drehtempo |
| 30 | Der Dominoweg | Fallblöcke lösen sich der Reihe nach aus; man läuft vor ihnen her | Fallblock | 3 | 10, 6 | Kettenlänge, Verzögerung |
| 31 | Enge Passage | Eine Lücke von einer Kachel, nur per Dash auf exakter Höhe | Dash | 5 | 2, 6, 11 | Höhe, Länge, Anflugrichtung |
| 32 | Der Rückwärtssprung | Um weiterzukommen, muss man erst zurückspringen | — | 2 | 5, 7, 10 | Tiefe, Sichtbarkeit |
| 33 | Trampolinschacht | Ein Schacht, der über Federn an den Wänden erklommen wird | Feder, Wandsprung | 3 | 3, 12 | Federzahl, Winkel, Höhe |
| 34 | Die Gabelung | Zwei sichtbare Wege — einer ist eine Falle, erkennbar für den, der hinschaut | — | 2 | alle | Auffälligkeit der Falle, Zeitgewinn |
| 35 | Auge des Sturms | Ein Raum voller drehender Laser mit einem sicheren Pfad durch die Mitte | Laser (drehend) | 5 | 6, 15 | Laserzahl, Drehrichtung, Raumgröße |

---

## 5. Mutatoren (15)

Selten (~10 %), kombinierbar mit Welttyp und Kernidee. Alles aus dem Seed abgeleitet, damit Server
und alle Spieler dasselbe sehen.

| # | Mutator | Wirkung | Anmerkung |
| --- | --- | --- | --- |
| 1 | Niedrige Schwerkraft | Höhere, langsamere Sprünge | **(neu: Level-Tuning)** |
| 2 | Doppeltes Tempo | Alles schneller | **(neu)** |
| 3 | Nacht | Nur ein Sichtradius um den Spieler | rein optisch, keine Sim-Änderung |
| 4 | Gespiegelt | Das Level ist waagerecht gespiegelt | im Generator, keine Sim-Änderung |
| 5 | Dauerwind | Wind von links über das ganze Level | vorhandenes Element |
| 6 | Karge Checkpoints | Halb so viele Checkpoints | — |
| 7 | Glatt *(eigene)* | Alle Böden verhalten sich wie Eis | Kachelaustausch |
| 8 | Mürbe *(eigene)* | Bröckelblöcke zerfallen merklich schneller | Parameter |
| 9 | Schwerer Kopf *(eigene)* | Mehr Schwerkraft, kürzere Sprünge | **(neu)** |
| 10 | Klebrig *(eigene)* | Alle Wände haften; Rutschen wird langsamer | Kachelaustausch |
| 11 | Doppelt getaktet *(eigene)* | Alle zyklischen Elemente laufen doppelt so schnell | Parameter |
| 12 | Nebel *(eigene)* | Hintergrund aus, Farben gedämpft, weniger Kontrast | rein optisch |
| 13 | Kompakt *(eigene)* | Level ein Viertel kürzer, dafür dichter | Generator |
| 14 | Geisterjagd *(eigene)* | Der Geist der aktuellen Bestzeit läuft sichtbar mit | Geist-System existiert |
| 15 | Umgekehrte Reihenfolge *(eigene)* | Die Zonen laufen in umgekehrter Folge | Generator |

---

## 6. Was noch fehlt, um das alles zu bauen

| Fehlt | Betrifft | Kosten |
| --- | --- | --- |
| Feinabstimmung am LEVEL (statt nur als Aufruf-Option) | Extrem 3, 14, 19 · Mutator 1, 2, 9 | Änderung in `sim/` → **SIM-Fingerprint bricht einmal** |
| Auto-Scroll-Kamera + Todeslinie hinter der Kamera | Extrem 7 | Sim + Client |
| Steigende Todeslinie | Welttyp 12 · Kernidee 7 · Extrem 17 | neues Element oder Sonderfall |
| Sichtradius | Extrem 13 · Mutator 3 | nur Client |
| Sprung sperren | Extrem 19 | Teil der Level-Feinabstimmung |

Alles andere in diesem Katalog lässt sich mit dem heutigen Vorrat bauen.
