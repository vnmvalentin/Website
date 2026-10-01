// Lobby-Code und Einladungslink zum Teilen.
//
// Beide sind standardmäßig unkenntlich gemacht: Die Lobby wird oft im Stream gezeigt,
// und ein sichtbarer Code lädt die halbe Zuschauerschaft ungefragt ein. Der Host deckt
// ihn bewusst auf, wenn er ihn vorlesen will.

import React, { useState } from 'react';
// Aufdecken/Verbergen und Kopieren bleiben lucide-Glyphen: dafür gibt es im Spiel kein Symbol,
// und ein durchgestrichenes Auge ist als Gegenstück zum Auge nur so eindeutig.
import { Copy, Eye, EyeOff } from 'lucide-react';
import Toggle from '../ui/Toggle';
import { CrCheck, CrLock, CrRegion } from '../ui/CrIcons';

function SecretRow({ label, children, onCopy, copied, hidden, onToggleHidden, t }) {
  return (
    <div className="flex items-center gap-3">
      <span className="cr-eyebrow w-10 shrink-0">{label}</span>
      {children}
      <button onClick={onCopy} title={t.copy} aria-label={t.copy}
        className="cr-arcade-icon-btn w-9 h-9 shrink-0">
        {copied ? <CrCheck size={18} /> : <Copy size={15} />}
      </button>
      <button onClick={onToggleHidden} aria-label={label}
        className="cr-arcade-icon-btn w-9 h-9 shrink-0">
        {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
    </div>
  );
}

export default function LobbyCodeCard({
  code, link, t, locked, canControlLobby, onToggleLock, isPublic, onTogglePublic,
}) {
  const [copied, setCopied] = useState('');
  const [codeHidden, setCodeHidden] = useState(true);
  const [linkHidden, setLinkHidden] = useState(true);

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text || '').then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    }).catch(() => { /* Zwischenablage ohne HTTPS/Berechtigung — kein Grund für einen Fehler */ });
  };

  return (
    <div className="space-y-3">
      <SecretRow
        label={t.codeLabel} t={t}
        onCopy={() => copyText(code, 'code')} copied={copied === 'code'}
        hidden={codeHidden} onToggleHidden={() => setCodeHidden(v => !v)}>
        {/* Feld bleibt scharf, nur der Inhalt verschwimmt — sonst sähe das ganze Feld kaputt aus */}
        <span className="cr-input flex-1 min-w-0 px-3 py-1.5 overflow-hidden">
          <span className={`block text-2xl sm:text-[28px] font-cr text-white tracking-[0.2em] sm:tracking-[0.25em] transition-all ${
            codeHidden ? 'blur-md select-none pointer-events-none' : 'select-all'
          }`}>
            {code || '------'}
          </span>
        </span>
      </SecretRow>

      <div className="h-px bg-[rgba(2,8,20,0.55)] shadow-[0_1px_0_rgba(255,255,255,0.05)]" />

      <SecretRow
        label={t.linkLabel} t={t}
        onCopy={() => copyText(link, 'link')} copied={copied === 'link'}
        hidden={linkHidden} onToggleHidden={() => setLinkHidden(v => !v)}>
        <div className="cr-input flex-1 min-w-0 px-3 py-2.5 overflow-hidden">
          <div className={`text-white/60 text-xs truncate transition-all ${
            linkHidden ? 'blur-sm select-none pointer-events-none' : ''
          }`}>
            {link}
          </div>
        </div>
      </SecretRow>

      {/* Die Sperre steht bewusst hier und nicht in den Einstellungen: Sie regelt genau
          das, was direkt darüber steht — wer mit diesem Code noch reinkommt. */}
      {canControlLobby ? (
        <>
          <div className="h-px bg-[rgba(2,8,20,0.55)] shadow-[0_1px_0_rgba(255,255,255,0.05)]" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                <CrLock size={20} className={locked ? '' : 'opacity-60 grayscale'} />
                {t.lockLobby}
                {locked && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded-md">
                    {t.lockedBadge}
                  </span>
                )}
              </p>
              <p className="text-white/50 text-xs mt-0.5">{t.lockLobbyNote}</p>
            </div>
            <Toggle checked={!!locked} onChange={onToggleLock} accent="bg-amber-400" aria-label={t.lockLobby} />
          </div>

          <div className="h-px bg-[rgba(2,8,20,0.55)] shadow-[0_1px_0_rgba(255,255,255,0.05)]" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                <CrRegion size={20} className={isPublic ? '' : 'opacity-60 grayscale'} />
                {t.makePublicLabel}
              </p>
              <p className="text-white/50 text-xs mt-0.5">{t.makePublicNote}</p>
            </div>
            <Toggle checked={!!isPublic} onChange={onTogglePublic} accent="bg-green-500" aria-label={t.makePublicLabel} />
          </div>
        </>
      ) : locked && (
        // Gäste können nichts umschalten, sollen aber wissen, warum gerade niemand
        // mehr dazukommt — sonst wirkt ein nicht funktionierender Einladungslink wie
        // ein Fehler der Seite.
        <>
          <div className="h-px bg-[rgba(2,8,20,0.55)] shadow-[0_1px_0_rgba(255,255,255,0.05)]" />
          <p className="text-amber-300/80 text-xs flex items-start gap-1.5">
            <CrLock size={16} className="shrink-0" /> {t.lockedNoticeGuest}
          </p>
        </>
      )}
    </div>
  );
}
