const fs = require("fs");
const path = require("path");

const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");
const ADVENTURE_PATH = path.join(__dirname, "../data/adventures-users.json");
const CARDS_PATH = path.join(__dirname, "../data/cards-users.json");
const CARDS_DEF_PATH = path.join(__dirname, "../data/cards-def.json");
const SEASON_CONFIG_PATH = path.join(__dirname, "../data/seasonConfig.json");
// NEU: Dateipfad für die History
const PAST_SEASONS_PATH = path.join(__dirname, "../data/pastSeasons.json"); 

function loadJson(file) {
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; } 
    catch (e) { return {}; }
}

function executeSeasonReset() {
    console.log("Starte vollautomatischen Season Reset...");

    const casinoDb = loadJson(CASINO_PATH);
    const adventureDb = loadJson(ADVENTURE_PATH);
    const cardsDb = loadJson(CARDS_PATH);
    const config = loadJson(SEASON_CONFIG_PATH);
    
    // NEU: History laden (oder leeres Array erstellen)
    let pastSeasons = loadJson(PAST_SEASONS_PATH);
    if (!Array.isArray(pastSeasons)) pastSeasons = [];

    const seasonNum = config.currentSeason || 1;
    const currentSeasonName = config.seasonName || `Season ${seasonNum}`;

    // 1. AUSWERTUNG DER TOP 3 
    // Wir speichern die kompletten sortierten Arrays, um sie auch in die History zu packen
    const advSorted = Object.entries(adventureDb).sort((a, b) => (b[1].highScore || 0) - (a[1].highScore || 0));
    const coinSorted = Object.entries(casinoDb).sort((a, b) => (b[1].credits || 0) - (a[1].credits || 0));
    const cardSorted = Object.entries(cardsDb).sort((a, b) => Object.keys(b[1].owned || {}).length - Object.keys(a[1].owned || {}).length);

    const advWinners = advSorted.slice(0, 3).map(x => x[0]);
    const coinWinners = coinSorted.slice(0, 3).map(x => x[0]);
    const cardWinners = cardSorted.slice(0, 3).map(x => x[0]);

    // 2. BADGES VERTEILEN (Dynamisch & Custom!)
    const assignTop3Badges = (winnersArray, prefix) => {
        winnersArray.forEach((userId, index) => {
            const rank = index + 1; // 1 (Gold), 2 (Silber), 3 (Bronze)
            
            // Generiert IDs wie "s1_coins_1", "s2_adventure_3", etc.
            const badgeName = `s${seasonNum}_${prefix}_${rank}`;
            
            if (!casinoDb[userId]) return;
            if (!casinoDb[userId].badges) casinoDb[userId].badges = [];
            
            // Verhindern, dass Badges doppelt vergeben werden, falls man das Script 2x ausführt
            if (!casinoDb[userId].badges.includes(badgeName)) {
                casinoDb[userId].badges.push(badgeName);
            }
        });
    };

    assignTop3Badges(advWinners, "adventure");
    assignTop3Badges(coinWinners, "coins");
    assignTop3Badges(cardWinners, "cards");

    // 3. HISTORY EINTRAG FÜR DIE HALL OF FAME ERSTELLEN
    const historyEntry = {
        seasonNum: seasonNum,
        seasonName: currentSeasonName,
        endedAt: Date.now(),
        // Wir speichern Name und den relevanten Score für die Top 3 jeder Kategorie
        topCoins: coinSorted.slice(0, 3).map(x => ({ name: casinoDb[x[0]]?.name || "Unbekannt", credits: x[1].credits || 0 })),
        topAdventure: advSorted.slice(0, 3).map(x => ({ name: casinoDb[x[0]]?.name || "Unbekannt", stage: x[1].highScore || 0 })),
        topCards: cardSorted.slice(0, 3).map(x => ({ name: casinoDb[x[0]]?.name || "Unbekannt", uniqueCards: Object.keys(x[1].owned || {}).length }))
    };
    
    // Fügt die abgelaufene Season GANZ OBEN in die Liste ein
    pastSeasons.unshift(historyEntry);

    // 4. DATENBANKEN RESETTEN
    for (const [userId, casinoData] of Object.entries(casinoDb)) {
        casinoData.credits = 1000; 
        casinoData.dailyStreak = 0;
        casinoData.lastDaily = 0;
        // WICHTIG: casinoData.badges bleibt unangetastet!
    }
    for (const [userId, advData] of Object.entries(adventureDb)) {
        advData.highScore = 0;
        advData.powerups = []; 
        advData.loadout = [null, null, null, null]; 
    }
    for (const userId of Object.keys(cardsDb)) {
        delete cardsDb[userId.id];
    }

    // 5. NEUE SEASON KONFIGURIEREN
    config.currentSeason = seasonNum + 1;
    config.seasonName = `Season ${config.currentSeason}`;
    config.endsAt = Date.now() + ((config.durationDays || 45) * 24 * 60 * 60 * 1000);

    // 6. ALLES SPEICHERN
    fs.writeFileSync(CASINO_PATH, JSON.stringify(casinoDb, null, 2));
    fs.writeFileSync(ADVENTURE_PATH, JSON.stringify(adventureDb, null, 2));
    fs.writeFileSync(CARDS_PATH, JSON.stringify(cardsDb, null, 2));
    fs.writeFileSync(SEASON_CONFIG_PATH, JSON.stringify(config, null, 2));
    // NEU: History speichern
    fs.writeFileSync(PAST_SEASONS_PATH, JSON.stringify(pastSeasons, null, 2));

    console.log(`Season ${seasonNum} beendet! Badges verteilt & History gesichert. Season ${config.currentSeason} startet jetzt.`);
}

module.exports = { executeSeasonReset };