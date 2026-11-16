// StatsBackdrop.jsx — wechselnder Hintergrund der Stats-Seiten unter /clash (ScoutFrame.jsx), solange die Einstellung
// statsBgRotate an ist (ui/crPrefs.js). Beim Aufruf der Seite ein zufälliges Bild (nie dasselbe wie beim letzten
// Besuch), danach alle INTERVAL_MS das nächste aus einem gemischten Stapel — erst wenn alle einmal dran waren, wird neu
// gemischt. Das nächste Bild wird vorher geladen und dann weich übergeblendet.
//
// Jede Stats-Seite hängt ihren eigenen ScoutFrame ein. Der Stand liegt deshalb auf Modulebene: beim Wechsel
// Spieler → Rangliste bleibt das Bild stehen und der Takt läuft weiter, statt bei jedem Klick neu zu würfeln.
// Liegt in ScoutFrame HINTER dem scrollenden Behälter (absolute, volle Fläche) statt darin — sonst bliebe die Rinne
// der Scrollleiste im Karo des Behälters stehen.
import React, { useEffect, useState } from 'react';
import { BACKGROUNDS } from '../ui/crPrefs';

const INTERVAL_MS = 45_000;
const FADE_MS = 1400;
const LAST_KEY = 'crStatsBgLast';

// Modulstand: aktuelles Bild, Rest des Stapels, Zeitpunkt des letzten Wechsels
let current = null;
let deck = [];
let lastSwitch = 0;

function shuffled(ids, avoidFirst) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Kein Doppel direkt an der Stapelgrenze
  if (a.length > 1 && a[0] === avoidFirst) a.push(a.shift());
  return a;
}

function nextId() {
  if (!deck.length) deck = shuffled(BACKGROUNDS.map((b) => b.id), current);
  return deck.shift();
}

function firstId() {
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* egal */ }
  deck = shuffled(BACKGROUNDS.map((b) => b.id), last);
  return deck.shift();
}

function remember(id) {
  try { localStorage.setItem(LAST_KEY, id); } catch { /* Komfort */ }
}

const urlOf = (id) => BACKGROUNDS.find((b) => b.id === id)?.url || null;

/** Fester Hintergrund der Stats-Seiten — gleiche Ebene, Abdunklung und Lage wie der wechselnde (ScoutFrame) */
export function StaticBackdrop({ url }) {
  return (
    <div className="crs-rotbg" aria-hidden="true">
      <div className="crs-rotbg__img" style={{ backgroundImage: `url("${url}")`, opacity: 1 }} />
      <div className="crs-rotbg__shade" />
    </div>
  );
}

/** @param {boolean} animate  Übergänge und Takt an (Animations-Schalter); aus = nur beim Aufruf ein neues Bild */
export default function StatsBackdrop({ animate = true }) {
  if (!current) {
    current = firstId();
    lastSwitch = Date.now();
    remember(current);
  }
  // Zwei Ebenen: die sichtbare (front) und die, in die das nächste Bild geladen wird
  const [layers, setLayers] = useState({ a: current, b: null, front: 'a' });

  useEffect(() => {
    if (!animate || BACKGROUNDS.length < 2) return undefined;
    let cancelled = false;
    let timer;
    const schedule = () => {
      const wait = Math.max(1000, INTERVAL_MS - (Date.now() - lastSwitch));
      timer = setTimeout(step, wait);
    };
    const step = () => {
      // Im Hintergrund-Tab nicht wechseln — sonst sieht man die Bilder nie
      if (document.hidden) { lastSwitch = Date.now(); schedule(); return; }
      const id = nextId();
      const url = urlOf(id);
      if (!url) { schedule(); return; }
      const img = new Image();
      const show = () => {
        if (cancelled) return;
        current = id;
        lastSwitch = Date.now();
        remember(id);
        setLayers((l) => (l.front === 'a' ? { ...l, b: id, front: 'b' } : { ...l, a: id, front: 'a' }));
        schedule();
      };
      img.onload = show;
      img.onerror = () => { if (!cancelled) { lastSwitch = Date.now(); schedule(); } };
      img.src = url;
    };
    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [animate]);

  const layer = (key) => {
    const url = urlOf(layers[key]);
    return (
      <div className="crs-rotbg__img"
        style={{
          backgroundImage: url ? `url("${url}")` : undefined,
          opacity: layers.front === key ? 1 : 0,
          transitionDuration: animate ? `${FADE_MS}ms` : '0ms',
        }} />
    );
  };

  return (
    <div className="crs-rotbg" aria-hidden="true">
      {layer('a')}
      {layer('b')}
      <div className="crs-rotbg__shade" />
    </div>
  );
}
