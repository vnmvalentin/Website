// Anleitung eines Spielmodus, geöffnet über die Kachel auf der Startseite.
//
// Bis hierher stand auf der Kachel ein Satz — genug, um den Modus zu erkennen, zu wenig,
// um ihn zu spielen. Wer wissen wollte, wie eine Runde abläuft, musste ihn starten. Diese
// Anleitung schließt die Lücke, ohne die Startseite wieder mit Text zuzuschütten: Sie
// liegt hinter einem Klick.
//
// Der Inhalt steht in modeTutorials.js, das Aussehen hier.

import React from 'react';
import Modal from '../ui/Modal';
import { CrTarget, CrInfo, CrSettings } from '../ui/CrIcons';
import { tutorialFor, TUTORIAL_I18N } from './modeTutorials';
import scrollIcon from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';

/** Überschrift eines Abschnitts — Symbol, Text, dünne Linie. */
function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <Icon size={22} className="shrink-0" />
      <h3 className="cr-section-title text-base">{children}</h3>
      <div className="h-px flex-1 bg-[rgba(2,8,20,0.55)] shadow-[0_1px_0_rgba(255,255,255,0.05)]" />
    </div>
  );
}

/** Questrollen-Symbol statt einer nummerierten Liste als Aufmacher für "So läuft's ab" —
 *  passt zur Bedeutung (Ablauf/Anleitung) besser als das generische Listen-Icon. Braucht
 *  dieselbe size/className-Hülle wie ein lucide-Symbol, siehe SectionTitle oben. */
function ScrollIcon({ size = 14, className = '' }) {
  return <img src={scrollIcon} alt="" width={size} height={size} className={className} style={{ objectFit: 'contain' }} />;
}

export default function ModeTutorialModal({ mode, name, description, lang = 'de', onClose }) {
  const t = TUTORIAL_I18N[lang] || TUTORIAL_I18N.de;
  const guide = tutorialFor(mode.id, lang);
  const Icon = mode.icon;

  return (
    <Modal
      title={name}
      icon={<Icon size={26} className="shrink-0" />}
      size="md"
      onClose={onClose}>

      {/* Aufmacher: großes Modus-Symbol auf dem Karo statt eines Screenshots — die Screenshots
          veralteten mit jeder Design-Änderung der Modi. */}
      <div className="cr-arcade-bg flex items-center justify-center py-6 border-b-2 border-[var(--cr-panel-edge)]">
        <span className="cr-tile-icon w-24 h-24"><Icon size={68} /></span>
      </div>

      <div className="p-5 sm:p-6 space-y-6">

        {/* Ziel: der eine Satz, der alles Weitere einordnet */}
        <div>
          <SectionTitle icon={CrTarget}>{t.goal}</SectionTitle>
          <p className="text-white text-[15px] leading-relaxed">
            {guide?.goal || description}
          </p>
        </div>

        {guide?.steps?.length > 0 && (
          <div>
            <SectionTitle icon={ScrollIcon}>{t.steps}</SectionTitle>
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
            <SectionTitle icon={CrInfo}>{t.tips}</SectionTitle>
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
            <SectionTitle icon={CrSettings}>{t.host}</SectionTitle>
            <p className="text-white/50 text-sm leading-relaxed">{guide.host}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
