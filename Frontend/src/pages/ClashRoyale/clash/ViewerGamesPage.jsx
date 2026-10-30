// ViewerGamesPage.jsx — /clash/viewer-games: Einstellungen des Chat-Quiz-Overlays (Viewer Games) + OBS-Link und
// Live-Vorschau. Braucht Twitch-Login: der Bot liest den Chat des angemeldeten Kanals, solange das Overlay offen ist.
// Speichert jede Änderung sofort (kurz verzögert), die Vorschau zeigt denselben Zustand wie die OBS-Quelle.
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import GameFrame from './GameFrame';
import { ViewerGamesView } from './ViewerGamesOverlay';
import ChunkyButton from '../ui/ChunkyButton';
import Toggle from '../ui/Toggle';
import Slider from '../ui/Slider';
import SettingRow, { SegmentedControl } from '../ui/SettingRow';
import { CrReplay, CrTv } from '../ui/CrIcons';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { TwitchGlyph } from '../../../components/BrandGlyphs';
import { useClashLang } from './clashI18n';
import tvImg from '../../../assets/clashRoyale/ui/tv.webp';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';

const API = '/api/cr-viewer-games';

export default function ViewerGamesPage() {
  const { lang, t } = useClashLang();
  const { user, login } = useContext(TwitchAuthContext);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef(0);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { setData(j); setSettings(j.settings); })
      .catch(() => setError(t.vgLoadError));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/settings`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        const j = await res.json();
        if (j.settings) setSettings(j.settings);
        setSaved(true);
      } catch { setError(t.vgSaveError); }
    }, 400);
  };
  const post = (path) => fetch(`${API}/${path}`, { method: 'POST', credentials: 'include' }).then((r) => r.json()).catch(() => null);
  const toggleMode = (m) => {
    const has = settings.modes.includes(m);
    const modes = has ? settings.modes.filter((x) => x !== m) : [...settings.modes, m];
    if (modes.length) update({ modes });
  };

  const url = data ? `${window.location.origin}/clash/viewer-games/overlay/${data.overlayKey}` : '';
  const seo = { title: lang === 'en' ? 'Clash Royale Viewer Games for Twitch' : 'Clash Royale Viewer Games für Twitch', description: t.vgSeo, path: '/clash/viewer-games' };

  if (!user) {
    return (
      <GameFrame title={t.vgTitle} icon={tvImg} seo={seo}>
        <div className="cr-arcade-panel p-6 max-w-xl mx-auto flex flex-col gap-4 text-center">
          <p className="text-white/80 leading-relaxed">{t.vgIntro}</p>
          <ChunkyButton variant="blue" size="lg" icon={TwitchGlyph} onClick={login}>{t.vgLogin}</ChunkyButton>
        </div>
      </GameFrame>
    );
  }
  if (!settings) {
    return <GameFrame title={t.vgTitle} icon={tvImg} seo={seo}><p className="text-center text-white/70">{error || t.connecting}</p></GameFrame>;
  }

  const modeCard = (m, img, label, text) => {
    const on = settings.modes.includes(m);
    return (
      <button type="button" onClick={() => toggleMode(m)} aria-pressed={on} className={`vg-mode${on ? ' is-on' : ''}`}>
        <img src={img} alt="" draggable={false} />
        <span className="min-w-0 text-left">
          <b>{label}</b>
          <span>{text}</span>
        </span>
        <Toggle checked={on} onChange={() => toggleMode(m)} aria-label={label} />
      </button>
    );
  };

  return (
    <GameFrame wide title={t.vgTitle} icon={tvImg} seo={seo}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          {/* OBS-Link */}
          <section className="cr-arcade-panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 font-cr text-lg"><CrTv size={24} /> {t.vgObs}</div>
            <div className="flex gap-2">
              <input readOnly value={url} className="crq-input !pl-3 !h-11 !text-sm flex-1" onFocus={(e) => e.target.select()} aria-label={t.vgObs} />
              <ChunkyButton variant="green" size="sm" icon={copied ? Check : Copy} onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? t.copied : t.copy}
              </ChunkyButton>
            </div>
            <p className="text-xs text-white/55 leading-relaxed">{t.vgObsHelp}</p>
            <p className={`text-xs ${data.chat?.connected ? 'text-[#6adf82]' : 'text-[#ff8384]'}`}>
              {data.chat?.connected ? t.vgChatOk(data.login) : t.vgChatOff}
            </p>
          </section>

          {/* Modi */}
          <section className="cr-arcade-panel p-4 flex flex-col gap-3">
            <span className="font-cr text-lg">{t.vgModes}</span>
            {modeCard('pixel', eyeImg, t.pixelTitle, t.vgPixelText)}
            {modeCard('zoom', searchImg, t.zoomTitle, t.vgZoomText)}
            {settings.modes.length > 1 && <p className="text-xs text-white/55">{t.vgBothModes}</p>}
          </section>

          {/* Ablauf */}
          <section className="cr-arcade-panel p-4 flex flex-col gap-4">
            <span className="font-cr text-lg">{t.vgFlow}</span>
            <SettingRow label={t.vgAdvance} note={settings.advance === 'time' ? t.vgAdvanceTime : t.vgAdvanceGuesses}>
              <SegmentedControl value={settings.advance} onChange={(v) => update({ advance: v })}
                options={[{ id: 'time', label: t.vgByTime }, { id: 'guesses', label: t.vgByGuesses }]} />
            </SettingRow>
            {settings.advance === 'time' ? (
              <SettingRow label={t.vgStageSeconds}>
                <Slider value={settings.stageSeconds} min={3} max={30} onChange={(v) => update({ stageSeconds: v })} format={(v) => `${v} s`} aria-label={t.vgStageSeconds} />
              </SettingRow>
            ) : (
              <SettingRow label={t.vgGuessesPerStage}>
                <Slider value={settings.guessesPerStage} min={1} max={20} onChange={(v) => update({ guessesPerStage: v })} aria-label={t.vgGuessesPerStage} />
              </SettingRow>
            )}
            <SettingRow label={t.vgFinalSeconds} note={t.vgFinalNote}>
              <Slider value={settings.finalSeconds} min={5} max={60} onChange={(v) => update({ finalSeconds: v })} format={(v) => `${v} s`} aria-label={t.vgFinalSeconds} />
            </SettingRow>
            <SettingRow label={t.vgPause}>
              <Slider value={settings.pauseSeconds} min={3} max={30} onChange={(v) => update({ pauseSeconds: v })} format={(v) => `${v} s`} aria-label={t.vgPause} />
            </SettingRow>
          </section>

          {/* Anzeige + Chat */}
          <section className="cr-arcade-panel p-4 flex flex-col gap-4">
            <span className="font-cr text-lg">{t.vgDisplay}</span>
            <SettingRow inline label={t.vgAnnounce} note={t.vgAnnounceNote}>
              <Toggle checked={settings.announce} onChange={(v) => update({ announce: v })} aria-label={t.vgAnnounce} />
            </SettingRow>
            <SettingRow inline label={t.vgLeaderboard}>
              <Toggle checked={settings.showLeaderboard} onChange={(v) => update({ showLeaderboard: v })} aria-label={t.vgLeaderboard} />
            </SettingRow>
            <SettingRow label={t.vgLanguage}>
              <SegmentedControl value={settings.language} onChange={(v) => update({ language: v })}
                options={[{ id: 'de', label: 'Deutsch' }, { id: 'en', label: 'English' }]} />
            </SettingRow>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <ChunkyButton variant="gold" size="sm" icon={CrReplay} onClick={() => post('next')}>{t.vgNext}</ChunkyButton>
            <ChunkyButton variant="red" size="sm" onClick={() => { if (window.confirm(t.vgResetConfirm)) post('reset-scores'); }}>{t.vgReset}</ChunkyButton>
            <ChunkyButton variant="blue" size="sm" icon={RefreshCw} onClick={async () => {
              if (!window.confirm(t.vgNewKeyConfirm)) return;
              const j = await post('new-key');
              if (j?.overlayKey) setData((d) => ({ ...d, overlayKey: j.overlayKey }));
            }}>{t.vgNewKey}</ChunkyButton>
            <span className="text-xs text-white/50">{saved ? t.vgSaved : ''}{error ? ` ${error}` : ''}</span>
          </div>
        </div>

        {/* Live-Vorschau: derselbe Zustand wie die OBS-Quelle */}
        <aside className="lg:sticky lg:top-3 flex flex-col gap-2">
          <span className="font-cr text-lg">{t.vgPreview}</span>
          <div className="vg-preview">
            <ViewerGamesView key={data.overlayKey} overlayKey={data.overlayKey} />
          </div>
          <p className="text-xs text-white/50">{t.vgPreviewNote}</p>
        </aside>
      </div>
    </GameFrame>
  );
}
