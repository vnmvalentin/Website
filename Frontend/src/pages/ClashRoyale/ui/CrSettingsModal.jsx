// Persönliche Einstellungen (Hintergrund, Lautstärke) — erreichbar über das Zahnrad in Hub,
// Lobby und Spiel. Gilt nur für den eigenen Browser, siehe crPrefs.js.
import React from 'react';
import Modal from './Modal';
import Slider from './Slider';
import { CrSettings, CrMegaphone, CrCheck, CrStar, CrEye } from './CrIcons';
import Toggle from './Toggle';
import { useLanguage } from '../useLanguage';
import { BACKGROUNDS, DEFAULT_BACKGROUND, useCrPrefs } from './crPrefs';
import { playSound, setSoundVolume } from './sound';

const L = {
  de: {
    title: 'Einstellungen', background: 'Hintergrund', defaultBg: 'Standard (Karo)',
    backgroundNote: 'Gilt nur für dich — Mitspieler sehen ihren eigenen Hintergrund.',
    sound: 'Lautstärke', mute: 'Stumm', test: 'Testen',
    animations: 'Animationen', animationsNote: 'Übergänge, aufploppende Karten und die Einblendung beim Spielstart.',
    scene3d: '3D-Ansicht', scene3dNote: 'Elixier Auktion, Pyramidendraft, Angel Royale und Blindes Karussell in 3D. Aus = klassische 2D-Ansicht. Lässt sich auch im Spiel umschalten.',
  },
  en: {
    title: 'Settings', background: 'Background', defaultBg: 'Default (diamonds)',
    backgroundNote: 'Only for you — other players keep their own background.',
    sound: 'Volume', mute: 'Muted', test: 'Test',
    animations: 'Animations', animationsNote: 'Transitions, popping cards and the game-start splash.',
    scene3d: '3D view', scene3dNote: 'Elixir Auction, Pyramid Draft, Angel Royale and Shadow Carousel in 3D. Off = classic 2D view. Can also be switched in-game.',
  },
  es: {
    title: 'Ajustes', background: 'Fondo', defaultBg: 'Estándar (rombos)',
    backgroundNote: 'Solo para ti — los demás jugadores ven su propio fondo.',
    sound: 'Volumen', mute: 'Silencio', test: 'Probar',
    animations: 'Animaciones', animationsNote: 'Transiciones, cartas que aparecen y la pantalla de inicio de partida.',
    scene3d: 'Vista 3D', scene3dNote: 'Elixir Auction, Draft de Pirámide, Pesca Royale y Carrusel de Sombras en 3D. Desactivado = vista 2D clásica. También se puede cambiar en la partida.',
  },
};

function BgTile({ active, onClick, label, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={label}
      className={`cr-card-hover group relative aspect-video rounded-xl overflow-hidden border-[3px] ${
        active ? 'border-[var(--cr-arcade-gold)]' : 'border-[var(--cr-panel-edge)] hover:border-white/50'
      }`}>
      {children}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1 text-left font-cr text-[13px] text-white truncate">
        {label}
      </span>
      {active && <CrCheck size={20} className="absolute top-1.5 right-1.5 drop-shadow" />}
    </button>
  );
}

export default function CrSettingsModal({ onClose }) {
  const { lang } = useLanguage();
  const t = L[lang] || L.de;
  const { prefs, setPref } = useCrPrefs();
  const percent = Math.round(prefs.volume * 100);

  return (
    <Modal onClose={onClose} title={t.title} icon={<CrSettings size={24} />} size="md">
      <div>
        <div className="cr-section">
          <p className="cr-section-title mb-1">{t.background}</p>
          <p className="text-white/50 text-xs mb-3">{t.backgroundNote}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <BgTile active={prefs.background === DEFAULT_BACKGROUND} label={t.defaultBg}
              onClick={() => setPref('background', DEFAULT_BACKGROUND)}>
              <span className="absolute inset-0 cr-arcade-bg" />
            </BgTile>
            {BACKGROUNDS.map(bg => (
              <BgTile key={bg.id} active={prefs.background === bg.id} label={bg.name}
                onClick={() => setPref('background', bg.id)}>
                <img src={bg.thumb} alt="" loading="lazy" decoding="async"
                  className="absolute inset-0 w-full h-full object-cover" />
              </BgTile>
            ))}
          </div>
        </div>

        <div className="cr-section">
          <p className="cr-section-title mb-3"><CrMegaphone size={24} />{t.sound}</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Slider
                value={percent}
                min={0} max={100} step={5}
                format={(v) => (v === 0 ? t.mute : `${v}%`)}
                accent="#ffc93c"
                aria-label={t.sound}
                onChange={(v) => {
                  setPref('volume', v / 100);
                  // Sofort hörbar machen, wie laut das jetzt ist
                  setSoundVolume(v / 100);
                  playSound('pick');
                }}
              />
            </div>
            <button type="button" onClick={() => playSound('win')}
              className="cr-arcade-icon-btn h-9 px-3 font-cr text-sm text-white shrink-0">
              {t.test}
            </button>
          </div>
        </div>

        <div className="cr-section">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="cr-section-title"><CrStar size={24} />{t.animations}</p>
              <p className="text-white/50 text-xs mt-1 pl-[34px]">{t.animationsNote}</p>
            </div>
            <Toggle checked={prefs.animations} onChange={(v) => setPref('animations', v)}
              accent="bg-green-500" aria-label={t.animations} />
          </div>
        </div>

        <div className="cr-section">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="cr-section-title"><CrEye size={24} />{t.scene3d}</p>
              <p className="text-white/50 text-xs mt-1 pl-[34px]">{t.scene3dNote}</p>
            </div>
            <Toggle checked={prefs.scene3d} onChange={(v) => setPref('scene3d', v)}
              accent="bg-green-500" aria-label={t.scene3d} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
