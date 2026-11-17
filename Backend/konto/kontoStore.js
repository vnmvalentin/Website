// konto/kontoStore.js — ein Konto für alle Spiele, egal wie man sich anmeldet: Twitch, Discord oder als Gast mit
// Wiederherstellungscode. data/konten.db, Env KONTEN_DB (Prüfstände und Tests nie gegen die echte Datei).
//
// TABELLEN
//   konten       ein Eintrag je Konto: Anzeigename, Bild, Sprache, Prüfwert des Wiederherstellungscodes
//   konto_links  welche Twitch- bzw. Discord-ID zu welchem Konto gehört (je Konto höchstens eine von jeder Art)
//   fortschritt  ein Spielstand je Konto und Spiel (JSON, höchstens 64 KB) mit Erfahrungspunkten und Versionszähler
//   erfolge      freigeschaltete Abzeichen (Katalog in erfolge.js)
//   bestwerte    der beste Wert je Konto, Spiel und Bestwert (Katalog in bestwerte.js), für die Visitenkarte /u/
//   aktiv_tage   an welchen Tagen ein Konto aktiv war — nur für die Wiederkehr-Zahl im Admin, nach 120 Tagen gelöscht
//
// Die Twitch-Bereiche (Farm, adVentures, Win Tracker, Streamer-Werkzeuge …) speichern weiter unter der Twitch-ID;
// ein Konto kennt seine Twitch-ID über konto_links. Zusammengeführt wird, wenn jemand einen Anmeldeweg verknüpft, der
// schon ein eigenes Konto hat — etwa ein Gast, der sich später mit Twitch anmeldet (verknuepfe → fasseZusammen).
//
// Der Wiederherstellungscode (16 Zeichen, 80 Bit Zufall) steht nur als SHA-256 in der Datenbank. Bei so viel Zufall
// reicht ein schneller Hash; gegen Durchprobieren schützt zusätzlich die Bremse an der Anmelde-Route.

const crypto = require("crypto");
const Database = require("better-sqlite3");
const { dataPath } = require("../lib/dataDir");
const { SPIELE } = require("../analytics/spiele");
const { stufeAusXp } = require("./stufe");
const { erfolgErlaubt: katalogErlaubt } = require("./erfolge");
const { KATALOG: BESTWERT_KATALOG, bestwertInfo, sichererWert, istBesser } = require("./bestwerte");

const ARTEN = ["twitch", "discord"];
const SPIEL_IDS = new Set(SPIELE.map((s) => s.id));
const SPRACHEN = new Set(["de", "en", "es"]);
const MAX_STAND_BYTES = 64 * 1024;
const MAX_XP = 1_000_000_000;
const MAX_ERFOLGE_JE_MELDUNG = 200;
const MAX_BESTWERTE_JE_MELDUNG = 50;
const AKTIV_BEHALTEN_TAGE = 120;
const KONTO_ID_FORM = /^k[A-Za-z0-9_-]{16}$/;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: ohne I, L, O, U
// Bilder nur von den Plattformen selbst — kein fremder Server erfährt so, wer ein Profil ansieht
const BILD_HOSTS = new Set(["static-cdn.jtvnw.net", "cdn.discordapp.com"]);

const tagFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
/** Kalendertag in deutscher Zeit (JJJJ-MM-TT), wie in der Besucherstatistik */
const tagVon = (ms) => tagFormat.format(new Date(ms));
function tagPlus(tag, n) {
  const [y, m, d] = tag.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function neuerCode() {
  const bytes = crypto.randomBytes(10);
  let wert = 0;
  let bits = 0;
  let out = "";
  for (const b of bytes) {
    wert = ((wert << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g).join("-");
}

/** Eingabe tolerant lesen: Kleinbuchstaben, Leerzeichen, Bindestriche, O statt 0, I/L statt 1 */
function normalisiereCode(eingabe) {
  if (typeof eingabe !== "string" || eingabe.length > 64) return null;
  const roh = eingabe.toUpperCase().replace(/[\s_-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (roh.length !== 16) return null;
  for (const z of roh) if (!CODE_ALPHABET.includes(z)) return null;
  return roh;
}

const codeHash = (normal) => crypto.createHash("sha256").update(normal).digest("hex");

function sauberName(roh, ersatz) {
  const n = String(roh ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 32);
  return n || ersatz;
}

function sauberBild(url) {
  if (typeof url !== "string" || url.length > 400) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BILD_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

function createKontoStore({
  datei = process.env.KONTEN_DB || dataPath("konten.db"),
  now = Date.now,
  erfolgErlaubt = katalogErlaubt,
  bestwertKatalog = BESTWERT_KATALOG,
} = {}) {
  const db = new Database(datei);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS konten (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_eigen INTEGER NOT NULL DEFAULT 0,
      avatar TEXT,
      sprache TEXT,
      code_hash TEXT UNIQUE,
      bestand INTEGER NOT NULL DEFAULT 0,
      erstellt INTEGER NOT NULL,
      zuletzt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS konto_links (
      art TEXT NOT NULL,
      extern_id TEXT NOT NULL,
      konto_id TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      verknuepft INTEGER NOT NULL,
      PRIMARY KEY (art, extern_id),
      UNIQUE (konto_id, art)
    );
    CREATE TABLE IF NOT EXISTS fortschritt (
      konto_id TEXT NOT NULL,
      spiel TEXT NOT NULL,
      daten TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL,
      geaendert INTEGER NOT NULL,
      PRIMARY KEY (konto_id, spiel)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS erfolge (
      konto_id TEXT NOT NULL,
      spiel TEXT NOT NULL,
      erfolg TEXT NOT NULL,
      erreicht INTEGER NOT NULL,
      PRIMARY KEY (konto_id, spiel, erfolg)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS bestwerte (
      konto_id TEXT NOT NULL,
      spiel TEXT NOT NULL,
      wert_id TEXT NOT NULL,
      wert INTEGER NOT NULL,
      erreicht INTEGER NOT NULL,
      PRIMARY KEY (konto_id, spiel, wert_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS aktiv_tage (
      konto_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (konto_id, tag)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS aktiv_tage_tag ON aktiv_tage (tag);
  `);

  const st = {
    konto: db.prepare("SELECT * FROM konten WHERE id = ?"),
    kontoNeu: db.prepare(`INSERT INTO konten (id, name, avatar, code_hash, bestand, erstellt, zuletzt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    kontoAnbieter: db.prepare(`UPDATE konten SET name = CASE WHEN name_eigen = 1 THEN name ELSE ? END,
      avatar = COALESCE(?, avatar), zuletzt = ? WHERE id = ?`),
    kontoName: db.prepare("UPDATE konten SET name = ?, name_eigen = 1 WHERE id = ?"),
    kontoSprache: db.prepare("UPDATE konten SET sprache = ? WHERE id = ?"),
    kontoCode: db.prepare("UPDATE konten SET code_hash = ? WHERE id = ?"),
    kontoVonCode: db.prepare("SELECT id FROM konten WHERE code_hash = ?"),
    kontoUebernimm: db.prepare(`UPDATE konten SET erstellt = MIN(erstellt, ?), bestand = MAX(bestand, ?),
      sprache = COALESCE(sprache, ?), zuletzt = MAX(zuletzt, ?) WHERE id = ?`),
    kontoWeg: db.prepare("DELETE FROM konten WHERE id = ?"),

    link: db.prepare("SELECT * FROM konto_links WHERE art = ? AND extern_id = ?"),
    linkVonArt: db.prepare("SELECT * FROM konto_links WHERE konto_id = ? AND art = ?"),
    linksVon: db.prepare("SELECT art, extern_id, name, avatar, verknuepft FROM konto_links WHERE konto_id = ?"),
    linkNeu: db.prepare("INSERT INTO konto_links (art, extern_id, konto_id, name, avatar, verknuepft) VALUES (?, ?, ?, ?, ?, ?)"),
    linkInfo: db.prepare("UPDATE konto_links SET name = ?, avatar = COALESCE(?, avatar) WHERE art = ? AND extern_id = ?"),
    linkUmzug: db.prepare("UPDATE konto_links SET konto_id = ? WHERE konto_id = ? AND art = ?"),
    linkWegArt: db.prepare("DELETE FROM konto_links WHERE konto_id = ? AND art = ?"),
    linksWeg: db.prepare("DELETE FROM konto_links WHERE konto_id = ?"),

    stand: db.prepare("SELECT daten, xp, version, geaendert FROM fortschritt WHERE konto_id = ? AND spiel = ?"),
    staende: db.prepare("SELECT spiel, xp, version, geaendert FROM fortschritt WHERE konto_id = ? ORDER BY geaendert DESC"),
    staendeVoll: db.prepare("SELECT spiel, daten, xp, version, geaendert FROM fortschritt WHERE konto_id = ?"),
    standSchreib: db.prepare(`INSERT INTO fortschritt (konto_id, spiel, daten, xp, version, geaendert) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(konto_id, spiel) DO UPDATE SET daten = excluded.daten, xp = excluded.xp,
        version = excluded.version, geaendert = excluded.geaendert`),
    standUmzug: db.prepare("UPDATE fortschritt SET konto_id = ? WHERE konto_id = ? AND spiel = ?"),
    staendeWeg: db.prepare("DELETE FROM fortschritt WHERE konto_id = ?"),
    xpSumme: db.prepare("SELECT COALESCE(SUM(xp), 0) AS xp FROM fortschritt WHERE konto_id = ?"),

    erfolgNeu: db.prepare("INSERT OR IGNORE INTO erfolge (konto_id, spiel, erfolg, erreicht) VALUES (?, ?, ?, ?)"),
    erfolgeVon: db.prepare("SELECT spiel, erfolg, erreicht FROM erfolge WHERE konto_id = ? ORDER BY erreicht ASC"),
    erfolgeUebernimm: db.prepare(`INSERT INTO erfolge (konto_id, spiel, erfolg, erreicht)
      SELECT ?, spiel, erfolg, erreicht FROM erfolge WHERE konto_id = ?
      ON CONFLICT(konto_id, spiel, erfolg) DO UPDATE SET erreicht = MIN(erreicht, excluded.erreicht)`),
    erfolgeWeg: db.prepare("DELETE FROM erfolge WHERE konto_id = ?"),
    erfolgEinzelnWeg: db.prepare("DELETE FROM erfolge WHERE konto_id = ? AND spiel = ? AND erfolg = ?"),

    bestwert: db.prepare("SELECT wert FROM bestwerte WHERE konto_id = ? AND spiel = ? AND wert_id = ?"),
    bestwertSchreib: db.prepare(`INSERT INTO bestwerte (konto_id, spiel, wert_id, wert, erreicht) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(konto_id, spiel, wert_id) DO UPDATE SET wert = excluded.wert, erreicht = excluded.erreicht`),
    bestwerteVon: db.prepare("SELECT spiel, wert_id, wert, erreicht FROM bestwerte WHERE konto_id = ? ORDER BY spiel, wert_id"),
    bestwerteWeg: db.prepare("DELETE FROM bestwerte WHERE konto_id = ?"),

    aktivNeu: db.prepare("INSERT OR IGNORE INTO aktiv_tage (konto_id, tag) VALUES (?, ?)"),
    aktivZuletzt: db.prepare("UPDATE konten SET zuletzt = MAX(zuletzt, ?) WHERE id = ?"),
    aktivUebernimm: db.prepare("INSERT OR IGNORE INTO aktiv_tage (konto_id, tag) SELECT ?, tag FROM aktiv_tage WHERE konto_id = ?"),
    aktivWeg: db.prepare("DELETE FROM aktiv_tage WHERE konto_id = ?"),
    aktivAlt: db.prepare("DELETE FROM aktiv_tage WHERE tag < ?"),
    aktivFenster: db.prepare("SELECT tag FROM aktiv_tage WHERE konto_id = ? AND tag > ? AND tag <= ?"),
    kohorte: db.prepare("SELECT id, erstellt FROM konten WHERE bestand = 0 AND erstellt >= ?"),

    anzahlKonten: db.prepare("SELECT COUNT(*) AS n FROM konten"),
    anzahlArt: db.prepare("SELECT art, COUNT(*) AS n FROM konto_links GROUP BY art"),
    anzahlNurGast: db.prepare("SELECT COUNT(*) AS n FROM konten k WHERE NOT EXISTS (SELECT 1 FROM konto_links l WHERE l.konto_id = k.id)"),
    anzahlMitCode: db.prepare("SELECT COUNT(*) AS n FROM konten WHERE code_hash IS NOT NULL"),
    anzahlMitStand: db.prepare("SELECT COUNT(DISTINCT konto_id) AS n FROM fortschritt"),
  };

  const neueId = () => `k${crypto.randomBytes(12).toString("base64url")}`;
  const gueltigeId = (id) => typeof id === "string" && KONTO_ID_FORM.test(id);
  const pruefeArt = (art) => {
    if (!ARTEN.includes(art)) throw new Error(`Unbekannter Anmeldeweg: ${art}`);
  };
  const pruefeExtern = (externId) => {
    const id = String(externId ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Ungültige ID des Anmeldewegs");
    return id;
  };

  // ── Anmelden und Verknüpfen ──────────────────────────────────────────────────────────────────────────────────

  // Name und Bild des Kontos folgen dem wichtigsten Anmeldeweg: Twitch vor Discord. Sonst sprängen sie bei einem Konto
  // mit beiden Wegen bei jeder Anmeldung hin und her. Ein selbst gewählter Name (name_eigen) bleibt immer.
  function auffrischen(kontoId, art, name, avatar) {
    if (art === "twitch" || !st.linkVonArt.get(kontoId, "twitch")) st.kontoAnbieter.run(name, avatar, now(), kontoId);
  }

  /** Konto zu einer Twitch- oder Discord-ID, oder null */
  function kontoVonLink(art, externId) {
    if (!ARTEN.includes(art) || externId == null) return null;
    return st.link.get(art, String(externId))?.konto_id || null;
  }

  /**
   * Anmelden über Twitch oder Discord: vorhandenes Konto (Name und Bild werden aufgefrischt) oder ein neues.
   * @param {{ name?: string, avatar?: string }} info
   * @param {{ bestand?: boolean }} opt  bestand = Konto für eine Sitzung von vor dem Konto-Update (zählt in der
   *                                     Wiederkehr-Zahl nicht als neu)
   */
  const anmelden = db.transaction((art, externId, info = {}, { bestand = false } = {}) => {
    pruefeArt(art);
    const ext = pruefeExtern(externId);
    const t = now();
    const name = sauberName(info.name, art === "twitch" ? "Twitch-Nutzer" : "Discord-Nutzer");
    const avatar = sauberBild(info.avatar);
    const link = st.link.get(art, ext);
    if (link) {
      st.linkInfo.run(name, avatar, art, ext);
      auffrischen(link.konto_id, art, name, avatar);
      return { kontoId: link.konto_id, neu: false };
    }
    const id = neueId();
    st.kontoNeu.run(id, name, avatar, null, bestand ? 1 : 0, t, t);
    st.linkNeu.run(art, ext, id, name, avatar, t);
    return { kontoId: id, neu: true };
  });

  /** Neues Gastkonto ohne Twitch und Discord. Der Code wird nur hier einmal im Klartext geliefert. */
  const erstelleGast = db.transaction(() => {
    const t = now();
    const id = neueId();
    const code = neuerCode();
    const nummer = String(crypto.randomInt(1000, 10000));
    st.kontoNeu.run(id, `Gast ${nummer}`, null, codeHash(normalisiereCode(code)), 0, t, t);
    return { kontoId: id, code };
  });

  /** Konto zu einem Wiederherstellungscode, oder null */
  function kontoVonCode(eingabe) {
    const normal = normalisiereCode(eingabe);
    if (!normal) return null;
    return st.kontoVonCode.get(codeHash(normal))?.id || null;
  }

  /** Neuer Wiederherstellungscode; der alte gilt danach nicht mehr */
  function erneuereCode(kontoId) {
    if (!st.konto.get(kontoId)) throw new Error("Konto nicht gefunden");
    const code = neuerCode();
    st.kontoCode.run(codeHash(normalisiereCode(code)), kontoId);
    return code;
  }

  /**
   * Hängt alles von `quelle` an `ziel` und löscht `quelle`. Spielstände: je Spiel gewinnt der mit mehr XP (bei
   * Gleichstand der neuere); Abzeichen und aktive Tage werden vereinigt; Anmeldewege ziehen um, soweit `ziel` keinen
   * derselben Art hat (verknuepfe() lässt es so weit gar nicht kommen); Code und Sprache nur, wenn `ziel` keine hat.
   */
  const fasseZusammen = db.transaction((ziel, quelle) => {
    if (ziel === quelle) return { ziel, verworfeneWege: [] };
    const zk = st.konto.get(ziel);
    const qk = st.konto.get(quelle);
    if (!zk || !qk) throw new Error("Konto nicht gefunden");

    for (const q of st.staendeVoll.all(quelle)) {
      const z = st.stand.get(ziel, q.spiel);
      if (!z) {
        st.standUmzug.run(ziel, quelle, q.spiel);
      } else if (q.xp > z.xp || (q.xp === z.xp && q.geaendert > z.geaendert)) {
        // Version weiterzählen: ein Gerät mit dem alten Stand des Ziels bekommt beim nächsten Speichern einen Konflikt
        st.standSchreib.run(ziel, q.spiel, q.daten, q.xp, z.version + 1, q.geaendert);
      }
    }
    st.staendeWeg.run(quelle);
    st.erfolgeUebernimm.run(ziel, quelle);
    st.erfolgeWeg.run(quelle);
    for (const b of st.bestwerteVon.all(quelle)) schreibeBestwert(ziel, b.spiel, b.wert_id, b.wert, b.erreicht);
    st.bestwerteWeg.run(quelle);
    st.aktivUebernimm.run(ziel, quelle);
    st.aktivWeg.run(quelle);

    const verworfeneWege = [];
    for (const l of st.linksVon.all(quelle)) {
      if (st.linkVonArt.get(ziel, l.art)) {
        verworfeneWege.push(l.art);
      } else {
        st.linkUmzug.run(ziel, quelle, l.art);
      }
    }
    st.linksWeg.run(quelle);

    if (!zk.code_hash && qk.code_hash) {
      st.kontoCode.run(null, quelle); // UNIQUE: erst beim alten Konto lösen
      st.kontoCode.run(qk.code_hash, ziel);
    }
    st.kontoUebernimm.run(qk.erstellt, qk.bestand, qk.sprache, qk.zuletzt, ziel);
    st.kontoWeg.run(quelle);
    return { ziel, verworfeneWege };
  });

  /**
   * Verknüpft einen Anmeldeweg mit einem Konto. Gehört er schon zu einem anderen Konto, werden beide zusammengeführt;
   * bleiben wird das Konto mit Twitch-Verknüpfung (daran hängen öffentliches Profil und Twitch-Daten), sonst `kontoId`.
   * Abgelehnt, wenn danach zwei Anmeldewege derselben Art an einem Konto hingen.
   * @returns {{ ok: true, kontoId: string, entfernt: string|null } | { ok: false, fehler: string, art?: string }}
   */
  const verknuepfe = db.transaction((kontoId, art, externId, info = {}) => {
    pruefeArt(art);
    const ext = pruefeExtern(externId);
    if (!st.konto.get(kontoId)) return { ok: false, fehler: "konto-fehlt" };
    const name = sauberName(info.name, art === "twitch" ? "Twitch-Nutzer" : "Discord-Nutzer");
    const avatar = sauberBild(info.avatar);
    const link = st.link.get(art, ext);

    if (link && link.konto_id === kontoId) {
      st.linkInfo.run(name, avatar, art, ext);
      return { ok: true, kontoId, entfernt: null };
    }
    const eigener = st.linkVonArt.get(kontoId, art);
    if (eigener) return { ok: false, fehler: "schon-verknuepft", art };

    if (!link) {
      st.linkNeu.run(art, ext, kontoId, name, avatar, now());
      // Ein Gast bekommt so Name und Bild des neuen Anmeldewegs (solange er sich keinen eigenen Namen gegeben hat)
      auffrischen(kontoId, art, name, avatar);
      return { ok: true, kontoId, entfernt: null };
    }

    const anderes = link.konto_id;
    const meineArten = new Set(st.linksVon.all(kontoId).map((l) => l.art));
    const doppelt = st.linksVon.all(anderes).find((l) => meineArten.has(l.art));
    if (doppelt) return { ok: false, fehler: "doppelt", art: doppelt.art };

    const anderesHatTwitch = Boolean(st.linkVonArt.get(anderes, "twitch"));
    const [ziel, quelle] = anderesHatTwitch ? [anderes, kontoId] : [kontoId, anderes];
    fasseZusammen(ziel, quelle);
    st.linkInfo.run(name, avatar, art, ext);
    auffrischen(ziel, art, name, avatar);
    return { ok: true, kontoId: ziel, entfernt: quelle };
  });

  /** Anmeldeweg lösen — nur, wenn danach noch ein anderer bleibt (anderer Weg oder Wiederherstellungscode) */
  const trenne = db.transaction((kontoId, art) => {
    pruefeArt(art);
    const k = st.konto.get(kontoId);
    if (!k) return { ok: false, fehler: "konto-fehlt" };
    const links = st.linksVon.all(kontoId);
    if (!links.some((l) => l.art === art)) return { ok: true };
    const uebrig = links.filter((l) => l.art !== art).length + (k.code_hash ? 1 : 0);
    if (uebrig === 0) return { ok: false, fehler: "letzter-weg" };
    st.linkWegArt.run(kontoId, art);
    return { ok: true };
  });

  // ── Konto ansehen und ändern ─────────────────────────────────────────────────────────────────────────────────

  function ansicht(kontoId) {
    const k = gueltigeId(kontoId) ? st.konto.get(kontoId) : null;
    if (!k) return null;
    const links = st.linksVon.all(kontoId);
    const weg = (art) => {
      const l = links.find((x) => x.art === art);
      return l ? { id: l.extern_id, name: l.name, avatar: l.avatar, seit: l.verknuepft } : null;
    };
    const staende = st.staende.all(kontoId);
    const xp = staende.reduce((s, x) => s + x.xp, 0);
    return {
      id: k.id,
      name: k.name,
      // selbst gewählt — sonst folgt der Name dem Anmeldeweg (bei alten Twitch-Sitzungen zunächst nur der Login)
      nameEigen: Boolean(k.name_eigen),
      avatar: k.avatar,
      sprache: k.sprache,
      gast: links.length === 0,
      hatCode: Boolean(k.code_hash),
      twitch: weg("twitch"),
      discord: weg("discord"),
      erstellt: k.erstellt,
      // Konto für eine Sitzung von vor dem Konto-Update (zählt nicht als neu — z. B. für Einladungen)
      bestand: Boolean(k.bestand),
      stufe: stufeAusXp(xp),
      spiele: staende.map((s) => ({ spiel: s.spiel, xp: s.xp, geaendert: s.geaendert })),
      erfolge: st.erfolgeVon.all(kontoId),
      bestwerte: st.bestwerteVon.all(kontoId).map((b) => ({ spiel: b.spiel, wert: b.wert_id, zahl: b.wert, erreicht: b.erreicht })),
    };
  }

  /** Eigener Anzeigename (2–24 Zeichen, keine Adressen) */
  function setzeName(kontoId, roh) {
    const name = sauberName(roh, "");
    if (name.length < 2 || name.length > 24) return { ok: false, fehler: "laenge" };
    if (/https?:|www\.|\.(de|com|net|org|gg|tv)\b/i.test(name)) return { ok: false, fehler: "adresse" };
    if (!st.kontoName.run(name, kontoId).changes) return { ok: false, fehler: "konto-fehlt" };
    return { ok: true, name };
  }

  function setzeSprache(kontoId, sprache) {
    const s = typeof sprache === "string" ? sprache.toLowerCase() : "";
    if (!SPRACHEN.has(s)) return { ok: false, fehler: "sprache" };
    if (!st.kontoSprache.run(s, kontoId).changes) return { ok: false, fehler: "konto-fehlt" };
    return { ok: true, sprache: s };
  }

  /** Konto mit allem löschen (Spielstände, Abzeichen, Anmeldewege, aktive Tage) */
  const loesche = db.transaction((kontoId) => {
    st.staendeWeg.run(kontoId);
    st.erfolgeWeg.run(kontoId);
    st.bestwerteWeg.run(kontoId);
    st.aktivWeg.run(kontoId);
    st.linksWeg.run(kontoId);
    return st.kontoWeg.run(kontoId).changes > 0;
  });

  // ── Spielstände ──────────────────────────────────────────────────────────────────────────────────────────────

  const istSpiel = (spiel) => typeof spiel === "string" && SPIEL_IDS.has(spiel);

  function staende(kontoId) {
    return st.staende.all(kontoId);
  }

  /** @returns {{ daten: any, xp: number, version: number, geaendert: number } | null} */
  function stand(kontoId, spiel) {
    if (!istSpiel(spiel)) return null;
    const r = st.stand.get(kontoId, spiel);
    return r ? { daten: JSON.parse(r.daten), xp: r.xp, version: r.version, geaendert: r.geaendert } : null;
  }

  /**
   * Speichert einen Spielstand. `version` ist die zuletzt gesehene (0 = noch keiner). Passt sie nicht, hat ein anderes
   * Gerät inzwischen gespeichert: dann nichts schreiben, sondern den aktuellen Stand zurückgeben (Konflikt).
   */
  const speichereStand = db.transaction((kontoId, spiel, daten, { xp = 0, version = 0 } = {}) => {
    if (!istSpiel(spiel)) return { ok: false, fehler: "spiel" };
    if (!st.konto.get(kontoId)) return { ok: false, fehler: "konto-fehlt" };
    if (daten === undefined) return { ok: false, fehler: "daten" };
    let text;
    try {
      text = JSON.stringify(daten);
    } catch {
      return { ok: false, fehler: "daten" };
    }
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_STAND_BYTES) return { ok: false, fehler: "zu-gross" };
    const x = Number(xp);
    if (!Number.isFinite(x) || x < 0 || x > MAX_XP) return { ok: false, fehler: "xp" };
    const v = Number(version);
    if (!Number.isInteger(v) || v < 0) return { ok: false, fehler: "version" };

    const alt = st.stand.get(kontoId, spiel);
    const aktuell = alt ? alt.version : 0;
    if (v !== aktuell) {
      return { ok: false, konflikt: true, stand: { daten: JSON.parse(alt.daten), xp: alt.xp, version: alt.version, geaendert: alt.geaendert } };
    }
    const t = now();
    st.standSchreib.run(kontoId, spiel, text, Math.floor(x), aktuell + 1, t);
    return { ok: true, version: aktuell + 1, geaendert: t };
  });

  // ── Abzeichen ────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Abzeichen eines Spiels — oder der Website selbst (Bereich "website", z. B. Einladungen, einladung/). Die Route
   * POST /api/konto/erfolge/:spiel nimmt nur Spiele an (kontoRoutes.js); "website" vergibt allein der Server.
   * @returns {{ ok: true, neu: string[], abgelehnt: string[] } | { ok: false, fehler: string }}
   */
  const meldeErfolge = db.transaction((kontoId, spiel, ids) => {
    if (!istSpiel(spiel) && spiel !== "website") return { ok: false, fehler: "spiel" };
    if (!Array.isArray(ids) || ids.length > MAX_ERFOLGE_JE_MELDUNG) return { ok: false, fehler: "liste" };
    if (!st.konto.get(kontoId)) return { ok: false, fehler: "konto-fehlt" };
    const t = now();
    const neu = [];
    const abgelehnt = [];
    for (const id of new Set(ids)) {
      if (!erfolgErlaubt(spiel, id)) {
        abgelehnt.push(String(id).slice(0, 48));
        continue;
      }
      if (st.erfolgNeu.run(kontoId, spiel, id, t).changes) neu.push(id);
    }
    return { ok: true, neu, abgelehnt };
  });

  /**
   * Ein Abzeichen wieder entziehen — nur der Server, z. B. wenn der Kauf dahinter erstattet wurde (laden/).
   * Die Vitrine der Visitenkarte zeigt nur vorhandene Abzeichen, ein entzogenes fällt dort von selbst heraus.
   * @returns {boolean} true, wenn es das Abzeichen gab
   */
  const entziehErfolg = (kontoId, spiel, id) => st.erfolgEinzelnWeg.run(kontoId, spiel, id).changes > 0;

  // ── Bestwerte ────────────────────────────────────────────────────────────────────────────────────────────────

  /** Schreibt einen Wert nur, wenn er besser ist als der gespeicherte. @returns {boolean} geschrieben */
  function schreibeBestwert(kontoId, spiel, id, wert, erreicht) {
    const info = bestwertInfo(spiel, id, bestwertKatalog);
    const w = sichererWert(info, wert);
    if (w === null) return false;
    const alt = st.bestwert.get(kontoId, spiel, id);
    if (!istBesser(info, w, alt ? alt.wert : null)) return false;
    st.bestwertSchreib.run(kontoId, spiel, id, w, erreicht);
    return true;
  }

  /**
   * Meldet Bestwerte eines Spiels als { id: wert }. Gespeichert wird je Wert nur eine Verbesserung.
   * @returns {{ ok: true, neu: string[], abgelehnt: string[] } | { ok: false, fehler: string }}
   */
  const meldeBestwerte = db.transaction((kontoId, spiel, werte) => {
    if (!istSpiel(spiel)) return { ok: false, fehler: "spiel" };
    if (!werte || typeof werte !== "object" || Array.isArray(werte)) return { ok: false, fehler: "liste" };
    const eintraege = Object.entries(werte);
    if (eintraege.length > MAX_BESTWERTE_JE_MELDUNG) return { ok: false, fehler: "liste" };
    if (!st.konto.get(kontoId)) return { ok: false, fehler: "konto-fehlt" };
    const t = now();
    const neu = [];
    const abgelehnt = [];
    for (const [id, wert] of eintraege) {
      const info = bestwertInfo(spiel, id, bestwertKatalog);
      if (!info || sichererWert(info, wert) === null) {
        abgelehnt.push(String(id).slice(0, 48));
        continue;
      }
      if (schreibeBestwert(kontoId, spiel, id, wert, t)) neu.push(id);
    }
    return { ok: true, neu, abgelehnt };
  });

  // ── Aktive Tage und Wiederkehr ───────────────────────────────────────────────────────────────────────────────

  // Pro Tag und Konto nur ein Schreibvorgang, auch wenn jede Anfrage merkeAktiv aufruft
  let gemerktTag = null;
  const gemerkt = new Set();

  /** Merkt, dass das Konto heute aktiv war. Liefert true beim ersten Mal am Tag. */
  function merkeAktiv(kontoId, ts = now()) {
    if (!gueltigeId(kontoId)) return false;
    const tag = tagVon(ts);
    if (tag !== gemerktTag) {
      gemerktTag = tag;
      gemerkt.clear();
    }
    if (gemerkt.has(kontoId)) return false;
    gemerkt.add(kontoId);
    if (!st.konto.get(kontoId)) return false;
    const neu = st.aktivNeu.run(kontoId, tag).changes > 0;
    if (neu) st.aktivZuletzt.run(ts, kontoId);
    return neu;
  }

  /** Löscht aktive Tage, die älter als 120 Tage sind */
  function raeumeAuf(ts = now()) {
    return st.aktivAlt.run(tagPlus(tagVon(ts), -AKTIV_BEHALTEN_TAGE)).changes;
  }

  /**
   * Wiederkehr neuer Konten: von denen, die zwischen `von` und `bis` (Tage, JJJJ-MM-TT) angelegt wurden, wie viele am
   * Folgetag, innerhalb von 7 und innerhalb von 30 Tagen wieder aktiv waren. Je Kennzahl zählen nur Konten, deren
   * Zeitfenster schon ganz vorbei ist (`basis`). Konten aus der Zeit vor dem Konto-Update (bestand) zählen nicht.
   * @param {{ von: string, bis: string, heute?: string, ohne?: string[] }} opt
   */
  function wiederkehr({ von, bis, heute = tagVon(now()), ohne = [] }) {
    const ausnahmen = new Set(ohne.filter(Boolean));
    const [y, m, d] = von.split("-").map(Number);
    const abMs = Date.UTC(y, m - 1, d) - 2 * 24 * 60 * 60 * 1000; // großzügig, genau wird über den Tag gefiltert
    const fenster = [
      ["tag1", 1, 1],
      ["tage7", 1, 7],
      ["tage30", 1, 30],
    ];
    const out = { neu: 0, tag1: { basis: 0, zurueck: 0 }, tage7: { basis: 0, zurueck: 0 }, tage30: { basis: 0, zurueck: 0 } };
    for (const k of st.kohorte.all(abMs)) {
      if (ausnahmen.has(k.id)) continue;
      const start = tagVon(k.erstellt);
      if (start < von || start > bis) continue;
      out.neu++;
      const tage = st.aktivFenster.all(k.id, start, tagPlus(start, 30)).map((r) => r.tag);
      for (const [schluessel, ab, bisN] of fenster) {
        if (tagPlus(start, bisN) >= heute) continue; // Fenster noch nicht vorbei
        out[schluessel].basis++;
        const a = tagPlus(start, ab);
        const b = tagPlus(start, bisN);
        if (tage.some((t) => t >= a && t <= b)) out[schluessel].zurueck++;
      }
    }
    return out;
  }

  function zahlen() {
    const proArt = Object.fromEntries(st.anzahlArt.all().map((r) => [r.art, r.n]));
    return {
      konten: st.anzahlKonten.get().n,
      twitch: proArt.twitch || 0,
      discord: proArt.discord || 0,
      nurGast: st.anzahlNurGast.get().n,
      mitCode: st.anzahlMitCode.get().n,
      mitSpielstand: st.anzahlMitStand.get().n,
    };
  }

  // ── Beobachter ───────────────────────────────────────────────────────────────────────────────────────────────
  // Andere Speicher mit Daten je Konto (z. B. die Visitenkarte in profile/) erfahren so, wenn zwei Konten
  // zusammengeführt oder eines gelöscht wird. Gemeldet wird nach dem Schreiben; ein Fehler dort ändert hier nichts.
  const beobachter = [];
  function melde(art, ...args) {
    for (const b of beobachter) {
      try {
        if (typeof b[art] === "function") b[art](...args);
      } catch (e) {
        console.error(`[konto] Beobachter (${art}):`, e.message);
      }
    }
  }
  /**
   * @param {{ zusammengefuehrt?: (ziel: string, quelle: string) => void, geloescht?: (kontoId: string) => void,
   *           aktiv?: (kontoId: string, tag: string) => void }} b   aktiv: erster Gebrauch des Kontos an einem Tag
   */
  function beobachte(b) {
    beobachter.push(b);
    return () => {
      const i = beobachter.indexOf(b);
      if (i >= 0) beobachter.splice(i, 1);
    };
  }

  return {
    kontoVonLink, anmelden, erstelleGast, kontoVonCode, erneuereCode,
    verknuepfe(...args) {
      const r = verknuepfe(...args);
      if (r.ok && r.entfernt) melde("zusammengefuehrt", r.kontoId, r.entfernt);
      return r;
    },
    trenne,
    fasseZusammen(ziel, quelle) {
      const r = fasseZusammen(ziel, quelle);
      if (ziel !== quelle) melde("zusammengefuehrt", ziel, quelle);
      return r;
    },
    ansicht, setzeName, setzeSprache,
    loesche(kontoId) {
      const weg = loesche(kontoId);
      if (weg) melde("geloescht", kontoId);
      return weg;
    },
    beobachte,
    staende, stand, speichereStand, meldeErfolge, entziehErfolg, meldeBestwerte,
    merkeAktiv(kontoId, ts = now()) {
      const neu = merkeAktiv(kontoId, ts);
      if (neu) melde("aktiv", kontoId, tagVon(ts));
      return neu;
    },
    raeumeAuf, wiederkehr, zahlen,
    gueltigeId,
    close: () => db.close(),
  };
}

module.exports = {
  createKontoStore, normalisiereCode, neuerCode, tagVon, tagPlus,
  ARTEN, MAX_STAND_BYTES, AKTIV_BEHALTEN_TAGE,
};
