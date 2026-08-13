// Sichtbarer Teil der Seite /twitch-tools — siehe seoData.js für die Texte und die
// Begründung, warum es diesen öffentlichen Bereich überhaupt gibt.

import React from 'react';
import FaqAccordion from '../../components/FaqAccordion';
import { ST_MODULES, ST_STEPS, ST_FAQ } from './seoData';

/**
 * Beschreibungsteil der Seite. Steht über der Login-Schranke und ist damit das,
 * was Suchmaschinen und Erstbesucher zu sehen bekommen.
 */
export default function StreamToolSeoContent({ children }) {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">

      <header className="text-center pt-2">
        <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight">
          Twitch Overlays für OBS
        </h1>
        <p className="text-white/50 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">
          Umfragen, Vorhersagen, Follower- und Abo-Ziele, Stream-Statistik und Raid-Clips
          live im Stream einblenden. Kostenlos, ohne Download, alles über eine einzige
          Browserquelle.
        </p>
        <p className="text-white/30 text-xs mt-2">
          Für Twitch · OBS, Streamlabs, XSplit · keine Kosten, kein Abo
        </p>
      </header>

      {children}

      {/* ── Module ───────────────────────────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <h2 className="text-white font-semibold text-sm mb-4">Diese Overlays gibt es</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ST_MODULES.map(({ icon: Icon, title, text }) => (
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
          Twitch-Overlays in OBS einrichten
        </h2>
        <ol className="space-y-3">
          {ST_STEPS.map((step, i) => (
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
        <FaqAccordion items={ST_FAQ} heading="Häufige Fragen zu den Twitch-Overlays" />
      </section>

    </div>
  );
}
