// src/pages/Card/CardAlbumPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import { Search, Trash2, Trophy, LayoutGrid, AlertCircle, Lock } from "lucide-react";

// --- NEUE SELTENHEITEN ---
const RARITY_ORDER = [
  "common", 
  "uncommon", 
  "rare", 
  "epic",      // NEU
  "mythic",  
  "legendary", 
];

const RARITY_LABELS = {
  common: "Gewöhnlich",
  uncommon: "Ungewöhnlich",
  rare: "Selten",
  epic: "Episch",
  mythic: "Mythisch",
  legendary: "Legendär"
};

const RARITY_COLORS = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  mythic: "text-pink-400",
  legendary: "text-yellow-400"
};

export default function CardAlbumPage() {
  const { user } = useContext(TwitchAuthContext);

  const [cardsDef, setCardsDef] = useState([]);
  const [userCards, setUserCards] = useState({ owned: {}, gallery: [] });
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRarity, setSelectedRarity] = useState("all");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/cards/def").then((r) => r.json()),
      fetch("/api/cards/user", { credentials: "include" }).then((r) => r.json())
    ]).then(([defData, userData]) => {
      setCardsDef(defData || []);
      setUserCards(userData || { owned: {}, gallery: [] });
      setLoading(false);
    }).catch(console.error);
  }, [user]);

  // --- BERECHNUNGEN ---
  const hasDuplicates = useMemo(() => {
    return Object.values(userCards.owned || {}).some((amount) => amount > 1);
  }, [userCards.owned]);

  const stats = useMemo(() => {
    let unique = 0;
    let duplicates = 0;
    const rarityCounts = {};
    
    Object.entries(userCards.owned || {}).forEach(([id, amount]) => {
      if (amount > 0) {
        unique += 1;
        duplicates += (amount - 1);
        const card = cardsDef.find(c => String(c.id) === String(id));
        if (card) {
          rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1;
        }
      }
    });

    return { unique, duplicates, totalDef: cardsDef.length, rarityCounts };
  }, [userCards.owned, cardsDef]);

  // --- FILTERN & GRUPPIEREN ---
  const filteredCards = useMemo(() => {
    return cardsDef.filter((c) => {
      const matchSearch = 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        String(c.id).includes(searchQuery);
      
      const matchRarity = selectedRarity === "all" || c.rarity === selectedRarity;

      return matchSearch && matchRarity;
    });
  }, [cardsDef, searchQuery, selectedRarity]);

  // Gruppieren der gefilterten Karten nach Seltenheit
  const groupedCards = useMemo(() => {
      const groups = {};
      RARITY_ORDER.forEach(r => groups[r] = []);
      
      filteredCards.forEach(c => {
          if (groups[c.rarity]) groups[c.rarity].push(c);
      });
      return groups;
  }, [filteredCards]);


  if (loading) return <div className="text-center text-white/50 p-20">Lade Album...</div>;

  return (
    <div className="w-full">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <LayoutGrid className="text-blue-500" size={32} /> Dein Album
          </h1>
          <p className="text-white/50 mt-1">
            Du besitzt <span className="font-bold text-white">{stats.unique}</span> von <span className="font-bold text-white">{stats.totalDef}</span> Katzen.
          </p>
        </div>
        <div className="relative w-full md:w-64">
           <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
           <input 
              type="text" 
              placeholder="Name oder ID suchen..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
           />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start mt-8">
        
        {/* MAIN GRID */}
        <div className="flex-1 w-full order-2 lg:order-1 space-y-12">
            {RARITY_ORDER.map(rarity => {
                const cardsInRarity = groupedCards[rarity];
                if (cardsInRarity.length === 0) return null; // Leere Seltenheiten (durch Filter) ausblenden

                return (
                    <div key={rarity} className="space-y-4 animate-in fade-in">
                        {/* SELTENHEITS-HEADER */}
                        <div className="flex items-center gap-4">
                            <h2 className={`text-2xl font-black uppercase tracking-wider ${RARITY_COLORS[rarity]}`}>
                                {RARITY_LABELS[rarity]}
                            </h2>
                            <div className="flex-1 h-px bg-white/10"></div>
                        </div>

                        {/* KARTEN-GRID */}
                        <div 
                            className="grid gap-6 justify-items-left grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                        >
                            {cardsInRarity.map((c) => {
                                const amount = userCards.owned[c.id] || 0;
                                const isOwned = amount > 0;

                                return (
                                    <div key={c.id} className="relative group w-full max-w-[240px]">
                                        <div className={`transition-all duration-300 ${isOwned ? "hover:scale-105 hover:z-10" : "opacity-40 grayscale contrast-75 saturate-50 hover:opacity-60"}`}>
                                            <Card card={c} />
                                            
                                            {/* Nicht im Besitz Overlay */}
                                            {!isOwned && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="bg-black/80 p-3 rounded-full text-white/50 backdrop-blur-sm border border-white/10">
                                                        <Lock size={24} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Neue cleane Badge unten */}
                                        {isOwned && (
                                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 bg-[#18181b] border-2 border-white/20 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                                                {amount}x im Besitz
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {filteredCards.length === 0 && (
                <div className="py-20 text-center text-white/40 flex flex-col items-center gap-4 border-2 border-dashed border-white/10 rounded-3xl">
                    <Search size={48} className="opacity-20" />
                    <p>Keine Karten für diesen Filter gefunden.</p>
                </div>
            )}
        </div>

        {/* SIDEBAR FILTER & STATS */}
        <aside className="w-full lg:w-72 shrink-0 space-y-4 sticky top-6 order-1 lg:order-2">
          
          {/* Seltenheits Auswahl */}
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-2 shadow-xl">
            <div className="p-3 border-b border-white/5 mb-2">
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider">Nach Seltenheit filtern</h2>
            </div>
            <div className="space-y-1 p-2">
              <button 
                  onClick={() => setSelectedRarity("all")} 
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex justify-between items-center ${"all" === selectedRarity ? "bg-blue-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                  <span>Alle anzeigen</span>
                  {"all" === selectedRarity && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
              </button>
              
              {RARITY_ORDER.map((rarity) => (
                <button 
                    key={rarity} 
                    onClick={() => setSelectedRarity(rarity)} 
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex justify-between items-center ${rarity === selectedRarity ? "bg-white/10 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                >
                    <span className={RARITY_COLORS[rarity]}>{RARITY_LABELS[rarity]}</span>
                    {rarity === selectedRarity && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                </button>
              ))}
            </div>
          </div>

          {/* Mini-Stats Box */}
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3">
             <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Sammlungs-Status</h3>
             <div className="flex justify-between text-sm">
                 <span className="text-white/60">Einzigartige Katzen:</span>
                 <span className="font-bold text-white">{stats.unique}</span>
             </div>
             <div className="flex justify-between text-sm">
                 <span className="text-white/60">Doppelte Karten:</span>
                 <span className="font-bold text-yellow-400">{stats.duplicates}</span>
             </div>
             <div className="w-full bg-white/10 h-2 rounded-full mt-2 overflow-hidden">
                 <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (stats.unique / (stats.totalDef || 1)) * 100)}%` }}
                 ></div>
             </div>
          </div>
        </aside>

      </div>
    </div>
  );
}