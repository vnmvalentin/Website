import React, { useState, useRef } from "react";

const ITEM_WIDTH = 100; 
const GAP = 8;          

export default function CaseOpening({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(100);
  const [isRolling, setIsRolling] = useState(false);
  const [gameResult, setGameResult] = useState(null); 
  const [error, setError] = useState(""); 
  
  const scrollRef = useRef(null);
  const containerRef = useRef(null); 

  const spin = async () => {
    if (isRolling) return;
    setError(""); 

    // Robustere Client-Prüfung:
    // Wenn currentCredits noch 'undefined' ist (Laden...), lassen wir es durch (Server fängt es ab).
    // Nur wenn wir sicher wissen, dass Credits da sind UND sie zu wenig sind, blocken wir.
    if (typeof currentCredits === 'number' && bet > currentCredits) {
        setError("Nicht genug Credits!");
        return;
    }
    if (bet <= 0) {
        setError("Ungültiger Einsatz!");
        return;
    }

    setIsRolling(true);
    setGameResult(null);

    // Reset Scroll Position
    if (scrollRef.current) {
        scrollRef.current.style.transition = "none";
        scrollRef.current.style.transform = "translateX(0px)";
    }

    try {
      const res = await fetch("/api/casino/play/case", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet }), credentials: "include"
      });
      
      const data = await res.json();
      
      if (!res.ok) {
         if (data.error) setError(data.error);
         else setError("Server Fehler");
         setIsRolling(false);
         return;
      }
      
      if (data.error) {
        setError(data.error); 
        setIsRolling(false);
        return; 
      }

      // --- FIX 2: Wir speichern den Einsatz, der für DIESEN Wurf genutzt wurde ---
      // Damit bleibt der Text korrekt, auch wenn der User danach den Input ändert.
      setGameResult({ ...data, originalBet: bet });

      setTimeout(() => {
        if (scrollRef.current && containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            const centerOfContainer = containerWidth / 2;
            const itemFullWidth = ITEM_WIDTH + GAP;
            const winnerCenterPosition = (data.winIndex * itemFullWidth) + (ITEM_WIDTH / 2);
            const jitter = Math.floor(Math.random() * 70) - 35; 
            const finalTranslate = -(winnerCenterPosition - centerOfContainer + jitter);

            scrollRef.current.style.transition = "transform 6s cubic-bezier(0.15, 1, 0.3, 1)"; 
            scrollRef.current.style.transform = `translateX(${finalTranslate}px)`;
        }
      }, 50);

      setTimeout(() => {
        setIsRolling(false);
        updateCredits();
      }, 6000); 

    } catch (e) {
      console.error(e);
      setError("Verbindungsfehler");
      setIsRolling(false);
    }
  };

  const getColor = (c) => {
      switch(c) {
          case 'gold': return 'bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] border-yellow-200';
          case 'purple': return 'bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] border-purple-400';
          case 'blue': return 'bg-blue-600 border-blue-400';
          default: return 'bg-gray-700 border-gray-600';
      }
  };

  // --- FIX 1: Button Logik ---
  // Button ist nur disabled, wenn wir WISSEN, dass zu wenig Geld da ist.
  // Ist currentCredits undefined (noch am Laden), ist canAfford erstmal true.
  const canAfford = (typeof currentCredits === 'number') ? (bet <= currentCredits) : true;

  return (
    <div className="flex flex-col items-center gap-8 py-8 w-full max-w-2xl mx-auto relative z-10">
      <div className="text-center">
         <h2 className="text-2xl font-bold">Mystery Case</h2>
         <p className="text-xs text-gray-400">Öffne die Kiste für legendären Loot.</p>
      </div>

      {/* CASE CONTAINER */}
      <div 
        ref={containerRef} 
        className="relative w-full h-40 bg-gray-900 rounded-xl border-4 border-gray-700 shadow-2xl overflow-hidden"
      >
         <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-yellow-500 z-20 shadow-[0_0_10px_yellow] transform -translate-x-1/2"></div>
         <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 text-yellow-500 text-2xl font-bold">▼</div>

         <div 
            ref={scrollRef}
            className="absolute top-1/2 -translate-y-1/2 flex items-center h-32 pl-4"
            style={{ gap: GAP, willChange: 'transform' }}
         >
            {!gameResult ? (
                Array.from({length: 10}).map((_, i) => (
                    <div key={i} className="w-[100px] h-[100px] bg-gray-800 rounded border border-gray-700 flex items-center justify-center text-gray-600">?</div>
                ))
            ) : (
                gameResult.items.map((item, i) => (
                    <div 
                        key={i} 
                        className={`w-[100px] h-[100px] flex-shrink-0 rounded-lg border-b-4 flex flex-col items-center justify-center relative ${getColor(item.color)}`}
                    >
                        <span className="text-[10px] uppercase font-bold text-black/50 absolute top-1">{item.label}</span>
                        <div className="mb-1">
                            {item.id === 'legendary' && <span className="text-3xl">👑</span>}
                            {item.id === 'rare' && <span className="text-3xl">💎</span>}
                            {item.id === 'uncommon' && <span className="text-3xl">🔹</span>}
                            {item.id === 'common' && <span className="text-3xl">⚪</span>}
                        </div>
                        <span className="text-xs font-bold bg-black/30 px-2 py-0.5 rounded text-white">
                            {item.multiplier.toFixed(2)}x
                        </span>
                    </div>
                ))
            )}
         </div>
      </div>

      {/* Controls & Result */}
      <div className="flex flex-col items-center gap-4 min-h-[100px]">
        {error && <div className="text-red-400 font-bold animate-pulse bg-black/50 px-4 py-1 rounded">{error}</div>}

        {!isRolling && gameResult && (
            <div className="animate-in zoom-in duration-300 text-center">
                <div className="text-3xl font-bold mb-1 drop-shadow-md">
                {/* FIX 2: Vergleich mit gameResult.originalBet statt bet 
                   Damit bleibt das Ergebnis korrekt, auch wenn man den Einsatz ändert.
                */}
                {gameResult.winAmount >= gameResult.originalBet ? (
                    <span className="text-green-400">
                        GEWONNEN: +{gameResult.winAmount} 🪙
                        <span className="text-sm ml-2 text-green-200">({gameResult.winner.multiplier.toFixed(2)}x)</span>
                    </span>
                ) : (
                    <span className="text-gray-400">
                        Nur {gameResult.winAmount} 🪙 zurück
                        <span className="text-sm ml-2 text-gray-500">({gameResult.winner.multiplier.toFixed(2)}x)</span>
                    </span>
                )}
                </div>
                <div className={`text-sm uppercase font-bold tracking-widest ${gameResult.winner.color === 'gold' ? 'text-yellow-400 animate-pulse' : 'text-gray-500'}`}>
                    {gameResult.winner.label}
                </div>
            </div>
        )}

         <div className="flex items-center gap-4 bg-gray-800 p-4 rounded-full border border-gray-600 shadow-xl">
            <div className="flex flex-col">
                <label className="text-xs text-gray-400 ml-1">Einsatz</label>
                <input 
                type="number" 
                value={bet} 
                onChange={e => { setBet(Number(e.target.value)); setError(""); }}
                disabled={isRolling}
                className="bg-gray-900 border border-gray-600 rounded px-3 py-1 w-24 text-center font-bold text-lg focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                />
            </div>
            
            <button 
            onClick={spin} 
            // FIX 1: Nur disabled, wenn sicher zu wenig Geld oder am Rollen
            disabled={isRolling || !canAfford}
            className={`
                bg-blue-600 text-white font-extrabold px-10 py-3 rounded-full shadow-[0_4px_0_rgb(30,58,138)] transition-all uppercase tracking-wider
                ${(isRolling || !canAfford) ? 'opacity-50 cursor-not-allowed bg-gray-600 shadow-none' : 'hover:bg-blue-500 active:translate-y-1 active:shadow-none'}
            `}
            >
            {isRolling ? "Rolling..." : "OPEN CASE"}
            </button>
        </div>
      </div>
    </div>
  );
}