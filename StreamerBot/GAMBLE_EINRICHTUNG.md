# Gamble-System einrichten (Streamer.bot)

Punkte gibt es fürs Zuschauen. Ausgeben kann man sie bei diesen Spielen, dazu gibt es Preise auf der Murmelbahn:
- **!gamble**: Gewonnen oder verloren, 50:50. Gewonnen heißt doppelt zurück. Antwort sofort im Chat, bewusst ohne Overlay, damit bei vielen Spielern nichts staut.
- **!rakete**: Crash-Spiel mit eigenem Ziel-Multiplikator.
- **Murmelbahn** der Website: keine Wetten. Wer mitfährt, bekommt Punkte, Platz 1 einen festen Preis. Je mehr Fahrer, desto höher, bei vielen Fahrern auch für Platz 2 und 3.
- **Topf**: Ein Teil der Verluste sammelt sich. Am Streamende gewinnt ein Zuschauer den Topf, gewichtet nach Zuschauzeit.

Der ganze Code steckt in **einer** Datei: `StreamerBot/GambleCore.cs`.

---

## 1. Kern-Aktion anlegen (einmalig)

1. Streamer.bot → **Actions** → Rechtsklick → **Add**. Name: `Gamble Core`, Gruppe: `Gamble`. **Kein Trigger.**
2. Unten Rechtsklick → **Core → C# → Execute C# Code**.
3. Den kompletten Inhalt von `GambleCore.cs` einfügen und im Code-Editor oben bei **Name** `GambleCore` eintragen. Ohne Namen findet „Execute C# Method“ den Code nicht und meldet „No Execute C# sub-action was found“.
4. Oben in der Datei die Zeile `MURMEL_OVERLAY_KEY` anpassen. Den Schlüssel findest du im Twitch-Dashboard der Website unter **OBS-Link**. Der Link sieht so aus: `…/twitch-tools/overlay/SCHLÜSSEL`.
5. Unten links **Compile** drücken. Es muss `Compiled successfully` erscheinen.
6. Haken bei **Precompile on Application Start** setzen und mit **Save and Compile** schließen.

## 2. Aktionen für Trigger und Befehle

Jede dieser Aktionen bekommt genau **einen** Unterbefehl:
**Core → C# → Execute C# Method**. Im Feld **Execute C# Code** `GambleCore` auswählen, bei **Method** die Methode aus der Tabelle.

| Aktion | Trigger | Method |
|---|---|---|
| Gamble Watchtime | Twitch → General → **Present Viewers** | `Watchtime` |
| Gamble Chat | Twitch → Chat → **Chat Message** | `ChatAktiv` |
| Gamble !punkte | Command `!punkte` (Alias `!points`) | `Punkte` |
| Gamble !top | Command `!top` | `Bestenliste` |
| Gamble !geben | Command `!geben` | `Geben` |
| Gamble !gamble | Command `!gamble` | `Gamble` |
| Gamble !rakete | Command `!rakete` | `Rakete` |
| Gamble !topf | Command `!topf` | `Topf` |

**Befehle anlegen:** Reiter **Commands** → Rechtsklick → **Add**.
- Befehl eintragen und **Location: Start** wählen.
- Bei der Aktion als Trigger **Core → Commands → Command Triggered** mit diesem Befehl setzen.
- Keine eigenen Cooldowns nötig. Der Code bremst selbst, z. B. 5 s pro Person bei `!gamble` (`GAMBLE_COOLDOWN_S`, 0 = keine Wartezeit).

**Present Viewers:** Platforms → Twitch → Settings → *Present Viewers*.
- **Live Update** an, Intervall **5 Minuten**.
- Der Trigger läuft nur, solange du live bist. Offline gibt es also keine Punkte.

## 3. Topf am Streamende

In deiner bestehenden Aktion **End_Stream** als **ersten** Unterbefehl einfügen:
**Execute C# Method** → `Gamble Core` → `TopfZiehen`.

Der Gewinner steht danach im Chat und im Overlay. Außerdem liegt er in der globalen Variable `session_topf_gewinner`, falls du ihn in den Stream-Credits zeigen willst.

Mods können auch jederzeit `!topf ziehen` schreiben.

## 4. Overlay in OBS

Browser-Quelle, 1920 × 1080:
```
https://vnmvalentin.de/overlay/gamble
```
- Zum Platzieren ohne laufendes Spiel: `https://vnmvalentin.de/overlay/gamble?demo=1`
- Teile einzeln als eigene Quellen, damit du sie frei verschieben kannst:
  `?nur=rakete`, `?nur=murmeln`, `?nur=meldungen` (Topf-Gewinner)

Das Overlay verbindet sich wie die Stream-Credits mit `ws://127.0.0.1:8080/`. Der WebSocket-Server von Streamer.bot muss also an sein (ist er schon für die Credits).

## 5. Befehle für Zuschauer

| Befehl | Was passiert |
|---|---|
| `!punkte` / `!punkte <name>` | Kontostand, Zuschauzeit, Platz |
| `!top` | die 5 Reichsten |
| `!geben <name> <betrag>` | Punkte verschenken |
| `!gamble <betrag>` | 50:50 — gewonnen = doppelt zurück, verloren = weg. Ergebnis kommt sofort im Chat |
| `!rakete <betrag> <ziel>` | z. B. `!rakete 100 2.5`. Erreicht die Rakete 2,5x, gibt es 250 zurück. Die erste Wette öffnet eine Runde mit 30 s Wartezeit |
| `!topf` | wie viel im Topf liegt |

Beträge gehen als `500`, `1k`, `2.5k`, `half`, `all` oder `25%`.

**Nur Mods:**
- `!punkte add|remove|set <name> <betrag>`
- `!topf ziehen`

## 7TV-Emotes

Die Chat-Nachrichten enthalten 7TV-Emotes. Damit sie als Bild erscheinen, müssen sie in deinem 7TV-Emote-Set sein. Groß- und Kleinschreibung zählt.

| Wofür | Emotes |
|---|---|
| Gewonnen | `EZ` `PogU` `catJAM` `Clap` |
| Verloren | `Sadge` `KEKW` `OMEGALUL` `PepeLaugh` |
| All-in gewonnen | `GIGACHAD` `BASED` |
| All-in verloren | `Deadge` `Aware` |
| Rakete startet | `monkaS` |
| Rakete explodiert | `KEKW` `monkaW` |
| Murmel-Sieger, Topf | `Clap` `PogU` `PagMan` `POGGERS` |

Andere Emotes trägst du oben in `GambleCore.cs` bei `EMOTES_…` ein. Dort stehen auch die zufälligen Sprüche (`SAETZE_GEWONNEN`, `SAETZE_VERLOREN`).

## Regeln, die man wissen sollte

- **Neue Zuschauer** starten mit 100 Punkten.
- **Watchtime:** 10 Punkte pro 5 Minuten, +5 wer in der Zeit geschrieben hat. Subs bekommen ×1,5.
- **Rakete:**
  - Man legt sein Ziel vorher fest, statt live `!raus` zu tippen. Durch die Stream-Verzögerung wäre Live-Aussteigen unfair, weil der Chat die Rakete Sekunden später sieht.
  - Der Hausvorteil liegt bei 4 %. In 4 % der Runden explodiert die Rakete sofort bei 1,00x.
- **Murmelbahn:**
  - Platz 1 bekommt 100 + 25 Punkte pro Fahrer, höchstens 2.000 (4 Fahrer: 200, 10 Fahrer: 350, 30 Fahrer: 850).
  - Ab 8 Fahrern bekommt Platz 2 die Hälfte davon, ab 15 Fahrern Platz 3 ein Viertel.
  - Jeder Fahrer bekommt zusätzlich 20 Punkte fürs Mitfahren.
  - Testmurmeln aus dem Dashboard bekommen nichts.
  - Alle Werte stehen oben in `GambleCore.cs` (`MURMEL_PREIS_…`, `MURMEL_AB_PLATZ2/3`).
  - Gab es vorher eine Aktion `Gamble !wette`, kann sie weg. Bleibt sie stehen, antwortet sie nur, dass es keine Wetten mehr gibt.
- **Topf:** 10 % aller Verluste aus `!gamble` und Rakete fließen hinein.
- **Bots** (`nightbot`, `streamelements`, `vallebot_` …) bekommen keine Punkte. Die Liste steht oben in `GambleCore.cs`.
- **Alle Zahlen** (Punkte, Gewinnchance bei `!gamble`, Wartezeiten) stehen als Einstellungen ganz oben in `GambleCore.cs`. Nach einer Änderung neu kompilieren.
- **Was verloren gehen kann:** Laufende Raketen-Runden gehen bei einem Neustart von Streamer.bot verloren. Kontostände nicht, die sind gespeichert.
- **Echtes Geld:** Punkte dürfen nie mit echtem Geld kaufbar oder auszahlbar sein.
