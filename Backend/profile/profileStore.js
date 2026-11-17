// profile/profileStore.js — Visitenkarten (/u/<adresse>): je Konto eine, opt-in. Ohne Eintrag mit an = 1 gibt es keine
// öffentliche Seite. Pfad über PUBLIC_PROFILE_DB überschreibbar (Tests und Prüfstände nie gegen die echte Datei).
//
// TABELLEN
//   visitenkarten    je Konto (konto/): Adresse, an/aus, Einstellungen (Reihenfolge, versteckte Abschnitte,
//                    Lieblingsspiel, Abzeichen-Vitrine, CR-Tag) und der zuletzt abgefragte Stand des CR-Kontos
//   public_profiles  ALT (bis 16.11.2026): je Twitch-ID ein Schalter, Adresse = Twitch-Login. uebernimmAlte() trägt
//                    eingeschaltete Profile einmal in visitenkarten über (index.js beim Start); danach nur noch Archiv.
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const leer = () => ({ reihenfolge: [], versteckt: [], lieblingsspiel: '', vitrine: [], crTag: '' });

function liesEinstellungen(text) {
  try {
    const e = JSON.parse(text || '{}');
    return { ...leer(), ...(e && typeof e === 'object' && !Array.isArray(e) ? e : {}) };
  } catch {
    return leer();
  }
}

function createProfileStore(dbFile = process.env.PUBLIC_PROFILE_DB || path.join(__dirname, '../data/public_profiles.db'), { now = Date.now } = {}) {
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_profiles (
      twitch_id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_public_profiles_login ON public_profiles(login);
    CREATE TABLE IF NOT EXISTS visitenkarten (
      konto_id TEXT PRIMARY KEY,
      adresse TEXT NOT NULL UNIQUE,
      an INTEGER NOT NULL DEFAULT 0,
      einstellungen TEXT NOT NULL DEFAULT '{}',
      twitch_login TEXT,
      cr_stand TEXT,
      cr_stand_at INTEGER,
      erstellt INTEGER NOT NULL,
      geaendert INTEGER NOT NULL
    );
  `);
  const cols = new Set(db.prepare('PRAGMA table_info(public_profiles)').all().map((c) => c.name));
  if (!cols.has('display_name')) db.exec("ALTER TABLE public_profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  if (!cols.has('avatar')) db.exec("ALTER TABLE public_profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
  if (!cols.has('uebernommen')) db.exec('ALTER TABLE public_profiles ADD COLUMN uebernommen INTEGER NOT NULL DEFAULT 0');

  const st = {
    karte: db.prepare('SELECT * FROM visitenkarten WHERE konto_id = ?'),
    vonAdresse: db.prepare('SELECT * FROM visitenkarten WHERE adresse = ?'),
    neu: db.prepare(`INSERT INTO visitenkarten (konto_id, adresse, an, einstellungen, twitch_login, erstellt, geaendert)
      VALUES (@kontoId, @adresse, @an, @einstellungen, @twitchLogin, @t, @t)`),
    aendern: db.prepare(`UPDATE visitenkarten SET adresse = @adresse, an = @an, einstellungen = @einstellungen,
      geaendert = @t WHERE konto_id = @kontoId`),
    twitchLogin: db.prepare('UPDATE visitenkarten SET twitch_login = ? WHERE konto_id = ?'),
    crStand: db.prepare('UPDATE visitenkarten SET cr_stand = ?, cr_stand_at = ? WHERE konto_id = ?'),
    umzug: db.prepare('UPDATE visitenkarten SET konto_id = ? WHERE konto_id = ?'),
    weg: db.prepare('DELETE FROM visitenkarten WHERE konto_id = ?'),
    alteOffen: db.prepare('SELECT * FROM public_profiles WHERE uebernommen = 0'),
    alteErledigt: db.prepare('UPDATE public_profiles SET uebernommen = 1 WHERE twitch_id = ?'),
  };

  const zuKarte = (r) => r ? {
    kontoId: r.konto_id,
    adresse: r.adresse,
    an: Boolean(r.an),
    einstellungen: liesEinstellungen(r.einstellungen),
    twitchLogin: r.twitch_login || null,
    crStand: r.cr_stand ? JSON.parse(r.cr_stand) : null,
    crStandAt: r.cr_stand_at || 0,
    erstellt: r.erstellt,
    geaendert: r.geaendert,
  } : null;

  /** Ist die Adresse frei (oder gehört schon diesem Konto)? */
  function adresseFrei(adresse, kontoId) {
    const r = st.vonAdresse.get(adresse);
    return !r || r.konto_id === kontoId;
  }

  /**
   * Legt die Karte an oder ändert sie. Adresse und Einstellungen sind hier schon geprüft (profileRoutes.js).
   * @returns {{ ok: true, karte } | { ok: false, fehler: "vergeben" }}
   */
  const speichere = db.transaction((kontoId, { adresse, an, einstellungen, twitchLogin = null }) => {
    if (!adresseFrei(adresse, kontoId)) return { ok: false, fehler: 'vergeben' };
    const t = now();
    const daten = { kontoId, adresse, an: an ? 1 : 0, einstellungen: JSON.stringify(einstellungen || leer()), twitchLogin, t };
    if (st.karte.get(kontoId)) st.aendern.run(daten);
    else st.neu.run(daten);
    return { ok: true, karte: zuKarte(st.karte.get(kontoId)) };
  });

  /**
   * Zwei Konten wurden zusammengeführt (konto/kontoStore.js, Beobachter): hat das bleibende Konto keine Karte, zieht
   * die des entfernten um; sonst gewinnt die des bleibenden und die andere wird gelöscht.
   */
  const zusammenfuehren = db.transaction((ziel, quelle) => {
    if (ziel === quelle || !st.karte.get(quelle)) return;
    if (st.karte.get(ziel)) st.weg.run(quelle);
    else st.umzug.run(ziel, quelle);
  });

  /**
   * Alte Twitch-Profile übernehmen: jedes eingeschaltete bekommt eine Karte am Konto seiner Twitch-ID, Adresse =
   * Twitch-Login (die geteilten Links bleiben gültig). Läuft je alter Zeile nur einmal.
   * @param {(twitchId: string, info: { name: string, avatar: string }) => string|null} kontoFuerTwitch
   * @returns {number} übernommene Profile
   */
  function uebernimmAlte(kontoFuerTwitch) {
    let n = 0;
    for (const r of st.alteOffen.all()) {
      try {
        if (r.enabled) {
          const kontoId = kontoFuerTwitch(r.twitch_id, { name: r.display_name || r.login, avatar: r.avatar || '' });
          if (kontoId && !st.karte.get(kontoId) && adresseFrei(r.login, kontoId)) {
            const t = r.updated_at || now();
            st.neu.run({ kontoId, adresse: r.login, an: 1, einstellungen: JSON.stringify(leer()), twitchLogin: r.login, t });
            n++;
          }
        }
        st.alteErledigt.run(r.twitch_id);
      } catch (e) {
        console.error('[profile] altes Profil nicht übernommen:', e.message);
      }
    }
    return n;
  }

  return {
    karte: (kontoId) => zuKarte(st.karte.get(String(kontoId))),
    vonAdresse: (adresse) => zuKarte(st.vonAdresse.get(String(adresse || '').toLowerCase())),
    adresseFrei,
    speichere,
    merkeTwitchLogin: (kontoId, login) => st.twitchLogin.run(login || null, kontoId).changes > 0,
    merkeCrStand: (kontoId, stand, at = now()) => st.crStand.run(stand ? JSON.stringify(stand) : null, stand ? at : null, kontoId).changes > 0,
    zusammenfuehren,
    loesche: (kontoId) => st.weg.run(kontoId).changes > 0,
    uebernimmAlte,
    leereEinstellungen: leer,
    // Nur für Tests: ein altes Profil wie vor dem 16.11.2026 anlegen
    legeAltesAn(twitchId, login, enabled, { displayName = '', avatar = '' } = {}) {
      db.prepare(`INSERT INTO public_profiles (twitch_id, login, enabled, updated_at, display_name, avatar)
        VALUES (?, ?, ?, ?, ?, ?)`).run(String(twitchId), String(login).toLowerCase(), enabled ? 1 : 0, now(), displayName, avatar);
    },
    close: () => db.close(),
  };
}

module.exports = { createProfileStore };
