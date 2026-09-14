// shareCard.js — zeichnet die Endergebnis-Karte als Bild (Canvas), zum Teilen/Speichern.
// Generisch über alle -dle-Spiele hinweg gehalten (Name/Runden/Score als Parameter) —
// Velocidle & Co. sollen dieselbe Funktion später einfach mitbenutzen können.
//
// Bewusst EIN Farbton (Violett, die Akzentfarbe der ganzen Seite) statt einer
// Ampel-Palette (Rot/Gelb/Grün): passt zum Rest der Seite und vermeidet die "bunte
// KI-Optik", die hier explizit nicht gewünscht ist — je heller/voller das Feld, desto
// besser die Runde.
const WIDTH = 1080;
const HEIGHT = 1080;

function pipColor(score) {
  // 0–100 → Deckkraft der Akzentfarbe. Eigene Interpolation statt eines CSS-Gradients,
  // weil das Canvas ohnehin pixelgenau zeichnet.
  const alpha = 0.12 + (score / 100) * 0.78;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

export async function generateShareCard({ gameName, gameSubtitle, dateKey, rounds, totalScore, maxScore }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // Hintergrund
  ctx.fillStyle = '#0b0b16';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Dezenter Rahmen statt Glow/Schatten
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);

  // Kopfzeile
  ctx.fillStyle = 'rgba(196, 181, 253, 0.9)'; // violet-200-ish
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(gameSubtitle?.toUpperCase() || '', 80, 150);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 84px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(gameName || '', 78, 240);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '400 32px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(dateKey || '', 80, 300);

  // Gesamtscore, groß und mittig
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 200px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(totalScore), WIDTH / 2, 620);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '400 40px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`von ${maxScore} Punkten`, WIDTH / 2, 680);
  ctx.textAlign = 'left';

  // Runden-Reihe: ein Feld pro Runde, gefüllt nach Score
  const pipCount = rounds.length;
  const pipSize = 130;
  const gap = 24;
  const rowWidth = pipCount * pipSize + (pipCount - 1) * gap;
  const startX = (WIDTH - rowWidth) / 2;
  const pipY = 800;

  rounds.forEach((r, i) => {
    const x = startX + i * (pipSize + gap);
    ctx.fillStyle = pipColor(r.score);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, pipY, pipSize, pipSize, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(String(r.score), x + pipSize / 2, pipY + pipSize / 2 + 14);
  });
  ctx.textAlign = 'left';

  // Fußzeile
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '400 28px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('vnmvalentin.de/daily', WIDTH / 2, HEIGHT - 60);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadShareCard(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
