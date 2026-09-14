// Chunky 3D-Button im Clash-Royale-Arcade-Look — siehe .cr-arcade-btn in index.css für
// den harten Schatten, der beim Klick verschwindet und den Button exakt um die
// Schattentiefe nach unten rutschen lässt (physischer Tastendruck).
//
// variant trägt die BEDEUTUNG der Aktion, nicht nur die Farbe:
//   blue  = neutrale Aktion (Standard)
//   green = Bestätigen / Start
//   gold  = Hervorhebung (z.B. der wichtigste Menüpunkt)
//   red   = Gefahr / Verlassen / Abbrechen
import React from 'react';

const VARIANT_CLASS = {
  blue: 'cr-arcade-btn--blue',
  green: 'cr-arcade-btn--green',
  gold: 'cr-arcade-btn--gold',
  red: 'cr-arcade-btn--red',
};

const SIZE_CLASS = { sm: 'cr-arcade-btn--sm', md: '', lg: 'cr-arcade-btn--lg' };
const ICON_SIZE = { sm: 14, md: 17, lg: 21 };

const ChunkyButton = React.forwardRef(function ChunkyButton(
  {
    variant = 'blue', size = 'md', block = false,
    icon: Icon, iconSrc, iconSize, className = '', children, ...props
  },
  ref
) {
  const px = iconSize ?? ICON_SIZE[size] ?? ICON_SIZE.md;
  return (
    <button
      ref={ref}
      {...props}
      className={[
        'cr-arcade-btn', 'font-arcade',
        VARIANT_CLASS[variant] || VARIANT_CLASS.blue,
        SIZE_CLASS[size] || '',
        block ? 'cr-arcade-btn--block' : '',
        className,
      ].filter(Boolean).join(' ')}>
      {/* iconSrc = echtes Clash-Royale-UI-Symbol (RoyaleAPI-CDN, lokal gespeichert),
          icon = lucide-Symbol als Fallback/Alternative — nie beide gleichzeitig nötig. */}
      {iconSrc && <img src={iconSrc} alt="" width={px} height={px} className="shrink-0" style={{ width: px, height: px }} />}
      {!iconSrc && Icon && <Icon size={px} />}
      {children}
    </button>
  );
});

export default ChunkyButton;
