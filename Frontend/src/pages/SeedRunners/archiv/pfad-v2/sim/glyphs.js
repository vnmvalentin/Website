// Die Zeichen des ASCII-Formats an EINER Stelle: Karten-Parser, Chunk-Templates und Renderer
// lesen alle hier nach, was ein Zeichen bedeutet. Ein neues Element braucht also einen Eintrag
// hier, ein Modul unter sim/elements/ und ggf. eine Zeichenroutine im Client.
//
// Drei Arten von Zeichen:
//   Kacheln     verändern das Raster selbst (fest, Eis, klebrig, Förderband, Einweg)
//   Elemente    stehen auf einer Kachel, das Raster darunter bleibt Luft
//   Sonderzeichen  Start, Checkpoint, Ziel, Anker, Warp-Marken (siehe tilemap.js)
//
// Elemente mit Parametern (Sägen, Laser, bewegte Plattformen …) stehen im Raster als KLEINBUCH-
// STABE und werden in den `markers` des Templates beschrieben: `{ a: { type: 'laser', dir: 'right' } }`.
// So bleibt das Raster lesbar, und dieselbe Form trägt Zufallsbereiche für Variationen.

/** Art einer Kachel im Raster (map.kind) */
export const KIND = Object.freeze({
  AIR: 0,
  SOLID: 1,
  ICE: 2,
  STICKY: 3,
  CONVEYOR_R: 4,
  CONVEYOR_L: 5,
  ONEWAY: 6,
});

/** Kacheln, gegen die man voll läuft. Einweg-Plattformen sind es bewusst NICHT. */
export const isSolidKind = (kind) => kind >= KIND.SOLID && kind <= KIND.CONVEYOR_L;

export const TILE_GLYPHS = Object.freeze({
  '#': KIND.SOLID,
  I: KIND.ICE,
  W: KIND.STICKY,
  '>': KIND.CONVEYOR_R,
  '<': KIND.CONVEYOR_L,
  '=': KIND.ONEWAY,
});

// Elemente, die per Zeichen mit Standardwerten entstehen (Parameter überschreibt man über einen
// Kleinbuchstaben-Marker). `params` werden in die Spezifikation des Elements übernommen.
export const ELEMENT_GLYPHS = Object.freeze({
  '^': { type: 'spike' },
  '~': { type: 'crumble' },
  F: { type: 'fallingBlock' },
  P: { type: 'spring' },
  O: { type: 'ring', params: { dir: 'right' } },
  D: { type: 'crystal' },
  T: { type: 'switch' },
  R: { type: 'colorBlock', params: { channel: 0, solidWhen: 0 } },
  B: { type: 'colorBlock', params: { channel: 0, solidWhen: 1 } },
  K: { type: 'key' },
  Y: { type: 'door' },
});

// Elemente, deren Kachel im Raster fest ist (der Laser sitzt in einem Block)
export const ELEMENT_TILE = Object.freeze({
  laser: KIND.SOLID,
});

// Alles, was sonst als Zeichen vorkommen darf
export const SPECIAL_GLYPHS = '.SCGE123456789';
