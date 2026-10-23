// entitlements.js — die eine Stelle, die beantwortet: Hat diese Twitch-ID das Abo?
// Alle Schranken (Twitch-Tools-Szenen, später Skins) fragen hier — nie direkt bei Stripe und
// nie in der Datenbank.
//
// Frei sind, in dieser Reihenfolge:
//   1. der Betreiber selbst (STREAMER_TWITCH_ID)
//   2. wer von Hand freigeschaltet wurde (Tabelle grants, optional befristet)
//   3. wer ein laufendes Abo hat
const store = require("./billingStore");

// Stripe meldet eine fehlgeschlagene Verlängerung als "past_due" und versucht es noch mehrmals.
// So lange bleibt das Abo nutzbar — ein Zahlungsproblem soll nicht mitten im Stream die Szenen
// ausknipsen. Länger als ein paar Tage über das bezahlte Ende hinaus gilt es aber nicht.
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const LIVE_STATUS = new Set(["active", "trialing", "past_due"]);

const ownerId = () => String(process.env.STREAMER_TWITCH_ID || "");

/**
 * @returns {{ active: boolean, source: 'owner'|'grant'|'subscription'|null, until: number, cancelAtPeriodEnd: boolean, status: string|null }}
 *   until: Ende des bezahlten Zeitraums in ms (0 = unbefristet oder kein Abo)
 */
function premiumStatus(twitchId, now = Date.now()) {
  const id = String(twitchId || "");
  const none = { active: false, source: null, until: 0, cancelAtPeriodEnd: false, status: null };
  if (!id) return none;
  if (ownerId() && id === ownerId()) return { ...none, active: true, source: "owner" };

  const grant = store.grantOf(id);
  if (grant && (!grant.until || grant.until > now)) return { ...none, active: true, source: "grant", until: grant.until || 0 };

  const sub = store.subscriptionOf(id);
  if (!sub) return none;
  const until = Number(sub.current_period_end) || 0;
  const active = LIVE_STATUS.has(sub.status) && until + GRACE_MS > now;
  return { active, source: active ? "subscription" : null, until, cancelAtPeriodEnd: !!sub.cancel_at_period_end, status: sub.status };
}

const isPremium = (twitchId, now) => premiumStatus(twitchId, now).active;

module.exports = { premiumStatus, isPremium, GRACE_MS };
