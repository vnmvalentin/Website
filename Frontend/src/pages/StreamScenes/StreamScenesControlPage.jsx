// StreamScenesControlPage.jsx — /stream-szenen: Steuerpult für die 3D-Stream-Szenen (nur Kanalbetreiber).
//
// Ein Reiter je Szene (Stream Starting, Be Right Back, Stream Ending) plus „Allgemein“ für das, was
// alle betrifft (Thema, Testmodus). Jede Szene zeigt oben ihren OBS-Link. Die Browserquellen fragen
// die Einstellungen alle 1,5 s ab (Backend /api/stream-scenes) — alles wirkt live, auch vom Handy aus.
// Musik kommt von der YTMusicApp auf dem Streamer-PC; der Test verbindet sich von hier aus direkt.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Copy, Check, Flame, PartyPopper, DoorOpen, Timer, ExternalLink, Flag, X } from 'lucide-react';
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

const TABS = [
  ['starting', 'Stream Starting'],
  ['brb', 'Be Right Back'],
  ['ending', 'Stream Ending'],
  ['general', 'Allgemein'],
];
const TAB_KEY = 'streamScenes.tab';

const BRB_DEFAULT = {
  mode: 'brb', theme: 'auto', backAt: null, text: '', showCard: true,
  race: { enabled: true, modsOnly: false, joinSec: 30, cooldownMin: 3 },
};

// ── Bausteine ───────────────────────────────────────────────────────────────
function Card({ title, hint, children, className = '' }) {
  return (
    <section className={`rounded-md border border-white/10 bg-[#101119] ${className}`}>
      <header className="border-b border-white/10 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-white/45">{hint}</p>}
      </header>
      <div className="divide-y divide-white/[0.06] px-4">{children}</div>
    </section>
  );
}

/** Eine Einstellung: Beschriftung + Erklärung links, Bedienelement rechts (auf schmalen Schirmen darunter). */
function Field({ label, hint, children, stack = false }) {
  return (
    <div className={`flex gap-x-6 gap-y-2 py-3 ${stack ? 'flex-col' : 'flex-col sm:flex-row sm:items-center'}`}>
      <div className="min-w-0 sm:w-56 sm:shrink-0">
        <div className="text-sm text-white/90">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-snug text-white/45">{hint}</div>}
      </div>
      <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${stack ? '' : 'sm:justify-end'}`}>{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="group flex items-center gap-2.5 text-sm">
      {label && <span className={checked ? 'text-white/85' : 'text-white/45'}>{label}</span>}
      <span className={`relative h-5 w-9 rounded-[4px] border transition-colors ${checked ? 'border-violet-400 bg-violet-500' : 'border-white/15 bg-white/[0.06]'}`}>
        <span className={`absolute top-[2px] h-3.5 w-3.5 rounded-[3px] bg-white transition-[left] ${checked ? 'left-[18px]' : 'left-[2px] opacity-60'}`} />
      </span>
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-white/10">
      {options.map(([v, l], i) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`whitespace-nowrap px-3 py-1.5 text-sm transition-colors ${i ? 'border-l border-white/10' : ''} ${value === v ? 'bg-violet-500/25 text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Range({ value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <div className="flex w-full items-center gap-3 sm:max-w-xs">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-violet-500" />
      <span className="w-16 text-right text-sm tabular-nums text-white/80">{step < 1 ? value.toFixed(1) : value}{suffix}</span>
    </div>
  );
}

function Btn({ onClick, icon: Icon, children, primary = false }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${primary ? 'bg-violet-600 text-white hover:bg-violet-500' : 'border border-white/15 text-white/80 hover:bg-white/[0.05]'}`}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}

function TimeButtons({ minutes, onPick, onOff }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {minutes.map((m) => (
        <button key={m} type="button" onClick={() => onPick(m)} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-sm text-white/70 hover:bg-white/[0.04] hover:text-white"><Timer size={14} /> {m} min</button>
      ))}
      <button type="button" onClick={onOff} className="rounded-md border border-white/10 px-2.5 py-1 text-sm text-white/50 hover:text-white">Aus</button>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, max }) {
  return (
    <input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 sm:max-w-xs" />
  );
}

/** OBS-Link einer Szene mit Kopieren und Vorschau. */
function SourceBar({ url, what }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-[#101119] p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56 sm:shrink-0">
        <div className="text-sm font-semibold text-white">OBS-Browserquelle</div>
        <div className="text-xs text-white/45">{what}</div>
      </div>
      <div className="flex min-w-0 flex-1 gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[13px] text-white/75" />
        <button type="button" onClick={() => { navigator.clipboard?.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); }}
          className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-white/80 hover:bg-white/[0.05]">
          {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Kopiert' : 'Kopieren'}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-white/80 hover:bg-white/[0.05]">
          <ExternalLink size={15} /> <span className="hidden sm:inline">Vorschau</span>
        </a>
      </div>
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
    <div className="my-3 rounded-md bg-black/30 px-3 py-2 text-sm">
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
        <span className="text-white/50">Keine Verbindung zu localhost:{port} — läuft die YTMusicApp mit eingeschaltetem Overlay auf diesem Port?</span>
      )}
    </div>
  );
}

const minutesLeft = (at) => (at ? Math.max(0, Math.round((at - Date.now()) / 60000)) : 0);

// ── Reiter ──────────────────────────────────────────────────────────────────
function StartingTab({ s, update, command, origin }) {
  const countdownLeft = minutesLeft(s.countdownTo);
  return (
    <div className="space-y-5">
      <SourceBar url={`${origin}/overlay/stream-starting`} what="Party-Saal, der Chat tanzt mit" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Jetzt auslösen" hint="Wirkt sofort in der laufenden Szene.">
            <div className="flex flex-wrap gap-2 py-3">
              <Btn primary icon={PartyPopper} onClick={() => command('drop', 'Drop')}>Drop</Btn>
              <Btn icon={Flame} onClick={() => command('fire', 'Feuer')}>Feuer</Btn>
              <Btn icon={DoorOpen} onClick={() => command('clearFloor', 'Fläche räumen')}>Fläche räumen</Btn>
            </div>
          </Card>
          <Card title="Countdown & Titel">
            <Field stack label="Countdown" hint={s.countdownTo && countdownLeft > 0 ? `läuft noch ca. ${countdownLeft} min` : 'aus'}>
              <TimeButtons minutes={[5, 10, 15, 20]} onPick={(m) => update({ countdownTo: Date.now() + m * 60000 })} onOff={() => update({ countdownTo: null })} />
            </Field>
            <Field label="Titel" hint="Zeile unter dem Countdown">
              <TextInput value={s.title} max={120} onChange={(v) => update({ title: v })} placeholder="z. B. Heute: Ranked bis Platin" />
            </Field>
          </Card>
          <Card title="Effekte" hint="Was beim Ausrasten und beim Drop passieren darf.">
            <Field label="Konfetti"><Switch checked={s.effects.confetti} onChange={(v) => update({ effects: { ...s.effects, confetti: v } })} /></Field>
            <Field label="Feuer"><Switch checked={s.effects.fire} onChange={(v) => update({ effects: { ...s.effects, fire: v } })} /></Field>
            <Field label="Strobo" hint="Blitzlicht"><Switch checked={s.effects.strobe} onChange={(v) => update({ effects: { ...s.effects, strobe: v } })} /></Field>
            <Field label="Nebel & CO2"><Switch checked={s.effects.fog} onChange={(v) => update({ effects: { ...s.effects, fog: v } })} /></Field>
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Tanzfläche">
            <Field label="Ausraster-Modus" hint="Konfetti, Strobo, wilde Tänze">
              <Segmented value={s.hypeMode} onChange={(v) => update({ hypeMode: v })} options={[['auto', 'Automatisch'], ['on', 'Immer'], ['off', 'Nie']]} />
            </Field>
            {s.hypeMode === 'auto' && (
              <>
                <Field label="… ab Tänzern"><Range value={s.hypeDancers} min={3} max={60} onChange={(v) => update({ hypeDancers: v })} /></Field>
                <Field label="… oder Nachrichten" hint="in 30 Sekunden"><Range value={s.hypeMsgs} min={5} max={150} onChange={(v) => update({ hypeMsgs: v })} /></Field>
              </>
            )}
            <Field stack label="Tanzstil" hint="„Nach Musik“: ab 135 BPM nur Rave-Tänze">
              <Segmented value={s.danceStyle} onChange={(v) => update({ danceStyle: v })} options={[['auto', 'Nach Musik'], ['rave', 'Rave'], ['mixed', 'Gemischt'], ['classic', 'Klassisch']]} />
            </Field>
            <Field label="Höchstens Tänzer" hint="danach gehen die Stillsten"><Range value={s.maxDancers} min={5} max={60} onChange={(v) => update({ maxDancers: v })} /></Field>
            <Field label="Statisten" hint="namenlose Tänzer, zählen nicht mit"><Range value={s.extras} min={0} max={40} onChange={(v) => update({ extras: v })} /></Field>
            <Field label="Ich am DJ-Pult" hint="deine Figur legt auf, deine Nachrichten erscheinen dort">
              <Switch checked={s.dj !== false} onChange={(v) => update({ dj: v })} />
            </Field>
          </Card>
          <Card title="Musik" hint="Takt, Bass und Song kommen von deiner YTMusicApp (Overlay dort einschalten).">
            <Field label="YTMusicApp anbinden"><Switch checked={s.music.enabled} onChange={(v) => update({ music: { ...s.music, enabled: v } })} /></Field>
            {s.music.enabled ? (
              <>
                <Field label="Port" hint="Overlay-Port der YTMusicApp (Standard 9500)">
                  <input type="number" min={1024} max={65535} value={s.music.port} onChange={(e) => update({ music: { ...s.music, port: Number(e.target.value) || 9500 } })} className="w-28 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm tabular-nums" />
                </Field>
                {s.music.port === 26538 && <p className="py-2 text-xs text-amber-300">26538 ist der Port von Pear Desktop — hier gehört der Overlay-Port der YTMusicApp hin (Standard 9500).</p>}
                <Field label="Licht folgt dem Bass"><Switch checked={s.music.reactive} onChange={(v) => update({ music: { ...s.music, reactive: v } })} /></Field>
                {s.music.reactive && <Field label="Empfindlichkeit"><Range value={s.music.sensitivity} min={0.4} max={2.5} step={0.1} onChange={(v) => update({ music: { ...s.music, sensitivity: v } })} /></Field>}
                <Field label="Song anzeigen" hint="oben links und auf der LED-Wand"><Switch checked={s.music.showSong} onChange={(v) => update({ music: { ...s.music, showSong: v } })} /></Field>
                <MusicTest port={s.music.port} />
              </>
            ) : (
              <Field label="Tempo ohne Musik"><Range value={s.bpm} min={60} max={200} onChange={(v) => update({ bpm: v })} suffix=" BPM" /></Field>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function BrbTab({ s, update, command, origin }) {
  const brb = { ...BRB_DEFAULT, ...(s.brb || {}), race: { ...BRB_DEFAULT.race, ...(s.brb?.race || {}) } };
  const set = (patch) => update({ brb: { ...brb, ...patch } });
  const setRace = (patch) => set({ race: { ...brb.race, ...patch } });
  const left = minutesLeft(brb.backAt);
  return (
    <div className="space-y-5">
      <SourceBar url={`${origin}/overlay/brb`} what="Mini-Planet, der Chat bekommt Häuser" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Szene">
            <Field label="Modus" hint={brb.mode === 'difficulties' ? 'Baustelle, grauer Himmel, du bleibst stehen' : 'du läufst über den Planeten'}>
              <Segmented value={brb.mode} onChange={(v) => set({ mode: v })} options={[['brb', 'Be Right Back'], ['difficulties', 'Störung']]} />
            </Field>
            <Field stack label="Thema" hint={brb.theme === 'auto' ? 'Halloween-Thema (Allgemein), sonst Winter im Dez–Feb, sonst Tag' : null}>
              <Segmented value={brb.theme} onChange={(v) => set({ theme: v })} options={[['auto', 'Automatisch'], ['day', 'Tag'], ['halloween', 'Halloween'], ['winter', 'Winter']]} />
            </Field>
          </Card>
          <Card title="Tafel unten links" hint="„Gleich zurück“ mit Rückkehrzeit und eigener Zeile.">
            <Field label="Tafel zeigen"><Switch checked={brb.showCard !== false} onChange={(v) => set({ showCard: v })} /></Field>
            {brb.showCard !== false && (
              <>
                <Field stack label="Zurück in" hint={left > 0 ? `noch ca. ${left} min` : brb.backAt ? 'abgelaufen — zeigt „jeden Moment“' : 'aus'}>
                  <TimeButtons minutes={[2, 5, 10, 15]} onPick={(m) => set({ backAt: Date.now() + m * 60000 })} onOff={() => set({ backAt: null })} />
                </Field>
                <Field label="Eigene Zeile" hint="unter „Gleich zurück“">
                  <TextInput value={brb.text} max={80} onChange={(v) => set({ text: v })} placeholder="z. B. Kurz Essen holen" />
                </Field>
              </>
            )}
          </Card>
          <Card title="Häuser">
            <p className="py-3 text-sm leading-relaxed text-white/60">Wer im Chat schreibt, bekommt ein Haus an der Straße, kommt heraus und winkt dir zu. Die Häuser bleiben stehen, solange die OBS-Quelle sie sich merkt (30 Tage). Freie Grundstücke tragen ein „FREI“-Schild.</p>
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Planetenlauf" hint="Chat-Rennen einmal um den Planeten. Du bleibst an der Start-/Ziellinie stehen.">
            <div className="flex flex-wrap gap-2 py-3">
              <Btn primary icon={Flag} onClick={() => command('brbRace', 'Anmeldung zum Planetenlauf')}>Anmeldung öffnen</Btn>
              <Btn icon={X} onClick={() => command('brbRaceStop', 'Abbruch')}>Abbrechen</Btn>
            </div>
            <Field label="Per Chat starten" hint="!rennen öffnet die Anmeldung, weitere !rennen machen mit"><Switch checked={brb.race.enabled} onChange={(v) => setRace({ enabled: v })} /></Field>
            {brb.race.enabled && (
              <>
                <Field label="Nur Mods öffnen" hint="Mitmachen kann trotzdem jeder"><Switch checked={brb.race.modsOnly} onChange={(v) => setRace({ modsOnly: v })} /></Field>
                <Field label="Pause zwischen Läufen" hint="gilt nicht für dich und Mods"><Range value={brb.race.cooldownMin} min={0} max={30} onChange={(v) => setRace({ cooldownMin: v })} suffix=" min" /></Field>
              </>
            )}
            <Field label="Anmeldezeit"><Range value={brb.race.joinSec} min={10} max={120} step={5} onChange={(v) => setRace({ joinSec: v })} suffix=" s" /></Field>
            <p className="py-3 text-xs leading-relaxed text-white/45">Höchstens 20 Läufer. Hindernisse: Hürden, Schlamm, Pylonen-Slalom, Turbo-Pfeile. Du und Mods können mit <span className="font-mono text-white/70">!rennen stop</span> abbrechen. Im Störungsmodus gibt es keinen Lauf.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EndingTab({ origin }) {
  return (
    <div className="space-y-5">
      <SourceBar url={`${origin}/overlay/stream-ending`} what="Kino mit Publikum und Abspann" />
      <Card title="So funktioniert es">
        <p className="py-3 text-sm leading-relaxed text-white/60">Der Abspann kommt aus Streamer.bot (Credits deines Streams). Im Kino sitzen die Namen aus dem Abspann und alle, die gerade im Chat schreiben. Diese Szene hat keine eigenen Einstellungen — Thema und Testmodus stehen unter „Allgemein“.</p>
      </Card>
    </div>
  );
}

function GeneralTab({ s, update, origin }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card title="Thema" hint="Gilt für Stream Starting und für den BRB-Planeten auf „Automatisch“.">
          <Field label="Thema" hint={s.theme === 'halloween' ? 'Kürbisse, Spinnennetze, Fledermäuse; wer keine eigene Figur hat, kommt verkleidet' : 'normale Party'}>
            <Segmented value={s.theme || 'party'} onChange={(v) => update({ theme: v })} options={[['party', 'Party'], ['halloween', 'Halloween']]} />
          </Field>
        </Card>
        <Card title="Testmodus" hint="Simulierte Zuschauer schreiben, tanzen, bekommen Häuser und laufen beim Planetenlauf mit.">
          <Field label="Testmodus" hint={s.demo ? 'an — vor dem Stream ausschalten' : 'aus'}><Switch checked={!!s.demo} onChange={(v) => update({ demo: v })} /></Field>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Für deine Zuschauer">
          <p className="py-3 text-sm leading-relaxed text-white/60">Jeder kann sich unter <a href="/tanzfigur" className="text-violet-300 hover:underline">{origin.replace(/^https?:\/\//, '')}/tanzfigur</a> eine eigene Figur bauen. Die tanzt dann im Party-Saal, sitzt im Kino und steht vor ihrem Haus auf dem Planeten.</p>
        </Card>
      </div>
    </div>
  );
}

// ── Seite ───────────────────────────────────────────────────────────────────
export default function StreamScenesControlPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [ctl, setCtl] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [tab, setTab] = useState(() => {
    try { const t = localStorage.getItem(TAB_KEY); return TABS.some(([k]) => k === t) ? t : 'starting'; } catch { return 'starting'; }
  });
  const saveTimer = useRef(0);

  useEffect(() => { document.title = 'Stream-Szenen steuern — vnmvalentin'; }, []);
  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* egal */ } }, [tab]);

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
      .then(() => { setFlash(`${label} ausgelöst`); setTimeout(() => setFlash(''), 1800); })
      .catch((e) => setError(`Fehler: ${e.message}`));
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-white">
        <h1 className="text-3xl font-extrabold">Stream-Szenen steuern</h1>
        <p className="mt-3 text-white/60">Steuerpult für die 3D-Szenen: Party zum Start, Be Right Back, Kino zum Ende — live, während sie in OBS laufen.</p>
        <button type="button" onClick={login} className="mt-6 rounded-md bg-violet-600 px-4 py-2.5 font-semibold hover:bg-violet-500">Mit Twitch anmelden</button>
      </div>
    );
  }
  if (!ctl) return <div className="mx-auto max-w-3xl px-4 py-10 text-white/50">{error || 'Lade …'}</div>;

  const s = ctl.settings;
  const origin = window.location.origin;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Stream-Szenen</h1>
          <p className="mt-1 text-sm text-white/50">Änderungen erscheinen nach 1–2 Sekunden in OBS.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.demo && <button type="button" onClick={() => update({ demo: false })} className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/15">Testmodus an — ausschalten</button>}
          {flash && <span className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300">{flash}</span>}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-white/10" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === k ? 'border-violet-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}>
            {l}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'starting' && <StartingTab s={s} update={update} command={command} origin={origin} />}
        {tab === 'brb' && <BrbTab s={s} update={update} command={command} origin={origin} />}
        {tab === 'ending' && <EndingTab origin={origin} />}
        {tab === 'general' && <GeneralTab s={s} update={update} origin={origin} />}
      </div>
    </div>
  );
}
