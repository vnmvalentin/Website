// StreamEnding.jsx — OBS-Browserquelle /overlay/stream-ending (1920×1080).
//
// 3D-Kino: Kamera geht in den Saal, setzt sich, dann laufen die Stream-Credits auf der
// Leinwand. Die Daten kommen wie bei /overlay/credits aus Streamer.bot (WebSocket-Server
// auf 127.0.0.1:8080, Custom-Event mit event === "StreamCredits").
// Im Saal sitzen die Chatter: alle Namen aus den Credits und wer im Chat schreibt.
//
// Parameter:  ?channel=name  Kanal für den Chat (Standard: vnmvalentin)
//             ?demo=1  Beispiel-Credits ohne Streamer.bot
//             ?skip=1  ohne Kamerafahrt, direkt am Platz (z. B. bei erneutem Auslösen)
//             ?democlip=<Clip-ID>  zusätzlich ein Clip in den Beispiel-Credits
//             ?figuren=roboter  Metall-Roboter mit Profilbild-Kopf statt der Comic-Figuren
import React, { useEffect, useRef, useState } from 'react';
import { hasWebGL, fontsReady } from './sceneKit';
import { useTwitchChat } from './twitchChat';
import { BOTS } from './cinemaAudience';
import { reloadOverlay } from './selfHeal';
import './streamScenes.css';

const CLIP_PARENTS = ['localhost', 'vnmvalentin.de', 'www.vnmvalentin.de'];

const DEMO_CREDITS = {
  event: 'StreamCredits',
  mods: ['Nightbot', 'ModMaxi'],
  chatters: ['ChatGott (412 Nachrichten)', 'Lurker_Lisa (233)', 'Pixelpaul (180)', 'Kaffeekanne (121)', 'xXSniperXx (96)', 'Gurke42 (77)', 'nora_plays (60)', 'BerndDasBrot (41)'],
  follows: ['neuer_zuschauer', 'Waldmeister', 'Kekskrümel'],
  subs: ['Pixelpaul (Tier 1)', 'ChatGott (5 Gift Subs)'],
  bits: ['Kaffeekanne (500 Bits)'],
  rewards: ['Lurker_Lisa: 3x Songrequest, Alert', 'Gurke42: Hydrate'],
  raids: ['befreundeter_streamer (24 Zuschauer)'],
  shame: ['xXSniperXx (3x Timeout)'],
  clips: [],
};

/** Credits-Daten aus dem Streamer.bot-WebSocket (gleiches Protokoll wie StreamCredits.jsx). */
function useStreamerbotCredits(onCredits) {
  const cb = useRef(onCredits);
  cb.current = onCredits;
  useEffect(() => {
    let ws = null;
    let closed = false;
    let timer = 0;
    const connect = () => {
      ws = new WebSocket('ws://127.0.0.1:8080/');
      ws.onopen = () => {
        ws.send(JSON.stringify({ request: 'Subscribe', id: 'credits-3d-sub', events: { General: ['Custom'] } }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event?.source !== 'General' || msg.event?.type !== 'Custom') return;
          let payload = msg.data;
          if (payload?.data && typeof payload.data === 'string') payload = JSON.parse(payload.data);
          if (payload?.event === 'StreamCredits') cb.current(payload);
        } catch { /* fremde Events ignorieren */ }
      };
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, []);
}

export default function StreamEnding() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const queued = useRef(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [clip, setClip] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === '1';
  const skip = params.get('skip') === '1';
  const demoClip = params.get('democlip') || '';
  const figures = params.get('figuren') === 'roboter' ? 'robots' : 'people';
  const channel = (params.get('channel') || 'vnmvalentin').toLowerCase();

  // Wer im Chat schreibt, nimmt im Saal Platz
  useTwitchChat(channel, {
    max: 1,
    onEvent: (e) => {
      if (e.type === 'message') sceneRef.current?.addChatter({ name: e.msg.name, color: e.msg.color, userId: e.msg.userId });
    },
  });

  useEffect(() => {
    document.body.style.background = '#000';
    if (!hasWebGL()) { setFailed(true); return undefined; }
    let disposed = false;
    // Hängt der Start (Code-Teil lädt nicht, Szene wird nie fertig), neu laden statt schwarz zu bleiben
    const watchdog = setTimeout(() => { if (!disposed) reloadOverlay('Kino nach 90 s nicht fertig'); }, 90000);
    const fatal = (reason) => { if (!disposed && !reloadOverlay(reason)) setFailed(true); };
    (async () => {
      await fontsReady();
      let createCinemaScene;
      try {
        ({ createCinemaScene } = await import('./cinemaScene'));
      } catch (err) {
        console.error('Kino-Szene nicht geladen', err);
        fatal('Code der Kino-Szene nicht geladen');
        return;
      }
      if (disposed || !canvasRef.current) return;
      try {
        sceneRef.current = createCinemaScene(canvasRef.current, {
          overlay: overlayRef.current,
          skipNames: [channel, ...BOTS],
          skipIntro: skip,
          onClip: (c, rect) => setClip(c ? { clip: c, rect } : null),
          figures,
          onFatal: fatal,
        });
      } catch (err) {
        console.error('Kino-Szene konnte nicht starten', err);
        fatal('Kino-Szene konnte nicht starten');
        return;
      }
      if (queued.current) sceneRef.current.setCredits(queued.current);
      else if (demo) {
        sceneRef.current.setCredits(demoClip
          ? { ...DEMO_CREDITS, clips: [{ id: demoClip, user: 'Pixelpaul', title: 'Beispiel-Clip' }] }
          : DEMO_CREDITS);
      }
      // Erst einblenden, wenn Texturen/Figuren geladen sind — sonst sieht man Platzhalter mitten in der Fahrt
      await sceneRef.current.ready;
      if (disposed) return;
      clearTimeout(watchdog);
      requestAnimationFrame(() => setVisible(true));
    })();
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [demo, skip, demoClip, channel, figures]);

  useStreamerbotCredits((payload) => {
    if (sceneRef.current) sceneRef.current.setCredits(payload);
    else queued.current = payload;
  });

  if (failed) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white/60 text-2xl">
        3D wird hier nicht unterstützt — in OBS die Hardwarebeschleunigung für Browserquellen aktivieren.
      </div>
    );
  }

  const host = window.location.hostname;
  const parents = CLIP_PARENTS.includes(host) ? CLIP_PARENTS : [...CLIP_PARENTS, host];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.4s ease' }}
      />
      {/* Namensschilder des Publikums (nur auf dem Weg zum Platz; Position setzt die Szene) */}
      <div ref={overlayRef} className="sp-labels" />
      {/* Clip-Player genau über der Leinwand. Kein opacity/transform am Elternelement —
          sonst startet der Twitch-Player nicht von selbst. */}
      {clip && (
        <iframe
          key={clip.clip.id}
          title="Clip"
          src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip.clip.id)}&${parents.map((p) => `parent=${p}`).join('&')}&autoplay=true&muted=false`}
          allow="autoplay; fullscreen"
          allowFullScreen
          frameBorder="0"
          style={{
            position: 'absolute',
            left: Math.round(clip.rect.left),
            top: Math.round(clip.rect.top),
            width: Math.round(clip.rect.width),
            height: Math.round(clip.rect.height),
            border: 0,
            background: '#000',
          }}
        />
      )}
    </div>
  );
}
