// NextGame.jsx — „Als Nächstes“ im Endscreen der Kartenspiele: schlägt das nächste Spiel in fester Reihenfolge vor,
// damit man ohne Umweg über /clash weiterspielen kann. Spiele, deren Tagesrunde heute schon erledigt ist, werden
// übersprungen; sind alle erledigt, kommt einfach das nächste in der Reihe. Wer bin ich? (zu zweit) ist nicht dabei.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { berlinDay, readStore } from './quizData';
import { useClashLang } from './clashI18n';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.webp';
import questionImg from '../../../assets/clashRoyale/ui/question.webp';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';
import potionImg from '../../../assets/clashRoyale/ui/card_boost_potion.webp';
import swordImg from '../../../assets/clashRoyale/ui/sword.webp';
import crownImg from '../../../assets/clashRoyale/ui/crown.webp';

/** Reihenfolge der Kette; store = localStorage-Schlüssel der Tagesrunde (wie im Hub) */
const CHAIN = [
  { id: 'wordle', to: '/clash/wordle', img: scrollImg, title: 'wordleTitle', text: 'wordleText', store: 'crq_wordle_v1' },
  { id: 'kartenraten', to: '/clash/kartenraten', img: questionImg, title: 'guessTitle', text: 'guessText', store: 'crq_guess_v3' },
  { id: 'zoom', to: '/clash/zoom', img: searchImg, title: 'zoomTitle', text: 'zoomText', store: 'crq_zoom_v1' },
  { id: 'pixel', to: '/clash/pixel', img: eyeImg, title: 'pixelTitle', text: 'pixelText', store: 'crq_pixel_v1' },
  { id: 'farbe', to: '/clash/farbe', img: potionImg, title: 'colorTitle', text: 'colorText', store: 'crq_color_v1' },
  { id: 'stats-duell', to: '/clash/stats-duell', img: swordImg, title: 'statsTitle', text: 'statsText' },
];

function solvedToday(game, day) {
  if (!game.store) return false;
  const d = readStore(game.store, {})?.daily;
  return !!d && d.day === day && !!(d.over || d.won);
}

/** Nächstes Spiel nach `current`: erst eins mit offener Tagesrunde, sonst schlicht das nächste in der Reihe */
function pickNext(current) {
  const start = Math.max(0, CHAIN.findIndex((g) => g.id === current));
  const rest = Array.from({ length: CHAIN.length - 1 }, (_, i) => CHAIN[(start + 1 + i) % CHAIN.length]);
  const day = berlinDay();
  return rest.find((g) => !solvedToday(g, day)) || rest[0];
}

/** Alle Tagesrunden der Kette (die mit store) heute erledigt? Dann führt der Endscreen zum Ergebnis (HeutePage.jsx). */
function allSolved() {
  const day = berlinDay();
  return CHAIN.filter((g) => g.store).every((g) => solvedToday(g, day));
}

/** @param current  id des laufenden Spiels (siehe CHAIN) */
export default function NextGame({ current, className = '' }) {
  const { lang, t } = useClashLang();
  const next = useMemo(() => (allSolved() ? null : pickNext(current)), [current]);
  const q = lang === 'en' ? '?lang=en' : '';
  const item = next
    ? { to: `${next.to}${q}`, img: next.img, title: t[next.title], text: t[next.text], cta: t.play }
    : { to: `/clash/heute${q}`, img: crownImg, title: t.heuteDoneTitle, text: t.heuteDoneText, cta: t.heuteResult };
  return (
    <Link to={item.to} className={`crq-next ${className}`}>
      <img src={item.img} alt="" draggable={false} />
      <span className="min-w-0 flex-1">
        <span className="crq-next-label">{t.nextUp}</span>
        <span className="crq-next-title">{item.title}</span>
        <span className="crq-next-text">{item.text}</span>
      </span>
      <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--gold shrink-0">
        {item.cta} <ArrowRight size={16} />
      </span>
    </Link>
  );
}
