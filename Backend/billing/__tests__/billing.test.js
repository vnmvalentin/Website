// Abo-Logik ohne Netz: Stripe ist eine Attrappe, die Datenbank liegt im Arbeitsspeicher.
// Aufruf: npm run test:billing
process.env.BILLING_DB = ":memory:";
process.env.STREAMER_TWITCH_ID = "owner-1";
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
process.env.STRIPE_PRICE_PREMIUM = "price_x";
process.env.FRONTEND_URL = "https://example.test/";

const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../billingStore");
const { premiumStatus, isPremium, GRACE_MS } = require("../entitlements");
const { createBillingService, missingConfig, periodEndMs } = require("../billingService");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14);

/** Stripe-Attrappe: merkt sich die Aufrufe und liefert vorbereitete Abos zurück */
function fakeStripe(subs = {}) {
  const calls = [];
  return {
    calls,
    checkout: { sessions: { create: async (p) => { calls.push(["checkout", p]); return { url: "https://stripe.test/pay" }; } } },
    billingPortal: { sessions: { create: async (p) => { calls.push(["portal", p]); return { url: "https://stripe.test/portal" }; } } },
    subscriptions: {
      retrieve: async (id) => subs[id],
      cancel: async (id) => { calls.push(["cancel", id]); },
    },
    charges: { list: async (p) => { calls.push(["charges", p]); return { data: [{ id: "ch_1", paid: true, refunded: false }] }; } },
    refunds: { create: async (p) => { calls.push(["refund", p]); } },
  };
}
const sub = (over = {}) => ({
  id: "sub_1", status: "active", customer: "cus_1", cancel_at_period_end: false, metadata: { twitch_id: "u1", plan: "premium" },
  items: { data: [{ current_period_end: (NOW + 20 * DAY) / 1000 }] }, ...over,
});
const session = (over = {}) => ({
  id: "cs_1", mode: "subscription", client_reference_id: "u1", customer: "cus_1", subscription: "sub_1",
  customer_details: { address: { country: "DE" } }, ...over,
});
let eventNo = 0;
const event = (type, object) => ({ id: `evt_${++eventNo}`, type, data: { object } });

test("Konfiguration vollständig", () => {
  assert.deepEqual(missingConfig(), []);
});

test("Betreiber ist immer frei, Fremde nicht", () => {
  assert.equal(premiumStatus("owner-1", NOW).source, "owner");
  assert.equal(isPremium("owner-1", NOW), true);
  assert.equal(isPremium("niemand", NOW), false);
  assert.equal(isPremium("", NOW), false);
});

test("Freischaltung von Hand: unbefristet, befristet, abgelaufen", () => {
  store.setGrant("g1", "Tester");
  store.setGrant("g2", "bis morgen", NOW + DAY);
  store.setGrant("g3", "abgelaufen", NOW - DAY);
  assert.equal(isPremium("g1", NOW), true);
  assert.equal(isPremium("g2", NOW), true);
  assert.equal(isPremium("g3", NOW), false);
  store.removeGrant("g1");
  assert.equal(isPremium("g1", NOW), false);
});

test("Periodenende: neue API (je Position) und alte (am Abo)", () => {
  assert.equal(periodEndMs({ items: { data: [{ current_period_end: 100 }] } }), 100000);
  assert.equal(periodEndMs({ current_period_end: 200 }), 200000);
  assert.equal(periodEndMs({}), 0);
});

test("Checkout: Twitch-ID geht mit, Rückweg zeigt auf die eigene Seite", async () => {
  const stripe = fakeStripe();
  const svc = createBillingService({ stripe, now: () => NOW });
  const out = await svc.createCheckout({ twitchId: "u9", twitchLogin: "neu", returnPath: "/twitch-tools" });
  assert.equal(out.url, "https://stripe.test/pay");
  const [, p] = stripe.calls[0];
  assert.equal(p.mode, "subscription");
  assert.equal(p.client_reference_id, "u9");
  assert.equal(p.subscription_data.metadata.twitch_id, "u9");
  assert.equal(p.line_items[0].price, "price_x");
  assert.equal(p.billing_address_collection, "required");
  assert.equal(p.success_url, "https://example.test/twitch-tools?abo=ok");
  assert.equal("customer" in p, false, "ohne bekannten Kunden legt Stripe einen neuen an");
});

test("Kauf aus Deutschland schaltet frei; doppelte Zustellung ändert nichts", async () => {
  const stripe = fakeStripe({ sub_1: sub() });
  const svc = createBillingService({ stripe, now: () => NOW });
  const ev = event("checkout.session.completed", session());
  assert.equal(await svc.handleEvent(ev), true);
  assert.equal(await svc.handleEvent(ev), false, "dasselbe Ereignis wird übersprungen");
  assert.equal(store.customerOf("u1"), "cus_1");
  const st = premiumStatus("u1", NOW);
  assert.equal(st.active, true);
  assert.equal(st.source, "subscription");
  assert.equal(st.until, NOW + 20 * DAY);
  // zweiter Kauf nutzt denselben Stripe-Kunden
  await svc.createCheckout({ twitchId: "u1", twitchLogin: "x" });
  assert.equal(stripe.calls.find((c) => c[0] === "checkout")[1].customer, "cus_1");
  // Portal kennt den Kunden
  assert.equal((await svc.createPortal({ twitchId: "u1" })).url, "https://stripe.test/portal");
  assert.equal((await svc.createPortal({ twitchId: "fremd" })).error, "no_customer");
});

test("Kündigung zum Periodenende: bleibt bis dahin aktiv", async () => {
  const svc = createBillingService({ stripe: fakeStripe(), now: () => NOW });
  await svc.handleEvent(event("customer.subscription.updated", sub({ cancel_at_period_end: true })));
  const st = premiumStatus("u1", NOW);
  assert.equal(st.active, true);
  assert.equal(st.cancelAtPeriodEnd, true);
});

test("Zahlung fehlgeschlagen: Schonfrist, danach gesperrt", async () => {
  const svc = createBillingService({ stripe: fakeStripe(), now: () => NOW });
  const end = NOW - DAY; // bezahlter Zeitraum gestern abgelaufen
  await svc.handleEvent(event("customer.subscription.updated", sub({ status: "past_due", items: { data: [{ current_period_end: end / 1000 }] } })));
  assert.equal(isPremium("u1", NOW), true, "innerhalb der Schonfrist");
  assert.equal(isPremium("u1", end + GRACE_MS + 1), false, "nach der Schonfrist");
});

test("Abo beendet: gesperrt; ein altes beendetes Abo überschreibt kein neues", async () => {
  const svc = createBillingService({ stripe: fakeStripe(), now: () => NOW });
  await svc.handleEvent(event("customer.subscription.deleted", sub({ status: "canceled" })));
  assert.equal(isPremium("u1", NOW), false);
  // neues Abo
  await svc.handleEvent(event("customer.subscription.created", sub({ id: "sub_2" })));
  assert.equal(isPremium("u1", NOW), true);
  // verspätetes Ende des ALTEN Abos
  await svc.handleEvent(event("customer.subscription.deleted", sub({ id: "sub_1", status: "canceled" })));
  assert.equal(isPremium("u1", NOW), true);
});

test("Abo ohne mitgegebene Twitch-ID wird über den Kunden zugeordnet", async () => {
  const svc = createBillingService({ stripe: fakeStripe(), now: () => NOW });
  store.linkCustomer("u5", "cus_5", NOW);
  await svc.handleEvent(event("customer.subscription.updated", sub({ id: "sub_5", customer: "cus_5", metadata: {} })));
  assert.equal(isPremium("u5", NOW), true);
});

test("Kauf von außerhalb der EU: Abo beendet, Zahlung erstattet, nichts freigeschaltet", async () => {
  const stripe = fakeStripe({ sub_7: sub({ id: "sub_7", customer: "cus_7", metadata: { twitch_id: "u7" } }) });
  const svc = createBillingService({ stripe, now: () => NOW, log: {} });
  await svc.handleEvent(event("checkout.session.completed", session({ client_reference_id: "u7", customer: "cus_7", subscription: "sub_7", customer_details: { address: { country: "US" } } })));
  assert.equal(isPremium("u7", NOW), false);
  assert.deepEqual(stripe.calls.find((c) => c[0] === "cancel"), ["cancel", "sub_7"]);
  assert.deepEqual(stripe.calls.find((c) => c[0] === "refund"), ["refund", { charge: "ch_1" }]);
});

test("Scheitert die Verarbeitung, kommt das Ereignis beim nächsten Versuch noch einmal dran", async () => {
  const stripe = fakeStripe({});
  let fail = true;
  stripe.subscriptions.retrieve = async () => { if (fail) throw new Error("Netz weg"); return sub({ id: "sub_8", metadata: { twitch_id: "u8" } }); };
  const svc = createBillingService({ stripe, now: () => NOW });
  const ev = event("checkout.session.completed", session({ client_reference_id: "u8", customer: "cus_8", subscription: "sub_8" }));
  await assert.rejects(() => svc.handleEvent(ev));
  assert.equal(isPremium("u8", NOW), false);
  fail = false;
  assert.equal(await svc.handleEvent(ev), true);
  assert.equal(isPremium("u8", NOW), true);
});
