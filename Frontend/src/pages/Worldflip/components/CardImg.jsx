// components/CardImg.jsx — eine Worldflip-Karte als Bild (Menü, Regeln). Gemalt von scene/cardArt.js, dieselbe
// Vorlage wie die Karten am 3D-Tisch.
import React, { useEffect, useState } from "react";
import { cardCanvas, cardKey } from "../scene/cardArt.js";
import { KINDS, WORLDS } from "../engine/index.js";

const urls = new Map();

function urlOf(card) {
  const key = cardKey(card);
  if (!urls.has(key)) urls.set(key, cardCanvas(card).toDataURL("image/png"));
  return urls.get(key);
}

function cardLabel(card) {
  if (!card) return "Kartenrückseite";
  const kind = card.k === "n" ? String(card.n) : KINDS[card.k].name;
  return card.w < 0 ? kind : `${WORLDS[card.w].name} ${kind}`;
}

/** @param {{ card: {w: number, k: string, n?: number} | null, className?: string, style?: object }} props */
export default function CardImg({ card, className = "", style }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    // erst malen, wenn die Spielschrift da ist (sonst steht die Zahl in der Ersatzschrift auf der Karte)
    const ready = document.fonts?.load ? document.fonts.load('900 100px "Rubik"').catch(() => {}) : Promise.resolve();
    Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => alive && setSrc(urlOf(card)));
    return () => {
      alive = false;
    };
  }, [card]);
  return src
    ? <img src={src} alt={cardLabel(card)} className={`wf-cardimg ${className}`} style={style} draggable={false} />
    : <span className={`wf-cardimg ${className}`} style={style} aria-hidden="true" />;
}
