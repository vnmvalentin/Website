// src/pages/Card/CardPackPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { Gift, Loader2, Layers } from "lucide-react";

const PACK_PRICE = 250; 
const PACK_ART_URL = "/assets/pack.png"; 

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

const RARITY_GLOW = {
    common: "shadow-gray-500/20",
    uncommon: "shadow-green-500/30",
    rare: "shadow-blue-500/40",
    epic: "shadow-purple-500/50 ring-2 ring-purple-500",
    mythic: "shadow-pink-500/60 ring-2 ring-pink-500 animate-pulse",
    legendary: "shadow-yellow-400/80 ring-4 ring-yellow-400 animate-pulse"
};

/** Ruhigeres Leuchten für Raster mit vielen Karten (bessere FPS) */
const RARITY_GLOW_STATIC = {
    common: "shadow-gray-500/20",
    uncommon: "shadow-green-500/30",
    rare: "shadow-blue-500/40",
    epic: "shadow-purple-500/50 ring-2 ring-purple-500/80",
    mythic: "shadow-pink-500/50 ring-2 ring-pink-500/80",
    legendary: "shadow-yellow-400/70 ring-2 ring-yellow-400/90"
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
  
  // FIX: Snapshot State, um zu wissen, welche Karten vor dem Pull "Neu" waren
  const [prePullOwned, setPrePullOwned] = useState({});
  
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

  // FIX: Preloader Funktion für flüssige Animationen
  const preloadCardImages = async (cardsList) => {
    const promises = cardsList.map(c => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // Falls ein Bild fehlt, blockiert es nicht alles
        
        // ACHTUNG: Passe diesen Pfad so an, wie dein <Card /> Element die Bilder lädt!
        // Beispiel: c.image, c.url, oder `/assets/cats/${c.id}.png`
        img.src = c.image || `/assets/cards/${c.id}.png`; 
      });
    });
    await Promise.all(promises);
  };

  const openPack = async () => {
    if (credits < PACK_PRICE) {
        setError("Nicht genug Coins!");
        setTimeout(() => setError(""), 3000);
        return;
    }

    setError("");
    setBuyingPack(true);
    setPrePullOwned({ ...userCards.owned }); // Snapshot speichern für "NEU" Badge
    
    try {
      const res = await fetch("/api/cards/open", { method: "POST", credentials: "include" });
      const data = await res.json();
      
      if (!res.ok) {
        setBuyingPack(false);
        setError(data.error || "Fehler beim Öffnen.");
        return;
      }

      data.cards.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));

      // Lade die Bilder vor, bevor das Overlay öffnet
      await preloadCardImages(data.cards);

      setPack({ isMulti: false, cards: data.cards });
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

  const openTenPacks = async () => {
    const cost = PACK_PRICE * 10;
    if (credits < cost) {
        setError("Nicht genug Coins für 10 Packs!");
        setTimeout(() => setError(""), 3000);
        return;
    }

    setError("");
    setBuyingPack(true);
    setPrePullOwned({ ...userCards.owned });
    
    try {
      const res = await fetch("/api/cards/open", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Öffnen der Packs.");
      }
      const data = await res.json();
      const allPacks = (data.packs || []).map((packCards) =>
        [...packCards].sort(
          (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
        )
      );
      const allCardsFlat = allPacks.flat();
      await preloadCardImages(allCardsFlat);

      setPack({ isMulti: true, packs: allPacks });
      setCredits(data.newCredits);
      setBuyingPack(false);
      setPackPhase("closed");
      setOverlayOpen(true);

      fetch("/api/cards/user", { credentials: "include" })
        .then((r) => r.json())
        .then((uData) => setUserCards(uData));
    } catch (e) {
      setBuyingPack(false);
      setError(e.message || "Netzwerkfehler.");
    }
  };

  const handleTearPack = () => {
      if (packPhase !== "closed") return;
      setPackPhase("shaking");
      setTimeout(() => {
          if (pack?.isMulti) {
              setPackPhase("summary"); 
          } else {
              setPackPhase("revealing");
              setCurrentCardIdx(0);
          }
      }, 1200);
  };

  const handleNextCard = () => {
      if (packPhase !== "revealing" || pack?.isMulti) return;
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
      
      {/* FIX: CSS Ergänzungen für scharfes Rendering und flüssige Animationen */}
      <style>{`
        @keyframes shake-pack {
          0%, 100% { transform: rotate(0deg) scale(1.1); }
          25% { transform: rotate(-5deg) scale(1.1); }
          50% { transform: rotate(5deg) scale(1.1); }
          75% { transform: rotate(-5deg) scale(1.1); }
        }
        .animate-shake-pack { 
            animation: shake-pack 0.3s ease-in-out infinite; 
            will-change: transform; /* Lag-Fix für GPU */
        }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        @keyframes pop-in {
          0% { transform: scale(0.5) translateY(50px); opacity: 0; }
          60% { transform: scale(1.1) translateY(-10px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }

        /* NEU: Zwingt den Browser Bilder knackig zu rendern */
        .card-render-fix {
            backface-visibility: hidden;
            transform: translateZ(0);
            -webkit-font-smoothing: subpixel-antialiased;
            will-change: transform;
        }
        .card-render-fix img {
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        .pack-open-grid {
            contain: content;
        }
        .pack-open-grid .card {
            content-visibility: auto;
        }
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

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                    <button 
                        onClick={openPack}
                        disabled={buyingPack || credits < PACK_PRICE}
                        className="relative group overflow-hidden bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-violet-900/20 transition-all active:scale-95 flex items-center gap-3"
                    >
                        <span className="relative z-10 flex items-center gap-3">
                            {buyingPack ? "Lade..." : "1x Pack"} <span className="flex items-center gap-1 bg-black/30 px-3 py-1 rounded-lg text-yellow-400">{PACK_PRICE} <CoinIcon size="w-4 h-4"/></span>
                        </span>
                    </button>

                    <button 
                        onClick={openTenPacks}
                        disabled={buyingPack || credits < (PACK_PRICE * 10)}
                        className="relative group overflow-hidden bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-white/5 disabled:text-white/30 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-fuchsia-900/20 transition-all active:scale-95 flex items-center gap-3"
                    >
                        <span className="relative z-10 flex items-center gap-3">
                            {buyingPack ? "Lade..." : "10x Packs"} <span className="flex items-center gap-1 bg-black/30 px-3 py-1 rounded-lg text-yellow-400">{(PACK_PRICE * 10).toLocaleString()} <CoinIcon size="w-4 h-4"/></span>
                        </span>
                        {!buyingPack && credits >= (PACK_PRICE * 10) && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        )}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {lastCards.length > 0 && (
          <div className="bg-[#18181b] rounded-3xl p-6 border border-white/10 shadow-lg overflow-hidden">
              <h3 className="font-bold text-white/50 uppercase tracking-wider text-sm mb-4">Zuletzt geöffnet</h3>
              <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                  {lastCards.map((c, i) => (
                    <div key={i} className="opacity-70 hover:opacity-100 transition-opacity w-[150px] h-[240px] flex justify-center rounded-xl card-render-fix">
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
          <div
            className="fixed inset-0 pointer-events-none opacity-25"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 40%, rgba(234,179,8,0.12), transparent 70%)",
            }}
            aria-hidden
          />

          <div className="min-h-screen flex flex-col items-center justify-start py-12 relative z-10">
            <div className="m-auto flex flex-col items-center w-full max-w-6xl px-4">

                {(packPhase === "closed" || packPhase === "shaking") && (
                    <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-300">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-12 drop-shadow-lg text-center mt-4">
                            Klicke zum Öffnen!
                        </h2>
                        
                        {pack.isMulti ? (
                            <div
                                className={`relative w-64 h-80 md:w-80 md:h-96 cursor-pointer transition-transform hover:scale-105 drop-shadow-[0_0_40px_rgba(217,70,239,0.4)] ${packPhase === "shaking" ? "animate-shake-pack" : ""}`}
                                onClick={handleTearPack}
                            >
                                <div
                                    className="absolute inset-0 rounded-2xl"
                                    style={{
                                        background: `repeating-linear-gradient(
                                            125deg,
                                            transparent,
                                            transparent 2px,
                                            rgba(255,255,255,0.04) 2px,
                                            rgba(255,255,255,0.04) 4px
                                        )`,
                                        boxShadow: `
                                            0 0 0 1px rgba(255,255,255,0.08),
                                            4px 6px 0 -1px rgba(0,0,0,0.5),
                                            8px 12px 0 -2px rgba(0,0,0,0.35),
                                            12px 18px 0 -3px rgba(0,0,0,0.25)`,
                                    }}
                                />
                                <img
                                    src={PACK_ART_URL}
                                    alt="10 Packs"
                                    className="relative z-10 w-full h-full object-contain drop-shadow-xl"
                                />
                                <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-fuchsia-600/90 px-4 py-1 text-sm font-black text-white shadow-lg">
                                    10×
                                </div>
                            </div>
                        ) : (
                            <img 
                                src={PACK_ART_URL} 
                                alt="Pack" 
                                onClick={handleTearPack}
                                className={`w-64 md:w-80 cursor-pointer transition-transform hover:scale-110 drop-shadow-[0_0_30px_rgba(139,92,246,0.6)] ${packPhase === 'shaking' ? 'animate-shake-pack' : ''}`}
                            />
                        )}
                    </div>
                )}

                {packPhase === "revealing" && !pack.isMulti && (
                    <div 
                        className="fixed inset-0 z-20 flex flex-col items-center justify-center cursor-pointer" 
                        onClick={handleNextCard}
                    >
                        {(() => {
                            const currentCard = pack.cards[currentCardIdx];
                            const glowClass = RARITY_GLOW[currentCard.rarity] || "shadow-white/10";
                            const textColor = RARITY_TEXT[currentCard.rarity] || "text-white";
                            // Überprüfung, ob Karte NEU ist
                            const isNewCard = !prePullOwned[currentCard.id]; 

                            return (
                                <div key={currentCardIdx} className="flex flex-col items-center animate-pop-in mt-6">
                                    <div className="mb-10 text-center">
                                        <span className={`text-2xl md:text-4xl uppercase font-black tracking-widest drop-shadow-lg ${textColor}`}>
                                            {RARITY_LABELS[currentCard.rarity]}
                                        </span>
                                    </div>
                                    
                                    <div className={`relative rounded-[16px] shadow-2xl ${glowClass} scale-125 md:scale-150 transition-all w-[240px] mx-auto card-render-fix`}>
                                        <Card card={currentCard} isNew={isNewCard} />
                                        
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
                    <div className="relative z-20 w-full flex flex-col items-center animate-in slide-in-from-bottom-10 fade-in duration-500 h-[90vh]">
                        <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest mb-6 drop-shadow-lg text-center mt-4 shrink-0">
                            {pack.isMulti ? "10 Packs geöffnet!" : "Pack Inhalt"}
                        </h2>
                        
                        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-10">
                            
                            {pack.isMulti ? (
                                <div className="pack-open-grid flex flex-col gap-10 w-full max-w-5xl mx-auto">
                                    {pack.packs.map((pCards, pIdx) => (
                                        <div key={pIdx} className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col items-center shadow-lg">
                                            <h3 className="text-xl font-black text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <Layers size={20} /> Pack {pIdx + 1}
                                            </h3>
                                            <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full">
                                                {pCards.map((c, idx) => {
                                                    const isNewCard = !prePullOwned[c.id];
                                                    const staticGlow = RARITY_GLOW_STATIC[c.rarity] || "shadow-white/10";
                                                    return (
                                                        <div key={idx} className="flex flex-col items-center">
                                                            <div className={`relative rounded-[16px] shadow-xl ${staticGlow} w-[140px] sm:w-[160px] md:w-[180px] mx-auto card-render-fix`}>
                                                                <Card card={c} isNew={isNewCard} />
                                                            </div>
                                                            <div className="text-center mt-3">
                                                                <span className={`text-[10px] md:text-xs uppercase font-black tracking-widest px-2.5 py-1 rounded bg-black/80 border border-white/10 ${RARITY_TEXT[c.rarity] || "text-white"}`}>
                                                                    {RARITY_LABELS[c.rarity]}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="pack-open-grid flex flex-wrap justify-center gap-6 md:gap-8 w-full h-full items-center">
                                    {pack.cards.map((c, idx) => {
                                        const isNewCard = !prePullOwned[c.id];
                                        const g = RARITY_GLOW[c.rarity] || "shadow-white/10";
                                        return (
                                            <div key={idx} className="flex flex-col items-center transition-opacity hover:opacity-95">
                                                <div className={`relative rounded-[16px] shadow-2xl ${g} w-[220px] sm:w-[240px] mx-auto card-render-fix`}>
                                                    <Card card={c} isNew={isNewCard} />
                                                </div>
                                                <div className="text-center mt-4">
                                                    <span className={`text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded bg-black/50 border border-white/10 ${RARITY_TEXT[c.rarity] || "text-white"}`}>
                                                        {RARITY_LABELS[c.rarity]}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mt-6 shrink-0 bg-black/80 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
                            <button onClick={closeOverlay} className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold border border-white/10 transition-colors text-white">
                                Schließen
                            </button>
                            
                            {!pack.isMulti && credits >= PACK_PRICE && (
                                <button onClick={() => { closeOverlay(); openPack(); }} className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:scale-105 transition-transform flex items-center gap-2 group">
                                    <Gift size={18} className="group-hover:rotate-12 transition-transform" />
                                    Noch eins ({PACK_PRICE}<CoinIcon size="w-4 h-4" />)
                                </button>
                            )}

                            {pack.isMulti && credits >= (PACK_PRICE * 10) && (
                                <button onClick={() => { closeOverlay(); openTenPacks(); }} className="px-8 py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black shadow-[0_0_20px_rgba(217,70,239,0.4)] hover:scale-105 transition-transform flex items-center gap-2 group">
                                    <Layers size={18} className="group-hover:-translate-y-1 transition-transform" />
                                    Noch 10x ({(PACK_PRICE * 10).toLocaleString()}<CoinIcon size="w-4 h-4" />)
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