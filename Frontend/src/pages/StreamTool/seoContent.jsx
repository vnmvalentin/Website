// Sichtbarer Teil der Seite /twitch-tools — siehe seoData.js für die Texte und die
// Begründung, warum es diesen öffentlichen Bereich überhaupt gibt.

import React from 'react';
import FaqAccordion from '../../components/FaqAccordion';
import { stSeo } from './seoData';

/**
 * Beschreibungsteil der Seite. Steht über der Login-Schranke und ist damit das,
 * was Suchmaschinen und Erstbesucher zu sehen bekommen.
 * @param {string} [props.lang]  'de' | 'en'
 */
export default function StreamToolSeoContent({ lang = 'de', children }) {
  const seo = stSeo(lang);
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">

      <header className="text-center pt-2">
        <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight">
          {seo.heading}
        </h1>
        <p className="text-white/50 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">
          {seo.lead}
        </p>
        <p className="text-white/30 text-xs mt-2">
          {seo.platforms}
        </p>
      </header>

      {children}

      {/* ── Module ───────────────────────────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <h2 className="text-white font-semibold text-sm mb-4">{seo.modulesHeading}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {seo.modules.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-white/5 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <Icon size={16} className="text-accent-soft shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
                  <p className="text-white/45 text-xs leading-relaxed">{text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Einrichtung ──────────────────────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <h2 className="text-white font-semibold text-sm mb-4">
          {seo.stepsHeading}
        </h2>
        <ol className="space-y-3">
          {seo.steps.map((step, i) => (
            <li key={step.name} className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/10 border border-accent-soft/20 text-accent-soft text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-white/85 font-semibold text-sm">{step.name}</h3>
                <p className="text-white/40 text-xs leading-relaxed mt-0.5">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Häufige Fragen ───────────────────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <FaqAccordion items={seo.faq} heading={seo.faqHeading} />
      </section>

    </div>
  );
}
