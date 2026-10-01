// Streamer, die die Clash-Royale-Minigames in ihrem Stream nutzen —
// Profilbild + Live-Punkt (Twitch Helix, serverseitig gecached).

import React, { useEffect, useState } from 'react';
import { CrTv } from '../ui/CrIcons';

// Sichtbar bleiben, auch wenn /api/used-by nicht antwortet: die Namen sind statisch
// bekannt, nur Avatar und Live-Status kommen vom Server.
const USED_BY_FALLBACK = [
  { name: 'BigSpin', login: 'bigspincr', avatar: null, live: false },
  { name: 'xopxsam', login: 'xopxsam', avatar: null, live: false },
  { name: 'Zodiac_Cr', login: 'zodiac_cr', avatar: null, live: false },
  { name: 'Dooomcr', login: 'dooomcr', avatar: null, live: false },
  { name: 'Vinc', login: 'vinc', avatar: null, live: false },
  { name: 'Tryaz', login: 'tryaz', avatar: null, live: false },
  { name: 'Morten', login: 'mortenroyale', avatar: null, live: false },
];

const REFRESH_MS = 60000;

/**
 * @param {boolean} bare  true = ohne eigenen Rahmen. Gebraucht, seit die Liste innerhalb
 *                        des gemeinsamen Startseiten-Rahmens sitzt — ein Kasten im Kasten
 *                        war genau der Eindruck, der weg sollte.
 * @param {number} [maxListHeight]  Deckelt die Liste selbst (nicht den Header) mit eigenem
 *                        Scrollen — im Hauptmenü steht die Liste neben dem Karussell und
 *                        darf dessen Höhe nicht überragen, sonst zwingt eine wachsende
 *                        Streamer-Zahl die ganze Seite zum Scrollen. Ohne Angabe (Standard)
 *                        wächst die Liste wie bisher uneingeschränkt mit.
 */
export default function UsedByPanel({ t, bare = false, maxListHeight }) {
  const [streamers, setStreamers] = useState(USED_BY_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/used-by');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length) setStreamers(data);
      } catch {
        // Fallback-Liste bleibt sichtbar
      }
    };
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className={bare ? '' : 'cr-arcade-panel overflow-hidden'}>
      <div className={`${bare ? 'mb-1' : 'cr-section !py-3'}`}>
        <h2 className="cr-section-title"><CrTv size={24} />{t.usedBy}</h2>
      </div>
      <ul className={`flex flex-col ${bare ? '' : 'cr-section--rule p-1.5'} ${maxListHeight ? 'overflow-y-auto custom-scrollbar' : ''}`}
        style={maxListHeight ? { maxHeight: maxListHeight } : undefined}>
        {streamers.map(s => (
          <li key={s.login}>
            <a href={`https://twitch.tv/${s.login}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
              {s.avatar ? (
                <img src={s.avatar} alt="" className="cr-avatar w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <span className="cr-avatar w-8 h-8 rounded-full flex items-center justify-center text-white/70 font-cr text-sm shrink-0">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-white/85 hover:text-white transition-colors truncate flex-1">
                {s.name}
              </span>
              {s.live ? (
                <span className="flex items-center gap-1.5 shrink-0" title="Live">
                  <span className="text-[9px] font-bold text-red-500 tracking-wider">LIVE</span>
                  <span className="relative w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping" />
                    <span className="absolute inset-0 rounded-full bg-red-500" />
                  </span>
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-white/15 shrink-0" title="Offline" />
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
