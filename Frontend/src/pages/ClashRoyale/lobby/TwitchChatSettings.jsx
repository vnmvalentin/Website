// Abschnitt "Twitch-Chat draftet mit" im Einstellungsfenster (nur Pyramidendraft).
//
// Einschalten geht nur mit Twitch-Login: Kanal und "für wen stimmt der Chat ab" nimmt der
// Server aus der Sitzung des Einschaltenden (Backend: clash:setTwitchChat). Die Feinregler
// darunter sind normale Modus-Einstellungen des Pyramidendrafts (modes/pyramidDraft.js) und
// erscheinen erst, wenn der Chat an ist — vorher wären sie nur Rauschen.
import React, { useState } from 'react';
import { CrChat, CrClock, CrSocial, CrNews, CrCheck } from '../ui/CrIcons';
import Toggle from '../ui/Toggle';
import SettingRow, { SegmentedControl } from '../ui/SettingRow';
import { ACCENT } from './hostSettingsSchema';

// Whitelist — exakte Kopie von CHAT_VOTE_SECONDS in Backend/clashRoyale/modes/pyramidDraft.js
const CHAT_VOTE_SECONDS = [15, 20, 30, 45, 60];

// Farbe des Bot-Status: grün = liest mit, gelb = Beitritt läuft, rot = keine Verbindung
const STATUS_STYLE = {
  joined: 'text-green-400',
  pending: 'text-amber-300',
  offline: 'text-red-400',
};

export default function TwitchChatSettings({ lobbyData, actions, t, lang, twitchUser, onTwitchLogin }) {
  const chat = lobbyData?.twitchChat || null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const accent = ACCENT.violet;

  const toggle = async (next) => {
    setErr(null);
    setBusy(true);
    try {
      const res = await actions.setTwitchChat(next, lang);
      if (!res?.ok) setErr(res?.key === 'twitchLoginRequired' ? t.chatErrLogin : t.chatErrGeneric);
    } finally {
      setBusy(false);
    }
  };

  const statusText = chat && {
    joined: t.chatStatusJoined,
    pending: t.chatStatusPending,
    offline: t.chatStatusOffline,
  }[chat.status];

  return (
    <>
      <SettingRow icon={CrChat} iconClass={accent.icon} label={t.chatTitle} note={t.chatNote} inline>
        <Toggle
          checked={!!chat}
          onChange={toggle}
          // Ausschalten geht immer, Einschalten nur mit Twitch-Login
          disabled={busy || (!chat && !twitchUser)}
          accent={accent.toggle}
          aria-label={t.chatTitle}
        />
      </SettingRow>

      {!chat && !twitchUser && (
        <div className="cr-section !pt-0 -mt-1">
          <p className="text-white/60 text-xs mb-2">{t.chatNeedLogin}</p>
          {onTwitchLogin && (
            <button type="button" onClick={onTwitchLogin}
              className="cr-tile-btn !w-auto px-3 py-1.5 font-cr text-sm text-white">
              {t.chatLoginBtn}
            </button>
          )}
        </div>
      )}

      {err && <p className="cr-section !pt-0 -mt-1 text-red-400 text-xs">{err}</p>}

      {chat && (
        <>
          <div className="cr-section !py-3 bg-[rgba(6,16,32,0.35)]">
            <p className="text-white text-sm font-semibold">{t.chatFor(chat.ownerName || '?', chat.channel)}</p>
            {statusText && (
              <p className={`text-xs mt-1 flex items-center gap-1.5 ${STATUS_STYLE[chat.status] || 'text-white/60'}`}>
                {chat.status === 'joined' && <CrCheck size={14} />}
                {statusText}
              </p>
            )}
          </div>

          <SettingRow icon={CrClock} iconClass={accent.icon} label={t.chatVoteTime} note={t.chatVoteTimeNote}>
            <SegmentedControl
              options={CHAT_VOTE_SECONDS.map(s => ({ id: s, label: `${s}s` }))}
              value={lobbyData?.chatVoteSeconds ?? 30}
              onChange={actions.setChatVoteSeconds}
            />
          </SettingRow>

          <SettingRow icon={CrChat} iconClass={accent.icon} label={t.chatShare} note={t.chatShareNote}>
            <SegmentedControl
              options={[
                { id: 'all', label: t.chatShareAll },
                { id: 'alternate', label: t.chatShareAlternate },
              ]}
              value={lobbyData?.chatShare || 'all'}
              onChange={actions.setChatShare}
            />
          </SettingRow>

          <SettingRow icon={CrSocial} iconClass={accent.icon} label={t.chatVoters} note={t.chatVotersNote}>
            <SegmentedControl
              options={[
                { id: 'all', label: t.chatVotersAll },
                { id: 'subs', label: t.chatVotersSubs },
              ]}
              value={lobbyData?.chatVoters || 'all'}
              onChange={actions.setChatVoters}
            />
          </SettingRow>

          <SettingRow icon={CrNews} iconClass={accent.icon} label={t.chatAnnounce} note={t.chatAnnounceNote} inline>
            <Toggle
              checked={lobbyData?.chatAnnounce !== false}
              onChange={actions.setChatAnnounce}
              accent={accent.toggle}
              aria-label={t.chatAnnounce}
            />
          </SettingRow>
        </>
      )}
    </>
  );
}
