// src/pages/CardAlbumPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import Card from "../../components/Card";
import { Search, Filter, Trash2, ChevronLeft, Layers, Trophy, Gift, LayoutGrid, AlertCircle } from "lucide-react";

// --- ORIGINAL KONSTANTEN ---
const CARD_SECTIONS = [
  { id: "all", label: "Alle" },
  { id: "1-50", label: "1–50 Natur", min: 1, max: 50 },
  { id: "51-100", label: "51–100 Bestie", min: 51, max: 100 },
  { id: "101-150", label: "101–150 Drache", min: 101, max: 150 },
  { id: "151-200", label: "151–200 Dunkelheit", min: 151, max: 200 },
  { id: "201-250", label: "201–250 Cyber", min: 201, max: 250 },
  { id: "251-300", label: "251–300 Magie", min: 251, max: 300 },
  { id: "301-350", label: "301–350 Ozean", min: 301, max: 350 },
  { id: "351-400", label: "351–400 Himmel", min: 351, max: 400 },
  { id: "401-450", label: "401–450 Mechanisch", min: 401, max: 450 },
  { id: "451-500", label: "451–500 Kristall", min: 451, max: 500 },
  { id: "501-550", label: "501–550 Hölle", min: 501, max: 550 },
  { id: "551-600", label: "551–600 Wüste", min: 551, max: 600 },
  { id: "601-650", label: "601–650 Untergrund", min: 601, max: 650 },
];

export default function CardAlbumPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [loading, setLoading] = useState(true);
  const [album, setAlbum] = useState(null);
  const [error, setError] = useState("");
  const [selling, setSelling] = useState(false);

  // Filter-States
  const [selectedSectionId, setSelectedSectionId] = useState("all");
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [rarityFilter, setRarityFilter] = useState("all");

  const [readyToClaim, setReadyToClaim] = useState(0);

  // --- ORIGINAL LOGIC ---
  const fetchAlbum = async () => {
    try {
        const res = await fetch(`/api/cards/user/${user.id}`, { credentials: "include" });
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();

        // Sortieren nach Nummer
        const sorted = [...(data.owned || [])].sort((a, b) => {
          const na = parseInt(a.number || "0", 10);
          const nb = parseInt(b.number || "0", 10);
          return na - nb;
        });

        setAlbum({ ...data, owned: sorted });
        setReadyToClaim(data.achievementsReadyToClaim || 0);
      } catch (e) {
        console.error(e);
        setError("Sammlung konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    if (user) fetchAlbum();
    else setLoading(false);
  }, [user]);

  const sellDuplicates = async () => {
      if(!window.confirm("Möchtest du wirklich ALLE doppelten Karten verkaufen? Du behältst jeweils 1 Exemplar.")) return;
      
      setSelling(true);
      try {
          const res = await fetch(`/api/cards/sell-duplicates/${user.id}`, {
              method: "POST", 
              credentials: "include"
          });
          const json = await res.json();
          if(!res.ok) {
              alert(json.error || "Fehler beim Verkaufen.");
          } else {
              alert(`Erfolg! ${json.soldCount} Karten verkauft für ${json.creditsEarned} Credits.`);
              fetchAlbum();
          }
      } catch(e) {
          alert("Netzwerkfehler");
      } finally {
          setSelling(false);
      }
  };

  const rarityOptions = useMemo(() => {
    if (!album || !album.owned) return [];
    const set = new Set();
    album.owned.forEach((card) => {
      const r = card.rarity || card.rarityName;
      if (r) set.add(r);
    });
    return Array.from(set);
  }, [album]);

  const displayedCards = useMemo(() => {
    if (!album || !album.owned) return [];
    let cards = album.owned;
    if (selectedSectionId !== "all") {
      const section = CARD_SECTIONS.find((s) => s.id === selectedSectionId);
      if (section) {
        cards = cards.filter((card) => {
          const num = parseInt(card.number || "0", 10);
          return num >= section.min && num <= section.max;
        });
      }
    }
    if (showOwnedOnly) cards = cards.filter((c) => Number(c.count || 0) > 0);
    if (rarityFilter !== "all") {
      cards = cards.filter((c) => (c.rarity || c.rarityName) === rarityFilter);
    }
    return cards;
  }, [album, selectedSectionId, showOwnedOnly, rarityFilter]);

  const hasDuplicates = useMemo(() => {
      return album?.owned?.some(c => c.count > 1);
  }, [album]);

  if (!user) return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-3xl font-black mb-4">Kartensammlung</h1>
            <button onClick={() => login(true)} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105">Login</button>
        </div>
      </div>
  );

  const totalCards = album?.owned?.length || 0;
  const ownedCount = album?.owned?.filter((c) => (c.count || 0) > 0).length || 0;

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      <SEO title = "Album"/>
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Layers className="text-violet-500" size={32} /> Album
          </h1>
          <p className="text-white/50 mt-1">Du besitzt <span className="text-white font-bold">{ownedCount}</span> Karten.</p>
        </div>
        
        {/* TOP FILTER BAR */}
        <div className="flex flex-wrap gap-4 items-center bg-[#18181b] p-2 rounded-xl border border-white/10">
            <label className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-white/5 rounded-lg transition-colors">
                <input type="checkbox" className="accent-violet-500 w-4 h-4 cursor-pointer" checked={showOwnedOnly} onChange={(e) => setShowOwnedOnly(e.target.checked)} />
                <span className="text-sm font-medium text-white/80">Nur im Besitz</span>
            </label>
            
            <div className="h-6 w-px bg-white/10 mx-1"></div>

            <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm font-bold focus:border-violet-500 outline-none appearance-none cursor-pointer text-white hover:bg-white/5 transition-colors">
                    <option value="all" className="bg-[#18181b] text-white">Alle Seltenheiten</option>
                    {rarityOptions.map((rarity) => (
                      <option key={rarity} value={rarity} className="bg-[#18181b] text-white">
                        {rarity}
                      </option>
                    ))}
                </select>
            </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* MAIN GRID */}
        <div className="flex-1 w-full order-2 lg:order-1">
          {loading ? <div className="text-center py-20 text-white/30 animate-pulse">Lade Album...</div> :
           error ? <div className="text-center py-20 text-red-400">{error}</div> :
           displayedCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/30 border-2 border-dashed border-white/5 rounded-2xl bg-[#18181b]/50">
                  <AlertCircle size={48} className="mb-4 opacity-50"/>
                  <p>Keine Karten gefunden.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 justify-items-center">
                {displayedCards.map((card) => {
                  const count = Number(card.count || 0);
                  if (count > 0) {
                    // OWNED CARD
                    return (
                      <div key={card.id} className="relative group transition-all duration-300 hover:z-10 hover:scale-[1.02]">
                        <div className="relative shadow-2xl rounded-[16px]"> 
                            <Card card={card} />
                        </div>
                        
                        {count > 1 && (
                          <div className="absolute -top-2 -right-2 bg-violet-600 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg border-2 border-[#18181b] z-20">
                              x{count}
                          </div>
                        )}
                      </div>
                    );
                  }
                  // MISSING CARD (Placeholder)
                  return (
                    <div key={card.id} className="w-[300px] aspect-[320/460] bg-[#121212] border-2 border-dashed border-white/10 rounded-[16px] flex flex-col items-center justify-center text-white/20 p-6 select-none relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />
                      <span className="text-4xl font-black mb-2 opacity-30 tracking-widest">{card.number}</span>
                      <span className="text-xs uppercase tracking-wider text-center px-4 font-bold opacity-50">{card.name || "Unbekannt"}</span>
                      <div className="mt-6 p-4 rounded-full bg-white/5"><LayoutGrid size={24} /></div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>

        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-72 shrink-0 space-y-4 sticky top-6 order-1 lg:order-2">
          {/* Kategorie Auswahl */}
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-2 shadow-xl max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-white/5 mb-2 sticky top-0 bg-[#18181b] z-10">
                <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider">Kategorien</h2>
            </div>
            <div className="space-y-1 px-2 pb-2">
              {CARD_SECTIONS.map((section) => (
                <button 
                    key={section.id} 
                    onClick={() => setSelectedSectionId(section.id)} 
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex justify-between items-center ${section.id === selectedSectionId ? "bg-violet-600 text-white shadow-lg shadow-violet-900/20" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                >
                    <span>{section.label}</span>
                    {section.id === selectedSectionId && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                </button>
              ))}
            </div>
          </div>

          {/* Action Box */}
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-4 shadow-xl space-y-2">
             <Link to="/Packs" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-medium">
                <ChevronLeft size={18} /> Zurück zur Übersicht
             </Link>
             <Link to="/Packs/Achievements" className="flex items-center justify-between px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-medium group">
                <span className="flex items-center gap-3"><Trophy size={18} className="group-hover:text-yellow-400 transition-colors"/> Achievements</span>
                {readyToClaim > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-[0_0_8px_red]">{readyToClaim}</span>
                )}
             </Link>
             
             {hasDuplicates && (
                 <button 
                    onClick={sellDuplicates}
                    disabled={selling}
                    className="w-full mt-4 bg-yellow-600/10 hover:bg-yellow-600/20 border border-yellow-600/30 text-yellow-200 px-3 py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-yellow-900/10"
                 >
                    <Trash2 size={16} /> {selling ? "Verkaufe..." : "Doppelte verkaufen"}
                 </button>
             )}
          </div>
        </aside>

      </div>
    </div>
  );
}