// src/pages/CardPackPage.jsx
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";

const PACK_ART_URL = "/cards/packs/pack.png";
const CREDIT_ICON_URL = "/cards/packs/token.png"; 

// Discord-Link hier eintragen
const DISCORD_URL = "https://discord.gg/V38GBSVNeh";

const RARITY_WEIGHTS = {
  common: 55, uncommon: 22, rare: 15, "very-rare": 8, mythic: 3.5, secret: 0.8, legendary: 0.1,
};

const RARITY_LABELS = {
  common: "Gewöhnlich", uncommon: "Ungewöhnlich", rare: "Selten", "very-rare": "Sehr selten", mythic: "Mythisch", secret: "Geheim", legendary: "Legendär",
};

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

  // --- State ---
  const [pack, setPack] = useState(null);
  const [lastPack, setLastPack] = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [stage, setStage] = useState("idle"); 
  
  const [credits, setCredits] = useState(0);
  const [packPrice, setPackPrice] = useState(500); 
  
  const [lastDaily, setLastDaily] = useState(0);
  const [dailyCooldown, setDailyCooldown] = useState(0);
  const [isDailyLoading, setIsDailyLoading] = useState(false); // Beim Klicken

  // NEU: Initialer Ladezustand
  const [userDataLoading, setUserDataLoading] = useState(true);

  const [error, setError] = useState("");
  const [showLastPackGrid, setShowLastPackGrid] = useState(false);
  const [cardAnimating, setCardAnimating] = useState(false);
  const [ownedCounts, setOwnedCounts] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);

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

  // --- Effekte ---

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

      // SOFORT Cooldown berechnen
      if (data.lastDaily) {
          const diff = (data.lastDaily + 24 * 60 * 60 * 1000) - Date.now();
          setDailyCooldown(Math.max(0, diff));
      } else {
          setDailyCooldown(0);
      }

      if (Array.isArray(data.owned)) {
        const map = {};
        data.owned.forEach((card) => {
          map[card.id] = card.count || 0;
        });
        setOwnedCounts(map);
      }

      // Last Pack
      const key = `lastPack_${user.id}`;
      if (data.lastPack && Array.isArray(data.lastPack.cards) && data.lastPack.cards.length > 0) {
        setLastPack(data.lastPack);
        try { localStorage.setItem(key, JSON.stringify(data.lastPack)); } catch (e) {}
      } else {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.cards)) setLastPack(parsed);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error(e);
    } finally {
        // Ladezustand beenden
        setUserDataLoading(false);
    }
  };

  // --- Actions ---

  const claimDaily = async () => {
    setIsDailyLoading(true);
    try {
      const res = await fetch("/api/casino/daily", { method: "POST", credentials: "include" });
      if (res.ok) {
        await fetchUserData();
        setError("");
      } else {
         setError("Konnte Daily Reward nicht abholen. Vielleicht noch Cooldown?");
      }
    } catch (e) {
      setError("Verbindungsfehler beim Daily Reward.");
    }
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
      try {
        localStorage.setItem(`lastPack_${user.id}`, JSON.stringify(lastPackPayload));
      } catch (e) {}

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
      else {
        setStage("done");
        return prev;
      }
    });
  };

  const handleCardClick = () => {
    if (stage !== "reveal" || !currentCard) return;
    if (cardAnimating) return;
    setCardAnimating(true);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => {
      advanceCard();
    }, 280);
  };

  const closeOverlay = () => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    setPack(null);
    setStage("idle");
    setRevealIndex(0);
    setCardAnimating(false);
  };

  // --- Render ---

  if (!user) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">Daily Card Pack</h1>
        <p className="mb-4">Bitte melde dich mit deinem Twitch-Account an.</p>
        <button onClick={() => login(true)} className="bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg">
          Mit Twitch einloggen
        </button>
      </div>
    );
  }

  const hasLastPack = lastPack && lastPack.cards && lastPack.cards.length > 0;
  const currentCard = pack && pack.cards && pack.cards[revealIndex] ? pack.cards[revealIndex] : null;
  const canBuy = credits >= packPrice && stage === "idle";
  const dailyReady = dailyCooldown <= 0;

  return (
    <div className="max-w-5xl mx-auto mt-8 text-white px-2">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Linke Spalte */}
        <div className="flex-1 space-y-6">
          <div className="bg-gray-900/80 rounded-2xl p-4 md:p-6 shadow-xl relative">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold mb-1">Card Packs</h1>
                <p className="text-sm text-gray-400">
                  Sammle Karten, vervollständige dein Album!
                </p>
              </div>

              {/* Credits Badge */}
              <div className="inline-flex items-center gap-2 bg-black/60 px-4 py-2 rounded-full border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                <span className="text-2xl">🪙</span>
                <span className="text-xl font-bold text-yellow-400 font-mono">
                  {credits.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Daily Reward Section */}
            <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700 flex flex-col items-center justify-center text-center">
                <h3 className="text-sm uppercase tracking-widest text-gray-400 mb-2">Tägliche Belohnung</h3>
                <div className="flex items-center gap-4">
                    <span className="text-2xl">🎁</span>
                    {userDataLoading ? (
                        <div className="bg-gray-700 text-gray-400 font-bold py-2 px-6 rounded-lg animate-pulse cursor-wait">
                            Lade Status...
                        </div>
                    ) : dailyReady ? (
                        <button 
                            onClick={claimDaily}
                            disabled={isDailyLoading}
                            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:shadow-green-500/20 transition-all active:scale-95"
                        >
                            {isDailyLoading ? "Lade..." : "+500 Credits abholen"}
                        </button>
                    ) : (
                        <div className="bg-gray-700/50 px-6 py-2 rounded-lg border border-gray-600">
                             <span className="text-gray-300 font-mono">
                                Komme wieder in {msToCountdown(dailyCooldown)}
                             </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Pack Öffnen Area */}
            <div className="text-center py-4">
              <button
                disabled={!canBuy}
                onClick={openPack}
                className={`relative group px-8 py-4 rounded-xl font-bold text-lg shadow-xl transition-all transform ${
                  canBuy
                    ? "bg-gradient-to-br from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 hover:scale-105 hover:shadow-violet-500/30 text-white"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed grayscale"
                }`}
              >
                {stage === "opening" ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Öffne Pack...
                  </span>
                ) : (
                  <div className="flex flex-col items-center">
                    <span>Pack kaufen</span>
                    <span className={`text-xs mt-1 ${canBuy ? "text-violet-200" : "text-red-400"}`}>
                        Preis: {packPrice} 🪙
                    </span>
                  </div>
                )}
              </button>

              {!canBuy && stage === "idle" && (
                <p className="text-red-400 text-sm mt-3 animate-pulse">
                  Nicht genug Credits! Spiel im Casino oder hol dir den Daily Reward.
                </p>
              )}
              
              {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

              <div className="mt-8 pt-6 border-t border-gray-800 text-xs text-gray-500">
                <p className="uppercase tracking-widest mb-2">Drop Rates</p>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {rarityChances.map((r) => (
                    <span key={r.key}>
                      <span className={r.key === "legendary" ? "text-yellow-500" : ""}>{r.label}</span>: <span className="font-mono">{r.percent.toFixed(1)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Letztes Pack */}
            {hasLastPack && showLastPackGrid && (
              <div className="mt-6 border-t border-gray-700 pt-4 animate-fade-in">
                <h2 className="text-lg font-semibold mb-3 text-center md:text-left text-gray-300">
                  Dein letztes Pack
                </h2>
                <div
                  className="grid gap-4 justify-center"
                  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}
                >
                  {lastPack.cards.map((c, idx) => (
                    <div key={c.id + "-last-" + idx} className="flex justify-center">
                      <Card card={c} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

           {/* Feedback-Panel */}
           {showFeedback && (
            <div className="bg-gray-900/80 rounded-2xl p-4 md:p-6 shadow-xl">
              <h2 className="text-lg font-semibold mb-2">Feedback</h2>
              <p className="text-sm text-gray-300 mb-3">
                Ideen? Bugs? Komm auf Discord:
              </p>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] px-4 py-2 rounded-lg text-sm font-semibold">
                💬 Zum Discord
              </a>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Menü */}
        <aside className="w-full md:w-64 space-y-4">
          <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3 text-gray-200">Menü</h2>
            <div className="space-y-2 text-sm">
              <Link to="/Packs/Album" className="w-full flex items-center px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition">
                📚 Sammlung
              </Link>
              <Link to="/Packs/Galerien" className="w-full flex items-center px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition">
                🖼️ Galerien
              </Link>

              {hasLastPack && (
                <button
                  type="button"
                  onClick={() => setShowLastPackGrid((prev) => !prev)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-left transition"
                >
                  {showLastPackGrid ? "👁️ Letztes Pack ausblenden" : "👁️ Letztes Pack anzeigen"}
                </button>
              )}

              <Link to="/Packs/Vorschläge" className="w-full flex items-center px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition">
                💡 Kartenvorschläge
              </Link>
              <Link to="/Packs/Achievements" className="w-full flex items-center px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition mb-2">
                🏆 Achievements
              </Link>

              <button
                type="button"
                onClick={() => setShowFeedback((prev) => !prev)}
                className={`w-full px-3 py-2 rounded-lg border text-left transition ${
                  showFeedback ? "bg-[#9146FF] border-[#9146FF]" : "bg-gray-800 hover:bg-gray-700 border-gray-700"
                }`}
              >
                💬 Feedback
              </button>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-yellow-900/40 to-orange-900/40 border border-yellow-700/30 rounded-2xl p-4 text-center">
                <h3 className="font-bold text-yellow-500 mb-2">Brauchst du Credits?</h3>
                <p className="text-xs text-gray-300 mb-3">Versuch dein Glück im Casino!</p>
                <Link to="/Casino" className="inline-block bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-lg">
                    🎰 Zum Casino
                </Link>
          </div>
        </aside>
      </div>

      {pack && stage !== "idle" && stage !== "opening" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative flex flex-col justify-center min-h-[450px]">
            
            {stage === "done" && (
              <button onClick={closeOverlay} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">
                ✕
              </button>
            )}

            {stage === "pack" && (
              <div className="flex flex-col items-center gap-6 animate-zoom-in">
                <div className="text-center">
                     <h2 className="text-xl font-bold text-white mb-1">Pack erhalten!</h2>
                     <p className="text-sm text-gray-400">Tippe auf das Pack zum Öffnen</p>
                </div>
                
                <button type="button" onClick={() => setStage("reveal")} className="focus:outline-none group">
                  <img
                    src={PACK_ART_URL}
                    alt="Card Pack"
                    className="w-56 h-auto object-contain drop-shadow-2xl transform transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-2"
                  />
                </button>
              </div>
            )}

            {stage === "reveal" && currentCard && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-gray-400 uppercase tracking-widest">
                  Karte {revealIndex + 1} / {pack.cards.length}
                </p>

                <div
                  className={`transform transition-all duration-300 cursor-pointer hover:scale-105 ${
                    cardAnimating ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"
                  }`}
                  onClick={handleCardClick}
                >
                  <Card card={currentCard} eager />
                </div>
                
                <p className="text-xs text-gray-500 animate-pulse">Klicken für nächste Karte</p>
              </div>
            )}

            {stage === "done" && (
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Pack geöffnet!
                </h2>
                <div className="flex flex-wrap justify-center gap-2 max-h-[60vh] overflow-y-auto p-2">
                  {pack.cards.map((c, idx) => (
                    <div key={idx} className="scale-75 -m-6 md:scale-90 md:-m-2">
                         <Card card={c} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-4">
                    <button onClick={closeOverlay} className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold">
                    Schließen
                    </button>
                    {credits >= packPrice && (
                        <button onClick={() => { closeOverlay(); openPack(); }} className="px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 font-semibold text-white shadow-lg">
                        Noch eins ({packPrice}🪙)
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