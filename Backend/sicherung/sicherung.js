// sicherung/sicherung.js — nächtliche Sicherung aller Live-Daten aus Backend/data/.
//
// WAS GESICHERT WIRD
//   *.db   über die Sicherungsfunktion von SQLite (better-sqlite3 .backup()): eine stimmige Momentaufnahme samt
//          WAL-Inhalt, auch während das Backend schreibt. Eine bloße Dateikopie könnte mitten in einer Transaktion
//          landen. Die Kopie wird auf journal_mode=DELETE gestellt, damit sie als einzelne Datei taugt.
//   alles andere (JSON-Speicher, stream_tool.key, uploads/ …) als Dateikopie; JSON muss sich danach parsen lassen.
//   Nicht: -wal/-shm/-journal (steckt in der SQLite-Sicherung), Reste wie *.alt-*, *.tmp, *.corrupt-*, die älteren
//   Sicherungsordner backups/ und cards-users-backups/ und sicherungen/ selbst. Die Server-.env liegt nicht in data/
//   und ist deshalb nicht dabei.
//
// WOHIN
//   data/sicherungen/<JJJJ-MM-TT>/   je Datei eine .gz plus manifest.json (Größe und SHA-256 je Datei)
//   data/sicherungen/stand.json      letzter Versuch und letzte erfolgreiche Sicherung (liest sicherung/plan.js)
//
// PROBE-WIEDERHERSTELLUNG BEI JEDEM LAUF
//   Jede .gz wird gleich wieder entpackt und muss dieselbe Prüfsumme ergeben; jede SQLite-Kopie besteht
//   PRAGMA integrity_check. `pruefen` wiederholt das für eine liegende Sicherung (auch auf dem PC, siehe holen.js).
//
// AUFBEWAHRUNG
//   Die 7 neuesten erfolgreichen Sicherungen + je Kalenderwoche die neueste für 4 weitere Wochen; fehlgeschlagene
//   Läufe bleiben 7 Tage zur Ansicht. Gelöscht wird nur nach einer erfolgreichen Sicherung und nur Ordner mit
//   Datumsnamen in sicherungen/.
//
// AUFRUF (nachts startet der Statuswächter das Skript, siehe sicherung/plan.js)
//   node sicherung/sicherung.js                            jetzt sichern
//   node sicherung/sicherung.js pruefen [ordner]           eine Sicherung prüfen (Standard: die neueste)
//   node sicherung/sicherung.js entpacken <ordner> <ziel>  in einen LEEREN Ordner auspacken (zum Zurückspielen)
//   SICHERUNG_DATEN / SICHERUNG_ZIEL biegen Daten- und Sicherungsordner um (Tests, Probeläufe).
//
// ZURÜCKSPIELEN (von Hand, bewusst kein Befehl dafür): Dienste stoppen (admin-api, admin-status), die Sicherung mit
// `entpacken` in einen leeren Ordner auspacken, die gewünschten Dateien nach data/ kopieren (vorher die -wal/-shm der
// ersetzten Datenbank entfernen), Besitzer auf www-data setzen, Dienste starten.

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const Database = require("better-sqlite3");
const { ORDNER, STAND, MANIFEST, ORDNER_NAME, zweistellig, datumVon } = require("./gemeinsam");

const SPERRE = ".laeuft";
const SPERRE_VERALTET_MS = 6 * 60 * 60 * 1000;
const AUSGELASSEN_OBEN = new Set(["backups", "cards-users-backups", ORDNER]);
const REST = /(-wal|-shm|-journal)$|\.alt-|\.tmp$|\.corrupt-/;
const TAG_MS = 24 * 60 * 60 * 1000;
const JSON_VERSUCHE = 3;
const JSON_PAUSE_MS = 500;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const mitSchraegstrich = (rel) => rel.split(path.sep).join("/");

// ---------- Sammeln ----------------------------------------------------------------------------------------------

/** Alle zu sichernden Dateien relativ zum Datenordner, sortiert */
function sammleDateien(datenOrdner) {
  const liste = [];
  const lauf = (rel) => {
    for (const e of fs.readdirSync(path.join(datenOrdner, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (!rel && AUSGELASSEN_OBEN.has(e.name)) continue;
        lauf(r);
      } else if (e.isFile() && !REST.test(e.name)) {
        liste.push(r);
      }
    }
  };
  lauf("");
  return liste.sort();
}

function artVon(rel) {
  if (rel.endsWith(".db")) return "sqlite";
  if (rel.endsWith(".json")) return "json";
  return "datei";
}

// ---------- Eine Datei sichern -----------------------------------------------------------------------------------

/** SHA-256 und Länge dessen, was durch die Ströme fließt (z. B. Datei → Gunzip) */
async function pruefsumme(...stroeme) {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  await pipeline(...stroeme, async (quelle) => {
    for await (const stueck of quelle) {
      hash.update(stueck);
      bytes += stueck.length;
    }
  });
  return { sha256: hash.digest("hex"), bytes };
}

function oeffneQuelle(datei) {
  try {
    return new Database(datei, { readonly: true, fileMustExist: true });
  } catch {
    // Read-only scheitert bei WAL-Datenbanken ohne -shm; dann normal öffnen (gelesen wird trotzdem nur)
    return new Database(datei, { fileMustExist: true });
  }
}

function pruefeSqlite(datei) {
  const db = new Database(datei, { readonly: true, fileMustExist: true });
  try {
    const ergebnis = db.pragma("integrity_check", { simple: true });
    if (ergebnis !== "ok") throw new Error(`integrity_check meldet: ${ergebnis}`);
  } finally {
    db.close();
  }
}

async function sichereSqlite(quelle, ziel) {
  const db = oeffneQuelle(quelle);
  try {
    await db.backup(ziel);
  } finally {
    db.close();
  }
  // Einzeldatei ohne WAL: so lässt sich die Kopie überall öffnen, auch read-only
  const kopie = new Database(ziel, { fileMustExist: true });
  try {
    kopie.pragma("journal_mode = DELETE");
  } finally {
    kopie.close();
  }
  for (const s of ["-wal", "-shm", "-journal"]) fs.rmSync(ziel + s, { force: true });
  pruefeSqlite(ziel);
}

function pruefeJson(text) {
  // Leer gilt wie in lib/jsonFile.js als „noch nichts gespeichert“
  if (text.trim()) JSON.parse(text);
}

async function kopiereJson(quelle, ziel) {
  for (let versuch = 1; ; versuch++) {
    await fsp.copyFile(quelle, ziel);
    try {
      pruefeJson(await fsp.readFile(ziel, "utf8"));
      return;
    } catch (e) {
      // Ein Bereich, der nicht über writeJsonAtomic schreibt, könnte gerade mitten im Schreiben sein
      if (versuch >= JSON_VERSUCHE) throw new Error(`kein gültiges JSON: ${e.message}`);
      await warte(JSON_PAUSE_MS);
    }
  }
}

/** Rohkopie nach arbeit/, gepackt nach teil/, dann Probe-Entpacken gegen die Prüfsumme der Rohkopie */
async function sichereDatei(datenOrdner, rel, arbeit, teil) {
  const quelle = path.join(datenOrdner, rel);
  const roh = path.join(arbeit, rel);
  const gz = path.join(teil, `${rel}.gz`);
  fs.mkdirSync(path.dirname(roh), { recursive: true });
  fs.mkdirSync(path.dirname(gz), { recursive: true });

  const art = artVon(rel);
  if (art === "sqlite") await sichereSqlite(quelle, roh);
  else if (art === "json") await kopiereJson(quelle, roh);
  else await fsp.copyFile(quelle, roh);

  const original = await pruefsumme(fs.createReadStream(roh));
  await pipeline(fs.createReadStream(roh), zlib.createGzip(), fs.createWriteStream(gz));
  const probe = await pruefsumme(fs.createReadStream(gz), zlib.createGunzip());
  if (probe.sha256 !== original.sha256) throw new Error("Probe-Entpacken ergibt eine andere Prüfsumme");
  const gzBytes = (await fsp.stat(gz)).size;
  await fsp.rm(roh, { force: true });
  return { datei: mitSchraegstrich(rel), art, bytes: original.bytes, gzBytes, sha256: original.sha256 };
}

// ---------- Sperre, Manifest, Stand ------------------------------------------------------------------------------

function nimmSperre(zielBasis, versuch = 1) {
  const datei = path.join(zielBasis, SPERRE);
  try {
    fs.writeFileSync(datei, String(process.pid), { flag: "wx" });
    return datei;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    let alter;
    try {
      alter = Date.now() - fs.statSync(datei).mtimeMs;
    } catch {
      alter = Infinity; // inzwischen verschwunden = frei
    }
    // Eine Sperre, die älter als jede denkbare Sicherung ist, stammt von einem abgestürzten Lauf
    if (alter > SPERRE_VERALTET_MS && versuch < 3) {
      fs.rmSync(datei, { force: true });
      return nimmSperre(zielBasis, versuch + 1);
    }
    throw new Error(`Es läuft schon eine Sicherung (${datei}).`);
  }
}

function liesJson(datei) {
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch {
    return null;
  }
}

const liesManifest = (ordner) => liesJson(path.join(ordner, MANIFEST));

/** Atomar schreiben (tmp + umbenennen). Eigener Helfer: lib/jsonFile.js würde nach einem Lesefehler jedes Schreiben
 *  sperren — für diese reine Zustandsdatei soll der nächste Lauf sie einfach neu schreiben. */
function schreibeAtomar(datei, daten) {
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 2));
  fs.renameSync(tmp, datei);
}

// ---------- Aufbewahrung -----------------------------------------------------------------------------------------

/** ISO-Kalenderwoche, z. B. "2026-W46" */
function wochenSchluessel(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wochentag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wochentag);
  const jahr = t.getUTCFullYear();
  const woche = Math.ceil(((t - Date.UTC(jahr, 0, 1)) / TAG_MS + 1) / 7);
  return `${jahr}-W${zweistellig(woche)}`;
}

/**
 * Was gelöscht werden darf. Rein, damit sich die Regel testen lässt.
 * @param {{ name: string, datum: Date, ok: boolean }[]} eintraege
 */
function waehleZumLoeschen(eintraege, jetzt, { taeglich = 7, woechentlich = 4, fehlerTage = 7 } = {}) {
  const behalten = new Set();
  const gute = eintraege.filter((e) => e.ok).sort((a, b) => b.datum - a.datum);
  for (const e of gute.slice(0, taeglich)) behalten.add(e.name);
  const wochen = new Map();
  for (const e of gute.slice(taeglich)) {
    const k = wochenSchluessel(e.datum);
    if (!wochen.has(k)) wochen.set(k, e); // absteigend sortiert: die erste je Woche ist die neueste
  }
  for (const e of [...wochen.values()].slice(0, woechentlich)) behalten.add(e.name);
  const grenze = jetzt.getTime() - fehlerTage * TAG_MS;
  for (const e of eintraege) if (!e.ok && e.datum.getTime() >= grenze) behalten.add(e.name);
  return eintraege.filter((e) => !behalten.has(e.name)).map((e) => e.name);
}

/** Sicherungsordner in zielBasis (nur Datumsnamen) mit Datum und Erfolg laut Manifest */
function listeSicherungen(zielBasis) {
  if (!fs.existsSync(zielBasis)) return [];
  return fs.readdirSync(zielBasis, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ORDNER_NAME.test(e.name))
    .map((e) => {
      const [, j, m, t, fehlerTeil] = e.name.match(ORDNER_NAME);
      const manifest = liesManifest(path.join(zielBasis, e.name));
      return {
        name: e.name,
        datum: new Date(Number(j), Number(m) - 1, Number(t)),
        ok: !fehlerTeil && Boolean(manifest && manifest.ok),
      };
    });
}

/** Neueste erfolgreiche Sicherung (Ordnername) oder null */
function neuesteSicherung(zielBasis) {
  const gute = listeSicherungen(zielBasis).filter((e) => e.ok).sort((a, b) => b.datum - a.datum);
  return gute.length ? gute[0].name : null;
}

function rotiere(zielBasis, jetzt = new Date(), { log = console, ...grenzen } = {}) {
  const weg = waehleZumLoeschen(listeSicherungen(zielBasis), jetzt, grenzen);
  // Nur Ordner mit Datumsnamen direkt in zielBasis — listeSicherungen hat schon danach gefiltert
  for (const name of weg) fs.rmSync(path.join(zielBasis, name), { recursive: true, force: true });
  if (weg.length) log.log(`[sicherung] aufgeräumt: ${weg.join(", ")}`);
  return weg;
}

// ---------- Sichern ----------------------------------------------------------------------------------------------

/**
 * Eine vollständige Sicherung von datenOrdner nach zielBasis/<Datum>/.
 * Ein Erfolg ersetzt den Ordner desselben Tages; ein Fehlschlag verdrängt nie eine gute Sicherung desselben Tages
 * (er landet dann in <Datum>-fehler). Auch ein Fehlschlag sichert alle übrigen Dateien.
 */
async function erstelleSicherung({ datenOrdner, zielBasis, jetzt = new Date(), log = console } = {}) {
  if (!datenOrdner || !fs.existsSync(datenOrdner)) throw new Error(`Datenordner fehlt: ${datenOrdner}`);
  const basis = zielBasis || path.join(datenOrdner, ORDNER);
  fs.mkdirSync(basis, { recursive: true });
  const sperre = nimmSperre(basis);
  const start = Date.now();
  const name = datumVon(jetzt);
  const arbeit = path.join(basis, `.arbeit-${name}`);
  const teil = path.join(basis, `.teil-${name}`);
  try {
    for (const d of [arbeit, teil]) {
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d, { recursive: true });
    }
    const dateien = [];
    const fehler = [];
    for (const rel of sammleDateien(datenOrdner)) {
      try {
        dateien.push(await sichereDatei(datenOrdner, rel, arbeit, teil));
      } catch (e) {
        // Zwischen Auflisten und Kopieren verschwunden (z. B. umbenannt): kein Fehler der Sicherung
        if (e.code === "ENOENT" && !fs.existsSync(path.join(datenOrdner, rel))) continue;
        fehler.push({ datei: mitSchraegstrich(rel), fehler: e.message });
        log.error(`[sicherung] ${mitSchraegstrich(rel)}: ${e.message}`);
      }
    }

    const ok = fehler.length === 0 && dateien.length > 0;
    const summe = (k) => dateien.reduce((s, d) => s + d[k], 0);
    const manifest = {
      version: 1,
      erstellt: jetzt.toISOString(),
      ok,
      dateien,
      fehler,
      bytes: summe("bytes"),
      gzBytes: summe("gzBytes"),
      dauerMs: Date.now() - start,
    };
    fs.writeFileSync(path.join(teil, MANIFEST), JSON.stringify(manifest, null, 2));

    const vorhanden = path.join(basis, name);
    const ablage = !ok && (liesManifest(vorhanden) || {}).ok ? `${name}-fehler` : name;
    fs.rmSync(path.join(basis, ablage), { recursive: true, force: true });
    fs.renameSync(teil, path.join(basis, ablage));

    const ergebnis = {
      zeit: jetzt.toISOString(),
      ok,
      ordner: ablage,
      dateien: dateien.length,
      bytes: manifest.bytes,
      gzBytes: manifest.gzBytes,
      dauerMs: manifest.dauerMs,
      fehler: fehler.slice(0, 10),
    };
    const alt = liesJson(path.join(basis, STAND)) || {};
    schreibeAtomar(path.join(basis, STAND), {
      letzterVersuch: ergebnis,
      letzteErfolgreiche: ok ? ergebnis : alt.letzteErfolgreiche || null,
    });

    const geloescht = ok ? rotiere(basis, jetzt, { log }) : [];
    log.log(
      `[sicherung] ${ok ? "fertig" : "UNVOLLSTÄNDIG"}: ${dateien.length} Dateien, `
      + `${(manifest.gzBytes / 1e6).toFixed(1)} MB gepackt (${(manifest.bytes / 1e6).toFixed(1)} MB roh), `
      + `${fehler.length} Fehler, ${Math.round(manifest.dauerMs / 1000)} s, Ordner ${ablage}`,
    );
    return { ...ergebnis, geloescht };
  } finally {
    fs.rmSync(arbeit, { recursive: true, force: true });
    fs.rmSync(teil, { recursive: true, force: true });
    fs.rmSync(sperre, { force: true });
  }
}

// ---------- Prüfen und Entpacken ---------------------------------------------------------------------------------

/** Pfad aus dem Manifest gegen Ausbrüche aus dem Zielordner absichern */
function sichererTeilpfad(datei) {
  const teile = String(datei).split("/");
  if (!datei || path.isAbsolute(datei) || teile.some((t) => !t || t === "." || t === "..")) {
    throw new Error(`ungültiger Dateiname im Manifest: ${datei}`);
  }
  return teile;
}

/** Entpackt jede Datei einer liegenden Sicherung, vergleicht die Prüfsumme und prüft SQLite/JSON wie beim Sichern */
async function pruefeSicherung(ordner) {
  const manifest = liesManifest(ordner);
  if (!manifest || !Array.isArray(manifest.dateien)) {
    return { ok: false, vollstaendig: false, dateien: 0, fehler: [{ datei: MANIFEST, fehler: "fehlt oder unlesbar" }] };
  }
  const fehler = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sicherung-pruefen-"));
  try {
    for (const d of manifest.dateien) {
      const roh = path.join(tmp, "datei");
      try {
        const gz = path.join(ordner, ...sichererTeilpfad(`${d.datei}.gz`));
        await pipeline(fs.createReadStream(gz), zlib.createGunzip(), fs.createWriteStream(roh));
        const p = await pruefsumme(fs.createReadStream(roh));
        if (p.sha256 !== d.sha256) throw new Error("Prüfsumme weicht vom Manifest ab");
        if (d.art === "sqlite") pruefeSqlite(roh);
        else if (d.art === "json") pruefeJson(await fsp.readFile(roh, "utf8"));
      } catch (e) {
        fehler.push({ datei: d.datei, fehler: e.message });
      } finally {
        fs.rmSync(roh, { force: true });
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: fehler.length === 0, vollstaendig: manifest.ok === true, dateien: manifest.dateien.length, fehler };
}

/** Packt eine Sicherung in einen leeren Ordner aus (nie über bestehende Dateien) */
async function entpacke(ordner, ziel) {
  const manifest = liesManifest(ordner);
  if (!manifest || !Array.isArray(manifest.dateien)) throw new Error(`${ordner} hat kein lesbares ${MANIFEST}`);
  if (fs.existsSync(ziel) && fs.readdirSync(ziel).length) {
    throw new Error(`Zielordner ${ziel} ist nicht leer — zum Schutz vor Überschreiben nur in einen leeren Ordner.`);
  }
  for (const d of manifest.dateien) {
    const teile = sichererTeilpfad(d.datei);
    const aus = path.join(ziel, ...teile);
    fs.mkdirSync(path.dirname(aus), { recursive: true });
    await pipeline(fs.createReadStream(path.join(ordner, ...sichererTeilpfad(`${d.datei}.gz`))), zlib.createGunzip(), fs.createWriteStream(aus));
    const p = await pruefsumme(fs.createReadStream(aus));
    if (p.sha256 !== d.sha256) throw new Error(`${d.datei}: Prüfsumme weicht vom Manifest ab`);
  }
  return manifest.dateien.length;
}

// ---------- Aufruf von der Kommandozeile -------------------------------------------------------------------------

async function main(argv) {
  const { DATA_DIR } = require("../lib/dataDir");
  const datenOrdner = process.env.SICHERUNG_DATEN || DATA_DIR;
  const zielBasis = process.env.SICHERUNG_ZIEL || path.join(datenOrdner, ORDNER);
  const [befehl, ...rest] = argv;

  if (!befehl) {
    const r = await erstelleSicherung({ datenOrdner, zielBasis });
    return r.ok ? 0 : 1;
  }
  if (befehl === "pruefen") {
    let ordner = rest[0];
    if (ordner && !fs.existsSync(ordner)) ordner = path.join(zielBasis, ordner);
    if (!ordner) {
      const neueste = neuesteSicherung(zielBasis);
      ordner = neueste && path.join(zielBasis, neueste);
    }
    if (!ordner || !fs.existsSync(ordner)) {
      console.error(`Keine Sicherung gefunden (${zielBasis}).`);
      return 1;
    }
    const r = await pruefeSicherung(ordner);
    for (const f of r.fehler) console.error(`  ${f.datei}: ${f.fehler}`);
    console.log(`${ordner}: ${r.dateien} Dateien, ${r.fehler.length} Fehler${r.vollstaendig ? "" : ", beim Sichern unvollständig"}`);
    return r.ok && r.vollstaendig ? 0 : 1;
  }
  if (befehl === "entpacken" && rest.length === 2) {
    let [ordner, ziel] = rest;
    if (!fs.existsSync(ordner)) ordner = path.join(zielBasis, ordner);
    const n = await entpacke(ordner, path.resolve(ziel));
    console.log(`${n} Dateien nach ${path.resolve(ziel)} ausgepackt und geprüft.`);
    return 0;
  }
  console.error("Aufruf: node sicherung/sicherung.js [pruefen [ordner] | entpacken <ordner> <leerer zielordner>]");
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => {
      console.error(`[sicherung] ${e.message}`);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  erstelleSicherung,
  pruefeSicherung,
  entpacke,
  rotiere,
  waehleZumLoeschen,
  wochenSchluessel,
  sammleDateien,
  listeSicherungen,
  neuesteSicherung,
  main,
};
