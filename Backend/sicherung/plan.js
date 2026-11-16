// sicherung/plan.js — wann die nächtliche Sicherung (sicherung/sicherung.js) läuft und wer davon erfährt.
//
// WO ES LÄUFT
// Im Statuswächter (statusWatch/index.js). Der läuft als eigener Dienst neben dem Backend, übersteht dessen Abstürze
// und ist auf dem Server schon eingerichtet — es braucht keinen weiteren systemd-Dienst. Die Sicherung selbst startet
// als eigener Kindprozess (fork), damit große Datenbanken weder den Wächter noch das Backend blockieren.
//
// REGEL
// Ab 03:30 Serverzeit einmal am Tag, sobald es für heute noch keine erfolgreiche Sicherung gibt. War der Dienst um die
// Zeit aus (Deploy, Neustart), holt er sie beim nächsten Blick nach. Nach einem Fehlschlag frühestens eine Stunde
// später neu, höchstens drei Versuche am Tag.
//
// MELDUNGEN über melde(text) — im Statuswächter der private Betreiber-Kanal (BETREIBER_WEBHOOK_URL, derselbe wie für das
// Fehlerprotokoll), sonst nur das Log:
// Fehlschläge und „seit über 30 Stunden keine erfolgreiche Sicherung“ (höchstens einmal am Tag). Das öffentliche
// #status bleibt davon unberührt — dort steht nur, was Besucher betrifft.

const fs = require("fs");
const path = require("path");
const { fork: forkStandard } = require("child_process");
const { STAND, datumVon } = require("./gemeinsam");

const VERSUCHE_PRO_TAG = 3;
const PAUSE_NACH_FEHLER_MS = 60 * 60 * 1000;
const VERALTET_MS = 30 * 60 * 60 * 1000;
const VERALTET_MELDEN_ALLE_MS = 24 * 60 * 60 * 1000;

function leseStand(zielBasis) {
  try {
    return JSON.parse(fs.readFileSync(path.join(zielBasis, STAND), "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {object} opt
 * @param {string} opt.zielBasis  data/sicherungen
 * @param {string} opt.skript     Pfad zu sicherung/sicherung.js
 * @param {object} [opt.env]      zusätzliche Umgebung für den Kindprozess (SICHERUNG_DATEN)
 * @param {(text: string) => Promise<void>} [opt.melde]
 * @param {number} [opt.gestartet] Startzeit des Dienstes (ms) — ohne jede Sicherung zählt das Alter ab hier
 */
function createSicherungsPlan({
  zielBasis,
  skript,
  env = {},
  stunde = 3,
  minute = 30,
  now = () => new Date(),
  fork = forkStandard,
  melde = async () => {},
  log = console,
  gestartet = Date.now(),
}) {
  let laeuft = false;
  const versuche = new Map(); // Datum -> { anzahl, zuletzt }
  let veraltetGemeldet = 0;

  async function sage(text) {
    try {
      await melde(text);
    } catch (e) {
      log.warn(`[sicherung] Meldung nicht zugestellt: ${e.message}`);
    }
  }

  function faellig(jetzt) {
    if (jetzt.getHours() * 60 + jetzt.getMinutes() < stunde * 60 + minute) return false;
    const heute = datumVon(jetzt);
    const stand = leseStand(zielBasis);
    if (stand && stand.letzteErfolgreiche && stand.letzteErfolgreiche.ordner === heute) return false;
    const v = versuche.get(heute);
    if (v && (v.anzahl >= VERSUCHE_PRO_TAG || jetzt.getTime() - v.zuletzt < PAUSE_NACH_FEHLER_MS)) return false;
    return true;
  }

  async function pruefeAlter(jetzt) {
    const stand = leseStand(zielBasis);
    const letzte = stand && stand.letzteErfolgreiche ? Date.parse(stand.letzteErfolgreiche.zeit) : NaN;
    const seit = Number.isFinite(letzte) ? letzte : gestartet;
    if (jetzt.getTime() - seit < VERALTET_MS) return;
    if (jetzt.getTime() - veraltetGemeldet < VERALTET_MELDEN_ALLE_MS) return;
    veraltetGemeldet = jetzt.getTime();
    const wann = Number.isFinite(letzte) ? `zuletzt am ${new Date(letzte).toLocaleString("de-DE")}` : "noch nie";
    await sage(`Datensicherung: seit über 30 Stunden keine erfolgreiche Sicherung (${wann}).`);
  }

  function starte(jetzt) {
    const heute = datumVon(jetzt);
    const v = versuche.get(heute) || { anzahl: 0, zuletzt: 0 };
    const nummer = v.anzahl + 1;
    versuche.set(heute, { anzahl: nummer, zuletzt: jetzt.getTime() });
    laeuft = true;
    log.log(`[sicherung] starte Sicherung (Versuch ${nummer} heute)`);

    return new Promise((resolve) => {
      let erledigt = false;
      const ende = async (code, grund) => {
        if (erledigt) return;
        erledigt = true;
        laeuft = false;
        if (code === 0) {
          resolve(true);
          return;
        }
        // Gründe aus stand.json, sofern der Kindprozess ihn für diesen Lauf noch geschrieben hat
        const lv = (leseStand(zielBasis) || {}).letzterVersuch;
        const frisch = lv && Date.parse(lv.zeit) >= jetzt.getTime() - 5000;
        const details = frisch && Array.isArray(lv.fehler) && lv.fehler.length
          ? lv.fehler.slice(0, 5).map((f) => `- ${f.datei}: ${f.fehler}`).join("\n")
          : grund;
        const naechster = nummer < VERSUCHE_PRO_TAG ? "Neuer Versuch in einer Stunde." : "Heute kein weiterer Versuch.";
        await sage(`Datensicherung fehlgeschlagen (Versuch ${nummer} von ${VERSUCHE_PRO_TAG}). ${naechster}\n${details}`);
        resolve(false);
      };

      let kind;
      try {
        kind = fork(skript, [], { env: { ...process.env, ...env }, stdio: "inherit" });
      } catch (e) {
        ende(1, `Kindprozess startet nicht: ${e.message}`);
        return;
      }
      kind.on("error", (e) => ende(1, `Kindprozess: ${e.message}`));
      kind.on("exit", (code, signal) => ende(code ?? 1, signal ? `abgebrochen (${signal})` : `Kindprozess endete mit Code ${code}`));
    });
  }

  /**
   * Ein Blick auf den Plan. Liefert null (nichts zu tun), sonst das Ergebnis des Laufs (true/false),
   * sobald der Kindprozess fertig ist.
   */
  async function tick() {
    const jetzt = now();
    await pruefeAlter(jetzt);
    if (laeuft || !faellig(jetzt)) return null;
    return starte(jetzt);
  }

  return { tick, laeuft: () => laeuft };
}

module.exports = { createSicherungsPlan, leseStand, VERSUCHE_PRO_TAG, VERALTET_MS };
