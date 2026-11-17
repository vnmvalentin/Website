// pages/Website/Barrierefreiheit.jsx — /barrierefreiheit: Einstellungen je Gerät (components/BarrierefreiEinstellungen,
// Logik in utils/barrierefrei.js), was die Website schon kann, ehrliche Grenzen und der Weg zum Feedback.
// Verlinkt aus der Fußzeile jeder Seite, dem Profil und der Schnellsuche.
import React from "react";
import { useOutletContext } from "react-router-dom";
import { Accessibility, Check, Info, MessageSquare } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Section, Button } from "../../components/ui";
import BarrierefreiEinstellungen from "../../components/BarrierefreiEinstellungen.jsx";
import { BARRIEREFREI_TEXTE } from "../../components/barrierefreiTexte.js";
import { useLanguage } from "../../i18n/language.js";

export default function Barrierefreiheit() {
  const { lang } = useLanguage({ supported: BARRIEREFREI_TEXTE.langs });
  const t = BARRIEREFREI_TEXTE.dict(lang);
  const { openFeedback } = useOutletContext() || {};

  return (
    <Page width="default" className="py-4 md:py-8">
      <SEO title={t.metaTitle} description={t.metaDescription} path="/barrierefreiheit" lang={lang} />
      <PageHeader kicker={t.kicker} title={t.titel} description={t.beschreibung} icon={Accessibility} />

      <div className="grid grid-cols-1 gap-5">
        <Section title={t.einstellungenTitel} description={t.einstellungenHinweis}>
          <BarrierefreiEinstellungen lang={lang} />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section icon={Check} title={t.kannTitel}>
            <ul className="space-y-3">
              {t.kann.map((satz) => (
                <li key={satz} className="flex items-start gap-3 text-sm text-white/70 leading-relaxed">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-soft" />
                  {satz}
                </li>
              ))}
            </ul>
          </Section>
          <Section icon={Info} title={t.grenzenTitel}>
            <ul className="space-y-3">
              {t.grenzen.map((satz) => (
                <li key={satz} className="flex items-start gap-3 text-sm text-white/70 leading-relaxed">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                  {satz}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section icon={MessageSquare} title={t.kontaktTitel} description={t.kontaktText}>
          {openFeedback && <div><Button variant="secondary" onClick={openFeedback}>{t.feedback}</Button></div>}
        </Section>
      </div>
    </Page>
  );
}
