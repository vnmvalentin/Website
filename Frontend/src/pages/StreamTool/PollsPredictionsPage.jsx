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
import {
  Copy, Check, Eye, EyeOff, RefreshCw, BarChart3, Scale, Crosshair, Grid3x3,
  LogOut, TriangleAlert, Info, Users, Star, ArrowRight, Clapperboard, Play, Square,
} from 'lucide-react';
import { TwitchGlyph } from '../../components/BrandGlyphs';
import SEO from '../../components/SEO';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import * as api from './streamToolApi';
import { STREAM_TOOL_SCOPES } from './streamToolApi';
import {
  defaultConfig, mergeConfig, toPollView, toPredictionView, toGoalView, toRaidView, useDemoSim,
  useLinger, paintDemo, MODULE_DEFAULTS, TWITCH_GOAL_TYPES, TWITCH_GOAL_FAMILY, resolveTwitchGoal,
} from './streamToolConfig';
import {
  PollWidget, PredictionWidget, GoalWidget, RaidClipWidget, WidgetFrame, STAGE_W, STAGE_H,
} from './OverlayWidgets';

const LIVE_POLL_MS = 2500;
const SAVE_DEBOUNCE_MS = 700;

/**
 * Aufteilung der Spaltenhöhe zwischen Bühne und Einstellungen.
 *
 * Vorher war die Leinwand immer so breit wie die Spalte. Auf 2560x1440 passte
 * darunter noch alles, auf 1920x1080 lagen die Einstellungen aber unterhalb des
 * sichtbaren Bereichs — man musste blind scrollen. Jetzt bekommt die Bühne einen
 * Anteil der Bildhöhe, der Rest gehört den Einstellungen (mit eigenem Bildlauf).
 */
const STAGE_HEIGHT_SHARE = 0.55;
/** So viel von den Einstellungen bleibt immer sichtbar. */
const SETTINGS_MIN_H = 190;
/** Kleiner soll die Bühne nicht werden, auch nicht auf flachen Fenstern. */
const STAGE_MIN_H = 260;

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
    hint: 'Zeigt die laufende Kanalpunkte-Vorhersage — bei mehr als zwei Optionen als Anteilsleiste mit Liste.',
    maxColors: 10,
    colorHint: 'Farben der Optionen. Die Voreinstellung ist auf Farbfehlsichtigkeit geprüft.',
  },
  {
    id: 'followerGoal',
    kind: 'goal',
    label: 'Follower-Ziel',
    icon: Users,
    hint: 'Fortschrittsbalken zu deinem Follower-Ziel. Die Zahl kommt alle 30 Sekunden frisch von Twitch.',
    maxColors: 1,
    colorHint: 'Farbe des Fortschrittsbalkens.',
  },
  {
    id: 'subGoal',
    kind: 'goal',
    label: 'Abo-Ziel',
    icon: Star,
    hint: 'Fortschrittsbalken zu deinem Abo-Ziel. Nur für Affiliates und Partner — Twitch gibt Abo-Zahlen sonst nicht heraus.',
    maxColors: 1,
    colorHint: 'Farbe des Fortschrittsbalkens.',
  },
  {
    id: 'raidClip',
    kind: 'raid',
    label: 'Clip des Raiders',
    icon: Clapperboard,
    hint: 'Raidet dich jemand, spielt das Overlay automatisch einen Clip aus dessen Kanal ab — ohne dass du etwas anklicken musst.',
    maxColors: 1,
    colorHint: 'Farbe der Raid-Überschrift.',
  },
];

const GOAL_TYPE_LABEL = (id, value) =>
  TWITCH_GOAL_TYPES[id]?.find((t) => t.value === value)?.label || value;

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

/* ── kleine Bausteine ─────────────────────────────────────────────────────── */

const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
    {children}
  </label>
);

const Field = (props) => (
  <input
    {...props}
    className={`w-full bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-violet-400 outline-none text-sm transition-colors ${props.className || ''}`}
  />
);

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

/* ── Clip des Raiders: eigene Einstellungen ───────────────────────────────── */

function RaidSettings({ meta, module, set, tools }) {
  const [login, setLogin] = useState('');

  return (
    <div className="space-y-4 pb-4 border-b border-white/5">
      {/* Ohne Chat-Bot im Kanal kommt kein Raid an — das gehört an die erste Stelle */}
      {tools?.watch && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 max-w-3xl border ${
          tools.watch.watching
            ? 'bg-green-500/10 border-green-500/25'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <Info size={13} className={`shrink-0 mt-0.5 ${tools.watch.watching ? 'text-green-400' : 'text-amber-400'}`} />
          <p className={`text-[11.5px] leading-relaxed ${tools.watch.watching ? 'text-green-200' : 'text-amber-200'}`}>
            {tools.watch.watching
              ? `Raids in ${tools.watch.channel} werden erkannt.`
              : !module.enabled
                ? 'Schalte das Modul oben ein — danach hört der Chat-Bot in deinem Kanal auf Raids.'
                : !tools.watch.botConfigured
                  ? 'Auf diesem Server ist kein Chat-Bot hinterlegt. Ohne ihn lassen sich Raids nicht erkennen.'
                  : 'Der Chat-Bot betritt deinen Kanal gerade — das dauert bis zu einer halben Minute.'}
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4">
        <div>
          <Label>Clip-Auswahl</Label>
          <Choice
            value={module.pick}
            options={[['top', 'Beliebteste'], ['random', 'Bunt gemischt']]}
            onChange={(v) => set({ pick: v })}
          />
          <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
            {module.pick === 'top'
              ? 'Zufällig aus den fünf meistgesehenen Clips — so kommt nicht jedes Mal derselbe.'
              : 'Zufällig aus bis zu 50 Clips des Kanals.'}
          </p>

          <div className="mt-4">
            <Label htmlFor={`${meta.id}-period`}>Zeitraum</Label>
            <select id={`${meta.id}-period`} value={String(module.period)}
              onChange={(e) => set({ period: Number(e.target.value) })}
              className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm focus:border-violet-400">
              <option value="7">Letzte 7 Tage</option>
              <option value="30">Letzte 30 Tage</option>
              <option value="365">Letztes Jahr</option>
              <option value="0">Alle Clips</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <Slider label="Start nach Raid" value={module.delaySeconds ?? 0} min={0} max={30} step={1} unit=" s"
            onChange={(v) => set({ delaySeconds: v })} />
          <Slider label="Spieldauer" value={module.maxSeconds} min={5} max={60} step={5} unit=" s"
            onChange={(v) => set({ maxSeconds: v })} />
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Der Vorlauf lässt deinen Raid-Alert ausreden, bevor der Clip anfängt — sonst laufen zwei Tonspuren gleichzeitig. Längere Clips werden nach der Spieldauer abgeschnitten.
          </p>
          <ToggleRow
            label="Ton abspielen"
            description="Gilt nur in OBS: im Browser lässt sich Ton nicht von allein starten, dort läuft der Clip stumm."
            checked={module.sound !== false}
            onChange={(v) => set({ sound: v })}
          />
          {module.sound !== false && (
            <Slider label="Lautstärke" value={module.volume ?? 100} min={0} max={100} step={5} unit=" %"
              onChange={(v) => set({ volume: v })} />
          )}
        </div>

        <div>
          <Label htmlFor={`${meta.id}-minv`}>Ab wie vielen Zuschauern</Label>
          <Field id={`${meta.id}-minv`} type="number" min={0} className="mt-1.5" value={module.minViewers}
            onChange={(e) => set({ minViewers: Math.max(0, Number(e.target.value) || 0) })} />
          <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
            Kleine Raids überspringen: 0 spielt bei jedem Raid, 5 erst ab fünf mitgebrachten Zuschauern.
          </p>
          <div className="mt-3">
            <ToggleRow
              label="Raider einblenden"
              description="Zeigt Name und Zuschauerzahl über dem Clip."
              checked={module.showRaider !== false}
              onChange={(v) => set({ showRaider: v })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${meta.id}-test`}>Probelauf</Label>
          <Field id={`${meta.id}-test`} className="mt-1.5" maxLength={30} value={login} placeholder="twitch-kanal"
            onChange={(e) => setLogin(e.target.value)} />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => tools?.onTest(login)} disabled={tools?.busy || !login.trim()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white disabled:text-gray-600 disabled:hover:border-white/10 transition-colors">
              <Play size={13} />
              {tools?.busy ? 'Startet…' : 'Im Overlay abspielen'}
            </button>
            <button onClick={() => tools?.onStop()} title="Laufenden Clip beenden"
              className="p-2 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/25 transition-colors">
              <Square size={13} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
            Spielt einen Clip dieses Kanals in deiner OBS-Quelle ab — genau wie bei einem echten Raid, samt Vorlauf. Oben in der Vorschau läuft er stumm mit, damit du Position und Zeitpunkt siehst.
          </p>
          {tools?.note && <p className="text-[11px] font-semibold text-green-400 mt-1.5">{tools.note}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Einstellungen eines Moduls ───────────────────────────────────────────── */

function ModuleSettings({ meta, module, onChange, warning, goalTools, raidTools }) {
  const set = (patch) => onChange(patch);

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11.5px] text-gray-500 leading-relaxed max-w-3xl">{meta.hint}</p>

      {warning && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 max-w-3xl">
          <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200 text-[11.5px] leading-relaxed">{warning}</p>
        </div>
      )}

      {meta.kind === 'raid' && <RaidSettings meta={meta} module={module} set={set} tools={raidTools} />}

      {/* Zielquelle bekommt eine eigene Zeile — der Erklärtext braucht Breite */}
      {meta.kind === 'goal' && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4 pb-4 border-b border-white/5">
          {/* Quelle: Twitch-Ziel spiegeln oder eigenes rechnen */}
          <div>
            <Label>Zielwert kommt von</Label>
            <Choice
              value={module.source}
              options={[['twitch', 'Twitch-Ziel'], ['manual', 'Eigenes Ziel']]}
              onChange={(v) => set({ source: v })}
            />
            <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
              {module.source === 'twitch'
                ? 'Das Ziel stellst du im Twitch-Creator-Dashboard ein. Es erscheint dort auch unter dem Stream und im Chat — dieses Overlay zeigt genau dieselben Zahlen, nur schöner. Erhöht Twitch den Zielwert nach dem Erreichen, macht das Overlay das mit.'
                : 'Zielwert und Fortschritt rechnet das Overlay selbst. Praktisch, wenn du kein Twitch-Ziel gesetzt hast oder ab einem Startwert zählen willst.'}
            </p>
          </div>

          {module.source === 'twitch' && TWITCH_GOAL_TYPES[meta.id]?.length > 1 && (
            <div>
              <Label htmlFor={`${meta.id}-ttype`}>Welches Twitch-Ziel</Label>
              <select id={`${meta.id}-ttype`} value={module.twitchType}
                onChange={(e) => set({ twitchType: e.target.value })}
                className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm focus:border-violet-400">
                {TWITCH_GOAL_TYPES[meta.id].map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                {module.twitchType === 'auto'
                  ? 'Nimmt das Ziel, das in deinem Creator-Dashboard wirklich aktiv ist — egal ob du dort nach Abo-Punkten oder nach Anzahl zählst.'
                  : 'Fest gewählt: Läuft im Creator-Dashboard ein Ziel anderen Typs, bleibt das Modul leer. „Automatisch“ nimmt einfach das aktive.'}
              </p>
            </div>
          )}

          {goalTools && (
            <div>
              <Label>Stand von Twitch</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <button onClick={goalTools.onRefresh} disabled={goalTools.busy || !goalTools.connected}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white disabled:text-gray-600 disabled:hover:border-white/10 transition-colors">
                  <RefreshCw size={13} className={goalTools.busy ? 'animate-spin' : ''} />
                  {goalTools.busy ? 'Lade…' : 'Jetzt aktualisieren'}
                </button>
                {goalTools.note && <span className="text-[11px] font-semibold text-green-400">{goalTools.note}</span>}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
                Zahlen und Ziele kommen sonst alle 30 Sekunden frisch. Änderst du hier etwas, wird ohnehin sofort neu geladen — der Knopf ist für Ziele, die du gerade erst im Creator-Dashboard angelegt hast.
              </p>
              {goalTools.detected?.length > 0 && (
                <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                  Twitch meldet gerade: <span className="text-gray-300 font-semibold">
                    {goalTools.detected.map((t) => GOAL_TYPE_LABEL(meta.id, t)).join(', ')}
                  </span>
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor={`${meta.id}-label`}>Beschriftung</Label>
            <Field id={`${meta.id}-label`} className="mt-1.5" maxLength={30} value={module.label}
              onChange={(e) => set({ label: e.target.value })} placeholder="Follower-Ziel" />
            {module.source === 'twitch' && (
              <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                Leer lassen, um die Beschreibung aus dem Creator-Dashboard zu übernehmen.
              </p>
            )}
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
                <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                  Startwert 0 zählt ab null. Trage deinen aktuellen Stand ein, wenn das Ziel erst ab jetzt gelten soll.
                </p>
              </div>
              <div>
                <Label htmlFor={`${meta.id}-inc`}>Automatisch erhöhen um</Label>
                <Field id={`${meta.id}-inc`} type="number" min={0} className="mt-1.5" value={module.autoIncrease}
                  onChange={(e) => set({ autoIncrease: Math.max(0, Number(e.target.value) || 0) })} />
                <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                  0 = aus. Sonst steigt der Zielwert nach jedem Erreichen um diesen Betrag weiter.
                </p>
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
        </div>
      )}

      {/* Aussehen und Platzierung: auf breiten Schirmen nebeneinander */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4">
        <div>
          <Label>Position</Label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <Field aria-label="Position X" type="number" value={Math.round(module.x)}
              onChange={(e) => set({ x: Number(e.target.value) || 0 })} />
            <Field aria-label="Position Y" type="number" value={Math.round(module.y)}
              onChange={(e) => set({ y: Number(e.target.value) || 0 })} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">X und Y in Bildpunkten</p>
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
            <Field value={module.accent} maxLength={7} className="font-mono !text-xs"
              onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set({ accent: e.target.value })} />
          </div>

          <div className="mt-4">
            <Label htmlFor={`${meta.id}-anim`}>Einblenden</Label>
            <select id={`${meta.id}-anim`} value={module.anim} onChange={(e) => set({ anim: e.target.value })}
              className="w-full mt-1.5 bg-[#1a1a20] border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm focus:border-violet-400">
              <option value="up">Slide hoch</option>
              <option value="fade">Fade</option>
              <option value="left">Slide von links</option>
              <option value="right">Slide von rechts</option>
            </select>
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
          <p className="text-[11px] text-gray-500 leading-relaxed mt-2">{meta.colorHint}</p>

          <div className="mt-4 space-y-1">
            {meta.kind === 'feed' && (
              <ToggleRow label="Timer anzeigen" checked={module.timer} onChange={(v) => set({ timer: v })} />
            )}
            {/* Beim Raid-Clip nicht anbieten: die Unschärfe hinter der Karte
                hindert Twitch daran, den Clip von allein zu starten. */}
            {meta.id !== 'raidClip' && (
              <ToggleRow label="Glassmorphism" description="Weiche Unschärfe hinter der Karte."
                checked={module.glass} onChange={(v) => set({ glass: v })} />
            )}
            {meta.id === 'prediction' && (
              <ToggleRow
                label="Bei Sperrung ausblenden"
                description="Blendet das Overlay aus, sobald die Einsätze geschlossen sind, und wieder ein, sobald der Gewinner feststeht."
                checked={!!module.hideWhileLocked}
                onChange={(v) => set({ hideWhileLocked: v })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Twitch-Verbindung ────────────────────────────────────────────────────── */

function ConnectCard({ connected, twitchLogin, onConnect, onDisconnect, busy }) {
  if (connected) {
    return (
      <div className="panel p-4 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white truncate">Twitch verbunden</p>
          <p className="text-[11px] text-gray-500 truncate">{twitchLogin ? `als ${twitchLogin}` : 'Kanal aktiv'}</p>
        </div>
        <button onClick={onDisconnect} title="Verbindung trennen"
          className="p-2 border border-white/10 rounded-lg text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-colors shrink-0">
          <LogOut size={14} />
        </button>
      </div>
    );
  }
  return (
    <div className="panel p-4 space-y-3">
      <div>
        <p className="text-[13px] font-bold text-white">Twitch verbinden</p>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
          Einmal verbinden, damit das Overlay deine laufenden Abstimmungen und Vorhersagen mitlesen kann.
          Es werden nur Leserechte angefragt.
        </p>
      </div>
      <button onClick={onConnect} disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white font-bold px-4 py-2.5 rounded-lg text-[13px] transition-colors">
        <TwitchGlyph size={14} />
        {busy ? 'Verbinde…' : 'Kanal verbinden'}
      </button>
    </div>
  );
}

/* ── OBS-Link ─────────────────────────────────────────────────────────────── */

function ObsLinkCard({ overlayKey, onRegenerate }) {
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

  return (
    <div className="panel p-4 space-y-3">
      <div>
        <p className="text-[13px] font-bold text-white">OBS-Browserquelle</p>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
          Breite 1920, Höhe 1080. Der Link enthält keine Zugangsdaten — trotzdem nicht im Stream zeigen.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className={`flex-1 bg-[#1a1a20] border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-[11px] font-mono truncate ${hidden ? 'blur-sm select-none' : ''}`}>
          {link || 'Lade…'}
        </div>
        <button onClick={copy} title="Kopieren" disabled={!link}
          className="p-2.5 border border-white/10 rounded-lg hover:border-white/30 text-gray-500 hover:text-white transition-colors shrink-0">
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
        <button onClick={() => setHidden((v) => !v)} title={hidden ? 'Anzeigen' : 'Verbergen'}
          className="p-2.5 border border-white/10 rounded-lg hover:border-white/30 text-gray-500 hover:text-white transition-colors shrink-0">
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Eine Quelle für alles — welche Module erscheinen, entscheiden die Häkchen oben.
        Zum Ausrichten <span className="text-violet-300 font-mono">?demo=1</span> anhängen.
      </p>
      <button onClick={onRegenerate} disabled={!overlayKey}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 border border-white/10 px-3 py-1.5 rounded-lg hover:text-red-400 hover:border-red-500/40 transition-colors">
        <RefreshCw size={12} />
        Link neu generieren
      </button>
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
  const [live, setLive] = useState({ poll: null, prediction: null, goals: null, raid: null, notice: null });
  const [missingGoalScopes, setMissingGoalScopes] = useState([]);
  const [hasTwitchGoalScope, setHasTwitchGoalScope] = useState(true);
  const [raidWatch, setRaidWatch] = useState(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalNote, setGoalNote] = useState('');
  const [raidBusy, setRaidBusy] = useState(false);
  const [raidNote, setRaidNote] = useState('');
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
        setRaidWatch(d.raidWatch || null);
        if (d.config) setConfig(mergeConfig(d.config));
        clockOffset.current = d.serverNow - Date.now();
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
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
          .then((r) => { if (r?.raidWatch) setRaidWatch(r.raidWatch); })
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
          setLive({ poll: d.poll, prediction: d.prediction, goals: d.goals, raid: d.raid, notice: d.notice });
          if (d.raidWatch) setRaidWatch(d.raidWatch);
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
        setRaidNote('Raid ausgelöst');
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

  // Eigener Takt für die Countdowns zwischen den Abrufen
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  /* ── Twitch verbinden ───────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    if (!accessToken) { login(false, STREAM_TOOL_SCOPES); return; }
    setBusy(true);
    try {
      const r = await api.connectTwitch(accessToken);
      setConnected(true);
      setTwitchLogin(r.twitchLogin || '');
      setMissingGoalScopes(r.missingGoalScopes || []);
        setHasTwitchGoalScope(r.hasTwitchGoalScope !== false);
    } catch (e) {
      if (e.status === 403 && e.missingScopes) {
        // Vorhandener Login reicht nicht — erneut mit den Leserechten anfragen
        login(false, STREAM_TOOL_SCOPES);
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
  useEffect(() => {
    if (!loaded || !accessToken || autoTried.current === accessToken) return;
    // Schon verbunden und nichts zu gewinnen? Dann sparen wir uns den Aufruf.
    if (connected && missingGoalScopes.length === 0 && hasTwitchGoalScope) return;

    autoTried.current = accessToken;
    api.connectTwitch(accessToken)
      .then((r) => {
        setConnected(true);
        setTwitchLogin(r.twitchLogin || '');
        setMissingGoalScopes(r.missingGoalScopes || []);
        setHasTwitchGoalScope(r.hasTwitchGoalScope !== false);
      })
      .catch(() => {});
  }, [loaded, connected, accessToken, missingGoalScopes.length, hasTwitchGoalScope]);

  const disconnect = async () => {
    try {
      await api.disconnectTwitch();
      setConnected(false);
      setLive({ poll: null, prediction: null, goals: null, raid: null, notice: null });
      autoTried.current = '';
    } catch (e) { flash(e.message); }
  };

  /* ── Bühne skalieren ────────────────────────────────────────────────────── */
  // Die Bühne richtet sich nach Breite UND Höhe: Auf einem 1080p-Schirm wird sie
  // kleiner, damit die Einstellungen darunter im Bild bleiben. Auf hohen
  // Schirmen bleibt sie so groß wie die Spalte breit ist — dort war nie etwas
  // abgeschnitten. Ohne Höhenbegrenzung (unter lg) zählt nur die Breite.
  const colRef = useRef(null);
  const hostRef = useRef(null);
  const toolbarRef = useRef(null);
  const hintRef = useRef(null);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  const scaleRef = useRef(0.4);

  useEffect(() => {
    const host = hostRef.current;
    const col = colRef.current;
    if (!host || !col) return undefined;

    const fit = () => {
      const availW = host.clientWidth || 0;
      const tall = window.matchMedia('(min-width: 1024px)').matches;
      const colH = col.clientHeight || 0;

      let availH = Infinity;
      if (tall && colH > 0) {
        const around =
          (toolbarRef.current?.offsetHeight || 0) +
          (hintRef.current?.offsetHeight || 0) +
          36; // drei Abstände der Spalte (gap-3)
        // Anteil der Höhe, aber nie so viel, dass von den Einstellungen nichts
        // mehr übrig bleibt — und nie kleiner als STAGE_MIN_H.
        const room = Math.max(0, colH - around - SETTINGS_MIN_H);
        availH = Math.max(STAGE_MIN_H, Math.min(colH * STAGE_HEIGHT_SHARE, room));
      }

      const s = Math.max(0.05, Math.min(availW / STAGE_W, availH / STAGE_H));
      scaleRef.current = s;
      setScale(s);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    ro.observe(col);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [loaded]);

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
  // enabled bleibt hier außen vor, damit sich die Karte auch im ausgeschalteten
  // Zustand ausrichten lässt — sichtbar macht sie erst WidgetFrame. Der Vorlauf
  // gilt fürs Overlay, nicht für die Vorschau: sonst verschwände die Karte beim
  // Ausrichten für ein paar Sekunden.
  const raidPreview = live.raid ? { ...live.raid, startsAt: 0 } : (demoOn ? sim.raid : null);
  const raidView = toRaidView(raidPreview, { ...m.raidClip, enabled: true }, now);

  const pollHeld = useLinger(pollView);
  const predHeld = useLinger(predView);

  // Was auf der Leinwand liegt — dieselbe Reihenfolge wie die Modul-Liste
  const rendered = {
    poll: pollHeld && <PollWidget data={pollHeld} module={m.poll} />,
    prediction: predHeld && <PredictionWidget data={predHeld} module={m.prediction} />,
    followerGoal: followerView && <GoalWidget data={followerView} module={m.followerGoal} />,
    subGoal: subView && <GoalWidget data={subView} module={m.subGoal} />,
    raidClip: raidView && <RaidClipWidget data={raidView} module={m.raidClip} preview />,
  };
  const hasData = {
    poll: !!pollView,
    prediction: !!predView,
    followerGoal: !!followerView,
    subGoal: !!subView,
    raidClip: !!raidView,
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

    if (id === 'raidClip') {
      if (!mod.enabled || !raidWatch) return null;
      if (!raidWatch.botConfigured) {
        return 'Auf diesem Server ist kein Chat-Bot hinterlegt — ohne ihn lassen sich Raids nicht erkennen.';
      }
      return null;
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
      title="Twitch Overlay Tools — Abstimmungen, Ziele & Raid-Clips für OBS"
      description="Kostenlose OBS-Overlays für Twitch: laufende Umfragen, Kanalpunkte-Vorhersagen, Follower- und Abo-Ziele live einblenden — und beim Raid automatisch einen Clip des Raiders abspielen. Position, Farben und Deckkraft frei einstellbar."
      keywords="Twitch Umfrage Overlay, Twitch Poll OBS, Twitch Vorhersage Overlay, Twitch Prediction Overlay, Twitch Raid Clip Overlay, Follower Ziel Overlay, Stream Overlay Tools"
      path="/twitch-tools"
    />
  );

  /* ── Login-Schranke ─────────────────────────────────────────────────────── */
  if (!user) {
    return (
      <div className="page-fade max-w-6xl mx-auto">
        {seo}
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black text-white">Twitch-Overlay-Tools</h1>
          <p className="text-gray-500 text-sm mt-1">Abstimmungen und Vorhersagen live im Stream einblenden.</p>
        </header>
        <div className="panel p-10 text-center max-w-md mx-auto mt-12">
          <p className="text-white font-bold mb-1">Login erforderlich</p>
          <p className="text-gray-500 text-sm mb-5">Melde dich mit Twitch an, um deine Overlays einzurichten.</p>
          <button onClick={() => login(false, STREAM_TOOL_SCOPES)}
            className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            <TwitchGlyph size={15} />
            Mit Twitch einloggen
          </button>
        </div>
      </div>
    );
  }

  return (
    // Auf großen Schirmen ein Editor, der in die Bildhöhe passt: Leinwand oben,
    // Einstellungen unten mit eigenem Bildlauf. Sonst müsste man auf 1080p unter
    // die Bildkante scrollen, um überhaupt an die Einstellungen zu kommen.
    // 8.5rem = Kopfzeile der Seite (68px) + Innenabstand des Inhaltsbereichs.
    <div className="page-fade max-w-[1600px] mx-auto flex flex-col lg:h-[calc(100dvh-8.5rem)] lg:min-h-[540px]">
      {seo}

      <header className="mb-4 flex items-end justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Twitch-Overlay-Tools</h1>
          <p className="text-gray-500 text-sm mt-1">
            Abstimmungen und Vorhersagen startest du wie gewohnt in Twitch — hier legst du fest, wie sie im Stream aussehen.
          </p>
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${connected ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-gray-500'}`}>
          {connected ? 'Live' : 'Nicht verbunden'}
        </span>
      </header>

      {error && (
        <div className="mb-4 shrink-0 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <TriangleAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
      {live.notice && (
        <div className="mb-4 shrink-0 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">{live.notice}</p>
        </div>
      )}
      {connected && (missingGoalScopes.length > 0 || !hasTwitchGoalScope) && (
        <div className="mb-4 shrink-0 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">
            Für die Ziel-Module fehlen noch Leserechte für Follower und Abos.{' '}
            <button onClick={() => login(false, STREAM_TOOL_SCOPES)} className="underline font-semibold hover:text-white">
              Rechte jetzt erteilen
            </button>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start lg:items-stretch lg:flex-1 lg:min-h-0">

        {/* ══════════ Module ══════════ */}
        <div className="space-y-4 min-w-0 lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:pr-1">
          <ConnectCard
            connected={connected}
            twitchLogin={twitchLogin}
            onConnect={connect}
            onDisconnect={disconnect}
            busy={busy}
          />

          {/* Reine Auswahl-Liste. Die Einstellungen des gewählten Moduls stehen
              unter der Leinwand — dort ist Platz für mehrere Spalten, und man
              muss nicht zwischen Formular und Vorschau hin und her scrollen. */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">Module</p>

            {MODULES.map((meta) => {
              const module = config.modules[meta.id];
              const isActive = selected === meta.id;
              const Icon = meta.icon;
              const hint = moduleWarning(meta.id);
              return (
                <div key={meta.id}
                  className={`panel relative overflow-hidden flex items-center transition-colors ${
                    isActive
                      ? 'border-violet-400/50 bg-violet-500/[0.10]'
                      : 'hover:bg-white/[0.05] hover:border-white/25'
                  }`}>
                  {/* Akzentbalken links — macht das gewählte Modul auf einen Blick klar */}
                  <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors ${
                    isActive ? 'bg-violet-400' : 'bg-transparent'
                  }`} />

                  <button
                    type="button"
                    onClick={() => setSelected(meta.id)}
                    aria-pressed={isActive}
                    title={`Einstellungen für ${meta.label} anzeigen`}
                    className="group flex items-center gap-3 flex-1 min-w-0 text-left p-3 pl-3.5"
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-violet-500/25 text-violet-200'
                        : module.enabled
                          ? 'bg-violet-500/15 text-violet-300 group-hover:bg-violet-500/25'
                          : 'bg-white/5 text-gray-600 group-hover:bg-white/10'
                    }`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13.5px] font-bold truncate transition-colors ${
                        isActive ? 'text-white' : 'text-gray-200 group-hover:text-white'
                      }`}>
                        {meta.label}
                      </span>
                      <span className={`block text-[11px] truncate ${hint ? 'text-amber-400/80' : 'text-gray-500'}`}>
                        {hint ? 'Aktion nötig' : (module.enabled ? `${Math.round(module.x)} × ${Math.round(module.y)}` : 'Ausgeblendet')}
                      </span>
                    </span>
                    {/* Pfeil zeigt auf die Einstellungen — dasselbe Muster wie in den Abstimmungs-Karten */}
                    <ArrowRight
                      size={16}
                      className={`ml-auto shrink-0 transition-all ${
                        isActive
                          ? 'text-violet-300'
                          : 'text-white/15 group-hover:text-violet-300 group-hover:translate-x-0.5'
                      }`}
                    />
                  </button>

                  <label className="relative shrink-0 cursor-pointer pr-3 py-3" title={module.enabled ? 'Ausblenden' : 'Einblenden'}>
                    <input type="checkbox" checked={module.enabled} className="peer sr-only"
                      onChange={(e) => patchModule(meta.id, { enabled: e.target.checked })} />
                    <span className="block w-9 h-5 rounded-full bg-white/10 peer-checked:bg-violet-500/40 transition-colors" />
                    <span className="absolute top-[15px] left-[3px] w-3.5 h-3.5 rounded-full bg-gray-400 peer-checked:bg-violet-400 peer-checked:translate-x-4 transition-transform" />
                  </label>
                </div>
              );
            })}
          </div>

          <ObsLinkCard overlayKey={overlayKey} onRegenerate={async () => {
            try { setOverlayKey((await api.regenerateOverlayKey()).overlayKey); } catch (e) { flash(e.message); }
          }} />
        </div>

        {/* ══════════ Leinwand ══════════ */}
        <div ref={colRef} className="min-w-0 flex flex-col gap-3 lg:min-h-0">
          <div ref={toolbarRef} className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Leinwand</span>
            <span className="text-[11px] text-gray-600 font-mono">1920 × 1080 · {Math.round(scale * 100)} %</span>

            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-gray-400 cursor-pointer select-none">
                <input type="checkbox" checked={demoOn} onChange={(e) => setDemoOn(e.target.checked)}
                  className="accent-violet-500" />
                Demo-Daten
              </label>

              {demoOn && (
                <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
                  {[2, 4].map((n) => (
                    <button key={n} onClick={() => setDemoOutcomes(n)}
                      className={`px-2 py-1.5 text-[11px] font-bold transition-colors ${
                        demoOutcomes === n ? 'bg-violet-500/15 text-violet-300' : 'text-gray-500 hover:text-white'
                      }`}>
                      {n} Optionen
                    </button>
                  ))}
                </div>
              )}

              <button onClick={() => setGridOn((v) => !v)} title="Raster"
                className={`p-2 rounded-lg border transition-colors ${gridOn ? 'border-violet-400/40 text-violet-300 bg-violet-500/10' : 'border-white/10 text-gray-500 hover:text-white'}`}>
                <Grid3x3 size={13} />
              </button>
              <button onClick={() => setSnapOn((v) => !v)} title="Magnet (an Mitte und Rändern einrasten)"
                className={`p-2 rounded-lg border transition-colors ${snapOn ? 'border-violet-400/40 text-violet-300 bg-violet-500/10' : 'border-white/10 text-gray-500 hover:text-white'}`}>
                <Crosshair size={13} />
              </button>
            </div>
          </div>

          {/* Bühne: 16:9, so groß wie Breite UND Höhe es zulassen */}
          <div ref={hostRef} className="shrink-0">
            <div ref={wrapRef} className="relative mx-auto rounded-xl overflow-hidden border border-white/10 stw-checker"
              style={{ width: Math.round(STAGE_W * scale), height: Math.round(STAGE_H * scale) }}>
              {/* zoom statt transform: scale — nur so startet der Raid-Clip in
                  der Vorschau von allein (siehe WidgetFrame) */}
              <div className="stw-stage" style={{ zoom: scale }}>
                {gridOn && <div className="stw-thirds" />}
                {guides.v && <div className="stw-guide v" style={{ left: STAGE_W / 2 }} />}
                {guides.h && <div className="stw-guide h" style={{ top: STAGE_H / 2 }} />}

                {MODULES.map((meta) => (
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
              </div>
            </div>
          </div>

          <p ref={hintRef} className="text-[11px] text-gray-500 leading-relaxed shrink-0">
            Widgets mit der Maus verschieben. Das Karomuster zeigt, was im Stream transparent bleibt.
            {connected
              ? ' Läuft gerade etwas in deinem Kanal, ersetzt es automatisch die Demo-Daten.'
              : ' Verbinde deinen Kanal, damit hier deine echten Abstimmungen erscheinen.'}
          </p>

          {/* Einstellungen des gewählten Moduls — direkt unter der Vorschau,
              mit eigenem Bildlauf, damit die Seite selbst nicht wandert */}
          {activeMeta && (
            <div className="panel lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <span className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0">
                  <activeMeta.icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-white leading-tight">{activeMeta.label}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">Einstellungen</p>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => centerWidget(activeMeta.id)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white transition-colors">
                    <Crosshair size={13} />
                    Zentrieren
                  </button>
                  <button onClick={() => patchModule(activeMeta.id, { ...MODULE_DEFAULTS[activeMeta.id] })}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white transition-colors">
                    <RefreshCw size={13} />
                    Zurücksetzen
                  </button>
                </div>
              </div>

              <ModuleSettings
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
                raidTools={activeMeta.kind === 'raid' ? {
                  onTest: testRaid,
                  onStop: stopRaid,
                  busy: raidBusy,
                  note: raidNote,
                  watch: raidWatch,
                } : null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
