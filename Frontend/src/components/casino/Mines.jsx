import React, { useState } from "react";
import CoinIcon from "../CoinIcon";
import { Bomb, Diamond, Play, LogOut } from "lucide-react";

// Identische Konstante wie im Backend
const HOUSE_EDGE = 0.94; 

export default function Mines({ updateCredits, currentCredits }) {
  const [bet, setBet] = useState(50);
  const [bombs, setBombs] = useState(3);
  const [game, setGame] = useState(null); 
  const [revealed, setRevealed] = useState(Array(25).fill(false)); 
  const [error, setError] = useState(""); 

  const calculateNextMultiplier = (currentRevealedCount) => {
      const nextCount = currentRevealedCount + 1; 
      if (nextCount > (25 - (game?.bombCount || bombs))) return 0;

      let probability = 1;
      for (let i = 0; i < nextCount; i++) {
        const remainingSafe = 25 - (game?.bombCount || bombs) - i;
        const remainingTotal = 25 - i;
        probability *= (remainingSafe / remainingTotal);
      }

      if (probability === 0) return 0;
      const raw = 1 / probability;
      return (Math.floor(raw * HOUSE_EDGE * 100) / 100).toFixed(2);
  };

  const startGame = async () => {
    setError("");
    if (bet > currentCredits) { setError("Nicht genug Credits!"); return; }
    if (bet <= 0) { setError("Ungültiger Einsatz!"); return; }

    try {
      const res = await fetch("/api/casino/play/mines/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, bombCount: bombs }), credentials: "include"
      });
      const data = await res.json();
      
      if(data.error) { setError(data.error); return; }
      
      // WICHTIG: Kompletten Reset erzwingen, field auf null setzen
      setGame({ active: true, cashoutValue: bet, bombCount: bombs, field: null, lost: false, win: false });
      setRevealed(Array(25).fill(false));
      updateCredits();
    } catch(e) { console.error(e); setError("Verbindungsfehler"); }
  };

  const clickTile = async (index) => {
    // Klick ignorieren wenn Spiel vorbei oder Feld schon offen
    if (!game?.active || revealed[index]) return; 
    
    try {
      const res = await fetch("/api/casino/play/mines/click", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }), credentials: "include"
      });
      const data = await res.json();
      
      const newRev = [...revealed];
      newRev[index] = true;
      setRevealed(newRev);

      if (data.status === "boom") {
        // Spiel verloren -> field wird vom Server gesetzt
        setGame({ ...game, active: false, lost: true, field: data.field });
        updateCredits();
      } else {
        setGame(prev => ({ ...prev, cashoutValue: data.cashoutValue }));
      }
    } catch(e) { console.error(e); }
  };

  const cashout = async () => {
    try {
      const res = await fetch("/api/casino/play/mines/cashout", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.status === "cashed_out") {
        setGame({ ...game, active: false, win: true, winAmount: data.winAmount, field: data.field });
        updateCredits();
      }
    } catch(e) { console.error(e); }
  };

  // --- RENDERING ---
  const renderTile = (i) => {
      const isRevealed = revealed[i]; // Hat der Spieler draufgeklickt?
      const isGameOver = game?.lost || game?.win; // Ist das Spiel vorbei?
      
      // Standard: Geschlossen
      let content = null;
      let classes = "bg-[#151925] border-white/5 hover:border-white/20 shadow-inner";

      // ---------------------------------------------------------
      // FALL 1: SPIEL VORBEI (Alles aufdecken basierend auf Server-Daten)
      // ---------------------------------------------------------
      if (isGameOver && game?.field) {
          const type = game.field[i]; // "bomb" oder "diamond"

          if (type === "bomb") {
              if (isRevealed) {
                  // Diese Bombe hat der Spieler angeklickt -> EXPLOSION
                  classes = "bg-red-600 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.8)] z-10 scale-105";
                  content = <Bomb className="text-white animate-pulse" size={28} fill="currentColor" />;
              } else {
                  // Andere Bomben anzeigen (aber gedimmt)
                  classes = "bg-[#151925] border-red-900/40 opacity-50"; 
                  content = <Bomb className="text-red-600" size={24} />;
              }
          } else {
              // Es ist ein Diamant
              if (isRevealed) {
                  // Vom Spieler gefundener Diamant
                  classes = "bg-green-500/10 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
                  content = <Diamond className="text-green-400" size={24} fill="currentColor" />;
              } else {
                  // Nicht gefundener Diamant (gedimmt anzeigen)
                  classes = "bg-[#151925] border-white/5 opacity-20 grayscale";
                  content = <Diamond className="text-gray-500" size={20} />;
              }
          }
      } 
      // ---------------------------------------------------------
      // FALL 2: SPIEL LÄUFT NOCH
      // ---------------------------------------------------------
      else if (isRevealed) {
          // Im laufenden Spiel ist alles Aufgedeckte sicher ein Diamant
          classes = "bg-green-500/10 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]"; 
          content = <Diamond className="text-green-400 animate-in zoom-in spin-in-180 duration-300" size={24} fill="currentColor" />;
      }

      return (
        <button 
          key={i} 
          onClick={() => clickTile(i)} 
          disabled={!game?.active || isRevealed}
          className={`
            relative w-full aspect-square rounded-xl border-2 flex items-center justify-center transition-all duration-200
            ${!isRevealed && game?.active ? 'hover:-translate-y-1 hover:shadow-lg hover:border-violet-500/30 cursor-pointer active:scale-95' : 'cursor-default'}
            ${classes}
          `}
        >
          {content}
        </button>
      );
  };

  const currentRevealed = revealed.filter(Boolean).length;
  const nextMulti = calculateNextMultiplier(currentRevealed);

  return (
    <div className="flex flex-col items-center gap-8 py-4 w-full max-w-4xl mx-auto">
      
      <div className="text-center">
          <h2 className="text-3xl font-black text-white flex items-center justify-center gap-3">
              <Bomb className="text-yellow-500" fill="currentColor" /> MINES
          </h2>
          <p className="text-white/50 text-sm mt-1">Finde die Diamanten, meide die Bomben.</p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8 w-full">
          
          {/* LINKER BEREICH: SPIELFELD */}
          <div className="flex-1 bg-[#18181b] p-6 rounded-3xl border border-white/10 shadow-2xl order-2 md:order-1 flex flex-col gap-6">
             
             {/* Das Grid */}
             <div className="grid grid-cols-5 gap-3">
                {Array.from({length: 25}, (_, i) => renderTile(i))}
             </div>
             
             {/* Game Over Controls (JETZT UNTER DEM GRID) */}
             {(game?.lost || game?.win) && (
                 <div className="bg-black/40 border border-white/5 rounded-2xl p-6 animate-in slide-in-from-top-4 flex flex-col items-center gap-4">
                    <div className={`text-2xl font-black uppercase tracking-wider ${game.lost ? 'text-red-500' : 'text-green-400'}`}>
                        {game.lost ? "💥 Explodiert!" : "💎 Cashout Erfolgreich!"}
                    </div>
                    
                    {game.win && (
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                            Gewinn: <span className="text-green-400">+{game.winAmount}</span> <CoinIcon size="w-5 h-5" />
                        </div>
                    )}

                    <button 
                        onClick={() => {
                            // Reset State lokal, dann StartGame triggern oder einfach UI resetten
                            setGame(null); // Setzt UI auf "Start Settings" zurück
                            setRevealed(Array(25).fill(false));
                        }} 
                        className="bg-white hover:bg-gray-200 text-black font-bold px-8 py-3 rounded-xl shadow-lg transition-transform active:scale-95 w-full md:w-auto"
                    >
                        Neues Spiel
                    </button>
                 </div>
             )}
          </div>

          {/* RECHTER BEREICH: CONTROLS */}
          <div className="w-full md:w-80 flex flex-col gap-4 order-1 md:order-2">
              
              {!game?.active && !game?.lost && !game?.win ? (
                  // START SETTINGS (Nur sichtbar wenn kein Spiel läuft und kein Ergebnis angezeigt wird)
                  <div className="bg-[#18181b] p-6 rounded-3xl border border-white/10 shadow-lg space-y-6">
                      
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Einsatz</label>
                          <div className="relative">
                              <input 
                                  type="number" 
                                  value={bet} 
                                  onChange={e=>{setBet(Number(e.target.value)); setError("")}} 
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono font-bold focus:border-green-500 outline-none transition-colors"
                              />
                              <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                          </div>
                      </div>

                      <div className="space-y-2">
                          <div className="flex justify-between">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Minen Anzahl</label>
                              <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded">{bombs}</span>
                          </div>
                          <input 
                              type="range" min="1" max="24" 
                              value={bombs} onChange={e=>setBombs(Number(e.target.value))} 
                              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-colors"
                          />
                          <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase">
                              <span>Sicher</span>
                              <span>Riskant</span>
                          </div>
                      </div>

                      {error && <div className="text-red-400 font-bold text-xs bg-red-900/20 p-2 rounded border border-red-500/20 text-center animate-pulse">{error}</div>}

                      <button 
                        onClick={startGame} 
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl shadow-lg shadow-green-900/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                          <Play size={20} fill="currentColor" /> SPIELEN
                      </button>
                  </div>
              ) : (
                  // ACTIVE GAME / RESULT INFO
                  // Diese Box bleibt sichtbar, auch wenn Game Over ist, bis "Neues Spiel" geklickt wird
                  <div className="bg-[#18181b] p-6 rounded-3xl border border-white/10 shadow-lg space-y-6 relative overflow-hidden">
                      {game?.active && <div className="absolute top-0 left-0 w-full h-1 bg-green-500 animate-pulse" />}
                      
                      <div className="text-center">
                          <div className="text-xs text-gray-500 uppercase font-bold mb-1">Aktueller Gewinn</div>
                          <div className={`text-3xl font-black drop-shadow-md flex items-center justify-center gap-2 ${game?.lost ? 'text-gray-500 decoration-red-500 line-through' : 'text-green-400'}`}>
                              {game?.cashoutValue || bet} <CoinIcon size="w-6 h-6" />
                          </div>
                      </div>

                      <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-3">
                          <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400">Nächster Hit</span>
                              <span className="font-bold text-green-400">
                                  {game?.active ? `+${((nextMulti * bet) - game.cashoutValue).toFixed(0)}` : "-"}
                              </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400">Multiplier</span>
                              <span className="font-mono font-bold text-white">{game?.active ? nextMulti : "0.00"}x</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-400">Safe Tiles</span>
                              <span className="font-mono font-bold text-blue-400">
                                  {game?.active ? (25 - bombs - currentRevealed) : "-"}
                              </span>
                          </div>
                      </div>
                    
                      {/* Cashout Button nur aktiv wenn Spiel läuft */}
                      <button 
                        onClick={cashout} 
                        disabled={!game?.active}
                        className={`
                            w-full font-black py-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2
                            ${game?.active 
                                ? "bg-green-500 hover:bg-green-400 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]" 
                                : "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50"}
                        `}
                      >
                          <LogOut size={20} /> CASHOUT
                      </button>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}