// lowGfx.js — erkennt, ob der Browser ohne Hardwarebeschleunigung läuft (Grafik nur per Prozessor).
//
// Dann malt der Prozessor jede CSS-Animation, jeden Weichzeichner und jede 3D-Szene selbst — die Seite ruckelt.
// main.jsx ruft applyLowGfxFlag() einmal beim Start auf: Bei schwacher Grafik bekommt <html> data-low-gfx,
// index.css schaltet darüber Animationen/Übergänge/Weichzeichner ab, useTilt neigt nichts mehr, und die
// Clash-Royale-Minigames starten mit Animationen und 3D-Ansicht aus (ui/crPrefs.js; eigene Wahl gewinnt).
//
// Erkennung über eine WebGL-Probe:
//  - gar kein WebGL → Grafik blockiert (meist: Hardwarebeschleunigung aus und kein Software-Ersatz)
//  - failIfMajorPerformanceCaveat schlägt fehl, normales WebGL aber nicht → Software-Rendering
//  - Renderer-Name nennt einen Software-Renderer (SwiftShader, llvmpipe, Microsoft Basic Render Driver …)
//
// Zum Ausprobieren: ?gfx=low erzwingt den Sparmodus, ?gfx=full schaltet ihn ab, ?gfx=auto erkennt wieder selbst
// (wird im localStorage gemerkt).

const OVERRIDE_KEY = 'gfxMode';
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;

let cached = null;

function probeContext(canvas, attrs) {
  try {
    return canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch {
    return null;
  }
}

function releaseContext(gl) {
  // Browser erlauben nur wenige gleichzeitige WebGL-Kontexte — die Probe gleich wieder freigeben
  try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* egal */ }
}

function detect() {
  if (typeof document === 'undefined') return false;

  // Eigene Probe-Canvas je Versuch: ein Canvas liefert nach dem ersten getContext immer denselben Kontext
  const strictGl = probeContext(document.createElement('canvas'), { failIfMajorPerformanceCaveat: true });
  if (strictGl) {
    let renderer = '';
    try {
      const info = strictGl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(strictGl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : strictGl.RENDERER) || '');
    } catch { /* Name nicht lesbar — dann zählt nur die Probe */ }
    releaseContext(strictGl);
    return SOFTWARE_RENDERER.test(renderer);
  }

  // Strenge Probe fehlgeschlagen: Software-Rendering oder gar kein WebGL — beides heißt sparen
  const looseGl = probeContext(document.createElement('canvas'), {});
  releaseContext(looseGl);
  return true;
}

function readOverride() {
  try {
    const param = new URLSearchParams(window.location.search).get('gfx');
    if (param === 'low' || param === 'full') localStorage.setItem(OVERRIDE_KEY, param);
    else if (param === 'auto') localStorage.removeItem(OVERRIDE_KEY);
    return localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

// OBS-Browserquellen und Overlay-Seiten nie drosseln: Dort soll die Animation laufen, auch wenn
// die Browserquelle ohne Hardwarebeschleunigung eingestellt ist (dann entscheidet der Streamer selbst).
function isOverlayContext() {
  try {
    return !!window.obsstudio || /overlay/i.test(window.location.pathname);
  } catch {
    return false;
  }
}

/** true, wenn die Grafik nur per Software läuft (Ergebnis wird einmal ermittelt und gemerkt). */
export function isLowGfx() {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  if (isOverlayContext()) { cached = false; return cached; }
  const override = readOverride();
  if (override === 'low') cached = true;
  else if (override === 'full') cached = false;
  else {
    try { cached = detect(); } catch { cached = false; }
  }
  return cached;
}

/** Setzt data-low-gfx auf <html>, falls nötig. Einmal beim Start aufrufen. */
export function applyLowGfxFlag() {
  if (typeof document === 'undefined') return;
  if (isLowGfx()) document.documentElement.dataset.lowGfx = '';
  else delete document.documentElement.dataset.lowGfx;
}
