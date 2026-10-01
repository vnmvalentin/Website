// Emotes der CR-Minigames (Lobby + Spiel).
//
// Quelle: animierte GIFs in src/assets/clashRoyale/emotes/ (480 px, zusammen ~27 MB — werden
// NICHT gebaut). Daraus erzeugt (sharp-Skript im Scratchpad, siehe Memory
// project_cr_prefs_sound_cards):
//   anim/<id>.webp   animiertes WebP, 192 px, für die Anzeige am Rand
//   still/<id>.webp  Standbild, 128 px, für die Auswahl — der Frame mit dem meisten Inhalt,
//                    weil Frame 0 bei vielen Emotes (GG, Grrr, King Scream …) leer ist
// Beide sind auf den über ALLE Frames vereinigten Inhalt zugeschnitten und quadratisch
// zentriert, damit jedes Emote ähnlich groß wirkt.
//
// Die IDs müssen mit EMOTE_IDS in Backend/clashRoyale/routes/clashRoyaleRoutes.js
// übereinstimmen — der Server leitet nur bekannte IDs weiter.

const ANIM = import.meta.glob('/src/assets/clashRoyale/emotes/anim/*.webp', { eager: true, query: '?url', import: 'default' });
const STILL = import.meta.glob('/src/assets/clashRoyale/emotes/still/*.webp', { eager: true, query: '?url', import: 'default' });
const idOf = (p) => p.split('/').pop().replace(/\.webp$/, '');

export const EMOTES = Object.entries(STILL)
  .map(([p, still]) => {
    const id = idOf(p);
    const anim = ANIM[`/src/assets/clashRoyale/emotes/anim/${id}.webp`] || still;
    return { id, still, anim };
  })
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

/** Animierte Fassung für die Anzeige am Rand */
export const emoteAnim = (id) => EMOTES.find(e => e.id === id)?.anim || null;

/** Wie lange ein gesendetes Emote am Rand stehen bleibt (inkl. Aus-Animation) */
export const EMOTE_SHOW_MS = 3200;
