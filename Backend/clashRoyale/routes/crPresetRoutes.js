// crPresetRoutes.js — private Karten-Presets für den Kartenpool der Minigames.
// Jeder eingeloggte Twitch-Account verwaltet ausschließlich seine eigenen Presets — kein
// öffentlicher, geteilter Presets-Pool mehr (siehe crPresetStore.js für die Historie).
const express = require('express');
const { nanoid } = require('nanoid');
const presetStore = require('../lib/crPresetStore');
const { ALL_CARDS } = require('../core/cards');

const VALID_CARD_IDS = new Set(ALL_CARDS.map(c => c.id));
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 160;
// Sane Obergrenze — verhindert, dass ein Account das Presets-Fach unbegrenzt volllädt.
const MAX_PRESETS_PER_USER = 40;

const cleanText = (raw, max) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanCardIds = (raw) =>
  Array.isArray(raw) ? [...new Set(raw.filter(id => VALID_CARD_IDS.has(id)))] : null;

module.exports = function createCrPresetRouter({ requireAuth } = {}) {
  const router = express.Router();
  // Ohne Login-Unterbau ergibt das Feature keinen Sinn (Presets hängen am Twitch-Account) —
  // dann bleibt der Router leer, wie es die anderen Router-Factories hier schon so halten.
  if (!requireAuth) return router;

  router.get('/', requireAuth, (req, res) => {
    res.json({ presets: presetStore.listByUser(req.twitchId) });
  });

  router.post('/', requireAuth, (req, res) => {
    const existing = presetStore.listByUser(req.twitchId);
    if (existing.length >= MAX_PRESETS_PER_USER) {
      return res.status(400).json({ error: `Maximal ${MAX_PRESETS_PER_USER} Presets pro Account` });
    }
    const name = cleanText(req.body?.name, MAX_NAME_LENGTH);
    const cardIds = cleanCardIds(req.body?.cardIds);
    if (!name) return res.status(400).json({ error: 'Name fehlt' });
    if (!cardIds?.length) return res.status(400).json({ error: 'Mindestens eine Karte auswählen' });
    const preset = presetStore.createPreset({
      presetId: nanoid(12),
      userId: req.twitchId,
      name,
      description: cleanText(req.body?.description, MAX_DESCRIPTION_LENGTH),
      cardIds,
      sortOrder: existing.length,
    });
    res.json({ ok: true, preset });
  });

  router.put('/:presetId', requireAuth, (req, res) => {
    const cardIds = req.body?.cardIds === undefined ? undefined : cleanCardIds(req.body.cardIds);
    if (cardIds !== undefined && !cardIds?.length) {
      return res.status(400).json({ error: 'Mindestens eine Karte auswählen' });
    }
    const preset = presetStore.updatePreset(req.params.presetId, req.twitchId, {
      name: req.body?.name === undefined ? undefined : cleanText(req.body.name, MAX_NAME_LENGTH),
      description: req.body?.description === undefined ? undefined : cleanText(req.body.description, MAX_DESCRIPTION_LENGTH),
      cardIds,
      sortOrder: req.body?.sortOrder === undefined ? undefined : Number(req.body.sortOrder) || 0,
    });
    if (!preset) return res.status(404).json({ error: 'Preset nicht gefunden' });
    res.json({ ok: true, preset });
  });

  router.delete('/:presetId', requireAuth, (req, res) => {
    if (!presetStore.deletePreset(req.params.presetId, req.twitchId)) {
      return res.status(404).json({ error: 'Preset nicht gefunden' });
    }
    res.json({ ok: true });
  });

  return router;
};
