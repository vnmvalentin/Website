import React, { useState, useRef } from "react";
import confetti from "canvas-confetti";
import CoinIcon from "../CoinIcon";
import { RotateCcw, Trash2 } from "lucide-react";

// --- KONSTANTEN (Original) ---
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const CHIP_VALUES = [1, 10, 50, 100, 500, 1000];

export default function Roulette({ updateCredits, currentCredits }) {
  const [spinning, setSpinning] = useState(false);
  const [ballDrop, setBallDrop] = useState(false); 
  const [bets, setBets] = useState([]); 
  const [selectedChip, setSelectedChip] = useState(10);
  const [lastWin, setLastWin] = useState(null);
  const [previousBets, setPreviousBets] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastTotalBet, setLastTotalBet] = useState(0);

  const wheelRef = useRef(null);
  const ballRef = useRef(null);

  const applyLastBet = () => {
    if (spinning || previousBets.length === 0) return;

    // Berechne Gesamtkosten der letzten Wette
    const totalCost = previousBets.reduce((sum, bet) => sum + bet.amount, 0);

    // Prüfen, ob genug Guthaben vorhanden ist
    if (totalCost > currentCredits) {
        alert("Nicht genug Guthaben, um die letzte Wette zu wiederholen!");
        return;
    }

    // Wetten setzen (kopieren, um Referenzprobleme zu vermeiden)
    setBets([...previousBets]);
  };


  // --- WETTEN LOGIK (Original) ---
  const placeBet = (type, value, id) => {
    if (spinning) return;
    const currentTotal = bets.reduce((s, b) => s + b.amount, 0);
    if (currentTotal + selectedChip > currentCredits) return; 

    setBets(prev => {
      const existing = prev.find(b => b.id === id);
      if (existing) {
        return prev.map(b => b.id === id ? { ...b, amount: b.amount + selectedChip } : b);
      }
      return [...prev, { id, type, value, amount: selectedChip }];
    });
  };

  const clearBets = () => setBets([]);

  // --- GAMEPLAY (Original) ---
  const spin = async () => {
    if (bets.length === 0) return;

    setPreviousBets(bets);

    const currentTotalBet = bets.reduce((a, b) => a + b.amount, 0);
    setLastTotalBet(currentTotalBet);

    setSpinning(true);
    setBallDrop(false); 
    setLastWin(null);

    try {
      const res = await fetch("/api/casino/play/roulette/spin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bets }), credentials: "include"
      });
      const data = await res.json();
      
      if (data.error) {
          alert(data.error);
          setSpinning(false);
          return;
      }

      const winningIndex = WHEEL_NUMBERS.indexOf(data.result.number);
      const degreePerSegment = 360 / 37;
      const spinDuration = 5000; 

      // Animation Calculation (1:1 Original)
      const wheelSpins = 5; 
      const targetAngle = winningIndex * degreePerSegment; 
      const finalWheelRotation = (360 * wheelSpins) - targetAngle;
      const ballContainerRotation = -360 * (wheelSpins - 1); 

      if (wheelRef.current) {
          wheelRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.15, 0, 0.15, 1)`;
          wheelRef.current.style.transform = `rotate(${finalWheelRotation}deg)`;
      }

      if (ballRef.current) {
           ballRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.15, 0, 0.15, 1)`;
           ballRef.current.style.transform = `rotate(${ballContainerRotation}deg)`;
      }

      // Ball Drop (Original Timing)
      setTimeout(() => {
          setBallDrop(true);
      }, spinDuration * 0.65);

      // Finish (Original Timing)
      setTimeout(() => {
        setSpinning(false);
        setHistory(prev => [data.result, ...prev].slice(0, 10));
        setLastWin(data.winAmount);
        
        if (data.winAmount > 0) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
        
        updateCredits();
        setBets([]);
        
        // Reset Positionen (Silent Reset)
        setTimeout(() => {
             if(wheelRef.current) {
                 wheelRef.current.style.transition = "none";
                 wheelRef.current.style.transform = `rotate(${-targetAngle}deg)`; 
             }
             if(ballRef.current) {
                 ballRef.current.style.transition = "none";
                 ballRef.current.style.transform = `rotate(0deg)`;
             }
             setBallDrop(false); 
        }, 1000);

      }, spinDuration + 1000); 

    } catch (e) {
      console.error(e);
      setSpinning(false);
    }
  };

  const getNumberColor = (n) => {
    if (n === 0) return "bg-green-600 border-green-400";
    return RED_NUMBERS.includes(n) ? "bg-red-600 border-red-400" : "bg-gray-800 border-gray-600";
  };

  const renderChip = (id) => {
      const bet = bets.find(b => b.id === id);
      if (!bet) return null;
      return (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none animate-in zoom-in duration-200">
              <div className="w-8 h-8 rounded-full bg-yellow-400 border-4 border-dashed border-white shadow-[0_4px_6px_rgba(0,0,0,0.5)] flex items-center justify-center text-black font-black text-[10px]">
                  {bet.amount >= 1000 ? (bet.amount/1000).toFixed(0)+'k' : bet.amount}
              </div>
          </div>
      );
  };

  
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-7xl mx-auto py-8">
      
      {/* HEADER & HISTORY */}
      <div className="w-full flex flex-wrap justify-between items-center bg-[#18181b] p-4 rounded-2xl border border-white/10 shadow-lg gap-4">
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {history.map((h, i) => (
                  <div key={i} className={`w-8 h-8 rounded-lg flex shrink-0 items-center justify-center font-bold text-sm border shadow-sm text-white ${getNumberColor(h.number)}`}>
                      {h.number}
                  </div>
              ))}
              {history.length === 0 && <span className="text-gray-500 text-sm font-medium pl-2">Verlauf...</span>}
          </div>
          <div className="text-right pl-4 min-w-[150px]">
              {lastWin !== null && (
                  <span className={`text-xl font-bold flex items-center justify-end gap-2 ${lastWin > 0 ? "text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.4)]" : "text-red-400"}`}>
                      {lastWin > 0 ? `+${lastWin}` : `-${lastTotalBet}`} <CoinIcon size="w-5 h-5" />
                  </span>
              )}
          </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-12 items-center xl:items-start w-full justify-center">
          
          {/* --- DAS RAD (Modernisiert) --- */}
          <div className="relative w-[360px] h-[360px] shrink-0 border-[16px] border-[#1a1a1a] rounded-full shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] bg-[#0f0f0f] overflow-hidden">
              
              {/* Holzbahn */}
              <div className="absolute inset-0 rounded-full border-[24px] border-[#3e2723] shadow-[inset_0_0_20px_black] z-10"></div>

              {/* Silberner Ring */}
              <div className="absolute inset-[24px] rounded-full border-[2px] border-gray-500 z-10 pointer-events-none shadow-md opacity-50"></div>

              {/* Zahlenkranz */}
              <div ref={wheelRef} className="absolute inset-7 rounded-full transition-transform will-change-transform z-0">
                  {WHEEL_NUMBERS.map((num, i) => {
                      const angle = (360 / 37) * i;
                      return (
                          <div 
                              key={num}
                              className="absolute top-0 left-1/2 w-[26px] h-[50%] origin-bottom flex flex-col justify-start items-center -ml-[13px]"
                              style={{ transform: `rotate(${angle}deg)` }}
                          >
                             <div 
                                className={`absolute top-0 left-0 w-full h-[50%] ${num===0?'bg-green-700':RED_NUMBERS.includes(num)?'bg-red-700':'bg-black'}`} 
                                style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
                             ></div>
                             <span className="absolute top-1 text-[10px] font-bold text-white z-20 drop-shadow-md">{num}</span>
                          </div>
                      );
                  })}
                  <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-gradient-to-b from-gray-700 to-black border-4 border-yellow-600 shadow-xl flex items-center justify-center z-30">
                     <CoinIcon className="w-10 h-10 opacity-80" />
                  </div>
              </div>

              {/* Ball */}
              <div ref={ballRef} className="absolute inset-0 rounded-full pointer-events-none z-40 will-change-transform">
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_white] transition-all duration-1000 ease-in-out"
                    style={{ top: ballDrop ? '45px' : '6px' }}
                  ></div>
              </div>
          </div>

          {/* --- TISCH (Betting Board - Modern Felt) --- */}
          <div className="flex-1 w-full max-w-4xl bg-emerald-900/90 p-4 md:p-8 rounded-3xl border-8 border-[#3e2723] shadow-2xl relative select-none">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
               
               <div className="relative z-10 grid grid-cols-[50px_repeat(12,1fr)] gap-1 w-full text-sm sm:text-base font-bold">
                  {/* 0 */}
                  <div onClick={() => placeBet('number', 0, 'n0')} className="row-span-3 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 rounded-l-lg flex items-center justify-center text-white cursor-pointer relative transition-all group">
                      <span className="group-hover:scale-125 transition-transform drop-shadow-md">0</span>
                      {renderChip('n0')}
                  </div>
                  
                  {/* Numbers Grid */}
                  {[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-12 md:h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700 hover:bg-red-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"} transition-colors hover:z-10 hover:border-yellow-400 shadow-sm`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}
                  {[2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-12 md:h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700 hover:bg-red-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"} transition-colors hover:z-10 hover:border-yellow-400 shadow-sm`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}
                  {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-12 md:h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700 hover:bg-red-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"} transition-colors hover:z-10 hover:border-yellow-400 shadow-sm`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}

                  {/* Bottom Bets */}
                  <div className="col-start-2 col-span-4 mt-2"><button onClick={() => placeBet('dozen', 1, 'd1')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs text-white/80 relative">1st 12 {renderChip('d1')}</button></div>
                  <div className="col-span-4 mt-2"><button onClick={() => placeBet('dozen', 2, 'd2')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs text-white/80 relative">2nd 12 {renderChip('d2')}</button></div>
                  <div className="col-span-4 mt-2"><button onClick={() => placeBet('dozen', 3, 'd3')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs text-white/80 relative">3rd 12 {renderChip('d3')}</button></div>
                  
                  <div className="col-start-2 col-span-2 mt-1"><button onClick={() => placeBet('half', 'low', 'low')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] text-white/80 relative">1-18 {renderChip('low')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('parity', 'even', 'even')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] text-white/80 relative">EVEN {renderChip('even')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('color', 'red', 'red')} className="w-full py-3 bg-red-900/60 border-2 border-red-500/50 rounded hover:bg-red-800 font-bold text-[10px] text-red-200 relative">RED {renderChip('red')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('color', 'black', 'black')} className="w-full py-3 bg-black/40 border-2 border-gray-600 rounded hover:bg-black/60 font-bold text-[10px] text-gray-300 relative">BLACK {renderChip('black')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('parity', 'odd', 'odd')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] text-white/80 relative">ODD {renderChip('odd')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('half', 'high', 'high')} className="w-full py-3 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] text-white/80 relative">19-36 {renderChip('high')}</button></div>
              </div>
          </div>
      </div>

      {/* CONTROLS */}
      <div className="bg-[#18181b] p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-8 items-center w-full justify-between shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="flex gap-3">
              {CHIP_VALUES.map(val => (
                  <button 
                    key={val} 
                    onClick={() => setSelectedChip(val)}
                    className={`w-12 h-12 rounded-full border-2 font-black shadow-lg transition-all hover:scale-110 flex items-center justify-center text-xs sm:text-sm
                        ${selectedChip === val ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900 scale-110' : 'opacity-80 hover:opacity-100'} 
                        ${val === 1 ? 'bg-gray-300 text-black border-gray-400' :
                          val === 10 ? 'bg-blue-600 border-blue-400 text-white' : 
                          val === 50 ? 'bg-red-600 border-red-400 text-white' : 
                          val === 100 ? 'bg-green-600 border-green-400 text-white' : 'bg-black border-yellow-500 text-yellow-500'}
                    `}
                  >
                      {val}
                  </button>
              ))}
          </div>
          
          <div className="flex items-center gap-6">
              <div className="text-right">
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Einsatz</div>
                  <div className="text-2xl font-mono text-white font-bold drop-shadow">{bets.reduce((a,b)=>a+b.amount,0).toLocaleString()}</div>
              </div>
              
              <div className="flex gap-3">
                  <button onClick={clearBets} disabled={spinning} className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold disabled:opacity-50 transition border border-white/10 flex items-center gap-2">
                      <Trash2 size={18} />
                  </button>

                  {/* NEU: Last Bet Button */}
                  <button 
                    onClick={applyLastBet} 
                    disabled={spinning || previousBets.length === 0} 
                    className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold disabled:opacity-50 transition border border-white/10 flex items-center gap-2 group"
                    title="Letzten Einsatz wiederholen"
                  >
                      <RotateCcw size={18} className={`group-hover:-rotate-180 transition-transform duration-500 ${previousBets.length === 0 ? 'opacity-50' : ''}`} />
                  </button>
                  
                  <button 
                    onClick={spin} 
                    disabled={spinning || bets.length === 0}
                    className="px-10 py-3 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-black text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 transition-all border border-yellow-400 uppercase tracking-wider"
                  >
                      {spinning ? "Rollen..." : "Drehen"}
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}