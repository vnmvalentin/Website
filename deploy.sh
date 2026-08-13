#!/usr/bin/env bash
# Frontend bauen und komplett auf den Server austauschen.
# Aufruf aus Git Bash (NICHT PowerShell — die Pipe würde das tar-Archiv als Text
# durchschleusen und zerstören):   ./deploy.sh
set -euo pipefail

SERVER="${SERVER:-root@213.199.51.205}"
DEST="${DEST:-/var/www/mywebsite/dist}"

cd "$(dirname "$0")/Frontend"

npm run build

# Alles in einer einzigen SSH-Verbindung: hochladen, prüfen, umschalten.
# Ein Abbruch irgendwo in der Kette lässt den alten Stand unangetastet online,
# weil die beiden mv erst ganz am Ende kommen.
tar -cz -C dist . | ssh "$SERVER" "set -e
  rm -rf '$DEST.new'
  mkdir -p '$DEST.new'
  tar -xz -C '$DEST.new'
  test -f '$DEST.new/index.html'
  chown -R www-data:www-data '$DEST.new'
  rm -rf '$DEST.old'
  mv '$DEST' '$DEST.old'
  mv '$DEST.new' '$DEST'"

echo
echo "Deploy fertig. Der vorherige Stand liegt vollstaendig unter $DEST.old"
echo "Rollback:  ssh $SERVER \"rm -rf $DEST.kaputt && mv $DEST $DEST.kaputt && mv $DEST.old $DEST\""
