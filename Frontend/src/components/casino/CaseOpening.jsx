import React, { useState, useRef, useEffect } from "react";
import confetti from "canvas-confetti"; 
import CoinIcon from "../CoinIcon";
import { Package, Box } from "lucide-react";

const ITEM_WIDTH = 120; 
const GAP = 8;          
const FULL_ITEM_WIDTH = ITEM_WIDTH + GAP; // 128px

// --- ROW COMPONENT (Original Logic + Modern Style) ---
function CaseRow({ result, isRolling, rowIndex }) {
  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  // Farben-Helper (Modernisiert: Glows & Borders)
  const getColorClasses = (c) => {
      switch(c) {
          case 'gold': return 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)] text-yellow-400';
          case 'purple': return 'bg-purple-500/10 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] text-purple-400';
          case 'blue': return 'bg-blue-500/10 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] text-blue-400';
          default: return 'bg-gray-800/50 border-gray-600 text-gray-400'; // Gray/Common
      }
  };

  useEffect(() => {
    if (result && isRolling) {
         // Kurze Verzögerung für Start, damit der Browser den Reset vorher rendert
         setTimeout(() => {
            if (scrollRef.current && containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const centerOfContainer = containerWidth / 2;
                
                // Original Logik: winnerCenterPosition
                const winnerCenterPosition = (result.winIndex * FULL_ITEM_WIDTH) + (ITEM_WIDTH / 2);
                
                // Jitter (Randomness)
                const jitter = Math.floor(Math.random() * 50) - 25; 
                
                // Finaler Translate-Wert (negativ, um nach links zu schieben)
                const finalTranslate = -(winnerCenterPosition - centerOfContainer + jitter);
    
                // Dynamische Transition (länger für untere Reihen)
                scrollRef.current.style.transition = `transform ${6 + rowIndex * 0.5}s cubic-bezier(0.15, 1, 0.3, 1)`; 
                scrollRef.current.style.transform = `translateX(${finalTranslate}px)`;
            }
          }, 50);
    } else if (!result && isRolling) {
        // RESET (Start einer neuen Runde): Transition aus, Offset 0
        if (scrollRef.current) {
            scrollRef.current.style.transition = "none";
            scrollRef.current.style.transform = "translateX(0px)";
        }
    }
  }, [result, isRolling, rowIndex]);

  return (
      <div 
        ref={containerRef} 
        className="relative w-full h-40 bg-[#0a0a0f] rounded-xl border-4 border-[#1a1a20] shadow-[inset_0_0_20px_black] overflow-hidden mb-4 last:mb-0"
      >
         {/* Center Marker */}
         <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-yellow-500 z-30 shadow-[0_0_15px_yellow] transform -translate-x-1/2 opacity-80">
             <div className="absolute top-0 -translate-x-1/2 text-yellow-500 text-[10px]">▼</div>
             <div className="absolute bottom-0 -translate-x-1/2 text-yellow-500 text-[10px]">▲</div>
         </div>
         
         {/* Fade Edges */}
         <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black to-transparent z-20 pointer-events-none"></div>
         <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black to-transparent z-20 pointer-events-none"></div>

         <div 
            ref={scrollRef}
            className="absolute top-1/2 -translate-y-1/2 flex items-center pl-4 will-change-transform"
            style={{ gap: GAP }}
         >
            {/* 1. Placeholder wenn noch nix passiert ist */}
            {!result && !isRolling ? (
                Array.from({length: 10}).map((_, i) => (
                    <div key={i} className="w-[120px] h-[100px] bg-white/5 rounded-lg border border-white/5 flex items-center justify-center">
                        <Package size={24} className="opacity-20" />
                    </div>
                ))
            ) : (
                /* 2. Echte Items während Spin/Result */
                (result ? result.items : Array.from({length: 50})).map((item, i) => (
                    <div 
                        key={i} 
                        style={{ width: ITEM_WIDTH, height: 100 }}
                        className={`flex-shrink-0 rounded-lg border-2 flex flex-col items-center justify-center relative ${item ? getColorClasses(item.color) : 'bg-gray-800 border-gray-700'}`}
                    >
                        {item ? (
                            <>
                                <div className="mb-2 scale-110 drop-shadow-md">
                                    {item.id === 'legendary' && '👑'}
                                    {item.id === 'rare' && '💎'}
                                    {item.id === 'uncommon' && '🔹'}
                                    {item.id === 'common' && '⚪'}
                                </div>
                                {/* HIER: Prozent-Anzeige (Multiplier) statt Credits */}
                                <span className="text-xs font-black font-mono bg-black/40 px-2 py-0.5 rounded border border-white/10">
                                    {item.multiplier.toFixed(2)}x
                                </span>
                            </>
                        ) : (
                            <div className="text-gray-600">?</div> // Fallback
                        )}
                    </div>
                ))
            )}
         </div>
      </div>
  );
}

export default function CaseOpening({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(100);
  const [caseCount, setCaseCount] = useState(1); 
  const [isRolling, setIsRolling] = useState(false);
  const [gameResults, setGameResults] = useState(null); 
  const [error, setError] = useState(""); 
  const [totalWinDisplay, setTotalWinDisplay] = useState(0);
  const [lastRoundCost, setLastRoundCost] = useState(0);

  const spin = async () => {
    if (isRolling) return;
    setError(""); 

    const totalBet = bet * caseCount;
    if (typeof currentCredits === 'number' && totalBet > currentCredits) {
        setError(`Nicht genug Credits! (Benötigt: ${totalBet})`);
        return;
    }

    setIsRolling(true);
    // Wir setzen gameResults NICHT sofort auf null, damit die alten Ergebnisse sichtbar bleiben,
    // bis die neuen Daten da sind. Erst beim Starten der Animation (in CaseRow useEffect) resetten wir.
    // Aber für die "Reset"-Logik in CaseRow brauchen wir einen Trigger.
    // Wir lassen es nullen, um den "Reset" Trigger zu feuern.
    setGameResults(null); 
    setTotalWinDisplay(0);

    try {
      const currentRoundCost = bet * caseCount; 

      const res = await fetch("/api/casino/play/case", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, count: caseCount }), credentials: "include"
      });
      
      const data = await res.json();
      
      if (!res.ok) {
         setError(data.error || "Server Fehler");
         setIsRolling(false);
         return;
      }

      setLastRoundCost(currentRoundCost); 
      
      // Kleiner Timeout damit React den State "null" vorher verarbeitet hat (für Reset)
      setTimeout(() => {
          setGameResults(data.results);
          setTotalWinDisplay(data.totalWin);
      }, 50);

      // Max Duration berechnen
      const maxDuration = 6000 + (caseCount - 1) * 500;

      setTimeout(() => {
        setIsRolling(false);
        updateCredits();
        if (data.totalWin > bet * caseCount) {
             confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
      }, maxDuration); 

    } catch (e) {
      console.error(e);
      setError("Verbindungsfehler");
      setIsRolling(false);
    }
  };

  const canAfford = (typeof currentCredits === 'number') ? ((bet * caseCount) <= currentCredits) : true;

  return (
    <div className="flex flex-col items-center gap-8 py-8 w-full max-w-4xl mx-auto">
      
      <div className="text-center">
         <h2 className="text-2xl font-black text-white flex items-center justify-center gap-2">
             <Box className="text-amber-500" /> MYSTERY CASE
         </h2>
         <p className="text-xs text-gray-400 mt-1">Öffne bis zu 3 Cases gleichzeitig.</p>
      </div>

      {/* CASES CONTAINER */}
      <div className="w-full px-4">
          {/* Zeige entweder Ergebnisse oder Platzhalter-Reihen */}
          {!gameResults ? (
              Array.from({length: caseCount}).map((_, i) => (
                  <CaseRow key={i} result={null} isRolling={isRolling} rowIndex={i} />
              ))
          ) : (
              gameResults.map((res, i) => (
                  <CaseRow key={i} result={res} isRolling={isRolling} rowIndex={i} />
              ))
          )}
      </div>

      {/* CONTROLS & RESULT */}
      <div className="w-full max-w-2xl bg-[#18181b] p-6 rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4">
        
        {error && <div className="mb-4 text-center text-red-400 font-bold bg-red-900/20 py-2 rounded-lg border border-red-500/20">{error}</div>}

        {!isRolling && gameResults && (
            (() => {
                const netResult = totalWinDisplay - lastRoundCost; 
                const isProfit = netResult >= 0;
                return (
                    <div className={`mb-6 text-center bg-black/40 p-4 rounded-xl border ${isProfit ? 'border-green-500/30' : 'border-red-500/30'}`}>
                        <div className={`text-3xl font-black mb-1 flex items-center justify-center gap-2 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          <span>{isProfit ? `GEWONNEN: +${totalWinDisplay}` : `VERLOREN: ${netResult}`}</span>
                          <CoinIcon className="w-6 h-6" />
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                            {isProfit ? `Netto-Gewinn: +${netResult}` : `Einsatz: ${lastRoundCost}`}
                        </div>
                    </div>
                );
            })()
        )}

         <div className="flex flex-col md:flex-row items-center gap-6">
            
            {/* Case Count */}
            <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Anzahl</span>
                <div className="flex bg-black/50 rounded-lg p-1 border border-white/10">
                    {[1, 2, 3].map(n => (
                        <button 
                            key={n}
                            onClick={() => { setCaseCount(n); setGameResults(null); }} // Reset Results bei Change
                            disabled={isRolling}
                            className={`w-10 h-10 rounded-md font-bold transition-all ${caseCount === n ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bet Input */}
            <div className="flex flex-col items-center gap-2 flex-1 w-full">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Einsatz pro Case</span>
                <div className="relative w-full max-w-[200px]">
                    <input 
                        type="number" 
                        value={bet} 
                        onChange={e => { setBet(Number(e.target.value)); setError(""); }}
                        disabled={isRolling}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-center font-bold text-lg text-white focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                </div>
            </div>

            {/* Spin Button */}
            <div className="flex flex-col gap-2 w-full md:w-auto">
                <div className="text-[10px] font-bold text-gray-500 uppercase text-center md:text-right">
                    Gesamt: {(bet * caseCount).toLocaleString()}
                </div>
                
                <button 
                    onClick={spin} 
                    disabled={isRolling || !canAfford}
                    className={`
                        h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-95 uppercase tracking-wide flex items-center justify-center gap-2
                        ${(isRolling || !canAfford) ? 'opacity-50 cursor-not-allowed grayscale' : ''}
                    `}
                >
                    {isRolling ? "Opening..." : "Öffnen"} <Package size={20} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}