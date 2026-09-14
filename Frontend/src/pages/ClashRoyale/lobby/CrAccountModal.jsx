// Clash-Royale-Account mit einem Lobby-Spieler verknüpfen.
//
// Der Tag wird vom Server gegen die offizielle API geprüft, BEVOR er gespeichert wird —
// die Antwort kommt per Ack zurück. Ohne diese Prüfung fiele ein Tippfehler erst später
// auf, nämlich als Spieler, der beim Tracking dauerhaft 0–0 stehen bleibt.
//
// Für den eigenen Spieler (isSelf) zeigt der Dialog zusätzlich die im Profil gespeicherten
// Accounts zum Anklicken — kein erneutes Abtippen des Tags nötig. Ein Klick verknüpft ihn
// sofort (wie ein manuell eingegebener Tag) und macht ihn zum neuen aktiven Account fürs
// nächste Mal (onPickSaved → useProfile.switchActiveCr).

import React, { useState } from 'react';
import { Link2, Check, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import PlayerAvatar from '../components/PlayerAvatar';
import { resolveError } from '../i18n';

export default function CrAccountModal({
  player, isSelf, onLink, onUnlink, onClose, t,
  savedAccounts = [], onPickSaved,
}) {
  const [tag, setTag] = useState('');
  const [state, setState] = useState('idle'); // 'idle' | 'checking' | 'error'
  const [errorText, setErrorText] = useState('');

  const submit = async (rawTag) => {
    const clean = (rawTag ?? tag).trim();
    if (!clean || state === 'checking') return;
    setState('checking');
    setErrorText('');
    const res = await onLink(clean);
    if (res?.ok) {
      onPickSaved?.(clean);
      onClose();
      return;
    }
    setState('error');
    setErrorText(resolveError(t, res) || t.errors.tagLookupFailed);
  };

  return (
    <Modal
      title={isSelf ? t.linkAccountOwn : t.linkAccountFor(player.name)}
      icon={<Link2 size={15} className="text-violet-400 shrink-0" />}
      onClose={onClose}
      size="sm">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar avatarId={player.avatar} size={36} />
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{player.name}</p>
            {player.crName && (
              <p className="text-green-400 text-xs flex items-center gap-1 mt-0.5">
                <Check size={11} /> {t.linkedAs(player.crName)}
              </p>
            )}
          </div>
        </div>

        {savedAccounts.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-white/40 text-xs">{t.crAccountPickerLabel}</p>
            <div className="space-y-1.5">
              {savedAccounts.map(acc => (
                <button key={acc.tag} onClick={() => submit(acc.tag)} disabled={state === 'checking'}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    player.crTag === acc.tag
                      ? 'border-violet-400/50 bg-violet-500/10 text-white'
                      : 'border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                  }`}>
                  <span className="min-w-0 truncate text-sm font-semibold">{acc.name || acc.tag}</span>
                  <span className="text-white/30 text-xs font-mono shrink-0">#{acc.tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          {savedAccounts.length > 0 && <p className="text-white/40 text-xs mb-1.5">{t.crAccountPickerNew}</p>}
          <input
            value={tag}
            onChange={e => { setTag(e.target.value.toUpperCase()); setState('idle'); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={t.tagPlaceholder}
            maxLength={13}
            autoFocus={savedAccounts.length === 0}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm font-mono tracking-widest uppercase transition-colors"
          />
          <p className="text-white/30 text-xs mt-2 leading-relaxed">{t.tagHint}</p>
          {state === 'error' && errorText && (
            <p className="text-red-400 text-xs mt-2">{errorText}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => submit()} disabled={!tag.trim() || state === 'checking'}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white font-bold py-2.5 rounded-lg transition-colors disabled:cursor-not-allowed text-sm">
            {state === 'checking'
              ? <><Loader2 size={14} className="animate-spin" /> {t.linkChecking}</>
              : <><Link2 size={14} /> {t.linkBtn}</>}
          </button>
          {player.crTag && (
            <button onClick={() => { onUnlink(); onClose(); }}
              className="px-4 py-2.5 rounded-lg border border-white/10 text-white/50 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition-colors text-sm font-semibold">
              {t.unlinkBtn}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
