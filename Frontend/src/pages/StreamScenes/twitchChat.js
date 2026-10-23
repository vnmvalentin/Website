// twitchChat.js — liest einen Twitch-Chat anonym mit (IRC über WebSocket, "justinfan").
//
// Kein Login, kein Token, keine Backend-Last: Twitch erlaubt anonymes Mitlesen jedes
// öffentlichen Chats. Moderation wird beachtet — gelöschte Nachrichten (CLEARMSG) und
// gebannte/getimeoutete Nutzer (CLEARCHAT) verschwinden auch aus der Einblendung.
import { useEffect, useRef, useState } from 'react';

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const FALLBACK_COLORS = ['#ff7f50', '#9acd32', '#1e90ff', '#ff69b4', '#daa520', '#5f9ea0', '#b388ff', '#00c4a7', '#ff4500'];

function parseTags(raw) {
  const tags = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    const key = i < 0 ? part : part.slice(0, i);
    const val = i < 0 ? '' : part.slice(i + 1);
    tags[key] = val.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
  }
  return tags;
}

/** Eine IRC-Zeile in { tags, prefix, command, params, trailing } zerlegen. */
function parseLine(line) {
  let rest = line;
  let tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  let trailing = '';
  const ti = rest.indexOf(' :');
  if (ti >= 0) {
    trailing = rest.slice(ti + 2);
    rest = rest.slice(0, ti);
  }
  const [command, ...params] = rest.split(' ');
  return { tags, prefix, command, params, trailing };
}

function colorFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

/**
 * Text in Teile zerlegen: { text } oder { emote: url, alt }.
 * Twitch zählt die Emote-Positionen in Unicode-Codepoints, nicht in UTF-16-Einheiten.
 */
function splitEmotes(text, emotesTag) {
  if (!emotesTag) return [{ text }];
  const chars = Array.from(text);
  const ranges = [];
  for (const group of emotesTag.split('/')) {
    const [id, pos] = group.split(':');
    if (!id || !pos) continue;
    for (const r of pos.split(',')) {
      const [a, b] = r.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) ranges.push({ id, a, b });
    }
  }
  ranges.sort((x, y) => x.a - y.a);
  const parts = [];
  let cur = 0;
  for (const { id, a, b } of ranges) {
    if (a < cur) continue;
    if (a > cur) parts.push({ text: chars.slice(cur, a).join('') });
    parts.push({
      emote: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`,
      alt: chars.slice(a, b + 1).join(''),
    });
    cur = b + 1;
  }
  if (cur < chars.length) parts.push({ text: chars.slice(cur).join('') });
  return parts;
}

// ── 7TV ──────────────────────────────────────────────────────────────────────
// Kanal-Set (über die Twitch-ID aus ROOMSTATE) + globales Set. Die API erlaubt CORS,
// es braucht also kein Backend. Schlägt etwas fehl, bleibt es einfach bei Text.
const SEVENTV_API = 'https://7tv.io/v3';

function sevenTvMap(emotes, map) {
  for (const e of emotes || []) {
    const host = e?.data?.host;
    if (!e?.name || !host?.url) continue;
    map.set(e.name, `https:${host.url}/2x.webp`);
  }
}

async function loadSevenTv(roomId) {
  const map = new Map();
  const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [global, user] = await Promise.all([
    get(`${SEVENTV_API}/emote-sets/global`),
    get(`${SEVENTV_API}/users/twitch/${encodeURIComponent(roomId)}`),
  ]);
  sevenTvMap(global?.emotes, map);
  sevenTvMap(user?.emote_set?.emotes, map);   // Kanal-Emotes überschreiben gleichnamige globale
  return map;
}

/** Wörter in Textteilen, die ein 7TV-Emote sind, durch Bilder ersetzen. */
function applyThirdParty(parts, map) {
  if (!map?.size) return parts;
  const out = [];
  for (const p of parts) {
    if (p.emote) { out.push(p); continue; }
    for (const token of p.text.split(/(\s+)/)) {
      if (!token) continue;
      const url = map.get(token);
      if (url) out.push({ emote: url, alt: token });
      else if (out.length && out[out.length - 1].text != null) out[out.length - 1].text += token;
      else out.push({ text: token });
    }
  }
  return out;
}

/** "broadcaster/1,subscriber/12" → Set(['broadcaster', 'subscriber']) */
function parseBadges(raw) {
  return new Set(String(raw || '').split(',').map((b) => b.split('/')[0]).filter(Boolean));
}

/**
 * Hook: die letzten `max` Chatnachrichten eines Kanals.
 * Nachricht: { id, userId, name, color, parts, action, at, role }
 * role: 'broadcaster' | 'mod' | 'vip' | 'sub' | null
 * onEvent (optional): { type: 'message', msg } | { type: 'delete', id } | { type: 'clear', userId }
 */
export function useTwitchChat(channel, { max = 30, enabled = true, onEvent } = {}) {
  const [messages, setMessages] = useState([]);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  useEffect(() => {
    const chan = String(channel || '').trim().toLowerCase().replace(/^#/, '');
    if (!enabled || !/^[a-z0-9_]{2,25}$/.test(chan)) return undefined;

    let ws = null;
    let closed = false;
    let retry = 0;
    let retryTimer = 0;
    let emoteMap = null;
    let emoteRoom = null;

    const push = (msg) => {
      setMessages((prev) => {
        const next = prev.length >= max ? prev.slice(prev.length - max + 1) : prev.slice();
        next.push(msg);
        return next;
      });
      eventRef.current?.({ type: 'message', msg });
    };

    const connect = () => {
      ws = new WebSocket(IRC_URL);
      ws.onopen = () => {
        retry = 0;
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
        ws.send(`JOIN #${chan}`);
      };
      ws.onmessage = (e) => {
        for (const line of String(e.data).split('\r\n')) {
          if (!line) continue;
          const m = parseLine(line);
          if (m.command === 'PING') { ws.send(`PONG :${m.trailing || 'tmi.twitch.tv'}`); continue; }
          if (m.command === 'PRIVMSG') {
            let text = m.trailing;
            let action = false;
            // /me-Nachrichten: \u0001ACTION …\u0001
            if (text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')) {
              text = text.slice(8, -1);
              action = true;
            }
            const login = m.prefix.split('!')[0];
            const name = m.tags['display-name'] || login;
            const badges = parseBadges(m.tags.badges);
            const role = badges.has('broadcaster') ? 'broadcaster'
              : badges.has('moderator') ? 'mod'
                : badges.has('vip') ? 'vip'
                  : (badges.has('subscriber') || badges.has('founder')) ? 'sub' : null;
            push({
              id: m.tags.id || `${Date.now()}-${Math.random()}`,
              userId: m.tags['user-id'] || login,
              name,
              color: m.tags.color || colorFor(login),
              parts: applyThirdParty(splitEmotes(text, m.tags.emotes), emoteMap),
              action,
              role,
              at: Date.now(),
            });
          } else if (m.command === 'ROOMSTATE') {
            const roomId = m.tags['room-id'];
            if (roomId && roomId !== emoteRoom) {
              emoteRoom = roomId;
              loadSevenTv(roomId).then((map) => { if (!closed) emoteMap = map; });
            }
          } else if (m.command === 'CLEARMSG') {
            const target = m.tags['target-msg-id'];
            if (target) {
              setMessages((prev) => prev.filter((x) => x.id !== target));
              eventRef.current?.({ type: 'delete', id: target });
            }
          } else if (m.command === 'CLEARCHAT') {
            const uid = m.tags['target-user-id'];
            setMessages((prev) => (uid ? prev.filter((x) => x.userId !== uid) : []));
            eventRef.current?.({ type: 'clear', userId: uid || null });
          } else if (m.command === 'RECONNECT') {
            ws.close();
          }
        }
      };
      ws.onclose = () => {
        if (closed) return;
        retry += 1;
        retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retry, 5)));
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [channel, max, enabled]);

  return messages;
}

/** Klartext einer Nachricht (für Canvas-Texturen, Emotes als Name). */
export function plainText(msg) {
  return msg.parts.map((p) => (p.text ?? p.alt)).join('');
}
