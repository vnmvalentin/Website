// Sichtbarer Teil der Seite /WinChallenge-Overlay — siehe seoData.js für die Texte
// und die Begründung, warum es diesen öffentlichen Bereich überhaupt gibt.

import React from 'react';
import FaqAccordion from '../../components/FaqAccordion';
import { WC_FEATURES, WC_STEPS, WC_FAQ } from './seoData';

/**
 * Beschreibungsteil der Seite. Steht über dem Login (dort ist es der ganze Inhalt)
 * und ist damit das, was Suchmaschinen und Erstbesucher zu sehen bekommen.
 */
export default function WinChallengeSeoContent({ children }) {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">

      {/* ── Kopf: das H1 trägt das Hauptkeyword ──────────────────────────────── */}
      <header className="text-center pt-2">
        <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight">
          Win Challenge Overlay für OBS
        </h1>
        <p className="text-white/50 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">
          Lege deine Stream-Ziele fest und zeig deinen Zuschauern jederzeit, was noch offen
          ist. Kostenlos, ohne Download, in zwei Minuten in OBS eingerichtet.
        </p>
        <p className="text-white/30 text-xs mt-2">
          Für Twitch · OBS, Streamlabs, XSplit · keine Kosten, kein Abo
        </p>
      </header>

      {/* Login-Schaltfläche bzw. was die Seite an dieser Stelle sonst anbietet */}
      {children}

      {/* ── Funktionen ───────────────────────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <h2 className="text-white font-semibold text-sm mb-4">Was das Overlay kann</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {WC_FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-white/5 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <Icon size={16} className="text-violet-400 shrink-0 mt-0.5" />
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
          Win Challenge Overlay in OBS einrichten
        </h2>
        <ol className="space-y-3">
          {WC_STEPS.map((step, i) => (
            <li key={step.name} className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 text-xs font-bold shrink-0">
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
        <FaqAccordion items={WC_FAQ} heading="Häufige Fragen zum Win Challenge Overlay" />
      </section>

    </div>
  );
}
