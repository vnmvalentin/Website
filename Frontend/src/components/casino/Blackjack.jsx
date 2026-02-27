import React, { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import CoinIcon from "../CoinIcon";
import { Club, Diamond, Heart, Spade, RotateCcw, Play, Hand, ChevronsUp, Plus } from "lucide-react";

// --- LOGIC HELPERS ---
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

// --- MODERN CARD COMPONENT ---
const Card = ({ card, index, isHidden, isRevealing, isDealer, playSound }) => {
  if (!isHidden && !card) return null;
  const isRed = card && ["♥", "♦"].includes(card.suit);
  
  const SuitIcon = card ? {
      "♥": Heart, "♦": Diamond, "♣": Club, "♠": Spade
  }[card.suit] : null;

  let animationClass = "";
  if (isHidden) {
      animationClass = "animate-deal-card";
  } else if (isRevealing) {
      animationClass = "animate-flip-card";
  } else {
      if (isDealer && index === 1) {
          animationClass = ""; 
      } else {
          animationClass = "animate-deal-card";
      }
  }

  let delay = 0;
  if (!isRevealing && animationClass !== "") {
      if (isDealer) {
          delay = index === 0 ? 0.2 : (index === 1 ? 0.6 : 0);
      } else {
          delay = index === 0 ? 0 : (index === 1 ? 0.4 : 0);
      }
  }

  const styleDelay = animationClass ? { animationDelay: `${delay}s` } : {};

  const handleAnimationStart = (e) => {
      if (e.animationName === "deal-card" || e.animationName === "flip-card") {
          if (playSound) playSound();
      }
  };

  if (isHidden) {
    return (
      <div 
        onAnimationStart={handleAnimationStart}
        style={styleDelay} 
        className={`w-24 h-36 bg-gradient-to-br from-red-900 to-red-800 rounded-xl border-2 border-white/10 shadow-2xl flex items-center justify-center ${animationClass}`}
      >
        <div className="w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
      </div>
    );
  }

  return (
    <div 
        onAnimationStart={handleAnimationStart}
        style={styleDelay} 
        className={`relative w-24 h-36 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-2 select-none transform transition-transform hover:-translate-y-2 ${animationClass}`}
    >
      <div className={`text-xl font-black self-start leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}>
          {card.value}
          <div className="mt-1"><SuitIcon size={14} fill="currentColor" /></div>
      </div>
      
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 ${isRed ? "text-red-600" : "text-slate-900"}`}>
          <SuitIcon size={48} fill="currentColor" />
      </div>

      <div className={`text-xl font-black self-end leading-none rotate-180 ${isRed ? "text-red-600" : "text-slate-900"}`}>
          {card.value}
          <div className="mt-1"><SuitIcon size={14} fill="currentColor" /></div>
      </div>
    </div>
  );
};

export default function Blackjack({ updateCredits, currentCredits }) {
  const context = useOutletContext();
  const isMuted = context?.isMuted || false;

  const [gameState, setGameState] = useState(null);
  const [bet, setBet] = useState(100);
  const [showResult, setShowResult] = useState(false); 
  const [isDealing, setIsDealing] = useState(false);
  const [isRevealingDealer, setIsRevealingDealer] = useState(false);
  const [error, setError] = useState("");

  // --- AUDIO SETUP ---
  const cardAudios = useRef([]);
  const clickAudio = useRef(null);
  const winAudio = useRef(null);
  const loseAudio = useRef(null);

  useEffect(() => {
      cardAudios.current = Array.from({ length: 10 }).map(() => {
          const audio = new Audio("/assets/sounds/blackjack/cards.mp3");
          audio.volume = 0.2;
          return audio;
      });

      clickAudio.current = new Audio("/assets/sounds/blackjack/click.mp3");
      clickAudio.current.volume = 0.05;

      winAudio.current = new Audio("/assets/sounds/blackjack/win.mp3");
      winAudio.current.volume = 0.2;

      loseAudio.current = new Audio("/assets/sounds/blackjack/lose.mp3");
      loseAudio.current.volume = 0.2;
  }, []);

  // Sync Mute State
  useEffect(() => {
      const allAudios = [...cardAudios.current, clickAudio.current, winAudio.current, loseAudio.current];
      allAudios.forEach(audio => {
          if (audio) audio.muted = isMuted;
      });
  }, [isMuted]);

  // Win/Lose Sound triggern, wenn Result Screen auftaucht
  useEffect(() => {
      if (showResult && gameState && !isMuted) {
          if (gameState.status === 'push') {
              // Unentschieden: Kein spezieller Sound
          } else if (gameState.status === 'blackjack' || gameState.winAmount > 0) {
              if (winAudio.current) {
                  winAudio.current.currentTime = 0;
                  winAudio.current.play().catch(e => console.log(e));
              }
          } else {
              if (loseAudio.current) {
                  loseAudio.current.currentTime = 0;
                  loseAudio.current.play().catch(e => console.log(e));
              }
          }
      }
  }, [showResult, gameState, isMuted]);

  // Click Sound Funktion
  const playClickSound = () => {
      if (isMuted || !clickAudio.current) return;
      clickAudio.current.currentTime = 0;
      clickAudio.current.play().catch(e => console.log(e));
  };

  const unlockAudio = () => {
      const allAudios = [...cardAudios.current, clickAudio.current, winAudio.current, loseAudio.current];
      allAudios.forEach(audio => {
          if (audio && audio.paused && audio.currentTime === 0) {
              audio.muted = true; 
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                  playPromise.then(() => {
                      audio.pause();
                      audio.currentTime = 0;
                      audio.muted = isMuted; 
                  }).catch(() => {});
              }
          }
      });
  };

  const playCardSound = () => {
      if (isMuted) return;
      const availableAudio = cardAudios.current.find(a => a.paused || a.ended) || cardAudios.current[0];
      if (availableAudio) {
          availableAudio.currentTime = 0;
          availableAudio.play().catch(e => console.log("Sound error:", e));
      }
  };

  // --- LOGIC ---
  const deal = async () => {
    playClickSound(); // Click Sound
    setError("");
    if (bet > currentCredits) { setError("Nicht genug Credits!"); return; }
    if (bet <= 0) { setError("Ungültiger Einsatz!"); return; }

    unlockAudio(); 

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
        
        if(data.error) { setError(data.error); setIsDealing(false); return; }
        
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

  const action = async (act) => {
    playClickSound(); // Click Sound
    setError("");
    if (act === "double" && currentCredits < gameState.bet) {
        setError("Nicht genug Credits für Double!");
        return;
    }

    unlockAudio();

    setShowResult(false);
    setIsDealing(true);

    try {
        const res = await fetch("/api/casino/play/blackjack/action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: act }), credentials: "include"
        });
        const data = await res.json();
        
        if (data.error) {
            setError(data.error);
            setIsDealing(false);
            return;
        }

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

  // --- RENDER ---
  if (!gameState && !isDealing) {
     return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-[#0a1f13] rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/40 via-[#0a1f13] to-black opacity-80 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-10 pointer-events-none"></div>
        
        <div className="relative z-10 text-center animate-in zoom-in-95 duration-500">
            <h2 className="text-4xl font-black mb-1 text-white flex items-center justify-center gap-3">
                <Spade className="text-emerald-500 fill-current" /> BLACKJACK
            </h2>
            <p className="text-white/40 text-sm mb-8 font-medium">Dealer zieht bis 16, steht bei 17</p>
            
            <div className="bg-black/40 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
                <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Dein Einsatz</div>
                <div className="flex items-center justify-center gap-4">
                    <input 
                        type="number" 
                        value={bet} 
                        onChange={e => { setBet(Number(e.target.value)); setError(""); }} 
                        className="bg-black/50 border border-white/10 text-white rounded-xl px-4 py-2 w-32 font-mono font-bold text-center focus:border-emerald-500 outline-none text-xl" 
                    />
                    <button onClick={deal} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-8 py-3 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all flex items-center gap-2">
                        <Play size={20} fill="currentColor" /> DEAL
                    </button>
                </div>
            </div>
            {error && <div className="mt-4 text-red-400 font-bold bg-red-900/20 px-4 py-2 rounded-lg border border-red-900/50 animate-pulse">{error}</div>}
        </div>
      </div>
    );
  }

  if ((!gameState) && isDealing) {
      return (
        <div className="h-[500px] bg-[#0a1f13] rounded-3xl border border-white/10 flex flex-col items-center justify-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-10 pointer-events-none"></div>
            <div className="animate-spin mb-4"><RotateCcw size={40} className="text-emerald-500 opacity-50" /></div>
            <span className="font-bold text-lg text-emerald-100/50 animate-pulse">Mische Karten...</span>
        </div>
      );
  }
  
  if (!gameState) return null;

  const safeDealerHand = gameState.dealerHand || [];
  const safePlayerHand = gameState.playerHand || [];
  const playerScore = calculateClientScore(safePlayerHand);
  const visibleDealerCards = safeDealerHand.filter(c => c !== null);
  const dealerScore = calculateClientScore(visibleDealerCards);

  return (
    <div className="relative flex flex-col items-center justify-between py-8 min-h-[500px] bg-[#0a1f13] rounded-3xl border border-white/10 shadow-2xl overflow-hidden z-10 select-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/30 via-[#0a1f13] to-black opacity-80 pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-10 pointer-events-none"></div>

      {/* Dealer Bereich */}
      <div className="flex flex-col items-center z-10 w-full">
        <div className="flex justify-center gap-[-4rem] mb-4 min-h-[144px]">
          {safeDealerHand.map((card, i) => (
             <div key={i} className={i > 0 ? "-ml-12" : ""}>
                <Card 
                  card={card} 
                  index={i} 
                  isDealer={true} 
                  isHidden={card === null} 
                  isRevealing={i === 1 && isRevealingDealer} 
                  playSound={playCardSound} 
                />
             </div>
          ))}
        </div>
        <div className="bg-black/40 backdrop-blur px-4 py-1.5 rounded-full text-xs font-bold text-white/80 border border-white/10 shadow-lg flex items-center gap-2">
            <span className="uppercase text-white/40">Dealer</span>
            <span className="font-mono text-lg">{dealerScore}</span>
        </div>
      </div>

      {/* Result Overlay */}
      {gameState.status !== "playing" && showResult && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#18181b] border border-white/10 p-8 rounded-3xl text-center shadow-2xl transform scale-110 relative overflow-hidden">
            <div className={`absolute inset-0 opacity-20 ${gameState.winAmount > 0 ? "bg-green-500" : "bg-red-500"}`}></div>
            <h2 className="relative text-3xl font-black text-white mb-2 uppercase tracking-wide drop-shadow-md">
                {gameState.status === 'push' ? 'Unentschieden' : gameState.status === 'blackjack' ? 'Blackjack!' : gameState.winAmount > 0 ? 'Gewonnen!' : 'Verloren'}
            </h2>
            
            {gameState.winAmount > 0 ? (
                <p className="relative text-green-400 font-black text-4xl mb-6 flex items-center justify-center gap-2 drop-shadow-sm">
                    +{gameState.winAmount} <CoinIcon size="w-8 h-8" />
                </p>
            ) : (
                <p className="relative text-red-400 font-bold text-xl mb-6">-{bet} Credits</p>
            )}

            <button onClick={() => { playClickSound(); setGameState(null); setShowResult(false); }} className="relative bg-white hover:bg-gray-200 text-black font-bold px-8 py-3 rounded-xl shadow-xl transition-transform hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto">
                <RotateCcw size={18} /> Nächste Runde
            </button>
          </div>
        </div>
      )}

      {/* Player Bereich */}
      <div className="flex flex-col items-center z-10 w-full pb-4">
        <div className="bg-black/40 backdrop-blur px-4 py-1.5 rounded-full text-xs font-bold text-white/80 border border-white/10 shadow-lg mb-6 flex items-center gap-2">
            <span className="uppercase text-white/40">Du</span>
            <span className={`font-mono text-lg ${playerScore > 21 ? "text-red-500" : "text-white"}`}>{playerScore}</span>
        </div>

        <div className="flex justify-center mb-8 relative w-full px-10">
            <div className="flex justify-center">
                {safePlayerHand.map((c, i) => (
                    <div key={`${c.value}-${c.suit}-${i}`} className={i > 0 ? "-ml-12" : ""}>
                        <Card 
                          card={c} 
                          index={i} 
                          isDealer={false} 
                          playSound={playCardSound} 
                        />
                    </div>
                ))}
            </div>
        </div>
        
        {/* Controls */}
        <div className="flex flex-col items-center gap-3 w-full px-4">
            {error && <div className="text-red-400 font-bold text-xs bg-red-900/30 px-3 py-1 rounded border border-red-500/30 animate-pulse">{error}</div>}

            <div className="flex gap-3">
            {gameState.status === "playing" && !isDealing && (
                <>
                <button onClick={() => action("hit")} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-4 rounded-xl shadow-[0_4px_0_rgb(6,78,59)] border-b-0 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
                    <Plus size={20} strokeWidth={4} /> HIT
                </button>
                <button onClick={() => action("stand")} className="bg-red-600 hover:bg-red-500 text-white font-black px-6 py-4 rounded-xl shadow-[0_4px_0_rgb(127,29,29)] border-b-0 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
                    <Hand size={20} /> STAND
                </button>
                
                {/* Double Button */}
                {safePlayerHand.length === 2 && (gameState.bet * 2 <= 5000) && (currentCredits >= gameState.bet) && (
                    <button 
                        onClick={() => action("double")} 
                        className="bg-amber-500 hover:bg-amber-400 text-black font-black px-6 py-4 rounded-xl shadow-[0_4px_0_rgb(180,83,9)] border-b-0 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2"
                    >
                        <ChevronsUp size={20} /> DOUBLE
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
        .animate-deal-card { animation: deal-card 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
        .animate-flip-card { animation: flip-card 0.6s ease-in-out forwards; }
      `}</style>
    </div>
  );
}