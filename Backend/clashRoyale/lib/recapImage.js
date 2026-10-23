// lib/recapImage.js — der Saisonrückblick als Bild zum Teilen (1080 × 1350, Hochformat wie bei Instagram/X/TikTok).
// Streamer zeigen es im Stream oder posten es. Im Clash-Royale-Look wie die Rückblick-Seite: blauer Arcade-Grund,
// dunkle Tafeln mit Rand, Lilita One mit schwarzer Kontur, Liga-Abzeichen, Medaillenkurve, bestes Deck mit Kartenbildern.
// Sprache wie der Win-Tracker-Editor (settings.language: de/en).
//
// Schrift und Abzeichen liegen bei (clashRoyale/assets/recap) — auf dem Server ist keine Schrift garantiert. Lilita One
// steht unter der SIL Open Font License (OFL.txt daneben). Kartenbilder kommen von api-assets.clashroyale.com (wie im
// Browser) — fehlt eins, steht dort eine leere Karte, das Bild entsteht trotzdem.
'use strict';

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { fit, TEXT } = require('../../og/ogImage');
const CARD_ICON_URLS = require('../data/cardIconUrls.json');

const ASSETS = path.join(__dirname, '../assets/recap');
try {
  GlobalFonts.registerFromPath(path.join(ASSETS, 'LilitaOne-Regular.ttf'), 'RecapCr');
} catch (e) {
  console.warn('[recap] Schrift fehlt:', e.message);
}
const CR = 'RecapCr, sans-serif';

const W = 1080;
const H = 1350;
const PAD = 56;
const INNER = W - PAD * 2;
const BLUE = '#1d4a86';
const BLUE_DARK = '#163a6b';
const PANEL = '#0f2547';
const PANEL_EDGE = '#081426';
const INK = '#ffffff';
const DIM = 'rgba(255,255,255,0.62)';
const GOLD = '#ffcf3f';
const GREEN = '#4ade80';
const RED = '#f87171';
const UC_LEAGUE = 7;

const STRINGS = {
  de: {
    locale: 'de-DE', kicker: 'SAISONRÜCKBLICK', fallbackName: 'Mein Account',
    wins: 'Siege', losses: 'Niederlagen', winRate: 'Siegquote',
    league: (n) => (n === UC_LEAGUE ? 'Ultimate Champion' : `Liga ${n}`), trophyRoad: 'Trophäenstraße',
    medals: 'Medaillen', bestRank: 'bester Platz', approx: 'ca. ',
    chart: { medals: 'Medaillen über die Saison', trophies: 'Trophäen über die Saison', record: 'Siege minus Niederlagen' },
    ucStart: 'Start in UC', end: 'Ende', climb: 'Aufstieg',
    gain: 'Größter Anstieg', tilt: 'Größter Tilt', streak: 'Siegesserie', threeCrowns: '3-Kronen-Siege',
    modesTitle: 'Meistgespielte Modi',
    modes: { ranked: 'Ranked', ladder: 'Trophäenstraße', '2v2': '2v2 (locker)', friendly: 'Freundschaftskämpfe', tournament: 'Turniere im Spiel', party: 'Partymodi', challenge: 'Challenges', clanwar: 'Clankrieg', events: 'Events', 's:2v2league': '2v2 Ranked' },
    bestDeck: 'Bestes Deck', deckLine: (w, l, p) => `${p} % Siegquote · ${w}–${l}`,
    date: (iso) => { const [, m, d] = iso.split('-'); return `${d}.${m}.`; },
  },
  en: {
    locale: 'en-US', kicker: 'SEASON RECAP', fallbackName: 'My account',
    wins: 'Wins', losses: 'Losses', winRate: 'Win rate',
    league: (n) => (n === UC_LEAGUE ? 'Ultimate Champion' : `League ${n}`), trophyRoad: 'Trophy Road',
    medals: 'medals', bestRank: 'best rank', approx: 'approx. ',
    chart: { medals: 'Medals over the season', trophies: 'Trophies over the season', record: 'Wins minus losses' },
    ucStart: 'Start in UC', end: 'End', climb: 'Climb',
    gain: 'Biggest climb', tilt: 'Biggest tilt', streak: 'Win streak', threeCrowns: '3-crown wins',
    modesTitle: 'Most played modes',
    modes: { ranked: 'Ranked', ladder: 'Trophy Road', '2v2': '2v2 (casual)', friendly: 'Friendly battles', tournament: 'In-game tournaments', party: 'Party modes', challenge: 'Challenges', clanwar: 'Clan war', events: 'Events', 's:2v2league': '2v2 Ranked' },
    bestDeck: 'Best deck', deckLine: (w, l, p) => `${p}% win rate · ${w}–${l}`,
    date: (iso) => { const [, m, d] = iso.split('-'); return `${m}/${d}`; },
  },
};

// Bilder einmal laden und behalten (Abzeichen von der Platte, Kartenbilder aus dem Netz)
const imageCache = new Map();
async function image(src) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);
  let img = null;
  try {
    if (/^https:\/\//.test(src)) {
      const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
      if (res.ok) img = await loadImage(Buffer.from(await res.arrayBuffer()));
    } else {
      img = await loadImage(src);
    }
  } catch { /* fehlt das Bild, bleibt die Stelle leer */ }
  if (img || !/^https:\/\//.test(src)) imageCache.set(src, img);
  return img;
}
const leagueIcon = (n) => (n >= 1 && n <= 7 ? path.join(ASSETS, `league${n + 3}.webp`) : null);
const cardSrc = (c) => {
  const e = c && CARD_ICON_URLS[c.id];
  if (!e) return null;
  return (c.variant === 'ev1' && e.ev1) || (c.variant === 'hero' && e.hero) || e.base;
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dunkle Tafel wie .cr-arcade-panel: Kante unten, dunkler Rand, helle Innenlinie oben */
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL_EDGE;
  roundRect(ctx, x, y + 6, w, h, 22);
  ctx.fill();
  ctx.fillStyle = PANEL;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x + 18, y + 3, w - 36, 2);
}

/** CR-Schrift: schwarze Kontur + Schatten nach unten, dann die Farbe */
function crText(ctx, text, x, y, size, color = INK, align = 'left', maxWidth = INNER) {
  ctx.font = `${size}px ${CR}`;
  ctx.textAlign = align;
  const t = fit(ctx, String(text), maxWidth);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.14);
  ctx.strokeStyle = '#0b1220';
  ctx.strokeText(t, x, y + Math.max(3, size * 0.07));
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.textAlign = 'left';
}

function label(ctx, text, x, y, size = 26, color = DIM, align = 'left', maxWidth = INNER) {
  ctx.font = `${size}px ${CR}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(fit(ctx, String(text), maxWidth), x, y);
  ctx.textAlign = 'left';
}

/** Arcade-Grund: Blau mit Rautenmuster */
function background(ctx) {
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, W, H);
  const step = 90;
  ctx.fillStyle = BLUE_DARK;
  for (let y = -step; y < H + step; y += step) {
    for (let x = ((y / step) % 2 ? step / 2 : 0) - step; x < W + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - step / 2);
      ctx.lineTo(x + step / 2, y);
      ctx.lineTo(x, y + step / 2);
      ctx.lineTo(x - step / 2, y);
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Kurve der Saison in der Tafel: x nach Match-Nummer, Aufstieg Liga 1–6 als eigener Abschnitt links */
function chart(ctx, curve, climb, x, y, w, h, s, fmt) {
  const pts = curve.points;
  const showClimb = curve.metric === 'medals' && climb && curve.ucFrom;
  const climbN = showClimb ? climb.matches : 0;
  const total = Math.max(1, climbN + (curve.count ?? pts.length - 1));
  const off = Number.isFinite(curve.offset) ? curve.offset : null;
  const lo = Math.min(0, curve.min);
  const hi = Math.max(0, curve.max);
  const span = hi - lo || 1;
  const axisW = 92;
  const cx = x + axisW;
  const cw = w - axisW;
  const px = (p) => cx + ((climbN + (p.i ?? 0)) / total) * cw;
  const py = (v) => y + 10 + (1 - (v - lo) / span) * (h - 20);

  ctx.save();
  ctx.fillStyle = '#0b1f3d';
  roundRect(ctx, cx, y, cw, h, 14);
  ctx.fill();
  ctx.clip();
  // Achsenlinien mit echten Ständen (bzw. relativ)
  const dispLo = lo + (off ?? 0);
  const dispHi = hi + (off ?? 0);
  const stepV = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((v) => (dispHi - dispLo) / v <= 4) || 2000;
  const ticks = [];
  for (let v = Math.ceil(dispLo / stepV) * stepV; v <= dispHi; v += stepV) ticks.push(v);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (const v of ticks) { const yy = py(v - (off ?? 0)); ctx.beginPath(); ctx.moveTo(cx, yy); ctx.lineTo(cx + cw, yy); ctx.stroke(); }
  if (showClimb) {
    const bw = (climbN / total) * cw;
    ctx.fillStyle = 'rgba(8,20,38,0.6)';
    ctx.fillRect(cx, y, bw, h);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(255,207,63,0.6)';
    ctx.beginPath(); ctx.moveTo(cx + bw, y); ctx.lineTo(cx + bw, y + h); ctx.stroke();
    ctx.setLineDash([]);
    if (bw > 110) label(ctx, s.climb, cx + bw / 2, y + 36, 22, DIM, 'center', bw - 16);
  }
  const up = curve.end >= 0;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(p), py(p.v)) : ctx.moveTo(px(p), py(p.v))));
  ctx.lineTo(px(pts[pts.length - 1]), y + h);
  ctx.lineTo(px(pts[0]), y + h);
  ctx.closePath();
  ctx.fillStyle = up ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)';
  ctx.fill();
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(p), py(p.v)) : ctx.moveTo(px(p), py(p.v))));
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.restore();
  // Achsenbeschriftung links
  for (const v of ticks) {
    const yy = py(v - (off ?? 0));
    if (yy > y + 12 && yy < y + h - 4) label(ctx, off !== null ? fmt(v) : `${v > 0 ? '+' : ''}${fmt(v)}`, cx - 14, yy + 8, 22, DIM, 'right', axisW - 16);
  }
}

/**
 * @param data { playerName, seasonLabel, recap (computeRecap), lang?: 'de'|'en' }
 * @returns {Promise<Buffer>} PNG
 */
async function renderRecap({ playerName, seasonLabel, recap, lang = 'de' }) {
  const s = STRINGS[lang] || STRINGS.de;
  const fmt = (n) => (Number(n) || 0).toLocaleString(s.locale);
  const sign = (n) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx);

  const league = recap.peak?.league || 0;
  const deck = recap.decks?.[0] || null;
  const [leagueImg, medalImg, ...cardImgs] = await Promise.all([
    image(leagueIcon(league)),
    image(path.join(ASSETS, 'rating.webp')),
    ...(deck ? deck.cards.map((c) => image(cardSrc(c))) : []),
  ]);

  // Kopf: Rubrik, Saison, Spieler
  label(ctx, s.kicker, W / 2, 86, 30, GOLD, 'center');
  crText(ctx, seasonLabel, W / 2, 168, 82, INK, 'center');
  label(ctx, playerName || s.fallbackName, W / 2, 222, 38, 'rgba(255,255,255,0.85)', 'center');

  // Tafel 1: Liga + Medaillen links, Siege / Niederlagen / Quote rechts
  let y = 262;
  panel(ctx, PAD, y, INNER, 190);
  if (leagueImg) ctx.drawImage(leagueImg, PAD + 26, y + 30, 130, 130);
  const lx = PAD + (leagueImg ? 172 : 32);
  crText(ctx, league ? s.league(league) : s.trophyRoad, lx, y + 78, 40, INK, 'left', 380);
  if (recap.medals) {
    if (medalImg) ctx.drawImage(medalImg, lx, y + 102, 50, 50);
    crText(ctx, fmt(recap.medals.end), lx + 60, y + 144, 46, INK, 'left', 200);
    if (recap.peak?.rank) label(ctx, `#${fmt(recap.peak.rank)} ${s.bestRank}`, lx, y + 178, 22, DIM, 'left', 360);
  } else if (recap.peak?.rank) {
    label(ctx, `#${fmt(recap.peak.rank)} ${s.bestRank}`, lx, y + 130, 26, DIM, 'left', 360);
  }
  const statX = PAD + INNER - 432;
  [[fmt(recap.wins), s.wins, GREEN], [fmt(recap.losses), s.losses, RED], [recap.winRate === null ? '–' : `${recap.winRate}%`, s.winRate, GOLD]]
    .forEach(([v, l, c], i) => {
      const cx = statX + i * 136 + 64;
      crText(ctx, v, cx, y + 112, v.length > 3 ? 44 : 54, c, 'center', 132);
      label(ctx, l, cx, y + 150, 22, DIM, 'center', 130);
    });

  // Tafel 2: Kurve über die Saison (Medaillen: Start in UC → Ende)
  y = 482;
  panel(ctx, PAD, y, INNER, 360);
  const curve = recap.curve;
  label(ctx, s.chart[curve?.metric || 'record'], PAD + 30, y + 50, 28, INK, 'left', 520);
  if (recap.medals) {
    const head = `${recap.medals.approx ? s.approx : ''}${fmt(recap.medals.start)} – ${fmt(recap.medals.end)}`;
    crText(ctx, head, PAD + INNER - 30, y + 54, 40, INK, 'right', 420);
  } else if (curve) {
    crText(ctx, sign(curve.end), PAD + INNER - 30, y + 54, 40, curve.end >= 0 ? GREEN : RED, 'right', 300);
  }
  if (curve && curve.points.length > 1) chart(ctx, curve, recap.climb, PAD + 22, y + 82, INNER - 52, 250, s, fmt);

  // Tafel 3: Größter Anstieg / Tilt, Serie, 3 Kronen — vier Felder
  y = 872;
  panel(ctx, PAD, y, INNER, 170);
  const spanText = (x) => (x.from !== null && x.from !== undefined ? `${fmt(x.from)} – ${fmt(x.to)}` : `${x.wins}–${x.losses}`);
  const cells = [
    recap.biggestGain ? [s.gain, sign(recap.biggestGain.net), GREEN, `${s.date(recap.biggestGain.date)} · ${spanText(recap.biggestGain)}`] : null,
    recap.biggestTilt ? [s.tilt, sign(recap.biggestTilt.net), RED, `${s.date(recap.biggestTilt.date)} · ${spanText(recap.biggestTilt)}`] : null,
    [s.streak, fmt(recap.longestWinStreak), INK, null],
    [s.threeCrowns, fmt(recap.threeCrownWins), GOLD, null],
  ].filter(Boolean).slice(0, 4);
  const cellW = INNER / cells.length;
  cells.forEach(([l, v, c, sub], i) => {
    const cx = PAD + cellW * i + cellW / 2;
    if (i) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(PAD + cellW * i, y + 28, 2, 114); }
    label(ctx, l, cx, y + 48, 22, DIM, 'center', cellW - 20);
    crText(ctx, v, cx, y + 108, 50, c, 'center', cellW - 20);
    if (sub) { ctx.font = `600 18px ${TEXT}`; ctx.textAlign = 'center'; ctx.fillStyle = DIM; ctx.fillText(fit(ctx, sub, cellW - 16), cx, y + 144); ctx.textAlign = 'left'; }
  });

  // Tafel 4: bestes Deck mit Kartenbildern
  y = 1072;
  panel(ctx, PAD, y, INNER, 212);
  if (deck) {
    label(ctx, s.bestDeck, PAD + 30, y + 46, 28, INK, 'left', 400);
    label(ctx, s.deckLine(deck.wins, deck.losses, deck.winRate), PAD + INNER - 30, y + 46, 26, deck.winRate >= 50 ? GREEN : RED, 'right', 520);
    const cw = (INNER - 60 - 7 * 10) / 8;
    const ch = cw * (420 / 285);
    deck.cards.forEach((c, i) => {
      const cx = PAD + 30 + i * (cw + 10);
      const img = cardImgs[i];
      if (img) {
        const scale = Math.min(cw / img.width, ch / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, cx + (cw - dw) / 2, y + 62 + (ch - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = '#0b1f3d';
        roundRect(ctx, cx, y + 62, cw, ch, 10);
        ctx.fill();
      }
    });
  } else {
    // Ohne Deck (Matches vor Okt. 2026 haben keins): die meistgespielten Modi mit Bilanz statt leerer Tafel
    label(ctx, s.modesTitle, PAD + 30, y + 46, 28, INK, 'left', 400);
    (recap.modes || []).slice(0, 3).forEach((m, i) => {
      const yy = y + 100 + i * 46;
      label(ctx, m.label || s.modes[m.mode] || m.mode.replace(/^s:/, ''), PAD + 30, yy, 30, INK, 'left', 420);
      const decided = m.wins + m.losses;
      const pct = decided ? ` · ${Math.round((m.wins / decided) * 100)}%` : '';
      label(ctx, `${fmt(m.wins)}–${fmt(m.losses)}${pct}`, PAD + INNER - 30, yy, 30, DIM, 'right', 360);
    });
  }

  label(ctx, 'Win Tracker · vnmvalentin.de', W / 2, H - 22, 26, 'rgba(255,255,255,0.7)', 'center');
  return canvas.toBuffer('image/png');
}

module.exports = { renderRecap };
