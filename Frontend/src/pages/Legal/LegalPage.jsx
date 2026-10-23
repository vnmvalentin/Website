// LegalPage.jsx — gemeinsamer Rahmen der Rechtsseiten (Impressum, Datenschutz, AGB, Widerruf):
// Überschrift, Stand, Hinweis auf fehlende Betreiber-Angaben, und die Bausteine für Abschnitte.
import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import NotFound from "../NotFound";
import { LEGAL, LEGAL_LINKS, legalMissing, salesVisible } from "../../config/legal";

export function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
      <div className="text-white/65 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function List({ items }) {
  return (
    <ul className="list-disc list-outside pl-5 space-y-1.5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

/** Name und Anschrift des Betreibers, wie sie in allen vier Texten stehen. */
export function Operator() {
  return (
    <address className="not-italic text-white/85">
      {LEGAL.businessName && <>{LEGAL.businessName}<br /></>}
      {LEGAL.name || "[Name fehlt]"}<br />
      {LEGAL.street || "[Straße fehlt]"}<br />
      {LEGAL.zipCity || "[PLZ und Ort fehlen]"}<br />
      {LEGAL.country}
    </address>
  );
}

export const Mail = () => (LEGAL.email ? <a className="text-violet-300 hover:text-violet-200" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> : <span>[E-Mail fehlt]</span>);

export default function LegalPage({ title, description, path, children }) {
  // Unvollständige Rechtsseiten gibt es auf der veröffentlichten Website nicht (siehe config/legal.js)
  if (!salesVisible()) return <NotFound />;
  const missing = legalMissing();
  return (
    <div className="max-w-3xl mx-auto px-1 md:px-2 py-6 md:py-10 text-white">
      <SEO title={title} description={description} path={path} />
      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-white/35 text-xs mt-2 mb-8">Stand: {LEGAL.stand}</p>

      {missing.length > 0 && (
        <div className="mb-8 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-bold">Diese Seite ist noch unvollständig.</p>
          <p className="mt-1 text-amber-100/80">Es fehlen: {missing.join(", ")}.</p>
        </div>
      )}

      <div className="space-y-8">{children}</div>

      <nav className="mt-12 pt-6 border-t border-white/10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
        {LEGAL_LINKS.filter((l) => l.to !== path).map((l) => (
          <Link key={l.to} to={l.to} className="hover:text-white transition-colors">{l.label}</Link>
        ))}
      </nav>
    </div>
  );
}
