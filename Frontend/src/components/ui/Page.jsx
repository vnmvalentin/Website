// Page.jsx — Rahmen und Kopf für jede Seite im Website-Layout.
//
// Vorher hatte jede Seite ihre eigene Breite (max-w-lg bis max-w-7xl) und ihre eigene Überschrift
// (text-xl bis text-5xl, mal mit, mal ohne Display-Schrift). Jetzt drei Breiten und zwei Kopfgrößen.
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const WIDTHS = {
  narrow: "max-w-2xl",   // Formulare, Abo, Fehlerseiten
  text: "max-w-3xl",     // Lesetexte: Rechtsseiten, Anleitungen
  default: "max-w-4xl",  // Text- und Listenseiten
  wide: "max-w-7xl",     // Übersichten mit Kachelraster, Editoren
};

/**
 * Äußerer Rahmen: Breite, Zentrierung, Einblenden. Den Abstand zum Fensterrand gibt Layout.jsx vor.
 * @param {object} props
 * @param {"narrow"|"text"|"default"|"wide"} [props.width]
 */
export function Page({ width = "default", className = "", children }) {
  return <div className={`page-fade w-full ${WIDTHS[width] || WIDTHS.default} mx-auto text-white ${className}`}>{children}</div>;
}

/**
 * Seitenkopf: kleine Zeile, Überschrift, Beschreibung, optional Symbol links und Knöpfe rechts.
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.kicker]       kleine Zeile über der Überschrift
 * @param {React.ReactNode} [props.description]
 * @param {React.ComponentType<{size?: number}>} [props.icon]
 * @param {React.ReactNode} [props.media]        statt des Symbols ein eigenes Bild links (z. B. Profilbild, 80 px)
 * @param {React.ReactNode} [props.actions]      rechts neben der Überschrift (bricht auf dem Handy darunter um)
 * @param {"page"|"hero"} [props.size]           hero nur für Startseite und Kategorie-Übersichten
 */
export function PageHeader({ title, kicker, description, icon: Icon, media, actions, size = "page", className = "" }) {
  const hero = size === "hero";
  return (
    <header className={`flex flex-col sm:flex-row sm:items-end gap-4 ${hero ? "mb-10 md:mb-14" : "mb-6 md:mb-8"} ${className}`}>
      <div className={`flex gap-4 md:gap-5 min-w-0 flex-1 ${media ? "items-center" : "items-start"}`}>
        {media && <div className="shrink-0">{media}</div>}
        {!media && Icon && (
          <span className={`hidden sm:flex items-center justify-center shrink-0 rounded-lg bg-accent/10 border border-accent/25 text-accent-soft ${hero ? "w-16 h-16" : "w-12 h-12"}`}>
            <Icon size={hero ? 30 : 22} />
          </span>
        )}
        <div className="min-w-0">
          {kicker && <p className="text-xs font-bold uppercase tracking-widest text-accent-soft/80 mb-2">{kicker}</p>}
          <h1 className={`font-display font-bold tracking-tight text-white break-words ${hero ? "text-3xl md:text-5xl" : "text-2xl md:text-3xl"}`}>{title}</h1>
          {description && (
            <p className={`mt-2 text-white/55 leading-relaxed max-w-2xl ${hero ? "text-sm md:text-base mt-3" : "text-sm"}`}>{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </header>
  );
}

/**
 * Überschrift eines Abschnitts ohne Kasten: Titel links, optional ein ruhiger Textlink rechts („Alle ansehen").
 * Für Seiten, die aus mehreren Abschnitten untereinander bestehen (Startseite, Übersichten).
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {string} [props.id]          für aria-labelledby des Abschnitts
 * @param {string} [props.to]          Ziel des Links rechts
 * @param {React.ReactNode} [props.linkLabel]
 */
export function SectionHeading({ title, id, to, linkLabel = "Alle ansehen", className = "" }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 mb-4 md:mb-5 ${className}`}>
      <h2 id={id} className="font-display text-lg md:text-xl font-bold text-white tracking-tight">{title}</h2>
      {to && (
        <Link to={to} className="group shrink-0 inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white transition-colors">
          {linkLabel}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/**
 * Fläche für Inhaltsblöcke (ersetzt .panel, rounded-md bg-[#0d0d14], bg-[#101016] und Verwandte auf Website-Seiten).
 * Leicht durchscheinend, damit der Hintergrund der Website nicht hart abgeschnitten wirkt.
 */
export function Card({ as: Tag = "div", className = "", children, ...rest }) {
  return <Tag className={`rounded-lg bg-surface/80 border border-line p-5 ${className}`} {...rest}>{children}</Tag>;
}

/**
 * Leerer Zustand / Ladefehler einer Liste: gestrichelter Kasten mit Text und optionalem Knopf.
 * @param {object} props
 * @param {React.ReactNode} props.children   der Text
 * @param {React.ReactNode} [props.action]   z. B. <Button>Erneut versuchen</Button>
 */
export function EmptyState({ children, action, className = "" }) {
  return (
    <div className={`text-center py-14 px-4 rounded-lg border border-dashed border-line bg-white/[0.02] text-sm text-white/45 ${className}`}>
      <p>{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Card mit Kopf: Symbol, kleine Zeile, Titel, Hinweis und optional Knöpfe/Link rechts.
 * Für Seiten mit mehreren Blöcken (Profil, Einstellungen, Statistik).
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ComponentType<{size?: number, className?: string}>} [props.icon]
 * @param {React.ReactNode} [props.kicker]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.actions]
 */
export function Section({ title, icon: Icon, kicker, description, actions, className = "", bodyClassName = "", children }) {
  return (
    <Card as="section" className={`flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {kicker && <p className="text-[11px] font-bold uppercase tracking-widest text-accent-soft/80">{kicker}</p>}
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            {Icon && <Icon size={18} className="text-accent-soft shrink-0" />}
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-white/45 leading-relaxed max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </Card>
  );
}
