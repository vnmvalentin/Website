import React, { useState } from "react";
import CoinIcon from "../CoinIcon";

// WICHTIG: currentCredits in den Props hinzufügen
export default function HighLow({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(25);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(""); // Neuer State für Fehlermeldungen

  const play = async (guess) => {
    setError(""); // Fehler zurücksetzen

    // Client-Check
    if (bet > currentCredits) {
        setError("Nicht genug Credits!");
        return;
    }
    if (bet <= 0) {
        setError("Ungültiger Einsatz!");
        return;
    }

    try {
      const res = await fetch("/api/casino/play/highlow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, guess }),
        credentials: "include"
      });
      const data = await res.json();
      
      // Server-Check
      if (data.error) {
          setError(data.error);
          return;
      }

      setLastResult(data);
      updateCredits();
    } catch (e) {
      console.error(e);
      setError("Verbindungsfehler");
    }
  };

  return (
    <div className="text-center space-y-8 max-w-md mx-auto relative z-10">
      <h2 className="text-2xl font-bold">Higher or Lower</h2>
      <p className="text-gray-400">Die magische Zahl liegt zwischen 1 und 100.<br/>Ist sie höher oder niedriger als 50?</p>
      
      <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl">
        {lastResult ? (
          <div className="animate-in fade-in zoom-in duration-300">
            <div className="text-6xl font-bold mb-2">{lastResult.number}</div>
            <div className={`text-xl font-bold ${lastResult.winAmount > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {lastResult.winAmount > 0 ? <span> Gewonnen! (+${lastResult.winAmount}<CoinIcon size="w-6 h-6" />)</span> : "Verloren"}
            </div>
            <button onClick={() => setLastResult(null)} className="mt-4 text-sm underline text-gray-400">Nochmal</button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-2">
              <label>Einsatz:</label>
              <input 
                type="number" 
                value={bet} 
                onChange={e => { setBet(Number(e.target.value)); setError(""); }} 
                className="bg-gray-900 border border-gray-600 rounded p-2 w-24 text-center font-bold focus:border-blue-500 outline-none"
              />
            </div>

            {/* ERROR MSG ANZEIGE */}
            {error && <div className="text-red-400 font-bold animate-pulse">{error}</div>}
            
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => play("low")} className="bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-lg transition hover:-translate-y-1 shadow-[0_4px_0_rgb(30,58,138)] active:translate-y-0 active:shadow-none">
                LOWER ▼
                <span className="block text-xs font-normal opacity-70">1 - 50</span>
              </button>
              <button onClick={() => play("high")} className="bg-red-600 hover:bg-red-500 py-4 rounded-xl font-bold text-lg transition hover:-translate-y-1 shadow-[0_4px_0_rgb(153,27,27)] active:translate-y-0 active:shadow-none">
                HIGHER ▲
                <span className="block text-xs font-normal opacity-70">51 - 100</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}