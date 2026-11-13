// ColorGuess.jsx — /clash/farbe: Einer Karte fehlt eine Farbe (Haare, Haut, Umhang …). Man mischt sie mit drei
// Reglern (Farbton, Sättigung, Helligkeit) aus dem Gedächtnis nach; die Karte färbt sich dabei live mit — samt
// Schatten und Glanzlichtern, weil jedes Pixel relativ zur Grundfarbe umgerechnet wird (colorMath.js).
// Ein Tipp pro Karte, Wertung nach Farbabstand; fünf Karten je Runde, Tagesrunde per Datum-Seed oder freies Spiel.
//
// Zwei Bilder liegen übereinander im Canvas: das Kartenbild vom CDN (ohne CORS — wird nur gezeichnet, nie
// ausgelesen) und darüber die Farbfläche aus /media/cr-farben/<id>.webp (eigene Datei, auslesbar): Originalpixel
// der Fläche mit Alpha = Zugehörigkeit. Masken und Grundfarben erzeugt `npm run cr:card-colors` (Backend);
// mitspielen können nur Karten aus data/cardColors.json.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameFrame from './GameFrame';
import NextGame from './NextGame';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import { CrCrown, CrReplay } from '../ui/CrIcons';
import { ALL_CARDS, cardImageUrl } from '../data/cards';
import CARD_COLORS from '../data/cardColors.json';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../modes/cardCrop';
import { seeded, berlinDay, readStore, writeStore } from './quizData';
import { useClashLang } from './clashI18n';
import { playSound } from '../ui/sound';
import { hslToRgb, colorOf, preparePatch, recolorPatch, checkerPatch, matchScore, rgbCss } from './colorMath';
import potionImg from '../../../assets/clashRoyale/ui/card_boost_potion.png';

const STORE = 'crq_color_v1';
const ROUNDS = 5;
const VIEW_W = 520;
const VIEW_H = 650;
const START = { h: 200, s: 60, l: 50 };
const POOL = ALL_CARDS.filter((c) => Array.isArray(CARD_COLORS[c.id]));
const CARD_BY_ID = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

function newGame(daily) {
  const day = berlinDay();
  const rand = daily ? seeded(`farbe|${day}`) : Math.random;
  const rest = POOL.map((c) => c.id);
  const cards = [];
  while (cards.length < ROUNDS && rest.length) cards.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  return { daily, day, cards, results: [], round: 0, over: false };
}

/** Gespeicherte Tagesrunde nur übernehmen, wenn sie von heute ist und ihre Karten noch mitspielen */
function loadDaily() {
  const saved = readStore(STORE, {}).daily;
  const valid = saved && saved.day === berlinDay() && Array.isArray(saved.cards) && Array.isArray(saved.results)
    && saved.cards.length > 0 && saved.cards.every((id) => CARD_COLORS[id] && CARD_BY_ID[id]);
  if (!valid) return newGame(true);
  // fertige Runde direkt als Auswertung zeigen
  return saved.over ? { ...saved, round: saved.cards.length } : saved;
}

const crownsFor = (avg) => (avg >= 90 ? 3 : avg >= 78 ? 2 : avg >= 60 ? 1 : 0);
const average = (results) => (results.length ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : 0);

/**
 * Beide Bilder einer Karte laden: das Kartenbild (CDN) und ihre Farbfläche als eigenes Canvas in Bildgröße samt
 * vorbereiteter Pixel-Liste. Liefert erst etwas, wenn beides da ist — und merkt sich, zu welcher Karte es gehört,
 * damit beim Kartenwechsel nie das alte Bild mit der neuen Zielfarbe gezeichnet wird.
 */
function useCardLayers(cardId) {
  const [state, setState] = useState({ id: null, img: null, layer: null, failed: false });
  useEffect(() => {
    if (!cardId) return undefined;
    let alive = true;
    const fail = () => { if (alive) setState({ id: cardId, img: null, layer: null, failed: true }); };
    const load = (src) => new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
    const cardSrc = cardImageUrl(cardId);
    if (!cardSrc) { fail(); return undefined; }
    Promise.all([load(cardSrc), load(`/media/cr-farben/${cardId}.webp`)]).then(([img, mask]) => {
      if (!alive) return;
      const canvas = document.createElement('canvas');
      canvas.width = CARD_IMAGE_SIZE.w;
      canvas.height = CARD_IMAGE_SIZE.h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setState({ id: cardId, img, layer: { canvas, ctx, image, patch: preparePatch(image.data) }, failed: false });
    }).catch(fail);
    return () => { alive = false; };
  }, [cardId]);
  return state.id === cardId ? state : { id: cardId, img: null, layer: null, failed: false };
}

/**
 * @param mode  'checker' Fläche als Transparenz-Karo · 'color' Fläche in der Farbe `rgb` · 'original' unverändert
 */
function drawStage(canvas, img, layer, rarity, mode, target, rgb) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  if (!img || !layer) { ctx.clearRect(0, 0, W, H); return; }
  const box = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
  const k = img.naturalWidth / CARD_IMAGE_SIZE.w; // falls das CDN eine andere Auflösung liefert
  const scale = Math.min(W / box.w, H / box.h);
  const w = box.w * scale, h = box.h * scale;
  const dx = (W - w) / 2, dy = (H - h) / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, box.x * k, box.y * k, box.w * k, box.h * k, dx, dy, w, h);
  if (mode === 'original') return;
  if (mode === 'checker') checkerPatch(layer.patch, layer.canvas.width, layer.image.data);
  else recolorPatch(layer.patch, target, colorOf(rgb), layer.image.data);
  layer.ctx.putImageData(layer.image, 0, 0);
  ctx.drawImage(layer.canvas, box.x, box.y, box.w, box.h, dx, dy, w, h);
}

function Slider({ label, value, max, unit, track, onChange }) {
  return (
    <label className="crq-color-row">
      <span className="crq-color-label">{label}</span>
      <input type="range" min={0} max={max} step={1} value={value} className="crq-color-slider" style={{ '--crq-track': track }}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="crq-color-value">{value}{unit}</span>
    </label>
  );
}

function Swatches({ guess, target, t }) {
  return (
    <div className="flex gap-3">
      <div className="crq-color-swatch"><span style={{ background: rgbCss(guess) }} />{t.colorYours}</div>
      <div className="crq-color-swatch"><span style={{ background: rgbCss(target) }} />{t.colorOriginal}</div>
    </div>
  );
}

export default function ColorGuess() {
  const { t } = useClashLang();
  const [game, setGame] = useState(loadDaily);
  const [hsl, setHsl] = useState(START);
  const [touched, setTouched] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const canvasRef = useRef(null);

  const summary = game.round >= game.cards.length;
  const cardId = summary ? null : game.cards[game.round];
  const card = cardId ? CARD_BY_ID[cardId] : null;
  const result = summary ? null : game.results[game.round];
  const targetRgb = cardId ? CARD_COLORS[cardId] : null;
  const target = useMemo(() => (targetRgb ? colorOf(targetRgb) : null), [targetRgb]);
  const { img, layer, failed } = useCardLayers(cardId);
  const guessRgb = useMemo(() => (result ? result.rgb : hslToRgb(hsl.h, hsl.s, hsl.l)), [result, hsl]);
  const ready = !!img && !!layer;

  useEffect(() => {
    if (!card || !target) return;
    const mode = result ? (showOriginal ? 'original' : 'color') : touched ? 'color' : 'checker';
    drawStage(canvasRef.current, img, layer, card.rarity, mode, target, guessRgb);
  }, [img, layer, card, target, guessRgb, touched, result, showOriginal]);

  const save = (update) => {
    setGame((prev) => {
      const g = update(prev);
      if (g.daily) writeStore(STORE, { daily: g });
      return g;
    });
  };
  const move = (key) => (value) => { setTouched(true); setHsl((c) => ({ ...c, [key]: value })); };
  const resetRound = () => { setHsl(START); setTouched(false); setShowOriginal(false); };

  const submit = () => {
    if (!touched || !ready || result || !targetRgb) return;
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    const score = matchScore(rgb, targetRgb);
    playSound(score >= 90 ? 'win' : 'pick');
    save((g) => {
      const results = [...g.results, { rgb, score }];
      return { ...g, results, over: results.length >= g.cards.length };
    });
  };
  /** Karte ohne Wertung überspringen, wenn ihr Bild nicht lädt — sonst hinge die Runde fest */
  const skipBroken = () => {
    save((g) => {
      const results = [...g.results, { rgb: [128, 128, 128], score: 0, skipped: true }];
      return { ...g, results, over: results.length >= g.cards.length, round: g.round + 1 };
    });
    resetRound();
  };
  const next = () => { save((g) => ({ ...g, round: g.round + 1 })); resetRound(); };
  const restart = (daily) => { setGame(daily ? loadDaily() : newGame(false)); resetRound(); };

  const avg = average(game.results);
  const crowns = crownsFor(avg);
  const tracks = {
    h: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} ${hsl.s}% ${hsl.l}%)`).join(', ')})`,
    s: `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`,
    l: `linear-gradient(to right, #000, hsl(${hsl.h} ${hsl.s}% 50%), #fff)`,
  };

  return (
    <GameFrame title={t.colorTitle} icon={potionImg}
      seo={{ title: `Clash Royale ${t.colorTitle}`, description: t.colorSeo, path: '/clash/farbe' }}>
      <div className="flex justify-center mb-4">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={game.daily} onClick={() => restart(true)}>{t.daily}</button>
          <button type="button" role="tab" aria-selected={!game.daily} onClick={() => restart(false)}>{t.free}</button>
        </div>
      </div>

      <div className="cr-arcade-panel p-4 md:p-6">
        {summary ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="font-cr text-4xl leading-none tabular-nums">{avg} %</p>
              <div>
                <p className="text-sm text-white/75">{t.colorAverage} · {t.colorVerdict(avg)}</p>
                <div className="flex items-center gap-1 mt-1" aria-label={t.crowns(crowns)}>
                  {[0, 1, 2].map((i) => <CrCrown key={i} size={28} className={i < crowns ? '' : 'opacity-25 grayscale'} />)}
                </div>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {game.cards.map((id, i) => {
                const r = game.results[i];
                if (!r) return null;
                return (
                  <li key={id} className="crq-color-result">
                    <span className="w-11 shrink-0 aspect-[4/5]"><CardFace id={id} rarity={CARD_BY_ID[id].rarity} /></span>
                    <span className="min-w-0 flex-1 truncate font-cr text-[15px]">{CARD_BY_ID[id].name}</span>
                    <span className="crq-color-pair" aria-hidden="true">
                      <span style={{ background: rgbCss(r.rgb) }} />
                      <span style={{ background: rgbCss(CARD_COLORS[id]) }} />
                    </span>
                    <span className="w-14 text-right font-cr text-lg tabular-nums">{r.score} %</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-white/50">{t.colorYours} / {t.colorOriginal}</p>
            <ChunkyButton variant="green" size="sm" icon={CrReplay} className="self-start" onClick={() => restart(false)}>{t.newRound}</ChunkyButton>
            {game.daily && <p className="text-xs text-white/50">{t.nextDaily}</p>}
            <NextGame current="farbe" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-5 items-start">
            {/* am Handy schmaler, damit Karte und Regler zusammen auf den Bildschirm passen */}
            <div className="crq-img-stage w-full max-w-[13rem] mx-auto sm:max-w-none">
              <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} aria-label={t.colorAlt} />
              {!ready && !failed && <span className="crq-img-loading">…</span>}
              <span className="crq-img-stage-tag">{t.colorRound(game.round + 1, game.cards.length)}</span>
            </div>

            <div className="min-w-0 flex flex-col gap-3">
              <p className="font-cr text-2xl leading-none">{card.name}</p>
              {failed ? (
                <>
                  <p className="text-sm text-white/75">{t.colorLoadError}</p>
                  <ChunkyButton variant="blue" size="sm" className="self-start" onClick={skipBroken}>{t.colorNext}</ChunkyButton>
                </>
              ) : result ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <p className="font-cr text-4xl leading-none tabular-nums">{result.score} %</p>
                    <p className="text-sm text-white/75">{t.colorMatch} · {t.colorVerdict(result.score)}</p>
                  </div>
                  <Swatches guess={result.rgb} target={targetRgb} t={t} />
                  <div className="cr-tabs cr-tabs--sub self-start" role="tablist">
                    <button type="button" role="tab" aria-selected={!showOriginal} onClick={() => setShowOriginal(false)}>{t.colorYourCard}</button>
                    <button type="button" role="tab" aria-selected={showOriginal} onClick={() => setShowOriginal(true)}>{t.colorOriginal}</button>
                  </div>
                  <ChunkyButton variant="green" size="sm" className="self-start" onClick={next}>
                    {game.round + 1 >= game.cards.length ? t.colorFinish : t.colorNext}
                  </ChunkyButton>
                </>
              ) : (
                <>
                  <p className="text-white/80 text-sm leading-relaxed">{t.colorHelp}</p>
                  <div className="flex flex-col gap-2.5">
                    <Slider label={t.colorHue} value={hsl.h} max={360} unit="°" track={tracks.h} onChange={move('h')} />
                    <Slider label={t.colorSat} value={hsl.s} max={100} unit=" %" track={tracks.s} onChange={move('s')} />
                    <Slider label={t.colorLight} value={hsl.l} max={100} unit=" %" track={tracks.l} onChange={move('l')} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ChunkyButton variant="green" size="sm" disabled={!touched || !ready} onClick={submit}>{t.colorSubmit}</ChunkyButton>
                    {touched
                      ? <span className="crq-color-chip" style={{ background: rgbCss(guessRgb) }} aria-hidden="true" />
                      : <span className="text-xs text-white/50">{t.colorMoveFirst}</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </GameFrame>
  );
}
