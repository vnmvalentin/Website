// Dauerhaftes Profil: Twitch-Verbindung, Anzeigename, Avatar (fester Satz oder das eigene
// Twitch-Bild) und der verknüpfte Clash-Royale-Account. Das Streamer-Setup lebt hier als
// zweiter Reiter statt als eigener Knopf im Hub — siehe HubScreen.jsx.
//
// Wo etwas gespeichert wird, entscheidet allein useProfile.js (Twitch verbunden → Backend,
// sonst Gerät/localStorage) — dieser Dialog kennt den Unterschied nicht, er ruft nur
// profile/updateProfile/linkCr/unlinkCr auf.

import React, { useContext, useState } from 'react';
import { User, Check, Link2, Loader2, LogOut, X } from 'lucide-react';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import Modal from '../ui/Modal';
import { SegmentedControl } from '../ui/SettingRow';
import { AVATAR_IDS, AVATAR_URL_MAP } from '../components/avatars';
import StreamerConfigPanel from '../streamer/StreamerConfigPanel';
import { resolveError } from '../i18n';

export default function ProfileModal({ lang, t, profile, updateProfile, linkCr, unlinkCr, switchActiveCr, onClose }) {
  const { user, login, logout } = useContext(TwitchAuthContext);
  const [tab, setTab] = useState('account'); // 'account' | 'streamer'
  const [name, setName] = useState(profile.displayName || '');
  const [tag, setTag] = useState('');
  const [tagState, setTagState] = useState('idle'); // 'idle' | 'checking' | 'error'
  const [tagError, setTagError] = useState('');
  const [saved, setSaved] = useState(false);
  const crAccounts = profile.crAccounts || [];

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const saveName = async () => {
    const clean = name.trim();
    if (clean === (profile.displayName || '')) return;
    await updateProfile({ displayName: clean });
    flashSaved();
  };

  const pickAvatar = async (id) => {
    await updateProfile({ avatarId: id, useTwitchAvatar: false });
    flashSaved();
  };
  const pickTwitchAvatar = async () => {
    await updateProfile({ useTwitchAvatar: true });
    flashSaved();
  };

  const submitTag = async () => {
    if (!tag.trim() || tagState === 'checking') return;
    setTagState('checking');
    setTagError('');
    const res = await linkCr(tag.trim());
    if (res?.ok) { setTagState('idle'); setTag(''); flashSaved(); return; }
    setTagState('error');
    setTagError(resolveError(t, res) || t.errors.tagLookupFailed);
  };

  return (
    <Modal onClose={onClose} title={t.profileTitle}
      icon={<User size={18} className="text-violet-400 shrink-0" />} size="xl">
      <div className="p-6 md:p-8 space-y-6">
        <SegmentedControl
          options={[
            { id: 'account', label: t.profileTabAccount },
            { id: 'streamer', label: t.profileTabStreamer },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'account' ? (
          <div className="space-y-6">
            {/* ── Twitch ─────────────────────────────────────────────────────── */}
            <div>
              {user ? (
                <div className="flex items-center justify-between gap-3 bg-black/30 border border-white/10 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {user.profileImageUrl && (
                      <img src={user.profileImageUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
                    )}
                    <span className="text-white text-sm font-semibold truncate">
                      {t.profileTwitchConnected(user.displayName || user.login)}
                    </span>
                  </div>
                  <button onClick={logout}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/50 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors shrink-0">
                    <LogOut size={13} /> {t.profileTwitchDisconnect}
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => login()}
                    className="w-full flex items-center justify-center gap-2 bg-[#9146FF] hover:bg-[#7c2ff2] text-white font-bold py-2.5 rounded-lg transition-colors text-sm">
                    {t.profileTwitchConnect}
                  </button>
                  <p className="text-white/30 text-xs mt-2">{t.profileGuestNote}</p>
                </>
              )}
            </div>

            {/* ── Name + Avatar ──────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div>
                <p className="text-white/40 text-xs mb-2">{t.profileNameLabel}</p>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  placeholder={t.namePlaceholder}
                  maxLength={20}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm transition-colors"
                />
              </div>

              <div>
                <p className="text-white/40 text-xs mb-2">{t.avatarLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {user?.profileImageUrl && (
                    <button onClick={pickTwitchAvatar} title={t.profileUseTwitchAvatar}
                      className={`rounded-full overflow-hidden border-2 transition-colors shrink-0 ${
                        profile.useTwitchAvatar
                          ? 'border-violet-400 ring-2 ring-violet-400/30'
                          : 'border-white/15 hover:border-white/40'
                      }`}
                      style={{ width: 42, height: 42 }}>
                      <img src={user.profileImageUrl} alt="" width={42} height={42}
                        className="w-full h-full object-cover object-center" />
                    </button>
                  )}
                  {AVATAR_IDS.map(id => (
                    <button key={id}
                      onClick={() => pickAvatar(id)}
                      title={id.replace(/\.[^.]+$/, '')}
                      className={`rounded-full overflow-hidden border-2 transition-colors shrink-0 ${
                        !profile.useTwitchAvatar && profile.avatarId === id
                          ? 'border-violet-400 ring-2 ring-violet-400/30'
                          : 'border-white/15 hover:border-white/40'
                      }`}
                      style={{ width: 42, height: 42 }}>
                      <img src={AVATAR_URL_MAP[id]} alt={id} width={42} height={42}
                        loading="lazy" decoding="async"
                        className="w-full h-full object-cover object-center" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Clash-Royale-Accounts ───────────────────────────────────────── */}
            <div className="space-y-3">
              <p className="text-white/40 text-xs flex items-center gap-1.5">
                <Link2 size={12} /> {t.profileCrHeading}
              </p>

              {crAccounts.length === 0 ? (
                <p className="text-white/30 text-xs">{t.profileCrNotLinked}</p>
              ) : (
                <div className="space-y-2">
                  {crAccounts.map(acc => (
                    <div key={acc.tag}
                      className="flex items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-lg px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{acc.name || acc.tag}</p>
                        <p className="text-white/30 text-xs font-mono">#{acc.tag}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {profile.crTag === acc.tag ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 border border-green-500/40 bg-green-500/10 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Check size={11} /> {t.profileCrActive}
                          </span>
                        ) : (
                          <button onClick={() => switchActiveCr(acc.tag)}
                            className="text-xs font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/30 px-2.5 py-1.5 rounded-lg transition-colors">
                            {t.profileCrSetActive}
                          </button>
                        )}
                        <button onClick={() => unlinkCr(acc.tag)} title={t.unlinkBtn}
                          className="text-white/30 hover:text-red-300 transition-colors p-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {crAccounts.length > 1 && (
                    <p className="text-white/25 text-[11px] leading-relaxed">{t.profileCrActiveHint}</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  value={tag}
                  onChange={e => { setTag(e.target.value.toUpperCase()); setTagState('idle'); }}
                  onKeyDown={e => e.key === 'Enter' && submitTag()}
                  placeholder={t.tagPlaceholder}
                  maxLength={13}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm font-mono tracking-widest uppercase transition-colors"
                />
                <button onClick={submitTag} disabled={!tag.trim() || tagState === 'checking'}
                  className="shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white font-bold px-4 py-2.5 rounded-lg transition-colors text-sm disabled:cursor-not-allowed">
                  {tagState === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {crAccounts.length > 0 ? t.profileCrAddAnother : t.linkBtn}
                </button>
              </div>
              <p className="text-white/30 text-xs leading-relaxed">{t.tagHint}</p>
              {tagState === 'error' && tagError && <p className="text-red-400 text-xs">{tagError}</p>}
            </div>

            {saved && <p className="text-green-400 text-xs text-center">{t.profileSaved}</p>}
          </div>
        ) : (
          <StreamerConfigPanel bare lang={lang} />
        )}
      </div>
    </Modal>
  );
}
