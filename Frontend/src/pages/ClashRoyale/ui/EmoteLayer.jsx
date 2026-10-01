// Emotes in Lobby und Spiel: Knopf unten rechts (öffnet die Auswahl), gesendete Emotes
// erscheinen groß am rechten Bildrand — dort stören sie das Spielfeld nicht und fallen
// trotzdem sofort auf. Bewusst `fixed` und INNERHALB von Lobby/GameScreen gerendert:
// im Vollbild-Modus des Spiels ist nur dessen Container sichtbar, eine Ebene außerhalb
// davon wäre dann verschwunden.
import React, { useEffect, useRef, useState } from 'react';
import { EMOTES, emoteAnim } from './emotes';
import { CrChat } from './CrIcons';
import { avatarUrl } from '../components/avatars';

const LABEL = { de: 'Emotes', en: 'Emotes', es: 'Emotes' };
const LOCAL_COOLDOWN_MS = 1200; // wie der Server (EMOTE_COOLDOWN_MS) — Knopf sperrt kurz

/**
 * @param {Array}    emotes   [{ key, playerId, emoteId }] aus useClashSocket
 * @param {Array}    players  Lobby-Spieler (für Name, Farbe, Avatar)
 * @param {Function} onSend   (emoteId) → sendet
 * @param {boolean}  canSend  false = nur anzeigen (z.B. Admin-Beobachter)
 */
export default function EmoteLayer({ emotes = [], players = [], onSend, canSend = true, lang = 'de' }) {
  const [open, setOpen] = useState(false);
  const [coolingUntil, setCoolingUntil] = useState(0);
  const [, force] = useState(0);
  const wrapRef = useRef(null);

  // Bewusst ohne Ton — Emotes sollen niemanden aus dem Spiel reißen.

  // Außerhalb klicken / Escape schließt die Auswahl
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev) => { if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false); };
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Abklingzeit sichtbar wieder freigeben
  useEffect(() => {
    if (!coolingUntil) return undefined;
    const id = setTimeout(() => force(x => x + 1), Math.max(0, coolingUntil - Date.now()) + 20);
    return () => clearTimeout(id);
  }, [coolingUntil]);
  const cooling = Date.now() < coolingUntil;

  const send = (id) => {
    if (cooling) return;
    onSend?.(id);
    setCoolingUntil(Date.now() + LOCAL_COOLDOWN_MS);
    setOpen(false);
  };

  return (
    <>
      {/* ── Gesendete Emotes am rechten Rand ─────────────────────────────── */}
      <div className="fixed right-2 sm:right-4 top-36 z-[45] flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {emotes.map(e => {
          const p = players.find(x => x.id === e.playerId);
          const src = emoteAnim(e.emoteId);
          if (!src) return null;
          const url = p ? (p.avatarUrl || avatarUrl(p.avatar)) : null;
          return (
            <div key={e.key} className="cr-emote-pop flex flex-col items-center">
              {/* Animiertes WebP — alle Emotes sind beim Erzeugen auf dasselbe Quadrat zugeschnitten */}
              <img src={src} alt="" className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_6px_6px_rgba(2,8,20,0.55)]" />
              <span className="-mt-1 flex items-center gap-1.5 max-w-[9rem] rounded-full pl-0.5 pr-2.5 py-0.5 bg-[#0b1a30]/90 border-2 border-[var(--cr-panel-edge)]">
                <span className="cr-avatar-pick w-5 h-5 rounded-full overflow-hidden shrink-0 border"
                  style={{ borderColor: p?.color || '#fff' }}>
                  {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="font-cr text-[13px] truncate" style={{ color: p?.color || '#fff' }}>{p?.name || '?'}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Knopf + Auswahl unten rechts ─────────────────────────────────── */}
      {canSend && (
        <div ref={wrapRef} className="fixed right-2 sm:right-4 bottom-28 z-[46] flex flex-col items-end gap-2">
          {open && (
            <div className="cr-arcade-panel cr-emote-picker p-2.5 grid grid-cols-5 gap-1.5 w-[20rem] max-h-[60vh] overflow-y-auto custom-scrollbar" role="menu"
              style={{ position: 'relative' }}>
              {EMOTES.map(e => (
                <button key={e.id} type="button" role="menuitem" onClick={() => send(e.id)}
                  className="cr-card-hover aspect-square rounded-xl bg-[#081426] border-2 border-[var(--cr-panel-edge)] p-1 hover:border-[var(--cr-arcade-gold)]">
                  {/* Standbild statt Animation: 25 laufende Emotes in der Auswahl wären unruhig und teuer */}
                  <img src={e.still} alt={e.id} loading="lazy" className="w-full h-full object-contain" draggable={false} />
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(o => !o)} disabled={cooling}
            aria-label={LABEL[lang] || LABEL.de} title={LABEL[lang] || LABEL.de} aria-expanded={open}
            className="cr-arcade-btn cr-arcade-btn--blue !rounded-2xl !p-0 w-14 h-14">
            <CrChat size={30} />
          </button>
        </div>
      )}
    </>
  );
}
