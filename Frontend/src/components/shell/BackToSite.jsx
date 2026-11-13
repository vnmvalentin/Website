// BackToSite.jsx — der Weg aus einem Spiel zurück auf die Website, in allen Spiel-Hüllen gleich:
// gleiches Ziel (die Spiele-Übersicht /fun, dort stehen auch Impressum und Datenschutz unten), gleiches
// Symbol, gleicher Text („Website“, auf dem Handy nur das Symbol) und gleicher Hinweis beim Überfahren.
// Das Aussehen bringt jede Hülle selbst mit (className = ihr eigener kleiner Knopf).
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftToLine } from "lucide-react";

export const BACK_TO_SITE_PATH = "/fun";

/**
 * @param {object} props
 * @param {string} props.className   Knopf-Klassen der Hülle (z. B. "bv-btn bv-btn-sm bv-btn-ghost")
 * @param {number} [props.iconSize]
 * @param {boolean} [props.alwaysLabel]  Text auch auf dem Handy zeigen (z. B. Startbildschirme mit viel Platz)
 * @param {string} [props.label]        anderer Text, etwa für übersetzte Spiele
 * @param {string} [props.title]
 */
export default function BackToSite({ className = "", iconSize = 16, alwaysLabel = false, label = "Website", title = "Zurück zur Website" }) {
  return (
    <Link to={BACK_TO_SITE_PATH} className={className} title={title} aria-label={title}>
      <ArrowLeftToLine size={iconSize} aria-hidden="true" />
      <span className={alwaysLabel ? "" : "hidden sm:inline"}>{label}</span>
    </Link>
  );
}
