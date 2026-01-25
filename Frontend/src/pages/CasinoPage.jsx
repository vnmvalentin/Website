// src/pages/CasinoPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";

import CoinIcon from "../components/CoinIcon";

// Game Components
import SlotMachine from "../components/casino/SlotMachine";
import Blackjack from "../components/casino/Blackjack";
import HighLow from "../components/casino/HighLow";
import Mines from "../components/casino/Mines";
import GuessNumber from "../components/casino/GuessNumber";
import CaseOpening from "../components/casino/CaseOpening";
import Roulette from "../components/casino/Roulette"; 
import Plinko from "../components/casino/Plinko";
import Dice from "../components/casino/Dice";


const GAMES = [
  { id: "slots", name: "🎰 Waifu Slots", desc: "5 Walzen, 3 Reihen, 11 Gewinnlinien!" },
  { id: "blackjack", name: "🃏 Blackjack", desc: "Schlage den Dealer auf 21." },
  { id: "mines", name: "💣 Mines", desc: "Finde die Diamanten, meide Bomben." },
  { id: "highlow", name: "📈 High / Low", desc: "Höher oder tiefer als 50?" },
  { id: "case", name: "📦 Mystery Case", desc: "CS-Style Case Opening (Multi)." },
  { id: "guess", name: "🔢 Guess The Number", desc: "Errate die Zahl (1-100) in 6 Versuchen." },
  { id: "roulette", name: "🎯 Roulette", desc: "Setze auf Farben & Zahlen. Der Klassiker." },
  { id: "plinko", name: "🔻 Plinko", desc: "Lass den Ball fallen!" },
  { id: "dice", name: "🎲 Dice", desc: "Schiebe den Regler." },
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
  const [transferSearch, setTransferSearch] = useState(""); 
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferStatus, setTransferStatus] = useState(null);
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false); // NEU: Modal State
  const [userDataLoading, setUserDataLoading] = useState(true);

  // Userliste (für Dropdown)
  const fetchUserList = async () => {
    try {
        const res = await fetch("/api/casino/users", { credentials: "include" });
        if(res.ok) setUserList(await res.json());
    } catch(e) { console.error(e); }
  };

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
      } else { setCooldownTime(0); }
      fetchUserList();
      fetchLeaderboard();
    } catch (e) { console.error(e); } finally { setUserDataLoading(false); }
  };

  useEffect(() => { refreshUser(); }, [user]);

  useEffect(() => {
    const iv = setInterval(() => {
        if (lastDaily > 0) {
            const diff = (lastDaily + 24*60*60*1000) - Date.now();
            setCooldownTime(Math.max(0, diff));
        } else { setCooldownTime(0); }
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
            fetchLeaderboard(); 
        } else {
            setTransferStatus({ type: 'error', msg: data.error || "Fehler beim Senden" });
        }
      } catch(e) { setTransferStatus({ type: 'error', msg: "Netzwerkfehler" }); }
  };

  // NEU: Handle User Selection (Dropdown -> Search Field)
  const handleUserSelect = (e) => {
      const selectedId = e.target.value;
      setTransferTarget(selectedId);
      
      const selectedUser = userList.find(u => u.id === selectedId);
      if (selectedUser) {
          setTransferSearch(selectedUser.name);
      }
  };

  const filteredUsers = userList.filter(u => 
      u.name.toLowerCase().includes(transferSearch.toLowerCase())
  );

  const visibleLeaderboard = leaderboard.slice(0, 5); // Immer nur Top 5 im Preview

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
    <div className="max-w-[1600px] mx-auto p-4 text-white pb-20">
      {/* HEADER BLEIBT GLEICH */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-gray-900/80 p-6 rounded-2xl mb-8 border border-white/10 shadow-lg">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">VALENTINS CASINO</h1>
          <p className="text-gray-400 text-sm">Vermehre deine Credits! (Oder verliere alle)</p>
        </div>
        <div className="flex items-center gap-6 mt-4 md:mt-0">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Kontostand</p>
            <p className="text-2xl font-mono font-bold text-yellow-400">{credits.toLocaleString()} <CoinIcon size="w-6 h-6" /> </p>
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

      {/* --- LEADERBOARD MODAL (Code bleibt gleich, hier nur platzhalterisch drin gelassen für Kontext) --- */}
      {showLeaderboardModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl relative">
                  <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50 rounded-t-2xl">
                      <h2 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">🏆 Die Reichsten User</h2>
                      <button onClick={() => setShowLeaderboardModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 transition">✕</button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {leaderboard.map((u, index) => {
                                let rankColor = "bg-gray-800 border-gray-700";
                                let medal = `#${index + 1}`;
                                if (index === 0) { rankColor = "bg-yellow-900/40 border-yellow-500 text-yellow-200"; medal = "🥇"; }
                                else if (index === 1) { rankColor = "bg-slate-700/50 border-slate-400 text-slate-200"; medal = "🥈"; }
                                else if (index === 2) { rankColor = "bg-orange-900/40 border-orange-500 text-orange-200"; medal = "🥉"; }

                                return (
                                    <div key={index} className={`flex items-center justify-between p-3 rounded-xl border ${rankColor}`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <span className="text-lg font-bold w-8 text-center flex-shrink-0">{medal}</span>
                                            <span className="font-semibold truncate">{u.name}</span>
                                        </div>
                                        <span className="font-mono font-bold text-sm ml-2">{u.credits.toLocaleString()}</span>
                                    </div>
                                );
                          })}
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-700 bg-gray-800/30 rounded-b-2xl text-center">
                      <button onClick={() => setShowLeaderboardModal(false)} className="text-gray-400 hover:text-white text-sm">Schließen</button>
                  </div>
              </div>
          </div>
      )}

      {/* HAUPTBEREICH: ENTWEDER SPIELAUSWAHL ODER AKTIVES SPIEL */}
      {!activeGame ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            
            {/* --- LINKE SEITE: SPIELE (3 Spalten breit) --- */}
            <div className="xl:col-span-3 bg-gray-900/50 border border-gray-700 p-8 rounded-2xl h-fit">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 border-b border-gray-700 pb-4 text-white">
                    <span>🎮</span> Spiele
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {GAMES.map(game => (
                        <div key={game.id} 
                        className="bg-gray-800/40 hover:bg-gray-800 border border-gray-700 hover:border-violet-500 p-6 rounded-2xl cursor-pointer transition-all group flex flex-col items-center text-center shadow-lg"
                        onClick={() => setActiveGame(game.id)}
                        >
                            <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300 w-16 h-16 flex items-center justify-center bg-gray-900/50 rounded-full border border-gray-700 group-hover:border-violet-500/50">
                                {game.id === 'slots' && '🎰'}
                                {game.id === 'roulette' && '🎯'}
                                {game.id === 'blackjack' && '🃏'}
                                {game.id === 'highlow' && '📈'}
                                {game.id === 'mines' && '💣'}
                                {game.id === 'guess' && '🔢'}
                                {game.id === 'case' && '📦'}
                                {game.id === 'plinko' && '🔻'}
                                {game.id === 'dice' && '🎲'}
                            </div>
                            <h3 className="text-xl font-bold mb-1 text-white">{game.name}</h3>
                            <p className="text-sm text-gray-400">{game.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- RECHTE SEITE: MENÜ (1 Spalte breit) --- */}
            <div className="xl:col-span-1 bg-gray-900/50 border border-gray-700 p-6 rounded-2xl h-fit flex flex-col gap-8 sticky top-4">
                <h2 className="text-2xl font-bold flex items-center gap-3 border-b border-gray-700 pb-4 text-white">
                    <span>⚙️</span> Menü
                </h2>

                {/* 1. SECTION: ÜBERWEISEN */}
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-violet-400">
                        💸 Überweisen
                    </h3>
                    <form onSubmit={handleTransfer} className="flex flex-col gap-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Empfänger</label>
                            <div className="relative mb-2">
                                <input 
                                    type="text"
                                    placeholder="Suchen..."
                                    value={transferSearch}
                                    onChange={(e) => setTransferSearch(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:border-violet-500 outline-none"
                                />
                                {transferSearch && (
                                    <button 
                                        type="button"
                                        onClick={() => { setTransferSearch(""); setTransferTarget(""); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-700"
                                    >✕</button>
                                )}
                            </div>
                            <select 
                                value={transferTarget}
                                onChange={handleUserSelect}
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                                size={4} // Etwas kleiner für die Sidebar
                            >
                                <option value="" disabled>-- Wählen --</option>
                                {filteredUsers.length === 0 ? <option disabled>Kein User</option> : 
                                    filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                                }
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Menge</label>
                            <input 
                                type="number" 
                                min="1" 
                                max={credits}
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(e.target.value)}
                                placeholder="Betrag"
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                            />
                        </div>
                        {transferStatus && (
                            <div className={`p-2 rounded text-xs font-bold ${transferStatus.type === 'success' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                                {transferStatus.msg}
                            </div>
                        )}
                        <button 
                            type="submit" 
                            disabled={!transferTarget || !transferAmount || credits < transferAmount}
                            className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition"
                        >
                            Senden
                        </button>
                    </form>
                </div>

                <div className="w-full h-px bg-gray-700"></div>

                {/* 2. SECTION: REICHTUM */}
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-yellow-500">
                            🏆 Ranking
                        </h3>
                        <span className="text-xs text-gray-500">Top 5</span>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        {leaderboard.length === 0 ? (
                            <p className="text-gray-500 text-xs italic">Lade...</p>
                        ) : (
                            visibleLeaderboard.map((u, index) => {
                                let rankColor = "bg-gray-800/50 border-gray-700 text-gray-400"; 
                                let medal = `${index + 1}.`;

                                if (index === 0) { rankColor = "bg-yellow-900/20 border-yellow-600/30 text-yellow-200"; medal = "🥇"; }
                                else if (index === 1) { rankColor = "bg-slate-700/30 border-slate-500/30 text-slate-300"; medal = "🥈"; }
                                else if (index === 2) { rankColor = "bg-orange-900/20 border-orange-700/30 text-orange-300"; medal = "🥉"; }

                                return (
                                    <div key={index} className={`flex items-center justify-between p-2 rounded-lg border ${rankColor} text-sm`}>
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="font-bold w-6 text-center">{medal}</span>
                                            <span className="font-semibold truncate max-w-[100px]">{u.name}</span>
                                        </div>
                                        <span className="font-mono text-xs opacity-80">{u.credits.toLocaleString()}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    
                    {leaderboard.length > 5 && (
                        <button 
                            onClick={() => setShowLeaderboardModal(true)}
                            className="mt-3 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs transition border border-gray-600"
                        >
                            Alle anzeigen
                        </button>
                    )}
                </div>
            </div>
        </div>
      ) : (
        // --- ACTIVE GAME VIEW ---
        <div className="bg-gray-900/90 border border-gray-700 rounded-2xl p-6 min-h-[600px] relative shadow-2xl">
            {activeGame && (
                <button 
                    onClick={() => { setActiveGame(null); refreshUser(); }}
                    className="absolute -bottom-14 right-0 md:top-6 md:right-6 md:bottom-auto bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg border border-red-400 z-50 flex items-center gap-2 transition-transform active:scale-95"
                >
                    <span>🚪</span> Lobby
                </button>
            )}
            
            {/* Game Components Rendering */}
            {activeGame === "slots" && <SlotMachine updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "roulette" && <Roulette updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "blackjack" && <Blackjack updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "highlow" && <HighLow updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "mines" && <Mines updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "guess" && <GuessNumber updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "case" && <CaseOpening updateCredits={refreshUser} currentCredits={credits} />}
            {activeGame === "plinko" && (<Plinko updateCredits={refreshUser} currentCredits={credits} onClientUpdate={(newVal) => setCredits(newVal)} />)}
            {activeGame === "dice" && <Dice updateCredits={refreshUser} currentCredits={credits} />}
        </div>
      )}
    </div>
  );
}