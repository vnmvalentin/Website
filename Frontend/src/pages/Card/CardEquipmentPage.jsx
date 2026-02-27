// src/pages/Card/CardEquipmentPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { Sword, Save, Coins, Zap, Shield, Loader2, X, AlertTriangle } from "lucide-react";

const IDLE_BASE_RATES = { common: 10, uncommon: 20, rare: 35, epic: 50, mythic: 100, legendary: 250};
const MAX_BANK_DAYS = 5; // Synchron mit Backend! Bank voll nach 5 Tagen
const LEVEL_MULTIPLIERS = [1.0, 1.4, 1.9, 2.5, 3.2];

const CAT_SETS = [
    { id: "heroes", name: "Die Helden", cats: ["13", "50", "51"], bonus: 100 },
    { id: "elements", name: "Elemente", cats: ["25", "70", "71"], bonus: 100 },
    { id: "heavenhell", name: "Himmel & Hölle", cats: ["43", "44"], bonus: 200 },
    { id: "sweet", name: "Süße Katzen", cats: ["75", "77", "74"], bonus: 250 },
    { id: "gems", name: "Edelsteine", cats: ["73", "40", "79"], bonus: 300 },
    { id: "dn", name: "Tag & Nacht", cats: ["48", "63"], bonus: 500 },
    { id: "yy", name: "Yin & Yang", cats: ["67", "68"], bonus: 1500},
    { id: "flower", name: "Flowerpower", cats: ["32", "34", "57", "82"], bonus: 1500 }
];

export default function CardEquipmentPage() {
  const { user } = useContext(TwitchAuthContext);

  const [cardsDef, setCardsDef] = useState([]);
  const [userCards, setUserCards] = useState({ owned: {}, equipped: [], cardLevels: {}, lastClaimed: Date.now(), unclaimedCoins: 0 });
  const [casinoCredits, setCasinoCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const [equipped, setEquipped] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  const [bankBalance, setBankBalance] = useState(0);
  const [dailyRate, setDailyRate] = useState({ base: 0, total: 0, setBonusTotal: 0, activeSets: [] });

  const fetchData = async () => {
    try {
      const [defRes, usrRes, casRes] = await Promise.all([
        fetch("/api/cards/def"),
        fetch("/api/cards/user", { credentials: "include" }),
        fetch("/api/casino/user", { credentials: "include" })
      ]);
      const defs = await defRes.json();
      const uCards = await usrRes.json();
      const cData = await casRes.json();

      setCardsDef(defs);
      setUserCards(uCards);
      setEquipped(uCards.equipped || []);
      if(cData.credits !== undefined) setCasinoCredits(cData.credits);
      
      calculateRate(uCards.equipped || [], uCards.cardLevels || {}, defs);
      setLoading(false);
    } catch(e) { console.error(e); }
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const calculateRate = (eq, levels, defs) => {
      let baseRate = 0;
      const safeLevels = levels || {};

      eq.forEach(id => {
         const def = defs.find(c => String(c.id) === String(id));
         if (def) {
             const base = IDLE_BASE_RATES[def.rarity] || 10;
             const lvl = safeLevels[id] || 1;
             baseRate += (base * (LEVEL_MULTIPLIERS[lvl - 1] || 1.0));
         }
      });

      let setBonusTotal = 0;
      let activeSets = [];

      CAT_SETS.forEach(set => {
          if (set.cats.every(catId => eq.includes(String(catId)))) {
              setBonusTotal += set.bonus;
              activeSets.push(set.id);
          }
      });

      setDailyRate({ 
          base: Math.floor(baseRate), 
          total: Math.floor(baseRate + setBonusTotal), 
          setBonusTotal, 
          activeSets 
      });
  };

  // Kein sekündlicher Ticker mehr, sondern eine ruhige, statische Berechnung
  // Aktualisiert sich nur beim Laden oder alle 60 Sekunden unbemerkt
  useEffect(() => {
      if (loading || dailyRate.total === 0 || claiming) return;
      
      const updateBank = () => {
          const now = Date.now();
          const daysPassed = (now - (userCards.lastClaimed || now)) / (1000 * 60 * 60 * 24);
          const maxCapacity = MAX_BANK_DAYS * dailyRate.total;
          const currentTotal = Math.min(maxCapacity, (userCards.unclaimedCoins || 0) + (daysPassed * dailyRate.total));
          setBankBalance(currentTotal);
      };

      updateBank(); // Direkt beim Start
      const interval = setInterval(updateBank, 60000); // 1x pro Minute prüfen reicht völlig!
      return () => clearInterval(interval);
  }, [dailyRate, userCards, loading, claiming]);

  const handleSaveEquip = async () => {
      setSaving(true);
      try {
          const res = await fetch("/api/cards/idle/equip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ equipped }),
              credentials: "include"
          });
          if(res.ok) {
              await fetchData();
              setIsEditing(false);
          }
      } catch(e) { console.error(e); }
      setSaving(false);
  };

  const handleClaim = async () => {
      const amountToClaim = Math.floor(bankBalance);
      if (amountToClaim < 1 || claiming) return;
      
      setClaiming(true);
      setBankBalance(0); 

      try {
          const res = await fetch("/api/cards/idle/claim", { method: "POST", credentials: "include" });
          const data = await res.json();
          if (res.ok) {
              setClaimMessage(`+${data.claimed} Coins abgehoben!`);
              await fetchData();
              setTimeout(() => setClaimMessage(""), 4000);
          }
      } catch(e) {}
      setClaiming(false);
  };

  const toggleEquip = (id) => {
      if (equipped.includes(id)) {
          const newEq = equipped.filter(e => e !== id);
          setEquipped(newEq);
          calculateRate(newEq, userCards.cardLevels || {}, cardsDef);
      } else {
          if (equipped.length >= 5) return;
          const newEq = [...equipped, id];
          setEquipped(newEq);
          calculateRate(newEq, userCards.cardLevels || {}, cardsDef);
      }
  };

  const getCatNamesForSet = (catIds) => {
      return catIds.map(id => {
          const cat = cardsDef.find(c => String(c.id) === String(id));
          return cat ? cat.name : `Katze #${id}`;
      }).join(", ");
  };

  const getSingleCardDailyRate = (cardId, rarity) => {
      const base = IDLE_BASE_RATES[rarity] || 10;
      const lvl = (userCards.cardLevels && userCards.cardLevels[cardId]) || 1;
      return Math.floor(base * (LEVEL_MULTIPLIERS[lvl - 1] || 1.0));
  };

  if (loading) return <div className="p-20 text-center text-white/50"><Loader2 className="animate-spin mx-auto mb-4" size={32} /> Lade Einsatztruppe...</div>;

  const ownedCards = Object.keys(userCards.owned || {})
        .filter(id => userCards.owned[id] > 0)
        .map(id => cardsDef.find(c => String(c.id) === String(id)))
        .filter(Boolean);

  const maxBankCapacity = dailyRate.total * MAX_BANK_DAYS;
  const isBankFull = Math.floor(bankBalance) >= maxBankCapacity && maxBankCapacity > 0;

  return (
    <div className="w-full space-y-8 animate-in fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Sword className="text-red-500" size={32} /> Einsatztruppe
          </h1>
          <p className="text-white/50 mt-1">
            Rüste bis zu 5 Katzen aus, um pro Tag passiv Coins zu generieren. <br/>
            Kombiniere bestimmte Katzen für massive <span className="text-yellow-400 font-bold">Set-Boni!</span>
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

      {claimMessage && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-400 p-4 rounded-2xl font-black text-center text-xl shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-pop-in">
              🎉 {claimMessage}
          </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          <div className="xl:col-span-2 space-y-6">
              <div className="bg-[#18181b] border border-white/10 p-6 rounded-3xl shadow-xl">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold">Aktuelle Aufstellung</h2>
                      {isEditing ? (
                          <button onClick={handleSaveEquip} disabled={saving} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95">
                              <Save size={18} /> {saving ? "Speichert..." : "Speichern"}
                          </button>
                      ) : (
                          <button onClick={() => setIsEditing(true)} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold transition-all active:scale-95">
                              Bearbeiten
                          </button>
                      )}
                  </div>

                  <div className="flex flex-wrap justify-center gap-4">
                      {[0,1,2,3,4].map(idx => {
                          const cardId = equipped[idx];
                          const cardDef = cardId ? cardsDef.find(c => String(c.id) === String(cardId)) : null;
                          
                          return (
                              <div key={idx} className="flex flex-col items-center gap-3">
                                  <div className="w-[120px] sm:w-[140px] md:w-[160px] shrink-0 aspect-[1/1.42] bg-black/40 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center relative transition-all">
                                      {cardDef ? (
                                          <div className="w-full h-full p-2 relative">
                                              <Card card={cardDef} level={(userCards.cardLevels && userCards.cardLevels[cardDef.id]) || 1} />
                                              {isEditing && (
                                                  <button onClick={() => toggleEquip(cardDef.id)} className="absolute -top-1 -right-1 bg-red-500 text-white p-2 rounded-full shadow-xl hover:scale-110 transition-transform z-20">
                                                      <X size={16} />
                                                  </button>
                                              )}
                                          </div>
                                      ) : (
                                          <div className="text-white/20 text-center font-bold">Slot {idx+1}</div>
                                      )}
                                  </div>
                                  
                                  {/* NEU: Badge unter der Karte */}
                                  {cardDef && (
                                      <div className="bg-green-500/10 border border-green-500/20 text-green-400 font-black text-xs px-3 py-1.5 rounded-full shadow-lg">
                                          +{getSingleCardDailyRate(cardDef.id, cardDef.rarity)}/d
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                  </div>
              </div>

              <div className="bg-[#18181b] border border-white/10 p-6 rounded-3xl shadow-xl">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Shield className="text-blue-400" size={20}/> Set-Boni</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {CAT_SETS.map(set => {
                          const isActive = dailyRate.activeSets.includes(set.id);
                          return (
                              <div key={set.id} className={`p-4 rounded-xl border ${isActive ? 'bg-blue-500/10 border-blue-500/50' : 'bg-black/20 border-white/5'} flex justify-between items-center transition-colors`}>
                                  <div>
                                      <h3 className={`font-bold ${isActive ? 'text-blue-400' : 'text-white/70'}`}>{set.name}</h3>
                                      <p className="text-xs text-white/40 mt-1">Benötigt: {getCatNamesForSet(set.cats)}</p>
                                  </div>
                                  <div className={`font-black ${isActive ? 'text-green-400' : 'text-white/30'}`}>
                                      +{set.bonus}/d
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              </div>
          </div>

          <div className="bg-[#18181b] border border-white/10 p-6 rounded-3xl shadow-xl flex flex-col justify-between h-fit xl:sticky xl:top-24">
              <div>
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Zap className="text-yellow-400" /> Tägliche Produktion</h2>
                  
                  <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center text-white/60 font-medium">
                          <span>Karten Basis:</span>
                          <span>{dailyRate.base} <CoinIcon className="w-3 h-3 inline"/> /d</span>
                      </div>
                      <div className={`flex justify-between items-center font-bold ${dailyRate.setBonusTotal > 0 ? "text-yellow-400" : "text-white/30"}`}>
                          <span>Set-Bonus:</span>
                          <span>+{dailyRate.setBonusTotal} <CoinIcon className="w-3 h-3 inline"/> /d</span>
                      </div>
                      <div className="h-px w-full bg-white/10 my-2" />
                      <div className="flex justify-between items-center text-lg font-black text-white">
                          <span>Gesamt (Tag):</span>
                          <span className="text-green-400">+{dailyRate.total} <CoinIcon className="w-4 h-4 inline"/> /d</span>
                      </div>
                  </div>
              </div>

              <div className={`bg-black/30 border p-6 rounded-2xl text-center transition-colors ${isBankFull ? 'border-red-500/50' : 'border-white/5'}`}>
                  {isBankFull && (
                      <div className="text-red-400 text-xs font-black uppercase tracking-wider mb-2 flex items-center justify-center gap-1 animate-pulse">
                          <AlertTriangle size={14} /> Bank voll! (Limit: {MAX_BANK_DAYS} Tage)
                      </div>
                  )}
                  {!isBankFull && <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Auf der Bank</p>}
                  
                  <div className={`text-4xl font-mono font-black mb-2 ${isBankFull ? 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.3)]' : 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]'}`}>
                      {Math.floor(bankBalance).toLocaleString()}
                  </div>

                  {/* NEU: Fortschrittsbalken & Kapazitätsanzeige */}
                  {maxBankCapacity > 0 && (
                      <div className="mb-6 space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">
                              <span>Kapazität</span>
                              <span>{Math.floor(bankBalance).toLocaleString()} / {maxBankCapacity.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden border border-white/5">
                              <div 
                                  className={`h-full transition-all duration-1000 ${isBankFull ? 'bg-red-500' : 'bg-yellow-400'}`} 
                                  style={{ width: `${Math.min(100, (bankBalance / maxBankCapacity) * 100)}%` }} 
                              />
                          </div>
                      </div>
                  )}
                  
                  <button 
                      onClick={handleClaim}
                      disabled={Math.floor(bankBalance) < 1 || isEditing || claiming}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-white/5 disabled:text-white/20 text-black font-black py-4 rounded-xl shadow-lg shadow-yellow-900/20 transition-all active:scale-95 flex justify-center items-center gap-2"
                  >
                      {claiming ? <Loader2 className="animate-spin" size={20} /> : <Coins size={20} />} 
                      {claiming ? "Wird abgeholt..." : "Einsammeln"}
                  </button>
              </div>
          </div>
      </div>

      {isEditing && (
          <div className="bg-[#18181b] border border-red-500/30 p-6 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-8">
              <h2 className="text-xl font-bold mb-6">Wähle deine Katzen</h2>
              <div className="flex flex-wrap gap-6 justify-center sm:justify-start">
                  {ownedCards.map(c => {
                      const isSelected = equipped.includes(c.id);
                      const lvl = (userCards.cardLevels && userCards.cardLevels[c.id]) || 1;

                      return (
                          <div key={c.id} className="flex flex-col items-center gap-2">
                              <div 
                                  onClick={() => toggleEquip(c.id)}
                                  className={`w-[120px] sm:w-[140px] shrink-0 cursor-pointer transition-transform hover:scale-105 rounded-xl overflow-hidden relative ${isSelected ? "ring-4 ring-red-500 opacity-50" : ""}`}
                              >
                                  <Card card={c} level={lvl} />
                                  {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-black/50 font-black text-white text-xl z-20 backdrop-blur-sm">Ausgerüstet</div>}
                              </div>
                              <div className="bg-green-500/10 border border-green-500/20 text-green-400 font-black text-[10px] px-2 py-0.5 rounded-full">
                                  +{getSingleCardDailyRate(c.id, c.rarity)}/d
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}
    </div>
  );
}