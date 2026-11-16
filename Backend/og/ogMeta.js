// og/ogMeta.js — welche Vorschau (Titel, Beschreibung, Bild) ein geteilter Link bekommt.
//
// Discord, WhatsApp, Telegram & Co. führen kein JavaScript aus: Sie sehen nur das HTML, das nginx ausliefert. Für jede
// Adresse ohne vorgerenderte Datei war das die Startseite ("Home - vnmvalentin") — auch für Turniere, Level und das
// Tagesrennen. nginx schickt deshalb nur Vorschau-Bots für solche Adressen hierher (og/ogRoutes.js), und hier steht,
// was sie sehen sollen. Normale Besucher bekommen weiter die statische index.html.
//
// Die Datenquellen werden von außen hereingereicht (ogRoutes.js), damit Tests ohne echte Datenbanken laufen.
'use strict';

const SITE = 'vnmvalentin';

// Akzentfarbe und Rubrik je Bereich — für Bild und Titel
const SECTIONS = {
  cr: { kicker: 'CLASH ROYALE', accent: '#f2c14e' },
  seed: { kicker: 'SEED RUNNERS', accent: '#8fd17a' },
  games: { kicker: 'BROWSERSPIEL', accent: '#38bdf8' },
  sigils: { kicker: 'SACRIFICE & SIGILS', accent: '#c9a26b' },
  garden: { kicker: 'VIRTUAL FARM', accent: '#7bc96f' },
  stream: { kicker: 'STREAM-TOOLS', accent: '#a970ff' },
  site: { kicker: 'VNMVALENTIN.DE', accent: '#e5e7eb' },
};

// Feste Seiten, die nicht vorgerendert sind (die vorgerenderten liefert nginx selbst aus, mit eigenen Tags).
// shot = Vorschaubild aus dem Spiel (Frontend/public/media/previews/<shot>.webp, erzeugt mit scripts/vorschaubilder.cjs) —
// es füllt das Link-Bild, der Text steht darüber.
const STATIC_PAGES = {
  '/seed-runners': { section: 'seed', shot: 'seed-runners', title: 'Seed Runners', description: 'Schnelles Speedrun-Rennen im Browser: Alle laufen dasselbe zufällig erzeugte Level, wer zuerst im Ziel ist, gewinnt. Online mit Freunden, ohne Download.' },
  '/seed-runners/levels': { section: 'seed', title: 'Level-Bibliothek', description: 'Level, die andere gebaut haben: mit Bestenliste, Geistern und vom Server bestätigten Zeiten.' },
  '/seed-runners/editor': { section: 'seed', title: 'Level-Editor', description: 'Baue eigene Seed-Runners-Level im Browser und veröffentliche sie für alle.' },
  '/garden': { section: 'garden', shot: 'garden', title: 'Virtual Farm', description: 'Deine eigene Farm im Browser: pflanzen, ernten, Tiere halten und den Hof mit Deko gestalten — mit Nachbarn auf derselben Insel.' },
  '/adventures': { section: 'games', shot: 'adventures', title: 'adVentures', description: 'Horde-Roguelite in 3D im Browser: Waffen feuern von selbst, tausende Gegner pro Lauf, fünf Welten bis zum Drachen.' },
  '/blobby': { section: 'games', shot: 'blobby', title: 'Blobby Volley', description: 'Blobby Volley online: Volleyball im Browser, 1v1 oder 2v2. Link teilen, losspielen, kein Download.' },
  '/lights-out': { section: 'games', shot: 'lights-out', title: 'Lights Out', description: 'Horror im Browser in vier Ebenen: Wald, Anstalt, Keller, Garten — in jeder ein anderes Ding im Dunkeln. Allein oder zu viert im Koop.' },
  '/flick-soccer': { section: 'games', shot: 'flick-soccer', title: 'Flick Soccer', description: 'Scheiben-Fußball im Browser: Formation wählen, zurückziehen, abschießen. Gegen den Computer, zu zweit oder online per Link.' },
  '/worldflip': { section: 'games', shot: 'worldflip', title: 'Worldflip', description: '3D-Kartenspiel im Browser: Karten ablegen, während vier Welten um den Tisch kippen und ausbrechen. 19 Effektkarten, 12 Weltereignisse — gegen Bots, online zu viert oder 2 gegen 2.' },
  '/connect4': { section: 'games', shot: 'connect4', title: 'Connect 4', description: 'Vier Gewinnt gegen einen Freund: Link teilen und direkt loslegen, kein Download nötig.' },
  '/sacrifice-and-sigils/kartenbuch': { section: 'sigils', title: 'Kartenbuch', description: 'Alle Karten, Sigils, Items und Ereignisse von Sacrifice & Sigils.' },
  '/sacrifice-and-sigils/moorwanderung': { section: 'sigils', shot: 'sacrifice-and-sigils', title: 'Die Moorwanderung', description: 'Run-Modus für 2 bis 6 Spieler: allein durchs Moor, Deck ausbauen, im Duell Lebenssiegel verteidigen.' },
  '/tools/vorlagen': { section: 'stream', title: 'Overlay-Galerie', description: 'Fertige Looks für die kostenlosen OBS-Overlays: Win Tracker, Win Challenge und Twitch-Umfragen, -Vorhersagen und -Ziele. Mit einem Klick übernehmen.' },
  '/tanzfigur': { section: 'stream', shot: 'tanzfigur', title: 'Tanzfigur bauen', description: 'Bau dir deine Figur mit Hut, Kopf, Outfit und Schuhen — sie tanzt beim Stream-Start auf der Tanzfläche mit.' },
  // Clash-Royale-Stats (Frontend: pages/ClashRoyale/scout/)
  '/clash/spieler': { section: 'cr', title: 'Clash Royale Spieler-Stats', description: 'Profil mit Ranked-Deck, Kämpfen, Sammlung und Aufwert-Rechner — dazu Clans mit Clankrieg.' },
  '/clash/ranglisten': { section: 'cr', title: 'Clash Royale Ranglisten', description: 'Die besten Spieler mit ihren Ranked-Decks und die besten Clans: weltweit und je Land.' },
  '/clash/karten': { section: 'cr', title: 'Clash Royale Karten', description: 'Alle Karten mit Kampfwerten, Nutzung und Siegquote bei den besten Spielern.' },
  '/clash/decks': { section: 'cr', title: 'Clash Royale Decks der Besten', description: 'Was die besten Spieler gerade spielen: häufigste Decks mit Siegquote — nach Karten filtern und mit der eigenen Sammlung abgleichen.' },
  '/clash/crown-series': { section: 'cr', title: 'Clash Royale Crown Series', description: 'Die besten Duell-Decks: Sets aus vier Decks ohne doppelte Karte, die Sets der Bestplatzierten und alle Duell-Decks mit Siegquote.' },
  '/clash/vergleich': { section: 'cr', title: 'Clash Royale Spieler-Vergleich', description: 'Zwei Spieler nebeneinander: Trophäen, Ranked, Siegquote, Sammlung, Decks und direkte Duelle.' },
  '/clash/heute': { section: 'cr', title: 'Clash Royale Tagesrunde', description: 'Alle fünf Ratespiele des Tages: Karten-Wordle, Kartenraten, Zoom-, Pixel- und Farb-Raten — mit Punkten, Serie und Bestenliste.' },
  '/clash/baukasten': { section: 'cr', title: 'Clash Royale Deck-Baukasten', description: 'Deck bauen und sofort sehen, was fehlt: Elixier, Cycle, Luftabwehr, Zauber — dazu ähnliche Decks der Besten.' },
  '/updates': { section: 'site', title: 'Updates', description: 'Alle Neuerungen, Fixes und Features von vnmvalentin.de im Überblick.' },
  '/Giveaways': { section: 'stream', title: 'Giveaways', description: 'Aktuelle Giveaways von vnmvalentin.' },
  '/Abstimmungen': { section: 'stream', title: 'Abstimmungen', description: 'Community-Abstimmungen von vnmvalentin.' },
};

// Einladungslinks in Räume: Code in der Adresse, keine Live-Daten nötig. Das Bild zeigt das Spiel (shot) mit „Einladung“.
const ROOM_PATTERNS = [
  { re: /^\/seed-runners\/([A-Za-z0-9-]{3,16})$/, section: 'seed', game: 'Seed Runners', shot: 'seed-runners', text: 'Ein Rennen wartet auf dich: Klick auf den Link und lauf direkt mit, ohne Download.', invite: 'Ein Rennen wartet auf dich — lauf direkt mit.' },
  { re: /^\/blobby\/([A-Za-z0-9-]{3,16})$/, section: 'games', game: 'Blobby Volley', shot: 'blobby', text: 'Du bist zu einer Partie Blobby Volley eingeladen. Klick und spiel direkt mit.', invite: 'Du bist zu einer Partie eingeladen — klick und spiel mit.' },
  { re: /^\/connect4\/([A-Za-z0-9-]{3,16})$/, section: 'games', game: 'Connect 4', shot: 'connect4', text: 'Du bist zu einer Partie Vier Gewinnt eingeladen. Klick und spiel direkt mit.', invite: 'Du bist zu einer Partie eingeladen — klick und spiel mit.' },
  { re: /^\/flick-soccer\/([A-Za-z0-9-]{3,16})$/, section: 'games', game: 'Flick Soccer', shot: 'flick-soccer', text: 'Du bist zu einem Spiel Flick Soccer eingeladen. Klick und spiel direkt mit.', invite: 'Du bist zu einem Spiel eingeladen — klick und spiel mit.' },
  { re: /^\/worldflip\/([A-Za-z0-9-]{3,16})$/, section: 'games', game: 'Worldflip', shot: 'worldflip', text: 'Am schwebenden Tisch ist ein Platz frei. Klick und spiel direkt mit.', invite: 'Am Tisch ist ein Platz frei — klick und spiel mit.' },
  { re: /^\/sacrifice-and-sigils\/raum\/([A-Za-z0-9-]{3,16})$/, section: 'sigils', game: 'Sacrifice & Sigils', shot: 'sacrifice-and-sigils', text: 'Ein Tisch in der versunkenen Kapelle wartet auf dich. Klick und spiel direkt mit.', invite: 'Ein Tisch in der Kapelle wartet auf dich.' },
  { re: /^\/sacrifice-and-sigils\/moorwanderung\/([A-Za-z0-9-]{3,16})$/, section: 'sigils', game: 'Die Moorwanderung', shot: 'sacrifice-and-sigils', text: 'Eine Gruppe bricht ins Moor auf. Klick und spiel direkt mit.', invite: 'Eine Gruppe bricht ins Moor auf — komm mit.' },
];

// Unterseiten von /seed-runners, die kein Raumcode sind
const SEED_RESERVED = new Set(['daily', 'levels', 'editor', 'sandbox', 'verlauf', 'raum', 'test', 'welten']);

const TOURNAMENT_STATUS = {
  registration: 'Anmeldung offen',
  drawn: 'Ausgelost, startet gleich',
  running: 'Läuft gerade',
  finished: 'Beendet',
  cancelled: 'Abgesagt',
};

const DIFFICULTY = { 1: 'Sehr leicht', 2: 'Leicht', 3: 'Mittel', 4: 'Schwer', 5: 'Extrem' };

const TICK_HZ = 120; // Spiegel von Frontend/src/pages/SeedRunners/sim/config.js
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Sim-Ticks als m:ss.hh — wie room/format.js im Browser */
function formatTicks(ticks) {
  if (!Number.isFinite(ticks)) return '–';
  const total = Math.floor((ticks / TICK_HZ) * 100);
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
}

const germanDate = (dateKey) => dateKey.split('-').reverse().join('.');
const clip = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/**
 * Normalisierte Pfadangabe: ohne Query, ohne abschließenden Slash, URL-dekodiert. Ungültige Eingaben → null.
 */
function cleanPath(rawUri) {
  if (typeof rawUri !== 'string' || !rawUri.startsWith('/') || rawUri.length > 300) return null;
  let p = rawUri.split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch { return null; }
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/**
 * Die Vorschau für einen Pfad.
 * @param rawUri   Pfad mit Query, wie nginx ihn als $request_uri weiterreicht
 * @param sources  { tournament(id), level(code), creator(id), dailyBoard(dateKey), todayKey() } — jede darf fehlen oder werfen
 * @returns {{ path, title, description, section, image: { kind, key }, noindex? } | null}  null = nichts Eigenes, Standard bleibt
 */
function resolveMeta(rawUri, sources = {}) {
  const path = cleanPath(rawUri);
  if (!path) return null;
  const safe = (fn, ...args) => {
    try { return typeof fn === 'function' ? fn(...args) : null; } catch { return null; }
  };

  const fixed = STATIC_PAGES[path];
  if (fixed) return { path, ...fixed, image: { kind: 'page', key: path } };

  // Turnier
  let m = path.match(/^\/clash-royale\/turnier\/([A-Za-z0-9_-]{4,40})$/);
  if (m) {
    const t = safe(sources.tournament, m[1]);
    if (!t) return null;
    const status = TOURNAMENT_STATUS[t.status] || '';
    const parts = [`${t.count}/${t.maxPlayers} Spieler`, status, t.ownerLogin ? `von ${t.ownerLogin}` : ''].filter(Boolean);
    const desc = [parts.join(' · '), clip(t.description, 140)].filter(Boolean).join(' — ');
    return {
      path, section: 'cr', title: `${clip(t.name, 80) || 'Turnier'} — Clash Royale Turnier`, description: desc,
      image: { kind: 'tournament', key: m[1] }, noindex: true,
      card: { stat: { value: `${t.count}/${t.maxPlayers}`, label: 'Spieler' }, lines: [status, t.ownerLogin ? `Veranstaltet von ${t.ownerLogin}` : ''] },
    };
  }

  // Tagesrennen (heute oder Archiv-Tag)
  m = path.match(/^\/seed-runners\/daily(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  if (m) {
    const today = safe(sources.todayKey);
    const dateKey = m[1] || today;
    if (!dateKey || !DATE_RE.test(dateKey)) return null;
    const board = safe(sources.dailyBoard, dateKey);
    const archiv = !!m[1] && m[1] !== today;
    const top = board?.entries?.[0];
    const total = board?.total || 0;
    const stand = total > 0
      ? `${total} ${total === 1 ? 'bestätigter Lauf' : 'bestätigte Läufe'}, Bestzeit ${formatTicks(top.ticks)} von ${top.name}.`
      : (archiv ? 'An diesem Tag hat niemand eine Zeit eingetragen.' : 'Noch keine Zeit eingetragen — die erste gehört dir.');
    return {
      path, section: 'seed',
      title: archiv ? `Tagesrennen vom ${germanDate(dateKey)} — Seed Runners` : `Tagesrennen ${germanDate(dateKey)} — Seed Runners`,
      description: `${archiv ? 'Ein vergangenes Tagesrennen' : 'Jeden Tag ein festes Level für alle'}. ${stand} Schlägst du die Zeit?`,
      image: { kind: 'daily', key: dateKey }, noindex: archiv,
      card: {
        stat: total > 0 ? { value: String(total), label: total === 1 ? 'Lauf' : 'Läufe' } : null,
        lines: [total > 0 ? 'Schlägst du die Zeit?' : stand],
        table: (board?.entries || []).slice(0, 3).map((e) => ({ rank: e.rank, name: e.name, value: formatTicks(e.ticks) })),
      },
    };
  }

  // Level-Ersteller
  m = path.match(/^\/seed-runners\/levels\/creator\/([A-Za-z0-9_-]{1,40})$/);
  if (m) {
    const c = safe(sources.creator, m[1]);
    if (!c) return null;
    return {
      path, section: 'seed', title: `${clip(c.name, 60)} — Level-Ersteller — Seed Runners`,
      description: `Alle Seed-Runners-Level von ${clip(c.name, 60)}: im Browser spielen, mit Bestenliste und Geistern.`,
      image: { kind: 'page', key: '/seed-runners/levels' },
    };
  }

  // Level
  m = path.match(/^\/seed-runners\/levels\/([A-Za-z0-9-]{3,20})$/);
  if (m) {
    const l = safe(sources.level, m[1]);
    if (!l) return null;
    const parts = [
      `von ${clip(l.creator?.name, 40) || 'Unbekannt'}`,
      DIFFICULTY[l.difficulty] || '',
      l.players > 0 ? `${l.players} Spieler, ${Math.round((l.clearRate || 0) * 100)}\u00a0% geschafft` : 'noch ungespielt',
      l.rating?.count > 0 ? `${l.rating.avg.toFixed(1).replace('.', ',')} von 5 Sternen` : '',
    ].filter(Boolean);
    return {
      path, section: 'seed', title: `${clip(l.name, 70)} — Seed Runners-Level`,
      description: [parts.join(' · '), clip(l.description, 140)].filter(Boolean).join(' — '),
      image: { kind: 'level', key: l.code },
      card: {
        stat: Number.isFinite(l.creatorTicks) ? { value: formatTicks(l.creatorTicks), label: 'Ersteller-Zeit' } : null,
        lines: [parts.join(' · ')],
        level: l.preview ? { preview: l.preview, biome: l.biome } : null,
      },
    };
  }

  // Öffentliches Profil (nur wenn eingeschaltet — sonst Standard-Vorschau)
  m = path.match(/^\/u\/([A-Za-z0-9_]{2,25})$/);
  if (m) {
    const p = safe(sources.profile, m[1].toLowerCase());
    if (!p) return null;
    const s = p.sections || {};
    const parts = [];
    if (s.winTracker) {
      const w = s.winTracker;
      parts.push(w.trackMode !== 'trophies' && w.leagueNumber > 0 ? (w.leagueNumber === 7 ? 'Ultimate Champion' : `Liga ${w.leagueNumber}`) : `${w.trophies} Trophäen`);
      if (w.last30 && w.last30.wins + w.last30.losses > 0) parts.push(`${w.last30.wins}–${w.last30.losses} in 30 Tagen`);
    }
    const tWins = (s.tournaments || []).filter((t) => t.champion).length;
    if (tWins) parts.push(`${tWins} ${tWins === 1 ? 'Turniersieg' : 'Turniersiege'}`);
    else if (s.tournaments?.length) parts.push(`${s.tournaments.length} ${s.tournaments.length === 1 ? 'Turnier' : 'Turniere'}`);
    if (s.seedRunners) parts.push(`${s.seedRunners.levels} Seed-Runners-Level`);
    if (s.adventure) parts.push(`adVentures Stufe ${s.adventure.level}`);
    if (s.garden) parts.push(`Farm Stufe ${s.garden.level}`);
    const name = clip(p.displayName || p.login, 40);
    return {
      path, section: s.winTracker || s.tournaments ? 'cr' : 'site', title: `${name} — Profil`,
      description: parts.length ? `${parts.join(' · ')}. Das ganze Profil auf vnmvalentin.de.` : `Das Profil von ${name} auf vnmvalentin.de.`,
      image: { kind: 'profile', key: p.login },
      card: { lines: [parts.slice(0, 3).join(' · ') || 'Profil auf vnmvalentin.de'] },
    };
  }

  // Clash-Royale-Stats: Spieler (Name aus dem Namens-Index, sonst nur der Tag), Clan, Karte
  m = path.match(/^\/clash\/(spieler|clan)\/([0289PYLQGRJCUVpylqgrjcuv]{3,12})$/);
  if (m) {
    const tag = m[2].toUpperCase();
    if (m[1] === 'clan') {
      return {
        path, section: 'cr', title: `Clan #${tag} — Clash Royale`, description: 'Mitglieder mit Aktivität, laufender Clankrieg und die letzten Kriege.',
        image: { kind: 'page', key: '/clash/spieler' },
      };
    }
    const p = safe(sources.scoutPlayer, tag);
    const name = clip(p?.name, 40);
    const facts = [p?.trophies > 0 ? `${Number(p.trophies).toLocaleString('de-DE')} Trophäen` : '', clip(p?.clan, 40)].filter(Boolean).join(' · ');
    return {
      path, section: 'cr', title: name ? `${name} (#${tag}) — Clash Royale Stats` : `Spieler #${tag} — Clash Royale Stats`,
      description: `${facts ? `${facts}. ` : ''}Ranked-Deck, Kämpfe, Sammlung und Abzeichen.`,
      image: { kind: 'page', key: '/clash/spieler' },
    };
  }
  m = path.match(/^\/clash\/karten\/([a-z0-9-]{2,40})$/);
  if (m) {
    const c = safe(sources.card, m[1]);
    if (!c) return null;
    return {
      path, section: 'cr', title: `${clip(c.name, 40)} — Clash Royale Karte`, description: `${clip(c.name, 40)}: Kampfwerte, Nutzung und Siegquote bei den besten Spielern und die Decks, in denen sie steckt.`,
      image: { kind: 'page', key: '/clash/karten' },
    };
  }

  // Einladungen in Räume
  for (const r of ROOM_PATTERNS) {
    const rm = path.match(r.re);
    if (!rm) continue;
    if (r.section === 'seed' && SEED_RESERVED.has(rm[1].toLowerCase())) continue;
    return {
      path, section: r.section, title: `Einladung: ${r.game}`, description: r.text,
      image: { kind: 'invite', key: r.game }, noindex: true, shot: r.shot,
      card: { kicker: 'Einladung', title: r.game, lines: [r.invite] },
    };
  }

  return null;
}

module.exports = { resolveMeta, cleanPath, formatTicks, SECTIONS, STATIC_PAGES, SITE };
