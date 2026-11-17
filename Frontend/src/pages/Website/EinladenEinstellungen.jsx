// pages/Website/EinladenEinstellungen.jsx — „Freunde einladen“ im Profil: eigener Link (kopieren/teilen), wie viele
// Freunde dabei sind und die Abzeichen-Stufen. Server: GET /api/einladung/mein (Backend/einladung/).
import { useEffect, useState } from "react";
import { Award, Check, Copy, Share2, UserPlus } from "lucide-react";
import { Section, Button } from "../../components/ui";
import { EINLADUNG_TEXTE } from "../../components/einladungTexte.js";
import { einladungsLink } from "../../utils/einladung.js";

export default function EinladenEinstellungen({ lang, kontoId }) {
  const t = EINLADUNG_TEXTE.dict(lang);
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    let lebt = true;
    fetch("/api/einladung/mein", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((x) => { if (lebt) setD(x); })
      .catch(() => { if (lebt) setFehler(true); });
    return () => { lebt = false; };
  }, [kontoId]);

  if (fehler) {
    return <Section className="lg:col-span-2" icon={UserPlus} title={t.titel}><p className="text-sm text-red-300">{t.ladeFehler}</p></Section>;
  }
  if (!d) return null;
  const link = einladungsLink(d.code);
  const mobil = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && navigator.share;

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* der Link steht im Feld */ }
  };
  const teilen = async () => {
    try { await navigator.share({ title: t.teilenTitel, url: link }); } catch { /* abgebrochen */ }
  };

  return (
    <Section className="lg:col-span-2" icon={UserPlus} title={t.titel} description={t.hinweis}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-white/70 mb-1.5">{t.deinLink}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t.deinLink}
              className="flex-1 min-w-[14rem] h-10 rounded-lg bg-black/30 border border-line px-3 text-sm text-white/80 font-mono" />
            <Button variant="secondary" icon={kopiert ? Check : Copy} onClick={kopieren}>{kopiert ? t.kopiert : t.kopieren}</Button>
            {mobil && <Button variant="secondary" icon={Share2} onClick={teilen}>{t.teilen}</Button>}
          </div>
          <p className="text-xs text-white/50 mt-2">
            {t.dabei(d.bestaetigt)}{d.wartend > 0 ? ` · ${t.wartet(d.wartend)}` : ""}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-2">{t.abzeichen}</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {d.stufen.map((s) => {
              const ok = d.bestaetigt >= s.ab;
              return (
                <li key={s.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ok ? "border-amber-400/30 bg-amber-400/10" : "border-line bg-black/20"}`}>
                  <Award size={18} className={ok ? "text-amber-300" : "text-white/25"} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${ok ? "text-amber-50" : "text-white/60"}`}>{t.namen[s.id] || s.id}</span>
                    <span className="block text-xs text-white/55">{ok ? t.erreicht : `${t.stufe(s.ab)} · ${Math.min(d.bestaetigt, s.ab)}/${s.ab}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {d.eingeladen && <p className="text-xs text-white/55 mt-2">{t.selbstEingeladen}</p>}
        </div>
      </div>
    </Section>
  );
}
