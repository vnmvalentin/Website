# Twitch-Erweiterung „Win Tracker“ — Plan und Einrichtung

Ausbauplan „twitch-erweiterung“ (Spur C), Stand 18.11.2026. Ziel: Zuschauer sehen Liga, Session, letzte Spiele und
Deck direkt unter dem Stream; Streamer finden den Win Tracker im Erweiterungs-Verzeichnis von Twitch.

## Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| 1 | Panel + Einstellungsseite, Server, Zip zum Hochladen | **gebaut + getestet** (wartet auf Deploy + Konsole) |
| 2 | Einrichten in der Konsole, Hosted Test auf deinem Kanal, Einreichen bei Twitch | deine Schritte unten |
| 3 | Nach der Freigabe: Hinweis auf `/tools/win-tracker` und im Win-Tracker-Editor (Anschluss an Spur B), Update-Log | offen |
| 4 | Optional: Video-Overlay (Komponente über dem Stream), Ansicht für die Handy-App | später |

## Wie es funktioniert

- **Panel** (`Frontend/twitch-extension/panel.html`): zeigt die echte Win-Tracker-Karte (dieselbe wie im OBS, 310 px,
  das Panel ist 318 px breit), in der Sprache des Zuschauers, hell/dunkel wie Twitch. Was zu sehen ist, wählt der
  Streamer im Win Tracker; nur feste OBS-Größen und das Blättern zwischen den Teilen fallen im Panel weg.
- **Einstellungsseite** (`config.html`, nur für den Streamer): sagt, ob für den Kanal ein Win Tracker eingerichtet ist,
  führt sonst in drei Schritten hin und zeigt eine Vorschau. Gespeichert wird dort nichts.
- **Server** (`Backend/twitchExtension/`): prüft Twitchs Token, liest den Win Tracker des Kanals (Revier B, nur lesen)
  und hält je Kanal 15 s vor. Der Streamer muss nichts verknüpfen: Die Kanal-ID im Token ist seine Twitch-ID, und daran
  hängt sein Win Tracker.
- Zuschauer werden nicht gespeichert, es gibt keine Anmeldung und keine Freigabe der Twitch-Identität.

## Deine Schritte

### 1. Erweiterung anlegen (dev.twitch.tv → Console → Extensions → Create Extension)

- Name: z. B. **„Win Tracker for Clash Royale“** — der Spielname nur beschreibend (Supercells Fan-Content-Regeln),
  kein Logo von Supercell als Symbol.
- Typ: **Panel** (nur Panel; Video-Overlay und Mobile erst in Etappe 4).

### 2. Version 0.0.1 einstellen

**Asset Hosting**
- Panel Viewer Path: `twitch-extension/panel.html`
- Config Path: `twitch-extension/config.html`
- Live Config Path: leer
- Panel Height: **500**

**Capabilities**
- Allowlist for URL Fetching Domains: `https://vnmvalentin.de`
- Allowlist for Image Domains: `https://api-assets.clashroyale.com`
- Allowlist for Config URLs: `https://vnmvalentin.de` (die Einstellungsseite verlinkt zum Win Tracker)
- Allowlist for Panel URLs: leer (das Panel hat keine Links)
- Request Identity Link: **nein**
- Configuration Location: eigener Dienst / „Custom“ — die Einstellungsseite speichert nichts, sie prüft nur.
- Required Configurations: leer
- Bits, Subscriptions, Chat: aus

### 3. Server

In die Server-.env (Werte unter Extension Settings → Client Configuration):

```
TWITCH_EXT_CLIENT_ID=<Client-ID der Erweiterung>
TWITCH_EXT_SECRET=<Extension Secret, genau wie angezeigt (Base64)>
```

Ohne die beiden Zeilen antwortet `/api/twitch-ext/*` mit 503 („nicht eingerichtet“), sonst passiert nichts.
Danach Backend-Deploy (die Route steht in `Backend/index.js`, vor dem allgemeinen CORS).

### 4. Paket bauen und hochladen

```
cd Frontend
npm run twitch-ext:build
```

→ `Frontend/twitch-extension/dist/win-tracker-twitch-extension.zip` (rund 1,5 MB, 435 Dateien). In der Konsole unter
**Files → Upload Version Assets** hochladen. Das Zip enthält die Dateien direkt (kein umschließender Ordner).
Hinweis: Vite unter Windows aus PowerShell oder der VS-Code-Kommandozeile starten, nicht aus Git Bash (`/c/…`-Pfade
machen die Pfade kaputt).

### 5. Hosted Test

**Status → Move to Hosted Test**, dann auf deinem Kanal unter Creator Dashboard → Erweiterungen installieren und als
Panel aktivieren. Prüfen: Einstellungsseite zeigt „Verbunden“, Panel unter dem Stream zeigt die Karte (auch am Rechner
in einem zweiten Browser ohne Anmeldung).

### 6. Einreichen (Submit for Review)

- **Summary** (Kurztext), **Description**: siehe unten
- **Screenshots**: Panel unter dem Stream (Hosted Test) und Einstellungsseite
- **Icons**: 100×100 und 24×24, 300×200 Discovery-Bild — eigenes Win-Tracker-Symbol, kein Supercell-Logo
- **Privacy Policy URL**: Datenschutz der Website (Abschnitt Twitch-Erweiterung — Anschluss an Spur A)
- **EULA/ToS URL**: AGB/Nutzungsbedingungen der Website
- **Testing Instructions**: „The panel shows the broadcaster's Clash Royale Win Tracker from vnmvalentin.de. The test
  channel <dein Kanal> has a Win Tracker set up; the panel shows league/medals, the current session and the deck. On a
  channel without a Win Tracker the panel explains that it isn't set up; the config page links to the setup page.“
- **Review-Kanal**: dein Kanal (das Panel muss dort aktiv sein, solange Twitch prüft)

## Texte

**Summary** (EN): Show your Clash Royale league, session record, latest games and deck right below your stream — live
from the official API, set up once on vnmvalentin.de.

**Description** (EN):
> The Win Tracker panel shows your viewers what your Win Tracker overlay shows: your league and medals (or trophies),
> the record of your current session, your latest games and your deck — updated automatically after every match, in
> each viewer's language (German or English).
> Set up your Win Tracker on vnmvalentin.de with the same Twitch account, then add the panel — no extra linking needed.
> Your look and modules carry over from your overlay settings. The panel doesn't store anything about your viewers.

## Prüfregeln von Twitch, die der Build einhält

- Twitchs Helfer als erstes Skript in jeder Seite, alle übrigen Skripte im Paket, kein Inline-Skript, kein `eval`
- Nur relative Pfade (`base: './'`), keine `data:`-Bilder, kein `public/`-Ordner der Website
- Schriften (Inter, Lilita One, beide OFL) liegen im Paket
- Netz nur zu `vnmvalentin.de` (Daten) und `api-assets.clashroyale.com` (Kartenbilder)

Der Prüfstand (Scratch) hat genau das mit einer nachgestellten CSP geprüft: keine Verstöße, Karte 318 px breit,
ganze Karte mit Deck in 500 px Höhe.
