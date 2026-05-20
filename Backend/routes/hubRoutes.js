const express = require("express");
const fs = require("fs");
const path = require("path");

const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");
const ADVENTURE_PATH = path.join(__dirname, "../data/adventures-users.json");
const CARDS_PATH = path.join(__dirname, "../data/cards-users.json");
const CARDS_DEF_PATH = path.join(__dirname, "../data/cards-def.json");

function loadJson(file) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Leaderboard- und Profildaten (ohne Season-Metadaten).
 * Ersetzt die frühere /api/seasons/current-Antwort.
 */
module.exports = function createHubRouter() {
  const router = express.Router();

  router.get("/players", (req, res) => {
    const casinoDb = loadJson(CASINO_PATH);
    const adventureDb = loadJson(ADVENTURE_PATH);
    const cardsDb = loadJson(CARDS_PATH);
    const cardsDef = loadJson(CARDS_DEF_PATH);

    const totalCardsInGame = Object.keys(cardsDef).length || 0;
    const players = [];

    for (const [userId, casinoData] of Object.entries(casinoDb)) {
      if (!casinoData.name) continue;

      const advData = adventureDb[userId] || {};
      const cardData = cardsDb[userId] || { owned: {} };

      const uniqueCardsCount = Object.keys(cardData.owned || {}).length;
      const hasFullSet =
        uniqueCardsCount >= totalCardsInGame && totalCardsInGame > 0;

      players.push({
        id: userId,
        name: casinoData.name,
        credits: casinoData.credits || 0,
        adventureMaxStage: advData.highScore || 0,
        uniqueCards: uniqueCardsCount,
        hasFullSet,
        badges: casinoData.badges || [],
        achievements: cardData.claimedAchievements || [],
        activeSkin: advData.activeSkin || "default",
        loadout: advData.loadout || [null, null, null, null],
      });
    }

    res.json({ players, totalCards: totalCardsInGame });
  });

  return router;
};
