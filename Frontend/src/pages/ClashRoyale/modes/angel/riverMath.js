// Bahnberechnung des Flusses — geteilt von der 2D-Ansicht (AngelRoyale.jsx) und der 3D-Ansicht
// (angel/Angel3D.jsx). Beide MÜSSEN dieselbe Formel benutzen: Die 3D-Szene bildet jede Karte
// exakt auf die Bildschirmstelle ab, an der sie auch in 2D läge, und die Trefferprüfung beim
// Klick ist in beiden Ansichten dieselbe Rechteck-Prüfung.

// Kartengröße im Fluss (Seitenverhältnis der CDN-Bilder ist 150×180).
// Diese Werte gelten in REFERENZEINHEITEN, nicht in Bildschirmpixeln — der Fluss wird
// immer in dieser gedachten Größe gezeichnet und danach auf die echte Fläche skaliert.
export const FISH_W = 66;
export const FISH_H = 79;
export const CAUGHT_LINGER_MS = 1100;
// Höhe der Deck-Leiste am unteren Rand; darunter dürfen keine Karten treiben.
// Sie ist ein DOM-Element mit fester Pixelhöhe und wird deshalb NICHT mitskaliert.
export const DECK_BAR_PX = 96;

// Referenzfläche, für die Kartengröße und Abstände entworfen sind (1360×822).
const REF_AREA = 1360 * 822;

// Maßstab aus der FLÄCHE, nicht aus Breite oder Höhe allein. Dadurch bleibt das Verhältnis
// von Kartenfläche zu Spielfeldfläche konstant — und damit auch, wie häufig sich Karten
// gegenseitig überdecken. Bei 16:9 ist zusätzlich das Tempo in Kartenbreiten pro Sekunde
// überall gleich, egal ob 1366×768 oder 4K. So bleibt das Spiel fair, ohne dass wir
// schwarze Balken brauchen: die Fläche wird weiterhin voll ausgenutzt.
export function fishScale(W, H) {
  return Math.max(0.55, Math.min(2.2, Math.sqrt((W * H) / REF_AREA)));
}

// Fortschritt 0..1 entlang der Bahn. Ohne Sprint-Fenster ist das schlicht age/travelMs.
// Mit Sprints wird jedes Fenster mit sprintMult-facher Geschwindigkeit durchflogen; die
// Grundgeschwindigkeit sinkt entsprechend, sodass die Karte trotzdem exakt nach travelMs
// am anderen Ufer ankommt. Damit bleibt die Lebenszeit-Prüfung des Servers gültig.
function fishProgress(f, age) {
  const mult = f.sprintMult || 1;
  if (mult === 1 || !f.sprints?.length) return age / f.travelMs;
  let sprintTotal = 0, sprinted = 0;
  for (const s of f.sprints) {
    const len = s.end - s.start;
    sprintTotal += len;
    sprinted += Math.max(0, Math.min(len, age - s.start));
  }
  return (age + (mult - 1) * sprinted) / (f.travelMs + (mult - 1) * sprintTotal);
}

// Position einer Karte im Fluss — deterministisch aus den Spawn-Parametern des Servers.
// serverTime läuft in Server-Uhrzeit; W/H sind CSS-Pixel der Zeichenfläche.
export function fishPos(f, serverTime, W, H, padBottom) {
  const age = serverTime - f.spawnedAt;
  const progress = fishProgress(f, age);
  const xNorm = f.dir === 1 ? progress : 1 - progress;
  const x = xNorm * (W + 2 * FISH_W) - FISH_W;
  const padTop = 14;
  const usable = Math.max(60, H - padTop - padBottom - FISH_H);
  let y = padTop + f.laneY * usable;
  if (f.waveAmp) y += f.waveAmp * usable * Math.sin(f.waveFreq * (age / 1000) + f.wavePhase);
  return { x, y: Math.max(padTop, Math.min(padTop + usable, y)), age };
}

// Weicher Abtauch-Faktor 0..1 (mit 250ms Ein-/Ausblendung an den Fensterkanten)
export function diveFactor(f, age) {
  const FADE = 250;
  let factor = 0;
  for (const d of f.dives) {
    if (age < d.start - FADE || age > d.end + FADE) continue;
    if (age < d.start) factor = Math.max(factor, 1 - (d.start - age) / FADE);
    else if (age > d.end) factor = Math.max(factor, 1 - (age - d.end) / FADE);
    else factor = 1;
  }
  return factor;
}

export function isHardDiving(f, age) {
  return f.dives.some(d => age >= d.start && age <= d.end);
}

// Sprint-Intensität 0..1 (mit 140ms Ein-/Ausblendung, damit Schlieren nicht hart aufpoppen).
// Nur für die Optik — die Bewegung selbst schaltet in fishProgress() hart um.
export function sprintFactor(f, age) {
  if (!f.sprints?.length) return 0;
  const FADE = 140;
  let factor = 0;
  for (const s of f.sprints) {
    if (age < s.start - FADE || age > s.end + FADE) continue;
    if (age < s.start) factor = Math.max(factor, 1 - (s.start - age) / FADE);
    else if (age > s.end) factor = Math.max(factor, 1 - (age - s.end) / FADE);
    else factor = 1;
  }
  return factor;
}
