// GameFrame.jsx — Rahmen von /clash und den Kartenspielen: Rautenhintergrund wie der Minigames-Hub, oben der Weg
// zurück, Sprachwahl (DE/EN, clashI18n.js) und Einstellungen, darunter Titel + Inhalt. Läuft in der CR-Hülle.
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../../../components/SEO';
import HubStage from '../hub/HubStage';
import ArcadeTitle from '../ui/ArcadeTitle';
import LanguageSelect from '../components/LanguageSelect';
import { useCrPrefs } from '../ui/crPrefs';
import { CrSettings } from '../ui/CrIcons';
import { useClashLang } from './clashI18n';

export const CHIP = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

/**
 * @param back  { to, label } — Ziel und Beschriftung des Zurück-Knopfs (Standard: /clash)
 * @param seo   Props für <SEO>; path wird um ?lang=en ergänzt, wenn Englisch gewählt ist
 */
export default function GameFrame({ title, icon, seo, back, children, wide = false }) {
  const { openSettings } = useCrPrefs();
  const { lang, t, changeLang } = useClashLang();
  const backTo = back || { to: '/clash', label: t.clashRoyale };
  return (
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
      {seo && (
        <SEO {...seo} lang={lang} search={lang === 'en' ? '?lang=en' : ''}
          alternates={[{ hrefLang: 'de', search: '' }, { hrefLang: 'en', search: '?lang=en' }, { hrefLang: 'x-default', search: '' }]} />
      )}
      <HubStage />
      <div className="relative z-10 min-h-full flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
          <Link to={backTo.to} className={`${CHIP} px-3.5`}>
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{backTo.label}</span>
          </Link>
          <div className="flex-1" />
          <LanguageSelect lang={lang} onChange={changeLang} languages={['de', 'en']} />
          <button type="button" onClick={openSettings} className={`${CHIP} w-11 justify-center`} title={t.settings} aria-label={t.settings}>
            <CrSettings size={24} />
          </button>
        </div>
        <div className={`flex-1 w-full mx-auto px-3 md:px-6 pt-2 pb-10 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
          {title && (
            <div className="flex flex-col items-center mb-5">
              {icon && <img src={icon} alt="" draggable={false} className="h-14 w-auto drop-shadow-[0_5px_0_rgba(2,8,20,0.45)]" />}
              <ArcadeTitle as="h1" className="text-3xl sm:text-4xl text-center leading-none mt-1">{title}</ArcadeTitle>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
