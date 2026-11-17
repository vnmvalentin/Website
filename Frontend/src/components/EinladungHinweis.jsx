// components/EinladungHinweis.jsx — schmaler Hinweis oben auf der Seite für Eingeladene (Layout.jsx).
// Merkt den Code aus /?einladung=…, zeigt ohne Anmeldung „X hat dich eingeladen“ mit Anmelde-Knopf und nimmt die
// Einladung an, sobald ein Konto da ist (utils/einladung.js). Danach einmal „angenommen“, sonst nichts.
import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { useKonto, oeffneAnmeldung } from "../utils/konto.js";
import { useLanguage } from "../i18n/language.js";
import { merkeAusAdresse, offeneEinladung, nimmEinladungAn } from "../utils/einladung.js";
import { EINLADUNG_TEXTE } from "./einladungTexte.js";

export default function EinladungHinweis() {
  const { lang } = useLanguage({ supported: EINLADUNG_TEXTE.langs });
  const t = EINLADUNG_TEXTE.dict(lang);
  const { konto, geladen } = useKonto();
  const [code, setCode] = useState(() => { merkeAusAdresse(); return offeneEinladung(); });
  const [name, setName] = useState("");
  const [stand, setStand] = useState(""); // "" | "ok"
  const [zu, setZu] = useState(false);

  // Wer eingeladen hat (nur für den Hinweis)
  useEffect(() => {
    if (!code || konto) return undefined;
    let lebt = true;
    fetch(`/api/einladung/info/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (lebt) setName(d?.name || ""); })
      .catch(() => {});
    return () => { lebt = false; };
  }, [code, konto]);

  // Angemeldet (auch als Gast) → annehmen
  useEffect(() => {
    if (!geladen || !konto || !code) return;
    let lebt = true;
    nimmEinladungAn().then((r) => {
      if (!lebt || r === "fehler" || r === null) return;
      setCode(null);
      if (r === "ok") setStand("ok");
    });
    return () => { lebt = false; };
  }, [geladen, konto, code]);

  if (zu || (!stand && (!code || !geladen || konto))) return null;
  return (
    <div className="w-full max-w-7xl mx-auto mb-4">
      <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
        <Gift size={18} className="text-accent-soft shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0 text-sm">
          {stand === "ok" ? (
            <p className="text-white/85">{t.angenommen}</p>
          ) : (
            <>
              <p className="font-semibold text-white">{name ? t.eingeladenVon(name) : t.eingeladen}</p>
              <p className="text-white/65 mt-0.5">{t.anmeldenText}</p>
            </>
          )}
        </div>
        {stand !== "ok" && (
          <button type="button" onClick={oeffneAnmeldung}
            className="shrink-0 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-3 py-2">{t.anmelden}</button>
        )}
        <button type="button" onClick={() => setZu(true)} aria-label={t.ausblenden} className="shrink-0 p-1 rounded-md text-white/55 hover:text-white hover:bg-white/5"><X size={16} /></button>
      </div>
    </div>
  );
}
