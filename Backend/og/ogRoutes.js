// og/ogRoutes.js — HTML und Vorschaubild für Vorschau-Bots (Discord, WhatsApp, Telegram, X …).
//
//   GET /api/og/page        die index.html der Website, aber mit Titel/Beschreibung/Bild der angefragten Adresse.
//                           nginx leitet NUR Bots hierher und NUR für Adressen ohne eigene Datei; die Adresse kommt als
//                           Header X-Original-URI ($request_uri). Normale Besucher sehen diese Route nie.
//   GET /api/og/image.png   ?u=<Pfad>&v=<Fassung> — das Bild dazu. v ändert sich mit dem Inhalt, weil Discord Bilder
//                           nach URL zwischenspeichert; ohne v bliebe die Teilnehmerzahl eines Turniers ewig stehen.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { resolveMeta, cleanPath, SECTIONS, SITE } = require('./ogMeta');

const DOMAIN = 'https://vnmvalentin.de';
const IMAGE_CACHE_MAX = 200;
const IMAGE_CACHE_MS = 10 * 60 * 1000;
const RENDERS_PER_MINUTE = 120;

// Wo die gebaute index.html liegt: auf dem Server im nginx-Wurzelverzeichnis, lokal im Frontend-Build
const INDEX_CANDIDATES = [
  process.env.OG_INDEX_HTML,
  '/var/www/mywebsite/dist/index.html',
  path.join(__dirname, '../../Frontend/dist/index.html'),
].filter(Boolean);

const escapeAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let indexCache = { file: null, mtime: 0, html: null };
function readIndex() {
  for (const file of INDEX_CANDIDATES) {
    try {
      const st = fs.statSync(file);
      if (indexCache.file === file && indexCache.mtime === st.mtimeMs) return indexCache.html;
      const html = fs.readFileSync(file, 'utf8');
      indexCache = { file, mtime: st.mtimeMs, html };
      return html;
    } catch { /* nächster Kandidat */ }
  }
  return null;
}

/** Fassung des Bildes: kurzer Hash über alles, was im Bild steht */
function versionOf(meta) {
  return crypto.createHash('sha1').update(JSON.stringify([meta.title, meta.description, meta.card || null])).digest('hex').slice(0, 10);
}

const imageUrl = (meta) => `${DOMAIN}/api/og/image.png?u=${encodeURIComponent(meta.path)}&v=${versionOf(meta)}`;

// Kopf-Tags, die ersetzt werden: Titel, Beschreibung, Canonical, Robots, Theme-Farbe, alle og:/twitter:-Angaben.
// Die vorgerenderte Startseite bringt sie mit (und die Platzhalter mit data-default).
const STRIP = [
  /<title\b[^>]*>[\s\S]*?<\/title>/gi,
  /<meta\b[^>]*\bname=["']description["'][^>]*>/gi,
  /<meta\b[^>]*\bname=["']robots["'][^>]*>/gi,
  /<meta\b[^>]*\bname=["']theme-color["'][^>]*>/gi,
  /<meta\b[^>]*\bproperty=["']og:[^"']*["'][^>]*>/gi,
  /<meta\b[^>]*\bname=["']twitter:[^"']*["'][^>]*>/gi,
  /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi,
];

/** Die index.html mit den Tags der Vorschau. Ohne index.html eine Minimalseite — Bots brauchen nur den Kopf. */
function buildHtml(indexHtml, meta) {
  const section = SECTIONS[meta.section] || SECTIONS.site;
  const fullTitle = `${meta.title} - ${SITE}`;
  const url = `${DOMAIN}${meta.path === '/' ? '' : meta.path}`;
  const img = imageUrl(meta);
  const tags = [
    `<title>${escapeAttr(fullTitle)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}">`,
    `<meta name="robots" content="${meta.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">`,
    `<meta name="theme-color" content="${escapeAttr(section.accent)}">`,
    `<link rel="canonical" href="${escapeAttr(url)}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:locale" content="de_DE">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta property="og:title" content="${escapeAttr(fullTitle)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:image" content="${escapeAttr(img)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escapeAttr(meta.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(fullTitle)}">`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(img)}">`,
  ].join('\n    ');

  if (!indexHtml || !/<\/head>/i.test(indexHtml)) {
    return `<!DOCTYPE html>\n<html lang="de">\n  <head>\n    <meta charset="UTF-8">\n    ${tags}\n  </head>\n  <body><a href="${escapeAttr(url)}">${escapeAttr(meta.title)}</a></body>\n</html>\n`;
  }
  let html = indexHtml;
  for (const re of STRIP) html = html.replace(re, '');
  return html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

/** Bild-Daten aus der Vorschau */
function cardOf(meta) {
  const section = SECTIONS[meta.section] || SECTIONS.site;
  const extra = meta.card || {};
  const title = meta.title.replace(/\s+—\s+(Seed Runners(-Level)?|Clash Royale Turnier|Profil)$/, '');
  return {
    // "VIRTUAL FARM" über "Virtual Farm" sagt nichts: dann die Art der Seite als Rubrik
    kicker: section.kicker.toLowerCase() === title.toLowerCase() ? SECTIONS.games.kicker : section.kicker,
    accent: section.accent,
    title,
    lines: extra.lines?.filter(Boolean).length ? extra.lines : [meta.description],
    stat: extra.stat || null,
    table: extra.table?.length ? extra.table : null,
    level: extra.level || null,
  };
}

/**
 * @param getSources  () => { tournament, level, creator, dailyBoard, todayKey } — erst bei der Anfrage aufgerufen, damit
 *                    die Router der Spiele schon stehen (und ein fehlender Teil nicht den Start verhindert)
 * @param render      (card) => Buffer — austauschbar für Tests (Standard: ogImage.renderCard)
 */
function createOgRouter({ getSources, render } = {}) {
  const router = express.Router();
  const sources = () => {
    try { return getSources?.() || {}; } catch { return {}; }
  };
  const renderCard = render || ((card) => require('./ogImage').renderCard(card));

  const cache = new Map(); // "pfad|fassung" → { buf, at }
  let windowStart = Date.now();
  let renders = 0;

  router.get('/page', (req, res) => {
    const uri = String(req.get('x-original-uri') || req.query.u || '');
    const meta = resolveMeta(uri, sources());
    const index = readIndex();
    res.set('Cache-Control', 'public, max-age=60');
    res.type('html');
    if (!meta) {
      // Nichts Eigenes: genau das, was nginx sonst ausgeliefert hätte
      if (index) return res.send(index);
      return res.status(404).send('<!DOCTYPE html><title>vnmvalentin</title>');
    }
    return res.send(buildHtml(index, meta));
  });

  router.get('/image.png', (req, res) => {
    const p = cleanPath(String(req.query.u || ''));
    const meta = p ? resolveMeta(p, sources()) : null;
    if (!meta) return res.status(404).end();
    const key = `${meta.path}|${versionOf(meta)}`;
    const hit = cache.get(key);
    const now = Date.now();
    let buf = hit && now - hit.at < IMAGE_CACHE_MS ? hit.buf : null;
    if (!buf) {
      if (now - windowStart > 60000) { windowStart = now; renders = 0; }
      if (++renders > RENDERS_PER_MINUTE) return res.status(429).end();
      try {
        buf = renderCard(cardOf(meta));
      } catch (e) {
        console.error('[og] Bild fehlgeschlagen:', meta.path, e.message);
        return res.status(500).end();
      }
      cache.delete(key);
      cache.set(key, { buf, at: now });
      while (cache.size > IMAGE_CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    res.set('Cache-Control', 'public, max-age=600');
    res.type('png');
    return res.send(buf);
  });

  return router;
}

module.exports = { createOgRouter, buildHtml, cardOf, imageUrl };
