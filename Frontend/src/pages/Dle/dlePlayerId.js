// dlePlayerId.js — stabile, anonyme Geräte-ID für die Tagesbestenliste.
//
// Erlaubt dem Backend zu erkennen "dieses Gerät hat heute in diesem Spiel schon
// mitgemacht", ohne einen Account zu verlangen (siehe dleRoutes.js-Kommentarkopf). Kein
// Bezug zur Person — reines Anti-Mehrfach-Einsendung, wie ein Session-Cookie.
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'dle:playerKey';
const NAME_KEY = 'dle:playerName';

export function getPlayerKey() {
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!key) {
      key = nanoid(21);
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    // Kein localStorage verfügbar (privater Modus) — pro Aufruf neue ID, die
    // Bestenliste funktioniert dann einfach nicht geräteübergreifend konsistent.
    return nanoid(21);
  }
}

export function getStoredPlayerName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignorieren — Name muss dann bei jedem Besuch neu eingegeben werden
  }
}
