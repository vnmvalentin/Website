import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Crown, Check, FishingRod, Hourglass } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

// Kartengröße im Fluss (Seitenverhältnis der CDN-Bilder ist 150×180).
// Diese Werte gelten in REFERENZEINHEITEN, nicht in Bildschirmpixeln — der Fluss wird
// immer in dieser gedachten Größe gezeichnet und danach auf die echte Fläche skaliert.
const FISH_W = 66;
const FISH_H = 79;
const CAUGHT_LINGER_MS = 1100;
// Höhe der Deck-Leiste am unteren Rand; darunter dürfen keine Karten treiben.
// Sie ist ein DOM-Element mit fester Pixelhöhe und wird deshalb NICHT mitskaliert.
const DECK_BAR_PX = 96;

// Referenzfläche, für die Kartengröße und Abstände entworfen sind (1360×822).
const REF_AREA = 1360 * 822;

// Maßstab aus der FLÄCHE, nicht aus Breite oder Höhe allein. Dadurch bleibt das Verhältnis
// von Kartenfläche zu Spielfeldfläche konstant — und damit auch, wie häufig sich Karten
// gegenseitig überdecken. Bei 16:9 ist zusätzlich das Tempo in Kartenbreiten pro Sekunde
// überall gleich, egal ob 1366×768 oder 4K. So bleibt das Spiel fair, ohne dass wir
// schwarze Balken brauchen: die Fläche wird weiterhin voll ausgenutzt.
function fishScale(W, H) {
  return Math.max(0.55, Math.min(2.2, Math.sqrt((W * H) / REF_AREA)));
}

const ANGEL_I18N = {
  de: {
    you: 'Du',
    loading: 'Lade Angel Royale…',
    done: 'Fertig',
    decksDone: (done, total) => `${done}/${total} Decks fertig`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} Karten`,
    allDecksFull: 'Alle Decks sind voll — Draft abgeschlossen!',
    spectatorLive: 'Zuschauer — du siehst den Fluss live.',
    yourDeckFull: 'Dein Deck ist voll! Warte, bis die anderen fertig sind…',
    catchHint: 'Klicke auf vorbeischwimmende Karten, um sie zu angeln — abgetauchte Karten sind nicht fangbar.',
    getReady: 'Angeln bereit machen…',
    riverOpens: 'Der Fluss öffnet für alle gleichzeitig',
    yourDeck: 'Dein Deck',
    rodReady: 'Angel bereit',
    reelingIn: (s) => `Angel wird eingeholt… ${s}s`,
    caughtBy: (name) => `${name} hat geangelt!`,
    yourCatch: 'Gefangen!',
    denied: {
      cooldown: 'Deine Angel ist noch nicht bereit!',
      diving: 'Abgetaucht — nicht fangbar!',
      late: 'Zu spät — weg ist sie!',
      champion: 'Champion-Limit (max. 2)!',
      deckfull: 'Dein Deck ist voll!',
      countdown: 'Noch nicht — warte auf den Start!',
    },
  },
  en: {
    you: 'You',
    loading: 'Loading Angel Royale…',
    done: 'Done',
    decksDone: (done, total) => `${done}/${total} decks done`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cards`,
    allDecksFull: 'All decks are full — draft complete!',
    spectatorLive: 'Spectator — you watch the river live.',
    yourDeckFull: 'Your deck is full! Wait for the others to finish…',
    catchHint: 'Click cards drifting by to reel them in — submerged cards can\'t be caught.',
    getReady: 'Get your rods ready…',
    riverOpens: 'The river opens for everyone at the same time',
    yourDeck: 'Your deck',
    rodReady: 'Rod ready',
    reelingIn: (s) => `Reeling in… ${s}s`,
    caughtBy: (name) => `${name} caught it!`,
    yourCatch: 'Caught!',
    denied: {
      cooldown: 'Your rod isn\'t ready yet!',
      diving: 'Submerged — can\'t be caught!',
      late: 'Too late — it\'s gone!',
      champion: 'Champion limit (max. 2)!',
      deckfull: 'Your deck is full!',
      countdown: 'Not yet — wait for the start!',
    },
  },
};

function useNow(intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── Kartenbilder einmalig laden und cachen ──────────────────────────────────
const _imgCache = new Map();
function getCardImage(id) {
  if (!_imgCache.has(id)) {
    const img = new Image();
    img.src = `${CARD_CDN}${id}.png`;
    _imgCache.set(id, img);
  }
  return _imgCache.get(id);
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name, rarity }) {
  return (
    <div className="relative w-full h-full" style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={`${CARD_CDN}${id}.png`} alt={name} className="w-full h-full object-cover" draggable={false}
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// ── Sidebar: Spieler mit Deck-Fortschritt ──────────────────────────────────
function AngelSidebar({ state, myPlayerId, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators = state.players.filter(p => p.isSpectator);
  return (
    <div className="w-60 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe = p.id === myPlayerId;
        const done = (p.deck || []).length >= state.deckSize;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        return (
          <div key={p.id}
            className={`rounded-sm border p-3 transition-colors ${isMe ? 'border-sky-500/40 bg-sky-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={30} />
              <span className="text-white text-sm font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-sky-400 font-bold shrink-0">{t.you}</span>}
              {done && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/25 px-1.5 py-0.5 rounded-sm shrink-0">
                  <Check size={10} /> {t.done}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: state.deckSize }, (_, ci) => {
                const card = p.deck?.[ci];
                return (
                  <div key={ci} title={card?.name}
                    className={`aspect-square rounded-sm overflow-hidden border ${
                      card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/5 bg-white/[0.02]'}`}>
                    {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Crown size={11} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
              <span className="text-[10px] text-gray-500">{champCount}/2 Champions</span>
              <span className="text-[10px] text-gray-600 ml-auto">{p.deck?.length || 0}/{state.deckSize}</span>
            </div>
          </div>
        );
      })}
      {spectators.length > 0 && (
        <>
          <div className="h-px bg-white/5 mt-1" />
          {spectators.map(p => (
            <div key={p.id} className="rounded-sm border border-white/5 bg-[#0f0f13]/60 px-3 py-2 flex items-center gap-2 opacity-50">
              <AvatarCircle id={p.avatar} color={p.color} size={22} />
              <span className="text-gray-400 text-xs truncate flex-1">{p.name}</span>
              {p.id === myPlayerId && <span className="text-[9px] text-sky-500 shrink-0">{t.you}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Position einer Karte im Fluss — deterministisch aus den Spawn-Parametern des Servers.
// serverTime läuft in Server-Uhrzeit; W/H sind CSS-Pixel der Zeichenfläche.
function fishPos(f, serverTime, W, H, padBottom) {
  const age = serverTime - f.spawnedAt;
  const progress = age / f.travelMs;
  const xNorm = f.dir === 1 ? progress : 1 - progress;
  const x = xNorm * (W + 2 * FISH_W) - FISH_W;
  const padTop = 14;
  const usable = Math.max(60, H - padTop - padBottom - FISH_H);
  let y = padTop + f.laneY * usable;
  if (f.waveAmp) y += f.waveAmp * usable * Math.sin(f.waveFreq * (age / 1000) + f.wavePhase);
  return { x, y: Math.max(padTop, Math.min(padTop + usable, y)), age };
}

// Weicher Abtauch-Faktor 0..1 (mit 250ms Ein-/Ausblendung an den Fensterkanten)
function diveFactor(f, age) {
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

function isHardDiving(f, age) {
  return f.dives.some(d => age >= d.start && age <= d.end);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Der Fluss (Canvas) ──────────────────────────────────────────────────────
function RiverCanvas({ state, myPlayerId, canInteract, onCatch, deniedRef }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stateRef = useRef(state);
  const mouseRef = useRef({ x: -1, y: -1 });
  const hoverRef = useRef(null);
  const splashesRef = useRef([]); // Klick-Ringe (Angel-Platscher)
  const dprRef = useRef(1);       // Pixel pro Bühnenpixel (Gerät × Bühnen-Skalierung)
  const canInteractRef = useRef(canInteract);
  stateRef.current = state;
  canInteractRef.current = canInteract;

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Gezeichnet wird in Referenzeinheiten — die Mausposition muss denselben Maßstab
    // benutzen, sonst läge der Klick neben der sichtbaren Karte.
    const k = fishScale(rect.width, rect.height);
    const mx = (e.clientX - rect.left) / k, my = (e.clientY - rect.top) / k;
    splashesRef.current.push({ x: mx, y: my, ts: performance.now() });
    if (!canInteractRef.current) return;
    const s = stateRef.current;
    if (!s) return;
    const serverTime = Date.now() - (s.clientReceivedAt - s.serverNow);
    const Wr = rect.width / k, Hr = rect.height / k;
    // oberste (zuletzt gezeichnete) Karte unter dem Cursor finden
    for (let i = s.fish.length - 1; i >= 0; i--) {
      const f = s.fish[i];
      if (f.caughtBy) continue;
      const { x, y, age } = fishPos(f, serverTime, Wr, Hr, DECK_BAR_PX / k);
      if (age < 0 || age > f.travelMs) continue;
      if (mx >= x && mx <= x + FISH_W && my >= y && my <= y + FISH_H) {
        if (isHardDiving(f, age)) return; // klick-immun während des Abtauchens
        onCatch(f.fishId);
        return;
      }
    }
  }, [onCatch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      dprRef.current = dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      const dpr = dprRef.current;
      const Wpx = canvas.width / dpr, Hpx = canvas.height / dpr;
      // Ab hier wird durchgehend in Referenzeinheiten gerechnet: der Maßstab steckt in
      // der Transformationsmatrix, W und H sind die Fläche in genau diesen Einheiten.
      // Dadurch bleibt der gesamte Zeichencode unverändert und trotzdem auflösungsfair.
      const k = fishScale(Wpx, Hpx);
      const W = Wpx / k, H = Hpx / k;
      const padBottom = DECK_BAR_PX / k;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      const nowPerf = performance.now();
      const nowMs = Date.now();

      // Wasser: dunkler Verlauf + sanft wandernde Lichtbänder
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a1622');
      grad.addColorStop(0.5, '#0a1a2b');
      grad.addColorStop(1, '#081220');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      for (let i = 0; i < 5; i++) {
        const yBase = (H / 6) * (i + 1);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 14) {
          const y = yBase + Math.sin(x / 90 + nowPerf / 1600 + i * 1.7) * 7;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(125, 200, 255, ${0.035 + (i % 2) * 0.02})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      // treibende Lichtpunkte
      for (let i = 0; i < 22; i++) {
        const px = ((i * 173.3 + nowPerf * (0.012 + (i % 5) * 0.004)) % (W + 40)) - 20;
        const py = ((i * 97.7) % H);
        ctx.fillStyle = 'rgba(160, 215, 255, 0.05)';
        ctx.beginPath();
        ctx.arc(px, py, 1.6 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!s) return;
      const serverTime = nowMs - (s.clientReceivedAt - s.serverNow);
      const { x: mx, y: my } = mouseRef.current;
      let hovered = null;

      for (const f of s.fish) {
        const { x, y, age } = fishPos(f, serverTime, W, H, padBottom);
        if (!f.caughtBy && (age < 0 || age > f.travelMs)) continue;

        // Fang-Animation: Karte steigt auf, Ring in Spielerfarbe, blendet aus
        if (f.caughtBy) {
          const e = Math.min(1, (nowMs - f.caughtAt + (s.clientReceivedAt - s.serverNow)) / CAUGHT_LINGER_MS);
          const capped = Math.max(0, e);
          ctx.save();
          ctx.globalAlpha = 1 - capped;
          const cy = y - capped * 46;
          roundRectPath(ctx, x, cy, FISH_W, FISH_H, 7);
          ctx.save();
          ctx.clip();
          const img = getCardImage(f.card.id);
          if (img.complete && img.naturalWidth) ctx.drawImage(img, x, cy, FISH_W, FISH_H);
          ctx.restore();
          ctx.strokeStyle = f.caughtColor || '#22c55e';
          ctx.lineWidth = 3;
          roundRectPath(ctx, x, cy, FISH_W, FISH_H, 7);
          ctx.stroke();
          // aufsteigender Fangring
          ctx.strokeStyle = (f.caughtColor || '#22c55e');
          ctx.globalAlpha = (1 - capped) * 0.8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + FISH_W / 2, cy + FISH_H / 2, 14 + capped * 46, 0, Math.PI * 2);
          ctx.stroke();
          // Name des Fängers
          ctx.globalAlpha = 1 - capped;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = f.caughtColor || '#22c55e';
          ctx.fillText(f.caughtName || '', x + FISH_W / 2, cy - 8);
          ctx.restore();
          continue;
        }

        const dv = diveFactor(f, age);
        const hardDive = isHardDiving(f, age);
        const isHover = !hardDive && mx >= x && mx <= x + FISH_W && my >= y && my <= y + FISH_H;
        if (isHover) hovered = f;
        const yDraw = y + dv * 9; // beim Abtauchen sackt die Karte leicht ab

        ctx.save();
        ctx.globalAlpha = 1 - dv * 0.68;

        // Hover-Glow (nur wenn fangbar)
        if (isHover && canInteractRef.current) {
          ctx.shadowColor = RARITY_COLOR[f.card.rarity] || '#8b5cf6';
          ctx.shadowBlur = 22;
        }

        roundRectPath(ctx, x, yDraw, FISH_W, FISH_H, 7);
        ctx.fillStyle = '#0c1622';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.save();
        roundRectPath(ctx, x, yDraw, FISH_W, FISH_H, 7);
        ctx.clip();
        const img = getCardImage(f.card.id);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, yDraw, FISH_W, FISH_H);
        // Beim Abtauchen: bläulicher Schleier über der Karte
        if (dv > 0) {
          ctx.fillStyle = `rgba(20, 60, 110, ${dv * 0.55})`;
          ctx.fillRect(x, yDraw, FISH_W, FISH_H);
        }
        ctx.restore();

        // Rahmen: Rarity-Farbe, beim Hovern heller
        ctx.strokeStyle = isHover && canInteractRef.current
          ? '#ffffff'
          : (RARITY_COLOR[f.card.rarity] || '#555') + (dv > 0 ? '55' : 'aa');
        ctx.lineWidth = isHover && canInteractRef.current ? 2.5 : 1.5;
        roundRectPath(ctx, x, yDraw, FISH_W, FISH_H, 7);
        ctx.stroke();

        // Champion-Krone
        if (f.card.isChampion) {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          roundRectPath(ctx, x + FISH_W - 18, yDraw + 3, 15, 13, 3);
          ctx.fill();
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.moveTo(x + FISH_W - 15.5, yDraw + 13);
          ctx.lineTo(x + FISH_W - 15.5, yDraw + 8);
          ctx.lineTo(x + FISH_W - 13, yDraw + 10.5);
          ctx.lineTo(x + FISH_W - 10.5, yDraw + 6);
          ctx.lineTo(x + FISH_W - 8, yDraw + 10.5);
          ctx.lineTo(x + FISH_W - 5.5, yDraw + 8);
          ctx.lineTo(x + FISH_W - 5.5, yDraw + 13);
          ctx.closePath();
          ctx.fill();
        }

        // Luftblasen beim Abtauchen
        if (dv > 0.15) {
          ctx.globalAlpha = dv * 0.5;
          for (let b = 0; b < 3; b++) {
            const bx = x + FISH_W / 2 + Math.sin(nowPerf / 300 + b * 2.1) * 12;
            const by = yDraw - 4 - ((nowPerf / 18 + b * 26) % 34);
            ctx.strokeStyle = 'rgba(170, 220, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bx, by, 2 + b, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1 - dv * 0.68;
        }

        // Kartenname unter der Karte (nur oberflächennah lesbar)
        if (dv < 0.4) {
          ctx.globalAlpha = (1 - dv) * 0.85;
          ctx.font = '600 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(f.card.name, x + FISH_W / 2, yDraw + FISH_H + 12);
        }
        ctx.restore();

        // Abgelehnt-Feedback: roter Rahmen-Blitz auf der betroffenen Karte
        const denied = deniedRef.current;
        if (denied && denied.fishId === f.fishId && nowMs - denied.ts < 700) {
          ctx.save();
          ctx.globalAlpha = 1 - (nowMs - denied.ts) / 700;
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          roundRectPath(ctx, x - 2, yDraw - 2, FISH_W + 4, FISH_H + 4, 8);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Klick-Platscher
      splashesRef.current = splashesRef.current.filter(sp => nowPerf - sp.ts < 550);
      for (const sp of splashesRef.current) {
        const e = (nowPerf - sp.ts) / 550;
        ctx.save();
        ctx.globalAlpha = (1 - e) * 0.55;
        ctx.strokeStyle = '#9bd4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4 + e * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2 + e * 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      hoverRef.current = hovered;
      canvas.style.cursor = !canInteractRef.current
        ? 'not-allowed'
        : hovered ? 'pointer' : 'default';
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [deniedRef]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const k = fishScale(rect.width, rect.height);
          mouseRef.current = { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k };
        }}
        onMouseLeave={() => { mouseRef.current = { x: -1, y: -1 }; }}
        onMouseDown={handleClick}
      />
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function AngelRoyale({ fishState, myPlayerId, onCatch, denied, lang = 'de' }) {
  const t = ANGEL_I18N[lang] || ANGEL_I18N.de;
  const now = useNow(100);
  const state = fishState;
  const deniedRef = useRef(null);
  useEffect(() => { deniedRef.current = denied; }, [denied]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const clientOffset = state.clientReceivedAt - state.serverNow;
  const me = state.players.find(p => p.id === myPlayerId);
  const amSpectator = !me || (me.isSpectator ?? false);
  const myDeck = me?.deck || [];
  const myDeckFull = myDeck.length >= state.deckSize;

  const countdownUntilClient = state.countdownUntil ? state.countdownUntil + clientOffset : null;
  const inCountdown = !!(countdownUntilClient && countdownUntilClient > now);
  const countdownRemaining = inCountdown ? Math.max(1, Math.ceil((countdownUntilClient - now) / 1000)) : 0;

  // Angel-Cooldown (catchCooldown): Restzeit + Fortschritt für die Anzeige
  const cooldownUntilClient = me?.cooldownUntil ? me.cooldownUntil + clientOffset : 0;
  const coolingMs = Math.max(0, cooldownUntilClient - now);
  const isCooling = coolingMs > 0;
  const coolPct = state.catchCooldownMs > 0 ? Math.min(100, (coolingMs / state.catchCooldownMs) * 100) : 0;

  const canInteract = !amSpectator && !myDeckFull && !state.finished && !inCountdown && !isCooling;

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const doneCount = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;

  const showDeniedToast = denied && (now - denied.ts) < 1600;

  return (
    <div className="h-full flex overflow-hidden select-none">
      <AngelSidebar state={state} myPlayerId={myPlayerId} t={t} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <FishingRod size={15} className="text-sky-400 shrink-0" />
          <span className="text-white font-bold text-sm shrink-0">Angel Royale</span>
          <span className="text-gray-500 text-xs shrink-0">{t.decksDone(doneCount, activePlayers.length)}</span>
          <div className="flex-1" />
          {!amSpectator && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${myDeckFull ? 'text-green-400' : 'text-sky-300'}`}>
              {t.cardsOf(myDeck.length, state.deckSize)}
            </span>
          )}
        </div>

        {/* Status-Banner */}
        {state.finished ? (
          <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
            <Check size={16} className="text-green-400 shrink-0" />
            <p className="text-green-300 font-bold text-sm">{t.allDecksFull}</p>
          </div>
        ) : amSpectator ? (
          <div className="shrink-0 px-4 py-2.5 bg-[#101016] border-b border-white/5 flex items-center gap-3">
            <p className="text-gray-400 font-semibold text-sm">{t.spectatorLive}</p>
          </div>
        ) : myDeckFull ? (
          <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
            <Check size={16} className="text-green-400 shrink-0" />
            <p className="text-green-300 font-bold text-sm">{t.yourDeckFull}</p>
          </div>
        ) : (
          <div className="shrink-0 px-4 py-2.5 bg-sky-500/10 border-b border-sky-500/30 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
            <p className="text-sky-200 font-bold text-sm">{t.catchHint}</p>
          </div>
        )}

        {/* Fluss */}
        <div className="flex-1 relative overflow-hidden">
          <RiverCanvas
            state={state}
            myPlayerId={myPlayerId}
            canInteract={canInteract}
            onCatch={onCatch}
            deniedRef={deniedRef}
          />

          {/* Abgelehnt-Toast */}
          {showDeniedToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 backdrop-blur-md pointer-events-none">
              <p className="text-red-300 text-xs font-bold">{t.denied[denied.reason] || t.denied.late}</p>
            </div>
          )}

          {/* Deck-Leiste (Glas) — füllt sich mit den 8 gefangenen Karten */}
          {!amSpectator && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(94%,40rem)]">
              <div className={`rounded-xl border backdrop-blur-md px-4 py-3 transition-colors ${
                isCooling ? 'bg-red-950/30 border-red-500/30' : 'bg-white/[0.06] border-white/10'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t.yourDeck}</span>
                  {state.catchCooldownMs > 0 && !myDeckFull && !state.finished && (
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold tabular-nums ${
                      isCooling ? 'text-red-300' : 'text-sky-300'}`}>
                      {isCooling
                        ? <><Hourglass size={11} className="shrink-0" /> {t.reelingIn((coolingMs / 1000).toFixed(1))}</>
                        : <><FishingRod size={11} className="shrink-0" /> {t.rodReady}</>}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {Array.from({ length: state.deckSize }, (_, i) => {
                    const card = myDeck[i];
                    return (
                      <div key={i} title={card?.name}
                        className={`aspect-[5/6] rounded-md overflow-hidden border ${
                          card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/10 bg-black/25'}`}>
                        {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                      </div>
                    );
                  })}
                </div>
                {/* Cooldown-Ladebalken (catchCooldown) */}
                {state.catchCooldownMs > 0 && (
                  <div className="mt-2 h-1 rounded-sm overflow-hidden bg-white/5">
                    <div className={isCooling ? 'h-full bg-red-500/80' : 'h-full bg-sky-500/60'}
                      style={{ width: `${isCooling ? coolPct : 100}%`, transition: 'width .1s linear' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Start-Countdown deckt den Fluss ab, damit niemand einen Klick-Vorsprung hat */}
          {inCountdown && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#081220]">
              <div className="text-center">
                <p className="text-sky-300 text-sm font-bold uppercase tracking-widest mb-3">{t.getReady}</p>
                <p className="text-white font-black text-7xl tabular-nums leading-none">{countdownRemaining}</p>
                <p className="text-gray-400 text-xs mt-3">{t.riverOpens}</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
