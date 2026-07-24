// Generische Kategorie-Übersicht: zeigt alle Unterpunkte einer
// Navigations-Kategorie als große anklickbare Kacheln.
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getCategory } from "../config/navigation";
import SEO from "../components/SEO";

function CategoryCard({ link, openFeedback }) {
  const Icon = link.icon;

  const inner = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300 group-hover:bg-violet-500/20 group-hover:text-violet-200 transition-colors">
          {Icon && <Icon size={22} />}
        </span>
        {link.href ? (
          <ExternalLink size={16} className="text-white/20 group-hover:text-white/60 transition-colors" />
        ) : (
          <ArrowRight size={18} className="text-white/20 group-hover:text-violet-300 group-hover:translate-x-1 transition-all" />
        )}
      </div>
      <h3 className="font-display text-lg font-bold text-white mb-1.5">{link.label}</h3>
      <p className="text-sm text-white/45 leading-relaxed">{link.description}</p>
    </>
  );

  const classes =
    "group panel p-6 text-left transition-colors hover:bg-white/[0.06] hover:border-violet-400/30 block w-full";

  if (link.href) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {inner}
      </a>
    );
  }
  if (link.action === "feedback") {
    return (
      <button onClick={openFeedback} className={classes}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={link.to} className={classes}>
      {inner}
    </Link>
  );
}

export default function CategoryPage({ categoryKey }) {
  const category = getCategory(categoryKey);
  const { openFeedback } = useOutletContext() || {};

  if (!category) return null;
  const Icon = category.icon;

  return (
    <div className="page-fade w-full max-w-7xl mx-auto px-2 md:px-4 py-8 md:py-14">
      <SEO
        title={category.label}
        description={category.description}
        path={category.to}
      />

      {/* Hero */}
      <div className="flex items-start gap-5 mb-10 md:mb-14">
        <span className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Icon size={30} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">{category.tagline}</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3">
            {category.label}
          </h1>
          <p className="text-white/50 text-sm md:text-base max-w-2xl leading-relaxed">{category.description}</p>
        </div>
      </div>

      {/* Unterpunkte */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {category.links.map((link) => (
          <CategoryCard key={link.label} link={link} openFeedback={openFeedback} />
        ))}
      </div>
    </div>
  );
}
