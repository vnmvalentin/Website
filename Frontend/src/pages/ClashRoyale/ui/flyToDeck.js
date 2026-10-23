// Karte fliegt ins eigene Deck: Wer eine Karte anklickt, sieht sie in einem Bogen von dort in
// den Deck-Platz fliegen, sobald der Server den Pick bestätigt.
//
// Funktioniert für alle Modi auf einmal, ohne dass ein Modus davon weiß:
//   1. CrShell meldet jeden Klick (pointerdown) an rememberPick(). Liegt in dem angeklickten
//      Knopf ein Kartenbild, merken wir uns Bild-Adresse, Position und eine Kopie des Knopfs —
//      die Kopie JETZT, denn nach dem Pick zeichnet der Modus das Feld meist anders (verwaschen,
//      leer, …).
//   2. Erscheint im DeckGrid (modes/GameChrome.jsx) eine neue Karte mit genau diesem Bild, holt
//      sich der Deck-Platz den Klick (takePick) und lässt die Kopie zu sich fliegen (flyInto).
// Fremde Picks erscheinen weiter mit dem normalen Aufploppen — ihr Bild hat ja niemand hier geklickt.

const MAX_AGE_MS = 2500;     // so lange darf die Server-Bestätigung dauern
const MAX_SOURCE_W = 240;    // größere Knöpfe sind keine Karten (Menüknöpfe, Kacheln)
const FLIGHT_MS = 560;

let last = null;

const animationsOff = () => document.documentElement.dataset.crAnim === 'off';

/** Aus dem globalen pointerdown-Listener (ui/CrShell.jsx). */
export function rememberPick(e) {
  if (animationsOff()) return;
  const el = e.target instanceof Element ? e.target.closest('button, [role="button"]') : null;
  if (!el || el.disabled) return;
  const img = el.querySelector('img');
  const src = img && (img.currentSrc || img.src);
  if (!src) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || rect.width > MAX_SOURCE_W) return;
  last = { src, rect, node: el.cloneNode(true), at: performance.now() };
}

/**
 * Aufheben ohne Klick auf ein Element (3D-Labyrinth: Leertaste) — die Ansicht liefert selbst,
 * wo die Karte gerade auf dem Bildschirm steht, und ein Bild als fliegende Kopie.
 */
export function rememberCustomPick(src, rect) {
  if (animationsOff() || !src || !rect?.width) return;
  const node = document.createElement('img');
  node.src = src;
  node.alt = '';
  node.style.objectFit = 'contain';
  last = { src, rect, node, at: performance.now() };
}

/** Holt den gemerkten Klick ab, wenn er zur neuen Deck-Karte passt (und noch frisch ist). */
export function takePick(src) {
  if (!last || !src || performance.now() - last.at > MAX_AGE_MS) return null;
  if (last.src !== src) return null;
  const pick = last;
  last = null;
  return pick;
}

/**
 * Lässt die Kopie aus `pick` im Bogen auf `targetEl` fliegen. Liefert ein Promise, das nach der
 * Landung erfüllt ist, oder null, wenn das Ziel gerade nicht sichtbar ist (z.B. eingeklappte
 * Seitenleiste auf dem Handy) — dann bleibt es beim normalen Aufploppen.
 */
export function flyInto(pick, targetEl) {
  const to = targetEl?.getBoundingClientRect();
  if (!to || !to.width || !to.height || animationsOff()) return null;
  const from = pick.rect;
  const ghost = pick.node;
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('tabindex', '-1');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`,
    width: `${from.width}px`, height: `${from.height}px`, margin: '0',
    zIndex: '9999', pointerEvents: 'none', transformOrigin: 'top left',
    filter: 'drop-shadow(0 10px 14px rgba(2,8,20,0.55))',
  });
  document.body.appendChild(ghost);
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  // Bogen: erst hoch und leicht gedreht, dann in den Platz schrumpfen
  const lift = Math.min(120, 40 + Math.abs(dx) * 0.15);
  const anim = ghost.animate([
    { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - lift}px) scale(1.18) rotate(-9deg)`, offset: 0.4 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)` },
  ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' });
  const done = () => ghost.remove();
  return anim.finished.then(done, done);
}
