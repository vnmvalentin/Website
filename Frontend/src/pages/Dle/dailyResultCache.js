// dailyResultCache.js — gemeinsamer localStorage-Cache für "heutiges Tagesergebnis bereits
// gespielt", pro Spiel getrennt. Ein Spiel schreibt hier nach einer erfolgreichen
// Tages-Einsendung hinein (siehe TempdlePage.jsx); der Hub (DleHubPage.jsx) liest nur lesend,
// um auf der Kachel "Heute gespielt: X/Y" anzuzeigen — deshalb ein gemeinsames Modul statt
// zweier leicht unterschiedlicher Implementierungen, die sonst leicht auseinanderdriften.
//
// todayDateKey() rechnet exakt wie Backend/dle/core/dailySeed.js (Kalendertag in
// Europe/Berlin, nicht UTC/Browser-Zeitzone) — nur so stimmt "heute" im Browser mit dem
// "heute" überein, das der Server beim Erzeugen der Tagesrunden verwendet hat. Browser
// unterstützen `timeZone` in Intl.DateTimeFormat überall dort, wo diese Seite läuft.
export function todayDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cacheKey(gameId, dateKey) {
  return `dle:${gameId}:result:${dateKey}`;
}

export function readCachedResult(gameId, dateKey) {
  try {
    const raw = localStorage.getItem(cacheKey(gameId, dateKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCachedResult(gameId, dateKey, data) {
  try {
    localStorage.setItem(cacheKey(gameId, dateKey), JSON.stringify(data));
  } catch {
    // Privater Modus o.ä. — betrifft nur den Komfort (Hub-Anzeige, "schon gespielt"-Erkennung),
    // nie die Funktion des Spiels selbst.
  }
}
