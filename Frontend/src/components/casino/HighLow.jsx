import React, { useState } from "react";
import CoinIcon from "../CoinIcon";
import { ArrowUp, ArrowDown, RotateCcw, TrendingUp } from "lucide-react";

export default function HighLow({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(25);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState("");

  // --- LOGIK (Original) ---
  const play = async (guess) => {
    setError(""); 
    if (bet > currentCredits) { setError("Nicht genug Credits!"); return; }
    if (bet <= 0) { setError("Ungültiger Einsatz!"); return; }

    try {
      const res = await fetch("/api/casino/play/highlow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, guess }), credentials: "include"
      });
      const data = await res.json();
      
      if (data.error) { setError(data.error); return; }

      setLastResult(data);
      updateCredits();
    } catch (e) { console.error(e); setError("Verbindungsfehler"); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-lg mx-auto p-4 gap-8">
      
      {/* HEADER */}
      <div className="text-center">
          <h2 className="text-3xl font-black text-white flex items-center justify-center gap-3">
              <TrendingUp className="text-cyan-400" size={32} /> HIGH / LOW
          </h2>
          <p className="text-white/50 text-sm mt-2">Ist die nächste Zahl höher oder niedriger als 50?</p>
      </div>
      
      {lastResult ? (
          // --- RESULT SCREEN ---
          <div className="w-full bg-[#18181b] p-8 rounded-3xl border border-white/10 shadow-2xl text-center animate-in zoom-in-95 duration-300">
              {/* Die gezogene Karte */}
              <div className="flex justify-center mb-8">
                  <div className={`w-32 h-48 bg-white text-black rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.2)] flex flex-col items-center justify-center border-4 ${lastResult.winAmount > 0 ? "border-green-500" : "border-red-500"}`}>
                      <span className="text-6xl font-black">{lastResult.number}</span>
                      <div className="text-xs font-bold uppercase tracking-wider mt-2 opacity-50">Result</div>
                  </div>
              </div>

              <h3 className={`text-4xl font-black uppercase mb-2 ${lastResult.winAmount > 0 ? "text-green-400" : "text-red-500"}`}>
                  {lastResult.winAmount > 0 ? "Gewonnen!" : "Verloren"}
              </h3>
              
              {lastResult.winAmount > 0 && (
                  <div className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-2">
                      +{lastResult.winAmount} <CoinIcon size="w-6 h-6" />
                  </div>
              )}

              <button 
                onClick={() => setLastResult(null)} 
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center justify-center gap-2 mx-auto"
              >
                  <RotateCcw size={18} /> Nochmal
              </button>
          </div>
      ) : (
          // --- GAME SCREEN ---
          <div className="w-full bg-[#18181b] p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-24 bg-cyan-500/5 blur-[60px] rounded-full pointer-events-none" />

            {/* Die Start-Karte (50) */}
            <div className="flex justify-center mb-8 relative z-10">
                <div className="w-24 h-36 bg-gray-800 rounded-xl border-2 border-gray-600 flex flex-col items-center justify-center shadow-lg opacity-50 scale-90">
                    <span className="text-4xl font-bold text-gray-500">50</span>
                    <span className="text-[10px] uppercase mt-1 text-gray-600">Start</span>
                </div>
            </div>

            {/* Bet Input */}
            <div className="mb-8 relative z-10">
                <div className="flex items-center justify-center gap-3 bg-black/30 p-2 rounded-xl border border-white/5 max-w-xs mx-auto">
                    <span className="text-xs font-bold text-white/40 uppercase pl-2">Einsatz</span>
                    <input 
                        type="number" 
                        value={bet} 
                        onChange={e => { setBet(Number(e.target.value)); setError(""); }} 
                        className="bg-transparent text-white font-mono font-bold text-xl text-right w-20 outline-none"
                    />
                    <CoinIcon className="w-5 h-5 opacity-50 mr-2" />
                </div>
            </div>

            {error && <div className="text-red-400 font-bold text-center mb-4 text-sm animate-pulse">{error}</div>}
            
            <div className="grid grid-cols-2 gap-4 relative z-10">
              <button 
                onClick={() => play("low")} 
                className="group relative overflow-hidden bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-xl text-white shadow-lg shadow-blue-900/30 transition-all active:scale-95 flex flex-col items-center"
              >
                <div className="flex items-center gap-2 relative z-10">
                    <ArrowDown size={24} strokeWidth={3} /> LOWER
                </div>
                <span className="text-[10px] font-medium opacity-60 relative z-10">1 - 50</span>
                {/* Hover Glow */}
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>

              <button 
                onClick={() => play("high")} 
                className="group relative overflow-hidden bg-red-600 hover:bg-red-500 py-5 rounded-2xl font-black text-xl text-white shadow-lg shadow-red-900/30 transition-all active:scale-95 flex flex-col items-center"
              >
                <div className="flex items-center gap-2 relative z-10">
                    HIGHER <ArrowUp size={24} strokeWidth={3} />
                </div>
                <span className="text-[10px] font-medium opacity-60 relative z-10">51 - 100</span>
                {/* Hover Glow */}
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </div>
          </div>
      )}
    </div>
  );
}