// StreamBrb.jsx — OBS-Browserquelle /overlay/brb (1920×1080): „Be Right Back“ als 3D-Mini-Planet.
//
// Die Figur des Streamers läuft eine endlose Straße auf einem kleinen Planeten entlang. Wer im
// Chat schreibt, bekommt ein Grundstück an der Straße, kommt aus seinem Haus und winkt
// (planetScene.js). Unten steht eine kleine Tafel mit der Rückkehrzeit.
//
// Einstellungen kommen live vom Steuerpult (/stream-szenen, Gruppe „BRB-Planet“): Modus
// (BRB / Störung), Thema, „zurück in …“, eigene Zeile, Testmodus.
//
// Parameter:  ?channel=name   Kanal für den Chat (Standard: vnmvalentin)
//             ?demo=1         simulierte Chatter (geht auch per Testmodus im Steuerpult)
//             ?mode=difficulties  Störung erzwingen (zum Testen)
//             ?theme=day|halloween|winter  Thema erzwingen (zum Testen)
//             ?race=1         Planetenlauf gleich nach dem Laden öffnen (zum Testen)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hasWebGL, fontsReady } from './sceneKit';
import { useTwitchChat } from './twitchChat';
import { createControlLink } from './sceneLink';
import { reloadOverlay } from './selfHeal';
import './streamScenes.css';

const DEMO_NAMES = ['Pixelpaul', 'Lurker_Lisa', 'ChatGott', 'Kaffeekanne', 'Gurke42', 'nora_plays', 'BerndDasBrot', 'xXSniperXx', 'Waldmeister', 'Kekskrümel', 'MooMoo', 'TanzBär', 'luna_fps', 'Zockerzwerg', 'NachtEule'];
const DEMO_TEXTS = ['bin da!', 'Wo gehst du hin?', 'Schönes Haus hab ich', 'brb ok', 'Hallo Nachbar!', 'Ich warte hier', 'Kappa', 'Wie lange noch?', 'Hol mir auch was', 'Toller Garten'];
const DEMO_COLORS = ['#ff4500', '#1e90ff', '#9acd32', '#ff69b4', '#daa520', '#00c4a7', '#b388ff', '#ff7f50'];

function demoMessage(i, raceOpen = false) {
  const n = Math.floor(Math.random() * Math.min(40, 4 + i / 2));
  const name = DEMO_NAMES[n % DEMO_NAMES.length] + (n >= DEMO_NAMES.length ? String(Math.floor(n / DEMO_NAMES.length) + 1) : '');
  return {
    id: `demo-${i}`,
    userId: `demo-${name}`,
    name,
    color: DEMO_COLORS[n % DEMO_COLORS.length],
    role: null,
    // Läuft die Anmeldung zum Planetenlauf, machen die meisten mit
    parts: [{ text: raceOpen && Math.random() < 0.7 ? '!rennen' : DEMO_TEXTS[Math.floor(Math.random() * DEMO_TEXTS.length)] }],
    action: false,
    at: Date.now(),
  };
}

function formatLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Tafel unten: Status, Rückkehrzeit, eigene Zeile, Hinweis für den Chat. */
function BrbCard({ mode, backAt, text }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = backAt ? backAt - now : 0;
  const status = mode === 'difficulties' ? 'Technische Störung' : 'Gleich zurück';
  return (
    <div className={`ss-brb ${mode === 'difficulties' ? 'ss-brb--warn' : ''}`}>
      <div className="ss-brb-main">
        <span className="ss-brb-status">{status}</span>
        {backAt && <span className="ss-brb-time">{left > 0 ? `zurück in ${formatLeft(left)}` : 'jeden Moment'}</span>}
      </div>
      {text && <div className="ss-brb-text">{text}</div>}
      <div className="ss-brb-hint">Schreib im Chat und bekomm ein Haus an der Straße</div>
    </div>
  );
}

export default function StreamBrb() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [settings, setSettings] = useState(null);
  const [linkError, setLinkError] = useState('');
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [channel, setChannel] = useState((params.get('channel') || 'vnmvalentin').toLowerCase());
  const channelRef = useRef(channel);
  const settingsRef = useRef(null);
  const demo = params.get('demo') === '1' || !!settings?.demo;

  /** URL-Parameter (Tests) haben Vorrang vor dem Steuerpult. */
  const withOverrides = (st) => {
    const brb = { ...(st?.brb || {}) };
    if (params.get('mode')) brb.mode = params.get('mode');
    if (params.get('theme')) brb.theme = params.get('theme');
    return { ...(st || {}), brb };
  };

  useEffect(() => {
    const link = createControlLink(params.get('key') || '', {
      onSettings: (st, ch) => {
        const s = withOverrides(st);
        settingsRef.current = s;
        setSettings(s);
        setLinkError('');
        if (ch) setChannel((old) => (params.get('channel') ? old : ch.toLowerCase()));
        sceneRef.current?.applySettings(s);
      },
      onCommand: (type) => sceneRef.current?.command(type),
      onLooks: (list) => { for (const c of list) sceneRef.current?.refreshLook(c); },
      onError: setLinkError,
    });
    return () => link.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    channelRef.current = channel;
    sceneRef.current?.setChannel(channel);
  }, [channel]);

  useTwitchChat(channel, {
    max: 10,
    onEvent: (e) => {
      const s = sceneRef.current;
      if (!s) return;
      if (e.type === 'message') s.onMessage(e.msg);
      else if (e.type === 'clear') s.clearUser(e.userId);
    },
  });

  useEffect(() => {
    document.body.style.background = '#000';
    if (!hasWebGL()) { setFailed(true); return undefined; }
    let disposed = false;
    const watchdog = setTimeout(() => { if (!disposed) reloadOverlay('BRB-Planet nach 90 s nicht fertig'); }, 90000);
    const fatal = (reason) => { if (!disposed && !reloadOverlay(reason)) setFailed(true); };
    (async () => {
      await fontsReady();
      let createPlanetScene;
      try {
        ({ createPlanetScene } = await import('./planetScene'));
      } catch (err) {
        console.error('BRB-Szene nicht geladen', err);
        fatal('Code der BRB-Szene nicht geladen');
        return;
      }
      if (disposed || !canvasRef.current) return;
      try {
        sceneRef.current = createPlanetScene(canvasRef.current, overlayRef.current, { onFatal: fatal, store: params.get('store') !== '0' });
        sceneRef.current.setChannel(channelRef.current);
        sceneRef.current.applySettings(settingsRef.current || withOverrides(null));
      } catch (err) {
        console.error('BRB-Szene konnte nicht starten', err);
        fatal('BRB-Szene konnte nicht starten');
        return;
      }
      await sceneRef.current.ready;
      if (disposed) return;
      clearTimeout(watchdog);
      requestAnimationFrame(() => setVisible(true));
      setSceneReady(true);
      if (params.get('race') === '1') setTimeout(() => sceneRef.current?.command('brbRace'), 2500);
    })();
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      setSceneReady(false);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Testmodus: simulierte Chatter
  useEffect(() => {
    if (!demo || !sceneReady) return undefined;
    let i = 0;
    let timer = 0;
    const tick = () => {
      const open = !!sceneRef.current?.raceOpen;
      sceneRef.current?.onMessage(demoMessage(i++, open));
      timer = setTimeout(tick, open ? 500 + Math.random() * 600 : i < 6 ? 900 + Math.random() * 700 : 1800 + Math.random() * 2400);
    };
    timer = setTimeout(tick, 1500);
    return () => { clearTimeout(timer); sceneRef.current?.clearDemo(); };
  }, [demo, sceneReady]);

  if (failed) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white/60 text-2xl">
        3D wird hier nicht unterstützt — in OBS die Hardwarebeschleunigung für Browserquellen aktivieren.
      </div>
    );
  }

  const brb = settings?.brb || {};
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.6s ease' }} />
      <div ref={overlayRef} className="sp-labels" />
      {visible && brb.showCard !== false && <BrbCard mode={brb.mode === 'difficulties' ? 'difficulties' : 'brb'} backAt={brb.backAt && brb.backAt > Date.now() - 30 * 60e3 ? brb.backAt : null} text={brb.text || ''} />}
      {linkError && <div className="ss-link-error">{linkError}</div>}
    </div>
  );
}
