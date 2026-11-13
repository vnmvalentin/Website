// Generische Kategorie-Übersicht: zeigt alle Unterpunkte einer
// Navigations-Kategorie als große anklickbare Kacheln.
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ExternalLink, Lock } from "lucide-react";
import { getCategory } from "../config/navigation";
import SEO from "../components/SEO";
import TileCard from "../components/TileCard";
import { Page, PageHeader } from "../components/ui";

function CategoryCard({ link, openFeedback }) {
  const Icon = link.icon;

  const inner = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span
          className={`flex items-center justify-center w-12 h-12 rounded-lg border transition-colors ${
            link.locked
              ? "bg-white/[0.03] border-line text-white/30"
              : "bg-accent/10 border-accent/25 text-accent-soft group-hover:bg-accent/20 group-hover:text-white"
          }`}
        >
          {Icon && <Icon size={22} />}
        </span>
        {link.locked ? (
          <Lock size={16} className="text-white/25" />
        ) : link.href ? (
          <ExternalLink size={16} className="text-white/20 group-hover:text-white/60 transition-colors" />
        ) : (
          <ArrowRight size={18} className="text-white/20 group-hover:text-accent-soft group-hover:translate-x-1 transition-all" />
        )}
      </div>
      <h3 className={`font-display text-lg font-bold mb-1.5 ${link.locked ? "text-white/45" : "text-white"}`}>
        {link.label}
      </h3>
      <p className={`text-sm leading-relaxed ${link.locked ? "text-white/25" : "text-white/45"}`}>{link.description}</p>
      {link.locked && link.lockedNote && (
        <p className="mt-4 pt-3 border-t border-line flex items-center gap-2 text-xs font-semibold text-white/40">
          <Lock size={12} className="shrink-0" />
          {link.lockedNote}
        </p>
      )}
    </>
  );

  const classes =
    "group rounded-lg bg-surface/80 border border-line p-6 text-left transition-colors hover:bg-white/[0.06] hover:border-accent/30 block w-full";

  // Gesperrt: Kachel bleibt stehen, ist aber tot. Die Route selbst bleibt erreichbar.
  if (link.locked) {
    return (
      <div
        aria-disabled="true"
        title={link.lockedNote || "Vorübergehend gesperrt"}
        className="rounded-lg bg-surface/80 border border-line p-6 text-left block w-full cursor-not-allowed"
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
      <button type="button" onClick={openFeedback} className={classes}>
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

  return (
    <Page width="wide" className="py-4 md:py-10">
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
              .filter((l) => l.to && !l.locked && !l.soon)
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

      {/* Kopf ohne Symbol-Kasten: wie Startseite und /tools nur Zeile, Überschrift, Beschreibung */}
      <PageHeader size="hero" kicker={category.tagline} title={category.label} description={category.description} />

      {/* Unterpunkte: Vorschau-Karten (components/TileCard.jsx). Gesperrte bleiben als tote Kachel stehen, noch
          nicht fertige (soon) erscheinen hier gar nicht. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
        {category.links.filter((l) => !l.soon).map((link, i) => (
          link.locked
            ? <CategoryCard key={link.label} link={link} openFeedback={openFeedback} />
            : (
              <TileCard
                key={link.label}
                index={i}
                to={link.to}
                href={link.href}
                onClick={link.action === "feedback" ? openFeedback : undefined}
                title={link.label}
                text={link.description}
                images={link.previews || []}
                icon={link.icon}
              />
            )
        ))}
      </div>
    </Page>
  );
}
