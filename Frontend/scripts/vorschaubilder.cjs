// scripts/vorschaubilder.cjs — fotografiert die Vorschaubilder für Startseite, Türen und Zwischenseiten
// (public/media/previews/<id>.webp, Liste der Bilder je Eintrag: src/config/navigation.js → previews).
//
// Aufruf (Dev-Server muss laufen, Backend oder Attrappe auf 3001 für adVentures):
//   node scripts/vorschaubilder.cjs [id …]        ohne id: alle
//
// Overlays und Twitch-Widgets kommen aus der Galerie /tools/vorlagen (dort laufen die echten Komponenten mit
// Beispieldaten), Spiele aus einer laufenden Partie — das Menü allein zeigt nicht, was man spielt.
//
// Virtual Farm (angemeldeter Spielstand) und Blobby Volley (zwei Spieler) brauchen den Prüfstand:
//   node scripts/vorschauServer.cjs
//   VORSCHAU_BASE=http://localhost:5191 node scripts/vorschaubilder.cjs garden blobby
// Manche Einträge schreiben ein zweites Bild <id>-2.webp (in navigation.js als weiteres preview eingetragen).
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { io } = require('socket.io-client');
const { FARM_ZEIT, FARM_KONTO } = require('./vorschauServer.cjs');

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
    // Mitten in die Horde springen (der Dev-Server legt das laufende Spiel als window.__avGame ab), der Held bleibt
    // stehen und hält durch. Nach gut zehn Sekunden stehen die Rudel im Bild.
    await p.waitForFunction(() => window.__avGame && window.__avGame.time > 0.5, { timeout: 30000 });
    await p.evaluate(async () => {
      const { loadStage } = await import('/src/pages/Adventure/engine/stage.js');
      const { recalcStats } = await import('/src/pages/Adventure/engine/stats.js');
      const { chooseUpgrade } = await import('/src/pages/Adventure/engine/levelup.js');
      const g = window.__avGame, pl = g.player;
      g.time = 560; loadStage(g); g.stageTime = 560;
      pl.weapons = { dolche: 4, peitsche: 3, feuerkugeln: 3, donnerkeil: 2 };
      pl.weaponOrder = Object.keys(pl.weapons);
      for (const id of pl.weaponOrder) pl.weaponState[id] = { t: 0 };
      pl.talents = { macht: 2, weite: 1 }; pl.talentOrder = ['macht', 'weite'];
      pl.level = 19; pl.pendingLevels = 0; pl.gold = 180;
      g.stats.kills = 3900;
      g.streak.n = 180; g.streak.t = 2.5;
      recalcStats(pl, g.kit);
      setInterval(() => { pl.hp = pl.stats.maxHp; pl.buffs.invuln = 5; if (g.levelUp) chooseUpgrade(g, 0); }, 150);
    });
    await wait(1500);
    await p.mouse.move(820, 300);
    await p.mouse.down();
    await wait(12500);
    await p.screenshot({ path: file, type: 'webp', quality: 82 });
    await p.mouse.up();
  },
  // Virtual Farm: vorbereiteter Hof im Sommer (Acker in allen Wuchsstufen, Obst, Tiere, Deko), zweites Bild
  // vom Dorfplatz mit den Ständen am Teich. Braucht den Prüfstand (siehe Kopf).
  garden: async (p, file) => {
    const jetzt = FARM_ZEIT;
    // Uhr der Seite auf denselben Sommertag wie der Prüfstand (Jahreszeit und Tageslicht hängen an der Uhr)
    await p.evaluateOnNewDocument((fix, konto) => {
      const Echt = Date;
      const start = Echt.now();
      const lauf = () => fix + (Echt.now() - start);
      window.Date = class extends Echt {
        constructor(...a) { super(...(a.length ? a : [lauf()])); }
        static now() { return lauf(); }
      };
      localStorage.setItem('twitchUser', JSON.stringify({ id: konto.twitchId, login: konto.twitchLogin, display_name: konto.twitchLogin }));
      localStorage.setItem('twitchAccessToken', 'vorschau');
    }, jetzt, FARM_KONTO);
    await p.setCookie({ name: 'session', value: 'vorschau', domain: new URL(BASE).hostname, path: '/' });
    // Lage des ersten Grundstücks aus der Karte des Spiels (Deko und Tiere speichern Weltpunkte)
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const hof = await p.evaluate(async () => {
      const m = await import('/src/pages/GardenGame/engine/MapConfig.js');
      const s = m.generatePlotSlots(6).slots[0];
      return { x: s.x, y: s.isTopRow ? s.anchorY - m.MAP_CONFIG.territoryHeight : s.anchorY, T: m.TILE_SIZE };
    });
    const punkt = (kx, ky) => ({ x: hof.x + kx * hof.T, y: hof.y + ky * hof.T });
    // Links Gemüse reihenweise (reif = 2, sonst Anteil der Wuchszeit), rechts Obst und Stauden auf Lücke
    const plotPlants = {};
    [['mais', 2], ['karotte', 2], ['kuebi', 2], ['kohl', 0.75], ['paprika', 0.5], ['salat', 0.3], ['radieschen', 0.08]].forEach(([id, anteil], r) => {
      for (let c = 0; c < 7; c++) {
        plotPlants[`${c}_${r}`] = { instanceId: `e-${c}-${r}`, seedId: id, singleUse: true, cellX: c, cellY: r, plantedAt: jetzt - anteil * 36e5, growthMs: 36e5, norm: 0.7, stage: 'growing' };
      }
    });
    const obst = ['apfel', 'kirsche', 'banane', 'orange', 'traube', 'tomate', 'erdbeere', 'birne', 'himbeere', 'kokosnuss', 'blaubeere', 'mango', 'pflaume', 'chili'];
    let n = 0;
    for (let r = 0; r < 7; r += 2) {
      for (let c = 8; c < 15; c += 2) {
        const reif = n % 3 === 0 ? 0 : 4;
        plotPlants[`${c}_${r}`] = {
          instanceId: `d-${c}-${r}`, seedId: obst[n % obst.length], singleUse: false, cellX: c, cellY: r,
          plantedAt: jetzt - 9e6, structureGrowthMs: 1000, structureReadyAt: jetzt - 8e6, fruitCycleMs: 6e6, maxFruits: 6, stage: 'fruiting', harvested: 0,
          fruitSlots: Array.from({ length: 6 }, (_, k) => ({ readyAt: k < reif ? jetzt - 1000 : jetzt + 3e6, size: 25 + k * 4 })),
        };
        n++;
      }
    }
    // Tiere und Deko auf den Wiesen links und rechts vom Acker: [Name/Katalog-ID, Ordner, Datei, Kachel x, y, Breite, Höhe]
    const tiere = [['huhn', 3, 20.3], ['ente', 4.6, 18.6], ['katze', 23.6, 23.6], ['kuh', 4.2, 23.2], ['schaf', 1.8, 21.4], ['schwein', 5.4, 22.3], ['pferd', 23.2, 19.6]]
      .map(([art, kx, ky], i) => ({ id: `t${i}`, name: art[0].toUpperCase() + art.slice(1), rarity: 'COMMON', image: `/garden-assets/animals/${art}.png`, ability: { type: 'goldfinder', level: 2 }, slotIndex: 0, ...punkt(kx, ky) }));
    const deko = [
      ['cherry_blossom', 'nature', 'cherry_blossom', 2, 18, 1, 2], ['cherry_blossom', 'nature', 'cherry_blossom', 24, 18, 1, 2],
      ['sonnenblume', 'nature', 'sonnenblume', 0, 20, 1, 2], ['sonnenblume', 'nature', 'sonnenblume', 1, 20, 1, 2], ['sonnenblume', 'nature', 'sonnenblume', 2, 20, 1, 2],
      ['tulpenbett', 'nature', 'tulpenbett', 4, 21], ['blumen_wiese', 'nature', 'blumen_wiese', 1, 22], ['blumen_wiese2', 'nature', 'blumen_wiese2', 6, 23],
      ['lavendel', 'nature', 'lavendel', 5, 19], ['lavendel', 'nature', 'lavendel', 6, 19], ['mohn', 'nature', 'mohn', 0, 23],
      ['deco_bench', 'social', 'bank', 3, 22], ['vogelscheuche', 'objects', 'vogelscheuche', 6, 21, 1, 2], ['bienenkorb', 'objects', 'bienenkorb', 1, 18],
      ['heuballen', 'objects', 'heuballen', 5, 24], ['heuballen', 'objects', 'heuballen', 6, 24], ['teich', 'objects', 'teich', 4, 18, 2, 2],
      ['brunnen', 'objects', 'brunnen1', 26, 18, 2, 2], ['gnome1', 'objects', 'gnome1', 22, 22], ['flower1', 'nature', 'flower1', 22, 24],
      ['flower2', 'nature', 'flower2', 23, 24], ['flower3', 'nature', 'flower3', 22, 19], ['licht_park', 'lighting', 'light3', 22, 23, 1, 2],
      ['kuerbis_deko', 'nature', 'kuerbis', 22, 20], ['gaensebluemchen', 'nature', 'gaensebluemchen', 3, 24], ['gaensebluemchen', 'nature', 'gaensebluemchen', 25, 24],
      ['hecke', 'nature', 'hecke', 26, 21, 2, 1],
    ].map(([decoId, ordner, datei, kx, ky, w = 1, h = 1]) => ({
      id: `v_${decoId}_${kx}_${ky}`, decoId, name: decoId, emoji: '', image: `/garden-assets/deco/${ordner}/${datei}.png`, rarity: 'COMMON',
      width: w, height: h, mirrored: false, rotation: 0, slotIndex: 0, occupiedKeys: [], ...punkt(kx + 0.5, ky + 0.5),
    }));
    const stand = {
      gold: 184250, goldGesamt: 5e6, xp: 50000, stateVersion: 1, twitchLogin: FARM_KONTO.twitchLogin, updatedAt: jetzt,
      tutorialCompleted: true, ackerRaster7: true, samenKennungV1: true, tierKennungV1: true,
      inventory: ['karotte', 'mais', 'tomate', 'apfel', 'kuebi', 'erdbeere', 'kohl'].map((id, k) => ({ instanceId: `s${k}`, seedId: id, name: id, rarity: 'COMMON', singleUse: !['tomate', 'apfel', 'erdbeere'].includes(id) })),
      plotPlants, harvestedItems: [], petInventory: [], petPlacements: tiere, eggInventory: [], decoInventory: [], decoPlacements: deko, mailbox: [],
      toolInventory: { hasShovel: true, backpackLevel: 1 }, inventoryMaxSlots: 60,
    };
    const res = await fetch(`${BASE}/api/vorschau/state/${FARM_KONTO.twitchId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(stand) }).catch(() => null);
    if (!res?.ok) throw new Error('Farm-Prüfstand nicht erreichbar — erst "node scripts/vorschauServer.cjs" starten und VORSCHAU_BASE setzen (siehe Kopf)');

    await p.goto(`${BASE}/garden`, { waitUntil: 'networkidle2', timeout: 60000 });
    await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Spielen'), { timeout: 30000 });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Spielen').click());
    // Der Dev-Server legt Prüfhaken als window.__farmTest ab: Figur setzen, Zoom wählen
    await p.waitForFunction(() => !!window.__farmTest?.springe, { timeout: 30000 });
    await wait(6000);
    // Hof: Figur auf dem Mittelweg des Ackers, so weit herausgezoomt, dass das Haus mit im Bild ist
    await p.evaluate(() => { const z = window.__farmTest.zelleWelt(7, 3); window.__farmTest.setze(z.x, z.y); window.__farmTest.zoom(0.9); });
    await wait(2500);
    await p.screenshot({ path: file, type: 'webp', quality: 70 });
    // Dorfplatz: Stände und Teich (Figur auf der Wiese daneben — direkt am Stand blendet das Spiel ihn durchsichtig)
    await p.evaluate(() => { window.__farmTest.springe(59, 44); window.__farmTest.zoom(0.82); });
    await wait(2500);
    await p.screenshot({ path: file.replace('.webp', '-2.webp'), type: 'webp', quality: 70 });
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
  // Blobby Volley: echte Partie. Der Browser sitzt auf Platz 1 (ein kleiner Bot drückt seine Tasten), ein zweiter
  // Bot spielt Platz 2 direkt über den Socket. Fotografiert wird das Spielfeld mitten im Ballwechsel; das zweite Bild zeigt
  // dieselbe Partie in der 3D-Ansicht. Braucht den Blobby-Server (Prüfstand, siehe Kopf).
  blobby: async (p, file) => {
    const OPTS = { path: '/blobby-socket', transports: ['websocket'] };
    const verbinde = () => new Promise((ok, nein) => {
      const s = io(BASE, OPTS);
      s.on('connect', () => ok(s));
      s.on('connect_error', () => { s.close(); nein(new Error('Blobby-Server nicht erreichbar — Prüfstand starten (siehe Kopf)')); });
    });
    const frage = (s, ev, daten) => new Promise((ok) => s.emit(ev, daten, ok));
    // Raum anlegen und den Platz gleich wieder freigeben — die Seite übernimmt ihn über den gemerkten Namen
    const a = await verbinde();
    const raum = await frage(a, 'bv:create', { name: 'Valentin', settings: { mode: '1v1', crossNet: true, maxTouches: 0, powerups: true, field: 'classic' } });
    a.disconnect();
    // Das Feld ist im Fenster nur gut 550 Punkte breit — doppelte Dichte, damit das Bild Kartengröße hat
    await p.setViewport({ width: W, height: H, deviceScaleFactor: 2.2 });
    await p.evaluateOnNewDocument((code) => {
      localStorage.setItem('blobby_session', JSON.stringify({ code, name: 'Valentin' }));
      localStorage.setItem('blobby_last_name', 'Valentin');
      localStorage.setItem('blobby_view', '2d');
    }, raum.code);
    await p.goto(`${BASE}/blobby/${raum.code}`, { waitUntil: 'networkidle2' });
    await wait(1500);
    const b = await verbinde();
    await frage(b, 'bv:join', { code: raum.code, name: 'Mika' });
    let tick = null;
    b.on('bv:tick', (t) => { tick = t; });

    // Bot: zum erwarteten Landepunkt laufen, springen, wenn der Ball über einem ist. Damit Punkte fallen, patzt
    // der Empfänger ab und zu (bleibt stehen), sobald der Ball die Seite wechselt — sonst endet kein Ballwechsel.
    const patzt = { 1: false, 2: false };
    let seite = 0;
    const merke = (t) => {
      if (t.ph !== 'rally') { patzt[1] = patzt[2] = false; seite = 0; return; }
      const s = t.b[0] < 400 ? 1 : 2;
      if (s !== seite) { seite = s; patzt[s] = Math.random() < 0.3; }
    };
    const will = (t, slot) => {
      if (patzt[slot]) return { left: false, right: false, jump: false };
      const [bx, by, bvx, bvy] = t.b;
      const ich = t.pl[slot];
      const links = slot === 1;
      let x = bx, y = by, vx = bvx, vy = bvy;
      for (let i = 0; i < 120 && y < 360; i++) { vy += 0.287; x += vx; y += vy; if (x < 32) { x = 32; vx = -vx; } if (x > 768) { x = 768; vx = -vx; } }
      const beiMir = links ? bx < 400 : bx > 400;
      const landetBeiMir = links ? x < 400 : x > 400;
      let ziel = links ? 210 : 590;
      if (beiMir || landetBeiMir) ziel = (landetBeiMir ? x : bx) + (links ? -16 : 16);
      ziel = links ? Math.min(360, Math.max(40, ziel)) : Math.max(440, Math.min(760, ziel));
      const nah = beiMir && Math.abs(bx - ich[0]) < 70 && by > ich[1] - 260 && by < ich[1] - 60 && bvy > -2;
      return { left: ziel - ich[0] < -6, right: ziel - ich[0] > 6, jump: nah || (t.ph === 'serve' && links && t.f % 150 > 75) };
    };
    const TASTE = { left: 'KeyA', right: 'KeyD', jump: 'KeyW' };
    const gedrueckt = { left: false, right: false, jump: false };
    let seq = 0, maske = -1;
    // Ausschnitt: das Spielfeld füllt das Bild. Es ist 4:3, die Karte 16:10 — oben fällt etwas Himmel weg,
    // unten etwas mehr Sand (der Ball fliegt oben, dort bleibt mehr stehen).
    const ausschnitt = () => p.evaluate(() => {
      const c = document.querySelector('canvas').getBoundingClientRect();
      const rand = 4; // Rahmen des Spielfelds bleibt draußen
      const w = c.width - 2 * rand, h = w / 1.6;
      return { x: c.left + rand, y: c.top + (c.height - h) * 0.32, width: w, height: h };
    });
    // Guter Moment: Ball hoch in der Luft nahe am Pfeiler, ein Blob im Sprung, ein paar Punkte auf der Tafel
    const gut = (t) => t.ph === 'rally' && t.b[1] > 115 && t.b[1] < 280 && t.b[0] > 250 && t.b[0] < 550
      && (t.pl[1][5] === 0 || t.pl[2][5] === 0) && t.sc[0] + t.sc[1] >= 3 && t.sc[0] > 0 && t.sc[1] > 0;
    const spiele = async (bis) => {
      const ende = Date.now() + 240000;
      for (;;) {
        if (Date.now() > ende) throw new Error('kein passender Ballwechsel in 4 Minuten');
        await wait(12);
        const t = tick;
        if (!t) continue;
        merke(t);
        const w2 = will(t, 2);
        const m = (w2.left ? 1 : 0) | (w2.right ? 2 : 0) | (w2.jump ? 4 : 0);
        if (m !== maske) { maske = m; b.emit('bv:input', { ...w2, seq: ++seq }); }
        const w1 = will(t, 1);
        for (const k of Object.keys(TASTE)) {
          if (w1[k] !== gedrueckt[k]) { gedrueckt[k] = w1[k]; await (w1[k] ? p.keyboard.down(TASTE[k]) : p.keyboard.up(TASTE[k])); }
        }
        if (t.pl[2][8] >= 0) b.emit('bv:power');
        if (bis(t)) return;
      }
    };
    try {
      await spiele(gut);
      await p.screenshot({ path: file, type: 'webp', quality: 82, clip: await ausschnitt() });
      // 3D-Ansicht derselben Partie: umschalten, kurz weiterspielen, nächsten guten Moment abwarten
      await clickText(p, '3D', 'button');
      const ab = Date.now() + 2500;
      await spiele((t) => Date.now() > ab && gut(t));
      await p.screenshot({ path: file.replace('.webp', '-2.webp'), type: 'webp', quality: 82, clip: await ausschnitt() });
    } finally {
      b.disconnect();
    }
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
  // Worldflip: laufende Partie gegen Bots (3D — am schönsten mit echter Grafikkarte, sonst greift der Sparmodus)
  worldflip: async (p, file) => {
    await p.goto(`${BASE}/worldflip/spiel`, { waitUntil: 'networkidle2' });
    await wait(5000);
    await p.screenshot({ path: file, type: 'webp', quality: 80 });
  },
  // Lights Out: Blick durch die Taschenlampe auf das Monster der Ebene — Anstalt (Nachtschwester im Flur), als
  // zweites Bild der Garten (Gärtner zwischen den Mauern). Der Dev-Server legt das laufende Spiel als window.__lo ab.
  'lights-out': async (p, file) => {
    const ebene = async (seite, level, abstand, ziel) => {
      await seite.evaluateOnNewDocument((lvl) => {
        localStorage.setItem('lo:progress', JSON.stringify({ level: lvl }));
        localStorage.setItem('lo:prefs', JSON.stringify({ sensitivity: 1, volume: 0, softScares: false, gfx: 'high' }));
        // Ohne Fenster gibt es keine Zeigersperre — das Spiel läuft erst, wenn sie gemeldet wird
        let gesperrt = null;
        Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => gesperrt, configurable: true });
        Element.prototype.requestPointerLock = function () { gesperrt = this; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0); return Promise.resolve(); };
        Document.prototype.exitPointerLock = function () { gesperrt = null; document.dispatchEvent(new Event('pointerlockchange')); };
      }, level);
      await seite.goto(`${BASE}/lights-out`, { waitUntil: 'networkidle2' });
      await wait(800);
      await clickText(seite, 'Weiter: Ebene', 'button');
      await seite.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Los' && !b.disabled), { timeout: 180000 });
      await seite.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Los').click());
      await wait(2500);
      // Monster in Blickrichtung vor die Spielerin stellen und dort festhalten
      await seite.evaluate((d) => {
        const { player, monster } = window.__lo._debug;
        setInterval(() => {
          monster.x = player.x - Math.sin(player.yaw) * d;
          monster.z = player.z - Math.cos(player.yaw) * d;
          monster.state = 'chase';
          monster.freezeUntil = 1e9;
          player.battery = 100;
        }, 30);
      }, abstand);
      await wait(1500);
      // In der Nähe des Monsters flackert die Lampe — mehrere Bilder, das hellste (größte Datei) bleibt
      let bestes = null;
      for (let i = 0; i < 8; i++) {
        await wait(450);
        const bild = await seite.screenshot({ type: 'webp', quality: 78 });
        if (!bestes || bild.length > bestes.length) bestes = bild;
      }
      fs.writeFileSync(ziel, bestes);
    };
    await ebene(p, 1, 5, file);
    const zweite = await p.browserContext().newPage();
    await zweite.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    try {
      await ebene(zweite, 3, 4.5, file.replace('.webp', '-2.webp'));
    } finally {
      await zweite.close();
    }
  },
  // Tanzfigur: der Baukasten mit einer fertig angezogenen Figur, zweites Bild mit anderem Outfit und Tanz
  tanzfigur: async (p, file) => {
    const figur = async (seite, look, tanz, ziel) => {
      // Größer als das Kartenformat: der ganze Baukasten muss samt seitlichem Rand (16:10) ins Fenster passen
      await seite.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
      await seite.evaluateOnNewDocument((l) => localStorage.setItem('tanzfigurEntwurf', JSON.stringify(l)), look);
      await seite.goto(`${BASE}/tanzfigur`, { waitUntil: 'networkidle2' });
      await seite.waitForFunction(() => document.querySelector('canvas') && !document.body.innerText.includes('Figur wird geladen'), { timeout: 30000 });
      if (tanz) await clickText(seite, tanz, 'button');
      const karte = await seite.evaluateHandle(() => document.querySelector('canvas').closest('.grid'));
      await karte.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await wait(2600);
      // Ausschnitt im Kartenformat 16:10 um den Baukasten
      const r = await karte.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      const breite = r.h * 1.6;
      await seite.screenshot({ path: ziel, type: 'webp', quality: 84, clip: { x: r.x + r.w / 2 - breite / 2, y: r.y, width: breite, height: r.h } });
    };
    await figur(p, { hat: 'headphones', head: 'Casual2_Male', body: 'twitchHoodie', legs: 'joggerBlack', shoes: 'raveNeon', extra: 'glowsticks', skin: 1 }, null, file);
    const zweite = await p.browserContext().newPage();
    try {
      await figur(zweite, { hat: 'crown', head: 'Pug', body: 'hoodieBolt', legs: 'shortsPurple', shoes: 'sneakerGold', extra: 'sunglasses', skin: 2 }, 'Disco', file.replace('.webp', '-2.webp'));
    } finally {
      await zweite.close();
    }
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
  'flick-soccer': { from: 'flick-soccer', x: 143, y: 339, size: 88 },
};
const DRAWN = {
  // adVentures: der Ritter als 3D-Figur (dasselbe Bild wie in den Menüs des Spiels)
  adventures: `<img alt="" style="width:124px;height:124px;object-fit:contain" src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'media', 'av3d', 'bilder', 'held_knight.png')).toString('base64')}">`,
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
  // Worldflip: Kartenrückseite mit dem Windrad aus den vier Weltfarben
  worldflip: `<svg width="112" height="112" viewBox="0 0 112 112">
    <g transform="rotate(-9 56 56)">
    <rect x="22" y="6" width="68" height="100" rx="9" fill="#17161d" stroke="#f4eedf" stroke-width="4"/>
    <g transform="translate(56 56)">
      <path d="M0 0 L0 -30 L20 -20 Z" fill="#f0562b"/><path d="M0 0 L30 0 L20 20 Z" fill="#2b93f0"/>
      <path d="M0 0 L0 30 L-20 20 Z" fill="#3dbb4f"/><path d="M0 0 L-30 0 L-20 -20 Z" fill="#9b62f2"/>
      <circle r="6" fill="#17161d"/></g></g></svg>`,
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
  // Mit Grafikkarte (unter Windows über d3d11): ohne sie hält die Seite den Browser für ein schwaches Gerät und zeigt
  // adVentures in der 2D-Ansicht. Die übrigen Schalter halten die Spielschleifen der unsichtbaren Seiten im Takt.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  for (const id of ids) {
    // Eigener Kontext je Bild: vorgetäuschte Anmeldungen und Spielstände wandern nicht ins nächste Bild
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
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
    await ctx.close();
  }
  await browser.close();
})();
