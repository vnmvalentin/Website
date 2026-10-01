# Planung: Turniere für die Clash-Royale-Minigames

Stand: 01.10.2026 · Status: **Phase 1 + 2 fertig** (Anlegen/Anmelden; Start von Hand + Autostart, Gruppen, Bracket, Ergebnis durch den Veranstalter); als Nächstes Phase 3 (Match-Raum).

## 1. Grundentscheidungen (mit dem Nutzer geklärt)

| Frage | Entscheidung |
|---|---|
| Ablauf eines Spiels | Draft im Minigame **+ echter Freundschaftskampf** in Clash Royale mit dem gedrafteten Deck |
| Sieger | per **CR-API** (Kampfliste beider Spieler), keine Selbstmeldung |
| Best of 3/5 | **jedes Spiel neu**: eigener Modus (Pick/Ban oder Zufall), eigener Draft, eigener Kampf |
| Anmeldung | **Twitch-Login + CR-Kürzel**; der Veranstalter kann stattdessen „ohne Login" erlauben |
| API findet nichts / Unentschieden | **Veranstalter entscheidet** (Spiel wird „Klärung nötig"); Unentschieden = neu spielen |
| Grand Final (Double Elimination) | **mit Bracket-Reset**: der Upper-Sieger muss zweimal geschlagen werden |
| Veranstalter spielt mit | er **schlichtet seine eigenen Matches selbst** (kein Co-Veranstalter) |
| Erscheinen | **kein Check-in**, sondern eine **Frist pro Match**: wer nicht rechtzeitig im Match-Raum ist, verliert kampflos (Free Win für den Gegner); erscheinen beide nicht → Veranstalter |

**API-Machbarkeit geprüft (01.10.2026):** Stichprobe aus 32 Spielern, ~1100 Kämpfe. Freundschaftskämpfe
stehen in `/players/{tag}/battlelog` als `type: "friendly"` (Clan-intern: `"clanMate"`), mit beiden Tags,
Kronen und allen 8 Karten (`gameMode.name = "Friendly"`, `deckSelection = "collection"`). Damit lassen sich
Sieger UND benutztes Deck prüfen. Grenzen (siehe core/crTracking.js): nur die letzten ~25 Kämpfe,
Aktualisierung mit einigen Minuten Verzögerung, kein Cursor.

## 2. Einstellungen des Turniers

Vom Nutzer gewünscht:
- Name, Beschreibung
- maximale Spielerzahl
- verfügbare Minigames (nur Solo-Modi)
- Gruppenphase ja/nein · Spieler pro Gruppe (muss mit der Spielerzahl aufgehen) · Weiterkommende pro Gruppe
- Bracket: nur Upper (Single Elimination) oder Upper + Lower (Double Elimination)
- Best of 1 / 3 für normale Spiele · Best of 3 / 5 für Finals (Upper-, Lower-, Grand-Final)
- Modus-Wahl: **Pick/Ban** (Server zieht 3 aus dem Pool, beide bannen je 1, der dritte wird gespielt) oder **Zufall**
- Turnierstart (Zeitpunkt)
- vor dem Start jederzeit änderbar; Veranstalter darf selbst mitspielen

Ergänzt (Vorschläge, alle mit sinnvollem Standard):
- **Anmeldemodus**: Twitch Pflicht (Standard) / ohne Login
- **Start manuell oder automatisch** zum eingestellten Zeitpunkt
- **Modus-Einstellungen**: je Modus das Preset „Vorgeschlagen" (Standard) oder ein anderes Preset; Kartenpool-Ausschlüsse wie in der Lobby
- **Deck-Prüfung**: muss im Kampf das gedraftete Deck benutzt werden? (Standard: ja; Abweichung → „Klärung nötig")
- **Zeitlimits**: Erscheinen im Match-Raum (Standard 10 min, sonst kampfloser Sieg für den Anwesenden), Kampf nach Draft-Ende (Standard 20 min bis „Klärung nötig")
- **Sichtbarkeit**: im Hub gelistet oder nur per Link
- **Setzliste (Seeding)**: Zufall (Standard); ins Bracket nach Gruppenplatzierung, Gruppenerste nicht direkt gegeneinander
- **Tiebreaker in Gruppen**: Siege → Spiel-Differenz → Kronen-Differenz → direkter Vergleich → Los

## 3. Abläufe

### Anmeldung
Link `/clash-royale/turnier/<id>` → Twitch-Login (bzw. Name) + CR-Kürzel. Das Kürzel wird beim Anmelden per API
geprüft (existiert, Name wird angezeigt) und ist pflicht. Bereits im Profil hinterlegte Accounts werden angeboten.
Optional: **CR-Freundschaftslink** angeben — Freundschaftskämpfe gehen in CR nur unter Freunden/Clanmitgliedern,
der Link erscheint dann im Match-Raum beim Gegner.

### Start
Auslosung erst beim Start: zufällige Gruppen bzw. Bracket-Plätze. Bei Teilnehmerzahl ohne Zweierpotenz: Freilose
(Byes) für die Gesetzten.

### Gruppenphase
Jeder gegen jeden. Tabelle je Gruppe (Spiele, Siege, Niederlagen, Spiel-Differenz, Kronen), Spielplan mit
gespielten und offenen Begegnungen. Alle Gruppen für alle einsehbar. Gruppenspiele dürfen parallel laufen.

### Bracket
Single oder Double Elimination, Bo-Einstellung je Runde. Grand Final mit Bracket-Reset: gewinnt der Lower-Sieger
die erste Serie, folgt eine zweite (entscheidende) Serie.

### Ein Match (Match-Raum)
1. Turnier-Seite zeigt markant **„Dein nächstes Match — Raum beitreten"**.
2. Match-Raum: beide Spieler, **Chat**, Gegner-Infos (CR-Name, Liga, Freundschaftslink), Serienstand.
3. Beide klicken **Bereit** → der höher Gesetzte (bzw. Spieler A) kann starten.
4. Modus: Pick/Ban-Bildschirm (3 Modi, abwechselnd bannen) oder Zufall.
5. Server erzeugt automatisch eine normale Minigame-Lobby nur für die zwei (Veranstalter als Zuschauer), mit den
   Turnier-Einstellungen, und startet sie. Gedraftet wird wie gewohnt.
6. Draft-Ende (`notifyDraftComplete`) → beide sehen ihr Deck mit Kopier-Link/QR und den Hinweis
   „Freundschaftskampf in Clash Royale starten". Server fragt die Kampflisten beider Tags alle ~20 s ab und
   sucht einen `friendly`/`clanMate`-Kampf **zwischen genau diesen Tags nach Draft-Ende**.
7. Gefunden → Sieger nach Kronen, Deck-Prüfung → Serienstand; nächstes Spiel oder Match beendet.
   Nicht gefunden nach Zeitlimit / Unentschieden / falsches Deck → „Klärung nötig" beim Veranstalter.

### Veranstalter-Werkzeuge
Einstellungen vor Start ändern · Spieler entfernen/nachrücken · Turnier starten/pausieren/abbrechen ·
jedes Ergebnis setzen/korrigieren · Spiel/Match zurücksetzen · in jeden Match-Raum und jede Draft-Lobby als
Zuschauer · Übersicht „Klärung nötig".

## 4. Technik

- **Speicher**: better-sqlite3, eigene Datei `Backend/data/cr_tournaments.db` (gitignored), Tabellen
  `tournaments`, `participants`, `matches`, `games`, `chat_messages` (letzte N je Match). Übersteht Neustarts —
  laufende Draft-Lobbys nicht (wie heute), das betroffene Spiel wird dann zurückgesetzt.
- **Echtzeit**: socket.io-Raum `tournament:<id>` für Turnierseite, `tmatch:<id>` für Match-Räume.
- **Reine Logik getrennt und getestet**: Gruppen-Spielplan, Tabellen/Tiebreaker, Bracket-Generator
  (Single/Double, Byes), Fortschreiben von Ergebnissen — als Funktionen ohne I/O mit Node-Tests.
- **API-Last**: nur aktive „warte auf Kampf"-Spiele werden abgefragt, Cache wie in crTracking.js. Token:
  lokal funktioniert nur `CLASH_ROYALE_API_TOKEN_WINTRACKER` (siehe Memory) — auf dem Server prüfen.
- **Frontend**: Unterseiten in der CR-Hülle (`/clash-royale/turnier/...`), gleicher CR-Look, i18n DE/EN/ES.

## 5. Umsetzung in Phasen

1. **Grundgerüst**: Datenmodell + Store, Turnier anlegen/bearbeiten, Anmeldung mit Tag-Prüfung, Turnierseite
   vor dem Start (Info, Regeln, Modi, Spielerliste), Knopf „Turnier erstellen" im Hub.
2. **Turnierlogik**: Auslosung, Gruppen-Spielplan + Tabellen, Bracket-Generator — vollständig getestet.
   Turnierseite nach dem Start (Gruppen, Bracket-Baum, „Dein nächstes Match").
3. **Match-Raum**: Chat, Bereit, Pick/Ban, automatische Draft-Lobby, Rückkehr in den Raum.
4. **Ergebnis per API**: Kampfsuche, Deck-Prüfung, Zeitlimits, Serien Bo1/3/5, Fortschreiben in Gruppe/Bracket.
5. **Veranstalter-Werkzeuge** + Zuschauen in Match-Räumen und Drafts.
6. **Feinschliff**: Benachrichtigung (Ton/Hervorhebung) wenn ein Match bereit ist, Handy-Ansicht, Übersetzungen,
   Ende-Bildschirm mit Siegerehrung.

Jede Phase ist für sich lauffähig und wird einzeln committet.

## 6. Offene Fragen

Keine — alle geklärt (siehe Abschnitt 1).

## 7. Stand der Umsetzung

**Phase 2 (01.10.2026):**
- `tournament/structure.js` — reine Logik: Auslosung, jeder gegen jeden, Tabellen (Siege → Spiel-Diff → Kronen-Diff →
  direkter Vergleich bei Zweier-Gleichstand → Los = Auslosungsreihenfolge), Bracket Single/Double mit Freilosen für die
  Bestgesetzten, Grand Final + Reset (`gf1`/`gf2`), Fortschreiben (`applyResult`). Setzliste nach Gruppen: alle Ersten,
  dann alle Zweiten …; Erstrunden-Duelle von Gruppenkameraden werden durch Tausch innerhalb derselben Platzierung aufgelöst.
- Bei weniger Anmeldungen als maxPlayers werden entsprechend weniger Gruppen gebildet (`groupCountFor`), pro Gruppe
  kommen nie alle weiter. Zu wenige Spieler → `tournamentTooFewPlayers`.
- `tournament/lifecycle.js` — Start, Ergebnis (+ Bracket nach letztem Gruppenspiel, Turnierende), Sicht für GET /:id.
- Autostart: Router prüft alle 30 s; scheitert der Start, wird autoStart abgeschaltet.
- **Vorgezogen aus Phase 5:** `POST /:id/matches/:mid/result` (nur Veranstalter, nur offene Matches) — nötig, damit
  Turniere vor Phase 4 überhaupt fortschreiten. Korrigieren entschiedener Matches fehlt noch (Phase 5).
- Frontend: `TournamentStructure.jsx` (nächstes Match mit noch deaktiviertem „Raum beitreten", Gruppen-Tabellen +
  Spielplan, Bracket-Baum, Ergebnis-Dialog, Siegerbanner).
