// ScoutSearch.jsx — ein Suchfeld für alles: Spielername (eigener Namens-Index), Clanname (API) oder #Tag.
// Vorschläge erscheinen beim Tippen; Pfeiltasten wählen, Enter öffnet. Mit onPick liefert das Feld den Treffer
// zurück, statt die Seite zu wechseln (Vergleich).
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CrSearch, CrTrophy, CrUser } from '../ui/CrIcons';
import { ClanBadge } from './parts';
import { parseTag, scoutGet } from './scoutApi';
import { fmtNum, useScoutText } from './scoutI18n';
import './scout.css';

/**
 * @param {boolean}  big          große Fassung (Startseite)
 * @param {boolean}  playersOnly  keine Clans vorschlagen
 * @param {Function} onPick       ({ kind, tag, name }) => void — statt zur Seite des Treffers zu wechseln
 */
export default function ScoutSearch({ big = false, playersOnly = false, onPick, autoFocus = false, placeholder }) {
  const { t, lang, q: langQ } = useScoutText();
  const navigate = useNavigate();
  const listId = useId();
  const boxRef = useRef(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState({ players: [], clans: [], forText: '' });
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);

  const query = text.trim();
  const tag = parseTag(query);

  useEffect(() => {
    if (query.length < 2) { setHits({ players: [], clans: [], forText: query }); setBusy(false); return undefined; }
    const ctrl = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      const res = await scoutGet(`/search?q=${encodeURIComponent(query)}${playersOnly ? '&clans=0' : ''}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setBusy(false);
      setHits(res.ok ? { players: res.players || [], clans: res.clans || [], forText: query } : { players: [], clans: [], forText: query });
    }, 320);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, playersOnly]);

  // Reihenfolge: bei „#…" zuerst der direkte Weg über den Tag, sonst zuerst die Namens-Treffer
  const items = useMemo(() => {
    const direct = tag ? [
      { kind: 'player', tag, name: '', direct: true },
      ...(playersOnly ? [] : [{ kind: 'clan', tag, name: '', direct: true }]),
    ] : [];
    const named = [
      ...hits.players.map((p) => ({ kind: 'player', tag: p.tag, name: p.name, trophies: p.trophies, clan: p.clan })),
      ...hits.clans.map((c) => ({ kind: 'clan', tag: c.tag, name: c.name, badgeId: c.badgeId, members: c.members, location: c.location?.name })),
    ];
    return query.startsWith('#') ? [...direct, ...named] : [...named, ...direct];
  }, [tag, hits, query, playersOnly]);

  useEffect(() => { setActive(0); }, [items.length, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (item) => {
    if (!item) return;
    setOpen(false);
    setText('');
    if (onPick) onPick(item);
    else navigate(`/clash/${item.kind === 'clan' ? 'clan' : 'spieler'}/${item.tag}${langQ}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active] || items[0]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const showList = open && query.length >= 2;
  const settled = !busy && hits.forText === query;
  let lastKind = null;

  return (
    <div ref={boxRef} className={`crs-search${big ? ' crs-search--big' : ''}`}>
      <span className="crs-search-icon"><CrSearch size={big ? 28 : 22} /></span>
      <input
        type="text" inputMode="search" autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus={autoFocus}
        className="crs-search-input" placeholder={placeholder || t.searchPh} aria-label={t.searchLabel}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      {showList && (
        <div id={listId} role="listbox" className="crs-suggest custom-scrollbar">
          {items.map((item, i) => {
            const head = !item.direct && item.kind !== lastKind ? (item.kind === 'player' ? t.players : t.clans) : null;
            if (!item.direct) lastKind = item.kind;
            return (
              <React.Fragment key={`${item.kind}-${item.tag}-${item.direct ? 'd' : 'n'}`}>
                {head && <div className="crs-suggest-head">{head}</div>}
                <button type="button" id={`${listId}-${i}`} role="option" aria-selected={i === active} className="crs-suggest-item"
                  onMouseEnter={() => setActive(i)} onClick={() => pick(item)}>
                  {item.kind === 'clan' ? <ClanBadge badgeId={item.badgeId} size={30} /> : <CrUser size={28} />}
                  <span className="min-w-0 flex-1">
                    {item.direct
                      ? <b>{item.kind === 'clan' ? t.openClanTag(item.tag) : t.openPlayerTag(item.tag)}</b>
                      : <><b className="block truncate">{item.name}</b>
                        <small className="truncate">#{item.tag}{item.kind === 'player' ? (item.clan ? ` · ${item.clan}` : '') : ` · ${t.members(item.members)}${item.location ? ` · ${item.location}` : ''}`}</small></>}
                  </span>
                  {item.kind === 'player' && item.trophies > 0 && (
                    <span className="flex items-center gap-1 font-cr text-sm text-white crs-num"><CrTrophy size={16} />{fmtNum(item.trophies, lang)}</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
          {!items.length && <div className="crs-empty">{settled ? t.noHits : t.searching}</div>}
        </div>
      )}
    </div>
  );
}
