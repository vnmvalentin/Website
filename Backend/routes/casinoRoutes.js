const express = require("express");
const fs = require("fs");
const path = require("path");

const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");

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


const PLINKO_MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
  }
};

function generatePlinkoPath(rows) {
  // 0 = Links, 1 = Rechts
  const path = [];
  for (let i = 0; i < rows; i++) {
    // 50/50 Chance bei jedem Pin
    path.push(Math.random() < 0.5 ? 0 : 1);
  }
  return path;
}

// --- Helper: Roulette ---
const ROULETTE_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function getRouletteResult() {
  const randomIndex = Math.floor(Math.random() * 37);
  const number = ROULETTE_NUMBERS[randomIndex];
  let color = "green";
  if (RED_NUMBERS.includes(number)) color = "red";
  else if (number !== 0) color = "black";
  return { number, color };
}

function calculateRoulettePayout(bets, resultNumber, resultColor) {
  let totalWin = 0;
  
  bets.forEach(bet => {
    const { type, value, amount } = bet; // type: 'number', 'color', 'parity', 'range', 'dozen'
    
    // 1. Genaue Zahl (35:1)
    if (type === 'number' && value === resultNumber) {
      totalWin += amount * 36; // Einsatz zurück + 35x Gewinn = 36x
    }
    
    // 2. Farben (1:1)
    if (type === 'color' && value === resultColor) {
      totalWin += amount * 2;
    }

    // 3. Gerade/Ungerade (1:1) - 0 zählt meist nicht
    if (type === 'parity' && resultNumber !== 0) {
      const isEven = resultNumber % 2 === 0;
      if ((value === 'even' && isEven) || (value === 'odd' && !isEven)) {
        totalWin += amount * 2;
      }
    }

    // 4. 1-18 / 19-36 (1:1) - 0 verliert
    if (type === 'half' && resultNumber !== 0) {
        if (value === 'low' && resultNumber <= 18) totalWin += amount * 2;
        if (value === 'high' && resultNumber >= 19) totalWin += amount * 2;
    }

    // 5. Dozens (2:1) - 1st 12, 2nd 12, etc.
    if (type === 'dozen' && resultNumber !== 0) {
        if (value === 1 && resultNumber <= 12) totalWin += amount * 3;
        if (value === 2 && resultNumber > 12 && resultNumber <= 24) totalWin += amount * 3;
        if (value === 3 && resultNumber > 24) totalWin += amount * 3;
    }
  });

  return totalWin;
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
  { id: "common", color: "gray", min: 0.2, max: 0.70, label: "Common" },
  
  // id: uncommon -> Range 1.30 bis 1.80
  { id: "uncommon", color: "blue", min: 1.25, max: 2.00, label: "Uncommon" },
  
  // id: rare -> Range 3.50 bis 6.00
  { id: "rare", color: "purple", min: 3.50, max: 6.50, label: "Rare" },
  
  // id: legendary -> Range 20.00 bis 50.00
  { id: "legendary", color: "gold", min: 35.00, max: 50.00, label: "LEGENDÄR" }
];

function getRandomCaseItemBase() {
  const r = Math.random();
  if (r < 0.003) return CASE_ITEMS[3]; // Legendary 
  if (r < 0.05) return CASE_ITEMS[2]; // Rare 
  if (r < 0.30) return CASE_ITEMS[1]; // Uncommon 
  return CASE_ITEMS[0];               // Common 
}

// Hilfsfunktion
function generateSpecificItem() {
    const base = getRandomCaseItemBase();
    // Zufallswert
    const randomMult = Math.random() * (base.max - base.min) + base.min;
    
    
    return {
        ...base,
        multiplier: parseFloat(randomMult.toFixed(2)) 
    };
}

module.exports = function createCasinoRouter({ requireAuth, io }) {
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

      if (io) {
          // 1. Update an den Empfänger senden (damit sein Guthaben sofort hochgeht)
          io.to(`user:${targetId}`).emit("casino_credit_update", { 
              credits: req.casinoDb[targetId].credits,
              message: `Du hast ${transferAmount} Coins erhalten!`
          });

          // 2. Update an den Sender senden (optional, zur Sicherheit)
          io.to(`user:${req.twitchId}`).emit("casino_credit_update", { 
              credits: req.userData.credits 
          });
      }

      res.json({ 
          success: true, 
          credits: req.userData.credits, 
          message: `Erfolgreich ${transferAmount} Coins an ${req.casinoDb[targetId].name || 'den User'} gesendet!` 
      });
  });

  router.get("/user", (req, res) => {
    res.json({
      credits: req.userData.credits,
      lastDaily: req.userData.lastDaily,
      dailyStreak: req.userData.dailyStreak || 0, // <-- DIESE ZEILE HINZUFÜGEN
      activeGameType: req.userData.activeGame ? req.userData.activeGame.type : null
    });
  });


  router.get("/leaderboard", (req, res) => {
      const db = loadData();
      const sorted = Object.values(db)
          .filter(u => u.name)
          .sort((a, b) => (b.credits || 0) - (a.credits || 0))
          .map(u => ({ name: u.name, credits: u.credits }));
      res.json(sorted);
  });

  router.post("/daily", (req, res) => {
    const now = Date.now();
    const user = req.userData;
    
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const TWO_DAYS = 48 * 60 * 60 * 1000;
    
    if (user.lastDaily) {
        const timeSinceLast = now - user.lastDaily;
        if (timeSinceLast < ONE_DAY) {
            return res.status(400).json({ error: "Cooldown" });
        }
        
        // Hat der User einen Tag verpasst?
        if (timeSinceLast > TWO_DAYS) {
            user.dailyStreak = 1; // Streak gebrochen, fängt bei 1 an
        } else {
            user.dailyStreak += 1; // Streak bleibt erhalten
        }
    } else {
        // Erstes Mal eingesammelt
        user.dailyStreak = 1;
    }
    
    // Basis ist 500. Pro weiterem Tag in der Streak gibt es 100 Coins extra. 
    // Maximales Cap: z.B. 10 Tage (1500 Coins)
    const streakBonus = Math.min((user.dailyStreak - 1), 10) * 100;
    const rewardAmount = 500 + Math.max(0, streakBonus);
    
    user.credits += rewardAmount;
    user.lastDaily = now;
    saveData(req.casinoDb);
    
    // Push sofort ans Frontend falls offene Tabs existieren
    if (io) {
        io.to(`user:${req.twitchId}`).emit("casino_credit_update", { 
            credits: user.credits 
        });
    }

    res.json({ credits: user.credits, dailyStreak: user.dailyStreak, reward: rewardAmount });
  });

  // --- SLOTS (Sticky Wilds Layer + Scatter Retrigger) ---
  router.post("/play/slots", (req, res) => {
    let { bet } = req.body;
    const user = req.userData;

    // --- 1. Freispiel Check ---
    const isFreeSpin = user.freeSpinsLeft > 0;
    
    // Ursprünglichen Einsatz merken für die Gewinnberechnung in Freispielen
    // Wir nehmen an, dass das Frontend den ursprünglichen Bet mitschickt, oder wir nutzen 10 als Fallback
    const calculationBet = isFreeSpin ? (req.body.bet || 10) : bet;

    if (isFreeSpin) {
        bet = 0; // Kein Abzug bei Freispielen
    } else {
        if (bet < 0) return res.status(400).json({ error: "Ungültiger Einsatz" });
        if (bet > 0 && user.credits < bet) return res.status(400).json({ error: "Zu wenig Credits" });
        user.credits -= bet;
        user.stickyWilds = []; // Reset Sticky Wilds bei neuem normalen Spiel
    }

    // --- NEUE POOL LOGIK: "Balanced Variety" ---
    // Statt 60% Zitronen machen wir eine flachere Verteilung.
    // Das erhöht die Vielfalt auf dem Schirm, senkt aber die Chance, dass 
    // zufällig 3 gleiche Symbole in einer Linie landen.
    
    let pool = [];
    
    // Low Tier (Alle ca. gleich häufig -> schwerer zu matchen)
    for(let i=0; i<20; i++) pool.push("🍒"); 
    for(let i=0; i<18; i++) pool.push("🍋");
    for(let i=0; i<15; i++) pool.push("🍇");
    for(let i=0; i<12; i++) pool.push("🔔"); // Banane/Glocke
    
    // Mid/High Tier
    for(let i=0; i<8; i++) pool.push("💎");
    for(let i=0; i<4; i++) pool.push("7️⃣");  
    
    // Specials (Extrem selten!)
    // Nur EIN Joker im ganzen Deck -> Full Lines fast unmöglich
    const jokerCount = isFreeSpin ? 3 : 2; 
    for(let i=0; i<jokerCount; i++) pool.push("🃏"); 
    
    // Scatters (Freispiele)
    for(let i=0; i<2; i++) pool.push("🌟");
    
  

    const r = () => pool[Math.floor(Math.random() * pool.length)];
    // Wir generieren die Walzen "roh". Sticky Wilds überschreiben wir NICHT im Grid,
    // sondern senden sie separat zurück, damit das Frontend sie drüberlegen kann.
    // ABER: Für die Gewinnberechnung MÜSSEN wir sie hier einsetzen.
    
    const rawReels = Array(5).fill(null).map(() => [r(), r(), r()]);
    
    // Kopie für Gewinnberechnung erstellen
    const calculationReels = JSON.parse(JSON.stringify(rawReels));

    // Sticky Wilds in die Berechnung einfügen
    if (isFreeSpin && user.stickyWilds && user.stickyWilds.length > 0) {
        user.stickyWilds.forEach(({ col, row }) => {
            calculationReels[col][row] = "🃏"; 
        });
    }

    // Neue Sticky Wilds finden (Nur Joker, die noch keine Stickies waren)
    if (isFreeSpin) {
        // Bestehende Stickies behalten
        const currentStickies = [...(user.stickyWilds || [])];
        
        // Neue hinzufügen
        rawReels.forEach((col, colIdx) => {
            col.forEach((symbol, rowIdx) => {
                if (symbol === "🃏") {
                    // Check ob schon sticky
                    const exists = currentStickies.some(s => s.col === colIdx && s.row === rowIdx);
                    if (!exists) {
                        currentStickies.push({ col: colIdx, row: rowIdx });
                        // Auch in calculationReels updaten für diesen Spin!
                        calculationReels[colIdx][rowIdx] = "🃏";
                    }
                }
            });
        });
        user.stickyWilds = currentStickies;
    }

    // --- 3. Gewinnlinien (11 Lines) ---
    const linesDef = [
        [[0,1], [1,1], [2,1], [3,1], [4,1]], // Mitte
        [[0,0], [1,0], [2,0], [3,0], [4,0]], // Oben
        [[0,2], [1,2], [2,2], [3,2], [4,2]], // Unten
        [[0,0], [1,1], [2,2], [3,1], [4,0]], // V-Form
        [[0,2], [1,1], [2,0], [3,1], [4,2]], // Dach-Form

        [[0,0], [1,1], [2,1], [3,1], [4,0]], // ZickZack 1 (Boot oben)
        [[0,2], [1,1], [2,1], [3,1], [4,2]], // ZickZack 2 (Boot unten)

        [[0,1], [1,0], [2,0], [3,0], [4,1]], // ZickZack 3
        [[0,1], [1,2], [2,2], [3,2], [4,1]], // ZickZack 4

        [[0,0], [1,1], [2,0], [3,1], [4,0]], // W-Form oben
        [[0,2], [1,1], [2,2], [3,1], [4,2]], // W-Form unten
    ];

    let totalWin = 0;
    const winningLines = [];

    linesDef.forEach((path, lineIndex) => {
        const symbols = path.map(([c, r]) => calculationReels[c][r]);
        let firstSymbol = symbols.find(s => s !== "🃏");
        if (!firstSymbol) firstSymbol = "🃏"; 
        if (firstSymbol === "🌟") return; 

        let matchCount = 0;
        for (let s of symbols) {
            if (s === firstSymbol || (s === "🃏" && firstSymbol !== "🌟")) matchCount++;
            else break;
        }

        if (matchCount >= 3) {
            let baseMult = 0;
            if (firstSymbol === "🍒") baseMult = 1.0;
            else if (firstSymbol === "🍋") baseMult = 1.2;
            else if (firstSymbol === "🍇") baseMult = 1.5;
            else if (firstSymbol === "🔔") baseMult = 2.0;
            else if (firstSymbol === "💎") baseMult = 5.0;
            else if (firstSymbol === "7️⃣") baseMult = 10.0;
            else if (firstSymbol === "🃏") baseMult = 15.0;

            let lengthMult = 1; 
            // 3er Reihe = Standard (x1)
            // 4er Reihe = Nur noch x2 (statt x3)
            if (matchCount === 4) lengthMult = 3;  
            // 5er Reihe = Nur noch x5 (statt x10)
            if (matchCount === 5) lengthMult = 7;

            const win = Math.ceil(calculationBet * baseMult * lengthMult);
            totalWin += win;
            winningLines.push({ index: lineIndex, count: matchCount });
        }
    });
    
    // --- 4. Scatter Logic (Update) ---
    // Wir zählen Sterne in den *rohen* Walzen
    let scatterCount = 0;
    rawReels.forEach((col, cIdx) => {
        col.forEach((sym, rIdx) => {
            if (sym === "🌟") {
                // Prüfen, ob an dieser Stelle ein Sticky Wild liegt (aus user.stickyWilds)
                // Wichtig: Wir prüfen hier gegen die Liste VOR dem Hinzufügen neuer Stickies,
                // da diese bereits das Feld verdecken.
                const isCovered = isFreeSpin && user.stickyWilds && user.stickyWilds.some(w => w.col === cIdx && w.row === rIdx);
                
                if (!isCovered) {
                    scatterCount++;
                }
            }
        });
    });
    let newFreeSpins = 0;
    let justTriggered = false;
    
    if (isFreeSpin) {
        // RETRIGGER: Jeder Stern gibt +1 Spin
        if (scatterCount > 0) {
            user.freeSpinsLeft += scatterCount;
            newFreeSpins = scatterCount; // Für Frontend Info
        }
        user.freeSpinsLeft -= 1; // Den aktuellen Spin abziehen
    } else {
        // START TRIGGER:
        // 3 Scatter = 10 Spins
        // 4 Scatter = 15 Spins
        // 5 Scatter = 20 Spins
        if (scatterCount >= 3) {
            if (scatterCount === 3) newFreeSpins = 10;
            else if (scatterCount === 4) newFreeSpins = 15;
            else if (scatterCount >= 5) newFreeSpins = 20;
            
            user.freeSpinsLeft = newFreeSpins;
            justTriggered = true;
        }
    }

    // Aufräumen wenn vorbei
    if (user.freeSpinsLeft <= 0) {
        user.freeSpinsLeft = 0;
        user.stickyWilds = [];
    }

    user.credits += totalWin;
    saveData(req.casinoDb);

    // Wir senden calculationReels zurück, damit der User sieht warum er gewonnen hat (Sticky Wilds an ihrem Platz)
    // ABER: Das Frontend muss wissen, welche davon "Sticky" sind, um sie nicht zu drehen.
    res.json({ 
        reels: calculationReels, 
        winAmount: totalWin, 
        winningLines, 
        newFreeSpins, 
        freeSpinsLeft: user.freeSpinsLeft || 0,
        credits: user.credits,
        stickyWilds: user.stickyWilds || [], // Koordinaten für Frontend Overlay
        isFreeSpinTrigger: justTriggered
    });
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
  // UPDATE: Case Opening mit 'count' Parameter
  router.post("/play/case", (req, res) => {
    const { bet, count = 1 } = req.body; // Default 1
    const actualCount = Math.max(1, Math.min(3, count)); // Max 3 Cases
    const totalBet = bet * actualCount;

    if (totalBet <= 0 || req.userData.credits < totalBet) return res.status(400).json({ error: "Zu wenig Credits" });
    
    req.userData.credits -= totalBet;

    const results = [];
    let totalWin = 0;

    for(let c = 0; c < actualCount; c++) {
        // Items generieren
        const items = [];
        const WIN_INDEX = 40; 
        const TOTAL_ITEMS = 50;

        for(let i=0; i<TOTAL_ITEMS; i++) {
            items.push(generateSpecificItem());
        }

        const winner = items[WIN_INDEX];
        const winAmount = Math.floor(bet * winner.multiplier); // Gewinn pro Case Basis
        totalWin += winAmount;
        
        results.push({
            items,
            winIndex: WIN_INDEX,
            winner,
            winAmount
        });
    }
    
    req.userData.credits += totalWin;
    saveData(req.casinoDb);

    res.json({ results, totalWin, credits: req.userData.credits });
  });

  router.post("/play/highlow", (req, res) => {
    const { bet, guess } = req.body; 
    if (bet <= 0 || req.userData.credits < bet) return res.status(400).json({ error: "Credits" });
    req.userData.credits -= bet;
    const number = Math.floor(Math.random() * 100) + 1; 
    let won = false;
    if (guess === "low" && number <= 50) won = true;
    if (guess === "high" && number > 50) won = true;
    const winAmount = won ? Math.floor(bet * 2) : 0; 
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
    req.userData.activeGame = { type: "guess", bet, target: Math.floor(Math.random() * 100) + 1, triesLeft: 6, history: [] };
    saveData(req.casinoDb);
    res.json({ status: "started", triesLeft: 6, credits: req.userData.credits });
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
      const multipliers = { 5: 20, 4: 12, 3: 8, 2: 4, 1: 2.5, 0: 2 }; 
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

  // --- PLINKO ROUTE ---
  // --- PLINKO ROUTE (Batch / Massen-Drop) ---
  router.post("/play/plinko", (req, res) => {
    const db = loadData();
    const user = db[req.twitchId];
    if (!user) return res.status(400).json({ error: "User nicht gefunden" });

    // count default auf 1
    let { bet, risk = 'medium', rows = 12, count = 1 } = req.body;
    
    // Limits
    count = Math.max(1, Math.min(count, 1000)); 

    // Validierung
    if (![8, 12, 16].includes(rows)) return res.status(400).json({ error: "Ungültige Reihen" });
    if (!['low', 'medium', 'high'].includes(risk)) return res.status(400).json({ error: "Ungültiges Risiko" });

    const totalBet = bet * count;

    if (totalBet <= 0 || user.credits < totalBet) {
        return res.status(400).json({ error: "Nicht genug Credits!" });
    }

    // --- BERECHNUNG ---
    let totalWin = 0;
    const results = [];

    for (let i = 0; i < count; i++) {
        const path = generatePlinkoPath(rows);
        const bucketIndex = path.reduce((a, b) => a + b, 0);
        const multipliers = PLINKO_MULTIPLIERS[rows][risk];
        const multiplier = multipliers[bucketIndex];
        const win = Math.floor(bet * multiplier);
        
        totalWin += win;
        
        results.push({
            path,
            bucketIndex,
            multiplier,
            winAmount: win
        });
    }

    // --- DATENBANK UPDATE (Sofortiger Endstand) ---
    user.credits -= totalBet; // Einsatz weg
    user.credits += totalWin; // Gewinn drauf
    saveData(db);

    // Wir senden die Einzelergebnisse UND den finalen Kontostand zurück
    res.json({
      results, 
      totalBet,
      totalWin,
      finalCredits: user.credits // Das ist der "echte" Wert am Ende
    });
  });


  // NEU: Roulette Route
  router.post("/play/roulette/spin", (req, res) => {
      const { bets } = req.body; // Array von Wetten [{type: 'color', value: 'red', amount: 10}, ...]
      
      if (!bets || !Array.isArray(bets) || bets.length === 0) {
          return res.status(400).json({ error: "Keine Einsätze" });
      }

      // Gesamteinsatz berechnen
      const totalBet = bets.reduce((sum, b) => sum + (parseInt(b.amount) || 0), 0);
      
      if (totalBet <= 0 || req.userData.credits < totalBet) {
          return res.status(400).json({ error: "Zu wenig Credits" });
      }

      req.userData.credits -= totalBet;

      // Spin
      const result = getRouletteResult(); // { number: 17, color: 'black' }
      
      // Gewinne checken
      const winAmount = calculateRoulettePayout(bets, result.number, result.color);

      req.userData.credits += winAmount;
      saveData(req.casinoDb);

      res.json({ 
          result, 
          winAmount, 
          credits: req.userData.credits 
      });
  });

  // --- DICE ROUTE ---
  router.post("/play/dice", (req, res) => {
    // 1. DB Laden
    const db = loadData();
    const user = db[req.twitchId];
    if (!user) return res.status(400).json({ error: "User nicht gefunden" });

    const { bet, target, condition } = req.body; 
    // target: 2 bis 98
    // condition: 'under' oder 'over'

    // Validierung
    if (bet <= 0 || user.credits < bet) return res.status(400).json({ error: "Zu wenig Credits" });
    if (target < 2 || target > 98) return res.status(400).json({ error: "Ziel ungültig (2-98)" });

    // Einsatz abziehen
    user.credits -= bet;

    // Würfeln (0.00 bis 100.00)
    const roll = Math.random() * 100;
    
    // Gewinn prüfen
    let isWin = false;
    let winChance = 0;

    if (condition === 'under') {
        isWin = roll < target;
        winChance = target;
    } else { // 'over'
        isWin = roll > target;
        winChance = 100 - target;
    }

    // Hausvorteil (1% = 0.99 RTP)
    const houseEdge = 0.99;
    // Multiplikator berechnen (auf 4 Kommastellen genau)
    const multiplier = (100 / winChance) * houseEdge;
    
    let winAmount = 0;
    if (isWin) {
        winAmount = Math.floor(bet * multiplier);
        user.credits += winAmount;
    }

    saveData(db);

    res.json({
        roll: parseFloat(roll.toFixed(2)), // Zahl formatieren z.B. 45.23
        isWin,
        multiplier: parseFloat(multiplier.toFixed(4)),
        winAmount,
        credits: user.credits
    });
  });


  return router;
};