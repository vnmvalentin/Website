// AvatarBuilderPage.jsx — /tanzfigur: Zuschauer bauen ihre Figur für die Stream-Szenen.
//
// Mitte: die Figur in 3D (tanzt, lässt sich drehen). Links und rechts davon je ein Pfeil auf Höhe
// von Hut, Kopf, Oberkörper, Beinen und Schuhen. Darunter Hautfarbe, Tanz zum Ansehen und Speichern.
// Gespeichert wird an der Twitch-ID (Backend /api/stream-scenes/look) — die Figur tanzt dann beim
// Stream-Start auf der Tanzfläche und sitzt im Abspann im Kino. Ohne Login bleibt ein Entwurf im Browser.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Shuffle, RotateCcw, Check } from 'lucide-react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { PARTS, SLOTS, SKIN_TONES, normalizeLook, defaultLook } from './avatarParts';
import { PREVIEW_DANCES } from './avatarPreview';
import { hasWebGL } from './sceneKit';

const DRAFT_KEY = 'tanzfigurEntwurf';
const SLOT_LABEL = { hat: 'Hut', head: 'Kopf', body: 'Oberkörper', legs: 'Beine', shoes: 'Schuhe' };
/** Höhe der Pfeile neben der Figur (Anteil der Bühnenhöhe), passend zur Kamera der Vorschau. */
const SLOT_Y = { hat: 0.08, head: 0.22, body: 0.43, legs: 0.64, shoes: 0.84 };

const readDraft = () => {
  try { return normalizeLook(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')); } catch { return null; }
};
const writeDraft = (look) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(look)); } catch { /* privates Fenster o. Ä. */ }
};

function partLabel(slot, id) {
  const list = PARTS[slot];
  const i = list.findIndex((p) => p.id === id);
  const p = list[i];
  return p?.label || `${i + 1} / ${list.length}`;
}

export default function AvatarBuilderPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const [look, setLookState] = useState(() => readDraft() || defaultLook());
  // Entwurf erst speichern, wenn wirklich etwas geändert wurde — sonst verdrängt der Standard-Look
  // beim nächsten Besuch die gespeicherte Figur
  const touched = useRef(false);
  const setLook = (next) => { touched.current = true; setLookState(next); };
  const [saved, setSaved] = useState(null);         // Stand auf dem Server
  const [dance, setDance] = useState('handsup');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const webgl = useMemo(() => hasWebGL(), []);

  useEffect(() => { document.title = 'Tanzfigur bauen — vnmvalentin'; }, []);

  // 3D-Vorschau (three.js erst hier laden)
  useEffect(() => {
    if (!webgl) { setLoading(false); return undefined; }
    let disposed = false;
    import('./avatarPreview').then(({ createAvatarPreview }) => {
      if (disposed || !canvasRef.current) return;
      const p = createAvatarPreview(canvasRef.current);
      previewRef.current = p;
      p.setLook(look);
      p.setDance(dance);
      p.ready.then(() => { if (!disposed) setLoading(false); });
    });
    return () => { disposed = true; previewRef.current?.dispose(); previewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl]);

  useEffect(() => { previewRef.current?.setLook(look); if (touched.current) writeDraft(look); }, [look]);
  useEffect(() => { previewRef.current?.setDance(dance); }, [dance]);

  // Gespeicherte Figur laden, sobald eingeloggt
  useEffect(() => {
    if (!user) return;
    let off = false;
    fetch('/api/stream-scenes/look', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (off || !d?.look) return;
        const n = normalizeLook(d.look);
        setSaved(n);
        // Ein ungespeicherter Entwurf geht vor (wer vor dem Login gebaut hat, verliert nichts)
        if (!readDraft()) setLookState(n);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [user]);

  const step = (slot, dir) => {
    const list = PARTS[slot];
    const i = Math.max(0, list.findIndex((p) => p.id === look[slot]));
    setLook({ ...look, [slot]: list[(i + dir + list.length) % list.length].id });
    setStatus('');
  };

  const randomize = () => {
    const pick = (slot) => PARTS[slot][Math.floor(Math.random() * PARTS[slot].length)].id;
    setLook({ hat: Math.random() < 0.45 ? 'none' : pick('hat'), head: pick('head'), body: pick('body'), legs: pick('legs'), shoes: pick('shoes'), skin: Math.floor(Math.random() * SKIN_TONES.length) });
    setStatus('');
  };

  const save = async () => {
    if (!user) { writeDraft(look); login(); return; }
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch('/api/stream-scenes/look', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ look }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSaved(look);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* egal */ }
      setStatus('Gespeichert — deine Figur ist ab jetzt im Stream dabei.');
    } catch (err) {
      setStatus(`Fehler beim Speichern: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const dirty = !saved || SLOTS.some((s) => saved[s] !== look[s]) || saved.skin !== look.skin;

  const arrow = (slot, dir) => (
    <button
      type="button"
      onClick={() => step(slot, dir)}
      aria-label={`${SLOT_LABEL[slot]} ${dir < 0 ? 'zurück' : 'weiter'}`}
      className="flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-[#161622] text-white/80 transition-colors hover:border-violet-400/60 hover:bg-[#1f1f30] hover:text-white"
    >
      {dir < 0 ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-white">
      <h1 className="text-3xl font-extrabold tracking-tight">Tanzfigur bauen</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        Stell dir deine Figur zusammen. Sobald du beim Stream-Start im Chat schreibst, tanzt sie auf der
        Tanzfläche mit — und im Abspann sitzt sie im Kino.
      </p>

      <div className="mt-6 grid gap-6 rounded-md border border-white/10 bg-[#0d0d14] p-4 md:grid-cols-[1fr_300px] md:p-6">
        {/* Bühne mit Pfeilen links und rechts */}
        <div className="relative mx-auto aspect-[3/4] w-full max-w-[460px]">
          {webgl ? (
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-center text-white/50">
              Die 3D-Vorschau braucht WebGL — speichern geht trotzdem.
            </div>
          )}
          {loading && webgl && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40">Figur wird geladen …</div>
          )}
          {SLOTS.map((slot) => (
            <React.Fragment key={slot}>
              <div className="absolute left-0 -translate-y-1/2" style={{ top: `${SLOT_Y[slot] * 100}%` }}>{arrow(slot, -1)}</div>
              <div className="absolute right-0 -translate-y-1/2" style={{ top: `${SLOT_Y[slot] * 100}%` }}>{arrow(slot, 1)}</div>
            </React.Fragment>
          ))}
        </div>

        {/* Auswahl im Überblick */}
        <div className="flex flex-col gap-5">
          <div className="divide-y divide-white/10 rounded-md border border-white/10 bg-white/[0.03]">
            {SLOTS.map((slot) => (
              <div key={slot} className="flex items-center gap-2 px-3 py-2">
                <span className="w-24 text-sm text-white/50">{SLOT_LABEL[slot]}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums">{partLabel(slot, look[slot])}</span>
                <button type="button" onClick={() => step(slot, -1)} className="rounded-sm p-1 text-white/50 hover:text-white" aria-label={`${SLOT_LABEL[slot]} zurück`}><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => step(slot, 1)} className="rounded-sm p-1 text-white/50 hover:text-white" aria-label={`${SLOT_LABEL[slot]} weiter`}><ChevronRight size={16} /></button>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 text-sm text-white/50">Hautfarbe</div>
            <div className="flex flex-wrap gap-2">
              {SKIN_TONES.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setLook({ ...look, skin: i }); setStatus(''); }}
                  aria-label={`Hautfarbe ${i + 1}`}
                  className={`h-8 w-8 rounded-md border-2 transition-colors ${look.skin === i ? 'border-white' : 'border-transparent hover:border-white/40'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-white/50">Tanz ansehen</div>
            <div className="flex flex-wrap gap-1.5">
              {PREVIEW_DANCES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDance(d.id)}
                  className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${dance === d.id ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 text-white/60 hover:text-white'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={randomize} className="flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/5">
                <Shuffle size={16} /> Zufall
              </button>
              {saved && dirty && (
                <button type="button" onClick={() => setLook(saved)} className="flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/5">
                  <RotateCcw size={16} /> Gespeicherte
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={busy || (user && !dirty)}
              className="flex items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-default disabled:bg-white/10 disabled:text-white/50"
            >
              {user ? (dirty ? (busy ? 'Speichere …' : 'Figur speichern') : <><Check size={18} /> Gespeichert</>) : 'Mit Twitch anmelden & speichern'}
            </button>
            {status && <p className={`text-sm ${status.startsWith('Fehler') ? 'text-red-400' : 'text-emerald-400'}`}>{status}</p>}
            {!user && <p className="text-xs text-white/40">Die Figur hängt an deinem Twitch-Konto — so erkennt sie der Stream.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
