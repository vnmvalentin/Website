// Sichtbarer Teil der Seite /WinChallenge-Overlay — siehe seoData.js für die Texte
// und die Begründung, warum es diesen öffentlichen Bereich überhaupt gibt.

import React from 'react';
import FaqAccordion from '../../components/FaqAccordion';
import { wcSeo } from './seoData';

const SECTION_HEADING = 'font-display text-lg font-bold text-white tracking-tight mb-5';

/**
 * Beschreibungsteil der Seite. Steht über dem Login (dort ist es der ganze Inhalt)
 * und ist damit das, was Suchmaschinen und Erstbesucher zu sehen bekommen.
 * Aufbau wie der Editor: keine einzelnen Kästen, Abschnitte nur durch Linien getrennt.
 */
export default function WinChallengeSeoContent({ lang = 'de', children }) {
  const s = wcSeo(lang);
  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pb-16">

      {/* ── Kopf: das H1 trägt das Hauptkeyword ──────────────────────────────── */}
      <header className="pt-10 md:pt-16 pb-10 md:pb-12">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight">
          {s.h1}
        </h1>
        <p className="text-white/60 text-base md:text-lg mt-4 max-w-2xl leading-relaxed">
          {s.lead}
        </p>
        {/* Login-Schaltfläche bzw. was die Seite an dieser Stelle sonst anbietet */}
        <div className="mt-7">{children}</div>
        <p className="text-white/35 text-xs mt-4">{s.sub}</p>
      </header>

      {/* ── Funktionen ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 py-10">
        <h2 className={SECTION_HEADING}>{s.featuresHeading}</h2>
        <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {s.features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3.5">
              <Icon size={18} className="text-white/40 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm mb-1.5">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Einrichtung ──────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 py-10">
        <h2 className={SECTION_HEADING}>{s.stepsHeading}</h2>
        <ol className="divide-y divide-white/10 border-y border-white/10">
          {s.steps.map((step, i) => (
            // Die id ist das Sprungziel aus den strukturierten Daten (jsonLd.js, HowToStep.url)
            <li key={step.name} id={`schritt-${i + 1}`} className="flex items-start gap-4 py-4">
              <span className="w-6 text-right text-sm font-bold text-violet-400 tabular-nums shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm">{step.name}</h3>
                <p className="text-white/50 text-sm leading-relaxed mt-1">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Häufige Fragen ───────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 pt-10">
        <FaqAccordion
          items={s.faq}
          heading={s.faqHeading}
          headingClassName={SECTION_HEADING}
          listClassName="divide-y divide-white/10 border-y border-white/10"
        />
      </section>

    </div>
  );
}
