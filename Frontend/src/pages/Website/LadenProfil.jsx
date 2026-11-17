// pages/Website/LadenProfil.jsx — Abschnitt „Unterstützen“ im Profil: eigener Beitrag (falls vorhanden), die gekauften
// Designs mit dem Weg ins Spiel und der Weg zum Laden (/laden). Nur zu sehen, wenn verkauft werden darf (Profile.jsx
// prüft salesVisible).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ArrowRight } from "lucide-react";
import { Section, Button } from "../../components/ui";
import { holeKatalog, holeMeinStand, euro, nachSpiel } from "../../utils/laden.js";
import { LADEN_TEXTE } from "./ladenTexte.js";

export default function LadenProfil({ lang, kontoId }) {
  const t = LADEN_TEXTE.dict(lang);
  const [unterstuetzer, setUnterstuetzer] = useState(null);
  const [designs, setDesigns] = useState([]); // nach Spiel gruppiert, nur gekaufte

  useEffect(() => {
    let alive = true;
    Promise.all([holeMeinStand(), holeKatalog().catch(() => null)]).then(([mein, katalog]) => {
      if (!alive) return;
      setUnterstuetzer(mein.unterstuetzer || null);
      const besitz = new Set(mein.besitz || []);
      setDesigns(nachSpiel((katalog?.artikel || []).filter((a) => besitz.has(a.id)), katalog?.spiele));
    }).catch(() => {});
    return () => { alive = false; };
  }, [kontoId]);

  return (
    <Section className="lg:col-span-2" icon={Heart} title={t.profilTitel} description={t.profilText}>
      {unterstuetzer && <p className="mb-4 text-sm text-white/85">{t.profilUnterstuetzer(euro(unterstuetzer.summeCent, lang))}</p>}
      {designs.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-2">{t.profilDesigns}</h3>
          <ul className="space-y-2">
            {designs.map((g) => (
              <li key={g.spiel} className="flex flex-wrap items-center gap-3 rounded-md bg-white/[0.03] border border-line p-2.5">
                <span className="flex -space-x-2 shrink-0">
                  {g.artikel.map((a) => a.bild && (
                    <img key={a.id} src={a.bild} alt="" loading="lazy" className="w-10 h-10 rounded-md object-cover border border-line bg-black/30" />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{g.artikel.map((a) => a.name[lang] || a.name.de).join(", ")}</span>
                  <span className="block text-xs text-white/55">{g.info.wo ? (g.info.wo[lang] || g.info.wo.de) : (g.info.name[lang] || g.info.name.de)}</span>
                </span>
                <Link to={g.info.pfad} className="inline-flex items-center gap-1 text-xs font-semibold text-accent-soft hover:text-white transition-colors shrink-0">
                  {t.spielOeffnen} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button to="/laden" variant="secondary" icon={ArrowRight}>{t.zumLaden}</Button>
    </Section>
  );
}
