// src/pages/CardGalleryPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import SEO from "../../components/SEO";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";
import { 
    Save, 
    Share2, 
    Link as LinkIcon, 
    Search, 
    Filter, 
    ArrowUpDown, 
    Check, 
    X,
    LayoutGrid,
    ChevronLeft,
    Layers 
} from "lucide-react";

const MAX_GALLERY = 10;

const RARITY_ORDER = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "mythic",
  "secret",
  "legendary",
];

const RARITY_LABELS = {
  common: "Gewöhnlich",
  uncommon: "Ungewöhnlich",
  rare: "Selten",
  "very-rare": "Sehr selten",
  mythic: "Mythisch",
  secret: "Geheim",
  legendary: "Legendär",
};

function rarityRank(r) {
  const i = RARITY_ORDER.indexOf(String(r || ""));
  return i === -1 ? 0 : i;
}

function guessLoginName(data, user) {
  return (
    data?.twitchLogin ||
    user?.login ||
    user?.username ||
    user?.display_name ||
    user?.displayName ||
    user?.name ||
    ""
  );
}

export default function CardGalleryPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [loading, setLoading] = useState(true);
  const [busySave, setBusySave] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);

  const [error, setError] = useState("");
  const [album, setAlbum] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [published, setPublished] = useState(false);

  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState(""); 
  const [sortMode, setSortMode] = useState("rarity_desc"); 

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/user/${user.id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Fehler beim Laden deiner Karten");

        const data = await res.json();
        setAlbum(data);

        setSelectedIds(Array.isArray(data.gallery) ? data.gallery.map(String) : []);
        setPublished(!!data.galleryPublished); 
      } catch (e) {
        console.error(e);
        setError("Galerie konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const ownedCards = useMemo(() => {
    const list = Array.isArray(album?.owned) ? album.owned : [];
    let out = list.filter((c) => Number(c.count || 0) > 0);

    if (rarityFilter) {
      out = out.filter((c) => String(c.rarity || "") === rarityFilter);
    }

    const q = String(search || "").trim().toLowerCase();
    if (q) {
      out = out.filter((c) => {
        const name = String(c.name || "").toLowerCase();
        const type = String(c.type || "").toLowerCase();
        const rarity = String(c.rarity || "").toLowerCase();
        return name.includes(q) || type.includes(q) || rarity.includes(q);
      });
    }

    out = out.slice().sort((a, b) => {
      if (sortMode === "rarity_desc") {
        const ra = rarityRank(a.rarity);
        const rb = rarityRank(b.rarity);
        if (rb !== ra) return rb - ra;
      } else if (sortMode === "rarity_asc") {
        const ra = rarityRank(a.rarity);
        const rb = rarityRank(b.rarity);
        if (ra !== rb) return ra - rb;
      } else if (sortMode === "count_desc") {
        const ca = Number(a.count || 0);
        const cb = Number(b.count || 0);
        if (cb !== ca) return cb - ca;
      } else if (sortMode === "name_asc") {
        const na = String(a.name || "");
        const nb = String(b.name || "");
        const cmp = na.localeCompare(nb, "de");
        if (cmp !== 0) return cmp;
      }
      const na = parseInt(a.number || "0", 10);
      const nb = parseInt(b.number || "0", 10);
      return na - nb;
    });

    return out;
  }, [album, rarityFilter, search, sortMode]);

  const byId = useMemo(() => {
    const m = new Map();
    ownedCards.forEach((c) => m.set(String(c.id), c));
    return m;
  }, [ownedCards]);

  const selectedCards = useMemo(() => {
    return (selectedIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  }, [selectedIds, byId]);

  const loginName = useMemo(() => guessLoginName(album, user), [album, user]);

  const publicUrl = useMemo(() => {
    if (!loginName) return "";
    return `${window.location.origin}/Packs/Galerie/${encodeURIComponent(String(loginName).toLowerCase())}`;
  }, [loginName]);

  const toggleCard = (id) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      const has = prev.includes(sid);
      if (has) return prev.filter((x) => x !== sid);
      if (prev.length >= MAX_GALLERY) return prev; 
      return [...prev, sid];
    });
  };

  const doSave = async () => {
    if (!user) return;
    setError("");
    setBusySave(true);
    try {
      const res = await fetch(`/api/cards/user/${user.id}/gallery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gallery: selectedIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      if (Array.isArray(data?.gallery)) setSelectedIds(data.gallery.map(String));
    } catch (e) {
      console.error(e);
      setError(e.message || "Speichern fehlgeschlagen");
    } finally {
      setBusySave(false);
    }
  };

  const doPublishToggle = async () => {
    if (!user) return;
    const next = !published;
    setError("");
    setBusyPublish(true);
    try {
      const res = await fetch(`/api/cards/user/${user.id}/gallery/publish`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ published: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Publish fehlgeschlagen");
      setPublished(data?.galleryPublished ?? next);
    } catch (e) {
      console.error(e);
      setError(e.message || "Publish fehlgeschlagen");
    } finally {
      setBusyPublish(false);
    }
  };

  const doCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {}
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-3xl font-black mb-4">Galerie Editor</h1>
            <p className="text-white/50 mb-6">Login erforderlich.</p>
            <button onClick={() => login(true)} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105">Login</button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-center text-white mt-12 animate-pulse">Lade Galerie...</div>;

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      <SEO title = "Galerie"/>
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <LayoutGrid className="text-violet-500" size={32} /> Galerie Editor
          </h1>
          <p className="text-white/50 mt-1">
            Wähle bis zu <span className="font-bold text-white">{MAX_GALLERY}</span> Karten für dein Schaufenster.
          </p>
        </div>
        
        <Link
            to="/Packs/Galerien/"
            className="inline-flex items-center gap-2 bg-[#18181b] hover:bg-white/5 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
            <ChevronLeft size={16} /> Zurück zur Übersicht
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl flex items-center gap-3">
            <X size={20} /> {error}
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col xl:flex-row gap-8 items-start">
        
        {/* LEFT COLUMN: EDITOR & SELECTED */}
        <div className="w-full xl:w-[420px] shrink-0 space-y-6 xl:sticky xl:top-6">
            
            {/* Status & Actions Box */}
            <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <div className="text-sm font-bold text-white/60 uppercase tracking-wider">Status</div>
                    <div className={`px-3 py-1 rounded-full text-xs font-black uppercase ${published ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"}`}>
                        {published ? "Öffentlich" : "Privat"}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                        onClick={doSave}
                        disabled={busySave}
                        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Save size={18} /> {busySave ? "..." : "Speichern"}
                    </button>
                    <button
                        onClick={doPublishToggle}
                        disabled={busyPublish}
                        className={`font-bold py-3 px-4 rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-2 ${published ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300" : "bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-300"}`}
                    >
                        <Share2 size={18} /> {published ? "Privat" : "Public"}
                    </button>
                </div>

                {published && publicUrl && (
                    <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex items-center gap-2">
                        <div className="text-xs text-white/40 truncate flex-1 font-mono px-1">{publicUrl}</div>
                        <button onClick={doCopy} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors">
                            {copied ? <Check size={16} className="text-green-400" /> : <LinkIcon size={16} />}
                        </button>
                    </div>
                )}
                
                <div className="mt-6 pt-6 border-t border-white/5">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-white/40 uppercase">Slots belegt</span>
                        <span className={`text-xl font-mono font-black ${selectedIds.length >= MAX_GALLERY ? "text-red-400" : "text-white"}`}>
                            {selectedIds.length} <span className="text-sm text-white/30">/ {MAX_GALLERY}</span>
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(selectedIds.length / MAX_GALLERY) * 100}%` }} />
                    </div>
                </div>
            </div>

            {/* Selected Cards Preview */}
            <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl min-h-[200px]">
                <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Vorschau</h3>
                
                {selectedCards.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-xl text-white/20 text-sm">
                        Noch keine Karten ausgewählt.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 justify-items-center">
                        {selectedCards.map((card) => (
                            <div key={card.id} className="relative group" style={{ width: 160, height: 230 }}>
                                <div className="origin-top-left transform scale-50">
                                    <Card card={card} />
                                </div>
                                <button 
                                    onClick={() => toggleCard(card.id)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                    title="Entfernen"
                                >
                                    <X size={14} strokeWidth={3} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: COLLECTION PICKER */}
        <div className="flex-1 w-full bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 sticky top-0 bg-[#18181b] z-20 pb-4 border-b border-white/5">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Layers className="text-violet-500" /> Aus Sammlung wählen
                </h2>
                
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 md:w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Suche..."
                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                        />
                    </div>
                    {/* Rarity */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                        <select
                            value={rarityFilter}
                            onChange={(e) => setRarityFilter(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs font-bold focus:border-violet-500 outline-none appearance-none cursor-pointer text-white"
                        >
                            <option value="" className="bg-[#18181b] text-white">Alle Seltenheiten</option>
                            {RARITY_ORDER.slice().reverse().map((r) => (
                                <option key={r} value={r} className="bg-[#18181b] text-white">{RARITY_LABELS[r] || r}</option>
                            ))}
                        </select>
                    </div>
                    {/* Sort */}
                    <div className="relative">
                        <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs font-bold focus:border-violet-500 outline-none appearance-none cursor-pointer text-white"
                        >
                            <option value="rarity_desc" className="bg-[#18181b] text-white">Seltenheit ↓</option>
                            <option value="rarity_asc" className="bg-[#18181b] text-white">Seltenheit ↑</option>
                            <option value="count_desc" className="bg-[#18181b] text-white">Anzahl ↓</option>
                            <option value="name_asc" className="bg-[#18181b] text-white">Name A-Z</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* CARD GRID */}
            {ownedCards.length === 0 ? (
                <div className="text-center py-20 text-white/30 italic">Keine Karten gefunden.</div>
            ) : (
                <div 
                    className="grid gap-8 justify-items-center pb-8"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
                >
                    {ownedCards.map((card) => {
                        const selected = selectedIds.includes(String(card.id));
                        const count = Number(card.count || 0);

                        return (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => toggleCard(card.id)}
                                className={`group relative transition-all duration-200 outline-none ${selected ? "scale-95 opacity-80" : "hover:scale-[1.02] hover:z-10"}`}
                            >
                                <div className={`relative rounded-[16px] overflow-hidden shadow-2xl ${selected ? "ring-4 ring-violet-500 ring-offset-4 ring-offset-[#18181b]" : ""}`}>
                                    <Card card={card} />
                                    
                                    {/* Selection Overlay */}
                                    <div className={`absolute inset-0 bg-violet-500/20 backdrop-blur-[1px] flex items-center justify-center transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                        <div className={`px-4 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 ${selected ? "bg-violet-600 text-white" : "bg-black/80 text-white"}`}>
                                            {selected ? <><Check size={16}/> Ausgewählt</> : "+ Hinzufügen"}
                                        </div>
                                    </div>
                                </div>

                                {count > 1 && (
                                    <div className="absolute top-4 right-4 z-20 bg-black/90 text-white text-xs font-black px-2 py-1 rounded border border-white/10 shadow-lg">
                                        x{count}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>

      </div>
    </div>
  );
}