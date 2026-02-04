// src/pages/CardSuggestionsPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { 
  Lightbulb, 
  ArrowLeft, 
  Plus, 
  Send, 
  X, 
  ThumbsUp, 
  ThumbsDown, 
  Trash2,
  MessageSquare,
  Sparkles
} from "lucide-react";
import SEO from "../../components/SEO";

const CARD_TYPES = [
  "natur",
  "bestie",
  "drache",
  "dunkelheit",
  "cyber",
  "magie",
  "ozean",
  "himmel",
  "mechanisch",
  "kristall",
  "hölle",
  "wüste",
  "untergrund",
];

const RARITIES = [
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

// Twitch-ID für Admin-Buttons (löschen)
const STREAMER_TWITCH_ID = "160224748"; // ggf. anpassen

export default function CardSuggestionsPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "",
    rarity: "",
    description: "",
  });

  const userIsStreamer = user && String(user.id) === STREAMER_TWITCH_ID;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/card-suggestions", {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Fehler beim Laden der Vorschläge");
        }
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setError("Vorschläge konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sortedSuggestions = [...suggestions].sort(
    (a, b) => (b.votes || 0) - (a.votes || 0)
  );

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      const res = await fetch("/api/card-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          rarity: form.rarity,
          description: form.description,
        }),
      });

      if (!res.ok) {
        throw new Error("Fehler beim Einreichen des Vorschlags");
      }

      const created = await res.json();
      setSuggestions((prev) => [created, ...prev]);
      setForm({ name: "", type: "", rarity: "", description: "" });
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError("Vorschlag konnte nicht eingereicht werden.");
    }
  };

  const handleVote = async (id, delta) => {
    if (!user) return;
    setError("");

    // Doppeltes Klicken auf die gleiche Richtung verhindern (Client-Seite)
    const current = suggestions.find((s) => s.id === id);
    if (current && current._myVote === delta) {
      return; // schon so gevotet → kein weiterer Request
    }

    try {
      const res = await fetch(`/api/card-suggestions/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) {
        throw new Error("Fehler beim Voting");
      }
      const updated = await res.json();

      // Lokales Feld _myVote anhängen, um die Buttons zu stylen
      updated._myVote = delta;

      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === updated.id ? { ...updated, _myVote: delta } : s
        )
      );
    } catch (e) {
      console.error(e);
      setError("Deine Stimme konnte nicht gespeichert werden.");
    }
  };

  const handleDelete = async (id) => {
    if (!userIsStreamer) return;

    if (!window.confirm("Diesen Vorschlag wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/card-suggestions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Fehler beim Löschen");
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
      setError("Vorschlag konnte nicht gelöscht werden.");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl max-w-lg w-full">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 text-violet-400 mb-6">
                <Lightbulb size={32} />
            </div>
            <h1 className="text-3xl font-black mb-4 text-white">Ideen einreichen</h1>
            <p className="text-white/50 mb-8 leading-relaxed">
              Melde dich mit deinem Twitch-Account an, um Vorschläge zu sehen,
              zu voten und eigene Ideen für neue Karten einzureichen.
            </p>
            <button
              onClick={() => login(true)}
              className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-3 rounded-xl font-bold transition-transform hover:scale-105 shadow-lg shadow-violet-900/20"
            >
              Mit Twitch einloggen
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      <SEO title = "Vorschläge Karten"/>
      
      {/* HEADER SECTION */}
      <div className="bg-[#18181b] rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden mb-8">
         <div className="absolute top-0 right-0 p-32 bg-violet-500/5 blur-[100px] rounded-full pointer-events-none" />
         
         <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3 mb-2">
                <Lightbulb className="text-yellow-400 fill-yellow-400/20" size={36} /> Kartenvorschläge
              </h1>
              <p className="text-white/50 max-w-xl">
                Die Community entscheidet! Stimme über Vorschläge ab oder reiche deine eigene Karten-Idee ein, die vielleicht bald im Spiel landet.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/Packs"
                className="inline-flex items-center gap-2 bg-black/40 hover:bg-white/5 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                <ArrowLeft size={16} /> Zurück
              </Link>
            </div>
         </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl flex items-center gap-3 animate-in fade-in">
           <X size={20} /> {error}
        </div>
      )}

      {/* FORMULAR SECTION */}
      <div className="bg-[#18181b] rounded-2xl p-6 border border-white/10 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="text-violet-400" size={20}/> Eigene Idee einreichen
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${showForm ? "bg-white/5 text-white/60 hover:text-white" : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20"}`}
          >
            {showForm ? <><X size={16}/> Schließen</> : <><Plus size={16}/> Neuer Vorschlag</>}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-6 animate-in slide-in-from-top-4"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/40 font-bold ml-1">
                  Name der Karte
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleFormChange("name", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder:text-white/20"
                  placeholder="z.B. Cyber Drache"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-white/40 font-bold ml-1">
                    Typ
                    </label>
                    <select
                    value={form.type}
                    onChange={(e) => handleFormChange("type", e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-all appearance-none cursor-pointer"
                    >
                    <option value="" className="bg-[#18181b]">Bitte auswählen</option>
                    {CARD_TYPES.map((t) => (
                        <option key={t} value={t} className="bg-[#18181b]">
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                    ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-white/40 font-bold ml-1">
                    Seltenheit
                    </label>
                    <select
                    value={form.rarity}
                    onChange={(e) => handleFormChange("rarity", e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-all appearance-none cursor-pointer"
                    >
                    <option value="" className="bg-[#18181b]">Bitte auswählen</option>
                    {RARITIES.map((r) => (
                        <option key={r} value={r} className="bg-[#18181b]">
                        {RARITY_LABELS[r] || r}
                        </option>
                    ))}
                    </select>
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs uppercase tracking-wide text-white/40 font-bold ml-1">
                  Beschreibung & Fähigkeiten
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => handleFormChange("description", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder:text-white/20"
                  placeholder="Was macht diese Karte besonders?"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-lg shadow-violet-900/20 transition-transform active:scale-95 flex items-center gap-2"
              >
                <Send size={16} /> Einreichen
              </button>
            </div>
          </form>
        )}
      </div>

      {/* LISTE */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white/60 px-2 uppercase tracking-wider">
          Aktuelle Vorschläge ({sortedSuggestions.length})
        </h2>
        
        {loading ? (
          <div className="p-8 text-center text-white/40 animate-pulse">
            Vorschläge werden geladen…
          </div>
        ) : sortedSuggestions.length === 0 ? (
          <div className="p-8 text-center bg-[#18181b] rounded-2xl border border-white/10 border-dashed text-white/40">
            Es wurden noch keine Vorschläge eingereicht. Sei der Erste!
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            {sortedSuggestions.map((s) => {
            const myVote = s._myVote || 0;

            return (
                <div
                key={s.id}
                className="bg-[#18181b] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all group shadow-lg flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                                <h3 className="font-bold text-lg text-white group-hover:text-violet-400 transition-colors">
                                {s.name || "Ohne Titel"}
                                </h3>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/60 px-2 py-1 rounded-md">
                                        {s.type || "Kein Typ"}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/60 px-2 py-1 rounded-md">
                                        {RARITY_LABELS[s.rarity] || s.rarity || "Unbekannt"}
                                    </span>
                                </div>
                            </div>
                            
                            {/* Voting Actions */}
                            <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/5">
                                <button
                                    type="button"
                                    disabled={!user}
                                    onClick={() => handleVote(s.id, 1)}
                                    className={`p-2 rounded-lg transition-all ${
                                        myVote === 1
                                        ? "bg-green-500/20 text-green-400"
                                        : "hover:bg-white/10 text-white/40 hover:text-green-400"
                                    }`}
                                >
                                    <ThumbsUp size={16} fill={myVote === 1 ? "currentColor" : "none"} />
                                </button>
                                
                                <span className={`font-mono font-bold text-sm w-8 text-center ${s.votes > 0 ? "text-green-400" : s.votes < 0 ? "text-red-400" : "text-white/60"}`}>
                                    {s.votes || 0}
                                </span>

                                <button
                                    type="button"
                                    disabled={!user}
                                    onClick={() => handleVote(s.id, -1)}
                                    className={`p-2 rounded-lg transition-all ${
                                        myVote === -1
                                        ? "bg-red-500/20 text-red-400"
                                        : "hover:bg-white/10 text-white/40 hover:text-red-400"
                                    }`}
                                >
                                    <ThumbsDown size={16} fill={myVote === -1 ? "currentColor" : "none"} />
                                </button>
                            </div>
                        </div>

                        {s.description && (
                            <div className="bg-black/20 rounded-xl p-3 mb-4 border border-white/5">
                                <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed flex gap-2">
                                    <MessageSquare size={14} className="mt-0.5 text-white/20 shrink-0" />
                                    {s.description}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-2">
                        <div className="text-xs text-white/30 flex items-center gap-1">
                          von <span className="text-white/70 font-bold">
                            {s.authorTwitchLogin || s.authorName || s.authorTwitchId}
                          </span>
                        </div>

                        {userIsStreamer && (
                            <button
                                type="button"
                                onClick={() => handleDelete(s.id)}
                                className="text-xs flex items-center gap-1 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 px-2 py-1.5 rounded-lg transition-colors"
                            >
                                <Trash2 size={12} /> Löschen
                            </button>
                        )}
                    </div>
                </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}