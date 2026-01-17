import React, { useState, useRef } from "react";
import confetti from "canvas-confetti";
import CoinIcon from "../CoinIcon";


const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

const CHIP_VALUES = [1, 10, 50, 100, 500, 1000];

export default function Roulette({ updateCredits, currentCredits }) {
  const [spinning, setSpinning] = useState(false);
  const [ballDrop, setBallDrop] = useState(false); // NEU: Steuert, ob Kugel innen oder außen ist
  const [bets, setBets] = useState([]); 
  const [selectedChip, setSelectedChip] = useState(10);
  const [lastWin, setLastWin] = useState(null);
  const [history, setHistory] = useState([]);
  const [lastTotalBet, setLastTotalBet] = useState(0);

  const wheelRef = useRef(null);
  const ballRef = useRef(null);

  // --- WETTEN LOGIK ---
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

  // --- GAMEPLAY ---
  const spin = async () => {
    if (bets.length === 0) return;

    // HIER EINFÜGEN: Gesamteinsatz berechnen und speichern
    const currentTotalBet = bets.reduce((a, b) => a + b.amount, 0);
    setLastTotalBet(currentTotalBet);

    setSpinning(true);
    setBallDrop(false); // Kugel startet außen
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
      const spinDuration = 5000; // 5 Sekunden Spin

      // --- ANIMATION CALCULATION ---
      // Das Rad dreht sich im Uhrzeigersinn.
      // Damit die Gewinner-Zahl OBEN (bei 12 Uhr) landet, müssen wir das Rad so drehen:
      const wheelSpins = 5; 
      const targetAngle = winningIndex * degreePerSegment; 
      const finalWheelRotation = (360 * wheelSpins) - targetAngle;

      // Kugel Animation: Dreht entgegengesetzt (Gegenuhrzeigersinn)
      // Wir drehen den Container der Kugel.
      const ballContainerRotation = -360 * (wheelSpins - 1); 

      // 1. Rad drehen
      if (wheelRef.current) {
          wheelRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.15, 0, 0.15, 1)`;
          wheelRef.current.style.transform = `rotate(${finalWheelRotation}deg)`;
      }

      // 2. Kugel drehen (Container)
      if (ballRef.current) {
           ballRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.15, 0, 0.15, 1)`;
           ballRef.current.style.transform = `rotate(${ballContainerRotation}deg)`;
      }

      // 3. Kugel fällt nach innen ("Drop")
      // Startet bei ca. 70% der Zeit
      setTimeout(() => {
          setBallDrop(true);
      }, spinDuration * 0.65);

      // 4. ENDE: Suspense Delay (Verzögerung)
      setTimeout(() => {
        // Erst hier Credits updaten und Win anzeigen
        setSpinning(false);
        setHistory(prev => [data.result, ...prev].slice(0, 10));
        setLastWin(data.winAmount);
        
        if (data.winAmount > 0) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
        
        updateCredits();
        setBets([]);
        
        // Reset Positionen (unsichtbar zurücksetzen für nächsten Spin)
        setTimeout(() => {
             if(wheelRef.current) {
                 wheelRef.current.style.transition = "none";
                 wheelRef.current.style.transform = `rotate(${-targetAngle}deg)`; 
             }
             if(ballRef.current) {
                 ballRef.current.style.transition = "none";
                 ballRef.current.style.transform = `rotate(0deg)`;
             }
             setBallDrop(false); // Kugel wieder nach außen
        }, 1000);

      }, spinDuration + 1000); // 1 Sekunde Extra-Wartezeit für Spannung

    } catch (e) {
      console.error(e);
      setSpinning(false);
    }
  };

  const getNumberColor = (n) => {
    if (n === 0) return "bg-green-600";
    return RED_NUMBERS.includes(n) ? "bg-red-600" : "bg-gray-900";
  };

  const renderChip = (id) => {
      const bet = bets.find(b => b.id === id);
      if (!bet) return null;
      return (
          <div className="absolute -top-3 -right-3 z-20 animate-in zoom-in duration-200 pointer-events-none">
              <div className="w-6 h-6 rounded-full bg-yellow-400 border-2 border-white shadow-md flex items-center justify-center text-black font-bold text-[10px]">
                  {bet.amount >= 1000 ? (bet.amount/1000).toFixed(0)+'k' : bet.amount}
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-6xl mx-auto py-8 mt-12">
      
      {/* HEADER & HISTORY */}
      <div className="w-full flex justify-between items-center bg-gray-900 p-4 rounded-xl border border-gray-700 shadow-lg">
          <div className="flex gap-2 overflow-x-auto pb-1">
              {history.map((h, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center font-bold text-sm border-2 border-white/10 ${getNumberColor(h.number)}`}>
                      {h.number}
                  </div>
              ))}
              {history.length === 0 && <span className="text-gray-500 text-sm">Verlauf...</span>}
          </div>
          <div className="text-right pl-4">
              {lastWin !== null && (
                  <span className={`text-xl font-bold ${lastWin > 0 ? "text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]" : "text-red-400"}`}>
                      {lastWin > 0 ? `+${lastWin}` : `Verloren: ${lastTotalBet}`}<span><CoinIcon size="w-5 h-5" /></span>
                  </span>
              )}
          </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 items-center lg:items-start w-full">
          
          {/* --- DAS RAD (Korrigierte Version) --- */}
          <div className="relative w-[360px] h-[360px] shrink-0 border-[12px] border-gray-950 rounded-full shadow-2xl bg-gray-900 overflow-hidden">
              
              {/* 1. DIE HOLZBAHN (Statisch oder dreht sich nicht mit den Zahlen) */}
              <div className="absolute inset-0 rounded-full border-[24px] border-[#5d4037] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] z-10">
                  {/* Optionale Holz-Maserung via CSS Gradient */}
                  <div className="absolute inset-0 rounded-full opacity-30 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(0,0,0,0.3)_30deg,transparent_60deg)]"></div>
              </div>

              {/* 2. SILBERNER INNEN-RING (Trennlinie zwischen Holz und Zahlen) */}
              <div className="absolute inset-[24px] rounded-full border-[4px] border-gray-400/50 z-10 pointer-events-none shadow-md"></div>

              {/* 3. DREHENDER TEIL (Zahlenkranz) */}
              {/* Wir machen ihn etwas kleiner (inset-7), damit er IN der Holzbahn liegt */}
              <div ref={wheelRef} className="absolute inset-7 rounded-full transition-transform will-change-transform z-0">
                  {WHEEL_NUMBERS.map((num, i) => {
                      const angle = (360 / 37) * i;
                      // KORREKTE MATHEMATIK:
                      // Radius ca. 150px. Winkel 9.72 Grad.
                      // Notwendige Breite am Rand = 2 * r * tan(alpha/2)
                      // 2 * 150 * 0.085 = ca 25.5px.
                      // Wir nehmen 26px Breite und richten sie mittig aus (-ml-[13px]).
                      
                      return (
                          <div 
                              key={num}
                              className="absolute top-0 left-1/2 w-[26px] h-[50%] origin-bottom flex flex-col justify-start items-center -ml-[13px]"
                              style={{ transform: `rotate(${angle}deg)` }}
                          >
                             {/* Das farbige Segment */}
                             {/* Wir ziehen es etwas länger (h-full) und nutzen clip-path präzise */}
                             <div 
                                className={`absolute top-0 left-0 w-full h-[50%] ${num===0?'bg-green-600':RED_NUMBERS.includes(num)?'bg-red-600':'bg-black'}`} 
                                style={{ 
                                    // Polygon macht ein Dreieck. Durch die exakte Breite entstehen kaum Lücken.
                                    clipPath: 'polygon(50% 100%, 0 0, 100% 0)' 
                                }}
                             ></div>

                             {/* Die Zahl - JETZT SICHTBAR */}
                             {/* Absolut positioniert innerhalb des Slices, damit sie über dem Hintergrund liegt */}
                             <span 
                                className="absolute top-1 text-[10px] sm:text-[11px] font-bold text-white z-20" 
                                style={{ 
                                    // Zahl zeigt zum Zentrum (üblich bei Roulette) oder nach außen.
                                    // Hier: Standard Ausrichtung
                                    textShadow: '0 1px 1px rgba(0,0,0,0.8)'
                                }}
                             >
                                {num}
                             </span>
                          </div>
                      );
                  })}
                  
                  {/* Dekorative Mitte (Cone/Turret) */}
                  <div className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-gradient-to-br from-gray-800 to-black border-4 border-yellow-600/60 shadow-[0_0_15px_black] flex items-center justify-center z-30">
                     <span className="text-3xl filter drop-shadow-lg"><CoinIcon size="w-23 h-23" /></span>
                  </div>
              </div>

              {/* 4. BALL (Animation Layer) */}
              <div ref={ballRef} className="absolute inset-0 rounded-full pointer-events-none z-40 will-change-transform">
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-all duration-1000 ease-in-out"
                    style={{ 
                        background: 'radial-gradient(circle at 30% 30%, #fff, #bbb)',
                        // Ball Positionen angepasst:
                        // 8px = Auf der Holzbahn (Border ist 24px breit)
                        // 48px = In den Zahlen (Zahlenring beginnt bei inset-7 also ca 28px + tiefe)
                        top: ballDrop ? '45px' : '6px' 
                    }}
                  ></div>
              </div>

          </div>

          {/* --- TISCH (Betting Board) --- */}
          {/* Unverändert, nur Code gekürzt für Übersicht */}
          <div className="flex-1 w-full bg-green-900 p-6 md:p-8 rounded-xl border-[8px] border-yellow-700/50 shadow-inner relative select-none">
               <div className="grid grid-cols-[50px_repeat(12,1fr)] gap-1 w-full max-w-3xl mx-auto text-sm sm:text-base">
                  <div onClick={() => placeBet('number', 0, 'n0')} className="row-span-3 bg-green-700 hover:bg-green-600 border border-green-500 rounded-l-lg flex items-center justify-center font-bold text-white cursor-pointer relative transition-colors group">
                      <span className="group-hover:scale-125 transition-transform">0</span>
                      {renderChip('n0')}
                  </div>
                  {[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700/80 hover:bg-red-600" : "bg-gray-800/80 hover:bg-gray-700"} transition-colors hover:z-10 hover:border-yellow-400`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}
                  {[2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700/80 hover:bg-red-600" : "bg-gray-800/80 hover:bg-gray-700"} transition-colors hover:z-10 hover:border-yellow-400`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}
                  {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].map(n => (
                      <div key={n} onClick={() => placeBet('number', n, `n${n}`)} className={`h-14 flex items-center justify-center border border-white/10 cursor-pointer relative ${RED_NUMBERS.includes(n) ? "bg-red-700/80 hover:bg-red-600" : "bg-gray-800/80 hover:bg-gray-700"} transition-colors hover:z-10 hover:border-yellow-400`}>
                          {n} {renderChip(`n${n}`)}
                      </div>
                  ))}
                  {/* ... Restliche Wettfelder (Dozens, Colors etc.) wie im vorherigen Code ... */}
                  <div className="col-start-2 col-span-4 mt-2"><button onClick={() => placeBet('dozen', 1, 'd1')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs relative">1st 12 {renderChip('d1')}</button></div>
                  <div className="col-span-4 mt-2"><button onClick={() => placeBet('dozen', 2, 'd2')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs relative">2nd 12 {renderChip('d2')}</button></div>
                  <div className="col-span-4 mt-2"><button onClick={() => placeBet('dozen', 3, 'd3')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold uppercase text-xs relative">3rd 12 {renderChip('d3')}</button></div>
                  
                  <div className="col-start-2 col-span-2 mt-1"><button onClick={() => placeBet('half', 'low', 'low')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] relative">1-18 {renderChip('low')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('parity', 'even', 'even')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] relative">EVEN {renderChip('even')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('color', 'red', 'red')} className="w-full py-2 bg-red-800/50 border-2 border-red-500/50 rounded hover:bg-red-600 font-bold text-[10px] relative">RED {renderChip('red')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('color', 'black', 'black')} className="w-full py-2 bg-black/50 border-2 border-gray-600 rounded hover:bg-black font-bold text-[10px] relative">BLACK {renderChip('black')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('parity', 'odd', 'odd')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] relative">ODD {renderChip('odd')}</button></div>
                  <div className="col-span-2 mt-1"><button onClick={() => placeBet('half', 'high', 'high')} className="w-full py-2 bg-transparent border-2 border-white/20 rounded hover:bg-white/10 font-bold text-[10px] relative">19-36 {renderChip('high')}</button></div>
              </div>
          </div>
      </div>

      {/* CONTROLS */}
      <div className="bg-gray-800 p-4 rounded-xl border border-gray-600 flex flex-col md:flex-row gap-6 items-center w-full justify-between shadow-2xl">
          <div className="flex gap-2">
              {CHIP_VALUES.map(val => (
                  <button 
                    key={val} 
                    onClick={() => setSelectedChip(val)}
                    className={`w-12 h-12 rounded-full border-2 font-bold shadow-lg transition-transform hover:scale-110 flex items-center justify-center text-xs sm:text-sm
                        ${selectedChip === val ? 'border-yellow-400 -translate-y-2 ring-2 ring-yellow-400/50' : 'border-gray-500 opacity-70'} 
                        ${val === 1 ? 'bg-gray-300 text-black border-gray-400' :
                          val === 10 ? 'bg-blue-600' : 
                          val === 50 ? 'bg-red-600' : 
                          val === 100 ? 'bg-green-600' : 'bg-black'}
                    `}
                  >
                      {val}
                  </button>
              ))}
          </div>
          <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Gesamteinsatz</div>
              <div className="text-2xl font-mono text-yellow-400 font-bold drop-shadow">{bets.reduce((a,b)=>a+b.amount,0)}<CoinIcon size="w-5 h-5" /></div>
          </div>
          <div className="flex gap-2">
              <button onClick={clearBets} disabled={spinning} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold disabled:opacity-50 transition border border-gray-600">Löschen</button>
              <button 
                onClick={spin} 
                disabled={spinning || bets.length === 0}
                className="px-10 py-3 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-extrabold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 transition-all border border-yellow-400"
              >
                  {spinning ? "Kugel rollt..." : "SPIN 🎰"}
              </button>
          </div>
      </div>
    </div>
  );
}