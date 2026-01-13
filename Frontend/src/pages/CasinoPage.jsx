// src/pages/CasinoPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";

// Game Components
import SlotMachine from "../components/casino/SlotMachine";
import Blackjack from "../components/casino/Blackjack";
import HighLow from "../components/casino/HighLow";
import Mines from "../components/casino/Mines";
import GuessNumber from "../components/casino/GuessNumber";
import CaseOpening from "../components/casino/CaseOpening";

const GAMES = [
  { id: "slots", name: "🎰 Lucky Slots", desc: "3 Walzen, 3 Reihen, 5 Gewinnlinien!" },
  { id: "blackjack", name: "🃏 Blackjack", desc: "Schlage den Dealer auf 21." },
  { id: "highlow", name: "📈 High / Low", desc: "Höher oder tiefer als 50?" },
  { id: "mines", name: "💣 Mines", desc: "Finde die Diamanten, meide Bomben." },
  { id: "guess", name: "🔢 Guess The Number", desc: "Errate die Zahl (1-100) in 5 Versuchen." },
  { id: "case", name: "📦 Mystery Case", desc: "CS-Style Case Opening." },
];

function formatCooldown(ms) {
  if (ms <= 0) return null;
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export default function CasinoPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [credits, setCredits] = useState(0);
  const [lastDaily, setLastDaily] = useState(0);
  const [activeGame, setActiveGame] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  
  // Zustände für Transfer
  const [userList, setUserList] = useState([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferStatus, setTransferStatus] = useState(null);
  
  // NEU: Leaderboard State
  const [leaderboard, setLeaderboard] = useState([]);
  const [userDataLoading, setUserDataLoading] = useState(true);

  // Userliste (für Dropdown)
  const fetchUserList = async () => {
    try {
        const res = await fetch("/api/casino/users", { credentials: "include" });
        if(res.ok) setUserList(await res.json());
    } catch(e) { console.error(e); }
  };

  // NEU: Leaderboard laden
  const fetchLeaderboard = async () => {
      try {
          const res = await fetch("/api/casino/leaderboard", { credentials: "include" });
          if(res.ok) setLeaderboard(await res.json());
      } catch(e) { console.error(e); }
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/casino/user", { credentials: "include" });
      const data = await res.json();
      setCredits(data.credits || 0);
      setLastDaily(data.lastDaily || 0);

      if (data.lastDaily) {
        const diff = (data.lastDaily + 24 * 60 * 60 * 1000) - Date.now();
        setCooldownTime(Math.max(0, diff));
      } else {
        setCooldownTime(0);
      }
      
      // Daten aktualisieren
      fetchUserList();
      fetchLeaderboard(); // Auch Leaderboard neu laden

    } catch (e) { 
        console.error(e); 
    } finally {
        setUserDataLoading(false);
    }
  };

  useEffect(() => { refreshUser(); }, [user]);

  useEffect(() => {
    const iv = setInterval(() => {
        if (lastDaily > 0) {
            const diff = (lastDaily + 24*60*60*1000) - Date.now();
            setCooldownTime(Math.max(0, diff));
        } else {
            setCooldownTime(0);
        }
    }, 1000);
    return () => clearInterval(iv);
  }, [lastDaily]);

  const claimDaily = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/casino/daily", { method: "POST", credentials: "include" });
      if (res.ok) await refreshUser();
    } catch (e) {}
    setLoading(false);
  };

  const handleTransfer = async (e) => {
      e.preventDefault();
      setTransferStatus(null);
      if(!transferTarget || !transferAmount) return;
      
      try {
        const res = await fetch("/api/casino/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId: transferTarget, amount: transferAmount }),
            credentials: "include"
        });
        const data = await res.json();
        
        if(res.ok) {
            setTransferStatus({ type: 'success', msg: data.message });
            setCredits(data.credits);
            setTransferAmount("");
            fetchLeaderboard(); // Nach Transfer könnte sich das Ranking ändern
        } else {
            setTransferStatus({ type: 'error', msg: data.error || "Fehler beim Senden" });
        }
      } catch(e) {
          setTransferStatus({ type: 'error', msg: "Netzwerkfehler" });
      }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center mt-20 text-white">
        <h1 className="text-4xl font-bold mb-4">🎰 VNM Casino</h1>
        <button onClick={() => login()} className="bg-[#9146FF] px-6 py-3 rounded-xl font-bold">
          Login mit Twitch
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 text-white pb-20">
      <header className="flex flex-col md:flex-row justify-between items-center bg-gray-900/80 p-6 rounded-2xl mb-8 border border-white/10 shadow-lg">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">VALENTINS CASINO</h1>
          <p className="text-gray-400 text-sm">Vermehre deine Credits! (Oder verliere alle)</p>
        </div>
        <div className="flex items-center gap-6 mt-4 md:mt-0">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Kontostand</p>
            <p className="text-2xl font-mono font-bold text-yellow-400">{credits.toLocaleString()}🪙</p>
          </div>
          
          {userDataLoading ? (
             <div className="px-4 py-2 rounded-lg bg-gray-800 text-gray-500 font-bold border border-gray-700 animate-pulse cursor-wait">
                Lade...
             </div>
          ) : (
            <button 
                onClick={claimDaily}
                disabled={cooldownTime > 0 || loading}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                    cooldownTime <= 0 
                    ? "bg-green-600 hover:bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] text-white" 
                    : "bg-gray-700 opacity-50 cursor-not-allowed text-gray-300"
                }`}
            >
                {loading 
                  ? "Lade..." 
                  : cooldownTime > 0 
                    ? `Warte: ${formatCooldown(cooldownTime)}` 
                    : "🎁 Daily +500"
                }
            </button>
          )}
        </div>
      </header>

      {!activeGame ? (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {GAMES.map(game => (
                <div key={game.id} 
                className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-violet-500 p-6 rounded-2xl cursor-pointer transition-all group"
                onClick={() => setActiveGame(game.id)}
                >
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300 w-12 h-12 flex items-center justify-center">
                    {game.id === 'slots' && '🎰'}
                    {game.id === 'blackjack' && '🃏'}
                    {game.id === 'highlow' && '📈'}
                    {game.id === 'mines' && '💣'}
                    {game.id === 'guess' && '🔢'}
                    {game.id === 'case' && '📦'}
                </div>
                <h3 className="text-xl font-bold mb-2">{game.name}</h3>
                <p className="text-sm text-gray-400">{game.desc}</p>
                </div>
            ))}
            </div>

            {/* -- BOTTOM SECTION: TRANSFER & LEADERBOARD -- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
                
                {/* 1. TRANSFER */}
                <div className="bg-gray-900/50 border border-gray-700 p-6 rounded-2xl h-full">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-violet-400">
                        💸 Überweisen
                    </h2>
                    <form onSubmit={handleTransfer} className="flex flex-col gap-4">
                        <div>
                            <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Empfänger</label>
                            <select 
                                value={transferTarget}
                                onChange={(e) => setTransferTarget(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500"
                            >
                                <option value="">-- Wähle einen User --</option>
                                {userList.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Menge</label>
                            <input 
                                type="number" 
                                min="1" 
                                max={credits}
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(e.target.value)}
                                placeholder="Wie viel?"
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500"
                            />
                        </div>
                        
                        {transferStatus && (
                            <div className={`p-3 rounded-lg text-sm font-bold ${transferStatus.type === 'success' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'}`}>
                                {transferStatus.msg}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={!transferTarget || !transferAmount || credits < transferAmount}
                            className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition mt-auto"
                        >
                            Senden
                        </button>
                    </form>
                </div>

                {/* 2. LEADERBOARD */}
                <div className="bg-gray-900/50 border border-gray-700 p-6 rounded-2xl h-full">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-500">
                        🏆 Top 5 Reichste
                    </h2>
                    <div className="flex flex-col gap-2">
                        {leaderboard.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">Lade Ranking...</p>
                        ) : (
                            leaderboard.map((u, index) => {
                                let rankColor = "bg-gray-800 border-gray-700 text-gray-300"; // Default
                                let medal = `#${index + 1}`;

                                if (index === 0) {
                                    rankColor = "bg-yellow-900/30 border-yellow-600/50 text-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.1)]";
                                    medal = "🥇";
                                } else if (index === 1) {
                                    rankColor = "bg-slate-700/50 border-slate-500/50 text-slate-200";
                                    medal = "🥈";
                                } else if (index === 2) {
                                    rankColor = "bg-orange-900/30 border-orange-700/50 text-orange-200";
                                    medal = "🥉";
                                }

                                return (
                                    <div key={index} className={`flex items-center justify-between p-3 rounded-xl border ${rankColor} transition-all hover:scale-[1.02]`}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-bold w-8 text-center">{medal}</span>
                                            <span className="font-semibold">{u.name}</span>
                                        </div>
                                        <span className="font-mono font-bold">{u.credits.toLocaleString()} 💎</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>
        </>
      ) : (
        <div className="bg-gray-900/90 border border-gray-700 rounded-2xl p-6 min-h-[400px] relative">
            {activeGame && (
                <button 
                    onClick={() => { setActiveGame(null); refreshUser(); }}
                    className="absolute -bottom-14 right-0 md:top-6 md:right-6 md:bottom-auto bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg border border-red-400 z-50 flex items-center gap-2 transition-transform active:scale-95"
                >
                    <span>🚪</span> Lobby
                </button>
            )}
            {activeGame === "slots" && <SlotMachine updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "blackjack" && <Blackjack updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "highlow" && <HighLow updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "mines" && <Mines updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "guess" && <GuessNumber updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "case" && <CaseOpening updateCredits={refreshUser} currentCredits={credits} />}
        </div>
      )}
    </div>
  );
}