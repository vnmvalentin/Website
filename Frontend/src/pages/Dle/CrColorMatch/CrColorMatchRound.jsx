// CrColorMatchRound.jsx — eine einzelne Rate-Runde. Anders als die reine Farbwähler-Version
// zuvor: die Karte selbst ist die ganze Zeit groß sichtbar, aber die gefragte Fläche wird
// live mit deiner aktuellen Regler-Wahl eingefärbt ("Ausmal-Effekt") — du siehst also direkt
// im Kartenkontext, wie deine Farbe wirkt, statt sie nur isoliert in einem Farbfeld zu
// vergleichen (dasselbe Prinzip wie bei Avatar-/Charakter-Farbabgleich-Tools).
//
// Technik: die Karte wird per Canvas gezeichnet (nicht als <img>), damit wir die Pixel der
// gefragten Fläche live überschreiben können. Welche Pixel "zur gefragten Fläche gehören"
// kommt bevorzugt aus `round.polygons` — von Hand mit tools/admin-lasso.html gezeichnete
// Konturen (eine oder mehrere, für getrennte Flächen wie Rascals' zwei Mützen), pixelgenau
// per Punkt-in-Polygon-Test in eine Maske umgerechnet (siehe buildMaskFromPolygons).
//
// Eine frühere Version erkannte die Fläche automatisch per Klick-Punkt + Farbabstand-Schwelle
// (siehe buildColorMask/buildMaskFromPoint unten) — das griff aber selbst mit Reglern zum
// Nachjustieren zuverlässig auch Nachbarbereiche, die farblich zufällig ähnlich waren, aber
// nicht zur gefragten Fläche gehörten (echte Kartenkunst hat dafür zu viel Schattierung/
// Verlauf/Nachbarfarben). Dieser automatische Pfad bleibt nur noch als FALLBACK für Einträge
// ohne `polygons` (noch nicht auf die neue Lasso-Kalibrierung umgestellt) — sobald ein Eintrag
// `polygons` hat, wird ausschließlich das benutzt.
//
// Die drei Regler setzen Farbton und Sättigung EINHEITLICH für alle betroffenen Pixel — die
// HELLIGKEIT dagegen bleibt pro Pixel die des Originalbilds (klassisches "Kolorieren", wie
// eine Photoshop-Farbton/Sättigung-Ebene im "Färben"-Modus): so bleiben Schattierung, Falten
// und Glanzlichter der echten Kartenkunst sichtbar, nur eben in der eigenen Farbe statt der
// echten — flaches Einfarben ohne jede Schattierung sah dagegen aus wie unvollständig
// eingefärbt. Die EINGEREICHTE Schätzung ist trotzdem weiterhin genau EIN Hexcode (Regler-HSL
// mit fester, mittlerer Helligkeit) — nur die Anzeige auf der Karte nutzt pro Pixel dessen
// eigene Helligkeit, die Bewertung (core/colorScoring.js) bekommt davon nichts mit.
//
// WICHTIG: Die Karte ist zwar sichtbar, aber die gefragte Fläche zeigt zu keinem Zeitpunkt
// vor dem Raten die echte Farbe (sie wird komplett durch die aktuelle Regler-Wahl ersetzt,
// nicht nur überlagert) — wie bei jedem anderen -dle-Spiel ist das eine reine
// UI-Ehrlichkeitsgrenze, keine Sicherheitsgrenze: die Antwort steht serverseitig ohnehin
// schon fest (siehe dleRoutes.js-Kommentar).
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { scoreColor, rgbToHex } from '../colorScoring';

const DISPLAY_WIDTH = 280;
const REVEAL_WIDTH = 190; // etwas schmaler als DISPLAY_WIDTH, damit beide Karten nebeneinander passen
// Standardwerte für die Flächenerkennung — MÜSSEN mit tools/admin-cutter.html übereinstimmen,
// dessen Regler-Standardstellungen genau diese Werte sind (0 = "kein Eintrag weicht ab").
const WINDOW_RADIUS_DEFAULT = 40;
const TARGET_FRACTION_DEFAULT = 12; // Prozent
const MIN_COMPONENT_SIZE_DEFAULT = 5;

function scoreBorderColor(score) {
  const alpha = 0.25 + (score / 100) * 0.65;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

const SLIDER_LENGTH = 200; // Höhe der vertikalen Regler in px
const SLIDER_THICKNESS = 44; // Breite des sichtbaren Farbbalkens — bewusst dick, siehe unten

// Ein einzelner vertikaler Regler: ein normaler <input type="range"> um 90° gedreht (der
// zuverlässigste browserübergreifende Trick für vertikale Regler — Zeigereingaben folgen dem
// gedrehten Element korrekt, weil Browser CSS-Transforms auch fürs Hit-Testing
// berücksichtigen). Der farbige Verlauf dahinter (`gradient`) kommt von außen rein, damit er
// live von den JEWEILS ANDEREN Reglern abhängen kann (siehe Kommentarkopf-Verlaufslogik unten).
//
// Der Farbbalken ist bewusst SO BREIT wie der ganze Regler (nicht nur ein dünner Rand/Strich
// daneben) — die Farbe soll die Skala selbst sein, nicht nur sie umranden.
function VerticalSlider({ label, value, min, max, onChange, gradient }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-white/40 text-center leading-tight" style={{ width: SLIDER_THICKNESS + 24 }}>
        {label}
      </span>
      <div className="relative flex items-center justify-center" style={{ width: SLIDER_THICKNESS, height: SLIDER_LENGTH }}>
        <div
          className="absolute rounded-2xl pointer-events-none border border-white/10"
          style={{ background: gradient, width: SLIDER_LENGTH - 16, height: SLIDER_THICKNESS, transform: 'rotate(-90deg)' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute cursor-pointer"
          style={{
            width: SLIDER_LENGTH - 16,
            height: SLIDER_THICKNESS,
            transform: 'rotate(-90deg)',
            background: 'transparent',
            accentColor: 'white',
          }}
        />
      </div>
    </div>
  );
}

// HSL (H 0–360°, S/L 0–100 %) → {r,g,b} 0–255, Standard-Umrechnung.
function hslToRgb(h, s, l) {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lN - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// Extrahiert NUR die Helligkeit (L) eines RGB-Pixels (0–100) — für das Kolorieren (siehe
// Kommentarkopf): jeder betroffene Pixel behält seine EIGENE Helligkeit, bekommt aber
// Farbton+Sättigung von den Reglern.
function rgbToLightness(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  return ((max + min) / 2) * 100;
}

// Dieselbe redmean-Farbabstandsformel wie core/colorScoring.js — hier nicht importiert, weil
// sie hier auf rohen Pixel-Kanälen läuft (kein {r,g,b}-Objekt pro Aufruf), nicht weil sie
// inhaltlich verschieden wäre.
function redmean(r1, g1, b1, r2, g2, b2) {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

// Entfernt isolierte Einzelpixel/winzige Flecken aus der Maske: behält nur Pixel, deren
// 4-zusammenhängende Fläche mindestens minSize groß ist (per Puppeteer-artiger Bildproben
// gegen echte Kartenkunst kalibriert, siehe Kommentarkopf).
function filterSmallComponents(mask, width, height, minSize) {
  const labels = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    const stack = [start];
    labels[start] = label;
    let size = 0;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      const y = (p / width) | 0;
      if (x + 1 < width) { const np = p + 1; if (mask[np] && labels[np] === -1) { labels[np] = label; stack.push(np); } }
      if (x - 1 >= 0) { const np = p - 1; if (mask[np] && labels[np] === -1) { labels[np] = label; stack.push(np); } }
      if (y + 1 < height) { const np = p + width; if (mask[np] && labels[np] === -1) { labels[np] = label; stack.push(np); } }
      if (y - 1 >= 0) { const np = p - width; if (mask[np] && labels[np] === -1) { labels[np] = label; stack.push(np); } }
    }
    sizes.push(size);
  }
  const filtered = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && sizes[labels[i]] >= minSize) filtered[i] = 1;
  }
  return filtered;
}

// Standard Punkt-in-Polygon-Test (Ray-Casting, Even-Odd-Regel) — identisch zu
// tools/admin-lasso.html, damit die im Tool gezeichnete Kontur exakt dieselbe Maske ergibt
// wie hier im Spiel.
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Baut die rohe Pixel-Maske aus von Hand gezeichneten Konturen — pixelgenau, weil keine
// Farb-Erkennung mehr nötig ist. Nur innerhalb der jeweiligen Bounding-Box getestet (schneller
// als das ganze Bild pro Polygon abzulaufen).
function rasterizePolygons(polygons, width, height) {
  const mask = new Uint8Array(width * height);
  for (const poly of polygons) {
    if (!poly || poly.length < 3) continue;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const p of poly) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    minX = Math.max(0, Math.floor(minX)); maxX = Math.min(width - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(height - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, poly)) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

// Rand um `steps` Pixel nach außen (dilate, steps > 0) oder innen (erode, steps < 0) wachsen
// lassen — für Konturen, die insgesamt etwas zu knapp oder zu großzügig getroffen wurden.
// MUSS identisch zu admin-lasso.html's growMask sein, damit Tool-Vorschau und Spiel exakt
// übereinstimmen.
function growMask(mask, width, height, steps) {
  if (!steps) return mask;
  const grow = steps > 0;
  let current = mask;
  for (let s = 0; s < Math.abs(steps); s++) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const up = y > 0 ? current[p - width] : 0;
        const down = y < height - 1 ? current[p + width] : 0;
        const left = x > 0 ? current[p - 1] : 0;
        const right = x < width - 1 ? current[p + 1] : 0;
        next[p] = grow
          ? (current[p] || up || down || left || right ? 1 : 0)
          : (current[p] && up && down && left && right ? 1 : 0);
      }
    }
    current = next;
  }
  return current;
}

// Baut die Maske aus von Hand gezeichneten Konturen inkl. optionaler Randkorrektur (siehe
// Kommentarkopf) und wandelt sie in eine Liste betroffener Pixel-Indizes um.
function buildMaskFromPolygons(polygons, width, height, edgeAdjust = 0) {
  const mask = growMask(rasterizePolygons(polygons, width, height), width, height, edgeAdjust);
  const indices = [];
  for (let p = 0; p < mask.length; p++) if (mask[p]) indices.push(p);
  return indices;
}

// --- Ab hier: alter, automatischer Farb-Erkennungs-Pfad — nur noch FALLBACK für Einträge
// ohne `polygons` (siehe Kommentarkopf). ---

// Baut die Maske INNERHALB eines Fensters um EINEN Startpunkt (siehe Kommentarkopf): Schwelle
// startet niedrig und wächst in Schritten, bis genug Fläche relativ zum Fenster erreicht ist
// oder das Maximum erreicht ist — so passt sich das automatisch an unterschiedlich stark
// schattierte Kartenkunst an, ohne dass jede der über 40 Karten von Hand einzeln kalibriert
// werden müsste.
function buildMaskFromPoint(imageData, seedX, seedY, radius, targetFractionPercent, minComponentSize) {
  const { width, height, data } = imageData;
  const x0 = Math.max(0, seedX - radius), x1 = Math.min(width, seedX + radius);
  const y0 = Math.max(0, seedY - radius), y1 = Math.min(height, seedY + radius);
  const seedI = (width * seedY + seedX) * 4;
  const seedR = data[seedI], seedG = data[seedI + 1], seedB = data[seedI + 2];
  const total = width * height;
  const dists = new Float32Array(total).fill(Infinity);
  let windowOpaqueCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] < 10) continue;
      windowOpaqueCount++;
      dists[p] = redmean(data[i], data[i + 1], data[i + 2], seedR, seedG, seedB);
    }
  }
  const targetCount = (targetFractionPercent / 100) * windowOpaqueCount;
  let threshold = 15;
  let count = 0;
  while (threshold <= 100) {
    count = 0;
    for (let p = 0; p < total; p++) if (dists[p] <= threshold) count++;
    if (count >= targetCount) break;
    threshold += 5;
  }
  const mask = new Uint8Array(total);
  for (let p = 0; p < total; p++) if (dists[p] <= threshold) mask[p] = 1;
  return filterSmallComponents(mask, width, height, minComponentSize);
}

// Manche Karten haben MEHRERE getrennte, aber gleich gefragte Flächen (z.B. Rascals' zwei
// Mützen, siehe cr-color-match.js-Kommentar zu extraPoints) — dann wird von JEDEM Punkt aus
// je eine eigene, weiterhin lokal begrenzte Maske gebaut und die Treffer vereinigt.
function buildColorMask(imageData, points, radius, targetFractionPercent, minComponentSize) {
  const { width, height } = imageData;
  let combined = new Uint8Array(width * height);
  for (const [seedX, seedY] of points) {
    const mask = buildMaskFromPoint(imageData, seedX, seedY, radius, targetFractionPercent, minComponentSize);
    for (let i = 0; i < combined.length; i++) if (mask[i]) combined[i] = 1;
  }
  const indices = [];
  for (let p = 0; p < combined.length; p++) if (combined[p]) indices.push(p);
  return indices;
}

export default function CrColorMatchRound({ round, roundNumber, totalRounds, onDone }) {
  const canvasRef = useRef(null);
  const pristineDataRef = useRef(null); // Uint8ClampedArray, unverändertes Original
  const maskIndicesRef = useRef(null); // Pixel-Indizes der gefragten Fläche
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [revealed, setRevealed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const [hue, setHue] = useState(0);
  // Start bei voller Sättigung (statt 0) — bei S=0 ist jeder Farbton dasselbe Grau, man sieht
  // also gar keine Farbe und muss erst "zufällig" den Sättigungsregler entdecken. So sieht
  // man von Anfang an sofort eine echte Farbe und muss nur noch den Ton treffen.
  const [sat, setSat] = useState(100);
  const [light, setLight] = useState(50);

  // Bild laden, auf einen Canvas zeichnen, Maske berechnen — einmal pro Runde (die Komponente
  // wird pro Runde frisch gemountet, siehe GuessScaleGamePage.jsx's `key={round.id}`).
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // CDN sendet Access-Control-Allow-Origin: *
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = canvasRef.current;
        canvas.width = round.imgWidth;
        canvas.height = round.imgHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, round.imgWidth, round.imgHeight);
        const imageData = ctx.getImageData(0, 0, round.imgWidth, round.imgHeight);
        pristineDataRef.current = new Uint8ClampedArray(imageData.data);
        if (round.polygons && round.polygons.length) {
          maskIndicesRef.current = buildMaskFromPolygons(round.polygons, round.imgWidth, round.imgHeight, round.edgeAdjust || 0);
        } else {
          // Fallback für noch nicht auf Lasso-Konturen umgestellte Einträge (siehe Kommentarkopf).
          const points = [[round.markerX, round.markerY], ...(round.extraPoints || []).map((p) => [p.x, p.y])];
          const radius = round.windowRadius ?? WINDOW_RADIUS_DEFAULT;
          const targetFraction = round.targetFraction ?? TARGET_FRACTION_DEFAULT;
          const minComponentSize = round.minComponentSize ?? MIN_COMPONENT_SIZE_DEFAULT;
          maskIndicesRef.current = buildColorMask(imageData, points, radius, targetFraction, minComponentSize);
        }
        setStatus('ready');
      } catch {
        // z.B. unerwarteter CORS-Fehler beim Pixelzugriff — Spiel bleibt trotzdem spielbar
        // (siehe Farbfeld-Fallback unten), nur ohne den Ausmal-Effekt auf der Karte.
        setStatus('error');
      }
    };
    img.onerror = () => { if (!cancelled) setStatus('error'); };
    img.src = round.image;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live neu einfärben, sobald sich Farbton/Sättigung ändert oder die Maske fertig ist —
  // koloriert (siehe Kommentarkopf): jeder betroffene Pixel bekommt Farbton+Sättigung von den
  // Reglern, behält aber seine EIGENE Helligkeit, damit Schattierung/Glanzlichter der echten
  // Kartenkunst erhalten bleiben. Der Helligkeitsregler selbst fließt hier bewusst NICHT ein
  // (nur in den eingereichten Hexcode, siehe guessRgb unten) — er bestimmt ja gerade NICHT,
  // wie hell einzelne Pixel sind, sondern ist Teil der eingereichten Schätzfarbe.
  //
  // `revealed` steht bewusst mit in den Abhängigkeiten: die Auflösung zeigt denselben Canvas
  // in einem NEUEN Wrapper (siehe JSX unten), React hängt das <canvas>-Element dabei aus/ein
  // statt es wiederzuverwenden — ohne den erzwungenen Neu-Anstrich hier bliebe der neue Canvas
  // leer, weil sich hue/sat dabei ja nicht ändern.
  useEffect(() => {
    if (status !== 'ready' || !canvasRef.current || !pristineDataRef.current) return;
    const pristine = pristineDataRef.current;
    const canvas = canvasRef.current;
    canvas.width = round.imgWidth;
    canvas.height = round.imgHeight;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(round.imgWidth, round.imgHeight);
    imageData.data.set(pristine);
    for (const p of maskIndicesRef.current) {
      const i = p * 4;
      const pixelLightness = rgbToLightness(pristine[i], pristine[i + 1], pristine[i + 2]);
      const { r, g, b } = hslToRgb(hue, sat, pixelLightness);
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [status, hue, sat, revealed, round.imgWidth, round.imgHeight]);

  const guessRgb = hslToRgb(hue, sat, light);
  const guessHex = rgbToHex(guessRgb);
  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreColor(guessRgb, round.value) : null;
  const actualHex = rgbToHex(round.value);

  const displayHeight = Math.round((DISPLAY_WIDTH * round.imgHeight) / round.imgWidth);
  const revealHeight = Math.round((REVEAL_WIDTH * round.imgHeight) / round.imgWidth);

  // Verlaufsfarben für Regler 2 und 3 hängen LIVE von den jeweils anderen Reglern ab (genau
  // wie gewünscht: "man sieht live in der Skala, wie Sättigung/Helligkeit dieser Farbe
  // aussehen") — Regler 1 (Farbton) bleibt als einziger ein fester Regenbogen, weil er nicht
  // von den anderen beiden abhängt.
  const hueGradient = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
  const satGradient = `linear-gradient(to right, hsl(${hue}, 0%, ${light}%), hsl(${hue}, 100%, ${light}%))`;
  const lightGradient = `linear-gradient(to right, #000000, hsl(${hue}, ${sat}%, 50%), #ffffff)`;

  const sliders = (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-start gap-4">
        <VerticalSlider label="1. Farbton" value={hue} min={0} max={360} onChange={setHue} gradient={hueGradient} />
        <VerticalSlider label="2. Sättigung" value={sat} min={0} max={100} onChange={setSat} gradient={satGradient} />
        <VerticalSlider label="3. Helligkeit" value={light} min={0} max={100} onChange={setLight} gradient={lightGradient} />
      </div>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg border border-white/10 shrink-0" style={{ background: guessHex }} />
        <p className="text-white font-bold text-sm tabular-nums uppercase">{guessHex}</p>
      </div>
    </div>
  );

  return (
    <div className="relative panel p-6 md:p-10 overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-widest text-violet-300/80">
          Runde {roundNumber} / {totalRounds}
        </span>
      </div>

      <h2 className="font-display text-xl md:text-3xl font-bold text-white mt-3 mb-6">
        {round.label}
      </h2>

      {!revealed ? (
        <>
          <p className="text-sm text-white/50 leading-relaxed mb-6">
            Färbe die markierte Fläche mit den Reglern genau so ein, wie du sie in Erinnerung hast — der Rest der Karte zeigt schon die echten Farben.
          </p>

          <div className="flex flex-col md:flex-row gap-8 md:items-start justify-center">
            <div
              className="relative mx-auto md:mx-0 rounded-xl overflow-hidden bg-black/30 shrink-0"
              style={{ width: DISPLAY_WIDTH, height: displayHeight }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ imageRendering: 'auto' }}
              />
              {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center text-white/40">
                  <Loader2 size={22} className="animate-spin" />
                </div>
              )}
              {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-white/40 p-4">
                  Kartenbild aktuell nicht verfügbar — deine Farbwahl unten zählt trotzdem.
                </div>
              )}
            </div>

            {sliders}
          </div>

          <button
            type="button"
            onClick={handleGuess}
            className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors mt-6"
          >
            Raten
          </button>
        </>
      ) : (
        <>
          {/* Eigene Schätzung UND echte Auflösung nebeneinander — nicht nur kleine
              Farbfelder, sondern beide Kartenbilder im Kontext, direkt vergleichbar. */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-5">
            <div className="flex flex-col items-center gap-2">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Deine Schätzung</p>
              <div
                className="relative rounded-xl overflow-hidden bg-black/30"
                style={{ width: REVEAL_WIDTH, height: revealHeight }}
              >
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
            </div>
            {!imgFailed && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Richtig</p>
                <div
                  className="relative rounded-xl overflow-hidden bg-black/30"
                  style={{ width: REVEAL_WIDTH, height: revealHeight }}
                >
                  <img
                    src={round.image}
                    alt={round.label}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain"
                    onError={() => setImgFailed(true)}
                  />
                  {/* Markiert die exakte Stelle, deren Farbe gefragt war */}
                  <div
                    className="absolute w-4 h-4 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(round.markerX / round.imgWidth) * 100}%`,
                      top: `${(round.markerY / round.imgHeight) * 100}%`,
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.6)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="panel p-3 text-center">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Deine Wahl</p>
              <div className="w-full h-14 rounded-lg mb-2 border border-white/10" style={{ background: guessHex }} />
              <p className="text-white/60 text-xs tabular-nums uppercase">{guessHex}</p>
            </div>
            <div className="panel p-3 text-center">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Richtig</p>
              <div className="w-full h-14 rounded-lg mb-2 border border-white/10" style={{ background: actualHex }} />
              <p className="text-white/60 text-xs tabular-nums uppercase">{actualHex}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5 panel p-4" style={{ borderColor: scoreBorderColor(score) }}>
            <Sparkles size={18} className="text-violet-300 shrink-0" />
            <p className="text-sm text-white/70">
              <span className="text-white font-bold">{score} Punkte</span> — {round.description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onDone(guessRgb, score)}
            className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors"
          >
            {roundNumber < totalRounds ? 'Nächste Runde' : 'Ergebnis ansehen'}
          </button>
        </>
      )}

      <p className="mt-6 text-[11px] text-white/25 leading-relaxed">
        Dieses Material ist nicht offiziell und nicht von Supercell bewilligt. Weitere Informationen:{' '}
        <a
          href="https://supercell.com/en/fan-content-policy/de/"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white/40"
        >
          supercell.com/fan-content-policy
        </a>
      </p>
    </div>
  );
}
