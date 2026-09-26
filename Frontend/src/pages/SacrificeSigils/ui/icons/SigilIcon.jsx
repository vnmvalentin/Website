// ui/icons/SigilIcon.jsx — alle Sigil-Icons in einem Stil: Tuschelinie (1,5 px) auf Pergamentscheibe, keine Füllflächen
// außer Rot-Akzenten. Jede Glyphe ist in einem 24×24-Raster gezeichnet; die Scheibe liegt darunter.
import React from "react";
import { parseSigil } from "../../engine/sigils/index.js";

const RED = "#8e1b1b";

/** @type {Record<string, (n: number) => React.ReactNode>} */
const GLYPHS = {
  schwinge: () => (<><path d="M4 15c3-7 9-10 16-10-2 3-4 4-7 5 2 0 4 0 5 1-3 2-6 3-9 3 2 1 3 1 5 1-4 2-7 2-10 0z" /><path d="M7 13l6-4" /></>),
  hochwuchs: () => (<><path d="M12 20V5" /><path d="M8 9l4-4 4 4" /><path d="M12 14c-3-1-5-3-5-6M12 17c3-1 5-3 5-6" /></>),
  tauchgang: () => (<><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M12 15v6M9.5 18.5L12 21l2.5-2.5" /></>),
  wanderer: () => (<><path d="M4 12h14M14 8l4 4-4 4" /><path d="M6 17c0 1 1 2 2 2M6 7c0-1 1-2 2-2" /></>),
  grabwuehler: () => (<><path d="M3 19c3-5 15-5 18 0" /><path d="M12 4v9M9 10l3 3 3-3" /><path d="M7 16l1-1M16 16l1-1M12 17v-1" /></>),
  fluchtreflex: () => (<><path d="M5 12h14" /><path d="M8 9l-3 3 3 3M16 9l3 3-3 3" /><path d="M12 6v2M12 16v2" /></>),
  rammbock: () => (<><path d="M4 12h9" /><path d="M13 7c4 0 6 2 6 5s-2 5-6 5" /><path d="M13 7c-2 1-2 3 0 3M13 17c-2-1-2-3 0-3" /><path d="M20 6v12" /></>),
  vorpreschen: () => (<><path d="M6 13l6-6 6 6" /><path d="M6 19l6-6 6 6" /></>),
  dreizack: () => (<><path d="M12 21V8" /><path d="M6 4v5c0 2 3 3 6 3s6-1 6-3V4" /><path d="M12 3v5M6 4l-1 2M18 4l1 2M12 3l-1 2" /></>),
  gabelstoss: () => (<><path d="M12 21v-8" /><path d="M12 13L6 5M12 13l6-8" /><path d="M6 5l-1 3M18 5l1 3" /></>),
  zwillingsbiss: () => (<><path d="M4 7c5 2 11 2 16 0" /><path d="M7 8l2 8 2-7M13 9l2 7 2-8" /></>),
  todesstachel: () => (<><path d="M5 5c6 1 10 5 12 12" /><path d="M17 17l2 4-4-2" /><path d="M8 10l2-1M11 13l2-1" /><circle cx="19.5" cy="21" r="0.1" /><path d="M20 20c1 1 1 2 0 2.5" stroke={RED} /></>),
  wucht: () => (<><path d="M3 12h8" /><path d="M11 8l5 4-5 4z" /><path d="M18 6l3-2M18 18l3 2M19 12h3" /></>),
  aderlass: () => (<><path d="M12 3c-3 5-5 7-5 10a5 5 0 0010 0c0-3-2-5-5-10z" stroke={RED} /><path d="M4 20l5-5M4 20h4M4 20v-4" /></>),
  durchbohren: () => (<><circle cx="12" cy="12" r="5" /><path d="M2 12h20M18 8l4 4-4 4" /></>),
  hinterhalt: () => (<><path d="M4 16c2-4 4-6 8-6s6 2 8 6" /><circle cx="12" cy="15" r="1.6" /><path d="M5 20c2-2 4-2 6 0M13 20c2-2 4-2 6 0" /><path d="M12 3v4M9 5l3 2 3-2" /></>),
  rudelruf: () => (<><path d="M5 15l2-5 2 3M10 12l2-6 2 6M15 13l2-3 2 5" /><path d="M4 19h16" /></>),
  rachsucht: () => (<><path d="M12 21c-4 0-6-3-6-6 0-4 4-5 4-10 3 2 3 5 2 7 2-1 3-3 3-5 2 3 3 5 3 8 0 3-2 6-6 6z" /><path d="M10 16h4" stroke={RED} /></>),
  ruestungsbrecher: () => (<><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M13 5l-3 5 4 2-3 6" stroke={RED} /></>),
  spiegelbild: () => (<><path d="M12 3v18" /><path d="M9 7L4 12l5 5" /><path d="M15 7l5 5-5 5" strokeDasharray="2 2" /></>),
  dornenkleid: (n) => (<><path d="M4 18c4-2 6-6 8-12 2 6 4 10 8 12" /><path d="M7 15l-2-1M9 11l-2-2M15 11l2-2M17 15l2-1M12 6V3" />{n > 1 && <text x="18" y="7" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  schildrinde: () => (<><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 8v8M12 7v10M15 8v8" /></>),
  panzer: (n) => (<><path d="M4 14c0-5 4-9 8-9s8 4 8 9" /><path d="M4 14h16M8 14c0-4 2-7 4-7s4 3 4 7M12 7v7" /><path d="M6 18h12" />{n > 1 && <text x="18" y="22" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  wiedergaenger: () => (<><path d="M8 12a4 4 0 118 0v3H8z" /><path d="M10 12h.1M14 12h.1M10 15v2M14 15v2" /><path d="M18 5a8 8 0 00-12 0M6 5v3h3" /></>),
  leibwaechter: () => (<><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><circle cx="12" cy="10" r="2" /><path d="M9 16c0-2 1-3 3-3s3 1 3 3" /></>),
  moosheilung: (n) => (<><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19l8-8" /><path d="M16 14v6M13 17h6" stroke={RED} />{n > 1 && <text x="3" y="7" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  haeutung: () => (<><path d="M4 16c3 0 3-4 6-4s3 4 6 4 3-4 5-4" strokeDasharray="2 1.6" /><path d="M4 11c3 0 3-4 6-4s3 4 6 4" /></>),
  koeder: () => (<><path d="M12 3v11a4 4 0 01-8 0v-2" /><path d="M4 12l2 2" /><circle cx="12" cy="3" r="1" /><path d="M16 9c2 0 3 1 3 3" stroke={RED} /></>),
  knochenmark: () => (<><path d="M7 17l10-10" /><path d="M5 15a2 2 0 102 4 2 2 0 104-2M15 5a2 2 0 102 4 2 2 0 102-4" /><path d="M11 13h.1M13 11h.1" stroke={RED} /></>),
  markleicht: () => (<><path d="M8 16l8-8" /><path d="M6 14a1.8 1.8 0 102 3 1.8 1.8 0 103-1M14 6a1.8 1.8 0 102 3 1.8 1.8 0 102-3" /></>),
  dreifachblut: () => (<><path d="M6 4c-2 3-3 4-3 6a3 3 0 006 0c0-2-1-3-3-6zM18 4c-2 3-3 4-3 6a3 3 0 006 0c0-2-1-3-3-6zM12 11c-2 3-3 4-3 6a3 3 0 006 0c0-2-1-3-3-6z" stroke={RED} /></>),
  ewigesopfer: () => (<><path d="M12 12c-2-3-6-3-6 0s4 3 6 0 6-3 6 0-4 3-6 0" /><path d="M12 5c-1 2-2 2.5-2 3.5a2 2 0 004 0c0-1-1-1.5-2-3.5z" stroke={RED} /></>),
  aschenspende: () => (<><path d="M7 9h10l-1 10H8z" /><path d="M6 9h12" /><path d="M10 5l1 3M14 4l-1 4" /><path d="M9 14h6" /></>),
  wachsgabe: () => (<><path d="M9 9h6v11H9z" /><path d="M12 9V6" /><path d="M12 3c-1 1-1 2 0 3 1-1 1-2 0-3z" stroke={RED} /><path d="M15 12c1 1 1 2 0 3" /><path d="M18 5v4M16 7h4" /></>),
  wachsquelle: (n) => (<><path d="M9 10h6v10H9z" /><path d="M12 10V7" /><path d="M12 3c-1.5 1.5-1.5 3 0 4 1.5-1 1.5-2.5 0-4z" stroke={RED} /><path d="M5 14h2M17 14h2M6 10l1 1M18 10l-1 1" />{n > 1 && <text x="17" y="22" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  blutschuld: () => (<><path d="M12 3v16M6 19h12" /><path d="M4 8h16" /><path d="M4 8l-2 5h4zM20 8l-2 5h4z" /><path d="M20 11.5h.1" stroke={RED} /></>),
  brut: () => (<><ellipse cx="8" cy="14" rx="3" ry="4" /><ellipse cx="16" cy="14" rx="3" ry="4" /><ellipse cx="12" cy="9" rx="3" ry="4" /></>),
  metamorphose: () => (<><path d="M12 4c2 3 2 13 0 16-2-3-2-13 0-16z" /><path d="M12 9c3-4 8-3 8 0s-5 4-8 2M12 9c-3-4-8-3-8 0s5 4 8 2" strokeDasharray="1.8 1.4" /></>),
  nachgeburt: () => (<><path d="M4 19h16" /><path d="M12 19v-7" /><path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 12c2 0 4-2 4-4-2 0-4 2-4 4z" /><path d="M8 22l1-2M16 22l-1-2" /></>),
  kundschafter: (n) => (<><path d="M3 12c3-5 15-5 18 0-3 5-15 5-18 0z" /><circle cx="12" cy="12" r="2.5" /><path d="M17 4h4v6" />{n > 1 && <text x="3" y="7" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  seher: () => (<><path d="M3 12c3-5 15-5 18 0-3 5-15 5-18 0z" /><circle cx="12" cy="12" r="2" /><path d="M8 3l1 3M12 2v3M16 3l-1 3" /><path d="M8 21l1-3M12 22v-3M16 21l-1-3" /></>),
  faeulnis: (n) => (<><path d="M6 11a6 6 0 0112 0H6z" /><path d="M9 11v5M15 11v5M12 11v3" /><path d="M9 18v2M15 18v1.5" stroke={RED} />{n > 1 && <text x="17" y="22" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  stinkdruese: () => (<><path d="M7 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M17 20c-2-3 2-5 0-8s2-5 0-8" /></>),
  leittier: (n) => (<><path d="M7 10l2-5 3 3 3-3 2 5z" /><path d="M7 10h10" /><path d="M3 16h5M16 16h5M5 14l-2 2 2 2M19 14l2 2-2 2" />{n > 1 && <text x="10" y="21" fontSize="6" stroke="none" fill={RED}>{n}</text>}</>),
  nesthueter: () => (<><path d="M3 13c2 6 16 6 18 0" /><path d="M4 14c3 2 13 2 16 0M5 16l3-1M19 16l-3-1" /><ellipse cx="12" cy="10" rx="3" ry="3.6" /></>),
  kerzendocht: (n) => (<><path d="M8 11h8v10H8z" /><path d="M12 11V8" /><path d="M12 3c-1.5 1.8-1.5 3.2 0 4.5 1.5-1.3 1.5-2.7 0-4.5z" stroke={RED} /><text x="12" y="19" fontSize="7.5" textAnchor="middle" stroke="none" fill="#1a1612" fontFamily="IM Fell English, serif">{n}</text></>),
  hunger: () => (<><path d="M4 9c4-4 12-4 16 0" /><path d="M4 15c4 4 12 4 16 0" /><path d="M7 9l1 3 1-3 1 3 1-3 1 3 1-3 1 3 1-3 1 3 1-3" /><path d="M7 15l1-2 2 2 2-2 2 2 2-2 1 2" /></>),
  glockenschlag: () => (<><path d="M7 16c0-6 1-10 5-10s5 4 5 10z" /><path d="M5 16h14" /><path d="M12 6V4" /><circle cx="12" cy="18.5" r="1.5" /><path d="M3 9l2 1M21 9l-2 1" /></>),
  fluchmal: () => (<><path d="M3 12c3-5 15-5 18 0-3 5-15 5-18 0z" stroke={RED} /><path d="M12 8v8M8 12h8" /><path d="M9 9l6 6M15 9l-6 6" /></>),
};

/**
 * @param {{ sigil: string, size?: number, title?: string, className?: string, dim?: boolean, aura?: boolean }} props
 */
export default function SigilIcon({ sigil, size = 24, title, className = "", dim = false, aura = false }) {
  const { id, n } = parseSigil(sigil);
  const glyph = GLYPHS[id];
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ opacity: dim ? 0.45 : 1, flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <circle cx="14" cy="14" r="13" fill="#d9c9a3" stroke={aura ? "#b08d57" : "#6f5a3a"} strokeWidth={aura ? 1.6 : 1} strokeDasharray={aura ? "2.5 1.8" : undefined} />
      <circle cx="14" cy="14" r="11.4" fill="none" stroke="#a8966c" strokeWidth="0.6" />
      <g transform="translate(2 2)" fill="none" stroke="#1a1612" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {glyph ? glyph(n) : <text x="12" y="16" fontSize="10" textAnchor="middle" stroke="none" fill="#1a1612">?</text>}
      </g>
    </svg>
  );
}
