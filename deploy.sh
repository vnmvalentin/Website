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
}

deploy_frontend() {
  echo "=== Frontend ==="
  check_sim_mirror
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
  #                                                das riss bisher auch dle/data/ (Spielinhalte)
  #                                                und discord/bot/commands/data/ (Modulcode)
  #                                                mit raus, die eigentlich mit sollen. Legt
  #                                                jemand einen NEUEN Ordner mit Live-Datenbanken
  #                                                an, muss er hier einzeln ergänzt werden.
  #   clashRoyale/data/cardIconUrls.json           einzige Nicht-Datenbank-Datei in einem sonst
  #                                                ausgeschlossenen Ordner — statischer Inhalt,
  #                                                muss trotzdem mit (siehe cardIconSpiegel.js).
  #   node_modules/   nativ kompiliert (better-sqlite3), zieht sich der Server per npm selbst
  #   sessions.json   eingeloggte Nutzer — sonst wirft jeder Deploy alle raus
  #   .env / .env.*   Server-Zugangsdaten, dürfen nie vom lokalen Dev-.env überschrieben werden
  local excludes=(--exclude='./data' --exclude='./node_modules' --exclude='./sessions.json' --exclude='./.env' --exclude='./.env.*')

  tar -cz "${excludes[@]}" -C . . | ssh "$SERVER" "set -e
    rm -rf '$BACKEND_DEST.new'
    mkdir -p '$BACKEND_DEST.new'
    tar -xz -C '$BACKEND_DEST.new'
    test -f '$BACKEND_DEST.new/index.js'
    rsync -a --delete \
      --include '/clashRoyale/data/cardIconUrls.json' \
      --exclude '/data/' --exclude '/clashRoyale/data/*' --exclude '/streamTool/data/' \
      --exclude 'node_modules/' --exclude 'sessions.json' \
      --exclude '.env' --exclude '.env.*' \
      '$BACKEND_DEST.new/' '$BACKEND_DEST/'
    rm -rf '$BACKEND_DEST.new'
    cd '$BACKEND_DEST'
    npm install --omit=dev
    chown -R www-data:www-data '$BACKEND_DEST'
    systemctl restart '$BACKEND_SERVICE'
    sleep 2
    systemctl is-active --quiet '$BACKEND_SERVICE'"

  echo "Backend fertig, $BACKEND_SERVICE neugestartet (kurze Auszeit durch den Neustart selbst —"
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

case "$TARGET" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend ;;
  all)      deploy_frontend; deploy_backend ;;
  level)    shift; deploy_levels "$@" ;;
  *)
    echo "Unbekanntes Ziel: $TARGET (erwartet: frontend | backend | level | keins = beides)" >&2
    exit 1
    ;;
esac

echo
echo "Deploy fertig."
