import React, { useState, useEffect, useRef } from "react";
import CoinIcon from "../CoinIcon"; // Pfad anpassen falls nötig!
import confetti from "canvas-confetti";

export default function Dice({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(50); // Schieberegler Wert
  const [condition, setCondition] = useState("under"); // "under" oder "over"
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { roll: 55.55, isWin: true }
  
  // Audio / Animation Ref
  const resultRef = useRef(null);

  // --- BERECHNUNG FÜR UI ---
  // Gewinnchance
  const winChance = condition === "under" ? target : 100 - target;
  // Multiplikator (mit 1% Hausvorteil wie im Backend)
  const multiplier = (99 / winChance).toFixed(4);
  // Potenzieller Gewinn
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

        // Simuliere kurzes "Rollen" der Zahl
        let steps = 0;
        const interval = setInterval(() => {
            if(steps > 10) {
                clearInterval(interval);
                finishGame(data);
            } else {
                // Zufallszahlen anzeigen für Effekt
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
      updateCredits(); // Globalen Kontostand holen
      setIsPlaying(false);

      if (data.isWin) {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#4ade80'] });
      }
  };

  // --- SLIDER BACKGROUND STYLE ---
  // Berechnet den grünen/roten Balken hinter dem Slider
  const getTrackStyle = () => {
      // Prozentwert für CSS Gradient
      const p = target; 
      if (condition === "under") {
          // Links Grün (0 bis p), Rechts Rot
          return { background: `linear-gradient(to right, #22c55e 0%, #22c55e ${p}%, #ef4444 ${p}%, #ef4444 100%)` };
      } else {
          // Links Rot (0 bis p), Rechts Grün
          return { background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${p}%, #22c55e ${p}%, #22c55e 100%)` };
      }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto py-10 gap-8">
      
      {/* --- HEADER / ERGEBNIS --- */}
      <div className="relative w-full h-32 flex items-center justify-center">
          {/* Großes Ergebnis Display */}
          <div className="text-center z-10">
              <div 
                ref={resultRef}
                className={`text-6xl md:text-8xl font-black font-mono tracking-tighter transition-all duration-200 
                    ${!lastResult ? 'text-gray-500' : lastResult.isWin ? 'text-green-400 drop-shadow-[0_0_25px_rgba(34,197,94,0.6)]' : 'text-red-500'}
                `}
              >
                  {lastResult ? lastResult.roll.toFixed(2) : "50.00"}
              </div>
              
              {/* Win Anzeige darunter */}
              {lastResult && (
                  <div className={`text-xl font-bold mt-2 animate-in slide-in-from-bottom-2 ${lastResult.isWin ? 'text-green-400' : 'text-gray-400'}`}>
                      {lastResult.isWin ? `+${lastResult.winAmount}` : `-${bet}`} <CoinIcon />
                  </div>
              )}
          </div>
      </div>


      {/* --- GAME BOARD (Slider) --- */}
      <div className="w-full bg-gray-800 p-8 rounded-3xl border border-gray-700 shadow-2xl">
          
          {/* Info Stats Row */}
          <div className="flex justify-between text-sm font-bold text-gray-400 mb-2 px-2 uppercase tracking-widest">
             <span>0</span>
             <span>25</span>
             <span>50</span>
             <span>75</span>
             <span>100</span>
          </div>

          {/* DER SLIDER */}
          <div className="relative h-12 w-full flex items-center mb-10 group select-none">
              
              {/* 1. Track (Hintergrundbalken) */}
              <div 
                className="absolute left-0 right-0 h-4 rounded-full opacity-80 shadow-inner overflow-hidden"
                style={getTrackStyle()}
              ></div>
              
              {/* 2. Ergebnis Marker (Der Strich wo der Ball gelandet ist) */}
              {lastResult && (
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white z-10 shadow-[0_0_10px_white] transition-all duration-500 h-full"
                    style={{ left: `${lastResult.roll}%` }}
                  >
                      {/* Kleines Dreieck oben */}
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white"></div>
                  </div>
              )}

              {/* 3. Der "Griff" (Handle) - VISUELLER TEIL */}
              {/* Dieser Teil bewegt sich mit dem Target und zeigt Interaktion an */}
              <div 
                className="absolute h-8 w-8 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] z-20 flex items-center justify-center pointer-events-none transition-transform duration-75 group-active:scale-110 border-4 border-gray-800"
                style={{ 
                    left: `${target}%`, 
                    transform: 'translate(-50%, 0)' // Zentriert den Griff exakt auf dem Prozentwert
                }}
              >
                  {/* Icon: Links/Rechts Pfeile */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3m8-6l3 3-3 3" />
                  </svg>
                  
                  {/* Die Zahl (Bubble oben drüber) */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600 px-2 py-1 rounded text-xs font-bold text-white whitespace-nowrap">
                      {target}
                  </div>
              </div>

              {/* 4. Das Input Element (UNSICHTBAR, aber fängt die Maus ab) */}
              <input 
                  type="range" 
                  min="2" max="98" step="1"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  disabled={isPlaying}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing z-30"
                  title="Schieben um Gewinnchance zu ändern"
              />

              {/* 5. Hilfs-Text (Verschwindet beim Hovern/Benutzen optional, hier immer sichtbar als Hilfe) */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 font-mono uppercase tracking-widest pointer-events-none flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <span>↔</span> Verschieben <span>↔</span>
              </div>
          </div>

          {/* CONTROLS AREA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-700/50">
              
              {/* 1. Multiplier / Win Chance Anzeige */}
              <div className="flex flex-col justify-center gap-2 text-center md:text-left border-b md:border-b-0 md:border-r border-gray-700 pb-4 md:pb-0 md:pr-4">
                  <div className="flex justify-between items-center bg-gray-800 p-2 rounded">
                      <span className="text-xs text-gray-400 uppercase">Multiplier</span>
                      <span className="font-mono font-bold text-white">{multiplier}x</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-800 p-2 rounded">
                      <span className="text-xs text-gray-400 uppercase">Win Chance</span>
                      <span className="font-mono font-bold text-white">{winChance.toFixed(0)}%</span>
                  </div>
              </div>

              {/* 2. Modus Wahl & Einsatz */}
              <div className="flex flex-col gap-3 justify-center">
                  <div className="flex bg-gray-800 p-1 rounded-lg">
                      <button 
                        onClick={() => setCondition("under")} 
                        className={`flex-1 py-1 rounded text-xs font-bold uppercase transition ${condition === 'under' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                          Roll Under
                      </button>
                      <button 
                        onClick={() => setCondition("over")} 
                        className={`flex-1 py-1 rounded text-xs font-bold uppercase transition ${condition === 'over' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                          Roll Over
                      </button>
                  </div>
                  
                  <div className="flex items-center bg-gray-800 rounded-lg border border-gray-600 overflow-hidden px-2">
                      <span className="text-gray-500 text-xs font-bold mr-2">BET</span>
                      <input 
                            type="number" 
                            value={bet} 
                            onChange={e => setBet(Number(e.target.value))}
                            disabled={isPlaying}
                            className="w-full bg-transparent p-2 font-mono font-bold text-white focus:outline-none text-right"
                      />
                      <div className="pl-2"><CoinIcon size="w-4 h-4"/></div>
                  </div>
              </div>

              {/* 3. Action Button */}
              <div className="flex flex-col justify-center">
                   <button 
                    onClick={play}
                    disabled={isPlaying || bet > currentCredits}
                    className="w-full h-full min-h-[60px] bg-green-500 hover:bg-green-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-extrabold text-2xl rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] transform active:scale-95 transition-all"
                   >
                       {isPlaying ? "Rolling..." : "ROLL DICE"}
                   </button>
                   <div className="text-center mt-2 text-xs text-gray-500 font-mono">
                       Payout: <span className="text-white">{profit}</span>
                   </div>
              </div>

          </div>
      </div>
    </div>
  );
}