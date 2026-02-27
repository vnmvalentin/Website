// src/pages/Card/AchievementsPage.jsx
import React, { useContext, useEffect, useState, useMemo } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Trophy, CheckCircle, Lock, Star, Shield, Zap, Palette, Fish } from "lucide-react";

// --- ACHIEVEMENT DEFINITIONEN ---
// Hier definieren wir, was der Nutzer tun muss. 
// Du kannst die IDs im Array `requiredIds` einfach durch deine echten Katzen-IDs ersetzen!
const ACHIEVEMENTS_DEF = [
  {
    id: "first_blood",
    title: "Der erste Schritt",
    desc: "Ziehe deine allererste Katze.",
    rewardCoins: 100,
    checkProgress: (owned, defs) => {
      const current = Object.keys(owned).length > 0 ? 1 : 0;
      return { current, max: 1, isUnlocked: current >= 1 };
    }
  },
  {
    id: "collector_50",
    title: "Katzenliebhaber",
    desc: "Sammle 50 einzigartige Katzen.",
    rewardCoins: 500,
    rewardColor: "Blau",
    checkProgress: (owned, defs) => {
      const current = Object.keys(owned).length;
      return { current, max: 50, isUnlocked: current >= 50 };
    }
  },
  {
    id: "collector_75",
    title: "Katzen-Messi",
    desc: "Sammle 75 einzigartige Katzen.",
    rewardCoins: 1000,
    checkProgress: (owned, defs) => {
      const current = Object.keys(owned).length;
      return { current, max: 75, isUnlocked: current >= 75 };
    }
  },
  {
    id: "epic_found",
    title: "Epischer Fund",
    desc: "Ziehe deine erste Epische Katze.",
    rewardCoins: 500,
    checkProgress: (owned, defs) => {
      const hasEpic = defs.some(c => c.rarity === "epic" && owned[c.id]);
      return { current: hasEpic ? 1 : 0, max: 1, isUnlocked: hasEpic };
    }
  },
  {
    id: "mythic_found",
    title: "Mythischer Fund",
    desc: "Ziehe eine mythische Katze.",
    rewardCoins: 1000,
    rewardColor: "Mythisches Lila",
    checkProgress: (owned, defs) => {
      const hasMyth = defs.some(c => c.rarity === "mythic" && owned[c.id]);
      return { current: hasMyth ? 1 : 0, max: 1, isUnlocked: hasMyth };
    }
  },
  {
    id: "legend_found",
    title: "Eine wahre Legende",
    desc: "Ziehe eine Legendäre Katze.",
    rewardCoins: 5000,
    rewardColor: "Gold",
    checkProgress: (owned, defs) => {
      const hasLeg = defs.some(c => c.rarity === "legendary" && owned[c.id]);
      return { current: hasLeg ? 1 : 0, max: 1, isUnlocked: hasLeg };
    }
  },
  {
    id: "collection_hauskatze",
    title: "Rettungstruppe",
    desc: "Sammle die Feuerwehr-, Polizei- und Krankenwagen-Katze.",
    rewardCoins: 1000,
    // HIER DIE IDS DEINER SPEZIELLEN KATZEN EINTRAGEN:
    requiredIds: ["12", "15", "16"], 
    checkProgress: function(owned, defs) {
      const current = this.requiredIds.filter(id => owned[id]).length;
      return { current, max: this.requiredIds.length, isUnlocked: current >= this.requiredIds.length };
    }
  },
  {
    id: "ultimate_collector",
    title: "Der Katzen-Gott",
    desc: "Sammle ausnahmslos ALLE existierenden Katzen.",
    rewardCoins: 25000,
    rewardColor: "Regenbogen",
    rewardFish: "Rainbow",
    checkProgress: (owned, defs) => {
      const totalDef = defs.length;
      const current = Object.keys(owned).length;
      // Verhindert Unlocks, wenn noch gar keine Karten definiert sind
      const isUnlocked = totalDef > 0 && current >= totalDef; 
      return { current, max: totalDef || 1, isUnlocked };
    }
  }
];

export default function AchievementsPage() {
  const { user } = useContext(TwitchAuthContext);

  const [cardsDef, setCardsDef] = useState([]);
  const [userCards, setUserCards] = useState({ owned: {}, claimedAchievements: [] });
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/cards/def").then(r => r.json()),
      fetch("/api/cards/user", { credentials: "include" }).then(r => r.json())
    ]).then(([defData, userData]) => {
      setCardsDef(defData || []);
      setUserCards(userData || { owned: {}, claimedAchievements: [] });
      setLoading(false);
    }).catch(console.error);
  }, [user]);

  const handleClaim = async (achId) => {
    if (claimingId) return;
    setClaimingId(achId);
    try {
      const res = await fetch("/api/cards/achievements/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achId }),
        credentials: "include"
      });
      const data = await res.json();
      if (data.ok) {
        setUserCards(prev => ({
          ...prev,
          claimedAchievements: data.claimed || prev.claimedAchievements
        }));
      }
    } catch (e) {
      console.error("Claim Error:", e);
    }
    setClaimingId(null);
  };

  const claimedList = userCards.claimedAchievements || [];
  const owned = userCards.owned || {};

  // Fortschritt für alle Achievements berechnen
  const processedAchievements = useMemo(() => {
    return ACHIEVEMENTS_DEF.map(ach => {
      const isClaimed = claimedList.includes(ach.id);
      const { current, max, isUnlocked } = ach.checkProgress(owned, cardsDef);
      
      return {
        ...ach,
        current,
        max,
        isUnlocked,
        isClaimed,
        canClaim: isUnlocked && !isClaimed
      };
    });
  }, [claimedList, owned, cardsDef]);

  const readyToClaimCount = processedAchievements.filter(a => a.canClaim).length;

  if (loading) return <div className="text-center text-white/50 p-20">Lade Achievements...</div>;

  return (
    <div className="w-full">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Trophy className="text-yellow-500" size={32} /> Achievements
          </h1>
          <p className="text-white/50 mt-1">
            Schalte Meilensteine frei, um <span className="font-bold text-white">Coins, Chat-Farben</span> und exklusive <span className="font-bold text-white">Teich-Fische</span> zu erhalten!
          </p>
        </div>
        {readyToClaimCount > 0 && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 px-4 py-2 rounded-xl flex items-center gap-2 font-bold animate-pulse">
                <Star size={18} /> {readyToClaimCount} Belohnung(en) verfügbar!
            </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {processedAchievements.map(ach => {
            const pct = Math.min(100, (ach.current / ach.max) * 100);
            
            return (
                <div key={ach.id} className={`bg-[#18181b] border rounded-2xl p-5 flex flex-col justify-between transition-all ${ach.canClaim ? "border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]" : "border-white/10"}`}>
                    
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-white">{ach.title}</h3>
                            {ach.isClaimed && <CheckCircle size={20} className="text-green-500" />}
                        </div>
                        <p className="text-sm text-white/50 mb-4 h-10">{ach.desc}</p>

                        {/* BELOHNUNGEN BEREICH */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {ach.rewardCoins > 0 && (
                                <span className="bg-yellow-500/10 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-md border border-yellow-500/20">
                                    💰 {ach.rewardCoins.toLocaleString()} Coins
                                </span>
                            )}
                            {ach.rewardFish && (
                                <span className="bg-cyan-500/10 text-cyan-400 text-[10px] font-bold px-2 py-1 rounded-md border border-cyan-500/20 flex items-center gap-1">
                                    <Fish size={12} /> {ach.rewardFish}
                                </span>
                            )}
                            {ach.rewardColor && (
                                <span className="bg-fuchsia-500/10 text-fuchsia-400 text-[10px] font-bold px-2 py-1 rounded-md border border-fuchsia-500/20 flex items-center gap-1">
                                    <Palette size={12} /> Farbe: {ach.rewardColor}
                                </span>
                            )}
                        </div>
                    </div>

                    <div>
                        {/* PROGRESS BAR */}
                        <div className="flex justify-between text-xs font-bold text-white/50 mb-2">
                            <span>Fortschritt</span>
                            <span>{ach.current} / {ach.max}</span>
                        </div>
                        <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden mb-4">
                            <div 
                                className={`h-full transition-all duration-1000 ${ach.canClaim ? "bg-yellow-400" : ach.isClaimed ? "bg-green-500" : "bg-blue-500"}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>

                        {/* BUTTONS */}
                        {ach.isClaimed ? (
                            <div className="w-full text-center text-xs font-bold text-green-500 bg-green-500/10 py-2.5 rounded-xl border border-green-500/20">
                                Abgeholt
                            </div>
                        ) : ach.canClaim ? (
                            <button 
                                onClick={() => handleClaim(ach.id)}
                                disabled={claimingId === ach.id}
                                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black py-2.5 rounded-xl shadow-lg shadow-yellow-900/20 active:scale-95 transition-all"
                            >
                                {claimingId === ach.id ? "Wird verarbeitet..." : "Belohnung einlösen!"}
                            </button>
                        ) : (
                            <div className="w-full text-center text-xs font-bold text-white/20 bg-white/5 py-2.5 rounded-xl flex items-center justify-center gap-2">
                                <Lock size={14} /> Gesperrt
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
}