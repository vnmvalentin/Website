// PollsPredictionsPage.jsx — Layout-Einstellungen für die Twitch-Overlay-Module.
//
// Gestartet und beendet werden Abstimmungen und Vorhersagen in Twitch selbst —
// diese Seite legt nur fest, WIE sie im Stream aussehen. Links die Modul-Liste
// (reine Auswahl, beliebig erweiterbar), rechts die 1920x1080-Leinwand mit Drag &
// Drop und darunter die Einstellungen des gewählten Moduls — dort ist Platz für
// mehrere Spalten, und man scrollt nicht zwischen Formular und Vorschau hin und her.
// Die Widgets kommen aus OverlayWidgets.jsx und sind identisch mit dem, was die
// OBS-Quelle rendert.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ToolHeader, ToolScroll } from '../../components/toolShell/ToolParts';
import { Button } from '../../components/ui';
import {
  Copy, Check, Eye, EyeOff, RefreshCw, BarChart3, Scale, Crosshair, Grid3x3,
  LogOut, TriangleAlert, Info, Users, Star, ArrowRight, Clapperboard, Play, Square,
  Activity, RotateCcw, TrainFront, Plane, UsersRound, CircleDot,
  ChevronDown, FlaskConical, Link2, Lock, Palette, Bell, Volume2,
  Hourglass, Pause, Plus, Minus, HandCoins, Zap, Trash2, Upload, Music, Image as ImageIcon,
} from 'lucide-react';
import PremiumDialog from '../../components/PremiumDialog';
import { PREMIUM_INCLUDES, openPortal, untilText } from '../../utils/billingApi';
import { salesVisible } from '../../config/legal';
import { TwitchGlyph } from '../../components/BrandGlyphs';
import SEO from '../../components/SEO';
import StreamToolSeoContent from './seoContent';
import { stSeo, ST_PATH, ST_ALTERNATES } from './seoData';
import { buildStreamToolJsonLd } from './jsonLd';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import * as api from './streamToolApi';
import { STREAM_TOOL_SCOPES, MARBLE_REWARD_SCOPE } from './streamToolApi';
import {
  defaultConfig, mergeConfig, withLanguage, effectiveModules, THEME_DEFAULTS, THEMED_IDS, toPollView, toPredictionView, toGoalView, toRaidView, toStatsView,
  useDemoSim, useLinger, paintDemo, MODULE_DEFAULTS, TWITCH_GOAL_TYPES, TWITCH_GOAL_FAMILY,
  resolveTwitchGoal, STAT_METRICS, SCENE_IDS, demoHype, demoMarbles, planeMessages,
  ALERT_KINDS, ALERT_TEXT_FIELD, DEFAULT_TEXTS, demoAlert,
  SUBATHON_RULE_KEYS, SUBATHON_CURRENCIES, toSubathonView, demoSubathon, subathonClock, subathonDelta,
  subathonRemaining, subathonStartMs, subathonWhat,
  OVERLAY_FONTS, ALL_FONTS_HREF, fontFamilyOf, fontHref, withoutPremium, alertMediaOf, mediaUrl,
} from './streamToolConfig';
import { useFontLink } from '../../components/shell/useFontLink';
import { OverlayLangContext, OVERLAY_TEXTS, overlayFormat } from './overlayI18n';
import { AlertWidget, useAlertPlayer, playAlertSound, speakAlert, alertSpeech } from './OverlayAlerts';
import { SubathonWidget } from './OverlaySubathon';
import { getVorlage, markVorlageUsed as countVorlageUse, userVorlageId } from '../StreamerTools/vorlagen/vorlagenApi';
import { EDITOR_TEXTS, apiErrorText, clipWarningText, useEditorText } from './editorI18n';
import { useLanguage } from '../../i18n/language';
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
 * Einstellungs-Oberfläche funktioniert dann automatisch mit. Name, Hinweis und Farbhinweis
 * stehen je Sprache in editorI18n.js (modules).
 */
const MODULES = [
  {
    id: 'poll',
    kind: 'feed',
    icon: BarChart3,
    maxColors: 5,
  },
  {
    id: 'prediction',
    kind: 'feed',
    icon: Scale,
    maxColors: 10,
  },
  {
    id: 'followerGoal',
    kind: 'goal',
    icon: Users,
    maxColors: 1,
  },
  {
    id: 'subGoal',
    kind: 'goal',
    icon: Star,
    maxColors: 1,
  },
  {
    id: 'streamStats',
    kind: 'stats',
    icon: Activity,
    maxColors: 1,
  },
  {
    id: 'raidClip',
    kind: 'raid',
    icon: Clapperboard,
    maxColors: 1,
  },
  {
    id: 'alerts',
    kind: 'alerts',
    icon: Bell,
    maxColors: 1,
  },
  {
    id: 'subathon',
    kind: 'subathon',
    icon: Hourglass,
    maxColors: 1,
  },
  // Ab hier die Szenen: sie spielen quer übers Bild und haben keine Karte, die
  // man verschieben könnte (scene: true) — bis auf die Murmelbahn.
  {
    id: 'hypeTrain',
    kind: 'hype',
    scene: true,
    icon: TrainFront,
    maxColors: 2,
  },
  {
    id: 'raidStorm',
    kind: 'storm',
    scene: true,
    icon: UsersRound,
    maxColors: 8,
  },
  {
    id: 'planeBanner',
    kind: 'plane',
    scene: true,
    icon: Plane,
    maxColors: 3,
  },
  {
    id: 'marbleRun',
    kind: 'marbles',
    icon: CircleDot,
    maxColors: 8,
  },
];

/** Name eines Twitch-Zieltyps in der Sprache des Editors. */
const goalTypeLabel = (t, value) => t.goalTypes[value] || value;

/* ── kleine Bausteine ─────────────────────────────────────────────────────── */

const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider text-white/45">
    {children}
  </label>
);

/** Erklärung unter einem Feld. Bewusst knapp — die Seite soll nicht zutexten. */
const Note = ({ children }) => (
  <p className="text-[11px] text-white/45 leading-relaxed mt-1.5">{children}</p>
);

const Field = (props) => (
  <input
    {...props}
    className={`w-full bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:border-accent outline-none text-sm transition-colors ${props.className || ''}`}
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm focus:border-accent"
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
              ? 'bg-accent/15 text-white border-accent-soft/30'
              : 'bg-white/[0.03] text-white/45 border-white/10 hover:text-white'
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
        <span className="block w-9 h-5 rounded-full bg-white/10 peer-checked:bg-accent/40 transition-colors" />
        <span className="absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-white/60 peer-checked:bg-accent-soft peer-checked:translate-x-4 transition-transform" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white">{label}</span>
        {description && <span className="block text-[11px] text-white/45 leading-snug">{description}</span>}
      </span>
    </label>
  );
}

/** Kompakte Variante für Listen, in denen mehrere Haken nebeneinander stehen. */
function CheckItem({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer py-[3px] text-[12.5px] font-semibold text-white/75 hover:text-white transition-colors">
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
      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-white/75 hover:text-white disabled:text-white/30 disabled:hover:border-white/10 transition-colors">
      <Icon size={13} className={spin ? 'animate-spin' : ''} />
      {children}
    </button>
  );
}

/** Kleines „Abo“-Schild hinter dem Titel eines Abo-Extras (Schrift, eigene Töne/Bilder, Happy Hour). */
function PremiumMark() {
  const t = useEditorText();
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded-sm bg-accent/15 px-1.5 py-px align-middle text-[9.5px] font-bold text-accent-soft normal-case tracking-normal">
      <Lock size={9} /> {t.premiumExtra}
    </span>
  );
}

/**
 * Hinweis an einem Abo-Extra ohne Abo: was das heißt, und der Weg zum Abo. Solange noch nicht verkauft wird
 * (config/legal.js), steht dort nur „Bald verfügbar“.
 * @param {{ on: boolean, sales: boolean, ask: () => void }} premium
 */
function PremiumNote({ premium }) {
  const t = useEditorText();
  if (!premium || premium.on) return null;
  return (
    <div className="flex items-center gap-2.5 text-[11.5px] leading-snug text-white/65">
      <Lock size={13} className="shrink-0 text-accent-soft" />
      <span className="min-w-0 flex-1">{t.premiumExtraNote}</span>
      {premium.sales
        ? <button type="button" onClick={premium.ask} className="shrink-0 font-bold text-accent-soft hover:text-white">{t.premiumMore}</button>
        : <span className="shrink-0 text-white/40">{t.comingSoon}</span>}
    </div>
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
      <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/45 mb-2.5">{title}</h3>
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
  const t = useEditorText();
  if (!watch) return null;
  // Der eingeschaltete Zustand kommt zuerst: der Bot kann längst im Kanal
  // sitzen, weil ein ANDERES Modul ihn braucht — ausgewertet wird trotzdem
  // nichts, solange dieses hier aus ist.
  if (!enabled) {
    return <Callout>{t.watchEnable[what]}</Callout>;
  }
  if (watch.watching) return <Callout tone="ok">{t.watchOk[what](watch.channel)}</Callout>;
  // Fehlt der Bot ganz, steht das schon als Warnung über dem Modul — nicht doppelt sagen
  if (!watch.botConfigured) return null;
  return (
    <Callout>
      {!watch.botConfigured
        ? t.watchNoBot
        : t.watchJoining}
    </Callout>
  );
}

/* ── Clip des Raiders: eigene Einstellungen ───────────────────────────────── */

function RaidSettings({ meta, module, set, tools }) {
  const t = useEditorText();
  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="raids" />

      <Section title={t.clipSection} cols={4}>
        <div>
          <Label>{t.pick}</Label>
          <Choice
            value={module.pick}
            options={[['top', t.pickTop], ['random', t.pickRandom]]}
            onChange={(v) => set({ pick: v })}
          />
          <Note>
            {module.pick === 'top'
              ? t.pickTopNote
              : t.pickRandomNote}
          </Note>

          <div className="mt-4">
            <Label htmlFor={`${meta.id}-period`}>{t.period}</Label>
            <Select id={`${meta.id}-period`} value={String(module.period)}
              onChange={(e) => set({ period: Number(e.target.value) })}>
              <option value="7">{t.period7}</option>
              <option value="30">{t.period30}</option>
              <option value="365">{t.period365}</option>
              <option value="0">{t.periodAll}</option>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <Slider label={t.startAfterRaid} value={module.delaySeconds ?? 0} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ delaySeconds: v })} />
          <Slider label={t.playTime} value={module.maxSeconds} min={5} max={60} step={5} unit=" s"
            onChange={(v) => set({ maxSeconds: v })} />
          <Note>{t.raidDelayNote}</Note>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor={`${meta.id}-minv`}>{t.minViewers}</Label>
            <Field id={`${meta.id}-minv`} type="number" min={0} className="mt-1.5" value={module.minViewers}
              onChange={(e) => set({ minViewers: Math.max(0, Number(e.target.value) || 0) })} />
            <Note>{t.zeroEveryRaid}</Note>
          </div>
          <ToggleRow label={t.showRaider} checked={module.showRaider !== false}
            onChange={(v) => set({ showRaider: v })} />
          <ToggleRow
            label={t.sound}
            description={t.soundNote}
            checked={module.sound !== false}
            onChange={(v) => set({ sound: v })}
          />
          {module.sound !== false && (
            <Slider label={t.volume} value={module.volume ?? 100} min={0} max={100} step={5} unit=" %"
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
  const t = useEditorText();
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${meta.id}-y`}>{t.laneY}</Label>
        <Field id={`${meta.id}-y`} type="number" className="mt-1.5" value={Math.round(module.y)}
          onChange={(e) => set({ y: Math.max(-200, Math.min(STAGE_H, Number(e.target.value) || 0)) })} />
        <Note>{yNote}</Note>
      </div>
      <Slider label={t.size} value={Math.round(module.scale * 100)} min={50} max={160} step={5} unit=" %"
        onChange={(v) => set({ scale: v / 100 })} />
    </div>
  );
}

function ColorRow({ meta, module, set, labels }) {
  const t = useEditorText();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{t.colors}</Label>
        <button onClick={() => set({ colors: [...MODULE_DEFAULTS[meta.id].colors] })}
          className="text-[11px] font-semibold text-white/45 hover:text-accent-soft transition-colors">
          {t.standard}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {module.colors.slice(0, meta.maxColors).map((c, i) => (
          <input key={i} type="color" value={c} title={labels?.[i] || t.colorN(i + 1)}
            onChange={(e) => set({ colors: module.colors.map((old, idx) => (idx === i ? e.target.value : old)) })}
            className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
        ))}
      </div>
      {labels && <Note>{labels.join(' · ')}</Note>}
    </div>
  );
}

const directionOptions = (t) => [['right', t.toRight], ['left', t.toLeft]];

/* ── Hype Train ───────────────────────────────────────────────────────────── */

function HypeSettings({ meta, module, set, tools, tab }) {
  const t = useEditorText();
  if (tab === 'look') {
    return (
      <Section title={t.placeColors}>
        <LaneFields meta={meta} module={module} set={set} yNote={t.hypeYNote} />
        <ColorRow meta={meta} module={module} set={set} labels={t.hypeColors} />
      </Section>
    );
  }
  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="cheers" />

      <Section title={t.trainSection}>
        <div>
          <Label>{t.entersFrom}</Label>
          <Choice value={module.from} options={[['left', t.fromLeft], ['right', t.fromRight]]}
            onChange={(v) => set({ from: v })} />
          <Note>{t.trainNote}</Note>
        </div>

        <div className="space-y-1">
          <ToggleRow label={t.train3d} description={t.train3dNote}
            checked={module.view3d !== false} onChange={(v) => set({ view3d: v })} />
          <ToggleRow label={t.showProgress} description={t.showProgressNote}
            checked={module.showProgress !== false} onChange={(v) => set({ showProgress: v })} />
          <ToggleRow label={t.showTimeLeft} description={t.showTimeLeftNote}
            checked={module.timer !== false} onChange={(v) => set({ timer: v })} />
          <ToggleRow label={t.namesOnPics} description={t.namesOnPicsNote}
            checked={!!module.showNames} onChange={(v) => set({ showNames: v })} />
        </div>
      </Section>

      <Section title={t.ridersSection} cols={2}>
        <Note>
          {t.ridersNote}
        </Note>
      </Section>
    </>
  );
}

/* ── Raid-Ansturm ─────────────────────────────────────────────────────────── */

function StormSettings({ meta, module, set, tools, tab }) {
  const t = useEditorText();
  const guess = module.guessNames !== false;

  if (tab === 'look') {
    return (
      <Section title={t.placeColors}>
        <LaneFields meta={meta} module={module} set={set} yNote={t.stormYNote} />
        <ColorRow meta={meta} module={module} set={set} />
        <div>
          <Label htmlFor={`${meta.id}-accent`}>{t.flagColor}</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <input id={`${meta.id}-accent`} type="color" value={module.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
            <Note>{t.flagColorNote}</Note>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="raids" />

      <Section title={t.stormSection} cols={4}>
        <div>
          <Label>{t.runDirection}</Label>
          <Choice value={module.direction} options={directionOptions(t)} onChange={(v) => set({ direction: v })} />
          <div className="mt-4">
            <Label htmlFor={`${meta.id}-minv`}>{t.minViewers}</Label>
            <Field id={`${meta.id}-minv`} type="number" min={0} className="mt-1.5" value={module.minViewers}
              onChange={(e) => set({ minViewers: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>

        <div className="space-y-4">
          <Slider label={t.startAfterRaid} value={module.delaySeconds ?? 0} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ delaySeconds: v })} />
          <Slider label={t.maxFigures} value={module.maxFigures ?? 100} min={10} max={140} step={10} unit=""
            onChange={(v) => set({ maxFigures: v })} />
          <Note>{t.maxFiguresNote}</Note>
        </div>

        <div className="space-y-1">
          <ToggleRow label={t.namesOverFigures} checked={module.showNames !== false}
            onChange={(v) => set({ showNames: v })} />
          <ToggleRow
            label={t.guessRaiders}
            description={t.guessRaidersNote}
            checked={guess}
            onChange={(v) => set({ guessNames: v })}
          />
          {guess && (
            <Note>
              {t.guessNote}
            </Note>
          )}
        </div>

      </Section>
    </>
  );
}

/* ── Flugzeug mit Banner ──────────────────────────────────────────────────── */

function PlaneSettings({ meta, module, set, tab }) {
  const t = useEditorText();
  const count = planeMessages(module).length;
  if (tab === 'look') {
    return (
      <Section title={t.placeColors}>
        <LaneFields meta={meta} module={module} set={set} yNote={t.planeYNote} />
        <ColorRow meta={meta} module={module} set={set} labels={t.planeColors} />
      </Section>
    );
  }
  return (
    <Section title={t.flightSection}>
      <div className="sm:col-span-2 xl:col-span-1">
        <Label htmlFor={`${meta.id}-msg`}>{t.message}</Label>
        <textarea id={`${meta.id}-msg`} rows={4} maxLength={1500} value={module.messages}
          onChange={(e) => set({ messages: e.target.value })}
          className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:border-accent outline-none text-sm transition-colors resize-y"
          placeholder={t.messagePlaceholder} />
        <Note>
          {count > 1
            ? t.messagesMany(count)
            : t.messagesOne}
        </Note>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor={`${meta.id}-int`}>{t.everyMinutes}</Label>
          <Field id={`${meta.id}-int`} type="number" min={1} max={240} className="mt-1.5" value={module.intervalMin}
            onChange={(e) => set({ intervalMin: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} />
          <Note>{t.everyNote}</Note>
        </div>
        <Slider label={t.flightDuration} value={module.flightSeconds ?? 24} min={8} max={60} step={2} unit=" s"
          onChange={(v) => set({ flightSeconds: v })} />
      </div>

      <div>
        <Label>{t.flightDirection}</Label>
        <Choice value={module.direction} options={directionOptions(t)} onChange={(v) => set({ direction: v })} />
      </div>
    </Section>
  );
}

/* ── Murmelbahn ───────────────────────────────────────────────────────────── */

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
  const t = useEditorText();
  const [title, setTitle] = useState(t.rewardDefaultTitle);
  const [cost, setCost] = useState(500);
  const setup = tools?.setup;
  const hasScope = !!tools?.status?.rewardScope;
  const active = !!module.rewardId;

  if (active) {
    return (
      <Section title={t.rewardSection}>
        <div>
          <p className="text-[13px] font-semibold text-white">
            {t.rewardActive(module.rewardTitle)}
          </p>
          <p className="text-[12px] text-white/45 leading-relaxed mt-1">
            {t.rewardActiveNote}
          </p>
          {module.rewardManaged ? (
            <>
              {!hasScope && (
                <div className="mt-2.5">
                  <Callout>{t.rewardScopeMissing}</Callout>
                  <div className="mt-2"><MiniButton icon={ArrowRight} onClick={() => tools?.onGrantReward()}>{t.rewardRegrant}</MiniButton></div>
                </div>
              )}
              <Note>
                {t.rewardManagedNote}
              </Note>
              <Note>{t.rewardManagedNote2}</Note>
            </>
          ) : (
            <Note>
              {t.rewardChatNote}
            </Note>
          )}
          <div className="mt-2.5">
            <MiniButton icon={Square} onClick={() => tools?.onRemoveReward()} disabled={tools?.busy}>
              {module.rewardManaged ? t.rewardOffDelete : t.rewardOff}
            </MiniButton>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section title={t.rewardCreateSection}>
        <div>
          <p className="text-[12px] text-white/55 leading-relaxed">
            {t.rewardCreateIntro}
          </p>
          {hasScope ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 mt-3">
                <div>
                  <Label htmlFor="reward-title">{t.rewardName}</Label>
                  <Field id="reward-title" className="mt-1.5" maxLength={45} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="reward-cost">{t.rewardCost}</Label>
                  <Field id="reward-cost" type="number" min={1} className="mt-1.5" value={cost}
                    onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
              <div className="mt-2.5">
                <MiniButton icon={Play} onClick={() => tools?.onCreateReward(title, cost)} disabled={tools?.busy || !module.enabled || !title.trim()}>
                  {t.rewardCreate}
                </MiniButton>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2.5">
                <MiniButton icon={ArrowRight} onClick={() => tools?.onGrantReward()}>{t.rewardGrant}</MiniButton>
              </div>
              <Note>
                {t.rewardGrantNote}
              </Note>
            </>
          )}
        </div>
      </Section>

      <Section title={t.rewardLearnSection}>
        <div>
          <p className="text-[12px] text-white/55 leading-relaxed">
            {t.rewardLearnIntro}
          </p>
          {setup?.learning ? (
            <div className="mt-2.5"><Callout>{t.rewardLearning}</Callout></div>
          ) : (
            <div className="mt-2.5">
              <MiniButton icon={Crosshair} onClick={() => tools?.onLearn()} disabled={tools?.busy || !module.enabled}>
                {t.rewardLearn}
              </MiniButton>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

function MarbleSettings({ meta, module, set, tools, tab }) {
  const t = useEditorText();
  const state = tools?.state;
  const phase = state?.phase;
  const command = module.joinCommand || '!murmel';
  const setup = tools?.setup;
  const top = setup?.top || [];
  const cmd = 'text-white/75 font-semibold';

  return (
    <>
      {tab === 'main' && (
      <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="signups" />

      <Section title={t.raceSection}>
        <div>
          <p className="text-[13px] font-semibold text-white">
            {phase
              ? t.raceStatus(t.marblePhase[phase], state.players.length)
              : t.noRace}
            {state?.winner && <span className="text-accent-soft">{t.raceWinner(state.winner.name)}</span>}
          </p>
          <div className="grid grid-cols-3 gap-1.5 mt-2.5">
            <MiniButton icon={Play} onClick={() => tools?.onAction('open')} disabled={tools?.busy || phase === 'race'}>
              {phase === 'join' ? t.reopen : t.open}
            </MiniButton>
            <MiniButton icon={ArrowRight} onClick={() => tools?.onAction('start')}
              disabled={tools?.busy || phase !== 'join' || state.players.length < 2}>
              {t.start}
            </MiniButton>
            <MiniButton icon={Square} onClick={() => tools?.onAction('cancel')} disabled={tools?.busy || !phase}>
              {t.abort}
            </MiniButton>
          </div>
          <Note>
            {t.modsCommands} <span className={cmd}>{command} open</span>,{' '}
            <span className={cmd}>{command} start</span>, <span className={cmd}>{command} stop</span>.
            {t.viewersJoinBefore} <span className={cmd}>{command}</span>{t.viewersJoinAfter}
          </Note>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor={`${meta.id}-cmd`}>{t.joinCommand}</Label>
            <Field id={`${meta.id}-cmd`} className="mt-1.5" maxLength={25} value={module.joinCommand}
              onChange={(e) => set({ joinCommand: e.target.value.replace(/\s/g, '') })} />
          </div>
          <Slider label={t.joinTime} value={module.joinSeconds ?? 60} min={0} max={300} step={15} unit=" s"
            onChange={(v) => set({ joinSeconds: v })} />
          <Note>{(module.joinSeconds ?? 60) > 0 ? t.joinAuto : t.joinManual}</Note>
        </div>

        <div className="space-y-4">
          <Slider label={t.maxMarbles} value={module.maxPlayers ?? 40} min={5} max={80} step={5} unit=""
            onChange={(v) => set({ maxPlayers: v })} />
          <Slider label={t.trackLength} value={module.sections ?? 12} min={6} max={24} step={1} unit={t.sectionsUnit}
            onChange={(v) => set({ sections: v })} />
          <Slider label={t.winnerStays} value={module.winnerSeconds ?? 15} min={5} max={60} step={5} unit=" s"
            onChange={(v) => set({ winnerSeconds: v })} />
        </div>
      </Section>
      </>
      )}

      {tab === 'reward' && (
        <RewardSettings module={module} tools={tools} />
      )}

      {tab === 'top' && (
      <Section title={t.leaderboard}>
        <div>
          {top.length ? (
            <ol className="divide-y divide-white/[0.06]">
              {top.map((e, i) => (
                <li key={`${i}-${e.name}`} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                  <span className="w-5 text-white/45 tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate font-semibold text-white">{e.name}</span>
                  <span className="tabular-nums text-white/75">{t.wins(e.wins)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] text-white/45">{t.noWinsYet}</p>
          )}
          <Note>
            {t.topNoteBefore} <span className={cmd}>!murmeltop</span> {t.topNoteAfter}
          </Note>
          {top.length > 0 && (
            <div className="mt-2.5">
              <MiniButton icon={RotateCcw} disabled={tools?.busy}
                onClick={() => { if (window.confirm(t.confirmClearTop)) tools?.onResetTop(); }}>
                {t.clearList}
              </MiniButton>
            </div>
          )}
        </div>
        <ToggleRow label={t.showOnJoin} description={t.showOnJoinNote}
          checked={module.showTop !== false} onChange={(v) => set({ showTop: v })} />
      </Section>
      )}

      {tab === 'look' && (
      <Section title={t.displaySection}>
        <ToggleRow label={t.announce} description={t.announceNote}
          checked={module.announce !== false} onChange={(v) => set({ announce: v })} />
        {module.announce !== false && (
          <Slider label={t.announceDelay} value={module.announceDelay ?? 6} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ announceDelay: v })} />
        )}
        <ToggleRow label={t.marble3d} description={t.marble3dNote}
          checked={module.view3d === true} onChange={(v) => set({ view3d: v })} />
        <ToggleRow label={t.marbleNames} description={t.marbleNamesNote}
          checked={module.showNames !== false} onChange={(v) => set({ showNames: v })} />
        <ToggleRow label={t.joinCountdown} checked={module.timer !== false}
          onChange={(v) => set({ timer: v })} />
      </Section>
      )}
    </>
  );
}

/* ── Stream-Statistik: eigene Einstellungen ───────────────────────────────── */

/** "vor 2 Std." für die Zeile, die den erkannten Sendungsbeginn bestätigt. */
function sinceText(t, ms) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return t.sinceMin(min);
  return t.sinceHours(Math.floor(min / 60), String(min % 60).padStart(2, '0'));
}

function StatsSettings({ meta, module, set, tools }) {
  const t = useEditorText();
  const show = module.show || {};
  const live = tools?.stats;

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="cheers" />

      <Section title={t.contentSection} cols={4}>
        <div>
          <Label htmlFor={`${meta.id}-label`}>{t.heading}</Label>
          <Field id={`${meta.id}-label`} className="mt-1.5" maxLength={26} value={module.label}
            placeholder={t.headingPlaceholder} onChange={(e) => set({ label: e.target.value })} />
          {module.showHead === false && <Note>{t.headingHidden}</Note>}
        </div>

        <div>
          <Label>{t.metrics}</Label>
          <div className="mt-1.5">
            {STAT_METRICS.map((mtr) => (
              <CheckItem key={mtr.key} label={t.metricLabels[mtr.key] || mtr.label} checked={!!show[mtr.key]}
                onChange={(v) => set({ show: { ...show, [mtr.key]: v } })} />
            ))}
          </div>
          <Note>{t.metricsNote}</Note>
        </div>

        <div className="space-y-3">
          <div>
            <Label>{t.countAsSub}</Label>
            <div className="mt-1.5">
              <CheckItem label={t.resubs} checked={module.countResubs !== false}
                onChange={(v) => set({ countResubs: v })} />
              <CheckItem label={t.gifts} checked={module.countGifts !== false}
                onChange={(v) => set({ countGifts: v })} />
            </div>
            <Note>{t.newSubsAlways}</Note>
          </div>
        </div>

        <div className="space-y-3">
          <ToggleRow label={t.showHead} description={t.showHeadStatsNote}
            checked={module.showHead !== false} onChange={(v) => set({ showHead: v })} />
          {module.showHead !== false && (
            <ToggleRow label={t.liveBadge} description={t.liveBadgeNote}
              checked={module.liveDot !== false} onChange={(v) => set({ liveDot: v })} />
          )}
          <ToggleRow label={t.hideOffline} description={t.hideOfflineNote}
            checked={!!module.hideOffline} onChange={(v) => set({ hideOffline: v })} />

          <div>
            <MiniButton icon={RotateCcw} onClick={tools?.onReset} disabled={tools?.busy || !live} spin={tools?.busy}>
              {t.resetCounters}
            </MiniButton>
            <Note>
              {live
                ? t.streamDetected(sinceText(t, live.startedAt), !live.live)
                : t.streamAuto}
            </Note>
            {tools?.note && <p className="text-[11px] font-semibold text-green-400 mt-1.5">{tools.note}</p>}
          </div>
        </div>
      </Section>

      <Section title={t.layoutSection} cols={3}>
        <div>
          <Label>{t.arrangement}</Label>
          <Choice
            value={module.layout}
            cols={3}
            options={[['row', t.row], ['column', t.column], ['list', t.list]]}
            onChange={(v) => set({ layout: v })}
          />
          <Note>
            {module.layout === 'list'
              ? t.listNote
              : t.blockNote}
          </Note>
        </div>

        <div>
          <Label>{t.caption}</Label>
          <Choice
            value={module.capPos === 'bottom' ? 'bottom' : 'top'}
            options={[['top', t.capTop], ['bottom', t.capBottom]]}
            onChange={(v) => set({ capPos: v })}
          />
          {module.layout === 'list' && <Note>{t.capListNote}</Note>}
        </div>

        <div>
          <Label>{t.align}</Label>
          <Choice
            value={module.align === 'left' ? 'left' : 'center'}
            options={[['center', t.alignCenter], ['left', t.alignLeft]]}
            onChange={(v) => set({ align: v })}
          />
          <Note>
            {module.layout === 'list'
              ? t.alignListNote
              : module.align === 'left'
                ? t.alignLeftNote
                : t.alignCenterNote}
          </Note>
        </div>
      </Section>
    </>
  );
}

/* ── Ziele: eigene Einstellungen ──────────────────────────────────────────── */

function GoalSettings({ meta, module, set, tools }) {
  const t = useEditorText();
  const variant = module.goalLayout || 'full';
  const compact = variant !== 'full';

  return (
    <>
    <Section title={t.goalSection} cols={3}>
      <div>
        <Label>{t.targetFrom}</Label>
        <Choice
          value={module.source}
          options={[['twitch', t.srcTwitch], ['manual', t.srcManual]]}
          onChange={(v) => set({ source: v })}
        />
        <Note>
          {module.source === 'twitch'
            ? t.srcTwitchNote
            : t.srcManualNote}
        </Note>
      </div>

      {module.source === 'twitch' && TWITCH_GOAL_TYPES[meta.id]?.length > 1 && (
        <div>
          <Label htmlFor={`${meta.id}-ttype`}>{t.whichTwitchGoal}</Label>
          <Select id={`${meta.id}-ttype`} value={module.twitchType}
            onChange={(e) => set({ twitchType: e.target.value })}>
            {TWITCH_GOAL_TYPES[meta.id].map((gt) => (
              <option key={gt.value} value={gt.value}>{goalTypeLabel(t, gt.value)}</option>
            ))}
          </Select>
          <Note>
            {module.twitchType === 'auto'
              ? t.goalAutoNote
              : t.goalFixedNote}
          </Note>
        </div>
      )}

      {tools && (
        <div>
          <Label>{t.twitchState}</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <MiniButton icon={RefreshCw} onClick={tools.onRefresh} disabled={tools.busy || !tools.connected}
              spin={tools.busy}>
              {tools.busy ? t.loading : t.refreshNow}
            </MiniButton>
            {tools.note && <span className="text-[11px] font-semibold text-green-400">{tools.note}</span>}
          </div>
          <Note>
            {t.every30}
            {tools.detected?.length > 0 && (
              <> {t.twitchReports}{' '}
                <span className="text-white/75 font-semibold">
                  {tools.detected.map((ty) => goalTypeLabel(t, ty)).join(', ')}
                </span>
              </>
            )}
          </Note>
        </div>
      )}

      <div>
        <Label htmlFor={`${meta.id}-label`}>{t.caption}</Label>
        <Field id={`${meta.id}-label`} className="mt-1.5" maxLength={30} value={module.label}
          onChange={(e) => set({ label: e.target.value })} placeholder={meta.label} />
        {module.source === 'twitch' && <Note>{t.emptyTakesDesc}</Note>}
      </div>

      {module.source === 'manual' && (
        <>
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`${meta.id}-target`}>{t.target}</Label>
                <Field id={`${meta.id}-target`} type="number" min={1} className="mt-1.5" value={module.target}
                  onChange={(e) => set({ target: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div>
                <Label htmlFor={`${meta.id}-start`}>{t.startValue}</Label>
                <Field id={`${meta.id}-start`} type="number" min={0} className="mt-1.5" value={module.startAt}
                  onChange={(e) => set({ startAt: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <Note>{t.startNote}</Note>
          </div>
          <div>
            <Label htmlFor={`${meta.id}-inc`}>{t.autoIncrease}</Label>
            <Field id={`${meta.id}-inc`} type="number" min={0} className="mt-1.5" value={module.autoIncrease}
              onChange={(e) => set({ autoIncrease: Math.max(0, Number(e.target.value) || 0) })} />
            <Note>{t.autoIncreaseNote}</Note>
            {meta.id === 'subGoal' && (
              <div className="mt-3">
                <ToggleRow
                  label={t.subPoints}
                  description={t.subPointsNote}
                  checked={!!module.usePoints}
                  onChange={(v) => set({ usePoints: v })}
                />
              </div>
            )}
          </div>
        </>
      )}
    </Section>

    <Section title={t.barSection} cols={3}>
      <div>
        <Label>{t.form}</Label>
        <Choice
          value={variant}
          cols={3}
          options={[['full', t.goalFull], ['inline', t.goalInline], ['bar', t.goalBar]]}
          onChange={(v) => set({ goalLayout: v })}
        />
        <Note>{t.goalLayoutNote[variant]}</Note>
      </div>

      <div>
        <Slider label={t.height} value={module.barHeight ?? 14} min={8} max={56} step={2} unit=" px"
          onChange={(v) => set({ barHeight: v })} />
        {compact && (module.barHeight ?? 14) < BAR_TEXT_MIN_H && (
          <Note>{t.minTextHeight(BAR_TEXT_MIN_H)}</Note>
        )}
      </div>

      <ToggleRow label={t.showPercent} description={t.showPercentNote}
        checked={module.showPercent !== false} onChange={(v) => set({ showPercent: v })} />
    </Section>
    </>
  );
}

/* ── Abstimmung & Vorhersage: die beiden eigenen Schalter ─────────────────── */

function FeedSettings({ meta, module, set }) {
  const t = useEditorText();
  const head = module.showHead !== false;
  return (
    <Section title={t.displaySection} cols={2}>
      <div>
        <Label>{t.form}</Label>
        <Choice
          value={module.layout === 'bar' ? 'bar' : 'card'}
          options={[['card', t.card], ['bar', t.bar]]}
          onChange={(v) => set({ layout: v })}
        />
        <Note>
          {module.layout === 'bar'
            ? t.feedBarNote
            : t.feedCardNote}
        </Note>
      </div>
      <div className="space-y-1">
        <ToggleRow
          label={t.showHead}
          description={t.feedHeadNote(meta.label)}
          checked={head}
          onChange={(v) => set({ showHead: v })}
        />
        {/* Der Timer sitzt in der Kopfzeile — ohne sie gibt es nichts zu schalten */}
        {head && (
          <ToggleRow label={t.showTimer} description={t.showTimerNote}
            checked={module.timer} onChange={(v) => set({ timer: v })} />
        )}
      </div>
      {meta.id === 'prediction' && (
        <ToggleRow
          label={t.hideLocked}
          description={t.hideLockedNote}
          checked={!!module.hideWhileLocked}
          onChange={(v) => set({ hideWhileLocked: v })}
        />
      )}
    </Section>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

function AlertSettings({ meta, module, set, tools }) {
  const t = useEditorText();
  const kinds = module.kinds || {};
  // Platzhalter der Textfelder: der Standard in der Sprache der Overlays (der leer gelassene Text gilt dann)
  const defaults = (DEFAULT_TEXTS[tools?.lang] || DEFAULT_TEXTS.de).alerts;

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="alerts" />

      <Section title={t.alertKindsSection}>
        <div>
          <div>
            {ALERT_KINDS.map((k) => (
              <CheckItem key={k} label={t.alertKindLabels[k]} checked={kinds[k] !== false}
                onChange={(v) => set({ kinds: { ...kinds, [k]: v } })} />
            ))}
          </div>
          <Note>{t.alertFollowNote}</Note>
          <Note>{t.alertGiftNote}</Note>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${meta.id}-minbits`}>{t.alertMinBits}</Label>
            <Field id={`${meta.id}-minbits`} type="number" min={1} className="mt-1.5" value={module.minBits ?? 1}
              onChange={(e) => set({ minBits: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div>
            <Label htmlFor={`${meta.id}-minraid`}>{t.alertMinViewers}</Label>
            <Field id={`${meta.id}-minraid`} type="number" min={0} className="mt-1.5" value={module.minRaidViewers ?? 1}
              onChange={(e) => set({ minRaidViewers: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>
      </Section>

      <Section title={t.alertShowSection}>
        <div className="space-y-3">
          <Slider label={t.alertSeconds} value={module.seconds ?? 6} min={2} max={20} step={1} unit=" s"
            onChange={(v) => set({ seconds: v })} />
          <ToggleRow label={t.alertShowMessage} description={t.alertShowMessageNote}
            checked={module.showMessage !== false} onChange={(v) => set({ showMessage: v })} />
        </div>
        <div className="space-y-3">
          <ToggleRow label={t.alertSound} description={t.alertSoundNote}
            checked={module.sound !== false} onChange={(v) => set({ sound: v })} />
          {module.sound !== false && (
            <>
              <Slider label={t.volume} value={module.volume ?? 60} min={0} max={100} step={5} unit=" %"
                onChange={(v) => set({ volume: v })} />
              <MiniButton icon={Volume2} onClick={() => playAlertSound('sub', module.volume ?? 60)}>{t.alertHearSound}</MiniButton>
            </>
          )}
          <ToggleRow label={t.alertTts} description={t.alertTtsNote}
            checked={!!module.tts} onChange={(v) => set({ tts: v })} />
        </div>
      </Section>

      <AlertMediaSection module={module} set={set} tools={tools} />

      <Section title={t.alertTextsSection}>
        <div className="space-y-2.5">
          {ALERT_KINDS.map((k) => {
            const field = ALERT_TEXT_FIELD[k];
            return (
              <div key={k}>
                <Label htmlFor={`${meta.id}-text-${k}`}>{t.alertKindLabels[k]}</Label>
                <Field id={`${meta.id}-text-${k}`} className="mt-1.5" maxLength={120} value={module[field] ?? ''}
                  placeholder={defaults[field]} onChange={(e) => set({ [field]: e.target.value })} />
              </div>
            );
          })}
          <Note>{t.alertTextsNote}</Note>
        </div>
      </Section>

      <Section title={t.alertTestSection}>
        <div>
          <div className="flex flex-wrap gap-1.5">
            {ALERT_KINDS.map((k) => (
              <MiniButton key={k} icon={Play} disabled={tools?.busy || !module.enabled} onClick={() => tools?.onTest(k)}>
                {t.alertKindLabels[k]}
              </MiniButton>
            ))}
          </div>
          <Note>{module.enabled ? t.alertTestNote : t.moduleOff}</Note>
        </div>
      </Section>
    </>
  );
}

/** Was der Datei-Dialog anbietet. Geprüft wird am Server an den ersten Bytes (Backend/streamTool/lib/streamToolMedia.js). */
const MEDIA_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav';
const MB = 1024 * 1024;
const mediaSelect = 'w-full min-w-0 bg-[#1a1a20] border border-white/10 rounded-lg px-2 py-1.5 text-white outline-none text-[12px] focus:border-accent disabled:text-white/30';

/**
 * Eigene Töne und Bilder je Alert-Art (Abo-Extra). Die Dateien liegen am Server (eine Liste je Konto), das Modul
 * merkt sich nur, welche Datei zu welcher Art gehört: module.media = { follow: { sound, image }, … }.
 */
function AlertMediaSection({ module, set, tools }) {
  const t = useEditorText();
  const premium = tools?.premium;
  const on = !!premium?.on;
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const mediaMap = module.media && typeof module.media === 'object' ? module.media : {};

  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    api.listMedia().then((d) => { if (alive) setLib(d); }).catch(() => {});
    return () => { alive = false; };
  }, [on]);

  const files = lib?.media || [];
  const images = files.filter((f) => f.kind === 'image');
  const sounds = files.filter((f) => f.kind === 'sound');
  const locale = t.lang === 'en' ? 'en-US' : 'de-DE';
  // Unter 1 MB in KB, sonst MB mit einer Stelle — „0 MB“ für ein kleines Bild sähe nach Fehler aus
  const sizeText = (bytes) => (bytes < MB
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / MB).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`);

  /** Zuordnung ändern; eine Art ohne Ton und Bild fällt aus der Liste. */
  const pick = (kind, field, id) => {
    const next = { sound: mediaMap[kind]?.sound || null, image: mediaMap[kind]?.image || null, [field]: id || null };
    const media = { ...mediaMap };
    if (next.sound || next.image) media[kind] = next;
    else delete media[kind];
    set({ media });
  };

  const upload = async (e) => {
    const chosen = [...(e.target.files || [])];
    e.target.value = '';
    if (!chosen.length) return;
    setBusy(true);
    try {
      for (const f of chosen) {
        const d = await api.uploadMedia(f);
        setLib((prev) => ({ ...(prev || {}), media: [d.media, ...((prev && prev.media) || [])], usage: d.usage }));
      }
    } catch (err) {
      tools?.flash?.(apiErrorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f) => {
    if (!window.confirm(t.alertMediaDeleteConfirm(f.name || f.id))) return;
    setBusy(true);
    try {
      const d = await api.deleteMedia(f.id);
      setLib((prev) => ({ ...prev, media: (prev?.media || []).filter((x) => x.id !== f.id), usage: d.usage }));
      // Verweise auf die gelöschte Datei lösen — sonst bliebe eine Lücke statt des Standards
      const media = {};
      for (const [k, v] of Object.entries(mediaMap)) {
        const next = { sound: v?.sound === f.id ? null : v?.sound || null, image: v?.image === f.id ? null : v?.image || null };
        if (next.sound || next.image) media[k] = next;
      }
      set({ media });
    } catch (err) {
      tools?.flash?.(apiErrorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={<>{t.alertMediaSection}<PremiumMark /></>}>
      {!on ? (
        <div><PremiumNote premium={premium} /></div>
      ) : (
        <>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white/40">
              <span>{t.alertMediaImage}</span>
              <span>{t.alertMediaSound}</span>
            </div>
            <div className="space-y-2 mt-1.5">
              {ALERT_KINDS.map((k) => {
                const sel = mediaMap[k] || {};
                return (
                  <div key={k}>
                    <p className="text-[12px] font-semibold text-white/75">{t.alertKindLabels[k]}</p>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-1.5 mt-1">
                      <select aria-label={`${t.alertKindLabels[k]} · ${t.alertMediaImage}`} className={mediaSelect}
                        value={sel.image || ''} onChange={(e) => pick(k, 'image', e.target.value)}>
                        <option value="">{t.alertMediaNoImage}</option>
                        {images.map((f) => <option key={f.id} value={f.id}>{f.name || f.id}</option>)}
                      </select>
                      <select aria-label={`${t.alertKindLabels[k]} · ${t.alertMediaSound}`} className={mediaSelect}
                        value={sel.sound || ''} onChange={(e) => pick(k, 'sound', e.target.value)}>
                        <option value="">{t.alertMediaNone}</option>
                        {sounds.map((f) => <option key={f.id} value={f.id}>{f.name || f.id}</option>)}
                      </select>
                      <button type="button" title={t.alertMediaPlay} aria-label={`${t.alertKindLabels[k]} · ${t.alertMediaPlay}`}
                        onClick={() => playAlertSound(k, module.volume ?? 60, mediaUrl(sel.sound))}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-colors">
                        <Volume2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label>{t.alertMediaFiles}</Label>
              {lib?.usage && lib?.limits && (
                <span className="text-[11px] text-white/45 tabular-nums">
                  {t.alertMediaUsage(lib.usage.files, lib.limits.files, sizeText(lib.usage.bytes), sizeText(lib.limits.total))}
                </span>
              )}
            </div>
            {!files.length ? <Note>{t.alertMediaEmpty}</Note> : (
              <ul className="mt-1.5 max-h-56 overflow-y-auto custom-scrollbar divide-y divide-white/[0.06]">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                    {f.kind === 'image'
                      ? <ImageIcon size={13} className="shrink-0 text-white/45" />
                      : <Music size={13} className="shrink-0 text-white/45" />}
                    <span className="min-w-0 flex-1 truncate text-white/80">{f.name || f.id}</span>
                    <span className="shrink-0 tabular-nums text-white/35">{sizeText(f.size)}</span>
                    <button type="button" disabled={busy} onClick={() => remove(f)} title={t.alertMediaDelete} aria-label={`${t.alertMediaDelete}: ${f.name || f.id}`}
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-white/45 hover:text-red-300 disabled:text-white/20 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileRef} type="file" accept={MEDIA_ACCEPT} multiple className="sr-only" onChange={upload} tabIndex={-1} />
            <div className="mt-2.5">
              <MiniButton icon={Upload} spin={false} disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? t.alertMediaUploading : t.alertMediaUpload}
              </MiniButton>
            </div>
            <Note>{t.alertMediaNote}</Note>
          </div>
        </>
      )}
    </Section>
  );
}

/* ── Subathon-Timer ───────────────────────────────────────────────────────── */

const SUB_STATUS_TONE = { idle: 'text-white/50', running: 'text-green-300', paused: 'text-amber-300', ended: 'text-white/50' };
/** Höchstwert einer Regel (wie RULE_MAX_S in subathonCore.js). */
const SUB_RULE_MAX_S = 24 * 3600;
const SUB_QUICK_MINUTES = [1, 5, 10, -1, -5];

/** Uhrzeit eines Verlaufseintrags; ältere als ein Tag mit Datum. */
function subLogTime(at, lang) {
  const d = new Date(at);
  const locale = lang === 'en' ? 'en-US' : 'de-DE';
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (Date.now() - at < 20 * 3600 * 1000) return time;
  return `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${time}`;
}

/**
 * Drei Reiter: Steuerung (Start, Pause, Zeit, Spenden, Verlauf), Regeln (was wie viel bringt, Start, Obergrenze,
 * Chat) und Aussehen (Anzeige; Platz und Farben hängt ModuleSettings darunter wie bei jeder Karte).
 */
function SubathonSettings({ module, set, tools, tab }) {
  const t = useEditorText();
  const rules = module.rules || {};
  const cur = module.currency || '€';
  const data = tools?.data || null;
  const offsetRef = tools?.offsetRef;
  const [manual, setManual] = useState(15);
  const [amount, setAmount] = useState('');
  const [donor, setDonor] = useState('');
  const [happyMinutes, setHappyMinutes] = useState(30);
  const [happyFactor, setHappyFactor] = useState(2);

  const view = data || { status: 'idle', remainingMs: 0, endsAt: 0, elapsedMs: 0, addedMs: 0, capMs: 0, capReached: false, log: [] };
  // Eigener Sekundentakt nur, solange der Timer oder eine Happy Hour läuft (die läuft auch in der Pause weiter)
  const running = module.enabled && (view.status === 'running' || !!view.happy);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  if (tab === 'rules') {
    const ruleMinutes = (k) => Math.round(((rules[k] ?? MODULE_DEFAULTS.subathon.rules[k]) / 60) * 100) / 100;
    const setRule = (k, minutes) => {
      const s = Math.round(Math.min(SUB_RULE_MAX_S, Math.max(0, (Number(minutes) || 0) * 60)));
      set({ rules: { ...rules, [k]: s } });
    };
    return (
      <>
        <Section title={t.subRulesSection}>
          <div className="space-y-2">
            {SUBATHON_RULE_KEYS.map((k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
                <Label htmlFor={`sub-rule-${k}`}>{t.subRuleLabels[k].replace('{cur}', cur)}</Label>
                <div className="flex items-center gap-1.5">
                  <Field id={`sub-rule-${k}`} type="number" min={0} step={0.5} value={ruleMinutes(k)}
                    onChange={(e) => setRule(k, e.target.value)} />
                  <span className="text-[11px] text-white/45">{t.subMinutes}</span>
                </div>
              </div>
            ))}
            <Note>{t.subRulesNote}</Note>
          </div>
          <div className="space-y-1">
            <ToggleRow label={t.subCountResubs} description={t.subCountResubsNote}
              checked={module.countResubs !== false} onChange={(v) => set({ countResubs: v })} />
            <ToggleRow label={t.subCountGifts} description={t.subCountGiftsNote}
              checked={module.countGifts !== false} onChange={(v) => set({ countGifts: v })} />
          </div>
          <div>
            <Label>{t.subCurrency}</Label>
            <Choice value={cur} cols={3} options={SUBATHON_CURRENCIES.map((c) => [c, c])} onChange={(v) => set({ currency: v })} />
          </div>
        </Section>

        <Section title={t.subLimitsSection}>
          <div>
            <Label htmlFor="sub-start">{t.subStartMinutes}</Label>
            <Field id="sub-start" type="number" min={1} className="mt-1.5" value={module.startMinutes ?? 60}
              onChange={(e) => set({ startMinutes: Math.min(59940, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
            <Note>{t.subStartNote}</Note>
          </div>
          <div>
            <Label htmlFor="sub-cap">{t.subCapHours}</Label>
            <Field id="sub-cap" type="number" min={0} className="mt-1.5" value={module.capHours ?? 0}
              onChange={(e) => set({ capHours: Math.min(999, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
            <Note>{t.subCapHoursNote}</Note>
          </div>
        </Section>

        <Section title={t.subChatSection}>
          <div className="space-y-1">
            <ToggleRow label={t.subChatInfo} description={t.subChatInfoNote}
              checked={module.chatInfo !== false} onChange={(v) => set({ chatInfo: v })} />
            <ToggleRow label={t.subChatMods} description={t.subChatModsNote}
              checked={module.chatMods !== false} onChange={(v) => set({ chatMods: v })} />
            <Note>{t.subChatCommands}</Note>
          </div>
        </Section>
      </>
    );
  }

  if (tab === 'look') {
    return (
      <Section title={t.subDisplaySection}>
        <div>
          <Label htmlFor="sub-label">{t.subLabel}</Label>
          <Field id="sub-label" className="mt-1.5" maxLength={30} value={module.label ?? ''} placeholder="Subathon"
            onChange={(e) => set({ label: e.target.value })} />
        </div>
        <div className="space-y-1">
          <ToggleRow label={t.subShowHead} description={t.subShowHeadNote}
            checked={module.showHead !== false} onChange={(v) => set({ showHead: v })} />
          <ToggleRow label={t.subShowLast} description={t.subShowLastNote}
            checked={module.showLast !== false} onChange={(v) => set({ showLast: v })} />
          <ToggleRow label={t.subShowPop} description={t.subShowPopNote}
            checked={module.showPop !== false} onChange={(v) => set({ showPop: v })} />
          <ToggleRow label={t.subShowCap} description={t.subShowCapNote}
            checked={module.showCap !== false} onChange={(v) => set({ showCap: v })} />
          <ToggleRow label={t.subHideIdle} description={t.subHideIdleNote}
            checked={!!module.hideIdle} onChange={(v) => set({ hideIdle: v })} />
        </div>
      </Section>
    );
  }

  if (tab !== 'main') return null;

  /* ── Steuerung ── */
  const now = Date.now() + (offsetRef?.current || 0);
  const remaining = subathonRemaining(view, module, now);
  const status = view.status === 'running' && remaining <= 0 ? 'ended' : view.status;
  // Verstrichene Zeit läuft mit: was seit dem Abruf von der Restzeit abging, ist dazugekommen
  const elapsed = (Number(view.elapsedMs) || 0) + (view.status === 'running' ? Math.max(0, (Number(view.remainingMs) || 0) - remaining) : 0);
  const busy = !!tools?.busy;
  const canAdd = module.enabled && status !== 'idle';
  const canDonate = module.enabled && (status === 'running' || status === 'paused');
  const action = (name, payload) => tools?.onAction(name, payload);
  const premium = tools?.premium;
  const happyLeft = canDonate && view.happy ? Math.max(0, Number(view.happy.until) - now) : 0;
  const amountNum = Number(String(amount).replace(',', '.'));
  const donationMs = amountNum > 0 ? Math.round(amountNum * (rules.donation ?? MODULE_DEFAULTS.subathon.rules.donation) * 1000) : 0;
  const ot = OVERLAY_TEXTS.dict(t.lang);
  const { num } = overlayFormat(t.lang);
  const log = Array.isArray(view.log) ? view.log : [];

  const submitDonation = async () => {
    const ok = await tools?.onAction('donation', { amount: amountNum, name: donor.trim() });
    if (ok) { setAmount(''); setDonor(''); }
  };

  return (
    <>
      <ChatWatchNote watch={tools?.watch} enabled={module.enabled} what="subathon" />

      <Section title={t.subTimerSection}>
        <div>
          {!module.enabled ? <Note>{t.subOffNote}</Note> : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[34px] font-extrabold leading-none tabular-nums text-white">
                  {subathonClock(status === 'idle' ? subathonStartMs(module) : remaining)}
                </span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${SUB_STATUS_TONE[status] || ''}`}>
                  {t.subStatusLabels[status]}
                </span>
              </div>
              <Note>
                {status === 'idle' && t.subStartsWith(subathonClock(subathonStartMs(module)))}
                {(status === 'running' || status === 'paused') && t.subStats(subathonClock(elapsed), subathonDelta(view.addedMs || 0))}
                {status === 'ended' && t.subRanFor(subathonClock(elapsed))}
                {view.capMs > 0 && ` ${t.subCapInfo(subathonClock(view.capMs))}`}
              </Note>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {status === 'idle' && <MiniButton icon={Play} disabled={busy} onClick={() => action('start')}>{t.subStart}</MiniButton>}
                {status === 'running' && <MiniButton icon={Pause} disabled={busy} onClick={() => action('pause')}>{t.subPause}</MiniButton>}
                {status === 'paused' && <MiniButton icon={Play} disabled={busy} onClick={() => action('start')}>{t.subResume}</MiniButton>}
                {status !== 'idle' && (
                  <MiniButton icon={RotateCcw} disabled={busy}
                    onClick={() => { if (window.confirm(t.subResetConfirm)) action('reset'); }}>
                    {t.subReset}
                  </MiniButton>
                )}
              </div>
              {status === 'ended' && <Note>{t.subEndedNote}</Note>}
              {view.capReached && status !== 'ended' && <Note>{t.subCapReachedNote}</Note>}
            </>
          )}
        </div>
      </Section>

      {module.enabled && (
        <Section title={t.subManualSection}>
          <div>
            <div className="flex flex-wrap gap-1.5">
              {SUB_QUICK_MINUTES.map((m) => (
                <MiniButton key={m} icon={m > 0 ? Plus : Minus} disabled={busy || !canAdd || (m < 0 && status === 'ended')}
                  onClick={() => action('add', { seconds: m * 60 })}>
                  {Math.abs(m)} {t.subMinutes}
                </MiniButton>
              ))}
            </div>
            <div className="flex items-end gap-1.5 mt-2.5">
              <div className="min-w-0 flex-1">
                <Label htmlFor="sub-manual">{t.subManualMinutes}</Label>
                <Field id="sub-manual" type="number" min={1} className="mt-1.5" value={manual}
                  onChange={(e) => setManual(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
              </div>
              <MiniButton icon={Plus} disabled={busy || !canAdd || !manual} onClick={() => action('add', { seconds: manual * 60 })}>{t.subAdd}</MiniButton>
              <MiniButton icon={Minus} disabled={busy || !canAdd || !manual || status === 'ended'} onClick={() => action('add', { seconds: -manual * 60 })}>{t.subSubtract}</MiniButton>
            </div>
            <Note>{t.subManualNote}</Note>
          </div>
        </Section>
      )}

      {module.enabled && (
        <Section title={<>{t.subHappySection}<PremiumMark /></>}>
          <div>
            {!premium?.on ? <PremiumNote premium={premium} /> : happyLeft > 0 ? (
              <>
                <p className="text-[13px] font-bold text-white tabular-nums">
                  {t.subHappyRunning(view.happy.factor, subathonClock(happyLeft).replace(/^0:/, ''))}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <MiniButton icon={Square} disabled={busy} onClick={() => action('happyStop')}>{t.subHappyStop}</MiniButton>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <Label>{t.subHappyFactor}</Label>
                    <Choice value={happyFactor} options={[[2, '×2'], [3, '×3']]} onChange={setHappyFactor} />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="sub-happy-minutes">{t.subHappyMinutes}</Label>
                    <Field id="sub-happy-minutes" type="number" min={1} max={240} className="mt-1.5" value={happyMinutes}
                      onChange={(e) => setHappyMinutes(Math.min(240, Math.max(0, Math.round(Number(e.target.value) || 0))))} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <MiniButton icon={Zap} disabled={busy || !canDonate || !(happyMinutes >= 1)}
                    onClick={() => action('happy', { minutes: happyMinutes, factor: happyFactor })}>
                    {t.subHappyStart}
                  </MiniButton>
                </div>
                {!canDonate && <Note>{t.subHappyNeedsRun}</Note>}
              </>
            )}
            <Note>{t.subHappyNote}</Note>
          </div>
        </Section>
      )}

      {module.enabled && (
        <Section title={t.subDonationSection}>
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <Label htmlFor="sub-amount">{t.subDonationAmount(cur)}</Label>
                <Field id="sub-amount" type="number" min={0} step="0.01" className="mt-1.5" value={amount}
                  onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="min-w-0">
                <Label htmlFor="sub-donor">{t.subDonationName}</Label>
                <Field id="sub-donor" maxLength={40} className="mt-1.5" value={donor} onChange={(e) => setDonor(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <MiniButton icon={HandCoins} disabled={busy || !canDonate || !(amountNum > 0)} onClick={submitDonation}>{t.subDonationAdd}</MiniButton>
              {donationMs > 0 && <span className="text-[11.5px] text-white/60 tabular-nums">{t.subDonationPreview(subathonDelta(donationMs))}</span>}
            </div>
            <Note>{t.subDonationNote}</Note>
          </div>
        </Section>
      )}

      {module.enabled && (
        <Section title={t.subLogSection}>
          <div>
            {!log.length ? <Note>{t.subLogEmpty}</Note> : (
              <ul className="max-h-72 overflow-y-auto custom-scrollbar -my-1 divide-y divide-white/[0.06]">
                {log.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 py-1.5 text-[12px]">
                    <span className="shrink-0 tabular-nums text-white/35">{subLogTime(e.at, t.lang)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.name && <b className="text-white">{e.name} </b>}
                      <span className="text-white/55">{subathonWhat(e, ot, num, cur)}</span>
                    </span>
                    {e.capped && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-300">{t.subLogCapped}</span>}
                    {e.x > 1 && <span className="shrink-0 text-[10px] font-bold text-accent-soft">×{e.x}</span>}
                    <span className={`shrink-0 tabular-nums font-bold ${e.ms < 0 ? 'text-red-300' : 'text-green-300'}`}>{subathonDelta(e.ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/* ── Einstellungen eines Moduls ───────────────────────────────────────────── */

/** Reiter der Einstellungen. Ohne eigenen Eintrag: was das Modul tut / wie es aussieht. */
/* [Reiter, Schlüssel des Namens in editorI18n.tabs] */
const SETTING_TABS = {
  marbles: [['main', 'race'], ['reward', 'reward'], ['top', 'top'], ['look', 'look']],
  subathon: [['main', 'control'], ['rules', 'rules'], ['look', 'look']],
};
const DEFAULT_SETTING_TABS = [['main', 'main'], ['look', 'look']];

/**
 * Der Aufrufer hängt die Komponente per key ans Modul — beim Wechsel beginnt
 * sie also wieder auf dem ersten Reiter.
 */
function ModuleSettings({ meta, module, onChange, warning, goalTools, raidTools, statsTools, sceneTools, alertTools, subathonTools }) {
  const t = useEditorText();
  const set = (patch) => onChange(patch);
  const tabs = SETTING_TABS[meta.kind] || DEFAULT_SETTING_TABS;
  const [tab, setTab] = useState('main');
  const main = tab === 'main';
  // Karten im gemeinsamen Design zeigen Farbe, Deckkraft und Glas nur, wenn
  // das Modul ausdrücklich ein eigenes Aussehen hat. Die Murmelbahn gehört
  // nicht zum Design und behält ihre Regler immer.
  const themed = THEMED_IDS.includes(meta.id);
  const ownLook = !themed || !!module.ownLook;

  return (
    <div>
      {/* Unterstrich-Reiter, bleiben beim Blättern oben stehen */}
      <div className="sticky top-0 z-10 flex gap-5 px-4 border-b border-white/10 bg-[#0f0f16]" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-10 -mb-px border-b-2 text-[12.5px] font-bold transition-colors ${
              tab === id ? 'border-accent-soft text-white' : 'border-transparent text-white/45 hover:text-white/85'
            }`}>
            {t.tabs[label]}
          </button>
        ))}
      </div>

    <div className="p-4 space-y-4">
      {main && <p className="text-[11.5px] text-white/45 leading-relaxed max-w-3xl">{meta.hint}</p>}
      {warning && <Callout>{warning}</Callout>}

      {main && meta.kind === 'feed' && <FeedSettings meta={meta} module={module} set={set} />}
      {main && meta.kind === 'goal' && <GoalSettings meta={meta} module={module} set={set} tools={goalTools} />}
      {main && meta.kind === 'stats' && <StatsSettings meta={meta} module={module} set={set} tools={statsTools} />}
      {main && meta.kind === 'raid' && <RaidSettings meta={meta} module={module} set={set} tools={raidTools} />}
      {main && meta.kind === 'alerts' && <AlertSettings meta={meta} module={module} set={set} tools={alertTools} />}
      {meta.kind === 'subathon' && <SubathonSettings module={module} set={set} tools={subathonTools} tab={tab} />}
      {meta.kind === 'hype' && <HypeSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'storm' && <StormSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'plane' && <PlaneSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}
      {meta.kind === 'marbles' && <MarbleSettings meta={meta} module={module} set={set} tools={sceneTools} tab={tab} />}

      {/* Aussehen und Platzierung — bei jeder Karte dasselbe. Szenen bringen
          Höhe, Größe und Farben in ihrem eigenen Reiter mit. */}
      {!meta.scene && tab === 'look' && (
      <Section title={t.placeColors}>
        <div>
          <Label>{t.position}</Label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <Field aria-label="Position X" type="number" value={Math.round(module.x)}
              onChange={(e) => set({ x: Number(e.target.value) || 0 })} />
            <Field aria-label="Position Y" type="number" value={Math.round(module.y)}
              onChange={(e) => set({ y: Number(e.target.value) || 0 })} />
          </div>
          <Note>{t.xyNote}</Note>
        </div>

        <div className="space-y-4">
          <Slider label={t.size} value={Math.round(module.scale * 100)} min={50} max={180} step={5} unit=" %"
            onChange={(v) => set({ scale: v / 100 })} />
          {ownLook && (
            <Slider label={t.opacity} value={module.opacity} min={0} max={100} step={5} unit=" %"
              onChange={(v) => set({ opacity: v })} />
          )}
        </div>

        <div>
          {themed && (
            <div className="mb-4">
              <ToggleRow label={t.ownLook}
                description={t.ownLookNote}
                checked={ownLook} onChange={(v) => set({ ownLook: v })} />
            </div>
          )}
          {ownLook && (
            <>
              <Label htmlFor={`${meta.id}-accent`}>{t.accent}</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <input id={`${meta.id}-accent`} type="color" value={module.accent}
                  onChange={(e) => set({ accent: e.target.value })}
                  className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
                <Field value={module.accent} maxLength={7} className="!text-xs tabular-nums"
                  onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set({ accent: e.target.value })} />
              </div>
            </>
          )}

          <div className={ownLook ? 'mt-4' : ''}>
            <Label htmlFor={`${meta.id}-anim`}>{t.entrance}</Label>
            <Select id={`${meta.id}-anim`} value={module.anim} onChange={(e) => set({ anim: e.target.value })}>
              <option value="up">{t.anim.up}</option>
              <option value="fade">{t.anim.fade}</option>
              <option value="left">{t.anim.left}</option>
              <option value="right">{t.anim.right}</option>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>{t.colors}</Label>
            <button onClick={() => set({ colors: [...MODULE_DEFAULTS[meta.id].colors] })}
              className="text-[11px] font-semibold text-white/45 hover:text-accent-soft transition-colors">
              {t.standard}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {module.colors.slice(0, meta.maxColors).map((c, i) => (
              <input key={i} type="color" value={c} title={t.optionN(i + 1)}
                onChange={(e) => set({ colors: module.colors.map((old, idx) => (idx === i ? e.target.value : old)) })}
                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
            ))}
          </div>
          <Note>{meta.colorHint}</Note>

          {/* Beim Raid-Clip nicht anbieten: die Unschärfe hinter der Karte
              hindert Twitch daran, den Clip von allein zu starten. Die
              Murmelbahn ist ebenfalls immer flach (großer Canvas). */}
          {ownLook && meta.id !== 'raidClip' && meta.id !== 'marbleRun' && (
            <div className="mt-4">
              <ToggleRow label={t.glass} description={t.glassCard}
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
    ? 'border-accent-soft/40 bg-accent/15 text-white'
    : 'border-white/10 text-white/75 hover:text-white hover:border-white/25'}`;

/** Knopf in der Kopfleiste, der ein Menü darunter aufklappt. */
function BarMenu({ label, icon: Icon, width = 340, mark, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={barButton(open)}>
        <Icon size={14} />
        <span className="hidden md:inline">{label}</span>
        {mark && <span className="w-1.5 h-1.5 rounded-sm bg-amber-400" />}
        <ChevronDown size={12} className="text-white/45" />
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

/**
 * Gemeinsames Design aller Karten. Stil und Ecken gelten immer für alle;
 * Farbe, Deckkraft und Glas für jedes Modul, das nicht „Eigenes Aussehen“ hat.
 */
function ThemeMenu({ theme, set, ownCount, premium }) {
  const t = useEditorText();
  const ownNote = t.ownCountNote(ownCount);
  // Jede Schrift in sich selbst zeigen — dafür alle auf einmal laden, aber erst, wenn das Menü offen ist
  useFontLink(ALL_FONTS_HREF);
  const fontOn = premium?.on ? theme.font : 'inter';
  return (
    <div className="p-3.5 space-y-4">
      <div>
        <Label>{t.style}</Label>
        <Choice
          value={theme.style === 'classic' ? 'classic' : 'clean'}
          options={[['clean', t.modern], ['classic', t.classic]]}
          onChange={(v) => set({ style: v })}
        />
        <Note>
          {theme.style === 'classic'
            ? t.classicNote
            : t.modernNote}
        </Note>
      </div>

      <div>
        <Label htmlFor="theme-accent">{t.accent}</Label>
        <div className="flex items-center gap-2 mt-1.5">
          <input id="theme-accent" type="color" value={theme.accent}
            onChange={(e) => set({ accent: e.target.value })}
            className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
          <Field value={theme.accent} maxLength={7} className="!text-xs tabular-nums"
            onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && set({ accent: e.target.value })} />
        </div>
      </div>

      <Slider label={t.corners} value={theme.radius} min={0} max={24} step={2} unit=" px"
        onChange={(v) => set({ radius: v })} />
      <Slider label={t.opacity} value={theme.opacity} min={0} max={100} step={5} unit=" %"
        onChange={(v) => set({ opacity: v })} />
      <ToggleRow label={t.glass} description={t.glassCards}
        checked={theme.glass} onChange={(v) => set({ glass: v })} />

      <Note>
        {t.themeAppliesTo}
        {ownCount > 0 && ownNote}
      </Note>

      {/* Abo-Extra: ohne Abo bleibt Inter gewählt, die anderen öffnen den Abo-Hinweis */}
      <div>
        <Label>{t.font}<PremiumMark /></Label>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          {OVERLAY_FONTS.map((f) => {
            const active = fontOn === f.id;
            const locked = !premium?.on && f.id !== 'inter';
            return (
              <button key={f.id} type="button" aria-pressed={active}
                onClick={() => (locked ? (premium?.sales && premium.ask()) : set({ font: f.id }))}
                title={locked ? (premium?.sales ? t.premiumLock : t.comingSoon) : undefined}
                className={`flex items-center justify-between gap-1.5 px-2.5 h-9 rounded-lg border text-[13px] text-left transition-colors ${
                  active ? 'bg-accent/15 text-white border-accent-soft/30' : 'bg-white/[0.03] border-white/10 hover:text-white'
                } ${locked ? 'text-white/35' : 'text-white/70'}`}>
                <span className="truncate font-semibold"
                  style={{ fontFamily: fontFamilyOf(f.id) || undefined, fontSynthesis: f.single ? 'none' : undefined }}>{f.label}</span>
                {locked && <Lock size={11} className="shrink-0 text-white/30" />}
              </button>
            );
          })}
        </div>
        <Note>{t.fontNote}</Note>
        <div className="mt-2"><PremiumNote premium={premium} /></div>
      </div>
    </div>
  );
}

/** Eine Zeile im Test-Menü: was passiert, Start, Stopp. */
function TestItem({ title, text, off, busy, onStart, onStop, children }) {
  const t = useEditorText();
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">{title}</p>
          <p className="text-[11px] text-white/45 leading-snug">{off ? t.moduleOff : text}</p>
        </div>
        {onStop && (
          <button type="button" onClick={onStop} title={t.stop} disabled={off}
            className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md border border-white/10 text-white/45 hover:text-white hover:border-white/25 disabled:opacity-40 transition-colors">
            <Square size={12} />
          </button>
        )}
        <button type="button" onClick={onStart} disabled={off || busy}
          className="h-8 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-[12px] font-bold transition-colors">
          <Play size={12} />
          {t.startShort}
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
function TestMenu({ modules, busy, note, demoOn, setDemoOn, demoOutcomes, setDemoOutcomes, onScene, onStopScene, onRaid, onStopRaid, onMarbles, onAlert }) {
  const t = useEditorText();
  const [viewers, setViewers] = useState(40);
  const [channel, setChannel] = useState('');
  const [alertKind, setAlertKind] = useState('follow');
  const small = 'mt-2 w-full bg-[#1a1a22] border border-white/10 rounded-md px-2.5 py-1.5 text-white placeholder-white/30 focus:border-accent outline-none text-[12px]';

  return (
    <div className="divide-y divide-white/[0.08]">
      <div className="px-3.5 py-3">
        <ToggleRow label={t.demoData}
          description={t.demoDataNote}
          checked={demoOn} onChange={setDemoOn} />
        {demoOn && (
          <div className="flex items-center gap-2 mt-2 pl-12">
            <span className="text-[11px] text-white/45">{t.predWith}</span>
            {[2, 4].map((n) => (
              <button key={n} type="button" onClick={() => setDemoOutcomes(n)}
                className={`h-6 px-2 rounded-sm border text-[11px] font-bold transition-colors ${
                  demoOutcomes === n ? 'border-accent-soft/40 bg-accent/15 text-white' : 'border-white/10 text-white/45 hover:text-white'
                }`}>
                {t.nOptions(n)}
              </button>
            ))}
          </div>
        )}
      </div>

      <TestItem title={t.modules.alerts.label} text={t.testAlerts}
        off={!modules.alerts.enabled} busy={busy}
        onStart={() => onAlert(alertKind)}>
        <select value={alertKind} onChange={(e) => setAlertKind(e.target.value)} className={small} aria-label={t.modules.alerts.label}>
          {ALERT_KINDS.map((k) => <option key={k} value={k}>{t.alertKindLabels[k]}</option>)}
        </select>
      </TestItem>

      <TestItem title={t.modules.hypeTrain.label} text={t.testHype}
        off={!modules.hypeTrain.enabled} busy={busy}
        onStart={() => onScene('hype')} onStop={() => onStopScene('hype')} />

      <TestItem title={t.modules.raidStorm.label} text={t.testStorm}
        off={!modules.raidStorm.enabled} busy={busy}
        onStart={() => onScene('storm', viewers)} onStop={() => onStopScene('storm')}>
        <label className="flex items-center gap-2 text-[11px] text-white/45">
          <span className="mt-2 shrink-0">{t.viewers}</span>
          <input type="number" min={1} max={5000} value={viewers} className={small}
            onChange={(e) => setViewers(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </TestItem>

      <TestItem title={t.modules.planeBanner.label} text={t.testPlane}
        off={!modules.planeBanner.enabled || !planeMessages(modules.planeBanner).length} busy={busy}
        onStart={() => onScene('plane')} />

      <TestItem title={t.modules.marbleRun.label} text={t.testMarbles}
        off={!modules.marbleRun.enabled} busy={busy}
        onStart={onMarbles} onStop={() => onStopScene('marbles')} />

      <TestItem title={t.modules.raidClip.label} text={t.testRaidClip}
        off={!modules.raidClip.enabled} busy={busy || !channel.trim()}
        onStart={() => onRaid(channel)} onStop={onStopRaid}>
        <input value={channel} maxLength={30} placeholder={t.channelPlaceholder} className={small}
          onChange={(e) => setChannel(e.target.value)} />
        {note && <p className="text-[11px] font-semibold text-green-400 mt-1.5">{note}</p>}
      </TestItem>
    </div>
  );
}

/* ── OBS-Link ─────────────────────────────────────────────────────────────── */

function ObsLinkSection({ overlayKey, onRegenerate }) {
  const t = useEditorText();
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

  const iconButton = 'w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md border border-white/10 text-white/45 hover:text-white hover:border-white/25 transition-colors';

  return (
    <div className="p-3.5 space-y-3">
      <div>
        <p className="text-[13px] font-bold text-white">{t.obsSource}</p>
        <p className="text-[11px] text-white/45 leading-relaxed mt-0.5">
          {t.obsNote}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`flex-1 min-w-0 h-8 flex items-center bg-[#1a1a22] border border-white/10 rounded-md px-2.5 text-white/55 text-[11px] truncate ${hidden ? 'blur-sm select-none' : ''}`}>
          <span className="truncate">{link || t.loading}</span>
        </div>
        <button type="button" onClick={() => setHidden((v) => !v)} title={hidden ? t.show : t.hide} className={iconButton}>
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
      <button type="button" onClick={copy} disabled={!link}
        className="w-full h-8 inline-flex items-center justify-center gap-2 rounded-md bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-[12px] font-bold transition-colors">
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? t.copied : t.copyLink}
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-white/45">{t.demoHintBefore} <span className="text-white/75">?demo=1</span>{t.demoHintAfter}</p>
        <button type="button" onClick={onRegenerate} disabled={!overlayKey}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/45 hover:text-red-400 transition-colors">
          <RefreshCw size={11} />
          {t.newLink}
        </button>
      </div>
    </div>
  );
}

/* ── Hauptseite ───────────────────────────────────────────────────────────── */

export default function PollsPredictionsPage() {
  const { user, login, accessToken } = useContext(TwitchAuthContext);
  const t = useEditorText();
  // Für Rückrufe und Effekte, die nicht bei jedem Sprachwechsel neu entstehen sollen
  const tRef = useRef(t);
  tRef.current = t;
  // Sprache des Editors = Sprache der Overlays im Stream (wie bei Win Challenge und Win Tracker)
  // syncUrl: die englische Fassung hat wie bei der Win Challenge eine eigene Adresse (?lang=en) für Suchmaschinen
  const { lang, setLang, explicit: langExplicit } = useLanguage({ supported: EDITOR_TEXTS.langs, syncUrl: true });
  const modules = useMemo(() => MODULES.map((mod) => ({ ...mod, ...t.modules[mod.id] })), [t]);

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
  const [subathonBusy, setSubathonBusy] = useState(false);
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
    setAboNote(tRef.current.aboActivating);
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      api.getMe()
        .then((d) => {
          if (d.premium?.active) {
            setPremium(d.premium);
            setAboNote(tRef.current.aboActive);
            clearInterval(id);
            setTimeout(() => setAboNote(''), 8000);
          } else if (tries >= 10) {
            setAboNote(tRef.current.aboPending);
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
  const saveSoon = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveConfig(next)
        .then((r) => { if (r?.chatWatch) setChatWatch(r.chatWatch); })
        .catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);
  const patchModule = useCallback((id, patch) => {
    setConfig((prev) => {
      const next = { ...prev, modules: { ...prev.modules, [id]: { ...prev.modules[id], ...patch } } };
      saveSoon(next);
      return next;
    });
  }, [saveSoon]);
  /** Gemeinsames Design aller Karten (Stil, Farbe, Ecken, Deckkraft). */
  const patchTheme = useCallback((patch) => {
    setConfig((prev) => {
      const next = { ...prev, theme: { ...THEME_DEFAULTS, ...prev.theme, ...patch } };
      saveSoon(next);
      return next;
    });
  }, [saveSoon]);

  /* ── Community-Vorlage aus der Overlay-Galerie (?vorlage=u:<id>, StreamerTools/vorlagen) ── */
  // Nach dem Laden der eigenen Einstellungen einmal das Design übernehmen (wie ein Klick im Design-Menü), die Angabe
  // aus der Adresse nehmen und als Übernahme zählen
  const vorlageDone = useRef(false);
  useEffect(() => {
    if (!loaded || !user || vorlageDone.current) return;
    vorlageDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const vorlageId = userVorlageId(params.get('vorlage'));
    if (!vorlageId) return;
    params.delete('vorlage');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    getVorlage(vorlageId)
      .then((v) => {
        if (!v || v.tool !== 'twitch') return;
        // Die Schrift gehört zum Abo — ohne bleibt die eigene stehen
        const { font, ...rest } = v.style || {};
        patchTheme(premium?.active && font ? { ...rest, font } : rest);
        countVorlageUse(vorlageId).catch(() => {});
      })
      .catch(() => {});
  }, [loaded, user, patchTheme, premium]);

  /* ── Sprache: Editor und Overlays sprechen dieselbe ─────────────────────── */
  // Wie bei der Win Challenge: beim ersten Laden gewinnt eine bewusst gewählte Sprache der Website (Adresse,
  // Speicher, vorher umgeschaltet), sonst die gespeicherte Overlay-Sprache. Jeder spätere Wechsel oben in der
  // Leiste stellt auch die Overlays um — unveränderte Standardtexte wechseln dabei mit (withLanguage).
  const langPrev = useRef(lang);
  const langFirst = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    const changed = langPrev.current !== lang;
    langPrev.current = lang;
    const first = langFirst.current;
    langFirst.current = false;
    if (config.language === lang) return;
    if (changed || (first && langExplicit)) {
      setConfig((prev) => {
        const next = withLanguage(prev, lang);
        saveSoon(next);
        return next;
      });
    } else {
      setLang(config.language);
    }
  }, [lang, loaded, config.language]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Live-Stand ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || !connected) return undefined;
    let alive = true;
    const load = () => {
      api.getLive()
        .then((d) => {
          if (!alive) return;
          clockOffset.current = d.serverNow - Date.now();
          setLive({ poll: d.poll, prediction: d.prediction, goals: d.goals, raid: d.raid, stats: d.stats, scenes: d.scenes, alerts: d.alerts, subathon: d.subathon, notice: d.notice });
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
      setGoalNote(tRef.current.updated);
      setTimeout(() => setGoalNote(''), 2500);
    } catch (e) {
      flash(apiErrorText(tRef.current, e));
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
        flash(clipWarningText(tRef.current, d));
      } else if (d.event?.clip) {
        const wait = Number(d.event.delaySeconds) || 0;
        setRaidNote(wait > 0 ? tRef.current.raidStartsIn(wait, d.event.clip.title) : tRef.current.raidRunning(d.event.clip.title));
      } else {
        setRaidNote(tRef.current.raidNoClip);
      }
      setTimeout(() => setRaidNote(''), 10000);
    } catch (e) {
      flash(apiErrorText(tRef.current, e));
    } finally {
      setRaidBusy(false);
    }
  }, []);

  const stopRaid = useCallback(async () => {
    try {
      await api.stopRaid();
      setLive((prev) => ({ ...prev, raid: null }));
      setRaidNote('');
    } catch (e) { flash(apiErrorText(tRef.current, e)); }
  }, []);

  /* ── Statistik-Zähler zurücksetzen ──────────────────────────────────────── */
  const resetStats = useCallback(async () => {
    setStatsBusy(true);
    setStatsNote('');
    try {
      const d = await api.resetStats();
      setLive((prev) => ({ ...prev, stats: d.stats }));
      setStatsNote(tRef.current.resetDone);
      setTimeout(() => setStatsNote(''), 2500);
    } catch (e) {
      flash(apiErrorText(tRef.current, e));
    } finally {
      setStatsBusy(false);
    }
  }, []);

  /* ── Szenen: Probeläufe und Murmelbahn ──────────────────────────────────── */
  const refreshLive = useCallback(async () => {
    const d = await api.getLive();
    clockOffset.current = d.serverNow - Date.now();
    setLive({ poll: d.poll, prediction: d.prediction, goals: d.goals, raid: d.raid, stats: d.stats, scenes: d.scenes, alerts: d.alerts, subathon: d.subathon, notice: d.notice });
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
      flash(apiErrorText(tRef.current, e));
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

  /** Test-Alert der gewählten Art — läuft wie die Szenen-Probeläufe (erst speichern, dann Stand nachholen). */
  const testAlertKind = useCallback((kind) => runScene(() => api.testAlert(kind)), [runScene]);

  /**
   * Subathon-Steuerung. Erst den offenen Speichervorgang abschließen (sonst gilt ein eben eingeschaltetes Modul
   * oder eine eben geänderte Regel am Server noch nicht), dann den Stand aus der Antwort übernehmen.
   * @returns {Promise<boolean>} ob es geklappt hat
   */
  const subathonAction = useCallback(async (name, payload = {}) => {
    setSubathonBusy(true);
    try {
      clearTimeout(saveTimer.current);
      await api.saveConfig(configRef.current).catch(() => {});
      const calls = {
        start: () => api.subathonStart(),
        pause: () => api.subathonPause(),
        reset: () => api.subathonReset(),
        add: () => api.subathonAdd(payload.seconds, payload.name),
        donation: () => api.subathonDonation(payload.amount, payload.name),
        happy: () => api.subathonHappy(payload.minutes, payload.factor),
        happyStop: () => api.subathonHappyStop(),
      };
      const d = await calls[name]();
      if (d && d.subathon) setLive((prev) => ({ ...prev, subathon: d.subathon }));
      return true;
    } catch (e) {
      flash(apiErrorText(tRef.current, e));
      return false;
    } finally {
      setSubathonBusy(false);
    }
  }, []);

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
  const reportPlacings = useCallback((raceId, ids) => {
    if (overlayKey) api.reportMarblePlacings(overlayKey, raceId, ids).catch(() => {});
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
      flash(apiErrorText(tRef.current, e));
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
            flash(tRef.current.rewardServerOld);
          } else if (!r.sceneStatus.rewardScope) {
            flash(tRef.current.rewardScopeNotGiven);
          }
        }
        try { sessionStorage.removeItem(REWARD_FLAG); } catch { /* egal */ }
      })
      .catch((e) => { if (rewardPending) flash(tRef.current.connectFailed(apiErrorText(tRef.current, e))); });
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
    } catch (e) { flash(apiErrorText(tRef.current, e)); }
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
  // Abo-Extras (Schrift, eigene Töne/Bilder, Happy Hour): Schalter für Schilder und Hinweise in den Einstellungen
  const premiumInfo = { on: !!premium?.active, sales: salesVisible(), ask: () => setPremiumOpen(true) };
  // Mit eingerechnetem Design — die Einstellungen unten lesen dagegen config.modules. Ohne Abo zeigt die Bühne,
  // was die OBS-Quelle zeigt (der Server lässt die Abo-Extras dann weg).
  const shownConfig = premiumInfo.on ? config : withoutPremium(config);
  const m = effectiveModules(shownConfig);
  useFontLink(fontHref(shownConfig.theme?.font));
  const now = Date.now() + clockOffset.current;
  // Die Vorschau spricht die Sprache der Overlays im Stream (config.language), nicht die des Editors
  const overlayLang = config.language;
  const sim = useDemoSim(demoOn, demoOutcomes, overlayLang);

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
  const marblesView = scenes.marbles || (demoOn ? demoMarbles(m.marbleRun, overlayLang) : null);
  const hypeView = scenes.hype || (demoOn ? demoHype(overlayLang) : null);

  // Alerts: laufende (auch Tests) spielen in der Vorschau ab. Ton und Vorlesen nur bei Tests — echte Alerts sind
  // für die OBS-Quelle da, nicht für den Browser des Streamers.
  const alertLive = useAlertPlayer(live.alerts?.events, m.alerts, (ev) => {
    if (!ev.test) return;
    const mod = m.alerts;
    if (mod.sound !== false) playAlertSound(ev.kind, mod.volume ?? 60, alertMediaOf(mod, ev.kind).sound);
    if (mod.tts) setTimeout(() => speakAlert(alertSpeech(ev, mod, overlayLang), overlayLang, mod.volume ?? 60), 700);
  });
  // Zum Ausrichten steht ein Beispiel auf der Bühne, solange nichts läuft (Demo-Daten an oder Modul ausgewählt)
  const alertDemo = demoOn || selected === 'alerts';
  const alertView = alertLive.visible || !alertDemo ? alertLive.current : demoAlert('sub', OVERLAY_TEXTS.dict(overlayLang));

  // Subathon: der echte Stand, sobald das Modul an ist; sonst zum Ausrichten ein Beispiel (Demo-Daten an oder Modul
  // ausgewählt). Beim ausgewählten Modul bleibt hideIdle außen vor, sonst verschwände die Karte beim Einrichten.
  const subathonData = live.subathon || ((demoOn || selected === 'subathon') ? demoSubathon() : null);
  const subathonView = toSubathonView(subathonData, selected === 'subathon' ? { ...m.subathon, hideIdle: false } : m.subathon);

  // Was auf der Leinwand liegt — dieselbe Reihenfolge wie die Modul-Liste
  const rendered = {
    poll: pollHeld && <PollWidget data={pollHeld} module={m.poll} />,
    prediction: predHeld && <PredictionWidget data={predHeld} module={m.prediction} />,
    followerGoal: followerView && <GoalWidget data={followerView} module={m.followerGoal} />,
    subGoal: subView && <GoalWidget data={subView} module={m.subGoal} />,
    streamStats: statsView && <StatsWidget data={statsView} module={m.streamStats} />,
    raidClip: raidView && <RaidClipWidget data={raidView} module={m.raidClip} preview />,
    alerts: alertView && <AlertWidget event={alertView} module={m.alerts} still={!alertLive.visible} />,
    // key: beim Wechsel vom Beispiel zum echten Stand neu beginnen — sonst hielte die Karte den ganzen Verlauf
    // für frisch gutgeschrieben und ließe die Summe als „+…“ aufspringen
    subathon: subathonView && (
      <SubathonWidget key={live.subathon ? 'live' : 'demo'} data={subathonView} module={m.subathon} offsetRef={clockOffset} />
    ),
    marbleRun: marblesView && (
      <MarbleRunWidget data={marblesView} module={m.marbleRun} offsetRef={clockOffset} onResult={reportWinner} onPlacings={reportPlacings} />
    ),
  };
  const hasData = {
    poll: !!pollView,
    prediction: !!predView,
    followerGoal: !!followerView,
    subGoal: !!subView,
    streamStats: !!statsView,
    raidClip: !!raidView,
    alerts: alertLive.visible || (alertDemo && !!alertView),
    subathon: !!subathonView,
    marbleRun: !!marblesView,
  };

  /** Modul, dessen Einstellungen gerade unter der Leinwand stehen. */
  const activeMeta = modules.find((x) => x.id === selected) || modules[0];

  /** Aktive Twitch-Ziele, die zu einem Ziel-Modul passen würden. */
  const detectedGoalTypes = (id) =>
    (TWITCH_GOAL_FAMILY[id] || []).filter((ty) => live.goals?.twitch?.[ty]);

  /** Erklärt direkt am Modul, warum ein Ziel leer bleibt. */
  const moduleWarning = (id) => {
    if (!connected) return null;
    const mod = config.modules[id];
    if (!mod) return null;

    if (id === 'hypeTrain' && mod.enabled && sceneStatus && !sceneStatus.hypeScope) {
      return t.warnHypeScope;
    }
    if (id === 'raidStorm' && mod.enabled && mod.guessNames !== false && sceneStatus && !sceneStatus.chattersScope) {
      return t.warnChattersScope;
    }
    if (id === 'hypeTrain' || id === 'raidStorm' || id === 'marbleRun') {
      if (!mod.enabled || !chatWatch || chatWatch.botConfigured) return null;
      return t.warnNoBotScenes;
    }

    if (id === 'alerts') {
      if (!mod.enabled) return null;
      if (mod.kinds?.follow !== false && chatWatch && chatWatch.followScope === false) return t.warnFollowScope;
      if (chatWatch && !chatWatch.botConfigured) return t.warnNoBotAlerts;
      return null;
    }

    if (id === 'subathon') {
      if (!mod.enabled || !chatWatch || chatWatch.botConfigured) return null;
      return t.warnNoBotSubathon;
    }

    if (id === 'raidClip' || id === 'streamStats') {
      if (!mod.enabled || !chatWatch || chatWatch.botConfigured) return null;
      return id === 'raidClip'
        ? t.warnNoBotRaid
        : t.warnNoBotStats;
    }

    if (id !== 'subGoal' && id !== 'followerGoal') return null;

    // Modus "Twitch-Ziel": entweder fehlt das Recht oder es ist gar keins gesetzt
    if (mod.source === 'twitch') {
      if (live.goals?.twitchGoalsError === 'scope' || (loaded && !hasTwitchGoalScope)) {
        return t.warnGoalScope;
      }
      if (live.goals?.twitch && !resolveTwitchGoal(id, live.goals, mod)) {
        // Häufigster Fall beim Abo-Ziel: Twitch führt eins, aber über die Anzahl
        // statt über die Punkte. Das ist keine Fehlfunktion, nur ein anderer Typ.
        const found = detectedGoalTypes(id);
        if (found.length) {
          return t.warnGoalType(goalTypeLabel(t, found[0]), goalTypeLabel(t, mod.twitchType));
        }
        return t.warnNoGoal;
      }
      return null;
    }

    if (id !== 'subGoal') return null;
    if (missingGoalScopes.includes('channel:read:subscriptions')) {
      return t.warnSubScope;
    }
    if (live.goals?.subsError === 'forbidden') {
      return t.warnSubForbidden;
    }
    if (live.goals && live.goals.subs === null) {
      return t.warnSubNull;
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

  const seoText = stSeo(lang);
  const langSearch = lang === 'en' ? '?lang=en' : '';
  const seo = (
    <SEO
      title={seoText.title}
      description={seoText.description}
      keywords={seoText.keywords}
      path={ST_PATH} search={langSearch} lang={lang} alternates={ST_ALTERNATES}
    />
  );

  /* ── Login-Schranke ─────────────────────────────────────────────────────────
     Zugleich die Fassung, die Suchmaschinen sehen — der Crawler ist nie angemeldet.
     Deshalb steht hier, was die Overlays können, und nur hier hängen die strukturierten
     Daten zu Fragen und Einrichtung: FAQPage und HowTo dürfen nur ausgezeichnet werden,
     wenn derselbe Text sichtbar auf der Seite steht. */
  if (!user) {
    return (
      <ToolScroll>
        <div className="page-fade max-w-6xl mx-auto">
          <SEO
            title={seoText.title}
            description={seoText.description}
            keywords={seoText.keywords}
            path={ST_PATH} search={langSearch} lang={lang} alternates={ST_ALTERNATES}
            jsonLd={buildStreamToolJsonLd(lang)}
          />
          <StreamToolSeoContent lang={lang}>
            <div className="flex flex-col items-center gap-2">
              <Button variant="twitch" size="lg" icon={TwitchGlyph} onClick={() => login(false, loginScopes)}>
                {t.loginCta}
              </Button>
              <p className="text-white/30 text-xs">{t.loginFree}</p>
            </div>
          </StreamToolSeoContent>
        </div>
      </ToolScroll>
    );
  }

  const needsRights = connected && (missingGoalScopes.length > 0 || !hasTwitchGoalScope || sceneScopeMissing);
  // Ohne eigenes display: wer den Knopf auf dem Handy ausblenden will, setzt `hidden sm:inline-flex`
  // davor — ein inline-flex hier hätte das `hidden` überstimmt.
  const iconToggle = (on) =>
    `w-8 h-8 items-center justify-center rounded-md border transition-colors ${
      on ? 'border-accent-soft/40 bg-accent/15 text-accent-soft' : 'border-white/10 text-white/45 hover:text-white hover:border-white/25'
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
        className={`relative flex items-center transition-colors ${isActive ? 'bg-accent/[0.12]' : 'hover:bg-white/[0.04]'}`}>
        <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[2px] ${isActive ? 'bg-accent-soft' : 'bg-transparent'}`} />
        <button type="button" onClick={() => setSelected(meta.id)} aria-pressed={isActive}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left h-10 pl-3.5 pr-1">
          <Icon size={15} className={`shrink-0 ${isActive ? 'text-accent-soft' : (module.enabled ? 'text-white/75' : 'text-white/30')}`} />
          <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-white' : (module.enabled ? 'text-white/85' : 'text-white/45')}`}>
            {meta.label}
          </span>
          {hint && <span title={t.actionNeeded} className="w-1.5 h-1.5 shrink-0 rounded-sm bg-amber-400" />}
        </button>
        {locked ? (
          // Solange noch nicht verkauft wird (config/legal.js), ist das Schloss nur ein Hinweis
          <button type="button" onClick={() => setPremiumOpen(true)} disabled={!salesVisible()}
            title={salesVisible() ? t.premiumLock : t.comingSoon}
            className="shrink-0 mx-2 w-9 h-7 inline-flex items-center justify-center rounded-sm text-accent-soft bg-accent/10 enabled:hover:bg-accent/20 disabled:text-white/30 disabled:bg-white/5 transition-colors">
            <Lock size={13} />
          </button>
        ) : (
          <label className="relative shrink-0 cursor-pointer px-3 py-2.5" title={module.enabled ? t.turnOff : t.turnOn}>
            <input type="checkbox" checked={module.enabled} className="peer sr-only"
              onChange={(e) => patchModule(meta.id, { enabled: e.target.checked })} />
            <span className="block w-8 h-[18px] rounded-full bg-white/10 peer-checked:bg-accent/50 transition-colors" />
            <span className="absolute top-[13px] left-[15px] w-3 h-3 rounded-full bg-white/60 peer-checked:bg-white peer-checked:translate-x-[14px] transition-transform" />
          </label>
        )}
      </div>
    );
  };

  const railGroup = (title, list) => (
    <section>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/45 px-3.5 pt-3.5 pb-1.5">{title}</p>
      {list.map(railItem)}
    </section>
  );

  // Arbeitsfläche über die ganze Höhe der Tool-Hülle (components/toolShell), damit die Bühne den
  // Platz bekommt. Verbindung, Raster, Testen und OBS-Link stehen in deren Kopfleiste (ToolHeader).
  return (
    <div className="h-full flex flex-col bg-[#0b0b11] text-white overflow-y-auto lg:overflow-hidden">
      {seo}
      <h1 className="sr-only">{t.pageTitle}</h1>

      {/* ══════════ Kopfleiste (in der Leiste der Tool-Hülle) ══════════ */}
      <ToolHeader>
        {connected ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-white/55 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="truncate">{twitchLogin || t.connectedFallback}</span>
            <button type="button" onClick={disconnect} title={t.disconnect}
              className="p-1 rounded-sm text-white/30 hover:text-red-400 transition-colors">
              <LogOut size={12} />
            </button>
          </span>
        ) : (
          <button type="button" onClick={connect} disabled={busy} title={t.connect} aria-label={t.connect}
            className="h-8 px-2.5 sm:px-3 shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-md bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-[12px] font-bold transition-colors">
            <TwitchGlyph size={13} />
            <span className="hidden sm:inline">{busy ? t.connecting : t.connect}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setGridOn((v) => !v)} title={t.grid} className={`hidden sm:inline-flex ${iconToggle(gridOn)}`}>
            <Grid3x3 size={14} />
          </button>
          <button type="button" onClick={() => setSnapOn((v) => !v)} title={t.snap}
            className={`hidden sm:inline-flex ${iconToggle(snapOn)}`}>
            <Crosshair size={14} />
          </button>

          <BarMenu label={t.design} icon={Palette} width={340}>
            <ThemeMenu
              theme={{ ...THEME_DEFAULTS, ...config.theme }}
              set={patchTheme}
              ownCount={THEMED_IDS.filter((id) => config.modules[id].ownLook).length}
              premium={premiumInfo}
            />
          </BarMenu>

          <BarMenu label={t.test} icon={FlaskConical} width={360}>
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
              onAlert={testAlertKind}
            />
          </BarMenu>

          <BarMenu label={t.obsLink} icon={Link2} width={340}>
            <ObsLinkSection overlayKey={overlayKey} onRegenerate={async () => {
              try { setOverlayKey((await api.regenerateOverlayKey()).overlayKey); } catch (e) { flash(apiErrorText(tRef.current, e)); }
            }} />
          </BarMenu>
        </div>
      </ToolHeader>

      {/* Meldungen: eine schmale Zeile je Sache, nur wenn es etwas zu sagen gibt */}
      {(error || live.notice || needsRights || aboNote) && (
        <div className="shrink-0 border-b border-white/10 divide-y divide-white/[0.06]">
          {aboNote && (
            <p className="flex items-center gap-2 px-4 py-2 text-[12px] text-accent-soft bg-accent/10">{aboNote}</p>
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
                  ? t.rightsScenes
                  : t.rightsSome}{' '}
                <button type="button" onClick={() => login(false, loginScopes)} className="underline font-semibold hover:text-white">
                  {t.grantRights}
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
          {railGroup(t.railCards, modules.filter((x) => !x.scene))}
          {railGroup(t.railScenes, modules.filter((x) => x.scene))}
          {/* Abo: Hinweis unter den Szenen — abschließen oder verwalten */}
          {premium && !premium.active && salesVisible() && (
            <button type="button" onClick={() => setPremiumOpen(true)}
              className="mx-3 mt-3 w-[calc(100%-1.5rem)] h-9 inline-flex items-center justify-center gap-2 rounded-md bg-accent hover:bg-accent-hover text-white text-[12px] font-bold transition-colors">
              <Lock size={13} /> {t.unlockScenes}
            </button>
          )}
          {premium?.source === 'subscription' && (
            <p className="px-3.5 mt-3 text-[11px] text-white/45">
              {premium.cancelAtPeriodEnd ? t.aboRunsUntil(untilText(premium.until)) : t.aboActiveUntil(untilText(premium.until))}{' '}
              <button type="button" onClick={() => openPortal('/twitch-tools').catch((e) => flash(apiErrorText(tRef.current, e)))} className="text-accent-soft hover:text-white">{t.manage}</button>
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
              <OverlayLangContext.Provider value={overlayLang}>
              <div className="stw-stage" lang={overlayLang} style={{ zoom: scale }}>
                {gridOn && <div className="stw-thirds" />}
                {guides.v && <div className="stw-guide v" style={{ left: STAGE_W / 2 }} />}
                {guides.h && <div className="stw-guide h" style={{ top: STAGE_H / 2 }} />}

                {modules.filter((meta) => !meta.scene).map((meta) => (
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
              </OverlayLangContext.Provider>
            </div>
          </div>

          <p className="shrink-0 px-4 pb-3 text-[11px] text-white/45 flex flex-wrap gap-x-4 gap-y-1">
            <span className="tabular-nums">1920 × 1080 · {Math.round(scale * 100)} %</span>
            <span>{t.stageHelp}</span>
            {!connected && <span className="text-amber-300/80">{t.connectForData}</span>}
          </p>
        </main>

        {/* Einstellungen des gewählten Moduls */}
        {activeMeta && (
          <aside className="min-w-0 lg:min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0f0f16]">
            <div className="shrink-0 h-12 flex items-center gap-2.5 px-3.5 border-b border-white/10">
              <activeMeta.icon size={15} className="text-accent-soft shrink-0" />
              <p className="text-[13.5px] font-bold text-white truncate">{activeMeta.label}</p>
              <div className="ml-auto flex items-center gap-1.5">
                {/* Eine Szene hat keine Karte, die sich mittig setzen ließe */}
                {!activeMeta.scene && (
                  <button type="button" onClick={() => centerWidget(activeMeta.id)} title={t.centerOnStage} className={`inline-flex ${iconToggle(false)}`}>
                    <Crosshair size={14} />
                  </button>
                )}
                <button type="button" title={t.resetToDefault} className={`inline-flex ${iconToggle(false)}`}
                  // Standardtexte in der Sprache der Overlays (sonst stünde in einem englischen Overlay wieder Deutsch)
                  onClick={() => patchModule(activeMeta.id, withLanguage({ modules: { [activeMeta.id]: { ...MODULE_DEFAULTS[activeMeta.id] } } }, config.language).modules[activeMeta.id])}>
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
                alertTools={activeMeta.kind === 'alerts' ? {
                  watch: chatWatch,
                  onTest: testAlertKind,
                  busy: sceneBusy,
                  lang: config.language,
                  premium: premiumInfo,
                  flash,
                } : null}
                subathonTools={activeMeta.kind === 'subathon' ? {
                  watch: chatWatch,
                  data: live.subathon || null,
                  busy: subathonBusy,
                  onAction: subathonAction,
                  offsetRef: clockOffset,
                  premium: premiumInfo,
                } : null}
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
    </div>
  );
}
