import React, { useState, useEffect } from "react";
import CoinIcon from "../CoinIcon";

function calculateClientScore(hand) {
  if (!hand || !Array.isArray(hand)) return 0;
  let score = 0;
  let aces = 0;
  hand.forEach(c => {
    if(!c) return;
    if (["J","Q","K"].includes(c.value)) score += 10;
    else if (c.value === "A") { score += 11; aces++; }
    else score += parseInt(c.value);
  });
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

// --- CARD COMPONENT (Bleibt unverändert, aber muss dabei sein) ---
const Card = ({ card, index, isHidden, isRevealing, isDealer }) => {
  if (!isHidden && !card) return null;
  const isRed = card && ["♥", "♦"].includes(card.suit);
  let animationClass = "";
  let baseOpacity = "";

  if (isHidden) {
      animationClass = "animate-deal-card"; 
      baseOpacity = "opacity-0"; 
  } else if (isRevealing) {
      animationClass = "animate-flip-card"; 
  } else {
      if (isDealer && index === 1) {
          animationClass = ""; 
      } else {
          animationClass = "animate-deal-card";
          baseOpacity = "opacity-0"; 
      }
  }
  const styleDelay = { animationDelay: `${isRevealing ? 0 : index * 0.2}s` };

  if (isHidden) {
    return (
      <div style={styleDelay} className={`w-20 h-28 bg-red-900 border-2 border-white rounded-lg shadow-xl flex items-center justify-center ${baseOpacity} ${animationClass}`}>
        <span className="text-4xl select-none">🐉</span>
      </div>
    );
  }
  return (
    <div style={styleDelay} className={`w-20 h-28 bg-white rounded-lg shadow-xl flex flex-col items-center justify-between p-2 border border-gray-300 transform ${baseOpacity} ${animationClass}`}>
      <span className={`text-xl font-bold self-start ${isRed ? "text-red-600" : "text-black"}`}>{card.value}{card.suit}</span>
      <span className={`text-4xl ${isRed ? "text-red-600" : "text-black"}`}>{card.suit}</span>
      <span className={`text-xl font-bold self-end ${isRed ? "text-red-600" : "text-black"}`}>{card.value}{card.suit}</span>
    </div>
  );
};

// WICHTIG: currentCredits hinzugefügt
export default function Blackjack({ updateCredits, currentCredits }) {
  const [gameState, setGameState] = useState(null);
  const [bet, setBet] = useState(100);
  const [showResult, setShowResult] = useState(false); 
  const [isDealing, setIsDealing] = useState(false);
  const [isRevealingDealer, setIsRevealingDealer] = useState(false);
  const [error, setError] = useState(""); // Neuer Error State

  // START
  const deal = async () => {
    setError(""); // Reset
    
    // Client Check
    if (bet > currentCredits) {
        setError("Nicht genug Credits!");
        return;
    }
    if (bet <= 0) {
        setError("Ungültiger Einsatz!");
        return;
    }

    setIsDealing(true);
    setShowResult(false);
    setGameState(null); 
    setIsRevealingDealer(false);

    try {
        const res = await fetch("/api/casino/play/blackjack/deal", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bet }), credentials: "include"
        });
        const data = await res.json();
        
        if(data.error) { 
            setError(data.error); 
            setIsDealing(false); 
            return; 
        }
        
        const preparedState = {
            ...data,
            dealerHand: [data.dealerUpCard, null],
            bet: bet

        };

        setGameState(preparedState);
        updateCredits();

        setTimeout(() => {
            if(data.status === 'blackjack') {
                setGameState(prev => ({ ...prev, dealerHand: data.dealerHand }));
                setTimeout(() => setShowResult(true), 1000);
            }
            setIsDealing(false);
        }, 1200); 

    } catch(e) { console.error(e); setError("Fehler beim Starten"); setIsDealing(false); }
  };

  // ACTIONS (Hit, Stand, Double)
  const action = async (act) => {
    setError(""); // Reset Error im Spiel
    
    // Client Check für Double Down
    if (act === "double") {
        if (currentCredits < gameState.bet) {
            setError("Nicht genug Credits für Double!");
            return;
        }
    }

    setShowResult(false);
    setIsDealing(true);

    try {
        const res = await fetch("/api/casino/play/blackjack/action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: act }), credentials: "include"
        });
        
        // ÄNDERUNG: Wir lesen ZUERST die Daten, egal ob Status 200 oder 400
        const data = await res.json();
        
        // Wenn der Request fehlschlug (z.B. 400 Bad Request), prüfen wir auf eine Error-Message
        if (!res.ok) {
            if (data.error) {
                setError(data.error); // Hier setzen wir "Zu wenig Credits..."
                setIsDealing(false);
                return;
            }
            // Wenn keine spezifische Error-Message da ist, werfen wir einen generischen Fehler
            throw new Error("Server Error");
        }

        // --- 1. HIT oder DOUBLE (Player zieht) ---
        if (act === "hit" || (act === "double" && data.status === "bust")) {
            setGameState(prev => ({ 
                ...prev, 
                playerHand: data.playerHand,
                status: data.status,
                winAmount: data.winAmount,
                dealerHand: (data.status === "bust") ? data.dealerHand : prev.dealerHand 
            }));
            
            if (data.status !== "playing") updateCredits();
            
            if (data.status !== "playing") {
                setTimeout(() => {
                    setShowResult(true);
                    setIsDealing(false);
                }, 1500);
            } else {
                setTimeout(() => setIsDealing(false), 600);
            }
            return;
        }

        // --- 2. STAND (oder Double ohne Bust) -> Dealer Turn ---
        if (act === "stand" || (act === "double" && data.status !== "bust")) {
             const finalDealerHand = data.dealerHand || [];
             setIsRevealingDealer(true);
             setGameState(prev => ({
                 ...prev, playerHand: data.playerHand, dealerHand: finalDealerHand.slice(0, 2), status: "playing"
             }));

             let currentCardCount = 2;
             const totalCards = finalDealerHand.length;

             setTimeout(() => {
                 setIsRevealingDealer(false); 
                 if (currentCardCount === totalCards) {
                     setTimeout(() => finishGame(data), 1000);
                 } else {
                     const interval = setInterval(() => {
                         if (currentCardCount < totalCards) {
                             currentCardCount++;
                             setGameState(prev => ({ ...prev, dealerHand: finalDealerHand.slice(0, currentCardCount) }));
                             if (currentCardCount === totalCards) {
                                 clearInterval(interval);
                                 setTimeout(() => finishGame(data), 1500); 
                             }
                         } 
                     }, 1000); 
                 }
             }, 800); 
        }
    } catch(e) { console.error(e); setError("Verbindungsfehler"); setIsDealing(false); }
  };

  const finishGame = (data) => {
      setGameState(prev => ({ ...prev, ...data }));
      updateCredits();
      setShowResult(true);
      setIsDealing(false);
  };

  // --- UI ---
  // SCREEN 1: Start Screen
  if (!gameState && !isDealing) {
     return (
      <div className="flex flex-col items-center justify-center h-96 bg-green-900 rounded-2xl border-8 border-yellow-900 shadow-inner">
        <h2 className="text-3xl font-bold mb-4 text-yellow-400 drop-shadow-md">Blackjack Tisch</h2>
        
        <div className="flex flex-col items-center gap-2">
            <div className="flex gap-4 items-center bg-black/40 p-4 rounded-xl">
            <span className="font-bold">Einsatz:</span>
            <input 
                type="number" 
                value={bet} 
                onChange={e => { setBet(Number(e.target.value)); setError(""); }} 
                className="bg-white text-black rounded px-2 py-1 w-24 font-bold text-center" 
            />
            <button onClick={deal} className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded shadow-lg active:scale-95 transition">DEAL</button>
            </div>
            {/* Error Anzeige im Start Screen */}
            {error && <div className="text-red-400 font-bold bg-black/60 px-4 py-1 rounded animate-pulse">{error}</div>}
        </div>
      </div>
    );
  }

  // SCREEN 2: Shuffling
  if ((!gameState) && isDealing) {
      return <div className="h-96 bg-green-900 rounded-2xl flex items-center justify-center text-white text-xl animate-pulse">Mische Karten...</div>;
  }
  
  if (!gameState) return null;

  // SCREEN 3: Active Game
  const safeDealerHand = gameState.dealerHand || [];
  const safePlayerHand = gameState.playerHand || [];
  const playerScore = calculateClientScore(safePlayerHand);
  const visibleDealerCards = safeDealerHand.filter(c => c !== null);
  const dealerScore = calculateClientScore(visibleDealerCards);

  return (
    <div className="relative flex flex-col items-center justify-between py-8 min-h-[500px] bg-green-800 rounded-2xl border-8 border-yellow-900 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] overflow-hidden z-10">
      
      {/* Dealer Bereich */}
      <div className="flex flex-col items-center z-10">
        <div className="flex gap-2 mb-2 min-h-[112px]">
          {safeDealerHand.map((card, i) => (
             <Card key={i} card={card} index={i} isDealer={true} isHidden={card === null} isRevealing={i === 1 && isRevealingDealer} />
          ))}
        </div>
        <div className="bg-black/50 px-3 py-1 rounded-full text-sm font-bold border border-white/20 shadow-lg">
            Dealer: {dealerScore}
        </div>
      </div>

      {/* Result Overlay */}
      {gameState.status !== "playing" && showResult && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 animate-in fade-in zoom-in duration-300">
          <div className="bg-black/90 backdrop-blur border-4 border-yellow-500 p-8 rounded-2xl text-center shadow-2xl transform scale-110">
            <h2 className="text-4xl font-extrabold text-yellow-400 mb-2 uppercase">{gameState.status === 'push' ? 'Unentschieden' : gameState.status + '!'}</h2>
            {gameState.winAmount > 0 ? <p className="text-green-400 font-bold text-2xl">+{gameState.winAmount} <CoinIcon size="w-6 h-6" /></p> : <p className="text-red-400">Verloren</p>}
            <button onClick={() => { setGameState(null); setShowResult(false); }} className="mt-4 bg-white hover:bg-gray-200 text-black font-bold px-6 py-3 rounded-full shadow-lg">Nächste Runde</button>
          </div>
        </div>
      )}

      {/* Player Bereich */}
      <div className="flex flex-col items-center z-10 w-full">
        <div className="bg-black/50 px-3 py-1 rounded-full text-sm font-bold mb-2 border border-white/20">Du: {playerScore}</div>
        <div className="flex gap-2 justify-center mb-6 min-h-[112px]">
           {safePlayerHand.map((c, i) => (
             <Card key={`${c.value}-${c.suit}-${i}`} card={c} index={i} isDealer={false} />
           ))}
        </div>
        
        {/* Controls & Error */}
        <div className="flex flex-col items-center gap-2">
            {/* Error Anzeige im Spiel (z.B. für Double Down) */}
            {error && <div className="text-red-400 font-bold bg-black/60 px-4 py-1 rounded animate-pulse">{error}</div>}

            <div className="flex gap-4 h-16">
            {gameState.status === "playing" && !isDealing && (
                <>
                <button onClick={() => action("hit")} className="bg-green-600 hover:bg-green-500 text-white font-bold w-24 rounded-xl shadow-[0_4px_0_rgb(22,101,52)] border-b-0 active:translate-y-1 active:shadow-none transition-all">HIT</button>
                <button onClick={() => action("stand")} className="bg-red-600 hover:bg-red-500 text-white font-bold w-24 rounded-xl shadow-[0_4px_0_rgb(153,27,27)] border-b-0 active:translate-y-1 active:shadow-none transition-all">STAND</button>
                
                {/* Double Button Check: Wird nur angezeigt, wenn mathematisch möglich, Error Check passiert im Handler */}
                {safePlayerHand.length === 2 && (gameState.bet * 2 <= 5000) && (currentCredits >= gameState.bet) && (
                    <button 
                        onClick={() => action("double")} 
                        className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold w-24 rounded-xl shadow-[0_4px_0_rgb(161,98,7)] border-b-0 active:translate-y-1 active:shadow-none transition-all"
                    >
                        DOUBLE
                    </button>
                )}
                </>
            )}
            </div>
        </div>
      </div>
      
      <style>{`
        @keyframes deal-card { from { opacity: 0; transform: translateY(-50px) scale(0.5); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes flip-card { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(90deg); background: #7f1d1d; } 100% { transform: rotateY(0deg); } }
        .animate-deal-card { animation: deal-card 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-flip-card { animation: flip-card 0.6s ease-in-out forwards; }
      `}</style>
    </div>
  );
}