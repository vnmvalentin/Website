// StreamScenesControlPage.jsx — /stream-szenen: Steuerpult für die 3D-Stream-Szenen.
//
// Der OBS-Link enthält einen Key; die Browserquelle fragt darüber alle 1,5 s die Einstellungen ab
// (Backend /api/stream-scenes). Alles hier wirkt also live, auch vom Handy aus. Musik kommt von der
// YTMusicApp auf dem Streamer-PC — der Test unten verbindet sich von dieser Seite aus direkt damit.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Copy, Check, Flame, PartyPopper, DoorOpen, Timer, Music, ExternalLink } from 'lucide-react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { createMusicFeed } from './sceneLink';

const api = (path, opts = {}) => fetch(`/api/stream-scenes${path}`, {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...opts,
}).then(async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
});

function Group({ title, children, hint }) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">{title}</h2>
      {hint && <p className="mt-1 text-sm text-white/40">{hint}</p>}
      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] p-3.5">{children}</div>
    </section>
  );
}

function Row({ label, children, sub }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-1.5">
      <div className="w-44 shrink-0">
        <div className="text-sm text-white/85">{label}</div>
        {sub && <div className="text-xs text-white/40">{sub}</div>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-violet-500" />
      <span className="w-14 text-right text-sm tabular-nums text-white/80">{step < 1 ? value.toFixed(1) : value}{suffix}</span>
    </>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-violet-500" />
      {label}
    </label>
  );
}

function Choice({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${value === v ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 text-white/60 hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function CopyField({ value }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 gap-2">
      <input readOnly value={value} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white/80" />
      <button type="button" onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
        className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-white/80 hover:bg-white/5">
        {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}

/** Verbindungstest zur YTMusicApp direkt aus dem Browser. */
function MusicTest({ port }) {
  const [state, setState] = useState({ ok: false, bpm: 0, bass: 0, song: null, src: '' });
  useEffect(() => {
    if (!port) return undefined;
    const feed = createMusicFeed(port, {
      onStatus: (ok) => setState((s) => ({ ...s, ok })),
      onAudio: (m) => setState((s) => ({ ...s, bpm: m.conf > 0.15 ? m.bpm : 0, bass: m.bass, src: m.src || '' })),
      onSong: (sg) => setState((s) => ({ ...s, song: sg.title ? sg : null })),
    });
    return () => feed.stop();
  }, [port]);
  return (
    <div className="mt-2 rounded-md bg-black/30 px-3 py-2 text-sm">
      {state.ok ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-emerald-400">YTMusicApp verbunden</span>
          <span className="tabular-nums text-white/70">Tempo {state.bpm ? `${Math.round(state.bpm)} BPM` : '—'}</span>
          <span className="flex items-center gap-2 text-white/70">Bass
            <span className="inline-block h-2 w-24 overflow-hidden rounded-sm bg-white/10"><span className="block h-full bg-violet-500" style={{ width: `${Math.round(state.bass * 100)}%` }} /></span>
          </span>
          {state.song && <span className="min-w-0 truncate text-white/70">{state.song.artist} — {state.song.title}</span>}
          {state.src && <span className="basis-full text-xs text-white/40">Hört auf: {state.src} — falsches Gerät? In der YTMusicApp unter Overlay umstellen.</span>}
        </div>
      ) : (
        <span className="text-white/50">Keine Verbindung zu localhost:{port} — läuft die neue YTMusicApp (ab dieser Version mit Szenen-Feed) mit eingeschaltetem Overlay auf diesem Port?</span>
      )}
    </div>
  );
}

export default function StreamScenesControlPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [ctl, setCtl] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const saveTimer = useRef(0);

  useEffect(() => { document.title = 'Stream-Szenen steuern — vnmvalentin'; }, []);

  useEffect(() => {
    if (!user) return;
    api('/control').then(setCtl).catch((e) => setError(`Fehler beim Laden: ${e.message}`));
  }, [user]);

  /** Einstellung ändern: sofort anzeigen, gebündelt speichern. */
  const update = useCallback((patch) => {
    setCtl((c) => {
      const settings = { ...c.settings, ...patch };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api('/control', { method: 'PUT', body: JSON.stringify({ settings }) })
          .then((d) => { setCtl((cur) => ({ ...cur, settingsSeq: d.settingsSeq })); setError(''); })
          .catch((e) => setError(`Fehler beim Speichern: ${e.message}`));
      }, 350);
      return { ...c, settings };
    });
  }, []);

  const command = (type, label) => {
    api('/control/command', { method: 'POST', body: JSON.stringify({ type }) })
      .then(() => { setFlash(label); setTimeout(() => setFlash(''), 1800); })
      .catch((e) => setError(`Fehler: ${e.message}`));
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-white">
        <h1 className="text-3xl font-extrabold">Stream-Szenen steuern</h1>
        <p className="mt-3 text-white/60">Steuerpult für die 3D-Party zum Stream-Start: Tänzer, Ausraster-Modus, Effekte und Musik — live, während die Szene in OBS läuft.</p>
        <button type="button" onClick={login} className="mt-6 rounded-md bg-violet-600 px-4 py-2.5 font-semibold hover:bg-violet-500">Mit Twitch anmelden</button>
      </div>
    );
  }
  if (!ctl) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-white/50">{error || 'Lade …'}</div>;
  }

  const s = ctl.settings;
  const origin = window.location.origin;
  const startLink = `${origin}/overlay/stream-starting`;
  const countdownLeft = s.countdownTo ? Math.max(0, Math.round((s.countdownTo - Date.now()) / 60000)) : 0;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Stream-Szenen steuern</h1>
          <p className="mt-1 text-white/50">Änderungen erscheinen nach 1–2 Sekunden in OBS.</p>
        </div>
        {flash && <span className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300">{flash} ausgelöst</span>}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-md border border-white/10 bg-[#0d0d14] p-5 divide-y divide-white/10">
          <Group title="OBS-Link" hint="Als Browserquelle in OBS einfügen (1920×1080, Hardwarebeschleunigung an).">
            <div className="mb-1 text-sm text-white/85">Stream Starting <span className="text-white/40">— Party mit tanzendem Chat</span></div>
            <div className="flex"><CopyField value={startLink} /></div>
            <div className="mb-1 mt-3 text-sm text-white/85">Stream Ending <span className="text-white/40">— Kino mit Abspann</span></div>
            <div className="flex"><CopyField value={`${origin}/overlay/stream-ending`} /></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={startLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"><ExternalLink size={15} /> Vorschau öffnen</a>
            </div>
          </Group>

          <Group title="Jetzt auslösen">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => command('drop', 'Drop')} className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 font-semibold hover:bg-violet-500"><PartyPopper size={18} /> Drop</button>
              <button type="button" onClick={() => command('fire', 'Feuer')} className="flex items-center gap-2 rounded-md border border-white/15 px-4 py-2 hover:bg-white/5"><Flame size={18} /> Feuer</button>
              <button type="button" onClick={() => command('clearFloor', 'Fläche räumen')} className="flex items-center gap-2 rounded-md border border-white/15 px-4 py-2 hover:bg-white/5"><DoorOpen size={18} /> Fläche räumen</button>
            </div>
            <p className="mt-2 text-xs text-white/40">Drop = Konfettikanonen, Feuer-Lauflicht, CO2 und Strobo (soweit unten eingeschaltet).</p>
          </Group>

          <Group title="Countdown & Titel">
            <Row label="Countdown" sub={s.countdownTo && countdownLeft > 0 ? `läuft noch ca. ${countdownLeft} min` : 'aus'}>
              <div className="flex flex-wrap gap-1.5">
                {[5, 10, 15, 20].map((m) => (
                  <button key={m} type="button" onClick={() => update({ countdownTo: Date.now() + m * 60000 })} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-sm text-white/70 hover:text-white"><Timer size={14} /> {m} min</button>
                ))}
                <button type="button" onClick={() => update({ countdownTo: null })} className="rounded-md border border-white/10 px-2.5 py-1 text-sm text-white/50 hover:text-white">Aus</button>
              </div>
            </Row>
            <Row label="Titel" sub="Zeile unter dem Countdown">
              <input value={s.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} placeholder="z. B. Heute: Ranked bis Platin" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm" />
            </Row>
          </Group>
        </div>

        <div className="rounded-md border border-white/10 bg-[#0d0d14] p-5 divide-y divide-white/10">
          <Group title="Tanzfläche">
            <Row label="Ausraster-Modus" sub="Konfetti, Strobo, wilde Tänze">
              <Choice value={s.hypeMode} onChange={(v) => update({ hypeMode: v })} options={[['auto', 'Automatisch'], ['on', 'Immer'], ['off', 'Nie']]} />
            </Row>
            {s.hypeMode === 'auto' && (
              <>
                <Row label="… ab Tänzern"><Slider value={s.hypeDancers} min={3} max={60} onChange={(v) => update({ hypeDancers: v })} /></Row>
                <Row label="… oder Nachrichten" sub="in 30 Sekunden"><Slider value={s.hypeMsgs} min={5} max={150} onChange={(v) => update({ hypeMsgs: v })} /></Row>
              </>
            )}
            <Row label="Testmodus" sub="simulierte Zuschauer schreiben und tanzen">
              <Toggle checked={!!s.demo} onChange={(v) => update({ demo: v })} label={s.demo ? 'an — vor dem Stream ausschalten' : 'aus'} />
            </Row>
            <Row label="Statisten" sub="namenlose Tänzer, zählen nicht mit"><Slider value={s.extras} min={0} max={40} onChange={(v) => update({ extras: v })} /></Row>
            <Row label="Höchstens Tänzer" sub="danach gehen die Stillsten"><Slider value={s.maxDancers} min={5} max={60} onChange={(v) => update({ maxDancers: v })} /></Row>
            <Row label="Tanzstil">
              <Choice value={s.danceStyle} onChange={(v) => update({ danceStyle: v })} options={[['auto', 'Nach Musik'], ['rave', 'Rave'], ['mixed', 'Gemischt'], ['classic', 'Klassisch']]} />
            </Row>
            <p className="pt-1 text-xs text-white/40">„Nach Musik“: ab 135 BPM nur Rave-Tänze (Jumpstyle, Shuffle, Fist Pump, Headbang …), sonst gemischt.</p>
          </Group>

          <Group title="Effekte">
            <div className="grid grid-cols-2 gap-2">
              <Toggle checked={s.effects.confetti} onChange={(v) => update({ effects: { ...s.effects, confetti: v } })} label="Konfetti" />
              <Toggle checked={s.effects.fire} onChange={(v) => update({ effects: { ...s.effects, fire: v } })} label="Feuer" />
              <Toggle checked={s.effects.strobe} onChange={(v) => update({ effects: { ...s.effects, strobe: v } })} label="Strobo (Blitzlicht)" />
              <Toggle checked={s.effects.fog} onChange={(v) => update({ effects: { ...s.effects, fog: v } })} label="Nebel & CO2" />
            </div>
          </Group>

          <Group title="Musik" hint="Takt, Bass und laufender Song kommen von deiner YTMusicApp (Overlay muss dort eingeschaltet sein).">
            <Toggle checked={s.music.enabled} onChange={(v) => update({ music: { ...s.music, enabled: v } })} label="YTMusicApp anbinden" />
            {s.music.enabled ? (
              <div className="mt-2">
                <Row label="Port" sub="Overlay-Port der YTMusicApp (Reiter Overlay, Standard 9500)">
                  <input type="number" min={1024} max={65535} value={s.music.port} onChange={(e) => update({ music: { ...s.music, port: Number(e.target.value) || 9500 } })} className="w-28 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm tabular-nums" />
                </Row>
                {s.music.port === 26538 && <p className="pb-1 text-xs text-amber-300">26538 ist der Port von Pear Desktop — hier gehört der Overlay-Port der YTMusicApp hin (Standard 9500).</p>}
                <Row label="Licht folgt dem Bass"><Toggle checked={s.music.reactive} onChange={(v) => update({ music: { ...s.music, reactive: v } })} label="" /></Row>
                {s.music.reactive && <Row label="Empfindlichkeit"><Slider value={s.music.sensitivity} min={0.4} max={2.5} step={0.1} onChange={(v) => update({ music: { ...s.music, sensitivity: v } })} /></Row>}
                <Row label="Song anzeigen" sub="oben links + auf der LED-Wand"><Toggle checked={s.music.showSong} onChange={(v) => update({ music: { ...s.music, showSong: v } })} label="" /></Row>
                <MusicTest port={s.music.port} />
              </div>
            ) : (
              <Row label="Tempo ohne Musik"><Slider value={s.bpm} min={60} max={200} onChange={(v) => update({ bpm: v })} suffix=" BPM" /></Row>
            )}
          </Group>

          <Group title="Für deine Zuschauer">
            <div className="flex items-start gap-2 text-sm text-white/70">
              <Music size={16} className="mt-0.5 shrink-0 text-white/40" />
              <span>Jeder kann sich unter <a href="/tanzfigur" className="text-violet-300 hover:underline">{origin.replace(/^https?:\/\//, '')}/tanzfigur</a> eine eigene Figur bauen — die tanzt dann hier mit.</span>
            </div>
          </Group>
        </div>
      </div>
    </div>
  );
}
