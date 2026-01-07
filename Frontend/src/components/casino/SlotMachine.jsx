import React, { useState, useEffect, useRef } from "react";

const SYMBOLS = ["🍒", "🍋", "🍇", "💎", "7️⃣"];

// DEINE WERTE (Manuell anpassbar):
const PAYTABLE = [
  { symbol: "7️⃣", multiplier: "25x", desc: "Jackpot" },
  { symbol: "💎", multiplier: "10x", desc: "Big Win" },
  { symbol: "🍇", multiplier: "5x", desc: "Solid" },
  { symbol: "🍋", multiplier: "2x", desc: "Small" },
  { symbol: "🍒", multiplier: "1.5x", desc: "Mini" },
];

export default function SlotMachine({ updateCredits, currentCredits }) {
  // Initiale Walzen
  const [reels, setReels] = useState([
    ["7️⃣", "7️⃣", "7️⃣"], 
    ["7️⃣", "7️⃣", "7️⃣"], 
    ["7️⃣", "7️⃣", "7️⃣"]
  ]);
  
  // Spinning State pro Walze (col 0, col 1, col 2)
  const [spinning, setSpinning] = useState([false, false, false]);
  const [isGameActive, setIsGameActive] = useState(false); // Globaler Lock für Button
  
  const [bet, setBet] = useState(10);
  const [msg, setMsg] = useState("");
  
  const spinningRef = useRef([false, false, false]);
  const resultRef = useRef(null);

  const r = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  useEffect(() => {
    const iv = setInterval(() => {
      setReels(prevReels => {
        const nextGrid = prevReels.map(col => [...col]);
        spinningRef.current.forEach((isSpinning, colIndex) => {
          if (isSpinning) {
            nextGrid[colIndex] = [r(), r(), r()];
          } else if (resultRef.current) {
            nextGrid[colIndex] = resultRef.current[colIndex];
          }
        });
        return nextGrid;
      });
    }, 50);
    return () => clearInterval(iv);
  }, []);

  const spin = async () => {
    if (bet > currentCredits) { setMsg("Nicht genug Credits!"); return; }
    
    setIsGameActive(true);
    setMsg("");
    resultRef.current = null;

    setSpinning([true, true, true]);
    spinningRef.current = [true, true, true];

    try {
      const res = await fetch("/api/casino/play/slots", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bet }), credentials: "include"
      });
      const data = await res.json();
      
      resultRef.current = data.reels; 

      setTimeout(() => { setSpinning([false, true, true]); spinningRef.current = [false, true, true]; }, 1000);
      setTimeout(() => { setSpinning([false, false, true]); spinningRef.current = [false, false, true]; }, 1600);
      setTimeout(() => {
        setSpinning([false, false, false]);
        spinningRef.current = [false, false, false];
        
        if (data.winAmount > 0) setMsg(`BIG WIN: ${data.winAmount} CR! 🎉`);
        else setMsg("Kein Gewinn.");
        
        updateCredits();
        setIsGameActive(false);
      }, 2400);

    } catch (e) {
      console.error(e);
      setSpinning([false, false, false]);
      spinningRef.current = [false, false, false];
      setIsGameActive(false);
    }
  };

  return (
    // Grid-Layout: 
    // Desktop (xl): 3 Spalten [1fr auto 1fr] -> Links Paytable, Mitte Spiel, Rechts Platzhalter (für perfekte Zentrierung)
    // Mobile: 1 Spalte -> Spiel oben, Tabelle unten
    <div className="w-full max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-8 items-start py-4">
      
      {/* === LINKES PANEL (Paytable) === */}
      {/* order-2 auf Mobile (unten), order-1 auf Desktop (links) */}
      <div className="order-2 xl:order-1 flex justify-center xl:justify-end">
        <div className="bg-gray-900/80 p-5 rounded-xl border border-gray-700 shadow-lg w-full max-w-xs backdrop-blur-sm">
            <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-700 pb-2 text-center uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                <span>🏆</span> Paytable
            </h3>
            <div className="space-y-2">
                {PAYTABLE.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-800/50 px-3 py-2 rounded border border-gray-700/50 hover:bg-gray-700/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl drop-shadow-md">{item.symbol}</span>
                            <span className="text-xs text-gray-400 hidden sm:inline-block">{item.desc}</span>
                        </div>
                        <span className="font-mono text-green-400 font-bold text-lg">{item.multiplier}</span>
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-4 text-center leading-tight">
                Gewinn bei 3 gleichen Symbolen.<br/>Diagonal oder Horizontal.
            </p>
        </div>
      </div>

      {/* === MITTLERES PANEL (Das Spiel) === */}
      {/* order-1 auf Mobile (oben), order-2 auf Desktop (mitte) */}
      <div className="order-1 xl:order-2 flex flex-col items-center gap-8 z-10">
        
        <div className="text-center">
            <h2 className="text-2xl font-bold bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent">Fruit Slots</h2>
            <p className="text-xs text-gray-500 mt-1">3 Reels • 5 Paylines</p>
        </div>
      
        <div className="bg-gray-800 p-4 rounded-xl border-4 border-yellow-600 shadow-[0_0_60px_rgba(202,138,4,0.25)] relative">
            {/* Deko Lights Links */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_red]"/>
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse delay-75 shadow-[0_0_5px_yellow]"/>
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse delay-150 shadow-[0_0_5px_green]"/>
            </div>
            {/* Deko Lights Rechts */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_green]"/>
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse delay-75 shadow-[0_0_5px_yellow]"/>
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse delay-150 shadow-[0_0_5px_red]"/>
            </div>

            <div className="flex gap-2 bg-black p-2 rounded border border-gray-600 overflow-hidden">
            {reels.map((col, colIndex) => (
                <div key={colIndex} className="flex flex-col gap-2">
                {col.map((symbol, rowIndex) => (
                    <div key={rowIndex} className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-b from-gray-100 to-gray-300 text-5xl sm:text-6xl flex items-center justify-center rounded shadow-inner relative overflow-hidden border border-gray-400">
                        <div className={`${spinning[colIndex] ? "animate-spin-custom blur-[2px] opacity-80" : ""} w-full h-full flex items-center justify-center transition-all`}>
                        {symbol}
                        </div>
                        {/* Glanz-Effekt Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent pointer-events-none"></div>
                    </div>
                ))}
                </div>
            ))}
            </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 bg-gray-800 p-3 sm:p-4 rounded-full border border-gray-600 shadow-xl w-full max-w-sm justify-center">
            <div className="flex flex-col items-center border-r border-gray-600 pr-4">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider">Einsatz</label>
                <input 
                type="number" 
                value={bet} 
                onChange={e => setBet(Number(e.target.value))}
                disabled={isGameActive}
                className="bg-transparent text-white font-mono text-xl w-16 text-center focus:outline-none focus:text-yellow-400 transition-colors"
                />
            </div>
            <button 
            onClick={spin} 
            disabled={isGameActive}
            className={`bg-gradient-to-b from-yellow-400 to-yellow-600 text-black font-extrabold px-8 py-3 rounded-full shadow-[0_4px_0_rgb(161,98,7)] transition-all uppercase tracking-wider min-w-[140px] flex justify-center ${isGameActive ? 'opacity-70 cursor-not-allowed' : 'hover:from-yellow-300 hover:to-yellow-500 active:translate-y-1 active:shadow-none hover:shadow-[0_0_20px_rgba(234,179,8,0.4)]'}`}
            >
            {isGameActive ? (
                <span className="animate-pulse">...</span>
            ) : (
                <span className="flex items-center gap-2">SPIN 🎰</span>
            )}
            </button>
        </div>

        {/* Message Area */}
        <div className="h-8 flex items-center justify-center">
            {msg && !isGameActive && (
                <div className={`text-xl font-bold animate-in zoom-in slide-in-from-bottom-2 duration-300 ${msg.includes("WIN") ? "text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]" : "text-gray-400"}`}>
                    {msg}
                </div>
            )}
        </div>
      </div>

      {/* === RECHTES PANEL (Platzhalter für Balance) === */}
      {/* Nur sichtbar auf XL Screens, damit Mitte zentriert bleibt */}
      <div className="hidden xl:block xl:order-3">
         {/* Hier könnte später noch was hin (z.B. Gewinn-Historie), 
             aktuell leer, damit Grid symmetrisch ist. */}
      </div>

    </div>
  );
}