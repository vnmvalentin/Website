// Streamer, die die Clash-Royale-Minigames in ihrem Stream nutzen —
// Profilbild + Live-Punkt (Twitch Helix, serverseitig gecached).

import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

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
 */
export default function UsedByPanel({ t, bare = false }) {
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
    <div className={bare ? '' : 'panel-strong overflow-hidden'}>
      <div className={`flex items-center gap-2 ${bare ? 'mb-1' : 'px-5 py-4 border-b border-white/10'}`}>
        <Users size={14} className="text-violet-300" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-violet-300/80">{t.usedBy}</h2>
      </div>
      <ul className={`flex flex-col ${bare ? '' : 'p-2'}`}>
        {streamers.map(s => (
          <li key={s.login}>
            <a href={`https://twitch.tv/${s.login}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
              {s.avatar ? (
                <img src={s.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-xs font-bold shrink-0">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-white/80 hover:text-white transition-colors truncate flex-1">
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
