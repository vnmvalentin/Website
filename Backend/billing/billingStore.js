// billingStore.js — wer hat was bezahlt? Verknüpft die Twitch-ID mit dem Stripe-Kunden, dem
// Abo-Stand und (später) einzeln gekauften Inhalten. Kartendaten liegen NIE hier: die kennt
// nur Stripe. Gespeichert wird, was zum Freischalten nötig ist.
//
// Tabellen:
//   customers      Twitch-ID <-> Stripe-Kunde (damit ein zweiter Kauf denselben Kunden nutzt)
//   subscriptions  letzter bekannter Stand des Abos je Twitch-ID (kommt per Webhook)
//   purchases      Einmalkäufe (Skins) — je Twitch-ID und Artikel höchstens eine Zeile
//   grants         von Hand vergebene Freischaltungen (Freunde, Tester), optional befristet
//   consents       Zustimmung vor dem Kauf (Widerrufs-Hinweis), als Nachweis mit Zeitpunkt
//   events         schon verarbeitete Webhook-Ereignisse (Stripe stellt mehrfach zu)
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// BILLING_DB biegt den Pfad für Prüfstände und Tests um — nie gegen die echte Datei testen.
// Der Ordner data/ wird nicht ausgeliefert (deploy.sh) und die Datei steht in .gitignore.
const dbPath = process.env.BILLING_DB || path.join(__dirname, "..", "data", "billing.db");
if (dbPath !== ":memory:") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    twitch_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS subscriptions (
    twitch_id TEXT PRIMARY KEY,
    stripe_subscription_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end INTEGER NOT NULL DEFAULT 0,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS purchases (
    twitch_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    stripe_ref TEXT NOT NULL DEFAULT '',
    bought_at INTEGER NOT NULL,
    PRIMARY KEY (twitch_id, item_id)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS grants (
    twitch_id TEXT PRIMARY KEY,
    note TEXT NOT NULL DEFAULT '',
    until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS consents (
    twitch_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL
  ) WITHOUT ROWID;
`);

const stmt = {
  getCustomer: db.prepare("SELECT stripe_customer_id FROM customers WHERE twitch_id = ?"),
  getTwitchByCustomer: db.prepare("SELECT twitch_id FROM customers WHERE stripe_customer_id = ?"),
  setCustomer: db.prepare(
    `INSERT INTO customers (twitch_id, stripe_customer_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(twitch_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id`
  ),
  getSub: db.prepare("SELECT * FROM subscriptions WHERE twitch_id = ?"),
  setSub: db.prepare(
    `INSERT INTO subscriptions (twitch_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at)
     VALUES (@twitchId, @subscriptionId, @plan, @status, @currentPeriodEnd, @cancelAtPeriodEnd, @updatedAt)
     ON CONFLICT(twitch_id) DO UPDATE SET
       stripe_subscription_id = excluded.stripe_subscription_id, plan = excluded.plan, status = excluded.status,
       current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
       updated_at = excluded.updated_at`
  ),
  getGrant: db.prepare("SELECT * FROM grants WHERE twitch_id = ?"),
  setGrant: db.prepare(
    `INSERT INTO grants (twitch_id, note, until, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(twitch_id) DO UPDATE SET note = excluded.note, until = excluded.until`
  ),
  delGrant: db.prepare("DELETE FROM grants WHERE twitch_id = ?"),
  listPurchases: db.prepare("SELECT item_id FROM purchases WHERE twitch_id = ?"),
  addPurchase: db.prepare("INSERT OR IGNORE INTO purchases (twitch_id, item_id, stripe_ref, bought_at) VALUES (?, ?, ?, ?)"),
  addConsent: db.prepare("INSERT INTO consents (twitch_id, kind, at) VALUES (?, ?, ?)"),
  hasEvent: db.prepare("SELECT 1 FROM events WHERE id = ?"),
  seenEvent: db.prepare("INSERT OR IGNORE INTO events (id, at) VALUES (?, ?)"),
  trimEvents: db.prepare("DELETE FROM events WHERE at < ?"),
};

const EVENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = {
  customerOf: (twitchId) => stmt.getCustomer.get(String(twitchId))?.stripe_customer_id || null,
  twitchOfCustomer: (customerId) => stmt.getTwitchByCustomer.get(String(customerId))?.twitch_id || null,
  linkCustomer: (twitchId, customerId, now = Date.now()) => stmt.setCustomer.run(String(twitchId), String(customerId), now),

  subscriptionOf: (twitchId) => stmt.getSub.get(String(twitchId)) || null,
  saveSubscription: (sub) => stmt.setSub.run({ ...sub, twitchId: String(sub.twitchId), cancelAtPeriodEnd: sub.cancelAtPeriodEnd ? 1 : 0 }),

  grantOf: (twitchId) => stmt.getGrant.get(String(twitchId)) || null,
  setGrant: (twitchId, note = "", until = 0, now = Date.now()) => stmt.setGrant.run(String(twitchId), String(note), Number(until) || 0, now),
  removeGrant: (twitchId) => stmt.delGrant.run(String(twitchId)),

  purchasesOf: (twitchId) => stmt.listPurchases.all(String(twitchId)).map((r) => r.item_id),
  addPurchase: (twitchId, itemId, ref = "", now = Date.now()) => stmt.addPurchase.run(String(twitchId), String(itemId), String(ref), now),

  addConsent: (twitchId, kind, now = Date.now()) => stmt.addConsent.run(String(twitchId), String(kind), now),

  eventSeen: (id) => !!stmt.hasEvent.get(String(id)),
  /** Ereignis als verarbeitet merken (erst NACH der Verarbeitung aufrufen) */
  markEvent(id, now = Date.now()) {
    stmt.trimEvents.run(now - EVENT_KEEP_MS);
    stmt.seenEvent.run(String(id), now);
  },
};
