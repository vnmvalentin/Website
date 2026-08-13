# Umzug VPS → VDS (Contabo), Schritt für Schritt

Es gibt keinen Migrationsknopf: VDS ist eine neue Maschine mit neuer IP. Der Umzug ist
Handarbeit, aber geradlinig — wenn die Reihenfolge stimmt.

`ALT` = aktueller Server (vmd138811), `NEU` = neuer VDS.
Abhaken, nicht überspringen. Besonders Phase 0 und Phase 3.

---

## Die vier Stellen, an denen es schiefgeht

1. **SQLite im laufenden Betrieb kopieren.** Neben jeder `.db` liegen `-wal` und `-shm`.
   Kopiert man die Dateien, während der Dienst schreibt, bekommt man einen Stand, den es
   nie gab. → Dienst **vorher stoppen**.
2. **Discord-Bot und Twitch-IRC doppelt laufen lassen.** Sind ALT und NEU gleichzeitig
   aktiv, hängen zwei Bots an denselben Konten: doppelte Nachrichten, doppelte Reaktionen,
   Rate-Limits. → Auf NEU erst starten, wenn auf ALT gestoppt ist.
3. **Zertifikate vergessen.** Let's Encrypt liegt in `/etc/letsencrypt`. Ohne die Dateien
   startet nginx nach dem Umzug nicht.
4. **DNS-TTL zu hoch.** Steht sie auf 24 h, erreichen dich Besucher noch einen Tag lang auf
   dem alten Server. → Einen Tag VOR dem Umzug herunterstellen.

---

## Phase 0 — Vorbereitung (Tage vorher, ohne Risiko)

- [ ] **Erst messen, dann kaufen.** VDS stundenweise nehmen oder direkt nach dem Anlegen:
      ```bash
      scp Backend/deploy/loopProbe.js NEU:/tmp/
      ssh NEU 'node /tmp/loopProbe.js 300'
      ```
      Ziel: typische Sekunde 1–3 ms, **null** Blockaden > 40 ms. Sieht es aus wie auf ALT,
      lohnt der ganze Umzug nicht — dann zuerst mit Contabo reden.
- [ ] **DNS-TTL senken** auf 300 s (bei deinem DNS-Anbieter für `vnmvalentin.de` und `www`).
- [ ] **Inventur auf ALT** — was läuft hier eigentlich alles?
      ```bash
      systemctl list-units --type=service --state=running
      ls /etc/nginx/sites-enabled/
      crontab -l; sudo crontab -l
      node -v; nginx -v
      df -h /; free -h
      ls -la /var/www/
      ```
      Notier dir die Node-Version — auf NEU dieselbe installieren.

---

## Phase 1 — NEU aufsetzen (ohne Zeitdruck, ALT läuft weiter)

- [ ] Grundpakete:
      ```bash
      apt update && apt upgrade -y
      apt install -y nginx git curl ufw ncdu
      ```
- [ ] **Node in derselben Version** wie auf ALT (`node -v` von dort). Über NodeSource:
      ```bash
      curl -fsSL https://deb.nodesource.com/setup_XX.x | bash -   # XX = Hauptversion von ALT
      apt install -y nodejs
      node -v    # muss zu ALT passen
      ```
- [ ] Benutzer/Rechte: `www-data` existiert auf Debian/Ubuntu bereits.
- [ ] Firewall:
      ```bash
      ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
      ```
      **Nicht** 3001/3002 öffnen — die laufen nur auf Loopback hinter nginx.

---

## Phase 2 — Daten übertragen

Am schnellsten zieht NEU direkt von ALT (beide sind Linux, kein Umweg über den PC).
Auf **NEU** ausführen:

- [ ] Statische Teile schon mal vorab, während ALT weiterläuft:
      ```bash
      rsync -avz --exclude node_modules root@ALT_IP:/var/www/ /var/www/
      rsync -avz root@ALT_IP:/etc/nginx/sites-available/ /etc/nginx/sites-available/
      rsync -avz root@ALT_IP:/etc/letsencrypt/ /etc/letsencrypt/
      rsync -avz root@ALT_IP:/etc/systemd/system/admin-api.service /etc/systemd/system/
      rsync -avz root@ALT_IP:/etc/systemd/system/blobby.service /etc/systemd/system/
      rsync -avz root@ALT_IP:/etc/admin-api.env /etc/
      ```
      `node_modules` wird ausgelassen und auf NEU frisch installiert — `better-sqlite3` ist
      nativ kompiliert und muss zur dortigen Node-Version passen.
- [ ] Abhängigkeiten auf NEU bauen:
      ```bash
      cd /var/www/admin-api && npm ci --omit=dev   # oder: npm install
      ```
- [ ] nginx-Site aktivieren und prüfen:
      ```bash
      ln -s /etc/nginx/sites-available/DEINE-SITE /etc/nginx/sites-enabled/
      nginx -t
      ```

### Jetzt kommt die kurze Auszeit (wenige Minuten)

- [ ] Auf **ALT** alles stoppen, was schreibt:
      ```bash
      systemctl stop admin-api blobby
      systemctl status admin-api blobby     # beide inactive
      ```
- [ ] Auf **NEU** die Datenbanken jetzt sauber holen (inklusive `-wal`/`-shm`, die nach dem
      Stoppen konsistent sind):
      ```bash
      rsync -avz root@ALT_IP:/var/www/admin-api/data/ /var/www/admin-api/data/
      rsync -avz root@ALT_IP:/var/www/admin-api/sessions.json /var/www/admin-api/
      rsync -avz root@ALT_IP:/var/www/admin-api/.env /var/www/admin-api/
      chown -R www-data:www-data /var/www/admin-api
      ```
      `sessions.json` mitzunehmen bedeutet: eingeloggte Nutzer bleiben eingeloggt.
- [ ] Auf **NEU** starten:
      ```bash
      systemctl daemon-reload
      systemctl enable --now admin-api blobby nginx
      systemctl status admin-api blobby
      curl -s localhost:3002/healthz
      ```

**ALT bleibt ab jetzt gestoppt** — sonst laufen Discord-Bot und Twitch-IRC doppelt.

---

## Phase 3 — Testen, BEVOR das DNS umgestellt wird

Der wichtigste Schritt. Auf deinem Windows-PC als Administrator
`C:\Windows\System32\drivers\etc\hosts` ergänzen:

```
NEU_IP    vnmvalentin.de
NEU_IP    www.vnmvalentin.de
```

Danach im Browser (Strg+F5) durchgehen:

- [ ] Seite lädt, HTTPS ohne Warnung
- [ ] Login über Twitch funktioniert
- [ ] Clash Royale: Lobby anlegen, ein Modus startet
- [ ] Blobby: Partie zu zweit, `?net=1` zeigt `laut server` 74–76 und **blockade einstellig**
- [ ] Garden/adVentures laden ihre Daten
- [ ] Discord-Bot antwortet, Twitch-Anbindung aktiv
- [ ] Overlays in OBS laden

Erst wenn alles steht: Zeilen aus `hosts` wieder entfernen.

---

## Phase 4 — Umschalten

- [ ] DNS-A-Record von ALT_IP auf NEU_IP ändern (beide Einträge: `@` und `www`)
- [ ] Warten, bis es greift: `nslookup vnmvalentin.de 1.1.1.1`
- [ ] Zertifikatserneuerung testen: `certbot renew --dry-run`
- [ ] TTL wieder auf den Normalwert hochsetzen
- [ ] Loop-Probe auf NEU im Alltag nachmessen: `node /tmp/loopProbe.js 300`

---

## Phase 5 — Aufräumen (nach ein paar Tagen)

- [ ] ALT **noch nicht kündigen.** Mindestens 3–7 Tage als Rückfall behalten; die Dienste
      dort bleiben gestoppt.
- [ ] Wenn alles ruhig läuft: Datenbanken ein letztes Mal sichern, dann ALT kündigen.
- [ ] Neue IP dort nachtragen, wo sie fest steht: Twitch-Redirect-URL, Discord-OAuth-
      Callback, evtl. Firewall-Freigaben Dritter.

---

## Rückfall

Solange ALT existiert und die Daten dort unverändert liegen: DNS zurückstellen, auf ALT
`systemctl start admin-api blobby`, fertig. Deshalb wird ALT erst gekündigt, wenn NEU sich
bewiesen hat — und deshalb wird auf ALT nach dem Stopp **nichts** mehr gelöscht.
