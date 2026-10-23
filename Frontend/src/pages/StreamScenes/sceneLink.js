// sceneLink.js — Verbindungen der 3D-Stream-Szenen nach außen.
//
//   • createControlLink — Steuerpult (/stream-szenen): fragt /api/stream-scenes/live (Kanalbetreiber; alter Link: /live/:key)
//     alle 1,5 s ab, meldet geänderte Einstellungen und neue einmalige Befehle (Drop …).
//   • createMusicFeed   — YTMusicApp auf dem Streamer-PC (ws://localhost:<port>/ws/scene):
//     Bass/Mitten/Höhen, erkannte Kicks, Tempo und der laufende Song. Verbindet sich von selbst neu.
//   • createBeatClock   — Takt der Szene: läuft mit fester BPM oder rastet auf die Kicks der Musik ein.
//   • requestLook       — selbst gebaute Figuren der Zuschauer (Figurbaukasten), gebündelt geladen.

// ── Steuerpult ──────────────────────────────────────────────────────────────
export function createControlLink(key, { onSettings, onCommand, onError } = {}) {
  let stopped = false;
  let timer = 0;
  let settingsSeq = -1;
  let commandSeq = null;           // erster Abruf: nur merken, alten Befehl nicht ausführen
  const poll = async () => {
    try {
      const url = key ? `/api/stream-scenes/live/${encodeURIComponent(key)}` : '/api/stream-scenes/live';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 404) { onError?.('Unbekannter Steuer-Link — im Steuerpult neu kopieren.'); }
      else if (res.ok) {
        const live = await res.json();
        if (live.settingsSeq !== settingsSeq) { settingsSeq = live.settingsSeq; onSettings?.(live.settings, live.channel); }
        if (commandSeq === null) commandSeq = live.commandSeq;
        else if (live.commandSeq > commandSeq) {
          commandSeq = live.commandSeq;
          // Befehle, die beim Abruf schon älter als 20 s sind (Quelle war aus), verfallen
          if (live.command && Date.now() - live.command.at < 20000) onCommand?.(live.command.type);
        }
      }
    } catch { /* offline — beim nächsten Abruf wieder */ }
    if (!stopped) timer = setTimeout(poll, 1500);
  };
  poll();
  return { stop() { stopped = true; clearTimeout(timer); } };
}

// ── Musik (YTMusicApp) ──────────────────────────────────────────────────────
export function createMusicFeed(port, { onAudio, onSong, onStatus } = {}) {
  let ws = null;
  let stopped = false;
  let retry = 0;
  let connected = false;
  const setStatus = (c) => { if (c !== connected) { connected = c; onStatus?.(c); } };
  const connect = () => {
    if (stopped) return;
    try { ws = new WebSocket(`ws://localhost:${port}/ws/scene`); } catch { schedule(); return; }
    ws.onopen = () => setStatus(true);
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'audio') onAudio?.(m);
      else if (m.type === 'song') onSong?.(m);
    };
    ws.onclose = () => { setStatus(false); schedule(); };
    ws.onerror = () => { try { ws.close(); } catch { /* schon zu */ } };
  };
  const schedule = () => { if (!stopped) { clearTimeout(retry); retry = setTimeout(connect, 5000); } };
  connect();
  return {
    get connected() { return connected; },
    stop() { stopped = true; clearTimeout(retry); try { ws?.close(); } catch { /* egal */ } },
  };
}

// ── Takt ────────────────────────────────────────────────────────────────────
/**
 * Fortlaufender Takt (1 = ein Schlag). Ohne Musik mit fester BPM; mit Musik übernimmt er deren
 * Tempo (sobald die Erkennung sicher genug ist) und zieht die Phase sanft auf die erkannten Kicks.
 */
export function createBeatClock(startBpm = 124) {
  let beat = 0;
  let manualBpm = startBpm;
  let musicBpm = 0;
  let lastMusicAt = -1e9;
  let pendingKick = false;
  const clock = {
    get beat() { return beat; },
    get bpm() { return musicBpm > 0 && performance.now() - lastMusicAt < 4000 ? musicBpm : manualBpm; },
    get locked() { return musicBpm > 0 && performance.now() - lastMusicAt < 4000; },
    setManualBpm(b) { if (Number.isFinite(b) && b >= 40 && b <= 240) manualBpm = b; },
    /** Musik-Rahmen aus createMusicFeed. */
    music(m) {
      const hasPhase = typeof m.phase === 'number' && m.level > 0.02;
      if (m.level > 0.02 && m.bpm > 60 && m.conf > 0.15) {
        // Mit Taktraster ist das Tempo schon genau (ausgeglichen über ~8 s) → direkt; sonst weich
        musicBpm = hasPhase || !(musicBpm > 0 && Math.abs(m.bpm - musicBpm) < 4) ? m.bpm : musicBpm + (m.bpm - musicBpm) * 0.2;
        lastMusicAt = performance.now();
      }
      if (hasPhase) {
        // Die App kennt die Lage im Schlag (0 = Kick): sanft dorthin ziehen, auch bei großem Versatz
        // (gemessen: danach liegt der Takt der Szene 8–16 ms neben der echten Kick)
        const frac = beat - Math.floor(beat);
        let err = m.phase - frac;
        err -= Math.round(err);
        beat += err * 0.25;
        pendingKick = false;
      } else if (m.beat) pendingKick = true;
    },
    step(dt) {
      beat += dt * clock.bpm / 60;
      if (pendingKick) {
        pendingKick = false;
        if (clock.locked) {
          // auf den nächsten ganzen Schlag ziehen (nur kleine Abweichungen — Offbeats ignorieren)
          const err = Math.round(beat) - beat;
          if (Math.abs(err) < 0.3) beat += err * 0.35;
        }
      }
      return beat;
    },
  };
  return clock;
}

// ── Figuren der Zuschauer ───────────────────────────────────────────────────
const LOOK_TTL = 60_000;
const lookCache = new Map();     // userId → { look, at }
const waiting = new Map();       // userId → [callbacks]
let lookTimer = 0;

// Schlüssel: "id:<Twitch-ID>" oder "login:<name>" (Abspann-Namen kommen ohne ID)
async function flushLooks() {
  lookTimer = 0;
  const valid = (k) => /^id:\d{1,20}$/.test(k) || /^login:[a-z0-9_]{2,25}$/.test(k);
  const keys = [...waiting.keys()].filter(valid).slice(0, 100);
  const cbs = new Map(keys.map((k) => [k, waiting.get(k)]));
  for (const k of [...waiting.keys()]) if (!cbs.has(k) && !valid(k)) { for (const cb of waiting.get(k)) cb(null); waiting.delete(k); }
  for (const k of keys) waiting.delete(k);
  let data = { looks: {}, logins: {} };
  if (keys.length) {
    const ids = keys.filter((k) => k.startsWith('id:')).map((k) => k.slice(3));
    const logins = keys.filter((k) => k.startsWith('login:')).map((k) => k.slice(6));
    try {
      const res = await fetch(`/api/stream-scenes/looks?ids=${ids.join(',')}&logins=${logins.join(',')}`);
      if (res.ok) data = await res.json();
    } catch { /* ohne Netz: Standardfiguren */ }
  }
  for (const [k, list] of cbs) {
    const hit = k.startsWith('id:') ? data.looks?.[k.slice(3)] : data.logins?.[k.slice(6)];
    const look = hit?.look || null;
    lookCache.set(k, { look, at: Date.now() });
    for (const cb of list) cb(look);
  }
  if (waiting.size && !lookTimer) lookTimer = setTimeout(flushLooks, 250);
}

const lookKey = (userId, login) => (/^\d{1,20}$/.test(String(userId || '')) ? `id:${userId}` : `login:${String(login || '').toLowerCase()}`);

/**
 * Look eines Zuschauers (null = keiner gebaut). Antwortet sofort aus dem Speicher, sonst gebündelt.
 * Ohne Twitch-ID (Abspann) wird per Login gesucht.
 */
export function requestLook(userId, cb, login = '') {
  const id = lookKey(userId, login);
  const hit = lookCache.get(id);
  if (hit && Date.now() - hit.at < LOOK_TTL) { cb(hit.look); return; }
  if (!waiting.has(id)) waiting.set(id, []);
  waiting.get(id).push(cb);
  if (!lookTimer) lookTimer = setTimeout(flushLooks, 250);
}

/** Bekannter Look ohne Laden (für den ersten Bau einer Figur). */
export function cachedLook(userId, login = '') {
  return lookCache.get(lookKey(userId, login))?.look || null;
}
