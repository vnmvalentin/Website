// Deck-Weitergabe am Spielende: QR-Code, Kopierlink und Direktöffnen in Clash Royale.
//
// buildDeckLink() liefert nur dann eine URL, wenn es für JEDE Karte des Decks die
// Supercell-ID kennt. Bei einer brandneuen Karte fehlt sie — dann gibt es bewusst
// gar keinen Link statt eines, der ein falsches Deck importiert.

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, ExternalLink } from 'lucide-react';
import Modal from '../ui/Modal';
import { buildDeckLink } from '../data/cardDeckIds';

/** Kleiner Knopf neben dem Spielernamen, der den Dialog öffnet. */
export function DeckQrButton({ player, t, onOpen }) {
  const deckLink = buildDeckLink(player.deck);
  return (
    <button onClick={() => deckLink.ok && onOpen(player, deckLink)} disabled={!deckLink.ok}
      title={deckLink.ok ? t.deckQrBtn : t.deckQrUnavailable(deckLink.missing.join(', '))}
      aria-label={t.deckQrBtn}
      className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
        deckLink.ok
          ? 'border-white/10 text-white/40 hover:text-violet-300 hover:border-violet-400/40'
          : 'border-white/5 text-white/15 cursor-not-allowed'
      }`}>
      <QrCode size={13} />
    </button>
  );
}

export default function DeckQrModal({ player, deckLink, onClose, t }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!deckLink.ok) return;
    let cancelled = false;
    QRCode.toDataURL(deckLink.url, { width: 240, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { /* ohne QR bleiben Kopierlink und Direktlink nutzbar */ });
    return () => { cancelled = true; };
  }, [deckLink.ok, deckLink.url]);

  const copyLink = () => {
    if (!deckLink.ok) return;
    navigator.clipboard.writeText(deckLink.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* Zwischenablage nicht verfügbar */ });
  };

  return (
    <Modal
      title={t.deckQrTitle(player.name)}
      icon={<QrCode size={15} className="text-violet-400 shrink-0" />}
      onClose={onClose}
      size="sm">
      <div className="p-5 flex flex-col items-center gap-4">
        {deckLink.ok ? (
          <>
            <p className="text-white/40 text-xs text-center">{t.deckQrHint}</p>
            {/* Weißer Rahmen ist Pflicht: QR-Scanner brauchen den hellen Ruhebereich */}
            <div className="bg-white rounded-lg p-3 w-[240px] h-[240px] flex items-center justify-center shrink-0">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR" className="w-full h-full" />
                : <span className="text-black/30 text-xs">…</span>}
            </div>
            <div className="flex items-center gap-2 w-full">
              <button onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? t.deckQrCopied : t.deckQrCopy}
              </button>
              <a href={deckLink.url} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                <ExternalLink size={14} /> {t.deckQrOpenApp}
              </a>
            </div>
          </>
        ) : (
          <p className="text-amber-300 text-sm text-center py-6">
            {t.deckQrUnavailable(deckLink.missing.join(', '))}
          </p>
        )}
      </div>
    </Modal>
  );
}
