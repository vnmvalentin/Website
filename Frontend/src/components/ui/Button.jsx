// Button.jsx — der eine Knopf für alle Seiten im Website-Layout.
//
// Vorher baute jede Seite ihre Knöpfe selbst (violet-500 und violet-600 gemischt, mal rounded-md,
// mal rounded-lg, Höhen zwischen py-1 und py-4). Hier stehen Farbe, Höhe und Ecken an einer Stelle.
// Mit `to` wird ein Router-Link daraus, mit `href` ein normaler Link — sieht gleich aus.
import React from "react";
import { Link } from "react-router-dom";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap select-none " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft " +
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none";

const VARIANTS = {
  primary: "bg-accent hover:bg-accent-hover text-white disabled:bg-white/5 disabled:text-white/30",
  secondary:
    "bg-white/[0.04] border border-line hover:bg-white/[0.08] hover:border-white/20 text-white/85 hover:text-white " +
    "disabled:bg-white/[0.02] disabled:text-white/30 disabled:border-white/5",
  ghost: "text-white/60 hover:text-white hover:bg-white/5 disabled:text-white/25 disabled:hover:bg-transparent",
  danger: "bg-danger hover:bg-danger-hover text-white disabled:bg-white/5 disabled:text-white/30",
  twitch: "bg-twitch hover:bg-twitch-hover text-white disabled:bg-white/5 disabled:text-white/30",
  discord: "bg-discord hover:bg-discord-hover text-white disabled:bg-white/5 disabled:text-white/30",
};

const SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

// Ein Knopf, der nur ein Symbol zeigt, ist quadratisch
const ICON_ONLY_SIZES = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };

/**
 * @param {object} props
 * @param {"primary"|"secondary"|"ghost"|"danger"|"twitch"|"discord"} [props.variant]
 * @param {"sm"|"md"|"lg"} [props.size]
 * @param {React.ComponentType<{size?: number}>} [props.icon]  Lucide-Symbol (oder BrandGlyphs) vor dem Text
 * @param {string} [props.to]     interner Link (react-router)
 * @param {string} [props.href]   externer Link, öffnet in neuem Tab
 * @param {boolean} [props.block] volle Breite
 * @param {boolean} [props.loading] zeigt `loadingText` und sperrt den Knopf
 * @param {string} [props.loadingText]
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  to,
  href,
  block = false,
  loading = false,
  loadingText,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}) {
  if (!VARIANTS[variant]) console.warn(`Button: unbekannte Variante "${variant}"`);
  const iconOnly = Icon && (children === undefined || children === null || children === false);
  const sizeClass = iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size] || SIZES.md;
  const classes = [BASE, VARIANTS[variant] || VARIANTS.primary, sizeClass, block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;
  const isDisabled = disabled || loading;

  const content = (
    <>
      {Icon && <Icon size={iconSize} />}
      {loading && loadingText ? loadingText : children}
    </>
  );

  // Links kennen kein disabled — dann bleibt es ein Link, der per aria-disabled nicht klickbar ist
  if (to) {
    return (
      <Link to={to} className={classes} aria-disabled={isDisabled || undefined} tabIndex={isDisabled ? -1 : undefined} {...rest}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}
        aria-disabled={isDisabled || undefined} tabIndex={isDisabled ? -1 : undefined} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} disabled={isDisabled} className={classes} {...rest}>
      {content}
    </button>
  );
}
