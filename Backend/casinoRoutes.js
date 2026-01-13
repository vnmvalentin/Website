const express = require("express");
const fs = require("fs");
const path = require("path");

const CASINO_PATH = path.join(__dirname, "casinoData.json");

// --- Helper: DB ---
function loadData() {
  try {
    if (!fs.existsSync(CASINO_PATH)) return {};
    return JSON.parse(fs.readFileSync(CASINO_PATH, "utf8"));
  } catch (e) { return {}; }
}
function saveData(data) {
  fs.writeFileSync(CASINO_PATH, JSON.stringify(data, null, 2));
}

// ------- HELPER MINES ----------------

const MINES_HOUSE_EDGE = 0.94; 

function calculateMinesMultiplier(bombCount, diamondsFound) {
  // Berechnung über Wahrscheinlichkeit:
  // Chance = (Safe / Total) * (Safe-1 / Total-1) ...
  // Multiplier = HouseEdge / Chance
  
  let probability = 1;
  for (let i = 0; i < diamondsFound; i++) {
    const remainingSafe = 25 - bombCount - i;
    const remainingTotal = 25 - i;
    probability *= (remainingSafe / remainingTotal);
  }
  
  // Schutz vor Division durch 0
  if (probability === 0) return 0;

  const rawMultiplier = 1 / probability;
  // Abrunden auf 2 Dezimalstellen für saubere Zahlen
  return Math.floor(rawMultiplier * MINES_HOUSE_EDGE * 100) / 100;
}



// --- Helper: Deck & Karten Logik ---
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function getCardValue(card) {
  if (["J", "Q", "K"].includes(card.value)) return 10;
  if (card.value === "A") return 11;
  return parseInt(card.value);
}

function calculateHand(hand) {
  if (!Array.isArray(hand)) return 0;
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    score += getCardValue(card);
    if (card.value === "A") aces++;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

// Zieht eine Karte, die noch nicht auf dem Tisch liegt (Endlos-Deck Simulation)
function drawRandomCard(excludeCards = []) {
  for (let i = 0; i < 50; i++) {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const value = VALUES[Math.floor(Math.random() * VALUES.length)];
    
    // Check ob Karte schon existiert
    const exists = excludeCards.some(c => c && c.suit === suit && c.value === value);
    if (!exists) {
      return { suit, value };
    }
  }
  return { 
    suit: SUITS[Math.floor(Math.random() * SUITS.length)], 
    value: VALUES[Math.floor(Math.random() * VALUES.length)] 
  };
}

// --- Helper: Case Opening (Angepasst mit Ranges) ---
const CASE_ITEMS = [
  // id: common -> Range 0.33 bis 0.70
  { id: "common", color: "gray", min: 0.10, max: 0.60, label: "Common" },
  
  // id: uncommon -> Range 1.30 bis 1.80
  { id: "uncommon", color: "blue", min: 1.30, max: 1.70, label: "Uncommon" },
  
  // id: rare -> Range 3.50 bis 6.00
  { id: "rare", color: "purple", min: 3.50, max: 6.00, label: "Rare" },
  
  // id: legendary -> Range 20.00 bis 50.00
  { id: "legendary", color: "gold", min: 35.00, max: 50.00, label: "LEGENDÄR" }
];

function getRandomCaseItemBase() {
  const r = Math.random();
  if (r < 0.004) return CASE_ITEMS[3]; // Legendary 
  if (r < 0.07) return CASE_ITEMS[2]; // Rare 
  if (r < 0.32) return CASE_ITEMS[1]; // Uncommon 
  return CASE_ITEMS[0];               // Common 
}

// Hilfsfunktion: Berechnet genauen Multiplier (2 Dezimalstellen)
function generateSpecificItem() {
    const base = getRandomCaseItemBase();
    // Zufallswert zwischen min und max
    const randomMult = Math.random() * (base.max - base.min) + base.min;
    
    // Wir geben ein neues Objekt zurück, das den konkreten Multiplier hat
    return {
        ...base,
        multiplier: parseFloat(randomMult.toFixed(2)) // z.B. 0.45 oder 1.72
    };
}

module.exports = function createCasinoRouter({ requireAuth }) {
  const router = express.Router();

  router.use(requireAuth, (req, res, next) => {
    const db = loadData();
    if (!db[req.twitchId]) {
      db[req.twitchId] = { credits: 1000, lastDaily: 0, activeGame: null };
    }

    if (req.user && req.user.display_name) {
        db[req.twitchId].name = req.user.display_name;
    } else if (req.twitchLogin) {
        db[req.twitchId].name = req.twitchLogin;
    }
    req.casinoDb = db;
    req.userData = db[req.twitchId];
    next();
  });


  // --- NEUE ROUTEN FÜR TRANSFER ---

  // 1. Liste aller User für das Dropdown holen
  router.get("/users", (req, res) => {
      const db = loadData();
      // Wir mappen die DB in ein Array für das Frontend
      // Filtern den eigenen User raus, damit man sich nicht selbst Geld schickt
      const users = Object.keys(db)
        .filter(id => id !== req.twitchId)
        .map(id => ({
            id: id,
            name: db[id].name || `User ${id}` // Fallback, falls noch kein Name gespeichert wurde
        }));
      res.json(users);
  });

  // 2. Geld überweisen
  router.post("/transfer", (req, res) => {
      const { targetId, amount } = req.body;
      const transferAmount = parseInt(amount);

      if (!targetId || !req.casinoDb[targetId]) {
          return res.status(400).json({ error: "Empfänger nicht gefunden." });
      }
      if (isNaN(transferAmount) || transferAmount <= 0) {
          return res.status(400).json({ error: "Ungültiger Betrag." });
      }
      if (req.userData.credits < transferAmount) {
          return res.status(400).json({ error: "Nicht genug Credits." });
      }

      // Transaktion durchführen
      req.userData.credits -= transferAmount;
      req.casinoDb[targetId].credits += transferAmount;

      saveData(req.casinoDb);

      res.json({ 
          success: true, 
          credits: req.userData.credits, 
          message: `Erfolgreich ${transferAmount} an ${req.casinoDb[targetId].name || 'den User'} gesendet!` 
      });
  });

  router.get("/user", (req, res) => {
    res.json({
      credits: req.userData.credits,
      lastDaily: req.userData.lastDaily,
      activeGameType: req.userData.activeGame ? req.userData.activeGame.type : null
    });
  });


  router.get("/leaderboard", (req, res) => {
      const db = loadData(); // Deine Funktion zum Laden der JSON
      
      const sorted = Object.values(db)
          .filter(u => u.name) // Nur User mit Namen
          .sort((a, b) => (b.credits || 0) - (a.credits || 0)) // Absteigend sortieren
          .slice(0, 5) // Nur die Top 5
          .map(u => ({ name: u.name, credits: u.credits })); // Nur nötige Daten senden

      res.json(sorted);
  });

  router.post("/daily", (req, res) => {
    const now = Date.now();
    if (now - req.userData.lastDaily < 24 * 60 * 60 * 1000) return res.status(400).json({ error: "Cooldown" });
    req.userData.credits += 500;
    req.userData.lastDaily = now;
    saveData(req.casinoDb);
    res.json({ credits: req.userData.credits });
  });

  // --- SLOTS ---
  router.post("/play/slots", (req, res) => {
    const { bet } = req.body;
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits" });
    req.userData.credits -= bet;
    
    // Balanced Symbols (House Edge)
    const symbols = ["🍒", "🍋", "🍇", "💎", "7️⃣"];
    const weighted = ["🍒","🍒","🍒","🍒","🍒","🍋","🍋","🍋","🍋","🍇","🍇","🍇","💎","💎","7️⃣"];
    const r = () => weighted[Math.floor(Math.random()*weighted.length)];
    const grid = [[r(), r(), r()],[r(), r(), r()],[r(), r(), r()]];
    
    const lines = [
        [grid[0][1], grid[1][1], grid[2][1]], 
        [grid[0][0], grid[1][0], grid[2][0]], 
        [grid[0][2], grid[1][2], grid[2][2]], 
        [grid[0][0], grid[1][1], grid[2][2]], 
        [grid[0][2], grid[1][1], grid[2][0]]
    ];

    let totalWin = 0;
    const winningLines = [];
    lines.forEach((line, index) => {
        if (line[0] === line[1] && line[1] === line[2]) {
            const s = line[0];
            let multi = 1.5;
            if(s === "7️⃣") multi = 25; 
            else if(s === "💎") multi = 10; 
            else if(s === "🍇") multi = 5;
            else if(s === "🍋") multi = 2;
            totalWin += Math.floor(bet * multi);
            winningLines.push(index);
        }
    });

    req.userData.credits += totalWin;
    saveData(req.casinoDb);
    res.json({ reels: grid, winAmount: totalWin, winningLines, credits: req.userData.credits });
  });

  // --- BLACKJACK ---
  router.post("/play/blackjack/deal", (req, res) => {
    const { bet } = req.body;
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Zu wenig Credits" });

    req.userData.credits -= bet;
    
    const allCards = [];
    const p1 = drawRandomCard(allCards); allCards.push(p1);
    const p2 = drawRandomCard(allCards); allCards.push(p2);
    const d1 = drawRandomCard(allCards); allCards.push(d1);
    const d2 = drawRandomCard(allCards); allCards.push(d2);

    const playerHand = [p1, p2];
    const dealerHand = [d1, d2];

    req.userData.activeGame = {
      type: "blackjack",
      bet,
      playerHand,
      dealerHand,
      status: "playing"
    };

    if (calculateHand(playerHand) === 21) {
      const win = Math.floor(bet * 2.5);
      req.userData.credits += win;
      req.userData.activeGame = null;
      saveData(req.casinoDb);
      return res.json({ 
        playerHand, dealerHand, score: 21, dealerScore: calculateHand(dealerHand),
        status: "blackjack", winAmount: win, credits: req.userData.credits 
      });
    }

    saveData(req.casinoDb);
    res.json({ 
      playerHand, 
      dealerUpCard: dealerHand[0], 
      status: "playing",
      credits: req.userData.credits 
    });
  });

  router.post("/play/blackjack/action", (req, res) => {
    const { action } = req.body;
    const game = req.userData.activeGame;
    if (!game || game.type !== "blackjack") return res.status(400).json({ error: "Kein Spiel aktiv" });

    const currentCardsOnTable = [...game.playerHand, ...game.dealerHand];

    // --- HIT ---
    if (action === "hit") {
      const newCard = drawRandomCard(currentCardsOnTable);
      game.playerHand.push(newCard);
      
      const score = calculateHand(game.playerHand);
      if (score > 21) {
        req.userData.activeGame = null;
        saveData(req.casinoDb);
        return res.json({ playerHand: game.playerHand, status: "bust", credits: req.userData.credits });
      }
      saveData(req.casinoDb);
      return res.json({ playerHand: game.playerHand, status: "playing" });
    }

    // --- DOUBLE DOWN (Neu) ---
    if (action === "double") {
        if (req.userData.credits < game.bet) {
            return res.status(400).json({ error: "Zu wenig Credits für Double!" });
        }
        // Einsatz verdoppeln
        req.userData.credits -= game.bet;
        game.bet *= 2;

        // Eine Karte ziehen
        const newCard = drawRandomCard(currentCardsOnTable);
        game.playerHand.push(newCard);

        const score = calculateHand(game.playerHand);
        // Wenn Bust -> direkt vorbei
        if (score > 21) {
            req.userData.activeGame = null;
            saveData(req.casinoDb);
            return res.json({ playerHand: game.playerHand, status: "bust", credits: req.userData.credits, double: true });
        }

        // Ansonsten -> Automatisch Stand (Dealer zieht)
        // Wir lassen den Code einfach in den 'stand' Block laufen, 
        // aber wir brauchen einen kleinen Trick oder kopieren den Code. 
        // Kopieren ist sicherer hier.
        let dealerScore = calculateHand(game.dealerHand);
        while (dealerScore < 17) {
            const currentTable = [...game.playerHand, ...game.dealerHand];
            const dCard = drawRandomCard(currentTable);
            game.dealerHand.push(dCard);
            dealerScore = calculateHand(game.dealerHand);
        }
        
        const playerScore = calculateHand(game.playerHand);
        let winAmount = 0;
        let status = "lose";

        if (dealerScore > 21 || playerScore > dealerScore) {
            status = "win";
            winAmount = game.bet * 2;
        } else if (playerScore === dealerScore) {
            status = "push";
            winAmount = game.bet;
        }

        req.userData.credits += winAmount;
        req.userData.activeGame = null;
        saveData(req.casinoDb);
        return res.json({ 
            playerHand: game.playerHand, dealerHand: game.dealerHand,
            status, winAmount, credits: req.userData.credits 
        });
    }

    // --- STAND ---
    if (action === "stand") {
      let dealerScore = calculateHand(game.dealerHand);
      while (dealerScore < 17) {
        const currentTable = [...game.playerHand, ...game.dealerHand];
        const newCard = drawRandomCard(currentTable);
        game.dealerHand.push(newCard);
        dealerScore = calculateHand(game.dealerHand);
      }
      
      const playerScore = calculateHand(game.playerHand);
      let winAmount = 0;
      let status = "lose";

      if (dealerScore > 21 || playerScore > dealerScore) {
        status = "win";
        winAmount = game.bet * 2;
      } else if (playerScore === dealerScore) {
        status = "push";
        winAmount = game.bet;
      }

      req.userData.credits += winAmount;
      req.userData.activeGame = null;
      saveData(req.casinoDb);
      return res.json({ 
        playerHand: game.playerHand, dealerHand: game.dealerHand,
        status, winAmount, credits: req.userData.credits 
      });
    }
  });

  // --- CASE, HIGHLOW, MINES, GUESS (Unverändert) ---

  // --- CASE ROUTE ANPASSUNG ---
  router.post("/play/case", (req, res) => {
    const { bet } = req.body;
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits?" });
    
    req.userData.credits -= bet;

    // 1. Wir generieren Items für das "Band" (Strip)
    // Jedes Item bekommt seinen eigenen zufälligen Multiplier
    const items = [];
    const WIN_INDEX = 40; 
    const TOTAL_ITEMS = 50;

    for(let i=0; i<TOTAL_ITEMS; i++) {
        items.push(generateSpecificItem());
    }

    // 2. Der Gewinner ist das Item am WIN_INDEX
    const winner = items[WIN_INDEX];
    
    // 3. Gewinn berechnen (Einsatz * spezifischer Multiplier)
    const winAmount = Math.floor(bet * winner.multiplier);
    
    req.userData.credits += winAmount;
    
    saveData(req.casinoDb);

    // Wir senden die Items mit den generierten Multiplikatoren zurück
    res.json({ items, winIndex: WIN_INDEX, winner, winAmount, credits: req.userData.credits });
  });

  router.post("/play/highlow", (req, res) => {
    const { bet, guess } = req.body; 
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits" });
    req.userData.credits -= bet;
    const number = Math.floor(Math.random() * 100) + 1; 
    let won = false;
    if (guess === "low" && number <= 50) won = true;
    if (guess === "high" && number > 50) won = true;
    const winAmount = won ? Math.floor(bet * 1.8) : 0; 
    req.userData.credits += winAmount;
    saveData(req.casinoDb);
    res.json({ number, winAmount, credits: req.userData.credits });
  });

  router.post("/play/mines/start", (req, res) => {
    const { bet, bombCount } = req.body;
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits?" });
    if (bombCount < 1 || bombCount > 24) return res.status(400).json({ error: "1-24 Bomben" });
    req.userData.credits -= bet;
    const field = Array(25).fill("gem");
    for (let i = 0; i < bombCount; i++) field[i] = "bomb";
    for (let i = field.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [field[i], field[j]] = [field[j], field[i]];
    }
    req.userData.activeGame = { type: "mines", bet, bombCount, field, revealed: Array(25).fill(false), active: true, currentCashout: bet };
    saveData(req.casinoDb);
    res.json({ status: "started", credits: req.userData.credits });
  });

  router.post("/play/mines/click", (req, res) => {
    const { index } = req.body;
    const game = req.userData.activeGame;
    
    // Validierungen
    if (!game || game.type !== "mines") return res.status(400).json({ error: "Kein Spiel" });
    if (game.revealed[index]) return res.status(400).json({ error: "Schon offen" });

    // Bombe getroffen?
    if (game.field[index] === "bomb") {
      game.revealed[index] = true;
      const fullField = game.field;
      req.userData.activeGame = null; // Spiel beenden
      saveData(req.casinoDb);
      return res.json({ status: "boom", field: fullField, credits: req.userData.credits });
    } else {
      // Diamant gefunden
      game.revealed[index] = true;
      
      // NEUE BERECHNUNG:
      const tilesRevealed = game.revealed.filter(Boolean).length;
      
      // Nutze die neue Formel
      const multiplier = calculateMinesMultiplier(game.bombCount, tilesRevealed);
      
      game.currentCashout = Math.floor(game.bet * multiplier);
      
      saveData(req.casinoDb);
      return res.json({ 
        status: "safe", 
        cashoutValue: game.currentCashout,
        multiplier: multiplier // Optional für Frontend
      });
    }
  });

  router.post("/play/mines/cashout", (req, res) => {
    const game = req.userData.activeGame;
    if (!game || game.type !== "mines") return res.status(400).json({ error: "Kein Spiel" });
    req.userData.credits += game.currentCashout;
    const f = game.field;
    req.userData.activeGame = null;
    saveData(req.casinoDb);
    res.json({ status: "cashed_out", winAmount: game.currentCashout, field: f, credits: req.userData.credits });
  });

  router.post("/play/guess/start", (req, res) => {
    const { bet } = req.body;
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits?" });
    req.userData.credits -= bet;
    req.userData.activeGame = { type: "guess", bet, target: Math.floor(Math.random() * 100) + 1, triesLeft: 5, history: [] };
    saveData(req.casinoDb);
    res.json({ status: "started", triesLeft: 5, credits: req.userData.credits });
  });

  router.post("/play/guess/submit", (req, res) => {
    const { number } = req.body;
    const game = req.userData.activeGame;
    if (!game || game.type !== "guess") return res.status(400).json({ error: "Kein Spiel" });
    game.triesLeft--;
    let result = "equal";
    if (number < game.target) result = "higher";
    else if (number > game.target) result = "lower";
    game.history.push({ guess: number, hint: result });
    if (result === "equal") {
      const multipliers = { 4: 10, 3: 5, 2: 3, 1: 2, 0: 1.5 }; 
      const win = Math.floor(game.bet * multipliers[game.triesLeft]);
      req.userData.credits += win;
      req.userData.activeGame = null;
      saveData(req.casinoDb);
      return res.json({ status: "win", winAmount: win, credits: req.userData.credits });
    }
    if (game.triesLeft <= 0) {
      const t = game.target;
      req.userData.activeGame = null;
      saveData(req.casinoDb);
      return res.json({ status: "lose", target: t, credits: req.userData.credits });
    }
    saveData(req.casinoDb);
    res.json({ status: "next", history: game.history, triesLeft: game.triesLeft });
  });

  return router;
};