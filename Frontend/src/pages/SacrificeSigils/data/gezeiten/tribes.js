// data/gezeiten/tribes.js — die Stämme des Gezeiten-Zirkels. Namen/Identitätstexte in i18n/de.js (tribes.<id>).
// Gleiche Struktur wie data/tribes.js; `neutral` markiert den stammlosen Stamm (bekommt keinen Stammkopf im Draft).

export const GEZEITEN_TRIBES = [
  { id: "muschelvolk", zirkel: "gezeiten", color: "#c9b48a", silhouettes: ["shell"], preferred: ["salt"] },
  { id: "ertrunkene", zirkel: "gezeiten", color: "#7f9aa3", silhouettes: ["skeleton"], preferred: ["bones"] },
  { id: "tangwesen", zirkel: "gezeiten", color: "#7d8a44", silhouettes: ["root"], preferred: ["salt"] },
  { id: "moewen", zirkel: "gezeiten", color: "#d8d4c8", silhouettes: ["bird"], preferred: ["blood"] },
  { id: "waerter", zirkel: "gezeiten", color: "#e0a84a", silhouettes: ["candle"], preferred: ["salt"] },
  { id: "scherenvolk", zirkel: "gezeiten", color: "#b0532e", silhouettes: ["fish"], preferred: ["blood"] },
  { id: "quallen", zirkel: "gezeiten", color: "#a78bc9", silhouettes: ["fish"], preferred: ["salt"] },
  { id: "robben", zirkel: "gezeiten", color: "#8d8378", silhouettes: ["seal"], preferred: ["blood"] },
  { id: "raubfische", zirkel: "gezeiten", color: "#4d6b7a", silhouettes: ["fish"], preferred: ["blood"] },
  { id: "tiefseeleuchter", zirkel: "gezeiten", color: "#3fa39a", silhouettes: ["fish"], preferred: ["bones"] },
  { id: "schnecken", zirkel: "gezeiten", color: "#9c8466", silhouettes: ["shell"], preferred: ["bones"] },
  { id: "korallen", zirkel: "gezeiten", color: "#d06a6a", silhouettes: ["coral"], preferred: ["salt"] },
  { id: "wracks", zirkel: "gezeiten", color: "#7a6048", silhouettes: ["construct"], preferred: ["bones"] },
  { id: "treibgut", zirkel: "gezeiten", color: "#8e8a80", silhouettes: ["construct"], preferred: ["blood", "bones", "salt"], neutral: true },
];
