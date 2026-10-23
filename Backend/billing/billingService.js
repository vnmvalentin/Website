// billingService.js — alles, was mit Stripe spricht: Bezahlseite öffnen, Kundenportal öffnen,
// Webhook-Ereignisse in den Abo-Stand übersetzen. Der Stripe-Client ist austauschbar
// (createBillingService({ stripe })), damit die Tests ohne Netz und ohne Schlüssel laufen.
//
// Einstellungen in .env:
//   STRIPE_SECRET_KEY       geheimer Schlüssel (sk_test_… zum Ausprobieren, sk_live_… im Betrieb)
//   STRIPE_WEBHOOK_SECRET   Signatur-Geheimnis des Webhooks (whsec_…)
//   STRIPE_PRICE_PREMIUM    Preis-ID des Monats-Abos (price_…) — legt tools/setupStripe.js an
//   FRONTEND_URL            wohin Stripe nach dem Bezahlen zurückschickt
//
// Verkauft wird zum Start nur nach Deutschland und in die EU (Umsatzsteuer). Stripe Checkout
// kann die Rechnungsadresse nicht auf Länder einschränken — deshalb wird sie verlangt und beim
// Abschluss geprüft: liegt sie außerhalb, wird das Abo sofort beendet und die Zahlung erstattet.
const store = require("./billingStore");

const PLAN_PREMIUM = "premium";

// EU-Mitgliedstaaten (ISO 3166-1 alpha-2)
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const env = () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  pricePremium: process.env.STRIPE_PRICE_PREMIUM || "",
  frontendUrl: String(process.env.FRONTEND_URL || "").replace(/\/+$/, ""),
});

/** Fehlt etwas in .env? Dann bleibt das Abo abgeschaltet statt halb zu funktionieren. */
function missingConfig() {
  const e = env();
  return [
    !e.secretKey && "STRIPE_SECRET_KEY",
    !e.webhookSecret && "STRIPE_WEBHOOK_SECRET",
    !e.pricePremium && "STRIPE_PRICE_PREMIUM",
    !e.frontendUrl && "FRONTEND_URL",
  ].filter(Boolean);
}

let realStripe = null;
function defaultStripe() {
  if (!realStripe) {
    const Stripe = require("stripe");
    realStripe = new Stripe(env().secretKey);
  }
  return realStripe;
}

/** Ende des bezahlten Zeitraums in ms. Neuere API-Versionen führen es je Abo-Position, ältere am Abo selbst. */
function periodEndMs(sub) {
  const sec = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0;
  return Number(sec) * 1000;
}

function createBillingService({ stripe, now = () => Date.now(), log = console } = {}) {
  const api = () => stripe || defaultStripe();

  /** Bezahlseite für das Monats-Abo. Liefert die Adresse, auf die der Browser wechselt. */
  async function createCheckout({ twitchId, twitchLogin, returnPath = "/twitch-tools" }) {
    const e = env();
    const id = String(twitchId);
    const existing = store.customerOf(id);
    const back = `${e.frontendUrl}${returnPath.startsWith("/") ? returnPath : "/twitch-tools"}`;
    const session = await api().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: e.pricePremium, quantity: 1 }],
      // Über diese Angaben findet der Webhook zurück zur Twitch-ID
      client_reference_id: id,
      metadata: { twitch_id: id, twitch_login: String(twitchLogin || "") },
      subscription_data: { metadata: { twitch_id: id, plan: PLAN_PREMIUM } },
      ...(existing ? { customer: existing } : {}),
      billing_address_collection: "required",
      locale: "de",
      success_url: `${back}?abo=ok`,
      cancel_url: `${back}?abo=abbruch`,
    });
    return { url: session.url };
  }

  /** Stripe-Kundenportal: kündigen, Zahlungsart ändern, Rechnungen ansehen. */
  async function createPortal({ twitchId, returnPath = "/twitch-tools" }) {
    const customer = store.customerOf(twitchId);
    if (!customer) return { error: "no_customer" };
    const session = await api().billingPortal.sessions.create({
      customer,
      return_url: `${env().frontendUrl}${returnPath.startsWith("/") ? returnPath : "/twitch-tools"}`,
    });
    return { url: session.url };
  }

  /** Stand eines Stripe-Abos in die eigene Tabelle schreiben. */
  function saveSubscription(twitchId, sub) {
    store.saveSubscription({
      twitchId,
      subscriptionId: sub.id,
      plan: sub.metadata?.plan || PLAN_PREMIUM,
      status: sub.status,
      currentPeriodEnd: periodEndMs(sub),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      updatedAt: now(),
    });
  }

  /** Zu welcher Twitch-ID gehört dieses Abo? Erst die mitgegebene Angabe, sonst über den Kunden. */
  function twitchIdOfSubscription(sub) {
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    return sub.metadata?.twitch_id || (customer ? store.twitchOfCustomer(customer) : null);
  }

  /** Kauf von außerhalb der EU: Abo sofort beenden und die letzte Zahlung erstatten. */
  async function rejectOutsideEu(session, country) {
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    log.warn?.(`[billing] Kauf aus ${country || "unbekanntem Land"} abgelehnt (nur DE/EU) — Kunde ${customer}`);
    if (subId) await api().subscriptions.cancel(subId);
    if (customer) {
      const charges = await api().charges.list({ customer, limit: 1 });
      const charge = charges.data?.[0];
      if (charge && charge.paid && !charge.refunded) await api().refunds.create({ charge: charge.id });
    }
  }

  async function onCheckoutCompleted(session) {
    const twitchId = session.client_reference_id || session.metadata?.twitch_id;
    if (!twitchId) return;
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (customer) store.linkCustomer(twitchId, customer, now());

    const country = String(session.customer_details?.address?.country || "").toUpperCase();
    if (!EU_COUNTRIES.has(country)) {
      await rejectOutsideEu(session, country);
      return;
    }
    if (session.mode !== "subscription" || !session.subscription) return;
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const sub = await api().subscriptions.retrieve(subId);
    saveSubscription(twitchId, sub);
  }

  function onSubscriptionChanged(sub) {
    const twitchId = twitchIdOfSubscription(sub);
    if (!twitchId) return;
    // Ein altes, beendetes Abo darf ein inzwischen neu abgeschlossenes nicht überschreiben
    const known = store.subscriptionOf(twitchId);
    const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
    if (known && known.stripe_subscription_id !== sub.id && ended) return;
    saveSubscription(twitchId, sub);
  }

  /**
   * Ein geprüftes Stripe-Ereignis verarbeiten. Stripe stellt Ereignisse mehrfach und nicht
   * unbedingt in Reihenfolge zu — doppelte werden übersprungen. Als verarbeitet gilt ein
   * Ereignis erst NACH dem Erfolg: scheitert die Verarbeitung, kommt es bei Stripes nächstem
   * Versuch noch einmal dran.
   * @returns {boolean} true, wenn das Ereignis (neu) verarbeitet wurde
   */
  async function handleEvent(event) {
    if (!event || !event.id || store.eventSeen(event.id)) return false;
    const obj = event.data?.object;
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(obj);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        onSubscriptionChanged(obj);
        break;
      default:
        break;
    }
    store.markEvent(event.id, now());
    return true;
  }

  /** Signatur prüfen und das Ereignis auspacken (wirft bei falscher Signatur). */
  function parseWebhook(rawBody, signature) {
    return api().webhooks.constructEvent(rawBody, signature, env().webhookSecret);
  }

  return { createCheckout, createPortal, handleEvent, parseWebhook };
}

module.exports = { createBillingService, missingConfig, EU_COUNTRIES, PLAN_PREMIUM, periodEndMs };
