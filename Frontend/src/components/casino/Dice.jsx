import React, { useState, useEffect, useRef } from "react";
import CoinIcon from "../CoinIcon"; 
import confetti from "canvas-confetti";
import { ArrowDown, ArrowUp, Dices, Percent, X } from "lucide-react";

export default function Dice({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(50); 
  const [condition, setCondition] = useState("under"); 
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastResult, setLastResult] = useState(null); 
  
  const resultRef = useRef(null);

  // --- LOGIK (Original) ---
  const winChance = condition === "under" ? target : 100 - target;
  const multiplier = (99 / winChance).toFixed(4);
  const profit = (bet * multiplier).toFixed(0);

  const play = async () => {
    if (bet > currentCredits) return alert("Zu wenig Credits!");
    setIsPlaying(true);
    setLastResult(null);

    try {
        const res = await fetch("/api/casino/play/dice", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bet, target, condition }), credentials: "include"
        });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            setIsPlaying(false);
            return;
        }

        // Animation
        let steps = 0;
        const interval = setInterval(() => {
            if(steps > 10) {
                clearInterval(interval);
                finishGame(data);
            } else {
                if(resultRef.current) resultRef.current.innerText = (Math.random() * 100).toFixed(2);
                steps++;
            }
        }, 50);

    } catch (e) {
        console.error(e);
        setIsPlaying(false);
    }
  };

  const finishGame = (data) => {
      setLastResult(data);
      updateCredits();
      setIsPlaying(false);

      if (data.isWin) {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#4ade80'] });
      }
  };

  const getTrackStyle = () => {
      const p = target; 
      if (condition === "under") {
          return { background: `linear-gradient(to right, #10b981 0%, #10b981 ${p}%, #ef4444 ${p}%, #ef4444 100%)` };
      } else {
          return { background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${p}%, #10b981 ${p}%, #10b981 100%)` };
      }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto py-6 gap-8">
      
      {/* --- HEADER / SCORE --- */}
      <div className="relative w-full flex flex-col items-center justify-center min-h-[160px]">
          <div className="text-center z-10 relative">
              {/* Rolling Number */}
              <div 
                ref={resultRef}
                className={`text-7xl md:text-9xl font-black font-mono tracking-tighter transition-all duration-300 drop-shadow-2xl 
                    ${!lastResult ? 'text-gray-700' : lastResult.isWin ? 'text-emerald-400 drop-shadow-[0_0_35px_rgba(52,211,153,0.6)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]'}
                `}
              >
                  {lastResult ? lastResult.roll.toFixed(2) : "50.00"}
              </div>
              
              {/* Win/Loss Badge */}
              {lastResult && (
                  <div className={`absolute left-1/2 -translate-x-1/2 -bottom-8 px-6 py-2 rounded-full font-black text-lg border animate-in slide-in-from-top-4 ${lastResult.isWin ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                      {lastResult.isWin ? `+${lastResult.winAmount}` : `-${bet}`} <CoinIcon className="inline w-5 h-5 ml-1"/>
                  </div>
              )}
          </div>
      </div>

      {/* --- MAIN CARD --- */}
      <div className="w-full bg-[#18181b] p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          
          <div className="absolute top-0 right-0 p-32 bg-violet-500/5 blur-[80px] rounded-full pointer-events-none" />

          {/* Scale Legend */}
          <div className="flex justify-between text-xs font-bold text-gray-500 mb-3 px-1 uppercase tracking-widest font-mono">
             <span>0</span>
             <span>25</span>
             <span>50</span>
             <span>75</span>
             <span>100</span>
          </div>

          {/* SLIDER COMPONENT */}
          <div className="relative h-16 w-full flex items-center mb-10 group select-none">
              
              {/* Track Background */}
              <div 
                className="absolute left-0 right-0 h-4 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden"
                style={getTrackStyle()}
              />
              
              {/* Result Marker (Needle) */}
              {lastResult && (
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white z-10 shadow-[0_0_15px_white] transition-all duration-500 h-full mix-blend-overlay"
                    style={{ left: `${lastResult.roll}%` }}
                  >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white]"></div>
                  </div>
              )}

              {/* Draggable Handle */}
              <div 
                className="absolute h-10 w-10 bg-[#18181b] rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] z-20 flex items-center justify-center pointer-events-none transition-transform duration-75 border-2 border-white/20"
                style={{ 
                    left: `${target}%`, 
                    transform: 'translate(-50%, 0)' 
                }}
              >
                  <div className="w-1 h-4 bg-white/20 rounded-full mx-0.5"></div>
                  <div className="w-1 h-4 bg-white/20 rounded-full mx-0.5"></div>
                  
                  {/* Tooltip Value */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#18181b] border border-white/10 px-3 py-1.5 rounded-lg text-sm font-bold text-white shadow-xl">
                      {target}
                  </div>
              </div>

              {/* Input (Invisible) */}
              <input 
                  type="range" 
                  min="2" max="98" step="1"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  disabled={isPlaying}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              />
          </div>

          {/* CONTROLS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Stats */}
              <div className="flex flex-col justify-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 uppercase font-bold">Multiplier</span>
                      <span className="font-mono font-bold text-violet-400 text-lg">{multiplier}x</span>
                  </div>
                  <div className="w-full h-px bg-white/5" />
                  <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 uppercase font-bold">Chance</span>
                      <span className="font-mono font-bold text-white flex items-center gap-1">
                          {winChance.toFixed(0)} <Percent size={12} />
                      </span>
                  </div>
              </div>

              {/* Mode & Bet */}
              <div className="flex flex-col gap-3 justify-center">
                  <div className="flex bg-black/30 p-1 rounded-xl border border-white/5">
                      <button 
                        onClick={() => setCondition("under")} 
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center justify-center gap-1 ${condition === 'under' ? 'bg-emerald-600 text-white shadow' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                      >
                          <ArrowDown size={14} /> Under
                      </button>
                      <button 
                        onClick={() => setCondition("over")} 
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center justify-center gap-1 ${condition === 'over' ? 'bg-emerald-600 text-white shadow' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                      >
                          <ArrowUp size={14} /> Over
                      </button>
                  </div>
                  
                  <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 py-1">
                      <span className="text-gray-500 text-[10px] font-bold uppercase mr-2">Einsatz</span>
                      <input 
                            type="number" 
                            value={bet} 
                            onChange={e => setBet(Number(e.target.value))}
                            disabled={isPlaying}
                            className="w-full bg-transparent py-2 font-mono font-bold text-white text-lg focus:outline-none text-right"
                      />
                      <div className="pl-2 opacity-50"><CoinIcon className="w-4 h-4"/></div>
                  </div>
              </div>

              {/* Play Button */}
              <button 
                onClick={play}
                disabled={isPlaying || bet > currentCredits}
                className="relative overflow-hidden w-full h-full min-h-[70px] bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 disabled:from-gray-700 disabled:to-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-2xl rounded-2xl shadow-lg shadow-emerald-900/20 transition-transform active:scale-95 flex flex-col items-center justify-center gap-1"
               >
                   <div className="flex items-center gap-2 relative z-10">
                        {isPlaying ? <div className="animate-spin"><Dices size={24}/></div> : <Dices size={24}/>}
                        {isPlaying ? "ROLLING..." : "ROLLEN"}
                   </div>
                   <div className="text-[10px] font-mono font-medium text-green-100 opacity-80 relative z-10">
                       Gewinn: {profit}
                   </div>
               </button>

          </div>
      </div>
    </div>
  );
}