// API-Client für das Abo (/api/billing, Backend/billing). Bezahlt wird bei Stripe: checkout und
// portal liefern eine Adresse, auf die der Browser wechselt.
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Nur die Anzeige — abgerechnet wird der Preis, der in Stripe hinterlegt ist (STRIPE_PRICE_PREMIUM).
// Ändert sich der Preis dort, muss diese Zeile mit.
export const PREMIUM_PRICE = "4 €";

// Was das Abo freischaltet — dieselbe Liste zeigen die Seite /abo und der Dialog im Twitch-Dashboard
export const PREMIUM_INCLUDES = [
  "Hype Train: der Zug fährt durchs Bild und wächst mit jedem Level",
  "Raid-Ansturm: die Raider laufen durch den Stream",
  "Flugzeug mit Banner",
  "Murmelbahn: Rennen für den Chat, auch per Kanalpunkte",
];

/** { configured, premium: { active, source, until, cancelAtPeriodEnd, status }, hasCustomer } */
export const getBillingStatus = () => apiFetch("/api/billing/status");

/** Öffnet die Bezahlseite. `consent`: der Hinweis zum Widerrufsrecht wurde angehakt. */
export async function startCheckout({ consent, returnPath }) {
  const { url } = await apiFetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({ consent, returnPath }) });
  window.location.assign(url);
}

/** Öffnet das Stripe-Kundenportal (kündigen, Zahlungsart, Rechnungen). */
export async function openPortal(returnPath) {
  const { url } = await apiFetch("/api/billing/portal", { method: "POST", body: JSON.stringify({ returnPath }) });
  window.location.assign(url);
}

/** „bis 14.11.2026“ aus dem Ende des bezahlten Zeitraums (ms), leer wenn unbefristet */
export const untilText = (ms) => (ms ? new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
