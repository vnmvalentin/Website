// giveaways/dienst.js — Ablauf der Giveaways: mitmachen (Website, Chat, Discord), Bedingungen prüfen, ziehen,
// neu ziehen, Gewinner benachrichtigen, Anwesenheit im Stream zählen.
//
// Alles Äußere (Twitch, Discord, Konten, Chat, Mitteilungen) kommt als Abhängigkeit herein — die echten baut
// echteAbhaengigkeiten() unten, Tests geben Attrappen. Der Chat-Bot (lib/winchallengeIrc.js) und der Discord-Knopf
// erreichen den laufenden Dienst über aktiv().
'use strict';

const { nanoid } = require('nanoid');
const core = require('./core');
const { texte } = require('./texte');

/** Wie lange ein Prüfergebnis gilt. Ein Nein kürzer, damit „jetzt folgen, gleich nochmal“ klappt. */
const CACHE_JA_MS = 10 * 60 * 1000;
const CACHE_NEIN_MS = 45 * 1000;
const LIVE_CHECK_MS = 60 * 1000;
const CHATTERS_MS = 5 * 60 * 1000;
const BROADCAST_GAP_MS = 1000;
const DISCORD_EDIT_GAP_MS = 20 * 1000;
const CHAT_BATCH_MS = 12 * 1000;
/** Bei der Ziehung höchstens so viele Gezogene nachprüfen (Twitch-Abfragen), danach ohne Nachprüfung. */
const MAX_RECHECKS = 60;

let aktiverDienst = null;
const aktiv = () => aktiverDienst;

/**
 * @param {object} deps
 * @param {ReturnType<import('./store').createGiveawayStore>} deps.store
 * @param {{ folgt(twitchId): Promise<boolean|null>, liveStream(): Promise<{key,startedAt}|null>,
 *           chatters(): Promise<Array<{id,login,name}>|null>, kanalLogin(): string|null, status(): object }} deps.twitch
 * @param {{ istMitglied(guildId, discordId): Promise<boolean|null>, poste(channelId, nachricht): Promise<{channelId,messageId}|null>,
 *           bearbeite(ref, nachricht): Promise<void>, entferne(ref): Promise<void>, dm(discordId, text): Promise<void>,
 *           bereit(): boolean, server(): Array, sprache(guildId): string }} [deps.discord]
 * @param {{ discordVon(twitchId): string|null, twitchVon(discordId): string|null }} [deps.links]
 * @param {{ kontoVonTwitch(twitchId): string|null }} [deps.konten]
 * @param {(nachricht) => Promise} [deps.melde]          lib/mitteilungen.js meldeMitteilung
 * @param {(login, text) => void} [deps.say]             Chat-Zeile über den Bot
 * @param {(text) => Promise} [deps.webhook]             alter Discord-Webhook (DISCORD_GIVEAWAY_WEBHOOK_URL)
 * @param {(payload) => void} [deps.sende]               Live-Stand an die offene Giveaway-Seite (Socket)
 * @param {(post) => object} [deps.discordNachricht]     baut die Discord-Nachricht (discordPost.js)
 * @param {() => number} [deps.now]
 * @param {string} [deps.frontendUrl]
 */
function createGiveawayDienst(deps) {
  const store = deps.store;
  const now = deps.now || Date.now;
  const twitch = deps.twitch;
  const discord = deps.discord || null;
  const links = deps.links || { discordVon: () => null, twitchVon: () => null };
  const konten = deps.konten || { kontoVonTwitch: () => null };
  const melde = deps.melde || (async () => null);
  const say = deps.say || (() => {});
  const webhook = deps.webhook || (async () => {});
  const sende = deps.sende || (() => {});
  const frontendUrl = String(deps.frontendUrl || '').replace(/\/+$/, '');
  const seitenUrl = `${frontendUrl}/Giveaways`;

  const cache = new Map(); // `${art}:${id}` -> { wert, bis }
  const live = { stream: null, gecheckt: 0, chatters: 0 };
  const gesehen = new Set(); // `${streamKey}:${twitchId}` — Anwesenheit nur einmal je Stream schreiben
  let sendeTimer = null;
  const discordDirty = new Map(); // giveawayId -> zuletzt bearbeitet
  const chatSammel = { namen: [], timer: null, stichwort: core.DEFAULT_STICHWORT };
  const chatGrundGesagt = new Set(); // `${giveawayId}:${twitchId}`

  const einstellungen = () => store.holeSetting('discord') || { guildId: '', channelId: '' };
  const sprache = () => {
    const { guildId } = einstellungen();
    try { return discord && guildId ? discord.sprache(guildId) : 'de'; } catch { return 'de'; }
  };

  async function gemerkt(art, id, fn, frisch = false) {
    const k = `${art}:${id}`;
    const hit = cache.get(k);
    if (!frisch && hit && hit.bis > now()) return hit.wert;
    let wert = null;
    try { wert = await fn(); } catch { wert = null; }
    if (wert !== null) cache.set(k, { wert, bis: now() + (wert ? CACHE_JA_MS : CACHE_NEIN_MS) });
    return wert;
  }

  /**
   * Fakten für die Bedingungen einer Person sammeln — nur die, die das Giveaway braucht.
   * frisch: am Zwischenspeicher vorbei (Nachprüfung bei der Ziehung — wer eben entfolgt ist, soll nicht gewinnen)
   */
  async function fakten(g, person, frisch = false) {
    const twitchId = person.twitchId || (person.discordId ? links.twitchVon(person.discordId) : null) || null;
    const discordId = person.discordId || (twitchId ? links.discordVon(twitchId) : null) || null;
    const f = { twitchId, discordId, follow: null, discordMember: null, streams: null };
    const brauche = core.aktiveBedingungen(g);
    if (brauche.includes('follow') && twitchId) {
      f.follow = String(twitchId) === String(deps.operatorId || '')
        ? true
        : await gemerkt('follow', twitchId, () => twitch.folgt(twitchId), frisch);
    }
    if (brauche.includes('discord') && discordId) {
      const { guildId } = einstellungen();
      f.discordMember = guildId && discord
        ? await gemerkt('discord', discordId, () => discord.istMitglied(guildId, discordId), frisch)
        : null;
    }
    if (brauche.includes('streams') && twitchId) f.streams = store.streamsVon(twitchId, now() - core.STREAM_WINDOW_MS);
    return f;
  }

  /** Wie steht diese Person zu den Bedingungen? (Website: Anzeige vor dem Mitmachen) */
  async function pruefe(id, person) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    const f = await fakten(g, person);
    const key = core.teilnehmerKey(f);
    return { ...core.bewerte(g, f), dabei: !!(key && store.teilnehmerEiner(g.id, key)) };
  }

  /* ── Live-Stand an die Seite ─────────────────────────────────────────────── */

  function oeffentlich() {
    const t = now();
    const list = store.alle().map((g) => core.publicView(g, { count: store.anzahl(g.id), now: t }));
    return { active: list.filter((g) => g.zustand !== 'gezogen'), expired: list.filter((g) => g.zustand === 'gezogen') };
  }

  function geaendert(giveawayId) {
    if (giveawayId) discordDirty.set(giveawayId, discordDirty.get(giveawayId) || 0);
    if (sendeTimer) return;
    sendeTimer = setTimeout(() => {
      sendeTimer = null;
      try { sende(oeffentlich()); } catch (e) { console.warn('[giveaways] Live-Stand:', e.message); }
    }, BROADCAST_GAP_MS);
    if (typeof sendeTimer.unref === 'function') sendeTimer.unref();
  }

  /* ── Mitmachen ───────────────────────────────────────────────────────────── */

  /**
   * @param {{ twitchId?, discordId?, name, avatar? }} person
   * @param {'website'|'chat'|'discord'} via
   * @returns {Promise<{ ok: true, neu: boolean } | { error: string, ergebnisse?: object[] }>}
   */
  async function mitmachen(id, person, via) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    if (core.zustand(g, now()) !== 'offen') return { error: 'closed' };
    if (!g.wege[via]) return { error: 'way_closed' };
    const f = await fakten(g, person);
    const key = core.teilnehmerKey(f);
    if (!key) return { error: 'not_found' };
    if (store.teilnehmerEiner(g.id, key)) return { ok: true, neu: false, title: g.title };
    const urteil = core.bewerte(g, f);
    if (!urteil.ok) return { error: 'conditions', ergebnisse: urteil.ergebnisse };
    const neu = store.trageEin({
      giveawayId: g.id, key, twitchId: f.twitchId, discordId: f.discordId, name: person.name, avatar: person.avatar, via, joinedAt: now(),
    });
    if (neu) geaendert(g.id);
    return { ok: true, neu, title: g.title };
  }

  /** Austragen geht nur, solange das Giveaway offen ist. */
  function austragen(id, twitchId) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    if (core.zustand(g, now()) !== 'offen') return { error: 'closed' };
    const weg = store.trageAus(g.id, `t:${twitchId}`);
    if (weg) geaendert(g.id);
    return { ok: true };
  }

  /* ── Anlegen, löschen ───────────────────────────────────────────────────── */

  async function anlegen(body, createdBy) {
    const res = core.pruefeEingabe(body, now());
    if (res.error) return res;
    const g = core.normalize({ ...res.giveaway, id: nanoid(10), createdAt: now(), createdBy: String(createdBy || '') });
    if (g.wege.discord && !einstellungen().channelId) g.wege.discord = false;
    store.speichere(g);
    await postDiscord(g);
    geaendert(g.id);
    return { ok: true, giveaway: core.publicView(store.hole(g.id), { count: 0, now: now() }) };
  }

  async function loeschen(id) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    store.loesche(g.id);
    if (g.discordMessage && discord) await discord.entferne(g.discordMessage).catch(() => {});
    discordDirty.delete(g.id);
    geaendert();
    return { ok: true };
  }

  /* ── Ziehen ──────────────────────────────────────────────────────────────── */

  /** Gezogene nachprüfen: wer inzwischen nicht mehr passt, fällt raus. Was sich nicht prüfen lässt, zählt (hat beim Mitmachen ja gepasst). */
  async function passtNoch(g, row) {
    if (!core.aktiveBedingungen(g).length) return true;
    const f = await fakten(g, { twitchId: row.twitch_id || null, discordId: row.discord_id || null }, true);
    const urteil = core.bewerte(g, f);
    return urteil.ergebnisse.every((e) => e.ok || e.grund === 'check_unavailable');
  }

  async function waehle(g, anzahl, ausschluss) {
    const rows = store.teilnehmer(g.id).filter((r) => !ausschluss.has(r.key));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const gewinner = [];
    let geprueft = 0;
    for (const key of core.mische(rows.map((r) => r.key))) {
      if (gewinner.length >= anzahl) break;
      const row = byKey.get(key);
      const ok = geprueft < MAX_RECHECKS ? await passtNoch(g, row) : true;
      geprueft += 1;
      if (!ok) continue;
      gewinner.push({
        key, name: row.name || key, avatar: row.avatar || null, twitchId: row.twitch_id || null,
        discordId: row.discord_id || null, via: row.via, at: now(),
      });
    }
    return gewinner;
  }

  /**
   * Ziehung. Vor dem Ende (Knopf im Stream) schließt sie das Giveaway sofort.
   * @returns {Promise<{ ok: true, winners } | { error }>}
   */
  async function ziehe(id) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    if (g.drawnAt) return { error: 'already_drawn' };
    const t = now();
    if (g.endDate > t) g.endDate = t;
    const gewinner = await waehle(g, g.quantity, new Set());
    // Zwischen dem Lesen und hier kann jemand gelöscht haben
    if (!store.hole(g.id)) return { error: 'not_found' };
    g.winners = gewinner;
    g.drawnAt = now();
    g.showAt = g.drawnAt;
    g.showKeys = gewinner.map((w) => w.key);
    store.speichere(g);
    geaendert(g.id);
    await benachrichtige(g, gewinner, false);
    return { ok: true, winners: core.publicView(g).winners };
  }

  /** Einen Gewinner ersetzen (meldet sich nicht, passt nicht mehr). */
  async function zieheNeu(id, index) {
    const g = store.hole(id);
    if (!g) return { error: 'not_found' };
    if (!g.drawnAt) return { error: 'not_drawn' };
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= g.winners.length) return { error: 'not_found' };
    const ausschluss = new Set([...g.winners.map((w) => w.key), ...g.ersetzt]);
    const [neu] = await waehle(g, 1, ausschluss);
    if (!neu) return { error: 'no_candidates' };
    g.ersetzt = [...g.ersetzt, g.winners[i].key];
    g.winners = g.winners.map((w, j) => (j === i ? neu : w));
    g.showAt = now();
    g.showKeys = [neu.key];
    store.speichere(g);
    geaendert(g.id);
    await benachrichtige(g, [neu], true);
    return { ok: true, winners: core.publicView(g).winners };
  }

  async function benachrichtige(g, gewinner, nachgezogen) {
    const t = texte(sprache());
    const tChat = texte('de');
    const namen = gewinner.map((w) => w.name).join(', ');
    if (gewinner.length) {
      // Twitch-Chat: Gewinner mit @, damit sie es mitbekommen
      const login = twitch.kanalLogin();
      if (login) {
        const at = gewinner.map((w) => (w.twitchId ? `@${w.name}` : w.name)).join(', ');
        try { say(login, nachgezogen ? tChat.chatNeu(g.title, at) : tChat.chatGewinner(g.title, at)); } catch { /* Chat ist Zugabe */ }
      }
      await webhook(t.webhook(g.title, g.prize, namen)).catch(() => {});
    }
    for (const w of gewinner) {
      const discordId = w.discordId || (w.twitchId ? links.discordVon(w.twitchId) : null);
      if (discordId && discord) await discord.dm(discordId, t.dm(g.title, g.prize, seitenUrl)).catch(() => {});
      const kontoId = w.twitchId ? konten.kontoVonTwitch(w.twitchId) : null;
      if (kontoId) {
        await melde({
          thema: 'giveaways',
          konten: [kontoId],
          titel: { de: texte('de').pushTitel, en: texte('en').pushTitel },
          text: { de: texte('de').pushText(g.title, g.prize), en: texte('en').pushText(g.title, g.prize) },
          url: '/Giveaways',
          tag: `giveaway-${g.id}`,
        });
      }
    }
    await bearbeiteDiscord(g, true);
  }

  /* ── Discord-Beitrag ─────────────────────────────────────────────────────── */

  function discordPostDaten(g) {
    return { giveaway: core.publicView(g, { count: store.anzahl(g.id), now: now() }), url: seitenUrl, lang: sprache() };
  }

  async function postDiscord(g) {
    const { channelId } = einstellungen();
    if (!g.wege.discord || !channelId || !discord || !discord.bereit() || !deps.discordNachricht) return;
    try {
      const ref = await discord.poste(channelId, deps.discordNachricht(discordPostDaten(g)));
      if (ref) {
        g.discordMessage = ref;
        store.speichere(g);
      }
    } catch (e) {
      console.warn('[giveaways] Discord-Beitrag:', e.message);
    }
  }

  async function bearbeiteDiscord(g, sofort = false) {
    if (!g.discordMessage || !discord || !discord.bereit() || !deps.discordNachricht) return;
    const zuletzt = discordDirty.get(g.id) || 0;
    if (!sofort && now() - zuletzt < DISCORD_EDIT_GAP_MS) return;
    discordDirty.delete(g.id);
    try {
      await discord.bearbeite(g.discordMessage, deps.discordNachricht(discordPostDaten(store.hole(g.id) || g)));
    } catch (e) {
      console.warn('[giveaways] Discord-Beitrag bearbeiten:', e.message);
    }
    if (!sofort) discordDirty.set(g.id, now());
  }

  /* ── Chat ────────────────────────────────────────────────────────────────── */

  /** Kanal, in dem der Bot für die Giveaways mitliest (Stichwort, Anwesenheit). */
  function kanaele() {
    const login = twitch.kanalLogin();
    return login ? [login] : [];
  }

  function merkeAnwesend(twitchId) {
    const s = live.stream;
    if (!s || !twitchId) return;
    const k = `${s.key}:${twitchId}`;
    if (gesehen.has(k)) return;
    gesehen.add(k);
    store.merkeAnwesend(twitchId, s.key, s.startedAt);
  }

  function sammleChatName(name, stichwort) {
    chatSammel.namen.push(name);
    chatSammel.stichwort = stichwort;
    if (chatSammel.timer) return;
    chatSammel.timer = setTimeout(() => {
      chatSammel.timer = null;
      const namen = chatSammel.namen.splice(0);
      const login = twitch.kanalLogin();
      if (!namen.length || !login) return;
      const zeige = namen.slice(0, 5).join(', ');
      try { say(login, texte('de').chatDabei(zeige, namen.length - 5, chatSammel.stichwort)); } catch { /* Chat ist Zugabe */ }
    }, deps.chatBatchMs ?? CHAT_BATCH_MS);
    if (typeof chatSammel.timer.unref === 'function') chatSammel.timer.unref();
  }

  /**
   * Jede Chatzeile im eigenen Kanal (lib/winchallengeIrc.js). Fremde Kanäle sind nach einem Vergleich wieder draußen.
   * @returns {Promise<void>}
   */
  async function onChatMessage(channel, tags, message) {
    const login = twitch.kanalLogin();
    if (!login) return;
    const ch = String(channel || '').replace(/^#/, '').toLowerCase();
    if (ch !== login) return;
    const twitchId = tags && tags['user-id'] ? String(tags['user-id']) : null;
    merkeAnwesend(twitchId);
    const stichwort = core.chatStichwort(message);
    if (!stichwort || !twitchId) return;
    const t = now();
    const passend = store.alle().filter((g) => g.wege.chat && g.stichwort === stichwort && core.zustand(g, t) === 'offen');
    const name = String((tags && (tags['display-name'] || tags.username)) || twitchId);
    for (const g of passend) {
      const res = await mitmachen(g.id, { twitchId, name }, 'chat');
      if (res.ok && res.neu) sammleChatName(name, stichwort);
      else if (res.error === 'conditions') {
        // Jeder bekommt den Grund nur einmal je Giveaway — sonst ließe sich der Bot zum Spammen bringen
        const k = `${g.id}:${twitchId}`;
        if (chatGrundGesagt.has(k)) continue;
        chatGrundGesagt.add(k);
        const e = res.ergebnisse.find((x) => !x.ok);
        const grund = texte('de').chatGrund[e.grund];
        const satz = typeof grund === 'function' ? grund(e.wert || 0, e.noetig || 0) : grund;
        try { say(login, `@${name} ${satz}`); } catch { /* Chat ist Zugabe */ }
      }
    }
  }

  /* ── Takt: automatische Ziehung, Anwesenheit, Discord ─────────────────────── */

  let laeuft = false;
  async function takt() {
    if (laeuft) return;
    laeuft = true;
    try {
      const t = now();
      for (const g of store.alle()) {
        if (!g.drawnAt && g.ziehung === 'auto' && g.endDate <= t) await ziehe(g.id).catch((e) => console.error('[giveaways] Ziehung:', e.message));
        else if (discordDirty.has(g.id) && !g.drawnAt) await bearbeiteDiscord(g);
      }
      if (t - live.gecheckt >= LIVE_CHECK_MS) {
        live.gecheckt = t;
        const s = await twitch.liveStream().catch(() => null);
        if (s && s.key) {
          if (!live.stream || live.stream.key !== s.key) {
            live.stream = s;
            live.chatters = 0;
            gesehen.clear();
            store.merkeStream(s.key, s.startedAt);
            store.raeumeAuf(t);
          }
        } else if (s === null) {
          live.stream = null;
        }
      }
      if (live.stream && t - live.chatters >= CHATTERS_MS) {
        live.chatters = t;
        const leute = await twitch.chatters().catch(() => null);
        for (const p of leute || []) merkeAnwesend(p.id);
      }
    } finally {
      laeuft = false;
    }
  }

  /* ── Bühne (OBS-Overlay) ─────────────────────────────────────────────────── */

  /** Was das Overlay zeigt: das laufende Giveaway als kleine Karte und kurz nach einer Ziehung den großen Moment. */
  function buehne() {
    const t = now();
    const alle = store.alle();
    const shown = alle.filter((g) => g.showAt && t - g.showAt < core.SHOW_MS).sort((a, b) => b.showAt - a.showAt)[0] || null;
    const laufend = alle
      .filter((g) => core.zustand(g, t) !== 'gezogen')
      .sort((a, b) => a.endDate - b.endDate)[0] || null;
    return {
      laufend: laufend ? { ...core.publicView(laufend, { count: store.anzahl(laufend.id), now: t }), winners: [] } : null,
      show: shown ? {
        id: shown.id,
        title: shown.title,
        prize: shown.prize,
        at: shown.showAt,
        gewinner: shown.winners.filter((w) => (shown.showKeys || []).includes(w.key)).map((w) => ({ name: w.name, avatar: w.avatar || null })),
        namen: store.letzteNamen(shown.id, 40),
        count: store.anzahl(shown.id),
      } : null,
      serverNow: t,
    };
  }

  /* ── Einstellungen und Status (nur Betreiber) ───────────────────────────── */

  function setzeDiscord({ guildId, channelId }) {
    const server = discord ? discord.server() : [];
    if (!guildId && !channelId) {
      store.setzeSetting('discord', { guildId: '', channelId: '' });
      return { ok: true };
    }
    const guild = server.find((s) => s.id === String(guildId));
    if (!guild) return { error: 'bad_channel' };
    if (channelId && !guild.channels.some((c) => c.id === String(channelId))) return { error: 'bad_channel' };
    store.setzeSetting('discord', { guildId: guild.id, channelId: channelId ? String(channelId) : '' });
    return { ok: true };
  }

  function status() {
    const tw = twitch.status ? twitch.status() : {};
    return {
      twitch: tw,
      streams: { gezaehlt: store.streamsGesamt(now() - core.STREAM_WINDOW_MS), live: !!live.stream },
      discord: { bereit: !!(discord && discord.bereit()), ...einstellungen() },
      server: discord ? discord.server() : [],
    };
  }

  const dienst = {
    pruefe, mitmachen, austragen, anlegen, loeschen, ziehe, zieheNeu, oeffentlich, buehne, takt, onChatMessage, kanaele,
    setzeDiscord, status, einstellungen,
    /** IDs der Giveaways, bei denen diese Twitch-ID dabei ist. */
    meine: (twitchId) => store.giveawaysVon(twitchId),
    /** Nur für Tests: aktuellen Stream setzen. */
    _setzeLive: (s) => { live.stream = s; if (s) store.merkeStream(s.key, s.startedAt); },
  };
  return dienst;
}

/** Laufenden Dienst für Chat-Bot und Discord-Knopf setzen (routes.js). */
function setzeAktiv(dienst) {
  aktiverDienst = dienst;
}

/* ── Echte Abhängigkeiten ─────────────────────────────────────────────────── */

/**
 * Twitch über den Zugang des Kanals aus den Twitch-Overlays (stream_tool_settings des Betreibers): Folgen prüfen
 * braucht moderator:read:followers, die Zuschauerliste moderator:read:chatters — beides fragt der Editor dort an.
 */
function echteTwitch(operatorId) {
  const { db, decryptToken } = require('../streamTool/lib/streamToolStore');
  const { helix } = require('../streamTool/lib/twitchHelix');
  const rowOf = db.prepare('SELECT user_id, twitch_login, token_enc, scopes FROM stream_tool_settings WHERE user_id = ?');
  const zugang = () => {
    const row = operatorId ? rowOf.get(String(operatorId)) : null;
    if (!row) return null;
    const token = decryptToken(row.token_enc);
    return { row, token, scopes: String(row.scopes || '').split(' ').filter(Boolean) };
  };
  const hat = (z, scope) => !!z && z.scopes.includes(scope);
  // Der Chat-Bot fragt bei JEDER Chatzeile aller Kanäle — deshalb eine Minute zwischengespeichert
  let login = { wert: null, bis: 0 };
  return {
    kanalLogin: () => {
      if (Date.now() < login.bis) return login.wert;
      const z = zugang();
      login = { wert: z && z.row.twitch_login ? String(z.row.twitch_login).toLowerCase() : null, bis: Date.now() + 60 * 1000 };
      return login.wert;
    },
    async folgt(twitchId) {
      const z = zugang();
      if (!z || !z.token || !hat(z, 'moderator:read:followers')) return null;
      const d = await helix(`channels/followers?broadcaster_id=${encodeURIComponent(operatorId)}&user_id=${encodeURIComponent(twitchId)}`, z.token);
      return Array.isArray(d && d.data) ? d.data.length > 0 : null;
    },
    async liveStream() {
      const z = zugang();
      if (!z || !z.token) return undefined; // unbekannt: Stand nicht verwerfen
      const d = await helix(`streams?user_id=${encodeURIComponent(operatorId)}`, z.token);
      const s = Array.isArray(d && d.data) ? d.data[0] : null;
      if (!s || s.type !== 'live') return null;
      return { key: String(s.started_at || s.id), startedAt: Date.parse(s.started_at) || Date.now() };
    },
    async chatters() {
      const z = zugang();
      if (!z || !z.token || !hat(z, 'moderator:read:chatters')) return null;
      const out = [];
      let cursor = '';
      for (let i = 0; i < 10; i++) {
        const d = await helix(`chat/chatters?broadcaster_id=${operatorId}&moderator_id=${operatorId}&first=1000${cursor ? `&after=${cursor}` : ''}`, z.token);
        for (const c of (d && d.data) || []) out.push({ id: c.user_id, login: c.user_login, name: c.user_name });
        cursor = d && d.pagination && d.pagination.cursor;
        if (!cursor) break;
      }
      return out;
    },
    status() {
      const z = zugang();
      let irc = { configured: false, connected: false, joined: [] };
      try { irc = require('../lib/winchallengeIrc').getIrcStatus(); } catch { /* Bot optional */ }
      const login = z && z.row.twitch_login ? String(z.row.twitch_login).toLowerCase() : '';
      return {
        verbunden: !!(z && z.token),
        kanal: login,
        follow: hat(z, 'moderator:read:followers'),
        chatters: hat(z, 'moderator:read:chatters'),
        bot: !!irc.connected,
        botImKanal: !!login && (irc.joined || []).includes(login),
      };
    },
  };
}

function echterDiscord(client) {
  if (!client) return null;
  const textKanal = (c) => c && typeof c.isTextBased === 'function' && c.isTextBased() && !c.isThread() && !c.isVoiceBased();
  return {
    bereit: () => typeof client.isReady === 'function' && client.isReady(),
    server: () => (client.guilds ? [...client.guilds.cache.values()] : []).map((g) => ({
      id: g.id,
      name: g.name,
      channels: [...g.channels.cache.values()].filter(textKanal)
        .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
        .map((c) => ({ id: c.id, name: c.name })),
    })),
    sprache(guildId) {
      try {
        const { getSettings } = require('../discord/database/db');
        return getSettings(guildId)?.language === 'en' ? 'en' : 'de';
      } catch {
        return 'de';
      }
    },
    async istMitglied(guildId, discordId) {
      const guild = client.guilds.cache.get(String(guildId));
      if (!guild) return null;
      try {
        await guild.members.fetch(String(discordId));
        return true;
      } catch (e) {
        return e && (e.code === 10007 || e.code === 10013) ? false : null; // Unknown Member / Unknown User
      }
    },
    async poste(channelId, nachricht) {
      const ch = await client.channels.fetch(String(channelId));
      if (!textKanal(ch)) return null;
      const msg = await ch.send(nachricht);
      return { channelId: ch.id, messageId: msg.id };
    },
    async bearbeite(ref, nachricht) {
      const ch = await client.channels.fetch(ref.channelId);
      const msg = await ch.messages.fetch(ref.messageId);
      await msg.edit(nachricht);
    },
    async entferne(ref) {
      const ch = await client.channels.fetch(ref.channelId);
      const msg = await ch.messages.fetch(ref.messageId);
      await msg.delete();
    },
    async dm(discordId, text) {
      const user = await client.users.fetch(String(discordId));
      await user.send(text);
    },
  };
}

/**
 * @param {{ store, operatorId, discordClient?, kontoStore?, sende? }} opts
 */
function echteAbhaengigkeiten({ store, operatorId, discordClient, kontoStore, sende }) {
  const url = process.env.DISCORD_GIVEAWAY_WEBHOOK_URL || '';
  return {
    store,
    operatorId,
    twitch: echteTwitch(operatorId),
    discord: echterDiscord(discordClient),
    discordNachricht: (daten) => require('./discordPost').baueNachricht(daten),
    links: {
      discordVon: (twitchId) => {
        try { return require('../discord/linkStore').getLink(twitchId)?.userId || null; } catch { return null; }
      },
      twitchVon: (discordId) => {
        try { return require('../discord/linkStore').twitchIdOfDiscord(discordId); } catch { return null; }
      },
    },
    konten: { kontoVonTwitch: (twitchId) => (kontoStore ? kontoStore.kontoVonLink('twitch', String(twitchId)) : null) },
    melde: (n) => require('../lib/mitteilungen').meldeMitteilung(n),
    say: (login, text) => require('../lib/winchallengeIrc').say(login, text),
    webhook: async (content) => {
      if (!url) return;
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    },
    sende,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
}

module.exports = { createGiveawayDienst, echteAbhaengigkeiten, setzeAktiv, aktiv };
