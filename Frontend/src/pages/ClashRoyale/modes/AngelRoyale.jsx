import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, FishingRod, Hourglass, Eye } from 'lucide-react';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import { RARITY_COLOR, cardImageUrl } from '../data/cards';
import ModeShell from './ModeShell';
import { CARD_CROP } from './cardCrop';
import { GameHeader, ProgressHairline, GameSurface, PlayerPanel, DeckGrid } from './GameChrome';

/** Akzentfarbe des Modus. */
const ACCENT = '#38bdf8';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));

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
    cardsLabel: 'Karten',
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
    autoIn: (s) => `Zwangs-Angel in ${s}s`,
    autoCaught: (name) => `Zu langsam — ${name} wurde für dich geangelt!`,
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
    cardsLabel: 'Cards',
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
    autoIn: (s) => `Auto-catch in ${s}s`,
    autoCaught: (name) => `Too slow — ${name} was caught for you!`,
    denied: {
      cooldown: 'Your rod isn\'t ready yet!',
      diving: 'Submerged — can\'t be caught!',
      late: 'Too late — it\'s gone!',
      champion: 'Champion limit (max. 2)!',
      deckfull: 'Your deck is full!',
      countdown: 'Not yet — wait for the start!',
    },
  },
  es: {
    you: 'Tú',
    cardsLabel: 'Cartas',
    loading: 'Cargando Pesca Royale…',
    done: 'Listo',
    decksDone: (done, total) => `${done}/${total} mazos listos`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cartas`,
    allDecksFull: '¡Todos los mazos están completos — draft terminado!',
    spectatorLive: 'Espectador — ves el río en directo.',
    yourDeckFull: '¡Tu mazo está completo! Espera a que los demás terminen…',
    catchHint: 'Haz clic en las cartas que pasan flotando para pescarlas — las cartas sumergidas no se pueden atrapar.',
    getReady: 'Preparad las cañas…',
    riverOpens: 'El río se abre para todos al mismo tiempo',
    yourDeck: 'Tu mazo',
    rodReady: 'Caña lista',
    reelingIn: (s) => `Recogiendo el sedal… ${s}s`,
    caughtBy: (name) => `¡${name} la pescó!`,
    yourCatch: '¡Pescada!',
    autoIn: (s) => `Pesca automática en ${s}s`,
    autoCaught: (name) => `Demasiado lento — ¡${name} la pescó por ti!`,
    denied: {
      cooldown: '¡Tu caña todavía no está lista!',
      diving: '¡Sumergida — no se puede atrapar!',
      late: '¡Demasiado tarde — ya no está!',
      champion: '¡Límite de campeones (máx. 2)!',
      deckfull: '¡Tu mazo está completo!',
      countdown: '¡Todavía no — espera al inicio!',
    },
  },
};

/**
 * Laufende Uhr für alles Zeitabhängige in der Oberfläche.
 *
 * ACHTUNG: Diese Uhr darf nicht bedarfsgesteuert angehalten werden. `now` treibt
 * hier nicht nur zwei kurze Einblendungen, sondern auch den Start-Countdown, den
 * Angel-Cooldown und den Zwangs-Angel-Timer — und über `inCountdown`/`isCooling`
 * hängt `canInteract` daran. Steht die Uhr, bleibt der Countdown bei 3 stehen und
 * das Anklicken der Karten ist dauerhaft gesperrt.
 *
 * Der Fluss selbst läuft über eine eigene requestAnimationFrame-Schleife im
 * Canvas und ist von dieser Uhr unabhängig.
 */
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
    img.src = cardImageUrl(id);
    _imgCache.set(id, img);
  }
  return _imgCache.get(id);
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name }) {
  return (
    // Kein FARBIGER Hintergrund (siehe entsprechenden Kommentar in SnakeRoyale.jsx) —
    // ein neutrales Dunkelgrau verhindert nur, dass das Diamant-Karo der Spielfläche
    // durch transparente Bildränder scheint.
    <div className="relative w-full h-full bg-[#0d0d14]">
      <img src={cardImageUrl(id)} alt={name} className="w-full h-full object-cover" draggable={false}
        style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// ── Sidebar: Spieler mit Deck-Fortschritt ──────────────────────────────────
// React.memo, weil die Sidebar nur vom Server-State abhängt: Sie muss nicht neu
// gerendert werden, wenn die Hauptkomponente aus anderen Gründen durchläuft —
// bei acht Spielern hängen daran 64 Kartenbilder.
const AngelSidebar = React.memo(function AngelSidebar({ state, myPlayerId, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators = state.players.filter(p => p.isSpectator);
  return (
    // Rahmen (Hintergrund, Rand, Scrollen) macht ModeShell — hier nur der Inhalt.
    <>
      {activePlayers.map(p => {
        const isMe = p.id === myPlayerId;
        const done = (p.deck || []).length >= state.deckSize;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        return (
          <PlayerPanel key={p.id} isMe={isMe}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarCircle id={p.avatar} color={p.color} size={28} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                {done
                  ? <Check size={13} className="text-green-400 shrink-0" title={t.done} />
                  : <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/{state.deckSize}</span>}
              </div>
            }>
            <DeckGrid deck={p.deck || []} size={state.deckSize}
              renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
            <div className="flex items-center gap-1.5">
              <img src={crownIcon} alt="" width={14} height={12} className={champCount > 0 ? '' : 'opacity-15 grayscale'} />
              <span className="text-white/30 text-[11px]">{champCount}/2 Champions</span>
            </div>
          </PlayerPanel>
        );
      })}
      {spectators.length > 0 && (
        <>
          <div className="h-px bg-white/[0.06]" />
          {spectators.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-1 py-1 opacity-45">
              <AvatarCircle id={p.avatar} color={p.color} size={20} />
              <span className="text-white/60 text-[11px] truncate flex-1">{p.name}</span>
              <Eye size={11} className="text-white/40 shrink-0" />
            </div>
          ))}
        </>
      )}
    </>
  );
});

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
function fishPos(f, serverTime, W, H, padBottom) {
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

// Sprint-Intensität 0..1 (mit 140ms Ein-/Ausblendung, damit Schlieren nicht hart aufpoppen).
// Nur für die Optik — die Bewegung selbst schaltet in fishProgress() hart um.
function sprintFactor(f, age) {
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
function RiverCanvas({ state, canInteract, onCatch, deniedRef }) {
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
        const sf = sprintFactor(f, age);
        const hardDive = isHardDiving(f, age);
        const isHover = !hardDive && mx >= x && mx <= x + FISH_W && my >= y && my <= y + FISH_H;
        if (isHover) hovered = f;
        const yDraw = y + dv * 9; // beim Abtauchen sackt die Karte leicht ab

        ctx.save();
        ctx.globalAlpha = 1 - dv * 0.68;

        // Flitzer: Nachzieh-Bilder und Tempo-Schlieren hinter der Karte, damit der Sprint
        // trotz des hohen Tempos ablesbar bleibt und man sie überhaupt anvisieren kann.
        if (sf > 0) {
          for (let gi = 3; gi >= 1; gi--) {
            const gp = fishPos(f, serverTime - gi * 55, W, H, padBottom);
            ctx.globalAlpha = sf * (0.26 - gi * 0.06);
            ctx.fillStyle = '#7dd3fc';
            roundRectPath(ctx, gp.x, gp.y, FISH_W, FISH_H, 7);
            ctx.fill();
          }
          ctx.globalAlpha = sf * 0.5;
          ctx.strokeStyle = 'rgba(190, 235, 255, 0.9)';
          ctx.lineWidth = 1.5;
          for (let l = 0; l < 5; l++) {
            const ly = yDraw + 8 + (l * (FISH_H - 16)) / 4;
            const len = 26 + ((l * 37) % 30);
            const sx = f.dir === 1 ? x - 5 : x + FISH_W + 5;
            ctx.beginPath();
            ctx.moveTo(sx, ly);
            ctx.lineTo(sx - f.dir * len, ly);
            ctx.stroke();
          }
          ctx.globalAlpha = 1 - dv * 0.68;
        }

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

        // Während des Sprints leuchtet der Rahmen kalt auf — das unterscheidet den
        // Flitzer auf den ersten Blick von einer normal treibenden Karte.
        if (sf > 0) {
          ctx.save();
          ctx.globalAlpha = sf * 0.9;
          ctx.strokeStyle = '#bae6fd';
          ctx.lineWidth = 2;
          roundRectPath(ctx, x, yDraw, FISH_W, FISH_H, 7);
          ctx.stroke();
          ctx.restore();
        }

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

        // Kartenname unter der Karte (nur oberflächennah lesbar, im Sprint verwischt er)
        if (dv < 0.4) {
          ctx.globalAlpha = (1 - dv) * 0.85 * (1 - sf * 0.75);
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

  // touch-action: none — ohne das kann ein Wisch übers Spielfeld die Seite scrollen/zoomen
  // statt nur den Fisch zu fangen (gleiches Muster wie DarkMaze.jsx).
  return (
    <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }}>
      {/* block + w-full/h-full: ein <canvas> ist von Haus aus inline-block und behält
          dadurch den Grundlinien-Abstand, den Inline-Elemente unter sich freilassen —
          zwischen Kopfzeile und Fluss blieb dadurch ein paar Pixel Diamant-Karo sichtbar,
          obwohl der Elternkasten bereits exakt bis dorthin reichte. */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
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
export default function AngelRoyale({ fishState, myPlayerId, onCatch, denied, autoCatch, lang = 'de' }) {
  const t = ANGEL_I18N[lang] || ANGEL_I18N.de;
  const state = fishState;
  const deniedRef = useRef(null);
  useEffect(() => { deniedRef.current = denied; }, [denied]);

  const now = useNow(100);

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

  // Angel-Zwang (fishIdleSeconds): läuft, sobald die Angel wieder bereit ist — bei Ablauf
  // angelt der Server eine zufällige Karte für einen. Die Frist steht in Server-Uhrzeit.
  const idleMs = state.idleMs || 0;
  const idleUntilClient = me?.idleUntil ? me.idleUntil + clientOffset : 0;
  const idleRemainingMs = Math.max(0, idleUntilClient - now);
  const idleActive = idleMs > 0 && !amSpectator && !myDeckFull && !state.finished && !inCountdown && !isCooling;
  const idleUrgent = idleActive && idleRemainingMs <= 2000;
  const idlePct = idleMs > 0 ? Math.min(100, (idleRemainingMs / idleMs) * 100) : 0;
  const showRodStatus = (state.catchCooldownMs > 0 || idleMs > 0) && !myDeckFull && !state.finished;

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const doneCount = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;

  const showDeniedToast = denied && (now - denied.ts) < 1600;
  const showAutoToast = autoCatch && (now - autoCatch.ts) < 2400;

  return (
    <ModeShell
      sidebar={<AngelSidebar state={state} myPlayerId={myPlayerId} t={t} />}
      playerCount={state.players.filter(p => !p.isSpectator).length}
      lang={lang}>

      <GameSurface>

        {/* Kopfzeile: der eigene Deckfortschritt ist das Ziel des Modus */}
        <GameHeader
          label={t.cardsLabel}
          value={amSpectator ? '–' : myDeck.length}
          total={amSpectator ? undefined : state.deckSize}
          badge={
            state.finished ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <Check size={14} /> {t.allDecksFull}
              </span>
            ) : amSpectator ? (
              <span className="flex items-center gap-1.5 text-white/35 text-sm">
                <Eye size={13} /> {t.spectatorLive}
              </span>
            ) : myDeckFull ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <Check size={14} /> {t.yourDeckFull}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sky-300 text-sm font-semibold">
                <FishingRod size={14} /> {t.catchHint}
              </span>
            )
          }
          meta={t.decksDone(doneCount, activePlayers.length)}
        />
        <ProgressHairline
          pct={amSpectator ? 0 : (myDeck.length / state.deckSize) * 100}
          accent={ACCENT} />

        {/* Fluss — Grundfarbe als Fallback, bis der Canvas beim ersten Resize das Wasser
            zeichnet (siehe RiverCanvas), damit dort nie kurz das Diamant-Karo durchschlägt. */}
        <div className="flex-1 relative overflow-hidden bg-[#0d2a3d]">
          <RiverCanvas
            state={state}
            canInteract={canInteract}
            onCatch={onCatch}
            deniedRef={deniedRef}
          />

          {/* Abgelehnt-Toast */}
          {showDeniedToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-950/85 border border-red-500/40 backdrop-blur-md pointer-events-none">
              <p className="text-red-300 text-xs font-bold">{t.denied[denied.reason] || t.denied.late}</p>
            </div>
          )}

          {/* Zwangs-Angel-Toast: der Server hat die Karte für einen gezogen */}
          {showAutoToast && !showDeniedToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-amber-950/85 border border-amber-500/40 backdrop-blur-md pointer-events-none">
              <p className="text-amber-200 text-xs font-bold">{t.autoCaught(autoCatch.card?.name || '')}</p>
            </div>
          )}

          {/* Deck-Leiste (Glas) — füllt sich mit den 8 gefangenen Karten */}
          {!amSpectator && (
            // Breiter als vorher (40rem): Auf großen Schirmen waren die acht Kacheln
            // in der Leiste kleiner als die Karten, die im Fluss vorbeischwimmen.
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(94%,52rem)]">
              {/* Deckbalken schwimmt über dem Fluss (Diamant-Karo, siehe GameSurface) — bei
                  40% Deckkraft war die Schrift darauf kaum noch zu lesen, jetzt deutlich
                  dunkler (backdrop-blur bleibt für den Glas-Effekt). */}
              <div className={`rounded-2xl backdrop-blur-md px-4 py-3 transition-colors ${
                isCooling ? 'bg-red-950/85'
                : idleUrgent ? 'bg-amber-950/85'
                : 'bg-black/80'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t.yourDeck}</span>
                  {showRodStatus && (
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold tabular-nums ${
                      isCooling ? 'text-red-300' : idleUrgent ? 'text-amber-300' : idleActive ? 'text-amber-200/70' : 'text-sky-300'}`}>
                      {isCooling
                        ? <><Hourglass size={11} className="shrink-0" /> {t.reelingIn((coolingMs / 1000).toFixed(1))}</>
                        : idleActive
                          ? <><Hourglass size={11} className="shrink-0" /> {t.autoIn((idleRemainingMs / 1000).toFixed(1))}</>
                          : <><FishingRod size={11} className="shrink-0" /> {t.rodReady}</>}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {Array.from({ length: state.deckSize }, (_, i) => {
                    const card = myDeck[i];
                    return (
                      <div key={i} title={card?.name}
                        className={`aspect-[5/6] rounded-md overflow-hidden ${card ? '' : 'bg-[#0d0d14]'}`}>
                        {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                      </div>
                    );
                  })}
                </div>
                {/* Ladebalken: erst der Angel-Cooldown, danach die Frist bis zur Zwangs-Angel */}
                {(state.catchCooldownMs > 0 || idleMs > 0) && (
                  <div className="mt-2 h-1 rounded-sm overflow-hidden bg-white/5">
                    <div className={isCooling ? 'h-full bg-red-500/80'
                      : idleUrgent ? 'h-full bg-amber-400/90'
                      : idleActive ? 'h-full bg-amber-500/50'
                      : 'h-full bg-sky-500/60'}
                      style={{ width: `${isCooling ? coolPct : idleActive ? idlePct : 100}%`, transition: 'width .1s linear' }} />
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

      </GameSurface>
    </ModeShell>
  );
}
