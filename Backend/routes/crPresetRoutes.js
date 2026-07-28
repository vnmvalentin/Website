// crPresetRoutes.js — Karten-Presets für den Kartenpool der Minigames.
//
// Öffentlich: die veröffentlichten Presets (jeder Lobby-Host darf sie laden).
// Admin (nur der Streamer): eigene Presets anlegen/ändern/löschen und den Scan der
// offiziellen Spezialmodi manuell auslösen.
const express = require('express');
const { nanoid } = require('nanoid');
const presetStore = require('../lib/crPresetStore');
const { ALL_CARDS } = require('../clashRoyale/core/cards');
const { scanOfficialModes, lastScanSummary } = require('../clashRoyale/core/officialModeScanner');

const VALID_CARD_IDS = new Set(ALL_CARDS.map(c => c.id));
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 160;

const cleanText = (raw, max) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanCardIds = (raw) =>
  Array.isArray(raw) ? [...new Set(raw.filter(id => VALID_CARD_IDS.has(id)))] : null;

module.exports = function createCrPresetRouter({ requireAuth, STREAMER_TWITCH_ID } = {}) {
  const router = express.Router();

  const requireStreamer = (req, res, next) => {
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };

  // ── Öffentlich ────────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    res.json({ presets: presetStore.listPublished() });
  });

  if (!requireAuth) return router;

  // ── Admin ─────────────────────────────────────────────────────────────────
  router.get('/admin', requireAuth, requireStreamer, (req, res) => {
    res.json({ presets: presetStore.listAll(), lastScan: lastScanSummary(), totalCards: ALL_CARDS.length });
  });

  router.post('/admin', requireAuth, requireStreamer, (req, res) => {
    const name = cleanText(req.body?.name, MAX_NAME_LENGTH);
    const cardIds = cleanCardIds(req.body?.cardIds);
    if (!name) return res.status(400).json({ error: 'Name fehlt' });
    if (!cardIds?.length) return res.status(400).json({ error: 'Mindestens eine Karte auswählen' });
    const preset = presetStore.createPreset({
      presetId: nanoid(12),
      name,
      description: cleanText(req.body?.description, MAX_DESCRIPTION_LENGTH),
      cardIds,
      source: 'admin',
      isPublished: req.body?.isPublished !== false,
    });
    res.json({ ok: true, preset });
  });

  router.put('/admin/:presetId', requireAuth, requireStreamer, (req, res) => {
    const existing = presetStore.getById(req.params.presetId);
    if (!existing) return res.status(404).json({ error: 'Preset nicht gefunden' });

    const cardIds = req.body?.cardIds === undefined ? undefined : cleanCardIds(req.body.cardIds);
    if (cardIds !== undefined && !cardIds?.length) {
      return res.status(400).json({ error: 'Mindestens eine Karte auswählen' });
    }
    // Bei Auto-Presets ist die Kartenliste Ergebnis des Scans und wird hier nicht angefasst —
    // der nächste Scan würde die Änderung sowieso überschreiben. Der ANZEIGENAME dagegen darf
    // gesetzt werden: die API liefert nur interne Codenamen ("Crazy_Arena"), und display_name
    // überlebt jeden Scan.
    const isAuto = existing.source === 'auto';
    const newName = req.body?.name === undefined ? undefined : cleanText(req.body.name, MAX_NAME_LENGTH);
    const preset = presetStore.updatePreset(req.params.presetId, {
      name: isAuto || newName === undefined ? undefined : (newName || existing.rawName),
      displayName: isAuto ? newName : undefined,
      description: req.body?.description === undefined ? undefined : cleanText(req.body.description, MAX_DESCRIPTION_LENGTH),
      cardIds: isAuto ? undefined : cardIds,
      isPublished: req.body?.isPublished === undefined ? undefined : !!req.body.isPublished,
      sortOrder: req.body?.sortOrder === undefined ? undefined : Number(req.body.sortOrder) || 0,
    });
    res.json({ ok: true, preset });
  });

  router.delete('/admin/:presetId', requireAuth, requireStreamer, (req, res) => {
    if (!presetStore.deletePreset(req.params.presetId)) {
      return res.status(404).json({ error: 'Preset nicht gefunden' });
    }
    res.json({ ok: true });
  });

  // Scan der offiziellen Spezialmodi jetzt starten (läuft sonst automatisch alle 6 Stunden)
  router.post('/admin/scan', requireAuth, requireStreamer, async (req, res) => {
    try {
      const summary = await scanOfficialModes();
      if (!summary.ok) return res.status(502).json({ error: summary.error });
      res.json({ ok: true, summary, presets: presetStore.listAll() });
    } catch (e) {
      res.status(502).json({ error: `Scan fehlgeschlagen: ${e.message}` });
    }
  });

  return router;
};
