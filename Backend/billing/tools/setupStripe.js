// setupStripe.js — legt in Stripe einmalig das Produkt und den Monatspreis des Abos an und gibt
// die Preis-ID aus, die in .env als STRIPE_PRICE_PREMIUM gehört.
//
//   node billing/tools/setupStripe.js                    legt an (4,00 € pro Monat, Endpreis inkl. Steuer)
//   node billing/tools/setupStripe.js --cent 500         anderer Preis in Cent
//   node billing/tools/setupStripe.js --pruefen          nur nachsehen: Preis, Steuer-Verhalten, Stripe-Tax-Einstellungen
//   node billing/tools/setupStripe.js --steuer-inklusive vorhandenen Preis auf „inklusive Steuer“ festlegen
//
// Arbeitet mit dem Schlüssel aus .env: mit sk_test_… entsteht alles im Testmodus, mit sk_live_…
// im echten Konto. Läuft das Skript zweimal, erkennt es den vorhandenen Preis am lookup_key und
// legt nichts doppelt an.
//
// Steuer: Der Preis ist der Endpreis inkl. Umsatzsteuer (so steht es in den AGB). Dafür braucht der Preis
// tax_behavior "inclusive" — Stripe lässt das nur EINMAL festlegen (danach unveränderlich). Ein Preis mit
// "unspecified" folgt dem Standard aus den Stripe-Tax-Einstellungen.
require("dotenv").config({ quiet: true });
const Stripe = require("stripe");

const LOOKUP_KEY = "premium_monatlich";
const centArg = process.argv.indexOf("--cent");
const cent = centArg > -1 ? Math.round(Number(process.argv[centArg + 1])) : 400;
const nurPruefen = process.argv.includes("--pruefen");
const steuerInklusive = process.argv.includes("--steuer-inklusive");

const VERHALTEN = {
  inclusive: "inklusive Steuer (Endpreis) — richtig",
  exclusive: "ZUZÜGLICH Steuer — falsch für Endpreise, lässt sich nicht mehr ändern (neuen Preis anlegen)",
  unspecified: "nicht festgelegt — folgt dem Standard aus den Stripe-Tax-Einstellungen",
};

/** Stripe-Tax-Einstellungen und Registrierungen anzeigen (nur lesen; fehlende Rechte des Schlüssels werden gemeldet) */
async function zeigeSteuerEinstellungen(stripe) {
  try {
    const s = await stripe.tax.settings.retrieve();
    console.log(`Stripe Tax: ${s.status === "active" ? "aktiv" : `nicht aktiv (${s.status})`}`);
    console.log(`  Standard-Steuerverhalten: ${s.defaults?.tax_behavior || "nicht gesetzt"}`);
    console.log(`  Standard-Steuercode:      ${s.defaults?.tax_code || "nicht gesetzt"}`);
    if (s.head_office?.address?.country) console.log(`  Firmensitz:               ${s.head_office.address.country}`);
  } catch (e) {
    console.log(`Stripe Tax: nicht lesbar (${e.message})`);
  }
  try {
    const r = await stripe.tax.registrations.list({ status: "active", limit: 20 });
    const liste = r.data.map((x) => `${x.country}${x.country_options?.[x.country.toLowerCase()]?.type ? ` (${x.country_options[x.country.toLowerCase()].type})` : ""}`);
    console.log(`  Aktive Registrierungen:   ${liste.length ? liste.join(", ") : "KEINE — ohne Registrierung berechnet Stripe 0 € Steuer"}`);
  } catch (e) {
    console.log(`  Registrierungen: nicht lesbar (${e.message})`);
  }
}

(async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY fehlt in Backend/.env");
  if (!Number.isInteger(cent) || cent < 50) throw new Error("Preis in Cent muss eine ganze Zahl ab 50 sein");
  const stripe = new Stripe(key);
  const mode = /^(sk|rk)_live_/.test(key) ? "ECHTBETRIEB" : "Testmodus";

  const found = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  if (found.data.length) {
    let p = found.data[0];
    console.log(`[${mode}] Preis gibt es schon: ${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()} pro Monat`);
    console.log(`STRIPE_PRICE_PREMIUM=${p.id}`);
    if (p.id !== process.env.STRIPE_PRICE_PREMIUM) console.log("  Achtung: In .env steht eine andere Preis-ID.");
    if (steuerInklusive && p.tax_behavior === "unspecified") {
      p = await stripe.prices.update(p.id, { tax_behavior: "inclusive" });
      console.log("  Steuer-Verhalten jetzt festgelegt.");
    }
    console.log(`  Steuer-Verhalten: ${VERHALTEN[p.tax_behavior] || p.tax_behavior}`);
    if (!steuerInklusive && p.tax_behavior === "unspecified") console.log("  Festlegen mit: --steuer-inklusive");
    await zeigeSteuerEinstellungen(stripe);
    return;
  }
  if (nurPruefen) {
    console.log(`[${mode}] Kein aktiver Preis mit lookup_key „${LOOKUP_KEY}“ — angelegt wird nur ohne --pruefen.`);
    await zeigeSteuerEinstellungen(stripe);
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
    tax_behavior: "inclusive",
    lookup_key: LOOKUP_KEY,
  });
  console.log(`[${mode}] Angelegt: ${(cent / 100).toFixed(2)} EUR pro Monat (inkl. Steuer)`);
  console.log(`STRIPE_PRICE_PREMIUM=${price.id}`);
})().catch((e) => {
  console.error("Fehler:", e.message);
  process.exit(1);
});
