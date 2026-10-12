// Modus-Auslosung als Walze (Zufallsmodus) bzw. Enthüllung (nach Pick & Ban). Der Server hat den Modus
// schon festgelegt — die Walze ist reine Show und landet immer auf `target`. Läuft per requestAnimationFrame
// (statt CSS-Übergang), damit jeder vorbeilaufende Modus ein Tick-Geräusch machen kann; ein Zeit-Fallback
// sorgt dafür, dass sie auch landet, wenn der Browser gerade keine Frames zeichnet (Tab im Hintergrund).
// Mit ausgeschalteten Animationen (CR-Einstellungen) gibt es nur den Ton und keine Bühne.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { modeInfo, modeNameFor } from '../modesConfig';
import { useCrPrefs } from '../ui/crPrefs';
import { playSound } from '../ui/sound';
import { CrRandom, CrSwap } from '../ui/CrIcons';

const TILE = 132;
const GAP = 12;
const STEP = TILE + GAP;
const SPIN_MS = 3600;
const LAND_HOLD_MS = 1700;
const ROUNDS = 6;

const shuffled = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const easeOutQuart = (x) => 1 - (1 - x) ** 4;

function Tile({ modeId, lang, landed }) {
  const Icon = modeInfo(modeId).icon;
  return (
    <div className={`cr-tile-btn cr-tile-btn--static !flex-col !gap-2 shrink-0 py-4 px-2 ${landed ? 'cr-spin-land !border-[var(--cr-arcade-gold)]' : ''}`}
      style={{ width: TILE }}>
      <span className="cr-tile-icon w-14 h-14"><Icon size={38} /></span>
      <span className="font-cr text-white text-[13px] text-center leading-tight">{modeNameFor(modeId, lang)}</span>
    </div>
  );
}

export default function ModeSpin({ pool, target, kind = 'spin', lang, t, onDone }) {
  const { prefs } = useCrPrefs();
  const animate = prefs.animations;
  const boxRef = useRef(null);
  const stripRef = useRef(null);
  const [landed, setLanded] = useState(kind === 'reveal');
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Walze: mehrere gemischte Runden des Modus-Pools, das Ziel an fester Stelle, danach ein paar Füllkacheln
  const strip = useMemo(() => {
    const base = pool.length ? pool : [target];
    const seq = [];
    for (let r = 0; r < ROUNDS; r++) seq.push(...shuffled(base));
    const targetIndex = seq.length;
    seq.push(target, ...shuffled(base).slice(0, 4));
    return { seq, targetIndex };
    // Nur einmal pro Auslosung mischen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!animate) { playSound('land'); onDoneRef.current?.(); return undefined; }
    const timers = [];
    const finish = () => {
      setLanded(true);
      playSound('land');
      timers.push(setTimeout(() => onDoneRef.current?.(), LAND_HOLD_MS));
    };
    if (kind === 'reveal') {
      playSound('land');
      timers.push(setTimeout(() => onDoneRef.current?.(), LAND_HOLD_MS + 400));
      return () => timers.forEach(clearTimeout);
    }
    const width = boxRef.current?.clientWidth || 600;
    const final = strip.targetIndex * STEP + TILE / 2 - width / 2;
    let raf = 0;
    let lastTile = -1;
    let done = false;
    const start = performance.now();
    const setX = (x) => { if (stripRef.current) stripRef.current.style.transform = `translateX(${-x}px)`; };
    const frame = (now) => {
      const p = Math.min(1, (now - start) / SPIN_MS);
      const x = final * easeOutQuart(p);
      setX(x);
      const tile = Math.floor((x + width / 2) / STEP);
      if (tile !== lastTile) { lastTile = tile; if (p < 0.98) playSound('tick'); }
      if (p < 1) raf = requestAnimationFrame(frame);
      else if (!done) { done = true; finish(); }
    };
    raf = requestAnimationFrame(frame);
    // Fallback: ohne Frames (Hintergrund-Tab) trotzdem auf dem Ziel landen
    timers.push(setTimeout(() => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      setX(final);
      finish();
    }, SPIN_MS + 250));
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [animate, kind, strip]);

  if (!animate) return null;
  return (
    <div className="cr-stage fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => onDoneRef.current?.()} role="dialog" aria-label={t.spinTitle}>
      <div className="cr-arcade-panel w-full max-w-3xl p-5 md:p-6 text-center" onClick={e => e.stopPropagation()}>
        <p className="cr-section-title justify-center text-xl">
          {kind === 'reveal' ? <CrSwap size={26} /> : <CrRandom size={26} />}
          {landed ? t.spinLanded : t.spinTitle}
        </p>
        {kind === 'reveal' ? (
          <div className="flex justify-center my-6"><Tile modeId={target} lang={lang} landed /></div>
        ) : (
          <div ref={boxRef} className="relative overflow-hidden my-5 h-[176px] rounded-xl bg-[#081426] border border-[rgba(2,8,20,0.8)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]">
            {/* Markierung in der Mitte */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[140px] rounded-xl border-2 border-[var(--cr-arcade-gold)] z-10 pointer-events-none" />
            {/* Ränder ausblenden, damit die Walze "hinten herum" läuft */}
            <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none bg-gradient-to-r from-[#081426] to-transparent" />
            <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none bg-gradient-to-l from-[#081426] to-transparent" />
            <div ref={stripRef} className="absolute top-3 left-0 flex will-change-transform" style={{ gap: GAP }}>
              {strip.seq.map((m, i) => <Tile key={i} modeId={m} lang={lang} landed={landed && i === strip.targetIndex} />)}
            </div>
          </div>
        )}
        <p className={`font-cr text-2xl md:text-3xl ${landed ? 'text-[var(--cr-arcade-gold)] cr-win-pop' : 'text-white/40'}`}>
          {landed ? modeNameFor(target, lang) : '…'}
        </p>
        <p className="text-white/35 text-xs mt-3">{t.tapToSkip}</p>
      </div>
    </div>
  );
}
