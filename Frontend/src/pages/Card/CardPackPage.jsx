// src/pages/CardPackPage.jsx
import React, { useContext, useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import CoinIcon from "../../components/CoinIcon";
import { 
  Library, 
  Images, 
  Lightbulb, 
  Trophy, 
  MessageSquare, 
  Eye, 
  EyeOff, 
  Gift, 
  Gamepad2 
} from "lucide-react";

const PACK_ART_URL = "/cards/packs/pack.png";
const DISCORD_URL = "https://discord.gg/V38GBSVNeh";

const RARITY_WEIGHTS = { common: 55, uncommon: 22, rare: 15, "very-rare": 8, mythic: 3.5, secret: 0.8, legendary: 0.1 };
const RARITY_LABELS = { common: "Gewöhnlich", uncommon: "Ungewöhnlich", rare: "Selten", "very-rare": "Sehr selten", mythic: "Mythisch", secret: "Geheim", legendary: "Legendär" };
const RARITY_ORDER = ["common", "uncommon", "rare", "very-rare", "mythic", "secret", "legendary"];

function msToCountdown(ms) {
  if (ms <= 0) return "Bereit!";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function CardPackPage() {
  const { user, login } = useContext(TwitchAuthContext);
  
  // --- STATE & LOGIC ---
  const [pack, setPack] = useState(null);
  const [lastPack, setLastPack] = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [stage, setStage] = useState("idle"); 
  const [credits, setCredits] = useState(0);
  const [packPrice, setPackPrice] = useState(500); 
  const [lastDaily, setLastDaily] = useState(0);
  const [dailyCooldown, setDailyCooldown] = useState(0);
  const [isDailyLoading, setIsDailyLoading] = useState(false); 
  const [userDataLoading, setUserDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLastPackGrid, setShowLastPackGrid] = useState(false);
  const [cardAnimating, setCardAnimating] = useState(false);
  const [ownedCounts, setOwnedCounts] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [readyToClaim, setReadyToClaim] = useState(0);

  const animTimeoutRef = useRef(null);

  const rarityChances = useMemo(() => {
    const entries = Object.entries(RARITY_WEIGHTS);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    return RARITY_ORDER.map((key) => {
      const weight = RARITY_WEIGHTS[key];
      const label = RARITY_LABELS[key] || key;
      const percent = total > 0 ? (weight / total) * 100 : 0;
      return { key, label, percent };
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (lastDaily > 0) {
        const diff = (lastDaily + 24 * 60 * 60 * 1000) - Date.now();
        setDailyCooldown(Math.max(0, diff));
      } else {
        setDailyCooldown(0);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [lastDaily]);

  useEffect(() => {
    if (!user) return;
    fetchUserData();
  }, [user]);

  const fetchUserData = async () => {
    try {
      const res = await fetch(`/api/cards/user/${user.id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.credits || 0);
      setLastDaily(data.lastDaily || 0);
      if (data.packPrice) setPackPrice(data.packPrice);
      if (data.lastDaily) {
          const diff = (data.lastDaily + 24 * 60 * 60 * 1000) - Date.now();
          setDailyCooldown(Math.max(0, diff));
      } else {
          setDailyCooldown(0);
      }
      if (Array.isArray(data.owned)) {
        const map = {};
        data.owned.forEach((card) => { map[card.id] = card.count || 0; });
        setOwnedCounts(map);
      }
      setReadyToClaim(data.achievementsReadyToClaim || 0);

      const key = `lastPack_${user.id}`;
      if (data.lastPack && Array.isArray(data.lastPack.cards) && data.lastPack.cards.length > 0) {
        setLastPack(data.lastPack);
      }
    } catch (e) { console.error(e); } finally { setUserDataLoading(false); }
  };

  const claimDaily = async () => {
    setIsDailyLoading(true);
    try {
      const res = await fetch("/api/casino/daily", { method: "POST", credentials: "include" });
      if (res.ok) { await fetchUserData(); setError(""); } 
      else { setError("Konnte Daily Reward nicht abholen."); }
    } catch (e) { setError("Verbindungsfehler."); }
    setIsDailyLoading(false);
  };

  const preloadPackImages = (packData) => {
    if (!packData || !Array.isArray(packData.cards)) return;
    packData.cards.forEach((card) => {
      if (card.artworkUrl) new Image().src = card.artworkUrl;
      if (card.themeUrl) new Image().src = card.themeUrl;
    });
  };

  const openPack = async () => {
    if (!user || credits < packPrice) return;
    setError("");
    setShowLastPackGrid(false);
    setStage("opening");

    try {
      const res = await fetch(`/api/cards/open-pack/${user.id}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Öffnen.");
        setStage("idle");
        if (typeof data.credits === "number") setCredits(data.credits);
        return;
      }

      if (!data || !Array.isArray(data.cards)) {
        setError("Unerwartete Antwort vom Server.");
        setStage("idle");
        return;
      }

      const updatedOwned = { ...ownedCounts };
      const newCardIds = new Set();
      data.cards.forEach((card) => {
        const prevCount = updatedOwned[card.id] || 0;
        if (prevCount === 0) newCardIds.add(card.id);
        updatedOwned[card.id] = prevCount + 1;
      });
      setOwnedCounts(updatedOwned);

      const cardsWithNewFlag = data.cards.map((card) => ({
        ...card,
        isNew: newCardIds.has(card.id),
      }));

      setPack({
        twitchId: data.twitchId,
        openedAt: data.openedAt,
        cards: cardsWithNewFlag,
      });

      preloadPackImages({ cards: cardsWithNewFlag });

      setRevealIndex(0);
      setStage("pack");
      
      if (typeof data.credits === "number") setCredits(data.credits);

      const lastPackPayload = { openedAt: data.openedAt, cards: cardsWithNewFlag };
      setLastPack(lastPackPayload);
      try { localStorage.setItem(`lastPack_${user.id}`, JSON.stringify(lastPackPayload)); } catch (e) {}

    } catch (e) {
      console.error(e);
      setError("Fehler beim Öffnen des Packs.");
      setStage("idle");
    }
  };

  const advanceCard = () => {
    if (!pack || !pack.cards) return;
    setCardAnimating(false);
    setRevealIndex((prev) => {
      if (prev < pack.cards.length - 1) return prev + 1;
      else { setStage("done"); return prev; }
    });
  };

  const handleCardClick = () => {
    if (stage !== "reveal" || !currentCard) return;
    if (cardAnimating) return;
    setCardAnimating(true);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => { advanceCard(); }, 280);
  };

  const closeOverlay = () => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    setPack(null);
    setStage("idle");
    setRevealIndex(0);
    setCardAnimating(false);
  };

  if (!user) return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-4">
        <div className="bg-[#18181b] p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full">
            <h1 className="text-3xl font-black text-white mb-2">Daily Card Pack</h1>
            <p className="text-white/50 mb-6">Bitte melde dich mit deinem Twitch-Account an, um Packs zu öffnen.</p>
            <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-purple-900/20">
                Login mit Twitch
            </button>
        </div>
      </div>
  );

  const hasLastPack = lastPack && lastPack.cards && lastPack.cards.length > 0;
  const currentCard = pack && pack.cards && pack.cards[revealIndex] ? pack.cards[revealIndex] : null;
  const canBuy = credits >= packPrice && stage === "idle";
  const dailyReady = dailyCooldown <= 0;

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      
      {/* 2-Spalten Layout: Links Main Content, Rechts Sidebar Menü */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 w-full space-y-8">
          
          {/* Hero Section */}
          <div className="bg-[#18181b] rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 p-32 bg-violet-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
              <div>
                <h1 className="text-3xl font-black tracking-tight mb-1">Card Packs</h1>
                <p className="text-white/50">Sammle Karten, vervollständige dein Album!</p>
              </div>
              
              {/* Credits Badge */}
              <div className="flex items-center gap-3 bg-black/40 px-5 py-2.5 rounded-2xl border border-white/5">
                <div className="text-right">
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Guthaben</div>
                    <div className="text-xl font-mono font-bold text-yellow-400 leading-none">{credits.toLocaleString()}</div>
                </div>
                <CoinIcon size="w-8 h-8" />
              </div>
            </div>

            {/* Daily Reward Box */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-2xl">🎁</div>
                    <div>
                        <div className="font-bold text-white">Tägliche Belohnung</div>
                        <div className="text-xs text-white/50">{dailyReady ? "Bereit zum Abholen!" : "Komm später wieder"}</div>
                    </div>
                </div>
                {userDataLoading ? (
                    <div className="px-6 py-2 rounded-xl bg-white/5 text-white/30 font-bold text-sm animate-pulse">Lade...</div>
                ) : dailyReady ? (
                    <button 
                        onClick={claimDaily} 
                        disabled={isDailyLoading} 
                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
                    >
                        {isDailyLoading ? "Lade..." : <><CoinIcon className="w-4 h-4"/> +500 Abholen</>}
                    </button>
                ) : (
                    <div className="px-6 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white/50 font-mono text-sm">
                         {msToCountdown(dailyCooldown)}
                    </div>
                )}
            </div>

            {/* Pack Buying Area */}
            <div className="flex flex-col items-center justify-center py-6 gap-6">
              
              {/* Pack Image - Nur visuell, nicht mehr klickbar */}
              <div className="relative group transition-all transform hover:scale-105 duration-500">
                  {/* Image Glow */}
                  <div className={`absolute inset-0 bg-violet-500/30 blur-[60px] rounded-full transition-opacity duration-500 ${canBuy ? "opacity-100" : "opacity-0"}`} />
                  
                  {stage === "opening" ? (
                      <div className="w-64 h-80 flex flex-col items-center justify-center bg-black/20 rounded-2xl border-2 border-white/10 backdrop-blur-sm">
                          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
                          <span className="font-bold text-white/70 animate-pulse">Öffne Pack...</span>
                      </div>
                  ) : (
                      <img src={PACK_ART_URL} alt="Pack" className="relative w-64 md:w-72 drop-shadow-2xl z-10 select-none pointer-events-none" />
                  )}
              </div>

              <div className="text-center">
                  <button 
                    disabled={!canBuy} 
                    onClick={openPack} 
                    className={`px-10 py-4 rounded-2xl font-black text-xl flex items-center gap-3 shadow-xl transition-all ${
                        canBuy 
                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20 hover:scale-105 active:scale-95" 
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
                  >
                      <span>Pack kaufen</span>
                      <span className={`text-sm px-2 py-1 rounded-lg ${canBuy ? "bg-black/20" : "bg-black/30"}`}>{packPrice} <CoinIcon className="w-3 h-3 inline" /></span>
                  </button>
                  
                  {!canBuy && stage === "idle" && (
                      <p className="text-red-400 text-sm mt-3 font-medium animate-pulse">Nicht genug Credits! Spiel im Casino.</p>
                  )}
                  {error && <p className="text-red-400 text-sm mt-3 font-medium bg-red-500/10 px-3 py-1 rounded-lg inline-block">{error}</p>}
              </div>

              {/* Drop Rates Legend */}
              <div className="mt-6 pt-6 border-t border-white/5 w-full">
                <p className="text-[10px] uppercase tracking-widest text-white/30 text-center mb-3 font-bold">Wahrscheinlichkeiten</p>
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/60">
                  {rarityChances.map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${r.key === 'legendary' ? 'bg-yellow-500 shadow-[0_0_5px_gold]' : 'bg-white/20'}`} />
                      <span className={r.key === "legendary" ? "text-yellow-400 font-bold" : ""}>{r.label}</span>
                      <span className="font-mono text-white/30">{r.percent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Last Pack Grid (Collapsible) */}
            {hasLastPack && showLastPackGrid && (
              <div className="mt-8 border-t border-white/10 pt-6 animate-in slide-in-from-top-4">
                <h2 className="text-lg font-bold mb-4 text-white/80">Dein letztes Pack</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {lastPack.cards.map((c, idx) => (
                    <div key={c.id + "-last-" + idx} className="transform hover:scale-105 transition-transform duration-200">
                        <Card card={c} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Feedback Box */}
          {showFeedback && (
            <div className="bg-[#18181b] rounded-2xl p-6 border border-white/10 shadow-lg animate-in fade-in slide-in-from-right">
              <h2 className="text-lg font-bold mb-2 text-white">Feedback geben</h2>
              <p className="text-sm text-white/50 mb-4">Hast du Ideen für neue Karten oder hast einen Bug gefunden?</p>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-colors">
                  <MessageSquare size={18} /> Zum Discord
              </a>
            </div>
          )}
        </div>

        {/* --- SIDEBAR MENU --- */}
        <aside className="w-full lg:w-72 shrink-0 space-y-6">
          
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-2 shadow-lg overflow-hidden">
            <div className="p-4 border-b border-white/5 mb-2">
                <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider">Navigation</h2>
            </div>
            
            <div className="space-y-1 px-2 pb-2">
              <Link to="/Packs/Album" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-all font-medium group">
                  <Library size={20} className="text-white/40 group-hover:text-violet-400 transition-colors"/> Sammlung (Album)
              </Link>
              <Link to="/Packs/Galerien" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-all font-medium group">
                  <Images size={20} className="text-white/40 group-hover:text-pink-400 transition-colors"/> Galerien
              </Link>
              <Link to="/Packs/Vorschläge" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-all font-medium group">
                  <Lightbulb size={20} className="text-white/40 group-hover:text-yellow-400 transition-colors"/> Vorschläge
              </Link>
              
              {/* Achievement Link */}
              <Link to="/Packs/Achievements" className="flex items-center justify-between px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-all font-medium group">
                <div className="flex items-center gap-3">
                    <Trophy size={20} className="text-white/40 group-hover:text-orange-400 transition-colors"/> Achievements
                </div>
                {readyToClaim > 0 && (
                    <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-[0_0_8px_red]">
                        {readyToClaim}
                    </div>
                )}
              </Link>

              {hasLastPack && (
                <button type="button" onClick={() => setShowLastPackGrid((prev) => !prev)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-all font-medium group text-left">
                  {showLastPackGrid ? <EyeOff size={20} className="text-white/40"/> : <Eye size={20} className="text-white/40"/>}
                  {showLastPackGrid ? "Letztes Pack ausblenden" : "Letztes Pack anzeigen"}
                </button>
              )}

              <button type="button" onClick={() => setShowFeedback((prev) => !prev)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-medium ${showFeedback ? "bg-violet-500/10 text-violet-300" : "text-white/80 hover:bg-white/5"}`}>
                  <MessageSquare size={20} className={showFeedback ? "text-violet-400" : "text-white/40"}/> Feedback
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-900/40 to-orange-900/40 border border-yellow-500/20 rounded-2xl p-6 text-center shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-16 bg-yellow-500/10 blur-[50px] rounded-full pointer-events-none group-hover:bg-yellow-500/20 transition-colors" />
                
                <h3 className="font-black text-xl text-white mb-2 relative z-10">Brauchst du Credits?</h3>
                <p className="text-sm text-white/70 mb-4 relative z-10">Versuch dein Glück im Casino!</p>
                <Link to="/Casino" className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-yellow-500/20 transition-all active:scale-95 relative z-10">
                    <Gamepad2 size={18} /> Zum Casino
                </Link>
          </div>

        </aside>
      </div>

      {/* --- PACK OPENING MODAL --- */}
      {pack && stage !== "idle" && stage !== "opening" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-4xl flex flex-col items-center justify-center min-h-[500px] relative">
            
            {/* Close Button */}
            {stage === "done" && (
                <button onClick={closeOverlay} className="absolute top-0 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            )}

            {/* STAGE: SHOW PACK (Closed) */}
            {stage === "pack" && (
              <div className="flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500 cursor-pointer group" onClick={() => setStage("reveal")}>
                <div className="text-center space-y-2">
                     <h2 className="text-3xl font-black text-white uppercase tracking-wider">Pack erhalten!</h2>
                     <p className="text-white/50">Klicken zum Öffnen</p>
                </div>
                <div className="relative transform transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-2">
                    <div className="absolute inset-0 bg-violet-500/40 blur-[60px] rounded-full animate-pulse" />
                    <img src={PACK_ART_URL} alt="Card Pack" className="w-64 md:w-80 h-auto object-contain drop-shadow-2xl relative z-10" />
                </div>
              </div>
            )}

            {/* STAGE: REVEAL SINGLE CARD */}
            {stage === "reveal" && currentCard && (
              <div className="flex flex-col items-center gap-8 w-full cursor-pointer" onClick={handleCardClick}>
                <div className="text-center">
                    <p className="text-sm font-bold text-white/30 uppercase tracking-[0.2em] mb-2">Karte {revealIndex + 1} von {pack.cards.length}</p>
                </div>
                
                {/* Card Container mit Animation */}
                <div className={`transform transition-all duration-300 relative ${cardAnimating ? "translate-x-[-150%] opacity-0 rotate-[-10deg]" : "translate-x-0 opacity-100 rotate-0 scale-125 md:scale-150"}`}>
                  <div className={`absolute inset-0 blur-[60px] opacity-30 rounded-full pointer-events-none transition-colors duration-500 ${currentCard.rarity === 'legendary' ? 'bg-yellow-500' : currentCard.rarity === 'mythic' ? 'bg-red-500' : 'bg-white'}`} />
                  <Card card={currentCard} eager />
                </div>

                <p className="text-sm text-white/50 animate-pulse mt-12">Klicken für nächste Karte</p>
              </div>
            )}

            {/* STAGE: DONE (Summary) */}
            {stage === "done" && (
              <div className="flex flex-col items-center w-full animate-in slide-in-from-bottom-8 duration-500">
                <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-8">Pack Inhalt</h2>
                
                <div className="flex flex-wrap justify-center gap-4 w-full overflow-y-auto max-h-[60vh] p-4">
                  {pack.cards.map((c, idx) => (
                    <div key={idx} className="transform hover:scale-110 transition-transform duration-300 hover:z-20 hover:-translate-y-4">
                        <Card card={c} />
                        {/* HIER WURDE DER GRÜNE BANNER ENTFERNT */}
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 mt-8">
                    <button onClick={closeOverlay} className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold border border-white/10 transition-colors text-white">
                        Schließen
                    </button>
                    {credits >= packPrice && (
                        <button 
                            onClick={() => { closeOverlay(); openPack(); }} 
                            className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
                        >
                            Noch eins ({packPrice}<CoinIcon size="w-4 h-4" />)
                        </button>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}