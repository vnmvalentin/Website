// Anleitung eines Spielmodus, geöffnet über die Kachel auf der Startseite.
//
// Bis hierher stand auf der Kachel ein Satz — genug, um den Modus zu erkennen, zu wenig,
// um ihn zu spielen. Wer wissen wollte, wie eine Runde abläuft, musste ihn starten. Diese
// Anleitung schließt die Lücke, ohne die Startseite wieder mit Text zuzuschütten: Sie
// liegt hinter einem Klick.
//
// Der Inhalt steht in modeTutorials.js, das Aussehen hier.

import React from 'react';
import { Target, ListOrdered, Lightbulb, Sliders } from 'lucide-react';
import Modal from '../ui/Modal';
import { modeImage } from '../modesConfig';
import { tutorialFor, TUTORIAL_I18N } from './modeTutorials';

/** Überschrift eines Abschnitts — Symbol, Text, dünne Linie. */
function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={14} className="text-violet-300 shrink-0" />
      <h3 className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">{children}</h3>
      <div className="h-px flex-1 bg-white/[0.07]" />
    </div>
  );
}

export default function ModeTutorialModal({ mode, name, description, lang = 'de', onClose }) {
  const t = TUTORIAL_I18N[lang] || TUTORIAL_I18N.de;
  const guide = tutorialFor(mode.id, lang);
  const Icon = mode.icon;

  return (
    <Modal
      title={name}
      icon={<Icon size={16} className="text-violet-300 shrink-0" />}
      size="md"
      onClose={onClose}>

      {/* Bild als Aufmacher. Fehlt es, entfällt es ersatzlos — der Text trägt allein. */}
      <div className="relative aspect-[16/7] bg-[#0e0e1a] overflow-hidden">
        <img src={modeImage(mode.id)} alt="" loading="lazy" decoding="async"
          className="w-full h-full object-cover"
          onError={e => { e.currentTarget.closest('div').style.display = 'none'; }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(11,11,18,0) 45%, rgba(11,11,18,0.95) 100%)' }} />
      </div>

      <div className="p-5 sm:p-6 space-y-6">

        {/* Ziel: der eine Satz, der alles Weitere einordnet */}
        <div>
          <SectionTitle icon={Target}>{t.goal}</SectionTitle>
          <p className="text-white text-[15px] leading-relaxed">
            {guide?.goal || description}
          </p>
        </div>

        {guide?.steps?.length > 0 && (
          <div>
            <SectionTitle icon={ListOrdered}>{t.steps}</SectionTitle>
            <ol className="space-y-2.5">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-md bg-white/[0.06] text-white/50 text-[11px] font-semibold tabular-nums flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-white/70 text-sm leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {guide?.tips?.length > 0 && (
          <div>
            <SectionTitle icon={Lightbulb}>{t.tips}</SectionTitle>
            <ul className="space-y-2.5">
              {guide.tips.map((tip, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400/60 mt-[0.55rem]" />
                  <span className="text-white/70 text-sm leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {guide?.host && (
          <div>
            <SectionTitle icon={Sliders}>{t.host}</SectionTitle>
            <p className="text-white/50 text-sm leading-relaxed">{guide.host}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
