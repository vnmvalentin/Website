// Die Szenen des Overlays: Hype Train, Raid-Ansturm, Flugzeug mit Banner und
// Murmelbahn. Wie die Karten in OverlayWidgets.jsx geteilt zwischen der
// Dashboard-Vorschau und der OBS-Route.
//
// Anders als die Karten laufen die ersten drei quer über das ganze Bild und
// bewegen sich von selbst. Deshalb bekommt jede Szene die Abweichung zur
// Serveruhr als Ref (offsetRef) und rechnet ihre Zeit selbst — das Overlay muss
// für sie nicht im Takt neu rendern.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRace, stepRace, ranking, WORLD_W, MARBLE_R, STEPS_PER_SECOND } from './marbleSim';
import { planeMessages } from './streamToolConfig';
import './overlayScenes.css';

const STAGE_W = 1920;
const FONT = 'Inter, Roboto, system-ui, sans-serif';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const fmt = (n) => Math.round(n || 0).toLocaleString('de-DE');

/** Sekunden -> "m:ss" */
function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Bilder für die Canvas-Szenen. Einmal geladen, bleiben sie für die Sitzung. */
const imageCache = new Map();
function loadImage(url) {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}
const imageReady = (img) => !!img && img.complete && img.naturalWidth > 0;

/** Kleiner Zufallsgenerator mit Startwert — die Menge soll in jeder Quelle gleich aussehen. */
function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Profilbild oder, wenn es keins gibt, der Anfangsbuchstabe auf Farbe. */
function Face({ person, color, className = '' }) {
  if (person.avatar) return <img className={`sts-face ${className}`} src={person.avatar} alt="" />;
  return (
    <span className={`sts-face is-blank ${className}`} style={{ background: color }}>
      {(person.name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ── Hype Train ─────────────────────────────────────────────────────────── */

const LOCO_W = 330;
const WAGON_W = 250;
const SEATS_PER_WAGON = 8;
/** Abstand des Zugs zum Bildrand, wenn er steht. */
const TRAIN_MARGIN = 60;
const DARK = '#14141a';
const STEEL = '#cfd0d8';

/** Rad mit Speichen. Die Drehung kommt per CSS, solange der Zug rollt. */
function Wheel({ cx, cy, r }) {
  return (
    <g className="sts-wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r - 2.5} fill={DARK} stroke={STEEL} strokeWidth="5" />
      <path d={`M${cx - r + 5} ${cy} H${cx + r - 5} M${cx} ${cy - r + 5} V${cy + r - 5}`} stroke={STEEL} strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r * 0.24} fill={STEEL} />
    </g>
  );
}

/** Doppelstockwagen: acht Fenster, in jedem sitzt ein Teilnehmer. */
function Wagon({ number, people, more, showNames, color }) {
  const windows = [];
  for (let i = 0; i < SEATS_PER_WAGON; i++) windows.push(people[i] || null);
  if (more > 0) windows[SEATS_PER_WAGON - 1] = { more };

  return (
    <div className="sts-wagon">
      <svg className="sts-art" viewBox="0 0 250 200" width="250" height="200" aria-hidden="true">
        {/* Kupplung zum Wagen davor */}
        <rect x="240" y="148" width="20" height="7" rx="3" fill={DARK} />
        <rect x="14" y="22" width="222" height="22" rx="11" fill={DARK} />
        <rect x="8" y="34" width="234" height="122" rx="9" fill="var(--sts-w)" />
        {/* Zierstreifen zwischen den Decks und Bauchbinde */}
        <rect x="8" y="92" width="234" height="3" fill="rgba(255,255,255,0.08)" />
        <rect x="8" y="140" width="234" height="9" fill="var(--sts-a)" />
        <rect x="2" y="154" width="246" height="11" rx="3" fill={DARK} />
        <rect x="22" y="164" width="78" height="12" rx="5" fill={DARK} />
        <rect x="150" y="164" width="78" height="12" rx="5" fill={DARK} />
        <Wheel cx={42} cy={181} r={15} />
        <Wheel cx={80} cy={181} r={15} />
        <Wheel cx={170} cy={181} r={15} />
        <Wheel cx={208} cy={181} r={15} />
      </svg>

      <span className="sts-wagon-no">{number}</span>
      <div className={`sts-windows${showNames ? ' has-names' : ''}`}>
        {windows.map((p, i) => (
          <span key={p?.id || `leer-${i}`} className={`sts-window${p ? ' is-taken' : ''}`}>
            {p?.more && <b>+{p.more}</b>}
            {p && !p.more && (p.avatar
              ? <img src={p.avatar} alt="" />
              : <b style={{ background: color }}>{(p.name || '?').slice(0, 1).toUpperCase()}</b>)}
            {showNames && p && !p.more && <i>{p.name}</i>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Loco() {
  return (
    <svg className="sts-art" viewBox="0 0 330 200" width="330" height="200" aria-hidden="true">
      {/* Kupplung nach hinten gibt es nicht — die bringt der erste Wagen mit */}
      {/* Schornstein */}
      <path d="M236 76 L241 38 L263 38 L268 76 Z" fill={DARK} />
      <rect x="233" y="29" width="38" height="11" rx="5" fill={DARK} />
      {/* Führerhaus mit Dach */}
      <rect x="14" y="42" width="98" height="114" rx="8" fill="var(--sts-a)" />
      <rect x="4" y="30" width="118" height="16" rx="8" fill={DARK} />
      {/* Kessel mit Bändern, Dom und Rauchkammer */}
      <rect x="104" y="74" width="180" height="82" rx="16" fill="var(--sts-a)" />
      <rect x="104" y="74" width="20" height="82" fill="var(--sts-a)" />
      <rect x="146" y="74" width="7" height="82" fill="rgba(0,0,0,0.22)" />
      <path d="M170 76 A20 20 0 0 1 210 76 Z" fill={DARK} />
      <rect x="266" y="70" width="24" height="90" rx="9" fill={DARK} />
      <circle cx="292" cy="94" r="10" fill="#f3efe4" />
      {/* Umlauf, Zylinder und Schienenräumer */}
      <rect x="6" y="154" width="296" height="11" rx="3" fill={DARK} />
      <rect x="236" y="160" width="46" height="22" rx="6" fill={DARK} />
      <path d="M298 152 L328 190 L298 190 Z" fill={DARK} />
      <Wheel cx={56} cy={174} r={22} />
      <Wheel cx={124} cy={174} r={22} />
      <Wheel cx={192} cy={174} r={22} />
      <Wheel cx={262} cy={184} r={12} />
      {/* Kuppelstange: läuft mit den Treibrädern um */}
      <g className="sts-rod-x">
        <g className="sts-rod-y">
          <rect x="48" y="170" width="152" height="8" rx="4" fill={STEEL} />
          <circle cx="56" cy="174" r="5" fill={DARK} />
          <circle cx="124" cy="174" r="5" fill={DARK} />
          <circle cx="192" cy="174" r="5" fill={DARK} />
        </g>
      </g>
    </svg>
  );
}

/**
 * Ein Zug. Der Zustand gehört zu genau EINEM Hype Train — die Hülle unten hängt
 * ihn per key an dessen id, ein neuer Train fängt also frisch an.
 *
 * Bei jedem Levelaufstieg fährt der Zug nach vorn aus dem Bild und kommt mit
 * einem Wagen mehr von hinten wieder herein. Angezeigt wird deshalb nicht
 * sofort data.level, sondern das Level, mit dem er zuletzt eingefahren ist.
 */
function Train({ data, module, offsetRef, still }) {
  const ended = !!data.endedAt;
  const liveLevel = clamp(Math.round(data.level) || 1, 1, 60);
  const [level, setLevel] = useState(liveLevel);
  // pre = steht außerhalb bereit, in = fährt ein bzw. steht, out = fährt ab
  const [phase, setPhase] = useState(still ? 'in' : 'pre');
  const [parked, setParked] = useState(still);
  const [arrivals, setArrivals] = useState(0);
  const [, tick] = useState(0);

  // Aus der Bereitstellung losfahren — zwei Bilder später, damit der Browser
  // die Startstellung wirklich gezeichnet hat
  useEffect(() => {
    if (phase !== 'pre' || still) return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setPhase('in')); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [phase, still, arrivals]);

  // Level gestiegen oder Train vorbei: abfahren
  useEffect(() => {
    if (still) { setLevel(liveLevel); return; }
    if (phase === 'in' && (ended || liveLevel !== level)) { setParked(false); setPhase('out'); }
  }, [liveLevel, level, ended, phase, still]);

  const onMoved = (e) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (phase === 'in') { setParked(true); return; }
    if (phase !== 'out' || ended) return;
    // Draußen angekommen: Wagen anhängen und wieder hereinkommen
    setLevel(liveLevel);
    setArrivals((n) => n + 1);
    setPhase('pre');
  };

  // Restzeit im Führerhaus — eigener Sekundentakt, nur solange ein Zug fährt
  const showTimer = module.timer !== false && !ended && !still;
  useEffect(() => {
    if (!showTimer) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [showTimer]);

  const people = data.people || [];
  const seats = level * SEATS_PER_WAGON;
  // Passen nicht alle hinein, macht das letzte Fenster ein "+N" daraus
  const overflow = Math.max(0, people.length - seats + 1);
  const seated = overflow > 1 ? people.slice(0, seats - 1) : people.slice(0, seats);
  const more = overflow > 1 ? overflow : 0;

  const wagons = [];
  for (let n = level; n >= 1; n--) {
    wagons.push({
      n,
      people: seated.slice((n - 1) * SEATS_PER_WAGON, n * SEATS_PER_WAGON),
      more: n === level ? more : 0,
    });
  }

  // Ab etwa Level 6 wäre der Zug länger als das Bild — dann schrumpft er passend
  const length = LOCO_W + level * WAGON_W;
  const size = clamp(Number(module.scale) || 1, 0.3, 2);
  const zoom = size * Math.min(1, (STAGE_W - TRAIN_MARGIN * 2) / (length * size));

  const pct = clamp((data.progress / Math.max(1, data.goal)) * 100, 0, 100);
  const remaining = data.expiresAt ? (data.expiresAt - (Date.now() + (offsetRef?.current || 0))) / 1000 : 0;
  const from = module.from === 'right' ? 'right' : 'left';
  const gone = ended && phase === 'out';

  return (
    <div className={`sts-train-scene from-${from}${gone ? ' is-over' : ''}`} style={{ top: Math.round(module.y) }}>
      {/* Gleis: liegt, solange der Zug unterwegs ist — auch während er für den
          nächsten Wagen kurz draußen ist */}
      <div className="sts-rail" style={{ top: Math.round(196 * zoom), height: Math.max(3, Math.round(5 * zoom)) }} />

      <div
        className={`sts-train-lane is-${phase}${parked ? ' is-parked' : ''}${still ? ' is-still' : ''}`}
        onTransitionEnd={onMoved}
      >
        <div className="sts-train" style={{ zoom, '--sts-a': module.colors[0], '--sts-w': module.colors[1] || '#23232d' }}>
          {wagons.map((w) => (
            <Wagon key={w.n} number={w.n} people={w.people} more={w.more}
              showNames={!!module.showNames} color={module.colors[0]} />
          ))}

          <div className="sts-loco">
            <span className="sts-puff" />
            <span className="sts-puff" />
            <span className="sts-puff" />
            <span className="sts-puff" />
            <Loco />
            {/* Schrift liegt außerhalb der Zeichnung: die wird für die Fahrt nach
                links gespiegelt, Text darf das nicht mitmachen */}
            <div className="sts-cab-text">{showTimer && remaining > 0 ? mmss(remaining) : 'Hype'}</div>
            <div className="sts-boiler-info">
              <div className="sts-boiler-top">
                <b>Level {level}</b>
                {module.showProgress !== false && <span>{Math.round(pct)} %</span>}
              </div>
              {module.showProgress !== false && (
                <div className="sts-prog"><i style={{ width: `${pct.toFixed(1)}%` }} /></div>
              )}
            </div>
            {/* Nach einem Aufstieg fährt die Lok mit einem Schild ein */}
            {arrivals > 0 && !still && <div key={arrivals} className="sts-levelup">Level {level}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object}  data    Zugdaten vom Server (oder Demo)
 * @param {boolean} still   Dashboard-Vorschau zum Ausrichten: steht sofort, fährt nie
 */
export function HypeTrainScene({ data, module, offsetRef, still = false }) {
  if (!data) return null;
  return <Train key={`${data.id}-${still ? 's' : 'l'}`} data={data} module={module} offsetRef={offsetRef} still={still} />;
}

/* ── Raid-Ansturm ───────────────────────────────────────────────────────── */

/** Höhe der Spur bei Größe 100 %. */
export const STORM_LANE_H = 320;
const STORM_CROSS_MS = 6200;
const STORM_HARD_MAX = 140;
const SKIN = ['#f1c7a3', '#e0ac82', '#c68958', '#9c6a43', '#6f4a31'];
const HAIR = ['#2b2118', '#5a3a22', '#c9a26b', '#15151a', '#8a4b2a', '#d9d9de'];
// Mittlere Töne: dunkle Hosen verschwinden vor einem dunklen Spielbild
const PANTS = ['#4d5878', '#6d5c4b', '#3f6a78', '#63636e'];
/** Vorlage nach vorn, in Bogenmaß — die Menge rennt, sie spaziert nicht. */
const LEAN = 0.15;
const LEAN_COS = Math.cos(LEAN);
const LEAN_SIN = Math.sin(LEAN);

function buildCrowd(data, module, laneH, size) {
  const rng = seededRandom(String(data.id));
  const count = clamp(Math.min(data.viewers, Number(module.maxFigures) || 100, STORM_HARD_MAX), 1, STORM_HARD_MAX);
  const colors = module.colors?.length ? module.colors : ['#9146ff'];
  // Der Letzte muss vor dem Ende durch sein
  const spread = Math.max(0, data.durationMs - STORM_CROSS_MS * 1.25);
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const figures = [];
  for (let i = 0; i < count; i++) {
    const lead = i === 0;
    const depth = lead ? 0.62 : rng();
    const speed = lead ? 0.9 : 0.85 + rng() * 0.35;
    figures.push({
      i,
      lead,
      depth,
      start: lead ? 0 : 250 + rng() * spread,
      cross: STORM_CROSS_MS / speed,
      pace: 8.5 + speed * 3,
      offset: rng() * 6.28,
      size: (lead ? 1.3 : 0.86 + depth * 0.36) * size,
      feet: laneH * (0.5 + depth * 0.46),
      shirt: lead ? module.accent : colors[i % colors.length],
      skin: pick(SKIN),
      hair: pick(HAIR),
      pants: pick(PANTS),
      // Frisur: 0 kurz, 1 Schopf, 2 lang
      cut: Math.floor(rng() * 3),
    });
  }
  // Von hinten nach vorn zeichnen
  return figures.sort((a, b) => a.depth - b.depth);
}

/** Zweigliedriges Bein oder Arm: von (x,y) mit zwei Winkeln (0 = senkrecht nach unten). */
function limb(ctx, x, y, a1, a2, l1, l2) {
  const kx = x + Math.sin(a1) * l1;
  const ky = y + Math.cos(a1) * l1;
  const ex = kx + Math.sin(a2) * l2;
  const ey = ky + Math.cos(a2) * l2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(kx, ky);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  return [ex, ey];
}

/**
 * Eine rennende Figur. Gezeichnet wird sie nach rechts laufend und für die
 * Gegenrichtung gespiegelt — bis auf Profilbild, Name und Fahne, die danach
 * ungespiegelt obendrauf kommen.
 *
 * @param {object} person  { name, avatar:Image|null } oder null (namenlos)
 */
function drawFigure(ctx, f, x, t, dir, person, flag) {
  const s = f.size;
  const phase = (t / 1000) * f.pace + f.offset;
  const run = Math.sin(phase);
  const lift = Math.abs(Math.cos(phase)) * 6 * s;
  const ground = f.feet;
  const base = ground - lift;

  const hip = -36 * s;
  const shoulder = -64 * s;
  const headY = -86 * s;
  const headR = (f.lead ? 21 : 17) * s;
  const face = person?.avatar && imageReady(person.avatar) ? person.avatar : null;

  // Schatten bleibt am Boden und wird kleiner, wenn die Figur abhebt
  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
  ctx.beginPath();
  ctx.ellipse(x, ground + 3 * s, (20 - lift / s) * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, base);
  ctx.scale(dir, 1);
  ctx.rotate(LEAN);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Hinterer Arm
  ctx.strokeStyle = f.skin;
  ctx.lineWidth = 6.5 * s;
  limb(ctx, -2 * s, shoulder + 4 * s, -run * 1.0, -run * 1.0 + 1.3, 15 * s, 14 * s);

  // Beine: Oberschenkel schwingt, Unterschenkel knickt beim Zurückholen ein
  const leg = (swing) => {
    ctx.strokeStyle = f.pants;
    ctx.lineWidth = 9 * s;
    const bend = Math.max(0, -swing) * 1.2 + 0.25;
    const [fx, fy] = limb(ctx, 0, hip, swing * 0.85, swing * 0.85 - bend, 18 * s, 19 * s);
    // Schuh
    ctx.fillStyle = '#f2f2f5';
    ctx.beginPath();
    ctx.ellipse(fx + 4 * s, fy, 8 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  leg(-run);
  leg(run);

  // Rumpf
  ctx.fillStyle = f.shirt;
  ctx.beginPath();
  ctx.roundRect(-13 * s, shoulder - 3 * s, 26 * s, hip - shoulder + 9 * s, 11 * s);
  ctx.fill();

  // Kopf — ohne Profilbild mit Frisur und Auge
  if (!face) {
    ctx.fillStyle = f.skin;
    ctx.beginPath();
    ctx.arc(3 * s, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.hair;
    ctx.beginPath();
    if (f.cut === 2) {
      // lang: fällt hinten herunter
      ctx.arc(3 * s, headY, headR, Math.PI * 0.55, Math.PI * 1.85);
      ctx.lineTo(-headR * 0.2, headY + headR * 0.2);
    } else {
      ctx.arc(3 * s, headY, headR, Math.PI * (f.cut ? 0.95 : 1.05), Math.PI * (f.cut ? 1.95 : 1.8));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#17171c';
    ctx.beginPath();
    ctx.arc(3 * s + headR * 0.5, headY + headR * 0.05, headR * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vorderer Arm — der Anführer reckt ihn mit der Fahne hoch
  ctx.strokeStyle = f.skin;
  ctx.lineWidth = 6.5 * s;
  if (flag) limb(ctx, 2 * s, shoulder + 4 * s, 2.4, 2.9, 15 * s, 15 * s);
  else limb(ctx, 2 * s, shoulder + 4 * s, run * 1.0, run * 1.0 + 1.3, 15 * s, 14 * s);
  // Ärmel
  ctx.strokeStyle = f.shirt;
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.moveTo(2 * s, shoulder + 4 * s);
  ctx.lineTo(2 * s + Math.sin(flag ? 2.4 : run) * 7 * s, shoulder + 4 * s + Math.cos(flag ? 2.4 : run) * 7 * s);
  ctx.stroke();
  ctx.restore();

  // Kopfmitte in Bildkoordinaten (Vorlage und Laufrichtung eingerechnet)
  const hx = x + dir * (3 * s * LEAN_COS - headY * LEAN_SIN);
  const hy = base + 3 * s * LEAN_SIN + headY * LEAN_COS;

  if (face) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(face, hx - headR, hy - headR, headR * 2, headR * 2);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (flag) {
    // Fahne des Anführers: weht entgegen der Laufrichtung
    const handX = x + dir * 22 * s;
    const handY = base - 84 * s;
    const top = handY - 82 * s;
    ctx.strokeStyle = '#d7d7de';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(handX, handY + 10 * s); ctx.lineTo(handX, top);
    ctx.stroke();

    ctx.font = `800 ${Math.round(24 * s)}px ${FONT}`;
    const w1 = ctx.measureText(flag.title).width;
    ctx.font = `700 ${Math.round(16 * s)}px ${FONT}`;
    const w2 = ctx.measureText(flag.sub).width;
    const w = Math.max(w1, w2) + 34 * s;
    const h = 66 * s;
    const left = dir > 0 ? handX - w : handX;
    // Flatternde Kante am freien Ende
    const wave = Math.sin(phase * 0.6) * 5 * s;
    const free = dir > 0 ? left : left + w;
    const notch = dir > 0 ? 12 * s : -12 * s;
    ctx.fillStyle = flag.color;
    ctx.beginPath();
    ctx.moveTo(handX, top);
    ctx.lineTo(free, top + wave);
    ctx.lineTo(free + notch, top + h / 2 + wave * 0.5);
    ctx.lineTo(free, top + h + wave);
    ctx.lineTo(handX, top + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const tx = left + (dir > 0 ? 22 : 12) * s;
    ctx.font = `800 ${Math.round(24 * s)}px ${FONT}`;
    ctx.fillText(flag.title, tx, top + 29 * s);
    ctx.font = `700 ${Math.round(16 * s)}px ${FONT}`;
    ctx.fillText(flag.sub, tx, top + 52 * s);
  } else if (person?.name) {
    ctx.font = `700 ${Math.round(14 * s)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = 'rgba(12, 12, 16, 0.85)';
    ctx.strokeText(person.name, hx, hy - headR - 7 * s);
    ctx.fillStyle = '#fff';
    ctx.fillText(person.name, hx, hy - headR - 7 * s);
  }
}

export function RaidStormScene({ data, module, offsetRef }) {
  const canvasRef = useRef(null);
  // Die erkannten Raider kommen nach (Twitch zieht die Zuschauerliste verzögert
  // nach) — die Zeichenschleife liest sie deshalb bei jedem Bild frisch
  const liveRef = useRef({ data, module });
  liveRef.current = { data, module };

  const id = data?.id;
  const size = clamp(Number(module.scale) || 1, 0.4, 2);
  const laneH = Math.round(STORM_LANE_H * size);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!id || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const { data: ev, module: mod } = liveRef.current;
    const figures = buildCrowd(ev, mod, laneH, size);
    const leader = { name: ev.raider.name, avatar: loadImage(ev.raider.avatar) };
    const dir = mod.direction === 'left' ? -1 : 1;
    const flag = { title: ev.raider.name || 'Raid', sub: `${fmt(ev.viewers)} Zuschauer`, color: mod.accent };
    const span = STAGE_W + 300;

    let raf = 0;
    const frame = () => {
      const t = Date.now() + (offsetRef?.current || 0) - ev.startsAt;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (t > ev.durationMs + 1500) return; // durch — Schleife endet
      if (t >= 0) {
        const now = liveRef.current;
        const people = now.data?.people || [];
        const named = now.module.showNames !== false;
        for (const f of figures) {
          const p = (t - f.start) / f.cross;
          if (p < 0 || p > 1) continue;
          const along = -150 + p * span;
          const x = dir > 0 ? along : STAGE_W - along;
          if (f.lead) { drawFigure(ctx, f, x, t, dir, leader, flag); continue; }
          const who = people[f.i - 1];
          drawFigure(ctx, f, x, t, dir, who ? { name: named ? who.name : '', avatar: loadImage(who.avatar) } : null, null);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [id, laneH, size, offsetRef]);

  if (!data) return null;
  return (
    <canvas ref={canvasRef} className="sts-storm" width={STAGE_W} height={laneH}
      style={{ top: Math.round(module.y), height: laneH }} />
  );
}

/* ── Flugzeug mit Banner ────────────────────────────────────────────────── */

/** Ein Probeflug, der älter ist, gilt als erledigt (Overlay wurde danach erst geladen). */
const PLANE_TEST_FRESH_MS = 20000;

function PlaneArt({ color }) {
  return (
    <svg className="sts-plane-art" viewBox="0 0 170 84" width="170" height="84" aria-hidden="true">
      {/* Leitwerk */}
      <path d="M8 16 L34 16 L52 40 L14 40 Z" fill={color} />
      {/* Rumpf */}
      <path d="M10 38 L112 30 Q150 30 156 46 Q150 60 112 60 L30 56 Q12 52 10 38 Z" fill={color} />
      {/* Kabine */}
      <path d="M92 31 Q104 16 124 22 L132 32 Z" fill="#17171c" />
      {/* Tragfläche */}
      <path d="M58 46 L104 46 L84 74 L62 74 Z" fill="#17171c" opacity="0.85" />
      {/* Propeller */}
      <rect className="sts-prop" x="157" y="14" width="5" height="62" rx="2.5" fill="#d7d7de" />
      <circle cx="158" cy="45" r="6" fill="#17171c" />
      {/* Fahrwerk */}
      <path d="M96 60 L92 74" stroke="#17171c" strokeWidth="4" strokeLinecap="round" />
      <circle cx="92" cy="76" r="6" fill="#17171c" />
    </svg>
  );
}

/**
 * @param {object}  test   zuletzt ausgelöster Probeflug { id, flyAt } oder null
 * @param {boolean} still  Dashboard: steht mittig im Bild, zum Ausrichten der Höhe
 */
export function PlaneBannerScene({ module, test, offsetRef, still = false }) {
  const messages = useMemo(() => planeMessages(module), [module.messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const [flight, setFlight] = useState(null);
  const groupRef = useRef(null);
  const busy = useRef(false);
  const memo = useRef({ slot: null, testId: null, turn: 0 });
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const launch = (text) => {
    if (busy.current || !text) return;
    busy.current = true;
    setFlight({ key: Date.now(), text });
  };

  // Fester Takt nach der Serveruhr: jede Quelle startet im selben Moment, und
  // ein Neuladen der Quelle löst keinen zusätzlichen Flug aus.
  const interval = clamp(Number(module.intervalMin) || 10, 1, 240) * 60000;
  useEffect(() => {
    if (!module.enabled || still) return undefined;
    memo.current.slot = null;
    const check = () => {
      const slot = Math.floor((Date.now() + (offsetRef?.current || 0)) / interval);
      if (memo.current.slot === null) { memo.current.slot = slot; return; }
      if (slot === memo.current.slot) return;
      memo.current.slot = slot;
      const list = messagesRef.current;
      if (list.length) launch(list[slot % list.length]);
    };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, [module.enabled, interval, still, offsetRef]);

  // Probeflug aus dem Dashboard
  const testId = test?.id;
  useEffect(() => {
    if (!testId || still || memo.current.testId === testId) return;
    memo.current.testId = testId;
    if (Date.now() + (offsetRef?.current || 0) - test.flyAt > PLANE_TEST_FRESH_MS) return;
    const list = messagesRef.current;
    if (list.length) launch(list[memo.current.turn++ % list.length]);
  }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toRight = module.direction !== 'left';
  const seconds = clamp(Number(module.flightSeconds) || 24, 6, 90);
  const flightKey = flight?.key;
  useEffect(() => {
    const el = groupRef.current;
    if (!flightKey || !el) return undefined;
    const w = el.offsetWidth;
    const from = toRight ? -w : STAGE_W;
    const to = toRight ? STAGE_W : -w;
    const anim = el.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: seconds * 1000, easing: 'linear', fill: 'both' },
    );
    const done = () => { busy.current = false; setFlight(null); };
    anim.onfinish = done;
    return () => { anim.onfinish = null; anim.cancel(); busy.current = false; };
  }, [flightKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = still ? (messages[0] || 'Deine Nachricht') : flight?.text;
  if (!text || !module.enabled) return null;

  const size = clamp(Number(module.scale) || 1, 0.4, 2);
  return (
    <div className={`sts-plane-lane${still ? ' is-still' : ''}`} style={{ top: Math.round(module.y) }}>
      <div ref={groupRef} className="sts-plane-group">
        <div className={`sts-plane${toRight ? '' : ' to-left'}`} style={{ zoom: size }}>
          <div className="sts-banner" style={{ background: module.colors[1], color: module.colors[2] }}>
            {text}
          </div>
          <span className="sts-rope" />
          <PlaneArt color={module.colors[0]} />
        </div>
      </div>
    </div>
  );
}

/* ── Murmelbahn ─────────────────────────────────────────────────────────── */

const MARBLE_VIEW_H = 820;
/** Der Canvas ist feiner aufgelöst als dargestellt, damit er vergrößert nicht matscht. */
const MARBLE_PIXEL = 1.5;
const MARBLE_MAX_CATCHUP = 900;
const MARBLE_NAMES_SHOWN = 6;

function drawCourse(ctx, course, cam, accent, time) {
  const top = cam - 80;
  const bottom = cam + MARBLE_VIEW_H + 80;

  // Zonen liegen unter allem anderen
  for (const z of course.zones) {
    if (z.y1 < top || z.y0 > bottom) continue;
    if (z.drag) {
      // Honig: zäher Streifen
      ctx.fillStyle = 'rgba(214, 150, 20, 0.34)';
      ctx.fillRect(0, z.y0, WORLD_W, z.y1 - z.y0);
      ctx.fillStyle = 'rgba(240, 180, 50, 0.75)';
      ctx.fillRect(0, z.y0, WORLD_W, 5);
    } else {
      // Wind: Striche, die in Blasrichtung durchs Feld ziehen
      const dir = z.ax > 0 ? 1 : -1;
      ctx.fillStyle = 'rgba(120, 190, 255, 0.07)';
      ctx.fillRect(0, z.y0, WORLD_W, z.y1 - z.y0);
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const rows = Math.floor((z.y1 - z.y0) / 42);
      for (let r = 0; r < rows; r++) {
        const y = z.y0 + 24 + r * 42;
        const drift = ((time * 0.32 * dir + r * 137) % (WORLD_W + 120) + WORLD_W + 120) % (WORLD_W + 120) - 60;
        for (const x of [drift, (drift + 330) % (WORLD_W + 120) - 60]) {
          ctx.moveTo(x - 28 * dir, y);
          ctx.lineTo(x + 28 * dir, y);
        }
      }
      ctx.stroke();
    }
  }

  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  // Gewöhnliche Wände hell, federnde (Trampolin) in der Akzentfarbe
  for (const springy of [false, true]) {
    ctx.strokeStyle = springy ? accent : 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    for (const s of course.segs) {
      if (!!s.springy !== springy) continue;
      if (Math.max(s.y1, s.y2) < top || Math.min(s.y1, s.y2) > bottom) continue;
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }

  for (const p of course.pegs) {
    if (p.y < top || p.y > bottom) continue;
    ctx.fillStyle = p.bumper ? accent : 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 9;
  for (const s of course.spinners) {
    if (s.y < top - 60 || s.y > bottom + 60) continue;
    const ax = s.ux * s.len;
    const ay = s.uy * s.len;
    ctx.beginPath();
    ctx.moveTo(s.x - ax, s.y - ay); ctx.lineTo(s.x + ax, s.y + ay);
    if (s.arms === 2) { ctx.moveTo(s.x + ay, s.y - ax); ctx.lineTo(s.x - ay, s.y + ax); }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Schieber: fahrende Balken
  ctx.strokeStyle = '#f2f2f5';
  ctx.lineWidth = 10;
  for (const s of course.sliders) {
    if (s.y < top || s.y > bottom) continue;
    ctx.beginPath();
    ctx.moveTo(s.x - s.half, s.y - s.tilt);
    ctx.lineTo(s.x + s.half, s.y + s.tilt);
    ctx.stroke();
  }

  // Stempel: Platte auf einer Führungsstange
  for (const p of course.pistons) {
    if (p.max < top || p.min > bottom) continue;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.min - 6);
    ctx.lineTo(p.x, p.max + 6);
    ctx.stroke();
    ctx.strokeStyle = '#f2f2f5';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(p.x - p.half, p.y - p.tilt);
    ctx.lineTo(p.x + p.half, p.y + p.tilt);
    ctx.stroke();
  }

  // Ziellinie: Schachbrett über die ganze Breite
  if (course.finishY > top && course.finishY < bottom) {
    const cell = 20;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < WORLD_W / cell; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#101014' : '#f2f2f5';
        ctx.fillRect(col * cell, course.finishY + row * cell, cell, cell);
      }
    }
  }
}

function drawMarble(ctx, m, player, image, color, label) {
  if (imageReady(image)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, MARBLE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, m.x - MARBLE_R, m.y - MARBLE_R, MARBLE_R * 2, MARBLE_R * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, MARBLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((player.name || '?').slice(0, 1).toUpperCase(), m.x, m.y + 1);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MARBLE_R - 1, 0, Math.PI * 2);
  ctx.stroke();

  if (label) {
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(12, 12, 16, 0.9)';
    const x = clamp(m.x, 50, WORLD_W - 50);
    ctx.strokeText(player.name, x, m.y - MARBLE_R - 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(player.name, x, m.y - MARBLE_R - 6);
  }
}

/** 3D-Darstellung: eigener Chunk mit three.js, nur geladen, wenn eingeschaltet. */
const loadMarble3d = () => import('./marble3d');

function MarbleRace({ data, module, offsetRef, onResult }) {
  const canvasRef = useRef(null);
  const layerRef = useRef(null);
  const [top, setTop] = useState([]);
  const [count, setCount] = useState(0);
  const [localWinner, setLocalWinner] = useState(null);
  const [three, setThree] = useState(null);
  const [no3d, setNo3d] = useState(false);
  const live = useRef({ module, onResult });
  live.current = { module, onResult };

  const want3d = module.view3d === true && !no3d;
  useEffect(() => {
    if (!want3d || three) return;
    loadMarble3d().then((mod) => setThree(mod)).catch(() => setNo3d(true));
  }, [want3d, three]);
  // Bis der Chunk da ist, läuft das Rennen in 2D — ein Wechsel rechnet das Rennen
  // im neuen Effekt einfach bis zum aktuellen Schritt nach
  const use3d = want3d && !!three;

  const { id, seed, startsAt, sections, players } = data;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !seed || !players.length) return undefined;
    const race = createRace(seed, players.length, sections || undefined);
    const maxCam = race.course.height - MARBLE_VIEW_H;

    let view = null;
    if (use3d) {
      const mod = live.current.module;
      view = three.createMarbleView(canvas, layerRef.current, race, players, {
        width: WORLD_W, height: MARBLE_VIEW_H, pixel: MARBLE_PIXEL,
        colors: mod.colors?.length ? mod.colors : ['#9146ff'], accent: mod.accent,
      });
      if (!view) { setNo3d(true); return undefined; }
    }
    const ctx = view ? null : canvas.getContext('2d');
    const images = view ? [] : players.map((p) => loadImage(p.avatar));

    let cam = -150;
    let camSet = false;
    let reported = false;
    let lastTop = '';
    let lastCount = -1;
    let raf = 0;

    const frame = () => {
      const now = Date.now() + (offsetRef?.current || 0);
      const target = Math.floor(((now - startsAt) * STEPS_PER_SECOND) / 1000);
      // Aufholen in Portionen: eine später geladene Quelle rechnet das Rennen
      // nach, ohne dafür ein Bild lang einzufrieren
      for (let n = 0; race.step < target && n < MARBLE_MAX_CATCHUP; n++) {
        const before = race.step;
        stepRace(race);
        if (race.step === before) break; // Rennen ist ausgelaufen
      }

      if (race.winner >= 0 && !reported) {
        reported = true;
        const winner = players[race.winner];
        setLocalWinner(winner);
        live.current.onResult?.(id, winner.id);
      }

      const order = ranking(race);
      // Die Kamera hängt an der vordersten Murmel, die noch unterwegs ist
      const leadIndex = order.find((i) => !race.marbles[i].done);
      const leadY = leadIndex === undefined ? race.course.finishY : race.marbles[leadIndex].y;
      const want = clamp(leadY - MARBLE_VIEW_H * 0.42, -150, maxCam);
      cam = camSet ? cam + (want - cam) * 0.09 : want;
      camSet = true;

      const mod = live.current.module;
      const colors = mod.colors?.length ? mod.colors : ['#9146ff'];
      const labelledList = mod.showNames === false ? [] : order.filter((i) => !race.marbles[i].done).slice(0, MARBLE_NAMES_SHOWN);

      if (view) {
        view.draw({
          cam, now, labelled: labelledList, accent: mod.accent,
          countdown: target < 0 ? clamp(Math.ceil((startsAt - now) / 1000), 1, 9) : null,
        });
      } else {
        ctx.setTransform(MARBLE_PIXEL, 0, 0, MARBLE_PIXEL, 0, 0);
        ctx.clearRect(0, 0, WORLD_W, MARBLE_VIEW_H);
        ctx.save();
        ctx.translate(0, -cam);
        drawCourse(ctx, race.course, cam, mod.accent, now);

        const labelled = new Set(labelledList);
        for (let i = 0; i < race.marbles.length; i++) {
          const m = race.marbles[i];
          if (m.done || m.y < cam - 40 || m.y > cam + MARBLE_VIEW_H + 40) continue;
          drawMarble(ctx, m, players[i], images[i], colors[i % colors.length], labelled.has(i));
        }
        ctx.restore();
      }

      // Countdown vor dem Start
      if (!view && target < 0) {
        const left = Math.ceil((startsAt - now) / 1000);
        ctx.fillStyle = '#fff';
        ctx.font = `900 150px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(clamp(left, 1, 9)), WORLD_W / 2, MARBLE_VIEW_H / 2);
      }

      // Die Rangliste ist HTML — nur anfassen, wenn sie sich wirklich ändert
      const names = order.slice(0, 5).map((i) => players[i].name);
      const key = names.join('|');
      if (key !== lastTop) { lastTop = key; setTop(names); }
      if (race.finished.length !== lastCount) { lastCount = race.finished.length; setCount(lastCount); }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      view?.dispose();
    };
    // Die Spielerliste steht ab dem Start fest — id und seed kennzeichnen das Rennen
  }, [id, seed, startsAt, sections, use3d]); // eslint-disable-line react-hooks/exhaustive-deps

  const winner = data.winner || localWinner;
  const winnerFull = winner && players.find((p) => p.id === winner.id);

  return (
    <div className="sts-race">
      {/* Neuer Canvas beim Umschalten: ein 2D- und ein WebGL-Kontext gehen nicht auf demselben */}
      <canvas key={use3d ? '3d' : '2d'} ref={canvasRef} width={WORLD_W * MARBLE_PIXEL} height={MARBLE_VIEW_H * MARBLE_PIXEL}
        style={{ width: WORLD_W, height: MARBLE_VIEW_H }} />
      {use3d && <div ref={layerRef} className="sts-m3-layer" />}

      <ol className="sts-rank">
        {top.map((name, i) => (
          <li key={`${i}-${name}`}><b>{i + 1}</b><span>{name}</span></li>
        ))}
      </ol>
      <span className="sts-race-count">{count} / {players.length} im Ziel</span>

      {winner && (
        <div className="sts-winner">
          <Face person={winnerFull || winner} color={module.accent} className="is-big" />
          <div>
            <span className="stw-kicker" style={{ color: module.accent }}>
              Sieger{winner.wins > 1 ? ` · ${winner.wins}. Sieg` : ''}
            </span>
            <strong>{winner.name}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function MarbleLobby({ data, module, offsetRef }) {
  const [, tick] = useState(0);
  const timed = data.joinEndsAt > 0;
  useEffect(() => {
    if (!timed) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [timed]);

  const left = timed ? (data.joinEndsAt - (Date.now() + (offsetRef?.current || 0))) / 1000 : 0;
  const colors = module.colors?.length ? module.colors : ['#9146ff'];
  const shown = data.players.slice(0, 36);

  return (
    <div className="sts-lobby">
      <p className="sts-lobby-call">
        Schreib <b style={{ color: module.accent }}>{data.command}</b> in den Chat
      </p>
      <div className="sts-lobby-meta">
        <span>{data.players.length} {data.players.length === 1 ? 'Murmel' : 'Murmeln'} dabei</span>
        {timed && module.timer !== false && <span className="sts-lobby-time">Start in {mmss(left)}</span>}
      </div>
      {data.top?.length > 0 && (
        <div className="sts-lobby-top">
          <b>Bestenliste</b>
          {data.top.map((e, i) => (
            <span key={`${i}-${e.name}`}>{i + 1}. {e.name} <i>{e.wins}</i></span>
          ))}
        </div>
      )}
      <div className="sts-lobby-grid">
        {shown.map((p, i) => (
          <span key={p.id} className="sts-lobby-player">
            <Face person={p} color={colors[i % colors.length]} />
            <i>{p.name}</i>
          </span>
        ))}
        {data.players.length > shown.length && (
          <span className="sts-lobby-player">
            <span className="sts-face is-blank is-more">+{data.players.length - shown.length}</span>
          </span>
        )}
      </div>
    </div>
  );
}

const MARBLE_CHIP = {
  join: { cls: 'live', label: 'Anmeldung offen' },
  race: { cls: 'lock', label: 'Rennen läuft' },
  done: { cls: 'done', label: 'Entschieden' },
};

/**
 * Die Murmelbahn als Karte. Während des Rennens rechnet sie selbst und meldet
 * den Sieger über onResult(raceId, playerId).
 */
export function MarbleRunWidget({ data, module, offsetRef, onResult, width = WORLD_W }) {
  if (!data) return null;
  const alpha = clamp((module.opacity ?? 88) / 100, 0, 1);
  const racing = data.phase !== 'join' && !!data.seed;
  const chip = MARBLE_CHIP[data.phase] || MARBLE_CHIP.join;

  return (
    // Immer flach: hinter einem Canvas dieser Größe wäre die Glas-Unschärfe
    // die teuerste Sache im ganzen Overlay
    <div className="stw-card is-flat sts-marbles" style={{ width, background: `rgba(16, 16, 20, ${alpha})` }}>
      <div className="sts-marbles-head">
        <span className="stw-kicker" style={{ color: module.accent }}>Murmelbahn</span>
        <span className={`stw-chip ${chip.cls}`}>{chip.label}</span>
      </div>
      {racing
        ? <MarbleRace data={data} module={module} offsetRef={offsetRef} onResult={onResult} />
        : <MarbleLobby data={data} module={module} offsetRef={offsetRef} />}
    </div>
  );
}
