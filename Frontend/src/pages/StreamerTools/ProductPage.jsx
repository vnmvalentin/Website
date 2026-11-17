// ProductPage.jsx — Produktseiten der Streamer-Werkzeuge: /tools/win-tracker, /tools/win-challenge,
// /tools/twitch-overlays (Ausbauplan „produktseiten“). Eine Seite zum Verlinken in Streamer-Discords und für die Suche:
// oben Text und die echte Overlay-Vorschau, darunter Funktionen, drei Schritte, Fragen und die übrigen Produkte.
// Sieht für alle gleich aus (auch angemeldet), Deutsch und Englisch (?lang=en), vorgerendert (prerender.js).
// Texte und strukturierte Daten: productTexts.js.
import React, { Suspense, lazy, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Activity, Clock, History, Layers, MessageSquare, Palette, Trophy, Users, Timer, Languages,
  BarChart3, Bell, Target, Clapperboard, Hourglass,
} from "lucide-react";
import SEO from "../../components/SEO";
import FaqAccordion from "../../components/FaqAccordion";
import { Page, SectionHeading, Button } from "../../components/ui";
import { useLanguage } from "../../i18n/language";
import { isLowGfx } from "../../utils/lowGfx";
import { PRODUCT_TEXTS, PRODUCT_IDS, PRODUCT_META, productPath, withLang, buildProductJsonLd } from "./productTexts";

// Die laufenden Overlays — eigener Chunk; bis dahin (und im Sparmodus ohne GPU) steht das Vorschaubild
const ProductPreview = lazy(() => import("./ProductPreviews"));

/** Symbole der Funktionen, in der Reihenfolge der features-Listen in productTexts.js. */
const FEATURE_ICONS = {
  "win-tracker": [Activity, Clock, History, Layers, MessageSquare, Palette],
  "win-challenge": [Trophy, MessageSquare, Users, Timer, Palette, Languages],
  "twitch-overlays": [BarChart3, Bell, Target, Activity, Clapperboard, Hourglass],
};

const SECTION = "mb-14 md:mb-20 scroll-mt-6";

/**
 * @param {object} props
 * @param {string} props.id  eine der PRODUCT_IDS
 */
export default function ProductPage({ id }) {
  const { lang } = useLanguage({ supported: PRODUCT_TEXTS.langs, syncUrl: true });
  const t = PRODUCT_TEXTS.dict(lang);
  const p = t.products[id];
  const meta = PRODUCT_META[id];
  const icons = FEATURE_ICONS[id];
  // Live-Vorschau nur mit Hardwarebeschleunigung — sonst müsste der Prozessor das laufende Overlay selbst malen
  const [live] = useState(() => !isLowGfx());
  const others = PRODUCT_IDS.filter((x) => x !== id);
  const still = <img src={meta.image} alt="" className="absolute inset-0 w-full h-full object-contain p-[6%]" />;

  return (
    <Page width="wide" className="py-4 md:py-8" key={id}>
      <SEO
        title={p.seoTitle}
        description={p.description}
        keywords={p.keywords}
        path={productPath(id)}
        search={lang === "en" ? "?lang=en" : ""}
        lang={lang}
        image={meta.image}
        alternates={[
          { hrefLang: "de", path: productPath(id) },
          { hrefLang: "en", path: productPath(id), search: "?lang=en" },
          { hrefLang: "x-default", path: productPath(id) },
        ]}
        jsonLd={buildProductJsonLd(id, lang)}
      />

      {/* Sprache wählt der Umschalter oben in der Website-Leiste (dieselbe Sprachwahl, die Adresse zieht mit) */}
      <Button to="/tools" variant="ghost" icon={ArrowLeft} className="-ml-3 mb-6 md:mb-8">{t.ui.back}</Button>

      {/* ── Kopf: Text links, laufendes Overlay rechts ─────────────────────── */}
      <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 lg:gap-12 items-center mb-14 md:mb-20">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-soft/80 mb-3">{p.kicker}</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight text-balance">{p.h1}</h1>
          <p className="text-white/60 text-base md:text-lg mt-4 leading-relaxed max-w-xl">{p.lead}</p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Button to={withLang(meta.tool, lang)} size="lg" data-product-cta>{t.ui.setup}</Button>
            <Button to={`/tools/vorlagen?reiter=${meta.gallery}`} variant="secondary" size="lg">{t.ui.templates}</Button>
          </div>
          <p className="text-white/40 text-xs mt-4">{t.ui.facts}</p>
        </div>
        <figure className="min-w-0">
          <div className="relative aspect-[16/10] rounded-lg border border-line bg-[#08080b] overflow-hidden" data-product-preview>
            {live ? <Suspense fallback={still}><ProductPreview id={id} lang={lang} /></Suspense> : still}
          </div>
          <figcaption className="text-xs text-white/40 mt-2.5">{t.ui.previewNote}</figcaption>
        </figure>
      </header>

      {/* ── Funktionen ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="pp-features" className={SECTION}>
        <SectionHeading id="pp-features" title={t.ui.featuresHeading} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
          {p.features.map((f, i) => {
            const Icon = icons[i] || Activity;
            return (
              <div key={f.title} className="flex items-start gap-3.5 min-w-0">
                <Icon size={18} className="text-white/40 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm mb-1.5">{f.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{f.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Drei Schritte ────────────────────────────────────────────────────── */}
      <section aria-labelledby="pp-steps" className={SECTION}>
        <SectionHeading id="pp-steps" title={t.ui.stepsHeading} />
        <ol className="grid grid-cols-1 md:grid-cols-3 rounded-lg border border-line divide-y md:divide-y-0 md:divide-x divide-white/10">
          {p.steps.map((s, i) => (
            <li key={s.name} id={`schritt-${i + 1}`} className="p-5 md:p-6">
              <span className="block font-display text-2xl font-bold text-white/30 tabular-nums mb-3">{i + 1}</span>
              <h3 className="font-semibold text-white mb-1.5">{s.name}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Button to={withLang(meta.tool, lang)} icon={ArrowRight}>{t.ui.setup}</Button>
        </div>
      </section>

      {/* ── Fragen ───────────────────────────────────────────────────────────── */}
      <section className={`${SECTION} max-w-3xl`}>
        <FaqAccordion items={p.faq} heading={t.ui.faqHeading}
          headingClassName="font-display text-lg md:text-xl font-bold text-white tracking-tight mb-4 md:mb-5" />
      </section>

      {/* ── Die anderen Produkte ─────────────────────────────────────────────── */}
      <section aria-labelledby="pp-more">
        <SectionHeading id="pp-more" title={t.ui.moreHeading} to="/tools" linkLabel={t.ui.allTools} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {others.map((o) => {
            const other = t.products[o];
            return (
              <Link key={o} to={withLang(productPath(o), lang)}
                className="group flex items-center gap-4 rounded-lg border border-line bg-surface/80 hover:border-accent/45 transition-colors p-4">
                <img src={PRODUCT_META[o].image} alt="" loading="lazy"
                  className="w-24 h-16 shrink-0 rounded-md object-contain bg-[#08080b]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-white">{other.name}</span>
                  <span className="block text-sm text-white/50">{other.teaser}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-accent-soft group-hover:text-white">{t.ui.learnMore} →</span>
              </Link>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
