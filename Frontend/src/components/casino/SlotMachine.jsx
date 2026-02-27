import React, { useState, useEffect, useRef } from "react";
import CoinIcon from "../CoinIcon";
import confetti from "canvas-confetti";
import { X, Info, Volume2, VolumeX } from "lucide-react";
import { useOutletContext } from "react-router-dom";

const CACHE_BUST = "?v=1";

const SYMBOL_MAP = {
  "🍒": "/assets/slots/cherry.png" + CACHE_BUST,
  "🍋": "/assets/slots/lemon.png" + CACHE_BUST,
  "🍇": "/assets/slots/grape.png" + CACHE_BUST,
  "🔔": "/assets/slots/banana.png" + CACHE_BUST,
  "💎": "/assets/slots/diamond.png" + CACHE_BUST,
  "7️⃣": "/assets/slots/seven.png" + CACHE_BUST,
  "🃏": "/assets/slots/joker.png" + CACHE_BUST,   
  "🌟": "/assets/slots/star.png" + CACHE_BUST    
};

const PAYTABLE = [
  { char: "🃏", base: 15.0, label: "Wild" },
  { char: "7️⃣", base: 10.0, label: "Seven" },
  { char: "💎", base: 5.0, label: "Gem" },
  { char: "🔔", base: 2.0, label: "Bell" },
  { char: "🍇", base: 1.5, label: "Grape" },
  { char: "🍋", base: 1.2, label: "Lemon" },
  { char: "🍒", base: 1.0, label: "Cherry" },
];

const WIN_LINES = [
  { id: 0, color: "#ef4444", path: [[0,1], [1,1], [2,1], [3,1], [4,1]] },
  { id: 1, color: "#06b6d4", path: [[0,0], [1,0], [2,0], [3,0], [4,0]] },
  { id: 2, color: "#84cc16", path: [[0,2], [1,2], [2,2], [3,2], [4,2]] },
  { id: 3, color: "#eab308", path: [[0,0], [1,1], [2,2], [3,1], [4,0]] },
  { id: 4, color: "#d946ef", path: [[0,2], [1,1], [2,0], [3,1], [4,2]] },
  { id: 5, color: "#f97316", path: [[0,0], [1,1], [2,1], [3,1], [4,0]] },
  { id: 6, color: "#14b8a6", path: [[0,2], [1,1], [2,1], [3,1], [4,2]] },
  { id: 7, color: "#8b5cf6", path: [[0,1], [1,0], [2,0], [3,0], [4,1]] },
  { id: 8, color: "#ec4899", path: [[0,1], [1,2], [2,2], [3,2], [4,1]] },
  { id: 9, color: "#3b82f6", path: [[0,0], [1,1], [2,0], [3,1], [4,0]] },
  { id: 10, color: "#e26ca7", path: [[0,2], [1,1], [2,2], [3,1], [4,2]] },
];

const SYMBOLS = Object.keys(SYMBOL_MAP);
const SYMBOL_HEIGHT = 140; 
const REEL_HEIGHT = SYMBOL_HEIGHT * 3; 

const generateId = () => Math.random().toString(36).substr(2, 9);

function SlotReel({ index, targetSymbols, isSpinning, onStop, isTeaser, duration }) {
    const [strip, setStrip] = useState(
        ["7️⃣", "7️⃣", "7️⃣"].map(s => ({ id: generateId(), char: s }))
    ); 
    const scrollRef = useRef(null);
    const r = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

    useEffect(() => {
        if (isSpinning) {
            const currentItems = strip.slice(0, 3);
            const itemsNeeded = Math.ceil(duration / 40);
            const safeItemsCount = Math.max(20, itemsNeeded);

            const randoms = Array(safeItemsCount).fill(null).map(() => ({ id: generateId(), char: r() }));
            const targets = targetSymbols.map(char => ({ id: generateId(), char }));

            const newStrip = [...targets, ...randoms, ...currentItems];
            setStrip(newStrip);

            if (scrollRef.current) {
                const totalHeight = newStrip.length * SYMBOL_HEIGHT;
                const startY = -(totalHeight - REEL_HEIGHT);
                
                scrollRef.current.style.transition = 'none';
                scrollRef.current.style.transform = `translateY(${startY}px)`;
                scrollRef.current.style.filter = 'blur(4px)'; 

                requestAnimationFrame(() => {
                    setTimeout(() => {
                        if (scrollRef.current) {
                            const easing = 'cubic-bezier(0.45, 0.05, 0.55, 0.95)';
                            scrollRef.current.style.transition = `transform ${duration}ms ${easing}`;
                            scrollRef.current.style.transform = `translateY(0px)`;
                        }
                    }, 50);
                });

                setTimeout(() => {
                     if(scrollRef.current) {
                         scrollRef.current.style.filter = 'none';
                     }
                     onStop(index);
                }, duration + 50);
            }

        } else if (!isSpinning && strip.length > 3) {
            const cleanupTimer = setTimeout(() => {
                const finalItems = strip.slice(0, 3);
                setStrip(finalItems);
                if(scrollRef.current) {
                   scrollRef.current.style.transition = 'none';
                   scrollRef.current.style.transform = 'translateY(0px)'; 
                }
            }, 500); 
            return () => clearTimeout(cleanupTimer);
        }
    }, [isSpinning, targetSymbols, index, duration]); 

    return (
        <div className={`relative overflow-hidden w-full h-full bg-gray-900/80 rounded-lg border border-gray-700/50 shadow-inner ${isTeaser ? 'teaser-mode' : ''}`}>
            <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none"></div>
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none"></div>

            <div 
                ref={scrollRef}
                className="flex flex-col items-center w-full will-change-transform"
                style={{ height: strip.length * SYMBOL_HEIGHT }} 
            >
                {strip.map((item) => {
                    const isScatter = item.char === "🌟";

                    return (
                        <div 
                            key={item.id}
                            className="w-full flex items-center justify-center relative"
                            style={{ height: SYMBOL_HEIGHT }} 
                        >
                             {isScatter && (
                                <>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-24 h-24 bg-yellow-500/20 rounded-full blur-xl animate-pulse"></div>
                                    </div>
                                    <div className="absolute w-28 h-28 border border-yellow-400/30 rounded-full animate-[spin_4s_linear_infinite]"></div>
                                </>
                             )}

                             <img 
                                src={SYMBOL_MAP[item.char]} 
                                alt={item.char}
                                className={`
                                    object-contain z-10 transition-transform duration-300
                                    ${isScatter 
                                        ? "w-24 h-24 drop-shadow-[0_0_20px_rgba(250,204,21,0.9)] scale-110" 
                                        : "w-20 h-20 drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                                    }
                                `}
                                onError={(e) => { e.target.style.display='none'; }} 
                             />
                        </div>
                    );
                })}
            </div>
            <div className="absolute inset-0 pointer-events-none border-y border-gray-800/50" 
                 style={{ 
                     background: `linear-gradient(to bottom, 
                        transparent 33%, rgba(255,255,255,0.05) 33%, rgba(255,255,255,0.05) 34%, transparent 34%,
                        transparent 66%, rgba(255,255,255,0.05) 66%, rgba(255,255,255,0.05) 67%, transparent 67%
                     )` 
                 }}
            ></div>
        </div>
    );
}

function PaytableSideBar() {
    return (
        <div className="hidden xl:flex flex-col gap-4 bg-gray-900/80 p-4 rounded-xl border border-gray-700 w-64 shadow-xl">
             <h3 className="text-xl font-bold text-gray-200 text-center uppercase tracking-widest border-b border-gray-700 pb-2">Paytable</h3>
             
             <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-2 rounded-lg border border-purple-500/30">
                 <div className="flex items-center gap-2 mb-1">
                     <img src={SYMBOL_MAP["🌟"]} alt="Scatter" className="w-8 h-8"/>
                     <span className="font-bold text-yellow-400">FREISPIELE</span>
                 </div>
                 <div className="text-xs space-y-1 text-gray-300">
                     <div className="flex justify-between"><span>3 Scatters</span> <span className="text-white font-mono">10 Spins</span></div>
                     <div className="flex justify-between"><span>4 Scatters</span> <span className="text-white font-mono">15 Spins</span></div>
                     <div className="flex justify-between"><span>5 Scatters</span> <span className="text-white font-mono">20 Spins</span></div>
                 </div>
             </div>

             <div className="space-y-1">
                 <div className="grid grid-cols-4 text-[10px] text-gray-500 font-bold uppercase text-center pb-1">
                     <div className="text-left pl-2">Sym</div>
                     <div>5x</div>
                     <div>4x</div>
                     <div>3x</div>
                 </div>
                 {PAYTABLE.map((item) => (
                     <div key={item.char} className="grid grid-cols-4 items-center bg-gray-800/50 rounded p-1 hover:bg-gray-800 transition-colors">
                         <div className="flex justify-center w-8">
                            <img src={SYMBOL_MAP[item.char]} alt={item.label} className="w-6 h-6 object-contain"/>
                         </div>
                         <div className="text-center text-yellow-400 font-mono text-xs shadow-black drop-shadow-md">{(item.base * 7).toFixed(1)}x</div>
                         <div className="text-center text-gray-300 font-mono text-xs">{(item.base * 3).toFixed(1)}x</div>
                         <div className="text-center text-gray-500 font-mono text-xs">{item.base.toFixed(1)}x</div>
                     </div>
                 ))}
             </div>
             
             <div className="text-[10px] text-center text-gray-600 italic mt-2">
                 *Wild (Joker) ersetzt alles außer Scatter. Sticky in Freispielen.
             </div>
        </div>
    );
}

export default function SlotMachine({ updateCredits, currentCredits }) {
  const [finalReels, setFinalReels] = useState(Array(5).fill(["7️⃣", "7️⃣", "7️⃣"]));
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const [bet, setBet] = useState(10);
  const [msg, setMsg] = useState("");
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [isAuto, setIsAuto] = useState(false);
  const autoRef = useRef(false);
  const [showPaylines, setShowPaylines] = useState(false);

  
  const { isMuted } = useOutletContext();

  const [winLines, setWinLines] = useState([]); 
  const [visibleLineIndex, setVisibleLineIndex] = useState(null); 
  const [visibleStickyWilds, setVisibleStickyWilds] = useState([]);
  const [allReelsStopped, setAllReelsStopped] = useState(false); 

  const [teaserActive, setTeaserActive] = useState([false, false, false, false, false]);
  
  // BIG WIN STATE
  const [bigWinState, setBigWinState] = useState(null);

  const spinAudio = useRef(null);
  const freeSpinAudio = useRef(null);
  const slotPay1Audio = useRef(null);
  const slotPay2Audio = useRef(null);
  const slotPay3Audio = useRef(null);
  const plopAudios = useRef([]);

  useEffect(() => {
      spinAudio.current = new Audio("/assets/sounds/slots/spin.mp3");
      spinAudio.current.volume = 0.05;

      freeSpinAudio.current = new Audio("/assets/sounds/slots/freespins.mp3");
      freeSpinAudio.current.volume = 0.1;

      slotPay1Audio.current = new Audio("/assets/sounds/slots/slotspay1.mp3");
      slotPay1Audio.current.volume = 0.1;
      slotPay2Audio.current = new Audio("/assets/sounds/slots/slotspay2.mp3");
      slotPay2Audio.current.volume = 0.1;
      slotPay3Audio.current = new Audio("/assets/sounds/slots/slotspay3.mp3");
      slotPay3Audio.current.volume = 0.1;

      plopAudios.current = Array.from({ length: 9 }).map((_, i) => {
          const audio = new Audio(`/assets/sounds/slots/plopp${i + 1}.mp3`);
          audio.volume = 0.1;
          return audio;
      });
  }, []);

  // Sync Mute Status für alle Audio-Elemente
  useEffect(() => {
      const allAudios = [
          spinAudio.current, freeSpinAudio.current, 
          slotPay1Audio.current, slotPay2Audio.current, slotPay3Audio.current,
          ...plopAudios.current
      ];
      allAudios.forEach(audio => {
          if (audio) audio.muted = isMuted;
      });
  }, [isMuted]);

  useEffect(() => {
      if (allReelsStopped && visibleLineIndex !== null && plopAudios.current.length > 0) {
          const safeIndex = Math.min(visibleLineIndex, plopAudios.current.length - 1);
          const audio = plopAudios.current[safeIndex];
          
          if (audio) {
              audio.currentTime = 0;
              audio.play().catch(e => console.log("Sound error (Plopp):", e));
          }
      }
  }, [visibleLineIndex, allReelsStopped]);

  const [reelDurations, setReelDurations] = useState([1100, 1300, 1500, 1700, 1900]);

  const [showFsStart, setShowFsStart] = useState(false);
  const [showFsSummary, setShowFsSummary] = useState(null);
  const [fsTotalWin, setFsTotalWin] = useState(0);

  const gridContainerRef = useRef(null);
  const reelsGridRef = useRef(null);
  const spinResultData = useRef(null);
  const reelsStoppedCount = useRef(0);
  const lineAnimationTimeouts = useRef([]);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes spin-teaser {
        0% { box-shadow: inset 0 0 10px yellow; border-color: yellow; }
        100% { box-shadow: inset 0 0 30px orange; border-color: #fbbf24; }
      }
      .teaser-mode {
          animation: spin-teaser 0.4s infinite alternate !important;
          z-index: 20;
          border: 2px solid yellow !important;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const toggleAuto = () => {
    const newState = !isAuto;
    setIsAuto(newState);
    autoRef.current = newState;
    if (newState && !isGameActive) spin();
  };

  const PaylineMiniMap = ({ pattern, label, colorClass }) => {
    return (
        <div className="bg-black/30 border border-white/5 p-2 rounded-xl flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{label}</span>
            <div className="grid grid-cols-5 gap-1 w-full max-w-[120px]">
                {[0, 1, 2].map(row => (
                    [0, 1, 2, 3, 4].map(col => {
                        const isLine = pattern[col] === row;
                        return (
                            <div 
                                key={`${row}-${col}`} 
                                className={`aspect-square rounded-[3px] ${isLine ? colorClass : 'bg-white/5'}`}
                            />
                        );
                    })
                ))}
            </div>
        </div>
    );
  };

  const handleReelStop = (index) => {
      reelsStoppedCount.current += 1;

      if (spinResultData.current) {
          let scatterCountSoFar = 0;
          for(let i=0; i<=index; i++) {
               const col = spinResultData.current.reels[i];
               scatterCountSoFar += col.filter(s => s === "🌟").length;
          }
          if (scatterCountSoFar >= 2 && index < 4) {
             setTeaserActive(old => old.map((isActive, i) => (i > index) ? true : isActive));
          }
      }
      
      setTeaserActive(old => {
          const n = [...old];
          n[index] = false;
          return n;
      });
      
      if (reelsStoppedCount.current === 5) {
          setTimeout(() => {
              revealResults();
          }, 1000);
      }
  };

  const spin = async () => {
    const currentBet = typeof bet === 'number' ? bet : 10;
    if (freeSpinsLeft === 0 && currentBet > currentCredits) {
      setMsg("Zu wenig Credits!");
      setIsAuto(false); autoRef.current = false; return;
    }

    // Audio Unlock
    plopAudios.current.forEach(audio => audio.load());
    if (slotPay1Audio.current) slotPay1Audio.current.load();
    if (slotPay2Audio.current) slotPay2Audio.current.load();
    if (slotPay3Audio.current) slotPay3Audio.current.load();

    if (spinAudio.current) {
        spinAudio.current.currentTime = 0;
        spinAudio.current.play().catch(e => console.log("Spin Sound Error:", e));
    }

    setIsGameActive(true);
    setIsSpinning(true); 
    setMsg(""); 
    setBigWinState(null);
    
    if (freeSpinsLeft > 0) {
        setFreeSpinsLeft(prev => Math.max(0, prev - 1));
    }
    
    setWinLines([]);
    setVisibleLineIndex(null);
    setAllReelsStopped(false); 
    setTeaserActive([false, false, false, false, false]); 
    
    lineAnimationTimeouts.current.forEach(clearTimeout);
    lineAnimationTimeouts.current = [];

    if (freeSpinsLeft === 0 && !isAuto) {
         setVisibleStickyWilds([]);
    }
    
    spinResultData.current = null;
    reelsStoppedCount.current = 0;
    setReelDurations([1100, 1300, 1500, 1700, 1900]); 

    try {
      const res = await fetch("/api/casino/play/slots", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bet: currentBet }), 
          credentials: "include"
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      spinResultData.current = data;
      setFinalReels(data.reels); 

    } catch (e) {
      console.error(e); setMsg("Fehler"); setIsGameActive(false); setIsSpinning(false); setIsAuto(false); autoRef.current = false;
    }
  };

  const revealResults = () => {
      const data = spinResultData.current;
      if (!data) return;

      setIsSpinning(false); 
      setAllReelsStopped(true); 

      if (data.stickyWilds && data.stickyWilds.length > 0) {
          setVisibleStickyWilds(data.stickyWilds);
      }
      
      setFreeSpinsLeft(data.freeSpinsLeft || 0);
      updateCredits();

      const currentBetAmt = typeof bet === 'number' ? bet : 10;
      const hasWin = data.winAmount > 0;
      const hasFreeSpins = data.freeSpinsLeft > 0;
      const isAutoActive = autoRef.current;
      const winMultiplier = hasWin ? (data.winAmount / currentBetAmt) : 0;

      // Status Text Setzen
      let msgText = "";
      if (data.newFreeSpins > 0 && !data.isFreeSpinTrigger) {
          msgText = `+${data.newFreeSpins} SPINS! GEWINN: ${data.winAmount}`;
          confetti({ particleCount: 50, spread: 40, origin: { y: 0.8 }, colors: ['#FFFF00'] });
      } else {
          msgText = hasWin ? `GEWINN: ${data.winAmount}` : "Kein Gewinn";
      }
      setMsg(msgText);

      // Freispiel-Total-Win erhöhen (auch schon beim Auslösen, falls es direkt einen Gewinn gab)
      if (freeSpinsLeft > 0 || hasFreeSpins) {
          setFsTotalWin(prev => prev + data.winAmount);
      }

      // --- ZEIT-BERECHNUNG FÜR DIE CHRONOLOGISCHE ABFOLGE ---
      const linesDuration = (hasWin && data.winningLines) ? (data.winningLines.length * 1000) : 0;
      
      let bigWinDuration = 0;
      // Entferne das !data.isFreeSpinTrigger, damit Big Win AUCH beim Freispiel-Start passieren kann
      if (hasWin && winMultiplier >= 10) {
          bigWinDuration = 3000;
      }

      let fsTriggerDuration = 0;
      if (data.isFreeSpinTrigger) {
          fsTriggerDuration = 3500; // 3.5 Sekunden für die Freispiel-Animation
      }

      // PHASE 1: LINIEN ZEICHNEN (Startet sofort)
      if (hasWin && data.winningLines) {
          setWinLines(data.winningLines);
          setVisibleLineIndex(0); // Löst useEffect für ersten Plopp-Sound aus

          if (data.winningLines.length > 1) {
              data.winningLines.forEach((_, idx) => {
                  if (idx === 0) return; 
                  const t = setTimeout(() => {
                      setVisibleLineIndex(idx);
                  }, idx * 1000);
                  lineAnimationTimeouts.current.push(t);
              });
          }
      }

      // PHASE 2: BIG WIN FENSTER (Startet exakt nach den Linien)
      if (bigWinDuration > 0) {
          const tBigWin = setTimeout(() => {
              if (winMultiplier >= 50) {
                  setBigWinState({ text: "ABSURD WIN!", amount: data.winAmount });
                  if (slotPay3Audio.current) { slotPay3Audio.current.currentTime = 0; slotPay3Audio.current.play().catch(e=>console.log(e)); }
              } else if (winMultiplier >= 20) {
                  setBigWinState({ text: "MASSIVE WIN!", amount: data.winAmount });
                  if (slotPay2Audio.current) { slotPay2Audio.current.currentTime = 0; slotPay2Audio.current.play().catch(e=>console.log(e)); }
              } else {
                  setBigWinState({ text: "BIG WIN!", amount: data.winAmount });
                  if (slotPay1Audio.current) { slotPay1Audio.current.currentTime = 0; slotPay1Audio.current.play().catch(e=>console.log(e)); }
              }
              confetti({ particleCount: 200, spread: 90, origin: { y: 0.7 } });

              const tHide = setTimeout(() => setBigWinState(null), 3000);
              lineAnimationTimeouts.current.push(tHide);
          }, linesDuration);
          lineAnimationTimeouts.current.push(tBigWin);
      }

      // PHASE 3: FREISPIEL TRIGGER OVERLAY (Startet nach Linien UND Big Win)
      if (data.isFreeSpinTrigger) {
          const tFs = setTimeout(() => {
              // Reset Total Win beim NEUEN Auslösen von Freispielen
              setFsTotalWin(data.winAmount); // Falls der Trigger-Spin schon was zahlt, hier eintragen

              if(freeSpinAudio.current) {
                  freeSpinAudio.current.currentTime = 0;
                  freeSpinAudio.current.play().catch(e => console.log(e));
              }

              setShowFsStart(true);
              confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
              
              const tHideFs = setTimeout(() => setShowFsStart(false), 3000);
              lineAnimationTimeouts.current.push(tHideFs);
          }, linesDuration + bigWinDuration);
          lineAnimationTimeouts.current.push(tFs);
      }

      // PHASE 4: NÄCHSTER SCHRITT (Zusammenfassung, Autospin oder Spiel-Ende)
      const totalAnimationTime = linesDuration + bigWinDuration + fsTriggerDuration;
      
      if (data.freeSpinsLeft === 0 && fsTotalWin > 0 && !data.isFreeSpinTrigger) {
          // FREISPIELE ZUENDE GEHEN (Zusammenfassung anzeigen)
          const delayUntilSummary = totalAnimationTime + 1000; // 1 Sekunde Puffer
          
          const tSummary = setTimeout(() => {
              const total = fsTotalWin + data.winAmount;
              setShowFsSummary({ win: total });
              confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 } });
              
              const tHideSummary = setTimeout(() => {
                  setShowFsSummary(null);
                  setFsTotalWin(0);
                  setVisibleStickyWilds([]); 
                  setIsGameActive(false);
                  autoRef.current = false; 
              }, 5000);
              lineAnimationTimeouts.current.push(tHideSummary);
          }, delayUntilSummary);
          lineAnimationTimeouts.current.push(tSummary);

      } else {
          // NORMALES SPIEL ODER MITTEN IN DEN FREISPIELEN
          if (!hasWin && !data.isFreeSpinTrigger) {
              // Gar nichts passiert -> 2 Sekunden Pause, dann evtl. weiterdrehen
              if (isAutoActive || hasFreeSpins) {
                  const tNext = setTimeout(() => spin(), 1500); 
                  lineAnimationTimeouts.current.push(tNext);
              } else {
                  setIsGameActive(false);
              }
          } else {
              // Gewinn oder Trigger passiert -> Warten bis alle Phasen durch sind
              const waitTime = totalAnimationTime + 1000; // 1 Sekunde Extra-Puffer am Ende
              
              const tNext = setTimeout(() => {
                  if (autoRef.current || data.freeSpinsLeft > 0 || data.isFreeSpinTrigger) {
                      spin();
                  } else {
                      setIsGameActive(false);
                  }
              }, waitTime);
              lineAnimationTimeouts.current.push(tNext);
          }
      }
  };

  const renderActiveLine = () => {
      if (!allReelsStopped || visibleLineIndex === null || winLines.length === 0 || !reelsGridRef.current) return null;
      
      const activeWin = winLines[visibleLineIndex]; 
      if(!activeWin) return null; 

      const lineDef = WIN_LINES.find(l => l.id === activeWin.index);
      if(!lineDef) return null;

      const reelElements = Array.from(reelsGridRef.current.children);
      if (reelElements.length < 5) return null;

      const activePathPoints = lineDef.path.slice(0, activeWin.count);
      
      const pointsStr = activePathPoints.map(([col, row]) => {
          const reelEl = reelElements[col];
          const x = reelEl.offsetLeft + (reelEl.offsetWidth / 2);
          const y = (row * SYMBOL_HEIGHT) + (SYMBOL_HEIGHT / 2);
          return `${x},${y}`;
      }).join(" ");

      return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-50 overflow-visible">
               <polyline 
                   points={pointsStr} 
                   fill="none" 
                   stroke={lineDef.color} 
                   strokeWidth="6" 
                   strokeLinecap="round" 
                   strokeLinejoin="round" 
                   className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
               />
               {activePathPoints.map(([col, row], i) => {
                   const reelEl = reelElements[col];
                   const x = reelEl.offsetLeft + (reelEl.offsetWidth / 2);
                   const y = (row * SYMBOL_HEIGHT) + (SYMBOL_HEIGHT / 2);
                   return (
                       <circle key={i} cx={x} cy={y} r="5" fill="white" stroke={lineDef.color} strokeWidth="2" />
                   );
               })}
          </svg>
      );
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col xl:flex-row items-start gap-8 py-8 select-none relative">
      
      {/* OVERLAYS */}
      {showFsStart && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 rounded-2xl animate-in fade-in zoom-in duration-300">
              <div className="text-center">
                  <h1 className="text-6xl md:text-8xl font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)] animate-bounce">FREISPIELE!</h1>
              </div>
          </div>
      )}
      
      {showFsSummary && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 rounded-2xl animate-in fade-in zoom-in duration-300">
              <div className="text-center p-10 border-4 border-yellow-500 rounded-xl bg-gray-900 shadow-[0_0_50px_rgba(250,204,21,0.5)]">
                  <h2 className="text-4xl text-gray-300 font-bold mb-4">GESAMTGEWINN</h2>
                  <div className="text-6xl md:text-8xl font-black text-green-400 drop-shadow-md my-6">
                      {showFsSummary.win} <CoinIcon className="inline w-12 h-12"/>
                  </div>
              </div>
          </div>
      )}

      {/* BIG WIN OVERLAY */}
      {bigWinState && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 rounded-2xl animate-in fade-in duration-300">
              <div className="text-center p-8 animate-in zoom-in spin-in-2 duration-500">
                  <h1 className="text-6xl md:text-8xl font-black text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,1)] animate-pulse">
                      {bigWinState.text}
                  </h1>
                  <div className="text-5xl md:text-7xl font-bold text-white mt-4 drop-shadow-lg">
                      +{bigWinState.amount} <CoinIcon className="inline w-10 h-10"/>
                  </div>
              </div>
          </div>
      )}

      {/* Paytable Sidebar */}
      <div className="hidden xl:flex flex-col w-64 shrink-0">
          <PaytableSideBar />
          
          <button 
              onClick={() => setShowPaylines(true)}
              className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white py-2.5 rounded-xl text-xs font-bold border border-white/10 transition-colors flex items-center justify-center gap-2"
          >
              <Info size={16} /> Gewinnlinien ansehen
          </button>
      </div>

      {/* RECHTS: Das eigentliche Spiel */}
      <div className="flex-1 flex flex-col items-center w-full relative">
        
        {/* HEADER */}
        <div className="text-center space-y-2 mb-4 relative w-full flex flex-col items-center">
            
            <h2 className="text-4xl md:text-5xl font-black italic bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent drop-shadow-lg">Waifu Fruits</h2>
            <div className="flex justify-center gap-4 text-xs font-mono text-gray-400">
                <span className="text-yellow-400 font-bold">{freeSpinsLeft > 0 ? `${freeSpinsLeft} FREE SPINS` : "STANDARD MODE"}</span>
            </div>
        </div>

        {/* SLOT MACHINE BODY */}
        <div className="relative bg-gray-900 p-6 rounded-2xl border-4 border-purple-900/50 shadow-[0_0_100px_rgba(168,85,247,0.2)] w-full max-w-4xl">
            
            <div 
                className="relative rounded-xl overflow-hidden" 
                ref={gridContainerRef}
                style={{ 
                    height: REEL_HEIGHT, 
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
                }}
            >
                
                {renderActiveLine()}
                
                <div className="absolute inset-0 z-20 pointer-events-none grid grid-cols-5 grid-rows-3 gap-4 px-2"> 
                    {visibleStickyWilds.map((s) => {
                        return (
                            <div 
                                key={`sticky-${s.col}-${s.row}`}
                                className="relative w-full h-full flex items-center justify-center"
                                style={{ 
                                    gridColumnStart: s.col + 1, 
                                    gridRowStart: s.row + 1
                                }}
                            >
                                <div className="relative w-24 h-24 flex items-center justify-center animate-pulse">
                                    <div className="absolute inset-0 bg-yellow-500/20 rounded-full blur-xl"></div>
                                    <img src={SYMBOL_MAP["🃏"]} alt="Wild" className="w-20 h-20 object-contain z-10 drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]"/>
                                    <div className="absolute inset-0 border-2 border-yellow-400 rounded-full shadow-[0_0_15px_gold] opacity-80"></div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div 
                    ref={reelsGridRef} 
                    className="grid grid-cols-5 gap-4 h-full px-2"
                >
                    {[0, 1, 2, 3, 4].map((i) => (
                        <SlotReel 
                            key={i} 
                            index={i}
                            targetSymbols={finalReels[i]} 
                            isSpinning={isSpinning}
                            onStop={handleReelStop}
                            isTeaser={teaserActive[i]} 
                            duration={reelDurations[i]} 
                        />
                    ))}
                </div>
            </div>

            {/* STATUS BAR */}
            <div className="mt-4 flex justify-between items-center bg-black/40 p-2 rounded border border-white/10">
                <div className="text-gray-400 text-xs uppercase flex items-center gap-2">
                    Credit: <span className="text-white font-mono text-base">{currentCredits}</span> <CoinIcon className="w-4 h-4 text-yellow-500"/>
                </div>
                <div className="text-gray-400 text-xs uppercase">Last Win: <span className="text-green-400 font-mono text-base">{msg.includes("GEWINN") ? msg.split(":")[1] : "0"}</span></div>
            </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap justify-center items-center gap-4 w-full max-w-2xl mt-8">
            <div className="flex items-center bg-gray-800 rounded-full p-1 border border-gray-600">
                <button disabled={isGameActive || isAuto || freeSpinsLeft > 0} onClick={() => setBet(Math.max(10, (typeof bet === 'number' ? bet : 10) - 10))} className="w-10 h-10 rounded-full hover:bg-gray-700 text-white disabled:opacity-50 font-bold">-</button>
                <input 
                    type="number"
                    value={bet}
                    onChange={(e) => setBet(parseInt(e.target.value) || 0)}
                    disabled={isGameActive || isAuto || freeSpinsLeft > 0}
                    className="w-20 bg-transparent text-center font-mono font-bold text-yellow-400 focus:outline-none"
                />
                <button disabled={isGameActive || isAuto || freeSpinsLeft > 0} onClick={() => setBet((typeof bet === 'number' ? bet : 10) + 10)} className="w-10 h-10 rounded-full hover:bg-gray-700 text-white disabled:opacity-50 font-bold">+</button>
            </div>

            <button 
                onClick={isAuto ? toggleAuto : spin}
                disabled={(isGameActive && !isAuto) || isSpinning} 
                className={`
                    relative group overflow-hidden rounded-full w-24 h-24 border-4 transition-all transform active:scale-95 shadow-[0_0_30px_rgba(0,0,0,0.5)]
                    ${isAuto 
                        ? 'border-red-500 bg-red-900/80' 
                        : 'border-green-500 bg-gradient-to-b from-green-600 to-green-800 hover:brightness-110'}
                    disabled:opacity-80 disabled:cursor-not-allowed
                `}
            >
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                    {isAuto ? (
                        <span className="font-bold text-white text-sm">STOP<br/>AUTO</span>
                    ) : (
                        <>
                            <span className="font-bold text-white text-lg drop-shadow-md">SPIN</span>
                            {freeSpinsLeft > 0 && <span className="text-[10px] text-yellow-300 animate-pulse">FREE!</span>}
                        </>
                    )}
                </div>
            </button>

            <button 
                onClick={toggleAuto}
                disabled={freeSpinsLeft > 0}
                className={`
                    px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all
                    ${isAuto ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_15px_purple]' : 'bg-gray-800 border-gray-600 text-gray-500 hover:bg-gray-700 hover:text-gray-300'}
                `}
            >
                Auto {isAuto ? "ON" : "OFF"}
            </button>
        </div>
        
        {/* MESSAGE */}
        <div className="h-10 text-center grid place-items-center mt-2">
            {msg && (
                <div className={`text-xl md:text-2xl font-black uppercase tracking-widest animate-bounce ${msg.includes("GEWINN") || msg.includes("FREISPIELE") ? "text-yellow-400 drop-shadow-[0_0_10px_orange]" : "text-gray-400"}`}>
                    {msg}
                </div>
            )}
        </div>
      </div>
      
      {/* PAYLINES MODAL */}
            {showPaylines && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#18181b] border border-white/10 p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-2xl relative">
                        <button 
                            onClick={() => setShowPaylines(false)}
                            className="absolute top-4 right-4 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-all"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl md:text-2xl font-black mb-6 text-white text-center">
                            Aktive Gewinnlinien
                        </h3>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <PaylineMiniMap pattern={[1,1,1,1,1]} label="Linie 1" colorClass="bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                            <PaylineMiniMap pattern={[0,0,0,0,0]} label="Linie 2" colorClass="bg-yellow-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                            <PaylineMiniMap pattern={[2,2,2,2,2]} label="Linie 3" colorClass="bg-yellow-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                            <PaylineMiniMap pattern={[0,1,2,1,0]} label="Linie 4" colorClass="bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
                            <PaylineMiniMap pattern={[2,1,0,1,2]} label="Linie 5" colorClass="bg-purple-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" />
                            <PaylineMiniMap pattern={[0,1,0,1,0]} label="Linie 6" colorClass="bg-pink-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                            <PaylineMiniMap pattern={[2,1,2,1,2]} label="Linie 7" colorClass="bg-pink-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                            <PaylineMiniMap pattern={[1,2,2,2,1]} label="Linie 8" colorClass="bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                            <PaylineMiniMap pattern={[1,0,0,0,1]} label="Linie 9" colorClass="bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                            <PaylineMiniMap pattern={[0,1,1,1,0]} label="Linie 10" colorClass="bg-blue-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                            <PaylineMiniMap pattern={[2,1,1,1,2]} label="Linie 11" colorClass="bg-blue-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
                        </div>
                        
                        <div className="mt-8 text-xs text-center text-white/40 bg-black/30 p-3 rounded-xl border border-white/5">
                            Gewinne werden von links nach rechts gewertet. Es müssen mindestens 3 gleiche Symbole ununterbrochen auf einer Linie liegen.
                        </div>
                    </div>
                </div>
            )}
    </div>
  );
}