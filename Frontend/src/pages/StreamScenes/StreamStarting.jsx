// StreamStarting.jsx — OBS-Browserquelle /overlay/stream-starting (1920×1080).
//
// 3D-Party-Saal: LED-Wand mit "STREAM STARTING", Moving Heads, Nebel, Feuer. Wer im Chat
// schreibt, kommt auf die Tanzfläche und tanzt mit, die Nachricht steht über der Figur.
// Chat wird anonym mitgelesen (kein Login), Twitch- und 7TV-Emotes werden erkannt.
//
// Einstellungen kommen immer live vom Steuerpult (/stream-szenen, nur für den Kanalbetreiber):
// Kanal, Countdown, Tänzer, Effekte, Musik, Testmodus. Die Parameter unten gehen trotzdem (zum Testen).
//
// Parameter:  ?channel=name   Kanal für den Chat (Standard: vnmvalentin)
//             ?min=10         Countdown in Minuten ab dem Laden der Quelle
//             ?start=20:00    Countdown bis zu einer Uhrzeit (hat Vorrang vor min)
//             ?title=…        Zeile unter dem Countdown (z. B. was heute läuft)
//             ?chat=left|right  zusätzlich eine klassische Chatleiste (Standard: aus)
//             ?demo=1         simulierte Chatter zum Ausprobieren (die Tanzfläche füllt sich nach und nach);
//                             geht auch per Schalter „Testmodus“ im Steuerpult
//             ?hype=1         Ausraster-Stimmung sofort (zum Testen von Konfetti, Strobo, Feuer)
//             ?figuren=roboter  die Metall-Roboter mit Profilbild-Kopf statt der Comic-Figuren
//             ?music=9500     ohne Steuerpult: Takt + Song von der YTMusicApp auf diesem Port
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hasWebGL, fontsReady } from './sceneKit';
import { useTwitchChat } from './twitchChat';
import { createControlLink, createMusicFeed } from './sceneLink';
import { reloadOverlay } from './selfHeal';
import './streamScenes.css';

const CHAT_TTL_MS = 120000;
const CHAT_VISIBLE = 7;

/** Zielzeitpunkt aus ?start=HH:MM (heute, sonst morgen) oder ?min=N. */
function countdownTarget(params) {
  const start = /^(\d{1,2}):(\d{2})$/.exec(params.get('start') || '');
  if (start) {
    const d = new Date();
    d.setHours(Number(start[1]), Number(start[2]), 0, 0);
    // Uhrzeit liegt mehr als 6 h zurück → gemeint ist morgen
    if (d.getTime() < Date.now() - 6 * 3600e3) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const min = Number(params.get('min'));
  if (Number.isFinite(min) && min > 0 && min <= 600) return Date.now() + min * 60e3;
  return null;
}

function formatLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const DEMO_NAMES = ['Pixelpaul', 'Lurker_Lisa', 'ChatGott', 'Kaffeekanne', 'Gurke42', 'nora_plays', 'BerndDasBrot', 'xXSniperXx', 'Waldmeister', 'Kekskrümel', 'MooMoo', 'TanzBär', 'luna_fps', 'Zockerzwerg', 'NachtEule'];
const DEMO_TEXTS = ['Hallo zusammen!', 'Bin da!', 'LETS GOOO', 'Wann gehts los?', 'Guten Abend', 'Hype!', 'Erster!', 'Was spielen wir heute?', 'Die Musik ist gut', 'Kappa', 'GG schon vor dem Start', 'Tanzen!!!'];
const DEMO_COLORS = ['#ff4500', '#1e90ff', '#9acd32', '#ff69b4', '#daa520', '#00c4a7', '#b388ff', '#ff7f50'];
const DEMO_ROLES = [null, null, null, 'sub', 'sub', 'vip', 'mod'];

/** Demo: der Kreis der Schreibenden wächst langsam über die Namensliste hinaus (Name2, Name3 …). */
function demoMessage(i) {
  const n = Math.floor(Math.random() * Math.min(60, 3 + i / 2));
  const name = DEMO_NAMES[n % DEMO_NAMES.length] + (n >= DEMO_NAMES.length ? String(Math.floor(n / DEMO_NAMES.length) + 1) : '');
  return {
    id: `demo-${i}`,
    userId: `demo-${name}`,
    name,
    color: DEMO_COLORS[n % DEMO_COLORS.length],
    role: n === 0 ? 'broadcaster' : DEMO_ROLES[n % DEMO_ROLES.length],
    parts: [{ text: DEMO_TEXTS[Math.floor(Math.random() * DEMO_TEXTS.length)] }],
    action: false,
    at: Date.now(),
  };
}

/** Laufender Song (YTMusicApp) unten links. */
function SongCard({ song }) {
  if (!song?.title) return null;
  return (
    <div className="ss-song" key={song.title}>
      {song.thumb ? <img className="ss-song-cover" src={song.thumb} alt="" /> : <div className="ss-song-cover" />}
      <div className="ss-song-text">
        <div className="ss-song-label">Läuft gerade</div>
        <div className="ss-song-title">{song.title}</div>
        {song.artist && <div className="ss-song-artist">{song.artist}</div>}
      </div>
    </div>
  );
}

function ChatOverlay({ messages, side }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const visible = messages.filter((m) => now - m.at < CHAT_TTL_MS).slice(-CHAT_VISIBLE);
  return (
    <div className={`ss-chat ss-chat--${side}`}>
      {visible.map((m) => (
        <div key={m.id} className="ss-chat-msg" style={{ '--name': m.color }}>
          <span className="ss-chat-name">{m.name}</span>
          <span className={m.action ? 'ss-chat-text ss-chat-text--action' : 'ss-chat-text'}>
            {m.parts.map((p, i) => (p.emote
              ? <img key={i} className="ss-chat-emote" src={p.emote} alt={p.alt} />
              : <React.Fragment key={i}>{p.text}</React.Fragment>))}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StreamStarting() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const controlKey = params.get('key') || '';     // alte Links mit Key funktionieren weiter
  const [channel, setChannel] = useState((params.get('channel') || 'vnmvalentin').toLowerCase());
  const [sceneReady, setSceneReady] = useState(false);
  const [settings, setSettings] = useState(null);
  const [song, setSong] = useState(null);
  const [linkError, setLinkError] = useState('');
  const settingsRef = useRef(null);
  const channelRef = useRef(channel);
  const chatSide = ['left', 'right'].includes(params.get('chat')) ? params.get('chat') : null;
  const demo = params.get('demo') === '1' || !!settings?.demo;
  const forceHype = params.get('hype') === '1';
  const figures = params.get('figuren') === 'roboter' ? 'robots' : 'people';
  const info = useRef({ target: countdownTarget(params), title: (params.get('title') || '').slice(0, 120) });

  // Steuerpult: Einstellungen + Befehle live
  useEffect(() => {
    const link = createControlLink(controlKey, {
      onSettings: (st, ch) => {
        settingsRef.current = st;
        setSettings(st);
        setLinkError('');
        if (ch) setChannel((old) => (params.get('channel') ? old : ch.toLowerCase()));
        info.current = {
          target: st.countdownTo && st.countdownTo > Date.now() ? st.countdownTo : countdownTarget(params),
          title: st.title || (params.get('title') || '').slice(0, 120),
        };
        sceneRef.current?.applySettings(st);
      },
      onCommand: (type) => sceneRef.current?.command(type),
      onLooks: (list) => { for (const c of list) sceneRef.current?.refreshLook?.(c); },
      onError: setLinkError,
    });
    return () => link.stop();
  }, [controlKey, params]);

  // Musik von der YTMusicApp (Port aus dem Steuerpult oder ?music=)
  const musicPort = settings ? (settings.music.enabled ? settings.music.port : 0) : Number(params.get('music')) || 0;
  const showSong = settings ? settings.music.showSong : !!musicPort;
  useEffect(() => {
    if (!musicPort) { setSong(null); return undefined; }
    const feed = createMusicFeed(musicPort, {
      onAudio: (m) => sceneRef.current?.music(m),
      onSong: (sg) => {
        sceneRef.current?.setSong(sg);
        setSong((old) => (old?.title === sg.title && old?.artist === sg.artist && old?.thumb === sg.thumb ? old : sg));
      },
      onStatus: (ok) => { if (!ok) { setSong(null); sceneRef.current?.setSong(null); } },
    });
    return () => feed.stop();
  }, [musicPort]);

  // Kanal = Streamer hinter dem DJ-Pult
  useEffect(() => {
    channelRef.current = channel;
    sceneRef.current?.setChannel(channel);
  }, [channel]);

  const messages = useTwitchChat(channel, {
    max: 30,
    onEvent: (e) => {
      const s = sceneRef.current;
      if (!s) return;
      if (e.type === 'message') s.onMessage(e.msg);
      else if (e.type === 'delete') s.removeMessage(e.id);
      else if (e.type === 'clear') s.clearUser(e.userId);
    },
  });

  useEffect(() => {
    document.body.style.background = '#000';
    if (!hasWebGL()) { setFailed(true); return undefined; }
    let disposed = false;
    // Hängt der Start (Code-Teil lädt nicht, Szene wird nie fertig), neu laden statt schwarz zu bleiben
    const watchdog = setTimeout(() => { if (!disposed) reloadOverlay('Party nach 90 s nicht fertig'); }, 90000);
    const fatal = (reason) => { if (!disposed && !reloadOverlay(reason)) setFailed(true); };
    const getInfo = () => {
      const { target, title } = info.current;
      const left = target ? target - Date.now() : 0;
      return { countdown: left > 0 ? formatLeft(left) : null, title };
    };
    (async () => {
      await fontsReady();
      let createPartyScene;
      try {
        ({ createPartyScene } = await import('./partyScene'));
      } catch (err) {
        console.error('Starting-Szene nicht geladen', err);
        fatal('Code der Party-Szene nicht geladen');
        return;
      }
      if (disposed || !canvasRef.current) return;
      try {
        sceneRef.current = createPartyScene(canvasRef.current, overlayRef.current, { getInfo, forceHype, figures, onFatal: fatal });
        sceneRef.current.setChannel(channelRef.current);
        if (settingsRef.current) sceneRef.current.applySettings(settingsRef.current);
      } catch (err) {
        console.error('Starting-Szene konnte nicht starten', err);
        fatal('Party-Szene konnte nicht starten');
        return;
      }
      // Erst einblenden, wenn Texturen und Figuren geladen sind
      await sceneRef.current.ready;
      if (disposed) return;
      clearTimeout(watchdog);
      requestAnimationFrame(() => setVisible(true));
      setSceneReady(true);
    })();
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      setSceneReady(false);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [forceHype, figures]);

  // Testmodus: simulierte Chatter (per ?demo=1 oder Schalter im Steuerpult, live ein- und ausschaltbar)
  useEffect(() => {
    if (!demo || !sceneReady) return undefined;
    let i = 0;
    let timer = 0;
    const tick = () => {
      sceneRef.current?.onMessage(demoMessage(i++));
      timer = setTimeout(tick, i < 8 ? 500 + Math.random() * 600 : 900 + Math.random() * 1100);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      clearTimeout(timer);
      // ausgeschaltet: die Testtänzer verlassen die Fläche
      sceneRef.current?.clearDemo();
    };
  }, [demo, sceneReady]);

  if (failed) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white/60 text-2xl">
        3D wird hier nicht unterstützt — in OBS die Hardwarebeschleunigung für Browserquellen aktivieren.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.6s ease' }}
      />
      {/* Namensschilder + Sprechblasen der Tänzer (Position setzt die Szene) */}
      <div ref={overlayRef} className="sp-labels" />
      {chatSide && <ChatOverlay messages={messages} side={chatSide} />}
      {showSong && <SongCard song={song} />}
      {linkError && <div className="ss-link-error">{linkError}</div>}
    </div>
  );
}
