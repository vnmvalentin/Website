// twitchExtension/jwt.js — Prüfen (und für Tests: Ausstellen) der Tokens, die Twitch einer Erweiterung mitgibt
// (Ausbauplan „twitch-erweiterung“).
//
// Twitch signiert das Token im Browser des Zuschauers mit dem Geheimnis der Erweiterung (HS256). Das Geheimnis steht
// in der Entwicklerkonsole Base64-kodiert — es muss vor dem Prüfen dekodiert werden (häufigster Fehler: als Text
// benutzt → jede Anfrage 401). Ohne Paket: HS256 ist eine HMAC-SHA256 über „Kopf.Inhalt“.
//
// Inhalt (Twitch): channel_id (Kanal, auf dem die Erweiterung läuft), role (broadcaster | moderator | viewer |
// external), opaque_user_id, user_id nur mit Freigabe des Zuschauers, exp (Sekunden).
'use strict';

const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * @param {string} token          das Token aus Twitch.ext.onAuthorized (auth.token)
 * @param {string} secretBase64   Geheimnis der Erweiterung, wie in der Konsole (Base64)
 * @param {number} [now]          ms
 * @returns {object|null} Inhalt des Tokens, oder null (falsch signiert, abgelaufen, kaputt, ohne Kanal)
 */
function verifyExtensionJwt(token, secretBase64, now = Date.now()) {
  if (typeof token !== 'string' || !secretBase64) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
  // Nur HS256 — „none“ oder andere Verfahren nie annehmen
  if (!header || header.alg !== 'HS256' || !payload || typeof payload !== 'object') return null;
  const expected = crypto.createHmac('sha256', Buffer.from(secretBase64, 'base64')).update(`${parts[0]}.${parts[1]}`).digest();
  const given = fromB64url(parts[2]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  if (!/^\d{1,20}$/.test(String(payload.channel_id || ''))) return null;
  return payload;
}

/** Token ausstellen — nur für Tests und den Prüfstand (Twitch stellt die echten selbst aus). */
function signExtensionJwt(payload, secretBase64) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', Buffer.from(secretBase64, 'base64')).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64url(sig)}`;
}

module.exports = { verifyExtensionJwt, signExtensionJwt };
