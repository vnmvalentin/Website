// Kleine Bilder fliegen in einem Bogen von A nach B (z.B. Elixiertropfen vom eigenen Vorrat auf
// die Karte, auf die man bietet). Reine Deko: hängt Elemente an <body>, animiert sie per Web
// Animations API und entfernt sie wieder. Mit ausgeschalteten Animationen passiert nichts.

const animationsOff = () => document.documentElement.dataset.crAnim === 'off';

/**
 * @param {DOMRect} from   Start (Mitte des Rechtecks)
 * @param {DOMRect} to     Ziel (zufälliger Punkt nahe der Mitte)
 * @param {number}  count  Anzahl Teilchen
 * @param {string}  src    Bildquelle
 * @param {number}  size   Größe in px
 * @returns {number} ms, bis das letzte Teilchen gelandet ist (0, wenn nichts fliegt)
 */
export function flyParticles({ from, to, count, src, size = 22 }) {
  if (animationsOff() || !from || !to) return 0;
  let longest = 0;
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('img');
    el.src = src;
    el.alt = '';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed', left: `${fx - size / 2}px`, top: `${fy - size / 2}px`, width: `${size}px`, height: 'auto',
      zIndex: '9999', pointerEvents: 'none', filter: 'drop-shadow(0 3px 3px rgba(2,8,20,0.5))',
    });
    document.body.appendChild(el);
    const jx = (Math.random() - 0.5) * 40, jy = (Math.random() - 0.5) * 20;
    const ex = tx - fx + (Math.random() - 0.5) * to.width * 0.5;
    const ey = ty - fy + (Math.random() - 0.5) * to.height * 0.4;
    const lift = 80 + Math.random() * 90;
    const spin = (Math.random() - 0.5) * 220;
    const duration = 520 + Math.random() * 180;
    longest = Math.max(longest, i * 38 + duration);
    const anim = el.animate([
      { transform: `translate(${jx}px, ${jy}px) scale(0.6) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${ex * 0.45 + jx}px, ${ey * 0.45 - lift}px) scale(1.15) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${ex}px, ${ey}px) scale(0.5) rotate(${spin}deg)`, opacity: 0.2 },
    ], { duration, delay: i * 38, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'backwards' });
    const done = () => el.remove();
    anim.finished.then(done, done);
  }
  return longest;
}
