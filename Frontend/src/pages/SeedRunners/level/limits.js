// Grenzen für eigene Level. Der Server prüft jedes hochgeladene Level dagegen (level/validate.js),
// der Editor hält sich schon beim Bauen daran.
//
// 200 KB reichen rechnerisch nicht für die größte erlaubte Fläche: 1800 × 160 Kacheln sind allein als
// Text 288 KB. Die Grenze liegt deshalb bei 400 KB — sie schützt den Server vor riesigen Eingaben, die
// eigentliche Größenbegrenzung des Levels sind Breite, Höhe und Elementzahl.

export const DOC_VERSION = 1;

export const LIMITS = Object.freeze({
  minWidth: 12,
  // 1800 / 900 seit 27.09.2026: Lange Pfad-Level laufen in drei Etappen (~90 Züge) — mit 1200 / 600 wurden sie in der
  // Breite gequetscht und mussten Stacheln ausdünnen. Die Bytes (1800 × 160 Zeichen + Elemente) bleiben unter maxBytes.
  maxWidth: 1800,
  minHeight: 10,
  maxHeight: 160,
  maxElements: 900,
  maxBytes: 400_000,
  maxCheckpoints: 40,
  maxAnchors: 200,
  maxFinish: 20,
  // Metadaten
  nameMin: 3,
  nameMax: 40,
  descriptionMax: 500,
  maxTags: 5,
  tagMin: 2,
  tagMax: 20,
  // Mehr Fehlermeldungen als das sind für niemanden eine Hilfe
  maxErrors: 25,
});

/** Zeichen, die im Raster (`tiles`) eines Levels vorkommen dürfen */
export const TILE_CHARS = '.#IW><=SCGE';
