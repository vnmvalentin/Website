// useFavoriten.js — Favorit und Sterne-Schnitt für eine ganze Liste von Leveln (Verlauf, Tagesarchiv). Anders als RateBox, das je
// Level eine Anfrage schickt, fragt das hier in Paketen zu LOOKUP_MAX (so viele beantwortet der Server auf einmal,
// Backend levelService.js) und hält den Stand für die ganze Liste.
import { useCallback, useEffect, useState } from 'react';
import { lookupRatings, setFavorite } from '../levels/levelsApi.js';
import { refKey } from './levelRef.js';

const LOOKUP_MAX = 50;

/**
 * @param refs  Level-Referenzen (ui/levelRef.js); die Liste darf sich ändern, abgefragt wird nur, was noch fehlt
 * @returns {{ status: Map<string, { favorite: boolean, rating: object|null }>, toggle: (ref, info?) => Promise<string|null> }}
 *   toggle liefert bei einem Fehler den Grund, sonst null
 */
export function useFavoriten(refs) {
  const [status, setStatus] = useState(() => new Map());
  const keys = refs.map(refKey).join('|');

  useEffect(() => {
    const offen = refs.filter((r) => r && !status.has(refKey(r)));
    if (!offen.length) return undefined;
    let alive = true;
    (async () => {
      for (let i = 0; i < offen.length; i += LOOKUP_MAX) {
        const paket = offen.slice(i, i + LOOKUP_MAX);
        const items = await lookupRatings(paket);
        if (!alive) return;
        const byKey = new Map(items.map((it) => [it.key || refKey(it.ref), it]));
        setStatus((alt) => {
          const neu = new Map(alt);
          for (const r of paket) {
            const it = byKey.get(refKey(r));
            neu.set(refKey(r), { favorite: !!it?.favorite, rating: it?.rating || null });
          }
          return neu;
        });
      }
    })();
    return () => { alive = false; };
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async (ref, info) => {
    const key = refKey(ref);
    const vorher = status.get(key);
    const on = !vorher?.favorite;
    setStatus((alt) => new Map(alt).set(key, { rating: vorher?.rating || null, favorite: on }));   // sofort zeigen
    const res = await setFavorite(ref, on, ref.kind === 'pfad' ? info : undefined);
    if (res.status === 'ok') return null;
    setStatus((alt) => new Map(alt).set(key, { rating: vorher?.rating || null, favorite: !on }));
    return res.reason || 'Das hat nicht geklappt.';
  }, [status]);

  return { status, toggle };
}
