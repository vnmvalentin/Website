// PremiumDialog.jsx — Fenster zum Abschließen des Abos. Zeigt, was enthalten ist, den Preis und
// den Hinweis zum Widerrufsrecht; der Knopf führt zur Bezahlseite von Stripe.
//
// Rechtliches steckt in zwei Dingen, die nicht „wegdesignt“ werden dürfen:
//   - der Knopf nennt die Zahlungspflicht ausdrücklich
//   - ohne angehakte Zustimmung zum sofortigen Beginn geht es nicht weiter (das Backend prüft mit);
//     der Wortlaut passt zur Widerrufsbelehrung unter /widerruf — beide zusammen ändern
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Lock, X } from "lucide-react";
import { PREMIUM_PRICE, startCheckout } from "../utils/billingApi";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string[]} props.includes   was das Abo freischaltet (Stichpunkte)
 * @param {string} props.returnPath   Seite, auf die Stripe zurückschickt (muss das Backend kennen)
 * @param {boolean} [props.configured] false = Bezahlen ist auf dem Server noch nicht eingerichtet
 */
export default function PremiumDialog({ open, onClose, includes, returnPath, configured = true }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Zurücksetzen NUR beim Öffnen. `onClose` darf hier nicht in die Abhängigkeiten: die Eltern
  // übergeben es als neue Funktion bei jedem Zeichnen (das Dashboard zeichnet mehrmals pro
  // Sekunde neu) — der Haken wäre sonst sofort wieder weg.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    setConsent(false);
    setError("");
    setBusy(false);
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const buy = async () => {
    setBusy(true);
    setError("");
    try {
      await startCheckout({ consent, returnPath });
    } catch (e) {
      setError(e.message || "Die Bezahlseite ließ sich nicht öffnen.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/70" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Premium-Abo" className="w-full max-w-md rounded-md bg-[#14141c] border border-white/10 text-white">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-violet-300"><Lock size={12} /> Premium</p>
            <h2 className="mt-1.5 text-xl font-bold">
              {PREMIUM_PRICE} <span className="text-sm font-semibold text-white/50">pro Monat</span>
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="p-1.5 rounded-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <ul className="px-5 mt-4 space-y-2">
          {includes.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-white/85">
              <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-violet-300" />
              {line}
            </li>
          ))}
        </ul>

        <p className="px-5 mt-4 text-xs text-white/50">
          Monatlich kündbar, jederzeit unter „Abo verwalten“. Zum Start nur mit Rechnungsadresse in Deutschland oder der EU.
          Das Abo hängt an deinem Twitch-Konto.
        </p>

        <label className="flex items-start gap-3 mx-5 mt-4 p-3 rounded-sm bg-white/[0.04] cursor-pointer select-none">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-violet-500 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-xs text-white/70">
            Ich verlange ausdrücklich, dass das Abo sofort beginnt. Mir ist bekannt, dass ich bei einem Widerruf innerhalb
            von 14 Tagen den Anteil für die bereits genutzte Zeit zahlen muss.
          </span>
        </label>

        <p className="px-5 mt-3 text-xs text-white/45">
          Es gelten die <a href="/agb" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">AGB</a> und das{" "}
          <a href="/widerruf" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">Widerrufsrecht</a>. Hinweise zur Datenverarbeitung stehen in der{" "}
          <a href="/datenschutz" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">Datenschutzerklärung</a>.
        </p>

        {error && <p className="mx-5 mt-3 text-xs text-red-300">{error}</p>}
        {!configured && <p className="mx-5 mt-3 text-xs text-amber-300">Bezahlen ist noch nicht eingerichtet.</p>}

        <div className="flex items-center justify-end gap-2 px-5 py-5">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-md text-sm font-bold text-white/60 hover:text-white hover:bg-white/5 transition-colors">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={buy}
            disabled={!consent || busy || !configured}
            className="h-10 px-4 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-sm font-bold text-white transition-colors"
          >
            {busy ? "Öffne Bezahlseite…" : "Zahlungspflichtig abonnieren"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
