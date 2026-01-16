// src/components/casino/Mines.jsx
import React, { useState } from "react";
import CoinIcon from "../CoinIcon";

// Identische Konstante wie im Backend
const HOUSE_EDGE = 0.94; 

export default function Mines({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(50);
  const [bombs, setBombs] = useState(3);
  const [game, setGame] = useState(null); 
  const [revealed, setRevealed] = useState(Array(25).fill(false)); 
  const [error, setError] = useState(""); 

  // Diese Funktion spiegelt die Backend-Logik wider
  const calculateNextMultiplier = (currentRevealedCount) => {
      // Wir berechnen, was passiert, WENN wir noch einen finden (+1)
      const nextCount = currentRevealedCount + 1; 
      const totalTiles = 25;
      
      // Wenn wir mehr aufdecken wollen als möglich (Safe Tiles), abbrechen
      if (nextCount > (25 - (game?.bombCount || bombs))) return 0;

      let probability = 1;
      for (let i = 0; i < nextCount; i++) {
        const remainingSafe = 25 - (game?.bombCount || bombs) - i;
        const remainingTotal = 25 - i;
        probability *= (remainingSafe / remainingTotal);
      }

      if (probability === 0) return 0;
      const raw = 1 / probability;
      // Abrunden wie im Backend
      return (Math.floor(raw * HOUSE_EDGE * 100) / 100).toFixed(2);
  };

  const startGame = async () => {
    setError("");
    if (bet > currentCredits) { setError("Nicht genug Credits!"); return; } //
    if (bet <= 0) { setError("Ungültiger Einsatz!"); return; } //

    try {
      const res = await fetch("/api/casino/play/mines/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, bombCount: bombs }),
        credentials: "include"
      });
      const data = await res.json(); //
      
      if(data.error) { setError(data.error); return; }
      
      setGame({ active: true, cashoutValue: bet, bombCount: bombs }); //
      setRevealed(Array(25).fill(false));
      updateCredits();
    } catch(e) { console.error(e); setError("Verbindungsfehler"); }
  };

  const clickTile = async (index) => {
    if (!game?.active || revealed[index]) return; //
    try {
      const res = await fetch("/api/casino/play/mines/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
        credentials: "include"
      });
      const data = await res.json(); //
      
      const newRev = [...revealed];
      newRev[index] = true;
      setRevealed(newRev);

      if (data.status === "boom") {
        setGame({ active: false, lost: true, field: data.field }); //
        updateCredits();
      } else {
        // Backend liefert den korrekten Cashout Wert
        setGame(prev => ({ ...prev, cashoutValue: data.cashoutValue })); //
      }
    } catch(e) { console.error(e); }
  };

  const cashout = async () => {
    try {
      const res = await fetch("/api/casino/play/mines/cashout", { method: "POST", credentials: "include" }); //
      const data = await res.json();
      if (data.status === "cashed_out") {
        setGame({ active: false, win: true, winAmount: data.winAmount, field: data.field }); //
        updateCredits();
      }
    } catch(e) { console.error(e); }
  };

  // UI Helper
  const renderTile = (i) => {
      // (Bleibt unverändert, nur Code gekürzt für Übersicht)
      const isRevealed = revealed[i];
      const isLost = game?.lost;
      const isWin = game?.win;
      let content = "";
      let bgColor = "bg-gray-700 hover:bg-gray-600";
      let borderColor = "border-gray-600";
      
      if (isRevealed) { bgColor = "bg-gray-800"; content = "💎"; }
      if ((isLost || isWin) && game.field) {
          if (game.field[i] === "bomb") {
              content = "💣";
              bgColor = isRevealed ? "bg-red-600" : "bg-gray-800 opacity-50"; 
              borderColor = "border-red-900";
          } else {
              content = "💎";
              bgColor = isRevealed ? "bg-green-600" : "bg-gray-800 opacity-50";
              borderColor = isRevealed ? "border-green-400" : "border-gray-800";
          }
      }
      return (
        <button 
          key={i} onClick={() => clickTile(i)} disabled={!game?.active || isRevealed}
          className={`w-12 h-12 md:w-16 md:h-16 rounded-lg font-bold text-2xl border-b-4 transition-all transform duration-100 ${!isRevealed && game?.active ? 'active:scale-95 active:border-b-0 hover:-translate-y-0.5' : ''} ${bgColor} ${borderColor} flex items-center justify-center`}
        >
          {content}
        </button>
      );
  };

  // Berechne aktuellen Multiplier für Anzeige
  const currentRevealed = revealed.filter(Boolean).length;
  const nextMulti = calculateNextMultiplier(currentRevealed);

  return (
    <div className="flex flex-col items-center gap-6 relative z-10">
      <h2 className="text-2xl font-bold">💣 Mines</h2>
      
      {!game?.active && !game?.lost && !game?.win ? (
        <div className="flex flex-col gap-4 bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
          <div className="flex items-center gap-2">
            <label className="w-20">Einsatz:</label>
            <input 
                type="number" 
                value={bet} 
                onChange={e=>{setBet(Number(e.target.value)); setError("")}} 
                className="bg-gray-900 p-2 rounded w-24 text-center border border-gray-600 focus:border-green-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
             <label className="w-20">Bomben:</label>
             <input type="range" min="1" max="24" value={bombs} onChange={e=>setBombs(Number(e.target.value))} className="w-32 accent-green-500"/>
             <span className="font-bold w-6 text-right">{bombs}</span>
          </div>
          
          {error && <div className="text-red-400 font-bold text-sm animate-pulse">{error}</div>}

          <button onClick={startGame} className="bg-green-600 hover:bg-green-500 py-2 rounded font-bold shadow-lg mt-2 active:scale-95 transition">Start Game</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
           {/* Info Bar */}
           <div className="flex justify-between w-full px-4 items-center bg-gray-800/80 p-3 rounded-lg border border-gray-700">
              <div className="text-gray-400 text-sm">
                 Nächster Hit: <span className="text-white font-bold">{nextMulti}x</span>
              </div>
              <div className="text-xl font-bold text-green-400 drop-shadow-md">{game.cashoutValue} <CoinIcon size="w-6 h-6" /></div>
           </div>
           
           {/* Grid */}
           <div className="grid grid-cols-5 gap-2 md:gap-3 bg-black/40 p-4 rounded-xl border border-gray-700 shadow-2xl">
             {Array.from({length: 25}, (_, i) => renderTile(i))}
           </div>

           {/* Controls */}
           {game?.active && (
             <button onClick={cashout} className="bg-green-500 hover:bg-green-400 text-black font-extrabold px-10 py-3 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-pulse transition hover:scale-105">
               CASHOUT {game.cashoutValue}
             </button>
           )}
           {(game?.lost || game?.win) && (
             <div className="text-center animate-in zoom-in duration-300">
                <h3 className={`text-2xl font-bold mb-2 ${game.lost ? 'text-red-500' : 'text-green-500'}`}>
                  {game.lost ? "BOOM! Verloren." : `Gewonnen: +${game.winAmount} `}<span><CoinIcon size="w-6 h-6" /></span>
                </h3>
                <button onClick={() => setGame(null)} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded text-white font-bold transition">Nochmal</button>
             </div>
           )}
        </div>
      )}
    </div>
  );
}