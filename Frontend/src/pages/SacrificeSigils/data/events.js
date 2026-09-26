// data/events.js — seltene Ereignisse der Pfad-Phase. Texte in i18n/de.js (events.<id>), Logik in engine/path.js.
export const EVENTS = [
  "faehrmann",
  "tintenwitwe",
  "knochenorakel",
  "spiegelbrunnen",
  "wachszieher",
  "mondfinsternis",
  "gluecksspieler",
  "stammestreue",
];

/** Knotentypen der Pfad-Phase und ihre Grundgewichte. */
export const NODE_TYPES = [
  ["cardChoice", 30],
  ["campfire", 12],
  ["merchant", 10],
  ["transfer", 9],
  ["fuse", 8],
  ["remove", 8],
  ["shrine", 8],
  ["copyist", 7],
  ["event", 8],
];

export const MIN_DECK = 8;
export const CAMPFIRE_RISK = [0, 0.2, 0.45, 0.7];
