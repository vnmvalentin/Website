const express = require("express");
const fs = require("fs");
const path = require("path");
const { executeSeasonReset } = require("../utils/seasonManager");

const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");
const ADVENTURE_PATH = path.join(__dirname, "../data/adventures-users.json");
const CARDS_PATH = path.join(__dirname, "../data/cards-users.json");
const CARDS_DEF_PATH = path.join(__dirname, "../data/cards-def.json");
const SEASON_CONFIG_PATH = path.join(__dirname, "../data/seasonConfig.json");
// NEU: Pfad für vergangene Seasons
const PAST_SEASONS_PATH = path.join(__dirname, "../data/pastSeasons.json");

function loadJson(file) {
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; } 
    catch (e) { return {}; }
}

module.exports = function createSeasonRouter({ requireAuth }) {
    const router = express.Router();

    // Endpunkt für die aktuelle Season
    router.get("/current", (req, res) => {
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
            const hasFullSet = uniqueCardsCount >= totalCardsInGame && totalCardsInGame > 0;

            players.push({
                id: userId,
                name: casinoData.name,
                credits: casinoData.credits || 0,
                adventureMaxStage: advData.highScore || 0,
                uniqueCards: uniqueCardsCount,
                hasFullSet: hasFullSet,
                badges: casinoData.badges || [],
                // NEU: Zusätzliche Profil-Daten
                achievements: cardData.claimedAchievements || [],
                activeSkin: advData.activeSkin || "default",
                loadout: advData.loadout || [null, null, null, null]
            });
        }

        const config = loadJson(SEASON_CONFIG_PATH);

        res.json({
            currentSeason: config.currentSeason || 1,
            seasonName: config.seasonName || "Aktuelle Season",
            endsAt: config.endsAt || 0,
            totalCards: totalCardsInGame,
            players: players
        });
    });

    // NEU: Endpunkt für die Hall of Fame (Vergangene Seasons)
    router.get("/history", (req, res) => {
        // Erwartet ein Array von Season-Objekten in pastSeasons.json
        const history = loadJson(PAST_SEASONS_PATH);
        // Falls die Datei noch leer/ein Objekt ist, sende ein leeres Array zurück
        res.json(Array.isArray(history) ? history : []); 
    });

    router.post("/admin/end-season", requireAuth, (req, res) => {
        const STREAMER_ID = "160224748";
        if (String(req.twitchId) !== STREAMER_ID) return res.status(403).json({ error: "Admin only" });

        try {
            executeSeasonReset(); 
            res.json({ success: true, message: "Season erfolgreich resettet!" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Fehler beim Reset" });
        }
    });

    return router;
};