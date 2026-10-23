import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import CardFace from '../ui/CardFace';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { CrCheck, CrChest, CrClock, CrClose, CrSearch, CrSocial, CrStar, CrTelescope, CrTv } from '../ui/CrIcons';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import { RARITY_COLOR, ALL_CARDS, cardImageUrl } from '../data/cards';
import ghostImgSrc from '../../../assets/clashRoyale/ui/Royale_Ghost.png';
import chestImgSrc from '../../../assets/clashRoyale/ui/draft-chest.png';
import jokerImgSrc from '../../../assets/clashRoyale/ui/UnknownCard.webp';
import { drawCardFrame } from './cardCrop';
import { ProgressHairline, PlayerPanel, DeckGrid } from './GameChrome';
import { avatarUrl } from '../components/avatars';
import { useMazeStepper } from './maze/useMazeStepper';

// Ego-Perspektive (three.js) — erst geladen, wenn sie gebraucht wird
const Maze3D = lazy(() => import('./maze/Maze3D'));

/** Akzentfarbe des Modus. */
const ACCENT = '#a78bfa';

const CARD_BY_ID = Object.fromEntries(ALL_CARDS.map(c => [c.id, c]));

// So viele Kacheln passen in die kürzere Bildschirmseite. Der Wert bestimmt den Zoom
// und ist bewusst fest: dadurch sieht jeder Spieler gleich viel vom Labyrinth,
// unabhängig von Monitor und Fenstergröße.
const VISIBLE_TILES = 10.5;

// Touch-Gerät? Dann kommen Steuerkreuz und Aufheben-Taste über das Labyrinth und die
// Spielerliste wandert in eine Schublade. Einmal beim Laden ermittelt — der Zeigertyp
// wechselt während einer Runde nicht.
const IS_COARSE_POINTER = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(pointer: coarse)').matches
  : false;


const MAZE_I18N = {
  de: {
    you: 'Du',
    cardsLabel: 'Karten',
    loading: 'Lade Dunkles Labyrinth…',
    done: 'Fertig',
    decksDone: (done, total) => `${done}/${total} Decks fertig`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} Karten`,
    allDecksFull: 'Alle Decks sind voll — Draft abgeschlossen!',
    timeUp: 'Zeit abgelaufen — leere Deck-Plätze wurden zufällig aufgefüllt.',
    spectatorLive: 'Zuschauer — du siehst das ganze Labyrinth ohne Dunkelheit.',
    yourDeckFull: 'Dein Deck ist voll! Warte auf die anderen oder auf den Timer…',
    moveHint: 'WASD / Pfeiltasten: bewegen · Leertaste: aufheben & Kisten öffnen',
    moveHintTouch: 'Steuerkreuz: bewegen · Hand-Taste: aufheben & Kisten öffnen',
    moveHint3d: 'W/S: vor & zurück · A/D: drehen · Q/E: seitwärts · Leertaste: aufheben',
    moveHint3dTouch: 'Pfeile: gehen · Drehpfeile: umdrehen · Hand: aufheben',
    players: 'Spieler',
    pickupBtn: 'Aufheben',
    getReady: 'Bereit machen…',
    mazeOpens: 'Das Labyrinth öffnet für alle gleichzeitig',
    pickupHint: 'Leertaste: Karte aufheben',
    chestHint: 'Leertaste: Kiste öffnen',
    jokerHint: 'Leertaste: Joker nehmen',
    draftTitle: 'Draft-Kiste',
    draftSub: 'Wähle 1 von 2 Karten',
    jokerTitle: 'Der Joker!',
    jokerSub: 'Wähle eine beliebige freie Karte für dein Deck',
    searchCard: 'Karte suchen…',
    noCardFound: 'Keine Karte gefunden.',
    championLimit: 'Champion-Limit (max. 2)',
    frozenNote: 'Du musst nichts nehmen — mit X oder Esc schließen und weiterlaufen.',
    closeTitle: 'Ohne Karte schließen (Esc)',
  },
  en: {
    you: 'You',
    cardsLabel: 'Cards',
    loading: 'Loading Dark Maze…',
    done: 'Done',
    decksDone: (done, total) => `${done}/${total} decks done`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cards`,
    allDecksFull: 'All decks are full — draft complete!',
    timeUp: 'Time is up — empty deck slots were filled randomly.',
    spectatorLive: 'Spectator — you see the whole maze without darkness.',
    yourDeckFull: 'Your deck is full! Wait for the others or the timer…',
    moveHint: 'WASD / arrow keys: move · Space: pick up & open chests',
    moveHintTouch: 'D-pad: move · Hand button: pick up & open chests',
    moveHint3d: 'W/S: forward & back · A/D: turn · Q/E: strafe · Space: pick up',
    moveHint3dTouch: 'Arrows: walk · Turn arrows: turn · Hand: pick up',
    players: 'Players',
    pickupBtn: 'Pick up',
    getReady: 'Get ready…',
    mazeOpens: 'The maze opens for everyone at the same time',
    pickupHint: 'Space: pick up card',
    chestHint: 'Space: open chest',
    jokerHint: 'Space: take the joker',
    draftTitle: 'Draft chest',
    draftSub: 'Choose 1 of 2 cards',
    jokerTitle: 'The Joker!',
    jokerSub: 'Choose any free card for your deck',
    searchCard: 'Search cards…',
    noCardFound: 'No card found.',
    championLimit: 'Champion limit (max. 2)',
    frozenNote: 'You don\'t have to take anything — close with X or Esc and move on.',
    closeTitle: 'Close without a card (Esc)',
  },
  es: {
    you: 'Tú',
    cardsLabel: 'Cartas',
    loading: 'Cargando Laberinto Oscuro…',
    done: 'Listo',
    decksDone: (done, total) => `${done}/${total} mazos listos`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cartas`,
    allDecksFull: '¡Todos los mazos están completos — draft terminado!',
    timeUp: 'Se acabó el tiempo — las casillas de mazo vacías se rellenaron al azar.',
    spectatorLive: 'Espectador — ves todo el laberinto sin oscuridad.',
    yourDeckFull: '¡Tu mazo está completo! Espera a los demás o al temporizador…',
    moveHint: 'WASD / flechas: moverse · Espacio: recoger y abrir cofres',
    moveHintTouch: 'Cruceta: moverse · Botón de mano: recoger y abrir cofres',
    moveHint3d: 'W/S: avanzar y retroceder · A/D: girar · Q/E: lateral · Espacio: recoger',
    moveHint3dTouch: 'Flechas: andar · Flechas de giro: girar · Mano: recoger',
    players: 'Jugadores',
    pickupBtn: 'Recoger',
    getReady: 'Prepárate…',
    mazeOpens: 'El laberinto se abre para todos al mismo tiempo',
    pickupHint: 'Espacio: recoger carta',
    chestHint: 'Espacio: abrir cofre',
    jokerHint: 'Espacio: tomar el comodín',
    draftTitle: 'Cofre de draft',
    draftSub: 'Elige 1 de 2 cartas',
    jokerTitle: '¡El comodín!',
    jokerSub: 'Elige cualquier carta libre para tu mazo',
    searchCard: 'Buscar cartas…',
    noCardFound: 'No se encontró ninguna carta.',
    championLimit: 'Límite de campeones (máx. 2)',
    frozenNote: 'No tienes que llevarte nada — cierra con X o Esc y sigue adelante.',
    closeTitle: 'Cerrar sin carta (Esc)',
  },
};

function useNow(intervalMs = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Sprites + Kartenbilder einmalig laden
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}
const ghostSprite = loadImage(ghostImgSrc);
const chestSprite = loadImage(chestImgSrc);
const jokerSprite = loadImage(jokerImgSrc);
const _imgCache = new Map();
function getCardImage(id) {
  if (!_imgCache.has(id)) _imgCache.set(id, loadImage(cardImageUrl(id)));
  return _imgCache.get(id);
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 cr-avatar-pick"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name }) {
  return (
    // Kein eingefärbter Hintergrund mehr: Bei Artworks mit transparentem Rand
    // schimmerte er durch und legte einen farbigen Schleier über jede Karte.
    <div className="relative w-full h-full">
      <CardFace id={id} alt={name} />
    </div>
  );
}

// ── Sidebar: Spieler mit Deck-Fortschritt ──────────────────────────────────
// React.memo: Die Sidebar hängt nur am Server-State, nicht an der Uhr der
// Hauptkomponente — bei acht Spielern spart das je acht Kartenbilder pro Takt.
const MazeSidebar = React.memo(function MazeSidebar({ state, myPlayerId, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators = state.players.filter(p => p.isSpectator);
  return (
    <div className="w-60 shrink-0 bg-gradient-to-b from-[#15294a] to-[#0d1b31] border-r-[3px] overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3"
      style={{ borderColor: 'var(--cr-panel-edge)' }}>
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
                  ? <CrCheck size={19} className="text-green-400 shrink-0" title={t.done} />
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
              <CrTv size={16} className="text-white/40 shrink-0" />
            </div>
          ))}
        </>
      )}
    </div>
  );
});

// Deterministische Boden-Schattierung, damit die Kacheln nicht steril wirken
function tileShade(x, y) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return (h % 7) / 7;
}

// ── Das Labyrinth (Canvas mit Fog of War) ──────────────────────────────────
function MazeCanvas({ state, myPlayerId, amSpectator, onMove, onPickup, frozen }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fogRef = useRef(null);          // Offscreen-Canvas für die Dunkelheit
  const stateRef = useRef(state);
  const renderPosRef = useRef({});      // weich interpolierte Render-Positionen aller Spieler
  // Vorhersage + Server-Abgleich der eigenen Schritte (geteilt mit der 3D-Ansicht)
  const { predRef, pendingRef, tryStep } = useMazeStepper({ state, myPlayerId, frozen });
  const keysRef = useRef([]);           // gehaltene Richtungen, letzte zuerst relevant
  const lastFrameRef = useRef(0);
  const dprRef = useRef(1);             // Pixel pro Bühnenpixel (Gerät × Bühnen-Skalierung)
  const propsRef = useRef({});
  stateRef.current = state;
  propsRef.current = { myPlayerId, amSpectator, onMove, onPickup, frozen, tryStep };

  // Öffnet ein Popup, dürfen gehaltene Tasten nicht "nachlaufen", sobald es schließt
  useEffect(() => { if (frozen) { keysRef.current = []; pendingRef.current = []; } }, [frozen, pendingRef]);

  // Tastatur: Bewegen + Aufheben (Leertaste). preventDefault, damit die Seite nicht scrollt.
  useEffect(() => {
    const dirFor = (key) => ({
      w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
      a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
    })[key];
    // Tippt jemand gerade in einem Eingabefeld (z.B. Kartensuche im Joker-Popup),
    // dürfen Bewegungstasten die Eingabe nicht schlucken
    const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const dir = dirFor(key);
      if (dir) {
        e.preventDefault();
        if (!keysRef.current.includes(dir)) keysRef.current.push(dir);
      } else if (key === ' ' || key === 'e') {
        e.preventDefault();
        if (!propsRef.current.amSpectator && !propsRef.current.frozen) propsRef.current.onPickup();
      }
    };
    const onKeyUp = (e) => {
      const dir = dirFor(e.key.toLowerCase());
      if (dir) keysRef.current = keysRef.current.filter(d => d !== dir);
    };
    const onBlur = () => { keysRef.current = []; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!fogRef.current) fogRef.current = document.createElement('canvas');
    const fog = fogRef.current;
    const fctx = fog.getContext('2d');
    let raf;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      fog.width = canvas.width;
      fog.height = canvas.height;
      dprRef.current = dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = (nowPerf) => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      const { myPlayerId: myId, amSpectator: spec, onMove: move, frozen: isFrozen, tryStep: step } = propsRef.current;
      const dpr = dprRef.current;
      const W = canvas.width / dpr, H = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0d';
      ctx.fillRect(0, 0, W, H);
      if (!s) return;

      const dt = Math.min(64, nowPerf - (lastFrameRef.current || nowPerf));
      lastFrameRef.current = nowPerf;
      const nowMs = Date.now();
      const clientOffset = s.clientReceivedAt - s.serverNow;
      const inCountdown = s.countdownUntil && (s.countdownUntil + clientOffset) > nowMs;

      // ── Eingabe → Schritt senden (mit lokaler Vorhersage) ────────────────
      const pred = predRef.current;
      if (!spec && !isFrozen && !inCountdown && !s.finished && pred && keysRef.current.length) {
        step(s, keysRef.current[keysRef.current.length - 1], nowPerf, move);
      }

      // ── Render-Positionen weich interpolieren ────────────────────────────
      const targets = { ...s.positions };
      if (!spec && pred && targets[myId]) targets[myId] = { x: pred.x, y: pred.y, dir: pred.dir };
      for (const [pid, tp] of Object.entries(targets)) {
        const rp = renderPosRef.current[pid] || (renderPosRef.current[pid] = { x: tp.x, y: tp.y });
        const speed = (dt / s.stepMs) * 1.15; // Kacheln pro Frame
        const dx = tp.x - rp.x, dy = tp.y - rp.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) { rp.x = tp.x; rp.y = tp.y; }
        else if (dist > 0.001) {
          const step = Math.min(dist, speed);
          rp.x += (dx / dist) * step;
          rp.y += (dy / dist) * step;
        }
      }
      for (const pid of Object.keys(renderPosRef.current)) {
        if (!targets[pid]) delete renderPosRef.current[pid];
      }

      // ── Kamera ───────────────────────────────────────────────────────────
      // Spieler: strikt auf die eigene Figur zentriert und OHNE Klemmung an die
      // Labyrinth-Ränder. Würde man die Kamera an den Rändern anhalten, könnte man aus
      // dem Bildausschnitt ableiten, wo man sich im Labyrinth befindet (und damit die
      // Mitte erahnen). Zuschauer sehen weiterhin die ganze Karte.
      let ts, camX, camY;
      if (spec || !targets[myId]) {
        ts = Math.min(W / s.W, H / s.H);
        camX = (s.W * ts - W) / 2;
        camY = (s.H * ts - H) / 2;
      } else {
        // Kachelgröße proportional zur kürzeren Seite: dadurch sind auf jedem Bildschirm
        // gleich viele Kacheln zu sehen (~10,5 in der Höhe) und der Lichtkegel nimmt
        // immer denselben Anteil des Bildes ein. Feste Ober-/Untergrenzen hatten genau
        // das kaputt gemacht — auf kleinen Fenstern war der Ausschnitt relativ größer.
        ts = Math.min(W, H) / VISIBLE_TILES;
        const meRp = renderPosRef.current[myId] || { x: 0, y: 0 };
        camX = (meRp.x + 0.5) * ts - W / 2;
        camY = (meRp.y + 0.5) * ts - H / 2;
      }
      const tileToScreen = (x, y) => ({ sx: x * ts - camX, sy: y * ts - camY });

      // ── Kacheln ──────────────────────────────────────────────────────────
      // Bereiche außerhalb des Labyrinths werden als Mauerwerk gezeichnet, damit die
      // freilaufende Kamera an den Rändern keine sichtbare "Leere" erzeugt
      const x0 = Math.floor(camX / ts), x1 = Math.ceil((camX + W) / ts);
      const y0 = Math.floor(camY / ts), y1 = Math.ceil((camY + H) / ts);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const { sx, sy } = tileToScreen(x, y);
          const outside = x < 0 || y < 0 || x >= s.W || y >= s.H;
          if (outside || s.walls[y][x] === '1') {
            ctx.fillStyle = '#232330';
            ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
            ctx.fillStyle = '#2d2d3e';
            ctx.fillRect(sx, sy, ts + 0.5, Math.max(2, ts * 0.14));
            ctx.fillStyle = '#1a1a24';
            ctx.fillRect(sx, sy + ts - Math.max(2, ts * 0.1), ts + 0.5, Math.max(2, ts * 0.1));
          } else {
            const shade = tileShade(x, y) * 8;
            ctx.fillStyle = `rgb(${16 + shade}, ${16 + shade}, ${22 + shade})`;
            ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
          }
        }
      }

      // ── Items ────────────────────────────────────────────────────────────
      for (const it of s.items) {
        const { sx, sy } = tileToScreen(it.x, it.y);
        if (sx < -ts || sy < -ts || sx > W + ts || sy > H + ts) continue;
        const bob = Math.sin(nowPerf / 420 + it.x * 1.3 + it.y) * ts * 0.04;
        if (it.kind === 'chest') {
          const size = ts * 0.82;
          if (chestSprite.complete && chestSprite.naturalWidth) {
            ctx.save();
            ctx.shadowColor = 'rgba(250, 200, 90, 0.5)';
            ctx.shadowBlur = ts * 0.35;
            ctx.drawImage(chestSprite, sx + (ts - size) / 2, sy + (ts - size) / 2 + bob, size, size);
            ctx.restore();
          }
        } else if (it.kind === 'card' && it.card) {
          const cw = ts * 0.56, ch = cw * 1.25;
          const img = getCardImage(it.card.id);
          ctx.save();
          ctx.shadowColor = (RARITY_COLOR[it.card.rarity] || '#ffffff') + 'cc';
          ctx.shadowBlur = ts * 0.3 + Math.sin(nowPerf / 350) * ts * 0.08;
          drawCardFrame(ctx, img, it.card.rarity, sx + (ts - cw) / 2, sy + (ts - ch) / 2 + bob, cw, ch);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = RARITY_COLOR[it.card.rarity] || '#888';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx + (ts - cw) / 2, sy + (ts - ch) / 2 + bob, cw, ch);
          ctx.restore();
        } else if (it.kind === 'joker') {
          const cw = ts * 0.62, ch = cw * 1.2;
          ctx.save();
          ctx.shadowColor = 'rgba(167, 139, 250, 0.9)';
          ctx.shadowBlur = ts * 0.45 + Math.sin(nowPerf / 260) * ts * 0.15;
          if (jokerSprite.complete && jokerSprite.naturalWidth) {
            ctx.drawImage(jokerSprite, sx + (ts - cw) / 2, sy + (ts - ch) / 2 + bob, cw, ch);
          }
          ctx.restore();
        }
      }

      // ── Spieler (Royal-Ghost-Sprite) ─────────────────────────────────────
      const playersById = Object.fromEntries(s.players.map(p => [p.id, p]));
      const entries = Object.entries(renderPosRef.current);
      entries.forEach(([pid, rp], idx) => {
        const p = playersById[pid];
        if (!p) return;
        const tp = targets[pid] || rp;
        const { sx, sy } = tileToScreen(rp.x, rp.y);
        if (sx < -ts * 2 || sy < -ts * 2 || sx > W + ts * 2 || sy > H + ts * 2) return;
        const size = ts * 0.86;
        const gx = sx + (ts - size) / 2;
        const gy = sy + (ts - size) / 2 + Math.sin(nowPerf / 380 + idx * 1.9) * ts * 0.045;

        // Farbring am Boden zur Unterscheidung
        ctx.save();
        ctx.fillStyle = (p.color || '#888') + '55';
        ctx.beginPath();
        ctx.ellipse(sx + ts / 2, sy + ts * 0.86, size * 0.34, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pid === myId) {
          ctx.strokeStyle = p.color || '#a78bfa';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sx + ts / 2, sy + ts * 0.86, size * 0.4, size * 0.18, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.95;
        if ((tp.dir || 1) === -1) {
          ctx.translate(gx + size, gy);
          ctx.scale(-1, 1);
          if (ghostSprite.complete && ghostSprite.naturalWidth) ctx.drawImage(ghostSprite, 0, 0, size, size);
        } else if (ghostSprite.complete && ghostSprite.naturalWidth) {
          ctx.drawImage(ghostSprite, gx, gy, size, size);
        }
        ctx.restore();

        // Name über dem Geist
        ctx.save();
        ctx.font = `bold ${Math.max(9, ts * 0.26)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(p.name, sx + ts / 2, gy - ts * 0.1);
        ctx.fillStyle = p.color || '#fff';
        ctx.fillText(p.name, sx + ts / 2, gy - ts * 0.1);
        ctx.restore();
      });

      // ── Fog of War: alles schwarz, nur der eigene Lichtkegel ist offen ───
      // (Zuschauer und Spielende: volle Sicht)
      if (!spec && !s.finished && targets[myId]) {
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fctx.globalCompositeOperation = 'source-over';
        fctx.clearRect(0, 0, W, H);
        // Vollständig blickdicht — außerhalb des Lichtkegels ist wirklich NICHTS zu erkennen
        fctx.fillStyle = 'rgb(3, 4, 10)';
        fctx.fillRect(0, 0, W, H);
        const meRp = renderPosRef.current[myId];
        const { sx, sy } = tileToScreen(meRp.x, meRp.y);
        const cx = sx + ts / 2, cy = sy + ts / 2;
        const r = s.lightRadius * ts * (1 + Math.sin(nowPerf / 900) * 0.02); // leichtes Fackel-Flackern
        const gradF = fctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
        gradF.addColorStop(0, 'rgba(0,0,0,1)');
        gradF.addColorStop(0.7, 'rgba(0,0,0,0.85)');
        gradF.addColorStop(1, 'rgba(0,0,0,0)');
        fctx.globalCompositeOperation = 'destination-out';
        fctx.fillStyle = gradF;
        fctx.beginPath();
        fctx.arc(cx, cy, r, 0, Math.PI * 2);
        fctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(fog, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // warmer Lichtschimmer im Kegel
        ctx.save();
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        glow.addColorStop(0, 'rgba(255, 214, 140, 0.07)');
        glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [predRef]);

  // Klick auf die eigene Kachel hebt ebenfalls auf (Alternative zur Leertaste)
  const handleClick = useCallback(() => {
    if (!propsRef.current.amSpectator && !propsRef.current.frozen) propsRef.current.onPickup();
  }, []);

  // Steuerkreuz: schreibt in dieselbe Liste gehaltener Richtungen wie die Tastatur,
  // die Schleife oben muss davon nichts wissen. setPointerCapture sorgt dafür, dass
  // ein Finger, der von der Taste rutscht, die Richtung trotzdem wieder freigibt.
  const holdDir = useCallback((dir, down) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (down) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (!keysRef.current.includes(dir)) keysRef.current.push(dir);
    } else {
      keysRef.current = keysRef.current.filter(d => d !== dir);
    }
  }, []);

  const padBtn = (dir, label, icon) => (
    <button
      key={dir}
      type="button"
      aria-label={label}
      onPointerDown={holdDir(dir, true)}
      onPointerUp={holdDir(dir, false)}
      onPointerCancel={holdDir(dir, false)}
      onContextMenu={(e) => e.preventDefault()}
      className="w-14 h-14 flex items-center justify-center rounded-lg bg-white/[0.09] border border-white/15 text-white/85 active:bg-violet-600 active:border-violet-400 backdrop-blur-md"
      style={{ touchAction: 'none' }}
    >
      {icon}
    </button>
  );

  return (
    <div ref={containerRef} className="absolute inset-0" style={IS_COARSE_POINTER ? { touchAction: 'none' } : undefined}>
      <canvas ref={canvasRef} onMouseDown={handleClick} />

      {IS_COARSE_POINTER && !amSpectator && (
        <>
          <div className="absolute bottom-4 left-3 grid grid-cols-3 gap-1.5 select-none">
            <span />
            {padBtn('up', 'Nach oben', <ChevronUp size={24} />)}
            <span />
            {padBtn('left', 'Nach links', <ChevronLeft size={24} />)}
            <span />
            {padBtn('right', 'Nach rechts', <ChevronRight size={24} />)}
            <span />
            {padBtn('down', 'Nach unten', <ChevronDown size={24} />)}
            <span />
          </div>
          <button
            type="button"
            aria-label="Aufheben"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!propsRef.current.amSpectator && !propsRef.current.frozen) propsRef.current.onPickup();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute bottom-9 right-4 w-20 h-20 rounded-full bg-violet-600/85 border border-violet-300/40 text-white flex items-center justify-center active:bg-violet-500 backdrop-blur-md"
            style={{ touchAction: 'none' }}
          >
            <Hand size={30} />
          </button>
        </>
      )}
    </div>
  );
}

// Esc schließt ein offenes Popup, ohne eine Karte zu nehmen
function useEscapeClose(onClose) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
}

// ── Draft-Kisten-Popup: 1 aus 2 ─────────────────────────────────────────────
function DraftModal({ draft, myChampCount, onPick, onClose, t }) {
  useEscapeClose(onClose);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl border border-amber-400/25 bg-[#141019]/90 backdrop-blur-md p-6 shadow-2xl shadow-black/60 w-[min(92%,26rem)]">
        <div className="flex items-center gap-3 mb-1">
          <img src={chestImgSrc} alt="" className="w-10 h-10 object-contain" draggable={false} />
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 font-bold text-sm uppercase tracking-widest">{t.draftTitle}</p>
            <p className="text-white/50 text-xs">{t.draftSub}</p>
          </div>
          <button onClick={onClose} title={t.closeTitle}
            className="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <CrClose size={23} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          {(draft.options || []).map((card, i) => {
            const blocked = card.isChampion && myChampCount >= 2;
            return (
              <button key={card.id} onClick={() => !blocked && onPick(i)} disabled={blocked}
                title={blocked ? t.championLimit : card.name}
                className={`group rounded-lg border-2 overflow-hidden transition-colors text-left ${
                  blocked ? 'border-white/10 opacity-40 cursor-not-allowed' : 'border-white/15 hover:border-amber-400'}`}>
                <div className="aspect-[4/5]">
                  <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                </div>
                <div className="px-2 py-1.5 bg-black/40 flex items-center gap-1.5">
                  {card.isChampion && <img src={crownIcon} alt="" width={14} height={12} className="shrink-0" />}
                  <span className="text-white text-xs font-semibold truncate">{card.name}</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-white/30 text-[11px] mt-3 text-center">{t.frozenNote}</p>
      </div>
    </div>
  );
}

// ── Joker-Popup: beliebige freie Karte wählen ───────────────────────────────
function JokerModal({ availableIds, myChampCount, onPick, onClose, t }) {
  const [query, setQuery] = useState('');
  useEscapeClose(onClose);
  const q = query.trim().toLowerCase();
  const cards = availableIds
    .map(id => CARD_BY_ID[id])
    .filter(Boolean)
    .filter(c => !q || c.name.toLowerCase().includes(q));
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-xl border border-violet-400/25 bg-[#131019]/90 backdrop-blur-md p-5 shadow-2xl shadow-black/60 w-full max-w-2xl max-h-[85%] flex flex-col">
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <span className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-400/30 flex items-center justify-center shrink-0">
            <CrStar size={26} className="text-violet-300" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-violet-300 font-bold text-sm uppercase tracking-widest">{t.jokerTitle}</p>
            <p className="text-white/50 text-xs">{t.jokerSub}</p>
          </div>
          <button onClick={onClose} title={t.closeTitle}
            className="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <CrClose size={23} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2 mb-3 shrink-0 focus-within:border-violet-500 transition-colors">
          <CrSearch size={19} className="text-white/30 shrink-0" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchCard}
            className="bg-transparent text-white text-sm placeholder-gray-600 outline-none w-full" />
        </div>
        <div className="overflow-y-auto custom-scrollbar">
          {cards.length === 0 && <p className="text-white/30 text-sm text-center py-6">{t.noCardFound}</p>}
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-8 gap-1.5">
            {cards.map(card => {
              const blocked = card.isChampion && myChampCount >= 2;
              return (
                <button key={card.id} onClick={() => !blocked && onPick(card.id)} disabled={blocked}
                  title={blocked ? t.championLimit : card.name}
                  className={`relative rounded-md overflow-hidden border aspect-[4/5] transition-colors ${
                    blocked ? 'border-white/5 opacity-30 cursor-not-allowed'
                    : 'border-white/10 hover:border-violet-400'}`}>
                  <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                  {card.isChampion && (
                    <span className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5">
                      <img src={crownIcon} alt="" width={11} height={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-white/30 text-[11px] mt-3 text-center shrink-0">{t.frozenNote}</p>
      </div>
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function DarkMaze({ mazeState, myPlayerId, onMove, onPickup, onDraftPick, onJokerPick, onCloseDraft, lang = 'de' }) {
  const t = MAZE_I18N[lang] || MAZE_I18N.de;
  const now = useNow(200);
  const state = mazeState;
  // Auf schmalen Bildschirmen ist die Spielerliste eine Schublade — sonst bliebe vom
  // Labyrinth kaum etwas übrig
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  // Für die Joker-Auswahl: freie Karten = Pool minus Decks, Bodenkarten und offene Draft-Optionen
  const availableJokerIds = useMemo(() => {
    if (!state) return [];
    const used = new Set();
    state.players.forEach(p => (p.deck || []).forEach(c => used.add(c.id)));
    state.items.forEach(it => { if (it.card) used.add(it.card.id); });
    Object.values(state.drafts || {}).forEach(d => (d.options || []).forEach(c => used.add(c.id)));
    return (state.poolIds || []).filter(id => !used.has(id));
  }, [state]);

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
  const myChampCount = myDeck.filter(c => c.isChampion).length;
  const myDraft = state.drafts?.[myPlayerId] || null;
  const frozen = !!myDraft;
  // Zuschauer sehen das ganze Labyrinth von oben — Ego-Perspektive nur für Mitspieler
  // Spieler sehen nur noch die 3D-Ansicht. Die Draufsicht bleibt für Zuschauer (sie folgen
  // keinem Spieler) und als Ersatz, wenn das Gerät kein WebGL kann.
  const show3d = !amSpectator && !webglFailed;

  const countdownUntilClient = state.countdownUntil ? state.countdownUntil + clientOffset : null;
  const inCountdown = !!(countdownUntilClient && countdownUntilClient > now);
  const countdownRemaining = inCountdown ? Math.max(1, Math.ceil((countdownUntilClient - now) / 1000)) : 0;

  // timeLimitInSeconds-Anzeige: Restzeit aus endsAt (Server-Uhr) ableiten
  const remainingMs = Math.max(0, (state.endsAt + clientOffset) - now);
  const remainingS = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(remainingS / 60), ss = remainingS % 60;
  const timeUrgent = !state.finished && !inCountdown && remainingS <= 15;

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const doneCount = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;

  // Steht die eigene Figur auf einem Item? → Hinweis, was die Leertaste hier tut
  const myPos = state.positions?.[myPlayerId];
  const itemHere = !amSpectator && myPos
    ? state.items.find(it => it.x === myPos.x && it.y === myPos.y)
    : null;
  const itemHint = itemHere && (
    itemHere.kind === 'chest' ? { text: t.chestHint, icon: <img src={chestImgSrc} alt="" className="w-4 h-4 object-contain shrink-0" /> }
    : itemHere.kind === 'joker' ? { text: t.jokerHint, icon: <CrStar size={19} className="text-violet-300 shrink-0" /> }
    : { text: t.pickupHint, icon: <CrChest size={19} className="text-amber-300 shrink-0" />, note: itemHere.card?.name }
  );

  return (
    <div className="h-full flex overflow-hidden select-none relative bg-gradient-to-b from-[#171a26] to-[#0e1018]">
      {/* Ab md fest neben dem Labyrinth, darunter als Schublade darüber */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex absolute md:relative inset-y-0 left-0 z-40 md:z-auto shadow-2xl shadow-black/70 md:shadow-none`}>
        <MazeSidebar state={state} myPlayerId={myPlayerId} t={t} />
      </div>
      {sidebarOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Kopfzeile: der eigene Deckfortschritt ist das Ziel des Modus.
            Der Knopf für die Spielerleiste bleibt auf dem Handy davor stehen. */}
        <div className="cr-game-header shrink-0 px-4 sm:px-8 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4 flex-wrap">
          <button type="button" onClick={() => setSidebarOpen(o => !o)}
            aria-label={t.players}
            className="md:hidden shrink-0 flex items-center gap-1.5 text-white/60 hover:text-white px-2 py-1 -ml-1 rounded-lg hover:bg-white/5 transition-colors self-center">
            <CrSocial size={22} />
            <span className="text-xs font-semibold tabular-nums">{doneCount}/{activePlayers.length}</span>
          </button>

          <h2 className="cr-arcade-title text-2xl sm:text-[30px] leading-none whitespace-nowrap">
            {t.cardsLabel} {amSpectator ? '–' : myDeck.length}
            {!amSpectator && <span className="text-white/45"> / {state.deckSize}</span>}
          </h2>

          {state.finished ? (
            <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
              <CrCheck size={21} /> {remainingMs <= 0 ? t.timeUp : t.allDecksFull}
            </span>
          ) : amSpectator ? (
            <span className="flex items-center gap-1.5 text-white/35 text-sm">
              <CrTv size={19} /> {t.spectatorLive}
            </span>
          ) : myDeckFull ? (
            <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
              <CrCheck size={21} /> {t.yourDeckFull}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-violet-300 text-sm font-semibold">
              <CrTelescope size={21} /> {show3d
                ? (IS_COARSE_POINTER ? t.moveHint3dTouch : t.moveHint3d)
                : (IS_COARSE_POINTER ? t.moveHintTouch : t.moveHint)}
            </span>
          )}

          <div className="flex-1" />
          <span className="text-white/35 text-sm hidden sm:block">
            {t.decksDone(doneCount, activePlayers.length)}
          </span>
        </div>
        <ProgressHairline
          pct={amSpectator ? 0 : (myDeck.length / state.deckSize) * 100}
          accent={ACCENT} />

        {/* Labyrinth */}
        <div className="flex-1 relative overflow-hidden bg-[#0a0a0d]">
          {show3d ? (
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">{t.loading}</div>}>
              <Maze3D
                state={state}
                myPlayerId={myPlayerId}
                onMove={onMove}
                onPickup={onPickup}
                frozen={frozen || inCountdown || state.finished}
                onUnsupported={() => setWebglFailed(true)}
              />
            </Suspense>
          ) : (
            <MazeCanvas
              state={state}
              myPlayerId={myPlayerId}
              amSpectator={amSpectator}
              onMove={onMove}
              onPickup={onPickup}
              frozen={frozen || inCountdown || state.finished}
            />
          )}

          {/* Timer-Chip (Glas) */}
          <div className={`absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-lg border backdrop-blur-md ${
            timeUrgent ? 'bg-red-950/40 border-red-500/40' : 'bg-white/[0.06] border-white/10'}`}>
            <CrClock size={19} className={timeUrgent ? 'text-red-400 animate-pulse' : 'text-white/50'} />
            <span className={`font-black tabular-nums text-base ${timeUrgent ? 'text-red-300' : 'text-white'}`}>
              {mm}:{String(ss).padStart(2, '0')}
            </span>
          </div>

          {/* Hinweis, wenn man auf einem Item steht — Kiste, Joker und Karte brauchen alle die Leertaste */}
          {itemHint && !frozen && !inCountdown && !state.finished && !myDeckFull && (
            <div className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.08] border border-white/15 backdrop-blur-md pointer-events-none ${IS_COARSE_POINTER ? 'bottom-44' : 'bottom-16'}`}>
              {itemHint.icon}
              <span className="text-white text-xs font-bold">{itemHint.text}</span>
              {itemHint.note && <span className="text-white/50 text-xs">· {itemHint.note}</span>}
            </div>
          )}

          {/* Mein Fortschritt (Glas-Chip). Auf Touch-Geräten sitzt unten links das
              Steuerkreuz — dort wandert der Chip nach oben. */}
          {!amSpectator && (
            <div className={`absolute left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur-md ${IS_COARSE_POINTER ? 'top-3' : 'bottom-3'}`}>
              {/* Die Punktreihe braucht Platz — neben dem Timer-Chip in der Mitte ist der
                  auf schmalen Bildschirmen nicht da, dort bleibt nur die Zahl */}
              <div className="hidden sm:flex gap-1">
                {Array.from({ length: state.deckSize }, (_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i < myDeck.length ? 'bg-violet-400' : 'bg-white/15'}`} />
                ))}
              </div>
              <span className="text-white/60 text-[11px] font-bold tabular-nums">{myDeck.length}/{state.deckSize}</span>
            </div>
          )}

          {/* Kisten-Draft / Joker */}
          {myDraft?.kind === 'chest' && (
            <DraftModal draft={myDraft} myChampCount={myChampCount} onPick={onDraftPick} onClose={onCloseDraft} t={t} />
          )}
          {myDraft?.kind === 'joker' && (
            <JokerModal availableIds={availableJokerIds} myChampCount={myChampCount} onPick={onJokerPick} onClose={onCloseDraft} t={t} />
          )}

          {/* Start-Countdown */}
          {inCountdown && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0a0a0d]">
              <div className="text-center">
                <p className="text-violet-300 text-sm font-bold uppercase tracking-widest mb-3">{t.getReady}</p>
                <p className="text-white font-black text-7xl tabular-nums leading-none">{countdownRemaining}</p>
                <p className="text-gray-400 text-xs mt-3">{t.mazeOpens}</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
