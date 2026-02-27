import React, { useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { 
  Gamepad2, 
  Trophy, 
  Send, 
  Timer, 
  Gift, 
  ChevronRight, 
  Search,
  Home 
} from "lucide-react";
import SEO from "../components/SEO";
import io from "socket.io-client";

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
  { id: "slots", name: "Waifu Slots", desc: "5 Walzen, 11 Gewinnlinien", icon: "🎰", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
  { id: "blackjack", name: "Blackjack", desc: "Schlage den Dealer auf 21", icon: "🃏", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { id: "roulette", name: "Roulette", desc: "Setze auf Rot oder Schwarz", icon: "🎯", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { id: "plinko", name: "Plinko", desc: "Lass den Ball fallen", icon: "🔻", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { id: "mines", name: "Mines", desc: "Finde Diamanten, meide Bomben", icon: "💣", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  { id: "dice", name: "Dice", desc: "Schiebe den Regler", icon: "🎲", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { id: "highlow", name: "High / Low", desc: "Höher oder tiefer?", icon: "📈", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { id: "case", name: "Mystery Case", desc: "CS-Style Case Opening", icon: "📦", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { id: "guess", name: "Guess Number", desc: "Errate die Zahl (1-100)", icon: "🔢", color: "text-white", bg: "bg-white/5 border-white/10" },
];

export default function CasinoPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [credits, setCredits] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeGame = searchParams.get("game");
  
  // Transfer
  const [userList, setUserList] = useState([]);
  const [transferSearch, setTransferSearch] = useState(""); 
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferStatus, setTransferStatus] = useState(null);
  
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [userDataLoading, setUserDataLoading] = useState(true);

  useEffect(() => {
      if (!user) return;
      const socket = io(window.location.origin, { path: "/socket.io" });
      socket.emit("join_room", `user:${user.id}`);
      socket.on("casino_credit_update", (data) => {
          if (data.credits !== undefined) setCredits(data.credits);
      });
      return () => socket.disconnect();
  }, [user]);

  const fetchUserList = async () => {
    try {
        const res = await fetch("/api/casino/users", { credentials: "include" });
        if(res.ok) setUserList(await res.json());
    } catch(e) {}
  };

  const fetchLeaderboard = async () => {
      try {
          const res = await fetch("/api/casino/leaderboard", { credentials: "include" });
          if(res.ok) setLeaderboard(await res.json());
      } catch(e) {}
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/casino/user", { credentials: "include" });
      const data = await res.json();
      setCredits(data.credits || 0);
      fetchUserList();
      fetchLeaderboard();
    } catch (e) { console.error(e); } finally { setUserDataLoading(false); }
  };

  useEffect(() => { refreshUser(); }, [user]);


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

  const filteredUsers = userList.filter(u => 
      u.name.toLowerCase().includes(transferSearch.toLowerCase())
  );

  const openGame = (gameId) => {
      setSearchParams({ game: gameId });
  };

  const goToLobby = () => {
      setSearchParams({});
      refreshUser();
  };

  const visibleLeaderboard = leaderboard.slice(0, 10);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-yellow-400 to-amber-600 bg-clip-text text-transparent">VNM CASINO</h1>
            <p className="text-white/50 mb-8 max-w-md mx-auto">Spiele Slots, Blackjack und mehr. Sammle Credits und steige im Leaderboard auf.</p>
            <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-purple-900/30 transition-transform hover:scale-105">
            Login mit Twitch
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-8 text-white pb-20">
        <SEO title="Casino"/>
      
      {/* --- HEADER --- */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-[#18181b] p-6 rounded-3xl mb-8 border border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-yellow-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
             <span className="text-yellow-500">🎰</span> Valentins Casino
          </h1>
          <p className="text-white/40 text-sm font-medium mt-1">Dein großer Gewinn wartet.</p>
        </div>

        <div className="flex items-center gap-4 mt-6 md:mt-0 relative z-10">
          <div className="bg-black/30 px-5 py-2.5 rounded-xl border border-white/5 flex items-center gap-3">
            <div className="text-right">
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Dein Guthaben</p>
                <p className="text-xl font-mono font-bold text-yellow-400 leading-none">{credits.toLocaleString()}</p>
            </div>
            <CoinIcon className="w-8 h-8 text-yellow-500 drop-shadow-md" />
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT (Flexbox statt Grid) --- */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
            
        {/* === LINKE SIDEBAR: FESTE BREITE (z.B. w-72 oder w-80) === */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-2 bg-[#18181b] border border-white/10 rounded-3xl p-4 shadow-lg sticky top-8">
            <div className="px-2 pb-2 mb-2 border-b border-white/5">
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider">Navigation</h2>
            </div>
            
            {/* Lobby Button */}
            <button 
                onClick={goToLobby}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                    !activeGame 
                    ? "bg-white/10 text-white shadow-md border border-white/10" 
                    : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
            >
                <div className={`p-1.5 rounded-lg ${!activeGame ? "bg-yellow-500/20 text-yellow-400" : "bg-white/5"}`}>
                    <Home size={18} />
                </div>
                <span className="font-bold text-sm">Lobby & Tools</span>
            </button>

            <div className="px-2 pt-4 pb-2 mt-4 border-b border-white/5">
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider">Spiele</h2>
            </div>

            {/* Game List */}
            <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                {GAMES.map(game => {
                    const isActive = activeGame === game.id;
                    return (
                        <button 
                            key={game.id} 
                            onClick={() => openGame(game.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left group ${
                                isActive 
                                ? "bg-white/10 text-white shadow-md border border-white/10" 
                                : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                            }`}
                        >
                            <div className="text-lg w-6 text-center shrink-0">
                                {game.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className={`font-bold text-sm block truncate ${isActive ? game.color : "text-white/80 group-hover:text-white"}`}>
                                    {game.name}
                                </span>
                            </div>
                            {isActive && <ChevronRight size={16} className="text-white/40 shrink-0" />}
                        </button>
                    );
                })}
            </div>
        </div>

        {/* === RECHTER BEREICH: NIMMT DEN KOMPLETTEN RESTLICHEN PLATZ (flex-1) === */}
        <div className="flex-1 min-w-0 w-full">
            {!activeGame ? (
                /* LOBBY VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-300">
                    
                    {/* Überweisung */}
                    <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-lg h-fit">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/5 pb-4">
                            <Send size={18} className="text-blue-400" /> Überweisung
                        </h3>
                        
                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Empfänger</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                                        <Search size={14} />
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="User suchen..."
                                        value={transferSearch}
                                        onChange={(e) => setTransferSearch(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-3 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
                                    />
                                    {transferSearch && (
                                        <button type="button" onClick={() => { setTransferSearch(""); setTransferTarget(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">✕</button>
                                    )}

                                    {transferSearch && !transferTarget && (
                                        <div className="absolute z-10 w-full left-0 bg-[#25252a] border border-white/10 rounded-xl shadow-xl mt-1 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                            {filteredUsers.length === 0 ? <div className="p-2 text-xs text-white/30">Kein User gefunden</div> : 
                                                filteredUsers.map(u => (
                                                    <button key={u.id} type="button" onClick={() => { setTransferTarget(u.id); setTransferSearch(u.name); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 rounded-lg">
                                                        {u.name}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Betrag</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max={credits}
                                        value={transferAmount}
                                        onChange={(e) => setTransferAmount(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-3 pr-10 py-3 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors font-mono"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                        <CoinIcon className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            {transferStatus && (
                                <div className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${transferStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {transferStatus.type === 'success' ? "✅" : "⚠️"} {transferStatus.msg}
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={!transferTarget || !transferAmount || credits < transferAmount}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg active:scale-95"
                            >
                                Senden
                            </button>
                        </form>
                    </div>

                    {/* Leaderboard */}
                    <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-lg flex flex-col h-fit">
                        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Trophy size={18} className="text-yellow-500" /> Top Liste
                            </h3>
                            {leaderboard.length > 10 && (
                                <button onClick={() => setShowLeaderboardModal(true)} className="text-[10px] uppercase font-bold text-white/40 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded">
                                    Alle
                                </button>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            {leaderboard.length === 0 ? (
                                <p className="text-white/30 text-xs italic text-center py-4">Lade Daten...</p>
                            ) : (
                                visibleLeaderboard.map((u, index) => {
                                    let badgeColor = "bg-white/5 text-white/40";
                                    if (index === 0) badgeColor = "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20";
                                    if (index === 1) badgeColor = "bg-gray-400 text-black";
                                    if (index === 2) badgeColor = "bg-orange-700 text-white";

                                    return (
                                        <div key={index} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${badgeColor}`}>
                                                    {index + 1}
                                                </div>
                                                <span className="font-semibold text-sm text-white/80 group-hover:text-white truncate">{u.name}</span>
                                            </div>
                                            <span className="font-mono text-xs text-white/50">{u.credits.toLocaleString()}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* GAME VIEW */
                <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 min-h-[600px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    {/* Game Components */}
                    <div className="pt-2">
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
                </div>
            )}
        </div>
      </div>

      {/* MODAL FÜR FULL LEADERBOARD */}
      {showLeaderboardModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-[#18181b] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl relative">
                  <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-3xl">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Trophy className="text-yellow-500" /> Bestenliste</h2>
                      <button onClick={() => setShowLeaderboardModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition text-white">✕</button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {leaderboard.map((u, index) => {
                                let rankStyle = "bg-white/5 border-white/5 text-white/60";
                                let medal = `#${index + 1}`;
                                if (index === 0) { rankStyle = "bg-yellow-500/10 border-yellow-500/20 text-yellow-200"; medal = "🥇"; }
                                else if (index === 1) { rankStyle = "bg-gray-400/10 border-gray-400/20 text-gray-200"; medal = "🥈"; }
                                else if (index === 2) { rankStyle = "bg-orange-700/10 border-orange-700/20 text-orange-200"; medal = "🥉"; }

                                return (
                                    <div key={index} className={`flex items-center justify-between p-3 rounded-xl border ${rankStyle}`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <span className="text-lg font-bold w-8 text-center flex-shrink-0">{medal}</span>
                                            <span className="font-semibold truncate text-white">{u.name}</span>
                                        </div>
                                        <span className="font-mono font-bold text-sm ml-2">{u.credits.toLocaleString()}</span>
                                    </div>
                                );
                          })}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}