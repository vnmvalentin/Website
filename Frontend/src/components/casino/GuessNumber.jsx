import React, { useState } from "react";

export default function GuessNumber({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(50);
  const [game, setGame] = useState(null); 
  const [inputVal, setInputVal] = useState("");
  const [error, setError] = useState(""); // Neuer State

  const start = async () => {
    setError("");
    
    // Client Check
    if (bet > currentCredits) {
        setError("Nicht genug Credits!");
        return;
    }
    if (bet <= 0) {
        setError("Ungültiger Einsatz!");
        return;
    }

    try {
      const res = await fetch("/api/casino/play/guess/start", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ bet }), credentials: "include"
      });
      const data = await res.json();
      
      // Server Check
      if (data.error) {
          setError(data.error);
          return;
      }

      setGame(await data);
      updateCredits();
    } catch(e) { 
        console.error(e); 
        setError("Server Fehler");
    }
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

  return (
    <div className="flex flex-col items-center gap-6 max-w-md mx-auto relative z-10">
      <h2 className="text-2xl font-bold">🔢 Guess the Number (1-100)</h2>

      {!game || game.status === "win" || game.status === "lose" ? (
        <div className="bg-gray-800 p-6 rounded-xl w-full text-center border border-gray-700 shadow-xl">
           {game?.status === "win" && <div className="text-green-400 font-bold text-xl mb-4">RICHTIG! +{game.winAmount} 🪙</div>}
           {game?.status === "lose" && <div className="text-red-400 font-bold text-xl mb-4">Verloren. Es war {game.target}</div>}
           
           <div className="flex gap-2 justify-center items-center mb-4">
             <label>Einsatz:</label>
             <input 
                type="number" 
                value={bet} 
                onChange={e=>{setBet(Number(e.target.value)); setError("")}} 
                className="bg-gray-900 w-24 p-2 rounded text-center border border-gray-600 focus:border-violet-500 outline-none"
             />
           </div>

            {/* ERROR MSG */}
           {error && <div className="text-red-400 font-bold mb-4 animate-pulse">{error}</div>}

           <button onClick={start} className="bg-violet-600 hover:bg-violet-500 w-full py-3 rounded font-bold transition shadow-[0_4px_0_rgb(109,40,217)] active:translate-y-1 active:shadow-none">
               Start Game (5 Versuche)
           </button>
        </div>
      ) : (
        // ... (Der Spiel-Teil bleibt identisch) ...
        <div className="w-full bg-gray-800 p-6 rounded-xl border border-gray-600">
           <div className="flex justify-between mb-4">
             <span className="text-gray-400">Versuche übrig: <span className="text-white font-bold">{game.triesLeft}</span></span>
             <span className="text-yellow-400 font-mono">Einsatz: {bet}</span>
           </div>

           <form onSubmit={submitGuess} className="flex gap-2 mb-6">
             <input 
                type="number" autoFocus min="1" max="100" 
                value={inputVal} onChange={e=>setInputVal(e.target.value)} 
                className="flex-1 bg-gray-900 border border-gray-500 rounded p-2 text-center text-xl font-bold"
                placeholder="?"
             />
             <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-6 rounded font-bold transition">Rate</button>
           </form>

           <div className="space-y-2">
             {(game.history || []).map((h, i) => (
               <div key={i} className="flex justify-between items-center bg-black/30 p-2 rounded animate-in fade-in slide-in-from-bottom-2">
                 <span className="font-bold text-gray-300">Guess: {h.guess}</span>
                 {h.hint === "higher" && <span className="text-yellow-400 font-bold text-sm">▲ Die Zahl ist GRÖSSER</span>}
                 {h.hint === "lower" && <span className="text-blue-400 font-bold text-sm">▼ Die Zahl ist KLEINER</span>}
                 {h.hint === "equal" && <span className="text-green-400 font-bold">RICHTIG!</span>}
               </div>
             ))}
           </div>
        </div>
      )}
    </div>
  );
}