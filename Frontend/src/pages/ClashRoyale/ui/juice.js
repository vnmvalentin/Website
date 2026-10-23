// Effekt-Baukasten für die Minigames: Funken, Ringe, schwebende Texte, große Banner, Wackeln,
// Stempel. Alles hängt kurzlebige Elemente an <body> (position: fixed, über allem) und
// animiert per Web Animations API — kein React-Zustand, keine Abhängigkeit, kein Re-Render.
// Mit ausgeschaltetem Animations-Schalter (CR-Einstellungen) passiert gar nichts.
//
// Ziel ist immer ein Element oder ein DOMRect; Farben als CSS-Farbe.

const off = () => typeof document === 'undefined' || document.documentElement.dataset.crAnim === 'off';
const rectOf = (target) => (target?.getBoundingClientRect ? target.getBoundingClientRect() : target);
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function layer(styles) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '9998', ...styles });
  document.body.appendChild(el);
  return el;
}
const removeAfter = (anim, el) => { const done = () => el.remove(); anim.finished.then(done, done); };

/**
 * Funkenexplosion aus der Mitte eines Elements: Splitter fliegen mit Schwerkraft auseinander.
 * @param {object} o  { color = '#ffd34d', count = 18, spread = 120, size = 7, colors }
 */
export function sparkBurst(target, { color = '#ffd34d', colors, count = 18, spread = 120, size = 7 } = {}) {
  const r = rectOf(target);
  if (off() || !r) return;
  const { x, y } = center(r);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const dist = spread * (0.45 + Math.random() * 0.75);
    const s = size * (0.6 + Math.random() * 0.8);
    const el = layer({
      left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s * (Math.random() < 0.5 ? 1 : 1.8)}px`,
      background: colors ? colors[i % colors.length] : color, borderRadius: '2px',
    });
    const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist;
    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - 30}px) rotate(${Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy + 40}px) rotate(${Math.random() * 540}deg) scale(0.3)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(0.15, 0.7, 0.4, 1)' });
    removeAfter(anim, el);
  }
}

/** Ring, der sich vom Element aus ausbreitet (Stoßwelle). */
export function ringPulse(target, { color = '#ffffff', width = 4, scale = 2.4, duration = 550 } = {}) {
  const r = rectOf(target);
  if (off() || !r) return;
  const size = Math.max(r.width, r.height);
  const { x, y } = center(r);
  const el = layer({
    left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`,
    border: `${width}px solid ${color}`, borderRadius: '50%',
  });
  const anim = el.animate([
    { transform: 'scale(0.5)', opacity: 0.95 },
    { transform: `scale(${scale})`, opacity: 0 },
  ], { duration, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  removeAfter(anim, el);
}

/** Text, der über einem Element aufsteigt und verblasst ("+1", "-12", "BLOCKIERT"). */
export function floatText(target, text, { color = '#ffffff', size = 26, rise = 60, duration = 1000 } = {}) {
  const r = rectOf(target);
  if (off() || !r) return;
  const { x, y } = center(r);
  const el = layer({
    left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap',
    fontFamily: 'var(--font-cr)', fontSize: `${size}px`, color, textShadow: 'var(--cr-text-outline)',
  });
  el.textContent = text;
  const anim = el.animate([
    { transform: 'translate(-50%, -30%) scale(0.4)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.18 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
    { transform: `translate(-50%, calc(-50% - ${rise}px)) scale(1)`, opacity: 0 },
  ], { duration, easing: 'ease-out' });
  removeAfter(anim, el);
}

/**
 * Großes Banner quer über den Bildschirm ("BINGO!", "FALLE!"): knallt in die Mitte, steht kurz,
 * verschwindet nach oben. Optional mit Untertitel.
 */
// within: Element/DOMRect, über dessen Mitte das Banner steht (sonst Fenstermitte) — die Schrift
// wird dann auch auf dessen Breite gedeckelt. inline: sub in derselben Zeile statt darunter.
export function bigBanner(text, { color = '#ffd34d', sub = '', duration = 1700, within = null, inline = false } = {}) {
  if (off()) return;
  const area = within ? rectOf(within) : null;
  const el = layer({
    left: area ? `${area.left + area.width / 2}px` : '50%',
    top: area ? `${area.top + area.height * 0.42}px` : '42%',
    transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: '9999',
  });
  const main = document.createElement('div');
  Object.assign(main.style, {
    fontFamily: 'var(--font-cr)', lineHeight: '1', color,
    fontSize: area ? `clamp(36px, min(9vw, ${Math.round(area.width / 6)}px), 112px)` : 'clamp(48px, 9vw, 112px)',
    textShadow: 'var(--cr-text-outline-thick)', whiteSpace: 'nowrap',
  });
  main.textContent = text;
  el.appendChild(main);
  if (sub && inline) {
    const s = document.createElement('span');
    Object.assign(s.style, { color: '#fff', fontSize: '0.55em', marginLeft: '0.15em' });
    s.textContent = sub;
    main.appendChild(s);
  } else if (sub) {
    const s = document.createElement('div');
    Object.assign(s.style, { fontFamily: 'var(--font-cr)', fontSize: 'clamp(16px, 2.2vw, 26px)', color: '#fff', textShadow: 'var(--cr-text-outline)', marginTop: '6px' });
    s.textContent = sub;
    el.appendChild(s);
  }
  const anim = el.animate([
    { transform: 'translate(-50%, -50%) scale(3) rotate(-8deg)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(0.92) rotate(2deg)', opacity: 1, offset: 0.12 },
    { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.78 },
    { transform: 'translate(-50%, -90%) scale(0.9)', opacity: 0 },
  ], { duration, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  removeAfter(anim, el);
}

/** Element kurz durchschütteln (Treffer, Fehlgriff, Explosion). */
export function shake(target, { intensity = 8, duration = 380 } = {}) {
  if (off() || !target?.animate) return;
  const k = intensity;
  target.animate([
    { translate: '0 0' }, { translate: `${-k}px ${k * 0.3}px` }, { translate: `${k}px ${-k * 0.3}px` },
    { translate: `${-k * 0.6}px 0` }, { translate: `${k * 0.4}px 0` }, { translate: '0 0' },
  ], { duration, easing: 'ease-out' });
}

/** Farbiger Lichtblitz über einem Element (z.B. Aufleuchten beim Kauf). */
export function flash(target, { color = '#ffffff', duration = 420 } = {}) {
  const r = rectOf(target);
  if (off() || !r) return;
  const el = layer({
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    background: color, borderRadius: '14px', mixBlendMode: 'screen',
  });
  const anim = el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration, easing: 'ease-out' });
  removeAfter(anim, el);
}

/** Stempel schräg über einem Element (wie VERKAUFT! in der Auktion). */
export function stamp(target, text, { color = '#ffd34d', duration = 1100 } = {}) {
  const r = rectOf(target);
  if (off() || !r) return;
  const { x, y } = center(r);
  const el = layer({
    left: `${x}px`, top: `${y}px`, whiteSpace: 'nowrap', zIndex: '9999',
    fontFamily: 'var(--font-cr)', fontSize: `${Math.max(16, Math.min(34, r.width * 0.16))}px`, color: '#fff',
    textShadow: 'var(--cr-text-outline)', padding: '0.1em 0.45em', border: `4px solid ${color}`, borderRadius: '12px',
    background: 'rgba(6,10,24,0.6)',
  });
  el.textContent = text;
  const anim = el.animate([
    { transform: 'translate(-50%, -50%) rotate(-12deg) scale(3)', opacity: 0 },
    { transform: 'translate(-50%, -50%) rotate(-12deg) scale(0.9)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%, -50%) rotate(-12deg) scale(1)', opacity: 1, offset: 0.3 },
    { transform: 'translate(-50%, -50%) rotate(-12deg) scale(1)', opacity: 1, offset: 0.8 },
    { transform: 'translate(-50%, -50%) rotate(-12deg) scale(1.05)', opacity: 0 },
  ], { duration, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
  removeAfter(anim, el);
}

/** Konfetti von oben über den ganzen Bildschirm (Bingo, Rundengewinn). */
export function confetti({ colors = ['#ffd34d', '#ff5fa2', '#5fd0ff', '#7cff8a', '#c58bff'], count = 70 } = {}) {
  if (off()) return;
  const w = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const s = 6 + Math.random() * 7;
    const el = layer({
      left: `${Math.random() * w}px`, top: '-20px', width: `${s}px`, height: `${s * 1.6}px`,
      background: colors[i % colors.length], borderRadius: '2px',
    });
    const drift = (Math.random() - 0.5) * 220;
    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${window.innerHeight * 1.05}px) rotate(${(Math.random() - 0.5) * 900}deg)`, opacity: 0.9 },
    ], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(0.3, 0.2, 0.6, 1)', fill: 'backwards' });
    removeAfter(anim, el);
  }
}
