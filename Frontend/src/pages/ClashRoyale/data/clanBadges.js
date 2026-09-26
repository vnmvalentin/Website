// Clan-Abzeichen (Clan-Header-Zusatz im Win-Tracker, siehe show_clan in crWinTrackerRoutes.js).
// Lokal gebündelt statt live von cdn.royaleapi.com — dieselbe Quelle wie die Liga-Embleme in
// leagueIcons.js: RoyaleAPIs cr-api-assets-Repo (github.com/royaleapi/cr-api-assets/badges/),
// dessen README ausdrücklich zum Klonen statt Live-Einbinden auffordert. Die offizielle API
// liefert bei clan.badgeId nur eine Zahl, keine Bild-URL (anders als bei Karten, siehe cards.js/
// cardIconUrls.json) — die Zahl->Name-Zuordnung kommt aus RoyaleAPIs cr-api-data-Repo
// (docs/json/alliance_badges.json, empirisch gegen echte badgeId-Werte verifiziert), auf 96px
// Höhe verkleinert und als WebP komprimiert.
//
// BEWUSST NICHT eager geladen: bei 180 Abzeichen (roh ~800KB, als Base64 in einem eager-Bundle
// noch mehr) würde JEDER Aufruf der WinTracker-Seite/des Overlays alle 180 laden, obwohl zur
// selben Zeit höchstens EINES gebraucht wird (der Clan des aktiven Accounts). import.meta.glob
// ohne eager liefert stattdessen pro Datei eine eigene Lade-Funktion — Vite schneidet daraus 180
// winzige eigene Chunks, geladen wird nur der eine, der wirklich gebraucht wird.
import { useEffect, useState } from 'react';
import CLAN_BADGE_ID_TO_NAME from './clanBadgeMap.json';

const _badgeGlob = import.meta.glob('/src/assets/clashRoyale/clanBadges/*.webp');
const NAME_TO_LOADER = Object.fromEntries(
  Object.entries(_badgeGlob).map(([p, loader]) => [p.split('/').pop().replace(/\.webp$/, ''), loader])
);

const urlCache = new Map();

/** Lädt (und cached) die Abzeichen-Bild-URL für eine badgeId aus der API. null bei fehlender
 *  Zuordnung. Async, weil die eigentliche Bild-Datei erst bei Bedarf nachgeladen wird — siehe
 *  useClanBadgeUrl unten für die React-Hook-Variante. */
export async function loadClanBadgeUrl(badgeId) {
  if (badgeId === null || badgeId === undefined) return null;
  const name = CLAN_BADGE_ID_TO_NAME[String(badgeId)];
  if (!name) return null;
  if (urlCache.has(name)) return urlCache.get(name);
  const loader = NAME_TO_LOADER[name];
  if (!loader) return null;
  const mod = await loader();
  urlCache.set(name, mod.default);
  return mod.default;
}

/** React-Hook-Variante von loadClanBadgeUrl — null solange noch nichts (oder das Falsche) geladen
 *  ist. Bereits gecachte Abzeichen (urlCache) lösen synchron beim ersten Render auf, kein
 *  sichtbares Aufblitzen von "kein Bild" beim Seitenwechsel zurück zu einem schon gesehenen Clan. */
export function useClanBadgeUrl(badgeId) {
  const cachedName = badgeId === null || badgeId === undefined ? null : CLAN_BADGE_ID_TO_NAME[String(badgeId)];
  const [url, setUrl] = useState(cachedName ? urlCache.get(cachedName) ?? null : null);

  useEffect(() => {
    let alive = true;
    loadClanBadgeUrl(badgeId).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [badgeId]);

  return url;
}
