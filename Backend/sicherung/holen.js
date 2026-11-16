// sicherung/holen.js — holt die neueste nächtliche Sicherung vom Server auf DIESEN Rechner (der zweite Ort).
//
// Läuft auf deinem PC, am besten täglich über die Windows-Aufgabenplanung. Jede geholte Sicherung wird vollständig
// geprüft (Entpacken, Prüfsummen, integrity_check) und erst danach unter ihrem Datum abgelegt. Lokal bleiben die
// 14 neuesten plus je Kalenderwoche eine für 8 weitere Wochen.
//
//   node Backend/sicherung/holen.js
//
// Braucht ssh/scp ohne Passwortabfrage — derselbe Schlüssel wie für deploy.sh. Server und Pfad wie dort (SERVER,
// BACKEND_DEST), Ablage: SICHERUNG_LOKAL oder <Benutzerordner>\Website-Sicherungen. Jeder Lauf schreibt eine Zeile
// nach holen.log im Ablageordner; der Exit-Code (0/1) erscheint in der Aufgabenplanung als „Letztes Ergebnis“.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pruefeSicherung, rotiere } = require("./sicherung");
const { ORDNER, STAND, ORDNER_NAME } = require("./gemeinsam");

const SERVER = process.env.SERVER || "root@213.199.51.205";
const BACKEND_DEST = process.env.BACKEND_DEST || "/var/www/admin-api";
const LOKAL = process.env.SICHERUNG_LOKAL || path.join(os.homedir(), "Website-Sicherungen");
const ENTFERNT = `${BACKEND_DEST}/data/${ORDNER}`;
// BatchMode: in der Aufgabenplanung darf nichts auf eine Passwort-Eingabe warten
const SSH_OPTIONEN = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20"];

function lauf(befehl, args, optionen = {}) {
  const r = spawnSync(befehl, args, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...optionen });
  if (r.error) throw new Error(`${befehl} lässt sich nicht starten: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${befehl} endete mit Code ${r.status}: ${(r.stderr || "").trim().slice(0, 500)}`);
  return r.stdout;
}

function protokoll(zeile) {
  fs.mkdirSync(LOKAL, { recursive: true });
  fs.appendFileSync(path.join(LOKAL, "holen.log"), `${new Date().toISOString()} ${zeile}\n`);
  console.log(zeile);
}

async function hole() {
  const stand = JSON.parse(lauf("ssh", [...SSH_OPTIONEN, SERVER, `cat ${ENTFERNT}/${STAND}`]));
  const neueste = stand && stand.letzteErfolgreiche && stand.letzteErfolgreiche.ordner;
  if (!neueste || !ORDNER_NAME.test(neueste) || neueste.endsWith("-fehler")) {
    throw new Error("Auf dem Server gibt es noch keine erfolgreiche Sicherung.");
  }
  const ziel = path.join(LOKAL, neueste);
  if (fs.existsSync(path.join(ziel, "manifest.json"))) {
    protokoll(`${neueste} liegt schon hier, nichts zu tun.`);
    return;
  }

  fs.mkdirSync(LOKAL, { recursive: true });
  const teilName = `.teil-${neueste}`;
  const teil = path.join(LOKAL, teilName);
  fs.rmSync(teil, { recursive: true, force: true });
  try {
    // Relatives Ziel im Ablageordner: ein Windows-Pfad mit Laufwerksbuchstaben sähe für scp sonst wie host:pfad aus
    lauf("scp", [...SSH_OPTIONEN, "-r", "-q", `${SERVER}:${ENTFERNT}/${neueste}`, teilName], { cwd: LOKAL });
    const pruefung = await pruefeSicherung(teil);
    if (!pruefung.ok || !pruefung.vollstaendig) {
      const liste = pruefung.fehler.map((f) => `${f.datei}: ${f.fehler}`).join("; ");
      throw new Error(`geholte Sicherung ${neueste} ist fehlerhaft: ${liste || "auf dem Server unvollständig"}`);
    }
    fs.renameSync(teil, ziel);
    const weg = rotiere(LOKAL, new Date(), { taeglich: 14, woechentlich: 8, log: { log() {} } });
    protokoll(`${neueste} geholt und geprüft (${pruefung.dateien} Dateien)${weg.length ? `, lokal entfernt: ${weg.join(", ")}` : ""}.`);
  } finally {
    fs.rmSync(teil, { recursive: true, force: true });
  }
}

hole().then(
  () => { process.exitCode = 0; },
  (e) => {
    try {
      protokoll(`FEHLER: ${e.message}`);
    } catch {
      console.error(`FEHLER: ${e.message}`);
    }
    process.exitCode = 1;
  },
);
