// parts.jsx — gemeinsame Bausteine der Stats-Seiten: Karte mit Level, Deck wie im Spiel (4 × 2 mit Turmtruppe),
// Deck-Reihe und Deck-Zeile mit Spiel-Link, Kartenfilter, Kopfbanner, Flächen, Zeilen-Listen, Kennzahlen, Balken,
// Siegquoten-Ring, Verlaufslinie, Lade-/Fehlerzustand. Aussehen: scout.css.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Copy, ExternalLink, QrCode, RefreshCw, X } from 'lucide-react';
import { ALL_CARDS, cardImageUrl } from '../data/cards';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../modes/cardCrop';
import { buildDeckLink } from '../data/cardDeckIds';
import { useClanBadgeUrl } from '../data/clanBadges';
import Modal from '../ui/Modal';
import { CrCheck, CrClock, CrElixir, CrPlus, CrRandom, CrSearch, CrStar, CrUser } from '../ui/CrIcons';
import { MEDAL_ICON_URL, challengeBadgeUrl } from '../data/leagueIcons';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.webp';
import crownSeriesImg from '../../../assets/clashRoyale/modes/CR_CrownSeriesIcon.webp';
import clanWarsImg from '../../../assets/clashRoyale/ui/clan-wars.webp';
import challengeImg from '../../../assets/clashRoyale/modes/challenge-grand.webp';
import tourneyImg from '../../../assets/clashRoyale/modes/tourney_trophy.webp';
import draftImg from '../../../assets/clashRoyale/modes/draft.webp';
import { friendlyImg, modeArt, twoVsTwoImg } from '../data/modeArt';
import battleImg from '../../../assets/clashRoyale/ui/battle.webp';
import goldImg from '../../../assets/clashRoyale/ui/gold.webp';
import evoShardImg from '../../../assets/clashRoyale/ui/evo_shard.webp';
import heroShardImg from '../../../assets/clashRoyale/ui/Hero_Shard.webp';
import towerImg from '../../../assets/clashRoyale/ui/tower.webp';
import starLevelImg from '../../../assets/clashRoyale/ui/star_level.webp';
import royaleShuffleImg from '../../../assets/clashRoyale/ui/royale_shuffle.webp';
import itemHeaderImg from '../../../assets/clashRoyale/ui/item_header.webp';
import upgradeImg from '../../../assets/clashRoyale/ui/upgrade-arrow.webp';
import { deckStats, localDayKey } from './analysis';
import { fmtDec, fmtNum, useScoutText } from './scoutI18n';
import { currentLimit, useSaved } from './scoutApi';
import { battleModeName, deckPath } from './scoutUtil';

const RARITY_BY_ID = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c.rarity]));
const CARD_NAME = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c.name]));
// Sichtbarer Bereich, der jeden Rahmen ganz zeigt (Evolutionen, Helden, Turmtruppen, unbekannte Karten) —
// die Rahmen je Seltenheit stehen in modes/cardCrop.js
const ANY_FRAME = { x: 11, y: 24, w: 262, h: 378 };

/** Kartenbild ohne transparenten Rand (wie ui/CardFace.jsx, zusätzlich mit Evolution/Held und Bildern aus der API). */
export function CardArt({ card }) {
  const base = card.id ? cardImageUrl(card.id) : card.icon;
  const special = card.id && card.variant ? variantUrl(card.id, card.variant, base) : null;
  const [failed, setFailed] = useState(null);
  // Sonderform lädt nicht: Grundbild statt leerer Karte
  const useSpecial = special && special !== base && failed !== special;
  const src = useSpecial ? special : base;
  if (!src) return null;
  const box = useSpecial || !card.id ? ANY_FRAME : CARD_FRAME_BOX[RARITY_BY_ID[card.id]] || ANY_FRAME;
  const { w: W, h: H } = CARD_IMAGE_SIZE;
  return (
    <span style={{ aspectRatio: `${box.w} / ${box.h}` }}>
      <img key={src} src={src} alt="" loading="lazy" decoding="async" draggable={false}
        style={{ width: `${(W / box.w) * 100}%`, height: `${(H / box.h) * 100}%`, left: `${(-box.x / box.w) * 100}%`, top: `${(-box.y / box.h) * 100}%` }}
        onError={(e) => { if (useSpecial) setFailed(special); else e.currentTarget.style.visibility = 'hidden'; }} />
    </span>
  );
}

// Supercell legt Evolution und Held unter derselben Kennung wie das Grundbild ab (cards/ → cardevolutions/ bzw.
// cardheroes/). Kennt die gespiegelte Bildliste eine neue Form noch nicht, wird ihre Adresse daraus abgeleitet —
// die Form selbst kommt hier aus dem Battlelog, existiert also.
const VARIANT_DIR = { ev1: '/cardevolutions/', hero: '/cardheroes/' };
function variantUrl(id, variant, base) {
  const known = cardImageUrl(id, variant);
  if (known && known !== base) return known;
  return base && VARIANT_DIR[variant] && base.includes('/cards/') ? base.replace('/cards/', VARIANT_DIR[variant]) : base;
}

/**
 * @param {object}  card     { id, name, lvl, variant, icon }
 * @param {number}  cap      Höchstlevel — ab da ist das Level golden
 * @param {boolean} link     verlinkt auf die Kartenseite (nur bekannte Karten)
 * @param {boolean} missing  ausgegraut (nicht in der Sammlung)
 */
export function ScoutCard({ card, cap, size = 'md', level = true, link = false, missing = false, children }) {
  const { t, q } = useScoutText();
  if (!card) return <span className="crs-card" />;
  const cls = `crs-card${size === 'sm' ? ' crs-card--sm' : ''}${missing ? ' crs-card--missing' : ''}`;
  const body = (
    <>
      <span className="crs-card-art block"><CardArt card={card} /></span>
      {level && typeof card.lvl === 'number' && (
        <span className={`crs-card-lvl${cap && card.lvl >= cap ? ' is-max' : ''}`}>{size !== 'sm' && <span className="crs-lvl-pre">{t.lvl} </span>}{card.lvl}</span>
      )}
      {children}
    </>
  );
  return link && card.id
    ? <Link to={`/clash/karten/${card.id}${q}`} className={`${cls} crs-cardlink`} title={card.name} aria-label={card.name}>{body}</Link>
    : <span className={cls} title={card.name}>{body}</span>;
}

/** Acht Karten nebeneinander. mini = schmale Reihe ohne Fläche (Kampf-Zeilen, Listen); bare = groß, aber ohne eigene Fläche. */
export function DeckRow({ cards, cap, mini = false, bare = false, link = false, level = true, className = '' }) {
  return (
    <div className={`${mini ? 'crs-deck--mini' : bare ? 'crs-deck crs-deck--bare' : 'crs-deck crs-well'} ${className}`}>
      {cards.map((c, i) => <ScoutCard key={`${c.id || c.name}-${i}`} card={c} cap={cap} size={mini ? 'sm' : 'md'} link={link} level={level} />)}
    </div>
  );
}

/** Ø Elixier, Umlauf und Turmtruppe eines Decks. */
export function DeckMeta({ cards, tower, children }) {
  const { t, lang } = useScoutText();
  const { avgElixir, cycle } = deckStats(cards);
  return (
    <div className="crs-deckmeta">
      {avgElixir !== null && <span><CrElixir size={18} /><b>{fmtDec(avgElixir, lang)}</b> {t.avgElixir}</span>}
      {cycle !== null && <span title={t.cycleHint}><CrRandom size={18} /><b>{cycle}</b> {t.cycle}</span>}
      {tower && (
        <span title={t.towerTroop}>
          {tower.icon && <span className="inline-block w-6 crs-card"><span className="crs-card-art block"><CardArt card={tower} /></span></span>}
          {tower.name}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Ein Knopf für alles, was man mit einem Deck außerhalb der Seite macht: klappt ein Menü auf mit „Im Spiel öffnen“,
 * „Link kopieren“ und „QR-Code“. Spart die Knopfzeile unter Decks (Rangliste, Profil-Übersicht). Ohne vollständigen
 * Link (neue Karte, unvollständiges Deck) erscheint nichts.
 */
export function DeckShare({ cards, className = '' }) {
  const { t } = useScoutText();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(null);
  const box = useRef(null);
  const complete = cards?.length === 8 && cards.every((c) => c.id);
  const link = complete ? buildDeckLink(cards.map((c) => ({ id: c.id, name: c.name, isChampion: RARITY_BY_ID[c.id] === 'Champion' }))) : { ok: false };

  // Außerhalb klicken oder Esc schließt das Menü
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!link.ok) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1100);
    } catch { /* Zwischenablage gesperrt — die anderen Wege bleiben */ }
  };
  const showQr = () => {
    setOpen(false);
    QRCode.toDataURL(link.url, { width: 260, margin: 1 }).then(setQr).catch(() => setQr(null));
  };
  return (
    <span ref={box} className={`crs-share ${className}`}>
      <button type="button" className="cr-chip flex items-center gap-2 h-9 px-3 rounded-xl font-cr text-sm text-white"
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Copy size={15} />{t.copyDeck}
      </button>
      {open && (
        <span className="crs-share-menu" role="menu">
          <a role="menuitem" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <ExternalLink size={16} />{t.openInGame}
          </a>
          <button type="button" role="menuitem" onClick={copy}>
            {copied ? <CrCheck size={16} /> : <Copy size={16} />}{copied ? t.copied : t.copyLink}
          </button>
          <button type="button" role="menuitem" onClick={showQr}><QrCode size={16} />{t.qr}</button>
        </span>
      )}
      {qr && (
        <Modal title={t.qr} size="sm" onClose={() => setQr(null)}>
          <div className="p-5 flex flex-col items-center gap-3">
            <img src={qr} alt={t.qr} width={260} height={260} className="rounded-lg bg-white p-2" />
            <p className="text-sm text-center text-white/70">{t.qrHint}</p>
          </div>
        </Modal>
      )}
    </span>
  );
}

/**
 * Ein Deck als Zeile: links die acht Karten, rechts oben die Kennzahlen (figures: [{ value, label, tone }]),
 * darunter eine Nebenzeile (children) und Ø Elixier/Cycle mit Deck-Seite und Kopieren-Menü (DeckShare).
 * @param {number} rank  Platz in einer Liste (optional)
 * @param {boolean} wide  wie in der Rangliste: Karten so groß wie dort, Ø Elixier und Cycle unter dem Deck statt rechts
 *                        (ganzseitige Listen wie Meta Decks) — rechts bleiben nur Kennzahlen und Knöpfe
 */
export function DeckLine({ cards, cap, tower, rank, figures = [], children, level = true, wide = false }) {
  const { t, lang, q } = useScoutText();
  const { avgElixir, cycle } = deckStats(cards);
  const page = deckPath(cards);
  // Wie in der Rangliste: acht Karten in einer Reihe, die Turmtruppe etwas kleiner dahinter
  const grid = <DeckGrid cards={cards} tower={tower || undefined} cap={cap} size="row" level={level} />;
  return (
    <div className={`crs-deckline${rank ? ' crs-deckline--ranked' : ''}${wide ? ' crs-deckline--wide' : ''}`}>
      {rank ? <span className={`crs-rank crs-rank--${rank} justify-self-start`}>{rank}</span> : null}
      {wide ? (
        <div className="min-w-0">
          {grid}
          {(avgElixir !== null || cycle !== null) && (
            <div className="crs-rankrow-meta">
              {avgElixir !== null && <span className="crs-delta"><CrElixir size={14} /> {fmtDec(avgElixir, lang)}</span>}
              {cycle !== null && <span className="crs-delta" title={t.cycleHint}><CrRandom size={14} /> {cycle} {t.cycle}</span>}
            </div>
          )}
        </div>
      ) : grid}
      <div className="crs-deckline-info">
        {figures.length > 0 && (
          <div className="crs-deckline-top">
            {figures.map((f) => (
              <span key={f.label} className="crs-deckline-big" style={f.tone ? { color: f.tone } : undefined}>{f.value}<small>{f.label}</small></span>
            ))}
          </div>
        )}
        {children && <div className="crs-deckline-sub">{children}</div>}
        <div className="crs-deckline-foot">
          {!wide && (
            <span className="crs-deckmeta">
              {avgElixir !== null && <span><CrElixir size={16} /><b>{fmtDec(avgElixir, lang)}</b></span>}
              {cycle !== null && <span title={t.cycleHint}><CrRandom size={16} /><b>{cycle}</b> {t.cycle}</span>}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2">
            {page && <Link to={`${page}${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.deckPage}</Link>}
            <DeckShare cards={cards} />
          </span>
        </div>
      </div>
    </div>
  );
}

// Abzeichen je Kampfgruppe (analysis/scoutShape: modeGroup) — Bilder aus dem Spiel. 2v2 = gewöhnliches 2v2; die 2v2-Liga
// erkennt modeArt am einzelnen Kampf.
const MODE_ICON = {
  ranked: MEDAL_ICON_URL, ladder: trophyImg, crown: crownSeriesImg, '2v2': twoVsTwoImg, war: clanWarsImg,
  challenge: challengeImg, tournament: tourneyImg, friendly: friendlyImg, party: draftImg,
};
const modeIconUrl = (group) => MODE_ICON[group] || battleImg;

// Symbol-Schlüssel ohne eigenes Modus-Bild: „challenge“ = Classic, Grand oder 20 Win, aber unklar welche (Kampf von vor
// der Event-Erkennung) → neutrale Schwerter statt eines Kranzes; clan_wars nutzt das Spiel selbst für 1v1 Showdown.
// Alle übrigen Modus-Bilder: data/modeArt.js.
const KEY_ART = { clan_wars: clanWarsImg, challenge: battleImg };

/**
 * Abzeichen des Spielmodus eines Kampfes. Mit `battle`: Kranz der Challenge (Classic, Grand, 20 Win …), sonst das
 * Symbol des Modus (Draft, Chaos, Dragon Hunt, 2v2-Liga …), sonst das der Kampfgruppe — bei Events ohne eigenes Bild
 * neutrale Schwerter statt des Draft-Symbols der Gruppe.
 */
export function ModeBadge({ group, battle = null, size = 28, className = '' }) {
  const { t, lang } = useScoutText();
  const src = (battle && (challengeBadgeUrl(battle.challenge, null) || modeArt(battle) || KEY_ART[battle.modeIcon]
    || (group === 'party' ? battleImg : null)))
    || modeIconUrl(group);
  const label = (battle && battleModeName(battle, lang)) || t.groups[group] || '';
  return <img src={src} alt={label} title={label} draggable={false}
    className={`inline-block shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />;
}

/**
 * Deck wie im Spiel: vier Karten je Reihe, zwei Reihen, die Turmtruppe daneben — oder (size "row") alle acht in
 * einer Reihe, die Turmtruppe dahinter.
 * @param {Array|null|undefined} cards  undefined = wird noch geladen (Platzhalter), null = kein Deck bekannt (Strich)
 * @param {object} [tower]  Turmtruppe ({ name, icon, lvl }) — steht rechts neben den Karten
 * @param {'lg'|'md'|'sm'|'row'} size  Profil und Deck-Seite | Kämpfe | kleine Kacheln | Rangliste
 */
export function DeckGrid({ cards, tower, cap, size = 'md', link = true, level = true, className = '' }) {
  const { t } = useScoutText();
  if (cards === null) return <span className="text-xs crs-muted">–</span>;
  const cardSize = size === 'lg' || size === 'row' ? 'md' : 'sm';
  return (
    <div className={`crs-deck4 crs-deck4--${size} ${className}`}>
      <div className={`crs-deck4-cards${cards ? '' : ' is-wait'}`} aria-hidden={cards ? undefined : 'true'}>
        {cards
          ? cards.map((c, i) => <ScoutCard key={`${c.id || c.name}-${i}`} card={c} cap={cap} size={cardSize} link={link} level={level} />)
          : Array.from({ length: 8 }, (_, i) => <span key={i} />)}
      </div>
      {cards && tower && (
        <div className="crs-deck4-tower" title={`${t.towerTroop}: ${tower.name}`}>
          <ScoutCard card={tower} cap={cap} size={cardSize} level={level} />
        </div>
      )}
    </div>
  );
}

/**
 * Karten wählen (Filter „Deck enthält …"). Die Auswahl gehört dem Aufrufer.
 * @param {string[]} picked  gewählte Karten-IDs
 * @param {number} max       so viele Karten lassen sich höchstens wählen
 */
export function CardPicker({ picked, onToggle, max = 8, label }) {
  const { t } = useScoutText();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const needle = text.trim().toLowerCase();
  const list = needle ? ALL_CARDS.filter((c) => c.name.toLowerCase().includes(needle)) : ALL_CARDS;
  return (
    <div className="crs-pick" ref={ref}>
      <button type="button" className="cr-chip flex items-center gap-2 h-10 px-3 rounded-xl font-cr text-sm text-white" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <CrPlus size={18} /> {label || t.withCard}
      </button>
      {open && (
        <div className="crs-pick-panel custom-scrollbar">
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><CrSearch size={18} /></span>
            <input type="text" autoFocus className="cr-input h-10 pl-9 pr-3 text-sm" placeholder={t.cardSearchPh} aria-label={t.cardSearchPh}
              value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="crs-pick-grid">
            {list.map((c) => (
              <button key={c.id} type="button" aria-pressed={picked.includes(c.id)} title={c.name} aria-label={c.name}
                disabled={!picked.includes(c.id) && picked.length >= max} onClick={() => onToggle(c.id)}>
                <ScoutCard card={{ id: c.id, name: c.name }} level={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Die gewählten Karten eines Filters als Marken zum Wegklicken. */
export function PickedCards({ picked, onToggle }) {
  const { t } = useScoutText();
  return picked.map((id) => (
    <button key={id} type="button" className="crs-tagchip" onClick={() => onToggle(id)} title={t.remove}>
      {CARD_NAME[id] || id} <X size={13} />
    </button>
  ));
}

/**
 * Formkurve der letzten Kämpfe: jeder Sieg hebt die Linie um eine Stufe, jede Niederlage senkt sie, jeder Kampf ist
 * ein Punkt darauf (blau Sieg, rot Niederlage, grau Unentschieden). Über der Null-Linie blau, darunter rot gefüllt.
 * Tagesgrenzen stehen als feine Striche in der Kurve, darunter je Tag die Bilanz. Ältester Kampf links.
 * @param {Array} form  neueste zuerst (analysis.form)
 * @param {(ms: number) => string} dayLabel  Bezeichnung eines Tages („Heute", „Gestern", Datum)
 */
export function FormTrail({ form, dayLabel }) {
  const { t, lang } = useScoutText();
  const list = [...form].reverse();
  const n = list.length;
  if (!n) return null;
  let net = 0;
  const pts = [{ x: 0, v: 0 }];
  list.forEach((f, i) => {
    net += f.result === 'win' ? 1 : f.result === 'loss' ? -1 : 0;
    pts.push({ x: ((i + 1) / n) * 100, v: net, f });
  });
  const values = pts.map((p) => p.v);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (v) => 10 + (1 - (v - min) / span) * 80;
  const zero = y(0);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const area = `${line} L100,${zero.toFixed(2)} L0,${zero.toFixed(2)} Z`;

  // Tage: Abschnitte gleicher Kalendertage (Kampf i liegt zwischen (i/n) und ((i+1)/n) der Breite)
  const days = [];
  list.forEach((f, i) => {
    const key = localDayKey(f.t);
    const cur = days[days.length - 1];
    if (cur && cur.key === key) {
      cur.to = i;
      if (f.result === 'win') cur.wins += 1;
      if (f.result === 'loss') cur.losses += 1;
    } else days.push({ key, t: f.t, from: i, to: i, wins: f.result === 'win' ? 1 : 0, losses: f.result === 'loss' ? 1 : 0 });
  });
  const label = { win: t.win, loss: t.loss, draw: t.draw };
  const when = (ms) => new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="crs-trail" role="img" aria-label={`${t.lastBattles}: ${t.record(list.filter((f) => f.result === 'win').length, list.filter((f) => f.result === 'loss').length)}`}>
      <div className="crs-trail-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id="crs-trail-up"><rect x="0" y="0" width="100" height={zero} /></clipPath>
            <clipPath id="crs-trail-down"><rect x="0" y={zero} width="100" height={100 - zero} /></clipPath>
          </defs>
          <path className="crs-trail-area is-up" d={area} clipPath="url(#crs-trail-up)" />
          <path className="crs-trail-area is-down" d={area} clipPath="url(#crs-trail-down)" />
          <line className="crs-trail-zero" x1="0" x2="100" y1={zero} y2={zero} />
          <path className="crs-trail-line" d={line} />
        </svg>
        {days.slice(1).map((d) => <i key={d.key} className="crs-trail-sep" style={{ left: `${(d.from / n) * 100}%` }} />)}
        {pts.slice(1).map((p, i) => (
          <span key={`${p.f.t}-${i}`} className={`crs-trail-dot is-${p.f.result}`} style={{ left: `${p.x}%`, top: `${y(p.v)}%` }}
            title={`${label[p.f.result] || t.draw} ${p.f.f}:${p.f.a}${p.f.opponent ? ` ${t.vs} ${p.f.opponent}` : ''} · ${t.groups[p.f.group] || ''} · ${when(p.f.t)}`} />
        ))}
        <span className={`crs-trail-end ${net >= 0 ? 'is-up' : 'is-down'}`} style={{ top: `${y(net)}%` }}>{net > 0 ? '+' : ''}{net}</span>
      </div>
      <div className="crs-trail-days">
        {days.map((d) => {
          const width = ((d.to - d.from + 1) / n) * 100;
          return (
            <span key={d.key} style={{ left: `${(d.from / n) * 100}%`, width: `${width}%` }} className={width < 12 ? 'is-narrow' : ''}>
              <small>{dayLabel(d.t)}</small>
              <b className="crs-num"><i className="is-win">{d.wins}</i>–<i className="is-loss">{d.losses}</i></b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Kopf einer Übersichtsseite im Stil des Spiels: Motiv aus dem Spiel, davor ein Abzeichen und der Titel in der
 * Spielschrift.
 * @param {string} art    Bild-Adresse des Motivs
 * @param {React.ReactNode} badge  Abzeichen links neben dem Titel
 */
export function Banner({ art, badge, title, sub, className = '', children }) {
  return (
    <header className={`cr-arcade-panel crs-banner cr-anim-rise ${className}`}>
      {art && <img className="crs-banner-art" src={art} alt="" draggable={false} />}
      <div className="crs-banner-body">
        {badge && <span className="crs-banner-badge">{badge}</span>}
        <div className="min-w-0">
          <h1 className="crs-banner-title">{title}</h1>
          {sub && <p className="crs-banner-sub">{sub}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

export function ClanBadge({ badgeId, size = 22 }) {
  const url = useClanBadgeUrl(badgeId);
  return url
    ? <img src={url} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} draggable={false} />
    : <span className="shrink-0 inline-block" style={{ width: size, height: size }} />;
}

export function PlayerLink({ tag, name, className = '' }) {
  const { q } = useScoutText();
  if (!tag) return <span className={className}>{name}</span>;
  return <Link to={`/clash/spieler/${tag}${q}`} className={`crs-link ${className}`}>{name || `#${tag}`}</Link>;
}

export function ClanLink({ clan, size = 20, className = '' }) {
  const { q } = useScoutText();
  if (!clan?.tag) return null;
  return (
    <Link to={`/clash/clan/${clan.tag}${q}`} className={`crs-link inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <ClanBadge badgeId={clan.badgeId} size={size} />
      <span className="truncate">{clan.name}</span>
    </Link>
  );
}

export function Panel({ title, sub, icon, action, children, className = '' }) {
  return (
    <section className={`cr-arcade-panel crs-panel ${className}`}>
      {title && (
        <div className="crs-panel-head">
          {icon}
          <div className="min-w-0 flex-1">
            <h2>{title}</h2>
            {sub && <p className="crs-panel-sub">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Gemerkte Spieler/Clans als Liste untereinander. */
function SavedList({ list, empty }) {
  const { q } = useScoutText();
  if (!list.length) return <p className="text-sm crs-muted leading-relaxed">{empty}</p>;
  return (
    <div className="crs-savedlist">
      {list.map((e) => (
        <Link key={`${e.kind}-${e.tag}`} to={`/clash/${e.kind === 'clan' ? 'clan' : 'spieler'}/${e.tag}${q}`}>
          {e.kind === 'clan' ? <ClanBadge badgeId={e.badgeId} size={26} /> : <CrUser size={24} />}
          <span className="min-w-0">
            <b>{e.name || `#${e.tag}`}</b>
            <small>{e.sub ? e.sub : `#${e.tag}`}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Favoriten bzw. zuletzt Angesehenes als Fläche: Seitenspalten der Startseite (ScoutHomePage) und Ränder aller
 * übrigen Stats-Seiten (ScoutFrame).
 * @param {'favorites'|'recent'} which
 */
export function SavedPanel({ which }) {
  const { t } = useScoutText();
  const { favorites, recent } = useSaved();
  return which === 'favorites'
    ? <Panel title={t.favorites} icon={<CrStar size={26} />}><SavedList list={favorites} empty={t.favoritesEmpty} /></Panel>
    : <Panel title={t.recent} icon={<CrClock size={26} />}><SavedList list={recent} empty={t.recentEmpty} /></Panel>;
}

export function Stat({ label, value, sub, icon }) {
  return (
    <div className="crs-well crs-stat">
      <div className="crs-stat-label">{label}</div>
      <div className="crs-stat-value crs-num">{icon}{value}</div>
      {sub && <div className="crs-stat-sub">{sub}</div>}
    </div>
  );
}

/** Zeile einer Zeilen-Liste (.crs-rows): Symbol, Bezeichnung (+ Nebenzeile), Wert rechts (+ Nebenzeile). */
export function Row({ icon, label, sub, value, valueSub }) {
  return (
    <div>
      {icon && <span className="shrink-0 flex w-8 justify-center">{icon}</span>}
      <span className="crs-row-label"><b>{label}</b>{sub}</span>
      <span className="crs-row-value">{value}{valueSub && <small>{valueSub}</small>}</span>
    </div>
  );
}

/** Kennzahl ohne Kasten (in .crs-figs): große Zahl, darunter die Bezeichnung. */
export function Fig({ value, label, icon, unit }) {
  return (
    <div className="crs-fig">
      <div className="crs-fig-value">{icon}{value}{unit && <small>{unit}</small>}</div>
      <div className="crs-fig-label">{label}</div>
    </div>
  );
}

/** Balken 0…1. color = Füllfarbe; split = Rest ist rot (Sieg/Niederlage). */
export function Bar({ value, color, split = false, className = '' }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`crs-bar${split ? ' crs-bar--split' : ''} ${className}`}>
      <i style={{ width: `${pct}%`, ...(color ? { '--crs-fill': color } : null) }} />
    </div>
  );
}

/** Verlaufslinie über Werte (ältester zuerst) mit Tiefst-, Höchst- und Endwert. */
export function Sparkline({ points }) {
  const { lang } = useScoutText();
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const y = (v) => 36 - ((v - min) / span) * 32;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <div>
      <svg className="crs-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <path className="crs-spark-area" d={`${path} L100,40 L0,40 Z`} />
        <path className="crs-spark-line" d={path} />
      </svg>
      <div className="flex justify-between text-xs crs-muted crs-num mt-1">
        <span>↓ {fmtNum(min, lang)}</span>
        <span className="font-cr text-base text-white">{fmtNum(last, lang)}</span>
        <span>↑ {fmtNum(max, lang)}</span>
      </div>
    </div>
  );
}

/** Zahl, die beim ersten Erscheinen hochzählt (aus, wenn Animationen abgeschaltet sind). */
export function CountUp({ value }) {
  const { lang } = useScoutText();
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const still = document.documentElement.dataset.crAnim === 'off' || document.documentElement.hasAttribute('data-low-gfx')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof value !== 'number' || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 650);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <span className="crs-num">{fmtNum(shown, lang)}</span>;
}

export function Seg({ options, value, onChange, className = '', label }) {
  return (
    <div className={`cr-seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Sortier-Auswahl mit Richtungs-Knopf. dir: 'desc' (größte zuerst) | 'asc'. */
export function SortControl({ options, value, dir, onChange, label }) {
  const { t } = useScoutText();
  return (
    <span className="crs-sort">
      <select className="crs-select" value={value} aria-label={label || t.sortBy} onChange={(e) => onChange(e.target.value, dir)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button type="button" onClick={() => onChange(value, dir === 'desc' ? 'asc' : 'desc')}
        title={dir === 'desc' ? t.sortDesc : t.sortAsc} aria-label={dir === 'desc' ? t.sortDesc : t.sortAsc}>
        {dir === 'desc' ? <ArrowDownWideNarrow size={18} /> : <ArrowUpNarrowWide size={18} />}
      </button>
    </span>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`cr-tabs max-w-full ${className}`} role="tablist">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} aria-label={label} onClick={() => onChange(id)}>
          {Icon && <Icon size={22} />}
          <span className="cr-tab-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

const icon = (src) => function ScoutIcon({ size = 18, className = '' }) {
  return <img src={src} alt="" draggable={false} className={`inline-block shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />;
};
/**
 * Siegesserie als Flamme mit der Zahl darin — nach dem Streak-Symbol, das Clash Royale früher hatte (goldene Flamme,
 * dunkle Kontur). Gezeichnet, weil es dazu keine Bilddatei gibt.
 * @param {number|null} n  Zahl in der Flamme (null = nur die Flamme)
 */
export function StreakFlame({ n = null, size = 42, className = '' }) {
  return (
    <span className={`crs-flame ${className}`} style={{ width: size, height: size * 1.18 }} aria-hidden="true">
      <svg viewBox="0 0 100 118">
        <path d="M55 5 C61 27 84 37 88 63 C92 93 73 114 50 114 C27 114 9 98 11 72 C12 56 21 46 30 37 C30 50 34 56 41 59 C38 40 44 22 55 5 Z"
          fill="#ffad1f" stroke="#4a2400" strokeWidth="6" strokeLinejoin="round" />
        <path d="M53 38 C57 53 72 62 72 81 C72 97 62 106 50 106 C37 106 28 97 28 84 C28 74 34 67 41 62 C41 71 44 76 48 78 C46 64 48 51 53 38 Z" fill="#ffd651" />
        <path d="M62 26 C68 36 76 44 78 56" fill="none" stroke="#fff3c4" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      </svg>
      {n !== null && <b>{n}</b>}
    </span>
  );
}

/** Symbole aus dem Spiel: Gold, Aufwert-Pfeil, Evo- und Helden-Splitter, Turm, Sternlevel (auch Sternpunkte), Banner, Sammlung. */
export const GoldCoin = icon(goldImg);
export const UpgradeArrow = icon(upgradeImg);
export const EvoShard = icon(evoShardImg);
export const HeroShard = icon(heroShardImg);
export const TowerIcon = icon(towerImg);
export const StarLevelIcon = icon(starLevelImg);
export const BannerIcon = icon(itemHeaderImg);
export const CollectionIcon = icon(royaleShuffleImg);
export const ClanWarIcon = icon(clanWarsImg);

/** Uhrzeit, ab der es weitergeht — mit „morgen“, wenn sie nicht mehr heute liegt */
function untilText(ms, lang, t) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(lang === 'en' ? 'en' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${t.limitTomorrow}, ${time}`;
}

/** Platzhalter beim Laden bzw. Fehlermeldung mit „Nochmal versuchen". children = Zusatz unter der Fehlermeldung. */
export function LoadState({ loading, error, onRetry, children }) {
  const { t, lang } = useScoutText();
  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t.loading}>
        <div className="crs-skel h-44" />
        <div className="grid md:grid-cols-2 gap-4"><div className="crs-skel h-56" /><div className="crs-skel h-56" /></div>
      </div>
    );
  }
  if (!error) return null;
  // Kontingent erschöpft: ehrlich sagen, ab wann es weitergeht, und ob eine Anmeldung mehr Spielraum gibt
  const limit = error === 'rateLimited' || error === 'dailyLimit' ? currentLimit() : null;
  return (
    <Panel className="text-center">
      <p className="crs-title text-xl mb-2">{t.err[error] || t.err.apiDown}</p>
      {limit && (
        <p className="text-sm crs-muted mb-2">
          {t.limitUntil(untilText(limit.until, lang, t))}{limit.login ? ` ${t.limitLogin}` : ''}
        </p>
      )}
      {children}
      {onRetry && error !== 'invalidTag' && error !== 'notFound' && (
        <button type="button" onClick={onRetry} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue mt-3"><RefreshCw size={15} /> {t.retry}</button>
      )}
    </Panel>
  );
}

export function RefreshButton({ onClick, busy }) {
  const { t } = useScoutText();
  return (
    <button type="button" onClick={onClick} title={t.refresh} aria-label={t.refresh} className="cr-chip flex items-center justify-center h-10 w-10 rounded-xl text-white">
      <RefreshCw size={17} className={busy ? 'crs-spin' : ''} />
    </button>
  );
}
