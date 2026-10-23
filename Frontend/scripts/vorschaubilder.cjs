// scripts/vorschaubilder.cjs — fotografiert die Vorschaubilder für Startseite, Türen und Zwischenseiten
// (public/media/previews/<id>.webp, Liste der Bilder je Eintrag: src/config/navigation.js → previews).
//
// Aufruf (Dev-Server muss laufen, Backend oder Attrappe auf 3001 für adVentures):
//   node scripts/vorschaubilder.cjs [id …]        ohne id: alle
//
// Overlays und Twitch-Widgets kommen aus der Galerie /tools/vorlagen (dort laufen die echten Komponenten mit
// Beispieldaten), Spiele aus ihren Menüs oder einer gestarteten Partie gegen den Computer.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const BASE = process.env.VORSCHAU_BASE || 'http://localhost:5173';
const OUT = path.join(__dirname, '..', 'public', 'media', 'previews');
const W = 1200;
const H = 750;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (p, t, sel = 'button, a') => p.evaluate((t, sel) => {
  const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().toLowerCase().includes(t.toLowerCase()) && !x.disabled);
  if (el) el.click();
  return !!el;
}, t, sel);

/** Ein Element bildschirmfüllend fotografieren (zentriert auf dunklem Grund, damit alle Bilder gleich groß sind) */
async function shootElement(p, selector, file, { pad = 40 } = {}) {
  const el = typeof selector === 'string' ? await p.$(selector) : selector;
  if (!el) throw new Error(`nicht gefunden: ${selector}`);
  await el.scrollIntoView();
  await wait(300);
  await el.screenshot({ path: file, type: 'webp', quality: 80, captureBeyondViewport: false });
  void pad;
}

/** Vorschaufläche einer Galerie-Kachel fotografieren */
async function galleryShot(p, file, reiter, index, waitMs = 2500) {
  await p.goto(`${BASE}/tools/vorlagen?reiter=${reiter}`, { waitUntil: 'networkidle2' });
  await wait(waitMs);
  const tiles = await p.$$('[data-gallery-preview]');
  await shootElement(p, tiles[index], file);
}

const SHOTS = {
  // ── Spiele ──
  adventures: async (p, file) => {
    await p.goto(`${BASE}/adventures`, { waitUntil: 'networkidle2' });
    await wait(1200);
    await clickText(p, 'Neuer Lauf');
    await wait(800);
    await clickText(p, 'Lauf starten');
    await wait(4000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  garden: async (p, file) => {
    await p.goto(`${BASE}/garden`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // Eine Partie braucht zwei Spieler und den Server — das Brett wird deshalb in den Farben des Spiels gezeichnet
  connect4: async (p, file) => {
    const board = [
      '.......', '.......', '...Y...', '..RY...', '..YRR..', '.RRYYR.',
    ];
    const cells = board.map((row) => [...row].map((c) => `<i class="${c === 'R' ? 'r' : c === 'Y' ? 'y' : ''}"></i>`).join('')).join('');
    await p.setContent(`<!doctype html><html><body style="margin:0;background:#0b0b10;display:grid;place-items:center;height:100vh;font-family:sans-serif">
      <style>.b{display:grid;grid-template-columns:repeat(7,72px);gap:14px;padding:22px;background:#1d2a6b;border-radius:18px;box-shadow:0 18px 0 #111a48}
      i{width:72px;height:72px;border-radius:50%;background:#0b0b10;display:block;box-shadow:inset 0 6px 0 rgba(0,0,0,.45)}
      i.r{background:#ef4444;box-shadow:inset 0 -6px 0 rgba(0,0,0,.25)} i.y{background:#facc15;box-shadow:inset 0 -6px 0 rgba(0,0,0,.2)}</style>
      <div class="b">${cells}</div></body></html>`);
    await wait(200);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  blobby: async (p, file) => {
    await p.goto(`${BASE}/blobby`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  'seed-runners': async (p, file) => {
    await p.goto(`${BASE}/seed-runners`, { waitUntil: 'networkidle2' });
    await wait(3000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  'sacrifice-and-sigils': async (p, file) => {
    await p.goto(`${BASE}/sacrifice-and-sigils/uebung`, { waitUntil: 'networkidle2' });
    await wait(1200);
    await clickText(p, 'OK');
    await clickText(p, 'Spiel beginnen');
    await wait(5000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  'flick-soccer': async (p, file) => {
    await p.goto(`${BASE}/flick-soccer`, { waitUntil: 'networkidle2' });
    await wait(1000);
    await clickText(p, 'Anpfiff');
    await wait(4000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // ── Clash Royale ──
  'cr-minigames': async (p, file) => {
    await p.goto(`${BASE}/clash-royale`, { waitUntil: 'domcontentloaded' });
    await wait(4000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  nuzlocke: async (p, file) => {
    await p.goto(`${BASE}/nuzlocke`, { waitUntil: 'domcontentloaded' });
    await wait(3500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // ── Overlays (echte Komponenten mit Beispieldaten in der Galerie /tools/vorlagen) ──
  'win-tracker': (p, file) => galleryShot(p, file, 'win-tracker', 0),
  'win-challenge': (p, file) => galleryShot(p, file, 'win-challenge', 0),
  'twitch-poll': (p, file) => galleryShot(p, file, 'twitch', 0, 6000), // Demo-Umfrage soll Stimmen haben
  'twitch-prediction': (p, file) => galleryShot(p, file, 'twitch', 1, 6000),
  'twitch-goal': (p, file) => galleryShot(p, file, 'twitch', 2),
  'twitch-stats': (p, file) => galleryShot(p, file, 'twitch', 3),
  bingo: async (p, file) => {
    await p.goto(`${BASE}/Bingo`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // ── Community ──
  abstimmungen: async (p, file) => {
    // Die Detailseite zeigt Fragen und Antworten — die Liste allein ist nur eine Zeile. Abstimmen nur angemeldet:
    // Anmeldung im Browser vortäuschen (der Prüfstand beantwortet /api/auth/me).
    await p.evaluateOnNewDocument(() => {
      if (location.hostname !== 'localhost') return;
      localStorage.setItem('twitchUser', JSON.stringify({ id: 'demo', login: 'zuschauer', display_name: 'Zuschauer' }));
      localStorage.setItem('twitchAccessToken', 'demo');
    });
    await p.goto(`${BASE}/Abstimmungen/1`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  giveaways: async (p, file) => {
    await p.goto(`${BASE}/Giveaways`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // Discord-Bot: das Dashboard braucht Twitch- und Discord-Anmeldung — beides samt Server und Einstellungen wird
  // hier mit Beispieldaten beantwortet (nur Lesezugriffe, nichts geht an Discord)
  'discord-bot': async (p, file) => {
    await p.evaluateOnNewDocument(() => {
      if (location.hostname !== 'localhost') return;
      localStorage.setItem('twitchUser', JSON.stringify({ id: 'demo', login: 'streamer', display_name: 'Streamer' }));
      localStorage.setItem('twitchAccessToken', 'demo');
    });
    const ch = (id, name) => ({ id, name });
    const mock = {
      '/api/auth/me': { id: 'demo', login: 'streamer', displayName: 'Streamer' },
      '/api/discord/guilds': { guilds: [
        { id: 'g1', name: 'Streamer Community', icon: null, botPresent: true },
        { id: 'g2', name: 'Gaming Lounge', icon: null, botPresent: true },
      ] },
      '/api/discord/guilds/g1/channels': { channels: [ch('c1', 'willkommen'), ch('c2', 'allgemein'), ch('c3', 'stream-ankündigungen')] },
      '/api/discord/guilds/g1/roles': { roles: [{ id: 'r1', name: 'Community', color: 0x9146ff }, { id: 'r2', name: 'Live', color: 0xef4444 }] },
      '/api/discord/guilds/g1/emojis': { emojis: [] },
      '/api/discord/settings/g1': {
        prefix: '!', botNickname: '', welcomeChannel: 'c1', welcomeMessage: 'Willkommen [USER] auf [SERVER]! Du bist unser Mitglied #[MEMBER]',
        welcomeStyle: 'image', leaveChannel: 'c1', leaveMessage: 'Schade, [USER] hat [SERVER] verlassen.', leaveStyle: 'text',
        funChannel: 'c2', disabledCommands: [],
      },
      '/api/discord/settings/g1/overview': { general: true, welcome: true, leave: true, reactionroles: true, liverole: true, twitchnotif: true, tickets: true, funcommands: true },
    };
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = new URL(req.url());
      if (!u.pathname.startsWith('/api/')) return req.continue();
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(mock[u.pathname] ?? {}) });
    });
    await p.goto(`${BASE}/discord-bot`, { waitUntil: 'networkidle2' });
    await wait(1200);
    await clickText(p, 'Einrichten');
    await wait(1200);
    await clickText(p, 'Eintritt');
    await wait(1500);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
};

// ── Kleine Symbolbilder (public/media/icons/<id>.webp, 128×128) für Startseite und "Schnell weiter" ──────────
// Ausschnitte aus den Vorschaubildern (Rechteck in deren Pixeln) oder kleine gezeichnete Motive. Bereiche mit
// passender fertiger Grafik (Clash-Royale-Symbole, Huhn, Kartenbild) brauchen hier nichts — siehe navigation.js.
const ICON_OUT = path.join(__dirname, '..', 'public', 'media', 'icons');
const ICON = 128;
const CROPS = {
  adventures: { from: 'adventures', x: 548, y: 318, size: 104 },
  'flick-soccer': { from: 'flick-soccer', x: 143, y: 339, size: 88 },
};
const DRAWN = {
  connect4: `<div style="display:grid;grid-template-columns:repeat(3,26px);gap:6px;padding:11px;background:#1d2a6b;border-radius:16px;box-shadow:0 8px 0 #111a48">
    ${['', 'y', '', 'r', 'y', '', 'y', 'r', 'r'].map((c) => `<i style="width:26px;height:26px;border-radius:50%;display:block;background:${c === 'r' ? '#ef4444' : c === 'y' ? '#facc15' : '#0b0b10'};box-shadow:inset 0 ${c ? '-4px 0 rgba(0,0,0,.25)' : '3px 0 rgba(0,0,0,.45)'}"></i>`).join('')}</div>`,
  bingo: `<div style="display:grid;grid-template-columns:repeat(3,26px);gap:5px;padding:10px;background:#f5f3ff;border-radius:14px;box-shadow:0 8px 0 #5b21b6">
    ${[1, 0, 1, 0, 1, 0, 1, 0, 0].map((x) => `<i style="width:26px;height:26px;border-radius:6px;display:block;background:${x ? '#8b5cf6' : '#ddd6fe'}"></i>`).join('')}</div>`,
  // Seed Runners: Gipfel in den Farben des Eis-Bioms mit Zielflagge (die Spielfigur ist zu klein für ein Symbol)
  'seed-runners': `<svg width="112" height="104" viewBox="0 0 112 104">
    <rect x="0" y="0" width="112" height="104" rx="16" fill="#0b1420"/>
    <path d="M6 92 L40 40 L58 64 L76 30 L106 92 Z" fill="#243a4e"/>
    <path d="M40 40 L49 54 L44 52 L38 58 L33 51 Z M76 30 L88 54 L82 50 L76 56 L70 50 L66 50 Z" fill="#bfe8f7"/>
    <rect x="75" y="10" width="3" height="22" fill="#e5e7eb"/>
    <path d="M78 10 h16 l-4 6 l4 6 h-16 Z" fill="#facc15"/>
    <rect x="0" y="88" width="112" height="16" rx="0" fill="#8ccbe8"/>
    <rect x="0" y="88" width="112" height="4" fill="#bfe8f7"/></svg>`,
  // Nicht-Clash-Royale-Bereiche bekommen eigene Motive (keine CR-Grafiken für Overlays, Tools oder Community)
  // Win Challenge: Liste mit Häkchen, Zähler und Timer — wie das Overlay selbst
  'win-challenge': `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="6" y="10" width="100" height="92" rx="14" fill="#18122b" stroke="#9146ff" stroke-width="3"/>
    <rect x="6" y="10" width="100" height="22" rx="14" fill="#2a1f4a"/><rect x="6" y="24" width="100" height="8" fill="#2a1f4a"/>
    <rect x="16" y="17" width="44" height="8" rx="3" fill="#fff"/>
    <rect x="16" y="42" width="52" height="7" rx="3" fill="#d4d4d8"/><path d="M80 45 l5 5 l10 -10" stroke="#34d399" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="16" y="60" width="44" height="7" rx="3" fill="#d4d4d8"/><text x="96" y="68" text-anchor="end" font-family="Arial" font-weight="700" font-size="13" fill="#fff">2/3</text>
    <rect x="34" y="80" width="44" height="12" rx="6" fill="#0b0f1a"/><circle cx="42" cy="86" r="3" fill="#ef4444"/><rect x="49" y="83" width="24" height="6" rx="2" fill="#fff"/></svg>`,
  // Twitch-Overlay-Tools: Umfrage-Balken in Twitch-Violett
  'twitch-tools': `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="6" y="12" width="100" height="88" rx="14" fill="#111114" stroke="#9146ff" stroke-width="3"/>
    <rect x="18" y="26" width="40" height="7" rx="3" fill="#a970ff"/>
    <rect x="18" y="44" width="76" height="9" rx="4.5" fill="#26262c"/><rect x="18" y="44" width="30" height="9" rx="4.5" fill="#3987e5"/>
    <rect x="18" y="62" width="76" height="9" rx="4.5" fill="#26262c"/><rect x="18" y="62" width="52" height="9" rx="4.5" fill="#d95926"/>
    <rect x="18" y="80" width="76" height="9" rx="4.5" fill="#26262c"/><rect x="18" y="80" width="64" height="9" rx="4.5" fill="#199e70"/></svg>`,
  // Tür "Ich streame": Kamera-Bild mit Live-Punkt
  streamer: `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="8" y="20" width="96" height="66" rx="12" fill="#1a1530" stroke="#a78bfa" stroke-width="3"/>
    <rect x="16" y="28" width="80" height="50" rx="7" fill="#2e1065"/>
    <circle cx="56" cy="50" r="12" fill="#a78bfa"/><path d="M34 78 q22 -24 44 0 Z" fill="#a78bfa"/>
    <rect x="22" y="33" width="30" height="11" rx="5.5" fill="#ef4444"/><circle cx="29" cy="38.5" r="2.5" fill="#fff"/><rect x="34" y="36.5" width="13" height="4" rx="2" fill="#fff"/>
    <rect x="40" y="88" width="32" height="6" rx="3" fill="#a78bfa"/><rect x="30" y="94" width="52" height="6" rx="3" fill="#7c3aed"/></svg>`,
  // Abstimmungen: Wahlzettel mit Häkchen über der Urne
  abstimmungen: `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="30" y="10" width="52" height="56" rx="6" fill="#f5f3ff" transform="rotate(-6 56 38)"/>
    <path d="M42 38 l9 9 l18 -20" stroke="#7c3aed" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-6 56 38)"/>
    <rect x="12" y="56" width="88" height="46" rx="10" fill="#6d28d9"/><rect x="12" y="56" width="88" height="12" rx="6" fill="#8b5cf6"/>
    <rect x="34" y="60" width="44" height="5" rx="2.5" fill="#2e1065"/></svg>`,
  // Giveaways: Geschenk
  giveaways: `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="16" y="46" width="80" height="56" rx="8" fill="#16a34a"/><rect x="10" y="32" width="92" height="20" rx="6" fill="#22c55e"/>
    <rect x="49" y="32" width="14" height="70" fill="#facc15"/>
    <path d="M56 32 C40 10 22 18 34 30 Z M56 32 C72 10 90 18 78 30 Z" fill="#fde047" stroke="#ca8a04" stroke-width="2"/></svg>`,
  // Discord-Bot: Roboterkopf in Discord-Blau (bewusst nicht das Discord-Logo)
  'discord-bot': `<svg width="112" height="112" viewBox="0 0 112 112">
    <rect x="54" y="6" width="4" height="16" fill="#c7d2fe"/><circle cx="56" cy="8" r="6" fill="#facc15"/>
    <rect x="14" y="22" width="84" height="70" rx="20" fill="#5865f2"/><rect x="14" y="80" width="84" height="12" rx="6" fill="#4752c4"/>
    <rect x="6" y="44" width="10" height="24" rx="5" fill="#4752c4"/><rect x="96" y="44" width="10" height="24" rx="5" fill="#4752c4"/>
    <rect x="26" y="36" width="60" height="34" rx="12" fill="#1e1f3b"/>
    <circle cx="43" cy="53" r="7" fill="#7dd3fc"/><circle cx="69" cy="53" r="7" fill="#7dd3fc"/>
    <rect x="44" y="76" width="24" height="5" rx="2.5" fill="#1e1f3b"/></svg>`,
  'ytm-bot': `<div style="width:96px;height:96px;border-radius:50%;background:repeating-radial-gradient(circle,#18181b 0 3px,#27272a 3px 5px);display:grid;place-items:center;box-shadow:0 8px 0 #09090b">
    <i style="width:34px;height:34px;border-radius:50%;background:#ef4444;border:6px solid #fca5a5;display:block"></i></div>`,
};

async function makeIcons(browser, only) {
  fs.mkdirSync(ICON_OUT, { recursive: true });
  const p = await browser.newPage();
  await p.setViewport({ width: ICON, height: ICON, deviceScaleFactor: 1 });
  for (const [id, c] of Object.entries(CROPS)) {
    if (only.length && !only.includes(id)) continue;
    const data = fs.readFileSync(path.join(OUT, `${c.from}.webp`)).toString('base64');
    const s = ICON / c.size;
    await p.setContent(`<body style="margin:0"><div style="width:${ICON}px;height:${ICON}px;background:url(data:image/webp;base64,${data}) no-repeat;background-size:${1200 * s}px auto;background-position:${-c.x * s}px ${-c.y * s}px"></div></body>`);
    await wait(150);
    await p.screenshot({ path: path.join(ICON_OUT, `${id}.webp`), type: 'webp', quality: 85 });
    console.log('ok   icon', id);
  }
  for (const [id, html] of Object.entries(DRAWN)) {
    if (only.length && !only.includes(id)) continue;
    await p.setContent(`<body style="margin:0;width:${ICON}px;height:${ICON}px;display:grid;place-items:center;background:transparent">${html}</body>`);
    await wait(100);
    await p.screenshot({ path: path.join(ICON_OUT, `${id}.webp`), type: 'webp', quality: 90, omitBackground: true });
    console.log('ok   icon', id);
  }
  // Blobby: der rote Blob steht in der Handy-Ansicht frei (am Desktop verdeckt ihn das Formular)
  if (!only.length || only.includes('blobby')) {
    const m = await browser.newPage();
    await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
    await m.goto(`${BASE}/blobby`, { waitUntil: 'networkidle2' });
    await wait(1800);
    await m.screenshot({ path: path.join(ICON_OUT, 'blobby.webp'), type: 'webp', quality: 85, clip: { x: 60, y: 186, width: 58, height: 58 } });
    await m.close();
    console.log('ok   icon blobby');
  }
  await p.close();
}

(async () => {
  if (process.argv[2] === 'icons') {
    const browser = await puppeteer.launch({ headless: true });
    await makeIcons(browser, process.argv.slice(3));
    await browser.close();
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const ids = only.length ? only : Object.keys(SHOTS);
  const browser = await puppeteer.launch({ headless: true });
  for (const id of ids) {
    const p = await browser.newPage();
    // Overlays sind kleine Ausschnitte — doppelte Auflösung, damit sie in den Karten scharf bleiben
    const overlay = /^(win-|twitch-)/.test(id);
    await p.setViewport({ width: W, height: H, deviceScaleFactor: overlay ? 2 : 1 });
    const file = path.join(OUT, `${id}.webp`);
    try {
      await SHOTS[id](p, file);
      console.log('ok  ', id, `${Math.round(fs.statSync(file).size / 1024)} KB`);
    } catch (e) {
      console.log('FEHLER', id, e.message);
    }
    await p.close();
  }
  await browser.close();
})();
