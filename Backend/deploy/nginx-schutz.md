# Schutz vor Bots und Fluten (nginx)

Der Hauptdienst hat eigene Grenzen (Anfragen je Adresse, Kontingente der Clash-Royale-Stats, Socket-Grenzen, Überlast-
Bremse). Die greifen aber erst, wenn eine Anfrage schon bei Node angekommen ist. Diese Ergänzung weist das Gröbste
**vor** Node ab — das ist der Teil, der die Seite unter einer Flut schnell hält.

**Stand:** Seit dem 17.11.2026 (22:45) auf dem Server eingetragen. Sicherung davor:
`/root/nginx-backups/mywebsite.2026-11-17-vor-schutz`. Nach jeder Änderung `nginx -t && systemctl reload nginx`.

**Abweichungen vom Text unten, so steht es auf dem Server:** `limit_conn verb_je_adresse 100` (statt 60, wie die
Socket-Grenze im Backend).

**Befund beim Eintragen:** `location /api/` und `location /socket.io/` reichten die Besucher-Adresse nicht weiter
(kein `X-Forwarded-For`). Das Backend hielt deshalb JEDEN Besucher für einen Dienst auf demselben Rechner
(`lib/clientIp.js` istLokal) — keine der Bremsen im Backend hat in Produktion je gegriffen. Beide Blöcke setzen jetzt
`X-Real-IP` und `X-Forwarded-For $proxy_add_x_forwarded_for`. Wer einen neuen `location`-Block mit `proxy_pass`
anlegt, muss diese zwei Zeilen mitnehmen.

Geprüft nach dem Eintragen: Browser, Googlebot, Discord-Vorschau, Health, Socket.io und Blobby 200; GPTBot und
python-requests ohne Antwort; 70 Stats-Anfragen auf einmal → 42 durch, 28 mit 429; im laufenden Verkehr (OBS-Overlays,
höchstens 94 Anfragen je Minute und Adresse) kein einziger 429.

## 1. Ganz oben in `/etc/nginx/sites-enabled/mywebsite` (außerhalb von `server { }`, neben der `$og_bot`-Map)

```nginx
# KI-Trainings-Crawler und Sammel-Bots: dieselbe Liste wie in robots.txt, für alle, die sich nicht daran halten.
# Such- und Antwortdienste (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot) fehlen bewusst.
map $http_user_agent $sperr_bot {
    default 0;
    ~*(gptbot|claudebot|anthropic-ai|ccbot|google-extended|applebot-extended|bytespider|meta-externalagent|amazonbot|cohere-ai|cohere-training|diffbot|ai2bot|timpibot|omgili|imagesiftbot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|dataforseobot|blexbot|scrapy|python-requests|aiohttp|go-http-client|headlesschrome) 1;
}

# Anfragen je Adresse: API eng, Seiten locker. 10m Speicher reichen für rund 160.000 Adressen.
limit_req_zone  $binary_remote_addr zone=api_je_adresse:10m    rate=30r/s;
limit_req_zone  $binary_remote_addr zone=stats_je_adresse:10m  rate=3r/s;
limit_req_zone  $binary_remote_addr zone=seiten_je_adresse:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=verb_je_adresse:10m;
limit_req_status 429;
limit_conn_status 429;
```

## 2. Im `server { }` für vnmvalentin.de

```nginx
    # Gesperrte Bots bekommen nichts — auch keine index.html (444 = Verbindung ohne Antwort schließen)
    if ($sperr_bot) { return 444; }

    # Höchstens 60 gleichzeitige Verbindungen je Adresse (OBS-Quellen + Tabs liegen weit darunter)
    limit_conn verb_je_adresse 60;

    # Langsame Verbindungen nicht ewig offen halten
    client_header_timeout 15s;
    client_body_timeout   15s;
    send_timeout          30s;
```

In den vorhandenen `location`-Blöcken ergänzen (die `proxy_pass`-Zeilen bleiben, wie sie sind):

```nginx
    # Clash-Royale-Stats: jede Anfrage kann einen Abruf bei Supercell auslösen
    location /api/clash/scout/ {
        limit_req zone=stats_je_adresse burst=40 nodelay;
        proxy_pass http://127.0.0.1:3001;
        # … dieselben proxy_set_header-Zeilen wie im Block „location /api/“ …
    }

    location /api/ {
        limit_req zone=api_je_adresse burst=120 nodelay;
        # … wie bisher …
    }

    location / {
        limit_req zone=seiten_je_adresse burst=80 nodelay;
        # … wie bisher (try_files … @spa) …
    }
```

Die Socket-Blöcke (`/socket.io/`, `/blobby-socket/`) bekommen **kein** `limit_req` — eine offene Verbindung ist eine
einzige Anfrage, die Grenzen dafür sitzen in `Backend/lib/socketBremse.js`.

## 3. Prüfen

```bash
# Gesperrte Kennung: Verbindung wird ohne Antwort geschlossen (curl: (52) Empty reply)
curl -sS -A "GPTBot/1.0" https://vnmvalentin.de/ -o /dev/null -w "%{http_code}\n"
# Normaler Browser: 200
curl -sS -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" https://vnmvalentin.de/ -o /dev/null -w "%{http_code}\n"
# Flut auf die Stats: nach den ersten ~40 kommen 429
for i in $(seq 1 80); do curl -s -o /dev/null -w "%{http_code} " -A "Mozilla/5.0 Chrome/131.0" https://vnmvalentin.de/api/clash/scout/status; done; echo
```

**Fallen:**
- Der Status-Prüfer und Werkzeuge auf dem Server fragen `127.0.0.1:3001` direkt — sie laufen nicht durch nginx und
  sind nicht betroffen.
- Eigene Skripte gegen die Live-Seite brauchen eine Kennung, die nicht in der Sperrliste steht
  (`-A vnmvalentin-werkzeug`).
- Streamer.bot „Fetch URL“ (`/api/mitspielen/chat`) meldet sich nicht als eine der gesperrten Kennungen; nach dem
  Eintragen trotzdem einmal `!mitspielen` im Chat prüfen.
- Stripe-Webhooks kommen von wenigen Adressen in kurzen Schüben — `burst=120` reicht dafür.
