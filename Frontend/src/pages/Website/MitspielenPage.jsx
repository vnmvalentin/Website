// pages/Website/MitspielenPage.jsx — /mitspielen: der aktuelle Stream-Raum. Im Modus „offen“ ein Knopf direkt in den
// Raum; im Modus „Warteschlange“ anstellen, Platz sehen, und wer aufgerufen ist, bekommt den Link (dazu Glocke und
// Mitteilung). Stand aus utils/mitspielen.js, Server Backend/mitspielen/.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gamepad2, Users, Bell } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Card, Button } from "../../components/ui";
import { useLanguage } from "../../i18n/language.js";
import { useKonto, oeffneAnmeldung } from "../../utils/konto.js";
import { useMitspielen, stelleAn, verlasse } from "../../utils/mitspielen.js";
import { MITSPIELEN_TEXTE } from "../../components/mitspielenTexte.js";

export default function MitspielenPage() {
  const { lang } = useLanguage({ supported: MITSPIELEN_TEXTE.langs });
  const t = MITSPIELEN_TEXTE.dict(lang);
  const { konto } = useKonto();
  const m = useMitspielen();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");

  const aktion = async (fn) => {
    setBusy(true);
    setFehler("");
    try { await fn(); } catch { setFehler(t.fehler); }
    setBusy(false);
  };

  const seo = <SEO title={t.metaTitel} description={t.metaBeschreibung} path="/mitspielen" lang={lang} />;
  if (!m.geladen) return <Page width="narrow" className="py-10">{seo}</Page>;

  if (!m.aktiv) {
    return (
      <Page width="narrow" className="py-8 md:py-14">
        {seo}
        <Card className="p-8 text-center">
          <Gamepad2 size={28} className="mx-auto text-white/30 mb-4" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold text-white mb-2">{t.keinRaumTitel}</h1>
          <p className="text-sm text-white/55 mb-6 max-w-md mx-auto">{t.keinRaumText}</p>
          <Button to="/" variant="secondary">{t.zurStartseite}</Button>
        </Card>
      </Page>
    );
  }

  const ich = m.ich;
  const titel = m.spielName || t.raum;
  return (
    <Page width="narrow" className="py-6 md:py-10">
      {seo}
      <PageHeader
        kicker={t.kicker}
        title={titel}
        description={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {m.live && <span className="flex items-center gap-1.5 font-semibold text-white"><span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> {t.live}</span>}
            {m.notiz && <span>{m.notiz}</span>}
          </span>
        )}
      />

      <Card className="p-6 md:p-8">
        {m.modus === "offen" || ich?.status === "aufgerufen" ? (
          <div className="space-y-4">
            {ich?.status === "aufgerufen" ? (
              <>
                <h2 className="font-display text-xl font-bold text-white">{t.dranTitel}</h2>
                <p className="text-sm text-white/60">{t.dranText}</p>
              </>
            ) : <p className="text-sm text-white/60">{t.offenText}</p>}
            {m.url && <Button to={m.url} size="lg">{ich?.status === "aufgerufen" ? t.inDenRaum : t.jetztMitspielen} <ArrowRight size={17} /></Button>}
            {ich?.status === "aufgerufen" && m.modus === "schlange" && (
              <div><button type="button" onClick={() => aktion(stelleAn)} disabled={busy} className="text-xs font-semibold text-white/50 hover:text-white">{t.wiederAnstellen}</button></div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/60">{t.schlangeText}</p>
            <p className="flex items-center gap-2 text-sm text-white/70"><Users size={16} className="text-white/55" aria-hidden="true" /> {t.wartend(m.schlange?.wartend || 0)}</p>
            {!konto ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={oeffneAnmeldung}>{t.anmelden}</Button>
                <span className="text-xs text-white/55">{t.anmeldenText}</span>
              </div>
            ) : ich?.status === "wartet" ? (
              <div className="space-y-3">
                <p className="font-display text-2xl font-bold text-white">{t.deinPlatz(ich.position)}</p>
                <p className="flex items-start gap-2 text-xs text-white/50"><Bell size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> {t.benachrichtigt}</p>
                <Button variant="ghost" onClick={() => aktion(verlasse)} disabled={busy}>{t.verlassen}</Button>
              </div>
            ) : (
              <Button size="lg" onClick={() => aktion(stelleAn)} loading={busy}>{t.anstellen}</Button>
            )}
          </div>
        )}
        {fehler && <p className="text-xs text-red-300 mt-3" role="alert">{fehler}</p>}
      </Card>

      <p className="text-xs text-white/50 mt-6"><Link to="/" className="hover:text-white">{t.zurStartseite}</Link></p>
    </Page>
  );
}
