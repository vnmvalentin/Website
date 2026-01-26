import React, { useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import CoinIcon from "../CoinIcon";
import { AlertCircle, Play, XCircle } from "lucide-react";

// --- KONFIGURATION (Original) ---
const ROWS_OPTIONS = [8, 12, 16];
const RISK_OPTIONS = ['low', 'medium', 'high'];
const PIN_SPACING = 34; 
const ROW_HEIGHT = 30;  

const getBucketColor = (val) => {
    if(val >= 100) return "bg-red-600 shadow-[0_0_15px_red] z-20 border border-red-400";
    if(val >= 20) return "bg-orange-600 shadow-[0_0_10px_orange] z-20 border border-orange-400";
    if(val >= 5) return "bg-yellow-500 text-black z-20 border border-yellow-300";
    if(val >= 2) return "bg-yellow-600/80 z-20 border border-yellow-500/50";
    if(val < 1) return "bg-gray-800 border border-gray-600 opacity-50 z-20";
    return "bg-gray-700 z-20 border border-gray-600";
};

const MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
  }
};

// --- BALL KOMPONENTE ---
const PlinkoBall = React.memo(({ path, onFinish }) => {
    const [x, setX] = useState(0); 
    const [y, setY] = useState(0); 
    const onFinishRef = useRef(onFinish);

    useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

    useEffect(() => {
        const speed = 200; 
        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep >= path.length) {
                clearInterval(interval);
                setY(cy => cy + 0.6); // Plumps in den Eimer
                setTimeout(() => { if (onFinishRef.current) onFinishRef.current(); }, 100);
                return;
            }
            const direction = path[currentStep] === 0 ? -0.5 : 0.5;
            setX(cx => cx + direction);
            setY(cy => cy + 1);
            currentStep++;
        }, speed);
        return () => clearInterval(interval);
    }, [path]);

    return (
        <div 
            className="absolute w-3.5 h-3.5 bg-yellow-400 rounded-full shadow-[0_0_8px_yellow] pointer-events-none will-change-transform border border-white/50"
            style={{
                top: `${y * ROW_HEIGHT}px`,
                left: `calc(50% + ${x * PIN_SPACING}px)`,
                transform: 'translate(-50%, -50%)',
                zIndex: 10, 
                transition: 'top 200ms linear, left 200ms linear' 
            }}
        />
    );
});

const FloatText = ({ x, amount }) => {
    return (
        <div 
            className="absolute text-sm font-black text-green-400 pointer-events-none animate-out fade-out slide-out-to-top-10 duration-1000 z-50 whitespace-nowrap drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
            style={{
                bottom: '40px', 
                left: `calc(50% + ${x * PIN_SPACING}px)`,
                transform: 'translateX(-50%)',
            }}
        >
            +{amount}
        </div>
    );
};

export default function Plinko({ updateCredits, currentCredits, onClientUpdate }) {
  // 1. STATES
  const [bet, setBet] = useState(100);
  const [risk, setRisk] = useState('medium');
  const [rows, setRows] = useState(16);
  const [ballsToDrop, setBallsToDrop] = useState(1);
  const [visualBalance, setVisualBalance] = useState(currentCredits);
  
  const [activeBalls, setActiveBalls] = useState([]); 
  const [floatTexts, setFloatTexts] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastHitBucketIndex, setLastHitBucketIndex] = useState(null);
  const [sessionStats, setSessionStats] = useState({ invested: 0, won: 0 });
  const [isSpawning, setIsSpawning] = useState(false);

  const [batchInfo, setBatchInfo] = useState({ total: 0, spawned: 0, finished: 0 });

  // 2. REFS
  const creditsRef = useRef(currentCredits);
  const stopSpawningRef = useRef(false);
  const gameBoardRef = useRef(null);
  const finalServerBalanceRef = useRef(null); 

  // 3. USE EFFECTS
  useEffect(() => {
      creditsRef.current = currentCredits;
      if (activeBalls.length === 0 && !isSpawning) {
          setVisualBalance(currentCredits);
      }
  }, [currentCredits, activeBalls.length, isSpawning]);

  const setVisualCredits = (val) => {
      setVisualBalance(val);
      if (onClientUpdate) onClientUpdate(val); 
  };

  // --- LOGIK: BULK DROP ---
  const handleBulkDrop = async () => {
      if (isSpawning) {
          setIsSpawning(false);
          stopSpawningRef.current = true;
          return;
      }

      const count = parseInt(ballsToDrop) || 1;
      const totalCost = bet * count;

      if (totalCost > visualBalance) {
          alert(`Nicht genug Credits für ${count} Bälle!`);
          return;
      }

      if (activeBalls.length === 0) setSessionStats({ invested: 0, won: 0 });

      setBatchInfo({ total: count, spawned: 0, finished: 0 });
      setIsSpawning(true);
      stopSpawningRef.current = false;

      setVisualCredits(visualBalance - totalCost);
      setSessionStats(prev => ({ ...prev, invested: prev.invested + totalCost }));

      try {
          const res = await fetch("/api/casino/play/plinko", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bet, risk, rows, count }), 
              credentials: "include"
          });
          const data = await res.json();
          
          if (data.error) {
              setVisualCredits(visualBalance); 
              setIsSpawning(false);
              alert(data.error);
              return;
          }

          finalServerBalanceRef.current = data.finalCredits; 
          const results = data.results || []; 
          setBatchInfo(prev => ({ ...prev, total: results.length }));

          for (let i = 0; i < results.length; i++) {
              if (stopSpawningRef.current) {
                  setBatchInfo(prev => ({ ...prev, total: i })); 
                  break; 
              }

              const result = results[i];
              const newBall = {
                  id: Date.now() + Math.random(),
                  path: result.path,
                  winAmount: result.winAmount,
                  multiplier: result.multiplier,
                  bucketIndex: result.bucketIndex,
                  endX: result.bucketIndex - (MULTIPLIERS[rows][risk].length - 1) / 2
              };

              setActiveBalls(prev => [...prev, newBall]);
              setBatchInfo(prev => ({ ...prev, spawned: i + 1 }));

              await new Promise(r => setTimeout(r, 100));
          }

      } catch (e) {
          console.error(e);
          setVisualCredits(visualBalance);
      } finally {
          setIsSpawning(false);
          stopSpawningRef.current = false;
      }
  };

  const handleBallFinish = useCallback((ball) => {
      setActiveBalls(prev => {
          const newState = prev.filter(b => b.id !== ball.id);
          if (newState.length === 0 && !stopSpawningRef.current) {
              if (finalServerBalanceRef.current !== null) {
                  setVisualCredits(finalServerBalanceRef.current);
                  updateCredits(); 
              }
          }
          return newState;
      });
      
      setBatchInfo(prev => ({ ...prev, finished: prev.finished + 1 }));

      if (ball.winAmount > 0) {
          setVisualBalance(prev => prev + ball.winAmount);
          const newText = { id: Date.now(), x: ball.endX, amount: ball.winAmount };
          setFloatTexts(prev => [...prev, newText]);
          setTimeout(() => setFloatTexts(prev => prev.filter(t => t.id !== newText.id)), 1000);
      }
      
      setSessionStats(prev => ({ ...prev, won: prev.won + ball.winAmount }));
      setHistory(prev => [ball.multiplier, ...prev].slice(0, 10));
      setLastHitBucketIndex(ball.bucketIndex);
      setTimeout(() => setLastHitBucketIndex(null), 150);

      if(ball.winAmount > bet * 10) {
           confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 }, colors: ['#fbbf24', '#ef4444'] });
      }
  }, [bet, updateCredits, onClientUpdate]); 


  // RENDER HELPERS
  const renderPins = () => {
      const pins = [];
      for(let r = 0; r < rows; r++) {
          const cols = r + 3; 
          for(let c = 0; c < cols; c++) {
              const xPos = c - (cols - 1) / 2;
              pins.push(
                  <div key={`${r}-${c}`} className="absolute w-2 h-2 bg-white rounded-full shadow-[0_0_5px_white] z-10"
                    style={{ top: `${(r + 1) * ROW_HEIGHT}px`, left: `calc(50% + ${xPos * PIN_SPACING}px)`, transform: 'translate(-50%, -50%)' }} />
              );
          }
      }
      return pins;
  };

  const currentMultipliers = MULTIPLIERS[rows][risk];
  const containerMinWidth = (rows + 2) * PIN_SPACING;
  const profit = sessionStats.won - sessionStats.invested;
  const remainingBalls = Math.max(0, batchInfo.total - batchInfo.finished);
  const totalBetAmount = bet * (parseInt(ballsToDrop) || 1);

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start justify-center w-full max-w-7xl mx-auto py-8">
      
      {/* --- CONTROLS --- */}
      <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 order-2 lg:order-1">
          
          <div className="bg-[#18181b] p-4 rounded-2xl border border-white/10 text-center shadow-lg">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Guthaben</div>
              <div className="text-3xl font-mono font-black text-yellow-400 flex items-center justify-center gap-2 drop-shadow-md">
                  {Math.floor(visualBalance).toLocaleString()} <CoinIcon size="w-6 h-6" />
              </div>
          </div>

          {/* LIVE STATS */}
          {(sessionStats.invested > 0 || activeBalls.length > 0) && (
              <div className="bg-[#18181b]/90 p-4 rounded-2xl border border-white/10 animate-in slide-in-from-left">
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 flex justify-between font-bold">
                      <span>Profit</span>
                      <span className="text-gray-500 font-normal">{remainingBalls} Bälle übrig</span>
                  </div>
                  <div className={`text-2xl font-mono font-black flex items-center gap-2 ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {profit >= 0 ? "+" : ""}{profit} <CoinIcon size="w-5 h-5" />
                  </div>
              </div>
          )}

          <div className="bg-[#18181b] p-6 rounded-2xl border border-white/10 shadow-xl flex flex-col gap-6">
              {/* Einsatz */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Einsatz</label>
                <div className="flex items-center bg-black/40 rounded-xl border border-white/10 mt-2 overflow-hidden px-1">
                    <input type="number" value={bet} onChange={e => setBet(Number(e.target.value))} disabled={isSpawning}
                        className="w-full bg-transparent p-3 font-mono font-bold text-white focus:outline-none" />
                    <div className="pr-3 text-yellow-500 opacity-50"><CoinIcon size="w-5 h-5" /></div>
                </div>
                <div className="flex gap-2 mt-2">
                    {[10, 100, 500, 1000].map(v => (
                        <button key={v} onClick={()=>setBet(v)} disabled={isSpawning} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs py-1.5 font-bold transition text-gray-300">{v}</button>
                    ))}
                </div>
              </div>

              {/* ANZAHL BÄLLE */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Bälle</label>
                <div className="flex items-center gap-2 mt-2">
                    {[1, 10, 50, 100].map(opt => (
                        <button key={opt} onClick={() => setBallsToDrop(opt)} disabled={isSpawning}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border border-transparent ${ballsToDrop === opt ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20' : 'bg-white/5 text-gray-400 hover:text-white border-white/5'}`}>
                            {opt}
                        </button>
                    ))}
                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Risiko</label>
                    <div className="flex flex-col gap-1 mt-2">
                        {RISK_OPTIONS.map(r => (
                            <button key={r} onClick={() => setRisk(r)} disabled={activeBalls.length > 0 || isSpawning} className={`py-1.5 px-2 rounded-lg text-xs font-bold uppercase transition border ${risk === r ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'}`}>{r}</button>
                        ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Reihen</label>
                    <div className="flex flex-col gap-1 mt-2">
                        {ROWS_OPTIONS.map(r => (
                            <button key={r} onClick={() => setRows(r)} disabled={activeBalls.length > 0 || isSpawning} className={`py-1.5 px-2 rounded-lg text-xs font-bold uppercase transition border ${rows === r ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'}`}>{r}</button>
                        ))}
                    </div>
                  </div>
              </div>

              <div className="w-full h-px bg-white/5 my-1"></div>

              <button onClick={handleBulkDrop} disabled={!isSpawning && (bet * ballsToDrop) > visualBalance}
                className={`w-full py-4 font-black text-xl rounded-xl shadow-lg transform active:scale-95 transition-all flex items-center justify-center gap-2 ${isSpawning ? "bg-red-600 hover:bg-red-500 text-white animate-pulse" : "bg-green-600 hover:bg-green-500 text-white shadow-green-900/20 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"}`}>
                  {isSpawning ? (
                      <>
                        <XCircle size={20} /> STOP ({batchInfo.spawned}/{batchInfo.total})
                      </>
                  ) : (
                      <>
                        <Play size={20} fill="currentColor" /> DROP {ballsToDrop}
                      </>
                  )}
              </button>
          </div>
      </div>

      {/* --- GAME BOARD --- */}
      <div className="flex-1 w-full flex justify-center bg-[#0a0a0f] rounded-3xl border border-white/10 overflow-hidden relative min-h-[600px] shadow-2xl order-1 lg:order-2">
          
          {/* Header Overlay */}
          <div className="absolute top-6 left-6 z-10 pointer-events-none">
              <h2 className="text-2xl font-black text-white/10 tracking-widest uppercase">Plinko</h2>
          </div>
          
          <div className="absolute top-6 right-6 z-10 flex gap-1 h-6 pointer-events-none">
              {history.map((h, i) => (
                  <div key={i} className={`px-2 rounded-md text-[10px] font-bold flex items-center shadow-lg ${getBucketColor(h).replace(/z-\d+/g,'')} text-white`}>{h}x</div>
              ))}
          </div>

          <div className="relative mt-16 transition-all duration-300 ease-in-out" style={{ height: `${(rows + 2) * ROW_HEIGHT + 50}px`, width: `${containerMinWidth}px` }} ref={gameBoardRef}>
             {renderPins()}
             {activeBalls.map((ball) => (<PlinkoBall key={ball.id} path={ball.path} onFinish={() => handleBallFinish(ball)} />))}
             {floatTexts.map(ft => (<FloatText key={ft.id} x={ft.x} amount={ft.amount} />))}
             
             {/* Multiplier Buckets */}
             <div className="absolute left-0 right-0 flex justify-center items-end" style={{ top: `${(rows + 1) * ROW_HEIGHT - 5}px`, height: '40px', zIndex: 20 }}>
                 {currentMultipliers.map((m, i) => {
                     const isHit = lastHitBucketIndex === i;
                     return (
                        <div key={i} className={`flex items-center justify-center rounded-md font-bold text-[10px] sm:text-xs transition-all duration-100 ${getBucketColor(m)} text-white shadow-lg ${isHit ? "translate-y-1 brightness-150 scale-110 z-30" : ""}`}
                            style={{ width: '30px', height: '36px', margin: '0 2px' }}>
                            {m}x
                        </div>
                     );
                 })}
             </div>
          </div>
      </div>
    </div>
  );
}