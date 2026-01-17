import React, { useState, useRef, useEffect } from "react";
import confetti from "canvas-confetti"; // IMPORT HINZUFÜGEN
import CoinIcon from "../CoinIcon";

const ITEM_WIDTH = 100; 
const GAP = 8;          

// Neue Sub-Komponente für eine einzelne Reihe, um Code zu sparen
function CaseRow({ result, isRolling, rowIndex }) {
  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  // Farben-Helper
  const getColor = (c) => {
      switch(c) {
          case 'gold': return 'bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] border-yellow-200';
          case 'purple': return 'bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] border-purple-400';
          case 'blue': return 'bg-blue-600 border-blue-400';
          default: return 'bg-gray-700 border-gray-600';
      }
  };

  useEffect(() => {
    if (result && isRolling) {
         // Kurze Verzögerung für Start
         setTimeout(() => {
            if (scrollRef.current && containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const centerOfContainer = containerWidth / 2;
                const itemFullWidth = ITEM_WIDTH + GAP;
                const winnerCenterPosition = (result.winIndex * itemFullWidth) + (ITEM_WIDTH / 2);
                
                // Jitter erhöht Randomness (damit nicht alle 3 Reihen exakt gleich stoppen visuell)
                const jitter = Math.floor(Math.random() * 50) - 25; 
                const finalTranslate = -(winnerCenterPosition - centerOfContainer + jitter);
    
                scrollRef.current.style.transition = `transform ${6 + rowIndex * 0.5}s cubic-bezier(0.15, 1, 0.3, 1)`; // Jede Reihe stoppt etwas später
                scrollRef.current.style.transform = `translateX(${finalTranslate}px)`;
            }
          }, 50);
    } else if (!result && isRolling) {
        // Reset Logic
        if (scrollRef.current) {
            scrollRef.current.style.transition = "none";
            scrollRef.current.style.transform = "translateX(0px)";
        }
    }
  }, [result, isRolling, rowIndex]);

  return (
      <div 
        ref={containerRef} 
        className="relative w-full h-32 bg-gray-900 rounded-xl border-4 border-gray-700 shadow-lg overflow-hidden mb-4"
      >
         <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-yellow-500 z-20 shadow-[0_0_10px_yellow] transform -translate-x-1/2 opacity-50"></div>
         
         <div 
            ref={scrollRef}
            className="absolute top-1/2 -translate-y-1/2 flex items-center h-24 pl-4"
            style={{ gap: GAP, willChange: 'transform' }}
         >
            {/* Wenn kein Resultat da ist, zeigen wir Placeholders. Wenn Resultat da ist, zeigen wir die Items */}
            {!result ? (
                Array.from({length: 15}).map((_, i) => (
                    <div key={i} className="w-[100px] h-[80px] bg-gray-800 rounded border border-gray-700 flex items-center justify-center text-gray-600">?</div>
                ))
            ) : (
                result.items.map((item, i) => (
                    <div 
                        key={i} 
                        className={`w-[100px] h-[80px] flex-shrink-0 rounded-lg border-b-4 flex flex-col items-center justify-center relative ${getColor(item.color)}`}
                    >
                        <div className="mb-1 scale-75">
                            {item.id === 'legendary' && <span className="text-3xl">👑</span>}
                            {item.id === 'rare' && <span className="text-3xl">💎</span>}
                            {item.id === 'uncommon' && <span className="text-3xl">🔹</span>}
                            {item.id === 'common' && <span className="text-3xl">⚪</span>}
                        </div>
                        <span className="text-[10px] font-bold bg-black/30 px-2 py-0.5 rounded text-white">
                            {item.multiplier.toFixed(2)}x
                        </span>
                    </div>
                ))
            )}
         </div>
      </div>
  );
}

export default function CaseOpening({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(100);
  const [caseCount, setCaseCount] = useState(1); // 1, 2 oder 3
  const [isRolling, setIsRolling] = useState(false);
  const [gameResults, setGameResults] = useState(null); // Array von Results
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
    setGameResults(null); 
    setTotalWinDisplay(0);

    try {
      // Berechnung VOR dem Fetch oder direkt danach sichern
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

      // HIER speichern wir die Kosten der Runde fest ab
      setLastRoundCost(currentRoundCost); // <--- NEU
      
      setGameResults(data.results);
      setTotalWinDisplay(data.totalWin);

      // Wartezeit bis Animation fertig ist (längste Animation dauert 6s + (rows-1)*0.5s)
      const maxDuration = 6000 + (caseCount - 1) * 500;

      setTimeout(() => {
        setIsRolling(false);
        updateCredits();
        if (data.totalWin > bet * caseCount) {
             confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
             });
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
    <div className="flex flex-col items-center gap-6 py-8 w-full max-w-4xl mx-auto relative z-10">
      <div className="text-center mb-4">
         <h2 className="text-2xl font-bold">Mystery Case</h2>
         <p className="text-xs text-gray-400">Multi-Opening Support</p>
      </div>

      {/* CASES AREA */}
      <div className="w-full px-4">
          {/* Wenn wir rollen, zeigen wir die Results (die Arrays sind in data.results). Wenn nicht und noch kein Spiel war, zeigen wir 1-3 leere Rows */}
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

      {/* RESULT & CONTROLS */}
      <div className="flex flex-col items-center gap-4 w-full">
        {error && <div className="text-red-400 font-bold animate-pulse bg-black/50 px-4 py-1 rounded">{error}</div>}

        {!isRolling && gameResults && (
            // BERECHNUNG MIT GESPEICHERTEM EINSATZ:
            (() => {
                // HIER: Wir nutzen lastRoundCost statt (bet * caseCount)
                const netResult = totalWinDisplay - lastRoundCost; 
                const isProfit = netResult >= 0;

                return (
                    <div className={`animate-in zoom-in duration-300 text-center bg-gray-900/80 p-4 rounded-xl border ${isProfit ? 'border-green-500/30' : 'border-red-500/30'}`}>
                        <div className={`text-3xl font-bold mb-1 drop-shadow-md flex items-center justify-center gap-2 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {/* Text und Zahlen */}
                          <span>
                              {isProfit 
                                  ? `GEWONNEN: +${totalWinDisplay}` 
                                  : `VERLOREN: ${netResult}` 
                              }
                          </span>
                          {/* Das Icon als echtes JSX-Element daneben */}
                          <CoinIcon size="w-8 h-8" />
                      </div>
                        <div className="text-xs text-gray-400 uppercase tracking-widest">
                            {/* Auch hier lastRoundCost nutzen */}
                            {isProfit ? `Netto: +${netResult}` : `Einsatz: ${lastRoundCost}`}
                        </div>
                    </div>
                );
            })()
        )}

         <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-800 p-6 rounded-2xl border border-gray-600 shadow-xl">
            
            {/* Case Count Selector */}
            <div className="flex flex-col items-center border-r border-gray-600 pr-4 mr-2">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Anzahl Cases</label>
                <div className="flex gap-2">
                    {[1, 2, 3].map(n => (
                        <button 
                            key={n}
                            onClick={() => setCaseCount(n)}
                            disabled={isRolling}
                            className={`w-8 h-8 rounded font-bold transition-all ${caseCount === n ? 'bg-yellow-500 text-black scale-110' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col items-center">
                <label className="text-xs text-gray-400 ml-1">Einsatz pro Case</label>
                <input 
                    type="number" 
                    value={bet} 
                    onChange={e => { setBet(Number(e.target.value)); setError(""); }}
                    disabled={isRolling}
                    className="bg-gray-900 border border-gray-600 rounded px-3 py-1 w-24 text-center font-bold text-lg focus:outline-none focus:border-blue-500 transition-colors"
                />
            </div>

            <div className="text-right mx-2 min-w-[100px]">
                <span className="text-xs text-gray-400 block">Gesamt:</span>
                <span className="font-mono text-yellow-400 font-bold">{bet * caseCount} <CoinIcon size="w-5 h-5" /></span>
            </div>
            
            <button 
                onClick={spin} 
                disabled={isRolling || !canAfford}
                className={`
                    bg-blue-600 text-white font-extrabold px-8 py-3 rounded-xl shadow-[0_4px_0_rgb(30,58,138)] transition-all uppercase tracking-wider
                    ${(isRolling || !canAfford) ? 'opacity-50 cursor-not-allowed bg-gray-600 shadow-none' : 'hover:bg-blue-500 active:translate-y-1 active:shadow-none'}
                `}
            >
                {isRolling ? "Opening..." : "OPEN"}
            </button>
        </div>
      </div>
    </div>
  );
}