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

// ── Einmalkäufe des Ladens (laden/) ─────────────────────────────────────────────────────────────────────────────
// Bezahlseiten mit metadata.art = "laden" gehören nicht zum Abo: Sie hängen am Konto (nicht an der Twitch-ID) und
// werden hier nur an den Laden weitergereicht — nach derselben EU-Prüfung (außerhalb: Zahlung erstatten).
// Den Laden verbindet index.js (registriereEinmalkauf); ohne ihn bleiben solche Ereignisse liegen.
let einmalkauf = null;
function registriereEinmalkauf(fn) {
  einmalkauf = typeof fn === "function" ? fn : null;
}
// Volle Erstattung (charge.refunded) oder Rückbuchung über die Bank (charge.dispute.created) → ({ paymentIntent, grund }).
// Der Laden findet die Zahlung selbst; Abo-Zahlungen kennt er nicht (Abo beenden bleibt Handarbeit im Dashboard).
let ruecknahme = null;
function registriereRuecknahme(fn) {
  ruecknahme = typeof fn === "function" ? fn : null;
}
const idVon = (x) => (typeof x === "string" ? x : x?.id || null);

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
      // Stripe Tax rechnet die Umsatzsteuer aus der Rechnungsadresse heraus (Preis ist Endpreis: tax_behavior
      // "inclusive" am Preis, siehe tools/setupStripe.js) und führt sie im Abo weiter. Ein schon bekannter Kunde
      // braucht die neu eingegebene Adresse gespeichert, sonst lehnt Stripe die Steuerberechnung ab.
      automatic_tax: { enabled: true },
      ...(existing ? { customer: existing, customer_update: { address: "auto" } } : {}),
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

  /** Einmalkauf des Ladens: EU prüfen (sonst erstatten), erst bei bezahlt weiterreichen */
  async function onLadenCheckout(session) {
    const country = String(session.customer_details?.address?.country || "").toUpperCase();
    if (!EU_COUNTRIES.has(country)) {
      log.warn?.(`[billing] Ladenkauf aus ${country || "unbekanntem Land"} abgelehnt (nur DE/EU)`);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (pi && session.payment_status === "paid") await api().refunds.create({ payment_intent: pi });
      return;
    }
    // Zahlarten mit Verzögerung (z. B. Überweisung) kommen später als async_payment_succeeded
    if (session.payment_status !== "paid") return;
    if (!einmalkauf) throw new Error("Laden nicht verbunden");
    await einmalkauf(session);
  }

  async function onCheckoutCompleted(session) {
    if (session.metadata?.art === "laden") return onLadenCheckout(session);
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
      case "checkout.session.async_payment_succeeded":
        await onCheckoutCompleted(obj);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        onSubscriptionChanged(obj);
        break;
      case "charge.refunded":
        // Nur volle Erstattungen nehmen den Kauf zurück; eine Teilerstattung (Kulanz) lässt ihn bestehen
        if (obj?.refunded && ruecknahme) await ruecknahme({ paymentIntent: idVon(obj.payment_intent), grund: "erstattet" });
        break;
      case "charge.dispute.created":
        if (ruecknahme) await ruecknahme({ paymentIntent: idVon(obj?.payment_intent), grund: "rueckbuchung" });
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

  return { createCheckout, createPortal, handleEvent, parseWebhook, api };
}

/** Stripe-Zugang ist eingerichtet, wenn Schlüssel, Webhook-Geheimnis und Adresse da sind (der Laden braucht keinen Abo-Preis) */
const missingStripeConfig = () => missingConfig().filter((k) => k !== "STRIPE_PRICE_PREMIUM");

module.exports = {
  createBillingService, missingConfig, missingStripeConfig, EU_COUNTRIES, PLAN_PREMIUM, periodEndMs, registriereEinmalkauf, registriereRuecknahme, defaultStripe,
};
