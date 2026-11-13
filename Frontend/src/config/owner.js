// owner.js — wer der Kanalbetreiber ist. Eine Stelle statt einer Kopie der Twitch-ID in jeder Seite.
// Das ist nur fürs Anzeigen (Menüpunkte, Admin-Knöpfe ausblenden). Geschützt wird auf dem Server
// (STREAMER_TWITCH_ID im Backend) — wer die ID hier fälscht, sieht höchstens leere Seiten.
export const STREAMER_ID = "160224748";

/** @param {{ id?: string|number }|null|undefined} user */
export function isOwner(user) {
  return !!user && String(user.id) === STREAMER_ID;
}
