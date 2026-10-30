// PollsPredictionsPage.jsx — Layout-Einstellungen für die Twitch-Overlay-Module.
//
// Gestartet und beendet werden Abstimmungen und Vorhersagen in Twitch selbst —
// diese Seite legt nur fest, WIE sie im Stream aussehen. Links die Modul-Liste
// (reine Auswahl, beliebig erweiterbar), rechts die 1920x1080-Leinwand mit Drag &
// Drop und darunter die Einstellungen des gewählten Moduls — dort ist Platz für
// mehrere Spalten, und man scrollt nicht zwischen Formular und Vorschau hin und her.
// Die Widgets kommen aus OverlayWidgets.jsx und sind identisch mit dem, was die
// OBS-Quelle rendert.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Copy, Check, Eye, EyeOff, RefreshCw, BarChart3, Scale, Crosshair, Grid3x3,
  LogOut, TriangleAlert, Info, Users, Star, ArrowRight, Clapperboard, Play, Square,
  Activity, RotateCcw, TrainFront, Plane, UsersRound, CircleDot,
  ChevronDown, FlaskConical, Link2, ArrowLeft, Lock,
} from 'lucide-react';
import PremiumDialog from '../../components/PremiumDialog';
import { PREMIUM_INCLUDES, openPortal, untilText } from '../../utils/billingApi';
import { salesVisible } from '../../config/legal';
import { TwitchGlyph } from '../../components/BrandGlyphs';
import SEO from '../../components/SEO';
import StreamToolSeoContent from './seoContent';
import { ST_TITLE, ST_DESCRIPTION, ST_KEYWORDS } from './seoData';
import { buildStreamToolJsonLd } from './jsonLd';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import * as api from './streamToolApi';
import { STREAM_TOOL_SCOPES, MARBLE_REWARD_SCOPE } from './streamToolApi';
import {
  defaultConfig, mergeConfig, toPollView, toPredictionView, toGoalView, toRaidView, toStatsView,
  useDemoSim, useLinger, paintDemo, MODULE_DEFAULTS, TWITCH_GOAL_TYPES, TWITCH_GOAL_FAMILY,
  resolveTwitchGoal, STAT_METRICS, SCENE_IDS, DEMO_HYPE, demoMarbles, planeMessages,
} from './streamToolConfig';
import {
  PollWidget, PredictionWidget, GoalWidget, RaidClipWidget, StatsWidget, WidgetFrame,
  STAGE_W, STAGE_H, BAR_TEXT_MIN_H,
} from './OverlayWidgets';
import {
  HypeTrainScene, RaidStormScene, PlaneBannerScene, MarbleRunWidget, STORM_LANE_H,
} from './OverlayScenes';

const LIVE_POLL_MS = 2500;
const SAVE_DEBOUNCE_MS = 700;

/**
 * Registrierung der Overlay-Module. Ein neues Modul braucht hier eine Zeile,
 * einen Eintrag in MODULE_DEFAULTS und eine Widget-Komponente — die gesamte
 * Einstellungs-Oberfläche funktioniert dann automatisch mit.
 */
const MODULES = [
  {
    id: 'poll',
    kind: 'feed',
    label: 'Abstimmung',
    icon: BarChart3,
    hint: 'Zeigt die Umfrage, die gerade in deinem Twitch-Kanal läuft.',
    maxColors: 5,
    colorHint: 'Balkenfarben, der Reihe nach den Antworten zugeordnet.',
  },
  {
    id: 'prediction',
    kind: 'feed',
    label: 'Vorhersage',
    icon: Scale,
    hint: 'Zeigt die laufende Kanalpunkte-Vorhersage — ab drei Optionen als Anteilsleiste mit Liste.',
    maxColors: 10,
    colorHint: 'Farben der Optionen, auf Farbfehlsichtigkeit geprüft.',
  },
  {
    id: 'followerGoal',
    kind: 'goal',
    label: 'Follower-Ziel',
    icon: Users,
    hint: 'Fortschrittsbalken zu deinem Follower-Ziel.',
    maxColors: 1,
    colorHint: 'Farbe des Balkens.',
  },
  {
    id: 'subGoal',
    kind: 'goal',
    label: 'Abo-Ziel',
    icon: Star,
    hint: 'Fortschrittsbalken zu deinem Abo-Ziel. Abo-Zahlen gibt Twitch nur für Affiliates und Partner heraus.',
    maxColors: 1,
    colorHint: 'Farbe des Balkens.',
  },
  {
    id: 'streamStats',
    kind: 'stats',
    label: 'Stream-Statistik',
    icon: Activity,
    hint: 'Was seit dem Sendungsbeginn zusammengekommen ist: Follows, Abos und Bits. Beginnt mit jeder Sendung von vorn.',
    maxColors: 1,
    colorHint: 'Farbe der Zahlen.',
  },
  {
    id: 'raidClip',
    kind: 'raid',
    label: 'Clip des Raiders',
    icon: Clapperboard,
    hint: 'Raidet dich jemand, spielt das Overlay automatisch einen Clip aus dessen Kanal ab.',
    maxColors: 1,
    colorHint: 'Farbe der Raid-Überschrift.',
  },
  // Ab hier die Szenen: sie spielen quer übers Bild und haben keine Karte, die
  // man verschieben könnte (scene: true) — bis auf die Murmelbahn.
  {
    id: 'hypeTrain',
    kind: 'hype',
    scene: true,
    label: 'Hype Train',
    icon: TrainFront,
    hint: 'Startet in deinem Kanal ein Hype Train, fährt ein Zug ein. Jedes Level hängt einen Wagen an, die Teilnehmer sitzen mit ihrem Profilbild darin.',
    maxColors: 2,
  },
  {
    id: 'raidStorm',
    kind: 'storm',
    scene: true,
    label: 'Raid-Ansturm',
    icon: UsersRound,
    hint: 'Bei einem Raid rennt eine Menschenmenge durchs Bild, vorneweg der Raider mit Fahne und Zuschauerzahl.',
    maxColors: 8,
  },
  {
    id: 'planeBanner',
    kind: 'plane',
    scene: true,
    label: 'Flugzeug mit Banner',
    icon: Plane,
    hint: 'Ein Flugzeug zieht in festen Abständen deine Nachricht durchs Bild.',
    maxColors: 3,
  },
  {
    id: 'marbleRun',
    kind: 'marbles',
    label: 'Murmelbahn',
    icon: CircleDot,
    hint: 'Zuschauer melden sich im Chat an und rollen als Murmel mit ihrem Profilbild um den Sieg.',
    maxColors: 8,
    colorHint: 'Ringfarben der Murmeln, der Reihe nach verteilt.',
  },
];

const GOAL_TYPE_LABEL = (id, value) =>
  TWITCH_GOAL_TYPES[id]?.find((t) => t.value === value)?.label || value;

/* ── kleine Bausteine ─────────────────────────────────────────────────────── */

const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
    {children}
  </label>
);

/** Erklärung unter einem Feld. Bewusst knapp — die Seite soll nicht zutexten. */
const Note = ({ children }) => (
  <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">{children}</p>
);

const Field = (props) => (
  <input
    {...props}
    className={`w-full bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-violet-400 outline-none text-sm transition-colors ${props.className || ''}`}
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm focus:border-violet-400"
  >
    {children}
  </select>
);

/** Auswahl-Zeile aus gleich breiten Knöpfen — für kurze, feste Optionslisten. */
function Choice({ value, options, onChange, cols = 2 }) {
  return (
    <div className={`grid gap-1.5 mt-1.5 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map(([val, text]) => (
        <button key={val} onClick={() => onChange(val)}
          className={`px-3 py-2 rounded-lg text-[12px] font-bold border transition-colors ${
            value === val
              ? 'bg-violet-500/15 text-white border-violet-400/30'
              : 'bg-white/[0.03] text-gray-500 border-white/10 hover:text-white'
          }`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer py-1">
      <span className="relative shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="block w-9 h-5 rounded-full bg-white/10 peer-checked:bg-violet-500/40 transition-colors" />
        <span className="absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-gray-400 peer-checked:bg-violet-400 peer-checked:translate-x-4 transition-transform" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white">{label}</span>
        {description && <span className="block text-[11px] text-gray-500 leading-snug">{description}</span>}
      </span>
    </label>
  );
}

/** Kompakte Variante für Listen, in denen mehrere Haken nebeneinander stehen. */
function CheckItem({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer py-[3px] text-[12.5px] font-semibold text-gray-300 hover:text-white transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-violet-500 shrink-0" />
      {label}
    </label>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label>{label}</Label>
        <span className="text-xs font-bold text-white tabular-nums">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-violet-500" />
    </div>
  );
}

/** Hinweiskasten. 'ok' meldet einen erledigten Zustand, sonst Handlungsbedarf. */
function Callout({ tone = 'warn', children }) {
  const ok = tone === 'ok';
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 max-w-3xl border ${
      ok ? 'bg-green-500/10 border-green-500/25' : 'bg-amber-500/10 border-amber-500/30'
    }`}>
      <Info size={13} className={`shrink-0 mt-0.5 ${ok ? 'text-green-400' : 'text-amber-400'}`} />
      <p className={`text-[11.5px] leading-relaxed ${ok ? 'text-green-200' : 'text-amber-200'}`}>{children}</p>
    </div>
  );
}

/** Kleiner Knopf für Nebenhandlungen (Aktualisieren, Probelauf, Zurücksetzen). */
function MiniButton({ icon: Icon, children, spin, ...props }) {
  return (
    <button {...props}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white disabled:text-gray-600 disabled:hover:border-white/10 transition-colors">
      <Icon size={13} className={spin ? 'animate-spin' : ''} />
      {children}
    </button>
  );
}

/**
 * Ein Abschnitt der Einstellungen. Die Aufteilung ist überall dieselbe: erst
 * was das Modul zeigt, dann wie es aussieht — sonst sucht man dieselbe Sache
 * bei jedem Modul woanders.
 */
// Die Einstellungen stehen in einer schmalen Spalte rechts neben der Bühne:
// eine Gruppe unter der anderen, jede in ihrem eigenen Kasten. Abschnitte
// trennt nur eine Linie.
function Section({ title, children }) {
  return (
    <section className="border-t border-white/[0.08] pt-3.5">
      <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">{title}</h3>
      <div className="grid gap-2 [&>*]:min-w-0 [&>*]:rounded-md [&>*]:border [&>*]:border-white/10 [&>*]:bg-white/[0.03] [&>*]:p-3">
        {children}
      </div>
    </section>
  );
}

/**
 * Ohne den Chat-Bot im Kanal kommen weder Raids noch Cheers an — das gehört bei
 * beiden Modulen an die erste Stelle, sonst sucht man den Fehler bei sich.
 */
function ChatWatchNote({ watch, enabled, what }) {
  if (!watch) return null;
  // Der eingeschaltete Zustand kommt zuerst: der Bot kann längst im Kanal
  // sitzen, weil ein ANDERES Modul ihn braucht — ausgewertet wird trotzdem
  // nichts, solange dieses hier aus ist.
  if (!enabled) {
    return <Callout>Schalte das Modul oben ein — danach wertet der Chat-Bot {what} in deinem Kanal aus.</Callout>;
  }
  if (watch.watching) return <Callout tone="ok">{what} in {watch.channel} werden erkannt.</Callout>;
  // Fehlt der Bot ganz, steht das schon als Warnung über dem Modul — nicht doppelt sagen
  if (!watch.botConfigured) return null;
  return (
    <Callout>
      {!watch.botConfigured
        ? 'Auf diesem Server ist kein Chat-Bot hinterlegt. Ohne ihn lässt sich das nicht mitlesen.'
        : 'Der Chat-Bot betritt deinen Kanal gerade — das dauert bis zu einer halben Minute.'}
    </Callout>
  );
}

/* ── Clip des Raiders: eigene Einstellungen ───────────────────────────────── */

function RaidSettings({ meta, module, set, tools }) {
  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="Raids" />

      <Section title="Clip" cols={4}>
        <div>
          <Label>Auswahl</Label>
          <Choice
            value={module.pick}
            options={[['top', 'Beliebteste'], ['random', 'Bunt gemischt']]}
            onChange={(v) => set({ pick: v })}
          />
          <Note>
            {module.pick === 'top'
              ? 'Zufällig aus den fünf meistgesehenen Clips.'
              : 'Zufällig aus bis zu 50 Clips des Kanals.'}
          </Note>

          <div className="mt-4">
            <Label htmlFor={`${meta.id}-period`}>Zeitraum</Label>
            <Select id={`${meta.id}-period`} value={String(module.period)}
              onChange={(e) => set({ period: Number(e.target.value) })}>
              <option value="7">Letzte 7 Tage</option>
              <option value="30">Letzte 30 Tage</option>
              <option value="365">Letztes Jahr</option>
              <option value="0">Alle Clips</option>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <Slider label="Start nach Raid" value={module.delaySeconds ?? 0} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ delaySeconds: v })} />
          <Slider label="Spieldauer" value={module.maxSeconds} min={5} max={60} step={5} unit=" s"
            onChange={(v) => set({ maxSeconds: v })} />
          <Note>Der Vorlauf lässt deinen Raid-Alert ausreden. Längere Clips werden abgeschnitten.</Note>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor={`${meta.id}-minv`}>Ab wie vielen Zuschauern</Label>
            <Field id={`${meta.id}-minv`} type="number" min={0} className="mt-1.5" value={module.minViewers}
              onChange={(e) => set({ minViewers: Math.max(0, Number(e.target.value) || 0) })} />
            <Note>0 spielt bei jedem Raid.</Note>
          </div>
          <ToggleRow label="Raider einblenden" checked={module.showRaider !== false}
            onChange={(v) => set({ showRaider: v })} />
          <ToggleRow
            label="Ton abspielen"
            description="Nur in OBS — im Browser läuft der Clip stumm."
            checked={module.sound !== false}
            onChange={(v) => set({ sound: v })}
          />
          {module.sound !== false && (
            <Slider label="Lautstärke" value={module.volume ?? 100} min={0} max={100} step={5} unit=" %"
              onChange={(v) => set({ volume: v })} />
          )}
        </div>

      </Section>
    </>
  );
}

/* ── Szenen: gemeinsame Bausteine ─────────────────────────────────────────── */

/** Höhe der Spur und Größe — mehr Platzierung gibt es bei einer Szene nicht. */
function LaneFields({ meta, module, set, yNote }) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${meta.id}-y`}>Höhe im Bild</Label>
        <Field id={`${meta.id}-y`} type="number" className="mt-1.5" value={Math.round(module.y)}
          onChange={(e) => set({ y: Math.max(-200, Math.min(STAGE_H, Number(e.target.value) || 0)) })} />
        <Note>{yNote}</Note>
      </div>
      <Slider label="Größe" value={Math.round(module.scale * 100)} min={50} max={160} step={5} unit=" %"
        onChange={(v) => set({ scale: v / 100 })} />
    </div>
  );
}

function ColorRow({ meta, module, set, labels }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Farben</Label>
        <button onClick={() => set({ colors: [...MODULE_DEFAULTS[meta.id].colors] })}
          className="text-[11px] font-semibold text-gray-500 hover:text-violet-300 transition-colors">
          Standard
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {module.colors.slice(0, meta.maxColors).map((c, i) => (
          <input key={i} type="color" value={c} title={labels?.[i] || `Farbe ${i + 1}`}
            onChange={(e) => set({ colors: module.colors.map((old, idx) => (idx === i ? e.target.value : old)) })}
            className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
        ))}
      </div>
      {labels && <Note>{labels.join(' · ')}</Note>}
    </div>
  );
}

const DIRECTION_OPTIONS = [['right', 'Nach rechts'], ['left', 'Nach links']];

/* ── Hype Train ───────────────────────────────────────────────────────────── */

function HypeSettings({ meta, module, set, tools, tab }) {
  if (tab === 'look') {
    return (
      <Section title="Platz und Farben">
        <LaneFields meta={meta} module={module} set={set} yNote="Oberkante des Zugs. 850 stellt ihn an den unteren Rand." />
        <ColorRow meta={meta} module={module} set={set} labels={['Lok', 'Wagen']} />
      </Section>
    );
  }
  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="Cheers und Abos" />

      <Section title="Zug">
        <div>
          <Label>Fährt ein</Label>
          <Choice value={module.from} options={[['left', 'Von links'], ['right', 'Von rechts']]}
            onChange={(v) => set({ from: v })} />
          <Note>Bei jedem Level fährt der Zug hinaus und kommt mit einem Wagen mehr zurück. Ab etwa Level 6 schrumpft er, damit er ins Bild passt.</Note>
        </div>

        <div className="space-y-1">
          <ToggleRow label="3D-Zug" description="Dampflok mit Rauch, Schatten und Fahrgästen in den Fenstern und auf dem Dach. Braucht WebGL — ohne fährt der flache Zug."
            checked={module.view3d !== false} onChange={(v) => set({ view3d: v })} />
          <ToggleRow label="Fortschritt zeigen" description="Balken und Prozent bis zum nächsten Level."
            checked={module.showProgress !== false} onChange={(v) => set({ showProgress: v })} />
          <ToggleRow label="Restzeit zeigen" description="Wie lange der Zug noch läuft."
            checked={module.timer !== false} onChange={(v) => set({ timer: v })} />
          <ToggleRow label="Namen an den Bildern" description="Im flachen Zug werden die Bilder dafür etwas kleiner."
            checked={!!module.showNames} onChange={(v) => set({ showNames: v })} />
        </div>
      </Section>

      <Section title="Wer mitfährt" cols={2}>
        <Note>
          Twitch nennt nur die Spitzen-Beitragenden eines Zugs. Alle anderen erkennt der Chat-Bot an
          ihren Cheers und Abos — wer nur Kanalpunkte einsetzt, taucht deshalb nicht auf.
        </Note>
      </Section>
    </>
  );
}

/* ── Raid-Ansturm ─────────────────────────────────────────────────────────── */

function StormSettings({ meta, module, set, tools, tab }) {
  const guess = module.guessNames !== false;

  if (tab === 'look') {
    return (
      <Section title="Platz und Farben">
        <LaneFields meta={meta} module={module} set={set} yNote="Oberkante der Laufspur. 760 legt sie an den unteren Rand." />
        <ColorRow meta={meta} module={module} set={set} />
        <div>
          <Label htmlFor={`${meta.id}-accent`}>Farbe der Fahne</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input id={`${meta.id}-accent`} type="color" value={module.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
            <Note>Auch das Oberteil des Anführers.</Note>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="Raids" />

      <Section title="Ansturm" cols={4}>
        <div>
          <Label>Laufrichtung</Label>
          <Choice value={module.direction} options={DIRECTION_OPTIONS} onChange={(v) => set({ direction: v })} />
          <div className="mt-4">
            <Label htmlFor={`${meta.id}-minv`}>Ab wie vielen Zuschauern</Label>
            <Field id={`${meta.id}-minv`} type="number" min={0} className="mt-1.5" value={module.minViewers}
              onChange={(e) => set({ minViewers: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>

        <div className="space-y-4">
          <Slider label="Start nach Raid" value={module.delaySeconds ?? 0} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ delaySeconds: v })} />
          <Slider label="Höchstens Figuren" value={module.maxFigures ?? 100} min={10} max={140} step={10} unit=""
            onChange={(v) => set({ maxFigures: v })} />
          <Note>Kommen mehr Leute, laufen so viele Figuren — die echte Zahl steht auf der Fahne.</Note>
        </div>

        <div className="space-y-1">
          <ToggleRow label="Namen über den Figuren" checked={module.showNames !== false}
            onChange={(v) => set({ showNames: v })} />
          <ToggleRow
            label="Raider erkennen"
            description="Twitch nennt die Mitgekommenen nicht. Als Raider gilt, wer kurz nach dem Raid neu in deiner Zuschauerliste steht — diese Figuren tragen ihr Profilbild als Kopf."
            checked={guess}
            onChange={(v) => set({ guessNames: v })}
          />
          {guess && (
            <Note>
              Dafür muss das Overlay schon vor dem Raid laufen und der Vorlauf einige Sekunden betragen —
              Twitch zieht die Zuschauerliste verzögert nach. Figuren ohne Treffer bleiben namenlos und bekommen einen gezeichneten Kopf.
            </Note>
          )}
        </div>

      </Section>
    </>
  );
}

/* ── Flugzeug mit Banner ──────────────────────────────────────────────────── */

function PlaneSettings({ meta, module, set, tab }) {
  const count = planeMessages(module).length;
  if (tab === 'look') {
    return (
      <Section title="Platz und Farben">
        <LaneFields meta={meta} module={module} set={set} yNote="Oberkante des Flugzeugs." />
        <ColorRow meta={meta} module={module} set={set} labels={['Flugzeug', 'Banner', 'Schrift']} />
      </Section>
    );
  }
  return (
    <Section title="Flug">
      <div className="sm:col-span-2 xl:col-span-1">
        <Label htmlFor={`${meta.id}-msg`}>Nachricht</Label>
        <textarea id={`${meta.id}-msg`} rows={4} maxLength={1500} value={module.messages}
          onChange={(e) => set({ messages: e.target.value })}
          className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-violet-400 outline-none text-sm transition-colors resize-y"
          placeholder="Eine Nachricht je Zeile" />
        <Note>
          {count > 1
            ? `${count} Nachrichten — das Flugzeug nimmt bei jedem Flug die nächste.`
            : 'Eine Nachricht je Zeile. Bei mehreren wechselt das Flugzeug durch.'}
        </Note>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor={`${meta.id}-int`}>Alle wie viele Minuten</Label>
          <Field id={`${meta.id}-int`} type="number" min={1} max={240} className="mt-1.5" value={module.intervalMin}
            onChange={(e) => set({ intervalMin: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} />
          <Note>Geflogen wird nach der Uhr — bei 10 Minuten also zu jeder vollen Zehn.</Note>
        </div>
        <Slider label="Dauer eines Überflugs" value={module.flightSeconds ?? 24} min={8} max={60} step={2} unit=" s"
          onChange={(v) => set({ flightSeconds: v })} />
      </div>

      <div>
        <Label>Flugrichtung</Label>
        <Choice value={module.direction} options={DIRECTION_OPTIONS} onChange={(v) => set({ direction: v })} />
      </div>
    </Section>
  );
}

/* ── Murmelbahn ───────────────────────────────────────────────────────────── */

const MARBLE_PHASE_TEXT = {
  join: 'Anmeldung offen',
  race: 'Rennen läuft',
  done: 'Entschieden',
};

/**
 * Start per Kanalpunkte. Zwei Wege:
 *
 * 1. Die Seite legt die Belohnung selbst an (empfohlen). Dann darf sie die
 *    Einlösungen bei Twitch abfragen — ohne Textfeld — und kann sie erstatten,
 *    wenn kein Rennen zustande kommt. Braucht ein Schreibrecht.
 * 2. Eine vorhandene Belohnung über den Chat-Bot erkennen. Geht ohne
 *    zusätzliches Recht, die Belohnung braucht dafür aber ein Textfeld — nur
 *    dann schickt Twitch die Einlösung in den Chat.
 */
function RewardSettings({ module, tools }) {
  const [title, setTitle] = useState('Murmelrennen starten');
  const [cost, setCost] = useState(500);
  const setup = tools?.setup;
  const hasScope = !!tools?.status?.rewardScope;
  const active = !!module.rewardId;

  if (active) {
    return (
      <Section title="Start per Kanalpunkte">
        <div>
          <p className="text-[13px] font-semibold text-white">
            Aktiv{module.rewardTitle ? `: „${module.rewardTitle}“` : ''}
          </p>
          <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
            Die Einlösung öffnet die Anmeldung und meldet den Einlösenden gleich an.
            Ist die Anmeldung schon offen, tritt er nur bei.
          </p>
          {module.rewardManaged ? (
            <>
              {!hasScope && (
                <div className="mt-2.5">
                  <Callout>Das Recht für Kanalpunkte fehlt gerade — ohne es kommen keine Einlösungen an.</Callout>
                  <div className="mt-2"><MiniButton icon={ArrowRight} onClick={() => tools?.onGrantReward()}>Recht erneut erteilen</MiniButton></div>
                </div>
              )}
              <Note>
                Startet das Rennen, werden die Einlösungen abgeschlossen. Fällt es aus oder läuft schon
                eines, bekommen die Zuschauer ihre Punkte automatisch zurück.
              </Note>
              <Note>Preis, Bild und Abklingzeit stellst du wie gewohnt in Twitch ein. Einlösungen kommen an, solange das Overlay in OBS läuft.</Note>
            </>
          ) : (
            <Note>
              Erkannt über den Chat-Bot — die Belohnung braucht dafür ein Textfeld. Läuft schon ein Rennen,
              verfällt die Einlösung; erstatten kannst nur du in Twitch.
            </Note>
          )}
          <div className="mt-2.5">
            <MiniButton icon={Square} onClick={() => tools?.onRemoveReward()} disabled={tools?.busy}>
              {module.rewardManaged ? 'Ausschalten und Belohnung löschen' : 'Ausschalten'}
            </MiniButton>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section title="Belohnung von hier anlegen">
        <div>
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Die Seite legt die Belohnung in deinem Kanal an. Zuschauer lösen sie einfach ein — ohne
            etwas einzutippen — und bekommen ihre Punkte zurück, wenn kein Rennen zustande kommt.
          </p>
          {hasScope ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 mt-3">
                <div>
                  <Label htmlFor="reward-title">Name</Label>
                  <Field id="reward-title" className="mt-1.5" maxLength={45} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="reward-cost">Preis</Label>
                  <Field id="reward-cost" type="number" min={1} className="mt-1.5" value={cost}
                    onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
              <div className="mt-2.5">
                <MiniButton icon={Play} onClick={() => tools?.onCreateReward(title, cost)} disabled={tools?.busy || !module.enabled || !title.trim()}>
                  Belohnung anlegen
                </MiniButton>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2.5">
                <MiniButton icon={ArrowRight} onClick={() => tools?.onGrantReward()}>Recht für Kanalpunkte erteilen</MiniButton>
              </div>
              <Note>
                Dafür braucht die Seite einmalig das Recht, Kanalpunkte-Belohnungen zu verwalten — das einzige
                Schreibrecht dieses Tools. Twitch gibt Einlösungen nur der Anwendung heraus, die die Belohnung angelegt hat.
              </Note>
            </>
          )}
        </div>
      </Section>

      <Section title="Oder: vorhandene Belohnung erkennen">
        <div>
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Ohne zusätzliches Recht, über den Chat-Bot. Die Belohnung braucht dafür in Twitch die Einstellung
            „Zuschauer muss Text eingeben“ — was die Zuschauer hineinschreiben, ist egal.
          </p>
          {setup?.learning ? (
            <div className="mt-2.5"><Callout>Löse die Belohnung jetzt einmal in deinem Kanal ein. Die nächste Einlösung wird übernommen.</Callout></div>
          ) : (
            <div className="mt-2.5">
              <MiniButton icon={Crosshair} onClick={() => tools?.onLearn()} disabled={tools?.busy || !module.enabled}>
                Belohnung erkennen
              </MiniButton>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

function MarbleSettings({ meta, module, set, tools, tab }) {
  const state = tools?.state;
  const phase = state?.phase;
  const command = module.joinCommand || '!murmel';
  const setup = tools?.setup;
  const top = setup?.top || [];
  const cmd = 'text-gray-300 font-semibold';

  return (
    <>
      {tab === 'main' && (
      <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="Anmeldungen" />

      <Section title="Rennen">
        <div>
          <p className="text-[13px] font-semibold text-white">
            {phase
              ? `${MARBLE_PHASE_TEXT[phase]} · ${state.players.length} ${state.players.length === 1 ? 'Murmel' : 'Murmeln'}`
              : 'Kein Rennen offen'}
            {state?.winner && <span className="text-violet-300"> · Sieger: {state.winner.name}</span>}
          </p>
          <div className="grid grid-cols-3 gap-1.5 mt-2.5">
            <MiniButton icon={Play} onClick={() => tools?.onAction('open')} disabled={tools?.busy || phase === 'race'}>
              {phase === 'join' ? 'Neu öffnen' : 'Öffnen'}
            </MiniButton>
            <MiniButton icon={ArrowRight} onClick={() => tools?.onAction('start')}
              disabled={tools?.busy || phase !== 'join' || state.players.length < 2}>
              Starten
            </MiniButton>
            <MiniButton icon={Square} onClick={() => tools?.onAction('cancel')} disabled={tools?.busy || !phase}>
              Abbruch
            </MiniButton>
          </div>
          <Note>
            Im Chat für dich und deine Mods: <span className={cmd}>{command} open</span>,{' '}
            <span className={cmd}>{command} start</span>, <span className={cmd}>{command} stop</span>.
            Zuschauer treten mit <span className={cmd}>{command}</span> bei.
          </Note>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor={`${meta.id}-cmd`}>Befehl zum Beitreten</Label>
            <Field id={`${meta.id}-cmd`} className="mt-1.5" maxLength={25} value={module.joinCommand}
              onChange={(e) => set({ joinCommand: e.target.value.replace(/\s/g, '') })} />
          </div>
          <Slider label="Anmeldezeit" value={module.joinSeconds ?? 60} min={0} max={300} step={15} unit=" s"
            onChange={(v) => set({ joinSeconds: v })} />
          <Note>{(module.joinSeconds ?? 60) > 0 ? 'Danach startet das Rennen von allein.' : '0 = du startest von Hand.'}</Note>
        </div>

        <div className="space-y-4">
          <Slider label="Höchstens Murmeln" value={module.maxPlayers ?? 40} min={5} max={80} step={5} unit=""
            onChange={(v) => set({ maxPlayers: v })} />
          <Slider label="Länge der Bahn" value={module.sections ?? 12} min={6} max={24} step={1} unit=" Abschnitte"
            onChange={(v) => set({ sections: v })} />
          <Slider label="Sieger bleibt stehen" value={module.winnerSeconds ?? 15} min={5} max={60} step={5} unit=" s"
            onChange={(v) => set({ winnerSeconds: v })} />
        </div>
      </Section>
      </>
      )}

      {tab === 'reward' && (
        <RewardSettings module={module} tools={tools} />
      )}

      {tab === 'top' && (
      <Section title="Bestenliste">
        <div>
          {top.length ? (
            <ol className="divide-y divide-white/[0.06]">
              {top.map((e, i) => (
                <li key={`${i}-${e.name}`} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                  <span className="w-5 text-gray-500 tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate font-semibold text-white">{e.name}</span>
                  <span className="tabular-nums text-gray-300">{e.wins} {e.wins === 1 ? 'Sieg' : 'Siege'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] text-gray-500">Noch hat niemand gewonnen. Testmurmeln zählen nicht.</p>
          )}
          <Note>
            Im Chat zeigt <span className={cmd}>!murmeltop</span> die besten fünf — für alle, höchstens alle 15 Sekunden.
          </Note>
          {top.length > 0 && (
            <div className="mt-2.5">
              <MiniButton icon={RotateCcw} disabled={tools?.busy}
                onClick={() => { if (window.confirm('Bestenliste wirklich leeren?')) tools?.onResetTop(); }}>
                Liste leeren
              </MiniButton>
            </div>
          )}
        </div>
        <ToggleRow label="Auf der Anmeldekarte zeigen" description="Die drei Besten stehen im Overlay, solange die Anmeldung offen ist."
          checked={module.showTop !== false} onChange={(v) => set({ showTop: v })} />
      </Section>
      )}

      {tab === 'look' && (
      <Section title="Anzeige">
        <ToggleRow label="Im Chat ansagen" description="Der Bot meldet die Öffnung und den Sieger."
          checked={module.announce !== false} onChange={(v) => set({ announce: v })} />
        {module.announce !== false && (
          <Slider label="Siegermeldung verzögern" value={module.announceDelay ?? 6} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ announceDelay: v })} />
        )}
        <ToggleRow label="3D-Darstellung" description="Bahn mit Tiefe, Licht und Schatten. Braucht WebGL — ohne läuft sie in 2D."
          checked={module.view3d === true} onChange={(v) => set({ view3d: v })} />
        <ToggleRow label="Namen an den Murmeln" description="Bei den sechs vordersten."
          checked={module.showNames !== false} onChange={(v) => set({ showNames: v })} />
        <ToggleRow label="Countdown der Anmeldung" checked={module.timer !== false}
          onChange={(v) => set({ timer: v })} />
      </Section>
      )}
    </>
  );
}

/* ── Stream-Statistik: eigene Einstellungen ───────────────────────────────── */

/** "vor 2 Std." für die Zeile, die den erkannten Sendungsbeginn bestätigt. */
function sinceText(ms) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return `seit ${min} min`;
  return `seit ${Math.floor(min / 60)} Std. ${String(min % 60).padStart(2, '0')} min`;
}

function StatsSettings({ meta, module, set, tools }) {
  const show = module.show || {};
  const live = tools?.stats;

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="Cheers und Abos" />

      <Section title="Inhalt" cols={4}>
        <div>
          <Label htmlFor={`${meta.id}-label`}>Überschrift</Label>
          <Field id={`${meta.id}-label`} className="mt-1.5" maxLength={26} value={module.label}
            placeholder="Dieser Stream" onChange={(e) => set({ label: e.target.value })} />
          {module.showHead === false && <Note>Wird nicht gezeigt, solange die Kopfzeile aus ist.</Note>}
        </div>

        <div>
          <Label>Kennzahlen</Label>
          <div className="mt-1.5">
            {STAT_METRICS.map((mtr) => (
              <CheckItem key={mtr.key} label={mtr.label} checked={!!show[mtr.key]}
                onChange={(v) => set({ show: { ...show, [mtr.key]: v } })} />
            ))}
          </div>
          <Note>Alles zählt ab dem Beginn der laufenden Sendung.</Note>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Als Abo zählen</Label>
            <div className="mt-1.5">
              <CheckItem label="Verlängerungen" checked={module.countResubs !== false}
                onChange={(v) => set({ countResubs: v })} />
              <CheckItem label="Geschenkte Abos" checked={module.countGifts !== false}
                onChange={(v) => set({ countGifts: v })} />
            </div>
            <Note>Neuabos zählen immer mit.</Note>
          </div>
        </div>

        <div className="space-y-3">
          <ToggleRow label="Kopfzeile anzeigen" description="Überschrift und Live-Schild über den Zahlen."
            checked={module.showHead !== false} onChange={(v) => set({ showHead: v })} />
          {module.showHead !== false && (
            <ToggleRow label="Live-Kennzeichen" description="Kleines Schild, solange Twitch dich als live führt."
              checked={module.liveDot !== false} onChange={(v) => set({ liveDot: v })} />
          )}
          <ToggleRow label="Offline ausblenden" description="Sonst bleiben die Zahlen der letzten Sendung stehen."
            checked={!!module.hideOffline} onChange={(v) => set({ hideOffline: v })} />

          <div>
            <MiniButton icon={RotateCcw} onClick={tools?.onReset} disabled={tools?.busy || !live} spin={tools?.busy}>
              Zähler zurücksetzen
            </MiniButton>
            <Note>
              {live
                ? `Sendung erkannt, ${sinceText(live.startedAt)}${live.live ? '' : ' (beendet)'}.`
                : 'Sobald du live gehst, erkennt das Overlay die Sendung von selbst.'}
            </Note>
            {tools?.note && <p className="text-[11px] font-semibold text-green-400 mt-1.5">{tools.note}</p>}
          </div>
        </div>
      </Section>

      <Section title="Anordnung" cols={3}>
        <div>
          <Label>Aufbau</Label>
          <Choice
            value={module.layout}
            cols={3}
            options={[['row', 'Nebeneinander'], ['column', 'Untereinander'], ['list', 'Liste']]}
            onChange={(v) => set({ layout: v })}
          />
          <Note>
            {module.layout === 'list'
              ? 'Schmale Liste: Beschriftung links, Zahl rechts.'
              : 'Jede Kennzahl als eigener Block mit Beschriftung und Zahl.'}
          </Note>
        </div>

        <div>
          <Label>Beschriftung</Label>
          <Choice
            value={module.capPos === 'bottom' ? 'bottom' : 'top'}
            options={[['top', 'Über der Zahl'], ['bottom', 'Unter der Zahl']]}
            onChange={(v) => set({ capPos: v })}
          />
          {module.layout === 'list' && <Note>In der Liste steht sie immer links.</Note>}
        </div>

        <div>
          <Label>Ausrichtung</Label>
          <Choice
            value={module.align === 'left' ? 'left' : 'center'}
            options={[['center', 'Mittig'], ['left', 'Linksbündig']]}
            onChange={(v) => set({ align: v })}
          />
          <Note>
            {module.layout === 'list'
              ? 'Die Liste richtet sich immer selbst aus.'
              : module.align === 'left'
                ? 'Kästchen so breit wie ihr Inhalt.'
                : 'Gleich breite Kästchen, Wort und Zahl sitzen genau übereinander.'}
          </Note>
        </div>
      </Section>
    </>
  );
}

/* ── Ziele: eigene Einstellungen ──────────────────────────────────────────── */

/** Vorschautexte der drei Ziel-Formen — sagen mehr als eine Beschreibung. */
const GOAL_LAYOUT_NOTE = {
  full: 'Beschriftung, große Zahl und Balken darunter — drei Zeilen.',
  inline: 'Beschriftung oben, Zahlen im Balken — eine Zeile weniger.',
  bar: 'Nur der Balken, Beschriftung und Zahlen stehen darin — am kompaktesten.',
};

function GoalSettings({ meta, module, set, tools }) {
  const variant = module.goalLayout || 'full';
  const compact = variant !== 'full';

  return (
    <>
    <Section title="Ziel" cols={3}>
      <div>
        <Label>Zielwert kommt von</Label>
        <Choice
          value={module.source}
          options={[['twitch', 'Twitch-Ziel'], ['manual', 'Eigenes Ziel']]}
          onChange={(v) => set({ source: v })}
        />
        <Note>
          {module.source === 'twitch'
            ? 'Zielwert, Beschreibung und Fortschritt kommen aus deinem Creator-Dashboard — inklusive automatischer Erhöhung.'
            : 'Zielwert und Fortschritt rechnet das Overlay selbst. Praktisch ohne gesetztes Twitch-Ziel.'}
        </Note>
      </div>

      {module.source === 'twitch' && TWITCH_GOAL_TYPES[meta.id]?.length > 1 && (
        <div>
          <Label htmlFor={`${meta.id}-ttype`}>Welches Twitch-Ziel</Label>
          <Select id={`${meta.id}-ttype`} value={module.twitchType}
            onChange={(e) => set({ twitchType: e.target.value })}>
            {TWITCH_GOAL_TYPES[meta.id].map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
          <Note>
            {module.twitchType === 'auto'
              ? 'Nimmt das Ziel, das in deinem Creator-Dashboard wirklich aktiv ist.'
              : 'Fest gewählt — läuft dort ein Ziel anderen Typs, bleibt das Modul leer.'}
          </Note>
        </div>
      )}

      {tools && (
        <div>
          <Label>Stand von Twitch</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <MiniButton icon={RefreshCw} onClick={tools.onRefresh} disabled={tools.busy || !tools.connected}
              spin={tools.busy}>
              {tools.busy ? 'Lade…' : 'Jetzt aktualisieren'}
            </MiniButton>
            {tools.note && <span className="text-[11px] font-semibold text-green-400">{tools.note}</span>}
          </div>
          <Note>
            Kommt sonst alle 30 Sekunden von selbst.
            {tools.detected?.length > 0 && (
              <> Twitch meldet gerade:{' '}
                <span className="text-gray-300 font-semibold">
                  {tools.detected.map((t) => GOAL_TYPE_LABEL(meta.id, t)).join(', ')}
                </span>
              </>
            )}
          </Note>
        </div>
      )}

      <div>
        <Label htmlFor={`${meta.id}-label`}>Beschriftung</Label>
        <Field id={`${meta.id}-label`} className="mt-1.5" maxLength={30} value={module.label}
          onChange={(e) => set({ label: e.target.value })} placeholder="Follower-Ziel" />
        {module.source === 'twitch' && <Note>Leer lassen übernimmt die Beschreibung aus dem Creator-Dashboard.</Note>}
      </div>

      {module.source === 'manual' && (
        <>
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${meta.id}-target`}>Ziel</Label>
                <Field id={`${meta.id}-target`} type="number" min={1} className="mt-1.5" value={module.target}
                  onChange={(e) => set({ target: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div>
                <Label htmlFor={`${meta.id}-start`}>Startwert</Label>
                <Field id={`${meta.id}-start`} type="number" min={0} className="mt-1.5" value={module.startAt}
                  onChange={(e) => set({ startAt: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <Note>Startwert 0 zählt ab null. Trage deinen Stand ein, wenn das Ziel erst ab jetzt gelten soll.</Note>
          </div>
          <div>
            <Label htmlFor={`${meta.id}-inc`}>Automatisch erhöhen um</Label>
            <Field id={`${meta.id}-inc`} type="number" min={0} className="mt-1.5" value={module.autoIncrease}
              onChange={(e) => set({ autoIncrease: Math.max(0, Number(e.target.value) || 0) })} />
            <Note>0 = aus. Sonst steigt der Zielwert nach jedem Erreichen weiter.</Note>
            {meta.id === 'subGoal' && (
              <div className="mt-3">
                <ToggleRow
                  label="Abo-Punkte statt Abos"
                  description="Twitch zählt Tier 2 doppelt und Tier 3 sechsfach."
                  checked={!!module.usePoints}
                  onChange={(v) => set({ usePoints: v })}
                />
              </div>
            )}
          </div>
        </>
      )}
    </Section>

    <Section title="Balken" cols={3}>
      <div>
        <Label>Form</Label>
        <Choice
          value={variant}
          cols={3}
          options={[['full', 'Ausführlich'], ['inline', 'Kompakt'], ['bar', 'Nur Balken']]}
          onChange={(v) => set({ goalLayout: v })}
        />
        <Note>{GOAL_LAYOUT_NOTE[variant]}</Note>
      </div>

      <div>
        <Slider label="Höhe" value={module.barHeight ?? 14} min={8} max={56} step={2} unit=" px"
          onChange={(v) => set({ barHeight: v })} />
        {compact && (module.barHeight ?? 14) < BAR_TEXT_MIN_H && (
          <Note>Für Text im Balken gelten mindestens {BAR_TEXT_MIN_H} px — darunter wird die Höhe angehoben.</Note>
        )}
      </div>

      <ToggleRow label="Prozent anzeigen" description="Sonst stehen dort nur der Stand und der Zielwert."
        checked={module.showPercent !== false} onChange={(v) => set({ showPercent: v })} />
    </Section>
    </>
  );
}

/* ── Abstimmung & Vorhersage: die beiden eigenen Schalter ─────────────────── */

function FeedSettings({ meta, module, set }) {
  const head = module.showHead !== false;
  return (
    <Section title="Anzeige" cols={2}>
      <div className="space-y-1">
        <ToggleRow
          label="Kopfzeile anzeigen"
          description={`Zeile über der Frage: „${meta.label}“, Status und Timer.`}
          checked={head}
          onChange={(v) => set({ showHead: v })}
        />
        {/* Der Timer sitzt in der Kopfzeile — ohne sie gibt es nichts zu schalten */}
        {head && (
          <ToggleRow label="Timer anzeigen" description="Restzeit rechts in der Kopfzeile."
            checked={module.timer} onChange={(v) => set({ timer: v })} />
        )}
      </div>
      {meta.id === 'prediction' && (
        <ToggleRow
          label="Bei Sperrung ausblenden"
          description="Verschwindet, sobald die Einsätze zu sind — und kommt zum Ergebnis zurück."
          checked={!!module.hideWhileLocked}
          onChange={(v) => set({ hideWhileLocked: v })}
        />
      )}
    </Section>
  );
}

/* ── Einstellungen eines Moduls ───────────────────────────────────────────── */

/** Reiter der Einstellungen. Ohne eigenen Eintrag: was das Modul tut / wie es aussieht. */
const SETTING_TABS = {
  marbles: [['main', 'Rennen'], ['reward', 'Kanalpunkte'], ['top', 'Bestenliste'], ['look', 'Aussehen']],
};
const DEFAULT_SETTING_TABS = [['main', 'Verhalten'], ['look', 'Aussehen']];

/**
 * Der Aufrufer hängt die Komponente per key ans Modul — beim Wechsel beginnt
 * sie also wieder auf dem ersten Reiter.
 */
function ModuleSettings({ meta, module, onChange, warning, goalTools, raidTools, statsTools, sceneTools }) {
  const set = (patch) => onChange(patch);
  const tabs = SETTING_TABS[meta.kind] || DEFAULT_SETTING_TABS;
  const [tab, setTab] = useState('main');
  const main = tab === 'main';

  return (
    <div>
      {/* Unterstrich-Reiter, bleiben beim Blättern oben stehen */}
      <div className="sticky top-0 z-10 flex gap-5 px-4 border-b border-white/10 bg-[#0f0f16]" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-10 -mb-px border-b-2 text-[12.5px] font-bold transition-colors ${
              tab === id ? 'border-violet-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

    <div className="p-4 space-y-4">
      {main && <p className="text-[11.5px] text-gray-500 leading-relaxed max-w-3xl">{meta.hint}</p>}
      {warning && <Callout>{warning}</Callout>}

      {main && meta.kind === 'feed' && <FeedSettings meta={meta} module={module} set={set} />}
      {main && meta.kind === 'goal' && <GoalSettings meta={meta} module={module} set={set} tools={goalTools} />}
      {main && meta.kind === 'stats' && <StatsSettings meta={meta} module={module} set={set} tools={statsTools} />}
      {main && meta.kind === 'raid' && <RaidSettings meta={meta} module={module} set={set} tools={raidTools} />}
      {meta.kind === 'hype' && <HypeSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'storm' && <StormSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'plane' && <PlaneSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'marbles' && <MarbleSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}

      {/* Aussehen und Platzierung — bei jeder Karte dasselbe. Szenen bringen
          Höhe, Größe und Farben in ihrem eigenen Reiter mit. */}
      {!meta.scene && tab === 'look' && (
      <Section title="Platz und Farben">
        <div>
          <Label>Position</Label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <Field aria-label="Position X" type="number" value={Math.round(module.x)}
              onChange={(e) => set({ x: Number(e.target.value) || 0 })} />
            <Field aria-label="Position Y" type="number" value={Math.round(module.y)}
              onChange={(e) => set({ y: Number(e.target.value) || 0 })} />
          </div>
          <Note>X und Y in Bildpunkten</Note>
        </div>

        <div className="space-y-4">
          <Slider label="Größe" value={Math.round(module.scale * 100)} min={50} max={180} step={5} unit=" %"
            onChange={(v) => set({ scale: v / 100 })} />
          <Slider label="Deckkraft" value={module.opacity} min={0} max={100} step={5} unit=" %"
            onChange={(v) => set({ opacity: v })} />
        </div>

        <div>
          <Label htmlFor={`${meta.id}-accent`}>Akzentfarbe</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input id={`${meta.id}-accent`} type="color" value={module.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
            <Field value={module.accent} maxLength={7} className="!text-xs tabular-nums"
              onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set({ accent: e.target.value })} />
          </div>

          <div className="mt-4">
            <Label htmlFor={`${meta.id}-anim`}>Einblenden</Label>
            <Select id={`${meta.id}-anim`} value={module.anim} onChange={(e) => set({ anim: e.target.value })}>
              <option value="up">Slide hoch</option>
              <option value="fade">Fade</option>
              <option value="left">Slide von links</option>
              <option value="right">Slide von rechts</option>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Farben</Label>
            <button onClick={() => set({ colors: [...MODULE_DEFAULTS[meta.id].colors] })}
              className="text-[11px] font-semibold text-gray-500 hover:text-violet-300 transition-colors">
              Standard
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {module.colors.slice(0, meta.maxColors).map((c, i) => (
              <input key={i} type="color" value={c} title={`Option ${i + 1}`}
                onChange={(e) => set({ colors: module.colors.map((old, idx) => (idx === i ? e.target.value : old)) })}
                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
            ))}
          </div>
          <Note>{meta.colorHint}</Note>

          {/* Beim Raid-Clip nicht anbieten: die Unschärfe hinter der Karte
              hindert Twitch daran, den Clip von allein zu starten. Die
              Murmelbahn ist ebenfalls immer flach (großer Canvas). */}
          {meta.id !== 'raidClip' && meta.id !== 'marbleRun' && (
            <div className="mt-4">
              <ToggleRow label="Glassmorphism" description="Weiche Unschärfe hinter der Karte."
                checked={module.glass} onChange={(v) => set({ glass: v })} />
            </div>
          )}
        </div>
      </Section>
      )}
    </div>
    </div>
  );
}

/* ── Kopfleiste: Knöpfe und Aufklapp-Menüs ────────────────────────────────── */

const BAR_BUTTON =
  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] font-bold transition-colors';
const barButton = (active) =>
  `${BAR_BUTTON} ${active
    ? 'border-violet-400/40 bg-violet-500/15 text-white'
    : 'border-white/10 text-gray-300 hover:text-white hover:border-white/25'}`;

/** Knopf in der Kopfleiste, der ein Menü darunter aufklappt. */
function BarMenu({ label, icon: Icon, width = 340, mark, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={barButton(open)}>
        <Icon size={14} />
        <span className="hidden md:inline">{label}</span>
        {mark && <span className="w-1.5 h-1.5 rounded-sm bg-amber-400" />}
        <ChevronDown size={12} className="text-gray-500" />
      </button>
      {open && (
        <>
          {/* Klick daneben schließt */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-20 rounded-md border border-white/10 bg-[#14141c] shadow-xl max-h-[80dvh] overflow-y-auto custom-scrollbar"
            style={{ width, maxWidth: 'calc(100vw - 16px)' }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/** Eine Zeile im Test-Menü: was passiert, Start, Stopp. */
function TestItem({ title, text, off, busy, onStart, onStop, children }) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">{title}</p>
          <p className="text-[11px] text-gray-500 leading-snug">{off ? 'Modul ist ausgeschaltet.' : text}</p>
        </div>
        {onStop && (
          <button type="button" onClick={onStop} title="Beenden" disabled={off}
            className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md border border-white/10 text-gray-500 hover:text-white hover:border-white/25 disabled:opacity-40 transition-colors">
            <Square size={12} />
          </button>
        )}
        <button type="button" onClick={onStart} disabled={off || busy}
          className="h-8 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white text-[12px] font-bold transition-colors">
          <Play size={12} />
          Start
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * Alle Probeläufe an einem Ort. Vorher saß jeder beim eigenen Modul zwischen
 * den Einstellungen — zum Ausprobieren musste man sich durchklicken.
 * Jeder Probelauf erscheint in der Vorschau UND in der OBS-Quelle.
 */
function TestMenu({ modules, busy, note, demoOn, setDemoOn, demoOutcomes, setDemoOutcomes, onScene, onStopScene, onRaid, onStopRaid, onMarbles }) {
  const [viewers, setViewers] = useState(40);
  const [channel, setChannel] = useState('');
  const small = 'mt-2 w-full bg-[#1a1a22] border border-white/10 rounded-md px-2.5 py-1.5 text-white placeholder-gray-600 focus:border-violet-400 outline-none text-[12px]';

  return (
    <div className="divide-y divide-white/[0.08]">
      <div className="px-3.5 py-3">
        <ToggleRow label="Demo-Daten in der Vorschau"
          description="Beispielwerte, solange in deinem Kanal nichts läuft. Nur hier, nie in OBS."
          checked={demoOn} onChange={setDemoOn} />
        {demoOn && (
          <div className="flex items-center gap-2 mt-2 pl-12">
            <span className="text-[11px] text-gray-500">Vorhersage mit</span>
            {[2, 4].map((n) => (
              <button key={n} type="button" onClick={() => setDemoOutcomes(n)}
                className={`h-6 px-2 rounded-sm border text-[11px] font-bold transition-colors ${
                  demoOutcomes === n ? 'border-violet-400/40 bg-violet-500/15 text-white' : 'border-white/10 text-gray-500 hover:text-white'
                }`}>
                {n} Optionen
              </button>
            ))}
          </div>
        )}
      </div>

      <TestItem title="Hype Train" text="Fährt ein, steigt alle 10 s ein Level auf (bis Level 4), fährt ab."
        off={!modules.hypeTrain.enabled} busy={busy}
        onStart={() => onScene('hype')} onStop={() => onStopScene('hype')} />

      <TestItem title="Raid-Ansturm" text="Eine Menge rennt durchs Bild, vorneweg dein eigener Kanal."
        off={!modules.raidStorm.enabled} busy={busy}
        onStart={() => onScene('storm', viewers)} onStop={() => onStopScene('storm')}>
        <label className="flex items-center gap-2 text-[11px] text-gray-500">
          <span className="mt-2 shrink-0">Zuschauer</span>
          <input type="number" min={1} max={5000} value={viewers} className={small}
            onChange={(e) => setViewers(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </TestItem>

      <TestItem title="Flugzeug mit Banner" text="Startet sofort einen Überflug mit der nächsten Nachricht."
        off={!modules.planeBanner.enabled || !planeMessages(modules.planeBanner).length} busy={busy}
        onStart={() => onScene('plane')} />

      <TestItem title="Murmelbahn" text="Probe-Rennen mit zwölf Testmurmeln. Zählt nicht für die Bestenliste."
        off={!modules.marbleRun.enabled} busy={busy}
        onStart={onMarbles} onStop={() => onStopScene('marbles')} />

      <TestItem title="Clip des Raiders" text="Spielt einen Clip des angegebenen Kanals ab, samt Vorlauf."
        off={!modules.raidClip.enabled} busy={busy || !channel.trim()}
        onStart={() => onRaid(channel)} onStop={onStopRaid}>
        <input value={channel} maxLength={30} placeholder="twitch-kanal" className={small}
          onChange={(e) => setChannel(e.target.value)} />
        {note && <p className="text-[11px] font-semibold text-green-400 mt-1.5">{note}</p>}
      </TestItem>
    </div>
  );
}

/* ── OBS-Link ─────────────────────────────────────────────────────────────── */

function ObsLinkSection({ overlayKey, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(true);
  const link = overlayKey ? `${window.location.origin}/twitch-tools/overlay/${overlayKey}` : '';

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const iconButton = 'w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md border border-white/10 text-gray-500 hover:text-white hover:border-white/25 transition-colors';

  return (
    <div className="p-3.5 space-y-3">
      <div>
        <p className="text-[13px] font-bold text-white">OBS-Browserquelle</p>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
          Eine Quelle für alle Module, Breite 1920 und Höhe 1080. Den Link nicht im Stream zeigen.
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`flex-1 min-w-0 h-8 flex items-center bg-[#1a1a22] border border-white/10 rounded-md px-2.5 text-gray-400 text-[11px] truncate ${hidden ? 'blur-sm select-none' : ''}`}>
          <span className="truncate">{link || 'Lade…'}</span>
        </div>
        <button type="button" onClick={() => setHidden((v) => !v)} title={hidden ? 'Anzeigen' : 'Verbergen'} className={iconButton}>
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
      <button type="button" onClick={copy} disabled={!link}
        className="w-full h-8 inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white text-[12px] font-bold transition-colors">
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Kopiert' : 'Link kopieren'}
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-gray-500">Zum Ausrichten <span className="text-gray-300">?demo=1</span> anhängen.</p>
        <button type="button" onClick={onRegenerate} disabled={!overlayKey}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-red-400 transition-colors">
          <RefreshCw size={11} />
          Neuen Link erzeugen
        </button>
      </div>
    </div>
  );
}

/* ── Hauptseite ───────────────────────────────────────────────────────────── */

export default function PollsPredictionsPage() {
  const { user, login, accessToken } = useContext(TwitchAuthContext);

  const [config, setConfig] = useState(() => defaultConfig());
  const [overlayKey, setOverlayKey] = useState(null);
  const [connected, setConnected] = useState(false);
  const [twitchLogin, setTwitchLogin] = useState('');
  const [live, setLive] = useState({ poll: null, prediction: null, goals: null, raid: null, stats: null, scenes: null, notice: null });
  const [missingGoalScopes, setMissingGoalScopes] = useState([]);
  const [hasTwitchGoalScope, setHasTwitchGoalScope] = useState(true);
  const [chatWatch, setChatWatch] = useState(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalNote, setGoalNote] = useState('');
  const [raidBusy, setRaidBusy] = useState(false);
  const [raidNote, setRaidNote] = useState('');
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsNote, setStatsNote] = useState('');
  const [sceneStatus, setSceneStatus] = useState(null);
  // Abo: Stand des Nutzers und welche Module dazugehören (kommt mit /me vom Backend)
  const [premium, setPremium] = useState(null);
  const [premiumModules, setPremiumModules] = useState([]);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [marbleSetup, setMarbleSetup] = useState(null);
  const [selected, setSelected] = useState('poll'); // hervorgehoben auf der Leinwand
  const [demoOn, setDemoOn] = useState(true);
  const [demoOutcomes, setDemoOutcomes] = useState(2);
  const [gridOn, setGridOn] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, tick] = useState(0);

  const flash = (msg) => { setError(msg); setTimeout(() => setError(''), 5000); };

  // Wer die Start-Belohnung von der Seite anlegen lässt, braucht ein Recht mehr.
  // Es muss bei JEDER späteren Anmeldung wieder mit angefragt werden — sonst
  // kommt ein Token ohne es zurück und die Einlösungen bleiben aus.
  const REWARD_FLAG = 'stWantsRewardScope';
  const wantsRewardScope = (() => { try { return sessionStorage.getItem(REWARD_FLAG) === '1'; } catch { return false; } })();
  const loginScopes = config.modules.marbleRun.rewardManaged || wantsRewardScope
    ? [...STREAM_TOOL_SCOPES, MARBLE_REWARD_SCOPE]
    : STREAM_TOOL_SCOPES;

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);
  const clockOffset = useRef(0);

  /* ── Laden ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    api.getMe()
      .then((d) => {
        setOverlayKey(d.overlayKey);
        setConnected(d.connected);
        setTwitchLogin(d.twitchLogin || '');
        setMissingGoalScopes(d.missingGoalScopes || []);
        setHasTwitchGoalScope(d.hasTwitchGoalScope !== false);
        setChatWatch(d.chatWatch || null);
        setSceneStatus(d.sceneStatus || null);
        setPremium(d.premium || null);
        setPremiumModules(d.premiumModules || []);
        if (d.config) setConfig(mergeConfig(d.config));
        clockOffset.current = d.serverNow - Date.now();
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  /* ── Rückkehr von der Bezahlseite ───────────────────────────────────────── */
  // Stripe meldet das Abo per Webhook ans Backend — das kann ein paar Sekunden nach der
  // Rückkehr sein. Deshalb wird der Stand kurz nachgefragt, bis das Abo da ist.
  const [aboNote, setAboNote] = useState('');
  useEffect(() => {
    if (!user) return undefined;
    const params = new URLSearchParams(window.location.search);
    const abo = params.get('abo');
    if (!abo) return undefined;
    params.delete('abo');
    window.history.replaceState(null, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    if (abo !== 'ok') return undefined;
    setAboNote('Danke! Dein Abo wird gerade freigeschaltet …');
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      api.getMe()
        .then((d) => {
          if (d.premium?.active) {
            setPremium(d.premium);
            setAboNote('Dein Abo ist aktiv — die Szenen sind freigeschaltet.');
            clearInterval(id);
            setTimeout(() => setAboNote(''), 8000);
          } else if (tries >= 10) {
            setAboNote('Die Zahlung ist noch nicht bestätigt. Lade die Seite in einer Minute neu.');
            clearInterval(id);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [user]);

  /* ── Speichern (gebündelt) ──────────────────────────────────────────────── */
  // Das Backend erkennt am gespeicherten Stand, ob sich an den Zielen etwas
  // geändert hat, und wirft dann seinen Zwischenspeicher weg — der nächste
  // Live-Abruf zeigt das neue Ziel also ohne Zutun. Deshalb wird hier die
  // gesamte Konfiguration übergeben (inkl. Version), nicht nur die Module.
  const saveTimer = useRef(0);
  const patchModule = useCallback((id, patch) => {
    setConfig((prev) => {
      const next = { ...prev, modules: { ...prev.modules, [id]: { ...prev.modules[id], ...patch } } };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api.saveConfig(next)
          .then((r) => { if (r?.chatWatch) setChatWatch(r.chatWatch); })
          .catch(() => {});
      }, SAVE_DEBOUNCE_MS);
      return next;
    });
  }, []);

  /* ── Live-Stand ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || !connected) return undefined;
    let alive = true;
    const load = () => {
      api.getLive()
        .then((d) => {
          if (!alive) return;
          clockOffset.current = d.serverNow - Date.now();
          setLive({ poll: d.poll, prediction: d.prediction, goals: d.goals, raid: d.raid, stats: d.stats, scenes: d.scenes, notice: d.notice });
          setMarbleSetup(d.marbleSetup || null);
          if (d.chatWatch) setChatWatch(d.chatWatch);
          if (!d.connected) setConnected(false);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, LIVE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [user, connected]);

  /* ── Ziele sofort neu holen ─────────────────────────────────────────────── */
  const refreshGoals = useCallback(async () => {
    setGoalBusy(true);
    setGoalNote('');
    try {
      const d = await api.refreshGoals();
      setLive((prev) => ({ ...prev, goals: d.goals }));
      setMissingGoalScopes(d.missingGoalScopes || []);
      setHasTwitchGoalScope(d.hasTwitchGoalScope !== false);
      setGoalNote('Aktualisiert');
      setTimeout(() => setGoalNote(''), 2500);
    } catch (e) {
      flash(e.message);
    } finally {
      setGoalBusy(false);
    }
  }, []);

  /* ── Raid-Probelauf ─────────────────────────────────────────────────────── */
  const testRaid = useCallback(async (login) => {
    setRaidBusy(true);
    setRaidNote('');
    try {
      // Erst den noch offenen Speichervorgang abschließen: sonst sagt der
      // Probelauf "Modul ist aus", wenn man es gerade eben eingeschaltet hat.
      clearTimeout(saveTimer.current);
      await api.saveConfig(configRef.current).catch(() => {});
      const d = await api.testRaid(login);
      setLive((prev) => ({ ...prev, raid: d.event }));
      if (d.warning) {
        flash(d.warning);
      } else if (d.event?.clip) {
        const wait = Number(d.event.delaySeconds) || 0;
        setRaidNote(wait > 0 ? `Startet in ${wait} s: „${d.event.clip.title}“` : `Läuft: „${d.event.clip.title}“`);
      } else {
        setRaidNote('Raid ausgelöst — ohne Clip bleibt das Overlay aus.');
      }
      setTimeout(() => setRaidNote(''), 10000);
    } catch (e) {
      flash(e.message);
    } finally {
      setRaidBusy(false);
    }
  }, []);

  const stopRaid = useCallback(async () => {
    try {
      await api.stopRaid();
      setLive((prev) => ({ ...prev, raid: null }));
      setRaidNote('');
    } catch (e) { flash(e.message); }
  }, []);

  /* ── Statistik-Zähler zurücksetzen ──────────────────────────────────────── */
  const resetStats = useCallback(async () => {
    setStatsBusy(true);
    setStatsNote('');
    try {
      const d = await api.resetStats();
      setLive((prev) => ({ ...prev, stats: d.stats }));
      setStatsNote('Zurückgesetzt');
      setTimeout(() => setStatsNote(''), 2500);
    } catch (e) {
      flash(e.message);
    } finally {
      setStatsBusy(false);
    }
  }, []);

  /* ── Szenen: Probeläufe und Murmelbahn ──────────────────────────────────── */
  const refreshLive = useCallback(async () => {
    const d = await api.getLive();
    clockOffset.current = d.serverNow - Date.now();
    setLive({ poll: d.poll, prediction: d.prediction, goals: d.goals, raid: d.raid, stats: d.stats, scenes: d.scenes, notice: d.notice });
    setMarbleSetup(d.marbleSetup || null);
  }, []);

  /** Führt eine Szenen-Aktion aus und holt den Stand sofort nach, statt auf den Takt zu warten. */
  const runScene = useCallback(async (call) => {
    setSceneBusy(true);
    try {
      // Erst den offenen Speichervorgang abschließen — sonst gilt ein eben
      // eingeschaltetes Modul für das Backend noch als aus.
      clearTimeout(saveTimer.current);
      await api.saveConfig(configRef.current).catch(() => {});
      await call();
      await refreshLive().catch(() => {});
    } catch (e) {
      flash(e.message);
    } finally {
      setSceneBusy(false);
    }
  }, [refreshLive]);

  const testScene = useCallback((key, arg) => runScene(() => (
    key === 'hype' ? api.testHypeTrain() : key === 'storm' ? api.testRaidStorm(arg) : api.testPlane()
  )), [runScene]);

  const stopScene = useCallback((key) => runScene(() => api.stopScene(key)), [runScene]);

  const marbleAction = useCallback((action) => runScene(async () => {
    if (action === 'open') return api.openMarbles();
    if (action === 'start') return api.startMarbles();
    // Probe-Rennen aus dem Test-Menü: öffnen, mit Testmurmeln füllen, starten
    if (action === 'test') {
      await api.openMarbles();
      await api.addMarbleBots(12);
      return api.startMarbles();
    }
    return api.stopScene('marbles');
  }), [runScene]);

  const learnReward = useCallback(() => runScene(() => api.learnMarbleReward()), [runScene]);

  const grantReward = () => {
    try { sessionStorage.setItem(REWARD_FLAG, '1'); } catch { /* dann eben ohne Merker */ }
    login(false, [...STREAM_TOOL_SCOPES, MARBLE_REWARD_SCOPE]);
  };
  const createReward = (title, cost) => runScene(async () => {
    const r = await api.createMarbleReward(title, cost);
    patchModule('marbleRun', { rewardId: r.reward.id, rewardManaged: true, rewardTitle: r.reward.title });
  });
  const removeReward = () => runScene(async () => {
    const mod = configRef.current.modules.marbleRun;
    if (mod.rewardManaged && mod.rewardId) await api.deleteMarbleReward(mod.rewardId);
    patchModule('marbleRun', { rewardId: '', rewardManaged: false, rewardTitle: '' });
  });
  const resetTop = useCallback(() => runScene(() => api.resetMarbleTop()), [runScene]);

  // Frisch erkannte Kanalpunkte-Belohnung in die Einstellungen übernehmen. Das
  // Backend merkt sich nur die ID der Einlösung — gespeichert wird sie hier,
  // weil die Konfiguration als Ganzes vom Dashboard kommt.
  const learnedAt = marbleSetup?.reward?.at;
  useEffect(() => {
    const id = marbleSetup?.reward?.id;
    if (id && id !== configRef.current.modules.marbleRun.rewardId) patchModule('marbleRun', { rewardId: id });
  }, [learnedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auch die Vorschau rechnet das Rennen und darf den Sieger melden — so gibt
  // es ein Ergebnis, selbst wenn gerade keine OBS-Quelle offen ist.
  const reportWinner = useCallback((raceId, winnerId) => {
    if (overlayKey) api.reportMarbleWinner(overlayKey, raceId, winnerId).catch(() => {});
  }, [overlayKey]);

  // Eigener Takt für die Countdowns zwischen den Abrufen
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  /* ── Twitch verbinden ───────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    if (!accessToken) { login(false, loginScopes); return; }
    setBusy(true);
    try {
      const r = await api.connectTwitch(accessToken);
      setConnected(true);
      setTwitchLogin(r.twitchLogin || '');
      setMissingGoalScopes(r.missingGoalScopes || []);
      setHasTwitchGoalScope(r.hasTwitchGoalScope !== false);
      setSceneStatus(r.sceneStatus || null);
    } catch (e) {
      if (e.status === 403 && e.missingScopes) {
        // Vorhandener Login reicht nicht — erneut mit den Leserechten anfragen
        login(false, loginScopes);
        return;
      }
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }, [accessToken, login]);

  // Nach der Rückkehr vom Twitch-Login einmal automatisch verbinden.
  //
  // Wichtig: auch dann, wenn bereits eine Verbindung besteht. Wer nachträglich
  // Rechte erteilt (z.B. fürs Abo-Ziel), kommt mit einem NEUEN Token zurück —
  // ohne diesen Fall würde das Backend weiter den alten Token ohne die neuen
  // Rechte benutzen und das Ziel bliebe für immer leer.
  const autoTried = useRef('');
  // Fehlt ein Recht, das eine eingeschaltete Szene braucht?
  const sceneScopeMissing = !!sceneStatus && (
    (config.modules.hypeTrain.enabled && !sceneStatus.hypeScope) ||
    (config.modules.raidStorm.enabled && config.modules.raidStorm.guessNames !== false && !sceneStatus.chattersScope)
  );
  useEffect(() => {
    if (!loaded || !accessToken || autoTried.current === accessToken) return;
    // Schon verbunden und nichts zu gewinnen? Dann sparen wir uns den Aufruf.
    const rewardPending = wantsRewardScope && !sceneStatus?.rewardScope;
    if (connected && missingGoalScopes.length === 0 && hasTwitchGoalScope && !sceneScopeMissing && !rewardPending) return;

    autoTried.current = accessToken;
    api.connectTwitch(accessToken)
      .then((r) => {
        setConnected(true);
        setTwitchLogin(r.twitchLogin || '');
        setMissingGoalScopes(r.missingGoalScopes || []);
        setHasTwitchGoalScope(r.hasTwitchGoalScope !== false);
        setSceneStatus(r.sceneStatus || null);
        if (rewardPending) {
          if (r.sceneStatus?.rewardScope === undefined) {
            flash('Der Server kennt das Kanalpunkte-Recht noch nicht — das Backend läuft mit einem älteren Stand und muss neu gestartet bzw. neu ausgeliefert werden.');
          } else if (!r.sceneStatus.rewardScope) {
            flash('Twitch hat das Recht für Kanalpunkte nicht mitgegeben. Bitte noch einmal erteilen.');
          }
        }
        try { sessionStorage.removeItem(REWARD_FLAG); } catch { /* egal */ }
      })
      .catch((e) => { if (rewardPending) flash(`Verbinden fehlgeschlagen: ${e.message}`); });
  }, [loaded, connected, accessToken, missingGoalScopes.length, hasTwitchGoalScope, sceneScopeMissing]);

  const disconnect = async () => {
    try {
      await api.disconnectTwitch();
      setConnected(false);
      setLive({ poll: null, prediction: null, goals: null, raid: null, stats: null, scenes: null, notice: null });
      // Mit dem aktuellen Token NICHT von selbst wieder verbinden — sonst wäre
      // das Trennen nach einer Sekunde rückgängig. Von Hand ("Kanal verbinden")
      // oder mit einem neuen Token nach einer Anmeldung geht es weiter.
      autoTried.current = accessToken || '';
      setSceneStatus(null);
    } catch (e) { flash(e.message); }
  };

  /* ── Bühne skalieren ────────────────────────────────────────────────────── */
  // Die Bühne nimmt, was die Mitte hergibt — begrenzt von Breite UND Höhe des
  // freien Bereichs zwischen Modul-Liste und Einstellungen.
  const hostRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  const scaleRef = useRef(0.4);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const fit = () => {
      const s = Math.max(0.05, Math.min(host.clientWidth / STAGE_W, host.clientHeight / STAGE_H));
      scaleRef.current = s;
      setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [loaded, user]);

  /* ── Drag & Drop ────────────────────────────────────────────────────────── */
  const dragRef = useRef(null);

  const startDrag = (id) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSelected(id);
    const m = configRef.current.modules[id];
    dragRef.current = { id, el: e.currentTarget, sx: e.clientX, sy: e.clientY, ox: m.x, oy: m.y };
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      // offsetWidth enthält die Modulgröße bereits: sie steckt als zoom in einer
      // Ebene darunter (siehe WidgetFrame) und nicht mehr im transform.
      const w = d.el.offsetWidth;
      const h = d.el.offsetHeight;

      // Mausweg muss durch den Zoom der Bühne geteilt werden
      let x = d.ox + (e.clientX - d.sx) / scaleRef.current;
      let y = d.oy + (e.clientY - d.sy) / scaleRef.current;

      let snapV = false, snapH = false;
      if (snapOn) {
        const TOL = 14;
        if (Math.abs(x + w / 2 - STAGE_W / 2) < TOL) { x = STAGE_W / 2 - w / 2; snapV = true; }
        if (Math.abs(y + h / 2 - STAGE_H / 2) < TOL) { y = STAGE_H / 2 - h / 2; snapH = true; }
        [60, STAGE_W - 60 - w].forEach((t) => { if (Math.abs(x - t) < TOL) x = t; });
        [60, STAGE_H - 60 - h].forEach((t) => { if (Math.abs(y - t) < TOL) y = t; });
      }
      if (gridOn) { x = Math.round(x / 20) * 20; y = Math.round(y / 20) * 20; }

      setGuides({ v: snapV, h: snapH });
      patchModule(d.id, {
        x: Math.min(STAGE_W - w * 0.7, Math.max(-w * 0.3, x)),
        y: Math.min(STAGE_H - h * 0.7, Math.max(-h * 0.3, y)),
      });
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setGuides({ v: false, h: false });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [snapOn, gridOn, patchModule]);

  /* ── Anzeigedaten ───────────────────────────────────────────────────────── */
  const m = config.modules;
  const now = Date.now() + clockOffset.current;
  const sim = useDemoSim(demoOn, demoOutcomes);

  const pollView = toPollView(live.poll, m.poll, now) || (demoOn ? paintDemo(sim.poll, m.poll) : null);
  const predView = toPredictionView(live.prediction, m.prediction, now) || (demoOn ? paintDemo(sim.prediction, m.prediction) : null);
  const goals = live.goals || (demoOn ? sim.goals : null);
  const followerView = toGoalView('followerGoal', goals, m.followerGoal);
  const subView = toGoalView('subGoal', goals, m.subGoal);
  // Im Dashboard wird nur die Karte gezeigt, nie abgespielt: der Clip gehört in
  // die OBS-Quelle, nicht mit voller Lautstärke in den Browser des Streamers.
  // enabled bleibt beim Bauen der Ansicht außen vor, damit die Karte sofort da
  // ist, wenn das Modul eingeschaltet wird; ob sie zu sehen (und greifbar) ist,
  // entscheidet WidgetFrame. Der Vorlauf gilt fürs Overlay, nicht für die
  // Vorschau: sonst verschwände die Karte beim Ausrichten für ein paar Sekunden.
  const raidPreview = live.raid ? { ...live.raid, startsAt: 0 } : (demoOn ? sim.raid : null);
  const raidView = toRaidView(raidPreview, { ...m.raidClip, enabled: true }, now);
  // hideOffline bleibt beim Ausrichten außen vor, sonst verschwände die Karte
  // genau dann, wenn man sie im Editor braucht.
  const statsView = toStatsView(live.stats || (demoOn ? sim.stats : null), { ...m.streamStats, hideOffline: false });

  const pollHeld = useLinger(pollView);
  const predHeld = useLinger(predView);

  // Szenen. Läuft gerade nichts, steht bei eingeschalteten Demo-Daten ein
  // Standbild auf der Leinwand — sonst gäbe es nichts zum Ausrichten.
  const scenes = live.scenes || {};
  const marblesView = scenes.marbles || (demoOn ? demoMarbles(m.marbleRun) : null);
  const hypeView = scenes.hype || (demoOn ? DEMO_HYPE : null);

  // Was auf der Leinwand liegt — dieselbe Reihenfolge wie die Modul-Liste
  const rendered = {
    poll: pollHeld && <PollWidget data={pollHeld} module={m.poll} />,
    prediction: predHeld && <PredictionWidget data={predHeld} module={m.prediction} />,
    followerGoal: followerView && <GoalWidget data={followerView} module={m.followerGoal} />,
    subGoal: subView && <GoalWidget data={subView} module={m.subGoal} />,
    streamStats: statsView && <StatsWidget data={statsView} module={m.streamStats} />,
    raidClip: raidView && <RaidClipWidget data={raidView} module={m.raidClip} preview />,
    marbleRun: marblesView && (
      <MarbleRunWidget data={marblesView} module={m.marbleRun} offsetRef={clockOffset} onResult={reportWinner} />
    ),
  };
  const hasData = {
    poll: !!pollView,
    prediction: !!predView,
    followerGoal: !!followerView,
    subGoal: !!subView,
    streamStats: !!statsView,
    raidClip: !!raidView,
    marbleRun: !!marblesView,
  };

  /** Modul, dessen Einstellungen gerade unter der Leinwand stehen. */
  const activeMeta = MODULES.find((x) => x.id === selected) || MODULES[0];

  /** Aktive Twitch-Ziele, die zu einem Ziel-Modul passen würden. */
  const detectedGoalTypes = (id) =>
    (TWITCH_GOAL_FAMILY[id] || []).filter((t) => live.goals?.twitch?.[t]);

  /** Erklärt direkt am Modul, warum ein Ziel leer bleibt. */
  const moduleWarning = (id) => {
    if (!connected) return null;
    const mod = config.modules[id];
    if (!mod) return null;

    if (id === 'hypeTrain' && mod.enabled && sceneStatus && !sceneStatus.hypeScope) {
      return 'Zum Lesen des Hype Trains fehlt noch ein Leserecht. Oben auf „Rechte jetzt erteilen“ klicken.';
    }
    if (id === 'raidStorm' && mod.enabled && mod.guessNames !== false && sceneStatus && !sceneStatus.chattersScope) {
      return 'Für die Namen der Raider fehlt das Leserecht für deine Zuschauerliste. Oben auf „Rechte jetzt erteilen“ klicken — oder das Schätzen der Namen abschalten.';
    }
    if (id === 'hypeTrain' || id === 'raidStorm' || id === 'marbleRun') {
      if (!mod.enabled || !chatWatch || chatWatch.botConfigured) return null;
      return 'Auf diesem Server ist kein Chat-Bot hinterlegt — ohne ihn kommen weder Raids noch Anmeldungen noch Cheers an.';
    }

    if (id === 'raidClip' || id === 'streamStats') {
      if (!mod.enabled || !chatWatch || chatWatch.botConfigured) return null;
      return id === 'raidClip'
        ? 'Auf diesem Server ist kein Chat-Bot hinterlegt — ohne ihn lassen sich Raids nicht erkennen.'
        : 'Auf diesem Server ist kein Chat-Bot hinterlegt — Abos und Bits lassen sich ohne ihn nicht zählen.';
    }

    if (id !== 'subGoal' && id !== 'followerGoal') return null;

    // Modus "Twitch-Ziel": entweder fehlt das Recht oder es ist gar keins gesetzt
    if (mod.source === 'twitch') {
      if (live.goals?.twitchGoalsError === 'scope' || (loaded && !hasTwitchGoalScope)) {
        return 'Zum Lesen deiner Twitch-Ziele fehlt noch ein Leserecht. Oben auf „Rechte jetzt erteilen“ klicken.';
      }
      if (live.goals?.twitch && !resolveTwitchGoal(id, live.goals, mod)) {
        // Häufigster Fall beim Abo-Ziel: Twitch führt eins, aber über die Anzahl
        // statt über die Punkte. Das ist keine Fehlfunktion, nur ein anderer Typ.
        const found = detectedGoalTypes(id);
        if (found.length) {
          return `In deinem Creator-Dashboard läuft ein Ziel vom Typ „${GOAL_TYPE_LABEL(id, found[0])}“, hier ist aber „${GOAL_TYPE_LABEL(id, mod.twitchType)}“ eingestellt. Stelle „Welches Twitch-Ziel“ auf „Automatisch“.`;
        }
        return 'In deinem Creator-Dashboard ist gerade kein solches Ziel aktiv. Lege dort eins an — oder stelle oben auf „Eigenes Ziel“ um.';
      }
      return null;
    }

    if (id !== 'subGoal') return null;
    if (missingGoalScopes.includes('channel:read:subscriptions')) {
      return 'Für Abo-Zahlen fehlt noch das Leserecht. Oben auf „Rechte jetzt erteilen“ klicken.';
    }
    if (live.goals?.subsError === 'forbidden') {
      return 'Twitch gibt Abo-Zahlen nur für Affiliates und Partner heraus — das Modul bleibt bis dahin leer.';
    }
    if (live.goals && live.goals.subs === null) {
      return 'Twitch liefert gerade keine Abo-Zahl. Das Modul bleibt leer, statt eine falsche 0 zu zeigen.';
    }
    return null;
  };

  const centerWidget = (id) => {
    const el = document.querySelector(`[data-widget="${id}"]`);
    if (!el) return;
    // offsetWidth ist schon die Größe inklusive Modul-Zoom (siehe WidgetFrame)
    patchModule(id, {
      x: (STAGE_W - el.offsetWidth) / 2,
      y: (STAGE_H - el.offsetHeight) / 2,
    });
  };

  const seo = (
    <SEO
      title={ST_TITLE}
      description={ST_DESCRIPTION}
      keywords={ST_KEYWORDS}
      path="/twitch-tools"
    />
  );

  /* ── Login-Schranke ─────────────────────────────────────────────────────────
     Zugleich die Fassung, die Suchmaschinen sehen — der Crawler ist nie angemeldet.
     Deshalb steht hier, was die Overlays können, und nur hier hängen die strukturierten
     Daten zu Fragen und Einrichtung: FAQPage und HowTo dürfen nur ausgezeichnet werden,
     wenn derselbe Text sichtbar auf der Seite steht. */
  if (!user) {
    return (
      <div className="page-fade max-w-6xl mx-auto">
        <SEO
          title={ST_TITLE}
          description={ST_DESCRIPTION}
          keywords={ST_KEYWORDS}
          path="/twitch-tools"
          jsonLd={buildStreamToolJsonLd()}
        />
        <StreamToolSeoContent>
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => login(false, loginScopes)}
              className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white font-bold px-6 py-3 rounded-lg text-sm transition-colors">
              <TwitchGlyph size={15} />
              Mit Twitch anmelden und Overlay einrichten
            </button>
            <p className="text-white/30 text-xs">Kostenlos · nur Twitch-Login nötig</p>
          </div>
        </StreamToolSeoContent>
      </div>
    );
  }

  const needsRights = connected && (missingGoalScopes.length > 0 || !hasTwitchGoalScope || sceneScopeMissing);
  const iconToggle = (on) =>
    `w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors ${
      on ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/25'
    }`;

  /** Eine Zeile der Modul-Liste. */
  const railItem = (meta) => {
    const module = config.modules[meta.id];
    const isActive = selected === meta.id;
    const Icon = meta.icon;
    const hint = moduleWarning(meta.id);
    // Gehört zum Abo und der Nutzer hat keins: Schloss statt Schalter. Die Einstellungen
    // bleiben einsehbar, nur einschalten lässt sich das Modul nicht (das Backend sperrt mit).
    const locked = premiumModules.includes(meta.id) && premium && !premium.active;
    return (
      <div key={meta.id}
        className={`relative flex items-center transition-colors ${isActive ? 'bg-violet-500/[0.12]' : 'hover:bg-white/[0.04]'}`}>
        <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[2px] ${isActive ? 'bg-violet-400' : 'bg-transparent'}`} />
        <button type="button" onClick={() => setSelected(meta.id)} aria-pressed={isActive}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left h-10 pl-3.5 pr-1">
          <Icon size={15} className={`shrink-0 ${isActive ? 'text-violet-300' : (module.enabled ? 'text-gray-300' : 'text-gray-600')}`} />
          <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-white' : (module.enabled ? 'text-gray-200' : 'text-gray-500')}`}>
            {meta.label}
          </span>
          {hint && <span title="Aktion nötig" className="w-1.5 h-1.5 shrink-0 rounded-sm bg-amber-400" />}
        </button>
        {locked ? (
          // Solange noch nicht verkauft wird (config/legal.js), ist das Schloss nur ein Hinweis
          <button type="button" onClick={() => setPremiumOpen(true)} disabled={!salesVisible()}
            title={salesVisible() ? 'Gehört zum Abo' : 'Bald verfügbar'}
            className="shrink-0 mx-2 w-9 h-7 inline-flex items-center justify-center rounded-sm text-violet-300 bg-violet-500/10 enabled:hover:bg-violet-500/20 disabled:text-gray-600 disabled:bg-white/5 transition-colors">
            <Lock size={13} />
          </button>
        ) : (
          <label className="relative shrink-0 cursor-pointer px-3 py-2.5" title={module.enabled ? 'Ausschalten' : 'Einschalten'}>
            <input type="checkbox" checked={module.enabled} className="peer sr-only"
              onChange={(e) => patchModule(meta.id, { enabled: e.target.checked })} />
            <span className="block w-8 h-[18px] rounded-full bg-white/10 peer-checked:bg-violet-500/50 transition-colors" />
            <span className="absolute top-[13px] left-[15px] w-3 h-3 rounded-full bg-gray-400 peer-checked:bg-white peer-checked:translate-x-[14px] transition-transform" />
          </label>
        )}
      </div>
    );
  };

  const railGroup = (title, list) => (
    <section>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 px-3.5 pt-3.5 pb-1.5">{title}</p>
      {list.map(railItem)}
    </section>
  );

  // Die Seite legt sich als eigene Oberfläche über das ganze Fenster — ohne die
  // Kopfzeile der Website, damit die Bühne den Platz bekommt. Als Portal, weil
  // der Inhaltsbereich des Layouts einen eigenen Stapelkontext hat und die
  // Kopfzeile sonst darüber läge. Die Anmelde-Fassung oben bleibt bewusst im
  // normalen Layout: sie ist die Seite, die Besucher und Suchmaschinen sehen.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0b11] text-white overflow-y-auto lg:overflow-hidden">
      {seo}

      {/* ══════════ Kopfleiste ══════════ */}
      <header className="relative z-30 shrink-0 h-12 flex items-center gap-2 px-3 border-b border-white/10 bg-[#0f0f16]">
        <Link to="/tools" title="Zurück zur Website"
          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-[14px] font-bold text-white whitespace-nowrap">Twitch-Overlays</h1>

        {connected ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 ml-2 text-[12px] text-gray-400 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="truncate">{twitchLogin || 'verbunden'}</span>
            <button type="button" onClick={disconnect} title="Verbindung trennen"
              className="p-1 rounded-sm text-gray-600 hover:text-red-400 transition-colors">
              <LogOut size={12} />
            </button>
          </span>
        ) : (
          <button type="button" onClick={connect} disabled={busy}
            className="ml-2 h-8 px-3 inline-flex items-center gap-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white text-[12px] font-bold transition-colors">
            <TwitchGlyph size={13} />
            {busy ? 'Verbinde…' : 'Kanal verbinden'}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setGridOn((v) => !v)} title="Raster" className={`hidden sm:inline-flex ${iconToggle(gridOn)}`}>
            <Grid3x3 size={14} />
          </button>
          <button type="button" onClick={() => setSnapOn((v) => !v)} title="Magnet (an Mitte und Rändern einrasten)"
            className={`hidden sm:inline-flex ${iconToggle(snapOn)}`}>
            <Crosshair size={14} />
          </button>

          <BarMenu label="Testen" icon={FlaskConical} width={360}>
            <TestMenu
              modules={m}
              busy={sceneBusy || raidBusy}
              note={raidNote}
              demoOn={demoOn}
              setDemoOn={setDemoOn}
              demoOutcomes={demoOutcomes}
              setDemoOutcomes={setDemoOutcomes}
              onScene={testScene}
              onStopScene={stopScene}
              onRaid={testRaid}
              onStopRaid={stopRaid}
              onMarbles={() => marbleAction('test')}
            />
          </BarMenu>

          <BarMenu label="OBS-Link" icon={Link2} width={340}>
            <ObsLinkSection overlayKey={overlayKey} onRegenerate={async () => {
              try { setOverlayKey((await api.regenerateOverlayKey()).overlayKey); } catch (e) { flash(e.message); }
            }} />
          </BarMenu>
        </div>
      </header>

      {/* Meldungen: eine schmale Zeile je Sache, nur wenn es etwas zu sagen gibt */}
      {(error || live.notice || needsRights || aboNote) && (
        <div className="shrink-0 border-b border-white/10 divide-y divide-white/[0.06]">
          {aboNote && (
            <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-violet-200 bg-violet-500/10">{aboNote}</p>
          )}
          {error && (
            <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-red-300 bg-red-500/10">
              <TriangleAlert size={13} className="shrink-0" />
              {error}
            </p>
          )}
          {live.notice && (
            <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-amber-200 bg-amber-500/10">
              <Info size={13} className="shrink-0" />
              {live.notice}
            </p>
          )}
          {needsRights && (
            <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-amber-200 bg-amber-500/10">
              <Info size={13} className="shrink-0" />
              <span>
                {sceneScopeMissing && missingGoalScopes.length === 0 && hasTwitchGoalScope
                  ? 'Für Hype Train oder Raid-Ansturm fehlt noch ein Leserecht.'
                  : 'Für einige Module fehlen noch Leserechte (Follower, Abos, Hype Train oder Zuschauerliste).'}{' '}
                <button type="button" onClick={() => login(false, loginScopes)} className="underline font-semibold hover:text-white">
                  Rechte jetzt erteilen
                </button>
              </span>
            </p>
          )}
        </div>
      )}

      {/* ══════════ Arbeitsbereich: Module | Bühne | Einstellungen ══════════ */}
      <div className="lg:flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_340px] xl:grid-cols-[224px_minmax(0,1fr)_388px]">

        {/* Modul-Liste */}
        <aside className="min-w-0 lg:min-h-0 lg:overflow-y-auto custom-scrollbar border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0f0f16] pb-3">
          {railGroup('Karten', MODULES.filter((x) => !x.scene))}
          {railGroup('Szenen', MODULES.filter((x) => x.scene))}
          {/* Abo: Hinweis unter den Szenen — abschließen oder verwalten */}
          {premium && !premium.active && salesVisible() && (
            <button type="button" onClick={() => setPremiumOpen(true)}
              className="mx-3 mt-3 w-[calc(100%-1.5rem)] h-9 inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-bold transition-colors">
              <Lock size={13} /> Szenen freischalten
            </button>
          )}
          {premium?.source === 'subscription' && (
            <p className="px-3.5 mt-3 text-[11px] text-gray-500">
              {premium.cancelAtPeriodEnd ? `Abo läuft bis ${untilText(premium.until)}.` : `Abo aktiv bis ${untilText(premium.until)}.`}{' '}
              <button type="button" onClick={() => openPortal('/twitch-tools').catch((e) => flash(e.message))} className="text-violet-300 hover:text-violet-200">Verwalten</button>
            </p>
          )}
          <PremiumDialog open={premiumOpen} onClose={() => setPremiumOpen(false)} includes={PREMIUM_INCLUDES} returnPath="/twitch-tools" />
        </aside>

        {/* Bühne */}
        <main className="min-w-0 lg:min-h-0 flex flex-col">
          <div ref={hostRef} className="relative aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 m-3 lg:m-4">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md overflow-hidden border border-white/10 stw-checker"
              style={{ width: Math.round(STAGE_W * scale), height: Math.round(STAGE_H * scale) }}>
              {/* zoom statt transform: scale — nur so startet der Raid-Clip in
                  der Vorschau von allein (siehe WidgetFrame) */}
              <div className="stw-stage" style={{ zoom: scale }}>
                {gridOn && <div className="stw-thirds" />}
                {guides.v && <div className="stw-guide v" style={{ left: STAGE_W / 2 }} />}
                {guides.h && <div className="stw-guide h" style={{ top: STAGE_H / 2 }} />}

                {MODULES.filter((meta) => !meta.scene).map((meta) => (
                  <WidgetFrame
                    key={meta.id}
                    id={meta.id}
                    module={m[meta.id]}
                    visible={hasData[meta.id] && m[meta.id].enabled}
                    editable
                    selected={selected === meta.id}
                    onPointerDown={startDrag(meta.id)}
                  >
                    {rendered[meta.id]}
                  </WidgetFrame>
                ))}

                {/* Szenen: laufen über die ganze Bühne und lassen sich nicht
                    greifen. Ist eine ausgewählt, zeigt ein Rahmen ihre Spur. */}
                {selected === 'raidStorm' && m.raidStorm.enabled && (
                  <div className="stw-lane" style={{ top: Math.round(m.raidStorm.y), height: Math.round(STORM_LANE_H * m.raidStorm.scale) }} />
                )}
                {m.hypeTrain.enabled && (
                  <HypeTrainScene data={hypeView} module={m.hypeTrain} offsetRef={clockOffset} still={!scenes.hype} />
                )}
                {m.raidStorm.enabled && (
                  <RaidStormScene data={scenes.storm} module={m.raidStorm} offsetRef={clockOffset} />
                )}
                <PlaneBannerScene module={m.planeBanner} test={scenes.plane} offsetRef={clockOffset} />
                {/* Standbild nur, solange das Flugzeug ausgewählt ist — sonst stünde es dauerhaft im Bild */}
                {selected === 'planeBanner' && demoOn && (
                  <PlaneBannerScene module={m.planeBanner} offsetRef={clockOffset} still />
                )}
              </div>
            </div>
          </div>

          <p className="shrink-0 px-4 pb-3 text-[11px] text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            <span className="tabular-nums">1920 × 1080 · {Math.round(scale * 100)} %</span>
            <span>Karten mit der Maus verschieben. Das Karomuster bleibt im Stream durchsichtig.</span>
            {!connected && <span className="text-amber-300/80">Kanal verbinden, damit echte Daten erscheinen.</span>}
          </p>
        </main>

        {/* Einstellungen des gewählten Moduls */}
        {activeMeta && (
          <aside className="min-w-0 lg:min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0f0f16]">
            <div className="shrink-0 h-12 flex items-center gap-2.5 px-3.5 border-b border-white/10">
              <activeMeta.icon size={15} className="text-violet-300 shrink-0" />
              <p className="text-[13.5px] font-bold text-white truncate">{activeMeta.label}</p>
              <div className="ml-auto flex items-center gap-1.5">
                {/* Eine Szene hat keine Karte, die sich mittig setzen ließe */}
                {!activeMeta.scene && (
                  <button type="button" onClick={() => centerWidget(activeMeta.id)} title="Auf der Bühne zentrieren" className={iconToggle(false)}>
                    <Crosshair size={14} />
                  </button>
                )}
                <button type="button" title="Auf Standard zurücksetzen" className={iconToggle(false)}
                  onClick={() => patchModule(activeMeta.id, { ...MODULE_DEFAULTS[activeMeta.id] })}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
              <ModuleSettings
                key={activeMeta.id}
                meta={activeMeta}
                module={config.modules[activeMeta.id]}
                warning={moduleWarning(activeMeta.id)}
                onChange={(patch) => patchModule(activeMeta.id, patch)}
                goalTools={activeMeta.kind === 'goal' ? {
                  onRefresh: refreshGoals,
                  busy: goalBusy,
                  note: goalNote,
                  connected,
                  detected: detectedGoalTypes(activeMeta.id),
                } : null}
                raidTools={activeMeta.kind === 'raid' ? { watch: chatWatch } : null}
                statsTools={activeMeta.kind === 'stats' ? {
                  onReset: resetStats,
                  busy: statsBusy,
                  note: statsNote,
                  watch: chatWatch,
                  stats: live.stats,
                } : null}
                sceneTools={SCENE_IDS.includes(activeMeta.id) || activeMeta.kind === 'marbles' ? {
                  onAction: marbleAction,
                  onLearn: learnReward,
                  onGrantReward: grantReward,
                  onCreateReward: createReward,
                  onRemoveReward: removeReward,
                  status: sceneStatus,
                  onResetTop: resetTop,
                  busy: sceneBusy,
                  watch: chatWatch,
                  state: live.scenes?.marbles || null,
                  setup: marbleSetup,
                } : null}
              />
            </div>
          </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}
