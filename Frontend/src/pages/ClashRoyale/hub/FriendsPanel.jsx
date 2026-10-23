// Freundesliste im Hauptmenü — rechte Spalte, gegenüber von "Benutzt von" (UsedByPanel.jsx).
//
// Aufbau: oben das eigene Profil mit Status, darunter zwei Reiter (Freunde | Anfragen) im
// CR-Reiterlook (.cr-tabs), ganz unten ein grüner "Freund hinzufügen"-Knopf, der das
// Eingabefeld aufklappt. Freunde sind nach Status gruppiert (in einer Lobby, online, offline).
// Wer in einer offenen Lobby sitzt, bekommt einen "Beitreten"-Knopf — ohne Code, der Server
// gibt ihn nur an Freunde und nur für beitretbare Lobbys heraus.
//
// Daten und Aktionen kommen aus useFriends.js. Ohne Twitch-Login nur ein Hinweis mit Login-Knopf.
import React, { useState } from 'react';
import { Check, X, UserMinus, UserPlus, Send } from 'lucide-react';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import PlayerAvatar from '../components/PlayerAvatar';
import ChunkyButton from '../ui/ChunkyButton';
import { CrFriends } from '../ui/CrIcons';
import { modeNameFor } from '../modesConfig';
import { friendsDict } from './friendsI18n';

const DOT_COLOR = {
  online: '#34c759',
  lobby: '#4aa8ff',
  game: 'var(--cr-arcade-gold)',
  offline: '#5b6b80',
};

/** Avatar mit Status-Punkt unten rechts. */
function StatusAvatar({ person, size = 34 }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <PlayerAvatar avatarId={person.avatarId} avatarUrl={person.avatarUrl} size={size}
        className={person.status === 'offline' ? 'opacity-60' : ''} />
      <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-[#0e2240]"
        style={{ background: DOT_COLOR[person.status] || DOT_COLOR.offline }} />
    </span>
  );
}

/** Zweite Zeile unter dem Namen: Status, bei Lobbys zusätzlich Modus und Belegung. */
function statusLine(f, ft, lang) {
  if (f.status === 'online') return ft.statusOnline;
  if (f.status === 'offline') return ft.statusOffline;
  const l = f.lobby;
  if (!l) return f.status === 'game' ? ft.statusGame : ft.statusLobby;
  if (l.tournament) return ft.statusTournament;
  const base = `${f.status === 'game' ? ft.statusGame : ft.statusLobby} · ${modeNameFor(l.mode, lang)}`;
  if (f.status === 'game') return base;
  const extra = l.playerCount >= l.maxPlayers ? ` · ${ft.full}` : !l.joinable ? ` · ${ft.locked}` : '';
  return `${base} · ${l.playerCount}/${l.maxPlayers}${extra}`;
}

function FriendRow({ f, ft, lang, onJoin, onRemove }) {
  const color = f.status === 'offline' ? 'text-white/35' : f.status === 'online' ? 'text-emerald-300/80'
    : f.status === 'game' ? 'text-[var(--cr-arcade-gold)]' : 'text-sky-300';
  return (
    <li className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
      <StatusAvatar person={f} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${f.status === 'offline' ? 'text-white/55' : 'text-white/90'}`}>{f.name}</p>
        <p className={`text-[11px] leading-tight truncate ${color}`} title={statusLine(f, ft, lang)}>{statusLine(f, ft, lang)}</p>
      </div>
      {f.lobby?.joinable && f.lobby.code ? (
        <ChunkyButton variant="green" size="sm" className="shrink-0 !px-2.5" title={ft.joinTitle(f.name)}
          onClick={() => onJoin(f.lobby.code)}>
          {ft.join}
        </ChunkyButton>
      ) : (
        // Auf Touch-Geräten (Liste steht dort unter dem Menü) gibt es kein Hover — deshalb dort immer sichtbar
        <button type="button" onClick={() => onRemove(f)} title={ft.remove} aria-label={`${ft.remove}: ${f.name}`}
          className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-red-300 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100">
          <UserMinus size={14} />
        </button>
      )}
    </li>
  );
}

function RequestRow({ person, children }) {
  return (
    <li className="flex items-center gap-2.5 px-2 py-1.5">
      <PlayerAvatar avatarId={person.avatarId} avatarUrl={person.avatarUrl} size={30} />
      <span className="min-w-0 flex-1 text-sm font-semibold text-white/85 truncate">{person.name}</span>
      <span className="flex items-center gap-1.5 shrink-0">{children}</span>
    </li>
  );
}

/** Kleine Zahl im Reiter (rot bei offenen Anfragen, sonst gedämpft). */
function TabCount({ n, alert = false }) {
  if (alert) {
    return (
      <span className="min-w-[18px] h-[18px] px-1 rounded-[4px] bg-[var(--cr-arcade-red,#e5484d)] text-white text-[11px] font-bold leading-[18px] text-center tabular-nums">
        {n}
      </span>
    );
  }
  return <span className="text-white/45 text-sm tabular-nums">{n}</span>;
}

/**
 * @param {object}   friends   Ergebnis von useFriends()
 * @param {object}   user      Twitch-Nutzer oder null
 * @param {Function} login     Twitch-Login starten
 * @param {Function} onJoin    einer Lobby per Code beitreten
 * @param {number}   [maxListHeight]  Höhe der Liste deckeln (eigenes Scrollen)
 */
export default function FriendsPanel({ lang, friends, user, login, onJoin, maxListHeight }) {
  const ft = friendsDict(lang);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests'
  const [adding, setAdding] = useState(false);
  const state = friends.state;

  const flash = (ok, text) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(n => (n?.text === text ? null : n)), 3500);
  };
  const errorText = (key) => ft.errors[key] || ft.errors.friendServerError;

  const submit = async () => {
    const login = name.trim().replace(/^@/, '');
    if (!login || busy) return;
    setBusy(true);
    const res = await friends.sendRequest(login);
    setBusy(false);
    if (!res.ok) return flash(false, errorText(res.key));
    setName('');
    setAdding(false);
    flash(true, res.accepted ? ft.nowFriends(login) : ft.requestSent(login));
  };

  const act = async (fn, id) => {
    const res = await fn(id);
    if (!res.ok) flash(false, errorText(res.key));
  };

  const remove = (f) => {
    if (window.confirm(ft.removeConfirm(f.name))) act(friends.remove, f.id);
  };

  const header = (right) => (
    <div className="cr-section !py-3 flex items-center justify-between gap-2">
      <h2 className="cr-section-title"><CrFriends size={24} />{ft.title}</h2>
      {right}
    </div>
  );

  // ── Ohne Twitch (oder abgelaufene Sitzung): nur Hinweis ───────────────────────
  if (!user || state?.loggedIn === false) {
    return (
      <div className="cr-arcade-panel overflow-hidden">
        {header(null)}
        <div className="cr-section--rule p-4 space-y-3">
          <p className="text-white/55 text-xs leading-relaxed">{ft.loginHint}</p>
          <ChunkyButton size="sm" block onClick={() => login(false)}>
            <TwitchGlyph size={14} />
            {ft.loginBtn}
          </ChunkyButton>
        </div>
      </div>
    );
  }

  const me = state?.me;
  const list = state?.friends || [];
  const incoming = state?.incoming || [];
  const outgoing = state?.outgoing || [];
  const groups = [
    { key: 'lobby', label: ft.groupLobby, items: list.filter(f => f.status === 'lobby' || f.status === 'game') },
    { key: 'online', label: ft.groupOnline, items: list.filter(f => f.status === 'online') },
    { key: 'offline', label: ft.groupOffline, items: list.filter(f => f.status === 'offline') },
  ].filter(g => g.items.length);
  const onlineCount = list.length - (groups.find(g => g.key === 'offline')?.items.length || 0);
  const scrollProps = maxListHeight
    ? { className: 'overflow-y-auto custom-scrollbar', style: { maxHeight: maxListHeight } }
    : {};

  return (
    <div className="cr-arcade-panel overflow-hidden">
      {header(
        <span className="text-white/45 text-xs tabular-nums">{onlineCount}/{list.length}</span>
      )}

      {/* ── Eigenes Profil ─────────────────────────────────────────────────── */}
      {me && (
        <div className="cr-section--rule px-3 py-3 flex items-center gap-2.5">
          <StatusAvatar person={me} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-cr text-[15px] text-white truncate">{me.name}</p>
            <p className="text-[11px] text-white/45 truncate">
              {me.login ? `@${me.login}` : ''}{me.login ? ' · ' : ''}
              {me.status === 'game' ? ft.statusGame : me.status === 'lobby' ? ft.statusLobby : ft.statusOnline}
            </p>
          </div>
        </div>
      )}

      {/* ── Reiter: Freunde | Anfragen ─────────────────────────────────────── */}
      <div className="cr-section--rule px-2.5 pt-2.5">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}
            className="!px-2 !py-1.5 !text-[15px] !flex-1">
            {ft.title} <TabCount n={list.length} />
          </button>
          <button type="button" role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}
            className="!px-2 !py-1.5 !text-[15px] !flex-1">
            {ft.inbox} {incoming.length > 0 ? <TabCount n={incoming.length} alert /> : <TabCount n={outgoing.length} />}
          </button>
        </div>
      </div>

      {/* ── Inhalt des Reiters ─────────────────────────────────────────────── */}
      <div role="tabpanel" {...scrollProps}>
        {tab === 'friends' ? (
          <div className="p-1.5">
            {state && list.length === 0 && (
              <p className="text-white/40 text-xs leading-relaxed px-2 py-2">{ft.empty}</p>
            )}
            {groups.map(g => (
              <div key={g.key} className="mb-1 last:mb-0">
                <p className="cr-eyebrow px-2 pt-1.5 pb-0.5">{g.label} <span className="tabular-nums">({g.items.length})</span></p>
                <ul>
                  {g.items.map(f => (
                    <FriendRow key={f.id} f={f} ft={ft} lang={lang} onJoin={onJoin} onRemove={remove} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-1.5">
            {incoming.length === 0 && outgoing.length === 0 && (
              <p className="text-white/40 text-xs px-2 py-2">{ft.inboxEmpty}</p>
            )}
            {incoming.length > 0 && (
              <>
                <p className="cr-eyebrow px-2 pt-1.5 pb-0.5">{ft.incoming}</p>
                <ul>
                  {incoming.map(p => (
                    <RequestRow key={p.id} person={p}>
                      <button type="button" onClick={() => act(friends.accept, p.id)} title={ft.accept} aria-label={ft.accept}
                        className="cr-arcade-icon-btn w-8 h-8 !text-emerald-300"><Check size={15} /></button>
                      <button type="button" onClick={() => act(friends.decline, p.id)} title={ft.decline} aria-label={ft.decline}
                        className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-8 h-8"><X size={15} /></button>
                    </RequestRow>
                  ))}
                </ul>
              </>
            )}
            {outgoing.length > 0 && (
              <>
                <p className="cr-eyebrow px-2 pt-2 pb-0.5">{ft.outgoing}</p>
                <ul>
                  {outgoing.map(p => (
                    <RequestRow key={p.id} person={p}>
                      <button type="button" onClick={() => act(friends.cancel, p.id)} title={ft.cancel} aria-label={ft.cancel}
                        className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-8 h-8"><X size={15} /></button>
                    </RequestRow>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Freund hinzufügen: grüner CR-Knopf, klappt das Eingabefeld auf ──── */}
      <div className="cr-section--rule px-3 py-3 space-y-2">
        {adding ? (
          <div className="flex items-stretch gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') { setAdding(false); setName(''); }
              }}
              placeholder={ft.addPlaceholder}
              maxLength={26}
              aria-label={ft.addBtn}
              className="cr-input min-w-0 flex-1 px-3 py-2 text-sm"
            />
            <ChunkyButton variant="green" size="sm" className="shrink-0 !px-3" icon={Send}
              onClick={submit} disabled={busy || !name.trim()} title={ft.addAria} aria-label={ft.addAria} />
            <button type="button" onClick={() => { setAdding(false); setName(''); }}
              title={ft.cancel} aria-label={ft.cancel}
              className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 shrink-0">
              <X size={15} />
            </button>
          </div>
        ) : (
          <ChunkyButton variant="green" size="sm" block icon={UserPlus} onClick={() => setAdding(true)}>
            {ft.addBtn}
          </ChunkyButton>
        )}
        {notice && (
          <p className={`text-[11px] leading-snug ${notice.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{notice.text}</p>
        )}
      </div>
    </div>
  );
}
