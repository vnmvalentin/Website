// src/pages/Card/AchievementsPage.jsx
import React, { useContext, useEffect, useState, useMemo } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Link } from "react-router-dom";
import { Trophy, CheckCircle, Lock, ChevronLeft, Gift, Star, Shield, Zap } from "lucide-react";

// --- KONSTANTEN & LOGIK (Original) ---
const CARD_TYPES = [
  { id: "natur", title: "Natur", min: 1, max: 50, icon: "🌿" },
  { id: "bestie", title: "Bestie", min: 51, max: 100, icon: "🐾" },
  { id: "drache", title: "Drache", min: 101, max: 150, icon: "🐲" },
  { id: "dunkelheit", title: "Dunkelheit", min: 151, max: 200, icon: "🌑" },
  { id: "cyber", title: "Cyber", min: 201, max: 250, icon: "🤖" },
  { id: "magie", title: "Magie", min: 251, max: 300, icon: "🪄" },
  { id: "ozean", title: "Ozean", min: 301, max: 350, icon: "🌊" },
  { id: "himmel", title: "Himmel", min: 351, max: 400, icon: "☁️" },
  { id: "mechanisch", title: "Mechanisch", min: 401, max: 450, icon: "⚙️" },
  { id: "kristall", title: "Kristall", min: 451, max: 500, icon: "💎" },
  { id: "hoelle", title: "Hölle", min: 501, max: 550, icon: "🔥" },
  { id: "wueste", title: "Wüste", min: 551, max: 600, icon: "🌵" },
  { id: "untergrund", title: "Untergrund", min: 601, max: 650, icon: "🔦" },
];

const typeAchievements = CARD_TYPES.map((type) => ({
  id: `collection_${type.id}`,
  title: `Meister: ${type.title}`,
  description: `Besitze alle Karten vom Typ ${type.title}.`,
  icon: type.icon,
  reward: 500, 
  getProgress: (stats, allOwnedCards) => {
    const cardsInType = allOwnedCards.filter((c) => {
      const num = parseInt(c.number || "0", 10);
      return num >= type.min && num <= type.max;
    });
    const max = cardsInType.length;
    const current = cardsInType.filter(c => (c.count || 0) > 0).length;
    return { current, max, done: max > 0 && current >= max };
  }
}));

const MANUAL_ACHIEVEMENTS = [
  {
    id: "first_blood",
    title: "Der Anfang",
    description: "Sammle deine erste Karte.",
    icon: "🃏",
    reward: 100,
    getProgress: (stats) => ({ current: stats.totalOwned > 0 ? 1 : 0, max: 1, done: stats.totalOwned > 0 })
  },
  {
    id: "collector_100",
    title: "Sammler",
    description: "Besitze 100 verschiedene Karten.",
    icon: "📚",
    reward: 1000,
    getProgress: (stats) => ({ current: Math.min(stats.uniqueOwned, 100), max: 100, done: stats.uniqueOwned >= 100 })
  },
  {
    id: "mythic_full",
    title: "Mythologie",
    description: "Besitze alle mythischen Karten.",
    icon: "🔮",
    reward: 2000,
    getProgress: (stats, allOwnedCards) => {
      const mythics = allOwnedCards.filter((c) => c.rarity === "mythic" || c.rarityName === "Mythisch");
      const max = mythics.length;
      const current = mythics.filter(c => (c.count || 0) > 0).length;
      return { current, max, done: max > 0 && current >= max };
    },
  },
  {
    id: "secret_full",
    title: "Geheim",
    description: "Besitze alle geheimen Karten.",
    icon: "🕵️",
    reward: 5000,
    getProgress: (stats, allOwnedCards) => {
      const secrets = allOwnedCards.filter((c) => c.rarity === "secret" || c.rarityName === "Geheim");
      const max = secrets.length;
      const current = secrets.filter(c => (c.count || 0) > 0).length;
      return { current, max, done: max > 0 && current >= max };
    },
  },
  {
    id: "legend_found",
    title: "Legendär!",
    description: "Besitze die legendäre Karte.",
    icon: "✨",
    reward: 5000,
    getProgress: (stats, allOwnedCards) => {
      const legends = allOwnedCards.filter((c) => c.rarity === "legendary" || c.rarityName === "Legendär");
      const hasOne = legends.some(c => (c.count || 0) > 0);
      return { current: hasOne ? 1 : 0, max: 1, done: hasOne };
    },
  },
  {
    id: "ultimate_collector",
    title: "Und was jetzt?",
    description: "Sammle alle Karten.",
    icon: "🎗️",
    reward: 25000,
    getProgress: (stats, allOwnedCards) => {
        const max = allOwnedCards.length; // Annahme
        const current = stats.uniqueOwned;
        return { current, max, done: max > 0 && current >= max };
    },
  },
];

const ACHIEVEMENTS_DEF = [...MANUAL_ACHIEVEMENTS, ...typeAchievements];

export default function AchievementsPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [loading, setLoading] = useState(true);
  const [ownedCards, setOwnedCards] = useState([]);
  const [claimedList, setClaimedList] = useState([]); 
  const [error, setError] = useState("");
  const [claimingId, setClaimingId] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/cards/user/${user.id}`, { credentials: "include" });
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();
        setOwnedCards(data.owned || []);
        setClaimedList(data.claimedAchievements || []); 
      } catch (e) {
        console.error(e);
        setError("Daten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleClaim = async (achId) => {
      setClaimingId(achId);
      try {
          const res = await fetch(`/api/cards/achievement/claim/${user.id}`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ achievementId: achId })
          });
          const json = await res.json();
          if (!res.ok) {
              alert(json.error || "Fehler beim Abholen");
          } else {
              setClaimedList(prev => [...prev, achId]);
          }
      } catch (e) {
          console.error(e);
          alert("Netzwerkfehler");
      } finally {
          setClaimingId(null);
      }
  };

  const { list, progress } = useMemo(() => {
    const totalOwned = ownedCards.reduce((acc, c) => acc + (c.count || 0), 0);
    const uniqueOwned = ownedCards.filter((c) => (c.count || 0) > 0).length;
    const stats = { totalOwned, uniqueOwned };

    const calculated = ACHIEVEMENTS_DEF.map((ach) => {
       const info = ach.getProgress(stats, ownedCards);
       const isClaimed = claimedList.includes(ach.id);
       return { ...ach, ...info, isClaimed };
    });

    const doneCount = calculated.filter((a) => a.done).length;
    return {
      list: calculated,
      progress: { done: doneCount, total: calculated.length },
    };
  }, [ownedCards, claimedList]);

  if (!user) return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-3xl font-black mb-4">Achievements</h1>
            <button onClick={() => login(true)} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105">Login</button>
        </div>
      </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Trophy className="text-yellow-500" size={32} /> Achievements
          </h1>
          <p className="text-white/50 mt-1">Schalte Erfolge frei und verdiene extra Credits.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-[#18181b] px-5 py-3 rounded-2xl border border-white/10">
            <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Fortschritt</div>
                <div className="text-xl font-mono font-bold text-violet-400">
                    {progress.done} <span className="text-white/40 text-sm">/ {progress.total}</span>
                </div>
            </div>
            <div className="h-10 w-10 relative">
               <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                  <path className="text-violet-500" strokeDasharray={`${(progress.done / progress.total) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
               </svg>
            </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* MAIN LIST */}
        <div className="flex-1 w-full space-y-6">
            {loading ? <div className="text-center py-20 text-white/30 animate-pulse">Lade Achievements...</div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {list.map((ach) => {
                        const percent = ach.max > 0 ? (ach.current / ach.max) * 100 : 0;
                        return (
                            <div key={ach.id} className={`group relative bg-[#18181b] border rounded-2xl p-5 shadow-lg transition-all duration-300 ${ach.done ? "border-green-500/30 bg-gradient-to-br from-[#18181b] to-green-900/10" : "border-white/5 hover:border-white/10"}`}>
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`w-12 h-12 flex items-center justify-center rounded-xl text-2xl shadow-inner ${ach.done ? "bg-green-500/20 text-green-400" : "bg-black/40 grayscale opacity-50"}`}>
                                        {ach.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`font-bold truncate ${ach.done ? "text-white" : "text-white/70"}`}>{ach.title}</h3>
                                        <p className="text-xs text-white/40 line-clamp-2">{ach.description}</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-white/30">
                                        <span>Progress</span>
                                        <span>{Math.round(percent)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-1000 ${ach.done ? "bg-green-500" : "bg-violet-600"}`} style={{ width: `${percent}%` }}></div>
                                    </div>
                                    <div className="text-right text-[10px] font-mono text-white/50">{ach.current} / {ach.max}</div>
                                </div>

                                {/* ACTION BUTTON */}
                                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                                    <div className="flex items-center gap-1 text-xs font-bold text-yellow-500">
                                        <Gift size={14} /> +{ach.reward}
                                    </div>
                                    
                                    {ach.done ? (
                                        ach.isClaimed ? (
                                            <span className="flex items-center gap-1 text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                                                <CheckCircle size={14} /> Abgeholt
                                            </span>
                                        ) : (
                                            <button 
                                                onClick={() => handleClaim(ach.id)}
                                                disabled={claimingId === ach.id}
                                                className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black px-4 py-1.5 rounded-lg shadow-lg shadow-yellow-900/20 active:scale-95 transition-all animate-pulse"
                                            >
                                                {claimingId === ach.id ? "..." : "CLAIM"}
                                            </button>
                                        )
                                    ) : (
                                        <div className="flex items-center gap-1 text-xs text-white/20 font-bold px-3 py-1.5">
                                            <Lock size={14} /> Locked
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* SIDEBAR */}
        <aside className="w-full lg:w-64 shrink-0 space-y-4">
            <div className="bg-[#18181b] border border-white/10 rounded-2xl p-2 shadow-lg">
                <div className="p-4 border-b border-white/5 mb-2">
                    <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider">Menü</h2>
                </div>
                <nav className="space-y-1 px-2 pb-2">
                    <Link to="/Packs" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-medium">
                        <ChevronLeft size={18} /> Zurück
                    </Link>
                    <Link to="/Packs" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-medium">
                        <Gift size={18} /> Pack Öffnen
                    </Link>
                    <Link to="/Packs/Album" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-medium">
                        <Shield size={18} /> Sammlung
                    </Link>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-600/10 text-violet-400 font-bold border border-violet-500/20">
                        <Trophy size={18} /> Achievements
                    </div>
                </nav>
            </div>
        </aside>

      </div>
    </div>
  );
}