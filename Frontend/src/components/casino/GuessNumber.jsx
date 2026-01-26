import React, { useState } from "react";
import CoinIcon from "../CoinIcon";
import { Hash, ArrowUp, ArrowDown, Check, Trophy, XCircle, AlertCircle, Play } from "lucide-react";

export default function GuessNumber({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(50);
  const [game, setGame] = useState(null); 
  const [inputVal, setInputVal] = useState("");
  const [error, setError] = useState("");

  // --- LOGIK (Original) ---
  const start = async () => {
    setError("");
    if (bet > currentCredits) { setError("Nicht genug Credits!"); return; }
    if (bet <= 0) { setError("Ungültiger Einsatz!"); return; }

    try {
      const res = await fetch("/api/casino/play/guess/start", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ bet }), credentials: "include"
      });
      const data = await res.json();
      
      if (data.error) { setError(data.error); return; }

      setGame(await data);
      updateCredits();
    } catch(e) { console.error(e); setError("Server Fehler"); }
  };

  const submitGuess = async (e) => {
    e.preventDefault();
    if(!inputVal) return;
    try {
      const res = await fetch("/api/casino/play/guess/submit", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ number: Number(inputVal) }), credentials: "include"
      });
      const data = await res.json();
      setGame(prev => ({ ...prev, ...data }));
      setInputVal("");
      if (data.status !== "next") updateCredits();
    } catch(e) { console.error(e); }
  };

  // Helper für History Icons
  const getHistoryItem = (h) => {
      if (h.hint === "higher") return { icon: ArrowUp, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", text: "Zu niedrig (Höher)" };
      if (h.hint === "lower") return { icon: ArrowDown, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", text: "Zu hoch (Tiefer)" };
      return { icon: Check, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", text: "Volltreffer!" };
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-lg mx-auto p-4">
      
      {/* HEADER */}
      <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white flex items-center justify-center gap-3">
              <Hash className="text-violet-500" size={32} /> GUESS THE NUMBER
          </h2>
          <p className="text-white/50 text-sm mt-2">Finde die Zahl zwischen 1 und 100.</p>
      </div>

      {/* GAME AREA */}
      {!game || game.status === "win" || game.status === "lose" ? (
        
        // --- START / GAME OVER SCREEN ---
        <div className="bg-[#18181b] p-8 rounded-3xl border border-white/10 shadow-2xl w-full text-center relative overflow-hidden animate-in zoom-in-95">
           {/* Background Glow */}
           <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-violet-500/20 blur-[60px] rounded-full pointer-events-none" />

           {game?.status === "win" && (
               <div className="mb-6 animate-bounce">
                   <div className="inline-flex p-4 rounded-full bg-green-500/10 text-green-400 mb-2 ring-1 ring-green-500/30">
                       <Trophy size={40} />
                   </div>
                   <h3 className="text-2xl font-black text-white">GEWONNEN!</h3>
                   <div className="text-green-400 font-bold text-lg flex items-center justify-center gap-2">
                       +{game.winAmount} <CoinIcon />
                   </div>
               </div>
           )}
           
           {game?.status === "lose" && (
               <div className="mb-6">
                   <div className="inline-flex p-4 rounded-full bg-red-500/10 text-red-400 mb-2 ring-1 ring-red-500/30">
                       <XCircle size={40} />
                   </div>
                   <h3 className="text-2xl font-black text-white">LEIDER FALSCH</h3>
                   <p className="text-white/50 text-sm">Die Zahl war <span className="text-white font-bold">{game.target}</span></p>
               </div>
           )}
           
           {/* Bet Input */}
           <div className="bg-black/30 p-4 rounded-2xl border border-white/5 mb-6">
             <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Dein Einsatz</label>
             <div className="flex items-center justify-center gap-3">
                 <button onClick={() => setBet(Math.max(10, bet - 10))} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center">-</button>
                 <div className="relative w-32">
                    <input 
                        type="number" 
                        value={bet} 
                        onChange={e=>{setBet(Number(e.target.value)); setError("")}} 
                        className="w-full bg-transparent text-center text-2xl font-black text-white focus:outline-none font-mono"
                    />
                    <CoinIcon className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
                 </div>
                 <button onClick={() => setBet(bet + 10)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center">+</button>
             </div>
           </div>

           {error && <div className="text-red-400 text-sm font-bold mb-4 bg-red-500/10 py-2 rounded-lg border border-red-500/20 flex items-center justify-center gap-2"><AlertCircle size={16}/>{error}</div>}

           <button onClick={start} className="w-full bg-violet-600 hover:bg-violet-500 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-violet-900/30 transition-transform active:scale-95 flex items-center justify-center gap-2 group">
               <Play size={20} fill="currentColor" className="group-hover:scale-110 transition-transform" /> 
               {game ? "Nochmal Spielen" : "Starten (6 Versuche)"}
           </button>
        </div>

      ) : (
        
        // --- ACTIVE GAME SCREEN ---
        <div className="w-full bg-[#18181b] p-6 rounded-3xl border border-white/10 shadow-2xl relative">
           
           {/* Top Bar */}
           <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
             <div className="flex flex-col">
                 <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Versuche</span>
                 <div className="flex gap-1 mt-1">
                     {Array.from({length: 6}).map((_, i) => (
                         <div key={i} className={`w-2 h-2 rounded-full ${i < game.triesLeft ? "bg-violet-500" : "bg-white/10"}`} />
                     ))}
                 </div>
             </div>
             <div className="text-right">
                 <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Pot</span>
                 <div className="font-mono font-bold text-yellow-400">{bet * 2} <CoinIcon className="inline w-3 h-3"/></div>
             </div>
           </div>

           {/* Input Area */}
           <form onSubmit={submitGuess} className="flex gap-3 mb-8">
             <input 
                type="number" autoFocus min="1" max="100" 
                value={inputVal} onChange={e=>setInputVal(e.target.value)} 
                className="flex-1 bg-black/40 border-2 border-white/10 focus:border-violet-500 rounded-2xl p-4 text-center text-3xl font-black text-white outline-none transition-colors placeholder:text-white/10 font-mono"
                placeholder="?"
             />
             <button type="submit" className="bg-violet-600 hover:bg-violet-500 px-6 rounded-2xl font-bold transition-transform active:scale-95 text-white shadow-lg">
                 RATE
             </button>
           </form>

           {/* History Log */}
           <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
             <div className="text-xs text-white/30 font-bold uppercase tracking-wider mb-2 pl-1">Verlauf</div>
             {(game.history || []).length === 0 && <div className="text-white/20 text-sm italic text-center py-4">Noch kein Versuch...</div>}
             
             {[...(game.history || [])].reverse().map((h, i) => { // Neueste oben
               const style = getHistoryItem(h);
               const Icon = style.icon;
               return (
                   <div key={i} className={`flex justify-between items-center p-3 rounded-xl border animate-in slide-in-from-top-2 ${style.bg}`}>
                     <div className="flex items-center gap-3">
                         <div className={`p-1.5 rounded-lg bg-black/20 ${style.color}`}>
                             <Icon size={16} />
                         </div>
                         <span className="font-mono font-bold text-lg text-white">{h.guess}</span>
                     </div>
                     <span className={`text-xs font-bold uppercase tracking-wide ${style.color}`}>{style.text}</span>
                   </div>
               )
             })}
           </div>
        </div>
      )}
    </div>
  );
}