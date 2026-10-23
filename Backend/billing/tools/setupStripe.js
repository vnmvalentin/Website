// setupStripe.js — legt in Stripe einmalig das Produkt und den Monatspreis des Abos an und gibt
// die Preis-ID aus, die in .env als STRIPE_PRICE_PREMIUM gehört.
//
//   node billing/tools/setupStripe.js            legt an (4,00 € pro Monat)
//   node billing/tools/setupStripe.js --cent 500 anderer Preis in Cent
//
// Arbeitet mit dem Schlüssel aus .env: mit sk_test_… entsteht alles im Testmodus, mit sk_live_…
// im echten Konto. Läuft das Skript zweimal, erkennt es den vorhandenen Preis am lookup_key und
// legt nichts doppelt an.
require("dotenv").config({ quiet: true });
const Stripe = require("stripe");

const LOOKUP_KEY = "premium_monatlich";
const centArg = process.argv.indexOf("--cent");
const cent = centArg > -1 ? Math.round(Number(process.argv[centArg + 1])) : 400;

(async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY fehlt in Backend/.env");
  if (!Number.isInteger(cent) || cent < 50) throw new Error("Preis in Cent muss eine ganze Zahl ab 50 sein");
  const stripe = new Stripe(key);
  const mode = key.startsWith("sk_live_") ? "ECHTBETRIEB" : "Testmodus";

  const found = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  if (found.data.length) {
    const p = found.data[0];
    console.log(`[${mode}] Preis gibt es schon: ${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()} pro Monat`);
    console.log(`STRIPE_PRICE_PREMIUM=${p.id}`);
    return;
  }

  const product = await stripe.products.create({
    name: "vnmvalentin Premium",
    description: "Schaltet die Stream-Szenen der Twitch-Overlay-Tools frei: Hype Train, Raid-Ansturm, Flugzeug-Banner, Murmelbahn.",
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: cent,
    recurring: { interval: "month" },
    lookup_key: LOOKUP_KEY,
  });
  console.log(`[${mode}] Angelegt: ${(cent / 100).toFixed(2)} EUR pro Monat`);
  console.log(`STRIPE_PRICE_PREMIUM=${price.id}`);
})().catch((e) => {
  console.error("Fehler:", e.message);
  process.exit(1);
});
