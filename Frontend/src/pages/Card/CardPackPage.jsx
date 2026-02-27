// src/pages/Card/CardPackPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { MessageSquare, Gift, Sparkles, Loader2, Hand } from "lucide-react";

const PACK_PRICE = 250; 
const PACK_ART_URL = "/assets/pack.png"; 
const DISCORD_URL = "https://discord.gg/V38GBSVNeh";

const RARITY_ORDER = [
  "common", "uncommon", "rare", "epic", "mythic", "legendary"
];

const RARITY_LABELS = { 
    common: "Gewöhnlich", 
    uncommon: "Ungewöhnlich", 
    rare: "Selten", 
    epic: "Episch", 
    mythic: "Mythisch", 
    legendary: "Legendär",
};

// Nur noch Leuchten, kein Text und kein bg-black!
const RARITY_GLOW = {
    common: "shadow-gray-500/20",
    uncommon: "shadow-green-500/30",
    rare: "shadow-blue-500/40",
    epic: "shadow-purple-500/50 ring-2 ring-purple-500",
    mythic: "shadow-pink-500/60 ring-2 ring-pink-500 animate-pulse",
    legendary: "shadow-yellow-400/80 ring-4 ring-yellow-400 animate-pulse"
};

const RARITY_TEXT = {
    common: "text-gray-400",
    uncommon: "text-green-400",
    rare: "text-blue-400",
    epic: "text-purple-400",
    mythic: "text-pink-400",
    legendary: "text-yellow-400"
};

export default function CardPackPage() {
  const { user } = useContext(TwitchAuthContext);

  const [credits, setCredits] = useState(0);
  const [userCards, setUserCards] = useState({ owned: {} });
  const [cardsDef, setCardsDef] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [buyingPack, setBuyingPack] = useState(false);
  const [error, setError] = useState("");

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pack, setPack] = useState(null);
  const [packPhase, setPackPhase] = useState("idle"); 
  const [currentCardIdx, setCurrentCardIdx] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/cards/def").then(r => r.json()),
      fetch("/api/cards/user", { credentials: "include" }).then(r => r.json()),
      fetch("/api/casino/user", { credentials: "include" }).then(r => r.json())
    ]).then(([defData, cardData, casinoData]) => {
      setCardsDef(defData || []);
      setUserCards(cardData || { owned: {} });
      if (casinoData && casinoData.credits !== undefined) {
          setCredits(casinoData.credits);
      }
      setLoading(false);
    }).catch(e => {
        console.error("Fehler beim Laden", e);
        setLoading(false);
    });
  }, [user]);

  const openPack = async () => {
    if (credits < PACK_PRICE) {
        setError("Nicht genug Coins!");
        setTimeout(() => setError(""), 3000);
        return;
    }

    setError("");
    setBuyingPack(true);
    
    try {
      const res = await fetch("/api/cards/open", { method: "POST", credentials: "include" });
      const data = await res.json();
      
      if (!res.ok) {
        setBuyingPack(false);
        setError(data.error || "Fehler beim Öffnen.");
        return;
      }

      data.cards.sort((a, b) => {
          return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      });

      setPack(data);
      setCredits(data.newCredits);
      setBuyingPack(false);
      setPackPhase("closed");
      setOverlayOpen(true);

      fetch("/api/cards/user", { credentials: "include" })
        .then(r => r.json())
        .then(uData => setUserCards(uData));

    } catch (e) {
      setBuyingPack(false);
      setError("Netzwerkfehler.");
    }
  };

  const handleTearPack = () => {
      if (packPhase !== "closed") return;
      setPackPhase("shaking");
      setTimeout(() => {
          setPackPhase("revealing");
          setCurrentCardIdx(0);
      }, 1200);
  };

  const handleNextCard = () => {
      if (packPhase !== "revealing") return;
      if (currentCardIdx < pack.cards.length - 1) {
          setCurrentCardIdx(prev => prev + 1);
      } else {
          setPackPhase("summary");
      }
  };

  const closeOverlay = () => {
    setOverlayOpen(false);
    setPack(null);
    setPackPhase("idle");
  };

  const getLastPackCards = () => {
    if (!userCards.lastPack || !userCards.lastPack.cardIds) return [];
    return userCards.lastPack.cardIds
      .map(id => cardsDef.find(c => String(c.id) === String(id)))
      .filter(Boolean);
  };

  if (loading) return <div className="text-center text-white/50 p-20 flex flex-col items-center gap-4"><Loader2 className="animate-spin text-violet-500" size={32} /> Lade Pack-Station...</div>;

  const lastCards = getLastPackCards();

  return (
    <div className="w-full space-y-8">
      
      <style>{`
        @keyframes shake-pack {
          0%, 100% { transform: rotate(0deg) scale(1.1); }
          25% { transform: rotate(-5deg) scale(1.1); }
          50% { transform: rotate(5deg) scale(1.1); }
          75% { transform: rotate(-5deg) scale(1.1); }
        }
        .animate-shake-pack { animation: shake-pack 0.3s ease-in-out infinite; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        @keyframes pop-in {
          0% { transform: scale(0.5) translateY(50px); opacity: 0; }
          60% { transform: scale(1.1) translateY(-10px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      <div className="bg-[#18181b] rounded-3xl p-6 md:p-10 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-40 bg-violet-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 p-40 bg-fuchsia-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex items-center justify-between w-full mb-8">
                <h1 className="text-3xl md:text-4xl font-black text-white flex items-center gap-3">
                    <Gift className="text-violet-400" size={36} /> Shop
                </h1>
                <div className="bg-black/40 border border-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-sm">
                    <div className="text-right">
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Dein Guthaben</p>
                        <p className="text-xl font-mono font-bold text-yellow-400 leading-none">{credits.toLocaleString()}</p>
                    </div>
                    <CoinIcon className="w-8 h-8 text-yellow-500 drop-shadow-md" />
                </div>
            </div>

            <div className="flex flex-col items-center mt-4">
                <div className="relative transition-all duration-300 hover:scale-105 hover:drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                    <img src={PACK_ART_URL} alt="Karten Pack" className="w-48 md:w-64 h-auto object-contain" />
                </div>

                {error && (
                    <div className="mt-6 text-red-400 bg-red-500/10 px-4 py-2 rounded-xl font-bold border border-red-500/20 animate-in fade-in">
                        {error}
                    </div>
                )}

                <button 
                    onClick={openPack}
                    disabled={buyingPack || credits < PACK_PRICE}
                    className="mt-8 relative group overflow-hidden bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-violet-900/20 transition-all active:scale-95 flex items-center gap-3"
                >
                    <span className="relative z-10 flex items-center gap-3">
                        {buyingPack ? "Lade..." : "Pack kaufen"} <span className="flex items-center gap-1 bg-black/30 px-3 py-1 rounded-lg text-yellow-400">{PACK_PRICE} <CoinIcon size="w-4 h-4"/></span>
                    </span>
                    {!buyingPack && credits >= PACK_PRICE && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                    )}
                </button>
            </div>
        </div>
      </div>

      {lastCards.length > 0 && (
          <div className="bg-[#18181b] rounded-3xl p-6 border border-white/10 shadow-lg overflow-hidden">
              <h3 className="font-bold text-white/50 uppercase tracking-wider text-sm mb-4">Dein letztes Pack</h3>
              <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                  {lastCards.map((c, i) => (
                    <div key={i} className="opacity-70 hover:opacity-100 transition-opacity w-[150px] h-[240px] flex justify-center rounded-xl">
                        <div className="scale-[0.62] origin-top">
                            <div className="w-[240px]">
                                <Card card={c} />
                            </div>
                        </div>
                    </div>
                ))}
              </div>
          </div>
      )}

      {overlayOpen && pack && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md overflow-y-auto overflow-x-hidden select-none">
          <div className="fixed inset-0 pointer-events-none flex justify-center items-center opacity-30">
              <Sparkles size={600} className="text-yellow-500 animate-[spin_15s_linear_infinite]" />
          </div>

          <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4 relative z-10">
            <div className="m-auto flex flex-col items-center w-full max-w-5xl">

                {(packPhase === "closed" || packPhase === "shaking") && (
                    <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-300">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-12 drop-shadow-lg text-center mt-4">
                            Klicke zum Öffnen!
                        </h2>
                        <img 
                            src={PACK_ART_URL} 
                            alt="Pack" 
                            onClick={handleTearPack}
                            className={`w-64 md:w-80 cursor-pointer transition-transform hover:scale-110 drop-shadow-[0_0_30px_rgba(139,92,246,0.6)] ${packPhase === 'shaking' ? 'animate-shake-pack' : ''}`}
                        />
                    </div>
                )}

                {packPhase === "revealing" && (
                    <div 
                        className="fixed inset-0 z-20 flex flex-col items-center justify-center cursor-pointer" 
                        onClick={handleNextCard}
                    >
                        {(() => {
                            const currentCard = pack.cards[currentCardIdx];
                            const glowClass = RARITY_GLOW[currentCard.rarity] || "shadow-white/10";
                            const textColor = RARITY_TEXT[currentCard.rarity] || "text-white";

                            return (
                                <div key={currentCardIdx} className="flex flex-col items-center animate-pop-in mt-6">
                                    <div className="mb-10 text-center">
                                        <span className={`text-2xl md:text-4xl uppercase font-black tracking-widest drop-shadow-lg ${textColor}`}>
                                            {RARITY_LABELS[currentCard.rarity]}
                                        </span>
                                    </div>
                                    
                                    {/* FIX: Feste Breite (w-[240px]), kein bg-black mehr! */}
                                    <div className={`relative rounded-[16px] shadow-2xl ${glowClass} scale-125 md:scale-150 transition-all w-[240px] mx-auto`}>
                                        <Card card={currentCard} />
                                    </div>

                                    <div className="mt-32 md:mt-40 text-white/50 animate-pulse text-sm md:text-base font-medium bg-black/40 px-6 py-2 rounded-full backdrop-blur-md">
                                        Klicke irgendwo für die nächste Karte...
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {packPhase === "summary" && (
                    <div className="relative z-20 w-full flex flex-col items-center animate-in slide-in-from-bottom-10 fade-in duration-500">
                        <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest mb-10 drop-shadow-lg text-center mt-4">
                            Pack Inhalt
                        </h2>
                        
                        <div className="flex flex-wrap justify-center gap-6 md:gap-8 w-full">
                            {pack.cards.map((c, idx) => {
                                const glowClass = RARITY_GLOW[c.rarity] || "shadow-white/10";
                                const textColor = RARITY_TEXT[c.rarity] || "text-white";
                                
                                return (
                                    <div 
                                        key={idx} 
                                        className="transform transition-all duration-300 hover:scale-110 hover:z-30 hover:-translate-y-4 flex flex-col items-center"
                                    >
                                        {/* FIX: Feste Breite (w-[240px]), kein bg-black mehr! */}
                                        <div className={`relative rounded-[16px] shadow-2xl ${glowClass} w-[240px] mx-auto`}>
                                            <Card card={c} />
                                        </div>
                                        <div className="text-center mt-4">
                                            <span className={`text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded bg-black/50 backdrop-blur-md border border-white/10 ${textColor}`}>
                                                {RARITY_LABELS[c.rarity]}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mt-16 mb-4">
                            <button onClick={closeOverlay} className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold border border-white/10 transition-colors text-white">
                                Ins Album legen
                            </button>
                            {credits >= PACK_PRICE && (
                                <button 
                                    onClick={() => { closeOverlay(); openPack(); }} 
                                    className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:scale-105 transition-transform flex items-center gap-2 group"
                                >
                                    <Gift size={18} className="group-hover:rotate-12 transition-transform" />
                                    Noch eins ({PACK_PRICE}<CoinIcon size="w-4 h-4" />)
                                </button>
                            )}
                        </div>
                    </div>
                )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}