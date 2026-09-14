// DleHubPage.jsx — Menü-Übersicht aller -dle-Tagesspiele. Gleicher Kachel-Look wie
// CategoryPage.jsx (panel, violetter Akzent, kein Glow/Scale-Hover — siehe Design-Vorgabe
// "bleibt im Look der übrigen Seite"), aber mit eigenem Grid statt der generischen
// CategoryCard, weil hier zusätzlich ein Favoriten-Stern und ein "Bald verfügbar"-Zustand
// pro Kachel gebraucht werden.
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Star, Puzzle, Check } from 'lucide-react';
import SEO from '../../components/SEO';
import { DLE_GAMES } from './gamesConfig';
import { useFavorites } from './useFavorites';
import { readCachedResult, todayDateKey } from './dailyResultCache';

function GameCard({ game, isFavorite, onToggleFavorite, todayResult }) {
  const Icon = game.icon;
  const locked = game.status !== 'live';

  const body = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span className="flex items-center justify-center w-12 h-12 rounded-xl border bg-violet-500/10 border-violet-400/20 text-violet-300 group-hover:bg-violet-500/20 group-hover:text-violet-200 transition-colors">
          <Icon size={22} />
        </span>
        {locked ? (
          <Lock size={16} className="text-white/25" />
        ) : (
          <ArrowRight size={18} className="text-white/20 group-hover:text-violet-300 group-hover:translate-x-1 transition-all" />
        )}
      </div>
      <h3 className="font-display text-lg font-bold mb-0.5 text-white">{game.name}</h3>
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/70 mb-2">{game.subtitle}</p>
      <p className="text-sm leading-relaxed text-white/45">{game.description}</p>
      {locked && (
        <p className="mt-4 pt-3 border-t border-white/10 text-xs font-semibold text-white/40">
          Bald verfügbar
        </p>
      )}
      {!locked && todayResult && (
        <p className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs font-semibold text-violet-300/80">
          <Check size={12} className="shrink-0" />
          Heute gespielt: {todayResult.totalScore} / {todayResult.rounds.length * 100}
        </p>
      )}
    </>
  );

  return (
    <div className="group relative panel p-6 text-left">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleFavorite(game.id);
        }}
        aria-label={isFavorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
        aria-pressed={isFavorite}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-white/25 hover:text-amber-300 hover:bg-white/[0.06] transition-colors"
      >
        <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} className={isFavorite ? 'text-amber-300' : ''} />
      </button>

      {locked ? (
        <div aria-disabled="true" title="Bald verfügbar" className="cursor-not-allowed">
          {body}
        </div>
      ) : (
        <Link to={`/daily/${game.id}`} className="block hover:no-underline">
          {body}
        </Link>
      )}
    </div>
  );
}

export default function DleHubPage() {
  const { isFavorite, toggleFavorite } = useFavorites();

  // Favoriten zuerst, sonst Reihenfolge aus gamesConfig.js unverändert — stabile
  // Sortierung, damit die Kacheln beim Sternen-Klick nicht wild durcheinanderspringen.
  const sortedGames = [...DLE_GAMES].sort((a, b) => {
    const fa = isFavorite(a.id) ? 0 : 1;
    const fb = isFavorite(b.id) ? 0 : 1;
    return fa - fb;
  });

  return (
    <div className="page-fade w-full max-w-7xl mx-auto px-2 md:px-4 py-8 md:py-14">
      <SEO
        title="Daily Games"
        description="Tägliche Schätzspiele im Browser: schätze Temperaturen, Geschwindigkeiten, Preise und mehr. Fünf Runden, ein Tagesrätsel, Ergebnis zum Teilen."
        path="/daily"
        keywords="Daily Games, Dle Spiele, Wordle-artig, tägliches Rätsel, Browser Quiz, Tempdle"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://vnmvalentin.de' },
              { '@type': 'ListItem', position: 2, name: 'Daily Games', item: 'https://vnmvalentin.de/daily' },
            ],
          },
        ]}
      />

      <div className="flex items-start gap-5 mb-10 md:mb-14">
        <span className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Puzzle size={30} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">Jeden Tag ein neues Rätsel</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3">
            Daily Games
          </h1>
          <p className="text-white/50 text-sm md:text-base max-w-2xl leading-relaxed">
            Fünf Runden, ein Tagesrätsel für alle — schätzen statt raten. Am Ende gibt's ein
            Ergebnis-Bild zum Teilen und eine Bestenliste für den Tag.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            isFavorite={isFavorite(game.id)}
            onToggleFavorite={toggleFavorite}
            todayResult={game.status === 'live' ? readCachedResult(game.id, todayDateKey()) : null}
          />
        ))}
      </div>
    </div>
  );
}
