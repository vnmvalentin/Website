// Generische Kategorie-Übersicht: zeigt alle Unterpunkte einer
// Navigations-Kategorie als große anklickbare Kacheln.
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ExternalLink, Lock } from "lucide-react";
import { getCategory } from "../config/navigation";
import SEO from "../components/SEO";

function CategoryCard({ link, openFeedback }) {
  const Icon = link.icon;

  const inner = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span
          className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-colors ${
            link.locked
              ? "bg-white/[0.03] border-white/10 text-white/30"
              : "bg-violet-500/10 border-violet-400/20 text-violet-300 group-hover:bg-violet-500/20 group-hover:text-violet-200"
          }`}
        >
          {Icon && <Icon size={22} />}
        </span>
        {link.locked ? (
          <Lock size={16} className="text-white/25" />
        ) : link.href ? (
          <ExternalLink size={16} className="text-white/20 group-hover:text-white/60 transition-colors" />
        ) : (
          <ArrowRight size={18} className="text-white/20 group-hover:text-violet-300 group-hover:translate-x-1 transition-all" />
        )}
      </div>
      <h3 className={`font-display text-lg font-bold mb-1.5 ${link.locked ? "text-white/45" : "text-white"}`}>
        {link.label}
      </h3>
      <p className={`text-sm leading-relaxed ${link.locked ? "text-white/25" : "text-white/45"}`}>{link.description}</p>
      {link.locked && link.lockedNote && (
        <p className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-white/40">
          <Lock size={12} className="shrink-0" />
          {link.lockedNote}
        </p>
      )}
    </>
  );

  const classes =
    "group panel p-6 text-left transition-colors hover:bg-white/[0.06] hover:border-violet-400/30 block w-full";

  // Gesperrt: Kachel bleibt stehen, ist aber tot. Die Route selbst bleibt erreichbar.
  if (link.locked) {
    return (
      <div
        aria-disabled="true"
        title={link.lockedNote || "Vorübergehend gesperrt"}
        className="panel p-6 text-left block w-full cursor-not-allowed"
      >
        {inner}
      </div>
    );
  }

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
        title={category.seoTitle || category.label}
        description={category.seoDescription || category.description}
        keywords={category.keywords}
        path={category.to}
        jsonLd={[
          // Breadcrumb: zeigt in den Suchergebnissen "vnmvalentin › Kategorie" statt der nackten URL
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://vnmvalentin.de' },
              { '@type': 'ListItem', position: 2, name: category.label, item: `https://vnmvalentin.de${category.to}` },
            ],
          },
          // Die Unterseiten der Kategorie maschinenlesbar — hilft Google beim Auffinden
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: category.label,
            itemListElement: category.links
              // Gesperrte Unterpunkte tauchen hier nicht auf — die Kachel zeigt sie als
              // nicht nutzbar, dann sollen sie auch nicht als Angebot ausgezeichnet werden.
              .filter((l) => l.to && !l.locked)
              .map((l, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: l.label,
                description: l.description,
                url: `https://vnmvalentin.de${l.to}`,
              })),
          },
        ]}
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
