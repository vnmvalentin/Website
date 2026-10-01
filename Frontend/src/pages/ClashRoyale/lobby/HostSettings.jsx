// Presets und die Modusregler — eingebettet in GameSettingsCard.jsx (linke Spalte der
// Lobby, dauerhaft sichtbar; früher ein eigenes Modal, HostPanel.jsx, mittlerweile entfernt).
//
// Die Modusregler rendert diese Datei nicht von Hand, sondern aus dem Schema in
// hostSettingsSchema.js. Damit gibt es pro Einstellung genau EINE Definition statt
// eines eigenen JSX-Blocks — vorher rund 620 Zeilen mit vierzehn Kopien derselben
// Struktur, in denen sich Abstände und Farben auseinandergelebt hatten.
//
// Der Start-Knopf liegt bewusst NICHT hier, sondern im Band über beiden Spalten
// (ModeStartBand.jsx): er soll erreichbar bleiben, egal wie weit man in den
// Einstellungen gescrollt hat.

import React from 'react';
import { CrStar, CrShield } from '../ui/CrIcons';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import SettingRow, { SegmentedControl } from '../ui/SettingRow';
import { PRESET_META } from '../modesConfig';
import { HOST_SETTINGS, ACCENT } from './hostSettingsSchema';

/** Schema-Felder dürfen Wert oder Funktion sein — hier einheitlich auflösen. */
const resolve = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);

export default function HostSettings({
  lobbyData, actions, t, lang,
  isClashAdmin, effectiveIsHost,
  poolSize, activeCount,
  carouselMaxPlayers, carouselTooMany,
}) {
  const mode = lobbyData?.mode || 'snake';
  const excludedCount = (lobbyData?.excludedCards || []).length;
  const modePresets = lobbyData?.modePresets || [];

  // Welches Preset entspricht dem aktuellen Zustand? Verglichen wird gegen die Werte,
  // die der Server für diese Lobby berechnet hat (cardsPerRound hängt z.B. an der
  // Spielerzahl) — deshalb kommen sie aus lobbyData und nicht aus einer Client-Tabelle.
  const activePresetId = modePresets.find(p =>
    Object.entries(p.values).every(([key, value]) => lobbyData?.[key] === value)
  )?.id || null;

  // Kontext, den jedes Schema-Feld bekommt
  const baseCtx = {
    t, lang, mode, lobbyData,
    poolSize, activeCount, excludedCount,
    carouselMaxPlayers, carouselTooMany,
  };

  const visibleSettings = HOST_SETTINGS.filter(s => s.modes.includes(mode));

  return (
    // Kein eigener Rahmen: jede Einstellung ist ein Abschnitt (.cr-section) der gemeinsamen
    // Fläche des Fensters (GameSettingsModal.jsx), getrennt durch eine eingeprägte Fuge.
    <div>
      {isClashAdmin && !effectiveIsHost && (
        <p className="cr-section text-violet-300 text-xs flex items-center gap-1.5">
          <CrShield size={16} /> {t.adminAccessNote}
        </p>
      )}

      {/* ── Voreinstellungen — ein Klick setzt alle Regler dieses Modus ────────
          Alle Presets auf EINER eingelassenen Spur (.cr-seg) statt als lose Einzelpillen;
          nur das aktive hebt sich heraus. */}
      {modePresets.length > 0 && (
        <div className="cr-section">
          <p className="font-cr text-white text-base leading-tight flex items-center gap-2.5 mb-3">
            <CrStar size={24} className="shrink-0" />
            {t.presets}
          </p>
          <div className="cr-seg" role="group">
            {modePresets.map(p => {
              const meta = PRESET_META[p.id];
              if (!meta) return null;
              const PresetIcon = meta.icon;
              const active = activePresetId === p.id;
              const copy = meta[lang] || meta.de;
              return (
                <button key={p.id} type="button" onClick={() => actions.applyPreset(p.id)} title={copy.desc}
                  aria-pressed={active} className="!min-h-[44px]">
                  <PresetIcon size={20} />
                  {copy.label}
                </button>
              );
            })}
          </div>
          <p className="text-white/50 text-xs mt-2">
            {activePresetId
              ? (PRESET_META[activePresetId][lang] || PRESET_META[activePresetId].de).desc
              : `${t.presetCustom} — ${t.presetsNote}`}
          </p>
        </div>
      )}

      {/* ── Modusspezifische Einstellungen aus dem Schema ────────────────────── */}
      {visibleSettings.map(setting => {
        const value = lobbyData?.[setting.key];
        const ctx = { ...baseCtx, value };
        const accent = ACCENT[resolve(setting.accent, ctx)] || ACCENT.neutral;
        const Icon = resolve(setting.icon, ctx);

        const row = (control) => (
          <SettingRow
            key={setting.key}
            icon={Icon}
            iconClass={accent.icon}
            label={resolve(setting.label, ctx)}
            note={resolve(setting.note, ctx)}
            warning={resolve(setting.warning, ctx)}
            inline={setting.control === 'toggle'}>
            {control}
          </SettingRow>
        );

        if (setting.control === 'toggle') {
          return row(
            <Toggle
              checked={!!value}
              onChange={(next) => setting.apply(actions, next)}
              accent={accent.toggle}
              aria-label={resolve(setting.label, ctx)}
            />
          );
        }

        if (setting.control === 'segmented') {
          return row(
            <SegmentedControl
              options={resolve(setting.options, ctx)}
              value={value}
              onChange={(next) => setting.apply(actions, next)}
              accent={accent.seg}
            />
          );
        }

        // Slider — min/max dürfen vom Kartenpool und der Spielerzahl abhängen
        const min = resolve(setting.min, ctx);
        const max = resolve(setting.max, ctx);
        return row(
          <Slider
            value={Math.min(Math.max(value ?? min, min), max)}
            onChange={(next) => setting.apply(actions, next)}
            min={min}
            max={max}
            step={setting.step ?? 1}
            format={setting.format}
            accent={accent.css}
            // Schrumpft der Pool so weit, dass nur noch ein Wert übrig bleibt, wäre
            // ein Regler ohne Spielraum irreführend — dann lieber deaktiviert zeigen.
            disabled={max <= min}
            aria-label={resolve(setting.label, ctx)}
          />
        );
      })}
    </div>
  );
}
