// src/pages/Card/CardCraftingPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { Anvil, ArrowUpCircle, Loader2, Search, ArrowRight } from "lucide-react";

const CRAFT_COSTS = {
    common:    { dupes: [3, 4, 5, 6], coins: [50, 100, 200, 400] },
    uncommon:  { dupes: [2, 3, 4, 5], coins: [100, 250, 500, 1000] },
    rare:      { dupes: [2, 3, 3, 4], coins: [250, 500, 1000, 2000] },
    epic:      { dupes: [1, 2, 2, 3], coins: [500, 1000, 2500, 5000] },
    mythic:    { dupes: [1, 1, 2, 2], coins: [1000, 2500, 5000, 10000] },
    legendary: { dupes: [1, 1, 1, 1], coins: [5000, 10000, 25000, 50000] },
};

const IDLE_BASE_RATES = { common: 10, uncommon: 20, rare: 35, epic: 50, mythic: 100, legendary: 250};
const LEVEL_MULTIPLIERS = [1.0, 1.4, 1.9, 2.5, 3.2];

export default function CardCraftingPage() {
  const { user } = useContext(TwitchAuthContext);

  const [cardsDef, setCardsDef] = useState([]);
  const [userCards, setUserCards] = useState({ owned: {}, equipped: [], cardLevels: {} });
  const [casinoCredits, setCasinoCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [craftingId, setCraftingId] = useState(null);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRarity, setFilterRarity] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [showActiveOnly, setShowActiveOnly] = useState(false); // NEU: Checkbox State

  const fetchData = async () => {
    try {
      const [defRes, usrRes, casRes] = await Promise.all([
        fetch("/api/cards/def"),
        fetch("/api/cards/user", { credentials: "include" }),
        fetch("/api/casino/user", { credentials: "include" })
      ]);
      setCardsDef(await defRes.json());
      setUserCards(await usrRes.json());
      const cData = await casRes.json();
      if(cData.credits !== undefined) setCasinoCredits(cData.credits);
      setLoading(false);
    } catch(e) { console.error(e); }
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const getUpgradeData = (cardId, rarity) => {
      const levels = userCards.cardLevels || {};
      const currentLevel = levels[cardId] || 1;
      const amountOwned = (userCards.owned && userCards.owned[cardId]) ? userCards.owned[cardId] : 0;
      
      if (currentLevel >= 5) return { isMax: true };

      const costsTable = CRAFT_COSTS[rarity] || CRAFT_COSTS.common;
      const cost = {
          dupes: costsTable.dupes[currentLevel - 1],
          coins: costsTable.coins[currentLevel - 1]
      };

      const availableDupes = Math.max(0, amountOwned - 1);
      const canAffordDupes = availableDupes >= cost.dupes;
      const canAffordCoins = casinoCredits >= cost.coins;

      return {
          currentLevel,
          nextLevel: currentLevel + 1,
          cost,
          availableDupes,
          canAffordDupes,
          canAffordCoins,
          canCraft: canAffordDupes && canAffordCoins
      };
  };

  const getSingleCardDailyRate = (rarity, level) => {
      const base = IDLE_BASE_RATES[rarity] || 10;
      return Math.floor(base * (LEVEL_MULTIPLIERS[level - 1] || 1.0)); 
  };

  const handleCraft = async (cardId) => {
      setCraftingId(cardId);
      try {
          const res = await fetch("/api/cards/idle/craft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardId }),
              credentials: "include"
          });
          if (res.ok) {
              await fetchData();
          }
      } catch(e) {}
      setCraftingId(null);
  };

  if (loading) return <div className="p-20 text-center text-white/50"><Loader2 className="animate-spin mx-auto mb-4" size={32} /> Lade Schmiede...</div>;

  let craftableCards = Object.keys(userCards.owned || {})
      .filter(id => {
          const amount = userCards.owned[id] || 0;
          const level = (userCards.cardLevels && userCards.cardLevels[id]) ? userCards.cardLevels[id] : 1;
          return amount > 1 || level > 1;
      })
      .map(id => cardsDef.find(c => String(c.id) === String(id)))
      .filter(Boolean);

  craftableCards = craftableCards.filter(c => {
      // NEU: Checkbox Logik
      if (showActiveOnly && !(userCards.equipped || []).includes(String(c.id))) return false;
      
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
      
      const lvl = (userCards.cardLevels && userCards.cardLevels[c.id]) || 1;
      if (filterLevel !== "all" && String(lvl) !== filterLevel) return false;
      
      return true;
  });

  craftableCards.sort((a, b) => {
      // Sortierung nach "Aktiv" entfernt
      const upgA = getUpgradeData(a.id, a.rarity);
      const upgB = getUpgradeData(b.id, b.rarity);
      
      if (upgA.isMax !== upgB.isMax) return upgA.isMax ? 1 : -1;
      if (upgA.canCraft !== upgB.canCraft) return upgA.canCraft ? -1 : 1;
      if (upgA.canAffordDupes !== upgB.canAffordDupes) return upgA.canAffordDupes ? -1 : 1;
      
      const progressA = upgA.availableDupes / (upgA.cost?.dupes || 1);
      const progressB = upgB.availableDupes / (upgB.cost?.dupes || 1);
      if (progressA !== progressB) return progressB - progressA;
      
      return 0;
  });

  return (
    <div className="w-full space-y-8 animate-in fade-in pb-10">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Anvil className="text-orange-400" size={32} /> Die Schmiede
          </h1>
          <p className="text-white/50 mt-1">
            Verbrenne doppelte Karten und investiere Coins, um deine Katzen im Level aufsteigen zu lassen.<br/>
            Höheres Level = <span className="text-orange-400 font-bold">Exponentiell mehr Produktion pro Tag!</span>
          </p>
        </div>
        <div className="bg-black/40 border border-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-3">
            <div className="text-right">
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Wallet</p>
                <p className="text-xl font-mono font-bold text-yellow-400">{casinoCredits.toLocaleString()}</p>
            </div>
            <CoinIcon className="w-8 h-8 text-yellow-500" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full bg-[#18181b] p-4 rounded-2xl border border-white/10 shadow-lg">
          <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input 
                  type="text" 
                  placeholder="Katze suchen..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
          </div>
          
          <select 
              value={filterRarity} 
              onChange={(e) => setFilterRarity(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
          >
              <option value="all">Alle Seltenheiten</option>
              {Object.keys(IDLE_BASE_RATES).map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
          </select>

          <select 
              value={filterLevel} 
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
          >
              <option value="all">Alle Level</option>
              {[1,2,3,4,5].map(l => (
                  <option key={l} value={String(l)}>Level {l}</option>
              ))}
          </select>

          {/* NEU: Checkbox für Aktive Karten */}
          <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 hover:border-orange-500/50 transition-colors select-none">
              <input 
                  type="checkbox" 
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
              />
              <span className="whitespace-nowrap">Nur Aktive</span>
          </label>
      </div>

      {craftableCards.length === 0 ? (
          <div className="py-20 text-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl">
              <Anvil size={48} className="mx-auto mb-4 opacity-20" />
              <p>Keine Karten gefunden, die deinen Kriterien entsprechen.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
              {craftableCards.map(c => {
                  const upg = getUpgradeData(c.id, c.rarity);
                  const lvl = upg.isMax ? 5 : upg.currentLevel;
                  const isEquipped = (userCards.equipped || []).includes(String(c.id));

                  return (
                      <div key={c.id} className={`bg-[#18181b] border ${isEquipped ? 'border-orange-500/30' : 'border-white/10'} rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row gap-5 items-center sm:items-stretch relative overflow-hidden`}>
                          
                          {isEquipped && <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -z-0"></div>}

                          <div className="w-[120px] shrink-0 flex flex-col items-center gap-3 relative z-10">
                              <Card card={c} level={lvl} />
                              <div className="bg-green-500/10 border border-green-500/20 text-green-400 font-black text-xs px-2 py-1 rounded-full w-full text-center">
                                  +{getSingleCardDailyRate(c.rarity, lvl)}/d
                              </div>
                          </div>

                          <div className="w-full sm:flex-1 flex flex-col justify-between h-full relative z-10">
                              <div>
                                  {/* Badge entfernt, nur noch der Name steht hier */}
                                  <div className="mb-2">
                                      <h3 className="font-bold text-lg leading-tight">{c.name}</h3>
                                  </div>

                                  {upg.isMax ? (
                                      <div className="text-yellow-400 text-sm font-black flex items-center gap-1 mt-2 bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20 w-fit">
                                          ⭐ MAX LEVEL
                                      </div>
                                  ) : (
                                      <div className="text-white/60 text-xs font-medium space-y-2 mt-2">
                                          
                                          <div className="flex flex-wrap justify-between items-center bg-black/30 p-2.5 rounded-lg border border-white/5 mb-3 gap-2">
                                              <span className="text-white/60 text-xs">Aufwertung:</span>
                                              <span className="font-black text-sm flex items-center gap-1.5 text-orange-400 whitespace-nowrap">
                                                  Lvl {upg.currentLevel} <ArrowRight size={14} /> Lvl {upg.nextLevel}
                                              </span>
                                          </div>

                                          <div className="flex flex-wrap justify-between items-center gap-2">
                                              <span>Duplikate:</span>
                                              <span className={upg.canAffordDupes ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                                                  {upg.availableDupes} / {upg.cost.dupes}
                                              </span>
                                          </div>
                                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                                              <div className={`h-full transition-all ${upg.canAffordDupes ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(100, (upg.availableDupes / upg.cost.dupes)*100)}%` }} />
                                          </div>

                                          <div className="flex flex-wrap justify-between items-center mt-3 gap-2">
                                              <span>Kosten:</span>
                                              <span className={`flex items-center gap-1 ${upg.canAffordCoins ? "text-yellow-400" : "text-red-400"}`}>
                                                  {upg.cost.coins} <CoinIcon className="w-3 h-3" />
                                              </span>
                                          </div>
                                      </div>
                                  )}
                              </div>

                              {!upg.isMax && (
                                  <button 
                                      onClick={() => handleCraft(c.id)}
                                      disabled={!upg.canCraft || craftingId === c.id}
                                      className="w-full mt-4 bg-orange-600 hover:bg-orange-500 disabled:bg-white/5 disabled:text-white/20 text-white font-black py-2.5 rounded-xl transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2 text-sm shrink-0"
                                  >
                                      {craftingId === c.id ? <><Loader2 className="animate-spin" size={16}/> Schmiede...</> : <><ArrowUpCircle size={16} /> Aufwerten</>}
                                  </button>
                              )}
                          </div>
                      </div>
                  );
              })}
          </div>
      )}
    </div>
  );
}