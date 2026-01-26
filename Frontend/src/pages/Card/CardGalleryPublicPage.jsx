// src/pages/CardGalleryPublicPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../components/Card";
import { ChevronLeft, LayoutGrid, User, AlertCircle, Loader2 } from "lucide-react";

export default function CardGalleryPublicPage() {
  const { twitchLogin } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cards, setCards] = useState([]);
  const [owner, setOwner] = useState("");
  const [profilePic, setProfilePic] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/gallery/${encodeURIComponent(twitchLogin)}`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Galerie nicht gefunden");
        }

        setOwner(data?.twitchLogin || twitchLogin);
        // Priorität: Direktes Feld -> Feld im User Objekt -> Leer
        setProfilePic(data?.profileImageUrl || data?.user?.profileImageUrl || "");
        setCards(Array.isArray(data?.cards) ? data.cards : []);
      } catch (e) {
        console.error(e);
        setError(e.message || "Galerie konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [twitchLogin]);

  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-white/50">
            <Loader2 size={40} className="animate-spin mb-4 text-violet-500" />
            <p>Lade Galerie...</p>
        </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-[#18181b] border border-red-500/20 rounded-3xl text-center shadow-2xl">
        <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Fehler</h2>
        <p className="text-red-300 mb-6">{error}</p>
        <Link
          to="/Packs/Galerien/"
          className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-colors"
        >
          <ChevronLeft size={18} /> Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-8 text-white min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-4 mb-2">
             {/* PROFILE PICTURE */}
             {profilePic ? (
                <img 
                    src={profilePic} 
                    alt={owner} 
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-violet-500 shadow-lg shadow-violet-500/20 object-cover"
                />
             ) : (
                <div className="p-2.5 bg-violet-500/10 rounded-full border border-violet-500/20 text-violet-500">
                    <User size={32} />
                </div>
             )}
             
             <span>Galerie von <span className="text-violet-400">{owner}</span></span>
          </h1>
          <p className="text-white/50 flex items-center gap-2 ml-1">
             <LayoutGrid size={16} />
             {cards.length > 0 ? `${cards.length} Karten ausgestellt` : "Noch keine Karten ausgestellt."}
          </p>
        </div>
        
        <Link
            to="/Packs/Galerien/"
            className="inline-flex items-center gap-2 bg-[#18181b] hover:bg-white/5 border border-white/10 px-5 py-3 rounded-xl text-sm font-bold transition-colors"
        >
            <ChevronLeft size={18} /> Zurück zur Übersicht
        </Link>
      </div>

      {/* CONTENT */}
      <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl min-h-[400px]">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20 border-2 border-dashed border-white/5 rounded-2xl">
             <LayoutGrid size={64} className="mb-4 opacity-50" />
             <p className="text-lg font-medium">Diese Galerie ist noch leer.</p>
          </div>
        ) : (
          <div 
            className="grid gap-8 justify-items-center"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
          >
            {cards.map((card, idx) => (
              <div key={idx} className="transform hover:scale-[1.02] transition-transform duration-300 hover:z-10 group relative">
                 <div className="relative shadow-2xl rounded-[16px]">
                    <Card card={card} />
                 </div>
                 {/* Shine Effect */}
                 <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 pointer-events-none rounded-[16px] transition-opacity" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}