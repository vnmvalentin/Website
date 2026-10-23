# Link-Vorschau für Discord & Co. (nginx)

Ohne diese Ergänzung zeigt jeder geteilte Link auf eine nicht vorgerenderte Seite (Seed Runners, Farm, Turniere,
Level, Einladungen …) auf Discord "Home - vnmvalentin". Mit ihr bekommen **nur Vorschau-Bots** für **Adressen ohne
eigene Datei** das HTML von `Backend/og/ogRoutes.js`. Normale Besucher und vorgerenderte Seiten sind nicht betroffen.
Ist das Backend aus, fällt nginx auf die normale index.html zurück.

Reihenfolge: erst Backend deployen (Route `/api/og/page` muss antworten), dann nginx.

## 1. Ganz oben in `/etc/nginx/sites-enabled/mywebsite` (außerhalb von `server { }`)

```nginx
map $http_user_agent $og_bot {
    default 0;
    ~*(discordbot|twitterbot|facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|linkedinbot|redditbot|skypeuripreview|embedly|iframely|mastodon|pinterest|vkshare) 1;
}
```

## 2. Im `server { }` für vnmvalentin.de den bisherigen SPA-Fallback ersetzen

Vorher:

```nginx
    location / {
        try_files $uri $uri/ /index.html;
    }
```

Nachher:

```nginx
    location / {
        try_files $uri $uri/ @spa;
    }

    # Keine Datei: Bots bekommen die Vorschau-Seite, alle anderen wie bisher die index.html
    location @spa {
        if ($og_bot) { rewrite ^ /__og-vorschau last; }
        rewrite ^ /index.html last;
    }

    location = /__og-vorschau {
        internal;
        rewrite ^ /api/og/page break;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Original-URI $request_uri;
        # Backend aus oder Route fehlt: Bots bekommen die normale index.html
        proxy_intercept_errors on;
        error_page 404 500 502 503 504 = /index.html;
    }
```

**Falle:** Nicht über `error_page 418 = @og` umleiten. nginx führt keine zweite Fehlerseite aus
(`recursive_error_pages off`), dann greift der Rückfall auf die index.html nicht und Bots bekommen 404
(am 15.10.2026 so passiert und nach zwei Minuten behoben).

**Stand:** Seit dem 15.10.2026 auf dem Server eingetragen. Sicherungen liegen unter `/root/nginx-backups/`.

## 3. Prüfen und laden

```sh
nginx -t && systemctl reload nginx
curl -s -A "Discordbot/2.0" https://vnmvalentin.de/seed-runners | grep -o '<title>[^<]*'
# erwartet: <title>Seed Runners - vnmvalentin
curl -s https://vnmvalentin.de/seed-runners | grep -o '<title[^>]*>[^<]*'
# normale Besucher: unverändert die vorgerenderte Startseite
```

Discord speichert Vorschauen zwischen. Zum Testen einen Link mit `?v=1` anhängen.
