import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import SEO from "../../components/SEO";
import { Search, Image, ExternalLink, Loader2, AlertCircle, ChevronLeft, Edit3, LogIn } from "lucide-react";

export default function CardGalleriesIndexPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [galleries, setGalleries] = useState([]);
  const [q, setQ] = useState("");

  // --- ORIGINAL LOGIC ---
  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/cards/galleries", {
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Fehler beim Laden der Galerien");
        }

        setGalleries(Array.isArray(data?.galleries) ? data.galleries : []);
      } catch (e) {
        console.error(e);
        setError(e.message || "Galerien konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return galleries;

    return (galleries || []).filter((g) =>
      String(g.twitchLogin || "").toLowerCase().includes(s)
    );
  }, [galleries, q]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 text-white min-h-screen">
      <SEO title = "Galerien"/>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 mb-2">
             <Image className="text-pink-500" size={32} /> Community Galerien
          </h1>
          <p className="text-white/50 text-sm">
            Entdecke die Schaukästen anderer Sammler.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/Packs"
            className="inline-flex items-center gap-2 bg-[#18181b] hover:bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <ChevronLeft size={16} /> Zurück
          </Link>

          {user ? (
            <Link
              to="/Packs/Galerie"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-900/20 transition-all active:scale-95"
            >
              <Edit3 size={16} /> Eigene Galerie
            </Link>
          ) : (
            <button
              onClick={() => login(true)}
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-900/20 transition-all active:scale-95"
            >
              <LogIn size={16} /> Login
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle size={20} /> {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-[#18181b] border border-white/10 rounded-2xl p-4 mb-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Veröffentlichte Galerien</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {loading ? "Lade Datenbank..." : `${filtered.length} Ergebnisse gefunden`}
            </p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nach Twitch-Name suchen..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Gallery List */}
      <div className="space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
             <Loader2 size={40} className="animate-spin mb-4" />
             <p>Lade Galerien...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl text-white/30">
            Keine Galerien gefunden.
          </div>
        ) : (
          <div className="grid gap-6">
            {filtered.map((g) => {
              const loginName = String(g.twitchLogin || "");
              const preview = Array.isArray(g.previewCards) ? g.previewCards : [];
              const cardsCount = Number(g.cardsCount || preview.length || 0);

              return (
                <div
                  key={loginName}
                  className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl transition-all hover:border-white/20"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                            {loginName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="text-xl font-bold text-white leading-none">{loginName}</div>
                            <div className="text-xs text-white/40 mt-1">
                                <span className="text-white font-mono font-bold">{cardsCount}</span> Karten ausgestellt
                            </div>
                        </div>
                    </div>

                    <Link
                      to={`/Packs/Galerie/${encodeURIComponent(loginName.toLowerCase())}`}
                      className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                    >
                      Ansehen <ExternalLink size={14} />
                    </Link>
                  </div>

                  {/* Preview Cards Grid - Angepasst für große Karten */}
                  {preview.length > 0 ? (
                    <div
                      className="grid gap-6 justify-items-center"
                      style={{
                        // Sicherstellen, dass Karten (320px) genug Platz haben
                        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                      }}
                    >
                      {preview.map((card) => (
                        <div key={card.id} className="transform hover:scale-[1.02] transition-transform duration-300">
                          <Card card={card} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-white/30 italic bg-black/20 rounded-xl border border-white/5">
                      Keine Vorschau verfügbar.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}