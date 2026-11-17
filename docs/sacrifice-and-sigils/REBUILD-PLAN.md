# Sacrifice & Sigils — Rebuild-Plan „Am Tisch“

Stand: 15.11.2026 · Status: **Phasen 0 bis 3 abgenommen · der neue Tisch ist Standard · Phase 4 gebaut: das ganze Match läuft an einem Tisch (Draft, Totem-Wahl, Pfadkarte, Pfad-Szenen, Kampf, Rast, Ergebnis). Draft bis Ergebnis vom Nutzer bestätigt („passt so“), Pfadkarte und Hauptmenü am Tisch abgenommen („passt so“, 15.11.2026) · Phase 5 abgenommen (15.11.2026, mit Rückmeldungen umgesetzt: Statistik raus, „Aufstehen“-Zettel, Figur läuft auf der Karte, **Regeländerung: Totems nur noch am Schrein**) · Phase 6 gebaut: die ganze Moorwanderung am Tisch (Startdeck, Pfad, Kämpfe, Lager mit Nachbartischen, Duell-Ankündigung, Siegelbruch, Podest, NPC-Masken, Boss-Phasenwechsel; 15.11.2026), **Abnahme offen** · Balancing-Frage Moorling-Totem offen** · ersetzt nichts in `PLAN.md` (Regeln und Engine bleiben gültig)

## Übergabe (Stand 16.11.2026, Phase 7 gebaut) — hier anfangen

**Phase 7 (16.11.2026, Ausbauplan „ss-phase7“, Spur D) — gebaut, getestet, wartet auf Deploy (nur Frontend), Abnahme offen.**
Entscheidung des Nutzers vorab: **hochkant bleibt der flache Tisch** (kein eigener Hochkant-Tisch; Hinweis + Wechsel beim
Drehen). Drei Schritte:
- **Handy:** `useWideEnough()` in `ui/table/useAtTable.js` (eine Regel statt vier Kopien; folgt Drehen/Fenstergröße,
  schaltet nicht, solange ein Eingabefeld den Fokus hat — Bildschirmtastatur). Hochkant: leise Zeile in der Hülle
  „Quer halten …“ (`prefs.rotateHintOff`). Die Einflug-Fahrt des flachen Tischs nur einmal je Tab (`Table3DLayer`,
  sonst nach dem Zurückdrehen 4 s leeres Feld). Touch: das zuletzt Angetippte zeigt seine Erklärung (`touchTip` in
  `tableRoom.js`), Hilfetexte im Pausenmenü für Finger (`ui/table/touch.js`: `isTouch`, `helpFor`). Flache Fenster
  (`max-height: 500px`): Menü, Lobby-Zeile, Meldung, Buch, Erzähler-Blatt kompakt; Kartengröße im Buch folgt der Höhe.
- **Tastatur + Screenreader:** `ui/table/TableMirror.jsx` (in TableHost, aus bei Menü und Buch: `mirror={false}`) —
  unsichtbare Knöpfe in Gruppen (Hand, Brett 4×4, Karten auf dem Tisch, Pfadkarte, Gegenstände), Tab je Gruppe, Pfeile,
  Eingabe/Leertaste = Klick, I = Rechtsklick. Szene: `targets()`, `subscribeTargets`, `setFocus` (gilt wie der Zeiger:
  Karte hebt sich, onHover kommt an der Bildschirmlage), `trigger`, `screenOf`; `pathMap.marks()`. Beschriftungen in
  `ui/table/mirrorText.js`. Erklärungen gehen über eine feste Live-Zone der Hülle an den Screenreader.
- **Leistung:** Ruhe-Drosselung im Tisch (`wake()`, `CALM_AFTER_S` 1,5 s, dann ~30 Bilder/s; gemessen 27,6 statt
  165 Bilder/s in Ruhe), Schärfe auf Touch-Geräten ≤ 1,5×, `stats().frames`. Sparmodus: kein 3D-Hintergrund und kein
  Kerzenflackern am flachen Tisch (Software-Grafik: Bildzeit im Mittel 6 ms statt 12–43 ms), Hinweis in den
  Einstellungen. „Animationen reduzieren“ war am Tisch schon durchgängig (geprüft).
- Prüfung: Skripte im Scratch-Ordner der Sitzung (Handy 667×375/844×390 mit Touch, Drehen, Tastatur-Zug mit drei Opfern,
  alle Phasen per Tastatur, Lobby mit zwei Browsern, Leistung); dazu `menue` (Kartenbuch-Prüfung an Phase 5 angepasst),
  `buch`, `tutorial`, `vorkampf`, `nachkampf`, `lobby`, `kampf`, `szenen`, `lager`, `moor`, `onlineDraft`, `takt` grün,
  173 Tests grün. **Nicht geprüft:** echtes Handy, echter Screenreader (NVDA/VoiceOver).

### Übergabe zu Phase 6 (Stand 16.11.2026, abgenommen)

**Abnahme Phase 6 (16.11.2026, Prüfliste „Abnahme Spiele“):** alle acht Punkte „passt“ — Startdeck und Pfad, Kampf mit
Gestalten und Masken, Pfad-Boss mit Phasenwechsel, Lager und Nachbartische, Duellrunde und Siegelbruch, Podest, Späherturm
(jetzt auch vom Nutzer gesehen), schmalere Gestalt und leisere Effekte. Ohne Notizen. Nächster Schritt: **Phase 7**
(Handy, Sparmodus, Zugänglichkeit), im Ausbauplan „ss-phase7“, Spur D nach „adVentures fürs Handy“.

### Übergabe zu Phase 6 und davor (Stand 15.11.2026)

**Rückmeldung des Nutzers zu Phase 5 (15.11.2026):** „Lobby sieht gut aus“ · Statistik rausnehmen („zu kompliziert,
nicht wichtig“) · mehr Animation, z. B. die Figur auf der Karte · Totem direkt nach dem Draft „ein bisschen OP (auch
mit dem Moorling-Effekt) → erst mit Pfad freischaltbar“ · nach dem Ende schwer zurück ins Menü („Kerze anmachen für
Rematch checke ich eher“) · dann Phase 6. Umgesetzt:
- **Ergebnis:** keine Statistik-Seite mehr (`fullResult`/`onStats` entfernt); Zettel **„Aufstehen“** (rot umrandet,
  rechts vorn neben dem Stapel, `TableResult`) führt ins Hauptmenü; Meldung nennt ihn. Übungs-Fixtures führen beim
  Verlassen jetzt ins Menü.
- **Figur auf der Pfadkarte** (`battle/table3d/pathMap3d.js`): Anlauf (Ducken, 0,16 s), vier Hüpfer mit Stauchen und
  Strecken (1 s), Nachfedern am Ziel (0,34 s), ein heller Ring breitet sich aus; Schritte im Hüpftakt (`TableMap`).
  `GameScreen` hält die Karte nach der Wahl `WALK_HOLD_MS = 1500` liegen, erst dann kommt die Szene (nicht bei
  „Animationen reduzieren“).
- **Regeländerung „Totem am Schrein verdienen“** (vom Nutzer gewählt aus drei Varianten): nach dem Draft kein Totem,
  keine Phase „extras“ mehr (Code bleibt nur für alte, laufende Spielstände); `generateMap` setzt auf Ebene 1 immer
  einen Totem-Schrein (eigener Zufallsstrom „schrein“); der Schrein bietet ohne Totem drei **fertige** Totems
  (`scene.first`, Stamm nach Deck gewichtet, Lane mit Eigenschaft, Moorling mit Nebendeck-Sigil), Nehmen setzt es gleich
  auf; danach wie bisher Teile + Umbauen. KI: ohne Totem Schrein-Priorität 9. Am Tisch stehen die drei als
  geschnitzte Figuren mit Namensschild (`figures` im Szenen-Baukasten → `choices`). Anleitung und Ortstext angepasst.
  Spiegel neu (`npm run spiegel -- sigils`, Fingerabdruck cbe62874…) — **Backend mit ausliefern**.
  Tests: Extras-Tests ersetzt (kein Totem nach dem Draft, Schrein auf Ebene 1, erstes Totem fertig, späterer Besuch
  wie bisher); Best-of-Test prüft die Splitter jetzt am Kampfergebnis. 173 Tests grün, Server-Tests grün.
- **Gemessen (60 KI-Matches):** alle laufen durch, 2,45 Kämpfe je Match; 80 % haben vor Kampf 1 ein Totem (der Rest
  sind meist „leichte“ KIs, die den Schrein nicht ansteuern); die KI wählt fast immer das **Moorling-Totem** (94 von 96)
  — ihre Bewertung hält es für das stärkste. Offener Balancing-Punkt, mit dem Nutzer zu klären (z. B. Moorling-Totem erst
  beim zweiten Schrein-Besuch oder schwächere Opfer-Sigils).
- Prüfskripte: `figur.cjs` (neu: Bildfolge der laufenden Figur, Szene erst nach der Landung); `vorkampf.cjs` und
  `onlineDraft.cjs` ohne Totem-Wahl, dafür Schrein auf Ebene 1; `nachkampf.cjs` prüft „Aufstehen“ statt Statistik.
  `locate` zielt bei Kerzen auf die Mitte des (heruntergebrannten) Wachses.

**Phase 6, Schritt 1 (15.11.2026): Kämpfe der Moorwanderung am Tisch.** NPC-, Elite-, Boss-Kämpfe und Duelle laufen
am Tisch: `GameScreen` nimmt ein Paket `table` (Maske, Titel, Zettel, Tooltip, Aufgeben-Text) und geht damit trotz
eigener Kopfzeile (`bar`, nur noch am bisherigen Tisch) an den Tisch; `RunBattle` liefert es. NPCs tragen eine Maske
nach Silhouette (`ui/run/npcMask.js`: Vogel → Rabe, Gehörn/Vierbeiner → Geweih, Wurzel/Pilz/Koralle → Rinde,
Falter/Insekt → Halbmond, Gebein → Dreiauge, Kerze → Wachsstrich, sonst aus dem Namen; Bosse ohne Zuordnung Dreiauge).
Zettel „lauf“ links neben dem Brett (x −51, z 16,5): Gegner, Hausregel (bei Bossen mit „Phase 2“), Siegel beider;
Tooltip mit Details. Pausenmenü fragt „Den ganzen Run aufgeben?“ (`TablePause.surrenderText`). Boss-Auftritt bleibt die
bisherige Einblendung (z 95, über dem Tisch). Prüfung: `tools/tisch/moor.cjs` (Fixtures fight/boss/duel/bossStart,
Masken verschieden, Ausweichweg) — grün.
**Phase 6, Schritt 2 (15.11.2026): Startdeck und Pfad der Moorwanderung am Tisch.**
- Pfad: `ui/run/RunTablePath.jsx` nutzt `TableMap`/`TableScene` über `pathView` (jetzt `ui/run/pathView.js`) mit Paket
  `run`: statt des Gegenüber-Zettels ein Zettel „Mitspieler“ links (Kurzstatus, voller Text im Tooltip), Stundenglas =
  Pfad-Budget (durchgehender Schlüssel `run:<pfad>`, kein Umdrehen je Ebene), Aufgeben fragt nach dem ganzen Run,
  Pausen-Unterzeile mit Runde/Siegeln/Splittern. Gegenüber sitzt niemand (`seated={false}`); wird ein Kampf-Ort gewählt,
  setzt sich die NPC-Gestalt an denselben Tisch (Hinsetz-Bewegung, Szene nicht neu gebaut). Vor Szenen-Orten läuft die
  Figur erst (1,5 s); vor Kämpfen beginnt der Kampf sofort (sonst könnte die KI vorziehen, ohne dass man es sieht).
  Run-Szenen im Baukasten: `reward` (drei Karten, Splitter/Item im Text) und `scout` (Mitspieler als Zettel, bekannte
  Karten liegen aus) — `scout` ist **nicht geprüft** (keine Probe dafür). Fortschrittsleiste (`RunProgressBar`) am Tisch
  ausgeblendet.
- Startdeck: `ui/run/TableStarter.jsx` — drei Auslagen (je 2 × 4 Karten, x ±32, je Deck leicht gedreht), Namensschild
  mit Idee und Moorling-Sigil; Karte/Schild wählt, Stempel/Leertaste bestätigt; Rechtsklick: Kartenblatt.
- Prüfung: `tools/tisch/moorpfad.cjs` (Startdeck, Pfad, Mitspieler-Zettel, Szenen-Ort mit Weg der Figur, Kampf-Ort mit
  hinsetzender NPC-Gestalt am selben Tisch, Belohnung, Ausweichweg) — grün; dazu `moor.cjs`, `vorkampf.cjs`, `szenen`.
**Phase 6, Schritt 3 (15.11.2026, „Rest von Phase 6“): alles Übrige der Moorwanderung am Tisch — Phase 6 gebaut.**
- Lager + Duellrunde ohne eigenes Duell (auch ausgeschieden/Zuschauer): `ui/run/TableCamp.jsx`, Stage `camp`. Blatt
  „Lager“ (x −14, z −30) neben der Feuerschale (22, −30), Zettel je Kampf (`tisch:<key>`, bis 3 × 2, z −12/−1,5,
  drei Zeilen), Mitspieler-Zettel (−55, 15), eigener Stapel fächert das Deck auf, Zettel „Totems umbauen“ (50, −22)
  öffnet `TotemBench` als Blatt. Hourglass = Pfad-Budget (`run:<pfadNr>`).
- Blick auf Nachbartische: Zettel anklicken → `TableBattle` mit `you=null` und `displayFromView({ battle })` (keine
  Ereignisse für Zuschauer → nur Stände, keine Animationen), Gestalt setzt sich (Maske/Krone nach NPC), Blick „seite“.
  Zettel liegen dabei an der vorderen Kante (z 53/63, `ry 0.85` zur Seitenkamera) — links neben dem Brett lagen sie
  klein unter der Knochenschale. `TableBattle` hat dafür `run.onNote`. Endet der Kampf, geht es von selbst zurück.
- Duell-Ankündigung: `ui/run/TableRunFx.jsx` `TableDuelAnnounce` — RunGame zeigt sie am Tisch **vor** RunBattle
  (kind `announce`); Paarungen als Zettel nacheinander (380 ms), eigene mit Wachsrand; jeder Klick/Leertaste/Esc
  überspringt (Fenster-Listener, weil die Szene Klicks auf leeres Holz nicht meldet).
- Siegelbruch: Szene `room.lifeSealBreak({x,z})` — Wachssiegel (zwei halbe Scheiben mit geprägtem Ring, Bruchkante in
  dunklem Wachs) fällt bei z 22, zittert, springt, sinkt nach 3 s weg; `TableSealBreak` setzt unten eine Zeile
  (`.st-banner-low`; oben lag sie über den Blättern der Szenen). Bei „Animationen reduzieren“ liegt es gleich gebrochen.
- Ende: `ui/run/TableRunResult.jsx` — Blatt mit Sieger, Podest als Modellfeld `podium` (Szene: gebeizte Holzblöcke
  wachsen nacheinander aus dem Tisch, Lebenssiegel obenauf, Ziffer vorn), Namenszettel `platz:<q>` fächern das Deck
  auf, Rangliste links, Kerze = neuer Run (`game.lobby.rematch`), „Aufstehen“. Fortschrittsleiste am Tisch nie mehr.
- Masken: vier NPC-Masken nur für Gestalten (`masks.js` `NPC_MASK_IDS`, `cleanFigureMask`; Server kennt sie nicht):
  Kiemen (Fisch, Robbe), Muschel, Eisen (Gebautes), Schuppe (Schlange). Bosse tragen eine Dornenkrone über der Stirn
  (`figure.setDecor`, `TableHost oppCrown/oppCracked`, `npcDecor`). Phasenwechsel: Szene spielt `bossPhase` (Hände
  heben → Sprung in der Maske + Glut → beide Fäuste auf den Tisch). RunBattle nimmt die Phase **beim Hinsetzen**
  (useState), sonst käme der Sprung über die Sicht vor der Animation.
- Prüfung: `tools/tisch/lager.cjs`, `momente.cjs`, `runende.cjs`, `masken.cjs` (Phasenwechsel per `room.play`
  ausgelöst — kein Fixture kurz vor Ende von Phase 1) — grün; dazu `moor`, `moorpfad`, `vorkampf`, `nachkampf`, `kampf`.
- **Nicht geprüft:** Duellrunde aus Sicht Ausgeschiedener/Zuschauer am Tisch (kein Fixture), Online-Run mit mehreren
  echten Spielern (Kerze für neuen Run: Zustand anderer aus `game.room.seats[].rematch` angenommen), Scout-Szene.

### Übergabe zu Phase 5 (gebaut)

**Neu (15.11.2026, Schritte 3 und 4, „direkt weitermachen mit Phase 5“):** Lobby, Buch und Tutorial hat der Nutzer
noch nicht gesehen — Phase 5 als Ganzes zur Abnahme vorlegen, dann Phase 6 (Moorwanderung).
- **Buch des Zeichners** (`ui/table/TableBook.jsx` + `book.css`): Kartenbuch und Anleitung als ein Buch über dem Tisch
  (Szene bleibt stehen, Blick „brett“, Stage `book`). Lesebändchen = Kapitel Regeln · Karten · Sigils · Allerlei;
  `/kartenbuch` und `/anleitung` schlagen das passende auf. Seiten = CSS-Spalten (`column-width` = Seitenbreite,
  feste Höhe, `column-fill: auto`), geblättert wird per `translateX` um einen Aufschlag; Seitenzahl aus
  `scrollWidth`. Karten als Sammelalbum (inline-block, vier je Seite: `cardW = pageW/4 − 13`), nach Stämmen;
  `.sb-album` braucht `orphans/widows: 1`, sonst schiebt der Spaltensatz zwei Kartenreihen auf die nächste Seite.
  Inhalt geteilt mit den Ausweich-Seiten: `GuideContent` (GuidePage.jsx), `SigilLexicon`/`CodexMore`
  (`pages/codexParts.jsx`), `useCodexCards` (`pages/codexData.js`). Die Anleitung erklärt jetzt die Bedienung am Tisch.
- **Tutorial am Tisch:** `GameScreen` nimmt `pauseExtra` (Knopf im Pausenmenü, an `TableBattle` → `TablePause`);
  das Tutorial läuft damit am Tisch. Hinweise als Erzähler-Blatt oben links (`.st-narrator` in theme.css — der erste
  Hinweis kommt, bevor table.css geladen ist), Texte je Tipp für Tisch (`table`) und bisherigen Tisch (`text`), neuer
  Hinweis „Zug beenden“. Kein autoFocus auf „Verstanden“: die Leertaste beendet am Tisch den Zug.
- `ui/table/useAtTable.js`: eine Regel „am Tisch oder flach?“ (Buch, Tutorial; Menü und Raum rechnen noch selbst,
  gleiche Regel).
- Prüfung: `tools/tisch/buch.cjs` (Menü → Buch an derselben Szene, Blättern per Pfeil/Taste/Rad, Filter, Kartenblatt,
  Kapitel, Verweis, Esc, drei Größen, nichts ragt über die Seite, Ausweichweg) und `tools/tisch/tutorial.cjs`
  (Blatt verdeckt nichts, Hinweisfolge, Ziehen, Leertaste, Neustart aus dem Pausenmenü, „Keine Hinweise mehr“,
  Ausweichweg) — grün; dazu `vorkampf`, `sonderfaelle`, `menue`, 171 Tests (der Emoji-Test verbietet Pfeilzeichen in
  Texten — Beschriftungen mit Worten).

**Als Nächstes:** Abnahme von Phase 5 (Menü ✓, Lobby, Buch, Tutorial), dann Phase 6 — Moorwanderung am Tisch.

### Übergabe zu Schritt 2 (Lobby)

**Neu (15.11.2026, Schritt 2): Lobby am Tisch und ein Tisch vom Menü bis ins Match.** Der Nutzer hat Pfadkarte und
Hauptmenü mit „passt so“ abgenommen und um Fortsetzung gebeten; die Lobby hat er noch nicht gesehen.
- **Ein Tisch für alles:** Die Szene gehört jetzt der Hülle (`ui/table/TableKeeper.jsx`, Zugang über
  `tableKeeperContext.js`). Bildschirme am Tisch melden sich über `TableHost` an (gleiche Schnittstelle wie bisher,
  die Match-Bauteile sind unverändert); ihre Bedienelemente landen per Portal im `.st-root` der Hülle. Ist niemand
  mehr am Tisch, steht die Szene noch 4 s (`KEEP_MS`, für Seitenwechsel und nachladende Bildschirme) und wird dann
  abgebaut. Der Zirkel wird am stehenden Tisch getauscht (`room.setZirkel`: Holz, eingeritzte Felder, Rinne).
  `table.css` lädt weiter mit `TableHost` — in der Hülle geladen, verlor es gegen `.ss-paper { position: relative }`
  aus `theme.css` (Meldungen waren dann unsichtbar).
- **Hinsetzen:** `setPresence({ seated })` lässt die Gestalt in 0,9 s aus dem Dunkel heran- und heraufkommen bzw.
  wieder verschwinden (`sit` im Bildtakt); der erste Bildschirm bestimmt beim Bau, ob schon jemand sitzt.
- **Lobby** (`ui/table/TableLobby.jsx`, Kamera `lobby`): sechs Zettel mit den Einstellungen (Gastgeber klickt um,
  der Gast bekommt eine Meldung), Stempel/Leertaste = bereit, der Stempel des Gegenübers wird von seiner Hand gedrückt
  (`room.oppStamp()`), Knarren beim Hinsetzen. Oben eine Zeile: Code, Link kopieren, Seed (Gastgeber), Zuschauerzahl,
  Einstellungen, Aufstehen. Gesten in der Lobby — dafür erlaubt der Server `ss:gesture` jetzt auch im Status
  `lobby` (außer Zeigen); **Backend mit ausliefern**. `RoomPage` wählt Tisch-Lobby oder `LobbyScreen` wie das Menü;
  während der Verbindung bleibt der Tisch stehen („Verbinde …“).
- Prüfung: neues `tools/tisch/lobby.cjs` (Menü → Lobby → Draft an einer Szene, Hinsetzen mit Maske, Zettel umstellen,
  Gast darf nicht, Geste, Aufstehen und wieder hinsetzen, beide stempeln, Zuschauer) und `menue.cjs` um den Weg ins
  Kartenbuch erweitert; `online.cjs`, `onlineDraft.cjs`, `onlineRevanche.cjs` bedienen jetzt die Lobby am Tisch
  (Leertaste, Zettel „Draft“). Dazu `vorkampf`, `nachkampf`, `szenen scene`, `sonderfaelle`, 171 Tests, 10 Raum-Tests,
  Produktions-Build — alles grün, Konsole sauber. `locate({ type: "seal" })` zielt jetzt auf den Griff;
  `pickAtScreen(x, y)` sagt Prüfskripten, was unter einem Punkt liegt. Prüfskripte müssen zweimal zielen: die Kamera
  folgt leicht der Maus und verschiebt in flachen Blicken die Gegenstände um bis zu 30 px.

**Als Nächstes in Phase 5:** (3) Kartenbuch und Anleitung als Buch · (4) Tutorial am neuen Tisch mit Erzähler-Blatt.

### Übergabe zu Schritt 1 (Hauptmenü)

**Neu seit der letzten Übergabe (15.11.2026):** Phase 5, Schritt 1 — **das Hauptmenü am Tisch**. Statt des
Pergament-Formulars steht man im dunklen Raum am Tisch: Kerzen, der Platz gegenüber ist leer (die Gestalt fehlt, bis
jemand sich setzt), auf dem Tisch liegen die drei Karten des Tages (anklicken = Kartenblatt). Das Menü sind sieben
Zeilen am linken Rand; die Erklärung erscheint nur für die Zeile unter dem Zeiger. Die Website-Leiste ist weg —
Einstellungen, Ton und „Website“ stehen klein unter dem Menü. „An einen Tisch setzen“ fragt den Code in derselben
Spalte ab, „Übung“ zeigt Gegner, Zirkel, Draft, Siege, Pfad und Seed als Wortwahl und startet direkt (das bisherige
Übungsformular bleibt für direkte Aufrufe von `/uebung`). Der Nutzer hat das Menü noch nicht gesehen, und die
Rückmeldung zur Pfadkarte am Tisch steht weiter aus.
Aufbau: `ui/table/TableMenu.jsx` + `menu.css`; `HomeScreen.jsx` wählt (neuer Tisch, breit genug, WebGL) zwischen
Tisch-Menü und bisherigem Menü (`FlatHome`). Szene: Kamera `raum`, `setPresence({ seated: false })` (Gestalt und
ihr Stempel fehlen), lose Karten dürfen gedreht liegen (`ry`), ausgeblendete Teile zählen beim Anklicken nicht mehr.
`TableHost` kennt `seated` und `quiet` (keine Lademeldung). Die Hülle reicht `openSettings` weiter.
Prüfung: `tools/tisch/menue.cjs` (vier Bildgrößen, Erklärzeile, Karte des Tages, Beitreten, Einstellungen, Übung →
Draft am Tisch, ohne Namen, Ausweichweg alt/hochkant), dazu `vorkampf.cjs`, `zug.cjs`, `nachkampf.cjs` und
171 Tests — alles grün, Konsole sauber.
**Bewusst noch nicht:** Menü → Match ist ein Schnitt (die Szene wird neu gebaut, weil sie bisher dem Match gehört);
ein durchgehender Tisch vom Menü über die Lobby ins Match ist der nächste Schritt zusammen mit der Lobby.

**Als Nächstes in Phase 5:** (2) Lobby als Hinsetzen am selben Tisch — Einstellungen als Zettel, das Gegenüber setzt
sich, wenn es beitritt; dafür muss die Szene von der Hülle statt vom Match gehalten werden · (3) Kartenbuch und
Anleitung als Buch · (4) Tutorial am neuen Tisch mit Erzähler-Blatt.

### Übergabe zu Phase 4 (Stand 15.11.2026)

**Wo wir stehen:** Phasen 0 bis 3 sind abgenommen. Rückmeldung des Nutzers am 14.11.2026 zu Phase 2 und 3: die
Effekte waren „noch leicht laut“, sonst gut · der Körper der Gestalt wirkte „ein bisschen dick“ · „neuer Tisch
Standard machen“. Umgesetzt: alle Effekte rund 3 dB leiser (`SFX_TRIM` in `audio/sound.js`), die Gestalt ist
schmaler (`scene/figure.js`: Mantel, Schultern, Ärmel), und der neue Tisch ist Standard.
Danach entstand Phase 4 in vier Schritten: **Draft und Totem-Wahl**, **Rast, Ergebnis und Revanche**, **alle
Pfad-Szenen**, zuletzt die **Pfadkarte** — alles am Tisch. Zu den ersten drei Schritten schrieb der Nutzer am
15.11.2026 „passt so... bitte mit dem vorgeschlagenen weitermachen“ (vorgeschlagen war: die Pfadkarte an den Tisch
holen). Die Pfadkarte am Tisch ist gebaut und geprüft, von ihm aber noch nicht gesehen. Ein Match läuft jetzt vom
Draft bis zum Ergebnis an **einer** Szene, die nie neu aufgebaut wird; die alte 3D-Szene (`battle/table3d/`) braucht
das Match am Tisch nicht mehr.
**Nichts davon ist committet** — alle Änderungen liegen im Arbeitsverzeichnis (neu: `ui/table/`, `tools/tisch/`,
`Frontend/public/media/sfx/`, dieses Dokument; geändert u. a. `ui/GameScreen.jsx`, `ui/anim/*`, `audio/sound.js`,
`ui/prefs.js`, `ui/Shell.jsx`, `net/useOnlineGame.js` und im Backend `sacrificeSigils/roomManager.js` + `socket.js`).

**Als Nächstes:**
1. Rückmeldung zur Pfadkarte am Tisch einholen (Lage und Größe der Karte, Vorschau am Mauszeiger, Deck auffächern).
2. Dann Phase 5 (Abschnitt 4): Hauptmenü im Raum, Lobby als Hinsetzen, Kartenbuch und Anleitung als Buch, Tutorial
   am neuen Tisch.
3. Kür aus Phase 4, nur auf Wunsch: eigene Gegenstände für die Szenen, die heute aus Blatt, Karten und Zetteln
   bestehen (Nadel und Faden, Schnitzbrett, Tintenfass des Kopisten, Knochenschale …); Gesten außerhalb des Kampfs;
   Figur des Gegenübers auf der Karte (heute steht sein Fortschritt auf einem Zettel).
4. Offen aus der Rückmeldung zu Phase 3: ob die schmalere Gestalt und die leiseren Effekte so passen (dazu kam
   keine Antwort).
**Vor dem Ausliefern:** Gesten und Masken brauchen den neuen Stand von `Backend/sacrificeSigils/` — also das Backend
mit ausliefern („beides“) bzw. lokal neu starten. Ein alter Server stört nicht: Gesten verfallen dann still, alle
tragen die Standardmaske.

**Geprüft am 14.11.2026** (Skripte unten, alle ohne Konsolenfehler): ganzer Kampf gegen die KI · Sonderfälle
(Abwerfen bei Handlimit, Seher, Pinzette, Item ohne Ziel, Item auf eigenes Feld, Vorpreschen, Totem unter dem Zeiger,
Tauchen, Verwandlung, Niederlage mit verlöschenden Kerzen) · Hotseat · Online-Match mit zwei Browsern und einem
Zuschauer (Masken, Zug des Gegenübers, Stundenglas, Gesten in beide Richtungen, Verbindung weg und wieder da) ·
„Animationen reduzieren“ · Produktions-Build samt Online-Match im gebauten Stand.
**Nicht geprüft:** der Klang (nie angehört) · echte Touch-Bedienung (langes Drücken fürs Gestenrad) · ein Match
zwischen zwei echten Rechnern · wie die Hände in Bewegung wirken (nur in Bildfolgen gesehen) · Faustschlag und Item
des Gegenübers (die KI hat beides in den Läufen nicht benutzt).

**Welcher Tisch läuft:** Der neue Tisch ist Standard (`useNewTable` in `ui/prefs.js`). Am bisherigen Tisch spielt,
wer in den Einstellungen „Bisheriger Tisch im Kampf“ wählt (`prefs.oldTable`; auch im Pausenmenü: „Zum bisherigen
Tisch wechseln“), wessen Browser ohne Grafikkarte rendert (Sparmodus, `utils/lowGfx.js`, `?gfx=low`) oder kein WebGL
kann (weicht von selbst aus). Moorwanderung und Hochkant laufen weiter am bisherigen Tisch (das Tutorial seit Phase 5 am neuen). Für einen
einzelnen Aufruf: `?tisch=neu` / `?tisch=alt`. Die Maskenwahl steht in den Einstellungen; Gesten: Rechtsklick auf
den Tisch oder Taste G.
Dev-Stände (`ui/dev/fixtures.js`): `/sacrifice-and-sigils/uebung?fixture=showcase&ki=1` (volles Brett,
KI spielt weiter), `fixture=oppturn&ki=1` (Zug der KI ansehen: ziehen, opfern, legen, stempeln), `fixture=attack4`
(Taktmessung), `fixture=checks` / `lose` (Sonderfälle, Niederlage), `fixture=gz-battle` (Gezeiten); `&hotseat=1`
= zu zweit an einem Gerät.

**Prüfen ohne Hinsehen** (Bilder landen im Temp-Ordner unter `ss-tisch/`): im Ordner `Frontend` →
`node src/pages/SacrificeSigils/tools/tisch/<name>.cjs`. Die Skripte erwarten den Dev-Server auf 5173; ein anderer
geht mit `SS_BASE=http://localhost:<port>`.
- `zug.cjs` — ein Zug: nehmen, drei Opfer, legen, stempeln, Zug des Gegners, ziehen, Pause, Karte ansehen
- `kampf.cjs [fixture]` — ganzer Kampf gegen die KI mit Bildzeiten
- `takt.cjs [fixture]` — Zeitpunkte aller Ereignisse der Angriffsphase + Bildfolge
- `gegenstaende.cjs` — Schere, Hammer, Tooltip
- `sonderfaelle.cjs` — Abwerfen, Seher, Pinzette, Items, Vorpreschen, Totem, Tauchen/Verwandlung, Niederlage, Hotseat
- `gegenueber.cjs [zug|gesten|masken|glas|alles]` — die Gestalt: Zug der KI als Bildfolge, sechs Gesten, Gestenrad,
  Masken, Stundenglas, Verbindungsverlust, Zuschauerblick
- `vorkampf.cjs [draft|gz-draft]` — vom Draft (die KI wählt mit) über Totem-Wahl und Pfad (Marken auf der Karte
  anklicken, Szenen spielen) bis in den ersten Kampf; prüft, dass es die ganze Zeit dieselbe Szene ist. `SS_REDUCED=1` = mit
  „Animationen reduzieren“
- `szenen.cjs [filter]` — alle 8 Szenen und 11 Ereignisse des Pfads einzeln: Bild, Handlung, verlassen
- `nachkampf.cjs` — Rast (wer beginnt) → Kampf · letzter Kampf → Ergebnis · Kerze → Revanche · volle Statistik
- `onlineRevanche.cjs` — Ergebnis und Revanche online mit zwei Browsern (Aufbau wie bei `online.cjs`)
- `menue.cjs` — Hauptmenü am Tisch: Bilder in vier Größen, Untermenüs, Übung bis in den Draft, Kartenbuch, Ausweichwege
- `lobby.cjs` — Lobby am Tisch mit zwei Browsern und Zuschauer (braucht `onlineServer.cjs` wie `online.cjs`)
- `buch.cjs` — Buch des Zeichners: Kapitel, Blättern, Filter, Kartenblatt, drei Größen, Ausweichweg
- `tutorial.cjs` — Tutorial am Tisch: Erzähler-Blatt, Hinweisfolge, Neustart, Ausweichweg
- `figur.cjs` — Figur auf der Pfadkarte: Bildfolge des Wegs, Szene erst nach der Landung
- `moor.cjs` — Moorwanderung: NPC-, Boss- und Duell-Kampf am Tisch, Masken, Zettel, Aufgeben, Ausweichweg
- `moorpfad.cjs` — Moorwanderung: Startdeck, Pfad, Szene, Kampf-Ort (NPC setzt sich), Belohnung, Ausweichweg
- `onlineDraft.cjs [shared|separate]` — Draft, Totem-Wahl und Pfad online mit zwei Browsern bis in den Kampf, beide
  klicken selbst
  (Aufbau wie bei `online.cjs`)
- `online.cjs` — Online-Match mit zwei Browsern und Zuschauer. Braucht `onlineServer.cjs` (nur die Raum-Logik von
  S&S, kein Bot, keine Datenbank; Port über `SS_PORT`) und einen Dev-Server, dessen `/socket.io` dorthin zeigt.
  **Nicht gegen das echte Backend auf 3001 laufen lassen:** einen eigenen Vite mit eigener Konfigurationsdatei
  starten, die `vite.config.js` übernimmt und nur das Ziel von `/socket.io` ändert (am 14.11. so gemacht: Vite 5187
  → Prüfserver 3093; `SS_SERVER=http://127.0.0.1:3093`).

Die Skripte klicken über `window.__ssRoom.locate(…)` und lesen `window.__ssRoom.stats()` (nur Dev-Build). Dazu
`npm test -- SacrificeSigils` (171 Tests), `npx eslint src/pages/SacrificeSigils/ui src/pages/SacrificeSigils/net`
und im Backend `node --test sacrificeSigils/__tests__/roomManager.test.js` (10 Tests, davon 2 neu: Masken, Gesten).

**Wo was steht:** Aufbau und Stand je Teil in Abschnitt 4 (Phase 1 bis 3), Technik in Abschnitt 3, Entscheidungen
in Abschnitt 6. Fallen aus dem Bau stehen in der Notiz `project_sacrifice_sigils_rebuild` (Memory).

---

Ziel: Das Spiel soll sich anfühlen wie ein Abend an einem echten Tisch im Kerzenlicht — so wie Inscryption es
vormacht —, nur zu zweit (und in der Moorwanderung zu sechst). Übernommen wird das **Prinzip** (alles ist ein
Gegenstand auf dem Tisch, keine Menüs im Spiel, der Gegner sitzt dir gegenüber), nicht Figuren, Bilder oder Namen:
Schauplatz bleibt die versunkene Kapelle im Aschemoor, die Karten bleiben die eigenen Tuschezeichnungen.

---

## 1. Befund: warum es sich „sloppy“ anfühlt

Geprüft am 14.11.2026 mit den Dev-Fixtures (`?fixture=battle|sacrifice|draft|extras|path|scene:shrine|result`,
Moorwanderung `?fixture=boss`) in 1366×768, 1920×1080, 2560×1440 und 390×844, dazu Code von `ui/battle`, `ui/anim`,
`ui/battle/table3d`.

**Kurzfassung: Die Regeln sind nicht das Problem. Engine, Karten, Balancing und Netz sind solide und getestet.
Das Problem ist, dass zwei Welten übereinander liegen, die nichts voneinander wissen** — unten ein echter 3D-Tisch,
oben eine flache Website-Oberfläche. Alles Weitere folgt daraus.

### 1.1 Zwei Welten

| Beobachtung | Folge |
|---|---|
| Karten, Slots, Hand, Stapel sind DOM-Elemente über dem 3D-Canvas | Karten werfen keinen Schatten, reagieren nicht aufs Kerzenlicht, haben eine andere Perspektive als der Tisch (CSS `rotateX 14°` gegen eine 3D-Kamera mit rund 46° Blickwinkel). Sie wirken aufgeklebt. |
| Waage, Totems und Kerzen stehen als 3D-Gegenstände da, haben aber keine Funktion | Die eigentliche Information steht daneben nochmal als Kasten: Waage als „0 / 5“, jedes Totem als Textbox. Die Gegenstände sind Deko, die Kästen sind das Spiel. |
| Partikel, Schadenszahlen, Banner sind 2D-Ebenen über allem | Treffer passieren „auf dem Bildschirm“, nicht auf dem Tisch. |

### 1.2 Das Brett ist winzig (gemessen)

| Auflösung | Brett (4×4 Felder) | Anteil am Bild | Karte auf dem Feld | Kartenname | Sigil-Icon |
|---|---|---|---|---|---|
| 1366×768 | 318×384 px | 11,6 % | 65×88 px | 6,7 px | 12 px |
| 1920×945 (Browser mit Leisten) | 435×517 px | 12,4 % | 87×119 px | 9,0 px | 16 px |
| 1920×1080 | 523×616 px | 15,5 % | 104×142 px | 10,7 px | 19 px |
| 2560×1440 | 779×902 px | 19,1 % | 151×207 px | 15,6 px | 28 px |

Der Rest ist dunkles Holz und Kästen. Die Zeichnungen — das Schönste am Spiel — sieht man auf dem Feld kaum. Die Hand
ragt in jeder Auflösung unten aus dem Bild (3–16 px abgeschnitten).

### 1.3 Zu viel Oberfläche, zu viel Text

- Drei Kopfzeilen übereinander: Seitenleiste (Spielen / Kartenbuch / Anleitung / Website), Match-Zeile (Kampf, Siege,
  Splitter, Seed), dann die Kästen. Während eines Matches braucht man davon fast nichts.
- Im Kampf stehen **111 Wörter in 44 Textelementen** außerhalb der Karten auf dem Bildschirm (Fixture `sacrifice`):
  Hinweiszeile, vier Totem-Kästen mit je vier Zeilen, Reihenbeschriftungen, „Hand: 6/8“, „5 Karten · 0 Items“ …
- Die Hinweiszeile erklärt dauerhaft, was zu tun ist („Karte antippen oder ziehen, dann einen freien Slot wählen …“).
  Ein Spiel, das man ständig erklären muss, zeigt nicht genug.
- Draft, Totem-Wahl, Schrein, Lagerfeuer, Händler, Ergebnis sind **Formulare auf Pergament**: Überschrift, Erklärtext,
  Listen, Bestätigen-Knopf. Der Draft nutzt das obere Drittel, darunter ist der halbe Bildschirm leer. Das Ergebnis ist
  eine Statistik-Tabelle.
- Stil-Mix: Pergament mit Rissrand, Kästen mit Nieten, ovale rote Verlaufsknöpfe, leuchtende Rahmen. Das liest sich wie
  ein Fantasy-Website-Theme, nicht wie ein Gegenstand.

### 1.4 Bedienung und Tempo

- **Jede Animation sperrt die Eingabe.** Die Warteschlange (`useAnimationQueue`) spielt Ereignisse streng
  nacheinander mit festen Zeiten; solange sie läuft, ist `canAct` falsch.
- Ein Angriff auf eine Karte dauert 600 + 530 + 450 = **1,58 s**, ein Angriff auf die Waage 600 + 770 + 450 = **1,82 s**.
  Vier Angreifer brauchen 6–7 s, in denen nichts überlappt. Eine 2-Blut-Karte ausspielen: zwei Opfer à 0,99 s, Knochen,
  Landung 0,83 s — rund 3,5 s Sperre für einen Zug, den man im Kopf längst fertig hat.
- Opfern braucht Karte → Opfer → Opfer → Zielfeld → **Bestätigen**-Knopf, plus **Abbrechen**-Knopf. Am Tisch wäre das:
  Karte nehmen, Opfer antippen, hinlegen.
- Ziehen, Zug beenden und Hammer sind Knöpfe am Bildrand, weit weg vom Brett.

### 1.5 Niemand sitzt gegenüber

Der Gegner ist ein Name mit fünf Mini-Kartenrücken. Gerade im Mehrspieler fehlt jedes Gefühl, dass da jemand ist:
keine Gestalt, keine Hände, die Karten legen, keine Reaktion, keine Gesten.

### 1.6 Klang

Alle 24 Klänge sind Web-Audio-Synthese (`audio/sound.js`); in `public/media/sfx/` liegt keine einzige Aufnahme. Ein
Kartenspiel lebt vom Geräusch von Papier auf Holz — das kann ein Oszillator nicht.

### 1.7 Was gut ist und bleibt

- Engine (deterministisch, serverautoritativ, Fuzz- und Sigil-Tests), Balancing-Werkzeuge, Raum-/Reconnect-Logik.
- 414 Karten-Zeichnungen im Tuschestil, zwei Zirkel, Moorwanderung.
- Die 3D-Pfadkarte (Pergament mit Holzmarken und Spielfigur) — das ist heute der eine Bildschirm, der sich richtig
  anfühlt, weil dort **alles** in der Szene liegt. Genau das ist das Vorbild für den Rest.
- Tischholz, Kerzen, Messingwaage, Totem-Figuren aus `table3d/` werden übernommen.

---

## 2. Zielbild

**Ein Raum, ein Tisch, keine Oberfläche.** Du sitzt am Tisch. Die Kamera ist dein Blick. Was du wissen musst, liegt
vor dir; was du tun kannst, fasst du an.

### 2.1 Grundsätze

1. **Alles ist ein Gegenstand.** Kein Kasten, keine Leiste, kein Knopf im Match. Ausnahmen sind genau zwei: das
   Nachschlagen einer Karte (ein Blatt, das neben die hochgehobene Karte gelegt wird) und das Pausenmenü (Esc).
2. **Zahlen bleiben Zahlen.** Diegetisch heißt nicht rätselhaft: Knochen, Wachs, Stapelgröße und Waagenstand tragen
   eine klar lesbare Ziffer am Gegenstand.
3. **Die Karte ist der Star.** Karten auf dem Feld deutlich größer als heute (gemessen in der Stilprobe bei 1080p:
   eigene Front 130 px, eigene Hinterreihe 143 px breit statt 104). Die Karte unter dem Mauszeiger hebt sich sofort
   und ist dann rund 230 px breit und voll lesbar. *Korrektur nach Phase 0:* die zuerst genannten 150 px für die
   Front sind mit vier Reihen Tiefe plus Hand auf 16:9 nicht erreichbar — die Tiefe des Bretts begrenzt, nicht die Breite.
4. **Nie auf das Spiel warten.** Eigene Eingaben sind immer möglich; laufende Abläufe werden dann beschleunigt
   abgespielt statt die Eingabe zu sperren.
5. **Der Gegner ist anwesend.** Gestalt im Dunkeln, Hände im Licht, Blick folgt dem Geschehen.
6. **Kein Website-Gefühl.** Die Seitenleiste verschwindet, sobald man am Tisch sitzt.

### 2.2 Der Tisch im Kampf

```
                    ( Gestalt des Gegners im Dunkeln, Maske, Hände )
        Gegner-Totems                                   Gegner-Stapel
   ┌──────────────────────────────────────────────────────────────────┐
   │  Kerze        [ ][ ][ ][ ]   Hinterreihe Gegner (klein, fern)    │
   │               [ ][ ][ ][ ]   Front Gegner                Stundenglas
   │  Waage  ─────────────────────────────────────────────    Siegelstempel
   │  (Gewichte)   [ ][ ][ ][ ]   deine Front                 (Zug beenden)
   │               [ ][ ][ ][ ]   deine Hinterreihe           Hammer
   │  Knochenhaufen · Wachsschale        Items auf der Kante    Hauptdeck · Nebendeck
   └──────────────────────────────────────────────────────────────────┘
                          deine Hand (aufgefächert, vor dir)
```

| Heute (Kasten/Knopf) | Künftig (Gegenstand) |
|---|---|
| Kasten „0 / 5 · Dein Zug · Zug 7“ | Messingwaage mit Gewichten, die sichtbar in die Schale fallen; Skala am Waagebalken zeigt den Stand; wer am Zug ist, zeigt das Licht (deine Tischhälfte heller) und der Siegelstempel auf deiner Seite |
| Knopf „Zug beenden“ | Siegelstempel: anheben, ins Wachs drücken (Leertaste) |
| Knopf „Hammer“ | Hammer liegt auf dem Tisch; nehmen, auf eigene Karte schlagen |
| Stapel-Knöpfe am Bildrand | Zwei echte Kartenstapel; Karte wird sichtbar abgehoben und in die Hand geführt |
| Kasten Knochen / Wachs / Salz | Knochenhaufen (wächst), Wachsschale mit Perlen bzw. Salzschale; Ziffer am Gegenstand |
| Vier Totem-Textkästen | Totems stehen auf dem Tisch; Mauszeiger darauf lässt die betroffenen Karten/Felder aufleuchten und legt das Erklärblatt daneben |
| Hinweiszeile | entfällt; mögliche Felder heben sich leicht, Opferbare Karten bekommen eine Opfermarke. Nur das Tutorial spricht |
| Bestätigen / Abbrechen beim Opfern | entfällt; letztes Opfer gewählt → Karte fällt auf das Feld. Rechtsklick oder Esc legt die Karte zurück |
| Reihenbeschriftung „Front / Hinterreihe“ | entfällt; die Hinterreihe ist als eingelassene, dunklere Mulde erkennbar |
| Gezeiten-Kasten | Wasserrinne quer über den Tisch, deren Pegel steigt und fällt; Flut überspült die Uferreihe sichtbar |
| „Dein Zug“-Banner, Schadenszahlen in 2D | Kamera- und Lichtwechsel; Schaden als Tuschespritzer auf der Karte, Ziffer auf der Karte ändert sich |
| Kerzen als Patt-Uhr | bleibt (brennen mit den Zügen herunter) |
| Zug-Timer als Zahl | Stundenglas neben dem Siegelstempel |

### 2.3 Die Kamera

- **Brett** (Standard): Blick von schräg oben, Brett füllt rund 60 % der Bildbreite, Hand unten im Bild.
- **Hand**: Mauszeiger auf die Hand → Karten heben sich, Kamera neigt sich minimal.
- **Gegner**: bei seinem Zug hebt sich der Blick leicht; bei großen Momenten (Waage kippt, Kampfende) kurzes Vorbeugen.
- **Karte ansehen**: Rechtsklick / langes Drücken → Karte kommt vor die Kamera, daneben das Blatt mit den Sigil-Texten.
- Leichte Parallaxe mit der Maus. Keine frei steuerbare Kamera, kein Schwindel; „Animationen reduzieren“ schaltet
  alle Fahrten auf weiche Schnitte.

### 2.4 Die anderen Phasen — derselbe Tisch

| Phase | Heute | Künftig |
|---|---|---|
| Draft | vier DOM-Karten oben, Deckliste als Pergament rechts | Der Geber legt die Karten der Runde aus; nehmen = Karte zu sich ziehen, sie wandert auf deinen wachsenden Stapel. Gegnerische Wahl sieht man als Hand, die greift. Deckübersicht: eigenen Stapel auffächern |
| Totem-Wahl | Textblätter „Kopf · Stammkopf …“ | Geschnitzte Köpfe und Körper liegen auf einem Tuch; Kopf auf Körper stecken. Erklärblatt nur für das Teil unter dem Mauszeiger |
| Pfad | 3D-Pergament (gut) | bleibt; Deckliste rechts wird zum auffächerbaren Stapel, Gegnerstatus zur Figur des Gegners auf derselben Karte |
| Szenen (Lagerfeuer, Schrein, Händler, Verschmelzen, Kopist, Ereignisse) | Formular auf Pergament | Je Szene eine kleine Anordnung auf dem Tisch: Feuerschale, in die man eine Karte hält; Schnitzbrett; Händlertuch mit Waren und Splitter-Münzen; zwei Karten, die vernäht werden. Ereignisse als gezeichnetes Blatt mit 2–3 Gegenständen zur Wahl |
| Zwischenspiel / Ergebnis | Statistik-Tabellen | Kerzen verlöschen, die Gewinnerkarte bleibt im Licht liegen; ein schmaler Zettel mit drei Zahlen; Revanche = Kerze neu anzünden. Volle Statistik auf Wunsch im Buch |
| Hauptmenü, Lobby | Website-Seite mit Liste | Der dunkle Raum mit dem Tisch; Menü als wenige Zeilen am Tischrand. Lobby = beide setzen sich; Einstellungen als Zettel auf dem Tisch |
| Kartenbuch, Anleitung | Seiten | Ein Buch, das man aufschlägt (bleibt DOM, aber als Buch gestaltet) |

### 2.5 Mehrspieler-Gefühl

- **Gestalt gegenüber**: Kapuze, Maske, zwei Hände. Jeder wählt im Menü eine von mehreren Masken (rein optisch).
- Gegnerische Aktionen werden von seinen Händen ausgeführt (Karte legen, Stapel abheben, stempeln).
- **Gesten statt Chat**: 6 feste Gesten (auf den Tisch klopfen, nicken, Kopf schütteln, auf eine Karte zeigen,
  Hände heben, verbeugen) über ein Radialmenü; kein Freitext, damit nichts moderiert werden muss.
- „Denkt nach“ = die Gestalt bewegt sich leicht, Finger trommeln, wenn der Timer knapp wird.
- Verbindung verloren = die Gestalt sackt zusammen, ihre Kerze flackert; Rückkehr richtet sie auf.
- Zuschauer sehen den Tisch von der Seite.

---

## 3. Technik

### 3.1 Grundentscheidung: echte 3D-Karten, kein DOM im Match

Geprüfte Wege:

| Weg | Urteil |
|---|---|
| **A. Karten als 3D-Flächen, Kartenbild per Canvas2D in eine Textur gezeichnet, Bedienung per Raycast** | **gewählt.** Licht, Schatten, Perspektive stimmen; three.js (0.186.1) ist schon im Projekt, keine neue Abhängigkeit. |
| B. DOM-Karten per CSS3D an die 3D-Kamera angleichen | verworfen: Perspektive stimmt dann, Licht und Schatten nicht — bleibt aufgeklebt. |
| C. DOM-Karte in eine Textur rendern (SVG foreignObject) | verworfen: Schriften und Bilder brechen je nach Browser. |

Die heutige Aufteilung „Canvas unten, DOM oben“ (`table3d/tableScene.js`: „Karten, Slots, Hand und alle Bedienung
bleiben DOM — bewusst“) wird damit ausdrücklich aufgegeben.

### 3.2 Was unangetastet bleibt

`engine/`, `data/`, `net/`, `Backend/sacrificeSigils/` (Räume, Socket, Spiegel), alle Tests, Balancing-Werkzeuge,
Karten-Bilder, `i18n/de.js`. **Phasen 0–6 ändern keine Regel und keine Engine-Datei** — kein neuer Spiegel, kein
Balancing-Lauf, laufende Online-Matches sind nie betroffen. Das Ereignisprotokoll der Engine (rund 70 Ereignistypen)
ist die Schnittstelle: die neue Szene spielt dieselben Ereignisse ab wie heute die DOM-Oberfläche.

*Ausnahme seit Phase 3:* Masken und Gesten müssen zum anderen Spieler gelangen. Dafür kennt der Raum (nicht die Engine)
zwei neue Nachrichten, `ss:gesture` und `ss:mask`, und jeder Platz trägt ein Feld `mask`. Beides ist reine Optik ohne
Spielwirkung; Regeln, Engine und Spiegel sind weiter unberührt.

### 3.3 Neuer Aufbau (`ui/table/`)

```
ui/table/
  scene/      Renderer, Kamera-Rig (Posen + Fahrten), Licht, Raum, Tischplatte      ← aus table3d/tableScene.js
  cards/      cardFace.js   Kartenbild auf Canvas (Papier, Name, Zeichnung, Kosten, Werte, Sigils)
              cardMesh.js   Karte als Körper (Vorder-/Rückseite, Kante, weicher Schatten)
              cardPool.js   Texturen je Karte cachen, freigeben
  board/      Weltkoordinaten aller Plätze (Felder, Hand, Stapel, Ablage), Picking per Raycast
  props/      Waage + Gewichte, Stapel, Knochen, Wachs/Salz, Totems, Items, Hammer, Siegelstempel, Stundenglas,
              Wasserrinne (Gezeiten)                                                 ← Waage/Totems aus tableProps.js
  opponent/   Gestalt, Hände, Gesten
  director/   timeline.js (kleine eigene Tween-/Sequenz-Hilfe), eine Choreografie je Ereignistyp, Kamera-Einsätze
  input/      Zeiger → Absicht (schweben, nehmen, opfern, legen, ziehen, ansehen), Tastatur
  overlay/    DOM, nur: Erklärblatt, Pausenmenü, Meldungen, unsichtbare Bedien-Spiegelung für Tastatur/Screenreader
```

- **Kartenbild:** eine Zeichenroutine statt CSS-Rahmen (`cards/cardFace.js`). Die Icons bleiben an einer Stelle
  definiert: dieselben React-SVGs (`SigilIcon.jsx`, `GameIcons.jsx`) werden einmal als Bild gerastert und ins Canvas
  gezeichnet (`cards/iconImages.js`) — einfacher und sicherer als die zuerst geplante Umstellung auf Pfaddaten.
  Textur 512×717 auf dem Tisch, 1024 beim Ansehen; Mipmaps + anisotrope Filterung. Werte ändern sich → nur diese Karte
  neu zeichnen. Gleichzeitig höchstens rund 30 Texturen.
- **Licht:** eine Hängelampe außerhalb des Bildes (ein Schattenwurf, macht das Brett lesbar), die Kerzen geben Wärme
  und Flackern, eine schwache Glut vor dem Gegenüber hebt Maske und Hände aus dem Dunkel.
- **Anzeigemodell bleibt:** `anim/display.js` (schreibt den Kampf Ereignis für Ereignis fort) wird weiterverwendet.
  Ersetzt wird nur der Taktgeber: statt „ein Ereignis, eine feste Dauer, dann das nächste“ ein Regisseur, bei dem jede
  Choreografie sagt, wann das nächste Ereignis starten darf (Treffer fällt mit dem Stoß zusammen, Rückweg überlappt mit
  dem Ausholen des Nächsten).
- **Eingabe sperrt nie:** Bedienung arbeitet auf dem echten Stand (`view`), nicht auf dem Anzeigestand. Handelt der
  Spieler, während noch etwas läuft, spielt der Regisseur den Rest mit dreifachem Tempo ab.
- **React** bleibt für Hülle, Lobby, Buch und das dünne Overlay. Die Szene ist ein eigenständiges Modul mit klarer
  Schnittstelle (`setView`, `playEvents`, `onIntent`), wie es `tableScene.js` heute schon vormacht.
- **Leistung:** Ziel 60 Bilder/s auf Mittelklasse-Grafik, in Ruhe gedrosselt wie bisher. Ein Schattenwurf (weiche
  Kontaktschatten unter Karten als Textur statt Schattenkarten — siehe Falle „Kerze im eigenen Licht“ in den Notizen).
- **Sparmodus:** Wer keine Grafikkarte hat (`utils/lowGfx.js`, `?gfx=low`), bekommt die heutige flache Oberfläche als
  eingefrorenen „Flachtisch“. Sie bekommt keine neuen Funktionen mehr, bleibt aber spielbar.

### 3.4 Umstellung ohne Bruch

Der neue Tisch lief zunächst hinter einem Schalter (`?tisch=neu` und Einstellung „Neuer Tisch (Vorschau)“). **Seit dem
14.11.2026 ist er Standard** (Entscheidung des Nutzers nach Phase 3). Der bisherige Kampfbildschirm bleibt als
Ausweichweg: auf Wunsch (Einstellung, Pausenmenü), im Sparmodus, ohne WebGL, im Tutorial, in der Moorwanderung und
hochkant. Er bekommt keine neuen Funktionen mehr.

---

## 4. Phasen

Jede Phase endet mit etwas, das du selbst im Browser anschauen und beurteilen kannst. Erst nach deinem Ja geht es weiter.
Größe: S = eine Sitzung, M = zwei bis drei, L = vier und mehr.

### Phase 0 — Stilprobe (S) — gebaut am 14.11.2026, Abnahme offen
Ein eingefrorener Kampfstand komplett in der neuen Szene: Kamera, Tisch, Karten als Körper mit echtem Kartenbild,
Licht und Schatten, Waage mit Gewichten, Stapel, Siegelstempel, Stundenglas, Hammer, Knochen- und Wachsschale mit
Ziffernzetteln, Totems, Gestalt gegenüber. Keine Bedienung — nur die Karte unter dem Mauszeiger hebt sich.

Aufruf (nur Dev-Server): `/sacrifice-and-sigils/uebung?fixture=showcase&tisch=neu` · Tasten **1 / 2 / 3** wechseln
den Blick (Brett, Gegenüber, Aufsicht). Die eigene Stilprobe-Seite ist mit Phase 1 im spielbaren Tisch aufgegangen
(derselbe Aufruf zeigt jetzt den echten Kampf). Code: `ui/table/` (`scene/tableRoom.js`, `scene/figure.js`,
`scene/props.js`, `cards/*`), Spielstand `showcase` in `ui/dev/fixtures.js`.

**Abnahme:** Du sagst, ob Blickwinkel, Kartengröße, Helligkeit und die Gestalt stimmen. Zu entscheiden:
1. **Standardblick.** „Brett“ (steil, Karten kaum gestaucht, vom Gegenüber nur die Hände) oder ein flacherer Blick,
   bei dem die Maske immer im Bild ist, die Karten aber deutlich gestaucht sind (Blick 2 zeigt das Extrem).
   Empfehlung: „Brett“ als Standard, Blick 2 automatisch im Zug des Gegners und bei großen Momenten.
2. **Gestalt.** Kapuze, helle Maske mit rotem Wachsstrich, Hände — so weiter, oder andere Richtung?
3. **Helligkeit und Farbe** des Tischs, Größe der Hand.

Noch nicht in der Stilprobe (kommt mit Phase 1/2): Kerzendocht-, Gezeiten- und Lagerfeuer-Marken auf den Karten,
Items auf der Tischkante, Gezeiten-Rinne, Handy-Ansicht, Klang, jede Bedienung außer dem Anheben.

**Abgenommen am 14.11.2026:** Standardblick „Brett“; im Zug des Gegenübers Blick 2; Gestalt passt, die Hände
wurden neu gebaut (kartengroß, mit Knöcheln und Tintenkuppen); Helligkeit, Tisch und Hand passen. Anmerkung
„wirkt noch etwas schwammig“: gemessen lief die Szene mit 6 ms pro Bild — die Ursache war das weiche Nachziehen von
Kamera und Karten, das seitdem straffer geführt wird.

### Phase 1 — Kampf spielbar (L) — gebaut am 14.11.2026 als Vorschau, Abnahme offen
Hand, Nehmen, Opfern (ohne Bestätigen), Legen, Ziehen vom Stapel, Stempeln, Hammer, Items, Karte ansehen mit
Erklärblatt, Totems mit Aufleuchten, Gezeiten-Rinne, Seher/Abwerfen. Bewegungen noch schlicht.
**Abnahme:** Ein ganzes Match gegen die KI und eines online, ohne dass ein Kasten oder Knopf im Bild ist.
Messpunkte: Karte vordere Reihe ≥ 125 px bei 1080p, unter dem Mauszeiger ≥ 220 px; 0 Wörter Dauertext außerhalb von
Karten; Hand nicht abgeschnitten.

**Einschalten:** war bis zum 14.11.2026 ein Vorschau-Schalter; seitdem ist der neue Tisch Standard (siehe Übergabe,
„Welcher Tisch läuft“). Im Dev-Build zum Probieren:
`/sacrifice-and-sigils/uebung?fixture=showcase&ki=1` (fester Stand, die KI spielt weiter).

**Aufbau:** `ui/table/TableBattle.jsx` trägt die Regeln der Bedienung (was ist anklickbar, wann wird gespielt) und
ersetzt `BattleScreen.jsx`, wenn der Schalter an ist. `scene/tableRoom.js` ist die Szene: `sync(model)` gleicht sie
mit dem Anzeigemodell ab (Karten sind über ihre uid bekannt und gleiten von selbst an den neuen Platz), `setUi()`
zeigt Auswahl, Opfer und mögliche Felder, `play(ev)` spielt kleine Gesten (Stoß, Zucken, Vergehen), `onIntent`
meldet Klicks. Eingehängt in `GameScreen.jsx` (`tableMode`).

**Stand:**

| Teil | Stand |
|---|---|
| Ziehen (Stapel anklicken), Nehmen, Opfern ohne Bestätigen, Legen, Zug beenden (Stempel oder Leertaste) | geprüft: ganzer Kampf gegen die KI, Moor und Gezeiten, ohne Fehler bis in die nächste Phase |
| Hammer, Item mit Ziel (Schere), Tooltip an Gegenständen, Karte ansehen (Rechtsklick / lange drücken), Pausenmenü (Esc oder „Menü“) | geprüft |
| Klick während eines laufenden Ablaufs im eigenen Zug: der Ablauf wird sofort beendet, der Klick danach ausgeführt | geprüft |
| Blick: eigener Zug „Brett“, Zug des Gegenübers Blick 2; Licht folgt dem, der am Zug ist | geprüft |
| Marken auf den Karten (Kerzendocht, Gezeiten-Bindung, Lagerfeuer, Naht, Kopie, Verwandlung, setzt aus, Leim, Schild) | gebaut, nur zum Teil im Spiel gesehen |
| Items ohne Ziel, Items auf eigenes Feld, Pinzette (Sigil wählen), Vorpreschen, Abwerfen bei Handlimit, Seher | geprüft (`sonderfaelle.cjs`) |
| Totem unter dem Zeiger lässt betroffene Felder aufleuchten | Tooltip geprüft; das Aufleuchten ist im Bild nur schwach zu sehen |
| Online-Match, Hotseat, Zuschauer | geprüft (`online.cjs`, `sonderfaelle.cjs`); Zuschauer sitzen seit Phase 3 seitlich |
| Gezeiten | Salzschale, Gezeitenglas mit Wasserstand und Tooltip, überflutete Hinterreihe bläulich — die Rinne quer über den Tisch kommt mit Phase 2 |

**Bewusst noch nicht:** Tutorial und Moorwanderung laufen am bisherigen Tisch (eigene Hinweise bzw. eigene
Kopfzeile). Hochkant (Handy) schaltet der neue Tisch nicht ein (Phase 7). Die Zugzeit steht seit Phase 3 im
Stundenglas. Kampfende ist ein schlichter Schriftzug (Phase 4). Schadenszahlen, fliegende
Knochen, fallende Gewichte, Klang-Aufnahmen: Phase 2. Abläufe laufen weiter nacheinander mit den alten Zeiten; nur die
eigene Eingabe wartet nicht mehr darauf.

**Ausnahmen von „kein Kasten, kein Knopf“:** ein blasser Schriftzug „Menü“ oben rechts (ohne ihn käme man mit Maus
oder Finger nicht ins Pausenmenü), kurze Meldungen über der Hand (z. B. „Nicht genug Knochen“), der Tooltip an
Gegenständen und das Erklärblatt.

### Phase 2 — Spielgefühl (L) — gebaut und abgenommen am 14.11.2026
Regisseur mit überlappenden Abläufen; Angriff als Stoß mit Gewicht, Karte knickt beim Treffer, Tod als Zerreißen mit
Papierfetzen, Opfer, Knochen fliegen auf den Haufen, Gewichte fallen in die Waagschale, Waage kippt mit Kamera-Vorbeugen,
Verwandlung, Tauchen. Echte Aufnahmen statt Synthese (Papier, Holz, Messing, Wachs, Raumton).
**Abnahme / Messpunkte:** ein Angreifer ≤ 0,5 s bis zum Treffer; Angriffsphase mit vier Angreifern ≤ 2,5 s (heute 6–7 s);
Eingabe nie gesperrt; danach wird der neue Tisch Standard.

**Gemessen** (Fixture `attack4`, vier Angreifer, einer davon tötet mit Überlauf, Tempo 1×): Stoß bis Treffer
**0,2 s**; ganze Angriffsphase **2,3 s** (alter Takt: 6–7 s). Bildzeiten dabei unverändert rund 6 ms.

**Takt:** kein eigener Regisseur, sondern die bestehende Warteschlange mit einer zweiten Tabelle (`TABLE_TIMING` in
`ui/anim/timing.js`). Die Zahl dort ist am neuen Tisch der Abstand bis zum nächsten Ereignis, nicht die Länge der
Geste — die Gesten laufen in der Szene von selbst zu Ende und überlappen sich dadurch. Klickt man im eigenen Zug,
während noch etwas läuft, spult der Rest im Zeitraffer durch (`rush`, vierfach), statt abzubrechen.

| Teil | Umsetzung | Stand |
|---|---|---|
| Angriff | ausholen, vorschnellen, Treffer nach 0,2 s, federnd zurück; Flieger im hohen Bogen | geprüft (Bildfolge) |
| Treffer | Rückstoß weg vom Angreifer mit Wackeln, rotes Aufblitzen, Tusche spritzt in Stoßrichtung und bleibt kurz liegen, Kamera zittert | geprüft. Die Karte „knickt“ nicht wirklich — sie wird zurückgestoßen |
| Tod | Karte reißt in zwei Hälften, Papierfetzen, Staub | geprüft |
| Opfer / Verfall | Karte verkohlt und sinkt zusammen, Wachs, Asche, Glut | geprüft |
| Knochen | fliegen vom Ort des Todes auf den Haufen; der Haufen wächst erst, wenn sie ankommen | gebaut, im Bild nicht festgehalten |
| Waage | Gewichte fliegen vom Angreifer in die Schale, Funken; ab 3 Schaden oder Stand ±4 beugt sich der Blick zur Waage; bei ±4 flackern die Kerzen unruhig | Gewichte geprüft, Vorbeugen nicht einzeln geprüft |
| Legen | Karte fällt das letzte Stück, Staub, leichtes Zittern | gebaut |
| Hammer | fährt vom Tischrand zur Karte und schlägt zu | geprüft (Ablauf), Bild nicht festgehalten |
| Verwandlung, Tauchen, Stärken/Schwächen, Schild, Kerzendocht | Drehung mit Glut · Wasserspritzer · Gold bzw. Asche · Funken · Glut | Verwandlung und Tauchen geprüft (Ablauf und Endbild); Stärken, Schild, Kerzendocht nicht einzeln |
| Kampfende | gewonnen: Kerzen flammen auf · verloren: sie verlöschen, das Licht geht fast aus | Sieg und Niederlage geprüft |
| Gezeiten-Rinne | im Gezeiten-Zirkel ersetzt eine Wasserrinne die Messingleiste; Breite folgt dem Wasserstand, beim Wechsel spritzt es | geprüft (Bild) |
| Klang | 32 Aufnahmen (CC0, Kenney; Herkunft in `public/media/sfx/QUELLEN.txt`) für Ziehen, Legen, Stoß, Treffer, Zerreißen, Opfer, Knochen, Gewicht, Waage, Stempel, Knarren, Splitter, Hammer; mehrere Varianten je Klang, Tonhöhe leicht gestreut | alle laden und lassen sich abspielen. **Nicht angehört** — die Zuordnung folgt den Dateinamen und steht in `audio/sound.js` (`SAMPLES`) |

**Offen aus dem Umfang:** Raumton, Flügel, Feuer, Wasser, Verwandlung, Sieg/Niederlage bleiben synthetisch (in den
beiden Paketen gab es dafür nichts Passendes). Die Aufnahmen gelten auch am bisherigen Tisch.
**Abgenommen am 14.11.2026:** Klang „gut“, aber „noch leicht laut“ → alle Effekte rund 3 dB leiser (`SFX_TRIM`).
Der neue Tisch ist seitdem Standard.

### Phase 3 — Der Gegner und der Mehrspieler (M) — gebaut und abgenommen am 14.11.2026
Gestalt mit Händen führt alle gegnerischen Aktionen aus, Masken zur Wahl, sechs Gesten, Stundenglas, Verhalten bei
Verbindungsverlust, Zuschauerblick, Revanche am Tisch.
**Abnahme:** Online-Match zu zweit; man merkt ohne Text, was der andere gerade tut.

**Aufbau:** `scene/figure.js` baut die Gestalt beweglich (Hände mit Fingergelenken, Ärmel werden jedes Bild von der
Schulter zum Handgelenk gespannt, austauschbare Maske). `scene/puppet.js` bewegt sie: jede Hand hat eine Liste von
Schritten, ein neuer Auftrag ersetzt die Liste und beginnt dort, wo die Hand gerade ist. `tableRoom.play(ev)`
übersetzt die Ereignisse des Gegenübers in Aufträge; eine getragene Karte hängt für die Dauer am Griff der Hand
(`ent.hold`). `masks.js` (ohne three.js) kennt Masken und Gesten, `GestureWheel.jsx` ist das Gestenrad,
`MaskPicker.jsx` die Maskenwahl mit Vorschaubildern (`scene/maskThumbs.js`).

| Teil | Umsetzung | Stand |
|---|---|---|
| Ziehen | die rechte Hand greift zum eigenen kleinen Stapel an der hinteren Kante und steckt die Karte zu den anderen | geprüft (Bildfolge, online) |
| Karte legen | die nähere Hand greift die Karte aus der Hand, trägt sie zum Feld (dabei dreht sie sich um) und lässt sie fallen | geprüft (Bildfolge, online) |
| Opfern | die Hand legt sich kurz auf die Karte, während sie verkohlt | geprüft (Bildfolge) |
| Zug beenden | das Gegenüber hat einen eigenen kleinen Siegelstempel; die Hand drückt ihn ins Wachs, erst dann beginnt der Angriff | geprüft (Bild, online) |
| Hammer | das Gegenüber schlägt mit der Faust zu (kein zweiter Hammer auf dem Tisch) | gebaut, **nicht im Spiel gesehen** (die KI hat ihn in den Läufen nicht benutzt) |
| Item | die linke Hand tippt auf die Beutel, der Blick geht zum Ziel | gebaut, **nicht im Spiel gesehen** |
| Blick | der Kopf folgt dem Geschehen (gelegte Karte, Angriff); im eigenen Zug schaut die Gestalt zum Spieler | gebaut, in Bildfolgen gesehen |
| Nachdenken | ist das Gegenüber dran und es geschieht nichts, fährt eine Hand über die eigenen Karten oder der Kopf legt sich schief | gebaut, nicht gezielt geprüft (gegen die KI selten zu sehen — sie zieht sofort) |
| Takt | Ereignisse des Gegenübers bekommen einen Zuschlag (`TABLE_OPP_EXTRA`: legen 180 ms, ziehen 100 ms, Stempel 280 ms), damit die Hände lesbar bleiben; eigene Züge bleiben so schnell wie in Phase 2 | gemessen: eigene Angriffsphase weiter 2,3 s, Bildzeit 6 ms |
| Masken | sechs zur Wahl (Wachsstrich, Rabe, Geweih, Halbmond, Rinde, Dreiauge) in den Einstellungen, mit Vorschaubild; online sieht jeder die Maske des anderen, auch nach einem Wechsel in der Lobby oder im Spiel; gegen die KI und im Hotseat wird eine andere als die eigene ausgewürfelt | geprüft (Bild, online) |
| Gesten | Gestenrad (Rechtsklick oder langes Drücken auf den Tisch, oder Taste G; dann Klick oder 1–6): klopfen, nicken, Kopf schütteln, auf eine Karte zeigen, Hände heben, verbeugen. Die Gestalt führt die Geste des anderen aus; die eigene sieht man am Blick (nicken, schütteln, verbeugen) und an den eigenen Händen, die dafür ins Bild kommen (klopfen, zeigen, Hände heben). Beim Zeigen pulsiert das Feld bei beiden. Höchstens eine Geste pro Sekunde (Server) | geprüft (online in beide Richtungen, Bilder) |
| Gesten gegen die KI | die Gestalt antwortet: Verbeugung auf Verbeugung, Nicken auf Nicken …; sie verbeugt sich zu Kampfbeginn und am Ende | geprüft |
| Stundenglas | der Sand zeigt die Zugzeit, die Sekunden liegen als Zettel daneben; beim Zugwechsel dreht sich das Glas; unter 10 s glimmt der Sand und das Gegenüber trommelt mit den Fingern. Ohne Zeitlimit steht es still | geprüft (Bild; online bei beiden gleich); Trommeln nicht im Bild festgehalten |
| Verbindung weg | die Gestalt sackt nach vorn, der Kopf hängt, die Kerze an ihrer Seite brennt klein und unruhig; bei der Rückkehr richtet sie sich auf | geprüft (online) |
| Zuschauer | sitzen schräg an der Seite des Tischs; Karten unter dem Zeiger drehen sich zu ihnen; kein Gestenrad | geprüft (online) |
| „Animationen reduzieren“ | Hände springen statt zu fahren; Gesten des anderen stehen als Zeile da („Anna nickt.“) | geprüft |

**Abgenommen am 14.11.2026** mit einer Anmerkung: der Körper der Gestalt wirkte „ein bisschen dick“ → Mantel deutlich
schmaler, Schultern enger (13 statt 20), Ärmel dünner.

**Nicht umgesetzt (bewusst verschoben):**
- **Revanche am Tisch** — gehört zum Ergebnis am Tisch (Phase 4); bis dahin bleibt die Ergebnis-Seite mit dem Knopf.
- **Zweite Gestalt für Zuschauer** — unten sitzt niemand; die Züge des unteren Spielers sieht der Zuschauer wie bisher
  (Karten gleiten). Der Tisch ist nicht symmetrisch (vorn liegen Hand und Stapel), eine zweite Gestalt bräuchte einen
  eigenen Aufbau.
- **Gesten in der Moorwanderung** — die läuft noch am alten Tisch (Phase 6).

### Phase 4 — Draft, Totems, Szenen, Ergebnis am Tisch (L) — gebaut 14./15.11.2026
Alle Formulare aus 2.4 werden zu Anordnungen auf dem Tisch; Pfadkarte bekommt Stapel und Gegnerfigur.
**Abnahme:** ein komplettes Match von Draft bis Ergebnis ohne Pergament-Formular.

**Reihenfolge eines Matches** (wichtig für alles Weitere): Draft → Totem-Wahl → **Pfad** → Kampf → Pfad → Rast →
Kampf … → Ergebnis. Nach der Totem-Wahl kommt also erst ein Pfad, nicht der Kampf.

**Aufbau:** Die Szene gehört nicht mehr dem Kampf, sondern einer Hülle: `ui/table/TableHost.jsx` baut
`scene/tableRoom.js` einmal auf und lässt sie für das ganze Match stehen. Je Phase bedient ein eigenes Bauteil
dieselbe Szene: `TableDraft.jsx`, `TableExtras.jsx`, `TableMap.jsx` (Pfadkarte), `TableScene.jsx` (Pfad-Szenen),
`TableBattle.jsx`,
`TableInterlude.jsx` (Rast), `TableResult.jsx`. Jedes meldet seine Rückrufe an (`room.setHandlers`) und gibt seinen
Stand als dasselbe Anzeigemodell weiter (`room.sync`) — außerhalb des Kampfs ein leeres Modell (`stageModel.js`) mit
den Feldern `stage`, `loose` (frei ausliegende Karten), `pool` (Vorrat des Drafts), `choices` (Totem-Köpfe zur
Wahl), `notes` (Zettel mit Text, auch anklickbar), `wares` (Beutel des Händlers), `fire` (Feuerschale), `candles`
(Match-Ende), `map` (Pfadkarte). Das Pausenmenü ist für alle Phasen dasselbe (`TablePause.jsx`). Eingehängt in
`GameScreen.jsx` (`tableMode`). Nur Zuschauer sehen den Pfad noch in der bisherigen Ansicht (sie haben keine eigene
Karte).

**Pfadkarte:** kein Neubau — das Pergament mit Holzmarken und Spielfigur ist dasselbe Modul wie bisher
(`battle/table3d/pathMap3d.js`), es hängt jetzt zusätzlich an der neuen Szene (`createPathMap` in `tableRoom.js`,
Lage `setArea(0, 3, 74, 88)`). Liegt die Karte, verschwinden die eingeritzten Felder darunter. `TableMap.jsx`
bedient sie: Marke anklicken geht dorthin, der Mauszeiger zeigt die Vorschau, der eigene Stapel fächert das Deck
auf. Das kurze Ergebnis-Banner einer Szene ist ein eigenes Bauteil (`path/PathResultBanner.jsx`), das die alte und
die neue Ansicht benutzen.
**Pfad-Szenen:** ein Baukasten für alle (`TableScene.jsx`): oben ein Blatt mit Ort und Erklärung, Karten zur Wahl
liegen aus, das eigene Deck fächert sich aus dem Stapel auf den Tisch, Wahlmöglichkeiten liegen als Zettel da, der
Siegelstempel führt aus, was das Blatt in der letzten Zeile nennt, ein Zettel am Rand heißt „Weitergehen“. Was eine
Szene zeigt und tut, beschreibt je Art eine kleine Funktion (`SPECS`) — eine neue Szene ist dort ein neuer Eintrag.
Eigene Gegenstände haben bisher das Lagerfeuer (Feuerschale) und der Händler (Beutel mit Preiszetteln).

| Teil | Umsetzung | Stand |
|---|---|---|
| Draft | Die Karten der Runde liegen in der Tischmitte, daneben der Vorrat mit dem Rundenzettel („3/6“). Anklicken nimmt eine Karte: sie wandert in die eigene Hand, wo das Deck wächst. Nimmt das Gegenüber eine, greift seine Hand danach und steckt sie zu den eigenen (gemeinsamer Pool: offen, getrennte Pools: verdeckt). Gesperrte Legenden sind abgedunkelt. Nach der letzten Karte legen sich die eigenen auf den Stapel | geprüft: gegen die KI (Moor und Gezeiten), online zu zweit in beiden Draft-Modi |
| Totem-Wahl | Die Köpfe stehen als geschnitzte Figuren mit Namensschild in einer Reihe, die Nebendeck-Totems liegen als Karten davor. Anklicken hebt die Wahl an, der Siegelstempel (oder die Leertaste) bestätigt. Gewähltes steht danach dort, wo es im Kampf steht. Der Zeiger auf einer Figur zeigt, was sie bewirkt | geprüft: gegen die KI, online zu zweit in beiden Modi |
| Stundenglas, Masken, Pausenmenü, Aufgeben | gelten in Draft und Totem-Wahl wie im Kampf | geprüft (online) |
| Hinweiszeile | ein Satz zum Einstieg in den Draft (bis man die erste Karte hat) und ein Satz in der Totem-Wahl (was gerade dran ist) — sonst kein Dauertext | gebaut |
| Pfad-Szenen | Kartenwahl (drei Karten, auch verdeckt), Verschmelzung, Sigil-Transfer, Lagerfeuer, Tilgen, Händler, Totem-Schrein, Kopist und alle elf Ereignisse am Tisch (Baukasten, siehe oben). Das Ergebnis einer Szene zeigt weiter das kurze Papierbanner | geprüft: jede Szene und jedes Ereignis einzeln (44 Prüfpunkte), dazu der ganze Weg Draft → Pfad → Kampf |
| Rast | Vor jedem liegt ein Zettel mit seinen besuchten Orten. Wer entscheidet, wählt mit den Stempeln: der eigene = selbst beginnen, der gegenüber = der andere beginnt. Danach beginnt der Kampf am selben Tisch | geprüft (gegen die KI) |
| Ergebnis | Die Kerzen sind aus, die stärkste Karte des Siegers liegt im Licht, daneben ein Zettel mit Ausgang und drei Zahlen. Volle Statistik und beide Decks: über das Menü (bisherige Seite) | geprüft (gegen die KI, online) |
| Revanche am Tisch | Eine Kerze anklicken zündet sie an (links die eigene, rechts die des Gegenübers). Brennen beide, beginnt der neue Draft am selben Tisch | geprüft (gegen die KI, online zu zweit) |
| Derselbe Tisch im ganzen Match | Die Szene wird einmal gebaut und nie neu: Draft → Totem-Wahl → Pfad-Szenen → Kampf → … → Ergebnis → Revanche | geprüft (dasselbe Objekt vom Draft bis in den Kampf, vom Kampf ins Ergebnis und in den neuen Draft) |
| Gesten außerhalb des Kampfs | — | **nicht gebaut** (das Gestenrad gibt es nur im Kampf) |
| Deckübersicht (Kostenkurve, Stämme) | die Karten liegen als Hand bzw. ausgefächert vor einem; die Kurve des alten Formulars gibt es am Tisch nicht mehr | bewusst weggelassen — bei Bedarf als Blatt neben dem Stapel |
| Pfadkarte am selben Tisch | Das Pergament rollt sich zwischen den Szenen auf dem Tisch aus. Leuchtende Marke anklicken geht dorthin, der Mauszeiger auf einer Marke zeigt, was dort wartet; Orte weiter oben liegen im Nebel. Den eigenen Stapel anklicken fächert das Deck zum Ansehen auf. Wie weit das Gegenüber ist, steht auf einem Zettel an der hinteren Kante | geprüft: gegen die KI (Moor und Gezeiten) und online zu zweit vom Draft bis in den Kampf |
| Figur des Gegenübers auf der Karte | — (sein Fortschritt steht auf dem Zettel; welche Orte er besucht, bleibt ohnehin geheim) | **offen** (Kür) |
| Eigene Gegenstände je Szene (Nadel, Schnitzbrett, Tintenfass, Knochenschale …) | bisher nur Feuerschale und Händlerbeutel | **offen** (Kür) |

**Nicht geprüft:** Hotseat und Zuschauer in Draft, Totem-Wahl, Pfad, Rast und Ergebnis · Zeitablauf in Draft, Totem-Wahl, Szenen und Rast (der Server handelt
dann für den Säumigen) · „Animationen reduzieren“ nur auf dem Weg Draft → Kampf, nicht in Rast und Ergebnis ·
Sigil-Transfer und Verschmelzung nur bis zur Auswahl, nicht bis zum Ausführen · wie alles in Bewegung wirkt (nur
Einzelbilder) · Touch auf der Karte (kein Mauszeiger, also keine Vorschau vor dem Gehen).

### Phase 5 — Raum, Menü, Lobby, Buch (M) — begonnen 15.11.2026
Hauptmenü im Raum, Lobby als Hinsetzen, Seitenleiste weg, Kartenbuch und Anleitung als Buch, Tutorial am neuen Tisch
(ein Erzähler-Blatt statt Hinweiszeile).

| Teil | Umsetzung | Stand |
|---|---|---|
| Hauptmenü | Dunkler Raum, ganzer Tisch (Kamera `raum`), Platz gegenüber leer, drei Karten des Tages auf dem Tisch. Sieben Zeilen am linken Rand, Erklärung nur unter dem Zeiger; Name als leise Zeile („Am Tisch als …“), fehlt er, wird beim ersten Schritt gefragt | abgenommen 15.11.2026 |
| Seitenleiste weg | Am Tisch-Menü keine Website-Leiste; Einstellungen, Ton und „Website“ klein unter dem Menü | gebaut |
| Beitreten | Code in derselben Spalte, Esc zurück | gebaut, geprüft |
| Übung | Wortwahl statt Formular (Gegner, Zirkel, Draft, Siege, Pfad, Seed), startet direkt am Tisch | gebaut, geprüft (bis in den Draft) |
| Ausweichweg | bisheriges Menü bei „Bisheriger Tisch“, Sparmodus, ohne WebGL, hochkant | geprüft (alt, hochkant) |
| Durchgehender Tisch Menü → Lobby → Match | Szene in der Hülle (`TableKeeper`), Bildschirme melden sich an; 4 s Frist nach dem letzten | gebaut, geprüft (dieselbe Szene vom Menü bis in den Draft, online) |
| Lobby als Hinsetzen | Gestalt kommt beim Beitritt an den Tisch, geht beim Aufstehen; Zettel für die Einstellungen; Stempel = bereit; Gesten | gebaut, geprüft (zwei Browser + Zuschauer), **Abnahme offen** |
| Kartenbuch und Anleitung als Buch | Ein Buch über dem Tisch, Lesebändchen als Kapitel, echte Doppelseiten, Karten als Sammelalbum | gebaut, geprüft (1366×768, 1920×1080, 2560×1440), **Abnahme offen** |
| Tutorial am neuen Tisch | Erzähler-Blatt oben links, Texte für die Bedienung am Tisch, Neustart im Pausenmenü | gebaut, geprüft, **Abnahme offen** |

### Phase 6 — Moorwanderung (M–L) — gebaut 15.11.2026 (Schritte 1–3), abgenommen 16.11.2026
Lager, Siegel, NPCs als Gestalten mit eigenen Masken, Boss mit Phasenwechsel, Duell-Ankündigung, Blick auf Nachbartische
statt Vorschau-Kasten.

### Phase 7 — Handy, Sparmodus, Zugänglichkeit, Feinschliff (M) — gebaut 16.11.2026, Abnahme offen
~~Hochkant-Kamera (steiler, Hand als Leiste)~~ (Nutzer: hochkant bleibt flach, mit Hinweis und Wechsel beim Drehen),
Touch-Gesten, Flachtisch für `gfx=low`, Tastatur komplett, Screenreader-Spiegelung, „Animationen reduzieren“,
Leistungsmessung auf schwacher Grafik. Einzelheiten in der Übergabe oben.

### Danach, getrennt zu entscheiden — Regeln
Erst wenn sich das Spiel gut anfühlt, lohnt der Blick auf die Regeln; vorher lässt sich nicht trennen, was am Regelwerk
und was an der Darstellung liegt. Kandidaten, die ich dann **messen** würde, nicht jetzt ändern:
Kampfdauer in Zügen, Zahl gleichzeitiger Totems (bis zu drei je Spieler), Einstiegshürde durch zwei Zirkel mit je
170+ Karten (z. B. ein kleiner „Erste Schritte“-Kartensatz).

---

## 5. Risiken

| Risiko | Gegenmittel |
|---|---|
| Text auf schräg liegenden Karten wird unscharf | Phase 0 prüft genau das; große Texturen, anisotrope Filterung, Karte unter dem Zeiger hebt sich; notfalls Kamera steiler |
| Zwei Oberflächen pflegen | Flachtisch wird eingefroren, keine neuen Funktionen dort |
| Umfang (Szenen, Moorwanderung) | Reihenfolge so gewählt, dass nach Phase 2 schon der Kern stimmt; alles danach ist einzeln abnehmbar und einzeln weglassbar |
| Leistung auf Laptops | Bildrate in Ruhe gedrosselt, Qualitätsstufen, Sparmodus |
| Stil trifft nicht | Stilprobe vor allem anderen; keine Phase baut auf einem nicht abgenommenen Look auf |
| Zu nah am Vorbild | Eigener Schauplatz, eigene Figuren, eigene Gegenstände (Siegelstempel, Wachs, Tusche); übernommen werden nur Prinzipien |

---

## 6. Entscheidungen

Am 14.11.2026 entschieden: **Hinterreihe bleibt** (1) · **echte Aufnahmen (CC0) dürfen ins Projekt** (3) ·
**erst 1-gegen-1, dann Moorwanderung** (4) · **Gestalt mit Kapuze, Maske und Händen** (2, an der Stilprobe) · **der neue Tisch ist Standard** (5; der bisherige bleibt
als Ausweichweg wählbar, nicht nur im Sparmodus — ob die Wahlmöglichkeit später entfällt, ist nicht entschieden).

1. **Hinterreihe behalten?** Empfehlung: **ja.** Sie ist das eigene Element gegenüber dem Vorbild, steckt in Überlauf,
   Salz und rund 340 ausbalancierten Karten und funktioniert wie eine Warteschlange für beide Seiten. Sie wird nur
   anders gezeigt (fern klein, nah als Mulde).
2. **Gestalt des Gegners:** Empfehlung: Kapuze + Maske + Hände, bewusst schlicht und dunkel, Masken wählbar. Alternative:
   nur Hände aus dem Dunkel (weniger Aufwand, weniger Wirkung). Entscheidung an der Stilprobe.
3. **Klang:** Empfehlung: gemeinfreie Aufnahmen (CC0) als `.ogg` nach `public/media/sfx/` — die Ersatz-Schnittstelle
   dafür gibt es schon. Brauche dein Ja, weil Dateien von außen ins Projekt kommen (rund 1–2 MB).
4. **Reihenfolge:** Empfehlung: erst 1-gegen-1 fertig (Phasen 0–5), dann Moorwanderung. Bis dahin läuft die
   Moorwanderung auf dem heutigen Stand weiter.
5. **Alter Tisch:** Empfehlung: nur noch als Sparmodus behalten, der Schalter „3D-Tisch aus“ entfällt nach Phase 2.

---

## 7. Ideen für später (nicht eingeplant)

- Eigene Kartenrücken und Tischtücher als Freischaltungen.
- Wiederholung des letzten Zugs („Was ist gerade passiert?“) per Knopfdruck auf das Stundenglas.
- Tagesrätsel: ein fester Kampfstand, Sieg in einem Zug.
- Zuschauer als Kerzen am Raumrand, die bei Gesten flackern.
- Streamer-Ansicht: Kamera schwenkt in Pausen durch den Raum.
