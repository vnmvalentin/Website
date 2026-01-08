// src/pages/CardAlbumPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Link } from "react-router-dom";
import Card from "../../components/Card";

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
  const [selling, setSelling] = useState(false); // State für Verkauf-Button

  // Filter-States
  const [selectedSectionId, setSelectedSectionId] = useState("all");
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [rarityFilter, setRarityFilter] = useState("all");

  const [readyToClaim, setReadyToClaim] = useState(0); // Anzahl fertiger Achievements

  const fetchAlbum = async () => {
    try {
        const res = await fetch(`/api/cards/user/${user.id}`, { credentials: "include" });
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();

        // Sortieren
        const sorted = [...(data.owned || [])].sort((a, b) => {
          const na = parseInt(a.number || "0", 10);
          const nb = parseInt(b.number || "0", 10);
          return na - nb;
        });

        setAlbum({ ...data, owned: sorted });
        setReadyToClaim(data.achievementsReadyToClaim || 0); // Wert vom Backend speichern
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

  // Funktion zum Verkaufen der Duplikate
  const sellDuplicates = async () => {
      if(!window.confirm("Möchtest du wirklich ALLE doppelten Karten verkaufen? Du behältst jeweils 1 Exemplar und bekommst Credits.")) return;
      
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
              fetchAlbum(); // Refresh
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

  // Prüfen ob Duplikate existieren für Button-Anzeige
  const hasDuplicates = useMemo(() => {
      return album?.owned?.some(c => c.count > 1);
  }, [album]);

  if (!user) return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">Kartensammlung</h1>
        <button onClick={() => login(true)} className="bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg">Login</button>
      </div>
  );

  if (loading) return <div className="text-center text-white mt-8">Sammlung wird geladen…</div>;
  if (error) return <div className="text-center text-red-400 mt-8">{error}</div>;
  if (!album || !album.owned) return <div className="text-center text-white mt-8">Keine Daten.</div>;

  const totalCards = album.owned.length;
  const ownedCount = album.owned.filter((c) => (c.count || 0) > 0).length;

  return (
    <div className="max-w-[1400px] mx-auto mt-8 text-white px-2">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Kartensammlung</h1>
          <p className="text-sm text-gray-300">Du besitzt <span className="font-semibold">{ownedCount} / {totalCards}</span> Karten.</p>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-[#9146FF]" checked={showOwnedOnly} onChange={(e) => setShowOwnedOnly(e.target.checked)} />
              <span>Nur im Besitz</span>
            </label>
            <label className="flex items-center gap-2">
              <span>Seltenheit:</span>
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]">
                <option value="all">Alle Seltenheiten</option>
                {rarityOptions.map((rarity) => (<option key={rarity} value={rarity}>{rarity}</option>))}
              </select>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Link to="/Packs" className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">⬅️ Zurück zum Pack</Link>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
            {displayedCards.length === 0 ? (
              <div className="text-center text-gray-400 py-12">Es passen keine Karten zu den aktuellen Filtern.</div>
            ) : (
              <div className="grid gap-8 justify-center" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
                {displayedCards.map((card) => {
                  const count = Number(card.count || 0);
                  if (count > 0) {
                    return (
                      <div key={card.id} className="relative flex justify-center" style={{ width: 320, height: 460 }}>
                        <Card card={card} />
                        {count > 1 && (
                          <div className="absolute top-2 right-2 z-5 bg-black/80 px-2 py-1 rounded text-xs font-semibold">x{count}</div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={card.id} className="relative flex flex-col items-center justify-center bg-gray-900/60 border border-dashed border-gray-600 rounded-xl text-gray-500" style={{ width: 320, height: 460 }}>
                      <div className="text-sm mb-1">Nicht gesammelt</div>
                      <div className="text-4xl font-bold tracking-widest">{card.number}</div>
                      <div className="text-xs mt-2 opacity-70">{card.name || "Unbekannte Karte"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="w-full md:w-56 space-y-4">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Bereiche</h2>
            <ul className="space-y-1 text-sm">
              {CARD_SECTIONS.map((section) => (
                <li key={section.id}>
                  <button type="button" onClick={() => setSelectedSectionId(section.id)} className={`w-full text-left px-3 py-2 rounded-lg transition ${section.id === selectedSectionId ? "bg-[#9146FF] text-white" : "bg-gray-800/60 hover:bg-gray-700/80 text-gray-200"}`}>
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4 space-y-2">
             <Link to="/Packs/Achievements" className="block w-full text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 flex justify-between items-center">
                <span>🏆 Achievements</span>
                {readyToClaim > 0 && (
                    <span className="bg-red-500 w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px_red]"></span>
                )}
             </Link>
             
             {hasDuplicates && (
                 <button 
                    onClick={sellDuplicates}
                    disabled={selling}
                    className="w-full mt-4 bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-600 text-yellow-200 px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                 >
                    {selling ? "Verkaufe..." : "♻️ Doppelte verkaufen"}
                 </button>
             )}
          </div>
        </aside>
      </div>
    </div>
  );
}