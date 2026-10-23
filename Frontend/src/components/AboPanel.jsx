// AboPanel.jsx — Stand des Premium-Abos mit den Knöpfen zum Abschließen, Verwalten und Kündigen.
// Sitzt im Profil und auf der Seite /abo. Verwalten und Kündigen laufen über das Kundenportal
// von Stripe; abgeschlossen wird über den PremiumDialog.
//
// Kommt man von der Bezahlseite zurück (?abo=ok), ist das Abo beim Backend oft noch nicht
// angekommen — Stripe meldet es per Webhook. Deshalb wird der Stand dann kurz nachgefragt.
import React, { useEffect, useState } from "react";
import PremiumDialog from "./PremiumDialog";
import { PREMIUM_INCLUDES, getBillingStatus, openPortal, untilText } from "../utils/billingApi";

const STRINGS = {
  de: {
    loading: "Lade…",
    owner: "Du bist der Betreiber — alles ist ohne Abo freigeschaltet.",
    grant: (until) => `Dein Zugang wurde freigeschaltet${until ? ` (bis ${until})` : ""}.`,
    canceled: (until) => `Gekündigt — dein Zugang läuft noch bis ${until}.`,
    active: (until) => `Aktiv. Nächste Abbuchung am ${until}.`,
    none: "Du hast kein laufendes Abo.",
    manage: "Abo verwalten oder kündigen",
    opening: "Öffne…",
    subscribe: "Abo abschließen",
    portalHint: "Kündigen, Zahlungsart ändern und Rechnungen findest du im Kundenportal von Stripe.",
    pending: "Danke! Dein Abo wird gerade freigeschaltet …",
    late: "Die Zahlung ist noch nicht bestätigt. Lade die Seite in einer Minute neu.",
  },
  en: {
    loading: "Loading…",
    owner: "You run this site — everything is unlocked without a subscription.",
    grant: (until) => `Your access has been unlocked${until ? ` (until ${until})` : ""}.`,
    canceled: (until) => `Canceled — your access runs until ${until}.`,
    active: (until) => `Active. Next charge on ${until}.`,
    none: "You have no active subscription.",
    manage: "Manage or cancel subscription",
    opening: "Opening…",
    subscribe: "Subscribe",
    portalHint: "Cancel, change your payment method and find invoices in Stripe's customer portal.",
    pending: "Thanks! Your subscription is being unlocked …",
    late: "The payment has not been confirmed yet. Reload the page in a minute.",
  },
};

/**
 * @param {object} props
 * @param {string} props.returnPath  Seite, auf die Stripe zurückschickt (muss das Backend kennen: billingRoutes.js)
 * @param {"de"|"en"} [props.lang]
 */
export default function AboPanel({ returnPath, lang = "de" }) {
  const t = STRINGS[lang] || STRINGS.de;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const params = new URLSearchParams(window.location.search);
    const back = params.get("abo");
    if (back) {
      params.delete("abo");
      window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    }
    let tries = 0;
    const load = () => {
      getBillingStatus()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          if (back !== "ok") return;
          if (s.premium?.active) {
            setNote("");
          } else if (tries < 10) {
            tries += 1;
            setNote(t.pending);
            timer = setTimeout(load, 2000);
          } else {
            setNote(t.late);
          }
        })
        .catch((e) => { if (alive) setError(e.message); });
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const portal = async () => {
    setBusy(true);
    setError("");
    try {
      await openPortal(returnPath);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!status) return <p className="text-sm text-white/40">{error || t.loading}</p>;

  const p = status.premium;
  let line = t.none;
  if (p.source === "owner") line = t.owner;
  else if (p.source === "grant") line = t.grant(untilText(p.until));
  else if (p.active && p.cancelAtPeriodEnd) line = t.canceled(untilText(p.until));
  else if (p.active) line = t.active(untilText(p.until));

  return (
    <>
      <p className="text-sm text-white/85">{line}</p>
      {note && <p className="mt-2 text-xs text-violet-200">{note}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {status.hasCustomer && (
          <button type="button" onClick={portal} disabled={busy} className="h-10 px-4 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-sm font-bold text-white transition-colors">
            {busy ? t.opening : t.manage}
          </button>
        )}
        {!p.active && (
          <button type="button" onClick={() => setDialog(true)} className={`h-10 px-4 rounded-md text-sm font-bold text-white transition-colors ${status.hasCustomer ? "border border-white/15 hover:bg-white/5" : "bg-violet-600 hover:bg-violet-500"}`}>
            {t.subscribe}
          </button>
        )}
      </div>
      {status.hasCustomer && <p className="mt-3 text-xs text-white/40">{t.portalHint}</p>}
      <PremiumDialog open={dialog} onClose={() => setDialog(false)} includes={PREMIUM_INCLUDES} returnPath={returnPath} configured={status.configured !== false} />
    </>
  );
}
