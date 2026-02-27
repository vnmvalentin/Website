// src/pages/Card/CardCraftingPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { Anvil, ArrowUpCircle, Loader2 } from "lucide-react";

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
  const [userCards, setUserCards] = useState({ owned: {}, cardLevels: {} });
  const [casinoCredits, setCasinoCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [craftingId, setCraftingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

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
      setSuccessMsg("");
      try {
          const res = await fetch("/api/cards/idle/craft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardId }),
              credentials: "include"
          });
          const data = await res.json();
          if (res.ok) {
              setSuccessMsg(`Katze erfolgreich auf Level ${data.newLevel} aufgewertet!`);
              await fetchData();
              setTimeout(() => setSuccessMsg(""), 4000);
          }
      } catch(e) {}
      setCraftingId(null);
  };

  if (loading) return <div className="p-20 text-center text-white/50"><Loader2 className="animate-spin mx-auto mb-4" size={32} /> Lade Schmiede...</div>;

  // Filtern & Sortieren
  let craftableCards = Object.keys(userCards.owned || {})
      .filter(id => {
          const amount = userCards.owned[id] || 0;
          const level = (userCards.cardLevels && userCards.cardLevels[id]) ? userCards.cardLevels[id] : 1;
          return amount > 1 || level > 1;
      })
      .map(id => cardsDef.find(c => String(c.id) === String(id)))
      .filter(Boolean);

  craftableCards.sort((a, b) => {
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

      {successMsg && (
          <div className="bg-orange-500/20 border border-orange-500/50 text-orange-400 p-4 rounded-2xl font-black text-center text-xl shadow-[0_0_20px_rgba(249,115,22,0.3)] animate-pop-in">
              ⚒️ {successMsg}
          </div>
      )}

      {craftableCards.length === 0 ? (
          <div className="py-20 text-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl">
              <Anvil size={48} className="mx-auto mb-4 opacity-20" />
              <p>Du hast keine doppelten Karten, die du verschmelzen könntest.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {craftableCards.map(c => {
                  const upg = getUpgradeData(c.id, c.rarity);
                  const lvl = upg.isMax ? 5 : upg.currentLevel;

                  return (
                      <div key={c.id} className="bg-[#18181b] border border-white/10 rounded-3xl p-5 shadow-xl flex gap-5 items-center">
                          
                          {/* NEU: Karte und Badge getrennt, aber als Gruppe */}
                          <div className="w-[100px] sm:w-[120px] shrink-0 flex flex-col items-center gap-3">
                              <Card card={c} level={lvl} />
                              <div className="bg-green-500/10 border border-green-500/20 text-green-400 font-black text-xs px-2 py-1 rounded-full w-full text-center">
                                  +{getSingleCardDailyRate(c.rarity, lvl)}/d
                              </div>
                          </div>

                          <div className="flex-1 flex flex-col justify-between h-full">
                              <div>
                                  <h3 className="font-bold text-lg leading-tight mb-1">{c.name}</h3>
                                  {upg.isMax ? (
                                      <div className="text-yellow-400 text-sm font-black flex items-center gap-1 mt-2">
                                          ⭐ MAX LEVEL
                                      </div>
                                  ) : (
                                      <div className="text-white/60 text-xs font-medium space-y-2 mt-2">
                                          <div className="flex justify-between items-center">
                                              <span>Duplikate:</span>
                                              <span className={upg.canAffordDupes ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                                                  {upg.availableDupes} / {upg.cost.dupes}
                                              </span>
                                          </div>
                                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                              <div className={`h-full transition-all ${upg.canAffordDupes ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(100, (upg.availableDupes / upg.cost.dupes)*100)}%` }} />
                                          </div>

                                          <div className="flex justify-between items-center mt-3">
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
                                      className="w-full mt-4 bg-orange-600 hover:bg-orange-500 disabled:bg-white/5 disabled:text-white/20 text-white font-black py-2.5 rounded-xl transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2 text-sm"
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