#!/usr/bin/env bash
# Frontend und/oder Backend bauen und auf den Server austauschen.
# Aufruf aus Git Bash (NICHT PowerShell — die Pipe würde das tar-Archiv als Text
# durchschleusen und zerstören):
#   ./deploy.sh             (beides)
#   ./deploy.sh frontend
#   ./deploy.sh backend
#   ./deploy.sh level                      (listet die lokal veröffentlichten Seed-Runners-Level)
#   ./deploy.sh level SR-ABC-DEF SR-…      (bringt diese Level auf den Server; braucht dort den aktuellen Backend-Stand)
set -euo pipefail

SERVER="${SERVER:-root@213.199.51.205}"
FRONTEND_DEST="${FRONTEND_DEST:-/var/www/mywebsite/dist}"
# Pfad und Service-Name aus Backend/deploy/MIGRATION.md (dort mit demselben Namen
# per systemd verwaltet).
BACKEND_DEST="${BACKEND_DEST:-/var/www/admin-api}"
BACKEND_SERVICE="${BACKEND_SERVICE:-admin-api}"
# Blobby läuft als eigener Prozess (Backend/blobbyServer.js) aus demselben Ordner, aber
# mit eigener systemd-Unit — ohne eigenen Neustart liefe dort nach jedem Deploy der alte Code.
BLOBBY_SERVICE="${BLOBBY_SERVICE:-blobby}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-all}"

# Seed Runners: Der Server spielt Läufe mit einer GESPIEGELTEN Kopie der Sim nach (Backend/seedRunners/engine,
# erzeugt aus Frontend/src/pages/SeedRunners/sim, gen und level). Ist sie veraltet, stimmt der Fingerprint nicht mehr
# zu dem, was der Browser mitschickt, und alle Läufe blieben ungeprüft. Deshalb nie mit altem Spiegel ausliefern.
check_sim_mirror() {
  if ! (cd "$ROOT/Backend" && node seedRunners/tools/simSpiegel.js --pruefen); then
    echo "Abbruch: Sim-Spiegel veraltet. Im Ordner Backend:  npm run seedrunners:spiegel" >&2
    exit 1
  fi
  # Sacrifice & Sigils: Der Server spielt mit einer gespiegelten Kopie der Engine (Backend/sacrificeSigils/shared,
  # erzeugt aus Frontend/src/pages/SacrificeSigils/engine und data). Veraltet ⇒ Server und Browser rechnen verschieden.
  if ! (cd "$ROOT/Backend" && node sacrificeSigils/tools/spiegel.js --pruefen); then
    echo "Abbruch: Sacrifice-&-Sigils-Spiegel veraltet. Im Ordner Backend:  npm run sigils:spiegel" >&2
    exit 1
  fi
  # Flick Soccer: Der Server rechnet Online-Schüsse mit einer gespiegelten Kopie der Physik nach (Backend/flickSoccer/shared).
  if ! (cd "$ROOT/Backend" && node flickSoccer/tools/spiegel.js --pruefen); then
    echo "Abbruch: Flick-Soccer-Spiegel veraltet. Im Ordner Backend:  npm run flick:spiegel" >&2
    exit 1
  fi
}

# Sicherheitslücken in Abhängigkeiten: vor jedem Deploy die ungefährlichen Updates einspielen (npm audit fix,
# bewusst OHNE --force — das würde auch Major-Versionen ziehen) und abbrechen, wenn danach in den AUSGELIEFERTEN
# Paketen (--omit=dev) noch hohe oder kritische Lücken stecken. Reine Dev-Werkzeuge (puppeteer & Co.) laufen nur
# hier lokal und halten den Deploy nicht auf. Das Backend bekommt die Fixes über die mitgeschickte
# package-lock.json (der Server macht danach npm install --omit=dev).
# Notausgang, z.B. ohne Verbindung zur npm-Registry:  SKIP_AUDIT=1 ./deploy.sh
fix_vulnerabilities() {
  local dir="$1"
  if [ "${SKIP_AUDIT:-}" = "1" ]; then
    echo "--- npm audit ($dir) übersprungen (SKIP_AUDIT=1)"
    return
  fi
  echo "--- npm audit ($dir)"
  local lock="$ROOT/$dir/package-lock.json" before after
  before="$(md5sum "$lock" | cut -d' ' -f1)"
  # Exit-Code ignorieren: audit fix meldet auch dann einen Fehler, wenn nur Lücken übrig sind, die es ohne
  # --force nicht beheben darf — ob das schlimm ist, entscheidet die Prüfung direkt darunter.
  (cd "$ROOT/$dir" && npm audit fix --no-fund --loglevel=error >/dev/null 2>&1) || true
  after="$(md5sum "$lock" | cut -d' ' -f1)"
  if [ "$before" != "$after" ]; then
    echo "Sicherheitsupdates eingespielt — $dir/package-lock.json hat sich geändert, bitte mitcommitten."
  fi
  if ! (cd "$ROOT/$dir" && npm audit --omit=dev --audit-level=high); then
    echo "Abbruch: $dir hat noch hohe/kritische Sicherheitslücken in ausgelieferten Paketen, die npm audit fix" >&2
    echo "nicht ohne Major-Update beheben kann (Liste oben). Erst beheben, dann erneut deployen." >&2
    exit 1
  fi
}

deploy_frontend() {
  echo "=== Frontend ==="
  check_sim_mirror
  fix_vulnerabilities Frontend
  # Gesammelte Änderungen (UPDATES_OFFEN.md) als neue Version in Frontend/src/utils/newData.js eintragen und die
  # Sammeldatei leeren — VOR dem Build, damit /updates sie zeigt; post_updates postet sie danach nach Discord.
  # Bricht der Deploy später ab, steht die Version schon in newData.js und geht beim nächsten Deploy mit raus.
  node "$ROOT/Backend/statusWatch/tools/releaseUpdates.mjs"
  cd "$ROOT/Frontend"

  npm run build

  # Alles in einer einzigen SSH-Verbindung: hochladen, prüfen, umschalten.
  # Ein Abbruch irgendwo in der Kette lässt den alten Stand unangetastet online,
  # weil die beiden mv erst ganz am Ende kommen.
  tar -cz -C dist . | ssh "$SERVER" "set -e
    rm -rf '$FRONTEND_DEST.new'
    mkdir -p '$FRONTEND_DEST.new'
    tar -xz -C '$FRONTEND_DEST.new'
    test -f '$FRONTEND_DEST.new/index.html'
    chown -R www-data:www-data '$FRONTEND_DEST.new'
    rm -rf '$FRONTEND_DEST.old'
    mv '$FRONTEND_DEST' '$FRONTEND_DEST.old'
    mv '$FRONTEND_DEST.new' '$FRONTEND_DEST'"

  echo "Frontend fertig. Vorheriger Stand liegt vollstaendig unter $FRONTEND_DEST.old"
  echo "Rollback:  ssh $SERVER \"rm -rf $FRONTEND_DEST.kaputt && mv $FRONTEND_DEST $FRONTEND_DEST.kaputt && mv $FRONTEND_DEST.old $FRONTEND_DEST\""
}

deploy_backend() {
  echo "=== Backend ==="
  check_sim_mirror
  fix_vulnerabilities Backend
  cd "$ROOT/Backend"

  # Anders als beim Frontend kein tar+atomarer mv-Swap: der laufende Node-Prozess
  # liest seinen Code nur beim Start von der Platte, ein Dateiaustausch waehrend er
  # läuft stört ihn also nicht — solange der Neustart (unten) erst NACH dem
  # vollständigen Sync kommt.
  #
  # Trotzdem kein direktes rsync von hier aus: dieses Git Bash hat kein rsync
  # installiert (geprüft), nur tar + ssh sind sicher da. Deshalb zweistufig:
  # erst per tar+ssh in ein frisches Staging-Verzeichnis auf dem Server, danach
  # STEHT rsync (auf dem Server selbst vorhanden — Backend/deploy/MIGRATION.md
  # benutzt es dort schon) den Staging-Stand mit --delete gegen das Live-Verzeichnis
  # ab: neue/geänderte Dateien kommen rein, lokal entfernte (z.B. durch die Ordner-
  # Reorg) verschwinden auch dort, statt als Leichen liegenzubleiben.
  #
  # Ausgenommen bleibt an BEIDEN Stellen (tar UND rsync), was nur auf dem Server
  # der richtige Stand ist:
  #   data/, clashRoyale/data/, streamTool/data/   laufende Spielstände/Datenbanken (*.db,
  #                                                *.key, Token) — lokal nur ein Dev-Abbild.
  #                                                EINZELN aufgezählt (nicht per Namensmuster
  #                                                "data/"!), weil rsync so ein Muster OHNE
  #                                                führenden Slash auf JEDEN gleichnamigen
  #                                                Ordner in der ganzen Baumstruktur anwendet —
  #                                                das riss früher auch Inhalts-Ordner namens data/
  #                                                und discord/bot/commands/data/ (Modulcode)
  #                                                mit raus, die eigentlich mit sollen. Legt
  #                                                jemand einen NEUEN Ordner mit Live-Datenbanken
  #                                                an, muss er hier einzeln ergänzt werden.
  #   garden/data/                                 erneuerter Twitch-Broadcaster-Token (gardenGameRoutes.js
  #                                                legt ihn erst auf dem Server an) — fehlte hier, dadurch
  #                                                löschte rsync --delete ihn bei jedem Deploy.
  #   clashRoyale/data/cardIconUrls.json           einzige Nicht-Datenbank-Datei in einem sonst
  #                                                ausgeschlossenen Ordner — statischer Inhalt,
  #                                                muss trotzdem mit (siehe cardIconSpiegel.js).
  #   node_modules/   nativ kompiliert (better-sqlite3), zieht sich der Server per npm selbst
  #   sessions.json   eingeloggte Nutzer — sonst wirft jeder Deploy alle raus
  #   .env / .env.*   Server-Zugangsdaten, dürfen nie vom lokalen Dev-.env überschrieben werden
  #   analytics/data/                              Besucherstatistik (analytics/analyticsStore.js) — entsteht
  #                                                erst auf dem Server und gehört nur dorthin.
  #   streamScenes/data/                           Figuren der Zuschauer + Steuerpult der 3D-Stream-Szenen
  #                                                (streamScenes/lib/sceneStore.js) — nur auf dem Server echt.
  #   statusWatch/data/                            ID der #status-Nachricht, Störungsverlauf, gepostete Updates
  #                                                (statusWatch/) — sonst postet jeder Deploy alles neu.
  local excludes=(--exclude='./data' --exclude='./garden/data' --exclude='./analytics/data' --exclude='./streamScenes/data' --exclude='./statusWatch/data' --exclude='./node_modules' --exclude='./sessions.json' --exclude='./.env' --exclude='./.env.*')
  # Wartungsfenster für #status: während der Neustart läuft, zeigt der Prüfer Gelb "Wartung" statt Rot.
  # Läuft von selbst ab — bricht der Deploy mittendrin ab, bleibt der Status nicht ewig auf Wartung.
  local maintenance_until=$(( ($(date +%s) + 180) * 1000 ))

  tar -cz "${excludes[@]}" -C . . | ssh "$SERVER" "set -e
    rm -rf '$BACKEND_DEST.new'
    mkdir -p '$BACKEND_DEST.new'
    tar -xz -C '$BACKEND_DEST.new'
    test -f '$BACKEND_DEST.new/index.js'
    rsync -a --delete \
      --include '/clashRoyale/data/cardIconUrls.json' \
      --exclude '/data/' --exclude '/clashRoyale/data/*' --exclude '/streamTool/data/' --exclude '/garden/data/' --exclude '/analytics/data/' --exclude '/streamScenes/data/' --exclude '/statusWatch/data/' \
      --exclude 'node_modules/' --exclude 'sessions.json' \
      --exclude '.env' --exclude '.env.*' \
      '$BACKEND_DEST.new/' '$BACKEND_DEST/'
    rm -rf '$BACKEND_DEST.new'
    cd '$BACKEND_DEST'
    npm install --omit=dev
    mkdir -p statusWatch/data
    echo '{\"until\": $maintenance_until}' > statusWatch/data/maintenance.json
    chown -R www-data:www-data '$BACKEND_DEST'
    systemctl restart '$BACKEND_SERVICE'
    sleep 2
    systemctl is-active --quiet '$BACKEND_SERVICE'
    # Blobby (eigener Prozess, Port 3002): neu starten, damit der neue Spielcode läuft. Beendet laufende
    # Partien — der Zustand liegt nur im Speicher. Nur warnen statt abbrechen: der Hauptdienst läuft ja schon.
    if systemctl list-unit-files '$BLOBBY_SERVICE.service' >/dev/null 2>&1 && systemctl cat '$BLOBBY_SERVICE' >/dev/null 2>&1; then
      systemctl restart '$BLOBBY_SERVICE' || echo 'Warnung: Blobby ($BLOBBY_SERVICE) startet nicht — journalctl -u $BLOBBY_SERVICE'
    else
      echo 'Hinweis: keine systemd-Unit $BLOBBY_SERVICE gefunden — Blobby wurde nicht neu gestartet.'
    fi
    # Status-Prüfer (#status): Unit aus dem Repo einspielen und neu starten. Fehler hier sollen den
    # schon erfolgreichen Backend-Deploy nicht als gescheitert melden — nur warnen.
    if sed \"s#@NODE@#\$(command -v node)#\" deploy/admin-status.service > /tmp/admin-status.service.new; then
      if ! cmp -s /tmp/admin-status.service.new /etc/systemd/system/admin-status.service; then
        mv /tmp/admin-status.service.new /etc/systemd/system/admin-status.service
        systemctl daemon-reload
        systemctl enable admin-status >/dev/null 2>&1 || true
      fi
      rm -f /tmp/admin-status.service.new
      systemctl restart admin-status || echo 'Warnung: Status-Prüfer (admin-status) startet nicht — journalctl -u admin-status'
    fi"

  echo "Backend fertig, $BACKEND_SERVICE und $BLOBBY_SERVICE neugestartet (kurze Auszeit durch den Neustart selbst —"
  echo "Discord-Bot/Twitch-IRC brauchen danach wieder ein paar Sekunden zum Verbinden)."
  echo "Rollback: letzten funktionierenden Commit auschecken und erneut deployen — Server-seitig"
  echo "gibt es hierfür bewusst kein .old (data/ hängt sonst am falschen Stand)."
}

# Seed Runners: veröffentlichte Level aus der LOKALEN Datenbank (Backend/data/seedrunners.db) auf den Server bringen.
# Export hier, Import dort — beides über Backend/seedRunners/tools/levelTransfer.js. Auf dem Server läuft der Import als
# www-data (wie der Dienst): Als root angelegte -wal/-shm-Dateien könnte der Dienst sonst nicht mehr beschreiben.
# Nie überschreibend: Ist der Code dort vergeben oder der Inhalt schon vorhanden, wird das Level übersprungen.
deploy_levels() {
  echo "=== Seed-Runners-Level ==="
  cd "$ROOT/Backend"
  if [ "$#" -eq 0 ]; then
    echo "Welche Level? Lokal veröffentlicht sind:"
    node seedRunners/tools/levelTransfer.js liste
    echo
    echo "Aufruf:  ./deploy.sh level SR-ABC-DEF [SR-… …]"
    exit 1
  fi
  local json
  json="$(node seedRunners/tools/levelTransfer.js export "$@")"
  printf '%s' "$json" | ssh "$SERVER" "set -e
    cd '$BACKEND_DEST'
    if [ ! -f seedRunners/tools/levelTransfer.js ]; then
      echo 'Auf dem Server fehlt seedRunners/tools/levelTransfer.js — zuerst ./deploy.sh backend' >&2
      exit 1
    fi
    runuser -u www-data -- node seedRunners/tools/levelTransfer.js import"
  echo "Level-Übertragung fertig (kein Neustart nötig — der Server liest die Level direkt aus der Datenbank)."
}

# Neue Einträge aus Frontend/src/utils/newData.js nach #updates in Discord posten — erst, wenn das Frontend mit
# ihnen live ist. Export hier, Posten dort (Webhook steht nur in der Server-.env), wie bei den Leveln.
# Was schon gepostet ist, merkt sich der Server (statusWatch/data/updates_state.json). Ein Fehler hier lässt den
# Deploy gelingen: die Seite ist ja schon online, beim nächsten Frontend-Deploy wird es erneut versucht.
post_updates() {
  echo "=== Discord #updates ==="
  local json
  if ! json="$(node "$ROOT/Backend/statusWatch/tools/exportUpdates.mjs")"; then
    echo "Warnung: Updates konnten nicht gelesen werden — nichts gepostet."
    return
  fi
  printf '%s' "$json" | ssh "$SERVER" "cd '$BACKEND_DEST'
    if [ ! -f statusWatch/postUpdates.js ]; then
      echo 'Auf dem Server fehlt statusWatch/postUpdates.js — erst ./deploy.sh backend, dann werden Updates gepostet.'
      exit 0
    fi
    runuser -u www-data -- node statusWatch/postUpdates.js" \
    || echo "Warnung: Updates nicht gepostet (siehe Meldung oben)."
}

case "$TARGET" in
  frontend) deploy_frontend; post_updates ;;
  backend)  deploy_backend ;;
  all)      deploy_frontend; deploy_backend; post_updates ;;
  level)    shift; deploy_levels "$@" ;;
  *)
    echo "Unbekanntes Ziel: $TARGET (erwartet: frontend | backend | level | keins = beides)" >&2
    exit 1
    ;;
esac

echo
echo "Deploy fertig."
